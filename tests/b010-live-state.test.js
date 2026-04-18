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
   B-014 — window-event wiring (tab-events.js → window-ordinals.js → broadcast)
   ========================================================================= */

test('B-014: chrome.windows.onCreated registers the window and broadcasts SCOPE.WINDOW_MAP', async () => {
  const { __resetWindowOrdinals, getWindowOrdinal } = await import('../background/tabs/window-ordinals.js');
  resetAll();
  __resetWindowOrdinals();
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  __getSendMessageCalls().length = 0;
  chrome.windows.onCreated.__fire({ id: 555 });

  // Ordinal assigned
  assert.equal(getWindowOrdinal(555), 1, 'new window gets W1');

  // Broadcast fired with SCOPE.WINDOW_MAP + trigger window/created
  const calls = __getSendMessageCalls();
  const match = calls.find((c) => c[0]?.payload?.scope === 'windowMap' && c[0]?.payload?.trigger === 'window/created');
  assert.ok(match, 'windowMap broadcast with window/created trigger');
});

test('B-014: chrome.windows.onRemoved unregisters the window and broadcasts SCOPE.WINDOW_MAP', async () => {
  const { __resetWindowOrdinals, registerWindow, getWindowOrdinal } = await import('../background/tabs/window-ordinals.js');
  resetAll();
  __resetWindowOrdinals();
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  // Pre-seed two windows so onRemoved has something to clean up.
  registerWindow(1001);
  registerWindow(1002);
  assert.equal(getWindowOrdinal(1001), 1);
  assert.equal(getWindowOrdinal(1002), 2);

  __getSendMessageCalls().length = 0;
  chrome.windows.onRemoved.__fire(1001);

  assert.equal(getWindowOrdinal(1001), undefined, 'closed window removed from map');
  assert.equal(getWindowOrdinal(1002), 2, 'surviving ordinal unchanged — gap preserved');

  const calls = __getSendMessageCalls();
  const match = calls.find((c) => c[0]?.payload?.scope === 'windowMap' && c[0]?.payload?.trigger === 'window/removed');
  assert.ok(match, 'windowMap broadcast with window/removed trigger');
});

/* =========================================================================
   B-014 H-3 / AC13 — chrome.tabs.onAttached wiring
   Chrome fires onDetached then onAttached (NOT onUpdated) when a user drags a
   tab between windows. These tests guarantee LiveTabIndex is patched and both
   LIVE_STATE + WINDOW_MAP broadcasts fire in the correct order.
   ========================================================================= */

test('B-014 H-3: tabs.onAttached patches LiveTabIndex windowId and index', async () => {
  resetAll();
  __setMockTabs([
    { id: 700, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  // Simulate a drag from window 10 → window 20. Chrome does NOT fire
  // onUpdated for this motion.
  chrome.tabs.onDetached.__fire(700, { oldWindowId: 10, oldPosition: 3 });
  chrome.tabs.onAttached.__fire(700, { newWindowId: 20, newPosition: 0 });

  const entry = getLiveTabIndex().get(700);
  assert.equal(entry.windowId, 20, 'windowId updated to new window');
  assert.equal(entry.index, 0, 'index updated to new position');
});

test('B-014 H-3: tabs.onAttached broadcasts LIVE_STATE first, then WINDOW_MAP', async () => {
  resetAll();
  __setMockTabs([
    { id: 701, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  // reconcileClaims completes so claimsReady is true (LIVE_STATE broadcast is
  // gated on requireClaimsReady).
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());
  __getSendMessageCalls().length = 0;

  chrome.tabs.onAttached.__fire(701, { newWindowId: 20, newPosition: 1 });

  const calls = __getSendMessageCalls();
  const liveIdx = calls.findIndex((c) => c[0]?.payload?.scope === 'liveState' && c[0]?.payload?.trigger === 'tab/attached');
  const mapIdx = calls.findIndex((c) => c[0]?.payload?.scope === 'windowMap' && c[0]?.payload?.trigger === 'tab/attached');
  assert.ok(liveIdx >= 0, 'liveState broadcast fired with tab/attached trigger');
  assert.ok(mapIdx >= 0, 'windowMap broadcast fired with tab/attached trigger');
  assert.ok(liveIdx < mapIdx, 'liveState broadcast precedes windowMap broadcast (R2 §28.3.7 ordering)');
});

test('B-014 H-3: onAttached LIVE_STATE broadcast is suppressed when claims not ready (cold start)', async () => {
  resetAll();
  __setMockTabs([
    { id: 702, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  // Intentionally DO NOT reconcile claims — claimsReady remains false.

  registerTabEventListeners(Promise.resolve());
  __getSendMessageCalls().length = 0;

  chrome.tabs.onAttached.__fire(702, { newWindowId: 20, newPosition: 0 });

  const calls = __getSendMessageCalls();
  const live = calls.find((c) => c[0]?.payload?.scope === 'liveState' && c[0]?.payload?.trigger === 'tab/attached');
  const map = calls.find((c) => c[0]?.payload?.scope === 'windowMap' && c[0]?.payload?.trigger === 'tab/attached');
  assert.equal(live, undefined, 'LIVE_STATE broadcast suppressed (requireClaimsReady gate)');
  assert.ok(map, 'WINDOW_MAP broadcast still fires (no claimsReady gate per §28.3.7)');
  // LiveTabIndex is patched regardless — correctness of in-memory state is
  // not conditional on claims readiness.
  assert.equal(getLiveTabIndex().get(702).windowId, 20, 'LiveTabIndex patched even with claims not ready');
});

test('B-014 H-3: onDetached is transitional — leaves LiveTabIndex unchanged', async () => {
  resetAll();
  __setMockTabs([
    { id: 703, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());

  const before = { ...getLiveTabIndex().get(703) };
  chrome.tabs.onDetached.__fire(703, { oldWindowId: 10, oldPosition: 5 });
  const after = getLiveTabIndex().get(703);
  assert.deepStrictEqual(after, before, 'onDetached leaves LiveTabIndex entry unchanged');
});

test('B-014 H-3: multiple rapid onAttached events are all processed', async () => {
  // A user drags tab A from W1 → W2 → W3 in quick succession (onAttached fires
  // twice, each time authoritative for the latest windowId). Both patches must
  // land, the final windowId must be W3, and each attach must emit its own
  // LIVE_STATE + WINDOW_MAP broadcast pair.
  resetAll();
  __setMockTabs([
    { id: 704, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());
  __getSendMessageCalls().length = 0;

  chrome.tabs.onAttached.__fire(704, { newWindowId: 20, newPosition: 3 });
  chrome.tabs.onAttached.__fire(704, { newWindowId: 30, newPosition: 0 });

  const entry = getLiveTabIndex().get(704);
  assert.equal(entry.windowId, 30, 'final windowId reflects the last attach');
  assert.equal(entry.index, 0, 'final index reflects the last attach');

  // Each onAttached must emit its own broadcast pair (2 LIVE_STATE + 2 WINDOW_MAP).
  const calls = __getSendMessageCalls();
  const liveStates = calls.filter(
    (c) => c[0]?.payload?.scope === 'liveState' && c[0]?.payload?.trigger === 'tab/attached',
  );
  const windowMaps = calls.filter(
    (c) => c[0]?.payload?.scope === 'windowMap' && c[0]?.payload?.trigger === 'tab/attached',
  );
  assert.equal(liveStates.length, 2, 'two LIVE_STATE broadcasts (one per attach)');
  assert.equal(windowMaps.length, 2, 'two WINDOW_MAP broadcasts (one per attach)');
});

test('B-014 H-3: onAttached with missing newPosition still patches windowId', async () => {
  // Defensive: Chrome contract guarantees newPosition, but the handler must
  // tolerate its absence rather than corrupt the LiveTabIndex entry.
  resetAll();
  __setMockTabs([
    { id: 705, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 7 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());
  chrome.tabs.onAttached.__fire(705, { newWindowId: 20 }); // no newPosition

  const entry = getLiveTabIndex().get(705);
  assert.equal(entry.windowId, 20, 'windowId still patched');
  assert.equal(entry.index, 7, 'index untouched when newPosition absent');
});

test('B-014 H-3: onAttached with malformed attachInfo is a no-op', async () => {
  resetAll();
  __setMockTabs([
    { id: 706, url: 'https://dragme.com', windowId: 10, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  registerTabEventListeners(Promise.resolve());
  const before = { ...getLiveTabIndex().get(706) };

  // Missing newWindowId or wrong type — handler bails without patching.
  chrome.tabs.onAttached.__fire(706, {});
  chrome.tabs.onAttached.__fire(706, null);
  chrome.tabs.onAttached.__fire(706, { newWindowId: '20' });

  const after = getLiveTabIndex().get(706);
  assert.deepStrictEqual(after, before, 'malformed attachInfo does not mutate entry');
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

  // B-014: `windowId` is widened into the live-state shape so sidepanel can
  // render the cross-window badge without a second round-trip.
  assert.deepStrictEqual(states['item-100'], {
    live: true,
    active: true,
    audible: false,
    favIconUrl: 'https://active.com/fav.ico',
    tabId: 100,
    windowId: 1,
  });
});

test('B010-16: buildLiveStates returns live+audible for non-active audible tab', async () => {
  resetAll();
  __setMockTabs([
    { id: 200, url: 'https://music.com', windowId: 7, active: false, audible: true },
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
    windowId: 7,
  });
});

/* B-014: verify `windowId` is absent from the live-state shape when an item
   has no claim. Complements B010-17. */
test('B010-17b: buildLiveStates entry for unclaimed item has no windowId field', async () => {
  resetAll();
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  const items = [{ id: 'nobody' }];
  const states = buildLiveStates(items);
  assert.equal(states['nobody'].windowId, undefined, 'B-014: windowId absent when live === false');
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
