/**
 * shared/group-nesting.js — B-007 sub-group nesting helpers.
 *
 * Pure, DOM-free helpers shared between sidepanel.js (UI consumer) and
 * the B-007 test suite. Extraction follows the B-065 pattern — logic
 * that would otherwise be duplicated in tests lives here so production
 * and test paths exercise the same code.
 *
 * The storage layer (`background/storage/groups.js`) is the authority
 * for depth-1 and cycle rejection. These helpers are a UI pre-filter
 * that prevents users from constructing states the storage would reject
 * with ERR_DEPTH_EXCEEDED / ERR_CIRCULAR_REF.
 */

/**
 * @typedef {Object} GroupRecord
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {string|null|undefined} parentId
 * @property {number|undefined} sortOrder
 */

/**
 * Return the list of groups that are valid as a `parentId` target for the
 * group being created or edited. Sorted by `sortOrder` ascending.
 *
 * Excluded (in addition to the default "Top-level" option callers render
 * separately):
 *   - any group with `parentId != null` (already nested — depth-1 cap)
 *   - the group being edited itself (self-nest defence)
 *   - any group that already has at least one child (would become depth-2)
 *
 * @param {GroupRecord[]} groups       All groups in `_cachedGroups`
 * @param {GroupRecord|null} editingGroup  Group being edited (null in create mode)
 * @returns {GroupRecord[]}            Candidates, sorted by sortOrder
 */
export function filterGroupParentCandidates(groups, editingGroup) {
  if (!Array.isArray(groups)) return [];
  const idsWithChildren = new Set();
  for (const g of groups) {
    if (g && g.parentId != null) idsWithChildren.add(g.parentId);
  }
  return groups
    .filter((g) => g && g.parentId == null)
    .filter((g) => !editingGroup || g.id !== editingGroup.id)
    .filter((g) => !idsWithChildren.has(g.id))
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * Map structured group-CRUD error codes to inline-friendly strings for
 * display in the group dialog. Returns null for codes this helper does
 * not own so the caller can fall back to the raw `err.message`.
 *
 * @param {string} code
 * @returns {string|null}
 */
export function translateGroupError(code) {
  switch (code) {
    case 'ERR_DEPTH_EXCEEDED':
      return "Can't nest this group — groups can only be one level deep.";
    case 'ERR_CIRCULAR_REF':
      return "Can't nest a group under itself or one of its own sub-groups.";
    case 'ERR_NOT_FOUND':
      return 'Selected parent group no longer exists. Close this dialog and try again.';
    default:
      return null;
  }
}
