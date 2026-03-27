// sidepanel/render.js
import { fromEnrichedBookmark, fromFloatingTab, fromUnbookmarkedTab } from '../shared/display-item.js';

/**
 * Render the full bookmark tree into the given container.
 */
export function renderBookmarkTree(container, state, { initDragAndDrop, selectedIds, myWindowId, windowFilter }) {
  container.innerHTML = '';

  const { bookmarks, groups, unbookmarkedTabs, floatingTabsByGroup, preferences, activeTabId, windows } = state;
  const collapsedGroups = preferences?.collapsedGroups || [];

  // Build windowId → label number map for badge rendering
  const windowLabelMap = new Map();
  const multipleWindows = windows && windows.length > 1;
  if (multipleWindows) {
    for (const w of windows) {
      windowLabelMap.set(w.id, w.label.replace('Window ', ''));
    }
  }

  const groupItemOrders = preferences?.groupItemOrders || {};
  const uiContext = { activeTabId, windowLabelMap, myWindowId, groupItemOrders };

  const topLevelGroups = groups
    .filter(g => g.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (topLevelGroups.length === 0 && bookmarks.length === 0 && unbookmarkedTabs.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks yet. Click + to add a group.</div>';
    return;
  }

  const hasSelection = selectedIds && selectedIds.size > 0;

  for (const group of topLevelGroups) {
    const section = renderGroup(group, bookmarks, groups, collapsedGroups, selectedIds, uiContext, floatingTabsByGroup, windowFilter);
    section.setAttribute('data-draggable', '');
    // Add drag handle for group reordering
    const handle = document.createElement('div');
    handle.className = 'group-drag-handle';
    handle.textContent = '⠿';
    section.prepend(handle);
    container.appendChild(section);
  }

  // Ungrouped bookmarks
  const ungrouped = bookmarks
    .filter(b => b.groupId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (ungrouped.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const header = document.createElement('group-header');
    header.data = { id: null, name: 'Ungrouped', color: 'slate', count: ungrouped.length, collapsed: false };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items';
    items.dataset.groupId = '';

    for (const bookmark of ungrouped) {
      const item = document.createElement('bookmark-item');
      item.data = fromEnrichedBookmark(bookmark, uiContext);
      applySelection(item, bookmark.id, selectedIds, hasSelection);
      items.appendChild(item);
    }

    section.appendChild(items);
    container.appendChild(section);
  }

  // Unbookmarked open tabs
  const filteredUnbookmarkedTabs = windowFilter
    ? unbookmarkedTabs.filter(t => t.windowId === windowFilter)
    : unbookmarkedTabs;

  if (filteredUnbookmarkedTabs.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const isCollapsed = collapsedGroups.includes('__open_tabs__');
    const header = document.createElement('group-header');
    header.data = {
      id: '__open_tabs__',
      name: 'Open Tabs',
      count: filteredUnbookmarkedTabs.length,
      collapsed: isCollapsed,
      isUnbookmarked: true,
    };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items' + (isCollapsed ? ' collapsed' : '');
    items.dataset.groupId = '__open_tabs__';

    for (const tab of filteredUnbookmarkedTabs) {
      const displayItem = fromUnbookmarkedTab(tab, uiContext);
      const item = document.createElement('bookmark-item');
      item.data = displayItem;
      applySelection(item, displayItem.id, selectedIds, hasSelection);
      items.appendChild(item);
    }

    section.appendChild(items);
    container.appendChild(section);
  }

  initDragAndDrop();
}

function applySelection(item, id, selectedIds, hasSelection) {
  if (hasSelection) item.setAttribute('selectable', '');
  if (selectedIds && selectedIds.has(id)) item.selected = true;
}

function renderGroup(group, bookmarks, allGroups, collapsedGroups, selectedIds, uiContext, floatingTabsByGroup = {}, windowFilter = null) {
  const section = document.createElement('div');
  section.className = 'group-section';
  section.dataset.groupId = group.id;

  const isCollapsed = collapsedGroups.includes(group.id);
  const groupBookmarks = bookmarks
    .filter(b => b.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const allGroupFloatingTabs = floatingTabsByGroup[group.id] || [];
  const groupFloatingTabs = windowFilter
    ? allGroupFloatingTabs.filter(t => t.windowId === windowFilter)
    : allGroupFloatingTabs;

  const subGroups = allGroups
    .filter(g => g.parentId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalCount = groupBookmarks.length + groupFloatingTabs.length + subGroups.reduce((sum, sg) => {
    const subFloating = floatingTabsByGroup[sg.id] || [];
    const filteredSubFloating = windowFilter ? subFloating.filter(t => t.windowId === windowFilter) : subFloating;
    return sum + bookmarks.filter(b => b.groupId === sg.id).length + filteredSubFloating.length;
  }, 0);

  const header = document.createElement('group-header');
  header.data = {
    id: group.id,
    name: group.name,
    color: group.color,
    count: totalCount,
    collapsed: isCollapsed,
    isSubGroup: group.parentId !== null,
  };
  section.appendChild(header);

  const items = document.createElement('div');
  items.className = 'group-items' + (isCollapsed ? ' collapsed' : '');
  items.dataset.groupId = group.id;

  const hasSelection = selectedIds && selectedIds.size > 0;

  // Check for explicit item order (set by drag-and-drop reordering)
  const explicitOrder = uiContext.groupItemOrders?.[group.id];

  if (explicitOrder && explicitOrder.length > 0) {
    // Render in user-defined order (bookmarks and floating tabs interleaved)
    const bookmarkMap = new Map(groupBookmarks.map(b => [b.id, b]));
    const floatingMap = new Map(groupFloatingTabs.map(t => [`tab-${t.id}`, t]));

    for (const itemId of explicitOrder) {
      if (bookmarkMap.has(itemId)) {
        const bookmark = bookmarkMap.get(itemId);
        const item = document.createElement('bookmark-item');
        item.data = fromEnrichedBookmark(bookmark, uiContext);
        applySelection(item, bookmark.id, selectedIds, hasSelection);
        items.appendChild(item);
        bookmarkMap.delete(itemId);
      } else if (floatingMap.has(itemId)) {
        const tab = floatingMap.get(itemId);
        const displayItem = fromFloatingTab(tab, uiContext);
        const item = document.createElement('bookmark-item');
        item.data = displayItem;
        applySelection(item, displayItem.id, selectedIds, hasSelection);
        items.appendChild(item);
        floatingMap.delete(itemId);
      }
      // Stale IDs (closed tabs, removed bookmarks) are silently skipped
    }

    // Append new items not yet in the explicit order (added after last reorder)
    for (const bookmark of bookmarkMap.values()) {
      const item = document.createElement('bookmark-item');
      item.data = fromEnrichedBookmark(bookmark, uiContext);
      applySelection(item, bookmark.id, selectedIds, hasSelection);
      items.appendChild(item);
    }
    for (const tab of floatingMap.values()) {
      const displayItem = fromFloatingTab(tab, uiContext);
      const item = document.createElement('bookmark-item');
      item.data = displayItem;
      applySelection(item, displayItem.id, selectedIds, hasSelection);
      items.appendChild(item);
    }
  } else {
    // Default ordering: bookmarks by sortOrder, floating tabs after their opener via chain
    const childrenByOpener = new Map();
    for (const tab of groupFloatingTabs) {
      const openerId = tab.openerTabId;
      if (!childrenByOpener.has(openerId)) childrenByOpener.set(openerId, []);
      childrenByOpener.get(openerId).push(tab);
    }

    function renderFloatingTabEl(tab) {
      const displayItem = fromFloatingTab(tab, uiContext);
      const item = document.createElement('bookmark-item');
      item.data = displayItem;
      applySelection(item, displayItem.id, selectedIds, hasSelection);
      items.appendChild(item);
      renderFloatingChildren(tab.id);
    }

    function renderFloatingChildren(tabId) {
      const children = childrenByOpener.get(tabId);
      if (!children) return;
      for (const child of children) renderFloatingTabEl(child);
    }

    for (const bookmark of groupBookmarks) {
      const item = document.createElement('bookmark-item');
      item.data = fromEnrichedBookmark(bookmark, uiContext);
      applySelection(item, bookmark.id, selectedIds, hasSelection);
      items.appendChild(item);
      if (bookmark.tabId != null) renderFloatingChildren(bookmark.tabId);
    }

    // Render remaining floating tabs whose opener isn't in this group
    const rendered = new Set();
    for (const child of items.querySelectorAll('bookmark-item')) {
      const data = child.data;
      if (data && !data.isBookmarked) rendered.add(data.tabId);
    }
    for (const tab of groupFloatingTabs) {
      if (!rendered.has(tab.id)) renderFloatingTabEl(tab);
    }
  }

  section.appendChild(items);

  // Sub-groups container (always present for top-level groups as a drop target)
  if (group.parentId === null) {
    const subGroupsContainer = document.createElement('div');
    subGroupsContainer.className = 'sub-groups';
    subGroupsContainer.dataset.parentGroupId = group.id;
    for (const subGroup of subGroups) {
      const subSection = renderGroup(subGroup, bookmarks, allGroups, collapsedGroups, selectedIds, uiContext, floatingTabsByGroup, windowFilter);
      subSection.setAttribute('data-draggable', '');
      const handle = document.createElement('div');
      handle.className = 'group-drag-handle';
      handle.textContent = '⠿';
      subSection.prepend(handle);
      subGroupsContainer.appendChild(subSection);
    }
    section.appendChild(subGroupsContainer);
  }

  return section;
}
