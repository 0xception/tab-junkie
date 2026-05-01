/**
 * Floating-member runtime resolver — B-121 §60.3.
 *
 * Builds the `floatingMembers` map carried by every MSG_LIST_ITEMS
 * response. The map keys parent bookmark groupIds to arrays of
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

import { safeNormalizeForMatch } from '../../shared/url.js';
import { readPartition, PARTITION_FLOATING_GROUPS } from '../storage/partitions.js';
import { getLiveTabIndex } from './live-tab-index.js';
import { getClaimsMirror } from './tab-claims.js';
import { getParentItemId } from './floating-groups.js';

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

  const claimsMirror = getClaimsMirror();
  const claimedTabIds = new Set(Object.values(claimsMirror));

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
    if (typeof parent.groupId !== 'string' || parent.groupId.length === 0) continue;

    /* B-137 §66.6 — 3-tier join order:
       (a) DIRECT TABID MATCH — record.liveTabId is finite AND liveIndex.has it
       (b) POSITION MATCH     — (windowId, tabIndex) geometry (legacy fallback)
       (c) URL FALLBACK       — normalized URL match (legacy fallback)
       Tiers (b) + (c) preserve verbatim behavior for legacy v3 records. */
    let matchedTabId = null;

    // TIER (a) — DIRECT TABID MATCH (B-137)
    if (typeof record.liveTabId === 'number' && Number.isFinite(record.liveTabId)
      && liveIndex.has(record.liveTabId)) {
      /* §66.9.2 Option B (R2 LOCK + R3-VERIFY 1) — no URL-guard. The
         lifecycle guarantees (chrome.tabs.onRemoved drops stale ids from
         liveIndex) + cold-start lazy rewrite (§66.7) + the H-2 dedup gate
         below already make stale-liveTabId misjoins effectively impossible
         for realistic timing windows. */
      matchedTabId = record.liveTabId;
    }

    // TIER (b) — POSITION MATCH (legacy fallback)
    if (matchedTabId === null) {
      for (const [tabId, entry] of liveIndex) {
        if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
          matchedTabId = tabId;
          break;
        }
      }
    }
    // TIER (c) — URL FALLBACK (legacy fallback)
    if (matchedTabId === null) {
      const normalizedStored = safeNormalizeForMatch(record.url);
      if (normalizedStored) {
        for (const [tabId, entry] of liveIndex) {
          if (safeNormalizeForMatch(entry.url) === normalizedStored) {
            matchedTabId = tabId;
            break;
          }
        }
      }
    }
    if (matchedTabId === null) continue;

    // Skip if the matched tab is already claimed by a saved item — the
    // floating-group record is stale (will be pruned next cold start).
    if (claimedTabIds.has(matchedTabId)) continue;

    /* H-2 dedup gate — drop the second-or-later record that resolved to a
       tabId we already emitted this build. */
    if (matchedTabIds.has(matchedTabId)) continue;
    matchedTabIds.add(matchedTabId);

    const liveEntry = liveIndex.get(matchedTabId);
    if (!liveEntry) continue;

    const descriptor = {
      tabId: matchedTabId,
      windowId: liveEntry.windowId,
      tabIndex: typeof liveEntry.index === 'number' ? liveEntry.index : 0,
      url: liveEntry.url || '',
      parentItemId,
      title: liveEntry.title || '',
      favIconUrl: liveEntry.favIconUrl ? liveEntry.favIconUrl : null,
      audible: !!liveEntry.audible,
      active: !!liveEntry.active,
    };
    /* B-134 §63.8.4 — propagate explicit sortOrder when the source record
       carries one (v3+). Legacy v2 records (no sortOrder) flow through
       without the field; the comparator below handles both shapes. */
    if (typeof record.sortOrder === 'number' && Number.isFinite(record.sortOrder)) {
      descriptor.sortOrder = record.sortOrder;
    }

    if (!out[parent.groupId]) out[parent.groupId] = [];
    out[parent.groupId].push(descriptor);
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
