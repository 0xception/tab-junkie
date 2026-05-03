import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';
import {
  defaultShape, PARTITION_META, assertShape, PARTITION_GROUPS,
} from '../background/storage/shapes.js';

test('B-148 §3.1: KNOWN_VERSION === 7', () => {
  assert.equal(KNOWN_VERSION, 7);
});

test('B-148 §3.1: defaultShape(PARTITION_META).schemaVersion === 7', () => {
  assert.equal(defaultShape(PARTITION_META).schemaVersion, 7);
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
