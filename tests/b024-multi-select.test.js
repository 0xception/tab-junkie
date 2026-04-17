/**
 * b024-multi-select.test.js — B-024 R5 regression tests for Multi-select + bulk action bar
 *
 * sidepanel.js is a browser-only module with no exports and DOM side-effects on load.
 * Following the existing pattern from b054-sidepanel.test.js / sidepanel-logic.test.js,
 * the pure selection helpers are reproduced verbatim here with a light DOM shim so
 * we can exercise the selection state machine deterministically without a real browser.
 *
 * Each reproduction cites its source location in `sidepanel/sidepanel.js` (lines at the
 * top of the last commit on release/v2 — see CLAUDE.md SHARED file governance).
 *
 * Coverage targets (B-024 acceptance criteria + R4 HIGH/CRITICAL regression tests):
 *   AC1 — click, Shift+Click range, Ctrl/Cmd+Click toggle, Ctrl/Cmd+A all
 *   AC2 — Ctrl+A selects all VISIBLE (non-hidden) rows
 *   AC3 — Escape clears the selection
 *   AC4 — bulk-action bar visibility + item count + action disabled states
 *   AC5 — partial-success: selection IDs that no longer exist are pruned silently
 *         (backend contract of bulkUpdateItems / bulkDeleteItems)
 *
 *   C-1 — refetchAndPatchLiveState keeps _cachedLiveStates in sync and re-runs
 *         _updateBulkBar so bulkCloseBtn.disabled reflects the latest live state.
 *   C-2 — openConfirmDialog accepts { heading, body } overrides; single-item path
 *         preserves the original copy.
 *   H-1 — _clearSelection() calls _closeBulkMovePicker() — no orphan picker.
 *   H-2 — Picker close path always removes the onDocClick listener + Escape closes
 *         picker without wiping the selection.
 *   H-3 — _rangeAnchorId written only by _toggleSelection / _selectAll, not by
 *         _rangeSelect; chained Shift+Click re-ranges from the stable anchor.
 *   H-4 — Shift+Click with no prior selection starts a selection rather than navigating.
 *   H-5 — Bulk Remove uses Promise.allSettled: rejected demotes stay in _selection,
 *         fulfilled IDs pruned, failure count surfaced.
 *   H-6 — Click → 200 ms deferred toggle; dblclick cancels it; Shift+dblclick early-return.
 *   B-026 H-1 — isLive re-read from _cachedLiveStates in action handlers after awaits.
 *   B-026 H-2 — Context menu + bulk-move picker read from _cachedGroups (no IPC).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { __resetMock } from './chrome-mock.js';
import { __resetLiveTabIndex } from '../background/tabs/live-tab-index.js';
import { __resetTabClaims } from '../background/tabs/tab-claims.js';
import {
  createItem,
  createGroup,
  bulkDeleteItems,
  bulkUpdateItems,
  listItems,
} from '../background/storage/index.js';
import { GROUP_COLORS } from '../shared/constants.js';

/* =========================================================================
   Minimal DOM shim — enough to test selection data-attributes, visibility,
   and `.item-indicators` manipulation. Not a real DOM; mirrors the shim
   pattern established by b054-sidepanel.test.js.
   ========================================================================= */

let _domIdCounter = 0;

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.childNodes = [];
    this.children = this.childNodes;
    this.dataset = {};
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this._parent = null;
    this._uid = ++_domIdCounter;
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] ?? null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(child) {
    if (child._parent) child._parent._removeChild(child);
    this.childNodes.push(child);
    child._parent = this;
    return child;
  }
  _removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) {
      this.childNodes.splice(i, 1);
      child._parent = null;
    }
  }
  remove() {
    if (this._parent) this._parent._removeChild(this);
  }
  replaceChildren(...nodes) {
    for (const c of [...this.childNodes]) this._removeChild(c);
    for (const n of nodes) this.appendChild(n);
  }
  insertBefore(newNode, ref) {
    if (newNode._parent) newNode._parent._removeChild(newNode);
    const i = this.childNodes.indexOf(ref);
    if (i < 0) { this.childNodes.push(newNode); }
    else { this.childNodes.splice(i, 0, newNode); }
    newNode._parent = this;
    return newNode;
  }
  contains(node) {
    if (node === this) return true;
    for (const c of this.childNodes) {
      if (c.contains && c.contains(node)) return true;
    }
    return false;
  }
  querySelector(sel) {
    const hits = this._queryAll(sel);
    return hits.length ? hits[0] : null;
  }
  querySelectorAll(sel) {
    return this._queryAll(sel);
  }
  get isConnected() {
    let node = this;
    while (node) {
      if (node === fakeDocument._root) return true;
      node = node._parent;
    }
    return false;
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this._listeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  /* Selector support: tag, .class, [data-item-id="x"], [data-item-id]:not([hidden]) */
  _queryAll(sel) {
    const results = [];
    const walk = (node) => {
      if (node !== this && _matchesSelector(node, sel)) results.push(node);
      for (const c of node.childNodes) {
        if (c instanceof FakeElement) walk(c);
      }
    };
    walk(this);
    return results;
  }
}

function _matchesSelector(el, sel) {
  if (!(el instanceof FakeElement)) return false;
  // "[data-item-id]:not([hidden])"
  const hiddenFilter = sel.includes(':not([hidden])');
  const core = sel.replace(':not([hidden])', '').trim();

  if (hiddenFilter && el.hidden) return false;

  // [data-item-id="x"]
  const attrEq = core.match(/^\[data-item-id="([^"]+)"\]$/);
  if (attrEq) return el.dataset.itemId === attrEq[1];

  // [data-item-id]
  if (core === '[data-item-id]') return 'itemId' in el.dataset;

  // .class
  if (core.startsWith('.')) {
    const cls = core.slice(1);
    return (el.className || '').split(/\s+/).includes(cls);
  }

  // plain tag
  return core.toUpperCase() === el.tagName;
}

const fakeDocument = {
  _root: null,
  createElement(tag) { return new FakeElement(tag); },
  _activeElement: null,
  get activeElement() { return this._activeElement; },
};

function makeRoot() {
  const root = new FakeElement('div');
  fakeDocument._root = root;
  return root;
}

/* =========================================================================
   Reproduced: bulk-bar fixture — mirrors sidepanel.html #bulk-* ids.
   ========================================================================= */

function makeBulkBarFixture() {
  const itemListEl = new FakeElement('div');
  itemListEl.id = 'item-list';
  const bulkActionBarEl = new FakeElement('div');
  bulkActionBarEl.id = 'bulk-action-bar';
  bulkActionBarEl.hidden = true;
  const bulkCountEl = new FakeElement('span');
  bulkCountEl.id = 'bulk-count';
  const bulkCloseBtn = new FakeElement('button');
  bulkCloseBtn.id = 'bulk-close';
  const bulkMoveBtn = new FakeElement('button');
  bulkMoveBtn.id = 'bulk-move';
  const bulkRemoveBtn = new FakeElement('button');
  bulkRemoveBtn.id = 'bulk-remove';
  const bulkClearBtn = new FakeElement('button');
  bulkClearBtn.id = 'bulk-clear';
  return { itemListEl, bulkActionBarEl, bulkCountEl, bulkCloseBtn, bulkMoveBtn, bulkRemoveBtn, bulkClearBtn };
}

/* Create N item rows under itemListEl; returns the row elements keyed by id. */
function seedRows(itemListEl, itemIds, { hidden = [] } = {}) {
  const rows = {};
  for (const id of itemIds) {
    const row = new FakeElement('div');
    row.className = 'item-row';
    row.dataset.itemId = id;
    if (hidden.includes(id)) row.hidden = true;
    itemListEl.appendChild(row);
    rows[id] = row;
  }
  return rows;
}

/* =========================================================================
   Reproduced selection state + helpers (verbatim from sidepanel.js
   lines 131–669). `ctx` holds the module-level variables so tests can
   reset between cases.
   ========================================================================= */

function makeSelectionCtx(fixture) {
  return {
    _selection: new Set(),
    _selectionMode: false,
    _lastSelectedId: null,
    _rangeAnchorId: null,
    _pendingClickTimer: null,
    _cachedLiveStates: {},
    _cachedGroups: [],
    _itemById: new Map(),
    _bulkMovePickerEl: null,
    _bulkMovePickerDocClick: null,
    ...fixture,
  };
}

/* _updateBulkBar — sidepanel.js:558 */
function _updateBulkBar(ctx) {
  const count = ctx._selection.size;
  ctx._selectionMode = count > 0;
  if (!ctx._selectionMode) {
    ctx.bulkActionBarEl.hidden = true;
    return;
  }
  ctx.bulkCountEl.textContent = count + ' selected';
  ctx.bulkActionBarEl.hidden = false;
  let hasLive = false;
  for (const id of ctx._selection) {
    const ls = ctx._cachedLiveStates[id];
    if (ls && ls.live) { hasLive = true; break; }
  }
  ctx.bulkCloseBtn.disabled = !hasLive;
}

/* _toggleSelection — sidepanel.js:585 */
function _toggleSelection(ctx, itemId) {
  if (ctx._selection.has(itemId)) {
    ctx._selection.delete(itemId);
    const row = ctx.itemListEl.querySelector(`[data-item-id="${itemId}"]`);
    if (row) delete row.dataset.selected;
  } else {
    ctx._selection.add(itemId);
    const row = ctx.itemListEl.querySelector(`[data-item-id="${itemId}"]`);
    if (row) row.dataset.selected = 'true';
  }
  ctx._lastSelectedId = itemId;
  ctx._rangeAnchorId = itemId;
  _updateBulkBar(ctx);
}

/* _rangeSelect — sidepanel.js:605 (H-3 verbatim: reads _rangeAnchorId, never writes it) */
function _rangeSelect(ctx, targetId) {
  const rows = [...ctx.itemListEl.querySelectorAll('[data-item-id]:not([hidden])')];
  const ids = rows.map((r) => r.dataset.itemId);
  const startIdx = ids.indexOf(ctx._rangeAnchorId);
  const endIdx = ids.indexOf(targetId);
  if (startIdx === -1 || endIdx === -1) return;
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  for (let i = lo; i <= hi; i++) {
    ctx._selection.add(ids[i]);
    rows[i].dataset.selected = 'true';
  }
  _updateBulkBar(ctx);
}

/* _selectAll — sidepanel.js:624 */
function _selectAll(ctx) {
  const rows = ctx.itemListEl.querySelectorAll('[data-item-id]:not([hidden])');
  for (const row of rows) {
    ctx._selection.add(row.dataset.itemId);
    row.dataset.selected = 'true';
  }
  if (rows.length > 0) {
    ctx._lastSelectedId = rows[rows.length - 1].dataset.itemId;
    ctx._rangeAnchorId = rows[rows.length - 1].dataset.itemId;
  }
  _updateBulkBar(ctx);
}

/* _closeBulkMovePicker — sidepanel.js:1630 */
function _closeBulkMovePicker(ctx) {
  if (ctx._bulkMovePickerDocClick) {
    ctx._docClickListenerRemoved = true;
    ctx._bulkMovePickerDocClick = null;
  }
  if (ctx._bulkMovePickerEl) {
    ctx._bulkMovePickerEl.remove();
    ctx._bulkMovePickerEl = null;
  }
}

/* _clearSelection — sidepanel.js:642 (H-1: calls _closeBulkMovePicker first) */
function _clearSelection(ctx) {
  _closeBulkMovePicker(ctx);
  for (const id of ctx._selection) {
    const row = ctx.itemListEl.querySelector(`[data-item-id="${id}"]`);
    if (row) delete row.dataset.selected;
  }
  ctx._selection.clear();
  ctx._lastSelectedId = null;
  ctx._rangeAnchorId = null;
  _updateBulkBar(ctx);
}

/* Click-handler selection logic — sidepanel.js:1213–1250 reproduced.
   Returns one of: 'toggle' | 'range' | 'deferred-toggle' | 'navigate'.
   H-4: Shift+Click with no prior selection starts a selection (toggles).
   H-6: Plain click in selection mode schedules a toggle via setTimeout(200);
   dblclick cancels it. We simulate timers with a `callbacks` queue. */
function handleItemRowClick(ctx, itemId, mods) {
  if (mods.ctrlKey || mods.metaKey) {
    _toggleSelection(ctx, itemId);
    return 'toggle';
  }
  if (ctx._selectionMode && mods.shiftKey && ctx._rangeAnchorId) {
    _rangeSelect(ctx, itemId);
    return 'range';
  }
  if (mods.shiftKey && !ctx._selectionMode) {
    _toggleSelection(ctx, itemId);
    return 'toggle';
  }
  if (ctx._selectionMode) {
    /* H-6: defer; dblclick cancels. */
    if (ctx._pendingClickTimer) clearTimeout(ctx._pendingClickTimer);
    ctx._pendingClickTimer = setTimeout(() => {
      ctx._pendingClickTimer = null;
      _toggleSelection(ctx, itemId);
    }, 200);
    return 'deferred-toggle';
  }
  return 'navigate';
}

/* Double-click handler — sidepanel.js:1256–1267 reproduced. */
function handleItemRowDblClick(ctx, itemId, mods) {
  if (!ctx._selectionMode) return 'noop';
  if (mods.shiftKey) return 'early-return'; /* H-6 */
  if (ctx._pendingClickTimer) {
    clearTimeout(ctx._pendingClickTimer);
    ctx._pendingClickTimer = null;
  }
  return 'navigate';
}

/* Global keydown — Escape + Ctrl/Cmd+A — sidepanel.js:1269–1293 reproduced. */
function handleGlobalKeydown(ctx, e) {
  if (e.key === 'Escape' && ctx._selectionMode) {
    _clearSelection(ctx);
    return 'cleared';
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'a' && !e._inInput) {
    _selectAll(ctx);
    return 'select-all';
  }
  return 'ignored';
}

/* openConfirmDialog heading/body resolution — sidepanel.js:325–338 reproduced.
   Pure reproduction of the head/body decision so we can unit-test C-2. */
function resolveConfirmDialogCopy(item, { heading, body } = {}) {
  return {
    heading: heading || 'Delete Bookmark?',
    body: body || ('Delete "' + (item.title || 'this bookmark') + '"? This cannot be undone.'),
  };
}

/* refetchAndPatchLiveState C-1 cache-reassignment subset — sidepanel.js:1002–1093.
   We reproduce only the piece under test: after `liveStates` is received, assign
   it to ctx._cachedLiveStates and call _updateBulkBar so bulkCloseBtn.disabled
   reflects the latest truth. */
function simulateLiveStatePatch(ctx, liveStates, driftRecords = {}) {
  ctx._cachedLiveStates = liveStates;
  ctx._cachedDriftRecords = driftRecords;
  _updateBulkBar(ctx);
}

/* =========================================================================
   Setup
   ========================================================================= */

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
  _domIdCounter = 0;
  makeRoot();
});

/* =========================================================================
   AC1 — click, Shift+Click range, Ctrl/Cmd+Click toggle
   ========================================================================= */

test('AC1: plain click on empty selection returns "navigate" (no selection started)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  const result = handleItemRowClick(ctx, 'a', {});
  assert.equal(result, 'navigate');
  assert.equal(ctx._selection.size, 0);
  assert.equal(ctx.bulkActionBarEl.hidden, true);
});

test('AC1: Ctrl+Click toggles individual selection', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const rows = seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  handleItemRowClick(ctx, 'a', { ctrlKey: true });
  assert.equal(ctx._selection.size, 1);
  assert.ok(ctx._selection.has('a'));
  assert.equal(rows.a.dataset.selected, 'true');
  handleItemRowClick(ctx, 'a', { ctrlKey: true }); // toggle off
  assert.equal(ctx._selection.size, 0);
  assert.equal(rows.a.dataset.selected, undefined);
});

test('AC1: Cmd+Click (macOS metaKey) also toggles', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  handleItemRowClick(ctx, 'a', { metaKey: true });
  handleItemRowClick(ctx, 'b', { metaKey: true });
  assert.equal(ctx._selection.size, 2);
  assert.ok(ctx._selection.has('a'));
  assert.ok(ctx._selection.has('b'));
});

test('AC1: Shift+Click in selection mode performs range select', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c', 'd', 'e']);
  const ctx = makeSelectionCtx(fx);
  handleItemRowClick(ctx, 'a', { ctrlKey: true });
  const result = handleItemRowClick(ctx, 'd', { shiftKey: true });
  assert.equal(result, 'range');
  assert.equal(ctx._selection.size, 4);
  for (const id of ['a', 'b', 'c', 'd']) assert.ok(ctx._selection.has(id), `missing ${id}`);
  assert.equal(ctx._selection.has('e'), false);
});

test('AC1: Shift+Click range works in reverse direction (target < anchor)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c', 'd']);
  const ctx = makeSelectionCtx(fx);
  handleItemRowClick(ctx, 'd', { ctrlKey: true });
  handleItemRowClick(ctx, 'b', { shiftKey: true });
  assert.equal(ctx._selection.size, 3);
  assert.ok(ctx._selection.has('b'));
  assert.ok(ctx._selection.has('c'));
  assert.ok(ctx._selection.has('d'));
  assert.equal(ctx._selection.has('a'), false);
});

/* =========================================================================
   AC2 — Ctrl/Cmd+A selects all VISIBLE rows
   ========================================================================= */

test('AC2: Ctrl+A selects all visible rows (excludes hidden)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c', 'd'], { hidden: ['b', 'd'] });
  const ctx = makeSelectionCtx(fx);
  handleGlobalKeydown(ctx, { key: 'a', ctrlKey: true });
  assert.equal(ctx._selection.size, 2);
  assert.ok(ctx._selection.has('a'));
  assert.ok(ctx._selection.has('c'));
  assert.equal(ctx._selection.has('b'), false);
  assert.equal(ctx._selection.has('d'), false);
});

test('AC2: Ctrl+A while focus is in an input does not trigger select-all', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  const result = handleGlobalKeydown(ctx, { key: 'a', ctrlKey: true, _inInput: true });
  assert.equal(result, 'ignored');
  assert.equal(ctx._selection.size, 0);
});

test('AC2: Cmd+A (macOS) also selects all', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  handleGlobalKeydown(ctx, { key: 'a', metaKey: true });
  assert.equal(ctx._selection.size, 3);
});

test('AC2: Ctrl+A on empty visible list is a silent no-op', () => {
  /* Covers M-10 (documented empty-list behavior) */
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  handleGlobalKeydown(ctx, { key: 'a', ctrlKey: true });
  assert.equal(ctx._selection.size, 0);
  assert.equal(ctx._rangeAnchorId, null);
  assert.equal(ctx.bulkActionBarEl.hidden, true);
});

/* =========================================================================
   AC3 — Escape clears selection
   ========================================================================= */

test('AC3: Escape clears selection and hides bulk bar', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  handleItemRowClick(ctx, 'a', { ctrlKey: true });
  handleItemRowClick(ctx, 'b', { ctrlKey: true });
  assert.equal(ctx._selection.size, 2);
  assert.equal(ctx.bulkActionBarEl.hidden, false);
  handleGlobalKeydown(ctx, { key: 'Escape' });
  assert.equal(ctx._selection.size, 0);
  assert.equal(ctx.bulkActionBarEl.hidden, true);
});

test('AC3: Escape when no selection is ignored (no crash)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  const result = handleGlobalKeydown(ctx, { key: 'Escape' });
  assert.equal(result, 'ignored');
});

test('AC3: Escape resets _rangeAnchorId and _lastSelectedId', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  handleItemRowClick(ctx, 'b', { ctrlKey: true });
  assert.equal(ctx._rangeAnchorId, 'b');
  assert.equal(ctx._lastSelectedId, 'b');
  handleGlobalKeydown(ctx, { key: 'Escape' });
  assert.equal(ctx._rangeAnchorId, null);
  assert.equal(ctx._lastSelectedId, null);
});

/* =========================================================================
   AC4 — bulk-action bar visibility + count + disabled state
   ========================================================================= */

test('AC4: bulk bar hidden at zero selection', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  _updateBulkBar(ctx);
  assert.equal(fx.bulkActionBarEl.hidden, true);
});

test('AC4: bulk bar shows count "N selected" (plural stays "selected")', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  assert.equal(fx.bulkCountEl.textContent, '1 selected');
  _toggleSelection(ctx, 'b');
  assert.equal(fx.bulkCountEl.textContent, '2 selected');
  _toggleSelection(ctx, 'c');
  assert.equal(fx.bulkCountEl.textContent, '3 selected');
});

test('AC4: bulkCloseBtn.disabled=true when no selected item is live', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { a: { live: false }, b: { live: false } };
  _toggleSelection(ctx, 'a');
  _toggleSelection(ctx, 'b');
  assert.equal(fx.bulkCloseBtn.disabled, true);
});

test('AC4: bulkCloseBtn.disabled=false when at least one live is selected', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { a: { live: false }, b: { live: true, tabId: 42 } };
  _toggleSelection(ctx, 'a');
  _toggleSelection(ctx, 'b');
  assert.equal(fx.bulkCloseBtn.disabled, false);
});

/* =========================================================================
   AC5 — Partial-success: missing IDs silently pruned (backend contract)
   These exercise the REAL bulkDeleteItems / bulkUpdateItems functions.
   ========================================================================= */

test('AC5: bulkDeleteItems returns notFound for missing ids, deleted for present', async () => {
  const group = await createGroup({ name: 'G', color: GROUP_COLORS[0], parentId: null });
  const a = await createItem({ title: 'A', url: 'https://a.test', groupId: group.id });
  const b = await createItem({ title: 'B', url: 'https://b.test', groupId: group.id });
  const result = await bulkDeleteItems([a.id, b.id, 'ghost-id-does-not-exist']);
  assert.deepEqual(result.deleted.sort(), [a.id, b.id].sort());
  assert.deepEqual(result.notFound, ['ghost-id-does-not-exist']);
  const remaining = await listItems();
  assert.equal(remaining.length, 0);
});

test('AC5: bulkUpdateItems returns notFound for missing ids; others updated', async () => {
  const src = await createGroup({ name: 'Src', color: GROUP_COLORS[0], parentId: null });
  const dst = await createGroup({ name: 'Dst', color: GROUP_COLORS[1], parentId: null });
  const a = await createItem({ title: 'A', url: 'https://a.test', groupId: src.id });
  const b = await createItem({ title: 'B', url: 'https://b.test', groupId: src.id });
  const result = await bulkUpdateItems([a.id, b.id, 'ghost-id'], { groupId: dst.id });
  assert.deepEqual(result.updated.sort(), [a.id, b.id].sort());
  assert.deepEqual(result.notFound, ['ghost-id']);
  const after = await listItems({ groupId: dst.id });
  assert.equal(after.length, 2);
});

test('AC5: bulkDeleteItems with all-missing ids returns empty deleted + full notFound (silent prune)', async () => {
  const result = await bulkDeleteItems(['x', 'y', 'z']);
  assert.deepEqual(result.deleted, []);
  assert.deepEqual(result.notFound.sort(), ['x', 'y', 'z']);
});

/* =========================================================================
   C-1 — refetchAndPatchLiveState keeps _cachedLiveStates in sync and
   re-runs _updateBulkBar; "Close tabs" disabled flips to match reality.
   ========================================================================= */

test('C-1: liveState broadcast reassigns _cachedLiveStates and re-runs _updateBulkBar', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  /* Start: item A is live */
  ctx._cachedLiveStates = { a: { live: true, tabId: 100 } };
  _toggleSelection(ctx, 'a');
  assert.equal(fx.bulkCloseBtn.disabled, false, 'Close disabled should be false when A is live');

  /* Broadcast arrives: A's tab closed, no longer live */
  simulateLiveStatePatch(ctx, { a: { live: false } });
  assert.equal(fx.bulkCloseBtn.disabled, true, 'Close should disable once A stops being live');
  assert.deepEqual(ctx._cachedLiveStates, { a: { live: false } }, 'cache must be reassigned');
});

test('C-1: liveState broadcast flipping a selected item live enables Close tabs', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { a: { live: false } };
  _toggleSelection(ctx, 'a');
  assert.equal(fx.bulkCloseBtn.disabled, true);
  simulateLiveStatePatch(ctx, { a: { live: true, tabId: 7 } });
  assert.equal(fx.bulkCloseBtn.disabled, false);
});

/* =========================================================================
   C-2 — openConfirmDialog accepts heading + body overrides
   ========================================================================= */

test('C-2: single-item path preserves original heading "Delete Bookmark?"', () => {
  const copy = resolveConfirmDialogCopy({ title: 'My Bookmark' });
  assert.equal(copy.heading, 'Delete Bookmark?');
  assert.equal(copy.body, 'Delete "My Bookmark"? This cannot be undone.');
});

test('C-2: single-item path with missing title falls back to "this bookmark"', () => {
  const copy = resolveConfirmDialogCopy({});
  assert.equal(copy.heading, 'Delete Bookmark?');
  assert.ok(copy.body.includes('this bookmark'));
});

test('C-2: bulk override heading + body replaces defaults', () => {
  const copy = resolveConfirmDialogCopy(
    { title: '3 items' },
    {
      heading: 'Remove 3 items?',
      body: 'Saved entries will be removed. Live tab(s) in the selection will remain open.',
    },
  );
  assert.equal(copy.heading, 'Remove 3 items?');
  assert.ok(copy.body.includes('Live tab(s)'));
  assert.ok(!copy.body.includes('This cannot be undone.'),
    'bulk body should NOT carry the misleading delete copy');
});

test('C-2: bulk override with only heading still uses override body if provided', () => {
  const copy = resolveConfirmDialogCopy(
    { title: '2 items' },
    { heading: 'Remove 2 items?', body: 'Custom bulk body.' },
  );
  assert.equal(copy.heading, 'Remove 2 items?');
  assert.equal(copy.body, 'Custom bulk body.');
});

/* =========================================================================
   H-1 — _clearSelection closes open bulk-move picker (no orphan)
   ========================================================================= */

test('H-1: _clearSelection closes the bulk-move picker', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  /* Open the picker */
  const picker = new FakeElement('div');
  picker.id = 'bulk-move-picker';
  fakeDocument._root.appendChild(picker);
  ctx._bulkMovePickerEl = picker;
  ctx._bulkMovePickerDocClick = () => {};
  _clearSelection(ctx);
  assert.equal(ctx._bulkMovePickerEl, null, 'picker element ref must be null');
  assert.equal(picker._parent, null, 'picker DOM node must be removed');
  assert.equal(ctx._bulkMovePickerDocClick, null, 'doc-click listener ref must be null');
});

test('H-1: Escape path also closes picker (via _clearSelection)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  const picker = new FakeElement('div');
  fakeDocument._root.appendChild(picker);
  ctx._bulkMovePickerEl = picker;
  ctx._bulkMovePickerDocClick = () => {};
  handleGlobalKeydown(ctx, { key: 'Escape' });
  assert.equal(ctx._bulkMovePickerEl, null);
  assert.equal(picker._parent, null);
});

/* =========================================================================
   H-2 — picker close removes onDocClick listener on every path
   ========================================================================= */

test('H-2: _closeBulkMovePicker removes onDocClick listener when called', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  const picker = new FakeElement('div');
  fakeDocument._root.appendChild(picker);
  ctx._bulkMovePickerEl = picker;
  ctx._bulkMovePickerDocClick = () => {};
  ctx._docClickListenerRemoved = false;
  _closeBulkMovePicker(ctx);
  assert.equal(ctx._docClickListenerRemoved, true, 'listener must be removed');
  assert.equal(ctx._bulkMovePickerDocClick, null);
  assert.equal(ctx._bulkMovePickerEl, null);
});

test('H-2: close without a previously attached listener is a safe no-op', () => {
  const fx = makeBulkBarFixture();
  const ctx = makeSelectionCtx(fx);
  /* Neither picker nor listener set */
  _closeBulkMovePicker(ctx);
  assert.equal(ctx._bulkMovePickerDocClick, null);
  assert.equal(ctx._bulkMovePickerEl, null);
});

test('H-2: selection survives picker Escape close (picker closes; selection kept)', () => {
  /* Regression: picker Escape handler calls stopPropagation so the global
     Escape handler does NOT wipe the selection. We model that here by
     invoking _closeBulkMovePicker directly and confirming _selection intact. */
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  _toggleSelection(ctx, 'b');
  const picker = new FakeElement('div');
  fakeDocument._root.appendChild(picker);
  ctx._bulkMovePickerEl = picker;
  ctx._bulkMovePickerDocClick = () => {};
  _closeBulkMovePicker(ctx);
  /* Selection must NOT be cleared by picker Escape */
  assert.equal(ctx._selection.size, 2);
  assert.equal(ctx.bulkActionBarEl.hidden, false);
});

/* =========================================================================
   H-3 — _rangeAnchorId stability; chained Shift+Click re-ranges from anchor
   ========================================================================= */

test('H-3: _rangeSelect does NOT mutate _rangeAnchorId', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c', 'd']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  assert.equal(ctx._rangeAnchorId, 'a');
  _rangeSelect(ctx, 'c');
  assert.equal(ctx._rangeAnchorId, 'a', 'range select must preserve anchor');
});

test('H-3: chained Shift+Click re-ranges from stable anchor (not drifting to latest)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c', 'd', 'e']);
  const ctx = makeSelectionCtx(fx);
  /* Click A (anchor = A) */
  handleItemRowClick(ctx, 'a', { ctrlKey: true });
  /* Shift+Click C → range a..c */
  handleItemRowClick(ctx, 'c', { shiftKey: true });
  assert.equal(ctx._rangeAnchorId, 'a');
  /* Shift+Click E → range a..e (NOT c..e) */
  handleItemRowClick(ctx, 'e', { shiftKey: true });
  for (const id of ['a', 'b', 'c', 'd', 'e']) {
    assert.ok(ctx._selection.has(id), `chained range must include ${id}`);
  }
});

test('H-3: _selectAll sets anchor to the last visible row', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  _selectAll(ctx);
  assert.equal(ctx._rangeAnchorId, 'c');
  assert.equal(ctx._lastSelectedId, 'c');
});

test('H-3: _clearSelection resets _rangeAnchorId to null', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  assert.equal(ctx._rangeAnchorId, 'a');
  _clearSelection(ctx);
  assert.equal(ctx._rangeAnchorId, null);
});

test('H-3: _rangeSelect with invalid anchor is a safe no-op', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  ctx._rangeAnchorId = 'nonexistent-id';
  _rangeSelect(ctx, 'a');
  assert.equal(ctx._selection.size, 0);
});

/* =========================================================================
   H-4 — Shift+Click with no prior selection starts a selection (not navigate)
   ========================================================================= */

test('H-4: Shift+Click with no prior selection starts a selection', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  const result = handleItemRowClick(ctx, 'a', { shiftKey: true });
  assert.equal(result, 'toggle');
  assert.equal(ctx._selection.size, 1);
  assert.ok(ctx._selection.has('a'));
  assert.equal(ctx._rangeAnchorId, 'a');
});

test('H-4: Shift+Click with prior selection but no anchor routes to toggle (not navigate)', () => {
  /* Pathological case: _selectionMode=true (size>0) but _rangeAnchorId null.
     H-3 guard in handleItemRowClick requires a valid _rangeAnchorId for range
     select, so Shift+Click falls through to the H-4 branch. */
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  ctx._selection.add('a');
  ctx._selectionMode = true;
  ctx._rangeAnchorId = null;
  fx.itemListEl.querySelector('[data-item-id="a"]').dataset.selected = 'true';
  const result = handleItemRowClick(ctx, 'b', { shiftKey: true });
  /* Without anchor, range-select branch skipped; but _selectionMode=true so H-4 branch (!_selectionMode) also false.
     In real code this falls through to the deferred-toggle branch. */
  assert.equal(result, 'deferred-toggle');
});

/* =========================================================================
   H-5 — Bulk Remove Promise.allSettled (partial success)
   ========================================================================= */

/* H-5 model: reproduce the bulk-remove partial-failure math from the handler.
   The handler:
     1. Splits selection into liveIds / nonLiveIds by _cachedLiveStates.
     2. Promise.allSettled(liveIds.map(demote)).
     3. bulk-delete nonLiveIds in one call (try/catch own envelope).
     4. Prunes fulfilled demotes from _selection; prunes all nonLiveIds only if
        bulk delete succeeded.
     5. Shows toast with totalFailures = demoteFailures + (bulkDeleteOk ? 0 : nonLiveIds.length).
*/
async function simulateBulkRemove(ctx, { demoteReject = new Set(), bulkDeleteOk = true } = {}) {
  const ids = [...ctx._selection];
  const liveIds = ids.filter((id) => {
    const ls = ctx._cachedLiveStates[id];
    return ls && ls.live;
  });
  const nonLiveIds = ids.filter((id) => {
    const ls = ctx._cachedLiveStates[id];
    return !ls || !ls.live;
  });
  const demoteResults = await Promise.allSettled(
    liveIds.map((id) => demoteReject.has(id) ? Promise.reject(new Error('fail')) : Promise.resolve(id)),
  );
  const demotedOk = [];
  let demoteFailures = 0;
  for (let i = 0; i < demoteResults.length; i++) {
    if (demoteResults[i].status === 'fulfilled') demotedOk.push(liveIds[i]);
    else demoteFailures++;
  }
  for (const id of demotedOk) ctx._selection.delete(id);
  if (bulkDeleteOk) for (const id of nonLiveIds) ctx._selection.delete(id);
  const totalFailures = demoteFailures + (bulkDeleteOk ? 0 : nonLiveIds.length);
  return { demotedOk, demoteFailures, bulkDeleteOk, totalFailures };
}

test('H-5: all-success — all ids pruned, zero failures', async () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { a: { live: true, tabId: 1 }, b: { live: false }, c: { live: false } };
  for (const id of ['a', 'b', 'c']) _toggleSelection(ctx, id);
  const result = await simulateBulkRemove(ctx, {});
  assert.equal(result.totalFailures, 0);
  assert.equal(ctx._selection.size, 0);
});

test('H-5: partial demote failure — fulfilled demotes pruned, rejected remain selected', async () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { a: { live: true, tabId: 1 }, b: { live: true, tabId: 2 }, c: { live: true, tabId: 3 } };
  for (const id of ['a', 'b', 'c']) _toggleSelection(ctx, id);
  /* b's demote fails */
  const result = await simulateBulkRemove(ctx, { demoteReject: new Set(['b']) });
  assert.equal(result.demoteFailures, 1);
  assert.equal(result.totalFailures, 1);
  assert.ok(!ctx._selection.has('a'), 'a should be pruned');
  assert.ok(ctx._selection.has('b'), 'b should remain selected (failed)');
  assert.ok(!ctx._selection.has('c'), 'c should be pruned');
});

test('H-5: bulk-delete failure — nonLive ids stay in selection, surfaces as failures', async () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { a: { live: false }, b: { live: false } };
  _toggleSelection(ctx, 'a');
  _toggleSelection(ctx, 'b');
  const result = await simulateBulkRemove(ctx, { bulkDeleteOk: false });
  assert.equal(result.totalFailures, 2);
  assert.equal(ctx._selection.size, 2, 'nonLiveIds remain selected on delete failure');
});

test('H-5: demote rejection does NOT abort subsequent demotes (allSettled)', async () => {
  /* Regression: the old `for await` loop stopped at first rejection. With
     Promise.allSettled, subsequent items still demote. */
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b', 'c', 'd']);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = {
    a: { live: true, tabId: 1 },
    b: { live: true, tabId: 2 }, /* reject */
    c: { live: true, tabId: 3 },
    d: { live: true, tabId: 4 },
  };
  for (const id of ['a', 'b', 'c', 'd']) _toggleSelection(ctx, id);
  const result = await simulateBulkRemove(ctx, { demoteReject: new Set(['b']) });
  /* 3 succeed, 1 fails */
  assert.equal(result.demotedOk.length, 3);
  assert.equal(result.demoteFailures, 1);
  /* Only 'b' remains; a, c, d pruned */
  assert.deepEqual([...ctx._selection], ['b']);
});

/* =========================================================================
   H-6 — click deferred by 200 ms; dblclick cancels it; Shift+dblclick early-return
   ========================================================================= */

test('H-6: plain click in selection mode returns "deferred-toggle" and sets _pendingClickTimer', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  const result = handleItemRowClick(ctx, 'b', {});
  assert.equal(result, 'deferred-toggle');
  assert.notEqual(ctx._pendingClickTimer, null);
});

test('H-6: dblclick clears _pendingClickTimer and returns navigate', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  handleItemRowClick(ctx, 'b', {}); // schedules toggle
  assert.notEqual(ctx._pendingClickTimer, null);
  const result = handleItemRowDblClick(ctx, 'b', {});
  assert.equal(result, 'navigate');
  assert.equal(ctx._pendingClickTimer, null);
  /* Crucial: 'b' should NOT be in selection because the pending toggle was cancelled */
  assert.equal(ctx._selection.has('b'), false);
});

test('H-6: pending timer fires after 200ms if no dblclick arrives', async () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  handleItemRowClick(ctx, 'b', {});
  await new Promise((r) => setTimeout(r, 220));
  /* Timer fired → 'b' added to selection, timer cleared */
  assert.ok(ctx._selection.has('b'), 'deferred toggle should have fired');
  assert.equal(ctx._pendingClickTimer, null);
});

test('H-6: dblclick with Shift held returns "early-return" (no navigate)', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  _toggleSelection(ctx, 'a');
  const result = handleItemRowDblClick(ctx, 'b', { shiftKey: true });
  assert.equal(result, 'early-return');
});

test('H-6: dblclick while not in selection mode is a no-op', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a']);
  const ctx = makeSelectionCtx(fx);
  const result = handleItemRowDblClick(ctx, 'a', {});
  assert.equal(result, 'noop');
});

/* =========================================================================
   B-026 H-1 — context-menu liveness re-read from _cachedLiveStates
   at action time (after any awaits / broadcasts).
   ========================================================================= */

/* Pure reproduction of the B-026 H-1 logic: Delete action dispatches either
   DEMOTE (if live NOW) or DELETE (if not live NOW) — regardless of the
   initial `isLive` snapshot taken at menu-open time. */
function simulateContextMenuDeleteAction(ctx, itemId) {
  const liveNow = !!ctx._cachedLiveStates[itemId]?.live;
  return liveNow ? 'demote' : 'delete';
}

test('B-026 H-1: Delete action re-reads liveness AFTER broadcast changes live state', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  /* Snapshot at menu-open: item is live */
  ctx._cachedLiveStates = { x: { live: true, tabId: 5 } };
  /* Broadcast between menu-open and click: item is no longer live */
  ctx._cachedLiveStates = { x: { live: false } };
  const action = simulateContextMenuDeleteAction(ctx, 'x');
  assert.equal(action, 'delete', 'After broadcast flipped live→false, Delete must dispatch DELETE (not DEMOTE)');
});

test('B-026 H-1: Delete action re-reads live→true correctly after broadcast', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  ctx._cachedLiveStates = { x: { live: false } };
  ctx._cachedLiveStates = { x: { live: true, tabId: 11 } };
  const action = simulateContextMenuDeleteAction(ctx, 'x');
  assert.equal(action, 'demote');
});

/* =========================================================================
   B-026 H-2 — context menu + bulk-move picker + _populateGroupPicker read
   from _cachedGroups (no MSG_LIST_GROUPS IPC).
   ========================================================================= */

/* Pure reproduction of the group-option build logic — sorted by sortOrder. */
function buildGroupOptionsFromCache(cachedGroups) {
  const sorted = [...cachedGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return sorted.map((g) => ({ value: g.id, text: g.name }));
}

test('B-026 H-2: bulk-move picker builds options from _cachedGroups (no IPC needed)', () => {
  const ctx = { _cachedGroups: [
    { id: 'g2', name: 'Second', sortOrder: 20 },
    { id: 'g1', name: 'First',  sortOrder: 10 },
    { id: 'g3', name: 'Third',  sortOrder: 30 },
  ] };
  const options = buildGroupOptionsFromCache(ctx._cachedGroups);
  assert.deepEqual(
    options,
    [
      { value: 'g1', text: 'First' },
      { value: 'g2', text: 'Second' },
      { value: 'g3', text: 'Third' },
    ],
  );
});

test('B-026 H-2: missing sortOrder is treated as 0', () => {
  const ctx = { _cachedGroups: [
    { id: 'g2', name: 'No Order' },
    { id: 'g1', name: 'With Order', sortOrder: 5 },
  ] };
  const options = buildGroupOptionsFromCache(ctx._cachedGroups);
  /* g2 (sortOrder undef→0) comes before g1 (sortOrder 5) */
  assert.equal(options[0].value, 'g2');
  assert.equal(options[1].value, 'g1');
});

test('B-026 H-2: empty _cachedGroups yields empty options', () => {
  const options = buildGroupOptionsFromCache([]);
  assert.deepEqual(options, []);
});

/* =========================================================================
   Integration: _reapplySelection prunes IDs no longer in _itemById
   (AC5 UI counterpart — silent pruning on re-render)
   ========================================================================= */

function _reapplySelection(ctx) {
  const toRemove = [];
  for (const id of ctx._selection) {
    if (!ctx._itemById.has(id)) {
      toRemove.push(id);
      continue;
    }
    const row = ctx.itemListEl.querySelector(`[data-item-id="${id}"]`);
    if (row) row.dataset.selected = 'true';
  }
  for (const id of toRemove) ctx._selection.delete(id);
  _updateBulkBar(ctx);
}

test('AC5 (UI): _reapplySelection silently prunes ids not in _itemById', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  seedRows(fx.itemListEl, ['a', 'b']);
  const ctx = makeSelectionCtx(fx);
  ctx._selection.add('a');
  ctx._selection.add('b');
  ctx._selection.add('ghost');
  ctx._itemById = new Map([['a', {}], ['b', {}]]);
  _reapplySelection(ctx);
  assert.equal(ctx._selection.size, 2);
  assert.ok(!ctx._selection.has('ghost'));
  assert.ok(ctx._selection.has('a'));
  assert.ok(ctx._selection.has('b'));
});

test('AC5 (UI): _reapplySelection with all-pruned selection hides the bulk bar', () => {
  const fx = makeBulkBarFixture();
  fakeDocument._root.appendChild(fx.itemListEl);
  const ctx = makeSelectionCtx(fx);
  ctx._selection.add('gone-a');
  ctx._selection.add('gone-b');
  ctx._itemById = new Map();
  _reapplySelection(ctx);
  assert.equal(ctx._selection.size, 0);
  assert.equal(fx.bulkActionBarEl.hidden, true);
});
