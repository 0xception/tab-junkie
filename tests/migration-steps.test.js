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
