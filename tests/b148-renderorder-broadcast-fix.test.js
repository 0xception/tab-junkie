/**
 * B-148 hotfix regression test — the items-scope broadcast fast-path must NOT
 * skip renderAll when only Group.renderOrder changed.
 *
 * UAT-discovered failure mode: first drag worked (search index null at cold
 * load → canPatch false → renderAll); second drag failed to update DOM
 * (search index now populated → canPatch true → diff-and-patch noop fast
 * path → DOM rebuild skipped → stale order).
 *
 * The fix: introduce a `renderOrderChanged` predicate that compares prior
 * `_cachedGroups` vs the freshly-fetched groups; force `canPatch = false`
 * whenever any group's renderOrder differs.
 *
 * Static-source pin verifying the predicate exists and is wired into the
 * canPatch gate. A live integration test would need DOM emulation; this
 * pin is sufficient to prevent regression of the predicate's wire-up.
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

test('B-148 hotfix: sidepanel listener defines renderOrderChanged predicate', () => {
  const src = loadSidepanelSrc();
  assert.match(src, /const renderOrderChanged\s*=\s*\(function/);
});

test('B-148 hotfix: renderOrderChanged compares prevRO vs nextRO arrays', () => {
  const src = loadSidepanelSrc();
  /* Predicate body should reference both _cachedGroups (prior) and groups (next),
     and walk renderOrder per group. */
  assert.match(src, /_cachedGroups/);
  assert.match(src, /prev\.renderOrder/);
  assert.match(src, /next\.renderOrder/);
});

test('B-148 hotfix: canPatch gate includes !renderOrderChanged', () => {
  const src = loadSidepanelSrc();
  /* Confirm the canPatch boolean expression includes the new clause. */
  assert.match(src, /canPatch\s*=[\s\S]{0,400}!renderOrderChanged/);
});
