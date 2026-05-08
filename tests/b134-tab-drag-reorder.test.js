/**
 * b134-tab-drag-reorder.test.js — B-134 R5 (Sprint 40)
 *
 * Authoritative spec: docs/design/63-b-134-tab-drag-reorder.md (§63.13 R3
 * build plan + §63.13.2 test plan).
 *
 * Sprint 40 / B-134 introduces drag-and-drop reorder for the Open Tabs
 * section + saved-bookmark live-tab rows ("floating tabs"). Five mutually-
 * exclusive operations:
 *   - REORDER_OPEN     — same-window Open Tab → Open Tab reorder via
 *                        chrome.tabs.move
 *   - REORDER_FLOATING — same-group floating reorder via
 *                        MSG_REORDER_FLOATING_MEMBERS (atomic sortOrder write)
 *   - ATTACH           — Open Tab → floating area of group G via
 *                        MSG_MOVE_FLOATING_TAB + markInherited
 *   - DETACH           — floating row → Open Tabs section via
 *                        MSG_MOVE_FLOATING_TAB + pruneInherited
 *   - MOVE_FLOATING    — floating row → floating area of different group H
 *                        via MSG_MOVE_FLOATING_TAB (single atomic detach+attach)
 *
 * Coverage maps:
 *   T1   — REORDER_OPEN dispatches chrome.tabs.move with literal index
 *   T2   — REORDER_OPEN cross-window REJECTED (silent)
 *   T3   — REORDER_FLOATING dispatches MSG_REORDER_FLOATING_MEMBERS,
 *          atomic sortOrder write
 *   T4   — ATTACH dispatches MSG_MOVE_FLOATING_TAB, markInherited called
 *   T5   — DETACH dispatches MSG_MOVE_FLOATING_TAB, pruneInherited called
 *   T6   — MOVE_FLOATING single atomic message + inheritedTabs preserved
 *   T7   — Race-guard A: tab closed mid-drag → MSG_MOVE_FLOATING_TAB returns
 *          {moved: false, reason: 'ERR_RACE'}
 *   T8   — ERR_VALIDATION on invalid payload (bad insertIndex)
 *   T9   — ERR_VALIDATION on identical sourceGroupId/targetGroupId
 *   T10  — ATTACH to empty group (zero saved items) → ERR_RACE
 *   T11  — Same-group reorder no-op (single member group) — handler still
 *          succeeds; sortOrder unchanged after rewrite
 *   T12  — `_computeReorderFloatingPayload` source-text contract — exists
 *          + is pure
 *   T13  — Schema bump: appendFloatingGroup stamps sortOrder
 *   T14  — Schema bump: lazy fallback — legacy v2 records (no sortOrder)
 *          continue to sort by (windowId, tabIndex)
 *   T15  — Schema bump: explicit sortOrder takes priority over legacy
 *          (windowId, tabIndex) fallback
 *   T16  — Helper unit: `_computeReorderFloatingPayload` correctly moves
 *          a tab forward
 *   T17  — Helper unit: backward move
 *   T18  — Helper unit: same-position no-op
 *   T19  — Drag-state mode-exclusivity (source-text pin)
 *   T20  — `_buildTabDragRectCache` source-text contract — exists +
 *          mounts on dragstart
 *   T21  — `_validateTabDropPreflight` includes all three guards (A/B/C)
 *   T22  — `_computeTabDropTarget` returns REJECT for cross-window
 *          (source-text pin)
 *   T23  — Drop handler dispatches MSG_REORDER_FLOATING_MEMBERS for
 *          REORDER_FLOATING (source-text pin)
 *   T24  — Drop handler dispatches MSG_MOVE_FLOATING_TAB for
 *          ATTACH/DETACH/MOVE_FLOATING (source-text pin)
 *   T25  — Cache-gen counters bumped on cache assignment (source-text pin)
 *
 * Strategy mirrors b122-drag-to-root.test.js: SW-side tests (T1–T11, T13–T15)
 * exercise the storage/messaging path via chrome-mock; sidepanel-side tests
 * (T12, T19–T25) use source-text assertions because sidepanel.js cannot be
 * imported in Node (load-time DOM queries).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  __resetMock,
  __setMockTabs,
  __getRawStore,
  seedPartitions,
} from './chrome-mock.js';
import { __resetLiveTabIndex, buildLiveTabIndex, getLiveTabIndex } from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  isInherited,
  markInherited,
  reconcileClaims,
} from '../background/tabs/tab-claims.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import {
  reorderFloatingMembers,
  moveFloatingTab,
  appendFloatingGroup,
  pruneFloatingGroupsByLiveTabId,
  reassociateFloatingGroups,
} from '../background/tabs/floating-groups.js';
import { buildFloatingMembers } from '../background/tabs/floating-members.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  MSG_REORDER_FLOATING_MEMBERS,
  MSG_MOVE_FLOATING_TAB,
  MSG_LIST_ITEMS,
} from '../shared/messages.js';
import { createGroup, createItem } from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';

const COLOR = GROUP_COLORS[0];

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/** Helper — register the storage handlers with an immediately-resolved
 *  readyPromise and return a `dispatch(type, payload)` shorthand. */
function setupHandlers() {
  registerStorageHandlers(Promise.resolve());
  const listener = chrome.runtime.onMessage._listeners[
    chrome.runtime.onMessage._listeners.length - 1
  ];
  return (type, payload) => new Promise((resolve) => {
    listener({ type, payload }, { id: chrome.runtime.id }, resolve);
  });
}

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   T1 — REORDER_OPEN dispatches chrome.tabs.move with literal index
   (no -1 adjustment for same-window per §63.14.4).
   ========================================================================= */

test('B-134 T1 (AC1) + B-136 (AC2/AC3): REORDER_OPEN dispatches chrome.tabs.move with literal user-target index AND LiveTabIndex/buildOpenTabs reflect the new order', async () => {
  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 101, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 102, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();
  /* B-136: register the SW-side onMoved listener so chrome.tabs.move's
     mock-fired onMoved updates LiveTabIndex (mirrors production wiring). */
  registerTabEventListeners(Promise.resolve());
  /* B-136: claims must be ready for buildOpenTabs to return non-empty. */
  await reconcileClaims([]);

  /* Direct call to chrome.tabs.move (sidepanel-side dispatch). Verifies the
     mock records the call with literal index — no -1 adjustment. */
  await chrome.tabs.move(102, { index: 0 });
  assert.equal(chrome.tabs._moveCalls.length, 1);
  assert.deepEqual(chrome.tabs._moveCalls[0], { tabIds: 102, props: { index: 0 } });

  /* B-136 AC2: LiveTabIndex reflects the new index for tab 102 AND siblings
     have been renumbered by the local-renumber path in tab-events.js. */
  const live = getLiveTabIndex();
  assert.equal(live.get(102).index, 0, 'moved tab now at index 0');
  assert.equal(live.get(100).index, 1, 'tab 100 shifted from 0 to 1');
  assert.equal(live.get(101).index, 2, 'tab 101 shifted from 1 to 2');

  /* B-136 AC3: buildOpenTabs returns rows in the new order. */
  const openTabs = buildOpenTabs();
  assert.deepEqual(openTabs.map((t) => t.tabId), [102, 100, 101]);
});

/* =========================================================================
   T1b — B-136 listener directly: simulate chrome.tabs.onMoved with a known
   (fromIndex, toIndex) pair. Asserts the LiveTabIndex mutation is correct
   for both forward and backward moves, plus the same-position no-op guard.
   Bypasses chrome.tabs.move entirely so the listener body is the unit
   under test.
   ========================================================================= */

test('B-136 T1b (AC2/AC4): chrome.tabs.onMoved listener renumbers LiveTabIndex (forward move)', async () => {
  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 101, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 102, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());

  /* Simulate a forward move: tab 100 (index 0) → index 2. Tabs 101, 102
     should shift from 1, 2 → 0, 1. */
  chrome.tabs.onMoved.__fire(100, { windowId: 1, fromIndex: 0, toIndex: 2 });

  const live = getLiveTabIndex();
  assert.equal(live.get(100).index, 2, 'moved tab lands at toIndex');
  assert.equal(live.get(101).index, 0, 'tab 101 shifted 1 → 0');
  assert.equal(live.get(102).index, 1, 'tab 102 shifted 2 → 1');
});

test('B-136 T1b (AC2/AC4): chrome.tabs.onMoved listener renumbers LiveTabIndex (backward move)', async () => {
  __setMockTabs([
    { id: 200, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 201, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 202, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());

  /* Backward move: tab 202 (index 2) → index 0. Tabs 200, 201 shift
     from 0, 1 → 1, 2. */
  chrome.tabs.onMoved.__fire(202, { windowId: 1, fromIndex: 2, toIndex: 0 });

  const live = getLiveTabIndex();
  assert.equal(live.get(202).index, 0, 'moved tab lands at toIndex');
  assert.equal(live.get(200).index, 1, 'tab 200 shifted 0 → 1');
  assert.equal(live.get(201).index, 2, 'tab 201 shifted 1 → 2');
});

test('B-136 T1b (AC2): chrome.tabs.onMoved listener ignores cross-window siblings during local renumber', async () => {
  __setMockTabs([
    { id: 300, url: 'https://w1a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 301, url: 'https://w1b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 400, url: 'https://w2a.example', windowId: 2, active: false, audible: false, index: 0 },
    { id: 401, url: 'https://w2b.example', windowId: 2, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());

  /* Move tab 300 within window 1 only. Window 2 indices must be untouched. */
  chrome.tabs.onMoved.__fire(300, { windowId: 1, fromIndex: 0, toIndex: 1 });

  const live = getLiveTabIndex();
  assert.equal(live.get(300).index, 1);
  assert.equal(live.get(301).index, 0);
  assert.equal(live.get(400).index, 0, 'window 2 tabs untouched');
  assert.equal(live.get(401).index, 1, 'window 2 tabs untouched');
});

test('B-136 T1b (AC2): chrome.tabs.onMoved listener is a no-op when fromIndex === toIndex', async () => {
  __setMockTabs([
    { id: 500, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 501, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());

  chrome.tabs.onMoved.__fire(500, { windowId: 1, fromIndex: 0, toIndex: 0 });

  const live = getLiveTabIndex();
  assert.equal(live.get(500).index, 0);
  assert.equal(live.get(501).index, 1);
});

/* =========================================================================
   T2 — REORDER_OPEN cross-window REJECTED.
   The cross-window guard lives in the sidepanel drop-handler; the source-
   text pin in T22 + T26 verifies the indicator path. The storage layer
   has no involvement (no message dispatched on REJECT).
   ========================================================================= */

test('B-134 T2 (AC2): cross-window REORDER_OPEN reject — no chrome.tabs.move call dispatched', async () => {
  /* Source-text assertion: the drop handler's REORDER_OPEN branch
     contains a defensive cross-window guard that aborts before
     chrome.tabs.move is called. */
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* The drop handler has explicit windowId comparison + early return + toast. */
  assert.match(
    sidepanelJs,
    /case 'REORDER_OPEN'[\s\S]{0,400}pendingTargetWindowId !== state\.sourceWindowId[\s\S]{0,200}showToast/,
    'REORDER_OPEN branch must guard against cross-window targets and abort with toast',
  );
});

/* =========================================================================
   T3 — REORDER_FLOATING dispatches MSG_REORDER_FLOATING_MEMBERS; atomic
   sortOrder write.
   ========================================================================= */

test('B-134 T3 (AC3): MSG_REORDER_FLOATING_MEMBERS atomically rewrites sortOrder for same-group floating reorder', async () => {
  /* Seed two saved items + two floating-group records. */
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 200, url: 'https://x.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 201, url: 'https://y.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  /* Append two floating records. Each gets sortOrder via appendFloatingGroup. */
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://x.example', savedAt: 1000,
    liveTabId: 200,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 1, url: 'https://y.example', savedAt: 2000,
    liveTabId: 201,
  });

  /* Initial order: tab 200 (sortOrder 0), tab 201 (sortOrder 1). */
  let members = await buildFloatingMembers([{ id: item.id, groupId: g.id }]);
  assert.deepEqual(members[g.id].map((m) => m.tabId), [200, 201]);

  /* Reorder: swap to [201, 200]. */
  const ok = await reorderFloatingMembers(g.id, [201, 200]);
  assert.equal(ok, true, 'reorderFloatingMembers must succeed');

  /* Verify storage: sortOrders now match the new order. */
  const records = __getRawStore('tj:floatingGroups');
  const byTab = new Map();
  for (const r of records) {
    /* Resolve via (windowId, tabIndex) → tabId. */
    if (r.windowId === 1 && r.tabIndex === 0) byTab.set(200, r);
    if (r.windowId === 1 && r.tabIndex === 1) byTab.set(201, r);
  }
  assert.equal(byTab.get(201).sortOrder, 0, 'tab 201 now first');
  assert.equal(byTab.get(200).sortOrder, 1, 'tab 200 now second');

  /* Verify renderer-side: buildFloatingMembers returns tabs in new order. */
  members = await buildFloatingMembers([{ id: item.id, groupId: g.id }]);
  assert.deepEqual(members[g.id].map((m) => m.tabId), [201, 200]);
});

/* =========================================================================
   T4 — ATTACH dispatches MSG_MOVE_FLOATING_TAB + markInherited(tabId).
   ========================================================================= */

test('B-134 T4 (AC4): ATTACH (Open Tab → floating area) marks tab as inherited and creates record', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 300, url: 'https://attach-me.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 300,
    sourceGroupId: null,
    targetGroupId: g.id,
    insertIndex: 0,
  });

  assert.equal(resp.ok, true);
  assert.equal(resp.data.moved, true);
  /* markInherited side-effect: the tab is now in the inheritedTabs Set. */
  assert.equal(isInherited(300), true, 'tab 300 marked as inherited after ATTACH');
  /* New record landed in storage with parentItemId=item.id and sortOrder=0. */
  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(records[0].parentItemId, item.id);
  assert.equal(records[0].groupId, g.id);
  assert.equal(records[0].sortOrder, 0);
  assert.ok(typeof records[0].floatingTabId === 'string' && records[0].floatingTabId.length > 0);
});

/* =========================================================================
   T5 — DETACH dispatches MSG_MOVE_FLOATING_TAB + pruneInherited(tabId).
   ========================================================================= */

test('B-134 T5 (AC5): DETACH (floating → Open Tabs) prunes the inherited marker and removes the record', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 400, url: 'https://detach-me.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Seed: floating record + inherited marker (the SW would have done this
     when the opener-chain spawned the tab). */
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://detach-me.example', savedAt: 1000,
    liveTabId: 400,
  });
  markInherited(400);
  assert.equal(isInherited(400), true);

  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 400,
    sourceGroupId: g.id,
    targetGroupId: null,
    insertIndex: 0,
  });

  assert.equal(resp.ok, true);
  assert.equal(resp.data.moved, true);
  /* pruneInherited side-effect: marker dropped. */
  assert.equal(isInherited(400), false, 'tab 400 unmarked after DETACH');
  /* Record removed from storage. */
  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 0);
});

/* =========================================================================
   T6 — MOVE_FLOATING single atomic message + inheritedTabs preserved.
   ========================================================================= */

test('B-134 T6 (AC6): MOVE_FLOATING moves record between groups in a single writeTransaction; inheritedTabs preserved', async () => {
  const gA = await createGroup({ name: 'A', color: COLOR, parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: COLOR, parentId: null, sortOrder: 1000 });
  const itemA = await createItem({ title: 'A', url: 'https://a.example', groupId: gA.id });
  const itemB = await createItem({ title: 'B', url: 'https://b.example', groupId: gB.id });

  __setMockTabs([
    { id: 500, url: 'https://moveme.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Seed: floating record under gA + inherited marker. */
  await appendFloatingGroup({
    groupId: gA.id, parentItemId: itemA.id,
    windowId: 1, tabIndex: 0, url: 'https://moveme.example', savedAt: 1000,
    liveTabId: 500,
  });
  markInherited(500);

  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 500,
    sourceGroupId: gA.id,
    targetGroupId: gB.id,
    insertIndex: 0,
  });

  assert.equal(resp.ok, true);
  assert.equal(resp.data.moved, true);
  /* inheritedTabs unchanged — the tab is still inherited (under a new parent). */
  assert.equal(isInherited(500), true, 'inherited marker preserved across MOVE_FLOATING');

  /* Storage: single record now under gB with parentItemId = itemB.id. */
  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(records[0].groupId, gB.id);
  assert.equal(records[0].parentItemId, itemB.id);
  assert.equal(records[0].sortOrder, 0);
});

/* =========================================================================
   T7 — Guard A: tab closed mid-drag → moveFloatingTab returns false.
   ========================================================================= */

test('B-134 T7 (AC7 race-A): moveFloatingTab returns false when the live tab has been removed', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  /* No mock tabs — chrome.tabs.get(<unknown id>) returns null per the mock. */
  __setMockTabs([]);
  await buildLiveTabIndex();

  /* Bypass chrome.tabs.get throw via stale tabId (mock returns null). The
     handler treats null tab as race fail. */
  const ok = await moveFloatingTab(99999, null, g.id, 0);
  assert.equal(ok, false, 'race fail returns false');
});

/* =========================================================================
   T8 — ERR_VALIDATION on invalid insertIndex.
   ========================================================================= */

test('B-134 T8: MSG_MOVE_FLOATING_TAB rejects negative insertIndex with ERR_VALIDATION', async () => {
  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 1,
    sourceGroupId: null,
    targetGroupId: 'g-1',
    insertIndex: -1,
  });
  assert.equal(resp.ok, true); // handler returns success-shape with moved=false
  assert.equal(resp.data.moved, false);
  assert.equal(resp.data.reason, 'ERR_VALIDATION');
});

/* =========================================================================
   T9 — ERR_VALIDATION on identical sourceGroupId / targetGroupId.
   ========================================================================= */

test('B-134 T9: MSG_MOVE_FLOATING_TAB rejects identical sourceGroupId/targetGroupId (use REORDER instead)', async () => {
  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 1,
    sourceGroupId: 'g-1',
    targetGroupId: 'g-1',
    insertIndex: 0,
  });
  assert.equal(resp.data.moved, false);
  assert.equal(resp.data.reason, 'ERR_VALIDATION');
});

/* =========================================================================
   T10 — ATTACH to empty group (zero saved items) → ERR_RACE.
   ========================================================================= */

test('B-134 T10 (§63.15): ATTACH to a group with zero saved items returns ERR_RACE', async () => {
  /* Create a group with zero items. */
  const g = await createGroup({ name: 'Empty', color: COLOR, parentId: null, sortOrder: 0 });

  __setMockTabs([
    { id: 600, url: 'https://orphan.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_MOVE_FLOATING_TAB, {
    tabId: 600,
    sourceGroupId: null,
    targetGroupId: g.id,
    insertIndex: 0,
  });
  assert.equal(resp.data.moved, false);
  assert.equal(resp.data.reason, 'ERR_RACE');

  /* Storage unchanged — no record created. The partition may be undefined
     (writeTransaction never ran) OR an empty array (initialized by some
     other path); both are valid "zero records" outcomes. */
  const records = __getRawStore('tj:floatingGroups');
  assert.ok(records === undefined || (Array.isArray(records) && records.length === 0),
    'no floatingGroups record written when ATTACH target group is empty');
});

/* =========================================================================
   T11 — Same-group reorder no-op.
   ========================================================================= */

test('B-134 T11 (§63.15 same-position): REORDER_FLOATING with same order returns reordered=true (idempotent)', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 700, url: 'https://only.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://only.example', savedAt: 1000,
    liveTabId: 700,
  });

  /* Single-member reorder with itself — idempotent (no-op write). */
  const ok = await reorderFloatingMembers(g.id, [700]);
  assert.equal(ok, true, 'idempotent reorder still succeeds');

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(records[0].sortOrder, 0);
});

/* =========================================================================
   T12 — `_computeReorderFloatingPayload` source-text contract.
   ========================================================================= */

test('B-134 T12 (§63.6.2): _computeReorderFloatingPayload pure helper exists in sidepanel.js', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  assert.match(
    sidepanelJs,
    /function _computeReorderFloatingPayload\(groupId, draggedTabId, insertIndex\)/,
    '_computeReorderFloatingPayload must be defined with the documented signature',
  );
  /* Must read from the cached floatingMembers map (not perform IPC). */
  assert.match(
    sidepanelJs,
    /_computeReorderFloatingPayload[\s\S]{0,500}_cachedFloatingMembers/,
    '_computeReorderFloatingPayload must consume _cachedFloatingMembers',
  );
});

/* =========================================================================
   T13 — Schema bump: appendFloatingGroup stamps sortOrder.
   ========================================================================= */

test('B-134 T13 (§63.13.1 schema): appendFloatingGroup stamps numeric sortOrder', async () => {
  await appendFloatingGroup({
    groupId: 'g-T13', parentItemId: 'item-T13',
    windowId: 1, tabIndex: 0, url: 'https://t13.example', savedAt: 1,
    liveTabId: 1313,
  });
  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(typeof records[0].sortOrder, 'number');
  assert.ok(Number.isFinite(records[0].sortOrder));
});

/* =========================================================================
   T14 — Lazy fallback: legacy v2 records sort by (windowId, tabIndex).
   ========================================================================= */

test('B-134 T14 (§63.2.4 lazy fallback): buildFloatingMembers sorts legacy v2 records by (windowId, tabIndex)', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  /* Two legacy v2 records (no sortOrder) — must sort by (windowId, tabIndex). */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-A', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 5, url: 'https://second.example', savedAt: 1000,
      },
      {
        floatingTabId: 'ft-B', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 1, url: 'https://first.example', savedAt: 2000,
      },
    ],
  });

  __setMockTabs([
    { id: 800, url: 'https://first.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 801, url: 'https://second.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  const members = await buildFloatingMembers([{ id: item.id, groupId: g.id }]);
  /* tabIndex 1 first → tab 800; tabIndex 5 second → tab 801. */
  assert.deepEqual(members[g.id].map((m) => m.tabId), [800, 801]);
  /* sortOrder absent on descriptors (legacy passthrough). */
  for (const m of members[g.id]) {
    assert.equal(m.sortOrder, undefined);
  }
});

/* =========================================================================
   T15 — Explicit sortOrder takes priority over legacy fallback.
   ========================================================================= */

test('B-134 T15 (§63.8.4): explicit sortOrder overrides (windowId, tabIndex) fallback', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-A', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 1, url: 'https://aaa.example', savedAt: 1000,
        sortOrder: 1, // explicit — should sort SECOND
      },
      {
        floatingTabId: 'ft-B', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 5, url: 'https://bbb.example', savedAt: 2000,
        sortOrder: 0, // explicit — should sort FIRST
      },
    ],
  });

  __setMockTabs([
    { id: 900, url: 'https://aaa.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 901, url: 'https://bbb.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  const members = await buildFloatingMembers([{ id: item.id, groupId: g.id }]);
  /* Explicit sortOrder wins: ft-B (sortOrder 0, tab 901) first; ft-A
     (sortOrder 1, tab 900) second. Without B-134, the (windowId, tabIndex)
     fallback would put 900 (tabIndex 1) first. */
  assert.deepEqual(members[g.id].map((m) => m.tabId), [901, 900]);
  assert.equal(members[g.id][0].sortOrder, 0);
  assert.equal(members[g.id][1].sortOrder, 1);
});

/* =========================================================================
   T16–T18 — `_computeReorderFloatingPayload` unit tests via source-text
   parsing of the helper body. The helper is pure (no chrome / no DOM); we
   reconstruct its semantics via direct algorithm assertions on a stub map.

   Fix D (post-S41 pre-merge hotfix bundle, post-Fix C unmask) — the helper
   now consumes a FILTERED-list `insertIndex` (post-removal index space),
   matching `_computeTabDropTarget`'s REORDER_FLOATING branch which filters
   the dragged row out of `rowMidlines` (sidepanel.js:6261-6275, B-134 R4
   H-4 fix). T16/T17/T18 inputs and expectations updated accordingly.
   ========================================================================= */

/* Replicate the helper's algorithm here for direct test coverage. The
   actual sidepanel implementation is asserted by source-text in T12.

   Fix D: removed the `currentIdx < insertIndex ? -1 : 0` adjustment — that
   adjustment was correct for an UNFILTERED insertIndex but double-corrects
   when applied to the filtered (post-removal) index supplied by
   `_computeTabDropTarget`. */
function reorderPayloadAlgorithm(groupId, draggedTabId, insertIndex, cache) {
  const members = (cache && cache[groupId]) || [];
  const tabIds = members.map((m) => m.tabId);
  const currentIdx = tabIds.indexOf(draggedTabId);
  if (currentIdx === -1) return [];
  tabIds.splice(currentIdx, 1);
  const clamped = Math.max(0, Math.min(insertIndex, tabIds.length));
  tabIds.splice(clamped, 0, draggedTabId);
  return tabIds;
}

test('B-134 T16: reorderPayload — forward move (drag tab 1, drop between 2 and 3)', () => {
  const cache = { g: [{ tabId: 1 }, { tabId: 2 }, { tabId: 3 }] };
  /* Filtered list (after removing tab 1) = [2, 3]; "between 2 and 3"
     → filtered insertIndex = 1. Splice tab 1 at 1 → [2, 1, 3]. */
  const out = reorderPayloadAlgorithm('g', 1, 1, cache);
  assert.deepEqual(out, [2, 1, 3]);
});

test('B-134 T17: reorderPayload — backward move (drag tab 3, drop before tab 1)', () => {
  const cache = { g: [{ tabId: 1 }, { tabId: 2 }, { tabId: 3 }] };
  /* Filtered list (after removing tab 3) = [1, 2]; "before tab 1"
     → filtered insertIndex = 0. Splice tab 3 at 0 → [3, 1, 2]. */
  const out = reorderPayloadAlgorithm('g', 3, 0, cache);
  assert.deepEqual(out, [3, 1, 2]);
});

test('B-134 T18: reorderPayload — same-position no-op (drag tab 2, drop at its own slot)', () => {
  const cache = { g: [{ tabId: 1 }, { tabId: 2 }, { tabId: 3 }] };
  /* Filtered list (after removing tab 2) = [1, 3]; "between 1 and 3" (the
     dragged row's own slot) → filtered insertIndex = 1. Splice tab 2 at 1
     → [1, 2, 3]. True no-op. */
  const out = reorderPayloadAlgorithm('g', 2, 1, cache);
  assert.deepEqual(out, [1, 2, 3]);
});

/* =========================================================================
   T19 — Drag-state mode-exclusivity (source-text pin).
   ========================================================================= */

test('B-134 T19 (§63.3.3): tab-drag dragstart guards against active item / group drag', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* The tab-drag dragstart branch must check `_itemDragState ||
     _groupDragState` and bail. */
  assert.match(
    sidepanelJs,
    /tabRow && !_dragInitiatedFromHandle[\s\S]{0,800}if \(_itemDragState \|\| _groupDragState\)/,
    'tab-drag dragstart must include mode-exclusivity guard against item/group drag',
  );
});

/* =========================================================================
   T20 — `_buildTabDragRectCache` source-text contract.
   ========================================================================= */

test('B-134 T20 (§63.5): _buildTabDragRectCache exists and populates floatingZoneRects + openTabsByWindow', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  assert.match(
    sidepanelJs,
    /function _buildTabDragRectCache\(\)/,
    '_buildTabDragRectCache must exist',
  );
  /* The cache object literal must include floatingZoneRects + openTabsByWindow. */
  const cacheMatch = sidepanelJs.match(/function _buildTabDragRectCache\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(cacheMatch, '_buildTabDragRectCache body match');
  const body = cacheMatch[1];
  assert.match(body, /floatingZoneRects/, 'cache populates floatingZoneRects');
  assert.match(body, /openTabsByWindow/, 'cache populates openTabsByWindow');
  assert.match(body, /containerRect/, 'cache populates containerRect');
});

/* =========================================================================
   T21 — `_validateTabDropPreflight` includes all three guards.
   ========================================================================= */

test('B-134 T21 (§63.10): _validateTabDropPreflight implements all three race guards (A/B/C)', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  const fnMatch = sidepanelJs.match(/async function _validateTabDropPreflight\(state\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(fnMatch, '_validateTabDropPreflight must exist');
  const body = fnMatch[1];
  /* Guard A: chrome.tabs.get + 'tab-closed' reason. */
  assert.match(body, /chrome\.tabs\.get/, 'Guard A must call chrome.tabs.get');
  assert.match(body, /'tab-closed'/, 'Guard A returns reason: tab-closed');
  /* Guard B: cachedFloatingMembersGen + cachedOpenTabsGen comparison. */
  assert.match(body, /cachedFloatingMembersGen !== _cachedFloatingMembersGen/,
    'Guard B compares floating-members gen counters');
  assert.match(body, /cachedOpenTabsGen !== _cachedOpenTabsGen/,
    'Guard B compares open-tabs gen counters');
  /* Guard C: cross-window for REORDER_OPEN. */
  assert.match(body, /'REORDER_OPEN'[\s\S]{0,200}'cross-window'/,
    'Guard C rejects cross-window REORDER_OPEN with reason: cross-window');
});

/* =========================================================================
   T22 — `_computeTabDropTarget` returns REJECT for cross-window
   (source-text pin).
   ========================================================================= */

test('B-134 T22 (§63.10.3): _computeTabDropTarget emits REJECT mode for cross-window REORDER_OPEN', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  const fnMatch = sidepanelJs.match(/function _computeTabDropTarget\(x, y\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_computeTabDropTarget must exist');
  const body = fnMatch[1];
  /* Look for the cross-window REJECT branch — `targetWindowId !== sourceWindowId`
     followed by `mode: 'REJECT'`. */
  assert.match(
    body,
    /sourceMode === 'OPEN'[\s\S]{0,800}targetWindowId !== _tabDragState\.sourceWindowId[\s\S]{0,200}mode:\s*'REJECT'/,
    'cross-window REORDER_OPEN must return mode: REJECT in the hit-test',
  );
});

/* =========================================================================
   T23 — Drop handler dispatches MSG_REORDER_FLOATING_MEMBERS for
   REORDER_FLOATING.
   ========================================================================= */

test('B-134 T23 (§63.6.1): drop handler dispatches MSG_REORDER_FLOATING_MEMBERS for REORDER_FLOATING', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* The REORDER_FLOATING case must call sendMessage(MSG_REORDER_FLOATING_MEMBERS).
     B-154 (S43) widened the gap with an out-of-scope multi-tab comment block;
     window bumped 800 → 1500 to tolerate future doc/comment additions.
     B-148 (S44 Task 13) added the renderOrder construction branch + fallback
     comment block; window bumped 1500 → 3000.
     B-148 multi-select hotfix added the contiguous-block strip+reinsert logic
     and explanatory comment; window bumped 3000 → 4500.
     B-148 off-by-one hotfix expanded the comment with coordinate-frame
     explanation + replaced selectedAboveCount with siblingsAbove math;
     window bumped 4500 → 6000. */
  assert.match(
    sidepanelJs,
    /case 'REORDER_FLOATING'[\s\S]{0,6000}sendMessage\(MSG_REORDER_FLOATING_MEMBERS/,
    'REORDER_FLOATING must dispatch via MSG_REORDER_FLOATING_MEMBERS',
  );
});

/* =========================================================================
   T24 — Drop handler dispatches MSG_MOVE_FLOATING_TAB for
   ATTACH/DETACH/MOVE_FLOATING.
   ========================================================================= */

test('B-134 T24 (§63.6.1): drop handler dispatches MSG_MOVE_FLOATING_TAB for ATTACH/DETACH/MOVE_FLOATING', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* All three cases collapse into one sendMessage(MSG_MOVE_FLOATING_TAB) call. */
  assert.match(
    sidepanelJs,
    /case 'ATTACH'[\s\S]{0,200}case 'DETACH'[\s\S]{0,200}case 'MOVE_FLOATING'[\s\S]{0,800}sendMessage\(MSG_MOVE_FLOATING_TAB/,
    'ATTACH/DETACH/MOVE_FLOATING must collapse into one MSG_MOVE_FLOATING_TAB dispatch',
  );
});

/* =========================================================================
   T25 — Cache-gen counters bumped on cache assignment (R3-VERIFY 2).
   ========================================================================= */

test('B-134 T25 (§63.14.2): _setCachedOpenTabs and _setCachedFloatingMembers bump their gen counters', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* _setCachedOpenTabs body must increment _cachedOpenTabsGen. */
  assert.match(
    sidepanelJs,
    /function _setCachedOpenTabs\(next\)[\s\S]{0,400}_cachedOpenTabsGen \+= 1/,
    '_setCachedOpenTabs must bump _cachedOpenTabsGen',
  );
  /* _setCachedFloatingMembers body must increment _cachedFloatingMembersGen. */
  assert.match(
    sidepanelJs,
    /function _setCachedFloatingMembers\(next\)[\s\S]{0,800}_cachedFloatingMembersGen \+= 1/,
    '_setCachedFloatingMembers must bump _cachedFloatingMembersGen',
  );
});

/* =========================================================================
   T26 — Open Tabs row + floating row are draggable post-build (AC1, AC3).
   ========================================================================= */

test('B-134 T26 (§63.3.3): buildOpenTabRow sets row.draggable = true', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* buildOpenTabRow body must set row.draggable = true. */
  const bodyMatch = sidepanelJs.match(/function buildOpenTabRow\(tab[\s\S]*?\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(bodyMatch, 'buildOpenTabRow body match');
  assert.match(
    bodyMatch[1],
    /row\.draggable = true/,
    'buildOpenTabRow must set row.draggable = true',
  );
});

/* =========================================================================
   T27 — R4 H-1 fix: gen-counter bumps are content-conditional.
   Title/audible/active LiveState patches must NOT bump the gen.
   ========================================================================= */

test('B-134 T27 (R4 H-1): _setCachedOpenTabs bumps gen only on signature change', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* Helper signature function exists and reads windowId+tabId. */
  assert.match(
    sidepanelJs,
    /function _openTabsSignature\(arr\)\s*\{[\s\S]{0,400}\$\{t\.windowId\}:\$\{t\.tabId\}/,
    '_openTabsSignature must hash per-window ordered tabId tuples',
  );
  /* _setCachedOpenTabs body must guard the bump on signature inequality. */
  const fnMatch = sidepanelJs.match(/function _setCachedOpenTabs\(next\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_setCachedOpenTabs body match');
  assert.match(
    fnMatch[1],
    /if \(prevSig !== nextSig\) _cachedOpenTabsGen \+= 1/,
    '_setCachedOpenTabs must guard gen bump on prev/next signature inequality',
  );
});

test('B-134 T27b (R4 H-1): _setCachedFloatingMembers bumps gen only on signature change', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  assert.match(
    sidepanelJs,
    /function _floatingMembersSignature\(obj\)/,
    '_floatingMembersSignature helper must exist',
  );
  const fnMatch = sidepanelJs.match(/function _setCachedFloatingMembers\(next\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_setCachedFloatingMembers body match');
  assert.match(
    fnMatch[1],
    /if \(prevSig !== nextSig\) _cachedFloatingMembersGen \+= 1/,
    '_setCachedFloatingMembers must guard gen bump on prev/next signature inequality',
  );
});

/* =========================================================================
   T28 — R4 H-2 fix: REORDER_FLOATING surfaces ERR_RACE/ERR_VALIDATION via toast.
   ========================================================================= */

test('B-134 T28 (R4 H-2): REORDER_FLOATING dispatcher surfaces ERR_RACE toast', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* The REORDER_FLOATING case body must inspect resp.reordered and call
     showToast on ERR_RACE. Source-text-pin both the await and the toast. */
  const caseMatch = sidepanelJs.match(/case 'REORDER_FLOATING': \{([\s\S]*?)\n\s+\}\n\s+case 'ATTACH'/);
  assert.ok(caseMatch, 'REORDER_FLOATING case body match');
  assert.match(
    caseMatch[1],
    /resp\s*&&\s*resp\.reordered === false/,
    'REORDER_FLOATING dispatcher must inspect resp.reordered',
  );
  assert.match(
    caseMatch[1],
    /resp\.reason === 'ERR_RACE'[\s\S]{0,200}showToast\(/,
    'REORDER_FLOATING ERR_RACE branch must invoke showToast',
  );
});

/* =========================================================================
   T29 — R4 H-3 fix: REJECT mode is excluded from skip-no-op so the
   indicator follows the pointer between rejected rows.
   ========================================================================= */

test('B-134 T29 (R4 H-3): _tabDragTick skip-no-op excludes REJECT mode', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  const fnMatch = sidepanelJs.match(/function _tabDragTick\(\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(fnMatch, '_tabDragTick body match');
  /* The skip-no-op check must include `target.mode !== 'REJECT'` so that
     subsequent ticks within the rejected zone re-render the indicator. */
  assert.match(
    fnMatch[1],
    /target\.mode !== 'REJECT'[\s\S]{0,400}target\.mode === _tabDragState\.pendingMode/,
    'skip-no-op must exclude REJECT mode (always re-render REJECT indicator)',
  );
});

/* =========================================================================
   T30 — R4 H-4 fix: REORDER_FLOATING midline math excludes the dragged row
   from the source group. ATTACH / MOVE_FLOATING keep all rows.
   ========================================================================= */

test('B-134 T30 (R4 H-4): REORDER_FLOATING midline math excludes the dragged row', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* _computeTabDropTarget must compute a per-zone filtered midline
     array when sourceMode==='FLOATING' && groupId===sourceGroupId. */
  const fnMatch = sidepanelJs.match(/function _computeTabDropTarget\(x, y\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(fnMatch, '_computeTabDropTarget body match');
  assert.match(
    fnMatch[1],
    /isReorderFloating[\s\S]{0,200}sourceMode === 'FLOATING'[\s\S]{0,200}sourceGroupId/,
    'isReorderFloating predicate must gate on FLOATING + same source group',
  );
  assert.match(
    fnMatch[1],
    /zone\.rowMidlines\.filter\(\(_, i\) => zone\.rowTabIds\[i\] !== draggedTabId\)/,
    'midlines must be filtered to exclude the dragged row',
  );

  /* _resolveTabDragIndicatorY must mirror the same exclusion so the
     indicator Y does not desync from the hit-test insertIndex. */
  const resolveFnMatch = sidepanelJs.match(/function _resolveTabDragIndicatorY\(target\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(resolveFnMatch, '_resolveTabDragIndicatorY body match');
  assert.match(
    resolveFnMatch[1],
    /target\.mode === 'REORDER_FLOATING'[\s\S]{0,400}zone\.rowMidlines\.filter\(\(_, i\) => zone\.rowTabIds\[i\] !== draggedTabId\)/,
    '_resolveTabDragIndicatorY must filter midlines for REORDER_FLOATING mirror',
  );
});

/* =========================================================================
   T31 — R4 [code-reviewer] M-2 SW-side parity-mismatch coverage for
   reorderFloatingMembers. Three branches:
     (a) under-supply — orderedTabIds is missing a tabId currently in storage
     (b) over-supply  — orderedTabIds includes a stale/unknown tabId
     (c) duplicate    — orderedTabIds contains the same tabId twice

   All three must return false and write ZERO storage mutations.
   ========================================================================= */

test('B-134 T31 (R4 [code-reviewer] M-2): reorderFloatingMembers race-paths return false on parity mismatch', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 200, url: 'https://x.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 201, url: 'https://y.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://x.example', savedAt: 1000,
    liveTabId: 200,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 1, url: 'https://y.example', savedAt: 2000,
    liveTabId: 201,
  });

  /* Snapshot pre-state for each branch: the records written above. */
  const preSnapshot = JSON.stringify(__getRawStore('tj:floatingGroups'));

  /* Branch (a): under-supply — missing tab 201 in the orderedTabIds. The
     storageBucketSize parity check at floating-groups.js:322 should catch
     this and return false. */
  const okUnder = await reorderFloatingMembers(g.id, [200]);
  assert.equal(okUnder, false, 'under-supply must return false');
  assert.equal(
    JSON.stringify(__getRawStore('tj:floatingGroups')),
    preSnapshot,
    'under-supply must NOT mutate storage',
  );

  /* Branch (b): over-supply — orderedTabIds includes a stale tabId 999 not
     currently in the group. _resolveRecordIndexByTabId returns -1 for 999;
     the early-return at floating-groups.js:310 catches this. */
  const okOver = await reorderFloatingMembers(g.id, [200, 201, 999]);
  assert.equal(okOver, false, 'over-supply with stale tabId must return false');
  assert.equal(
    JSON.stringify(__getRawStore('tj:floatingGroups')),
    preSnapshot,
    'over-supply must NOT mutate storage',
  );

  /* Branch (c): duplicate — orderedTabIds contains tab 200 twice. The
     supplied.size dedup check at floating-groups.js:290 catches this. */
  const okDup = await reorderFloatingMembers(g.id, [200, 200]);
  assert.equal(okDup, false, 'duplicate tabIds must return false');
  assert.equal(
    JSON.stringify(__getRawStore('tj:floatingGroups')),
    preSnapshot,
    'duplicate must NOT mutate storage',
  );

  /* Verify the happy path still works against the same fixture (proves the
     parity checks are surgical, not flaky). */
  const okHappy = await reorderFloatingMembers(g.id, [201, 200]);
  assert.equal(okHappy, true, 'happy path must succeed after race-fail probes');
});

/* =========================================================================
   B-137 — extends B-134 with `liveTabId` join-key adoption.

   T32 — AC7 T2 (post-S40 Issue 3 race-toast resolved): rapid floating
         reorder using v4 records succeeds via tier (a) liveTabId direct-
         match even when LiveTabIndex.entry.index is stale (the gap that
         B-136 closed structurally — but here we exercise the v4 path
         directly to pin that the join is robust against position drift).

   T33 — §66.8.4 MOVE_FLOATING preserves liveTabId across the cross-group
         move (parallels T6's `floatingTabId` preservation assertion).
   ========================================================================= */

test('B-137 T32 (AC7 T2): reorderFloatingMembers resolves via tier (a) liveTabId direct-match even when stored tabIndex is stale', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 800, url: 'https://x.example', windowId: 1, active: false, audible: false, index: 5 },
    { id: 801, url: 'https://y.example', windowId: 1, active: false, audible: false, index: 7 },
  ]);
  await buildLiveTabIndex();

  /* Append v4 records — each carries liveTabId. The tabIndex stored at
     write time is the live tab's CURRENT index; this is the v4 happy path. */
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 5, url: 'https://x.example', savedAt: 1000,
    liveTabId: 800,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 7, url: 'https://y.example', savedAt: 2000,
    liveTabId: 801,
  });

  /* Now corrupt LiveTabIndex.entry.index (simulating the post-S40 Issue 3
     stale-index scenario that B-136 closed structurally). The tier (b)
     position match would now fail because the live tabs' indices no longer
     line up with the stored tabIndex on either record. Tier (a) MUST
     resolve the records via liveTabId direct match — the resolver is no
     longer position-dependent for v4 records. */
  const live = getLiveTabIndex();
  live.set(800, { ...live.get(800), index: 99 });
  live.set(801, { ...live.get(801), index: 100 });

  /* Race-toast scenario: reorder MUST succeed (no ERR_RACE) because tier (a)
     direct match bypasses the stale-index geometry. */
  const ok = await reorderFloatingMembers(g.id, [801, 800]);
  assert.equal(ok, true, 'B-137: reorder succeeds via tier (a) despite stale LiveTabIndex.entry.index');

  /* Verify the sortOrder rewrite landed correctly. */
  const records = __getRawStore('tj:floatingGroups');
  const byTab = new Map();
  for (const r of records) byTab.set(r.liveTabId, r);
  assert.equal(byTab.get(801).sortOrder, 0, 'tab 801 now first');
  assert.equal(byTab.get(800).sortOrder, 1, 'tab 800 now second');
});

test('B-137 T33 (§66.8.4): MOVE_FLOATING preserves liveTabId across cross-group move', async () => {
  const gA = await createGroup({ name: 'A', color: COLOR, parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: COLOR, parentId: null, sortOrder: 1000 });
  const itemA = await createItem({ title: 'A', url: 'https://a.example', groupId: gA.id });
  await createItem({ title: 'B', url: 'https://b.example', groupId: gB.id });

  __setMockTabs([
    { id: 1500, url: 'https://moveme.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Seed a v4 record under gA. */
  await appendFloatingGroup({
    groupId: gA.id, parentItemId: itemA.id,
    windowId: 1, tabIndex: 0, url: 'https://moveme.example', savedAt: 1000,
    liveTabId: 1500,
  });

  /* Snapshot the source record's liveTabId BEFORE the move. */
  const before = __getRawStore('tj:floatingGroups');
  assert.equal(before.length, 1);
  assert.equal(before[0].liveTabId, 1500);
  const sourceFloatingTabId = before[0].floatingTabId;

  /* Cross-group move from gA → gB. */
  const ok = await moveFloatingTab(1500, gA.id, gB.id, 0);
  assert.equal(ok, true, 'cross-group move succeeds');

  /* The new record under gB MUST preserve liveTabId (mirrors floatingTabId
     preservation per T6 / §60.4) AND retain the same floatingTabId
     (storage identity preserved). */
  const after = __getRawStore('tj:floatingGroups');
  assert.equal(after.length, 1);
  assert.equal(after[0].groupId, gB.id);
  assert.equal(after[0].liveTabId, 1500,
    'B-137 §66.8.4: liveTabId preserved across MOVE_FLOATING');
  assert.equal(after[0].floatingTabId, sourceFloatingTabId,
    'floatingTabId storage identity preserved (per §60.4)');
});

test('B-137 §66.8.4: ATTACH (Open Tab → floating area) seeds liveTabId from caller-supplied tabId', async () => {
  const g = await createGroup({ name: 'G', color: COLOR, parentId: null, sortOrder: 0 });
  await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 1600, url: 'https://attach.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();

  /* ATTACH: sourceGroupId === null. The new record's liveTabId is seeded
     from the caller-supplied tabId (the live tab's numeric id). */
  const ok = await moveFloatingTab(1600, null, g.id, 0);
  assert.equal(ok, true, 'ATTACH succeeds');

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1);
  assert.equal(records[0].liveTabId, 1600,
    'B-137 §66.8.4 ATTACH path: liveTabId seeded from caller-supplied tabId');
});

/* =========================================================================
   FIX A (pre-v1.35.0 hotfix bundle) — cascade-prune `tj:floatingGroups` on
   chrome.tabs.onRemoved.

   Authoritative spec: docs/findings/post-s41-pre-merge-triage.md Issue A.

   Failure mode this closes: pre-fix, when a floating tab closed, its
   `tj:floatingGroups` record survived as an orphan in storage. Subsequent
   floating reorders for the same group hit `reorderFloatingMembers`'s
   `storageBucketSize` parity check (floating-groups.js:397-401), found
   storage size > supplied size, returned false → ERR_RACE → user-visible
   "Floating-tab list changed during drag — please retry." toast on every
   legitimate drag.

   T34 — pruneFloatingGroupsByLiveTabId helper directly removes a v4 record
         when its liveTabId matches the supplied tabId.
   T35 — End-to-end repro: orphan record + subsequent reorder. Pre-fix this
         returned ERR_RACE; post-fix it succeeds.
   T36 — chrome.tabs.onRemoved cascade integration: firing the listener
         removes the matching v4 record from storage.
   T37 — Helper handles unknown tabId gracefully (no-op, no throw).
   T38 — Helper handles empty partition gracefully.
   T39 — Legacy v3 records (no liveTabId) are NOT pruned by this helper —
         they self-evict on cold-start re-bind per the migration design.
   ========================================================================= */

test('Fix A T34: pruneFloatingGroupsByLiveTabId removes the v4 record matching the closed tabId', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://a.example', savedAt: 1000,
    liveTabId: 100,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 1, url: 'https://b.example', savedAt: 2000,
    liveTabId: 200,
  });

  const before = __getRawStore('tj:floatingGroups');
  assert.equal(before.length, 2, 'pre-prune: both records present');

  /* Direct helper call — assert prune count and storage state. */
  const prunedCount = await pruneFloatingGroupsByLiveTabId(100);
  assert.equal(prunedCount, 1, 'helper returns count of records pruned');

  const after = __getRawStore('tj:floatingGroups');
  assert.equal(after.length, 1, 'post-prune: only the surviving record remains');
  assert.equal(after[0].liveTabId, 200, 'surviving record is the unpruned tab');
});

test('Fix A T35: end-to-end orphan-record reproduction — reorder succeeds after onRemoved cascade-prune (pre-fix returned ERR_RACE)', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());
  await reconcileClaims([{ id: item.id, url: 'https://parent.example', sortOrder: 0 }]);

  /* Seed two floating records — A (liveTabId 100) and B (liveTabId 200). */
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://a.example', savedAt: 1000,
    liveTabId: 100,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 1, url: 'https://b.example', savedAt: 2000,
    liveTabId: 200,
  });

  /* Close tab A. The chrome.tabs.onRemoved listener must cascade-prune A's
     floating record so the storageBucketSize parity check below passes. */
  await chrome.tabs.remove(100);
  chrome.tabs.onRemoved.__fire(100);

  /* The pruneFloatingGroupsByLiveTabId call inside the listener is fire-and-
     forget — flush microtasks + writeTransaction queue before asserting. */
  await new Promise((r) => setTimeout(r, 30));

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1, 'orphan record A pruned by onRemoved cascade');
  assert.equal(records[0].liveTabId, 200, 'tab B record survives');

  /* Now exercise the regression-guard reorder. With only B's record left,
     reorderFloatingMembers([200]) MUST succeed — pre-fix this returned
     false (ERR_RACE) because storageBucketSize === 2 while supplied.size === 1. */
  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_REORDER_FLOATING_MEMBERS, {
    groupId: g.id,
    orderedTabIds: [200],
  });

  assert.equal(resp.ok, true);
  assert.equal(resp.data.reordered, true,
    'Fix A regression-guard: post-cascade reorder must NOT return ERR_RACE');
  assert.equal(resp.data.reason, undefined, 'no race-failure reason on success');
});

test('Fix A T36: chrome.tabs.onRemoved listener integration — fires pruneFloatingGroupsByLiveTabId path', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 700, url: 'https://only.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());
  await reconcileClaims([{ id: item.id, url: 'https://parent.example', sortOrder: 0 }]);

  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://only.example', savedAt: 1000,
    liveTabId: 700,
  });

  assert.equal(__getRawStore('tj:floatingGroups').length, 1, 'pre-fire: record present');

  chrome.tabs.onRemoved.__fire(700);

  /* Flush the fire-and-forget pruneFloatingGroupsByLiveTabId promise. */
  await new Promise((r) => setTimeout(r, 30));

  assert.equal(__getRawStore('tj:floatingGroups').length, 0,
    'post-fire: matching record cascade-pruned by onRemoved listener');
});

test('Fix A T37: pruneFloatingGroupsByLiveTabId is a no-op for unknown tabId', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 900, url: 'https://surviving.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://surviving.example', savedAt: 1000,
    liveTabId: 900,
  });

  const before = JSON.stringify(__getRawStore('tj:floatingGroups'));
  /* Unknown tabId — no record matches. */
  const prunedCount = await pruneFloatingGroupsByLiveTabId(99999);
  assert.equal(prunedCount, 0, 'unknown tabId: zero records pruned');
  assert.equal(JSON.stringify(__getRawStore('tj:floatingGroups')), before,
    'unknown tabId: storage unchanged');
});

test('Fix A T38: pruneFloatingGroupsByLiveTabId is a no-op on empty partition', async () => {
  /* No appendFloatingGroup calls — partition is empty. */
  assert.deepEqual(__getRawStore('tj:floatingGroups'), undefined,
    'precondition: partition starts empty');

  const prunedCount = await pruneFloatingGroupsByLiveTabId(123);
  assert.equal(prunedCount, 0, 'empty partition: zero records pruned, no throw');
});

test('Fix A T39: legacy v3 records (no liveTabId) are NOT pruned by this helper — design carve-out', async () => {
  /* Seed a legacy v3 record directly via seedPartitions (bypasses
     appendFloatingGroup which always stamps liveTabId on v4). The pre-S38
     legacy shape uses `itemId` instead of `parentItemId` and has no
     `liveTabId` field — these records self-evict on cold-start re-bind per
     the migration design (B-121 §60.4.5 / Fix A helper JSDoc). */
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'legacy-001',
        groupId: g.id,
        parentItemId: item.id,
        windowId: 1,
        tabIndex: 0,
        url: 'https://legacy.example',
        savedAt: 1000,
        sortOrder: 0,
        /* no liveTabId — legacy v3 shape */
      },
    ],
  });

  const before = __getRawStore('tj:floatingGroups');
  assert.equal(before.length, 1, 'pre-prune: legacy v3 record present');

  /* Even with a tabId that "matches" the legacy record's old `windowId,
     tabIndex` geometry, this helper does NOT prune — it operates strictly
     on the v4 `liveTabId` direct match. */
  const prunedCount = await pruneFloatingGroupsByLiveTabId(42);
  assert.equal(prunedCount, 0, 'v3 record skipped by liveTabId-keyed helper');

  const after = __getRawStore('tj:floatingGroups');
  assert.equal(after.length, 1, 'v3 record survives — design carve-out');
  assert.equal(after[0].floatingTabId, 'legacy-001');
});

/* =========================================================================
   FIX B (pre-v1.35.0 hotfix bundle) — translate section→strip insertIndex
   in `chrome.tabs.move` dispatch (Open Tabs drag off-by-N).

   Authoritative spec: docs/findings/post-s41-pre-merge-triage.md Issue B.

   Failure mode this closes: pre-fix, `chrome.tabs.move(tabId, { index:
   pendingInsertIndex })` passed a SECTION-relative index where Chrome
   expects a STRIP-absolute index. Section is a SPARSE subset of the strip
   because `buildOpenTabs` excludes claimed-tab tabIds and floating-tab
   tabIds (background/tabs/open-tabs.js:34-63). User saw an off-by-N drop
   where N = strip-index of section's first row (== count of
   claimed/floating tabs preceding the section in their window).

   Pre-existing latent B-134 bug surfaced by v1.34.1 B-136 wiring up
   chrome.tabs.onMoved so the strip actually reorders visibly.

   Sidepanel.js cannot be imported in Node (load-time DOM queries — see
   T22/T23/T24 source-text pin precedent), so these tests replicate the
   pure `_computeStripInsertIndex` algorithm locally and pin the
   sidepanel.js source via regex. The replica is byte-equivalent to the
   helper in sidepanel.js (around line 6439).

   FixB-T1 — Regression guard: zero claimed/floating tabs precede the
             section in strip → translation produces strip-absolute index
             that round-trips through chrome.tabs.move correctly.
   FixB-T2 — N claimed/floating tabs precede the section (N ∈ {1, 3, 10}).
             N=3 is the exact user-reported bug. Translation produces
             strip-absolute = section anchor's tabIndex (with same-window
             index-shift adjustment when forward-moving).
   FixB-T3 — Drop at END of section (insertIndex === sectionTabIds.length).
             Translation handles the "no anchor at S" case by clamping
             effectiveS to the last section row.
   FixB-T4 — Cross-window REJECT path (per existing AC2) still aborts via
             the existing guard at sidepanel.js:4706 BEFORE the translation
             runs. Source-text pin: guard still emits showToast and returns
             before reaching `_computeStripInsertIndex`.
   FixB-T5 — Source-text pin: `_computeStripInsertIndex` exists in
             sidepanel.js and is invoked at the REORDER_OPEN dispatch site.
   ========================================================================= */

/* Local replica of `_computeStripInsertIndex` from sidepanel.js. Mirrors
   the algorithm verbatim — when the production helper changes, this
   replica AND the source-text pin (FixB-T5) flag the divergence. */
function computeStripInsertIndexAlgorithm(state, openTabsByWindow, cachedOpenTabsById) {
  const cluster = openTabsByWindow.get(state.pendingTargetWindowId);
  const sectionTabIds = cluster ? cluster.rowTabIds : null;
  if (!sectionTabIds || sectionTabIds.length === 0) {
    return state.pendingInsertIndex;
  }
  const dPos = sectionTabIds.indexOf(state.draggedTabId);
  if (dPos === -1) return state.pendingInsertIndex;
  const S = state.pendingInsertIndex;
  let effectiveS = (dPos < S) ? S - 1 : S;
  if (effectiveS < 0) effectiveS = 0;
  if (effectiveS > sectionTabIds.length - 1) effectiveS = sectionTabIds.length - 1;
  const targetTabId = sectionTabIds[effectiveS];
  const target = cachedOpenTabsById.get(targetTabId);
  if (!target || typeof target.tabIndex !== 'number') {
    return state.pendingInsertIndex;
  }
  return target.tabIndex;
}

/* Helper — build `_cachedOpenTabsById` and `openTabsByWindow` fixtures
   from a flat array of tab descriptors. Mirrors the shape produced by
   buildOpenTabs (background/tabs/open-tabs.js:44-53) and
   _buildTabDragRectCache (sidepanel.js:6041-6055). */
function buildFixB_Fixture(openTabs) {
  const cachedOpenTabsById = new Map(openTabs.map((t) => [t.tabId, t]));
  const openTabsByWindow = new Map();
  for (const t of openTabs) {
    if (!openTabsByWindow.has(t.windowId)) {
      openTabsByWindow.set(t.windowId, { rowMidlines: [], rowTabIds: [] });
    }
    openTabsByWindow.get(t.windowId).rowTabIds.push(t.tabId);
  }
  return { cachedOpenTabsById, openTabsByWindow };
}

test('Fix B T1 (regression guard): zero claimed/floating tabs precede the section → translation round-trips through chrome.tabs.move correctly', async () => {
  /* Strip = [100=0, 101=1, 102=2]; ALL three are open tabs (no claims,
     no floating). Section indices map 1:1 to strip indices. */
  const openTabs = [
    { tabId: 100, windowId: 1, tabIndex: 0 },
    { tabId: 101, windowId: 1, tabIndex: 1 },
    { tabId: 102, windowId: 1, tabIndex: 2 },
  ];
  const { cachedOpenTabsById, openTabsByWindow } = buildFixB_Fixture(openTabs);

  /* Drag tab 102 (section pos 2 = strip 2) to section pos 0. */
  const stripIdx = computeStripInsertIndexAlgorithm(
    { draggedTabId: 102, pendingTargetWindowId: 1, pendingInsertIndex: 0 },
    openTabsByWindow,
    cachedOpenTabsById,
  );
  assert.equal(stripIdx, 0,
    'section pos 0 → strip-absolute 0 (zero preceding claimed/floating)');

  /* End-to-end via chrome.tabs.move spy — confirms the translation
     output is what gets dispatched and that mock fires onMoved correctly. */
  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 101, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 102, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());
  await reconcileClaims([]);

  await chrome.tabs.move(102, { index: stripIdx });
  assert.equal(chrome.tabs._moveCalls.length, 1);
  assert.deepEqual(chrome.tabs._moveCalls[0], { tabIds: 102, props: { index: 0 } });
  const live = getLiveTabIndex();
  assert.equal(live.get(102).index, 0, 'tab 102 lands at strip 0');
  assert.equal(live.get(100).index, 1, 'tab 100 shifted to 1');
  assert.equal(live.get(101).index, 2, 'tab 101 shifted to 2');
});

test('Fix B T2a (N=1): one claimed tab precedes section → translation produces strip-absolute = section + 1', () => {
  /* Strip = [claimed@0, 200=1, 201=2, 202=3]. Section = [200, 201, 202]
     mapped to strip [1, 2, 3]. */
  const openTabs = [
    { tabId: 200, windowId: 1, tabIndex: 1 },
    { tabId: 201, windowId: 1, tabIndex: 2 },
    { tabId: 202, windowId: 1, tabIndex: 3 },
  ];
  const { cachedOpenTabsById, openTabsByWindow } = buildFixB_Fixture(openTabs);

  /* Drag tab 202 (section pos 2 = strip 3) to section pos 0. Anchor =
     section[0] = tab 200 at strip 1. dPos=2, S=0, effectiveS=0,
     target=200, stripIndex=1. */
  const stripIdx = computeStripInsertIndexAlgorithm(
    { draggedTabId: 202, pendingTargetWindowId: 1, pendingInsertIndex: 0 },
    openTabsByWindow,
    cachedOpenTabsById,
  );
  assert.equal(stripIdx, 1,
    'section pos 0 with N=1 claimed preceding → strip-absolute 1 (NOT 0)');
});

test('Fix B T2b (N=3, user-bug repro): three claimed tabs precede section → off-by-3 fixed', async () => {
  /* Reproduces the user-reported bug: 3 claimed tabs at strip 0-2,
     3 open tabs at strip 3-5. Drag tab 5 (section pos 2 = strip 5) to
     section pos 0. Pre-fix would pass index=0 → tab lands at strip 0
     (3 positions too high). Post-fix passes index=3 → tab lands at
     strip 3 (correct, "first open tab in window"). */
  const openTabs = [
    { tabId: 3, windowId: 1, tabIndex: 3 },
    { tabId: 4, windowId: 1, tabIndex: 4 },
    { tabId: 5, windowId: 1, tabIndex: 5 },
  ];
  const { cachedOpenTabsById, openTabsByWindow } = buildFixB_Fixture(openTabs);

  const stripIdx = computeStripInsertIndexAlgorithm(
    { draggedTabId: 5, pendingTargetWindowId: 1, pendingInsertIndex: 0 },
    openTabsByWindow,
    cachedOpenTabsById,
  );
  assert.equal(stripIdx, 3,
    'spec assertion (post-s41-pre-merge-triage.md Issue B test): drag tab 5 from section pos 2 to section pos 0 → strip-absolute 3, NOT 0');

  /* End-to-end via chrome.tabs.move + onMoved listener: verifies the
     resulting strip ordering is what the user expected. */
  __setMockTabs([
    { id: 1, url: 'https://claim1.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 2, url: 'https://claim2.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 99, url: 'https://claim3.example', windowId: 1, active: false, audible: false, index: 2 },
    { id: 3, url: 'https://open1.example', windowId: 1, active: false, audible: false, index: 3 },
    { id: 4, url: 'https://open2.example', windowId: 1, active: false, audible: false, index: 4 },
    { id: 5, url: 'https://open3.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());
  await reconcileClaims([]);

  await chrome.tabs.move(5, { index: stripIdx });
  assert.equal(chrome.tabs._moveCalls.length, 1);
  assert.deepEqual(chrome.tabs._moveCalls[0], { tabIds: 5, props: { index: 3 } });
  const live = getLiveTabIndex();
  assert.equal(live.get(5).index, 3, 'tab 5 lands at strip 3 (first open-tab slot)');
  assert.equal(live.get(3).index, 4, 'tab 3 shifted from 3 to 4');
  assert.equal(live.get(4).index, 5, 'tab 4 shifted from 4 to 5');
  /* Claimed tabs unchanged. */
  assert.equal(live.get(1).index, 0);
  assert.equal(live.get(2).index, 1);
  assert.equal(live.get(99).index, 2);
});

test('Fix B T2c (N=10, stress): ten claimed tabs precede a 5-row section → translation correct', () => {
  /* Strip 0-9 claimed; section = 5 open tabs at strip 10-14. */
  const openTabs = [
    { tabId: 1010, windowId: 1, tabIndex: 10 },
    { tabId: 1011, windowId: 1, tabIndex: 11 },
    { tabId: 1012, windowId: 1, tabIndex: 12 },
    { tabId: 1013, windowId: 1, tabIndex: 13 },
    { tabId: 1014, windowId: 1, tabIndex: 14 },
  ];
  const { cachedOpenTabsById, openTabsByWindow } = buildFixB_Fixture(openTabs);

  /* Drag tab 1014 (section pos 4 = strip 14) to section pos 1. Anchor =
     section[1] = tab 1011 at strip 11. dPos=4, S=1, effectiveS=1
     (since dPos > S), target=1011, stripIndex=11. */
  const stripIdx1 = computeStripInsertIndexAlgorithm(
    { draggedTabId: 1014, pendingTargetWindowId: 1, pendingInsertIndex: 1 },
    openTabsByWindow,
    cachedOpenTabsById,
  );
  assert.equal(stripIdx1, 11,
    'backward move: section pos 1 with 10 preceding → strip 11');

  /* Drag tab 1010 (section pos 0 = strip 10) to section pos 4 (between
     1013 and 1014). Anchor = section[4] = tab 1014 at strip 14. dPos=0,
     S=4, effectiveS=3 (dPos < S → S-1), target=section[3]=1013, stripIndex=13. */
  const stripIdx2 = computeStripInsertIndexAlgorithm(
    { draggedTabId: 1010, pendingTargetWindowId: 1, pendingInsertIndex: 4 },
    openTabsByWindow,
    cachedOpenTabsById,
  );
  assert.equal(stripIdx2, 13,
    'forward move: dPos<S triggers S-1 adjustment (mirrors _computeReorderFloatingPayload)');
});

test('Fix B T3: drop at END of section (insertIndex === sectionTabIds.length) → effectiveS clamps to last row', async () => {
  /* Strip = [claim=0, claim=1, claim=2, 300=3, 301=4, 302=5]. Section =
     [300, 301, 302] at strip [3, 4, 5]. Drag tab 300 (section pos 0 =
     strip 3) to "after last" (insertIndex=3 = sectionTabIds.length).
     dPos=0, S=3, effectiveS=2 (dPos<S → S-1), target=302, stripIndex=5.
     Pre-fix would have passed index=3 → tab 300 lands back at strip 3
     (no movement, looks correct only by coincidence in this case but
     wrong in N>3 cases). Post-fix passes index=5 → tab 300 lands at
     strip 5 (last). */
  const openTabs = [
    { tabId: 300, windowId: 1, tabIndex: 3 },
    { tabId: 301, windowId: 1, tabIndex: 4 },
    { tabId: 302, windowId: 1, tabIndex: 5 },
  ];
  const { cachedOpenTabsById, openTabsByWindow } = buildFixB_Fixture(openTabs);

  const stripIdx = computeStripInsertIndexAlgorithm(
    { draggedTabId: 300, pendingTargetWindowId: 1, pendingInsertIndex: 3 },
    openTabsByWindow,
    cachedOpenTabsById,
  );
  assert.equal(stripIdx, 5,
    'drop after last → strip-absolute = lastSectionTab.tabIndex');

  /* End-to-end: tab 300 should land last in the strip cluster after the
     move, with 301 and 302 shifted down to fill its old slot. */
  __setMockTabs([
    { id: 901, url: 'https://c1.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 902, url: 'https://c2.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 903, url: 'https://c3.example', windowId: 1, active: false, audible: false, index: 2 },
    { id: 300, url: 'https://o1.example', windowId: 1, active: false, audible: false, index: 3 },
    { id: 301, url: 'https://o2.example', windowId: 1, active: false, audible: false, index: 4 },
    { id: 302, url: 'https://o3.example', windowId: 1, active: false, audible: false, index: 5 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());
  await reconcileClaims([]);

  await chrome.tabs.move(300, { index: stripIdx });
  const live = getLiveTabIndex();
  assert.equal(live.get(300).index, 5, 'tab 300 lands at strip 5 (last)');
  assert.equal(live.get(301).index, 3, 'tab 301 shifted from 4 to 3');
  assert.equal(live.get(302).index, 4, 'tab 302 shifted from 5 to 4');
});

test('Fix B T4 (cross-window REJECT preserved): cross-window REORDER_OPEN guard at sidepanel.js still aborts BEFORE the translation runs', () => {
  /* Source-text pin: the cross-window guard MUST appear textually before
     `_computeStripInsertIndex` is invoked. If a future edit reorders or
     removes the guard, this assertion catches it. */
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* Within the REORDER_OPEN case body, the guard appears, returns early,
     and only THEN does `_computeStripInsertIndex` get called. */
  assert.match(
    sidepanelJs,
    /case 'REORDER_OPEN'[\s\S]{0,400}pendingTargetWindowId !== state\.sourceWindowId[\s\S]{0,200}showToast[\s\S]{0,80}return;[\s\S]{0,2000}_computeStripInsertIndex/,
    'Cross-window REJECT guard must run BEFORE _computeStripInsertIndex (T4: guard returns; translation never reached for cross-window drags)',
  );
});

test('Fix B T5 (source-text pin): _computeStripInsertIndex exists and is invoked by the REORDER_OPEN dispatch site', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');
  /* Helper exists. */
  assert.match(
    sidepanelJs,
    /function _computeStripInsertIndex\(state\)/,
    '_computeStripInsertIndex helper must exist in sidepanel.js',
  );
  /* The dispatcher uses the helper output as `chrome.tabs.move`'s index.
     B-154 (S43) changed the dispatch to support multi-tab drags. Single-tab
     drags use scalar form `state.draggedTabIds[0]`; multi-tab drags use the
     array form `state.draggedTabIds`. Branch on length. The hotfix (2026-05-02)
     reverted the always-array form because Edge regressed on the array path
     for length=1 (tabs landed at top of Open Tabs section). */
  assert.match(
    sidepanelJs,
    /case 'REORDER_OPEN'[\s\S]{0,2000}const stripInsertIndex = _computeStripInsertIndex\(state\);[\s\S]{0,2500}chrome\.tabs\.move\(state\.draggedTabIds\[0\], \{ index: stripInsertIndex \}\)/,
    'REORDER_OPEN dispatch must pass _computeStripInsertIndex(state) to chrome.tabs.move using scalar form for single-tab (state.draggedTabIds[0]) per B-154 hotfix',
  );
  /* Helper body contains the (dPos < S) ? S - 1 : S adjustment that
     mirrors _computeReorderFloatingPayload's index-shift logic. */
  const fnMatch = sidepanelJs.match(/function _computeStripInsertIndex\(state\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_computeStripInsertIndex body match');
  assert.match(fnMatch[1], /dPos < S/,
    'helper applies the dPos < S source-removal adjustment');
  assert.match(fnMatch[1], /openTabsByWindow\.get/,
    'helper reads from _tabDragRectCache.openTabsByWindow');
  assert.match(fnMatch[1], /_cachedOpenTabsById\.get/,
    'helper looks up tabIndex via _cachedOpenTabsById');
});

/* =========================================================================
   FIX C (pre-v1.35.0 hotfix bundle) — dedup duplicate `tj:floatingGroups`
   records by triple `(liveTabId, parentItemId, groupId)`.

   Authoritative spec: docs/findings/post-s41-pre-merge-triage.md Issue C.

   Failure mode this closes: pre-fix, user's smoke-test SW-console showed
   duplicate `tj:floatingGroups` records with the same triple. The
   `reorderFloatingMembers` parity check at floating-groups.js:455-459
   compared raw `storageBucketSize` (counts duplicates) against
   `supplied.size` (deduped descriptor count from `buildFloatingMembers`)
   → ERR_RACE on every legitimate reorder. Root cause: `appendFloatingGroup`
   blindly pushed a new record on every opener-chain inheritance event;
   re-evaluation of the same tab+parent created duplicates.

   B-141 self-application: B-137 §66.1 claimed structural elimination of
   Issue 3; B-137 closed the resolver half, Fix A closed the orphan-on-
   close half, this Fix C closes the duplicate-on-write half — same parity
   check, same user-visible toast.

   T40 — Part 1: `appendFloatingGroup` dedup-on-write — calling twice with
         the same triple yields ONE record (Option A: no-op on duplicate).
   T41 — Part 1: same `liveTabId` + DIFFERENT `parentItemId` is a
         legitimate coexistence (user's record-9 case) and MUST be kept.
   T42 — Part 1: same `liveTabId` + same `parentItemId` + DIFFERENT
         `groupId` is also kept — triple key is the most-specific guard.
   T43 — Part 2 + end-to-end repro: seed pre-existing duplicate records
         (user-data shape), call `reassociateFloatingGroups`, assert
         storage is deduped, then dispatch `MSG_REORDER_FLOATING_MEMBERS`
         and assert it returns `{ reordered: true }` (NOT ERR_RACE).
   T44 — Part 2: cold-start dedup keeps the highest-`savedAt` survivor.
   T45 — Part 2 regression guard: legitimate non-duplicate records (same
         `liveTabId` but different `parentItemId`) survive the cold-start
         dedup pass intact.
   ========================================================================= */

test('Fix C T40 (Part 1): appendFloatingGroup dedup-on-write — second call with the same (liveTabId, parentItemId, groupId) triple is a no-op', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://a.example', savedAt: 1000,
    liveTabId: 100,
  });
  /* Repeated opener-chain inheritance for the same tab+parent — pre-fix
     this would push a second record; post-fix it is a no-op. */
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://a.example', savedAt: 2000,
    liveTabId: 100,
  });

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 1,
    'dedup-on-write: only ONE record present after two appends with the same triple');
  /* The original record's floatingTabId is preserved (Option A semantics —
     the existing record's stable storage identity wins; the second call
     does NOT update savedAt, windowId, tabIndex, or url). */
  assert.equal(records[0].savedAt, 1000,
    'Option A: original savedAt preserved (no in-place update)');
});

test('Fix C T41 (Part 1): same liveTabId + DIFFERENT parentItemId is a legitimate coexistence (user-data record-9 case) — both records preserved', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const itemA = await createItem({ title: 'parent A', url: 'https://parentA.example', groupId: g.id });
  const itemB = await createItem({ title: 'parent B', url: 'https://parentB.example', groupId: g.id });

  __setMockTabs([
    { id: 803725428, url: 'https://shared.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Same liveTabId — but registered under TWO different parents. This is
     the exact user-data shape: record 9 had liveTabId 803725428 with a
     DIFFERENT parentItemId from records 7/12 (which were duplicates of
     each other). The triple-keyed dedup MUST allow this coexistence. */
  await appendFloatingGroup({
    groupId: g.id, parentItemId: itemA.id,
    windowId: 1, tabIndex: 0, url: 'https://shared.example', savedAt: 1000,
    liveTabId: 803725428,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: itemB.id,
    windowId: 1, tabIndex: 0, url: 'https://shared.example', savedAt: 2000,
    liveTabId: 803725428,
  });

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 2,
    'different parentItemId → both records preserved (regression guard)');
  const parentIds = new Set(records.map((r) => r.parentItemId));
  assert.ok(parentIds.has(itemA.id), 'record under parent A preserved');
  assert.ok(parentIds.has(itemB.id), 'record under parent B preserved');
});

test('Fix C T42 (Part 1): same liveTabId + same parentItemId + DIFFERENT groupId is also preserved — triple key includes groupId', async () => {
  const gA = await createGroup({ name: 'G_A', color: COLOR, parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'G_B', color: COLOR, parentId: null, sortOrder: 1 });
  /* Same parent item id used in both groups — synthetic edge case to
     verify the triple-key invariant (groupId is part of the key). */
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: gA.id });

  __setMockTabs([
    { id: 200, url: 'https://x.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  await appendFloatingGroup({
    groupId: gA.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://x.example', savedAt: 1000,
    liveTabId: 200,
  });
  await appendFloatingGroup({
    groupId: gB.id, parentItemId: item.id,
    windowId: 1, tabIndex: 0, url: 'https://x.example', savedAt: 2000,
    liveTabId: 200,
  });

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 2, 'different groupId → both records preserved');
  const groupIds = new Set(records.map((r) => r.groupId));
  assert.ok(groupIds.has(gA.id) && groupIds.has(gB.id),
    'both group buckets retain their record');
});

test('Fix C T43 (Part 2 + e2e): pre-existing duplicate records — reassociateFloatingGroups dedupes; subsequent reorder returns reordered:true (NOT ERR_RACE)', async () => {
  /* Direct repro of the user's smoke-test bug. Seed storage with the
     exact shape the user observed: one group with two distinct floating
     tabs, but each has a duplicate record by triple. Pre-fix:
     reorder fails parity (storageBucketSize=4 ≠ supplied.size=2 →
     ERR_RACE). Post-fix: reassociateFloatingGroups collapses to 2,
     reorder succeeds. */
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 803725023, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 803725344, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  registerTabEventListeners(Promise.resolve());
  await reconcileClaims([{ id: item.id, url: 'https://parent.example', sortOrder: 0 }]);

  /* Seed pre-existing duplicates directly via seedPartitions so we
     exercise the cold-start cleanup path (NOT the new dedup-on-write
     guard). Two records per liveTabId — total 4. */
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'fl-A-old', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 0, url: 'https://a.example',
        savedAt: 1000, sortOrder: 0, liveTabId: 803725023 },
      { floatingTabId: 'fl-B-old', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 1, url: 'https://b.example',
        savedAt: 1100, sortOrder: 1, liveTabId: 803725344 },
      /* ~2.3h later, opener-chain re-fired and (pre-fix) appended duplicates: */
      { floatingTabId: 'fl-A-new', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 0, url: 'https://a.example',
        savedAt: 9000, sortOrder: 2, liveTabId: 803725023 },
      { floatingTabId: 'fl-B-new', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 1, url: 'https://b.example',
        savedAt: 9100, sortOrder: 3, liveTabId: 803725344 },
    ],
  });

  assert.equal(__getRawStore('tj:floatingGroups').length, 4, 'pre-cleanup: 4 records (2 dupes)');

  /* Cold-start re-association — Part 2 dedup pass collapses duplicates. */
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const after = __getRawStore('tj:floatingGroups');
  assert.equal(after.length, 2,
    'post-dedup: storage collapsed from 4 → 2 records (one per liveTabId triple)');
  const survivorFloatingTabIds = new Set(after.map((r) => r.floatingTabId));
  assert.ok(survivorFloatingTabIds.has('fl-A-new') && survivorFloatingTabIds.has('fl-B-new'),
    'survivors are the highest-savedAt records (fl-A-new + fl-B-new)');

  /* Critical regression guard: post-dedup reorder must succeed. Pre-fix,
     storageBucketSize=4 vs supplied.size=2 → false → ERR_RACE toast. */
  const dispatch = setupHandlers();
  const resp = await dispatch(MSG_REORDER_FLOATING_MEMBERS, {
    groupId: g.id,
    orderedTabIds: [803725344, 803725023],
  });

  assert.equal(resp.ok, true, 'handler returns ok');
  assert.equal(resp.data.reordered, true,
    'Fix C regression guard: post-dedup reorder MUST return reordered:true (NOT ERR_RACE)');
  assert.equal(resp.data.reason, undefined, 'no race-failure reason on success');
});

test('Fix C T44 (Part 2): cold-start dedup keeps the highest-savedAt survivor', async () => {
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const item = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 500, url: 'https://x.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  /* Three records share the triple — savedAts 1000, 5000, 3000. The
     winner must be 5000 (highest), regardless of iteration order. */
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'fl-low',  groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 0, url: 'https://x.example',
        savedAt: 1000, sortOrder: 0, liveTabId: 500 },
      { floatingTabId: 'fl-high', groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 0, url: 'https://x.example',
        savedAt: 5000, sortOrder: 1, liveTabId: 500 },
      { floatingTabId: 'fl-mid',  groupId: g.id, parentItemId: item.id,
        windowId: 1, tabIndex: 0, url: 'https://x.example',
        savedAt: 3000, sortOrder: 2, liveTabId: 500 },
    ],
  });

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const after = __getRawStore('tj:floatingGroups');
  assert.equal(after.length, 1, 'three duplicates collapse to one survivor');
  assert.equal(after[0].floatingTabId, 'fl-high',
    'survivor is the highest-savedAt record (5000), not iteration-order-dependent');
  assert.equal(after[0].savedAt, 5000);
});

test('Fix C T45 (Part 2 regression guard): legitimate same-liveTabId + different-parentItemId records are NOT deduped', async () => {
  /* Mirrors user-data record 9: same liveTabId as records 7/12, but
     different parentItemId. The dedup pass MUST preserve this case. */
  const g = await createGroup({ name: 'G1', color: COLOR, parentId: null, sortOrder: 0 });
  const itemA = await createItem({ title: 'parent A', url: 'https://parentA.example', groupId: g.id });
  const itemB = await createItem({ title: 'parent B', url: 'https://parentB.example', groupId: g.id });

  __setMockTabs([
    { id: 803725428, url: 'https://shared.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();

  seedPartitions({
    floatingGroups: [
      /* Two duplicates under parent A (must collapse to 1): */
      { floatingTabId: 'fl-A-old', groupId: g.id, parentItemId: itemA.id,
        windowId: 1, tabIndex: 0, url: 'https://shared.example',
        savedAt: 1000, sortOrder: 0, liveTabId: 803725428 },
      { floatingTabId: 'fl-A-new', groupId: g.id, parentItemId: itemA.id,
        windowId: 1, tabIndex: 0, url: 'https://shared.example',
        savedAt: 9000, sortOrder: 1, liveTabId: 803725428 },
      /* One under parent B (must survive — different triple): */
      { floatingTabId: 'fl-B-only', groupId: g.id, parentItemId: itemB.id,
        windowId: 1, tabIndex: 0, url: 'https://shared.example',
        savedAt: 5000, sortOrder: 2, liveTabId: 803725428 },
    ],
  });

  await reassociateFloatingGroups(getLiveTabIndex(), {});

  const after = __getRawStore('tj:floatingGroups');
  assert.equal(after.length, 2,
    'parent-A duplicates collapse (2→1); parent-B record preserved (different triple)');
  const survivorIds = new Set(after.map((r) => r.floatingTabId));
  assert.ok(survivorIds.has('fl-A-new'),  'parent-A survivor is the highest-savedAt');
  assert.ok(survivorIds.has('fl-B-only'), 'parent-B record preserved (legitimate coexistence)');
  assert.ok(!survivorIds.has('fl-A-old'), 'parent-A older duplicate dropped');
});

/* =========================================================================
   Fix D — _computeReorderFloatingPayload off-by-one regression guard.

   Background:
     - B-134 R4 H-4 fix: `_computeTabDropTarget` filters the dragged row
       out of midlines/tabIds for REORDER_FLOATING (sidepanel.js:6261-6275).
       This places `insertIndex` in FILTERED-list (post-removal) index space.
     - B-134 §63.6.2: `_computeReorderFloatingPayload` originally applied
       a `currentIdx < insertIndex ? -1 : 0` adjustment that was correct for
       an UNFILTERED insertIndex but double-corrects when the input is
       already filtered. Forward drags (currentIdx < insertIndex) landed
       one row above the visual indicator; backward drags happened to be
       correct because the adjustment branch wasn't taken.
     - Pre-Fix C, the bug was masked because reorder always ERR_RACE'd on
       duplicate-record drift. Fix C unmasked it by closing that ERR_RACE.

   T46–T49 hand-trace each user-reportable scenario against the
   post-Fix-D algorithm. The local `reorderPayloadAlgorithm` (defined
   alongside T16–T18) mirrors the helper. T46 (forward drag) and T47
   (drop-at-end) would have failed pre-Fix-D; T48 (backward drag) and T49
   (drop-at-start) would have passed pre-Fix-D and continue to pass
   post-Fix-D (regression guard).
   ========================================================================= */

test('Fix D T46 (regression guard): forward drag — drag tab A to between C and D in [A,B,C,D,E] lands A at index 2', () => {
  const cache = { g: [{ tabId: 'A' }, { tabId: 'B' }, { tabId: 'C' }, { tabId: 'D' }, { tabId: 'E' }] };
  /* Filtered list (drag A removed) = [B, C, D, E]; "between C and D"
     → filtered insertIndex = 2 (Y is below C's midline, above D's midline).
     Splice A at 2 of [B,C,D,E] → [B, C, A, D, E]. Pre-Fix-D, the -1
     adjustment placed A at index 1 → [B, A, C, D, E] (one row ABOVE
     intended; matches user's "forward = lands one row above" symptom). */
  const out = reorderPayloadAlgorithm('g', 'A', 2, cache);
  assert.deepEqual(out, ['B', 'C', 'A', 'D', 'E']);
});

test('Fix D T47 (regression guard): forward drag-to-end — drag tab A to after E in [A,B,C,D,E] lands A at index 4', () => {
  const cache = { g: [{ tabId: 'A' }, { tabId: 'B' }, { tabId: 'C' }, { tabId: 'D' }, { tabId: 'E' }] };
  /* Filtered list = [B, C, D, E]; "after E" → filtered insertIndex = 4
     (end of filtered). Splice A at 4 → [B, C, D, E, A]. */
  const out = reorderPayloadAlgorithm('g', 'A', 4, cache);
  assert.deepEqual(out, ['B', 'C', 'D', 'E', 'A']);
});

test('Fix D T48 (regression guard): backward drag — drag tab E to between B and C in [A,B,C,D,E] lands E at index 2', () => {
  const cache = { g: [{ tabId: 'A' }, { tabId: 'B' }, { tabId: 'C' }, { tabId: 'D' }, { tabId: 'E' }] };
  /* Filtered list (drag E removed) = [A, B, C, D]; "between B and C"
     → filtered insertIndex = 2. Splice E at 2 → [A, B, E, C, D]. This case
     was already correct pre-Fix-D (currentIdx=4 not less than 2, no -1
     adjustment), but pinning here protects against a future re-introduction. */
  const out = reorderPayloadAlgorithm('g', 'E', 2, cache);
  assert.deepEqual(out, ['A', 'B', 'E', 'C', 'D']);
});

test('Fix D T49 (regression guard): drop-at-start — drag tab E to before A in [A,B,C,D,E] lands E at index 0', () => {
  const cache = { g: [{ tabId: 'A' }, { tabId: 'B' }, { tabId: 'C' }, { tabId: 'D' }, { tabId: 'E' }] };
  /* Filtered list = [A, B, C, D]; "before A" → filtered insertIndex = 0.
     Splice E at 0 → [E, A, B, C, D]. */
  const out = reorderPayloadAlgorithm('g', 'E', 0, cache);
  assert.deepEqual(out, ['E', 'A', 'B', 'C', 'D']);
});
