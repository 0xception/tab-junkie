/**
 * b117-gc-matrix-audit.test.js — Sprint 37 / B-117 R5 (AC1–AC9)
 *
 * B-117 audits all 14 themes × 9 group-color slots = 126 cells in
 * shared/themes.css and asserts each cell against WCAG AA (4.5:1) computed
 * from the live `--text-primary`, `--bg-secondary`, `--gc-<slot>`, and
 * `--group-header-tint-amount` token values. Cells that are documented
 * accept-as-limitation in `docs/design/57-b-117-gc-matrix-audit.md` §57.3.2
 * are explicitly enumerated in `ACCEPTED_LIMITATIONS` and assert against
 * a per-cell `minExpectedRatio` floor (S35 B-105 monotonic-decrease
 * precedent — catches accidental further darkening of a documented
 * limitation while still rejecting NEW sub-AA cells).
 *
 * Strategy:
 *   - Pure JS WCAG 2.1 contrast helpers (mirrored from
 *     `tests/b105-solarized-light-contrast.test.js:84–127`).
 *   - Live-extract every theme block from `shared/themes.css` so a future
 *     palette tweak that breaks AA fails this test, not a downstream UAT.
 *   - Allow-list direction (R2 C-7): `ACCEPTED_LIMITATIONS` is a positive
 *     enumeration that BYPASSES the AA assertion; the default path
 *     enforces 4.5:1.
 *   - Stale-allow-list guard: if an accepted-limitation cell ever clears
 *     4.5:1, the test fails so the maintainer is forced to remove it from
 *     the allow-list (prevents allow-list bloat).
 *
 * 126 + 9 (allow-list-floor) + 9 (stale-allow-list-guard) + helper sanity
 * tests; total runtime well under the R1 200 ms budget.
 *
 * See docs/design/57-b-117-gc-matrix-audit.md §57.5 for the full test
 * design and §57.2 for the computed reference matrix.
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

     contrast(L_lighter, L_darker) = (L_lighter + 0.05) / (L_darker + 0.05)
     L = 0.2126 R + 0.7152 G + 0.0722 B   (linear-light)
     toLinear(c) = c <= 0.04045 ? c/12.92 : ((c + 0.055)/1.055)^2.4

   color-mix(in srgb, A pct%, B (100-pct)%) interpolates in LINEAR-LIGHT
   sRGB per CSS Color 4 — this is the same path the browser uses to compute
   the post-tint background.
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

/* =========================================================================
   Theme-block extractors. Each extractor returns the body of the matching
   `[data-theme="X"] { ... }` block so subsequent `--token` regexes can run
   without cross-block false positives.

   The `system` theme has TWO blocks: a top-level `[data-theme="system"]`
   for the light-OS branch and a `@media (prefers-color-scheme: dark)
   [data-theme="system"]` for the dark-OS branch. Per §57.2.1, the canonical
   `system` row in the 126-cell matrix is the LIGHT branch; the dark branch
   is computed as a 15th informational row.
   ========================================================================= */

function readThemeBlock(themeAttr) {
  const css = readFile('shared/themes.css');
  /* Match `[data-theme="X"] { ... }` at the top level. The `^\}` line-anchor
     terminates at a closing `}` at column 0 — palette block bodies never
     have a stray top-level `}` so this matches the block-close reliably. */
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
  /* The dark-OS branch lives inside `@media (prefers-color-scheme: dark)
     { [data-theme="system"] { ... } }`. The inner `}` closes the theme
     block; the outer `}` closes the @media. Match the inner one explicitly. */
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

function readTokenPercent(blockBody, tokenName) {
  const re = new RegExp(`${tokenName}\\s*:\\s*([0-9]+)%\\s*;`);
  const m = blockBody.match(re);
  if (!m) return null;
  return parseInt(m[1], 10);
}

function readRootTintPercent() {
  const css = readFile('shared/themes.css');
  /* :root block at the top of the file. Use a forgiving extractor — `:root {
     ... }` followed by light-theme blocks. */
  const m = css.match(/:root\s*\{([\s\S]*?)^\}/m);
  assert.ok(m, ':root block must exist and be parseable');
  const pct = readTokenPercent(m[1], '--group-header-tint-amount');
  assert.ok(typeof pct === 'number', ':root must declare --group-header-tint-amount as a percent');
  return pct;
}

/* =========================================================================
   Theme enumeration — 14 canonical themes. Per §57.2.1 the `system` slug
   uses the LIGHT-OS branch (top-level [data-theme="system"]) as its
   canonical row; the dark-OS branch is a separate informational entry.
   ========================================================================= */

const SLOTS = ['blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate'];

const THEMES = [
  /* Light themes (5) — :root 18% inherits unless overridden */
  { slug: 'system', readBlock: () => readThemeBlock('system'), localTintRequired: false },
  { slug: 'github-light', readBlock: () => readThemeBlock('github-light'), localTintRequired: false },
  { slug: 'tomorrow', readBlock: () => readThemeBlock('tomorrow'), localTintRequired: false },
  { slug: 'atom-one-light', readBlock: () => readThemeBlock('atom-one-light'), localTintRequired: false },
  { slug: 'solarized-light', readBlock: () => readThemeBlock('solarized-light'), localTintRequired: true },
  /* Dark themes (9) — every dark theme MUST declare its own tint override
     per B-114/B-117. localTintRequired=true asserts the declaration is
     present in the block (not relying on :root cascade). */
  { slug: 'github-dark', readBlock: () => readThemeBlock('github-dark'), localTintRequired: true },
  { slug: 'tomorrow-night', readBlock: () => readThemeBlock('tomorrow-night'), localTintRequired: true },
  { slug: 'atom-one-dark', readBlock: () => readThemeBlock('atom-one-dark'), localTintRequired: true },
  { slug: 'solarized-dark', readBlock: () => readThemeBlock('solarized-dark'), localTintRequired: true },
  { slug: 'dracula', readBlock: () => readThemeBlock('dracula'), localTintRequired: true },
  { slug: 'nord', readBlock: () => readThemeBlock('nord'), localTintRequired: true },
  { slug: 'one-dark', readBlock: () => readThemeBlock('one-dark'), localTintRequired: true },
  { slug: 'monokai', readBlock: () => readThemeBlock('monokai'), localTintRequired: true },
  { slug: 'tokyo-night', readBlock: () => readThemeBlock('tokyo-night'), localTintRequired: true },
];

/* =========================================================================
   AC6/AC7 explicit allow-list (R2 C-7 allow-list direction).
   Each entry: { theme, slot, minExpectedRatio }
     minExpectedRatio = computed_ratio rounded down to 1 decimal place
     (margin against accidental further darkening; mirrors S35 B-105 floor
     pattern). See docs/design/57-b-117-gc-matrix-audit.md §57.3.2 for the
     full pathway-(c) rationale. Solarized Dark's canonical base0/base02
     text/bg pair is 4.111:1 — sub-AA at the source. Modifying it would
     break the canonical Solarized look (R1 AC10(b) + AC11(c) lock the
     base text/bg tokens).
   ========================================================================= */

const ACCEPTED_LIMITATIONS = [
  { theme: 'solarized-dark', slot: 'blue',    minExpectedRatio: 3.4 },
  { theme: 'solarized-dark', slot: 'purple',  minExpectedRatio: 3.5 },
  { theme: 'solarized-dark', slot: 'teal',    minExpectedRatio: 3.1 },
  { theme: 'solarized-dark', slot: 'red',     minExpectedRatio: 3.5 },
  { theme: 'solarized-dark', slot: 'orange',  minExpectedRatio: 3.2 },
  { theme: 'solarized-dark', slot: 'pink',    minExpectedRatio: 3.5 },
  { theme: 'solarized-dark', slot: 'indigo',  minExpectedRatio: 3.6 },
  { theme: 'solarized-dark', slot: 'yellow',  minExpectedRatio: 3.0 },
  { theme: 'solarized-dark', slot: 'slate',   minExpectedRatio: 3.4 },
];

function findAllowEntry(theme, slot) {
  return ACCEPTED_LIMITATIONS.find((e) => e.theme === theme && e.slot === slot);
}

/* =========================================================================
   Helper sanity tests — pin the math against R2 §57.2 reference values so
   a regression in the helpers themselves (not the palette) surfaces here.
   ========================================================================= */

test('B-117 helper sanity: contrast(#000, #fff) ≈ 21:1 (WCAG max)', () => {
  const r = contrast('#000000', '#ffffff');
  assert.ok(r > 20.99 && r < 21.01, `expected ≈ 21:1, got ${r}`);
});

test('B-117 helper sanity: colorMixSrgb mid-mix is monotonic in linear space', () => {
  const out = colorMixSrgb('#ffffff', '#000000', 50);
  /* 50/50 linear-light mix of white+black is mid-grey at #bcbcbc (lin 0.5
     → sRGB ≈ 0.7354 → 187 ≈ 0xbc). Pin the value to catch helper drift. */
  assert.equal(out, '#bcbcbc', `expected #bcbcbc, got ${out}`);
});

test('B-117 helper sanity: solarized-dark base text/bg pair is sub-AA (4.111:1)', () => {
  /* Anchors the rationale for the entire ACCEPTED_LIMITATIONS allow-list.
     If this assertion ever fails, either the canonical Solarized palette
     was modified (R1 AC10(b) violation) or the helpers regressed. */
  const r = contrast('#839496', '#073642');
  assert.ok(r > 4.10 && r < 4.13, `solarized-dark base text/bg expected ≈ 4.11:1, got ${r}`);
  assert.ok(r < 4.5, 'solarized-dark base pair must remain sub-AA — this is the documented limitation');
});

test('B-117 helper sanity: :root --group-header-tint-amount is 18% (B-106 default)', () => {
  const pct = readRootTintPercent();
  assert.equal(pct, 18, ':root tint default must remain 18% (B-106 baseline)');
});

/* =========================================================================
   Per-theme tint-declaration guard — every dark theme MUST declare its own
   `--group-header-tint-amount` so the cascade does not silently apply the
   :root 18% default. Catches accidental tint-override removal during
   palette refactors.
   ========================================================================= */

test('B-117 tint-declaration guard: every dark theme declares its own --group-header-tint-amount', () => {
  for (const theme of THEMES) {
    if (!theme.localTintRequired) continue;
    const block = theme.readBlock();
    const pct = readTokenPercent(block, '--group-header-tint-amount');
    assert.ok(
      typeof pct === 'number',
      `${theme.slug} must declare its own --group-header-tint-amount (do not rely on :root cascade)`,
    );
  }
});

test('B-117 system-dark-OS branch declares --group-header-tint-amount: 20%', () => {
  /* The dark-OS branch is informational (not in the 126-cell matrix) but
     its tint declaration must remain pinned at 20% (B-114 baseline). */
  const block = readSystemDarkBlock();
  const pct = readTokenPercent(block, '--group-header-tint-amount');
  assert.equal(pct, 20, 'system-dark-OS branch tint must be 20%');
});

/* =========================================================================
   The 126-cell audit. For every (theme, slot) pair:

     1. Compute tinted_bg = colorMixSrgb(slot, bg-secondary, tint).
     2. Compute ratio = contrast(text-primary, tinted_bg).
     3. If (theme, slot) ∈ ACCEPTED_LIMITATIONS:
          - Assert ratio >= minExpectedRatio (monotonic-decrease guard).
          - Assert ratio < 4.5 (stale-allow-list guard — if it ever clears
            AA, force the maintainer to remove the entry).
        Otherwise:
          - Assert ratio >= 4.5 (WCAG AA floor).

   Each cell is its own test() so a single failure does not mask other
   regressions and the failure message identifies the cell precisely.
   ========================================================================= */

const rootTint = readRootTintPercent();

for (const theme of THEMES) {
  const block = theme.readBlock();
  const textPrimary = readTokenHex(block, '--text-primary');
  const bgSecondary = readTokenHex(block, '--bg-secondary');
  const localTint = readTokenPercent(block, '--group-header-tint-amount');
  const tint = typeof localTint === 'number' ? localTint : rootTint;

  for (const slot of SLOTS) {
    const slotHex = readTokenHex(block, `--gc-${slot}`);
    const tintedBg = colorMixSrgb(slotHex, bgSecondary, tint);
    const ratio = contrast(textPrimary, tintedBg);
    const allow = findAllowEntry(theme.slug, slot);

    if (allow) {
      test(`B-117 [accepted limitation] ${theme.slug}/${slot} ratio ${ratio.toFixed(3)} ≥ floor ${allow.minExpectedRatio}`, () => {
        assert.ok(
          ratio >= allow.minExpectedRatio,
          `${theme.slug}/${slot} contrast ${ratio.toFixed(3)} regressed below accept-as-limitation floor ${allow.minExpectedRatio} (S35 B-105 monotonic-decrease guard). Token darkening is the likely cause.`,
        );
        assert.ok(
          ratio < 4.5,
          `${theme.slug}/${slot} contrast ${ratio.toFixed(3)} now CLEARS WCAG AA — remove from ACCEPTED_LIMITATIONS in tests/b117-gc-matrix-audit.test.js and update docs/user-manual/themes.md "Theme accessibility limitations" subsection (stale-allow-list guard).`,
        );
      });
    } else {
      test(`B-117 ${theme.slug}/${slot} ≥ WCAG AA 4.5:1 (computed ${ratio.toFixed(3)})`, () => {
        assert.ok(
          ratio >= 4.5,
          `${theme.slug}/${slot} contrast ${ratio.toFixed(3)} below WCAG AA 4.5:1 — text-primary=${textPrimary}, slot=${slotHex}, tint=${tint}%, bg-secondary=${bgSecondary}, tinted-bg=${tintedBg}. Fix via slot-token darkening, --group-header-tint-amount lowering, or add a documented entry to ACCEPTED_LIMITATIONS with rationale.`,
        );
      });
    }
  }
}

/* =========================================================================
   Allow-list shape guard — every entry must have valid theme + slot strings
   and a positive minExpectedRatio. Catches typos that would silently exempt
   the wrong cell.
   ========================================================================= */

test('B-117 ACCEPTED_LIMITATIONS shape: every entry has valid theme/slot/minExpectedRatio', () => {
  const themeSlugs = new Set(THEMES.map((t) => t.slug));
  const slotSet = new Set(SLOTS);
  for (const e of ACCEPTED_LIMITATIONS) {
    assert.ok(themeSlugs.has(e.theme), `ACCEPTED_LIMITATIONS entry has unknown theme: ${e.theme}`);
    assert.ok(slotSet.has(e.slot), `ACCEPTED_LIMITATIONS entry has unknown slot: ${e.slot} (theme=${e.theme})`);
    assert.ok(
      typeof e.minExpectedRatio === 'number' && e.minExpectedRatio > 0 && e.minExpectedRatio < 4.5,
      `ACCEPTED_LIMITATIONS ${e.theme}/${e.slot} minExpectedRatio must be a positive number < 4.5 (got ${e.minExpectedRatio})`,
    );
  }
});

test('B-117 ACCEPTED_LIMITATIONS coverage: exactly 9 solarized-dark cells (per §57.3.2)', () => {
  /* If a future palette change adds or removes accept-as-limitation cells,
     this assertion forces an explicit count update. Documents the design
     decision: the accept-as-limitation surface is solarized-dark only;
     all other themes have actionable remediation pathways. */
  assert.equal(ACCEPTED_LIMITATIONS.length, 9, 'ACCEPTED_LIMITATIONS must contain exactly 9 entries (all 9 solarized-dark slots)');
  for (const e of ACCEPTED_LIMITATIONS) {
    assert.equal(e.theme, 'solarized-dark', `ACCEPTED_LIMITATIONS entry ${e.slot} must be solarized-dark — other themes have remediation pathways`);
  }
});

/* =========================================================================
   R5 gap-fill — legacy `[data-theme="dark"]` alias drift guard.

   Per §57.4.3 the legacy `[data-theme="dark"]` block mirrors one-dark and
   was edited in R3 to 7% tint. The 14-theme enumeration above does NOT
   include this alias (R1 specifies "14 canonical themes × 9 slots = 126";
   the alias is a separate cascade-compatibility surface). If a future
   palette refactor changes one-dark's tint without mirroring the alias —
   or vice versa — drift would silently ship.

   This guard reads the alias's tint declaration and asserts it matches
   one-dark's tint, so the contract from §57.3.1 ("legacy `dark` alias
   mirrors one-dark; matches §57.3.1") is mechanically enforced rather
   than relying on developer discipline.
   ========================================================================= */

test('B-117 legacy [data-theme="dark"] alias mirrors one-dark tint (§57.3.1 contract)', () => {
  const aliasBlock = readThemeBlock('dark');
  const oneDarkBlock = readThemeBlock('one-dark');
  const aliasTint = readTokenPercent(aliasBlock, '--group-header-tint-amount');
  const oneDarkTint = readTokenPercent(oneDarkBlock, '--group-header-tint-amount');
  assert.ok(
    typeof aliasTint === 'number',
    'legacy [data-theme="dark"] block must declare --group-header-tint-amount (do not rely on :root cascade)',
  );
  assert.equal(
    aliasTint,
    oneDarkTint,
    `legacy [data-theme="dark"] tint (${aliasTint}%) must match one-dark tint (${oneDarkTint}%) — alias is documented to mirror one-dark per §57.3.1. If you intentionally diverged the alias, update docs/design/57-b-117-gc-matrix-audit.md §57.3.1 and §57.4.3, then update this guard.`,
  );
});

test('B-117 legacy [data-theme="dark"] alias slot palette mirrors one-dark slots', () => {
  /* B-104 D-1 + §57.4.3: the alias copies the one-dark `--gc-*` token set.
     If one-dark's slot palette is refactored without mirroring, group-color
     identity drifts silently across the alias. */
  const aliasBlock = readThemeBlock('dark');
  const oneDarkBlock = readThemeBlock('one-dark');
  for (const slot of SLOTS) {
    const aliasHex = readTokenHex(aliasBlock, `--gc-${slot}`);
    const oneDarkHex = readTokenHex(oneDarkBlock, `--gc-${slot}`);
    assert.equal(
      aliasHex,
      oneDarkHex,
      `legacy [data-theme="dark"] --gc-${slot} (${aliasHex}) must match one-dark --gc-${slot} (${oneDarkHex}) — B-104 D-1 contract`,
    );
  }
});

/* =========================================================================
   R5 gap-fill — slot-token rename drift guard.

   The 126-cell loop above relies on `readTokenHex(block, '--gc-<slot>')`
   for every slot in `SLOTS`. If a future refactor renamed a slot token
   (e.g., `--gc-blue` → `--gc-cyan`), the regex would fail per-cell with
   126 cascading failures. This single test surfaces the root cause
   precisely: it asserts every theme block declares all 9 canonical slot
   tokens by name, so a rename drops a single failure with the actual
   missing token — not a 126-failure cascade that hides the source.
   ========================================================================= */

test('B-117 slot-token name drift guard: every theme declares all 9 canonical --gc-* tokens', () => {
  for (const theme of THEMES) {
    const block = theme.readBlock();
    for (const slot of SLOTS) {
      const tokenName = `--gc-${slot}`;
      const re = new RegExp(`${tokenName}\\s*:\\s*#[0-9a-fA-F]{6}\\s*;`);
      assert.ok(
        re.test(block),
        `${theme.slug} block must declare ${tokenName} (canonical slot name from R1 AC11). If a slot was intentionally renamed, update SLOTS in tests/b117-gc-matrix-audit.test.js AND docs/design/57-b-117-gc-matrix-audit.md §57.5.1.`,
      );
    }
  }
});
