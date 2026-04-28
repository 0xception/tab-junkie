/**
 * b114-tint-v2.test.js — Sprint 36 / B-114 R5 (AC5)
 *
 * B-114 brightens the group-header tint on every dark theme by adding a
 * per-theme `--group-header-tint-amount: 20%` override to each of the 11
 * dark-theme palette blocks in `shared/themes.css`. Light themes (and the
 * `:root` baseline) keep `18%`. solarized-light keeps its B-105 `3%`
 * override. R3 settled on `20%` (not the originally proposed `22%`) per
 * AC4: at 22% the worst-case §47.7 spot-check cell (atom-one-dark/one-dark
 * + yellow) drops to 4.33:1 (FAIL); at 21% it is 4.41:1 (FAIL); at 20% it
 * lifts to 4.55:1 (PASS, +0.049 over the 4.5:1 floor). 20% is the largest
 * value that PASSES every algorithmic cell in the §47.7 matrix — the same
 * "choose the largest passing value" precedent established by S35 B-105.
 *
 * Coverage map (≥ 3 tests per AC5):
 *
 *   T1 — AC1: each of the 11 dark-theme selectors in `shared/themes.css`
 *        contains a `--group-header-tint-amount: 20%` declaration.
 *        Selector list (per B-114 R1 Q2): github-dark, tomorrow-night,
 *        atom-one-dark, solarized-dark, dracula, nord, one-dark, monokai,
 *        tokyo-night, dark (legacy alias), and the system theme's dark-OS
 *        @media branch.
 *   T2 — AC2: light-theme baseline preserved. `:root` still declares
 *        `--group-header-tint-amount: 18%`. None of the 4 light themes
 *        (`github-light`, `tomorrow`, `atom-one-light`, and the `light`
 *        legacy alias) add a per-theme `--group-header-tint-amount`
 *        override — they inherit `18%` from `:root` via the cascade.
 *   T3 — AC3: solarized-light's B-105 `--group-header-tint-amount: 3%`
 *        override is preserved. The B-105 contract is the load-bearing
 *        regression guard: B-114 must not silently flip solarized-light
 *        to the dark-theme `20%` value, since solarized-light is a LIGHT
 *        theme whose 3% ceiling is dictated by its own 9-slot AA-headroom
 *        math (worst slot at 3%: ~4.52:1; at 4% indigo drops to ~4.47:1
 *        FAIL — see docs/design/52-b-105-solarized-light-fix.md §52.3 D-2).
 *
 * Strategy: pure static-file regex assertions on `shared/themes.css` (no
 * DOM, no chrome-mock). The CSS file is the source of truth for theme
 * tokens — a regex pin per selector ensures any future palette tweak that
 * breaks AC1/AC2/AC3 fails the test rather than silently regressing.
 *
 * Sister-file pin: `tests/b105-solarized-light-contrast.test.js` T2 + T6
 * + the b104 T7 regression guard cover the cross-theme constraints that
 * B-114 must NOT violate (only solarized-light has the `3%` override; only
 * one `:root` baseline). This file pins the new B-114 invariants on the 11
 * dark themes.
 *
 * See docs/BACKLOG.md B-114 (R1 LOCKED 2026-04-26),
 *     docs/design/47-b-104-themed-group-colors.md §47.7 (post-B-114
 *     spot-check matrix re-tabulation).
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

/**
 * Extract the contents of the first selector block matching `selectorRegex`
 * from a CSS source string. Returns the substring between the opening `{`
 * and the matching `}` (including nested braces — i.e., for `@media` rules
 * we must call this twice, once for the @media block and once for the
 * inner selector). Returns null if no match.
 *
 * Implementation: locate the selector match, then walk forward counting
 * braces until the matching close. CSS doesn't support escaped braces in
 * declarations so a simple counter suffices.
 */
function extractBlock(css, selectorRegex) {
  const m = css.match(selectorRegex);
  if (!m) return null;
  const startIdx = m.index + m[0].length;
  // Find the opening brace right after the selector match
  const openIdx = css.indexOf('{', startIdx);
  if (openIdx < 0) return null;
  let depth = 1;
  let i = openIdx + 1;
  while (i < css.length && depth > 0) {
    const ch = css[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    if (depth === 0) return css.substring(openIdx + 1, i);
    i += 1;
  }
  return null;
}

/* =========================================================================
   T1 — AC1: every dark-theme selector ships `--group-header-tint-amount: 20%`
   ========================================================================= */

test('B-114 T1 (AC1): each of the 11 dark-theme selectors declares `--group-header-tint-amount: 20%`', () => {
  const css = readFile('shared/themes.css');

  /* The 9 standalone dark-theme palette blocks + the legacy 'dark' alias.
     Each is a top-level `[data-theme="<slug>"] { … }` block. */
  const standaloneDarkSelectors = [
    'github-dark',
    'tomorrow-night',
    'atom-one-dark',
    'solarized-dark',
    'dracula',
    'nord',
    'one-dark',
    'monokai',
    'tokyo-night',
    'dark', /* legacy alias — mirrors atom-one-dark/one-dark */
  ];

  for (const slug of standaloneDarkSelectors) {
    /* Anchor the match at start-of-line to avoid grabbing the dark-OS
       branch inside the @media block (which is indented and prefixed by
       whitespace, never at column 0). */
    const sel = new RegExp(`^\\[data-theme="${slug}"\\]\\s*`, 'm');
    const block = extractBlock(css, sel);
    assert.ok(
      block !== null,
      `[data-theme="${slug}"] palette block must exist in shared/themes.css`,
    );
    assert.match(
      block,
      /--group-header-tint-amount:\s*20%/,
      `[data-theme="${slug}"] must declare --group-header-tint-amount: 20% per B-114 AC1`,
    );
  }

  /* The 11th override: the system theme's dark-OS branch lives inside
     `@media (prefers-color-scheme: dark) { [data-theme="system"] { … } }`.
     We extract the @media block first, then the nested system selector. */
  const mediaBlock = extractBlock(
    css,
    /@media\s*\(prefers-color-scheme:\s*dark\)\s*/,
  );
  assert.ok(
    mediaBlock !== null,
    '@media (prefers-color-scheme: dark) block must exist for the system theme dark-OS branch',
  );
  const systemDarkBlock = extractBlock(
    mediaBlock,
    /\[data-theme="system"\]\s*/,
  );
  assert.ok(
    systemDarkBlock !== null,
    'system dark-OS @media branch must contain a nested [data-theme="system"] block',
  );
  assert.match(
    systemDarkBlock,
    /--group-header-tint-amount:\s*20%/,
    'system dark-OS @media branch must declare --group-header-tint-amount: 20% per B-114 AC1 (11th override)',
  );

  /* Cross-check: total count of `--group-header-tint-amount: 20%`
     declarations in the file is exactly 11 — one per dark-theme override.
     Catches accidental duplication or a missing/extra block. */
  const allTwentyPctDecls = (css.match(/--group-header-tint-amount:\s*20%/g) || []).length;
  assert.equal(
    allTwentyPctDecls,
    11,
    'exactly 11 --group-header-tint-amount: 20% declarations must ship (one per dark-theme override)',
  );
});

/* =========================================================================
   T2 — AC2: light-theme baseline + 18% :root preserved
   ========================================================================= */

test('B-114 T2 (AC2): `:root` keeps `--group-header-tint-amount: 18%` and no light theme adds a per-theme override', () => {
  const css = readFile('shared/themes.css');

  /* `:root` remains the canonical 18% baseline (B-106). */
  const rootBlock = extractBlock(css, /^:root\s*/m);
  assert.ok(rootBlock !== null, ':root block must exist in shared/themes.css');
  assert.match(
    rootBlock,
    /--group-header-tint-amount:\s*18%/,
    ':root must keep --group-header-tint-amount: 18% (B-106 baseline preserved per B-114 AC2)',
  );

  /* The 4 light themes inherit from :root via cascade — none adds its own
     --group-header-tint-amount override. Iterate and assert NEGATIVE on
     each light-theme block. */
  const lightSelectors = [
    'github-light',
    'tomorrow',
    'atom-one-light',
    'light', /* legacy alias — mirrors atom-one-light */
  ];

  for (const slug of lightSelectors) {
    const sel = new RegExp(`^\\[data-theme="${slug}"\\]\\s*`, 'm');
    const block = extractBlock(css, sel);
    assert.ok(
      block !== null,
      `[data-theme="${slug}"] palette block must exist in shared/themes.css`,
    );
    assert.doesNotMatch(
      block,
      /--group-header-tint-amount\s*:/,
      `[data-theme="${slug}"] must NOT declare a per-theme --group-header-tint-amount override (light themes inherit :root 18% per B-114 AC2)`,
    );
  }

  /* Cross-check: total count of `--group-header-tint-amount: 18%`
     declarations is exactly 1 — only `:root`. Light themes inherit. */
  const allEighteenPctDecls = (css.match(/--group-header-tint-amount:\s*18%/g) || []).length;
  assert.equal(
    allEighteenPctDecls,
    1,
    'exactly one --group-header-tint-amount: 18% declaration must ship (the :root baseline only)',
  );
});

/* =========================================================================
   T3 — AC3: solarized-light's B-105 `3%` override is preserved
   ========================================================================= */

test('B-114 T3 (AC3): `[data-theme="solarized-light"]` still declares `--group-header-tint-amount: 3%` (B-105 contract preserved)', () => {
  const css = readFile('shared/themes.css');

  const block = extractBlock(
    css,
    /^\[data-theme="solarized-light"\]\s*/m,
  );
  assert.ok(
    block !== null,
    '[data-theme="solarized-light"] palette block must exist in shared/themes.css',
  );
  assert.match(
    block,
    /--group-header-tint-amount:\s*3%/,
    'solarized-light must keep --group-header-tint-amount: 3% per B-105 contract (B-114 AC3 — must not be flipped to the dark-theme 20% value)',
  );
  /* Defense in depth: solarized-light must NOT carry the dark-theme 20%
     value (catches a copy/paste mistake during a future palette pass). */
  assert.doesNotMatch(
    block,
    /--group-header-tint-amount:\s*20%/,
    'solarized-light must NOT declare 20% — it is a LIGHT theme; the 3% ceiling is dictated by its own 9-slot AA-headroom math (B-105 §52.3 D-2)',
  );

  /* Cross-check: exactly one `3%` declaration ships file-wide
     (solarized-light only — same invariant b104 T7 already pins, restated
     here so a B-114 regression that drops the override is caught from
     either test file). */
  const allThreePctDecls = (css.match(/--group-header-tint-amount:\s*3%/g) || []).length;
  assert.equal(
    allThreePctDecls,
    1,
    'exactly one --group-header-tint-amount: 3% declaration must ship (solarized-light only)',
  );
});
