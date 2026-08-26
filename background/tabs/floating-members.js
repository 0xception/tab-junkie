/**
 * Floating-member runtime resolver — B-121 §60.3.
 *
 * Builds the `floatingMembers` map carried by every MSG_LIST_ITEMS
 * response. The map keys parent bookmark groupIds (or the `'__toplevel__'`
 * sentinel for top-level / ungrouped parents — B-197 §79.4.2) to arrays of
 * synthetic-row descriptors for live tabs that have a tj:floatingGroups
 * record but are NOT yet promoted to a saved item.
 *
 * No storage writes; no broadcast. Pure read-then-shape over:
 *   - tj:floatingGroups (cold-start storage)
 *   - LiveTabIndex (in-memory, ephemeral)
 *   - claimsMirror (in-memory, ephemeral)
 *
 * Performance budget: O(N_records × N_liveTabs). Both are bounded in
 * practice (≤ 5 records, ≤ 50 tabs typical) so the cost is negligible
 * against the 50 ms search-latency budget (B-052 AC3).
 */

import { readPartition, PARTITION_FLOATING_GROUPS } from '../storage/partitions.js';
import { getLiveTabIndex } from './live-tab-index.js';
import { getClaimedTabIds } from './tab-claims.js';
import { getParentItemId } from './floating-groups.js';
import { resolveRecordToTab } from './tab-item-resolver.js';
import { liveTabDescriptor } from './live-tab-descriptor.js';

/**
 * @typedef {Object} FloatingMember
 * @property {number} tabId
 * @property {number} windowId
 * @property {number} tabIndex
 * @property {string} url
 * @property {string} parentItemId
 * @property {string} title
 * @property {string|null} favIconUrl
 * @property {boolean} audible
 * @property {boolean} active
 * @property {number} [sortOrder]   B-134 §63.8.4 — explicit per-bucket
 *   sort key. OPTIONAL on the typedef so legacy v2 records lacking the
 *   field continue to work; the renderer reads either value.
 * @property {string} [floatingTabId]   B-148 §3.7 — storage identity (ulid)
 *   propagated from the source record so the renderer can stamp
 *   data-floating-tab-id on the row + the drag-cache can build
 *   'floating:<id>' refs for the new mixed-type renderOrder payload.
 *   OPTIONAL on the typedef so pre-S38 legacy records (lacking the field)
 *   flow through without it.
 */

/**
 * Build the per-group map of floating-tab descriptors.
 *
 * @param {Array<{id: string, groupId: string|null}>} items
 * @returns {Promise<Record<string, FloatingMember[]>>}
 */
export async function buildFloatingMembers(items) {
  /** @type {Record<string, FloatingMember[]>} */
  const out = {};

  let records;
  try {
    records = await readPartition(PARTITION_FLOATING_GROUPS);
  } catch {
    /* Read errors are non-fatal — return empty so MSG_LIST_ITEMS still
       succeeds. The next dispatch will retry. */
    return out;
  }
  if (!Array.isArray(records) || records.length === 0) return out;

  const liveIndex = getLiveTabIndex();
  if (liveIndex.size === 0) return out;

  const claimedTabIds = getClaimedTabIds();

  // itemId → item map for parent lookup
  const itemsById = new Map();
  for (const it of items) {
    if (it && typeof it.id === 'string') itemsById.set(it.id, it);
  }

  /* B-121 R4 H-2 (code-reviewer): dedupe by matchedTabId so a single live
     tab cannot surface twice under the same parent group when two
     `tj:floatingGroups` records (e.g., a legacy v1 record + a new v2 record
     for the same parent/tab) both resolve to it. The first match wins;
     subsequent records targeting the same tabId are skipped. */
  const matchedTabIds = new Set();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    const parentItemId = getParentItemId(record);
    if (!parentItemId) continue;

    const parent = itemsById.get(parentItemId);
    if (!parent) continue; // parent deleted — skip (AC8(ii))
    /* B-197 §79.4.2 — a floating record whose parent is a TOP-LEVEL (ungrouped)
       bookmark (`parent.groupId === null`) is no longer skipped. It emits under
       the `'__toplevel__'` sentinel key; grouped parents key under
       `parent.groupId` exactly as before (AC19). The sentinel never collides
       with a real groupId (ULIDs). */
    const outKey = (typeof parent.groupId === 'string' && parent.groupId.length > 0)
      ? parent.groupId
      : '__toplevel__';

    /* B-137 §66.6 — 3-tier join (a: direct liveTabId · b: position · c: URL),
       now via the shared resolver (B-175 §74). No URL-corroboration on the
       position tier (legacy verbatim parity; §66.9.2 Option B — the lifecycle
       guarantees + cold-start lazy rewrite + the H-2 dedup gate already make
       stale-liveTabId misjoins effectively impossible). `excludeClaimedTabIds`
       makes a record resolving to an already-claimed tab report as no-match:
       that record is stale (it will be pruned next cold start) so it is not a
       floating member. */
    const matchedTabId = resolveRecordToTab(record, liveIndex, {
      excludeClaimedTabIds: claimedTabIds,
    });
    if (matchedTabId === null) continue;

    /* H-2 dedup gate — drop the second-or-later record that resolved to a
       tabId we already emitted this build. */
    if (matchedTabIds.has(matchedTabId)) continue;
    matchedTabIds.add(matchedTabId);

    const liveEntry = liveIndex.get(matchedTabId);
    if (!liveEntry) continue;

    /* B-189 §77.6.2 — the eight common live-tab fields come from the shared
       LiveTabDescriptor base (identical projection to buildOpenTabs); the
       floating descriptor EXTENDS it with parentItemId here (+ optional
       sortOrder / floatingTabId below). Only the projection is shared — the
       resolve/sort/exclusion logic stays floating-specific per §77.6.1. */
    const descriptor = liveTabDescriptor(matchedTabId, liveEntry);
    descriptor.parentItemId = parentItemId;
    /* B-134 §63.8.4 — propagate explicit sortOrder when the source record
       carries one (v3+). Legacy v2 records (no sortOrder) flow through
       without the field; the comparator below handles both shapes. */
    if (typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)) {
      descriptor.sortOrder = record.sortOrder;
    }
    /* B-148 §3.7 / §3.8 D-1 (S44, v6→v7) — propagate floatingTabId so the
       sidepanel can stamp data-floating-tab-id on the rendered row. The
       drag-rect-cache uses this to construct a 'floating:<floatingTabId>'
       ref in the new mixed-type renderOrder payload. Pre-S38 legacy records
       lacking floatingTabId flow through without the field; the renderer
       degrades to the legacy orderedTabIds dispatch path. */
    if (typeof record.floatingTabId === 'string' && record.floatingTabId.length > 0) {
      descriptor.floatingTabId = record.floatingTabId;
    }

    if (!out[outKey]) out[outKey] = [];
    out[outKey].push(descriptor);
  }

  /* B-134 §63.8.4 — sort each group's members by `sortOrder` (ascending)
     when present, falling back to `(windowId, tabIndex)` for legacy v2
     records. Records carrying explicit sortOrder are authoritative; legacy
     records sort identically to v2 behavior (no visual regression). */
  for (const arr of Object.values(out)) {
    arr.sort((a, b) => {
      const aHasSO = typeof a.sortOrder === 'number';
      const bHasSO = typeof b.sortOrder === 'number';
      if (aHasSO && bHasSO) return a.sortOrder - b.sortOrder;
      if (aHasSO) return -1;
      if (bHasSO) return 1;
      // Legacy fallback (matches today's behavior — AC9 parity with buildOpenTabs).
      if (a.windowId !== b.windowId) return a.windowId - b.windowId;
      return a.tabIndex - b.tabIndex;
    });
  }

  return out;
}

/**
 * Build a `Set<number>` of all tabIds that resolved to floating-member
 * descriptors. Passed to buildOpenTabs so floating-tab rows are excluded
 * from the Open Tabs section (AC5).
 *
 * @param {Record<string, FloatingMember[]>} floatingMembers
 * @returns {Set<number>}
 */
export function collectFloatingTabIds(floatingMembers) {
  const ids = new Set();
  for (const arr of Object.values(floatingMembers || {})) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (m && typeof m.tabId === 'number') ids.add(m.tabId);
    }
  }
  return ids;
}
