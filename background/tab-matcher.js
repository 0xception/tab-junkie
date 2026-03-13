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
 * Walk a tab's openerTabId chain to find a group assignment.
 * Returns the groupId if an ancestor is a matched bookmark tab or already-resolved floating tab.
 *
 * @param {object} tab - The tab to resolve
 * @param {Map} tabsById - Map of tabId → tab object
 * @param {Map} matchedTabToGroup - Map of tabId → groupId for bookmark-matched tabs
 * @param {Map} resolved - Memoization map of tabId → groupId|null
 * @param {number} [maxDepth=5] - Maximum hops to walk
 * @returns {string|null} groupId or null
 */
export function resolveTabGroup(tab, tabsById, matchedTabToGroup, resolved, maxDepth = 5) {
  if (resolved.has(tab.id)) return resolved.get(tab.id);

  let current = tab;
  const visited = [];

  for (let depth = 0; depth < maxDepth; depth++) {
    const openerId = current.openerTabId;
    if (openerId == null) break;

    // Check memo first
    if (resolved.has(openerId)) {
      const groupId = resolved.get(openerId);
      // Memoize all visited tabs along the way
      for (const visitedId of visited) resolved.set(visitedId, groupId);
      resolved.set(tab.id, groupId);
      return groupId;
    }

    // Check if opener is a matched bookmark tab
    if (matchedTabToGroup.has(openerId)) {
      const groupId = matchedTabToGroup.get(openerId);
      for (const visitedId of visited) resolved.set(visitedId, groupId);
      resolved.set(tab.id, groupId);
      return groupId;
    }

    // Move up the chain
    const opener = tabsById.get(openerId);
    if (!opener) break;

    visited.push(openerId);
    current = opener;
  }

  resolved.set(tab.id, null);
  return null;
}

/**
 * Match open tabs against stored bookmarks.
 * Returns enriched bookmarks, unbookmarked orphan tabs, and floating tabs grouped by parent bookmark's group.
 *
 * @param {Array} bookmarks - Stored bookmarks
 * @param {Array} tabs - Open browser tabs
 * @param {Map} [trackedTabs] - Map of tabId → bookmark URL for tabs opened via extension (survives redirects)
 * @param {Map} [pinnedTabGroups] - Map of tabId → groupId for tabs pinned to groups (e.g., after bookmark removal)
 */
export function matchTabsToBookmarks(bookmarks, tabs, trackedTabs = new Map(), pinnedTabGroups = new Map()) {
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

  // Build matchedTabToGroup: tabId → groupId for bookmark-matched tabs
  const matchedTabToGroup = new Map();
  for (const bookmark of enrichedBookmarks) {
    if (bookmark.isOpen && bookmark.tabId != null && bookmark.groupId != null) {
      matchedTabToGroup.set(bookmark.tabId, bookmark.groupId);
    }
  }

  // Resolve floating tabs via opener chain
  const resolved = new Map();
  const floatingTabsByGroup = {};
  const unbookmarkedTabs = [];

  for (const tab of tabs) {
    if (matchedTabIds.has(tab.id)) continue;

    const groupId = resolveTabGroup(tab, tabsById, matchedTabToGroup, resolved)
      ?? pinnedTabGroups.get(tab.id)
      ?? null;
    if (groupId != null) {
      if (!floatingTabsByGroup[groupId]) floatingTabsByGroup[groupId] = [];
      floatingTabsByGroup[groupId].push(tab);
    } else {
      unbookmarkedTabs.push(tab);
    }
  }

  // Sort each group's floating tabs by tab.index
  for (const groupId of Object.keys(floatingTabsByGroup)) {
    floatingTabsByGroup[groupId].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }

  return { bookmarks: enrichedBookmarks, unbookmarkedTabs, floatingTabsByGroup };
}
