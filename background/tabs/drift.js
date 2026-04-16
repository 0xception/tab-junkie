/**
 * Drift detection — persists URL divergence records to tj:drift.
 *
 * When a claimed tab navigates away from the saved item URL, a drift record
 * is written. When it navigates back, the record is cleared. Fragment-only
 * changes do not create drift because normalizeUrl({forMatch:true}) strips
 * fragments before comparison (AC3).
 *
 * All writes go through writeTransaction with PARTITION_DRIFT (AC1/AC2).
 */

import { normalizeUrl, safeNormalizeForMatch } from '../../shared/url.js';
import { writeTransaction } from '../storage/write-transaction.js';
import { readPartition, PARTITION_DRIFT } from '../storage/partitions.js';
import { getClaimsMirror, getItemIdForTab } from './tab-claims.js';

/**
 * Detect drift for a specific tab after URL change. Called after reevaluateTab
 * resolves. Looks up the claiming item via claimsMirror to determine if a
 * drift record should be written or cleared.
 *
 * AC6: If no claim exists for this tabId, returns immediately without writing.
 *
 * @param {number} tabId
 * @param {string} currentTabUrl — the raw URL the tab navigated to
 * @param {Array<{id: string, url: string}>} items — current saved items
 * @returns {Promise<void>}
 */
export async function detectDriftForTab(tabId, currentTabUrl, items) {
  // H2: use centralised reverse-lookup instead of duplicating the scan
  const claimedItemId = getItemIdForTab(tabId);

  // AC6: unclaimed tab — no-op
  if (claimedItemId === null) return;

  const item = items.find((it) => it.id === claimedItemId);
  if (!item) return;

  const normalizedSaved = safeNormalizeForMatch(item.url);
  const normalizedCurrent = safeNormalizeForMatch(currentTabUrl);

  // Both must be non-empty for meaningful comparison
  if (!normalizedSaved || !normalizedCurrent) return;

  if (normalizedSaved !== normalizedCurrent) {
    // AC1: Write drift record — H3: normalize URL before storage; skip if
    // normalizeUrl rejects the scheme (e.g. javascript:, data:)
    let storedUrl;
    try {
      storedUrl = normalizeUrl(currentTabUrl, { forStorage: true });
    } catch {
      return; // invalid scheme — skip drift write entirely
    }
    await writeDrift(claimedItemId, storedUrl);
  } else {
    // AC2/AC4: URLs match after normalization — clear any existing drift
    await clearDrift(claimedItemId);
  }
}

/**
 * Write a drift record for a specific item.
 * @param {string} itemId
 * @param {string} driftedToUrl
 * @returns {Promise<void>}
 */
async function writeDrift(itemId, driftedToUrl) {
  await writeTransaction([{
    partition: PARTITION_DRIFT,
    mutator: (current) => ({
      ...current,
      [itemId]: {
        itemId,
        driftedToUrl,
        detectedAt: Date.now(),
      },
    }),
  }]);
}

/**
 * Clear a drift record for a specific item. No-op if no record exists.
 * @param {string} itemId
 * @returns {Promise<void>}
 */
export async function clearDrift(itemId) {
  await writeTransaction([{
    partition: PARTITION_DRIFT,
    mutator: (current) => {
      if (!(itemId in current)) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    },
  }]);
}

/**
 * Read all drift records from storage. Used by MSG_LIST_ITEMS enrichment.
 * @returns {Promise<Record<string, {itemId: string, driftedToUrl: string, detectedAt: number}>>}
 */
export async function getDriftRecords() {
  return readPartition(PARTITION_DRIFT);
}
