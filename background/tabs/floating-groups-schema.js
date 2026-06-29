/**
 * Floating-group schema field-reading helpers.
 *
 * The lowest-level slice of the floating-groups subsystem (B-176 §74 A2
 * split). Holds the pure field-reading helper shared by every other
 * floating-groups module, so the read contract is defined in exactly one
 * place with no dependency on the storage or resolver layers (keeps the
 * import graph acyclic — every concern module imports this base, this base
 * imports nothing).
 *
 * B-121 (§60.4) — schema v2: each record carries a synthetic `floatingTabId`
 * (ulid) as its storage identity, plus the parent saved item's id under
 * `parentItemId`. Pre-S38 records used `itemId` instead of `parentItemId`;
 * both schemas are tolerated on read.
 */

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
