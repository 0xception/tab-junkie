import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { writeTransaction } from '../background/storage/write-transaction.js';
import { PARTITION_ITEMS, ERR_TX_CONFLICT } from '../background/storage/index.js';
import { initializePartitions, listItems } from '../background/storage/index.js';

beforeEach(async () => {
  __resetMock();
  await initializePartitions();
});

function fakeItem(id) {
  const now = Date.now();
  return { id, title: id, url: `https://example.com/${id}`, groupId: null, sortOrder: 0, createdAt: now, updatedAt: now };
}

test('AC10: two unawaited writeTransactions both apply in order, no lost update', async () => {
  const p1 = writeTransaction([
    { partition: PARTITION_ITEMS, mutator: (items) => [...items, fakeItem('a')] },
  ]);
  const p2 = writeTransaction([
    { partition: PARTITION_ITEMS, mutator: (items) => [...items, fakeItem('b')] },
  ]);
  await Promise.all([p1, p2]);
  const items = await listItems();
  const ids = items.map((it) => it.id);
  assert.deepEqual(ids, ['a', 'b']);
});

test('AC10: tx A rejection does not block tx B (queue continuity)', async () => {
  const pA = writeTransaction([
    { partition: PARTITION_ITEMS, mutator: () => { throw new Error('fail A'); } },
  ]);
  const pB = writeTransaction([
    { partition: PARTITION_ITEMS, mutator: (items) => [...items, fakeItem('b-only')] },
  ]);

  await assert.rejects(pA, (e) => e.code === ERR_TX_CONFLICT);
  await pB;

  const items = await listItems();
  assert.equal(items.length, 1);
  assert.equal(items[0].id, 'b-only');
});
