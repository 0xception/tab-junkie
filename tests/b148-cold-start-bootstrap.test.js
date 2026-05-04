import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { __resetMock } from './chrome-mock.js';
import { writeTransaction } from '../background/storage/write-transaction.js';
import { PARTITION_ITEMS, PARTITION_GROUPS, PARTITION_FLOATING_GROUPS } from '../background/storage/partitions.js';
import { bootstrapAndSweepRenderOrder } from '../background/tabs/floating-groups.js';
import { getGroup } from '../background/storage/groups.js';

beforeEach(async () => __resetMock());

/* Helper: seed all three partitions directly without going through createItem
   etc. (which would auto-stamp renderOrder). */
async function seed({ groups = [], items = [], floating = [] }) {
  await writeTransaction([
    { partition: PARTITION_GROUPS, mutator: () => groups },
    { partition: PARTITION_ITEMS, mutator: () => items },
    { partition: PARTITION_FLOATING_GROUPS, mutator: () => floating },
  ]);
}

function group(id, extra = {}) {
  return Object.assign({
    id, name: 'G_' + id, color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
  }, extra);
}
function item(id, sortOrder, groupId) {
  return { id, title: 'T_' + id, url: 'https://x.example/' + id, groupId, sortOrder, createdAt: 1, updatedAt: 1 };
}
function floatingRec(floatingTabId, groupId, parentItemId, sortOrder) {
  return {
    floatingTabId, groupId, parentItemId, windowId: 1, tabIndex: sortOrder,
    url: 'https://x.example/F' + floatingTabId, savedAt: 1, sortOrder, liveTabId: 1000 + sortOrder,
  };
}

test('B-148 11: legacy v6 group (no renderOrder) bootstraps from items + floating sortOrder', async () => {
  await seed({
    groups: [group('g1')],
    items: [item('i1', 1, 'g1'), item('i2', 0, 'g1')],
    floating: [floatingRec('f1', 'g1', 'i1', 0), floatingRec('f2', 'g1', 'i1', 1)],
  });
  await bootstrapAndSweepRenderOrder();
  const g = await getGroup('g1');
  /* saved-by-sortOrder asc (i2, i1), then floating-by-sortOrder asc (f1, f2). */
  assert.deepEqual(g.renderOrder, ['item:i2', 'item:i1', 'floating:f1', 'floating:f2']);
});

test('B-148 11: empty renderOrder array is bootstrapped (treated same as missing)', async () => {
  await seed({
    groups: [group('g1', { renderOrder: [] })],
    items: [item('i1', 0, 'g1')],
  });
  await bootstrapAndSweepRenderOrder();
  const g = await getGroup('g1');
  assert.deepEqual(g.renderOrder, ['item:i1']);
});

test('B-148 11: stale item ref is stripped on sweep', async () => {
  await seed({
    groups: [group('g1', { renderOrder: ['item:i1', 'item:GHOST_ITEM'] })],
    items: [item('i1', 0, 'g1')],
  });
  await bootstrapAndSweepRenderOrder();
  const g = await getGroup('g1');
  assert.deepEqual(g.renderOrder, ['item:i1']);
});

test('B-148 11: stale floating ref is stripped on sweep', async () => {
  await seed({
    groups: [group('g1', { renderOrder: ['floating:f1', 'floating:GHOST'] })],
    floating: [floatingRec('f1', 'g1', 'i1', 0)],
    items: [item('i1', 0, 'g1')],
  });
  await bootstrapAndSweepRenderOrder();
  const g = await getGroup('g1');
  assert.deepEqual(g.renderOrder, ['floating:f1']);
});

test('B-148 11: valid v7 renderOrder is unchanged when all refs resolve', async () => {
  await seed({
    groups: [group('g1', { renderOrder: ['item:i2', 'floating:f1', 'item:i1'] })],
    items: [item('i1', 0, 'g1'), item('i2', 1, 'g1')],
    floating: [floatingRec('f1', 'g1', 'i1', 0)],
  });
  await bootstrapAndSweepRenderOrder();
  const g = await getGroup('g1');
  /* Order preserved exactly because all refs resolve. */
  assert.deepEqual(g.renderOrder, ['item:i2', 'floating:f1', 'item:i1']);
});

test('B-148 11: items in OTHER groups not added to this group renderOrder bootstrap', async () => {
  await seed({
    groups: [group('g1'), group('g2')],
    items: [item('i1', 0, 'g1'), item('i2', 0, 'g2')],
  });
  await bootstrapAndSweepRenderOrder();
  const g1 = await getGroup('g1');
  const g2 = await getGroup('g2');
  assert.deepEqual(g1.renderOrder, ['item:i1']);
  assert.deepEqual(g2.renderOrder, ['item:i2']);
});

test('B-148 11: empty groups partition is a no-op (no throw)', async () => {
  await seed({});
  await assert.doesNotReject(() => bootstrapAndSweepRenderOrder());
});
