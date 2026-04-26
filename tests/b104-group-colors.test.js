/**
 * b104-group-colors.test.js — Sprint 34 / B-104 R5 (AC7)
 *
 * B-104 ships the themed group color system: 9 semantic palette slots
 * resolve to per-theme `--gc-<slot>` CSS custom properties (≥ 126 token
 * declarations across 14 themes + 2 legacy aliases + system-dark @media
 * override), plus a full-bleed `color-mix` tint on `.group-header` /
 * `.newtab-group-header` / `.gj-color-chip` so colored groups stand out
 * at-a-glance while remaining harmonious within each theme.
 *
 * Coverage map (≥ 8 tests per AC7):
 *
 *   T1 — AC2: shared/themes.css contains 9 `--gc-*` declarations for each
 *        of the 14 themes plus the 2 legacy aliases. Total ≥ 126. Ships
 *        with 153 (17 blocks × 9 slots, accounting for system-dark @media
 *        override per R3 handoff).
 *   T2 — AC3: sidepanel/sidepanel.css `.group-color-<slot>` rules use
 *        `var(--gc-<slot>)` (no hardcoded hex on swatch CSS).
 *   T3 — AC1: sidepanel/sidepanel.css `.group-header` rule contains the
 *        post-R3-fix tint formula (`color-mix(in srgb, var(--group-header-
 *        color, transparent) var(--group-header-tint-amount, 12%),
 *        var(--bg-secondary))`).
 *   T4 — AC1: newtab/newtab.css `.newtab-group-header` rule contains the
 *        analogous tint formula over `--bg-primary`.
 *   T5 — AC1 (popup): popup/group-jump-popup.css contains a `[data-color="
 *        <slot>"]` rule for each of the 9 slots. AND popup/group-jump-
 *        popup.js sets `chip.dataset.color` (NOT the deprecated raw-
 *        slot-name `style.setProperty('--gj-group-color', ...)` path that
 *        D-2 closed).
 *   T6 — R4 H-2 regression guard (Ungrouped no-tint): the synthetic
 *        `__ungrouped__` group object built by `renderTree` carries
 *        `color: null` (never `'slate'`); the inline-style injection
 *        guarded by `GROUP_COLORS.includes(group.color)` evaluates false
 *        for `null`, leaving the Ungrouped header untinted via the
 *        `transparent` fallback.
 *   T7 — R4 H-1 regression guard (solarized-light WCAG AA): shared/
 *        themes.css `[data-theme="solarized-light"]` block contains
 *        `--group-header-tint-amount: 0%;` so every non-zero tint is
 *        suppressed on this theme (the underlying baseline is 4.39:1 and
 *        any tint pushes it sub-AA).
 *   T8 — `GROUP_COLORS.includes(...)` allow-list guards: each of the
 *        three render surfaces (sidepanel.js, newtab.js, group-jump-
 *        popup.js) MUST gate the per-group color injection with
 *        `GROUP_COLORS.includes(...)` before touching `--group-header-
 *        color` / `dataset.color`.
 *   T9 — Defense-in-depth (security R4 LOW #5): popup/group-jump-popup.js
 *        imports `GROUP_COLORS` from `shared/constants.js` so the
 *        validation chain is explicit at the popup surface and the two
 *        sources of truth (CSS [data-color] selectors + JS allow-list)
 *        share the same canonical slot list.
 *
 * Strategy: most tests are static-file invariants — read the file and
 * grep / regex-match. T6 reproduces the synthetic-group object literal
 * shape (the production code is in `renderTree` at sidepanel.js:2080-2103
 * and is not exported). T8 / T9 are source-file `Grep` invariants.
 *
 * Mirrors `tests/b037-themes.test.js` for the static-file token-existence
 * pattern and `tests/b101-drift-bar.test.js` for the per-AC narration
 * style.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { GROUP_COLORS } from '../shared/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/* The 14-slug theme list (B-037 + B-098 anchor) plus the 2 legacy aliases
   that B-037 D-2 keeps for read-time migration. system-dark is an @media
   override nested inside the system block, not a top-level [data-theme]
   block, so the count is 14 + 2 = 16 top-level palette blocks. */
const ALL_THEME_SLUGS = [
  'system',
  'github-light', 'tomorrow', 'atom-one-light', 'solarized-light',
  'github-dark', 'tomorrow-night', 'atom-one-dark', 'solarized-dark',
  'dracula', 'nord', 'one-dark', 'monokai', 'tokyo-night',
];
const LEGACY_ALIASES = ['light', 'dark'];

/* =========================================================================
   T1 — AC2: 9 `--gc-*` declarations per theme block (14 themes + 2 legacy
   aliases + system-dark @media override = 17 blocks × 9 slots = 153 total).
   ========================================================================= */
test('B-104 T1 (AC2): shared/themes.css contains 9 `--gc-<slot>` declarations per theme block (≥ 126 total)', () => {
  const css = readFile('shared/themes.css');

  /* Per-slot count: each of the 9 GROUP_COLORS slots must appear ≥ 16 times
     (one per [data-theme] palette block; legacy `light` / `dark` aliases
     count too). The 17th occurrence comes from the system-dark @media
     override nested inside `[data-theme="system"]`. */
  for (const slot of GROUP_COLORS) {
    const re = new RegExp(`--gc-${slot}\\s*:`, 'g');
    const matches = css.match(re) || [];
    assert.ok(
      matches.length >= 16,
      `--gc-${slot} must be declared in ≥ 16 theme blocks (14 themes + 2 legacy aliases). Found ${matches.length}.`,
    );
  }

  /* Aggregate count: 9 slots × 16 blocks = 144 lower-bound; ships at 153. */
  const totalGcDecls = (css.match(/--gc-[a-z]+\s*:/g) || []).length;
  assert.ok(
    totalGcDecls >= 126,
    `Aggregate --gc-* declarations must be ≥ 126 (9 slots × 14 themes). Found ${totalGcDecls}.`,
  );
});

/* =========================================================================
   T2 — AC3: sidepanel/sidepanel.css `.group-color-<slot>` rules use
   `var(--gc-<slot>)` (no hardcoded hex on swatch CSS).
   ========================================================================= */
test('B-104 T2 (AC3): sidepanel.css `.group-color-<slot>` swatch rules consume `var(--gc-<slot>)` tokens (no hardcoded hex)', () => {
  const css = readFile('sidepanel/sidepanel.css');

  for (const slot of GROUP_COLORS) {
    const re = new RegExp(
      `\\.group-color-${slot}\\s*\\{[^}]*var\\(--gc-${slot}\\)[^}]*\\}`,
    );
    assert.match(
      css,
      re,
      `.group-color-${slot} swatch rule must reference var(--gc-${slot}) (theme-aware token, not hardcoded hex)`,
    );
  }

  /* Defense-in-depth: no 6-digit hex literal allowed inside any
     `.group-color-<slot>` rule body. */
  for (const slot of GROUP_COLORS) {
    const ruleRe = new RegExp(`\\.group-color-${slot}\\s*\\{([^}]*)\\}`);
    const match = css.match(ruleRe);
    assert.ok(match, `.group-color-${slot} rule must exist`);
    assert.doesNotMatch(
      match[1],
      /#[0-9a-fA-F]{3,6}\b/,
      `.group-color-${slot} rule body must not contain a hex literal — use var(--gc-${slot})`,
    );
  }
});

/* =========================================================================
   T3 — AC1: sidepanel/sidepanel.css `.group-header` rule contains the
   post-R3-fix tint formula. Verifies BOTH the base rule and the :hover
   rule use the per-theme `--group-header-tint-amount` variable (R4 H-1
   resolution).
   ========================================================================= */
test('B-104 T3 (AC1): sidepanel.css `.group-header` + `:hover` use the post-R3-fix `color-mix` tint with per-theme `--group-header-tint-amount`', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* Base rule uses --bg-secondary as the blend base. */
  assert.match(
    css,
    /\.group-header\s*\{[\s\S]*?background:\s*color-mix\(in\s+srgb,\s*var\(--group-header-color,\s*transparent\)\s*var\(--group-header-tint-amount,\s*12%\),\s*var\(--bg-secondary\)\)/,
    '.group-header base rule must use the post-R3-fix tint formula over --bg-secondary',
  );

  /* :hover rule uses --bg-hover as the blend base — D-5 deviation per
     R3 handoff (R4 MEDIUM #1 documented this and accepts it). */
  assert.match(
    css,
    /\.group-header:hover\s*\{[\s\S]*?background:\s*color-mix\(in\s+srgb,\s*var\(--group-header-color,\s*transparent\)\s*var\(--group-header-tint-amount,\s*12%\),\s*var\(--bg-hover\)\)/,
    '.group-header:hover rule must use the same per-theme tint variable so solarized-light 0% override applies on hover (R4 H-3 resolution)',
  );
});

/* =========================================================================
   T4 — AC1: newtab.css `.newtab-group-header` analogous tint rule.
   ========================================================================= */
test('B-104 T4 (AC1): newtab.css `.newtab-group-header` uses the analogous `color-mix` tint formula over `--bg-primary`', () => {
  const css = readFile('newtab/newtab.css');
  assert.match(
    css,
    /\.newtab-group-header\s*\{[\s\S]*?background:\s*color-mix\(in\s+srgb,\s*var\(--group-header-color,\s*transparent\)\s*var\(--group-header-tint-amount,\s*12%\),\s*var\(--bg-primary\)\)/,
    '.newtab-group-header must use the same tint formula as sidepanel, blended over --bg-primary instead of --bg-secondary (per R3 handoff)',
  );

  /* Hover parity (R4 MEDIUM #4 chose Option A — adds hover rule on newtab). */
  assert.match(
    css,
    /\.newtab-group-header:hover\s*\{[\s\S]*?background:\s*color-mix\(in\s+srgb,\s*var\(--group-header-color,\s*transparent\)\s*var\(--group-header-tint-amount,\s*12%\),\s*var\(--bg-hover\)\)/,
    '.newtab-group-header:hover must mirror sidepanel hover for cross-surface consistency (R4 MEDIUM #4)',
  );
});

/* =========================================================================
   T5 — Group-jump popup chip selectors (D-2 Option C).
     (a) popup/group-jump-popup.css has 9 `[data-color="<slot>"]` rules.
     (b) popup/group-jump-popup.js sets `chip.dataset.color` (NOT the
         deprecated `style.setProperty('--gj-group-color', ...)`).
   ========================================================================= */
test('B-104 T5 (AC1 popup, D-2 Option C): popup chip uses `[data-color="<slot>"]` selectors + `chip.dataset.color`', () => {
  const css = readFile('popup/group-jump-popup.css');
  for (const slot of GROUP_COLORS) {
    const re = new RegExp(
      `\\.gj-color-chip\\[data-color="${slot}"\\]\\s*\\{[^}]*var\\(--gc-${slot}\\)[^}]*\\}`,
    );
    assert.match(
      css,
      re,
      `popup CSS must contain .gj-color-chip[data-color="${slot}"] rule pointing at var(--gc-${slot})`,
    );
  }

  const js = readFile('popup/group-jump-popup.js');
  /* The JS replacement is `chip.dataset.color = pickerRow.color`. */
  assert.match(
    js,
    /chip\.dataset\.color\s*=/,
    'popup JS must set chip.dataset.color (D-2 Option C declarative selector)',
  );
  /* Regression guard — the deprecated raw-slot-name path that fell through
     to --color-avatar-bg for slate/teal/indigo MUST be gone. */
  assert.doesNotMatch(
    js,
    /style\.setProperty\(\s*['"]--gj-group-color['"]/,
    'popup JS must NOT set --gj-group-color via raw slot-name string (closed latent bug per D-2)',
  );
});

/* =========================================================================
   T6 — R4 H-2 regression guard (Ungrouped no-tint).
   ========================================================================= */
test('B-104 T6 (R4 H-2 regression): synthetic __ungrouped__ group has `color: null` and the inline-style guard skips it', () => {
  const sidepanelSrc = readFile('sidepanel/sidepanel.js');

  /* Source-invariant grep: confirm the post-R3-fix object literal shape.
     Production code at sidepanel.js:2093-2098 is:
        const syntheticGroup = {
          id: '__ungrouped__',
          name: 'Ungrouped',
          color: null,
          collapsed: collapsedGroups.has('__ungrouped__'),
        };
  */
  assert.match(
    sidepanelSrc,
    /const\s+syntheticGroup\s*=\s*\{[^}]*id:\s*['"]__ungrouped__['"][^}]*color:\s*null/,
    'synthetic Ungrouped group must declare `color: null` (NOT `color: "slate"` per R4 H-2)',
  );

  /* The pre-fix slate hardcode must be GONE from the synthetic group. */
  assert.doesNotMatch(
    sidepanelSrc,
    /id:\s*['"]__ungrouped__['"][^}]*color:\s*['"]slate['"]/,
    'synthetic Ungrouped group must NOT carry color: "slate" (closed latent slate-tint leak per R4 H-2)',
  );

  /* Behavioral simulation: GROUP_COLORS.includes(null) === false → the
     real production guard at sidepanel.js:2194 will skip both
     classList.add('group-color-null') and the `--group-header-color`
     setProperty injection. */
  assert.equal(
    GROUP_COLORS.includes(null),
    false,
    'GROUP_COLORS.includes(null) must be false so the inline-style guard skips Ungrouped',
  );
  assert.equal(
    GROUP_COLORS.includes(undefined),
    false,
    'guard must also reject undefined for the same reason',
  );
});

/* =========================================================================
   T7 — R4 H-1 regression guard (solarized-light WCAG AA).
   ========================================================================= */
test('B-104 T7 (R4 H-1 regression): shared/themes.css [data-theme="solarized-light"] block declares `--group-header-tint-amount: 0%`', () => {
  const css = readFile('shared/themes.css');

  /* Locate the `[data-theme="solarized-light"] { ... }` block body and
     confirm it contains the override. We use a non-greedy match between
     the opening brace and the next closing-brace-at-line-start so the
     match is bounded to the block body. */
  const blockMatch = css.match(/\[data-theme="solarized-light"\]\s*\{([\s\S]*?)^\}/m);
  assert.ok(
    blockMatch,
    '[data-theme="solarized-light"] block must exist and be parseable',
  );
  const blockBody = blockMatch[1];

  assert.match(
    blockBody,
    /--group-header-tint-amount:\s*0%/,
    'solarized-light must declare --group-header-tint-amount: 0% (R4 H-1 baseline-contrast escape hatch)',
  );

  /* Defense: confirm no other top-level [data-theme] block claims a 0%
     tint amount — solarized-light is the only intended escape hatch in
     R3-fix. (atom-one-dark / future themes may opt in later; the test
     pins the current ship state to catch unintended regressions.) */
  const allTintAmountDecls = (css.match(/--group-header-tint-amount:\s*0%/g) || []).length;
  assert.equal(
    allTintAmountDecls,
    1,
    'exactly one --group-header-tint-amount: 0% declaration ships (solarized-light only)',
  );
});

/* =========================================================================
   T8 — `GROUP_COLORS.includes(...)` allow-list guards across all 3 surfaces.
   ========================================================================= */
test('B-104 T8 (allow-list guards): sidepanel.js, newtab.js, popup/group-jump-popup.js each gate per-group color injection on `GROUP_COLORS.includes(...)`', () => {
  for (const path of [
    'sidepanel/sidepanel.js',
    'newtab/newtab.js',
    'popup/group-jump-popup.js',
  ]) {
    const src = readFile(path);
    assert.match(
      src,
      /GROUP_COLORS\.includes\s*\(/,
      `${path} must contain at least one GROUP_COLORS.includes(...) guard before injecting/setting the per-group color custom property`,
    );
  }

  /* Spot-check: the sidepanel.js guard appears before the
     setProperty('--group-header-color', ...) call. */
  const sidepanelSrc = readFile('sidepanel/sidepanel.js');
  const guardIdx = sidepanelSrc.indexOf('GROUP_COLORS.includes(group.color)');
  const setPropIdx = sidepanelSrc.indexOf("setProperty('--group-header-color'");
  assert.ok(guardIdx >= 0, 'sidepanel.js must reference GROUP_COLORS.includes(group.color)');
  assert.ok(setPropIdx >= 0, "sidepanel.js must call setProperty('--group-header-color', ...)");
  assert.ok(
    guardIdx < setPropIdx,
    'sidepanel.js must place the GROUP_COLORS.includes guard BEFORE the --group-header-color injection',
  );

  /* Same ordering check for newtab.js. */
  const newtabSrc = readFile('newtab/newtab.js');
  const newtabGuardIdx = newtabSrc.indexOf('GROUP_COLORS.includes(group.color)');
  const newtabSetPropIdx = newtabSrc.indexOf("setProperty('--group-header-color'");
  assert.ok(newtabGuardIdx >= 0, 'newtab.js must reference GROUP_COLORS.includes(group.color)');
  assert.ok(newtabSetPropIdx >= 0, "newtab.js must call setProperty('--group-header-color', ...)");
  assert.ok(
    newtabGuardIdx < newtabSetPropIdx,
    'newtab.js must place the GROUP_COLORS.includes guard BEFORE the --group-header-color injection',
  );
});

/* =========================================================================
   T9 — Defense-in-depth (security R4 LOW #5): popup/group-jump-popup.js
   imports GROUP_COLORS from shared/constants.js so the allow-list and
   the per-slot CSS selector list share the same canonical slot source.
   ========================================================================= */
test('B-104 T9 (security defense-in-depth, R4 LOW #5): popup/group-jump-popup.js imports GROUP_COLORS from shared/constants.js', () => {
  const src = readFile('popup/group-jump-popup.js');
  assert.match(
    src,
    /import\s*\{[^}]*GROUP_COLORS[^}]*\}\s*from\s*['"]\.\.\/shared\/constants\.js['"]/,
    'group-jump-popup.js must import GROUP_COLORS from ../shared/constants.js so JS allow-list + CSS [data-color] selectors stay in lockstep',
  );
});
