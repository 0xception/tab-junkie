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
import { readPartition, PARTITION_FLOATING_GROUPS, PARTITION_GROUPS, PARTITION_ITEMS, MAX_URL } from '../storage/partitions.js';
import { ulid } from '../storage/ids.js';
import { getLiveTabIndex } from './live-tab-index.js';
import { markInherited, getClaimsMirror } from './tab-claims.js';

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

    let matchedTabId = null;

    /* B-137 §66.7.4 tier (a) — direct liveTabId fast path. Used to skip
       the position loop when the v4 record's liveTabId is still valid in
       this session. */
    if (typeof record.liveTabId === 'number' && Number.isFinite(record.liveTabId)
      && liveTabIndex.has(record.liveTabId)) {
      matchedTabId = record.liveTabId;
    }

    // POSITION MATCH (legacy fallback)
    if (matchedTabId === null) {
      for (const [tabId, entry] of liveTabIndex) {
        if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
          matchedTabId = tabId;
          break;
        }
      }
    }

    // URL FALLBACK (legacy fallback)
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

/**
 * Append a single floating-group entry atomically.
 *
 * B-121 §60.4.4: stamps a fresh `floatingTabId` (ulid) onto every record.
 * B-137 §66.5: ALSO stamps the caller-supplied `liveTabId` (numeric tabId at
 * write time — primary live-session join key). The caller — `tab-events.js`
 * `chrome.tabs.onCreated` opener-chain block at lines 156-163 — has `tab.id`
 * in scope and passes it through the `entry` object. Records supplied
 * without `liveTabId` are silently rejected (matches the existing input-
 * validator pattern).
 *
 * Required field: `parentItemId` (the parent saved item's id). Records
 * supplied with a legacy `itemId` field are migrated transparently:
 * `itemId` is renamed to `parentItemId` before persistence.
 *
 * @param {{groupId: string, parentItemId?: string, itemId?: string,
 *          windowId: number, tabIndex: number, url: string,
 *          savedAt: number, liveTabId: number}} entry
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
  /* B-137 §66.5.3 — `liveTabId` is REQUIRED on the input; silent reject
     on missing/non-finite (matches the existing input-validator early-
     return pattern above). The sole production caller — `tab-events.js`
     opener-chain block — always has `tab.id` in scope. */
  if (typeof entry.liveTabId !== 'number' || !Number.isFinite(entry.liveTabId)) {
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
    /* B-137 §66.5.4 — primary live-session join key (schema v4). Caller
       supplies the numeric tabId (`tab.id` from `chrome.tabs.onCreated`). */
    liveTabId: entry.liveTabId,
  };

  /* B-148 §3.5 — closure flag: true only when the floating record was
     actually appended (dedup path leaves it false). Consumed by the
     PARTITION_GROUPS mutator below to guard the renderOrder write. */
  let didAppend = false;

  await writeTransaction([
    {
      partition: PARTITION_FLOATING_GROUPS,
      mutator: (current) => {
        const arr = Array.isArray(current) ? current : [];

        /* Origin: docs/findings/post-s41-pre-merge-triage.md Issue C — pre-
           v1.35.0 hotfix bundle Fix C. Closes the duplicate-record failure
           mode that surfaces in the SW-console `tj:floatingGroups` partition
           and breaks `reorderFloatingMembers` parity (floating-groups.js:397-
           401: `storageBucketSize` counts duplicates, `supplied.size` is
           deduped → ERR_RACE on every legitimate reorder).

           Dedup key is the triple `(liveTabId, parentItemId, groupId)`.
           User-data evidence: records 7/12 (`liveTabId 803725428`,
           `parentItemId 01KQ37HNDV342WNA3V120MCRW0`) are duplicates and must
           collapse; record 9 (`liveTabId 803725428` BUT
           `parentItemId 01KQ37HNDV342WNA3V120MCRXS` — different parent) is a
           legitimate "same tab is a floating member of two parents"
           coexistence and MUST be preserved. The triple is the most-specific
           key that captures both invariants.

           B-141 self-application: B-137 §66.1 claimed to "structurally
           eliminate" Issue 3 (race-toast) from the post-S40 spike. B-137
           closed the resolver half; Fix A closed the orphan-on-close half;
           this Fix C closes the duplicate-on-write half. All three converge
           on the same parity check (line 397-401 above).

           Option A semantics: when a matching triple exists, no-op (return
           the array unchanged). Rationale: the existing record's
           `floatingTabId` is the stable storage identity; preserving it
           avoids invalidating any in-flight references. Drift in
           `windowId` / `tabIndex` / `url` is recovered by the read-path
           tier-(b) `(windowId, tabIndex)` geometry fallback in
           `_resolveRecordIndexByTabId` (line 322-345 above) and by cold-start
           re-bind in `reassociateFloatingGroups` (line 115-201 above), so
           in-place updates are not required. */
        const existing = arr.find((r) => r
          && typeof r === 'object'
          && r.liveTabId === stamped.liveTabId
          && getParentItemId(r) === stamped.parentItemId
          && r.groupId === stamped.groupId);
        if (existing) {
          return arr;
        }

        /* B-134 §63.2.4 / §63.13.1: stamp `sortOrder` = current_max_in_group + 1
           (or 0 when the group's bucket is empty). The mutator computes this
           inside the writeTransaction so concurrent appends to the same bucket
           see consistent ordering — same pattern as `bulkReorderItems` /
           `bulkReorderGroups` use for per-bucket renormalisation. */
        let maxSortOrder = -1;
        for (const r of arr) {
          if (r && r.groupId === stamped.groupId
            && typeof r.sortOrder === 'number' && Number.isFinite(r.sortOrder)
            && r.sortOrder > maxSortOrder) {
            maxSortOrder = r.sortOrder;
          }
        }
        const stampedWithOrder = { ...stamped, sortOrder: maxSortOrder + 1 };
        didAppend = true;
        return [...arr, stampedWithOrder];
      },
    },
    {
      /* B-148 §3.5 (S44, v6→v7) — append `floating:<floatingTabId>` to
         target Group's renderOrder. Skipped on dedup-no-op path
         (didAppend === false). Defensive: if the group has been deleted
         between the SW read and now, findIndex returns -1 and we skip. */
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        if (!didAppend) return groups;
        const idx = groups.findIndex((g) => g.id === stamped.groupId);
        if (idx < 0) return groups;
        const g = groups[idx];
        const ref = 'floating:' + stamped.floatingTabId;
        const renderOrder = Array.isArray(g.renderOrder) ? [...g.renderOrder] : [];
        renderOrder.push(ref);
        const next = [...groups];
        next[idx] = { ...g, renderOrder, updatedAt: Date.now() };
        return next;
      },
    },
  ]);
}

/* =========================================================================
   B-134 §63.8 — drag-driven reorder + move helpers.

   `reorderFloatingMembers(groupId, orderedTabIds)` — atomic same-group
     reorder. Validates the supplied tabId set against the SW's authoritative
     `buildFloatingMembers` resolution (race guard); resolves each tabId →
     floatingTabId via the LiveTabIndex `(windowId, tabIndex)` geometry
     (§63.14.1 Strategy A); writes back consecutive integer sortOrders.

   `moveFloatingTab(tabId, sourceGroupId, targetGroupId, insertIndex)` —
     atomic detach+attach. ATTACH (sourceGroupId=null), DETACH
     (targetGroupId=null), and MOVE_FLOATING (both non-null) collapse into
     one writeTransaction. Renormalises both source and target buckets.

   Both helpers return `Promise<boolean>` — true on success, false on race
   conditions (live tab vanished, set mismatch, parent item missing).
   ========================================================================= */

/**
 * Resolve a live tab's floatingGroups record within `groupId` via a 2-tier
 * join (B-137 §66.8):
 *   - Tier (a): direct `liveTabId === tabId` match. v4 records resolve in
 *     a single linear scan (no LiveTabIndex lookup required).
 *   - Tier (b): `(windowId, tabIndex)` geometry against LiveTabIndex.
 *     Required for legacy v3 records lacking `liveTabId` AND for v4
 *     records whose stored `liveTabId` is stale (Chrome restart edge case).
 *
 * Returns the record's index in `arr`, or -1 if no match. Defense-in-
 * depth: the mutator skips records whose tab has vanished (race guard at
 * the writeTransaction layer; the drop-handler third branch in §63.10 is
 * the primary guard).
 *
 * Performance (R3-VERIFY 3 LOCK): tier (a) is O(N_records), not true O(1).
 * The R0 spike's "O(1) Map.get" framing was aspirational; precomputing a
 * `Map<liveTabId, recordIndex>` per-mutator-invocation would cost more
 * than the linear scan at the bounded N (≤ 5 records per group, ≤ 20
 * groups). Linear scan retained per §66.8.2.
 *
 * @param {Array<object>} arr      tj:floatingGroups records
 * @param {number} tabId           live tab id
 * @param {string} groupId         filter records by groupId
 * @param {Map} liveIndex          LiveTabIndex (Map<tabId, {windowId, index, ...}>)
 * @returns {number}               index in arr, or -1
 */
function _resolveRecordIndexByTabId(arr, tabId, groupId, liveIndex) {
  /* B-137 §66.8.1 tier (a) — direct liveTabId match. */
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (!rec || typeof rec !== 'object') continue;
    if (rec.groupId !== groupId) continue;
    if (typeof rec.liveTabId === 'number' && rec.liveTabId === tabId) {
      return i;
    }
  }

  /* Tier (b) — legacy fallback: (windowId, tabIndex) geometry. */
  const live = liveIndex.get(tabId);
  if (!live) return -1;
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (!rec || typeof rec !== 'object') continue;
    if (rec.groupId !== groupId) continue;
    if (rec.windowId === live.windowId && rec.tabIndex === live.index) {
      return i;
    }
  }
  return -1;
}

/**
 * B-134 §63.8.1 — atomic reorder of floating-group records within one group.
 *
 * Reads the current records for `groupId`, validates that `orderedTabIds`
 * matches the live-tab tabIds resolved by `buildFloatingMembers` (race guard
 * at the storage layer; the drop handler also runs the broadcast-race guard
 * pre-flight — defense-in-depth). For each supplied tabId, resolves the
 * matching record via `(windowId, tabIndex)` geometry and stamps
 * `sortOrder = orderedTabIds.indexOf(tabId)`. Records whose tab has vanished
 * mid-write are skipped (defense-in-depth — primary guard is §63.10).
 *
 * @param {string} groupId
 * @param {number[]} orderedTabIds
 * @returns {Promise<boolean>}  true on success; false if the tabId set
 *   does not match the current floating members (race condition; client
 *   should re-fetch and retry).
 */
export async function reorderFloatingMembers(groupId, orderedTabIds) {
  if (typeof groupId !== 'string' || groupId.length === 0) return false;
  if (!Array.isArray(orderedTabIds) || orderedTabIds.length === 0) return false;

  const supplied = new Set(orderedTabIds);
  if (supplied.size !== orderedTabIds.length) return false; // dup tabIds

  /* Race guard at the storage layer: build the SW's authoritative tabId set
     for the group and assert parity with the client-supplied order. The
     parent-item resolution and tabId match (windowId+tabIndex priority,
     URL fallback) live in `buildFloatingMembers`; reusing the same path
     here keeps the contract aligned. */
  const liveIndex = getLiveTabIndex();
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records)) return false;

  /* Build the set of tabIds currently resolvable for this group from the
     stored records + LiveTabIndex (windowId+tabIndex match). The matching
     tabIds are exactly those `_resolveRecordIndexByTabId` will find when
     the mutator runs — they form the parity-check set. */
  const resolvableTabIds = new Set();
  const tabIdToRecordIdx = new Map();
  for (const id of orderedTabIds) {
    if (typeof id !== 'number' || !Number.isFinite(id)) return false;
    const idx = _resolveRecordIndexByTabId(records, id, groupId, liveIndex);
    if (idx === -1) return false; // race: tab vanished or never matched this group
    resolvableTabIds.add(id);
    tabIdToRecordIdx.set(id, idx);
  }

  /* Optional sanity check: the storage's group bucket size should equal
     the supplied set size. Catches a mid-flight append/prune that the
     drop-handler broadcast-race guard might have missed. */
  let storageBucketSize = 0;
  for (const r of records) {
    if (r && r.groupId === groupId) storageBucketSize += 1;
  }
  if (storageBucketSize !== supplied.size) return false;

  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? [...current] : [];
      /* Re-resolve indices inside the mutator — the records snapshot above
         was read OUTSIDE the writeTransaction, so a concurrent mutation
         could have advanced indices. Re-running the resolver inside the
         mutator gives the correct indices for the current snapshot. */
      for (const tabId of orderedTabIds) {
        const idx = _resolveRecordIndexByTabId(arr, tabId, groupId, liveIndex);
        if (idx === -1) continue; // skip — defense-in-depth
        const newSortOrder = orderedTabIds.indexOf(tabId);
        arr[idx] = { ...arr[idx], sortOrder: newSortOrder };
      }
      return arr;
    },
  }]);

  return true;
}

/**
 * B-134 §63.8.2 — atomic move of a floating-group record between groups
 * (or between Open Tabs and a group). All three op variants (ATTACH /
 * DETACH / MOVE_FLOATING) collapse into one writeTransaction.
 *
 * The handler resolves the new record's `parentItemId` (for ATTACH and
 * MOVE_FLOATING) BEFORE the writeTransaction and threads it into the
 * mutator via closure — `writeTransaction` does not allow async I/O inside
 * mutators. ATTACH or MOVE_FLOATING into a group with zero saved items
 * fails (the new record needs a parent bookmark to anchor under, §63.15).
 *
 * @param {number} tabId
 * @param {string|null} sourceGroupId
 * @param {string|null} targetGroupId
 * @param {number} insertIndex
 * @returns {Promise<boolean>}  true on success; false on race conditions:
 *   live tab closed mid-call, source record missing, or ATTACH/MOVE_FLOATING
 *   to a group with no saved items.
 */
export async function moveFloatingTab(tabId, sourceGroupId, targetGroupId, insertIndex) {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return false;
  if (sourceGroupId === null && targetGroupId === null) return false;
  if (sourceGroupId === targetGroupId) return false;
  if (typeof insertIndex !== 'number' || !Number.isFinite(insertIndex) || insertIndex < 0) {
    return false;
  }

  /* Guard A — tab still alive. The drop-handler runs the same check
     pre-flight (§63.10.1); the storage-layer check is defense-in-depth. */
  let liveTab;
  try {
    liveTab = await chrome.tabs.get(tabId);
  } catch {
    return false;
  }
  if (!liveTab) return false;

  /* For ATTACH (sourceGroupId === null) AND MOVE_FLOATING (both groupIds
     non-null): need a parentItemId to seed / re-target the record.
     Resolve via the first saved item under targetGroupId. Empty target
     group → fail per §63.8.2 / §63.15. The lookup runs OUTSIDE the
     writeTransaction (writeTransaction mutators cannot perform async I/O)
     and is threaded into the mutator via closure capture.

     B-150 (S43) fix: was a dynamic-import call resolved at runtime which
     fails in the SW context with `TypeError: import() is disallowed on
     ServiceWorkerGlobalScope`. The chrome-mock Node.js test environment
     allowed dynamic imports so all 1892 tests passed; the bug only fired
     in real Chrome/Edge. Now uses the static `PARTITION_ITEMS` import at
     the top of the module. CLAUDE.md C-8 SW-context-feasibility class.
     Static-scan regression guard: tests/b150-no-dynamic-import-in-sw.test.js. */
  let newParentItemId = null;
  if (targetGroupId !== null) {
    const items = await readPartition(PARTITION_ITEMS);
    const candidates = (Array.isArray(items) ? items : [])
      .filter((it) => it && it.groupId === targetGroupId);
    if (candidates.length === 0) return false; // ATTACH/MOVE to empty group rejected
    candidates.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    newParentItemId = candidates[0].id;
  }

  let ok = true;

  /* B-148 §3.5 — closure carries source/target floatingTabIds + groupIds
     from the floating-groups mutator to the groups mutator. */
  let appliedSourceFloatingTabId = null;
  let appliedTargetFloatingTabId = null;

  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? [...current] : [];
      const liveIndex = getLiveTabIndex();

      let sourceRecord = null;
      let sourceIdx = -1;
      if (sourceGroupId !== null) {
        sourceIdx = _resolveRecordIndexByTabId(arr, tabId, sourceGroupId, liveIndex);
        if (sourceIdx === -1) {
          ok = false;
          return arr;
        }
        sourceRecord = arr[sourceIdx];
        arr.splice(sourceIdx, 1);
        if (sourceRecord && typeof sourceRecord.floatingTabId === 'string') {
          appliedSourceFloatingTabId = sourceRecord.floatingTabId;
        }
      }

      /* Renumber source bucket (DETACH or MOVE_FLOATING). */
      if (sourceGroupId !== null) {
        const srcRecords = arr.filter((r) => r && r.groupId === sourceGroupId);
        srcRecords.sort((a, b) => _floatingRecordCompare(a, b));
        for (let i = 0; i < srcRecords.length; i++) srcRecords[i].sortOrder = i;
      }

      /* Attach phase — append a record into the target bucket. */
      if (targetGroupId !== null) {
        const liveEntry = liveIndex.get(tabId);
        const windowId = liveEntry ? liveEntry.windowId
          : (liveTab.windowId ?? (sourceRecord ? sourceRecord.windowId : 0));
        const tabIndex = liveEntry ? liveEntry.index
          : (liveTab.index ?? (sourceRecord ? sourceRecord.tabIndex : 0));
        const url = liveEntry ? (liveEntry.url || '')
          : (liveTab.url || (sourceRecord ? sourceRecord.url : ''));
        /* MOVE_FLOATING preserves the floatingTabId (storage identity
           survives the cross-group move per §60.4). ATTACH stamps a fresh
           ulid. */
        const floatingTabId = (sourceRecord
          && typeof sourceRecord.floatingTabId === 'string'
          && sourceRecord.floatingTabId.length > 0)
          ? sourceRecord.floatingTabId
          : ulid();

        /* B-137 §66.8.4 — preserve liveTabId across the cross-group move.
           The live tab itself does not close during MOVE_FLOATING (the
           drop-handler guard A at sidepanel.js + the chrome.tabs.get
           pre-flight at floating-groups.js above ensure the tab is alive);
           the join must remain intact. ATTACH (sourceRecord === null) has
           no source liveTabId, so we use the caller-supplied tabId
           argument — that IS the new record's liveTabId. */
        const liveTabIdForRecord = (sourceRecord
          && typeof sourceRecord.liveTabId === 'number'
          && Number.isFinite(sourceRecord.liveTabId))
          ? sourceRecord.liveTabId
          : tabId;

        const tgtRecords = arr.filter((r) => r && r.groupId === targetGroupId);
        const clampedIdx = Math.max(0, Math.min(insertIndex, tgtRecords.length));

        /* Renumber target bucket: bump siblings at >= clampedIdx by 1
           (sorted by current sortOrder so the bump is well-defined),
           then insert the new record. */
        tgtRecords.sort((a, b) => _floatingRecordCompare(a, b));
        for (let i = 0; i < tgtRecords.length; i++) tgtRecords[i].sortOrder = i;
        for (const r of tgtRecords) {
          if (r.sortOrder >= clampedIdx) r.sortOrder += 1;
        }

        appliedTargetFloatingTabId = floatingTabId;
        arr.push({
          floatingTabId,
          groupId: targetGroupId,
          parentItemId: newParentItemId,
          windowId,
          tabIndex,
          url,
          savedAt: Date.now(),
          sortOrder: clampedIdx,
          /* B-137 §66.8.4 — preserve/seed liveTabId on the new record. */
          liveTabId: liveTabIdForRecord,
        });

        /* Final renumber to defend against any sortOrder gaps. */
        const finalTgt = arr.filter((r) => r && r.groupId === targetGroupId);
        finalTgt.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        for (let i = 0; i < finalTgt.length; i++) finalTgt[i].sortOrder = i;
      }

      return arr;
    },
  },
  {
    /* B-148 §3.5 (S44, v6→v7) — strip source.renderOrder + append
       target.renderOrder per the move semantics:
       - DETACH (targetGroupId null): strip source only
       - ATTACH (sourceGroupId null): append target only
       - MOVE_FLOATING (both non-null): strip source AND append target
       Race-fail path (ok === false) skips all writes. */
    partition: PARTITION_GROUPS,
    mutator: (groups) => {
      if (!ok) return groups;
      const next = [...groups];
      let changed = false;
      if (sourceGroupId !== null && appliedSourceFloatingTabId !== null) {
        const idx = next.findIndex((g) => g.id === sourceGroupId);
        if (idx >= 0) {
          const g = next[idx];
          const ref = 'floating:' + appliedSourceFloatingTabId;
          if (Array.isArray(g.renderOrder) && g.renderOrder.includes(ref)) {
            const filtered = g.renderOrder.filter((r) => r !== ref);
            next[idx] = { ...g, renderOrder: filtered, updatedAt: Date.now() };
            changed = true;
          }
        }
      }
      if (targetGroupId !== null && appliedTargetFloatingTabId !== null) {
        const idx = next.findIndex((g) => g.id === targetGroupId);
        if (idx >= 0) {
          const g = next[idx];
          const ref = 'floating:' + appliedTargetFloatingTabId;
          const renderOrder = Array.isArray(g.renderOrder) ? [...g.renderOrder] : [];
          if (!renderOrder.includes(ref)) {
            renderOrder.push(ref);
            next[idx] = { ...g, renderOrder, updatedAt: Date.now() };
            changed = true;
          }
        }
      }
      return changed ? next : groups;
    },
  }]);

  return ok;
}

/**
 * Stable comparator for floating-group records: prefers explicit `sortOrder`,
 * falls back to `(windowId, tabIndex)` for legacy v2 records (§63.2.4
 * lazy-migration semantics).
 */
function _floatingRecordCompare(a, b) {
  const aHas = typeof a.sortOrder === 'number';
  const bHas = typeof b.sortOrder === 'number';
  if (aHas && bHas) return a.sortOrder - b.sortOrder;
  if (aHas) return -1;
  if (bHas) return 1;
  if (a.windowId !== b.windowId) return a.windowId - b.windowId;
  return a.tabIndex - b.tabIndex;
}

/**
 * Remove resolved floating-group records from storage AND lazy-rewrite
 * `liveTabId` on matched-unclaimed records (B-137 §66.7.5).
 *
 * B-121 §60.4.5: identity has shifted from `parentItemId` to
 * `floatingTabId`. The legacy fallback (`legacyResolvedParentItemIds`)
 * removes records that lack a `floatingTabId` field (pre-S38 writes that
 * never went through the migration).
 *
 * B-137 §66.7.5: extended to also accept a third optional argument —
 * `staleLiveTabIdRecords` — a `Map<floatingTabId, newLiveTabId>` of
 * matched-unclaimed records whose stored `liveTabId` is missing or stale.
 * The mutator patches these records inline with the prune filter so cold-
 * start storage mutations remain a single atomic write transaction. The
 * extension is in-place per R3-VERIFY 2 LOCK (Option (i) — extend in
 * place; no new exported function).
 *
 * @param {Set<string>} resolvedFloatingTabIds
 * @param {Set<string>} [legacyResolvedParentItemIds]
 * @param {Map<string, number>} [staleLiveTabIdRecords] — B-137 §66.7.5
 * @returns {Promise<void>}
 */
export async function pruneResolvedFloatingGroups(
  resolvedFloatingTabIds,
  legacyResolvedParentItemIds = new Set(),
  staleLiveTabIdRecords = new Map(),
) {
  if (resolvedFloatingTabIds.size === 0
    && legacyResolvedParentItemIds.size === 0
    && staleLiveTabIdRecords.size === 0) return;
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.reduce((acc, entry) => {
        if (!entry || typeof entry !== 'object') return acc;

        if (typeof entry.floatingTabId === 'string' && entry.floatingTabId.length > 0) {
          // Prune branch (existing) — drop records whose floatingTabId resolved.
          if (resolvedFloatingTabIds.has(entry.floatingTabId)) return acc;
          /* B-137 §66.7.5 — Patch branch. Records flagged for lazy
             liveTabId rewrite get a new record pushed with the resolved
             tabId; all other fields preserved by spread. */
          if (staleLiveTabIdRecords.has(entry.floatingTabId)) {
            acc.push({ ...entry, liveTabId: staleLiveTabIdRecords.get(entry.floatingTabId) });
            return acc;
          }
        } else {
          // Legacy prune branch (no floatingTabId) — match by parentItemId.
          const parentId = getParentItemId(entry);
          if (legacyResolvedParentItemIds.has(parentId)) return acc;
        }

        acc.push(entry);
        return acc;
      }, []);
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
  /* B-148 §3.5 — capture per-group prune set for the renderOrder strip. */
  const prunedByGroup = new Map();
  await writeTransaction([
    {
      partition: PARTITION_FLOATING_GROUPS,
      mutator: (current) => {
        const arr = Array.isArray(current) ? current : [];
        return arr.filter((entry) => {
          if (getParentItemId(entry) !== parentItemId) return true;
          /* This record is being pruned — capture for renderOrder strip. */
          if (entry && typeof entry.groupId === 'string'
            && typeof entry.floatingTabId === 'string') {
            if (!prunedByGroup.has(entry.groupId)) prunedByGroup.set(entry.groupId, new Set());
            prunedByGroup.get(entry.groupId).add(entry.floatingTabId);
          }
          return false;
        });
      },
    },
    {
      /* B-148 §3.5 (S44, v6→v7) — strip floating:<id> refs from owning
         groups' renderOrder. */
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        if (prunedByGroup.size === 0) return groups;
        const next = [...groups];
        let changed = false;
        for (const [gid, floatingIds] of prunedByGroup) {
          const idx = next.findIndex((g) => g.id === gid);
          if (idx < 0) continue;
          const g = next[idx];
          if (!Array.isArray(g.renderOrder) || g.renderOrder.length === 0) continue;
          const filtered = g.renderOrder.filter((ref) => {
            if (!ref.startsWith('floating:')) return true;
            const id = ref.slice('floating:'.length);
            return !floatingIds.has(id);
          });
          if (filtered.length !== g.renderOrder.length) {
            next[idx] = { ...g, renderOrder: filtered, updatedAt: Date.now() };
            changed = true;
          }
        }
        return changed ? next : groups;
      },
    },
  ]);
}

/**
 * Cascade-prune floating-group records whose `liveTabId` matches a now-closed
 * tab.
 *
 * Origin: `docs/findings/post-s41-pre-merge-triage.md` Issue A — pre-v1.35.0
 * hotfix bundle Fix A. Closes the orphan-record failure mode that caused
 * `MSG_REORDER_FLOATING_MEMBERS` to return ERR_RACE on every legitimate
 * floating-tab reorder once a sibling floating tab had been closed.
 *
 * Failure mode this closes: pre-fix, `chrome.tabs.onRemoved` released the
 * claim, dropped the inheritance marker, pruned the opener relationship, and
 * removed the LiveTabIndex entry — but DID NOT prune the closed tab's
 * `tj:floatingGroups` record. The record survived as an orphan. On the next
 * floating reorder, `reorderFloatingMembers`'s `storageBucketSize` parity
 * check (floating-groups.js:397-401) counted the orphan, the client-supplied
 * set excluded it (`buildFloatingMembers` skips records whose match resolves
 * to null), and parity failed → ERR_RACE → user-visible toast on every drag.
 *
 * Scope: only v4 records (those with a numeric `record.liveTabId` field) are
 * pruned by tabId match. Legacy v3 records (no `liveTabId`) are NOT pruned
 * here — at the moment of `chrome.tabs.onRemoved` the LiveTabIndex entry for
 * the closed tab is gone, so a v3 `(windowId, tabIndex)` geometry match
 * cannot be performed. Per the design's lazy-migration semantics, v3 records
 * are short-lived: cold-start `reassociateFloatingGroups` rewrites them to
 * v4 on first match. Records that fail to match any live tab on cold start
 * are left in place per B-018 AC9.
 *
 * Cross-reference: this fix self-applies B-141 (R3-spec-incorrect-finding)
 * to B-137 §66.1, which claimed to "structurally eliminate" Issue 3 from the
 * post-S40 spike. B-137 closed the `_resolveRecordIndexByTabId` half of the
 * race-toast trigger; the orphan-record half stayed open until this hotfix.
 *
 * @param {number} tabId — the closed live tabId (from `chrome.tabs.onRemoved`)
 * @returns {Promise<number>} count of records pruned (for testability —
 *   no console logging in the production path; callers may surface this in
 *   diagnostics if needed)
 */
export async function pruneFloatingGroupsByLiveTabId(tabId) {
  if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return 0;

  /* Pre-flight read — the common path on `chrome.tabs.onRemoved` is "tab
     held no floating-group record", so a read-only fast-path avoids
     invoking writeTransaction (and the AC4 storage-write invariant the
     synchronous tab-event handler path is asserted against in
     `tests/tab-events-no-storage-write.test.js`) when there is nothing to
     prune. The read path uses `readPartition` — same contract used by
     `reassociateFloatingGroups` above. */
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return 0;

  /* B-148 §3.5 — capture (groupId, floatingTabId) for the renderOrder
     strip in the second writeTransaction op. We pre-collect during
     the existing read-only pre-flight to avoid duplicating the scan. */
  const prunedByGroup = new Map();
  let willPrune = false;
  for (const entry of records) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.liveTabId === 'number'
      && Number.isFinite(entry.liveTabId)
      && entry.liveTabId === tabId) {
      willPrune = true;
      if (typeof entry.groupId === 'string' && typeof entry.floatingTabId === 'string') {
        if (!prunedByGroup.has(entry.groupId)) prunedByGroup.set(entry.groupId, new Set());
        prunedByGroup.get(entry.groupId).add(entry.floatingTabId);
      }
    }
  }
  if (!willPrune) return 0;

  let prunedCount = 0;
  await writeTransaction([
    {
      partition: PARTITION_FLOATING_GROUPS,
      mutator: (current) => {
        const arr = Array.isArray(current) ? current : [];
        const next = arr.filter((entry) => {
          if (!entry || typeof entry !== 'object') return true;
          if (typeof entry.liveTabId === 'number'
            && Number.isFinite(entry.liveTabId)
            && entry.liveTabId === tabId) {
            prunedCount += 1;
            return false;
          }
          return true;
        });
        return next;
      },
    },
    {
      /* B-148 §3.5 (S44, v6→v7) — strip floating:<id> refs from owning
         groups' renderOrder. prunedByGroup is populated by the pre-flight
         pass above. */
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        if (prunedByGroup.size === 0) return groups;
        const next = [...groups];
        let changed = false;
        for (const [gid, floatingIds] of prunedByGroup) {
          const idx = next.findIndex((g) => g.id === gid);
          if (idx < 0) continue;
          const g = next[idx];
          if (!Array.isArray(g.renderOrder) || g.renderOrder.length === 0) continue;
          const filtered = g.renderOrder.filter((ref) => {
            if (!ref.startsWith('floating:')) return true;
            const id = ref.slice('floating:'.length);
            return !floatingIds.has(id);
          });
          if (filtered.length !== g.renderOrder.length) {
            next[idx] = { ...g, renderOrder: filtered, updatedAt: Date.now() };
            changed = true;
          }
        }
        return changed ? next : groups;
      },
    },
  ]);
  return prunedCount;
}

/**
 * B-132 §65.4: cold-start re-population of inheritedTabs from
 * tj:floatingGroups. For every record whose match resolves AND whose
 * matched tabId is NOT already claimed, call markInherited(matchedTabId)
 * so reconcileClaims Phase 2 (background/tabs/tab-claims.js:169-178) skips
 * the URL-collision auto-claim. Mirrors the B-125 (§59.3) gate at
 * background/tabs/tab-claims.js:250 — runtime path — extended into the
 * cold-start claim path.
 *
 * Pure read+mark — writes ZERO storage. The mark on the module-scoped
 * `inheritedTabs` Set in tab-claims.js is the sole side effect.
 *
 * Algorithm (mirrors reassociateFloatingGroups §60.4.3):
 *   1. Read tj:floatingGroups records.
 *   2. POSITION MATCH per record: find live tab where windowId AND
 *      tabIndex match.
 *   3. URL FALLBACK if no position match: find live tab whose
 *      normalized URL equals the record's normalized URL.
 *   4. If matched AND matchedTabId NOT in claimsMirror.values(): call
 *      markInherited(matchedTabId).
 *   5. If matched AND already claimed: SKIP (reconcileClaims Phase 1
 *      preserved the claim; reassociateFloatingGroups will prune the
 *      now-stale record at floating-groups.js:145-153).
 *   6. If unmatched: SKIP (no live tab to mark).
 *
 * Invariant: this helper MUST run after buildLiveTabIndex resolves and
 * BEFORE reconcileClaims executes. See background/tabs/index.js for the
 * call-site ordering (between the Promise.all and reconcileClaims).
 *
 * B-132 §65.7 AC3 carve-out: this helper marks live tabs whose
 * tj:floatingGroups record resolves. It does NOT reconstruct pre-reload
 * opener-chain relationships (openerMap is ephemeral —
 * background/tabs/opener-chain.js:6-9 documents this as Chrome's own
 * contract). A NEW middle-click inside a former-floating tab post-reload
 * thus creates a new tab whose opener-walk returns null and which lives
 * in Open Tabs. This is the AC3 known-acceptable degradation; the user's
 * recourse is to re-spawn from the bookmarked parent.
 *
 * @returns {Promise<void>}
 */
export async function preMarkInheritedFromFloatingGroups() {
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return;

  const liveTabIndex = getLiveTabIndex();
  const claimsMirror = getClaimsMirror();
  const claimedTabIds = new Set(Object.values(claimsMirror));

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    let matchedTabId = null;

    // POSITION MATCH (mirrors floating-groups.js:124-130)
    for (const [tabId, entry] of liveTabIndex) {
      if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
        matchedTabId = tabId;
        break;
      }
    }

    // URL FALLBACK (mirrors floating-groups.js:132-143)
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

    // Mark only matched + unclaimed candidates. The already-claimed branch
    // is the reassociateFloatingGroups prune-target (§60.4.3 step 3).
    if (matchedTabId !== null && !claimedTabIds.has(matchedTabId)) {
      markInherited(matchedTabId);
    }
  }
}

/**
 * B-148 §3.6 (S44, v6→v7) — cold-start bootstrap + sweep of Group.renderOrder.
 *
 * Runs after reassociateFloatingGroups so the floating-group records are
 * already reconciled (resolved records pruned, stale liveTabIds rewritten,
 * duplicates merged). For each group:
 *
 * - Missing or empty renderOrder → bootstrap from items + floating-records
 *   sortOrder (saved-then-floating, each by sortOrder asc).
 * - Present renderOrder → filter out refs that don't resolve to any item
 *   or floating record (stale-ref sweep).
 *
 * Single PARTITION_GROUPS writeTransaction. Skips the write entirely when
 * no group changed (avoids storage churn on repeat cold starts where every
 * group is already bootstrapped + clean).
 *
 * @returns {Promise<void>}
 */
export async function bootstrapAndSweepRenderOrder() {
  const [groups, items, floatingRecords] = await Promise.all([
    readPartition(PARTITION_GROUPS),
    readPartition(PARTITION_ITEMS),
    readPartition(PARTITION_FLOATING_GROUPS),
  ]);
  if (!Array.isArray(groups) || groups.length === 0) return;

  /* Pre-index items + floating records by groupId for O(N) total work. */
  const itemsByGroup = new Map();
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it.groupId !== 'string') continue;
      if (!itemsByGroup.has(it.groupId)) itemsByGroup.set(it.groupId, []);
      itemsByGroup.get(it.groupId).push(it);
    }
  }
  const floatingByGroup = new Map();
  if (Array.isArray(floatingRecords)) {
    for (const fr of floatingRecords) {
      if (!fr || typeof fr.groupId !== 'string') continue;
      if (!floatingByGroup.has(fr.groupId)) floatingByGroup.set(fr.groupId, []);
      floatingByGroup.get(fr.groupId).push(fr);
    }
  }

  /* Build per-group resolution sets for the stale-ref sweep. */
  const itemIdsByGroup = new Map();
  for (const [gid, arr] of itemsByGroup) {
    itemIdsByGroup.set(gid, new Set(arr.map((it) => it.id)));
  }
  const floatingIdsByGroup = new Map();
  for (const [gid, arr] of floatingByGroup) {
    floatingIdsByGroup.set(gid, new Set(arr.map((fr) => fr.floatingTabId)));
  }

  /* Compute the new renderOrder for each group; track whether anything changed. */
  let anyChanged = false;
  const updatedGroups = groups.map((g) => {
    if (!g || typeof g.id !== 'string') return g;
    const groupItems = itemsByGroup.get(g.id) || [];
    const groupFloating = floatingByGroup.get(g.id) || [];
    const itemIds = itemIdsByGroup.get(g.id) || new Set();
    const floatingIds = floatingIdsByGroup.get(g.id) || new Set();

    let nextRenderOrder;
    if (!Array.isArray(g.renderOrder) || g.renderOrder.length === 0) {
      /* Bootstrap path. */
      const sortedItems = [...groupItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const sortedFloating = [...groupFloating].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      nextRenderOrder = [
        ...sortedItems.map((it) => 'item:' + it.id),
        ...sortedFloating.map((fr) => 'floating:' + fr.floatingTabId),
      ];
    } else {
      /* Sweep path — keep refs that resolve. */
      nextRenderOrder = g.renderOrder.filter((ref) => {
        if (typeof ref !== 'string') return false;
        if (ref.startsWith('item:')) {
          return itemIds.has(ref.slice('item:'.length));
        }
        if (ref.startsWith('floating:')) {
          return floatingIds.has(ref.slice('floating:'.length));
        }
        return false;
      });
    }

    /* Same array content → no change. */
    const before = Array.isArray(g.renderOrder) ? g.renderOrder : null;
    const sameLength = before && before.length === nextRenderOrder.length;
    const sameContent = sameLength && before.every((v, i) => v === nextRenderOrder[i]);
    if (sameContent) return g;
    anyChanged = true;
    return { ...g, renderOrder: nextRenderOrder, updatedAt: Date.now() };
  });

  if (!anyChanged) return;

  await writeTransaction([
    {
      partition: PARTITION_GROUPS,
      mutator: () => updatedGroups,
    },
  ]);
}
