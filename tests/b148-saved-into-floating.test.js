/**
 * B-148 polish — saved-bookmark drag into a group's floating zone.
 *
 * Static-source pins verifying the bidirectional interleave is wired up:
 * (1) the rect cache enumerates floating rows, (2) the hit-test recognizes
 * floating-row hits and returns a target with isFloatingAnchor + anchorRef,
 * (3) the drop dispatcher branches on pendingIsFloatingAnchor and writes
 * Group.renderOrder via MSG_REORDER_FLOATING_MEMBERS.
 *
 * Live integration tests would need a real Chromium sidepanel context with
 * functioning drag-and-drop; these source-static pins are sufficient to
 * prevent regression of the wiring.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const _testDir = dirname(fileURLToPath(import.meta.url));
function loadSidepanelSrc() {
  return readFileSync(join(_testDir, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
}

test('B-148 polish: _buildDragRectCache enumerates floating rows', () => {
  const src = loadSidepanelSrc();
  /* The cache should now build a parallel floatingRects map keyed by
     floatingTabId. */
  assert.match(src, /floatingRects\s*=\s*new Map\(\)/);
  assert.match(src, /row\.dataset\.floating === 'true'/);
});

test('B-148 polish: _computeDropTarget recognizes floating-row hits', () => {
  const src = loadSidepanelSrc();
  /* The hit-test should return a target with isFloatingAnchor + anchorRef +
     destGroupId when the pointer is over a floating row. */
  assert.match(src, /isFloatingAnchor:\s*true/);
  assert.match(src, /anchorRef:\s*'floating:'/);
});

test('B-148 polish: drop dispatcher branches on pendingIsFloatingAnchor', () => {
  const src = loadSidepanelSrc();
  /* The dispatcher should detect the floating-anchor case and route to a
     renderOrder dispatch. */
  assert.match(src, /pendingIsFloatingAnchor[\s\S]{0,200}pendingAnchorRef[\s\S]{0,200}pendingDestGroupId/);
});

test('B-148 polish: floating-anchor path dispatches MSG_REORDER_FLOATING_MEMBERS', () => {
  const src = loadSidepanelSrc();
  /* The floating-anchor branch should send MSG_REORDER_FLOATING_MEMBERS
     with a renderOrder field. */
  const idx = src.indexOf('pendingIsFloatingAnchor && state.pendingAnchorRef');
  assert.ok(idx >= 0, 'floating-anchor branch present');
  const after = src.slice(idx, idx + 4500);
  assert.match(after, /MSG_REORDER_FLOATING_MEMBERS,\s*\{[\s\S]{0,200}renderOrder:/);
});

test('B-148 polish: cross-group case dispatches MSG_BULK_REORDER_ITEMS first', () => {
  const src = loadSidepanelSrc();
  const idx = src.indexOf('pendingIsFloatingAnchor && state.pendingAnchorRef');
  assert.ok(idx >= 0);
  const after = src.slice(idx, idx + 4500);
  /* The cross-group branch (isCrossGroup) should dispatch
     MSG_BULK_REORDER_ITEMS to update item.groupId + sortOrder before
     the renderOrder write. */
  assert.match(after, /isCrossGroup/);
  assert.match(after, /MSG_BULK_REORDER_ITEMS/);
});
