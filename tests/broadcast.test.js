/**
 * broadcast.test.js — B-050 AC1–AC6
 * Tests for mutation broadcast behaviour in storage-handlers.js.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getSendMessageCalls,
  seedPartitions,
} from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, reconcileClaims } from '../background/tabs/tab-claims.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { runMigrations, _resetMigrationStateForTest, _clearMigrationStepsForTest } from '../background/storage/migration.js';
import {
  MSG_CREATE_ITEM,
  MSG_UPDATE_ITEM,
  MSG_DELETE_ITEM,
  MSG_CREATE_GROUP,
  MSG_UPDATE_GROUP,
  MSG_DELETE_GROUP,
  MSG_SET_PREFERENCES,
  MSG_LIST_ITEMS,
  MSG_NAVIGATE_TO_ITEM,
  MSG_CLOSE_TABS,
  MSG_STATE_CHANGED,
} from '../shared/messages.js';
import { GROUP_COLORS } from '../shared/constants.js';

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
  // Build empty live tab index and reconcile so claims are ready
  await buildLiveTabIndex();
  await reconcileClaims([]);
});

// ---- AC1: mutation broadcast fires on success ----

test('AC1: MSG_CREATE_ITEM triggers a broadcast on success', async () => {
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_CREATE_ITEM, { title: 'Test', url: 'https://example.com', groupId: null });
  assert.equal(res.ok, true);
  // Allow microtask for broadcast
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.ok(calls.length >= 1, 'broadcast should fire');
  assert.equal(calls[0][0].type, MSG_STATE_CHANGED);
  assert.equal(calls[0][0].payload.scope, 'items');
});

test('AC1: MSG_CREATE_GROUP triggers a groups broadcast', async () => {
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_CREATE_GROUP, { name: 'G1', color: GROUP_COLORS[0], parentId: null });
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.ok(calls.length >= 1);
  assert.equal(calls[0][0].payload.scope, 'groups');
});

test('AC1: MSG_SET_PREFERENCES triggers a preferences broadcast', async () => {
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_SET_PREFERENCES, { patch: { theme: 'dark' } });
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.ok(calls.length >= 1);
  assert.equal(calls[0][0].payload.scope, 'preferences');
});

// ---- AC1: no broadcast on error ----

test('AC1: no broadcast fires when handler returns an error', async () => {
  const before = __getSendMessageCalls().length;
  // MSG_CREATE_ITEM with missing url should fail validation
  const res = await sendMsg(MSG_CREATE_ITEM, { title: 'No URL' });
  assert.equal(res.ok, false);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.equal(calls.length, 0, 'no broadcast on error');
});

// ---- AC1: read operations do NOT broadcast ----

test('AC1: MSG_LIST_ITEMS does NOT trigger a broadcast', async () => {
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_LIST_ITEMS, {});
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.equal(calls.length, 0, 'reads should not broadcast');
});

// ---- AC1: MSG_CLOSE_TABS does NOT broadcast (handled by tabs.onRemoved) ----

test('AC1: MSG_CLOSE_TABS does NOT trigger a mutation broadcast', async () => {
  __setMockTabs([{ id: 50, url: 'https://close.me', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_CLOSE_TABS, { tabIds: [50] });
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.equal(calls.length, 0, 'closeTabs should not broadcast — onRemoved handles it');
});

// ---- AC2: cold-start suppression for tab events ----

test('AC2: broadcast with requireClaimsReady suppressed when claims not ready', async () => {
  // Reset claims to not-ready state
  __resetTabClaims();
  const { broadcast, SCOPE } = await import('../background/broadcast.js');
  const before = __getSendMessageCalls().length;
  broadcast(SCOPE.LIVE_STATE, 'tab/removed', { requireClaimsReady: true });
  const calls = __getSendMessageCalls().slice(before);
  assert.equal(calls.length, 0, 'should be suppressed when claims not ready');
});

// ---- AC4: silent on no receivers (catch swallows) ----

test('AC4: broadcast does not throw when no receivers (sendMessage rejects)', async () => {
  // Override sendMessage to reject
  const origSendMessage = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = (...args) => {
    __getSendMessageCalls().push(args);
    return Promise.reject(new Error('Could not establish connection'));
  };
  const { broadcast, SCOPE } = await import('../background/broadcast.js');
  // Should not throw
  broadcast(SCOPE.ITEMS, 'test/trigger');
  await new Promise((r) => setTimeout(r, 10));
  chrome.runtime.sendMessage = origSendMessage;
});

// ---- AC6: sendResponse completes before broadcast fires ----

test('AC6: sendResponse is called before broadcast', async () => {
  const order = [];
  const listeners = chrome.runtime.onMessage._listeners;
  const origSendMessage = chrome.runtime.sendMessage;
  chrome.runtime.sendMessage = (...args) => {
    __getSendMessageCalls().push(args);
    order.push('broadcast');
    return Promise.resolve();
  };

  await new Promise((resolve) => {
    listeners[listeners.length - 1](
      { type: MSG_CREATE_ITEM, payload: { title: 'Order Test', url: 'https://order.test', groupId: null } },
      { id: chrome.runtime.id },
      (resp) => {
        order.push('sendResponse');
        resolve(resp);
      },
    );
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(order[0], 'sendResponse', 'sendResponse must fire before broadcast');
  assert.equal(order[1], 'broadcast', 'broadcast fires after sendResponse');
  chrome.runtime.sendMessage = origSendMessage;
});

// ---- AC1: correct trigger per write type ----

test('AC1: MSG_UPDATE_ITEM broadcast carries correct trigger', async () => {
  const create = await sendMsg(MSG_CREATE_ITEM, { title: 'Up', url: 'https://up.test', groupId: null });
  assert.equal(create.ok, true);
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_UPDATE_ITEM, { id: create.data.id, patch: { title: 'Updated' } });
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.ok(calls.length >= 1);
  assert.equal(calls[0][0].payload.trigger, MSG_UPDATE_ITEM);
});

test('AC1: MSG_DELETE_ITEM broadcast carries correct trigger', async () => {
  const create = await sendMsg(MSG_CREATE_ITEM, { title: 'Del', url: 'https://del.test', groupId: null });
  const before = __getSendMessageCalls().length;
  const res = await sendMsg(MSG_DELETE_ITEM, { id: create.data.id });
  assert.equal(res.ok, true);
  await new Promise((r) => setTimeout(r, 10));
  const calls = __getSendMessageCalls().slice(before);
  assert.ok(calls.length >= 1);
  assert.equal(calls[0][0].payload.trigger, MSG_DELETE_ITEM);
});
