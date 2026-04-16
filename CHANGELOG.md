# Changelog

All notable changes to Tab Junkie are documented in this file.

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
