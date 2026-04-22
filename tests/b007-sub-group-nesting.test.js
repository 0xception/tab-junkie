/**
 * B-007 — Sub-group nesting (depth = 1) — UI helper tests.
 *
 * Storage-side depth + cycle enforcement already lives in
 * `background/storage/groups.js` and is covered by the B-001a + B-006
 * test suites. These tests pin the NEW UI-layer helpers (the parent-
 * picker filter + the error-code translator) that ship in B-007.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  filterGroupParentCandidates,
  translateGroupError,
} from '../shared/group-nesting.js';

/* =========================================================================
   filterGroupParentCandidates — pre-filter that powers the Parent <select>
   in the group dialog. Returns groups eligible as a parentId target.
   ========================================================================= */

test('B-007 AC1: create mode — candidates are all top-level groups with no children, sorted by sortOrder', () => {
  const groups = [
    { id: 'g-beta',  name: 'Beta',  parentId: null, sortOrder: 2 },
    { id: 'g-alpha', name: 'Alpha', parentId: null, sortOrder: 1 },
    { id: 'g-gamma', name: 'Gamma', parentId: null, sortOrder: 3 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  assert.deepEqual(out.map((g) => g.id), ['g-alpha', 'g-beta', 'g-gamma']);
});

test('B-007 AC1: create mode — already-nested groups excluded (depth-1 cap), top-level parents (incl. those with children) retained', () => {
  const groups = [
    { id: 'g-top',    name: 'Top',   parentId: null,  sortOrder: 1 },
    { id: 'g-child',  name: 'Child', parentId: 'g-top', sortOrder: 2 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  /* B-083: g-top is still a valid parent — a second sibling would stay at
     depth-1. g-child is excluded (already nested). */
  assert.deepEqual(out.map((g) => g.id), ['g-top']);
});

test('B-083: groups-with-children remain valid parents (multiple siblings at depth-1 allowed)', () => {
  const groups = [
    { id: 'g-top',     name: 'Top',     parentId: null,   sortOrder: 1 },
    { id: 'g-nested',  name: 'Nested',  parentId: 'g-top', sortOrder: 2 },
    { id: 'g-empty',   name: 'Empty',   parentId: null,   sortOrder: 3 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  /* g-top and g-empty are both valid parents; g-nested is already nested. */
  assert.deepEqual(out.map((g) => g.id), ['g-top', 'g-empty']);
});

test('B-007 AC2: edit mode — self excluded from candidates', () => {
  const groups = [
    { id: 'g-a', name: 'A', parentId: null, sortOrder: 1 },
    { id: 'g-b', name: 'B', parentId: null, sortOrder: 2 },
    { id: 'g-c', name: 'C', parentId: null, sortOrder: 3 },
  ];
  const editing = { id: 'g-b', name: 'B', parentId: null };
  const out = filterGroupParentCandidates(groups, editing);
  assert.deepEqual(out.map((g) => g.id), ['g-a', 'g-c'],
    'Editing g-b must exclude g-b from the parent list.');
});

test('B-007 AC2 + B-083: edit mode — self excluded; groups-with-children retained as valid parents', () => {
  const groups = [
    { id: 'g-p',   name: 'Parent', parentId: null,  sortOrder: 1 },
    { id: 'g-c',   name: 'Child',  parentId: 'g-p', sortOrder: 2 },
    { id: 'g-ed',  name: 'Edit',   parentId: null,  sortOrder: 3 },
    { id: 'g-sib', name: 'Sib',    parentId: null,  sortOrder: 4 },
  ];
  const editing = groups[2]; // g-ed
  const out = filterGroupParentCandidates(groups, editing);
  /* g-p retained (valid parent — nesting g-ed under it stays at depth-1);
     g-ed excluded (self); g-c excluded (already nested). g-sib retained. */
  assert.deepEqual(out.map((g) => g.id), ['g-p', 'g-sib']);
});

test('B-007 AC11 + B-083: create mode, single top-level parent with one child → parent is still a valid candidate', () => {
  const groups = [
    { id: 'g-p', name: 'P', parentId: null, sortOrder: 1 },
    { id: 'g-c', name: 'C', parentId: 'g-p', sortOrder: 2 },
  ];
  /* B-083: g-p is a valid parent for a NEW sibling (would become depth-1). */
  assert.deepEqual(
    filterGroupParentCandidates(groups, null).map((g) => g.id),
    ['g-p'],
  );
});

test('B-007: non-array input returns empty list (defensive)', () => {
  assert.deepEqual(filterGroupParentCandidates(null, null), []);
  assert.deepEqual(filterGroupParentCandidates(undefined, null), []);
  assert.deepEqual(filterGroupParentCandidates({}, null), []);
});

test('B-007: null / undefined entries in the groups array are tolerated', () => {
  const groups = [
    null,
    undefined,
    { id: 'g-a', name: 'A', parentId: null, sortOrder: 1 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  assert.deepEqual(out.map((g) => g.id), ['g-a']);
});

test('B-007: sortOrder missing on some groups — treated as 0 for sort stability', () => {
  const groups = [
    { id: 'g-a', name: 'A', parentId: null }, // no sortOrder
    { id: 'g-b', name: 'B', parentId: null, sortOrder: -1 },
    { id: 'g-c', name: 'C', parentId: null, sortOrder: 5 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  assert.deepEqual(out.map((g) => g.id), ['g-b', 'g-a', 'g-c']);
});

/* =========================================================================
   B-083 — multiple sibling sub-groups under the same parent (depth-1).
   The pre-filter was over-restrictive: it excluded any top-level group that
   already had a child, blocking users from adding a second / third sibling.
   These tests pin the new behaviour (multiple siblings allowed; storage
   layer still enforces depth-1 + cycle as the fail-closed authority).
   ========================================================================= */

test('B-083 AC1: [Work, Personal@Work] + new Projects → [Work] is a valid parent', () => {
  const groups = [
    { id: 'work',     name: 'Work',     parentId: null,   sortOrder: 1 },
    { id: 'personal', name: 'Personal', parentId: 'work', sortOrder: 2 },
  ];
  const out = filterGroupParentCandidates(groups, { id: 'projects', parentId: null });
  assert.deepEqual(out.map((g) => g.id), ['work'],
    'Work has one child (Personal); must still be a valid parent for Projects.');
});

test('B-083 AC1: [Work, Personal@Work, Hobbies] + new Projects → [Work, Hobbies] are valid parents', () => {
  const groups = [
    { id: 'work',     name: 'Work',     parentId: null,   sortOrder: 1 },
    { id: 'personal', name: 'Personal', parentId: 'work', sortOrder: 2 },
    { id: 'hobbies',  name: 'Hobbies',  parentId: null,   sortOrder: 3 },
  ];
  const out = filterGroupParentCandidates(groups, { id: 'projects', parentId: null });
  assert.deepEqual(out.map((g) => g.id), ['work', 'hobbies']);
});

test('B-083 AC1: [Work, Personal@Work, Projects@Work, Sidequests] + new sibling → [Work, Sidequests] (Work with TWO children still valid)', () => {
  const groups = [
    { id: 'work',       name: 'Work',       parentId: null,   sortOrder: 1 },
    { id: 'personal',   name: 'Personal',   parentId: 'work', sortOrder: 2 },
    { id: 'projects',   name: 'Projects',   parentId: 'work', sortOrder: 3 },
    { id: 'sidequests', name: 'Sidequests', parentId: null,   sortOrder: 4 },
  ];
  const out = filterGroupParentCandidates(groups, { id: 'new-sibling', parentId: null });
  /* Work already has two children — adding a third still stays at depth-1. */
  assert.deepEqual(out.map((g) => g.id), ['work', 'sidequests']);
});

test('B-083: editing Work (a top-level with a child) → self-excluded, remaining top-levels retained', () => {
  const groups = [
    { id: 'work',     name: 'Work',     parentId: null,   sortOrder: 1 },
    { id: 'personal', name: 'Personal', parentId: 'work', sortOrder: 2 },
  ];
  const editing = groups[0]; // Work
  const out = filterGroupParentCandidates(groups, editing);
  /* Work is self-excluded; Personal is already nested. No other top-levels. */
  assert.deepEqual(out.map((g) => g.id), []);
});

test('B-083: editing Personal (a sub-group of Work) → Work is still a valid parent', () => {
  const groups = [
    { id: 'work',     name: 'Work',     parentId: null,   sortOrder: 1 },
    { id: 'personal', name: 'Personal', parentId: 'work', sortOrder: 2 },
  ];
  const editing = groups[1]; // Personal (sub-group of Work)
  const out = filterGroupParentCandidates(groups, editing);
  /* Self-exclusion only filters Personal itself; Personal is not top-level
     anyway (parentId != null). Work remains the only valid parent — moving
     Personal back to Work is the trivial no-op the storage layer accepts. */
  assert.deepEqual(out.map((g) => g.id), ['work']);
});

/* =========================================================================
   translateGroupError — error-code → friendly-message mapping.
   ========================================================================= */

test('B-007 AC5: ERR_DEPTH_EXCEEDED → friendly depth message', () => {
  const msg = translateGroupError('ERR_DEPTH_EXCEEDED');
  assert.ok(msg.includes("one level deep"),
    'Message must explain the depth-1 cap in plain language.');
  assert.ok(!msg.includes('ERR_'),
    'Message must not expose the raw error code.');
});

test('B-007 AC6: ERR_CIRCULAR_REF → friendly cycle message', () => {
  const msg = translateGroupError('ERR_CIRCULAR_REF');
  assert.ok(msg.includes('under itself') || msg.includes('sub-groups'),
    'Message must explain the cycle rejection in plain language.');
  assert.ok(!msg.includes('ERR_'),
    'Message must not expose the raw error code.');
});

test('B-007 AC11c: ERR_NOT_FOUND (parent deleted elsewhere) → friendly refresh message', () => {
  const msg = translateGroupError('ERR_NOT_FOUND');
  assert.ok(msg.includes('no longer exists'),
    'Message must tell the user the parent is gone.');
});

test('B-007: unknown codes return null so caller falls back to err.message', () => {
  assert.equal(translateGroupError('ERR_VALIDATION'), null);
  assert.equal(translateGroupError(''), null);
  assert.equal(translateGroupError(undefined), null);
  assert.equal(translateGroupError('SOMETHING_ELSE'), null);
});
