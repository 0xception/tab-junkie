/**
 * Floating-group prune + onReplaced-remap helpers.
 *
 * The destructive / record-removal slice of the floating-groups subsystem
 * (B-176 §74 A2 split). Every path here removes floating-group records (or,
 * for `remapFloatingGroupsLiveTabId`, rewrites the runtime `liveTabId` hint
 * in place) and keeps the owning Group's `renderOrder` in sync.
 *
 * - `pruneResolvedFloatingGroups` — cold-start prune of resolved records +
 *   the B-137 §66.7.5 lazy `liveTabId` rewrite (called by reassociate).
 * - `pruneFloatingGroupsByParentItemId` — cascade prune when a parent saved
 *   item is deleted (B-121 §60.8).
 * - `pruneFloatingGroupsByLiveTabId` — cascade prune when a live tab closes
 *   (post-S41 Fix A).
 * - `remapFloatingGroupsLiveTabId` — `chrome.tabs.onReplaced` liveTabId remap
 *   (B-164 §69.3.1 table-5).
 */

import { writeTransaction } from '../storage/write-transaction.js';
import { readPartition, PARTITION_FLOATING_GROUPS, PARTITION_GROUPS } from '../storage/partitions.js';
import { getParentItemId } from './floating-groups-schema.js';

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
 * B-164 §69.3.1 table-5 — atomic remap of `liveTabId` on
 * `chrome.tabs.onReplaced`.
 *
 * Mirrors the `pruneFloatingGroupsByLiveTabId` shape (read-only pre-flight
 * fast-path; conditional `writeTransaction` only when at least one record
 * matches). Where the prune path DELETES the record, this remap path
 * UPDATES the `liveTabId` field in place — the floating-group record's
 * identity (`floatingTabId` ulid) survives the rotation; only the runtime
 * hint pointing at the live tab is rewritten. No `renderOrder` strip is
 * needed because the group's `floating:<floatingTabId>` ref is keyed on
 * the unchanged identity field, not on `liveTabId`.
 *
 * Fire-and-forget pattern (B-132 graceful-degradation precedent at
 * `background/tabs/index.js:58-62`): if the `writeTransaction` fails
 * (transient storage error), the next cold-start `reassociateFloatingGroups`
 * sweep at `floating-groups.js:200-234` will re-resolve via position match
 * (tier b) or URL fallback (tier c). The in-memory `LiveTabIndex` is updated
 * independently via `onUpdated`/`onCreated` on the new tabId, so the
 * runtime resolver is not blocked on the storage write.
 *
 * @param {number} removedTabId — the dead handle (pre-discard id)
 * @param {number} addedTabId — the new id Chromium rotated to
 * @returns {Promise<number>} count of records updated (for testability)
 */
export async function remapFloatingGroupsLiveTabId(removedTabId, addedTabId) {
  if (typeof removedTabId !== 'number' || !Number.isFinite(removedTabId)) return 0;
  if (typeof addedTabId !== 'number' || !Number.isFinite(addedTabId)) return 0;
  if (removedTabId === addedTabId) return 0;

  /* Pre-flight read — the common path on `chrome.tabs.onReplaced` is "tab
     held no floating-group record", so a read-only fast-path avoids
     invoking writeTransaction when there is nothing to update. Mirrors
     the `pruneFloatingGroupsByLiveTabId` pre-flight at :970-971. */
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return 0;

  let willUpdate = false;
  for (const entry of records) {
    if (!entry || typeof entry !== 'object') continue;
    if (typeof entry.liveTabId === 'number'
      && Number.isFinite(entry.liveTabId)
      && entry.liveTabId === removedTabId) {
      willUpdate = true;
      break;
    }
  }
  if (!willUpdate) return 0;

  let updatedCount = 0;
  /* S44 retro action #3 — blind-replace mutator anti-pattern guard.
     The mutator MUST use the `current` snapshot inside the closure (NOT
     a pre-computed array from the pre-flight read above) to avoid
     overwriting concurrent writes that landed between read and write.
     The pre-flight read is ONLY consulted for the fast-path decision; the
     actual rewrite operates on `current` inside writeTransaction. */
  await writeTransaction([{
    partition: PARTITION_FLOATING_GROUPS,
    mutator: (current) => {
      const arr = Array.isArray(current) ? current : [];
      return arr.map((entry) => {
        if (!entry || typeof entry !== 'object') return entry;
        if (typeof entry.liveTabId === 'number'
          && Number.isFinite(entry.liveTabId)
          && entry.liveTabId === removedTabId) {
          updatedCount += 1;
          return { ...entry, liveTabId: addedTabId };
        }
        return entry;
      });
    },
  }]);
  return updatedCount;
}
