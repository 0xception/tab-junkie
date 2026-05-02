/**
 * b157-floating-zone-expansion.test.js — B-157 (Sprint 43)
 *
 * Pre-B-157, `_buildTabDragRectCache` set each group's floating-zone `top`
 * to the bottom of the last saved-bookmark row (or top of items container
 * if no saved rows). For groups with saved bookmarks but NO floating tabs,
 * this collapsed the zone to ~zero height and made the group undroppable.
 * The header was never part of the zone, so drops on the header were also
 * rejected.
 *
 * B-157 widens the zone top to the GROUP SECTION's top — header included.
 * Result:
 * - Groups with no floating tabs are droppable (zone has visible height
 *   because it spans header + saved-bookmark rows + items-container bottom).
 * - Drops on the header place the tab at insertIndex 0 (top of floating
 *   list) via the existing midline math (Y above all floating midlines → 0).
 * - Drops in the saved-bookmark area also place at top of floating list
 *   (interleave deferred per B-148).
 *
 * The DOM-rect assertions live at UAT — node:test cannot construct
 * meaningful getBoundingClientRect data. This file pins the source-text
 * change so a future refactor that reverts the widening fails the test.
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

test('B-157 T1: floating zone top is the group section bounding-rect top, not last-saved-row bottom', () => {
  /* Locate the _buildTabDragRectCache function body and confirm the
     `const top = ...` assignment uses section.getBoundingClientRect().top
     (the new B-157 behavior) — NOT savedRows[last].bottom (pre-B-157). */
  const fnMatch = SIDEPANEL_SRC.match(
    /function _buildTabDragRectCache\(\)\s*\{([\s\S]*?)^\}/m,
  );
  assert.ok(fnMatch, '_buildTabDragRectCache function body must be findable');
  const body = fnMatch[1];
  assert.match(
    body,
    /const top = section\.getBoundingClientRect\(\)\.top;/,
    'B-157: floating zone top must be section.getBoundingClientRect().top so the zone covers the header + saved area + floating area',
  );
  /* Pin that the pre-B-157 last-saved-row formula is gone — guards against
     accidental revert to the zero-height-for-empty-floating-area class. */
  assert.doesNotMatch(
    body,
    /savedRows\.length > 0\s*\?\s*savedRows\[savedRows\.length - 1\]\.getBoundingClientRect\(\)\.bottom/,
    'B-157: must NOT use the pre-B-157 savedRows-last-bottom formula for zone top (causes zero-height zone for groups with no floating tabs)',
  );
});

test('B-157 T2: floating zone bottom continues to exclude nested child sections', () => {
  /* The nested-child exclusion is critical (drops on a nested child's
     floating area must classify as the child's group, not the parent's).
     B-157 only widens the top — bottom logic is unchanged. */
  const fnMatch = SIDEPANEL_SRC.match(
    /function _buildTabDragRectCache\(\)\s*\{([\s\S]*?)^\}/m,
  );
  assert.ok(fnMatch);
  assert.match(
    fnMatch[1],
    /firstChildSection\s*\?\s*firstChildSection\.getBoundingClientRect\(\)\.top\s*:\s*itemsContainer\.getBoundingClientRect\(\)\.bottom/,
    'B-157: zone bottom must still prefer first nested-child top (so child zones are not absorbed into parent)',
  );
});
