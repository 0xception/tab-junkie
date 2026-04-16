import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import { initializePartitions, ALL_PARTITIONS } from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('AC1: initializePartitions seeds all 6 partition keys on fresh mock', async () => {
  await initializePartitions();
  for (const p of ALL_PARTITIONS) {
    const v = __getRawStore(`tj:${p}`);
    assert.notStrictEqual(v, undefined, `tj:${p} should be defined`);
  }
  assert.equal(ALL_PARTITIONS.length, 6);
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
