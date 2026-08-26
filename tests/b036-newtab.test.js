/**
 * b036-newtab.test.js — B-036 New Tab Page R5 automated coverage.
 *
 * Authoritative spec: docs/design/42-b-036-newtab-page.md + BACKLOG.md B-036
 * AC1-AC23.
 *
 * Strategy (mirrors B-054 / B-022 precedents — sidepanel.js and popup.js are
 * DOM-bound modules with no exports; their pure helpers get reproduced in
 * test files for direct assertion):
 *
 *   (1) A lightweight DOM shim (installed before module import) provides
 *       enough `document` + `window` surface that newtab.js can boot.
 *       Real modules under test — buildIndex/search/diffAndPatch,
 *       buildHighlightedText, isSafeFaviconUrl, SCOPE, messages — are
 *       imported verbatim so any drift in those boundaries surfaces here.
 *   (2) chrome.* is stubbed per-test — newtab.js calls chrome.runtime.
 *       sendMessage, chrome.search.query, chrome.runtime.onMessage.
 *       addListener, chrome.sidePanel.open, chrome.windows.getCurrent.
 *       Tests assert the call shape (C-11 fire-and-forget on the click
 *       path is the most critical guardrail).
 *   (3) Each test resets module state by re-importing fresh — we do not
 *       share state across tests to avoid cross-contamination (module-
 *       scope singletons in newtab.js).
 *
 * AC coverage map:
 *   AC1  manifest wiring unchanged                — verified via b036-manifest assertion below
 *   AC2  pref-OFF gate                             — RESCINDED (B-039 dropped at S29 close; the newtab is always on)
 *   AC3  grid renders unconditionally              — automated
 *   AC4  storage bootstrap sequence (skeleton)     — automated
 *   AC5  web-search submit → chrome.search.query   — automated
 *   AC6  group sections render in order            — automated
 *   AC7  filter debounce + highlight               — automated
 *   AC8  live-state indicators                     — automated
 *   AC9  MSG_STATE_CHANGED subscription            — automated
 *   AC10 click → MSG_NAVIGATE_TO_ITEM (C-11)       — automated (load-bearing)
 *   AC11 keyboard focus on boot                    — automated
 *   AC12 empty state: zero items                   — automated
 *   AC13 empty state: ungrouped items              — automated
 *   AC14 empty state: filter-zero-matches          — automated
 *   AC15 partial search input no-ops               — automated
 *   AC16 bootstrap error state                     — automated
 *   AC17 perf budget (render time)                 — automated (synthetic)
 *   AC18 perf budget (filter time)                 — automated (synthetic)
 *   AC19 ARIA roles                                — automated (static HTML assertions)
 *   AC20 focus indicators                          — UAT (real CSS paint)
 *   AC21 theme tokens                              — automated (CSS variable assertions)
 *   AC22 no new permissions                        — automated (manifest grep)
 *   AC23 SW cold-start                             — covered by skeleton assertion
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { __resetMock } from './chrome-mock.js';

/* =========================================================================
   Static markup / manifest assertions (AC1, AC19, AC21, AC22)
   ========================================================================= */

const MANIFEST_JSON = readFileSync(
  new URL('../manifest.json', import.meta.url),
  'utf8',
);
const NEWTAB_HTML = readFileSync(
  new URL('../newtab/newtab.html', import.meta.url),
  'utf8',
);
const NEWTAB_CSS = readFileSync(
  new URL('../newtab/newtab.css', import.meta.url),
  'utf8',
);
/* B-037 §45.3 D-3: theme palette tokens moved to shared/themes.css. The
   newtab page imports it via <link> in newtab.html; AC21 token-presence
   assertions now read this consolidated stylesheet. */
const SHARED_THEMES_CSS = readFileSync(
  new URL('../shared/themes.css', import.meta.url),
  'utf8',
);
const NEWTAB_HTML_FOR_LINK = NEWTAB_HTML;
const NEWTAB_JS = readFileSync(
  new URL('../newtab/newtab.js', import.meta.url),
  'utf8',
);

test('B-036 AC1: manifest chrome_url_overrides.newtab still points to newtab/newtab.html', () => {
  const manifest = JSON.parse(MANIFEST_JSON);
  assert.equal(
    manifest.chrome_url_overrides?.newtab,
    'newtab/newtab.html',
    'chrome_url_overrides.newtab must remain "newtab/newtab.html" (AC1 blocking).',
  );
  assert.deepEqual(
    Object.keys(manifest.chrome_url_overrides || {}),
    ['newtab'],
    'No additional chrome_url_overrides entries allowed (AC1 blocking).',
  );
});

test('B-036 AC22 (B-164 §69.3.3 update): manifest permissions = S29 baseline + favicon + idle', () => {
  /* Pre-B-159 the pin was `['tabs','tabGroups','storage','sidePanel','search']`
     (S29 baseline). B-159 §B added the `favicon` permission for Chrome's
     `_favicon` API URL helper. B-164 §69.3.3 adds the `idle` permission
     for on-wake claim repair via chrome.idle.onStateChanged (the smallest-
     scope chrome permission that delivers a SW-wake signal on OS-display
     'active' transition). Updated to the new baseline. */
  const manifest = JSON.parse(MANIFEST_JSON);
  assert.deepEqual(
    manifest.permissions,
    ['tabs', 'tabGroups', 'storage', 'sidePanel', 'search', 'favicon', 'idle'],
    'Permissions array must remain exactly ["tabs","tabGroups","storage","sidePanel","search","favicon","idle"].',
  );
});

test('B-036 AC19: newtab.html declares the required ARIA roles', () => {
  assert.match(NEWTAB_HTML, /role="main"/, 'root container needs role="main"');
  assert.match(NEWTAB_HTML, /role="search"/, 'web-search form needs role="search"');
  assert.match(NEWTAB_HTML, /role="searchbox"/, 'filter input needs role="searchbox"');
  assert.match(NEWTAB_HTML, /role="region"/, 'grid container needs role="region"');
  assert.match(NEWTAB_HTML, /aria-live="polite"/, 'grid + empty state need aria-live="polite"');
  assert.match(NEWTAB_HTML, /role="alert"/, 'error state needs role="alert"');
  assert.match(NEWTAB_HTML, /aria-label="Search the web"/, 'web-search input aria-label');
  assert.match(NEWTAB_HTML, /aria-label="Filter bookmarks"/, 'filter input aria-label');
});

test('B-036 AC21 (post-B-037): theme palette tokens are sourced from shared/themes.css and linked from newtab.html', () => {
  /* B-037 §45.3 D-3 consolidated all `[data-theme="…"]` palette blocks into
     shared/themes.css. The newtab page imports it via <link> BEFORE
     newtab.css so palette tokens resolve before component rules consume
     them. AC21 originally checked these tokens in newtab.css; the locked
     contract is now: tokens exist in shared/themes.css + the link is wired. */
  assert.match(SHARED_THEMES_CSS, /\[data-theme="system"\]/, 'system theme block');
  assert.match(SHARED_THEMES_CSS, /\[data-theme="light"\]/, 'legacy light-theme alias');
  assert.match(SHARED_THEMES_CSS, /\[data-theme="dark"\]/, 'legacy dark-theme alias');
  assert.match(SHARED_THEMES_CSS, /--bg-primary:/, '--bg-primary token');
  assert.match(SHARED_THEMES_CSS, /--text-primary:/, '--text-primary token');
  assert.match(SHARED_THEMES_CSS, /--accent:/, '--accent token');
  assert.match(SHARED_THEMES_CSS, /--focus-ring:/, '--focus-ring token');
  assert.match(SHARED_THEMES_CSS, /--mark-bg:/, '--mark-bg token');
  assert.match(SHARED_THEMES_CSS, /--live-indicator:/, '--live-indicator token');
  assert.match(SHARED_THEMES_CSS, /--drifted-color:/, '--drifted-color token');
  /* newtab.html must import shared/themes.css via <link>. */
  assert.match(NEWTAB_HTML_FOR_LINK, /href="\.\.\/shared\/themes\.css"/, 'newtab.html must <link> shared/themes.css');
  /* newtab.css MUST NOT carry palette blocks any more. */
  assert.doesNotMatch(NEWTAB_CSS, /\[data-theme=/, 'newtab.css must NOT contain `[data-theme=` palette selectors');
});

test('B-036 §42.3 D-1: newtab.js does NOT import sidepanel/sidepanel.js', () => {
  /* The whole rationale for D-1 (vanilla DOM + selective shared helpers) is
     that newtab.js does NOT pull in the 6 879-LOC sidepanel module. Pin the
     invariant here. */
  assert.doesNotMatch(
    NEWTAB_JS,
    /from ['"]\.\.\/sidepanel\/sidepanel\.js['"]/,
    'newtab.js must not import sidepanel/sidepanel.js (D-1 isolation).',
  );
  /* search-index.js is the ONE sidepanel/* import allowed under D-1 / D-4. */
  assert.match(
    NEWTAB_JS,
    /from ['"]\.\.\/sidepanel\/search-index\.js['"]/,
    'newtab.js must import buildIndex/search/diffAndPatch from sidepanel/search-index.js (D-4).',
  );
});

test('B-036 §42.3 D-5 / C-11: click handler dispatches MSG_NAVIGATE_TO_ITEM WITHOUT await', () => {
  /* The single most load-bearing invariant. Any await between dispatching
     MSG_NAVIGATE_TO_ITEM and returning from the handler would reintroduce
     the B-022 D-UAT-3 teardown-race. Verify via source inspection — the
     runtime behaviour is also asserted in the "activateItem never awaits"
     test below. */
  const activate = NEWTAB_JS.match(/function _activateItem[\s\S]*?^}/m);
  assert.ok(activate, '_activateItem must be defined in newtab.js');
  const body = activate[0];
  assert.match(body, /chrome\.runtime\.sendMessage\(/, 'must call chrome.runtime.sendMessage');
  assert.match(body, /MSG_NAVIGATE_TO_ITEM/, 'must dispatch the MSG_NAVIGATE_TO_ITEM constant');
  assert.match(body, /\.catch\(/, 'must chain a .catch(...) onto the promise');
  assert.doesNotMatch(
    body,
    /await\s+chrome\.runtime\.sendMessage/,
    '_activateItem MUST NOT await chrome.runtime.sendMessage (C-11 fire-and-forget).',
  );
});

/* =========================================================================
   DOM shim + module boot harness
   ========================================================================= */

/* Minimal DOM nodes mirroring the shape newtab.js touches. Modelled after
   the shim in tests/b022-quick-search.test.js but extended to cover the
   extra surface newtab.js needs (closest, querySelector, dataset, dispatch
   of events, hidden property, addEventListener). */

class ShimNode {
  constructor(type) {
    this.nodeType = type;
    this.childNodes = [];
    this.parentNode = null;
    this._listeners = new Map();
  }
  appendChild(child) {
    if (child instanceof ShimFragment) {
      for (const kid of child.childNodes.slice()) this.appendChild(kid);
      child.childNodes = [];
      return child;
    }
    if (child.parentNode && child.parentNode !== this) {
      const idx = child.parentNode.childNodes.indexOf(child);
      if (idx >= 0) child.parentNode.childNodes.splice(idx, 1);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.childNodes.indexOf(child);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  get firstChild() { return this.childNodes[0] || null; }
  addEventListener(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
  }
  removeEventListener(event, fn) {
    const arr = this._listeners.get(event);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
  }
  dispatchEvent(event) {
    const arr = this._listeners.get(event.type) || [];
    for (const fn of arr.slice()) fn(event);
    return true;
  }
  replaceWith(other) {
    if (!this.parentNode) return;
    const idx = this.parentNode.childNodes.indexOf(this);
    if (idx >= 0) {
      this.parentNode.childNodes.splice(idx, 1, other);
      other.parentNode = this.parentNode;
      this.parentNode = null;
    }
  }
}

class ShimElement extends ShimNode {
  constructor(tagName) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.className = '';
    this._textContent = '';
    this.dataset = new Proxy({}, {
      set: (obj, key, value) => {
        obj[key] = value;
        this.attributes.set('data-' + _camelToKebab(String(key)), String(value));
        return true;
      },
      deleteProperty: (obj, key) => {
        delete obj[key];
        this.attributes.delete('data-' + _camelToKebab(String(key)));
        return true;
      },
    });
    this._hidden = false;
    this.value = '';
    this.type = '';
    this.id = '';
    this.src = '';
    this.alt = '';
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
  removeAttribute(k) { this.attributes.delete(k); }
  get hidden() { return this._hidden; }
  set hidden(v) { this._hidden = !!v; }
  get textContent() {
    if (this.childNodes.length === 0) return this._textContent;
    let s = '';
    for (const kid of this.childNodes) {
      if (kid instanceof ShimTextNode) s += kid.textContent;
      else if (kid.textContent) s += kid.textContent;
    }
    return s;
  }
  set textContent(v) {
    this._textContent = String(v);
    this.childNodes = [];
  }
  focus() { globalThis.document._activeElement = this; }
  select() { /* no-op for the shim */ }
  /* Walk the subtree — simple attribute + class selectors only. */
  querySelector(sel) {
    for (const el of this._walk()) {
      if (el !== this && _matchesSelector(el, sel)) return el;
    }
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    for (const el of this._walk()) {
      if (el !== this && _matchesSelector(el, sel)) out.push(el);
    }
    return out;
  }
  getElementById(id) {
    for (const el of this._walk()) {
      if (el.id === id) return el;
    }
    return null;
  }
  closest(sel) {
    let cur = this;
    while (cur) {
      if (cur instanceof ShimElement && _matchesSelector(cur, sel)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }
  matches(sel) { return _matchesSelector(this, sel); }
  *_walk() {
    yield this;
    for (const kid of this.childNodes) {
      if (kid instanceof ShimElement) yield* kid._walk();
    }
  }
  get classList() {
    return {
      add: (c) => { if (!this.className.split(/\s+/).includes(c)) this.className = (this.className + ' ' + c).trim(); },
      remove: (c) => { this.className = this.className.split(/\s+/).filter((x) => x !== c).join(' '); },
      contains: (c) => this.className.split(/\s+/).includes(c),
    };
  }
}

class ShimTextNode extends ShimNode {
  constructor(text) {
    super(3);
    this.textContent = String(text);
  }
}

class ShimFragment extends ShimNode {
  constructor() { super(11); }
}

function _camelToKebab(s) {
  return s.replace(/([A-Z])/g, (_, c) => '-' + c.toLowerCase());
}

function _matchesSelector(el, sel) {
  if (!(el instanceof ShimElement)) return false;
  const parts = sel.trim().split(/\s+/);
  /* Only support the last path-part — close enough for our helpers' usage. */
  const last = parts[parts.length - 1];
  return _matchesCompound(el, last);
}

function _matchesCompound(el, sel) {
  if (!sel) return false;
  /* Split a compound selector like `.cls[data-foo="bar"]#id` into its
     simple parts (leading-character-prefixed tokens + bracketed attribute
     tokens). Each simple part must match. */
  const tokens = [];
  let i = 0;
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === '[') {
      const end = sel.indexOf(']', i);
      if (end === -1) break;
      tokens.push(sel.slice(i, end + 1));
      i = end + 1;
    } else if (ch === '.' || ch === '#') {
      let j = i + 1;
      while (j < sel.length && !/[.#\[]/.test(sel[j])) j++;
      tokens.push(sel.slice(i, j));
      i = j;
    } else {
      /* Tag portion at the start. */
      let j = i;
      while (j < sel.length && !/[.#\[]/.test(sel[j])) j++;
      tokens.push(sel.slice(i, j));
      i = j;
    }
  }
  for (const tok of tokens) {
    if (!_matchesSimple(el, tok)) return false;
  }
  return true;
}

function _matchesSimple(el, sel) {
  if (!sel) return false;
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.className.split(/\s+/).includes(sel.slice(1));
  /* Attribute selector [data-foo="bar"] */
  const attr = sel.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attr) {
    if (attr[2] == null) return el.attributes.has(attr[1]);
    return el.attributes.get(attr[1]) === attr[2];
  }
  /* Tag selector */
  return el.tagName === sel.toUpperCase();
}

class ShimHTMLElement extends ShimElement {
  /* HTMLElement is a named export for instanceof-guards in newtab.js. */
  constructor(tagName) { super(tagName); this.isContentEditable = false; }
}

function createShimDocument() {
  const doc = new ShimElement('document');
  doc.nodeType = 9;
  doc._activeElement = null;
  const html = new ShimElement('html');
  doc.appendChild(html);
  const body = new ShimElement('body');
  html.appendChild(body);
  doc.body = body;
  doc.documentElement = html;
  /* document-level APIs. */
  doc.createElement = (tag) => new ShimHTMLElement(tag);
  doc.createTextNode = (t) => new ShimTextNode(t);
  doc.createDocumentFragment = () => new ShimFragment();
  doc.getElementById = (id) => {
    for (const el of html._walk()) {
      if (el.id === id) return el;
    }
    return null;
  };
  doc.querySelector = (sel) => html.querySelector(sel);
  doc.querySelectorAll = (sel) => html.querySelectorAll(sel);
  doc.addEventListener = ShimNode.prototype.addEventListener.bind(doc);
  doc.removeEventListener = ShimNode.prototype.removeEventListener.bind(doc);
  doc.dispatchEvent = ShimNode.prototype.dispatchEvent.bind(doc);
  doc._listeners = new Map();
  return doc;
}

/* Install a fresh DOM + window shim BEFORE the module import can resolve. */
let _doc;
function installDom(markup = 'full') {
  _doc = createShimDocument();
  if (markup === 'full') {
    const root = new ShimElement('main');
    root.id = 'newtab-root';
    root.setAttribute('role', 'main');
    root.hidden = true;
    _doc.body.appendChild(root);

    const header = new ShimElement('header');
    root.appendChild(header);

    const form = new ShimElement('form');
    form.id = 'web-search-form';
    form.setAttribute('role', 'search');
    header.appendChild(form);

    const wsInput = new ShimElement('input');
    wsInput.id = 'web-search-input';
    wsInput.type = 'search';
    form.appendChild(wsInput);

    const wsSubmit = new ShimElement('button');
    wsSubmit.id = 'web-search-submit';
    form.appendChild(wsSubmit);

    const nav = new ShimElement('nav');
    nav.id = 'newtab-filter-bar';
    root.appendChild(nav);

    const filterInput = new ShimElement('input');
    filterInput.id = 'newtab-filter-input';
    filterInput.type = 'search';
    nav.appendChild(filterInput);

    const filterClear = new ShimElement('button');
    filterClear.id = 'newtab-filter-clear';
    filterClear.hidden = true;
    nav.appendChild(filterClear);

    const grid = new ShimElement('section');
    grid.id = 'newtab-grid';
    grid.setAttribute('role', 'region');
    root.appendChild(grid);

    const emptyState = new ShimElement('div');
    emptyState.id = 'newtab-empty-state';
    emptyState.hidden = true;
    root.appendChild(emptyState);

    const errorState = new ShimElement('div');
    errorState.id = 'newtab-error-state';
    errorState.hidden = true;
    root.appendChild(errorState);
  }
  globalThis.document = _doc;
  globalThis.HTMLElement = ShimHTMLElement;
  globalThis.Element = ShimElement;
  globalThis.window = globalThis.window || {};
  globalThis.window.location = {
    _replacedWith: null,
    _reloaded: false,
    replace(url) { this._replacedWith = url; },
    reload() { this._reloaded = true; },
  };
}

/* =========================================================================
   chrome.* spies tailored to newtab flows
   ========================================================================= */

function installChromeSpies() {
  const spy = {
    sendMessageCalls: [],
    sendMessageResponders: [],
    searchQueryCalls: [],
    searchQueryShouldThrow: false,
    sidePanelOpenCalls: [],
    broadcastListeners: [],
    runtimeId: 'test-extension-id',
  };

  chrome.runtime.id = spy.runtimeId;
  chrome.runtime.lastError = null;
  chrome.runtime.sendMessage = (message) => {
    spy.sendMessageCalls.push(message);
    const responder = spy.sendMessageResponders.shift();
    if (responder) {
      if (typeof responder === 'function') {
        return Promise.resolve().then(() => responder(message));
      }
      if (responder instanceof Error) return Promise.reject(responder);
      return Promise.resolve(responder);
    }
    return Promise.resolve(undefined);
  };
  chrome.runtime.onMessage = {
    _listeners: spy.broadcastListeners,
    addListener(fn) { spy.broadcastListeners.push(fn); },
    removeListener(fn) {
      const idx = spy.broadcastListeners.indexOf(fn);
      if (idx >= 0) spy.broadcastListeners.splice(idx, 1);
    },
  };
  chrome.search = {
    query(options) {
      spy.searchQueryCalls.push(options);
      if (spy.searchQueryShouldThrow) {
        spy.searchQueryShouldThrow = false;
        return Promise.reject(new Error('no default search engine'));
      }
      return Promise.resolve();
    },
  };
  chrome.sidePanel = chrome.sidePanel || {};
  chrome.sidePanel.open = async (options) => {
    spy.sidePanelOpenCalls.push(options);
  };
  chrome.windows = chrome.windows || {};
  chrome.windows.getCurrent = async () => ({ id: 1 });
  return spy;
}

/* Queue up responses to the next N sendMessage calls. */
function queueResponses(spy, ...entries) {
  for (const entry of entries) spy.sendMessageResponders.push(entry);
}

/* Fire a broadcast into all registered listeners as the SW would. */
function fireBroadcast(spy, scope) {
  for (const listener of spy.broadcastListeners.slice()) {
    listener({ type: 'tj/stateChanged', payload: { scope } }, { id: spy.runtimeId });
  }
}

/* Await boot completion — newtab.js boot() resolves after DOMContentLoaded.
   Dispatch the event, then flush microtasks via a few setTimeout(0) ticks. */
async function fireBootAndFlush() {
  _doc.dispatchEvent({ type: 'DOMContentLoaded' });
  /* Flush enough microtask queues for Promise.all + post-render steps. */
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function flushMicro(n = 5) {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
}

/* =========================================================================
   Per-test isolation — reimport newtab.js with a cache-buster query string
   so module-scope state is fresh per test.
   ========================================================================= */

async function freshImportNewtab() {
  const url = new URL('../newtab/newtab.js', import.meta.url).href + `?t=${Math.random()}`;
  return import(url);
}

beforeEach(() => {
  __resetMock();
  installDom('full');
  globalThis._spy = installChromeSpies();
});

/* =========================================================================
   Deterministic fixture generators (mirrored from b022/b052 tests)
   ========================================================================= */

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateItems(n, seed = 1) {
  const prng = mulberry32(seed);
  const items = new Array(n);
  for (let i = 0; i < n; i++) {
    items[i] = {
      id: `itm-${String(i).padStart(6, '0')}`,
      title: `Bookmark ${i} ${Math.floor(prng() * 1000)}`,
      url: `https://example-${i % 20}.com/path/${i}`,
      groupId: i % 5 === 4 ? null : `grp-${i % 4}`,
      sortOrder: i,
      createdAt: 1700000000000 + i,
      updatedAt: 1700000000000 + i,
    };
  }
  return items;
}

function generateGroups(n = 4) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: `grp-${i}`, name: `Group ${i}`, sortOrder: i, parentId: null });
  }
  return out;
}

/* =========================================================================
   Tests — boot + pref gate
   ========================================================================= */

test('B-036 AC3 + AC11 (B-039 dropped at S29 close): grid renders unconditionally; focus lands on web-search input', async () => {
  const spy = globalThis._spy;
  const items = generateItems(6);
  const groups = generateGroups(2);
  queueResponses(
    spy,
    { ok: true, data: { items, groups: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
    /* B-092: newtab now reads prefs in parallel on boot to hydrate the
       `.tj-dense` body class on first paint. The newtab is still always on
       (B-039 stays dropped); the pref read is purely cosmetic and not a gate. */
    { ok: true, data: { theme: 'system', denseLayout: false } },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const grid = document.getElementById('newtab-grid');
  const rows = grid.querySelectorAll('.newtab-item-row');
  assert.equal(rows.length, items.length, 'all items rendered');
  assert.equal(document._activeElement?.id, 'web-search-input',
    'AC11 — web-search input focused on boot');
  const root = document.getElementById('newtab-root');
  assert.equal(root.hidden, false, 'main root revealed (newtab is always on)');
  /* B-092: a single MSG_GET_PREFERENCES read fires on boot for the dense
     layout hydration. The prefs fetch is decorative — not a gate — so the
     B-039-drop invariant (newtab always renders) is preserved. */
  const prefReads = spy.sendMessageCalls.filter((m) => m.type === 'tj/getPreferences');
  assert.equal(prefReads.length, 1,
    'B-092 hydration: exactly one MSG_GET_PREFERENCES read on boot for dense-layout body class');
});

test('B-036 AC4: skeleton placeholders render before list fetch resolves', async () => {
  const spy = globalThis._spy;
  /* Hold the MSG_LIST_ITEMS response to observe the skeleton frame. */
  let resolveList;
  const listPromise = new Promise((r) => { resolveList = r; });
  queueResponses(
    spy,
    () => listPromise,
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  _doc.dispatchEvent({ type: 'DOMContentLoaded' });
  /* Let the skeleton mount before the fetch resolves. */
  await flushMicro(3);
  const grid = document.getElementById('newtab-grid');
  const skeletonGroups = grid.querySelectorAll('.newtab-skeleton-group');
  assert.ok(skeletonGroups.length >= 1, 'skeleton groups MUST be visible while fetch is in flight');
  /* Complete the fetch. */
  resolveList({ ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } });
  await flushMicro(10);
  /* Skeleton is gone now. */
  assert.equal(grid.querySelectorAll('.newtab-skeleton-group').length, 0,
    'skeleton cleared after fetch resolves');
});

test('B-036 AC16: MSG_LIST_ITEMS rejects → error state rendered with Reload CTA', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    new Error('storage unavailable'),
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const err = document.getElementById('newtab-error-state');
  assert.equal(err.hidden, false, 'error state must be visible');
  assert.match(err.textContent, /try reloading/i, 'error copy mentions reload');
  const reload = err.querySelector('.newtab-error-cta');
  assert.ok(reload, 'Reload button present');
  /* Click Reload — exercises window.location.reload(). */
  reload._listeners.get('click')?.[0]?.({});
  assert.equal(window.location._reloaded, true, 'Reload CTA triggers window.location.reload()');
});

/* =========================================================================
   Tests — grid + group ordering (AC6, AC13)
   ========================================================================= */

test('B-036 AC6: group sections render in stored sortOrder with correct items', async () => {
  const spy = globalThis._spy;
  const groups = [
    { id: 'g-b', name: 'Beta', sortOrder: 2, parentId: null },
    { id: 'g-a', name: 'Alpha', sortOrder: 1, parentId: null },
  ];
  const items = [
    { id: 'i1', title: 'One', url: 'https://x/1', groupId: 'g-a', sortOrder: 1 },
    { id: 'i2', title: 'Two', url: 'https://x/2', groupId: 'g-b', sortOrder: 1 },
    { id: 'i3', title: 'Three', url: 'https://x/3', groupId: 'g-a', sortOrder: 2 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const sections = document.querySelectorAll('.newtab-group');
  assert.equal(sections.length, 2, 'two group sections rendered');
  const [alpha, beta] = sections;
  assert.match(alpha.textContent, /Alpha/, 'Alpha section first (sortOrder 1)');
  assert.match(beta.textContent, /Beta/, 'Beta section second (sortOrder 2)');
  const alphaRows = alpha.querySelectorAll('.newtab-item-row');
  assert.equal(alphaRows.length, 2, 'Alpha has two items');
  /* Within Alpha, items sorted by sortOrder ascending. */
  assert.match(alphaRows[0].textContent, /One/);
  assert.match(alphaRows[1].textContent, /Three/);
});

test('B-036 AC13 (B-196 §79.2.4): ungrouped items render under the top-level catch-all head section', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'u1', title: 'Untitled-grouped', url: 'https://u/1', groupId: null, sortOrder: 1 },
    { id: 'u2', title: 'Also ungrouped', url: 'https://u/2', groupId: null, sortOrder: 2 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const sections = document.querySelectorAll('.newtab-group');
  assert.equal(sections.length, 1, 'ungrouped items collapse into one section');
  assert.match(sections[0].textContent, /Top Level/, 'section header reads "Top Level" (B-196 merge)');
  const rows = sections[0].querySelectorAll('.newtab-item-row');
  assert.equal(rows.length, 2);
});

test('B-036 AC12: empty items array renders zero-items empty state with CTA', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const empty = document.getElementById('newtab-empty-state');
  assert.equal(empty.hidden, false, 'empty state visible');
  assert.match(empty.textContent, /No bookmarks yet/i);
  assert.ok(empty.querySelector('.newtab-empty-cta'), 'Open side panel CTA present');
});

/* =========================================================================
   Tests — click → MSG_NAVIGATE_TO_ITEM (C-11 load-bearing)
   ========================================================================= */

test('B-036 AC10 / C-11: row click fires MSG_NAVIGATE_TO_ITEM fire-and-forget (no await)', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'hit-me', title: 'Target', url: 'https://x/t', groupId: null, sortOrder: 1 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const grid = document.getElementById('newtab-grid');
  const row = grid.querySelector('.newtab-item-row');
  assert.ok(row, 'row rendered');
  const prevCount = spy.sendMessageCalls.length;

  /* Delegated click handler reads event.target.closest('.newtab-item-row'). */
  const clickHandler = grid._listeners.get('click')?.[0];
  assert.ok(clickHandler, 'click handler bound on grid container');
  /* Synchronous dispatch — simulate the grid click; C-11 requires the
     sendMessage call to be OBSERVABLE immediately (before any async
     continuation), with no await on it. */
  clickHandler({ target: row });
  /* IMMEDIATELY after the dispatch, the call must already be queued. */
  assert.equal(spy.sendMessageCalls.length, prevCount + 1,
    'MSG_NAVIGATE_TO_ITEM must dispatch synchronously — no await gate.');
  const navMsg = spy.sendMessageCalls[prevCount];
  assert.equal(navMsg.type, 'tj/navigateToItem');
  assert.deepEqual(navMsg.payload, { itemId: 'hit-me' });
});

test('B-036 AC10: keyboard Enter on a row activates the same navigate dispatch', async () => {
  const spy = globalThis._spy;
  const items = [{ id: 'row-k', title: 'Keyboard', url: 'https://x/k', groupId: null, sortOrder: 1 }];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const grid = document.getElementById('newtab-grid');
  const row = grid.querySelector('.newtab-item-row');
  const prevCount = spy.sendMessageCalls.length;
  const keyHandler = grid._listeners.get('keydown')?.[0];
  keyHandler({ key: 'Enter', target: row, preventDefault() {} });
  assert.equal(spy.sendMessageCalls.length, prevCount + 1);
  assert.equal(spy.sendMessageCalls[prevCount].type, 'tj/navigateToItem');
});

/* =========================================================================
   Tests — filter (AC7, AC14, AC15)
   ========================================================================= */

test('B-036 AC7: filter input narrows grid after 200 ms debounce with highlighted matches', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'f1', title: 'alpha repo', url: 'https://x/a', groupId: 'g-1', sortOrder: 1 },
    { id: 'f2', title: 'beta repo', url: 'https://x/b', groupId: 'g-1', sortOrder: 2 },
    { id: 'f3', title: 'alphabet soup', url: 'https://x/c', groupId: 'g-1', sortOrder: 3 },
  ];
  const groups = [{ id: 'g-1', name: 'G', sortOrder: 1, parentId: null }];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const filterInput = document.getElementById('newtab-filter-input');
  filterInput.value = 'alpha';
  filterInput.dispatchEvent({ type: 'input' });
  /* Debounce active — no narrowing yet. */
  const rowsBefore = document.querySelectorAll('.newtab-item-row');
  const visibleBefore = [...rowsBefore].filter((r) => !r.hidden).length;
  assert.equal(visibleBefore, 3, 'rows remain visible BEFORE debounce fires');
  /* Advance past the 200 ms debounce. */
  await new Promise((r) => setTimeout(r, 220));
  await flushMicro(3);
  const rowsAfter = document.querySelectorAll('.newtab-item-row');
  const visibleAfter = [...rowsAfter].filter((r) => !r.hidden);
  assert.equal(visibleAfter.length, 2, 'two rows match "alpha"');
  /* Verify highlight fragments present. */
  const marks = visibleAfter[0].querySelectorAll('mark');
  assert.ok(marks.length > 0, 'buildHighlightedText produced <mark> spans');
});

test('B-036 AC14: zero filter matches → filter-empty state with Clear CTA', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'z1', title: 'hello world', url: 'https://x/1', groupId: null, sortOrder: 1 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const filterInput = document.getElementById('newtab-filter-input');
  filterInput.value = 'xyzzzz';
  filterInput.dispatchEvent({ type: 'input' });
  await new Promise((r) => setTimeout(r, 220));
  await flushMicro(3);
  const empty = document.getElementById('newtab-empty-state');
  assert.equal(empty.hidden, false, 'filter-empty state visible');
  assert.match(empty.textContent, /No matches for/);
  const clear = empty.querySelector('.newtab-empty-cta');
  assert.ok(clear, 'Clear filter CTA present');
  /* Click Clear — filter resets and all rows show again. */
  clear._listeners.get('click')?.[0]?.({});
  await flushMicro(2);
  const visibleAfter = [...document.querySelectorAll('.newtab-item-row')].filter((r) => !r.hidden);
  assert.equal(visibleAfter.length, 1, 'Clear filter restores all rows');
  assert.equal(empty.hidden, true, 'empty state hidden after clear');
});

test('B-036 AC15: typing in web-search input does NOT fire chrome.search.query until submit', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const wsInput = document.getElementById('web-search-input');
  wsInput.value = 'hel';
  /* No submit — verify no chrome.search.query call fired. */
  assert.equal(spy.searchQueryCalls.length, 0, 'chrome.search.query NOT called on partial input');
});

/* =========================================================================
   Tests — web-search submit (AC5)
   ========================================================================= */

test('B-036 AC5: form submit → chrome.search.query({text, disposition: "NEW_TAB"})', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const form = document.getElementById('web-search-form');
  const wsInput = document.getElementById('web-search-input');
  wsInput.value = 'tab junkie docs';
  const submitHandler = form._listeners.get('submit')?.[0];
  submitHandler({ preventDefault() {} });
  assert.equal(spy.searchQueryCalls.length, 1);
  assert.deepEqual(spy.searchQueryCalls[0], { text: 'tab junkie docs', disposition: 'NEW_TAB' });
});

test('B-036 AC5: form submit with WHITESPACE-ONLY input is a no-op', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const form = document.getElementById('web-search-form');
  const wsInput = document.getElementById('web-search-input');
  wsInput.value = '   ';
  const submitHandler = form._listeners.get('submit')?.[0];
  submitHandler({ preventDefault() {} });
  assert.equal(spy.searchQueryCalls.length, 0, 'whitespace-only query suppressed (AC15 spirit)');
});

/* =========================================================================
   Tests — live-state indicators (AC8)
   ========================================================================= */

test('B-036 AC8: live/active/drifted indicators render based on liveStates + driftRecords', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'live-item', title: 'Live', url: 'https://x/live', groupId: null, sortOrder: 1 },
    { id: 'act-item', title: 'Active', url: 'https://x/act', groupId: null, sortOrder: 2 },
    { id: 'dft-item', title: 'Drifted', url: 'https://x/dft', groupId: null, sortOrder: 3 },
    { id: 'plain', title: 'Plain', url: 'https://x/p', groupId: null, sortOrder: 4 },
  ];
  const liveStates = {
    'live-item': { live: true, active: false, audible: false, favIconUrl: null },
    'act-item': { live: true, active: true, audible: false, favIconUrl: null },
  };
  const driftRecords = { 'dft-item': { itemId: 'dft-item', lastSeenUrl: 'https://new-url' } };
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates, driftRecords, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const getRow = (id) => document.querySelector(`.newtab-item-row[data-item-id="${id}"]`);
  assert.equal(getRow('live-item').attributes.get('data-live'), 'true', 'live row flagged');
  assert.equal(getRow('act-item').attributes.get('data-active'), 'true', 'active row flagged');
  assert.equal(getRow('dft-item').attributes.get('data-drifted'), 'true', 'drifted row flagged');
  assert.equal(getRow('plain').attributes.has('data-live'), false, 'plain row has no live flag');
  assert.equal(getRow('plain').attributes.has('data-active'), false, 'plain row has no active flag');
  /* Indicator dots rendered where applicable. */
  assert.ok(getRow('live-item').querySelector('.newtab-indicator-live'), 'live dot');
  assert.ok(getRow('act-item').querySelector('.newtab-indicator-active'), 'active dot');
  assert.ok(getRow('dft-item').querySelector('.newtab-indicator-drifted'), 'drifted dot');
});

/* =========================================================================
   Tests — MSG_STATE_CHANGED subscription (AC9)
   ========================================================================= */

test('B-036 AC9: items-scope broadcast triggers refetch + re-render', async () => {
  const spy = globalThis._spy;
  const items1 = [{ id: 'a', title: 'First', url: 'https://x/a', groupId: null, sortOrder: 1 }];
  const items2 = [
    { id: 'a', title: 'First', url: 'https://x/a', groupId: null, sortOrder: 1 },
    { id: 'b', title: 'Second', url: 'https://x/b', groupId: null, sortOrder: 2 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items: items1, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  assert.equal(document.querySelectorAll('.newtab-item-row').length, 1);
  /* Queue broadcast refetch responses. */
  queueResponses(
    spy,
    { ok: true, data: { items: items2, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  fireBroadcast(spy, 'items');
  await flushMicro(5);
  assert.equal(document.querySelectorAll('.newtab-item-row').length, 2,
    'items broadcast triggered refetch and re-render');
});

test('B-036 AC9: broadcast from an UNKNOWN sender is rejected (XSS posture)', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const prevCount = spy.sendMessageCalls.length;
  /* Fire a broadcast claiming to be from a different extension. */
  for (const listener of spy.broadcastListeners) {
    listener({ type: 'tj/stateChanged', payload: { scope: 'items' } }, { id: 'another-extension-id' });
  }
  await flushMicro(3);
  assert.equal(spy.sendMessageCalls.length, prevCount,
    'broadcasts from foreign senders ignored — no refetch fired');
});

test('B-036 §42.3 D-7 preferences (B-039 dropped at S29 close, B-092 dense-layout listener added): broadcast on the preferences scope re-fetches prefs but does not redirect', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
    /* B-092: third boot-time response — the parallel MSG_GET_PREFERENCES. */
    { ok: true, data: { theme: 'system', denseLayout: false } },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  /* No disabled-state DOM was ever mounted — the surface is gone. */
  assert.equal(document.querySelector('.newtab-disabled-state'), null,
    'disabled-state DOM no longer exists (B-039 dropped at S29 close)');
  /* B-092: the newtab now re-fetches prefs on a preferences-scope broadcast
     so the `.tj-dense` body class can flip without a page reload. The
     listener does NOT redirect, does NOT mount a disabled state, and does
     NOT trigger a list re-render — only a single MSG_GET_PREFERENCES read. */
  const callsBefore = spy.sendMessageCalls.length;
  /* Queue a response for the broadcast-driven prefs re-read. */
  queueResponses(spy, { ok: true, data: { theme: 'system', denseLayout: true } });
  fireBroadcast(spy, 'preferences');
  await flushMicro(3);
  const callsAfter = spy.sendMessageCalls.length;
  assert.equal(callsAfter - callsBefore, 1,
    'B-092: preferences-scope broadcast triggers exactly one follow-up MSG_GET_PREFERENCES (dense-layout re-evaluation)');
  const lastCall = spy.sendMessageCalls[spy.sendMessageCalls.length - 1];
  assert.equal(lastCall.type, 'tj/getPreferences',
    'broadcast handler dispatched MSG_GET_PREFERENCES — not MSG_LIST_ITEMS');
  assert.equal(window.location._replacedWith, null,
    'preferences-scope broadcast does NOT redirect (B-039 dropped, no disabled-state to render)');
});

test('B-036 §42.3 D-7 liveState: broadcast patches indicator dots without full rebuild', async () => {
  const spy = globalThis._spy;
  const items = [{ id: 'x1', title: 'X', url: 'https://x/1', groupId: null, sortOrder: 1 }];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const rowBefore = document.querySelector('.newtab-item-row');
  assert.equal(rowBefore.attributes.has('data-live'), false);
  queueResponses(spy, {
    ok: true,
    data: { items, liveStates: { x1: { live: true, active: false, audible: false, favIconUrl: null } }, driftRecords: {}, openTabs: [], windowMap: {} },
  });
  fireBroadcast(spy, 'liveState');
  await flushMicro(5);
  const rowAfter = document.querySelector('.newtab-item-row');
  assert.equal(rowAfter.attributes.get('data-live'), 'true', 'live flag landed on row');
  assert.ok(rowAfter.querySelector('.newtab-indicator-live'), 'live dot rendered');
});

/* =========================================================================
   Tests — performance (AC17, AC18 synthetic)
   ========================================================================= */

test('B-036 AC17: renderGrid at 500 items completes well under 200 ms', async () => {
  const spy = globalThis._spy;
  const items = generateItems(500);
  const groups = generateGroups(4);
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
  );
  await freshImportNewtab();
  const t0 = performance.now();
  await fireBootAndFlush();
  const elapsed = performance.now() - t0;
  const rows = document.querySelectorAll('.newtab-item-row');
  assert.equal(rows.length, 500, '500 rows rendered');
  /* Synthetic measurement — real first-paint budget per §42.6.1 is 200 ms P95.
     Node + shim DOM is substantially faster than a real paint; allow a 10x
     headroom to avoid CI flakiness while still catching pathological
     regressions. */
  assert.ok(elapsed < 2000, `boot+render elapsed ${elapsed.toFixed(1)}ms (budget < 2000ms synthetic)`);
});

test('B-036 AC18: filter application at 1000 items stays under the synthetic budget', async () => {
  const spy = globalThis._spy;
  const items = generateItems(1000);
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: generateGroups(4) },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const filterInput = document.getElementById('newtab-filter-input');
  const t0 = performance.now();
  filterInput.value = 'example-7';
  filterInput.dispatchEvent({ type: 'input' });
  await new Promise((r) => setTimeout(r, 220));
  await flushMicro(3);
  const elapsedIncludingDebounce = performance.now() - t0;
  const visible = [...document.querySelectorAll('.newtab-item-row')].filter((r) => !r.hidden);
  assert.ok(visible.length > 0, 'filter produced at least one match');
  /* Budget: 200 ms debounce + 50 ms filter latency (AC18) + shim overhead.
     Keep a generous headroom for CI jitter while still flagging real perf
     regressions. */
  assert.ok(elapsedIncludingDebounce < 1500,
    `filter-including-debounce ${elapsedIncludingDebounce.toFixed(1)}ms (budget < 1500ms synthetic)`);
});

/* =========================================================================
   Tests — empty state CTA: open sidepanel (AC12 CTA path)
   ========================================================================= */

test('B-036 AC12 CTA: Open-side-panel button invokes chrome.sidePanel.open', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const empty = document.getElementById('newtab-empty-state');
  const cta = empty.querySelector('.newtab-empty-cta');
  cta._listeners.get('click')?.[0]?.({});
  /* chrome.sidePanel.open is async — give it a tick. */
  await flushMicro(3);
  assert.equal(spy.sidePanelOpenCalls.length, 1, 'sidePanel.open called once');
  assert.equal(spy.sidePanelOpenCalls[0].windowId, 1);
});

/* =========================================================================
   Tests — filter clear Escape keyboard
   ========================================================================= */

test('B-036 §42.7.2: Escape inside filter input clears the filter', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'k1', title: 'alpha', url: 'https://x/a', groupId: null, sortOrder: 1 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const filterInput = document.getElementById('newtab-filter-input');
  filterInput.value = 'alpha';
  filterInput.dispatchEvent({ type: 'input' });
  await new Promise((r) => setTimeout(r, 220));
  await flushMicro(3);
  /* Now press Escape. */
  const kd = filterInput._listeners.get('keydown')?.[0];
  kd({ key: 'Escape', preventDefault() {} });
  await flushMicro(3);
  assert.equal(filterInput.value, '', 'filter input cleared');
  const visible = [...document.querySelectorAll('.newtab-item-row')].filter((r) => !r.hidden);
  assert.equal(visible.length, 1, 'all rows visible after Escape clear');
});

/* =========================================================================
   Tests — favicon safety (AC8 / H-1 precedent)
   ========================================================================= */

test('B-036 AC8: unsafe favIconUrl (javascript:) falls back to letter avatar', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'f1', title: 'Target', url: 'https://x/t', groupId: null, sortOrder: 1, favIconUrl: 'javascript:alert(1)' },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const row = document.querySelector('.newtab-item-row');
  assert.equal(row.querySelector('.newtab-item-favicon'), null,
    'unsafe favicon URL rejected — no <img> rendered');
  assert.ok(row.querySelector('.newtab-item-avatar'),
    'letter-avatar fallback rendered when no safe favicon');
});

/* =========================================================================
   Tests — aria-label composition
   ========================================================================= */

test('B-036 §42.7.3: aria-label encodes live state so screen readers announce it', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'a', title: 'Active one', url: 'https://x/a', groupId: null, sortOrder: 1 },
    { id: 'd', title: 'Drifted one', url: 'https://x/d', groupId: null, sortOrder: 2 },
  ];
  const liveStates = { a: { live: true, active: true, audible: false, favIconUrl: null } };
  const driftRecords = { d: { itemId: 'd' } };
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates, driftRecords, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const aRow = document.querySelector('.newtab-item-row[data-item-id="a"]');
  assert.match(aRow.attributes.get('aria-label'), /active tab/i,
    'aria-label for active row mentions "active tab"');
  const dRow = document.querySelector('.newtab-item-row[data-item-id="d"]');
  assert.match(dRow.attributes.get('aria-label'), /drifted/i,
    'aria-label for drifted row mentions drift');
});

/* =========================================================================
   Tests — R4 finding fixes (HIGH-3, MEDIUM-5, QA-1, QA-2, QA-3)
   ========================================================================= */

test('B-036 R4 HIGH-3: bootstrap error emits console.warn with the caught error', async () => {
  const spy = globalThis._spy;
  /* List fetch rejects — bootstrap hits _renderErrorState. */
  const listErr = new Error('storage unavailable');
  queueResponses(
    spy,
    listErr,
    { ok: true, data: [] },
  );
  const originalWarn = console.warn;
  const warnCalls = [];
  console.warn = (...args) => { warnCalls.push(args); };
  try {
    await freshImportNewtab();
    await fireBootAndFlush();
  } finally {
    console.warn = originalWarn;
  }
  const match = warnCalls.find((args) => String(args[0]).includes('[B-036] bootstrap failed'));
  assert.ok(match, 'console.warn called with the [B-036] bootstrap-failed breadcrumb');
  assert.ok(match.some((a) => a instanceof Error && a.message === 'storage unavailable'),
    'caught error is forwarded as a warn argument for dev diagnostics');
  const err = document.getElementById('newtab-error-state');
  assert.equal(err.hidden, false, 'user-visible error state still rendered');
});

test('B-036 R4 MEDIUM-5: overlapping broadcasts coalesce — second refetch skipped in-flight', async () => {
  const spy = globalThis._spy;
  const items1 = [{ id: 'a', title: 'first', url: 'https://x/a', groupId: null, sortOrder: 1 }];
  queueResponses(
    spy,
    { ok: true, data: { items: items1, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const baseCalls = spy.sendMessageCalls.length;
  /* Hold the first broadcast's MSG_LIST_ITEMS so the second broadcast arrives
     while _refetchInFlight is true. */
  let releaseList;
  const heldList = new Promise((r) => { releaseList = r; });
  queueResponses(
    spy,
    () => heldList,
    { ok: true, data: [] },
  );
  fireBroadcast(spy, 'items');
  await flushMicro(2);
  /* Second broadcast fires while first is in flight — MUST be coalesced
     (no additional sendMessage queue draining). */
  fireBroadcast(spy, 'items');
  await flushMicro(2);
  /* Before releasing the held promise, only the first fetch's 2 messages
     (LIST_ITEMS + LIST_GROUPS) should have been enqueued. */
  assert.equal(
    spy.sendMessageCalls.length,
    baseCalls + 2,
    'overlapping broadcast is coalesced — no redundant LIST_ITEMS fired',
  );
  releaseList({ ok: true, data: { items: items1, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } });
  await flushMicro(5);
});

test('B-036 R4 QA-1: #newtab-grid no longer carries aria-live="polite"', () => {
  /* aria-live on the grid announced every row mutation during a full
     render — overwhelming for screen readers. It stays on the empty + error
     states where announcements are semantically meaningful. */
  const grid = NEWTAB_HTML.match(/<section[^>]*id="newtab-grid"[^>]*>/);
  assert.ok(grid, 'grid section present in newtab.html');
  assert.doesNotMatch(
    grid[0],
    /aria-live/,
    '#newtab-grid must NOT declare aria-live (QA-1 R4 fix)',
  );
  /* Positive check — aria-live still present on empty + error states. */
  assert.match(
    NEWTAB_HTML,
    /id="newtab-empty-state"[^>]*aria-live="polite"/,
    '#newtab-empty-state retains aria-live="polite"',
  );
});

test('B-036 R4 QA-2: item-row <button> does NOT set role="listitem"', async () => {
  const spy = globalThis._spy;
  const items = [{ id: 'r1', title: 'Row', url: 'https://x/r', groupId: null, sortOrder: 1 }];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const row = document.querySelector('.newtab-item-row');
  assert.ok(row, 'row rendered');
  assert.equal(row.attributes.has('role'), false,
    'row button must rely on its native button role — no explicit listitem override');
  /* Source-level guard — ensure no future regression sneaks role="listitem" back in. */
  assert.doesNotMatch(
    NEWTAB_JS,
    /setAttribute\(['"]role['"],\s*['"]listitem['"]/,
    'newtab.js must not set role="listitem" on any element',
  );
});

test('B-036 R4 QA-3: group count badge carries aria-label="<n> items"', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'i1', title: 'One', url: 'https://x/1', groupId: 'g', sortOrder: 1 },
    { id: 'i2', title: 'Two', url: 'https://x/2', groupId: 'g', sortOrder: 2 },
    { id: 'i3', title: 'Three', url: 'https://x/3', groupId: 'g', sortOrder: 3 },
  ];
  const groups = [{ id: 'g', name: 'Work', sortOrder: 1, parentId: null }];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const countSpan = document.querySelector('.newtab-group-count');
  assert.ok(countSpan, 'group count badge rendered');
  assert.equal(countSpan.textContent, '3', 'visible count stays numeric');
  assert.equal(countSpan.attributes.get('aria-label'), '3 items',
    'aria-label pronounces the unit for screen-reader users');
});

/* =========================================================================
   Tests — R5 gap-fills (Sprint 29 R5 test-engineer audit)
   Covers:
     - C-9 (g) SW-disconnect-mid-session (QA review flagged as PARTIAL)
     - C-9 (h) MSG_NAVIGATE_TO_ITEM rejection silent swallow
     - AC23 explicit cold-start skeleton→grid atomic replacement
     - Broadcast with malformed scope payload is a safe no-op
   ========================================================================= */

test('B-036 §42.5.1 (g) R5 gap: SW disconnect mid-session — broadcast refetch rejects; grid stays rendered (stale), no blank flash', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'keep-me', title: 'Stays Rendered', url: 'https://x/k', groupId: null, sortOrder: 1 },
  ];
  /* Boot the enabled branch successfully — grid renders. */
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const rowsBefore = document.querySelectorAll('.newtab-item-row');
  assert.equal(rowsBefore.length, 1, 'row rendered from initial boot');
  assert.ok(rowsBefore[0].textContent.includes('Stays Rendered'));

  /* Now simulate the SW tearing down mid-session: the refetch driven by the
     broadcast sees BOTH MSG_LIST_ITEMS and MSG_LIST_GROUPS reject. Per
     §42.5.1 (g) + the inner try/catch in _refetchAndRender(), the existing
     render MUST stay in place (no wipe, no empty state, no error banner). */
  spy.sendMessageResponders.push(new Error('Extension context invalidated'));
  spy.sendMessageResponders.push(new Error('Extension context invalidated'));
  fireBroadcast(spy, 'items');
  await flushMicro(10);

  const rowsAfter = document.querySelectorAll('.newtab-item-row');
  assert.equal(rowsAfter.length, 1,
    'grid stays rendered with previous items after SW-disconnect broadcast (stale, not wiped)');
  assert.ok(rowsAfter[0].textContent.includes('Stays Rendered'),
    'item content unchanged — regression guard against accidental wipe-on-error');
  const empty = document.getElementById('newtab-empty-state');
  assert.equal(empty.hidden, true, 'empty state must NOT appear when SW goes away');
  const err = document.getElementById('newtab-error-state');
  assert.equal(err.hidden, true, 'error state must NOT appear on a transient broadcast failure');
});

test('B-036 §42.5.1 (h) R5 gap: MSG_NAVIGATE_TO_ITEM rejection is silently swallowed — no UI change', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'click-me', title: 'Nav', url: 'https://x/n', groupId: null, sortOrder: 1 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  /* Queue the navigate response as a rejection. */
  spy.sendMessageResponders.push(new Error('SW unreachable'));

  const grid = document.getElementById('newtab-grid');
  const row = grid.querySelector('.newtab-item-row');
  const clickHandler = grid._listeners.get('click')?.[0];
  /* Click MUST not throw despite the rejection — .catch(() => {}) swallows. */
  let threw = false;
  try {
    clickHandler({ target: row });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, 'click handler never throws even when navigate message rejects');
  /* Allow the rejected promise to settle — no unhandled rejection observable. */
  await flushMicro(10);

  /* UI unchanged — the row + grid remain intact, no error state appears. */
  assert.equal(document.querySelectorAll('.newtab-item-row').length, 1,
    'row count unchanged after navigate rejection');
  const errState = document.getElementById('newtab-error-state');
  assert.equal(errState.hidden, true, 'navigate rejection does NOT surface error state');
});

test('B-036 AC23 R5 gap: SW cold-start — skeleton visible while readyPromise is pending, then replaced atomically', async () => {
  const spy = globalThis._spy;
  /* Hold BOTH MSG_LIST_ITEMS and MSG_LIST_GROUPS to model an SW cold-start
     where readyPromise has not yet resolved. Skeleton must be visible in
     this window. On resolution, skeleton cleared and grid renders with no
     error state. */
  let releaseItems;
  let releaseGroups;
  const itemsPromise = new Promise((r) => { releaseItems = r; });
  const groupsPromise = new Promise((r) => { releaseGroups = r; });
  queueResponses(
    spy,
    () => itemsPromise,
    () => groupsPromise,
  );
  await freshImportNewtab();
  _doc.dispatchEvent({ type: 'DOMContentLoaded' });
  /* Let the skeleton mount before fetch resolves. */
  await flushMicro(3);
  const grid = document.getElementById('newtab-grid');
  const skeletonGroups = grid.querySelectorAll('.newtab-skeleton-group');
  assert.ok(skeletonGroups.length >= 1,
    'AC23: skeleton visible while SW cold-start in progress');
  const errState = document.getElementById('newtab-error-state');
  assert.equal(errState.hidden, true, 'no error state while fetch is merely pending');

  /* SW becomes ready — release responses. */
  releaseItems({ ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } });
  releaseGroups({ ok: true, data: [] });
  await flushMicro(10);

  assert.equal(grid.querySelectorAll('.newtab-skeleton-group').length, 0,
    'skeleton cleared after SW resolves');
  const empty = document.getElementById('newtab-empty-state');
  assert.equal(empty.hidden, false,
    'atomic replacement — empty state shown (zero items) once SW responded');
});

/* =========================================================================
   Tests — Sprint 29 pre-merge UAT fix coverage
   ========================================================================= */

test('B-036 UAT-2 (S29): sub-groups render immediately after their parent (parent → child order, not flat)', async () => {
  const spy = globalThis._spy;
  const groups = [
    { id: 'A', name: 'Alpha (parent)', sortOrder: 1, parentId: null },
    { id: 'B', name: 'Bravo (child of A)', sortOrder: 2, parentId: 'A' },
    { id: 'C', name: 'Charlie (parent)', sortOrder: 3, parentId: null },
  ];
  const items = [
    { id: 'iA', title: 'a', url: 'https://x/a', groupId: 'A', sortOrder: 1 },
    { id: 'iB', title: 'b', url: 'https://x/b', groupId: 'B', sortOrder: 1 },
    { id: 'iC', title: 'c', url: 'https://x/c', groupId: 'C', sortOrder: 1 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const sections = document.querySelectorAll('.newtab-group');
  assert.equal(sections.length, 3, 'all three group sections rendered');
  /* Order MUST be [A (parent), B (child of A), C (parent)] — NOT
     [B, A, C] and NOT [A, C, B]. The parent-before-child invariant comes
     from `_orderedGroupIds` walking parents and emitting their children
     immediately after each parent. */
  assert.match(sections[0].textContent, /Alpha/, 'first section is the parent A');
  assert.match(sections[1].textContent, /Bravo/, 'second section is the child of A (immediately after parent)');
  assert.match(sections[2].textContent, /Charlie/, 'third section is the next root parent C');
  /* Child section is marked with the indent class so CSS can offset it. */
  assert.ok(
    sections[1].className.split(/\s+/).includes('newtab-group--child'),
    'child group section carries .newtab-group--child for CSS indent',
  );
  assert.equal(
    sections[0].className.split(/\s+/).includes('newtab-group--child'),
    false,
    'parent group sections must NOT carry the child indent class',
  );
});

test('B-036 UAT-2 (S29 close): equal sortOrder ties preserve insertion order — no alphabetical tiebreaker (sidepanel parity)', async () => {
  /* Pin the sidepanel-parity invariant: when two groups share the same
     sortOrder, render order MUST follow the array order delivered by
     MSG_LIST_GROUPS — NOT an alphabetical tiebreaker. The previous draft
     of `_orderedGroupIds` chained `.localeCompare(name)` after the
     sortOrder compare, which swapped TWERK and PERSONAL in pre-merge UAT
     because sidepanel.js:2899 sorts on `(a.sortOrder ?? 0) - (b.sortOrder ?? 0)`
     only. The newtab now matches that comparator byte-for-byte. */
  const spy = globalThis._spy;
  const groups = [
    /* Same sortOrder for all three — alphabetical tiebreaker would render
       A, B, T but insertion order MUST render T, B, A (the order the SW
       returned). */
    { id: 'g-twerk', name: 'TWERK', sortOrder: 5, parentId: null },
    { id: 'g-bonus', name: 'BONUS', sortOrder: 5, parentId: null },
    { id: 'g-alpha', name: 'ALPHA', sortOrder: 5, parentId: null },
  ];
  const items = [
    { id: 'i1', title: 'one', url: 'https://x/1', groupId: 'g-twerk', sortOrder: 1 },
    { id: 'i2', title: 'two', url: 'https://x/2', groupId: 'g-bonus', sortOrder: 1 },
    { id: 'i3', title: 'three', url: 'https://x/3', groupId: 'g-alpha', sortOrder: 1 },
  ];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: groups },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const sections = document.querySelectorAll('.newtab-group');
  assert.equal(sections.length, 3, 'all three groups rendered');
  /* Insertion order — TWERK first, BONUS second, ALPHA third — NOT
     alphabetical (which would have been ALPHA, BONUS, TWERK). */
  assert.match(sections[0].textContent, /TWERK/, 'first section: TWERK (insertion order, not alphabetical)');
  assert.match(sections[1].textContent, /BONUS/, 'second section: BONUS (insertion order)');
  assert.match(sections[2].textContent, /ALPHA/, 'third section: ALPHA (insertion order, NOT first as alphabetical sort would dictate)');
});

test('B-036 UAT-3 (S29): row indicators are NOT duplicated on initial render (single .newtab-item-indicators per row)', async () => {
  const spy = globalThis._spy;
  const items = [
    { id: 'live-1', title: 'Live', url: 'https://x/1', groupId: null, sortOrder: 1 },
  ];
  const liveStates = { 'live-1': { live: true, active: false, audible: false, favIconUrl: null } };
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const row = document.querySelector('.newtab-item-row');
  /* The previous code path called _applyRowLiveState (which appended an
     indicator wrap) AND ALSO appended a second wrap from _buildIndicators
     in _buildItemRow — producing two .newtab-item-indicators wraps with
     two .newtab-indicator-live dots side-by-side. Pin: exactly ONE wrap
     and exactly ONE live dot for a single live tab. */
  const wraps = row.querySelectorAll('.newtab-item-indicators');
  assert.equal(wraps.length, 1, 'exactly one .newtab-item-indicators wrap per row');
  const liveDots = row.querySelectorAll('.newtab-indicator-live');
  assert.equal(liveDots.length, 1, 'exactly one live indicator dot for a single live tab');
});

test('B-036 UAT-3 (S29): broadcasted live-state updates do not accumulate indicator wraps', async () => {
  const spy = globalThis._spy;
  const items = [{ id: 'x1', title: 'X', url: 'https://x/1', groupId: null, sortOrder: 1 }];
  queueResponses(
    spy,
    { ok: true, data: { items, liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  /* Fire two live-state broadcasts in succession — must NOT duplicate. */
  for (let i = 0; i < 2; i++) {
    queueResponses(spy, {
      ok: true,
      data: {
        items,
        liveStates: { x1: { live: true, active: false, audible: false, favIconUrl: null } },
        driftRecords: {},
        openTabs: [],
        windowMap: {},
      },
    });
    fireBroadcast(spy, 'liveState');
    await flushMicro(5);
  }

  const row = document.querySelector('.newtab-item-row');
  const wraps = row.querySelectorAll('.newtab-item-indicators');
  assert.equal(wraps.length, 1, 'two broadcasts must still leave exactly one indicator wrap');
  const liveDots = row.querySelectorAll('.newtab-indicator-live');
  assert.equal(liveDots.length, 1, 'two broadcasts must still leave exactly one live dot');
});

test('B-036 UAT-5 (S29): "/" steals focus to the web-search input even when the filter input is currently focused', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  const filterInput = document.getElementById('newtab-filter-input');
  const wsInput = document.getElementById('web-search-input');
  /* Simulate the user being inside the filter input — the previous guard
     short-circuited on tagName === 'INPUT' and never re-focused. */
  filterInput.focus();
  assert.equal(document._activeElement, filterInput, 'filter input is the active element pre-keypress');

  const docKeydown = _doc._listeners.get('keydown')?.[0];
  assert.ok(docKeydown, 'document-level keydown listener attached');
  let preventCalled = false;
  docKeydown({
    key: '/',
    target: filterInput,
    preventDefault() { preventCalled = true; },
  });
  assert.equal(preventCalled, true, 'preventDefault fired so the slash never typed into the filter input');
  assert.equal(document._activeElement, wsInput,
    'after "/" keypress, focus moves to the web-search input regardless of prior INPUT focus');
});

test('B-036 UAT-5 (S29): "/" listener registered at document level (regression guard for listener-scope changes)', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();

  /* Pin the listener scope: it MUST be on document, not on a specific
     focusable element. This guards against a future refactor moving it
     onto the body or onto the filter wrap (which would re-introduce the
     UAT-5 dead-spot when the filter input has focus). */
  const docKeydown = _doc._listeners.get('keydown');
  assert.ok(Array.isArray(docKeydown) && docKeydown.length >= 1,
    'document-level keydown listener attached for the "/" shortcut');
});

test('B-036 §42.3 D-7 R5 gap: broadcast with missing/empty scope is a safe no-op', async () => {
  const spy = globalThis._spy;
  queueResponses(
    spy,
    { ok: true, data: { items: [], liveStates: {}, driftRecords: {}, openTabs: [], windowMap: {} } },
    { ok: true, data: [] },
  );
  await freshImportNewtab();
  await fireBootAndFlush();
  const callsBefore = spy.sendMessageCalls.length;
  /* Broadcast without a payload or scope. The listener must not throw and
     must not trigger a refetch. */
  for (const listener of spy.broadcastListeners.slice()) {
    listener({ type: 'tj/stateChanged' }, { id: spy.runtimeId });
    listener({ type: 'tj/stateChanged', payload: {} }, { id: spy.runtimeId });
  }
  await flushMicro(3);
  assert.equal(spy.sendMessageCalls.length, callsBefore,
    'missing/empty scope ignored — no refetch fired');
});
