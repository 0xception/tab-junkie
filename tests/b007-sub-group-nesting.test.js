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

test('B-007 AC1: create mode — already-nested groups excluded (depth-1 cap)', () => {
  const groups = [
    { id: 'g-top',    name: 'Top',   parentId: null,  sortOrder: 1 },
    { id: 'g-child',  name: 'Child', parentId: 'g-top', sortOrder: 2 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  /* g-top has a child so it's depth-2-risk; g-child is already nested. */
  assert.deepEqual(out.map((g) => g.id), []);
});

test('B-007 AC8: groups-with-children excluded from candidates (depth-2 prevention)', () => {
  const groups = [
    { id: 'g-top',     name: 'Top',     parentId: null,   sortOrder: 1 },
    { id: 'g-nested',  name: 'Nested',  parentId: 'g-top', sortOrder: 2 },
    { id: 'g-empty',   name: 'Empty',   parentId: null,   sortOrder: 3 },
  ];
  const out = filterGroupParentCandidates(groups, null);
  /* g-empty is the only legitimate candidate — g-top has a child, g-nested
     is already nested. */
  assert.deepEqual(out.map((g) => g.id), ['g-empty']);
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

test('B-007 AC2: edit mode — groups-with-children AND self both excluded', () => {
  const groups = [
    { id: 'g-p',   name: 'Parent', parentId: null,  sortOrder: 1 },
    { id: 'g-c',   name: 'Child',  parentId: 'g-p', sortOrder: 2 },
    { id: 'g-ed',  name: 'Edit',   parentId: null,  sortOrder: 3 },
    { id: 'g-sib', name: 'Sib',    parentId: null,  sortOrder: 4 },
  ];
  const editing = groups[2]; // g-ed
  const out = filterGroupParentCandidates(groups, editing);
  /* g-p has a child so excluded; g-ed is self so excluded; g-c already
     nested. Only g-sib remains. */
  assert.deepEqual(out.map((g) => g.id), ['g-sib']);
});

test('B-007 AC11: zero top-level groups → empty candidate list (Top-level option only)', () => {
  const groups = [
    { id: 'g-p', name: 'P', parentId: null, sortOrder: 1 },
    { id: 'g-c', name: 'C', parentId: 'g-p', sortOrder: 2 },
  ];
  /* In create mode, g-p has a child and g-c is nested — no valid parent. */
  assert.deepEqual(filterGroupParentCandidates(groups, null), []);
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
