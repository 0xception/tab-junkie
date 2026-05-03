# Changelog

All notable changes to Tab Junkie are documented in this file.

## [1.38.1] — 2026-05-03 (B-160 popup recency + sparse fallback)

Same-day follow-on to v1.38.0. Popup's default view now reflects any-surface navigation activity (was popup-only) AND padding from most-recently-accessed items when recency is empty.

### UX
- **Comprehensive popup recency (B-160 §1)** — sidepanel + newtab navigations now feed the popup's recency partition. Pre-B-160 only popup-side activity counted; if you primarily used the sidepanel, the popup's "Recent" view stayed empty. Centralized in the SW MSG_NAVIGATE_TO_ITEM handler — any surface that navigates a saved bookmark or focuses a live tab feeds recency automatically.
- **Sparse-recency fallback (B-160 §2)** — when the recency partition has fewer than 20 resolved rows (new install, storage cleared, all entries stale), the popup pads with most-recently-accessed saved items by `Item.lastAccessedAt`. The "🕑 No recent items yet" empty state only shows on truly empty collections.

### Internal
- New shared helper `appendRecencyEntry(id)` in `background/messages/storage-handlers.js`. MSG_RECENCY_ADD case refactored to call it. Popup `_activateRow` no longer dispatches MSG_RECENCY_ADD (centralized in SW).
- Test count: 1924 → 1930 PASS (+6 from `tests/b160-comprehensive-recency.test.js`).

## [1.38.0] — 2026-05-03 (B-159 favicon persistence)

Same-day follow-on to v1.37.1 polish. Saved-bookmark favicons now persist across tab close + extension restart, with a Chrome `_favicon` API fallback for never-opened bookmarks.

### New features
- **Favicon persistence (B-159 §A)** — saved bookmarks remember the last-seen favicon. After you open a tab once, the favicon is captured and stored on the Item record; closing the tab no longer regresses to the letter-avatar. Schema `tj:items` v5 → v6 lazy migration adds optional `favIconUrl: string | null`. Capture is once-per-session-per-item via `chrome.tabs.onUpdated`; preserves any previously persisted favicon (no clobber).
- **Chrome favicon-cache fallback (B-159 §B)** — adds `favicon` manifest permission to use Chrome's `_favicon` API (`chrome-extension://<id>/_favicon/?pageUrl=...`). Render fallback chain: live tab favicon → persisted Item favicon (§A) → Chrome `_favicon` API URL (§B) → letter-avatar. Imported / never-opened bookmarks get an icon from Chrome's own cache without requiring TJ to open the tab.

### Note
- **Schema bump v5 → v6 — extension toggle required.** After updating to v1.38.0, toggle the extension OFF then ON in your browser's extensions page (`edge://extensions` or `chrome://extensions`), or fully restart the browser. This flushes the service-worker module cache so the new schema is recognized.
- **New manifest permission**: `favicon` — required by the Chrome `_favicon` API helper. The permission is local-only (no network); it grants access to Chrome's existing in-browser favicon cache.

### Internal
- Test count: 1908 → 1924 PASS (+16 from `tests/b159-favicon-persistence.test.js`). Five pre-existing pin tests updated (3 schema-version pins, 4 manifest-permission baseline pins).
- New shared helper `getChromeFaviconUrl(pageUrl, size)` in `shared/favicon.js`. `isSafeFaviconUrl` now accepts `chrome-extension://` prefix.

## [1.37.1] — 2026-05-03 (B-158 polish hotfix)

Same-cycle visual polish on top of v1.37.0. No functional change.

### Visual fixes
- **Drag-handle parity across all row types (B-158)** — saved-bookmark, Open Tab, and floating tab rows now all show the same checkbox + drag-handle pair toggling in the same flex slot. Pre-B-158 the drag-handle CSS overlap (`margin-left: -18px`) absorbed the 18 px slot but not the parent `.item-row { gap: 10px }` flex gap to the favicon, shifting bookmark-row content right by 10 px. Open Tab + floating tab rows had no drag-handle at all per a stale B-113 §56.3 D-5 comment ("open-tab rows are not draggable") that became outdated when B-134 (S40) made them draggable. Fix: `margin-left: -28px` (slot + gap absorbed); `buildOpenTabRow` now appends the same drag-handle as `buildItemRow`.

### Internal
- Test count: 1908 / 1908 PASS unchanged. Two B-113 test pins updated (T2 inverted, T3 margin-left value).

## [1.37.0] — 2026-05-02 (Sprint 43)

Sprint 43 — Drag/drop + claim-drift reliability investigation. Bug-investigation focus per product-owner feedback at S42 close. Anchor B-150 bisected the "we keep losing sync" symptom + opened the door to two new feature/UX items (B-154 multi-tab drag, B-157 group-zone expansion). Two pre-existing strip-vs-section regressions (B-156 + B-150 Q1) were caught and fixed during investigation.

### New features
- **Multi-tab drag-and-drop (B-154)** — multi-select 2+ Open Tabs (or floating tabs in the same group) and drag any one of them to ATTACH / DETACH / MOVE_FLOATING all of them at once. Previously only the grabbed row moved; the remaining N-1 stayed silently. Filter rules: same drag-class (Open Tabs vs floating), same source window, same source group (for floating). Single-tab drag behavior is unchanged. Sequential per-tab dispatch with insert-index bumping for contiguous landing in selection order. Partial-success accepted (one tab failing doesn't abort the rest).
- **Whole-group drop target for tab attach (B-157)** — drop an Open Tab anywhere in a group's section (header, saved-bookmark area, or floating area) to attach it. Previously the drop zone was only the area between saved bookmarks and any nested child group, which collapsed to zero height for groups with no floating tabs and excluded the header entirely. Drops on the header / saved area place the new floating tab at the top of the group's floating list; drops in the floating area still use position-precision. True interleave with saved bookmarks remains a future item (B-148).

### Bug fixes
- **Drag-and-drop ATTACH no longer throws (B-150 Q1)** — `moveFloatingTab` used a dynamic `await import(...)` inside the SW context. Chrome/Edge service workers reject dynamic imports per W3C spec; the chrome-mock test environment (Node.js) accepted them so 1,892 tests passed even though every ATTACH-drag in production threw `Error: Internal error`. Fix: replaced with a static import. Static-scan regression test added (`tests/b150-no-dynamic-import-in-sw.test.js`) catches future occurrences across `background/` and `shared/`.
- **Open Tab reorder lands at correct position (B-156)** — pre-existing bug since v1.35.0: `_cleanupTabDragDom` nulled the rect cache before the drop dispatch ran, so `_computeStripInsertIndex` fell back to section-relative `pendingInsertIndex` instead of strip-absolute. For users with N saved-bookmark claimed tabs + floating tabs preceding the Open Tabs section in the strip, dropped tabs landed N rows above the target. Surfaced because product-owner has 31 such precedents. Fix: cache survives `_cleanupTabDragDom`; explicit nulling moved to after the drop dispatch.

### Process / engineering
- **CLAUDE.md retro edits** (S42 retrospective action items shipped):
  - **B-151** — fix-scope test-assertion enumeration extended to include DOM-structure pins on shared surfaces (third-occurrence pattern: S36 B-113 + S37 B-117 + S42 B-041)
  - **B-152** — new R2 Correctness Checklist entry **C-15: Browser-API rejection-string contract verification** (require SW REPL probe to verify Chrome message format when error classification depends on substring matches)
  - **B-153** — Shared File Governance extended to require explicit "shared-surface consumer inventory" subsection in R2 chapters that touch shared `#settings-*` / `#sidepanel-*` / `#newtab-*` / `#popup-*` elements OR shared module-level state

### Known issues / deferred
- **Multi-drag count-badge ghost (B-155)** — current Edge regressed both the B-025 UAT-8 off-viewport-transform CSS strategy AND a S43 hotfix attempt: `setDragImage` with the existing `.multi-drag-ghost` element renders as a fallback "document with folded corner" icon. Both B-025 saved-bookmark multi-drag AND the new B-154 tab-drag were affected. B-154 reverted to the default browser ghost (the dragged row); B-025 unchanged. B-155 filed as P3 follow-on for proper Edge investigation.
- **Q2 lost-sync continuation** — B-149's hypothesis mechanisms (a/b/d) remain open; awaiting real-world repro signal to schedule R0 spike. Mechanism (c) was fixed in S41.

### Internal
- Test count: 1826 → **1908 / 100% PASS** (+82 net over the pre-B-041 baseline; 16 new test files this sprint)
- 7 BACKLOG items closed (B-149 hygiene, B-150 Q1, B-151, B-152, B-153, B-154, B-156, B-157), 2 new items filed (B-155 Edge ghost follow-on, B-150 Q2 stays open)
- Branch: `feature/sprint-43-claim-drift-reliability` off `release/v2`

## [1.36.0] — 2026-05-XX (Sprint 42)

Sprint 42 — Chrome tab group sync (snapshot push). One anchor item (B-041) closes the pre-S33 P2/L placeholder for Chrome tab-group integration with a narrowed scope: snapshot-only, current-window-only, top-level groups only.

### New features
- **Chrome tab group sync (snapshot push, B-041)** — Settings page → Chrome Integration → "Sync this window to Chrome". TJ groups become Chrome tab groups (with title + mapped color); tabs are reordered in the strip to match TJ order; ungrouped Open Tabs are reordered but stay ungrouped. Push-only, snapshot-only, current-window only this release. Auto-sync (continuous mirror) is planned for a future release.
- **Sync result toast** — green / yellow / red variants with non-color glyph prefixes (✓ / ⚠ / ✗) for WCAG 1.4.1 compliance. Partial-success toast includes a **View details** expander listing each skip reason and count (e.g., "1 pinned tab · 1 tab closed mid-sync"). Toast auto-dismisses after 4 seconds; manual × dismiss is supported.
- **In-progress feedback on the Sync button** — the button shows "Syncing…" and sets `aria-busy="true"` while the operation is in flight; restored on completion. Prevents double-clicks; announces to assistive tech.

### Storage migrations
- **Schema migration `tj:groups` v4 → v5 (lazy, non-destructive)** — `tj:groups` records gain optional `chromeTabGroupId: number | null`. `KNOWN_VERSION` bumped 4 → 5 with a no-op migration step. Legacy v4 records (without the field) are treated as never-synced; the first sync stamps the field. Stale mappings (Chrome tab groups deleted by the user) are detected via `chrome.tabGroups.get` and replaced transparently. No data rewrite on update.

### Note
- **Schema bump v4 → v5 — extension toggle required.** After updating to v1.36.0, toggle the extension OFF then ON in your browser's extensions page (`edge://extensions` or `chrome://extensions`), or fully restart the browser. This flushes the service-worker module cache so the new Chrome-sync code paths and v5 schema are recognized.

### Architecture
- **Manifest permissions** — unchanged (`tabGroups` was already declared in a prior sprint as a forward-looking permission).
- **New module**: `background/sync/` with `chrome-sync.js` orchestrator + `color-map.js` palette mapping (TJ's 9-color palette → Chrome's 9-color tab-group palette; 6 exact matches, teal→cyan, indigo→blue, slate→grey).
- **New message contract**: `MSG_SYNC_TO_CHROME { windowId }` → `{ summary: SyncSummary }`. Registered as a write-class message; safe-mode (downgrade) blocks the call.
- **`chrome.tabs.onMoved` storm suppression** — module-level `isSyncInFlight()` flag short-circuits the floating-group re-bind listener during the bulk strip-reorder so our writes are not raced.

### Internal
- Test count: 1826 → 1892 / 100% PASS (+66 net: +38 R3 build · +25 R4 fix-round · +3 R5 gap-fill).
- Shared `settings/settings-toast-timer.js` module extracted at R4 fix-round to coordinate the singleton `#settings-toast` timer between Sync and Import/Export flows (removes a ghost-timer race between the two modules).
- `_classifyError` now matches both chrome-mock synthetic strings and Chromium's actual `chrome.tabs.move` rejection format, with `tests/sync-classify-error.test.js` pinning the predicate set.

## [1.35.0] — 2026-04-30

Sprint 41 — Floating-tab data-model evolution + 2 pre-merge bug fixes (3 user-visible items): 1 P1/M reliability fix that eliminates latent floating-tab defects from prior sprints, plus 2 surgical fixes for drag-reorder bugs surfaced by smoke-testing the v1.35.0 build prior to merge.

### Fixed
- **Floating tabs now reliably render the correct title and metadata (B-137)** — eliminates the issue where opening a new tab from a bookmark within a group sometimes showed an unrelated sibling item's title in the floating row (the root cause of B-131 and the post-Sprint 40 sibling-title displacement reports). Floating-tab rows now consistently display the title, URL, and favicon belonging to the actual live tab they represent, regardless of how many siblings exist in the same group.
- **Floating-tab drag-reorder within a group no longer fires false "list changed during drag" toasts (Fix A — pre-merge bundle)** — closing a floating tab previously left an orphan record in storage that subsequently caused every legitimate drag-reorder within that group to fail with a "Floating-tab list changed during drag — please retry." toast. Closing a floating tab now cleans up its storage record, so subsequent reorders succeed. (B-137 fixed half of the underlying race; this fix closes the other half.)
- **Drag-reordering open tabs now drops the row at the position you actually pointed to (Fix B — pre-merge bundle)** — when one or more saved-bookmark tabs or floating tabs were positioned earlier in the same browser window's tab strip, dragging an Open Tab in the sidepanel landed it N positions above where you dropped (where N = number of those preceding tabs). The drop position now matches the user's target index regardless of how many other tabs precede in the strip. (Latent B-134 bug surfaced by v1.34.1 B-136 wiring up `chrome.tabs.onMoved`.)
- **Floating-tab record duplicates from prior versions automatically clean up on first launch (Fix C — pre-merge bundle)** — users upgrading from v1.34.x may have accumulated duplicate `tj:floatingGroups` storage records over their session (one tab represented by multiple records). These duplicates caused the same "list changed during drag" toast Fix A addresses, but for a different reason — pre-existing records that pre-date Fix A's prune-on-close logic. v1.35.0 now deduplicates these records on first cold-start (next SW boot after update — typically triggered by the toggle OFF→ON flush below) and prevents future duplicates by checking for an existing record before appending. **Existing v1.34.x users do NOT need to manually clear storage — the cleanup happens automatically on the next SW startup**.
- **Floating-tab drag-reorder now lands at the position you dropped at (Fix D — pre-merge bundle)** — pre-Fix-D, dragging a floating tab forward (low index → high index) and dropping at a target position landed the tab one row before the target. (Latent B-134 bug introduced by the B-134 R4 H-4 filtered-list semantics change in S40 Wave 3a — the dispatch math still applied an unfiltered-list adjustment, double-correcting forward drops. Was masked by the duplicate-records issue Fix C resolves; surfaced once Fix C unblocked reorder.)
- **Drifted bookmark tabs no longer silently lose their tracking after sitting idle (B-149 — pre-merge bundle)** — when a saved bookmark's tab navigates to a different URL (entering drifted state), the tab now stays claimed by the bookmark even after the service worker idle-restarts (every ~30 seconds in MV3). Pre-fix, drifted tabs would migrate to the Open Tabs section after a few minutes of inactivity, losing their tracking. The fix preserves the B-099 Option B contract ("claim survives URL change") at the cold-start boundary — previously the cold-start path retained pre-B-099 URL-match validation that incorrectly evicted live drifted claims. Three test sites had inadvertently pinned this bug as "expected behavior"; all corrected.

### Architecture
- **Schema migration `tj:floatingGroups` v3 → v4 (lazy, non-destructive)** — `tj:floatingGroups` records gain a stable identity field that survives tab-index shifts, so floating-tab rows can no longer be confused with their siblings during render or reorder. `KNOWN_VERSION` bumped 3 → 4 with a no-op migration step. Legacy v3 records (without the new identity field) are read transparently via a read-side compatibility shim plus a position+URL fallback; cold-start re-association lazily rewrites legacy records as they are encountered. No data rewrite on update. Per CLAUDE.md C-1a, an extension toggle OFF → ON cycle is required after this update to flush the service-worker module cache (see "Note" below).
- **Manifest permissions** — unchanged. **Manifest entries** — unchanged.

### Note
- **Schema bump v3 → v4 — extension toggle required.** After updating to v1.35.0, toggle the extension OFF then ON in your browser's extensions page (`edge://extensions` or `chrome://extensions`), or fully restart the browser. This flushes the service-worker module cache and ensures the new floating-tab data model is recognized. **Floating-tab title rendering and drag-reorder may behave inconsistently until this is done.** Pre-v1.35.0 `tj:floatingGroups` records remain readable; the new write path stamps the new identity field going forward.

## [1.34.1] — 2026-04-30 — B-136 hotfix

Fast Track S hotfix restoring B-134 Op 1 (Open Tabs drag-reorder user-visible behavior).

### Fixed
- **Drag-and-drop reorder of open tabs in the sidepanel now actually moves the row to the new position (B-136)** — under v1.34.0, dragging an Open Tabs row dispatched `chrome.tabs.move` correctly (the browser's native tab strip reordered) but Tab Junkie's sidepanel view did not refresh, so the row appeared to snap back to its original position. The drag gesture now has the visible effect promised by B-134 AC1, matching what already happens in the browser tab strip.

### Changed (developer-visible)
- **Registered `chrome.tabs.onMoved` listener in `background/tabs/tab-events.js`** — was missing in v1.34.0 ship of B-134. Listener mirrors existing `onUpdated` / `onActivated` / `onAttached` patterns: local-renumber forward (`(fromIndex, toIndex]` shift `-1`) / backward (`[toIndex, fromIndex)` shift `+1`), then `broadcast(SCOPE.LIVE_STATE, 'tab/moved', { requireClaimsReady: true })` triggers cache invalidation so `buildOpenTabs` re-sorts by the fresh indices and the sidepanel re-renders.
- **`tests/chrome-mock.js`** gains an `onMoved` event channel + `_fireOnMoved(tabId, moveInfo)` helper; `chrome.tabs.move` mock now fires `onMoved` after recording `_moveCalls`.

### Note
- **No reload required.** No storage schema changes, no manifest changes, no message-contract changes, no new permissions, no `DEFAULT_PREFERENCES` additions. Pure listener-registration + cache-invalidation wiring. Update and use the new behavior immediately.

## [1.34.0] — 2026-04-30

Sprint 40 — Floating-tab bug-fix anchor + drag-reorder feature (3 user-visible items): 1 P1 cold-start bug fix (B-132) + 1 P2/M drag-and-drop reorder feature (B-134) + 1 P3/XS visual-cue consolidation (B-133).

### Added
- **Drag-and-drop reorder for open and floating tabs (B-134)** — five new drag operations are now possible from the side panel:
  - **Reorder open tabs within the same window** — drag rows in the Open Tabs section to change their order; the change mirrors to the browser's native tab strip in real time.
  - **Reorder floating tabs within their group** — drag floating-tab rows up or down to change their order under their parent group.
  - **Attach an open tab to a group** — drop an Open Tabs row onto a group's floating area to make it a floating member of that group (it stays in the group until you close it).
  - **Detach a floating tab back to Open Tabs** — drag a floating tab out of its group and drop it on the Open Tabs section to make it a regular open-tab row again.
  - **Move a floating tab between groups** — drag a floating-tab row from one group to another to switch which group it floats under, as a single atomic operation.
  All five operations show the same horizontal drop-line indicator already used for bookmark reorder. The keyboard alternative for moving a floating tab between groups is unchanged (right-click → Save to group). **Cross-window drag is not supported in this release** (filed as B-135 for a future sprint); same-window only. Drag-and-drop directly onto a saved-bookmark row to promote-on-drop is also deferred to a later sprint.

### Changed
- **Open Tabs section rows now use a dotted green left-edge bar (B-133)** — Open Tabs rows pick up the same dotted-green visual cue introduced for floating tabs in v1.33.0, completing the visual taxonomy: a **solid** green left-edge bar means a *persistent* row (a saved bookmark whose tab is currently open), and a **dotted** green left-edge bar means an *ephemeral* row (an unsaved live tab — either floating under a group or sitting in Open Tabs). At a glance you can now tell which rows in the panel are persistent and which will disappear when their tab closes.

### Fixed
- **Floating tabs no longer disappear from their group after extension reload (B-132)** — when the extension reloaded (after an update or a manual *Reload extension* click), pre-existing floating tabs were sometimes incorrectly auto-claimed by an unrelated saved bookmark whose URL happened to match — and got pulled out of the group they were floating under. Floating tabs now stay in their originating group across extension reloads as expected.

### Architecture
- **Schema migration `tj:floatingGroups` v2 → v3 (lazy, non-destructive)** — `tj:floatingGroups` records gain a `sortOrder` field so floating-tab order survives reloads. `KNOWN_VERSION` bumped 2 → 3 with a no-op migration step. Legacy v2 records (without `sortOrder`) are read transparently via a read-side compatibility shim; new writes always stamp `sortOrder`. No data rewrite on update. Per CLAUDE.md C-1a, an extension toggle OFF → ON cycle is required after this update to flush the service-worker module cache (see "Note" below).
- **Manifest permissions** — unchanged. **Manifest entries** — unchanged.

### Known limitations
- **Cross-window drag deferred** — dragging an Open Tabs row from one browser window into another window's Tab Junkie panel is rejected in v1 (the source-window/target-window mismatch is detected and the drop is cancelled). Filed as **B-135** for a future sprint.
- **Drag-to-save deferred** — dropping an open-tab row directly onto a saved-bookmark area to promote it in one gesture is not supported; use the existing right-click → *Save to group* flow or hover a floating-tab row for the *Save as bookmark* button. Tracked under **B-041** for a future release.
- **Sidepanel-only for v1** — drag-and-drop reorder is available in the side panel and standalone window only. The new tab page does not yet support drag reorder for open or floating tabs.
- **Deep-chain opener tabs after extension reload** — the B-132 fix protects pre-existing floating tabs from being claim-jumped on reload. However, deeply-nested opener-spawned tabs (a tab spawned from a tab that was itself spawned from a bookmarked parent, multiple hops deep) may still land in the Open Tabs section after a reload because the opener-chain context is not persisted across service-worker restarts. Workaround: close the affected tab and re-spawn it from the bookmarked parent.

### Note
- **Schema bump v2 → v3 — extension toggle required.** After updating to v1.34.0, toggle the extension OFF then ON in your browser's extensions page (`edge://extensions` or `chrome://extensions`), or fully restart the browser. This flushes the service-worker module cache and ensures the new floating-tab ordering schema is recognized. **Drag-and-drop reorder will not work correctly until this is done.** Pre-v1.34.0 `tj:floatingGroups` records remain readable; the new write path stamps `sortOrder` going forward.

## [1.33.1] — 2026-04-30 — B-130 hotfix

Fast Track XS hotfix simplifying the v1.33.0 B-124 floating-tab visual implementation.

### Fixed
- **Floating-tab indicator no longer collides with the drift indicator (B-130)** — under v1.33.0 floating tabs rendered a separate dotted-green bar just inside the row's left edge, which sat in the same x-column as the dotted-orange drift indicator and read as a replacement of it. The separate bar is removed; the existing left-most live-state indicator on a floating row now renders dotted-green directly, and the drift indicator retains its independent identity. Saved-with-active-live rows continue to render a solid-green bar. No behavior change beyond the visual cleanup.

### Changed (developer-visible)
- **Removed `.item-floating-bar` element + CSS rule (sidepanel)** — `buildItemRow` no longer appends the dedicated bar element; floating state is communicated entirely via `[data-floating="true"]` selectors targeting the existing `border-left` declaration.
- **Removed `.newtab-floating-bar` element + CSS rule (newtab)** — newtab's right-side dot indicators already cover the live-state cue, so the left-side bar was redundant on this surface and is dropped without replacement.
- **`--floating-bar-color` CSS token retained** — the future yellow-bar swap remains a one-token change; the token is now consumed by the `[data-floating="true"]` `border-left-color` override.

### Note
- **No reload required.** CSS / DOM-shape change only — zero new pref keys, zero new manifest entries, zero storage schema changes. Update and use the new behavior immediately.

## [1.33.0] — 2026-04-29

Sprint 39 — Polish + process close-out (6 items): 1 P3/M floating-tab visual distinction + 1 P2/M sub-group drag-to-root + 1 P3/XS row-alignment fix + 3 XS CLAUDE.md process gates.

### Added
- **Floating-tab visual distinction (B-124)** — floating tabs (live tabs that have inherited a saved bookmark's group via the opener-chain feature, but are not themselves saved) now show a **dotted green vertical bar** on their left edge, while saved bookmarks with active live tabs show a **solid** green bar. At a glance you can tell which rows in a group are persistent (saved) vs. ephemeral (just-spawned). Applies to the side panel, the new tab page, and the standalone window. Hovering a floating-tab row reveals a **"Save as bookmark"** (`+`) button — click it to promote the floating tab to a saved bookmark in its current group, wiring through the existing promotion flow with no new permissions. Screen readers announce floating rows distinctly (`"floating tab — <title>"`) so the difference is conveyed without relying on color. WCAG AA contrast verified across all 14 themes (16/17 PASS — `solarized-light` retains the same accepted limitation as B-117 from Sprint 37). The bar color is parameterized via a new `--floating-bar-color` CSS token, so a future yellow-bar swap is a one-token change.
- **Sub-group drag-to-root (B-122)** — drag a sub-group out of its parent and drop it anywhere outside an existing group to promote it back to a top-level group. This is the inverse of the existing drag-to-nest gesture (B-031). Drop between two top-level group headers to insert at that ordinal; drop above the first group to land at the top; drop below the last group to land at the bottom. The visual cue is the same drop-line you already see when reordering groups — no new visual primitive. Dropping the sub-group over the Open Tabs section is rejected (no accidental promotion to "after the last group"). Concurrent edits from another window are race-guarded: if a parallel edit changes the dragged group's parent mid-drag, the drag aborts with a toast. The keyboard alternative (edit-dialog parent picker → "Top-level (no parent)") is unchanged.

### Improved
- **Item-row left-edge alignment (B-123)** — bookmark rows in the side panel that have no live or active vertical-bar indicator now align horizontally with rows that do, producing a clean column instead of a jagged left edge. Pure CSS structural-placeholder fix; no behavior change.

### Internal / process
- **Three CLAUDE.md gate strengthenings (B-127, B-128, B-129)** — Sprint 38 retrospective action items closed: (1) STOP-and-escalate at R3 — `[frontend-engineer]` must escalate to `[scrum-master]` before silently deferring any AC-locked behavior to a follow-up item (B-121 R3 newtab close-button precedent); (2) C-1 schema-bump / migration-strategy split at R2 — the storage-schema correctness check is split into governance (C-1a, `KNOWN_VERSION` increment) and data-migration strategy (C-1b, eager / lazy / no-op choice documented), so a lazy data strategy no longer accidentally exempts the version bump (B-121 lazy-migration precedent); (3) cascade-prune sibling-grep at R3 — when R2 fix-scope adds a cascade-prune to one entry-point of a multi-entry-point write surface, R3 must grep for sibling entry-points and verify cascade parity before claiming complete (B-121 R3 single-delete-only cascade-prune precedent, missing `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`).

### Note
- **No reload required.** All 6 Sprint 39 items are pure UI/UX or process changes — zero new pref keys, zero new manifest entries, zero storage schema changes. Update and use the new behavior immediately.

## [1.32.0] — 2026-04-29

Sprint 38 — Bug-fix anchor sprint (4 items): 2 P0/P1 anchors (B-125 + B-121, merged R0 spike) + 2 XS internal/dev-only Fast Track items.

### Fixed
- **Tab claim ownership jump on URL navigation (B-125, P0)** — opener-chain-spawned tabs are now gated against the auto-claim branch in `reevaluateTab`. New tabs inheriting their group from a bookmarked parent no longer steal the claim of a coincidentally URL-matching saved item. Repro: opening a SharePoint bookmark and clicking an in-page link to a Workday URL no longer creates duplicate "Home - Workday" rows in the sidepanel. Closes the B-099 D-3 contract gap. Implemented as an `inheritedTabs: Set<number>` ephemeral SW-memory marker, populated after `appendFloatingGroup` resolves and pruned on `tab.onRemoved` + `windows.onRemoved` cascade. Zero schema/contract/manifest impact.
- **Floating-tab runtime render pipeline (B-121, P1)** — opener-chain-inherited tabs now appear as live rows under their parent bookmark's group section across all three rendering surfaces (sidepanel, standalone, newtab). The tab is excluded from the Open Tabs section while the floating-group record is alive. Closes the B-013 + B-018 design gap where `tj:floatingGroups` had no runtime visibility (latent feature gap since original B-013). New `MSG_LIST_ITEMS` response field `floatingMembers: Record<groupId, Array<FloatingMember>>` (optional, additive); synthetic `[data-floating="true"]` rows render directly under each parent group section. Cascade-prune on `MSG_DELETE_ITEM` + `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`. Newtab gains a close button + ENTER/SPACE keyboard activation. ARIA fallback for floating-row selection.
- **Floating-group parent-itemId-reuse defect (B-121 §60.4)** — `tj:floatingGroups` records gain a synthetic `floatingTabId` (ulid) as their storage identity, decoupling them from the parent bookmark's id. Cold-start re-association no longer overwrites the parent's claim under any circumstances. The legacy field name `itemId` has been renamed to `parentItemId` for clarity; both forms are tolerated on read. Storage-schema migration is non-destructive — pre-S38 records continue to work via the read-side compatibility shim.

### Internal / process
- **Stale test docblock prose corrected (B-120, dev-only)** — `tests/b114-tint-v2.test.js` and `tests/b104-group-colors.test.js` docblock prose updated to reflect post-B-117 contrast values (the pre-B-117 "4.55:1 PASS" / "4.78:1 worst-case" claims are no longer accurate after Sprint 37's tint adjustments). Zero assertion changes; docblock prose only. Test-file maintenance — no user-visible impact.
- **B-119 contract definition expanded for CSS-token invariants (B-126, dev-only)** — `CLAUDE.md` "Fix-scope test-assertion enumeration" subsection extended to require R2 chapters declaring contract changes to enumerate **CSS-token invariants** (regex-pin tests on `shared/themes.css`, structural assertions on `--<token>` values, count-of-N assertions on token declarations) in addition to the previously-listed DOM/ARIA/message/selector contracts. Adds Sprint 37 R3 b114 T1 escalation as the second blocking precedent. Closes Sprint 37 retro HIGH action item #1.

### Architecture
- **Schema migration `tj:floatingGroups` v1 → v2 (lazy, non-destructive)** — `KNOWN_VERSION` bumped 1 → 2 with a no-op migration step. Legacy v1 records (with `itemId` only) are read transparently via a read-side compatibility shim; new writes stamp `floatingTabId` + `parentItemId`. No data rewrite on update. Per CLAUDE.md C-1, an extension toggle OFF → ON cycle is required after this update to flush the service-worker module cache (see "Note" below).
- **Message contract `MSG_LIST_ITEMS` extended (additive, optional field)** — response payload gains an optional `floatingMembers: Record<groupId, Array<{tabId, url, windowId, tabIndex, parentItemId, floatingTabId}>>` field. Existing consumers ignoring the field continue to function without change. Typed in `shared/messages.js`.
- **Manifest permissions** — unchanged. **Manifest entries** — unchanged.

### Note
- **Schema bump v1 → v2 — extension toggle required.** After updating to this build, toggle the extension OFF then ON in your browser's extensions page (or fully restart the browser) to ensure the service-worker module cache is flushed. Without the toggle the new floating-tab runtime render path may not activate until the next browser restart. Pre-S38 `tj:floatingGroups` records remain readable; the new write path stamps `floatingTabId` and `parentItemId` going forward.

### Quality
- **Tests**: 1,641 → **1,663 passing** (+22 net — 5 B-125 + 13 B-121 + 1 floating-shape + 3 fix-round adds). Zero regressions.
- **Build**: `./build.sh` clean (348 K zip, 87 files, exit 0).
- **R4 findings**: B-125 + B-120 + B-126 PROCEED clean (0 CRITICAL / 0 HIGH). B-121: 1 CRITICAL + 4 HIGH + 3 MEDIUM all resolved in fix-and-reproceed; zero open at sprint close.

## [1.31.0] — 2026-04-28

Sprint 37 — Polish + process close-out (3 items): 1 M WCAG AA matrix audit + 2 XS CLAUDE.md process gates.

### Improved
- **Group-header color contrast on Atom One Dark, One Dark, and Dracula (B-117)** — group-header tint adjusted from 20% to 7% on Atom One Dark and One Dark (both share a palette where the canonical colors could not reach 4.5:1 at 20%), and from 20% to 17% on Dracula (yellow slot was 4.119:1 at 20%; 17% clears all 9 slots). All other themes are unchanged. Visual palette identity is preserved on all three themes.

### Documented
- **Solarized Dark theme accessibility limitations (B-117)** — group-header colors in Solarized Dark fall below WCAG AA on all 9 group-color slots. This is an inherent property of the canonical Solarized Dark base text/background pair (4.111:1 at the source — below AA before any tinting), so no tint or slot adjustment can reach 4.5:1 without breaking the canonical theme identity. All 9 slots with their measured contrast ratios are now listed in `docs/user-manual/themes.md` under "Theme accessibility limitations". Users who require WCAG AA contrast on group headers should use Solarized Light, GitHub Dark, Tomorrow Night, Nord, Monokai, or Tokyo Night.

### Internal
- **126-cell WCAG AA contrast matrix test (B-117)** — new `tests/b117-gc-matrix-audit.test.js` enforces the full 14-theme × 9-slot contrast matrix at build time (137 tests, 136 ms). Failing cells that use accepted-limitation pathway are tracked in an explicit `ACCEPTED_LIMITATIONS` allow-list with monotonic-decrease floor guards; if a future change accidentally darkens an accepted slot further, the test catches it. Zero regressions against the 1,504-test baseline.
- **R1 source-citation gate (B-118)** — CLAUDE.md now requires every R1 source-code structural claim to cite a `file:line` reference or be marked `R2-VERIFY`. Prevents factual errors in ACs from propagating to R3 build scope (three R1 binding-correction precedents surfaced in Sprint 36 retro).
- **R2 fix-scope test-assertion enumeration (B-119)** — CLAUDE.md R2 chapters that declare a CSS-token or contract change must now enumerate pre-existing test-file assertions against the old value (not just stale prose strings). Closes the §57.9 enumeration miss that caused `tests/b114-tint-v2.test.js` T1 to fail mid-B-117 R3.

### Note
- **No reload required.** All Sprint 37 changes are CSS-token adjustments and process documentation — zero new pref keys, zero new manifest entries, zero storage schema changes. Update and use the new behavior immediately.

## [1.30.0] — 2026-04-28

Sprint 36 — UI/UX polish bundle (9 items): 1 P2/M drift bug + 1 S WCAG fix + 1 S delete-icon swap + 1 S drag-handle/multi-select + 1 XS WCAG-aware group-name tint + 4 XS polish.

### Added
- **Dynamic delete-icon swap (B-111)** — the X-button on a saved-bookmark row now reflects the action it will perform: simple X icon on a live row (click closes the tab per v1.29.0 B-100); trash icon on a non-live row (click opens the existing modal-confirm before deleting). Pure CSS swap via the existing `data-live` attribute; both icons ship in the DOM at first paint and the cascade toggles visibility per row state. The B-100 click-handler contract is preserved verbatim — no new modal on the live path; existing modal on the non-live path.
- **Item-row drag-handle on hover (B-113)** — saved-bookmark rows now show a small 6-dot drag handle (matching the group-header drag-handle pattern) on hover when not in multi-select mode. The handle is decorative — `pointer-events: none` ensures clicks pass through to the underlying row, so B-030 v2 drag-reorder still works from anywhere. In multi-select mode, the existing `.item-select` checkbox replaces the handle (Gmail pattern: once one row is selected, all rows show their checkboxes persistently). Open Tabs section unchanged — open-tab rows are not draggable, so the handle is omitted there for honest UX. New `prefers-reduced-motion` gate on the opacity transition.
- **Group-header text tinted toward group color (B-109)** — on themes where WCAG AA holds (`github-light`, `github-dark`, `monokai`, `tokyo-night`, and `system` on dark OS), the group-header text adopts a 50% color-mix of the group's slot color toward `--text-primary`. On the 10 themes where 50% breaches AA (worst: `solarized-dark + red` at 2.534:1), the text falls back to `--text-primary` via a per-theme `--group-header-name-color` override. Ungrouped sections inherit the same fallback automatically.

### Changed
- **Brighter dark-theme group-header tints (B-114)** — dark themes (11 themes) now use `--group-header-tint-amount: 20%` (up from 18%) for stronger group identity. Light themes stay at 18%; solarized-light stays at the B-105 3% override.
- **Group-header chevron uses themed group color (B-115)** — the expand/collapse chevron now consumes `var(--group-header-color, var(--text-primary))`, matching the group-header tint cohesion. Ungrouped fallback to `--text-primary` preserved. The legacy `--collapse-icon` token was removed file-wide as part of this change.
- **Sidepanel header label removed (B-112)** — the `Tab Junkie` text inside the side panel header was removed (the browser already shows the extension name in its own chrome). Header height/affordance positions unchanged.
- **Solarized-light secondary text accessibility fix (B-108)** — `--text-secondary` and `--group-count-text` darkened from canonical `#657b83` (3.636:1 vs `--bg-secondary`, FAIL) to `#546a72` (4.655:1, PASS). Tracked from S35 B-105 deferral.

### Fixed
- **Drift indicator no longer surfaces on non-live bookmark rows (B-110)** — fixed the §10.7 invariant violation where stale drift records persisted after claim release, causing the dotted drift bar to appear on rows whose tab had been closed. Two leak paths patched: `reconcileClaims` cold-start eviction (PRIMARY — claim discarded but `clearDrift` was never called for the evicted itemId) and `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair (SECONDARY — `releaseClaimByTab` did not pair with `clearDrift`). Both fixes ship alongside a defense-in-depth conjunctive render gate (`isDrifted && live?.live`) at both `_ensureIndicators` and the `buildItemRow` first-paint path — even if a stale record reaches the UI, the row refuses to surface it.
- **Live X-button aria-label now flips reactively (B-107)** — the X button's `aria-label` now correctly announces "Close tab" on a live row and "Delete bookmark" on a non-live row, matching the action that fires (WCAG 2.1 SC 4.1.2 name-role-value). Previously the static initial label was always "Delete bookmark." Tracked from S35 B-100 R4 follow-up.

### Architecture
- **Three R2 binding-correction precedents established this sprint** — three R1 LOCKED claims about source code structure were factually wrong (B-108 D-2 token aliasing, B-111 D-4 open-tab delete buttons, B-113 D-5 open-tab draggability). Each was caught at R2 against the actual source. Gate 7 retrospective elevates this to a recurring R2 quality-gate pattern; future R1 tightens the discipline so source-shape claims are verified at lock time.
- **Flex-overlap pattern for sibling-affordance overlay (B-113)** — when two affordances share the same visual slot but only one renders at a time, use `flex: 0 0 <slot-width>; margin-left: -<slot-width>;` so the second affordance overlays the first via flex flow. This is invariant to border-edge changes (which `position: absolute` is not). Avoids per-row-state empirical tuning of `left:` values.

### Known limitations
- **§47.7 group-color matrix has inaccurate "PASS" verdicts** — B-109 R3 discovered atom-one-dark+yellow has been below 4.5:1 since B-104 shipped at 12% tint (current measurement at 20%: ~2.81:1). The §47.7 footnote claims 4.78:1 / 4.55:1; both incorrect. Tracked as **B-117** for a future sprint with R0 spike scope (re-verify all 126 cells; remediate any sub-AA via `--gc-<slot>` token adjustment, per-theme `--group-header-tint-amount` override, or accepted-limitation documentation).
- **Solarized-light visual hierarchy collapse** — post-B-108, `--text-primary` `#546a71` and `--text-secondary` `#546a72` differ by ~0.17% luminance (only the slight bluish bias distinguishes them). Documented in §54.9 Q1 as accepted tradeoff for AA compliance; future B-XXX may revisit with OKLCH-based hue-only blending.

### Note
- **No reload required.** All 9 S36 items are pure UI/UX changes — zero new pref keys, zero new manifest entries, zero storage schema changes. Update and use the new behavior immediately.

## [1.29.0] — 2026-04-26

### Changed
- **Delete (X) on a live bookmark now CLOSES THE TAB instead of deleting the bookmark (B-100)** — pressing X on a live row now closes the tab while preserving the saved bookmark, matching the most common user intent and most-reversible action. To delete the bookmark itself (a destructive action), use the new "Delete bookmark" entry in the right-click context menu, which shows an inline toast with **Undo** (~6 s window). The X button on non-live bookmarks is unchanged (still asks for confirmation before deleting). Keyboard Delete + Backspace keys on a focused row mirror the X-button behavior.
- **Group header tints brightened from 12% to 18% (B-106)** — group headers now show their chosen color more prominently for better at-a-glance group identity. WCAG AA contrast verified across all 14 themes; worst case is `atom-one-dark` + `yellow` at 4.78:1 (still above the 4.5:1 floor).
- **Solarized-light theme accessibility fix (B-105)** — body text against secondary surfaces (group headers, dialogs) now clears WCAG AA contrast (4.66:1 vs 4.39:1 pre-fix). Solarized canonical `--text-primary` `#586e75` adjusted slightly to `#546a71`. Group header tint now renders at 3% (was 0% in v1.28.0) — subtle but visible.

### Fixed
- **Cross-window demote: bookmark now correctly moves to Open Tabs in ALL windows (B-102)** — previously, demoting a bookmark in one window caused it to vanish entirely from non-originating windows (instead of moving to the Open Tabs section as it does in the originating window). Root cause: `diffAndPatch` fast-path branches updated the cache but never patched the Open Tabs DOM section; only the `renderAll` fallback rebuilt it. Fix: explicit `patchOpenTabsSection` call after every fast-path cache update.
- **Promote tab no longer leaves a duplicate row in Open Tabs (B-103)** — previously, after promoting an open tab to a saved bookmark, the original Open Tabs row would remain visible alongside the new bookmark (both showing active). Same root cause as B-102 (shared `diffAndPatch` fix). The new bookmark replaces the Open Tabs row atomically.
- **Group-jump popup color chips: slate, teal, indigo now render correctly (B-104 R3 / shipped in v1.28.0; tracked in changelog now as part of S35 release notes)** — the latent fall-back-to-avatar-bg bug for these 3 slots was actually closed in v1.28.0 by B-104 R3 D-2; documenting here for users who didn't notice in the v1.28.0 churn.

### Note
- **No reload required.** All 5 S35 items are pure UI/UX changes — zero new pref keys, zero new manifest entries, zero storage schema changes. Update and use the new behavior immediately.
- **Multi-window users**: B-102's cross-window demote fix should be visible immediately. If you don't see the fix taking effect on a multi-window setup, hard-reload the affected sidepanel windows (close + reopen) to flush the cached `diffAndPatch` state.

### Known limitations
- **Solarized-light: secondary text contrast (group counts, helper labels) still sub-AA at 3.636:1** — the B-105 fix focused on primary text. Secondary-text surfaces (`--text-secondary` including the `--group-count-text` badge) carry a separate pre-existing palette gap. Tracked as **B-108** for a future palette-fix sprint.
- **Live X-button aria-label** — still announces "Delete bookmark" on live rows even though the action is now "close tab" (label-action mismatch under WCAG 2.1 SC 4.1.2). Tracked as **B-107** for a follow-up sprint.

## [1.28.0] — 2026-04-26

### Changed
- **Group headers now tint with the group's chosen color (B-104)** — instead of just a small color chip, the entire group header bar shows a soft tint matching the group's palette pick (red/orange/yellow/green/teal/blue/purple/pink/indigo/slate). Tint reads at a glance without overwhelming the title text. Applies to side panel, new tab page, and group-jump popup.
- **Group palette is now theme-aware (B-104)** — your "red" group now looks Dracula-red in Dracula, GitHub-red in GitHub Light, and so on across all 14 themes. Picker swatches in the create/edit dialog also re-skin per theme so what you pick is what you'll see. The 9 slot identities (red, blue, green, etc.) stay stable across themes — only the rendered hue shifts to harmonize with the active palette. Hand-curated for One Dark / Atom One Dark / Dracula / GitHub Light / System (default); algorithmically derived for the other 9 themes via `color-mix` against each theme's `--bg-secondary`.
- **Drift indicator restyled as a dotted left-edge bar (B-101)** — replaces the 16 px warning triangle introduced in v1.27.0 with a 3 px dotted vertical bar in the row's left-edge gutter, stacked parallel to the active row's solid green border. Drift no longer competes with the audible / window-badge icons in the indicators strip. Hover the dotted bar to see the hostname tooltip ("Drifted to: github.com"). Sidepanel + standalone window only — newtab dot stays as-is.

### Fixed
- **Group-jump popup: slate, teal, and indigo color chips render correctly (B-104 D-2)** — these three slots were silently falling back to a generic avatar background due to a latent bug where the JS set the `--gj-group-color` CSS variable to a slot-name string (not a valid CSS color). Replaced with a declarative `[data-color="<slot>"]` attribute selector pattern; all 9 slots now render their theme-aware token color.

### Known limitations
- **`solarized-light` ships with no group-header tint (0%) (B-104 + new follow-up B-105)** — the `solarized-light` theme has a pre-existing baseline contrast issue where the body text vs. secondary background measures 4.39:1 (sub-AA before any tint is applied). B-104 surfaced this defect; rather than amplify it with a tint overlay, the new `--group-header-tint-amount` per-theme override sets solarized-light to 0% (group headers render at the bare baseline color — no worse than v1.27.0, no improvement either). All other 13 themes ship at the standard 12% tint. **B-105** tracks the underlying theme palette fix so future tinted-surface features can apply non-zero tints on solarized-light.

### Note
- **No reload required.** B-101 + B-104 introduce zero new pref keys, zero new manifest entries, and zero storage schema changes — you can update and use the new behavior immediately. **Tip**: if the side panel doesn't pick up the new visuals immediately after updating, hard-reload it (close + reopen the side panel) to flush the cached CSS.

## [1.27.0] — 2026-04-25

### Fixed
- **Drift detection now persists across URL changes (B-099)** — fixes a behavior defect that has been latent since the initial drift implementation. Previously, when a saved bookmark's claimed live tab navigated to a different URL, the bookmark↔tab association was silently severed and the now-unclaimed tab "orphaned" into Open Tabs as if you had opened a fresh untracked tab. Now the bookmark↔tab association survives URL drift: the saved bookmark keeps its live indicator AND gains a drift warning indicator (orange triangle in side panel, orange dot on the new tab page) until either the live tab navigates back to the saved URL, you close the tab, you snap the bookmark to the new URL (see below), or you explicitly delete the bookmark.

### Added
- **"Snap to this tab" context menu action (B-099)** — right-click any drifted bookmark to update its saved URL to wherever the live tab currently is. The action is only present in the menu when the bookmark has drifted. After clicking, an inline toast appears with an **Undo** button — you have ~6 seconds to revert if it was an accident. The original URL is preserved by closure during the undo window, so undo always restores exactly what was there before.
- **Drift indicator hover tooltip** — hover the orange drift triangle (side panel) or drift dot (new tab page) to see the hostname the tab has drifted to (e.g., "Drifted to: github.com"). Helps you decide whether to snap or close at a glance without having to switch to the tab.
- **Drift indicator size bump (side panel only)** — drift triangle increased from 14 px to 16 px in the side panel for slightly better visual prominence in dense lists. New tab page drift dot remains at 12 px (dense-grid-friendly).

### Note
- **No reload required.** B-099 introduces zero new pref keys, zero new manifest entries, and zero storage schema changes — you can update and use the new behavior immediately. (The `Alt+Comma` Settings shortcut and theme additions from v1.26.0 still require the one-time extension toggle described in the v1.26.0 notes if you have not already done so.)

## [1.26.0] — 2026-04-25

### Added
- **Theme selection (B-037)** — choose from 14 themes inspired by popular IDE color schemes (Dracula, Nord, One Dark, Monokai, Tomorrow Night, Atom One Dark, Solarized Dark, GitHub Dark, Tokyo Night, Tomorrow, Atom One Light, Solarized Light, GitHub Light, plus System default that auto-switches with your OS dark/light preference). Theme picker lives in Settings → Theme. Selected theme applies instantly across all surfaces (side panel, new tab page, standalone window, popup, group-jump popup) within ~500ms via broadcast.
- **Settings keyboard shortcut (B-097)** — `Alt+Comma` opens the Settings page directly. Customizable via `edge://extensions/shortcuts` (or `chrome://extensions/shortcuts`).
- **Toolbar popup → Settings link (B-095)** — quick-search popup footer (Alt+J) gains an "Open Settings" button alongside the existing "Open side panel" entry.

### Changed
- **Theme architecture refactor** — palette declarations consolidated to `shared/themes.css` (eliminates ~3,500 LOC triplication across sidepanel/newtab/settings/popup); FOUC-guard scripts consolidated to `shared/theme-init.js`. Cross-surface helper factor-out (`shared/surface-prefs.js`, `shared/settings-tab.js`, `shared/theme-slugs.js`).
- **Process polish (B-094)** — CLAUDE.md gains C-1 stale-SW release-note guidance + R1 selector-audit subsection (Sprint 30 retro action items closed).
- **Hygiene bundle (B-088)** — 8 carry-forward fixes from S25-S31: cross-surface helper factor-out, ghost-key cleanup (`newTabOverride` removed from prefs), DRAG_DEBUG removal, dead-code removal (`_tabById`), `_pickerRowFromGroup` O(n+m) perf fix, banner text-node 3-path collapse, nested-catch simplification, JSDoc/comment drift pass.
- **Import validator sync (B-096)** — JSON import now accepts the full theme enum (was silently dropping new B-037 slugs as fail-closed pre-existing defect).

### Removed
- **`newTabOverride` ghost-key** (B-088 fix #2) — pref retained from B-039 drop in S29 has been fully removed from `DEFAULT_PREFERENCES` + validators. Backups containing the legacy field strip it on import.

### Note
- **After updating: please disable and re-enable Tab Junkie at `edge://extensions`** (or `chrome://extensions`). This flushes the SW module cache so:
  - The extended theme validator allows the new theme slugs (S30/B-092 stale-SW precedent).
  - The new `Alt+Comma` Settings shortcut registers (new `commands` manifest entry; per CLAUDE.md C-1 stale-SW guidance added in this same release).
- Without this step, you may see "Could not save" errors on theme selection or the Settings shortcut may not respond until the SW restarts naturally.

## [1.24.0] — 2026-04-24

### Added
- **Settings page** — the gear icon (⚙) in the side panel header now opens a dedicated full-page Settings tab instead of a compact modal. The Settings page hosts all preference controls with plenty of room to read labels and descriptions. If a Settings tab is already open, the gear button focuses it rather than opening a second copy. Close the tab to return to browsing.
- **Compact layout toggle** — Settings → Layout → **Compact layout**. When on, bookmark rows in the side panel and new tab grid collapse to a single line with smaller fonts, letting you see more bookmarks at once without scrolling. Default off; existing layouts are unchanged.
- **Import / Export rehomed to Settings** — the Import and Export controls have moved from the side panel header buttons into Settings → Data. All four flows (Export HTML, Export JSON, Import HTML, Import JSON) are preserved, including the replace-all confirmation dialog for destructive imports.

### Changed
- **Side panel header decluttered** — only the New Group and Settings (gear) buttons remain in the header action cluster. The Import and Export buttons have moved to Settings → Data (see above).
- **Settings modal deprecated and removed** — the compact B-089 modal dialog is replaced by the full-page Settings tab described above.

### Note
After updating, disable and re-enable Tab Junkie at `edge://extensions` (or `chrome://extensions`) to flush the service worker module cache. This ensures all new preference keys (such as the compact layout toggle) register correctly. Without this step you may see a "Could not save" error on new preference toggles until the service worker restarts on its own.

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
