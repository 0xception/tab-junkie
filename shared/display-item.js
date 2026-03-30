// shared/display-item.js
// Centralized factory functions for creating display items from bookmarks and tabs.
// Eliminates ad-hoc construction scattered across 10+ UI locations.

/**
 * Compute window label for multi-window badge display.
 * Returns label string (e.g. "2") if the item is in a different window, null otherwise.
 */
function computeWindowLabel(windowId, windowLabelMap, myWindowId) {
  if (!windowLabelMap || windowLabelMap.size === 0) return null;
  if (!windowId || windowId === myWindowId) return null;
  return windowLabelMap.get(windowId) || null;
}

/**
 * Create a display item from an enriched bookmark (after matchTabsToBookmarks).
 * Used in render.js for grouped and ungrouped bookmark rendering.
 */
export function fromEnrichedBookmark(bookmark, { activeTabId, windowLabelMap, myWindowId } = {}) {
  return {
    ...bookmark,
    type: 'bookmark',
    isBookmarked: true,
    isActive: bookmark.tabId === activeTabId,
    windowLabel: computeWindowLabel(bookmark.windowId, windowLabelMap, myWindowId),
  };
}

/**
 * Create a display item from a raw Chrome tab that's floating in a group.
 * Used in render.js for floating tab rendering within groups.
 */
export function fromFloatingTab(tab, { activeTabId, windowLabelMap, myWindowId } = {}) {
  return {
    id: `tab-${tab.id}`,
    type: 'floating-tab',
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || null,
    isOpen: true,
    tabId: tab.id,
    isBookmarked: false,
    isActive: tab.id === activeTabId,
    windowLabel: computeWindowLabel(tab.windowId, windowLabelMap, myWindowId),
  };
}

/**
 * Create a display item from a raw Chrome tab that's not bookmarked or floating.
 * Used in render.js for the "Open Tabs" section.
 */
export function fromUnbookmarkedTab(tab, { activeTabId, windowLabelMap, myWindowId } = {}) {
  return {
    id: `tab-${tab.id}`,
    type: 'unbookmarked-tab',
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || null,
    isOpen: true,
    tabId: tab.id,
    isBookmarked: false,
    isActive: tab.id === activeTabId,
    windowLabel: computeWindowLabel(tab.windowId, windowLabelMap, myWindowId),
  };
}

// --- Search item factories ---
// For Fuse.js indexes in popup, sidepanel filter, and newtab search.

/**
 * Create a search item from an enriched bookmark.
 */
export function searchItemFromBookmark(bookmark, { breadcrumb = '', recency } = {}) {
  const item = {
    type: 'bookmark',
    bookmarkId: bookmark.id,
    title: bookmark.title,
    url: bookmark.url,
    favicon: bookmark.favicon,
    isOpen: bookmark.isOpen,
    tabId: bookmark.tabId,
    breadcrumb,
  };
  if (recency !== undefined) item.recency = recency;
  return item;
}

/**
 * Create a search item from a raw Chrome tab (floating or unbookmarked).
 */
export function searchItemFromTab(tab, { breadcrumb = '', recency } = {}) {
  const item = {
    type: 'tab',
    title: tab.title || tab.url,
    url: tab.url,
    favicon: tab.favIconUrl || null,
    isOpen: true,
    tabId: tab.id,
    breadcrumb,
  };
  if (recency !== undefined) item.recency = recency;
  return item;
}

// --- Type guards ---

export function isTabItem(item) {
  return item.type === 'floating-tab' || item.type === 'unbookmarked-tab';
}

export function isBookmarkItem(item) {
  return item.type === 'bookmark';
}

/**
 * Extract tabId from a display item's string ID.
 * Returns the numeric tabId if the ID has the 'tab-' prefix, null otherwise.
 */
export function getTabIdFromItemId(itemId) {
  if (typeof itemId === 'string' && itemId.startsWith('tab-')) {
    return parseInt(itemId.substring(4), 10);
  }
  return null;
}
