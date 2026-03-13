/**
 * Normalize a URL for comparison:
 * - Strip trailing slashes
 * - Remove fragments (#...)
 * - Normalize http → https
 */
export function normalizeUrl(url) {
  if (!url) return '';

  let normalized = url;

  // Add protocol if missing
  if (!normalized.includes('://')) {
    normalized = 'https://' + normalized;
  }

  // Normalize http to https
  normalized = normalized.replace(/^http:\/\//, 'https://');

  // Remove fragment
  const hashIndex = normalized.indexOf('#');
  if (hashIndex !== -1) {
    normalized = normalized.substring(0, hashIndex);
  }

  // Strip trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

/**
 * Match open tabs against stored bookmarks.
 * Returns enriched bookmarks (with isOpen/tabId) and unbookmarked tabs.
 */
export function matchTabsToBookmarks(bookmarks, tabs) {
  // Build a map of normalized URL → tab for quick lookup
  const tabsByUrl = new Map();
  for (const tab of tabs) {
    const normalized = normalizeUrl(tab.url);
    if (normalized && !tabsByUrl.has(normalized)) {
      tabsByUrl.set(normalized, tab);
    }
  }

  // Track which tabs got matched
  const matchedTabIds = new Set();

  // Enrich bookmarks with open/closed status
  const enrichedBookmarks = bookmarks.map(bookmark => {
    const normalized = normalizeUrl(bookmark.url);
    const matchingTab = tabsByUrl.get(normalized);

    if (matchingTab && !matchedTabIds.has(matchingTab.id)) {
      matchedTabIds.add(matchingTab.id);
      return { ...bookmark, isOpen: true, tabId: matchingTab.id };
    }

    return { ...bookmark, isOpen: false, tabId: null };
  });

  // Collect unbookmarked tabs
  const unbookmarkedTabs = tabs.filter(tab => !matchedTabIds.has(tab.id));

  return { bookmarks: enrichedBookmarks, unbookmarkedTabs };
}
