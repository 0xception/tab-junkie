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
