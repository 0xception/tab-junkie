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
 * Test hatch: reset the opener map between tests.
 */
export function __resetOpenerMap() {
  openerMap.clear();
}
