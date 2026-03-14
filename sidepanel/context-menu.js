// sidepanel/context-menu.js
import { MSG } from '../shared/messages.js';

let contextMenu = null;
let selectionData = null; // Stores selection items for batch actions

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

    if (groupHeader && groupHeader.data) {
      buildGroupHeaderMenu(groupHeader.data, getState);
    } else if (bookmarkItem && bookmarkItem.data) {
      const data = bookmarkItem.data;
      const selectedItems = selection.getSelectedItems();

      // If the right-clicked item is part of a multi-selection, act on the whole selection
      if (selectedItems.size > 1 && selectedItems.has(data.id)) {
        buildSelectionMenu([...selectedItems.values()]);
      } else {
        buildSingleItemMenu(data, bookmarkItem);
      }
    }

    if (contextMenu.children.length > 0) {
      document.body.appendChild(contextMenu);
    }
  });

  document.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (menuItem && contextMenu) {
      handleContextAction(menuItem.dataset.action, sendMessage, dialogs, selection);
    }
    hideContextMenu();
  });
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

function buildGroupHeaderMenu(group, getState) {
  if (group.isUnbookmarked) {
    const state = getState();
    const tabIds = (state?.unbookmarkedTabs || []).map(t => t.id);
    if (tabIds.length > 0) {
      addMenuItem('close-all-tabs', `Close All Tabs (${tabIds.length})`);
      contextMenu.dataset.tabIds = JSON.stringify(tabIds);
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

    addMenuItem('edit-group', 'Edit Group');
    addDivider();
    addMenuItem('delete-group', 'Delete Group', true);

    contextMenu.dataset.groupId = group.id;
  }
}

function buildSelectionMenu(items) {
  selectionData = items;
  const count = items.length;

  const hasOpenTabs = items.some(item => item.tabId);
  const hasClosedBookmarks = items.some(item => item.isBookmarked !== false && !item.isOpen);
  const hasBookmarks = items.some(item => item.isBookmarked !== false);
  const hasFloatingTabs = items.some(item => item.isBookmarked === false);

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

function buildSingleItemMenu(data, bookmarkItem) {
  selectionData = null;

  if (data.isBookmarked === false) {
    // Floating tab
    const groupItems = bookmarkItem.closest('.group-items');
    const groupId = groupItems?.dataset?.groupId;
    if (groupId && groupId !== '__open_tabs__') {
      const siblings = [...groupItems.querySelectorAll(':scope > bookmark-item')];
      let afterBookmarkId = null;
      for (const sib of siblings) {
        if (sib === bookmarkItem) break;
        if (sib.data?.isBookmarked !== false) afterBookmarkId = sib.data.id;
      }

      addMenuItem('save-to-group', 'Save Bookmark');
      contextMenu.dataset.tabTitle = data.title;
      contextMenu.dataset.tabUrl = data.url;
      contextMenu.dataset.tabFavicon = data.favicon || '';
      contextMenu.dataset.groupId = groupId;
      if (afterBookmarkId) contextMenu.dataset.afterBookmarkId = afterBookmarkId;
    }
    addDivider();
    addMenuItem('close-tab', 'Close Tab', true);
    contextMenu.dataset.tabId = data.tabId;
  } else {
    // Bookmarked item
    if (!data.isOpen) {
      addMenuItem('open-tab', 'Open Tab');
    }
    addMenuItem('edit-bookmark', 'Edit Bookmark');
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

async function handleContextAction(action, sendMessage, dialogs, selection) {
  // --- Group header actions ---
  if (action === 'delete-group') {
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
  } else if (action === 'edit-group') {
    dialogs.openEditDialog(contextMenu.dataset.groupId);

  // --- Single item actions ---
  } else if (action === 'close-tab') {
    const tabId = parseInt(contextMenu.dataset.tabId, 10);
    if (tabId) await sendMessage(MSG.CLOSE_TAB, { tabId });
  } else if (action === 'edit-bookmark') {
    dialogs.openEditBookmarkDialog(contextMenu.dataset.bookmarkId);
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
    await sendMessage(MSG.ADD_BOOKMARK, {
      title: contextMenu.dataset.tabTitle,
      url: contextMenu.dataset.tabUrl,
      groupId: contextMenu.dataset.groupId,
      favicon: contextMenu.dataset.tabFavicon || null,
      afterBookmarkId: contextMenu.dataset.afterBookmarkId || null,
    });

  // --- Selection actions (idempotent across mixed types) ---
  } else if (action === 'selection-close-tabs' && selectionData) {
    for (const item of selectionData) {
      if (item.tabId) {
        await sendMessage(MSG.CLOSE_TAB, { tabId: item.tabId });
      }
    }
    selection.clearSelection();
  } else if (action === 'selection-open-tabs' && selectionData) {
    for (const item of selectionData) {
      if (item.isBookmarked !== false && !item.isOpen && item.url) {
        await sendMessage(MSG.NAVIGATE_TO, { url: item.url });
      }
    }
    selection.clearSelection();
  } else if (action === 'selection-remove-bookmarks' && selectionData) {
    // Collect all floating tab IDs in the selection so we can pin them to their groups
    // (removing a bookmark may break the opener chain for sibling floating tabs)
    const floatingTabPins = [];
    for (const item of selectionData) {
      if (item.isBookmarked === false && item.tabId) {
        // Find the group this floating tab is in from the DOM
        const el = document.querySelector(`bookmark-item[data-id="tab-${item.tabId}"]`);
        const groupId = el?.closest('.group-items')?.dataset?.groupId;
        if (groupId && groupId !== '__open_tabs__') {
          floatingTabPins.push({ tabId: item.tabId, groupId });
        }
      }
    }

    // Remove only actual bookmarks, pin their open tabs to stay as floating
    for (const item of selectionData) {
      if (item.isBookmarked === false) continue; // Skip floating tabs entirely
      if (!item.id || item.id.startsWith('tab-')) continue; // Extra safety

      const payload = { id: item.id };
      if (item.isOpen && item.tabId && item.groupId) {
        payload.pinTabId = item.tabId;
        payload.pinGroupId = item.groupId;
      }
      await sendMessage(MSG.REMOVE_BOOKMARK, payload);
    }
    selection.clearSelection();
  } else if (action === 'selection-save-to-group' && selectionData) {
    for (const item of selectionData) {
      if (item.isBookmarked === false && item.url) {
        // Find groupId from a bookmarked item in the selection, or from the item's DOM context
        const groupId = selectionData.find(i => i.isBookmarked !== false && i.groupId)?.groupId;
        if (groupId) {
          await sendMessage(MSG.ADD_BOOKMARK, {
            title: item.title,
            url: item.url,
            groupId,
            favicon: item.favicon || null,
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
