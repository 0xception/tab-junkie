import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import {
  deleteItem,
  deleteGroup,
  listItems,
  listGroups,
  createItem,
  createGroup,
} from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('H6 / ruling #3: deleteItem("unknown") is a silent no-op', async () => {
  await createItem({ title: 'a', url: 'https://a.example.com', groupId: null });
  const before = await listItems();
  const r = await deleteItem('definitely-not-a-real-id');
  assert.equal(r, undefined);
  const after = await listItems();
  assert.deepEqual(after, before);
});

test('H6 / ruling #3: deleteGroup("unknown") is a silent no-op', async () => {
  await createGroup({ name: 'g', color: 'red', parentId: null });
  const before = await listGroups();
  const r = await deleteGroup('definitely-not-a-real-id');
  assert.equal(r, undefined);
  const after = await listGroups();
  assert.deepEqual(after, before);
});
