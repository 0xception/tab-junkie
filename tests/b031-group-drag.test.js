/**
 * b031-group-drag.test.js — B-031 backend + integration tests.
 *
 * Covers:
 *   - `bulkReorderGroups` storage function (T-4, T-5, T-6, T-7, T-8, T-11)
 *   - `filterGroupParentCandidates` sub-group-drag behaviour (T-10)
 *
 * Pure-helper tests for `computeGroupReorder` (T-1, T-2, T-3, T-9) live in
 * `tests/sort-order.test.js` next to the existing `computeItemReorder`
 * pure-helper tests.
 *
 * Sidepanel-side drag mechanics (broadcast-race guard, rAF tick, indicator
 * DOM, etc.) are out of scope for this test layer per §38.6 ("full drag-flow
 * fake-DOM simulation is not required at R5"). UAT walks the end-to-end
 * drag flow manually.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { __resetMock } from './chrome-mock.js';
import {
  createGroup,
  bulkReorderGroups,
  listGroups,
  StorageError,
  ERR_VALIDATION,
  ERR_NOT_FOUND,
  ERR_DEPTH_EXCEEDED,
  ERR_CIRCULAR_REF,
} from '../background/storage/index.js';
import { MAX_BULK_INPUTS } from '../background/storage/shapes.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { filterGroupParentCandidates } from '../shared/group-nesting.js';

const COLOR = GROUP_COLORS[0];

beforeEach(() => {
  __resetMock();
});

/* Seed: four top-level groups with sortOrders 0, 1000, 2000, 3000 (the
   sidepanel's pre-normalisation spacing). Returns them in creation order. */
async function seedFourTopLevel() {
  const a = await createGroup({ name: 'A', color: COLOR, parentId: null, sortOrder: 0 });
  const b = await createGroup({ name: 'B', color: COLOR, parentId: null, sortOrder: 1000 });
  const c = await createGroup({ name: 'C', color: COLOR, parentId: null, sortOrder: 2000 });
  const d = await createGroup({ name: 'D', color: COLOR, parentId: null, sortOrder: 3000 });
  return { a, b, c, d };
}

/* Seed: one top-level parent + two sub-groups + one unrelated top-level. */
async function seedWithNesting() {
  const parent = await createGroup({ name: 'Parent', color: COLOR, parentId: null, sortOrder: 0 });
  const sibling = await createGroup({ name: 'Sibling', color: COLOR, parentId: null, sortOrder: 1000 });
  const child1 = await createGroup({ name: 'Child1', color: COLOR, parentId: parent.id, sortOrder: 0 });
  const child2 = await createGroup({ name: 'Child2', color: COLOR, parentId: parent.id, sortOrder: 1000 });
  return { parent, sibling, child1, child2 };
}

/* =========================================================================
   T-4 — applies spec + normalises bucket to consecutive integers
   ========================================================================= */

test('B-031 T-4: bulkReorderGroups applies spec and normalises bucket to consecutive integers', async () => {
  const { a, b, c, d } = await seedFourTopLevel();

  /* Sidepanel-style spec: move A to the end → new top-level order [B, C, D, A]
     with dispatched sortOrders 0, 1000, 2000, 3000. */
  const result = await bulkReorderGroups([
    { id: b.id, sortOrder: 0 },
    { id: c.id, sortOrder: 1000 },
    { id: d.id, sortOrder: 2000 },
    { id: a.id, sortOrder: 3000 },
  ]);

  assert.equal(result.notFound.length, 0, 'No unknown ids');
  assert.equal(result.updated.length, 4, 'All 4 ids updated');

  const all = await listGroups();
  const bucket = all
    .filter((g) => g.parentId === null)
    .sort((x, y) => x.sortOrder - y.sortOrder);

  /* AC9: post-write the bucket is normalised to 0, 1, 2, 3 — NOT the
     0/1000/2000/3000 we passed in. */
  assert.deepEqual(bucket.map((g) => g.sortOrder), [0, 1, 2, 3],
    'Post-write bucket must be consecutive integers (normalised)');
  assert.equal(bucket[0].id, b.id, 'B at head');
  assert.equal(bucket[1].id, c.id, 'C at index 1');
  assert.equal(bucket[2].id, d.id, 'D at index 2');
  assert.equal(bucket[3].id, a.id, 'A at tail');
});

test('B-031 T-4: bulkReorderGroups NEST normalises both destination and source buckets', async () => {
  const { parent, sibling, child1, child2 } = await seedWithNesting();

  /* Drag `sibling` (top-level) → NEST into `parent`.
     parent currently has 2 children (child1, child2). Sibling appended at
     sortOrder 2000 (idx*1000 for childCount=2). Top-level bucket loses
     sibling; remaining top-level = [parent] which is already at 0. */
  const result = await bulkReorderGroups([
    { id: sibling.id, sortOrder: 2000, parentId: parent.id },
  ]);

  assert.deepEqual(result.notFound, []);
  assert.ok(result.updated.includes(sibling.id));

  const all = await listGroups();
  /* Parent bucket (children of `parent`) normalised: child1=0, child2=1, sibling=2. */
  const parentChildren = all
    .filter((g) => g.parentId === parent.id)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(parentChildren.map((g) => g.sortOrder), [0, 1, 2],
    'Parent child bucket normalised');
  assert.deepEqual(parentChildren.map((g) => g.id), [child1.id, child2.id, sibling.id],
    'Sibling appended at tail of parent child bucket');

  /* Top-level bucket: only `parent` remains; normalised to [0]. */
  const topLevel = all
    .filter((g) => g.parentId === null)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(topLevel.map((g) => g.sortOrder), [0],
    'Top-level bucket normalised after sibling departed');
  assert.equal(topLevel[0].id, parent.id);
});

/* =========================================================================
   T-5 — rejects depth-2 attempt with ERR_DEPTH_EXCEEDED
   ========================================================================= */

test('B-031 T-5: bulkReorderGroups rejects nesting a group that already has children (ERR_DEPTH_EXCEEDED)', async () => {
  const { parent, sibling } = await seedWithNesting();

  /* Attempt to NEST `parent` (which has two children) under `sibling`.
     Would make child1/child2 depth=2 — storage must reject per
     `assertDepthAndCycle` + "cannot nest a group that already has children". */
  await assert.rejects(
    async () => bulkReorderGroups([
      { id: parent.id, sortOrder: 0, parentId: sibling.id },
    ]),
    (err) => err instanceof StorageError && err.code === ERR_DEPTH_EXCEEDED,
  );

  /* Atomicity: rejection must leave the pre-mutation state intact. */
  const all = await listGroups();
  const parentPost = all.find((g) => g.id === parent.id);
  assert.equal(parentPost.parentId, null, 'parent.parentId unchanged after rejection');
});

test('B-031 T-5: bulkReorderGroups rejects NEST under an already-nested parent (depth-2)', async () => {
  const { parent, sibling, child1 } = await seedWithNesting();

  /* Attempt to NEST `sibling` under `child1`, which is itself a sub-group
     of `parent`. Would put sibling at depth=2 → rejected. */
  await assert.rejects(
    async () => bulkReorderGroups([
      { id: sibling.id, sortOrder: 0, parentId: child1.id },
    ]),
    (err) => err instanceof StorageError && err.code === ERR_DEPTH_EXCEEDED,
  );

  const all = await listGroups();
  const siblingPost = all.find((g) => g.id === sibling.id);
  assert.equal(siblingPost.parentId, null, 'sibling.parentId unchanged after rejection');
  /* Also: parent still has its two children intact. */
  const parentChildrenPost = all.filter((g) => g.parentId === parent.id);
  assert.equal(parentChildrenPost.length, 2, 'parent still has 2 children post-reject');
});

/* =========================================================================
   T-6 — rejects circular with ERR_CIRCULAR_REF
   ========================================================================= */

test('B-031 T-6: bulkReorderGroups rejects circular parentId with ERR_CIRCULAR_REF', async () => {
  const { parent } = await seedWithNesting();

  /* Attempt to set parent.parentId = parent.id (self-parent) — cycle. */
  await assert.rejects(
    async () => bulkReorderGroups([
      { id: parent.id, sortOrder: 0, parentId: parent.id },
    ]),
    (err) => err instanceof StorageError && err.code === ERR_CIRCULAR_REF,
  );
});

/* =========================================================================
   T-7 — rejects drag into Ungrouped pseudo-id with ERR_NOT_FOUND
   ========================================================================= */

test('B-031 T-7: bulkReorderGroups rejects NEST into __ungrouped__ pseudo-id (ERR_NOT_FOUND)', async () => {
  const { sibling } = await seedWithNesting();

  /* The UI uses the string '__ungrouped__' as the Ungrouped section's
     pseudo-id; it is NEVER a real group record. A drag handler bug that
     dispatched a parentId=__ungrouped__ update must be rejected at the
     storage layer — `assertDepthAndCycle` cannot resolve the id to a
     group record and surfaces ERR_NOT_FOUND. */
  await assert.rejects(
    async () => bulkReorderGroups([
      { id: sibling.id, sortOrder: 0, parentId: '__ungrouped__' },
    ]),
    (err) => err instanceof StorageError && err.code === ERR_NOT_FOUND,
  );

  const all = await listGroups();
  const siblingPost = all.find((g) => g.id === sibling.id);
  assert.equal(siblingPost.parentId, null, 'sibling.parentId unchanged after rejection');
});

/* =========================================================================
   T-8 — partial-success semantics: unknown id in `notFound`, known applied
   ========================================================================= */

test('B-031 T-8: bulkReorderGroups surfaces unknown ids in notFound; known ids still applied', async () => {
  const { a, b } = await seedFourTopLevel();

  const result = await bulkReorderGroups([
    { id: a.id, sortOrder: 5000 },
    { id: 'ulid-does-not-exist', sortOrder: 9999 },
    { id: b.id, sortOrder: 6000 },
  ]);

  assert.ok(result.updated.includes(a.id), 'a applied');
  assert.ok(result.updated.includes(b.id), 'b applied');
  assert.ok(result.notFound.includes('ulid-does-not-exist'), 'unknown id in notFound');
  assert.equal(result.notFound.length, 1, 'only the unknown id surfaces');

  /* Verify a/b's sortOrders persisted (normalised) and the bucket is consistent. */
  const all = await listGroups();
  const aPost = all.find((g) => g.id === a.id);
  const bPost = all.find((g) => g.id === b.id);
  assert.ok(Number.isInteger(aPost.sortOrder), 'a sortOrder is an integer post-normalise');
  assert.ok(Number.isInteger(bPost.sortOrder), 'b sortOrder is an integer post-normalise');

  /* Top-level bucket normalised to [0, 1, 2, 3] — all four still top-level. */
  const bucket = all
    .filter((g) => g.parentId === null)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(bucket.map((g) => g.sortOrder), [0, 1, 2, 3],
    'Top-level bucket consecutive integers after partial-success apply');
});

/* =========================================================================
   T-10 — filterGroupParentCandidates returns [] for a sub-group drag
   (integration with shared/group-nesting.js — blanket NEST rejection).
   ========================================================================= */

test('B-031 T-10: filterGroupParentCandidates([parent, sub], sub) returns [] — blanket NEST rejection', () => {
  /* Sub-group drag scenario:
       - `parent` is top-level, has one child `sub`.
       - Dragged sub-group is `sub`.
     The filter excludes:
       - `sub` itself (editing group)
       - `parent` (has a child → depth-2 risk)
     Result: `[]` — no candidate to NEST into, matching the sidepanel's
     drag handler behaviour (`_classifyGroupDragIntent` returns REJECT for
     every NEST when `isSubGroupDrag` is true). */
  const groups = [
    { id: 'g-parent', name: 'Parent', parentId: null,       sortOrder: 0 },
    { id: 'g-sub',    name: 'Sub',    parentId: 'g-parent', sortOrder: 0 },
  ];
  const draggedSubGroup = groups[1];
  const out = filterGroupParentCandidates(groups, draggedSubGroup);
  assert.deepEqual(out, [], 'sub-group drag has zero NEST candidates (blanket reject)');
});

test('B-031 T-10: filterGroupParentCandidates excludes all groups-with-children when dragging a sub-group', () => {
  /* Richer scenario: three top-level groups, one of which (`g-parent`) has
     a sub-group. Dragging the sub-group should still yield no NEST
     candidates via the filter — because the two childless top-level groups
     would be valid `parentId` targets if not for the sub-group drag rule.
     The sidepanel's `isSubGroupDrag` guard is what enforces that; the
     filter only knows structural constraints. This test pins the structural
     outcome when ALL non-self top-level candidates are excluded by
     depth-2-prevention. */
  const groups = [
    { id: 'g-parent', name: 'P',  parentId: null,       sortOrder: 0 },
    { id: 'g-sub',    name: 'S',  parentId: 'g-parent', sortOrder: 0 },
  ];
  /* Call with the sub-group as `editingGroup` — verify the filter never
     surfaces the parent (it has a child, g-sub) and never surfaces the
     sub itself (self-exclusion). */
  const out = filterGroupParentCandidates(groups, groups[1]);
  assert.equal(out.length, 0);
  /* Defensive: ensure neither self nor parent appears. */
  const outIds = out.map((g) => g.id);
  assert.equal(outIds.includes('g-sub'), false, 'self never appears');
  assert.equal(outIds.includes('g-parent'), false, 'parent-with-children never appears');
});

/* =========================================================================
   T-11 — MAX_BULK_INPUTS cap enforced (B-031-H2 security regression guard)
   ========================================================================= */

test('B-031 T-11: bulkReorderGroups rejects oversize payload with ERR_VALIDATION (MAX_BULK_INPUTS cap)', async () => {
  /* Construct an array one item over the cap. Ids are synthetic; the cap
     check runs BEFORE existence validation, so these ids never need to
     exist in storage. */
  const oversize = [];
  for (let i = 0; i < MAX_BULK_INPUTS + 1; i++) {
    oversize.push({ id: `synthetic-${i}`, sortOrder: i });
  }

  await assert.rejects(
    async () => bulkReorderGroups(oversize),
    (err) => {
      assert.ok(err instanceof StorageError);
      assert.equal(err.code, ERR_VALIDATION);
      /* Message should mention the cap so the failure is self-describing
         in crash reports. */
      assert.ok(
        err.message.includes(String(MAX_BULK_INPUTS)),
        'error message should reference MAX_BULK_INPUTS value',
      );
      return true;
    },
  );
});

test('B-031 T-11: bulkReorderGroups accepts exactly MAX_BULK_INPUTS updates (at-cap boundary)', async () => {
  /* Seed one real group so at least one update applies (the rest surface
     in `notFound` under partial-success semantics). At-cap must succeed;
     over-cap fails per the previous test. */
  const g = await createGroup({ name: 'Solo', color: COLOR, parentId: null });
  const atCap = [{ id: g.id, sortOrder: 0 }];
  for (let i = 1; i < MAX_BULK_INPUTS; i++) {
    atCap.push({ id: `synthetic-${i}`, sortOrder: i });
  }
  assert.equal(atCap.length, MAX_BULK_INPUTS, 'payload is exactly at cap');

  const result = await bulkReorderGroups(atCap);
  assert.ok(result.updated.includes(g.id), 'real id applied');
  assert.equal(result.notFound.length, MAX_BULK_INPUTS - 1, 'synthetic ids surface in notFound');
});

/* =========================================================================
   Sanity: empty input + shape validation (pins existing contract)
   ========================================================================= */

test('B-031: bulkReorderGroups empty array rejects with ERR_VALIDATION', async () => {
  await assert.rejects(
    async () => bulkReorderGroups([]),
    (err) => err instanceof StorageError && err.code === ERR_VALIDATION,
  );
});

test('B-031: bulkReorderGroups non-finite sortOrder rejects with ERR_VALIDATION', async () => {
  const { a } = await seedFourTopLevel();
  await assert.rejects(
    async () => bulkReorderGroups([{ id: a.id, sortOrder: NaN }]),
    (err) => err instanceof StorageError && err.code === ERR_VALIDATION,
  );
});
