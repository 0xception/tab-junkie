import { test } from 'node:test';
import assert from 'node:assert/strict';
import './_setup.js';
import { KNOWN_VERSION } from '../background/storage/migration.js';
import { defaultShape, PARTITION_META, assertShape, PARTITION_GROUPS } from '../background/storage/shapes.js';

test('KNOWN_VERSION is 7 (B-148 §3.1 v6→v7 bump for renderOrder)', () => {
  assert.equal(KNOWN_VERSION, 7);
});

test('defaultShape(PARTITION_META) seeds schemaVersion: 7 (B-148 §3.1 paired bump)', () => {
  const shape = defaultShape(PARTITION_META);
  assert.equal(shape.schemaVersion, 7);
});

test('isGroup accepts a group without chromeTabGroupId (legacy v4 shape)', () => {
  const groups = [{
    id: '01',
    name: 'g',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
  }];
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, groups));
});

test('isGroup accepts a group with chromeTabGroupId: number (v5 shape)', () => {
  const groups = [{
    id: '01',
    name: 'g',
    color: 'blue',
    parentId: null,
    sortOrder: 0,
    collapsed: false,
    createdAt: 1,
    updatedAt: 1,
    chromeTabGroupId: 42,
  }];
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, groups));
});

test('isGroup accepts chromeTabGroupId: null (cleared after stale-mapping detect)', () => {
  const groups = [{
    id: '01', name: 'g', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
    chromeTabGroupId: null,
  }];
  assert.doesNotThrow(() => assertShape(PARTITION_GROUPS, groups));
});

test('isGroup rejects chromeTabGroupId of wrong type (string)', () => {
  const groups = [{
    id: '01', name: 'g', color: 'blue', parentId: null,
    sortOrder: 0, collapsed: false, createdAt: 1, updatedAt: 1,
    chromeTabGroupId: 'not-a-number',
  }];
  assert.throws(() => assertShape(PARTITION_GROUPS, groups));
});
