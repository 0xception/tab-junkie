/**
 * Opener-chain group inheritance (B-013).
 *
 * Maintains an in-memory Map of tab opener relationships and provides a pure
 * walk function to find the nearest grouped ancestor within N hops.
 *
 * Ephemeral: the openerMap is lost on SW restart — consistent with Chrome's
 * own behavior (opener relationships are not persisted across restarts).
 */

/** @type {Map<number, number>} tabId -> openerTabId */
const openerMap = new Map();

/** H-3: cap openerMap to prevent unbounded growth over long sessions. */
const MAX_OPENER_MAP_ENTRIES = 512;

/**
 * Record an opener relationship for a tab.
 * @param {number} tabId
 * @param {number} openerTabId
 */
export function recordOpener(tabId, openerTabId) {
  if (openerMap.size >= MAX_OPENER_MAP_ENTRIES) return;
  openerMap.set(tabId, openerTabId);
}

/**
 * Remove a tab from the opener map.
 * @param {number} tabId
 */
export function pruneOpener(tabId) {
  openerMap.delete(tabId);
}

/**
 * Bulk-remove tabs from the opener map (e.g. when a window closes).
 * @param {number[]} tabIds
 */
export function pruneOpenersByWindow(tabIds) {
  for (const tabId of tabIds) {
    openerMap.delete(tabId);
  }
}

/**
 * Walk the opener chain starting from tabId's opener, looking for the nearest
 * grouped ancestor within maxHops.
 *
 * Pure function — reads from the openerMap and the provided claimsMirror/items
 * without side effects.
 *
 * @param {number} tabId — the newly created tab
 * @param {Record<string, number>} claimsMirror — itemId -> tabId
 * @param {Array<{id: string, groupId: string|null}>} items
 * @param {number} [maxHops=3]
 * @returns {{groupId: string, itemId: string}|null}
 */
export function walkOpenerChain(tabId, claimsMirror, items, maxHops = 3) {
  // H-1: guard against cycles in openerMap
  const visited = new Set([tabId]);
  let currentTabId = openerMap.get(tabId);
  let hops = 0;
  while (currentTabId !== undefined && hops < maxHops) {
    if (visited.has(currentTabId)) break;
    for (const [itemId, claimedTabId] of Object.entries(claimsMirror)) {
      if (claimedTabId === currentTabId) {
        const item = items.find((i) => i.id === itemId);
        if (item && item.groupId !== null) {
          return { groupId: item.groupId, itemId: item.id };
        }
      }
    }
    visited.add(currentTabId);
    currentTabId = openerMap.get(currentTabId);
    hops++;
  }
  return null;
}

/**
 * Resolve a FLOATING-member opener to its group + parent item.
 *
 * B-184: when a new tab is opened from a floating tab (a child previously
 * inherited under a bookmark), the opener is NOT in `claimsMirror` — floating
 * tabs are deliberately not claimed (B-125) — so `walkOpenerChain` misses it,
 * and the openerMap chain to the bookmark ancestor is ephemeral (wiped on MV3
 * SW restart). This resolves the opener DIRECTLY from the floating records by
 * `liveTabId`, so the new tab can re-inherit into the same group under the same
 * parent item — robust against the ephemeral openerMap for the common
 * single-hop case (open a link from a floating child).
 *
 * Returns the same `{groupId, itemId}` shape as `walkOpenerChain`. Requires a
 * non-empty groupId (floating-under-ungrouped support is B-184 Part 2).
 *
 * @param {number} openerTabId — the tab the new tab was opened from
 * @param {Array<{liveTabId?: number, groupId?: string, parentItemId?: string, itemId?: string}>} floatingRecords
 * @returns {{groupId: string, itemId: string}|null}
 */
export function resolveFloatingOpener(openerTabId, floatingRecords) {
  if (typeof openerTabId !== 'number' || !Array.isArray(floatingRecords)) return null;
  for (const r of floatingRecords) {
    if (!r || typeof r !== 'object' || r.liveTabId !== openerTabId) continue;
    // Tolerate the legacy itemId-only shape (pre-B-121) like getParentItemId.
    const parentItemId = (typeof r.parentItemId === 'string' && r.parentItemId.length > 0)
      ? r.parentItemId
      : r.itemId;
    if (typeof r.groupId === 'string' && r.groupId.length > 0
      && typeof parentItemId === 'string' && parentItemId.length > 0) {
      return { groupId: r.groupId, itemId: parentItemId };
    }
    return null; // matched the opener tab, but the record is unusable (e.g. ungrouped — Part 2)
  }
  return null;
}

/**
 * Test hatch: reset the opener map between tests.
 */
export function __resetOpenerMap() {
  openerMap.clear();
}
