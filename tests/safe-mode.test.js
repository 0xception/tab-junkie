/**
 * B-001b AC5: Safe mode — schemaVersion > KNOWN_VERSION → resolves (not rejects).
 * Writes blocked with ERR_SAFE_MODE. Reads still work.
 * MSG_GET_STATUS → {safeMode:true, schemaVersion:999, knownVersion:1}.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';
import {
  runMigrations,
  getSystemStatus,
  isSafeMode,
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';
import { readPartition, PARTITION_ITEMS } from '../background/storage/partitions.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_CREATE_ITEM, MSG_LIST_ITEMS, MSG_GET_STATUS } from '../shared/messages.js';
import { ERR_SAFE_MODE } from '../background/storage/errors.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC5: schemaVersion 999 → resolves (NOT rejects), safeMode is true', async () => {
  seedPartitions({ meta: { schemaVersion: 999, createdAt: Date.now() } });

  // Should NOT throw
  await runMigrations();

  assert.equal(isSafeMode(), true);
});

test('AC5: MSG_GET_STATUS returns correct shape in safe mode', async () => {
  seedPartitions({ meta: { schemaVersion: 999, createdAt: Date.now() } });
  await runMigrations();

  const status = getSystemStatus();
  assert.equal(status.safeMode, true);
  assert.equal(status.schemaVersion, 999);
  assert.equal(status.knownVersion, KNOWN_VERSION);
});

test('AC5: reads still work in safe mode', async () => {
  seedPartitions({
    meta: { schemaVersion: 999, createdAt: Date.now() },
    items: [
      { id: 'R1', title: 'Readable', url: 'https://example.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    ],
  });
  await runMigrations();

  const items = await readPartition(PARTITION_ITEMS);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'R1');
});

test('AC5: write messages blocked with ERR_SAFE_MODE via handler', async () => {
  seedPartitions({ meta: { schemaVersion: 999, createdAt: Date.now() } });
  const ready = runMigrations();
  registerStorageHandlers(ready);

  await ready;

  // Simulate sending a write message through the dispatcher
  const listeners = chrome.runtime.onMessage._listeners;
  assert.ok(listeners.length > 0, 'handler should be registered');

  const response = await new Promise((resolve) => {
    const handled = listeners[listeners.length - 1](
      { type: MSG_CREATE_ITEM, payload: { title: 'Test', url: 'https://test.com' } },
      { id: chrome.runtime.id },
      resolve,
    );
    assert.equal(handled, true, 'handler should return true for async');
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERR_SAFE_MODE);
});

test('AC5: MSG_GET_STATUS works via handler in safe mode', async () => {
  seedPartitions({ meta: { schemaVersion: 999, createdAt: Date.now() } });
  const ready = runMigrations();
  registerStorageHandlers(ready);

  await ready;

  const listeners = chrome.runtime.onMessage._listeners;
  const response = await new Promise((resolve) => {
    listeners[listeners.length - 1](
      { type: MSG_GET_STATUS },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.safeMode, true);
  assert.equal(response.data.schemaVersion, 999);
  assert.equal(response.data.knownVersion, KNOWN_VERSION);
});
