/**
 * floating-shape.test.js — AC7
 * FloatingGroup record shape round-trip validation.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore, seedPartitions } from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import { saveFloatingGroups } from '../background/tabs/floating-groups.js';
import { readPartition, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC7: well-formed entry round-trips without field mutation', async () => {
  const entry = {
    groupId: 'group-1',
    windowId: 42,
    tabIndex: 3,
    url: 'https://example.com/page',
    savedAt: 1700000000000,
  };

  await saveFloatingGroups([entry]);

  const raw = __getRawStore('tj:floatingGroups');
  assert.ok(Array.isArray(raw), 'tj:floatingGroups should be an array');
  assert.equal(raw.length, 1);
  assert.deepStrictEqual(raw[0], entry, 'Entry should round-trip without mutation');
});

test('AC7: record shape validation — all required fields present', async () => {
  const entry = {
    groupId: 'g-abc',
    windowId: 1,
    tabIndex: 0,
    url: 'https://test.com',
    savedAt: Date.now(),
  };

  await saveFloatingGroups([entry]);
  const records = await readPartition(PARTITION_FLOATING_GROUPS);

  assert.equal(records.length, 1);
  const r = records[0];
  assert.equal(typeof r.groupId, 'string');
  assert.equal(typeof r.windowId, 'number');
  assert.ok(Number.isFinite(r.windowId));
  assert.equal(typeof r.tabIndex, 'number');
  assert.ok(Number.isFinite(r.tabIndex));
  assert.equal(typeof r.url, 'string');
  assert.equal(typeof r.savedAt, 'number');
});

test('AC7: multiple entries round-trip correctly', async () => {
  const entries = [
    { groupId: 'g-1', windowId: 1, tabIndex: 0, url: 'https://a.com', savedAt: 1000 },
    { groupId: 'g-2', windowId: 2, tabIndex: 5, url: 'https://b.com', savedAt: 2000 },
    { groupId: 'g-1', windowId: 1, tabIndex: 1, url: 'https://c.com', savedAt: 3000 },
  ];

  await saveFloatingGroups(entries);
  const records = await readPartition(PARTITION_FLOATING_GROUPS);

  assert.equal(records.length, 3);
  assert.deepStrictEqual(records, entries);
});

test('AC7: invalid entries are silently discarded', async () => {
  const entries = [
    { groupId: 'g-valid', windowId: 1, tabIndex: 0, url: 'https://ok.com', savedAt: 1000 },
    { groupId: 123, windowId: 1, tabIndex: 0, url: 'https://bad.com', savedAt: 1000 }, // groupId not string
    null,
    { groupId: 'g-no-url', windowId: 1, tabIndex: 0 }, // missing url and savedAt
  ];

  await saveFloatingGroups(entries);
  const records = await readPartition(PARTITION_FLOATING_GROUPS);

  assert.equal(records.length, 1, 'Only valid entry should be saved');
  assert.equal(records[0].groupId, 'g-valid');
});
