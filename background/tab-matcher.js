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
 * @param {Map} [pinnedTabGroups] - Map of tabId → groupId for pinned floating tabs
 * @returns {string|null} groupId or null
 */
export function resolveTabGroup(tab, tabsById, matchedTabToGroup, resolved, maxDepth = 5, pinnedTabGroups = new Map()) {
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

    // Check if opener is a pinned floating tab (e.g., bookmark was removed but tab stayed)
    if (pinnedTabGroups.has(openerId)) {
      const groupId = pinnedTabGroups.get(openerId);
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
 * @param {Map} [trackedBookmarkTabs] - Map of bookmarkId → tabId for explicit bookmark-to-tab associations (duplicate URLs)
 */
export function matchTabsToBookmarks(bookmarks, tabs, trackedTabs = new Map(), pinnedTabGroups = new Map(), trackedBookmarkTabs = new Map()) {
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
  // First pass: resolve explicit bookmark→tab associations (for duplicate URLs)
  const enrichedBookmarks = bookmarks.map(bookmark => {
    // Check if this specific bookmark has a tracked tab
    const trackedTabId = trackedBookmarkTabs.get(bookmark.id);
    if (trackedTabId != null && tabsById.has(trackedTabId) && !matchedTabIds.has(trackedTabId)) {
      const tab = tabsById.get(trackedTabId);
      const isDrifted = normalizeUrl(bookmark.url) !== normalizeUrl(tab.pendingUrl || tab.url);

      // If the tracked tab has drifted (user navigated it away), check if there's
      // a better match by URL. This prevents duplicates: the bookmark matches the
      // correct tab, and the drifted tab shows as unbookmarked (which it now is).
      if (isDrifted) {
        const normalized = normalizeUrl(bookmark.url);
        const urlMatch = tabsByUrl.get(normalized);
        // Only use the URL match if it's a DIFFERENT tab — the trackedTabs reverse
        // lookup can map the bookmark URL back to the same drifted tab, which would
        // incorrectly suppress drift detection.
        if (urlMatch && urlMatch.id !== trackedTabId && !matchedTabIds.has(urlMatch.id)) {
          matchedTabIds.add(urlMatch.id);
          return { ...bookmark, isOpen: true, isDrifted: false, tabId: urlMatch.id, tabLastAccessed: urlMatch.lastAccessed || 0, windowId: urlMatch.windowId, audible: !!urlMatch.audible };
        }
      }

      matchedTabIds.add(trackedTabId);
      return { ...bookmark, isOpen: true, isDrifted, tabId: trackedTabId, tabLastAccessed: tab.lastAccessed || 0, windowId: tab.windowId, audible: !!tab.audible };
    }

    // Fall back to URL-based matching
    const normalized = normalizeUrl(bookmark.url);
    const matchingTab = tabsByUrl.get(normalized);

    if (matchingTab && !matchedTabIds.has(matchingTab.id)) {
      matchedTabIds.add(matchingTab.id);
      return { ...bookmark, isOpen: true, isDrifted: false, tabId: matchingTab.id, tabLastAccessed: matchingTab.lastAccessed || 0, windowId: matchingTab.windowId, audible: !!matchingTab.audible };
    }

    return { ...bookmark, isOpen: false, isDrifted: false, tabId: null };
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

    let groupId = resolveTabGroup(tab, tabsById, matchedTabToGroup, resolved, 5, pinnedTabGroups)
      ?? pinnedTabGroups.get(tab.id)
      ?? null;
    if (groupId != null) {
      // Update resolved map so future opener chain lookups find this tab's group
      resolved.set(tab.id, groupId);
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
