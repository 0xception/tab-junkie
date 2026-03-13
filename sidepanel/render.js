// sidepanel/render.js

/**
 * Render the full bookmark tree into the given container.
 */
export function renderBookmarkTree(container, state, { initDragAndDrop, selectedIds }) {
  container.innerHTML = '';

  const { bookmarks, groups, unbookmarkedTabs, floatingTabsByGroup, preferences, activeTabId } = state;
  const collapsedGroups = preferences?.collapsedGroups || [];

  const topLevelGroups = groups
    .filter(g => g.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (topLevelGroups.length === 0 && bookmarks.length === 0 && unbookmarkedTabs.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks yet. Click + to add a group.</div>';
    return;
  }

  const hasSelection = selectedIds && selectedIds.size > 0;

  for (const group of topLevelGroups) {
    const section = renderGroup(group, bookmarks, groups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup);
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
    header.data = { id: null, name: 'Ungrouped', color: '#888', count: ungrouped.length, collapsed: false };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items';
    items.dataset.groupId = '';

    for (const bookmark of ungrouped) {
      const item = document.createElement('bookmark-item');
      item.data = { ...bookmark, isBookmarked: true, isActive: bookmark.tabId === activeTabId };
      applySelection(item, bookmark.id, selectedIds, hasSelection);
      items.appendChild(item);
    }

    section.appendChild(items);
    container.appendChild(section);
  }

  // Unbookmarked open tabs
  if (unbookmarkedTabs.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const isCollapsed = collapsedGroups.includes('__open_tabs__');
    const header = document.createElement('group-header');
    header.data = {
      id: '__open_tabs__',
      name: 'Open Tabs',
      count: unbookmarkedTabs.length,
      collapsed: isCollapsed,
      isUnbookmarked: true,
    };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items' + (isCollapsed ? ' collapsed' : '');
    items.dataset.groupId = '__open_tabs__';

    for (const tab of unbookmarkedTabs) {
      const itemId = `tab-${tab.id}`;
      const item = document.createElement('bookmark-item');
      item.data = {
        id: itemId,
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || null,
        isOpen: true,
        tabId: tab.id,
        isBookmarked: false,
        isActive: tab.id === activeTabId,
      };
      applySelection(item, itemId, selectedIds, hasSelection);
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

function renderGroup(group, bookmarks, allGroups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup = {}) {
  const section = document.createElement('div');
  section.className = 'group-section';
  section.dataset.groupId = group.id;

  const isCollapsed = collapsedGroups.includes(group.id);
  const groupBookmarks = bookmarks
    .filter(b => b.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const groupFloatingTabs = floatingTabsByGroup[group.id] || [];

  const subGroups = allGroups
    .filter(g => g.parentId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalCount = groupBookmarks.length + groupFloatingTabs.length + subGroups.reduce((sum, sg) => {
    const subFloating = floatingTabsByGroup[sg.id] || [];
    return sum + bookmarks.filter(b => b.groupId === sg.id).length + subFloating.length;
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

  // Build opener → children map for interleaving floating tabs after their parent
  const childrenByOpener = new Map();
  for (const tab of groupFloatingTabs) {
    const openerId = tab.openerTabId;
    if (!childrenByOpener.has(openerId)) childrenByOpener.set(openerId, []);
    childrenByOpener.get(openerId).push(tab);
  }

  function renderFloatingTab(tab) {
    const itemId = `tab-${tab.id}`;
    const item = document.createElement('bookmark-item');
    item.data = {
      id: itemId,
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || null,
      isOpen: true,
      tabId: tab.id,
      isBookmarked: false,
      isActive: tab.id === activeTabId,
    };
    applySelection(item, itemId, selectedIds, hasSelection);
    items.appendChild(item);
    // Recursively render floating tabs spawned from this floating tab
    renderFloatingChildren(tab.id);
  }

  function renderFloatingChildren(tabId) {
    const children = childrenByOpener.get(tabId);
    if (!children) return;
    for (const child of children) renderFloatingTab(child);
  }

  for (const bookmark of groupBookmarks) {
    const item = document.createElement('bookmark-item');
    item.data = { ...bookmark, isBookmarked: true, isActive: bookmark.tabId === activeTabId };
    applySelection(item, bookmark.id, selectedIds, hasSelection);
    items.appendChild(item);
    // Render any floating tabs spawned from this bookmark's tab
    if (bookmark.tabId != null) renderFloatingChildren(bookmark.tabId);
  }

  // Render any remaining floating tabs whose opener isn't in this group
  // (e.g., opener is a floating tab in another group that got resolved here)
  const rendered = new Set();
  for (const child of items.querySelectorAll('bookmark-item')) {
    const data = child.data;
    if (data && !data.isBookmarked) rendered.add(data.tabId);
  }
  for (const tab of groupFloatingTabs) {
    if (!rendered.has(tab.id)) renderFloatingTab(tab);
  }

  section.appendChild(items);

  // Sub-groups container (always present for top-level groups as a drop target)
  if (group.parentId === null) {
    const subGroupsContainer = document.createElement('div');
    subGroupsContainer.className = 'sub-groups';
    subGroupsContainer.dataset.parentGroupId = group.id;
    for (const subGroup of subGroups) {
      const subSection = renderGroup(subGroup, bookmarks, allGroups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup);
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
