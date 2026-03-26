// background/broadcaster.js
import { matchTabsToBookmarks } from './tab-matcher.js';

/**
 * State Broadcaster.
 * Merges bookmarks + open tabs into unified state and broadcasts to UIs.
 */
export function createBroadcaster(chrome, storage) {
  let cachedState = null;

  // Track tabs we opened from bookmarks (survives redirects)
  // Maps tabId → bookmark URL — persisted to session storage so it survives service worker restarts
  let trackedTabs = new Map();
  let trackedTabsLoaded = false;

  async function loadTrackedTabs() {
    if (trackedTabsLoaded) return;
    trackedTabsLoaded = true;
    const { trackedTabsData } = await chrome.storage.session.get('trackedTabsData');
    if (trackedTabsData) {
      for (const [tabId, url] of Object.entries(trackedTabsData)) {
        trackedTabs.set(Number(tabId), url);
      }
    }
  }

  async function saveTrackedTabs() {
    const obj = {};
    for (const [tabId, url] of trackedTabs) {
      obj[tabId] = url;
    }
    await chrome.storage.session.set({ trackedTabsData: obj });
  }

  // Pin tabs to groups (when a bookmark is removed but the tab stays open)
  // Maps tabId → groupId — persisted to storage so it survives extension reloads
  let pinnedTabGroups = new Map();
  let pinnedTabsLoadPromise = null;

  async function loadPinnedTabs() {
    if (!pinnedTabsLoadPromise) {
      pinnedTabsLoadPromise = storage.getPinnedTabs().then(stored => {
        // stored is { "tabId": "groupId", ... } with string keys
        for (const [tabId, groupId] of Object.entries(stored)) {
          pinnedTabGroups.set(Number(tabId), groupId);
        }
      });
    }
    return pinnedTabsLoadPromise;
  }

  function resetPinnedTabs() {
    pinnedTabGroups = new Map();
    pinnedTabsLoadPromise = null;
  }

  async function savePinnedTabs() {
    const obj = {};
    for (const [tabId, groupId] of pinnedTabGroups) {
      obj[tabId] = groupId;
    }
    await storage.setPinnedTabs(obj);
  }

  // Track specific bookmark → tab associations (for duplicate URLs)
  // Maps bookmarkId → tabId — persisted to session storage
  let trackedBookmarkTabs = new Map();

  async function loadTrackedBookmarkTabs() {
    const { trackedBookmarkTabsData } = await chrome.storage.session.get('trackedBookmarkTabsData');
    if (trackedBookmarkTabsData) {
      for (const [bookmarkId, tabId] of Object.entries(trackedBookmarkTabsData)) {
        trackedBookmarkTabs.set(bookmarkId, Number(tabId));
      }
    }
  }

  async function saveTrackedBookmarkTabs() {
    const obj = {};
    for (const [bookmarkId, tabId] of trackedBookmarkTabs) {
      obj[bookmarkId] = tabId;
    }
    await chrome.storage.session.set({ trackedBookmarkTabsData: obj });
  }

  /**
   * Register a tab that was opened from a bookmark.
   * This allows matching even after the tab URL changes due to redirects.
   */
  async function trackTab(tabId, bookmarkUrl, bookmarkId = null) {
    trackedTabs.set(tabId, bookmarkUrl);
    await saveTrackedTabs();
    if (bookmarkId) {
      trackedBookmarkTabs.set(bookmarkId, tabId);
      await saveTrackedBookmarkTabs();
    }
  }

  /**
   * Pin a tab to a group (e.g., when its bookmark is removed but the tab stays open).
   * The tab will appear as a floating tab in that group until closed.
   */
  async function pinTabToGroup(tabId, groupId) {
    pinnedTabGroups.set(tabId, groupId);
    await savePinnedTabs();
  }

  /**
   * Recompute full state by merging stored bookmarks with current tabs.
   */
  async function computeState() {
    await Promise.all([loadPinnedTabs(), loadTrackedTabs(), loadTrackedBookmarkTabs()]);

    const [bookmarks, groups, preferences, tabs, allWindows] = await Promise.all([
      storage.getBookmarks(),
      storage.getGroups(),
      storage.getPreferences(),
      chrome.tabs.query({}),
      chrome.windows.getAll(),
    ]);

    // Build window metadata — only normal browser windows, sorted by ID for stable labels
    const normalWindows = allWindows
      .filter(w => w.type === 'normal')
      .sort((a, b) => a.id - b.id);
    const windows = normalWindows.map((w, i) => ({ id: w.id, label: `Window ${i + 1}` }));

    // Clean up tracked/pinned tabs that no longer exist
    const currentTabIds = new Set(tabs.map(t => t.id));
    let trackedChanged = false;
    for (const tabId of trackedTabs.keys()) {
      if (!currentTabIds.has(tabId)) {
        trackedTabs.delete(tabId);
        trackedChanged = true;
      }
    }
    if (trackedChanged) await saveTrackedTabs();

    // Clean up bookmark→tab associations where the tab no longer exists
    let bookmarkTabsChanged = false;
    for (const [bookmarkId, tabId] of trackedBookmarkTabs) {
      if (!currentTabIds.has(tabId)) {
        trackedBookmarkTabs.delete(bookmarkId);
        bookmarkTabsChanged = true;
      }
    }
    if (bookmarkTabsChanged) await saveTrackedBookmarkTabs();

    let pinnedChanged = false;
    for (const tabId of pinnedTabGroups.keys()) {
      if (!currentTabIds.has(tabId)) {
        pinnedTabGroups.delete(tabId);
        pinnedChanged = true;
      }
    }
    if (pinnedChanged) {
      await savePinnedTabs();
    }

    const { bookmarks: enrichedBookmarks, unbookmarkedTabs, floatingTabsByGroup } =
      matchTabsToBookmarks(bookmarks, tabs, trackedTabs, pinnedTabGroups, trackedBookmarkTabs);

    // Find the active tab in the last-focused window
    let currentActiveTab = null;
    try {
      const [focusedTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      currentActiveTab = focusedTab || null;
    } catch {
      // Fallback: most recently accessed active tab
      const activeTabs = tabs.filter(t => t.active);
      currentActiveTab = activeTabs.length > 0
        ? activeTabs.reduce((a, b) => (b.lastAccessed || 0) > (a.lastAccessed || 0) ? b : a)
        : null;
    }

    cachedState = {
      bookmarks: enrichedBookmarks,
      groups,
      unbookmarkedTabs,
      floatingTabsByGroup,
      preferences,
      activeTabId: currentActiveTab?.id ?? null,
      windows,
    };

    return cachedState;
  }

  /**
   * Recompute and broadcast state to all extension pages.
   */
  async function broadcastState() {
    const state = await computeState();

    // Send to all connected extension pages (side panel, popup)
    // Wrapped in try-catch because sendMessage throws if no listeners
    try {
      await chrome.runtime.sendMessage({
        type: 'state-updated',
        payload: state,
      });
    } catch {
      // Expected when no UI pages are open ("Could not establish connection")
    }

    return state;
  }

  /**
   * Get current state (recomputes if not cached).
   */
  async function getState() {
    if (!cachedState) {
      return computeState();
    }
    return cachedState;
  }

  /**
   * Invalidate cache and rebroadcast.
   * Call this after any storage mutation.
   */
  async function invalidateAndBroadcast() {
    cachedState = null;
    return broadcastState();
  }

  return {
    getState,
    broadcastState,
    invalidateAndBroadcast,
    trackTab,
    pinTabToGroup,
    resetPinnedTabs,
  };
}
