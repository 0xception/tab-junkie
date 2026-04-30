/**
 * b123-row-alignment.test.js — B-123 R3 regression coverage for the
 * item-row alignment fix (Fast Track XS, Wave 1 of Sprint 39).
 *
 * Authoritative spec: docs/BACKLOG.md B-123 AC1-AC7.
 *
 * The bug: pre-B-123 the base `.item-row` rule had `padding: 6px 12px` (no
 * border) while indicator variants `.item-row[data-live="true"]` and
 * `.item-row[data-active="true"]` redeclared `border-left: 3px solid <color>;
 * padding-left: 9px;`. Math worked out to 12 px content origin in default
 * mode (0 + 12 == 3 + 9), but `.tj-dense .item-row` overrode `padding: 3px
 * 12px` — leaving the indicator variants' 3 px border in flow without the
 * compensating 9 px padding-left → content origin shifted from 12 px to
 * 15 px on dense + live/active rows. User-visible jagged left edge.
 *
 * The fix: make every `.item-row` reserve `border-left: 3px solid transparent`
 * + `padding-left: 9px` as a structural placeholder. Indicator variants
 * override only `border-left-color` (never width, style, or padding). Dense
 * mode preserves `padding-left: 9px`. Result: content-x-origin = 12 px on
 * EVERY row variant, in default and dense modes.
 *
 * Strategy: regex-pin the CSS rule shapes against `sidepanel/sidepanel.css`.
 * The math is verifiable from the rule-text alone — no jsdom layout engine
 * required. This mirrors the b048 / b092 source-invariant pin pattern.
 *
 * Coverage map:
 *   T1 (AC1) — base `.item-row` carries `border-left: 3px solid transparent`
 *              and `padding-left: 9px` so plain rows share content origin
 *              with indicator rows.
 *   T2 (AC1) — indicator variants `[data-live]` + `[data-active]` override
 *              ONLY `border-left-color` (never width/style/padding).
 *   T3 (AC1) — dense-mode `.tj-dense .item-row` preserves `padding-left: 9px`
 *              so the base 3 px transparent border-left placeholder stays
 *              compensated in dense mode (the original bug surface).
 *   T4 (AC2) — `.item-drift-bar` remains `position: absolute` (B-101 §48.3
 *              regression guard — out-of-flow, does not perturb content
 *              origin).
 *   T5 (AC5) — `.item-audible-icon` (RIGHT-side, OUT OF SCOPE per AC5) is
 *              not modified — regression guard against scope creep.
 *   T6 (AC4) — newtab + popup surfaces have no left-side border indicator
 *              (no-op verdict from R1 R2-VERIFY) — regression guard that
 *              future left-side indicator additions to newtab/popup would
 *              flag here.
 */

import './_setup.js';
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
   T1 — base `.item-row` rule carries the transparent-border placeholder.
   ========================================================================= */

test('B-123 T1 (AC1): base `.item-row` reserves a 3px transparent left-border + 9px left-padding', () => {
  const css = readFile('sidepanel/sidepanel.css');

  // Match the base `.item-row {` block (NOT `.item-row[...]` or `.item-row:...`
  // and NOT `.item-row.<modifier>` — the bare base rule only).
  const baseMatch = css.match(/(^|\n)\.item-row\s*\{([^}]*)\}/);
  assert.ok(baseMatch, 'base `.item-row` rule must exist');
  const baseBody = baseMatch[2];

  // Transparent left-border placeholder — 3px solid transparent.
  assert.match(
    baseBody,
    /border-left:\s*3px\s+solid\s+transparent/,
    'base `.item-row` must declare `border-left: 3px solid transparent` (B-123 §61 placeholder)',
  );

  // padding shorthand must terminate with the 9 px left value (4-value form
  // `6px 12px 6px 9px`, OR a longhand `padding-left: 9px` after the shorthand).
  const padding9 =
    /padding:\s*\d+px\s+\d+px\s+\d+px\s+9px/.test(baseBody) ||
    /padding-left:\s*9px/.test(baseBody);
  assert.ok(
    padding9,
    'base `.item-row` must end with `padding-left: 9px` (3 + 9 = 12 px content origin)',
  );
});

/* =========================================================================
   T2 — indicator variants override ONLY border-left-color.
   ========================================================================= */

test('B-123 T2 (AC1): `[data-live]` + `[data-active]` override ONLY `border-left-color` — never width/style/padding', () => {
  const css = readFile('sidepanel/sidepanel.css');

  const liveMatch = css.match(/\.item-row\[data-live="true"\]\s*\{([^}]*)\}/);
  assert.ok(liveMatch, '`.item-row[data-live="true"]` rule must exist');
  const liveBody = liveMatch[1];

  // MUST set border-left-color.
  assert.match(
    liveBody,
    /border-left-color:\s*var\(--live-indicator\)/,
    'live variant must override `border-left-color` to var(--live-indicator)',
  );

  // MUST NOT redeclare full `border-left:` shorthand (would re-introduce the
  // pre-B-123 width/style/padding asymmetry the placeholder was meant to fix).
  assert.doesNotMatch(
    liveBody,
    /(^|;|\n)\s*border-left\s*:/,
    'live variant must NOT redeclare full `border-left:` shorthand',
  );

  // MUST NOT override padding-left (would break dense-mode invariance).
  assert.doesNotMatch(
    liveBody,
    /padding-left\s*:/,
    'live variant must NOT redeclare `padding-left` (placeholder owns it)',
  );

  const activeMatch = css.match(/\.item-row\[data-active="true"\]\s*\{([^}]*)\}/);
  assert.ok(activeMatch, '`.item-row[data-active="true"]` rule must exist');
  const activeBody = activeMatch[1];

  assert.match(
    activeBody,
    /border-left-color:\s*var\(--active-border\)/,
    'active variant must override `border-left-color` to var(--active-border)',
  );
  assert.doesNotMatch(
    activeBody,
    /(^|;|\n)\s*border-left\s*:/,
    'active variant must NOT redeclare full `border-left:` shorthand',
  );
  assert.doesNotMatch(
    activeBody,
    /padding-left\s*:/,
    'active variant must NOT redeclare `padding-left` (placeholder owns it)',
  );
});

/* =========================================================================
   T3 — dense-mode preserves the 9 px left-padding.
   ========================================================================= */

test('B-123 T3 (AC1 dense-mode): `.tj-dense .item-row` preserves `padding-left: 9px` so the base transparent-border stays compensated', () => {
  const css = readFile('sidepanel/sidepanel.css');

  const denseMatch = css.match(/\.tj-dense\s+\.item-row\s*\{([^}]*)\}/);
  assert.ok(denseMatch, '`.tj-dense .item-row` rule must exist');
  const denseBody = denseMatch[1];

  // Either 4-value padding ending in 9px, or explicit padding-left: 9px after.
  const padding9 =
    /padding:\s*\d+px\s+\d+px\s+\d+px\s+9px/.test(denseBody) ||
    /padding-left:\s*9px/.test(denseBody);
  assert.ok(
    padding9,
    '`.tj-dense .item-row` must end at `padding-left: 9px` so dense+live rows share content origin with dense+plain rows (pre-B-123 used `3px 12px` which broke this invariant)',
  );
});

/* =========================================================================
   T4 — drift bar regression guard (B-101 §48.3 absolute-positioned).
   ========================================================================= */

test('B-123 T4 (AC2 / B-101 regression guard): `.item-drift-bar` remains `position: absolute` so it does not perturb flex content origin', () => {
  const css = readFile('sidepanel/sidepanel.css');

  const driftMatch = css.match(/\.item-drift-bar\s*\{([^}]*)\}/);
  assert.ok(driftMatch, '`.item-drift-bar` rule must exist');
  const driftBody = driftMatch[1];

  assert.match(
    driftBody,
    /position:\s*absolute/,
    'drift bar must be `position: absolute` (out-of-flow — B-101 §48.3 D-1 invariant)',
  );
  // Also pin the `left: 3px` anchor so it sits to the right of the 3px
  // transparent base border-left without competing with it.
  assert.match(
    driftBody,
    /left:\s*3px/,
    'drift bar must anchor at `left: 3px` (border-box origin — sits to the right of the 3px placeholder border)',
  );
});

/* =========================================================================
   T5 — audible icon (RIGHT-side) regression guard for AC5 out-of-scope.
   ========================================================================= */

test('B-123 T5 (AC5 out-of-scope guard): `.item-audible-icon` is not modified by B-123 — no left-side / padding / border declarations introduced', () => {
  const css = readFile('sidepanel/sidepanel.css');

  const audibleMatch = css.match(/\.item-audible-icon\s*\{([^}]*)\}/);
  assert.ok(audibleMatch, '`.item-audible-icon` rule must exist');
  const audibleBody = audibleMatch[1];

  // The B-123 fix only touches the row-level placeholder + indicator overrides;
  // the audible icon (right-side flex child) must not gain border-left,
  // padding-left, or any positioning shift.
  assert.doesNotMatch(
    audibleBody,
    /border-left|padding-left|position:\s*absolute/,
    'audible icon rule must remain unchanged by B-123 (RIGHT-side, OUT OF SCOPE per AC5)',
  );
});

/* =========================================================================
   T6 — newtab + popup surface no-op verdict (R2-VERIFY 3 + 4).
   ========================================================================= */

test('B-123 T6 (AC4 surface coverage): newtab + popup have no left-side `border-left` indicator — R2-VERIFY no-op verdict pinned', () => {
  const newtabCss = readFile('newtab/newtab.css');
  const popupCss = readFile('popup/popup.css');

  // Newtab uses RIGHT-side `.newtab-indicator-dot` (background-color, no
  // border-left). Pin: no `.newtab-item-row` rule declares `border-left:`.
  // (CSS-comment occurrences and `border-bottom:` / `border:` in unrelated
  // rules are fine — we're guarding only against literal left-border-on-row.)
  const newtabRowLeftBorder = /\.newtab-item-row[^{]*\{[^}]*border-left\s*:/;
  assert.doesNotMatch(
    newtabCss,
    newtabRowLeftBorder,
    'newtab rows must not declare `border-left` — right-side dot indicators only (R2-VERIFY no-op)',
  );

  // Popup uses `.qs-favicon-overlay` (absolute-positioned dot at bottom-right
  // of the favicon). No left-side row border. Pin: no `.qs-item` /
  // `.qs-result-row` rule declares `border-left:`.
  const popupRowLeftBorder = /\.qs-(item|result-row|row)[^{]*\{[^}]*border-left\s*:/;
  assert.doesNotMatch(
    popupCss,
    popupRowLeftBorder,
    'popup rows must not declare `border-left` — favicon-overlay dots only (R2-VERIFY no-op)',
  );
});
