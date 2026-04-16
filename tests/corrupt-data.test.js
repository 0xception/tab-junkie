import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __setRawStore } from './chrome-mock.js';
import { listItems, listGroups, ERR_CORRUPT_DATA } from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('AC8: corrupt items partition → listItems throws ERR_CORRUPT_DATA, listGroups still works', async () => {
  __setRawStore('tj:items', { not: 'an array' });
  __setRawStore('tj:groups', []);
  await assert.rejects(listItems(), (err) => err.code === ERR_CORRUPT_DATA);
  const groups = await listGroups();
  assert.deepEqual(groups, []);
});
