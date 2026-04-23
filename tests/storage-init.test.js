import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import { initializePartitions, ALL_PARTITIONS } from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('AC1: initializePartitions seeds all partition keys on fresh mock', async () => {
  await initializePartitions();
  for (const p of ALL_PARTITIONS) {
    const v = __getRawStore(`tj:${p}`);
    assert.notStrictEqual(v, undefined, `tj:${p} should be defined`);
  }
  /* B-022 §39.3 D-3 — `tj:recency` added in Sprint 26, raising the count
     from 6 to 7. Any new partition must update this assertion + add its
     own coverage (see b022-quick-search.test.js — R5). */
  assert.equal(ALL_PARTITIONS.length, 7);
});

test('AC1: initializePartitions is idempotent', async () => {
  await initializePartitions();
  const snap1 = JSON.stringify({
    items: __getRawStore('tj:items'),
    groups: __getRawStore('tj:groups'),
    prefs: __getRawStore('tj:prefs'),
  });
  await initializePartitions();
  const snap2 = JSON.stringify({
    items: __getRawStore('tj:items'),
    groups: __getRawStore('tj:groups'),
    prefs: __getRawStore('tj:prefs'),
  });
  assert.equal(snap1, snap2);
});
