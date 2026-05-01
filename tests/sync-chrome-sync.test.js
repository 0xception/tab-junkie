import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock, __setMockTabs, __setMockWindows, __setMoveRejectIds } from './chrome-mock.js';
import { createGroup, listGroups, updateGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';
import { syncToChrome } from '../background/sync/chrome-sync.js';

beforeEach(() => {
  __resetMock();
});

test('happy path — 2 groups + 2 ungrouped tabs are reordered and grouped', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/', title: 'A1' },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/', title: 'B1' },
    { id: 21, windowId: 100, index: 2, url: 'https://c.example/', title: 'A2' },
    { id: 31, windowId: 100, index: 3, url: 'https://d.example/', title: 'X' },
    { id: 32, windowId: 100, index: 4, url: 'https://e.example/', title: 'Y' },
  ]);
  const gWork = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: gWork.id, sortOrder: 0 });
  await createItem({ title: 'A2', url: 'https://c.example/', groupId: gWork.id, sortOrder: 1 });
  const gPersonal = await createGroup({ name: 'Personal', color: 'pink', parentId: null, sortOrder: 1 });
  await createItem({ title: 'B1', url: 'https://b.example/', groupId: gPersonal.id, sortOrder: 0 });

  const summary = await syncToChrome(100);
  assert.equal(summary.windowId, 100);
  assert.equal(summary.groupsCreated, 2);
  assert.equal(summary.groupsUpdated, 0);
  assert.equal(summary.skipped.length, 0);

  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 2);
  const work = groups.find((g) => g.title === 'Work');
  const personal = groups.find((g) => g.title === 'Personal');
  assert.equal(work.color, 'blue');
  assert.equal(personal.color, 'pink');

  const tabs = (await chrome.tabs.query({ windowId: 100 })).sort((a, b) => a.index - b.index);
  assert.deepEqual(tabs.map((t) => t.id), [11, 21, 12, 31, 32]);
});

test('re-sync updates existing groups in place — no duplicate Chrome groups', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const groupsAfterFirst = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groupsAfterFirst.length, 1);
  const firstGid = groupsAfterFirst[0].id;

  // Rename the TJ group, re-sync.
  await updateGroup(g.id, { name: 'Work-renamed' });
  const summary = await syncToChrome(100);

  const groupsAfterSecond = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groupsAfterSecond.length, 1, 'no duplicate Chrome groups created');
  assert.equal(groupsAfterSecond[0].id, firstGid, 'same Chrome group ID reused');
  assert.equal(groupsAfterSecond[0].title, 'Work-renamed');
  assert.equal(summary.groupsCreated, 0);
  assert.equal(summary.groupsUpdated, 1);
});

test('stale chromeTabGroupId — Chrome group manually deleted between syncs — fresh create', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const [first] = await chrome.tabGroups.query({ windowId: 100 });
  // User manually deletes the Chrome group between syncs.
  await chrome.tabGroups.remove(first.id);

  const summary = await syncToChrome(100);
  assert.equal(summary.groupsCreated, 1);
  assert.equal(summary.groupsUpdated, 0);
  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 1);
  assert.notEqual(groups[0].id, first.id, 'fresh group id, not the stale one');
});

test('pinned tab is skipped and counted', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/', pinned: false },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/', pinned: true },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });
  await createItem({ title: 'B1', url: 'https://b.example/', groupId: g.id, sortOrder: 1 });

  const summary = await syncToChrome(100);
  const pinnedSkip = summary.skipped.find((s) => s.reason === 'pinned');
  assert.equal(pinnedSkip?.count, 1);
});

test('empty TJ group is skipped silently — no Chrome group created', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g1 = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g1.id, sortOrder: 0 });
  const _g2 = await createGroup({ name: 'EmptyGroup', color: 'red', parentId: null, sortOrder: 1 });

  const summary = await syncToChrome(100);
  assert.equal(summary.groupsCreated, 1);
  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 1);
  // empty group not represented in skipped[] — silent
  assert(!summary.skipped.some((s) => s.reason === 'unknown'));
});

test('multi-window safety — only the target window is affected', async () => {
  __setMockWindows([{ id: 100, focused: true }, { id: 200, focused: false }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
    { id: 12, windowId: 200, index: 0, url: 'https://b.example/' },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });
  await createItem({ title: 'B1', url: 'https://b.example/', groupId: g.id, sortOrder: 1 });

  await syncToChrome(100);

  const groupsW100 = await chrome.tabGroups.query({ windowId: 100 });
  const groupsW200 = await chrome.tabGroups.query({ windowId: 200 });
  assert.equal(groupsW100.length, 1);
  assert.equal(groupsW200.length, 0);
});

test('chromeTabGroupId is persisted to TJ group record after first sync', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const groups = await listGroups();
  const stored = groups.find((x) => x.id === g.id);
  assert.equal(typeof stored.chromeTabGroupId, 'number');
  assert(stored.chromeTabGroupId > 0);
});

test('color mapping — TJ teal becomes Chrome cyan', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'teal', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  await syncToChrome(100);
  const [grp] = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(grp.color, 'cyan');
});

test('tab gone mid-sync — bulk move rejects, per-tab fallback skips one as tab-gone', async () => {
  /* Spec §8.2 mandate: chrome.tabs.move rejects for one tab; verify other
     tabs still moved; summary.skipped includes { reason: 'tab-gone',
     count: 1 }. The mock's __setMoveRejectIds raises a Chrome-realistic
     "No tab with id: N" error so the production _classifyError path is
     exercised end-to-end. */
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/' },
    { id: 13, windowId: 100, index: 2, url: 'https://c.example/' },
  ]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });
  await createItem({ title: 'B', url: 'https://b.example/', groupId: g.id, sortOrder: 1 });
  await createItem({ title: 'C', url: 'https://c.example/', groupId: g.id, sortOrder: 2 });

  /* Tab 12 is "gone" — chrome.tabs.move rejects for it. The bulk move
     rejects on the first inspect; the per-tab fallback then loops, moving
     11 and 13 successfully and skipping 12. */
  __setMoveRejectIds([12]);

  const summary = await syncToChrome(100);
  /* Two tabs moved successfully; one skipped as tab-gone. */
  assert.equal(summary.tabsReordered, 2);
  const tabGoneSkip = summary.skipped.find((s) => s.reason === 'tab-gone');
  assert.equal(tabGoneSkip?.count, 1, 'tab-gone skip recorded with count 1');
  /* No 'unknown' bucket — the predicate matched the realistic error. */
  assert(!summary.skipped.some((s) => s.reason === 'unknown'),
    'tab-gone error should not fall through to "unknown"');
});

test('ungrouped-only window — zero TJ groups, 3 tabs reordered, no Chrome groups created', async () => {
  /* qa-reviewer M-4 (Sprint 42 R4): the spec §2 "Reframe" decision says
     "ungrouped Open Tabs land in the strip in TJ order, but stay ungrouped
     in Chrome." Existing _computeTargetStripOrder unit tests cover the
     pure-function empty-everything case; this end-to-end integration sync
     pins the same behavior on a real ungrouped-only window: 3 tabs, zero
     TJ groups, zero Chrome groups created, all 3 tabs reordered, no
     skipped buckets. */
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/' },
    { id: 13, windowId: 100, index: 2, url: 'https://c.example/' },
  ]);
  /* Deliberately NO createGroup/createItem calls — TJ has zero groups. */

  const summary = await syncToChrome(100);
  assert.equal(summary.windowId, 100);
  assert.equal(summary.groupsCreated, 0, 'no TJ groups → no Chrome groups created');
  assert.equal(summary.groupsUpdated, 0, 'no TJ groups → no Chrome groups updated');
  assert.equal(summary.tabsReordered, 3, 'all 3 ungrouped tabs reordered in strip');
  assert.equal(summary.skipped.length, 0, 'no skipped buckets on a clean ungrouped window');

  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 0, 'no Chrome tab groups created for ungrouped-only window');
});

test('multi-window safety — non-target window tab order preserved', async () => {
  /* qa-reviewer M-4 / AC9 strengthening: the existing multi-window test
     asserts that window 200 has zero Chrome groups after sync of window
     100. This pins the stronger guarantee: window 200's TAB ORDER also
     remains untouched (not just its group count). Confirms _collectWindowState
     filters tabs to the target windowId only. */
  __setMockWindows([{ id: 100, focused: true }, { id: 200, focused: false }]);
  __setMockTabs([
    { id: 11, windowId: 100, index: 0, url: 'https://a.example/' },
    { id: 12, windowId: 100, index: 1, url: 'https://b.example/' },
    /* Window 200 has tabs in a specific order — must NOT be reordered. */
    { id: 21, windowId: 200, index: 0, url: 'https://x.example/' },
    { id: 22, windowId: 200, index: 1, url: 'https://y.example/' },
    { id: 23, windowId: 200, index: 2, url: 'https://z.example/' },
  ]);
  /* TJ items in REVERSE of window 200's order — if the orchestrator
     leaked into window 200, its strip would flip. */
  const g = await createGroup({ name: 'Mixed', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'Z', url: 'https://z.example/', groupId: g.id, sortOrder: 0 });
  await createItem({ title: 'Y', url: 'https://y.example/', groupId: g.id, sortOrder: 1 });
  await createItem({ title: 'X', url: 'https://x.example/', groupId: g.id, sortOrder: 2 });
  await createItem({ title: 'A', url: 'https://a.example/', groupId: g.id, sortOrder: 3 });

  const w200Before = (await chrome.tabs.query({ windowId: 200 }))
    .sort((a, b) => a.index - b.index).map((t) => t.id);

  await syncToChrome(100);

  const w200After = (await chrome.tabs.query({ windowId: 200 }))
    .sort((a, b) => a.index - b.index).map((t) => t.id);
  assert.deepEqual(w200After, w200Before,
    'window 200 tab order must be byte-identical pre-sync and post-sync');

  /* And no group leaked into window 200 either. */
  const groupsW200 = await chrome.tabGroups.query({ windowId: 200 });
  assert.equal(groupsW200.length, 0);
});

test('isSyncInFlight is true during sync, false before/after', async () => {
  __setMockWindows([{ id: 100, focused: true }]);
  __setMockTabs([{ id: 11, windowId: 100, index: 0, url: 'https://a.example/' }]);
  const g = await createGroup({ name: 'Work', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'A1', url: 'https://a.example/', groupId: g.id, sortOrder: 0 });

  const { isSyncInFlight } = await import('../background/sync/chrome-sync.js');
  assert.equal(isSyncInFlight(), false);
  const p = syncToChrome(100);
  // Right after invoking, before await resolves — still synchronous; flag is true.
  assert.equal(isSyncInFlight(), true);
  await p;
  assert.equal(isSyncInFlight(), false);
});
