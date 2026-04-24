/**
 * popup.js — Tab Junkie Quick Search Popup (B-022).
 *
 * Authoritative spec: docs/design/39-b-022-quick-search-popup.md §39.4.2.
 *
 * Lifecycle:
 *   1. DOMContentLoaded → focus input + loadInitial().
 *   2. loadInitial() → Promise.all([MSG_LIST_ITEMS, chrome.storage.local.get('tj:recency')])
 *      → build _searchIndex (reused B-052), _openTabIndex, _recencyEntries,
 *        _recencyRank → render recency mode (or empty-query-no-recency).
 *   3. input → debounce 120 ms → applyFilter() → render().
 *   4. keydown: ArrowUp/Down wraps selection; Enter activates row; Escape
 *      closes with zero writes; Tab native.
 *   5. Activation: MSG_NAVIGATE_TO_ITEM (itemId OR tabId+windowId) →
 *      chrome.tabs.update / chrome.tabs.create → MSG_RECENCY_ADD →
 *      window.close().
 *
 * XSS posture: every row-text write is `textContent` or a DocumentFragment
 * produced by `shared/highlight.js`. `innerHTML` is never used with user
 * content.
 *
 * The popup does NOT subscribe to MSG_STATE_CHANGED (§39.4.4). A mid-session
 * change leaves a stale list until the next open — acceptable for a <5 s
 * popup session.
 */

import {
  MSG_LIST_ITEMS,
  MSG_NAVIGATE_TO_ITEM,
  MSG_RECENCY_ADD,
} from '../shared/messages.js';
import { buildIndex, search } from '../sidepanel/search-index.js';
import { buildHighlightedText } from '../shared/highlight.js';
import { isSafeFaviconUrl } from '../shared/favicon.js';

/* =========================================================================
   Tunables (all lifted from §39.3 / §39.4)
   ========================================================================= */

/** D-4: input debounce window (ms). */
const DEBOUNCE_MS = 120;
/** AC14: hard cap on total rendered rows across both sections. */
const RESULT_CAP = 50;
/** AC13(a): recency mode view caps to top-20 entries (partition holds 50). */
const RECENCY_VIEW_CAP = 20;
/** Storage key for the popup recency store (§39.3 D-3). */
const RECENCY_KEY = 'tj:recency';
/** Prefix length constants for id parsing (`item:<ulid>` / `url:<url>`). */
const PREFIX_ITEM = 'item:';
const PREFIX_URL = 'url:';

/* =========================================================================
   Module-scope state (§39.4.2)
   ========================================================================= */

/** @type {Array<Object>} Saved items from MSG_LIST_ITEMS. */
let _items = [];
/** Map<string, Object> — itemId → item (O(1) resolution). */
let _itemById = new Map();
/** @type {Array<Object>} Open tabs from MSG_LIST_ITEMS.openTabs. */
let _openTabs = [];
/** Map<number, Object> — tabId → tab. */
let _tabById = new Map();
/** Map<string, Object> — tab.url → tab (recency resolution of url: ids). */
let _tabByUrl = new Map();
/** Per-item live-state map from MSG_LIST_ITEMS.liveStates. */
let _liveStates = {};
/** B-014 window-ordinal map — rawWindowId:string → ordinal:number. */
let _windowMap = {};
/** Frozen B-052 index over the saved-items corpus. */
let _searchIndex = null;
/** Parallel pre-lowercased array for open-tabs fuzzy filter. */
let _openTabIndex = [];
/** Recency partition, newest-first. `{id, accessedAt}` records. */
let _recencyEntries = [];
/** Map<string, number> — recency id → rank index for score boost lookup. */
let _recencyRank = new Map();

/** Current query string (raw; filter trims on read). */
let _query = '';
/** setTimeout handle for input debounce. */
let _filterTimer = null;
/** Render model — array of row descriptors with section boundaries. */
let _currentRows = [];
/** Currently-selected index into `_currentRows`. -1 = no selection. */
let _selectedIndex = -1;
/** @type {'loading'|'recency'|'results'|'empty-query-no-recency'|'empty-results'} */
let _mode = 'loading';

/* =========================================================================
   DOM refs
   ========================================================================= */

let rootEl, inputEl, inputWrapEl, listEl, statusEl, emptyEl, skeletonEl, scrollEl, sidepanelBtnEl, sidepanelErrorEl;

/* =========================================================================
   Entry point
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  rootEl = document.getElementById('qs-root');
  inputEl = document.getElementById('qs-input');
  inputWrapEl = document.getElementById('qs-input-wrap');
  listEl = document.getElementById('qs-list');
  statusEl = document.getElementById('qs-status');
  emptyEl = document.getElementById('qs-empty');
  skeletonEl = document.getElementById('qs-skeleton');
  scrollEl = document.getElementById('qs-results-scroll');
  sidepanelBtnEl = document.getElementById('popup-open-sidepanel-btn');
  sidepanelErrorEl = document.getElementById('qs-sidepanel-error');

  /* AC3 — programmatic focus plus native autofocus-style fallback. */
  if (inputEl) inputEl.focus();

  inputEl.addEventListener('input', _onInput);
  rootEl.addEventListener('keydown', _onKeyDown);
  listEl.addEventListener('click', _onListClick);
  listEl.addEventListener('mouseover', _onListMouseOver);

  /* B-082 AC2: Open side panel on button click. */
  if (sidepanelBtnEl) {
    sidepanelBtnEl.addEventListener('click', _onOpenSidepanelClick);
  }

  _showSkeleton();
  loadInitial();
});

/* =========================================================================
   Initial load
   ========================================================================= */

async function loadInitial() {
  _mode = 'loading';

  /* §39.4.2 — single round-trip + direct partition read in parallel. */
  try {
    const [listResp, stored] = await Promise.all([
      _sendMessage({ type: MSG_LIST_ITEMS, payload: {} }),
      _readRecencyPartition(),
    ]);

    if (!listResp || listResp.ok !== true) {
      /* Graceful degrade — render empty state rather than crashing the popup. */
      _items = [];
      _openTabs = [];
      _liveStates = {};
      _windowMap = {};
    } else {
      const data = listResp.data || {};
      _items = Array.isArray(data.items) ? data.items : [];
      _openTabs = Array.isArray(data.openTabs) ? data.openTabs : [];
      _liveStates = data.liveStates && typeof data.liveStates === 'object' ? data.liveStates : {};
      _windowMap = data.windowMap && typeof data.windowMap === 'object' ? data.windowMap : {};
    }

    /* Build resolution maps + search indexes. */
    _itemById = new Map(_items.map((it) => [it.id, it]));
    _tabById = new Map(_openTabs.map((t) => [t.tabId, t]));
    _tabByUrl = new Map(_openTabs.map((t) => [t.url, t]));
    _searchIndex = buildIndex(_items);
    _openTabIndex = _openTabs.map((t) => ({
      tabId: t.tabId,
      windowId: t.windowId,
      titleLower: String(t.title || '').toLowerCase(),
      urlLower: String(t.url || '').toLowerCase(),
      title: String(t.title || ''),
      url: String(t.url || ''),
      favIconUrl: t.favIconUrl || null,
      active: !!t.active,
      audible: !!t.audible,
      tabIndex: Number.isFinite(t.tabIndex) ? t.tabIndex : 0,
    }));

    /* Recency hydration. */
    _recencyEntries = Array.isArray(stored.entries) ? stored.entries : [];
    _recencyRank = new Map();
    for (let i = 0; i < _recencyEntries.length; i++) {
      const e = _recencyEntries[i];
      if (e && typeof e.id === 'string') _recencyRank.set(e.id, i);
    }

    _hideSkeleton();
    _applyFilter();
  } catch {
    _hideSkeleton();
    _items = [];
    _openTabs = [];
    _applyFilter();
  }
}

/* =========================================================================
   Storage — recency partition direct read (popup-side)
   ========================================================================= */

async function _readRecencyPartition() {
  try {
    const got = await chrome.storage.local.get(RECENCY_KEY);
    const stored = got[RECENCY_KEY];
    if (!stored || typeof stored !== 'object') return { schemaVersion: 1, entries: [] };
    /* §39.3 D-3 — unknown future schemaVersion → degrade gracefully. */
    if (stored.schemaVersion !== 1) return { schemaVersion: 1, entries: [] };
    if (!Array.isArray(stored.entries)) return { schemaVersion: 1, entries: [] };
    return stored;
  } catch {
    return { schemaVersion: 1, entries: [] };
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

/* §39.3 D-5 — score a filter match (title exact > prefix > substring + url
   bonus + recency boost for top-10). Higher is better. */
function _scoreEntry(entry, q) {
  let score = 0;
  if (entry.titleLower === q) score += 1000;
  else if (entry.titleLower.startsWith(q)) score += 500;
  else if (entry.titleLower.includes(q)) score += 250;
  if (entry.urlLower.includes(q)) score += 100;
  const id = entry.__recencyId;
  if (id) {
    const rank = _recencyRank.get(id);
    if (rank !== undefined && rank < 10) score += (10 - rank) * 5;
  }
  return score;
}

function _applyFilter() {
  const raw = _query;
  const trimmed = raw.trim();
  const q = trimmed.toLowerCase();

  if (trimmed.length === 0) {
    /* §39.3 D-4 / AC19(e) — whitespace-only + empty query collapse to
       recency mode. */
    _renderRecency();
    return;
  }

  /* Filter saved items via the reused B-052 index. */
  const savedHits = search(_searchIndex, q);
  const savedScored = savedHits.map((e) => ({
    kind: 'saved',
    entry: e,
    item: _itemById.get(e.id),
    /* Enrich with recency id for scoring. */
    __recencyId: PREFIX_ITEM + e.id,
    score: 0,
  }));
  for (const r of savedScored) {
    r.score = _scoreEntry({ titleLower: r.entry.titleLower, urlLower: r.entry.urlLower, __recencyId: r.__recencyId }, q);
  }
  /* Drop any scored entry whose backing item vanished (defensive — should
     never happen since the index is built from _items). */
  const savedReady = savedScored.filter((r) => r.item !== undefined);

  /* Filter open tabs. */
  const tabsScored = [];
  for (const t of _openTabIndex) {
    if (!(t.titleLower.includes(q) || t.urlLower.includes(q))) continue;
    const recencyId = PREFIX_URL + t.url;
    const score = _scoreEntry({ titleLower: t.titleLower, urlLower: t.urlLower, __recencyId: recencyId }, q);
    tabsScored.push({ kind: 'openTab', tab: t, score });
  }

  /* Stable sort — highest score first; ties preserve insertion order, which
     is the B-052 / openTabs natural order. */
  savedReady.sort((a, b) => b.score - a.score);
  tabsScored.sort((a, b) => b.score - a.score);

  /* §39.3 D-6 — NEVER cross-dedupe. Two rows allowed when a URL lives in both
     sections. Cap total to 50 (AC14) — bookmarks first, then tabs, with a
     proportional split so neither section can fully starve the other when
     the cap is hit. Simplest fair split: allocate up to half to each
     section, fill remainder from whichever side has more. */
  const savedHalfCap = Math.min(savedReady.length, Math.ceil(RESULT_CAP / 2));
  let savedSlice;
  let tabsSlice;
  if (savedReady.length + tabsScored.length <= RESULT_CAP) {
    savedSlice = savedReady;
    tabsSlice = tabsScored;
  } else if (savedReady.length <= savedHalfCap) {
    savedSlice = savedReady;
    tabsSlice = tabsScored.slice(0, RESULT_CAP - savedSlice.length);
  } else if (tabsScored.length <= RESULT_CAP - savedHalfCap) {
    tabsSlice = tabsScored;
    savedSlice = savedReady.slice(0, RESULT_CAP - tabsSlice.length);
  } else {
    savedSlice = savedReady.slice(0, savedHalfCap);
    tabsSlice = tabsScored.slice(0, RESULT_CAP - savedSlice.length);
  }

  const rows = [];
  if (savedSlice.length > 0) {
    rows.push({ kind: 'header', label: 'Bookmarks', count: savedSlice.length });
    for (const r of savedSlice) {
      rows.push({
        kind: 'saved',
        id: r.item.id,
        item: r.item,
        liveState: _liveStates[r.item.id] || null,
      });
    }
  }
  if (tabsSlice.length > 0) {
    rows.push({ kind: 'header', label: 'Open Tabs', count: tabsSlice.length });
    for (const r of tabsSlice) {
      rows.push({
        kind: 'openTab',
        tab: r.tab,
      });
    }
  }

  if (rows.length === 0) {
    _mode = 'empty-results';
  } else {
    _mode = 'results';
  }
  _currentRows = rows;
  _resetSelection();
  _render();
}

/* =========================================================================
   Recency mode
   ========================================================================= */

function _renderRecency() {
  const rows = [];
  if (_recencyEntries.length > 0) {
    /* §39.3 D-3 — resolve ids to displayable rows, dropping stale entries. */
    const recentRows = [];
    for (const entry of _recencyEntries) {
      if (!entry || typeof entry.id !== 'string') continue;
      if (entry.id.startsWith(PREFIX_ITEM)) {
        const itemId = entry.id.slice(PREFIX_ITEM.length);
        const item = _itemById.get(itemId);
        if (item) {
          recentRows.push({
            kind: 'saved',
            id: item.id,
            item,
            liveState: _liveStates[item.id] || null,
          });
        }
      } else if (entry.id.startsWith(PREFIX_URL)) {
        const url = entry.id.slice(PREFIX_URL.length);
        const tab = _tabByUrl.get(url);
        if (tab) {
          const it = _openTabIndex.find((t) => t.tabId === tab.tabId);
          if (it) recentRows.push({ kind: 'openTab', tab: it });
        }
      }
      if (recentRows.length >= RECENCY_VIEW_CAP) break;
    }
    if (recentRows.length > 0) {
      rows.push({ kind: 'header', label: 'Recent', count: recentRows.length });
      for (const r of recentRows) rows.push(r);
      _mode = 'recency';
    } else {
      _mode = 'empty-query-no-recency';
    }
  } else {
    _mode = 'empty-query-no-recency';
  }
  _currentRows = rows;
  _resetSelection();
  _render();
}

/* =========================================================================
   Selection state
   ========================================================================= */

function _resetSelection() {
  /* First activatable row is the first non-header. */
  for (let i = 0; i < _currentRows.length; i++) {
    if (_currentRows[i].kind !== 'header') {
      _selectedIndex = i;
      return;
    }
  }
  _selectedIndex = -1;
}

function _moveSelection(direction) {
  /* Move by `direction` (+1 down, -1 up), skipping header rows. Wrap around
     at both ends (AC9). */
  const activatable = [];
  for (let i = 0; i < _currentRows.length; i++) {
    if (_currentRows[i].kind !== 'header') activatable.push(i);
  }
  if (activatable.length === 0) {
    _selectedIndex = -1;
    return;
  }
  const currentPos = activatable.indexOf(_selectedIndex);
  let nextPos;
  if (currentPos === -1) {
    nextPos = direction > 0 ? 0 : activatable.length - 1;
  } else {
    nextPos = (currentPos + direction + activatable.length) % activatable.length;
  }
  _selectedIndex = activatable[nextPos];
}

/* =========================================================================
   Keyboard handler
   ========================================================================= */

function _onKeyDown(e) {
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
  if (e.key === 'Escape') {
    /* AC11 — zero writes; close immediately. */
    e.preventDefault();
    e.stopPropagation();
    window.close();
    return;
  }
  if (e.key === 'Tab') {
    /* B-022 R4 H-2 — focus trap. Result rows are not individually focusable
       (selection lives in `aria-activedescendant`), so this is a logical
       trap between the input, the "selected row" concept, and the Open Side
       Panel button. The Tab key always cycles within the popup — it never
       escapes to browser chrome.
       Cycle (forward): input → rows (first…last) → sidepanel-btn → input
       Cycle (reverse): input → sidepanel-btn → rows (last…first) → input
       WCAG 2.1.2 No Keyboard Trap is satisfied by Escape closing the popup. */
    const activatable = [];
    for (let i = 0; i < _currentRows.length; i++) {
      if (_currentRows[i].kind !== 'header') activatable.push(i);
    }
    e.preventDefault();
    e.stopPropagation();

    const onBtn = sidepanelBtnEl && document.activeElement === sidepanelBtnEl;

    if (e.shiftKey) {
      /* Shift+Tab reverse cycle:
         input        → sidepanel-btn
         sidepanel-btn → last row (or input if no rows)
         row N        → row N-1
         row 0        → input */
      if (document.activeElement === inputEl || _selectedIndex === -1 && !onBtn) {
        /* From input → jump to the button. */
        _selectedIndex = -1;
        _renderSelection();
        if (sidepanelBtnEl) sidepanelBtnEl.focus();
        return;
      }
      if (onBtn) {
        /* From button → last result row (or input if none). */
        if (activatable.length === 0) {
          inputEl.focus();
          return;
        }
        _selectedIndex = activatable[activatable.length - 1];
        inputEl.focus();
        _renderSelection();
        return;
      }
      /* On a result row — go to previous row or back to input. */
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

    /* Tab (no Shift) forward cycle:
       input     → first row (or sidepanel-btn if no rows)
       row N     → row N+1
       last row  → sidepanel-btn
       btn       → input */
    if (onBtn) {
      /* From button → wrap back to input. */
      _selectedIndex = -1;
      _renderSelection();
      inputEl.focus();
      return;
    }
    if (activatable.length === 0) {
      /* No rows — cycle input ↔ button. */
      if (document.activeElement === inputEl) {
        if (sidepanelBtnEl) sidepanelBtnEl.focus();
      } else {
        inputEl.focus();
      }
      return;
    }
    if (_selectedIndex === -1) {
      /* From input → first row. */
      _selectedIndex = activatable[0];
      inputEl.focus();
      _renderSelection();
      return;
    }
    const pos = activatable.indexOf(_selectedIndex);
    if (pos === -1 || pos === activatable.length - 1) {
      /* Last row → sidepanel-btn. */
      _selectedIndex = -1;
      _renderSelection();
      if (sidepanelBtnEl) sidepanelBtnEl.focus();
      return;
    }
    _selectedIndex = activatable[pos + 1];
    _renderSelection();
    return;
  }
  /* Everything else (ArrowLeft/ArrowRight, Home/End, Backspace, typable
     characters) passes through untouched. */
}

/* =========================================================================
   Row activation (Enter / click)
   ========================================================================= */

async function _activateRow(row) {
  /* UAT-4 defect fix: Edge auto-closes the popup when `chrome.tabs.update`
     activates a different tab. If we await MSG_NAVIGATE_TO_ITEM first, the
     popup's JS context is torn down before the recency send is issued — the
     message is never queued and the SW never sees it. Queue the recency
     write FIRST (fire-and-forget — Chrome's native runtime delivers queued
     messages even after the sender page closes) so it persists regardless
     of how the navigate affects window focus.
     recencyId is derivable from the row alone; no need to wait for navigate. */
  let recencyId = null;
  if (row.kind === 'saved') {
    recencyId = PREFIX_ITEM + row.item.id;
  } else if (row.kind === 'openTab') {
    recencyId = PREFIX_URL + row.tab.url;
  }

  /* Fire recency FIRST. Don't await — we need the call to dispatch before
     the navigate await closes the popup. .catch swallows any runtime error. */
  if (recencyId !== null) {
    _sendMessage({ type: MSG_RECENCY_ADD, payload: { id: recencyId } })
      .catch(() => { /* swallow safe-mode / quota / transient */ });
  }

  try {
    if (row.kind === 'saved') {
      /* §39.3 D-6 — saved-row Enter routes via MSG_NAVIGATE_TO_ITEM `itemId`
         variant. The SW decides whether to focus the live claim or open a
         new tab. */
      await _sendMessage({
        type: MSG_NAVIGATE_TO_ITEM,
        payload: { itemId: row.item.id },
      });
    } else if (row.kind === 'openTab') {
      /* §39.3 D-6 — live-tab row uses the tabId variant (no storage write). */
      await _sendMessage({
        type: MSG_NAVIGATE_TO_ITEM,
        payload: { tabId: row.tab.tabId, windowId: row.tab.windowId },
      });
    }
  } catch {
    /* Navigation failure — popup stays open for the user to retry. Recency
       was already fired before this point; if the user intent was clear
       (Enter pressed on a row), persisting recency is acceptable even on
       a failed navigate. */
    return;
  }

  window.close();
}

/* =========================================================================
   Mouse handlers on the listbox
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
  /* Clear list. */
  while (listEl.firstChild) listEl.removeChild(listEl.firstChild);

  if (_mode === 'empty-query-no-recency' || _mode === 'empty-results') {
    emptyEl.hidden = false;
    _renderEmptyState();
    inputWrapEl.setAttribute('aria-expanded', 'false');
    inputEl.setAttribute('aria-activedescendant', '');
    _updateStatus();
    return;
  }
  emptyEl.hidden = true;

  /* Build section headers + rows. Each row keeps a `data-row-index` pointing
     back into `_currentRows` for click/hover resolution. */
  for (let i = 0; i < _currentRows.length; i++) {
    const row = _currentRows[i];
    if (row.kind === 'header') {
      const header = document.createElement('li');
      header.className = 'qs-section-header';
      header.setAttribute('role', 'presentation');
      const labelSpan = document.createElement('span');
      labelSpan.textContent = row.label;
      const countSpan = document.createElement('span');
      countSpan.className = 'qs-section-count';
      countSpan.textContent = String(row.count);
      header.appendChild(labelSpan);
      header.appendChild(countSpan);
      listEl.appendChild(header);
      continue;
    }
    const li = _buildRowElement(row, i);
    listEl.appendChild(li);
  }

  inputWrapEl.setAttribute('aria-expanded', 'true');
  _renderSelection();
  _updateStatus();
}

function _renderEmptyState() {
  while (emptyEl.firstChild) emptyEl.removeChild(emptyEl.firstChild);
  const icon = document.createElement('div');
  icon.className = 'qs-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = _mode === 'empty-query-no-recency' ? '🕑' : '🔍';
  const msg = document.createElement('div');
  msg.className = 'qs-empty-message';
  if (_mode === 'empty-query-no-recency') {
    msg.textContent = 'No recent items yet';
  } else {
    const queryText = _query.trim();
    msg.textContent = queryText.length > 0 ? `No results for "${queryText}"` : 'No results';
  }
  emptyEl.appendChild(icon);
  emptyEl.appendChild(msg);
}

function _buildRowElement(row, index) {
  const li = document.createElement('li');
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', 'false');
  li.id = `qs-row-${index}`;
  li.dataset.rowIndex = String(index);
  li.dataset.kind = row.kind;

  /* Favicon + fallback. */
  const fav = document.createElement('div');
  fav.className = 'qs-favicon';
  /* B-022 R4 H-3: tag the favicon container with the row kind so CSS can
     overlay a saved-vs-live indicator (bookmark dot vs live dot). */
  fav.dataset.kind = row.kind;
  /* B-022 R4 H-1: isSafeFaviconUrl guards the live-tab favIconUrl path too —
     parity with sidepanel which never assigns an unchecked favIconUrl. */
  const favUrl = row.kind === 'saved'
    ? _faviconUrlForItem(row.item, row.liveState)
    : (isSafeFaviconUrl(row.tab.favIconUrl) ? row.tab.favIconUrl : null);
  if (favUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = favUrl;
    img.addEventListener('error', () => {
      /* On image error, drop the img but preserve the overlay dot — the
         overlay still communicates saved-vs-live even when favicon is
         unavailable. */
      const kids = Array.from(fav.childNodes);
      for (const n of kids) {
        if (n.nodeType === 1 && n.tagName === 'IMG') fav.removeChild(n);
      }
      fav.textContent = _letterForRow(row);
      /* textContent wipes children — re-append the overlay span. */
      fav.appendChild(_buildFaviconOverlay(row.kind));
    });
    fav.appendChild(img);
  } else {
    fav.textContent = _letterForRow(row);
  }
  /* B-022 R4 H-3: saved rows show a bookmark-accent dot overlay; open-tab
     rows show a green live-dot overlay. Unconditional — not gated on
     tab.active or window ordinal (spec §39.3 D-6). */
  fav.appendChild(_buildFaviconOverlay(row.kind));
  li.appendChild(fav);

  /* Text column — title + url (both with highlight fragment). */
  const col = document.createElement('div');
  col.className = 'qs-row-text';

  const titleEl = document.createElement('div');
  titleEl.className = 'qs-row-title';
  const urlEl = document.createElement('div');
  urlEl.className = 'qs-row-url';

  const q = _query.trim();
  if (row.kind === 'saved') {
    titleEl.appendChild(buildHighlightedText(row.item.title || '', q));
    urlEl.appendChild(buildHighlightedText(row.item.url || '', q));
  } else {
    const displayTitle = row.tab.title || row.tab.url || 'Untitled tab';
    titleEl.appendChild(buildHighlightedText(displayTitle, q));
    urlEl.appendChild(buildHighlightedText(row.tab.url || '', q));
  }
  col.appendChild(titleEl);
  col.appendChild(urlEl);

  /* Meta row — section-dependent breadcrumb / window badge. */
  const meta = _buildMetaLine(row);
  if (meta !== null) col.appendChild(meta);

  li.appendChild(col);
  return li;
}

function _buildMetaLine(row) {
  const meta = document.createElement('div');
  meta.className = 'qs-row-meta';

  if (row.kind === 'saved') {
    /* Group breadcrumb — fall back to "Ungrouped" when item has no group. */
    const groupId = row.item.groupId || null;
    const breadcrumb = groupId
      ? _groupBreadcrumb(groupId)
      : 'Ungrouped';
    const txt = document.createElement('span');
    txt.textContent = `${breadcrumb} ›`;
    meta.appendChild(txt);
    return meta;
  }

  if (row.kind === 'openTab') {
    /* Window badge (only when ordinal > 1 and present in map) +
       "active tab" indicator. */
    const ordinal = _windowMap[String(row.tab.windowId)];
    if (Number.isFinite(ordinal) && ordinal > 1) {
      const badge = document.createElement('span');
      badge.className = 'qs-badge';
      badge.textContent = `W${ordinal}`;
      meta.appendChild(badge);
    }
    if (row.tab.active) {
      const active = document.createElement('span');
      active.className = 'qs-badge qs-badge-active';
      active.textContent = 'active tab';
      meta.appendChild(active);
    }
    if (row.tab.audible) {
      const audible = document.createElement('span');
      audible.className = 'qs-badge';
      audible.textContent = '♪';
      audible.setAttribute('aria-label', 'audible');
      meta.appendChild(audible);
    }
    return meta.childNodes.length > 0 ? meta : null;
  }
  return null;
}

function _groupBreadcrumb(groupId) {
  /* Minimal breadcrumb — popup does not list groups in MSG_LIST_ITEMS.
     Fall back to the group id if unresolvable. Future enhancement would
     request MSG_LIST_GROUPS; B-022 scope keeps the round-trips to one. */
  return groupId ? 'Group' : 'Ungrouped';
}

/* B-022 R4 H-3: icon-differential overlay. Saved rows get a bookmark-colored
   dot (`qs-overlay-bookmark`); open-tab rows get a green live dot
   (`qs-overlay-livedot`). An `aria-label` keeps the distinction discoverable
   to AT even without color — WCAG 1.4.1 (color is not the sole channel). */
function _buildFaviconOverlay(kind) {
  const dot = document.createElement('span');
  dot.className = 'qs-favicon-overlay ' + (kind === 'saved'
    ? 'qs-overlay-bookmark'
    : 'qs-overlay-livedot');
  dot.setAttribute('aria-hidden', 'true');
  return dot;
}

function _letterForRow(row) {
  const seed = row.kind === 'saved'
    ? (row.item.title || row.item.url || '?')
    : (row.tab.title || row.tab.url || '?');
  const ch = seed.trim().charAt(0).toUpperCase();
  return ch || '?';
}

function _faviconUrlForItem(item, liveState) {
  /* B-022 R4 H-1: zero network calls. Prefer live-claim favIconUrl; fall back
     to the item's own favIconUrl (set when the bookmark was saved from a live
     tab). Both routed through isSafeFaviconUrl (https/http/data:image only).
     No outbound google.com favicon fetch — letter-avatar fallback renders
     when no safe URL is available. Matches sidepanel policy. */
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
      /* Keep the selected row visible in the scroll region. */
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
  if (_mode === 'loading') msg = 'Loading…';
  else if (_mode === 'empty-query-no-recency') msg = 'No recent items yet';
  else if (_mode === 'empty-results') {
    const q = _query.trim();
    msg = q.length > 0 ? `No results for ${q}` : 'No results';
  } else {
    let count = 0;
    for (const r of _currentRows) if (r.kind !== 'header') count++;
    msg = `${count} ${count === 1 ? 'result' : 'results'}`;
  }
  statusEl.textContent = msg;
}

/* =========================================================================
   B-082: Open Side Panel button
   C-11 note: this handler does NOT write to chrome.storage; it only calls
   chrome.sidePanel.open(). If a future enhancement adds SW writes on click,
   re-evaluate C-11 compliance at that point.
   ========================================================================= */

let _sidepanelOpening = false;
async function _onOpenSidepanelClick() {
  /* M-2 rapid-click guard — prevents duplicate sidePanel.open() calls if the
     user clicks the button more than once before the async call resolves. */
  if (_sidepanelOpening) return;
  _sidepanelOpening = true;

  /* AC5: clear any previous error before attempting. */
  if (sidepanelErrorEl) {
    sidepanelErrorEl.textContent = '';
    sidepanelErrorEl.classList.add('qs-visually-hidden');
  }

  try {
    /* AC2: resolve the current window id then open the side panel. */
    const currentWindow = await chrome.windows.getCurrent({ populate: false });
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    /* AC4: most browsers auto-collapse popup on focus-shift after sidePanel.open(),
       but call window.close() defensively to handle outlier cases where auto-collapse doesn't fire. */
    window.close();
  } catch {
    /* AC5: side panel open failed — keep popup open and show inline error. */
    if (sidepanelErrorEl) {
      sidepanelErrorEl.textContent = 'Could not open side panel. Please try again.';
      sidepanelErrorEl.classList.remove('qs-visually-hidden');
    }
  } finally {
    _sidepanelOpening = false;
  }
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
