import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import {
  listItems,
  listGroups,
  createItem,
  ERR_NOT_FOUND,
} from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('AC2: listItems returns [] on fresh state', async () => {
  const items = await listItems();
  assert.deepEqual(items, []);
});

test('AC2: listGroups returns [] on fresh state', async () => {
  const groups = await listGroups();
  assert.deepEqual(groups, []);
});

test('C2: createItem with null groupId succeeds', async () => {
  const it = await createItem({ title: 'hi', url: 'https://example.com', groupId: null });
  assert.equal(it.groupId, null);
});

test('C2: createItem with unknown groupId throws ERR_NOT_FOUND', async () => {
  await assert.rejects(
    createItem({ title: 'x', url: 'https://example.com', groupId: 'nope-not-real' }),
    (err) => err.code === ERR_NOT_FOUND,
  );
});
