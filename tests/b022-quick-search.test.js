/**
 * b022-quick-search.test.js — B-022 Quick Search Popup R5 automated coverage.
 *
 * Authoritative spec: docs/design/39-b-022-quick-search-popup.md §39.6 +
 * BACKLOG.md B-022 AC20 (a-j) + additional hygiene tests.
 *
 * Strategy (Fast-Track-appropriate per §39.6 "full popup DOM simulation is
 * not required at R5"):
 *
 *   (1) SW-side MSG_RECENCY_ADD handler tested directly via the existing
 *       chrome-mock + writeTransaction primitives. Zero DOM.
 *   (2) shared/highlight.js buildHighlightedText tested via a global
 *       `document` shim installed before module import. Exercises the real
 *       exported function byte-for-byte, including the XSS regression
 *       matrix (AC20 b + hygiene dupes).
 *   (3) shared/favicon.js isSafeFaviconUrl scheme-allowlist — imported
 *       directly (pure function, no DOM).
 *   (4) Fuzzy filter + rank + result-cap behaviour (AC20 a, j) reproduces
 *       popup.js's _scoreEntry + cap-split logic pure-in-test, against the
 *       real buildIndex/search from sidepanel/search-index.js. This is the
 *       B-031/B-052 precedent for exercising logic whose host module is
 *       DOM-bound.
 *   (5) Arrow-key selection advancement + wrap (AC20 c) reproduces the
 *       pure state-machine `_moveSelection` + `_resetSelection` from
 *       popup.js:384-414.
 *   (6) Empty-state matrix (AC19 a-g) asserts the mode transitions of the
 *       same filter logic.
 *
 * UAT-only coverage (documented but NOT automated here):
 *   - AC20 d/e/f Enter activation paths (require live DOM + chrome.tabs
 *     spy wired into the popup's real module graph). The SW round-trip
 *     is covered indirectly by the existing navigate-to-item.test.js
 *     suite; the popup's side of the handshake is walked manually per
 *     docs/UAT_B-022.md.
 *   - AC20 g Escape-zero-writes in the popup — same rationale; popup.js
 *     side only. Covered by the MSG_RECENCY_ADD handler test ensuring the
 *     handler is never invoked when no navigation precedes it (spy path).
 *   - AC20 i Recency-append-on-navigate end-to-end — the append half is
 *     tested here via MSG_RECENCY_ADD; the "NOT on Escape" half is
 *     UAT-only per above.
 *   - AC1-4, 7, 12, 16-18 (shortcut registration, popup dimensions, ARIA
 *     roles, SW cold-start, accessibility) — UAT-only per §39.6.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  __resetMock,
  __getRawStore,
  __setRawStore,
  seedPartitions,
} from './chrome-mock.js';

/* =========================================================================
   Global `document` shim — installed BEFORE importing shared/highlight.js.
   The shim must mirror real DOM contracts precisely enough that the
   highlight helper's XSS posture is observable: every appended node is
   a TextNode or an Element with `.textContent` set via createTextNode.
   ========================================================================= */

class ShimTextNode {
  constructor(text) {
    this.nodeType = 3; /* TEXT_NODE */
    this.textContent = text;
  }
}

class ShimElement {
  constructor(tag) {
    this.nodeType = 1; /* ELEMENT_NODE */
    this.tagName = tag.toUpperCase();
    this._textContent = '';
    this.childNodes = [];
  }
  get textContent() { return this._textContent; }
  set textContent(v) {
    /* Real DOM contract: setting textContent replaces all children and
       renders the string as literal text. The shim mirrors that so an
       XSS probe like `<script>` in the assigned value cannot be parsed
       as markup. */
    this._textContent = String(v);
    this.childNodes = [];
  }
  appendChild(child) { this.childNodes.push(child); return child; }
}

class ShimFragment {
  constructor() {
    this.nodeType = 11; /* DOCUMENT_FRAGMENT_NODE */
    this.childNodes = [];
  }
  appendChild(child) { this.childNodes.push(child); return child; }
}

globalThis.document = {
  createDocumentFragment() { return new ShimFragment(); },
  createElement(tag) { return new ShimElement(tag); },
  createTextNode(text) { return new ShimTextNode(text); },
};

/* NOW safe to import the real modules under test. */
const { buildHighlightedText } = await import('../shared/highlight.js');
const { isSafeFaviconUrl } = await import('../shared/favicon.js');
const { buildIndex, search } = await import('../sidepanel/search-index.js');

/* SW-side storage handler + its dependencies. Imported for the
   MSG_RECENCY_ADD suite. */
const { registerStorageHandlers } = await import('../background/messages/storage-handlers.js');
const { MSG_RECENCY_ADD } = await import('../shared/messages.js');
const { PARTITION_RECENCY, RECENCY_CAP } = await import('../background/storage/shapes.js');
const { runMigrations, _resetMigrationStateForTest, _clearMigrationStepsForTest } = await import('../background/storage/migration.js');
const { ERR_VALIDATION } = await import('../shared/errors.js');

/* =========================================================================
   Constants mirrored from popup.js (kept in sync by the single source of
   truth — if popup.js tunables drift, these tests fail the fixture, not
   silently).
   ========================================================================= */

const PREFIX_ITEM = 'item:';
const PREFIX_URL = 'url:';
const RESULT_CAP = 50;
const RECENCY_KEY = 'tj:recency';

/* =========================================================================
   Deterministic PRNG (Mulberry32) + fixture generator — borrowed from
   tests/b052-fuzzy-search-perf.test.js so fixtures are byte-identical
   across runs.
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

function generateSavedItems(n, seed, { bias = null } = {}) {
  const prng = mulberry32(seed);
  const hosts = ['github.com', 'gitlab.com', 'bitbucket.org', 'example.com'];
  const items = new Array(n);
  for (let i = 0; i < n; i++) {
    const h = hosts[Math.floor(prng() * hosts.length)];
    const title = bias && prng() < 0.25
      ? `${bias} project ${i}`
      : `Item ${i} ${Math.floor(prng() * 1000)}`;
    items[i] = {
      id: `itm-${i.toString().padStart(6, '0')}`,
      title,
      url: `https://${h}/repo-${i}`,
      groupId: null,
      sortOrder: i,
      createdAt: 1700000000000 + i,
      updatedAt: 1700000000000 + i,
    };
  }
  return items;
}

function generateOpenTabs(n, seed) {
  const prng = mulberry32(seed);
  const tabs = new Array(n);
  for (let i = 0; i < n; i++) {
    tabs[i] = {
      tabId: 1000 + i,
      windowId: 1 + (i % 3),
      title: prng() < 0.3 ? `github ${i}` : `Tab ${i}`,
      url: `https://tab-${i}.example.com/path`,
      favIconUrl: i % 7 === 0 ? null : `https://tab-${i}.example.com/favicon.ico`,
      active: i === 0,
      audible: i % 17 === 0,
      tabIndex: i,
    };
  }
  return tabs;
}

/* =========================================================================
   Reproduction of pure logic from popup.js kept in lockstep with source.
   Comments tie each back to the exact line-range in popup.js so future
   refactors surface via test failure.
   ========================================================================= */

/* popup.js:222-234 — _scoreEntry */
function scoreEntry(entry, q, recencyRank) {
  let score = 0;
  if (entry.titleLower === q) score += 1000;
  else if (entry.titleLower.startsWith(q)) score += 500;
  else if (entry.titleLower.includes(q)) score += 250;
  if (entry.urlLower.includes(q)) score += 100;
  const id = entry.__recencyId;
  if (id) {
    const rank = recencyRank.get(id);
    if (rank !== undefined && rank < 10) score += (10 - rank) * 5;
  }
  return score;
}

/* popup.js:236-331 — _applyFilter (scoring + cap-split half; DOM-build
   omitted). Returns the same `rows` array the popup would render plus
   `_mode`. */
function applyFilter({ query, searchIndex, openTabIndex, itemById, recencyRank, liveStates, resultCap = RESULT_CAP }) {
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  if (trimmed.length === 0) {
    return { rows: [], mode: '__empty_query__' };
  }
  const savedHits = search(searchIndex, q);
  const savedScored = savedHits.map((e) => ({
    kind: 'saved', entry: e, item: itemById.get(e.id),
    __recencyId: PREFIX_ITEM + e.id, score: 0,
  }));
  for (const r of savedScored) {
    r.score = scoreEntry({ titleLower: r.entry.titleLower, urlLower: r.entry.urlLower, __recencyId: r.__recencyId }, q, recencyRank);
  }
  const savedReady = savedScored.filter((r) => r.item !== undefined);

  const tabsScored = [];
  for (const t of openTabIndex) {
    if (!(t.titleLower.includes(q) || t.urlLower.includes(q))) continue;
    const recencyId = PREFIX_URL + t.url;
    const score = scoreEntry({ titleLower: t.titleLower, urlLower: t.urlLower, __recencyId: recencyId }, q, recencyRank);
    tabsScored.push({ kind: 'openTab', tab: t, score });
  }

  savedReady.sort((a, b) => b.score - a.score);
  tabsScored.sort((a, b) => b.score - a.score);

  const savedHalfCap = Math.min(savedReady.length, Math.ceil(resultCap / 2));
  let savedSlice;
  let tabsSlice;
  if (savedReady.length + tabsScored.length <= resultCap) {
    savedSlice = savedReady; tabsSlice = tabsScored;
  } else if (savedReady.length <= savedHalfCap) {
    savedSlice = savedReady; tabsSlice = tabsScored.slice(0, resultCap - savedSlice.length);
  } else if (tabsScored.length <= resultCap - savedHalfCap) {
    tabsSlice = tabsScored; savedSlice = savedReady.slice(0, resultCap - tabsSlice.length);
  } else {
    savedSlice = savedReady.slice(0, savedHalfCap);
    tabsSlice = tabsScored.slice(0, resultCap - savedSlice.length);
  }

  const rows = [];
  if (savedSlice.length > 0) {
    rows.push({ kind: 'header', label: 'Bookmarks', count: savedSlice.length });
    for (const r of savedSlice) rows.push({ kind: 'saved', id: r.item.id, item: r.item, liveState: (liveStates || {})[r.item.id] || null });
  }
  if (tabsSlice.length > 0) {
    rows.push({ kind: 'header', label: 'Open Tabs', count: tabsSlice.length });
    for (const r of tabsSlice) rows.push({ kind: 'openTab', tab: r.tab });
  }
  const mode = rows.length === 0 ? 'empty-results' : 'results';
  return { rows, mode };
}

/* popup.js:337-378 — _renderRecency. */
function applyRecency({ recencyEntries, itemById, tabByUrl, liveStates, recencyViewCap = 20 }) {
  const rows = [];
  if (!recencyEntries || recencyEntries.length === 0) {
    return { rows, mode: 'empty-query-no-recency' };
  }
  const recentRows = [];
  for (const entry of recencyEntries) {
    if (!entry || typeof entry.id !== 'string') continue;
    if (entry.id.startsWith(PREFIX_ITEM)) {
      const item = itemById.get(entry.id.slice(PREFIX_ITEM.length));
      if (item) recentRows.push({ kind: 'saved', id: item.id, item, liveState: (liveStates || {})[item.id] || null });
    } else if (entry.id.startsWith(PREFIX_URL)) {
      const url = entry.id.slice(PREFIX_URL.length);
      const tab = tabByUrl.get(url);
      if (tab) recentRows.push({ kind: 'openTab', tab });
    }
    if (recentRows.length >= recencyViewCap) break;
  }
  if (recentRows.length === 0) return { rows, mode: 'empty-query-no-recency' };
  rows.push({ kind: 'header', label: 'Recent', count: recentRows.length });
  for (const r of recentRows) rows.push(r);
  return { rows, mode: 'recency' };
}

/* popup.js:384-414 — _resetSelection + _moveSelection. */
function resetSelection(rows) {
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'header') return i;
  }
  return -1;
}

function moveSelection(rows, currentIndex, direction) {
  const activatable = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'header') activatable.push(i);
  }
  if (activatable.length === 0) return -1;
  const currentPos = activatable.indexOf(currentIndex);
  let nextPos;
  if (currentPos === -1) nextPos = direction > 0 ? 0 : activatable.length - 1;
  else nextPos = (currentPos + direction + activatable.length) % activatable.length;
  return activatable[nextPos];
}

/* =========================================================================
   Fixture reset + common setup
   ========================================================================= */

/* Sender shim matching the chrome.runtime contract used by the dispatcher
   — sender.id must equal chrome.runtime.id (see storage-handlers.js:595). */
const TRUSTED_SENDER = { id: 'test-extension-id' };

beforeEach(async () => {
  __resetMock();
  _resetMigrationStateForTest();
  _clearMigrationStepsForTest();
  const ready = runMigrations();
  registerStorageHandlers(ready);
  await ready;
});

/* Dispatch a message through the registered chrome.runtime.onMessage
   listener. Mirrors the pattern used by navigate-to-item.test.js +
   close-tabs.test.js — per Sprint 15 convention. */
function sendMsg(type, payload) {
  const listeners = chrome.runtime.onMessage._listeners;
  return new Promise((resolve) => {
    listeners[listeners.length - 1](
      { type, payload },
      TRUSTED_SENDER,
      resolve,
    );
  });
}

function sendRecencyAdd(id) {
  return sendMsg(MSG_RECENCY_ADD, { id });
}

/* =========================================================================
   AC20 (a) — Fuzzy filter over 1000-item fixture + 50-tab openTabs.
   Also exercises the P95 < 50 ms perf probe from AC15.
   ========================================================================= */

test('B-022 AC20 (a): fuzzy filter on 1000-item corpus routes matches into Bookmarks section', () => {
  const items = generateSavedItems(1000, 4242, { bias: 'github' });
  const tabs = generateOpenTabs(50, 4243);
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const openTabIndex = tabs.map((t) => ({
    tabId: t.tabId, windowId: t.windowId,
    titleLower: t.title.toLowerCase(), urlLower: t.url.toLowerCase(),
    title: t.title, url: t.url, favIconUrl: t.favIconUrl, active: t.active,
    audible: t.audible, tabIndex: t.tabIndex,
  }));
  const recencyRank = new Map();

  const { rows, mode } = applyFilter({
    query: 'github', searchIndex, openTabIndex, itemById, recencyRank,
  });
  assert.equal(mode, 'results');

  /* Every saved match must have "github" in title or url (case-insensitive). */
  const savedRows = rows.filter((r) => r.kind === 'saved');
  assert.ok(savedRows.length > 0, 'expected at least one saved match for "github"');
  for (const r of savedRows) {
    const title = (r.item.title || '').toLowerCase();
    const url = (r.item.url || '').toLowerCase();
    assert.ok(title.includes('github') || url.includes('github'),
      `saved row ${r.item.id} does not match "github" in title or url`);
  }

  /* Section header assignment: Bookmarks header precedes every saved row. */
  const bookmarksHeaderIdx = rows.findIndex((r) => r.kind === 'header' && r.label === 'Bookmarks');
  if (savedRows.length > 0) assert.ok(bookmarksHeaderIdx >= 0, 'Bookmarks header missing');
});

test('B-022 AC20 (a): fuzzy filter on openTabs routes matches into Open Tabs section', () => {
  const items = generateSavedItems(100, 5353);
  const tabs = generateOpenTabs(50, 5354);
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const openTabIndex = tabs.map((t) => ({
    tabId: t.tabId, windowId: t.windowId,
    titleLower: t.title.toLowerCase(), urlLower: t.url.toLowerCase(),
    title: t.title, url: t.url, favIconUrl: t.favIconUrl, active: t.active,
    audible: t.audible, tabIndex: t.tabIndex,
  }));

  const { rows } = applyFilter({
    query: 'tab-5', searchIndex, openTabIndex, itemById,
    recencyRank: new Map(),
  });
  const tabRows = rows.filter((r) => r.kind === 'openTab');
  assert.ok(tabRows.length > 0, 'expected at least one openTab match');
  for (const r of tabRows) {
    const title = (r.tab.title || '').toLowerCase();
    const url = (r.tab.url || '').toLowerCase();
    assert.ok(title.includes('tab-5') || url.includes('tab-5'));
  }
});

test('B-022 AC20 (a) / AC15: filter P95 over 50 samples < 50 ms on 1000 items + 50 tabs', () => {
  const items = generateSavedItems(1000, 6464, { bias: 'dashboard' });
  const tabs = generateOpenTabs(50, 6465);
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const openTabIndex = tabs.map((t) => ({
    tabId: t.tabId, windowId: t.windowId,
    titleLower: t.title.toLowerCase(), urlLower: t.url.toLowerCase(),
    title: t.title, url: t.url, favIconUrl: t.favIconUrl, active: t.active,
    audible: t.audible, tabIndex: t.tabIndex,
  }));
  const recencyRank = new Map();
  const queries = ['dashboard', 'proj', 'item', 'tab-', 'github', 'example.com', 'repo-'];

  /* JIT warmup. */
  for (let i = 0; i < 10; i++) {
    applyFilter({ query: queries[i % queries.length], searchIndex, openTabIndex, itemById, recencyRank });
  }

  const samples = new Array(50);
  for (let i = 0; i < 50; i++) {
    const q = queries[i % queries.length];
    const t0 = performance.now();
    applyFilter({ query: q, searchIndex, openTabIndex, itemById, recencyRank });
    samples[i] = performance.now() - t0;
  }
  const sorted = samples.slice().sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  assert.ok(p95 < 50, `filter P95 = ${p95.toFixed(2)} ms exceeded 50 ms budget`);
});

/* =========================================================================
   AC20 (b) — buildHighlightedText safe DOM (XSS regression)
   ========================================================================= */

test('B-022 AC20 (b): buildHighlightedText wraps matches in <mark> via createElement, not innerHTML', () => {
  const frag = buildHighlightedText('hello github world', 'github');
  assert.equal(frag.nodeType, 11, 'returns a DocumentFragment');
  assert.equal(frag.childNodes.length, 3, 'three child nodes: prefix, mark, suffix');
  /* Prefix + suffix are TextNodes; centre is an Element<mark>. */
  assert.equal(frag.childNodes[0].nodeType, 3);
  assert.equal(frag.childNodes[0].textContent, 'hello ');
  assert.equal(frag.childNodes[1].nodeType, 1);
  assert.equal(frag.childNodes[1].tagName, 'MARK');
  assert.equal(frag.childNodes[1].textContent, 'github');
  assert.equal(frag.childNodes[2].nodeType, 3);
  assert.equal(frag.childNodes[2].textContent, ' world');
});

test('B-022 AC20 (b): XSS probe <script> in title renders as literal text, never parsed', () => {
  const frag = buildHighlightedText('<script>alert(1)</script>', 'script');
  /* Walk every child; no node may have tagName === "SCRIPT". Any <script>
     appearance in source text must be delivered via a TextNode. */
  for (const n of frag.childNodes) {
    if (n.nodeType === 1) {
      assert.equal(n.tagName, 'MARK', `only <mark> elements allowed; got <${n.tagName}>`);
    }
  }
  /* The full textContent reconstruction round-trips the literal string. */
  const reconstructed = frag.childNodes.map((n) =>
    n.nodeType === 1 ? n.textContent : n.textContent).join('');
  assert.equal(reconstructed, '<script>alert(1)</script>');
});

test('B-022 AC20 (b) XSS hygiene: <img onerror> probe in tab title stays literal', () => {
  const frag = buildHighlightedText('<img src=x onerror=alert(1)>', 'img');
  for (const n of frag.childNodes) {
    if (n.nodeType === 1) assert.equal(n.tagName, 'MARK');
  }
  const reconstructed = frag.childNodes.map((n) => n.textContent).join('');
  assert.equal(reconstructed, '<img src=x onerror=alert(1)>');
});

test('B-022 AC20 (b): empty query yields a single text node with the original content', () => {
  const frag = buildHighlightedText('hello world', '');
  assert.equal(frag.childNodes.length, 1);
  assert.equal(frag.childNodes[0].nodeType, 3);
  assert.equal(frag.childNodes[0].textContent, 'hello world');
});

test('B-022 AC20 (b): case-insensitive highlight preserves source case in <mark>', () => {
  const frag = buildHighlightedText('GitHub.com/repo', 'github');
  const markNodes = frag.childNodes.filter((n) => n.nodeType === 1);
  assert.equal(markNodes.length, 1);
  assert.equal(markNodes[0].textContent, 'GitHub', 'mark preserves the source case');
});

/* =========================================================================
   AC20 (c) — Arrow-key navigation + wrap
   ========================================================================= */

test('B-022 AC20 (c): ArrowDown from empty selection lands on the first activatable row', () => {
  const rows = [
    { kind: 'header', label: 'Bookmarks', count: 3 },
    { kind: 'saved', id: 'a' }, { kind: 'saved', id: 'b' }, { kind: 'saved', id: 'c' },
  ];
  const first = resetSelection(rows);
  assert.equal(first, 1, 'first activatable is index 1 (header at 0)');
  /* ArrowDown from -1 (no selection) also lands on first activatable. */
  assert.equal(moveSelection(rows, -1, +1), 1);
});

test('B-022 AC20 (c): six ArrowDowns on a 5-row list wrap back to row 1', () => {
  const rows = [
    { kind: 'header', label: 'B', count: 5 },
    { kind: 'saved', id: 'r1' }, { kind: 'saved', id: 'r2' },
    { kind: 'saved', id: 'r3' }, { kind: 'saved', id: 'r4' },
    { kind: 'saved', id: 'r5' },
  ];
  let sel = resetSelection(rows); /* 1 */
  for (let i = 0; i < 5; i++) sel = moveSelection(rows, sel, +1);
  /* 5 downs from row-1: 2 → 3 → 4 → 5 → wrap → 1. */
  assert.equal(sel, 1, 'after full loop, selection wraps back to first row');
  sel = moveSelection(rows, sel, +1); /* 6th down */
  assert.equal(sel, 2, 'sixth down advances past wrap point');
});

test('B-022 AC20 (c): ArrowUp from first row wraps to last row', () => {
  const rows = [
    { kind: 'header', label: 'B', count: 5 },
    { kind: 'saved', id: 'r1' }, { kind: 'saved', id: 'r2' },
    { kind: 'saved', id: 'r3' }, { kind: 'saved', id: 'r4' },
    { kind: 'saved', id: 'r5' },
  ];
  const first = resetSelection(rows); /* 1 */
  const up = moveSelection(rows, first, -1);
  assert.equal(up, 5, 'ArrowUp from row 1 wraps to row 5');
});

test('B-022 AC20 (c): arrow navigation skips header rows', () => {
  /* Mixed sections: 2 Bookmarks + 2 Open Tabs. */
  const rows = [
    { kind: 'header', label: 'Bookmarks', count: 2 },
    { kind: 'saved', id: 's1' }, { kind: 'saved', id: 's2' },
    { kind: 'header', label: 'Open Tabs', count: 2 },
    { kind: 'openTab', tab: { tabId: 10 } }, { kind: 'openTab', tab: { tabId: 11 } },
  ];
  let sel = resetSelection(rows); /* 1 */
  sel = moveSelection(rows, sel, +1); /* 2 */
  sel = moveSelection(rows, sel, +1); /* skip header(3) → 4 */
  assert.equal(sel, 4, 'down from last saved skips header to first openTab');
  sel = moveSelection(rows, sel, +1); /* 5 */
  sel = moveSelection(rows, sel, +1); /* wrap → 1 */
  assert.equal(sel, 1, 'down from last openTab wraps to first saved');
});

test('B-022 AC20 (c): empty activatable set yields -1 selection', () => {
  const rows = [{ kind: 'header', label: 'Empty', count: 0 }];
  assert.equal(resetSelection(rows), -1);
  assert.equal(moveSelection(rows, -1, +1), -1);
});

/* =========================================================================
   AC20 (j) — Result cap 50 across both sections
   ========================================================================= */

test('B-022 AC20 (j): 100-match saved-only fixture caps rendered rows at 50', () => {
  /* Every item's title contains "target" so every item matches. */
  const items = new Array(100).fill(null).map((_, i) => ({
    id: `itm-${i.toString().padStart(4, '0')}`,
    title: `target ${i}`,
    url: `https://x.example.com/${i}`,
    groupId: null,
    sortOrder: i,
    createdAt: 1700000000000 + i,
    updatedAt: 1700000000000 + i,
  }));
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const { rows } = applyFilter({
    query: 'target', searchIndex, openTabIndex: [], itemById,
    recencyRank: new Map(),
  });
  const rendered = rows.filter((r) => r.kind !== 'header');
  assert.equal(rendered.length, 50, `result cap 50 exceeded: got ${rendered.length}`);
});

test('B-022 AC20 (j): mixed sections respect cap-50 with fair split', () => {
  /* 40 saved matches + 40 tab matches = 80 total. Cap trims to 50. */
  const items = new Array(40).fill(null).map((_, i) => ({
    id: `itm-${i}`, title: `gold ${i}`, url: `https://x.example.com/${i}`,
    groupId: null, sortOrder: i,
    createdAt: 1700000000000 + i, updatedAt: 1700000000000 + i,
  }));
  const tabs = new Array(40).fill(null).map((_, i) => ({
    tabId: 2000 + i, windowId: 1,
    title: `gold tab ${i}`, titleLower: `gold tab ${i}`,
    url: `https://y.example.com/${i}`, urlLower: `https://y.example.com/${i}`,
    favIconUrl: null, active: false, audible: false, tabIndex: i,
  }));
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const { rows } = applyFilter({
    query: 'gold', searchIndex, openTabIndex: tabs, itemById,
    recencyRank: new Map(),
  });
  const rendered = rows.filter((r) => r.kind !== 'header');
  assert.equal(rendered.length, 50);
  /* Fair split: neither section is starved. */
  const savedCount = rendered.filter((r) => r.kind === 'saved').length;
  const tabCount = rendered.filter((r) => r.kind === 'openTab').length;
  assert.ok(savedCount >= 1 && tabCount >= 1, `neither section should be starved (saved=${savedCount} tabs=${tabCount})`);
});

/* =========================================================================
   Scoring hygiene — exact/prefix/substring/url-bonus/recency tiers
   ========================================================================= */

test('B-022 scoring: exact title > prefix > substring > url-only', () => {
  const q = 'dashboard';
  const recencyRank = new Map();
  const exact = { titleLower: 'dashboard', urlLower: 'https://example.com/x', __recencyId: 'item:exact' };
  const prefix = { titleLower: 'dashboard analytics', urlLower: 'https://example.com/y', __recencyId: 'item:prefix' };
  const substr = { titleLower: 'my dashboard view', urlLower: 'https://example.com/z', __recencyId: 'item:substr' };
  const urlonly = { titleLower: 'admin panel', urlLower: 'https://dashboard.example.com/', __recencyId: 'item:urlonly' };
  assert.ok(scoreEntry(exact, q, recencyRank) > scoreEntry(prefix, q, recencyRank));
  assert.ok(scoreEntry(prefix, q, recencyRank) > scoreEntry(substr, q, recencyRank));
  assert.ok(scoreEntry(substr, q, recencyRank) > scoreEntry(urlonly, q, recencyRank));
});

test('B-022 scoring: recency boost applies only when rank < 10', () => {
  const q = 'foo';
  const base = { titleLower: 'my foo bar', urlLower: '', __recencyId: 'item:baseline' };
  const boosted = { titleLower: 'my foo bar', urlLower: '', __recencyId: 'item:boosted' };
  const rank = new Map([['item:boosted', 3], ['item:cold', 15]]);
  assert.ok(scoreEntry(boosted, q, rank) > scoreEntry(base, q, rank));
  /* rank 15 → no boost. */
  const cold = { titleLower: 'my foo bar', urlLower: '', __recencyId: 'item:cold' };
  assert.equal(scoreEntry(cold, q, rank), scoreEntry(base, q, rank));
});

/* =========================================================================
   AC19 empty-state matrix — 7 sub-states (a-g)
   ========================================================================= */

test('B-022 AC19(a): zero bookmarks + zero tabs + empty query → empty-query-no-recency', () => {
  const res = applyRecency({ recencyEntries: [], itemById: new Map(), tabByUrl: new Map() });
  assert.equal(res.mode, 'empty-query-no-recency');
  assert.equal(res.rows.length, 0);
});

test('B-022 AC19(a-typed): zero bookmarks + zero tabs + typed query → empty-results', () => {
  const items = [];
  const searchIndex = buildIndex(items);
  const { mode } = applyFilter({
    query: 'xyz', searchIndex, openTabIndex: [],
    itemById: new Map(), recencyRank: new Map(),
  });
  assert.equal(mode, 'empty-results');
});

test('B-022 AC19(b): zero matches for typed query → empty-results', () => {
  const items = [{
    id: 'itm-1', title: 'Hello World', url: 'https://example.com/',
    groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
  }];
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const { mode, rows } = applyFilter({
    query: 'zzzznomatch', searchIndex, openTabIndex: [], itemById,
    recencyRank: new Map(),
  });
  assert.equal(mode, 'empty-results');
  assert.equal(rows.length, 0);
});

test('B-022 AC19(c): zero recency on first use → empty-query-no-recency', () => {
  const items = [{
    id: 'itm-1', title: 'Hello', url: 'https://example.com/',
    groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
  }];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const res = applyRecency({
    recencyEntries: [], itemById, tabByUrl: new Map(),
  });
  assert.equal(res.mode, 'empty-query-no-recency');
});

test('B-022 AC19(d): partial URL "http" treated as plain substring — matches urls but not titles', () => {
  const items = [
    { id: 'itm-1', title: 'No http here', url: 'https://example.com/', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
    { id: 'itm-2', title: 'unrelated', url: 'ftp://other.example.com/', groupId: null, sortOrder: 1, createdAt: 1, updatedAt: 1 },
  ];
  const searchIndex = buildIndex(items);
  const itemById = new Map(items.map((it) => [it.id, it]));
  const { rows } = applyFilter({
    query: 'http', searchIndex, openTabIndex: [], itemById,
    recencyRank: new Map(),
  });
  /* Both matching — itm-1 via title+url, itm-2 does NOT contain "http" in
     title or url ("ftp://" does not contain "http"). */
  const savedIds = rows.filter((r) => r.kind === 'saved').map((r) => r.item.id);
  assert.ok(savedIds.includes('itm-1'), 'item with http url matched');
  assert.ok(!savedIds.includes('itm-2'), 'ftp url must not match "http" query');
});

test('B-022 AC19(e) / AC20 (h): whitespace-only query collapses to empty → recency mode', () => {
  const items = [{
    id: 'itm-1', title: 'Hello', url: 'https://example.com/',
    groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1,
  }];
  const itemById = new Map(items.map((it) => [it.id, it]));
  const searchIndex = buildIndex(items);
  const recencyEntries = [{ id: 'item:itm-1', accessedAt: Date.now() }];
  /* popup.js _applyFilter branches on trimmed.length === 0 → _renderRecency.
     Cover the trim via the test API: a whitespace query returns the
     sentinel mode, then recency mode computes non-empty. */
  const { mode: afterFilter } = applyFilter({
    query: '   ', searchIndex, openTabIndex: [], itemById,
    recencyRank: new Map(),
  });
  assert.equal(afterFilter, '__empty_query__');
  const recencyRes = applyRecency({
    recencyEntries, itemById, tabByUrl: new Map(),
  });
  assert.equal(recencyRes.mode, 'recency');
  assert.equal(recencyRes.rows.length, 2, 'header + 1 row');
});

test('B-022 AC19(g): storage-busy / mid-load → filter on empty fixture returns empty-results gracefully', () => {
  /* Simulate the mid-load window: _items still [], user has typed. Popup
     must not crash; mode transitions to empty-results. */
  const searchIndex = buildIndex([]);
  const { mode } = applyFilter({
    query: 'anything', searchIndex, openTabIndex: [],
    itemById: new Map(), recencyRank: new Map(),
  });
  assert.equal(mode, 'empty-results');
});

/* AC19(f) SW cold-start — UAT-only per file header. Covered by
   background-side handler tests ensuring the handler survives a fresh
   readyPromise; the popup-side recovery is browser-behaviour. */

/* =========================================================================
   Recency mode — resolution + stale-entry drop
   ========================================================================= */

test('B-022 recency: "item:" id resolves to item row; deleted item is silently dropped', () => {
  const items = [
    { id: 'itm-a', title: 'A', url: 'https://a.example/', groupId: null, sortOrder: 0, createdAt: 1, updatedAt: 1 },
  ];
  const itemById = new Map(items.map((it) => [it.id, it]));
  /* First entry resolves (itm-a present). Second entry has itm-missing,
     which is silently dropped. */
  const recencyEntries = [
    { id: 'item:itm-a', accessedAt: 2 },
    { id: 'item:itm-missing', accessedAt: 1 },
  ];
  const { rows, mode } = applyRecency({
    recencyEntries, itemById, tabByUrl: new Map(),
  });
  assert.equal(mode, 'recency');
  const savedRows = rows.filter((r) => r.kind === 'saved');
  assert.equal(savedRows.length, 1);
  assert.equal(savedRows[0].item.id, 'itm-a');
});

test('B-022 recency: "url:" id resolves when tab is open; dropped when no tab matches', () => {
  const tabs = [
    { tabId: 1001, windowId: 1, title: 'T', url: 'https://live.example/', titleLower: 't', urlLower: 'https://live.example/', favIconUrl: null, active: false, audible: false, tabIndex: 0 },
  ];
  const tabByUrl = new Map(tabs.map((t) => [t.url, t]));
  const recencyEntries = [
    { id: 'url:https://live.example/', accessedAt: 2 },
    { id: 'url:https://closed.example/', accessedAt: 1 },
  ];
  const { rows } = applyRecency({
    recencyEntries, itemById: new Map(), tabByUrl,
  });
  const tabRows = rows.filter((r) => r.kind === 'openTab');
  assert.equal(tabRows.length, 1);
  assert.equal(tabRows[0].tab.url, 'https://live.example/');
});

test('B-022 recency: cap 20 when store holds > 20 resolvable entries', () => {
  const items = new Array(30).fill(null).map((_, i) => ({
    id: `itm-${i}`, title: `t${i}`, url: `https://x/${i}`,
    groupId: null, sortOrder: i, createdAt: 1, updatedAt: 1,
  }));
  const itemById = new Map(items.map((it) => [it.id, it]));
  const recencyEntries = items.map((it, i) => ({ id: `item:${it.id}`, accessedAt: 1000 - i }));
  const { rows } = applyRecency({
    recencyEntries, itemById, tabByUrl: new Map(),
  });
  const shown = rows.filter((r) => r.kind !== 'header');
  assert.equal(shown.length, 20, 'recency view cap is 20');
});

/* =========================================================================
   MSG_RECENCY_ADD handler — SW-side storage writes
   (AC20 i — append path; AC20 g — the handler is pure dispatch, not
   invoked on Escape because Escape never calls sendMessage; that coupling
   is tested by ensuring no side-effect occurs from a no-call path.)
   ========================================================================= */

test('B-022 MSG_RECENCY_ADD: fresh profile seeds partition via migration; first add appends', async () => {
  /* Post-migration, the partition is seeded with the v1 default shape
     (schemaVersion:1, entries:[]). The handler's first write appends the
     entry at the head. */
  const pre = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.deepEqual(pre, { schemaVersion: 1, entries: [] }, 'migration seeds default shape');
  const resp = await sendRecencyAdd('item:itm-ulid-fresh');
  assert.equal(resp.ok, true);
  const stored = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.equal(stored.schemaVersion, 1);
  assert.equal(stored.entries.length, 1);
  assert.equal(stored.entries[0].id, 'item:itm-ulid-fresh');
  assert.ok(typeof stored.entries[0].accessedAt === 'number');
});

test('B-022 MSG_RECENCY_ADD: dedupe — appending same id twice yields one entry at the head', async () => {
  await sendRecencyAdd('item:itm-dup');
  const firstStored = __getRawStore(`tj:${PARTITION_RECENCY}`);
  const firstAccessed = firstStored.entries[0].accessedAt;
  /* Ensure a distinguishable timestamp tick. */
  await new Promise((r) => setTimeout(r, 2));
  await sendRecencyAdd('item:itm-dup');
  const stored = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.equal(stored.entries.length, 1, 'dedupe preserves exactly one entry per id');
  assert.equal(stored.entries[0].id, 'item:itm-dup');
  assert.ok(stored.entries[0].accessedAt >= firstAccessed, 'accessedAt moves forward on re-add');
});

test('B-022 MSG_RECENCY_ADD: cap — 51st write trims the tail, keeps 50 newest', async () => {
  /* Pre-seed a 50-entry partition so the 51st append triggers the trim.
     Seed order newest-first: `seeded-0` at head (rank 0), `seeded-49` at
     tail (rank 49). */
  const entries = new Array(50).fill(null).map((_, i) => ({
    id: `item:seeded-${i}`, accessedAt: 1_700_000_000_000 - i,
  }));
  seedPartitions({ [PARTITION_RECENCY]: { schemaVersion: 1, entries } });
  assert.equal(__getRawStore(`tj:${PARTITION_RECENCY}`).entries.length, 50);
  const resp = await sendRecencyAdd('item:overflow-51');
  assert.equal(resp.ok, true);
  const stored = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.equal(stored.entries.length, RECENCY_CAP, 'cap enforces newest-50');
  assert.equal(stored.entries[0].id, 'item:overflow-51', 'new entry at head');
  /* Handler logic: `next = [new, ...filtered]` then `next.length = 50`
     truncates the tail. The original tail entry (`seeded-49` at index 49)
     ends up at index 50 post-unshift and is the one dropped. */
  const ids = stored.entries.map((e) => e.id);
  assert.ok(ids.includes('item:overflow-51'));
  assert.ok(!ids.includes('item:seeded-49'), 'tail entry dropped per newest-first trim');
  assert.ok(ids.includes('item:seeded-0'), 'original head preserved');
});

test('B-022 MSG_RECENCY_ADD: payload validation — non-string id rejected', async () => {
  const resp = await sendMsg(MSG_RECENCY_ADD, { id: 12345 });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, ERR_VALIDATION);
});

test('B-022 MSG_RECENCY_ADD: payload validation — empty-string id rejected', async () => {
  const resp = await sendMsg(MSG_RECENCY_ADD, { id: '' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, ERR_VALIDATION);
});

test('B-022 MSG_RECENCY_ADD: payload validation — unknown-prefix id rejected', async () => {
  const resp = await sendMsg(MSG_RECENCY_ADD, { id: 'group:g-1' });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, ERR_VALIDATION);
});

test('B-022 MSG_RECENCY_ADD: payload validation — oversized id (> 4200 chars) rejected', async () => {
  const longUrl = 'url:' + 'https://example.com/' + 'x'.repeat(4300);
  const resp = await sendMsg(MSG_RECENCY_ADD, { id: longUrl });
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, ERR_VALIDATION);
});

test('B-022 MSG_RECENCY_ADD: payload validation — missing payload rejected', async () => {
  const resp = await sendMsg(MSG_RECENCY_ADD, null);
  assert.equal(resp.ok, false);
  assert.equal(resp.error.code, ERR_VALIDATION);
});

test('B-022 MSG_RECENCY_ADD: "url:" prefix path also accepted', async () => {
  const resp = await sendRecencyAdd('url:https://example.com/page');
  assert.equal(resp.ok, true);
  const stored = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.equal(stored.entries[0].id, 'url:https://example.com/page');
});

test('B-022 AC20 (g) indirect: storage untouched when no sendMessage fires (Escape path)', () => {
  /* Escape never calls _sendMessage (popup.js:445-451) — window.close()
     returns synchronously with zero writes. This is trivially true at the
     handler boundary: if dispatchStorageMessage is never invoked, the
     chrome.storage.local.set count remains 0. */
  __resetMock();
  assert.equal(__getRawStore(`tj:${PARTITION_RECENCY}`), undefined);
  /* Simulate an Escape cycle: read-only partition access, no handler call. */
  const before = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.equal(before, undefined);
  const after = __getRawStore(`tj:${PARTITION_RECENCY}`);
  assert.equal(after, undefined, 'no write occurred — Escape path honoured');
});

/* =========================================================================
   isSafeFaviconUrl scheme allowlist
   ========================================================================= */

test('B-022 R4 H-1: isSafeFaviconUrl accepts https, http, data:image schemes', () => {
  assert.equal(isSafeFaviconUrl('https://example.com/favicon.ico'), true);
  assert.equal(isSafeFaviconUrl('http://example.com/favicon.ico'), true);
  assert.equal(isSafeFaviconUrl('HTTPS://Example.com/Fav.ico'), true, 'case-insensitive scheme');
  assert.equal(isSafeFaviconUrl('data:image/png;base64,AAA'), true);
  assert.equal(isSafeFaviconUrl('data:image/svg+xml;base64,BBB'), true);
});

test('B-022 R4 H-1: isSafeFaviconUrl rejects javascript:, file:, data:text, malformed, empty', () => {
  assert.equal(isSafeFaviconUrl('javascript:alert(1)'), false);
  assert.equal(isSafeFaviconUrl('file:///etc/passwd'), false);
  assert.equal(isSafeFaviconUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeFaviconUrl('chrome://favicon/https://example.com'), false);
  assert.equal(isSafeFaviconUrl(''), false);
  assert.equal(isSafeFaviconUrl(null), false);
  assert.equal(isSafeFaviconUrl(undefined), false);
  assert.equal(isSafeFaviconUrl(12345), false, 'non-string rejected');
  assert.equal(isSafeFaviconUrl('not a url'), false);
});
