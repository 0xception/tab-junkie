/**
 * Shared ARIA-label builder for item rows (B-048 §31.6 / B-065 extraction).
 *
 * Pure function — no DOM, no side effects. Used by sidepanel row builders
 * and patch paths to compose a deterministic screen-reader label. The
 * AC7 concat order is fixed: active → live → drifted → audible → selected.
 * Labels are lowercase; only flags that are true are included. The row's
 * implicit accessible name (the title) is prepended so screen readers
 * announce the row as `"<title>, active tab, live tab, ..."`.
 *
 * Extracted to `shared/` in B-065 so production (`sidepanel/sidepanel.js`)
 * and the b048 regression tests both import the same source of truth —
 * eliminating the false-green risk of a test-file reproduction drifting
 * from the production helper.
 *
 * @param {Object|null|undefined} item - saved item with `title` (optional `url`)
 * @param {Object|undefined} live - `liveStates[item.id]` (may be undefined)
 * @param {Object|undefined|null} drifted - `driftRecords[item.id]` (truthy when drifted)
 * @param {boolean} selected - whether the row is currently in the selection set
 * @returns {string} composed aria-label; returns `'Untitled'` when item is null/undefined
 */
export function buildItemRowAriaLabel(item, live, drifted, selected) {
  /* M-3: null-item contract owned by the helper — callers no longer need
     their own guard, and a future call-site that forgets one still gets
     a well-formed label rather than an error. */
  if (!item) return 'Untitled';
  const title = item.title || 'Untitled';
  const parts = [title];
  if (live?.active) parts.push('active tab');
  if (live?.live) parts.push('live tab');
  if (drifted) parts.push('tab content has changed');
  if (live?.audible) parts.push('playing audio');
  if (selected) parts.push('selected');
  return parts.join(', ');
}
