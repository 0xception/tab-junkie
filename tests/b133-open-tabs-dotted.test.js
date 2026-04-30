/**
 * b133-open-tabs-dotted.test.js — B-133 R5 (Sprint 40)
 *
 * Authoritative spec: docs/findings/sprint-40.md "[product-manager] — B-133
 * R1 LOCKED" block (AC1, AC4).
 *
 * B-133 visually consolidates the Open Tabs section's left-border indicator
 * with the B-130 floating-tab cue: both ephemeral row variants now render
 * DOTTED in `var(--floating-bar-color)`. Solid-green is reserved for
 * persistent (saved-bookmark, currently-live) rows.
 *
 * Coverage:
 *   T-133-A — `.item-row[data-live-only="true"]` rule body declares BOTH
 *             `border-left-style: dotted` AND
 *             `border-left-color: var(--floating-bar-color)`.
 *   T-133-B — Cross-surface no-op pin: newtab/newtab.css and popup/popup.css
 *             do NOT introduce a left-side `border-left` rule on Open Tabs
 *             rows (newtab uses a right-side dot per B-130; popup uses a
 *             favicon overlay).
 *
 * Strategy: regex-pin source-text assertions on production CSS files
 * (mirrors b124-floating-visual T-124-A and b123-row-alignment patterns).
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
   T-133-A — `.item-row[data-live-only="true"]` re-styles the row's existing
   `border-left` (the live indicator) as DOTTED in `var(--floating-bar-color)`,
   matching the B-130 floating-tab cue.
   ========================================================================= */

test('B-133 T-133-A: `.item-row[data-live-only="true"]` overrides border-left to dotted in --floating-bar-color', () => {
  const css = readFile('sidepanel/sidepanel.css');

  /* The override rule body must declare BOTH border-left-style: dotted
     AND border-left-color: var(--floating-bar-color). */
  const overrideMatch = css.match(/\.item-row\[data-live-only="true"\]\s*\{([^}]*)\}/);
  assert.ok(overrideMatch, '`.item-row[data-live-only="true"]` rule must exist');
  const overrideBody = overrideMatch[1];

  assert.match(
    overrideBody,
    /border-left-style:\s*dotted/,
    'open-tab-row override must declare border-left-style: dotted',
  );
  assert.match(
    overrideBody,
    /border-left-color:\s*var\(--floating-bar-color\)/,
    'open-tab-row override must declare border-left-color: var(--floating-bar-color)',
  );
});

/* =========================================================================
   T-133-B — Cross-surface no-op pin (per R1 LOCKED cross-surface decision):
   newtab and popup do NOT carry a sidepanel-style left-border indicator on
   Open Tabs rows. Newtab uses a right-side `.newtab-indicator-live` dot
   (B-130); popup uses a `.qs-favicon-overlay` (B-130). Regression guard
   prevents accidental re-introduction of a cross-surface left-border.
   ========================================================================= */

test('B-133 T-133-B: newtab + popup CSS do not declare a left-border on Open Tabs rows', () => {
  const newtabCss = readFile('newtab/newtab.css');
  const popupCss = readFile('popup/popup.css');

  /* Neither surface should have any rule that targets `data-live-only` (the
     unique sidepanel discriminator) — those rows do not exist on newtab or
     popup, but the pin guards against accidental cross-surface drift. */
  assert.doesNotMatch(
    newtabCss,
    /\[data-live-only/,
    'newtab/newtab.css must not target [data-live-only] (sidepanel-only discriminator per B-133 R1 LOCKED cross-surface decision)',
  );
  assert.doesNotMatch(
    popupCss,
    /\[data-live-only/,
    'popup/popup.css must not target [data-live-only] (sidepanel-only discriminator per B-133 R1 LOCKED cross-surface decision)',
  );
});
