/**
 * b008-group-reorder.test.js — B-008 Group reorder & collapse/expand persistence
 *
 * Covers:
 *  - validateGroupPatch accepts valid sortOrder integers, rejects NaN/Infinity/non-number (M-1)
 *  - validateGroupPatch accepts collapsed boolean patches
 *  - updateGroup with { sortOrder } persists to storage correctly
 *  - updateGroup with { collapsed } persists to storage correctly
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock, __getRawStore } from './chrome-mock.js';
import { createGroup, updateGroup } from '../background/storage/index.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';

beforeEach(() => __resetMock());

/* ---- sortOrder validation (M-1 fix) ---- */

test('M-1: updateGroup accepts integer sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  const updated = await updateGroup(g.id, { sortOrder: 1000 });
  assert.equal(updated.sortOrder, 1000);
});

test('M-1: updateGroup accepts zero sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  const updated = await updateGroup(g.id, { sortOrder: 0 });
  assert.equal(updated.sortOrder, 0);
});

test('M-1: updateGroup accepts negative sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  const updated = await updateGroup(g.id, { sortOrder: -500 });
  assert.equal(updated.sortOrder, -500);
});

test('M-1: updateGroup rejects NaN sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { sortOrder: NaN }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('M-1: updateGroup rejects Infinity sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { sortOrder: Infinity }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('M-1: updateGroup rejects -Infinity sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { sortOrder: -Infinity }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('M-1: updateGroup rejects string sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { sortOrder: '1000' }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('M-1: updateGroup rejects null sortOrder', async () => {
  const g = await createGroup({ name: 'A', color: 'blue', parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { sortOrder: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('M-1: createGroup rejects NaN sortOrder', async () => {
  await assert.rejects(
    () => createGroup({ name: 'X', color: 'blue', parentId: null, sortOrder: NaN }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('M-1: createGroup rejects Infinity sortOrder', async () => {
  await assert.rejects(
    () => createGroup({ name: 'X', color: 'blue', parentId: null, sortOrder: Infinity }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

/* ---- collapsed patch validation ---- */

test('updateGroup accepts { collapsed: true } patch', async () => {
  const g = await createGroup({ name: 'B', color: 'red', parentId: null });
  const updated = await updateGroup(g.id, { collapsed: true });
  assert.equal(updated.collapsed, true);
});

test('updateGroup accepts { collapsed: false } patch', async () => {
  const g = await createGroup({ name: 'B', color: 'red', parentId: null });
  // First collapse, then expand
  await updateGroup(g.id, { collapsed: true });
  const updated = await updateGroup(g.id, { collapsed: false });
  assert.equal(updated.collapsed, false);
});

/* ---- sortOrder persistence ---- */

test('updateGroup { sortOrder: 1000 } persists to storage', async () => {
  const g = await createGroup({ name: 'C', color: 'teal', parentId: null });
  await updateGroup(g.id, { sortOrder: 1000 });
  const stored = __getRawStore('tj:groups');
  const persisted = stored.find((s) => s.id === g.id);
  assert.equal(persisted.sortOrder, 1000);
});

test('updateGroup { sortOrder: 2000 } overwrites previous sortOrder', async () => {
  const g = await createGroup({ name: 'D', color: 'purple', parentId: null });
  await updateGroup(g.id, { sortOrder: 1000 });
  await updateGroup(g.id, { sortOrder: 2000 });
  const stored = __getRawStore('tj:groups');
  const persisted = stored.find((s) => s.id === g.id);
  assert.equal(persisted.sortOrder, 2000);
});

test('updateGroup { collapsed: true } persists to storage', async () => {
  const g = await createGroup({ name: 'E', color: 'blue', parentId: null });
  assert.equal(g.collapsed, false); // default
  await updateGroup(g.id, { collapsed: true });
  const stored = __getRawStore('tj:groups');
  const persisted = stored.find((s) => s.id === g.id);
  assert.equal(persisted.collapsed, true);
});

test('multiple groups reorder via index*1000 scheme', async () => {
  const a = await createGroup({ name: 'A', color: 'blue', parentId: null, sortOrder: 0 });
  const b = await createGroup({ name: 'B', color: 'red', parentId: null, sortOrder: 1000 });
  const c = await createGroup({ name: 'C', color: 'teal', parentId: null, sortOrder: 2000 });
  // Simulate reorder: C moved to first position
  await updateGroup(c.id, { sortOrder: 0 });
  await updateGroup(a.id, { sortOrder: 1000 });
  await updateGroup(b.id, { sortOrder: 2000 });
  const stored = __getRawStore('tj:groups');
  const cStored = stored.find((s) => s.id === c.id);
  const aStored = stored.find((s) => s.id === a.id);
  const bStored = stored.find((s) => s.id === b.id);
  assert.equal(cStored.sortOrder, 0);
  assert.equal(aStored.sortOrder, 1000);
  assert.equal(bStored.sortOrder, 2000);
});
