/**
 * newtab.js — Tab Junkie New Tab Page (B-036).
 *
 * Authoritative spec: docs/design/42-b-036-newtab-page.md §42.3–§42.7.
 *
 * Lifecycle (§42.4.4 — simplified at S29 close, see B-039 drop note):
 *   1. DOMContentLoaded → render skeleton placeholder into grid.
 *   2. Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS]) → build index + render.
 *   3. chrome.runtime.onMessage.addListener attached (MSG_STATE_CHANGED).
 *   4. Focus lands on the web-search input (AC11).
 *
 * B-039 drop (S29 close): the new tab page is always on. The Manifest V3
 * constraint that `chrome_url_overrides.newtab` cannot be removed at runtime
 * means the OFF state could not deliver browser-default new-tab behavior —
 * only `about:blank` or a custom disabled-state page. Product-owner decision:
 * ship newtab always-on. Users who want their browser default back must
 * uninstall Tab Junkie. The legacy `newTabOverride` pref key was removed in
 * B-088 (Sprint 32 hygiene) — stale on-disk values are tolerated by
 * `isPreferences` and stripped by the json-import validator. See §42.3 D-2a
 * (RESCINDED) and `docs/SPRINT.md` S29 retro.
 *
 * C-11 guardrail (§42.3 D-5, critical):
 *   - The ONLY SW-write fired from the newtab is MSG_NAVIGATE_TO_ITEM.
 *   - It is dispatched fire-and-forget — `chrome.runtime.sendMessage(...).catch(() => {})`
 *     — BEFORE any awaits on the click path. Do NOT await this call; do NOT
 *     gate UI state on its response. The SW performs the focus shift
 *     internally; the newtab just queues the message.
 *
 * XSS posture: every row-text write is textContent or a DocumentFragment
 * built via `shared/highlight.js`. innerHTML is never used with user content.
 * Favicon URLs flow through `shared/favicon.js` `isSafeFaviconUrl`.
 */

import {
  MSG_LIST_ITEMS,
  MSG_LIST_GROUPS,
  MSG_NAVIGATE_TO_ITEM,
  MSG_STATE_CHANGED,
  MSG_GET_PREFERENCES,
  MSG_CLOSE_TABS,
  MSG_PROMOTE_TAB,
} from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';
import { GROUP_COLORS } from '../shared/constants.js';
import { buildHighlightedText } from '../shared/highlight.js';
import { isSafeFaviconUrl } from '../shared/favicon.js';
import { buildIndex, search, diffAndPatch } from '../sidepanel/search-index.js';
/* B-088 fix #1 — shared theme + dense-layout appliers. */
import { applyTheme as _applyTheme, applyDenseLayout as _applyDenseLayout } from '../shared/surface-prefs.js';
import { resolveRenderOrder, deriveTopLevelRenderOrder } from '../shared/render-order.js';

/* =========================================================================
   Tunables
   ========================================================================= */

/** AC7: filter debounce (ms). Deliberately 200 ms on the newtab (sidepanel
    uses 150 ms per B-021). §42.6.2 / §42.9 document the asymmetry. */
const FILTER_DEBOUNCE_MS = 200;
/** §42.6.2: skeleton-group count while the bootstrap fetches resolve. */
const SKELETON_GROUP_COUNT = 3;
/** §42.6.2: skeleton-row count per skeleton group. */
const SKELETON_ROW_COUNT = 5;
/** B-196 §79.2.4: the top-level catch-all head bucket key. Ungrouped saved
    items (and, post-B-197, top-level floating members) render under this
    sentinel with the label "Top Level". Newtab is HEAD-ONLY — it has never
    rendered loose open tabs, so there is no loose tail here (adding one would
    be net-new functionality, a separate item). */
const UNGROUPED_KEY = '__toplevel__';

/* =========================================================================
   Module-scope state
   ========================================================================= */

/** @type {Array<Object>} Saved items from MSG_LIST_ITEMS. */
let _items = [];
/** Map<string, Object> — itemId → item (kept in lockstep with _items for O(1)
    lookup from broadcast-time patch loops; HIGH-1 R4 fix). */
let _itemMap = new Map();
/** @type {Array<Object>} Groups from MSG_LIST_GROUPS. */
let _groups = [];
/** Per-item live state from MSG_LIST_ITEMS.liveStates. */
let _liveStates = {};
/** Per-item drift record map. */
let _driftRecords = {};
/** B-121 — per-group floating-tab synthetic-row descriptors. Optional on the
    response (pre-S38) — defensively coerced to {} on read. */
let _floatingMembers = {};
/** Frozen B-052 index over saved items. */
let _index = null;
/** Current filter query (raw; trimmed at use). */
let _filterQuery = '';
/** setTimeout handle for the filter debounce. */
let _filterTimer = null;
/** Map<string, HTMLElement> — itemId → row element (for live-state patches). */
let _rowByItemId = new Map();
/** Map<string, HTMLElement> — groupId (or UNGROUPED_KEY) → group <section>
    element, populated during _buildGroupSection. Avoids the O(n²) DOM walk
    previously required in _applyFilter (HIGH-2 R4 fix). */
let _groupSectionByGroupId = new Map();
/** Map<string, Array<HTMLElement>> — groupId (or UNGROUPED_KEY) → row
    elements rendered inside that section. Paired with _groupSectionByGroupId
    so _applyFilter can decide group visibility without re-scanning the DOM. */
let _rowsByGroupId = new Map();
/** Set of item ids that are currently hidden by the active filter. */
let _hiddenRowIds = new Set();
/** Whether the MSG_STATE_CHANGED listener has been attached. */
let _broadcastListenerAttached = false;
/** Guard to prevent concurrent _refetchAndRender() invocations from
    clobbering _rowByItemId / _groupSectionByGroupId mid-population
    (MEDIUM-5 R4 fix). */
let _refetchInFlight = false;

/* DOM references (populated at boot). */
let _rootEl = null;
let _gridEl = null;
let _filterInputEl = null;
let _filterClearEl = null;
let _webSearchFormEl = null;
let _webSearchInputEl = null;
let _emptyStateEl = null;
let _errorStateEl = null;

/* =========================================================================
   Entry point
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => { void boot(); });

async function boot() {
  _rootEl = document.getElementById('newtab-root');
  _gridEl = document.getElementById('newtab-grid');
  _filterInputEl = document.getElementById('newtab-filter-input');
  _filterClearEl = document.getElementById('newtab-filter-clear');
  _webSearchFormEl = document.getElementById('web-search-form');
  _webSearchInputEl = document.getElementById('web-search-input');
  _emptyStateEl = document.getElementById('newtab-empty-state');
  _errorStateEl = document.getElementById('newtab-error-state');

  /* B-039 drop (S29 close): the new tab page is always on. No pref gate.
     Reveal the shell and start fetching immediately. See file header for
     the Manifest V3 rationale. */
  if (_rootEl) _rootEl.hidden = false;
  _renderSkeleton();
  _attachStaticEventHandlers();

  /* §42.3 D-6: parallel fetch — items + groups in parallel, render once both
     resolve. B-092: prefs are fetched alongside as a best-effort lookup so
     the dense-layout body class is applied before first paint. A prefs
     fetch failure is non-fatal — the dense flag stays at its default. */
  try {
    const [itemsResp, groupsResp, prefsResp] = await Promise.all([
      _sendMessage({ type: MSG_LIST_ITEMS, payload: {} }),
      _sendMessage({ type: MSG_LIST_GROUPS, payload: {} }),
      _sendMessage({ type: MSG_GET_PREFERENCES, payload: {} }).catch(() => null),
    ]);
    _setItems(Array.isArray(itemsResp?.items) ? itemsResp.items : []);
    _liveStates = itemsResp && typeof itemsResp.liveStates === 'object' && itemsResp.liveStates
      ? itemsResp.liveStates
      : {};
    _driftRecords = itemsResp && typeof itemsResp.driftRecords === 'object' && itemsResp.driftRecords
      ? itemsResp.driftRecords
      : {};
    /* B-121: floating-members map keyed by parent groupId. Optional — pre-S38
       SW responses omit the field entirely; coerce to {} so the renderer
       always has a stable shape. */
    _floatingMembers = itemsResp && typeof itemsResp.floatingMembers === 'object'
        && !Array.isArray(itemsResp.floatingMembers) && itemsResp.floatingMembers
      ? itemsResp.floatingMembers
      : {};
    _groups = Array.isArray(groupsResp) ? groupsResp : [];
    /* B-092: hydrate the dense-layout body class from prefs. The prefs
       fetch above swallows its own failure; if `prefsResp` is null we
       simply leave the body class at its default (off). */
    _applyDenseLayout(prefsResp);
    /* B-037: hydrate the theme attribute + sessionStorage from prefs so the
       newtab repaints with the correct theme. A null prefsResp leaves the
       FOUC-guard-applied attribute in place (cached value or 'system'). */
    if (prefsResp && typeof prefsResp.theme === 'string') _applyTheme(prefsResp.theme);
  } catch (err) {
    _renderErrorState(err);
    return;
  }

  _index = buildIndex(_items);
  _renderGrid();
  _attachBroadcastListener();

  /* AC11: focus lands on the web-search input on load. */
  if (_webSearchInputEl) _webSearchInputEl.focus();
}

/* =========================================================================
   Static event handlers (attached once per boot)
   ========================================================================= */

function _attachStaticEventHandlers() {
  if (_webSearchFormEl) {
    _webSearchFormEl.addEventListener('submit', _onWebSearchSubmit);
  }
  if (_filterInputEl) {
    _filterInputEl.addEventListener('input', _onFilterInput);
    _filterInputEl.addEventListener('keydown', _onFilterKeyDown);
  }
  if (_filterClearEl) {
    _filterClearEl.addEventListener('click', _onFilterClearClick);
  }
  if (_gridEl) {
    /* Row-level click/keydown delegated on the grid container for O(1)
       listener count regardless of item count. */
    _gridEl.addEventListener('click', _onGridClick);
    _gridEl.addEventListener('keydown', _onGridKeyDown);
  }
  /* AC11: keyboard shortcut — "/" at document level focuses the web-search
     input (common desktop convention; non-destructive). */
  document.addEventListener('keydown', _onDocumentKeyDown);
}

/* =========================================================================
   Web-search submit (AC5, §42.3 D-2b)
   ========================================================================= */

function _onWebSearchSubmit(event) {
  event.preventDefault();
  const raw = _webSearchInputEl ? _webSearchInputEl.value : '';
  const text = raw.trim();
  /* AC15: partial / empty input does NOT fire chrome.search.query. */
  if (text.length === 0) return;
  try {
    const p = chrome.search.query({ text, disposition: 'NEW_TAB' });
    if (p && typeof p.catch === 'function') p.catch(() => { /* swallow */ });
  } catch {
    /* search permission missing or engine unavailable — silent degrade. */
  }
}

/* =========================================================================
   Quick filter (AC7, AC14, AC15)
   ========================================================================= */

function _onFilterInput() {
  _filterQuery = _filterInputEl ? _filterInputEl.value : '';
  if (_filterClearEl) _filterClearEl.hidden = _filterQuery.length === 0;
  if (_filterTimer !== null) {
    clearTimeout(_filterTimer);
    _filterTimer = null;
  }
  _filterTimer = setTimeout(() => {
    _filterTimer = null;
    _applyFilter();
  }, FILTER_DEBOUNCE_MS);
}

function _onFilterKeyDown(event) {
  if (event.key === 'Escape') {
    /* §42.7.2: Escape clears the filter (matches sidepanel B-021). */
    event.preventDefault();
    _clearFilter();
  }
}

function _onFilterClearClick() {
  _clearFilter();
}

function _clearFilter() {
  _filterQuery = '';
  if (_filterInputEl) _filterInputEl.value = '';
  if (_filterClearEl) _filterClearEl.hidden = true;
  if (_filterTimer !== null) {
    clearTimeout(_filterTimer);
    _filterTimer = null;
  }
  _applyFilter();
  if (_filterInputEl) _filterInputEl.focus();
}

function _applyFilter() {
  if (!_index) return;
  const trimmed = _filterQuery.trim();
  const query = trimmed.toLowerCase();
  _hiddenRowIds = new Set();

  let visibleCount;
  if (query.length === 0) {
    /* No filter — show every row, strip highlights. */
    for (const [id, row] of _rowByItemId) {
      row.hidden = false;
      _rehighlightRow(row, id, '');
    }
    visibleCount = _rowByItemId.size;
  } else {
    const matches = search(_index, query);
    const matchIds = new Set(matches.map((entry) => entry.id));
    visibleCount = 0;
    for (const [id, row] of _rowByItemId) {
      if (matchIds.has(id)) {
        row.hidden = false;
        _rehighlightRow(row, id, query);
        visibleCount++;
      } else {
        row.hidden = true;
        _hiddenRowIds.add(id);
      }
    }
  }

  /* Hide group sections whose rows are all hidden (AC14).
     HIGH-2 R4 fix: iterate the pre-built section + per-section row arrays
     instead of two nested querySelectorAll walks. Complexity drops from
     O(groups × items) to O(items). */
  for (const [groupKey, section] of _groupSectionByGroupId) {
    const rows = _rowsByGroupId.get(groupKey) || [];
    let anyVisible = false;
    for (const row of rows) {
      if (!row.hidden) { anyVisible = true; break; }
    }
    section.hidden = !anyVisible;
  }

  /* Empty-state dispatch: zero matches under a non-empty query → filter-empty
     state (AC14). Zero-item collection is handled in _renderGrid. */
  if (visibleCount === 0 && query.length > 0 && _items.length > 0) {
    _renderFilterEmptyState(trimmed);
  } else {
    if (_emptyStateEl) _emptyStateEl.hidden = true;
  }
}

/* §42.6.2: rehighlight only the visible row whose text changed. Wipes prior
   <mark> fragments and rebuilds them from the raw item text. */
function _rehighlightRow(row, itemId, loweredQuery) {
  const item = _itemById(itemId);
  if (!item) return;
  const titleEl = row.querySelector('.newtab-item-title');
  const urlEl = row.querySelector('.newtab-item-url');
  if (titleEl) {
    while (titleEl.firstChild) titleEl.removeChild(titleEl.firstChild);
    titleEl.appendChild(buildHighlightedText(item.title || 'Untitled', loweredQuery));
  }
  if (urlEl) {
    while (urlEl.firstChild) urlEl.removeChild(urlEl.firstChild);
    urlEl.appendChild(buildHighlightedText(item.url || '', loweredQuery));
  }
}

/* =========================================================================
   Document-level keyboard shortcut
   ========================================================================= */

function _onDocumentKeyDown(event) {
  /* "/" focuses the web-search input (common desktop UX).
     UAT-5 (S29): the previous guard short-circuited whenever ANY <input>
     or <textarea> was focused — including the filter input, which is
     where the user actually wants the slash to bounce them OUT of. The
     guard is now narrower:
       - If the user is already in the web-search input, no-op (avoid
         re-focusing the same element + selecting on every keypress).
       - If the user is typing into a contentEditable surface (rare on
         this page; reserved for future plugin-style hosts), don't steal.
       - Otherwise (filter input, body focus, button focus, etc.), steal
         focus and select the existing query so a quick "/typing"
         overwrites cleanly. */
  if (event.key !== '/') return;
  const target = event.target;
  if (target && target instanceof HTMLElement) {
    if (target === _webSearchInputEl) return;
    if (target.isContentEditable) return;
  }
  if (_webSearchInputEl) {
    event.preventDefault();
    _webSearchInputEl.focus();
    _webSearchInputEl.select();
  }
}

/* =========================================================================
   Grid click + keyboard (row activation)
   ========================================================================= */

function _onGridClick(event) {
  /* B-124 §61.4: floating-row Save-CTA intercept — promote to bookmark.
     Mirror of the close-button intercept below; check FIRST because both
     buttons live inside the row <button>. */
  const saveTarget = event.target?.closest?.('[data-action="save-floating"]');
  if (saveTarget) {
    event.preventDefault();
    event.stopPropagation();
    const saveRow = saveTarget.closest('.newtab-item-row');
    const tabIdAttr = saveRow?.dataset?.tabId;
    const tabId = tabIdAttr ? Number(tabIdAttr) : NaN;
    if (Number.isFinite(tabId)) _promoteFloatingTab(tabId, saveRow);
    return;
  }

  /* B-121 R4 code-reviewer H-1: floating-row close-button intercept.
     A click on `[data-action="close-floating"]` (the X button on a
     synthetic row) dispatches MSG_CLOSE_TABS for the parent row's tabId
     and stops propagation so the tab-activation path does not also fire. */
  const closeTarget = event.target?.closest?.('[data-action="close-floating"]');
  if (closeTarget) {
    event.preventDefault();
    event.stopPropagation();
    const closeRow = closeTarget.closest('.newtab-item-row');
    const tabIdAttr = closeRow?.dataset?.tabId;
    const tabId = tabIdAttr ? Number(tabIdAttr) : NaN;
    if (Number.isFinite(tabId)) _closeFloatingTab(tabId);
    return;
  }

  const row = _resolveItemRow(event.target);
  if (!row) return;
  const itemId = row.dataset.itemId;
  if (itemId) {
    _activateItem(itemId);
    return;
  }
  /* B-121 R4 code-reviewer H-1: synthetic floating-tab rows carry only
     `data-tab-id` (no `data-item-id`). Activating one focuses the live
     tab — same UX as clicking an Open-Tabs row in the sidepanel. */
  const tabIdAttr = row.dataset.tabId;
  if (tabIdAttr) {
    const tabId = Number(tabIdAttr);
    if (Number.isFinite(tabId)) _activateFloatingTab(tabId);
  }
}

function _onGridKeyDown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = _resolveItemRow(event.target);
  if (!row) return;
  const itemId = row.dataset.itemId;
  if (itemId) {
    event.preventDefault();
    _activateItem(itemId);
    return;
  }
  /* B-121 R4 code-reviewer H-1: ENTER/SPACE on a floating row activates
     the live tab. Matches Open-Tabs row behavior for parity. */
  const tabIdAttr = row.dataset.tabId;
  if (tabIdAttr) {
    const tabId = Number(tabIdAttr);
    if (Number.isFinite(tabId)) {
      event.preventDefault();
      _activateFloatingTab(tabId);
    }
  }
}

function _resolveItemRow(target) {
  if (!target) return null;
  if (!(target instanceof Element)) return null;
  const row = target.closest ? target.closest('.newtab-item-row') : null;
  return row || null;
}

/**
 * Activate an item (click / Enter / Space on a row).
 *
 * §42.3 D-5 — C-11 critical path. Fire-and-forget BEFORE any awaits. The SW
 * handles the focus shift internally; the newtab does not need the response
 * to do any UI work. A failed dispatch is silently swallowed — user retries.
 */
function _activateItem(itemId) {
  try {
    const p = chrome.runtime.sendMessage({
      type: MSG_NAVIGATE_TO_ITEM,
      payload: { itemId },
    });
    if (p && typeof p.catch === 'function') {
      p.catch(() => { /* swallow — silent degrade per §42.5.1 (h). */ });
    }
  } catch {
    /* chrome.runtime.sendMessage synchronous throw — SW uninstalled mid-session,
       extension context invalidated. Silent degrade; user retries. */
  }
}

/**
 * B-121 R4 code-reviewer H-1: activate a floating tab from the newtab grid.
 *
 * The synthetic row carries only `data-tab-id` (no `data-item-id`), so we
 * use the tabId-only variant of MSG_NAVIGATE_TO_ITEM which performs a pure
 * tab focus (chrome.tabs.update + chrome.windows.update) without a storage
 * mutation. The SW handler also enriches the row with `windowId` because
 * the variant requires both. Fire-and-forget per the C-11 critical-path
 * pattern documented at the top of this file.
 */
function _activateFloatingTab(tabId) {
  /* Resolve windowId from the cached floating-member entry in _floatingMembers
     so we can pass the tabId-only navigate variant to the SW. The SW handler
     requires windowId alongside tabId — without it, the dispatch fails with
     ERR_VALIDATION (storage-handlers.js MSG_NAVIGATE_TO_ITEM). */
  let windowId = null;
  for (const arr of Object.values(_floatingMembers || {})) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (m && m.tabId === tabId) {
        windowId = typeof m.windowId === 'number' ? m.windowId : null;
        break;
      }
    }
    if (windowId !== null) break;
  }
  if (windowId === null) return;
  try {
    const p = chrome.runtime.sendMessage({
      type: MSG_NAVIGATE_TO_ITEM,
      payload: { tabId, windowId },
    });
    if (p && typeof p.catch === 'function') {
      p.catch(() => { /* silent degrade. */ });
    }
  } catch {
    /* SW uninstalled mid-session; silent degrade. */
  }
}

/**
 * B-121 R4 code-reviewer H-1: close a floating tab from the newtab grid.
 *
 * Closing a single tab is reversible (Ctrl+Shift+T reopens), so it does
 * NOT need the destructive-action confirmation modal that bookmark
 * deletion requires. This matches the sidepanel X-button-on-live-row
 * affordance (B-100) which closes without confirmation. Fire-and-forget
 * per the C-11 critical-path pattern; the broadcast-driven re-render
 * picks up the row removal from the SW's tabs.onRemoved handler.
 */
function _closeFloatingTab(tabId) {
  try {
    const p = chrome.runtime.sendMessage({
      type: MSG_CLOSE_TABS,
      payload: { tabIds: [tabId] },
    });
    if (p && typeof p.catch === 'function') {
      p.catch(() => { /* silent degrade. */ });
    }
  } catch {
    /* SW uninstalled mid-session; silent degrade. */
  }
}

/**
 * B-124 §61.4: promote a floating tab to a saved bookmark.
 *
 * Resolves the parent group from the floating-member descriptor cached in
 * `_floatingMembers` (keyed by groupId), then dispatches MSG_PROMOTE_TAB.
 * Per R2 §61.2.3 the newtab page does NOT have a toast surface; errors are
 * silently degraded (matching the existing fire-and-forget pattern of
 * `_activateItem` / `_closeFloatingTab`). The successful promote
 * broadcasts `SCOPE.ITEMS`, which triggers a refetch + re-render through
 * the existing broadcast listener — the floating row drops out and a
 * saved-bookmark row appears in its place.
 */
function _promoteFloatingTab(tabId, row) {
  /* Resolve the parent group's id from `_floatingMembers` so the promoted
     bookmark lands in the same group as its parent saved item. The
     descriptor's groupId is the `_floatingMembers` map key. Fallback to
     null (Ungrouped) on miss — defensive, narrow race.
     B-166 §71.3.1 cross-surface parity: also capture the descriptor's
     floatingTabId (storage identity, B-148 §3.7 propagated by
     buildFloatingMembers at floating-members.js:172-173) so the SW
     handler can splice-replace the `floating:<id>` slot in renderOrder
     with the new `item:<id>` slot instead of bottom-appending. The
     interleave benefit applies identically to newtab as to sidepanel
     (both consume `Group.renderOrder` via the shared resolver). Legacy
     floating-members without a floatingTabId leave the field undefined
     and the handler falls back to the append branch (AC2). */
  let groupId = null;
  let floatingTabId = null;
  for (const [gid, arr] of Object.entries(_floatingMembers || {})) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (m && m.tabId === tabId) {
        groupId = gid;
        if (typeof m.floatingTabId === 'string' && m.floatingTabId.length > 0) {
          floatingTabId = m.floatingTabId;
        }
        break;
      }
    }
    if (groupId !== null) break;
  }
  /* C-9 empty-state defense: if the resolved groupId no longer exists in
     `_groups`, fall back to null (Ungrouped). */
  if (groupId && !_groups.some((g) => g.id === groupId)) {
    groupId = null;
  }
  try {
    const payload = { tabId, groupId };
    if (floatingTabId) payload.replaceFloatingId = floatingTabId;
    const p = chrome.runtime.sendMessage({
      type: MSG_PROMOTE_TAB,
      payload,
    });
    if (p && typeof p.catch === 'function') {
      p.catch(() => { /* silent degrade — newtab has no toast surface. */ });
    }
  } catch {
    /* SW uninstalled mid-session; silent degrade. */
  }
  /* Reference `row` to avoid an unused-arg lint flag — kept in the
     signature so future expansion (e.g., visual feedback on click) does
     not need a signature change. */
  void row;
}

/* =========================================================================
   Broadcast listener (§42.3 D-7)
   ========================================================================= */

function _attachBroadcastListener() {
  if (_broadcastListenerAttached) return;
  if (!chrome?.runtime?.onMessage?.addListener) return;
  chrome.runtime.onMessage.addListener(_onBroadcast);
  _broadcastListenerAttached = true;
}

function _onBroadcast(msg, sender) {
  /* XSS / cross-extension posture: reject messages that did not originate
     from this extension's own runtime (B-022 H-2 precedent). */
  if (!sender || sender.id !== chrome.runtime.id) return;
  if (!msg || msg.type !== MSG_STATE_CHANGED) return;
  const scope = msg.payload?.scope;
  if (!scope) return;
  void _handleBroadcast(scope);
}

async function _handleBroadcast(scope) {
  /* HIGH-4 R4 fix: a single top-level try/catch around the entire
     broadcast-dispatch body. Sub-handlers keep their own error handling, but
     this catches anything that slips past them (unexpected error shapes,
     assertion throws in sub-handlers, etc.) so the listener never leaks an
     unhandled rejection back into the SW. */
  try {
    if (scope === SCOPE.ITEMS || scope === SCOPE.GROUPS) {
      await _refetchAndRender();
      return;
    }
    if (scope === SCOPE.LIVE_STATE) {
      await _refetchAndPatchLiveState();
      return;
    }
    /* SCOPE.PREFERENCES — B-092: re-fetch prefs and re-apply the dense
       layout body class so a toggle from the Settings tab propagates to the
       newtab without a page reload. Prior B-038/B-039/B-040 prefs do not
       affect newtab rendering (B-038 display-mode is popup-only, B-039 was
       dropped at S29 close, B-040 auto-collapse is sidepanel-only).
       SCOPE.WINDOW_MAP — ignored in v1 (no window badges on newtab per §42.9
       follow-up #1). */
    if (scope === SCOPE.PREFERENCES) {
      try {
        const prefs = await _sendMessage({ type: MSG_GET_PREFERENCES, payload: {} });
        _applyDenseLayout(prefs);
        /* B-037: re-apply theme on every prefs broadcast so a theme change
           from any other surface propagates here without a page reload. */
        if (prefs && typeof prefs.theme === 'string') _applyTheme(prefs.theme);
      } catch {
        /* Best-effort; a failed prefs re-read leaves the body class at its
           current value. The next successful broadcast or boot resyncs it. */
      }
      return;
    }
  } catch (err) {
    console.warn('[B-036] broadcast handler failed:', err);
  }
}

async function _refetchAndRender() {
  /* MEDIUM-5 R4 fix: prevent overlapping broadcast-driven refetch cycles
     from clobbering _rowByItemId / _groupSectionByGroupId mid-population.
     A second broadcast arriving mid-fetch is coalesced — the current cycle
     picks up the latest SW state on the final _renderGrid call. */
  if (_refetchInFlight) return;
  _refetchInFlight = true;
  try {
    let itemsResp;
    let groupsResp;
    try {
      [itemsResp, groupsResp] = await Promise.all([
        _sendMessage({ type: MSG_LIST_ITEMS, payload: {} }),
        _sendMessage({ type: MSG_LIST_GROUPS, payload: {} }),
      ]);
    } catch {
      /* Transient SW error — leave current render in place. A subsequent
         broadcast will retry. */
      return;
    }
    _setItems(Array.isArray(itemsResp?.items) ? itemsResp.items : []);
    _liveStates = itemsResp && typeof itemsResp.liveStates === 'object' && itemsResp.liveStates
      ? itemsResp.liveStates
      : {};
    _driftRecords = itemsResp && typeof itemsResp.driftRecords === 'object' && itemsResp.driftRecords
      ? itemsResp.driftRecords
      : {};
    _floatingMembers = itemsResp && typeof itemsResp.floatingMembers === 'object'
        && !Array.isArray(itemsResp.floatingMembers) && itemsResp.floatingMembers
      ? itemsResp.floatingMembers
      : {};
    _groups = Array.isArray(groupsResp) ? groupsResp : [];

    /* §34.7: diffAndPatch keeps the index in lockstep without a rebuild when
       the change is small. The full render strategy is full-rebuild-on-every-
       broadcast per §42.3 D-7 (simpler contract; rebuild cost is bounded by
       _renderGrid's perf budget). */
    if (_index) {
      const delta = diffAndPatch(_index, _items);
      _index = delta.index;
    } else {
      _index = buildIndex(_items);
    }

    _renderGrid();
    _applyFilter();
  } finally {
    _refetchInFlight = false;
  }
}

async function _refetchAndPatchLiveState() {
  let itemsResp;
  try {
    itemsResp = await _sendMessage({ type: MSG_LIST_ITEMS, payload: {} });
  } catch {
    return;
  }
  const nextLive = itemsResp && typeof itemsResp.liveStates === 'object' && itemsResp.liveStates
    ? itemsResp.liveStates
    : {};
  const nextDrift = itemsResp && typeof itemsResp.driftRecords === 'object' && itemsResp.driftRecords
    ? itemsResp.driftRecords
    : {};
  const nextFloating = itemsResp && typeof itemsResp.floatingMembers === 'object'
      && !Array.isArray(itemsResp.floatingMembers) && itemsResp.floatingMembers
    ? itemsResp.floatingMembers
    : {};
  _liveStates = nextLive;
  _driftRecords = nextDrift;

  /* B-121 §60.6.2(e): if the floating-member set changed (parent gained or
     lost a synthetic-row child, or a member's URL/title changed), fall back
     to a full grid rebuild — the newtab DOM is small enough that this is
     cheaper than per-row diffing inside group sections. JSON.stringify on
     a typically-empty map is sub-millisecond. */
  const floatingChanged = JSON.stringify(_floatingMembers) !== JSON.stringify(nextFloating);
  _floatingMembers = nextFloating;
  if (floatingChanged) {
    _renderGrid();
    _applyFilter();
    return;
  }

  /* Patch per-row indicator classes without rebuilding the grid. */
  for (const [id, row] of _rowByItemId) {
    _applyRowLiveState(row, id);
  }
}

/* =========================================================================
   Render — skeleton, grid, empty states
   ========================================================================= */

function _renderSkeleton() {
  if (!_gridEl) return;
  _clearChildren(_gridEl);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < SKELETON_GROUP_COUNT; i++) {
    const section = document.createElement('div');
    section.className = 'newtab-skeleton-group';
    section.setAttribute('aria-hidden', 'true');
    const header = document.createElement('div');
    header.className = 'newtab-skeleton-header';
    section.appendChild(header);
    for (let r = 0; r < SKELETON_ROW_COUNT; r++) {
      const row = document.createElement('div');
      row.className = 'newtab-skeleton-row';
      section.appendChild(row);
    }
    frag.appendChild(section);
  }
  _gridEl.appendChild(frag);
  if (_emptyStateEl) _emptyStateEl.hidden = true;
  if (_errorStateEl) _errorStateEl.hidden = true;
}

function _renderGrid() {
  if (!_gridEl) return;
  _clearChildren(_gridEl);
  /* HIGH-2 / MEDIUM-5 R4 fix: clear all render-indexed maps at the top of
     every render pass so _buildGroupSection repopulates them from scratch. */
  _rowByItemId = new Map();
  _groupSectionByGroupId = new Map();
  _rowsByGroupId = new Map();

  /* B-121 §60.6.2: count of synthetic floating-tab rows across all groups.
     A page with zero saved items but ≥1 floating member should NOT show the
     zero-state — render the group(s) with their synthetic rows instead. */
  let floatingTotal = 0;
  for (const arr of Object.values(_floatingMembers || {})) {
    if (Array.isArray(arr)) floatingTotal += arr.length;
  }

  if (_items.length === 0 && floatingTotal === 0) {
    _renderZeroItemsEmptyState();
    return;
  }

  /* §42.5.1 (b) / B-196 §79.2.4: ungrouped items render inside the top-level
     catch-all head section (labelled "Top Level"). Group order = stored sort.
     UAT-2 (S29): preserve parent→child hierarchy. The previous flat order
     (real groups by sortOrder, ungrouped last) put sub-groups at top-level
     because parentId was ignored. Mirror sidepanel's pattern (sidepanel.js
     §"render root groups + nested children"): render each parent, then its
     children visually indented immediately after. */
  const groupedItems = _groupItemsByGroupId(_items);
  const orderedGroupIds = _orderedGroupIds(_groups, groupedItems);

  const frag = document.createDocumentFragment();
  for (const entry of orderedGroupIds) {
    const groupId = entry.id;
    const groupItems = groupedItems.get(groupId) || [];
    /* B-121: render the section if it has saved items OR floating members. */
    const floatingForGroup = (_floatingMembers && Array.isArray(_floatingMembers[groupId]))
      ? _floatingMembers[groupId]
      : [];
    if (groupItems.length === 0 && floatingForGroup.length === 0) continue;
    const group = groupId === UNGROUPED_KEY ? null : _groupById(groupId);
    const section = _buildGroupSection(group, groupId, groupItems, entry.isChild);
    frag.appendChild(section);
  }

  _gridEl.appendChild(frag);
  if (_emptyStateEl) _emptyStateEl.hidden = true;
  if (_errorStateEl) _errorStateEl.hidden = true;
}

function _groupItemsByGroupId(items) {
  /* Bucket items by groupId. Orphans (items whose groupId is not present in
     the current _groups array) fall through to the implicit "Ungrouped"
     bucket so they remain visible — matches §42.5.1 (b) "Zero groups, items
     exist" handling. */
  const knownGroupIds = new Set(_groups.map((g) => (g && g.id != null ? String(g.id) : null)).filter(Boolean));
  const out = new Map();
  for (const item of items) {
    const rawKey = item.groupId == null ? UNGROUPED_KEY : String(item.groupId);
    const key = (rawKey === UNGROUPED_KEY || knownGroupIds.has(rawKey))
      ? rawKey
      : UNGROUPED_KEY;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  /* Sort within each bucket by sortOrder ascending, ties by id for
     determinism. Matches sidepanel ordering semantics. */
  for (const bucket of out.values()) {
    bucket.sort((a, b) => {
      const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
      const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
  }
  return out;
}

function _orderedGroupIds(groups, groupedItems) {
  /* UAT-2 (S29): render parents first, then immediately after each parent
     render its children in stored sortOrder. Mirrors sidepanel.js §
     "Separate root groups and sub-groups" — child groups should never
     appear at top level, and they should sit immediately after their
     parent so the visual hierarchy reads top-down.

     Returns an array of `{ id, isChild }` entries so _renderGrid can
     style child sections with the indent class. Empty groups are
     filtered out (only groups with items render). */
  /* UAT-2 (S29 close): the sort comparator MUST mirror sidepanel.js exactly
     — `(a.sortOrder ?? 0) - (b.sortOrder ?? 0)` with NO secondary tiebreaker.
     A previous draft included a `localeCompare(name)` tiebreaker which made
     the newtab order ties alphabetically while the sidepanel preserved
     insertion order, swapping TWERK and PERSONAL in user UAT. Keep this
     comparator byte-for-byte aligned with sidepanel.js:2899. */
  const sorted = [...groups]
    .filter((g) => g && g.id)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  /* Bucket children by parentId. Only depth-1 nesting is supported in v1
     (matches sidepanel B-007 depth cap). Any deeper nesting flattens to
     depth-1 children of the nearest known parent — defensive. */
  const childrenByParent = new Map();
  const roots = [];
  const knownIds = new Set(sorted.map((g) => String(g.id)));
  for (const g of sorted) {
    const pid = g.parentId != null ? String(g.parentId) : null;
    if (pid && knownIds.has(pid)) {
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(g);
    } else {
      roots.push(g);
    }
  }

  /* B-121 §60.6.2: a group qualifies for render iff it has saved items OR
     floating-tab synthetic-row members. */
  const hasContent = (gid) => {
    if (groupedItems.has(gid)) return true;
    if (_floatingMembers && Array.isArray(_floatingMembers[gid]) && _floatingMembers[gid].length > 0) {
      return true;
    }
    return false;
  };

  const out = [];
  for (const root of roots) {
    const rootId = String(root.id);
    if (hasContent(rootId)) {
      out.push({ id: rootId, isChild: false });
    }
    const kids = childrenByParent.get(rootId) || [];
    for (const child of kids) {
      const cid = String(child.id);
      if (hasContent(cid)) {
        out.push({ id: cid, isChild: true });
      }
    }
  }
  if (groupedItems.has(UNGROUPED_KEY)) out.push({ id: UNGROUPED_KEY, isChild: false });
  return out;
}

function _groupById(groupId) {
  for (const g of _groups) {
    if (String(g.id) === String(groupId)) return g;
  }
  return null;
}

function _buildGroupSection(group, groupKey, items, isChild = false) {
  const section = document.createElement('section');
  /* UAT-2 (S29): mark child sections so CSS can indent them under their
     parent (mirrors sidepanel `.group-section--child` + --group-indent). */
  section.className = isChild ? 'newtab-group newtab-group--child' : 'newtab-group';
  const headerId = `newtab-group-header-${_escapeForId(groupKey)}`;
  section.setAttribute('aria-labelledby', headerId);
  /* B-121 §60.5.4 parity: surface the groupId so the runtime patch path
     can target this section by selector. */
  section.dataset.groupId = String(groupKey);

  const header = document.createElement('h2');
  header.className = 'newtab-group-header';
  header.id = headerId;
  /* B-104 §47.3 D-5: inline `--group-header-color` resolves the header's
     `color-mix` tint via the per-theme `--gc-<slot>` cascade. The Ungrouped
     section has no group record → no inline property → header stays untinted
     via the `transparent` fallback in the recipe. */
  if (group && GROUP_COLORS.includes(group.color)) {
    header.style.setProperty('--group-header-color', `var(--gc-${group.color})`);
  }

  /* B-121: surface synthetic rows below the saved-item rows. Pulled from
     the module-level cache for the current groupId. B-196 §79.2.4: the
     top-level head (`groupKey === '__toplevel__'`) reads the `'__toplevel__'`
     floating bucket — empty until B-197 lands, then populated with top-level
     floating members (head-only; newtab has no loose tail). */
  const floatingForGroup = (groupKey && _floatingMembers && Array.isArray(_floatingMembers[groupKey]))
    ? _floatingMembers[groupKey]
    : [];

  const nameSpan = document.createElement('span');
  nameSpan.className = 'newtab-group-name';
  nameSpan.textContent = group ? (group.name || 'Untitled group') : 'Top Level';
  header.appendChild(nameSpan);

  const countSpan = document.createElement('span');
  countSpan.className = 'newtab-group-count';
  const totalCount = items.length + floatingForGroup.length;
  countSpan.textContent = String(totalCount);
  /* MEDIUM QA-3 R4 fix: screen readers announce "Work, 5 items" instead of
     "Work, 5" — the visible badge stays compact while SR users get the unit. */
  countSpan.setAttribute('aria-label', `${totalCount} items`);
  header.appendChild(countSpan);

  section.appendChild(header);

  const list = document.createElement('div');
  list.className = 'newtab-group-items';
  list.setAttribute('role', 'list');

  /* HIGH-2 R4 fix: track the rows that belong to this section so _applyFilter
     can decide group visibility without a DOM walk. */
  const groupRows = [];
  const loweredQuery = _filterQuery.trim().toLowerCase();
  /* B-148 §3.7 (S44, v6→v7) — single iteration over the resolver-produced
     row sequence. Group.renderOrder is the user-defined interleaved order;
     missing/empty falls back to saved-then-floating bootstrap. Stale refs
     filtered silently by the resolver. The Ungrouped section passes
     `group === null/undefined` → the resolver hits its bootstrap path
     which only references items + floating. */
  /* B-196 fix-round F-1 (code M-2 / qa M-1): the top-level head is not a
     persisted group record (`group === null`), so passing it straight to
     resolveRenderOrder would hit the bootstrap fallback (saved-then-floating),
     NOT the interleaved order. Build the SAME synthetic `__toplevel__` owner
     the sidepanel uses — a runtime-derived `renderOrder` off the head items +
     floating members (shared deriveTopLevelRenderOrder) — so a top-level
     floating member lands directly below its parent (B-197 AC13). Named groups
     keep their persisted `group`. Behavior-preserving today: the head floating
     bucket is empty pre-B-197, so the derived order is exactly the head items
     by sortOrder — byte-for-byte the prior Ungrouped ordering. */
  const renderOwner = (groupKey === UNGROUPED_KEY)
    ? { id: UNGROUPED_KEY, renderOrder: deriveTopLevelRenderOrder(items, floatingForGroup) }
    : group;
  const renderRows = resolveRenderOrder(renderOwner, items, floatingForGroup);
  for (const row of renderRows) {
    if (row.kind === 'item') {
      const rowEl = _buildItemRow(row.item, loweredQuery);
      list.appendChild(rowEl);
      _rowByItemId.set(row.item.id, rowEl);
      groupRows.push(rowEl);
    } else if (row.kind === 'floating') {
      const rowEl = _buildFloatingTabRow(row.floatingMember);
      list.appendChild(rowEl);
      groupRows.push(rowEl);
    }
  }

  section.appendChild(list);
  _groupSectionByGroupId.set(groupKey, section);
  _rowsByGroupId.set(groupKey, groupRows);
  return section;
}

/**
 * B-121 §60.6.2(c): build a synthetic floating-tab row for the newtab grid.
 *
 * Mirrors `_buildItemRow` for visual parity (favicon, text block, indicator
 * dots) but identifies the row via `data-tab-id` + `data-floating="true"`
 * instead of `data-item-id`. Tab title and URL are untrusted —
 * `buildHighlightedText` performs textContent-only insertion at the
 * fragment level, preserving the existing XSS posture of the newtab page.
 */
function _buildFloatingTabRow(member) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'newtab-item-row';
  row.dataset.tabId = String(member.tabId);
  row.dataset.floating = 'true';
  if (typeof member.parentItemId === 'string' && member.parentItemId.length > 0) {
    row.dataset.parentItemId = member.parentItemId;
  }
  row.dataset.live = 'true';
  if (member.active) row.dataset.active = 'true';
  if (member.audible) row.dataset.audible = 'true';

  /* B-130 hotfix: the previous `.newtab-floating-bar` left-side dotted
     element has been removed. Newtab rows have no inherited left-side
     border indicator (sidepanel does), so newtab signals live / active /
     drifted state via the right-side `.newtab-indicator-*` dots. The
     floating-tab visual cue on newtab is the right-side
     `.newtab-indicator-live` dot + the hover-reveal Save CTA + the
     "floating tab —" aria-label prefix. */

  /* Favicon (or letter-avatar fallback). */
  const favIconUrl = isSafeFaviconUrl(member.favIconUrl) ? member.favIconUrl : null;
  if (favIconUrl) {
    const img = document.createElement('img');
    img.className = 'newtab-item-favicon';
    img.alt = '';
    img.src = favIconUrl;
    img.addEventListener('error', () => {
      const avatar = _buildAvatar({ title: member.title || member.url || '?' });
      img.replaceWith(avatar);
    });
    row.appendChild(img);
  } else {
    row.appendChild(_buildAvatar({ title: member.title || member.url || '?' }));
  }

  const textBlock = document.createElement('span');
  textBlock.className = 'newtab-item-text';
  const titleEl = document.createElement('span');
  titleEl.className = 'newtab-item-title';
  /* No filter highlighting on synthetic rows (the filter index covers
     saved items only — B-121 keeps that invariant). textContent-only. */
  titleEl.textContent = member.title || member.url || 'Untitled tab';
  const urlEl = document.createElement('span');
  urlEl.className = 'newtab-item-url';
  urlEl.textContent = member.url || '';
  textBlock.appendChild(titleEl);
  textBlock.appendChild(urlEl);
  row.appendChild(textBlock);

  /* Indicator dots: live (always) + active + audible. */
  const wrap = document.createElement('span');
  wrap.className = 'newtab-item-indicators';
  if (member.active) {
    const dot = document.createElement('span');
    dot.className = 'newtab-indicator-dot newtab-indicator-active';
    dot.setAttribute('aria-hidden', 'true');
    wrap.appendChild(dot);
  } else {
    const dot = document.createElement('span');
    dot.className = 'newtab-indicator-dot newtab-indicator-live';
    dot.setAttribute('aria-hidden', 'true');
    wrap.appendChild(dot);
  }
  if (member.audible) {
    const audible = document.createElement('span');
    audible.className = 'newtab-indicator-audible';
    audible.setAttribute('aria-label', 'Playing audio');
    audible.textContent = '♪';
    wrap.appendChild(audible);
  }
  row.appendChild(wrap);

  /* B-124 §61.3.3: Save-as-bookmark CTA on hover/focus-within. The button
     is a real <button> nested inside the row <button>; modern browsers
     permit interactive descendants for keyboard reach. `_onGridClick`
     intercepts the `data-action="save-floating"` selector and dispatches
     MSG_PROMOTE_TAB, stopping propagation so the row's tab-activate path
     does not also fire. */
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'newtab-floating-save';
  saveBtn.dataset.action = 'save-floating';
  /* B-124 R4 fix-round (qa L-1 / code L-2 / security L-1): cross-surface
     parity with sidepanel — the Save CTA carries the constant
     `aria-label="Save as bookmark"`. The row-level aria-label below
     already names the floating tab so screen readers context-link the
     CTA to the row. */
  saveBtn.setAttribute('aria-label', 'Save as bookmark');
  saveBtn.title = 'Save as bookmark';
  saveBtn.textContent = '+';
  row.appendChild(saveBtn);

  /* B-121 R4 code-reviewer H-1: explicit close affordance on every
     floating row, matching AC6 (parity with sidepanel X-button on
     live rows). The button is a real <button> nested inside the row
     <button> — modern browsers permit this for keyboard-reachable
     interactive descendants; we additionally stop propagation in
     `_onGridClick` so the parent row's activate path does not also
     fire when the close button is clicked. */
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'newtab-floating-close';
  closeBtn.dataset.action = 'close-floating';
  closeBtn.setAttribute('aria-label', `Close tab: ${member.title || member.url || 'Untitled tab'}`);
  closeBtn.textContent = '×';
  row.appendChild(closeBtn);

  /* B-124 §61.8: aria-label uses "floating tab —" prefix so screen readers
     distinguish ephemeral floating rows from saved-bookmark live rows.
     Suffix order mirrors the sidepanel floating-row contract:
     active → audible. The "currently open" wording (used by the
     pre-B-124 newtab label) is dropped because the new "floating tab"
     prefix carries the live-state semantics. B-124 R4 fix-round
     (code-reviewer L-2): URL interpolation removed for cross-surface
     parity with sidepanel — both surfaces now produce the title-only
     `"floating tab — <title>, <suffixes>"` form prescribed by R2 §61.8. */
  const titleText = member.title || member.url || 'Untitled tab';
  const parts = [`floating tab — ${titleText}`];
  if (member.active) parts.push('active tab');
  if (member.audible) parts.push('playing audio');
  row.setAttribute('aria-label', parts.join(', '));

  return row;
}

function _buildItemRow(item, loweredQuery) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'newtab-item-row';
  /* MEDIUM QA-2 R4 fix: do NOT set role="listitem" on the <button>. The
     parent div already has role="list" and ARIA 1.2 permits interactive
     children (buttons) inside lists — assistive tech announces the button
     as a button, which is correct. Forcing role="listitem" here overrode
     the implicit button semantics, causing SR users to hear "list item"
     without the button affordance. */
  row.dataset.itemId = item.id;

  /* UAT-3 (S29): set live-state dataset flags inline here. Do NOT call
     _applyRowLiveState() during initial build — that helper rebuilds the
     indicator wrap, and we still need to append the favicon + text BEFORE
     the indicator wrap so the row reads left-to-right (favicon, text,
     indicators). The previous code path called _applyRowLiveState first
     AND then appended a second indicator wrap below, producing duplicate
     dots ("two green circles" UAT-3 finding). */
  const _liveInit = _liveStates[item.id];
  const _driftedInit = !!_driftRecords[item.id];
  if (_liveInit && _liveInit.live) row.dataset.live = 'true';
  if (_liveInit && _liveInit.active) row.dataset.active = 'true';
  if (_liveInit && _liveInit.audible) row.dataset.audible = 'true';
  if (_driftedInit) row.dataset.drifted = 'true';

  /* Favicon + fallback. */
  const live = _liveStates[item.id];
  const favIconUrl = live && isSafeFaviconUrl(live.favIconUrl)
    ? live.favIconUrl
    : (isSafeFaviconUrl(item.favIconUrl) ? item.favIconUrl : null);
  if (favIconUrl) {
    const img = document.createElement('img');
    img.className = 'newtab-item-favicon';
    img.alt = '';
    img.src = favIconUrl;
    img.addEventListener('error', () => {
      /* Drop broken favicon in favour of the letter-avatar fallback. */
      const avatar = _buildAvatar(item);
      img.replaceWith(avatar);
    });
    row.appendChild(img);
  } else {
    row.appendChild(_buildAvatar(item));
  }

  /* Text block. */
  const textBlock = document.createElement('span');
  textBlock.className = 'newtab-item-text';
  const titleEl = document.createElement('span');
  titleEl.className = 'newtab-item-title';
  titleEl.appendChild(buildHighlightedText(item.title || 'Untitled', loweredQuery));
  const urlEl = document.createElement('span');
  urlEl.className = 'newtab-item-url';
  urlEl.appendChild(buildHighlightedText(item.url || '', loweredQuery));
  textBlock.appendChild(titleEl);
  textBlock.appendChild(urlEl);
  row.appendChild(textBlock);

  /* Indicators — only appended when non-default live state applies. */
  const indicators = _buildIndicators(item.id);
  if (indicators) row.appendChild(indicators);

  /* §42.7.3: aria-label carries state (live / active / drifted) so screen
     readers announce the semantic distinction even without the color dots. */
  row.setAttribute('aria-label', _buildRowAriaLabel(item));

  return row;
}

function _buildAvatar(item) {
  const avatar = document.createElement('span');
  avatar.className = 'newtab-item-avatar';
  const letter = (item.title || item.url || '?').trim().charAt(0).toUpperCase();
  avatar.textContent = letter || '?';
  return avatar;
}

function _buildIndicators(itemId) {
  const live = _liveStates[itemId];
  const drifted = !!_driftRecords[itemId];
  const hasLive = !!(live && live.live);
  const hasActive = !!(live && live.active);
  const hasAudible = !!(live && live.audible);
  if (!hasLive && !hasActive && !hasAudible && !drifted) return null;

  const wrap = document.createElement('span');
  wrap.className = 'newtab-item-indicators';

  if (hasActive) {
    const dot = document.createElement('span');
    dot.className = 'newtab-indicator-dot newtab-indicator-active';
    dot.setAttribute('aria-hidden', 'true');
    wrap.appendChild(dot);
  } else if (hasLive) {
    const dot = document.createElement('span');
    dot.className = 'newtab-indicator-dot newtab-indicator-live';
    dot.setAttribute('aria-hidden', 'true');
    wrap.appendChild(dot);
  }
  if (hasAudible) {
    const audible = document.createElement('span');
    audible.className = 'newtab-indicator-audible';
    audible.setAttribute('aria-label', 'Playing audio');
    audible.textContent = '♪';
    wrap.appendChild(audible);
  }
  if (drifted) {
    const dot = document.createElement('span');
    dot.className = 'newtab-indicator-dot newtab-indicator-drifted';
    dot.setAttribute('aria-label', 'Tab has navigated away from its saved URL');
    /* B-099 §46.3 D-7 — additive `title` tooltip showing the drifted-to
       hostname. Hostname-only per Q3 (less PII leak than the full URL
       with path/query). The aria-label above remains the AT carrier; the
       title is purely a sighted-user affordance. */
    const driftedToUrl = _driftRecords[itemId]?.driftedToUrl;
    if (typeof driftedToUrl === 'string' && driftedToUrl.length > 0) {
      let hostname = '';
      try {
        hostname = new URL(driftedToUrl).hostname;
      } catch {
        /* Fall through — fallback tooltip below. */
      }
      dot.title = hostname ? `Drifted to: ${hostname}` : 'Drifted to a different URL';
    }
    wrap.appendChild(dot);
  }
  return wrap;
}

function _applyRowLiveState(row, itemId) {
  const live = _liveStates[itemId];
  const drifted = !!_driftRecords[itemId];
  if (live && live.live) row.dataset.live = 'true'; else delete row.dataset.live;
  if (live && live.active) row.dataset.active = 'true'; else delete row.dataset.active;
  if (live && live.audible) row.dataset.audible = 'true'; else delete row.dataset.audible;
  if (drifted) row.dataset.drifted = 'true'; else delete row.dataset.drifted;

  /* Rebuild indicators in place (cheap — bounded by per-row indicator count).
     Only runs on live-state broadcasts. */
  const existing = row.querySelector('.newtab-item-indicators');
  if (existing) existing.remove();
  const fresh = _buildIndicators(itemId);
  if (fresh) row.appendChild(fresh);

  /* Re-compute aria-label so screen readers track state changes. */
  const item = _itemById(itemId);
  if (item) row.setAttribute('aria-label', _buildRowAriaLabel(item));
}

function _buildRowAriaLabel(item) {
  const live = _liveStates[item.id];
  const drifted = !!_driftRecords[item.id];
  const parts = [item.title || 'Untitled', item.url || ''];
  const states = [];
  if (live && live.active) states.push('active tab');
  else if (live && live.live) states.push('currently open');
  if (live && live.audible) states.push('playing audio');
  if (drifted) states.push('drifted from saved URL');
  const base = parts.filter((s) => s.length > 0).join(' — ');
  return states.length === 0 ? base : `${base} (${states.join(', ')})`;
}

function _itemById(itemId) {
  /* HIGH-1 R4 fix: Map-backed O(1) lookup, populated alongside _items via
     _setItems(). Was O(n) linear scan — the live-state-broadcast loop that
     called this for every row turned the overall patch into O(n²). */
  return _itemMap.get(itemId) || null;
}

/* Keep _items and _itemMap in lockstep — every assignment to _items MUST go
   through this helper so _itemById stays O(1) correct after boot load and
   every broadcast-driven refetch. */
function _setItems(items) {
  _items = items;
  _itemMap = new Map();
  for (const it of items) {
    if (it && it.id != null) _itemMap.set(it.id, it);
  }
}

/* =========================================================================
   Empty / error state rendering
   ========================================================================= */

function _renderZeroItemsEmptyState() {
  if (!_emptyStateEl) return;
  _clearChildren(_emptyStateEl);
  const icon = document.createElement('div');
  icon.className = 'newtab-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📑';
  const title = document.createElement('div');
  title.className = 'newtab-empty-title';
  title.textContent = 'No bookmarks yet';
  const message = document.createElement('div');
  message.className = 'newtab-empty-message';
  message.textContent = 'Open the side panel to add your first bookmark.';
  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'newtab-empty-cta';
  cta.textContent = 'Open side panel';
  cta.addEventListener('click', _openSidepanel);
  _emptyStateEl.appendChild(icon);
  _emptyStateEl.appendChild(title);
  _emptyStateEl.appendChild(message);
  _emptyStateEl.appendChild(cta);
  _emptyStateEl.hidden = false;
}

function _renderFilterEmptyState(query) {
  if (!_emptyStateEl) return;
  _clearChildren(_emptyStateEl);
  const icon = document.createElement('div');
  icon.className = 'newtab-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔍';
  const title = document.createElement('div');
  title.className = 'newtab-empty-title';
  title.textContent = `No matches for “${query}”`;
  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'newtab-empty-cta';
  cta.textContent = 'Clear filter';
  cta.addEventListener('click', () => _clearFilter());
  _emptyStateEl.appendChild(icon);
  _emptyStateEl.appendChild(title);
  _emptyStateEl.appendChild(cta);
  _emptyStateEl.hidden = false;
}

function _renderErrorState(err) {
  /* HIGH-3 R4 fix: surface the caught error via console.warn for dev
     diagnostics (§42.5.1 (g)). The user-visible UI is unchanged — the warn
     is a one-line breadcrumb so an engineer inspecting the new-tab console
     can see *why* the bootstrap failed without having to reproduce the
     failure under a debugger. */
  if (err !== undefined) {
    console.warn('[B-036] bootstrap failed:', err);
  }
  if (!_gridEl) return;
  _clearChildren(_gridEl);
  _rowByItemId = new Map();
  _groupSectionByGroupId = new Map();
  _rowsByGroupId = new Map();
  if (_emptyStateEl) _emptyStateEl.hidden = true;
  if (!_errorStateEl) return;
  _clearChildren(_errorStateEl);
  const icon = document.createElement('div');
  icon.className = 'newtab-error-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⚠️';
  const title = document.createElement('div');
  title.className = 'newtab-error-title';
  title.textContent = 'Something went wrong';
  const msg = document.createElement('div');
  msg.className = 'newtab-error-message';
  msg.textContent = 'Try reloading this tab.';
  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'newtab-error-cta';
  cta.textContent = 'Reload';
  cta.addEventListener('click', () => {
    try { window.location.reload(); } catch { /* noop */ }
  });
  _errorStateEl.appendChild(icon);
  _errorStateEl.appendChild(title);
  _errorStateEl.appendChild(msg);
  _errorStateEl.appendChild(cta);
  _errorStateEl.hidden = false;
}

async function _openSidepanel() {
  /* §42.5.1 (a): CTA opens the sidepanel via the popup-precedent pattern. */
  try {
    const currentWindow = await chrome.windows.getCurrent({ populate: false });
    await chrome.sidePanel.open({ windowId: currentWindow.id });
  } catch {
    /* sidePanel.open can fail if called outside a user gesture; CTA click
       IS a user gesture, so this branch is a rare defensive fallback. */
  }
}

/* =========================================================================
   Helpers
   ========================================================================= */

function _clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function _escapeForId(s) {
  /* Group ids are ULIDs or the literal UNGROUPED_KEY; CSS-safe characters
     only, but normalise defensively in case of future id shapes. */
  return String(s).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function _sendMessage(message) {
  return new Promise((resolve, reject) => {
    let done = false;
    try {
      const maybePromise = chrome.runtime.sendMessage(message, (response) => {
        if (done) return;
        done = true;
        const err = chrome.runtime && chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || 'sendMessage failed'));
          return;
        }
        _resolveResponse(response, resolve, reject);
      });
      /* Some test harnesses (chrome-mock) return a Promise rather than using
         the callback form. Handle both so the newtab works under both
         runtimes. */
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then((response) => {
          if (done) return;
          done = true;
          _resolveResponse(response, resolve, reject);
        }, (e) => {
          if (done) return;
          done = true;
          reject(e);
        });
      }
    } catch (e) {
      if (!done) { done = true; reject(e); }
    }
  });
}

function _resolveResponse(response, resolve, reject) {
  if (response && response.ok === false) {
    const err = new Error(response.error?.message || 'Request failed');
    if (response.error?.code) err.code = response.error.code;
    reject(err);
    return;
  }
  if (response && Object.prototype.hasOwnProperty.call(response, 'data')) {
    resolve(response.data);
    return;
  }
  /* Handlers that return the raw payload without the {ok,data} envelope
     (e.g. MSG_LIST_GROUPS) — pass through verbatim. */
  resolve(response);
}

/* =========================================================================
   Test hooks (no-op in production — used by tests/b036-newtab.test.js)
   ========================================================================= */

/* Internal module-scope accessors are NOT exported. Tests exercise the
   module via its public side-effects (DOM mutation + chrome.* spies)
   rather than by reaching into state. Keep it that way. */
