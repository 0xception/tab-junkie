/**
 * b121-floating-group-render.test.js — B-121 R5 (Sprint 38)
 *
 * Coverage:
 *   T-121-A — MSG_LIST_ITEMS response carries floatingMembers keyed by parent's groupId.
 *   T-121-B — buildOpenTabs(floatingTabIds) excludes the floating-tab tabId.
 *   T-121-C — closing a floating tab removes it from floatingMembers on next dispatch.
 *   T-121-E — buildFloatingMembers descriptor shape (DOM contract for renderers).
 *   T-121-G — defensive: navigating a floating tab to a saved URL does not auto-claim (delegates to B-125).
 *   T-121-H — AC7: parent's reconcileClaims claim is NEVER overwritten by reassociateFloatingGroups.
 *   T-121-I — AC8(ii): parent bookmark deletion cascades to a tj:floatingGroups prune.
 *   T-121-J — schema invariants: parent record migrates to parentItemId; floatingTabId stamped.
 *   T-121-K — cold-start re-association leaves matched-unclaimed records in place (runtime path).
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __setMockTabs,
  __setMockWindows,
  __getRawStore,
  seedPartitions,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
  removeTabEntry,
  getLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  __resetTabClaims,
  reconcileClaims,
  reevaluateTab,
  getClaimsMirror,
  markInherited,
} from '../background/tabs/tab-claims.js';
import {
  appendFloatingGroup,
  reassociateFloatingGroups,
  pruneFloatingGroupsByParentItemId,
} from '../background/tabs/floating-groups.js';
import {
  buildFloatingMembers,
  collectFloatingTabIds,
} from '../background/tabs/floating-members.js';
import { buildOpenTabs } from '../background/tabs/open-tabs.js';
import { initWindowOrdinals } from '../background/tabs/window-ordinals.js';
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import {
  _resetMigrationStateForTest,
  _clearMigrationStepsForTest,
  runMigrations,
  KNOWN_VERSION,
} from '../background/storage/migration.js';
import { MSG_LIST_ITEMS, MSG_DELETE_ITEM } from '../shared/messages.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
});

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

/* ---------------------------------------------------------------------------
   T-121-A — MSG_LIST_ITEMS response carries floatingMembers
   --------------------------------------------------------------------------- */

test('T-121-A: MSG_LIST_ITEMS response includes floatingMembers keyed by parent.groupId', async () => {
  /* Seed: parent saved item P in group G. Live tab T_parent claims P;
     a child tab T_child has been recorded as a floating-group member. */
  const parent = {
    id: 'item-P',
    title: 'Parent',
    url: 'https://parent.example/p',
    groupId: 'group-G',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  const group = {
    id: 'group-G',
    name: 'G',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    items: [parent],
    groups: [group],
    floatingGroups: [{
      floatingTabId: 'ft-A',
      groupId: 'group-G',
      parentItemId: 'item-P',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/c',
      savedAt: 1000,
    }],
    meta: { schemaVersion: KNOWN_VERSION },
  });

  __setMockWindows([{ id: 1 }]);
  __setMockTabs([
    { id: 100, url: 'https://parent.example/p', title: 'Parent', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/c', title: 'Child', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await initWindowOrdinals();
  await reconcileClaims([{ id: 'item-P', url: parent.url, sortOrder: 0 }]);

  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const resp = await sendMsg(MSG_LIST_ITEMS, {});
  assert.equal(resp.ok, true);

  const fm = resp.data.floatingMembers;
  assert.ok(fm, 'floatingMembers field present on response');
  assert.ok(Array.isArray(fm['group-G']), 'keyed by parent groupId, not parent itemId');
  assert.equal(fm['group-G'].length, 1);
  assert.equal(fm['group-G'][0].tabId, 200);
  assert.equal(fm['group-G'][0].parentItemId, 'item-P');
  assert.equal(fm['group-G'][0].url, 'https://child.example/c');
});

/* ---------------------------------------------------------------------------
   T-121-A2 (B-197 §79.8.2) — a floating record whose parent is TOP-LEVEL
   (ungrouped) emits under the '__toplevel__' sentinel key; named-group keying
   is preserved (AC19).
   --------------------------------------------------------------------------- */

test('T-121-A2 (B-197): buildFloatingMembers keys an ungrouped-parent floating member under __toplevel__', async () => {
  /* Ungrouped parent P (groupId:null) + a top-level floating record whose own
     groupId is the '__toplevel__' sentinel (§79.9 — the validator requires a
     non-empty string groupId). */
  const parent = {
    id: 'item-TL',
    title: 'Top-level Parent',
    url: 'https://parent.example/tl',
    groupId: null,
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    items: [parent],
    floatingGroups: [{
      floatingTabId: 'ft-TL',
      groupId: '__toplevel__',
      parentItemId: 'item-TL',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/tl',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 100, url: parent.url, windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/tl', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-TL', url: parent.url, sortOrder: 0 }]);

  const fm = await buildFloatingMembers([parent]);

  assert.ok(Array.isArray(fm['__toplevel__']), 'ungrouped-parent floating member keys under the __toplevel__ sentinel');
  assert.equal(fm['__toplevel__'].length, 1);
  assert.equal(fm['__toplevel__'][0].tabId, 200);
  assert.equal(fm['__toplevel__'][0].parentItemId, 'item-TL', 'descriptor carries the ungrouped parent itemId');
  assert.equal(fm['group-G'], undefined, 'no named-group key fabricated for a top-level parent');
  assert.ok(!(null in fm), 'never a null key — the record uses the string sentinel');
});

/* ---------------------------------------------------------------------------
   T-121-B — buildOpenTabs excludes the floating-tab tabId
   --------------------------------------------------------------------------- */

test('T-121-B: buildOpenTabs(floatingTabIds) excludes a floating-group member tab', async () => {
  __setMockTabs([
    { id: 200, url: 'https://child.example/c', windowId: 1, active: false, audible: false, index: 0 },
    { id: 300, url: 'https://other.example/o', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  const all = buildOpenTabs();
  assert.deepStrictEqual(all.map((t) => t.tabId).sort(), [200, 300]);

  const exclSet = new Set([200]);
  const filtered = buildOpenTabs(exclSet);
  assert.deepStrictEqual(filtered.map((t) => t.tabId), [300]);
});

/* ---------------------------------------------------------------------------
   T-121-C — closing a floating tab removes it from floatingMembers
   --------------------------------------------------------------------------- */

test('T-121-C: closing a floating tab drops it from buildFloatingMembers output', async () => {
  const parent = {
    id: 'item-P',
    title: 'Parent',
    url: 'https://parent.example/p',
    groupId: 'group-G',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    floatingGroups: [{
      floatingTabId: 'ft-C',
      groupId: 'group-G',
      parentItemId: 'item-P',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/c',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 100, url: parent.url, windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/c', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-P', url: parent.url, sortOrder: 0 }]);

  let fm = await buildFloatingMembers([parent]);
  assert.equal(fm['group-G'].length, 1);

  /* Close the floating tab. */
  removeTabEntry(200);

  fm = await buildFloatingMembers([parent]);
  /* No live tab matches the record any more — floatingMembers is empty. */
  assert.equal(fm['group-G'], undefined);
});

/* ---------------------------------------------------------------------------
   T-121-E — descriptor shape (renderer DOM contract)
   --------------------------------------------------------------------------- */

test('T-121-E: floatingMember descriptor includes title / favicon / audible / active', async () => {
  const parent = {
    id: 'item-P',
    title: 'Parent',
    url: 'https://parent.example/p',
    groupId: 'group-G',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    floatingGroups: [{
      floatingTabId: 'ft-E',
      groupId: 'group-G',
      parentItemId: 'item-P',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/c',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 100, url: parent.url, windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/c', title: 'Child Title', windowId: 1, active: true, audible: true, index: 1, favIconUrl: 'https://child.example/icon.png' },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-P', url: parent.url, sortOrder: 0 }]);

  const fm = await buildFloatingMembers([parent]);
  const m = fm['group-G'][0];
  assert.equal(m.title, 'Child Title');
  assert.equal(m.favIconUrl, 'https://child.example/icon.png');
  assert.equal(m.audible, true);
  assert.equal(m.active, true);
  assert.equal(m.windowId, 1);
  assert.equal(m.tabIndex, 1);
});

/* ---------------------------------------------------------------------------
   T-121-G — defensive: navigating a floating tab to a saved URL does not
            auto-claim (delegates to B-125's inheritedTabs gate).
   --------------------------------------------------------------------------- */

test('T-121-G: opener-chain-inherited tab navigating to saved URL does NOT auto-claim', async () => {
  /* Saved item B exists; tab T_child is opener-chain-inherited (markInherited
     was called by the SW when appendFloatingGroup resolved). reevaluateTab
     fires when T_child navigates to B.url — the B-125 gate must short-
     circuit the auto-claim branch. */
  __setMockTabs([
    { id: 200, url: 'https://parent.example/p', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  markInherited(200);

  const items = [{ id: 'itemB', url: 'https://itemB.example/q', sortOrder: 0 }];
  await reevaluateTab(200, 'https://itemB.example/q', items);

  const claims = getClaimsMirror();
  assert.equal(claims['itemB'], undefined, 'itemB must remain unclaimed');
});

/* ---------------------------------------------------------------------------
   T-121-H — AC7: parent's claim survives reassociateFloatingGroups
   --------------------------------------------------------------------------- */

test('T-121-H: parent claim from reconcileClaims survives reassociateFloatingGroups', async () => {
  seedPartitions({
    floatingGroups: [{
      floatingTabId: 'ft-H',
      groupId: 'group-G',
      parentItemId: 'item-P',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/c',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 100, url: 'https://parent.example/p', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/c', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  await reconcileClaims([{ id: 'item-P', url: 'https://parent.example/p', sortOrder: 0 }]);
  assert.equal(getClaimsMirror()['item-P'], 100);

  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  /* AC7: parent's claim is unchanged. The §58.4(i) defect would have
     overwritten it with tabId 200. */
  assert.equal(getClaimsMirror()['item-P'], 100);

  /* Floating record retained for runtime render. */
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
});

/* ---------------------------------------------------------------------------
   T-121-I — AC8(ii): parent bookmark deletion cascades a prune
   --------------------------------------------------------------------------- */

test('T-121-I: pruneFloatingGroupsByParentItemId removes records for the deleted parent', async () => {
  seedPartitions({
    floatingGroups: [
      { floatingTabId: 'ft-I-1', groupId: 'g-1', parentItemId: 'item-P', windowId: 1, tabIndex: 0, url: 'https://a.example', savedAt: 1000 },
      { floatingTabId: 'ft-I-2', groupId: 'g-1', parentItemId: 'item-P', windowId: 1, tabIndex: 1, url: 'https://b.example', savedAt: 2000 },
      { floatingTabId: 'ft-I-3', groupId: 'g-2', parentItemId: 'item-Q', windowId: 1, tabIndex: 2, url: 'https://c.example', savedAt: 3000 },
    ],
  });

  await pruneFloatingGroupsByParentItemId('item-P');

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);
  assert.equal(raw[0].parentItemId, 'item-Q');
});

/* ---------------------------------------------------------------------------
   T-121-J — schema invariants: parentItemId rename + floatingTabId stamp
   --------------------------------------------------------------------------- */

test('T-121-J: appendFloatingGroup rename + auto-stamp; legacy itemId migrated on write', async () => {
  /* Modern call shape — uses parentItemId. */
  await appendFloatingGroup({
    groupId: 'g-1',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 0,
    url: 'https://example.org',
    savedAt: 1000,
    liveTabId: 100,
  });

  /* Legacy call shape — uses itemId. The write path migrates to
     parentItemId before persistence (B-121 §60.4.4). */
  await appendFloatingGroup({
    groupId: 'g-2',
    itemId: 'item-2',
    windowId: 1,
    tabIndex: 1,
    url: 'https://example.org/two',
    savedAt: 2000,
    liveTabId: 101,
  });

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 2);
  for (const r of raw) {
    assert.ok(typeof r.floatingTabId === 'string' && r.floatingTabId.length > 0);
    assert.ok(typeof r.parentItemId === 'string' && r.parentItemId.length > 0);
    assert.equal(r.itemId, undefined, 'no itemId field after write');
  }
});

/* ---------------------------------------------------------------------------
   T-121-K — cold-start re-association keeps matched-unclaimed records
   --------------------------------------------------------------------------- */

test('T-121-K: matched-unclaimed records are NOT pruned by reassociateFloatingGroups', async () => {
  seedPartitions({
    floatingGroups: [{
      floatingTabId: 'ft-K',
      groupId: 'group-G',
      parentItemId: 'item-P',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 200, url: 'https://child.example', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();

  /* Empty claimsMirror — child tab is unclaimed. */
  await reassociateFloatingGroups(getLiveTabIndex(), {});

  /* Record retained: runtime path will surface it. */
  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 1);

  /* No claim written by reassociate. */
  assert.equal(Object.keys(getClaimsMirror()).length, 0);
});

/* ---------------------------------------------------------------------------
   T-121-L — collectFloatingTabIds aggregator
   --------------------------------------------------------------------------- */

test('T-121-L: collectFloatingTabIds gathers every member tabId across groups', () => {
  const fm = {
    'g-1': [
      { tabId: 10, parentItemId: 'p-a' },
      { tabId: 11, parentItemId: 'p-b' },
    ],
    'g-2': [
      { tabId: 20, parentItemId: 'p-c' },
    ],
    'g-3': [],
  };
  const set = collectFloatingTabIds(fm);
  assert.equal(set.size, 3);
  assert.ok(set.has(10) && set.has(11) && set.has(20));
});

test('T-121-L: collectFloatingTabIds tolerates missing / empty input', () => {
  assert.equal(collectFloatingTabIds(undefined).size, 0);
  assert.equal(collectFloatingTabIds(null).size, 0);
  assert.equal(collectFloatingTabIds({}).size, 0);
});

/* ---------------------------------------------------------------------------
   T-121-M — MSG_DELETE_ITEM cascade prunes floating-group records via the
            full SW pipeline (integration-style — exercises the handler).
   --------------------------------------------------------------------------- */

test('T-121-M: MSG_DELETE_ITEM cascades a tj:floatingGroups prune for the deleted parent', async () => {
  const parent = {
    id: 'item-cascade',
    title: 'Parent',
    url: 'https://cascade.example',
    groupId: 'g-cascade',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    items: [parent],
    floatingGroups: [{
      floatingTabId: 'ft-M',
      groupId: 'g-cascade',
      parentItemId: 'item-cascade',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example',
      savedAt: 1000,
    }],
    meta: { schemaVersion: KNOWN_VERSION },
  });

  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const resp = await sendMsg(MSG_DELETE_ITEM, { id: 'item-cascade' });
  assert.equal(resp.ok, true);

  const raw = __getRawStore('tj:floatingGroups');
  assert.equal(raw.length, 0, 'parent deletion cascades a prune');
});

/* ---------------------------------------------------------------------------
   T-121-N — buildFloatingMembers skips records whose parent was deleted
            (lazy fallback to AC8(ii)).
   --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   T-121-D — MSG_PROMOTE_TAB on a floating-group member promotes to a saved
            item; the floating member is no longer surfaced by
            buildFloatingMembers (lazy claimedTabIds skip path).
   --------------------------------------------------------------------------- */

test('T-121-D: MSG_PROMOTE_TAB on a floating-tab promotes + claims; member drops from buildFloatingMembers', async () => {
  /* Seed: parent saved item P in group G with a floating-group record
     pointing at a live child tab T_child. */
  const parent = {
    id: 'item-parent-D',
    title: 'Parent',
    url: 'https://parent.example/p',
    groupId: 'group-D',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  const group = {
    id: 'group-D',
    name: 'D',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    items: [parent],
    groups: [group],
    floatingGroups: [{
      floatingTabId: 'ft-D',
      groupId: 'group-D',
      parentItemId: 'item-parent-D',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/d',
      savedAt: 1000,
    }],
    meta: { schemaVersion: KNOWN_VERSION },
  });
  __setMockTabs([
    { id: 100, url: parent.url, title: 'Parent', windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/d', title: 'Child', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: parent.id, url: parent.url, sortOrder: 0 }]);

  /* Sanity: T_child is currently surfaced as a floating member. */
  let fm = await buildFloatingMembers([parent]);
  assert.equal(fm['group-D'].length, 1);
  assert.equal(fm['group-D'][0].tabId, 200);

  /* Promote T_child via the SW dispatcher. */
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;

  const { MSG_PROMOTE_TAB } = await import('../shared/messages.js');
  const promoteResp = await sendMsg(MSG_PROMOTE_TAB, { tabId: 200, groupId: 'group-D' });
  assert.equal(promoteResp.ok, true);
  assert.ok(promoteResp.data && typeof promoteResp.data.id === 'string',
    'promote returns the new saved item');
  const newItemId = promoteResp.data.id;

  /* Claim is established for the new saved item. */
  const claims = getClaimsMirror();
  assert.equal(claims[newItemId], 200);

  /* AC5/AC8(ii) lazy skip path: T_child is now claimed by newItemId, so
     buildFloatingMembers excludes it on the next dispatch. The on-disk
     floating-group record may persist (lazy fallback) — runtime visibility
     is correctly absent regardless. */
  const itemsAfter = [
    parent,
    { ...promoteResp.data },
  ];
  fm = await buildFloatingMembers(itemsAfter);
  const stillFloating = (fm['group-D'] || []).some((m) => m.tabId === 200);
  assert.equal(stillFloating, false,
    'after promote the tab no longer appears as a floating member');
});

/* ---------------------------------------------------------------------------
   T-121-F — newtab `_buildGroupSection` injects synthetic [data-floating="true"]
            rows when floatingMembers[groupId] is non-empty.

   newtab.js helpers are not exported, so the assertion is structural:
   _buildGroupSection consumes the same `member` shape produced by
   buildFloatingMembers, and the floating-row build path adds the
   `data-floating="true"` + `data-tab-id` attributes per §60.5.4. We
   exercise the round-trip by verifying that buildFloatingMembers emits
   descriptors with the renderer-required shape.
   --------------------------------------------------------------------------- */

test('T-121-F: floatingMember descriptors carry the renderer DOM contract (newtab parity)', async () => {
  const parent = {
    id: 'item-parent-F',
    title: 'Parent',
    url: 'https://parent.example/p',
    groupId: 'group-F',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  seedPartitions({
    floatingGroups: [{
      floatingTabId: 'ft-F',
      groupId: 'group-F',
      parentItemId: 'item-parent-F',
      windowId: 1,
      tabIndex: 1,
      url: 'https://child.example/f',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 100, url: parent.url, windowId: 1, active: false, audible: false, index: 0 },
    {
      id: 200,
      url: 'https://child.example/f',
      title: 'Child F',
      favIconUrl: 'https://child.example/icon.png',
      windowId: 1,
      active: true,
      audible: false,
      index: 1,
    },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: parent.id, url: parent.url, sortOrder: 0 }]);

  const fm = await buildFloatingMembers([parent]);
  assert.ok(Array.isArray(fm['group-F']));
  const member = fm['group-F'][0];
  /* The newtab `_buildFloatingTabRow` consumes exactly these fields:
     tabId (-> data-tab-id), parentItemId (-> data-parent-item-id),
     title (-> textContent), url (-> textContent), favIconUrl (-> img.src),
     audible (-> data-audible), active (-> data-active). Asserting the
     descriptor shape here is the test-engineer's contract surrogate for
     the DOM parity covered manually in UAT. */
  assert.equal(typeof member.tabId, 'number');
  assert.equal(typeof member.parentItemId, 'string');
  assert.equal(typeof member.title, 'string');
  assert.equal(typeof member.url, 'string');
  assert.ok(member.favIconUrl === null || typeof member.favIconUrl === 'string');
  assert.equal(typeof member.audible, 'boolean');
  assert.equal(typeof member.active, 'boolean');
  assert.equal(typeof member.windowId, 'number');
  assert.equal(typeof member.tabIndex, 'number');
});

/* ---------------------------------------------------------------------------
   T-121-O (R4 H-2) — buildFloatingMembers dedupes by matched tabId so a
            single live tab cannot appear twice when two records resolve
            to it (legacy v1 + new v2 record for the same parent/tab).
   --------------------------------------------------------------------------- */

test('T-121-O: buildFloatingMembers dedupes when two records resolve to the same tabId', async () => {
  const parent = {
    id: 'item-parent-O',
    title: 'Parent',
    url: 'https://parent.example/p',
    groupId: 'group-O',
    sortOrder: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  /* Two records pointing at the same parent + same windowId/tabIndex/url.
     Pre-fix this produced two descriptors for tabId 200; post-fix only the
     first wins. */
  seedPartitions({
    floatingGroups: [
      {
        floatingTabId: 'ft-O-modern',
        groupId: 'group-O',
        parentItemId: 'item-parent-O',
        windowId: 1,
        tabIndex: 1,
        url: 'https://child.example/o',
        savedAt: 1000,
      },
      {
        /* Legacy-shape record (no floatingTabId, uses itemId) for the same tab. */
        groupId: 'group-O',
        itemId: 'item-parent-O',
        windowId: 1,
        tabIndex: 1,
        url: 'https://child.example/o',
        savedAt: 2000,
      },
    ],
  });
  __setMockTabs([
    { id: 100, url: parent.url, windowId: 1, active: false, audible: false, index: 0 },
    { id: 200, url: 'https://child.example/o', windowId: 1, active: false, audible: false, index: 1 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: parent.id, url: parent.url, sortOrder: 0 }]);

  const fm = await buildFloatingMembers([parent]);
  assert.equal(fm['group-O'].length, 1, 'duplicate descriptor for same tabId is suppressed');
  assert.equal(fm['group-O'][0].tabId, 200);
});

test('T-121-N: buildFloatingMembers skips records whose parent itemId no longer resolves', async () => {
  /* parent doesn't exist in items[] — record should be silently dropped. */
  seedPartitions({
    floatingGroups: [{
      floatingTabId: 'ft-N',
      groupId: 'group-G',
      parentItemId: 'item-DELETED',
      windowId: 1,
      tabIndex: 0,
      url: 'https://orphan.example',
      savedAt: 1000,
    }],
  });
  __setMockTabs([
    { id: 200, url: 'https://orphan.example', windowId: 1, active: false, audible: false, index: 0 },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([]);

  const fm = await buildFloatingMembers([]);
  assert.deepStrictEqual(fm, {}, 'no parent → no floating-member entry');
});
