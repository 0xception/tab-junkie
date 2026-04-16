/**
 * group-color-persist.test.js — B-006 AC8
 * Color round-trips correctly after create and update; verified from storage.
 */
import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { createGroup, updateGroup, listGroups } from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';

beforeEach(() => __resetMock());

test('AC8: color is persisted to storage on create and round-trips correctly', async () => {
  for (const color of GROUP_COLORS) {
    __resetMock();
    const g = await createGroup({ name: `Group ${color}`, color, parentId: null });
    assert.equal(g.color, color, `returned color should match "${color}"`);

    // Read back from storage to verify persistence
    const groups = await listGroups();
    const stored = groups.find((gr) => gr.id === g.id);
    assert.ok(stored, 'group should exist in storage');
    assert.equal(stored.color, color, `stored color should match "${color}"`);
  }
});

test('AC8: color is persisted to storage after update and round-trips correctly', async () => {
  const g = await createGroup({ name: 'Test', color: GROUP_COLORS[0], parentId: null });

  for (const newColor of GROUP_COLORS.slice(1)) {
    const updated = await updateGroup(g.id, { color: newColor });
    assert.equal(updated.color, newColor, `returned color should be "${newColor}"`);

    const groups = await listGroups();
    const stored = groups.find((gr) => gr.id === g.id);
    assert.equal(stored.color, newColor, `stored color should be "${newColor}" after update`);
  }
});

test('AC8: creating two groups with different colors both persist correctly', async () => {
  const g1 = await createGroup({ name: 'G1', color: GROUP_COLORS[0], parentId: null });
  const g2 = await createGroup({ name: 'G2', color: GROUP_COLORS[1], parentId: null });

  const groups = await listGroups();
  const s1 = groups.find((g) => g.id === g1.id);
  const s2 = groups.find((g) => g.id === g2.id);
  assert.equal(s1.color, GROUP_COLORS[0]);
  assert.equal(s2.color, GROUP_COLORS[1]);
});
