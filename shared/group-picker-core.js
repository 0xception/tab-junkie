/**
 * Shared pure-logic core for the group picker modal (B-029 / B-065 extraction).
 *
 * The picker splits naturally into two halves:
 *   1. Pure data: build the row descriptors from cached groups/items/live
 *      states, then filter them by a lowercase query string (this file).
 *   2. DOM mutation: render the rows into the picker listbox, apply the
 *      highlight, and wire keyboard navigation (stays in `sidepanel.js`).
 *
 * Extracted to `shared/` in B-065 so production (`sidepanel/sidepanel.js`)
 * and the b029 regression tests both import the same source of truth —
 * eliminating the false-green risk of a test-file reproduction drifting
 * from the production helper.
 *
 * No DOM, no chrome.* calls, no module-level mutable state — callers pass
 * the caches in explicitly via an options bag.
 */

/**
 * @typedef {Object} PickerRow
 * @property {string|null} id - group id, or `null` for the Ungrouped sentinel
 * @property {string} name - display name
 * @property {string|null} color - group color (null for Ungrouped)
 * @property {string} breadcrumb - `"Parent / Child"` for sub-groups, `""` otherwise
 * @property {number} savedCount - count of saved items in this group
 * @property {number} openCount - count of live (open-tab) items in this group
 * @property {string} searchKey - pre-lowercased name (+ breadcrumb) for filter matching
 */

/**
 * Build the full list of group-picker rows from cached data.
 *
 * Sub-groups render inline with a "Parent / Child" breadcrumb (AC2).
 * Counts are computed in a single O(n) pass over items (AC10).
 * The row whose id matches `sourceGroupId` is excluded (AC5). Pass the
 * sentinel `'__toplevel__'` to exclude the Ungrouped pinned row (B-196 fix-round
 * F-4: aligned to the merged top-level region's sentinel; this is only the
 * internal SOURCE-exclusion / count-bucket key — the DESTINATION row is still
 * keyed by `null`).
 *
 * @param {Object} opts
 * @param {Array<Object>} opts.groups - `_cachedGroups` snapshot
 * @param {Array<Object>} opts.items - `_cachedItems` snapshot
 * @param {Object<string, Object>} opts.liveStates - `_cachedLiveStates` snapshot
 * @param {string|null} opts.sourceGroupId - group id to exclude (AC5)
 * @returns {PickerRow[]}
 */
export function buildGroupPickerRows({ groups, items, liveStates, sourceGroupId }) {
  const sortedGroups = [...groups].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const groupById = new Map(sortedGroups.map((g) => [g.id, g]));

  /* Single-pass counts per groupId (AC10 — O(n) over items). */
  const savedByGroup = new Map();
  const openByGroup = new Map();
  for (const it of items) {
    const key = it.groupId || '__toplevel__';
    savedByGroup.set(key, (savedByGroup.get(key) || 0) + 1);
    const ls = liveStates[it.id];
    if (ls && ls.live) {
      openByGroup.set(key, (openByGroup.get(key) || 0) + 1);
    }
  }

  const rows = [];

  /* Ungrouped pinned first (AC2). Source exclusion allows '__toplevel__' as
     a sentinel — '__toplevel__' is never a real group id so this is safe.
     B-196 fix-round F-4: the DESTINATION row stays keyed by `null` (the
     "move to top level" concept); the sentinel is only the SOURCE-exclusion +
     count-bucket key, aligned to the merged top-level region's id. */
  if (sourceGroupId !== '__toplevel__') {
    rows.push({
      id: null,
      name: 'Ungrouped',
      color: null,
      breadcrumb: '',
      savedCount: savedByGroup.get('__toplevel__') || 0,
      openCount: openByGroup.get('__toplevel__') || 0,
      searchKey: 'ungrouped',
    });
  }

  for (const g of sortedGroups) {
    if (g.id === sourceGroupId) continue; /* AC5 */
    let breadcrumb = '';
    if (g.parentId) {
      const parent = groupById.get(g.parentId);
      /* Silent fallback on orphaned child: breadcrumb stays empty if the
         parent group is missing from the cache. Matches the pre-B-065
         behaviour; orphans surface via the data layer's validation path,
         not via the picker row. */
      if (parent) breadcrumb = parent.name + ' / ' + g.name;
    }
    const lowerName = (g.name || '').toLowerCase();
    const lowerBread = breadcrumb.toLowerCase();
    rows.push({
      id: g.id,
      name: g.name || '',
      color: g.color || null,
      breadcrumb,
      savedCount: savedByGroup.get(g.id) || 0,
      openCount: openByGroup.get(g.id) || 0,
      searchKey: breadcrumb ? lowerName + ' ' + lowerBread : lowerName,
    });
  }

  return rows;
}

/**
 * Normalize a filter query to the lowercase form used in row `searchKey`s.
 * Exposed so DOM-side filter code and test code agree on trimming/casing.
 *
 * @param {string|null|undefined} query
 * @returns {string}
 */
export function normalizeGroupPickerQuery(query) {
  return (query || '').trim().toLowerCase();
}

/**
 * Single-row visibility predicate — the atom of both the pure-data filter
 * below AND the DOM-side `_applyGroupPickerFilter` loop in `sidepanel.js`.
 * Single source of truth for the filter-match rule (B-065 M-1 fix).
 *
 * @param {string|null|undefined} searchKey - pre-lowercased row key
 * @param {string} normalizedQuery - output of `normalizeGroupPickerQuery`
 * @returns {boolean}
 */
export function matchesGroupPickerRow(searchKey, normalizedQuery) {
  if (!normalizedQuery) return true;
  return (searchKey || '').includes(normalizedQuery);
}

/**
 * Pure-logic half of `_applyGroupPickerFilter`: given the full row list and
 * a raw query, return the subset that should remain visible. The DOM-side
 * half in `sidepanel.js` translates this into `row.hidden` toggles and a
 * highlight-reset, which stays in the sidepanel because it mutates real
 * DOM and the `_groupPickerHighlightIndex` cursor.
 *
 * @param {PickerRow[]} rows
 * @param {string|null|undefined} query
 * @returns {PickerRow[]}
 */
export function applyGroupPickerFilter(rows, query) {
  const lower = normalizeGroupPickerQuery(query);
  return rows.filter((row) => matchesGroupPickerRow(row.searchKey, lower));
}
