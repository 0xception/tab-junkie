/**
 * group-delete-cascade.test.js — B-006 AC5, AC6, AC7
 * AC5: items → ungrouped on delete
 * AC6: child groups → top-level on delete
 * AC7: atomic cascade (single write-tx), empty-group delete, idempotent delete
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __resetSetCallCount, __setCallCount } from './chrome-mock.js';
import {
  createGroup,
  deleteGroup,
  createItem,
  listItems,
  listGroups,
} from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';

const COLOR = GROUP_COLORS[0];
beforeEach(() => __resetMock());

test('AC5: items in deleted group are reparented to groupId=null (ungrouped)', async () => {
  const g = await createGroup({ name: 'G', color: COLOR, parentId: null });
  await createItem({ title: 'A', url: 'https://a.example.com', groupId: g.id });
  await createItem({ title: 'B', url: 'https://b.example.com', groupId: g.id });
  await deleteGroup(g.id);
  const items = await listItems();
  assert.equal(items.length, 2);
  for (const it of items) assert.equal(it.groupId, null);
});

test('AC6: child groups of deleted group are reparented to parentId=null (top-level)', async () => {
  const parent = await createGroup({ name: 'Parent', color: COLOR, parentId: null });
  const child = await createGroup({ name: 'Child', color: COLOR, parentId: parent.id });
  await deleteGroup(parent.id);
  const groups = await listGroups();
  const stored = groups.find((g) => g.id === child.id);
  assert.ok(stored, 'child group should still exist');
  assert.equal(stored.parentId, null, 'child group should be promoted to top-level');
});

test('AC7: cascade is atomic — items and groups are updated in a single write transaction', async () => {
  const g = await createGroup({ name: 'G', color: COLOR, parentId: null });
  const child = await createGroup({ name: 'Child', color: COLOR, parentId: g.id });
  await createItem({ title: 'Item', url: 'https://item.example.com', groupId: g.id });

  __resetSetCallCount();
  await deleteGroup(g.id);
  assert.equal(__setCallCount(), 1, 'cascade must land in a single chrome.storage.local.set call');

  const groups = await listGroups();
  assert.equal(groups.find((gr) => gr.id === g.id), undefined, 'deleted group should not exist');
  const storedChild = groups.find((gr) => gr.id === child.id);
  assert.equal(storedChild.parentId, null);
  const items = await listItems();
  assert.equal(items[0].groupId, null);
});

test('AC7: deleting a group with no items or children succeeds silently', async () => {
  const g = await createGroup({ name: 'Empty', color: COLOR, parentId: null });
  await assert.doesNotReject(() => deleteGroup(g.id));
  const groups = await listGroups();
  assert.equal(groups.find((gr) => gr.id === g.id), undefined);
});

test('AC7: deleting an already-deleted group is idempotent (no error)', async () => {
  const g = await createGroup({ name: 'G', color: COLOR, parentId: null });
  await deleteGroup(g.id);
  await assert.doesNotReject(() => deleteGroup(g.id));
});

test('AC7: deleting unknown id is idempotent (no error, no state change)', async () => {
  const g = await createGroup({ name: 'Stays', color: COLOR, parentId: null });
  await assert.doesNotReject(() => deleteGroup('non-existent-id'));
  const groups = await listGroups();
  assert.ok(groups.find((gr) => gr.id === g.id), 'existing group should be untouched');
});
