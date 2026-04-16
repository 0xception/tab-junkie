# Tab Junkie — Release Notes

Local reference copy. Source of truth: GitHub Releases.

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
