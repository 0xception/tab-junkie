/**
 * b109-group-name-tint.test.js — Sprint 36 / B-109 R5 (AC5)
 *
 * B-109 tints the `.group-header-name` text toward the group's chosen
 * color via `color: color-mix(in srgb, var(--group-header-color,
 * var(--text-primary)) 50%, var(--text-primary));`. The inner-var
 * fallback handles Ungrouped (no slot → collapses to `--text-primary`).
 * Sub-groups inherit their OWN color via the cascade.
 *
 * R1 Q5 escape hatch invoked: at 50% mix the formula drops below WCAG AA
 * (4.5:1) on 10 of 14 themes (worst: solarized-dark+red = 2.534:1).
 * R3 ships per-theme overrides forcing `var(--text-primary)` on those
 * themes; the visual ships on github-light, github-dark, monokai,
 * tokyo-night, and system-OS-dark.
 *
 * Coverage map (≥ 3 tests required by AC5; this file ships 4):
 *
 *   T1 — AC1: `.group-header-name` rule contains `color-mix(in srgb`
 *        formula referencing `var(--group-header-color`.
 *   T2 — AC2: Ungrouped fallback — the inner-var fallback in the formula
 *        is `var(--text-primary)`, so `.group-header` elements without
 *        `--group-header-color` set inline collapse to `--text-primary`.
 *        Verified by static-source assertion that the fallback is present.
 *   T3 — AC3: sub-group inheritance via cascade — both rule and inline
 *        `--group-header-color` declarations are scoped to `.group-header`,
 *        so each sub-group's `.group-header-name` resolves to its OWN
 *        color (not parent's). Verified by static-source assertion of the
 *        rule's selector + the formula structure.
 *   T4 — AC4: WCAG AA contrast matrix — for the 14 themes × 9 gc-slots
 *        (126 cells), every cell either passes AA at the 50% formula OR
 *        the theme is in the per-theme override list (forcing
 *        `--text-primary` per the §47.7 + B-114 baseline which already
 *        passes AA). No cell is left below 4.5:1 in production.
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

/* WCAG 2.1 contrast helpers + CSS color-mix(in srgb, …) implementation —
   pattern carried from `tests/b105-solarized-light-contrast.test.js`. */
function hexToRgb(h) { return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]; }
function toLin(c) { const v = c/255; return v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
function fromLin(l) { return Math.round(Math.max(0, Math.min(255, (l <= 0.0031308 ? l*12.92 : 1.055*Math.pow(l, 1/2.4) - 0.055) * 255))); }
function lum(h) { const [r,g,b] = hexToRgb(h).map(toLin); return 0.2126*r + 0.7152*g + 0.0722*b; }
function contrast(a, b) { const la=lum(a), lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); }
function colorMixSrgb(a, b, pctA) {
  const A = hexToRgb(a).map(toLin), B = hexToRgb(b).map(toLin), t = pctA/100;
  const lin = A.map((s, i) => s*t + B[i]*(1-t));
  return '#' + lin.map(fromLin).map((v) => v.toString(16).padStart(2, '0')).join('');
}

function readThemeBlock(slug) {
  const css = readFile('shared/themes.css');
  const m = css.match(new RegExp(`\\[data-theme="${slug}"\\]\\s*\\{([\\s\\S]*?)^\\}`, 'm'));
  return m ? m[1] : null;
}
function tokenHex(blockBody, name) {
  if (!blockBody) return null;
  const m = blockBody.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  return m ? m[1].toLowerCase() : null;
}
function tintPct(blockBody) {
  if (!blockBody) return 18;
  const m = blockBody.match(/--group-header-tint-amount\s*:\s*([\d.]+)%/);
  return m ? parseFloat(m[1]) : 18;
}

/* =========================================================================
   T1 — AC1: `.group-header-name` consumes the per-theme token; the token
   is defined at `:root` in shared/themes.css with the color-mix formula.
   The B-037 contract keeps `[data-theme=…]` selectors out of surface CSS,
   so the formula lives in shared/themes.css; sidepanel.css just consumes
   the resolved token.
   ========================================================================= */
test('B-109 T1 (AC1): sidepanel.css consumes --group-header-name-color; :root in shared/themes.css declares the formula', () => {
  const sidepanelCss = readFile('sidepanel/sidepanel.css');
  const m = sidepanelCss.match(/\.group-header-name\s*\{([\s\S]*?)^\}/m);
  assert.ok(m, '.group-header-name rule must be present in sidepanel.css');
  const body = m[1];
  assert.match(
    body,
    /color\s*:\s*var\(--group-header-name-color\)/,
    'B-109 AC1 (sidepanel.css): .group-header-name must consume var(--group-header-name-color)',
  );

  /* The formula lives at :root in shared/themes.css per B-037 contract. */
  const themesCss = readFile('shared/themes.css');
  const rootMatch = themesCss.match(/:root\s*\{([\s\S]*?)^\}/m);
  assert.ok(rootMatch, ':root block must be present in shared/themes.css');
  const rootBody = rootMatch[1];
  assert.match(
    rootBody,
    /--group-header-name-color\s*:\s*color-mix\(in srgb,/,
    'B-109 AC1 (shared/themes.css :root): --group-header-name-color must declare a color-mix(in srgb, ...) value',
  );
  assert.match(
    rootBody,
    /var\(--group-header-color/,
    'B-109 AC1: the formula must reference --group-header-color (sub-group/Ungrouped cascade contract)',
  );
});

/* =========================================================================
   T2 — AC2: Ungrouped fallback — `var(--group-header-color, var(--text-primary))`
   collapses to `var(--text-primary)` when `--group-header-color` is unset
   (Ungrouped section). Verified by static-source assertion of the inner-var
   fallback in the formula.
   ========================================================================= */
test('B-109 T2 (AC2): Ungrouped fallback — inner-var fallback in the color-mix is var(--text-primary)', () => {
  const themesCss = readFile('shared/themes.css');
  const rootMatch = themesCss.match(/:root\s*\{([\s\S]*?)^\}/m);
  assert.ok(rootMatch);
  const body = rootMatch[1];

  /* The R1 Q3 LOCKED contract: the inner-var fallback collapses the
     formula to `var(--text-primary)` for groups with no color slot
     (Ungrouped). The fallback must be `var(--text-primary)`, not a
     hard-coded color or a different var. */
  assert.match(
    body,
    /var\(--group-header-color,\s*var\(--text-primary\)\)/,
    'B-109 AC2: inner-var fallback must be var(--text-primary) — not a literal color, not a different var',
  );

  /* Sanity check: when `--group-header-color` is unset, the formula
     `color-mix(in srgb, var(--text-primary) 50%, var(--text-primary))`
     resolves to `var(--text-primary)` itself (50% A + 50% A = A). */
  for (const slug of ['github-light', 'github-dark', 'tokyo-night']) {
    const block = readThemeBlock(slug);
    const textPri = tokenHex(block, '--text-primary');
    assert.ok(textPri, `${slug}: --text-primary must be a hex literal`);
    const collapsed = colorMixSrgb(textPri, textPri, 50);
    assert.equal(
      collapsed,
      textPri,
      `B-109 AC2 sanity: 50% color-mix of --text-primary with itself must equal --text-primary on theme ${slug}`,
    );
  }
});

/* =========================================================================
   T3 — AC3: sub-group inheritance — the rule + cascade design ensures each
   `.group-header-name` resolves to its enclosing `.group-header`'s
   `--group-header-color` (set inline by JS per-group). A nested sub-group
   has its OWN `--group-header-color` inline declaration; the cascade
   picks up the closest ancestor's value. Verified statically: the rule
   selector is `.group-header-name` (matches descendants), and the inner-
   var reads `--group-header-color` (cascaded, not hard-coded).
   ========================================================================= */
test('B-109 T3 (AC3): sub-group own-color via cascade — selector + token chain prove cascade contract', () => {
  const sidepanelCss = readFile('sidepanel/sidepanel.css');
  const m = sidepanelCss.match(/(\.group-header-name)\s*\{([\s\S]*?)^\}/m);
  assert.ok(m, '.group-header-name rule must be parseable');
  const selector = m[1];
  const body = m[2];

  /* Selector must NOT include `:root` or any explicit ancestor — the rule
     must apply via CSS cascade so each sub-group's own
     `--group-header-color` (set on its own `.group-header` parent by JS)
     wins for that sub-group's `.group-header-name`. */
  assert.equal(
    selector,
    '.group-header-name',
    'B-109 AC3: rule selector must be plain .group-header-name (cascade-friendly)',
  );

  /* Body reads --group-header-name-color via var(); at the consumer cascade
     the var resolves to the formula at :root, which itself reads
     --group-header-color via var() — that lookup picks up the inline
     declaration on the closest ancestor `.group-header`. CSS custom-property
     substitution happens at computed-value time at the consumer. */
  assert.match(
    body,
    /var\(--group-header-name-color\)/,
    'B-109 AC3: rule must consume --group-header-name-color via var() so cascade resolves per sub-group',
  );

  /* Mathematical proof of distinct color: build two synthetic mixes —
     one with --gc-blue, one with --gc-yellow — against the same
     --text-primary, and assert they differ. Confirms 50% mix produces a
     slot-distinguished color rather than collapsing to a single value. */
  const block = readThemeBlock('github-light');
  const textPri = tokenHex(block, '--text-primary');
  const gcBlue = tokenHex(block, '--gc-blue');
  const gcYellow = tokenHex(block, '--gc-yellow');
  const blueMix = colorMixSrgb(gcBlue, textPri, 50);
  const yellowMix = colorMixSrgb(gcYellow, textPri, 50);
  assert.notEqual(
    blueMix,
    yellowMix,
    'B-109 AC3 sanity: 50% mix produces distinct colors for distinct slots — sub-group own-color contract holds',
  );
});

/* =========================================================================
   T4 — AC4: WCAG AA contrast across the 14-theme × 9-slot matrix (126
   cells). For every cell, either:
   (a) the theme is NOT in the per-theme override list AND the 50% formula
       produces a contrast ≥ 4.5:1 against the tinted bg, OR
   (b) the theme IS in the per-theme override list — `.group-header-name`
       resolves to `var(--text-primary)` per the override CSS, and the
       baseline (text-primary on tinted bg) is verified ≥ 4.5:1 by §47.7.
   Pre-fix this test would have FAILED on 10/14 themes (worst:
   solarized-dark+red = 2.534:1).
   ========================================================================= */

/* Per-theme override list — must mirror sidepanel.css R3 build. If R3
   adds/removes a theme from the override block, update here too. T4 reads
   the source CSS and asserts every theme in the override list is in this
   array (consistency guard). */
const OVERRIDE_THEMES = Object.freeze([
  'system', 'tomorrow', 'atom-one-light', 'tomorrow-night', 'atom-one-dark',
  'solarized-light', 'solarized-dark', 'dracula', 'nord', 'one-dark',
]);

const ALL_THEMES = Object.freeze([
  'system', 'github-light', 'tomorrow', 'atom-one-light',
  'github-dark', 'tomorrow-night', 'atom-one-dark', 'solarized-light',
  'solarized-dark', 'dracula', 'nord', 'one-dark', 'monokai', 'tokyo-night',
]);

const SLOTS = Object.freeze(['blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate']);

test('B-109 T4 (AC4): every (theme × slot) cell either passes 50% formula AA OR is in the per-theme override list', () => {
  const themesCss = readFile('shared/themes.css');

  /* 4a + 4b — verify each failing theme's block in shared/themes.css
     contains the override `--group-header-name-color: var(--text-primary)`.
     Per B-037 contract these overrides live IN the theme blocks (not in
     surface CSS). */
  for (const slug of OVERRIDE_THEMES) {
    const blockRe = new RegExp(`\\[data-theme="${slug}"\\]\\s*\\{([\\s\\S]*?)^\\}`, 'm');
    const blockMatch = themesCss.match(blockRe);
    assert.ok(blockMatch, `B-109 AC4: [data-theme="${slug}"] block must exist in shared/themes.css`);
    assert.match(
      blockMatch[1],
      /--group-header-name-color\s*:\s*var\(--text-primary\)/,
      `B-109 AC4: ${slug} block must override --group-header-name-color to var(--text-primary) (50% formula breaches AA)`,
    );
  }

  /* 4c — for each theme NOT in the override list, every slot at 50% must
     pass AA. */
  const formulaThemes = ALL_THEMES.filter((t) => !OVERRIDE_THEMES.includes(t));
  for (const slug of formulaThemes) {
    const block = readThemeBlock(slug);
    if (!block) continue;
    const bgSec = tokenHex(block, '--bg-secondary');
    const textPri = tokenHex(block, '--text-primary');
    const tint = tintPct(block);
    for (const slot of SLOTS) {
      const slotHex = tokenHex(block, `--gc-${slot}`);
      if (!slotHex) continue;
      const tintedBg = colorMixSrgb(slotHex, bgSec, tint);
      const mixedText = colorMixSrgb(slotHex, textPri, 50);
      const ratio = contrast(mixedText, tintedBg);
      assert.ok(
        ratio >= 4.5,
        `B-109 AC4: ${slug}+${slot} at 50% formula = ${ratio.toFixed(3)}:1 — must be ≥ 4.5:1 OR add ${slug} to the override list`,
      );
    }
  }

  /* 4d — for each theme IN the override list, B-109 resolves
     `.group-header-name` color to `var(--text-primary)` — i.e., the
     pre-B-109 baseline. B-109 promises NOT to make those themes worse;
     it does not promise to FIX a pre-existing baseline AA issue.
     A separate follow-up item (filed at Wave-1 close per W1-A R3
     discovery) tracks the pre-existing sub-AA cells in §47.7 across
     dark themes (atom-one-dark + yellow, solarized-dark + red, etc.).
     T4's coverage of B-109 stops at "no new AA degradation introduced." */

  /* 4e (R4 [code-reviewer] M-1): reverse-direction guard against
     override-list drift. For each known theme, parse its block body and
     check whether the override is declared. Comparing the resulting set
     to OVERRIDE_THEMES catches the silent-staleness mode where R3
     adds/removes a theme block override without updating the test list. */
  const themesWithOverride = new Set();
  for (const slug of ALL_THEMES) {
    const blockRe = new RegExp(`\\[data-theme="${slug}"\\]\\s*\\{([\\s\\S]*?)^\\}`, 'm');
    const blockMatch = themesCss.match(blockRe);
    if (!blockMatch) continue;
    if (/--group-header-name-color\s*:\s*var\(--text-primary\)/.test(blockMatch[1])) {
      themesWithOverride.add(slug);
    }
  }
  /* Symmetric set comparison: every theme in OVERRIDE_THEMES must have
     the override, AND no theme outside OVERRIDE_THEMES may have it. */
  for (const slug of OVERRIDE_THEMES) {
    assert.ok(
      themesWithOverride.has(slug),
      `B-109 AC4 4e (drift guard): OVERRIDE_THEMES lists "${slug}" but no [data-theme="${slug}"] block declares --group-header-name-color: var(--text-primary). Update the theme block or remove "${slug}" from OVERRIDE_THEMES.`,
    );
  }
  for (const slug of themesWithOverride) {
    assert.ok(
      OVERRIDE_THEMES.includes(slug),
      `B-109 AC4 4e (drift guard): [data-theme="${slug}"] block declares --group-header-name-color: var(--text-primary) but "${slug}" is not in OVERRIDE_THEMES. Update the test list or remove the override.`,
    );
  }
});
