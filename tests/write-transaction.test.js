import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setCallCount,
  __resetSetCallCount,
  __triggerQuotaOnNextSet,
  __getRawStore,
} from './chrome-mock.js';
import { writeTransaction } from '../background/storage/write-transaction.js';
import {
  ERR_TX_CONFLICT,
  ERR_QUOTA_EXCEEDED,
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_PREFS,
  initializePartitions,
} from '../background/storage/index.js';
import { DEFAULT_PREFERENCES } from '../background/storage/partitions.js';

beforeEach(async () => {
  __resetMock();
  await initializePartitions();
  __resetSetCallCount();
});

test('AC6: 3-op writeTransaction results in exactly 1 chrome.storage.local.set call', async () => {
  await writeTransaction([
    { partition: PARTITION_ITEMS, mutator: (items) => items },
    { partition: PARTITION_GROUPS, mutator: (groups) => groups },
    { partition: PARTITION_PREFS, mutator: (p) => ({ ...DEFAULT_PREFERENCES, ...p }) },
  ]);
  assert.equal(__setCallCount(), 1);
});

test('AC6: mutator throws → 0 set calls, ERR_TX_CONFLICT surfaced, pre-state intact', async () => {
  const before = JSON.stringify(__getRawStore('tj:items'));
  __resetSetCallCount();
  await assert.rejects(
    writeTransaction([
      { partition: PARTITION_ITEMS, mutator: () => { throw new Error('boom'); } },
    ]),
    (err) => err.code === ERR_TX_CONFLICT,
  );
  assert.equal(__setCallCount(), 0);
  assert.equal(JSON.stringify(__getRawStore('tj:items')), before);
});

test('AC6: quota-rejected set → ERR_QUOTA_EXCEEDED', async () => {
  __triggerQuotaOnNextSet();
  await assert.rejects(
    writeTransaction([
      { partition: PARTITION_ITEMS, mutator: (items) => items },
    ]),
    (err) => err.code === ERR_QUOTA_EXCEEDED,
  );
});
