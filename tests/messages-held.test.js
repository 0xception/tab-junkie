/**
 * B-001b AC8: Messages held until readyPromise resolves.
 * Delayed readyPromise → MSG_CREATE_ITEM held then processed.
 * After reject → ERR_NOT_READY.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, seedPartitions } from './chrome-mock.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_CREATE_ITEM, MSG_LIST_ITEMS, MSG_GET_STATUS } from '../shared/messages.js';
import { ERR_NOT_READY } from '../background/storage/errors.js';
import {
  KNOWN_VERSION,
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
} from '../background/storage/migration.js';

beforeEach(() => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

test('AC8: message held until readyPromise resolves, then processed', async () => {
  seedPartitions({ meta: { schemaVersion: KNOWN_VERSION, createdAt: Date.now() } });

  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  registerStorageHandlers(readyPromise);

  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  // Send a create message while readyPromise is still pending
  let responseReceived = false;
  const responsePromise = new Promise((resolve) => {
    listener(
      { type: MSG_CREATE_ITEM, payload: { title: 'Held Item', url: 'https://held.com' } },
      { id: chrome.runtime.id },
      (resp) => {
        responseReceived = true;
        resolve(resp);
      },
    );
  });

  // Response should NOT have been received yet
  // Give a tick for any synchronous processing
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(responseReceived, false, 'Response should be held until ready');

  // Now resolve the readyPromise
  resolveReady();

  const response = await responsePromise;
  assert.equal(responseReceived, true);
  // The create should succeed (or fail with validation, but not ERR_NOT_READY)
  assert.ok(response.ok === true || (response.ok === false && response.error.code !== ERR_NOT_READY),
    'Should process after ready, not reject with ERR_NOT_READY');
});

test('AC8: after readyPromise rejects → ERR_NOT_READY', async () => {
  const readyPromise = Promise.reject(new Error('startup failed'));

  registerStorageHandlers(readyPromise);

  // Wait for the rejection to settle
  await readyPromise.catch(() => {});

  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_CREATE_ITEM, payload: { title: 'Test', url: 'https://test.com' } },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  assert.equal(response.ok, false);
  assert.equal(response.error.code, ERR_NOT_READY);
});

test('AC8: MSG_GET_STATUS bypasses readyPromise gate', async () => {
  let resolveReady;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

  registerStorageHandlers(readyPromise);

  const listeners = chrome.runtime.onMessage._listeners;
  const listener = listeners[listeners.length - 1];

  // MSG_GET_STATUS should work even before readyPromise resolves
  const response = await new Promise((resolve) => {
    listener(
      { type: MSG_GET_STATUS },
      { id: chrome.runtime.id },
      resolve,
    );
  });

  assert.equal(response.ok, true);
  assert.ok('safeMode' in response.data);
  assert.ok('schemaVersion' in response.data);

  resolveReady(); // cleanup
});
