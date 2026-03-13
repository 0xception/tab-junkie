// sidepanel/render.js

/**
 * Render the full bookmark tree into the given container.
 */
export function renderBookmarkTree(container, state, { initDragAndDrop, selectedIds }) {
  container.innerHTML = '';

  const { bookmarks, groups, unbookmarkedTabs, preferences } = state;
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
    const section = renderGroup(group, bookmarks, groups, collapsedGroups, selectedIds);
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
      item.data = { ...bookmark, isBookmarked: true };
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

function renderGroup(group, bookmarks, allGroups, collapsedGroups, selectedIds) {
  const section = document.createElement('div');
  section.className = 'group-section';
  section.dataset.groupId = group.id;

  const isCollapsed = collapsedGroups.includes(group.id);
  const groupBookmarks = bookmarks
    .filter(b => b.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const subGroups = allGroups
    .filter(g => g.parentId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalCount = groupBookmarks.length + subGroups.reduce((sum, sg) => {
    return sum + bookmarks.filter(b => b.groupId === sg.id).length;
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
  for (const bookmark of groupBookmarks) {
    const item = document.createElement('bookmark-item');
    item.data = { ...bookmark, isBookmarked: true };
    applySelection(item, bookmark.id, selectedIds, hasSelection);
    items.appendChild(item);
  }

  section.appendChild(items);

  // Sub-groups container (always present for top-level groups as a drop target)
  if (group.parentId === null) {
    const subGroupsContainer = document.createElement('div');
    subGroupsContainer.className = 'sub-groups';
    subGroupsContainer.dataset.parentGroupId = group.id;
    for (const subGroup of subGroups) {
      const subSection = renderGroup(subGroup, bookmarks, allGroups, collapsedGroups, selectedIds);
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
