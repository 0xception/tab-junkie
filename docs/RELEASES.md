# Tab Junkie — Release Notes

Local reference copy. Source of truth: GitHub Releases.

---

## v1.10.0 — URL Policy + Menu Polish (2026-04-18)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.10.0`.**

**Staging commit**: current HEAD on `release/v2` (Sprint 15 feat commit — see `git log --oneline -1`).

### What's new

**Broader URL-scheme support (B-058)**
- Tab Junkie now accepts `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` URLs when saving a bookmark. Power users can track configuration pages, extension settings, and source views alongside regular sites.
- `javascript:` and `data:` schemes remain hard-rejected (XSS / payload vectors) — no change in security stance.
- Fixed a latent asymmetry where `file:` was allowed by the storage allowlist but rejected by a parallel prefix block-list inside `MSG_PROMOTE_TAB`. Scheme validation now flows through a single path (`normalizeUrl` → `ALLOWED_URL_SCHEMES`) so additions in one place never drift from the other.
- Cross-browser portability note: a saved `edge://` URL won't work in Chrome, and vice versa. Tab Junkie stores URLs verbatim; browser compatibility is the user's responsibility.

**Group header context menu (B-027)**
- Right-clicking a group header now opens a dedicated group-level context menu with: Open all bookmarks, Close all open tabs, Select all / Select open / Select bookmarked, Edit group, and Delete group.
- Destructive actions (Close all tabs, Delete group) are gated behind confirmation dialogs and visually styled red.
- Selection actions populate the bulk selection set using prefixed keys (`item:<id>`) so the B-024 bulk action bar activates immediately.
- Right-clicking the Ungrouped header no longer opens a Tab Junkie menu — the browser's native right-click menu is shown instead (it has no group-level actions to offer).

**Duplicate URL saves with soft-warn (B-059)**
- Saving a URL that already exists in your collection is now allowed. Instead of the previous `ERR_DUPLICATE_URL` blocking error, a confirmation dialog appears: "URL already saved as *{title}* in *{group}*. Save another copy?"
- Applies to single-tab save (Open Tabs row context menu → "Save to group") and bulk Save-to-group (aggregate dialog: "N of M tabs already saved"). Cancel aborts; confirm creates an additional copy.
- Service worker no longer performs O(n) duplicate-scan on every promote — detection moved to the client against the already-maintained `_cachedItems` cache. Measurable promote-latency win on large collections.
- Floating-group reassociation after a browser restart is unchanged; B-018's `(windowId, tabIndex)` tie-break handles duplicate-URL ambiguity correctly.

**Dimmed "cannot save" Open Tabs rows (B-061)**
- Rows in the Open Tabs section whose URL has a permanently-unsavable scheme (`javascript:`, `data:`) are now dimmed with a "Cannot be saved — unsupported URL scheme" tooltip.
- Rows that would produce a duplicate-URL soft-warn (B-059) render normally — dimming is strictly about scheme, not about duplicates.

### Known limitations

- **Dark-theme primary-button contrast below WCAG AA** — the "Save anyway" button in the B-059 soft-warn dialog uses the existing `--accent` / white text treatment that has been in place since Sprint 2 (B-003 / B-006 Save buttons). Dark-theme contrast measures ~2.3:1, below the 4.5:1 AA floor. Tracked as **B-062** (P1, S) for Sprint 16 — whole-app primary-button contrast sweep.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-058 | `tests/b058-scheme-allowlist.test.js` | `shared/url.js`, `background/messages/storage-handlers.js`, `tests/promote-tab.test.js`, `tests/legacy-migration.test.js` |
| B-027 | `tests/b027-group-header-menu.test.js` | `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html` |
| B-059 | `tests/b059-duplicate-warn.test.js`, `docs/UAT_B-059.md` | `background/messages/storage-handlers.js`, `shared/errors.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `tests/promote-tab.test.js` |
| B-061 | `tests/b061-unsavable-dim.test.js` | `shared/url.js` (exported `isUnsavableScheme`), `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css` |
| R6 close | — | `docs/SOLUTION_DESIGN.md` §29 added (B-059 R2 design) + §29.14 populated (R6 close) |
| R7 docs | — | `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/open-tabs.md`, `docs/user-manual/managing-items.md` |

- +30 new automated tests (575 → 605 total), all passing.
- **No storage schema change. No manifest permission change. No migration required.**
- SOLUTION_DESIGN.md §29 is a 500+ line new chapter covering the B-059 R2 design, decision rejections, rollback plan, and §29.14 R6 close deviations.

### Test results

- Automated: **605 / 605 passing** (0 fail, 0 skipped, 0 todo).
- UAT: `docs/UAT_B-059.md` (12 cases covering all B-059 ACs + regression on destructive delete dialog variant leak + keyboard-only flow). Fast Track items (B-058, B-027, B-061) covered by zero-regressions against the full suite; no separate UAT doc per pipeline rules.
- R4 review rollup: 0 CRITICAL, 2 HIGH (both fixed before R5), 15 MEDIUM (all fixed or consciously deferred), 36 LOW (mostly deferred as nits).

### Rollback

No storage schema change, no permission change, no data migration — rollback is a straightforward `git revert`.

```
# On release/v2:
git revert HEAD   # reverts Sprint 15 feat commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions
# 2. Load prior-version zip (tab-junkie v1.9.0)
# No storage cleanup needed.
```

**Post-rollback behaviour:**
- B-058: `chrome://` / `edge://` / etc. URLs saved during v1.10.0 remain in storage; they're user-intended and the data layer has always accepted them. Only new saves via `MSG_PROMOTE_TAB` hit the restored reject path.
- B-059: Duplicate items created during v1.10.0 remain saved; they behave normally for navigation, drift, claims, and delete. Only re-promoting one of them hits the restored `ERR_DUPLICATE_URL` reject.
- B-027 + B-061: Pure UI — rollback removes the menu / dimming; no state to clean up.

---

## v1.9.0 — Multi-window Awareness + URL Policy Spike (2026-04-17)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.9.0`.**

**Staging commit**: current HEAD on `release/v2` (Sprint 14 feat commit — see `git log --oneline -1`).

### What's new

**Multi-window awareness & window badge (B-014)**
- Session-ordinal window numbering assigns stable labels (W1, W2, …) to browser windows in first-seen order. Ordinals are gap-preserving — closing W2 while W3 is open keeps W3 labelled W3. Ordinals are never written to storage; they are rebuilt on every service worker cold start via `chrome.windows.getAll`.
- Saved-item and Open Tabs rows now display a window badge (W1, W2, …) when the associated tab lives in a different browser window than the side panel.
- When two or more windows are open, a filter row appears in the panel header: an "All" chip and one chip per open window. Selecting a chip narrows the panel to that window's tabs. The filter row is keyboard-navigable (Arrow keys, Home/End, Enter/Space) following the ARIA `role="tablist"` pattern. The active filter resets to "All" automatically if the filtered window closes.
- `MSG_LIST_ITEMS` response extended with a `windowMap` field (`{ [windowId]: ordinal }`) so the sidepanel can resolve ordinals without a separate IPC round-trip.
- New `SCOPE.WINDOW_MAP` broadcast fires whenever window-to-ordinal mapping changes (window open, close, or focus change). Sidepanel updates all row badges in response.
- `tabs.onAttached` handler added to detect cross-window tab drags and retrigger ordinal re-assignment.
- New modules: `background/tabs/window-ordinals.js` (154 lines — ordinal registry + `initWindowOrdinals`), `shared/scopes.js` (new SSOT for all broadcast scope constants, eliminating bare-string comparisons).
- Absorbed **B-034** (window label filter row) — no separate sprint item needed.

**URL-scheme allowlist + duplicate-URL policy spike (B-057)**
- Completed a research-only Spike-First (XL) item documenting the current URL allowlist behavior and the cost of the existing `ERR_DUPLICATE_URL` hard-rejection policy in `MSG_PROMOTE_TAB`.
- Decisions accepted: (1) Expand the allowlist to cover `chrome://`, `edge://`, `chrome-extension://`, `about:`, and `view-source:` schemes; keep hard-reject for `javascript:` / `data:`. (2) Replace the hard `ERR_DUPLICATE_URL` rejection with a soft-warn UI.
- Implementation deferred to Sprint 15 (B-058 S, B-059 M, B-060 S, B-061 XS). B-056 retired to icebox.
- Spike output: `docs/spikes/B-057-url-policy-spike.md` (277 lines).
- No user-visible behavior changes this sprint from the spike.

### UAT-discovered in-sprint improvements

| # | Finding | Fix |
|---|---------|-----|
| UAT-D1 | Window filter chip `:focus-visible` outline was invisible in dark mode — `--accent-subtle` (`#1e293b`) too close to the panel background. | Switched to `outline: 2px solid var(--accent)` on the chip element. |
| UAT-D2 | Dragging a tab between windows while a window filter was active left the row visible in the wrong filter view — `refetchAndPatchLiveState` and the `SCOPE.WINDOW_MAP` broadcast handler patched `data-window-id` but never re-ran `applyFilter()`. | Added `if (_filterQuery \|\| _activeWindowFilter !== null) applyFilter();` to both handler paths. |

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-014 | `shared/scopes.js`, `background/tabs/window-ordinals.js`, `tests/window-ordinals.test.js` (12 tests), `tests/b014-multi-window.test.js` (25 tests), `docs/user-manual/multi-window.md` | `shared/messages.js`, `background/broadcast.js`, `background/tabs/index.js`, `background/tabs/tab-claims.js`, `background/tabs/tab-events.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html`, `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js`, `tests/chrome-mock.js` |
| B-057 | `docs/spikes/B-057-url-policy-spike.md` | — |

- +51 new automated tests (481 → 532 total), all passing
- No storage schema change. No manifest permission change. No migration required.
- SOLUTION_DESIGN.md updated §28.12 (R6 Close — B-014, B-057).

### Test results
- Automated: 532/532 passing
- UAT: PASS — B-014 (12/14 steps; 2 skipped — 3+ window edge cases not exercisable in single-session UAT, but logic covered by `tests/window-ordinals.test.js`). B-057 spike: no UAT required (research-only item).

### Rollback

No storage schema change — rollback requires no data cleanup.

```
# On release/v2:
git revert HEAD   # reverts Sprint 14 feat commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions
# 2. Load prior-version zip (tab-junkie v1.8.0)
# No storage cleanup needed — windowMap is runtime-only (never persisted);
# shared/scopes.js is a pure constant module; window-ordinals state is rebuilt
# on every cold start from chrome.windows.getAll.
```

Reverting the Sprint 14 commit removes the window badge, the window filter row, and `shared/scopes.js`. The `windowMap` field on `MSG_LIST_ITEMS` responses reverts to `undefined`; the sidepanel treats that as "single-window mode" and hides the filter row — benign. The `SCOPE.WINDOW_MAP` broadcast handler is also removed; any stale sidepanel that receives a rogue broadcast will hit an unrecognised scope and no-op safely.

---

## v1.8.0 — Open Tabs Section, Selection Menu, Keyboard Shortcuts (2026-04-17)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.8.0`.**

### What's new

**Open Tabs section (B-055)**
- New pinned section at the bottom of the side panel surfaces every live browser tab that is not yet saved or grouped. Click any row to focus the tab; right-click for "Save to group" or "Close tab". The section updates in real time as tabs open, close, or navigate and participates in the inline filter, multi-select, and bulk action bar.
- `MSG_LIST_ITEMS` response extended with `openTabs[]` array (no new message constant; existing contract extended additively).
- New module: `background/tabs/open-tabs.js` — assembles the open-tabs payload by diffing `LiveTabIndex` against claimed item IDs.
- UAT surfaced an insufficiently diagnostic error toast for multi-tab save failures; fixed in-sprint with a categorised breakdown: `"…(X already saved, Y restricted URL, Z other error)"`.
- Known limitation: tabs with restricted URL schemes (`edge://`, `chrome://`, `about:`, etc.) and tabs whose URL matches an existing saved bookmark cannot be saved. Rows are not yet visually distinguished. B-056 (visual dimming) and B-057 (URL/scheme policy SPIKE) are scheduled for Sprint 14.

**Selection context menu (B-028)**
- Right-clicking while two or more items are selected opens a selection-aware context menu offering Move to group, Close tabs, and Remove — the same operations as the bulk action bar, now reachable via keyboard-free right-click.
- Reuses B-026 menu infrastructure; dispatch branches by `_selection.size >= 2`. Bulk-bar handlers extracted into shared `_bulkMoveToGroup` / `_bulkClose` / `_bulkRemove` helpers so bar and menu share a single code path.
- New helper: `shared/selection.js` — `pruneSelection(selection, validIds)` removes stale item IDs from a `Set` before bulk actions run.

**Keyboard shortcuts — verify + regression (B-047)**
- Audited B-024's existing keydown handlers: all 3 ACs already met (Ctrl/Cmd+A selects all visible items including Open Tabs rows; Escape clears selection; text-input guard via tagName block-list + filter-input `stopPropagation`). Zero production code changes. Added 17 regression tests covering the open-tab mixed-row path, dialog-open guard, and filter-input suppression.

**Sort-order normalisation + selection pruning (B-051)**
- `normaliseGroupSortOrders` runs after every create, delete, move, bulk-create, and bulk-update operation. Assigns sequential `0..N−1` positions per group bucket; idempotent fast-path skips storage writes when positions are already normalised. Lays the groundwork for reliable drag-reorder.
- `WRITE_MESSAGE_TYPES` constant and `isWriteType()` helper added to `shared/messages.js` for safe-mode write-gate enforcement.

### UAT-discovered in-sprint improvement
- Block 2 step 8 (bulk-save to group from Open Tabs) failed due to the generic "Couldn't save N tabs — check URL scheme or duplicates" toast. Fixed before sprint close: toast now reports `"(X already saved, Y restricted URL, Z other error)"` breakdown, matching the single-tab context-menu path.

### Internal

| Item | Files added | Files changed |
|------|-------------|---------------|
| B-055 | `background/tabs/open-tabs.js`, `docs/user-manual/open-tabs.md` | `shared/messages.js`, `background/tabs/live-tab-index.js`, `background/tabs/tab-events.js`, `background/messages/storage-handlers.js`, `background/storage/items.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, 5 test files |
| B-028 | `tests/b028-selection-context-menu.test.js` (12 tests) | `sidepanel/sidepanel.js` |
| B-047 | — | `tests/b024-multi-select.test.js` (+17 tests) |
| B-051 | `shared/selection.js`, `tests/b051-normalisation.test.js` (18 tests) | `background/storage/items.js`, `sidepanel/sidepanel.js`, `tests/b005-bulk-create.test.js` |

- +54 new automated tests (427 → 481 total), all passing
- No storage schema change. No manifest permission change. No migration required.
- SOLUTION_DESIGN.md updated §26 (B-055), §26.9 (B-028), §26.10 (B-047), §26.11 (B-051), §26.12 R6 Close.

### Test results
- Automated: 481/481 passing
- UAT: PASS — B-055 (Block 1: 7/7, Block 2: 3/3 PASS + 2 SKIP, Block 3: 6/6), B-028 (PASS — verified as part of B-055 Block 3 step 16), B-047 (PASS — verified as part of B-055 Block 3 keyboard interactions), B-051 (PASS — verified implicitly by B-055 Block 2 step 9 promote flow)

### Rollback

No storage schema change — rollback requires no data cleanup.

```
# On release/v2:
git revert 0f7e54d   # reverts Sprint 13 commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions (or chrome://extensions)
# 2. Load prior-version zip (tab-junkie v1.7.0)
# No storage cleanup needed — Open Tabs section is read-only from storage's perspective;
# selection.js is a pure in-memory helper; sort normalisation writes are non-destructive.
```

Reverting the Sprint 13 commit removes the Open Tabs section (`openTabs[]` field on `MSG_LIST_ITEMS` response), the selection context menu, and `shared/selection.js`. Any cached `openTabs` state in the sidepanel is re-initialised on next `MSG_STATE_CHANGED` broadcast — benign. The `normaliseGroupSortOrders` write-back is also reverted; existing normalised sort values remain as written and cause no corruption.

---

## v1.7.0 — Multi-select, Context Menu, Empty States (2026-04-17)

**Staged on `release/v2` — pending v2 merge to main. Intended tag: `v1.7.0`.**

### What's new

**Multi-select + bulk action bar (B-024)**
- Click to select, Shift+Click for range, Ctrl/Cmd+Click to toggle, Ctrl/Cmd+A for all visible, Escape to clear selection. Selection state lives entirely in sidepanel memory — never persisted.
- Bulk action bar appears when one or more items are selected: shows item count, and offers Move to group (picker), Close tabs (live items only, disabled when none selected are live), Remove (demotes live items; fully deletes saved-only items; confirmation required), and Clear.
- Partial-failure paths: bulk-remove uses `Promise.allSettled` so first-failure does not abort remaining ops; selection is pruned to IDs that succeeded; failure count surfaces as a toast.
- Two new SW message contracts: `MSG_BULK_DELETE_ITEMS` (bulk delete saved items, `MAX_BULK_INPUTS` cap, partial-success envelope `{ deleted, notFound }`) and `MSG_BULK_UPDATE_ITEMS` (bulk patch `groupId`, same cap, `{ updated, notFound }`). Wire contracts documented in SOLUTION_DESIGN.md §25.
- `tabId` now surfaced on every `liveStates[itemId]` entry (one-line addition in `background/tabs/tab-claims.js`), enabling the bulk-close and context-menu close flows to dispatch correct Chrome tab IDs without a second IPC round-trip.

**Right-click item context menu (B-026)**
- Right-click any item row to open a viewport-clamped context menu: Navigate, Edit, Move to group, Close tab (live items only), Delete (visually distinguished in red).
- No new message contracts — dispatches existing `MSG_NAVIGATE_TO_ITEM`, `MSG_UPDATE_ITEM`, `MSG_BULK_UPDATE_ITEMS`, `MSG_CLOSE_TABS`, `MSG_DELETE_ITEM`.
- Uses in-memory `_cachedGroups` for the "Move to group" picker — zero extra IPC on menu open.
- Menu is closed automatically on `MSG_STATE_CHANGED` broadcast (prevents stale row under menu after cross-window data change).

**Empty states + dismissible error toasts (B-049)**
- Empty bookmark list: icon + "You haven't saved any bookmarks yet" + "Add your first bookmark" CTA.
- Empty filter: "No results for '<query>'" + "Clear filter" link.
- Empty group: per-group inline "No items in this group" message.
- Toast system: 4 s auto-dismiss, manually dismissible, single-toast queue, `role="alert"` + `aria-live="assertive"` — surfaces partial-failure counts and other recoverable errors.

### UAT-discovered defects fixed in-pipeline

Both found during interactive UAT (sprint close UAT session) and fixed before the sprint was closed. Full details in `docs/SPRINT_FINDINGS.md` ("UAT-Discovered Defects" section).

| # | Finding | Fix |
|---|---------|-----|
| UAT-D1 | Confirm dialog stayed open after clicking Delete — pre-existing latent bug in the generic `_pendingConfirmCallback` handler; affected single-item delete too. | Capture callback, call `closeDialog()`, then invoke callback. |
| UAT-D2 | Filter-empty "Clear filter" button also triggered the Add Bookmark dialog — both CTAs shared `.empty-state-cta`, and the document handler matched both. | Narrowed selector to `.empty-state-cta:not(#filter-empty-clear-btn)`. |

### Internal

- New test file: `tests/b024-multi-select.test.js` (+53 tests)
- Updated: `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js`
- +53 new automated tests (374 → 427 total), all passing
- No storage schema change. No manifest permission change. No migration required.
- SOLUTION_DESIGN.md updated to v2.6 (§25 B-024, §25.9 B-026 + B-049, §25.10 UAT defects, §25.11 rollback plan)

### Test results
- Automated: 427/427 passing
- UAT: PASS — B-024 (12/12 gesture + bulk-bar steps), B-026 (11/11), B-049 (3/3 empty-state paths; error-toast trigger deferred — tracked as Task #7)

### Rollback

No storage schema change — rollback requires no data cleanup.

```
# On release/v2:
git revert <commit-sha>   # reverts Sprint 12 commit

# If extension already loaded by users:
# 1. Unload the extension in edge://extensions (or chrome://extensions)
# 2. Load prior-version zip (tab-junkie v1.6.1)
# No storage cleanup needed — bulk ops are additive; reverting the code
# does not corrupt or orphan any existing data.
```

Removing the Sprint 12 commit drops `MSG_BULK_DELETE_ITEMS` and `MSG_BULK_UPDATE_ITEMS` from the dispatcher. Any in-flight request from a stale sidepanel will fall through to `ERR_VALIDATION` in the default dispatch branch — benign. The `tabId` field on live states reverts to `undefined`; the bulk-close UI treats that as "not live" (button disabled), not as an error.

---

## v1.6.1 — Sidepanel Shell Correctness + Floating Tab Persistence Fixes (2026-04-16)

### Fixed

**Sidepanel shell (B-054)**
- SVG icon factories (`_createAudibleIcon`, `_createDriftedIcon`) extracted and corrected — icons were previously inlined incorrectly and would fail to render in strict CSP environments
- `itemMap` lookup converted from O(N²) linear scan to O(1) Map — eliminates render lag with large collections
- Nested-group drag selector fixed — drag operations on items inside nested groups no longer silently no-op
- `replaceChildren` applied consistently across all list renders — prevents residual DOM nodes from stale renders

**Floating tab persistence (B-018)**
- `pruneResolvedFloatingGroups` race fixed — now reads the live current record rather than a stale snapshot captured before concurrent appends; prevents silent record loss under concurrent writes (TOCTOU)
- Claim-failure path corrected — a tab that fails to claim no longer gets marked as resolved; floating-group records are retained for the next reconciliation pass instead of being permanently dropped

### Internal
- 42 new automated tests (374 total: 332 baseline + 33 B-054 + 9 B-018), all passing
- SOLUTION_DESIGN.md v2.5 (§23 B-054, §24 B-018)

### Test results
- Automated: 374/374 passing
- UAT: PASS — B-054 (16/17 ACs; AC12 SKIP — requires browser environment), B-018 (13/13 ACs)

---

## v1.6.0 — Opener-chain Inheritance, Bulk-create, Circular Dep Fix (2026-04-16)

### What's new
- **Opener-chain group inheritance (B-013)** — when a new tab is opened from an existing claimed tab, the new tab is automatically assigned to the same group as the opener. The full opener chain is walked (up to 5 hops) so tabs opened transitively from a group member stay associated. Tab removal is detected asynchronously; stale openerMap entries are pruned with a configurable cap (`MAX_OPENER_MAP_ENTRIES`) to prevent unbounded memory growth.
- **Bulk-create saved items (B-005)** — new `MSG_BULK_CREATE_ITEMS` message accepts up to 500 items in a single atomic write transaction. Input is validated per-item; invalid candidates are collected and returned in `skipped[]` rather than aborting the whole batch. Enables future import UI and batch-promote workflows.

### Internal (B-053)
- Broke the circular dependency between `background/storage/partitions.js` and `background/storage/write-transaction.js` by extracting shared constants and shape helpers into a new `background/storage/shapes.js` module. Both modules now import from `shapes.js`; no behavior change.
- 40 new automated tests (332 total), all passing
- SOLUTION_DESIGN.md v2.3 (§20 B-053, §21 B-013, §22 B-005)

### Test results
- Automated: 332/332 passing
- UAT: PASS — B-013 (10/10 ACs), B-005 (10/10 ACs), B-053 regression PASS

---

## v1.5.0 — Favicons, Live Tab State, Group Reorder, Inline Filter (2026-04-16)

### What's new
- **Favicon auto-capture** — bookmark and live-tab rows show the site favicon; letter-avatar fallback (first char of title, color-hashed) when no favicon is available or when the URL fails the `isSafeFaviconUrl` scheme guard (`https://` and `chrome-extension://` only)
- **Live tab indicators** — sidepanel rows reflect live/active/audible state in real time; active tab highlighted distinctly; audible tabs show a speaker icon; multi-window `onFocusChanged` gap closed
- **Group drag-to-reorder** — groups can be dragged to any position; `sortOrder` persisted to storage via `MSG_UPDATE_GROUP`; collapse/expand state persisted across reloads; drag handle visible on hover; concurrent-render guard prevents drop indicator destruction mid-drag
- **Inline filter** — `#filter-input` with 150ms debounce; matching text highlighted with `<mark>` (XSS-clean DocumentFragment approach); `#filter-empty-state` aria-live region; `_itemById` O(1) Map replaces O(n²) linear scan; filter clears on group navigation

### Internal
- `isSafeFaviconUrl` scheme allowlist guard (security fix, B-010 H-5)
- `_ensureIndicators` for post-render audible icon injection (B-010 H-8)
- `mousedown` flag pattern for drag guard instead of broken `e.target.closest()` on section element (B-008 H-1)
- `_pendingGroupsRender` guard prevents concurrent render during active drag (B-008 H-4)
- `buildHighlightedText` uses `lowerQuery.length` for correct Unicode slicing (B-021 M-3)
- 63 new tests (285 total), all passing
- SOLUTION_DESIGN.md v2.1 (§17 B-010, §18 B-008, §19 B-021)

### Bookmark CRUD (shipped with Sprint 7 / no prior release)
- **Create, edit, delete bookmarks** — inline dialog in sidepanel with form validation, focus trap, and confirmation dialog for destructive actions

### Test results
- Automated: 285/285 passing
- UAT: PASS — B-004 (8/8 ACs), B-010 (12/12 ACs), B-008 (12/12 ACs), B-021 (10/10 ACs)

---

## v1.4.0 — Core Message Contract Complete (2026-04-15)

### What's new
- **State broadcast (MSG_STATE_CHANGED)** — every mutation + tab event notifies all open extension surfaces
- **Navigate-to-item (MSG_NAVIGATE_TO_ITEM)** — switch to existing tab or open new one with immediate claim
- **Close tabs (MSG_CLOSE_TABS)** — individual + bulk close with smart partition (valid vs gone)

### Internal
- `background/broadcast.js` with `SCOPE` enum and fire-and-forget delivery
- Cold-start broadcast suppression via `isClaimsReady` gate
- 18 message types in contract (up from 15)
- `lastAccessedAt` bug fix (was rejected by `validatePatch`)
- 26 new tests (205 total), all passing
- SOLUTION_DESIGN.md v1.5

### Test results
- Automated: 205/205 passing
- UAT: skipped (data-layer only)

---

## v1.3.0 — Phase A Features (2026-04-15)

### What's new
- **Group palette enforcement** — 9 semantic colors validated at create/edit time
- **Duplicate-name warning** — non-blocking soft warning when creating groups with conflicting names at the same level
- **Promote tab → bookmark** — `MSG_PROMOTE_TAB` saves a live tab as a persistent item with immediate claim, duplicate-URL detection, and scheme filtering
- **Demote bookmark → floating tab** — `MSG_DEMOTE_ITEM` removes saved status while preserving the live tab, saving floating-group position for cold-start re-association

### Internal
- `shared/constants.js` with frozen GROUP_COLORS palette
- `ERR_DUPLICATE_URL` error code
- 15 message types in contract (up from 13)
- 60 new tests (179 total), all passing
- SOLUTION_DESIGN.md v1.4

### Test results
- Automated: 179/179 passing
- UAT: skipped (data-layer only)

---

## v1.2.0 — Foundation Complete + URL Normalization (2026-04-15)

### What's new
- **Drift detection** — items flagged when their live tab navigates away from the saved URL; drift persists across restarts; clears automatically when tab navigates back
- **Floating-tab re-association** — group assignments survive browser restarts via exact window+index matching with URL fallback
- **URL normalization** — unified `normalizeUrl()` in `shared/url.js` with protocol defaulting, scheme validation, hostname lowercasing, fragment handling
- **Scheme allowlist update** — `http`/`https`/`file` accepted; `ftp`/`mailto` removed

### Internal
- New: `background/tabs/drift.js` (~120 LoC), `background/tabs/floating-groups.js` (~120 LoC), `shared/url.js`, `shared/errors.js`
- `StorageError` + `ERR_*` constants moved to `shared/errors.js` (canonical home)
- 35 new tests (119 total), all passing
- SOLUTION_DESIGN.md v1.3
- **Entire B-001 family (a/b/c/d) now complete** — full data layer shipped

### Known limitations
- No UI: sidepanel, newtab, popup still stubs
- No floating-group TTL (stale records may accumulate)
- `file:` URLs storable but may not be openable in MV3

### Test results
- Automated: 119/119 passing
- UAT: skipped

---

## v1.1.0 — Data Layer Completion (2026-04-15)

### What's new
- **Schema migration runner** — forward-only migration pipeline with `readyPromise` barrier; schema version tracked in `tj:meta.schemaVersion`; migrations execute atomically within `writeTransaction`
- **Downgrade safe-mode** — when the extension detects a newer schema version than it knows, all writes are blocked (`ERR_SAFE_MODE`); reads continue working; detectable via `MSG_GET_STATUS`
- **Quota monitoring** — 80% storage quota warning surfaced via `MSG_GET_STATUS` response
- **Legacy key migration** — `junkie_*` keys from v1 are shape-mapped to Items (best-effort) and removed on first startup
- **Live tab tracking** — in-memory `LiveTabIndex` rebuilt from `chrome.tabs.query` on every cold start; tracks `live`, `active`, `audible` per tab without any `storage.local` writes
- **Tab-claims disambiguation** — `TabClaims` in `storage.session` maps each saved item to a specific live tab; handles multiple items sharing one URL via first-unclaimed-wins in sort order
- **Enriched MSG_LIST_ITEMS** — response now includes `liveStates` map alongside items, providing real-time live/active/audible state per item at read time

### Internal
- New: `background/storage/migration.js` (~255 LoC)
- New: `background/tabs/` (4 modules, ~433 LoC)
- `ERR_SAFE_MODE` + `MSG_GET_STATUS` added to contracts
- Per-tab debounce on URL-change reevaluation (100ms, prevents claim races)
- `claimsReady` flag prevents stale reads before cold-start reconciliation completes
- Test suite: 81 automated tests, all passing (47 new)
- SOLUTION_DESIGN.md updated to v1.2

### Known limitations
- No UI: sidepanel, newtab, and popup are still empty stubs
- No drift tracking or floating-tab re-association (B-001d)
- Migration runner scaffold limited to single-partition atomicity (refactor needed for first real step)
- UAT skipped for this release (data-layer only)

### Test results
- Automated: 81/81 passing
- UAT: skipped

---

## v1.0.0 — Foundation Storage Layer (2026-04-15)

### What's new
- Partitioned storage schema: six isolated keys (`tj:meta`, `tj:items`, `tj:groups`, `tj:prefs`, `tj:drift`, `tj:floatingGroups`) under `chrome.storage.local`
- Full item and group CRUD with validation and strict group-depth enforcement (max depth 1)
- ULID-based IDs: sortable, stable, collision-free, never derived from URL or title
- Atomic writes via `writeTransaction()`: multi-step ops commit in a single `storage.local.set`, safe against mid-write service worker termination
- Service worker as sole writer: all UI surfaces send messages; the SW serializes all writes
- Message contract in `shared/messages.js` for UI-to-SW communication (12 message types)
- Placeholder UI stubs for sidepanel, newtab, and popup (extension loads cleanly)

### Internal
- Storage module: `background/storage/` (~910 LoC, 8 modules)
- Message handler: `background/messages/storage-handlers.js` (~145 LoC)
- ESLint `no-restricted-imports` enforcing write-boundary at lint time
- Test suite: 34 automated tests, all passing (node:test runner, zero deps)
- UAT: PASS (2026-04-15)

### Known limitations
- No UI: sidepanel, newtab, and popup are empty stubs
- No schema migration runner or downgrade safe-mode (B-001b)
- No live tab tracking or tab-claims disambiguation (B-001c)
- No drift tracking or floating-tab re-association (B-001d)

### Test results
- Automated: 34/34 passing
- UAT: PASS
