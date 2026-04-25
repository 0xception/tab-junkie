import {
  MSG_LIST_ITEMS,
  MSG_LIST_GROUPS,
  MSG_GET_PREFERENCES,
  MSG_SET_PREFERENCES,
  MSG_CREATE_GROUP,
  MSG_UPDATE_GROUP,
  MSG_DELETE_GROUP,
  MSG_NAVIGATE_TO_ITEM,
  MSG_STATE_CHANGED,
  MSG_CREATE_ITEM,
  MSG_UPDATE_ITEM,
  MSG_DELETE_ITEM,
  MSG_DEMOTE_ITEM,
  MSG_GET_ITEM,
  MSG_CLOSE_TABS,
  MSG_BULK_DELETE_ITEMS,
  MSG_BULK_UPDATE_ITEMS,
  MSG_BULK_REORDER_ITEMS,
  MSG_BULK_REORDER_GROUPS,
  MSG_PROMOTE_TAB,
  /* B-093: MSG_EXPORT_COLLECTION + MSG_IMPORT_COLLECTION moved to
     settings/settings-import-export.js along with the import/export UI. */
} from '../shared/messages.js';

import {
  ERR_NOT_FOUND,
  ERR_VALIDATION,
  ERR_SAFE_MODE,
  ERR_DUPLICATE_URL,
} from '../shared/errors.js';

import { GROUP_COLORS } from '../shared/constants.js';

import { pruneSelection } from '../shared/selection.js';

/* B-059: client-side duplicate-URL pre-check primitive. Shared with drift,
   claims, and floating-group reassociation — the same normalization policy
   everywhere. */
import { safeNormalizeForMatch, isUnsavableScheme } from '../shared/url.js';

/* B-065: ARIA-label builder for item rows — shared with b048 regression
   tests so production and test exercise the same source of truth. */
import { buildItemRowAriaLabel } from '../shared/aria-label.js';

/* B-022: match-highlight renderer promoted from this file to a shared module
   so both the sidepanel filter (B-021) and the quick-search popup consume
   the same XSS-safe DocumentFragment builder. Zero behaviour change. */
import { buildHighlightedText } from '../shared/highlight.js';

/* B-065: pure-logic half of the group picker — row-builder + query
   normalization. The DOM-mutation half (`_renderGroupPickerRows`,
   filter row.hidden toggles, highlight, keyboard nav) stays in this
   file. Shared with the b029 regression tests so production and test
   exercise the same source of truth. */
import {
  buildGroupPickerRows,
  normalizeGroupPickerQuery,
  matchesGroupPickerRow,
} from '../shared/group-picker-core.js';

/* B-014 M-1: compare broadcast scopes against the canonical constant rather
   than bare string literals. Only the WINDOW_MAP branch uses SCOPE for now —
   the other bare-string comparisons are out of scope per R4 findings. */
import { SCOPE } from '../shared/scopes.js';
/* B-007 */
import {
  filterGroupParentCandidates,
  translateGroupError,
} from '../shared/group-nesting.js';

/* B-030 v2 — pure helper that computes the per-item sortOrder update spec
   for a drag-reorder drop event. Pure, DOM-free, chrome-free (B-065 precedent).
   v2 re-implementation imports the same helper as S22 — backend code
   didn't need to change (bugs were entirely in sidepanel drag handlers). */
import { computeItemReorder, computeMultiItemReorder, computeGroupReorder } from '../shared/sort-order.js';

/* B-052: pre-lowercased in-memory search index. §34 (docs/design/34) is the
   authoritative spec. The module is pure (no DOM); sidepanel owns the DOM-
   patch path (`_patchSingleRow`) and the render path (`renderAll`) that
   installs the index. */
import { buildIndex, diffAndPatch, search as searchIndex } from './search-index.js';

/* B-022 R4 L-2: isSafeFaviconUrl promoted to shared/favicon.js so popup +
   sidepanel share the same scheme allowlist. Byte-for-byte equivalent. */
import { isSafeFaviconUrl } from '../shared/favicon.js';

/* B-091: B-089 modal import removed. Settings is now a full-page tab —
   gear-button dispatcher fires chrome.tabs.create / chrome.tabs.update below.
   Wave 0 pref controls (B-038 displayMode, B-040 autoCollapseSubGroups) live
   in settings/settings.js, not here. */

/* =========================================================================
   DOM references
   ========================================================================= */

const skeletonEl = document.getElementById('skeleton');
const emptyStateEl = document.getElementById('empty-state');
const errorStateEl = document.getElementById('error-state');
const itemListEl = document.getElementById('item-list');
const panelHeaderEl = document.getElementById('panel-header');
const addBookmarkBtnEl = document.getElementById('add-bookmark-btn');
/* B-081: new-group button in header — opens the group dialog in create mode. */
const addGroupBtnEl = document.getElementById('add-group-btn');
/* B-093: B-042/043/044/045 export + import buttons + hidden file inputs
   relocated from the sidepanel header to the Settings page Data section.
   See settings/settings-import-export.js for the relocated handlers. */
const dialogOverlayEl = document.getElementById('dialog-overlay');
const bookmarkDialogEl = document.getElementById('bookmark-dialog');
const confirmDialogEl = document.getElementById('confirm-dialog');
const bookmarkFormEl = document.getElementById('bookmark-form');
const fieldTitleEl = document.getElementById('field-title');
const fieldUrlEl = document.getElementById('field-url');
const fieldGroupEl = document.getElementById('field-group');
const errorTitleEl = document.getElementById('error-title');
const errorUrlEl = document.getElementById('error-url');
const errorDialogEl = document.getElementById('error-dialog');
const dialogHeadingEl = document.getElementById('dialog-heading');
const dialogCancelBtnEl = document.getElementById('dialog-cancel-btn');
const dialogSubmitBtnEl = document.getElementById('dialog-submit-btn');
const confirmHeadingEl = document.getElementById('confirm-heading');
const confirmBodyEl = document.getElementById('confirm-body');
const confirmDeleteBtnEl = document.getElementById('confirm-delete-btn');
const confirmCancelBtnEl = document.getElementById('confirm-cancel-btn');
const filterInputEl = document.getElementById('filter-input');
const filterClearBtnEl = document.getElementById('filter-clear-btn');
const filterEmptyStateEl = document.getElementById('filter-empty-state');
const filterEmptyClearBtnEl = document.getElementById('filter-empty-clear-btn');
const toastEl = document.getElementById('toast');
const toastMessageEl = document.getElementById('toast-message');
const toastDismissEl = document.getElementById('toast-dismiss');
const contextMenuEl = document.getElementById('context-menu');
const bulkActionBarEl = document.getElementById('bulk-action-bar');
const bulkCountEl = document.getElementById('bulk-count');
const bulkMoveBtn = document.getElementById('bulk-move');
const bulkCloseBtn = document.getElementById('bulk-close');
const bulkRemoveBtn = document.getElementById('bulk-remove');
const bulkClearBtn = document.getElementById('bulk-clear');
/* B-014 */
const windowFilterRowEl = document.getElementById('window-filter-row');
/* B-027: Group edit dialog */
const groupDialogEl = document.getElementById('group-dialog');
const groupFormEl = document.getElementById('group-form');
const groupFieldNameEl = document.getElementById('group-field-name');
const groupColorSwatchesEl = document.getElementById('group-color-swatches');
const groupErrorNameEl = document.getElementById('group-error-name');
const groupErrorColorEl = document.getElementById('group-error-color');
const groupErrorDialogEl = document.getElementById('group-error-dialog');
/* B-007: Parent group picker in group dialog */
const groupFieldParentEl = document.getElementById('group-field-parent');
const groupErrorParentEl = document.getElementById('group-error-parent');
const groupCancelBtnEl = document.getElementById('group-cancel-btn');
const groupSubmitBtnEl = document.getElementById('group-submit-btn');
/* B-091: gear button — opens the Settings page tab via the dispatcher
   below (focus existing else create new). The four B-089 modal DOM refs
   were removed when the modal was deleted. */
const settingsBtnEl = document.getElementById('sidepanel-settings-btn');
/* B-029: Group picker modal */
const groupPickerDialogEl = document.getElementById('group-picker-dialog');
const groupPickerHeadingEl = document.getElementById('group-picker-heading');
const groupPickerFilterEl = document.getElementById('group-picker-filter');
const groupPickerListEl = document.getElementById('group-picker-list');
const groupPickerEmptyEl = document.getElementById('group-picker-empty');
const groupPickerCreateBtnEl = document.getElementById('group-picker-create-btn');

/* =========================================================================
   Collapsed groups state (panel-lifetime; persisted via MSG_UPDATE_GROUP)
   ========================================================================= */

const collapsedGroups = new Set();

/* =========================================================================
   Dialog state
   ========================================================================= */

let _editingItemId = null;
let _dialogTriggerEl = null;
let _pendingConfirmCallback = null;
/* B-027: group dialog state */
let _editingGroupId = null;
let _selectedGroupColor = null;

/* =========================================================================
   Filter state (B-021)
   ========================================================================= */

let _filterQuery = '';
let _filterTimer = null;
let _cachedItems = [];
/* B-030 v2 — monotonic generation counter bumped on every `_cachedItems`
   assignment. Dragstart captures the current value; drop compares against
   live value to detect mid-drag broadcast races (AC24). */
let _cachedItemsGen = 0;
let _cachedGroups = [];
/* B-031 — monotonic generation counter bumped on every `_cachedGroups`
   assignment. Parallel to `_cachedItemsGen`. Group-drag captures the
   current value at dragstart; drop compares against the live value to
   detect mid-drag group-scope broadcasts (broadcast-race guard). */
let _cachedGroupsGen = 0;
let _cachedLiveStates = {};
let _cachedDriftRecords = {};
let _itemById = new Map();

/* =========================================================================
   B-052 — Fuzzy search index cache.
   The index is sidepanel-scoped and rebuilt at the tail of `renderAll` +
   patched incrementally from the `scope: 'items'` broadcast branch. §34.11
   `SEARCH_INDEX_ENABLED` is the single-variable rollback gate — flip to
   `false` to fall back to the B-021 linear-scan path without reverting the
   commit.
   ========================================================================= */
const SEARCH_INDEX_ENABLED = true;
/** @type {import('./search-index.js').SearchIndex|null} */
let _searchIndex = null;
/* §34.9: sticky flag set on first catch inside the indexed search path.
   Suppresses noisy per-keystroke warnings for the rest of the session and
   routes `applyFilter` to the B-021 linear-scan fallback. */
let _searchIndexDisabled = false;

/* =========================================================================
   Open Tabs cache (B-055) — parallel to _cachedLiveStates to keep saved-item
   paths unchanged. Populated by renderAll / refetchAndPatchLiveState from
   the enriched MSG_LIST_ITEMS response (`openTabs`).
   `_cachedOpenTabsById` (B-055 M-1) mirrors `_itemById` for O(1) tabId lookup
   during filter passes. Rebuilt every time `_cachedOpenTabs` is assigned —
   callers MUST use `_setCachedOpenTabs()` to keep them in sync.
   ========================================================================= */
let _cachedOpenTabs = [];
let _cachedOpenTabsById = new Map();

function _setCachedOpenTabs(next) {
  _cachedOpenTabs = Array.isArray(next) ? next : [];
  _cachedOpenTabsById = new Map(_cachedOpenTabs.map((t) => [t.tabId, t]));
}

/* =========================================================================
   B-014 — Window ordinal map, panel window identity, and window filter state.
   All three are UI-lifetime only — re-initialised on panel reload. The
   ordinal map is refreshed from every MSG_LIST_ITEMS response; the panel
   windowId is also refreshed on every MSG_LIST_ITEMS to self-heal
   detached-panel moves (AC5).
   ========================================================================= */
/** @type {Record<string, number>} stringified rawWindowId → ordinal */
let _windowOrdinalMap = {};
/** @type {number|null} this sidepanel's own rawWindowId, or null when unknown */
let _panelWindowId = null;
/** @type {number|null} rawWindowId currently filtered — null means "All windows" */
let _activeWindowFilter = null;

function _setWindowOrdinalMap(next) {
  _windowOrdinalMap = (next && typeof next === 'object') ? next : {};
}

/* =========================================================================
   Toast state (B-049)
   ========================================================================= */

let _toastTimer = null;

/* =========================================================================
   Group drag-to-reorder state (B-008)
   ========================================================================= */

let _dragSrcGroupId = null;
let _dragInitiatedFromHandle = false;
let _pendingGroupsRender = false;

/* =========================================================================
   B-030 v2 — item drag-reorder state (per R2 binding contracts)

   Separate state block from B-008 group drag above. See SPRINT.md
   Sprint 23 Active Item § "R2 Architecture Review" for the locked
   contracts enforced below + in the corresponding event handlers.
   ========================================================================= */

/* DRAG_DEBUG — feature flag for the R3 debug pass. Set to `true` during
   R3 Edge UAT; MUST be `false` before PR merge (R4 greps for this). */
const DRAG_DEBUG = false;

/* Non-null while an item-row drag is in flight. Shape:
   { itemId, sourceGroupId, cachedItemsGen, pendingTargetRowId,
     pendingInsertPosition, pendingDestGroupId, rafHandle, scrollListener,
     payloadItemIds, payloadSet, isMulti }

   B-025 fields:
     - payloadItemIds: string[]  The ids being dragged as a unit. For a
         B-030 single-item drag, this is a 1-element array containing
         `itemId` — downstream code iterates uniformly.
     - payloadSet: Set<string>  `new Set(payloadItemIds)` — O(1) membership
         check for `_computeDropTarget` self-exclusion.
     - isMulti: boolean  True iff payloadItemIds.length >= 2 (a custom
         ghost is rendered via setDragImage). False for single-item drags. */
let _itemDragState = null;

/* Rect cache snapshot (AC18). Built at dragstart; scroll invalidates;
   rAF tick rebuilds lazily. Shape: { rects: Map<itemId, DOMRectReadOnly>,
   containerRect: DOMRectReadOnly, invalid: boolean } */
let _dragRectCache = null;

/* Primitives recorded by dragover handler. rAF tick consumes them. */
let _pendingPointerX = 0;
let _pendingPointerY = 0;

/* B-032 — auto-scroll during item drag. Constants per R1 ACs.
   EDGE_ZONE_PX: proximity (px) to top/bottom of itemListEl that activates
     auto-scroll (AC1).
   MAX_SCROLL_SPEED: max px/frame at the very edge; linear ramp toward 0
     at the zone boundary (AC3, AC4). */
const AUTO_SCROLL_EDGE_ZONE_PX = 60;
const AUTO_SCROLL_MAX_SPEED = 20;

/* =========================================================================
   B-031 — group drag-reorder + nest state

   Mode-exclusive with `_itemDragState` above: at most ONE of the two is
   non-null at any time. Dragstart routes to a SINGLE path based on drag
   origin (item-row vs group-section) + `_dragInitiatedFromHandle`.

   Shape:
     {
       draggedGroupId, draggedGroup,
       isSubGroupDrag: boolean,
       validNestTargetIds: Set<string>,
       validReorderTargetIds: Set<string>,
       cachedGroupsGen: number,
       pendingTargetGroupId: string|null,
       pendingMode: 'REORDER_ABOVE'|'REORDER_BELOW'|'NEST'|'REJECT'|null,
       pendingProposedMode: 'REORDER_ABOVE'|'REORDER_BELOW'|'NEST'|null,
       rafHandle: number|null,
       scrollListener: Function|null,
     }
   ========================================================================= */
let _groupDragState = null;

/* Rect cache for group headers. Built at dragstart; scroll invalidates;
   rAF tick rebuilds lazily. Mirrors `_dragRectCache`. */
let _groupDragRectCache = null;

/* Pointer primitives for group drag — separate from _pendingPointerX/Y so
   simultaneous state assignments across paths can't stomp each other. */
let _pendingGroupPointerX = 0;
let _pendingGroupPointerY = 0;

/* =========================================================================
   B-009 — drag-to-expand collapsed group state

   During an active item drag (_itemDragState set), hovering the pointer
   over a COLLAPSED group header for DRAG_EXPAND_HOLD_MS elapsed ms
   triggers that group to expand. Timer is managed in _dragTick; cleared
   on dragleave-of-header or dragend.
   ========================================================================= */

const DRAG_EXPAND_HOLD_MS = 600;
/* {groupId, timerHandle} or null — active hover-hold target. */
let _b009HoverState = null;

/* =========================================================================
   B-033 — drag-to-Open-Tabs demote state

   When a saved+live item is dragged over the Open Tabs section, a drop-
   target highlight appears; on drop the sidepanel dispatches
   MSG_DEMOTE_ITEM (B-017's existing message). Dragged item must be
   saved+live (live indicator present) — saved-only drags are rejected
   per AC3.
   ========================================================================= */

/* 'openTabs' | null — set by _computeDropTarget when pointer is over the
   Open Tabs section AND dragged item is saved+live. */
let _b033DropTarget = null;

function _dragLog(...args) {
  if (DRAG_DEBUG) console.log('[drag]', ...args);
}

const dropIndicatorEl = document.createElement('div');
dropIndicatorEl.className = 'drop-indicator';
dropIndicatorEl.hidden = true;

/* B-030 v2 — dedicated item-drag indicator, separate from B-008's
   `dropIndicatorEl`. Absolute-positioned; moved via CSS transform;
   NEVER reparented during drag (AC22). `pointer-events: none` prevents
   elementFromPoint self-hits (AC23). */
const itemDragIndicatorEl = document.createElement('div');
itemDragIndicatorEl.className = 'drop-indicator drop-indicator--item';
itemDragIndicatorEl.style.position = 'absolute';
itemDragIndicatorEl.style.top = '0'; /* UAT fix — without this, absolute defaults to `auto` (flow position) and translateY offsets from the element's default position (end of itemListEl, since it's appended last), making the indicator invisible. */
itemDragIndicatorEl.style.pointerEvents = 'none';
itemDragIndicatorEl.style.opacity = '0';
itemDragIndicatorEl.style.transition = 'none';
itemDragIndicatorEl.style.left = '0';
itemDragIndicatorEl.style.right = '0';
itemDragIndicatorEl.style.zIndex = '10'; /* ensure indicator renders above item rows */
itemDragIndicatorEl.style.transform = 'translateY(-9999px)';

/* B-031 — dedicated group-drag REORDER indicator. Separate from B-008's
   `dropIndicatorEl` (which uses the `.before()` reparent pattern that
   fights B-030/B-031's absolute-positioned transform pattern) and
   separate from B-030's `itemDragIndicatorEl`. Absolute-positioned;
   moved via CSS transform; NEVER reparented during drag.
   `pointer-events: none` prevents elementFromPoint self-hits. */
const groupReorderIndicatorEl = document.createElement('div');
groupReorderIndicatorEl.className = 'group-reorder-indicator';

/* =========================================================================
   Multi-select state (B-024)
   ========================================================================= */

const _selection = new Set();
let _selectionMode = false;
let _lastSelectedId = null;
/* B-024 H-3: dedicated range anchor — written only by _toggleSelection / _selectAll
   and cleared by _clearSelection. _rangeSelect reads but never writes it. */
let _rangeAnchorId = null;
/* B-024 H-6: pending single-click selection timer — cleared by dblclick. */
let _pendingClickTimer = null;

/* =========================================================================
   Messaging (B3 — null guard)
   ========================================================================= */

async function sendMessage(type, payload = {}) {
  const resp = await chrome.runtime.sendMessage({ type, payload });
  if (!resp || !resp.ok) {
    const err = new Error(resp?.error?.message ?? 'No response from service worker');
    if (resp?.error?.code) err.code = resp.error.code;
    throw err;
  }
  return resp.data;
}

/* =========================================================================
   Theme (B2 — sessionStorage sync, W3 — simplified darkMq)
   ========================================================================= */

let currentTheme = 'light';

function applyTheme(theme) {
  currentTheme = (theme === 'light' || theme === 'dark') ? theme : 'system';
  document.documentElement.setAttribute('data-theme', currentTheme);
  sessionStorage.setItem('tj-theme', currentTheme);
}

/* B-092 — opt-in compact layout. Reads the `denseLayout` boolean off the
   prefs snapshot and flips a single `.tj-dense` class on <body>. All visual
   density changes are driven by pure-CSS descendant selectors in
   sidepanel.css; this helper is the only JS surface required. */
function applyDenseLayout(prefs) {
  const enabled = !!(prefs && prefs.denseLayout === true);
  if (enabled) {
    document.body.classList.add('tj-dense');
  } else {
    document.body.classList.remove('tj-dense');
  }
}

const darkMq = globalThis.matchMedia('(prefers-color-scheme: dark)');
darkMq.addEventListener('change', () => {
  if (currentTheme === 'system') {
    sessionStorage.setItem('tj-theme', 'system');
  }
});

/* =========================================================================
   Deterministic avatar color from title
   ========================================================================= */

const AVATAR_PALETTE = [
  '#2563eb', '#7c3aed', '#0d9488', '#dc2626',
  '#ea580c', '#db2777', '#4f46e5', '#ca8a04',
  '#64748b', '#059669', '#9333ea', '#0284c7',
];

function avatarColor(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/* =========================================================================
   Dialog helpers
   ========================================================================= */

function _populateGroupPicker(selectedGroupId) {
  fieldGroupEl.replaceChildren();
  const ungroupedOpt = document.createElement('option');
  ungroupedOpt.value = '';
  ungroupedOpt.textContent = 'Ungrouped';
  fieldGroupEl.appendChild(ungroupedOpt);

  /* B-026 H-2: use in-memory _cachedGroups — _cachedGroups stays fresh via
     MSG_STATE_CHANGED broadcasts, so no per-open IPC is needed. */
  const sorted = [..._cachedGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const group of sorted) {
    const opt = document.createElement('option');
    opt.value = group.id;
    opt.textContent = group.name;
    fieldGroupEl.appendChild(opt);
  }

  fieldGroupEl.value = selectedGroupId ?? '';
}

function _validateForm() {
  const title = fieldTitleEl.value.trim();
  const url = fieldUrlEl.value.trim();
  let titleError = null;
  let urlError = null;

  if (!title) {
    titleError = 'Title is required.';
  }

  if (!url) {
    urlError = 'URL is required.';
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        urlError = 'URL must start with http:// or https://';
      }
    } catch {
      urlError = 'Enter a valid URL (e.g. https://example.com).';
    }
  }

  return { valid: !titleError && !urlError, titleError, urlError };
}

function _setFieldError(errorEl, inputEl, message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  inputEl.classList.add('dialog-input--error');
}

function _clearFieldError(errorEl, inputEl) {
  errorEl.hidden = true;
  inputEl.classList.remove('dialog-input--error');
}

function _clearAllErrors() {
  _clearFieldError(errorTitleEl, fieldTitleEl);
  _clearFieldError(errorUrlEl, fieldUrlEl);
  errorDialogEl.hidden = true;
}

function _setDialogError(message) {
  errorDialogEl.textContent = message;
  errorDialogEl.hidden = false;
}

function _activateFocusTrap(activeDialogEl) {
  for (const child of document.body.children) {
    if (child.id !== 'dialog-overlay') child.setAttribute('inert', '');
  }
  /* Also inert the inactive dialog sibling so Tab cannot reach its inputs */
  for (const child of dialogOverlayEl.children) {
    if (child !== activeDialogEl) child.setAttribute('inert', '');
  }
}

function _deactivateFocusTrap() {
  for (const child of document.body.children) child.removeAttribute('inert');
  for (const child of dialogOverlayEl.children) child.removeAttribute('inert');
}

async function openCreateDialog({ triggerEl = null } = {}) {
  if (!dialogOverlayEl.hidden) return;
  _editingItemId = null;
  _dialogTriggerEl = triggerEl;
  bookmarkFormEl.reset();
  _clearAllErrors();
  dialogHeadingEl.textContent = 'Add Bookmark';
  confirmDialogEl.hidden = true;
  bookmarkDialogEl.hidden = false;
  await _populateGroupPicker(null);
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(bookmarkDialogEl);
  fieldTitleEl.focus();
}

async function openEditDialog(item, { triggerEl = null } = {}) {
  if (!dialogOverlayEl.hidden) return;
  _editingItemId = item.id;
  _dialogTriggerEl = triggerEl;
  _clearAllErrors();
  dialogHeadingEl.textContent = 'Edit Bookmark';
  fieldTitleEl.value = item.title ?? '';
  fieldUrlEl.value = item.url ?? '';
  confirmDialogEl.hidden = true;
  bookmarkDialogEl.hidden = false;
  await _populateGroupPicker(item.groupId);
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(bookmarkDialogEl);
  fieldTitleEl.focus();
}

function closeDialog() {
  dialogOverlayEl.hidden = true;
  dialogOverlayEl.setAttribute('aria-hidden', 'true');
  bookmarkDialogEl.hidden = true;
  confirmDialogEl.hidden = true;
  groupDialogEl.hidden = true; /* B-027: ensure group dialog is closed too */
  /* B-091: B-089 modal branch removed — Settings is now a full-page tab,
     not an in-sidepanel modal, so global Escape no longer needs to close
     it. */
  /* B-029: ensure the picker is closed too so global Escape never leaves a
     stray picker behind. Local Escape handling in the picker calls
     closeGroupPickerDialog() directly; this branch only fires when the global
     handler wins (edge case: overlay click, etc.). */
  if (groupPickerDialogEl) {
    groupPickerDialogEl.hidden = true;
    _resetGroupPicker();
  }
  _deactivateFocusTrap();
  _editingItemId = null;
  _editingGroupId = null;
  _pendingConfirmCallback = null;
  if (_dialogTriggerEl) {
    _dialogTriggerEl.focus();
    _dialogTriggerEl = null;
  }
}

/* B-027: Group edit dialog helpers ---------------------------------------- */

/** Populate the color swatch radio group and mark the currently selected color. */
function _buildGroupColorSwatches(selectedColor) {
  groupColorSwatchesEl.replaceChildren();
  for (const color of GROUP_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'group-color-swatch group-color-' + color;
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-label', color);
    swatch.setAttribute('aria-checked', color === selectedColor ? 'true' : 'false');
    swatch.dataset.color = color;
    swatch.addEventListener('click', () => {
      _selectedGroupColor = color;
      for (const s of groupColorSwatchesEl.childNodes) {
        if (s instanceof HTMLElement) {
          s.setAttribute('aria-checked', s.dataset.color === color ? 'true' : 'false');
        }
      }
    });
    groupColorSwatchesEl.appendChild(swatch);
  }
  _selectedGroupColor = selectedColor || GROUP_COLORS[0];
}

/**
 * Open the group dialog. When `group` is null/undefined, runs in "create" mode
 * (B-029 H-1): heading becomes "New Group", form starts blank, first palette
 * color is preselected, and submit dispatches MSG_CREATE_GROUP. Otherwise
 * edit-mode is preserved (heading "Edit Group", dispatches MSG_UPDATE_GROUP).
 */
function openGroupEditDialog(group, { triggerEl = null } = {}) {
  if (!dialogOverlayEl.hidden) return;
  const isCreate = !group;
  _editingGroupId = isCreate ? null : group.id;
  _dialogTriggerEl = triggerEl;
  groupFormEl.reset();
  groupFieldNameEl.value = isCreate ? '' : (group.name ?? '');
  groupErrorNameEl.hidden = true;
  groupErrorColorEl.hidden = true;
  groupErrorParentEl.hidden = true;
  groupErrorDialogEl.hidden = true;
  document.getElementById('group-dialog-heading').textContent =
    isCreate ? 'New Group' : 'Edit Group';
  _buildGroupColorSwatches(isCreate ? GROUP_COLORS[0] : (group.color || GROUP_COLORS[0]));
  /* B-007: populate parent picker. Valid parents are top-level groups that
     (a) are not the group being edited (AC2 self-exclusion), (b) do not
     already have children (AC8 depth-2 prevention — storage would reject
     with ERR_DEPTH_EXCEEDED, this pre-filter avoids the error round-trip). */
  _buildGroupParentOptions(isCreate ? null : group);
  bookmarkDialogEl.hidden = true;
  confirmDialogEl.hidden = true;
  groupDialogEl.hidden = false;
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(groupDialogEl);
  groupFieldNameEl.focus();
}

/**
 * B-007: Build the Parent group <select> options for the group dialog.
 * In edit mode, `editingGroup` is the group being edited (used to pre-select
 * its current parent and to exclude it from the list). In create mode,
 * `editingGroup` is null.
 *
 * Excluded from the list (beyond Top-level which is always first):
 *   - any group with `parentId != null` (already nested — can't be a parent, depth-1 cap)
 *   - the group being edited itself (AC2, AC14 self-nest defence)
 *   - any group that has at least one child already (AC8 — would become depth-2)
 *
 * Pre-selection:
 *   - edit mode: group's current `parentId`, or '' (Top-level) if null
 *   - create mode: '' (Top-level) by default
 */
function _buildGroupParentOptions(editingGroup) {
  /* Reset options; keep only the first "Top-level" option as the default. */
  while (groupFieldParentEl.options.length > 1) groupFieldParentEl.remove(1);

  const candidates = filterGroupParentCandidates(_cachedGroups, editingGroup);
  for (const g of candidates) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    groupFieldParentEl.appendChild(opt);
  }

  groupFieldParentEl.value = editingGroup && editingGroup.parentId
    ? editingGroup.parentId
    : '';
}

/**
 * B-029 H-1: thin wrapper for create mode. Kept separate from
 * openGroupEditDialog for call-site clarity — the picker's empty-state CTA
 * calls this, and future callers should too.
 */
function openGroupCreateDialog({ triggerEl = null } = {}) {
  openGroupEditDialog(null, { triggerEl });
}

/** Close the group dialog and restore focus. */
function closeGroupDialog() {
  groupDialogEl.hidden = true;
  dialogOverlayEl.hidden = true;
  dialogOverlayEl.setAttribute('aria-hidden', 'true');
  _deactivateFocusTrap();
  _editingGroupId = null;
  _selectedGroupColor = null;
  if (_dialogTriggerEl) {
    _dialogTriggerEl.focus();
    _dialogTriggerEl = null;
  }
}

/** Handle group form submission (edit only — B-027 does not add group creation). */
async function _handleGroupFormSubmit(e) {
  e.preventDefault();
  const name = groupFieldNameEl.value.trim();
  if (!name) {
    groupErrorNameEl.textContent = 'Name is required.';
    groupErrorNameEl.hidden = false;
    return;
  }
  if (name.length > 256) {
    groupErrorNameEl.textContent = 'Name must be 256 characters or fewer.';
    groupErrorNameEl.hidden = false;
    return;
  }
  const color = _selectedGroupColor;
  if (!GROUP_COLORS.includes(color)) {
    groupErrorColorEl.textContent = 'Select a valid color.';
    groupErrorColorEl.hidden = false;
    return;
  }
  /* B-007: read parentId from the select; empty-string → top-level (null). */
  const parentId = groupFieldParentEl.value === '' ? null : groupFieldParentEl.value;
  groupSubmitBtnEl.disabled = true;
  try {
    if (_editingGroupId) {
      await sendMessage(MSG_UPDATE_GROUP, {
        id: _editingGroupId,
        patch: { name, color, parentId },
      });
    } else {
      /* B-007: create mode now honours the parent picker; sortOrder remains
         derived from the current group count so new groups land at the end. */
      await sendMessage(MSG_CREATE_GROUP, {
        name,
        color,
        parentId,
        sortOrder: _cachedGroups.length,
      });
    }
    closeGroupDialog();
  } catch (err) {
    /* B-007: translate storage-level error codes to friendly inline messages
       (ERR_DEPTH_EXCEEDED + ERR_CIRCULAR_REF + ERR_NOT_FOUND for a parent that
       disappeared in another window). Falls back to the raw message for
       unknown codes. */
    const code = err?.code || '';
    const message = translateGroupError(code) || err?.message || 'Something went wrong.';
    groupErrorDialogEl.textContent = message;
    groupErrorDialogEl.hidden = false;
  } finally {
    groupSubmitBtnEl.disabled = false;
  }
}


groupFormEl.addEventListener('submit', _handleGroupFormSubmit);

groupCancelBtnEl.addEventListener('click', closeGroupDialog);

/* Close group dialog on Escape — handled by the document keydown handler below
   (it checks !dialogOverlayEl.hidden, which covers the group dialog too since
   both share the same overlay). */

/* B-027 end group dialog helpers ------------------------------------------ */

/* =========================================================================
   B-091 — Settings page gear-button dispatcher (§44.3 D-2)
   =========================================================================
   The gear button opens the full-page Settings tab via chrome.tabs.create or,
   if a Settings tab is already open, focuses that tab via chrome.tabs.update
   + chrome.windows.update (focus-existing-else-create per §41 B-035 D-3 (c)).
   Failure surfaces a toast — the gear button must never appear broken.
   Wave 0 controls (B-038 displayMode, B-040 autoCollapseSubGroups) are
   registered in settings/settings.js, not here. */

const SETTINGS_PAGE_URL = chrome.runtime.getURL('settings/settings.html');

if (settingsBtnEl) {
  settingsBtnEl.addEventListener('click', () => {
    openOrFocusSettingsTab().catch((err) => {
      showToast('Could not open Settings');
      console.warn('[B-091] settings dispatcher failed:', err && err.message ? err.message : err);
    });
  });
}

async function openOrFocusSettingsTab() {
  const matches = await chrome.tabs.query({ url: SETTINGS_PAGE_URL });
  if (Array.isArray(matches) && matches.length > 0) {
    const tab = matches[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: SETTINGS_PAGE_URL });
}

/* =========================================================================
   B-059 soft-warn helpers — pre-dispatch duplicate-URL detection
   ========================================================================= */

/**
 * B-059: pre-dispatch duplicate-URL detection for save flows.
 * Returns the first existing saved item whose normalized URL matches `url`,
 * or null. Uses the already-maintained `_cachedItems` snapshot and the shared
 * `safeNormalizeForMatch` helper — zero IPC, O(n) over cached items.
 *
 * @param {string} url raw URL from the tab or form
 * @returns {Object|null}
 */
function _findDuplicateSavedItem(url) {
  const normalized = safeNormalizeForMatch(url);
  /* unparseable URL — safeNormalizeForMatch('') returns ''. Early-return so
     we never match other unparseable URLs against each other. */
  if (!normalized) return null;
  for (const it of _cachedItems) {
    if (safeNormalizeForMatch(it.url) === normalized) return it;
  }
  return null;
}

/**
 * B-059: friendly group label for the duplicate-URL dialog body. Falls back
 * to "Ungrouped" when the item has no groupId or the group no longer exists
 * in the cached groups snapshot.
 *
 * @param {{ groupId?: string|null }} item
 * @returns {string}
 */
function _groupLabelForItem(item) {
  if (!item || !item.groupId) return 'Ungrouped';
  const g = _cachedGroups.find((gr) => gr.id === item.groupId);
  return g ? g.name : 'Ungrouped';
}

function openConfirmDialog(
  item,
  onConfirm,
  {
    triggerEl = null,
    heading,
    body,
    /* B-059: callers override the confirm button label. Defaults to "Delete"
       so existing destructive-action callers keep working without change. */
    confirmLabel,
    /* B-059: 'primary' | 'destructive' — styles the confirm button. Always
       written to dataset on every open so a prior primary call cannot leak
       styling into a subsequent destructive call. */
    variant = 'destructive',
  } = {},
) {
  _pendingConfirmCallback = onConfirm;
  _dialogTriggerEl = triggerEl;
  /* B-024 C-2: heading + body overrides for bulk callers; single-item path preserves
     the original "Delete Bookmark?" heading and delete-wording body. */
  confirmHeadingEl.textContent = heading || 'Delete Bookmark?';
  confirmBodyEl.textContent =
    body || ('Delete "' + (item.title || 'this bookmark') + '"? This cannot be undone.');
  confirmDeleteBtnEl.textContent = confirmLabel || 'Delete';
  confirmDeleteBtnEl.dataset.variant = variant;
  bookmarkDialogEl.hidden = true;
  confirmDialogEl.hidden = false;
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(confirmDialogEl);
  confirmCancelBtnEl.focus();
}

/* =========================================================================
   B-029 — Group picker modal primitive
   =========================================================================
   Unified "choose a group" surface replacing four previous inline <select>
   pickers (bulk bar, selection menu, Open-Tabs menu) plus adding the new
   B-027 "Move items out of group" action.

   API: openGroupPickerDialog({ mode, sourceGroupId, triggerEl, onSelect })
     - mode         'move' | 'save'  — drives heading text (AC8)
     - sourceGroupId string|null     — excluded from list (AC5)
     - triggerEl    HTMLElement|null — focus-restore target
     - onSelect     (groupId: string|null) => void — null for "Ungrouped"

   Per §30 the picker is a pure view over already-cached state — no IPC on
   open, no storage writes, no new message types. All cache reads go through
   `_cachedGroups`, `_cachedItems`, `_cachedLiveStates`.
   ========================================================================= */

/* Module-scope picker state. Cleared by _resetGroupPicker on close so a
   subsequent open starts from a deterministic baseline. */
let _groupPickerOnSelect = null;
let _groupPickerHighlightIndex = -1;
let _groupPickerKeydownHandler = null;
let _groupPickerOverlayClickHandler = null;

function _resetGroupPicker() {
  _groupPickerOnSelect = null;
  _groupPickerHighlightIndex = -1;
  if (groupPickerListEl) {
    groupPickerListEl.replaceChildren();
    /* B-029 code-reviewer M-2: clear aria-activedescendant so a subsequent
       open starts clean. */
    groupPickerListEl.setAttribute('aria-activedescendant', '');
  }
  if (groupPickerFilterEl) groupPickerFilterEl.value = '';
  if (groupPickerEmptyEl) groupPickerEmptyEl.hidden = true;
  if (groupPickerListEl) groupPickerListEl.hidden = false;
  if (_groupPickerKeydownHandler && groupPickerDialogEl) {
    groupPickerDialogEl.removeEventListener('keydown', _groupPickerKeydownHandler, true);
    _groupPickerKeydownHandler = null;
  }
  if (_groupPickerOverlayClickHandler && dialogOverlayEl) {
    dialogOverlayEl.removeEventListener('click', _groupPickerOverlayClickHandler);
    _groupPickerOverlayClickHandler = null;
  }
}

/**
 * Build the flat row list for the picker. Thin wrapper over the shared
 * pure helper in `shared/group-picker-core.js` (extracted in B-065) —
 * this wrapper exists only to inject the module-level caches
 * (`_cachedGroups`, `_cachedItems`, `_cachedLiveStates`) that the rest
 * of the file already maintains.
 *
 * @param {string|null} sourceGroupId group id to exclude (AC5)
 * @returns {import('../shared/group-picker-core.js').PickerRow[]}
 */
function _buildGroupPickerRows(sourceGroupId) {
  return buildGroupPickerRows({
    groups: _cachedGroups,
    items: _cachedItems,
    liveStates: _cachedLiveStates,
    sourceGroupId,
  });
}

function _renderGroupPickerRows(rows) {
  groupPickerListEl.replaceChildren();
  const frag = document.createDocumentFragment();
  for (const [idx, row] of rows.entries()) {
    const rowEl = document.createElement('div');
    rowEl.className = 'group-picker-row';
    rowEl.setAttribute('role', 'option');
    rowEl.setAttribute('tabindex', '-1');
    rowEl.setAttribute('aria-selected', 'false');
    /* B-029 code-reviewer M-2: stable id per row so the listbox container can
       advertise the active option via aria-activedescendant (ARIA 1.2 listbox
       pattern). Clearing happens in _resetGroupPicker. */
    rowEl.id = 'group-picker-row-' + idx;
    rowEl.dataset.groupId = row.id == null ? '' : row.id;
    rowEl.dataset.index = String(idx);
    rowEl.dataset.searchKey = row.searchKey;

    const chip = document.createElement('span');
    chip.className = 'group-picker-row-chip';
    chip.setAttribute('aria-hidden', 'true');
    /* B-029 security-reviewer M-1: defense-in-depth — only apply the palette
       class when the color is in the allowlist. Storage validates on write
       (background/storage/groups.js), but the render boundary must not trust
       that guarantee alone. Unknown colors fall back to the neutral chip
       (transparent + subtle border) that Ungrouped uses. */
    if (row.color && GROUP_COLORS.includes(row.color)) {
      chip.classList.add('group-color-' + row.color);
    }
    rowEl.appendChild(chip);

    const nameEl = document.createElement('span');
    nameEl.className = 'group-picker-row-name';
    nameEl.textContent = row.name; /* textContent — never innerHTML */
    rowEl.appendChild(nameEl);

    const breadEl = document.createElement('span');
    breadEl.className = 'group-picker-row-breadcrumb';
    breadEl.textContent = row.breadcrumb; /* textContent — empty for top-level */
    if (!row.breadcrumb) breadEl.hidden = true;
    rowEl.appendChild(breadEl);

    const countsEl = document.createElement('span');
    countsEl.className = 'group-picker-row-counts';
    countsEl.textContent =
      row.savedCount + ' saved, ' + row.openCount + ' open';
    rowEl.appendChild(countsEl);

    rowEl.addEventListener('click', () => {
      _confirmGroupPickerRow(rowEl);
    });

    frag.appendChild(rowEl);
  }
  groupPickerListEl.appendChild(frag);
}

function _visibleGroupPickerRows() {
  return [...groupPickerListEl.querySelectorAll('.group-picker-row')].filter(
    (r) => !r.hidden,
  );
}

function _setGroupPickerHighlight(index) {
  const visible = _visibleGroupPickerRows();
  if (visible.length === 0) {
    _groupPickerHighlightIndex = -1;
    return;
  }
  /* Wrap semantics (AC4). */
  let next = index;
  if (next < 0) next = visible.length - 1;
  if (next >= visible.length) next = 0;
  _groupPickerHighlightIndex = next;

  for (const row of groupPickerListEl.querySelectorAll('.group-picker-row')) {
    row.classList.remove('group-picker-row--highlighted');
    row.setAttribute('aria-selected', 'false');
  }
  const active = visible[next];
  active.classList.add('group-picker-row--highlighted');
  active.setAttribute('aria-selected', 'true');
  /* B-029 code-reviewer M-2: advertise the active option on the listbox so
     screen readers announce highlight changes during keyboard navigation. */
  if (active.id) {
    groupPickerListEl.setAttribute('aria-activedescendant', active.id);
  }
  /* Keep the highlighted row in view without moving DOM focus out of the
     filter input (AC4 — typing while list is focused must forward to input). */
  if (typeof active.scrollIntoView === 'function') {
    active.scrollIntoView({ block: 'nearest' });
  }
}

function _confirmGroupPickerRow(rowEl) {
  if (!rowEl) return;
  const raw = rowEl.dataset.groupId;
  const groupId = raw === '' ? null : raw;
  const callback = _groupPickerOnSelect;
  /* Close FIRST so AC7 (B-059 handoff) holds: the picker's DOM must be
     removed before a subsequent confirm/dialog opens from inside `callback`. */
  closeGroupPickerDialog();
  if (typeof callback === 'function') {
    try {
      callback(groupId);
    } catch (err) {
      /* B-029 L-3: surface a fallback toast if the callback throws
         synchronously. Async rejections are handled by each caller. */
      showToast(_translateMoveError(err));
    }
  }
}

function _applyGroupPickerFilter() {
  /* B-065: query normalization shared with the b029 regression suite via
     `shared/group-picker-core.js::normalizeGroupPickerQuery`. The rest of
     this function remains here because it mutates real DOM (`row.hidden`,
     highlight classes, aria-activedescendant). */
  const query = normalizeGroupPickerQuery(groupPickerFilterEl.value);
  const rows = groupPickerListEl.querySelectorAll('.group-picker-row');
  let visibleCount = 0;
  for (const row of rows) {
    const match = matchesGroupPickerRow(row.dataset.searchKey, query);
    row.hidden = !match;
    if (match) visibleCount++;
  }
  /* Re-highlight first visible row on every filter pass. */
  if (visibleCount === 0) {
    _groupPickerHighlightIndex = -1;
    for (const row of rows) {
      row.classList.remove('group-picker-row--highlighted');
      row.setAttribute('aria-selected', 'false');
    }
    /* B-029 code-reviewer M-2: clear aria-activedescendant when nothing is
       highlighted so screen readers don't announce a stale row. */
    groupPickerListEl.setAttribute('aria-activedescendant', '');
  } else {
    _setGroupPickerHighlight(0);
  }
}

function _onGroupPickerKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (_visibleGroupPickerRows().length === 0) return;
    _setGroupPickerHighlight(_groupPickerHighlightIndex + 1);
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (_visibleGroupPickerRows().length === 0) return;
    _setGroupPickerHighlight(_groupPickerHighlightIndex - 1);
    return;
  }
  if (e.key === 'Enter') {
    const visible = _visibleGroupPickerRows();
    if (visible.length === 0 || _groupPickerHighlightIndex < 0) return;
    e.preventDefault();
    _confirmGroupPickerRow(visible[_groupPickerHighlightIndex]);
    return;
  }
  if (e.key === 'Escape') {
    /* Stop propagation so neither the global Escape handler (which would
       also call closeDialog) nor the B-024 Escape-to-clear-selection branch
       runs. The local close path is safer — closeDialog() was written for
       the bookmark/confirm dialogs and has broader side effects. */
    e.preventDefault();
    e.stopPropagation();
    closeGroupPickerDialog();
    return;
  }
  if (e.key === 'Tab') {
    /* B-029 code-reviewer M-1: proper cycle between filter, list/empty-CTA,
       and back. When the empty-state is visible the Create-group button
       participates in the cycle; otherwise it's a 2-stop loop.

       Forward order:  filter -> (list | createBtn) -> filter
       Backward order: filter -> (createBtn | list) -> filter         */
    const active = document.activeElement;
    const emptyVisible = groupPickerEmptyEl && !groupPickerEmptyEl.hidden;
    const listTarget = emptyVisible && groupPickerCreateBtnEl
      ? groupPickerCreateBtnEl
      : groupPickerListEl;

    if (active === groupPickerFilterEl) {
      e.preventDefault();
      listTarget.focus();
      return;
    }
    if (active === groupPickerListEl || active === groupPickerCreateBtnEl) {
      e.preventDefault();
      groupPickerFilterEl.focus();
      return;
    }
  }
}

function openGroupPickerDialog({
  mode = 'move',
  sourceGroupId = null,
  triggerEl = null,
  onSelect,
} = {}) {
  if (!groupPickerDialogEl) return;
  /* INVARIANT: the picker can never open over another dialog — this guard
     preserves the shared _dialogTriggerEl so the prior dialog's focus-restore
     target is not clobbered. B-029 qa-reviewer Q-M4. */
  if (!dialogOverlayEl.hidden) return;
  if (typeof onSelect !== 'function') return; /* defensive — caller bug */

  _resetGroupPicker();
  _groupPickerOnSelect = onSelect;
  _dialogTriggerEl = triggerEl;

  /* AC8: heading mirrors mode. Always write on every open — never trust a
     stale DOM value from a prior open. */
  groupPickerHeadingEl.textContent =
    mode === 'save' ? 'Save to group' : 'Move to group';

  const rows = _buildGroupPickerRows(sourceGroupId);

  if (rows.length === 0) {
    /* AC9 — empty state. */
    groupPickerListEl.hidden = true;
    groupPickerEmptyEl.hidden = false;
  } else {
    groupPickerListEl.hidden = false;
    groupPickerEmptyEl.hidden = true;
    _renderGroupPickerRows(rows);
  }

  /* Mount sibling modals inert so Tab cannot reach their inputs, matching
     the existing focus-trap pattern. */
  bookmarkDialogEl.hidden = true;
  confirmDialogEl.hidden = true;
  groupDialogEl.hidden = true;
  groupPickerDialogEl.hidden = false;
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(groupPickerDialogEl);

  _groupPickerKeydownHandler = _onGroupPickerKeydown;
  groupPickerDialogEl.addEventListener('keydown', _groupPickerKeydownHandler, true);

  /* Outside-click closes without invoking onSelect (same as Escape). Scoped
     to the overlay so clicks inside the dialog don't fire. */
  _groupPickerOverlayClickHandler = (ev) => {
    if (ev.target === dialogOverlayEl) {
      closeGroupPickerDialog();
    }
  };
  dialogOverlayEl.addEventListener('click', _groupPickerOverlayClickHandler);

  groupPickerFilterEl.focus();
  if (rows.length > 0) _setGroupPickerHighlight(0);
}

/**
 * B-029 H-2: re-render the picker body from fresh _cachedGroups when a
 * scope='groups' broadcast arrives while the picker is open. Without this,
 * confirming a highlighted row that has since been deleted in another window
 * dispatches MSG_BULK_UPDATE_ITEMS against a ghost target (masked by generic
 * catches). Filter text and the previously-highlighted group id are preserved
 * if the group still exists.
 *
 * @param {{ sourceGroupId?: string|null }} [opts]
 */
function _refreshGroupPickerIfOpen({ sourceGroupId = null } = {}) {
  if (!groupPickerDialogEl || groupPickerDialogEl.hidden) return;
  /* Snapshot state we need to preserve across the re-render. */
  const priorQuery = groupPickerFilterEl ? groupPickerFilterEl.value : '';
  const priorHighlight = _visibleGroupPickerRows()[_groupPickerHighlightIndex];
  const priorGroupId = priorHighlight
    ? (priorHighlight.dataset.groupId === '' ? null : priorHighlight.dataset.groupId)
    : undefined;

  const rows = _buildGroupPickerRows(sourceGroupId);

  if (rows.length === 0) {
    groupPickerListEl.hidden = true;
    groupPickerEmptyEl.hidden = false;
    _groupPickerHighlightIndex = -1;
    groupPickerListEl.setAttribute('aria-activedescendant', '');
    return;
  }
  groupPickerListEl.hidden = false;
  groupPickerEmptyEl.hidden = true;
  _renderGroupPickerRows(rows);

  /* Re-apply filter text so visibility matches the user's typed query. */
  if (priorQuery) _applyGroupPickerFilter();

  /* Try to restore the previous highlight by group id; fall back to first
     visible row. */
  const visible = _visibleGroupPickerRows();
  if (visible.length === 0) {
    _groupPickerHighlightIndex = -1;
    groupPickerListEl.setAttribute('aria-activedescendant', '');
    return;
  }
  let restoredIdx = 0;
  if (priorGroupId !== undefined) {
    const idx = visible.findIndex((r) => {
      const id = r.dataset.groupId === '' ? null : r.dataset.groupId;
      return id === priorGroupId;
    });
    if (idx >= 0) restoredIdx = idx;
  }
  _setGroupPickerHighlight(restoredIdx);
}

function closeGroupPickerDialog() {
  if (!groupPickerDialogEl || groupPickerDialogEl.hidden) return;
  groupPickerDialogEl.hidden = true;
  dialogOverlayEl.hidden = true;
  dialogOverlayEl.setAttribute('aria-hidden', 'true');
  _resetGroupPicker();
  _deactivateFocusTrap();
  if (_dialogTriggerEl) {
    _dialogTriggerEl.focus();
    _dialogTriggerEl = null;
  }
}

/* Filter input: synchronous — no debounce (AC3 perf budget easily met). */
if (groupPickerFilterEl) {
  groupPickerFilterEl.addEventListener('input', _applyGroupPickerFilter);
  /* Forward printable keystrokes from the listbox back to the filter per AC4 */
  groupPickerFilterEl.addEventListener('keydown', (e) => {
    /* The Tab/Arrow/Enter/Escape routing lives on the dialog-root handler;
       this listener exists only to keep filter typing responsive. */
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      /* Defer to dialog-root handler (which preventDefaults); stop the
         browser from moving the text caret. */
      e.preventDefault();
    }
  });
}

if (groupPickerListEl) {
  /* When the list has focus, any printable keystroke should fall through to
     the filter input so the user can keep typing without explicitly re-focusing
     it (AC4).
     B-029 qa-reviewer Q-M1: we also manually append the character to the
     filter value and trigger `_applyGroupPickerFilter`, because shifting
     focus on keydown does NOT replay the keystroke to the newly focused
     element — the first printable key was otherwise lost. */
  groupPickerListEl.addEventListener('keydown', (e) => {
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      groupPickerFilterEl.focus();
      groupPickerFilterEl.value = (groupPickerFilterEl.value || '') + e.key;
      _applyGroupPickerFilter();
    }
  });
}

if (groupPickerCreateBtnEl) {
  groupPickerCreateBtnEl.addEventListener('click', () => {
    /* B-029 H-1: AC9 — close the picker, then open the group edit dialog in
       create mode. The picker's _dialogTriggerEl is preserved through the
       close path, but we pass the create-btn itself for intuitive focus
       restore if the user cancels the create dialog. Per §30.9 the picker
       does NOT auto-reopen after create. */
    const triggerEl = groupPickerCreateBtnEl;
    closeGroupPickerDialog();
    openGroupCreateDialog({ triggerEl });
  });
}

async function _handleFormSubmit(e) {
  e.preventDefault();
  const validation = _validateForm();
  if (!validation.valid) {
    if (validation.titleError) _setFieldError(errorTitleEl, fieldTitleEl, validation.titleError);
    if (validation.urlError) _setFieldError(errorUrlEl, fieldUrlEl, validation.urlError);
    return;
  }

  dialogSubmitBtnEl.disabled = true;
  const payload = {
    title: fieldTitleEl.value.trim(),
    url: fieldUrlEl.value.trim(),
    groupId: fieldGroupEl.value || null,
  };

  try {
    if (_editingItemId) {
      await sendMessage(MSG_UPDATE_ITEM, { id: _editingItemId, patch: payload });
    } else {
      await sendMessage(MSG_CREATE_ITEM, payload);
    }
    closeDialog();
    /* Fallback re-render in case MSG_STATE_CHANGED broadcast is lost */
    Promise.all([sendMessage(MSG_LIST_ITEMS), sendMessage(MSG_LIST_GROUPS)])
      .then(([itemsResp, groups]) => {
        /* B-014: keep the ordinal map fresh on fallback re-renders too. */
        _setWindowOrdinalMap(itemsResp.windowMap || {});
        renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords, itemsResp.openTabs);
        _applyWindowMapToUI();
      })
      .catch(() => {});
  } catch (err) {
    const code = err?.code;
    const message = err?.message || 'Something went wrong.';
    if (code === ERR_VALIDATION) {
      if (message.toLowerCase().includes('url')) {
        _setFieldError(errorUrlEl, fieldUrlEl, message);
      } else {
        _setFieldError(errorTitleEl, fieldTitleEl, message);
      }
    } else if (code === ERR_NOT_FOUND) {
      _setDialogError('This bookmark no longer exists.');
    } else {
      _setDialogError(message);
    }
  } finally {
    dialogSubmitBtnEl.disabled = false;
  }
}

bookmarkFormEl.addEventListener('submit', _handleFormSubmit);

/* =========================================================================
   Filter helpers (B-021)
   ========================================================================= */

/* B-022: `buildHighlightedText` now lives in `shared/highlight.js` and is
   imported at the top of this file. The sidepanel and the quick-search
   popup share a single DocumentFragment builder — zero behaviour change. */

function applyFilter() {
  const query = _filterQuery.trim().toLowerCase();

  /* B-052: prefer the pre-lowercased index for the saved-items hot path.
     Falls back to the B-021 per-row lowercase scan when the index is
     disabled (rollback gate) or unavailable (pre-hydrate). */
  const useIndex =
    SEARCH_INDEX_ENABLED && !_searchIndexDisabled && _searchIndex !== null;

  const groupSections = itemListEl.querySelectorAll('.group-section');
  let totalVisible = 0;

  for (const section of groupSections) {
    const rows = section.querySelectorAll('[data-item-id]');
    let visibleInGroup = 0;

    for (const row of rows) {
      if (!query) {
        row.hidden = false;
        /* Clear any existing highlights (restore original title/url text) */
        const titleEl = row.querySelector('.item-title');
        const urlEl = row.querySelector('.item-url');
        if (titleEl) {
          const itemId = row.dataset.itemId;
          const item = _itemById.get(itemId);
          if (item) {
            titleEl.textContent = item.title || '';
            if (urlEl) urlEl.textContent = item.url || '';
          }
        }
        visibleInGroup++;
      } else {
        const itemId = row.dataset.itemId;
        const item = _itemById.get(itemId);
        if (!item) { row.hidden = true; continue; }

        /* B-052: read pre-lowercased fields from the index when available —
           avoids N × 2 toLowerCase() calls per keystroke at 1 000 items.
           A single try/catch wraps the index read so a malformed entry
           never breaks the filter UX; §34.9 "graceful degrade" flips
           `_searchIndexDisabled` on the first miss. */
        let titleMatch;
        let urlMatch;
        if (useIndex) {
          try {
            const entry = _searchIndex.byId[itemId];
            if (entry) {
              titleMatch = entry.titleLower.includes(query);
              urlMatch = entry.urlLower.includes(query);
            } else {
              /* Index not yet patched for this id (broadcast race): fall
                 through to linear compute for this single row without
                 disabling the index for the session. */
              titleMatch = (item.title || '').toLowerCase().includes(query);
              urlMatch = (item.url || '').toLowerCase().includes(query);
            }
          } catch (err) {
            console.warn('[tab-junkie:b052] search index unusable; falling back to linear scan');
            _searchIndexDisabled = true;
            titleMatch = (item.title || '').toLowerCase().includes(query);
            urlMatch = (item.url || '').toLowerCase().includes(query);
          }
        } else {
          titleMatch = (item.title || '').toLowerCase().includes(query);
          urlMatch = (item.url || '').toLowerCase().includes(query);
        }

        if (titleMatch || urlMatch) {
          row.hidden = false;
          visibleInGroup++;

          /* Apply highlights */
          const titleEl = row.querySelector('.item-title');
          const urlEl = row.querySelector('.item-url');
          if (titleEl) {
            titleEl.textContent = '';
            titleEl.appendChild(buildHighlightedText(item.title || '', query));
          }
          if (urlEl) {
            urlEl.textContent = '';
            urlEl.appendChild(buildHighlightedText(item.url || '', query));
          }
        } else {
          row.hidden = true;
        }
      }
    }

    /* Update group count badge to reflect filtered count */
    const countBadge = section.querySelector('.group-header-count');
    if (countBadge) {
      if (query) {
        countBadge.textContent = visibleInGroup;
      } else {
        const total = section.dataset.itemCount;
        if (total !== undefined) countBadge.textContent = total;
      }
    }

    /* B-049: Hide group inline empty state during active filter */
    const groupEmptyEl = section.querySelector('.group-items-empty');
    if (groupEmptyEl) {
      groupEmptyEl.hidden = !!query;
    }

    /* Hide group section entirely if no visible items */
    if (!query) {
      section.hidden = false;
    } else {
      section.hidden = visibleInGroup === 0;
    }

    totalVisible += visibleInGroup;
  }

  /* B-055 AC11: filter Open Tabs rows by title OR url (case-insensitive). */
  const openTabsSection = document.getElementById(OPEN_TABS_SECTION_ID);
  if (openTabsSection) {
    const rows = openTabsSection.querySelectorAll('[data-tab-id]');
    let visibleTabs = 0;
    for (const row of rows) {
      const tabId = Number(row.dataset.tabId);
      /* B-055 M-1: O(1) lookup via pre-built map. */
      const tab = _cachedOpenTabsById.get(tabId);
      if (!query) {
        row.hidden = false;
        /* Restore original title/url text (no highlight on non-matching cases) */
        if (tab) {
          const titleEl = row.querySelector('.item-title');
          const urlEl = row.querySelector('.item-url');
          if (titleEl) titleEl.textContent = tab.title || tab.url || 'Untitled tab';
          if (urlEl) urlEl.textContent = tab.url || '';
        }
        visibleTabs++;
        continue;
      }
      if (!tab) { row.hidden = true; continue; }
      const titleMatch = (tab.title || '').toLowerCase().includes(query);
      const urlMatch = (tab.url || '').toLowerCase().includes(query);
      if (titleMatch || urlMatch) {
        row.hidden = false;
        visibleTabs++;
        const titleEl = row.querySelector('.item-title');
        const urlEl = row.querySelector('.item-url');
        if (titleEl) {
          titleEl.textContent = '';
          titleEl.appendChild(buildHighlightedText(tab.title || tab.url || 'Untitled tab', query));
        }
        if (urlEl) {
          urlEl.textContent = '';
          urlEl.appendChild(buildHighlightedText(tab.url || '', query));
        }
      } else {
        row.hidden = true;
      }
    }

    const countBadge = openTabsSection.querySelector('#' + OPEN_TABS_COUNT_ID);
    if (countBadge) {
      countBadge.textContent = String(query ? visibleTabs : _cachedOpenTabs.length);
    }

    /* AC11: hide section entirely when filter hides every row. Show again on clear. */
    if (!query) {
      openTabsSection.hidden = false;
      /* Empty-state only re-appears when there are no tabs at all. */
      _toggleOpenTabsEmpty(openTabsSection, _cachedOpenTabs.length === 0);
    } else {
      openTabsSection.hidden = visibleTabs === 0;
      /* Hide empty-state during filter — it's reserved for "no tabs at all". */
      const empty = openTabsSection.querySelector('.open-tabs-empty');
      if (empty) empty.hidden = true;
    }

    totalVisible += (query ? visibleTabs : _cachedOpenTabs.length);
  }

  /* B-014 AC11: window-filter constraint. Layered on top of the text filter —
     rows already hidden by the query remain hidden; rows visible to the text
     filter are additionally hidden when their windowId does not match the
     active chip. Saved-item rows with no live claim (no `data-window-id`)
     are hidden under any specific-window filter per AC11. Short-circuit on
     the common case (`_activeWindowFilter === null`) so we don't re-scan the
     DOM on every text-filter keystroke. */
  if (_activeWindowFilter !== null) {
    const wanted = String(_activeWindowFilter);
    let windowVisible = 0;

    /* Saved-item rows. */
    for (const row of itemListEl.querySelectorAll('.item-row[data-item-id]:not([data-live-only])')) {
      if (row.hidden) continue;
      const rowWin = row.dataset.windowId;
      if (!rowWin || rowWin !== wanted) {
        row.hidden = true;
      } else {
        windowVisible++;
      }
    }

    /* Open-tab rows. */
    const openTabsSectionEl = document.getElementById(OPEN_TABS_SECTION_ID);
    if (openTabsSectionEl) {
      let openTabsVisible = 0;
      for (const row of openTabsSectionEl.querySelectorAll('[data-tab-id]')) {
        if (row.hidden) continue;
        if (row.dataset.windowId !== wanted) {
          row.hidden = true;
        } else {
          openTabsVisible++;
          windowVisible++;
        }
      }
      const countBadge = openTabsSectionEl.querySelector('#' + OPEN_TABS_COUNT_ID);
      if (countBadge) countBadge.textContent = String(openTabsVisible);
      if (openTabsVisible === 0) openTabsSectionEl.hidden = true;
    }

    /* Hide group sections that now have zero visible items. */
    for (const section of itemListEl.querySelectorAll('.group-section')) {
      const anyVisible = section.querySelector('[data-item-id]:not([hidden])');
      if (!anyVisible) section.hidden = true;
    }

    totalVisible = windowVisible;
  }

  /* Reset scroll to top on filter apply (AC10) */
  itemListEl.scrollTop = 0;

  /* Show/hide filter empty state */
  filterEmptyStateEl.hidden = (!query && _activeWindowFilter === null) || totalVisible > 0;
  /* Also hide the regular empty state during filter */
  if (query || _activeWindowFilter !== null) emptyStateEl.hidden = true;

  /* Show/hide clear button */
  filterClearBtnEl.hidden = !_filterQuery;
}

/* =========================================================================
   Toast (B-049 — transient error feedback)
   ========================================================================= */

function showToast(message) {
  clearTimeout(_toastTimer);
  toastMessageEl.textContent = message;
  toastEl.hidden = false;
  _toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

toastDismissEl.addEventListener('click', () => {
  clearTimeout(_toastTimer);
  toastEl.hidden = true;
});

/* =========================================================================
   B-093 — Import / Export controls relocated to the Settings page Data
   section. The B-042/B-043 export helpers, B-044/B-045 import flow, the
   destructive-confirmation preview dialog (B-070 §AC4 retained), the
   five-megabyte oversize guard, the in-flight gate, and the four button
   click handlers + two file-input change handlers now live in
   `settings/settings-import-export.js`. The SW message contracts
   (`MSG_EXPORT_COLLECTION` / `MSG_IMPORT_COLLECTION`) are unchanged — only
   the host surface moved.
   ========================================================================= */

/* =========================================================================
   Clear filter helper (B-049 — shared by × button, Escape, and CTA)
   ========================================================================= */

function clearFilter() {
  _filterQuery = '';
  filterInputEl.value = '';
  filterClearBtnEl.hidden = true;
  clearTimeout(_filterTimer);
  applyFilter();
  filterInputEl.focus();
}

/* =========================================================================
   Multi-select helpers (B-024)
   ========================================================================= */

/**
 * B-055: canonical selection keys are prefixed strings to unify saved-item and
 * open-tab entries in a single Set<string>.
 *
 *   item:<uuid>     — saved item row
 *   tab:<number>    — open-tab row (no saved item)
 *
 * Every call site uses `_selectionKeyForRow(row)` to build the key and
 * `_partitionSelection()` to split the Set before dispatching bulk actions.
 */
function _selectionKeyForRow(row) {
  if (row.dataset.liveOnly === 'true' && row.dataset.tabId) {
    return 'tab:' + row.dataset.tabId;
  }
  if (row.dataset.itemId) return 'item:' + row.dataset.itemId;
  return null;
}

function _rowForSelectionKey(key) {
  if (key.startsWith('item:')) {
    return itemListEl.querySelector(`[data-item-id="${CSS.escape(key.slice(5))}"]:not([data-live-only])`);
  }
  if (key.startsWith('tab:')) {
    return itemListEl.querySelector(`[data-tab-id="${CSS.escape(key.slice(4))}"][data-live-only]`);
  }
  return null;
}

/**
 * B-055 M-4: keep `data-selected` and `aria-selected` in sync on every write.
 * `data-selected` drives CSS; `aria-selected` lets screen readers expose the
 * state programmatically.
 *
 * B-048 §31.5: additionally mirror the selection state onto the child
 * `.item-select` element (`aria-checked="true|false"`) so the Gmail-pattern
 * composite `role="checkbox"` descendant is announced correctly.
 *
 * B-048 §31.6: rebuild the row's `aria-label` at every selection change so
 * screen readers hear the current state (AC7 concat order). Reads item
 * metadata from module-level caches — the row's itemId / tabId drives the
 * lookup.
 */
function _setRowSelected(row, selected) {
  if (!row) return;
  if (selected) {
    row.dataset.selected = 'true';
    row.setAttribute('aria-selected', 'true');
  } else {
    delete row.dataset.selected;
    row.removeAttribute('aria-selected');
  }
  const checkbox = row.querySelector('.item-select');
  if (checkbox) {
    checkbox.setAttribute('aria-checked', selected ? 'true' : 'false');
  }
  /* Rebuild the row's aria-label from the freshest caches. Saved-item rows
     carry `data-item-id`; Open Tabs rows carry `data-tab-id`. */
  if (row.dataset.itemId) {
    const id = row.dataset.itemId;
    const item = _itemById.get(id);
    if (item) {
      const live = _cachedLiveStates?.[id];
      const drifted = _cachedDriftRecords?.[id];
      row.setAttribute('aria-label', buildItemRowAriaLabel(item, live, drifted, selected));
    }
  } else if (row.dataset.tabId) {
    const tabId = Number(row.dataset.tabId);
    const tab = _cachedOpenTabsById.get(tabId);
    if (tab) {
      const openTabItem = { title: tab.title || tab.url || 'Untitled tab' };
      const openTabLive = { live: true, active: !!tab.active, audible: !!tab.audible };
      row.setAttribute('aria-label', buildItemRowAriaLabel(openTabItem, openTabLive, false, selected));
    }
  }
}

function _partitionSelection() {
  const itemIds = [];
  const tabIds = [];
  for (const key of _selection) {
    if (key.startsWith('item:')) itemIds.push(key.slice(5));
    else if (key.startsWith('tab:')) tabIds.push(Number(key.slice(4)));
  }
  return { itemIds, tabIds };
}

/**
 * B-051 M-1: prune stale `item:*` keys from _selection prior to a bulk dispatch.
 *
 * We prune only the saved-item partition because open-tab (`tab:*`) entries
 * self-clean via tabs.onRemoved → MSG_STATE_CHANGED re-render; saved items
 * can go stale between user gesture and action dispatch via a concurrent
 * delete broadcast. In-place mutation of the Set keeps _selection as the
 * single source of truth.
 */
function _pruneStaleSelection() {
  /* Extract the item-key partition, feed it through pruneSelection, then
     rebuild the Set keeping every tab key intact. */
  const itemKeys = new Set();
  for (const key of _selection) {
    if (key.startsWith('item:')) itemKeys.add(key.slice(5));
  }
  const pruned = pruneSelection(itemKeys, _cachedItems);
  for (const key of [..._selection]) {
    if (key.startsWith('item:')) {
      const id = key.slice(5);
      if (!pruned.has(id)) _selection.delete(key);
    }
  }
}

/**
 * Update the bulk action bar count, disabled states, and visibility.
 * Called after every selection change.
 */
function _updateBulkBar() {
  const count = _selection.size;
  _selectionMode = count > 0;

  if (!_selectionMode) {
    bulkActionBarEl.hidden = true;
    itemListEl.classList.remove('has-bulk-bar');
    return;
  }

  bulkCountEl.textContent = count + ' selected';
  bulkActionBarEl.hidden = false;
  itemListEl.classList.add('has-bulk-bar');

  /* B-055 AC12: compute valid-action intersection for the current selection. */
  const { itemIds, tabIds } = _partitionSelection();
  const hasItems = itemIds.length > 0;
  const hasTabs = tabIds.length > 0;
  const mixed = hasItems && hasTabs;
  const onlyTabs = hasTabs && !hasItems;

  /* Close: enabled when at least one live target exists (saved-item live row
     or an open-tab row). Open-tab rows always have a live tab by definition. */
  let hasLive = false;
  if (hasTabs) {
    hasLive = true;
  } else {
    for (const id of itemIds) {
      const ls = _cachedLiveStates[id];
      if (ls && ls.live) { hasLive = true; break; }
    }
  }
  bulkCloseBtn.disabled = !hasLive;

  /* Move to group: visible for all-saved or all-open-tab selections, hidden
     for mixed. The mixed-selection "Move to group" hide is intentional —
     see SOLUTION_DESIGN §26.6 "mixed hide" rationale. */
  bulkMoveBtn.hidden = mixed;

  /* Remove: NOT valid for open-tab rows (they have no saved item). Hide when
     any open-tab row is selected, including the mixed case. */
  bulkRemoveBtn.hidden = hasTabs;

  /* AC7 note: the bulk bar is the Move/Close/Remove action set. "Save to group"
     for an all-open-tab selection re-uses the Move button (which dispatches
     MSG_PROMOTE_TAB when the selection is all tabs — see bulkMoveBtn handler). */
  bulkMoveBtn.textContent = onlyTabs ? 'Save to group' : 'Move to group';
}

/**
 * Toggle a single row's selection state. Updates the row attribute and the bar.
 * B-024 H-3: writes the range anchor (single source of truth for range-select).
 */
function _toggleSelection(key) {
  const row = _rowForSelectionKey(key);
  if (_selection.has(key)) {
    _selection.delete(key);
    _setRowSelected(row, false);
  } else {
    _selection.add(key);
    _setRowSelected(row, true);
  }
  _lastSelectedId = key;
  _rangeAnchorId = key;
  _updateBulkBar();
}

/**
 * Range-select all visible rows between _rangeAnchorId and targetKey (inclusive).
 * Traverses saved-item AND open-tab rows in DOM order so a Shift+Click can
 * span the two row families (AC12 "mixed selection").
 */
function _rangeSelect(targetKey) {
  const rows = [...itemListEl.querySelectorAll('[data-item-id]:not([hidden]), [data-tab-id]:not([hidden])')];
  const keys = rows.map(_selectionKeyForRow);
  const startIdx = keys.indexOf(_rangeAnchorId);
  const endIdx = keys.indexOf(targetKey);
  if (startIdx === -1 || endIdx === -1) return;
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  for (let i = lo; i <= hi; i++) {
    if (!keys[i]) continue;
    _selection.add(keys[i]);
    _setRowSelected(rows[i], true);
  }
  _updateBulkBar();
}

/**
 * Select all visible rows (saved-item + open-tab).
 * B-024 H-3: writes the range anchor to the last visible row.
 */
function _selectAll() {
  const rows = itemListEl.querySelectorAll('[data-item-id]:not([hidden]), [data-tab-id]:not([hidden])');
  for (const row of rows) {
    const key = _selectionKeyForRow(row);
    if (!key) continue;
    _selection.add(key);
    _setRowSelected(row, true);
  }
  if (rows.length > 0) {
    const lastKey = _selectionKeyForRow(rows[rows.length - 1]);
    _lastSelectedId = lastKey;
    _rangeAnchorId = lastKey;
  }
  _updateBulkBar();
}

/**
 * Clear all selection state.
 * B-024 H-3: reset the range anchor alongside the selection set.
 *
 * B-029 security-reviewer M-3: does NOT touch the group picker here. The
 * picker is a dialog (not a context menu) and must survive selection-clear
 * flows — in particular the B-027 "Move items out of group" path opens the
 * picker without ever mutating _selection, and post-op bulk-move success
 * paths call _clearSelection() AFTER the picker has already closed itself.
 * Escape-inside-picker is owned by the picker's own capture-phase keydown
 * handler, and bulkClearBtn is never reachable while the overlay is shown
 * (focus-trap). Dropping the closeGroupPickerDialog() call here prevents
 * a future broadcast-driven _clearSelection() from stealing an open picker.
 */
function _clearSelection() {
  for (const key of _selection) {
    const row = _rowForSelectionKey(key);
    _setRowSelected(row, false);
  }
  _selection.clear();
  _lastSelectedId = null;
  _rangeAnchorId = null;
  _updateBulkBar();
}

/**
 * After renderAll() rebuilds the DOM, re-apply data-selected from the Set
 * and prune any keys that no longer resolve to a row (stale items, closed tabs).
 */
function _reapplySelection() {
  const toRemove = [];
  const liveTabIds = new Set(_cachedOpenTabs.map((t) => t.tabId));
  for (const key of _selection) {
    if (key.startsWith('item:')) {
      const id = key.slice(5);
      if (!_itemById.has(id)) { toRemove.push(key); continue; }
      const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]:not([data-live-only])`);
      _setRowSelected(row, true);
    } else if (key.startsWith('tab:')) {
      const tabId = Number(key.slice(4));
      if (!liveTabIds.has(tabId)) { toRemove.push(key); continue; }
      const row = itemListEl.querySelector(`[data-tab-id="${CSS.escape(String(tabId))}"][data-live-only]`);
      _setRowSelected(row, true);
    } else {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) _selection.delete(key);
  _updateBulkBar();
}

/* =========================================================================
   Rendering
   ========================================================================= */

function renderAll(items, groups, liveStates, driftRecords, openTabs) {
  /* Cache data for filter (B-021) */
  _cachedItems = items;
  _cachedItemsGen += 1;
  _cachedGroups = groups;
  _cachedGroupsGen += 1;
  _cachedLiveStates = liveStates || {};
  _cachedDriftRecords = driftRecords || {};
  _setCachedOpenTabs(openTabs);
  _itemById = new Map(items.map((it) => [it.id, it]));

  /* B-055 AC4: the empty state only shows when NOTHING qualifies — no saved
     items, no groups, AND no open tabs. If open tabs exist we still need the
     list container visible so the section can mount. */
  if (!items.length && !groups.length && _cachedOpenTabs.length === 0) {
    skeletonEl.hidden = true;
    emptyStateEl.hidden = false;
    errorStateEl.hidden = true;
    itemListEl.hidden = true;
    panelHeaderEl.hidden = true;
    return;
  }

  /* Map items by groupId */
  const byGroup = new Map();
  for (const item of items) {
    const gid = item.groupId ?? null;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(item);
  }

  /* Sort items within each group by sortOrder */
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  /* Separate root groups and sub-groups */
  const rootGroups = [];
  const childGroupsByParent = new Map();

  const sortedGroups = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const g of sortedGroups) {
    if (g.parentId) {
      if (!childGroupsByParent.has(g.parentId)) childGroupsByParent.set(g.parentId, []);
      childGroupsByParent.get(g.parentId).push(g);
    } else {
      rootGroups.push(g);
    }
  }

  const fragment = document.createDocumentFragment();

  /* Render root groups (B6 — child groups nested inside parent's itemsContainer) */
  for (const group of rootGroups) {
    const section = buildGroupSection(group, byGroup, liveStates, driftRecords, false);

    /* Nest child groups inside parent's .group-items container */
    const children = childGroupsByParent.get(group.id);
    if (children) {
      const parentItems = section.querySelector('.group-items');
      for (const child of children) {
        const childSection = buildGroupSection(child, byGroup, liveStates, driftRecords, true);
        parentItems.appendChild(childSection);
      }
    }

    fragment.appendChild(section);
  }

  /* Ungrouped items (W2 — uses unified buildGroupSection) */
  const ungrouped = byGroup.get(null);
  if (ungrouped && ungrouped.length) {
    const syntheticGroup = {
      id: '__ungrouped__',
      name: 'Ungrouped',
      color: 'slate',
      collapsed: collapsedGroups.has('__ungrouped__'),
    };
    /* Temporarily place ungrouped items under the synthetic id for buildGroupSection */
    byGroup.set('__ungrouped__', ungrouped);
    const section = buildGroupSection(syntheticGroup, byGroup, liveStates, driftRecords, false);
    fragment.appendChild(section);
  }

  /* B-055 AC4: Open Tabs section is always last, always mounted. */
  fragment.appendChild(buildOpenTabsSection(_cachedOpenTabs));

  itemListEl.replaceChildren(fragment);
  itemListEl.appendChild(dropIndicatorEl);
  /* B-030 v2 — mount the item-drag indicator. Lives as a stable child of
     itemListEl; moved via CSS transform only (never reparented). */
  itemListEl.appendChild(itemDragIndicatorEl);
  /* B-031 — mount the group-drag REORDER indicator. Same stable-child
     pattern as the item indicator; moved via transform only. */
  itemListEl.appendChild(groupReorderIndicatorEl);
  skeletonEl.hidden = true;
  emptyStateEl.hidden = true;
  errorStateEl.hidden = true;
  itemListEl.hidden = false;
  panelHeaderEl.hidden = false;

  /* B-052 §34.3: rebuild the search index from the freshly rendered items
     array. Safe to call unconditionally — cheap (≈2–5 ms at 500 items) and
     the module-level gate + try/catch keep the error surface minimal. */
  if (SEARCH_INDEX_ENABLED) {
    try {
      _searchIndex = buildIndex(items);
      _searchIndexDisabled = false;
    } catch (err) {
      console.warn('[tab-junkie:b052] index rebuild failed; linear-scan fallback active');
      _searchIndex = null;
      _searchIndexDisabled = true;
    }
  }

  /* Re-apply active filter after DOM rebuild (B-021).
     B-014 H-2: also re-apply when a window chip is active but no text query —
     otherwise a broadcast-driven renderAll restores all rows while the chip
     visually remains selected. */
  if (_filterQuery || _activeWindowFilter !== null) applyFilter();

  /* Re-apply selection after DOM rebuild (B-024) */
  _reapplySelection();
}

/* --- Group section (W2 — unified, handles both real + ungrouped) ------- */

function buildGroupSection(group, byGroup, liveStates, driftRecords, isChild) {
  const section = document.createElement('div');
  section.className = 'group-section' + (isChild ? ' group-section--child' : '');
  section.setAttribute('role', 'listitem');

  const groupItems = byGroup.get(group.id) || [];
  const collapsed = collapsedGroups.has(group.id);
  section.dataset.itemCount = groupItems.length;

  /* Header */
  const header = document.createElement('div');
  header.className = 'group-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(!collapsed));
  header.setAttribute('aria-controls', 'group-items-' + group.id);
  header.dataset.groupId = group.id;

  /* B-008: Drag handle + draggable for real groups only */
  if (group.id !== '__ungrouped__') {
    const handle = document.createElement('div');
    handle.className = 'group-drag-handle';
    handle.tabIndex = 0;
    handle.setAttribute('aria-label', 'Reorder group');
    handle.setAttribute('title', 'Drag to reorder or nest (keyboard reorder not yet available)');
    handle.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="5" cy="12" r="1.5"/><circle cx="11" cy="4" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="11" cy="12" r="1.5"/></svg>';
    header.prepend(handle);

    section.draggable = true;
    section.dataset.groupId = group.id;
    section.dataset.sortOrder = group.sortOrder ?? 0;
  }

  /* Collapse icon */
  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'group-header-collapse';
  collapseIcon.setAttribute('aria-hidden', 'true');
  collapseIcon.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* Color chip */
  const chip = document.createElement('span');
  chip.className = 'group-color-chip';
  if (GROUP_COLORS.includes(group.color)) {
    chip.classList.add('group-color-' + group.color);
  }

  /* Name */
  const name = document.createElement('span');
  name.className = 'group-header-name';
  name.textContent = group.name;

  /* Count */
  const count = document.createElement('span');
  count.className = 'group-header-count';
  count.textContent = String(groupItems.length);

  header.appendChild(collapseIcon);
  header.appendChild(chip);
  header.appendChild(name);
  header.appendChild(count);
  section.appendChild(header);

  /* Items container */
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'group-items';
  itemsContainer.id = 'group-items-' + group.id;
  if (collapsed) itemsContainer.hidden = true;

  for (const item of groupItems) {
    itemsContainer.appendChild(buildItemRow(item, liveStates, driftRecords));
  }

  /* B-049: Inline empty state for groups with zero items */
  if (groupItems.length === 0 && !_filterQuery) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'group-items-empty';
    emptyEl.setAttribute('role', 'status');
    emptyEl.setAttribute('aria-live', 'polite');

    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.classList.add('group-items-empty-icon');
    icon.setAttribute('width', '16');
    icon.setAttribute('height', '16');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M2 3h12v10H2V3zm0 2h12M5 1v2m6-2v2');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    icon.appendChild(path);

    const msg = document.createElement('span');
    msg.textContent = 'No bookmarks in this group yet';

    emptyEl.appendChild(icon);
    emptyEl.appendChild(msg);
    itemsContainer.appendChild(emptyEl);
  }

  section.appendChild(itemsContainer);
  return section;
}

/* --- Indicator icon factories (H-1: single source of truth) ----------- */

function _createAudibleIcon() {
  const span = document.createElement('span');
  span.className = 'item-audible-icon';
  /* B-048 AC7: the row-level `aria-label` (built by `buildItemRowAriaLabel`)
     is now authoritative for screen-reader state announcements. Per-icon
     `aria-label` would cause duplicate announcements, so the icon is hidden
     from AT. */
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 5h2l3-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 010 5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
  return span;
}

function _createDriftedIcon() {
  const span = document.createElement('span');
  span.className = 'item-drifted-icon';
  /* B-048 AC7: see `_createAudibleIcon` — row-level `aria-label` carries
     the drift state. Icon is visual-only for AT. */
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1l6 11H1L7 1z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/><path d="M7 5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="10" r="0.8" fill="currentColor"/></svg>';
  return span;
}

/**
 * B-048 §31.5: Build the `.item-select` checkbox child — the real DOM
 * affordance that replaces the old `[data-selected="true"]::before`
 * pseudo-element.
 *
 * Contract:
 *  - `role="checkbox"` with `aria-checked="true|false"` mirrored from
 *    the row's `data-selected` state by `_setRowSelected` (state owner).
 *  - `tabindex="-1"` — not a tab-stop; the row's Space/Enter handler
 *    remains the activation path (B-024, Gmail pattern).
 *  - `aria-hidden="true"` — the row-level `aria-label` already announces
 *    ", selected" via `buildItemRowAriaLabel`, so hiding the child from
 *    AT prevents double-announcement in browse-mode screen readers
 *    (fix M-1, matches the Gmail pattern referenced in §31.5).
 *  - Layout slot is reserved at all times via CSS — hover-reveal never
 *    triggers reflow (AC6).
 *
 * `selected` is passed through at build time so the correct `aria-checked`
 * lands on first DOM insertion — prevents a sub-frame AT race when a row
 * is rebuilt for an already-selected item (fix Q-M4).
 */
function _createItemSelect(selected) {
  const span = document.createElement('span');
  span.className = 'item-select';
  span.setAttribute('role', 'checkbox');
  span.setAttribute('aria-checked', selected ? 'true' : 'false');
  span.setAttribute('tabindex', '-1');
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/* B-065: `_buildItemRowAriaLabel` extracted to `shared/aria-label.js` and
   imported as `buildItemRowAriaLabel` near the top of the file. The six
   call sites below invoke the shared helper directly. */

/* --- Item row ---------------------------------------------------------- */

function buildItemRow(item, liveStates, driftRecords) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.setAttribute('role', 'listitem');
  row.setAttribute('tabindex', '0');
  row.dataset.itemId = item.id;
  /* B-030 v2 AC1 — rows are draggable. AC12 a11y disclosure via title. */
  row.draggable = true;
  row.title = 'Drag to reorder (keyboard reorder not yet available)';

  const live = liveStates?.[item.id];
  const drifted = driftRecords?.[item.id];

  /* B-048 §31.2 note: `buildItemRow` assumes a freshly-constructed <div>
     (no stale state possible at first paint), so guarded-assign is safe.
     The symmetric patch path `refetchAndPatchLiveState` uses the proper
     `if ... else delete` pattern. */
  if (live?.live) row.dataset.live = 'true';
  if (live?.active) row.dataset.active = 'true';
  if (live?.audible) row.dataset.audible = 'true';
  if (drifted) row.dataset.drifted = 'true';
  /* B-014: stamp the row's windowId when a live claim exists so applyFilter
     (§28.5.2) can gate visibility on `_activeWindowFilter`. Absent when the
     item has no live claim. */
  if (live?.live && live?.windowId != null) {
    row.dataset.windowId = String(live.windowId);
  }

  /* B-048 §31.5: prepend the checkbox affordance BEFORE any other flex child
     so it occupies the first slot visually. `_setRowSelected` keeps the
     `aria-checked` mirror in sync on every selection change.
     Q-M4: mirror the open-tab path — compute `isSelected` at build time so a
     rebuild for an already-selected item lands the correct attributes on
     first DOM insertion. `_reapplySelection` still runs after renderAll; it
     is a no-op when the row was already selected here. */
  const isSelected = _selection.has('item:' + item.id);
  row.appendChild(_createItemSelect(isSelected));
  if (isSelected) {
    row.dataset.selected = 'true';
    row.setAttribute('aria-selected', 'true');
  }

  /* B-004: favicon from live tab state, letter-avatar fallback */
  const favIconUrl = liveStates?.[item.id]?.favIconUrl;
  if (isSafeFaviconUrl(favIconUrl)) {
    const img = document.createElement('img');
    img.className = 'item-favicon';
    img.alt = '';
    img.src = favIconUrl;
    img.onerror = () => {
      const fallback = document.createElement('div');
      fallback.className = 'item-avatar';
      const fbLetter = (item.title || '?').charAt(0);
      fallback.textContent = fbLetter;
      fallback.style.backgroundColor = avatarColor(item.title || '');
      img.replaceWith(fallback);
    };
    row.appendChild(img);
  } else {
    const avatar = document.createElement('div');
    avatar.className = 'item-avatar';
    const letter = (item.title || '?').charAt(0);
    avatar.textContent = letter;
    avatar.style.backgroundColor = avatarColor(item.title || '');
    row.appendChild(avatar);
  }

  /* Text block */
  const textBlock = document.createElement('div');
  textBlock.className = 'item-text';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = item.title || 'Untitled';

  const url = document.createElement('div');
  url.className = 'item-url';
  url.textContent = item.url || '';

  textBlock.appendChild(title);
  textBlock.appendChild(url);
  row.appendChild(textBlock);

  /* Indicators — only create when state is active */
  const needsAudible = live?.audible;
  const needsDrifted = !!drifted;
  /* B-014: cross-window badge is needed when the claim lives in another
     window than this sidepanel. */
  const needsWindowBadge = live?.live
    && live?.windowId != null
    && (_panelWindowId == null || live.windowId !== _panelWindowId);

  if (needsAudible || needsDrifted || needsWindowBadge) {
    const indicators = document.createElement('div');
    indicators.className = 'item-indicators';

    /* B-014: window badge is prepended (reads naturally as "W2 [audio] [drift]"). */
    if (needsWindowBadge) {
      _renderWindowBadge(indicators, live.windowId, ITEM_WINDOW_BADGE_CLASS);
    }

    if (needsAudible) {
      indicators.appendChild(_createAudibleIcon());
    }

    if (needsDrifted) {
      indicators.appendChild(_createDriftedIcon());
    }

    row.appendChild(indicators);
  }

  const actions = document.createElement('div');
  actions.className = 'item-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'item-action-btn item-action-edit';
  editBtn.setAttribute('aria-label', 'Edit bookmark');
  editBtn.dataset.action = 'edit';
  editBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9.5 2.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'item-action-btn item-action-delete';
  deleteBtn.setAttribute('aria-label', 'Delete bookmark');
  deleteBtn.dataset.action = 'delete';
  deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 3.5h10M5.5 3.5V2h3v1.5M5 5.5v5M9 5.5v5M3.5 3.5l.5 8h6l.5-8" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  row.appendChild(actions);

  /* B-048 AC7: deterministic screen-reader label per `buildItemRowAriaLabel`
     contract. Q-M4: use the computed `isSelected` above so a rebuild for
     an already-selected item emits the correct ", selected" suffix on
     first paint without waiting for `_reapplySelection`. */
  row.setAttribute('aria-label', buildItemRowAriaLabel(item, live, drifted, isSelected));

  return row;
}

/* =========================================================================
   B-052 — Targeted DOM patch path (AC5).
   Called from the `scope: 'items'` broadcast branch when `diffAndPatch`
   reports a small delta. §34.7 spells out the contract:
     - added   → build one row via `buildItemRow` and insert at the correct
                 sortOrder position within its group section.
     - removed → remove the row from DOM.
     - updated → rebuild the row in place (covers title/url/groupId edits
                 + live-state changes; cheaper than per-field text patches
                 given how much attribute/indicator logic `buildItemRow`
                 already encodes).
   After the patch the active filter is re-applied to the affected row set
   so a search query stays sticky across single-item edits.
   ========================================================================= */

/**
 * Find or create the `.group-items` container for a given groupId.
 * Returns null when the group section hasn't been rendered yet
 * (e.g. a new item in an empty group created in the same broadcast) —
 * caller falls through to `renderAll` in that case.
 *
 * @param {string|null} groupId
 * @returns {HTMLElement|null}
 */
function _findGroupItemsContainer(groupId) {
  const id = groupId == null ? '__ungrouped__' : groupId;
  return itemListEl.querySelector('#group-items-' + CSS.escape(id));
}

/**
 * Apply a single-item DOM patch keyed by `change.id` + `change.kind`.
 * Assumes `_cachedItems`, `_itemById`, `_cachedLiveStates`, and
 * `_cachedDriftRecords` have already been updated to the post-broadcast
 * snapshot so any downstream reads land on fresh state.
 *
 * Returns `true` when the patch lands; `false` when the caller should
 * fall through to `renderAll` (e.g. a new row's target group section
 * doesn't exist yet).
 *
 * @param {{ id: string, kind: 'added'|'removed'|'updated' }} change
 * @returns {boolean}
 */
function _patchSingleRow(change) {
  const { id, kind } = change;

  if (kind === 'removed') {
    const row = itemListEl.querySelector(
      '.item-row[data-item-id="' + CSS.escape(id) + '"]'
    );
    if (!row) return true; /* already gone; nothing to patch */
    /* Prune from selection before detaching. */
    _selection.delete('item:' + id);
    row.remove();
    return true;
  }

  const item = _itemById.get(id);
  if (!item) return false; /* impossible unless caches drifted; fall through */

  if (kind === 'added') {
    const container = _findGroupItemsContainer(item.groupId);
    if (!container) return false;
    const freshRow = buildItemRow(item, _cachedLiveStates, _cachedDriftRecords);
    /* Insert at the correct sortOrder position within the container so the
       visible order matches `renderAll`'s ascending-sortOrder sort. Skip
       rows inside nested child sections while seeking the insertion point —
       a sub-group lives at a different sortOrder namespace. */
    const siblings = container.querySelectorAll(':scope > .item-row[data-item-id]');
    const freshOrder = item.sortOrder ?? 0;
    let inserted = false;
    for (const sib of siblings) {
      const sibItem = _itemById.get(sib.dataset.itemId);
      const sibOrder = sibItem?.sortOrder ?? 0;
      if (sibOrder > freshOrder) {
        container.insertBefore(freshRow, sib);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      /* Append before any child group section so empty-state divs and
         child-section placement stay untouched. */
      const childSection = container.querySelector(':scope > .group-section');
      if (childSection) container.insertBefore(freshRow, childSection);
      else container.appendChild(freshRow);
    }
    /* Caller (broadcast dispatch) re-applies the active filter once after
       all patches land — don't thrash applyFilter per-patch. */
    return true;
  }

  /* kind === 'updated' — swap the row in place. A cross-group move (groupId
     change without add/remove) reaches this branch with the row still parented
     by the OLD group's container. replaceWith would leave the row at the old
     DOM position, diverging from the group-items layout until the next
     renderAll. Detect the mismatch here and signal a full rebuild — the
     patcher cannot reparent without re-sorting the destination container
     against fresh sortOrder, which is cheaper to do in renderAll. */
  const existing = itemListEl.querySelector(
    '.item-row[data-item-id="' + CSS.escape(id) + '"]'
  );
  if (!existing) return false;
  const expectedContainer = _findGroupItemsContainer(item.groupId);
  if (!expectedContainer || !expectedContainer.contains(existing)) {
    return false; /* Cross-group move — caller falls through to renderAll. */
  }
  const freshRow = buildItemRow(item, _cachedLiveStates, _cachedDriftRecords);
  existing.replaceWith(freshRow);
  /* Caller handles applyFilter after all patches — see 'added' branch. */
  return true;
}

/* =========================================================================
   Open Tabs section (B-055)
   ========================================================================= */

const OPEN_TABS_SECTION_ID = 'open-tabs-section';
const OPEN_TABS_LIST_ID = 'open-tabs-list';
const OPEN_TABS_COUNT_ID = 'open-tabs-count';
const OPEN_TABS_EMPTY_ID = 'open-tabs-empty';

function _buildOpenTabFavicon(tab) {
  if (isSafeFaviconUrl(tab.favIconUrl)) {
    const img = document.createElement('img');
    img.className = 'item-favicon';
    img.alt = '';
    img.src = tab.favIconUrl;
    const fallbackLabel = tab.title || tab.url || '?';
    img.onerror = () => {
      const fallback = document.createElement('div');
      fallback.className = 'item-avatar';
      fallback.textContent = fallbackLabel.charAt(0);
      fallback.style.backgroundColor = avatarColor(fallbackLabel);
      img.replaceWith(fallback);
    };
    return img;
  }
  const avatar = document.createElement('div');
  avatar.className = 'item-avatar';
  const label = tab.title || tab.url || '?';
  avatar.textContent = label.charAt(0);
  avatar.style.backgroundColor = avatarColor(label);
  return avatar;
}

/* B-014: resolve a rawWindowId to the session ordinal label (e.g. "W2").
 * Falls back to the raw id when the ordinal map has not arrived yet — a
 * "W<rawId>" badge is strictly better than no badge for the sub-second window
 * before the next MSG_LIST_ITEMS response patches it. */
function _windowOrdinalLabel(rawWindowId) {
  const ord = _windowOrdinalMap[String(rawWindowId)];
  if (typeof ord === 'number') return { label: 'W' + ord, aria: 'Window ' + ord };
  return { label: 'W' + rawWindowId, aria: 'Window ' + rawWindowId };
}

/**
 * B-014: render or patch the cross-window badge for a row.
 * Rules:
 *  - No badge when `rawWindowId == null`, or when it equals `_panelWindowId`
 *    (same-window rows never show a badge per AC4).
 *  - Otherwise render `W<ordinal>` using `_windowOrdinalMap`.
 *
 * `badgeClass` lets saved-item and open-tab rows use different class names
 * so per-row-type CSS can diverge. The helper creates the badge via
 * `textContent` — rawWindowIds are integers so not a security surface, but
 * the contract is preserved for consistency with other untrusted-string paths.
 *
 * @param {HTMLElement} indicatorsEl — the `.item-indicators` container
 * @param {number|null|undefined} rawWindowId
 * @param {string} badgeClass — `'open-tab-window-badge'` or `'item-window-badge'`
 */
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
    badge = document.createElement('span');
    badge.className = badgeClass;
    indicatorsEl.prepend(badge);
  }
  if (badge.textContent !== label) badge.textContent = label;
  badge.setAttribute('aria-label', aria);
}

/* B-014: saved-item rows use `.item-window-badge`; open-tab rows use
 * `.open-tab-window-badge`. Both resolve through `_renderWindowBadge`. */
const ITEM_WINDOW_BADGE_CLASS = 'item-window-badge';
const OPEN_TAB_WINDOW_BADGE_CLASS = 'open-tab-window-badge';

/**
 * Build a single Open Tabs row. Uses textContent everywhere — tab titles and
 * URLs are untrusted per the security review.
 *
 * B-014: the window badge is rendered via `_renderWindowBadge` which
 * suppresses the badge when `tab.windowId === _panelWindowId` (AC4). The
 * multi-window / single-window visibility is therefore a per-row decision,
 * not a section-level decision — legacy `multiWindow` flag kept for caller
 * compatibility but ignored by the badge path.
 */
/* B-061: `isUnsavableScheme` is imported from shared/url.js — single source of
   truth, colocated with `ALLOWED_URL_SCHEMES` so the deny/allow pair cannot
   drift silently. */
function buildOpenTabRow(tab /* , { multiWindow } */) {
  const row = document.createElement('li');
  row.className = 'item-row';
  row.setAttribute('role', 'listitem');
  row.setAttribute('tabindex', '0');
  row.dataset.liveOnly = 'true';
  row.dataset.tabId = String(tab.tabId);
  row.dataset.windowId = String(tab.windowId);
  row.dataset.live = 'true';
  if (tab.active) row.dataset.active = 'true';
  if (tab.audible) row.dataset.audible = 'true';
  if (isUnsavableScheme(tab.url)) {
    row.dataset.unsavable = 'true';
    row.title = 'Cannot be saved \u2014 unsupported URL scheme.';
  }

  /* B-048 §31.5: Open Tabs rows participate in multi-select (B-055 AC12),
     so they get the same `.item-select` checkbox affordance as saved-item
     rows. Prepended before the favicon.

     Q-M4: compute `isSelected` from the selection set at build time so the
     correct `aria-checked` / `data-selected` / `aria-selected` land on
     first DOM insertion — patchOpenTabsSection re-applies via
     `_setRowSelected`, but that runs AFTER insertion and creates a
     sub-frame window where AT sees `aria-checked="false"`. */
  const isSelected = _selection.has('tab:' + tab.tabId);
  row.appendChild(_createItemSelect(isSelected));
  if (isSelected) {
    row.dataset.selected = 'true';
    row.setAttribute('aria-selected', 'true');
  }

  row.appendChild(_buildOpenTabFavicon(tab));

  const textBlock = document.createElement('div');
  textBlock.className = 'item-text';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = tab.title || tab.url || 'Untitled tab';

  const url = document.createElement('div');
  url.className = 'item-url';
  url.textContent = tab.url || '';

  textBlock.appendChild(title);
  textBlock.appendChild(url);
  row.appendChild(textBlock);

  /* Indicators column: window badge + audible icon. Badge is suppressed per-row
     when the tab's window matches the sidepanel's own window. */
  const indicators = document.createElement('div');
  indicators.className = 'item-indicators';
  _renderWindowBadge(indicators, tab.windowId, OPEN_TAB_WINDOW_BADGE_CLASS);
  if (tab.audible) indicators.appendChild(_createAudibleIcon());
  if (indicators.children.length > 0) row.appendChild(indicators);

  /* B-048 AC7: Open Tabs rows are always `live` (they ARE the open tabs) and
     never `drifted` (no saved-URL to drift from). Build the aria-label from
     the tab shape — `active`/`audible` flow through the same helper.
     Q-M4: pass `isSelected` (computed above) so the label reflects the
     selection state at first paint, consistent with `aria-checked`. */
  const openTabItem = { title: tab.title || tab.url || 'Untitled tab' };
  const openTabLive = { live: true, active: !!tab.active, audible: !!tab.audible };
  row.setAttribute('aria-label', buildItemRowAriaLabel(openTabItem, openTabLive, false, isSelected));

  return row;
}

/**
 * Build the Open Tabs section — always mounted (AC4).
 * Uses a <section> for the region role (AC15).
 * B-055 H-2 fix: the parent `#item-list` carries `role="list"`, whose children
 * must be `role="listitem"`. Wrap the `<section>` in a listitem div so the
 * outer wrapper satisfies the list-membership contract while the inner
 * section remains the ARIA landmark.
 */
function buildOpenTabsSection(openTabs) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('role', 'listitem');
  wrapper.className = 'open-tabs-wrapper';

  const section = document.createElement('section');
  section.id = OPEN_TABS_SECTION_ID;
  section.className = 'open-tabs-section';
  section.setAttribute('role', 'region');
  section.setAttribute('aria-label', 'Open Tabs');

  const header = document.createElement('div');
  header.className = 'group-header open-tabs-header';
  header.setAttribute('role', 'heading');
  header.setAttribute('aria-level', '2');

  const name = document.createElement('span');
  name.className = 'group-header-name';
  name.textContent = 'Open Tabs';

  const count = document.createElement('span');
  count.id = OPEN_TABS_COUNT_ID;
  count.className = 'group-header-count';
  count.textContent = String(openTabs.length);
  count.setAttribute('aria-live', 'polite');

  header.appendChild(name);
  header.appendChild(count);
  section.appendChild(header);

  const list = document.createElement('ul');
  list.id = OPEN_TABS_LIST_ID;
  list.className = 'open-tabs-list';
  list.setAttribute('role', 'list');

  /* B-014: window badge visibility is now a per-row function of
     `_panelWindowId` (resolved inside `_renderWindowBadge`). No need to
     compute a section-level `multiWindow` flag. */
  for (const tab of openTabs) {
    list.appendChild(buildOpenTabRow(tab));
  }
  section.appendChild(list);

  /* AC10 empty state */
  const empty = document.createElement('div');
  empty.id = OPEN_TABS_EMPTY_ID;
  empty.className = 'open-tabs-empty';
  empty.setAttribute('role', 'status');
  empty.setAttribute('aria-live', 'polite');
  const emptyMsg = document.createElement('span');
  emptyMsg.textContent = 'No untracked tabs — all open tabs are saved or grouped';
  empty.appendChild(emptyMsg);
  section.appendChild(empty);

  _toggleOpenTabsEmpty(section, openTabs.length === 0);

  wrapper.appendChild(section);
  return wrapper;
}

function _toggleOpenTabsEmpty(sectionEl, isEmpty) {
  if (!sectionEl) return;
  const list = sectionEl.querySelector('.open-tabs-list');
  const empty = sectionEl.querySelector('.open-tabs-empty');
  if (list) list.hidden = isEmpty;
  if (empty) empty.hidden = !isEmpty;
}

/**
 * Targeted DOM diff for the Open Tabs section (AC8 / AC16).
 * Full re-renders on every liveState broadcast would be expensive at 50 rows.
 * This keyed diff removes, inserts, and patches individual rows only.
 */
function patchOpenTabsSection(nextOpenTabs) {
  const section = document.getElementById(OPEN_TABS_SECTION_ID);
  if (!section) return;

  const list = section.querySelector('.open-tabs-list');
  const countBadge = section.querySelector('#' + OPEN_TABS_COUNT_ID);
  if (!list) return;

  /* Index existing rows by tabId */
  const existing = new Map();
  for (const row of list.children) {
    const tabId = Number(row.dataset.tabId);
    if (!Number.isNaN(tabId)) existing.set(tabId, row);
  }

  const nextById = new Map();
  for (const tab of nextOpenTabs) nextById.set(tab.tabId, tab);

  /* Remove rows that no longer qualify */
  for (const [tabId, row] of existing) {
    if (!nextById.has(tabId)) {
      row.remove();
      existing.delete(tabId);
    }
  }

  /* Walk the sorted next array and ensure DOM matches order. */
  for (let i = 0; i < nextOpenTabs.length; i++) {
    const tab = nextOpenTabs[i];
    let row = existing.get(tab.tabId);
    if (row) {
      _patchOpenTabRow(row, tab);
    } else {
      row = buildOpenTabRow(tab);
    }
    /* Insert at sorted-position index (AC9). */
    const currentChild = list.children[i];
    if (currentChild !== row) {
      list.insertBefore(row, currentChild || null);
    }
  }

  /* Pop any extra trailing children (defensive — should be rare). */
  while (list.children.length > nextOpenTabs.length) {
    list.lastElementChild.remove();
  }

  if (countBadge) countBadge.textContent = String(nextOpenTabs.length);
  _toggleOpenTabsEmpty(section, nextOpenTabs.length === 0);

  /* Re-apply selection on any freshly-inserted rows. */
  for (const tab of nextOpenTabs) {
    const key = 'tab:' + tab.tabId;
    if (_selection.has(key)) {
      const row = list.querySelector(`[data-tab-id="${CSS.escape(String(tab.tabId))}"]`);
      _setRowSelected(row, true);
    }
  }
}

/**
 * Patch a single existing Open Tabs row with new field values.
 * Touches only the attributes and text that changed.
 *
 * B-014: window badge rendering is delegated to `_renderWindowBadge`, which
 * handles create, update, and removal in one call. The legacy `multiWindow`
 * flag is ignored — badge visibility is a per-row function of `_panelWindowId`.
 */
function _patchOpenTabRow(row, tab /* , { multiWindow } */) {
  if (tab.active) row.dataset.active = 'true'; else delete row.dataset.active;
  if (tab.audible) row.dataset.audible = 'true'; else delete row.dataset.audible;
  if (tab.windowId != null) row.dataset.windowId = String(tab.windowId);

  /* B-061: re-evaluate unsavable scheme on URL change (navigation moves a tab
     from `javascript:` / `data:` to http(s) or vice versa). */
  if (isUnsavableScheme(tab.url)) {
    row.dataset.unsavable = 'true';
    row.title = 'Cannot be saved \u2014 unsupported URL scheme.';
  } else {
    delete row.dataset.unsavable;
    row.removeAttribute('title');
  }

  /* Favicon swap */
  const existingImg = row.querySelector('.item-favicon');
  const existingAvatar = row.querySelector('.item-avatar');
  const faviconOk = isSafeFaviconUrl(tab.favIconUrl);
  if (faviconOk && existingImg) {
    if (existingImg.getAttribute('src') !== tab.favIconUrl) existingImg.src = tab.favIconUrl;
  } else if (faviconOk && existingAvatar) {
    existingAvatar.replaceWith(_buildOpenTabFavicon(tab));
  } else if (!faviconOk && existingImg) {
    existingImg.replaceWith(_buildOpenTabFavicon(tab));
  }

  /* Title and URL — patch only if changed. */
  const titleEl = row.querySelector('.item-title');
  const urlEl = row.querySelector('.item-url');
  const nextTitle = tab.title || tab.url || 'Untitled tab';
  const nextUrl = tab.url || '';
  if (titleEl && titleEl.textContent !== nextTitle) titleEl.textContent = nextTitle;
  if (urlEl && urlEl.textContent !== nextUrl) urlEl.textContent = nextUrl;

  /* Indicators: window badge + audible icon. Create the container lazily
     since the badge or the audible icon may be absent for a given row. */
  let indicators = row.querySelector('.item-indicators');
  const willShowBadge = tab.windowId != null
    && (_panelWindowId == null || tab.windowId !== _panelWindowId);
  const needIndicators = willShowBadge || !!tab.audible;
  if (needIndicators && !indicators) {
    indicators = document.createElement('div');
    indicators.className = 'item-indicators';
    row.appendChild(indicators);
  }
  if (indicators) {
    _renderWindowBadge(indicators, tab.windowId, OPEN_TAB_WINDOW_BADGE_CLASS);

    const existingAudibleIcon = indicators.querySelector('.item-audible-icon');
    if (tab.audible && !existingAudibleIcon) {
      indicators.appendChild(_createAudibleIcon());
    } else if (!tab.audible && existingAudibleIcon) {
      existingAudibleIcon.remove();
    }

    if (indicators.children.length === 0) indicators.remove();
  }

  /* B-048 AC7: rebuild the open-tab row aria-label so screen readers hear
     the current state ensemble (active/audible toggles). Tab rows are
     always live and never drifted — see `buildOpenTabRow` for the shape. */
  const isSelected = _selection.has('tab:' + tab.tabId);
  const openTabItem = { title: tab.title || tab.url || 'Untitled tab' };
  const openTabLive = { live: true, active: !!tab.active, audible: !!tab.audible };
  row.setAttribute('aria-label', buildItemRowAriaLabel(openTabItem, openTabLive, false, isSelected));
}

/* =========================================================================
   B1 — Patch live state without full re-render
   ========================================================================= */

async function refetchAndPatchLiveState() {
  let itemsResp;
  try {
    itemsResp = await sendMessage(MSG_LIST_ITEMS);
  } catch (err) {
    console.warn('[tab-junkie] refetchAndPatchLiveState: MSG_LIST_ITEMS failed, clearing live indicators', err);
    /* B-024 C-1: reset cached live states so _updateBulkBar reflects reality. */
    _cachedLiveStates = {};
    /* B-055: only wipe saved-item row state here. Open Tabs rows live in
       `_cachedOpenTabs`; their teardown happens via patchOpenTabsSection on the
       next successful refetch. */
    for (const row of itemListEl.querySelectorAll('[data-item-id]:not([data-live-only])')) {
      if (!row.isConnected) continue;
      delete row.dataset.live;
      delete row.dataset.active;
      delete row.dataset.audible;
      delete row.dataset.drifted;
      /* B-014: a failed refetch means we don't know the claim's window any
         more — drop the attribute so applyFilter's window-constraint branch
         treats the row as "no live claim" (hidden under a specific filter). */
      delete row.dataset.windowId;
      const indicators = row.querySelector('.item-indicators');
      if (indicators) {
        indicators.replaceChildren();
        indicators.remove();
      }
    }
    _updateBulkBar();
    return;
  }
  const liveStates = itemsResp.liveStates || {};
  const driftRecords = itemsResp.driftRecords || {};
  const itemMap = new Map(itemsResp.items.map((it) => [it.id, it]));
  /* B-024 C-1: reassign module-level caches so _updateBulkBar sees fresh data. */
  _cachedLiveStates = liveStates;
  _cachedDriftRecords = driftRecords;
  /* B-055: keep the Open Tabs cache in sync and apply a targeted DOM diff. */
  _setCachedOpenTabs(itemsResp.openTabs);
  /* B-014: every MSG_LIST_ITEMS carries the current ordinal map. Refresh
     before patching rows so the badge helper resolves ordinals against the
     freshest data. Also refresh `_panelWindowId` to self-heal detached-panel
     moves (AC5). */
  _setWindowOrdinalMap(itemsResp.windowMap || {});
  _refreshPanelWindowId();
  _applyWindowMapToUI();

  /* B-055: if the panel was previously showing the empty state (no DOM list)
     and a tab now qualifies, a targeted patch cannot mount the section — fall
     back to a full renderAll so the section appears. Same escape hatch if the
     Open Tabs section is missing from the DOM for any other reason. */
  const needsFullRender = itemListEl.hidden
    || !document.getElementById(OPEN_TABS_SECTION_ID);
  if (needsFullRender) {
    try {
      const groupsResp = await sendMessage(MSG_LIST_GROUPS);
      renderAll(itemsResp.items, groupsResp, liveStates, driftRecords, _cachedOpenTabs);
      _applyWindowMapToUI();
    } catch (err) {
      console.warn('[tab-junkie] full-render fallback failed', err);
    }
    return;
  }

  patchOpenTabsSection(_cachedOpenTabs);

  /* B-055: saved-item rows only — skip `[data-live-only]` (Open Tabs rows live
     in `_cachedOpenTabs` and are patched separately by `patchOpenTabsSection`). */
  const rows = itemListEl.querySelectorAll('[data-item-id]:not([data-live-only])');
  for (const row of rows) {
    if (!itemListEl.contains(row)) continue; // skip if a concurrent re-render detached this row
    const id = row.dataset.itemId;
    const live = liveStates[id];
    const drifted = driftRecords[id];

    /* Update data attributes */
    if (live?.live) row.dataset.live = 'true'; else delete row.dataset.live;
    if (live?.active) row.dataset.active = 'true'; else delete row.dataset.active;
    if (live?.audible) row.dataset.audible = 'true'; else delete row.dataset.audible;
    if (drifted) row.dataset.drifted = 'true'; else delete row.dataset.drifted;
    /* B-014: keep the row's windowId in sync so applyFilter + badge helper
       can find it. Absent when the item has no live claim. */
    if (live?.live && live?.windowId != null) {
      row.dataset.windowId = String(live.windowId);
    } else {
      delete row.dataset.windowId;
    }

    /* H-8, B-011: Ensure indicator DOM nodes exist when state transitions false→true */
    _ensureIndicators(row, live, !!drifted);
    /* B-014: keep the cross-window badge current on every live-state patch
       — handles tab moves between windows as well as initial badge insertion. */
    _patchItemWindowBadge(row, live);

    /* B-048 AC7/AC8: rebuild the row-level aria-label on every live-state
       patch so screen readers hear the current state ensemble. Reads the
       item from `itemMap` (built from this MSG_LIST_ITEMS response) rather
       than `_itemById` because the cache may lag by one frame. Selection is
       looked up via `_selection` so the label composes correctly for a row
       that is both live-state-changed AND currently selected. */
    const itemForLabel = itemMap.get(id);
    if (itemForLabel) {
      const isSelected = _selection.has('item:' + id);
      row.setAttribute(
        'aria-label',
        buildItemRowAriaLabel(itemForLabel, live, drifted, isSelected)
      );
    }

    /* B-004: patch favicon / letter-avatar without full rebuild */
    const newFavIconUrl = live?.favIconUrl || null;
    const existingImg = row.querySelector('.item-favicon');
    const existingAvatar = row.querySelector('.item-avatar');

    if (newFavIconUrl && isSafeFaviconUrl(newFavIconUrl) && existingImg) {
      /* Favicon present, img exists — update src if changed.
         Use getAttribute('src') not .src: the IDL property returns the
         browser-resolved absolute URL which may differ from the original
         string even when the value hasn't changed (H-2 fix). */
      if (existingImg.getAttribute('src') !== newFavIconUrl) {
        existingImg.src = newFavIconUrl;
      }
    } else if (newFavIconUrl && isSafeFaviconUrl(newFavIconUrl) && existingAvatar) {
      /* Favicon now available but currently showing avatar — swap to img */
      const img = document.createElement('img');
      img.className = 'item-favicon';
      img.alt = '';
      img.src = newFavIconUrl;
      img.onerror = () => {
        const fallback = document.createElement('div');
        fallback.className = 'item-avatar';
        const itemData = itemMap.get(id);
        const fbLetter = (itemData?.title || '?').charAt(0);
        fallback.textContent = fbLetter;
        fallback.style.backgroundColor = avatarColor(itemData?.title || '');
        img.replaceWith(fallback);
      };
      existingAvatar.replaceWith(img);
    } else if ((!newFavIconUrl || !isSafeFaviconUrl(newFavIconUrl)) && existingImg) {
      /* Favicon gone or unsafe — swap back to letter avatar */
      const avatar = document.createElement('div');
      avatar.className = 'item-avatar';
      const itemData = itemMap.get(id);
      const letter = (itemData?.title || '?').charAt(0);
      avatar.textContent = letter;
      avatar.style.backgroundColor = avatarColor(itemData?.title || '');
      existingImg.replaceWith(avatar);
    }
    /* If !newFavIconUrl && existingAvatar — already showing avatar, skip */
  }

  /* B-024 C-1: refresh bulk-bar disabled states after every live-state patch so
     "Close tabs" cannot target already-closed tabs. */
  _updateBulkBar();

  /* B-014 UAT: after a live-state broadcast patches row windowIds (tab moved
     between windows), re-apply the filter so window-filtered views hide rows
     that crossed into a non-matching window. applyFilter is cheap (CSS hide
     only). */
  if (_filterQuery || _activeWindowFilter !== null) applyFilter();
}

/**
 * Ensure audible indicator DOM node exists/is removed to match live state.
 * Covers the case where a tab becomes audible or drifted after initial render (H-8, B-011).
 */
function _ensureIndicators(row, live, isDrifted) {
  if (!row.isConnected) return;
  const needsAudible = !!live?.audible;
  let audibleIcon = row.querySelector('.item-audible-icon');
  if (needsAudible && !audibleIcon) {
    let indicators = row.querySelector('.item-indicators');
    if (!indicators) {
      indicators = document.createElement('div');
      indicators.className = 'item-indicators';
      /* Insert before .item-actions so indicators appear in the right spot */
      const actions = row.querySelector('.item-actions');
      if (actions) {
        row.insertBefore(indicators, actions);
      } else {
        row.appendChild(indicators);
      }
    }
    audibleIcon = _createAudibleIcon();
    indicators.appendChild(audibleIcon);
  } else if (!needsAudible && audibleIcon) {
    audibleIcon.remove();
    const indicators = row.querySelector('.item-indicators');
    if (indicators && indicators.children.length === 0) indicators.remove();
  }

  const needsDrifted = !!isDrifted;
  let driftedIcon = row.querySelector('.item-drifted-icon');
  if (needsDrifted && !driftedIcon) {
    let indicators = row.querySelector('.item-indicators');
    if (!indicators) {
      indicators = document.createElement('div');
      indicators.className = 'item-indicators';
      const actions = row.querySelector('.item-actions');
      if (actions) {
        row.insertBefore(indicators, actions);
      } else {
        row.appendChild(indicators);
      }
    }
    driftedIcon = _createDriftedIcon();
    indicators.appendChild(driftedIcon);
  } else if (!needsDrifted && driftedIcon) {
    driftedIcon.remove();
    const indicators = row.querySelector('.item-indicators');
    if (indicators && indicators.children.length === 0) indicators.remove();
  }
}

/* =========================================================================
   B-014 — Cross-window badge + filter row helpers
   ========================================================================= */

/**
 * Patch the cross-window badge on a saved-item row after a live-state change.
 * Creates the `.item-indicators` container lazily if needed, and cleans it up
 * when every indicator child has been removed. Mirrors the pattern used by
 * `_ensureIndicators` for audible/drifted icons.
 */
function _patchItemWindowBadge(row, live) {
  if (!row.isConnected) return;
  const rawWindowId = live?.live ? live.windowId : null;
  const willShow = rawWindowId != null
    && (_panelWindowId == null || rawWindowId !== _panelWindowId);
  let indicators = row.querySelector('.item-indicators');
  if (willShow && !indicators) {
    indicators = document.createElement('div');
    indicators.className = 'item-indicators';
    const actions = row.querySelector('.item-actions');
    if (actions) row.insertBefore(indicators, actions);
    else row.appendChild(indicators);
  }
  if (indicators) {
    _renderWindowBadge(indicators, rawWindowId, ITEM_WINDOW_BADGE_CLASS);
    if (indicators.children.length === 0) indicators.remove();
  }
}

/**
 * AC5 helper: (re-)fetch the sidepanel's own rawWindowId via
 * `chrome.windows.getCurrent()`. Self-healing for the rare case of the panel
 * being dragged to a different window mid-session (Edge allows this).
 *
 * Fire-and-forget — any failure leaves `_panelWindowId` at its previous value.
 * On first-ever failure (`_panelWindowId === null`) the badge helper falls
 * back to "always render" so the user sees *something* while the lookup races.
 */
function _refreshPanelWindowId() {
  try {
    const p = chrome.windows?.getCurrent?.();
    if (p && typeof p.then === 'function') {
      p.then((win) => {
        if (win && typeof win.id === 'number') _panelWindowId = win.id;
      }).catch(() => { /* keep previous value */ });
    }
  } catch { /* noop */ }
}

/**
 * Apply the latest `_windowOrdinalMap` to the UI without a full re-render.
 *  (a) Rebuild the filter row's chip set from the new map.
 *  (b) Re-render every live row's window badge (saved-item + open-tab rows).
 *  (c) AC12: auto-reset `_activeWindowFilter` when the filtered window has
 *      closed, then re-apply the filter pipeline.
 */
function _applyWindowMapToUI() {
  _rebuildWindowFilterRow();

  /* Re-render badges on saved-item rows. Also resync `row.dataset.windowId`
     so the window-filter branch in applyFilter sees the fresh windowId when
     a tab is dragged between windows. */
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
  /* Re-render badges on open-tab rows by touching the indicators container
     directly. We don't know per-row cached tabs here without the lookup. */
  for (const row of itemListEl.querySelectorAll('[data-live-only="true"][data-tab-id]')) {
    const raw = Number(row.dataset.windowId);
    if (!Number.isFinite(raw)) continue;
    let indicators = row.querySelector('.item-indicators');
    const willShow = _panelWindowId == null || raw !== _panelWindowId;
    if (willShow && !indicators) {
      indicators = document.createElement('div');
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

/**
 * (Re)build the chip set inside `#window-filter-row` from the current
 * `_windowOrdinalMap`. Hidden when < 2 windows are open (AC8).
 */
function _rebuildWindowFilterRow() {
  if (!windowFilterRowEl) return;

  const entries = Object.entries(_windowOrdinalMap)
    .map(([rawId, ordinal]) => [Number(rawId), ordinal])
    .filter(([rawId]) => Number.isFinite(rawId))
    .sort((a, b) => a[1] - b[1]); // ordinal ascending

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

  const fragment = document.createDocumentFragment();

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'window-filter-chip';
  allChip.setAttribute('role', 'tab');
  allChip.dataset.filterWindow = 'all';
  allChip.textContent = 'All windows';
  const isAll = _activeWindowFilter === null;
  allChip.setAttribute('aria-selected', String(isAll));
  allChip.tabIndex = isAll ? 0 : -1;
  fragment.appendChild(allChip);

  for (const [rawId, ordinal] of entries) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'window-filter-chip';
    chip.setAttribute('role', 'tab');
    chip.dataset.filterWindow = String(rawId);
    chip.textContent = 'W' + ordinal;
    chip.setAttribute('aria-label', 'Window ' + ordinal);
    const selected = _activeWindowFilter === rawId;
    chip.setAttribute('aria-selected', String(selected));
    chip.tabIndex = selected ? 0 : -1;
    fragment.appendChild(chip);
  }

  windowFilterRowEl.replaceChildren(fragment);
}

/**
 * Activate a chip given its `data-filter-window` value. Updates ARIA state,
 * roving tabindex, `_activeWindowFilter`, then re-applies the filter pipeline.
 */
function _activateWindowFilterChip(chip) {
  if (!chip || !windowFilterRowEl) return;
  const raw = chip.dataset.filterWindow;
  /* B-014 H-1: `Number(raw) || null` silently coerces windowId 0 to null (falsy).
     Use an explicit finite-number guard so a real windowId=0 survives. */
  _activeWindowFilter = raw === 'all' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : null);

  for (const c of windowFilterRowEl.querySelectorAll('[role="tab"]')) {
    const selected = c === chip;
    c.setAttribute('aria-selected', String(selected));
    c.tabIndex = selected ? 0 : -1;
  }
  applyFilter();
}

/* Click activation (AC9/AC11). */
if (windowFilterRowEl) {
  windowFilterRowEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[role="tab"]');
    if (!chip || !windowFilterRowEl.contains(chip)) return;
    _activateWindowFilterChip(chip);
    chip.focus();
  });

  /* AC10 — W3C Tabs-with-Automatic-Activation keyboard pattern. */
  windowFilterRowEl.addEventListener('keydown', (e) => {
    const chips = [...windowFilterRowEl.querySelectorAll('[role="tab"]')];
    if (chips.length === 0) return;
    const currentIdx = chips.indexOf(document.activeElement);
    if (currentIdx === -1 && e.key !== 'Home' && e.key !== 'End') return;

    let next = currentIdx;
    if (e.key === 'ArrowLeft') {
      next = currentIdx <= 0 ? chips.length - 1 : currentIdx - 1;
    } else if (e.key === 'ArrowRight') {
      next = currentIdx >= chips.length - 1 ? 0 : currentIdx + 1;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = chips.length - 1;
    } else if (e.key === 'Enter' || e.key === ' ') {
      const target = document.activeElement?.closest('[role="tab"]');
      if (target && windowFilterRowEl.contains(target)) {
        e.preventDefault();
        _activateWindowFilterChip(target);
      }
      return;
    } else {
      return; /* Tab and other keys: let the browser handle focus exit. */
    }

    e.preventDefault();
    const target = chips[next];
    if (target) {
      _activateWindowFilterChip(target);
      target.focus();
    }
  });
}

/* =========================================================================
   Event delegation
   ========================================================================= */

document.addEventListener('click', (e) => {
  if (e.target === dialogOverlayEl) {
    closeDialog();
    return;
  }

  if (e.target === dialogCancelBtnEl || e.target === confirmCancelBtnEl) {
    closeDialog();
    return;
  }

  if (e.target === confirmDeleteBtnEl) {
    const cb = _pendingConfirmCallback;
    closeDialog();
    if (cb) cb();
    return;
  }

  if (e.target.closest('#add-bookmark-btn') || e.target.closest('.empty-state-cta:not(#filter-empty-clear-btn)')) {
    openCreateDialog({ triggerEl: e.target });
    return;
  }

  /* B-081: new-group button opens the group dialog in create mode. Uses the
     same event-delegation path as #add-bookmark-btn above so focus restoration
     (addGroupBtnEl) works cleanly on Cancel. */
  if (e.target.closest('#add-group-btn')) {
    openGroupCreateDialog({ triggerEl: addGroupBtnEl });
    return;
  }

  const actionBtn = e.target.closest('[data-action]');
  if (actionBtn) {
    e.stopPropagation();
    const row = actionBtn.closest('.item-row');
    if (!row) return;
    const itemId = row.dataset.itemId;
    if (actionBtn.dataset.action === 'edit') {
      sendMessage(MSG_GET_ITEM, { id: itemId }).then((item) => {
        openEditDialog(item, { triggerEl: actionBtn });
      }).catch(() => {
        showToast('Couldn\u2019t load bookmark \u2014 try again');
      });
      return;
    }
    if (actionBtn.dataset.action === 'delete') {
      if (row.dataset.live === 'true') {
        sendMessage(MSG_DEMOTE_ITEM, { itemId }).catch(() => {
          showToast('Couldn\u2019t close tab \u2014 try again');
        });
      } else {
        sendMessage(MSG_GET_ITEM, { id: itemId }).then((item) => {
          openConfirmDialog(item, () => {
            sendMessage(MSG_DELETE_ITEM, { id: itemId }).catch(() => {
              showToast('Couldn\u2019t delete bookmark \u2014 try again');
            });
          }, { triggerEl: actionBtn });
        }).catch(() => {
          showToast('Couldn\u2019t load bookmark \u2014 try again');
        });
      }
      return;
    }
  }

  const header = e.target.closest('.group-header');
  if (header) {
    if (e.target.closest('.group-drag-handle')) return;
    toggleGroup(header);
    return;
  }

  const row = e.target.closest('.item-row');
  if (row) {
    const key = _selectionKeyForRow(row);
    if (!key) return;

    /* B-024: Ctrl/Cmd+Click — toggle individual selection */
    if (e.ctrlKey || e.metaKey) {
      _toggleSelection(key);
      return;
    }

    /* B-024 H-3: Shift+Click while in selection mode with a valid anchor — range select */
    if (_selectionMode && e.shiftKey && _rangeAnchorId) {
      _rangeSelect(key);
      return;
    }

    /* B-024 H-4: Shift+Click with no prior selection starts selection at this item
       (treat Shift as an explicit "start selection" intent). */
    if (e.shiftKey && !_selectionMode) {
      _toggleSelection(key);
      return;
    }

    /* B-024 H-6: Plain click while in selection mode — defer the toggle so that
       a follow-up dblclick can cancel it and navigate instead. */
    if (_selectionMode) {
      clearTimeout(_pendingClickTimer);
      _pendingClickTimer = setTimeout(() => {
        _pendingClickTimer = null;
        _toggleSelection(key);
      }, 200);
      return;
    }

    /* Normal click — navigate */
    navigateToItem(row);
    return;
  }
});

/* B-024: Double-click navigates even in selection mode.
   H-6: cancel any pending single-click selection toggle before navigating.
   H-6: skip navigation when Shift is held — preserves range-select intent. */
document.addEventListener('dblclick', (e) => {
  if (!_selectionMode) return;
  if (e.shiftKey) return;
  const row = e.target.closest('.item-row');
  if (row) {
    if (_pendingClickTimer) {
      clearTimeout(_pendingClickTimer);
      _pendingClickTimer = null;
    }
    navigateToItem(row);
  }
});

document.addEventListener('keydown', (e) => {
  /* Dialog Escape — highest priority */
  if (e.key === 'Escape' && !dialogOverlayEl.hidden) {
    e.preventDefault();
    closeDialog();
    return;
  }

  /* B-024: Escape clears selection when in selection mode */
  if (e.key === 'Escape' && _selectionMode) {
    e.preventDefault();
    _clearSelection();
    return;
  }

  /* B-024: Ctrl/Cmd+A selects all visible items (when not in a text input) */
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    const tag = document.activeElement?.tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
      e.preventDefault();
      _selectAll();
      return;
    }
  }

  if (e.key !== 'Enter') return;

  const header = e.target.closest('.group-header');
  if (header) {
    e.preventDefault();
    toggleGroup(header);
    return;
  }

  const row = e.target.closest('.item-row');
  if (row) {
    e.preventDefault();
    navigateToItem(row);
    return;
  }
});

function toggleGroup(header) {
  const groupId = header.dataset.groupId;
  const expanded = header.getAttribute('aria-expanded') === 'true';
  const controlsId = header.getAttribute('aria-controls');
  const itemsContainer = document.getElementById(controlsId);

  if (expanded) {
    header.setAttribute('aria-expanded', 'false');
    if (itemsContainer) itemsContainer.hidden = true;
    collapsedGroups.add(groupId);
  } else {
    header.setAttribute('aria-expanded', 'true');
    if (itemsContainer) itemsContainer.hidden = false;
    collapsedGroups.delete(groupId);
  }

  /* W1 — Persist ungrouped collapse to sessionStorage */
  if (groupId === '__ungrouped__') {
    sessionStorage.setItem('tj-ungrouped-collapsed', String(!expanded));
    return;
  }

  /* Persist collapse state for real groups */
  sendMessage(MSG_UPDATE_GROUP, {
    id: groupId,
    patch: { collapsed: !expanded },
  }).catch(() => {
    /* Non-critical — UI state is already updated */
  });

  /* B-040 — Sub-group auto-collapse cascade (one-way, collapse only).
     Gated on the `autoCollapseSubGroups` preference. When ON and the user
     collapses a parent group (parentId === null with at least one child),
     cascade `collapsed: true` writes to every direct child group.
     Notes:
       - ONE-WAY: expand-parent does NOT auto-expand children (AC4 design —
         expansion would re-disclose previously-collapsed sub-groups the user
         chose to hide).
       - Depth-1 only: B-007 caps group nesting at depth 1, so only direct
         children exist. No recursion needed (AC9).
       - `Promise.all` non-atomic: `MSG_BULK_UPDATE_GROUPS` is not part of
         the message contract (R1 finding). Individual writes may
         fractionally fail; surviving writes commit. R2 AC5 accepts this
         non-atomicity as explicit contract — a follow-up storage broadcast
         keeps all surfaces converged.
       - Retroactive protection: if the cascade fires before a broadcast
         reaches us, `collapsedGroups` Set is already updated by UI painting
         above; child collapse is driven off the LIVE `_cachedGroups`
         (populated by renderAll + MSG_STATE_CHANGED broadcasts).
     AC8 empty states handled inline: zero children → early return (no
     writes); already-collapsed children → write still fires (no-op at the
     storage layer). */
  if (!expanded) {
    /* Only cascade on collapse gestures — one-way guard. The `expanded`
       snapshot was captured BEFORE we flipped the aria attribute, so
       `!expanded` means "the user just collapsed this". */
    _maybeCascadeCollapseChildren(groupId).catch((err) => {
      /* Best-effort — cascade failures are logged, not surfaced. Parent
         collapse already persisted. */
      console.warn('[tab-junkie] B-040 cascade collapse failed:', err);
    });
  }
}

/**
 * B-040 — Conditionally cascade `collapsed: true` to all direct child
 * groups of `parentGroupId` when the `autoCollapseSubGroups` preference
 * is ON. Reads the preference each time rather than caching; the pref
 * toggle is rare relative to collapse gestures, and the read is a
 * single-partition IPC round-trip.
 *
 * Zero-child parents short-circuit without any IPC writes (AC8a).
 *
 * @param {string} parentGroupId
 * @returns {Promise<void>}
 */
async function _maybeCascadeCollapseChildren(parentGroupId) {
  /* AC2: default OFF. If prefs fetch fails, silently skip cascade —
     baseline B-008 behavior is unchanged, which is the defensive default. */
  let prefs;
  try {
    prefs = await sendMessage(MSG_GET_PREFERENCES);
  } catch {
    return;
  }
  if (!prefs || prefs.autoCollapseSubGroups !== true) return;

  /* Find direct children via the live `_cachedGroups` snapshot. Depth-1
     cap from B-007 means children of children do not exist. */
  const children = _cachedGroups.filter((g) => g.parentId === parentGroupId);
  if (children.length === 0) return; // AC8a — zero-children no-op

  /* Drive UI state synchronously so the cascade is visible before the
     broadcast round-trip. The subsequent MSG_STATE_CHANGED (scope: 'groups')
     from each successful write will re-render from authoritative storage. */
  for (const child of children) {
    collapsedGroups.add(child.id);
  }

  /* Fire individual MSG_UPDATE_GROUP writes concurrently. R1 finding: no
     MSG_BULK_UPDATE_GROUPS exists; Promise.all is the best available
     concurrency primitive. Each write catches its own error so one
     failure does not swallow the others (AC5 non-atomic contract). */
  const writes = children.map((child) =>
    sendMessage(MSG_UPDATE_GROUP, {
      id: child.id,
      patch: { collapsed: true },
    }).catch(() => {
      console.warn('[tab-junkie] B-040 cascade write failed:', child.id);
    }),
  );
  await Promise.all(writes);
}

function navigateToItem(row) {
  /* B-055 AC6: Open Tabs row — focus the live tab via the tabId-only variant.
     The SW handler intentionally suppresses the state-changed broadcast for
     this variant (no storage mutation) so the click does not cascade into a
     full re-render on every open surface. */
  if (row.dataset.liveOnly === 'true') {
    const tabId = Number(row.dataset.tabId);
    const windowId = Number(row.dataset.windowId);
    if (!Number.isFinite(tabId) || !Number.isFinite(windowId)) return;
    sendMessage(MSG_NAVIGATE_TO_ITEM, { tabId, windowId }).catch(() => {
      showToast('Couldn\u2019t focus tab \u2014 try again');
    });
    return;
  }

  const itemId = row.dataset.itemId;
  if (!itemId) return;
  sendMessage(MSG_NAVIGATE_TO_ITEM, { itemId }).catch(() => {
    showToast('Couldn\u2019t open tab \u2014 try again');
  });
}

/* =========================================================================
   Drag listeners — B-008 group-reorder + B-030 v2 item-reorder

   Each event branches based on drag origin:
   - Item drag (B-030 v2): initiated on an `.item-row`; governed by
     _itemDragState + _dragRectCache. Follows R2 binding contracts (see
     SPRINT.md S23 § "R2 Architecture Review"). Dragover body is
     3 statements only (AC16/AC17 enforcement).
   - Group drag (B-008): initiated on `.group-drag-handle`; governed by
     _dragSrcGroupId. Unchanged from pre-S22 pattern.
   ========================================================================= */

itemListEl.addEventListener('mousedown', (e) => {
  _dragInitiatedFromHandle = !!e.target.closest('.group-drag-handle');
});

itemListEl.addEventListener('dragstart', (e) => {
  /* B-030 v2 — item drag path (takes precedence when origin is an .item-row
     AND the drag was NOT initiated from a group handle). */
  const itemRow = e.target.closest('.item-row');
  if (itemRow && !_dragInitiatedFromHandle) {
    const itemId = itemRow.dataset.itemId;
    if (!itemId) { e.preventDefault(); return; }

    const sourceItem = _cachedItems.find((it) => it.id === itemId);
    const sourceGroupId = sourceItem ? (sourceItem.groupId ?? null) : null;

    /* B-025 — resolve the drag payload (D-4 + D-5).
       If the initiator is NOT in the active selection, run the AC2 solo-drag
       fallback: clear selection + drag initiator alone. Otherwise filter
       selection to `item:*` keys matching the initiator's source group (D-4
       silent single-source-group restriction; D-5 live-only `tab:*` keys are
       skipped by the `item:` prefix check). */
    const initiatorKey = 'item:' + itemId;
    let payloadItemIds;
    let isMulti;
    if (!_selection.has(initiatorKey)) {
      if (_selection.size > 0) {
        _selection.clear();
        _updateBulkBar();
      }
      payloadItemIds = [itemId];
      isMulti = false;
    } else {
      const candidates = [];
      for (const key of _selection) {
        if (!key.startsWith('item:')) continue;
        const id = key.slice(5);
        const it = _cachedItems.find((x) => x.id === id);
        if (!it) continue;
        if ((it.groupId ?? null) !== sourceGroupId) continue;
        candidates.push(id);
      }
      payloadItemIds = candidates.length > 0 ? candidates : [itemId];
      isMulti = payloadItemIds.length >= 2;
    }

    /* §37.9 F-7 — caller-sort by current sortOrder so drop preserves the
       selection's visual order regardless of Set iteration order. */
    if (isMulti) {
      payloadItemIds.sort((a, b) => {
        const ia = _cachedItems.find((x) => x.id === a);
        const ib = _cachedItems.find((x) => x.id === b);
        return (ia?.sortOrder ?? 0) - (ib?.sortOrder ?? 0);
      });
    }

    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', payloadItemIds.join(',')); } catch { /* Firefox compat; noop elsewhere */ }

    _itemDragState = {
      itemId,
      sourceGroupId,
      cachedItemsGen: _cachedItemsGen,
      pendingTargetRowId: null,
      pendingInsertPosition: null,
      /* B-025 UAT-3 fix — carries the groupId when the drop target is an
         empty group (target.type === 'emptyGroup'). Null for item-row drops
         (the row id already carries group identity via _cachedItems lookup)
         and for the Open Tabs demote path. */
      pendingDestGroupId: null,
      rafHandle: null,
      scrollListener: null,
      payloadItemIds,
      payloadSet: new Set(payloadItemIds),
      isMulti,
    };
    _buildDragRectCache();

    /* Register passive scroll listener (AC18 — invalidate on scroll only). */
    _itemDragState.scrollListener = () => {
      if (_dragRectCache) _dragRectCache.invalid = true;
    };
    itemListEl.addEventListener('scroll', _itemDragState.scrollListener, { passive: true });

    _setMultiDragRowClasses(payloadItemIds);
    itemListEl.classList.add('is-item-dragging');

    /* B-025 — custom drag ghost with count badge (N >= 2 only). */
    if (isMulti) {
      const initiatorTitle = sourceItem && typeof sourceItem.title === 'string' && sourceItem.title.length > 0
        ? sourceItem.title
        : '(untitled)';
      const ghostEl = _buildMultiDragGhost(payloadItemIds.length, initiatorTitle);
      try {
        /* B-025 UAT-8 fix (M-3) — force a synchronous layout reflow before
           calling setDragImage. `_buildMultiDragGhost` appended the element
           moments ago; without the reflow, `offsetWidth`/`getBoundingClientRect`
           may still return 0 and `setDragImage(el, 0, 16)` snapshots a
           zero-width preview (Edge renders this as a broken-image icon).
           Reading `offsetWidth` after append forces the engine to flush
           layout. */
        void ghostEl.offsetHeight;
        const measured = ghostEl.offsetWidth
          || ghostEl.getBoundingClientRect().width
          || 80;
        const halfWidth = Math.round(measured / 2);
        e.dataTransfer.setDragImage(ghostEl, halfWidth, 16);
      } catch { /* setDragImage unsupported — fall back to default */ }
      /* §37.9 F-6 — microtask detach is timing-critical: the browser
         snapshots during the current task, so removing synchronously would
         race. `queueMicrotask` (not `Promise.resolve().then`) schedules the
         detach at the end of the current microtask checkpoint. */
      queueMicrotask(() => ghostEl.remove());
    }

    _dragLog('dragstart', {
      itemId,
      sourceGroupId,
      cachedItemsGen: _cachedItemsGen,
      isMulti,
      payloadCount: payloadItemIds.length,
    });
    return;
  }

  /* B-031 group drag path (extends B-008 with mode-aware NEST + REORDER).
     Gated on `_dragInitiatedFromHandle` — the mousedown handler sets this
     when the pointer starts on `.group-drag-handle`, disambiguating handle
     drag from header click. */
  const section = e.target.closest('[data-group-id]');
  if (!section) { e.preventDefault(); return; }
  if (!_dragInitiatedFromHandle) { e.preventDefault(); return; }
  _dragSrcGroupId = section.dataset.groupId;
  e.dataTransfer.effectAllowed = 'move';
  section.classList.add('dragging-src');
  itemListEl.classList.add('is-dragging');

  /* B-031 — initialise mode-aware drag state. Prebuild the valid-target
     Sets ONCE at dragstart so the rAF tick does O(1) lookups rather than
     re-running filterGroupParentCandidates on every frame. Rebuild triggers
     are: dragstart only — `_pendingGroupsRender` defers group-scope
     broadcast re-renders until dragend, so `_cachedGroups` doesn't mutate
     mid-drag; the broadcast-race guard in the drop handler catches the
     edge case where state advanced but drop proceeded. */
  const draggedGroup = _cachedGroups.find((g) => g.id === _dragSrcGroupId);
  if (draggedGroup) {
    const candidates = filterGroupParentCandidates(_cachedGroups, draggedGroup);
    const validNestTargetIds = new Set(candidates.map((g) => g.id));
    const sourceParentId = draggedGroup.parentId ?? null;
    /* Valid REORDER targets = siblings in the same bucket (parentId match).
       Prebuilt Set for O(1) tick lookup. */
    const validReorderTargetIds = new Set(
      _cachedGroups
        .filter((g) => (g.parentId ?? null) === sourceParentId && g.id !== draggedGroup.id)
        .map((g) => g.id),
    );
    _groupDragState = {
      draggedGroupId: draggedGroup.id,
      draggedGroup,
      isSubGroupDrag: sourceParentId !== null,
      validNestTargetIds,
      validReorderTargetIds,
      cachedGroupsGen: _cachedGroupsGen,
      pendingTargetGroupId: null,
      pendingMode: null,
      /* B-084 AC2 — last geometric (pre-validity) mode for the
         hysteresis deadzone in `_applyGroupDragHysteresis`. Tracked
         separately from `pendingMode` so a REJECT (validity-derived)
         doesn't poison the NEST↔REORDER boundary math. */
      pendingProposedMode: null,
      rafHandle: null,
      scrollListener: null,
    };
    _buildGroupDragRectCache();

    /* Passive scroll listener — invalidate cache on scroll; rAF tick
       rebuilds lazily. Mirror of the item-drag pattern. */
    _groupDragState.scrollListener = () => {
      if (_groupDragRectCache) _groupDragRectCache.invalid = true;
    };
    itemListEl.addEventListener('scroll', _groupDragState.scrollListener, { passive: true });
  }
});

itemListEl.addEventListener('dragover', (e) => {
  /* B-030 v2 — AC16 + AC17: dragover body is 3 statements only. No rect
     reads, no DOM mutations, no layout. rAF callback (_dragTick) does the
     work. R4 code-reviewer greps this handler for getBoundingClientRect
     or classList writes — any hit is a REJECT. */
  if (_itemDragState) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    _pendingPointerX = e.clientX;
    _pendingPointerY = e.clientY;
    _scheduleDragTick();
    return;
  }

  /* B-031 group drag path — mirrors B-030 v2 3-statement pattern.
     No rect reads, no DOM mutations, no layout in this handler. All
     hit-testing + DOM writes happen in `_groupDragTick`. R4
     code-reviewer greps for getBoundingClientRect / classList mutation
     inside this branch — any hit is a REJECT. */
  if (_groupDragState) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    _pendingGroupPointerX = e.clientX;
    _pendingGroupPointerY = e.clientY;
    _scheduleGroupDragTick();
    return;
  }

  /* Fallback for drags that set `_dragSrcGroupId` but somehow skipped the
     state init (e.g. dragged group not in cache at dragstart) — behave as
     a passive dragover so the browser's default drop handling applies. */
  if (_dragSrcGroupId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
});

itemListEl.addEventListener('dragleave', (e) => {
  /* For item drag, indicator visibility is managed by rAF tick via
     opacity — NOT toggled here (dragleave is noisy and would flicker). */
  if (_itemDragState) return;
  /* B-031 — same rAF-gated opacity approach for group drag. Classes +
     indicator are managed by `_groupDragTick`; dragleave would flicker. */
  if (_groupDragState) return;
  /* Legacy B-008 drop indicator cleanup (used only by the fallback path
     above). */
  if (!e.relatedTarget || !itemListEl.contains(e.relatedTarget)) {
    dropIndicatorEl.hidden = true;
  }
});

itemListEl.addEventListener('drop', async (e) => {
  /* B-030 v2 — item drop path (with AC24 broadcast-race guard). */
  if (_itemDragState) {
    e.preventDefault();
    const state = _itemDragState;
    /* UAT-fix (cleanup order): run cleanup BEFORE nulling state so rAF cancel
       + scroll-listener removal are applied. Then null. */
    _cleanupItemDragDom();
    _itemDragState = null;

    /* B-033 — drop onto Open Tabs → demote path. Dispatch MSG_DEMOTE_ITEM
       (existing B-017 message). Saved-only items were already rejected at
       target-compute time (AC3); only saved+live reach here. */
    if (state.pendingDropType === 'openTabs') {
      _dragLog('drop — openTabs demote', { itemId: state.itemId });
      sendMessage(MSG_DEMOTE_ITEM, { id: state.itemId })
        .then(() => {
          showToast('Bookmark removed — tab stays open');
        })
        .catch((err) => {
          console.warn('[tab-junkie:b033] demote failed', err);
          showToast('Couldn\u2019t remove bookmark — try again');
        });
      return;
    }

    /* B-025 UAT-3 fix — empty-group drop branch. Handled BEFORE the
       `pendingTargetRowId` early-bail because empty-group drops do not
       carry a target row id (there is no row to insert relative to —
       destIndex is always 0 within the target group). Applies to both
       single-item and multi-item paths per AC13e (empty-dest empty-state). */
    if (state.pendingDropType === 'emptyGroup') {
      if (!state.pendingDestGroupId) {
        _dragLog('drop — emptyGroup target missing destGroupId; cancel');
        return;
      }

      /* AC24 — broadcast race guard: refresh items if our snapshot is stale
         before computing the reorder. Same pattern as the item-row branch. */
      if (state.cachedItemsGen !== _cachedItemsGen) {
        _dragLog('drop (emptyGroup) — broadcast race detected; refreshing items');
        try {
          const itemsResp = await sendMessage(MSG_LIST_ITEMS);
          _cachedItems = itemsResp.items;
          _cachedItemsGen += 1;
        } catch (err) {
          console.warn('[tab-junkie:b030] refresh on broadcast race failed', err);
          showToast('Couldn\u2019t save new order \u2014 try again');
          return;
        }
      }

      /* Re-validate the target group is actually empty post-refresh. If
         another window created items in it during the drag, abort and let
         the user retry (safer than inserting at an index that is no longer
         "first position"). */
      const destGroupId = state.pendingDestGroupId;
      const destSiblings = _cachedItems
        .filter((it) => (it.groupId ?? null) === destGroupId && !state.payloadSet.has(it.id))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      /* destIndex = destSiblings.length puts the payload at the end. For a
         truly-empty group that's 0; for a racey case where the group is no
         longer empty, appending preserves user intent ("I dropped here")
         without overwriting existing items. */
      const destIndex = destSiblings.length;

      let updates;
      if (state.isMulti) {
        const sortedIds = [...state.payloadItemIds].sort((a, b) => {
          const ia = _cachedItems.find((x) => x.id === a);
          const ib = _cachedItems.find((x) => x.id === b);
          return (ia?.sortOrder ?? 0) - (ib?.sortOrder ?? 0);
        });
        updates = computeMultiItemReorder(_cachedItems, sortedIds, destGroupId, destIndex);
        _dragLog('drop (multi, emptyGroup)', { count: sortedIds.length, destGroupId, destIndex, updates });
      } else {
        updates = computeItemReorder(_cachedItems, state.itemId, destGroupId, destIndex);
        _dragLog('drop (emptyGroup)', { itemId: state.itemId, destGroupId, destIndex, updates });
      }

      if (updates.length === 0) return;
      await _commitReorderAndRender(updates, { isMulti: state.isMulti });
      return;
    }

    if (!state.pendingTargetRowId) {
      _dragLog('drop — no pending target; cancel');
      return;
    }

    /* AC24 — broadcast race guard. If _cachedItems advanced during drag,
       await fresh snapshot before computing the reorder spec. */
    if (state.cachedItemsGen !== _cachedItemsGen) {
      _dragLog('drop — broadcast race detected; refreshing items before reorder');
      try {
        const itemsResp = await sendMessage(MSG_LIST_ITEMS);
        _cachedItems = itemsResp.items;
        _cachedItemsGen += 1;
      } catch (err) {
        console.warn('[tab-junkie:b030] refresh on broadcast race failed', err);
        showToast('Couldn\u2019t save new order \u2014 try again');
        return;
      }
    }

    /* Resolve destination group + index from the pending target. Exclude
       the ENTIRE payload (B-025) — for a single-item drag this collapses to
       the prior B-030 behaviour (payloadSet has exactly one id). */
    const target = _cachedItems.find((it) => it.id === state.pendingTargetRowId);
    const destGroupId = target ? (target.groupId ?? null) : state.sourceGroupId;
    const destSiblings = _cachedItems
      .filter((it) => (it.groupId ?? null) === destGroupId && !state.payloadSet.has(it.id))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    let destIndex = destSiblings.findIndex((it) => it.id === state.pendingTargetRowId);
    if (destIndex < 0) destIndex = destSiblings.length;
    if (state.pendingInsertPosition === 'after') destIndex += 1;

    let updates;
    if (state.isMulti) {
      /* B-025 — re-sort payload by CURRENT sortOrder against the freshly
         refreshed `_cachedItems` (after the broadcast-race guard above).
         Upstream dragstart already sorted, but re-sorting here is cheap
         insurance against the rare case where the broadcast race refetch
         renumbered sortOrders. */
      const sortedIds = [...state.payloadItemIds].sort((a, b) => {
        const ia = _cachedItems.find((x) => x.id === a);
        const ib = _cachedItems.find((x) => x.id === b);
        return (ia?.sortOrder ?? 0) - (ib?.sortOrder ?? 0);
      });
      updates = computeMultiItemReorder(_cachedItems, sortedIds, destGroupId, destIndex);
      _dragLog('drop (multi)', { count: sortedIds.length, destGroupId, destIndex, updates });
    } else {
      updates = computeItemReorder(_cachedItems, state.itemId, destGroupId, destIndex);
      _dragLog('drop', { itemId: state.itemId, destGroupId, destIndex, updates });
    }

    if (updates.length === 0) return; // same-position no-op

    await _commitReorderAndRender(updates, { isMulti: state.isMulti });
    return;
  }

  /* B-031 group drop path (replaces the B-008 per-group updateGroup
     fan-out with a single MSG_BULK_REORDER_GROUPS transaction). */
  e.preventDefault();
  if (_groupDragState) {
    const state = _groupDragState;
    /* UAT-fix (cleanup order lesson from B-030): run cleanup BEFORE nulling
       state so rAF cancel + scroll-listener removal are applied. */
    _cleanupGroupDragDom();
    _groupDragState = null;

    /* Validate pending mode — REJECT / null → abort silently (indicator
     already cleared by cleanup). */
    if (!state.pendingMode || state.pendingMode === 'REJECT' || !state.pendingTargetGroupId) {
      return;
    }

    /* Broadcast-race guard. If `_cachedGroups` advanced during drag,
       refetch + re-validate target is still in the nest/reorder set
       before committing. Abort with toast on invalid-after-refresh. */
    if (state.cachedGroupsGen !== _cachedGroupsGen) {
      try {
        const freshGroups = await sendMessage(MSG_LIST_GROUPS);
        _cachedGroups = freshGroups;
        _cachedGroupsGen += 1;
        const freshDragged = freshGroups.find((g) => g.id === state.draggedGroupId);
        if (!freshDragged) {
          showToast('Couldn\u2019t save group order \u2014 try again');
          return;
        }
        if (state.pendingMode === 'NEST') {
          const freshNestCandidates = new Set(
            filterGroupParentCandidates(freshGroups, freshDragged).map((g) => g.id),
          );
          if (!freshNestCandidates.has(state.pendingTargetGroupId)) {
            showToast('Couldn\u2019t save group order \u2014 try again');
            return;
          }
        } else {
          const freshSourceParent = freshDragged.parentId ?? null;
          const targetStillSibling = freshGroups.some(
            (g) => g.id === state.pendingTargetGroupId
              && (g.parentId ?? null) === freshSourceParent,
          );
          if (!targetStillSibling) {
            showToast('Couldn\u2019t save group order \u2014 try again');
            return;
          }
        }
      } catch {
        showToast('Couldn\u2019t save group order \u2014 try again');
        return;
      }
    }

    const updates = computeGroupReorder(
      _cachedGroups,
      state.draggedGroupId,
      state.pendingMode,
      state.pendingTargetGroupId,
    );
    if (updates.length === 0) return;

    /* D-4: NEST onto a collapsed target — expand optimistically so the
       user can see the drop took effect, then dispatch the fire-and-forget
       collapsed=false patch AFTER the bulk reorder resolves. */
    let nestTargetWasCollapsed = false;
    if (state.pendingMode === 'NEST') {
      const nestTarget = _cachedGroups.find((g) => g.id === state.pendingTargetGroupId);
      if (nestTarget && nestTarget.collapsed) {
        nestTargetWasCollapsed = true;
        collapsedGroups.delete(state.pendingTargetGroupId);
      }
    }

    try {
      await sendMessage(MSG_BULK_REORDER_GROUPS, { updates });
      /* Explicit re-fetch + renderAll (mirrors B-030 D-2). The `groups`
         broadcast is deferred via `_pendingGroupsRender` while
         `_dragSrcGroupId` is set, so we can't rely on it alone. */
      const [itemsResp, groups] = await Promise.all([
        sendMessage(MSG_LIST_ITEMS),
        sendMessage(MSG_LIST_GROUPS),
      ]);
      _setWindowOrdinalMap(itemsResp.windowMap || {});
      renderAll(itemsResp.items, groups, itemsResp.liveStates,
        itemsResp.driftRecords, itemsResp.openTabs);
      _applyWindowMapToUI();

      /* D-4: fire-and-forget collapsed=false patch on the NEST target.
         Non-atomic with the reorder (worst case: target expands without
         the reorder taking effect — cosmetic, no data corruption). */
      if (nestTargetWasCollapsed) {
        sendMessage(MSG_UPDATE_GROUP, {
          id: state.pendingTargetGroupId,
          patch: { collapsed: false },
        }).catch(() => {/* best-effort; UI already reflects expanded state */});
      }
    } catch (err) {
      const code = err?.error?.code || err?.code;
      const toastMsg = translateGroupError(code) || 'Couldn\u2019t save group order \u2014 reverting';
      showToast(toastMsg);
      /* Restore optimistic UI state before re-fetching. */
      if (nestTargetWasCollapsed) {
        collapsedGroups.add(state.pendingTargetGroupId);
      }
      Promise.all([sendMessage(MSG_LIST_ITEMS), sendMessage(MSG_LIST_GROUPS)])
        .then(([itemsResp, groups]) => {
          _setWindowOrdinalMap(itemsResp.windowMap || {});
          renderAll(itemsResp.items, groups, itemsResp.liveStates,
            itemsResp.driftRecords, itemsResp.openTabs);
          _applyWindowMapToUI();
        })
        .catch(() => {});
    }
    return;
  }

  /* Legacy fallback: a group drag somehow reached drop without
     _groupDragState — no-op (the browser keeps the default behaviour). */
  dropIndicatorEl.hidden = true;
});

itemListEl.addEventListener('dragend', () => {
  /* B-030 v2 — cancel path (Escape or invalid drop). If drop handler
     already consumed the state, this is a no-op.
     B-025 — cleanup-before-null so `_cleanupItemDragDom` can read
     `payloadItemIds` for explicit multi-drag row-class removal. Matches the
     drop-handler ordering + the B-031 cleanup-before-null precedent. */
  if (_itemDragState) {
    _dragLog('dragend — cancelled');
    _cleanupItemDragDom();
    _itemDragState = null;
  }

  /* B-031 — group-drag cancel path. Cleanup-before-null pattern: run
     _cleanupGroupDragDom() FIRST so its `if (_groupDragState)` guard
     still passes and the rAF cancel + scroll-listener removal actually
     fire. Then null the state. Matches the drop handler at L4646-4647
     and the B-030 UAT-fix lesson. */
  if (_groupDragState) {
    _cleanupGroupDragDom();
    _groupDragState = null;
  }

  /* B-008 group drag cleanup. */
  dropIndicatorEl.hidden = true;
  itemListEl.classList.remove('is-dragging');
  itemListEl.querySelector('.dragging-src')?.classList.remove('dragging-src');
  _dragSrcGroupId = null;
  _dragInitiatedFromHandle = false;
  if (_pendingGroupsRender) {
    _pendingGroupsRender = false;
    Promise.all([sendMessage(MSG_LIST_ITEMS), sendMessage(MSG_LIST_GROUPS)])
      .then(([itemsResp, groups]) => {
        /* B-014 */
        _setWindowOrdinalMap(itemsResp.windowMap || {});
        renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords, itemsResp.openTabs);
        _applyWindowMapToUI();
      })
      .catch(() => {});
  }
});

/* =========================================================================
   B-030 v2 — item drag helpers (R2 binding contracts)
   ========================================================================= */

/* _buildDragRectCache — AC18. Single pass over .item-row elements at
   dragstart. O(N) rect reads done once; subsequent rAF ticks consume
   the cache without calling getBoundingClientRect. Invalidated on
   itemListEl scroll events; rebuilt lazily in the next rAF tick. */
function _buildDragRectCache() {
  const rects = new Map();
  const rows = itemListEl.querySelectorAll('.item-row');
  for (const row of rows) {
    const id = row.dataset.itemId;
    if (id) rects.set(id, row.getBoundingClientRect());
  }
  _dragRectCache = {
    rects,
    containerRect: itemListEl.getBoundingClientRect(),
    invalid: false,
  };
}

/* _scheduleDragTick — R2 contract #3. Dedup via rafHandle so at most one
   rAF is pending per frame. Dragover calls this on every event; rAF
   provides the coalescing. */
function _scheduleDragTick() {
  if (!_itemDragState || _itemDragState.rafHandle != null) return;
  _itemDragState.rafHandle = requestAnimationFrame(_dragTick);
}

/* B-032 — auto-scroll edge detection + scrollTop adjustment.
   Runs once per `_dragTick`. Gated on `_itemDragState !== null` by caller
   (AC11 — no activation outside item drag; B-031 group drag is NOT handled
   here per B-032 out-of-scope). Returns true when auto-scroll was applied
   so the caller can re-schedule the tick (AC5 continuous-while-held).

   Strategy (AC7 + AC8 + AC10):
   - Uses `_pendingPointerY` and cached containerRect — no new rect reads.
   - `element.scrollTop += delta` triggers a native scroll event; B-030's
     passive scroll listener marks `_dragRectCache.invalid = true`; next
     tick lazily rebuilds. No new CSS; no second rAF (caller owns rAF).
   - Boundary clamp (AC6): no negative scrollTop; no scroll past
     `scrollHeight - clientHeight`. */
function _maybeAutoScroll() {
  if (!_itemDragState || !_dragRectCache) return false;
  const containerRect = _dragRectCache.containerRect;
  const distanceFromTop = _pendingPointerY - containerRect.top;
  const distanceFromBottom = containerRect.bottom - _pendingPointerY;

  let delta = 0;
  if (distanceFromTop >= 0 && distanceFromTop < AUTO_SCROLL_EDGE_ZONE_PX) {
    /* AC3 — linear ramp: fastest at the edge (distance = 0), zero at the
       zone boundary (distance = EDGE_ZONE_PX). */
    const speed = Math.round(
      AUTO_SCROLL_MAX_SPEED * (1 - distanceFromTop / AUTO_SCROLL_EDGE_ZONE_PX),
    );
    delta = -speed;
  } else if (distanceFromBottom >= 0 && distanceFromBottom < AUTO_SCROLL_EDGE_ZONE_PX) {
    const speed = Math.round(
      AUTO_SCROLL_MAX_SPEED * (1 - distanceFromBottom / AUTO_SCROLL_EDGE_ZONE_PX),
    );
    delta = speed;
  }

  if (delta === 0) return false;

  /* AC6 — boundary clamp. Don't scroll past 0 (top) or maxScroll (bottom).
     When clamped to a stable extreme, nothing changes and we return false
     so the tick doesn't self-reschedule into a no-op loop. */
  const maxScroll = itemListEl.scrollHeight - itemListEl.clientHeight;
  const prev = itemListEl.scrollTop;
  const next = Math.max(0, Math.min(maxScroll, prev + delta));
  if (next === prev) return false;
  itemListEl.scrollTop = next;
  return true;
}

function _dragTick() {
  if (!_itemDragState) return;
  _itemDragState.rafHandle = null;

  /* B-032 — auto-scroll edge zones (item drag only; AC11). Apply BEFORE
     cache rebuild so the rebuild (if it happens) sees post-scroll rects.
     When auto-scroll ran, schedule the next frame so the scroll continues
     while the pointer sits still in the edge zone (no dragover events
     fire between mouse-stationary frames). The existing dedup in
     `_scheduleDragTick` guarantees this is a no-op if a dragover-driven
     schedule already landed this frame (AC8 — single rAF loop). */
  if (_maybeAutoScroll()) _scheduleDragTick();

  /* Rebuild cache if scroll invalidated it (AC18 lazy rebuild). */
  if (!_dragRectCache || _dragRectCache.invalid) _buildDragRectCache();

  const target = _computeDropTarget(_pendingPointerX, _pendingPointerY);

  /* B-009 — hover-hold timer management. Independent of drop target
     (a collapsed group can be hovered while targeting another drop
     position; the timer just auto-expands the group so the user can
     then drop into it). */
  const hoveredGroup = _hoveredCollapsedGroup(_pendingPointerX, _pendingPointerY);
  if (hoveredGroup && (!_b009HoverState || _b009HoverState.groupId !== hoveredGroup)) {
    _clearB009Hover();
    _b009HoverState = {
      groupId: hoveredGroup,
      timerHandle: setTimeout(() => {
        /* Only fire if still hovering same group + drag still in flight. */
        if (_itemDragState && _b009HoverState && _b009HoverState.groupId === hoveredGroup) {
          _dragLog('b009 — expanding collapsed group', hoveredGroup);
          sendMessage(MSG_UPDATE_GROUP, { id: hoveredGroup, patch: { collapsed: false } })
            .catch(() => {/* best-effort; drag continues regardless */});
          _clearB009Hover();
        }
      }, DRAG_EXPAND_HOLD_MS),
    };
  } else if (!hoveredGroup && _b009HoverState) {
    /* Pointer left the collapsed-header — cancel timer per AC5. */
    _clearB009Hover();
  }

  /* B-033 — Open Tabs demote target. Distinct drop type; indicator is
     hidden (the section-level highlight class is the affordance). */
  if (target && target.type === 'openTabs') {
    _itemDragState.pendingDropType = 'openTabs';
    _itemDragState.pendingTargetRowId = null;
    _itemDragState.pendingInsertPosition = null;
    _itemDragState.pendingDestGroupId = null;
    /* Section highlight — applied via class for simple, non-conflicting UX. */
    const openTabsEl = document.getElementById('open-tabs-section');
    if (openTabsEl) openTabsEl.classList.add('open-tabs-section--drop-target');
    itemDragIndicatorEl.style.opacity = '0';
    itemDragIndicatorEl.style.transform = 'translateY(-9999px)';
    return;
  }

  /* Exiting openTabs target — remove highlight. */
  const openTabsEl = document.getElementById('open-tabs-section');
  if (openTabsEl) openTabsEl.classList.remove('open-tabs-section--drop-target');

  /* B-025 UAT-3 fix — empty-group drop target. Position indicator at the
     top edge of the empty group's `.group-items` container so the user gets
     an explicit "will drop here" affordance above the empty-state label.
     `pendingTargetRowId` is null for this path; `pendingDestGroupId`
     carries the target identity through to drop. destIndex is always 0
     (the group has no siblings after payload exclusion). */
  if (target && target.type === 'emptyGroup') {
    _itemDragState.pendingDropType = 'emptyGroup';
    _itemDragState.pendingTargetRowId = null;
    _itemDragState.pendingInsertPosition = null;
    _itemDragState.pendingDestGroupId = target.destGroupId;

    /* Fresh rect read for the empty container — not in _dragRectCache (that
       cache only tracks `.item-row`). This is a rare path (only fires when
       the pointer hovers an empty group), so the extra layout read is
       cheap; no rAF amplification concern. */
    const groupItemsEl = itemListEl.querySelector(
      `#group-items-${CSS.escape(target.destGroupId)}`,
    );
    if (groupItemsEl) {
      const rect = groupItemsEl.getBoundingClientRect();
      const containerRect = _dragRectCache.containerRect;
      const scrollTop = itemListEl.scrollTop;
      const y = rect.top - containerRect.top + scrollTop;
      itemDragIndicatorEl.style.transform = `translateY(${y}px)`;
      itemDragIndicatorEl.style.opacity = '1';
    }
    _dragLog('tick (emptyGroup)', { destGroupId: target.destGroupId });
    return;
  }

  if (!target) {
    /* No valid drop target under pointer — hide indicator, clear pending. */
    itemDragIndicatorEl.style.opacity = '0';
    itemDragIndicatorEl.style.transform = 'translateY(-9999px)';
    _itemDragState.pendingDropType = null;
    _itemDragState.pendingTargetRowId = null;
    _itemDragState.pendingInsertPosition = null;
    _itemDragState.pendingDestGroupId = null;
    return;
  }

  /* target.type === 'item' — B-030 reorder path. */
  _itemDragState.pendingDropType = 'item';
  _itemDragState.pendingDestGroupId = null;

  /* Skip-no-op (AC17 skip): if target unchanged since last tick, do
     nothing. Prevents visual jitter + avoids unnecessary CSS writes. */
  if (target.rowId === _itemDragState.pendingTargetRowId
    && target.insertPosition === _itemDragState.pendingInsertPosition) {
    return;
  }

  _itemDragState.pendingTargetRowId = target.rowId;
  _itemDragState.pendingInsertPosition = target.insertPosition;

  /* SINGLE DOM write per frame: indicator transform + opacity. */
  const rect = _dragRectCache.rects.get(target.rowId);
  const containerRect = _dragRectCache.containerRect;
  /* Account for itemListEl scrollTop so absolute position is container-local. */
  const scrollTop = itemListEl.scrollTop;
  const y = (target.insertPosition === 'after' ? rect.bottom : rect.top)
    - containerRect.top + scrollTop;
  itemDragIndicatorEl.style.transform = `translateY(${y}px)`;
  itemDragIndicatorEl.style.opacity = '1';
  _dragLog('tick', { rowId: target.rowId, pos: target.insertPosition, y });
}

/* _computeDropTarget — R2 contract + B-033 Open Tabs demote target.
   Returns one of:
     {type:'item', rowId, insertPosition}      — normal item reorder (B-030)
     {type:'openTabs'}                         — B-033 demote (saved+live only)
     {type:'emptyGroup', destGroupId}          — B-025 UAT-3 fix: drop into
                                                 a group that has zero
                                                 item-rows (AC13e empty-dest)
     null                                      — no valid drop
   Uses elementFromPoint (cheap — no layout). Indicator has
   pointer-events: none (AC23) so it's never a hit target. */
function _computeDropTarget(x, y) {
  if (!_itemDragState) return null;
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;

  /* B-033 — Open Tabs demote target. Only accept if dragged item is
     saved+live (has a matching live tab). Saved-only drags rejected
     per AC3: handler returns null → indicator hides, no drop. */
  if (hit.closest('.open-tabs-section')) {
    /* B-025 AC9 (fix B-025-H3) — multi-drag onto Open Tabs is a no-op:
       return null so no indicator renders and drop handler receives no
       valid target. Prevents silent partial demote of just the initiator. */
    if (_itemDragState.isMulti) return null;
    const liveState = _cachedLiveStates[_itemDragState.itemId];
    if (liveState && liveState.live) return { type: 'openTabs' };
    return null;
  }

  /* B-030 — normal item-reorder target. */
  const row = hit.closest('.item-row');
  if (row) {
    const id = row.dataset.itemId;
    /* B-025 — self-exclusion covers every payload member (not just initiator)
       so multi-drag pointer hover over a sibling in the payload is rejected. */
    if (!id || (_itemDragState.payloadSet && _itemDragState.payloadSet.has(id))) return null;

    const rect = _dragRectCache.rects.get(id);
    if (!rect) return null;
    const mid = rect.top + rect.height / 2;
    return { type: 'item', rowId: id, insertPosition: y < mid ? 'before' : 'after' };
  }

  /* B-025 UAT-3 fix — empty-group drop target (AC13e). When the pointer
     doesn't land on any `.item-row`, check whether the hit is inside a
     `.group-items` container whose group has ZERO item-rows (it only
     contains the `.group-items-empty` affordance built at line 3005+).
     Dropping into an empty group is otherwise impossible via B-030's
     hit-test — the pre-fix code returned null here and the drop silently
     no-op'd. Applies to BOTH single-item (B-030) and multi-item (B-025)
     drags: the bug was long-standing on the single-item path too. */
  const groupItemsEl = hit.closest('.group-items');
  if (groupItemsEl && groupItemsEl.querySelector('.item-row') === null) {
    const section = groupItemsEl.closest('.group-section[data-group-id]');
    if (section && section.dataset && section.dataset.groupId) {
      /* Filter out matches inside Open Tabs — defensive. Open Tabs uses its
         own section class; a `.group-items` ancestor should never sit inside
         `.open-tabs-section`, but if the DOM evolves, an explicit guard keeps
         AC9 (multi-drag onto Open Tabs → null) intact. */
      if (section.closest('.open-tabs-section')) return null;
      return { type: 'emptyGroup', destGroupId: section.dataset.groupId };
    }
  }

  return null;
}

/* B-009 — return groupId of a collapsed group whose header is at (x,y),
   or null. Used by _dragTick to manage the hover-hold timer. */
function _hoveredCollapsedGroup(x, y) {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;
  const header = hit.closest('.group-header');
  if (!header) return null;
  /* Skip Open Tabs header — "Open Tabs" doesn't collapse in the same way. */
  if (header.closest('.open-tabs-section')) return null;
  const section = header.closest('.group-section');
  if (!section || !section.dataset || !section.dataset.groupId) return null;
  const groupId = section.dataset.groupId;
  /* Only interested in COLLAPSED groups. */
  const group = _cachedGroups.find((g) => g.id === groupId);
  if (!group || !group.collapsed) return null;
  return groupId;
}

/* B-009 — clear hover-hold timer + state. Called from _dragTick when the
   user moves off the header, and from _cleanupItemDragDom on dragend. */
function _clearB009Hover() {
  if (_b009HoverState && _b009HoverState.timerHandle != null) {
    clearTimeout(_b009HoverState.timerHandle);
  }
  _b009HoverState = null;
}

/* B-025 — apply `item-row--dragging` to every payload member at dragstart.
   Single-item drags are a 1-element array; multi-drag covers all selected
   items in the same source group. */
function _setMultiDragRowClasses(ids) {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    const row = itemListEl.querySelector(`.item-row[data-item-id="${CSS.escape(id)}"]`);
    if (row) row.classList.add('item-row--dragging');
  }
}

/* B-025 — remove `item-row--dragging` from every payload member. Mirror of
   `_setMultiDragRowClasses`. Paired with the blanket querySelectorAll sweep
   in `_cleanupItemDragDom` so we clean up even if a row was detached from
   the DOM mid-drag (belt-and-braces). */
function _clearMultiDragRowClasses(ids) {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    const row = itemListEl.querySelector(`.item-row[data-item-id="${CSS.escape(id)}"]`);
    if (row) row.classList.remove('item-row--dragging');
  }
}

/* B-025 — off-screen custom drag ghost constructed at dragstart. Appended to
   `document.body` for the browser to snapshot via `setDragImage`; detached
   one microtask later (§37.9 F-6). Content written via `textContent` only —
   bookmark titles are untrusted. */
function _buildMultiDragGhost(count, title) {
  const el = document.createElement('div');
  el.className = 'multi-drag-ghost';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = title;
  el.appendChild(titleSpan);
  const badge = document.createElement('span');
  badge.className = 'multi-drag-ghost__badge';
  badge.textContent = count + ' items';
  el.appendChild(badge);
  document.body.appendChild(el);
  return el;
}

/* B-025 — shared commit-and-render tail (§37.3 D-2). Both the single-item
   (B-030) and multi-item (B-025) drop branches funnel here after computing
   their `updates` array. Mirrors the pre-existing B-030 post-drop refetch +
   renderAll pattern — explicit renderAll because hashItem does not include
   `sortOrder`, so a reorder-only change would otherwise produce no DOM
   patch (B-052 follow-up; see §36 and §37.3 D-2). */
async function _commitReorderAndRender(updates, opts = {}) {
  const { isMulti = false } = opts;
  try {
    await sendMessage(MSG_BULK_REORDER_ITEMS, { updates });
    const [itemsResp, groups] = await Promise.all([
      sendMessage(MSG_LIST_ITEMS),
      sendMessage(MSG_LIST_GROUPS),
    ]);
    _setWindowOrdinalMap(itemsResp.windowMap || {});
    renderAll(itemsResp.items, groups, itemsResp.liveStates,
      itemsResp.driftRecords, itemsResp.openTabs);
    _applyWindowMapToUI();
    /* B-025 M-1 fix — clear selection after successful multi-drop (UAT-8).
       Only on multi-drops: single-item drags do not touch _selection, so
       forcing a clear on single-item drops would be surprising. Intentionally
       outside the catch block — on failure we revert to the pre-drop state
       and leave selection intact so the user can retry. */
    if (isMulti) {
      _selection.clear();
      _updateBulkBar();
    }
  } catch (err) {
    console.warn('[tab-junkie:item-drag] bulkReorderItems failed', err);
    showToast('Couldn\u2019t save new order \u2014 reverting');
    Promise.all([sendMessage(MSG_LIST_ITEMS), sendMessage(MSG_LIST_GROUPS)])
      .then(([itemsResp, groups]) => {
        _setWindowOrdinalMap(itemsResp.windowMap || {});
        renderAll(itemsResp.items, groups, itemsResp.liveStates,
          itemsResp.driftRecords, itemsResp.openTabs);
        _applyWindowMapToUI();
      })
      .catch(() => {});
  }
}

/* _cleanupItemDragDom — clear indicator, dragging class, scroll listener,
   pending rAF. Called from drop (after consuming state) + dragend (cancel).
   Also clears B-009 hover-hold timer + B-033 Open Tabs drop-target
   highlight so those cross-ownership helpers don't leak past a drag.

   B-025 — iterate `state.payloadItemIds` so every dragged row (not just
   the initiator) gets its `item-row--dragging` class removed. The blanket
   querySelectorAll sweep below handles DOM-attached rows; the explicit
   iteration catches the rare case where a row was removed mid-drag (the
   class would otherwise linger on re-added rows via DOM reuse). */
function _cleanupItemDragDom() {
  itemDragIndicatorEl.style.opacity = '0';
  itemDragIndicatorEl.style.transform = 'translateY(-9999px)';
  itemListEl.classList.remove('is-item-dragging');
  if (_itemDragState && Array.isArray(_itemDragState.payloadItemIds)) {
    _clearMultiDragRowClasses(_itemDragState.payloadItemIds);
  }
  itemListEl.querySelectorAll('.item-row--dragging').forEach((row) => {
    row.classList.remove('item-row--dragging');
  });
  if (_itemDragState) {
    if (_itemDragState.rafHandle != null) {
      cancelAnimationFrame(_itemDragState.rafHandle);
    }
    if (_itemDragState.scrollListener) {
      itemListEl.removeEventListener('scroll', _itemDragState.scrollListener);
    }
  }
  _dragRectCache = null;
  /* B-009 cleanup. */
  _clearB009Hover();
  /* B-033 cleanup. */
  const openTabsEl = document.getElementById('open-tabs-section');
  if (openTabsEl) openTabsEl.classList.remove('open-tabs-section--drop-target');
}

/* =========================================================================
   B-031 — group drag helpers

   Mirror of the B-030 item-drag helpers — same rAF-coalesced tick, same
   rect cache pattern, same invalidate-on-scroll approach. Only the
   hit-test (`.group-header` vs `.item-row`) and the indicator logic
   (REORDER line vs NEST highlight vs rejection) differ.
   ========================================================================= */

/* Snapshot every `.group-section > .group-header` rect in a single pass,
   plus each `.group-section` bottom edge (keyed by groupId) for the
   REORDER_BELOW indicator. Rebuilt on scroll invalidation via the lazy
   check in `_groupDragTick`. Keeping both in one cache avoids a live
   `getBoundingClientRect` in the rAF hot-path (B-031 H-3 fix). */
function _buildGroupDragRectCache() {
  const rects = new Map();
  const sectionBottoms = new Map();
  const headers = itemListEl.querySelectorAll('.group-section > .group-header[data-group-id]');
  for (const header of headers) {
    const id = header.dataset.groupId;
    if (!id) continue;
    rects.set(id, header.getBoundingClientRect());
    const section = header.parentElement;
    if (section && section.classList.contains('group-section')) {
      sectionBottoms.set(id, section.getBoundingClientRect().bottom);
    }
  }
  _groupDragRectCache = {
    rects,
    sectionBottoms,
    containerRect: itemListEl.getBoundingClientRect(),
    invalid: false,
  };
}

/* Dedup via rafHandle so at most one rAF is pending per frame —
   dragover fires at browser cadence; rAF provides coalescing. */
function _scheduleGroupDragTick() {
  if (!_groupDragState || _groupDragState.rafHandle != null) return;
  _groupDragState.rafHandle = requestAnimationFrame(_groupDragTick);
}

function _groupDragTick() {
  if (!_groupDragState) return;
  _groupDragState.rafHandle = null;

  if (!_groupDragRectCache || _groupDragRectCache.invalid) _buildGroupDragRectCache();

  const target = _computeGroupDropTarget(_pendingGroupPointerX, _pendingGroupPointerY);

  if (!target) {
    /* No valid target under pointer — hide indicator + clear any
       previously-applied class on the pending target. Also clear
       `pendingProposedMode` (B-084) so the next hover over a header
       starts fresh without inheriting hysteresis state from a prior
       header's geometry. */
    _hideGroupDragVisuals();
    _groupDragState.pendingTargetGroupId = null;
    _groupDragState.pendingMode = null;
    _groupDragState.pendingProposedMode = null;
    return;
  }

  /* Skip-no-op: if target + mode unchanged since last tick, nothing to do. */
  if (target.targetGroupId === _groupDragState.pendingTargetGroupId
    && target.mode === _groupDragState.pendingMode) {
    return;
  }

  /* Clear prior visuals before applying new ones — mutual exclusivity:
     at most ONE of {REORDER line, NEST highlight, REJECT highlight}
     active at any time. */
  _hideGroupDragVisuals();

  _groupDragState.pendingTargetGroupId = target.targetGroupId;
  _groupDragState.pendingMode = target.mode;

  if (target.mode === 'REJECT') {
    /* Apply the rejection indicator class to the target header. Keeps the
       "this won't work" feedback visible without performing the drop. */
    const header = itemListEl.querySelector(
      `.group-section > .group-header[data-group-id="${CSS.escape(target.targetGroupId)}"]`,
    );
    if (header) header.classList.add('group-header--nest-reject');
    return;
  }

  if (target.mode === 'NEST') {
    const header = itemListEl.querySelector(
      `.group-section > .group-header[data-group-id="${CSS.escape(target.targetGroupId)}"]`,
    );
    if (header) header.classList.add('group-header--nest-target');
    return;
  }

  /* REORDER_ABOVE / REORDER_BELOW — move the indicator to the target's
     top or bottom edge, accounting for container scroll. Single DOM
     write (transform + opacity) per frame. */
  const rect = _groupDragRectCache.rects.get(target.targetGroupId);
  if (!rect) return;
  const containerRect = _groupDragRectCache.containerRect;
  const scrollTop = itemListEl.scrollTop;
  /* For REORDER_BELOW on a header, we want the line at the bottom of the
     full .group-section (so it sits between siblings, not between the
     header and its own items). For REORDER_ABOVE, the top of the header
     is correct. */
  let y;
  if (target.mode === 'REORDER_ABOVE') {
    y = rect.top - containerRect.top + scrollTop;
  } else {
    /* REORDER_BELOW — anchor at the full section bottom, not header bottom,
       so the indicator sits clearly between sections. Uses the cached
       section-bottom value (built alongside the header rects in
       _buildGroupDragRectCache); falls back to the header rect bottom if
       missing for any reason. */
    const cachedBottom = _groupDragRectCache.sectionBottoms.get(target.targetGroupId);
    const sectionBottom = cachedBottom != null ? cachedBottom : rect.bottom;
    y = sectionBottom - containerRect.top + scrollTop;
  }
  groupReorderIndicatorEl.style.transform = `translateY(${y}px)`;
  groupReorderIndicatorEl.style.opacity = '1';
}

/* B-084 AC2 — hysteresis band for the REORDER↔NEST mode boundaries.

   Inputs:
     rawMode       — 'REORDER_ABOVE' | 'REORDER_BELOW' | 'NEST' from the
                     plain 25% / 75% ratio check.
     prevMode      — the previous tick's geometric mode (post-hysteresis),
                     or null on first tick.
     relY          — pointer Y relative to header top, in CSS pixels.
     headerHeight  — header height in CSS pixels.

   Returns the stabilised mode. When the pointer is within
   DEADZONE_PX of a boundary it would cross, the prior mode wins.
   Outside the deadzone, the raw ratio-driven mode applies. This
   prevents single-pixel jitter during fast motion from strobing the
   indicator between REORDER line and NEST box. At header heights
   below 8 px the deadzone is clamped to ¼ of the header so we never
   stall the transition entirely. Pixel-based deadzone slightly
   relaxes the zoom-robustness of §38.3 D-6 but at 2 px the effect is
   sub-frame at any practical zoom. */
function _applyGroupDragHysteresis(rawMode, prevMode, relY, headerHeight) {
  if (!prevMode || prevMode === rawMode) return rawMode;
  /* REJECT is validity-derived, not geometric — never feed it into this
     helper. Guarded by `pendingProposedMode` being set from post-hysteresis
     output only, but belt-and-suspenders. */
  if (prevMode === 'REJECT') return rawMode;

  const DEADZONE_PX = Math.min(2, headerHeight * 0.25);
  const topBoundaryPx = headerHeight * 0.25;
  const bottomBoundaryPx = headerHeight * 0.75;

  /* Leaving NEST toward a REORDER mode — stay in NEST if still within the
     deadzone of the boundary being crossed. */
  if (prevMode === 'NEST') {
    if (rawMode === 'REORDER_ABOVE' && (topBoundaryPx - relY) < DEADZONE_PX) return 'NEST';
    if (rawMode === 'REORDER_BELOW' && (relY - bottomBoundaryPx) < DEADZONE_PX) return 'NEST';
    return rawMode;
  }

  /* Leaving REORDER toward NEST — stay in REORDER if still within the
     deadzone of the same boundary. */
  if (prevMode === 'REORDER_ABOVE' && rawMode === 'NEST') {
    if ((relY - topBoundaryPx) < DEADZONE_PX) return 'REORDER_ABOVE';
  }
  if (prevMode === 'REORDER_BELOW' && rawMode === 'NEST') {
    if ((bottomBoundaryPx - relY) < DEADZONE_PX) return 'REORDER_BELOW';
  }
  /* Crossing the full header (e.g. REORDER_ABOVE → REORDER_BELOW directly
     without the pointer ever stopping in NEST) is rare but let it
     through unmodified — hysteresis only matters near boundaries. */
  return rawMode;
}

/* Returns {targetGroupId, mode} for the pointer position, or null when
   the pointer is not over any group header. `mode` is one of
   'REORDER_ABOVE' | 'REORDER_BELOW' | 'NEST' | 'REJECT'.

   `elementFromPoint` is cheap (no layout). The indicator has
   `pointer-events: none` so it's never a hit target. */
function _computeGroupDropTarget(x, y) {
  if (!_groupDragState) return null;
  const hit = document.elementFromPoint(x, y);
  if (!hit) return null;
  /* Must be a real group's header — Open Tabs header is not a valid
     group-drag target. */
  const header = hit.closest('.group-section > .group-header[data-group-id]');
  if (!header) return null;
  if (header.closest('.open-tabs-section')) return null;

  const targetGroupId = header.dataset.groupId;
  if (!targetGroupId) return null;
  /* Drop on self → no valid target. */
  if (targetGroupId === _groupDragState.draggedGroupId) return null;

  const rect = _groupDragRectCache.rects.get(targetGroupId);
  if (!rect) return null;

  /* Ratio-based zone detection: top 25% REORDER_ABOVE, middle 50% NEST,
     bottom 25% REORDER_BELOW (§38.3 D-6). Ratio is robust to browser zoom
     (pixel thresholds would change under zoom).

     B-084 AC2 — a ±2 px hysteresis band at each boundary prevents the
     indicator from strobing when the pointer jitters across 25% / 75%
     during fast motion. Implemented as a thin wrapper around the raw
     ratio→mode mapping (kept inline below) that keeps the previous
     geometric mode if the pointer is within the deadzone of the
     boundary it would be crossing. */
  const relY = y - rect.top;
  const rawMode =
      relY < rect.height * 0.25 ? 'REORDER_ABOVE'
    : relY > rect.height * 0.75 ? 'REORDER_BELOW'
    : 'NEST';
  /* Hysteresis only bleeds within a single header — crossing to a new
     header starts fresh (different geometry, different rect). Treat
     `prevMode` as null when the pointer has moved to a different
     target than last tick's pending target. */
  const prevGeoMode = targetGroupId === _groupDragState.pendingTargetGroupId
    ? _groupDragState.pendingProposedMode
    : null;
  const proposedMode = _applyGroupDragHysteresis(
    rawMode,
    prevGeoMode,
    relY,
    rect.height,
  );
  /* Record the post-hysteresis geometric mode for the next tick's
     comparison. Stored separately from `pendingMode` so REJECT (which
     comes from validity checks below, not from geometry) never
     poisons this value. */
  _groupDragState.pendingProposedMode = proposedMode;

  /* `__ungrouped__` pseudo-group handling (B-031 H-4):
     - NEST zone: return REJECT so the rejection class paints on the header
       (UAT-10 feedback — user tried to nest INTO Ungrouped).
     - REORDER zones: return null so adjacent real-group headers on either
       side can take over the REORDER hit-test naturally (AC15d). */
  if (targetGroupId === '__ungrouped__') {
    if (proposedMode === 'NEST') return { targetGroupId, mode: 'REJECT' };
    return null;
  }

  /* Validate against the prebuilt Sets (O(1) each). A proposed REORDER
     against a non-sibling, or a proposed NEST on a sub-group drag (or
     onto a non-candidate) surfaces as REJECT rather than being silently
     swapped — the user sees the rejection cue and can adjust. */
  if (proposedMode === 'NEST') {
    if (_groupDragState.isSubGroupDrag) return { targetGroupId, mode: 'REJECT' };
    if (!_groupDragState.validNestTargetIds.has(targetGroupId)) {
      return { targetGroupId, mode: 'REJECT' };
    }
    return { targetGroupId, mode: 'NEST' };
  }

  /* REORDER_ABOVE / REORDER_BELOW. */
  if (!_groupDragState.validReorderTargetIds.has(targetGroupId)) {
    /* Target is not a sibling — can't REORDER into a different bucket via
       drag (no promote-by-drag at this layer). */
    return null;
  }
  return { targetGroupId, mode: proposedMode };
}

/* Clear any active group-drag visuals — REORDER indicator + both header
   classes. Called from the tick when target changes, and from cleanup. */
function _hideGroupDragVisuals() {
  groupReorderIndicatorEl.style.opacity = '0';
  groupReorderIndicatorEl.style.transform = 'translateY(-9999px)';
  itemListEl.querySelectorAll('.group-header--nest-target').forEach((el) => {
    el.classList.remove('group-header--nest-target');
  });
  itemListEl.querySelectorAll('.group-header--nest-reject').forEach((el) => {
    el.classList.remove('group-header--nest-reject');
  });
}

/* Full cleanup: visuals + rAF + scroll listener + rect cache. Called from
   drop (after consuming state) + dragend (cancel). Does NOT clear
   `_dragSrcGroupId` — that's the B-008 `_pendingGroupsRender` gate and is
   cleared by the generic dragend tail below. */
function _cleanupGroupDragDom() {
  _hideGroupDragVisuals();
  if (_groupDragState) {
    if (_groupDragState.rafHandle != null) {
      cancelAnimationFrame(_groupDragState.rafHandle);
    }
    if (_groupDragState.scrollListener) {
      itemListEl.removeEventListener('scroll', _groupDragState.scrollListener);
    }
  }
  _groupDragRectCache = null;
}

/* =========================================================================
   Broadcast listener (B4 — sender validation)
   ========================================================================= */

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg.type !== MSG_STATE_CHANGED) return;

  const scope = msg.payload?.scope;

  /* B1 — liveState scope only patches attributes, no DOM rebuild */
  if (scope === 'liveState') {
    refetchAndPatchLiveState().catch((err) => {
      console.warn('[tab-junkie] live-state patch failed:', err);
    });
    return;
  }

  /* B-014 AC17: windowMap scope — refresh only the ordinal map, filter row,
     and existing badges. Does NOT call renderAll. */
  if (scope === SCOPE.WINDOW_MAP) {
    sendMessage(MSG_LIST_ITEMS).then((itemsResp) => {
      _setWindowOrdinalMap(itemsResp.windowMap || {});
      _refreshPanelWindowId();
      /* Keep caches in sync so a subsequent text-filter application reads
         the freshest windowId data. */
      _cachedLiveStates = itemsResp.liveStates || {};
      _setCachedOpenTabs(itemsResp.openTabs);
      /* B-014 M-3: refresh Open Tabs DOM (specifically `data-window-id`
         attributes) BEFORE `_applyWindowMapToUI` so the badge pass reads the
         up-to-date values. Without this, the badge pass can render stale
         ordinals when a tab moves between windows and the windowMap
         broadcast arrives before the liveState broadcast. */
      patchOpenTabsSection(_cachedOpenTabs);
      _applyWindowMapToUI();
      /* B-014 UAT: re-apply filter so a window-filtered view stays in sync
         after the map changes (e.g., the filtered window closed, or a tab
         moved between windows). */
      if (_filterQuery || _activeWindowFilter !== null) applyFilter();
    }).catch((err) => {
      console.warn('[tab-junkie] windowMap broadcast re-fetch failed:', err);
    });
    return;
  }

  if (scope === 'items' || scope === 'groups') {
    if (scope === 'groups' && _dragSrcGroupId) {
      _pendingGroupsRender = true;
      return;
    }
    Promise.all([
      sendMessage(MSG_LIST_ITEMS),
      sendMessage(MSG_LIST_GROUPS),
    ]).then(([itemsResp, groups]) => {
      /* B-014: every list response carries the current map. Apply before
         rendering so fresh rows are built with the correct badges. */
      _setWindowOrdinalMap(itemsResp.windowMap || {});
      _refreshPanelWindowId();

      /* B-052 §34.4: on an items-scope broadcast, diff the incoming items
         against the cached index. Small deltas patch DOM + index in place
         (AC5); large deltas (bulk import, group-scoped cascade, empty
         cache) fall through to `renderAll`. The diff is skipped when:
           - scope === 'groups' (group render needs a full rebuild because
             section DOM encodes group identity)
           - the feature gate is off (§34.11 rollback path)
           - the index has been disabled by the graceful-degrade path
           - the cached items count is zero (cold-open never patches) */
      const canPatch =
        SEARCH_INDEX_ENABLED &&
        !_searchIndexDisabled &&
        _searchIndex !== null &&
        scope === 'items' &&
        _cachedItems.length > 0;

      let patched = false;
      if (canPatch) {
        const delta = diffAndPatch(_searchIndex, itemsResp.items);
        if (delta.deltaType === 'noop') {
          /* Live-state / drift / openTabs may still have changed. Keep
             caches fresh but skip the full DOM rebuild — renderAll would
             thrash. Re-apply the filter so a sticky query's row-visibility
             stays consistent with the refreshed liveStates. */
          _cachedItems = itemsResp.items;
          _cachedItemsGen += 1;
          _cachedGroups = groups;
          _cachedGroupsGen += 1;
          _cachedLiveStates = itemsResp.liveStates || {};
          _cachedDriftRecords = itemsResp.driftRecords || {};
          _setCachedOpenTabs(itemsResp.openTabs);
          _searchIndex = delta.index;
          _applyWindowMapToUI();
          if (_filterQuery || _activeWindowFilter !== null) applyFilter();
          patched = true;
        } else if (delta.deltaType === 'patch') {
          /* S28 B-035 UAT-4: if any updated item's sortOrder changed vs
             cache, _patchSingleRow's `existing.replaceWith(freshRow)` keeps
             the OLD DOM position — remote surfaces show stale order. Skip
             the patch branch and fall through to renderAll, which rebuilds
             the DOM in fresh sortOrder order. Check BEFORE overwriting
             caches so the prior sortOrder is still readable via _itemById. */
          const hasReorder = delta.affected.some((change) => {
            if (change.kind !== 'updated') return false;
            const prev = _itemById.get(change.id);
            const next = itemsResp.items.find((it) => it.id === change.id);
            return prev && next && (prev.sortOrder ?? 0) !== (next.sortOrder ?? 0);
          });

          if (!hasReorder) {
            /* Update caches so `buildItemRow` reads the freshest data as it
               constructs the replacement rows. */
            _cachedItems = itemsResp.items;
            _cachedItemsGen += 1;
            _cachedGroups = groups;
            _cachedGroupsGen += 1;
            _cachedLiveStates = itemsResp.liveStates || {};
            _cachedDriftRecords = itemsResp.driftRecords || {};
            _setCachedOpenTabs(itemsResp.openTabs);
            _itemById = new Map(itemsResp.items.map((it) => [it.id, it]));
            _searchIndex = delta.index;

            /* Apply row deltas in delta.affected order (remove → update →
               add). Abort to full rebuild at the first delta the DOM can't
               service (e.g. a new row for a group that isn't rendered yet). */
            let allApplied = true;
            for (const change of delta.affected) {
              if (!_patchSingleRow(change)) { allApplied = false; break; }
            }
            if (allApplied) {
              _applyWindowMapToUI();
              if (_filterQuery || _activeWindowFilter !== null) applyFilter();
              patched = true;
            }
          }
          /* else: patched stays false → fall through to renderAll below */
        }
        /* 'full-rebuild' deltas fall through to `renderAll` below. */
      }

      if (!patched) {
        renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords, itemsResp.openTabs);
        _applyWindowMapToUI();
      }

      /* B-029 H-2: rebuild the picker body if a groups-scope broadcast
         arrived while it was open (e.g. a group was deleted/renamed from
         another window). Preserves filter text and the highlighted group id
         if that group still exists. */
      if (scope === 'groups') _refreshGroupPickerIfOpen();
    }).catch((err) => {
      console.warn('[tab-junkie] broadcast re-fetch failed:', err);
    });
  }

  if (scope === 'preferences') {
    sendMessage(MSG_GET_PREFERENCES).then((prefs) => {
      applyTheme(prefs.theme);
      /* B-092: re-evaluate compact-layout body class on every prefs
         broadcast so a toggle from the Settings tab propagates here without
         a sidepanel reload. */
      applyDenseLayout(prefs);
    }).catch(() => {});
  }
});

/* =========================================================================
   Filter event listeners (B-021)
   ========================================================================= */

/* Filter: debounced input */
filterInputEl.addEventListener('input', () => {
  _filterQuery = filterInputEl.value;
  filterClearBtnEl.hidden = !_filterQuery;
  clearTimeout(_filterTimer);
  _filterTimer = setTimeout(applyFilter, 150);
});

/* Filter: Escape to clear */
filterInputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    clearFilter();
  }
});

/* Filter: clear button */
filterClearBtnEl.addEventListener('click', clearFilter);

/* Filter: CTA button in filter empty state (B-049) */
filterEmptyClearBtnEl.addEventListener('click', clearFilter);

/* =========================================================================
   Bulk action bar listeners (B-024)
   ========================================================================= */

bulkClearBtn.addEventListener('click', () => {
  _clearSelection();
});

/* -------------------------------------------------------------------------
   B-028: named bulk handlers shared by the bulk action bar AND the
   selection-aware context menu. Both entry points dispatch through the
   same functions so mixed-selection rules stay in one place.
   ------------------------------------------------------------------------- */

/**
 * B-028: bulk Remove — saved-items only. Demotes live items and bulk-deletes
 * non-live items. Partial-failure tolerant. Triggered by bulk bar and by the
 * selection context menu's "Remove bookmarks" action.
 */
function _bulkRemove() {
  /* B-051 M-1: drop item keys that no longer resolve to a live saved item
     before snapshotting. Open-tab keys are untouched — they self-clean on
     tabs.onRemoved. */
  _pruneStaleSelection();
  /* B-055 AC12: "Remove" is only valid for saved-item selections. The button
     is hidden whenever an open-tab row is in the selection, but guard again
     here defensively in case an event races a selection change. */
  const { itemIds, tabIds } = _partitionSelection();
  if (tabIds.length > 0 || itemIds.length === 0) return;
  const count = itemIds.length;

  /* B-024 C-2 / H-7: bulk-appropriate confirm copy; live tabs are demoted, not closed. */
  const syntheticItem = { title: count + ' items' };
  openConfirmDialog(
    syntheticItem,
    async () => {
      /* For live items, demote first (preserves tabs) */
      const liveIds = itemIds.filter((id) => {
        const ls = _cachedLiveStates[id];
        return ls && ls.live;
      });
      const nonLiveIds = itemIds.filter((id) => {
        const ls = _cachedLiveStates[id];
        return !ls || !ls.live;
      });

      /* B-024 H-5: demote live items in parallel with Promise.allSettled so a
         single failure does not abort the remaining demotes or the bulk delete.
         Fulfilled IDs are pruned from _selection; rejected IDs remain selected
         so the user can retry. */
      const demoteResults = await Promise.allSettled(
        liveIds.map((id) =>
          sendMessage(MSG_DEMOTE_ITEM, { itemId: id }).then(() => id),
        ),
      );
      const demotedOk = [];
      let demoteFailures = 0;
      for (let i = 0; i < demoteResults.length; i++) {
        const r = demoteResults[i];
        if (r.status === 'fulfilled') {
          demotedOk.push(liveIds[i]);
        } else {
          demoteFailures++;
        }
      }

      /* Bulk-delete non-live items */
      let bulkDeleteOk = false;
      if (nonLiveIds.length > 0) {
        try {
          await sendMessage(MSG_BULK_DELETE_ITEMS, { ids: nonLiveIds });
          bulkDeleteOk = true;
        } catch {
          bulkDeleteOk = false;
        }
      } else {
        bulkDeleteOk = true; // nothing to delete — treat as success
      }

      /* Prune succeeded IDs from _selection (leave failures selected for retry). */
      for (const id of demotedOk) {
        const key = 'item:' + id;
        _selection.delete(key);
        const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]:not([data-live-only])`);
        _setRowSelected(row, false);
      }
      if (bulkDeleteOk) {
        for (const id of nonLiveIds) {
          const key = 'item:' + id;
          _selection.delete(key);
          const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]:not([data-live-only])`);
          _setRowSelected(row, false);
        }
      }

      const totalFailures = demoteFailures + (bulkDeleteOk ? 0 : nonLiveIds.length);
      if (totalFailures > 0) {
        showToast('Couldn\u2019t remove ' + totalFailures + ' item(s) \u2014 try again');
      }

      if (_selection.size === 0) {
        _clearSelection();
      } else {
        _updateBulkBar();
      }
    },
    {
      heading: 'Remove ' + count + ' items?',
      body: 'Saved entries will be removed. Live tab(s) in the selection will remain open.',
    },
  );
}

/**
 * B-028: bulk Close — closes every live tab in the current selection.
 * Includes open-tab rows (always live) and saved-item rows whose liveStates
 * entry is `live: true`. Safe for mixed selections.
 */
async function _bulkClose() {
  /* B-051 M-1: prune stale item keys before snapshotting. */
  _pruneStaleSelection();
  /* B-055 AC12: include BOTH saved-item live tabs and open-tab rows. */
  const { itemIds, tabIds } = _partitionSelection();
  const liveTabIds = [...tabIds];
  for (const id of itemIds) {
    const ls = _cachedLiveStates[id];
    if (ls && ls.live && ls.tabId != null) {
      liveTabIds.push(ls.tabId);
    }
  }
  if (liveTabIds.length === 0) return;
  try {
    await sendMessage(MSG_CLOSE_TABS, { tabIds: liveTabIds });
    _clearSelection();
  } catch {
    showToast('Couldn\u2019t close tabs \u2014 try again');
  }
}

/**
 * B-029 H-3: translate a move/dispatch rejection into a user-visible toast
 * message. Centralises ERR_SAFE_MODE / ERR_NOT_FOUND handling so all three
 * picker-driven move paths surface consistent, actionable errors instead of
 * the generic "Couldn't move bookmarks — try again".
 *
 * @param {any} err rejection value from sendMessage (may be a StorageError
 *   with `.code`, a plain Error, or any other thrown value)
 * @returns {string} toast text
 */
function _translateMoveError(err) {
  const code = err?.code;
  if (code === ERR_SAFE_MODE) return 'Read-only mode \u2014 can\u2019t move items';
  if (code === ERR_NOT_FOUND) return 'Target group no longer exists';
  return 'Couldn\u2019t complete the move \u2014 try again';
}

/**
 * B-028: core "Move / Save to group" dispatch — applied to whatever the
 * current selection partitions into. Mixed selections are rejected per
 * §26.6 (the caller should hide the control entirely for mixed selections,
 * but the guard stays here defensively).
 *
 * @param {string|null} groupId — target group id, or null for Ungrouped
 */
async function _bulkMoveToGroup(groupId) {
  /* B-051 M-1: prune stale item keys before snapshotting. */
  _pruneStaleSelection();
  const { itemIds, tabIds } = _partitionSelection();

  /* B-055 AC12: mixed selection has no valid Move action. */
  if (itemIds.length > 0 && tabIds.length > 0) return;

  if (tabIds.length > 0) {
    /* B-059: client-side duplicate pre-scan. If any of the selected tabs' URLs
       already match a saved item, show a single aggregate confirm before
       dispatching any MSG_PROMOTE_TAB. See SOLUTION_DESIGN §29.6.4. */
    const duplicates = [];
    for (const tabId of tabIds) {
      const tab = _cachedOpenTabsById.get(tabId);
      if (!tab) continue;
      const existing = _findDuplicateSavedItem(tab.url || '');
      if (existing) duplicates.push({ tabId, existing });
    }

    const proceed = async () => {
      /* All-open-tabs: promote each tab individually. Partial-failure tolerant —
         MSG_PROMOTE_TAB runs per-tab and may reject for restricted schemes.
         B-059: ERR_DUPLICATE_URL is no longer emitted by the SW in steady state;
         the branch below remains only as a deploy-window fall-through. */
      const results = await Promise.allSettled(
        tabIds.map((tabId) => sendMessage(MSG_PROMOTE_TAB, { tabId, groupId })),
      );
      let failures = 0;
      let safeModeHit = false;
      let restrictedSchemes = 0;
      let otherFailures = 0;
      for (const r of results) {
        if (r.status === 'rejected') {
          failures++;
          const code = r.reason?.code;
          if (code === ERR_SAFE_MODE) safeModeHit = true;
          else if (code === ERR_VALIDATION) restrictedSchemes++;
          else otherFailures++;
        }
      }
      _clearSelection();
      if (safeModeHit) {
        showToast('Cannot save while in safe mode');
        return;
      }
      if (failures > 0) {
        /* Categorised toast surfaces the dominant failure reason instead of a
           generic message — makes bulk-promote failures actionable. */
        const parts = [];
        if (restrictedSchemes > 0) parts.push(restrictedSchemes + ' restricted URL');
        if (otherFailures > 0) parts.push(otherFailures + ' other error');
        const detail = parts.length > 0 ? ' (' + parts.join(', ') + ')' : '';
        showToast('Couldn\u2019t save ' + failures + ' tab(s)' + detail);
      }
    };

    if (duplicates.length === 0) {
      proceed();
      return;
    }

    /* B-059: one dialog, one decision. Cancel aborts everything; "Save all"
       dispatches the full selection (duplicates included). Per §29.6.3, a
       separate "Skip duplicates" action is explicitly out of scope. */
    openConfirmDialog(
      { title: tabIds.length + ' tabs' },
      proceed,
      {
        heading: duplicates.length + ' of ' + tabIds.length + ' tabs already saved',
        body:
          duplicates.length + ' of the ' + tabIds.length +
          ' selected tabs have URLs that are already saved. ' +
          'Saving will create additional copies alongside the existing ones.',
        confirmLabel: 'Save all ' + tabIds.length,
        variant: 'primary',
      },
    );
    return;
  }

  if (itemIds.length > 0) {
    try {
      await sendMessage(MSG_BULK_UPDATE_ITEMS, { ids: itemIds, patch: { groupId } });
      _clearSelection();
    } catch (err) {
      /* B-029 H-3: translate ERR_SAFE_MODE / ERR_NOT_FOUND to specific toasts
         instead of the generic message. */
      showToast(_translateMoveError(err));
    }
  }
}

bulkRemoveBtn.addEventListener('click', () => {
  _bulkRemove();
});

bulkCloseBtn.addEventListener('click', () => {
  _bulkClose();
});

/* B-024 + B-029: Move to group — opens the unified group picker modal.
   Caller 1 per §30.4. Mode toggles to 'save' when the selection is pure-tabs
   (matches the existing bulkMoveBtn label toggle at ~L1023). */
bulkMoveBtn.addEventListener('click', () => {
  const { itemIds, tabIds } = _partitionSelection();
  /* Mixed selections already hide the button via _updateBulkBar; guard defensively. */
  if (itemIds.length === 0 && tabIds.length === 0) return;
  const onlyTabs = tabIds.length > 0 && itemIds.length === 0;
  openGroupPickerDialog({
    mode: onlyTabs ? 'save' : 'move',
    sourceGroupId: null, /* selection can span groups — AC5 no-op */
    triggerEl: bulkMoveBtn,
    onSelect: (groupId) => {
      _bulkMoveToGroup(groupId);
    },
  });
});

/* =========================================================================
   Context menu (B-026)
   ========================================================================= */

let _contextMenuTriggerRow = null;

function closeContextMenu() {
  if (contextMenuEl.hidden) return;
  contextMenuEl.hidden = true;
  contextMenuEl.replaceChildren();
  if (_contextMenuTriggerRow) {
    _contextMenuTriggerRow.focus();
    _contextMenuTriggerRow = null;
  }
}

/* B-027: Group header context menu — right-click on a .group-header element.
 *
 * Actions:
 *   1. Open all bookmarks  — MSG_NAVIGATE_TO_ITEM per unsaved item (not live)
 *   2. Close all open tabs — MSG_CLOSE_TABS with confirm dialog
 *   3. Select all          — replace _selection with every item key in the group
 *   4. Select open         — select only items in the group that are live
 *   5. Select bookmarked   — select only items not currently live
 *   6. Edit group          — openGroupEditDialog
 *   7. Delete group        — openConfirmDialog + MSG_DELETE_GROUP
 *
 * Destructive actions (Close all open tabs, Delete group) use the
 * context-menu-item--destructive class. Separators between action groups.
 * Viewport clamping mirrors B-026 / B-028 / B-055 pattern.
 */
function _openGroupContextMenu(header, x, y) {
  closeContextMenu();
  _contextMenuTriggerRow = header;

  const groupId = header.dataset.groupId;
  if (!groupId || groupId === '__ungrouped__') return;

  const group = _cachedGroups.find((g) => g.id === groupId);
  if (!group) return;

  /* Derive group items and their live states from in-memory caches. */
  const groupItems = _cachedItems.filter((it) => it.groupId === groupId);
  const liveTabIds = groupItems
    .map((it) => _cachedLiveStates[it.id])
    .filter((ls) => ls && ls.live && ls.tabId != null)
    .map((ls) => ls.tabId);
  const openCount = liveTabIds.length;

  contextMenuEl.replaceChildren();

  /* 1. Open all bookmarks — navigates unsaved (not live) items. */
  const openAllBtn = document.createElement('button');
  openAllBtn.className = 'context-menu-item';
  openAllBtn.setAttribute('role', 'menuitem');
  openAllBtn.setAttribute('tabindex', '-1');
  openAllBtn.textContent = 'Open all bookmarks';
  openAllBtn.addEventListener('click', () => {
    closeContextMenu();
    const toOpen = groupItems.filter((it) => !_cachedLiveStates[it.id]?.live);
    Promise.allSettled(
      toOpen.map((it) => sendMessage(MSG_NAVIGATE_TO_ITEM, { itemId: it.id })),
    );
  });
  contextMenuEl.appendChild(openAllBtn);

  /* 2. Close all open tabs — destructive with confirmation. */
  const closeAllBtn = document.createElement('button');
  closeAllBtn.className = 'context-menu-item context-menu-item--destructive';
  closeAllBtn.setAttribute('role', 'menuitem');
  closeAllBtn.setAttribute('tabindex', '-1');
  closeAllBtn.textContent = 'Close all open tabs';
  closeAllBtn.disabled = openCount === 0;
  closeAllBtn.addEventListener('click', () => {
    closeContextMenu();
    if (openCount === 0) return;
    /* Re-read live state at action time so count is honest. */
    const liveIdsNow = groupItems
      .map((it) => _cachedLiveStates[it.id])
      .filter((ls) => ls && ls.live && ls.tabId != null)
      .map((ls) => ls.tabId);
    if (!liveIdsNow.length) return;
    openConfirmDialog(
      { title: group.name },
      () => {
        sendMessage(MSG_CLOSE_TABS, { tabIds: liveIdsNow }).catch(() => {
          showToast('Couldn\u2019t close tabs \u2014 try again');
        });
      },
      {
        heading: 'Close ' + liveIdsNow.length + ' open tab' + (liveIdsNow.length === 1 ? '' : 's') + '?',
        body: 'Close all open tabs in \u201c' + group.name + '\u201d? This cannot be undone.',
        triggerEl: header,
      },
    );
  });
  contextMenuEl.appendChild(closeAllBtn);

  /* Separator between open/close actions and select actions. */
  const sep1 = document.createElement('div');
  sep1.className = 'context-menu-separator';
  contextMenuEl.appendChild(sep1);

  /* 3. Select all — replaces _selection with every item key in this group. */
  const selectAllBtn = document.createElement('button');
  selectAllBtn.className = 'context-menu-item';
  selectAllBtn.setAttribute('role', 'menuitem');
  selectAllBtn.setAttribute('tabindex', '-1');
  selectAllBtn.textContent = 'Select all';
  selectAllBtn.addEventListener('click', () => {
    closeContextMenu();
    /* H-2 fix: clear + refill in a single pass; one trailing _updateBulkBar. */
    _selection.clear();
    for (const it of groupItems) {
      _selection.add('item:' + it.id);
    }
    _updateBulkBar();
  });
  contextMenuEl.appendChild(selectAllBtn);

  /* 4. Select open — selects only live items in this group. */
  const selectOpenBtn = document.createElement('button');
  selectOpenBtn.className = 'context-menu-item';
  selectOpenBtn.setAttribute('role', 'menuitem');
  selectOpenBtn.setAttribute('tabindex', '-1');
  selectOpenBtn.textContent = 'Select open';
  selectOpenBtn.addEventListener('click', () => {
    closeContextMenu();
    /* H-2 fix: single-render path (see selectAllBtn above). */
    _selection.clear();
    for (const it of groupItems) {
      if (_cachedLiveStates[it.id]?.live) {
        _selection.add('item:' + it.id);
      }
    }
    _updateBulkBar();
  });
  contextMenuEl.appendChild(selectOpenBtn);

  /* 5. Select bookmarked — selects only non-live (saved-only) items. */
  const selectBookmarkedBtn = document.createElement('button');
  selectBookmarkedBtn.className = 'context-menu-item';
  selectBookmarkedBtn.setAttribute('role', 'menuitem');
  selectBookmarkedBtn.setAttribute('tabindex', '-1');
  selectBookmarkedBtn.textContent = 'Select bookmarked';
  selectBookmarkedBtn.addEventListener('click', () => {
    closeContextMenu();
    /* H-2 fix: single-render path (see selectAllBtn above). */
    _selection.clear();
    for (const it of groupItems) {
      if (!_cachedLiveStates[it.id]?.live) {
        _selection.add('item:' + it.id);
      }
    }
    _updateBulkBar();
  });
  contextMenuEl.appendChild(selectBookmarkedBtn);

  /* 6. B-029: Move items out of group — opens the group picker with the
     source group excluded (AC5). Non-destructive; does not mutate _selection
     (§30.4.3) — we dispatch MSG_BULK_UPDATE_ITEMS directly with the full
     item set, bypassing _bulkMoveToGroup entirely. */
  const moveOutBtn = document.createElement('button');
  moveOutBtn.className = 'context-menu-item';
  moveOutBtn.setAttribute('role', 'menuitem');
  moveOutBtn.setAttribute('tabindex', '-1');
  moveOutBtn.textContent = 'Move items out of group';
  moveOutBtn.disabled = groupItems.length === 0;
  moveOutBtn.addEventListener('click', () => {
    closeContextMenu();
    if (groupItems.length === 0) return; /* defensive — disabled branch */
    const itemIds = groupItems.map((it) => it.id);
    openGroupPickerDialog({
      mode: 'move',
      sourceGroupId: groupId, /* AC5: exclude source */
      triggerEl: header,
      onSelect: (targetGroupId) => {
        sendMessage(MSG_BULK_UPDATE_ITEMS, {
          ids: itemIds,
          patch: { groupId: targetGroupId },
        }).catch((err) => {
          /* B-029 H-3: translate ERR_SAFE_MODE / ERR_NOT_FOUND consistently
             with the other picker callers. */
          showToast(_translateMoveError(err));
        });
      },
    });
  });
  contextMenuEl.appendChild(moveOutBtn);

  /* Separator before edit/delete group actions. */
  const sep2 = document.createElement('div');
  sep2.className = 'context-menu-separator';
  contextMenuEl.appendChild(sep2);

  /* 6. Edit group — opens the group edit dialog. */
  const editGroupBtn = document.createElement('button');
  editGroupBtn.className = 'context-menu-item';
  editGroupBtn.setAttribute('role', 'menuitem');
  editGroupBtn.setAttribute('tabindex', '-1');
  editGroupBtn.textContent = 'Edit group';
  editGroupBtn.addEventListener('click', () => {
    closeContextMenu();
    openGroupEditDialog(group, { triggerEl: header });
  });
  contextMenuEl.appendChild(editGroupBtn);

  /* 7. Delete group — destructive with confirmation. */
  const deleteGroupBtn = document.createElement('button');
  deleteGroupBtn.className = 'context-menu-item context-menu-item--destructive';
  deleteGroupBtn.setAttribute('role', 'menuitem');
  deleteGroupBtn.setAttribute('tabindex', '-1');
  deleteGroupBtn.textContent = 'Delete group';
  deleteGroupBtn.addEventListener('click', () => {
    closeContextMenu();
    openConfirmDialog(
      { title: group.name },
      () => {
        sendMessage(MSG_DELETE_GROUP, { id: groupId }).catch(() => {
          showToast('Couldn\u2019t delete group \u2014 try again');
        });
      },
      {
        heading: 'Delete group?',
        body: 'Delete \u201c' + group.name + '\u201d? All bookmarks in this group will be moved to Ungrouped.',
        triggerEl: header,
      },
    );
  });
  contextMenuEl.appendChild(deleteGroupBtn);

  /* Position with viewport clamping — mirrors B-026 / B-028 / B-055 pattern. */
  contextMenuEl.hidden = false;
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';

  const rect = contextMenuEl.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    contextMenuEl.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > window.innerWidth) {
    contextMenuEl.style.left = Math.max(0, x - rect.width) + 'px';
  }

  /* Focus first focusable menu item for keyboard nav. */
  const firstItem = contextMenuEl.querySelector('[role="menuitem"]');
  if (firstItem) firstItem.focus();
}

/**
 * B-028: selection-aware context menu. Opens when the clicked row is part of
 * a multi-item selection (_selection.size >= 2). Exposes the same action set
 * as the bulk action bar — Move / Save to group, Close tabs, Remove
 * bookmarks — and dispatches through the shared _bulkMove/_bulkClose/
 * _bulkRemove helpers so mixed-selection rules (§26.6) stay in one place.
 *
 * Mixed-selection visibility (mirrors _updateBulkBar):
 *   - Move/Save: hidden for mixed; label toggles "Save to group" when all-tabs,
 *                "Move to group" otherwise.
 *   - Close tabs: shown whenever any live target exists (an open-tab row is
 *                 always live; saved-item rows must have `live: true`).
 *   - Remove bookmarks: hidden whenever any open-tab row is in the selection.
 */
function _openSelectionContextMenu(row, x, y) {
  closeContextMenu();
  _contextMenuTriggerRow = row;

  contextMenuEl.replaceChildren();

  const { itemIds, tabIds } = _partitionSelection();
  const count = itemIds.length + tabIds.length;
  const hasItems = itemIds.length > 0;
  const hasTabs = tabIds.length > 0;
  const mixed = hasItems && hasTabs;
  const onlyTabs = hasTabs && !hasItems;

  /* Heading label — "N selected" for context. */
  const heading = document.createElement('span');
  heading.className = 'context-menu-label';
  heading.textContent = count + ' selected';
  contextMenuEl.appendChild(heading);

  /* Move to group / Save to group — hidden for mixed selections per §26.6.
     B-029: replaces the inline <select> with a button that opens the unified
     group picker modal. Click closes the context menu synchronously before
     opening the picker (§30.4.1). */
  if (!mixed) {
    const moveBtn = document.createElement('button');
    moveBtn.className = 'context-menu-item';
    moveBtn.setAttribute('role', 'menuitem');
    moveBtn.setAttribute('tabindex', '-1');
    moveBtn.textContent = onlyTabs ? 'Save to group' : 'Move to group';
    moveBtn.addEventListener('click', () => {
      closeContextMenu();
      openGroupPickerDialog({
        mode: onlyTabs ? 'save' : 'move',
        sourceGroupId: null,
        triggerEl: row,
        onSelect: (groupId) => {
          _bulkMoveToGroup(groupId);
        },
      });
    });
    contextMenuEl.appendChild(moveBtn);
  }

  /* Close tabs — enabled when at least one live target exists. Destructive. */
  let hasLive = hasTabs; // open-tab rows are always live
  if (!hasLive) {
    for (const id of itemIds) {
      const ls = _cachedLiveStates[id];
      if (ls && ls.live) { hasLive = true; break; }
    }
  }
  if (hasLive) {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    contextMenuEl.appendChild(sep);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'context-menu-item context-menu-item--destructive';
    closeBtn.setAttribute('role', 'menuitem');
    closeBtn.setAttribute('tabindex', '-1');
    closeBtn.textContent = 'Close tabs';
    closeBtn.addEventListener('click', () => {
      closeContextMenu();
      _bulkClose();
    });
    contextMenuEl.appendChild(closeBtn);
  }

  /* Remove bookmarks — saved-items only, hidden whenever any tab row is selected. */
  if (!hasTabs && hasItems) {
    const sep2 = document.createElement('div');
    sep2.className = 'context-menu-separator';
    contextMenuEl.appendChild(sep2);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'context-menu-item context-menu-item--destructive';
    removeBtn.setAttribute('role', 'menuitem');
    removeBtn.setAttribute('tabindex', '-1');
    removeBtn.textContent = 'Remove bookmarks';
    removeBtn.addEventListener('click', () => {
      closeContextMenu();
      _bulkRemove();
    });
    contextMenuEl.appendChild(removeBtn);
  }

  /* Position with viewport clamping (same pattern as other menus). */
  contextMenuEl.hidden = false;
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';

  const rect = contextMenuEl.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    contextMenuEl.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > window.innerWidth) {
    contextMenuEl.style.left = Math.max(0, x - rect.width) + 'px';
  }

  /* Focus first focusable element (select or menuitem). */
  const firstFocusable = contextMenuEl.querySelector('[role="menuitem"], select');
  if (firstFocusable) firstFocusable.focus();
}

/* B-055: if the row is an Open Tabs row (no saved item), open the Open-Tabs
   context menu instead. Must come before any itemId-only derivations. */
function _openOpenTabContextMenu(row, x, y) {
  closeContextMenu();
  const tabId = Number(row.dataset.tabId);
  if (!Number.isFinite(tabId)) return;
  _contextMenuTriggerRow = row;

  contextMenuEl.replaceChildren();

  /* B-029: "Save to group" opens the unified group picker modal. The picker
     itself is duplicate-agnostic (§30.4.2) — onSelect runs the existing
     B-059 soft-warn flow, and the duplicate-warn confirm is only opened
     AFTER the picker has fully closed (AC7 handoff contract). */
  const saveBtn = document.createElement('button');
  saveBtn.className = 'context-menu-item';
  saveBtn.setAttribute('role', 'menuitem');
  saveBtn.setAttribute('tabindex', '-1');
  saveBtn.textContent = 'Save to group';
  saveBtn.addEventListener('click', () => {
    /* §30.4.1: close context menu synchronously before opening the picker. */
    closeContextMenu();
    openGroupPickerDialog({
      mode: 'save',
      sourceGroupId: null, /* open tab has no current group */
      triggerEl: row,
      onSelect: (groupId) => {
        const tab = _cachedOpenTabsById.get(tabId);
        /* B-059: pre-dispatch duplicate detection against _cachedItems. */
        const existing = tab ? _findDuplicateSavedItem(tab.url || '') : null;

        const dispatchSave = () => {
          sendMessage(MSG_PROMOTE_TAB, { tabId, groupId }).catch((err) => {
            const code = err?.code;
            /* B-055 H-4: compare against imported error constants so a rename
               surfaces at import time. B-059: ERR_DUPLICATE_URL is unreachable
               in steady state but remains as a deploy-window fall-through. */
            if (code === ERR_SAFE_MODE) {
              showToast('Cannot save while in safe mode');
            } else if (code === ERR_DUPLICATE_URL) {
              showToast('A bookmark with this URL already exists');
            } else if (code === ERR_VALIDATION) {
              showToast(err?.message || 'Cannot save this tab');
            } else {
              showToast('Couldn\u2019t save tab \u2014 try again');
            }
          });
        };

        if (!existing) {
          dispatchSave();
          return;
        }

        /* B-059: soft-warn confirm. Pass `row` as triggerEl so focus restores
           to the Open-Tabs row after the confirm closes. */
        openConfirmDialog(
          { title: tab?.title || tab?.url || 'this tab' },
          dispatchSave,
          {
            heading: 'URL already saved',
            body:
              'This URL is already saved as "' + existing.title + '" in ' +
              _groupLabelForItem(existing) + '. Save another copy?',
            confirmLabel: 'Save anyway',
            variant: 'primary',
            triggerEl: row,
          },
        );
      },
    });
  });
  contextMenuEl.appendChild(saveBtn);

  /* Separator before destructive action */
  const sep = document.createElement('div');
  sep.className = 'context-menu-separator';
  contextMenuEl.appendChild(sep);

  /* Close tab — destructive, styled red. */
  const closeBtn = document.createElement('button');
  closeBtn.className = 'context-menu-item context-menu-item--destructive';
  closeBtn.setAttribute('role', 'menuitem');
  closeBtn.setAttribute('tabindex', '-1');
  closeBtn.textContent = 'Close tab';
  closeBtn.addEventListener('click', () => {
    sendMessage(MSG_CLOSE_TABS, { tabIds: [tabId] }).catch(() => {
      showToast('Couldn\u2019t close tab \u2014 try again');
    });
    closeContextMenu();
  });
  contextMenuEl.appendChild(closeBtn);

  contextMenuEl.hidden = false;
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';

  const rect = contextMenuEl.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    contextMenuEl.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > window.innerWidth) {
    contextMenuEl.style.left = Math.max(0, x - rect.width) + 'px';
  }

  const firstFocusable = contextMenuEl.querySelector('[role="menuitem"], select');
  if (firstFocusable) firstFocusable.focus();
}

/* B-026 H-1 / H-2: build the menu synchronously so no await window can invalidate
   the initial liveness snapshot. Each action handler re-reads liveness from
   _cachedLiveStates to stay honest under broadcast churn. Groups come from
   _cachedGroups — kept fresh via MSG_STATE_CHANGED broadcasts — so no IPC. */
function openContextMenu(row, x, y) {
  /* B-028: selection context menu takes priority when the clicked row is part
     of a multi-item selection. If the right-clicked row is NOT in the active
     selection, fall through to the single-item menu (do NOT extend the
     selection — a right-click on a non-selected row is a single-item action). */
  const selectionKey = _selectionKeyForRow(row);
  if (_selection.size >= 2 && selectionKey && _selection.has(selectionKey)) {
    _openSelectionContextMenu(row, x, y);
    return;
  }

  /* B-055: Open-Tabs row — distinct action set (Save to group, Close tab). */
  if (row.dataset.liveOnly === 'true') {
    _openOpenTabContextMenu(row, x, y);
    return;
  }

  closeContextMenu();

  const itemId = row.dataset.itemId;
  if (!itemId) return;

  _contextMenuTriggerRow = row;
  /* B-026 H-1: derive liveness from _cachedLiveStates (single source of truth),
     not the row dataset which could be a stale read. */
  const isLive = !!_cachedLiveStates[itemId]?.live;

  contextMenuEl.replaceChildren();

  /* Navigate */
  const navBtn = document.createElement('button');
  navBtn.className = 'context-menu-item';
  navBtn.setAttribute('role', 'menuitem');
  navBtn.setAttribute('tabindex', '-1');
  navBtn.textContent = 'Navigate';
  navBtn.addEventListener('click', () => {
    sendMessage(MSG_NAVIGATE_TO_ITEM, { itemId }).catch(() => {});
    closeContextMenu();
  });
  contextMenuEl.appendChild(navBtn);

  /* Edit */
  const editBtn = document.createElement('button');
  editBtn.className = 'context-menu-item';
  editBtn.setAttribute('role', 'menuitem');
  editBtn.setAttribute('tabindex', '-1');
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => {
    sendMessage(MSG_GET_ITEM, { id: itemId }).then((item) => {
      openEditDialog(item, { triggerEl: row });
    }).catch(() => {});
    closeContextMenu();
  });
  contextMenuEl.appendChild(editBtn);

  /* Move to group */
  const moveLabel = document.createElement('span');
  moveLabel.className = 'context-menu-label';
  moveLabel.textContent = 'Move to group';
  contextMenuEl.appendChild(moveLabel);

  const moveSelect = document.createElement('select');
  moveSelect.className = 'context-menu-select';
  moveSelect.setAttribute('aria-label', 'Move to group');

  const ungroupedOpt = document.createElement('option');
  ungroupedOpt.value = '';
  ungroupedOpt.textContent = 'Ungrouped';
  moveSelect.appendChild(ungroupedOpt);

  /* B-026 H-2: read groups from in-memory cache instead of firing an IPC on
     every right-click. _cachedGroups stays fresh via MSG_STATE_CHANGED broadcasts. */
  const sorted = [..._cachedGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const group of sorted) {
    const opt = document.createElement('option');
    opt.value = group.id;
    opt.textContent = group.name;
    moveSelect.appendChild(opt);
  }

  /* Pre-select the item's current group */
  const cachedItem = _itemById.get(itemId);
  if (cachedItem?.groupId) {
    moveSelect.value = cachedItem.groupId;
  }

  moveSelect.addEventListener('change', () => {
    const groupId = moveSelect.value || null;
    sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { groupId } }).catch(() => {});
    closeContextMenu();
  });
  contextMenuEl.appendChild(moveSelect);

  /* Close tab (only when live at menu-open time) */
  if (isLive) {
    const sep1 = document.createElement('div');
    sep1.className = 'context-menu-separator';
    contextMenuEl.appendChild(sep1);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'context-menu-item';
    closeBtn.setAttribute('role', 'menuitem');
    closeBtn.setAttribute('tabindex', '-1');
    closeBtn.textContent = 'Close tab';
    closeBtn.addEventListener('click', () => {
      /* B-026 H-1: re-read liveness at action time — broadcast may have closed the tab. */
      const liveState = _cachedLiveStates[itemId];
      if (liveState?.live && liveState.tabId != null) {
        sendMessage(MSG_CLOSE_TABS, { tabIds: [liveState.tabId] }).catch(() => {});
      }
      closeContextMenu();
    });
    contextMenuEl.appendChild(closeBtn);
  }

  /* Separator before Delete */
  const sep2 = document.createElement('div');
  sep2.className = 'context-menu-separator';
  contextMenuEl.appendChild(sep2);

  /* Delete */
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'context-menu-item context-menu-item--destructive';
  deleteBtn.setAttribute('role', 'menuitem');
  deleteBtn.setAttribute('tabindex', '-1');
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => {
    /* B-026 H-1: re-read liveness at action time so the right action fires
       regardless of state changes while the menu was open. */
    const liveNow = !!_cachedLiveStates[itemId]?.live;
    if (liveNow) {
      sendMessage(MSG_DEMOTE_ITEM, { itemId }).catch(() => {});
      closeContextMenu();
    } else {
      sendMessage(MSG_GET_ITEM, { id: itemId }).then((item) => {
        closeContextMenu();
        openConfirmDialog(item, () => {
          sendMessage(MSG_DELETE_ITEM, { id: itemId }).catch(() => {});
        }, { triggerEl: row });
      }).catch(() => {
        closeContextMenu();
      });
    }
  });
  contextMenuEl.appendChild(deleteBtn);

  /* Position with viewport clamping */
  contextMenuEl.hidden = false;
  contextMenuEl.style.left = x + 'px';
  contextMenuEl.style.top = y + 'px';

  /* Measure and clamp after showing */
  const rect = contextMenuEl.getBoundingClientRect();
  if (rect.bottom > window.innerHeight) {
    contextMenuEl.style.top = Math.max(0, y - rect.height) + 'px';
  }
  if (rect.right > window.innerWidth) {
    contextMenuEl.style.left = Math.max(0, x - rect.width) + 'px';
  }

  /* Focus first menu item */
  const firstItem = contextMenuEl.querySelector('[role="menuitem"]');
  if (firstItem) firstItem.focus();
}

/* Context menu: right-click on item rows and group headers (B-027) */
document.addEventListener('contextmenu', (e) => {
  /* B-027: group header right-click — checked before item-row so a click
     inside a group header that is ALSO inside a row container is handled
     by the group branch, not the single-item branch. */
  const header = e.target.closest('.group-header');
  if (header && !header.classList.contains('open-tabs-header')) {
    /* H-1 fix: don't swallow the native menu for Ungrouped — that header has
       no group-level actions, so preventDefault would leave a dead zone. */
    if (header.dataset.groupId === '__ungrouped__') return;
    e.preventDefault();
    _openGroupContextMenu(header, e.clientX, e.clientY);
    return;
  }

  const row = e.target.closest('.item-row');
  if (!row) return;
  e.preventDefault();
  openContextMenu(row, e.clientX, e.clientY);
});

/* Context menu: click outside to close */
document.addEventListener('click', (e) => {
  if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target)) {
    closeContextMenu();
  }
}, true);

/* Context menu: Escape and arrow key navigation */
contextMenuEl.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeContextMenu();
    return;
  }

  const menuItems = [...contextMenuEl.querySelectorAll('[role="menuitem"]')];
  if (!menuItems.length) return;

  const currentIdx = menuItems.indexOf(document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = currentIdx < menuItems.length - 1 ? currentIdx + 1 : 0;
    menuItems[next].focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = currentIdx > 0 ? currentIdx - 1 : menuItems.length - 1;
    menuItems[prev].focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (document.activeElement?.getAttribute('role') === 'menuitem') {
      document.activeElement.click();
    }
  }
});

/* Context menu: close on scroll of item list */
itemListEl.addEventListener('scroll', () => {
  if (!contextMenuEl.hidden) closeContextMenu();
});

/* B-063: close any open context menu when the side panel loses focus
 * (click-off, Cmd/Alt-Tab, tab switch, window switch, minimize).
 *
 * AC3: the existing closeContextMenu() restores focus to the trigger row.
 * On a blur-close the user's focus is already elsewhere, so we null the
 * trigger BEFORE the close so the focus-restoration branch no-ops.
 *
 * AC5/AC6: this handler only touches the context menu. Dialogs, the filter
 * input, and _selection are intentionally left untouched.
 *
 * AC7: the early return in closeContextMenu() (via `contextMenuEl.hidden`)
 * makes this idempotent; we still guard here to skip the null-assignment
 * when nothing is open.
 *
 * AC8: broadcast-close paths call closeContextMenu() directly with the
 * trigger row still set — they keep the focus-restoring behavior.
 *
 * Native <select> risk: clicking a <select> inside the menu ("Move to
 * group" / "Save to group") opens a chrome-level dropdown. On Edge the
 * panel retains focus across that interaction, so a bare window.blur
 * listener does NOT prematurely close the menu. No mitigation applied.
 */
window.addEventListener('blur', () => {
  if (contextMenuEl.hidden) return;
  _contextMenuTriggerRow = null;
  closeContextMenu();
});

/* =========================================================================
   Initialization
   ========================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  /* W1 — Restore ungrouped collapse from sessionStorage */
  if (sessionStorage.getItem('tj-ungrouped-collapsed') === 'true') {
    collapsedGroups.add('__ungrouped__');
  }

  /* B-014: start the panel-window-id lookup early — concurrent with the rest
     of the cold-open path — so badges render correctly on first paint in the
     common case. First-paint race is still possible on a sub-200ms cold open;
     `_renderWindowBadge` falls back to "always show" when `_panelWindowId`
     is null so the user sees the badge immediately; `refetchAndPatchLiveState`
     corrects it on the next broadcast. */
  _refreshPanelWindowId();

  try {
    const prefs = await sendMessage(MSG_GET_PREFERENCES);
    applyTheme(prefs.theme);
    /* B-092: hydrate compact-layout body class from prefs snapshot before
       the first render so dense rules apply on first paint. */
    applyDenseLayout(prefs);

    const [itemsResp, groups] = await Promise.all([
      sendMessage(MSG_LIST_ITEMS),
      sendMessage(MSG_LIST_GROUPS),
    ]);

    /* Restore collapsed state from groups */
    for (const g of groups) {
      if (g.collapsed) collapsedGroups.add(g.id);
    }

    /* B-014: apply the window map + refresh panel window id before rendering
       so the initial DOM carries correct badges + filter row. */
    _setWindowOrdinalMap(itemsResp.windowMap || {});
    _refreshPanelWindowId();
    renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords, itemsResp.openTabs);
    _applyWindowMapToUI();
  } catch {
    /* B5 — Show error state instead of empty state on init failure */
    skeletonEl.hidden = true;
    emptyStateEl.hidden = true;
    errorStateEl.hidden = false;
    itemListEl.hidden = true;
  }
});
