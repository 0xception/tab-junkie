## 23. B-054 — Sidepanel Shell Verification (R6 Close)

B-054 is a verification item confirming the full sidepanel implementation built across Sprints 6-10. The sidepanel replaced the original `sidepanel.html` stub and delivers 17 acceptance criteria covering the complete bookmark management UI surface.

### 23.1 Architecture Overview

The sidepanel follows a **message-based architecture** with no direct storage access. All reads and writes go through `chrome.runtime.sendMessage` to the service worker, enforced by the ESLint write-boundary denylist (§6). The render lifecycle has two distinct paths:

**Initial load (skeleton to render):**
1. `sidepanel.html` loads `theme-init.js` synchronously (sets theme class before first paint, preventing flash).
2. `DOMContentLoaded` fires. The skeleton loader (CSS-animated placeholder rows) is visible immediately.
3. `sidepanel.js` sends `MSG_LIST_ITEMS` and `MSG_LIST_GROUPS` in parallel via `Promise.all`.
4. On response, `renderAll()` builds the full group tree using a `DocumentFragment`, appends it in a single DOM write, then hides the skeleton.

**Broadcast-driven updates (two paths):**
- **Full re-render** (`MSG_STATE_CHANGED { scope: 'items' | 'groups' }`): calls `renderAll()` which rebuilds the entire tree. Used when the item or group collection changes (CRUD, bulk operations, group reorder).
- **Targeted live-state patch** (`MSG_STATE_CHANGED { scope: 'liveState' }`): calls `refetchAndPatchLiveState()` which fetches fresh data and patches existing DOM rows in-place without rebuilding the tree. Used for tab events (active, audible, drift, favicon changes).

### 23.2 Key Patterns

#### DocumentFragment single-append rendering

`renderAll()` constructs the entire group tree (groups, sub-groups, item rows) inside a `DocumentFragment`, then appends it to the live DOM in one operation. This avoids incremental layout thrashing during large renders. Each group section is built by `buildGroupSection()`, which recursively handles sub-group indentation via CSS class `.group-section--child`.

#### `_ensureIndicators` patch lifecycle

`_ensureIndicators(row, live, isDrifted)` is the sole function responsible for creating and removing audible and drifted indicator icons on item rows after initial render. It guards against detached-node DOM operations via `row.isConnected`. It creates or removes the `.item-indicators` container as needed, and inserts it before `.item-actions` to maintain correct DOM order. SVG markup is hardcoded (no user data interpolation — XSS-safe).

**R4 fix (Sprint 11):** SVG icon factory functions `_createAudibleIcon()` and `_createDriftedIcon()` were extracted to eliminate duplication between `buildItemRow()` (initial render) and `_ensureIndicators()` (patch path). Both call sites now use the same factories.

#### `_pendingGroupsRender` drag guard

During drag-and-drop reorder operations, a `MSG_STATE_CHANGED` broadcast can arrive mid-drag (because the `MSG_UPDATE_GROUP` that persists the new `sortOrder` triggers a broadcast). The `_pendingGroupsRender` flag suppresses `renderAll()` during active drag operations and queues a single re-render for when the drag completes. This prevents the DOM from being rebuilt under the user's cursor.

#### `refetchAndPatchLiveState` with O(1) `itemMap` lookup

This function handles high-frequency live-state broadcasts (tab activated, audible changed, drift detected) without full re-renders. It fetches `MSG_LIST_ITEMS` and iterates the response to patch `data-live`, `data-active`, `data-audible`, `data-drifted` attributes and favicon/avatar transitions on existing rows.

**R4 fix (Sprint 11):** The original implementation used `items.find(i => i.id === id)` inside the row-patching loop, resulting in O(N x M) complexity where N = rows and M = items. This was replaced with a pre-built `Map<id, item>` (`itemMap`) for O(1) lookups per row, reducing complexity to O(N + M).

#### Nested group drag reorder

Group sections are reorderable via drag-and-drop with `sortOrder` persistence. The drag handler uses `querySelectorAll('.group-section')` to enumerate draggable sections.

**R4 fix (Sprint 11):** The original selector included child (sub-group) sections, causing nested groups to be independently draggable and producing incorrect `sortOrder` values. The fix changed the selector to exclude `.group-section--child`, ensuring only top-level groups participate in reorder operations.

### 23.3 File Inventory

| File | Lines | Purpose |
|------|-------|---------|
| `sidepanel/sidepanel.html` | ~180 | Shell HTML: header with filter input, group list container, CRUD dialog (static, `hidden`), confirmation dialog (static, `hidden`), skeleton loader, empty-state placeholder |
| `sidepanel/sidepanel.js` | 1249 | Main module: `renderAll`, `buildGroupSection`, `buildItemRow`, `refetchAndPatchLiveState`, `_ensureIndicators`, drag/drop handlers, keyboard navigation, CRUD dialog logic, filter with debounce, broadcast listener |
| `sidepanel/sidepanel.css` | ~500 | Layout, group/item styling, indicator icons, theme variables (light/dark), skeleton animation, dialog overlay, drag ghost states, focus indicators |
| `sidepanel/theme-init.js` | ~10 | Synchronous theme class application from `chrome.storage.local` before first paint |

### 23.4 Acceptance Criteria Delivered

| # | AC | Status |
|---|-----|--------|
| AC1 | HTML shell with header, group list, skeleton, empty state | PASS |
| AC2 | Parallel `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` fetch on load | PASS |
| AC3 | Group sections rendered with name + color bar | PASS |
| AC4 | Sub-group indentation via `.group-section--child` | PASS |
| AC5 | Item rows with favicon (safe-URL guard) or letter avatar | PASS |
| AC6 | Live indicator (green border via `[data-live]` CSS) | PASS |
| AC7 | Active indicator (`[data-active]` styling) | PASS |
| AC8 | Audible indicator (speaker icon via `_ensureIndicators`) | PASS |
| AC9 | Drifted indicator (drift icon via `_ensureIndicators`) | PASS |
| AC10 | Collapse/expand groups with persisted state | PASS |
| AC11 | Click-to-navigate via `MSG_NAVIGATE_TO_ITEM` | PASS |
| AC12 | Broadcast-driven re-render (full + targeted patch) | PASS |
| AC13 | Empty state: icon + message + CTA | PASS |
| AC14 | Loading skeleton (CSS-animated, not spinner) | PASS |
| AC15 | Theme support (light/dark, flash-free via `theme-init.js`) | PASS |
| AC16 | Keyboard navigation (arrow keys, Enter to activate, Tab for actions) | PASS |
| AC17 | ARIA roles (`role="tree"`, `role="treeitem"`, `aria-expanded`, focus indicators) | PASS |

### 23.5 Message Types Used

No new message types introduced. The sidepanel consumes the existing contract:

| Message | Direction | Purpose |
|---------|-----------|---------|
| `MSG_LIST_ITEMS` | sidepanel -> SW | Fetch items + liveStates + driftRecords |
| `MSG_LIST_GROUPS` | sidepanel -> SW | Fetch group tree |
| `MSG_CREATE_ITEM` | sidepanel -> SW | Bookmark CRUD |
| `MSG_UPDATE_ITEM` | sidepanel -> SW | Bookmark CRUD |
| `MSG_DELETE_ITEM` | sidepanel -> SW | Bookmark CRUD |
| `MSG_GET_ITEM` | sidepanel -> SW | Pre-fill edit dialog |
| `MSG_CREATE_GROUP` | sidepanel -> SW | Group CRUD |
| `MSG_UPDATE_GROUP` | sidepanel -> SW | Group CRUD (incl. sortOrder, collapsed) |
| `MSG_DELETE_GROUP` | sidepanel -> SW | Group CRUD |
| `MSG_PROMOTE_TAB` | sidepanel -> SW | Save live tab as bookmark |
| `MSG_DEMOTE_ITEM` | sidepanel -> SW | Demote bookmark to floating tab |
| `MSG_NAVIGATE_TO_ITEM` | sidepanel -> SW | Open/switch to tab |
| `MSG_CLOSE_TABS` | sidepanel -> SW | Close live tabs |
| `MSG_BULK_CREATE_ITEMS` | sidepanel -> SW | Bulk import |
| `MSG_SET_PREFERENCES` | sidepanel -> SW | Theme preference |
| `MSG_STATE_CHANGED` | SW -> sidepanel | Broadcast trigger for re-render/patch |

### 23.6 Storage Schema — No Changes

No new partitions, no schema version bump, no migration. The sidepanel is a pure consumer of existing message contracts.

### 23.7 Manifest Permissions — No Changes

No new permissions. `sidePanel` permission and `side_panel.default_path` were already declared in `manifest.json`.

### 23.8 Known Limitations

| # | Limitation | Severity | Notes |
|---|-----------|----------|-------|
| 1 | AC12 performance not formally measured | LOW | The performance standard (< 200ms first paint on 500 items, < 50ms search P95 on 1000 items) has not been benchmarked with instrumentation. UAT showed no perceptible lag but formal measurement is deferred. |
| 2 | `sidepanel.js` is 1249 lines | MEDIUM | The file handles rendering, patching, drag/drop, keyboard nav, CRUD dialogs, and filter logic in a single module. Recommended for future modularity improvement: extract dialog logic, drag handlers, and keyboard navigation into separate modules under `sidepanel/`. |
| 3 | Full re-render on item/group mutations | LOW | `renderAll()` rebuilds the entire group tree on any item or group change. Targeted DOM patching for single-item CRUD would reduce work but adds complexity. Acceptable at current collection sizes (< 1000 items). |
| 4 | Broadcast amplification on live-state events | MEDIUM | Inherited from B-010 (§17.8 finding #1). Each live-state broadcast triggers `MSG_LIST_ITEMS` refetch even though only indicator attributes changed. A dedicated lightweight `MSG_GET_LIVE_STATES` message could reduce payload. |

### 23.9 R4 Fixes Applied (Sprint 11)

| # | Finding | File | Fix |
|---|---------|------|-----|
| H-1 | Duplicate SVG markup for audible/drifted icons between `buildItemRow` and `_ensureIndicators` | `sidepanel/sidepanel.js` | Extracted `_createAudibleIcon()` and `_createDriftedIcon()` factory functions; both render paths now call the same factories |
| H-2 | O(N x M) complexity in `refetchAndPatchLiveState` from `items.find()` inside row loop | `sidepanel/sidepanel.js` | Pre-built `Map<id, item>` (`itemMap`) before the loop; lookups are now O(1) |
| H-3 | Nested group sections included in drag reorder `querySelectorAll` | `sidepanel/sidepanel.js` | Changed selector to exclude `.group-section--child`; only top-level groups participate in reorder |

### 23.10 Rollback Plan

No storage schema changes. No new permissions. No durable state changes beyond what the existing CRUD message handlers already persist. Rollback = `git revert` the B-054 commits; the sidepanel reverts to its stub state. No data migration needed.

### 23.11 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Sidepanel is a pure consumer of existing message contracts. |
| C-2 | Message contracts typed | PASS | No new message types. All 16 consumed messages pre-existed in `shared/messages.js` with sidepanel listed as allowed sender. |
| C-3 | Service worker cold-start safe | PASS | Sidepanel sends `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` on every load; these handlers `await readyPromise` in the SW, so a cold-start SW correctly gates the response until migrations complete. |
| C-4 | ID stability | N/A | No changes to item identity or matching logic. |
| C-5 | Manifest file references resolvable | PASS | `side_panel.default_path: "sidepanel/sidepanel.html"` resolves to the implemented HTML file (no longer a stub). |

---

