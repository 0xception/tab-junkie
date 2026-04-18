import {
  MSG_LIST_ITEMS,
  MSG_LIST_GROUPS,
  MSG_GET_PREFERENCES,
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
  MSG_PROMOTE_TAB,
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

/* B-014 M-1: compare broadcast scopes against the canonical constant rather
   than bare string literals. Only the WINDOW_MAP branch uses SCOPE for now —
   the other bare-string comparisons are out of scope per R4 findings. */
import { SCOPE } from '../shared/scopes.js';

/**
 * Returns true only for favicon URLs that are safe to assign to img.src.
 * Rejects javascript:, data:text/, and any unknown schemes.
 * @param {string} url
 * @returns {boolean}
 */
function isSafeFaviconUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/')
  );
}

/* =========================================================================
   DOM references
   ========================================================================= */

const skeletonEl = document.getElementById('skeleton');
const emptyStateEl = document.getElementById('empty-state');
const errorStateEl = document.getElementById('error-state');
const itemListEl = document.getElementById('item-list');
const panelHeaderEl = document.getElementById('panel-header');
const addBookmarkBtnEl = document.getElementById('add-bookmark-btn');
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
const groupCancelBtnEl = document.getElementById('group-cancel-btn');
const groupSubmitBtnEl = document.getElementById('group-submit-btn');

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
let _cachedGroups = [];
let _cachedLiveStates = {};
let _cachedDriftRecords = {};
let _itemById = new Map();

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

const dropIndicatorEl = document.createElement('div');
dropIndicatorEl.className = 'drop-indicator';
dropIndicatorEl.hidden = true;

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

/** Open the group edit dialog pre-populated with an existing group's data. */
function openGroupEditDialog(group, { triggerEl = null } = {}) {
  if (!dialogOverlayEl.hidden) return;
  _editingGroupId = group.id;
  _dialogTriggerEl = triggerEl;
  groupFormEl.reset();
  groupFieldNameEl.value = group.name ?? '';
  groupErrorNameEl.hidden = true;
  groupErrorColorEl.hidden = true;
  groupErrorDialogEl.hidden = true;
  document.getElementById('group-dialog-heading').textContent = 'Edit Group';
  _buildGroupColorSwatches(group.color || GROUP_COLORS[0]);
  bookmarkDialogEl.hidden = true;
  confirmDialogEl.hidden = true;
  groupDialogEl.hidden = false;
  dialogOverlayEl.hidden = false;
  dialogOverlayEl.removeAttribute('aria-hidden');
  _activateFocusTrap(groupDialogEl);
  groupFieldNameEl.focus();
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
  groupSubmitBtnEl.disabled = true;
  try {
    await sendMessage(MSG_UPDATE_GROUP, { id: _editingGroupId, patch: { name, color } });
    closeGroupDialog();
  } catch (err) {
    const message = err?.message || 'Something went wrong.';
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

/**
 * Returns a DocumentFragment with matched substrings wrapped in <mark> elements.
 * All text content set via createTextNode — no innerHTML used.
 * @param {string} text
 * @param {string} query
 * @returns {DocumentFragment}
 */
function buildHighlightedText(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (idx > cursor) {
      frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
    }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + lowerQuery.length);
    frag.appendChild(mark);
    cursor = idx + lowerQuery.length;
  }
  return frag;
}

function applyFilter() {
  const query = _filterQuery.trim().toLowerCase();

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

        const titleMatch = (item.title || '').toLowerCase().includes(query);
        const urlMatch = (item.url || '').toLowerCase().includes(query);

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
 * B-024 H-1: also close any open bulk-move picker so Escape/Clear never leaves an orphan.
 * B-024 H-3: reset the range anchor alongside the selection set.
 */
function _clearSelection() {
  _closeBulkMovePicker();
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
  _cachedGroups = groups;
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
  skeletonEl.hidden = true;
  emptyStateEl.hidden = true;
  errorStateEl.hidden = true;
  itemListEl.hidden = false;
  panelHeaderEl.hidden = false;

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
    handle.setAttribute('title', 'Drag to reorder (keyboard reorder not yet available)');
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
  span.setAttribute('aria-label', 'Playing audio');
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 5h2l3-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 010 5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
  return span;
}

function _createDriftedIcon() {
  const span = document.createElement('span');
  span.className = 'item-drifted-icon';
  span.setAttribute('aria-label', 'Tab has navigated away from its saved URL');
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1l6 11H1L7 1z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/><path d="M7 5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="10" r="0.8" fill="currentColor"/></svg>';
  return span;
}

/* --- Item row ---------------------------------------------------------- */

function buildItemRow(item, liveStates, driftRecords) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.setAttribute('role', 'listitem');
  row.setAttribute('tabindex', '0');
  row.dataset.itemId = item.id;

  const live = liveStates?.[item.id];
  const drifted = driftRecords?.[item.id];

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

  return row;
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
   Group drag-to-reorder listeners (B-008)
   ========================================================================= */

itemListEl.addEventListener('mousedown', (e) => {
  _dragInitiatedFromHandle = !!e.target.closest('.group-drag-handle');
});

itemListEl.addEventListener('dragstart', (e) => {
  const section = e.target.closest('[data-group-id]');
  if (!section) { e.preventDefault(); return; }
  if (!_dragInitiatedFromHandle) { e.preventDefault(); return; }
  _dragSrcGroupId = section.dataset.groupId;
  e.dataTransfer.effectAllowed = 'move';
  section.classList.add('dragging-src');
  itemListEl.classList.add('is-dragging');
});

itemListEl.addEventListener('dragover', (e) => {
  if (!_dragSrcGroupId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const sections = [...itemListEl.querySelectorAll('[data-group-id]')];
  let insertBefore = null;
  for (const sec of sections) {
    const rect = sec.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (e.clientY < mid) { insertBefore = sec; break; }
  }

  dropIndicatorEl.hidden = false;
  if (insertBefore) {
    insertBefore.before(dropIndicatorEl);
  } else {
    const ungrouped = itemListEl.querySelector('.group-section:not([data-group-id])');
    if (ungrouped) ungrouped.before(dropIndicatorEl);
    else itemListEl.appendChild(dropIndicatorEl);
  }
});

itemListEl.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || !itemListEl.contains(e.relatedTarget)) {
    dropIndicatorEl.hidden = true;
  }
});

itemListEl.addEventListener('drop', (e) => {
  e.preventDefault();
  if (!_dragSrcGroupId) return;
  dropIndicatorEl.hidden = true;

  const srcSection = itemListEl.querySelector(`[data-group-id="${CSS.escape(_dragSrcGroupId)}"]`);
  if (!srcSection) return;

  itemListEl.insertBefore(srcSection, dropIndicatorEl);

  const realSections = [...itemListEl.querySelectorAll('[data-group-id]:not(.group-section--child)')];
  const updates = [];
  realSections.forEach((sec, idx) => {
    const newOrder = idx * 1000;
    const oldOrder = Number(sec.dataset.sortOrder ?? 0);
    if (newOrder !== oldOrder) {
      sec.dataset.sortOrder = newOrder;
      updates.push(sendMessage(MSG_UPDATE_GROUP, { id: sec.dataset.groupId, patch: { sortOrder: newOrder } }));
    }
  });
  if (updates.length > 0) {
    Promise.all(updates).catch(() => {
      showToast('Couldn\u2019t save group order \u2014 reverting');
      Promise.all([sendMessage(MSG_LIST_ITEMS), sendMessage(MSG_LIST_GROUPS)])
        .then(([itemsResp, groups]) => {
          /* B-014 */
          _setWindowOrdinalMap(itemsResp.windowMap || {});
          renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords, itemsResp.openTabs);
          _applyWindowMapToUI();
        })
        .catch(() => {});
    });
  }
});

itemListEl.addEventListener('dragend', () => {
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
      renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords, itemsResp.openTabs);
      _applyWindowMapToUI();
    }).catch((err) => {
      console.warn('[tab-junkie] broadcast re-fetch failed:', err);
    });
  }

  if (scope === 'preferences') {
    sendMessage(MSG_GET_PREFERENCES).then((prefs) => {
      applyTheme(prefs.theme);
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
    } catch {
      showToast('Couldn\u2019t move bookmarks \u2014 try again');
    }
  }
}

bulkRemoveBtn.addEventListener('click', () => {
  _bulkRemove();
});

bulkCloseBtn.addEventListener('click', () => {
  _bulkClose();
});

/* B-024: Move to group — shows a lightweight group picker popover */
let _bulkMovePickerEl = null;
/* B-024 H-2: keep the picker's outside-click handler reachable from
   _closeBulkMovePicker so every close path (outside click, Escape,
   change-selection, _clearSelection) unconditionally removes it. */
let _bulkMovePickerDocClick = null;

function _closeBulkMovePicker() {
  if (_bulkMovePickerDocClick) {
    document.removeEventListener('click', _bulkMovePickerDocClick, true);
    _bulkMovePickerDocClick = null;
  }
  if (_bulkMovePickerEl) {
    _bulkMovePickerEl.remove();
    _bulkMovePickerEl = null;
  }
}

bulkMoveBtn.addEventListener('click', () => {
  /* Toggle: if picker already open, close it */
  if (_bulkMovePickerEl) {
    _closeBulkMovePicker();
    return;
  }

  const picker = document.createElement('div');
  picker.id = 'bulk-move-picker';

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Select target group');

  /* Ungrouped option */
  const ungroupedOpt = document.createElement('option');
  ungroupedOpt.value = '';
  ungroupedOpt.textContent = 'Ungrouped';
  select.appendChild(ungroupedOpt);

  /* B-026 H-2: read from in-memory _cachedGroups instead of re-fetching via IPC.
     _cachedGroups stays fresh via MSG_STATE_CHANGED broadcasts. */
  const sorted = [..._cachedGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const group of sorted) {
    const opt = document.createElement('option');
    opt.value = group.id;
    opt.textContent = group.name;
    select.appendChild(opt);
  }

  select.addEventListener('change', () => {
    const groupId = select.value || null;
    _closeBulkMovePicker();
    _bulkMoveToGroup(groupId);
  });

  /* B-024 H-2: Escape on the picker closes it without bubbling up to the
     global Escape handler (which would also wipe the selection). */
  select.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      _closeBulkMovePicker();
      bulkMoveBtn.focus();
    }
  });

  picker.appendChild(select);

  /* Position above the Move button */
  const btnRect = bulkMoveBtn.getBoundingClientRect();
  picker.style.bottom = (window.innerHeight - btnRect.top + 4) + 'px';
  picker.style.left = btnRect.left + 'px';

  document.body.appendChild(picker);
  _bulkMovePickerEl = picker;
  select.focus();

  /* Close picker when clicking outside. Reference is stored module-side so
     _closeBulkMovePicker() always removes the listener — regardless of which
     path triggers the close (B-024 H-2). */
  _bulkMovePickerDocClick = (ev) => {
    if (!picker.contains(ev.target) && ev.target !== bulkMoveBtn) {
      _closeBulkMovePicker();
    }
  };
  /* Delay attaching to avoid the current click from closing it */
  requestAnimationFrame(() => {
    if (_bulkMovePickerDocClick) {
      document.addEventListener('click', _bulkMovePickerDocClick, true);
    }
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

  /* Move to group / Save to group — hidden for mixed selections per §26.6. */
  if (!mixed) {
    const moveLabel = document.createElement('span');
    moveLabel.className = 'context-menu-label';
    moveLabel.textContent = onlyTabs ? 'Save to group' : 'Move to group';
    contextMenuEl.appendChild(moveLabel);

    const moveSelect = document.createElement('select');
    moveSelect.className = 'context-menu-select';
    moveSelect.setAttribute('aria-label', onlyTabs ? 'Save to group' : 'Move to group');

    const ungroupedOpt = document.createElement('option');
    ungroupedOpt.value = '';
    ungroupedOpt.textContent = 'Ungrouped';
    moveSelect.appendChild(ungroupedOpt);

    const sorted = [..._cachedGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    for (const group of sorted) {
      const opt = document.createElement('option');
      opt.value = group.id;
      opt.textContent = group.name;
      moveSelect.appendChild(opt);
    }

    moveSelect.addEventListener('change', () => {
      const groupId = moveSelect.value || null;
      closeContextMenu();
      _bulkMoveToGroup(groupId);
    });
    contextMenuEl.appendChild(moveSelect);
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

  /* "Save to group" — opens an inline group picker (B-029 full modal deferred). */
  const saveLabel = document.createElement('span');
  saveLabel.className = 'context-menu-label';
  saveLabel.textContent = 'Save to group';
  contextMenuEl.appendChild(saveLabel);

  const saveSelect = document.createElement('select');
  saveSelect.className = 'context-menu-select';
  saveSelect.setAttribute('aria-label', 'Save to group');

  const ungroupedOpt = document.createElement('option');
  ungroupedOpt.value = '';
  ungroupedOpt.textContent = 'Ungrouped';
  saveSelect.appendChild(ungroupedOpt);

  const sorted = [..._cachedGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const group of sorted) {
    const opt = document.createElement('option');
    opt.value = group.id;
    opt.textContent = group.name;
    saveSelect.appendChild(opt);
  }

  saveSelect.addEventListener('change', () => {
    const groupId = saveSelect.value || null;
    const tab = _cachedOpenTabsById.get(tabId);
    /* B-059: pre-dispatch duplicate detection against _cachedItems. */
    const existing = tab ? _findDuplicateSavedItem(tab.url || '') : null;

    /* B-055 H-5: close menu synchronously; the dialog (if shown) is a separate
       modal and should not race the menu's focus handling. */
    closeContextMenu();

    const dispatchSave = () => {
      sendMessage(MSG_PROMOTE_TAB, { tabId, groupId }).catch((err) => {
        const code = err?.code;
        /* B-055 H-4 fix: compare against imported error constants instead of
           string literals so a rename of the constant surfaces at import time.
           B-059: ERR_DUPLICATE_URL is unreachable in steady state but remains a
           correct fall-through during a deploy window where a stale SW might
           still throw it. */
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

    /* B-059: soft-warn confirm. Pass `row` as triggerEl so focus restores to
       the Open-Tabs row (not to the now-closed context menu's phantom target). */
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
  });
  contextMenuEl.appendChild(saveSelect);

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
