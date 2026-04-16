/**
 * close-tabs.test.js — B-020 ACs
 * Tests for MSG_CLOSE_TABS handler via the dispatch layer.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
} from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, reconcileClaims, claimTabForItem, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { runMigrations, _resetMigrationStateForTest, _clearMigrationStepsForTest } from '../background/storage/migration.js';
import { createItem } from '../background/storage/index.js';
import { MSG_CLOSE_TABS } from '../shared/messages.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';

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

test('happy path: close a single tab', async () => {
  __setMockTabs([{ id: 10, url: 'https://close.test', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();

  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [10] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.closed, [10]);
  assert.deepEqual(res.data.notFound, []);
});

test('happy path: bulk close multiple tabs', async () => {
  __setMockTabs([
    { id: 20, url: 'https://a.test', windowId: 1, active: false, audible: false },
    { id: 21, url: 'https://b.test', windowId: 1, active: false, audible: false },
    { id: 22, url: 'https://c.test', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [20, 21, 22] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.closed, [20, 21, 22]);
  assert.deepEqual(res.data.notFound, []);
});

test('already-gone tabId returns in notFound', async () => {
  // Tab 999 is not in live tab index
  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [999] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.closed, []);
  assert.deepEqual(res.data.notFound, [999]);
});

test('mixed valid and invalid tabIds', async () => {
  __setMockTabs([{ id: 30, url: 'https://valid.test', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();

  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [30, 777, 888] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.closed, [30]);
  assert.ok(res.data.notFound.includes(777));
  assert.ok(res.data.notFound.includes(888));
});

test('empty array returns ERR_VALIDATION', async () => {
  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [] });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, ERR_VALIDATION);
});

test('non-array tabIds returns ERR_VALIDATION', async () => {
  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: 'not-an-array' });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, ERR_VALIDATION);
});

test('non-number entries in tabIds returns ERR_VALIDATION', async () => {
  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: ['a', 'b'] });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, ERR_VALIDATION);
});

test('handler does NOT call releaseClaimByTab — onRemoved handles cleanup', async () => {
  const item = await createItem({ title: 'Claimed', url: 'https://claimed.test', groupId: null });
  __setMockTabs([{ id: 40, url: 'https://claimed.test', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await claimTabForItem(item.id, 40);

  const mirrorBefore = { ...getClaimsMirror() };
  assert.equal(mirrorBefore[item.id], 40, 'claim should exist before close');

  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [40] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.data.closed, [40]);

  // Claim should still exist — the handler intentionally does NOT release it.
  // tabs.onRemoved is responsible for claim cleanup.
  const mirrorAfter = getClaimsMirror();
  assert.equal(mirrorAfter[item.id], 40, 'claim should NOT be released by the handler itself');
});
