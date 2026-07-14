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
 * @returns {{groupId: string|null, itemId: string}|null}
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
        if (item) {
          /* B-197 §79.4 (AC8) — a claimed ancestor now resolves whether or not
             it is grouped. An ungrouped ancestor (`groupId === null`) returns a
             top-level anchor `{ groupId: null, itemId }` so the new tab floats
             under that bookmark, instead of being skipped. Grouped ancestors
             resolve to their groupId exactly as before. */
          return { groupId: item.groupId ?? null, itemId: item.id };
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
 * Returns the same `{groupId, itemId}` shape as `walkOpenerChain`. B-197 §79.4:
 * a record whose parent is TOP-LEVEL (the record's own groupId is the
 * `'__toplevel__'` sentinel — §79.9) resolves to `{ groupId: null, itemId }`
 * (AC6), mirroring `walkOpenerChain`'s null-group result so the caller
 * re-inherits under the ungrouped parent. A genuinely empty/absent-groupId
 * record stays unusable → null.
 *
 * @param {number} openerTabId — the tab the new tab was opened from
 * @param {Array<{liveTabId?: number, groupId?: string, parentItemId?: string, itemId?: string}>} floatingRecords
 * @returns {{groupId: string|null, itemId: string}|null}
 */
export function resolveFloatingOpener(openerTabId, floatingRecords) {
  if (typeof openerTabId !== 'number' || !Array.isArray(floatingRecords)) return null;
  for (const r of floatingRecords) {
    if (!r || typeof r !== 'object' || r.liveTabId !== openerTabId) continue;
    // Tolerate the legacy itemId-only shape (pre-B-121) like getParentItemId.
    const parentItemId = (typeof r.parentItemId === 'string' && r.parentItemId.length > 0)
      ? r.parentItemId
      : r.itemId;
    if (typeof parentItemId !== 'string' || parentItemId.length === 0) return null;
    if (typeof r.groupId !== 'string' || r.groupId.length === 0) {
      return null; // matched the opener tab, but the record's groupId is empty/absent — unusable
    }
    /* B-197 AC6 — map the top-level sentinel back to a null-group anchor; a
       named-group record returns its groupId verbatim (unchanged). */
    const groupId = r.groupId === '__toplevel__' ? null : r.groupId;
    return { groupId, itemId: parentItemId };
  }
  return null;
}

/**
 * Test hatch: reset the opener map between tests.
 */
export function __resetOpenerMap() {
  openerMap.clear();
}
