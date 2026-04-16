/**
 * group-duplicate-name.test.js — B-006 AC4
 * Same-level name collision warns; different parentId does not; self-rename does not.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { createGroup, updateGroup } from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';

const COLOR = GROUP_COLORS[0];
const COLOR2 = GROUP_COLORS[1];
beforeEach(() => __resetMock());

test('AC4: createGroup warns when name duplicates a sibling at same level (top)', async () => {
  await createGroup({ name: 'Duplicated', color: COLOR, parentId: null });
  const g2 = await createGroup({ name: 'Duplicated', color: COLOR2, parentId: null });
  assert.equal(g2.warning, 'DUPLICATE_NAME');
});

test('AC4: createGroup warns when name duplicates a sibling at same nested level', async () => {
  const parent = await createGroup({ name: 'Parent', color: COLOR, parentId: null });
  await createGroup({ name: 'Child', color: COLOR, parentId: parent.id });
  const dup = await createGroup({ name: 'Child', color: COLOR2, parentId: parent.id });
  assert.equal(dup.warning, 'DUPLICATE_NAME');
});

test('AC4: createGroup does NOT warn when same name exists at different parentId', async () => {
  const p1 = await createGroup({ name: 'P1', color: COLOR, parentId: null });
  const p2 = await createGroup({ name: 'P2', color: COLOR, parentId: null });
  await createGroup({ name: 'Shared', color: COLOR, parentId: p1.id });
  const g = await createGroup({ name: 'Shared', color: COLOR2, parentId: p2.id });
  assert.equal(g.warning, undefined);
});

test('AC4: createGroup does NOT warn when name is unique at top level', async () => {
  await createGroup({ name: 'Alpha', color: COLOR, parentId: null });
  const g2 = await createGroup({ name: 'Beta', color: COLOR2, parentId: null });
  assert.equal(g2.warning, undefined);
});

test('AC4: updateGroup warns when rename creates duplicate at same level', async () => {
  const parent = await createGroup({ name: 'Parent', color: COLOR, parentId: null });
  await createGroup({ name: 'Existing', color: COLOR, parentId: parent.id });
  const other = await createGroup({ name: 'Other', color: COLOR2, parentId: parent.id });
  const updated = await updateGroup(other.id, { name: 'Existing' });
  assert.equal(updated.warning, 'DUPLICATE_NAME');
});

test('AC4: self-rename (same name) does NOT warn', async () => {
  const g = await createGroup({ name: 'MyGroup', color: COLOR, parentId: null });
  const updated = await updateGroup(g.id, { name: 'MyGroup' });
  assert.equal(updated.warning, undefined);
});

test('AC4: warning is NOT persisted to storage — stored group has no warning field', async () => {
  const g1 = await createGroup({ name: 'Doubled', color: COLOR, parentId: null });
  const g2 = await createGroup({ name: 'Doubled', color: COLOR2, parentId: null });
  assert.equal(g2.warning, 'DUPLICATE_NAME');
  // Verify the stored record has no warning
  const { listGroups } = await import('../background/storage/index.js');
  const groups = await listGroups();
  const stored = groups.find((g) => g.id === g2.id);
  assert.equal(stored.warning, undefined, 'warning must NOT be written to storage');
});
