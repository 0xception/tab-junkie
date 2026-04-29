/**
 * b013-opener-chain.test.js — B-013 AC1–AC10
 * Opener-chain group inheritance: openerMap, walkOpenerChain, appendFloatingGroup.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __getRawStore,
  __setMockTabs,
} from './chrome-mock.js';
import { __resetLiveTabIndex, updateTabEntry, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import {
  recordOpener,
  pruneOpener,
  pruneOpenersByWindow,
  walkOpenerChain,
  __resetOpenerMap,
} from '../background/tabs/opener-chain.js';
import { appendFloatingGroup } from '../background/tabs/floating-groups.js';
import { readPartition, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';

// ── Helper factories ──────────────────────────────────────────────────────────

function makeItem(id, groupId) {
  return { id, groupId: groupId ?? null, title: 'Test', url: 'https://example.com', sortOrder: 0, createdAt: 1, updatedAt: 1 };
}

function makeGroup(id) {
  return { id, name: 'Group ' + id, color: 'blue', parentId: null, sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1 };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  __resetOpenerMap();
});

// ── AC1: new tab inherits group via appendFloatingGroup ───────────────────────

test('AC1: walkOpenerChain returns groupId and itemId for a grouped claimed ancestor', () => {
  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = { 'item-1': 10 }; // item-1 is open in tab 10

  // tab 20 was opened from tab 10
  recordOpener(20, 10);

  const result = walkOpenerChain(20, claimsMirror, items);
  assert.ok(result, 'should return a result');
  assert.equal(result.groupId, 'group-A');
  assert.equal(result.itemId, 'item-1');
});

test('AC1: appendFloatingGroup writes entry with correct groupId and parentItemId (B-121 schema v2)', async () => {
  const entry = {
    groupId: 'group-A',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 2,
    url: 'https://example.com/new',
    savedAt: Date.now(),
  };
  await appendFloatingGroup(entry);

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 1);
  assert.equal(records[0].groupId, 'group-A');
  assert.equal(records[0].parentItemId, 'item-1');
  assert.equal(records[0].windowId, 1);
  assert.equal(records[0].tabIndex, 2);
  /* B-121 §60.4: appendFloatingGroup auto-stamps a synthetic floatingTabId
     (ulid). The storage identity is decoupled from the parent itemId so
     the cold-start re-association path cannot overwrite the parent's
     claim (§58.4(i) defect). */
  assert.equal(typeof records[0].floatingTabId, 'string');
  assert.ok(records[0].floatingTabId.length > 0);
});

// ── AC2: hop limit ────────────────────────────────────────────────────────────

test('AC2: walkOpenerChain stops at maxHops=3 even when chain is longer', () => {
  // chain: tab 5 <- tab 4 <- tab 3 <- tab 2 <- tab 1 (item-1, group-A)
  recordOpener(5, 4);
  recordOpener(4, 3);
  recordOpener(3, 2);
  recordOpener(2, 1);

  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = { 'item-1': 1 }; // tab 1 is claimed

  // From tab 5: hops needed = 4 (5→4→3→2→1) — exceeds maxHops=3
  const result = walkOpenerChain(5, claimsMirror, items, 3);
  assert.equal(result, null, 'should return null when chain exceeds maxHops');
});

test('AC2: walkOpenerChain succeeds when chain fits within maxHops', () => {
  // chain: tab 4 <- tab 3 <- tab 2 <- tab 1 (item-1, group-A) — 3 hops
  recordOpener(4, 3);
  recordOpener(3, 2);
  recordOpener(2, 1);

  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = { 'item-1': 1 };

  const result = walkOpenerChain(4, claimsMirror, items, 3);
  assert.ok(result, 'should find item within 3 hops');
  assert.equal(result.groupId, 'group-A');
});

// ── AC3: cycle guard ──────────────────────────────────────────────────────────

test('AC3: cycle in openerMap does not infinite-loop', () => {
  // Create a cycle: 10 -> 11 -> 10 (circular)
  recordOpener(10, 11);
  recordOpener(11, 10);

  const items = [makeItem('item-x', 'group-X')];
  // Neither tab is claimed — walk will hit the cycle guard
  const claimsMirror = {};

  // Must return without throwing/hanging
  const result = walkOpenerChain(10, claimsMirror, items);
  assert.equal(result, null);
});

test('AC3: cycle guard does not consume the hop budget unexpectedly', () => {
  // tab 20 -> tab 21 -> tab 22 -> tab 21 (cycle at 21->22->21)
  recordOpener(20, 21);
  recordOpener(21, 22);
  recordOpener(22, 21); // cycle

  const items = [makeItem('item-y', 'group-Y')];
  const claimsMirror = { 'item-y': 99 }; // tab 99 is not in the chain

  const result = walkOpenerChain(20, claimsMirror, items);
  assert.equal(result, null, 'cycle should be broken by visited-set guard');
});

// ── AC4: no openerTabId → no floating-group written ──────────────────────────

test('AC4: walkOpenerChain returns null when tab has no opener', () => {
  // tab 30 has no entry in openerMap
  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = { 'item-1': 10 };

  const result = walkOpenerChain(30, claimsMirror, items);
  assert.equal(result, null);
});

// ── AC5: opener tab not claimed → null ───────────────────────────────────────

test('AC5: walkOpenerChain returns null when opener is not in any claim', () => {
  recordOpener(50, 49); // tab 50 opened from tab 49
  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = {}; // tab 49 is not claimed

  const result = walkOpenerChain(50, claimsMirror, items);
  assert.equal(result, null);
});

// ── AC6: opener claimed but groupId is null → null ───────────────────────────

test('AC6: walkOpenerChain returns null when claimed ancestor has groupId=null', () => {
  recordOpener(60, 59);
  const items = [makeItem('item-2', null)]; // ungrouped
  const claimsMirror = { 'item-2': 59 };

  const result = walkOpenerChain(60, claimsMirror, items);
  assert.equal(result, null, 'ungrouped item should not trigger inheritance');
});

// ── AC7: pruneOpener and pruneOpenersByWindow ─────────────────────────────────

test('AC7: pruneOpener removes a tab from the openerMap', () => {
  recordOpener(70, 69);
  pruneOpener(70);

  // After pruning, walkOpenerChain should find no opener
  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = { 'item-1': 69 };
  const result = walkOpenerChain(70, claimsMirror, items);
  assert.equal(result, null, 'pruned tab should have no opener entry');
});

test('AC7: pruneOpenersByWindow removes all listed tabs', () => {
  recordOpener(80, 79);
  recordOpener(81, 79);
  recordOpener(82, 79);

  pruneOpenersByWindow([80, 81, 82]);

  const items = [makeItem('item-1', 'group-A')];
  const claimsMirror = { 'item-1': 79 };

  assert.equal(walkOpenerChain(80, claimsMirror, items), null);
  assert.equal(walkOpenerChain(81, claimsMirror, items), null);
  assert.equal(walkOpenerChain(82, claimsMirror, items), null);
});

test('AC7: pruneOpenersByWindow is a no-op for tabs not in the map', () => {
  // Should not throw for tabs that were never recorded
  assert.doesNotThrow(() => pruneOpenersByWindow([999, 1000, 1001]));
});

// ── AC8: openerMap cap at 512 ─────────────────────────────────────────────────

test('AC8: recordOpener is a no-op when map is at MAX_OPENER_MAP_ENTRIES (512)', () => {
  // Fill map to 512 entries
  for (let i = 0; i < 512; i++) {
    recordOpener(i + 1, i); // tabId i+1 opened from tabId i
  }

  // The 513th call should be silently rejected
  recordOpener(5000, 4999);

  // tab 5000 should NOT be in the map — walk returns null
  const items = [makeItem('item-x', 'group-X')];
  const claimsMirror = { 'item-x': 4999 };
  const result = walkOpenerChain(5000, claimsMirror, items);
  assert.equal(result, null, '513th entry should not have been recorded');
});

// ── AC9: appendFloatingGroup validation ──────────────────────────────────────

test('AC9: appendFloatingGroup rejects entry missing parentItemId / itemId', async () => {
  await appendFloatingGroup({
    groupId: 'g-1',
    // parentItemId intentionally omitted
    windowId: 1,
    tabIndex: 0,
    url: 'https://example.com',
    savedAt: Date.now(),
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 0, 'entry without parentItemId/itemId should be rejected');
});

test('AC9: appendFloatingGroup rejects entry with empty parentItemId', async () => {
  await appendFloatingGroup({
    groupId: 'g-1',
    parentItemId: '',
    windowId: 1,
    tabIndex: 0,
    url: 'https://example.com',
    savedAt: Date.now(),
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 0, 'entry with empty parentItemId should be rejected');
});

test('AC9: appendFloatingGroup rejects entry missing savedAt', async () => {
  await appendFloatingGroup({
    groupId: 'g-1',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 0,
    url: 'https://example.com',
    // savedAt intentionally omitted
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 0, 'entry without savedAt should be rejected');
});

test('AC9: appendFloatingGroup rejects entry with non-finite savedAt', async () => {
  await appendFloatingGroup({
    groupId: 'g-1',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 0,
    url: 'https://example.com',
    savedAt: NaN,
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 0, 'entry with NaN savedAt should be rejected');
});

// ── AC10: tab removed before async gap resolves ───────────────────────────────

test('AC10: no floating-group written if tab is removed from LiveTabIndex before IIFE resumes', async () => {
  // Seed the live tab index with a tab
  updateTabEntry(90, { url: 'https://new-tab.com', windowId: 1, active: true, audible: false, index: 5, favIconUrl: '' });
  assert.ok(getLiveTabIndex().has(90), 'tab 90 should be in live index');

  // Remove the tab to simulate it being closed before the async gap resolves
  const { removeTabEntry } = await import('../background/tabs/live-tab-index.js');
  removeTabEntry(90);
  assert.ok(!getLiveTabIndex().has(90), 'tab 90 should be removed from live index');

  // Simulate what the IIFE does: check liveEntry, bail if missing
  const liveEntry = getLiveTabIndex().get(90);
  if (!liveEntry) {
    // Tab was removed — do NOT write floating group
  } else {
    // Would normally call appendFloatingGroup here
    await appendFloatingGroup({
      groupId: 'group-A',
      parentItemId: 'item-1',
      windowId: liveEntry.windowId,
      tabIndex: liveEntry.index ?? 0,
      url: liveEntry.url,
      savedAt: Date.now(),
    });
  }

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 0, 'no floating-group entry should be written for a removed tab');
});

// ── Integration: walkOpenerChain with multi-hop chain ────────────────────────

test('integration: 2-hop chain finds grouped ancestor', () => {
  // tab 100 <- tab 101 <- tab 102
  recordOpener(102, 101);
  recordOpener(101, 100);

  const items = [makeItem('item-root', 'group-Z')];
  const claimsMirror = { 'item-root': 100 };

  const result = walkOpenerChain(102, claimsMirror, items);
  assert.ok(result);
  assert.equal(result.groupId, 'group-Z');
  assert.equal(result.itemId, 'item-root');
});

test('integration: walkOpenerChain prefers nearest ancestor when multiple are grouped', () => {
  // tab 200 <- tab 201 <- tab 202; both 200 (group-far) and 201 (group-near) claimed
  recordOpener(202, 201);
  recordOpener(201, 200);

  const items = [
    makeItem('item-far', 'group-far'),
    makeItem('item-near', 'group-near'),
  ];
  const claimsMirror = {
    'item-far': 200,
    'item-near': 201,
  };

  const result = walkOpenerChain(202, claimsMirror, items);
  assert.ok(result);
  assert.equal(result.groupId, 'group-near', 'should use nearest (1-hop) grouped ancestor');
});
