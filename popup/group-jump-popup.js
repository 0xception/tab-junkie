/**
 * group-jump-popup.js — Tab Junkie Group Jump Popup (B-023).
 *
 * Authoritative spec: docs/design/40-b-023-group-jump-popup.md §40.4.2.
 *
 * Surface: a SEPARATE popup extension page from B-022's popup.{html,js,css}
 * per D-1. Opened programmatically by the service worker on Alt+K via
 * chrome.action.setPopup + chrome.action.openPopup (see background/
 * service-worker.js).
 *
 * Lifecycle:
 *   1. DOMContentLoaded → focus input, show skeleton, loadInitial().
 *   2. loadInitial() → Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS]) (D-5) →
 *      build _allRows via buildGroupPickerRows (reused §30 helper) → render
 *      group-list mode.
 *   3. input → debounce 120 ms → applyFilter() → render().
 *   4. keydown: ArrowUp/Down wraps selection; Enter drills in OR activates
 *      bookmark; Escape closes; ArrowLeft at input-start returns from
 *      drill-in; Tab cycles within popup.
 *   5. Drill-in: Enter on a group row → _mode='drill-in'; Enter on a
 *      drill-in bookmark → MSG_NAVIGATE_TO_ITEM → window.close().
 *
 * C-11 posture (§40.7 row C-11):
 *   v1 dispatches ZERO SW-side writes. `MSG_NAVIGATE_TO_ITEM` is a
 *   navigation message (storage-inert for {itemId}; broadcast-suppressed
 *   for {tabId, windowId}) — no write path exists. C-11 is vacuously
 *   satisfied. Any future jump-recency hook MUST fire BEFORE the
 *   navigate await, mirroring popup.js lines 523-544.
 *
 * XSS posture: every user-string render uses `textContent`,
 * `createTextNode`, or the `buildHighlightedText` DocumentFragment —
 * `innerHTML` is never used with user content.
 */

import { MSG_LIST_ITEMS, MSG_LIST_GROUPS, MSG_NAVIGATE_TO_ITEM } from '../shared/messages.js';
import {
  buildGroupPickerRows,
  normalizeGroupPickerQuery,
  applyGroupPickerFilter,
} from '../shared/group-picker-core.js';
import { buildHighlightedText } from '../shared/highlight.js';
import { isSafeFaviconUrl } from '../shared/favicon.js';
import { buildIndex, search } from '../sidepanel/search-index.js';

/* =========================================================================
   Tunables (§40.3 / §40.4)
   ========================================================================= */

/** D-4: input debounce window (ms). */
const DEBOUNCE_MS = 120;
/** AC20: hard cap on rendered group rows in the group-list view. */
const GROUP_RESULT_CAP = 100;

/* =========================================================================
   Module-scope state (§40.4.2)
   ========================================================================= */

/** @type {Array<Object>} */ let _items = [];
/** @type {Record<string, Object>} */ let _liveStates = {};
/** @type {Array<Object>} */ let _groups = [];
/** @type {Record<string, number>} */ let _windowMap = {};
/** @type {import('../shared/group-picker-core.js').PickerRow[]} */
let _allRows = [];
/** @type {import('../shared/group-picker-core.js').PickerRow[]} */
let _visibleRows = [];
/** @type {string} */ let _query = '';
/** @type {number|null} */ let _filterTimer = null;
/** @type {number} */ let _selectedIndex = -1;
/**
 * @type {'loading'|'group-list'|'drill-in'|'empty-matches'|'empty-no-groups'|'empty-drill'}
 */
let _mode = 'loading';
/** @type {string|null} */ let _drilledGroupId = null;
/** @type {ReturnType<typeof buildIndex>|null} */ let _drillSearchIndex = null;
/** @type {Array<Object>} */ let _drillChildGroups = [];
/** @type {Array<Object>} */ let _drillItems = [];
/** @type {Array<Object>} */ let _currentRows = [];

/* =========================================================================
   DOM refs
   ========================================================================= */

let rootEl;
let inputEl;
let inputWrapEl;
let listEl;
let statusEl;
let emptyEl;
let skeletonEl;
let breadcrumbEl;
let backBtnEl;
let crumbRootEl;
let crumbCurrentEl;

/* =========================================================================
   Entry point
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  rootEl = document.getElementById('gj-root');
  inputEl = document.getElementById('gj-input');
  inputWrapEl = document.getElementById('gj-input-wrap');
  listEl = document.getElementById('gj-list');
  statusEl = document.getElementById('gj-status');
  emptyEl = document.getElementById('gj-empty');
  skeletonEl = document.getElementById('gj-skeleton');
  breadcrumbEl = document.getElementById('gj-breadcrumb');
  backBtnEl = document.getElementById('gj-back-btn');
  crumbRootEl = document.getElementById('gj-crumb-root');
  crumbCurrentEl = document.getElementById('gj-crumb-current');

  if (inputEl) inputEl.focus();

  inputEl.addEventListener('input', _onInput);
  rootEl.addEventListener('keydown', _onKeyDown);
  listEl.addEventListener('click', _onListClick);
  listEl.addEventListener('mouseover', _onListMouseOver);
  backBtnEl.addEventListener('click', _exitDrillIn);
  crumbRootEl.addEventListener('click', _exitDrillIn);
  crumbRootEl.addEventListener('keydown', _onCrumbRootKey);

  _showSkeleton();
  loadInitial();
});

/* =========================================================================
   Initial load — D-5 parallel fetch
   ========================================================================= */

async function loadInitial() {
  _mode = 'loading';
  try {
    const [listResp, groupsResp] = await Promise.all([
      _sendMessage({ type: MSG_LIST_ITEMS, payload: {} }),
      _sendMessage({ type: MSG_LIST_GROUPS, payload: {} }),
    ]);

    if (listResp && listResp.ok === true) {
      const d = listResp.data || {};
      _items = Array.isArray(d.items) ? d.items : [];
      _liveStates = d.liveStates && typeof d.liveStates === 'object' ? d.liveStates : {};
      _windowMap = d.windowMap && typeof d.windowMap === 'object' ? d.windowMap : {};
    } else {
      _items = [];
      _liveStates = {};
      _windowMap = {};
    }

    if (groupsResp && groupsResp.ok === true) {
      const gd = groupsResp.data || {};
      _groups = Array.isArray(gd.groups) ? gd.groups : (Array.isArray(gd) ? gd : []);
    } else {
      _groups = [];
    }

    _allRows = buildGroupPickerRows({
      groups: _groups,
      items: _items,
      liveStates: _liveStates,
      sourceGroupId: null,
    });
    /* AC5 empty-query default: include Ungrouped in the flat list. The §30
       helper unshifts Ungrouped as the first row by default; that matches the
       "all groups" intent of AC5. */

    _hideSkeleton();

    if (_allRows.length === 0) {
      _mode = 'empty-no-groups';
      _currentRows = [];
      _selectedIndex = -1;
      _render();
      return;
    }

    _mode = 'group-list';
    _applyFilter();
  } catch {
    _hideSkeleton();
    _items = [];
    _groups = [];
    _liveStates = {};
    _allRows = [];
    _mode = 'empty-no-groups';
    _currentRows = [];
    _selectedIndex = -1;
    _render();
  }
}

/* =========================================================================
   Input debounce + filter
   ========================================================================= */

function _onInput() {
  _query = inputEl.value || '';
  if (_filterTimer !== null) {
    clearTimeout(_filterTimer);
    _filterTimer = null;
  }
  _filterTimer = setTimeout(() => {
    _filterTimer = null;
    _applyFilter();
  }, DEBOUNCE_MS);
}

function _applyFilter() {
  if (_mode === 'drill-in' || _mode === 'empty-drill') {
    _applyDrillFilter();
    return;
  }
  _applyGroupListFilter();
}

function _applyGroupListFilter() {
  /* B-023-H1 fix: reuse the shared helper (spec §40.2 reuse contract) instead
     of an inline match loop. The early-exit optimization becomes a slice cap;
     within supported bounds (≤500 items) the difference is negligible and the
     drift risk from maintaining two match loops is eliminated. */
  const filtered = applyGroupPickerFilter(_allRows, _query);
  _visibleRows = filtered.slice(0, GROUP_RESULT_CAP);

  if (_visibleRows.length === 0) {
    /* B-023-M2 fix: base empty-state label on whether any groups exist, not on
       the query. The `lq === ''` guard was unreachable today (match predicate
       returns true for empty query) but could mislabel after a future refactor. */
    _mode = _allRows.length === 0 ? 'empty-no-groups' : 'empty-matches';
    _currentRows = [];
    _selectedIndex = -1;
    _render();
    return;
  }

  _mode = 'group-list';
  _currentRows = _visibleRows.map((row) => ({ kind: 'group', row }));
  _resetSelection();
  _render();
}

function _applyDrillFilter() {
  if (!_drilledGroupId) {
    _exitDrillIn();
    return;
  }
  const lq = normalizeGroupPickerQuery(_query);

  /* Filter sub-groups by substring on name. */
  const subRows = _drillChildGroups.filter((g) => {
    if (lq === '') return true;
    return (g.name || '').toLowerCase().includes(lq);
  });

  /* Filter bookmarks via the reused B-052 index. */
  let itemHits;
  if (lq === '' || _drillSearchIndex === null) {
    itemHits = _drillItems.slice();
  } else {
    const entries = search(_drillSearchIndex, lq);
    const itemById = new Map(_drillItems.map((it) => [it.id, it]));
    itemHits = [];
    for (const e of entries) {
      const it = itemById.get(e.id);
      if (it) itemHits.push(it);
    }
  }

  const rows = [];
  if (subRows.length > 0) {
    rows.push({ kind: 'header', label: 'Sub-groups', count: subRows.length });
    for (const g of subRows) rows.push({ kind: 'subgroup', group: g });
  }
  if (itemHits.length > 0) {
    rows.push({ kind: 'header', label: 'Bookmarks', count: itemHits.length });
    for (const it of itemHits) {
      rows.push({ kind: 'bookmark', item: it, liveState: _liveStates[it.id] || null });
    }
  }

  if (rows.length === 0) {
    _mode = 'empty-drill';
    _currentRows = [];
    _selectedIndex = -1;
    _render();
    return;
  }

  _mode = 'drill-in';
  _currentRows = rows;
  _resetSelection();
  _render();
}

/* =========================================================================
   Drill-in enter / exit
   ========================================================================= */

function _enterDrillIn(groupId) {
  const group = _groups.find((g) => g.id === groupId);
  if (!group) return;

  _drilledGroupId = groupId;
  _drillChildGroups = _groups
    .filter((g) => g.parentId === groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  _drillItems = _items
    .filter((it) => it.groupId === groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  _drillSearchIndex = buildIndex(_drillItems);

  /* Reset the filter input for drill-in — separate query namespace. */
  _query = '';
  inputEl.value = '';
  inputEl.placeholder = 'Filter bookmarks\u2026';

  /* Breadcrumb chrome visible. */
  breadcrumbEl.hidden = false;
  while (crumbCurrentEl.firstChild) crumbCurrentEl.removeChild(crumbCurrentEl.firstChild);
  crumbCurrentEl.appendChild(document.createTextNode(group.name || ''));

  /* B-023-M3 fix: update listbox accessible name to reflect drill context. */
  listEl.setAttribute('aria-label', 'Contents of ' + (group.name || ''));

  _applyDrillFilter();
  inputEl.focus();
}

function _exitDrillIn() {
  if (_mode !== 'drill-in' && _mode !== 'empty-drill') return;
  _drilledGroupId = null;
  _drillChildGroups = [];
  _drillItems = [];
  _drillSearchIndex = null;

  _query = '';
  inputEl.value = '';
  inputEl.placeholder = 'Search groups\u2026';
  breadcrumbEl.hidden = true;

  /* B-023-M3 fix: restore top-level listbox label. */
  listEl.setAttribute('aria-label', 'Groups');

  _applyGroupListFilter();
  inputEl.focus();
}

function _onCrumbRootKey(e) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
    _exitDrillIn();
  }
}

/* =========================================================================
   Selection state
   ========================================================================= */

function _resetSelection() {
  for (let i = 0; i < _currentRows.length; i++) {
    if (_currentRows[i].kind !== 'header') {
      _selectedIndex = i;
      return;
    }
  }
  _selectedIndex = -1;
}

function _moveSelection(direction) {
  const activatable = [];
  for (let i = 0; i < _currentRows.length; i++) {
    if (_currentRows[i].kind !== 'header') activatable.push(i);
  }
  if (activatable.length === 0) {
    _selectedIndex = -1;
    return;
  }
  const pos = activatable.indexOf(_selectedIndex);
  let next;
  if (pos === -1) {
    next = direction > 0 ? 0 : activatable.length - 1;
  } else {
    next = (pos + direction + activatable.length) % activatable.length;
  }
  _selectedIndex = activatable[next];
}

/* =========================================================================
   Keyboard handler
   ========================================================================= */

function _onKeyDown(e) {
  if (e.key === 'Escape') {
    /* AC12 — Escape always closes, any level. Zero writes. */
    e.preventDefault();
    e.stopPropagation();
    window.close();
    return;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    _moveSelection(1);
    _renderSelection();
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    _moveSelection(-1);
    _renderSelection();
    return;
  }
  if (e.key === 'Enter') {
    if (_selectedIndex === -1) return;
    e.preventDefault();
    e.stopPropagation();
    const row = _currentRows[_selectedIndex];
    if (row && row.kind !== 'header') {
      _activateRow(row);
    }
    return;
  }
  if (e.key === 'ArrowLeft') {
    /* D-4 — ArrowLeft returns from drill-in only when the caret is at input
       start. Do NOT override when caret is inside text — user must be able to
       move it. Only active in drill-in modes. */
    if ((_mode === 'drill-in' || _mode === 'empty-drill') &&
        document.activeElement === inputEl &&
        inputEl.selectionStart === 0 &&
        inputEl.selectionEnd === 0) {
      e.preventDefault();
      e.stopPropagation();
      _exitDrillIn();
    }
    return;
  }
  if (e.key === 'Tab') {
    /* Focus trap. Same shape as B-022 popup.js — input ↔ selected row. */
    const activatable = [];
    for (let i = 0; i < _currentRows.length; i++) {
      if (_currentRows[i].kind !== 'header') activatable.push(i);
    }
    e.preventDefault();
    e.stopPropagation();

    if (activatable.length === 0) {
      if (document.activeElement !== inputEl) inputEl.focus();
      return;
    }

    const firstIdx = activatable[0];
    const lastIdx = activatable[activatable.length - 1];

    if (e.shiftKey) {
      if (_selectedIndex === -1) {
        _selectedIndex = lastIdx;
        inputEl.focus();
        _renderSelection();
        return;
      }
      const pos = activatable.indexOf(_selectedIndex);
      if (pos <= 0) {
        _selectedIndex = -1;
        inputEl.focus();
        _renderSelection();
        return;
      }
      _selectedIndex = activatable[pos - 1];
      _renderSelection();
      return;
    }

    if (_selectedIndex === -1) {
      _selectedIndex = firstIdx;
      inputEl.focus();
      _renderSelection();
      return;
    }
    const pos = activatable.indexOf(_selectedIndex);
    if (pos === -1 || pos === activatable.length - 1) {
      _selectedIndex = -1;
      inputEl.focus();
      _renderSelection();
      return;
    }
    _selectedIndex = activatable[pos + 1];
    _renderSelection();
    return;
  }
  /* Everything else — Home/End/Backspace/typable chars — passes through. */
}

/* =========================================================================
   Row activation
   ========================================================================= */

async function _activateRow(row) {
  if (row.kind === 'group' || row.kind === 'subgroup') {
    /* Ungrouped row has id=null — still a valid drill target per AC5. */
    const targetId = row.kind === 'group' ? row.row.id : row.group.id;
    if (!targetId) {
      /* Drill into Ungrouped — synthesize drill state from Ungrouped items. */
      _enterUngroupedDrillIn();
      return;
    }
    _enterDrillIn(targetId);
    return;
  }

  if (row.kind === 'bookmark') {
    /* C-11 ordering contract (§40.7). Currently ZERO SW writes to dispatch
       before the navigate — vacuously satisfied. If a future jump-recency
       write is added it MUST fire BEFORE the await below, mirroring
       popup.js:541-544. */

    /* B-023-H5 fix: dual-variant navigation per R2 §40.2 (B-022 precedent).
       If the bookmark has a live tab claim, dispatch the {tabId, windowId}
       variant so the SW focuses the existing tab instead of opening a new
       one. Mirrors popup.js:546-561. */
    const liveClaim = _liveStates[row.item.id];
    let payload;
    if (liveClaim && liveClaim.live && typeof liveClaim.tabId === 'number') {
      payload = {
        tabId: liveClaim.tabId,
        windowId: _windowMap[String(liveClaim.tabId)],
      };
    } else {
      payload = { itemId: row.item.id };
    }

    try {
      await _sendMessage({
        type: MSG_NAVIGATE_TO_ITEM,
        payload,
      });
    } catch {
      /* Navigation failure — keep popup open for the user. */
      return;
    }
    window.close();
  }
}

function _enterUngroupedDrillIn() {
  _drilledGroupId = '__ungrouped__';
  _drillChildGroups = [];
  _drillItems = _items
    .filter((it) => !it.groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  _drillSearchIndex = buildIndex(_drillItems);

  _query = '';
  inputEl.value = '';
  inputEl.placeholder = 'Filter bookmarks\u2026';

  breadcrumbEl.hidden = false;
  while (crumbCurrentEl.firstChild) crumbCurrentEl.removeChild(crumbCurrentEl.firstChild);
  crumbCurrentEl.appendChild(document.createTextNode('Ungrouped'));

  /* B-023-M3 fix: update listbox accessible name to reflect drill context. */
  listEl.setAttribute('aria-label', 'Contents of Ungrouped');

  _applyDrillFilter();
  inputEl.focus();
}

/* =========================================================================
   Mouse handlers
   ========================================================================= */

function _onListClick(e) {
  const li = e.target.closest('li[role="option"]');
  if (!li) return;
  const idx = Number(li.dataset.rowIndex);
  if (!Number.isFinite(idx)) return;
  const row = _currentRows[idx];
  if (!row || row.kind === 'header') return;
  _activateRow(row);
}

function _onListMouseOver(e) {
  const li = e.target.closest('li[role="option"]');
  if (!li) return;
  const idx = Number(li.dataset.rowIndex);
  if (!Number.isFinite(idx)) return;
  if (idx === _selectedIndex) return;
  _selectedIndex = idx;
  _renderSelection();
}

/* =========================================================================
   Render
   ========================================================================= */

function _showSkeleton() {
  if (skeletonEl) skeletonEl.hidden = false;
  if (inputWrapEl) inputWrapEl.setAttribute('aria-expanded', 'false');
}

function _hideSkeleton() {
  if (skeletonEl) skeletonEl.hidden = true;
}

function _render() {
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  if (_mode === 'empty-no-groups' || _mode === 'empty-matches' || _mode === 'empty-drill') {
    emptyEl.hidden = false;
    emptyEl.setAttribute('aria-hidden', 'false');
    _renderEmptyState();
    inputWrapEl.setAttribute('aria-expanded', 'false');
    inputEl.setAttribute('aria-activedescendant', '');
    _updateStatus();
    return;
  }
  emptyEl.hidden = true;
  emptyEl.setAttribute('aria-hidden', 'true');

  const q = normalizeGroupPickerQuery(_query);

  for (let i = 0; i < _currentRows.length; i++) {
    const row = _currentRows[i];
    if (row.kind === 'header') {
      const header = document.createElement('li');
      header.className = 'gj-section-header';
      header.setAttribute('role', 'presentation');
      const label = document.createElement('span');
      label.textContent = row.label;
      const count = document.createElement('span');
      count.className = 'gj-section-count';
      count.textContent = String(row.count);
      header.appendChild(label);
      header.appendChild(count);
      listEl.appendChild(header);
      continue;
    }
    listEl.appendChild(_buildRowElement(row, i, q));
  }

  inputWrapEl.setAttribute('aria-expanded', 'true');
  _renderSelection();
  _updateStatus();
}

function _renderEmptyState() {
  while (emptyEl.firstChild) emptyEl.removeChild(emptyEl.firstChild);
  const icon = document.createElement('div');
  icon.className = 'gj-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  const msg = document.createElement('div');
  msg.className = 'gj-empty-message';
  const hint = document.createElement('div');
  hint.className = 'gj-empty-hint';

  if (_mode === 'empty-no-groups') {
    icon.textContent = '\u{1F4C1}';
    msg.textContent = 'No groups yet';
    hint.textContent = 'Create a group from the sidepanel.';
  } else if (_mode === 'empty-matches') {
    icon.textContent = '\u{1F50D}';
    const q = _query.trim();
    msg.textContent = q.length > 0 ? `No groups matching "${q}"` : 'No groups match';
    hint.textContent = 'Clear the filter to see all groups.';
  } else if (_mode === 'empty-drill') {
    icon.textContent = '\u{1F4C4}';
    const q = _query.trim();
    msg.textContent = q.length > 0
      ? `No items matching "${q}"`
      : 'No items in this group';
    hint.textContent = 'Press Back to return to all groups.';
  }

  emptyEl.appendChild(icon);
  emptyEl.appendChild(msg);
  emptyEl.appendChild(hint);
}

function _buildRowElement(row, index, q) {
  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', 'false');
  li.id = `gj-row-${index}`;
  li.dataset.rowIndex = String(index);
  li.dataset.kind = row.kind;

  if (row.kind === 'group' || row.kind === 'subgroup') {
    const pickerRow = row.kind === 'group' ? row.row : _pickerRowFromGroup(row.group);

    const chip = document.createElement('span');
    chip.className = 'gj-color-chip';
    if (pickerRow.color) {
      chip.style.setProperty('--gj-group-color', pickerRow.color);
    }
    chip.setAttribute('aria-hidden', 'true');
    li.appendChild(chip);

    const col = document.createElement('div');
    col.className = 'gj-row-text';

    const name = document.createElement('div');
    name.className = 'gj-row-name';
    name.appendChild(buildHighlightedText(pickerRow.name || '', q));
    col.appendChild(name);

    if (pickerRow.breadcrumb) {
      const bc = document.createElement('div');
      bc.className = 'gj-row-breadcrumb';
      bc.appendChild(buildHighlightedText(pickerRow.breadcrumb, q));
      col.appendChild(bc);
    }
    li.appendChild(col);

    const countEl = document.createElement('span');
    countEl.className = 'gj-row-count';
    countEl.textContent = _formatCounts(pickerRow.savedCount, pickerRow.openCount);
    li.appendChild(countEl);
    return li;
  }

  /* row.kind === 'bookmark' */
  const fav = document.createElement('div');
  fav.className = 'gj-favicon';
  const liveState = row.liveState || null;
  const favUrl = _faviconUrlForItem(row.item, liveState);
  if (favUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = favUrl;
    img.addEventListener('error', () => {
      const kids = Array.from(fav.childNodes);
      for (const n of kids) {
        if (n.nodeType === 1 && n.tagName === 'IMG') fav.removeChild(n);
      }
      fav.textContent = _letterForItem(row.item);
    });
    fav.appendChild(img);
  } else {
    fav.textContent = _letterForItem(row.item);
  }
  li.appendChild(fav);

  const col = document.createElement('div');
  col.className = 'gj-row-text';
  const title = document.createElement('div');
  title.className = 'gj-row-name';
  title.appendChild(buildHighlightedText(row.item.title || row.item.url || 'Untitled', q));
  const url = document.createElement('div');
  url.className = 'gj-row-url';
  url.appendChild(buildHighlightedText(row.item.url || '', q));
  col.appendChild(title);
  col.appendChild(url);
  li.appendChild(col);
  return li;
}

function _pickerRowFromGroup(g) {
  /* Build a minimal PickerRow-shaped object for a sub-group under drill-in.
     Counts pulled from the same data set the main rows used. */
  let saved = 0;
  let open = 0;
  for (const it of _items) {
    if (it.groupId !== g.id) continue;
    saved++;
    const ls = _liveStates[it.id];
    if (ls && ls.live) open++;
  }
  return {
    id: g.id,
    name: g.name || '',
    color: g.color || null,
    breadcrumb: '',
    savedCount: saved,
    openCount: open,
    searchKey: (g.name || '').toLowerCase(),
  };
}

function _formatCounts(saved, open) {
  const parts = [];
  if (saved > 0) parts.push(`${saved} bookmark${saved === 1 ? '' : 's'}`);
  if (open > 0) parts.push(`${open} open`);
  if (parts.length === 0) return 'empty';
  return parts.join(' \u00B7 ');
}

function _letterForItem(item) {
  const seed = item.title || item.url || '?';
  const ch = seed.trim().charAt(0).toUpperCase();
  return ch || '?';
}

function _faviconUrlForItem(item, liveState) {
  if (liveState && isSafeFaviconUrl(liveState.favIconUrl)) {
    return liveState.favIconUrl;
  }
  if (item && isSafeFaviconUrl(item.favIconUrl)) {
    return item.favIconUrl;
  }
  return null;
}

function _renderSelection() {
  const lis = listEl.querySelectorAll('li[role="option"]');
  let selectedId = '';
  for (const li of lis) {
    const idx = Number(li.dataset.rowIndex);
    if (idx === _selectedIndex) {
      li.setAttribute('aria-selected', 'true');
      selectedId = li.id;
      if (typeof li.scrollIntoView === 'function') {
        li.scrollIntoView({ block: 'nearest' });
      }
    } else {
      li.setAttribute('aria-selected', 'false');
    }
  }
  inputEl.setAttribute('aria-activedescendant', selectedId);
}

function _updateStatus() {
  if (!statusEl) return;
  let msg = '';
  if (_mode === 'loading') msg = 'Loading\u2026';
  else if (_mode === 'empty-no-groups') msg = 'No groups yet';
  else if (_mode === 'empty-matches') {
    const q = _query.trim();
    msg = q.length > 0 ? `No groups matching ${q}` : 'No groups';
  } else if (_mode === 'empty-drill') {
    const q = _query.trim();
    msg = q.length > 0 ? `No items matching ${q}` : 'No items in this group';
  } else {
    let count = 0;
    for (const r of _currentRows) if (r.kind !== 'header') count++;
    msg = `${count} ${count === 1 ? 'result' : 'results'}`;
  }
  statusEl.textContent = msg;
}

/* =========================================================================
   chrome.runtime.sendMessage wrapper
   ========================================================================= */

function _sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || 'sendMessage failed'));
          return;
        }
        resolve(response);
      });
    } catch (e) {
      reject(e);
    }
  });
}
