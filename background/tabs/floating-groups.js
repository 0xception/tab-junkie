/**
 * Floating-group persistence and cold-start re-association (B-001d).
 *
 * Floating groups are tabs that were open but not yet claimed by any saved
 * item. Their window position and URL are persisted to tj:floatingGroups
 * in storage.local so they survive browser restarts (AC7/AC12).
 *
 * On cold start, re-association attempts exact window+index match first
 * (AC8), then falls back to URL match (AC9). Unresolved records remain
 * in storage for future re-association attempts.
 *
 * All writes go through writeTransaction with PARTITION_FLOATING_GROUPS.
 */

import { safeNormalizeForMatch } from '../../shared/url.js';
import { writeTransaction } from '../storage/write-transaction.js';
import { readPartition, PARTITION_FLOATING_GROUPS, MAX_URL } from '../storage/partitions.js';
import { claimTabForItem } from './tab-claims.js';

/**
 * Save floating-group entries to tj:floatingGroups.
 *
 * @param {Array<{groupId: string, windowId: number, tabIndex: number, url: string, savedAt: number}>} entries
 * @returns {Promise<void>}
 */
export async function saveFloatingGroups(entries) {
  // H4: validate each entry before writing — discard invalid entries silently
  // (best-effort, like legacy migration)
  const valid = entries.filter((e) =>
    e && typeof e === 'object'
    && typeof e.groupId === 'string'
    && typeof e.windowId === 'number' && Number.isFinite(e.windowId)
    && typeof e.tabIndex === 'number' && Number.isFinite(e.tabIndex)
    && typeof e.url === 'string' && e.url.length <= MAX_URL,
  );
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: () => valid,
  }]);
}

/**
 * Re-associate floating-group records with live tabs on cold start.
 *
 * Algorithm (per AC8/AC9/AC11):
 *   1. POSITION MATCH: find tab in LiveTabIndex where windowId === record.windowId
 *      AND index === record.tabIndex AND tab not already claimed.
 *   2. URL FALLBACK: if no position match, find unclaimed tab where
 *      normalizeForMatch(storedUrl) === normalizeForMatch(tab.url).
 *   3. UNRESOLVED: leave record in tj:floatingGroups.
 *
 * After: remove resolved records via writeTransaction.
 *
 * @param {Map<number, {url: string, windowId: number, active: boolean, audible: boolean, index: number}>} liveTabIndex
 * @param {Record<string, number>} existingClaims — itemId → tabId
 * @returns {Promise<void>}
 */
export async function reassociateFloatingGroups(liveTabIndex, existingClaims) {
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return;

  // H6 / DEFERRED: No TTL on unresolved records. Future item should prune
  // records older than N days.

  // Build set of already-claimed tabIds for exclusion
  const claimedTabIds = new Set(Object.values(existingClaims));
  const resolvedIndices = new Set();

  // H5: First record in array order wins for duplicate windowId+tabIndex.
  // Matches R2 ruling #3 and reconcileClaims first-unclaimed-wins pattern.
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    let matchedTabId = null;

    // AC8: POSITION MATCH — exact windowId + tabIndex
    for (const [tabId, entry] of liveTabIndex) {
      if (claimedTabIds.has(tabId)) continue;
      if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
        matchedTabId = tabId;
        break;
      }
    }

    // AC9: URL FALLBACK — normalizeForMatch comparison
    if (matchedTabId === null) {
      const normalizedStored = safeNormalizeForMatch(record.url);
      if (!normalizedStored) continue;

      for (const [tabId, entry] of liveTabIndex) {
        if (claimedTabIds.has(tabId)) continue;
        if (safeNormalizeForMatch(entry.url) === normalizedStored) {
          matchedTabId = tabId;
          break;
        }
      }
    }

    if (matchedTabId !== null) {
      claimedTabIds.add(matchedTabId);
      resolvedIndices.add(i);
      // H7 (AC10): propagate re-association to claimsMirror + storage.session
      // so buildLiveStates correctly reflects the re-associated claim.
      await claimTabForItem(record.groupId, matchedTabId);
    }
  }

  // Remove resolved records, keep unresolved ones (AC9 last clause)
  if (resolvedIndices.size > 0) {
    await pruneResolvedFloatingGroups(records, resolvedIndices);
  }
}

/**
 * Remove resolved floating-group records from storage.
 *
 * @param {Array<Object>} records — full records array from storage
 * @param {Set<number>} resolvedIndices — indices to remove
 * @returns {Promise<void>}
 */
export async function pruneResolvedFloatingGroups(records, resolvedIndices) {
  const remaining = records.filter((_, idx) => !resolvedIndices.has(idx));
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: () => remaining,
  }]);
}
