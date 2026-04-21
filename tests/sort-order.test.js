/**
 * B-030 — pure-helper tests for `computeItemReorder` in shared/sort-order.js.
 *
 * These pin the drag-reorder computation that the sidepanel uses before
 * dispatching MSG_BULK_REORDER_ITEMS. The helper must produce a minimal
 * update spec — only items whose post-drop (sortOrder, groupId) differs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeItemReorder } from '../shared/sort-order.js';

/* ---------- fixtures ---------- */

function makeItems() {
  return [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
    { id: 'c', groupId: 'g1', sortOrder: 2000 },
    { id: 'd', groupId: 'g2', sortOrder: 0 },
    { id: 'e', groupId: 'g2', sortOrder: 1000 },
    { id: 'u1', groupId: null, sortOrder: 0 },
  ];
}

/* ---------- within-group reorder ---------- */

test('B-030 AC4: reorder within group — move first item to last position', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'a', 'g1', 2);
  /* Expected post-drop order in g1: [b, c, a] — sortOrders 0, 1000, 2000 */
  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('a').sortOrder, 2000, 'a ends up at end of g1');
  assert.equal(byId.get('b').sortOrder, 0, 'b shifts to position 0');
  assert.equal(byId.get('c').sortOrder, 1000, 'c shifts to position 1');
  /* No groupId change — same group reorder. */
  assert.equal(byId.get('a').groupId, undefined, 'no groupId update for same-group reorder');
});

test('B-030 AC4: reorder within group — move last item to first position', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'c', 'g1', 0);
  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('c').sortOrder, 0, 'c at head');
  assert.equal(byId.get('a').sortOrder, 1000, 'a at position 1');
  assert.equal(byId.get('b').sortOrder, 2000, 'b at position 2');
});

test('B-030 AC13f: same-group, same-position drop returns no updates (no-op)', () => {
  const items = makeItems();
  /* a is already at index 0 in g1; dropping at index 0 is a no-op. */
  const updates = computeItemReorder(items, 'a', 'g1', 0);
  assert.deepEqual(updates, [], 'same-position drop must be a no-op');
});

/* ---------- cross-group move ---------- */

test('B-030 AC5: cross-group move — item "a" moves from g1 to g2 at position 1', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'a', 'g2', 1);
  const byId = new Map(updates.map((u) => [u.id, u]));
  /* Destination g2 after insert: [d, a, e] → sortOrders 0, 1000, 2000 */
  assert.equal(byId.get('a').sortOrder, 1000, 'a lands at position 1 in g2');
  assert.equal(byId.get('a').groupId, 'g2', 'a now belongs to g2');
  assert.equal(byId.get('e').sortOrder, 2000, 'e shifts to position 2');
  /* d keeps sortOrder 0 — no update emitted. */
  assert.equal(byId.has('d'), false, 'd unchanged, no update emitted');
  /* Source g1 renumbered: [b, c] → 0, 1000. Both were 1000 and 2000 before. */
  assert.equal(byId.get('b').sortOrder, 0, 'b moves up in g1');
  assert.equal(byId.get('c').sortOrder, 1000, 'c moves up in g1');
});

test('B-030 AC6: drop onto Ungrouped (groupId = null)', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'a', null, 0);
  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('a').groupId, null, 'a groupId flips to null');
  assert.equal(byId.get('a').sortOrder, 0, 'a at head of Ungrouped');
  assert.equal(byId.get('u1').sortOrder, 1000, 'u1 shifts to position 1');
});

test('B-030 AC13a: drop into empty destination group', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'a', 'g3-empty', 0);
  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('a').groupId, 'g3-empty', 'a joins g3-empty');
  assert.equal(byId.get('a').sortOrder, 0, 'a at position 0 in new empty group');
  /* Source g1 renumbered: [b, c] → 0, 1000 */
  assert.equal(byId.get('b').sortOrder, 0);
  assert.equal(byId.get('c').sortOrder, 1000);
});

/* ---------- edge cases ---------- */

test('B-030: unknown dragged id returns empty updates', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'does-not-exist', 'g1', 0);
  assert.deepEqual(updates, []);
});

test('B-030: destIndex clamps to [0, destItems.length]', () => {
  const items = makeItems();
  /* destIndex = 999 on g1 (2 items after removing dragged). Should clamp to end. */
  const updates = computeItemReorder(items, 'a', 'g1', 999);
  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('a').sortOrder, 2000, 'a at end despite oversized destIndex');
});

test('B-030: non-array items input returns empty updates (defensive)', () => {
  assert.deepEqual(computeItemReorder(null, 'a', 'g1', 0), []);
  assert.deepEqual(computeItemReorder(undefined, 'a', 'g1', 0), []);
  assert.deepEqual(computeItemReorder({}, 'a', 'g1', 0), []);
});

test('B-030 AC9: all emitted sortOrder values are integers spaced by 1000 (B-008 pattern)', () => {
  const items = makeItems();
  const updates = computeItemReorder(items, 'a', 'g2', 1);
  for (const u of updates) {
    assert.ok(Number.isInteger(u.sortOrder), `sortOrder must be integer (got ${u.sortOrder})`);
    assert.ok(u.sortOrder % 1000 === 0, `sortOrder must be multiple of 1000 (got ${u.sortOrder})`);
  }
});

/* =========================================================================
   B-030 v2 AC21 — same-group reorder at THREE destinations for a 5-item
   group. Specifically pins the Sprint 22 silent-failure mode: same-group
   reorder where drop silently dropped the update. These tests exercise
   the exact code path that regressed.
   ========================================================================= */

function make5ItemGroup() {
  return [
    { id: 'a', groupId: 'g1', sortOrder: 0 },
    { id: 'b', groupId: 'g1', sortOrder: 1000 },
    { id: 'c', groupId: 'g1', sortOrder: 2000 },
    { id: 'd', groupId: 'g1', sortOrder: 3000 },
    { id: 'e', groupId: 'g1', sortOrder: 4000 },
  ];
}

test('B-030 v2 AC21 (i): drag first item to start (no-op) — returns empty updates', () => {
  const items = make5ItemGroup();
  /* "a" is already at index 0 in g1; dropping at index 0 is a no-op. */
  const updates = computeItemReorder(items, 'a', 'g1', 0);
  assert.deepEqual(updates, [], 'Same-group same-position drop must produce no updates');
});

test('B-030 v2 AC21 (ii): drag first item to middle (destIndex=2) — produces correct updates', () => {
  const items = make5ItemGroup();
  const updates = computeItemReorder(items, 'a', 'g1', 2);
  const byId = new Map(updates.map((u) => [u.id, u]));
  /* Expected post-drop order: [b, c, a, d, e] with sortOrders 0, 1000, 2000, 3000, 4000. */
  assert.equal(byId.get('b').sortOrder, 0, 'b at position 0');
  assert.equal(byId.get('c').sortOrder, 1000, 'c at position 1');
  assert.equal(byId.get('a').sortOrder, 2000, 'a at position 2 (middle)');
  /* d + e unchanged — their sortOrder matches their new index position, so no updates emitted. */
  assert.equal(byId.has('d'), false, 'd unchanged; no update');
  assert.equal(byId.has('e'), false, 'e unchanged; no update');
});

test('B-030 v2 AC21 (iii): drag first item to end (destIndex=4) — produces correct updates', () => {
  const items = make5ItemGroup();
  const updates = computeItemReorder(items, 'a', 'g1', 4);
  const byId = new Map(updates.map((u) => [u.id, u]));
  /* Expected post-drop order: [b, c, d, e, a] with sortOrders 0, 1000, 2000, 3000, 4000. */
  assert.equal(byId.get('b').sortOrder, 0, 'b at position 0');
  assert.equal(byId.get('c').sortOrder, 1000, 'c at position 1');
  assert.equal(byId.get('d').sortOrder, 2000, 'd at position 2');
  assert.equal(byId.get('e').sortOrder, 3000, 'e at position 3');
  assert.equal(byId.get('a').sortOrder, 4000, 'a at position 4 (end)');
});

test('B-030 v2 AC20 simulation: same-group drag-to-end produces dispatch spec that matches drop handler', () => {
  /* Simulates the sidepanel drop path: given a pending target row + insert
     position (derived by _dragTick from elementFromPoint + cached rect
     midpoint), resolve dest group + index, then compute the reorder spec.
     v2 drop handler uses exactly this logic (see sidepanel.js drop handler
     for item-drag path). The S22 bug lived between indicator DOM state and
     computeItemReorder inputs; v2 decouples them so this test covers the
     exact drop-time computation. */
  const items = make5ItemGroup();
  const draggedId = 'a';
  const pendingTargetRowId = 'e';
  const pendingInsertPosition = 'after';

  /* Resolve step — mirrors v2 drop handler logic. */
  const target = items.find((it) => it.id === pendingTargetRowId);
  const destGroupId = target.groupId ?? null;
  const destSiblings = items
    .filter((it) => (it.groupId ?? null) === destGroupId && it.id !== draggedId)
    .sort((x, y) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0));
  let destIndex = destSiblings.findIndex((it) => it.id === pendingTargetRowId);
  if (destIndex < 0) destIndex = destSiblings.length;
  if (pendingInsertPosition === 'after') destIndex += 1;

  assert.equal(destGroupId, 'g1');
  assert.equal(destIndex, 4, 'drop-after-last-sibling lands at end (index 4 in 4-sibling list)');

  const updates = computeItemReorder(items, draggedId, destGroupId, destIndex);
  assert.ok(updates.length > 0, 'Drop spec must be non-empty for a valid reorder');
  const byId = new Map(updates.map((u) => [u.id, u]));
  assert.equal(byId.get('a').sortOrder, 4000, 'a at end');
});
