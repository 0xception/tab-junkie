/**
 * Normalize a URL for comparison:
 * - Strip trailing slashes (path only, not fragment/query)
 * - Normalize http → https
 *
 * Fragments (#...) are PRESERVED because many SPAs (AWS Console, etc.)
 * use fragment-based routing where the fragment IS the page identity.
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

  // Strip trailing slashes from the path (but preserve query/fragment)
  try {
    const u = new URL(normalized);
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    normalized = u.toString();
  } catch {
    // If URL parsing fails, just do basic trailing slash removal
    normalized = normalized.replace(/\/+$/, '');
  }

  return normalized;
}

/**
 * Match open tabs against stored bookmarks.
 * Returns enriched bookmarks (with isOpen/tabId) and unbookmarked tabs.
 *
 * @param {Array} bookmarks - Stored bookmarks
 * @param {Array} tabs - Open browser tabs
 * @param {Map} [trackedTabs] - Map of tabId → bookmark URL for tabs opened via extension (survives redirects)
 */
export function matchTabsToBookmarks(bookmarks, tabs, trackedTabs = new Map()) {
  // Build a map of normalized URL → tab for quick lookup
  const tabsByUrl = new Map();
  for (const tab of tabs) {
    const url = tab.pendingUrl || tab.url;
    const normalized = normalizeUrl(url);
    if (normalized && !tabsByUrl.has(normalized)) {
      tabsByUrl.set(normalized, tab);
    }
  }

  // Build reverse lookup from tracked tabs (handles redirects)
  // Maps normalized bookmark URL → tab, using the ORIGINAL bookmark URL
  const tabsById = new Map(tabs.map(t => [t.id, t]));
  for (const [tabId, bookmarkUrl] of trackedTabs) {
    const normalized = normalizeUrl(bookmarkUrl);
    const tab = tabsById.get(tabId);
    if (tab && normalized && !tabsByUrl.has(normalized)) {
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
