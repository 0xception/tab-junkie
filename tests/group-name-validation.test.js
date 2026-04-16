/**
 * group-name-validation.test.js — B-006 AC3
 * Name validation: empty, whitespace-only, 257-char (too long), 256-char (at limit).
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { createGroup, updateGroup } from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';

const VALID_COLOR = GROUP_COLORS[0];
beforeEach(() => __resetMock());

test('AC3: createGroup rejects empty name', async () => {
  await assert.rejects(
    () => createGroup({ name: '', color: VALID_COLOR, parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: createGroup rejects whitespace-only name', async () => {
  await assert.rejects(
    () => createGroup({ name: '   ', color: VALID_COLOR, parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: createGroup rejects 257-char name (exceeds 256 limit)', async () => {
  const name = 'a'.repeat(257);
  await assert.rejects(
    () => createGroup({ name, color: VALID_COLOR, parentId: null }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: createGroup accepts 256-char name (at limit)', async () => {
  const name = 'a'.repeat(256);
  const g = await createGroup({ name, color: VALID_COLOR, parentId: null });
  assert.equal(g.name, name);
});

test('AC3: updateGroup rejects empty name', async () => {
  const g = await createGroup({ name: 'Original', color: VALID_COLOR, parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { name: '' }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: updateGroup rejects whitespace-only name', async () => {
  const g = await createGroup({ name: 'Original', color: VALID_COLOR, parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { name: '\t\n' }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: updateGroup rejects 257-char name', async () => {
  const g = await createGroup({ name: 'Original', color: VALID_COLOR, parentId: null });
  await assert.rejects(
    () => updateGroup(g.id, { name: 'b'.repeat(257) }),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('AC3: updateGroup accepts 256-char name', async () => {
  const g = await createGroup({ name: 'Original', color: VALID_COLOR, parentId: null });
  const newName = 'b'.repeat(256);
  const updated = await updateGroup(g.id, { name: newName });
  assert.equal(updated.name, newName);
});
