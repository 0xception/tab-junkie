/**
 * b186-livetab-index-renumber.test.js — B-186 R5 (Sprint 48)
 *
 * Regression coverage for the Open-Tabs "row jumps up on activate" bug.
 *
 * Root cause (confirmed): when Chrome closes ONE tab it shifts every tab to the
 * right of the closed slot down by one strip position, but fires NO
 * `chrome.tabs.onMoved` for that implicit shift. The onRemoved cascade only
 * `delete`d the closed tab's `LiveTabIndex` entry and left every survivor's
 * `index` stale. `buildOpenTabs` sorts by `(windowId, tabIndex)`, so the stale
 * indices scrambled the Open Tabs rows on the next re-render (activation, new
 * tab, further close, …).
 *
 * Fix: on a genuine SINGLE-tab close, `renumberAfterRemoval(windowId, index)`
 * decrements `index` for every same-window survivor above the closed slot,
 * mirroring Chrome's shift-down. Wired into the `chrome.tabs.onRemoved` handler
 * (which owns the `removeInfo.isWindowClosing` signal), NOT into the shared
 * `removeTabEntry` primitive, so window-close teardown (handled en masse by
 * `removeTabsByWindow`) is not churned.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  getLiveTabIndex,
  removeTabEntry,
  renumberAfterRemoval,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   1. renumberAfterRemoval — unit behavior
   ========================================================================= */

test('B-186 unit: mid-window close decrements same-window entries above the slot; entries below untouched', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 1, active: false, audible: false, index: 2 },
    { id: 13, url: 'https://d.com', windowId: 1, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();

  // Simulate closing the tab at index 1 (tabId 11): delete its entry, then
  // renumber the survivors above the freed slot (the handler's exact order).
  removeTabEntry(11);
  renumberAfterRemoval(1, 1);

  const idx = getLiveTabIndex();
  assert.equal(idx.get(10).index, 0, 'entry below the slot is untouched');
  assert.equal(idx.get(12).index, 1, 'entry that was index 2 shifts down to 1');
  assert.equal(idx.get(13).index, 2, 'entry that was index 3 shifts down to 2');
  assert.equal(idx.has(11), false, 'closed tab entry removed');
});

test('B-186 unit: other windows are completely untouched by a renumber', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 1, active: false, audible: false, index: 2 },
    { id: 20, url: 'https://x.com', windowId: 2, active: false, audible: false, index: 0 },
    { id: 21, url: 'https://y.com', windowId: 2, active: false, audible: false, index: 1 },
    { id: 22, url: 'https://z.com', windowId: 2, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  removeTabEntry(11);
  renumberAfterRemoval(1, 1);

  const idx = getLiveTabIndex();
  // Window 1 above the slot shifted.
  assert.equal(idx.get(12).index, 1, 'window 1 survivor above slot shifted down');
  // Window 2 is entirely untouched — same windowId guard.
  assert.equal(idx.get(20).index, 0, 'window 2 index 0 untouched');
  assert.equal(idx.get(21).index, 1, 'window 2 index 1 untouched');
  assert.equal(idx.get(22).index, 2, 'window 2 index 2 untouched');
});

test('B-186 unit: closing the last (highest-index) tab renumbers nothing', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  removeTabEntry(12);
  renumberAfterRemoval(1, 2); // no entry has index > 2

  const idx = getLiveTabIndex();
  assert.equal(idx.get(10).index, 0, 'index 0 unchanged');
  assert.equal(idx.get(11).index, 1, 'index 1 unchanged');
});

test('B-186 unit: closing the only tab in a window renumbers nothing and does not error', async () => {
  __setMockTabs([
    { id: 30, url: 'https://solo.com', windowId: 3, active: false, audible: false, index: 0 },
    { id: 40, url: 'https://other.com', windowId: 4, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  removeTabEntry(30);
  renumberAfterRemoval(3, 0); // window 3 now empty; window 4 must be untouched

  const idx = getLiveTabIndex();
  assert.equal(idx.has(30), false, 'solo tab removed');
  assert.equal(idx.get(40).index, 0, 'unrelated window untouched');
});

test('B-186 unit: renumberAfterRemoval ignores non-numeric args (defensive no-op)', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  renumberAfterRemoval(undefined, 0);
  renumberAfterRemoval(1, undefined);

  const idx = getLiveTabIndex();
  assert.equal(idx.get(10).index, 0, 'no mutation on bad windowId');
  assert.equal(idx.get(11).index, 1, 'no mutation on bad removedIndex');
});

/* =========================================================================
   2. chrome.tabs.onRemoved handler — window-close guard
   ========================================================================= */

test('B-186 guard: onRemoved with isWindowClosing does NOT renumber survivors (churn avoided)', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  registerTabEventListeners(Promise.resolve());

  // Window-teardown per-tab close: Chrome fires onRemoved with
  // isWindowClosing:true BEFORE windows.onRemoved. Renumber must be skipped.
  chrome.tabs.onRemoved.__fire(11, { isWindowClosing: true });

  const idx = getLiveTabIndex();
  assert.equal(idx.has(11), false, 'closed entry still removed by cascade');
  assert.equal(idx.get(12).index, 2, 'survivor NOT renumbered during window close');

  // Flush the fire-and-forget cascade tail (release/prune) before the block ends.
  await new Promise((r) => setTimeout(r, 20));
});

test('B-186 guard: full window-close sequence (per-tab isWindowClosing + windows.onRemoved) clears the window without error', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 5, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 5, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 5, active: false, audible: false, index: 2 },
    { id: 99, url: 'https://keep.com', windowId: 9, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  registerTabEventListeners(Promise.resolve());

  // Chrome order: per-tab onRemoved (isWindowClosing) first, then windows.onRemoved.
  chrome.tabs.onRemoved.__fire(10, { isWindowClosing: true });
  chrome.tabs.onRemoved.__fire(11, { isWindowClosing: true });
  chrome.tabs.onRemoved.__fire(12, { isWindowClosing: true });
  chrome.windows.onRemoved.__fire(5);

  const idx = getLiveTabIndex();
  assert.equal(idx.has(10), false, 'window-5 tab removed');
  assert.equal(idx.has(11), false, 'window-5 tab removed');
  assert.equal(idx.has(12), false, 'window-5 tab removed');
  assert.equal(idx.get(99).index, 0, 'unrelated window survives untouched');

  await new Promise((r) => setTimeout(r, 20));
});

/* =========================================================================
   3. Integration — buildOpenTabs order/index stable after a single close
   (the actual user-facing contract)
   ========================================================================= */

test('B-186 integration: single close through onRemoved keeps buildOpenTabs indices contiguous (no scramble)', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 1, active: false, audible: false, index: 2 },
    { id: 13, url: 'https://d.com', windowId: 1, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]); // no claims → every tab qualifies as an open tab
  registerTabEventListeners(Promise.resolve());

  // Baseline order/indices.
  let open = buildOpenTabs();
  assert.deepStrictEqual(open.map((t) => t.tabId), [10, 11, 12, 13], 'baseline order');
  assert.deepStrictEqual(open.map((t) => t.tabIndex), [0, 1, 2, 3], 'baseline indices');

  // Close the middle tab (index 1) — a genuine single-tab close.
  chrome.tabs.onRemoved.__fire(11, { isWindowClosing: false });

  open = buildOpenTabs();
  assert.deepStrictEqual(open.map((t) => t.tabId), [10, 12, 13], 'survivors in stable order');
  // RED without the fix: survivors keep stale indices [0, 2, 3].
  assert.deepStrictEqual(
    open.map((t) => t.tabIndex),
    [0, 1, 2],
    'survivor tabIndex renumbered to mirror Chrome strip (contiguous, no gap)',
  );

  await new Promise((r) => setTimeout(r, 20));
});

test('B-186 integration: close-then-append does not collide indices (compounding scramble guard)', async () => {
  __setMockTabs([
    { id: 10, url: 'https://a.com', windowId: 1, active: false, audible: false, index: 0 },
    { id: 11, url: 'https://b.com', windowId: 1, active: false, audible: false, index: 1 },
    { id: 12, url: 'https://c.com', windowId: 1, active: false, audible: false, index: 2 },
    { id: 13, url: 'https://d.com', windowId: 1, active: false, audible: false, index: 3 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);
  registerTabEventListeners(Promise.resolve());

  // Close index 1. Real strip is now length 3 (indices 0,1,2).
  chrome.tabs.onRemoved.__fire(11, { isWindowClosing: false });

  // User opens a new tab appended at the END. Chrome reports index 3 (the
  // count of the re-numbered strip). Without the close-renumber, tabId 13 is
  // still stale at index 3 and would COLLIDE with the new tab.
  chrome.tabs.onCreated.__fire({ id: 14, url: 'https://new.com', windowId: 1, active: false, index: 3 });

  const open = buildOpenTabs();
  const indices = open.map((t) => t.tabIndex);
  assert.deepStrictEqual(open.map((t) => t.tabId), [10, 12, 13, 14], 'append keeps stable order');
  assert.deepStrictEqual(indices, [0, 1, 2, 3], 'indices contiguous — no collision at the appended slot');
  // Explicit no-duplicate assertion (the collision symptom).
  assert.equal(new Set(indices).size, indices.length, 'no two open tabs share a tabIndex');

  await new Promise((r) => setTimeout(r, 20));
});
