/**
 * group-palette.test.js — B-006 AC1, AC2
 * Each valid GROUP_COLORS color succeeds; invalid color rejects with ERR_VALIDATION.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { createGroup, updateGroup } from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';

beforeEach(() => __resetMock());

// AC1: every valid palette color can be used on createGroup
for (const color of GROUP_COLORS) {
  test(`AC1: createGroup succeeds with palette color "${color}"`, async () => {
    const g = await createGroup({ name: 'Test', color, parentId: null });
    assert.equal(g.color, color);
    assert.ok(g.id);
  });
}

// AC1: every valid palette color can be used on updateGroup
test('AC1: updateGroup succeeds with valid palette color', async () => {
  const g = await createGroup({ name: 'Test', color: GROUP_COLORS[0], parentId: null });
  const updated = await updateGroup(g.id, { color: GROUP_COLORS[1] });
  assert.equal(updated.color, GROUP_COLORS[1]);
});

// AC2: invalid colors are rejected with ERR_VALIDATION on createGroup
test('AC2: createGroup rejects color not in palette', async () => {
  await assert.rejects(
    () => createGroup({ name: 'Test', color: 'chartreuse', parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC2: createGroup rejects empty-string color', async () => {
  await assert.rejects(
    () => createGroup({ name: 'Test', color: '', parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC2: createGroup rejects missing color (undefined)', async () => {
  await assert.rejects(
    () => createGroup({ name: 'Test', color: undefined, parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC2: createGroup rejects numeric color', async () => {
  await assert.rejects(
    () => createGroup({ name: 'Test', color: 42, parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC2: updateGroup rejects color not in palette', async () => {
  const g = await createGroup({ name: 'Test', color: GROUP_COLORS[0], parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { color: 'neon' }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});
