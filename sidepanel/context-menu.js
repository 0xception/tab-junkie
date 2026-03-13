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
      if (!group.isUnbookmarked) {
        contextMenu.innerHTML = `
          <div class="context-menu-item" data-action="edit-group">Edit Group</div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item" data-action="delete-group" style="color: #cf5b5b;">Delete Group</div>
        `;
        contextMenu.dataset.groupId = group.id;
      }
    } else if (bookmarkItem && bookmarkItem.data) {
      const data = bookmarkItem.data;
      if (data.isBookmarked !== false) {
        contextMenu.innerHTML = `
          <div class="context-menu-item" data-action="remove-bookmark">Remove Bookmark</div>
        `;
        contextMenu.dataset.bookmarkId = data.id;
      }
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
  } else if (action === 'remove-bookmark') {
    await sendMessage(MSG.REMOVE_BOOKMARK, { id: contextMenu.dataset.bookmarkId });
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
