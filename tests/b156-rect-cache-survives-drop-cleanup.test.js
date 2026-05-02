/**
 * b156-rect-cache-survives-drop-cleanup.test.js — B-156 (Sprint 43)
 *
 * Pre-existing B-145 regression: `_cleanupTabDragDom()` was nulling
 * `_tabDragRectCache` BEFORE the drop dispatch ran, causing
 * `_computeStripInsertIndex(state)` to fall back to section-relative
 * `state.pendingInsertIndex` (because the cache lookup returned null).
 * For users with N saved-bookmark claimed tabs + floating tabs preceding
 * the Open Tabs section in the strip, the dropped tab landed N rows above
 * the target. User-reported: 31 rows above drop point.
 *
 * Fix (sidepanel.js): _cleanupTabDragDom() no longer nulls the rect cache.
 * The drop handler explicitly nulls _tabDragRectCache AFTER the dispatch
 * (in finally / per-early-return). The dragend cancel path also nulls.
 *
 * Static-source pins:
 *   T1   — _cleanupTabDragDom does NOT contain `_tabDragRectCache = null`
 *   T2   — drop handler explicit-null after dispatch (in finally)
 *   T3   — drop handler explicit-null in early-return paths
 *   T4   — dragend cancel path nulls the cache
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SIDEPANEL_SRC = readFileSync(
  join(__dirname, '..', 'sidepanel', 'sidepanel.js'),
  'utf8',
);

test('B-156 T1: _cleanupTabDragDom does NOT null _tabDragRectCache', () => {
  const fnMatch = SIDEPANEL_SRC.match(
    /function _cleanupTabDragDom\(\)\s*\{([\s\S]*?)^\}/m,
  );
  assert.ok(fnMatch, '_cleanupTabDragDom function body must be findable');
  const body = fnMatch[1];
  assert.doesNotMatch(
    body,
    /_tabDragRectCache\s*=\s*null/,
    '_cleanupTabDragDom must NOT null _tabDragRectCache (the drop dispatch needs it for _computeStripInsertIndex; nulling here breaks B-145 strip-absolute translation per B-156)',
  );
});

test('B-156 T2: drop handler explicitly nulls _tabDragRectCache in finally after dispatch', () => {
  /* Finally block right after the inner try/catch should null the cache. */
  assert.match(
    SIDEPANEL_SRC,
    /\}\s*finally\s*\{\s*_tabDragRectCache\s*=\s*null;[\s\S]{0,200}\}\s*return;\s*\}\s*\/\* B-030 v2/,
    'tab-drop dispatch must null _tabDragRectCache in a finally block before falling through to the item-drop branch',
  );
});

test('B-156 T3: drop handler nulls _tabDragRectCache on REJECT / no-pendingMode early return', () => {
  assert.match(
    SIDEPANEL_SRC,
    /pendingMode === null \|\| state\.pendingMode === 'REJECT'\)\s*\{\s*_tabDragRectCache\s*=\s*null;\s*return;/,
    'REJECT / no-pendingMode early-return path must null _tabDragRectCache',
  );
});

test('B-156 T4: dragend cancel path nulls _tabDragRectCache', () => {
  /* The cancel path is a sibling block to the drop handler — uses the
     cleanup-before-null pattern + B-156 explicit cache-null. */
  assert.match(
    SIDEPANEL_SRC,
    /if \(_tabDragState\) \{\s*_cleanupTabDragDom\(\);\s*_tabDragState = null;\s*\/\* B-156[\s\S]{0,500}_tabDragRectCache = null;/,
    'dragend cancel path must null _tabDragRectCache after _cleanupTabDragDom + state-null',
  );
});
