import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock, __setMockTabs, __setMockWindows } from './chrome-mock.js';
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
