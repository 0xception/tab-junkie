/**
 * b108-solarized-secondary-contrast.test.js — Sprint 36 / B-108 R5 (AC5)
 *
 * B-108 corrects a pre-existing WCAG AA contrast defect in the
 * `[data-theme="solarized-light"]` palette block in `shared/themes.css`.
 * The defect was surfaced (not caused) by S35 B-105 R4 [qa-reviewer] M-1
 * and explicitly deferred to B-108 per docs/design/52-b-105-…md §52.6 Q1.
 *
 *   D-1: `--text-secondary` darkened from canonical Solarized base00
 *        `#657b83` (3.636:1 vs `--bg-secondary #eee8d5` — FAIL AA) to
 *        `#546a72` (4.655:1 — PASS, +0.155 above the 4.5:1 floor). The
 *        delta of −17 per channel mirrors the B-105 §52.3 D-1 precedent
 *        (B-105 landed --text-primary at 4.661:1 with +0.161 headroom).
 *
 *   D-2: `--group-count-text` ALSO darkened `#657b83` → `#546a72`. R1's
 *        claim that --text-secondary auto-aliases --group-count-text was
 *        FACTUALLY WRONG — both are string-duplicated literal hex values.
 *        Updating only --text-secondary would have left group count
 *        badges (the originating failure surface) at 3.636:1. R3 must
 *        edit BOTH lines. See §54.3 D-2 binding correction.
 *
 * Coverage map (≥ 4 tests required by AC5; this file ships 5):
 *
 *   T1 — AC1 + AC2: WCAG 2.1 contrast for `#546a72` vs `#eee8d5` ≥ 4.5:1.
 *        Computes contrast directly from sRGB → linear → relative
 *        luminance. R2 verified value: 4.6553:1.
 *   T2 — AC3 (R2-corrected): solarized-light block contains BOTH
 *        `--text-secondary: #546a72` AND `--group-count-text: #546a72`,
 *        and contains NEITHER pre-update `#657b83` declaration.
 *   T3 — AC4 cross-surface: `#546a72` vs `--bg-primary #fdf6e3`,
 *        `--mark-bg #f4e8a8`, `--accent-subtle #e3eef7`, `--group-count-bg
 *        #eee8d5` all ≥ 4.5:1. Excludes `--bg-hover` / `--bg-active` /
 *        `--active-bg-hover` (documented sub-AA pre-existing surfaces per
 *        §54.4 C-9 footnote (e)).
 *   T4 — AC4 catalog regression: the other 13 themes' --text-secondary
 *        AND --group-count-text values are unchanged from pre-B-108
 *        baseline (only solarized-light was touched in B-108).
 *   T5 — AC4 + R2 §54.3 tint table: at the 3% per-theme tint amount, all
 *        9 group-color slots over `--bg-secondary` remain ≥ 4.5:1 vs the
 *        new `#546a72`. Worst slot @ 3% is purple at 4.519:1.
 *
 * Strategy mirrors b105-solarized-light-contrast.test.js — pure JS WCAG
 * math, no DOM dep, no chrome-mock. Token values read from live
 * shared/themes.css so a future palette tweak that breaks AA fails here,
 * not silently in production.
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

/* WCAG 2.1 contrast helpers — mirror b105 file. */

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

function colorMixSrgb(slotHex, baseHex, slotPct) {
  const slot = hexToRgb(slotHex).map(toLinear);
  const base = hexToRgb(baseHex).map(toLinear);
  const t = slotPct / 100;
  const lin = slot.map((s, i) => s * t + base[i] * (1 - t));
  const rgb = lin.map(fromLinear);
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
}

function readSolarizedLightBlock() {
  const css = readFile('shared/themes.css');
  const m = css.match(/\[data-theme="solarized-light"\]\s*\{([\s\S]*?)^\}/m);
  assert.ok(m, '[data-theme="solarized-light"] block must exist and be parseable');
  return m[1];
}

function readTokenHex(blockBody, tokenName) {
  const re = new RegExp(`${tokenName}\\s*:\\s*(#[0-9a-fA-F]{6})\\s*[;\\s/]`);
  const m = blockBody.match(re);
  assert.ok(m, `solarized-light block must declare ${tokenName} as a 6-digit hex`);
  return m[1].toLowerCase();
}

/* T1 — AC1 + AC2: --text-secondary vs --bg-secondary ≥ 4.5:1. */
test('B-108 T1 (AC1 + AC2): solarized-light --text-secondary vs --bg-secondary ≥ 4.5:1 (WCAG AA, computed)', () => {
  const block = readSolarizedLightBlock();
  const textSecondary = readTokenHex(block, '--text-secondary');
  const bgSecondary = readTokenHex(block, '--bg-secondary');

  assert.equal(
    textSecondary,
    '#546a72',
    'B-108 D-1: --text-secondary must be #546a72 (4.655:1 vs --bg-secondary)',
  );
  assert.equal(
    bgSecondary,
    '#eee8d5',
    'solarized-light --bg-secondary must remain Solarized canonical base2 #eee8d5',
  );

  const ratio = contrast(textSecondary, bgSecondary);
  assert.ok(
    ratio >= 4.5,
    `WCAG AA: --text-secondary (${textSecondary}) vs --bg-secondary (${bgSecondary}) must be ≥ 4.5:1; got ${ratio.toFixed(4)}:1`,
  );
  assert.ok(
    Math.abs(ratio - 4.655) < 0.01,
    `expected ratio ≈ 4.655:1 (R2 verified); got ${ratio.toFixed(4)}:1`,
  );
});

/* T2 — AC3 (R2-corrected per §54.3 D-2): BOTH tokens at #546a72,
   neither token at the pre-update #657b83. Guards against R3 missing
   the binding correction (literal grep for the pre-update hex). */
test('B-108 T2 (AC3 R2-corrected): solarized-light --text-secondary AND --group-count-text both === #546a72; neither === #657b83', () => {
  const block = readSolarizedLightBlock();

  const textSecondary = readTokenHex(block, '--text-secondary');
  const groupCountText = readTokenHex(block, '--group-count-text');

  assert.equal(
    textSecondary,
    '#546a72',
    'B-108 D-1: --text-secondary must be #546a72',
  );
  assert.equal(
    groupCountText,
    '#546a72',
    'B-108 D-2 binding correction: --group-count-text must ALSO be #546a72 (literal hex, not a var alias)',
  );

  /* Pre-update hex must be absent from the entire block — guards a
     partial-fix that updates one token but forgets the other. */
  assert.doesNotMatch(
    block,
    /--text-secondary\s*:\s*#657b83/i,
    'pre-B-108 --text-secondary: #657b83 must be gone',
  );
  assert.doesNotMatch(
    block,
    /--group-count-text\s*:\s*#657b83/i,
    'pre-B-108 --group-count-text: #657b83 must be gone (D-2 binding correction)',
  );
});

/* T3 — AC4 cross-surface: --text-secondary clears AA on the legible
   surfaces enumerated in §54.3 D-1. Excludes documented pre-existing
   sub-AA hover/active surfaces (§54.4 C-9 footnote (e)). */
test('B-108 T3 (AC4 cross-surface): --text-secondary ≥ 4.5:1 against bg-primary, mark-bg, accent-subtle, group-count-bg', () => {
  const block = readSolarizedLightBlock();
  const textSecondary = readTokenHex(block, '--text-secondary');

  const surfaces = [
    { name: '--bg-primary', expected: '#fdf6e3', minRatio: 5.28 },
    { name: '--mark-bg', expected: '#f4e8a8', minRatio: 4.6 },
    { name: '--accent-subtle', expected: '#e3eef7', minRatio: 4.84 },
    { name: '--group-count-bg', expected: '#eee8d5', minRatio: 4.65 },
  ];

  for (const { name, expected, minRatio } of surfaces) {
    const hex = readTokenHex(block, name);
    assert.equal(hex, expected, `solarized-light ${name} must remain ${expected}`);
    const ratio = contrast(textSecondary, hex);
    assert.ok(
      ratio >= 4.5,
      `WCAG AA: --text-secondary vs ${name} must be ≥ 4.5:1; got ${ratio.toFixed(4)}:1`,
    );
    assert.ok(
      ratio >= minRatio - 0.02,
      `expected ratio ≈ ${minRatio}:1 (R2 verified); got ${ratio.toFixed(4)}:1 — drift ≥ 0.02 from baseline`,
    );
  }
});

/* T4 — AC4 catalog regression: the other 13 themes' --text-secondary
   AND --group-count-text values are unchanged from pre-B-108 baseline.
   Only [data-theme="solarized-light"] was touched in B-108's diff. */
const PRE_B108_BASELINE = Object.freeze({
  /* { theme: [text-secondary, group-count-text] }; pre-B-108 captured
     2026-04-26 from feature/sprint-36-ui-polish HEAD. */
  'system': ['#5f6673', '#5f6673'],
  'github-light': ['#656d76', '#656d76'],
  'tomorrow': ['#8e908c', '#8e908c'],
  'atom-one-light': ['#696c77', '#696c77'],
  'github-dark': ['#8b949e', '#8b949e'],
  'tomorrow-night': ['#969896', '#969896'],
  'atom-one-dark': ['#828997', '#828997'],
  'solarized-dark': ['#93a1a1', '#93a1a1'],
  'dracula': ['#c5c5d2', '#c5c5d2'],
  'nord': ['#d8dee9', '#d8dee9'],
  'one-dark': ['#828997', '#828997'],
  'monokai': ['#cfcfc2', '#cfcfc2'],
  'tokyo-night': ['#a9b1d6', '#a9b1d6'],
});

test('B-108 T4 (AC4 catalog regression): other 13 themes\' --text-secondary AND --group-count-text unchanged (only solarized-light touched)', () => {
  const css = readFile('shared/themes.css');

  for (const [slug, [expectedSecondary, expectedGroupCount]] of Object.entries(PRE_B108_BASELINE)) {
    const blockRe = new RegExp(`\\[data-theme="${slug}"\\]\\s*\\{([\\s\\S]*?)^\\}`, 'm');
    const blockMatch = css.match(blockRe);
    assert.ok(blockMatch, `[data-theme="${slug}"] block must exist`);
    const body = blockMatch[1];

    const secMatch = body.match(/--text-secondary\s*:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(secMatch, `[data-theme="${slug}"] block must declare --text-secondary`);
    assert.equal(
      secMatch[1].toLowerCase(),
      expectedSecondary,
      `[data-theme="${slug}"] --text-secondary must be UNCHANGED at ${expectedSecondary} (got ${secMatch[1]}). B-108 only touches solarized-light.`,
    );

    const gctMatch = body.match(/--group-count-text\s*:\s*(#[0-9a-fA-F]{6})/);
    assert.ok(gctMatch, `[data-theme="${slug}"] block must declare --group-count-text`);
    assert.equal(
      gctMatch[1].toLowerCase(),
      expectedGroupCount,
      `[data-theme="${slug}"] --group-count-text must be UNCHANGED at ${expectedGroupCount} (got ${gctMatch[1]}). B-108 only touches solarized-light.`,
    );
  }
});

/* T5 — AC4 + R2 §54.3 D-1 tint table: at 3% tint (the per-theme override
   set by B-105), all 9 gc-* slots over --bg-secondary remain ≥ 4.5:1 vs
   the new --text-secondary. Worst slot @ 3% is purple at 4.519:1 per the
   R2 tint table. Body-text consumers of --text-secondary do not render
   on tinted group headers (§54.3 D-1 paragraph) but the assertion holds
   the broader AA-margin invariant for any future tint consumer. */
test('B-108 T5 (AC4 + R2 §54.3 tint table): all 9 gc-slots @ 3% tint over --bg-secondary remain ≥ 4.5:1 vs --text-secondary', () => {
  const block = readSolarizedLightBlock();
  const textSecondary = readTokenHex(block, '--text-secondary');
  const bgSecondary = readTokenHex(block, '--bg-secondary');

  const slots = ['blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate'];
  let worstSlot = null;
  let worstRatio = Infinity;
  for (const slot of slots) {
    const slotHex = readTokenHex(block, `--gc-${slot}`);
    const tintedBg = colorMixSrgb(slotHex, bgSecondary, 3);
    const ratio = contrast(textSecondary, tintedBg);
    assert.ok(
      ratio >= 4.5,
      `gc-${slot} (${slotHex}) @ 3% tint over ${bgSecondary} = ${tintedBg}; contrast vs ${textSecondary} = ${ratio.toFixed(4)}:1 — must be ≥ 4.5:1`,
    );
    if (ratio < worstRatio) {
      worstRatio = ratio;
      worstSlot = slot;
    }
  }

  assert.ok(
    worstRatio >= 4.5,
    `worst gc-slot @ 3% (${worstSlot}) must be ≥ 4.5:1; got ${worstRatio.toFixed(4)}:1`,
  );
  assert.ok(
    worstRatio < 4.65,
    `worst gc-slot @ 3% (${worstSlot}) sanity check: expected near the 4.5:1 floor (R2 §54.3 D-1: purple ≈ 4.519:1); got ${worstRatio.toFixed(4)}:1 — if this jumped above 4.65 a slot hex may have drifted`,
  );
});
