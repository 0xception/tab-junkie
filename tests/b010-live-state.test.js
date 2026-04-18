/**
 * B-010 Live tab reflection & active-tab highlight tests.
 *
 * Covers LiveTabIndex CRUD, tab/window event handlers, TabClaims
 * buildLiveStates, and H-1 through H-3 fixes.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getSendMessageCalls,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  getLiveTabIndex,
  updateTabEntry,
  removeTabEntry,
  removeTabsByWindow,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  buildLiveStates,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import { seedPartitions } from './chrome-mock.js';

/* =========================================================================
   Helpers
   ========================================================================= */

function resetAll() {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
}

/* =========================================================================
   1. LiveTabIndex — buildLiveTabIndex
   ========================================================================= */

test('B010-1: buildLiveTabIndex captures url, title, windowId, active, audible, favIconUrl', async () => {
  resetAll();
  __setMockTabs([
    { id: 1, url: 'https://a.com', title: 'A', windowId: 10, active: true, audible: false, favIconUrl: 'https://a.com/fav.ico', index: 0 },
    { id: 2, url: 'https://b.com', title: '', windowId: 10, active: false, audible: true, favIconUrl: '', index: 1 },
  ]);

  await buildLiveTabIndex();
  const idx = getLiveTabIndex();

  // B-055: LiveTabIndex entries carry `title` so the Open Tabs section can
  // render row titles without per-tab chrome.tabs.get round-trips.
  assert.equal(idx.size, 2);
  assert.deepStrictEqual(idx.get(1), {
    url: 'https://a.com',
    title: 'A',
    windowId: 10,
    active: true,
    audible: false,
    index: 0,
    favIconUrl: 'https://a.com/fav.ico',
  });
  assert.deepStrictEqual(idx.get(2), {
    url: 'https://b.com',
    title: '',
    windowId: 10,
    active: false,
    audible: true,
    index: 1,
    favIconUrl: '',
  });
});

/* =========================================================================
   2. LiveTabIndex — updateTabEntry
   ========================================================================= */

test('B010-2: updateTabEntry merges patch into existing entry', async () => {
  resetAll();
  __setMockTabs([{ id: 5, url: 'https://old.com', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();

  updateTabEntry(5, { url: 'https://new.com', audible: true });
  const entry = getLiveTabIndex().get(5);
  assert.equal(entry.url, 'https://new.com');
  assert.equal(entry.audible, true);
  assert.equal(entry.windowId, 1, 'windowId unchanged');
  assert.equal(entry.active, false, 'active unchanged');
});

test('B010-2b: updateTabEntry creates new entry with defaults if not present', () => {
  resetAll();
  updateTabEntry(99, { url: 'https://brand-new.com', active: true });
  const entry = getLiveTabIndex().get(99);
  assert.ok(entry, 'Entry should be created');
  assert.equal(entry.url, 'https://brand-new.com');
  assert.equal(entry.active, true);
  assert.equal(entry.windowId, 0, 'Default windowId');
  assert.equal(entry.audible, false, 'Default audible');
  assert.equal(entry.favIconUrl, '', 'Default favIconUrl');
});

/* =========================================================================
   3. LiveTabIndex — removeTabEntry
   ========================================================================= */

test('B010-3: removeTabEntry deletes the entry', async () => {
  resetAll();
  __setMockTabs([{ id: 7, url: 'https://x.com', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  assert.ok(getLiveTabIndex().has(7));
  removeTabEntry(7);
  assert.equal(getLiveTabIndex().has(7), false);
});

/* =========================================================================
   4. LiveTabIndex — removeTabsByWindow
   ========================================================================= */

test('B010-4: removeTabsByWindow removes all entries for given windowId', async () => {
  resetAll();
  __setMockTabs([
    { id: 1, url: 'https://a.com', windowId: 10, active: true, audible: false },
    { id: 2, url: 'https://b.com', windowId: 10, active: false, audible: false },
    { id: 3, url: 'https://c.com', windowId: 20, active: true, audible: false },
  ]);
  await buildLiveTabIndex();

  const removed = removeTabsByWindow(10);
  assert.deepStrictEqual(removed.sort(), [1, 2]);
  assert.equal(getLiveTabIndex().size, 1);
  assert.ok(getLiveTabIndex().has(3));
});

/* =========================================================================
   5. LiveTabIndex — getLiveTabIndex returns live Map reference
   ========================================================================= */

test('B010-5: getLiveTabIndex returns the live Map reference', async () => {
  resetAll();
  __setMockTabs([{ id: 1, url: 'https://a.com', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  const ref1 = getLiveTabIndex();
  const ref2 = getLiveTabIndex();
  assert.strictEqual(ref1, ref2, 'Should return same Map instance');
});

/* =========================================================================
   6-14: Tab event handler tests
   Must register listeners once per block (registerTabEventListeners is additive).
   ========================================================================= */

test('B010-6: tabs.onUpdated with URL change updates LiveTabIndex and debounces', async () => {
  resetAll();
  __setMockTabs([{ id: 1, url: 'https://old.com', windowId: 1, active: true, audible: false }]);
  seedPartitions({
    items: [{ id: 'item-1', url: 'https://old.com', title: 'T', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    meta: { schemaVersion: 1 },
  });
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-1', url: 'https://old.com', sortOrder: 0 }]);

  registerTabEventListeners(Promise.resolve());

  chrome.tabs.onUpdated.__fire(1, { url: 'https://new.com' }, { id: 1, windowId: 1, active: true });

  // LiveTabIndex should be updated immediately (synchronous updateTabEntry)
  assert.equal(getLiveTabIndex().get(1).url, 'https://new.com');

  // Wait for debounce (100ms) + async work
  await new Promise((r) => setTimeout(r, 300));
  // Verify broadcast happened (sendMessage called)
  const calls = __getSendMessageCalls();
  assert.ok(calls.length > 0, 'Should have broadcast after debounced reevaluation');
});

test('B010-7: tabs.onUpdated with favIconUrl only (no url) broadcasts tab/favicon-changed', async () => {
  resetAll();
  __setMockTabs([{ id: 2, url: 'https://x.com', windowId: 1, active: false, audible: false }]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  chrome.tabs.onUpdated.__fire(2, { favIconUrl: 'https://x.com/favicon.png' }, { id: 2, windowId: 1 });

  // Should have broadcasted
  const calls = __getSendMessageCalls();
  const faviconBroadcast = calls.find((c) => c[0]?.payload?.trigger === 'tab/favicon-changed');
  assert.ok(faviconBroadcast, 'Should broadcast tab/favicon-changed for favIconUrl-only update');
});

test('B010-8: tabs.onUpdated with url AND favIconUrl does NOT broadcast tab/favicon-changed (H-1)', async () => {
  resetAll();
  __setMockTabs([{ id: 3, url: 'https://y.com', windowId: 1, active: false, audible: false }]);
  seedPartitions({
    items: [{ id: 'item-3', url: 'https://y.com', title: 'Y', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    meta: { schemaVersion: 1 },
  });
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-3', url: 'https://y.com', sortOrder: 0 }]);

  registerTabEventListeners(Promise.resolve());

  // Clear previous broadcasts
  __getSendMessageCalls().length = 0;

  chrome.tabs.onUpdated.__fire(3, { url: 'https://z.com', favIconUrl: 'https://z.com/fav.ico' }, { id: 3, windowId: 1, active: false });

  // Immediate: should NOT have a tab/favicon-changed broadcast
  const immediateCalls = __getSendMessageCalls().slice();
  const faviconBroadcast = immediateCalls.find((c) => c[0]?.payload?.trigger === 'tab/favicon-changed');
  assert.equal(faviconBroadcast, undefined, 'H-1: Should NOT broadcast tab/favicon-changed when url is also present');
});

test('B010-9: tabs.onActivated deactivates previous tab in same window, activates new', async () => {
  resetAll();
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: true, audible: false },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  chrome.tabs.onActivated.__fire({ tabId: 11, windowId: 1 });

  const idx = getLiveTabIndex();
  assert.equal(idx.get(10).active, false, 'Previous active tab should be deactivated');
  assert.equal(idx.get(11).active, true, 'New tab should be activated');
});

test('B010-10: tabs.onRemoved cancels reevalTimer (H-2), removes entry, releases claim', async () => {
  resetAll();
  __setMockTabs([{ id: 20, url: 'https://example.com', windowId: 1, active: true, audible: false }]);
  seedPartitions({
    items: [{ id: 'item-20', url: 'https://example.com', title: 'E', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    meta: { schemaVersion: 1 },
  });
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-20', url: 'https://example.com', sortOrder: 0 }]);

  registerTabEventListeners(Promise.resolve());

  // First fire a URL change to start a debounce timer
  chrome.tabs.onUpdated.__fire(20, { url: 'https://new.com' }, { id: 20, windowId: 1, active: true });

  // Immediately remove the tab before debounce fires
  chrome.tabs.onRemoved.__fire(20);

  assert.equal(getLiveTabIndex().has(20), false, 'Tab should be removed from index');

  // Wait past the debounce — should NOT throw or error since timer was cancelled (H-2)
  await new Promise((r) => setTimeout(r, 300));
});

test('B010-11: windows.onFocusChanged with WINDOW_ID_NONE deactivates all tabs', async () => {
  resetAll();
  __setMockTabs([
    { id: 30, url: 'https://a.com', windowId: 1, active: true, audible: false },
    { id: 31, url: 'https://b.com', windowId: 2, active: true, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  chrome.windows.onFocusChanged.__fire(chrome.windows.WINDOW_ID_NONE);

  const idx = getLiveTabIndex();
  assert.equal(idx.get(30).active, false, 'Tab 30 should be deactivated');
  assert.equal(idx.get(31).active, false, 'Tab 31 should be deactivated');
});

test('B010-12: windows.onFocusChanged with windowId deactivates other windows, activates queried tab', async () => {
  resetAll();
  __setMockTabs([
    { id: 40, url: 'https://a.com', windowId: 1, active: true, audible: false },
    { id: 41, url: 'https://b.com', windowId: 2, active: true, audible: false },
    { id: 42, url: 'https://c.com', windowId: 2, active: false, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  // Focus window 2 — should deactivate tab 40 (window 1), activate tab 41 (active in window 2)
  chrome.windows.onFocusChanged.__fire(2);

  // Need to await because this handler is async (queries tabs)
  await new Promise((r) => setTimeout(r, 50));

  const idx = getLiveTabIndex();
  assert.equal(idx.get(40).active, false, 'Tab in other window should be deactivated');
  assert.equal(idx.get(41).active, true, 'Active tab in focused window should remain active');
});

test('B010-13: windows.onFocusChanged broadcast fires AFTER updateTabEntry (H-3)', async () => {
  resetAll();
  __setMockTabs([
    { id: 50, url: 'https://a.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  // Clear calls before test
  __getSendMessageCalls().length = 0;

  chrome.windows.onFocusChanged.__fire(1);

  // Wait for async handler
  await new Promise((r) => setTimeout(r, 50));

  const calls = __getSendMessageCalls();
  const focusBroadcast = calls.find((c) => c[0]?.payload?.trigger === 'window/focused');
  assert.ok(focusBroadcast, 'H-3: broadcast should fire after try block resolves');
});

test('B010-14: windows.onRemoved cancels reevalTimers for removed tabs (H-2)', async () => {
  resetAll();
  __setMockTabs([
    { id: 60, url: 'https://a.com', windowId: 5, active: true, audible: false },
    { id: 61, url: 'https://b.com', windowId: 5, active: false, audible: false },
  ]);
  seedPartitions({
    items: [{ id: 'item-60', url: 'https://a.com', title: 'A', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }],
    meta: { schemaVersion: 1 },
  });
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-60', url: 'https://a.com', sortOrder: 0 }]);

  registerTabEventListeners(Promise.resolve());

  // Start debounce timers by firing URL changes
  chrome.tabs.onUpdated.__fire(60, { url: 'https://new1.com' }, { id: 60, windowId: 5, active: true });
  chrome.tabs.onUpdated.__fire(61, { url: 'https://new2.com' }, { id: 61, windowId: 5 });

  // Now close the window — should cancel timers and remove tabs
  chrome.windows.onRemoved.__fire(5);

  assert.equal(getLiveTabIndex().has(60), false, 'Tab 60 should be removed');
  assert.equal(getLiveTabIndex().has(61), false, 'Tab 61 should be removed');

  // Wait past debounce — should not error
  await new Promise((r) => setTimeout(r, 300));
});

/* =========================================================================
   15-17: TabClaims / buildLiveStates
   ========================================================================= */

test('B010-15: buildLiveStates returns live+active for a live active tab', async () => {
  resetAll();
  __setMockTabs([
    { id: 100, url: 'https://active.com', windowId: 1, active: true, audible: false, favIconUrl: 'https://active.com/fav.ico' },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-100', url: 'https://active.com', sortOrder: 0 }]);

  const items = [{ id: 'item-100' }];
  const states = buildLiveStates(items);

  assert.deepStrictEqual(states['item-100'], {
    live: true,
    active: true,
    audible: false,
    favIconUrl: 'https://active.com/fav.ico',
    tabId: 100,
  });
});

test('B010-16: buildLiveStates returns live+audible for non-active audible tab', async () => {
  resetAll();
  __setMockTabs([
    { id: 200, url: 'https://music.com', windowId: 1, active: false, audible: true },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-200', url: 'https://music.com', sortOrder: 0 }]);

  const items = [{ id: 'item-200' }];
  const states = buildLiveStates(items);

  assert.deepStrictEqual(states['item-200'], {
    live: true,
    active: false,
    audible: true,
    favIconUrl: null,
    tabId: 200,
  });
});

test('B010-17: buildLiveStates returns no-match entry for item with no matching tab', async () => {
  resetAll();
  __setMockTabs([
    { id: 300, url: 'https://other.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-nomatch', url: 'https://nomatch.com', sortOrder: 0 }]);

  const items = [{ id: 'item-nomatch' }];
  const states = buildLiveStates(items);

  assert.deepStrictEqual(states['item-nomatch'], {
    live: false,
    active: false,
    audible: false,
    favIconUrl: null,
  });
});
