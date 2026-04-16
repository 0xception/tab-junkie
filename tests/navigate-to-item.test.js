/**
 * navigate-to-item.test.js — B-019 ACs
 * Tests for MSG_NAVIGATE_TO_ITEM handler via the dispatch layer.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
} from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex, updateTabEntry } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, reconcileClaims, getClaimsMirror, claimTabForItem } from '../background/tabs/tab-claims.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { runMigrations, _resetMigrationStateForTest, _clearMigrationStepsForTest } from '../background/storage/migration.js';
import { createItem, getItem } from '../background/storage/index.js';
import { MSG_NAVIGATE_TO_ITEM } from '../shared/messages.js';
import { ERR_NOT_FOUND, ERR_VALIDATION } from '../background/storage/errors.js';

/** Send a message through the registered handler and return the response. */
function sendMsg(type, payload = {}) {
  const listeners = chrome.runtime.onMessage._listeners;
  return new Promise((resolve) => {
    listeners[listeners.length - 1](
      { type, payload },
      { id: chrome.runtime.id },
      resolve,
    );
  });
}

let ready;
beforeEach(async () => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;
  await buildLiveTabIndex();
  await reconcileClaims([]);
});

test('happy path: switch to existing tab when claim is live', async () => {
  const item = await createItem({ title: 'Nav', url: 'https://nav.test', groupId: null });
  __setMockTabs([{ id: 100, url: 'https://nav.test', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await claimTabForItem(item.id, 100);

  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: item.id });
  assert.equal(res.ok, true);
  assert.equal(res.data.tabId, 100);
  assert.equal(res.data.opened, false);
});

test('open new tab when no claim exists', async () => {
  const item = await createItem({ title: 'New', url: 'https://new.test', groupId: null });

  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: item.id });
  assert.equal(res.ok, true);
  assert.equal(res.data.opened, true);
  assert.ok(typeof res.data.tabId === 'number');

  // Verify claim was set
  const mirror = getClaimsMirror();
  assert.equal(mirror[item.id], res.data.tabId);
});

test('stale claim cleanup: claim exists but tab not in index', async () => {
  const item = await createItem({ title: 'Stale', url: 'https://stale.test', groupId: null });
  // Claim a tab that doesn't exist in the live index
  await claimTabForItem(item.id, 999);

  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: item.id });
  assert.equal(res.ok, true);
  assert.equal(res.data.opened, true);
  // Old stale claim should be released, new claim set
  const mirror = getClaimsMirror();
  assert.notEqual(mirror[item.id], 999);
  assert.equal(mirror[item.id], res.data.tabId);
});

test('ERR_NOT_FOUND for nonexistent item', async () => {
  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: 'nonexistent-id' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, ERR_NOT_FOUND);
});

test('ERR_VALIDATION for no-URL item', async () => {
  const item = await createItem({ title: 'No URL', url: 'https://placeholder.test', groupId: null });
  // Patch the stored item to have empty url by updating it
  // We need to use updateItem to clear the URL — but the validator may block it.
  // Instead, create via direct seeding.
  const { __setRawStore, __getRawStore } = await import('./chrome-mock.js');
  const store = __getRawStore('tj:items');
  if (store) {
    const idx = store.findIndex((i) => i.id === item.id);
    if (idx >= 0) {
      store[idx].url = '';
      __setRawStore('tj:items', store);
    }
  }

  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: item.id });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, ERR_VALIDATION);
});

test('ERR_VALIDATION for empty itemId', async () => {
  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: '' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, ERR_VALIDATION);
});

test('lastAccessedAt is bumped after navigation', async () => {
  const item = await createItem({ title: 'Bump', url: 'https://bump.test', groupId: null });
  const beforeTime = Date.now();

  const res = await sendMsg(MSG_NAVIGATE_TO_ITEM, { itemId: item.id });
  assert.equal(res.ok, true);

  const updated = await getItem(item.id);
  assert.ok(updated.lastAccessedAt >= beforeTime, 'lastAccessedAt should be bumped to current time');
});
