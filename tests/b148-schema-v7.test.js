import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';
import {
  defaultShape, PARTITION_META, assertShape, PARTITION_GROUPS,
} from '../background/storage/shapes.js';

/* B-148 v6→v7 floor + B-167 v7→v8 ceiling: this file now pins the
   current KNOWN_VERSION literal as a paired-bump regression guard. The
   v7 floor was B-148's contribution and the v8 ceiling is B-167's. */
test('B-148 §3.1 (B-167 §73.3.1 bump): KNOWN_VERSION === 8', () => {
  assert.equal(KNOWN_VERSION, 8);
});

test('B-148 §3.1 (B-167 §73.3.1 bump): defaultShape(PARTITION_META).schemaVersion === 8', () => {
  assert.equal(defaultShape(PARTITION_META).schemaVersion, 8);
});

function group(extra = {}) {
  return Object.assign({
    id: 'g1', name: 'G', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
  }, extra);
}

test('B-148 §3.2: isGroup accepts legacy v6 group without renderOrder', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, [group()]));
});

test('B-148 §3.2: isGroup accepts v7 group with empty renderOrder', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: [] })]));
});

test('B-148 §3.2: isGroup accepts v7 group with valid renderOrder entries', () => {
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, [group({
    renderOrder: ['item:01HZABC', 'floating:01HZDEF'],
  })]));
});

test('B-148 §3.2: isGroup rejects renderOrder that is not an array', () => {
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: 'item:1' })]));
});

test('B-148 §3.2: isGroup rejects renderOrder entry without prefix', () => {
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: ['just-a-id'] })]));
});

test('B-148 §3.2: isGroup rejects renderOrder entry with wrong prefix', () => {
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: ['url:https://x'] })]));
});

test('B-148 §3.2: isGroup rejects oversized renderOrder entry', () => {
  const oversized = 'item:' + 'X'.repeat(100);
  assert.throws(() => assertShape(PARTITION_GROUPS, [group({ renderOrder: [oversized] })]));
});

import { createGroup, updateGroup } from '../background/storage/groups.js';
import { __resetMock } from './chrome-mock.js';

beforeEach(async () => __resetMock());

test('B-148 §3.3: updateGroup accepts renderOrder in patch + persists it', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  const updated = await updateGroup(g.id, { renderOrder: ['item:01HZ'] });
  assert.deepEqual(updated.renderOrder, ['item:01HZ']);
});

test('B-148 §3.3: updateGroup rejects renderOrder of wrong type', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  await assert.rejects(
    () => updateGroup(g.id, { renderOrder: 'item:01HZ' }),
    (err) => /renderOrder/.test(err.message),
  );
});

test('B-148 §3.3: updateGroup rejects renderOrder entry with bad prefix', async () => {
  const g = await createGroup({ name: 'G', color: 'blue', parentId: null, sortOrder: 0 });
  await assert.rejects(
    () => updateGroup(g.id, { renderOrder: ['url:bad'] }),
    (err) => /renderOrder/.test(err.message),
  );
});
