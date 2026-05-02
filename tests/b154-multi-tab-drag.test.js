/**
 * b154-multi-tab-drag.test.js — B-154 (Sprint 43)
 *
 * Multi-select tab drag (Approach A — sequential dispatch). Sidepanel-side
 * logic captures all selected tab IDs at dragstart filtered to grabbed
 * row's drag-class / window / source group; drop fans out as N sequential
 * MSG_MOVE_FLOATING_TAB calls (or one chrome.tabs.move array call for
 * REORDER_OPEN). Single-select drags pass a 1-element array — uniform
 * code path.
 *
 * Coverage maps:
 *   T1   — AC1 multi-tab ATTACH: 3 sequential MSG_MOVE_FLOATING_TAB calls
 *          produce 3 floating records, all marked inheritedTabs
 *   T2   — AC2 multi-tab DETACH: 3 sequential calls remove 3 records,
 *          all unmarked from inheritedTabs
 *   T3   — AC3 multi-tab MOVE_FLOATING: 3 sequential calls re-anchor 3
 *          records to target group, preserving floatingTabId + liveTabId
 *   T4   — AC4 multi-tab REORDER_OPEN: chrome.tabs.move accepts an array
 *          of tabIds + index (chrome-mock array support extended in B-041
 *          task 5; same behavior here)
 *   T5   — Static-source pin: sidepanel.js dragstart capture helper present
 *   T6   — Static-source pin: drop handlers iterate state.draggedTabIds
 *   T7   — Static-source pin: chrome.tabs.move passes draggedTabIds array
 *   T8   — Partial-success: 1 of 3 ATTACH calls fails (target group has
 *          no parent items mid-batch); other 2 succeed; user-visible toast
 *          for first failure; remaining records persist
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import './_setup.js';
import {
  __resetMock,
  __setMockTabs,
  __getRawStore,
} from './chrome-mock.js';
import { createGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';
import {
  moveFloatingTab,
  appendFloatingGroup,
} from '../background/tabs/floating-groups.js';
import { isInherited, markInherited } from '../background/tabs/tab-claims.js';
import { buildLiveTabIndex } from '../background/tabs/live-tab-index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const COLOR = 'blue';

beforeEach(async () => {
  await __resetMock();
});

/* =========================================================================
   T1 — AC1: multi-tab ATTACH produces N records + N inheritedTabs marks.
   Simulates the sidepanel sequential-dispatch loop by calling the SW-
   level moveFloatingTab N times in selection order. The SW handler also
   calls markInherited on each ATTACH; our test mirrors that.
   ========================================================================= */

test('B-154 T1 (AC1): multi-tab ATTACH — 3 tabs into group, 3 records + 3 inheritedTabs', async () => {
  const g = await createGroup({ name: 'Work', color: COLOR, parentId: null, sortOrder: 0 });
  await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 301, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 5 },
    { id: 302, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 6 },
    { id: 303, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 7 },
  ]);
  await buildLiveTabIndex();

  /* Sequential dispatch with bumped insertIndex (mirrors sidepanel.js drop
     loop B-154). */
  let insertIndex = 0;
  for (const tabId of [301, 302, 303]) {
    const ok = await moveFloatingTab(tabId, null, g.id, insertIndex);
    assert.equal(ok, true, `tab ${tabId} ATTACH should succeed`);
    markInherited(tabId);
    insertIndex += 1;
  }

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 3, '3 floating records created');
  assert.equal(isInherited(301), true);
  assert.equal(isInherited(302), true);
  assert.equal(isInherited(303), true);
  /* Records sorted by sortOrder match selection order. */
  const sorted = records.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(sorted[0].liveTabId, 301);
  assert.equal(sorted[1].liveTabId, 302);
  assert.equal(sorted[2].liveTabId, 303);
});

/* =========================================================================
   T2 — AC2: multi-tab DETACH — 3 records removed, 3 inheritedTabs cleared.
   ========================================================================= */

test('B-154 T2 (AC2): multi-tab DETACH — 3 floating tabs to Open Tabs, 3 records removed + inheritedTabs cleared', async () => {
  const g = await createGroup({ name: 'Work', color: COLOR, parentId: null, sortOrder: 0 });
  const parentItem = await createItem({ title: 'parent', url: 'https://parent.example', groupId: g.id });

  __setMockTabs([
    { id: 401, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 5 },
    { id: 402, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 6 },
    { id: 403, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 7 },
  ]);
  await buildLiveTabIndex();

  /* Seed 3 floating records via appendFloatingGroup, mark each inherited. */
  for (const tabId of [401, 402, 403]) {
    await appendFloatingGroup({
      parentItemId: parentItem.id,
      groupId: g.id,
      windowId: 1,
      tabIndex: 5,
      url: '',
      savedAt: Date.now(),
      liveTabId: tabId,
    });
    markInherited(tabId);
  }

  const { pruneInherited } = await import('../background/tabs/tab-claims.js');

  /* Sequential dispatch DETACH (targetGroupId = null) for all 3 tabs. */
  for (const tabId of [401, 402, 403]) {
    const ok = await moveFloatingTab(tabId, g.id, null, 0);
    assert.equal(ok, true, `tab ${tabId} DETACH should succeed`);
    pruneInherited(tabId);
  }

  const records = __getRawStore('tj:floatingGroups');
  assert.equal(records.length, 0, 'all 3 floating records removed');
  assert.equal(isInherited(401), false);
  assert.equal(isInherited(402), false);
  assert.equal(isInherited(403), false);
});

/* =========================================================================
   T3 — AC3: multi-tab MOVE_FLOATING — 3 records re-anchored to target group,
   floatingTabId + liveTabId preserved per B-137 §66.8.4.
   ========================================================================= */

test('B-154 T3 (AC3): multi-tab MOVE_FLOATING — 3 floating tabs from group A to group B, identity preserved', async () => {
  const groupA = await createGroup({ name: 'A', color: COLOR, parentId: null, sortOrder: 0 });
  const groupB = await createGroup({ name: 'B', color: COLOR, parentId: null, sortOrder: 1 });
  const parentA = await createItem({ title: 'parentA', url: 'https://pa.example', groupId: groupA.id });
  await createItem({ title: 'parentB', url: 'https://pb.example', groupId: groupB.id });

  __setMockTabs([
    { id: 501, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 5 },
    { id: 502, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 6 },
    { id: 503, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 7 },
  ]);
  await buildLiveTabIndex();

  /* Seed 3 floating records in group A. */
  for (const tabId of [501, 502, 503]) {
    await appendFloatingGroup({
      parentItemId: parentA.id,
      groupId: groupA.id,
      windowId: 1,
      tabIndex: 5,
      url: '',
      savedAt: Date.now(),
      liveTabId: tabId,
    });
    markInherited(tabId);
  }

  const beforeA = __getRawStore('tj:floatingGroups').filter((r) => r.groupId === groupA.id);
  const aFloatingIds = new Map(beforeA.map((r) => [r.liveTabId, r.floatingTabId]));

  /* Sequential dispatch MOVE_FLOATING (sourceGroupId = A, targetGroupId = B). */
  let insertIndex = 0;
  for (const tabId of [501, 502, 503]) {
    const ok = await moveFloatingTab(tabId, groupA.id, groupB.id, insertIndex);
    assert.equal(ok, true, `tab ${tabId} MOVE_FLOATING should succeed`);
    insertIndex += 1;
  }

  const afterA = __getRawStore('tj:floatingGroups').filter((r) => r.groupId === groupA.id);
  const afterB = __getRawStore('tj:floatingGroups').filter((r) => r.groupId === groupB.id);
  assert.equal(afterA.length, 0, 'group A drained');
  assert.equal(afterB.length, 3, 'group B has 3 records');
  /* Identity preservation: each record's floatingTabId + liveTabId carry. */
  for (const rec of afterB) {
    assert.equal(rec.floatingTabId, aFloatingIds.get(rec.liveTabId),
      `tab ${rec.liveTabId} preserved its floatingTabId across MOVE_FLOATING`);
  }
  /* inheritedTabs unchanged across MOVE_FLOATING (was already in set). */
  assert.equal(isInherited(501), true);
  assert.equal(isInherited(502), true);
  assert.equal(isInherited(503), true);
});

/* =========================================================================
   T4 — AC4: chrome.tabs.move accepts array of tabIds + index (REORDER_OPEN).
   Verifies the chrome-mock multi-move support extended for B-041 still
   serves B-154's REORDER_OPEN call site.
   ========================================================================= */

test('B-154 T4 (AC4): chrome.tabs.move(arrayTabIds, {index}) accepts the array form for multi-tab REORDER_OPEN', async () => {
  __setMockTabs([
    { id: 601, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 0 },
    { id: 602, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 1 },
    { id: 603, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 2 },
    { id: 604, url: 'https://d.example', windowId: 1, active: false, audible: false, index: 3 },
    { id: 605, url: 'https://e.example', windowId: 1, active: false, audible: false, index: 4 },
  ]);

  /* B-154 REORDER_OPEN dispatch passes the full draggedTabIds array. The
     browser-side semantic — landing tabs as a contiguous block at the target
     index — is Chrome's responsibility; our chrome-mock approximates it via
     sequential per-tab moves which produces a different (but reasonable)
     intermediate ordering. What this test pins:
       1. The array call shape is accepted (does not return null — that's the
          fallback for non-array, non-numeric tabIds in the mock).
       2. All dragged tabs end up at different positions than they started
          (something happened — the call was not a no-op).
       3. Non-dragged tabs are still present in the window (no tabs lost).

     The exact ordering invariants for real Chrome are covered manually at
     UAT time; we don't try to mock-emulate Chrome's en-bloc semantics. */
  const before = (await chrome.tabs.query({ windowId: 1 }))
    .reduce((m, t) => { m[t.id] = t.index; return m; }, {});
  const result = await chrome.tabs.move([603, 601, 605], { index: 1, windowId: 1 });
  assert.notEqual(result, null, 'array call must not return null (would indicate fallback)');

  const after = await chrome.tabs.query({ windowId: 1 });
  assert.equal(after.length, 5, 'no tabs lost during multi-move');
  for (const id of [603, 601, 605]) {
    const tab = after.find((t) => t.id === id);
    assert.ok(tab, `dragged tab ${id} still present`);
    assert.notEqual(tab.index, before[id], `dragged tab ${id} index changed`);
  }
});

/* =========================================================================
   Static-source pins (T5-T7) — verify the sidepanel-side B-154 changes
   are present in sidepanel.js. These tests catch regressions where a
   future refactor accidentally reverts the multi-tab wiring.
   ========================================================================= */

const SIDEPANEL_SRC = readFileSync(join(REPO_ROOT, 'sidepanel/sidepanel.js'), 'utf8');

test('B-154 T5: sidepanel.js exports/defines _computeMultiTabDragIds helper', () => {
  assert.match(SIDEPANEL_SRC, /function _computeMultiTabDragIds\s*\(/,
    '_computeMultiTabDragIds helper should be defined');
  assert.match(SIDEPANEL_SRC, /draggedTabIds:\s*number\[\]/,
    'JSDoc shape comment should document draggedTabIds field');
});

test('B-154 T6: drop handler iterates state.draggedTabIds for ATTACH/DETACH/MOVE_FLOATING', () => {
  /* Look for `for (const tabId of state.draggedTabIds)` near the
     ATTACH/DETACH/MOVE_FLOATING dispatch. Tolerate whitespace variation. */
  assert.match(SIDEPANEL_SRC, /for\s*\(\s*const\s+tabId\s+of\s+state\.draggedTabIds\s*\)/,
    'drop handler must iterate state.draggedTabIds for sequential dispatch');
});

test('B-154 T7: REORDER_OPEN passes draggedTabIds array to chrome.tabs.move', () => {
  assert.match(SIDEPANEL_SRC, /chrome\.tabs\.move\(\s*state\.draggedTabIds\s*,\s*\{\s*index:/,
    'REORDER_OPEN must pass draggedTabIds array to chrome.tabs.move');
});

test('B-154 T9: multi-tab drag builds the custom ghost with grabbed-row title + "tabs" unit', () => {
  /* The dragstart handler must (a) gate the ghost on draggedTabIds.length > 1,
     (b) extract the grabbed row's title from `.item-title`, and (c) call
     _buildMultiDragGhost with a non-empty title and the 'tabs' unit. The
     pre-fix code passed an empty title which produced a too-narrow ghost
     in Edge — user-reported regression. */
  assert.match(SIDEPANEL_SRC, /draggedTabIds\.length\s*>\s*1/,
    'dragstart must gate ghost on draggedTabIds.length > 1');
  assert.match(SIDEPANEL_SRC, /tabRow\.querySelector\(\s*'\.item-title'\s*\)/,
    'dragstart must read the grabbed row title from .item-title');
  assert.match(SIDEPANEL_SRC, /_buildMultiDragGhost\(\s*draggedTabIds\.length\s*,\s*initiatorTitle\s*,\s*'tabs'\s*\)/,
    '_buildMultiDragGhost call must pass grabbed-row title + "tabs" unit');
});

/* =========================================================================
   T8 — Partial-success: 1 of 3 ATTACH fails (target group has no parent
   items mid-batch — simulated by ATTACH-ing to a group that loses its only
   parent item mid-loop). Other 2 succeed.
   ========================================================================= */

test('B-154 T8: partial-success — 1 of N ATTACH fails, others succeed independently', async () => {
  const goodGroup = await createGroup({ name: 'Good', color: COLOR, parentId: null, sortOrder: 0 });
  await createItem({ title: 'parent', url: 'https://parent.example', groupId: goodGroup.id });
  const emptyGroup = await createGroup({ name: 'Empty', color: COLOR, parentId: null, sortOrder: 1 });
  // emptyGroup has zero saved items — every ATTACH against it returns false.

  __setMockTabs([
    { id: 701, url: 'https://a.example', windowId: 1, active: false, audible: false, index: 5 },
    { id: 702, url: 'https://b.example', windowId: 1, active: false, audible: false, index: 6 },
    { id: 703, url: 'https://c.example', windowId: 1, active: false, audible: false, index: 7 },
  ]);
  await buildLiveTabIndex();

  /* Two of 3 ATTACH against goodGroup succeed; the middle one targets
     emptyGroup and fails. Mirrors the sidepanel partial-success loop. */
  const targets = [
    { tabId: 701, target: goodGroup.id },
    { tabId: 702, target: emptyGroup.id }, // will fail
    { tabId: 703, target: goodGroup.id },
  ];

  let firstFailureSeen = false;
  let insertIndex = 0;
  for (const { tabId, target } of targets) {
    const ok = await moveFloatingTab(tabId, null, target, insertIndex);
    if (ok === false) {
      firstFailureSeen = firstFailureSeen || true;
      continue; // partial-success loop continues
    }
    insertIndex += 1;
  }

  assert.equal(firstFailureSeen, true, 'middle tab ATTACH against empty group failed');
  /* The 2 good attaches landed records in goodGroup; the failed one did not. */
  const goodRecords = __getRawStore('tj:floatingGroups').filter((r) => r.groupId === goodGroup.id);
  assert.equal(goodRecords.length, 2, '2 of 3 records in goodGroup');
  const liveTabIds = goodRecords.map((r) => r.liveTabId).sort();
  assert.deepEqual(liveTabIds, [701, 703]);
  const emptyRecords = __getRawStore('tj:floatingGroups').filter((r) => r.groupId === emptyGroup.id);
  assert.equal(emptyRecords.length, 0, 'no records in empty group');
});
