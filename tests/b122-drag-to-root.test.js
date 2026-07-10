/**
 * b122-drag-to-root.test.js — B-122 R5 (Sprint 39, anchor item #2)
 *
 * Authoritative spec: docs/design/62-b-122-drag-to-root.md (§62.6 test plan).
 *
 * Sprint 39 / B-122 introduces a drag-based UX for promoting a depth-1
 * sub-group back to top level (`parentId: null`). The feature is the
 * inverse of B-031's drag-to-nest: the user drops a sub-group OUTSIDE any
 * group section (or above its own parent's header) to promote it.
 *
 * Coverage (maps to §62.6 + §62.2.x):
 *   T1 — bulkReorderGroups applies a PROMOTE-shaped spec end-to-end
 *        (parentId: null + cross-bucket renumber). Mirrors B-031 T-4.
 *   T2 — `MSG_BULK_REORDER_GROUPS` accepts the per-update shape
 *        `{ id, sortOrder, parentId: null }` for a sub-group → root
 *        promotion (no new message type).
 *   T3 (AC2) — DOM emission parity: sidepanel.js code under PROMOTE state
 *              uses ONLY the existing `groupReorderIndicatorEl`
 *              (`.group-reorder-indicator`); no new `*-promote-*` /
 *              `*-indicator` element is created.
 *   T4 (AC6) — Regression guard: `filterGroupParentCandidates` is
 *              unchanged; the B-007 dialog parent-picker keyboard path
 *              continues to work.
 *   T5 (§F-5) — Drop-handler race-guard: source-text assertion that the
 *               PROMOTE branch in the broadcast-race guard re-validates
 *               (a) dragged group still has a parent and (b) the
 *               insertion anchor is still top-level.
 *
 * Strategy: pure-helper tests live in `tests/sort-order.test.js`
 * alongside the existing B-031 helper tests. This file covers the
 * SW-storage path (T1, T2) via the chrome-mock + storage handlers, and
 * the sidepanel-side wiring (T3, T5) via source-text assertions
 * (matches B-031 / B-101 / B-123 patterns — sidepanel.js cannot be
 * imported in Node due to load-time DOM queries).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { __resetMock } from './chrome-mock.js';
import {
  createGroup,
  bulkReorderGroups,
  listGroups,
} from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { filterGroupParentCandidates } from '../shared/group-nesting.js';

const COLOR = GROUP_COLORS[0];

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

beforeEach(() => {
  __resetMock();
});

/* =========================================================================
   T1 — bulkReorderGroups applies a PROMOTE spec end-to-end (write path).

   Seed: parent P with two children (c1, c2). Promote c1 to top of list.
   ========================================================================= */

test('B-122 T1: bulkReorderGroups applies PROMOTE spec — sub-group becomes top-level + buckets renumber atomically', async () => {
  /* Seed: P (top-level), Q (top-level sibling), c1 + c2 under P. */
  const p = await createGroup({ name: 'P', color: COLOR, parentId: null, sortOrder: 0 });
  const q = await createGroup({ name: 'Q', color: COLOR, parentId: null, sortOrder: 1000 });
  const c1 = await createGroup({ name: 'C1', color: COLOR, parentId: p.id, sortOrder: 0 });
  const c2 = await createGroup({ name: 'C2', color: COLOR, parentId: p.id, sortOrder: 1000 });

  /* Promote c1 to top of list. Sidepanel-style spec: top-level becomes
     [c1, P, Q] @ 0, 1000, 2000; source bucket [c2] @ 0. */
  const result = await bulkReorderGroups([
    { id: c1.id, sortOrder: 0, parentId: null },
    { id: p.id, sortOrder: 1000 },
    { id: q.id, sortOrder: 2000 },
    { id: c2.id, sortOrder: 0 },
  ]);

  assert.equal(result.notFound.length, 0, 'No unknown ids');
  assert.equal(result.updated.length, 4, 'All 4 ids updated');

  const all = await listGroups();
  const byId = new Map(all.map((g) => [g.id, g]));

  /* c1 promoted to top-level. */
  assert.equal(byId.get(c1.id).parentId, null, 'c1 promoted to parentId: null');
  /* Top-level bucket normalised to 0, 1, 2 (B-008 idx*1000 → idx pattern;
     bulkReorderGroups normalises after applying the spec). */
  const topLevel = all
    .filter((g) => g.parentId === null)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(topLevel.map((g) => g.id), [c1.id, p.id, q.id],
    'top-level order is [c1, P, Q] post-promote');

  /* Source bucket (c2 alone). */
  const sourceBucket = all
    .filter((g) => g.parentId === p.id)
    .sort((x, y) => x.sortOrder - y.sortOrder);
  assert.deepEqual(sourceBucket.map((g) => g.id), [c2.id],
    'source bucket has only c2 left (c1 promoted out)');
  assert.equal(sourceBucket[0].sortOrder, 0, 'c2 sortOrder normalised to 0');
});

/* =========================================================================
   T2 — `parentId: null` is allowed in the per-update shape; no new message.
   ========================================================================= */

test('B-122 T2: bulkReorderGroups per-update accepts `parentId: null` (no new message type required)', async () => {
  const p = await createGroup({ name: 'P', color: COLOR, parentId: null, sortOrder: 0 });
  const c1 = await createGroup({ name: 'C1', color: COLOR, parentId: p.id, sortOrder: 0 });

  /* Single-record promote — verifies the writer accepts `parentId: null`
     without throwing ERR_VALIDATION. */
  const result = await bulkReorderGroups([
    { id: c1.id, sortOrder: 0, parentId: null },
  ]);
  assert.equal(result.updated.length, 1);

  const all = await listGroups();
  const updated = all.find((g) => g.id === c1.id);
  assert.equal(updated.parentId, null, 'c1.parentId === null after promote');
});

/* =========================================================================
   T3 (AC2) — DOM emission parity: PROMOTE state reuses the existing
   `.group-reorder-indicator` element. No new `*-promote-*` /
   `*-indicator` class is introduced.
   ========================================================================= */

test('B-122 T3 (AC2): PROMOTE drag-state reuses `.group-reorder-indicator` — no new indicator element / class', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');

  /* The promote-tick branch must reference the existing indicator
     element (`groupReorderIndicatorEl`) and NOT create a new
     `.group-promote-indicator` (or similar) — visual parity with
     B-031's REORDER indicator. */
  assert.match(
    sidepanelJs,
    /_computeGroupPromoteTarget/,
    'sidepanel.js must define _computeGroupPromoteTarget',
  );

  /* Locate the _groupDragTick body to verify PROMOTE branch reuses
     groupReorderIndicatorEl. */
  const tickMatch = sidepanelJs.match(/function _groupDragTick\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(tickMatch, '_groupDragTick must exist');
  const tickBody = tickMatch[1];

  /* The PROMOTE branch must set transform on the existing indicator,
     not create a new element. */
  assert.match(
    tickBody,
    /promote\s*=\s*_computeGroupPromoteTarget/,
    '_groupDragTick must call _computeGroupPromoteTarget in the no-target branch',
  );
  assert.match(
    tickBody,
    /groupReorderIndicatorEl\.style\.transform/,
    'PROMOTE branch must set transform on the existing groupReorderIndicatorEl (no new element)',
  );

  /* Pin: there is no `.group-promote-indicator` (or similar) class
     created or referenced anywhere in the codebase — the AC2 visual-
     parity contract. */
  assert.doesNotMatch(
    sidepanelJs,
    /group-promote-indicator/,
    'no `.group-promote-indicator` class — PROMOTE reuses the existing reorder indicator',
  );
  const sidepanelCss = readFile('sidepanel/sidepanel.css');
  assert.doesNotMatch(
    sidepanelCss,
    /group-promote-indicator/,
    'CSS does not declare `.group-promote-indicator`',
  );
});

/* =========================================================================
   T4 (AC6) — `filterGroupParentCandidates` regression guard. The B-007
   edit-dialog parent-picker promote path is unchanged; B-122 only adds
   the drag UX without modifying the existing keyboard path.
   ========================================================================= */

test('B-122 T4 (AC6): filterGroupParentCandidates unchanged — B-007 dialog parent-picker promote path preserved', () => {
  /* The dialog uses filterGroupParentCandidates to populate the parent
     <select>. B-122 must NOT modify this helper. The contract is: for a
     sub-group, the candidate set is every top-level group EXCEPT the
     dragged one's own parent (and self). The B-007 promotion path adds
     a synthetic "Top-level" option in the dialog's <select> wrapping. */
  const groups = [
    { id: 'g-p',  parentId: null,  sortOrder: 0 },
    { id: 'g-q',  parentId: null,  sortOrder: 1000 },
    { id: 'g-r',  parentId: null,  sortOrder: 2000 },
    { id: 'g-c1', parentId: 'g-p', sortOrder: 0 },
    { id: 'g-c2', parentId: 'g-p', sortOrder: 1000 },
  ];
  const sub = groups.find((g) => g.id === 'g-c1');
  const candidates = filterGroupParentCandidates(groups, sub);
  const ids = candidates.map((g) => g.id).sort();

  /* For c1 (a sub-group of g-p), the candidate set must include the
     other top-level groups (g-q, g-r) and exclude self + already-nested
     children. The exact filter behavior is owned by B-007 — this test
     simply confirms B-122 did not break it. */
  assert.ok(ids.includes('g-q'), 'g-q remains a candidate (sibling top-level)');
  assert.ok(ids.includes('g-r'), 'g-r remains a candidate (sibling top-level)');
  assert.ok(!ids.includes('g-c1'), 'self is excluded from candidates');
});

/* =========================================================================
   T5 (§F-5) — Race-guard third branch: PROMOTE re-validates that the
   dragged group still has a parent + the insertion anchor is still
   top-level when `_cachedGroupsGen` advanced mid-drag.
   ========================================================================= */

test('B-122 T5 (§F-5): drop-handler PROMOTE race-guard re-validates parentage + anchor stability', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');

  /* Locate the broadcast-race guard block under the group-drop branch
     and verify it has a PROMOTE-specific re-validation branch. */
  const promoteGuardMatch = sidepanelJs.match(/state\.pendingMode === 'PROMOTE'[\s\S]*?freshDragged\.parentId[\s\S]*?anchorStillTopLevel/);
  assert.ok(promoteGuardMatch,
    'race-guard must include a PROMOTE branch that re-validates dragged.parentId and anchor top-level membership');

  /* The guard must abort with the standard toast if either invariant
     fails (matches the NEST + REORDER branches' UX). */
  const toastMatch = sidepanelJs.match(/PROMOTE[\s\S]{0,2000}?showToast\(/);
  assert.ok(toastMatch,
    'PROMOTE race-guard branch must call showToast on invariant violation');

  /* The dispatch must use computeGroupPromote when pendingMode is
     PROMOTE, NOT computeGroupReorder (different inputs). */
  assert.match(
    sidepanelJs,
    /pendingMode === 'PROMOTE'\s*\?\s*computeGroupPromote/,
    'drop handler must dispatch via computeGroupPromote for PROMOTE mode',
  );
});

/* =========================================================================
   T6 — Cache extension: `_buildGroupDragRectCache` populates
   `topLevelOrder` + `topLevelTopY` so promote target hit-testing is
   O(1) per tick (no DOM queries inside the rAF callback).
   ========================================================================= */

test('B-122 T6 (§62.2.4): _buildGroupDragRectCache extension — `topLevelOrder` + `topLevelTopY` populated for promote hit-test', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');

  /* Locate the cache builder body. */
  const cacheMatch = sidepanelJs.match(/function _buildGroupDragRectCache\(\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(cacheMatch, '_buildGroupDragRectCache must exist');
  const cacheBody = cacheMatch[1];

  assert.match(cacheBody, /topLevelOrder/,
    'cache must populate `topLevelOrder` (top-level groupIds in DOM order)');
  assert.match(cacheBody, /topLevelTopY/,
    'cache must populate `topLevelTopY` (top-level section.top edges)');

  /* The cache assignment at the bottom of the function must include both
     fields in the resulting object literal. */
  assert.match(
    cacheBody,
    /_groupDragRectCache\s*=\s*\{[\s\S]*?topLevelOrder[\s\S]*?topLevelTopY[\s\S]*?\}/,
    'cache object literal must include topLevelOrder and topLevelTopY fields',
  );
});

/* =========================================================================
   T7 (Wave 3a M-4 / qa M-2 fix-round / B-196 §79.5.4) — top-level region
   reject-guard. `_computeGroupPromoteTarget` must explicitly reject the merged
   `.top-level-section` (formerly `.open-tabs-section`) as a promote target so a
   sub-group dropped over the region does NOT promote to "after last top-level
   group". The guard uses
   `document.elementFromPoint(x, y).closest('.top-level-section')`.
   ========================================================================= */

test('B-122 T7 (B-196 merge): _computeGroupPromoteTarget rejects pointer over .top-level-section', () => {
  const sidepanelJs = readFile('sidepanel/sidepanel.js');

  /* Locate the helper body. */
  const helperMatch = sidepanelJs.match(/function _computeGroupPromoteTarget\(x, y\)\s*\{([\s\S]*?)\nfunction /);
  assert.ok(helperMatch, '_computeGroupPromoteTarget must exist');
  const helperBody = helperMatch[1];

  /* The guard MUST call elementFromPoint and check for .top-level-section. */
  assert.match(
    helperBody,
    /document\.elementFromPoint\(x,\s*y\)/,
    '_computeGroupPromoteTarget must call document.elementFromPoint(x, y)',
  );
  assert.match(
    helperBody,
    /\.closest\?\.\(['"]\.top-level-section['"]\)/,
    '_computeGroupPromoteTarget must `.closest("." + top-level-section)` reject-guard',
  );

  /* The reject-guard must return null (no promote) when the closest match
     is the merged top-level region. */
  assert.match(
    helperBody,
    /closest\?\.\(['"]\.top-level-section['"]\)\)\s*return\s+null/,
    'top-level reject-guard must `return null` when pointer is over the region',
  );
});
