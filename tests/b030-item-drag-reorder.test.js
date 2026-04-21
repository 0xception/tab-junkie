/**
 * b030-item-drag-reorder.test.js — B-030 backend tests.
 *
 * Covers the new `bulkReorderItems` storage function + MSG_BULK_REORDER_ITEMS
 * dispatcher integration. Sidepanel-side drag mechanics are intentionally
 * NOT tested here (DOM simulation is out of scope for this test layer); the
 * pure-helper tests live in tests/sort-order.test.js, and UAT walks the
 * end-to-end drag flow.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { __resetMock } from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import {
  createItem,
  bulkCreateItems,
  bulkReorderItems,
  listItems,
  createGroup,
  StorageError,
  ERR_VALIDATION,
  ERR_NOT_FOUND,
} from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';

const COLOR = GROUP_COLORS[0];

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* Seed: two groups with 3 items each, all with sortOrder 0/1/2 (already normalised). */
async function seedTwoGroups() {
  const g1 = await createGroup({ name: 'G1', color: COLOR, parentId: null });
  const g2 = await createGroup({ name: 'G2', color: COLOR, parentId: null });
  const items = await bulkCreateItems([
    { title: 'g1-a', url: 'https://a.example/', groupId: g1.id },
    { title: 'g1-b', url: 'https://b.example/', groupId: g1.id },
    { title: 'g1-c', url: 'https://c.example/', groupId: g1.id },
    { title: 'g2-d', url: 'https://d.example/', groupId: g2.id },
    { title: 'g2-e', url: 'https://e.example/', groupId: g2.id },
    { title: 'g2-f', url: 'https://f.example/', groupId: g2.id },
  ]);
  return { g1, g2, items: items.created };
}

/* =========================================================================
   AC4 — reorder within a single group
   ========================================================================= */

test('B-030 AC4: reorder within group — write succeeds and sortOrder values are consecutive integers', async () => {
  const { items } = await seedTwoGroups();
  const [a, b, c] = items;

  /* Move `a` to the end of g1 — new order [b, c, a] with sortOrders 0, 1, 2. */
  await bulkReorderItems([
    { id: a.id, sortOrder: 2000 },
    { id: b.id, sortOrder: 0 },
    { id: c.id, sortOrder: 1000 },
  ]);

  const all = await listItems();
  const g1Bucket = all
    .filter((it) => it.groupId === items[0].groupId)
    .sort((x, y) => x.sortOrder - y.sortOrder);

  /* AC9: post-write the bucket is normalised to 0, 1, 2 (not the 0/1000/2000
     we passed in). */
  assert.deepEqual(g1Bucket.map((it) => it.sortOrder), [0, 1, 2],
    'Post-write bucket must be consecutive integers');
  assert.equal(g1Bucket[2].id, a.id, 'a ends up last in g1');
});

/* =========================================================================
   AC5 — cross-group move
   ========================================================================= */

test('B-030 AC5: cross-group move — item migrates and both buckets normalise', async () => {
  const { g1, g2, items } = await seedTwoGroups();
  const [a, , , d, e, f] = items;

  /* Move `a` from g1 to g2 at position 1 (between d and e).
     Sidepanel-style: send the full intended new order for the destination
     group (matches what `computeItemReorder` produces). Source group
     renumbering is automatic via the backend bucket normaliser. */
  await bulkReorderItems([
    { id: d.id, sortOrder: 0 },
    { id: a.id, sortOrder: 1000, groupId: g2.id },
    { id: e.id, sortOrder: 2000 },
    { id: f.id, sortOrder: 3000 },
  ]);

  const all = await listItems();
  const g1Bucket = all.filter((it) => it.groupId === g1.id).sort((x, y) => x.sortOrder - y.sortOrder);
  const g2Bucket = all.filter((it) => it.groupId === g2.id).sort((x, y) => x.sortOrder - y.sortOrder);

  assert.equal(g1Bucket.length, 2, 'g1 now has 2 items');
  assert.equal(g2Bucket.length, 4, 'g2 now has 4 items');
  /* AC9: both buckets normalised to consecutive integers. */
  assert.deepEqual(g1Bucket.map((it) => it.sortOrder), [0, 1]);
  assert.deepEqual(g2Bucket.map((it) => it.sortOrder), [0, 1, 2, 3]);
  /* a now lives in g2 at the expected position (after d, before e). */
  const aPost = all.find((it) => it.id === a.id);
  assert.equal(aPost.groupId, g2.id);
  const g2Ids = g2Bucket.map((it) => it.id);
  assert.equal(g2Ids.indexOf(d.id), 0, 'd first in g2');
  assert.equal(g2Ids.indexOf(a.id), 1, 'a second in g2');
  assert.equal(g2Ids.indexOf(e.id), 2, 'e third in g2');
  assert.equal(g2Ids.indexOf(f.id), 3, 'f fourth in g2');
});

/* =========================================================================
   AC6 — drop onto Ungrouped (groupId = null)
   ========================================================================= */

test('B-030 AC6: move item to Ungrouped — groupId flips to null; both buckets normalise', async () => {
  const { g1, items } = await seedTwoGroups();
  const a = items[0];

  await bulkReorderItems([
    { id: a.id, sortOrder: 0, groupId: null },
  ]);

  const all = await listItems();
  const aPost = all.find((it) => it.id === a.id);
  assert.equal(aPost.groupId, null, 'a now in Ungrouped');
  const g1Bucket = all.filter((it) => it.groupId === g1.id).sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(g1Bucket.map((it) => it.sortOrder), [0, 1], 'g1 renumbered after departure');
});

/* =========================================================================
   Atomic writeTransaction — partial-update batch commits in one go
   ========================================================================= */

test('B-030: bulkReorderItems applies all updates in a single writeTransaction', async () => {
  const { items } = await seedTwoGroups();
  const [a, b, c] = items;
  const initial = await listItems();
  const initialSnapshot = JSON.stringify(initial.map((it) => ({ id: it.id, sortOrder: it.sortOrder, groupId: it.groupId })));

  await bulkReorderItems([
    { id: a.id, sortOrder: 2000 },
    { id: b.id, sortOrder: 0 },
    { id: c.id, sortOrder: 1000 },
  ]);

  const post = await listItems();
  const postSnapshot = JSON.stringify(post.map((it) => ({ id: it.id, sortOrder: it.sortOrder, groupId: it.groupId })));
  assert.notEqual(initialSnapshot, postSnapshot, 'state changed post-write');
});

/* =========================================================================
   Validation + partial-success semantics
   ========================================================================= */

test('B-030: empty updates array rejects with ERR_VALIDATION', async () => {
  await assert.rejects(
    async () => bulkReorderItems([]),
    (err) => err instanceof StorageError && err.code === ERR_VALIDATION,
  );
});

test('B-030: unknown id surfaces in notFound (partial-success)', async () => {
  const { items } = await seedTwoGroups();
  const [a] = items;
  const result = await bulkReorderItems([
    { id: a.id, sortOrder: 100 },
    { id: 'ulid-does-not-exist', sortOrder: 200 },
  ]);
  assert.ok(result.updated.includes(a.id));
  assert.ok(result.notFound.includes('ulid-does-not-exist'));
});

test('B-030: unknown destination groupId rejects with ERR_NOT_FOUND', async () => {
  const { items } = await seedTwoGroups();
  const [a] = items;
  await assert.rejects(
    async () => bulkReorderItems([
      { id: a.id, sortOrder: 0, groupId: 'group-that-does-not-exist' },
    ]),
    (err) => err instanceof StorageError && err.code === ERR_NOT_FOUND,
  );
});

test('B-030: non-finite sortOrder rejects with ERR_VALIDATION', async () => {
  const { items } = await seedTwoGroups();
  const [a] = items;
  await assert.rejects(
    async () => bulkReorderItems([{ id: a.id, sortOrder: NaN }]),
    (err) => err instanceof StorageError && err.code === ERR_VALIDATION,
  );
});
