/**
 * b184-floating-opener-inherit.test.js — B-184 Part 1
 *
 * Root cause (confirmed via real-browser diag, 2026-06-29): opening a link from
 * a FLOATING tab (a child previously inherited under a bookmark) does NOT
 * re-inherit — the new tab falls through to Open Tabs. `walkOpenerChain` only
 * recognizes CLAIMED bookmark openers (claimsMirror); floating tabs are
 * deliberately not claimed (B-125), so the opener isn't found, and the
 * openerMap chain to the bookmark ancestor is ephemeral (wiped on MV3 SW
 * restart). Fix: `resolveFloatingOpener` resolves a floating-member opener
 * directly from the floating records → the new tab inherits into the same
 * group under the same parent item.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { __resetMock, __setMockTabs } from './chrome-mock.js';
import {
  resolveFloatingOpener,
  __resetOpenerMap,
} from '../background/tabs/opener-chain.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import { appendFloatingGroup } from '../background/tabs/floating-groups.js';
import { readPartition, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';
import { __resetLiveTabIndex, buildLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';

function makeFloatingRecord(overrides) {
  return {
    floatingTabId: 'f-1',
    groupId: 'group-A',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 1,
    url: 'https://example.com/child',
    savedAt: 1,
    liveTabId: 30,
    sortOrder: 0,
    ...overrides,
  };
}

beforeEach(() => {
  __resetMock();
  __resetOpenerMap();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('B-184 T1: resolveFloatingOpener resolves a floating-member opener to its group + parent', () => {
  const records = [makeFloatingRecord({ liveTabId: 30, groupId: 'group-A', parentItemId: 'item-1' })];
  // a new tab was opened FROM tab 30 (the floating child)
  const result = resolveFloatingOpener(30, records);
  assert.ok(result, 'should resolve the floating opener');
  assert.equal(result.groupId, 'group-A');
  assert.equal(result.itemId, 'item-1');
});

test('B-184 T2: resolveFloatingOpener returns null when the opener is not a floating member', () => {
  const records = [makeFloatingRecord({ liveTabId: 30 })];
  assert.equal(resolveFloatingOpener(99, records), null);
});

test('B-184 T3: resolveFloatingOpener tolerates legacy itemId-only records (pre-B-121 shape)', () => {
  const records = [{ groupId: 'group-A', itemId: 'item-legacy', liveTabId: 40, windowId: 1, tabIndex: 0, url: 'x', savedAt: 1 }];
  const result = resolveFloatingOpener(40, records);
  assert.ok(result);
  assert.equal(result.groupId, 'group-A');
  assert.equal(result.itemId, 'item-legacy');
});

test('B-184 T4: resolveFloatingOpener returns null for a record missing groupId (ungrouped — Part 2 territory, not Part 1)', () => {
  const records = [makeFloatingRecord({ liveTabId: 30, groupId: '', parentItemId: 'item-1' })];
  assert.equal(resolveFloatingOpener(30, records), null);
});

test('B-184 T5: resolveFloatingOpener guards bad input (non-array, non-number)', () => {
  assert.equal(resolveFloatingOpener(30, null), null);
  assert.equal(resolveFloatingOpener(undefined, [makeFloatingRecord()]), null);
  assert.equal(resolveFloatingOpener(30, [null, undefined, 42]), null);
});

test('B-184 T6 (handler integration — the actual bug): firing onCreated from a floating opener creates a floating record under the same group/parent (not Open Tabs)', async () => {
  /* Seed: tab 30 is an existing FLOATING child under group-A / item-1. */
  await appendFloatingGroup({
    groupId: 'group-A',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 1,
    url: 'https://child.example/',
    savedAt: 1,
    liveTabId: 30,
    floatingTabId: 'f-30',
  });
  __setMockTabs([
    { id: 30, url: 'https://child.example/', windowId: 1, active: true, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  /* claimsMirror is empty (the floating opener is NOT claimed — B-125), so
     walkOpenerChain returns null and only the B-184 floating-opener fallback
     can rescue this. Fire the real onCreated listener for a new tab 31 opened
     from the floating tab 30. */
  registerTabEventListeners(Promise.resolve());
  globalThis.chrome.tabs.onCreated.__fire({
    id: 31,
    openerTabId: 30,
    url: 'https://grandchild.example/',
    windowId: 1,
    active: true,
    index: 2,
  });
  // Let the handler's fire-and-forget inheritance IIFE settle.
  await new Promise((r) => setTimeout(r, 300));

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  const grandchild = records.find((r) => r.liveTabId === 31);
  assert.ok(grandchild, 'B-184: tab opened from a floating opener must inherit (a new floating record), not fall through to Open Tabs');
  assert.equal(grandchild.groupId, 'group-A', 'inherits the opener floating record\'s group');
  assert.equal(grandchild.parentItemId, 'item-1', 'inherits under the same parent item');
});
