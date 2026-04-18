/**
 * B-014 — Multi-window awareness & window badge (R5 automated tests)
 *
 * sidepanel.js is a browser-only module with no exports and immediate DOM
 * side-effects on load. The B-014 helpers under test (`_renderWindowBadge`,
 * `_activateWindowFilterChip`, `_applyWindowMapToUI`, `applyFilter`'s
 * window-filter branch, broadcast-handler's `renderAll` vs `_applyWindowMapToUI`
 * dispatch) are reproduced verbatim here with their module-scope `let` state.
 * This is the same strategy used by `tests/b054-sidepanel.test.js` and
 * `tests/b028-selection-context-menu.test.js`. Each reproduced block cites the
 * source line range in sidepanel/sidepanel.js.
 *
 * Coverage targets:
 *  - AC4  badge suppression when rawWindowId === _panelWindowId
 *  - AC8  filter row visibility gated on map.size >= 2
 *  - AC11 window-filter branch hides non-matching rows
 *  - AC12 auto-reset on filtered-window close
 *  - AC17 no full re-render on windowMap broadcast (_applyWindowMapToUI,
 *         not renderAll, is called)
 *  - H-1  `Number(raw) || null` guard: `data-filter-window="0"` sets
 *         `_activeWindowFilter = 0` (not null)
 *  - H-2  renderAll filter preservation: window chip survives a broadcast
 *         that rebuilds the DOM without a text query
 *
 * Cross-references to existing coverage — intentionally NOT duplicated:
 *  - AC1/AC2/AC3: `tests/window-ordinals.test.js`
 *  - AC14: `tests/enriched-list-items.test.js` (MSG_LIST_ITEMS shape)
 *  - H-3 onAttached wiring: `tests/b010-live-state.test.js`
 *    (B-014 H-3 block — patch, broadcast order, cold-start gating,
 *     onDetached transitional semantics)
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim — enough to exercise the reproduced B-014 helpers.
   Mirrors b054-sidepanel.test.js's shape but adds: dataset, hidden, children,
   prepend, insertBefore, removeChild, querySelector(All), contains, remove,
   closest. querySelector(All) supports only the selector forms the B-014
   helpers use ('.class', '[data-attr]', '[data-attr="value"]',
   '[data-attr]:not([data-other])', '#id', 'tagName', and simple conjunctions
   like '.cls[data-x]').
   ========================================================================= */

let _idSeq = 0;

class FakeNode {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.className = '';
    this.textContent = '';
    this._innerHTML = '';
    this.childNodes = [];
    this.parentNode = null;
    this._attrs = {};
    this.dataset = new Proxy(
      {},
      {
        set: (target, key, value) => {
          target[key] = String(value);
          this._attrs['data-' + camelToKebab(key)] = String(value);
          return true;
        },
        deleteProperty: (target, key) => {
          delete target[key];
          delete this._attrs['data-' + camelToKebab(key)];
          return true;
        },
        get: (target, key) => target[key],
        has: (target, key) => key in target,
      },
    );
    this._hidden = false;
    this._uid = ++_idSeq;
  }
  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = !!v; }
  get children() {
    return this.childNodes.filter((n) => n instanceof FakeNode);
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  prepend(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.unshift(child);
    return child;
  }
  insertBefore(child, ref) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx === -1) this.childNodes.push(child);
    else this.childNodes.splice(idx, 0, child);
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  replaceChildren(...args) {
    // Accept a fragment or individual children; matches real DOM semantics.
    for (const c of [...this.childNodes]) this.removeChild(c);
    for (const a of args) {
      if (a instanceof FakeDocumentFragment) {
        for (const child of [...a.childNodes]) this.appendChild(child);
      } else if (a instanceof FakeNode) {
        this.appendChild(a);
      }
    }
  }
  contains(node) {
    if (node === this) return true;
    for (const c of this.childNodes) {
      if (c instanceof FakeNode && c.contains(node)) return true;
    }
    return false;
  }
  closest(selector) {
    let n = this;
    while (n) {
      if (n instanceof FakeNode && matchesSelector(n, selector)) return n;
      n = n.parentNode;
    }
    return null;
  }
  querySelector(selector) {
    return walk(this, selector, true);
  }
  querySelectorAll(selector) {
    const out = [];
    walk(this, selector, false, out);
    return out;
  }
  get isConnected() {
    // A node is connected when it descends from the root element.
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === rootDoc.documentElement || n === rootDoc;
  }
}

class FakeDocumentFragment {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) this.childNodes.splice(idx, 1);
    child.parentNode = null;
    return child;
  }
}

function camelToKebab(s) {
  return s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/* Match a trivial subset of CSS selectors used by B-014 helpers:
 *  - 'tag'
 *  - '.class'
 *  - '#id'
 *  - '[data-attr]'
 *  - '[data-attr="value"]'
 *  - '[role="tab"]'
 *  - conjunctions: 'tag.class', '.class[data-x]', '[data-a][data-b]',
 *    '[data-a]:not([data-b])', '[data-a]:not([data-b="value"])'
 *  - descendant combinator with single space (walkerd)
 */
function matchesSelector(node, selector) {
  // Split on top-level spaces — we handle the simple-compound case only.
  // Caller handles descendant walk by feeding compound tokens here.
  const compound = selector.trim();
  // Decompose into simple parts: tag? (#id)? (.class)* ([attr...])* (:not(...))?
  const notMatch = compound.match(/:not\(([^)]+)\)/);
  const notSel = notMatch ? notMatch[1] : null;
  const stripped = notMatch ? compound.replace(notMatch[0], '') : compound;

  let rest = stripped;
  // tag
  const tagMatch = rest.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (tagMatch) {
    if (node.tagName !== tagMatch[1].toUpperCase()) return false;
    rest = rest.slice(tagMatch[0].length);
  }
  // id
  const idMatch = rest.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/);
  if (idMatch) {
    if (node._attrs.id !== idMatch[1]) return false;
    rest = rest.replace(idMatch[0], '');
  }
  // classes
  const classMatches = [...rest.matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)];
  for (const cm of classMatches) {
    const needed = cm[1];
    const classes = (node.className || '').split(/\s+/);
    if (!classes.includes(needed)) return false;
  }
  rest = rest.replace(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g, '');
  // attributes
  const attrMatches = [...rest.matchAll(/\[([a-zA-Z][a-zA-Z0-9-]*)(?:="([^"]*)")?\]/g)];
  for (const am of attrMatches) {
    const attrName = am[1];
    const expected = am[2];
    const actual = node._attrs[attrName];
    if (actual == null) return false;
    if (expected !== undefined && actual !== expected) return false;
  }

  if (notSel && matchesSelector(node, notSel)) return false;
  return true;
}

function walk(root, selector, firstOnly, acc) {
  // Support single ' ' (descendant) combinator: 'parent child' — walks children
  // only filtered by the rightmost compound.
  const terms = selector.split(/\s+/);
  const lastTerm = terms[terms.length - 1];
  const stack = [...root.childNodes];
  while (stack.length) {
    const n = stack.shift();
    if (n instanceof FakeNode) {
      if (matchesSelector(n, lastTerm)) {
        if (firstOnly) return n;
        acc.push(n);
      }
      stack.unshift(...n.childNodes);
    }
  }
  return firstOnly ? null : acc;
}

const rootDoc = {
  createElement(tag) {
    const n = new FakeNode(tag);
    return n;
  },
  createTextNode(text) {
    const n = new FakeNode('#text');
    n.textContent = String(text);
    return n;
  },
  createDocumentFragment() {
    return new FakeDocumentFragment();
  },
  documentElement: null,
};

/* =========================================================================
   Setup a rebuilt fake document per test. All helpers below reference
   `document` through a module-local alias (`doc`) so we can swap bodies
   between tests.
   ========================================================================= */

let doc = rootDoc;
let itemListEl;
let windowFilterRowEl;

function resetDom() {
  _idSeq = 0;
  rootDoc.documentElement = new FakeNode('html');
  const body = new FakeNode('body');
  rootDoc.documentElement.appendChild(body);
  itemListEl = new FakeNode('ul');
  itemListEl._attrs.id = 'item-list';
  windowFilterRowEl = new FakeNode('div');
  windowFilterRowEl._attrs.id = 'window-filter-row';
  windowFilterRowEl.hidden = true;
  body.appendChild(itemListEl);
  body.appendChild(windowFilterRowEl);
}

/* =========================================================================
   Reproduced module state (sidepanel.js lines 144–149)
   ========================================================================= */

let _windowOrdinalMap = {};
let _panelWindowId = null;
let _activeWindowFilter = null;
let _filterQuery = '';
let _cachedLiveStates = {};

const ITEM_WINDOW_BADGE_CLASS = 'item-window-badge';
const OPEN_TAB_WINDOW_BADGE_CLASS = 'open-tab-window-badge';

function resetB014State() {
  _windowOrdinalMap = {};
  _panelWindowId = null;
  _activeWindowFilter = null;
  _filterQuery = '';
  _cachedLiveStates = {};
}

/* =========================================================================
   Reproduced: _windowOrdinalLabel  (sidepanel.js lines 1337–1341)
   ========================================================================= */

function _windowOrdinalLabel(rawWindowId) {
  const ord = _windowOrdinalMap[String(rawWindowId)];
  if (typeof ord === 'number') return { label: 'W' + ord, aria: 'Window ' + ord };
  return { label: 'W' + rawWindowId, aria: 'Window ' + rawWindowId };
}

/* =========================================================================
   Reproduced: _renderWindowBadge  (sidepanel.js lines 1359–1377)
   ========================================================================= */

function _renderWindowBadge(indicatorsEl, rawWindowId, badgeClass) {
  if (!indicatorsEl) return;
  const suppress = rawWindowId == null
    || (_panelWindowId != null && rawWindowId === _panelWindowId);
  const existing = indicatorsEl.querySelector('.' + badgeClass);
  if (suppress) {
    if (existing) existing.remove();
    return;
  }
  const { label, aria } = _windowOrdinalLabel(rawWindowId);
  let badge = existing;
  if (!badge) {
    badge = doc.createElement('span');
    badge.className = badgeClass;
    indicatorsEl.prepend(badge);
  }
  if (badge.textContent !== label) badge.textContent = label;
  badge.setAttribute('aria-label', aria);
}

/* =========================================================================
   Reproduced: _rebuildWindowFilterRow  (sidepanel.js lines 1933–1981)
   ========================================================================= */

function _rebuildWindowFilterRow() {
  if (!windowFilterRowEl) return;

  const entries = Object.entries(_windowOrdinalMap)
    .map(([rawId, ordinal]) => [Number(rawId), ordinal])
    .filter(([rawId]) => Number.isFinite(rawId))
    .sort((a, b) => a[1] - b[1]);

  if (entries.length < 2) {
    windowFilterRowEl.hidden = true;
    windowFilterRowEl.replaceChildren();
    if (_activeWindowFilter !== null) {
      _activeWindowFilter = null;
      applyFilter();
    }
    return;
  }

  windowFilterRowEl.hidden = false;

  const fragment = doc.createDocumentFragment();

  const allChip = doc.createElement('button');
  allChip._attrs.type = 'button';
  allChip.className = 'window-filter-chip';
  allChip.setAttribute('role', 'tab');
  allChip.dataset.filterWindow = 'all';
  allChip.textContent = 'All windows';
  const isAll = _activeWindowFilter === null;
  allChip.setAttribute('aria-selected', String(isAll));
  allChip._attrs.tabindex = isAll ? '0' : '-1';
  fragment.appendChild(allChip);

  for (const [rawId, ordinal] of entries) {
    const chip = doc.createElement('button');
    chip._attrs.type = 'button';
    chip.className = 'window-filter-chip';
    chip.setAttribute('role', 'tab');
    chip.dataset.filterWindow = String(rawId);
    chip.textContent = 'W' + ordinal;
    chip.setAttribute('aria-label', 'Window ' + ordinal);
    const selected = _activeWindowFilter === rawId;
    chip.setAttribute('aria-selected', String(selected));
    chip._attrs.tabindex = selected ? '0' : '-1';
    fragment.appendChild(chip);
  }

  windowFilterRowEl.replaceChildren(fragment);
}

/* =========================================================================
   Reproduced: _activateWindowFilterChip  (sidepanel.js lines 1987–2000)
   ========================================================================= */

function _activateWindowFilterChip(chip) {
  if (!chip || !windowFilterRowEl) return;
  const raw = chip.dataset.filterWindow;
  /* B-014 H-1: `Number(raw) || null` silently coerces windowId 0 to null (falsy).
     Use an explicit finite-number guard so a real windowId=0 survives. */
  _activeWindowFilter = raw === 'all' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : null);

  for (const c of windowFilterRowEl.querySelectorAll('[role="tab"]')) {
    const selected = c === chip;
    c.setAttribute('aria-selected', String(selected));
    c._attrs.tabindex = selected ? '0' : '-1';
  }
  applyFilter();
}

/* =========================================================================
   Reproduced (simplified): window-filter branch of applyFilter
   (sidepanel.js lines 627–667). The text-filter and highlight paths are out
   of scope for B-014 tests.
   ========================================================================= */

let _applyFilterCallCount = 0;

function applyFilter() {
  _applyFilterCallCount++;

  // B-014 AC11 window-filter branch: short-circuit when _activeWindowFilter
  // is null so text-filter tests aren't affected.
  if (_activeWindowFilter === null) {
    // When no window filter is active, un-hide any rows we previously hid.
    for (const row of itemListEl.querySelectorAll('[data-item-id]')) {
      row.hidden = false;
    }
    for (const row of itemListEl.querySelectorAll('[data-tab-id]')) {
      row.hidden = false;
    }
    return;
  }

  const wanted = String(_activeWindowFilter);

  // Saved-item rows.
  for (const row of itemListEl.querySelectorAll('[data-item-id]:not([data-live-only])')) {
    if (row.hidden) continue;
    const rowWin = row.dataset.windowId;
    if (!rowWin || rowWin !== wanted) {
      row.hidden = true;
    }
  }

  // Open-tab rows.
  for (const row of itemListEl.querySelectorAll('[data-tab-id]')) {
    if (row.hidden) continue;
    if (row.dataset.windowId !== wanted) {
      row.hidden = true;
    }
  }
}

/* =========================================================================
   Reproduced: _applyWindowMapToUI  (sidepanel.js lines 1885–1927).
   Spy hooks on `renderAll` (never called) and on an internal patch counter
   verify AC17 in tests.
   ========================================================================= */

let _renderAllCallCount = 0;
function renderAll() { _renderAllCallCount++; }

function _patchItemWindowBadge(row, live) {
  if (!row.isConnected) return;
  const rawWindowId = live?.live ? live.windowId : null;
  const willShow = rawWindowId != null
    && (_panelWindowId == null || rawWindowId !== _panelWindowId);
  let indicators = row.querySelector('.item-indicators');
  if (willShow && !indicators) {
    indicators = doc.createElement('div');
    indicators.className = 'item-indicators';
    row.appendChild(indicators);
  }
  if (indicators) {
    _renderWindowBadge(indicators, rawWindowId, ITEM_WINDOW_BADGE_CLASS);
    if (indicators.children.length === 0) indicators.remove();
  }
}

function _applyWindowMapToUI() {
  _rebuildWindowFilterRow();

  for (const row of itemListEl.querySelectorAll('[data-item-id]:not([data-live-only])')) {
    const id = row.dataset.itemId;
    const live = _cachedLiveStates[id];
    if (live?.live && live?.windowId != null) {
      row.dataset.windowId = String(live.windowId);
    } else {
      delete row.dataset.windowId;
    }
    _patchItemWindowBadge(row, live);
  }
  for (const row of itemListEl.querySelectorAll('[data-live-only="true"][data-tab-id]')) {
    const raw = Number(row.dataset.windowId);
    if (!Number.isFinite(raw)) continue;
    let indicators = row.querySelector('.item-indicators');
    const willShow = _panelWindowId == null || raw !== _panelWindowId;
    if (willShow && !indicators) {
      indicators = doc.createElement('div');
      indicators.className = 'item-indicators';
      row.appendChild(indicators);
    }
    if (indicators) {
      _renderWindowBadge(indicators, raw, OPEN_TAB_WINDOW_BADGE_CLASS);
      if (indicators.children.length === 0) indicators.remove();
    }
  }

  /* AC12: if the currently-filtered window has closed, reset and re-apply. */
  if (_activeWindowFilter !== null) {
    const key = String(_activeWindowFilter);
    if (!Object.prototype.hasOwnProperty.call(_windowOrdinalMap, key)) {
      _activeWindowFilter = null;
      applyFilter();
    }
  }
}

/* =========================================================================
   Reproduced: renderAll's post-rebuild filter re-application
   (sidepanel.js line 1050). Models H-2's branch only.
   ========================================================================= */

function renderAllPostRebuild() {
  /* B-014 H-2: window chip must be re-applied even when no text query. */
  if (_filterQuery || _activeWindowFilter !== null) applyFilter();
}

/* =========================================================================
   Test helpers
   ========================================================================= */

function addSavedRow(itemId, { windowId } = {}) {
  const row = doc.createElement('li');
  row.className = 'item-row';
  row.dataset.itemId = itemId;
  if (windowId != null) row.dataset.windowId = String(windowId);
  itemListEl.appendChild(row);
  return row;
}

function addOpenTabRow(tabId, { windowId }) {
  const row = doc.createElement('li');
  row.className = 'item-row';
  row.dataset.liveOnly = 'true';
  row.dataset.tabId = String(tabId);
  row.dataset.windowId = String(windowId);
  row.dataset.live = 'true';
  itemListEl.appendChild(row);
  return row;
}

function getChip(filterWindowValue) {
  return windowFilterRowEl.querySelectorAll(
    '[data-filter-window="' + filterWindowValue + '"]',
  )[0];
}

/* =========================================================================
   Fresh state before each test
   ========================================================================= */

beforeEach(() => {
  resetDom();
  resetB014State();
  _applyFilterCallCount = 0;
  _renderAllCallCount = 0;
});

/* =========================================================================
   AC4 — badge suppression when rawWindowId === _panelWindowId
   ========================================================================= */

test('B-014 AC4: badge suppressed when rawWindowId === _panelWindowId', () => {
  _panelWindowId = 100;
  _windowOrdinalMap = { '100': 1, '200': 2 };

  const indicators = doc.createElement('div');
  indicators.className = 'item-indicators';

  // Same-window: must render nothing.
  _renderWindowBadge(indicators, 100, ITEM_WINDOW_BADGE_CLASS);
  assert.equal(
    indicators.querySelector('.' + ITEM_WINDOW_BADGE_CLASS),
    null,
    'AC4: no badge for same-window item',
  );
});

test('B-014 AC4: badge rendered when rawWindowId !== _panelWindowId', () => {
  _panelWindowId = 100;
  _windowOrdinalMap = { '100': 1, '200': 2 };

  const indicators = doc.createElement('div');
  indicators.className = 'item-indicators';

  _renderWindowBadge(indicators, 200, ITEM_WINDOW_BADGE_CLASS);
  const badge = indicators.querySelector('.' + ITEM_WINDOW_BADGE_CLASS);
  assert.ok(badge, 'badge exists');
  assert.equal(badge.textContent, 'W2', 'badge uses ordinal not raw id');
  assert.equal(badge.getAttribute('aria-label'), 'Window 2');
});

test('B-014 AC4: badge removed when live.windowId changes to match _panelWindowId', () => {
  _panelWindowId = 100;
  _windowOrdinalMap = { '100': 1, '200': 2 };

  const indicators = doc.createElement('div');
  indicators.className = 'item-indicators';

  _renderWindowBadge(indicators, 200, ITEM_WINDOW_BADGE_CLASS);
  assert.ok(indicators.querySelector('.' + ITEM_WINDOW_BADGE_CLASS));

  // Tab moved into the panel's window → badge must vanish.
  _renderWindowBadge(indicators, 100, ITEM_WINDOW_BADGE_CLASS);
  assert.equal(
    indicators.querySelector('.' + ITEM_WINDOW_BADGE_CLASS),
    null,
    'AC4: badge removed after windowId now matches panel',
  );
});

test('B-014: badge falls back to raw id when ordinal not yet mapped', () => {
  // Pre-broadcast race: map hasn't arrived yet.
  _panelWindowId = 100;
  _windowOrdinalMap = {};

  const indicators = doc.createElement('div');
  indicators.className = 'item-indicators';
  _renderWindowBadge(indicators, 777, ITEM_WINDOW_BADGE_CLASS);
  const badge = indicators.querySelector('.' + ITEM_WINDOW_BADGE_CLASS);
  assert.ok(badge, 'badge rendered even pre-map');
  assert.equal(badge.textContent, 'W777', 'raw id fallback used');
});

test('B-014: rawWindowId null/undefined suppresses badge', () => {
  _panelWindowId = 100;
  _windowOrdinalMap = { '100': 1 };

  const indicators = doc.createElement('div');
  indicators.className = 'item-indicators';
  _renderWindowBadge(indicators, null, ITEM_WINDOW_BADGE_CLASS);
  _renderWindowBadge(indicators, undefined, ITEM_WINDOW_BADGE_CLASS);
  assert.equal(indicators.childNodes.length, 0);
});

/* =========================================================================
   AC8 — filter row visibility gated on map.size >= 2
   ========================================================================= */

test('B-014 AC8: filter row hidden when < 2 windows (single window)', () => {
  _windowOrdinalMap = { '100': 1 };
  _rebuildWindowFilterRow();
  assert.equal(windowFilterRowEl.hidden, true, 'row hidden with 1 window');
  assert.equal(windowFilterRowEl.childNodes.length, 0, 'no chips rendered');
});

test('B-014 AC8: filter row hidden when 0 windows tracked', () => {
  _windowOrdinalMap = {};
  _rebuildWindowFilterRow();
  assert.equal(windowFilterRowEl.hidden, true);
});

test('B-014 AC8: filter row shown when >= 2 windows', () => {
  _windowOrdinalMap = { '100': 1, '200': 2 };
  _rebuildWindowFilterRow();
  assert.equal(windowFilterRowEl.hidden, false, 'row visible with 2 windows');

  const chips = windowFilterRowEl.querySelectorAll('[role="tab"]');
  assert.equal(chips.length, 3, 'All + W1 + W2 chips');
  assert.equal(chips[0].dataset.filterWindow, 'all');
  assert.equal(chips[1].dataset.filterWindow, '100');
  assert.equal(chips[2].dataset.filterWindow, '200');
});

test('B-014 AC8: chips are rendered in ordinal-ascending order regardless of rawId order', () => {
  // Raw ids in reverse ordinal order should NOT affect the render order.
  _windowOrdinalMap = { '500': 1, '100': 2, '300': 3 };
  _rebuildWindowFilterRow();
  const chips = windowFilterRowEl.querySelectorAll('[role="tab"]');
  assert.equal(chips[1].textContent, 'W1');
  assert.equal(chips[1].dataset.filterWindow, '500');
  assert.equal(chips[2].textContent, 'W2');
  assert.equal(chips[3].textContent, 'W3');
});

/* =========================================================================
   AC11 — window-filter branch hides non-matching rows
   ========================================================================= */

test('B-014 AC11: selecting W2 hides saved-item rows whose data-window-id !== W2 rawId', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();

  const rowA = addSavedRow('item-a', { windowId: 10 });
  const rowB = addSavedRow('item-b', { windowId: 20 });
  const rowC = addSavedRow('item-c', { windowId: 10 });

  _activateWindowFilterChip(getChip('20'));

  assert.equal(rowA.hidden, true, 'W1 row hidden');
  assert.equal(rowB.hidden, false, 'W2 row visible');
  assert.equal(rowC.hidden, true, 'W1 row hidden');
});

test('B-014 AC11: selecting specific window hides saved-item rows with NO data-window-id', () => {
  // Items with no live claim (no data-window-id) are window-agnostic and
  // must be hidden under any specific-window filter.
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();

  const live = addSavedRow('live-item', { windowId: 10 });
  const noClaim = addSavedRow('no-claim-item', {}); // no windowId

  _activateWindowFilterChip(getChip('10'));

  assert.equal(live.hidden, false, 'claimed row in W1 visible');
  assert.equal(noClaim.hidden, true, 'unclaimed row hidden under specific-window filter');
});

test('B-014 AC11: open-tab rows filtered by data-window-id', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();

  const t1 = addOpenTabRow(101, { windowId: 10 });
  const t2 = addOpenTabRow(102, { windowId: 20 });
  const t3 = addOpenTabRow(103, { windowId: 10 });

  _activateWindowFilterChip(getChip('20'));

  assert.equal(t1.hidden, true);
  assert.equal(t2.hidden, false);
  assert.equal(t3.hidden, true);
});

test('B-014 AC11: selecting "All" restores visibility', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();

  const rowA = addSavedRow('item-a', { windowId: 10 });
  const rowB = addSavedRow('item-b', { windowId: 20 });

  _activateWindowFilterChip(getChip('20'));
  assert.equal(rowA.hidden, true);

  _activateWindowFilterChip(getChip('all'));
  assert.equal(_activeWindowFilter, null);
  assert.equal(rowA.hidden, false, 'row visible after "All"');
  assert.equal(rowB.hidden, false);
});

/* =========================================================================
   AC12 — auto-reset on filtered-window close
   ========================================================================= */

test('B-014 AC12: _activeWindowFilter resets to null when filtered window closes', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();
  _activateWindowFilterChip(getChip('20'));
  assert.equal(_activeWindowFilter, 20);

  // Simulate W2 closing — broadcast arrives with new map without '20'.
  _windowOrdinalMap = { '10': 1 };
  _applyWindowMapToUI();

  assert.equal(_activeWindowFilter, null, 'AC12: auto-reset when filtered window removed');
});

test('B-014 AC12: filter stays intact when filtered window still present', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();
  _activateWindowFilterChip(getChip('20'));

  // A different window closes — '20' still present.
  _windowOrdinalMap = { '20': 2, '30': 3 };
  _applyWindowMapToUI();

  assert.equal(_activeWindowFilter, 20, 'filter retained');
});

test('B-014 AC12: _rebuildWindowFilterRow resets filter when map drops below 2', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();
  _activateWindowFilterChip(getChip('20'));
  assert.equal(_activeWindowFilter, 20);

  // Close W1 — only one window left; row hides and filter auto-resets.
  _windowOrdinalMap = { '20': 2 };
  _rebuildWindowFilterRow();

  assert.equal(windowFilterRowEl.hidden, true, 'filter row hides with <2 windows');
  assert.equal(_activeWindowFilter, null, 'filter auto-reset on row hide');
});

/* =========================================================================
   AC17 — no full re-render on windowMap broadcast
   Spy-based: _applyWindowMapToUI MUST NOT call renderAll.
   ========================================================================= */

test('B-014 AC17: _applyWindowMapToUI never calls renderAll', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _panelWindowId = 10;
  _cachedLiveStates = {
    'item-a': { live: true, windowId: 20 },
    'item-b': { live: false },
  };
  addSavedRow('item-a', { windowId: 20 });
  addSavedRow('item-b', {});

  _applyWindowMapToUI();

  assert.equal(_renderAllCallCount, 0, 'AC17: renderAll NOT called on windowMap-only path');
});

test('B-014 AC17: _applyWindowMapToUI patches badges in-place (no DOM rebuild)', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _panelWindowId = 10;
  _cachedLiveStates = {
    'item-a': { live: true, windowId: 20 },
  };
  const row = addSavedRow('item-a', { windowId: 20 });

  _applyWindowMapToUI();

  const badge = row.querySelector('.' + ITEM_WINDOW_BADGE_CLASS);
  assert.ok(badge, 'badge appended');
  assert.equal(badge.textContent, 'W2');
  assert.equal(_renderAllCallCount, 0);
});

/* =========================================================================
   H-1 regression — `Number(raw) || null` guard.
   `data-filter-window="0"` must set `_activeWindowFilter = 0`, NOT null.
   ========================================================================= */

test('B-014 H-1: chip with data-filter-window="0" sets _activeWindowFilter=0 (not null)', () => {
  // Manually install a chip whose windowId == 0 — the production bug would
  // hit when a window with raw id 0 ever existed. (Chrome never issues id 0
  // today; the fix makes the contract unconditional.)
  _windowOrdinalMap = { '0': 1, '5': 2 };
  _rebuildWindowFilterRow();

  const chipZero = getChip('0');
  assert.ok(chipZero, 'chip with data-filter-window="0" exists');

  _activateWindowFilterChip(chipZero);

  assert.equal(_activeWindowFilter, 0, 'H-1: windowId 0 survives the guard');
  assert.notEqual(_activeWindowFilter, null, 'H-1: NOT coerced to null');
});

test('B-014 H-1: chip with data-filter-window="all" sets _activeWindowFilter=null', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();
  _activateWindowFilterChip(getChip('all'));
  assert.equal(_activeWindowFilter, null);
});

test('B-014 H-1: malformed data-filter-window falls back to null', () => {
  // Defensive: unexpected non-numeric value.
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();

  const fakeChip = doc.createElement('button');
  fakeChip.setAttribute('role', 'tab');
  fakeChip.dataset.filterWindow = 'garbage';
  windowFilterRowEl.appendChild(fakeChip);

  _activateWindowFilterChip(fakeChip);
  assert.equal(_activeWindowFilter, null, 'non-finite parse falls back to null');
});

/* =========================================================================
   H-2 regression — renderAll filter preservation.
   After a broadcast-driven DOM rebuild with no text query, a pending window
   chip MUST still apply its filter (otherwise rows visually "unfilter" while
   the chip stays selected).
   ========================================================================= */

test('B-014 H-2: renderAll post-rebuild re-applies window filter even with empty _filterQuery', () => {
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();
  _activateWindowFilterChip(getChip('20'));
  // _activeWindowFilter === 20, _filterQuery === ''

  _applyFilterCallCount = 0; // reset spy after activation's own applyFilter call

  renderAllPostRebuild();

  assert.equal(_applyFilterCallCount, 1, 'H-2: applyFilter called on rebuild');
});

test('B-014 H-2: renderAll post-rebuild with no filter + no query skips applyFilter (baseline)', () => {
  _activeWindowFilter = null;
  _filterQuery = '';
  _applyFilterCallCount = 0;

  renderAllPostRebuild();

  assert.equal(_applyFilterCallCount, 0, 'no call when neither filter active');
});

test('B-014 H-2: renderAll post-rebuild runs applyFilter when only text query present (unchanged pre-H-2 behaviour)', () => {
  _activeWindowFilter = null;
  _filterQuery = 'hello';
  _applyFilterCallCount = 0;

  renderAllPostRebuild();

  assert.equal(_applyFilterCallCount, 1);
});

test('B-014 H-2: window filter survives a simulated broadcast-driven rebuild', () => {
  // End-to-end scenario: user picks W2, then a broadcast rebuilds DOM without
  // _filterQuery. After the rebuild, the rows must still be filtered to W2.
  _windowOrdinalMap = { '10': 1, '20': 2 };
  _rebuildWindowFilterRow();
  _activateWindowFilterChip(getChip('20'));

  // Simulate a broadcast arriving that rebuilt rows (they are all un-hidden).
  const rowA = addSavedRow('item-a', { windowId: 10 });
  const rowB = addSavedRow('item-b', { windowId: 20 });
  rowA.hidden = false;
  rowB.hidden = false;

  renderAllPostRebuild();

  assert.equal(rowA.hidden, true, 'H-2: non-matching row re-hidden after rebuild');
  assert.equal(rowB.hidden, false, 'H-2: matching row visible');
});
