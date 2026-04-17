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
    && typeof e.itemId === 'string' && e.itemId.length > 0
    && typeof e.windowId === 'number' && Number.isFinite(e.windowId)
    && typeof e.tabIndex === 'number' && Number.isFinite(e.tabIndex)
    && typeof e.url === 'string' && e.url.length <= MAX_URL
    && typeof e.savedAt === 'number' && Number.isFinite(e.savedAt),
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
  // H-1 fix: collect resolved itemIds (stable keys) instead of positional
  // indices so the prune mutator can filter the live `current` array rather
  // than relying on a stale snapshot.
  const resolvedItemIds = new Set();

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
      // C-1: if record lacks a valid itemId, prune the orphan rather than
      // calling claimTabForItem with undefined (which would poison the mirror).
      if (!record.itemId) {
        resolvedItemIds.add(record.itemId);
        continue;
      }
      // H-2 fix: add claimedTabIds guard synchronously (in-memory disambiguation)
      // but only mark as resolved AFTER claimTabForItem succeeds.
      claimedTabIds.add(matchedTabId);
      try {
        // H7 (AC10): propagate re-association to claimsMirror + storage.session
        // so buildLiveStates correctly reflects the re-associated claim.
        await claimTabForItem(record.itemId, matchedTabId);
        // H-2: only mark resolved after the claim is persisted
        resolvedItemIds.add(record.itemId);
      } catch (err) {
        // H-2: claim failed — release the tab so another record can claim it
        claimedTabIds.delete(matchedTabId);
        // eslint-disable-next-line no-console
        console.warn('[tab-junkie:floating-groups] claimTabForItem failed for item %s, tab %d:', record.itemId, matchedTabId, err);
      }
    }
  }

  // Remove resolved records, keep unresolved ones (AC9 last clause)
  if (resolvedItemIds.size > 0) {
    await pruneResolvedFloatingGroups(resolvedItemIds);
  }
}

/**
 * Append a single floating-group entry atomically using a writeTransaction
 * mutator. Avoids race conditions with concurrent appends (unlike the
 * read-modify-write of saveFloatingGroups).
 *
 * @param {{groupId: string, windowId: number, tabIndex: number, url: string, savedAt: number}} entry
 * @returns {Promise<void>}
 */
export async function appendFloatingGroup(entry) {
  if (!entry || typeof entry !== 'object'
    || typeof entry.groupId !== 'string'
    || typeof entry.itemId !== 'string' || entry.itemId.length === 0
    || typeof entry.windowId !== 'number' || !Number.isFinite(entry.windowId)
    || typeof entry.tabIndex !== 'number' || !Number.isFinite(entry.tabIndex)
    || typeof entry.url !== 'string' || entry.url.length > MAX_URL
    || typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)) {
    return;
  }
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return [...arr, entry];
    },
  }]);
}

/**
 * Remove resolved floating-group records from storage.
 *
 * H-1 fix: accepts a Set of resolved itemIds (stable keys) instead of
 * positional indices. The mutator filters the live `current` value from
 * writeTransaction, avoiding TOCTOU with concurrent appendFloatingGroup calls.
 *
 * @param {Set<string>} resolvedItemIds — itemIds to remove
 * @returns {Promise<void>}
 */
export async function pruneResolvedFloatingGroups(resolvedItemIds) {
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.filter((entry) => !resolvedItemIds.has(entry.itemId));
    },
  }]);
}
