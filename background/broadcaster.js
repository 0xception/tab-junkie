// background/broadcaster.js
import { matchTabsToBookmarks } from './tab-matcher.js';

/**
 * State Broadcaster.
 * Merges bookmarks + open tabs into unified state and broadcasts to UIs.
 */
export function createBroadcaster(chrome, storage) {
  let cachedState = null;

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

    const { bookmarks: enrichedBookmarks, unbookmarkedTabs } =
      matchTabsToBookmarks(bookmarks, tabs);

    cachedState = {
      bookmarks: enrichedBookmarks,
      groups,
      unbookmarkedTabs,
      preferences,
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
  };
}
