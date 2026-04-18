/**
 * B-051 AC3 — Selection pruning helpers.
 *
 * Provides a pure utility for removing stale item IDs from a selection Set
 * before any bulk action is dispatched. Stale IDs arise when items are deleted
 * between the time the user builds a selection and the time the bulk action
 * fires (e.g. after a real-time `MSG_STATE_CHANGED` broadcast).
 *
 * This module has zero storage dependencies and may be imported by both the
 * service worker and UI surfaces.
 */

/**
 * Return a new Set containing only the IDs from `selection` that are present
 * in the `items` array. IDs that no longer exist in the collection are silently
 * dropped.
 *
 * The function is pure: neither the input Set nor the items array is mutated.
 *
 * @param {Set<string>} selection  — current selection set (item IDs)
 * @param {Array<{id: string}>} items — current item collection
 * @returns {Set<string>} pruned selection (may be smaller than the input)
 */
export function pruneSelection(selection, items) {
  const liveIds = new Set(items.map((it) => it.id));
  const pruned = new Set();
  for (const id of selection) {
    if (liveIds.has(id)) {
      pruned.add(id);
    }
  }
  return pruned;
}
