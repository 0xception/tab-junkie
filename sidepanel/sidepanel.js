// sidepanel/sidepanel.js
import { MSG } from '../shared/messages.js';
import { renderBookmarkTree } from './render.js';
import { setupDialogs } from './dialogs.js';
import { setupContextMenu } from './context-menu.js';

let currentState = null;
const selectedItems = new Map(); // id → item data

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
}

function render() {
  if (!currentState) return;
  const container = document.getElementById('bookmark-list');
  renderBookmarkTree(container, currentState, {
    initDragAndDrop,
    selectedIds: selectedItems,
  });
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

  // --- Group drag-and-drop ---
  initGroupDragAndDrop();
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
  // If dragging a selected item with others selected, make sure
  // SortableJS knows about all our selections
  const draggedData = evt.item.data;
  if (draggedData && selectedItems.size > 1 && selectedItems.has(draggedData.id)) {
    syncSelectionToSortable();
  }
}

async function handleDragEnd(evt) {
  const targetGroupId = evt.to.dataset.groupId;
  const newIndex = evt.newIndex;

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

    // Bookmarks: move to target group
    let sortOrder = newIndex;
    for (const item of bookmarked) {
      await sendMessage(MSG.MOVE_BOOKMARK, {
        id: item.id,
        groupId: targetGroupId,
        sortOrder: sortOrder++,
      });
    }
  }

  if (itemsToMove.length > 1) {
    clearSelection();
  }
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
