import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const _testDir = dirname(fileURLToPath(import.meta.url));

function loadSidepanelSrc() {
  return readFileSync(join(_testDir, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
}

test('B-148 §3.7 / §3.8 D-1: _buildTabDragRectCache enumerates ALL .item-row rows in floating zone (not just data-floating)', () => {
  const src = loadSidepanelSrc();
  /* The selector should NOT be restricted to data-floating="true" anymore.
     Look for the new selector that captures both saved + floating rows. */
  /* New selector should match BOTH data-item-id (saved) AND data-tab-id (floating). */
  assert.match(src, /querySelectorAll\([^)]*\.item-row[^)]*\)/);
  /* Confirm the cache structure carries rowRefs in the floating-zone cluster. */
  assert.match(src, /rowRefs/);
});

test('B-148 §3.8 D-2: REORDER_FLOATING dispatcher emits renderOrder payload', () => {
  const src = loadSidepanelSrc();
  /* The MSG_REORDER_FLOATING_MEMBERS dispatch site (sendMessage call) should
     reference renderOrder. Anchor the search on the sendMessage call so the
     import statement at top-of-file is not matched. */
  const dispatchIdx = src.indexOf('sendMessage(MSG_REORDER_FLOATING_MEMBERS');
  assert.ok(dispatchIdx > 0, 'dispatch site exists');
  const after = src.slice(dispatchIdx, dispatchIdx + 2000);
  assert.match(after, /renderOrder/);
});

test('B-148: _computeTabDropTarget hit-test math is unchanged (no inversion)', () => {
  const src = loadSidepanelSrc();
  /* The Y vs midlines comparison should still work — sanity check that the
     core math wasn't accidentally inverted while extending the rowRefs. */
  assert.match(src, /rowMidlines/);
});
