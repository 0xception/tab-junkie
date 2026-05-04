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
