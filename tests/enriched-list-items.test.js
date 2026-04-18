import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setMockTabs, __setMockWindows, seedPartitions } from './chrome-mock.js';
import { buildLiveTabIndex, __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { reconcileClaims, buildLiveStates, __resetTabClaims } from '../background/tabs/tab-claims.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
/* B-014 */
import { initWindowOrdinals, __resetWindowOrdinals, getWindowMap } from '../background/tabs/window-ordinals.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { runMigrations, _resetMigrationStateForTest, _clearMigrationStepsForTest } from '../background/storage/migration.js';
import { MSG_LIST_ITEMS } from '../shared/messages.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  /* B-014 */
  __resetWindowOrdinals();
});

test('AC9: buildLiveStates returns {items, liveStates} shape with correct values', async () => {
  __setMockTabs([
    { id: 1, url: 'https://claimed.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'claimed-item', url: 'https://claimed.com', sortOrder: 0 },
    { id: 'unclaimed-item', url: 'https://noclaim.com', sortOrder: 1 },
  ];

  await reconcileClaims(items);

  const liveStates = buildLiveStates(items);

  // Claimed item should be live
  // B-014: `windowId` is widened into the live-state shape.
  assert.deepStrictEqual(liveStates['claimed-item'], {
    live: true,
    active: true,
    audible: false,
    favIconUrl: null,
    tabId: 1,
    windowId: 1,
  });

  // Unclaimed item should have all false
  assert.deepStrictEqual(liveStates['unclaimed-item'], {
    live: false,
    active: false,
    audible: false,
    favIconUrl: null,
  });
});

test('AC9: no live-state fields stored on Item objects in tj:items', async () => {
  const storedItems = [
    { id: 'item-1', url: 'https://example.com', title: 'Test', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
  ];
  seedPartitions({ items: storedItems });

  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: true },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims(storedItems);

  // Read items back from storage — they should NOT have live/active/audible fields
  const stored = await chrome.storage.local.get('tj:items');
  const item = stored['tj:items'][0];
  assert.equal(item.live, undefined, 'Item should not have a live field');
  assert.equal(item.active, undefined, 'Item should not have an active field');
  assert.equal(item.audible, undefined, 'Item should not have an audible field');
});

test('AC9: MSG_LIST_ITEMS dispatch returns enriched response', async () => {
  // This tests the contract at the buildLiveStates level.
  // The actual MSG_LIST_ITEMS handler in storage-handlers.js calls
  // buildLiveStates(items) and returns { items, liveStates }.
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: true },
    { id: 20, url: 'https://b.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'a', url: 'https://a.com', sortOrder: 0 },
    { id: 'b', url: 'https://b.com', sortOrder: 1 },
    { id: 'c', url: 'https://c.com', sortOrder: 2 },
  ];

  await reconcileClaims(items);
  const liveStates = buildLiveStates(items);

  // Simulate the MSG_LIST_ITEMS response shape
  const response = { items, liveStates };

  assert.ok(Array.isArray(response.items), 'items should be an array');
  assert.equal(typeof response.liveStates, 'object', 'liveStates should be an object');
  assert.equal(response.liveStates['a'].live, true);
  assert.equal(response.liveStates['a'].audible, true);
  assert.equal(response.liveStates['b'].live, true);
  assert.equal(response.liveStates['b'].active, true);
  assert.equal(response.liveStates['c'].live, false);
});

test('B-055 AC2: MSG_LIST_ITEMS enriched response includes openTabs array', async () => {
  // Two tabs: one claimed by a saved item, one unclaimed → the unclaimed one
  // must appear in `openTabs`; the claimed one must not.
  __setMockTabs([
    { id: 100, url: 'https://saved.com', title: 'Saved', windowId: 1, active: false, audible: false, index: 0, favIconUrl: 'https://saved.com/fav.ico' },
    { id: 200, url: 'https://untracked.com', title: 'Untracked', windowId: 1, active: true, audible: true, index: 1 },
  ]);
  await buildLiveTabIndex();
  const items = [{ id: 'saved-item', url: 'https://saved.com', sortOrder: 0 }];
  await reconcileClaims(items);

  const openTabs = buildOpenTabs();
  assert.ok(Array.isArray(openTabs), 'openTabs should be an array');
  assert.equal(openTabs.length, 1, 'exactly one unclaimed tab qualifies');
  assert.equal(openTabs[0].tabId, 200);
  assert.equal(openTabs[0].windowId, 1);
  assert.equal(openTabs[0].title, 'Untracked');
  assert.equal(openTabs[0].url, 'https://untracked.com');
  assert.equal(openTabs[0].audible, true);
  assert.equal(openTabs[0].active, true);
  assert.equal(openTabs[0].tabIndex, 1);
});

test('B-055 AC1: claimed tabs are excluded from openTabs', async () => {
  __setMockTabs([
    { id: 1, url: 'https://a.com', title: 'A', windowId: 1, active: false, audible: false, index: 0 },
    { id: 2, url: 'https://b.com', title: 'B', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  const items = [
    { id: 'a-item', url: 'https://a.com', sortOrder: 0 },
    { id: 'b-item', url: 'https://b.com', sortOrder: 1 },
  ];
  await reconcileClaims(items);

  const openTabs = buildOpenTabs();
  assert.equal(openTabs.length, 0, 'both tabs are claimed; openTabs empty');
});

test('B-055 AC2: openTabs is an empty array (never null) when no tabs qualify', async () => {
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  const openTabs = buildOpenTabs();
  assert.ok(Array.isArray(openTabs), 'openTabs must be an array even when empty');
  assert.equal(openTabs.length, 0);
});

test('B-055 AC9: openTabs sorted by (windowId asc, tabIndex asc)', async () => {
  __setMockTabs([
    { id: 3, url: 'https://w2-t2.com', title: 'w2-t2', windowId: 2, active: false, audible: false, index: 2 },
    { id: 1, url: 'https://w1-t0.com', title: 'w1-t0', windowId: 1, active: false, audible: false, index: 0 },
    { id: 4, url: 'https://w2-t0.com', title: 'w2-t0', windowId: 2, active: false, audible: false, index: 0 },
    { id: 2, url: 'https://w1-t1.com', title: 'w1-t1', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  const openTabs = buildOpenTabs();
  assert.deepStrictEqual(
    openTabs.map((t) => t.tabId),
    [1, 2, 4, 3],
    'rows must be sorted by windowId asc then tabIndex asc',
  );
});

test('B-055 C-3: openTabs is empty before claims reconcile (cold-start safety)', async () => {
  __setMockTabs([
    { id: 10, url: 'https://any.com', title: 'Any', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  // Intentionally skip reconcileClaims — claimsReady remains false.
  const openTabs = buildOpenTabs();
  assert.equal(openTabs.length, 0, 'openTabs must short-circuit to [] before claims are ready');
});

test('B-055: OpenTab shape carries title + favIconUrl from LiveTabIndex', async () => {
  __setMockTabs([
    { id: 42, url: 'https://example.com', title: 'Example Title', windowId: 3, active: false, audible: false, index: 5, favIconUrl: 'https://example.com/favicon.png' },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  const openTabs = buildOpenTabs();
  assert.equal(openTabs.length, 1);
  assert.equal(openTabs[0].title, 'Example Title', 'title propagated from LiveTabIndex');
  assert.equal(openTabs[0].favIconUrl, 'https://example.com/favicon.png');
  assert.equal(openTabs[0].windowId, 3);
  assert.equal(openTabs[0].tabIndex, 5);
});

test('B-055: OpenTab favIconUrl is null when LiveTabIndex entry has no favicon', async () => {
  __setMockTabs([
    { id: 7, url: 'https://nofav.com', title: 'No Fav', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  const [t] = buildOpenTabs();
  assert.equal(t.favIconUrl, null, 'empty favicon normalizes to null in the OpenTab shape');
});

/* =========================================================================
   B-014 — MSG_LIST_ITEMS response carries windowMap + widened liveStates.
   Exercised through the real storage-handlers dispatcher so the wire shape
   is validated end-to-end.
   ========================================================================= */

/** Helper: fire a message through the registered dispatcher and await the
 *  typed envelope. Mirrors the pattern used by broadcast.test.js. */
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

test('B-014 AC14: MSG_LIST_ITEMS response includes a windowMap field', async () => {
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  // Two windows open; tabs span both.
  __setMockWindows([{ id: 100 }, { id: 200 }]);
  __setMockTabs([
    { id: 10, url: 'https://a.com', title: 'A', windowId: 100, active: true, audible: false, index: 0 },
    { id: 20, url: 'https://b.com', title: 'B', windowId: 200, active: false, audible: false, index: 0 },
  ]);

  await buildLiveTabIndex();
  await initWindowOrdinals();
  await reconcileClaims([]);

  const resp = await sendMsg(MSG_LIST_ITEMS, {});
  assert.equal(resp.ok, true);
  assert.ok(resp.data.windowMap, 'windowMap must be present');
  assert.deepStrictEqual(
    resp.data.windowMap,
    { '100': 1, '200': 2 },
    'ordinals match ascending raw id',
  );
});

test('B-014 AC14: windowMap is {} (never null/undefined) when no windows tracked', async () => {
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  // Intentionally skip initWindowOrdinals → ordinalMap is empty.
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  const resp = await sendMsg(MSG_LIST_ITEMS, {});
  assert.equal(resp.ok, true);
  assert.deepStrictEqual(resp.data.windowMap, {}, 'empty map, not null');
  // getWindowMap() returns the same defensive-copy shape directly.
  assert.deepStrictEqual(getWindowMap(), {});
});

test('B-014 AC7: MSG_LIST_ITEMS response carries liveStates[].windowId for claimed items', async () => {
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const items = [{ id: 'item-claimed', url: 'https://claimed.test', title: 'C', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }];
  seedPartitions({ items });

  __setMockWindows([{ id: 42 }]);
  __setMockTabs([
    { id: 5, url: 'https://claimed.test', title: 'C', windowId: 42, active: true, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await initWindowOrdinals();
  await reconcileClaims(items);

  const resp = await sendMsg(MSG_LIST_ITEMS, {});
  assert.equal(resp.ok, true);
  const live = resp.data.liveStates['item-claimed'];
  assert.ok(live, 'live-state entry for the claimed item');
  assert.equal(live.live, true);
  assert.equal(live.tabId, 5);
  assert.equal(live.windowId, 42, 'B-014: widened liveStates carries the claim\'s windowId');
});

test('B-014: liveStates[].windowId is absent for unclaimed items', async () => {
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const items = [{ id: 'item-no-claim', url: 'https://no.claim', title: 'N', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }];
  seedPartitions({ items });
  __setMockTabs([]);
  await buildLiveTabIndex();
  await reconcileClaims(items);

  const resp = await sendMsg(MSG_LIST_ITEMS, {});
  assert.equal(resp.ok, true);
  const live = resp.data.liveStates['item-no-claim'];
  assert.equal(live.live, false);
  assert.equal(live.windowId, undefined, 'windowId absent when no claim');
});
