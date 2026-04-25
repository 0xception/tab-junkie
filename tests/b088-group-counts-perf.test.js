/**
 * b088-group-counts-perf.test.js — B-088 fix #5 regression guard.
 *
 * popup/group-jump-popup.js previously rebuilt {saved, open} counts inside
 * `_pickerRowFromGroup` by scanning the entire `_items` array on every call.
 * When the picker rendered S sub-groups during drill-in, this produced an
 * O(n*S) hot path. B-088 fix #5 introduced `_groupCountsById`, a Map
 * precomputed once when items / liveStates load, with O(1) lookup per call.
 *
 * Strategy (pure-in-test, mirrors b023-group-jump-popup precedent — the
 * popup module is not import-safe in Node because it touches `document`):
 *   - Reproduce `_rebuildGroupCounts` and `_pickerRowFromGroup` from
 *     popup/group-jump-popup.js with tight line-reference comments.
 *   - Assert the cached counts match a fixture's expected saved+open totals
 *     across a range of group sizes (0, 1, 5).
 *   - Assert the source code carries the precompute path (cheap drift guard
 *     — fails loudly if the optimisation is reverted to an inline scan).
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const POPUP_SRC = readFileSync(
  fileURLToPath(new URL('../popup/group-jump-popup.js', import.meta.url)),
  'utf8',
);

/* Reproduces popup/group-jump-popup.js `_rebuildGroupCounts` (B-088 fix #5).
   Update this reproduction in lockstep with the source — the assertions
   below depend on shape parity. */
function rebuildGroupCounts(items, liveStates) {
  const counts = new Map();
  for (const it of items) {
    if (!it.groupId) continue;
    let entry = counts.get(it.groupId);
    if (!entry) { entry = { saved: 0, open: 0 }; counts.set(it.groupId, entry); }
    entry.saved += 1;
    const ls = liveStates[it.id];
    if (ls && ls.live) entry.open += 1;
  }
  return counts;
}

/* Reproduces popup/group-jump-popup.js `_pickerRowFromGroup` (B-088 fix #5
   variant — reads from precomputed Map rather than scanning `_items`). */
function pickerRowFromGroup(g, groupCountsById) {
  const counts = groupCountsById.get(g.id);
  return {
    id: g.id,
    name: g.name || '',
    color: g.color || null,
    breadcrumb: '',
    savedCount: counts ? counts.saved : 0,
    openCount: counts ? counts.open : 0,
    searchKey: (g.name || '').toLowerCase(),
  };
}

test('B-088 fix #5: empty group → savedCount=0, openCount=0', () => {
  const items = [];
  const liveStates = {};
  const counts = rebuildGroupCounts(items, liveStates);
  const row = pickerRowFromGroup({ id: 'g1', name: 'Empty' }, counts);
  assert.equal(row.savedCount, 0);
  assert.equal(row.openCount, 0);
});

test('B-088 fix #5: 1 saved, 0 open → savedCount=1, openCount=0', () => {
  const items = [{ id: 'i1', groupId: 'g1' }];
  const liveStates = {}; // no live state recorded
  const counts = rebuildGroupCounts(items, liveStates);
  const row = pickerRowFromGroup({ id: 'g1', name: 'Solo' }, counts);
  assert.equal(row.savedCount, 1);
  assert.equal(row.openCount, 0);
});

test('B-088 fix #5: 5 saved, 3 open → counts match fixture', () => {
  const items = [
    { id: 'i1', groupId: 'g1' },
    { id: 'i2', groupId: 'g1' },
    { id: 'i3', groupId: 'g1' },
    { id: 'i4', groupId: 'g1' },
    { id: 'i5', groupId: 'g1' },
    /* Items in a different group must NOT contribute to g1. */
    { id: 'x1', groupId: 'g2' },
    { id: 'x2', groupId: 'g2' },
    /* Ungrouped items (groupId null/undefined) must be skipped. */
    { id: 'u1', groupId: null },
  ];
  const liveStates = {
    i1: { live: true },
    i3: { live: true },
    i5: { live: true },
    /* Live entry for an item in a different group must not bleed into g1. */
    x1: { live: true },
    /* Live=false must not be counted as open. */
    i2: { live: false },
  };
  const counts = rebuildGroupCounts(items, liveStates);

  const g1Row = pickerRowFromGroup({ id: 'g1', name: 'Five' }, counts);
  assert.equal(g1Row.savedCount, 5);
  assert.equal(g1Row.openCount, 3);

  const g2Row = pickerRowFromGroup({ id: 'g2', name: 'Two' }, counts);
  assert.equal(g2Row.savedCount, 2);
  assert.equal(g2Row.openCount, 1);

  /* A group with no items must yield zero counts, not undefined. */
  const ghostRow = pickerRowFromGroup({ id: 'g-missing', name: 'Ghost' }, counts);
  assert.equal(ghostRow.savedCount, 0);
  assert.equal(ghostRow.openCount, 0);
});

test('B-088 fix #5: drift guard — source carries precompute path, not inline scan', () => {
  /* Detect regression to the pre-B-088 shape: an inline `for (const it of _items)`
     loop INSIDE `_pickerRowFromGroup` would re-introduce the O(n*S) hot path.
     The current implementation must read from `_groupCountsById.get(g.id)`. */
  const fnIdx = POPUP_SRC.indexOf('function _pickerRowFromGroup');
  assert.ok(fnIdx >= 0, '_pickerRowFromGroup must exist');
  /* Slice the function body — search up to the next top-level function declaration. */
  const after = POPUP_SRC.slice(fnIdx);
  const nextFn = after.indexOf('\nfunction ', 1);
  const body = nextFn > 0 ? after.slice(0, nextFn) : after;
  assert.ok(
    body.includes('_groupCountsById.get'),
    '_pickerRowFromGroup must read from _groupCountsById (B-088 fix #5)',
  );
  assert.ok(
    !body.includes('for (const it of _items)'),
    '_pickerRowFromGroup must NOT inline-scan _items (regression to O(n*S))',
  );
});
