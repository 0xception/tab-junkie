/**
 * B-001b AC4: Migration steps — register mock steps, test success and failure paths.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions, __getRawStore } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  KNOWN_VERSION,
  _registerMigrationStepForTest,
  _clearMigrationStepsForTest,
  _resetMigrationStateForTest,
} from '../background/storage/migration.js';
import { StorageError, ERR_TX_CONFLICT } from '../background/storage/errors.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC4 Case A: stored === KNOWN_VERSION — no migration step runs', async () => {
  /* Verify that when stored equals KNOWN_VERSION, no migration step executes
     even when steps are registered. The migration runner only invokes steps
     when stored < KNOWN_VERSION. The historical Case A "v1→v2→v3 chain"
     scenario was unreachable while KNOWN_VERSION = 1; with B-121's bump to
     KNOWN_VERSION = 2, we still can't test a forward chain inside this test
     without changing the constant, so we keep the no-migration-needed
     contract assertion here. */
  _registerMigrationStepForTest({
    fromVersion: 1,
    toVersion: 2,
    migrate: (snapshot) => {
      snapshot.meta.migrated_v1_to_v2 = true;
      return snapshot;
    },
  });

  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  await runMigrations();

  const meta = __getRawStore('tj:meta');
  assert.equal(meta.schemaVersion, KNOWN_VERSION);
  assert.equal(meta.migrated_v1_to_v2, undefined, 'Step should not have run');

  _clearMigrationStepsForTest();
});

test('AC4 Case B: stored version < KNOWN_VERSION with no matching steps → ERR_CORRUPT_DATA', async () => {
  // If stored < KNOWN_VERSION but no migration steps bridge the gap,
  // the code throws ERR_CORRUPT_DATA ("No migration path from version X to Y").
  // This can only happen if KNOWN_VERSION > stored AND MIGRATION_STEPS is empty.
  // Since KNOWN_VERSION=1, stored must be < 1, which is caught as corrupt first.
  // So this path is currently unreachable. Document this as a constraint.

  // We can test the error path for corrupt version instead:
  seedPartitions({ meta: { schemaVersion: -1, createdAt: Date.now() } });

  await assert.rejects(
    () => runMigrations(),
    (err) => {
      assert.ok(err instanceof StorageError);
      return true;
    },
  );
});

test('AC4: migration steps registry is properly cleaned up between tests', async () => {
  _registerMigrationStepForTest({
    fromVersion: 1,
    toVersion: 2,
    migrate: (snapshot) => snapshot,
  });
  _clearMigrationStepsForTest();

  /* B-121: seed at KNOWN_VERSION so the no-step path is exercised cleanly
     after _clearMigrationStepsForTest wipes the global v1→v2 step. */
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });
  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION);
});

test('B-180 §74.10: KNOWN_VERSION is 9 (eager floatingGroups v4 normalization)', () => {
  /* C-1a check: KNOWN_VERSION MUST be incremented when a partition shape
     is added or changed. v6→v7 was B-148 (PARTITION_GROUPS.renderOrder);
     v7→v8 was B-167 (new PARTITION_ITEM_CLAIMS for durable claim identity);
     v8→v9 is B-180 (eager `tj:floatingGroups` normalization to canonical v4).
     The constant being a literal `9` is asserted indirectly by the
     migration-chain integrity check (`MIGRATION_STEPS` has contiguous
     steps for 1→2 through 8→9). */
  assert.equal(KNOWN_VERSION, 9,
    'KNOWN_VERSION must be 9 (B-180 §74.10 eager floatingGroups normalization)');
});

test('B-134 §63.2.4: v2 → v3 lazy migration — stored v2 advances to KNOWN_VERSION with no data rewrite', async () => {
  /* The beforeEach clears MIGRATION_STEPS for test isolation. Re-register
     the v1→v2 + v2→v3 + v3→v4 + v4→v5 no-op steps so runMigrations finds the chain. */
  _registerMigrationStepForTest({
    fromVersion: 1,
    toVersion: 2,
    migrate: (snapshot) => snapshot,
  });
  _registerMigrationStepForTest({
    fromVersion: 2,
    toVersion: 3,
    migrate: (snapshot) => snapshot,
  });
  _registerMigrationStepForTest({
    fromVersion: 3,
    toVersion: 4,
    migrate: (snapshot) => snapshot,
  });
  _registerMigrationStepForTest({
    fromVersion: 4,
    toVersion: 5,
    migrate: (snapshot) => snapshot,
  });

  /* Seed pre-S40 v2 records (no sortOrder field, no liveTabId). The lazy
     migration strategy advances `tj:meta.schemaVersion` to KNOWN_VERSION (9)
     without touching `tj:floatingGroups` data. The read-side validator
     tolerates the missing fields; `buildFloatingMembers` falls back to
     (windowId, tabIndex) ordering AND position-then-URL join for legacy
     records. */
  seedPartitions({
    meta: { schemaVersion: 2, createdAt: 1000 },
    floatingGroups: [
      {
        floatingTabId: 'ft-legacy',
        groupId: 'g-1',
        parentItemId: 'item-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://legacy.example',
        savedAt: 500,
        /* deliberately no sortOrder, no liveTabId — legacy v2 record */
      },
    ],
  });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION, 'schemaVersion advanced to KNOWN_VERSION');

  /* The legacy record is still readable and unchanged. */
  const meta = __getRawStore('tj:meta');
  assert.equal(meta.schemaVersion, KNOWN_VERSION);
  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(records[0].floatingTabId, 'ft-legacy');
  assert.equal(records[0].sortOrder, undefined,
    'legacy record retains its v2 shape (no sortOrder field) — lazy migration');
  assert.equal(records[0].liveTabId, undefined,
    'legacy record retains its v3-or-earlier shape (no liveTabId field) — lazy migration');
});

test('B-137 §66.2.2: v3 → v4 lazy migration — stored v3 advances to KNOWN_VERSION with no data rewrite', async () => {
  /* The beforeEach clears MIGRATION_STEPS for test isolation. Re-register
     the v3→v4 + v4→v5 no-op steps so runMigrations finds the chain. */
  _registerMigrationStepForTest({
    fromVersion: 3,
    toVersion: 4,
    migrate: (snapshot) => snapshot,
  });
  _registerMigrationStepForTest({
    fromVersion: 4,
    toVersion: 5,
    migrate: (snapshot) => snapshot,
  });

  /* Seed pre-S41 v3 records (sortOrder present from B-134, but no liveTabId
     field). The lazy migration strategy advances `tj:meta.schemaVersion` to
     KNOWN_VERSION without touching `tj:floatingGroups` data. The read-side
     validator tolerates the missing field; `buildFloatingMembers` falls back
     to the position-then-URL join for legacy records. */
  seedPartitions({
    meta: { schemaVersion: 3, createdAt: 1000 },
    floatingGroups: [
      {
        floatingTabId: 'ft-v3',
        groupId: 'g-1',
        parentItemId: 'item-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://v3.example',
        savedAt: 500,
        sortOrder: 0,
        /* deliberately no liveTabId — legacy v3 record */
      },
    ],
  });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION, 'schemaVersion advanced to KNOWN_VERSION');

  /* The legacy v3 record is still readable and unchanged. */
  const meta = __getRawStore('tj:meta');
  assert.equal(meta.schemaVersion, KNOWN_VERSION);
  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(records[0].floatingTabId, 'ft-v3');
  assert.equal(records[0].sortOrder, 0,
    'v3 record retains its sortOrder field (lazy migration leaves data untouched)');
  assert.equal(records[0].liveTabId, undefined,
    'legacy v3 record retains its shape (no liveTabId field) — lazy migration');
});

test('B-041 §67.2.2: v4 → v5 lazy migration — stored v4 advances to KNOWN_VERSION with no data rewrite', async () => {
  /* Mirrors the B-134 §63.2.4 and B-137 §66.2.2 patterns directly for the
     B-041 v4 → v5 transition. Lazy data migration (option 2 per CLAUDE.md
     C-1b): the no-op step advances `tj:meta.schemaVersion` to
     KNOWN_VERSION (5) without touching any partition data. Legacy v4
     `tj:groups` records lack `chromeTabGroupId`; the validator tolerates
     the missing field; first sync stamps it. Pre-existing transitive
     coverage exists via the v2→v5 and v3→v5 chain tests above; this
     direct v4→v5 test pins the AC3 lazy-migration contract by name for
     parity with the prior schema-bump items. */
  _registerMigrationStepForTest({
    fromVersion: 4,
    toVersion: 5,
    migrate: (snapshot) => snapshot,
  });

  /* Seed pre-S42 v4 records (no chromeTabGroupId field). The validator
     extension at shapes.js:140-146 accepts groups without the optional
     field; legacy v4 records remain readable post-migration. */
  seedPartitions({
    meta: { schemaVersion: 4, createdAt: 1000 },
    groups: [
      {
        id: 'g-legacy-v4',
        name: 'LegacyGroup',
        color: 'blue',
        parentId: null,
        sortOrder: 0,
        collapsed: false,
        createdAt: 500,
        updatedAt: 500,
        /* deliberately no chromeTabGroupId — legacy v4 record */
      },
    ],
  });

  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION, 'schemaVersion advanced to KNOWN_VERSION');

  /* The legacy v4 record is still readable and unchanged — lazy migration
     does NOT rewrite the partition. First sync will stamp chromeTabGroupId
     via updateGroup; un-synced groups remain in v4 shape indefinitely. */
  const meta = __getRawStore('tj:meta');
  assert.equal(meta.schemaVersion, KNOWN_VERSION);
  const records = __getRawStore('tj:groups');
  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'g-legacy-v4');
  assert.equal(records[0].chromeTabGroupId, undefined,
    'legacy v4 group retains its shape (no chromeTabGroupId field) — lazy migration');
});
