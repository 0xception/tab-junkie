// sidepanel/context-menu.js
import { MSG } from '../shared/messages.js';

let contextMenu = null;

/**
 * Set up context menu event handlers.
 */
export function setupContextMenu(sendMessage, getState, dialogs) {
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
      const group = groupHeader.data;
      if (group.isUnbookmarked) {
        // "Open Tabs" section header — close all orphan tabs
        const state = getState();
        const tabIds = (state?.unbookmarkedTabs || []).map(t => t.id);
        if (tabIds.length > 0) {
          contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="close-all-tabs">Close All Tabs (${tabIds.length})</div>
          `;
          contextMenu.dataset.tabIds = JSON.stringify(tabIds);
        }
      } else {
        // Regular group header
        const state = getState();
        const menuItems = [];

        // Collect all open tab IDs in this group (bookmarks + floating tabs)
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

        // Collect closed bookmark URLs in this group
        const closedBookmarkUrls = [];
        if (state) {
          for (const bm of state.bookmarks) {
            if (bm.groupId === group.id && !bm.isOpen) {
              closedBookmarkUrls.push(bm.url);
            }
          }
        }

        if (closedBookmarkUrls.length > 0) {
          menuItems.push(`<div class="context-menu-item" data-action="open-all-bookmarks">Open All Bookmarks (${closedBookmarkUrls.length})</div>`);
          contextMenu.dataset.bookmarkUrls = JSON.stringify(closedBookmarkUrls);
        }

        if (groupTabIds.length > 0) {
          menuItems.push(`<div class="context-menu-item" data-action="close-all-tabs">Close All Tabs (${groupTabIds.length})</div>`);
          contextMenu.dataset.tabIds = JSON.stringify(groupTabIds);
        }

        if (closedBookmarkUrls.length > 0 || groupTabIds.length > 0) {
          menuItems.push('<div class="context-menu-divider"></div>');
        }

        menuItems.push('<div class="context-menu-item" data-action="edit-group">Edit Group</div>');
        menuItems.push('<div class="context-menu-divider"></div>');
        menuItems.push('<div class="context-menu-item" data-action="delete-group" style="color: #cf5b5b;">Delete Group</div>');

        contextMenu.innerHTML = menuItems.join('');
        contextMenu.dataset.groupId = group.id;
      }
    } else if (bookmarkItem && bookmarkItem.data) {
      const data = bookmarkItem.data;
      const menuItems = [];

      if (data.isBookmarked === false) {
        // Floating tab
        const groupItems = bookmarkItem.closest('.group-items');
        const groupId = groupItems?.dataset?.groupId;
        if (groupId && groupId !== '__open_tabs__') {
          // Find the nearest preceding bookmark to insert after
          const siblings = [...groupItems.querySelectorAll(':scope > bookmark-item')];
          let afterBookmarkId = null;
          for (const sib of siblings) {
            if (sib === bookmarkItem) break;
            if (sib.data?.isBookmarked !== false) afterBookmarkId = sib.data.id;
          }

          menuItems.push('<div class="context-menu-item" data-action="save-to-group">Save to Group</div>');
          contextMenu.dataset.tabTitle = data.title;
          contextMenu.dataset.tabUrl = data.url;
          contextMenu.dataset.tabFavicon = data.favicon || '';
          contextMenu.dataset.groupId = groupId;
          if (afterBookmarkId) contextMenu.dataset.afterBookmarkId = afterBookmarkId;
        }
        // Floating tabs are always open
        menuItems.push('<div class="context-menu-item" data-action="close-tab">Close Tab</div>');
        contextMenu.dataset.tabId = data.tabId;
      } else {
        // Bookmarked item
        if (data.isOpen) {
          menuItems.push('<div class="context-menu-item" data-action="close-tab">Close Tab</div>');
          contextMenu.dataset.tabId = data.tabId;
        } else {
          menuItems.push('<div class="context-menu-item" data-action="open-tab">Open Tab</div>');
        }
        menuItems.push('<div class="context-menu-divider"></div>');
        menuItems.push('<div class="context-menu-item" data-action="remove-bookmark" style="color: #cf5b5b;">Remove Bookmark</div>');
        contextMenu.dataset.bookmarkId = data.id;
        contextMenu.dataset.bookmarkUrl = data.url;
        if (data.isOpen && data.tabId) contextMenu.dataset.pinTabId = data.tabId;
        if (data.groupId) contextMenu.dataset.pinGroupId = data.groupId;
      }

      contextMenu.innerHTML = menuItems.join('');
    }

    if (contextMenu.children.length > 0) {
      document.body.appendChild(contextMenu);
    }
  });

  document.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (menuItem && contextMenu) {
      handleContextAction(menuItem.dataset.action, sendMessage, dialogs);
    }
    hideContextMenu();
  });
}

async function handleContextAction(action, sendMessage, dialogs) {
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
  } else if (action === 'close-tab') {
    const tabId = parseInt(contextMenu.dataset.tabId, 10);
    if (tabId) await sendMessage(MSG.CLOSE_TAB, { tabId });
  } else if (action === 'open-tab') {
    await sendMessage(MSG.NAVIGATE_TO, { url: contextMenu.dataset.bookmarkUrl });
  } else if (action === 'remove-bookmark') {
    const payload = { id: contextMenu.dataset.bookmarkId };
    // If the tab is open, pin it to the group so it becomes a floating tab
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
  } else if (action === 'edit-group') {
    dialogs.openEditDialog(contextMenu.dataset.groupId);
  }
}

function hideContextMenu() {
  if (contextMenu && contextMenu.parentElement) {
    contextMenu.remove();
  }
  contextMenu = null;
}
