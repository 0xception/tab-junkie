/**
 * B-180 §74.10 (S47, B-173 EPIC B2) — eager v8 → v9 migration of
 * `tj:floatingGroups` records to the canonical v4 STABLE-field shape.
 *
 * Unlike every prior migration step (all no-op governance bumps), the v8→v9
 * step is the FIRST EAGER data migration: it rewrites every floatingGroups
 * record so it carries `parentItemId` + `floatingTabId` + `sortOrder`. The
 * EPHEMERAL `liveTabId` is deliberately NOT fabricated — runtime recomputes it.
 *
 * These tests run against the REAL `MIGRATION_STEPS` (the chain is NOT cleared
 * in beforeEach), so the production eager step actually fires. Seeding `tj:meta`
 * at version 8 + legacy-shape records reproduces the realistic upgrade path:
 * a profile carried to v8 by lazy migration whose floatingGroups records still
 * hold pre-v4 shapes.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions, __getRawStore } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  /* NOTE: the real MIGRATION_STEPS are intentionally LEFT INTACT (no
     _clearMigrationStepsForTest) so the production v8→v9 eager step runs. */
});

/** Construct the legacy-shape fixtures the migration must normalize. */
function legacyRecords() {
  return [
    /* v1 itemId-only — no parentItemId, no floatingTabId, no sortOrder, no
       liveTabId. Parent reference lives in the legacy `itemId` field. */
    {
      itemId: 'item-v1',
      groupId: 'g-1',
      windowId: 1,
      tabIndex: 0,
      url: 'https://v1.example',
      savedAt: 500,
    },
    /* v2 missing sortOrder — has parentItemId + floatingTabId, no sortOrder,
       no liveTabId. Same group as the v1 record. */
    {
      floatingTabId: 'ft-v2',
      parentItemId: 'item-v2',
      groupId: 'g-1',
      windowId: 1,
      tabIndex: 1,
      url: 'https://v2.example',
      savedAt: 600,
    },
    /* v3 missing liveTabId — fully shaped EXCEPT the ephemeral liveTabId.
       Different group, with an explicit sortOrder. */
    {
      floatingTabId: 'ft-v3',
      parentItemId: 'item-v3',
      groupId: 'g-2',
      windowId: 2,
      tabIndex: 0,
      url: 'https://v3.example',
      savedAt: 700,
      sortOrder: 3,
    },
    /* v4 canonical — every STABLE field present plus a live liveTabId. Must be
       left completely untouched by the migration. */
    {
      floatingTabId: 'ft-v4',
      parentItemId: 'item-v4',
      groupId: 'g-2',
      windowId: 2,
      tabIndex: 1,
      url: 'https://v4.example',
      savedAt: 800,
      sortOrder: 7,
      liveTabId: 999,
    },
  ];
}

test('B-180: v8 → v9 eager migration normalizes every record to canonical v4 STABLE shape', async () => {
  seedPartitions({
    meta: { schemaVersion: 8, createdAt: 1000 },
    floatingGroups: legacyRecords(),
  });

  await runMigrations();

  // C-1a: schemaVersion advanced to 9 (both the cached status and on-disk meta).
  assert.equal(getSystemStatus().schemaVersion, 9);
  assert.equal(getSystemStatus().knownVersion, KNOWN_VERSION);
  assert.equal(__getRawStore('tj:meta').schemaVersion, 9);

  const records = __getRawStore('tj:floatingGroups');
  // No record dropped — 1:1 with the seeded array.
  assert.equal(records.length, 4, 'no record dropped by the eager migration');

  const byTabIndex = (g, idx) => records.find((r) => r.groupId === g && r.tabIndex === idx);

  // v1 itemId-only → parentItemId derived; floatingTabId minted; sortOrder 0.
  const v1 = byTabIndex('g-1', 0);
  assert.equal(v1.parentItemId, 'item-v1', 'parentItemId derived from legacy itemId');
  assert.equal(v1.itemId, 'item-v1', 'legacy itemId left in place (additive, validator tolerant)');
  assert.equal(typeof v1.floatingTabId, 'string');
  assert.equal(v1.floatingTabId.length, 26, 'floatingTabId minted as a 26-char ULID');
  assert.equal(v1.sortOrder, 0, 'first record in g-1 (no prior sortOrder) → 0');
  assert.equal(v1.liveTabId, undefined, 'liveTabId NOT fabricated — left for runtime');

  // v2 missing sortOrder → sortOrder assigned after v1 (deterministic, array order).
  const v2 = byTabIndex('g-1', 1);
  assert.equal(v2.floatingTabId, 'ft-v2', 'existing floatingTabId untouched');
  assert.equal(v2.parentItemId, 'item-v2', 'existing parentItemId untouched');
  assert.equal(v2.sortOrder, 1, 'second record in g-1 (no prior sortOrder) → 1');
  assert.equal(v2.liveTabId, undefined, 'liveTabId NOT fabricated — left for runtime');

  // v3 missing liveTabId → fully shaped already; nothing added; liveTabId stays absent.
  const v3 = byTabIndex('g-2', 0);
  assert.equal(v3.floatingTabId, 'ft-v3');
  assert.equal(v3.parentItemId, 'item-v3');
  assert.equal(v3.sortOrder, 3, 'existing sortOrder untouched');
  assert.equal(v3.liveTabId, undefined, 'v3 record keeps its absent liveTabId (recomputed at runtime)');

  // v4 canonical → entirely untouched, INCLUDING its live liveTabId.
  const v4 = byTabIndex('g-2', 1);
  assert.deepEqual(v4, {
    floatingTabId: 'ft-v4',
    parentItemId: 'item-v4',
    groupId: 'g-2',
    windowId: 2,
    tabIndex: 1,
    url: 'https://v4.example',
    savedAt: 800,
    sortOrder: 7,
    liveTabId: 999,
  }, 'canonical v4 record passes through byte-for-byte');

  // No record anywhere gained a fabricated liveTabId.
  const fabricated = records.filter((r) => r.liveTabId !== undefined && r.liveTabId !== 999);
  assert.equal(fabricated.length, 0, 'the migration never fabricates a liveTabId');
});

test('B-180: eager migration is idempotent — a second pass changes nothing', async () => {
  seedPartitions({
    meta: { schemaVersion: 8, createdAt: 1000 },
    floatingGroups: legacyRecords(),
  });

  await runMigrations();
  const afterFirst = __getRawStore('tj:floatingGroups');

  /* Force a second migration pass over the ALREADY-normalized records: rewind
     meta to v8, reset cached migration state, and re-run. Every record now
     carries floatingTabId + sortOrder + parentItemId, so the transform must be
     a no-op (no new ULID minted, no sortOrder reassigned). */
  seedPartitions({ meta: { schemaVersion: 8, createdAt: 1000 } });
  _resetMigrationStateForTest();

  await runMigrations();
  const afterSecond = __getRawStore('tj:floatingGroups');

  assert.equal(getSystemStatus().schemaVersion, 9);
  assert.deepEqual(afterSecond, afterFirst, 'second migration pass is a byte-for-byte no-op (idempotent)');
});

test('B-180: assigned sortOrder slots after an existing max in the same group (no collision)', async () => {
  /* A group containing one record WITH a sortOrder (max 5) and one WITHOUT.
     The missing one must be assigned max+1 = 6, never colliding with 5. */
  seedPartitions({
    meta: { schemaVersion: 8, createdAt: 1000 },
    floatingGroups: [
      {
        floatingTabId: 'ft-has',
        parentItemId: 'item-a',
        groupId: 'g-x',
        windowId: 1,
        tabIndex: 0,
        url: 'https://has.example',
        savedAt: 500,
        sortOrder: 5,
      },
      {
        floatingTabId: 'ft-missing',
        parentItemId: 'item-b',
        groupId: 'g-x',
        windowId: 1,
        tabIndex: 1,
        url: 'https://missing.example',
        savedAt: 600,
        /* no sortOrder */
      },
    ],
  });

  await runMigrations();

  const records = __getRawStore('tj:floatingGroups');
  const has = records.find((r) => r.floatingTabId === 'ft-has');
  const missing = records.find((r) => r.floatingTabId === 'ft-missing');
  assert.equal(has.sortOrder, 5, 'existing sortOrder untouched');
  assert.equal(missing.sortOrder, 6, 'assigned current_max_in_group (5) + 1 = 6, no collision');
});

test('B-180: fresh install seeds schemaVersion 9 directly and runs no migration', async () => {
  // Empty storage — fresh install. initializePartitions seeds defaultShape(meta)
  // at the current schemaVersion (9), so stored === KNOWN_VERSION and the eager
  // step never runs.
  await runMigrations();

  assert.equal(__getRawStore('tj:meta').schemaVersion, 9, 'fresh install seeds v9 directly');
  assert.equal(getSystemStatus().schemaVersion, 9);
  assert.equal(getSystemStatus().safeMode, false);
  assert.deepEqual(__getRawStore('tj:floatingGroups'), [], 'floatingGroups seeded empty on fresh install');
});

test('B-180: full v1→v9 production-chain upgrade normalizes every legacy record (real MIGRATION_STEPS)', async () => {
  /* The existing tests all seed schemaVersion 8 — one step before the eager
     v8→v9 hop. This test pins the FULL upgrade envelope: a profile stranded at
     the earliest schema version whose floatingGroups still hold pre-v4 shapes.
     We seed `tj:meta.schemaVersion: 1` and run the REAL MIGRATION_STEPS chain
     end-to-end (the beforeEach deliberately does NOT clear the registry), so
     every governance hop v1→…→v8 plus the eager v8→v9 data hop fires in one
     atomic writeTransaction. */
  seedPartitions({
    meta: { schemaVersion: 1, createdAt: 1000 },
    floatingGroups: [
      /* legacy v1 itemId-only — same group, so sortOrder must be assigned 0,1. */
      {
        itemId: 'item-a',
        groupId: 'g-1',
        windowId: 1,
        tabIndex: 0,
        url: 'https://a.example',
        savedAt: 500,
      },
      {
        itemId: 'item-b',
        groupId: 'g-1',
        windowId: 1,
        tabIndex: 1,
        url: 'https://b.example',
        savedAt: 600,
      },
      /* legacy v1 itemId-only in a different group — sortOrder 0. */
      {
        itemId: 'item-c',
        groupId: 'g-2',
        windowId: 2,
        tabIndex: 0,
        url: 'https://c.example',
        savedAt: 700,
      },
    ],
  });

  await runMigrations();

  // (a) The full chain advanced the stamp all the way to KNOWN_VERSION (9).
  assert.equal(getSystemStatus().schemaVersion, 9);
  assert.equal(getSystemStatus().schemaVersion, KNOWN_VERSION);
  assert.equal(__getRawStore('tj:meta').schemaVersion, 9, 'on-disk meta bumped 1→9 by the real chain');

  const records = __getRawStore('tj:floatingGroups');
  // (c) No record dropped — 1:1 with the seeded array.
  assert.equal(records.length, 3, 'no record dropped across the full v1→v9 upgrade');

  // (b) Every record is fully normalized to the canonical v4 STABLE shape:
  //     parentItemId + floatingTabId + sortOrder present, liveTabId absent.
  for (const rec of records) {
    assert.equal(typeof rec.parentItemId, 'string');
    assert.ok(rec.parentItemId.length > 0, 'parentItemId derived from legacy itemId');
    assert.equal(rec.parentItemId, rec.itemId, 'parentItemId mirrors the legacy itemId');
    assert.equal(typeof rec.floatingTabId, 'string');
    assert.equal(rec.floatingTabId.length, 26, 'floatingTabId minted as a 26-char ULID');
    assert.equal(typeof rec.sortOrder, 'number');
    assert.ok(Number.isFinite(rec.sortOrder), 'sortOrder is a finite number');
    assert.equal(rec.liveTabId, undefined, 'liveTabId NOT fabricated — left for runtime');
  }

  // Per-group sortOrder assigned deterministically in array order (no collision).
  const g1 = records.filter((r) => r.groupId === 'g-1').sort((x, y) => x.tabIndex - y.tabIndex);
  assert.deepEqual(g1.map((r) => r.sortOrder), [0, 1], 'g-1 records slot 0,1 in array order');
  const g2 = records.filter((r) => r.groupId === 'g-2');
  assert.equal(g2[0].sortOrder, 0, 'g-2 sole record slots 0');
});

/* B-180 FIX 3 (qa M-2): the migration→runtime re-association round-trip — a
   migration-normalized record (parentItemId + sortOrder, NO liveTabId) fed
   through `reassociateFloatingGroups` with a matching live tab, asserting
   liveTabId is re-derived at runtime — is already covered transitively by
   `tests/floating-position.test.js:85` ("reassociateFloatingGroups lazy-rewrites
   liveTabId onto matched-unclaimed v3 records"), which seeds exactly that shape
   and asserts the runtime liveTabId rewrite (→ 555). Reproducing it here would
   duplicate that file's live-tab chrome-mock chain (__setMockTabs /
   buildLiveTabIndex / getLiveTabIndex) for no additional signal, so it is
   referenced as transitive coverage rather than re-built. */

test('B-180: meta bump + floatingGroups rewrite commit atomically in a single migration', async () => {
  /* Both partitions must end up consistent: meta at 9 AND records normalized.
     A partial commit (meta bumped but records un-normalized, or vice versa)
     would indicate the multi-partition writeTransaction was not atomic. */
  seedPartitions({
    meta: { schemaVersion: 8, createdAt: 1000 },
    floatingGroups: [
      {
        itemId: 'item-z',
        groupId: 'g-z',
        windowId: 3,
        tabIndex: 0,
        url: 'https://z.example',
        savedAt: 900,
      },
    ],
  });

  await runMigrations();

  assert.equal(__getRawStore('tj:meta').schemaVersion, 9);
  const rec = __getRawStore('tj:floatingGroups')[0];
  assert.equal(rec.parentItemId, 'item-z', 'record normalized in the same transaction as the meta bump');
  assert.equal(typeof rec.floatingTabId, 'string');
  assert.equal(rec.sortOrder, 0);
});
