// background/broadcaster.js
import { matchTabsToBookmarks } from './tab-matcher.js';

/**
 * State Broadcaster.
 * Merges bookmarks + open tabs into unified state and broadcasts to UIs.
 */
export function createBroadcaster(chrome, storage) {
  let cachedState = null;

  // Track tabs we opened from bookmarks (survives redirects)
  // Maps tabId → bookmark URL — persisted to local storage so it survives extension reloads
  let trackedTabs = new Map();
  let trackedTabsLoaded = false;

  async function loadTrackedTabs() {
    if (trackedTabsLoaded) return;
    trackedTabsLoaded = true;
    const stored = await storage.getTrackedTabs();
    for (const [tabId, url] of Object.entries(stored)) {
      trackedTabs.set(Number(tabId), url);
    }
  }

  async function saveTrackedTabs() {
    const obj = {};
    for (const [tabId, url] of trackedTabs) {
      obj[tabId] = url;
    }
    await storage.setTrackedTabs(obj);
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
  // Maps bookmarkId → { tabId, lastTabUrl } — persisted to local storage
  // lastTabUrl stores the tab's current URL so we can re-match after browser restart
  let trackedBookmarkTabs = new Map();
  let trackedBookmarkTabsLoaded = false;

  async function loadTrackedBookmarkTabs() {
    if (trackedBookmarkTabsLoaded) return;
    trackedBookmarkTabsLoaded = true;
    const stored = await storage.getTrackedBookmarkTabs();
    for (const [bookmarkId, value] of Object.entries(stored)) {
      // Support both old format (plain tabId number) and new format ({ tabId, lastTabUrl })
      if (typeof value === 'number') {
        trackedBookmarkTabs.set(bookmarkId, { tabId: value, lastTabUrl: null });
      } else {
        trackedBookmarkTabs.set(bookmarkId, { tabId: Number(value.tabId), lastTabUrl: value.lastTabUrl || null });
      }
    }
  }

  async function saveTrackedBookmarkTabs() {
    const obj = {};
    for (const [bookmarkId, entry] of trackedBookmarkTabs) {
      obj[bookmarkId] = entry;
    }
    await storage.setTrackedBookmarkTabs(obj);
  }

  /**
   * No-op — tracking is preserved through navigation so that tab-matcher can
   * detect drift (bookmark tab navigated away from its original URL) and display
   * it correctly instead of orphaning the tab into the unbookmarked/open tabs section.
   * Stale tracking for closed tabs is cleaned up in computeState().
   */
  function cleanupTrackingIfNeeded(_tabId, _newUrl) {}

  // markTabLoaded is no longer needed since cleanupTrackingIfNeeded is a no-op.
  function markTabLoaded(_tabId) {}

  /**
   * Register a tab that was opened from a bookmark.
   * This allows matching even after the tab URL changes due to redirects.
   */
  async function trackTab(tabId, bookmarkUrl, bookmarkId = null) {
    trackedTabs.set(tabId, bookmarkUrl);
    await saveTrackedTabs();
    if (bookmarkId) {
      trackedBookmarkTabs.set(bookmarkId, { tabId, lastTabUrl: bookmarkUrl });
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
    const tabsByUrl = new Map();
    for (const t of tabs) {
      const url = t.pendingUrl || t.url;
      if (url && !tabsByUrl.has(url)) tabsByUrl.set(url, t);
    }

    let trackedChanged = false;
    for (const tabId of trackedTabs.keys()) {
      if (!currentTabIds.has(tabId)) {
        trackedTabs.delete(tabId);
        trackedChanged = true;
      }
    }
    if (trackedChanged) await saveTrackedTabs();

    // Clean up bookmark→tab associations where the tab no longer exists.
    // If a tracked tab is gone (browser restart), try to re-match by lastTabUrl.
    const bookmarkUrlById = new Map(bookmarks.map(b => [b.id, b.url]));
    let bookmarkTabsChanged = false;
    for (const [bookmarkId, entry] of trackedBookmarkTabs) {
      if (!currentTabIds.has(entry.tabId)) {
        const rematch = entry.lastTabUrl ? tabsByUrl.get(entry.lastTabUrl) : null;
        if (rematch && !trackedTabs.has(rematch.id)) {
          // Re-link to the tab that still has the same URL
          trackedBookmarkTabs.set(bookmarkId, { tabId: rematch.id, lastTabUrl: entry.lastTabUrl });
          // trackedTabs needs the original bookmark URL (not the drifted URL)
          trackedTabs.set(rematch.id, bookmarkUrlById.get(bookmarkId) || entry.lastTabUrl);
        } else {
          trackedBookmarkTabs.delete(bookmarkId);
        }
        bookmarkTabsChanged = true;
      }
    }
    if (bookmarkTabsChanged) {
      await saveTrackedBookmarkTabs();
      await saveTrackedTabs();
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

    // Build simple bookmarkId → tabId map for matchTabsToBookmarks
    const bookmarkTabIds = new Map();
    for (const [bookmarkId, entry] of trackedBookmarkTabs) {
      bookmarkTabIds.set(bookmarkId, entry.tabId);
    }

    const { bookmarks: enrichedBookmarks, unbookmarkedTabs, floatingTabsByGroup } =
      matchTabsToBookmarks(bookmarks, tabs, trackedTabs, pinnedTabGroups, bookmarkTabIds);

    // Promote URL-matched tabs into persistent tracking so drift detection
    // works even for tabs that weren't opened via Tab Junkie's click handler.
    // Also update lastTabUrl for drifted tabs so we can re-match after restart.
    const tabsById = new Map(tabs.map(t => [t.id, t]));
    let trackingUpdated = false;
    for (const bm of enrichedBookmarks) {
      if (!bm.isOpen || bm.tabId == null) continue;

      if (!trackedBookmarkTabs.has(bm.id)) {
        // New URL-matched tab — promote to persistent tracking
        trackedBookmarkTabs.set(bm.id, { tabId: bm.tabId, lastTabUrl: bm.url });
        trackedTabs.set(bm.tabId, bm.url);
        trackingUpdated = true;
      } else {
        // Existing tracked tab — update lastTabUrl if the tab has navigated
        const entry = trackedBookmarkTabs.get(bm.id);
        const tab = tabsById.get(bm.tabId);
        const currentUrl = tab?.pendingUrl || tab?.url;
        if (currentUrl && entry.lastTabUrl !== currentUrl) {
          entry.lastTabUrl = currentUrl;
          trackingUpdated = true;
        }
      }
    }
    if (trackingUpdated) {
      await saveTrackedBookmarkTabs();
      await saveTrackedTabs();
    }

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
    markTabLoaded,
    cleanupTrackingIfNeeded,
  };
}
