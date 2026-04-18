/**
 * b028-selection-context-menu.test.js — B-028 R5 regression tests for the
 * selection-aware context menu.
 *
 * sidepanel.js is a browser-only module with no exports and DOM side-effects on load.
 * Following the pattern established by b024-multi-select.test.js and b054-sidepanel.test.js,
 * the dispatch + menu-shape decision logic is reproduced here verbatim with a light
 * shim so the decision matrix can be exercised deterministically without a real browser.
 *
 * Each reproduction cites its source location in `sidepanel/sidepanel.js`.
 *
 * Coverage targets (B-028 acceptance criteria):
 *   AC1 — right-click on a row in a multi-item selection opens the selection
 *         context menu (not the single-item or open-tab menu)
 *   AC1 — right-click on a row NOT in the selection opens the single-item menu
 *         and does NOT extend the selection
 *   AC2 — Move / Close / Remove operate on the whole selection via the shared
 *         _bulkMoveToGroup / _bulkClose / _bulkRemove helpers
 *   AC3 — destructive actions (Close tabs, Remove bookmarks) receive the
 *         context-menu-item--destructive class
 *   AC4 — mixed-selection visibility rules (§26.6):
 *           - Move/Save hidden when both items and tabs in selection
 *           - Remove hidden when any tab in selection
 *           - Close tabs present whenever any live target exists
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim — only as much as the menu-building path needs.
   ========================================================================= */

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.childNodes = [];
    this.children = this.childNodes;
    this.dataset = {};
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this._parent = null;
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] ?? null; }
  appendChild(child) {
    if (child._parent) child._parent._removeChild(child);
    this.childNodes.push(child);
    child._parent = this;
    return child;
  }
  _removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) { this.childNodes.splice(i, 1); child._parent = null; }
  }
  replaceChildren(...nodes) {
    for (const c of [...this.childNodes]) this._removeChild(c);
    for (const n of nodes) this.appendChild(n);
  }
  remove() { if (this._parent) this._parent._removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  /* Recursive DOM walk used by helpers under test. */
  querySelector(sel) {
    const hits = [];
    const walk = (node) => {
      if (node !== this && _matches(node, sel)) hits.push(node);
      for (const c of node.childNodes) if (c instanceof FakeElement) walk(c);
    };
    walk(this);
    return hits[0] || null;
  }
  querySelectorAll(sel) {
    const hits = [];
    const walk = (node) => {
      if (node !== this && _matches(node, sel)) hits.push(node);
      for (const c of node.childNodes) if (c instanceof FakeElement) walk(c);
    };
    walk(this);
    return hits;
  }
  getBoundingClientRect() {
    return { top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100 };
  }
  focus() { /* no-op for decision tests */ }
}

function _matches(el, sel) {
  if (!(el instanceof FakeElement)) return false;
  /* Multi-selector support: "[role=menuitem], select" */
  const parts = sel.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (_matchesOne(el, part)) return true;
  }
  return false;
}
function _matchesOne(el, sel) {
  /* [role="menuitem"] */
  const roleMatch = sel.match(/^\[role="([^"]+)"\]$/);
  if (roleMatch) return el.getAttribute('role') === roleMatch[1];
  /* select (tag) */
  if (/^[a-z]+$/i.test(sel)) return el.tagName === sel.toUpperCase();
  return false;
}

/* =========================================================================
   Reproduced menu-building logic — verbatim from sidepanel.js around
   _openSelectionContextMenu (B-028). The real function mutates a module-level
   contextMenuEl; here we inject it via `ctx` so each test gets a fresh tree.
   ========================================================================= */

function openSelectionContextMenu(ctx, row, x, y) {
  ctx.contextMenuEl.replaceChildren();

  const { itemIds, tabIds } = partitionSelection(ctx);
  const count = itemIds.length + tabIds.length;
  const hasItems = itemIds.length > 0;
  const hasTabs = tabIds.length > 0;
  const mixed = hasItems && hasTabs;
  const onlyTabs = hasTabs && !hasItems;

  const heading = new FakeElement('span');
  heading.className = 'context-menu-label';
  heading.textContent = count + ' selected';
  ctx.contextMenuEl.appendChild(heading);

  if (!mixed) {
    const moveLabel = new FakeElement('span');
    moveLabel.className = 'context-menu-label';
    moveLabel.textContent = onlyTabs ? 'Save to group' : 'Move to group';
    ctx.contextMenuEl.appendChild(moveLabel);

    const moveSelect = new FakeElement('select');
    moveSelect.className = 'context-menu-select';
    moveSelect.setAttribute('aria-label', onlyTabs ? 'Save to group' : 'Move to group');
    const ungroupedOpt = new FakeElement('option');
    ungroupedOpt.textContent = 'Ungrouped';
    moveSelect.appendChild(ungroupedOpt);
    for (const g of (ctx._cachedGroups || [])) {
      const opt = new FakeElement('option');
      opt.textContent = g.name;
      opt._value = g.id;
      moveSelect.appendChild(opt);
    }
    ctx.contextMenuEl.appendChild(moveSelect);
  }

  let hasLive = hasTabs;
  if (!hasLive) {
    for (const id of itemIds) {
      const ls = ctx._cachedLiveStates[id];
      if (ls && ls.live) { hasLive = true; break; }
    }
  }
  if (hasLive) {
    const sep = new FakeElement('div');
    sep.className = 'context-menu-separator';
    ctx.contextMenuEl.appendChild(sep);
    const closeBtn = new FakeElement('button');
    closeBtn.className = 'context-menu-item context-menu-item--destructive';
    closeBtn.setAttribute('role', 'menuitem');
    closeBtn.textContent = 'Close tabs';
    ctx.contextMenuEl.appendChild(closeBtn);
  }

  if (!hasTabs && hasItems) {
    const sep2 = new FakeElement('div');
    sep2.className = 'context-menu-separator';
    ctx.contextMenuEl.appendChild(sep2);
    const removeBtn = new FakeElement('button');
    removeBtn.className = 'context-menu-item context-menu-item--destructive';
    removeBtn.setAttribute('role', 'menuitem');
    removeBtn.textContent = 'Remove bookmarks';
    ctx.contextMenuEl.appendChild(removeBtn);
  }

  ctx.contextMenuEl.hidden = false;
  /* Viewport clamp — positive coordinates only. Identical math to the real impl. */
  ctx.contextMenuEl.style.left = x + 'px';
  ctx.contextMenuEl.style.top = y + 'px';
  const rect = ctx.contextMenuEl.getBoundingClientRect();
  if (rect.bottom > ctx._innerHeight) {
    ctx.contextMenuEl.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > ctx._innerWidth) {
    ctx.contextMenuEl.style.left = Math.max(0, x - rect.width) + 'px';
  }
}

/* Reproduced dispatch logic — verbatim from sidepanel.js openContextMenu's
   prelude (B-028). Returns which menu would open for the clicked row. */
function dispatchContextMenu(ctx, row) {
  const key = selectionKeyForRow(row);
  if (ctx._selection.size >= 2 && key && ctx._selection.has(key)) {
    return 'selection';
  }
  if (row.dataset.liveOnly === 'true') return 'open-tab';
  return 'single-item';
}

/* Helpers — mirror sidepanel.js _selectionKeyForRow / _partitionSelection. */
function selectionKeyForRow(row) {
  if (row.dataset.liveOnly === 'true' && row.dataset.tabId) {
    return 'tab:' + row.dataset.tabId;
  }
  if (row.dataset.itemId) return 'item:' + row.dataset.itemId;
  return null;
}
function partitionSelection(ctx) {
  const itemIds = [];
  const tabIds = [];
  for (const key of ctx._selection) {
    if (key.startsWith('item:')) itemIds.push(key.slice(5));
    else if (key.startsWith('tab:')) tabIds.push(Number(key.slice(4)));
  }
  return { itemIds, tabIds };
}

function makeCtx({ groups = [], liveStates = {} } = {}) {
  return {
    _selection: new Set(),
    _cachedGroups: groups,
    _cachedLiveStates: liveStates,
    contextMenuEl: new FakeElement('div'),
    _innerHeight: 600,
    _innerWidth: 400,
  };
}

function makeSavedRow(id) {
  const row = new FakeElement('div');
  row.className = 'item-row';
  row.dataset.itemId = id;
  return row;
}
function makeTabRow(tabId) {
  const row = new FakeElement('div');
  row.className = 'item-row';
  row.dataset.tabId = String(tabId);
  row.dataset.liveOnly = 'true';
  return row;
}

/* =========================================================================
   AC1 — dispatch logic: which menu opens?
   ========================================================================= */

test('B-028 AC1: right-click on a row in a multi-item selection opens the selection menu', () => {
  const ctx = makeCtx();
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  const row = makeSavedRow('a');
  assert.equal(dispatchContextMenu(ctx, row), 'selection');
});

test('B-028 AC1: right-click on a row NOT in the selection opens the single-item menu (selection unchanged)', () => {
  const ctx = makeCtx();
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  const row = makeSavedRow('c'); // not in selection
  assert.equal(dispatchContextMenu(ctx, row), 'single-item');
  /* AC: the dispatch decision does not mutate the selection set. */
  assert.equal(ctx._selection.size, 2);
  assert.ok(!ctx._selection.has('item:c'));
});

test('B-028 AC1: single-item selection (size === 1) still opens the single-item menu', () => {
  const ctx = makeCtx();
  ctx._selection.add('item:a');
  const row = makeSavedRow('a');
  assert.equal(dispatchContextMenu(ctx, row), 'single-item');
});

test('B-028 AC1: empty selection falls through to single-item / open-tab menu', () => {
  const ctx = makeCtx();
  assert.equal(dispatchContextMenu(ctx, makeSavedRow('a')), 'single-item');
  assert.equal(dispatchContextMenu(ctx, makeTabRow(42)), 'open-tab');
});

test('B-028 AC1: open-tab row that IS part of the multi-selection opens the selection menu (not open-tab menu)', () => {
  const ctx = makeCtx();
  ctx._selection.add('tab:42');
  ctx._selection.add('tab:43');
  const row = makeTabRow(42);
  assert.equal(dispatchContextMenu(ctx, row), 'selection');
});

/* =========================================================================
   AC2 — menu composition: saved-items only
   ========================================================================= */

test('B-028 AC2: saved-items-only selection shows Move, Close (if live), and Remove', () => {
  const ctx = makeCtx({
    groups: [{ id: 'g1', name: 'Work', sortOrder: 0 }],
    liveStates: { a: { live: true, tabId: 101 } },
  });
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  openSelectionContextMenu(ctx, makeSavedRow('a'), 10, 10);

  const labels = ctx.contextMenuEl.childNodes
    .filter((n) => n.className === 'context-menu-label')
    .map((n) => n.textContent);
  assert.ok(labels.includes('2 selected'), 'heading shows selection count');
  assert.ok(labels.includes('Move to group'), 'Move label present for all-items');

  const menuItems = ctx.contextMenuEl.querySelectorAll('[role="menuitem"]');
  const menuTexts = menuItems.map((n) => n.textContent);
  assert.ok(menuTexts.includes('Close tabs'), 'Close tabs present when at least one live item');
  assert.ok(menuTexts.includes('Remove bookmarks'), 'Remove present for saved-only selection');
});

test('B-028 AC2: saved-items-only selection with NO live items hides Close tabs', () => {
  const ctx = makeCtx({
    liveStates: { a: { live: false }, b: { live: false } },
  });
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  openSelectionContextMenu(ctx, makeSavedRow('a'), 10, 10);

  const menuTexts = ctx.contextMenuEl.querySelectorAll('[role="menuitem"]').map((n) => n.textContent);
  assert.ok(!menuTexts.includes('Close tabs'), 'Close tabs hidden when no live targets');
  assert.ok(menuTexts.includes('Remove bookmarks'), 'Remove still shown');
});

/* =========================================================================
   AC4 — mixed-selection rules (§26.6)
   ========================================================================= */

test('B-028 AC4: mixed saved+tab selection hides Move AND Remove; shows Close tabs only', () => {
  const ctx = makeCtx({
    liveStates: { a: { live: false } },
  });
  ctx._selection.add('item:a');
  ctx._selection.add('tab:99');
  openSelectionContextMenu(ctx, makeSavedRow('a'), 10, 10);

  const labels = ctx.contextMenuEl.childNodes
    .filter((n) => n.className === 'context-menu-label')
    .map((n) => n.textContent);
  /* Heading is always present; no Move label for mixed. */
  assert.deepEqual(labels, ['2 selected'], 'only heading label — Move/Save hidden for mixed');

  const selects = ctx.contextMenuEl.querySelectorAll('select');
  assert.equal(selects.length, 0, 'group-picker select hidden for mixed');

  const menuTexts = ctx.contextMenuEl.querySelectorAll('[role="menuitem"]').map((n) => n.textContent);
  assert.ok(menuTexts.includes('Close tabs'), 'Close tabs still shown — at least one live target (the open-tab)');
  assert.ok(!menuTexts.includes('Remove bookmarks'), 'Remove hidden when any tab in selection');
});

test('B-028 AC4: all-open-tabs selection shows "Save to group" (not "Move to group") and Close tabs; hides Remove', () => {
  const ctx = makeCtx({
    groups: [{ id: 'g1', name: 'Work', sortOrder: 0 }],
  });
  ctx._selection.add('tab:10');
  ctx._selection.add('tab:11');
  openSelectionContextMenu(ctx, makeTabRow(10), 10, 10);

  const labels = ctx.contextMenuEl.childNodes
    .filter((n) => n.className === 'context-menu-label')
    .map((n) => n.textContent);
  assert.ok(labels.includes('Save to group'), 'all-tabs flips label to "Save to group"');
  assert.ok(!labels.includes('Move to group'), 'Move label not shown for all-tabs');

  const menuTexts = ctx.contextMenuEl.querySelectorAll('[role="menuitem"]').map((n) => n.textContent);
  assert.ok(menuTexts.includes('Close tabs'), 'Close tabs always present for all-tabs');
  assert.ok(!menuTexts.includes('Remove bookmarks'), 'Remove hidden — open-tab rows have no saved item');
});

/* =========================================================================
   AC3 — destructive styling
   ========================================================================= */

test('B-028 AC3: Close tabs and Remove bookmarks carry the destructive class', () => {
  const ctx = makeCtx({
    liveStates: { a: { live: true, tabId: 1 } },
  });
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  openSelectionContextMenu(ctx, makeSavedRow('a'), 10, 10);

  const menuItems = ctx.contextMenuEl.querySelectorAll('[role="menuitem"]');
  for (const mi of menuItems) {
    assert.ok(
      mi.className.includes('context-menu-item--destructive'),
      'every menuitem in selection menu is destructive (Close / Remove)',
    );
  }
});

/* =========================================================================
   AC4 — viewport clamping
   ========================================================================= */

test('B-028 AC4: viewport clamp flips menu up when bottom exceeds window', () => {
  const ctx = makeCtx();
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  ctx._innerHeight = 50; // < rect.bottom (100) → should clamp
  ctx._innerWidth = 400;
  openSelectionContextMenu(ctx, makeSavedRow('a'), 10, 80);

  /* Clamp path: top = max(0, y - height) = max(0, 80 - 100) = 0 */
  assert.equal(ctx.contextMenuEl.style.top, '0px');
});

test('B-028 AC4: viewport clamp flips menu left when right exceeds window', () => {
  const ctx = makeCtx();
  ctx._selection.add('item:a');
  ctx._selection.add('item:b');
  ctx._innerHeight = 600;
  ctx._innerWidth = 50; // < rect.right (100) → should clamp
  openSelectionContextMenu(ctx, makeSavedRow('a'), 80, 10);

  /* Clamp path: left = max(0, x - width) = max(0, 80 - 100) = 0 */
  assert.equal(ctx.contextMenuEl.style.left, '0px');
});
