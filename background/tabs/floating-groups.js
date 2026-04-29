/**
 * Floating-group persistence and cold-start re-association.
 *
 * Floating groups are tabs that were spawned via opener-chain inheritance
 * (B-013) or demoted from a saved item (MSG_DEMOTE_ITEM). Their window
 * position and URL are persisted to tj:floatingGroups in storage.local so
 * they survive browser restarts (B-018 AC7/AC12).
 *
 * B-121 (§60.4) — schema v2: each record carries a synthetic `floatingTabId`
 * (ulid) as its storage identity, plus the parent saved item's id under
 * `parentItemId`. Pre-S38 records used `itemId` instead of `parentItemId`
 * and lacked `floatingTabId`; both schemas are tolerated on read.
 *
 * Cold-start re-association (B-121 §60.4.3): position match (windowId +
 * tabIndex) first, URL fallback second. Records whose matched tab is
 * already claimed by reconcileClaims are pruned (the tab has been promoted
 * since shutdown). Records whose matched tab is NOT claimed are LEFT IN
 * PLACE — runtime visibility is delivered by buildFloatingMembers on the
 * next MSG_LIST_ITEMS dispatch. Records with no matching live tab are
 * also left in place per AC9 (the tab may reopen on a future restart).
 *
 * IMPORTANT: this module no longer calls claimTabForItem. The §58.4(i)
 * latent defect (parent's claim overwritten by re-association) is closed
 * by removing the claim-write path entirely. The mirror is solely owned
 * by reconcileClaims (URL match against a saved item's own URL).
 */

import { safeNormalizeForMatch } from '../../shared/url.js';
import { writeTransaction } from '../storage/write-transaction.js';
import { readPartition, PARTITION_FLOATING_GROUPS, MAX_URL } from '../storage/partitions.js';
import { ulid } from '../storage/ids.js';

/**
 * Resolve the parent itemId for a floating-group record, supporting both
 * the post-S38 schema (`parentItemId`) and pre-S38 legacy records
 * (`itemId`). Used by every read path so the runtime contract is uniform
 * across versions.
 *
 * @param {object} entry
 * @returns {string}
 */
export function getParentItemId(entry) {
  if (!entry || typeof entry !== 'object') return '';
  if (typeof entry.parentItemId === 'string' && entry.parentItemId.length > 0) {
    return entry.parentItemId;
  }
  if (typeof entry.itemId === 'string' && entry.itemId.length > 0) {
    return entry.itemId;
  }
  return '';
}

/**
 * Save floating-group entries to tj:floatingGroups (legacy migration path).
 *
 * Caller-supplied entries are written verbatim (no `floatingTabId`
 * stamping, no field renaming). Used only by MSG_DEMOTE_ITEM and tests
 * that seed pre-stamped fixtures. Validators tolerate either
 * `parentItemId` (preferred) or `itemId` (legacy).
 *
 * @param {Array<{groupId: string, parentItemId?: string, itemId?: string,
 *                windowId: number, tabIndex: number, url: string,
 *                savedAt: number, floatingTabId?: string}>} entries
 * @returns {Promise<void>}
 */
export async function saveFloatingGroups(entries) {
  const valid = entries.filter((e) => {
    if (!e || typeof e !== 'object') return false;
    if (typeof e.groupId !== 'string') return false;
    const parentId = getParentItemId(e);
    if (parentId.length === 0) return false;
    if (typeof e.windowId !== 'number' || !Number.isFinite(e.windowId)) return false;
    if (typeof e.tabIndex !== 'number' || !Number.isFinite(e.tabIndex)) return false;
    if (typeof e.url !== 'string' || e.url.length > MAX_URL) return false;
    if (typeof e.savedAt !== 'number' || !Number.isFinite(e.savedAt)) return false;
    return true;
  });
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: () => valid,
  }]);
}

/**
 * Re-associate floating-group records on cold start.
 *
 * Algorithm (B-121 §60.4.3):
 *   1. POSITION MATCH: find live tab where windowId === record.windowId
 *      AND index === record.tabIndex AND tab is unclaimed.
 *   2. URL FALLBACK: if no position match, find unclaimed tab where
 *      normalizeForMatch(stored.url) === normalizeForMatch(tab.url).
 *   3. If matched AND already claimed: prune the record.
 *   4. If matched AND unclaimed: LEAVE IN PLACE (runtime render path
 *      surfaces it via buildFloatingMembers).
 *   5. If no match: leave in place per B-018 AC9.
 *
 * The function does NOT mutate `claimsMirror`. Parent claims established
 * by reconcileClaims are preserved unconditionally (AC7).
 *
 * @param {Map<number, {url: string, windowId: number, active: boolean,
 *                     audible: boolean, index: number}>} liveTabIndex
 * @param {Record<string, number>} existingClaims — itemId → tabId
 * @returns {Promise<void>}
 */
export async function reassociateFloatingGroups(liveTabIndex, existingClaims) {
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return;

  const claimedTabIds = new Set(Object.values(existingClaims));

  /** @type {Set<string>} floatingTabIds whose record should be pruned */
  const resolvedFloatingTabIds = new Set();
  /** @type {Set<string>} legacy parentItemId values whose record should be
   *  pruned (used only when the record lacks a floatingTabId — the legacy
   *  prune path described in §60.4.5). */
  const legacyResolvedParentItemIds = new Set();

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    let matchedTabId = null;

    // POSITION MATCH
    for (const [tabId, entry] of liveTabIndex) {
      if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
        matchedTabId = tabId;
        break;
      }
    }

    // URL FALLBACK
    if (matchedTabId === null) {
      const normalizedStored = safeNormalizeForMatch(record.url);
      if (normalizedStored) {
        for (const [tabId, entry] of liveTabIndex) {
          if (safeNormalizeForMatch(entry.url) === normalizedStored) {
            matchedTabId = tabId;
            break;
          }
        }
      }
    }

    if (matchedTabId !== null && claimedTabIds.has(matchedTabId)) {
      // Tab has been promoted to a saved item — record is stale, prune it.
      if (typeof record.floatingTabId === 'string' && record.floatingTabId.length > 0) {
        resolvedFloatingTabIds.add(record.floatingTabId);
      } else {
        const parentId = getParentItemId(record);
        if (parentId) legacyResolvedParentItemIds.add(parentId);
      }
    }
    // matched + unclaimed → leave in place (runtime path renders it)
    // not matched → leave in place per AC9
  }

  if (resolvedFloatingTabIds.size > 0 || legacyResolvedParentItemIds.size > 0) {
    await pruneResolvedFloatingGroups(resolvedFloatingTabIds, legacyResolvedParentItemIds);
  }
}

/**
 * Append a single floating-group entry atomically.
 *
 * B-121 §60.4.4: stamps a fresh `floatingTabId` (ulid) onto every record.
 * Required field: `parentItemId` (the parent saved item's id). Records
 * supplied with a legacy `itemId` field are migrated transparently:
 * `itemId` is renamed to `parentItemId` before persistence.
 *
 * @param {{groupId: string, parentItemId?: string, itemId?: string,
 *          windowId: number, tabIndex: number, url: string,
 *          savedAt: number}} entry
 * @returns {Promise<void>}
 */
export async function appendFloatingGroup(entry) {
  if (!entry || typeof entry !== 'object'
    || typeof entry.groupId !== 'string'
    || typeof entry.windowId !== 'number' || !Number.isFinite(entry.windowId)
    || typeof entry.tabIndex !== 'number' || !Number.isFinite(entry.tabIndex)
    || typeof entry.url !== 'string' || entry.url.length > MAX_URL
    || typeof entry.savedAt !== 'number' || !Number.isFinite(entry.savedAt)) {
    return;
  }
  const parentId = getParentItemId(entry);
  if (parentId.length === 0) return;

  const stamped = {
    floatingTabId: ulid(),
    groupId: entry.groupId,
    parentItemId: parentId,
    windowId: entry.windowId,
    tabIndex: entry.tabIndex,
    url: entry.url,
    savedAt: entry.savedAt,
  };

  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return [...arr, stamped];
    },
  }]);
}

/**
 * Remove resolved floating-group records from storage.
 *
 * B-121 §60.4.5: identity has shifted from `parentItemId` to
 * `floatingTabId`. The legacy fallback (`legacyResolvedParentItemIds`)
 * removes records that lack a `floatingTabId` field (pre-S38 writes that
 * never went through the migration). New code SHOULD pass only
 * `resolvedFloatingTabIds`; the second parameter exists for the
 * cold-start re-association path during the v1→v2 transition window.
 *
 * @param {Set<string>} resolvedFloatingTabIds
 * @param {Set<string>} [legacyResolvedParentItemIds]
 * @returns {Promise<void>}
 */
export async function pruneResolvedFloatingGroups(
  resolvedFloatingTabIds,
  legacyResolvedParentItemIds = new Set(),
) {
  if (resolvedFloatingTabIds.size === 0 && legacyResolvedParentItemIds.size === 0) return;
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.filter((entry) => {
        if (!entry || typeof entry !== 'object') return false;
        if (typeof entry.floatingTabId === 'string' && entry.floatingTabId.length > 0) {
          return !resolvedFloatingTabIds.has(entry.floatingTabId);
        }
        const parentId = getParentItemId(entry);
        return !legacyResolvedParentItemIds.has(parentId);
      });
    },
  }]);
}

/**
 * Cascade-prune floating-group records whose parent saved item was deleted.
 *
 * B-121 §60.8 (ii): MSG_DELETE_ITEM eagerly removes any record whose
 * `parentItemId` matches the deleted item id. Best-effort — records that
 * survive a crash between deleteItem and this prune are caught lazily by
 * buildFloatingMembers on the next MSG_LIST_ITEMS (parent missing →
 * record skipped from the response).
 *
 * @param {string} parentItemId
 * @returns {Promise<void>}
 */
export async function pruneFloatingGroupsByParentItemId(parentItemId) {
  if (typeof parentItemId !== 'string' || parentItemId.length === 0) return;
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.filter((entry) => getParentItemId(entry) !== parentItemId);
    },
  }]);
}
