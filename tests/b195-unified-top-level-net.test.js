/**
 * b195-unified-top-level-net.test.js — B-195 (Sprint 48, B-194 render bundle)
 *
 * THE A0 SAFETY NET for the unified top-level region. Its job is to be GREEN
 * against CURRENT (pre-B-196 / pre-B-197) code so the B-196 render-merge and the
 * B-197 top-level-floating refactor can be verified against a passing baseline —
 * the same role b174-* played for the B-173 single-source-of-truth epic and
 * b187-render-order-parity played for the §77 Tier-A work.
 *
 * WHAT THIS NET ASSERTS (behaviour-preserving invariants that hold BOTH today
 * AND after the merge — NOT the post-merge DOM structure):
 *   1. Content completeness / single-sourcing — every live browser tab is
 *      classified into EXACTLY ONE of {claimed-saved, floating, loose}. No tab
 *      is dropped; none is double-counted. This partition property survives the
 *      B-196 render merge AND the B-197 floating-under-ungrouped enablement
 *      (B-197 only moves F3 from the loose bucket to the floating bucket — it
 *      stays a partition).
 *   2. Relative order — the ungrouped head orders by renderOrder / sortOrder
 *      (resolveRenderOrder); the loose tail orders by (windowId asc, tabIndex
 *      asc) (buildOpenTabs). Both orderings are what B-196 must preserve.
 *   3. Single-sourced floating resolution — a tab that resolves as a floating
 *      member (buildFloatingMembers) is excluded from the loose tail via the one
 *      floatingTabIds set (mutual exclusion), and a NAMED-group floating member
 *      keys under its parent groupId through the one resolver path.
 *
 * WHAT IS DEFERRED (only true AFTER the merge → marked, never asserted RED):
 *   - B-197-EXTEND: floating-under-ungrouped (F3). TODAY buildFloatingMembers
 *     skips a floating record whose PARENT is ungrouped (floating-members.js:94),
 *     so F3's tab leaks into the loose tail and resolveFloatingOpener /
 *     walkOpenerChain do not anchor it at the top level. These tests assert the
 *     TODAY baseline with an explicit B-197-EXTEND comment describing the flip.
 *   - B-186-GATE: the loose-tail survivor-renumber on single-tab close. B-186
 *     (renumberAfterRemoval, live-tab-index.js:112) HAS landed this sprint, so
 *     the gate is satisfied and the test asserts green.
 *
 * Fixture-contract note (design/79-b-194-render-merge-r2.md §79.9 + §79.1.3):
 * the tj:floatingGroups validator (shapes.js:361) REQUIRES a non-empty STRING
 * groupId and REJECTS null/absent. The floating-under-ungrouped record (F3) is
 * therefore seeded with groupId:'__toplevel__' (the §79.3 sentinel), NOT
 * groupId:null. The TODAY skip is on the PARENT's groupId === null, independent
 * of the record's own groupId — so the '__toplevel__'-seeded record is still
 * correctly skipped today (parent ungrouped) and validates cleanly.
 *
 * All chrome API interaction goes through tests/chrome-mock.js — no ad-hoc stubs.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  __setMockWindows,
  seedPartitions,
} from './chrome-mock.js';
import {
  __resetLiveTabIndex,
  buildLiveTabIndex,
  getLiveTabIndex,
  removeTabEntry,
  renumberAfterRemoval,
} from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  reconcileClaims,
  getClaimedTabIds,
} from '../background/tabs/tab-claims.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import {
  buildFloatingMembers,
  collectFloatingTabIds,
} from '../background/tabs/floating-members.js';
import {
  resolveFloatingOpener,
  walkOpenerChain,
  recordOpener,
  __resetOpenerMap,
} from '../background/tabs/opener-chain.js';
import { resolveRenderOrder } from '../shared/render-order.js';
import {
  readPartition,
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_FLOATING_GROUPS,
} from '../background/storage/partitions.js';

/* =========================================================================
   Realistic factories (drifted / audible / grouped states available)
   ========================================================================= */

const NOW = 1_000_000;

function item(id, groupId, sortOrder, url) {
  return { id, title: `Title ${id}`, url, groupId, sortOrder, createdAt: NOW, updatedAt: NOW };
}
function group(id, sortOrder = 0) {
  return {
    id, name: `Group ${id}`, color: 'blue', parentId: null,
    sortOrder, collapsed: false, createdAt: NOW, updatedAt: NOW,
  };
}
function floatingRecord(overrides) {
  return {
    floatingTabId: 'float', groupId: 'g1', parentItemId: '',
    windowId: 1, tabIndex: 0, url: '', savedAt: NOW, ...overrides,
  };
}
function tab(id, url, index, extra = {}) {
  return { id, url, windowId: 1, active: false, audible: false, index, ...extra };
}

/* --- The six B-195 fixture states (F1–F6) + two floating anchors ---------

   F1 — saved-ungrouped dormant   (tj:items, groupId:null, no live tab)
   F2 — saved-ungrouped claimed   (tj:items, groupId:null, live tab 2002)
   F3 — floating-under-ungrouped  (tj:floatingGroups, parent=F1 ungrouped,
                                    groupId:'__toplevel__' per §79.9, tab 2003)
   F4 — loose open tab            (LiveTabIndex only, tab 2004)
   F5 — named-group claimed        (tj:items, groupId:'g1', live tab 2005)
   F6 — named-group dormant        (tj:items, groupId:'g1', no live tab)

   F7 — named-group FLOATING member (control for single-sourced resolution:
        parent=F5 grouped → resolves TODAY under the 'g1' key, tab 2007)
   ------------------------------------------------------------------------- */

const F1 = item('item-F1', null, 20, 'https://f1.example/');
const F2 = item('item-F2', null, 10, 'https://f2.example/');
const F5 = item('item-F5', 'g1', 5, 'https://f5.example/');
const F6 = item('item-F6', 'g1', 6, 'https://f6.example/');
const G1 = group('g1');
const ITEMS = [F1, F2, F5, F6];

const F3_REC = floatingRecord({
  floatingTabId: 'float-F3', groupId: '__toplevel__', parentItemId: 'item-F1',
  windowId: 1, tabIndex: 5, url: 'https://f3.example/child', liveTabId: 2003,
});
const F7_REC = floatingRecord({
  floatingTabId: 'float-F7', groupId: 'g1', parentItemId: 'item-F5',
  windowId: 1, tabIndex: 7, url: 'https://f7.example/child', liveTabId: 2007,
});

const TAB_F2 = tab(2002, 'https://f2.example/', 0);        // claimed by F2
const TAB_F3 = tab(2003, 'https://f3.example/child', 5);   // top-level floating child
const TAB_F4 = tab(2004, 'https://f4.example/', 2);        // loose (never saved/floating)
const TAB_F5 = tab(2005, 'https://f5.example/', 1);        // claimed by F5
const TAB_F7 = tab(2007, 'https://f7.example/child', 7);   // named-group floating child

/** Seed the full six-fixture scenario and run the REAL claim pipeline
 *  (reconcileClaims auto-claims F2→2002 and F5→2005 by primary URL; F1/F6 have
 *  no matching tab → dormant; F3/F4/F7 tabs match no saved URL → unclaimed). */
async function seedScenario() {
  seedPartitions({
    items: ITEMS,
    groups: [G1],
    floatingGroups: [F3_REC, F7_REC],
  });
  __setMockWindows([{ id: 1 }]);
  __setMockTabs([TAB_F2, TAB_F3, TAB_F4, TAB_F5, TAB_F7]);
  await buildLiveTabIndex();
  await reconcileClaims(ITEMS);
}

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  __resetOpenerMap();
});

/* =========================================================================
   Fixture-contract check (§79.9 / §79.1.3) — the ONE contract point.
   The floating-under-ungrouped record MUST carry a non-empty string groupId
   or the validator throws ERR_CORRUPT_DATA on read.
   ========================================================================= */

test('B-195 fixture-contract: F3 floating record seeds groupId:"__toplevel__" and every partition validates on read (§79.9)', async () => {
  await seedScenario();

  // readPartition runs assertShape — a throw here means the fixture is invalid.
  const floating = await readPartition(PARTITION_FLOATING_GROUPS);
  const items = await readPartition(PARTITION_ITEMS);
  const groups = await readPartition(PARTITION_GROUPS);

  assert.equal(items.length, 4, 'F1,F2,F5,F6 read back');
  assert.equal(groups.length, 1, 'g1 reads back');
  assert.equal(floating.length, 2, 'F3 + F7 read back');

  const f3 = floating.find((r) => r.floatingTabId === 'float-F3');
  assert.ok(f3, 'F3 record present');
  assert.equal(f3.groupId, '__toplevel__',
    'F3 MUST seed the __toplevel__ sentinel groupId — the validator rejects null/absent (shapes.js:361)');
  assert.equal(f3.parentItemId, 'item-F1', 'F3 anchors under the ungrouped parent F1');
});

/* =========================================================================
   T1 — buildOpenTabs exclusion (AC3). STABLE mutual-exclusion invariant.
   ========================================================================= */

test('B-195 T1: buildOpenTabs excludes claimed + resolved-floating tabs; the loose tab F4 appears exactly once', async () => {
  await seedScenario();

  const fm = await buildFloatingMembers(ITEMS);
  const floatingTabIds = collectFloatingTabIds(fm);
  const open = buildOpenTabs(floatingTabIds);
  const ids = open.map((t) => t.tabId);

  // STABLE (green today, after B-196, AND after B-197 — these classifications
  // never change): the loose tab is present exactly once; claimed tabs and the
  // resolved named-group floating tab are excluded.
  assert.ok(ids.includes(2004), 'F4 (loose) is in the loose tail');
  assert.ok(!ids.includes(2002), 'F2 (claimed) is excluded');
  assert.ok(!ids.includes(2005), 'F5 (claimed in group) is excluded');
  assert.ok(!ids.includes(2007), 'F7 (named-group floating member) is excluded via floatingTabIds');
  assert.equal(new Set(ids).size, ids.length, 'no duplicate tabIds in the loose tail');
});

test('B-197-EXTEND B-195 T1b: floating-under-ungrouped F3 currently LEAKS into the loose tail (buildFloatingMembers skips ungrouped parents, floating-members.js:94)', async () => {
  await seedScenario();

  const fm = await buildFloatingMembers(ITEMS);
  const floatingTabIds = collectFloatingTabIds(fm);
  const open = buildOpenTabs(floatingTabIds).map((t) => t.tabId);

  // TODAY baseline: F3's tab is neither claimed nor a resolved floating member
  // (its parent F1 is ungrouped → skipped), so it falls through to the loose
  // tail. This is the behaviour B-197 fixes.
  assert.ok(open.includes(2003),
    'B-197-EXTEND: today F3 (floating-under-ungrouped) leaks into the loose tail. '
    + 'After B-197, F3 resolves as a floating member and is EXCLUDED here — flip this to assert !open.includes(2003).');
});

/* =========================================================================
   T2 — buildOpenTabs sort (AC4). STABLE (windowId asc, tabIndex asc).
   ========================================================================= */

test('B-195 T2: buildOpenTabs orders the loose tail by (windowId asc, tabIndex asc)', async () => {
  __setMockWindows([{ id: 1 }]);
  __setMockTabs([
    tab(6003, 'https://a.example/', 3),
    tab(6001, 'https://b.example/', 1),
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]); // no saved items → both tabs are loose

  const open = buildOpenTabs();
  assert.equal(open.length, 2);
  assert.equal(open[0].tabIndex, 1, 'lower tabIndex sorts first');
  assert.equal(open[0].tabId, 6001);
  assert.equal(open[1].tabIndex, 3);
  assert.equal(open[1].tabId, 6003);
});

/* =========================================================================
   T3 — buildFloatingMembers ungrouped-parent baseline (AC5, B-197-EXTEND)
   + single-sourced named-group resolution (STABLE).
   ========================================================================= */

test('B-197-EXTEND B-195 T3: buildFloatingMembers keys named-group floating under its groupId and does NOT emit a top-level key today', async () => {
  await seedScenario();

  const fm = await buildFloatingMembers(ITEMS);

  // STABLE (single-sourced resolution): the named-group floating member F7
  // resolves through the ONE resolver path and keys under its parent's groupId.
  assert.ok(Object.prototype.hasOwnProperty.call(fm, 'g1'), 'named-group floating member keys under "g1"');
  assert.equal(fm.g1.length, 1, 'exactly one floating member under g1');
  assert.equal(fm.g1[0].tabId, 2007, 'F7 resolves to its live tab');
  assert.equal(fm.g1[0].parentItemId, 'item-F5', 'F7 carries its parent itemId');

  // B-197-EXTEND baseline: the floating-under-ungrouped record F3 is skipped
  // today (parent F1 is ungrouped, floating-members.js:94), so no top-level key
  // is emitted. After B-197 this asserts fm['__toplevel__'] contains F3.
  assert.ok(!('__toplevel__' in fm),
    'B-197-EXTEND: today no "__toplevel__" bucket exists. After B-197, assert fm["__toplevel__"] contains F3\'s descriptor.');
  assert.ok(!(null in fm), 'no null key ever (the record is validator-consistent with a string groupId)');
});

/* =========================================================================
   T4 — loose tab is never claimed as floating (AC6). STABLE.
   ========================================================================= */

test('B-195 T4: the loose tab F4 is NOT in the floatingTabIds set (never resolved as a floating member)', async () => {
  await seedScenario();

  const fm = await buildFloatingMembers(ITEMS);
  const floatingTabIds = collectFloatingTabIds(fm);

  assert.ok(!floatingTabIds.has(2004), 'F4 remains a loose tab, never a floating member');
});

/* =========================================================================
   T5 — resolveFloatingOpener ungrouped baseline (AC7, B-197-EXTEND).
   ========================================================================= */

test('B-197-EXTEND B-195 T5: resolveFloatingOpener returns the record\'s groupId for a matched opener; an empty-groupId record is unusable (null)', async () => {
  // TODAY baseline with the §79.9-consistent F3 record (groupId:'__toplevel__').
  // resolveFloatingOpener keys off the RECORD's groupId (opener-chain.js:107);
  // '__toplevel__' is a non-empty string, so the opener resolves to it verbatim.
  // (The R1 AC7 "returns null" wording assumed a groupId:null record, which the
  // validator forbids post-§79.9.)
  const f3Rec = { ...F3_REC, liveTabId: 2003 };
  assert.deepEqual(
    resolveFloatingOpener(2003, [f3Rec]),
    { groupId: '__toplevel__', itemId: 'item-F1' },
    'B-197-EXTEND: today the "__toplevel__" record resolves verbatim. After B-197 the caller '
    + '(tab-events.js) anchors a top-level/null-group result under the parent item instead of a named group.',
  );

  // STABLE guard (green today AND after B-197): an EMPTY-groupId record is
  // "matched but unusable" → null (opener-chain.js:111). Mirrors b184 T4.
  const emptyRec = { ...F3_REC, groupId: '', liveTabId: 2003 };
  assert.equal(resolveFloatingOpener(2003, [emptyRec]), null,
    'an empty-groupId record is unusable regardless of merge phase');
});

/* =========================================================================
   T6 — walkOpenerChain ungrouped baseline (AC8, B-197-EXTEND).
   ========================================================================= */

test('B-197-EXTEND B-195 T6: walkOpenerChain returns null for an ungrouped claimed ancestor today; a named-group ancestor resolves', () => {
  // TODAY baseline: the only claimed opener-chain ancestor is F2 (ungrouped,
  // groupId:null). walkOpenerChain skips it (opener-chain.js:68, `groupId !== null`)
  // and, with no further hop, returns null.
  recordOpener(3001, 2002); // new tab 3001 opened from F2's live tab 2002
  const nullResult = walkOpenerChain(3001, { 'item-F2': 2002 }, [F2]);
  assert.equal(nullResult, null,
    'B-197-EXTEND: today an ungrouped claimed ancestor yields null. '
    + 'After B-197, assert it returns { groupId: null, itemId: "item-F2" }.');

  // STABLE guard (green today AND after B-197): a NAMED-group claimed ancestor
  // (F5) resolves through the same walk unchanged.
  recordOpener(3002, 2005);
  assert.deepEqual(
    walkOpenerChain(3002, { 'item-F5': 2005 }, [F5]),
    { groupId: 'g1', itemId: 'item-F5' },
    'a named-group ancestor resolves regardless of merge phase',
  );
});

/* =========================================================================
   T7 — renderOrder head ordering (AC9). STABLE — the ordering B-196 preserves.
   ========================================================================= */

test('B-195 T7: the ungrouped head orders saved items by sortOrder ascending (resolveRenderOrder bootstrap)', () => {
  // Two saved-ungrouped items with sortOrder 20 and 10 → sortOrder:10 renders
  // first. This is the head ordering the merged top-level region must preserve
  // (resolveRenderOrder is the shared authority for named groups AND the
  // runtime-derived __toplevel__ owner, design §79.3.3).
  const headItems = [F1, F2]; // F1 sortOrder 20, F2 sortOrder 10
  const rows = resolveRenderOrder({ id: '__toplevel__' }, headItems, []);
  assert.deepEqual(
    rows.map((r) => r.item.id),
    ['item-F2', 'item-F1'],
    'sortOrder:10 (F2) before sortOrder:20 (F1)',
  );
});

/* =========================================================================
   T8 — B-186 loose-tail survivor renumber on single-tab close (AC10).
   B-186-GATE: renumberAfterRemoval HAS landed (live-tab-index.js:112) → green.
   ========================================================================= */

test('B-186-GATE B-195 T8: closing a mid-strip loose tab leaves buildOpenTabs contiguous (no index gap)', async () => {
  __setMockWindows([{ id: 1 }]);
  __setMockTabs([
    tab(7000, 'https://a.example/', 0),
    tab(7001, 'https://b.example/', 1),
    tab(7002, 'https://c.example/', 2),
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]); // all three loose

  assert.deepEqual(buildOpenTabs().map((t) => t.tabIndex), [0, 1, 2], 'pre-close: contiguous');

  // Close the tab at index 1 (7001) — mirror the onRemoved handler
  // (tab-events.js:358-361): renumber same-window survivors, then drop the entry.
  const slot = getLiveTabIndex().get(7001);
  renumberAfterRemoval(slot.windowId, slot.index);
  removeTabEntry(7001);

  const after = buildOpenTabs();
  assert.equal(after.length, 2, 'two survivors remain');
  assert.deepEqual(after.map((t) => t.tabId), [7000, 7002], 'survivors, in order');
  assert.deepEqual(after.map((t) => t.tabIndex), [0, 1],
    'B-186: survivor above the closed slot renumbers 2→1 — no gap at index 1');
});

/* =========================================================================
   INVARIANT — single-source-of-truth partition of live tabs (the heart of the
   net). Every live tab is classified into EXACTLY ONE of {claimed, floating,
   loose}. Holds today, after B-196, AND after B-197 (B-197 only moves F3 from
   the loose bucket to the floating bucket — it stays a partition).
   ========================================================================= */

test('B-195 INV: every live tab is classified into exactly one of {claimed, floating, loose} — no drops, no double-counting', async () => {
  await seedScenario();

  const claimed = getClaimedTabIds();                       // {2002, 2005}
  const floating = collectFloatingTabIds(await buildFloatingMembers(ITEMS)); // {2007}
  const loose = new Set(buildOpenTabs(floating).map((t) => t.tabId));        // {2003, 2004} today

  // Pairwise disjoint — a tab cannot be in two buckets (single-sourcing).
  const disjoint = (a, b) => [...a].every((x) => !b.has(x));
  assert.ok(disjoint(claimed, floating), 'claimed ∩ floating = ∅');
  assert.ok(disjoint(claimed, loose), 'claimed ∩ loose = ∅');
  assert.ok(disjoint(floating, loose), 'floating ∩ loose = ∅');

  // Union covers every live tab — nothing dropped.
  const union = new Set([...claimed, ...floating, ...loose]);
  const liveTabIds = new Set(getLiveTabIndex().keys());
  assert.deepEqual(
    [...union].sort((a, b) => a - b),
    [...liveTabIds].sort((a, b) => a - b),
    'the three buckets partition the LiveTabIndex — every live tab is accounted for exactly once',
  );

  // Document today's bucket for F3 (the B-197 flip target).
  assert.ok(loose.has(2003),
    'B-197-EXTEND: F3 is in the LOOSE bucket today; after B-197 it moves to the FLOATING bucket (the partition property is preserved either way).');
});
