// sidepanel/context-menu.js
import { MSG } from '../shared/messages.js';
import { isTabItem, isBookmarkItem, getTabIdFromItemId } from '../shared/display-item.js';
import { openGroupPicker } from './group-picker.js';

let contextMenu = null;

/**
 * Set up context menu event handlers.
 */
export function setupContextMenu(sendMessage, getState, dialogs, selection) {
  document.addEventListener('contextmenu', (e) => {
    const groupHeader = e.target.closest('group-header');
    const bookmarkItem = e.target.closest('bookmark-item');

    if (!groupHeader && !bookmarkItem) {
      hideContextMenu();
      return;
    }

    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu._clickX = e.clientX;
    contextMenu._clickY = e.clientY;

    if (groupHeader && groupHeader.data) {
      buildGroupHeaderMenu(groupHeader.data, getState);
    } else if (bookmarkItem && bookmarkItem.data) {
      const data = bookmarkItem.data;
      const selectedIds = selection.getSelectedIds();

      // If the right-clicked item is part of a multi-selection, act on the whole selection
      if (selectedIds.size > 1 && selectedIds.has(data.id)) {
        buildSelectionMenu(selection.getSelectedItemData());
      } else {
        buildSingleItemMenu(data, bookmarkItem, getState);
      }
    }

    if (contextMenu.children.length > 0) {
      document.body.appendChild(contextMenu);

      // Clamp position so the menu stays within the viewport
      const rect = contextMenu.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 4;
      const maxY = window.innerHeight - rect.height - 4;
      if (e.clientX > maxX) contextMenu.style.left = `${Math.max(4, maxX)}px`;
      if (e.clientY > maxY) contextMenu.style.top = `${Math.max(4, maxY)}px`;
    }
  });

  document.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (menuItem && contextMenu) {
      // Capture dataset values before hideContextMenu nulls the reference
      const action = menuItem.dataset.action;
      handleContextAction(action, sendMessage, getState, dialogs, selection);
    }
    hideContextMenu();
  });

  // Close context menu when side panel loses focus (user clicked elsewhere in browser)
  window.addEventListener('blur', () => hideContextMenu());
}

function addMenuItem(action, label, destructive) {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.dataset.action = action;
  item.textContent = label;
  if (destructive) item.style.color = 'var(--group-red, #cf5b5b)';
  contextMenu.appendChild(item);
}

function addDivider() {
  const div = document.createElement('div');
  div.className = 'context-menu-divider';
  contextMenu.appendChild(div);
}

// No-op — submenu functions replaced by group picker modal

function getGroupIds(groupId, state) {
  // Returns groupId + all descendant sub-group IDs
  const ids = [groupId];
  for (const g of (state?.groups || [])) {
    if (g.parentId === groupId) ids.push(g.id);
  }
  return ids;
}

function collectGroupItemIds(groupId, state, { includeSubGroups = true } = {}) {
  if (!state) return { allIds: [], bookmarkIds: [], openTabIds: [] };

  const groupIds = includeSubGroups ? getGroupIds(groupId, state) : [groupId];
  const groupIdSet = new Set(groupIds);

  const allIds = [];
  const bookmarkIds = [];
  const openTabIds = [];

  for (const bm of state.bookmarks) {
    if (!groupIdSet.has(bm.groupId)) continue;
    allIds.push(bm.id);
    bookmarkIds.push(bm.id);
    if (bm.isOpen && bm.tabId) openTabIds.push(bm.id);
  }

  for (const gid of groupIds) {
    for (const tab of (state.floatingTabsByGroup?.[gid] || [])) {
      const tabItemId = `tab-${tab.id}`;
      allIds.push(tabItemId);
      openTabIds.push(tabItemId);
    }
  }

  return { allIds, bookmarkIds, openTabIds };
}

function buildGroupHeaderMenu(group, getState) {
  if (group.isUnbookmarked) {
    const state = getState();
    const tabIds = (state?.unbookmarkedTabs || []).map(t => t.id);
    if (tabIds.length > 0) {
      addMenuItem('close-all-tabs', `Close All Tabs (${tabIds.length})`);
      contextMenu.dataset.tabIds = JSON.stringify(tabIds);
      addDivider();
      const selectIds = tabIds.map(id => `tab-${id}`);
      addMenuItem('select-group-all', `Select All (${selectIds.length})`);
      contextMenu.dataset.selectIds = JSON.stringify(selectIds);
    }
  } else {
    const state = getState();

    const groupTabIds = [];
    if (state) {
      for (const bm of state.bookmarks) {
        if (bm.groupId === group.id && bm.isOpen && bm.tabId) {
          groupTabIds.push(bm.tabId);
        }
      }
      for (const tab of (state.floatingTabsByGroup?.[group.id] || [])) {
        groupTabIds.push(tab.id);
      }
    }

    const closedBookmarkUrls = [];
    if (state) {
      for (const bm of state.bookmarks) {
        if (bm.groupId === group.id && !bm.isOpen) {
          closedBookmarkUrls.push(bm.url);
        }
      }
    }

    if (closedBookmarkUrls.length > 0) {
      addMenuItem('open-all-bookmarks', `Open All Bookmarks (${closedBookmarkUrls.length})`);
      contextMenu.dataset.bookmarkUrls = JSON.stringify(closedBookmarkUrls);
    }

    if (groupTabIds.length > 0) {
      addMenuItem('close-all-tabs', `Close All Tabs (${groupTabIds.length})`);
      contextMenu.dataset.tabIds = JSON.stringify(groupTabIds);
    }

    if (closedBookmarkUrls.length > 0 || groupTabIds.length > 0) {
      addDivider();
    }

    // Select actions
    const { allIds, bookmarkIds, openTabIds } = collectGroupItemIds(group.id, state);
    if (allIds.length > 0) {
      addMenuItem('select-group-all', `Select All (${allIds.length})`);
      contextMenu.dataset.selectIds = JSON.stringify(allIds);
    }
    if (openTabIds.length > 0 && openTabIds.length !== allIds.length) {
      addMenuItem('select-group-open', `Select Open Tabs (${openTabIds.length})`);
      contextMenu.dataset.selectOpenIds = JSON.stringify(openTabIds);
    }
    if (bookmarkIds.length > 0 && bookmarkIds.length !== allIds.length) {
      addMenuItem('select-group-bookmarks', `Select Bookmarks (${bookmarkIds.length})`);
      contextMenu.dataset.selectBookmarkIds = JSON.stringify(bookmarkIds);
    }

    addDivider();
    addMenuItem('edit-group', 'Edit Group');
    addDivider();
    addMenuItem('delete-group', 'Delete Group', true);

    contextMenu.dataset.groupId = group.id;
  }
}

function buildSelectionMenu(items) {
  const count = items.length;

  const hasOpenTabs = items.some(item => item.tabId);
  const hasClosedBookmarks = items.some(item => isBookmarkItem(item) && !item.isOpen);
  const hasBookmarks = items.some(item => isBookmarkItem(item));
  const hasFloatingTabs = items.some(item => isTabItem(item));

  if (hasClosedBookmarks) {
    addMenuItem('selection-open-tabs', `Open Tabs (${count})`);
  }

  if (hasFloatingTabs) {
    addMenuItem('selection-save-to-group', `Save Bookmarks (${count})`);
  }

  addDivider();

  if (hasOpenTabs) {
    addMenuItem('selection-close-tabs', `Close Tabs (${count})`);
  }

  if (hasBookmarks) {
    addMenuItem('selection-remove-bookmarks', `Remove Bookmarks (${count})`, true);
  }
}

function buildSingleItemMenu(data, bookmarkItem, getState) {
  if (isTabItem(data)) {
    // Floating tab or unbookmarked tab
    const groupItems = bookmarkItem.closest('.group-items');
    const currentGroupId = groupItems?.dataset?.groupId;
    if (currentGroupId && currentGroupId !== '__open_tabs__') {
      const siblings = [...groupItems.querySelectorAll(':scope > bookmark-item')];
      let afterBookmarkId = null;
      for (const sib of siblings) {
        if (sib === bookmarkItem) break;
        if (sib.data && isBookmarkItem(sib.data)) afterBookmarkId = sib.data.id;
      }

      addMenuItem('save-to-group', 'Save Bookmark');
      contextMenu.dataset.tabTitle = data.title;
      contextMenu.dataset.tabUrl = data.url;
      contextMenu.dataset.tabFavicon = data.favicon || '';
      contextMenu.dataset.groupId = currentGroupId;
      contextMenu.dataset.saveTabId = data.tabId;
      if (afterBookmarkId) contextMenu.dataset.afterBookmarkId = afterBookmarkId;
    }
    addMenuItem('save-to-group-picker', 'Save to Group...');
    contextMenu.dataset.tabTitle = data.title;
    contextMenu.dataset.tabUrl = data.url;
    contextMenu.dataset.tabFavicon = data.favicon || '';
    contextMenu.dataset.saveTabId = data.tabId;
    addDivider();
    addMenuItem('close-tab', 'Close Tab', true);
    contextMenu.dataset.tabId = data.tabId;
  } else {
    // Bookmarked item
    if (!data.isOpen) {
      addMenuItem('open-tab', 'Open Tab');
    }
    addMenuItem('edit-bookmark', 'Edit Bookmark');
    if (data.isOpen && data.tabId) {
      addMenuItem('update-from-tab', 'Update from Tab');
      contextMenu.dataset.updateTabId = data.tabId;
    }
    addMenuItem('move-to-group-picker', 'Move to Group...');
    addDivider();
    if (data.isOpen) {
      addMenuItem('close-tab', 'Close Tab');
      contextMenu.dataset.tabId = data.tabId;
    }
    addMenuItem('remove-bookmark', 'Remove Bookmark', true);
    contextMenu.dataset.bookmarkId = data.id;
    contextMenu.dataset.bookmarkUrl = data.url;
    if (data.isOpen && data.tabId) contextMenu.dataset.pinTabId = data.tabId;
    if (data.groupId) contextMenu.dataset.pinGroupId = data.groupId;
  }
}

async function handleContextAction(action, sendMessage, getState, dialogs, selection) {
  // --- Group header actions ---
  if (action === 'move-to-group-picker') {
    const bookmarkId = contextMenu?.dataset.bookmarkId;
    const currentGroupId = contextMenu?.dataset.pinGroupId || null;
    const clickX = contextMenu?._clickX;
    const clickY = contextMenu?._clickY;
    const state = getState();
    if (bookmarkId && state) {
      openGroupPicker(state.groups, state.bookmarks, state.floatingTabsByGroup || {}, currentGroupId, async (groupId) => {
        await sendMessage(MSG.MOVE_BOOKMARK, { id: bookmarkId, groupId, sortOrder: 9999 });
      }, { position: 'cursor', x: clickX, y: clickY });
    }
  } else if (action === 'save-to-group-picker') {
    const tabTitle = contextMenu?.dataset.tabTitle;
    const tabUrl = contextMenu?.dataset.tabUrl;
    const tabFavicon = contextMenu?.dataset.tabFavicon;
    const saveTabId = contextMenu?.dataset.saveTabId ? parseInt(contextMenu.dataset.saveTabId, 10) : null;
    const clickX = contextMenu?._clickX;
    const clickY = contextMenu?._clickY;
    const state = getState();
    if (tabUrl && state) {
      openGroupPicker(state.groups, state.bookmarks, state.floatingTabsByGroup || {}, null, async (groupId) => {
        await sendMessage(MSG.ADD_BOOKMARK, {
          title: tabTitle || tabUrl,
          url: tabUrl,
          groupId,
          favicon: tabFavicon || null,
          tabId: saveTabId,
        });
      }, { position: 'cursor', x: clickX, y: clickY });
    }
  } else if (action === 'delete-group') {
    await sendMessage(MSG.REMOVE_GROUP, { id: contextMenu.dataset.groupId });
  } else if (action === 'open-all-bookmarks') {
    const urls = JSON.parse(contextMenu.dataset.bookmarkUrls || '[]');
    for (const url of urls) {
      await sendMessage(MSG.NAVIGATE_TO, { url });
    }
  } else if (action === 'close-all-tabs') {
    const tabIds = JSON.parse(contextMenu.dataset.tabIds || '[]');
    for (const tabId of tabIds) {
      await sendMessage(MSG.CLOSE_TAB, { tabId });
    }
  } else if (action === 'select-group-all') {
    const ids = JSON.parse(contextMenu.dataset.selectIds || '[]');
    selection.setSelection(ids);
  } else if (action === 'select-group-open') {
    const ids = JSON.parse(contextMenu.dataset.selectOpenIds || '[]');
    selection.setSelection(ids);
  } else if (action === 'select-group-bookmarks') {
    const ids = JSON.parse(contextMenu.dataset.selectBookmarkIds || '[]');
    selection.setSelection(ids);
  } else if (action === 'edit-group') {
    dialogs.openEditDialog(contextMenu.dataset.groupId);

  // --- Single item actions ---
  } else if (action === 'close-tab') {
    const tabId = parseInt(contextMenu.dataset.tabId, 10);
    if (tabId) await sendMessage(MSG.CLOSE_TAB, { tabId });
  } else if (action === 'edit-bookmark') {
    dialogs.openEditBookmarkDialog(contextMenu.dataset.bookmarkId);
  } else if (action === 'update-from-tab') {
    const tabId = parseInt(contextMenu.dataset.updateTabId, 10);
    const bookmarkId = contextMenu.dataset.bookmarkId;
    if (tabId && bookmarkId) {
      const tab = await chrome.tabs.get(tabId);
      if (tab) {
        const updates = { title: tab.title, url: tab.url };
        if (tab.favIconUrl) updates.favicon = tab.favIconUrl;
        await sendMessage(MSG.UPDATE_BOOKMARK, { id: bookmarkId, ...updates });
      }
    }
  } else if (action === 'open-tab') {
    await sendMessage(MSG.NAVIGATE_TO, { url: contextMenu.dataset.bookmarkUrl });
  } else if (action === 'remove-bookmark') {
    const payload = { id: contextMenu.dataset.bookmarkId };
    if (contextMenu.dataset.pinTabId && contextMenu.dataset.pinGroupId) {
      payload.pinTabId = parseInt(contextMenu.dataset.pinTabId, 10);
      payload.pinGroupId = contextMenu.dataset.pinGroupId;
    }
    await sendMessage(MSG.REMOVE_BOOKMARK, payload);
  } else if (action === 'save-to-group') {
    const saveTabId = contextMenu.dataset.saveTabId ? parseInt(contextMenu.dataset.saveTabId, 10) : null;
    await sendMessage(MSG.ADD_BOOKMARK, {
      title: contextMenu.dataset.tabTitle,
      url: contextMenu.dataset.tabUrl,
      groupId: contextMenu.dataset.groupId,
      favicon: contextMenu.dataset.tabFavicon || null,
      afterBookmarkId: contextMenu.dataset.afterBookmarkId || null,
      tabId: saveTabId,
    });

  // --- Selection actions (resolve fresh data from state via selection.getSelectedItemData) ---
  } else if (action === 'selection-close-tabs') {
    const items = selection.getSelectedItemData();
    for (const item of items) {
      if (item.tabId) {
        await sendMessage(MSG.CLOSE_TAB, { tabId: item.tabId });
      }
    }
    selection.clearSelection();
  } else if (action === 'selection-open-tabs') {
    const items = selection.getSelectedItemData();
    for (const item of items) {
      if (isBookmarkItem(item) && !item.isOpen && item.url) {
        await sendMessage(MSG.NAVIGATE_TO, { url: item.url });
      }
    }
    selection.clearSelection();
  } else if (action === 'selection-remove-bookmarks') {
    const items = selection.getSelectedItemData();

    // Remove only actual bookmarks, pin their open tabs to stay as floating
    for (const item of items) {
      if (isTabItem(item)) continue; // Skip floating tabs entirely
      if (!item.id || getTabIdFromItemId(item.id) !== null) continue; // Extra safety

      const payload = { id: item.id };
      if (item.isOpen && item.tabId && item.groupId) {
        payload.pinTabId = item.tabId;
        payload.pinGroupId = item.groupId;
      }
      await sendMessage(MSG.REMOVE_BOOKMARK, payload);
    }
    selection.clearSelection();
  } else if (action === 'selection-save-to-group') {
    const items = selection.getSelectedItemData();
    // Determine target group: prefer a bookmarked item's group, fall back to any item's group
    const targetGroupId = items.find(i => isBookmarkItem(i) && i.groupId)?.groupId
      || items.find(i => i.groupId)?.groupId;
    for (const item of items) {
      if (isTabItem(item) && item.url) {
        const groupId = item.groupId || targetGroupId;
        if (groupId) {
          await sendMessage(MSG.ADD_BOOKMARK, {
            title: item.title,
            url: item.url,
            groupId,
            favicon: item.favicon || null,
            tabId: item.tabId || null,
          });
        }
      }
    }
    selection.clearSelection();
  }
}

function hideContextMenu() {
  if (contextMenu && contextMenu.parentElement) {
    contextMenu.remove();
  }
  contextMenu = null;
}
