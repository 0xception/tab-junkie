/**
 * b051-normalisation.test.js — B-051 Sort-order normalisation & selection pruning
 *
 * AC1: Normalisation runs after create, delete, bulkCreate, bulkUpdateItems.
 * AC2: After normalisation, sortOrder values are sequential with no gaps or
 *      duplicates within each group.
 * AC3: pruneSelection returns only live IDs.
 * AC4: Normalisation is idempotent.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { __resetMock, seedPartitions } from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import {
  createItem,
  deleteItem,
  bulkCreateItems,
  bulkUpdateItems,
  listItems,
  createGroup,
} from '../background/storage/index.js';
import { pruneSelection } from '../shared/selection.js';
import { GROUP_COLORS } from '../shared/constants.js';

const COLOR = GROUP_COLORS[0];

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

// ── Helper ────────────────────────────────────────────────────────────────────

/** Assert that all items in a bucket have sequential 0-based sortOrders. */
function assertSequential(items, groupId, label = '') {
  const bucket = items
    .filter((it) => it.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (let i = 0; i < bucket.length; i++) {
    assert.equal(
      bucket[i].sortOrder,
      i,
      `${label} — item at position ${i} has sortOrder ${bucket[i].sortOrder}, expected ${i}`,
    );
  }
}

// ── AC1 + AC2: createItem assigns contiguous sortOrder ────────────────────────

test('AC1/AC2: createItem appends with contiguous sortOrder within the group', async () => {
  const group = await createGroup({ name: 'G1', color: COLOR, parentId: null });

  const a = await createItem({ title: 'A', url: 'https://a.com', groupId: group.id });
  const b = await createItem({ title: 'B', url: 'https://b.com', groupId: group.id });
  const c = await createItem({ title: 'C', url: 'https://c.com', groupId: group.id });

  assert.equal(a.sortOrder, 0, 'first item sortOrder = 0');
  assert.equal(b.sortOrder, 1, 'second item sortOrder = 1');
  assert.equal(c.sortOrder, 2, 'third item sortOrder = 2');

  const all = await listItems();
  assertSequential(all, group.id, 'createItem sequential');
});

test('AC1/AC2: createItem into ungrouped (null) bucket assigns sequential sortOrders', async () => {
  const x = await createItem({ title: 'X', url: 'https://x.com', groupId: null });
  const y = await createItem({ title: 'Y', url: 'https://y.com', groupId: null });

  assert.equal(x.sortOrder, 0);
  assert.equal(y.sortOrder, 1);

  const all = await listItems();
  assertSequential(all, null, 'createItem null-bucket sequential');
});

test('AC1/AC2: createItem normalises pre-existing gaps in the target bucket', async () => {
  // Seed items with a gap (0, 2) to simulate a corruption scenario.
  const group = await createGroup({ name: 'Gaps', color: COLOR, parentId: null });
  seedPartitions({
    items: [
      { id: 'g1', title: 'First', url: 'https://first.com', groupId: group.id, sortOrder: 0, createdAt: 1, updatedAt: 1 },
      { id: 'g2', title: 'Second', url: 'https://second.com', groupId: group.id, sortOrder: 2, createdAt: 2, updatedAt: 2 },
    ],
  });

  // createItem appends and triggers normalisation.
  await createItem({ title: 'Third', url: 'https://third.com', groupId: group.id });

  const all = await listItems();
  assertSequential(all, group.id, 'createItem gap-normalisation');
});

// ── AC1 + AC2: deleteItem reflowing after middle-item deletion ────────────────

test('AC1/AC2: deleteItem — deleting the middle item reflows remaining items with no gap', async () => {
  const group = await createGroup({ name: 'Del', color: COLOR, parentId: null });
  const a = await createItem({ title: 'A', url: 'https://del-a.com', groupId: group.id });
  const b = await createItem({ title: 'B', url: 'https://del-b.com', groupId: group.id });
  const c = await createItem({ title: 'C', url: 'https://del-c.com', groupId: group.id });

  // Sanity: 0, 1, 2 before deletion.
  assert.equal(a.sortOrder, 0);
  assert.equal(b.sortOrder, 1);
  assert.equal(c.sortOrder, 2);

  // Delete the middle item.
  await deleteItem(b.id);

  const remaining = await listItems();
  assertSequential(remaining, group.id, 'deleteItem reflow');

  // Remaining items should be A (0) and C (1).
  const bucket = remaining
    .filter((it) => it.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(bucket.length, 2);
  assert.equal(bucket[0].id, a.id);
  assert.equal(bucket[0].sortOrder, 0);
  assert.equal(bucket[1].id, c.id);
  assert.equal(bucket[1].sortOrder, 1);
});

test('AC1/AC2: deleteItem on ungrouped (null) bucket reflows correctly', async () => {
  const p = await createItem({ title: 'P', url: 'https://p.com', groupId: null });
  const q = await createItem({ title: 'Q', url: 'https://q.com', groupId: null });
  const r = await createItem({ title: 'R', url: 'https://r.com', groupId: null });

  await deleteItem(q.id);

  const remaining = await listItems();
  assertSequential(remaining, null, 'deleteItem null reflow');
  const bucket = remaining.filter((it) => it.groupId === null).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(bucket.length, 2);
  assert.equal(bucket[0].id, p.id);
  assert.equal(bucket[1].id, r.id);
});

// ── AC1 + AC2: bulkCreateItems assigns sequential sortOrders ──────────────────

test('AC1/AC2: bulkCreateItems — 3 items into a group get sequential sortOrders 0, 1, 2', async () => {
  const group = await createGroup({ name: 'Bulk', color: COLOR, parentId: null });

  const inputs = [
    { title: 'B1', url: 'https://bulk1.com', groupId: group.id },
    { title: 'B2', url: 'https://bulk2.com', groupId: group.id },
    { title: 'B3', url: 'https://bulk3.com', groupId: group.id },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 3);

  const orders = result.created
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => it.sortOrder);
  assert.deepStrictEqual(orders, [0, 1, 2]);

  const all = await listItems();
  assertSequential(all, group.id, 'bulkCreateItems sequential');
});

test('AC1/AC2: bulkCreateItems into ungrouped (null) bucket assigns sequential sortOrders', async () => {
  const inputs = [
    { title: 'U1', url: 'https://ug1.com', groupId: null },
    { title: 'U2', url: 'https://ug2.com', groupId: null },
  ];

  const result = await bulkCreateItems(inputs);
  assert.equal(result.created.length, 2);

  const all = await listItems();
  assertSequential(all, null, 'bulkCreateItems null-bucket');
});

test('AC1/AC2: bulkCreateItems appends after existing items with correct sortOrders', async () => {
  const group = await createGroup({ name: 'Append', color: COLOR, parentId: null });
  // Create 2 items first.
  await createItem({ title: 'Pre-1', url: 'https://pre1.com', groupId: group.id });
  await createItem({ title: 'Pre-2', url: 'https://pre2.com', groupId: group.id });

  // Bulk-create 2 more.
  await bulkCreateItems([
    { title: 'New-1', url: 'https://new1.com', groupId: group.id },
    { title: 'New-2', url: 'https://new2.com', groupId: group.id },
  ]);

  const all = await listItems();
  assertSequential(all, group.id, 'bulkCreateItems append sequential');
  const bucket = all
    .filter((it) => it.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(bucket.length, 4);
  assert.deepStrictEqual(bucket.map((it) => it.sortOrder), [0, 1, 2, 3]);
});

// ── AC1 + AC2: bulkUpdateItems — move between groups re-normalises both ───────

test('AC1/AC2: bulkUpdateItems moving item between groups normalises source and destination', async () => {
  const src = await createGroup({ name: 'Source', color: COLOR, parentId: null });
  const dst = await createGroup({ name: 'Dest', color: COLOR, parentId: null });

  // Source: 3 items (0, 1, 2). Dest: 1 item (0).
  const s1 = await createItem({ title: 'S1', url: 'https://s1.com', groupId: src.id });
  const s2 = await createItem({ title: 'S2', url: 'https://s2.com', groupId: src.id });
  const s3 = await createItem({ title: 'S3', url: 'https://s3.com', groupId: src.id });
  const d1 = await createItem({ title: 'D1', url: 'https://d1.com', groupId: dst.id });

  assert.equal(s1.sortOrder, 0);
  assert.equal(s2.sortOrder, 1);
  assert.equal(s3.sortOrder, 2);
  assert.equal(d1.sortOrder, 0);

  // Move s2 (the middle item) to dst.
  const result = await bulkUpdateItems([s2.id], { groupId: dst.id });
  assert.deepStrictEqual(result.updated, [s2.id]);

  const all = await listItems();

  // Source bucket: s1 and s3 should now be 0, 1 (no gap).
  assertSequential(all, src.id, 'source bucket after move');
  const srcBucket = all
    .filter((it) => it.groupId === src.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(srcBucket.length, 2);
  assert.equal(srcBucket[0].id, s1.id);
  assert.equal(srcBucket[0].sortOrder, 0);
  assert.equal(srcBucket[1].id, s3.id);
  assert.equal(srcBucket[1].sortOrder, 1);

  // Destination bucket: d1 and s2 should be sequential.
  assertSequential(all, dst.id, 'dest bucket after move');
  const dstBucket = all
    .filter((it) => it.groupId === dst.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(dstBucket.length, 2);
  assert.deepStrictEqual(dstBucket.map((it) => it.sortOrder), [0, 1]);
});

// ── AC4: Idempotency ──────────────────────────────────────────────────────────

test('AC4: normalisation is idempotent — a pre-normalised bucket is unchanged by subsequent create/delete on another group', async () => {
  // normaliseGroupSortOrders is not exported; idempotency is verified behaviourally.
  const group = await createGroup({ name: 'Idem', color: COLOR, parentId: null });
  await createItem({ title: 'I1', url: 'https://i1.com', groupId: group.id });
  await createItem({ title: 'I2', url: 'https://i2.com', groupId: group.id });
  await createItem({ title: 'I3', url: 'https://i3.com', groupId: group.id });

  const before = await listItems();
  const bucketBefore = before
    .filter((it) => it.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({ id: it.id, sortOrder: it.sortOrder }));

  // Verify bucket is already sequential.
  assert.deepStrictEqual(bucketBefore.map((e) => e.sortOrder), [0, 1, 2], 'pre-condition: must be 0,1,2');

  // Trigger create+delete on a different group — must not disturb the Idem bucket.
  const throwaway = await createGroup({ name: 'Temp', color: COLOR, parentId: null });
  const t = await createItem({ title: 'T', url: 'https://temp.com', groupId: throwaway.id });
  await deleteItem(t.id);

  const after = await listItems();
  const bucketAfter = after
    .filter((it) => it.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => ({ id: it.id, sortOrder: it.sortOrder }));

  assert.deepStrictEqual(bucketAfter, bucketBefore, 'Idem group sortOrders must be unchanged by operations on other groups');
});

test('AC4: idempotency — pre-normalised items seeded directly produce no change on next mutation', async () => {
  // Seed a perfectly normalised collection.
  seedPartitions({
    items: [
      { id: 'seq-0', title: 'A', url: 'https://seq0.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
      { id: 'seq-1', title: 'B', url: 'https://seq1.com', groupId: null, sortOrder: 1, createdAt: 2, updatedAt: 2 },
      { id: 'seq-2', title: 'C', url: 'https://seq2.com', groupId: null, sortOrder: 2, createdAt: 3, updatedAt: 3 },
    ],
  });

  // Add a new item — this triggers normalisation of the null bucket.
  await createItem({ title: 'D', url: 'https://seq3.com', groupId: null });

  const all = await listItems();
  assertSequential(all, null, 'idempotency after re-normalised seed');
  const bucket = all.filter((it) => it.groupId === null).sort((a, b) => a.sortOrder - b.sortOrder);
  // Original three must retain 0, 1, 2 — new item gets 3.
  assert.equal(bucket.length, 4);
  assert.deepStrictEqual(bucket.map((it) => it.sortOrder), [0, 1, 2, 3]);
  assert.equal(bucket[0].id, 'seq-0');
  assert.equal(bucket[1].id, 'seq-1');
  assert.equal(bucket[2].id, 'seq-2');
});

// ── Null-groupId bucket normalised separately ─────────────────────────────────

test('AC2: null-groupId bucket and named groups are normalised independently', async () => {
  const group = await createGroup({ name: 'Named', color: COLOR, parentId: null });

  await createItem({ title: 'N1', url: 'https://n1.com', groupId: group.id });
  await createItem({ title: 'N2', url: 'https://n2.com', groupId: group.id });
  await createItem({ title: 'U1', url: 'https://u1.com', groupId: null });
  await createItem({ title: 'U2', url: 'https://u2.com', groupId: null });

  const all = await listItems();
  assertSequential(all, group.id, 'named group bucket');
  assertSequential(all, null, 'null bucket');

  // Named group: 0, 1. Null bucket: 0, 1 — completely independent.
  const named = all.filter((it) => it.groupId === group.id).sort((a, b) => a.sortOrder - b.sortOrder);
  const ungrouped = all.filter((it) => it.groupId === null).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepStrictEqual(named.map((it) => it.sortOrder), [0, 1]);
  assert.deepStrictEqual(ungrouped.map((it) => it.sortOrder), [0, 1]);
});

// ── AC3: pruneSelection ───────────────────────────────────────────────────────

test('AC3: pruneSelection returns only IDs present in the items collection', () => {
  const items = [
    { id: 'live-1', title: 'A', url: 'https://a.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    { id: 'live-2', title: 'B', url: 'https://b.com', groupId: null, sortOrder: 1, createdAt: 2, updatedAt: 2 },
  ];

  const selection = new Set(['live-1', 'stale-3', 'live-2', 'stale-4']);
  const pruned = pruneSelection(selection, items);

  assert.ok(pruned instanceof Set, 'pruneSelection must return a Set');
  assert.equal(pruned.size, 2);
  assert.ok(pruned.has('live-1'));
  assert.ok(pruned.has('live-2'));
  assert.ok(!pruned.has('stale-3'), 'stale ID must be removed');
  assert.ok(!pruned.has('stale-4'), 'stale ID must be removed');
});

test('AC3: pruneSelection with entirely stale selection returns empty Set', () => {
  const items = [
    { id: 'live-1', title: 'A', url: 'https://a.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
  ];

  const selection = new Set(['gone-1', 'gone-2']);
  const pruned = pruneSelection(selection, items);

  assert.ok(pruned instanceof Set);
  assert.equal(pruned.size, 0);
});

test('AC3: pruneSelection with empty selection returns empty Set', () => {
  const items = [
    { id: 'live-1', title: 'A', url: 'https://a.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
  ];

  const pruned = pruneSelection(new Set(), items);
  assert.equal(pruned.size, 0);
});

test('AC3: pruneSelection with empty items collection returns empty Set', () => {
  const selection = new Set(['id-1', 'id-2']);
  const pruned = pruneSelection(selection, []);
  assert.equal(pruned.size, 0);
});

test('AC3: pruneSelection does not mutate the input Set', () => {
  const items = [{ id: 'live-1', title: 'A', url: 'https://a.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 }];
  const selection = new Set(['live-1', 'stale-99']);
  const original = new Set(selection);

  pruneSelection(selection, items);

  assert.deepStrictEqual(selection, original, 'input Set must not be mutated');
});

test('AC3: regression — pruneSelection with all live IDs returns identical IDs', () => {
  const items = [
    { id: 'a', title: 'A', url: 'https://a.com', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    { id: 'b', title: 'B', url: 'https://b.com', groupId: null, sortOrder: 1, createdAt: 2, updatedAt: 2 },
    { id: 'c', title: 'C', url: 'https://c.com', groupId: null, sortOrder: 2, createdAt: 3, updatedAt: 3 },
  ];

  const selection = new Set(['a', 'b', 'c']);
  const pruned = pruneSelection(selection, items);

  assert.equal(pruned.size, 3);
  assert.deepStrictEqual([...pruned].sort(), ['a', 'b', 'c']);
});
