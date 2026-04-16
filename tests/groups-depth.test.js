import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import {
  createGroup,
  updateGroup,
  ERR_DEPTH_EXCEEDED,
  ERR_CIRCULAR_REF,
  ERR_NOT_FOUND,
} from '../background/storage/index.js';

beforeEach(() => __resetMock());

test('AC4: creating a grandchild throws ERR_DEPTH_EXCEEDED', async () => {
  const top = await createGroup({ name: 'top', color: 'blue', parentId: null });
  const child = await createGroup({ name: 'child', color: 'blue', parentId: top.id });
  await assert.rejects(
    createGroup({ name: 'grandchild', color: 'blue', parentId: child.id }),
    (err) => err.code === ERR_DEPTH_EXCEEDED,
  );
});

test('AC4: updating parentId to self throws ERR_CIRCULAR_REF', async () => {
  const g = await createGroup({ name: 'g', color: 'red', parentId: null });
  await assert.rejects(
    updateGroup(g.id, { parentId: g.id }),
    (err) => err.code === ERR_CIRCULAR_REF,
  );
});

test('AC4: unknown parentId throws ERR_NOT_FOUND (ruling #4)', async () => {
  await assert.rejects(
    createGroup({ name: 'orphan', color: 'red', parentId: 'nope' }),
    (err) => err.code === ERR_NOT_FOUND,
  );
});

test('AC4: nesting a parent-with-children throws ERR_DEPTH_EXCEEDED (ruling #1)', async () => {
  const a = await createGroup({ name: 'a', color: 'red', parentId: null });
  const b = await createGroup({ name: 'b', color: 'red', parentId: null });
  // b now has a child
  await createGroup({ name: 'c', color: 'red', parentId: b.id });
  // trying to nest b under a would put c at depth 2
  await assert.rejects(
    updateGroup(b.id, { parentId: a.id }),
    (err) => err.code === ERR_DEPTH_EXCEEDED,
  );
});
