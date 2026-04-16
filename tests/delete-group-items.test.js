import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setCallCount, __resetSetCallCount } from './chrome-mock.js';
import {
  createGroup,
  deleteGroup,
  createItem,
  listItems,
  listGroups,
} from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('AC7: deleteGroup reparents items to null and removes group in one tx', async () => {
  const g = await createGroup({ name: 'g', color: 'red', parentId: null });
  await createItem({ title: 'a', url: 'https://a.example.com', groupId: g.id });
  await createItem({ title: 'b', url: 'https://b.example.com', groupId: g.id });
  await createItem({ title: 'c', url: 'https://c.example.com', groupId: g.id });

  __resetSetCallCount();
  await deleteGroup(g.id);
  assert.equal(__setCallCount(), 1, 'cascade should be a single tx');

  const items = await listItems();
  assert.equal(items.length, 3);
  for (const it of items) assert.equal(it.groupId, null);

  const groups = await listGroups();
  assert.equal(groups.find((gr) => gr.id === g.id), undefined);
});
