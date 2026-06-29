/**
 * Floating-group cold-start re-association.
 *
 * The cold-start reconciliation slice of the floating-groups subsystem
 * (B-176 §74 A2 split). On every cold start `reassociateFloatingGroups`
 * walks the persisted floating records, joins each to a live tab via the
 * shared resolver (B-175 §74), dedups duplicate triples, prunes records
 * whose tab was promoted, and lazy-rewrites stale `liveTabId` hints. All
 * storage mutations piggyback on the single `pruneResolvedFloatingGroups`
 * write transaction (imported from `floating-groups-prune.js`).
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

import { readPartition, PARTITION_FLOATING_GROUPS } from '../storage/partitions.js';
import { resolveRecordToTab } from './tab-item-resolver.js';
import { getParentItemId } from './floating-groups-schema.js';
import { pruneResolvedFloatingGroups } from './floating-groups-prune.js';

/**
 * Re-associate floating-group records on cold start.
 *
 * Algorithm (B-121 §60.4.3 + B-137 §66.7 + Fix C Part 2):
 *   1. DEDUP PASS (Fix C Part 2): walk records by triple
 *      (liveTabId, parentItemId, groupId); duplicates collapse to the
 *      single highest-`savedAt` survivor. Older duplicates are queued for
 *      prune. Records lacking `floatingTabId` are excluded from the dedup
 *      pass (their resolver paths handle them).
 *   2. TIER (a) DIRECT TABID MATCH (B-137): record.liveTabId is finite AND
 *      liveTabIndex.has(record.liveTabId).
 *   3. POSITION MATCH: find live tab where windowId === record.windowId
 *      AND index === record.tabIndex.
 *   4. URL FALLBACK: if no position match, find tab where
 *      normalizeForMatch(stored.url) === normalizeForMatch(tab.url).
 *   5. If matched AND already claimed: prune the record.
 *   6. If matched AND unclaimed AND record.liveTabId differs from the
 *      resolved tabId (legacy v3 record OR v4 record with stale liveTabId):
 *      LAZY-REWRITE record.liveTabId to the resolved tabId (B-137 §66.7).
 *   7. If matched AND unclaimed AND record.liveTabId already matches:
 *      LEAVE IN PLACE (runtime render path surfaces it).
 *   8. If no match: leave in place per B-018 AC9.
 *
 * The function does NOT mutate `claimsMirror`. Parent claims established
 * by reconcileClaims are preserved unconditionally (AC7). The lazy
 * `liveTabId` rewrite (step 6) and the Fix C Part 2 dedup-prune both
 * piggyback on the existing `pruneResolvedFloatingGroups` writeTransaction
 * so cold-start storage mutations remain a single atomic write.
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
  /** B-137 §66.7.4 — floatingTabId → resolved liveTabId for matched-
   *  unclaimed records whose stored liveTabId is missing or stale. The
   *  pruneResolvedFloatingGroups writeTransaction patches these atomically
   *  alongside the prune. Keyed by floatingTabId because that is the
   *  storage identity (records lacking floatingTabId — pre-S38 legacy
   *  shape — are not lazy-rewritten; they self-evict via natural turnover). */
  /** @type {Map<string, number>} */
  const staleLiveTabIdRecords = new Map();

  /** Origin: docs/findings/post-s41-pre-merge-triage.md Issue C — Fix C
   *  Part 2 (cold-start dedup). Walk records grouped by the triple
   *  (liveTabId, parentItemId, groupId); when N > 1 records share a
   *  triple, mark the (N-1) older-by-`savedAt` records' `floatingTabId`s
   *  for prune. The most-recent `savedAt` survives — that record
   *  represents the latest state of the inheritance event.
   *
   *  Pre-existing duplicate cleanup: this dedup pass exists because some
   *  installations already shipped Sprint 38–41 builds without the Part 1
   *  dedup-on-write guard, and their stored partitions contain
   *  pre-existing duplicate records. New installs (with Part 1 in place)
   *  will never produce duplicates, so this pass becomes a structural
   *  no-op for them.
   *
   *  Records lacking `floatingTabId` (pre-S38 legacy shape) are excluded
   *  from this dedup pass — they are pruned only by their own resolver
   *  paths above. The dedup key uses the storage identity
   *  `floatingTabId`, mirroring the prune branch's keying convention.
   *
   *  Lazy-rewrite interaction: a record may be both stale-liveTabId
   *  (queued for patch via `staleLiveTabIdRecords`) AND the survivor of a
   *  duplicate group. This is consistent — the patch branch in
   *  `pruneResolvedFloatingGroups` only fires for records that survive
   *  the prune filter; the dedup-prune branch and stale-liveTabId
   *  patch branch co-exist by floatingTabId-keyed lookup. */
  /** @type {Set<string>} */
  const duplicateFloatingTabIds = new Set();
  /** @type {Map<string, {floatingTabId: string, savedAt: number}>}
   *  triple-key → survivor candidate (highest savedAt seen so far) */
  const tripleSurvivors = new Map();
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    if (typeof record.floatingTabId !== 'string' || record.floatingTabId.length === 0) {
      continue;
    }
    if (typeof record.liveTabId !== 'number' || !Number.isFinite(record.liveTabId)) {
      continue;
    }
    const parentId = getParentItemId(record);
    if (!parentId) continue;
    if (typeof record.groupId !== 'string' || record.groupId.length === 0) continue;
    const tripleKey = `${record.liveTabId}|${parentId}|${record.groupId}`;
    const savedAt = (typeof record.savedAt === 'number' && Number.isFinite(record.savedAt))
      ? record.savedAt : 0;
    const prior = tripleSurvivors.get(tripleKey);
    if (!prior) {
      tripleSurvivors.set(tripleKey, { floatingTabId: record.floatingTabId, savedAt });
      continue;
    }
    /* Two records share the triple — keep the higher savedAt as survivor;
       mark the loser for prune. */
    if (savedAt > prior.savedAt) {
      duplicateFloatingTabIds.add(prior.floatingTabId);
      tripleSurvivors.set(tripleKey, { floatingTabId: record.floatingTabId, savedAt });
    } else {
      duplicateFloatingTabIds.add(record.floatingTabId);
    }
  }

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    /* B-137 §66.7.4 — 3-tier join (a: direct liveTabId · b: position ·
       c: URL) via the shared resolver (B-175 §74). NO `excludeClaimedTabIds`
       here: reassociate needs the RAW matched tabId — even when claimed — to
       decide prune (claimed) vs. lazy-rewrite (unclaimed + stale liveTabId)
       below. No URL-corroboration on the position tier (legacy parity). */
    const matchedTabId = resolveRecordToTab(record, liveTabIndex);

    if (matchedTabId !== null && claimedTabIds.has(matchedTabId)) {
      // Tab has been promoted to a saved item — record is stale, prune it.
      if (typeof record.floatingTabId === 'string' && record.floatingTabId.length > 0) {
        resolvedFloatingTabIds.add(record.floatingTabId);
      } else {
        const parentId = getParentItemId(record);
        if (parentId) legacyResolvedParentItemIds.add(parentId);
      }
    } else if (matchedTabId !== null
      && record.liveTabId !== matchedTabId    // missing OR stale stored liveTabId
      && typeof record.floatingTabId === 'string'
      && record.floatingTabId.length > 0) {
      /* B-137 §66.7.4 — matched + unclaimed + (missing OR stale) liveTabId.
         Lazy-rewrite the resolved tabId. floatingTabId is the storage
         identity used for the patch lookup in pruneResolvedFloatingGroups. */
      staleLiveTabIdRecords.set(record.floatingTabId, matchedTabId);
    }
    // matched + unclaimed + liveTabId already correct → leave in place
    // not matched → leave in place per AC9
  }

  /* Fix C Part 2 — merge `duplicateFloatingTabIds` into the prune set
     handed to `pruneResolvedFloatingGroups`. Both sets target records by
     `floatingTabId` and both result in the same outcome (record dropped
     from storage), so a single union is sufficient — no new mutator
     argument required. The lazy-rewrite branch below the prune branch is
     unaffected: the survivor's `floatingTabId` is NOT in the union, so
     the patch (if queued) lands on the survivor record. */
  for (const dupId of duplicateFloatingTabIds) {
    resolvedFloatingTabIds.add(dupId);
  }

  if (resolvedFloatingTabIds.size > 0 || legacyResolvedParentItemIds.size > 0
    || staleLiveTabIdRecords.size > 0) {
    await pruneResolvedFloatingGroups(
      resolvedFloatingTabIds,
      legacyResolvedParentItemIds,
      staleLiveTabIdRecords,
    );
  }
}
