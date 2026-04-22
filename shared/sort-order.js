/**
 * shared/sort-order.js — B-030 item reorder helpers.
 *
 * Pure, DOM-free, chrome-free helpers that compute `sortOrder` values for
 * item drag-reorder + cross-group move. The sidepanel uses these to build
 * the update spec dispatched via `MSG_BULK_REORDER_ITEMS`; the storage
 * handler then applies each update in a single writeTransaction and
 * normalises affected buckets to consecutive integers.
 *
 * Extracted per B-065 precedent so tests exercise the reorder logic
 * directly without a full DOM simulation.
 */

/**
 * @typedef {Object} Item
 * @property {string} id
 * @property {string|null} groupId
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} ReorderUpdate
 * @property {string} id
 * @property {number} sortOrder
 * @property {string|null} [groupId]   present only when the update crosses groups
 */

/**
 * Compute the ReorderUpdate[] spec for a drop event.
 *
 * Contract:
 *   - `items` is the CURRENT items snapshot (all groups).
 *   - `draggedId` is the item being dragged.
 *   - `destGroupId` is the target groupId (null for Ungrouped).
 *   - `destIndex` is the 0-based position within the destination group
 *     AFTER the dragged item is notionally removed from its source:
 *     0 = place at start, length = place at end.
 *
 * Behaviour:
 *   - Computes post-drop `sortOrder` values for the dragged item PLUS every
 *     item in the destination group (renumbered 0..N-1 via `idx * 1000`
 *     gaps — matches B-008 group-reorder's pattern).
 *   - When the drop crosses groups (source !== destination), ALSO renumbers
 *     the source group to remove the gap left by the dragged item.
 *   - Returns ONLY the minimal update set — items whose post-drop sortOrder
 *     (or groupId) differs from the pre-drop state. Items whose position is
 *     unaffected are omitted to keep the dispatch payload small.
 *
 * Edge cases:
 *   - Dragged id not found: returns [] (no-op — caller should handle upstream).
 *   - Same-position drop (source === destination AND destIndex === current
 *     position): returns [] (no-op).
 *   - Empty destination group with destIndex = 0: single update with
 *     sortOrder 0 and the new groupId.
 *
 * @param {Item[]} items
 * @param {string} draggedId
 * @param {string|null} destGroupId
 * @param {number} destIndex
 * @returns {ReorderUpdate[]}
 */
export function computeItemReorder(items, draggedId, destGroupId, destIndex) {
  if (!Array.isArray(items) || typeof draggedId !== 'string') return [];
  const dragged = items.find((it) => it && it.id === draggedId);
  if (!dragged) return [];

  const sourceGroupId = dragged.groupId ?? null;
  const normDestGroupId = destGroupId ?? null;
  const crossGroup = sourceGroupId !== normDestGroupId;

  /* Snapshot source-group items sorted by sortOrder, EXCLUDING the dragged
     item (we're placing it elsewhere or at a new position within this group). */
  const sourceItems = items
    .filter((it) => (it.groupId ?? null) === sourceGroupId && it.id !== draggedId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  /* Snapshot destination-group items sorted by sortOrder, EXCLUDING the
     dragged item (it's being re-inserted at destIndex). */
  const destItems = crossGroup
    ? items
      .filter((it) => (it.groupId ?? null) === normDestGroupId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : sourceItems;

  /* Clamp destIndex to [0, destItems.length]. */
  const clampedIdx = Math.max(0, Math.min(destIndex, destItems.length));

  /* Build the new destination order: destItems with dragged inserted at clampedIdx. */
  const newDestOrder = destItems.slice();
  newDestOrder.splice(clampedIdx, 0, dragged);

  /* Same-group, same-position no-op check. */
  if (!crossGroup) {
    const currentIdx = sourceItems.findIndex((it) => it.sortOrder > dragged.sortOrder);
    const currentPos = currentIdx === -1 ? sourceItems.length : currentIdx;
    if (currentPos === clampedIdx) return [];
  }

  const updates = [];

  /* Emit updates for destination order — idx × 1000 pattern (matches B-008). */
  for (let idx = 0; idx < newDestOrder.length; idx++) {
    const it = newDestOrder[idx];
    const newSortOrder = idx * 1000;
    const isDragged = it.id === draggedId;
    const needsGroupUpdate = isDragged && crossGroup;
    const needsSortUpdate = it.sortOrder !== newSortOrder;
    if (needsGroupUpdate || needsSortUpdate) {
      const update = { id: it.id, sortOrder: newSortOrder };
      if (needsGroupUpdate) update.groupId = normDestGroupId;
      updates.push(update);
    }
  }

  /* Emit updates for source group (cross-group only) — idx × 1000 pattern. */
  if (crossGroup) {
    for (let idx = 0; idx < sourceItems.length; idx++) {
      const it = sourceItems[idx];
      const newSortOrder = idx * 1000;
      if (it.sortOrder !== newSortOrder) {
        updates.push({ id: it.id, sortOrder: newSortOrder });
      }
    }
  }

  return updates;
}

/**
 * B-025 — compute the ReorderUpdate[] spec for a multi-item drop.
 *
 * Pure, DOM-free, chrome-free. Sibling to `computeItemReorder`. Mirrors its
 * structure with one change: the destination bucket has N items spliced in
 * (in the order provided) at `destIndex`. Source bucket renumbers the gap
 * left by the removed items.
 *
 * Contract:
 *   - `items` is the CURRENT items snapshot (all groups).
 *   - `draggedIds` are the ids being dragged as a single unit. Caller MUST
 *     pre-sort this array by current `sortOrder` so the drop preserves the
 *     selection's visual order (§37.9 F-7 — enforced by AC17 tests).
 *   - All `draggedIds` MUST share the same source `groupId` (enforced
 *     upstream at dragstart per D-4); this function does not revalidate.
 *   - `destGroupId` is the target groupId (null for Ungrouped).
 *   - `destIndex` is the 0-based position within the destination group
 *     AFTER the dragged items are notionally removed from their source.
 *
 * Behaviour:
 *   - Computes post-drop `sortOrder` values for every dragged item PLUS
 *     every item in the destination bucket (renumbered 0..N-1 via
 *     `idx * 1000` gaps — matches B-008 / B-030 pattern).
 *   - When the drop crosses groups (source !== destination), ALSO renumbers
 *     the source bucket to remove the gap left by the dragged items and
 *     emits `groupId` on each dragged update.
 *   - Returns ONLY the minimal update set — items whose post-drop sortOrder
 *     (or groupId) differs from the pre-drop state. Unchanged items are
 *     omitted to keep the dispatch payload small.
 *
 * Edge cases:
 *   - Empty `draggedIds` or any id not found in `items`: returns [] (no-op).
 *   - Same-group, same-position drop: sourceGroupId === destGroupId AND the
 *     positions `destIndex..destIndex+N-1` match the current positions of
 *     `draggedIds` in the source bucket → returns [].
 *   - Empty destination group with destIndex = 0: N updates in order.
 *
 * @param {Item[]} items
 * @param {string[]} draggedIds         All same sourceGroupId; pre-sorted by sortOrder.
 * @param {string|null} destGroupId
 * @param {number} destIndex
 * @returns {ReorderUpdate[]}
 */
export function computeMultiItemReorder(items, draggedIds, destGroupId, destIndex) {
  if (!Array.isArray(items) || !Array.isArray(draggedIds) || draggedIds.length === 0) return [];

  const draggedSet = new Set(draggedIds);
  const draggedItems = [];
  for (const id of draggedIds) {
    const it = items.find((x) => x && x.id === id);
    if (!it) return []; // unknown id → no-op (caller must pre-validate)
    draggedItems.push(it);
  }

  /* All dragged items must share a source group (D-4 precondition). If any
     dragged item has a different groupId, treat as an invalid payload and
     return []. */
  const sourceGroupId = draggedItems[0].groupId ?? null;
  for (let i = 1; i < draggedItems.length; i++) {
    if ((draggedItems[i].groupId ?? null) !== sourceGroupId) return [];
  }

  const normDestGroupId = destGroupId ?? null;
  const crossGroup = sourceGroupId !== normDestGroupId;

  /* Source bucket items EXCLUDING the dragged payload. */
  const sourceItems = items
    .filter((it) => (it.groupId ?? null) === sourceGroupId && !draggedSet.has(it.id))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  /* Destination bucket items EXCLUDING the dragged payload. For same-group
     drops the source filter above already excluded them; for cross-group
     they wouldn't be in the destination bucket anyway. */
  const destItems = crossGroup
    ? items
      .filter((it) => (it.groupId ?? null) === normDestGroupId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : sourceItems;

  /* Clamp destIndex to [0, destItems.length]. */
  const clampedIdx = Math.max(0, Math.min(destIndex, destItems.length));

  /* Same-group, same-position no-op. Compare against the pre-splice
     `sourceItems` (dragged already removed) — if the dragged payload's
     current positions in the full source bucket equal clampedIdx..clampedIdx+N-1
     we can detect that by checking that every dragged item's sortOrder
     falls into the same insertion gap. Simpler & equivalent check: if the
     full source-bucket ordering (with dragged re-inserted at clampedIdx)
     matches the pre-drop ordering, return []. */
  if (!crossGroup) {
    const preDropBucket = items
      .filter((it) => (it.groupId ?? null) === sourceGroupId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((it) => it.id);
    const postDropBucket = sourceItems.slice();
    postDropBucket.splice(clampedIdx, 0, ...draggedItems);
    const postIds = postDropBucket.map((it) => it.id);
    let identical = preDropBucket.length === postIds.length;
    if (identical) {
      for (let i = 0; i < postIds.length; i++) {
        if (preDropBucket[i] !== postIds[i]) { identical = false; break; }
      }
    }
    if (identical) return [];
  }

  /* Build the new destination order: destItems with all dragged items
     spliced in (preserving caller's order) at clampedIdx. */
  const newDestOrder = destItems.slice();
  newDestOrder.splice(clampedIdx, 0, ...draggedItems);

  const updates = [];

  /* Destination pass — idx * 1000 pattern. */
  for (let idx = 0; idx < newDestOrder.length; idx++) {
    const it = newDestOrder[idx];
    const newSortOrder = idx * 1000;
    const isDragged = draggedSet.has(it.id);
    const needsGroupUpdate = isDragged && crossGroup;
    const needsSortUpdate = (it.sortOrder ?? 0) !== newSortOrder;
    if (needsGroupUpdate || needsSortUpdate) {
      const update = { id: it.id, sortOrder: newSortOrder };
      if (needsGroupUpdate) update.groupId = normDestGroupId;
      updates.push(update);
    }
  }

  /* Source-bucket pass (cross-group only). */
  if (crossGroup) {
    for (let idx = 0; idx < sourceItems.length; idx++) {
      const it = sourceItems[idx];
      const newSortOrder = idx * 1000;
      if ((it.sortOrder ?? 0) !== newSortOrder) {
        updates.push({ id: it.id, sortOrder: newSortOrder });
      }
    }
  }

  return updates;
}

/**
 * @typedef {Object} GroupRow
 * @property {string} id
 * @property {string|null|undefined} parentId
 * @property {number} sortOrder
 */

/**
 * @typedef {Object} GroupReorderUpdate
 * @property {string} id
 * @property {number} sortOrder
 * @property {string|null} [parentId]   present only when the update changes parentage
 */

/**
 * B-031 — compute the GroupReorderUpdate[] spec for a group drag-drop.
 *
 * Pure, DOM-free, chrome-free. Parallel to `computeItemReorder` — different
 * bucketing (parentId, not groupId) and a third mode (`NEST` — changes
 * parentId in addition to sortOrder).
 *
 * Modes:
 *   - `REORDER_ABOVE` — insert dragged immediately before target within the
 *     target's sibling bucket. Same parentId as target.
 *   - `REORDER_BELOW` — insert dragged immediately after target within the
 *     target's sibling bucket. Same parentId as target.
 *   - `NEST` — dragged becomes a child of target; placed at the end of
 *     target's child list (sortOrder = childCount * 1000).
 *
 * Normalisation: target bucket is renumbered `idx * 1000` (matches B-008).
 * If the drop changes parentId (either NEST, or a REORDER that crosses
 * buckets), the source bucket is ALSO renumbered to close the gap.
 *
 * Returns the MINIMAL set — groups whose post-drop sortOrder (or parentId)
 * differs from the pre-drop state are included; unchanged groups are
 * omitted to keep the dispatch payload small.
 *
 * Edge cases:
 *   - Dragged id not found → `[]`.
 *   - Target id not found → `[]`.
 *   - `draggedId === targetId` → `[]` (self-drop is a no-op).
 *   - Same-position drop (same bucket, post-drop index matches current
 *     position) → `[]`.
 *   - Unknown `mode` → `[]`.
 *
 * @param {GroupRow[]} groups
 * @param {string} draggedId
 * @param {'REORDER_ABOVE'|'REORDER_BELOW'|'NEST'} mode
 * @param {string} targetId
 * @returns {GroupReorderUpdate[]}
 */
export function computeGroupReorder(groups, draggedId, mode, targetId) {
  if (!Array.isArray(groups) || typeof draggedId !== 'string' || typeof targetId !== 'string') {
    return [];
  }
  if (draggedId === targetId) return [];
  if (mode !== 'REORDER_ABOVE' && mode !== 'REORDER_BELOW' && mode !== 'NEST') return [];

  const dragged = groups.find((g) => g && g.id === draggedId);
  const target = groups.find((g) => g && g.id === targetId);
  if (!dragged || !target) return [];

  const sourceParentId = dragged.parentId ?? null;
  const byParentIdSorted = (pid) => groups
    .filter((g) => (g.parentId ?? null) === pid)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const updates = [];

  if (mode === 'NEST') {
    /* Dragged becomes a child of target. sortOrder = current child count.
       Affected buckets: target's children (dragged appended) + source bucket
       (dragged removed, must close gap — unless dragged was already in
       target's bucket, which is vacuous because a NEST into one's own parent
       would be a no-op … but NEST targets are filtered to parentId==null
       groups only via filterGroupParentCandidates, so reaching here means
       targetId is top-level). */
    const targetChildren = byParentIdSorted(targetId)
      .filter((g) => g.id !== draggedId);
    const newSortOrder = targetChildren.length * 1000;
    updates.push({ id: draggedId, sortOrder: newSortOrder, parentId: targetId });

    /* Renumber source bucket without dragged. */
    if (sourceParentId !== targetId) {
      const sourceSiblings = byParentIdSorted(sourceParentId)
        .filter((g) => g.id !== draggedId);
      for (let idx = 0; idx < sourceSiblings.length; idx++) {
        const g = sourceSiblings[idx];
        const nextSort = idx * 1000;
        if ((g.sortOrder ?? 0) !== nextSort) {
          updates.push({ id: g.id, sortOrder: nextSort });
        }
      }
    }
    return updates;
  }

  /* REORDER_ABOVE / REORDER_BELOW. Dragged lands in target's sibling bucket
     at `targetIndex + 0` (above) or `targetIndex + 1` (below). */
  const targetParentId = target.parentId ?? null;
  const crossBucket = sourceParentId !== targetParentId;

  const destBucket = byParentIdSorted(targetParentId).filter((g) => g.id !== draggedId);
  const targetIdx = destBucket.findIndex((g) => g.id === targetId);
  if (targetIdx < 0) return [];

  let insertIdx = mode === 'REORDER_ABOVE' ? targetIdx : targetIdx + 1;
  if (insertIdx < 0) insertIdx = 0;
  if (insertIdx > destBucket.length) insertIdx = destBucket.length;

  /* Same-bucket, same-position no-op check. */
  if (!crossBucket) {
    const currentIdx = byParentIdSorted(sourceParentId).findIndex((g) => g.id === draggedId);
    if (currentIdx === insertIdx) return [];
  }

  /* Build the new destination order with dragged inserted. */
  const newDest = destBucket.slice();
  newDest.splice(insertIdx, 0, dragged);

  for (let idx = 0; idx < newDest.length; idx++) {
    const g = newDest[idx];
    const nextSort = idx * 1000;
    const isDragged = g.id === draggedId;
    const needsParent = isDragged && crossBucket;
    const needsSort = (g.sortOrder ?? 0) !== nextSort;
    if (needsParent || needsSort) {
      const update = { id: g.id, sortOrder: nextSort };
      if (needsParent) update.parentId = targetParentId;
      updates.push(update);
    }
  }

  /* Renumber source bucket (cross-bucket only — same-bucket is already
     handled by the destination pass). */
  if (crossBucket) {
    const sourceSiblings = byParentIdSorted(sourceParentId).filter((g) => g.id !== draggedId);
    for (let idx = 0; idx < sourceSiblings.length; idx++) {
      const g = sourceSiblings[idx];
      const nextSort = idx * 1000;
      if ((g.sortOrder ?? 0) !== nextSort) {
        updates.push({ id: g.id, sortOrder: nextSort });
      }
    }
  }

  return updates;
}
