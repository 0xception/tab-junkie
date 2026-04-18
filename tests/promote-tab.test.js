/**
 * promote-tab.test.js — B-016 AC1–AC9 (with B-059 updates)
 * Tests for MSG_PROMOTE_TAB handler via the dispatch layer (storage-handlers.js).
 *
 * We call the dispatch function directly from storage-handlers by re-exercising
 * the MSG_PROMOTE_TAB branch through a thin wrapper that mirrors what
 * registerStorageHandlers does (minus the chrome.runtime.onMessage wiring).
 *
 * B-059: the handler no longer rejects on duplicate URLs — duplicate-URL
 * detection is now a client-side soft-warn (see sidepanel tests). The
 * previously-rejecting AC4 cases now assert successful creation of a second
 * item with a matching URL.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getSessionStore,
} from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims, getClaimsMirror } from '../background/tabs/tab-claims.js';
import { createItem, listItems, createGroup } from '../background/storage/index.js';
import { ERR_VALIDATION, ERR_NOT_FOUND } from '../background/storage/errors.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { runMigrations, _resetMigrationStateForTest, _clearMigrationStepsForTest } from '../background/storage/migration.js';
import { MSG_PROMOTE_TAB } from '../shared/messages.js';

// Import promote logic by re-using the same storage-handlers dispatch indirectly.
// We exercise MSG_PROMOTE_TAB by calling the exported functions it delegates to directly.
// For handler-level tests, import the functions used inside the handler.
import { claimTabForItem } from '../background/tabs/tab-claims.js';

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

// Helper: replicate what MSG_PROMOTE_TAB does so we can test it end-to-end.
// Post-B-059: no duplicate-URL check — matches the actual dispatch body in
// background/messages/storage-handlers.js.
async function promoteTab({ tabId, groupId = null }) {
  if (typeof tabId !== 'number') {
    const { StorageError, ERR_VALIDATION: EV } = await import('../background/storage/errors.js');
    throw new StorageError(EV, 'promoteTab: tabId must be a number');
  }
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    const { StorageError } = await import('../background/storage/errors.js');
    const { ERR_NOT_FOUND: ENF } = await import('../background/storage/errors.js');
    throw new StorageError(ENF, 'tab not found');
  }
  if (!tab) {
    const { StorageError, ERR_NOT_FOUND: ENF } = await import('../background/storage/errors.js');
    throw new StorageError(ENF, 'tab not found');
  }
  const url = tab.url || '';
  // B-058: scheme validation is delegated to createItem → normalizeUrl.
  // B-059: no duplicate-URL check — duplicates are allowed at the data layer.
  const newItem = await createItem({ title: tab.title || url, url, groupId });
  await claimTabForItem(newItem.id, tabId);
  return newItem;
}

const COLOR = GROUP_COLORS[0];

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC1: promoteTab rejects non-number tabId', async () => {
  await assert.rejects(
    () => promoteTab({ tabId: 'not-a-number' }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC2: promoteTab rejects when tab does not exist', async () => {
  // chrome.tabs.get returns null for missing tabs (per chrome-mock)
  await assert.rejects(
    () => promoteTab({ tabId: 9999 }),
    (err) => {
      assert.equal(err.code, ERR_NOT_FOUND);
      return true;
    },
  );
});

// B-058: chrome://, about:, chrome-extension://, file: are now ALLOWED.
// These tests assert acceptance (previously asserted rejection).

test('AC3 (B-058): promoteTab accepts chrome:// URLs', async () => {
  __setMockTabs([{ id: 1, url: 'chrome://settings', title: 'Settings', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 1 });
  assert.ok(item.id, 'item should be created for chrome:// URL');
  assert.equal(item.url, 'chrome://settings');
});

test('AC3 (B-058): promoteTab accepts about: URLs', async () => {
  __setMockTabs([{ id: 2, url: 'about:blank', title: 'about:blank', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 2 });
  assert.ok(item.id, 'item should be created for about: URL');
  assert.equal(item.url, 'about:blank');
});

test('AC3 (B-058): promoteTab accepts file: URLs', async () => {
  __setMockTabs([{ id: 3, url: 'file:///home/user/doc.html', title: 'doc.html', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 3 });
  assert.ok(item.id, 'item should be created for file: URL');
  assert.equal(item.url, 'file:///home/user/doc.html');
});

test('AC4 (B-059): promoteTab now accepts a duplicate URL and creates a second item', async () => {
  const existing = await createItem({ title: 'Existing', url: 'https://example.com', groupId: null });
  __setMockTabs([{ id: 10, url: 'https://example.com', title: 'Example', windowId: 1, active: true, audible: false }]);
  await buildLiveTabIndex();

  const created = await promoteTab({ tabId: 10 });
  assert.ok(created.id, 'second item must be created');
  assert.notEqual(created.id, existing.id, 'duplicate must have a distinct id');
  /* URL is run through normalizeUrl which may append a trailing slash on bare
     origins — compare on match-normalization equality rather than literal. */
  assert.ok(
    created.url === 'https://example.com' || created.url === 'https://example.com/',
    'created.url should be origin with optional trailing slash',
  );

  const all = await listItems();
  assert.equal(all.length, 2, 'both items coexist after B-059');
});

test('AC4 (B-059): promoteTab accepts a duplicate URL even when normalization collapses them (trailing slash)', async () => {
  const existing = await createItem({ title: 'Existing', url: 'https://example.com', groupId: null });
  __setMockTabs([{ id: 11, url: 'https://example.com/', title: 'Example', windowId: 1, active: true, audible: false }]);
  await buildLiveTabIndex();

  const created = await promoteTab({ tabId: 11 });
  assert.ok(created.id, 'second item must be created even when match-normalized URLs collide');
  assert.notEqual(created.id, existing.id);

  const all = await listItems();
  assert.equal(all.length, 2);
});

test('AC5/AC6: promoteTab happy path creates item and writes claim', async () => {
  __setMockTabs([{ id: 20, url: 'https://saved.com/page', title: 'Saved Page', windowId: 1, active: true, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 20, groupId: null });

  assert.ok(item.id, 'should return created item with id');
  assert.equal(item.url, 'https://saved.com/page');
  assert.equal(item.title, 'Saved Page');
  assert.equal(item.groupId, null);

  // Verify claim was written
  const mirror = getClaimsMirror();
  assert.equal(mirror[item.id], 20);
});

test('AC5/AC6: promoteTab assigns item to specified groupId', async () => {
  const g = await createGroup({ name: 'Work', color: COLOR, parentId: null });
  __setMockTabs([{ id: 21, url: 'https://work.com', title: 'Work', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 21, groupId: g.id });
  assert.equal(item.groupId, g.id);
});

test('AC6: claim is written to session storage', async () => {
  __setMockTabs([{ id: 22, url: 'https://session-test.com', title: 'T', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const item = await promoteTab({ tabId: 22 });
  const sessionClaims = __getSessionStore('tj:tabClaims');
  assert.ok(sessionClaims, 'session storage should have claims');
  assert.equal(sessionClaims[item.id], 22);
});

test('AC9: failure atomicity — rejected promote does not leave a partial item', async () => {
  // B-058: chrome://newtab is now accepted; use javascript: which remains rejected.
  const before = await listItems();
  __setMockTabs([{ id: 30, url: 'javascript:alert(1)', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await assert.rejects(() => promoteTab({ tabId: 30 }));
  const after = await listItems();
  assert.equal(after.length, before.length, 'no item should be created on failure');
});

/* =========================================================================
   B-059 T-7 — Real-dispatcher regression (addresses R4 QA M-4)
   Dispatch through the registered chrome.runtime.onMessage handler so any
   future re-introduction of an ERR_DUPLICATE_URL throw inside the real
   MSG_PROMOTE_TAB case is caught — not masked by the local promoteTab helper.
   ========================================================================= */
test('B-059 T-7: MSG_PROMOTE_TAB real dispatcher does NOT throw ERR_DUPLICATE_URL on duplicate URL', async () => {
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const existing = await createItem({ title: 'Existing', url: 'https://dup-real-dispatch.test', groupId: null });
  __setMockTabs([
    { id: 500, url: 'https://dup-real-dispatch.test', title: 'Dup', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const res = await sendMsg(MSG_PROMOTE_TAB, { tabId: 500, groupId: null });
  assert.equal(res.ok, true, 'dispatcher must return ok: true for duplicate-URL promote (post-B-059)');
  assert.ok(res.data && res.data.id, 'response envelope must carry the created item');
  assert.notEqual(res.data.id, existing.id, 'second item must have a distinct id');

  if (!res.ok) {
    assert.notEqual(
      res.error && res.error.code,
      'ERR_DUPLICATE_URL',
      'dispatcher must NOT surface ERR_DUPLICATE_URL (B-059 removed that reject)',
    );
  }

  const all = await listItems();
  assert.equal(all.length, 2, 'both items must coexist after B-059');
});
