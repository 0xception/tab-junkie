import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock } from './chrome-mock.js';
import { createGroup, getGroup } from '../background/storage/groups.js';
import { createItem } from '../background/storage/items.js';

beforeEach(async () => __resetMock());

test('B-148 8a: createItem appends item:<id> to target Group.renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8a: createItem with no groupId (Ungrouped) does NOT throw', async () => {
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: null, sortOrder: 0 });
  /* Just verify no throw — Ungrouped items don't have a Group to update. */
  assert.equal(it.groupId, null);
});

test('B-148 8a: two createItem calls in same group append in order', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'T1', url: 'https://x.example/1', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'T2', url: 'https://x.example/2', groupId: g.id, sortOrder: 1 });
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it1.id, 'item:' + it2.id]);
});

test('B-148 8b: deleteItem strips item:<id> from owning Group.renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { deleteItem } = await import('../background/storage/items.js');
  await deleteItem(it.id);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, []);
});

test('B-148 8b: deleteItem with multiple items strips only the deleted ref', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'T1', url: 'https://x.example/1', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'T2', url: 'https://x.example/2', groupId: g.id, sortOrder: 1 });
  const { deleteItem } = await import('../background/storage/items.js');
  await deleteItem(it1.id);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it2.id]);
});

test('B-148 8b: deleteItem on unknown id is a no-op (idempotent)', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { deleteItem } = await import('../background/storage/items.js');
  await deleteItem('NONEXISTENT');
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8c: updateItem({groupId}) strips from source + appends to target Group renderOrder', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: gA.id, sortOrder: 0 });
  const { updateItem } = await import('../background/storage/items.js');
  await updateItem(it.id, { groupId: gB.id });
  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  assert.deepEqual(gAAfter.renderOrder, []);
  assert.deepEqual(gBAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8c: updateItem({groupId: null}) detach strips source only', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { updateItem } = await import('../background/storage/items.js');
  await updateItem(it.id, { groupId: null });
  const gAfter = await getGroup(g.id);
  assert.deepEqual(gAfter.renderOrder, []);
});

test('B-148 8c: updateItem({groupId: g}) attach from Ungrouped appends target only', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: null, sortOrder: 0 });
  const { updateItem } = await import('../background/storage/items.js');
  await updateItem(it.id, { groupId: g.id });
  const gAfter = await getGroup(g.id);
  assert.deepEqual(gAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8c: updateItem with no groupId in patch leaves renderOrder unchanged', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { updateItem } = await import('../background/storage/items.js');
  await updateItem(it.id, { title: 'New title' });
  const gAfter = await getGroup(g.id);
  assert.deepEqual(gAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8c: updateItem({groupId: same}) is a no-op for renderOrder (no duplicate)', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { updateItem } = await import('../background/storage/items.js');
  await updateItem(it.id, { groupId: g.id });
  const gAfter = await getGroup(g.id);
  assert.deepEqual(gAfter.renderOrder, ['item:' + it.id]);
});

test('B-148 8d: bulkCreateItems appends multiple item:<id> refs to target Group renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const { bulkCreateItems } = await import('../background/storage/items.js');
  const result = await bulkCreateItems([
    { title: 'A', url: 'https://x.example/A', groupId: g.id },
    { title: 'B', url: 'https://x.example/B', groupId: g.id },
    { title: 'C', url: 'https://x.example/C', groupId: g.id },
  ]);
  assert.equal(result.created.length, 3);
  const groupAfter = await getGroup(g.id);
  assert.equal(groupAfter.renderOrder.length, 3);
  /* Append-in-input-order. */
  assert.deepEqual(groupAfter.renderOrder, result.created.map((it) => 'item:' + it.id));
});

test('B-148 8d: bulkCreateItems splits refs across multiple target groups', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  const { bulkCreateItems } = await import('../background/storage/items.js');
  const result = await bulkCreateItems([
    { title: 'A1', url: 'https://x.example/A1', groupId: gA.id },
    { title: 'B1', url: 'https://x.example/B1', groupId: gB.id },
    { title: 'A2', url: 'https://x.example/A2', groupId: gA.id },
  ]);
  assert.equal(result.created.length, 3);
  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  assert.equal(gAAfter.renderOrder.length, 2);
  assert.equal(gBAfter.renderOrder.length, 1);
});

test('B-148 8d: bulkCreateItems skips Ungrouped (groupId null) from any Group write', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const { bulkCreateItems } = await import('../background/storage/items.js');
  const result = await bulkCreateItems([
    { title: 'A', url: 'https://x.example/A', groupId: g.id },
    { title: 'B', url: 'https://x.example/B', groupId: null },
  ]);
  assert.equal(result.created.length, 2);
  const groupAfter = await getGroup(g.id);
  assert.equal(groupAfter.renderOrder.length, 1);
  assert.match(groupAfter.renderOrder[0], /^item:/);
});

test('B-148 8d: bulkCreateItems skipped FK-failed candidate is not in renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const { bulkCreateItems } = await import('../background/storage/items.js');
  const result = await bulkCreateItems([
    { title: 'A', url: 'https://x.example/A', groupId: g.id },
    { title: 'B', url: 'https://x.example/B', groupId: 'GHOST_GROUP_ID' },
  ]);
  assert.equal(result.created.length, 1);
  assert.equal(result.skipped.length, 1);
  const groupAfter = await getGroup(g.id);
  /* Only the successful one should be in renderOrder. */
  assert.equal(groupAfter.renderOrder.length, 1);
  assert.equal(groupAfter.renderOrder[0], 'item:' + result.created[0].id);
});

test('B-148 8e: bulkDeleteItems strips multiple item:<id> refs from owning Group renderOrders', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'B', url: 'https://x.example/B', groupId: g.id, sortOrder: 1 });
  const { bulkDeleteItems } = await import('../background/storage/items.js');
  await bulkDeleteItems([it1.id, it2.id]);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, []);
});

test('B-148 8e: bulkDeleteItems splits strips across multiple owning groups', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  const itA = await createItem({ title: 'A1', url: 'https://x.example/A1', groupId: gA.id, sortOrder: 0 });
  const itB = await createItem({ title: 'B1', url: 'https://x.example/B1', groupId: gB.id, sortOrder: 0 });
  const { bulkDeleteItems } = await import('../background/storage/items.js');
  await bulkDeleteItems([itA.id, itB.id]);
  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  assert.deepEqual(gAAfter.renderOrder, []);
  assert.deepEqual(gBAfter.renderOrder, []);
});

test('B-148 8e: bulkDeleteItems strips only deleted refs, preserves siblings', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'B', url: 'https://x.example/B', groupId: g.id, sortOrder: 1 });
  const it3 = await createItem({ title: 'C', url: 'https://x.example/C', groupId: g.id, sortOrder: 2 });
  const { bulkDeleteItems } = await import('../background/storage/items.js');
  await bulkDeleteItems([it1.id, it3.id]);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it2.id]);
});

test('B-148 8e: bulkDeleteItems with notFound ids does not corrupt renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 });
  const { bulkDeleteItems } = await import('../background/storage/items.js');
  const result = await bulkDeleteItems([it.id, 'GHOST_ID_1', 'GHOST_ID_2']);
  assert.equal(result.deleted.length, 1);
  assert.equal(result.notFound.length, 2);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, []);
});

test('B-148 9a: appendFloatingGroup appends floating:<id> to target Group.renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { appendFloatingGroup } = await import('../background/tabs/floating-groups.js');
  await appendFloatingGroup({
    groupId: g.id,
    parentItemId: it.id,
    windowId: 1,
    tabIndex: 0,
    url: 'https://x.example/',
    savedAt: Date.now(),
    liveTabId: 9001,
  });
  const groupAfter = await getGroup(g.id);
  /* renderOrder should now have: ['item:<it.id>', 'floating:<the new ulid>'] */
  assert.equal(groupAfter.renderOrder.length, 2);
  assert.equal(groupAfter.renderOrder[0], 'item:' + it.id);
  assert.match(groupAfter.renderOrder[1], /^floating:[A-Z0-9]+$/);
});

test('B-148 9a: appendFloatingGroup dedup path does NOT touch renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const { appendFloatingGroup } = await import('../background/tabs/floating-groups.js');
  const entry = {
    groupId: g.id,
    parentItemId: it.id,
    windowId: 1,
    tabIndex: 0,
    url: 'https://x.example/',
    savedAt: Date.now(),
    liveTabId: 9001,
  };
  await appendFloatingGroup(entry);
  const lengthAfterFirst = (await getGroup(g.id)).renderOrder.length;
  /* Second call with identical (liveTabId, parentItemId, groupId) → dedup */
  await appendFloatingGroup(entry);
  const groupAfter = await getGroup(g.id);
  assert.equal(groupAfter.renderOrder.length, lengthAfterFirst, 'dedup path must NOT add a duplicate floating ref');
});

test('B-148 9a: appendFloatingGroup early-return on validation fail does NOT touch renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/', groupId: g.id, sortOrder: 0 });
  const groupBefore = await getGroup(g.id);
  const { appendFloatingGroup } = await import('../background/tabs/floating-groups.js');
  /* Missing required field — silently rejected */
  await appendFloatingGroup({
    groupId: g.id,
    parentItemId: it.id,
    /* windowId missing */
    tabIndex: 0,
    url: 'https://x.example/',
    savedAt: Date.now(),
    liveTabId: 9001,
  });
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, groupBefore.renderOrder);
});

test('B-148 9b: moveFloatingTab MOVE_FLOATING strips source + appends target renderOrder', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  const itA = await createItem({ title: 'A', url: 'https://x.example/A', groupId: gA.id, sortOrder: 0 });
  const itB = await createItem({ title: 'B', url: 'https://x.example/B', groupId: gB.id, sortOrder: 0 });

  const { appendFloatingGroup, moveFloatingTab } = await import('../background/tabs/floating-groups.js');
  /* Seed the live tab via chrome.tabs.create so chrome.tabs.get(tabId) succeeds. */
  const tab = await chrome.tabs.create({ url: 'https://x.example/F', windowId: 1 });
  await appendFloatingGroup({
    groupId: gA.id, parentItemId: itA.id, windowId: tab.windowId,
    tabIndex: tab.index, url: tab.url, savedAt: Date.now(), liveTabId: tab.id,
  });
  /* Verify the source append happened. */
  const gABefore = await getGroup(gA.id);
  assert.equal(gABefore.renderOrder.length, 2); /* item:itA + floating:<new> */

  /* Move the floating tab from gA → gB. */
  const ok = await moveFloatingTab(tab.id, gA.id, gB.id, 0);
  assert.equal(ok, true);

  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  /* gA.renderOrder loses the floating ref. */
  assert.equal(gAAfter.renderOrder.length, 1);
  assert.equal(gAAfter.renderOrder[0], 'item:' + itA.id);
  /* gB.renderOrder gains the floating ref (preserved floatingTabId). */
  assert.equal(gBAfter.renderOrder.length, 2);
  assert.equal(gBAfter.renderOrder[0], 'item:' + itB.id);
  assert.match(gBAfter.renderOrder[1], /^floating:[A-Z0-9]+$/);
});

test('B-148 9b: moveFloatingTab DETACH strips source.renderOrder only', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/T', groupId: g.id, sortOrder: 0 });
  const { appendFloatingGroup, moveFloatingTab } = await import('../background/tabs/floating-groups.js');
  const tab = await chrome.tabs.create({ url: 'https://x.example/F', windowId: 1 });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: it.id, windowId: tab.windowId,
    tabIndex: tab.index, url: tab.url, savedAt: Date.now(), liveTabId: tab.id,
  });
  const gBefore = await getGroup(g.id);
  assert.equal(gBefore.renderOrder.length, 2);

  /* DETACH (targetGroupId = null) — note: sourceGroupId === null && targetGroupId === null is rejected,
     and sourceGroupId === targetGroupId is rejected; DETACH path is sourceGroupId set, targetGroupId null. */
  const ok = await moveFloatingTab(tab.id, g.id, null, 0);
  assert.equal(ok, true);

  const gAfter = await getGroup(g.id);
  assert.equal(gAfter.renderOrder.length, 1);
  assert.equal(gAfter.renderOrder[0], 'item:' + it.id);
});

test('B-148 9b: moveFloatingTab ATTACH appends target.renderOrder only', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/T', groupId: g.id, sortOrder: 0 });
  const { moveFloatingTab } = await import('../background/tabs/floating-groups.js');
  const tab = await chrome.tabs.create({ url: 'https://x.example/F', windowId: 1 });

  /* ATTACH (sourceGroupId = null) — the target group has at least one saved item to anchor under. */
  const ok = await moveFloatingTab(tab.id, null, g.id, 0);
  assert.equal(ok, true);

  const gAfter = await getGroup(g.id);
  assert.equal(gAfter.renderOrder.length, 2); /* item:it + floating:<freshUlid> */
  assert.equal(gAfter.renderOrder[0], 'item:' + it.id);
  assert.match(gAfter.renderOrder[1], /^floating:[A-Z0-9]+$/);
});

test('B-148 9b: moveFloatingTab race-fail (source missing) does NOT touch any renderOrder', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  await createItem({ title: 'A', url: 'https://x.example/A', groupId: gA.id, sortOrder: 0 });
  await createItem({ title: 'B', url: 'https://x.example/B', groupId: gB.id, sortOrder: 0 });
  /* No floating record exists for tabId 99999 in gA — race-fail. */
  const tab = await chrome.tabs.create({ url: 'https://x.example/F', windowId: 1 });
  const { moveFloatingTab } = await import('../background/tabs/floating-groups.js');
  const ok = await moveFloatingTab(tab.id, gA.id, gB.id, 0);
  assert.equal(ok, false, 'race-fail expected because no source record exists in gA for this tabId');
  /* Neither group's renderOrder changes. */
  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  assert.equal(gAAfter.renderOrder.length, 1); /* just the item ref */
  assert.equal(gBAfter.renderOrder.length, 1);
});

test('B-148 9c: pruneFloatingGroupsByLiveTabId strips floating:<id> from owning Group.renderOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/T', groupId: g.id, sortOrder: 0 });
  const { appendFloatingGroup, pruneFloatingGroupsByLiveTabId } = await import('../background/tabs/floating-groups.js');
  const tab = await chrome.tabs.create({ url: 'https://x.example/F', windowId: 1 });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: it.id, windowId: tab.windowId,
    tabIndex: tab.index, url: tab.url, savedAt: Date.now(), liveTabId: tab.id,
  });
  const gBefore = await getGroup(g.id);
  assert.equal(gBefore.renderOrder.length, 2);

  /* Tab close → prune */
  const prunedCount = await pruneFloatingGroupsByLiveTabId(tab.id);
  assert.equal(prunedCount, 1);

  const gAfter = await getGroup(g.id);
  assert.equal(gAfter.renderOrder.length, 1);
  assert.equal(gAfter.renderOrder[0], 'item:' + it.id);
});

test('B-148 9c: pruneFloatingGroupsByLiveTabId no-records fast-path leaves all renderOrders unchanged', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/T', groupId: g.id, sortOrder: 0 });
  const gBefore = await getGroup(g.id);
  const { pruneFloatingGroupsByLiveTabId } = await import('../background/tabs/floating-groups.js');
  /* No floating record exists for this tabId — fast-path returns 0. */
  const prunedCount = await pruneFloatingGroupsByLiveTabId(99999);
  assert.equal(prunedCount, 0);
  const gAfter = await getGroup(g.id);
  assert.deepEqual(gAfter.renderOrder, gBefore.renderOrder);
});

test('B-148 9c: pruneFloatingGroupsByParentItemId strips all floating:<id> refs under the parent', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it = await createItem({ title: 'T', url: 'https://x.example/T', groupId: g.id, sortOrder: 0 });
  const { appendFloatingGroup, pruneFloatingGroupsByParentItemId } = await import('../background/tabs/floating-groups.js');
  const tab1 = await chrome.tabs.create({ url: 'https://x.example/F1', windowId: 1 });
  const tab2 = await chrome.tabs.create({ url: 'https://x.example/F2', windowId: 1 });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: it.id, windowId: tab1.windowId,
    tabIndex: tab1.index, url: tab1.url, savedAt: Date.now(), liveTabId: tab1.id,
  });
  await appendFloatingGroup({
    groupId: g.id, parentItemId: it.id, windowId: tab2.windowId,
    tabIndex: tab2.index, url: tab2.url, savedAt: Date.now(), liveTabId: tab2.id,
  });
  const gBefore = await getGroup(g.id);
  assert.equal(gBefore.renderOrder.length, 3); /* item:it + 2 floating refs */

  /* Delete the parent item → prune all 2 floating records */
  await pruneFloatingGroupsByParentItemId(it.id);
  const gAfter = await getGroup(g.id);
  /* Only the parent item ref remains in renderOrder. (Note: pruneFloatingGroupsByParentItemId
     does NOT remove the item itself — only the floating cascade.) */
  assert.equal(gAfter.renderOrder.length, 1);
  assert.equal(gAfter.renderOrder[0], 'item:' + it.id);
});

/* B-148 9d helpers — invoke handler via chrome.runtime.onMessage, matching
   the pattern established in b134-tab-drag-reorder.test.js §setupHandlers. */
import { registerStorageHandlers } from '../background/messages/storage-handlers.js';
import { MSG_REORDER_FLOATING_MEMBERS } from '../shared/messages.js';

function setupReorderHandlers() {
  registerStorageHandlers(Promise.resolve());
  const listener = chrome.runtime.onMessage._listeners[
    chrome.runtime.onMessage._listeners.length - 1
  ];
  return (type, payload) => new Promise((resolve) => {
    listener({ type, payload }, { id: chrome.runtime.id }, resolve);
  });
}

test('B-148 9d: MSG_REORDER_FLOATING_MEMBERS with renderOrder writes Group.renderOrder directly', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const it1 = await createItem({ title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 });
  const it2 = await createItem({ title: 'B', url: 'https://x.example/B', groupId: g.id, sortOrder: 1 });

  const dispatch = setupReorderHandlers();
  const resp = await dispatch(MSG_REORDER_FLOATING_MEMBERS, {
    groupId: g.id,
    renderOrder: ['item:' + it2.id, 'item:' + it1.id],
  });
  assert.equal(resp.data.reordered, true);
  const groupAfter = await getGroup(g.id);
  assert.deepEqual(groupAfter.renderOrder, ['item:' + it2.id, 'item:' + it1.id]);
});

test('B-148 9d: MSG_REORDER_FLOATING_MEMBERS with renderOrder rejects bad shape', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const dispatch = setupReorderHandlers();
  const resp = await dispatch(MSG_REORDER_FLOATING_MEMBERS, {
    groupId: g.id,
    renderOrder: ['url:bad-prefix'],
  });
  assert.equal(resp.data.reordered, false);
  assert.equal(resp.data.reason, 'ERR_VALIDATION');
});

test('B-148 9d: MSG_REORDER_FLOATING_MEMBERS legacy orderedTabIds path unchanged', async () => {
  /* Verifies the new branch did not break the existing payload contract.
     A tab ID with no floating record → ERR_RACE because the legacy path
     reaches reorderFloatingMembers, which asserts the live floating set. */
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  await createItem({ title: 'T', url: 'https://x.example/T', groupId: g.id, sortOrder: 0 });
  const dispatch = setupReorderHandlers();
  const resp = await dispatch(MSG_REORDER_FLOATING_MEMBERS, {
    groupId: g.id,
    orderedTabIds: [12345], /* no floating record exists for tab 12345 → race */
  });
  /* Legacy path delegates to reorderFloatingMembers; race-guard returns false. */
  assert.equal(resp.data.reordered, false); /* ERR_RACE from race-guard */
});

test('B-148 10: commitImport bootstraps renderOrder for every imported group from imported items', async () => {
  const { commitImport } = await import('../background/import/commit.js');
  const now = Date.now();
  const groups = [
    { id: 'g1', name: 'A', color: 'blue', parentId: null, sortOrder: 0, collapsed: false, createdAt: now, updatedAt: now },
    { id: 'g2', name: 'B', color: 'red', parentId: null, sortOrder: 1, collapsed: false, createdAt: now, updatedAt: now },
  ];
  const items = [
    /* g1: 3 items, intentionally out-of-order sortOrder */
    { id: 'i1', title: 'A1', url: 'https://x.example/A1', groupId: 'g1', sortOrder: 2, createdAt: now, updatedAt: now },
    { id: 'i2', title: 'A2', url: 'https://x.example/A2', groupId: 'g1', sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 'i3', title: 'A3', url: 'https://x.example/A3', groupId: 'g1', sortOrder: 1, createdAt: now, updatedAt: now },
    /* g2: 1 item */
    { id: 'i4', title: 'B1', url: 'https://x.example/B1', groupId: 'g2', sortOrder: 0, createdAt: now, updatedAt: now },
    /* Ungrouped item — does NOT contribute to any group's renderOrder */
    { id: 'i5', title: 'U', url: 'https://x.example/U', groupId: null, sortOrder: 0, createdAt: now, updatedAt: now },
  ];
  await commitImport({ items, groups });

  const g1 = await getGroup('g1');
  const g2 = await getGroup('g2');
  /* g1.renderOrder should be sorted by sortOrder asc → i2, i3, i1. */
  assert.deepEqual(g1.renderOrder, ['item:i2', 'item:i3', 'item:i1']);
  /* g2.renderOrder has the single item. */
  assert.deepEqual(g2.renderOrder, ['item:i4']);
});

test('B-148 10: commitImport with empty group sets renderOrder to []', async () => {
  const { commitImport } = await import('../background/import/commit.js');
  const now = Date.now();
  const groups = [
    { id: 'g1', name: 'Empty', color: 'blue', parentId: null, sortOrder: 0, collapsed: false, createdAt: now, updatedAt: now },
  ];
  await commitImport({ items: [], groups });
  const g = await getGroup('g1');
  assert.deepEqual(g.renderOrder, []);
});

test('B-148 hotfix: bulkReorderItems reshuffles Group.renderOrder item: slots to match new sortOrder', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const itA = await createItem({ title: 'A', url: 'https://x.example/A', groupId: g.id, sortOrder: 0 });
  const itB = await createItem({ title: 'B', url: 'https://x.example/B', groupId: g.id, sortOrder: 1 });
  const itC = await createItem({ title: 'C', url: 'https://x.example/C', groupId: g.id, sortOrder: 2 });
  /* Pre-condition — renderOrder built by createItem appends. */
  const gBefore = await getGroup(g.id);
  assert.deepEqual(gBefore.renderOrder, ['item:' + itA.id, 'item:' + itB.id, 'item:' + itC.id]);

  /* Reorder: A → end (so new order is B, C, A). */
  const { bulkReorderItems } = await import('../background/storage/items.js');
  await bulkReorderItems([
    { id: itA.id, sortOrder: 2 },
    { id: itB.id, sortOrder: 0 },
    { id: itC.id, sortOrder: 1 },
  ]);

  const gAfter = await getGroup(g.id);
  assert.deepEqual(gAfter.renderOrder, ['item:' + itB.id, 'item:' + itC.id, 'item:' + itA.id]);
});

test('B-148 hotfix: bulkReorderItems preserves floating: ref positions in interleaved renderOrder', async () => {
  /* Seed manually so we can plant a floating: ref between item: refs. */
  await __resetMock();
  const itA = { id: 'iA', title: 'A', url: 'https://x.example/A', groupId: 'g1', sortOrder: 0, createdAt: 1, updatedAt: 1 };
  const itB = { id: 'iB', title: 'B', url: 'https://x.example/B', groupId: 'g1', sortOrder: 1, createdAt: 1, updatedAt: 1 };
  const group = {
    id: 'g1', name: 'G', color: 'blue', parentId: null, sortOrder: 0, collapsed: false,
    createdAt: 1, updatedAt: 1,
    /* Interleaved renderOrder — saved/floating/saved. */
    renderOrder: ['item:iA', 'floating:F1', 'item:iB'],
  };
  const { writeTransaction } = await import('../background/storage/write-transaction.js');
  const { PARTITION_GROUPS, PARTITION_ITEMS } = await import('../background/storage/partitions.js');
  await writeTransaction([
    { partition: PARTITION_GROUPS, mutator: () => [group] },
    { partition: PARTITION_ITEMS, mutator: () => [itA, itB] },
  ]);

  /* Reorder: swap A and B. */
  const { bulkReorderItems } = await import('../background/storage/items.js');
  await bulkReorderItems([
    { id: 'iA', sortOrder: 1 },
    { id: 'iB', sortOrder: 0 },
  ]);

  const gAfter = await getGroup('g1');
  /* Floating ref position preserved at slot 1; item: slots reshuffled. */
  assert.deepEqual(gAfter.renderOrder, ['item:iB', 'floating:F1', 'item:iA']);
});

test('B-148 hotfix: bulkReorderItems cross-group strips item: from source group renderOrder', async () => {
  const gA = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const gB = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1 });
  const it = await createItem({ title: 'T', url: 'https://x.example/T', groupId: gA.id, sortOrder: 0 });
  const gABefore = await getGroup(gA.id);
  assert.deepEqual(gABefore.renderOrder, ['item:' + it.id]);

  const { bulkReorderItems } = await import('../background/storage/items.js');
  await bulkReorderItems([
    { id: it.id, sortOrder: 0, groupId: gB.id },
  ]);

  const gAAfter = await getGroup(gA.id);
  const gBAfter = await getGroup(gB.id);
  assert.deepEqual(gAAfter.renderOrder, []);
  /* Target group renderOrder gets the moved item appended at end. */
  assert.deepEqual(gBAfter.renderOrder, ['item:' + it.id]);
});
