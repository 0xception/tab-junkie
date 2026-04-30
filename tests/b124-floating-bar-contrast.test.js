/**
 * b124-floating-bar-contrast.test.js — Sprint 39 / B-124 R5 (R4 fix-round)
 *
 * Encodes the R2 §61.6 WCAG matrix as test assertions. R2 pre-computed
 * Dimension 1 (dotted-bar `--floating-bar-color` vs `--bg-primary`, UI
 * threshold ≥ 3:1) at §61.6.1: 16 PASS / 1 FAIL (solarized-light is the
 * documented `ACCEPTED_LIMITATIONS` carve-out — pre-existing, mirrors
 * the saved-bookmark solid live-bar gap). Dimension 2 (Save-CTA hover —
 * `--text-primary` over `--bg-hover`, text threshold ≥ 4.5:1) was an
 * R3-COMPUTE marker; R3 styling picked the row-action-button precedent
 * (`color: var(--text-primary)` on `:hover { background: var(--bg-hover) }`)
 * — encoded here for every theme.
 *
 * Strategy mirrors `tests/b105-solarized-light-contrast.test.js` for the
 * pure-JS WCAG helpers and `tests/b117-gc-matrix-audit.test.js` for the
 * theme-block extraction + ACCEPTED_LIMITATIONS shape (R2 C-7 allow-list
 * direction). Each cell becomes its own `test()` so a single regression
 * fails one assertion, not the whole bundle.
 *
 * Coverage map:
 *   - 16 cells × Dimension 1 (14 canonical themes + system-dark @media
 *     branch + dark-OS) computed against `--bg-primary` ≥ 3:1.
 *     solarized-light is allow-listed at minExpectedRatio = 2.9 (pinned
 *     by R2 §61.6.1 footnote at 2.970:1).
 *   - 14 cells × Dimension 2 (canonical themes only — `--bg-hover` is the
 *     hover surface for the row-action-button precedent) computed against
 *     `--text-primary` ≥ 4.5:1.
 *   - Stale-allow-list guard for solarized-light Dimension 1 (force
 *     removal if the cell ever clears 3:1).
 *   - ACCEPTED_LIMITATIONS shape guard (typo / drift detection).
 *   - :root token resolution sanity (`--floating-bar-color` aliases
 *     `--live-indicator` per §61.2.1).
 *
 * See docs/design/61-b-124-floating-visual.md §61.6 for the full matrix.
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
   WCAG 2.1 contrast helpers — pure math, no DOM. Mirrors the formulas in
   tests/b105-solarized-light-contrast.test.js:84–127.
   ========================================================================= */

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toLinear(c8) {
  const v = c8 / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(hexA, hexB) {
  const la = luminance(hexA);
  const lb = luminance(hexB);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* =========================================================================
   Theme-block extractors. Mirrors tests/b117-gc-matrix-audit.test.js so a
   future palette tweak that breaks WCAG fails this test, not a UAT pass.
   ========================================================================= */

function readThemeBlock(themeAttr) {
  const css = readFile('shared/themes.css');
  const re = new RegExp(
    `\\[data-theme="${themeAttr}"\\]\\s*\\{([\\s\\S]*?)^\\}`,
    'm',
  );
  const m = css.match(re);
  assert.ok(m, `[data-theme="${themeAttr}"] block must exist and be parseable`);
  return m[1];
}

function readSystemDarkBlock() {
  const css = readFile('shared/themes.css');
  /* @media (prefers-color-scheme: dark) { [data-theme="system"] { ... } } */
  const re = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*\[data-theme="system"\]\s*\{([\s\S]*?)\n\s\s\}\s*\n\}/;
  const m = css.match(re);
  assert.ok(m, '@media dark [data-theme="system"] block must exist and be parseable');
  return m[1];
}

function readTokenHex(blockBody, tokenName) {
  const re = new RegExp(`${tokenName}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const m = blockBody.match(re);
  assert.ok(m, `block must declare ${tokenName} as a 6-digit hex (got: ${blockBody.slice(0, 60)}…)`);
  return m[1].toLowerCase();
}

/* =========================================================================
   Theme enumeration. The `system` slug carries TWO blocks: a top-level
   light-OS block (canonical row in the matrix) and a `@media dark` branch
   (separate informational row). Per §61.6.1 the matrix contains 14
   canonical themes + 2 legacy aliases (light, dark) + the system-dark
   branch. Aliases are excluded from the iterator below — they are tested
   for token-equivalence by the existing b117 guard, so we don't double-
   pin them here.
   ========================================================================= */

const THEMES = [
  /* Light themes (5) */
  { slug: 'system', label: 'system (light)', readBlock: () => readThemeBlock('system') },
  { slug: 'github-light', label: 'github-light', readBlock: () => readThemeBlock('github-light') },
  { slug: 'tomorrow', label: 'tomorrow', readBlock: () => readThemeBlock('tomorrow') },
  { slug: 'atom-one-light', label: 'atom-one-light', readBlock: () => readThemeBlock('atom-one-light') },
  { slug: 'solarized-light', label: 'solarized-light', readBlock: () => readThemeBlock('solarized-light') },
  /* Dark themes (9) */
  { slug: 'github-dark', label: 'github-dark', readBlock: () => readThemeBlock('github-dark') },
  { slug: 'tomorrow-night', label: 'tomorrow-night', readBlock: () => readThemeBlock('tomorrow-night') },
  { slug: 'atom-one-dark', label: 'atom-one-dark', readBlock: () => readThemeBlock('atom-one-dark') },
  { slug: 'solarized-dark', label: 'solarized-dark', readBlock: () => readThemeBlock('solarized-dark') },
  { slug: 'dracula', label: 'dracula', readBlock: () => readThemeBlock('dracula') },
  { slug: 'nord', label: 'nord', readBlock: () => readThemeBlock('nord') },
  { slug: 'one-dark', label: 'one-dark', readBlock: () => readThemeBlock('one-dark') },
  { slug: 'monokai', label: 'monokai', readBlock: () => readThemeBlock('monokai') },
  { slug: 'tokyo-night', label: 'tokyo-night', readBlock: () => readThemeBlock('tokyo-night') },
];

/* The system-dark @media branch is an informational row (not in the
   14-canonical enumeration). Treated separately so a single per-theme
   palette change doesn't cascade into 30 failing assertions. */
const SYSTEM_DARK_LABEL = 'system (dark @media branch)';

/* =========================================================================
   ACCEPTED_LIMITATIONS — R2 §61.6.1 + §61.6.3 (R2 C-7 allow-list direction).

   Dimension 1 (dotted-bar):
     - `solarized-light` at 2.970:1 vs `--bg-primary #fdf6e3` is the only
       sub-AA cell. Fix path (bump `--live-indicator` on solarized-light)
       is out of B-124 scope (touches B-010 token); the user-manual
       "Theme accessibility limitations" subsection documents this.
       minExpectedRatio = 2.9 mirrors B-117 §57.5.1 — gives ~0.07 headroom
       against accidental further darkening but stays below the 3:1 floor
       so the stale-allow-list guard still fires if a future palette tweak
       somehow clears AA.

   Dimension 2 (CTA hover, `--text-primary` over `--bg-hover` ≥ 4.5:1):
     - `solarized-light` at 4.170:1 — PRE-EXISTING. Documented in
       tests/b105-solarized-light-contrast.test.js T4 docstring as
       "`--bg-hover` (S3) measures 4.170:1 — sub-AA — but is documented as
       PRE-EXISTING (not introduced by B-105)". The Save CTA inherits this
       gap; same posture as every other row-action button on this theme.
     - `solarized-dark` at 3.281:1 — PRE-EXISTING. The canonical Solarized
       base text/bg pair is itself 4.111:1 sub-AA per b117 helper sanity
       (tests/b117-gc-matrix-audit.test.js:239); --bg-hover #0d4655 is a
       darker hover surface that further reduces contrast. Same accept-as-
       limitation rationale as the B-117 §57.3.2 9-slot solarized-dark
       allow-list. Fix path requires modifying canonical Solarized tokens
       — out of B-124 scope.

   Both D2 entries inherit the same posture as the existing row-action
   buttons (.icon-action-trash / .icon-action-close / etc.) which use the
   identical hover-state pair on these themes. B-124 does not regress —
   it inherits the documented gap.
   ========================================================================= */

const ACCEPTED_LIMITATIONS = [
  /* Dimension 1 — dotted-bar (UI 3:1 floor). */
  {
    theme: 'solarized-light',
    dimension: 'floating-bar',
    minExpectedRatio: 2.9,
  },
  /* Dimension 2 — CTA hover (text 4.5:1 floor). */
  {
    theme: 'solarized-light',
    dimension: 'cta-hover',
    minExpectedRatio: 4.1,
  },
  {
    theme: 'solarized-dark',
    dimension: 'cta-hover',
    minExpectedRatio: 3.2,
  },
];

function findAllowEntry(theme, dimension) {
  return ACCEPTED_LIMITATIONS.find((e) => e.theme === theme && e.dimension === dimension);
}

/* =========================================================================
   Helper sanity tests — pin the math against R2 §61.6.1 reference cells so
   a regression in the helpers themselves (not the palette) surfaces here.
   ========================================================================= */

test('B-124 contrast helper sanity: contrast(#000, #fff) ≈ 21:1 (WCAG max)', () => {
  const r = contrast('#000000', '#ffffff');
  assert.ok(r > 20.99 && r < 21.01, `expected ≈ 21:1, got ${r}`);
});

test('B-124 contrast helper sanity: solarized-light live-indicator vs bg-primary ≈ 2.970:1 (R2 §61.6.1)', () => {
  /* Anchors the rationale for the ACCEPTED_LIMITATIONS allow-list against
     the canonical Solarized palette. If this assertion ever fails, either
     the palette was modified or the helpers regressed. */
  const r = contrast('#859900', '#fdf6e3');
  assert.ok(r > 2.96 && r < 2.98, `solarized-light expected ≈ 2.970:1, got ${r.toFixed(4)}`);
  assert.ok(r < 3.0, 'solarized-light pair must remain sub-3:1 — this is the documented limitation');
});

/* =========================================================================
   :root token resolution sanity — `--floating-bar-color` MUST alias
   `--live-indicator` per R2 §61.2.1, otherwise the 16-cell Dimension 1
   matrix below is testing the wrong token.
   ========================================================================= */

test('B-124 :root --floating-bar-color resolves to var(--live-indicator) (§61.2.1)', () => {
  const css = readFile('shared/themes.css');
  const rootMatch = css.match(/(^|\n):root\s*\{([\s\S]*?)\n\}/);
  assert.ok(rootMatch, ':root block must exist in shared/themes.css');
  assert.match(
    rootMatch[2],
    /--floating-bar-color:\s*var\(--live-indicator\)/,
    ':root must declare `--floating-bar-color: var(--live-indicator)` so the per-theme value cascades automatically',
  );
});

/* =========================================================================
   Dimension 1 — dotted-bar contrast: `--live-indicator` vs `--bg-primary`
   ≥ 3:1 (WCAG AA UI-component threshold per SC 1.4.11). 14 canonical
   themes + 1 informational row (system-dark @media branch).

   Per §61.6.1 the FLOATING bar inherits exactly the same `--live-indicator`
   value the saved-bookmark solid live-bar already paints with — testing
   `--live-indicator` here is equivalent to testing
   `--floating-bar-color` (the alias resolution is pinned above).
   ========================================================================= */

for (const theme of THEMES) {
  const block = theme.readBlock();
  const liveIndicator = readTokenHex(block, '--live-indicator');
  const bgPrimary = readTokenHex(block, '--bg-primary');
  const ratio = contrast(liveIndicator, bgPrimary);
  const allow = findAllowEntry(theme.slug, 'floating-bar');

  if (allow) {
    test(`B-124 D1 [accepted limitation] ${theme.label} dotted-bar ratio ${ratio.toFixed(3)} ≥ floor ${allow.minExpectedRatio}`, () => {
      assert.ok(
        ratio >= allow.minExpectedRatio,
        `${theme.label} dotted-bar contrast ${ratio.toFixed(3)} regressed below accept-as-limitation floor ${allow.minExpectedRatio} (S35 B-105 monotonic-decrease guard). Token darkening on --live-indicator or --bg-primary is the likely cause.`,
      );
      assert.ok(
        ratio < 3.0,
        `${theme.label} dotted-bar contrast ${ratio.toFixed(3)} now CLEARS WCAG AA UI 3:1 — remove from ACCEPTED_LIMITATIONS in tests/b124-floating-bar-contrast.test.js and update docs/user-manual/themes.md "Theme accessibility limitations" subsection (stale-allow-list guard).`,
      );
    });
  } else {
    test(`B-124 D1 ${theme.label} dotted-bar ≥ WCAG AA 3:1 (computed ${ratio.toFixed(3)})`, () => {
      assert.ok(
        ratio >= 3.0,
        `${theme.label} --floating-bar-color (${liveIndicator}) vs --bg-primary (${bgPrimary}) contrast ${ratio.toFixed(3)} below WCAG AA UI 3:1 — fix via per-theme --floating-bar-color override or add a documented entry to ACCEPTED_LIMITATIONS with rationale.`,
      );
    });
  }
}

/* system-dark @media branch — informational row. */
{
  const block = readSystemDarkBlock();
  const liveIndicator = readTokenHex(block, '--live-indicator');
  const bgPrimary = readTokenHex(block, '--bg-primary');
  const ratio = contrast(liveIndicator, bgPrimary);
  test(`B-124 D1 ${SYSTEM_DARK_LABEL} dotted-bar ≥ WCAG AA 3:1 (computed ${ratio.toFixed(3)})`, () => {
    assert.ok(
      ratio >= 3.0,
      `${SYSTEM_DARK_LABEL} --floating-bar-color (${liveIndicator}) vs --bg-primary (${bgPrimary}) contrast ${ratio.toFixed(3)} below WCAG AA UI 3:1.`,
    );
  });
}

/* =========================================================================
   Dimension 2 — Save-CTA hover contrast: `--text-primary` over
   `--bg-hover` ≥ 4.5:1 (WCAG AA text threshold). Mirrors the row-action-
   button precedent (R2 §61.6.2 R3-COMPUTE marker → R3 picked the existing
   pattern). 14 canonical themes — same enumeration as Dimension 1.

   The Save CTA's idle state has `color: var(--text-tertiary); background:
   transparent;` and only changes both on `:hover`; the hover state is
   what an active user is looking at when reading the `+` glyph (the only
   moment the contrast matters at a 4.5:1 text threshold). Per
   sidepanel.css:668-671 the hover-state pair is exactly --text-primary on
   --bg-hover.
   ========================================================================= */

for (const theme of THEMES) {
  const block = theme.readBlock();
  const textPrimary = readTokenHex(block, '--text-primary');
  const bgHover = readTokenHex(block, '--bg-hover');
  const ratio = contrast(textPrimary, bgHover);
  const allow = findAllowEntry(theme.slug, 'cta-hover');

  if (allow) {
    test(`B-124 D2 [accepted limitation] ${theme.label} CTA hover ratio ${ratio.toFixed(3)} ≥ floor ${allow.minExpectedRatio}`, () => {
      assert.ok(
        ratio >= allow.minExpectedRatio,
        `${theme.label} CTA hover contrast ${ratio.toFixed(3)} regressed below accept-as-limitation floor ${allow.minExpectedRatio} (S35 B-105 monotonic-decrease guard). Token darkening on --text-primary or --bg-hover is the likely cause.`,
      );
      assert.ok(
        ratio < 4.5,
        `${theme.label} CTA hover contrast ${ratio.toFixed(3)} now CLEARS WCAG AA 4.5:1 — remove from ACCEPTED_LIMITATIONS in tests/b124-floating-bar-contrast.test.js (stale-allow-list guard).`,
      );
    });
  } else {
    test(`B-124 D2 ${theme.label} Save-CTA hover (--text-primary on --bg-hover) ≥ 4.5:1 (computed ${ratio.toFixed(3)})`, () => {
      assert.ok(
        ratio >= 4.5,
        `${theme.label} CTA hover contrast --text-primary (${textPrimary}) vs --bg-hover (${bgHover}) = ${ratio.toFixed(3)} below WCAG AA text 4.5:1. The Save CTA hover state pair is set in sidepanel.css:668-671 (color: var(--text-primary); background: var(--bg-hover);). Fix via theme palette adjustment or document a per-cell ACCEPTED_LIMITATIONS entry with rationale.`,
      );
    });
  }
}

/* =========================================================================
   Allow-list shape guard — every entry must have valid theme + dimension
   strings and a positive minExpectedRatio. Catches typos that would
   silently exempt the wrong cell.
   ========================================================================= */

test('B-124 ACCEPTED_LIMITATIONS shape: every entry has valid theme/dimension/minExpectedRatio', () => {
  const themeSlugs = new Set(THEMES.map((t) => t.slug));
  const validDimensions = new Set(['floating-bar', 'cta-hover']);
  for (const e of ACCEPTED_LIMITATIONS) {
    assert.ok(
      themeSlugs.has(e.theme),
      `ACCEPTED_LIMITATIONS entry has unknown theme: ${e.theme}`,
    );
    assert.ok(
      validDimensions.has(e.dimension),
      `ACCEPTED_LIMITATIONS entry ${e.theme} has unknown dimension: ${e.dimension}`,
    );
    /* Floating-bar uses the 3:1 UI-component floor; CTA-hover uses 4.5:1
       text floor. Either way the allow-list ratio must be strictly below
       the relevant floor — otherwise it is not a "limitation". */
    const ceil = e.dimension === 'floating-bar' ? 3.0 : 4.5;
    assert.ok(
      typeof e.minExpectedRatio === 'number' && e.minExpectedRatio > 0 && e.minExpectedRatio < ceil,
      `ACCEPTED_LIMITATIONS ${e.theme}/${e.dimension} minExpectedRatio must be a positive number < ${ceil} (got ${e.minExpectedRatio})`,
    );
  }
});

test('B-124 ACCEPTED_LIMITATIONS coverage: exactly 3 entries (1× D1 + 2× D2 pre-existing palette gaps)', () => {
  /* Per R2 §61.6.1: 1 D1 entry — solarized-light dotted-bar (sub-3:1).
     Per R5 fix-round D2 computation: 2 D2 entries — solarized-light +
     solarized-dark CTA hover both inherit pre-existing --text-primary
     vs --bg-hover gaps documented in tests/b105-solarized-light-contrast.
     test.js T4 docstring + tests/b117-gc-matrix-audit.test.js helper
     sanity. If a future palette change adds or removes entries, this
     assertion forces an explicit count update. */
  assert.equal(
    ACCEPTED_LIMITATIONS.length,
    3,
    'ACCEPTED_LIMITATIONS must contain exactly 3 entries (1× D1 solarized-light dotted-bar + 2× D2 cta-hover on solarized-light/solarized-dark) — see file docstring for rationale',
  );
  /* Spot-check the canonical D1 entry remains. */
  assert.ok(
    ACCEPTED_LIMITATIONS.some((e) => e.theme === 'solarized-light' && e.dimension === 'floating-bar'),
    'must contain the R2 §61.6.1 solarized-light dotted-bar entry',
  );
});
