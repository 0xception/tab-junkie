// background/broadcaster.js
import { matchTabsToBookmarks } from './tab-matcher.js';

/**
 * State Broadcaster.
 * Merges bookmarks + open tabs into unified state and broadcasts to UIs.
 */
export function createBroadcaster(chrome, storage) {
  let cachedState = null;

  // Track tabs we opened from bookmarks (survives redirects)
  // Maps tabId → normalized bookmark URL
  const trackedTabs = new Map();

  // Pin tabs to groups (when a bookmark is removed but the tab stays open)
  // Maps tabId → groupId — persisted to storage so it survives extension reloads
  let pinnedTabGroups = new Map();
  let pinnedTabsLoaded = false;

  async function loadPinnedTabs() {
    if (pinnedTabsLoaded) return;
    const stored = await storage.getPinnedTabs();
    // stored is { "tabId": "groupId", ... } with string keys
    for (const [tabId, groupId] of Object.entries(stored)) {
      pinnedTabGroups.set(Number(tabId), groupId);
    }
    pinnedTabsLoaded = true;
  }

  async function savePinnedTabs() {
    const obj = {};
    for (const [tabId, groupId] of pinnedTabGroups) {
      obj[tabId] = groupId;
    }
    await storage.setPinnedTabs(obj);
  }

  /**
   * Register a tab that was opened from a bookmark.
   * This allows matching even after the tab URL changes due to redirects.
   */
  function trackTab(tabId, bookmarkUrl) {
    trackedTabs.set(tabId, bookmarkUrl);
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
    await loadPinnedTabs();

    const [bookmarks, groups, preferences, tabs] = await Promise.all([
      storage.getBookmarks(),
      storage.getGroups(),
      storage.getPreferences(),
      chrome.tabs.query({}),
    ]);

    // Clean up tracked/pinned tabs that no longer exist
    const currentTabIds = new Set(tabs.map(t => t.id));
    for (const tabId of trackedTabs.keys()) {
      if (!currentTabIds.has(tabId)) {
        trackedTabs.delete(tabId);
      }
    }
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
      matchTabsToBookmarks(bookmarks, tabs, trackedTabs, pinnedTabGroups);

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
      // No listeners connected — that's fine
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
  };
}
