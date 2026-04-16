/**
 * B-001b AC3: Corrupt meta — no schemaVersion field → rejects ERR_CORRUPT_DATA.
 * Write → ERR_NOT_READY (or ERR_CORRUPT_DATA). Read → still works.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';
import {
  runMigrations,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { StorageError, ERR_CORRUPT_DATA } from '../background/storage/errors.js';
import { readPartition, PARTITION_ITEMS } from '../background/storage/partitions.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC3: corrupt meta (no schemaVersion) → rejects with ERR_CORRUPT_DATA', async () => {
  // Seed meta without schemaVersion
  seedPartitions({
    meta: { createdAt: Date.now() },
    items: [],
    groups: [],
    prefs: { theme: 'system', displayMode: 'sidepanel', newTabOverride: false, autoCollapseSubGroups: false },
    drift: {},
    floatingGroups: [],
  });

  await assert.rejects(
    () => runMigrations(),
    (err) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.code, ERR_CORRUPT_DATA);
      return true;
    },
  );
});

test('AC3: corrupt meta (schemaVersion is string) → rejects with ERR_CORRUPT_DATA', async () => {
  seedPartitions({
    meta: { schemaVersion: 'abc', createdAt: Date.now() },
    items: [],
    groups: [],
    prefs: { theme: 'system', displayMode: 'sidepanel', newTabOverride: false, autoCollapseSubGroups: false },
    drift: {},
    floatingGroups: [],
  });

  await assert.rejects(
    () => runMigrations(),
    (err) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.code, ERR_CORRUPT_DATA);
      return true;
    },
  );
});

test('AC3: corrupt meta (schemaVersion is 0) → rejects with ERR_CORRUPT_DATA', async () => {
  seedPartitions({
    meta: { schemaVersion: 0, createdAt: Date.now() },
    items: [],
    groups: [],
    prefs: { theme: 'system', displayMode: 'sidepanel', newTabOverride: false, autoCollapseSubGroups: false },
    drift: {},
    floatingGroups: [],
  });

  await assert.rejects(
    () => runMigrations(),
    (err) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.code, ERR_CORRUPT_DATA);
      return true;
    },
  );
});

test('AC3: after corrupt reject, reads still work', async () => {
  seedPartitions({
    items: [
      { id: 'X1', title: 'Test', url: 'https://example.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    ],
    meta: { createdAt: Date.now() }, // corrupt — no schemaVersion
    groups: [],
    prefs: { theme: 'system', displayMode: 'sidepanel', newTabOverride: false, autoCollapseSubGroups: false },
    drift: {},
    floatingGroups: [],
  });

  // Migration should fail
  await assert.rejects(() => runMigrations());

  // But reads should still work
  const items = await readPartition(PARTITION_ITEMS);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'X1');
});
