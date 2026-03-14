// sidepanel/sidepanel.js
import { MSG } from '../shared/messages.js';
import { renderBookmarkTree } from './render.js';
import { setupDialogs } from './dialogs.js';
import { setupContextMenu } from './context-menu.js';
import { generateNetscapeHTML, generateJunkieJSON, detectFormat, parseNetscapeHTML, parseJunkieJSON } from '../shared/import-export.js';

let currentState = null;
const selectedItems = new Map(); // id → item data
let settingsOpen = false;
let syncFeedbackTimer = null;
let fuse = null;
let filterQuery = '';
let lastFuseBookmarkCount = -1;
let lastFuseTabCount = -1;
let lastFuseGroupCount = -1;

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

function getState() {
  return currentState;
}

// Listen for state broadcasts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.STATE_UPDATED) {
    currentState = message.payload;
    render();
  }
});

async function init() {
  currentState = await sendMessage(MSG.GET_STATE);
  render();
  const dialogs = setupDialogs(sendMessage, getState);
  setupContextMenu(sendMessage, getState, dialogs, { getSelectedItems: () => selectedItems, clearSelection });
  setupBulkActions();

  // Filter input
  setupFilter();

  // Close button (only useful in windowed mode, but always wired up)
  document.getElementById('close-btn').addEventListener('click', () => window.close());

  // View mode toggle
  const viewModeToggle = document.getElementById('view-mode-toggle');
  const isWindowMode = currentState?.preferences?.viewMode === 'window';
  viewModeToggle.checked = isWindowMode;
  updateCloseButtonVisibility(isWindowMode);

  viewModeToggle.addEventListener('change', async () => {
    const mode = viewModeToggle.checked ? 'window' : 'sidepanel';
    await sendMessage(MSG.SET_PREFERENCE, { key: 'viewMode', value: mode });
    updateCloseButtonVisibility(viewModeToggle.checked);
  });

  // Settings panel
  document.getElementById('settings-btn').addEventListener('click', openSettings);
  document.getElementById('settings-back-btn').addEventListener('click', closeSettings);

  // Sync tab order
  const syncBtn = document.getElementById('sync-tabs-btn');
  const syncDialog = document.getElementById('sync-confirm-dialog');

  syncBtn.addEventListener('click', () => {
    syncDialog.showModal();
  });

  document.getElementById('sync-cancel-btn').addEventListener('click', () => {
    syncDialog.close();
  });

  // Import/Export
  setupImportExport();

  document.getElementById('sync-confirm-btn').addEventListener('click', async () => {
    syncDialog.close();
    syncBtn.disabled = true;
    clearSyncFeedback();
    const feedback = document.getElementById('sync-feedback');
    try {
      const result = await sendMessage(MSG.SYNC_ALL_TAB_ORDER);
      if (result?.success) {
        feedback.textContent = '\u2713 Done';
        feedback.className = 'settings-feedback success';
        syncFeedbackTimer = setTimeout(clearSyncFeedback, 2000);
      } else {
        feedback.textContent = 'Failed';
        feedback.className = 'settings-feedback error';
        syncFeedbackTimer = setTimeout(clearSyncFeedback, 3000);
      }
    } catch {
      feedback.textContent = 'Failed';
      feedback.className = 'settings-feedback error';
      syncFeedbackTimer = setTimeout(clearSyncFeedback, 3000);
    } finally {
      syncBtn.disabled = false;
    }
  });
}

function render() {
  if (!currentState) return;
  buildFuseIndex();
  if (filterQuery) {
    renderFilterResults(filterQuery);
  } else {
    const container = document.getElementById('bookmark-list');
    container.classList.remove('hidden');
    const resultsEl = document.getElementById('filter-results');
    if (resultsEl) resultsEl.remove();
    renderBookmarkTree(container, currentState, {
      initDragAndDrop,
      selectedIds: selectedItems,
    });
  }
  updateBulkBar();
}

// --- Selection ---

let lastSelectedId = null; // tracks the anchor for shift+click range select

function getAllBookmarkItems() {
  return [...document.querySelectorAll('bookmark-item')];
}

document.addEventListener('select-item', (e) => {
  const { data, shiftKey, ctrlKey } = e.detail;
  const allItems = getAllBookmarkItems();

  if (shiftKey && lastSelectedId) {
    // Shift+Click: range select from last selected to this item
    const ids = allItems.map(el => el.data?.id);
    const fromIdx = ids.indexOf(lastSelectedId);
    const toIdx = ids.indexOf(data.id);

    if (fromIdx !== -1 && toIdx !== -1) {
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);

      // If not holding ctrl, clear existing selection first
      if (!ctrlKey) {
        selectedItems.clear();
      }

      for (let i = start; i <= end; i++) {
        const itemData = allItems[i].data;
        if (itemData) selectedItems.set(itemData.id, itemData);
      }
    }
  } else if (ctrlKey) {
    // Ctrl/Cmd+Click: toggle individual item without affecting others
    if (selectedItems.has(data.id)) {
      selectedItems.delete(data.id);
    } else {
      selectedItems.set(data.id, data);
    }
    lastSelectedId = data.id;
  } else {
    // Plain click: clear selection and select just this item,
    // or deselect if it was the only one selected
    if (selectedItems.size === 1 && selectedItems.has(data.id)) {
      selectedItems.clear();
      lastSelectedId = null;
    } else {
      selectedItems.clear();
      selectedItems.set(data.id, data);
      lastSelectedId = data.id;
    }
  }

  syncSelectionToDOM();
  updateBulkBar();
});

// Ctrl/Cmd+A: select all visible items
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    const allItems = getAllBookmarkItems();
    selectedItems.clear();
    for (const el of allItems) {
      if (el.data) selectedItems.set(el.data.id, el.data);
    }
    syncSelectionToDOM();
    updateBulkBar();
  }

  // Escape clears selection
  if (e.key === 'Escape' && selectedItems.size > 0) {
    clearSelection();
  }
});

function syncSelectionToDOM() {
  const hasSelection = selectedItems.size > 0;
  for (const el of getAllBookmarkItems()) {
    const id = el.data?.id;
    const isSelected = id ? selectedItems.has(id) : false;
    el.selected = isSelected;
    // Sync MultiDrag selectedClass
    el.classList.toggle('multi-drag-selected', isSelected);
    if (hasSelection) {
      el.setAttribute('selectable', '');
    } else {
      el.removeAttribute('selectable');
    }
  }
}

function clearSelection() {
  // Deselect from SortableJS MultiDrag internal state
  for (const el of getAllBookmarkItems()) {
    if (el.classList.contains('multi-drag-selected')) {
      Sortable.utils.deselect(el);
    }
  }
  selectedItems.clear();
  lastSelectedId = null;
  syncSelectionToDOM();
  updateBulkBar();
}

// --- Filter ---

function setupFilter() {
  const input = document.getElementById('filter-input');
  const clearBtn = document.getElementById('filter-clear');

  input.addEventListener('input', () => {
    filterQuery = input.value.trim();
    clearBtn.classList.toggle('hidden', !filterQuery);
    render();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    filterQuery = '';
    clearBtn.classList.add('hidden');
    render();
    input.focus();
  });
}

function buildFuseIndex() {
  if (!currentState) return;

  // Skip rebuild when bookmark/group/tab counts haven't changed
  const bmCount = currentState.bookmarks.length;
  const tabCount = currentState.unbookmarkedTabs.length;
  const grpCount = currentState.groups.length;
  if (fuse && bmCount === lastFuseBookmarkCount && tabCount === lastFuseTabCount && grpCount === lastFuseGroupCount) {
    return;
  }
  lastFuseBookmarkCount = bmCount;
  lastFuseTabCount = tabCount;
  lastFuseGroupCount = grpCount;

  const items = [];

  for (const bookmark of currentState.bookmarks) {
    const group = currentState.groups.find(g => g.id === bookmark.groupId);
    const parentGroup = group?.parentId
      ? currentState.groups.find(g => g.id === group.parentId)
      : null;
    const breadcrumb = parentGroup
      ? `${parentGroup.name} \u2192 ${group.name}`
      : group?.name || '';

    items.push({
      type: 'bookmark',
      bookmarkId: bookmark.id,
      title: bookmark.title,
      url: bookmark.url,
      favicon: bookmark.favicon,
      isOpen: bookmark.isOpen,
      tabId: bookmark.tabId,
      breadcrumb,
    });
  }

  for (const tab of currentState.unbookmarkedTabs) {
    items.push({
      type: 'tab',
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || null,
      isOpen: true,
      tabId: tab.id,
      breadcrumb: 'Open Tabs',
    });
  }

  fuse = new Fuse(items, {
    keys: ['title', 'url'],
    threshold: 0.4,
    ignoreLocation: true,
    includeMatches: true,
  });
}

function renderFilterResults(query) {
  if (!fuse) return;

  const container = document.getElementById('bookmark-list');
  container.classList.add('hidden');

  let resultsEl = document.getElementById('filter-results');
  if (!resultsEl) {
    resultsEl = document.createElement('div');
    resultsEl.id = 'filter-results';
    resultsEl.className = 'filter-results';
    container.parentNode.insertBefore(resultsEl, container.nextSibling);
  }
  resultsEl.innerHTML = '';

  const results = fuse.search(query);

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="filter-empty">No matches</div>';
    return;
  }

  for (const result of results) {
    const item = result.item;
    const matches = result.matches;
    const el = document.createElement('div');
    el.className = 'filter-result-item';

    const isUnbookmarked = item.type === 'tab';

    // Favicon
    const favicon = document.createElement('div');
    favicon.className = 'filter-result-favicon' + (item.favicon ? '' : (isUnbookmarked ? ' unbookmarked' : ' placeholder'));
    if (item.favicon) {
      const img = document.createElement('img');
      img.src = item.favicon;
      img.onerror = () => {
        img.remove();
        favicon.textContent = item.title.charAt(0).toUpperCase();
        favicon.classList.add(isUnbookmarked ? 'unbookmarked' : 'placeholder');
      };
      favicon.appendChild(img);
    } else {
      favicon.textContent = item.title.charAt(0).toUpperCase();
    }
    el.appendChild(favicon);

    // Info
    const info = document.createElement('div');
    info.className = 'filter-result-info';

    const title = document.createElement('div');
    title.className = 'filter-result-title' + (isUnbookmarked ? ' unbookmarked' : '');
    const titleMatch = matches?.find(m => m.key === 'title');
    if (titleMatch) {
      title.innerHTML = highlightMatches(item.title, titleMatch.indices);
    } else {
      title.textContent = item.title;
    }
    info.appendChild(title);

    if (item.breadcrumb) {
      const breadcrumb = document.createElement('div');
      breadcrumb.className = 'filter-result-breadcrumb';
      breadcrumb.textContent = item.breadcrumb;
      info.appendChild(breadcrumb);
    }

    el.appendChild(info);

    // Open dot
    if (item.isOpen && !isUnbookmarked) {
      const dot = document.createElement('div');
      dot.className = 'filter-result-dot';
      el.appendChild(dot);
    }

    // Click → navigate
    el.addEventListener('click', () => {
      sendMessage(MSG.NAVIGATE_TO, {
        tabId: item.tabId || null,
        url: item.url,
        bookmarkId: item.bookmarkId || null,
      });
    });

    resultsEl.appendChild(el);
  }
}

function highlightMatches(text, indices) {
  let result = '';
  let lastIndex = 0;
  const merged = [];
  for (const [start, end] of indices) {
    if (merged.length > 0 && start <= merged[merged.length - 1][1] + 1) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    } else {
      merged.push([start, end]);
    }
  }
  for (const [start, end] of merged) {
    result += escapeHtml(text.substring(lastIndex, start));
    result += `<mark>${escapeHtml(text.substring(start, end + 1))}</mark>`;
    lastIndex = end + 1;
  }
  result += escapeHtml(text.substring(lastIndex));
  return result;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- View Mode ---

function updateCloseButtonVisibility(isWindowMode) {
  document.getElementById('close-btn').classList.toggle('hidden', !isWindowMode);
}

// --- Settings Panel ---

function openSettings() {
  settingsOpen = true;
  clearSelection();
  document.getElementById('bookmark-list').classList.add('hidden');
  const filterResults = document.getElementById('filter-results');
  if (filterResults) filterResults.remove();
  document.getElementById('settings-panel').classList.remove('hidden');
  // Swap header: hide filter + actions, show back button
  document.querySelector('.header-filter-wrap').classList.add('hidden');
  document.querySelector('.header-actions').classList.add('hidden');
  document.getElementById('settings-back-btn').classList.remove('hidden');
}

function closeSettings() {
  settingsOpen = false;
  clearSyncFeedback();
  document.getElementById('settings-panel').classList.add('hidden');
  document.getElementById('bookmark-list').classList.remove('hidden');
  // Restore header
  document.getElementById('settings-back-btn').classList.add('hidden');
  document.querySelector('.header-filter-wrap').classList.remove('hidden');
  document.querySelector('.header-actions').classList.remove('hidden');
  render();
}

function clearSyncFeedback() {
  if (syncFeedbackTimer) {
    clearTimeout(syncFeedbackTimer);
    syncFeedbackTimer = null;
  }
  const el = document.getElementById('sync-feedback');
  if (el) {
    el.textContent = '';
    el.className = 'settings-feedback';
  }
}

// --- Import/Export ---

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showFeedback(elementId, type, text, duration = 2000) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `settings-feedback ${type}`;
  setTimeout(() => {
    el.textContent = '';
    el.className = 'settings-feedback';
  }, duration);
}

function setupImportExport() {
  // Export HTML
  document.getElementById('export-html-btn').addEventListener('click', () => {
    if (!currentState) return;
    const html = generateNetscapeHTML(currentState.bookmarks, currentState.groups);
    downloadFile('junkie-bookmarks.html', html, 'text/html');
    showFeedback('export-html-feedback', 'success', '\u2713 Exported');
  });

  // Export JSON
  document.getElementById('export-json-btn').addEventListener('click', () => {
    if (!currentState) return;
    const json = generateJunkieJSON(currentState.bookmarks, currentState.groups);
    downloadFile('junkie-backup.json', json, 'application/json');
    showFeedback('export-json-feedback', 'success', '\u2713 Exported');
  });

  // Import
  const importBtn = document.getElementById('import-btn');
  const fileInput = document.getElementById('import-file-input');
  const importDialog = document.getElementById('import-confirm-dialog');
  let pendingImport = null;

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = '';

    try {
      const content = await file.text();
      const format = detectFormat(content);

      if (format === 'unknown') {
        showFeedback('import-feedback', 'error', 'Unrecognized file format', 3000);
        return;
      }

      let parsed;
      if (format === 'html') {
        parsed = parseNetscapeHTML(content);
      } else {
        parsed = parseJunkieJSON(content);
      }

      pendingImport = parsed;
      const bmCount = parsed.bookmarks.length;
      const grpCount = parsed.groups.length;
      document.getElementById('import-confirm-text').textContent =
        `Found ${bmCount} bookmark${bmCount !== 1 ? 's' : ''} and ${grpCount} group${grpCount !== 1 ? 's' : ''}.`;
      importDialog.showModal();
    } catch (err) {
      showFeedback('import-feedback', 'error', err.message || 'Import failed', 3000);
    }
  });

  document.getElementById('import-cancel-btn').addEventListener('click', () => {
    pendingImport = null;
    importDialog.close();
  });

  document.getElementById('import-confirm-btn').addEventListener('click', async () => {
    importDialog.close();
    if (!pendingImport) return;

    try {
      await sendMessage(MSG.IMPORT_REPLACE, pendingImport);
      showFeedback('import-feedback', 'success', '\u2713 Imported');
    } catch (err) {
      showFeedback('import-feedback', 'error', err.message || 'Import failed', 3000);
    }
    pendingImport = null;
  });
}

// --- Bulk Action Bar ---

function setupBulkActions() {
  const clearBtn = document.getElementById('bulk-clear-btn');
  const closeBtn = document.getElementById('bulk-close-btn');
  const groupSelect = document.getElementById('bulk-group-select');

  clearBtn.addEventListener('click', clearSelection);

  closeBtn.addEventListener('click', async () => {
    const tabIds = [];
    for (const item of selectedItems.values()) {
      if (item.tabId) tabIds.push(item.tabId);
    }
    for (const tabId of tabIds) {
      await sendMessage(MSG.CLOSE_TAB, { tabId });
    }
    clearSelection();
  });

  groupSelect.addEventListener('change', async () => {
    const groupId = groupSelect.value;
    if (!groupId) return;

    for (const item of selectedItems.values()) {
      if (item.isBookmarked === false) {
        // Floating tab: pin to group (don't auto-bookmark)
        if (item.tabId) {
          await sendMessage(MSG.PIN_TAB, { tabId: item.tabId, groupId });
        }
      } else {
        // Bookmark: move to group
        await sendMessage(MSG.MOVE_BOOKMARK, { id: item.id, groupId, sortOrder: 0 });
      }
    }

    clearSelection();
    groupSelect.value = '';
  });
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-action-bar');
  const countEl = bar.querySelector('.bulk-count');
  const closeBtn = document.getElementById('bulk-close-btn');
  const groupSelect = document.getElementById('bulk-group-select');

  if (selectedItems.size === 0) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');
  const n = selectedItems.size;
  countEl.textContent = `${n} selected`;

  // Show close button only if any selected items have open tabs
  const hasOpenTabs = [...selectedItems.values()].some(item => item.tabId);
  closeBtn.classList.toggle('hidden', !hasOpenTabs);

  // Populate group dropdown
  groupSelect.innerHTML = '<option value="" disabled selected>Add to group...</option>';
  if (currentState) {
    for (const group of currentState.groups) {
      const option = document.createElement('option');
      option.value = group.id;
      const indent = group.parentId ? '  ' : '';
      option.textContent = indent + group.name;
      groupSelect.appendChild(option);
    }
  }
}

// --- Drag and Drop (MultiDrag) ---

function initDragAndDrop() {
  const containers = document.querySelectorAll('.group-items');
  for (const container of containers) {
    if (container._sortable) container._sortable.destroy();
    container._sortable = new Sortable(container, {
      group: 'bookmarks',
      animation: 150,
      multiDrag: true,
      avoidImplicitDeselect: true,
      selectedClass: 'multi-drag-selected',
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onStart: handleDragStart,
      onEnd: handleDragEnd,
    });
  }

  // After SortableJS init, sync our selection into MultiDrag's selection
  syncSelectionToSortable();

  // --- Drag-to-expand collapsed groups ---
  initDragToExpand();

  // --- Group drag-and-drop ---
  initGroupDragAndDrop();
}

let dragExpandTimer = null;
let dragExpandTarget = null;
const dragExpandedGroups = []; // groups expanded during this drag, persist on drag end

function initDragToExpand() {
  const headers = document.querySelectorAll('group-header');
  for (const header of headers) {
    if (!header.data?.collapsed) continue;

    header.addEventListener('dragenter', () => {
      if (dragExpandTarget === header) return;
      clearDragExpandTimer();
      dragExpandTarget = header;
      dragExpandTimer = setTimeout(() => {
        // Expand the group visually without triggering a full re-render
        // (a re-render would destroy the in-progress drag operation)
        const section = header.closest('.group-section');
        const items = section?.querySelector('.group-items');
        if (items) items.classList.remove('collapsed');
        // Update the collapse icon inside the shadow DOM
        const collapseIcon = header.shadowRoot?.querySelector('.collapse-icon');
        if (collapseIcon) collapseIcon.classList.remove('collapsed');
        // Track for deferred preference save
        const groupId = header.data?.id;
        if (groupId) dragExpandedGroups.push(groupId);
        dragExpandTarget = null;
      }, 800);
    });

    header.addEventListener('dragleave', (e) => {
      if (!header.contains(e.relatedTarget)) {
        if (dragExpandTarget === header) clearDragExpandTimer();
      }
    });
  }
}

function clearDragExpandTimer() {
  if (dragExpandTimer) {
    clearTimeout(dragExpandTimer);
    dragExpandTimer = null;
  }
  dragExpandTarget = null;
}

async function persistDragExpandedGroups() {
  if (dragExpandedGroups.length === 0) return;
  const collapsed = currentState?.preferences?.collapsedGroups || [];
  const expandedSet = new Set(dragExpandedGroups);
  const newCollapsed = collapsed.filter(id => !expandedSet.has(id));
  dragExpandedGroups.length = 0;
  await sendMessage(MSG.SET_PREFERENCE, { key: 'collapsedGroups', value: newCollapsed });
}

function initGroupDragAndDrop() {
  const bookmarkList = document.getElementById('bookmark-list');
  if (!bookmarkList) return;
  if (bookmarkList._groupSortable) bookmarkList._groupSortable.destroy();

  bookmarkList._groupSortable = new Sortable(bookmarkList, {
    group: 'groups',
    handle: '.group-drag-handle',
    draggable: '.group-section[data-draggable]',
    animation: 150,
    ghostClass: 'group-sortable-ghost',
    onStart: handleGroupDragStart,
    onMove: handleGroupDragMove,
    onEnd: handleGroupDragEnd,
  });

  // Sub-group containers
  const subGroupContainers = document.querySelectorAll('.sub-groups');
  for (const container of subGroupContainers) {
    if (container._sortable) container._sortable.destroy();
    container._sortable = new Sortable(container, {
      group: 'groups',
      handle: '.group-drag-handle',
      draggable: '.group-section[data-draggable]',
      animation: 150,
      ghostClass: 'group-sortable-ghost',
      onStart: handleGroupDragStart,
      onMove: handleGroupDragMove,
      onEnd: handleGroupDragEnd,
    });
  }
}

function handleGroupDragStart(evt) {
  // Show nest drop zones on all eligible groups (not the one being dragged)
  document.body.classList.add('group-dragging');
  const draggedSubGroups = evt.item.querySelector('.sub-groups');
  if (draggedSubGroups) draggedSubGroups.classList.add('nest-zone-hidden');
}

function handleGroupDragMove(evt) {
  const draggedGroupId = evt.dragged.dataset.groupId;
  const targetContainer = evt.to;

  // If dropping into a sub-groups container, enforce max 1 level nesting
  if (targetContainer.classList.contains('sub-groups')) {
    const state = getState();
    // Can't nest a group that already has sub-groups
    const hasSubGroups = state.groups.some(g => g.parentId === draggedGroupId);
    if (hasSubGroups) return false;
  }

  return true;
}

async function handleGroupDragEnd(evt) {
  // Clean up drag state
  document.body.classList.remove('group-dragging');
  document.querySelectorAll('.nest-zone-hidden').forEach(el => el.classList.remove('nest-zone-hidden'));

  const draggedSection = evt.item;
  const groupId = draggedSection.dataset.groupId;
  if (!groupId) return;

  const targetContainer = evt.to;
  let newParentId = null;

  if (targetContainer.classList.contains('sub-groups')) {
    newParentId = targetContainer.dataset.parentGroupId;
  }

  // Update sort orders for all siblings in this container
  const siblings = [...targetContainer.querySelectorAll(':scope > .group-section[data-draggable]')];
  for (let i = 0; i < siblings.length; i++) {
    const siblingId = siblings[i].dataset.groupId;
    if (siblingId) {
      await sendMessage(MSG.MOVE_GROUP, {
        id: siblingId,
        parentId: newParentId,
        sortOrder: i,
      });
    }
  }
}

function syncSelectionToSortable() {
  // Tell SortableJS which items are selected by toggling the selectedClass
  for (const el of getAllBookmarkItems()) {
    const id = el.data?.id;
    if (id && selectedItems.has(id)) {
      el.classList.add('multi-drag-selected');
    } else {
      el.classList.remove('multi-drag-selected');
    }
  }
}

function handleDragStart(evt) {
  // Clear any stale drag-expand state from interrupted drags
  dragExpandedGroups.length = 0;
  // If dragging a selected item with others selected, make sure
  // SortableJS knows about all our selections
  const draggedData = evt.item.data;
  if (draggedData && selectedItems.size > 1 && selectedItems.has(draggedData.id)) {
    syncSelectionToSortable();
  }
}

async function handleDragEnd(evt) {
  const targetGroupId = evt.to.dataset.groupId;

  // Use our selectedItems as source of truth for multi-drag, not SortableJS's evt.items
  // (SortableJS can have stale internal selections that diverge from our state)
  const draggedData = evt.item.data;
  let itemsToMove = [];

  if (selectedItems.size > 1 && draggedData && selectedItems.has(draggedData.id)) {
    itemsToMove = [...selectedItems.values()];
  } else {
    itemsToMove = draggedData ? [draggedData] : [];
  }

  // Deselect all items from SortableJS MultiDrag state
  const sortableItems = evt.items && evt.items.length > 0 ? evt.items : [evt.item];
  for (const el of sortableItems) {
    Sortable.utils.deselect(el);
  }

  if (itemsToMove.length === 0) return;

  const unbookmarked = itemsToMove.filter(d => d.isBookmarked === false);
  const bookmarked = itemsToMove.filter(d => d.isBookmarked !== false);

  if (targetGroupId === '__open_tabs__') {
    // Dragging bookmarks to Open Tabs removes them (converts to floating)
    for (const item of bookmarked) {
      const payload = { id: item.id };
      if (item.isOpen && item.tabId && item.groupId) {
        payload.pinTabId = item.tabId;
        payload.pinGroupId = item.groupId;
      }
      await sendMessage(MSG.REMOVE_BOOKMARK, payload);
    }
  } else if (targetGroupId) {
    // Floating tabs: pin to the target group (don't auto-bookmark)
    for (const item of unbookmarked) {
      if (item.tabId) {
        await sendMessage(MSG.PIN_TAB, { tabId: item.tabId, groupId: targetGroupId });
      }
    }

    // Normalize sort orders for the target group based on final DOM order
    // This handles both moved items and existing items in one write
    const targetContainer = evt.to;
    const bookmarkIds = [];
    const tabOrder = [];
    for (const el of targetContainer.querySelectorAll('bookmark-item')) {
      if (el.data?.id && el.data.isBookmarked !== false) bookmarkIds.push(el.data.id);
      if (el.data?.tabId != null) tabOrder.push(el.data.tabId);
    }
    if (bookmarkIds.length > 0) {
      await sendMessage(MSG.NORMALIZE_GROUP_SORT, { groupId: targetGroupId, bookmarkIds });
    }
    // Sync Chrome tab order to match Junkie's visual order
    if (tabOrder.length > 1) {
      await sendMessage(MSG.SYNC_TAB_ORDER, { tabOrder });
    }
  }

  if (itemsToMove.length > 1) {
    clearSelection();
  }

  clearDragExpandTimer();
  await persistDragExpandedGroups();
}

// --- Event Handlers ---

document.addEventListener('navigate', async (e) => {
  await sendMessage(MSG.NAVIGATE_TO, e.detail);
});

document.addEventListener('close-tab', async (e) => {
  await sendMessage(MSG.CLOSE_TAB, e.detail);
});

document.addEventListener('toggle-collapse', async (e) => {
  const { groupId } = e.detail;
  if (!groupId) return;

  const collapsed = currentState?.preferences?.collapsedGroups || [];
  const newCollapsed = collapsed.includes(groupId)
    ? collapsed.filter(id => id !== groupId)
    : [...collapsed, groupId];

  await sendMessage(MSG.SET_PREFERENCE, { key: 'collapsedGroups', value: newCollapsed });
});

// --- Load SortableJS then init ---

const script = document.createElement('script');
script.src = '../lib/sortable.min.js';
script.onload = () => init();
document.head.appendChild(script);
