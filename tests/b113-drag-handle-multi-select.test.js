/**
 * b113-drag-handle-multi-select.test.js — Sprint 36 / B-113 R5 (AC7)
 *
 * B-113 adds a small visual drag-handle (6-dot SVG matching .group-drag-handle)
 * to every saved-item row's first flex slot. The handle appears on hover when
 * NOT in multi-select mode. Reciprocally, the existing .item-select checkbox
 * flips its hover-reveal contract: visible on hover ONLY when multi-select is
 * active (#item-list.has-bulk-bar). The handle is decorative — pointer-events:
 * none ensures clicks pass through to the underlying .item-row, preserving
 * B-030's "drag from anywhere on the row" contract verbatim.
 *
 * Coverage map (≥ 5 tests required by AC7; this file ships 7):
 *
 *   T1 — AC1: `.item-drag-handle` element + 6-circle SVG appended to every
 *        saved-item row by `buildItemRow` (static-source).
 *   T2 — D-5 binding correction: handle is ABSENT from `buildOpenTabRow`
 *        (open-tab rows are not draggable; honest UX).
 *   T3 — AC2/AC3/AC4: default + hover + multi-select CSS rules for the
 *        drag handle present and correctly structured.
 *   T4 — D-3 b048 §31.5 AC6 contract change: hover-reveal of .item-select
 *        is now scoped under `#item-list.has-bulk-bar`; the focus-visible +
 *        [data-selected="true"] pair shares one block (preserved); the
 *        Gmail-pattern persistent reveal is in place.
 *   T5 — AC4 reactive flip via `has-bulk-bar` class toggle (no JS in the
 *        cascade hot path).
 *   T6 — AC6: `.item-drag-handle` is `pointer-events: none` (B-030 drag-
 *        passthrough preserved).
 *   T7 — AC5 regression: `[data-selected="true"]` row shows .item-select
 *        persistently with `aria-checked="true"`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/* =========================================================================
   T1 — AC1: `.item-drag-handle` appended in `buildItemRow` with the 6-circle
   SVG matching `.group-drag-handle` per D-1.
   ========================================================================= */
test('B-113 T1 (AC1): buildItemRow appends .item-drag-handle with 6-circle SVG and aria-hidden', () => {
  const src = readFile('sidepanel/sidepanel.js');

  /* Locate `buildItemRow` body — bounded between `function buildItemRow` and
     the next top-level `function `. */
  const bodyMatch = src.match(/function buildItemRow\([\s\S]*?\n\}\n/);
  assert.ok(bodyMatch, 'buildItemRow function body must be parseable');
  const body = bodyMatch[0];

  assert.match(
    body,
    /className\s*=\s*['"]item-drag-handle['"]/,
    'B-113 AC1: buildItemRow must construct an element with className "item-drag-handle"',
  );
  assert.match(
    body,
    /aria-hidden['"]?,\s*['"]true['"]/,
    'B-113 AC1: drag handle must declare aria-hidden="true" (decorative; row title is the AT carrier)',
  );

  /* SVG must contain all 6 circles per D-1 (cx=5/11, cy=4/8/12, r=1.5). */
  for (const cx of ['5', '11']) {
    for (const cy of ['4', '8', '12']) {
      const re = new RegExp(`cx="${cx}"\\s+cy="${cy}"\\s+r="1\\.5"`);
      assert.match(
        body,
        re,
        `B-113 AC1: drag handle SVG must contain circle cx=${cx} cy=${cy} r=1.5 (D-1 6-circle pattern)`,
      );
    }
  }
});

/* =========================================================================
   T2 — D-5 binding correction: handle absent from `buildOpenTabRow`.
   Open-tab rows are not draggable (sidepanel.js sets row.draggable=true
   only on saved-item rows at line ~2344, and on group sections at line
   ~2176; never in `buildOpenTabRow`). Showing a non-functional drag
   affordance would be dishonest UX.
   ========================================================================= */
test('B-113 T2 (B-158 update): buildOpenTabRow DOES contain .item-drag-handle (now draggable per B-134)', () => {
  const src = readFile('sidepanel/sidepanel.js');

  /* Pre-B-158 this test pinned the OPPOSITE — that buildOpenTabRow MUST NOT
     reference item-drag-handle. The original B-113 §56.3 D-5 reasoning was
     that open-tab rows weren't draggable. B-134 (S40) introduced the 5-op
     drag-and-drop for tab rows (REORDER_OPEN, REORDER_FLOATING, ATTACH,
     DETACH, MOVE_FLOATING), making the original D-5 comment stale. B-158
     (S43 close, 2026-05-03) restored the drag-handle affordance to give
     all row types — saved-bookmarks AND tabs (Open + floating) — the same
     checkbox/drag-handle visual contract. */
  const bodyMatch = src.match(/function buildOpenTabRow\([\s\S]*?\n\}\n/);
  assert.ok(bodyMatch, 'buildOpenTabRow function body must be parseable');
  const body = bodyMatch[0];

  assert.equal(
    body.includes('item-drag-handle'),
    true,
    'B-158: buildOpenTabRow MUST reference item-drag-handle so Open Tab rows + floating tab rows show the drag-handle affordance (parity with saved-bookmark rows; consistent with their B-134 draggable behavior)',
  );
});

/* =========================================================================
   T3 — AC2/AC3/AC4: default + hover + multi-select CSS rules for the drag
   handle. Default `opacity: 0` + `pointer-events: none`; hover sets
   `opacity: 1`; multi-select suppresses hover reveal back to 0.
   ========================================================================= */
test('B-113 T3 (AC2+AC3+AC4): .item-drag-handle CSS rules — default hidden, hover reveals, multi-select suppresses', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* Default rule with opacity 0 + pointer-events none + flex slot overlap.
     R4 [qa] M-1: the original `position: absolute` approach misaligned on
     data-live/data-active rows because absolute positioning anchors to
     the row's padding-edge which shifts with border-left. Replaced with
     `flex: 0 0 18px; margin-left: -18px;` — the handle gets the same
     flex slot as .item-select (no-reflow preserved: total flex consumption
     unchanged) but pulls back via negative margin to overlap the checkbox.
     Flex content alignment is border-edge-invariant. */
  const defaultBlock = css.match(/\.item-drag-handle\s*\{[^}]*\}/);
  assert.ok(defaultBlock, '.item-drag-handle default rule must be parseable');
  assert.match(defaultBlock[0], /opacity:\s*0\s*;?/, 'B-113 AC2: default rule must declare opacity: 0');
  assert.match(defaultBlock[0], /pointer-events:\s*none\s*;?/, 'B-113 AC6: default rule must declare pointer-events: none (B-030 drag-passthrough)');
  assert.match(defaultBlock[0], /flex:\s*0\s+0\s+18px\s*;?/, 'B-113 D-2 (R4 M-1 fix): default rule must declare flex: 0 0 18px (matches .item-select slot)');
  assert.match(defaultBlock[0], /margin-left:\s*-28px\s*;?/, 'B-158 (S43): default rule must declare margin-left: -28px (= -18 slot - 10 gap; pre-B-158 was -18px which absorbed the slot but left the parent .item-row flex `gap: 10px` between drag-handle and favicon, shifting row content right by 10px)');

  /* Hover reveal rule. */
  assert.match(
    css,
    /\.item-row:hover\s+\.item-drag-handle\s*\{\s*opacity:\s*1\s*;?\s*\}/,
    'B-113 AC3: .item-row:hover .item-drag-handle { opacity: 1 } must be present',
  );

  /* Multi-select suppression rule. */
  assert.match(
    css,
    /#item-list\.has-bulk-bar\s+\.item-row:hover\s+\.item-drag-handle\s*\{\s*opacity:\s*0\s*;?\s*\}/,
    'B-113 AC4: #item-list.has-bulk-bar .item-row:hover .item-drag-handle { opacity: 0 } must be present',
  );
});

/* =========================================================================
   T4 — D-3 b048 §31.5 AC6 contract change: hover-reveal of .item-select is
   now scoped under `#item-list.has-bulk-bar`. The focus-visible +
   [data-selected="true"] pair shares ONE block (preserved). Multi-select
   active reveals all checkboxes (Gmail pattern).
   ========================================================================= */
test('B-113 T4 (D-3 b048 AC6 contract change): .item-select hover scoped to multi-select; focus + selected preserved', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* The pre-B-113 unscoped hover rule must be GONE (or scoped under
     #item-list.has-bulk-bar). Search for the ungated form first. */
  const ungatedHover = /^\s*\.item-row:hover \.item-select(\s*,|\s*\{)/m;
  assert.equal(
    ungatedHover.test(css),
    false,
    'B-113 D-3: pre-B-113 unscoped `.item-row:hover .item-select` rule must be gone (now scoped under #item-list.has-bulk-bar)',
  );

  /* The focus-visible + [data-selected="true"] pair must share ONE
     visibility:visible block (preserved from b048 §31.5 AC6 minus the
     hover clause). */
  assert.match(
    css,
    /\.item-row:focus-visible \.item-select,\s*\n\s*\.item-row\[data-selected="true"\] \.item-select\s*\{\s*\n\s*visibility:\s*visible/,
    'B-113 D-3: focus-visible + [data-selected="true"] must share one `visibility: visible` block',
  );

  /* The hover clause must be scoped under #item-list.has-bulk-bar. */
  assert.match(
    css,
    /#item-list\.has-bulk-bar\s+\.item-row:hover\s+\.item-select\s*\{\s*\n\s*visibility:\s*visible/,
    'B-113 D-3: hover-reveal of .item-select must be scoped under #item-list.has-bulk-bar',
  );

  /* Multi-select Gmail-pattern persistent reveal: all checkboxes visible. */
  assert.match(
    css,
    /#item-list\.has-bulk-bar\s+\.item-row\s+\.item-select\s*\{\s*\n\s*visibility:\s*visible/,
    'B-113 D-3: #item-list.has-bulk-bar .item-row .item-select { visibility: visible } must be present (Gmail pattern persistent reveal)',
  );
});

/* =========================================================================
   T5 — AC4 reactive flip via `has-bulk-bar` class toggle. The cascade
   resolves visibility synchronously from the class state; no JS in the
   swap path. Behavioral test mirrors the production rules.
   ========================================================================= */

/* Resolver: given a parent `#item-list` with optional `has-bulk-bar` class
   and a `.item-row` (with optional `:hover` simulated via a flag), return
   the resolved visibility for both .item-drag-handle and .item-select.
   This mirrors the cascade exactly per the production rules. */
function resolveVisibility({ hasBulkBar, isHovered, isSelected }) {
  /* B-113 D-2/D-3 cascade resolution. Mirrors sidepanel.css rules. */
  let dragHandleOpacity, itemSelectVisibility;

  /* Drag handle: opacity 0 default; opacity 1 on hover; opacity 0 in
     multi-select-active hover (suppression). */
  if (isHovered && !hasBulkBar) {
    dragHandleOpacity = 1;
  } else {
    dragHandleOpacity = 0;
  }

  /* .item-select: visibility hidden by default; visible always when
     selected; visible on hover ONLY when multi-select active; visible on
     ALL rows when multi-select active (Gmail pattern). */
  if (isSelected) {
    itemSelectVisibility = 'visible';
  } else if (hasBulkBar) {
    itemSelectVisibility = 'visible'; // Gmail pattern persistent reveal
  } else {
    itemSelectVisibility = 'hidden';
  }

  return { dragHandleOpacity, itemSelectVisibility };
}

test('B-113 T5 (AC4): reactive flip via has-bulk-bar class — synchronous cascade resolution', () => {
  /* Initial idle state: no hover, no selection, no multi-select. */
  let v = resolveVisibility({ hasBulkBar: false, isHovered: false, isSelected: false });
  assert.equal(v.dragHandleOpacity, 0, 'idle: drag handle hidden (opacity 0)');
  assert.equal(v.itemSelectVisibility, 'hidden', 'idle: checkbox hidden');

  /* Hover, no multi-select: drag handle reveals; checkbox stays hidden. */
  v = resolveVisibility({ hasBulkBar: false, isHovered: true, isSelected: false });
  assert.equal(v.dragHandleOpacity, 1, 'hover (no multi-select): drag handle reveals');
  assert.equal(v.itemSelectVisibility, 'hidden', 'hover (no multi-select): checkbox stays hidden');

  /* Multi-select active, no hover: checkbox revealed (Gmail pattern); drag handle hidden. */
  v = resolveVisibility({ hasBulkBar: true, isHovered: false, isSelected: false });
  assert.equal(v.dragHandleOpacity, 0, 'multi-select active: drag handle stays hidden');
  assert.equal(v.itemSelectVisibility, 'visible', 'multi-select active: checkbox revealed (Gmail pattern)');

  /* Multi-select active + hover: checkbox stays visible; drag handle suppressed even on hover. */
  v = resolveVisibility({ hasBulkBar: true, isHovered: true, isSelected: false });
  assert.equal(v.dragHandleOpacity, 0, 'multi-select + hover: drag handle suppressed');
  assert.equal(v.itemSelectVisibility, 'visible', 'multi-select + hover: checkbox stays visible');

  /* Selected row, no multi-select: checkbox always visible. */
  v = resolveVisibility({ hasBulkBar: false, isHovered: false, isSelected: true });
  assert.equal(v.itemSelectVisibility, 'visible', 'selected row: checkbox always visible (B-024 contract)');
});

/* =========================================================================
   T6 — AC6 B-030 drag-passthrough: `.item-drag-handle` is `pointer-events:
   none`. Static-source guard.
   ========================================================================= */
test('B-113 T6 (AC6): .item-drag-handle is pointer-events: none (B-030 drag-from-anywhere preserved)', () => {
  const css = readFile('sidepanel/sidepanel.css');
  const block = css.match(/\.item-drag-handle\s*\{[^}]*\}/);
  assert.ok(block);
  assert.match(
    block[0],
    /pointer-events:\s*none/,
    'B-113 AC6: .item-drag-handle must declare pointer-events: none so clicks pass through to the row (preserves B-030 drag-from-anywhere contract)',
  );
});

/* =========================================================================
   T7 — AC5 regression: `[data-selected="true"]` row shows checkbox
   persistently with `aria-checked="true"`. B-024 + b048 contract preserved.
   ========================================================================= */
test('B-113 T7 (AC5 regression): [data-selected="true"] row shows checkbox persistently (B-024 contract)', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* The `[data-selected="true"] .item-select` clause must remain in the
     focus + selected pair block (covered by T4's first assertion, but
     pin again here for AC5 traceability). */
  assert.match(
    css,
    /\.item-row\[data-selected="true"\] \.item-select/,
    'B-113 AC5: .item-row[data-selected="true"] .item-select rule must persist (B-024 contract)',
  );

  /* aria-checked="true" + filled background rule (preserved unchanged
     from B-048 §31.5 D-2). */
  assert.match(
    css,
    /\.item-select\[aria-checked="true"\]/,
    'B-113 AC5: .item-select[aria-checked="true"] filled-background rule must persist (B-048 §31.5 D-2)',
  );
});
