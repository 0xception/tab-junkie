// background/service-worker.js
import { createStorage } from './storage.js';
import { createBroadcaster } from './broadcaster.js';
import { MSG } from '../shared/messages.js';

const storage = createStorage(chrome);
const broadcaster = createBroadcaster(chrome, storage);

// --- Tab event listeners ---
// Re-broadcast state whenever tabs change

chrome.tabs.onCreated.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.tabs.onRemoved.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Rebroadcast on URL changes, loading start, or load complete
  if (changeInfo.url || changeInfo.status) {
    broadcaster.invalidateAndBroadcast();
  }
});
chrome.tabs.onActivated.addListener(() => broadcaster.invalidateAndBroadcast());

// --- Keyboard shortcut commands ---


// --- Message handler ---
// Receives requests from side panel and popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case MSG.GET_STATE:
      return broadcaster.getState();

    case MSG.ADD_BOOKMARK: {
      await storage.addBookmark(message.payload);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.REMOVE_BOOKMARK: {
      // If the tab is open, pin it to the group so it stays as a floating tab
      if (message.payload.pinTabId && message.payload.pinGroupId) {
        broadcaster.pinTabToGroup(message.payload.pinTabId, message.payload.pinGroupId);
      }
      await storage.removeBookmark(message.payload.id);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.UPDATE_BOOKMARK: {
      const { id, ...updates } = message.payload;
      await storage.updateBookmark(id, updates);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.MOVE_BOOKMARK: {
      const { id, groupId, sortOrder } = message.payload;
      await storage.moveBookmark(id, groupId, sortOrder);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.ADD_GROUP: {
      await storage.addGroup(message.payload);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.REMOVE_GROUP: {
      await storage.removeGroup(message.payload.id);
      // Move orphaned bookmarks to ungrouped with incrementing sort orders
      const bookmarks = await storage.getBookmarks();
      const ungrouped = bookmarks.filter(b => b.groupId === null);
      let nextSort = ungrouped.length;
      for (const bm of bookmarks) {
        if (bm.groupId === message.payload.id) {
          await storage.moveBookmark(bm.id, null, nextSort++);
        }
      }
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.UPDATE_GROUP: {
      const { id, ...updates } = message.payload;
      await storage.updateGroup(id, updates);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.MOVE_GROUP: {
      const { id, parentId, sortOrder } = message.payload;
      await storage.moveGroup(id, parentId, sortOrder);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.SET_PREFERENCE: {
      const { key, value } = message.payload;
      await storage.setPreference(key, value);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.BULK_ADD_BOOKMARKS: {
      const { items, groupId } = message.payload;
      for (const item of items) {
        await storage.addBookmark({
          title: item.title,
          url: item.url,
          groupId,
          favicon: item.favicon || null,
        });
      }
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.NAVIGATE_TO: {
      const { tabId, url } = message.payload;
      if (tabId) {
        // Tab is open — switch to it
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        // Tab is closed — open new tab
        const newTab = await chrome.tabs.create({ url });
        // Track this tab so we can match it even after redirects (SSO, etc.)
        broadcaster.trackTab(newTab.id, url);
      }
      // Broadcast so the green dot and active tab highlight update immediately
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.CLOSE_TAB: {
      const { tabId } = message.payload;
      if (tabId) {
        await chrome.tabs.remove(tabId);
      }
      // Tab removal triggers onRemoved which rebroadcasts
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}
