/**
 * Floating-group write mutations: seed / append / reorder / move.
 *
 * The record-authoring slice of the floating-groups subsystem (B-176 §74 A2
 * split). Every export here CREATES or REORDERS floating-group records (and
 * keeps the owning Group's `renderOrder` in sync); record removal lives in
 * `floating-groups-prune.js`.
 *
 * - `saveFloatingGroups` — verbatim bulk write (MSG_DEMOTE_ITEM + fixtures).
 * - `appendFloatingGroup` — single atomic append (B-121 §60.4.4 / B-137 §66.5).
 * - `reorderFloatingMembers` — atomic same-group reorder (B-134 §63.8.1).
 * - `moveFloatingTab` — atomic detach+attach across groups (B-134 §63.8.2).
 *
 * `_resolveRecordIndexByTabId` and `_floatingRecordCompare` are module-local
 * helpers shared by the reorder + move paths.
 */

import { writeTransaction } from '../storage/write-transaction.js';
import { readPartition, PARTITION_FLOATING_GROUPS, PARTITION_GROUPS, PARTITION_ITEMS, MAX_URL } from '../storage/partitions.js';
import { ulid } from '../storage/ids.js';
import { getLiveTabIndex } from './live-tab-index.js';
import { getParentItemId } from './floating-groups-schema.js';

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
      /* B-148 §3.5 (S44, v6→v7) — insert `floating:<floatingTabId>` into
         target Group's renderOrder. Skipped on dedup-no-op path
         (didAppend === false). Defensive: if the group has been deleted
         between the SW read and now, findIndex returns -1 and we skip.

         B-148 hotfix (S44 polish): caller may pass an OPTIONAL
         `entry.insertAfterRef` (`'item:<id>'` or `'floating:<id>'`) to
         anchor the new ref directly after a specific row — used by the
         opener-chain inheritance path so a new tab opened from page X
         lands UNDER X visually, not at the end of the floating zone.
         When the anchor isn't found in renderOrder OR no anchor was
         supplied, fall back to append-at-end (legacy behavior). */
      partition: PARTITION_GROUPS,
      mutator: (groups) => {
        if (!didAppend) return groups;
        const idx = groups.findIndex((g) => g.id === stamped.groupId);
        /* Intentional for the '__toplevel__' sentinel: there is NO tj:groups record
           by design — renderOrder is runtime-derived (§79.3) — so idx < 0 here is
           correct and expected for the sentinel, not only the "group deleted mid-write"
           race the block comment above describes. */
        if (idx < 0) return groups;
        const g = groups[idx];
        const ref = 'floating:' + stamped.floatingTabId;
        const renderOrder = Array.isArray(g.renderOrder) ? [...g.renderOrder] : [];
        let insertAt = renderOrder.length; /* default: append-at-end */
        if (typeof entry.insertAfterRef === 'string' && entry.insertAfterRef.length > 0) {
          const anchorIdx = renderOrder.indexOf(entry.insertAfterRef);
          if (anchorIdx >= 0) insertAt = anchorIdx + 1;
        }
        renderOrder.splice(insertAt, 0, ref);
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
 * mutators. ATTACH or MOVE_FLOATING into a NAMED group with zero saved items
 * fails (the new record needs a parent bookmark to anchor under, §63.15).
 *
 * B-197 §79.4 — ATTACH/MOVE to the TOP-LEVEL region: `targetGroupId ===
 * '__toplevel__'`. There is no group to derive a single parent from (many
 * ungrouped bookmarks may exist), so the caller supplies the specific
 * top-level bookmark to anchor under via `targetParentItemId`. The written
 * record carries `groupId: '__toplevel__'` (the §79.1.3 sentinel) + that
 * parent. This loose→anchored / re-anchor transition is non-destructive and
 * reversible via DETACH — no confirmation dialog (§79.9 Q4).
 *
 * @param {number} tabId
 * @param {string|null} sourceGroupId
 * @param {string|null} targetGroupId
 * @param {number} insertIndex
 * @param {string} [targetParentItemId]  REQUIRED when `targetGroupId ===
 *   '__toplevel__'`: the id of the ungrouped saved item to anchor under.
 *   Ignored for named-group targets (parent derived from the group).
 * @returns {Promise<boolean>}  true on success; false on race conditions:
 *   live tab closed mid-call, source record missing, ATTACH/MOVE_FLOATING
 *   to a named group with no saved items, or a top-level ATTACH whose
 *   `targetParentItemId` does not resolve to an existing ungrouped item.
 */
export async function moveFloatingTab(tabId, sourceGroupId, targetGroupId, insertIndex, targetParentItemId) {
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
    const arr = Array.isArray(items) ? items : [];
    if (targetGroupId === '__toplevel__') {
      /* B-197 §79.4 — top-level target: there is no group bucket to derive a
         single parent from, so the caller MUST name the specific ungrouped
         bookmark via `targetParentItemId`. Validate it exists AND is ungrouped
         (`groupId === null`); a grouped or missing id is rejected. */
      if (typeof targetParentItemId !== 'string' || targetParentItemId.length === 0) {
        return false;
      }
      const parent = arr.find((it) => it && it.id === targetParentItemId
        && (it.groupId === null || it.groupId === undefined));
      if (!parent) return false; // top-level parent must exist and be ungrouped
      newParentItemId = parent.id;
    } else {
      const candidates = arr.filter((it) => it && it.groupId === targetGroupId);
      if (candidates.length === 0) return false; // ATTACH/MOVE to empty named group rejected
      candidates.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      newParentItemId = candidates[0].id;
    }
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
