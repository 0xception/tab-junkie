/**
 * b112-header-label-removed.test.js — B-112 R5 regression tests for the
 * removal of the "Tab Junkie" label from the sidepanel header.
 *
 * The browser already shows the extension name in its own chrome (extension
 * popup name + browser side-panel header chrome); the duplicate
 * `<span class="panel-header-title">Tab Junkie</span>` inside the panel
 * wasted vertical space and was removed in B-112.
 *
 * Coverage targets (B-112 acceptance criteria):
 *   AC1 — `<span class="panel-header-title">Tab Junkie</span>` removed from
 *         `sidepanel/sidepanel.html` (regression guard for absence).
 *   AC2 — sibling header affordances (`#filter-input`, `#add-bookmark-btn`,
 *         `#add-group-btn`, `#sidepanel-settings-btn`) remain present in
 *         `#panel-header` after the change.
 *   Bonus — the dead `.panel-header-title` CSS rule is also deleted from
 *         `sidepanel/sidepanel.css` (no orphan selector left in the codebase).
 *
 * Mirrors the file-read + substring/regex inspection pattern established by
 * `tests/b093-import-export-rehome.test.js` for header-DOM regression guards.
 *
 * Test target: 3 net new passing tests.
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

/* Extract the contents of the `#panel-header` element (between the opening
   `<div id="panel-header" ...>` tag and its matching closing `</div>`).
   The closing tag is the one whose nesting balance returns to zero relative
   to the opening div. */
function extractPanelHeaderHtml(html) {
  const openMatch = html.match(/<div\s+id="panel-header"[^>]*>/);
  assert.ok(openMatch, 'sidepanel.html must contain a <div id="panel-header"> element');
  const startIdx = openMatch.index + openMatch[0].length;
  let depth = 1;
  let i = startIdx;
  const tagRegex = /<\/?div\b[^>]*>/g;
  tagRegex.lastIndex = startIdx;
  let m;
  while ((m = tagRegex.exec(html)) !== null) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) {
        i = m.index;
        break;
      }
    } else {
      depth += 1;
    }
  }
  return html.slice(startIdx, i);
}

/* =========================================================================
   T1 — AC1 regression guard: no `.panel-header-title` element and no literal
   "Tab Junkie" text content inside `#panel-header`.
   ========================================================================= */

test('B-112 T1 (AC1): #panel-header contains no .panel-header-title element and no "Tab Junkie" text', () => {
  const html = readFile('sidepanel/sidepanel.html');
  const headerHtml = extractPanelHeaderHtml(html);

  /* No element with class `panel-header-title` anywhere in the header. */
  assert.equal(
    /class="[^"]*\bpanel-header-title\b[^"]*"/.test(headerHtml),
    false,
    'No element with class "panel-header-title" should remain inside #panel-header'
  );

  /* No literal "Tab Junkie" text node inside the header. The substring search
     covers the previously removed `<span class="panel-header-title">Tab Junkie</span>`
     and any equivalent label that might be reintroduced. */
  assert.equal(
    headerHtml.includes('Tab Junkie'),
    false,
    'No "Tab Junkie" text should remain inside #panel-header'
  );

  /* Defensive global guard: the file overall must not reintroduce a
     `.panel-header-title` class anywhere (the rule is dead after B-112). */
  assert.equal(
    /class="[^"]*\bpanel-header-title\b[^"]*"/.test(html),
    false,
    'The class "panel-header-title" must not appear anywhere in sidepanel.html'
  );
});

/* =========================================================================
   T2 — AC2 sibling guard: the four interactive header affordances are
   still present inside `#panel-header` after the label removal.
   ========================================================================= */

test('B-112 T2 (AC2): #filter-input, #add-bookmark-btn, #add-group-btn, #sidepanel-settings-btn all remain inside #panel-header', () => {
  const html = readFile('sidepanel/sidepanel.html');
  const headerHtml = extractPanelHeaderHtml(html);

  for (const id of [
    'filter-input',
    'add-bookmark-btn',
    'add-group-btn',
    'sidepanel-settings-btn',
  ]) {
    assert.ok(
      headerHtml.includes(`id="${id}"`),
      `#${id} must still be present inside #panel-header after the label removal`
    );
  }

  /* `#filter-clear-btn` lives inside `#filter-container` inside the header —
     guard it too so the filter clear-x affordance is not lost. */
  assert.ok(
    headerHtml.includes('id="filter-clear-btn"'),
    '#filter-clear-btn must still be present inside #panel-header after the label removal'
  );
});

/* =========================================================================
   T3 — Dead-CSS guard: the `.panel-header-title` rule is deleted from
   `sidepanel/sidepanel.css`. Prevents an orphan selector from creeping back
   in (the rule had no other consumers — see R1 selector audit).
   ========================================================================= */

test('B-112 T3 (bonus): .panel-header-title CSS rule removed from sidepanel.css', () => {
  const css = readFile('sidepanel/sidepanel.css');
  assert.equal(
    /\.panel-header-title\b/.test(css),
    false,
    'The .panel-header-title selector must not appear anywhere in sidepanel.css'
  );
});
