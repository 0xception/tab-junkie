/**
 * B-001b AC2: Fresh install — empty storage, initializePartitions seeds v1, resolves cleanly.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC2: empty storage — runMigrations seeds partitions and resolves', async () => {
  // Storage is completely empty — fresh install scenario
  await runMigrations();

  const meta = __getRawStore('tj:meta');
  assert.ok(meta, 'tj:meta should be seeded');
  assert.equal(meta.schemaVersion, KNOWN_VERSION);

  const items = __getRawStore('tj:items');
  assert.ok(Array.isArray(items), 'tj:items should be seeded as array');

  const groups = __getRawStore('tj:groups');
  assert.ok(Array.isArray(groups), 'tj:groups should be seeded as array');

  const status = getSystemStatus();
  assert.equal(status.schemaVersion, KNOWN_VERSION);
  assert.equal(status.safeMode, false);
});
