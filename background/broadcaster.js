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

  /**
   * Register a tab that was opened from a bookmark.
   * This allows matching even after the tab URL changes due to redirects.
   */
  function trackTab(tabId, bookmarkUrl) {
    trackedTabs.set(tabId, bookmarkUrl);
  }

  /**
   * Recompute full state by merging stored bookmarks with current tabs.
   */
  async function computeState() {
    const [bookmarks, groups, preferences, tabs] = await Promise.all([
      storage.getBookmarks(),
      storage.getGroups(),
      storage.getPreferences(),
      chrome.tabs.query({}),
    ]);

    // Clean up tracked tabs that no longer exist
    const currentTabIds = new Set(tabs.map(t => t.id));
    for (const tabId of trackedTabs.keys()) {
      if (!currentTabIds.has(tabId)) {
        trackedTabs.delete(tabId);
      }
    }

    const { bookmarks: enrichedBookmarks, unbookmarkedTabs } =
      matchTabsToBookmarks(bookmarks, tabs, trackedTabs);

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
  };
}
