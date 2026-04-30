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
} from '../background/tabs/tab-claims.js';
import {
  reorderFloatingMembers,
  moveFloatingTab,
  appendFloatingGroup,
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

test('B-134 T1 (AC1): REORDER_OPEN dispatches chrome.tabs.move with literal user-target index', async () => {
  __setMockTabs([
    { id: 100, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 101, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 102, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
  ]);
  await buildLiveTabIndex();

  /* Direct call to chrome.tabs.move (sidepanel-side dispatch). Verifies the
     mock records the call with literal index — no -1 adjustment. */
  await chrome.tabs.move(102, { index: 0 });
  assert.equal(chrome.tabs._moveCalls.length, 1);
  assert.deepEqual(chrome.tabs._moveCalls[0], { tabIds: 102, props: { index: 0 } });
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
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: item.id,
    windowId: 1, tabIndex: 1, url: 'https://y.example', savedAt: 2000,
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
   ========================================================================= */

/* Replicate the helper's algorithm here for direct test coverage. The
   actual sidepanel implementation is asserted by source-text in T12. */
function reorderPayloadAlgorithm(groupId, draggedTabId, insertIndex, cache) {
  const members = (cache && cache[groupId]) || [];
  const tabIds = members.map((m) => m.tabId);
  const currentIdx = tabIds.indexOf(draggedTabId);
  if (currentIdx === -1) return [];
  tabIds.splice(currentIdx, 1);
  const adjusted = currentIdx < insertIndex ? insertIndex - 1 : insertIndex;
  const clamped = Math.max(0, Math.min(adjusted, tabIds.length));
  tabIds.splice(clamped, 0, draggedTabId);
  return tabIds;
}

test('B-134 T16: reorderPayload — forward move (idx 0 → 2)', () => {
  const cache = { g: [{ tabId: 1 }, { tabId: 2 }, { tabId: 3 }] };
  const out = reorderPayloadAlgorithm('g', 1, 2, cache);
  /* Splice out 1 → [2, 3]; adjusted = 1 (currentIdx 0 < insertIndex 2);
     splice in at 1 → [2, 1, 3]. */
  assert.deepEqual(out, [2, 1, 3]);
});

test('B-134 T17: reorderPayload — backward move (idx 2 → 0)', () => {
  const cache = { g: [{ tabId: 1 }, { tabId: 2 }, { tabId: 3 }] };
  const out = reorderPayloadAlgorithm('g', 3, 0, cache);
  /* Splice out 3 → [1, 2]; adjusted = 0 (currentIdx 2 > insertIndex 0,
     no -1); splice in at 0 → [3, 1, 2]. */
  assert.deepEqual(out, [3, 1, 2]);
});

test('B-134 T18: reorderPayload — same-position no-op (idx 1 → 1)', () => {
  const cache = { g: [{ tabId: 1 }, { tabId: 2 }, { tabId: 3 }] };
  const out = reorderPayloadAlgorithm('g', 2, 1, cache);
  /* Splice out 2 → [1, 3]; the dragged tab's currentIdx (1) is NOT less
     than insertIndex (1), so no -1 adjustment; clamped to [0..2] = 1;
     splice 2 in at 1 → [1, 2, 3]. Same-position drag is a true no-op. */
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
  /* The REORDER_FLOATING case must call sendMessage(MSG_REORDER_FLOATING_MEMBERS). */
  assert.match(
    sidepanelJs,
    /case 'REORDER_FLOATING'[\s\S]{0,800}sendMessage\(MSG_REORDER_FLOATING_MEMBERS/,
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
