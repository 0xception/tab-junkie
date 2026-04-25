# Changelog

All notable changes to Tab Junkie are documented in this file.

## [Unreleased]

## [1.23.0] — 2026-04-24

### Added
- **New tab page replacement** — every new tab opens to the Tab Junkie grid: a wide, multi-column view of your bookmarks organized by group. Includes a web search input (powered by your browser's default search engine), a quick-filter input that narrows the grid in real time with `<mark>` highlights, and live-state indicators (active / live / drifted / audible) on every bookmark row. Sub-groups render indented under their parent. Keyboard nav: `/` focuses the search input, Tab cycles search → filter → grid, Enter activates a row, click navigates to an existing tab or opens a new one.
- **Settings panel** — sidepanel header gains a gear-icon button that opens a Settings dialog. Fully keyboard-accessible (Tab cycles, Escape closes, focus restores to the gear). The dialog hosts new preference rows added in this release.
- **Display mode preference** — Settings → "Display mode": choose **Side Panel** (default) or **Standalone Window** to control which surface opens when you press Alt+J or click the toolbar icon. Alt+Shift+J always opens the standalone window regardless of pref.
- **Sub-group auto-collapse preference** — Settings → "Groups": opt-in toggle. When ON, collapsing a parent group also collapses all its sub-groups in one action. Default OFF (preserves existing independent-collapse behavior).

### Changed
- **`hashItem` cross-module fix** — preference broadcasts now propagate consistently to the new tab page (inherited from the S28 fix to the index hashing).

### Removed
- **New tab page toggle (B-039)** — *dropped pre-merge.* Manifest V3 does not allow runtime removal of `chrome_url_overrides.newtab`, so an "off" state could not actually return the new tab page to the browser default — only redirect to `about:blank` or render a custom disabled page. Rather than ship a toggle that doesn't deliver what users expect, the toggle is removed and the new tab page is always-on while Tab Junkie is installed. To restore your browser's default new tab behavior, disable or uninstall Tab Junkie via your browser's extension management page (`edge://extensions` or `chrome://extensions`).

## [1.22.0] — 2026-04-23

### Added
- **Standalone window mode** — press **Alt+Shift+J** from any tab to open Tab Junkie in a detachable popup window sized 1200×800. If the standalone is already open, the shortcut focuses the existing window instead of opening a duplicate. The window shows the same content as the side panel and syncs in real time.
- **Popup "Open side panel" button** — the quick-search popup (Alt+J) now has a button below the results that opens the side panel in the current window. Full keyboard flow: Alt+J → Tab → Enter.
- **Keyboard shortcuts user manual** — new reference page listing all defaulted shortcuts (Alt+J, Alt+K, Alt+Shift+J) with instructions for remapping via `edge://extensions/shortcuts` or `chrome://extensions/shortcuts`.

### Fixed
- **Cross-surface reorder sync** — when the side panel and standalone window (or multiple Tab Junkie surfaces) are open simultaneously, dragging an item to reorder it within the same group now reflects on all open surfaces within seconds. Previously, same-group reorders only updated the originating window; remote surfaces showed the stale order.

## [1.21.0] — 2026-04-23

### Added
- **Group jump popup** — press **Alt+K** from any tab to open a lightweight group-jump popup. Type to fuzzy-match group names; sub-groups show their parent breadcrumb. Arrow keys navigate, Enter drills into a group to see its bookmarks and sub-groups, Back button (or Left-arrow at the input) returns to the group list. Each row shows `(N bookmarks · M open)` counts at a glance. Keyboard-first throughout; Escape dismisses. The shortcut is customizable via `edge://extensions/shortcuts` (or `chrome://extensions/shortcuts`).

## [1.20.0] — 2026-04-23

### Added
- **Quick-search popup** — press **Alt+J** from any tab to open a lightweight search popup. Type to fuzzy-match across all your saved bookmarks and open tabs, grouped into two sections with favicon, title, URL, and group breadcrumb. Arrow keys navigate, Enter opens or focuses the item, Escape dismisses. With an empty query, the popup shows your most recently opened items (up to 20). The shortcut is customizable via `edge://extensions/shortcuts` (or `chrome://extensions/shortcuts`).

## [1.19.0] — 2026-04-22

### Fixed
- **Multiple sub-groups under one parent** — you can now nest several sub-groups under the same parent group (e.g., "Work" containing "Meetings", "Projects", "Admin"). Previously, once a group had any sub-group, adding more sibling sub-groups was silently blocked in both the group-edit dialog and the drag-to-nest flow. The one-level nesting depth cap is unchanged.

### Changed
- **Drag drop-zone visuals refined** — the reorder line (drop between groups) and nest highlight (drop inside a group) are now easier to distinguish: the reorder line is thicker with a soft accent glow, the nest highlight has stronger contrast with an inner outline. A small ±2 px hysteresis band at the zone boundaries reduces flicker when moving the pointer quickly across the 25/75% thresholds.

## [1.18.0] — 2026-04-22

### Added
- **Multi-item drag** — select several bookmarks with Ctrl/Cmd+Click or Shift+Click, then drag them all at once. A count badge on the ghost shows how many items are in flight. They land at the drop position in their original relative order, whether you drop within the same group, into a different group, or into the Ungrouped section.
- **Group drag-reorder and nesting** — drag a group header to reorder top-level groups or nest one group inside another (one level deep). Drop onto the outer quarter of a target header to reorder; drop onto the middle half to nest. Visual rejection feedback appears for invalid targets — circular nesting, a second level of nesting, or dropping a group onto itself.
- **Auto-scroll during drag** — move the pointer within 60 px of the top or bottom edge of the bookmark list while dragging and the list scrolls automatically in that direction. Scroll speed ramps up the closer your pointer is to the edge and stops when you move away.

### Fixed
- **Drop into empty groups** — dragging a bookmark (single or multi-select) into a group that contains no items now places the item there correctly. Previously the drop was silently ignored.
- **Multi-drag ghost in Edge** — the drag ghost for multi-item drags now renders visibly in Edge. An off-screen positioning issue was causing the ghost snapshot to appear blank on some layouts.

## [1.17.0] — 2026-04-21

### Added
- **Drag-and-drop item reorder** — drag any bookmark row up or down within its group to reorder, or across groups to move it. Drop onto the **Ungrouped** section to ungroup an item. A horizontal insertion indicator shows exactly where the item will land; release to commit, or press **Escape** to cancel without any change. The new order persists across browser restarts.
- **Drag-to-expand collapsed groups** — while dragging a bookmark, hover over a **collapsed** group's header for about half a second and the group auto-expands so you can drop into it. Fast passes over the header don't trigger the expansion — you have to dwell. The expansion sticks after you drop (persists across reload).
- **Drag-to-demote saved+live items** — drag a bookmark that's currently open as a live tab onto the **Open Tabs** section, and the bookmark is removed (demoted) while the tab stays open. The section highlights as a valid drop target only for saved+live items — saved-only drags are silently rejected. Success toast confirms: "Bookmark removed — tab stays open."

### Internal
- Re-architected drag infrastructure after Sprint 22's revert. `dragover` handler is now 3 statements only (no synchronous layout reads, no DOM mutations) — all work runs in a `requestAnimationFrame` callback. Bounding-rect cache built once at dragstart, invalidated only on container scroll. Transform-positioned indicator avoids reparenting during drag. Broadcast-race guard checks the items-generation counter at drop time; re-fetches if a background state change landed mid-drag.
- New `bulkReorderItems` storage function + `MSG_BULK_REORDER_ITEMS` message (per-item `sortOrder` + optional `groupId` updates in a single `writeTransaction`). Shared `computeItemReorder` helper handles the drop-position math — pure, DOM-free, testable.

### Process
- Sprint 22's retro HIGH action items were applied explicitly at S23 kickoff. Pre-merge UAT caught two blocker-grade regressions (invisible indicator + same-group reorder no-op); both fixed before PR merge. Full retrospective in `docs/SPRINT_ARCHIVE.md` Sprint 23 entry.

## [1.16.0] — 2026-04-20

### Added
- **New group button in the sidepanel header** — a folder-with-plus icon next to the bookmark-plus button opens the group create dialog directly. Previously you could only create additional groups through the Group Picker modal's empty-state CTA, which hid once you had at least one group. Now the `+` group button is always visible.

### Changed
- **Import success toast** now shows the plain-language repair breakdown in-line (matching the preview dialog). Previously you saw a count ("2 repairs") without knowing which repairs happened; now you get "2 repairs: 1 group loop fixed, 1 item with no group moved to Ungrouped" right in the toast.
- **Filter input** has a 256-character length cap so a pathological long-query paste can't force unbounded comparisons against the search index. Default UX unchanged — just a ceiling for defense.

### Internal
- **JSON import `breakCycles` hardening**: adversarial backups with very deep parentId chains (≥ 1000 levels) now terminate in bounded time — the cycle walk caps at 1000 and falls through to the orphan-repair pass. Fabricated-ancestor references (pointing at ids not in the input) were already short-circuited; now also covered by a dedicated test.

### Process
- **R1 AC authoring template** gains a mandatory "DoR Gate 7 check" subsection — every AC block states up front whether destructive-action confirmation is retained, waived, or N/A, with rationale. Prevents edge-case ACs from being the only place retention status is documented (Sprint 20 B-007 AC15 near-miss). See `CLAUDE.md § Round 1: Definition`.

## [1.15.0] — 2026-04-20

### Added
- **Sub-group nesting**: you can now nest a group one level deep inside another group. The group dialog has a new **Parent group** picker — set it when you create a group, or change it later by editing. Nested groups render indented under their parent in the side panel. Attempting to nest a group that itself has children, or to form a cycle, shows a plain-language inline error and leaves the dialog open. Deleting a parent promotes its children back to the top level (no data loss). One level of nesting is the cap — a deliberate design choice to keep the tree scannable.

### Internal
- Pre-existing TODO in the JSON import validator (deferred migration-hook marker) removed; the work is now tracked as a dedicated backlog item (B-076) for activation when a real migration step ships.
- Fuzzy search index's `byId` lookup restructured from a `Map` to a frozen plain object. Access is simpler and mutation is now caught at runtime (strict-mode `TypeError`). No user-visible behaviour change.

### Process
- Sprint Readiness Gate 6 now includes an explicit deps-resolved check: every in-scope item's BACKLOG.md `Dependencies` column entries must be `done` OR also in the same sprint. Prevents mid-sprint dependency-gap deferrals like Sprint 19's B-046. See `CLAUDE.md § Gate 6: Sprint Readiness`.
- Definition of Ready now requires destructive-action confirmation retention/waiver to be explicitly stated in ACs for carved-out edge-case paths (prefs-only, zero-match, partial-input, etc.). Prevents literal AC readings from silently dropping confirmation dialogs. See `CLAUDE.md § Definition of Ready`.
- R2 Correctness Checklist backfilled with C-6 (permission minimization) and C-7 (allow-list direction) — closing the historical numbering gap between C-5 and C-8/C-9. See `CLAUDE.md § Round 2: Architecture`.

## [1.14.0] — 2026-04-19

### Added
- Import duplicate-handling override: a **Skip duplicates in this file** checkbox on the Import preview dialog (both HTML and JSON) lets you choose per-import whether to de-duplicate rows with the same URL. Default is **on** (matches prior behaviour). Your choice is remembered as a preference and pre-applied to the next import.
- Preferences-only JSON backup restore: importing a JSON backup that contains only preferences (zero items and zero groups) now opens a dedicated confirmation dialog ("This backup contains no bookmarks — only preferences. Importing will overwrite your current preferences.") with **Cancel** as the default button. Previously such backups were rejected with "Backup contains no bookmarks."

### Improved
- Side panel search and filter are now near-instant, even with large bookmark collections. Typing in the filter bar stays snappy whether you have 50 items or 1,000+.
  - Opening the side panel paints immediately — a skeleton appears right away and your items fill in within a blink, even on large collections.
  - Adding, editing, or deleting bookmarks no longer causes a perceptible pause the next time you search.
  - No change to the filter UI, keyboard shortcuts, or what it matches — only speed.
- Import repair-summary text rewritten in plain language. Engineering-level strings like "broke 2 parent cycles" became "fixed 2 folders whose parent link formed a loop"; "reparented 3 orphaned items to Ungrouped" became "moved 3 bookmarks whose group was missing to Ungrouped."
- JSON import preview now shows a format-specific heading ("Replace all bookmarks with JSON backup?") instead of the cross-format heading shared with HTML import.

### Process
- R2 Correctness Checklist: added C-8 (SW-context feasibility) and C-9 (empty-state design enumeration) from Sprint 18 retro. See `CLAUDE.md § Round 2: Architecture`.

## [1.13.0] — 2026-04-19

### Added
- Import HTML: a new **Import HTML** button in the side panel header reads a standard Netscape-format bookmarks file (the same `.html` format that Chrome, Edge, Firefox, and Safari produce) and brings every folder and bookmark into Tab Junkie. After you pick a file, a preview dialog shows the filename, how many bookmarks and folders will be imported, any malformed or duplicate entries that will be skipped, and a clearly labelled warning that the import **replaces** every existing group and bookmark. **Cancel** is the default button — you have to explicitly click **Replace all** to commit. The import is atomic: if the commit fails for any reason, your existing data stays intact.
  - Top-level folders become top-level groups; one-level-nested folders become sub-groups; folders nested deeper are flattened into sub-groups whose names are joined with ` / ` so the original path is preserved.
  - Loose bookmarks at the root of the file land in the **Ungrouped** section.
  - Group colors are assigned deterministically from the Tab Junkie palette based on folder name, so re-importing the same file produces the same colors.
  - Original `ADD_DATE` / `LAST_MODIFIED` timestamps are preserved when the file includes them.
  - Duplicate URLs within the file are de-duplicated; `javascript:` and `data:` URLs are skipped for safety; all other supported schemes (`http`, `https`, `file`, `chrome`, `edge`, `chrome-extension`, `about`, `view-source`) are imported.
  - Favicons are re-captured in Tab Junkie at first use; they are not read from the imported file.
  - Files up to 5 MiB are accepted; larger files are rejected upfront with a clear inline toast.
- Import JSON: a new **Import JSON** button in the side panel header restores a Tab Junkie-native `.json` backup (produced by **Export JSON**) as a lossless round trip — groups, group colors, timestamps, and preferences come back exactly as they were exported. The preview dialog shows the filename, group and bookmark counts, and a short repair summary if the importer had to fix structural defects in the backup; **Cancel** is the default button, and the import commits atomically so existing data is preserved on any failure.
  - Auto-repair for backups with missing group parents, circular group references, duplicate internal IDs, or items whose group no longer exists — repairs are summarised in the preview dialog before you commit.
  - Preferences in the backup (theme, side-panel settings) are applied on import; missing or malformed preferences fall back to Tab Junkie defaults instead of rejecting the file.
  - Schema-version gate: backups from a newer Tab Junkie version are refused with a clear "update Tab Junkie first" message; backups from older versions run through any registered migrations before importing.
  - Every imported bookmark and group is assigned a fresh internal ID; the content you see is preserved exactly across a round trip, but internal identifiers change by design.
  - Same URL-scheme rules as HTML import: `http`, `https`, `file`, `chrome`, `edge`, `chrome-extension`, `about`, and `view-source` are imported; `javascript:` and `data:` are skipped. Duplicate URLs within the backup are de-duplicated.
  - Files up to 5 MiB are accepted through the UI, with a secondary 10 MiB hard cap enforced in the background for defense in depth.

### Known limitations
- Import does **not** take an automatic backup of your existing data before committing, and there is no undo. Use **Export HTML** or **Export JSON** first if you want a safety net.
- A JSON backup that contains only preferences (zero items and zero groups) is currently rejected with "Backup contains no bookmarks." To restore preferences today, include at least one item or group in the backup.

## [1.12.0] — 2026-04-18

### Added
- Export to HTML: a new **Export HTML** button in the side panel header downloads a standard Netscape-format `.html` file containing all your groups and bookmarks. The file imports cleanly into Chrome (round-trip tested), Firefox, Safari, and any other browser that accepts Netscape bookmarks. Items whose group was deleted are emitted under an **Ungrouped** folder so nothing is lost. Export of a 1,000-item collection completes in under half a second.
- Export to JSON: a new **Export JSON** button downloads a schema-versioned `.json` backup containing every group, item, and (optionally) your preferences. Back-to-back exports produce byte-identical files except for the `exportedAt` timestamp, so the file is safe to diff and store. The `schemaVersion: 1` field reserves the import contract for a future release.

### Changed
- Item URL text (the second line below each title) now uses the stronger secondary text color across every theme. This brings every non-selected row to WCAG AA contrast (4.5:1 or better) in all eight theme-and-surface combinations. There is no visible change on surfaces that were already compliant.

### Internal
- Extracted shared ARIA-label and group-picker helpers into `shared/aria-label.js` and `shared/group-picker-core.js`. No user-visible change.

### Known limitations
- A few remaining surfaces still use the tertiary text color (the group drag handle and four empty-state body messages). A final contrast sweep is scheduled for the next release.
- HTML export emits all groups at their nominal nesting even if a parent group has been deleted. JSON export's rescue logic handles this case; HTML export does not. No data loss — the orphaned sub-group is still exported.

## [1.11.0] — 2026-04-18

### Added
- Unified group picker for Move-to-group flows: the bulk action bar, the right-click selection menu, and the Open Tabs "Save to group" action now all open the same modal group picker instead of a plain dropdown. The picker lists every group with its color chip, name, saved-item count, and open-tab count; type to filter by name; use Arrow keys, Enter, Escape, and Tab to navigate entirely from the keyboard. If you have no groups yet, the picker shows a "Create group" link that opens the create-group dialog.
- New "Move items out of group" action in the group header context menu: right-click a named group's header to send every item in that group to Ungrouped in a single step.

### Changed
- Item row visual states (live, active, drifted, audible, selected) have been redesigned so each state is distinguishable without relying on color alone and meets WCAG AA contrast in both the light and dark themes. Hover and keyboard-focus treatments are now clearly distinct, and a single screen-reader label now describes every row state in a consistent order. The multi-select checkbox is now a real control — it appears on hover and stays visible while an item is selected.

### Fixed
- Dark-theme primary buttons ("Save bookmark", "Save group", "Save anyway", and similar) now meet WCAG AA contrast. The on-button text color adapts to the theme so dark-mode primary buttons are legible without changing anything in light mode.
- The Tab Junkie context menus (item row, group header, selection, Open Tabs row) now close automatically when you click outside the side panel — including clicks on the web page, the address bar, another Chrome tab, another window, or another application. Moving the mouse away from the menu does not close it. Dialogs and the filter bar are unaffected.

### Known limitations
- Item URL text (the second line below each title) still falls slightly below WCAG AA contrast on non-selected rows in some themes. A global contrast sweep is scheduled for the next release.

## [1.10.0] — 2026-04-18

### Added
- Expanded URL-scheme support: you can now save `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` URLs as bookmarks. `javascript:` and `data:` URLs remain blocked for security reasons. Note that browser-specific URLs (for example, an `edge://` page) will not work if the bookmark is later opened in a different browser.
- Group header context menu: right-click on any named group's header to open actions for the whole group — Open all bookmarks, Close all open tabs, Select all / Select open / Select bookmarked, Edit group, and Delete group. Right-clicking the Ungrouped header shows the browser's native menu instead.
- Duplicate URLs are now allowed with a confirmation prompt: saving a URL that already exists no longer fails outright. A "URL already saved — save anyway?" dialog appears so you can keep the duplicate or cancel. The bulk Save-to-group flow shows an aggregate prompt when some tabs in the batch are already saved.
- Visual dimming for unsavable Open Tabs rows: tabs with `javascript:` or `data:` URLs now appear dimmed with a "Cannot be saved" tooltip, so you can see at a glance which tabs cannot be bookmarked.

### Known limitations
- In the dark theme, the primary-button contrast (including the "Save anyway" button) falls below WCAG AA. Fixed in v1.11.0.

## [1.9.0] — 2026-04-17

### Added
- Multi-window awareness and window filter (B-014): saved-item rows and Open Tabs rows now display a window badge (W1, W2, …) when the associated tab is in a different browser window than the side panel. Ordinals are assigned in first-seen order, are gap-preserving on window close, and are session-only (never written to storage). When two or more windows are open, a filter row appears in the panel header with an "All" chip and one chip per open window; selecting a chip narrows the panel to that window. The filter row is fully keyboard-navigable (Arrow keys, Home/End, Enter/Space) following the ARIA tablist pattern. The filter resets to "All" automatically if the filtered window closes.

### Research / Planning
- URL-scheme allowlist and duplicate-URL policy spike (B-057): completed a research spike documenting the current URL allowlist behavior and the costs of the existing `ERR_DUPLICATE_URL` rejection policy. Decisions accepted: expand the allowlist to cover `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` schemes; replace the hard `ERR_DUPLICATE_URL` rejection in `MSG_PROMOTE_TAB` with a soft-warn UI. Implementation is deferred to Sprint 15 (B-058, B-059, B-060, B-061). No user-visible behavior changes this sprint.

## [1.8.0] — 2026-04-17

### Added
- Open Tabs section: a pinned "Open Tabs" section at the bottom of the side panel surfaces every browser tab that is not yet saved or grouped. Click any row to focus that tab; right-click for Save to group or Close tab. The section updates in real time as tabs open, close, or navigate, and participates in the inline filter, multi-select, and bulk action bar (B-055).
- Selection context menu: right-clicking while multiple items are selected opens a selection-aware context menu offering Move to group, Close tabs, and Remove — the same operations as the bulk action bar, now reachable via right-click (B-028).
- Keyboard shortcuts: Ctrl/Cmd+A selects all currently visible items (including Open Tabs rows); Escape clears the selection. Shortcuts are suppressed when focus is inside a text field such as the filter bar (B-047).

### Changed
- Sort-order normalisation: item sort positions within each group are kept sequential and gap-free after every create, delete, move, or bulk operation. Selection sets are pruned of stale IDs before bulk actions run. No user-visible change; lays the groundwork for drag-reorder reliability (B-051).

### Known limitations (Open Tabs section)
- Tabs with restricted URL schemes (edge://, chrome://, about:, etc.) and tabs whose URL duplicates an existing saved bookmark cannot be saved via Save to group. A categorised error toast explains the failure reason. Visual dimming and proactive skip behaviour for these rows are planned for Sprint 14 (B-056, B-057).

## [1.7.0] — 2026-04-17

### Added
- Multi-select with bulk action bar: click to navigate, Ctrl/Cmd+Click to toggle, Shift+Click for range, Ctrl/Cmd+A for all visible, Escape to clear. Bulk bar shows selected count with Move to group, Close tabs (live items), Remove, and Clear actions. Bulk Remove demotes live items (tab stays open, saved entry deleted); non-live items are fully deleted. All bulk destructive actions require confirmation (B-024).
- Right-click context menu on bookmark items: Navigate, Edit, Move to group, Close tab (live items only), Delete. Delete is visually marked as destructive. Menu is clamped to the viewport and dismissed by Escape or clicking outside (B-026).
- Empty-state messages: empty bookmark list shows an icon, message, and "Add bookmark" CTA; zero-results filter shows "No results for …" with a clear-filter link; empty group shows an inline "No items in this group" message. Failed operations surface a dismissible toast notification (bottom-left, 4 s auto-dismiss) (B-049).

## [1.6.1] — 2026-04-16

### Fixed
- B-054: `_createAudibleIcon` / `_createDriftedIcon` SVG factory extraction — icons now render correctly under strict CSP (was inlined incorrectly)
- B-054: `itemMap` O(N²) linear scan replaced with O(1) Map lookup — eliminates render lag on large collections
- B-054: nested-group drag selector corrected — drag on items inside nested groups no longer silently no-ops
- B-054: `replaceChildren` applied consistently — prevents residual DOM nodes from stale renders
- B-018: `pruneResolvedFloatingGroups` TOCTOU race — reads live current record, not stale snapshot; prevents silent record loss under concurrent appends
- B-018: claim-failure path — failed claim no longer permanently marks a floating-group record as resolved; record is retained for next reconciliation pass
- 42 new automated tests (374 total), all passing

## [1.6.0] — 2026-04-16

### Added
- Opener-chain group inheritance: new tabs opened from a claimed tab inherit its group automatically; chain walked up to 5 hops (B-013)
- `background/tabs/opener-chain.js` — new module managing the openerMap with `MAX_OPENER_MAP_ENTRIES` cap and async pruning on tab removal
- `bulkCreateItems` storage operation accepting up to 500 items in a single atomic write; invalid candidates returned in `skipped[]` without aborting the batch (B-005)
- `MSG_BULK_CREATE_ITEMS` message type in `shared/messages.js` and dispatch in `background/messages/storage-handlers.js`
- `background/storage/shapes.js` — extracted shared constants and shape helpers from partitions/write-transaction circular dep (B-053)
- 40 new automated tests (332 total)

### Fixed
- Circular dependency between `partitions.js` and `write-transaction.js` resolved via `shapes.js` extraction (B-053)
- `appendFloatingGroup` and `itemId` field bug in floating-group record fixed during B-013 build (R4 CRITICAL)
- `requireClaimsReady` broadcast guard was silently swallowing broadcasts during cold-start windows — corrected in B-013 R4

## [1.5.0] — 2026-04-16

### Added
- Favicon auto-capture in sidepanel item rows (`isSafeFaviconUrl` scheme guard: `https://` and `chrome-extension://` only)
- Letter-avatar fallback when favicon is unavailable (first char of title, deterministic color hash)
- Live tab indicators: per-row live/active/audible state reflected in real time
- Active-tab highlight (distinct styling for the currently focused tab)
- Audible tab speaker icon with `_ensureIndicators` post-render injection
- Multi-window focus tracking: `onFocusChanged` gap closed, `WINDOW_ID_NONE` guard added
- Group drag-to-reorder via HTML5 DnD; `sortOrder` persisted to storage on drop
- Drag handle on groups (visible on hover); `mousedown` flag pattern for reliable drag guard
- `_pendingGroupsRender` guard prevents concurrent render destroying drag drop indicator
- Group collapse/expand state persisted across reloads
- Inline filter (`#filter-input`) with 150ms debounce and `#filter-clear-btn`
- `<mark>` highlights on filter matches (XSS-clean DocumentFragment approach)
- `#filter-empty-state` with `aria-live="polite"` region
- `_itemById` O(1) Map replacing O(n²) linear item lookup (B-021 H-1)
- Create / edit / delete bookmarks via sidepanel dialog (Sprint 7 / B-003, first release)
- 63 new automated tests across 4 suites (285 total)
- SOLUTION_DESIGN.md v2.1

### Fixed
- B-010 H-5: favicon `img.src` assigned without scheme validation — `isSafeFaviconUrl` allowlist added
- B-010 H-8: audible icon not injected on false→true state transition post-render — `_ensureIndicators` added
- B-008 H-1: `e.target.closest()` dragstart guard broken on `<section>` element — `mousedown` flag pattern
- B-008 H-4: concurrent `renderAll()` mid-drag destroyed drop indicator — `_pendingGroupsRender` guard
- B-021 M-3: `buildHighlightedText` used `query.length` not `lowerQuery.length` (Unicode edge case)
- Removed stray `console.warn` in `background/broadcast.js`

## [1.4.0] — 2026-04-15

### Added
- `MSG_STATE_CHANGED` — SW-to-UI push broadcast on every mutation and tab event
- `MSG_NAVIGATE_TO_ITEM` — switch to claimed tab or open new tab with immediate claim
- `MSG_CLOSE_TABS` — individual and bulk tab close with valid/gone partitioning
- `background/broadcast.js` — `SCOPE` enum, fire-and-forget delivery, `MUTATION_BROADCASTS` table
- Cold-start broadcast suppression via `isClaimsReady` gate
- `lastAccessedAt` added to `updateItem` allowed patch fields (latent bug fix)
- 26 new automated tests (205 total)

## [1.3.0] — 2026-04-15

### Added
- Group color palette enforcement: 9 semantic colors (blue, purple, teal, red, orange, pink, indigo, yellow, slate)
- Duplicate-name warning on group create/edit (non-blocking, same-parentId scope)
- `MSG_PROMOTE_TAB` — save a live tab as a persistent bookmark with optional group
- `MSG_DEMOTE_ITEM` — remove saved status while keeping the live tab open
- `ERR_DUPLICATE_URL` error code for promote-duplicate detection
- `shared/constants.js` — GROUP_COLORS allowlist
- `shared/errors.js` now canonical home for all error constants
- 60 new automated tests (179 total)

## [1.2.0] — 2026-04-15

### Added
- Drift detection: URL divergence tracked in `tj:drift`, persisted across restarts
- Drift clearing: navigating back to saved URL clears drift in real time
- Fragment-only URL changes do not trigger drift (automatic via normalization)
- Floating-tab group persistence in `tj:floatingGroups` with exact window+index re-association
- Cold-start re-association: position match first, URL fallback second, unresolved retained
- `shared/url.js` — unified `normalizeUrl()` with `forStorage`/`forMatch` modes
- `shared/errors.js` — canonical home for `StorageError` + all `ERR_*` constants
- Protocol defaulting: bare `example.com` → `https://example.com`
- Updated scheme allowlist: `http`/`https`/`file` (removed `ftp`/`mailto`)
- Hostname lowercasing in URL normalization
- `safeNormalizeForMatch` shared helper (DRY across drift, claims, floating)
- `getItemIdForTab` + `claimTabForItem` helpers in tab-claims
- MSG_LIST_ITEMS response now includes `driftRecords` field
- 35 new automated tests (119 total)

## [1.1.0] — 2026-04-15

### Added
- Schema migration runner with forward-only step pipeline and `readyPromise` barrier
- Read-only safe-mode on schema downgrade (`ERR_SAFE_MODE`)
- `MSG_GET_STATUS` message type for system health queries (bypasses ready gate)
- Quota monitoring at 80% threshold via `MSG_GET_STATUS`
- Legacy `junkie_*` key migration (best-effort shape-map + cleanup)
- In-memory `LiveTabIndex` rebuilt from `chrome.tabs.query` on cold start
- `TabClaims` disambiguation table in `storage.session` (itemId → tabId)
- Enriched `MSG_LIST_ITEMS` response: `{ items, liveStates }` with live/active/audible per item
- Per-tab debounce (100ms) on URL-change claim reevaluation
- `claimsReady` flag preventing stale live-state reads before cold-start reconciliation
- 47 new automated tests (81 total)

## [1.0.0] — 2026-04-15

### Added
- Partitioned `chrome.storage.local` schema with six isolated keys
- Item CRUD: create, read, update, delete with URL scheme validation and length caps
- Group CRUD: create, read, update, delete with max-depth-1 enforcement
- Preferences CRUD with default merging
- ULID-based identity: sortable, stable, collision-free
- `writeTransaction()` atomic batcher: serialized, all-or-nothing writes
- Service-worker-as-sole-writer architecture with message-passing boundary
- 12 typed message constants in `shared/messages.js`
- ESLint `no-restricted-imports` rule enforcing write boundary
- 34 automated tests (node:test, zero runtime deps)
- Placeholder HTML stubs for sidepanel, newtab, popup
