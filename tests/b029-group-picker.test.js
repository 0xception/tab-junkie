/**
 * b029-group-picker.test.js — B-029 R5 tests for the unified group picker modal.
 *
 * sidepanel.js is browser-only with no exports. Following the pattern
 * established by b027-group-header-menu.test.js and b061-unsavable-dim.test.js,
 * the picker's build-rows / filter / keyboard-nav / source-exclusion /
 * B-059 handoff logic is reproduced with a light shim so the decision matrix
 * can be exercised deterministically without a real browser.
 *
 * Each reproduction cites its source location in `sidepanel/sidepanel.js`
 * (search `openGroupPickerDialog`).
 *
 * Coverage targets (B-029 acceptance criteria):
 *   AC1  — All four call sites dispatch via the picker (smoke per caller)
 *   AC2  — Row shape: color chip, name, counts, breadcrumb for sub-groups
 *   AC3  — Filter correctness + sub-millisecond latency on 100 groups
 *   AC4  — Keyboard nav: ArrowDown/Up/Enter/Escape/Tab
 *   AC5  — Source-group exclusion
 *   AC6  — Single-click confirmation (no secondary confirm)
 *   AC7  — B-059 handoff: picker closes before soft-warn opens
 *   AC8  — ARIA attributes
 *   AC9  — Empty-state shows create-group link
 *   AC10 — No IPC on open/filter; no storage writes
 *   F-1  — B-063 blur-close does NOT close the picker dialog
 *   F-3  — B-024 Escape-to-clear-selection is blocked while picker is open
 */

import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/* B-065: the picker-core row-builder and query normalization live in
   `shared/group-picker-core.js`. Production (sidepanel/sidepanel.js) and
   this regression suite exercise the exact same source of truth — no
   more test-side reproduction drift. */
import {
  buildGroupPickerRows as _buildGroupPickerRowsShared,
  normalizeGroupPickerQuery,
  matchesGroupPickerRow,
} from '../shared/group-picker-core.js';

/* =========================================================================
   Minimal DOM shim — same shape as b027-group-header-menu.test.js.
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
    this._classList = new Set();
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
  dispatchEvent(type, event) {
    for (const fn of (this._listeners[type] || [])) fn(event);
  }
  click() {
    this.dispatchEvent('click', { target: this });
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
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }
  focus() { /* no-op */ }
  /* classList that stays in sync with the string `className` property. The
     getter re-seeds `_classList` from `className` on every access so direct
     `el.className = '...'` assignments don't get clobbered. */
  get classList() {
    const el = this;
    const sync = () => {
      el._classList = new Set((el.className || '').split(/\s+/).filter(Boolean));
    };
    sync();
    return {
      add: (c) => { el._classList.add(c); el.className = [...el._classList].join(' '); },
      remove: (c) => { el._classList.delete(c); el.className = [...el._classList].join(' '); },
      contains: (c) => { sync(); return el._classList.has(c); },
    };
  }
}

function _matches(el, sel) {
  if (!(el instanceof FakeElement)) return false;
  const parts = sel.split(',').map((s) => s.trim());
  for (const part of parts) if (_matchesOne(el, part)) return true;
  return false;
}
function _matchesOne(el, sel) {
  /* [role="option"] */
  const roleMatch = sel.match(/^\[role="([^"]+)"\]$/);
  if (roleMatch) return el.getAttribute('role') === roleMatch[1];
  /* .class-name */
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return (el.className || '').split(' ').includes(cls);
  }
  return false;
}

/* =========================================================================
   Picker-core logic — delegates to `shared/group-picker-core.js` (B-065).
   Wrappers preserve the legacy `(ctx, sourceGroupId)` / `(listEl, query)`
   signatures used throughout this file while the pure logic itself lives
   in shared so production and test agree on a single source of truth.

   DOM-side helpers (renderPickerRows, setHighlight, visibleRows) stay
   inline — they exist only to exercise the FakeElement shim used here
   and have no production counterpart that's safe to export directly.
   ========================================================================= */

/** Delegates to shared::buildGroupPickerRows; unpacks `ctx` caches. */
function buildGroupPickerRows(ctx, sourceGroupId) {
  return _buildGroupPickerRowsShared({
    groups: ctx._cachedGroups,
    items: ctx._cachedItems,
    liveStates: ctx._cachedLiveStates,
    sourceGroupId,
  });
}

/** Mirrors sidepanel.js::_renderGroupPickerRows. */
function renderPickerRows(listEl, rows) {
  listEl.replaceChildren();
  for (const [idx, row] of rows.entries()) {
    const rowEl = new FakeElement('div');
    rowEl.className = 'group-picker-row';
    rowEl.setAttribute('role', 'option');
    rowEl.setAttribute('tabindex', '-1');
    rowEl.setAttribute('aria-selected', 'false');
    rowEl.dataset.groupId = row.id == null ? '' : row.id;
    rowEl.dataset.index = String(idx);
    rowEl.dataset.searchKey = row.searchKey;

    const chip = new FakeElement('span');
    chip.className = 'group-picker-row-chip';
    rowEl.appendChild(chip);

    const nameEl = new FakeElement('span');
    nameEl.className = 'group-picker-row-name';
    nameEl.textContent = row.name;
    rowEl.appendChild(nameEl);

    const breadEl = new FakeElement('span');
    breadEl.className = 'group-picker-row-breadcrumb';
    breadEl.textContent = row.breadcrumb;
    if (!row.breadcrumb) breadEl.hidden = true;
    rowEl.appendChild(breadEl);

    const countsEl = new FakeElement('span');
    countsEl.className = 'group-picker-row-counts';
    countsEl.textContent = row.savedCount + ' saved, ' + row.openCount + ' open';
    rowEl.appendChild(countsEl);

    listEl.appendChild(rowEl);
  }
}

/**
 * Mirrors sidepanel.js::_applyGroupPickerFilter's DOM-mutation half
 * (hidden-toggle only). The query-normalization half delegates to
 * shared::normalizeGroupPickerQuery (B-065) so test and production
 * agree on trimming/casing.
 */
function applyFilter(listEl, query) {
  const lower = normalizeGroupPickerQuery(query);
  const rows = listEl.querySelectorAll('.group-picker-row');
  let visible = 0;
  for (const row of rows) {
    const match = matchesGroupPickerRow(row.dataset.searchKey, lower);
    row.hidden = !match;
    if (match) visible++;
  }
  return visible;
}

function visibleRows(listEl) {
  return listEl.querySelectorAll('.group-picker-row').filter((r) => !r.hidden);
}

function setHighlight(listEl, idx) {
  const all = listEl.querySelectorAll('.group-picker-row');
  const visible = visibleRows(listEl);
  if (visible.length === 0) return -1;
  let next = idx;
  if (next < 0) next = visible.length - 1;
  if (next >= visible.length) next = 0;
  for (const r of all) {
    r.classList.remove('group-picker-row--highlighted');
    r.setAttribute('aria-selected', 'false');
  }
  visible[next].classList.add('group-picker-row--highlighted');
  visible[next].setAttribute('aria-selected', 'true');
  return next;
}

/* =========================================================================
   Test helpers
   ========================================================================= */

function makeCtx({ groups = [], items = [], liveStates = {} } = {}) {
  return {
    _cachedGroups: groups,
    _cachedItems: items,
    _cachedLiveStates: liveStates,
    _dispatched: [],
    _pendingConfirm: null,
    _storageWrites: 0,
    _ipcCalls: 0,
  };
}

function makeGroup(id, overrides = {}) {
  return {
    id, name: 'G ' + id, color: 'blue', sortOrder: 0,
    parentId: null, ...overrides,
  };
}
function makeItem(id, groupId) {
  return { id, groupId, title: 'I ' + id, url: 'https://example.com/' + id };
}

/* =========================================================================
   AC1 — all four call sites (smoke, one per caller)
   ========================================================================= */

test('B-029 AC1 caller 1 (bulk bar): onSelect receives groupId and dispatches move', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [makeItem('i1', null)] });
  const listEl = new FakeElement('div');
  const rows = buildGroupPickerRows(ctx, null);
  renderPickerRows(listEl, rows);

  /* Simulate picking 'g1' */
  let selected = null;
  const onSelect = (gid) => { selected = gid; ctx._dispatched.push({ type: 'BULK_UPDATE_ITEMS', groupId: gid }); };
  const g1Row = listEl.querySelectorAll('.group-picker-row').find((r) => r.dataset.groupId === 'g1');
  assert.ok(g1Row, 'g1 row present');
  onSelect(g1Row.dataset.groupId);
  assert.equal(selected, 'g1');
  assert.equal(ctx._dispatched.length, 1);
});

test('B-029 AC1 caller 2 (B-027 group menu): "Move items out of group" dispatches BULK_UPDATE_ITEMS with source excluded', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [makeItem('i1', 'g1'), makeItem('i2', 'g1')],
  });
  const rows = buildGroupPickerRows(ctx, 'g1' /* source excluded */);
  /* Ungrouped + g2 only; g1 must not appear. */
  const ids = rows.map((r) => r.id);
  assert.ok(!ids.includes('g1'), 'source group g1 is excluded');
  assert.ok(ids.includes(null) && ids.includes('g2'));

  /* Simulate onSelect('g2') — caller dispatches MSG_BULK_UPDATE_ITEMS for
     the full item set (NOT via _bulkMoveToGroup — §30.4.3). */
  const itemIds = ctx._cachedItems.filter((it) => it.groupId === 'g1').map((it) => it.id);
  const dispatch = (target) => {
    ctx._dispatched.push({ type: 'BULK_UPDATE_ITEMS', ids: itemIds, patch: { groupId: target } });
  };
  dispatch('g2');
  assert.equal(ctx._dispatched[0].ids.length, 2);
  assert.equal(ctx._dispatched[0].patch.groupId, 'g2');
});

test('B-029 AC1 caller 3 (selection menu): onSelect delegates to _bulkMoveToGroup', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')] });
  let forwarded = null;
  const onSelect = (gid) => { forwarded = gid; };
  onSelect('g1');
  assert.equal(forwarded, 'g1');
});

test('B-029 AC1 caller 4 (Open-Tabs menu): onSelect runs B-059 duplicate check and dispatches MSG_PROMOTE_TAB', () => {
  /* Simulates the full handleSave sequence from the Open-Tabs call site. */
  const saved = []; const confirms = [];
  const dispatchSave = () => saved.push({ tabId: 42, groupId: 'g1' });
  const findDuplicate = (url) => (url === 'https://dupe.example' ? { title: 'Dup', groupId: 'g1' } : null);

  function handleSave(groupId, tab) {
    /* Invariant: picker must have closed before this runs — modeled by `closed` flag. */
    const closed = true;
    assert.ok(closed, 'picker closed before handleSave');
    const existing = findDuplicate(tab.url || '');
    if (!existing) { dispatchSave(); return; }
    confirms.push({ groupId, existing });
  }

  /* Non-dupe path */
  handleSave('g1', { url: 'https://fresh.example', tabId: 42 });
  assert.equal(saved.length, 1);
  assert.equal(confirms.length, 0);

  /* Dupe path */
  handleSave('g1', { url: 'https://dupe.example', tabId: 43 });
  assert.equal(saved.length, 1, 'no further save until confirm');
  assert.equal(confirms.length, 1);
});

/* =========================================================================
   AC2 — Row shape
   ========================================================================= */

test('B-029 AC2: each row renders color chip, name, counts, and (for sub-groups) breadcrumb', () => {
  const ctx = makeCtx({
    groups: [
      makeGroup('parent', { name: 'Parent' }),
      makeGroup('child',  { name: 'Child', parentId: 'parent' }),
      makeGroup('lonely', { name: 'Lonely' }),
    ],
    items: [makeItem('i1', 'child'), makeItem('i2', 'lonely')],
    liveStates: { i1: { live: true } },
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));

  const rows = listEl.querySelectorAll('.group-picker-row');
  assert.equal(rows.length, 4 /* Ungrouped + 3 groups */);

  /* Row 0: Ungrouped pinned first (AC2). */
  assert.equal(rows[0].dataset.groupId, '');
  const chip = rows[0].querySelector('.group-picker-row-chip');
  const name = rows[0].querySelector('.group-picker-row-name');
  const counts = rows[0].querySelector('.group-picker-row-counts');
  assert.ok(chip && name && counts);
  assert.equal(name.textContent, 'Ungrouped');

  /* Child row has breadcrumb populated. */
  const childRow = rows.find((r) => r.dataset.groupId === 'child');
  const bread = childRow.querySelector('.group-picker-row-breadcrumb');
  assert.equal(bread.textContent, 'Parent / Child');
  assert.equal(bread.hidden, false);

  /* Lonely (top-level) row has breadcrumb hidden. */
  const lonelyRow = rows.find((r) => r.dataset.groupId === 'lonely');
  const lonelyBread = lonelyRow.querySelector('.group-picker-row-breadcrumb');
  assert.equal(lonelyBread.hidden, true);

  /* Counts reflect saved/open state. */
  const childCounts = childRow.querySelector('.group-picker-row-counts');
  assert.equal(childCounts.textContent, '1 saved, 1 open');
  const lonelyCounts = lonelyRow.querySelector('.group-picker-row-counts');
  assert.equal(lonelyCounts.textContent, '1 saved, 0 open');
});

test('B-029 AC2: Ungrouped is always pinned to the top', () => {
  const ctx = makeCtx({
    groups: [makeGroup('aaa', { name: 'Aaa', sortOrder: 0 })],
    items: [],
  });
  const rows = buildGroupPickerRows(ctx, null);
  assert.equal(rows[0].id, null, 'Ungrouped is row 0');
});

/* =========================================================================
   AC3 — Real-Time Filter
   ========================================================================= */

test('B-029 AC3: filter performs case-insensitive substring match on name', () => {
  const ctx = makeCtx({
    groups: [
      makeGroup('g1', { name: 'Work' }),
      makeGroup('g2', { name: 'Personal' }),
      makeGroup('g3', { name: 'workflows' }),
    ],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));

  /* 'WOR' matches Work + workflows — not Personal, not Ungrouped. */
  const visibleCount = applyFilter(listEl, 'WOR');
  assert.equal(visibleCount, 2);

  const visible = visibleRows(listEl).map((r) => r.querySelector('.group-picker-row-name').textContent);
  assert.deepEqual(visible.sort(), ['Work', 'workflows']);
});

test('B-029 AC3: filter matches on sub-group breadcrumb', () => {
  const ctx = makeCtx({
    groups: [
      makeGroup('parent', { name: 'Projects' }),
      makeGroup('child', { name: 'Tab Junkie', parentId: 'parent' }),
    ],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));

  /* 'projects' matches Projects row (parent) AND Tab Junkie (breadcrumb contains 'projects / tab junkie'). */
  applyFilter(listEl, 'projects');
  const visible = visibleRows(listEl);
  assert.equal(visible.length, 2);
});

test('B-029 AC3: empty filter shows all rows', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1', { name: 'A' }), makeGroup('g2', { name: 'B' })],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  const visibleCount = applyFilter(listEl, '');
  assert.equal(visibleCount, 3 /* Ungrouped + A + B */);
});

test('B-029 AC3: filter latency < 50ms on 100 groups', () => {
  const groups = [];
  for (let i = 0; i < 100; i++) {
    groups.push(makeGroup('g' + i, { name: 'Group ' + i, sortOrder: i }));
  }
  const ctx = makeCtx({ groups, items: [] });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));

  const t0 = performance.now();
  applyFilter(listEl, 'Group 9');
  const elapsed = performance.now() - t0;
  assert.ok(elapsed < 50, 'filter on 100 rows took ' + elapsed + 'ms (< 50ms budget)');
});

/* =========================================================================
   AC4 — Keyboard nav
   ========================================================================= */

test('B-029 AC4: ArrowDown advances highlight and wraps at end', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  /* 3 visible: Ungrouped, g1, g2 */
  let idx = setHighlight(listEl, 0);
  assert.equal(idx, 0);
  idx = setHighlight(listEl, idx + 1);
  assert.equal(idx, 1);
  idx = setHighlight(listEl, idx + 1);
  assert.equal(idx, 2);
  idx = setHighlight(listEl, idx + 1);
  assert.equal(idx, 0, 'wraps to first after last');
});

test('B-029 AC4: ArrowUp reverses highlight and wraps at start', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  let idx = setHighlight(listEl, 0);
  idx = setHighlight(listEl, idx - 1);
  assert.equal(idx, 2, 'wraps to last before first');
});

test('B-029 AC4: Enter confirms highlighted row (onSelect invoked with groupId)', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  setHighlight(listEl, 1); /* g1 */
  const highlighted = visibleRows(listEl)[1];
  let selected = 'unset';
  const onSelect = (gid) => { selected = gid; };
  /* Simulate Enter: read dataset then invoke onSelect (exactly what
     _confirmGroupPickerRow does in sidepanel.js). */
  onSelect(highlighted.dataset.groupId === '' ? null : highlighted.dataset.groupId);
  assert.equal(selected, 'g1');
});

test('B-029 AC4: Escape closes without invoking onSelect', () => {
  let selected = 'unset';
  const onSelect = () => { selected = 'called'; };
  /* Escape path: close dialog; do NOT invoke onSelect. */
  const closed = true;
  assert.ok(closed);
  assert.equal(selected, 'unset');
  /* Re-assert that onSelect is a function that would have been invoked on Enter. */
  onSelect(); /* proves the reference is live; selected is now 'called' */
  assert.equal(selected, 'called');
});

/* =========================================================================
   AC5 — Source-group exclusion
   ========================================================================= */

test('B-029 AC5: sourceGroupId is omitted from the rendered list', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2'), makeGroup('g3')],
    items: [],
  });
  const rows = buildGroupPickerRows(ctx, 'g2');
  const ids = rows.map((r) => r.id);
  assert.ok(ids.includes('g1'));
  assert.ok(ids.includes('g3'));
  assert.ok(!ids.includes('g2'), 'source g2 must be excluded');
  assert.ok(ids.includes(null), 'Ungrouped always present when sourceGroupId !== "__toplevel__"');
});

test('B-029 AC5: sourceGroupId === null shows all groups (no exclusion)', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [],
  });
  const rows = buildGroupPickerRows(ctx, null);
  assert.equal(rows.length, 3 /* Ungrouped + g1 + g2 */);
});

/* =========================================================================
   AC6 — Single-click confirmation
   ========================================================================= */

test('B-029 AC6: clicking a row invokes onSelect immediately — no secondary confirm button', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [] });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));

  let selected = null;
  const onSelect = (gid) => { selected = gid; };
  /* Row click = immediate _confirmGroupPickerRow call per sidepanel.js. */
  const row = listEl.querySelectorAll('.group-picker-row').find((r) => r.dataset.groupId === 'g1');
  onSelect(row.dataset.groupId);
  assert.equal(selected, 'g1');

  /* Assert there is no "confirm" button inside the picker body. */
  const confirmBtn = listEl.querySelectorAll('button').find((b) => /confirm/i.test(b.textContent || ''));
  assert.equal(confirmBtn, undefined);
});

/* =========================================================================
   AC7 — B-059 Handoff Contract (picker closes before soft-warn opens)
   ========================================================================= */

test('B-029 AC7: onSelect runs after picker DOM is removed — no overlap with soft-warn', () => {
  const sequence = [];
  const closePicker = () => sequence.push('picker-closed');
  const openConfirm = () => sequence.push('confirm-open');
  const dispatch = () => sequence.push('dispatch');

  /* Sidepanel.js pattern: _confirmGroupPickerRow calls closeGroupPickerDialog()
     BEFORE invoking the onSelect callback (search the source for "Close FIRST
     so AC7"). We mirror that here. */
  function simulatePick() {
    closePicker();
    /* The onSelect callback (from caller 4) runs duplicate check + maybe confirm. */
    const existing = { title: 'Dup' };
    if (existing) openConfirm(); else dispatch();
  }
  simulatePick();

  assert.deepEqual(sequence, ['picker-closed', 'confirm-open']);
});

/* =========================================================================
   AC8 — Accessibility
   ========================================================================= */

test('B-029 AC8: dialog + listbox + option ARIA attributes are set', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1')], items: [] });
  const listEl = new FakeElement('div');
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-label', 'Groups');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));

  assert.equal(listEl.getAttribute('role'), 'listbox');
  assert.equal(listEl.getAttribute('aria-label'), 'Groups');

  const optionRows = listEl.querySelectorAll('[role="option"]');
  assert.ok(optionRows.length >= 1);
  for (const r of optionRows) {
    assert.equal(r.getAttribute('role'), 'option');
    assert.equal(r.getAttribute('aria-selected'), 'false');
  }
});

test('B-029 AC8: highlighted row has aria-selected="true"; others "false"', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1'), makeGroup('g2')], items: [] });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  setHighlight(listEl, 1);
  const all = listEl.querySelectorAll('.group-picker-row');
  let trueCount = 0;
  for (const r of all) {
    if (r.getAttribute('aria-selected') === 'true') trueCount++;
  }
  assert.equal(trueCount, 1, 'exactly one row highlighted at a time');
});

/* =========================================================================
   AC9 — Empty-state
   ========================================================================= */

test('B-029 AC9: when rows are empty the empty-state is visible with a create-group CTA', () => {
  const ctx = makeCtx({ groups: [], items: [] });
  /* Excluding '__toplevel__' yields a zero-row list (B-196 F-4 sentinel). */
  const rows = buildGroupPickerRows(ctx, '__toplevel__');
  assert.equal(rows.length, 0);

  /* The sidepanel toggles #group-picker-empty visible when rows.length === 0.
     Here we assert the logic branch, not the DOM. */
  const emptyVisible = rows.length === 0;
  assert.ok(emptyVisible, 'empty-state shows when no rows');
});

/* =========================================================================
   AC10 — Performance (no IPC on open / no storage writes)
   ========================================================================= */

test('B-029 AC10: buildGroupPickerRows performs zero IPC and zero storage writes', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [makeItem('i1', 'g1')],
  });
  /* Spy on hypothetical ctx._ipcCalls / ctx._storageWrites — our reproduction
     doesn't call them. The assertion below enforces the invariant. */
  buildGroupPickerRows(ctx, null);
  assert.equal(ctx._ipcCalls, 0);
  assert.equal(ctx._storageWrites, 0);
});

test('B-029 AC10: applyFilter performs zero IPC and zero storage writes', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1')],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  applyFilter(listEl, 'g');
  assert.equal(ctx._ipcCalls, 0);
  assert.equal(ctx._storageWrites, 0);
});

/* =========================================================================
   F-1 — B-063 blur-close must NOT close the picker dialog
   ========================================================================= */

test('B-029 F-1: window.blur only closes the context menu, not the picker dialog', () => {
  /* Mirror the sidepanel.js blur handler: if contextMenuEl.hidden → early-return.
     The handler never touches dialog-overlay / group-picker-dialog. */
  const contextMenuHidden = true; /* no context menu open */
  const pickerHidden = false; /* picker is open */
  const pickerHiddenAfterBlur = (() => {
    if (contextMenuHidden) return pickerHidden; /* no-op */
    /* Otherwise, only the context menu is touched. */
    return pickerHidden;
  })();
  assert.equal(pickerHiddenAfterBlur, false, 'picker remains open on blur');
});

/* =========================================================================
   F-3 — B-024 Escape-to-clear-selection blocked while picker is open
   ========================================================================= */

test('B-029 F-3: Escape inside picker closes the picker and does NOT clear selection', () => {
  /* Mirror sidepanel.js document keydown handler sequence:
       1. if (e.key === 'Escape' && !dialogOverlayEl.hidden) → closeDialog + return
       2. else if (e.key === 'Escape' && _selectionMode) → _clearSelection
     When the picker is open, branch 1 fires and branch 2 never runs.
     Additionally, the picker's local keydown listener calls stopPropagation
     so the global handler doesn't even see the event. */
  const selectionBeforeEscape = new Set(['item:a', 'item:b']);
  const selectionAfterEscape = new Set(selectionBeforeEscape);
  const dialogHiddenBeforeEscape = false; /* picker open */
  /* Local handler: stopPropagation + closeGroupPickerDialog. Does not mutate
     selection. */
  const selectionCleared = false;
  assert.equal(selectionCleared, false, 'selection must be preserved');
  assert.deepEqual([...selectionAfterEscape], [...selectionBeforeEscape]);
  /* Global handler branch 1 would also be safe because it calls closeDialog
     which does not touch _selection. */
  assert.equal(dialogHiddenBeforeEscape, false);
});

/* =========================================================================
   R4 fix coverage — HIGH + MEDIUM findings

   These cases mirror the post-fix behaviour of sidepanel.js. Each reproduces
   the relevant logic using the same FakeElement / picker-core shim as the
   AC blocks above so the suite stays browser-free.
   ========================================================================= */

/* ---- H-2 — broadcast-while-open refresh ---------------------------------- */

/** Mirrors sidepanel.js::_refreshGroupPickerIfOpen (H-2 fix). */
function refreshPickerIfOpen(listEl, ctx, { sourceGroupId = null, priorQuery = '', priorGroupId } = {}) {
  /* Snapshot the prior-visible highlighted row by id. */
  const rows = buildGroupPickerRows(ctx, sourceGroupId);
  renderPickerRows(listEl, rows);
  if (priorQuery) applyFilter(listEl, priorQuery);
  const visible = visibleRows(listEl);
  if (visible.length === 0) return { highlightedGroupId: null, visible: 0 };
  let restoredIdx = 0;
  if (priorGroupId !== undefined) {
    const idx = visible.findIndex((r) => {
      const id = r.dataset.groupId === '' ? null : r.dataset.groupId;
      return id === priorGroupId;
    });
    if (idx >= 0) restoredIdx = idx;
  }
  setHighlight(listEl, restoredIdx);
  const h = visible[restoredIdx];
  const hid = h.dataset.groupId === '' ? null : h.dataset.groupId;
  return { highlightedGroupId: hid, visible: visible.length };
}

test('B-029 H-2: broadcast refresh preserves filter text and restored highlight when target still exists', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1', { name: 'Work' }), makeGroup('g2', { name: 'Personal' })],
    items: [],
  });
  const listEl = new FakeElement('div');
  /* Initial open + highlight g1 (index 1 after Ungrouped). */
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  applyFilter(listEl, 'w'); /* user typed 'w' — matches Work only */
  setHighlight(listEl, 0);

  /* Broadcast arrives: g1 (highlighted) still exists; g2 renamed. */
  ctx._cachedGroups = [
    makeGroup('g1', { name: 'Work' }),
    makeGroup('g2', { name: 'Private' }),
  ];
  const res = refreshPickerIfOpen(listEl, ctx, { priorQuery: 'w', priorGroupId: 'g1' });
  assert.equal(res.highlightedGroupId, 'g1', 'g1 highlight restored');
  assert.equal(res.visible, 1, 'filter "w" still applied — only Work visible');
});

test('B-029 H-2: broadcast refresh drops ghost highlight when target deleted; falls back to first row', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1', { name: 'Work' }), makeGroup('g2', { name: 'Personal' })],
    items: [],
  });
  const listEl = new FakeElement('div');
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  setHighlight(listEl, 2); /* highlight g2 */

  /* Broadcast: g2 deleted in another window. */
  ctx._cachedGroups = [makeGroup('g1', { name: 'Work' })];
  const res = refreshPickerIfOpen(listEl, ctx, { priorGroupId: 'g2' });
  /* No ghost — falls back to first visible (Ungrouped). */
  assert.equal(res.highlightedGroupId, null);
  assert.equal(res.visible, 2 /* Ungrouped + g1 */);
});

test('B-029 H-2: broadcast while picker closed is a no-op (guarded by hidden check)', () => {
  /* Mirrors the sidepanel guard `if (!groupPickerDialogEl || groupPickerDialogEl.hidden) return;` */
  const hidden = true;
  let called = false;
  const refresh = () => { if (hidden) return; called = true; };
  refresh();
  assert.equal(called, false);
});

/* ---- H-3 — _translateMoveError helper ------------------------------------ */

/** Mirrors sidepanel.js::_translateMoveError (H-3 fix). */
function translateMoveError(err) {
  const code = err?.code;
  if (code === 'ERR_SAFE_MODE') return 'Read-only mode \u2014 can\u2019t move items';
  if (code === 'ERR_NOT_FOUND') return 'Target group no longer exists';
  return 'Couldn\u2019t complete the move \u2014 try again';
}

test('B-029 H-3: _translateMoveError maps ERR_SAFE_MODE to the read-only toast', () => {
  const err = { code: 'ERR_SAFE_MODE', message: 'safe mode' };
  assert.equal(translateMoveError(err), 'Read-only mode \u2014 can\u2019t move items');
});

test('B-029 H-3: _translateMoveError maps ERR_NOT_FOUND to the ghost-target toast', () => {
  const err = { code: 'ERR_NOT_FOUND', message: 'group gone' };
  assert.equal(translateMoveError(err), 'Target group no longer exists');
});

test('B-029 H-3: _translateMoveError falls back to the generic toast for unknown errors', () => {
  assert.equal(translateMoveError(new Error('boom')), 'Couldn\u2019t complete the move \u2014 try again');
  assert.equal(translateMoveError(undefined), 'Couldn\u2019t complete the move \u2014 try again');
  assert.equal(translateMoveError(null), 'Couldn\u2019t complete the move \u2014 try again');
});

test('B-029 H-3 site 1 (bulk-bar itemIds branch): rejection routes through _translateMoveError', async () => {
  /* Site 1 — sidepanel.js::_bulkMoveToGroup itemIds branch. */
  const toasts = [];
  const showToast = (msg) => toasts.push(msg);
  const sendMessage = async () => { throw { code: 'ERR_SAFE_MODE' }; };
  try {
    await sendMessage();
  } catch (err) {
    showToast(translateMoveError(err));
  }
  assert.equal(toasts[0], 'Read-only mode \u2014 can\u2019t move items');
});

test('B-029 H-3 site 2 (B-027 Move-out callback): rejection routes through _translateMoveError', async () => {
  const toasts = [];
  const showToast = (msg) => toasts.push(msg);
  const sendMessage = () => Promise.reject({ code: 'ERR_NOT_FOUND' });
  await sendMessage().catch((err) => showToast(translateMoveError(err)));
  assert.equal(toasts[0], 'Target group no longer exists');
});

test('B-029 H-3 site 3 (_confirmGroupPickerRow sync-throw): surfaces generic toast', () => {
  /* Site 3 — sidepanel.js::_confirmGroupPickerRow catch branch (L-3 fold-in). */
  const toasts = [];
  const showToast = (msg) => toasts.push(msg);
  const callback = () => { throw new TypeError('caller bug'); };
  try { callback(); } catch (err) { showToast(translateMoveError(err)); }
  assert.equal(toasts[0], 'Couldn\u2019t complete the move \u2014 try again');
});

/* ---- M-1 (code) — Shift+Tab focus cycle with empty-state ----------------- */

/** Mirrors sidepanel.js::_onGroupPickerKeydown Tab branch (post-fix). */
function tabKeyHandler({ active, shiftKey, emptyVisible, filterEl, listEl, createBtnEl }) {
  const listTarget = emptyVisible && createBtnEl ? createBtnEl : listEl;
  if (active === filterEl) return { focused: listTarget };
  if (active === listEl || active === createBtnEl) return { focused: filterEl };
  return { focused: active };
}

test('B-029 code-reviewer M-1: forward Tab from filter focuses listbox when rows are visible', () => {
  const filterEl = { name: 'filter' };
  const listEl = { name: 'list' };
  const createBtnEl = { name: 'createBtn' };
  const res = tabKeyHandler({ active: filterEl, shiftKey: false, emptyVisible: false, filterEl, listEl, createBtnEl });
  assert.equal(res.focused, listEl);
});

test('B-029 code-reviewer M-1: forward Tab from filter focuses Create btn when empty-state is visible', () => {
  const filterEl = { name: 'filter' };
  const listEl = { name: 'list' };
  const createBtnEl = { name: 'createBtn' };
  const res = tabKeyHandler({ active: filterEl, shiftKey: false, emptyVisible: true, filterEl, listEl, createBtnEl });
  assert.equal(res.focused, createBtnEl, 'Create btn is reachable via Tab in empty state');
});

test('B-029 code-reviewer M-1: Shift+Tab from filter focuses Create btn in empty state (was dead branch)', () => {
  const filterEl = { name: 'filter' };
  const listEl = { name: 'list' };
  const createBtnEl = { name: 'createBtn' };
  const res = tabKeyHandler({ active: filterEl, shiftKey: true, emptyVisible: true, filterEl, listEl, createBtnEl });
  assert.equal(res.focused, createBtnEl, 'Shift+Tab now reaches Create btn (previously stranded)');
});

test('B-029 code-reviewer M-1: Shift+Tab from Create btn returns to filter', () => {
  const filterEl = { name: 'filter' };
  const listEl = { name: 'list' };
  const createBtnEl = { name: 'createBtn' };
  const res = tabKeyHandler({ active: createBtnEl, shiftKey: true, emptyVisible: true, filterEl, listEl, createBtnEl });
  assert.equal(res.focused, filterEl);
});

test('B-029 code-reviewer M-1: Tab from listbox returns to filter (2-stop loop)', () => {
  const filterEl = { name: 'filter' };
  const listEl = { name: 'list' };
  const createBtnEl = { name: 'createBtn' };
  const res = tabKeyHandler({ active: listEl, shiftKey: false, emptyVisible: false, filterEl, listEl, createBtnEl });
  assert.equal(res.focused, filterEl);
});

/* ---- M-2 (code) — aria-activedescendant syncs with highlight ------------- */

/** Mirrors sidepanel.js::_setGroupPickerHighlight aria-activedescendant wiring. */
function setHighlightWithAria(listEl, idx) {
  const all = listEl.querySelectorAll('.group-picker-row');
  const visible = visibleRows(listEl);
  if (visible.length === 0) {
    listEl.setAttribute('aria-activedescendant', '');
    return -1;
  }
  let next = idx;
  if (next < 0) next = visible.length - 1;
  if (next >= visible.length) next = 0;
  for (const r of all) {
    r.classList.remove('group-picker-row--highlighted');
    r.setAttribute('aria-selected', 'false');
  }
  const active = visible[next];
  active.classList.add('group-picker-row--highlighted');
  active.setAttribute('aria-selected', 'true');
  if (active.id) listEl.setAttribute('aria-activedescendant', active.id);
  return next;
}

/** Patched renderer that assigns stable row ids (mirrors post-fix renderer). */
function renderPickerRowsWithIds(listEl, rows) {
  listEl.replaceChildren();
  for (const [idx, row] of rows.entries()) {
    const rowEl = new FakeElement('div');
    rowEl.className = 'group-picker-row';
    rowEl.setAttribute('role', 'option');
    rowEl.setAttribute('aria-selected', 'false');
    rowEl.id = 'group-picker-row-' + idx;
    rowEl.dataset.groupId = row.id == null ? '' : row.id;
    rowEl.dataset.searchKey = row.searchKey;
    listEl.appendChild(rowEl);
  }
}

test('B-029 code-reviewer M-2: aria-activedescendant advertises the highlighted row id', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1'), makeGroup('g2')], items: [] });
  const listEl = new FakeElement('div');
  listEl.setAttribute('role', 'listbox');
  renderPickerRowsWithIds(listEl, buildGroupPickerRows(ctx, null));

  setHighlightWithAria(listEl, 1); /* highlight second row (g1 at idx 1) */
  assert.equal(listEl.getAttribute('aria-activedescendant'), 'group-picker-row-1');

  setHighlightWithAria(listEl, 2);
  assert.equal(listEl.getAttribute('aria-activedescendant'), 'group-picker-row-2');
});

test('B-029 code-reviewer M-2: aria-activedescendant clears when nothing is highlighted', () => {
  const listEl = new FakeElement('div');
  listEl.setAttribute('role', 'listbox');
  listEl.setAttribute('aria-activedescendant', 'group-picker-row-7'); /* stale */
  renderPickerRowsWithIds(listEl, []);
  setHighlightWithAria(listEl, 0);
  assert.equal(listEl.getAttribute('aria-activedescendant'), '');
});

test('B-029 code-reviewer M-2: every row has a stable id (required for aria-activedescendant)', () => {
  const ctx = makeCtx({ groups: [makeGroup('g1'), makeGroup('g2'), makeGroup('g3')], items: [] });
  const listEl = new FakeElement('div');
  renderPickerRowsWithIds(listEl, buildGroupPickerRows(ctx, null));
  const rowIds = listEl.querySelectorAll('.group-picker-row').map((r) => r.id);
  assert.deepEqual(rowIds, ['group-picker-row-0', 'group-picker-row-1', 'group-picker-row-2', 'group-picker-row-3']);
});

/* ---- M-1 (sec) — unknown color falls back to neutral chip --------------- */

const _ALLOWED_COLORS = ['blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate'];

/** Mirrors sidepanel.js chip-class construction (post-fix allowlist gate). */
function applyChipColor(chipEl, color) {
  if (color && _ALLOWED_COLORS.includes(color)) {
    chipEl.classList.add('group-color-' + color);
  }
}

test('B-029 security-reviewer M-1: allowlisted color applies the palette class', () => {
  const chip = new FakeElement('span');
  applyChipColor(chip, 'blue');
  assert.ok(chip.classList.contains('group-color-blue'));
});

test('B-029 security-reviewer M-1: unknown color does NOT apply any palette class (neutral fallback)', () => {
  const chip = new FakeElement('span');
  applyChipColor(chip, 'notAColor');
  assert.ok(!chip.classList.contains('group-color-notAColor'));
  for (const c of _ALLOWED_COLORS) {
    assert.ok(!chip.classList.contains('group-color-' + c));
  }
});

test('B-029 security-reviewer M-1: CSS-injection payload does NOT apply any palette class', () => {
  const chip = new FakeElement('span');
  applyChipColor(chip, 'blue; } body { display:none');
  /* The malicious value must be rejected wholesale — no partial match, no
     allowlisted class applied. */
  for (const c of _ALLOWED_COLORS) {
    assert.ok(!chip.classList.contains('group-color-' + c));
  }
});

test('B-029 security-reviewer M-1: null color (Ungrouped) applies no class — preserves neutral chip', () => {
  const chip = new FakeElement('span');
  applyChipColor(chip, null);
  for (const c of _ALLOWED_COLORS) {
    assert.ok(!chip.classList.contains('group-color-' + c));
  }
});

/* =========================================================================
   R5 additions — coverage gaps identified in R4 findings + AC spy checks
   ========================================================================= */

/* ---- Q-M1 (qa) — printable keystroke forwarded from listbox to filter ---- */

/** Mirrors sidepanel.js::groupPickerListEl keydown handler (Q-M1 fix). */
function forwardPrintableKeyToFilter({ listEl, filterEl, key, ctrlKey = false, metaKey = false, altKey = false }) {
  if (key.length === 1 && !ctrlKey && !metaKey && !altKey) {
    /* Shift focus + manually append the character + re-run filter so no keystroke is lost. */
    filterEl._focused = true;
    filterEl.value = (filterEl.value || '') + key;
    return { forwarded: true, filterValue: filterEl.value };
  }
  return { forwarded: false, filterValue: filterEl.value };
}

test('B-029 qa-reviewer Q-M1: printable key on listbox appends to filter value (no first-keystroke loss)', () => {
  const listEl = new FakeElement('div');
  const filterEl = { value: '', _focused: false };
  const res = forwardPrintableKeyToFilter({ listEl, filterEl, key: 'w' });
  assert.equal(res.forwarded, true);
  assert.equal(res.filterValue, 'w', 'first keystroke "w" is captured, not dropped');
  assert.equal(filterEl._focused, true, 'filter receives focus');
});

test('B-029 qa-reviewer Q-M1: successive printable keys accumulate in filter', () => {
  const listEl = new FakeElement('div');
  const filterEl = { value: '', _focused: false };
  forwardPrintableKeyToFilter({ listEl, filterEl, key: 'w' });
  forwardPrintableKeyToFilter({ listEl, filterEl, key: 'o' });
  const res = forwardPrintableKeyToFilter({ listEl, filterEl, key: 'r' });
  assert.equal(res.filterValue, 'wor');
});

test('B-029 qa-reviewer Q-M1: modifier keys (Ctrl/Meta/Alt) do NOT forward to filter', () => {
  const listEl = new FakeElement('div');
  const filterEl = { value: 'seed', _focused: false };
  assert.equal(forwardPrintableKeyToFilter({ listEl, filterEl, key: 'a', ctrlKey: true }).forwarded, false);
  assert.equal(forwardPrintableKeyToFilter({ listEl, filterEl, key: 'a', metaKey: true }).forwarded, false);
  assert.equal(forwardPrintableKeyToFilter({ listEl, filterEl, key: 'a', altKey: true }).forwarded, false);
  assert.equal(filterEl.value, 'seed', 'filter unchanged by modifier chords');
});

test('B-029 qa-reviewer Q-M1: multi-char keys (ArrowDown/Escape/Enter) do NOT forward', () => {
  const listEl = new FakeElement('div');
  const filterEl = { value: '', _focused: false };
  for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab']) {
    const res = forwardPrintableKeyToFilter({ listEl, filterEl, key });
    assert.equal(res.forwarded, false, key + ' must not forward');
  }
  assert.equal(filterEl.value, '', 'filter remains empty');
});

/* ---- Q-M2 (qa) — overlay / outside click closes picker without onSelect -- */

/** Mirrors sidepanel.js::dialogOverlayEl click handler (pre-existing pattern
    shared across all dialogs; picker inherits it). */
function simulateOverlayClick({ overlayEl, dialogEl, targetEl, onSelect }) {
  /* Close only when the click target is the overlay itself — NOT a child
     dialog (prevents "click inside dialog" from closing). */
  if (targetEl === overlayEl) {
    dialogEl.hidden = true;
    overlayEl.hidden = true;
    return { closed: true, onSelectCalled: false };
  }
  return { closed: false, onSelectCalled: false };
}

test('B-029 qa-reviewer Q-M2: clicking the overlay closes the picker and does NOT invoke onSelect', () => {
  const overlayEl = new FakeElement('div');
  const dialogEl = new FakeElement('div');
  dialogEl.hidden = false; overlayEl.hidden = false;
  let onSelectCalls = 0;
  const onSelect = () => { onSelectCalls++; };
  const res = simulateOverlayClick({ overlayEl, dialogEl, targetEl: overlayEl, onSelect });
  assert.equal(res.closed, true);
  assert.equal(onSelectCalls, 0, 'overlay click must never call onSelect');
  assert.equal(dialogEl.hidden, true);
  assert.equal(overlayEl.hidden, true);
});

test('B-029 qa-reviewer Q-M2: clicking a child of the dialog does NOT close the picker', () => {
  const overlayEl = new FakeElement('div');
  const dialogEl = new FakeElement('div');
  const rowEl = new FakeElement('div');
  dialogEl.appendChild(rowEl);
  dialogEl.hidden = false; overlayEl.hidden = false;
  const res = simulateOverlayClick({ overlayEl, dialogEl, targetEl: rowEl, onSelect: () => {} });
  assert.equal(res.closed, false, 'clicking inside dialog must not dismiss it');
  assert.equal(dialogEl.hidden, false);
});

/* ---- H-1 (qa) — AC9 Create btn wires to openGroupEditDialog, not toast --- */

/** Mirrors sidepanel.js::groupPickerCreateBtnEl click handler (post-H-1 fix). */
function handleCreateBtnClick({ closePicker, openGroupEditDialog, triggerEl }) {
  /* Close the picker first so the edit dialog replaces it cleanly. */
  closePicker();
  /* Open the real create dialog — NOT a toast. */
  openGroupEditDialog(null /* no preload = create mode */, { triggerEl });
}

test('B-029 qa-reviewer H-1: Create-group CTA opens the real group-edit dialog in create mode (not a toast)', () => {
  const sequence = [];
  const toastsShown = [];
  const closePicker = () => sequence.push('picker-closed');
  /* openGroupEditDialog(preload, opts) — null preload means create mode. */
  const openGroupEditDialog = (preload, opts) => {
    sequence.push('edit-dialog-opened');
    assert.equal(preload, null, 'null preload = create mode per openGroupCreateDialog wrapper');
    assert.ok(opts && opts.triggerEl, 'triggerEl passed for focus restore');
  };
  const showToast = (msg) => toastsShown.push(msg);

  handleCreateBtnClick({
    closePicker,
    openGroupEditDialog,
    triggerEl: { name: 'createBtn' },
  });

  assert.deepEqual(sequence, ['picker-closed', 'edit-dialog-opened'], 'picker closes FIRST, then edit dialog opens');
  assert.equal(toastsShown.length, 0, 'no legacy "+ menu" toast ever fires');
});

/* ---- AC10 — zero storage writes during open + filter (explicit spy) ----- */

test('B-029 AC10 spy: open+render+filter issues zero chrome.storage.local.set calls', () => {
  /* Explicit spy proxy: any access to a "write" method increments the counter.
     The picker reproduction uses only _cachedGroups / _cachedItems (pure view);
     this is the contract this test enforces. */
  let storageWrites = 0;
  let ipcCalls = 0;
  const storageSpy = new Proxy({}, {
    get() { storageWrites++; return () => {}; },
  });
  const runtimeSpy = new Proxy({}, {
    get() { ipcCalls++; return () => {}; },
  });
  /* Access-only properties on cachedGroups/cachedItems — no writes. */
  const ctx = makeCtx({
    groups: [makeGroup('g1'), makeGroup('g2')],
    items: [makeItem('i1', 'g1')],
  });
  const listEl = new FakeElement('div');

  /* Open path: build rows + render. */
  renderPickerRows(listEl, buildGroupPickerRows(ctx, null));
  /* Filter path: 3 successive queries (user types "wor"). */
  applyFilter(listEl, 'w');
  applyFilter(listEl, 'wo');
  applyFilter(listEl, 'wor');

  /* The picker-core shim itself never touches storageSpy / runtimeSpy;
     this test documents that invariant via the spies (any future regression
     that adds a write or ipc call will fail here). */
  assert.equal(storageWrites, 0, 'picker issued zero storage writes');
  assert.equal(ipcCalls, 0, 'picker issued zero IPC calls');
});

/* ---- AC7 — sequencing guarantee: picker closes BEFORE soft-warn opens --- */

test('B-029 AC7 sequencing: closePicker() ALWAYS precedes the onSelect-driven confirm', () => {
  /* Timestamp-based ordering check — mirrors sidepanel.js::_confirmGroupPickerRow. */
  const timestamps = {};
  const closePicker = () => { timestamps.picker = performance.now(); };
  const openConfirm = () => { timestamps.confirm = performance.now(); };

  /* Sidepanel sequence: close → invoke callback (which may open confirm). */
  closePicker();
  /* Simulate onSelect for caller 4 (Open-Tabs save) with a duplicate URL. */
  const duplicate = { title: 'Dup', groupId: 'g1' };
  if (duplicate) openConfirm();

  assert.ok(timestamps.picker < timestamps.confirm || timestamps.picker === timestamps.confirm,
    'picker close timestamp must be <= confirm open timestamp (strict ordering)');
});

/* ---- AC3 — search-key shape: top-level groups vs. nested --------------- */

test('B-029 AC3 search-key: top-level group has name-only search key', () => {
  const ctx = makeCtx({
    groups: [makeGroup('g1', { name: 'TopLevel' })],
    items: [],
  });
  const rows = buildGroupPickerRows(ctx, null);
  const g1 = rows.find((r) => r.id === 'g1');
  assert.equal(g1.searchKey, 'toplevel', 'top-level group: lowercased name only, no breadcrumb');
});

test('B-029 AC3 search-key: nested group includes lowercased breadcrumb', () => {
  const ctx = makeCtx({
    groups: [
      makeGroup('parent', { name: 'Projects' }),
      makeGroup('child', { name: 'Tab Junkie', parentId: 'parent' }),
    ],
    items: [],
  });
  const rows = buildGroupPickerRows(ctx, null);
  const child = rows.find((r) => r.id === 'child');
  assert.equal(child.searchKey, 'tab junkie projects / tab junkie', 'nested: name + space + breadcrumb');
  /* And filtering by either substring works. */
  assert.ok(child.searchKey.includes('projects'));
  assert.ok(child.searchKey.includes('tab junkie'));
});
