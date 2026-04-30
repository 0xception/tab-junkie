/**
 * floating-shape.test.js — AC7 (B-121 §60.4 schema v2)
 * FloatingGroup record shape round-trip validation.
 *
 * Post-S38 contract:
 *   - `parentItemId` (renamed from legacy `itemId`) carries the parent
 *     saved item's id.
 *   - `floatingTabId` is auto-stamped by appendFloatingGroup (ulid).
 *   - saveFloatingGroups (the legacy migration / demote path) writes
 *     entries verbatim — no auto-stamping, supports either field name.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import { saveFloatingGroups, appendFloatingGroup } from '../background/tabs/floating-groups.js';
import { readPartition, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

test('AC7: well-formed entry round-trips without field mutation', async () => {
  const entry = {
    groupId: 'group-1',
    parentItemId: 'item-1',
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
    parentItemId: 'item-abc',
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
  assert.equal(typeof r.parentItemId, 'string');
  assert.equal(typeof r.windowId, 'number');
  assert.ok(Number.isFinite(r.windowId));
  assert.equal(typeof r.tabIndex, 'number');
  assert.ok(Number.isFinite(r.tabIndex));
  assert.equal(typeof r.url, 'string');
  assert.equal(typeof r.savedAt, 'number');
});

test('AC7: multiple entries round-trip correctly', async () => {
  const entries = [
    { groupId: 'g-1', parentItemId: 'item-1', windowId: 1, tabIndex: 0, url: 'https://a.com', savedAt: 1000 },
    { groupId: 'g-2', parentItemId: 'item-2', windowId: 2, tabIndex: 5, url: 'https://b.com', savedAt: 2000 },
    { groupId: 'g-1', parentItemId: 'item-3', windowId: 1, tabIndex: 1, url: 'https://c.com', savedAt: 3000 },
  ];

  await saveFloatingGroups(entries);
  const records = await readPartition(PARTITION_FLOATING_GROUPS);

  assert.equal(records.length, 3);
  assert.deepStrictEqual(records, entries);
});

test('AC7: invalid entries are silently discarded', async () => {
  const entries = [
    { groupId: 'g-valid', parentItemId: 'item-valid', windowId: 1, tabIndex: 0, url: 'https://ok.com', savedAt: 1000 },
    { groupId: 123, parentItemId: 'item-bad', windowId: 1, tabIndex: 0, url: 'https://bad.com', savedAt: 1000 }, // groupId not string
    null,
    { groupId: 'g-no-url', windowId: 1, tabIndex: 0 }, // missing url, savedAt, parentItemId
  ];

  await saveFloatingGroups(entries);
  const records = await readPartition(PARTITION_FLOATING_GROUPS);

  assert.equal(records.length, 1, 'Only valid entry should be saved');
  assert.equal(records[0].groupId, 'g-valid');
});

test('B-121: appendFloatingGroup auto-stamps a floatingTabId (ulid)', async () => {
  await appendFloatingGroup({
    groupId: 'g-1',
    parentItemId: 'item-1',
    windowId: 1,
    tabIndex: 2,
    url: 'https://example.com/new',
    savedAt: Date.now(),
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 1);
  assert.equal(typeof records[0].floatingTabId, 'string');
  assert.ok(records[0].floatingTabId.length > 0, 'floatingTabId must be populated');
  assert.equal(records[0].parentItemId, 'item-1');
});

test('B-134 §63.13.2: appendFloatingGroup stamps numeric sortOrder (schema v3)', async () => {
  /* First record into an empty group → sortOrder: 0. */
  await appendFloatingGroup({
    groupId: 'g-sort',
    parentItemId: 'item-sort',
    windowId: 1,
    tabIndex: 0,
    url: 'https://first.example',
    savedAt: 1000,
  });
  /* Second record into same group → sortOrder: 1 (max + 1). */
  await appendFloatingGroup({
    groupId: 'g-sort',
    parentItemId: 'item-sort',
    windowId: 1,
    tabIndex: 1,
    url: 'https://second.example',
    savedAt: 2000,
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 2);
  for (const r of records) {
    assert.equal(typeof r.sortOrder, 'number');
    assert.ok(Number.isFinite(r.sortOrder), 'sortOrder must be finite');
  }
  const sorted = [...records].sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(sorted[0].sortOrder, 0);
  assert.equal(sorted[1].sortOrder, 1);
});

test('B-134 §63.13.2: appendFloatingGroup sortOrder is per-bucket (different groups can both start at 0)', async () => {
  await appendFloatingGroup({
    groupId: 'g-A',
    parentItemId: 'item-A',
    windowId: 1,
    tabIndex: 0,
    url: 'https://a.example',
    savedAt: 1000,
  });
  await appendFloatingGroup({
    groupId: 'g-B',
    parentItemId: 'item-B',
    windowId: 1,
    tabIndex: 1,
    url: 'https://b.example',
    savedAt: 2000,
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 2);
  /* Both records should carry sortOrder: 0 (per-bucket scope, §63.2.2). */
  for (const r of records) {
    assert.equal(r.sortOrder, 0);
  }
});

test('B-121: appendFloatingGroup tolerates legacy `itemId` field on the way in', async () => {
  await appendFloatingGroup({
    groupId: 'g-2',
    itemId: 'item-legacy',  // legacy form — migrated to parentItemId on write
    windowId: 1,
    tabIndex: 0,
    url: 'https://legacy.example/p',
    savedAt: Date.now(),
  });

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 1);
  assert.equal(records[0].parentItemId, 'item-legacy', 'legacy itemId migrated to parentItemId');
  assert.ok('floatingTabId' in records[0]);
});

test('B-121: saveFloatingGroups does NOT auto-stamp a floatingTabId', async () => {
  await saveFloatingGroups([{
    groupId: 'g-3',
    parentItemId: 'item-3',
    windowId: 1,
    tabIndex: 0,
    url: 'https://saveOnly.example',
    savedAt: 1000,
  }]);

  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  assert.equal(records.length, 1);
  assert.equal(records[0].floatingTabId, undefined, 'saveFloatingGroups writes verbatim');
});
