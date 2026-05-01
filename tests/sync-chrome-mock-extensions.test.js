import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock, __setMockTabs } from './chrome-mock.js';

beforeEach(() => __resetMock());

test('chrome.tabs.move accepts an array of tabIds', async () => {
  __setMockTabs([
    { id: 1, windowId: 100, index: 0, url: 'a' },
    { id: 2, windowId: 100, index: 1, url: 'b' },
    { id: 3, windowId: 100, index: 2, url: 'c' },
  ]);
  await chrome.tabs.move([3, 1, 2], { index: 0, windowId: 100 });
  const tabs = await chrome.tabs.query({ windowId: 100 });
  const ordered = tabs.sort((a, b) => a.index - b.index).map((t) => t.id);
  assert.deepEqual(ordered, [3, 1, 2]);
});

test('chrome.tabs.group creates a new group when no groupId given', async () => {
  __setMockTabs([
    { id: 1, windowId: 100, index: 0, url: 'a' },
    { id: 2, windowId: 100, index: 1, url: 'b' },
  ]);
  const groupId = await chrome.tabs.group({
    tabIds: [1, 2],
    createProperties: { windowId: 100 },
  });
  assert.equal(typeof groupId, 'number');
  assert.notEqual(groupId, -1);
  const groups = await chrome.tabGroups.query({ windowId: 100 });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, groupId);
});

test('chrome.tabs.group adds tabs to an existing group when groupId given', async () => {
  __setMockTabs([
    { id: 1, windowId: 100, index: 0, url: 'a' },
    { id: 2, windowId: 100, index: 1, url: 'b' },
    { id: 3, windowId: 100, index: 2, url: 'c' },
  ]);
  const gid = await chrome.tabs.group({ tabIds: [1, 2], createProperties: { windowId: 100 } });
  await chrome.tabs.group({ tabIds: [3], groupId: gid });
  const tab3 = await chrome.tabs.get(3);
  assert.equal(tab3.groupId, gid);
});

test('chrome.tabGroups.update sets title and color', async () => {
  __setMockTabs([{ id: 1, windowId: 100, index: 0, url: 'a' }]);
  const gid = await chrome.tabs.group({ tabIds: [1], createProperties: { windowId: 100 } });
  await chrome.tabGroups.update(gid, { title: 'Work', color: 'blue' });
  const g = await chrome.tabGroups.get(gid);
  assert.equal(g.title, 'Work');
  assert.equal(g.color, 'blue');
});

test('chrome.tabGroups.get rejects on missing groupId', async () => {
  await assert.rejects(() => chrome.tabGroups.get(99999));
});

test('chrome.tabs.ungroup removes tabs from their groups', async () => {
  __setMockTabs([{ id: 1, windowId: 100, index: 0, url: 'a' }]);
  const gid = await chrome.tabs.group({ tabIds: [1], createProperties: { windowId: 100 } });
  await chrome.tabs.ungroup([1]);
  const t = await chrome.tabs.get(1);
  assert.equal(t.groupId, -1);
});
