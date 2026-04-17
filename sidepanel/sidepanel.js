import {
  MSG_LIST_ITEMS,
  MSG_LIST_GROUPS,
  MSG_GET_PREFERENCES,
  MSG_UPDATE_GROUP,
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
} from '../shared/messages.js';

import {
  ERR_NOT_FOUND,
  ERR_VALIDATION,
} from '../shared/errors.js';

import { GROUP_COLORS } from '../shared/constants.js';

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
  _deactivateFocusTrap();
  _editingItemId = null;
  _pendingConfirmCallback = null;
  if (_dialogTriggerEl) {
    _dialogTriggerEl.focus();
    _dialogTriggerEl = null;
  }
}

function openConfirmDialog(item, onConfirm, { triggerEl = null, heading, body } = {}) {
  _pendingConfirmCallback = onConfirm;
  _dialogTriggerEl = triggerEl;
  /* B-024 C-2: heading + body overrides for bulk callers; single-item path preserves
     the original "Delete Bookmark?" heading and delete-wording body. */
  confirmHeadingEl.textContent = heading || 'Delete Bookmark?';
  confirmBodyEl.textContent =
    body || ('Delete "' + (item.title || 'this bookmark') + '"? This cannot be undone.');
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
        renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
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

  /* Reset scroll to top on filter apply (AC10) */
  itemListEl.scrollTop = 0;

  /* Show/hide filter empty state */
  filterEmptyStateEl.hidden = !query || totalVisible > 0;
  /* Also hide the regular empty state during filter */
  if (query) emptyStateEl.hidden = true;

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

  /* Disable Close tabs when no selected items are live */
  let hasLive = false;
  for (const id of _selection) {
    const ls = _cachedLiveStates[id];
    if (ls && ls.live) { hasLive = true; break; }
  }
  bulkCloseBtn.disabled = !hasLive;
}

/**
 * Toggle a single item's selection state. Updates the row attribute and the bar.
 * B-024 H-3: writes the range anchor (single source of truth for range-select).
 */
function _toggleSelection(itemId) {
  if (_selection.has(itemId)) {
    _selection.delete(itemId);
    const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
    if (row) delete row.dataset.selected;
  } else {
    _selection.add(itemId);
    const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
    if (row) row.dataset.selected = 'true';
  }
  _lastSelectedId = itemId;
  _rangeAnchorId = itemId;
  _updateBulkBar();
}

/**
 * Range-select all visible item rows between _rangeAnchorId and targetId (inclusive).
 * B-024 H-3: reads _rangeAnchorId only; never writes it, so the anchor stays pinned
 * to the most recent explicit toggle/select-all.
 */
function _rangeSelect(targetId) {
  const rows = [...itemListEl.querySelectorAll('[data-item-id]:not([hidden])')];
  const ids = rows.map((r) => r.dataset.itemId);
  const startIdx = ids.indexOf(_rangeAnchorId);
  const endIdx = ids.indexOf(targetId);
  if (startIdx === -1 || endIdx === -1) return;
  const lo = Math.min(startIdx, endIdx);
  const hi = Math.max(startIdx, endIdx);
  for (let i = lo; i <= hi; i++) {
    _selection.add(ids[i]);
    rows[i].dataset.selected = 'true';
  }
  _updateBulkBar();
}

/**
 * Select all visible item rows.
 * B-024 H-3: writes the range anchor to the last visible row.
 */
function _selectAll() {
  const rows = itemListEl.querySelectorAll('[data-item-id]:not([hidden])');
  for (const row of rows) {
    _selection.add(row.dataset.itemId);
    row.dataset.selected = 'true';
  }
  if (rows.length > 0) {
    _lastSelectedId = rows[rows.length - 1].dataset.itemId;
    _rangeAnchorId = rows[rows.length - 1].dataset.itemId;
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
  for (const id of _selection) {
    const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
    if (row) delete row.dataset.selected;
  }
  _selection.clear();
  _lastSelectedId = null;
  _rangeAnchorId = null;
  _updateBulkBar();
}

/**
 * After renderAll() rebuilds the DOM, re-apply data-selected from the Set
 * and prune any IDs that no longer exist.
 */
function _reapplySelection() {
  const toRemove = [];
  for (const id of _selection) {
    if (!_itemById.has(id)) {
      toRemove.push(id);
      continue;
    }
    const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
    if (row) row.dataset.selected = 'true';
  }
  for (const id of toRemove) _selection.delete(id);
  _updateBulkBar();
}

/* =========================================================================
   Rendering
   ========================================================================= */

function renderAll(items, groups, liveStates, driftRecords) {
  /* Cache data for filter (B-021) */
  _cachedItems = items;
  _cachedGroups = groups;
  _cachedLiveStates = liveStates || {};
  _cachedDriftRecords = driftRecords || {};
  _itemById = new Map(items.map((it) => [it.id, it]));

  if (!items.length && !groups.length) {
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

  itemListEl.replaceChildren(fragment);
  itemListEl.appendChild(dropIndicatorEl);
  skeletonEl.hidden = true;
  emptyStateEl.hidden = true;
  errorStateEl.hidden = true;
  itemListEl.hidden = false;
  panelHeaderEl.hidden = false;

  /* Re-apply active filter after DOM rebuild (B-021) */
  if (_filterQuery) applyFilter();

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

  if (needsAudible || needsDrifted) {
    const indicators = document.createElement('div');
    indicators.className = 'item-indicators';

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
    for (const row of itemListEl.querySelectorAll('[data-item-id]')) {
      if (!row.isConnected) continue;
      delete row.dataset.live;
      delete row.dataset.active;
      delete row.dataset.audible;
      delete row.dataset.drifted;
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

  const rows = itemListEl.querySelectorAll('[data-item-id]');
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

    /* H-8, B-011: Ensure indicator DOM nodes exist when state transitions false→true */
    _ensureIndicators(row, live, !!drifted);

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
    const itemId = row.dataset.itemId;

    /* B-024: Ctrl/Cmd+Click — toggle individual selection */
    if (e.ctrlKey || e.metaKey) {
      _toggleSelection(itemId);
      return;
    }

    /* B-024 H-3: Shift+Click while in selection mode with a valid anchor — range select */
    if (_selectionMode && e.shiftKey && _rangeAnchorId) {
      _rangeSelect(itemId);
      return;
    }

    /* B-024 H-4: Shift+Click with no prior selection starts selection at this item
       (treat Shift as an explicit "start selection" intent). */
    if (e.shiftKey && !_selectionMode) {
      _toggleSelection(itemId);
      return;
    }

    /* B-024 H-6: Plain click while in selection mode — defer the toggle so that
       a follow-up dblclick can cancel it and navigate instead. */
    if (_selectionMode) {
      clearTimeout(_pendingClickTimer);
      _pendingClickTimer = setTimeout(() => {
        _pendingClickTimer = null;
        _toggleSelection(itemId);
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
          renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
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
        renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
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

  if (scope === 'items' || scope === 'groups') {
    if (scope === 'groups' && _dragSrcGroupId) {
      _pendingGroupsRender = true;
      return;
    }
    Promise.all([
      sendMessage(MSG_LIST_ITEMS),
      sendMessage(MSG_LIST_GROUPS),
    ]).then(([itemsResp, groups]) => {
      renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
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

bulkRemoveBtn.addEventListener('click', () => {
  const count = _selection.size;
  if (count === 0) return;

  /* B-024 C-2 / H-7: bulk-appropriate confirm copy; live tabs are demoted, not closed. */
  const syntheticItem = { title: count + ' items' };
  openConfirmDialog(
    syntheticItem,
    async () => {
      const ids = [..._selection];

      /* For live items, demote first (preserves tabs) */
      const liveIds = ids.filter((id) => {
        const ls = _cachedLiveStates[id];
        return ls && ls.live;
      });
      const nonLiveIds = ids.filter((id) => {
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
        _selection.delete(id);
        const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
        if (row) delete row.dataset.selected;
      }
      if (bulkDeleteOk) {
        for (const id of nonLiveIds) {
          _selection.delete(id);
          const row = itemListEl.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
          if (row) delete row.dataset.selected;
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
});

bulkCloseBtn.addEventListener('click', async () => {
  const tabIds = [];
  for (const id of _selection) {
    const ls = _cachedLiveStates[id];
    if (ls && ls.live && ls.tabId != null) {
      tabIds.push(ls.tabId);
    }
  }
  if (tabIds.length === 0) return;
  try {
    await sendMessage(MSG_CLOSE_TABS, { tabIds });
    _clearSelection();
  } catch {
    showToast('Couldn\u2019t close tabs \u2014 try again');
  }
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

  select.addEventListener('change', async () => {
    const groupId = select.value || null;
    const ids = [..._selection];
    _closeBulkMovePicker();
    try {
      await sendMessage(MSG_BULK_UPDATE_ITEMS, { ids, patch: { groupId } });
      _clearSelection();
    } catch {
      showToast('Couldn\u2019t move bookmarks \u2014 try again');
    }
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

/* B-026 H-1 / H-2: build the menu synchronously so no await window can invalidate
   the initial liveness snapshot. Each action handler re-reads liveness from
   _cachedLiveStates to stay honest under broadcast churn. Groups come from
   _cachedGroups — kept fresh via MSG_STATE_CHANGED broadcasts — so no IPC. */
function openContextMenu(row, x, y) {
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

/* Context menu: right-click on item rows */
document.addEventListener('contextmenu', (e) => {
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

    renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
  } catch {
    /* B5 — Show error state instead of empty state on init failure */
    skeletonEl.hidden = true;
    emptyStateEl.hidden = true;
    errorStateEl.hidden = false;
    itemListEl.hidden = true;
  }
});
