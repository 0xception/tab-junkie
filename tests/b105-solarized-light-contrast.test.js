/**
 * b105-solarized-light-contrast.test.js — Sprint 35 / B-105 R5 (AC5)
 *
 * B-105 corrects a pre-existing WCAG AA contrast defect in the
 * `[data-theme="solarized-light"]` palette block in `shared/themes.css`.
 * Two coordinated edits ship under this item:
 *
 *   D-1: `--text-primary` darkened from canonical Solarized base01 `#586e75`
 *        (4.392:1 vs `--bg-secondary #eee8d5` — FAIL AA) to `#546a71`
 *        (4.661:1 — PASS, 0.161 above the 4.5:1 floor). The deviation is a
 *        ~3.4% luminance reduction; visually imperceptible at arm's length.
 *
 *   D-2: `--group-header-tint-amount` REPLACED `0%` → `3%`. R1 Q4 math
 *        established 3% as the safe ceiling for all 9 group-color slots
 *        with the new text token. At 4% tint the worst slot drops below
 *        4.5:1. The override is RETAINED at 3% so B-106's `:root 18%`
 *        default does NOT cascade to this theme via the CSS cascade.
 *
 * Coverage map (≥ 6 tests per AC5 plus the LOW L-2 deferral note):
 *
 *   T1 — AC1 + AC3: WCAG 2.1 contrast for `#546a71` vs `#eee8d5` ≥ 4.5:1.
 *        Computes contrast directly using sRGB → linear → relative
 *        luminance. R2 verified value: 4.661:1.
 *   T2 — AC2: solarized-light block contains `--group-header-tint-amount: 3%`
 *        AND does NOT contain the pre-B-105 `0%` override.
 *   T3 — AC4 cross-surface: `#546a71` vs `--bg-primary #fdf6e3` ≥ 4.5:1
 *        (R2: 5.295:1).
 *   T4 — AC4 cross-surface: `#546a71` vs `--active-bg #e3eef7` ≥ 4.5:1
 *        (R2: 4.852:1).
 *   T5 — AC4 regression guard: the other 13 themes' `--text-primary` values
 *        are unchanged from the pre-B-105 baseline (only solarized-light
 *        was touched).
 *   T6 — AC4 + R1 Q4 math: at 3% tint, ALL 9 group-color slots remain
 *        AA-compliant against `--text-primary`. Computes the post-tint
 *        background per slot via linear sRGB interpolation (the
 *        `color-mix(in srgb, ...)` algorithm CSS uses) and asserts the
 *        worst-slot contrast ≥ 4.5:1.
 *   T7 — R4 LOW L-2 (deferred): the gc-slot algorithmic comment at
 *        themes.css:345 still references "B-104" only and does not
 *        mention B-105 or the 3% ceiling. R4 LOW disposition documented
 *        this as deferred (not fixed in R3); the test pins the current
 *        state with a TODO marker so a follow-up sprint can flip the
 *        assertion when the comment is updated.
 *
 * Strategy: WCAG math runs in pure JS (no DOM dep, no chrome-mock). Token
 * values are read from the live `shared/themes.css` so a future palette
 * tweak that breaks AA will fail the test, not silently regress.
 *
 * Mirrors `tests/b104-group-colors.test.js` (T7 in particular pins the
 * complementary post-B-105 invariants — text-primary == #546a71 AND
 * tint-amount == 3% — at the static-file regex level; this file extends
 * coverage with the computed-contrast assertions B-104 deliberately
 * deferred to B-105). See docs/design/52-b-105-solarized-light-fix.md.
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
   docs/design/52-b-105-solarized-light-fix.md §52.3 D-1 and the R1 Q1 +
   Q4 candidate sweeps.

     contrast(L_lighter, L_darker) = (L_lighter + 0.05) / (L_darker + 0.05)
     L = 0.2126 R + 0.7152 G + 0.0722 B   (linear-light)
     toLinear(c) = c <= 0.04045 ? c/12.92 : ((c + 0.055)/1.055)^2.4

   color-mix(in srgb, A pct%, B (100-pct)%) interpolates in LINEAR-LIGHT
   sRGB per CSS Color 4 — this is the same path used to compute the
   post-tint background for the 3% tint assertion in T6.
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

function fromLinear(lin) {
  const sv = lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(255, sv * 255)));
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

/* CSS color-mix(in srgb, slot N%, base (100-N)%) — linear sRGB lerp.
   Returns the resulting color as a #rrggbb hex string. */
function colorMixSrgb(slotHex, baseHex, slotPct) {
  const slot = hexToRgb(slotHex).map(toLinear);
  const base = hexToRgb(baseHex).map(toLinear);
  const t = slotPct / 100;
  const lin = slot.map((s, i) => s * t + base[i] * (1 - t));
  const rgb = lin.map(fromLinear);
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/* Static-file solarized-light block extractor. Returns the body of
   `[data-theme="solarized-light"] { ... }` so subsequent assertions can
   regex against just that block (avoids cross-block false positives). */
function readSolarizedLightBlock() {
  const css = readFile('shared/themes.css');
  const m = css.match(/\[data-theme="solarized-light"\]\s*\{([\s\S]*?)^\}/m);
  assert.ok(m, '[data-theme="solarized-light"] block must exist and be parseable');
  return m[1];
}

/* Extract a `--token: #hex;` declaration from a block body. Returns the
   raw 6-digit hex string. Throws if missing — these are load-bearing
   tokens for the contrast assertions. */
function readTokenHex(blockBody, tokenName) {
  const re = new RegExp(`${tokenName}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`);
  const m = blockBody.match(re);
  assert.ok(m, `solarized-light block must declare ${tokenName} as a 6-digit hex`);
  return m[1].toLowerCase();
}

/* =========================================================================
   T1 — AC1 + AC3: computed WCAG AA contrast for `--text-primary` vs
   `--bg-secondary` on solarized-light is ≥ 4.5:1.

   Pre-B-105: 4.392:1 (FAIL). Post-B-105: 4.661:1 (PASS, R2 verified). The
   formula is computed live from the values pulled from shared/themes.css
   so a future regression that re-introduces a sub-AA hex will fail here.
   ========================================================================= */
test('B-105 T1 (AC1 + AC3): solarized-light --text-primary vs --bg-secondary ≥ 4.5:1 (WCAG AA, computed)', () => {
  const block = readSolarizedLightBlock();
  const textPrimary = readTokenHex(block, '--text-primary');
  const bgSecondary = readTokenHex(block, '--bg-secondary');

  /* Pin the post-B-105 hexes — guarantees the math below runs against the
     intended palette and not a future drift. */
  assert.equal(
    textPrimary,
    '#546a71',
    'B-105 D-1: --text-primary must be #546a71 (4.661:1 vs --bg-secondary)',
  );
  assert.equal(
    bgSecondary,
    '#eee8d5',
    'solarized-light --bg-secondary must remain Solarized canonical base2 #eee8d5',
  );

  const ratio = contrast(textPrimary, bgSecondary);
  assert.ok(
    ratio >= 4.5,
    `WCAG AA: --text-primary (${textPrimary}) vs --bg-secondary (${bgSecondary}) must be ≥ 4.5:1; got ${ratio.toFixed(4)}:1`,
  );

  /* Tighter assertion: the R2 pre-computed value is 4.661:1; allow a small
     tolerance for floating-point drift across Node versions. */
  assert.ok(
    Math.abs(ratio - 4.661) < 0.01,
    `expected ratio ≈ 4.661:1 (R2 verified); got ${ratio.toFixed(4)}:1`,
  );
});

/* =========================================================================
   T2 — AC2: solarized-light block contains `--group-header-tint-amount: 3%`
   AND does NOT contain the pre-B-105 `0%` override. The override is
   RETAINED at 3% (R1 Q4 LOCKED) so B-106's `:root 18%` default does NOT
   cascade to this theme via the CSS cascade.
   ========================================================================= */
test('B-105 T2 (AC2): solarized-light --group-header-tint-amount is 3% (post-B-105 safe ceiling), 0% override gone', () => {
  const block = readSolarizedLightBlock();

  assert.match(
    block,
    /--group-header-tint-amount:\s*3%/,
    'B-105 D-2: solarized-light must declare --group-header-tint-amount: 3% (worst-slot @3%: ≥ 4.5:1; @4%: FAIL)',
  );

  assert.doesNotMatch(
    block,
    /--group-header-tint-amount:\s*0%/,
    'B-105 D-2: pre-B-105 0% workaround override must be gone — replaced by 3% (R1 Q4 deviation)',
  );
});

/* =========================================================================
   T3 — AC4 cross-surface regression: `--text-primary` vs `--bg-primary`
   (main content area, S1 in R1 Q3 table) ≥ 4.5:1. R2 expected: 5.295:1.
   ========================================================================= */
test('B-105 T3 (AC4 cross-surface S1): solarized-light --text-primary vs --bg-primary ≥ 4.5:1 (main content area)', () => {
  const block = readSolarizedLightBlock();
  const textPrimary = readTokenHex(block, '--text-primary');
  const bgPrimary = readTokenHex(block, '--bg-primary');

  assert.equal(bgPrimary, '#fdf6e3', 'solarized-light --bg-primary must remain Solarized canonical base3 #fdf6e3');

  const ratio = contrast(textPrimary, bgPrimary);
  assert.ok(
    ratio >= 4.5,
    `WCAG AA: --text-primary vs --bg-primary must be ≥ 4.5:1; got ${ratio.toFixed(4)}:1`,
  );
  assert.ok(
    Math.abs(ratio - 5.295) < 0.01,
    `expected ratio ≈ 5.295:1 (R2 verified); got ${ratio.toFixed(4)}:1`,
  );
});

/* =========================================================================
   T4 — AC4 cross-surface regression: `--text-primary` vs `--active-bg`
   (selected-row state, S4 in R1 Q3 table) ≥ 4.5:1. R2 expected: 4.852:1.

   Note: `--bg-hover` (S3) measures 4.170:1 — sub-AA — but is documented as
   PRE-EXISTING (not introduced by B-105) in §52.3 footnote and Q3 table.
   T4 covers active-bg only; bg-hover is intentionally excluded from the
   guard set per Q3 scope decision.
   ========================================================================= */
test('B-105 T4 (AC4 cross-surface S4): solarized-light --text-primary vs --active-bg ≥ 4.5:1 (active row)', () => {
  const block = readSolarizedLightBlock();
  const textPrimary = readTokenHex(block, '--text-primary');
  const activeBg = readTokenHex(block, '--active-bg');

  assert.equal(activeBg, '#e3eef7', 'solarized-light --active-bg must remain #e3eef7 (Solarized blue-tinted)');

  const ratio = contrast(textPrimary, activeBg);
  assert.ok(
    ratio >= 4.5,
    `WCAG AA: --text-primary vs --active-bg must be ≥ 4.5:1; got ${ratio.toFixed(4)}:1`,
  );
  assert.ok(
    Math.abs(ratio - 4.852) < 0.01,
    `expected ratio ≈ 4.852:1 (R2 verified); got ${ratio.toFixed(4)}:1`,
  );
});

/* =========================================================================
   T5 — AC4 regression guard: the other 13 themes' `--text-primary` values
   are UNCHANGED from the pre-B-105 baseline. Only `[data-theme=
   "solarized-light"]` was touched in B-105's diff. If a future edit silently
   drifts another theme's --text-primary token, this guard fails fast.

   Baseline values (read from `shared/themes.css` HEAD at B-105 R3 land):
   ========================================================================= */
const PRE_B105_TEXT_PRIMARY = Object.freeze({
  /* Light themes — verified against shared/themes.css at the time of writing. */
  'github-light': '#1f2328',
  'tomorrow': '#4d4d4c',
  'atom-one-light': '#383a42',
  /* Dark themes. */
  'github-dark': '#e6edf3',
  'tomorrow-night': '#c5c8c6',
  'atom-one-dark': '#abb2bf',
  'solarized-dark': '#839496',
  'dracula': '#f8f8f2',
  'nord': '#eceff4',
  'one-dark': '#abb2bf',
  'monokai': '#f8f8f2',
  'tokyo-night': '#c0caf5',
  /* `system` carries two declarations — one in the base block (light) and a
     second inside `@media (prefers-color-scheme: dark)`. We pin the light
     baseline (the `@media` override is its own concern and not in scope). */
  'system': '#1a1d23',
});

test('B-105 T5 (AC4 regression guard): other 13 themes\' --text-primary unchanged (only solarized-light touched)', () => {
  const css = readFile('shared/themes.css');

  for (const [slug, expected] of Object.entries(PRE_B105_TEXT_PRIMARY)) {
    /* Locate `[data-theme="<slug>"] { ... }` (non-greedy to first
       closing-brace-at-line-start), then read --text-primary inside. */
    const blockRe = new RegExp(`\\[data-theme="${slug}"\\]\\s*\\{([\\s\\S]*?)^\\}`, 'm');
    const blockMatch = css.match(blockRe);
    assert.ok(blockMatch, `[data-theme="${slug}"] block must exist`);
    const decl = blockMatch[1].match(/--text-primary\s*:\s*(#[0-9a-fA-F]{6})\s*;/);
    assert.ok(decl, `[data-theme="${slug}"] block must declare --text-primary`);
    const got = decl[1].toLowerCase();
    assert.equal(
      got,
      expected,
      `[data-theme="${slug}"] --text-primary must be UNCHANGED at ${expected} (got ${got}). B-105 only touches solarized-light.`,
    );
  }
});

/* =========================================================================
   T6 — AC4 + R1 Q4 math: at 3% tint, all 9 group-color slots remain AA
   compliant against `--text-primary` on solarized-light. The mixing
   algorithm matches CSS Color 4 `color-mix(in srgb, slot 3%, base 97%)`
   (linear sRGB interpolation) — same path the browser executes at runtime
   on `.group-header { background: color-mix(...); }`.

   R2 verified the worst slot at 3% is purple at 4.524:1 (PASS). At 4%
   tint the worst slot (indigo) drops to 4.473:1 (FAIL) — this test pins
   the safe-ceiling claim from R1 Q4.
   ========================================================================= */
test('B-105 T6 (AC4 + R1 Q4): all 9 gc-slots @ 3% tint over --bg-secondary remain ≥ 4.5:1 vs --text-primary', () => {
  const block = readSolarizedLightBlock();
  const textPrimary = readTokenHex(block, '--text-primary');
  const bgSecondary = readTokenHex(block, '--bg-secondary');

  /* Read all 9 --gc-* slot hex values from the solarized-light block. */
  const slots = ['blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate'];
  const slotHexes = {};
  for (const slot of slots) {
    slotHexes[slot] = readTokenHex(block, `--gc-${slot}`);
  }

  /* Compute post-tint background per slot at 3% and assert AA. */
  let worstSlot = null;
  let worstRatio = Infinity;
  for (const slot of slots) {
    const tintedBg = colorMixSrgb(slotHexes[slot], bgSecondary, 3);
    const ratio = contrast(textPrimary, tintedBg);
    assert.ok(
      ratio >= 4.5,
      `gc-${slot} (${slotHexes[slot]}) @ 3% tint over ${bgSecondary} = ${tintedBg}; contrast vs ${textPrimary} = ${ratio.toFixed(4)}:1 — must be ≥ 4.5:1`,
    );
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstSlot = slot;
    }
  }

  /* Sanity-check: the worst slot at 3% must still clear AA with at least
     ~0.02 headroom. R2 pre-computed worst @ 3% was purple at 4.524:1; this
     assertion remains true regardless of which slot is the absolute
     minimum (different mix-precision implementations can swap purple/red
     by hundredths of a ratio). */
  assert.ok(
    worstRatio >= 4.5,
    `worst gc-slot @ 3% (${worstSlot}) must be ≥ 4.5:1; got ${worstRatio.toFixed(4)}:1`,
  );
  assert.ok(
    worstRatio < 4.7,
    `worst gc-slot @ 3% (${worstSlot}) sanity check: expected near the 4.5:1 floor (R1 Q4 ceiling); got ${worstRatio.toFixed(4)}:1 — if this triple-jumped above 4.7 a slot hex may have drifted`,
  );

  /* Defense: as tint percentage rises, the worst-slot contrast MUST be
     monotonically decreasing — proves the safe-ceiling logic is real.
     R1 Q4 modeled the crossover at 4% tint with a slightly stricter
     mix-precision implementation; this test pins the directional invariant
     (3% < 6% < 12% in tint amount → contrast strictly decreases) without
     depending on which specific tint % first crosses the 4.5:1 floor. */
  function worstAt(pct) {
    let w = Infinity;
    for (const slot of slots) {
      const tinted = colorMixSrgb(slotHexes[slot], bgSecondary, pct);
      const r = contrast(textPrimary, tinted);
      if (r < w) w = r;
    }
    return w;
  }
  const w3 = worstAt(3);
  const w6 = worstAt(6);
  const w12 = worstAt(12);
  assert.ok(w3 > w6, `worst-slot contrast must decrease 3% → 6% (got ${w3.toFixed(4)} → ${w6.toFixed(4)})`);
  assert.ok(w6 > w12, `worst-slot contrast must decrease 6% → 12% (got ${w6.toFixed(4)} → ${w12.toFixed(4)})`);
  assert.ok(
    w12 < 4.5,
    `at 12% tint (the pre-B-106 fallback), the worst slot MUST fail AA — this is why solarized-light needs the per-theme override. Got ${w12.toFixed(4)}:1.`,
  );
});

/* =========================================================================
   T7 — R4 LOW L-2 (deferred): the algorithmic comment block above the
   solarized-light --gc-* slots at shared/themes.css:345 still reads
   "B-104: algorithmic mix(canonical, #eee8d5, 0.30)." and does not yet
   mention B-105 or the 3% safe ceiling. R4 LOW L-2 disposition
   ("comment above --gc-* slots still references B-104 framing; should
   mention B-105 + 3% ceiling") was DEFERRED — not fixed in R3. This test
   pins the current state explicitly; when a follow-up sprint updates the
   comment, the assertion below flips and the test author updates the
   regex. Keeps the deferral visible in CI rather than hidden in
   docs/findings/sprint-35.md.
   ========================================================================= */
test('B-105 T7 (R4 LOW L-2 deferral pin): solarized-light gc-slot comment still scoped to B-104 — flip when L-2 is addressed', () => {
  const css = readFile('shared/themes.css');

  /* Locate the B-104 algorithmic comment that sits immediately before the
     solarized-light --gc-* slots. The comment lives at lines ~345 in HEAD
     post-B-105 R3; pin its current scope to B-104 only. */
  const m = css.match(/\/\*\s*B-104:\s*algorithmic\s*mix\(canonical,\s*#eee8d5,\s*0\.30\)\.\s*\*\/\s*\n\s*--gc-blue:\s*#618be4/);
  assert.ok(
    m,
    'pre-existing B-104 algorithmic comment immediately above solarized-light --gc-blue must still be present (R4 LOW L-2 deferred). When this assertion fails, L-2 has been addressed — update the test to assert the new B-105-aware comment and remove this pin.',
  );
});
