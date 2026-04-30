/**
 * B-030 — pure-helper tests for `computeItemReorder` in shared/sort-order.js.
 *
 * These pin the drag-reorder computation that the sidepanel uses before
 * dispatching MSG_BULK_REORDER_ITEMS. The helper must produce a minimal
 * update spec — only items whose post-drop (sortOrder, groupId) differs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeItemReorder, computeGroupReorder, computeMultiItemReorder, computeGroupPromote } from '../shared/sort-order.js';

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

/* =========================================================================
   B-031 — pure-helper tests for `computeGroupReorder` in shared/sort-order.js.

   The sidepanel uses these specs to build MSG_BULK_REORDER_GROUPS payloads
   for group drag-reorder + sub-group NEST. These tests cover T-1, T-2, T-3,
   and T-9 from docs/design/38-b-031-group-drag-reorder-nest.md §38.6.
   ========================================================================= */

function makeTopLevelGroups() {
  /* Four top-level groups in the default bucket (parentId = null). */
  return [
    { id: 'g-a', parentId: null, sortOrder: 0 },
    { id: 'g-b', parentId: null, sortOrder: 1000 },
    { id: 'g-c', parentId: null, sortOrder: 2000 },
    { id: 'g-d', parentId: null, sortOrder: 3000 },
  ];
}

function makeGroupsWithNesting() {
  /* Top-level: g-p (has two children), g-q, g-r.
     Sub-groups of g-p: g-c1, g-c2. */
  return [
    { id: 'g-p',  parentId: null,  sortOrder: 0 },
    { id: 'g-q',  parentId: null,  sortOrder: 1000 },
    { id: 'g-r',  parentId: null,  sortOrder: 2000 },
    { id: 'g-c1', parentId: 'g-p', sortOrder: 0 },
    { id: 'g-c2', parentId: 'g-p', sortOrder: 1000 },
  ];
}

/* ---------- T-1: top-level REORDER_ABOVE ---------- */

test('B-031 T-1: REORDER_ABOVE shifts target + subsequent; renumbers bucket; minimal update set', () => {
  const groups = makeTopLevelGroups();
  /* Drag g-d above g-b — expected new order: [g-a, g-d, g-b, g-c]
     with sortOrders 0, 1000, 2000, 3000. */
  const updates = computeGroupReorder(groups, 'g-d', 'REORDER_ABOVE', 'g-b');
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('g-d').sortOrder, 1000, 'g-d lands at index 1');
  assert.equal(byId.get('g-b').sortOrder, 2000, 'g-b shifted down to index 2');
  assert.equal(byId.get('g-c').sortOrder, 3000, 'g-c shifted down to index 3');
  /* g-a unchanged at index 0, sortOrder 0 — no update emitted (minimal set). */
  assert.equal(byId.has('g-a'), false, 'g-a unchanged; no update emitted');
  /* Same-bucket reorder — no parentId field on the dragged update. */
  assert.equal(byId.get('g-d').parentId, undefined, 'no parentId change for same-bucket reorder');
});

/* ---------- T-2: top-level REORDER_BELOW ---------- */

test('B-031 T-2: REORDER_BELOW puts dragged at targetIdx+1; renumbers bucket', () => {
  const groups = makeTopLevelGroups();
  /* Drag g-a below g-c — expected new order: [g-b, g-c, g-a, g-d]
     with sortOrders 0, 1000, 2000, 3000. */
  const updates = computeGroupReorder(groups, 'g-a', 'REORDER_BELOW', 'g-c');
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('g-b').sortOrder, 0, 'g-b at head');
  assert.equal(byId.get('g-c').sortOrder, 1000, 'g-c at index 1');
  assert.equal(byId.get('g-a').sortOrder, 2000, 'g-a at index 2 (after g-c)');
  /* g-d unchanged at index 3, sortOrder 3000 — no update emitted. */
  assert.equal(byId.has('g-d'), false, 'g-d unchanged; no update emitted');
  assert.equal(byId.get('g-a').parentId, undefined, 'no parentId change for same-bucket reorder');
});

/* ---------- T-3: NEST sets parentId + sortOrder = targetChildCount ---------- */

test('B-031 T-3: NEST sets parentId=targetId, sortOrder=targetChildCount; affected buckets renumbered', () => {
  const groups = makeGroupsWithNesting();
  /* Drag g-r into g-q (NEST). g-q has zero children → dragged lands at
     sortOrder 0. Source bucket (top-level) loses g-r so must renumber. */
  const updates = computeGroupReorder(groups, 'g-r', 'NEST', 'g-q');
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* g-r becomes a child of g-q at sortOrder 0 (g-q had no children). */
  assert.equal(byId.get('g-r').parentId, 'g-q', 'g-r now parented under g-q');
  assert.equal(byId.get('g-r').sortOrder, 0, 'g-r at index 0 in g-q child bucket');

  /* Source bucket: remaining top-level groups are g-p (0), g-q (1000) —
     already consecutive when idx*1000, so no updates expected for g-p/g-q
     (their sortOrder already matches 0 and 1000 respectively). */
  assert.equal(byId.has('g-p'), false, 'g-p unchanged at index 0');
  assert.equal(byId.has('g-q'), false, 'g-q unchanged at index 1 (sortOrder 1000)');
});

test('B-031 T-3: NEST into a target that already has children appends at childCount*1000', () => {
  const groups = makeGroupsWithNesting();
  /* Drag g-r into g-p (which already has g-c1 at 0 and g-c2 at 1000).
     g-r should land at sortOrder 2000 (childCount * 1000 with count=2). */
  const updates = computeGroupReorder(groups, 'g-r', 'NEST', 'g-p');
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('g-r').parentId, 'g-p');
  assert.equal(byId.get('g-r').sortOrder, 2000, 'g-r appended at child-count*1000 = 2000');
});

/* ---------- T-9: sub-group REORDER keeps parentId unchanged ---------- */

test('B-031 T-9: sub-group REORDER keeps parentId unchanged; renumbers sibling bucket', () => {
  const groups = makeGroupsWithNesting();
  /* Drag g-c2 above g-c1 within g-p's child bucket — expected new order:
     [g-c2, g-c1] with sortOrders 0, 1000. parentId stays 'g-p' for both. */
  const updates = computeGroupReorder(groups, 'g-c2', 'REORDER_ABOVE', 'g-c1');
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('g-c2').sortOrder, 0, 'g-c2 at head of child bucket');
  assert.equal(byId.get('g-c1').sortOrder, 1000, 'g-c1 shifted to index 1');
  /* No parentId change — same-bucket reorder. */
  assert.equal(byId.get('g-c2').parentId, undefined,
    'g-c2 keeps its parentId — no parentId update in a same-bucket reorder');
  assert.equal(byId.get('g-c1').parentId, undefined,
    'g-c1 keeps its parentId — no parentId update in a same-bucket reorder');
});

/* ---------- Sanity: self-drop + unknown-id + unknown-mode ---------- */

test('B-031: self-drop (draggedId === targetId) is a no-op', () => {
  const groups = makeTopLevelGroups();
  assert.deepEqual(computeGroupReorder(groups, 'g-a', 'REORDER_ABOVE', 'g-a'), []);
});

test('B-031: unknown dragged or target id returns empty updates', () => {
  const groups = makeTopLevelGroups();
  assert.deepEqual(computeGroupReorder(groups, 'nope', 'REORDER_ABOVE', 'g-a'), []);
  assert.deepEqual(computeGroupReorder(groups, 'g-a', 'REORDER_ABOVE', 'nope'), []);
});

test('B-031: unknown mode returns empty updates', () => {
  const groups = makeTopLevelGroups();
  assert.deepEqual(computeGroupReorder(groups, 'g-a', 'UNKNOWN_MODE', 'g-b'), []);
});

test('B-031: non-array groups input returns empty updates (defensive)', () => {
  assert.deepEqual(computeGroupReorder(null, 'g-a', 'REORDER_ABOVE', 'g-b'), []);
  assert.deepEqual(computeGroupReorder(undefined, 'g-a', 'REORDER_ABOVE', 'g-b'), []);
});

/* =========================================================================
   B-025 — pure-helper tests for `computeMultiItemReorder` in
   shared/sort-order.js. Covers §37.6 pure-helper test delta:
     - Same-group multi-drop to start / middle / end
     - Cross-group multi-drop: destination + source renumbered; groupId set
     - Empty destination group + multi-drop
     - Same-group same-position no-op returns []
     - Non-contiguous selection stable-ordering (AC5 + §37.9 F-7 pre-condition)
   ========================================================================= */

/* 6-item fixture across two groups: g1 = [a, b, c, d, e] (5 items, sortOrders
   0..4000), g2 = [d2, e2] (2 items, sortOrders 0/1000), plus one Ungrouped
   item u1. Used for multi-drag fixture coverage. */
function makeMultiFixture() {
  return [
    { id: 'a',  groupId: 'g1', sortOrder: 0 },
    { id: 'b',  groupId: 'g1', sortOrder: 1000 },
    { id: 'c',  groupId: 'g1', sortOrder: 2000 },
    { id: 'd',  groupId: 'g1', sortOrder: 3000 },
    { id: 'e',  groupId: 'g1', sortOrder: 4000 },
    { id: 'd2', groupId: 'g2', sortOrder: 0 },
    { id: 'e2', groupId: 'g2', sortOrder: 1000 },
    { id: 'u1', groupId: null, sortOrder: 0 },
  ];
}

/* ---------- Same-group multi-drop: start / middle / end ---------- */

test('B-025 pure-helper: same-group multi-drop to START position — stable-order insertion at idx=0', () => {
  const items = makeMultiFixture();
  /* Drag [c, d, e] (contiguous tail) → drop at idx=0 within g1.
     Pre-drop g1: [a, b, c, d, e]. Post-drop: [c, d, e, a, b].
     Caller pre-sorts draggedIds by sortOrder — [c,d,e] is already sorted. */
  const updates = computeMultiItemReorder(items, ['c', 'd', 'e'], 'g1', 0);
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('c').sortOrder, 0, 'c at head (idx 0)');
  assert.equal(byId.get('d').sortOrder, 1000, 'd at idx 1');
  assert.equal(byId.get('e').sortOrder, 2000, 'e at idx 2');
  assert.equal(byId.get('a').sortOrder, 3000, 'a shifted to idx 3');
  assert.equal(byId.get('b').sortOrder, 4000, 'b shifted to idx 4');
  /* Same-group reorder — no groupId field on any update. */
  for (const u of updates) {
    assert.equal(u.groupId, undefined, `no groupId on same-group update for ${u.id}`);
  }
});

test('B-025 pure-helper: same-group multi-drop to MIDDLE position — surrounding items renumbered', () => {
  const items = makeMultiFixture();
  /* Drag [a, b] → drop at idx=2 within g1. destItems (with a,b removed) is
     [c, d, e]. Splice at idx=2 → [c, d, a, b, e]. */
  const updates = computeMultiItemReorder(items, ['a', 'b'], 'g1', 2);
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* Expected post-drop bucket: [c, d, a, b, e] at 0,1000,2000,3000,4000.
     - c: was 2000, now 0 → update
     - d: was 3000, now 1000 → update
     - a: was 0, now 2000 → update
     - b: was 1000, now 3000 → update
     - e: was 4000, now 4000 → NO update */
  assert.equal(byId.get('c').sortOrder, 0);
  assert.equal(byId.get('d').sortOrder, 1000);
  assert.equal(byId.get('a').sortOrder, 2000);
  assert.equal(byId.get('b').sortOrder, 3000);
  assert.equal(byId.has('e'), false, 'e unchanged; no update emitted (minimal set)');
});

test('B-025 pure-helper: same-group multi-drop to END position — appends at bucketLength', () => {
  const items = makeMultiFixture();
  /* Drag [a, b] → drop at idx=3 (which is destItems.length after a,b
     removed → [c,d,e] has length 3). Post-drop: [c, d, e, a, b]. */
  const updates = computeMultiItemReorder(items, ['a', 'b'], 'g1', 3);
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('c').sortOrder, 0);
  assert.equal(byId.get('d').sortOrder, 1000);
  assert.equal(byId.get('e').sortOrder, 2000);
  assert.equal(byId.get('a').sortOrder, 3000, 'a at end');
  assert.equal(byId.get('b').sortOrder, 4000, 'b at very end');
});

/* ---------- Cross-group multi-drop ---------- */

test('B-025 pure-helper: cross-group multi-drop — destination renumbered, source renumbered, dragged items carry groupId', () => {
  const items = makeMultiFixture();
  /* Drag [b, c, d] from g1 → drop at idx=1 in g2 (between d2 and e2).
     Pre: g1=[a,b,c,d,e], g2=[d2,e2].
     Post: g1=[a,e], g2=[d2, b, c, d, e2].
     destIndex in destItems=[d2,e2] is 1 (between them). */
  const updates = computeMultiItemReorder(items, ['b', 'c', 'd'], 'g2', 1);
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* Destination bucket g2 post-drop: [d2, b, c, d, e2] — 0, 1000, 2000, 3000, 4000.
     - d2: was 0, stays 0 → NO update
     - b:  was 1000 in g1, now 1000 in g2 → update (groupId changed)
     - c:  was 2000 in g1, now 2000 in g2 → update (groupId changed)
     - d:  was 3000 in g1, now 3000 in g2 → update (groupId changed)
     - e2: was 1000, now 4000 → update */
  assert.equal(byId.has('d2'), false, 'd2 unchanged in g2 — no update');
  assert.equal(byId.get('b').sortOrder, 1000);
  assert.equal(byId.get('b').groupId, 'g2', 'b carries new groupId');
  assert.equal(byId.get('c').sortOrder, 2000);
  assert.equal(byId.get('c').groupId, 'g2', 'c carries new groupId');
  assert.equal(byId.get('d').sortOrder, 3000);
  assert.equal(byId.get('d').groupId, 'g2', 'd carries new groupId');
  assert.equal(byId.get('e2').sortOrder, 4000, 'e2 shifted in g2');
  /* Source g1 post-drop: [a, e] → 0, 1000. a was 0 (unchanged), e was 4000 (now 1000). */
  assert.equal(byId.has('a'), false, 'a unchanged in g1 — no update');
  assert.equal(byId.get('e').sortOrder, 1000, 'e renumbered in g1 after gap closed');
});

/* ---------- Empty destination group multi-drop ---------- */

test('B-025 pure-helper: empty destination group multi-drop — all dragged items land at 0..N-1', () => {
  const items = makeMultiFixture();
  /* Drag [a, b, c] → drop at idx=0 in a non-existent/empty group 'g3'.
     All three dragged items gain groupId='g3', sortOrders 0, 1000, 2000. */
  const updates = computeMultiItemReorder(items, ['a', 'b', 'c'], 'g3-empty', 0);
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('a').sortOrder, 0);
  assert.equal(byId.get('a').groupId, 'g3-empty');
  assert.equal(byId.get('b').sortOrder, 1000);
  assert.equal(byId.get('b').groupId, 'g3-empty');
  assert.equal(byId.get('c').sortOrder, 2000);
  assert.equal(byId.get('c').groupId, 'g3-empty');
  /* Source g1 renumbered: remaining [d, e] → 0, 1000 (were 3000, 4000). */
  assert.equal(byId.get('d').sortOrder, 0);
  assert.equal(byId.get('e').sortOrder, 1000);
});

/* ---------- Same-group same-position no-op ---------- */

test('B-025 pure-helper: same-group same-position drop returns [] (no-op)', () => {
  const items = makeMultiFixture();
  /* Drag [c, d] which occupy positions 2, 3 in g1. Destination is g1, and
     destIndex=2 means "insert at position 2 in the destItems list after
     dragged removed" — destItems = [a, b, e] with len 3; splicing [c,d] at
     idx=2 yields [a, b, c, d, e] — identical to the pre-drop bucket. */
  const updates = computeMultiItemReorder(items, ['c', 'd'], 'g1', 2);
  assert.deepEqual(updates, [], 'same-group same-position multi-drop must be a no-op');
});

test('B-025 pure-helper: same-group head no-op — draggedIds [a, b] to idx=0 is [] (already at head)', () => {
  const items = makeMultiFixture();
  const updates = computeMultiItemReorder(items, ['a', 'b'], 'g1', 0);
  assert.deepEqual(updates, [], 'dragging [a,b] from positions 0,1 to idx=0 is a no-op');
});

/* ---------- Non-contiguous selection stable-ordering (AC5 + F-7) ---------- */

test('B-025 pure-helper: non-contiguous selection preserves stable relative order — A, C, E dropped at end', () => {
  const items = makeMultiFixture();
  /* Dragged: [a, c, e] (non-contiguous: idx 0, 2, 4 in g1). Pre-sorted by
     sortOrder (the F-7 pre-condition the sidepanel dragstart enforces).
     destItems (with a,c,e removed) = [b, d] length 2. Drop at idx=2 (end).
     Post-drop bucket: [b, d, a, c, e] with sortOrders 0, 1000, 2000, 3000, 4000.
     Note: e was already at 4000 and remains at 4000 → minimal update set
     omits e. The stable-order assertion derives its position by reconstructing
     the final bucket from pre-drop sortOrders + emitted updates. */
  const updates = computeMultiItemReorder(items, ['a', 'c', 'e'], 'g1', 2);
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* a, b, c, d change; e is unchanged and omitted from updates. */
  assert.equal(byId.get('b').sortOrder, 0);
  assert.equal(byId.get('d').sortOrder, 1000);
  assert.equal(byId.get('a').sortOrder, 2000, 'a preserved first of the dragged trio');
  assert.equal(byId.get('c').sortOrder, 3000, 'c preserved second (between a and e)');
  assert.equal(byId.has('e'), false, 'e unchanged (sortOrder was already 4000) — no update');

  /* Assert stable relative-order by reconstructing the post-drop bucket from
     current sortOrders + updates overlay. */
  const finalById = new Map();
  for (const it of items.filter((x) => x.groupId === 'g1')) finalById.set(it.id, it.sortOrder);
  for (const u of updates) finalById.set(u.id, u.sortOrder);
  const draggedByFinalOrder = ['a', 'c', 'e']
    .map((id) => ({ id, sortOrder: finalById.get(id) }))
    .sort((x, y) => x.sortOrder - y.sortOrder)
    .map((u) => u.id);
  assert.deepEqual(draggedByFinalOrder, ['a', 'c', 'e'],
    'stable: pre-sorted draggedIds order is preserved post-drop (not lexicographic, not drag-initiation order)');
});

/* ---------- Edge cases / defensive ---------- */

test('B-025 pure-helper: empty draggedIds returns []', () => {
  const items = makeMultiFixture();
  assert.deepEqual(computeMultiItemReorder(items, [], 'g1', 0), []);
});

test('B-025 pure-helper: any unknown id in draggedIds returns [] (caller must pre-validate)', () => {
  const items = makeMultiFixture();
  assert.deepEqual(computeMultiItemReorder(items, ['a', 'does-not-exist'], 'g1', 0), []);
});

test('B-025 pure-helper: mixed-source-group draggedIds returns [] (D-4 invariant — upstream must enforce)', () => {
  const items = makeMultiFixture();
  /* a is in g1, d2 is in g2. The D-4 dragstart filter prevents this at the
     sidepanel layer; the helper is defensive and refuses. */
  assert.deepEqual(computeMultiItemReorder(items, ['a', 'd2'], 'g1', 0), []);
});

test('B-025 pure-helper: non-array inputs return [] (defensive)', () => {
  assert.deepEqual(computeMultiItemReorder(null, ['a'], 'g1', 0), []);
  assert.deepEqual(computeMultiItemReorder(undefined, ['a'], 'g1', 0), []);
  assert.deepEqual(computeMultiItemReorder([], null, 'g1', 0), []);
});

test('B-025 pure-helper: all emitted sortOrder values are integer multiples of 1000 (B-008 pattern)', () => {
  const items = makeMultiFixture();
  const updates = computeMultiItemReorder(items, ['b', 'c', 'd'], 'g2', 1);
  for (const u of updates) {
    assert.ok(Number.isInteger(u.sortOrder), `sortOrder must be integer (got ${u.sortOrder})`);
    assert.ok(u.sortOrder % 1000 === 0, `sortOrder must be multiple of 1000 (got ${u.sortOrder})`);
  }
});

test('B-025 pure-helper: multi-drop onto Ungrouped (destGroupId=null) flips groupId to null for all dragged', () => {
  const items = makeMultiFixture();
  /* Drag [a, b] from g1 → drop into Ungrouped (null). Pre-drop Ungrouped
     has [u1]. Post-drop Ungrouped: [u1, a, b] — 0, 1000, 2000. */
  const updates = computeMultiItemReorder(items, ['a', 'b'], null, 1);
  const byId = new Map(updates.map((u) => [u.id, u]));

  assert.equal(byId.get('a').groupId, null, 'a groupId flipped to null');
  assert.equal(byId.get('b').groupId, null, 'b groupId flipped to null');
  assert.equal(byId.get('a').sortOrder, 1000);
  assert.equal(byId.get('b').sortOrder, 2000);
  /* Source g1 renumbered after [a,b] removed → [c,d,e] at 0, 1000, 2000. */
  assert.equal(byId.get('c').sortOrder, 0);
  assert.equal(byId.get('d').sortOrder, 1000);
  assert.equal(byId.get('e').sortOrder, 2000);
});

/* =========================================================================
   B-122 — pure-helper tests for `computeGroupPromote` (sub-group →
   top-level promotion via drag). Sibling to `computeGroupReorder`;
   different inputs (no targetId, instead `insertAfterGroupId`).

   Fixture (mirrors makeGroupsWithNesting):
     Top-level: g-p (has 2 children), g-q, g-r
     Sub-groups of g-p: g-c1, g-c2

   Coverage:
     T1 (AC1) — promote g-c1 to top of list (insertAfterGroupId = null)
     T2 (AC3) — promote g-c1 to AFTER a top-level group
     T3 — defensive returns: unknown id, top-level dragged, anchor not
          in top-level bucket, anchor === draggedId
     T4 — source-bucket renumber correctness when promoting middle child
   ========================================================================= */

function makeGroupsForPromote() {
  /* Same shape as makeGroupsWithNesting but local to keep the suite
     self-contained. */
  return [
    { id: 'g-p',  parentId: null,  sortOrder: 0 },
    { id: 'g-q',  parentId: null,  sortOrder: 1000 },
    { id: 'g-r',  parentId: null,  sortOrder: 2000 },
    { id: 'g-c1', parentId: 'g-p', sortOrder: 0 },
    { id: 'g-c2', parentId: 'g-p', sortOrder: 1000 },
  ];
}

test('B-122 T1 (AC1): computeGroupPromote(groups, subGroupId, null) → dragged at top of list with parentId: null', () => {
  const groups = makeGroupsForPromote();
  /* Promote g-c1 to top of list (insertAfterGroupId = null) → top-level
     becomes [g-c1, g-p, g-q, g-r] at 0, 1000, 2000, 3000. */
  const updates = computeGroupPromote(groups, 'g-c1', null);
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* Dragged: parentId flips to null + sortOrder = 0 (top of list). */
  assert.equal(byId.get('g-c1').parentId, null, 'g-c1 parentId flipped to null');
  assert.equal(byId.get('g-c1').sortOrder, 0, 'g-c1 lands at top (sortOrder 0)');

  /* Top-level renumber: g-p was at 0 (idx 0) → now idx 1 → 1000 (changed). */
  assert.equal(byId.get('g-p').sortOrder, 1000, 'g-p shifts down to sortOrder 1000');
  /* g-q was at 1000 (idx 1) → now idx 2 → 2000 (changed). */
  assert.equal(byId.get('g-q').sortOrder, 2000, 'g-q shifts down to sortOrder 2000');
  /* g-r was at 2000 (idx 2) → now idx 3 → 3000 (changed). */
  assert.equal(byId.get('g-r').sortOrder, 3000, 'g-r shifts down to sortOrder 3000');

  /* Source bucket (former parent g-p's children) renumbered: g-c2 was at
     1000 (idx 1) → now idx 0 → 0. */
  assert.equal(byId.get('g-c2').sortOrder, 0, 'g-c2 closes the gap left by g-c1');
  /* g-c2 keeps parentId — source-bucket updates are sortOrder-only. */
  assert.equal(byId.get('g-c2').parentId, undefined,
    'g-c2 parentId not in update (sortOrder-only renumber)');
});

test('B-122 T2 (AC3): computeGroupPromote(groups, subGroupId, "g-q") → dragged inserted after g-q', () => {
  const groups = makeGroupsForPromote();
  /* Promote g-c1 after g-q → top-level becomes [g-p, g-q, g-c1, g-r]
     at 0, 1000, 2000, 3000. */
  const updates = computeGroupPromote(groups, 'g-c1', 'g-q');
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* Dragged: parentId flips to null; sortOrder lands at idx 2 → 2000. */
  assert.equal(byId.get('g-c1').parentId, null, 'g-c1 parentId flipped to null');
  assert.equal(byId.get('g-c1').sortOrder, 2000, 'g-c1 lands at index 2 (after g-q)');

  /* g-p (idx 0) and g-q (idx 1) keep their existing sortOrders → no
     update emitted (minimal-set contract). */
  assert.equal(byId.has('g-p'), false, 'g-p unchanged at idx 0; no update emitted');
  assert.equal(byId.has('g-q'), false, 'g-q unchanged at idx 1; no update emitted');

  /* g-r was at 2000 (idx 2) → now idx 3 → 3000 (changed). */
  assert.equal(byId.get('g-r').sortOrder, 3000, 'g-r shifts down to idx 3');

  /* Source bucket: g-c2 closes the gap. */
  assert.equal(byId.get('g-c2').sortOrder, 0, 'g-c2 closes the gap left by g-c1');
});

test('B-122 T3a: unknown draggedId returns []', () => {
  const groups = makeGroupsForPromote();
  assert.deepEqual(computeGroupPromote(groups, 'nope', null), []);
});

test('B-122 T3b: top-level group as draggedId returns [] (no parent to promote from)', () => {
  const groups = makeGroupsForPromote();
  /* g-p is already top-level — defense-in-depth no-op. */
  assert.deepEqual(computeGroupPromote(groups, 'g-p', null), []);
});

test('B-122 T3c: insertAfterGroupId not in top-level bucket returns [] (caller error)', () => {
  const groups = makeGroupsForPromote();
  /* g-c2 is NOT top-level — promoting "after a sub-group" is incoherent. */
  assert.deepEqual(computeGroupPromote(groups, 'g-c1', 'g-c2'), []);
});

test('B-122 T3d: insertAfterGroupId === draggedId returns [] (cannot insert after self)', () => {
  const groups = makeGroupsForPromote();
  assert.deepEqual(computeGroupPromote(groups, 'g-c1', 'g-c1'), []);
});

test('B-122 T3e: non-array groups input returns [] (defensive)', () => {
  assert.deepEqual(computeGroupPromote(null, 'g-c1', null), []);
  assert.deepEqual(computeGroupPromote(undefined, 'g-c1', null), []);
});

test('B-122 T4: promote middle child renumbers source bucket correctly with idx*1000 spacing', () => {
  /* Three sub-groups under g-p: c1 @ 0, c2 @ 1000, c3 @ 2000. Promote c2
     to top of list → source becomes [c1 @ 0, c3 @ 1000]; c3 must drop
     from 2000 → 1000. */
  const groups = [
    { id: 'g-p',  parentId: null,  sortOrder: 0 },
    { id: 'g-q',  parentId: null,  sortOrder: 1000 },
    { id: 'g-c1', parentId: 'g-p', sortOrder: 0 },
    { id: 'g-c2', parentId: 'g-p', sortOrder: 1000 },
    { id: 'g-c3', parentId: 'g-p', sortOrder: 2000 },
  ];
  const updates = computeGroupPromote(groups, 'g-c2', null);
  const byId = new Map(updates.map((u) => [u.id, u]));

  /* Dragged + top-level. */
  assert.equal(byId.get('g-c2').parentId, null);
  assert.equal(byId.get('g-c2').sortOrder, 0);

  /* Source-bucket: c1 stays at 0 (no update); c3 drops to 1000. */
  assert.equal(byId.has('g-c1'), false, 'g-c1 unchanged at idx 0; no update emitted');
  assert.equal(byId.get('g-c3').sortOrder, 1000, 'g-c3 closes gap, idx 2000 → 1000');
});

test('B-122 T5: all emitted sortOrder values are integer multiples of 1000 (B-008 pattern)', () => {
  const groups = makeGroupsForPromote();
  const updates = computeGroupPromote(groups, 'g-c1', 'g-q');
  for (const u of updates) {
    assert.equal(u.sortOrder % 1000, 0,
      `sortOrder ${u.sortOrder} for ${u.id} must be a multiple of 1000`);
  }
});
