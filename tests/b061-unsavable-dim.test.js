/**
 * b061-unsavable-dim.test.js — B-061 Dim javascript:/data: rows in Open Tabs.
 *
 * `sidepanel.js` is browser-only with no exports. Following the pattern from
 * `b027-group-header-menu.test.js` and `b028-selection-context-menu.test.js`,
 * the minimal decision logic from `buildOpenTabRow` / `_patchOpenTabRow` is
 * reproduced here so the visual-gating contract can be exercised deterministically.
 *
 * Coverage targets:
 *   - Pattern matches only `javascript:` and `data:` (case-insensitive, colon anchored)
 *   - Pattern does NOT match lookalike / similar schemes
 *   - `data-unsavable` + `title` applied at row-build time
 *   - `data-unsavable` + `title` cleared when a tab navigates away from an unsavable scheme
 *   - Duplicate URL (same scheme as an existing saved item) does NOT mark the row unsavable
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* Import the real helper — single source of truth, colocated with
   ALLOWED_URL_SCHEMES in shared/url.js (B-061 M-1 fix). */
import { isUnsavableScheme } from '../shared/url.js';

// ── Pattern correctness ─────────────────────────────────────────────────────

test('B-061: javascript: URL is unsavable', () => {
  assert.ok(isUnsavableScheme('javascript:alert(1)'));
  assert.ok(isUnsavableScheme('javascript:void(0)'));
  /* Empty body after colon — scheme alone is enough (B-061 L-4). */
  assert.ok(isUnsavableScheme('javascript:'));
});

test('B-061: data: URL is unsavable', () => {
  assert.ok(isUnsavableScheme('data:text/html,<h1>hi</h1>'));
  assert.ok(isUnsavableScheme('data:image/png;base64,iVBOR...'));
  assert.ok(isUnsavableScheme('data:'));
});

test('B-061: scheme match is case-insensitive', () => {
  assert.ok(isUnsavableScheme('JavaScript:alert(1)'));
  assert.ok(isUnsavableScheme('JAVASCRIPT:alert(1)'));
  assert.ok(isUnsavableScheme('Data:text/html,hi'));
  assert.ok(isUnsavableScheme('DATA:text/plain,hi'));
});

test('B-061: http/https URLs are NOT unsavable', () => {
  assert.equal(isUnsavableScheme('https://example.com'), false);
  assert.equal(isUnsavableScheme('http://example.com/path'), false);
});

test('B-061: chrome://, edge://, chrome-extension://, about:, view-source: are NOT unsavable after B-058', () => {
  assert.equal(isUnsavableScheme('chrome://settings'), false);
  assert.equal(isUnsavableScheme('edge://favorites'), false);
  assert.equal(isUnsavableScheme('chrome-extension://abcdef/popup.html'), false);
  assert.equal(isUnsavableScheme('about:blank'), false);
  assert.equal(isUnsavableScheme('view-source:https://example.com'), false);
  assert.equal(isUnsavableScheme('file:///Users/foo/bar.html'), false);
});

test('B-061: lookalike schemes that embed the token are NOT matched (anchored at start, requires colon)', () => {
  // Anchored at start — a path segment named "javascript" is fine
  assert.equal(isUnsavableScheme('https://example.com/javascript:notreal'), false);
  // Missing colon — not a valid URL scheme, not flagged
  assert.equal(isUnsavableScheme('javascript'), false);
  assert.equal(isUnsavableScheme('data'), false);
  // Extended schemes that merely start with the token but differ by colon placement
  assert.equal(isUnsavableScheme('javascripts:foo'), false);
  assert.equal(isUnsavableScheme('database:foo'), false);
});

test('B-061: leading whitespace does NOT match — the SW allowlist is authoritative, UI dim is advisory', () => {
  /* The regex is `^`-anchored and does NOT trim. `new URL('\tjavascript:x')`
     strips leading whitespace and parses as `javascript:`, which the SW then
     rejects via ALLOWED_URL_SCHEMES. Tab Junkie relies on that as the
     authoritative gate — a non-dimmed row here is acceptable. */
  assert.equal(isUnsavableScheme('\tjavascript:alert(1)'), false);
  assert.equal(isUnsavableScheme(' javascript:alert(1)'), false);
  assert.equal(isUnsavableScheme('\ndata:text/html,hi'), false);
});

test('B-061: non-string / empty / null / undefined is NOT unsavable', () => {
  assert.equal(isUnsavableScheme(null), false);
  assert.equal(isUnsavableScheme(undefined), false);
  assert.equal(isUnsavableScheme(''), false);
  assert.equal(isUnsavableScheme(42), false);
  assert.equal(isUnsavableScheme({}), false);
});

// ── DOM contract (what buildOpenTabRow applies) ─────────────────────────────

/**
 * Minimal row-builder + patcher that mirrors the B-061-relevant branches of
 * `buildOpenTabRow` / `_patchOpenTabRow` in sidepanel.js. The stub uses a
 * literal `_attrs` map so `setAttribute` / `removeAttribute` / `getAttribute`
 * round-trip faithfully — matching the real DOM contract where
 * `removeAttribute('title')` makes `getAttribute('title') === null` (not `''`).
 */
function makeRow() {
  return {
    dataset: {},
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    removeAttribute(k) { delete this._attrs[k]; },
    getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; },
  };
}

function buildRow(tab) {
  const row = makeRow();
  if (isUnsavableScheme(tab.url)) {
    row.dataset.unsavable = 'true';
    row.setAttribute('title', 'Cannot be saved \u2014 unsupported URL scheme.');
  }
  return row;
}

function patchRow(row, tab) {
  if (isUnsavableScheme(tab.url)) {
    row.dataset.unsavable = 'true';
    row.setAttribute('title', 'Cannot be saved \u2014 unsupported URL scheme.');
  } else {
    delete row.dataset.unsavable;
    row.removeAttribute('title');
  }
  return row;
}

test('B-061: javascript: tab row is marked data-unsavable and gets the tooltip', () => {
  const row = buildRow({ tabId: 1, url: 'javascript:alert(1)', title: 'evil' });
  assert.equal(row.dataset.unsavable, 'true');
  assert.match(row.getAttribute('title'), /Cannot be saved/);
  assert.match(row.getAttribute('title'), /unsupported URL scheme/);
});

test('B-061: data: tab row is marked data-unsavable and gets the tooltip', () => {
  const row = buildRow({ tabId: 2, url: 'data:text/html,<p>hi</p>', title: 'inline' });
  assert.equal(row.dataset.unsavable, 'true');
  assert.match(row.getAttribute('title'), /Cannot be saved/);
});

test('B-061: https tab row is NOT marked unsavable (no tooltip leak)', () => {
  const row = buildRow({ tabId: 3, url: 'https://example.com', title: 'ok' });
  assert.equal(row.dataset.unsavable, undefined);
  assert.equal(row.getAttribute('title'), null);
});

test('B-061: chrome:// tab row is NOT marked unsavable (B-058 admits it)', () => {
  const row = buildRow({ tabId: 4, url: 'chrome://settings', title: 'settings' });
  assert.equal(row.dataset.unsavable, undefined);
  assert.equal(row.getAttribute('title'), null);
});

test('B-061 patch: tab navigates from javascript: to https → attribute + tooltip cleared', () => {
  const row = buildRow({ tabId: 5, url: 'javascript:void(0)', title: 'x' });
  assert.equal(row.dataset.unsavable, 'true');
  patchRow(row, { tabId: 5, url: 'https://example.com', title: 'x' });
  assert.equal(row.dataset.unsavable, undefined);
  assert.equal(row.getAttribute('title'), null);
});

test('B-061 patch: tab navigates from https to data: → attribute + tooltip applied', () => {
  const row = buildRow({ tabId: 6, url: 'https://example.com', title: 'x' });
  assert.equal(row.dataset.unsavable, undefined);
  patchRow(row, { tabId: 6, url: 'data:text/html,<b>now</b>', title: 'x' });
  assert.equal(row.dataset.unsavable, 'true');
  assert.match(row.getAttribute('title'), /Cannot be saved/);
});

test('B-061: duplicate-URL rows render normally (B-059 owns that interaction)', () => {
  // A duplicate URL is just a valid http(s) URL that happens to match an existing saved item.
  // The B-061 row-build branch does NOT inspect _cachedItems — dimming is ONLY about scheme.
  const row = buildRow({ tabId: 7, url: 'https://example.com/existing-in-saved-items', title: 'dup' });
  assert.equal(row.dataset.unsavable, undefined);
  assert.equal(row.getAttribute('title'), null);
});
