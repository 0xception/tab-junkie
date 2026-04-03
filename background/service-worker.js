// background/service-worker.js
import { createStorage } from './storage.js';
import { createBroadcaster } from './broadcaster.js';
import { normalizeUrl } from './tab-matcher.js';
import { MSG, JUNKIE_TO_CHROME_COLOR, HEX_TO_SEMANTIC_COLOR } from '../shared/messages.js';

const storage = createStorage(chrome);
const broadcaster = createBroadcaster(chrome, storage);

// Migrate hex group colors to semantic names (one-time, idempotent)
storage.migrateGroupColors(HEX_TO_SEMANTIC_COLOR);

// --- Tab event listeners ---
// Re-broadcast state whenever tabs change

chrome.tabs.onCreated.addListener(() => {
  if (navigatingCount === 0) broadcaster.invalidateAndBroadcast();
});
chrome.tabs.onRemoved.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Skip broadcasts while NAVIGATE_TO is setting up tracking (prevents stale state flash)
  if (navigatingCount > 0) return;
  // Clean up stale tracking when a tab navigates to a different page
  if (changeInfo.url) {
    broadcaster.cleanupTrackingIfNeeded(tabId, changeInfo.url);
  }
  // Mark tab as having completed initial load (used for tracking cleanup heuristic)
  if (changeInfo.status === 'complete') {
    broadcaster.markTabLoaded(tabId);
  }
  // Rebroadcast on URL changes, load complete, or audible state change
  if (changeInfo.url || changeInfo.status === 'complete' || changeInfo.audible != null) {
    broadcaster.invalidateAndBroadcast();
  }
});
chrome.tabs.onActivated.addListener(() => broadcaster.invalidateAndBroadcast());

chrome.windows.onCreated.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.windows.onRemoved.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) broadcaster.invalidateAndBroadcast();
});
chrome.tabs.onAttached.addListener(() => broadcaster.invalidateAndBroadcast());

let syncingTabOrderCount = 0;
let navigatingCount = 0;

chrome.tabs.onMoved.addListener(() => {
  if (syncingTabOrderCount === 0) broadcaster.invalidateAndBroadcast();
});

// --- Keyboard shortcut commands ---

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-junkie-window') {
    await openJunkieWindow();
  } else if (command === 'group-jump') {
    await openGroupJumpPopup();
  }
});

async function openJunkieWindow() {
  // Check if a Junkie window is already open — focus it instead of opening a new one
  const allWindows = await chrome.windows.getAll({ populate: true });
  for (const win of allWindows) {
    if (win.type === 'popup' && win.tabs?.length === 1) {
      const tab = win.tabs[0];
      if (tab.url?.includes(chrome.runtime.getURL('sidepanel/sidepanel.html'))) {
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    }
  }

  // Get the current window to position the new window on the right side
  const currentWindow = await chrome.windows.getCurrent();
  const width = 380;
  const left = currentWindow.left + currentWindow.width - width;

  await chrome.windows.create({
    url: 'sidepanel/sidepanel.html',
    type: 'popup',
    width,
    height: currentWindow.height,
    top: currentWindow.top,
    left,
  });
}

function openGroupJumpPopup() {
  // Set mode flag (fire-and-forget to preserve user gesture context for openPopup)
  chrome.storage.session.set({ popupMode: 'groups' });
  // Must call openPopup synchronously in the user gesture context — no awaits before this
  chrome.action.openPopup().catch(() => {
    // If popup is already open, openPopup throws — close it instead
    chrome.runtime.sendMessage({ type: 'popup-close' }).catch(() => {});
    chrome.storage.session.remove('popupMode');
  });
}

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
      const bookmark = await storage.addBookmark(message.payload);
      // If saving from an open tab (e.g., floating tab → bookmark), track the association
      // so the matcher links this specific bookmark to that tab instead of relying on URL lookup
      if (message.payload.tabId) {
        await broadcaster.trackTab(message.payload.tabId, bookmark.url, bookmark.id);
      }
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.REMOVE_BOOKMARK: {
      // If the tab is open, pin it to the group so it stays as a floating tab
      if (message.payload.pinTabId && message.payload.pinGroupId) {
        await broadcaster.pinTabToGroup(message.payload.pinTabId, message.payload.pinGroupId);
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
      const removedId = message.payload.id;
      await storage.removeGroup(removedId);
      // Move orphaned bookmarks to ungrouped in a single write
      const bookmarks = await storage.getBookmarks();
      const ungroupedCount = bookmarks.filter(b => b.groupId === null).length;
      let nextSort = ungroupedCount;
      let changed = false;
      for (const bm of bookmarks) {
        if (bm.groupId === removedId) {
          bm.groupId = null;
          bm.sortOrder = nextSort++;
          changed = true;
        }
      }
      if (changed) await storage.setBookmarks(bookmarks);
      // Prune deleted group from preferences
      const prefs = await storage.getPreferences();
      const collapsed = prefs.collapsedGroups || [];
      if (collapsed.includes(removedId)) {
        await storage.setPreference('collapsedGroups', collapsed.filter(id => id !== removedId));
      }
      const groupItemOrders = prefs.groupItemOrders || {};
      if (groupItemOrders[removedId]) {
        const { [removedId]: _, ...rest } = groupItemOrders;
        await storage.setPreference('groupItemOrders', rest);
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
      const allBookmarks = await storage.getBookmarks();
      const groupCount = allBookmarks.filter(b => b.groupId === groupId).length;
      for (let i = 0; i < items.length; i++) {
        allBookmarks.push({
          id: crypto.randomUUID(),
          title: items[i].title,
          url: items[i].url,
          groupId: groupId || null,
          sortOrder: groupCount + i,
          favicon: items[i].favicon || null,
          createdAt: Date.now(),
        });
      }
      await storage.setBookmarks(allBookmarks);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.PIN_TAB: {
      const { tabId, groupId } = message.payload;
      await broadcaster.pinTabToGroup(tabId, groupId);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.NAVIGATE_TO: {
      const { tabId, url, bookmarkId } = message.payload;
      if (tabId) {
        // Tab is open — switch to it
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        // Suppress onCreated/onUpdated broadcasts while we set up tracking,
        // preventing a stale state flash where the new tab appears as unbookmarked
        navigatingCount++;
        try {
          const newTab = await chrome.tabs.create({ url });
          // Track this tab so we can match it to this specific bookmark
          await broadcaster.trackTab(newTab.id, url, bookmarkId);
        } finally {
          navigatingCount--;
        }
      }
      // Record access time for this bookmark
      if (bookmarkId) {
        await storage.touchBookmark(bookmarkId);
      }
      // Broadcast so the green dot and active tab highlight update immediately
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.SYNC_TAB_ORDER: {
      try {
        await syncTabOrderInChrome(message.payload.tabOrder);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    case MSG.SYNC_ALL_TAB_ORDER: {
      try {
        syncingTabOrderCount++;

        // Step 1: Ungroup all existing Chrome tab groups (clean slate)
        const allTabs = await chrome.tabs.query({});
        const groupedTabIds = allTabs
          .filter(t => t.groupId !== -1)
          .map(t => t.id);
        if (groupedTabIds.length > 0) {
          await chrome.tabs.ungroup(groupedTabIds);
        }

        // Step 2: Get Junkie state
        const state = await broadcaster.getState();

        // Step 3: Build flat sync groups (sub-groups flattened into parents)
        const topLevelGroups = state.groups
          .filter(g => g.parentId === null)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        for (const group of topLevelGroups) {
          // Collect tabs: parent first, then sub-groups in sortOrder
          const tabOrder = [];
          collectGroupTabs(state, group.id, tabOrder);

          const subGroups = state.groups
            .filter(g => g.parentId === group.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          for (const sub of subGroups) {
            collectGroupTabs(state, sub.id, tabOrder);
          }

          if (tabOrder.length === 0) continue;

          // Step 4: Reorder tabs in Chrome
          if (tabOrder.length >= 2) {
            await syncTabOrderInChrome(tabOrder, { skipFlagManagement: true });
          }

          // Step 5: Create Chrome tab group per window
          // Re-fetch tab info after moves to get current windowIds
          const movedTabs = await Promise.all(
            tabOrder.map(id => chrome.tabs.get(id).catch(() => null))
          );
          const validTabs = movedTabs.filter(Boolean);
          if (validTabs.length === 0) continue;

          const byWindow = new Map();
          for (const tab of validTabs) {
            if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
            byWindow.get(tab.windowId).push(tab.id);
          }

          const chromeColor = JUNKIE_TO_CHROME_COLOR[group.color] || 'grey';

          for (const [windowId, windowTabIds] of byWindow) {
            const chromeGroupId = await chrome.tabs.group({
              tabIds: windowTabIds,
              createProperties: { windowId },
            });
            await chrome.tabGroups.update(chromeGroupId, {
              title: group.name,
              color: chromeColor,
            });
          }
        }

        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        syncingTabOrderCount--;
        broadcaster.invalidateAndBroadcast();
      }
    }

    case MSG.OPEN_JUNKIE_WINDOW: {
      await openJunkieWindow();
      return { success: true };
    }

    case MSG.NORMALIZE_GROUP_SORT: {
      // Receives { groupId, bookmarkIds: [...] } — the bookmarkIds are in DOM order
      const { groupId, bookmarkIds } = message.payload;
      const bookmarks = await storage.getBookmarks();
      for (let i = 0; i < bookmarkIds.length; i++) {
        const bm = bookmarks.find(b => b.id === bookmarkIds[i]);
        if (bm) {
          bm.groupId = groupId || null;
          bm.sortOrder = i;
        }
      }
      await storage.setBookmarks(bookmarks);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.IMPORT_REPLACE: {
      const { bookmarks, groups } = message.payload;
      await storage.replaceAll(bookmarks, groups);
      await storage.migrateGroupColors(HEX_TO_SEMANTIC_COLOR);
      broadcaster.resetPinnedTabs();
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.SCROLL_TO_GROUP: {
      // Broadcast to all extension pages (side panel / junkie window)
      chrome.runtime.sendMessage({
        type: MSG.SCROLL_TO_GROUP,
        payload: message.payload,
      }).catch(() => {});
      return { success: true };
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

async function syncTabOrderInChrome(tabOrder, { skipFlagManagement = false } = {}) {
  if (tabOrder.length < 2) return;
  const tabs = await Promise.all(tabOrder.map(id => chrome.tabs.get(id).catch(() => null)));
  const valid = tabs.filter(Boolean);
  if (valid.length < 2) return;

  // Group by window — can only reorder within same window
  const byWindow = new Map();
  for (const tab of valid) {
    if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
    byWindow.get(tab.windowId).push(tab);
  }

  if (!skipFlagManagement) syncingTabOrderCount++;
  try {
    for (const [, windowTabs] of byWindow) {
      // Preserve Junkie's order within each window
      const tabIdOrder = tabOrder.filter(id => windowTabs.some(t => t.id === id));
      const anchor = Math.min(...windowTabs.map(t => t.index));
      for (let i = 0; i < tabIdOrder.length; i++) {
        await chrome.tabs.move(tabIdOrder[i], { index: anchor + i });
      }
    }
  } finally {
    if (!skipFlagManagement) {
      syncingTabOrderCount--;
      broadcaster.invalidateAndBroadcast();
    }
  }
}

function collectGroupTabs(state, groupId, tabOrder) {
  const groupBookmarks = state.bookmarks
    .filter(b => b.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const floatingTabs = state.floatingTabsByGroup[groupId] || [];
  for (const bm of groupBookmarks) {
    if (bm.tabId != null) tabOrder.push(bm.tabId);
  }
  for (const tab of floatingTabs) {
    tabOrder.push(tab.id);
  }
}
