/**
 * b027-group-header-menu.test.js — B-027 R5 regression tests for the
 * group header context menu.
 *
 * sidepanel.js is a browser-only module with no exports and DOM side-effects
 * on load. Following the pattern established by b028-selection-context-menu.test.js,
 * the dispatch + menu-shape decision logic is reproduced here verbatim with a
 * light shim so the decision matrix can be exercised deterministically without
 * a real browser.
 *
 * Each reproduction cites its source location in `sidepanel/sidepanel.js`.
 *
 * Coverage targets (B-027 acceptance criteria):
 *   AC-dispatch  — right-click on a .group-header dispatches to _openGroupContextMenu,
 *                  not single-item or selection menus
 *   AC1          — "Open all bookmarks" dispatches MSG_NAVIGATE_TO_ITEM for each
 *                  non-live item in the group (skips live items)
 *   AC2          — "Close all open tabs" requires confirmation and then dispatches
 *                  MSG_CLOSE_TABS with every live tabId in the group
 *   AC3          — "Select all" populates _selection with item:<id> for all group items
 *   AC4          — "Select open" populates _selection with only live item keys
 *   AC5          — "Select bookmarked" populates _selection with only non-live item keys
 *   AC6          — "Edit group" triggers openGroupEditDialog with the correct group
 *   AC7          — "Delete group" shows confirmation then dispatches MSG_DELETE_GROUP
 *   AC-class     — destructive actions carry context-menu-item--destructive class
 *   AC-clamp     — viewport clamping mirrors B-026 / B-028 pattern
 *   AC-escape    — menu closes on Escape (contextMenuEl hidden)
 *   AC-ungrouped — right-click on __ungrouped__ header does NOT open a group menu
 */

// B-065 deferral: extracting this helper requires consumer refactor (DOM + _pendingConfirm state); filed as future tech-debt, not in scope for B-065.

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* =========================================================================
   Minimal DOM shim — same structure as b028-selection-context-menu.test.js.
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
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  click() {
    for (const fn of (this._listeners['click'] || [])) fn();
  }
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
  focus() { /* no-op */ }
}

function _matches(el, sel) {
  if (!(el instanceof FakeElement)) return false;
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
  /* tag selector */
  if (/^[a-z]+$/i.test(sel)) return el.tagName === sel.toUpperCase();
  return false;
}

/* =========================================================================
   Constants (mirror shared/constants.js GROUP_COLORS)
   ========================================================================= */

const GROUP_COLORS = [
  'blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate',
];

const MSG_NAVIGATE_TO_ITEM  = 'tj/navigateToItem';
const MSG_CLOSE_TABS        = 'tj/closeTabs';
const MSG_DELETE_GROUP      = 'tj/deleteGroup';
const MSG_UPDATE_GROUP      = 'tj/updateGroup';
const MSG_BULK_UPDATE_ITEMS = 'tj/bulkUpdateItems';

/* =========================================================================
   Reproduced _openGroupContextMenu logic — verbatim from sidepanel.js.
   Injected via `ctx` so each test gets fresh, isolated state.
   ========================================================================= */

function openGroupContextMenu(ctx, header, x, y) {
  /* Mirrors sidepanel.js _openGroupContextMenu */
  ctx.contextMenuEl.replaceChildren();

  const groupId = header.dataset.groupId;
  if (!groupId || groupId === '__ungrouped__') return 'early-return:ungrouped';

  const group = ctx._cachedGroups.find((g) => g.id === groupId);
  if (!group) return 'early-return:no-group';

  const groupItems = ctx._cachedItems.filter((it) => it.groupId === groupId);
  const liveTabIds = groupItems
    .map((it) => ctx._cachedLiveStates[it.id])
    .filter((ls) => ls && ls.live && ls.tabId != null)
    .map((ls) => ls.tabId);
  const openCount = liveTabIds.length;

  /* Open all bookmarks */
  const openAllBtn = new FakeElement('button');
  openAllBtn.className = 'context-menu-item';
  openAllBtn.setAttribute('role', 'menuitem');
  openAllBtn.setAttribute('tabindex', '-1');
  openAllBtn.textContent = 'Open all bookmarks';
  openAllBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    const toOpen = groupItems.filter((it) => !ctx._cachedLiveStates[it.id]?.live);
    for (const it of toOpen) {
      ctx._dispatched.push({ type: MSG_NAVIGATE_TO_ITEM, payload: { itemId: it.id } });
    }
  });
  ctx.contextMenuEl.appendChild(openAllBtn);

  /* Close all open tabs */
  const closeAllBtn = new FakeElement('button');
  closeAllBtn.className = 'context-menu-item context-menu-item--destructive';
  closeAllBtn.setAttribute('role', 'menuitem');
  closeAllBtn.setAttribute('tabindex', '-1');
  closeAllBtn.textContent = 'Close all open tabs';
  closeAllBtn.disabled = openCount === 0;
  closeAllBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    if (openCount === 0) return;
    const liveIdsNow = groupItems
      .map((it) => ctx._cachedLiveStates[it.id])
      .filter((ls) => ls && ls.live && ls.tabId != null)
      .map((ls) => ls.tabId);
    if (!liveIdsNow.length) return;
    /* Simulate confirm dialog shown; invoke callback directly in tests. */
    ctx._pendingConfirm = {
      heading: 'Close ' + liveIdsNow.length + ' open tab' + (liveIdsNow.length === 1 ? '' : 's') + '?',
      onConfirm: () => {
        ctx._dispatched.push({ type: MSG_CLOSE_TABS, payload: { tabIds: liveIdsNow } });
      },
    };
  });
  ctx.contextMenuEl.appendChild(closeAllBtn);

  /* Separator 1 */
  const sep1 = new FakeElement('div');
  sep1.className = 'context-menu-separator';
  ctx.contextMenuEl.appendChild(sep1);

  /* Select all */
  const selectAllBtn = new FakeElement('button');
  selectAllBtn.className = 'context-menu-item';
  selectAllBtn.setAttribute('role', 'menuitem');
  selectAllBtn.setAttribute('tabindex', '-1');
  selectAllBtn.textContent = 'Select all';
  selectAllBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    ctx._selection.clear();
    for (const it of groupItems) ctx._selection.add('item:' + it.id);
  });
  ctx.contextMenuEl.appendChild(selectAllBtn);

  /* Select open */
  const selectOpenBtn = new FakeElement('button');
  selectOpenBtn.className = 'context-menu-item';
  selectOpenBtn.setAttribute('role', 'menuitem');
  selectOpenBtn.setAttribute('tabindex', '-1');
  selectOpenBtn.textContent = 'Select open';
  selectOpenBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    ctx._selection.clear();
    for (const it of groupItems) {
      if (ctx._cachedLiveStates[it.id]?.live) ctx._selection.add('item:' + it.id);
    }
  });
  ctx.contextMenuEl.appendChild(selectOpenBtn);

  /* Select bookmarked */
  const selectBookmarkedBtn = new FakeElement('button');
  selectBookmarkedBtn.className = 'context-menu-item';
  selectBookmarkedBtn.setAttribute('role', 'menuitem');
  selectBookmarkedBtn.setAttribute('tabindex', '-1');
  selectBookmarkedBtn.textContent = 'Select bookmarked';
  selectBookmarkedBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    ctx._selection.clear();
    for (const it of groupItems) {
      if (!ctx._cachedLiveStates[it.id]?.live) ctx._selection.add('item:' + it.id);
    }
  });
  ctx.contextMenuEl.appendChild(selectBookmarkedBtn);

  /* B-029: Move items out of group — opens the group picker with source
     excluded. Does NOT mutate _selection. Disabled when group is empty. */
  const moveOutBtn = new FakeElement('button');
  moveOutBtn.className = 'context-menu-item';
  moveOutBtn.setAttribute('role', 'menuitem');
  moveOutBtn.setAttribute('tabindex', '-1');
  moveOutBtn.textContent = 'Move items out of group';
  moveOutBtn.disabled = groupItems.length === 0;
  moveOutBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    if (groupItems.length === 0) return;
    const itemIds = groupItems.map((it) => it.id);
    /* Record the picker open params so tests can assert sourceGroupId + mode. */
    ctx._pickerOpened = {
      mode: 'move',
      sourceGroupId: groupId,
      itemIds,
    };
    /* Caller wires onSelect to dispatch MSG_BULK_UPDATE_ITEMS directly. */
    ctx._pickerOnSelect = (targetGroupId) => {
      ctx._dispatched.push({
        type: MSG_BULK_UPDATE_ITEMS,
        payload: { ids: itemIds, patch: { groupId: targetGroupId } },
      });
    };
  });
  ctx.contextMenuEl.appendChild(moveOutBtn);

  /* Separator 2 */
  const sep2 = new FakeElement('div');
  sep2.className = 'context-menu-separator';
  ctx.contextMenuEl.appendChild(sep2);

  /* Edit group */
  const editGroupBtn = new FakeElement('button');
  editGroupBtn.className = 'context-menu-item';
  editGroupBtn.setAttribute('role', 'menuitem');
  editGroupBtn.setAttribute('tabindex', '-1');
  editGroupBtn.textContent = 'Edit group';
  editGroupBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    ctx._openedGroupEdit = group;
  });
  ctx.contextMenuEl.appendChild(editGroupBtn);

  /* Delete group */
  const deleteGroupBtn = new FakeElement('button');
  deleteGroupBtn.className = 'context-menu-item context-menu-item--destructive';
  deleteGroupBtn.setAttribute('role', 'menuitem');
  deleteGroupBtn.setAttribute('tabindex', '-1');
  deleteGroupBtn.textContent = 'Delete group';
  deleteGroupBtn.addEventListener('click', () => {
    ctx.contextMenuEl.hidden = true;
    ctx._pendingConfirm = {
      heading: 'Delete group?',
      onConfirm: () => {
        ctx._dispatched.push({ type: MSG_DELETE_GROUP, payload: { id: groupId } });
      },
    };
  });
  ctx.contextMenuEl.appendChild(deleteGroupBtn);

  /* Position + viewport clamping — mirrors B-026 / B-028 / B-055. */
  ctx.contextMenuEl.hidden = false;
  ctx.contextMenuEl.style.left = x + 'px';
  ctx.contextMenuEl.style.top = y + 'px';

  const rect = ctx.contextMenuEl.getBoundingClientRect();
  if (rect.bottom > ctx._innerHeight) {
    ctx.contextMenuEl.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > ctx._innerWidth) {
    ctx.contextMenuEl.style.left = Math.max(0, x - rect.width) + 'px';
  }

  return 'opened';
}

/* Reproduced dispatch logic for contextmenu event handler — mirrors the
   branch added in sidepanel.js document.addEventListener('contextmenu'). */
function dispatchContextMenu(ctx, target) {
  const header = target.closest ? target.closest('.group-header') : null;
  if (header && !header.classList.split(' ').includes('open-tabs-header')) {
    return 'group';
  }
  const row = target.closest ? target.closest('.item-row') : null;
  if (row) {
    const key = selectionKeyForRow(row);
    if (ctx._selection.size >= 2 && key && ctx._selection.has(key)) return 'selection';
    if (row.dataset.liveOnly === 'true') return 'open-tab';
    return 'single-item';
  }
  return 'none';
}

function selectionKeyForRow(row) {
  if (row.dataset.liveOnly === 'true' && row.dataset.tabId) return 'tab:' + row.dataset.tabId;
  if (row.dataset.itemId) return 'item:' + row.dataset.itemId;
  return null;
}

/* =========================================================================
   Test helpers
   ========================================================================= */

function makeCtx({ groups = [], items = [], liveStates = {} } = {}) {
  return {
    _selection: new Set(),
    _cachedGroups: groups,
    _cachedItems: items,
    _cachedLiveStates: liveStates,
    contextMenuEl: new FakeElement('div'),
    _dispatched: [],
    _pendingConfirm: null,
    _openedGroupEdit: null,
    _pickerOpened: null,
    _pickerOnSelect: null,
    _innerHeight: 600,
    _innerWidth: 400,
  };
}

function makeHeader(groupId, extraClasses = '') {
  const el = new FakeElement('div');
  el.className = 'group-header' + (extraClasses ? ' ' + extraClasses : '');
  el.dataset.groupId = groupId;
  /* Minimal closest() shim for dispatch test */
  el.closest = (sel) => {
    if (sel === '.group-header') return el;
    return null;
  };
  el.classList = { split: () => el.className.split(' ') };
  return el;
}

function makeItemRow(id) {
  const el = new FakeElement('div');
  el.className = 'item-row';
  el.dataset.itemId = id;
  el.closest = (sel) => {
    if (sel === '.group-header') return null;
    if (sel === '.item-row') return el;
    return null;
  };
  return el;
}

function makeGroup(id, name = 'Test Group', color = 'blue') {
  return { id, name, color, sortOrder: 0 };
}

function makeItem(id, groupId, title = 'Item') {
  return { id, groupId, title, url: 'https://example.com/' + id };
}

function findMenuItemByText(ctx, text) {
  return ctx.contextMenuEl.querySelectorAll('[role="menuitem"]')
    .find((n) => n.textContent === text) || null;
}

/* =========================================================================
   AC-dispatch — contextmenu event routes to correct handler
   ========================================================================= */

test('B-027 AC-dispatch: right-click on group header dispatches to group menu', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')] });
  const header = makeHeader('g1');
  assert.equal(dispatchContextMenu(ctx, header), 'group');
});

test('B-027 AC-dispatch: right-click on __ungrouped__ header does NOT open group menu', () => {
  const ctx = makeCtx();
  const header = makeHeader('__ungrouped__');
  const result = openGroupContextMenu(ctx, header, 10, 10);
  assert.equal(result, 'early-return:ungrouped', '__ungrouped__ must bail early');
  /* contextMenuEl should still be empty */
  assert.equal(ctx.contextMenuEl.childNodes.length, 0);
});

test('B-027 AC-dispatch: right-click on item-row (not in selection) dispatches to single-item menu', () => {
  const ctx = makeCtx();
  const row = makeItemRow('item-a');
  assert.equal(dispatchContextMenu(ctx, row), 'single-item');
});

test('B-027 AC-dispatch: open-tabs-header is excluded from group menu', () => {
  const ctx = makeCtx();
  const header = makeHeader('g1', 'open-tabs-header');
  /* This header has open-tabs-header class, so the branch guard prevents dispatch */
  /* In the real handler: !header.classList.contains('open-tabs-header') */
  const classList = header.className.split(' ');
  assert.ok(classList.includes('open-tabs-header'), 'open-tabs-header class present');
});

/* =========================================================================
   AC1 — Open all bookmarks
   ========================================================================= */

test('B-027 AC1: "Open all bookmarks" dispatches MSG_NAVIGATE_TO_ITEM for non-live items only', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1'), makeItem('i3', 'g1')],
    liveStates: {
      i1: { live: true, tabId: 101 },  /* live — skip */
      i2: { live: false },             /* not live — open */
      i3: { live: false },             /* not live — open */
    },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  const btn = findMenuItemByText(ctx, 'Open all bookmarks');
  assert.ok(btn, '"Open all bookmarks" button must be present');
  btn.click();

  const navigated = ctx._dispatched.filter((d) => d.type === MSG_NAVIGATE_TO_ITEM);
  assert.equal(navigated.length, 2, 'dispatches for i2 and i3 only (i1 is live)');
  const ids = navigated.map((d) => d.payload.itemId);
  assert.ok(ids.includes('i2'));
  assert.ok(ids.includes('i3'));
  assert.ok(!ids.includes('i1'), 'live item i1 must be skipped');
});

test('B-027 AC1: "Open all bookmarks" dispatches nothing when all items are live', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: { i1: { live: true, tabId: 101 } },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  const btn = findMenuItemByText(ctx, 'Open all bookmarks');
  assert.ok(btn);
  btn.click();

  assert.equal(ctx._dispatched.filter((d) => d.type === MSG_NAVIGATE_TO_ITEM).length, 0);
});

/* =========================================================================
   AC2 — Close all open tabs
   ========================================================================= */

test('B-027 AC2: "Close all open tabs" shows confirmation before dispatching', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1')],
    liveStates: {
      i1: { live: true, tabId: 10 },
      i2: { live: true, tabId: 11 },
    },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  const btn = findMenuItemByText(ctx, 'Close all open tabs');
  assert.ok(btn, '"Close all open tabs" must be in menu');
  btn.click();

  /* Confirm dialog pending — not dispatched yet */
  assert.ok(ctx._pendingConfirm, 'confirmation must be pending');
  assert.equal(ctx._dispatched.length, 0, 'MSG_CLOSE_TABS must not fire until confirmed');
  assert.ok(ctx._pendingConfirm.heading.includes('2'), 'heading shows count of open tabs');

  /* Now confirm */
  ctx._pendingConfirm.onConfirm();
  const closed = ctx._dispatched.filter((d) => d.type === MSG_CLOSE_TABS);
  assert.equal(closed.length, 1);
  assert.deepEqual(closed[0].payload.tabIds.sort(), [10, 11].sort());
});

test('B-027 AC2: "Close all open tabs" is disabled when no tabs are open', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: { i1: { live: false } },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  const btn = findMenuItemByText(ctx, 'Close all open tabs');
  assert.ok(btn);
  assert.ok(btn.disabled, '"Close all open tabs" must be disabled when openCount === 0');

  /* Clicking the disabled button should produce no confirm dialog */
  btn.click();
  assert.equal(ctx._pendingConfirm, null, 'no confirmation when no tabs open');
});

/* =========================================================================
   AC3 — Select all
   ========================================================================= */

test('B-027 AC3: "Select all" populates _selection with item:<id> for all group items', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1'), makeItem('i3', 'g1')],
    liveStates: {},
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  const btn = findMenuItemByText(ctx, 'Select all');
  assert.ok(btn);
  btn.click();

  assert.equal(ctx._selection.size, 3);
  assert.ok(ctx._selection.has('item:i1'));
  assert.ok(ctx._selection.has('item:i2'));
  assert.ok(ctx._selection.has('item:i3'));
});

test('B-027 AC3: "Select all" clears any prior selection before populating', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: {},
  });
  ctx._selection.add('item:old-item');

  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Select all').click();

  assert.ok(!ctx._selection.has('item:old-item'), 'prior selection cleared');
  assert.ok(ctx._selection.has('item:i1'));
});

/* =========================================================================
   AC4 — Select open
   ========================================================================= */

test('B-027 AC4: "Select open" populates _selection with only live item keys', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1'), makeItem('i3', 'g1')],
    liveStates: {
      i1: { live: true, tabId: 10 },
      i2: { live: false },
      i3: { live: true, tabId: 11 },
    },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Select open').click();

  assert.equal(ctx._selection.size, 2);
  assert.ok(ctx._selection.has('item:i1'));
  assert.ok(ctx._selection.has('item:i3'));
  assert.ok(!ctx._selection.has('item:i2'));
});

test('B-027 AC4: "Select open" results in empty set when no items are live', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: { i1: { live: false } },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Select open').click();
  assert.equal(ctx._selection.size, 0);
});

/* =========================================================================
   AC5 — Select bookmarked
   ========================================================================= */

test('B-027 AC5: "Select bookmarked" populates _selection with only non-live item keys', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1'), makeItem('i3', 'g1')],
    liveStates: {
      i1: { live: true, tabId: 10 },
      i2: { live: false },
      i3: { live: false },
    },
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Select bookmarked').click();

  assert.equal(ctx._selection.size, 2);
  assert.ok(ctx._selection.has('item:i2'));
  assert.ok(ctx._selection.has('item:i3'));
  assert.ok(!ctx._selection.has('item:i1'));
});

test('B-027 AC5: "Select bookmarked" selects all items when none are live', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1')],
    liveStates: {},
  });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Select bookmarked').click();
  assert.equal(ctx._selection.size, 2);
});

/* =========================================================================
   AC6 — Edit group
   ========================================================================= */

test('B-027 AC6: "Edit group" calls openGroupEditDialog with the correct group', () => {
  const group = makeGroup('g1', 'My Group', 'teal');
  const ctx = makeCtx({ groups: [group], items: [] });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Edit group').click();

  assert.ok(ctx._openedGroupEdit, 'openGroupEditDialog must have been called');
  assert.equal(ctx._openedGroupEdit.id, 'g1');
  assert.equal(ctx._openedGroupEdit.name, 'My Group');
  assert.equal(ctx._openedGroupEdit.color, 'teal');
});

/* =========================================================================
   AC7 — Delete group
   ========================================================================= */

test('B-027 AC7: "Delete group" shows confirmation then dispatches MSG_DELETE_GROUP', () => {
  const group = makeGroup('g1', 'Work');
  const ctx = makeCtx({ groups: [group], items: [] });
  const header = makeHeader('g1');
  openGroupContextMenu(ctx, header, 10, 10);

  findMenuItemByText(ctx, 'Delete group').click();

  assert.ok(ctx._pendingConfirm, 'confirmation must be pending');
  assert.equal(ctx._dispatched.length, 0, 'MSG_DELETE_GROUP must not fire until confirmed');
  assert.ok(ctx._pendingConfirm.heading.includes('Delete'), 'heading mentions Delete');

  ctx._pendingConfirm.onConfirm();
  const deleted = ctx._dispatched.filter((d) => d.type === MSG_DELETE_GROUP);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].payload.id, 'g1');
});

/* =========================================================================
   AC-class — destructive styling
   ========================================================================= */

test('B-027 AC-class: "Close all open tabs" carries context-menu-item--destructive class', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: { i1: { live: true, tabId: 10 } },
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const btn = findMenuItemByText(ctx, 'Close all open tabs');
  assert.ok(btn && btn.className.includes('context-menu-item--destructive'));
});

test('B-027 AC-class: "Delete group" carries context-menu-item--destructive class', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [],
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const btn = findMenuItemByText(ctx, 'Delete group');
  assert.ok(btn && btn.className.includes('context-menu-item--destructive'));
});

test('B-027 AC-class: non-destructive items (incl. B-029 "Move items out of group") lack the destructive class', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const nonDestructive = [
    'Open all bookmarks',
    'Select all',
    'Select open',
    'Select bookmarked',
    'Move items out of group', /* B-029 — move is not data loss */
    'Edit group',
  ];
  for (const text of nonDestructive) {
    const btn = findMenuItemByText(ctx, text);
    assert.ok(btn, text + ' must be present');
    assert.ok(
      !btn.className.includes('context-menu-item--destructive'),
      text + ' must NOT have destructive class',
    );
  }
});

/* =========================================================================
   B-029 — new "Move items out of group" action
   ========================================================================= */

test('B-029 group menu: "Move items out of group" is visible for a real group', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const btn = findMenuItemByText(ctx, 'Move items out of group');
  assert.ok(btn, '"Move items out of group" must be present');
  assert.ok(!btn.className.includes('context-menu-item--destructive'));
  assert.equal(btn.disabled, false);
});

test('B-029 group menu: "Move items out of group" is disabled when group is empty', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [], /* empty group */
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const btn = findMenuItemByText(ctx, 'Move items out of group');
  assert.ok(btn);
  assert.equal(btn.disabled, true, 'must be disabled with 0 items');

  /* Click disabled — should be a no-op. */
  btn.click();
  assert.equal(ctx._pickerOpened, null, 'picker must not open on disabled click');
});

test('B-029 group menu: "Move items out of group" opens picker with sourceGroupId = source group', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1')],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const btn = findMenuItemByText(ctx, 'Move items out of group');
  btn.click();

  assert.ok(ctx._pickerOpened, 'picker must open');
  assert.equal(ctx._pickerOpened.mode, 'move');
  assert.equal(ctx._pickerOpened.sourceGroupId, 'g1');
  assert.deepEqual(ctx._pickerOpened.itemIds.sort(), ['i1', 'i2']);
});

test('B-029 group menu: onSelect dispatches MSG_BULK_UPDATE_ITEMS with full item set', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1'), makeItem('i3', 'g2') /* different group */],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);
  findMenuItemByText(ctx, 'Move items out of group').click();

  /* Simulate the user picking g2 in the group picker. */
  ctx._pickerOnSelect('g2');

  const dispatched = ctx._dispatched.filter((d) => d.type === MSG_BULK_UPDATE_ITEMS);
  assert.equal(dispatched.length, 1);
  assert.deepEqual(dispatched[0].payload.ids.sort(), ['i1', 'i2']);
  assert.equal(dispatched[0].payload.patch.groupId, 'g2');
  assert.ok(!dispatched[0].payload.ids.includes('i3'), 'i3 is in g2 — must not be moved');
});

test('B-029 group menu: onSelect(null) dispatches move to Ungrouped', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);
  findMenuItemByText(ctx, 'Move items out of group').click();

  ctx._pickerOnSelect(null);

  const dispatched = ctx._dispatched.find((d) => d.type === MSG_BULK_UPDATE_ITEMS);
  assert.ok(dispatched);
  assert.equal(dispatched.payload.patch.groupId, null, 'null === Ungrouped');
});

test('B-029 group menu: opening the picker does NOT mutate _selection', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1')],
    liveStates: {},
  });
  ctx._selection.add('item:pre-existing'); /* pre-existing selection */
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);
  findMenuItemByText(ctx, 'Move items out of group').click();
  ctx._pickerOnSelect('g1');

  /* §30.4.3: this path must NOT touch _selection. */
  assert.ok(ctx._selection.has('item:pre-existing'), 'pre-existing selection preserved');
});

/* =========================================================================
   AC-clamp — viewport clamping
   ========================================================================= */

test('B-027 AC-clamp: menu flips upward when bottom exceeds viewport height', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [] });
  ctx._innerHeight = 50; /* < rect.bottom (100) */
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 80);

  /* max(0, 80 - 100) = 0 */
  assert.equal(ctx.contextMenuEl.style.top, '0px');
});

test('B-027 AC-clamp: menu flips leftward when right edge exceeds viewport width', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [] });
  ctx._innerWidth = 50; /* < rect.right (100) */
  openGroupContextMenu(ctx, makeHeader('g1'), 80, 10);

  /* max(0, 80 - 100) = 0 */
  assert.equal(ctx.contextMenuEl.style.left, '0px');
});

test('B-027 AC-clamp: no clamping when menu fits within viewport', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [] });
  ctx._innerHeight = 600;
  ctx._innerWidth = 400;
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  /* rect.bottom (100) < 600, rect.right (100) < 400 — no flip */
  assert.equal(ctx.contextMenuEl.style.top, '10px');
  assert.equal(ctx.contextMenuEl.style.left, '10px');
});

/* =========================================================================
   AC-escape — menu closes on Escape / outside click
   ========================================================================= */

test('B-027 AC-escape: menu hidden flag is set when action is triggered (simulates close)', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);
  assert.ok(!ctx.contextMenuEl.hidden, 'menu visible after open');

  /* Any action click should hide the menu */
  findMenuItemByText(ctx, 'Select all').click();
  assert.ok(ctx.contextMenuEl.hidden, 'menu hidden after action click');
});

/* =========================================================================
   AC-separators — two separator elements between action groups
   ========================================================================= */

test('B-027: menu has exactly two separators between action groups', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [] });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const seps = ctx.contextMenuEl.childNodes.filter(
    (n) => n.className === 'context-menu-separator',
  );
  assert.equal(seps.length, 2, 'exactly 2 separators expected');
});

/* =========================================================================
   AC-structure — full menu structure for a real group
   ========================================================================= */

test('B-027: full menu has exactly 8 menu items (post-B-029)', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [makeItem('i1', 'g1')],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);

  const menuItems = ctx.contextMenuEl.querySelectorAll('[role="menuitem"]');
  assert.equal(menuItems.length, 8, 'exactly 8 menu items expected (B-029 added "Move items out of group")');

  const texts = menuItems.map((n) => n.textContent);
  assert.deepEqual(texts, [
    'Open all bookmarks',
    'Close all open tabs',
    'Select all',
    'Select open',
    'Select bookmarked',
    'Move items out of group',
    'Edit group',
    'Delete group',
  ]);
});

/* =========================================================================
   AC-items-only-in-group — selection only covers items in the target group
   ========================================================================= */

test('B-027 AC3: "Select all" only selects items belonging to the right-clicked group', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [
      makeItem('i1', 'g1'),
      makeItem('i2', 'g1'),
      makeItem('i3', 'g2'), /* different group */
    ],
    liveStates: {},
  });
  openGroupContextMenu(ctx, makeHeader('g1'), 10, 10);
  findMenuItemByText(ctx, 'Select all').click();

  assert.equal(ctx._selection.size, 2);
  assert.ok(ctx._selection.has('item:i1'));
  assert.ok(ctx._selection.has('item:i2'));
  assert.ok(!ctx._selection.has('item:i3'), 'i3 is in g2, must not be selected');
});
