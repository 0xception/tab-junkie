# Sprint Archive

Historical completed sprint items. Appended by [scrum-master] at the close of each sprint
(after retrospective). Read this file for history; read SPRINT.md for the active sprint only.

---

## Sprint 1 — Foundation Spike (2026-04-15)

**Theme:** Ship the storage schema + data model that every other item depends on.
**Release:** v1.0.0

### Completed Items

#### [B-001a] Partitioned storage schema + CRUD + ULIDs — ✅ DONE
- **Tier**: Full (M)
- **Closed**: 2026-04-15
- **Pipeline**: R0 spike ✅ · R1 ✅ · R2 ✅ · R3 ✅ · R4 Review ✅ (C=2, H=7, M=9, L=9) · R4 Fix ✅ · R5 ✅ (34/34 + UAT PASS) · R6 ✅ (SOLUTION_DESIGN.md v1.1) · R7 skipped (no user-visible change)
- **Files changed** (15 new): `background/service-worker.js`, `background/storage/{partitions,ids,errors,write-transaction,items,groups,preferences,index}.js`, `background/messages/storage-handlers.js`, `shared/messages.js`, `.eslintrc.json`, `jsconfig.json`, `package.json`, `sidepanel/sidepanel.html`, `newtab/newtab.html`, `popup/popup.html` (stubs), `tests/*` (15 files, 34 tests)
- **Follow-ups created**: B-053 (circular dep refactor)

### Velocity
- Planned: 1 item / M effort
- Completed: 1 item / M effort
- Carried over: B-001b, B-001c → Sprint 2 (by design)

### Retrospective

**What Went Well:**
- Full pipeline (R0–R6) executed cleanly on the first sprint item
- R0 spike correctly decomposed B-001 XL into 4 sub-items, unblocking parallelism
- R4 review quality was high — 2 CRITICALs and 2 security HIGHs caught before R5

**What to Improve:**
- R2 correctness checklist missed manifest file-exists validation — UI stubs discovered at UAT time
- R4 reviewers should be launched in a single parallel message, not serialized
- R5 UAT instructions incorrectly referenced a `dist/` folder; extension loads from repo root

**Action Items Applied:**
- [x] Added C-5 to R2 Correctness Checklist in CLAUDE.md (manifest file references)
- [x] Added "Build & Load" section to CLAUDE.md (no compile step, no dist/)
- [x] Ensure R4 reviewers launched in single parallel message (done in Sprint 2)

---

## Sprint 2 — Data Layer Completion (2026-04-15)

**Theme:** Complete the non-UI data layer — migration runner + live tab tracking.
**Release:** v1.1.0

### Completed Items

#### [B-001b] Schema version + migration runner + safe-mode — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-15
- **Pipeline**: R1–R6 ✅ · R4 findings: C=1 H=5 M=5 L=4 (all C+H fixed) · R5: 60/60 · UAT skipped · R7 skipped
- **Files**: `background/storage/migration.js` (new) + mods to SW, handlers, errors, index, messages
- **Tests**: 9 files, 26 tests

#### [B-001c] LiveTabIndex + TabClaims disambiguation — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-15
- **Pipeline**: R1–R6 ✅ · R4 findings: C=0 H=3 M=5 L=6 (all H fixed) · R5: 81/81 · UAT skipped · R7 skipped
- **Files**: `background/tabs/` (4 new files) + mods to SW, handlers, messages
- **Tests**: 10 files, 21 tests

### Velocity
- Planned: 2 items / 2M parallel
- Completed: 2 items / 2M
- Carried over: 0

### Retrospective
**Went Well:** parallel pipeline worked without merge conflicts; all 6 R4 reviewers batched in single message; zero B-001a regressions.
**To Improve:** UAT skipped; R4 finding volume high (R2 could be more defensive); migration multi-partition scaffold is a known limitation.
**Action Items:** don't skip UAT for UI work; refactor writeTransaction ops when first real migration lands.

---

## Sprint 3 — Foundation Complete + URL Normalization (2026-04-15)

**Theme:** Finish B-001 family + start Phase A with URL normalization.
**Release:** v1.2.0

### Completed Items

#### [B-001d] Drift + floating-tab re-association — ✅ DONE
- **Tier**: Full (L) · **Closed**: 2026-04-15
- **Pipeline**: R1–R6 ✅ · R4: C=0 H=6 M=7 L=6 (all H fixed) · R5: 119/119 · UAT skipped
- **Files**: `background/tabs/drift.js`, `background/tabs/floating-groups.js` (new) + 7 mods
- **Tests**: 11 files, 30 tests

#### [B-002] URL normalization — ✅ DONE (Fast Track)
- **Tier**: Fast Track (S) · **Closed**: 2026-04-15
- **Pipeline**: R1 → R3 → R4 ✅ · C=1 H=1 fixed · 84→119 tests
- **Files**: `shared/url.js`, `shared/errors.js` (new) + 5 mods
- **Milestone**: Entire B-001 family (a/b/c/d) complete — full data layer shipped

### Velocity
- Planned: 1L + 1S · Completed: 2 items · Carried over: 0

### Retrospective
**Went Well:** B-001 family fully shipped across 3 sprints; Fast Track worked for B-002; R4 caught critical import violation.
**To Improve:** R4 reviewers still not always batched in single message; shared→background import direction needs lint rule.
**Action Items:** add ESLint rule preventing shared/ from importing background/.

---

## Sprint 4 — Phase A Features (2026-04-15)

**Theme:** Group palette enforcement + promote/demote operations.
**Release:** v1.3.0

### Completed Items
- **B-006** (Full M) — Group palette enforcement (9 colors) + duplicate-name warning. 35 tests.
- **B-016** (Fast Track S) — MSG_PROMOTE_TAB handler. Duplicate-URL detection, scheme filtering, immediate claim. 11 tests.
- **B-017** (Fast Track S) — MSG_DEMOTE_ITEM handler. Preserves live tab, saves floating-group position, clears drift. 14 tests.

### Velocity
- Planned: 1M + 2S · Completed: 3 items · Carried over: 0

### Retrospective
**Went Well:** First Phase A sprint; Fast Track efficient for promote/demote; R4 caught 2 promote blockers.
**To Improve:** Backlog dep graph has aspirational deps (B-016→B-003) that aren't real blockers — clean up.

---

## Sprint 5 — Core Message Contract Complete (2026-04-15)

**Theme:** Navigate, close, broadcast — completing the SW message contract.
**Release:** v1.4.0

### Completed Items
- **B-050** (Full M) — MSG_STATE_CHANGED broadcast with SCOPE enum, cold-start suppression, ordering guarantee. 11 tests.
- **B-019** (Fast Track S) — MSG_NAVIGATE_TO_ITEM handler. Tab switch/create with claim management. 7 tests.
- **B-020** (Fast Track S) — MSG_CLOSE_TABS handler. Individual + bulk with valid/gone partition. 8 tests.
- **Bonus:** `lastAccessedAt` latent bug fix caught during R3.

### Velocity
- Planned: 1M + 2S · Completed: 3 · Carried over: 0

### Retrospective
**Went Well:** 18-type message contract complete; latent bug caught; combined R4 reviews efficient.
**To Improve:** 5 sprints of data-layer work — UI work must start next sprint.

---

## Sprint 7 — Bookmark CRUD Dialog (2026-04-16)

**Theme:** Make UAT self-service — users can create, edit, and delete bookmarks directly from the panel.

**Commit:** `4768af6` on `release/v2`

### Completed Items

| ID | Title | Tier | UAT |
|----|-------|------|-----|
| B-003 | Create / edit / delete bookmarks via dialog | Full (L) | PASS |

### Files Changed
- `sidepanel/sidepanel.html` — panel header, CRUD dialog, confirmation dialog
- `sidepanel/sidepanel.js` — dialog state, form validation, event delegation, focus trap, item action buttons
- `sidepanel/sidepanel.css` — panel header, dialog styles, item action button styles
- `docs/SOLUTION_DESIGN.md` — v1.7, §15 as-built deviations + lesson learned

### Notable R4 Findings Fixed
- Focus trap gap: `inert` was not applied to inactive dialog sibling within `#dialog-overlay`
- Missing fallback re-render: success path now fire-and-forgets a re-fetch as broadcast-loss guard
- SVG click-target: `e.target === btn` fails when child `<path>` is the click target; fixed with `e.target.closest()`

### Retrospective
**Went Well:** First fully self-service UAT — all flows verified by user without devtools. R4 caught two real blocking bugs before ship. SVG click-target lesson documented for the project.
**To Improve:** R1 hit a rate limit mid-execution; ACs should specify enforcement mechanism (HTML attribute vs JS) for form validation.
**Action Items:** [product-manager] specify client-side vs HTML-attribute enforcement in form ACs; [frontend-engineer] always use `closest()` for SVG-icon buttons in event delegation.

---

## Sprint 8 — Favicons, Live State UI, Group Reorder, Inline Search (2026-04-16)

**Theme:** Visual polish and discoverability — favicons, live tab indicators, group drag-reorder, and inline filter.
**Release:** v1.8.0 (pending [release-manager])
**Tests:** 222 → 285 (+63 new tests across 4 suites)
**SOLUTION_DESIGN.md:** v1.8 → v2.1 (§17 B-010, §18 B-008, §19 B-021 added)

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-004 | Favicon auto-capture + letter-avatar fallback | Fast Track (S) | PASS (8/8 ACs) | 19 |
| B-010 | Live tab reflection & active-tab highlight | Full (L) | PASS (12/12 ACs) | 18 |
| B-008 | Group reorder & collapse/expand persistence | Full (M) | PASS (12/12 ACs) | 16 |
| B-021 | Inline side-panel filter with debounce & highlight | Full (M) | PASS (10/10 ACs) | 10 |

### Files Changed
- `background/tabs/tab-events.js` — favIconUrl capture, broadcast double-fire guard, onFocusChanged multi-window gap, timer cleanup on tab/window remove
- `background/tabs/live-tab-index.js` — favIconUrl field added to entry shape
- `background/tabs/tab-claims.js` — buildLiveStates returns favIconUrl
- `background/broadcast.js` — removed debug console.warn
- `background/storage/groups.js` — validateGroupPatch: added sortOrder finiteness check
- `sidepanel/sidepanel.html` — #filter-container, #filter-input, #filter-clear-btn, #filter-empty-state (aria-live)
- `sidepanel/sidepanel.js` — isSafeFaviconUrl, buildItemRow favicon/avatar, refetchAndPatchLiveState, _ensureIndicators, drag handle in buildGroupSection, 5 drag event listeners, _pendingGroupsRender guard, _itemById Map, buildHighlightedText, applyFilter
- `sidepanel/sidepanel.css` — data-live/active/audible styles, group drag handle + drop indicator, filter input/clear/empty/mark styles with dark theme --mark-bg
- `tests/chrome-mock.js` — windows.WINDOW_ID_NONE, onFocusChanged, tabs.query filter support
- `tests/b004-favicon.test.js` (19 tests), `tests/b010-live-state.test.js` (18 tests), `tests/b008-group-reorder.test.js` (16 tests), `tests/b021-filter.test.js` (10 tests)
- `docs/SOLUTION_DESIGN.md` v2.1 — §17, §18, §19

### Notable R4 Findings Fixed (Sprint-wide)
- **B-010 H-1**: Direct LiveTabIndex mutation bypassed updateTabEntry() API contract
- **B-010 H-5**: favIconUrl → img.src without scheme validation (isSafeFaviconUrl allowlist added)
- **B-010 H-8**: Audible icon DOM nodes not injected when state transitions false→true post-render (_ensureIndicators)
- **B-008 H-1**: dragstart guard e.target.closest() broken on section element → mousedown flag pattern
- **B-008 H-4**: Concurrent renderAll() mid-drag destroyed drop indicator → _pendingGroupsRender guard
- **B-021 H-1**: O(n²) item lookup → O(1) _itemById Map
- **B-021 M-3**: buildHighlightedText used query.length not lowerQuery.length (Unicode edge case)

### Retrospective
**Went Well:** Parallel R4 reviews (3 reviewers × 4 items = 12 review passes) caught 30+ HIGH findings before UAT. B-021 filter's DocumentFragment highlight approach was XSS-clean by design — security review approved with zero changes.
**To Improve:** SPRINT.md accumulated duplicate entries from parallel agent edits. B-008 dragstart guard and B-021 _itemById Map were both in R2 spec but not implemented in R3 — spec-compliance gap.
**Action Items:** [solution-architect] specify browser API implementation patterns in R2; [scrum-master] do single-pass doc cleanup after parallel rounds; [test-engineer] add R2 spec-compliance check to R5.

---

## Sprint 9 — Drift Detection, Audible Indicator, Tab Cleanup (2026-04-16)

**Theme:** Formal closure of pre-built B-001d subsystems — drift detection, audible indicator, and tab tracking cleanup.
**Release:** v1.6.0 (pending [release-manager])
**Tests:** 285 → 296 (+11 new tests across 3 suites)
**SOLUTION_DESIGN.md:** v2.1 → v2.2 (§10.7 drift lifecycle, B-012 broadcast, B-015 clearDrift documented; D-3 marked RESOLVED)

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-011 | Drift detection & persistence | Full (L) | PASS (13/14 ACs; AC12 contrast WARN) | 9 |
| B-012 | Audible tab indicator | Fast Track (XS) | PASS (regression) | 0 |
| B-015 | Tab-tracking cleanup on close | Fast Track (S) | PASS | 2 |

### Files Changed
- `background/tabs/tab-events.js` — B-012: `tab/audible-changed` broadcast for audible-only changes; B-015: `clearDrift` awaited after `releaseClaimByTab` in `onRemoved`; `Promise.allSettled` in `windows.onRemoved` bulk path
- `sidepanel/sidepanel.js` — B-011: `_ensureIndicators(row, live, isDrifted)` drift icon lifecycle; `isConnected` guard; atomic catch-path cleanup (`replaceChildren`); aria-label "URL drifted" → "Tab has navigated away from its saved URL"
- `tests/b011-drift.test.js` (9 new tests for AC11 drift icon DOM lifecycle)
- `tests/tab-close-claim.test.js` (+1 test: drift cleared on tab close)
- `tests/window-close-claims.test.js` (+1 test: drift cleared on window close)
- `docs/SOLUTION_DESIGN.md` v2.2

### Key Bugs Fixed
- **B-012 gap**: No broadcast for audible-only `onUpdated` events — sidepanel never updated when audio started/stopped
- **B-015 gap**: `clearDrift` not called on tab close — drift records persisted indefinitely after tab closed; SOLUTION_DESIGN.md had specified this but it was unimplemented for 8 sprints
- **B-011 gap**: `_ensureIndicators` managed audible icon lifecycle but not drift icon — mid-session drift transitions never injected the icon without a full re-render

### Retrospective
**Went Well:** R1 code analysis revealed pre-existing implementations covering 13/14 ACs for B-011 — sprint was largely validation + gap-closing rather than greenfield build. All three items closed with zero CRITICAL/HIGH open at Gate 4.
**To Improve:** Design-to-code coverage gap (SOLUTION_DESIGN.md §519 said clearDrift on close but code didn't do it) — went 8 sprints undetected. R1 pre-flight check for existing code should be standard practice.
**Action Items:** [scrum-master] scan codebase at R1 for pre-existing implementations; [test-engineer] cross-reference SOLUTION_DESIGN.md design decisions against code at R5; [product-manager] include explicit ARIA label text in ACs for new indicators.

---

## Sprint 10 — Opener-chain Inheritance, Bulk Create, Circular Dep Fix (2026-04-16)

**Theme:** Extend the tab-tracking subsystem with group inheritance for new tabs, add the bulk-create primitive that unlocks import flows, and eliminate the circular dependency in the storage layer.
**Release:** v1.6.0 · Commit `544971d` on `release/v2`
**Tests:** 296 → 332 (+40 new tests across 2 suites + 8 fixture updates)
**SOLUTION_DESIGN.md:** v2.2 → v2.3 (§20 B-053 circular dep, §21 B-013 opener-chain, §22 B-005 bulk-create)

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-013 | Opener-chain group inheritance for new tabs | Full (M) | PASS (10/10 ACs) | 22 |
| B-005 | Bulk-create saved items (import primitive) | Full (M) | PASS (10/10 ACs) | 18 |
| B-053 | Break circular dep partitions.js ↔ write-transaction.js | Fast Track (S) | regression PASS | 0 |

### Files Changed
- `background/storage/shapes.js` (new) — extracted partition constants, shape validators, `MAX_BULK_INPUTS=500`, `MAX_OPENER_MAP_ENTRIES=512`
- `background/storage/partitions.js` — re-exports from `shapes.js` + local import (both required)
- `background/storage/write-transaction.js` — imports from `shapes.js` (breaks circular dep)
- `background/storage/items.js` — `bulkCreateItems`: two-phase partial-success, tx-failure routing, size cap
- `background/storage/index.js` — re-exports `bulkCreateItems`
- `background/messages/storage-handlers.js` — `MSG_BULK_CREATE_ITEMS` dispatch, MUTATION_BROADCASTS, writeTypes
- `shared/messages.js` — `MSG_BULK_CREATE_ITEMS = 'tj/bulkCreateItems'`
- `background/tabs/opener-chain.js` (new) — openerMap, walkOpenerChain, cycle guard, size cap, pruning
- `background/tabs/floating-groups.js` — `appendFloatingGroup` (atomic append), itemId+savedAt in records, `reassociateFloatingGroups` fix (claimTabForItem uses itemId not groupId)
- `background/tabs/tab-events.js` — `onCreated` listener (sync recordOpener + async inheritance IIFE), live-state re-read after async gap, pruning in onRemoved/windows.onRemoved
- `tests/b013-opener-chain.test.js` (new, 22 tests)
- `tests/b005-bulk-create.test.js` (new, 18 tests)
- 8 floating-group fixture test files updated for itemId field

### Notable R4 Findings Fixed
- **B-013 C-1**: `reassociateFloatingGroups` passed `record.groupId` to `claimTabForItem` (which expects itemId) — poisoning claimsMirror with phantom entries. Fixed: floating-group records now store `itemId`; reassociation uses `record.itemId`.
- **B-013 H-4/H-5**: Stale `tab.url`/`tab.index` from closure over `onCreated` event (usually `about:blank`) used after async gap. Fixed: re-read live entry from `getLiveTabIndex().get(tab.id)` after async gap; bail if tab was removed.
- **B-005 H-3**: Side-effects (pushing to `created`) inside `writeTransaction` mutator — if tx later threw, `created` contained phantom items. Fixed: collect in mutator-local vars, merge to outer arrays only after `await writeTransaction()` resolves.
- **B-053 H-1**: `export { X } from './shapes.js'` re-exports but does not bind `X` locally; `initializePartitions` read `ALL_PARTITIONS` as `undefined`. Fixed: added separate local `import { ALL_PARTITIONS, ... } from './shapes.js'` alongside the re-export.

### Retrospective
**Went Well:** Parallel R4 reviews (6 reviewer passes across 2 items) caught a CRITICAL itemId data-flow bug before R5; B-053 Fast Track taught a durable lesson about ES module re-export semantics; 40 new tests cover all acceptance criteria including tricky edge cases (tab-removed-before-async-resume, tx-failure-routes-to-skipped).
**To Improve:** B-013 R3 missed the `itemId` field in the floating-group record despite it being derivable from `walkOpenerChain`'s return shape — a spec-compliance gap. The `requireClaimsReady: true` broadcast guard was silently swallowing signals during cold-start windows — [solution-architect] should add broadcast guard review to the R2 checklist.
**Action Items:** [solution-architect] add to R2 checklist: every new in-memory data structure must document a size bound and eviction policy; [product-manager] reflect corrected floating-group record shape (itemId field) in B-018 ACs; [scrum-master] prioritize B-054 (sidepanel shell, P0 Critical, in-progress) for Sprint 11.

---

## Sprint 11 — Sidepanel Shell + Floating Tab Persistence (2026-04-16)

**Theme:** Formal verification of two pre-built subsystems — the sidepanel UI shell and floating-group persistence across browser restart.
**Release:** v1.6.1 · Commit `72656b4` on `release/v2`
**Tests:** 332 → 374 (+42 new tests across 2 suites)
**SOLUTION_DESIGN.md:** v2.3 → v2.5 (§23 B-054 sidepanel shell, §24 B-018 floating persistence)

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-054 | Sidepanel shell: item/group rendering + live states + click-to-navigate + broadcasts | Full (M, downgraded from L) | PASS (16/17 ACs; AC12 SKIP) | 33 |
| B-018 | Floating tab group persistence across restart | Full (M) | PASS (13/13 ACs) | 9 |

### Files Changed
- `sidepanel/sidepanel.js` — B-054 R4 fixes: `_createAudibleIcon`/`_createDriftedIcon` factory extraction (DRY), `itemMap` O(1) lookup in `refetchAndPatchLiveState` (was O(N²)), nested group drag selector fix (`:not(.group-section--child)`), `replaceChildren()` consistency
- `background/tabs/floating-groups.js` — B-018 R4 fixes: `pruneResolvedFloatingGroups` uses live `current` from writeTransaction with `resolvedItemIds` Set (was stale snapshot with positional indices); `resolvedItemIds.add` moved after `await claimTabForItem` (was before); claim failure releases tab via `claimedTabIds.delete`
- `tests/b054-sidepanel.test.js` (new, 33 tests: isSafeFaviconUrl, sendMessage, icon factories, buildHighlightedText)
- `tests/b018-persistence.test.js` (new, 9 tests: orphan guard, TOCTOU regression, claim-failure regression, cold-start integration, disambiguation, all-same-tab)

### Notable R4 Findings Fixed
- **B-054 H-1 (code-reviewer)**: Audible/drifted icon SVG markup duplicated between `buildItemRow` and `_ensureIndicators` — maintenance hazard. Fixed: extracted `_createAudibleIcon()` and `_createDriftedIcon()` factory functions.
- **B-054 H-2 (code-reviewer)**: O(N²) `items.find()` in `refetchAndPatchLiveState` — 1M comparisons per broadcast at 1000 items. Fixed: pre-built `itemMap` from response array for O(1) lookup.
- **B-054 H-3 (qa-reviewer)**: Nested group drag reorder assigned sort orders to child group sections (`.group-section--child`), corrupting sub-group hierarchy. Fixed: `:not(.group-section--child)` selector filter.
- **B-018 H-1 (code-reviewer)**: `pruneResolvedFloatingGroups` used stale `records` snapshot in the writeTransaction mutator, silently dropping any records appended by concurrent `appendFloatingGroup` calls. Fixed: mutator uses live `current` parameter; filtering by `resolvedItemIds` Set (stable keys) not positional indices.
- **B-018 H-2 (code-reviewer)**: `resolvedItemIds.add(record.itemId)` ran before `await claimTabForItem()`. If the claim failed, the record was marked resolved and pruned — permanent data loss. Fixed: mark resolved only after successful claim; on failure, release tab for other records.

### Retrospective
**Went Well:** R1 pre-existing code scanning (Sprint 9 action item) correctly identified both items as ~95% pre-built, avoiding unnecessary greenfield work. R4 caught 5 HIGH findings across both items — the TOCTOU prune race (H-1 B-018) and premature resolution marking (H-2 B-018) would have been silent data-loss bugs in production, recoverable only by browser restart.
**To Improve:** B-054's sidepanel.js is 1249 lines — a modularity refactor should be tracked as a backlog item. AC12 (first-paint < 200ms) could not be verified without browser context; a measurement methodology should be defined. No TTL exists on unresolved floating-group records.
**Action Items:** [product-manager] create backlog item for sidepanel.js modularization; [product-manager] create backlog item for floating-group TTL pruning; [test-engineer] define AC12 measurement methodology for manual UAT.

---

## Sprint 12 — Multi-select, Context Menu, Empty States (2026-04-17)

**Theme:** Power-user item management — bulk actions across multiple items, right-click context menu for fast single-item operations, and consistent empty-state / error-feedback UX.
**Release:** v1.7.0 · Commit `437b9c7` on `release/v2` (tag staged, pending v2→main merge)
**Tests:** 374 → 427 (+53 new tests in `tests/b024-multi-select.test.js`)
**SOLUTION_DESIGN.md:** §25 added — B-024 bulk contracts + `tabId` on live states, B-026/B-049 sibling notes

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-024 | Multi-select + bulk action bar | Full (M) | PASS (11/11 gestures + 12/12 bulk-bar) | 53 |
| B-026 | Item context menu | Fast Track (S) | PASS (11/11) | — (uses B-024 coverage) |
| B-049 | Empty states & error feedback | Fast Track (S) | PASS (3/3 empty-state paths; error-toast UAT deferred to Task #7) | — |

### Files Changed
- `sidepanel/sidepanel.js` — all three items (+798/−27): multi-select state (`_selection`, `_rangeAnchorId`, `_pendingClickTimer`), bulk action bar + move picker, right-click context menu with viewport clamping, toast system, empty-state variants, `refetchAndPatchLiveState` cache sync (C-1), `openConfirmDialog` heading/body overrides (C-2)
- `sidepanel/sidepanel.html` — bulk-action-bar, context-menu, toast, filter-empty CTA (+27/−2)
- `sidepanel/sidepanel.css` — bulk bar, context menu, toast, empty-state variants (+291)
- `shared/messages.js` — `MSG_CLOSE_TABS`, `MSG_BULK_DELETE_ITEMS`, `MSG_BULK_UPDATE_ITEMS` (+6)
- `background/messages/storage-handlers.js` — bulk delete/update dispatchers with `MAX_BULK_INPUTS` cap + safe-mode gate (+12/−2)
- `background/storage/items.js` — `bulkDeleteItems`, `bulkUpdateItems` with partial-success envelope (+117)
- `background/storage/index.js` — exports (+2)
- `background/tabs/tab-claims.js` — surface `tabId` on enriched live state (+1)
- `tests/b024-multi-select.test.js` (new, 1,202 lines / 53 tests)
- `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js` — `tabId` shape additions

### Notable R4 Findings Fixed
- **B-024 C-1 (qa-reviewer)**: `_updateBulkBar` read stale `_cachedLiveStates` after a live-state broadcast — "Close tabs" button could appear enabled for tabs that had already closed. Fixed: `refetchAndPatchLiveState` now reassigns the cache and calls `_updateBulkBar()` after every patch.
- **B-024 C-2 (qa-reviewer)**: Bulk Remove confirm dialog showed static "Delete Bookmark?" heading regardless of selection count, and body said "Delete N bookmarks" — misleading for bulk and inaccurate for live items (which are demoted, not deleted). Fixed: `openConfirmDialog` accepts `{ heading, body }` overrides; bulk caller passes accurate copy.
- **B-024 H-1 (code-reviewer)**: `_clearSelection()` did not close the open bulk-move picker — Escape/Clear left an orphaned DOM node with a live capture-phase listener. Fixed: `_clearSelection()` calls `_closeBulkMovePicker()` at top.
- **B-024 H-2 (qa-reviewer)**: Bulk-move picker had no Escape handler; `onDocClick` listener leaked on non-outside-click close paths. Fixed: picker `<select>` handles Escape with `stopPropagation`; listener always removed inside `_closeBulkMovePicker()`.
- **B-024 H-3 (qa-reviewer)**: `_rangeSelect` wrote `_lastSelectedId`, causing the range anchor to drift with each Shift+Click. Fixed: introduced dedicated `_rangeAnchorId` written only by `_toggleSelection`/`_selectAll`.
- **B-024 H-5 (qa-reviewer)**: Sequential `await` in bulk Remove stopped at first failure — subsequent demotes and bulk-delete skipped; selection not pruned of successful IDs. Fixed: `Promise.allSettled` with per-result handling; fulfilled IDs pruned, rejected IDs retained, failure count surfaced via toast.
- **B-024 H-6 (qa-reviewer)**: `click` + `dblclick` race in selection mode — single-click toggle fired before dblclick navigation, mutating selection unintentionally. Fixed: 200ms deferred toggle via `setTimeout`, cancelled by dblclick.
- **B-026 H-1 (code-reviewer)**: `isLive` captured before async `MSG_LIST_GROUPS` await — stale state after concurrent broadcast. Fixed: re-read from `_cachedLiveStates` at click time in each action handler.
- **B-026 H-2 (code-reviewer)**: Every right-click fired a redundant `MSG_LIST_GROUPS` IPC round-trip; `_cachedGroups` was already in memory. Fixed: all three call sites (context menu, bulk-move picker, `_populateGroupPicker`) read from cache; `openContextMenu` is no longer async.

### UAT-Discovered Defects (fixed in-pipeline)
- **UAT-D1**: Confirm dialog stayed open after clicking Delete — pre-existing latent bug in the document click handler (never called `closeDialog()` on the confirm path). Affected all dialog-bearing flows. Fixed by capturing the callback and calling `closeDialog()` before invocation.
- **UAT-D2**: "Clear filter" link in filter-empty state also opened the Add Bookmark dialog — both CTAs shared class `.empty-state-cta`. Fixed by narrowing selector to exclude `#filter-empty-clear-btn`.

### Retrospective
**Went Well:** Parallel build of three co-located items worked cleanly thanks to `/* B-XXX */` comment markers preserving per-item attribution. The 7-agent R4 pass produced actionable de-duplicated findings; [qa-reviewer] caught both CRITICAL state-machine defects that code/security review missed. Interactive UAT surfaced two real bugs (one pre-existing) in under 15 minutes.
**To Improve:** Pre-existing confirm-dialog-close bug survived prior sprints because UAT exercised cancel paths more than confirm paths. Two R4 reviewers flagged the parallel build as "scope bleed" without seeing the SPRINT.md parallel-opportunity note. B-049 AC4 error-toast verification could not be triggered manually — deferred to future sprint.
**Action Items:** Pass SPRINT.md item context into R4 review agent prompts to prevent scope-creep false positives. Require UAT scripts to exercise confirm/commit on every dialog. Revisit B-049 error-toast UAT when a naturally failing op is available (import work or storage-quota stress).

---

## Sprint 13 — Open Tabs + Selection Polish (2026-04-17)

**Theme:** Close the PRD "Open Tabs section" gap, polish multi-select UX, and formalise storage hygiene.
**Release:** v1.8.0 · Commit `0f7e54d` (+ `7311a7a` fixup) on `release/v2` (tag staged, pending v2→main merge)
**Tests:** 427 → 481 (+54 new: 7 enriched-list, 5 B-047, 12 B-028, 18 B-051, 12 B-047 misc.)
**SOLUTION_DESIGN.md:** §26 added (R2 design + R6 Close §26.12 post-build verification)

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-055 | Open Tabs section: render live-only ungrouped tabs in the sidepanel | Full (M) | PASS (16/18 steps, 2 skipped — safe-mode ACs require storage corruption to test; code path verified by review) | 7 + broadcast + navigate coverage |
| B-028 | Selection context menu | Fast Track (S) | PASS | 12 |
| B-047 | In-panel keyboard shortcuts (Ctrl+A, Esc) | Fast Track (XS) | PASS (verified as part of B-055 UAT) | 17 (5 R4 remediation) |
| B-051 | Sort-order normalisation & selection pruning | Fast Track (S) | PASS (implicit via B-055 promote flow) | 18 |

### Files Changed
- `shared/messages.js` — `OpenTab` typedef, widened `ListItemsResponse`, `MSG_NAVIGATE_TO_ITEM` dual payload docs
- `shared/selection.js` (new) — `pruneSelection` cross-boundary helper
- `shared/errors.js` — re-export `ERR_SAFE_MODE`, `ERR_DUPLICATE_URL` for sidepanel consumption
- `background/tabs/open-tabs.js` (new) — pure `buildOpenTabs()` derivation helper
- `background/tabs/live-tab-index.js` — added `title` field
- `background/tabs/tab-events.js` — `tab/created` + `tab/title-changed` broadcasts
- `background/messages/storage-handlers.js` — `openTabs` assembly in `MSG_LIST_ITEMS`, tabId-only navigate variant, `WRITE_MESSAGE_TYPES` Set + `isWriteType(message)` predicate (B-055 H-1), `MSG_CLOSE_TABS` unconditionally allowed in safe mode, Chrome API try/catch wrap
- `background/storage/items.js` — `normaliseGroupSortOrders` in create/delete/bulk paths, `bulkUpdateItems` `itemById` Map (B-051 M-2)
- `sidepanel/sidepanel.js` — prefix-key selection refactor (`item:<id>`/`tab:<number>`), `_cachedOpenTabs` + `_cachedOpenTabsById` Map, `buildOpenTabsSection`/`patchOpenTabsSection`/`buildOpenTabRow`, `_openOpenTabContextMenu`, `_openSelectionContextMenu` (B-028), extracted `_bulkRemove`/`_bulkClose`/`_bulkMoveToGroup` helpers, `_setRowSelected` + `aria-selected` sync (B-055 M-4), `pruneSelection` wire-up (B-051 M-1), `_listitem` wrapper for ARIA role="list" child rule (B-055 H-2), safe-mode toast in bulk promote (B-055 H-3), error-code constants (B-055 H-4), categorised bulk-Save toast (UAT diagnostic improvement)
- `sidepanel/sidepanel.css` — Open Tabs section, row styles, `data-live-only` selectors, window badge, empty-state
- `tests/b024-multi-select.test.js` — 17 new tests (12 B-047 verify + 5 R4 remediation)
- `tests/b028-selection-context-menu.test.js` (new, 12 tests)
- `tests/b051-normalisation.test.js` (new, 18 tests)
- `tests/enriched-list-items.test.js` — 7 new tests for `openTabs` shape
- `tests/navigate-to-item.test.js` — tabId-only variant coverage
- `tests/live-tab-index.test.js`, `tests/b010-live-state.test.js`, `tests/b005-bulk-create.test.js` — shape/contract updates
- `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/managing-items.md`, `docs/user-manual/open-tabs.md` (new) — R7 technical-writer updates

### Notable R4 Findings Fixed
- **B-055 H-1 (code+security+qa consensus)**: `MSG_CLOSE_TABS` and tabId-only `MSG_NAVIGATE_TO_ITEM` were blocked by safe-mode write gate, but neither performs a storage write — AC14 violation. Fixed: replaced inline `writeTypes` Set with `WRITE_MESSAGE_TYPES: Set` + `isWriteType(message)` predicate that inspects payload shape. `MSG_CLOSE_TABS` is unconditionally allowed; `MSG_NAVIGATE_TO_ITEM` is write-classified only when `payload.itemId !== undefined`.
- **B-055 H-2 (qa)**: `<section role="region">` was a direct child of `div#item-list[role="list"]` — invalid per ARIA `aria-required-children` rule (would fail axe-core audit for AC15). Fixed: wrapped section in `<div role="listitem">` so outer element satisfies list-membership contract.
- **B-055 H-3 (qa)**: Bulk "Save to group" on all-tabs selection swallowed `ERR_SAFE_MODE` into the generic "check URL scheme or duplicates" toast. Fixed: inspect `r.reason?.code` in Promise.allSettled results; short-circuit with "Cannot save while in safe mode" when any result carries ERR_SAFE_MODE.
- **B-055 H-4 (code)**: Error codes compared as string literals instead of imported constants in `_openOpenTabContextMenu`. Fixed: added `ERR_SAFE_MODE` + `ERR_DUPLICATE_URL` to the existing `../shared/errors.js` import.
- **B-047 H-1 (code)**: Test-local `_selectAll(ctx)` helper queried only `[data-item-id]:not([hidden])` — wouldn't cover B-055's `[data-tab-id]` rows. Fixed: extended `_matchesSelector` and helper to handle both row types with prefixed selection keys.
- **B-047 H-2 (code)**: `handleGlobalKeydownReal` test helper lacked the dialog-open Escape guard present in production. Fixed: added `dialogOpen` parameter mirroring the `propagationStopped` pattern.
- **B-051 M-1 (code)**: `pruneSelection` exported but not wired — AC3 library-only. Fixed: imported into `sidepanel.js`, called at top of `_bulkRemove`/`_bulkClose`/`_bulkMoveToGroup` before the selection snapshot. Scoped to `item:*` partition only; `tab:*` entries self-clean via `tabs.onRemoved`.

### UAT-Discovered Improvements (mid-sprint)
- **Categorised bulk-Save toast**: Original toast said "Couldn't save N tab(s) — check URL scheme or duplicates". During UAT, 9/12 tabs failed and the user couldn't tell which rejection class dominated. Improved the toast to categorise by error code: `"Couldn't save 9 tab(s) (X already saved, Y restricted URL, Z other error)"`. This diagnostic improvement revealed the root cause: a mix of `edge://` tabs (ERR_VALIDATION) and URL duplicates (ERR_DUPLICATE_URL) in the selection — both expected failures given the current PRD/backlog policy.
- **Two new follow-up items created**: B-056 (visually distinguish unsavable tabs in Open Tabs section) and B-057 (SPIKE: URL-scheme allowlist + duplicate-URL policy review). Both scheduled for Sprint 14 to address the broader UX question the UAT exposed.

### Retrospective
**Went Well:** The sequenced-then-parallel pipeline (B-055 R3 alone → Fast Track trio in parallel) avoided `sidepanel.js` contention during the atomic prefix-key selection refactor. 9-agent R4 R4 pass produced actionable findings; two reviewers independently caught B-055 H-1 (safe-mode write-gate) — cross-agent consensus strengthened confidence. UAT surfaced a real product-design question (unsavable tabs) that produced a properly-scoped SPIKE (B-057) and adjacent implementation item (B-056).
**To Improve:** The generic bulk-Save toast had to be categorised mid-UAT — prior R4 should have caught the pattern gap against the single-tab context-menu path. Cross-item code attribution was noisy (code-reviewer B-028 flagged findings actually belonging to `_openOpenTabContextMenu` in B-055). Safe-mode testing required skipping 2/18 UAT steps — there is no dev-only force-safe-mode lever.
**Action Items:** (1) R4 prompts for shared files should map each item to its specific function/section markers. (2) Audit other bulk-action toasts for the uncategorised-failure pattern (`_bulkClose`, `_bulkRemove` — currently generic). (3) Consider a dev-only safe-mode force toggle or update UAT playbook with manual storage-corruption steps.

---

## Sprint 14 — Multi-Window + URL Policy Spike (2026-04-17)

**Theme:** First-class multi-window awareness (badges + filter row) and a policy spike to unblock Sprint 15 URL/duplicate work.
**Release:** v1.9.0 · Commit `0ca207f` on `release/v2` (tag staged, pending v2→main merge)
**Tests:** 481 → 532 (+51 new: 12 window-ordinals + 25 b014-multi-window + 4 onAttached H-3 + 7 enriched-list-items / b010 updates)
**SOLUTION_DESIGN.md:** §28 added (R2 design + §28.12 R6 Close post-build verification). New file `docs/spikes/B-057-url-policy-spike.md` (277 lines).

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-014 | Multi-window awareness & window badge (absorbed B-034 filter row) | Full (M) | PASS (12/14 steps, 2 skipped — 3+ window edge cases; unit-tested) | 51 |
| B-057 | SPIKE: URL-scheme allowlist + duplicate-URL policy review | Spike-First (XL) | N/A (research-only) | 0 |

### Files Changed
- `shared/messages.js` — `ListItemsResponse.windowMap`; widened `liveStates[].windowId`
- `shared/scopes.js` (new, 20 lines) — SSOT for broadcast scopes; cross-boundary shared module
- `background/broadcast.js` — re-export SCOPE from shared
- `background/tabs/window-ordinals.js` (new, 154 lines) — `initWindowOrdinals()`, `registerWindow()`, `unregisterWindow()`, gap-preserving map
- `background/tabs/index.js` — join bootstrap fan-out
- `background/tabs/tab-claims.js` — `buildLiveStates` widens with `windowId`
- `background/tabs/tab-events.js` — `windows.onCreated` + widened `onRemoved` + new `tabs.onAttached` / `onDetached` handlers (H-3)
- `background/messages/storage-handlers.js` — `MSG_LIST_ITEMS` response includes `windowMap`
- `sidepanel/sidepanel.html` — `<div id="window-filter-row" role="tablist">` landmark
- `sidepanel/sidepanel.css` — filter chip styles, `:focus-visible` outline
- `sidepanel/sidepanel.js` — `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_renderWindowBadge`, `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, tablist keyboard handler, `applyFilter` window-constraint branch, `SCOPE.WINDOW_MAP` broadcast arm, filter-preservation on all broadcast paths
- `tests/window-ordinals.test.js` (new, 12 tests)
- `tests/b014-multi-window.test.js` (new, 25 tests — AC4/AC8/AC11/AC12/AC17 + H-1/H-2 regression)
- `tests/b010-live-state.test.js`, `tests/enriched-list-items.test.js`, `tests/chrome-mock.js` — shape/contract + onAttached coverage
- `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/multi-window.md` (new) — R7 technical-writer
- `docs/spikes/B-057-url-policy-spike.md` (new, 277 lines) — full spike memo

### Notable R4 Findings Fixed
- **B-014 H-1 (code-reviewer)**: `Number(raw) || null` silently maps windowId=0 to "All windows" filter. Fixed with explicit `Number.isFinite(Number(raw))` guard.
- **B-014 H-2 (qa-reviewer)**: `renderAll` only re-applied filter when text query was truthy — window filter was silently lost after any `scope: items | groups` broadcast. Fixed: `if (_filterQuery || _activeWindowFilter !== null) applyFilter()`.
- **B-014 H-3 (qa-reviewer)**: `tabs.onDetached` / `tabs.onAttached` were NOT registered. Chrome doesn't fire `onUpdated` for cross-window drag — badge went stale until full reload. Fixed: registered both handlers; `onAttached` calls `updateTabEntry(tabId, {windowId, index})` then broadcasts `LIVE_STATE` + `WINDOW_MAP`.

### UAT-Discovered Defects (fixed in-pipeline)
- **UAT-D1**: Window filter chip `:focus-visible` invisible in dark mode — `--accent-subtle` (#1e293b) rendered nearly black against the dark panel. Switched to explicit `outline: 2px solid var(--accent)`. Cross-sprint action item queued to audit other `:focus-visible` uses of `--accent-subtle`.
- **UAT-D2**: Dragging a tab between windows while a window filter was active left the row visible in the wrong filter scope. `refetchAndPatchLiveState` and `SCOPE.WINDOW_MAP` handler both patched `data-window-id` but never re-ran `applyFilter()`. Fixed by appending the filter-preservation guard to both exit paths — sibling fix to H-2.

### Retrospective
**Went Well:** Spike-First pipeline worked as designed — B-057 produced actionable memos, 4 tightly-scoped follow-on items, correctly recommended deferring implementation. B-014 R2 was thorough enough that R3 landed first pass, all 18 ACs addressed. Interactive UAT caught two defects neither code/qa review surfaced. `shared/scopes.js` SSOT refactor is a useful infrastructure deposit.
**To Improve:** Dark-mode `:focus-visible` using `--accent-subtle` is an anti-pattern that slipped through multiple prior sprints; cross-sprint CSS audit queued. Window-filter-active-during-broadcast path was missed by two R4 reviewers because the broken code paths didn't touch filter code at all — reviewers looked for broken filter logic, not missing filter invocations. B-014's `shared/scopes.js` cross-boundary module wasn't flagged under Shared File Governance in R4.
**Action Items:** (1) CSS audit for `--accent-subtle` in `:focus-visible` rules elsewhere. (2) Sweep sidepanel bare-string `scope === '…'` comparisons to use `SCOPE.*` constants. (3) Future R4 prompts should include "where does filter state need to be re-applied after this change" as an explicit checklist item.

---

## Sprint 15 — URL Policy + Menu Polish (2026-04-18)

**Theme:** Implement the three B-057 spike follow-ons (relaxed URL allowlist, soft-warn duplicates, dimmed unsavable rows) and complete the context-menu trio with group-header actions.
**Release:** v1.10.0 · Commit `<HEAD>` on `release/v2` (tag `v1.10.0` staged, pending v2→main merge)
**Tests:** 575 → 605 (+30 new: 14 b061 + 13 b059 + extras; b058 + b027 also landed test files)
**SOLUTION_DESIGN.md:** §29 added (B-059 R2 design, 510 lines) + §29.14 populated (R6 close)

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-058 | Relax URL-scheme allowlist (chrome://, edge://, chrome-extension://, about:, view-source:) | Fast Track (S) | Regression suite PASS | b058-scheme-allowlist.test.js |
| B-027 | Group header context menu | Fast Track (S) | Regression suite PASS | b027-group-header-menu.test.js |
| B-059 | Allow duplicate URLs with soft-warn UI | Full (M) | `docs/UAT_B-059.md` 12-case plan; interactive UAT deferred to user | b059-duplicate-warn.test.js (13 cases) + T-7 real-dispatcher binding in promote-tab.test.js |
| B-061 | Dim javascript:/data: rows in Open Tabs (replaces retired B-056) | Fast Track (XS) | Regression suite PASS | b061-unsavable-dim.test.js (14 cases) |

### Files Changed

- `shared/url.js` — B-058 allowlist expanded (+5 schemes); B-061 `isUnsavableScheme` exported as SSOT; opaque-scheme regex now pinned with `// SECURITY: keep in sync with ALLOWED_URL_SCHEMES`
- `shared/errors.js` — `ERR_DUPLICATE_URL` retained with JSDoc reclassifying it as informational-only (§29.5)
- `background/messages/storage-handlers.js` — 10-line `ERR_DUPLICATE_URL` reject block deleted from `MSG_PROMOTE_TAB`; unused imports pruned
- `sidepanel/sidepanel.js` — `_findDuplicateSavedItem`, `_groupLabelForItem` helpers; `openConfirmDialog` extended with `confirmLabel` + `variant` options bag; soft-warn wiring in `_openOpenTabContextMenu` save-select; bulk pre-filter + aggregate confirm in `_bulkMoveToGroup`; group-header context menu via `_openGroupContextMenu`; `data-unsavable` on Open Tabs rows (B-061)
- `sidepanel/sidepanel.css` — `.dialog-btn--danger[data-variant="primary"]` primary-variant override; group color swatches (B-027); `.item-row[data-live-only][data-unsavable]` dim rule (B-061)
- `sidepanel/sidepanel.html` — group color swatch markup (B-027)
- `tests/promote-tab.test.js` — flipped duplicate-reject assertion to duplicate-success; added T-7 real-dispatcher regression via `chrome.runtime.onMessage._listeners`
- `tests/legacy-migration.test.js` — scheme allowlist updates
- `tests/b027-group-header-menu.test.js` (new)
- `tests/b058-scheme-allowlist.test.js` (new)
- `tests/b059-duplicate-warn.test.js` (new — T-1..T-6, T-8, T-10 + Ungrouped / missing-group / missing-tab-cache edge cases)
- `tests/b061-unsavable-dim.test.js` (new — pattern correctness + DOM contract with real setAttribute/removeAttribute stub)
- `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/open-tabs.md`, `docs/user-manual/managing-items.md` — R7 technical-writer
- `docs/UAT_B-059.md` (new, 10KB) — 12-case UAT plan
- `manifest.json` — version 1.9.0 → 1.10.0

### Notable R4 Findings Fixed

- **B-027 H-1 (code-reviewer)**: `contextmenu` listener called `preventDefault` unconditionally for the Ungrouped header, suppressing the browser's native menu and leaving a dead zone. Fixed by bailing out before `preventDefault` when `dataset.groupId === '__ungrouped__'`.
- **B-027 H-2 (code-reviewer)**: select-all / select-open / select-bookmarked handlers called `_clearSelection()` (which itself calls `_updateBulkBar()`) then immediately called `_updateBulkBar()` again — two DOM renders per click. Fixed by replacing `_clearSelection()` with inline `_selection.clear()` + single trailing `_updateBulkBar()`.
- **B-058 M-1 (code + security)**: opaque-scheme regex drift risk against `ALLOWED_URL_SCHEMES`. Fixed with a `// SECURITY: keep in sync` pin at `shared/url.js:71`.
- **B-059 M-1/M-2 (code-reviewer)**: test fixture keyed `_cachedOpenTabsById` on `t.id` while production keys on `t.tabId`; also missing T-8 fragment-stripping coverage. Fixed both in `tests/b059-duplicate-warn.test.js`.
- **B-059 M-4 (qa-reviewer)**: T-7 was a local wrapper, not the real SW dispatcher. Fixed by adding a `registerStorageHandlers` + `chrome.runtime.onMessage._listeners` dispatch test in `tests/promote-tab.test.js` — any future re-introduction of the reject inside real `dispatch()` breaks the build.
- **B-061 M-1 (code-reviewer)**: `UNSAVABLE_SCHEME_PATTERN` in sidepanel was a policy twin of `ALLOWED_URL_SCHEMES`. Hoisted to `shared/url.js :: isUnsavableScheme` as SSOT.
- **B-061 M-2 (code-reviewer)**: test stub cleared `title` via empty string instead of `removeAttribute`, diverging from real DOM semantics. Fixed with a faithful `_attrs` map stub supporting `setAttribute`/`removeAttribute`/`getAttribute`.

### UAT-Discovered Defects

None in this sprint — all fixes were R4-discovered. UAT-9 (dark-theme primary-button contrast) was identified by R4 qa-reviewer and confirmed pre-existing; deferred to **B-062** (P1, S) for Sprint 16.

### Deferred to Sprint 16

- **B-062** — Dark-theme primary-button contrast audit (WCAG AA). Pre-existing on `.dialog-btn--primary`; affects B-003, B-006, B-059 call sites. Whole-app sweep, not a B-059-localized fix.

### Retrospective

**Went Well:** Tight B-057 → B-058/B-059/B-061 spike-to-delivery loop — three follow-on items landed in one sprint. Fast Track + Full Tier interleaving worked: B-058/B-027 Fast Track reviews ran in parallel with B-059 R2→R3; B-061 Fast Track slotted into B-059 R4 idle time without file collisions. R4 → R3 fixes stayed surgical — all HIGH findings were localized one-liner fixes, no rework or scope creep.

**To Improve:** R2 selector accuracy — §29.4.4 named `.confirm-btn` when the actual class is `.dialog-btn--danger`. Pre-existing token debt (`--accent` dark contrast) surfaces late — invisible until B-059 became the first non-destructive confirm-dialog caller. T-7 wrapper-vs-real-dispatcher gap — first test passed while production handler could still have thrown.

**Action Items:** (1) [solution-architect] R2 process: grep every CSS selector mentioned in designs against actual markup before R3 handoff. (2) Promoting a theme token to a new surface should trigger a proactive contrast check — add to R2 Correctness Checklist. (3) [test-engineer] R5 rule: handler-contract tests MUST dispatch via `chrome.runtime.onMessage._listeners`, not local shims. Document in testing standards.

---

## Sprint 16 — A11y Polish + Group Picker + Visual States (2026-04-18)

**Theme:** Visual-polish + a11y debt paydown — WCAG AA contrast on primary buttons, unified group picker modal, visual-state sweep on item rows, and a small context-menu UX fix.
**Release:** v1.11.0 · Commit `<HEAD>` on `release/v2` (tag `v1.11.0` staged, pending v2→main merge)
**Tests:** 605 → 721 (+116 across all 4 items)
**SOLUTION_DESIGN.md:** §30 added (B-029 R2) + §30.14 (R6 close); §31 added (B-048 R2) + §31.15 (R6 close). ~950 lines combined.

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-062 | Dark-theme primary-button contrast audit (WCAG AA) | Fast Track (S) | Regression suite PASS | implicit via existing suite |
| B-063 | Close open context menu on side-panel blur | Fast Track (S) | Regression suite PASS | b063-blur-close.test.js (12 cases) |
| B-029 | Group picker modal for move-to-group (+ B-027 Move-out action) | Full (M) | `docs/UAT_B-029.md` 16-case plan; interactive UAT deferred to user | b029-group-picker.test.js (60 cases) + b027 updates |
| B-048 | Item visual states (live / active / drifted / audible / selected) | Full (M) | `docs/UAT_B-048.md` 14-case plan | b048-visual-states.test.js (40+ cases) |

### Files Changed

- `sidepanel/sidepanel.css` — new tokens `--on-accent`, `--selected-bg`, `--selected-border`, `--active-bg-hover` across all 4 theme blocks; `.dialog-btn--primary` + `.dialog-btn--danger[data-variant="primary"]` + `.empty-state-cta:hover` + window filter chip switched to `--on-accent`; dark-theme `.item-select[aria-checked="true"]` override (H-1 fix); `.group-picker-*` block; `.item-select` block; `::before` pseudo-checkmark removed; `--active-bg-hover` rule; defensive `.item-select:focus-visible`.
- `sidepanel/sidepanel.html` — new `#group-picker-dialog` sibling inside `#dialog-overlay`.
- `sidepanel/sidepanel.js` — `window.blur` listener (B-063); `openGroupPickerDialog` / `closeGroupPickerDialog` + helpers (B-029); `_findDuplicateSavedItem` kept; B-059 B-027 B-028 B-055 call-sites refactored to use the picker; `_translateMoveError` helper at 3 sites; `_refreshGroupPickerIfOpen` broadcast hook; `openGroupEditDialog` extended to accept `null` = create-mode + `openGroupCreateDialog` wrapper; `_createItemSelect` factory; `_buildItemRowAriaLabel` helper called from 4 sites; icon factories swapped `aria-label`→`aria-hidden`; `_setRowSelected` extended for `aria-checked` mirroring.
- `tests/b063-blur-close.test.js` (new, 12 cases)
- `tests/b029-group-picker.test.js` (new, 60 cases after R3 + R4-fix + R5 additions)
- `tests/b048-visual-states.test.js` (new, 40+ cases after R3 + R4-fix + R5 additions; 32-combo aria-label sweep)
- `tests/b027-group-header-menu.test.js` — B-029 integration cases
- `docs/a11y-audit-B-062.md` (new)
- `docs/a11y-audit-B-048.md` (new)
- `docs/UAT_B-029.md`, `docs/UAT_B-048.md` (new)
- `docs/SOLUTION_DESIGN.md` — §30 + §30.14 + §31 + §31.15 appended
- `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/managing-items.md`, `docs/user-manual/open-tabs.md`, `docs/user-manual/accessibility.md` (new) — R7 technical-writer
- `manifest.json` — version 1.10.0 → 1.11.0

### Notable R4 Findings Fixed

- **B-029 H-1 (qa)**: empty-state "Create group" toast was user-hostile (referenced non-existent menu). Fixed by extending `openGroupEditDialog` to accept `null` = create-mode + wrapping as `openGroupCreateDialog`. Real create flow replaces the toast.
- **B-029 H-2 (qa)**: stale-target race on `MSG_STATE_CHANGED scope:'groups'` broadcasts. Fixed by new `_refreshGroupPickerIfOpen` that re-renders picker rows while preserving filter + highlight.
- **B-029 H-3 (qa)**: `ERR_SAFE_MODE` swallowed by generic catches in 2 of 3 error-handling sites. Fixed by `_translateMoveError` helper applied uniformly.
- **B-048 H-1 (code)**: dark-theme checkmark stroke failed WCAG AA 3:1 (white on `#60a5fa` ≈ 2.9:1). Fixed with dark-theme override using `stroke='%230a0f1a'` (URL-encoded `--on-accent` dark value, ≈10.7:1 AAA).
- **B-048 M-1 (code)**: `.item-select` `aria-hidden="false"` caused double-announcement. Fixed to `aria-hidden="true"` (row-level `aria-label` is sole announcement).
- **B-062 M-1 / M-2 (code)**: pre-existing sibling-surface contrast gaps on `.empty-state-cta:hover` and window filter chip absorbed into B-062's scope since the `--on-accent` token infrastructure was right there.
- Plus 13 additional MEDIUM findings across the 4 items fixed in consolidated R4-fix passes.

### UAT-Discovered Defects

None — all issues were R4-reviewer-discovered. `.item-url` tertiary-text contrast on non-selected rows surfaced during B-048's audit and was consciously scoped out (deferred to **B-064** for Sprint 17).

### Deferred to Sprint 17

- **B-064** — Global `.item-url` tertiary-text contrast audit (P1, S). Pre-existing gap; affects all non-selected saved-item rows in both themes (~2.86–3.48:1).
- Test-shim reproduction consolidation — 3 items (B-027, B-029, B-048) carry "extract to `shared/` core" tech-debt. Recommend a single XS/S consolidation item in Sprint 17.

### Retrospective

**Went Well:** Four-wave R3 sequencing (B-063 → B-062 → B-029 → B-048) avoided sidepanel merge conflicts. B-062's `--selected-*` + `--on-accent` token pre-seed paid off when B-048 R3 landed. R4 → R4-fix pattern from Sprint 15 repeated cleanly — 4 HIGH + 19 MEDIUM findings closed in 2 focused agent passes.

**To Improve:** `aria-hidden` defaults bit us — §31.5 prescribed `aria-hidden="false"` on the nested checkbox child, correctly flagged by R4. Test-shim reproduction pile is real (3 items now). Cross-item token pre-seeding (B-062 → B-048) happened without an explicit handshake — caused R4 [code-reviewer] to flag scope-creep mid-sprint.

**Action Items:** (1) Add R2 Correctness Checklist C-6: "no double-announcement paths — nested state indicators inside a labelled row MUST default to `aria-hidden='true'`". (2) File tech-debt consolidation item for Sprint 17. (3) Document cross-item token pre-seeding handoff protocol for [solution-architect] R2 checklist.

---

## Sprint 17 — Data Portability Exports + A11y + Tech-Debt (2026-04-18)

**Theme:** Baseline data-portability (HTML + JSON exports), a global contrast fix, and a tech-debt sweep to eliminate test/production helper duplication.
**Release:** v1.12.0 · Commit `<HEAD>` on `release/v2` (tag `v1.12.0` staged, pending v2→main merge)
**Tests:** 721 → 806 (+85 across all 4 items)
**SOLUTION_DESIGN.md:** §32 added (B-042+B-043 R2 unified design, 15 subsections) + §32.16 (R6 close with 4 architect rulings).

### Completed Items

| ID | Title | Tier | UAT | New Tests |
|----|-------|------|-----|-----------|
| B-065 | Extract test-duplicated helpers to `shared/*` (tech-debt) | Fast Track (S) | Regression suite PASS | — (behavior-preserving refactor) |
| B-064 | Global `.item-url` tertiary-text contrast audit (WCAG AA) | Fast Track (S) | Regression suite PASS | — (CSS-only) |
| B-042 | Export to HTML (Netscape bookmarks) | Full (M) | `docs/UAT_B-042.md` 14-case plan | b042-html-export.test.js (46 cases) |
| B-043 | Export to JSON backup | Full (M) | `docs/UAT_B-043.md` 15-case plan | b043-json-export.test.js (~39 cases) |

### Files Changed

- `shared/export-schema.js` (new) — `EXPORT_SCHEMA_VERSION=1`, `EXPORT_FORMATS`, `EXPORT_MIME_TYPES`, `EXPORT_FILENAME_PREFIXES`, `EXPORT_FILENAME_EXTENSIONS`
- `shared/aria-label.js` (new) — `buildItemRowAriaLabel` (B-065)
- `shared/group-picker-core.js` (new) — `buildGroupPickerRows`, `applyGroupPickerFilter`, `normalizeGroupPickerQuery`, `matchesGroupPickerRow` (B-065)
- `shared/messages.js` — new `MSG_EXPORT_COLLECTION` + typedefs
- `background/export/shared.js` (new) — `htmlEscape`, `buildFilenameWithDate`, `toUnixSeconds`
- `background/export/html-export.js` (new) — `buildHtmlExport`, `countNonEmptyGroupsForHtml`
- `background/export/json-export.js` (new) — `buildJsonExport` with allow-list-derivable deny-list runtime strip
- `background/messages/storage-handlers.js` — `MSG_EXPORT_COLLECTION` dispatcher case (read-only, not in WRITE_MESSAGE_TYPES so safe-mode passes through); direct `tj:prefs` probe for §32.5.4 "persisted iff present" rule
- `sidepanel/sidepanel.html` — `#export-html-btn` + `#export-json-btn`
- `sidepanel/sidepanel.js` — `_exportCollectionAsHtml`, `_exportCollectionAsJson`, `_triggerBlobDownload`, `_exportErrorToast`; B-065 wiring
- `sidepanel/sidepanel.css` — 3-line B-064 edit swapping `.item-url` → `--text-secondary`
- `tests/b042-html-export.test.js` (new, 46 tests)
- `tests/b043-json-export.test.js` (new, ~39 tests)
- `tests/b027-group-header-menu.test.js` — B-065 deferral comment
- `tests/b029-group-picker.test.js`, `tests/b048-visual-states.test.js` — B-065 imports replacing local reproductions
- `docs/a11y-audit-B-064.md` (new) · `docs/UAT_B-042.md` (new) · `docs/UAT_B-043.md` (new)
- `docs/SOLUTION_DESIGN.md` §32 + §32.16 appended
- `CHANGELOG.md`, `STORE_LISTING.md`, `docs/user-manual/exporting-data.md` (new), `docs/user-manual/accessibility.md`
- `manifest.json` — version 1.11.0 → 1.12.0

### Notable R4 Findings Fixed

- **B-042 Q-H1 (qa)**: Orphan items (whose `groupId` refers to a deleted group) were silently dropped from HTML export — a real data-loss bug. Fixed in R4 fix pass by rescuing to the "Ungrouped" folder. B-043 implemented the same symmetric rescue + also rescues orphan sub-groups (`parentId` → null).
- **B-042 Q-H2 (qa)**: Missing `performance.now()` timing test on AC9's 500ms / 1000-item target. Fixed by adding the timing test; median measured at 6.22ms.
- **B-042 Q-H3 (qa)**: Toast copy drifted from AC7 literal. Fixed verbatim to AC7.
- **B-065 M-1 (code)**: `applyGroupPickerFilter` was exported but not imported — filter-predicate drift risk persisted on that path. Fixed by adding `matchesGroupPickerRow` helper and wiring it into both sidepanel and test paths.
- **B-064 code M-1 / M-2**: Audit annotations added referencing B-066 for deferred surfaces.
- Plus ~15 additional MEDIUM findings across the 4 items fixed in consolidated R4-fix passes.

### R6 Architect Rulings

- **D-1**: Flip export sanitizers from deny-list to §32.5 allow-list before B-045 ships. Filed as **B-067** for Sprint 18.
- **D-2**: `tj:prefs` unknown-key pass-through is intentional forward-compat. B-045 may filter on re-import.
- **D-3**: `listItems → listGroups` two-read race is a known benign window (orphan rescue handles it). Defer hardening.
- **D-4**: `_handleExportError` DRY extraction deferred — keep separate so HTML/JSON toast copy can diverge.

### UAT-Discovered Defects

None during this sprint. All HIGHs were R4-reviewer-discovered. `docs/UAT_B-042.md` + `docs/UAT_B-043.md` carry the interactive cases for the user to run before v2 → main merge.

### Deferred to Sprint 18

- **B-066** — Remaining `--text-tertiary` a11y sweep (drag handle + 4 empty-state body texts). P1/S.
- **B-067** — Export sanitizers: deny-list → §32.5 allow-list flip. P2/S. MUST ship before B-045.

### Retrospective

**Went Well:** Unified §32 R2 design for the paired B-042+B-043 exports made Wave 4 light work — the infrastructure (`shared/export-schema.js`, `background/export/shared.js`, `MSG_EXPORT_COLLECTION`) was already hardened by the time JSON landed. +85 tests, zero regressions. The Sprint 15 retro "real-dispatcher handler test" action is now embedded in both export suites. R4 caught a data-loss bug (B-042 orphan drop) that unit tests missed — reinforces the qa reviewer's value.

**To Improve:** Deny-list runtime stripping is a recurring smell — §32 specified allow-list semantics, R3 built deny-list, R4 caught it as MEDIUM (should have been HIGH). Two-read race in export handler accepted as benign (D-3) — future hardening opportunity. B-042/B-043 tests partially shim the dispatcher; next tech-debt sweep could push handler-contract tests further toward real integration.

**Action Items:** (1) B-066 + B-067 filed. (2) R4 enforcement: deny-list-implements-allow-list is HIGH, not MEDIUM. (3) Add R2 Correctness Checklist C-7: "If the design prescribes an allow-list or deny-list on a data-flow boundary, R4 reviewers must verify R3 implemented the specified direction."

---

## Sprint 18 — Imports Round-Trip + A11y + Docs Restructure (2026-04-19)

**Theme:** Complete the data-portability round-trip (imports pair with Sprint 17's exports), finish the a11y sweep from B-064, harden the export sanitizers before import ships, and restructure monolith design docs into per-chapter / per-sprint slices to cut agent-round context load.
**Release:** v1.13.0 · Commit `cb019ba` on `release/v2` (tag `v1.13.0` staged on release/v2; GitHub Release publication skipped per product-owner instruction)
**Tests:** 806 → 923 (+117 across all 5 items)
**Docs structure:** `docs/SOLUTION_DESIGN.md` split into a ~4 KB chapter index + 38 per-chapter slices under `docs/design/NN-*.md` (B-068 Wave 0). §33 new chapter authored for B-044 + B-045 import design (R2 + R6 close for both waves).

### Completed Items

| ID | Title | Tier | Wave | UAT | New Tests |
|----|-------|------|------|-----|-----------|
| B-068 | Split SOLUTION_DESIGN + SPRINT_FINDINGS into per-chapter / per-sprint files | Fast Track (S) | 0 | N/A (docs) | — (content-drift AC7: byte-identical) |
| B-067 | Flip export sanitizers to §32.5 allow-list | Fast Track (S) | 1 | Regression suite PASS | +1 B-067 AC4 runtime-field coverage (inside b043-json-export.test.js) |
| B-066 | Remaining `--text-tertiary` a11y sweep (drag handle + 4 empty states) | Fast Track (S) | 2 | Regression suite PASS | — (CSS-only) |
| B-044 | Import HTML (Netscape bookmarks) with preview + atomic replace | Full (M) | 3 | `docs/UAT_B-044.md` 29-case plan (DEFERRED) | 50 B-044 tests across b044-html-parser / b044-import-dispatch / b044-commit / b044-e2e-import |
| B-045 | Import JSON backup with validation + auto-repair | Full (M) | 4 | `docs/UAT_B-045.md` 30-case plan (DEFERRED) | 64 B-045 tests across b045-json-validator / b045-import-dispatch / b045-e2e-import |

### Files Changed

- **B-068 docs restructure:**
  - `docs/SOLUTION_DESIGN.md` (485 KB → ~4 KB chapter index)
  - `docs/SPRINT_FINDINGS.md` (185 KB → ~1 KB sprint index)
  - 38 new `docs/design/NN-*.md` chapter slices (§1–§32 + §10.5–§10.10)
  - 8 new `docs/findings/sprint-NN.md` slices (Sprints 9, 10, 12–17)
  - `CLAUDE.md` (Key Documents table + inline R2/R6 + R4-findings directives redirected to slices)
  - `.claude/agents/*.md` (6 files, ~26 edits to redirect read/write directives)
- **Import module (B-044 + B-045):**
  - `background/import/index.js` (new dispatcher)
  - `background/import/html-parser.js` (new, hand-rolled Netscape tokenizer — DOMParser unavailable in MV3 SW context)
  - `background/import/commit.js` (new, two-round writeTransaction — primary items/groups/prefs + secondary drift/floating reset; `storage.session.TabClaims` wiped)
  - `background/import/json-validator.js` (B-044 stub → B-045 full 545-line `parseAndValidate` with schemaVersion gate + 4 auto-repair routines + ULID re-mint)
- **Shared infrastructure:**
  - `shared/messages.js` — `MSG_IMPORT_COLLECTION` + `ImportCollectionRequest/Response` + `RepairReport` typedefs (two-round preview/commit protocol)
  - `shared/errors.js` — 6 new import error codes (`ERR_INVALID_FORMAT`, `ERR_MALFORMED_ROOT`, `ERR_UNKNOWN_SCHEMA_VERSION`, `ERR_UNREPAIRABLE`, `ERR_EMPTY_FILE`, `ERR_USER_CANCELLED`)
  - `shared/export-schema.js` — extended (existed from Sprint 17) as single source of truth for `ITEM_ALLOWED_FIELDS` / `ITEM_ALLOWED_OPTIONAL_FIELDS` / `GROUP_ALLOWED_FIELDS` / `sanitizeItem` / `sanitizeGroup`
  - `background/messages/storage-handlers.js` — `MSG_IMPORT_COLLECTION` handler with payload validation + 10 MiB SW-side content cap (defense-in-depth vs 5 MiB UI cap)
- **B-067 allow-list flip:** `background/export/json-export.js` (deny-list → allow-list; `ITEM_RUNTIME_FIELDS` / `GROUP_RUNTIME_FIELDS` constants deleted); `tests/b043-json-export.test.js` (`sec-S-1` + B-043 `AC4` flipped to EXCLUSION; new B-067 AC4 test)
- **B-066 a11y fix:** `sidepanel/sidepanel.css` (5 × `var(--text-tertiary)` → `var(--text-secondary)` at `.group-drag-handle`, `#filter-empty-state`, `.group-items-empty`, `.context-menu-label`, `.open-tabs-empty`); new `--danger` CSS token per theme for B-044 dialog emphasis; `docs/a11y-audit-B-066.md` (new, before/after ratios for all 16 cells) + §13 addendum for `--danger`
- **UI (B-044 + B-045):** `sidepanel/sidepanel.html` (+ `#import-html-btn`, `#import-json-btn`, hidden file inputs); `sidepanel/sidepanel.js` (+ `_beginImportHtml`, `_beginImportJson`, `_handleImportFile`, `_buildImportPreviewBody` with repair summary, `_commitImport`, `_setImportInFlight` guard, zero-bookmark early-reject, `aria-busy` wiring, post-pick extension re-check, 5 MiB UI guard)
- **Design:** `docs/design/33-b-044-b-045-import.md` (new, unified B-044 + B-045 R2 design + R6 close for both waves + §33.19 build-deviations table + §33.20 preferences-only deferred polish)
- **UAT plans:** `docs/UAT_B-044.md` (new, 29 cases), `docs/UAT_B-045.md` (new, 30 cases) — both DEFERRED for user execution on Edge
- **User-facing docs:** `docs/user-manual/importing-bookmarks.md` (new, extended for JSON in Wave 4); `docs/user-manual/exporting-data.md` (cross-link update); `CHANGELOG.md` v1.13.0 (Added + Known limitations); `STORE_LISTING.md` (Import HTML + Import JSON bullets); `docs/RELEASES.md` v1.13.0 entry
- **Manifest:** `manifest.json` version 1.12.0 → 1.13.0 (no new permissions, no CSP change)

### Notable R4 Findings Fixed

- **B-044 [qa-reviewer] HIGH #1**: Dark-theme contrast regression on the preview dialog `--danger` emphasis (fallback `#c62828` on `#1a1d23` = 4.27:1, below AA). Fixed by introducing a new `--danger` CSS token per theme (light `#c62828` 5.62:1, dark `#f87171` 6.10:1). B-066 audit doc §13 addendum updated.
- **B-044 [qa-reviewer] MEDIUM #2**: No loading feedback during commit. Fixed via `_importInFlight` flag + `aria-busy` on the import buttons + `disabled` during both preview and commit dispatch.
- **B-044 [qa-reviewer] MEDIUM #3**: Zero-bookmark preview silently wiped data. Fixed via sidepanel short-circuit: zero-count preview returns to trigger without opening the confirm dialog, toast "File contains no bookmarks".
- **B-044 [security-reviewer] MEDIUM M-1**: No SW-side content-length cap. Fixed by adding 10 MiB guard in the `MSG_IMPORT_COLLECTION` handler (defense-in-depth vs 5 MiB UI cap).
- **B-067 [code-reviewer] / [security-reviewer]**: Zero disguised-deny-list patterns — true allow-list iteration verified (Sprint 17 retro C-7 satisfied).
- **B-045 [security-reviewer] L-1**: No explicit prototype-pollution regression test. Fixed in R5 by adding `sec-proto-1/2/3` tests in `b045-json-validator.test.js`.

### R6 Architect Rulings

- **D-1 (B-044)**: `DOMParser` deviation accepted permanently. MV3 service workers have no DOM (`DOMParser`, `document`, `window` all undefined). Hand-rolled Netscape tokenizer is structurally safer than a DOMParser-based path — text-only by construction, six-entity decoder, bounded numeric references. Documented in §33.5 + §33.19.
- **D-2 (B-045)**: `validatePreferences` returns `{...DEFAULT_PREFERENCES, ...validatedPartial}` — fills defaults for missing known keys rather than rejecting the whole preferences block. Passes unknown future keys through verbatim (§32.5.4 forward-compat intent). Documented in §33.6 + §33.19.
- **D-3 (B-045)**: `remintGroupMap` is a JavaScript `Map`, not a plain `{}` — prototype-pollution defense for `__proto__` as a map key. Documented in §33.6 + §33.19.
- **D-4 (B-045)**: Preferences-only backup (items=[] AND groups=[] with populated preferences) is currently REJECTED by the sidepanel zero-bookmark guard. Sprint 18 ship behavior documented in §33.20; deferred for user UAT decision — may become a follow-on polish backlog item.

### UAT-Discovered Defects

None during sprint. All findings surfaced in R4 review and were fixed inline (HIGH + MEDIUM) or deferred with rationale (LOW / INFO). `docs/UAT_B-044.md` + `docs/UAT_B-045.md` (59 combined cases) carry the deferred interactive tests for the user to run on Edge before v2 → main.

### Deferred to Sprint 19

- **UAT burndown window** — 7 deferred UAT plans accumulated (B-042, B-043, B-048, B-029, B-059, B-044, B-045) ≈ 165 cases. Schedule a Fast-Track-S equivalent window in Sprint 19 kickoff.
- **Preferences-only backup support** — resolve §33.20 MEDIUM (allow prefs-only imports or explicit separate "Import preferences only" entry).
- **Remove `validateAndRepair` alias** — XS cleanup in `background/import/json-validator.js`.
- **Repair-summary plain-language rewrite** — user-facing dialog copy (currently uses "orphaned", "circular", "re-minted" jargon).
- **`breakCycles` adversarial-input hardening** — cap depth or convert to iterative to eliminate worst-case O(n·depth) on crafted inputs.
- **"Replace all bookmarks?" dialog heading scope** — JSON path should say "Replace all data?" since JSON restores groups + preferences too.

### Retrospective

**What Went Well:**
- B-068 Wave 0 paid off immediately — agent R2/R4/R6 rounds consumed per-chapter slices instead of 485 KB + 185 KB monoliths. Compound savings across the remaining 4 items.
- Sprint 17 retro C-7 (allow-list direction verification) surfaced in every R4 touch where it applied (B-067, B-045) — zero disguised-deny-list implementations shipped.
- R4 parallel reviewer pattern held firm on Full-tier items. 3 simultaneous reviews caught 1 HIGH + 4 MEDIUM + 13 LOW across B-044 + B-045, all resolved or intentionally deferred with rationale.
- R2-as-contract-not-scripture: B-044 engineer discovered the SW/DOM impossibility mid-R3, proposed a safer tokenizer, both R4 reviewers endorsed, R6 documented permanently. Pipeline absorbed mid-flight course correction cleanly.

**To Improve:**
- Pre-R2 feasibility sniff-test missing — a 30-second `typeof DOMParser` check in the SW console would have caught the R2 deviation before R3 started.
- Deferred-UAT debt growing — 7 plans now accumulated. Risk of crystallizing into technical debt if not addressed before v2 → main.
- Late-surfacing empty-state UX (B-045 prefs-only MEDIUM) — R2 didn't enumerate expected behavior for zero-items/zero-groups/partial-preferences edge cases. Surfaces a gap in the R2 Correctness Checklist.

**Action Items for Sprint 19:**
- [ ] Add **C-8** to R2 Correctness Checklist: "SW-context feasibility — if the design prescribes a browser API in the service worker, verify SW has access before R3 starts." [HIGH]
- [ ] Add **C-9** to R2 Correctness Checklist: "Every product-path empty-state must be explicitly designed (zero-items, zero-groups, partial-preferences, zero-network, zero-matches) with expected UI behavior enumerated." [HIGH]
- [ ] Schedule UAT burndown window in Sprint 19 kickoff — budget Fast-Track-S equivalent for user to execute 4–6 deferred UAT plans. [MEDIUM]

---

## Sprint 19 — Retro Action Items + Sprint 18 Polish + Imports Polish + Search Perf (2026-04-19)

**Theme:** Codify Sprint 18 retrospective action items into permanent R2 checklist (B-069), consume Sprint 18 polish backlog (B-070), close the import duplicate-handling UX gap (B-060), and ship the fuzzy-search perf target (B-052). Plus mid-sprint scope-change handling for B-046 deferral.
**Release:** v1.14.0 · Commit `e4f992b` on `release/v2` (tag `v1.14.0` staged; GitHub Release publication skipped per product-owner policy)
**Tests:** 923 → 955 (+32 across all 4 shipped items)
**Docs structure:** New §34 chapter authored + closed for B-052 (`docs/design/34-b-052-fuzzy-search-caching.md`). R2 Correctness Checklist gained C-8 + C-9 rows in `CLAUDE.md`.

### Completed Items

| ID | Title | Tier | Wave | UAT | New Tests |
|----|-------|------|------|-----|-----------|
| B-069 | Add C-8 (SW-context feasibility) + C-9 (empty-state design) to R2 Correctness Checklist | Fast Track (XS) | 0 | N/A (CLAUDE.md edit) | — |
| B-070 | Sprint 18 follow-on polish bundle (prefs-only backup + alias removal + repair-summary rewrite + JSON dialog heading) | Fast Track (S) | 1 | Regression suite PASS | +3 B-070 tests |
| B-060 | Import duplicate-handling with skip/allow override | Fast Track (S) | 2 | Regression suite PASS | +11 B-060 tests (b060-import-dup-handling.test.js + b044/b045 e2e updates) |
| B-052 | Fuzzy search index caching + perf targets | Full (M) | 3 | `docs/UAT_B-052.md` 15-case plan (DEFERRED) | +18 B-052 tests (13 R3 + 2 R4 fix-up + 3 R5 gap-fillers) |

### Deferred Mid-Sprint

| ID | Title | Reason |
|----|-------|--------|
| B-046 | Global keyboard shortcuts (popup + standalone) | ACs target B-022 (⬜) + B-035 (⬜) — neither shipped. Shipping stubs creates dead-shortcut UX friction; scope-reducing distorts the item. Deferred to whichever future sprint ships B-022 or B-035. Status reverted `in-progress` → `backlog`. |

### Files Changed

- **B-069 R2 checklist additions:** `CLAUDE.md` (+2 rows C-8/C-9), `CHANGELOG.md` (Process breadcrumb). Pre-existing numbering gap at C-6 + C-7 acknowledged (Sprint 17 retro C-7 never codified).
- **B-070 Sprint 18 polish:** `sidepanel/sidepanel.js` (`_hasPopulatedPreferences` + `_buildPrefsOnlyImportBody` + `prefsOnly` flag + plain-language labels + JSON heading ternary), `background/import/json-validator.js` (removed `validateAndRepair` alias), `tests/b045-e2e-import.test.js` (+3 tests).
- **B-060 duplicate-handling override:** `sidepanel/sidepanel.{js,css}` (checkbox UI + BEM styles), `background/storage/shapes.js` (`DEFAULT_PREFERENCES.importSkipDuplicates: true` + tolerant `isPreferences`), `background/storage/preferences.js` (`validatePrefsPatch`), `background/import/{html-parser,json-validator,index}.js` (options threading); NEW `tests/b060-import-dup-handling.test.js` (7 tests) + updates to `tests/b04{4,5}-e2e-import.test.js` + `tests/b045-json-validator.test.js`.
- **B-052 fuzzy-search perf:** NEW `sidepanel/search-index.js` (333-line pure module), `sidepanel/sidepanel.js` (+241/-4 — index integration + `_patchSingleRow` + `_findGroupItemsContainer` + `SEARCH_INDEX_ENABLED` rollback gate); NEW `tests/b052-fuzzy-search-perf.test.js` (18 tests); NEW `docs/design/34-b-052-fuzzy-search-caching.md` (R2 + R6 close); NEW `docs/UAT_B-052.md` (15 cases DEFERRED).
- **User-facing + release:** `CHANGELOG.md` `[1.14.0]` (Added + Improved + Process), `STORE_LISTING.md` "Near-instant search" bullet, `docs/RELEASES.md` v1.14.0 entry. `manifest.json` 1.13.0 → 1.14.0 (no new permissions, no CSP change).

### Measured Perf (B-052)

| Metric | Measured | Budget | Headroom |
|---|---|---|---|
| AC3 search P95 on 1000 items (50 samples, seed 4242) | **0.152 ms** | 40 ms (20% margin under 50 ms product AC) | 263× (329× vs product AC) |
| AC4 first-paint DOM-build proxy on 500 items | **1.14 ms** | 160 ms (20% margin under 200 ms product AC) | 140× |
| Index build wall time on 1000 items | **0.96 ms** | 30 ms sanity | 31× |

### Notable R4 Findings Fixed

- **B-070 [code-reviewer] HIGH F-1**: prefs-only commit silently wiped user's existing bookmarks (atomic replace semantics). Contradicted CLAUDE.md "confirmation for destructive actions" rule. FIXED inline with dedicated confirmation dialog ("Import preferences-only backup?" + REPLACE warning body + Cancel-default-focused).
- **B-052 [code-reviewer] MEDIUM F-2**: `_patchSingleRow` DOM divergence on cross-group moves — row inserted into wrong group container. FIXED: patch path detects cross-group move and falls through to full `renderAll`.
- **B-052 [code-reviewer] MEDIUM F-1**: `byId` Map freeze contract gap (`Object.freeze` does not deep-freeze Map). Addressed via Option A (document "structurally immutable via module API" contract). Future Sprint 20 tech-debt candidate.
- **B-052 [qa-reviewer] MEDIUM F-1**: Redundant `applyFilter()` calls in `_patchSingleRow` caused N+1 passes per broadcast batch. FIXED: removed inner calls; caller handles once per batch.
- **B-060 [code-reviewer]** flagged pre-existing `TODO(sprint-19+)` in `json-validator.js:531` (from B-070) — filed for Sprint 20 tech-debt.

### R6 Architect Rulings

- **D-1 (B-052)**: `byId` Map freeze gap — Option A (document contract) rather than restructure to frozen plain object. Future Sprint 20 tech-debt candidate.
- **D-2 (B-052)**: `_patchSingleRow` replaces the ENTIRE row via `buildItemRow` rather than piecemeal text patching. Preserves indicator/live-state matrix coherence. AC5 met literally. Documented in §34.7 + §34.14.
- **D-3 (B-060)**: UX wording "URLs that already exist in this file" (not "in your collection") — imports are atomic REPLACE so dedup happens within the imported file. Engineer caught during R3; accepted.
- **D-4 (B-060)**: No schema version bump required for `importSkipDuplicates` addition. Tolerant `isPreferences` + `getPreferences()` default-merge preserves backward compat.

### UAT-Discovered Defects

None during sprint. All findings surfaced in R4 review (1 HIGH + 6 MEDIUM + 9 LOW). `docs/UAT_B-044.md`, `docs/UAT_B-045.md`, `docs/UAT_B-052.md` carry deferred interactive tests for Edge execution before v2 → main.

### Deferred to Sprint 20

- **UAT burndown window** — 8 deferred UAT plans accumulated (B-042, B-043, B-048, B-029, B-059, B-044, B-045, B-052) ≈ 180 cases. Sprint 20 MUST budget time per Sprint 19 retro.
- **B-046 Global keyboard shortcuts** — return when B-022 OR B-035 ships.
- **B-052 `byId` Map restructure** — XS tech-debt from §34.14 D-1.
- **Pre-existing `TODO(sprint-19+)` in `json-validator.js:531`** — XS cleanup (CLAUDE.md "no TODOs" rule).
- **`C-6` + `C-7` backfill in R2 Correctness Checklist** — XS (Sprint 17 retro's aspirational C-7 never codified).
- **`breakCycles` adversarial-input hardening** — XS defensive item from B-045 R4 (code-reviewer F-3 in Sprint 18).
- **Repair-summary plain-language extended pass + query-length cap on filter input** — XS UX polish + security LOW (DoS-only).

### Retrospective

**What Went Well:**
- C-8 + C-9 delivered value on first use — B-052 R2 was the first Full-tier R2 under the new checklist; C-9 forced explicit empty-state enumeration (7 states) that R4 qa-reviewer verified.
- Perf ACs work when they're concrete — B-052's 0.152 ms measured vs 50 ms product target (329× headroom) demonstrates hard numeric thresholds beat "it feels fast".
- Scope Change Control followed its own rules — B-046 deferral caught at Wave 3 start, rationale documented.
- R4 parallel reviewer pattern caught correctness bugs R3 missed — B-052's cross-group-move DOM divergence would have been user-reported.

**To Improve:**
- Sprint Readiness Gate 6 missed B-046's dep gap (deps: B-022, B-035 — neither shipped). Gate 6 needs a deps-resolved check.
- UAT debt grew 7 → 8 plans. Sprint 20 MUST budget burndown window.
- B-070 AC1 literal reading nearly shipped a UX defect. PM output should be explicit on destructive-action confirmation for carved-out paths.

**Action Items for Sprint 20:**
1. [scrum-master] Extend Gate 6 with deps-resolved check. [HIGH]
2. [product-manager] Explicit destructive-action confirmation guidance in ACs for carved-out paths. [MEDIUM]
3. Sprint 20 kickoff budget UAT burndown (Fast-Track-S equivalent). Target: clear 4-6 of 8 plans. [HIGH]

---

## Sprint 20 — Retro Action Items + Polish Debt + Sub-group Nesting (2026-04-20)

**Theme:** Land all three Sprint 19 retrospective action items as permanent CLAUDE.md rules (HIGH + MEDIUM), burn down two polish items from the Sprint 19 queue, and ship one forward feature (sub-group nesting at depth 1) — all under the Sprint 19 retro's HIGH-priority "first Full-tier R2 under the new C-6/C-7 checklist" proof point.
**Release:** v1.15.0 · Commit `a587462` on `release/v2` (tag `v1.15.0` pushed; GitHub Release publication skipped per product-owner policy)
**Tests:** 955 → 968 (+13 — all in B-007)
**Docs structure:** New §35 chapter for B-007 (`docs/design/35-b-007-sub-group-nesting.md`). R2 Correctness Checklist gained C-6 + C-7 rows in `CLAUDE.md` (closing the numbering gap between C-5 and C-8/C-9). DoR gained item 7 (destructive-action confirmation explicit on carved-out paths). Gate 6 gained deps-resolved check.

### Completed Items

#### [B-007] Sub-group nesting (depth = 1) — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-20 · **PR**: #24 → `0993189`
- **Pipeline**: R1 ✅ (15 PASS/FAIL ACs) · R2 ✅ (first R2 under new C-6+C-7 + C-8+C-9 — all PASS/NA) · R3 ✅ · R4 ✅ (code+security+qa all PASS, 0 findings) · R5 ✅ (13 new tests; total 968) · R6 ✅ (§35 new chapter) · R7 ✅ (CHANGELOG + UAT plan)
- **Files**: NEW `shared/group-nesting.js` (pure helpers), `sidepanel/sidepanel.html` (parent picker), `sidepanel/sidepanel.js` (dialog + error translation + parentId threading), `sidepanel/sidepanel.css` (`--group-indent` token), NEW `tests/b007-sub-group-nesting.test.js` (+13), NEW `docs/design/35-b-007-sub-group-nesting.md`, `docs/SOLUTION_DESIGN.md` TOC, NEW `docs/UAT_B-007.md`
- **Key scope-finding**: storage layer for depth-1 + cycle + cascade was already complete from B-001a + B-006. B-007 shipped as UI-only. Drag-to-nest deferred to B-031.

#### [B-075] Convert B-052 `byId` Map → frozen plain object — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #23 → `a488c90`
- **Files**: `sidepanel/search-index.js` (Map → frozen `{}` + freeze in buildIndex/makeIndex; spread in diffAndPatch), `sidepanel/sidepanel.js` (1 call site), `tests/b052-fuzzy-search-perf.test.js` (~10 call-site migrations + R4 Fix #2 mutation-contract test rewritten for B-075 semantics — now asserts `Object.isFrozen === true` and direct writes throw).
- **Contract upgrade**: "defensively scoped" Map → runtime-enforced frozen object. Strict-mode TypeError on external mutation.

#### [B-074] Remove pre-existing `TODO(sprint-19+)` from json-validator.js — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #23 → `a488c90`
- **Files**: `background/import/json-validator.js` (TODO replaced with non-TODO reference comment pointing at B-076 + §33.18 F-4 design-doc deferral rationale), `docs/BACKLOG.md` (B-076 filed as future-work placeholder).
- **Decision**: AC1 option (b) — file backlog item + replace TODO with reference comment. Not option (a) inline because implementing the MIGRATION_STEPS hook without a real migration step is YAGNI.

#### [B-073] Backfill C-6 + C-7 in R2 Correctness Checklist — ✅ DONE (Wave 0)
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #22 → `c2154c9`
- **Files**: `CLAUDE.md` (+2 rows C-6 Permission minimization + C-7 Allow-list direction), `CHANGELOG.md` Process breadcrumb.
- **Impact**: Numbering gap closed (C-1..C-5, C-6, C-7, C-8, C-9). First exercised by B-007 R2 same sprint — both PASS/NA.

#### [B-072] AC template — destructive-action confirmation clause — ✅ DONE (Wave 0)
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #22 → `c2154c9`
- **Files**: `CLAUDE.md` (+1 DoR item 7 covering carved-out-path destructive-action clarification), `CHANGELOG.md` Process breadcrumb.
- **Origin**: Sprint 19 retro MEDIUM action item (B-070 AC1 literal reading nearly dropped confirmation dialog).

#### [B-071] Extend Gate 6 Sprint Readiness with deps-resolved check — ✅ DONE (Wave 0)
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #22 → `c2154c9`
- **Files**: `CLAUDE.md` (+1 Gate 6 bullet requiring every in-scope item's deps to be done or in-sprint), `CHANGELOG.md` Process breadcrumb.
- **Origin**: Sprint 19 retro HIGH action item (B-046 deferral showed Gate 6 was missing this check).
- **Applied retroactively**: Sprint 20 Gate 6 itself used the new check (all 6 items passed).

### Backlog additions
- **B-076** (S, P2, `backlog`): Apply MIGRATION_STEPS in-memory hook in JSON import validator. Future-work placeholder — activates when `MIGRATION_STEPS` ships first non-empty entry.

### Velocity
- Planned: 6 items / 1M + 5XS
- Completed: 6 items / 1M + 5XS = 100% scope
- Carried over: 0 items
- New backlog items: 1 (B-076)

### Retrospective (carry-over action items to Sprint 21)
- **HIGH**: Sprint 21 MUST treat UAT burndown as a first-class sprint item. 9 plans deferred (~195 cases). Two consecutive sprints of UAT-debt growth — no forward feature in Sprint 21 until UAT burndown is budgeted.
- **MEDIUM**: [product-manager] Add a "DoR Gate 7 check" subsection to the R1 AC template — every AC block explicitly states destructive-action confirmation status up front.
- **MEDIUM**: [scrum-master] For every M/L item, spend ≥ 15 min pre-sprint verifying ACs are PASS/FAIL-level, not concept-level (B-007 needed mid-sprint R1 refinement).

### R4 Findings Summary (Sprint 20)
- **B-071 / B-072 / B-073**: 0 findings (docs-only smoke-checks).
- **B-074**: 0 must-fix.
- **B-075**: 0 must-fix.
- **B-007**: 0 must-fix (all 3 reviewers PASS at smoke-check — B-065 pattern compliance, zero perm/message drift, C-9 enumerated + U17).
- **Total**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW — cleanest-R4 sprint since Sprint 18 (docs restructure).

**Action Items for Sprint 21:**
1. [scrum-master] UAT burndown becomes a first-class sprint item, not a side track. No forward feature until at least 4 of 9 plans are PASS. [HIGH]
2. [product-manager] Add "DoR Gate 7 check" subsection to R1 AC template. [MEDIUM]
3. [scrum-master] 15-min pre-sprint AC health check for every M/L item. [MEDIUM]

---

## Sprint 21 — Polish Close + UAT Essentials + Feature-Parity Pivot (2026-04-20)

**Theme:** Originally scoped as the first-class UAT burndown sprint (Sprint 20 retro HIGH rule). Mid-sprint, after B-042 essentials-only pass completed 6/6 PASS, product-owner pivoted to feature-parity mode: defer comprehensive UAT to a dedicated S27 sweep, ship the remaining polish queue + a roadmap + one UAT-surfaced UX gap.
**Release:** v1.16.0 · Commit `42297fc` on `release/v2` (tag `v1.16.0` pushed; GitHub Release publication skipped per product-owner policy)
**Tests:** 971 → 979 (+8 sprint-21-polish + 3 b-081 markup)
**Docs structure:** New `docs/FEATURE_PARITY_ROADMAP.md` (7-sprint plan through S27 UAT + S28 TBD). CLAUDE.md R1 gains a DoR Gate 7 subsection. No new design chapter this sprint.

### Completed Items

#### [B-081] New-group button in sidepanel header — ✅ DONE (UAT-surfaced, mid-sprint)
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #25 → `05a4049`
- **Surfaced by**: Sprint 21 UAT setup walkthrough — post-B-029, once ≥ 1 group exists the only group-create path was unreachable from the UI.
- **Files**: `sidepanel/sidepanel.html` (new `#add-group-btn` with folder+plus SVG), `sidepanel/sidepanel.js` (ref + delegation to existing `openGroupCreateDialog`), `tests/b081-add-group-button.test.js` (+3 markup tests).
- **Validates in-session UAT pattern** — 20-minute product-owner walkthrough surfaced a real UX gap that Sprint 1 + Sprint 11 missed.

#### [B-077] DoR Gate 7 check subsection in R1 AC template — ✅ DONE (Wave 0)
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-20 · **PR**: #26 → `fa1a8df`
- **Files**: `CLAUDE.md` (new R1 subsection requiring "**Destructive-action confirmation (DoR item 7)**: retained | waived | N/A — rationale" up front in every AC block).
- **Sprint 20 retro MEDIUM closed** — prevents B-007 AC15-style reactive placement.

#### [B-078] `breakCycles` adversarial-input hardening — ✅ DONE (Wave 1)
- **Tier**: Fast Track (XS defensive) · **Closed**: 2026-04-20 · **PR**: #26 → `fa1a8df`
- **Files**: `background/import/json-validator.js` (+`MAX_CYCLE_WALK_DEPTH = 1000` + depth counter in cycle walk → cap hit breaks cycle at current cursor via the existing cycle-break path).
- **Sprint 18 R4 LOW closed.** 1500-node adversarial cycle test terminates in < 100 ms (budget: 10 s).

#### [B-079] Query-length cap on filter input — ✅ DONE (Wave 1)
- **Tier**: Fast Track (XS security) · **Closed**: 2026-04-20 · **PR**: #26 → `fa1a8df`
- **Files**: `sidepanel/sidepanel.html` (+`maxlength="256"` on `#filter-input`).
- **Sprint 19 R4 security LOW closed** — DoS-only vector, cheap mitigation.

#### [B-080] Import-toast plain-language repair breakdown — ✅ DONE (Wave 1)
- **Tier**: Fast Track (XS UX) · **Closed**: 2026-04-20 · **PR**: #26 → `fa1a8df`
- **Files**: `sidepanel/sidepanel.js` (extracted `_plainLanguageRepairParts` shared helper; toast path expanded; preview-dialog body refactored to call the helper).
- **Sprint 19 R4 QA LOW closed.** Toast now shows per-type breakdown inline (matches preview dialog verbiage).

### UAT Results

- **B-042 Export HTML (essentials-only pass)**: 6/6 essential cases PASS (UAT-1/2/3/6/7/8); 8 non-essential cases SKIP (UAT-4 Firefox not installed; UAT-5 destructive; UAT-9..14 automated-covered or niche scenarios deferred to S27). Plan drift logged: UAT-1/UAT-2 references a non-existent "overflow menu" — actual path is direct `#export-html-btn` button.

### Backlog additions
- **B-082** (XS, P1, `backlog`): "Open side panel" button in toolbar popup. Scheduled for S26 per FEATURE_PARITY_ROADMAP. Scope: button in `popup/popup.html` wired to `chrome.sidePanel.open()` — complements B-046's `_execute_action` keyboard-shortcut registration.

### Feature-parity roadmap authored
- `docs/FEATURE_PARITY_ROADMAP.md` — 7-sprint plan: S22 (drag foundation) → S23 (item drag core) → S24 (quick search popup) → S25 (group jump + standalone) → S26 (shortcuts + prefs + new tab page) → S27 (comprehensive UAT sweep) → S28 TBD (v2→main merge decision, deferred pending S27 review).

### Velocity
- Planned: 4 XS polish + UAT burndown target (≥ 4/9 plans PASS)
- Delivered: 5 items shipped + 1 UAT plan essentials PASS + roadmap + B-082 filed
- Scope-change mid-sprint: UAT target dropped to "essentials-only on B-042" per product-owner feature-parity pivot
- Carried over: 8 UAT plans (B-042 non-essentials + 8 others) → S27 comprehensive sweep

### Retrospective (action items to Sprint 22+)
- **HIGH**: [scrum-master] S27 plan-correction pre-pass: before walking any UAT plan, grep plan references vs current markup; file any drift as correction commits before user walks the cases.
- **MEDIUM**: Every S22–S26 feature ships with a 5–10 case smoke UAT plan authored during R1.
- **LOW**: Release flow — bundle version bump into feature PR for single-PR sprints; reserve stash dance for multi-PR sprints.

### R4 Findings Summary (Sprint 21)
- **B-077 / B-078 / B-079 / B-080 / B-081**: 0 findings each.
- **Total**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW. Second consecutive zero-findings sprint (after Sprint 20).

**Action Items for Sprint 22:**
1. [scrum-master] Author S22 sprint plan per FEATURE_PARITY_ROADMAP — drag foundation theme: B-025 + B-031 + B-032. Each with smoke UAT plan in R1.
2. [product-manager] First sprint under new R1 template — exercise DoR Gate 7 check subsection on every B-025/B-031/B-032 AC block.
3. [frontend-engineer] Review B-007's `filterGroupParentCandidates` helper for reuse in B-031 drag-nesting path (same depth-1 + cycle + children-of exclusions).

---

## Sprint 22 — CLOSED without release (drag foundation reverted) (2026-04-21)

**Theme:** Drag foundation per FEATURE_PARITY_ROADMAP. Shipped B-030 (Full tier L) through R1 + R2 + R3 + R5 + R6 in Wave 0 (PR #27, commit `bfe0559`); product-owner UAT smoke test the following day found two blocker-grade issues → revert executed as `git revert bfe0559`.
**Release:** NONE — v1.16.0 remains the current production tag. Drag work slipped one sprint; S23 will re-architect B-030 + ship the drag foundation v2 with B-009 + B-033.
**Tests:** 979 → 997 (during B-030 shipment) → 979 (post-revert). Net zero.
**Docs structure:** §36 design chapter authored + removed by revert. `docs/FEATURE_PARITY_ROADMAP.md` updated with the one-sprint slip (S23+ all shift down one).

### What happened

- **2026-04-20**: Sprint 22 kickoff → R1 ACs for B-030 / B-009 / B-033 → B-030 R2 architecture review (PASS, 8 correctness checks, 5 design decisions) → B-030 R3 build + R5 tests (+18) + R6 design chapter → PR #27 merged as `bfe0559`.
- **2026-04-21**: Product-owner UAT smoke test in Edge found:
  - **Correctness (2/8 FAIL)**: UAT-1 "within-group reorder" — indicator positioned correctly but drop produced no actual reorder; UAT-6 "continuous perf" — cumulative drag-over lag that compounded the longer the drag continued.
  - **Regression (1/8 WARN)**: UAT-7 B-008 group-drag lag — introduced by B-030's handler additions.
- Revert executed same session. B-030 / B-009 / B-033 returned to `backlog` (now scheduled for S23).

### Root cause analysis

1. **Perf regression (B-008 + B-030 both affected)**: R2 §36.3.4 specified "rAF-coalesced indicator writes + bounding-rect reads cached per-drag". R3 build ignored this and recomputed rects + moved DOM on every dragover event (60–120 Hz). Each `getBoundingClientRect` forced synchronous layout; compounding over 10+ seconds of drag. The specification was aspirational — not encoded as an R3 acceptance criterion, so R3 implementation silently dropped it.
2. **Same-group reorder silent failure**: not definitively root-caused (would require Edge-side debug instrumentation). Likely either (a) `destIndex` computation off-by-one when source and destination are the same group, OR (b) the broadcast → sidepanel re-render path losing the updated state somewhere between `bulkReorderItems` commit and `renderAll`. Automated backend tests and pure-helper tests all passed on their respective surfaces; the bug lives in the sidepanel ↔ storage wiring that only manifests in a real browser.
3. **R4 smoke-check didn't catch either**: R4 was a self-attested inline review (matches B-069/B-074 pattern for docs-only changes). For L items with runtime-sensitive behaviour (drag, perf), that pattern is insufficient. UAT must run before the PR merges, not after.

### Sprint retrospective — action items for S23 and forward

- **HIGH [scrum-master]**: S23 scope = B-030 re-architected + B-009 + B-033. Consider Tier 3 Spike-First escalation for B-030 given the revert; treat the perf decisions as ACs, not notes.
- **HIGH [product-manager]**: Author `docs/UAT_B-030.md` in R1 (not deferred to R3 or S27). Include perf-specific probes: "continuous 10-second drag → measure cumulative lag" and "getBoundingClientRect call-count budget during dragover".
- **HIGH [solution-architect]**: R2 perf decisions MUST be encoded as R3 ACs or explicit code guardrails (e.g., "dragover handler MUST NOT call getBoundingClientRect outside a requestAnimationFrame callback"). Note: consider an ESLint rule for the no-synchronous-layout-in-dragover pattern.
- **MEDIUM [frontend-engineer]**: R3 debug strategy for same-group reorder — add feature-flagged console.log in drop handler branches; walk Edge UAT; confirm execution path; remove logs pre-merge.
- **MEDIUM [test-engineer]**: Add primitive fake-DOM drag simulation to `tests/b030-item-drag-reorder.test.js` covering the full sidepanel drag path (dragstart → dragover → drop → dispatch). Exercise same-group drag-to-end, same-group drag-to-start, cross-group, drop-onto-Ungrouped.
- **LOW**: For every S23+ feature, pre-authored UAT plan drives the walkthrough (not ad-hoc checks generated at smoke-test time).

### R4 Findings Summary
- **B-030** (at time of PR #27 merge): 0 findings at R4. UAT post-merge surfaced 2 blocker-grade issues (correctness + perf). **Lesson: R4 smoke-check is NOT a substitute for in-browser UAT for runtime-sensitive features.**

### Velocity
- Planned: 3 items (B-030 L + B-009 S + B-033 S)
- Shipped: **0**
- Merged-then-reverted: 1 item (B-030)
- Carried over: all 3 items to S23

### Roadmap impact
All sprints S22 → S28 renumber by +1:
- S23: Drag foundation v2 (was S22 attempt)
- S24: Drag stack (B-025/B-031/B-032) — was S23
- S25: Quick search popup B-022 — was S24
- S26: Group jump + standalone (B-023/B-035) — was S25
- S27: Shortcuts + prefs + new tab (B-046/B-082/B-038/B-039/B-040/B-036) — was S26
- S28: Comprehensive UAT sweep — was S27
- S29: TBD v2→main — was S28

---

## Sprint 23 — Drag Foundation v2 + Helpers (2026-04-21)

**Theme:** Second attempt at the drag foundation after the Sprint 22 revert. Every S22 retro action item applied explicitly at kickoff. Pre-merge UAT in Edge caught 2 blocker-grade bugs that R4 smoke-check would have missed — the exact failure class that killed S22. Fixed pre-merge; 9/9 PASS round 2; merged clean.
**Release:** v1.17.0 · Commit `eae6123` on `release/v2` (tag `v1.17.0` pushed; GitHub Release publication skipped per product-owner policy)
**Tests:** 979 → **1001** (+22 — 14 sort-order + 8 backend)
**Docs structure:** New §36 chapter `docs/design/36-b-030-item-drag-reorder-v2.md`. SOLUTION_DESIGN index TOC extended.

### Completed Items

#### [B-030] Item drag-reorder within / between groups (v2) — ✅ DONE
- **Tier**: Spike-First (L) — Tier 3 escalation per S22 retro · **Closed**: 2026-04-21 · **PR**: #28 → `791d50e`
- **Pipeline**: R0 spike ✅ · R1 ✅ · R2 ✅ · R3 ✅ · **PRE-MERGE UAT Round 1 FAIL (2 bugs)** → fixes → **Round 2 9/9 PASS** · Merge ✅ · R6 ✅
- **Files**: `shared/messages.js` (+MSG_BULK_REORDER_ITEMS), `shared/sort-order.js` (NEW — computeItemReorder), `background/storage/items.js` (+bulkReorderItems), `background/storage/index.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.js` (+~260 for v2 drag handlers + helpers + state), `sidepanel/sidepanel.css` (+~20), `tests/sort-order.test.js` (NEW — 14 tests), `tests/b030-item-drag-reorder.test.js` (NEW — 8 backend tests), `docs/UAT_B-030.md` (NEW — 9-case plan with perf probes)
- **R6 chapter**: `docs/design/36-b-030-item-drag-reorder-v2.md`
- **Round 1 bugs**: indicator invisible (missing `top: 0` on absolute element) + same-group reorder no-render (B-052 hashItem omits sortOrder → diffAndPatch returned noop)
- **Round 2 fixes**: D-1 added `top: 0` inline, D-2 explicit `renderAll` after MSG_BULK_REORDER_ITEMS, D-3 cleanup order swap, D-4 `z-index: 10` on indicator
- **Retro discipline validated**: pre-merge UAT was the load-bearing gate

#### [B-009] Drag-to-expand collapsed group — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-21 · **PR**: #29 → `df4a024`
- **Files**: `sidepanel/sidepanel.js` (+`_hoveredCollapsedGroup` + `_b009HoverState` + hover-hold timer in `_dragTick`)
- **Scope**: 600ms hover-hold on collapsed group header during drag → dispatches existing `MSG_UPDATE_GROUP { collapsed: false }`. Persists across reload.

#### [B-033] Drag saved+live item to Open Tabs → demote — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-21 · **PR**: #29 → `df4a024`
- **Files**: `sidepanel/sidepanel.js` (+Open Tabs branch in `_computeDropTarget` with live-state guard, drop handler branches on `pendingDropType === 'openTabs'`), `sidepanel/sidepanel.css` (+`.open-tabs-section--drop-target` highlight)
- **Scope**: saved+live item dragged to Open Tabs section → `MSG_DEMOTE_ITEM` (existing B-017 message). Saved-only rejected at target-compute time; live tab preserved.

### UAT Results

- **B-030**: pre-merge UAT 9/9 PASS (round 2). Round 1 caught 2 blocker bugs which would have been a repeat of S22's failure class.
- **B-009, B-033**: Fast Track S items — pre-merge UAT product-owner-optional per HIGH-3; deferred to S28 comprehensive sweep per FEATURE_PARITY_ROADMAP.

### Velocity
- Planned: 3 items (1L + 2S)
- Delivered: 3 items — 100% scope
- Revert count: 0 (vs S22's 1)
- Test growth: 979 → 1001 (+22)
- Release: v1.17.0 (the release S22 was meant to be)

### Retrospective (action items → Sprint 24)
- **HIGH**: S24 = drag stack (B-025 M + B-031 M + B-032 S). P-3 max 2M + P-2 S pair with M. Reuse `_dragRectCache` + `_scheduleDragTick` + `_computeDropTarget` from B-030 v2.
- **MEDIUM**: R2 for S24 items MUST enumerate required CSS properties explicitly (not just strategies) — per D-1 lesson.
- **MEDIUM**: B-031 drag-nest path should reuse B-007's `filterGroupParentCandidates` helper (same depth-1 + cycle + children-of exclusions) per S22 retro LOW action.
- **LOW**: B-052 `hashItem` sortOrder follow-up — explicit `renderAll` is the current compensation; adding sortOrder to the hash would be a cleaner long-term fix. Documented in §36.8.

### R4 Findings Summary
- **B-030 / B-009 / B-033**: 0 findings each at R4 smoke-check layer
- **Total R4**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **UAT layer** (B-030): 2 blocker bugs caught pre-merge + fixed
- **Key lesson**: R4 smoke-check cleanliness ≠ zero bugs. Pre-merge UAT for L-tier runtime-sensitive features is load-bearing, not optional.

**Action Items for Sprint 24:**
1. [scrum-master] Author S24 SPRINT.md per roadmap — drag stack theme (B-025 + B-031 + B-032). [HIGH]
2. [solution-architect] R2 enumerates CSS requirements explicitly (D-1 lesson). [MEDIUM]
3. [frontend-engineer] B-031 reuses B-007's filterGroupParentCandidates. [MEDIUM]

---

## Sprint 24 — Drag stack (2026-04-22)

**Theme:** Multi-item drag + group drag-reorder-with-nesting + auto-scroll on top of B-030 v2 drag foundation.
**Release:** v1.18.0
**Merge commit:** `d44d896` (PR #30)

### Completed Items

#### [B-025] Multi-Item Drag as Single Unit — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-22
- **Pipeline**: R1 ✅ · R2 ✅ (§37 design chapter) · R3 ✅ · R4 ✅ (3 HIGH fixed) · R5 ✅ (+29 tests) · UAT 9/9 PASS (after 2 fix cycles) · R6 ✅ (§37.10 As Built)
- **Files changed** (7): `shared/messages.js`, `shared/sort-order.js`, `sidepanel/sidepanel.{js,css}`, `tests/sort-order.test.js`, `tests/b025-multi-item-drag.test.js` (new)
- **Key decisions**: D-1 extend existing `MSG_BULK_REORDER_ITEMS` (no new type). D-2 explicit `renderAll` post-commit (not hashItem extension). D-3 custom drag ghost via `setDragImage` with count badge. D-4 silent payload restriction to single source group. D-5 live-only keys skipped from payload.
- **UAT fixes shipped in-sprint**: UAT-3 empty-group drop (shared fix with B-030 latent bug) · UAT-8 ghost positioning (`position: fixed` + forced reflow + 80px fallback)

#### [B-031] Group Drag-Reorder + Nesting via Drag — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-22
- **Pipeline**: R1 ✅ · R2 ✅ (§38 design chapter) · R3 ✅ · R4 ✅ (4 HIGH + 1 MEDIUM fixed) · R5 ✅ (+39 tests) · UAT 11/11 PASS (first pass) · R6 ✅ (§38.10 As Built)
- **Files changed** (7): `shared/messages.js` (+MSG_BULK_REORDER_GROUPS), `shared/sort-order.js` (+`computeGroupReorder`), `background/storage/groups.js` (+`bulkReorderGroups`), `background/storage/{index.js,messages/storage-handlers.js}`, `sidepanel/sidepanel.{js,css}`, `tests/b031-group-drag.test.js` (new)
- **Key decisions**: D-1 new `MSG_BULK_REORDER_GROUPS` type + single-tx `bulkReorderGroups`. D-2 `filterGroupParentCandidates` reused as prebuilt Set (S22 LOW retro action finally resolved). D-3 four CSS classes, every property enumerated; browser default drag ghost. D-4 accept-and-expand post-drop for collapsed NEST target. D-5 sub-group REORDER within siblings supported; NEST blanket-rejected for sub-group sources. D-6 25/50/25 ratio-based zones confirmed.

#### [B-032] Auto-Scroll During Drag — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-22
- **Pipeline**: R1 ✅ · R2 skipped (Fast Track) · R3 ✅ · R4 ✅ (0 CRITICAL/HIGH, clean) · R5 ✅ (+17 tests) · UAT deferred to S28 per Fast Track tier rule
- **Files changed** (1): `sidepanel/sidepanel.js` (~60 lines — `AUTO_SCROLL_EDGE_ZONE_PX`/`MAX_SCROLL_SPEED` constants + `_maybeAutoScroll` helper + `_dragTick` integration)
- **Implementation**: 60 px edge zones, `Math.round(MAX_SCROLL_SPEED × (1 - (distanceFromEdge / EDGE_ZONE_PX)))` linear ramp, gated on `_itemDragState !== null`, coordinated with existing `_scheduleDragTick` (single rAF loop per frame)

### Cross-sprint bonus fix — empty-group drop

B-025 UAT-3 surfaced a latent B-030 bug: `_computeDropTarget` required a `.item-row` ancestor, which doesn't exist in empty groups → silent no-op on BOTH single-item (B-030) and multi-item (B-025) drop paths. Fix: shared `{type:'emptyGroup', destGroupId}` branch with `destIndex = 0`. §36.11 amendment documents cross-sprint scope.

### UAT Results

- **B-025**: 9/9 PASS (pre-merge, Edge — round 2 after UAT-3 empty-group + UAT-8 ghost fixes in round 1)
- **B-031**: 11/11 PASS (pre-merge, Edge — first pass)
- **B-032**: Fast Track — existing suite green; full UAT deferred to S28 per tier rule

### Velocity
- Planned: 3 items (2M + 1S)
- Delivered: 3 items — 100% scope
- Test growth: 1001 → 1074 (+73)
- UAT rounds: B-031 = 1 · B-025 = 2 · B-032 = 0 (deferred)
- Follow-ups filed: B-083 (P1/S multi-sibling sub-group allow), B-084 (P2/S drop-zone visual refinement)
- Release: v1.18.0

### Retrospective (action items → Sprint 25)

- **HIGH**: Add C-10 "off-screen rect feasibility" probe to R2 Correctness Checklist in CLAUDE.md — B-025 UAT-8 demonstrated that CSS property enumeration alone doesn't catch `getBoundingClientRect`-before-layout-flush gotchas with `setDragImage` / snapshot APIs.
- **HIGH**: B-083 scheduled for S25 — `filterGroupParentCandidates` over-restrictive filter inherited from B-007 blocks multiple sibling sub-groups under one parent. Fix is a one-line delete but needs re-UAT for both B-007 dialog and B-031 drag-nest paths.
- **MEDIUM**: B-084 scheduled for S25 — drop-zone visual differentiation (REORDER vs NEST clarity).
- **LOW**: UAT plan drift pre-pass before S28 comprehensive UAT — still carry-forward from S21.

### R4 Findings Summary

- **B-025**: 0 CRITICAL / 3 HIGH (all fixed) / 4 MEDIUM (1 fixed M-1 selection clear, 3 deferred) / 7 LOW
- **B-031**: 0 CRITICAL / 4 HIGH (all fixed) / 6 MEDIUM (1 fixed M-1 title copy, 5 deferred) / 7 LOW
- **B-032**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (deferred) / 2 LOW
- **UAT layer**: 2 blockers caught pre-merge on B-025 (UAT-3 + UAT-8) — both resolved in-sprint. Validates S23 retro HIGH-3 for the third consecutive sprint (S22→S23→S24).
- **Key lesson**: R4 + R5 clean ≠ UAT pass. For L/M runtime-sensitive items, pre-merge UAT in-browser remains load-bearing.
- **Full dedup**: `docs/findings/sprint-24.md`

**Action Items for Sprint 25:**
1. [solution-architect] Add C-10 to R2 Correctness Checklist. [HIGH]
2. B-083 fix prioritised — multi-sibling sub-group allow. [HIGH]
3. B-084 scheduled — drop-zone visual differentiation. [MEDIUM]
4. [scrum-master] S28 comprehensive UAT must include deferred B-032 auto-scroll cases. [MEDIUM]

---

## Sprint 25 — Drag polish + R2 checklist (2026-04-22)

**Theme:** Close Sprint 24 retro action items — B-083 filter fix + B-084 drop-zone visual refinement + B-085 C-10 R2 Correctness Checklist addition.
**Release:** v1.19.0
**Merge commit:** `71feb49` (PR #31)

### Completed Items

#### [B-083] Allow multiple sibling sub-groups under one parent — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-22
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 HIGH, 2 LOW deferred) · Re-UAT ✅ PASS (both B-007 dialog and B-031 drag-nest paths)
- **Files changed** (3): `shared/group-nesting.js` (filter deletion + docstring update), `tests/b007-sub-group-nesting.test.js` (4 existing updated + 5 new B-083 sanity tests), `tests/b031-group-drag.test.js` (T-10 pair rewritten + 1 new B-083 regression test)
- **Key change**: one-line deletion of `.filter((g) => !idsWithChildren.has(g.id))` in `filterGroupParentCandidates`. Depth-1 cap preserved by the pre-existing `parentId == null` filter. Security-reviewer verified backend `assertDepthAndCycle` + `bulkReorderGroups:343-348` remain the fail-closed authority for depth-2 + cycle rejection.

#### [B-084] Refine drag drop-zone visual differentiation — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-22
- **Pipeline**: R1 ✅ · R3 ✅ (Option A+C shipped) · R4 ✅ (0 HIGH, 2 MEDIUM + 2 LOW deferred) · Visual UAT ✅ PASS
- **Files changed** (2): `sidepanel/sidepanel.css` (+39 / −13 — height 2→3 px + soft glow on reorder line; bg tint 12%→20% + inset outline on nest highlight; `@supports` fallbacks updated), `sidepanel/sidepanel.js` (+82 / −8 — `_applyGroupDragHysteresis` pure helper + `pendingProposedMode` state + ±2 px boundary deadzone)
- **User note**: future UI design pass tracked as B-086 (deferred to post-feature-parity)

#### [B-085] Add C-10 "Off-screen rect feasibility" to R2 Correctness Checklist — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-22
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings) · no UAT (doc edit)
- **Files changed** (1): `CLAUDE.md` (+1 line — C-10 row inserted in R2 Correctness Checklist table)
- **Outcome**: future R2 designs using `setDragImage` / snapshot APIs with off-screen elements now have an explicit checklist gate. Cites Sprint 24 B-025 UAT-8 as the blocking precedent.

### UAT Results

- **B-083**: re-UAT in Edge — both paths PASS (B-007 dialog parent-picker + B-031 drag-nest onto parent-with-children)
- **B-084**: visual UAT in Edge — PASS (reorder line beefier with glow; nest highlight stronger contrast; hysteresis reduces boundary flicker)
- **B-085**: N/A (documentation edit)

### Velocity
- Planned: 3 items (2 S + 1 XS)
- Delivered: 3 items — 100% scope
- Test growth: 1074 → 1080 (+6) — B-083 regression suite
- Fix cycles: 0 (no UAT failures)
- Follow-ups filed: B-086 (P3/M deferred UI design pass)
- Release: v1.19.0

### Retrospective (action items → Sprint 26)

- **HIGH**: S26 scope — resume feature-parity roadmap. B-022 L quick-search popup is the top of the roadmap; was scheduled for S25 but deferred to accommodate S24 retro items. Now the next priority.
- **LOW**: Hygiene items carried from S25 — B-083 L-2 dead `outIds` variable + B-084 M-2 side-effect in `_compute*` function + L-2 `DEADZONE_PX` module-level constant. Absorb as drive-by during unrelated S26+ work or bundle into a hygiene-pass item if the debt accumulates.
- **DEFERRED**: B-086 scheduled post-feature-parity (likely S29+ or after v2 stabilises).

### R4 Findings Summary

- **B-083**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 2 LOW (test-only hygiene)
- **B-084**: 0 CRITICAL / 0 HIGH / 2 MEDIUM / 2 LOW (all hygiene; no correctness concerns)
- **B-085**: 0 findings (clean CLAUDE.md edit)
- **Total**: 0 CRITICAL / 0 HIGH / 2 MEDIUM / 4 LOW — cleanest R4 since S21's polish close
- **Security posture**: backend fail-closed authority for depth/cycle preserved; no new attack surface; no new message types or permissions
- **Full dedup**: `docs/findings/sprint-25.md`

**Key lesson**: Fast Track sprints that absorb prior retro items + clear small backlog debt produce very low finding counts. Good pattern for sprints immediately after large L/M feature ships.

**Action Items for Sprint 26:**
1. [scrum-master] S26 scope — resume feature-parity roadmap with B-022 L (quick search popup). [HIGH]
2. Hygiene carry-forward items absorbed opportunistically or bundled. [LOW]

---

## Sprint 26 — B-022 Quick Search Popup (2026-04-23)

**Theme:** First Full L feature since S23 drag foundation — Alt+J popup for fuzzy-searching bookmarks + open tabs with keyboard navigation + recency.
**Release:** v1.20.0
**Merge commit:** `75dd377` (PR #32)

### Completed Items

#### [B-022] Quick Search Popup — ✅ DONE
- **Tier**: Full (L) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R2 ✅ (§39 design chapter) · R3 ✅ · R4 ✅ (3 HIGH + 2 MEDIUM fixed) · R5 ✅ (+39 tests) · UAT 12/12 PASS (after 3 fix cycles on UAT-4) · R6 ✅ (§39.10 As Built documents 6 deviations) · R7 ✅
- **Files changed** (25: 11 new + 14 modified):
  - NEW: `popup/popup.{js,css}`, `shared/{favicon,highlight}.js`, `docs/design/39-b-022-quick-search-popup.md`, `docs/findings/sprint-26.md`, `docs/UAT_B-022.md`, `docs/user-manual/quick-search-popup.md`, `tests/b022-quick-search.test.js`
  - MOD: `manifest.json`, `CHANGELOG.md`, `popup/popup.html` (stub → real), `shared/messages.js` (+MSG_RECENCY_ADD), `background/storage/{shapes,partitions,index,migration}.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.js`, `tests/storage-init.test.js`, all sprint/backlog docs
- **Key architectural decisions** (§39.3):
  - D-1 `default_popup` lifecycle (not programmatic `openPopup`)
  - D-2 shortcut via existing `_execute_action` / Alt+J (no manifest change)
  - D-3 new `tj:recency` partition (schema v1, cap 50, additive via `initializePartitions`)
  - D-4 keyboard model with focus trap + arrow interception
  - D-5 score formula (exact > prefix > substring + recency boost)
  - D-6 dedupe: two rows (one per section) for saved+live same URL
- **As Built deviations** (§39.10, 3 R3 + 3 UAT):
  - R3: migration simplified (no MIGRATION_STEPS), breadcrumb placeholder text, result-cap proportional split
  - UAT: body-width MV3 popup anchor (html,body), empty-state reparented out of scroll container, popup-lifecycle message race (recency fires BEFORE navigate)
- **R4 fixes pre-R5**: H-1 google.com favicon removed · H-2 Tab focus trap · H-3 bookmark/live-dot icon overlay · M-1 maxlength 256 · M-2 live-region routing

### UAT Results

- **12/12 PASS** in Edge after 3 UAT-4 fix cycles (width → empty-state → recency race)
- Popup-lifecycle race (D-UAT-3) was invisible to automated tests (chrome-mock doesn't simulate focus-shift tear-down). UAT-only signal class.

### Velocity
- Planned: 1 item (Full L)
- Delivered: 1 item — 100% scope
- Test growth: 1080 → 1119 (+39)
- UAT rounds: 3 fix cycles on UAT-4 before all 12 cases cleared
- Release: v1.20.0
- Follow-ups filed: B-087 proposed for S27 (CLAUDE.md C-11 addition)

### Retrospective (action items → Sprint 27)

- **HIGH**: Add **C-11 Popup-lifecycle message ordering** to R2 Correctness Checklist in CLAUDE.md — write messages MUST be queued BEFORE focus-shifting API calls in popup surfaces. UAT-4 D-UAT-3 is the blocking precedent. File as B-087 (pattern: B-085 C-10 addition).
- **MEDIUM**: R4 triage rubric — "deviates from spec skeleton" + "touches user-visible positioning" = HIGH by default. Under-triaged L-1 in S26 caused UAT-2 fix cycle.
- **MEDIUM**: Chrome-mock gap for popup lifecycle races — investigate a `__test__.simulateActivateShuttersPopup()` helper for S27+ test infrastructure.
- **LOW**: B-083/B-084 S25 hygiene debt — absorb during any S27+ sidepanel drive-by work.

### R4 Findings Summary

- **B-022**: 0 CRITICAL / 3 HIGH (all fixed) / 4 MEDIUM (2 fixed, 2 deferred) / 6 LOW (2 fixed via side-effect, 4 deferred)
- **Total**: 0 CRITICAL / 3 HIGH / 4 MEDIUM / 6 LOW
- **UAT layer**: 3 blockers caught pre-merge, all resolved in-sprint. HIGH-3 validated for 4th consecutive sprint (S22→S23→S24→S26).
- **Full dedup**: `docs/findings/sprint-26.md`

**Key lesson**: single-item L sprints are highest-risk — no diversity of work surfaces cross-cutting issues. Automated tests green + R4 clean still missed three runtime gotchas in the MV3 popup lifecycle. Pre-merge UAT for L tier remains load-bearing.

**Action Items for Sprint 27:**
1. [solution-architect] File B-087 — CLAUDE.md C-11 addition. [HIGH]
2. [scrum-master] R4 triage rubric update. [MEDIUM]
3. [test-engineer] Investigate chrome-mock popup-lifecycle race simulation. [MEDIUM]

---

## Sprint 27 — B-023 Group Jump Popup + B-087 C-11 Checklist (2026-04-23)

**Theme:** Second popup-surface feature after B-022 quick-search (S26). B-087 XS codifies C-11 R2 checklist item (S26 retro HIGH action); B-023 L applies it from day one. Meta-loop validated: retro → codification → next-sprint application.
**Release:** v1.21.0
**Merge commit:** `01306b2` (PR #33)

### Completed Items

#### [B-087] C-11 Popup-lifecycle message ordering — R2 Correctness Checklist Addition — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings)
- **Files**: `CLAUDE.md` (+1 line — C-11 row after C-10)
- **Outcome**: Future popup-surface work (B-035, B-036, any popup extensions) now has an explicit checklist gate. Sprint 26 B-022 UAT-4 D-UAT-3 cited as blocking precedent.

#### [B-023] Group Jump Popup — ✅ DONE
- **Tier**: Full (L) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R2 ✅ (§40 design chapter ~5000 words) · R3 ✅ (~1400 LOC new) · R4 ✅ (5 HIGH + 2 MEDIUM fixed) · R5 ✅ (+44 tests) · UAT 13 PASS + 1 SKIP + 1 unknown · R6 ✅ · R7 ✅
- **Files** (18: 7 new + 11 modified):
  - NEW: `popup/group-jump-popup.{html,js,css}`, `tests/b023-group-jump-popup.test.js`, `docs/design/40-b-023-group-jump-popup.md`, `docs/findings/sprint-27.md`, `docs/UAT_B-023.md`, `docs/user-manual/group-jump-popup.md`
  - MOD: `CLAUDE.md` (C-11), `CHANGELOG.md`, `STORE_LISTING.md`, `manifest.json`, `background/service-worker.js` (+SW listener), sprint/backlog/findings docs, `docs/SOLUTION_DESIGN.md`
- **Key architectural decisions** (§40.3):
  - D-1 Two separate popup surfaces (not shared B-022 with mode-toggle)
  - D-2 SW `chrome.commands.onCommand('group-jump')` with setPopup/openPopup/setPopup dance
  - D-3 In-popup drill-in (not send-to-sidepanel)
  - D-4 Escape always closes; ArrowLeft-at-input-start = Back
  - D-5 Single round-trip `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])`; reuses `shared/group-picker-core.js`
  - D-6 N/A (separate surfaces; no mode-toggle)
  - D-7 Zero SW writes in v1 → C-11 vacuously satisfied
- **As Built deviations** (§40.10, 3 R4-discovered + 2 R3-adjustments):
  - D-R4-1 `applyGroupPickerFilter` inline-vs-import (fixed: import + `.slice(GROUP_RESULT_CAP)`)
  - D-R4-2 SW listener async/await → sync `.catch().finally()` (critical lifecycle restore fix)
  - D-R4-3 Live-tab `{tabId, windowId}` variant dispatch (was missing — B-022 parity restored)
  - D-R3-1 `_enterUngroupedDrillIn` added for Ungrouped pseudo-row Enter
  - D-R3-2 Defensive `try/finally` preserved through D-R4-2 reshape

### UAT Results

- 13 PASS · 1 SKIP (UAT-14 C-11 vacuous per D-7 zero-write design) · 1 unknown (UAT-3 popup-to-popup transition — observability-limited, not FAIL; flagged as test-infra gap for S28 investigation)
- Zero UAT-driven fix cycles (contrast S26 B-022 which needed 3 on UAT-4)

### Velocity
- Planned: 2 items (1 Full L + 1 Fast Track XS)
- Delivered: 2 items — 100% scope
- Test growth: 1119 → 1163 (+44)
- UAT rounds: 0 post-R5 fix cycles
- Release: v1.21.0

### Retrospective (action items → Sprint 28)

- **HIGH**: S28 scope — per roadmap: B-035 (P2/M standalone window; applies C-11 from day one), B-046 (P2/S global shortcuts; unblocked), B-082 (P1/XS popup open-sidepanel button). P-1 allows one M; pair all three feasible.
- **MEDIUM**: R2 reuse-surface tables should use MUST language (not expository) — R3 H-1/H-2/H-5 were all reuse-contract deviations. Tighten templates at next CLAUDE.md editorial pass.
- **MEDIUM**: SW-logged event trace for UAT popup-to-popup observability (D-R4-2 class issue surfaced UAT-3 observability gap).
- **MEDIUM**: C-11 adjacent class "Popup-lifecycle continuation state" — D-R4-2 was the same root cause (popup teardown terminates async continuation) but NOT a C-11 violation (no writes involved). Consider C-12 after one more precedent; don't over-proliferate.
- **LOW**: Hygiene debt accumulating across S25/S26/S27 (~15 deferred items). Propose B-088 hygiene-pass item for S28/S29, OR absorb as drive-by.

### R4 Findings Summary

- **B-087**: 0 findings
- **B-023**: 0 CRITICAL / 5 HIGH (all fixed) / 4 MEDIUM (2 fixed inline; M-2 resolved as side-effect of H-1; M-4 perf deferred) / 7 LOW (deferred)
- **Total**: 0 CRITICAL / 5 HIGH / 4 MEDIUM / 7 LOW
- **UAT layer**: 0 blockers (contrast S26's 3) — S26 retro action items effectiveness visible
- **Security posture**: B-022 patterns inherited; zero network calls, zero new permissions, zero new message types, zero new partitions; XSS tight; SW listener sync + idempotent
- **Full dedup**: `docs/findings/sprint-27.md`

**Key lesson**: The S26→S27 meta-loop worked: retro identified popup-lifecycle gap → S27 filed B-087 in kickoff → shipped early-wave → B-023 R2 referenced canonical C-11 → R4 rubric update caught async-listener HIGH that would have silently regressed B-022 default_popup. End-to-end codification cycle under one sprint.

**Action Items for Sprint 28:**
1. [scrum-master] S28 kickoff — B-035 + B-046 + B-082 candidate. [HIGH]
2. [solution-architect] R2 reuse-surface tables adopt MUST language. [MEDIUM]
3. [test-engineer] SW-logged event trace for UAT observability. [MEDIUM]
4. Hygiene debt — absorb drive-by OR file B-088. Product-owner decides. [LOW]

---

## Sprint 28 — B-035 Standalone Window + B-046 Shortcuts + B-082 Popup Button (2026-04-23)

**Theme:** Feature-parity roadmap close — three items: B-035 standalone window (Full M; applies C-11 from day one), B-046 global shortcuts (reduced S→XS at R1 audit), B-082 popup "Open side panel" button. UAT-4 surfaced a 9-sprint-old latent bug in B-052's `hashItem` (sortOrder blindspot) — fixed as cross-module amendment.
**Release:** v1.22.0
**Merge commit:** `8dae2ba` (PR #34)

### Completed Items

#### [B-035] Standalone Window Display Mode — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ (20 ACs) · R2 ✅ (§41 design chapter ~5000 words) · R3 ✅ (~66 LOC SW) · R4 ✅ (1 HIGH + 1 MEDIUM + 2 LOW fixed) · R5 ✅ (+24 tests) · UAT 12/13 PASS + 1 SKIP + 2 UAT-4 fix cycles · R6 ✅ (§41.10 As Built, 5 deviations) · R7 ✅
- **Files**: `background/service-worker.js` (+66 LOC listener + helper + constants), `tests/b035-standalone-window.test.js` (new), `docs/design/41-b-035-standalone-window.md` (new), `docs/user-manual/standalone-window.md` (new)
- **R2 decisions** (§41.3):
  - D-1 `popup` window type (not `normal`)
  - D-2 Load `sidepanel/sidepanel.html` verbatim (zero new HTML/CSS/message types)
  - D-3 `chrome.windows.getAll({populate:true, windowTypes:['popup']})` + URL match for existing-instance detection (cold-start safe)
  - D-4 1200×800 centered on current real (non-popup) window; falls back to `realWins[0]`
  - D-5 `MSG_STATE_CHANGED` subscription automatic (sidepanel JS unchanged)
  - D-6 C-11 vacuous (no writes from standalone command path)
  - D-7 NO new permission (`chrome.windows.*` implicit under `tabs` — B-014 precedent)
  - D-8 B-063 `window.blur` context-menu-close listener inherits automatically
- **As Built deviations** (§41.10, 3 R4 + 2 UAT):
  - D-R4-1 Spec drop `|| allWins[0]` anchor fallback restored with popup-type filter (`realWins[0]`)
  - D-R4-2 Popup-type filter on anchor candidate set (M-2 side-effect fix)
  - D-R4-3 Key-order + citation comments (L-1, L-2)
  - D-UAT-4a `hashItem` sortOrder inclusion (cross-module, §34.15 amendment)
  - D-UAT-4b Broadcast handler pre-patch reorder check → renderAll bail (patch-layer can't reparent)

#### [B-046] Global Keyboard Shortcuts — ✅ DONE
- **Tier**: Fast Track (XS, reduced from S at R1 audit) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ (manifest audit found shortcuts pre-registered v1.18.0+) · R3 ✅ (doc-only) · R4 ✅ (0 HIGH; 2 MEDIUM doc polish inline)
- **Files**: `docs/user-manual/keyboard-shortcuts.md` (new, 45 lines + forward-compat browser-limit callout)
- **Outcome**: Audit-first R1 saved ~60-80% of Full-tier overhead. Pattern validated for follow-up items to shipped infrastructure.

#### [B-082] Popup "Open Side Panel" Button — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R3 ✅ (popup button + handler + CSS + chrome-mock extension) · R4 ✅ (1 HIGH Tab trap + 2 MEDIUM + 1 LOW fixed)
- **Files**: `popup/popup.{html,js,css}` (+94 net), `tests/chrome-mock.js` (+28 sidePanel mock), `tests/b082-popup-sidepanel-btn.test.js` (new, 3 tests)
- **R4 fixes pre-close**: H-1 Tab trap includes new button (input ↔ rows ↔ button cycle), M-1 defensive `window.close()` comment, M-2 rapid-click `_sidepanelOpening` guard, L-1 error-color theme tokens

### UAT Results

- **B-035**: 12/13 PASS · 1 SKIP (UAT-6 secondary monitor — single-display rig) · UAT-4 required 2 fix cycles (cross-surface reorder sync — see below)
- **B-082**: smoke PASS (button renders, opens side panel, closes popup, Tab trap cycles correctly)
- **B-046**: smoke PASS (Alt+J · Alt+K · Alt+Shift+J all fire with side panel closed)

### Cross-module fix chain (UAT-4 — 9-sprint-old latent bug closure)

`hashItem` in `sidepanel/search-index.js` shipped in B-052 (S19) WITHOUT `sortOrder`. B-030 v2 (S23) worked around it with originating-surface `renderAll` tail. B-025 (S24) deferred the fix as §37.9 F-1 "future optimization". B-035 (S28) was the FIRST new surface consuming broadcasts WITHOUT an originating compensation — UAT-4 surfaced it immediately.

- **Layer 1**: `hashItem` now includes `sortOrder` — closes §37.9 F-1
- **Layer 2**: `sidepanel/sidepanel.js` broadcast handler pre-checks for sortOrder drift → bails patch to `renderAll` (patch-consumer can't reparent DOM via `replaceWith`)
- **Test invariant flip**: `tests/b052-fuzzy-search-perf.test.js` sortOrder-edit-noop test inverted to expect `patch` with S28 docstring
- **Docs**: §34.15 amendment + §41.10.1 fix chain trace

### Velocity

- Planned: 3 items (1 Full M + 2 Fast Track XS)
- Delivered: 3 items — 100% scope. B-046 reduced S→XS at R1 (audit-first).
- Test growth: 1163 → 1190 (+24 B-035 + 3 B-082; 1 B-052 test inverted; net +27)
- UAT rounds: B-035 2 cycles on UAT-4; B-082 + B-046 smoke clean
- Release: v1.22.0
- **6 consecutive sprints shipped without rollback or post-merge regression** (S23 → S28)

### Retrospective (action items → Sprint 29)

- **HIGH**: S29 scope candidate — B-038/B-039/B-040 (3× XS prefs) + B-036 (P3/L new tab page). B-036 is next L anchor and applies C-11 from day one (new-tab context is popup-adjacent).
- **MEDIUM — R2 broadcast-receiver audit pattern**: when a new surface consumes existing broadcasts, R2 MUST audit broadcast-receiver paths in OTHER surfaces for patterns that only work because of the originating surface's compensations. Add as a CLAUDE.md note (not yet a formal C-entry — wait for second precedent).
- **LOW**: `_patchSingleRow` same-group reorder — current S28 fix is robust but reactive (bails to renderAll). Proper fix would extend patch-consumer to `insertBefore` reposition. Perf improvement only; candidate for S29+ hygiene or B-088 bundle.
- **LOW**: Hygiene debt — ~20 deferred items across S25-S28. Decide at S29 kickoff: file B-088 hygiene-pass (P2/S) or continue opportunistic absorption.

### R4 Findings Summary

- **B-035**: 0 CRITICAL / 1 HIGH (fixed) / 1 MEDIUM (fixed) / 3 LOW (2 fixed, 1 deferred); 0 security findings
- **B-046**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (fixed inline) / 2 LOW (deferred)
- **B-082**: 0 CRITICAL / 1 HIGH (fixed) / 2 MEDIUM (fixed) / 1 LOW (fixed)
- **Total**: 0 CRITICAL / 2 HIGH / 5 MEDIUM / 6 LOW
- **UAT layer**: 1 blocker (UAT-4 reorder sync) — required 2-layer cross-module fix. Latent 9 sprints.
- **Security posture**: zero new permissions · zero network calls · zero new message types · zero new partitions. XSS tight; SW listener sync + idempotent. All C-1 through C-11 PASS or N/A.
- **Full dedup**: `docs/findings/sprint-28.md`

**Key lesson**: `hashItem` sortOrder was a classic "works because of compensating workaround" bug. Not caught by unit tests (tests codified the workaround contract). Not caught by any of 4 consumer sprints because each had the originating-surface compensation. Caught by UAT-4 the moment B-035 became the first surface WITHOUT the compensation. **Pattern**: test-first culture is insufficient when tests codify the workaround instead of the invariant. R2 design review — tracing the FULL receiver path, not just the originator — is the appropriate gate for this class of latent tech debt.

**Action Items for Sprint 29:**
1. [scrum-master] S29 scope — B-036 + B-038/039/040 candidate (L anchor + 3 XS prefs). [HIGH]
2. [solution-architect] R2 broadcast-receiver audit note in CLAUDE.md (informal pre-C-entry). [MEDIUM]
3. Patch-consumer same-group reorder extension — hygiene candidate. [LOW]
4. Hygiene debt — B-088 bundle decision at S29 kickoff. [LOW]

---

## Sprint 29 — B-036 New Tab + B-089 Settings Panel + B-038 View Mode + B-040 Auto-collapse (B-039 Dropped) (2026-04-24)

**Theme:** Feature-parity roadmap close — new tab page (Full L anchor) + settings UI scaffolding (S, filed mid-kickoff to unblock prefs) + 2 XS pref toggles. B-039 (newtab toggle) dropped at sprint close after MV3 constraint surfaced via UAT-9f-2.
**Release:** v1.23.0
**Merge commit:** `ca61da5` (PR #35)

### Completed Items

#### [B-089] Settings Panel Scaffolding — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ (~780 LOC; 24 tests) · R4 ✅ (0 CRITICAL; 2 HIGH fixed [Escape close + init dedup]; 3 MEDIUM defense-in-depth; 2 LOW)
- **Files**: `sidepanel/settings-dialog.js` (new, ~547 LOC), `sidepanel/sidepanel.{html,js,css}` (gear button + overlay + 165 LOC dialog styles), `tests/b089-settings-dialog.test.js` (new, 24 tests)
- **Outcome**: Sidepanel header gear icon → modal dialog with `role="dialog"` + sender-id-validated broadcast subscription + `renderToggle` / `renderSelect` helpers consumed by Wave 1. Modal-stacking guard added pre-merge (UAT-9f-1 fix). Zero new permissions, zero new message types, zero new storage schema.

#### [B-036] New Tab Page Replacement — ✅ DONE
- **Tier**: Full (L) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ (23 ACs) · R2 ✅ (§42 design chapter ~5000 words) · R3 ✅ (5 new files; ~32 tests) · R4 ✅ (0 CRITICAL; 4 HIGH fixed pre-R5: `_itemById` O(n²) hot-loop, `_applyFilter` redundant DOM walk, missing `console.warn` breadcrumb, missing `_handleBroadcast` try/catch) · R5 ✅ (4 gap-fill tests + 30-case UAT plan) · 2 pre-merge UAT cycles
- **Files**: `newtab/newtab.{html,js,css}` (new — ~1700 LOC + tests), `newtab/theme-init.js` (new — verbatim duplicate of sidepanel; S30+ extraction candidate), `tests/b036-newtab.test.js` (new), `docs/design/42-b-036-newtab-page.md` (new), `docs/user-manual/new-tab-page.md` (new), `docs/UAT_B-036.md` (new, 30 cases)
- **R2 decisions** (§42.3):
  - D-1 vanilla DOM in `newtab/newtab.js` (do NOT import sidepanel.js); ~150-200 LOC accepted overlap
  - D-2a `about:blank` redirect (RESCINDED at sprint close — newtab now always-on per B-039 drop)
  - D-2b `chrome.search.query({text, disposition:'NEW_TAB'})` — `search` permission already granted
  - D-3 CSS Grid `repeat(auto-fill, minmax(320px, 1fr))` — multi-column responsive
  - D-4 Import fuzzy index from `sidepanel/search-index.js` verbatim
  - D-5 C-11 fire-and-forget click-to-navigate (defensive — newtab doesn't tear down on focus shift, but pattern preserved)
  - D-6 Serial `MSG_GET_PREFERENCES` then `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` (later simplified post-B-039 drop)
  - D-7 Module-scope `chrome.runtime.onMessage` subscription
- **Pre-merge UAT fix bundle** (5 issues caught + fixed):
  - UAT-2 sub-group order swap → removed name tiebreaker in `_orderedGroupIds`; matches sidepanel byte-for-byte
  - UAT-3 two green indicator dots → `_buildItemRow` was double-creating wrap; removed early `_applyRowLiveState` call
  - UAT-5 `/` shortcut over-broad guard → narrowed to web-search input only
  - UAT-9f-1 dialog stacking → Settings refuses to open when other overlay siblings are visible
  - UAT-9f-2 `about:blank` UX → led to B-039 drop (newtab always-on)

#### [B-038] View Mode Preference — ✅ DONE
- **Tier**: Fast Track (XS, tier-upgrade flag cleared at R2) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ (17 ACs) · R2 ✅ (§43 design chapter — popup-as-router pattern locked) · R3 ✅ (5-file delta; 18 tests) · R4 ✅ code PROCEED + security PROCEED (0 CRITICAL/HIGH; 2 MEDIUM hygiene; 2 LOW)
- **Files**: `shared/messages.js` (+`MSG_OPEN_STANDALONE` — non-`tj/` prefix per dispatcher-collision avoidance), `background/service-worker.js` (+onMessage branch), `popup/popup.js` (`_bootWithPref` + `_bootQuickSearch` split; fire-and-forget sendMessage + immediate `window.close`), `sidepanel/sidepanel.js` (+ renderSelect call), `tests/b038-view-mode-pref.test.js` (new)
- **R2 decisions** (§43): D-1 popup-as-router (Candidate A `setPopup('')` + `onClicked` rejected — MV3 cannot discriminate Alt+J from toolbar-click); D-2 surfaces governed = toolbar + `_execute_action`; D-3 inherit B-035 fallback. Naming normative: `displayMode` ∈ `'sidepanel'|'window'`. AC8 reinterpreted (R2 normative — Alt+J follows pref).
- **C-11 critical guardrail**: popup.js fire-and-forget sendMessage + immediate `window.close()` with zero await between. Verified by self-grep AND test (AC17g asserts call ordering).

#### [B-040] Sub-group Auto-collapse Preference — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ (14 ACs) · R3 ✅ (~75 LOC; 17 tests) · R4 ✅ code PROCEED + security PROCEED (0 CRITICAL/HIGH; 1 MEDIUM unreachable double-catch — S30+ hygiene; 1 LOW console.warn policy)
- **Files**: `sidepanel/sidepanel.js` (+~75 LOC: renderSettingsToggle + `_maybeCascadeCollapseChildren` helper + cascade gate in `toggleGroup`), `tests/b040-auto-collapse-subgroups.test.js` (new)
- **Outcome**: One-way collapse cascade (expand does NOT auto-expand). `Promise.all` over individual `MSG_UPDATE_GROUP` calls (no bulk variant exists). Default OFF preserves B-008 independence. Canonical-key drift caught: `autoCollapseSubGroups` (cap G), not `autoCollapseSubgroups` per BACKLOG R1 AC.

### Dropped Items

#### [B-039] New Tab Page Toggle Preference — ❌ DROPPED at sprint close
- **Originally tier**: Fast Track (XS) · originally shipped R3 + R4 clean (12 tests, 460 LOC)
- **Drop reason**: Pre-merge UAT-9f-2 surfaced that "OFF" cannot truly hand control back to the browser's default new tab page. **Manifest V3 does NOT allow runtime removal of `chrome_url_overrides.newtab`** — once declared, the extension's HTML loads on every new tab. The only available "OFF" behaviors are `about:blank` (R2 D-2a) or a custom disabled-state CTA page (R1 AC5). Neither matches user expectation of "browser default new tab page".
- **Product-owner decision** (2026-04-24): rather than ship a misleading toggle, drop the feature. Tab Junkie's new tab page is always-on while installed. To restore browser default, uninstall Tab Junkie via `edge://extensions` or `chrome://extensions`.
- **Reverted in same sprint**: B-039 R3 + UAT-9f-2 disabled-state code rolled back. Pref key `newTabOverride` retained in `DEFAULT_PREFERENCES` for backward compat (removing requires schema migration).
- **Hidden win**: B-039 R3 canonical-key audit caught a silent-bug drift in B-036 R3 (`prefs.newTabEnabled` shipped vs canonical `newTabOverride` — validator would have rejected toggle writes). Drift fix preserved across the revert.

### UAT Results

- **B-036**: 30-case UAT plan; 5 issues caught batch 1 (all fixed), 1 issue batch 2 (UAT-9f-2 → B-039 drop). UAT-1/4/5/6/7/8/9a/9b/9c/9d/9g/9h/10/11/12 PASS. UAT-9e SKIP. UAT-13/14/15-22 SKIP (themes are S30+).
- **B-038, B-040, B-089**: Fast Track XS/S — no formal UAT cycle (covered by sidepanel + popup smoke checks during B-036 UAT).

### Cross-module fix chain (B-036 R3 silent canonical-key drift)

B-036 R3 shipped `prefs.newTabEnabled` against `DEFAULT_PREFERENCES.newTabOverride` — `validatePrefsPatch` would have rejected any write to `newTabEnabled` with `ERR_VALIDATION`, meaning the B-039 toggle would have silently no-op'd against the wrong key. B-039 R3 audit caught this on the first canonical-key cross-check; fix shipped across `newtab/newtab.js`, `tests/b036-newtab.test.js` (32 fixture replacements). Drift fix preserved across the B-039 revert because the canonical-key normalization is independent of the toggle's existence.

### Velocity

- Planned: 5 items (1 Full L + 1 Fast Track S + 3 Fast Track XS)
- Delivered: 4 shipped + 1 dropped = **80% scope shipped + 100% honest scope** (B-039 drop was a discovery, not a slip)
- Test growth: 1190 → 1295 (+105 net; ~+90 across 4 shipped items, −12 from B-039 deletion + UAT fix tests)
- UAT rounds: B-036 = 2 cycles
- Release: v1.23.0
- **7 consecutive sprints shipped without rollback or post-merge regression** (S23 → S29)

### Retrospective (action items → Sprint 30)

- **HIGH**: File **B-090** — Add **C-12** "Manifest declarations runtime-mutability check" to R2 Correctness Checklist. R2 MUST verify whether any manifest declaration tied to enable/disable behavior can be modified at runtime. If not, R2 explicitly enumerates the available "OFF" behaviors and confirms with [product-manager] that the limited set is acceptable BEFORE R3 build. Reference: B-039 drop precedent.
- **MEDIUM**: R1 ACs MUST cross-check `DEFAULT_PREFERENCES` canonical key names (case + spelling) BEFORE publishing. Two key-drift bugs caught in S29 alone (B-036 newTabEnabled→newTabOverride, B-040 autoCollapseSubgroups→autoCollapseSubGroups). Add to R1 self-checklist in CLAUDE.md.
- **MEDIUM**: B-036 took 2 UAT cycles. For Full L items, allocate explicit "UAT polish budget" of 1-2 cycles after R5 — don't treat each cycle as a slip; treat as part of L-tier definition.
- **LOW**: Add "Sprint Close — Item Drop Checklist" subsection to CLAUDE.md (alongside Gate 4): docs to update when an item is dropped mid-sprint (BACKLOG, BACKLOG_BOARD, design chapter, user manual, CHANGELOG, retro).

### R4 Findings Summary

- **B-089**: 0 CRITICAL / 2 HIGH fixed (Escape close + init dedup) / 3 MEDIUM defense-in-depth / 2 LOW
- **B-036**: 0 CRITICAL / 4 HIGH fixed (`_itemById` O(n²), `_applyFilter` DOM walk, missing console.warn, missing try/catch) / ~10 MEDIUM/LOW (mostly fixed inline)
- **B-038**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (catch broadness, test reproduction drift) / 2 LOW
- **B-040**: 0 CRITICAL / 0 HIGH / 1 MEDIUM (unreachable double-catch) / 2 LOW
- **B-039 (dropped)**: R4 was clean (0 CRITICAL/HIGH; 2 MEDIUM coverage map gap, fragile comment-strip filter; 1 LOW). Drop was product-driven, not quality-driven.
- **Total**: 0 CRITICAL / 6 HIGH (all fixed pre-merge) / ~10 MEDIUM / ~12 LOW
- **UAT layer**: 5 issues caught + fixed pre-merge (B-036), 1 product-discovery (B-039 drop). 7th consecutive sprint of effective UAT-as-quality-gate.
- **Security posture**: 1 additive message type (`MSG_OPEN_STANDALONE`, fire-and-forget, no payload). Zero new permissions. Zero new partitions. Zero CSP changes. XSS posture clean across all 4 shipped items.

**Key lessons**:
- **Lesson 1**: MV3 constraints have product implications, not just technical ones. R2 architecture MUST enumerate "what does OFF actually deliver?" for any feature whose value depends on enable/disable parity with browser-native behavior.
- **Lesson 2**: Test-first culture combined with cross-item naming-drift audits caught 2 latent silent-bug risks (B-036 newTabEnabled, B-040 lowercase). Audit-first R3 builds pay out.
- **Lesson 3**: The cost of dropping a feature mid-sprint is ~½ day of agent time. The cost of shipping a misleading feature is unbounded user friction. Drops driven by product discovery should be normalized as a legitimate sprint outcome.

**Action Items for Sprint 30:**
1. [solution-architect] File B-090 — C-12 "Manifest declarations runtime-mutability check" addition to CLAUDE.md. P2/XS. Reference: B-039 drop. [HIGH]
2. [product-manager] R1 AC self-checklist update — cross-check `DEFAULT_PREFERENCES` canonical key names (case + spelling) before publishing. [MEDIUM]
3. [scrum-master] Sprint Close — Item Drop Checklist subsection in CLAUDE.md. [LOW]
4. S30 scope decision — B-037 themes (P2/M, last big feature), B-090 (XS), B-086 UI/UX pass (P3/M), B-088 hygiene bundle, comprehensive UAT sweep. v2 → main merge prep candidate. [HIGH]

---

## Sprint 30 — B-091 Settings Page Redesign + B-092 Dense Layout + B-093 Import/Export Rehome + B-090 C-12 (2026-04-24)

**Theme:** Configuration surface redesign — full-page Settings tab replaces B-089 modal; dense layout opt-in across all 3 surfaces; import/export rehomed to Settings → Data; B-090 C-12 checklist addition closes S29 retro HIGH.
**Release:** v1.24.0
**Merge commit:** `b113598` (PR #36)

### Completed Items

#### [B-090] C-12 Manifest Runtime-Mutability Checklist Add — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (code PROCEED + security PROCEED; 0 findings)
- **Files**: `CLAUDE.md` (+1 row C-12 in R2 Correctness Checklist table)
- **Outcome**: C-12 row added immediately after C-11. References B-039 drop as blocking precedent. Future R2 reviews now have explicit checklist gate for any feature whose enable/disable depends on a manifest declaration.

#### [B-091] Settings Page Redesign — ✅ DONE
- **Tier**: Spike-First (L) · **Closed**: 2026-04-24
- **Pipeline**: R0 ✅ · R1 ✅ (15 ACs) · R2 ✅ (§44 chapter; 10 D-decisions) · R3 ✅ (~700 net LOC; 5 created, 4 modified, 2 deleted atomically) · R4 ✅ (0 CRITICAL; 6 HIGH all fixed pre-R5) · R5 ✅ (27 tests + 30-case UAT plan) · R6 ✅ (§44.10 As Built filled) · R7 ✅
- **Files**: 
  - NEW: `settings/{settings.html,settings.js,settings.css,settings-fields.js,theme-init.js}`, `tests/b091-settings-page.test.js`, `docs/design/44-b-091-settings-page.md`, `docs/design/44-b-091-settings-page-r0-spike.md`, `docs/UAT_B-091.md`, `docs/user-manual/settings.md`
  - MOD: `sidepanel/{sidepanel.html,sidepanel.js,sidepanel.css}`
  - DEL: `sidepanel/settings-dialog.js` (B-089), `tests/b089-settings-dialog.test.js` (atomic in same R3 commit)
- **R0 spike** (`docs/design/44-b-091-settings-page-r0-spike.md`): D-1 LOCKED Candidate B (`chrome.tabs.create` dedicated tab); rejected modal, sidepanel takeover, standalone window. No sub-item split.
- **R2 decisions** (§44.3):
  - D-1 Surface = `chrome.tabs.create({url: chrome.runtime.getURL('settings/settings.html')})`
  - D-2 Tab dispatcher home = sidepanel-context (gear `click` handler), NOT SW
  - D-3 Focus management = skeleton state during async fetch; on resolve focus first control; on error focus Reload button
  - D-4 Performance budget = paint < 300ms, prefs < 200ms, save round-trip < 500ms
  - D-5 Broadcast lifecycle = subscribe via forked module's `init()`; tab close GCs JS realm + listener automatically
  - D-6 Accessibility = `<main>` landmark, `<h1>` page title, `<fieldset>`/`<legend>` for sections, `<label for>`, native keyboard nav
  - D-7 Rollback plan = `git revert <merge-sha>`; zero storage migration
  - D-8 Forked module API contract = byte-for-byte parity with B-089 `renderToggle`/`renderSelect`; ~50% LOC reduction by dropping dialog-lifecycle deps
  - D-9 B-089 deletion checklist = full file deletion + sidepanel.html DOM removal + sidepanel.js wiring removal + CSS rules relocated to settings.css
  - D-10 Test plan = 15 enumerated cases mapped to ACs
- **As Built deviations** (§44.10): 0 R2 deviations; 2 UAT-discovered findings:
  - UAT-discovered: stale-SW module-cache gotcha (new pref keys require extension toggle-OFF-then-ON to flush SW cache before they save successfully)
  - R4 fix bundle: 6 HIGH (controls disabled during pref load, redundant double-write, ARIA `role=alert`+`aria-live=polite` contradiction, 3 security-reviewer PASS checks) all resolved pre-R5

#### [B-092] Dense / Compact Layout Toggle — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ (~80 LOC; 24 tests) · R4 ✅ code PROCEED + security PROCEED (0 CRITICAL/HIGH; 1 MEDIUM cross-surface helper duplication — S30+ tech-debt; 3 LOW)
- **Files**: `settings/settings.{html,js}` (renderToggle + Layout placeholder removal), `sidepanel/sidepanel.{js,css}` (`applyDenseLayout` helper + `.tj-dense` rules), `newtab/newtab.{js,css}` (parallel newtab implementation), `background/storage/{shapes,preferences}.js` (`denseLayout` key + validator), `tests/b092-dense-layout.test.js` (new), `tests/b036-newtab.test.js` (assertion updates)
- **Outcome**: Settings → Layout → "Compact layout" toggle. When ON, `.tj-dense` body class flips on sidepanel + newtab + standalone. Pure CSS — single-line items, smaller fonts, hidden URL via descendant selectors. Default OFF preserves baseline.
- **Canonical key**: `denseLayout` (camelCase, matches `displayMode` / `autoCollapseSubGroups` / `importSkipDuplicates` convention).

#### [B-093] Import / Export Controls Rehome — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ (758 LOC new + 859 LOC removed from sidepanel.js) · R4 ✅ code PROCEED + security PROCEED (0 CRITICAL/HIGH; 2 MEDIUM both fixed pre-merge: `_wireOnce` document-keydown idempotency, `_importInFlight` clear-too-early)
- **Files**: 
  - NEW: `settings/settings-import-export.js` (758 LOC), `tests/b093-import-export-rehome.test.js` (10 tests)
  - MOD: `sidepanel/sidepanel.{html,js}` (-37 + -859 LOC), `settings/settings.{html,js,css}` (Data section + handlers), `tests/{b081-add-group-button,sprint-21-polish}.test.js` (selector + helper-location retargets)
- **Outcome**: 4 buttons + 2 file inputs moved from sidepanel header → Settings → Data section. Aria-labels preserved verbatim. All B-042/B-043/B-044/B-045 flows preserved. **B-070 §AC4 destructive-confirmation gate RETAINED** — preview dialog still default-focuses Cancel; Replace requires explicit click. B-070 R4 F-1 prefs-only variant + B-060 duplicate-toggle preference persist + B-080 plain-language repair breakdown + §33.10 5 MiB guard all preserved.

### UAT Results

- **B-091**: 30-case UAT plan executed; 28 PASS + 2 PASS-on-retry. Stale-SW gotcha was UAT-13/14 initial fail → toggle-OFF-then-ON cycle → PASS.
- **B-092**: PASS (after stale-SW reload — same root cause)
- **B-093**: PASS — sidepanel header confirmed buttonless; Settings → Data confirmed all 4 controls present + functional
- **B-090**: N/A (doc-only)

### Stale-SW Gotcha (new precedent — documented across 4 surfaces)

When the extension is updated and a new pref key is added to `DEFAULT_PREFERENCES` + validator, the running SW retains the OLD module imports. `MSG_SET_PREFERENCES` with the new key throws `ERR_VALIDATION: unknown field` until the SW restarts. **Mitigation**: extension toggle-OFF-then-ON at `edge://extensions` flushes SW module cache. Documented in:
- `CHANGELOG.md` v1.24.0 release note
- `docs/user-manual/settings.md` first-time setup section
- `docs/design/44-b-091-settings-page.md` §44.10.4 (new precedent)
- S30 retrospective action item (S31 R2 checklist addition)

### Velocity

- Planned: 4 items (1 Spike-First L + 1 Fast Track S + 2 Fast Track XS)
- Delivered: 4 items — 100% scope. Zero deferrals, zero drops.
- Test growth: 1295 → 1331 (+36 net; B-091 +24, B-092 +24, B-093 +11, minus B-089's 24 deleted; minor adjustments in B-038/B-040 retargets)
- UAT rounds: 1 (B-091; stale-SW retry within same UAT cycle)
- Release: v1.24.0
- **8 consecutive sprints shipped without rollback or post-merge regression** (S23 → S30)

### Retrospective (action items → Sprint 31)

- **MEDIUM — New-pref-key stale-SW release note**: R2 MUST note "extension toggle required after update; add to release notes" whenever a sprint adds a new key to `DEFAULT_PREFERENCES`. Production-only issue that `chrome-mock.js` cannot reproduce. Discovered at UAT, not at design.
- **MEDIUM — Selector audit step in R1 ACs**: For any rehome item (B-093 precedent), R1 ACs should include an explicit "selector audit" listing existing test files that reference moved element IDs. R3 then has a complete checklist instead of grepping.
- **LOW — Settings keyboard shortcut**: Settings has no `commands` shortcut entry. Adding one requires C-6 + C-12 audit. Lower-friction alternative: B-082 toolbar popup Settings entry. Defer to S31+.

### R4 Findings Summary

- **B-090**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW (doc-only)
- **B-091**: 0 CRITICAL / 6 HIGH (all fixed pre-R5) / multiple MEDIUM (mostly inline) / LOW deferred
- **B-092**: 0 CRITICAL / 0 HIGH / 1 MEDIUM (cross-surface helper duplication — S30+ tech-debt) / 3 LOW
- **B-093**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (both fixed pre-merge: `_wireOnce` document-keydown, `_importInFlight` clear-too-early) / 2 LOW
- **Total**: 0 CRITICAL / 8 HIGH (all fixed pre-merge) / ~6 MEDIUM (most resolved) / ~6 LOW deferred
- **Security posture**: zero new permissions, zero new manifest declarations, zero new message types, zero CSP changes, zero storage migration, zero XSS surface. All rendered text via `textContent`. Sender-id validation confirmed.

**Key lesson**: The Wave 0 anchor + Wave 1 consumers pattern (precedent: S29) continues to ship cleanly. B-091 R3 landed → B-092 + B-093 R3 plugged in without merge conflicts or rework. The forked-helpers pattern (B-091 D-8 — port B-089 module verbatim, drop dialog-lifecycle deps) produced a ~50% LOC reduction with byte-for-byte API parity, validated by zero behavior change in the B-038 + B-040 tests after retargeting.

**Action Items for Sprint 31:**
1. [solution-architect] R2 C-1 checklist addition: stale-SW release-note guidance for new pref keys. [MEDIUM]
2. [product-manager] R1 AC template: rehome items must include "selector audit" listing test files with moved-element ID refs. [MEDIUM]
3. [scrum-master] S31 scope decision — B-037 themes is the natural Settings → Theme section anchor. B-082 toolbar popup Settings entry as polish XS. B-086 UI/UX pass + B-088 hygiene candidates. v2 → main merge prep evaluation. [HIGH]
4. Settings keyboard shortcut deferral noted; revisit if usage friction surfaces. [LOW]

---

## Sprint 31 — Themes + Process Polish + Popup Settings Link (2026-04-25)

**Theme:** Ship the B-037 theme system (14 IDE-inspired themes) as the final major user-facing feature of v2. B-094 closes Sprint 30 retro process action items; B-095 adds an "Open Settings" footer button to the quick-search popup. B-098 Tokyo Night approved mid-sprint as an additive slip-in.
**Release:** v1.26.0 (combined with Sprint 32; skips v1.25.0 per product-owner direction)
**Branch:** `feature/sprint-31-themes`
**Tests:** 1,295 → ~1,360 (+65 S31 portion; final combined 1,401 after S32)

### Completed Items

#### [B-037] Theme Selection — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R2 ✅ (§45 design chapter, ~5,000 words) · R3 ✅ · R4 ✅ (0 CRITICAL / 4 HIGH all fixed) · R5 ✅ (30/30 UAT PASS after UAT-6 fix cycle) · R6 ✅ (§45.10 As Built filled) · R7 ✅
- **Files changed**: `shared/themes.css` (new, canonical palette — 14 themes + system), `shared/theme-init.js` (new, consolidated FOUC-guard), `shared/theme-slugs.js` (new), `shared/surface-prefs.js` (new), `shared/settings-tab.js` (new), `settings/settings.{html,js,css}`, `sidepanel/sidepanel.{html,js}`, `newtab/newtab.{html,js}`, `popup/popup.{html,js}`, `popup/group-jump.{html,js}`, `docs/design/45-b-037-themes.md` (new), `tests/b037-themes.test.js` (new, 41 tests)
- **Key decisions**: D-1 14-slug catalog (incl. B-098 Tokyo Night); D-2 `shared/themes.css` canonical source; D-3 `shared/theme-init.js` FOUC-guard; D-5 `MSG_STATE_CHANGED` broadcast (no new message types); D-6 read-time migration (`'light'`/`'dark'` → new slugs); D-7 rollback via safe-mode fallback to `'system'`
- **UAT-6 fix**: group-jump popup missed in R3 theme sweep — same HIGH-1 pattern applied post-UAT; 30/30 PASS after fix

#### [B-094] Process Polish Bundle — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings — doc-only)
- **Files changed**: `CLAUDE.md` (C-1 stale-SW guidance + R1 selector-audit subsection)
- **Outcome**: Sprint 30 retro MEDIUM action items × 2 closed

#### [B-095] Toolbar Popup → Settings Link — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 HIGH, 2 MEDIUM inline)
- **Files changed**: `popup/popup.{html,js,css}`, `shared/settings-tab.js` (factor-out reused), `tests/b095-popup-settings-btn.test.js` (+7 tests)

### UAT Results
- **B-037**: 30/30 PASS (UAT-6 fix cycle required — group-jump popup theme miss; fixed pre-close)
- **B-094**: N/A (doc-only edit)
- **B-095**: smoke PASS (Settings button renders, opens/focuses Settings tab, Tab trap correct)

### Velocity
- Planned: 3 items / 1M + 2XS
- Completed: 3 items + B-098 slip-in / 1M + 3XS — 100%+ scope
- Carried over: 0

### R4 Findings Summary
- **B-037**: 0 CRITICAL / 4 HIGH (all fixed) / ~6 MEDIUM (most inline) / ~8 LOW (deferred)
- **B-094**: 0 findings
- **B-095**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (inline) / 0 LOW
- **Total**: 0 CRITICAL / 4 HIGH / ~8 MEDIUM / ~8 LOW
- **Full dedup**: `docs/findings/sprint-31.md`

### Retrospective

**What Went Well:**
- Full 7-round pipeline on B-037 delivered the theme system cleanly; `shared/themes.css` consolidation eliminated ~3,500 LOC duplication.
- UAT-6 caught the group-jump popup miss before release — validates the popup-surface audit precedent now documented in §45.10.
- B-095 reused the newly extracted `shared/settings-tab.js` from B-037 — same-sprint factor-out pays off immediately.

**What to Improve:**
- R3 missed the group-jump popup surface in the theme-wiring sweep; UAT-6 fix cycle added overhead. The popup-surface audit checklist (§45.10 precedent) addresses this going forward.
- B-098 Tokyo Night could have been filed during S31 R1 to appear in the initial catalog planning instead of as a mid-sprint approval.

**Action Items for Sprint 32:**
1. [frontend-engineer] B-096 — sync `validatePreferences` import-validator with 14-slug enum (S30 B-092 security MEDIUM). [HIGH]
2. [frontend-engineer] B-097 — Settings keyboard shortcut Alt+Comma (S30 LOW deferred). [HIGH]
3. [frontend-engineer] B-088 — hygiene bundle (carry-forward S25-S31 debt). [MEDIUM]

---

## Sprint 32 — Polish + Hygiene Cleanup (2026-04-25)

**Theme:** Close carry-forward debt queue accumulated S25-S31. Four Fast Track items: B-088 hygiene bundle (8 targeted fixes), B-096 import-validator sync (closes S30 B-092 security MEDIUM), B-097 Settings keyboard shortcut Alt+Comma, B-098 Tokyo Night theme (slip-in from S31, closed here). Zero new features; clean-up-only sprint.
**Release:** v1.26.0 (combined with Sprint 31; skips v1.25.0)
**Branch:** `feature/sprint-31-themes` (same branch; no new branch for S32)
**Tests:** ~1,360 → 1,401 (+41 S32 portion)

### Completed Items

#### [B-088] Hygiene Bundle — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ (8 targeted fixes) · R4 ✅ (0 HIGH)
- **8 fixes**: (1) cross-surface helper factor-out `shared/surface-prefs.js` + `shared/settings-tab.js`; (2) `newTabOverride` ghost-key removed from `DEFAULT_PREFERENCES` + validators; (3) `DRAG_DEBUG` + debug logging removed; (4) dead `_tabById` helper removed; (5) `_pickerRowFromGroup` O(n²) → O(n+m) perf fix; (6) banner text-node 3-path → single `textContent`; (7) nested-catch simplification; (8) JSDoc/comment drift pass
- **Files changed**: `background/service-worker.js`, `background/storage/preferences.js`, `background/tabs/tab-claims.js`, `shared/surface-prefs.js`, `shared/settings-tab.js`, `sidepanel/sidepanel.js`, `tests/b088-hygiene.test.js` (+4 perf regression tests)

#### [B-096] Import Validator Sync — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 HIGH)
- **Files changed**: `background/import/json-validator.js` (theme enum extended to 14 slugs), `tests/b096-import-validator.test.js` (+10 tests)
- **Outcome**: Closes S30 B-092 security MEDIUM — JSON import was silently rejecting valid B-037 theme slugs

#### [B-097] Settings Keyboard Shortcut Alt+Comma — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 HIGH)
- **Files changed**: `manifest.json` (`open-junkie-settings` command with `Alt+Comma` default), `background/service-worker.js` (`chrome.commands.onCommand` handler), `shared/settings-tab.js` (reused), `docs/user-manual/keyboard-shortcuts.md` (verified present), `tests/b097-settings-shortcut.test.js` (+18 tests)

#### [B-098] Tokyo Night Theme — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25 · *Slip-in approved mid-S31*
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings — additive palette)
- **Files changed**: `shared/themes.css` (+`[data-theme="tokyo-night"]` palette block), `shared/theme-slugs.js` (+slug), `settings/settings.js` (+option)

### UAT Results
- **B-088**: smoke PASS (ghost-key removed, debug logging absent, perf regression tests green)
- **B-096**: automated tests PASS (+10); JSON import accepts all 14 theme slugs
- **B-097**: smoke PASS (Alt+Comma opens/focuses Settings tab; `commands` entry confirmed in Edge)
- **B-098**: visual PASS (Tokyo Night theme renders correctly in sidepanel, newtab, popup, settings)

### Velocity
- Planned: 3 items / 1S + 2XS
- Completed: 4 items / 1S + 3XS — B-098 slip-in absorbed without scope impact
- Test growth: +41 (net S32 portion); combined S31+S32: 1,295 → 1,401 (+106)
- Fix cycles: 0 (no UAT failures in S32)
- Carried over: 0

### R4 Findings Summary
- **B-088**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **B-096**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **B-097**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **B-098**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **Total S32**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW — clean sprint
- **Full dedup**: `docs/findings/sprint-32.md`

### Retrospective

**What Went Well:**
- All 4 Fast Track items shipped with zero R4 findings — validates the hygiene-bundle pattern for clearing carry-forward debt efficiently.
- B-096 closed the S30 B-092 security MEDIUM at exactly the right moment (before v1.26.0 shipped with new theme slugs).
- B-088 hygiene bundle cleared the longest-standing items from the S25-S31 deferred debt queue; codebase exits S32 with no known carry-forward debt.

**What to Improve:**
- B-098 was a mid-sprint approval that slightly disrupted S31 R1 planning cadence; better to file slip-in candidates at sprint kickoff.
- S32 had no formal R5 test round (all Fast Track) — the combined suite PASS is sufficient, but a brief joint UAT sweep of the S31+S32 theme system would have been procedurally cleaner.

**Action Items for Next Sprint:**
1. [scrum-master] Evaluate v2 → main merge readiness. S32 closes the last carry-forward debt queue; feature set is complete. Schedule merge-prep sprint or direct merge if UAT sweep passes. [HIGH]
2. [technical-writer] Full user-manual coverage audit now that v2 feature set is complete. [MEDIUM]
3. [scrum-master] File B-086 (UI/UX design pass, P3/M) as a post-merge candidate if v2 ships to main. [LOW]

---

## Sprint 33 — Drift Fix (Option B + Snap to this tab) (2026-04-25)

**Theme:** Single-item bug-fix-plus-UX-polish sprint. Closes a behavior defect latent since Sprint 1 (B-001d): when a saved bookmark's claimed tab navigated to a different URL, `reevaluateTab` released the claim BEFORE drift detection could run, severing the bookmark↔tab association and orphaning the tab into Open Tabs. Fix: Option B (never release claim on URL change) + paired UX action "Snap to this tab" (one-click reconcile from drift state, with Undo).
**Release:** v1.27.0 (release/v2 only — no main merge per product-owner direction)
**Branch:** `feature/sprint-33-drift-fix`
**Tests:** 1,401 → 1,412 (+11 net via T1-T11 in `tests/b099-drift-fix.test.js`)

### Completed Items

#### [B-099] Drift Fix (Option B) + "Snap to this tab" Reconcile Action — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R2 ✅ (§46 design chapter — D-1..D-10 + C-1..C-12) · R3 ✅ · R4 ✅ (3 reviewers parallel — 0 CRITICAL / 0 HIGH / 4 MEDIUM all fixed / 2 LOW inline) · R5 ✅ (11 automated tests + 14 UAT cases) · R6 ✅ (§46.10 As Built filled) · R7 ✅ (CHANGELOG + user manual)
- **Files changed**:
  - `background/tabs/tab-claims.js` — `reevaluateTab` URL-mismatch release branch removed (D-1)
  - `background/messages/storage-handlers.js` — `MSG_UPDATE_ITEM` extended with inline `clearDrift` on URL change (D-2)
  - `sidepanel/sidepanel.{html,js,css}` — `_createDriftedIcon` 16 px + hostname tooltip; `openContextMenu` "Snap to this tab" entry (gated on drift); `showToast` extended with `{ undoLabel, onUndo, durationMs }`; `_ensureIndicators` true→true tooltip refresh; `#toast-undo` button slot; `.toast-undo` styling
  - `newtab/newtab.js` — `_buildIndicators` drift dot hostname tooltip
  - `tests/b099-drift-fix.test.js` (new, 11 tests T1-T11)
  - `tests/tab-url-change.test.js` + `tests/tab-events-no-storage-write.test.js` (re-pinned to assert Option B contract; pre-existing tests had codified the buggy behavior)
  - `docs/design/46-b-099-drift-fix.md` (new R2 chapter + R6 As Built)
  - `docs/UAT_B-099.md` (new, 14 UAT cases)
  - `docs/SOLUTION_DESIGN.md` (TOC entry for §46)
  - `CHANGELOG.md` (`[1.27.0]` entry)
  - `docs/user-manual/managing-items.md` + `docs/user-manual/new-tab-page.md` (drift + Snap action documented)
  - `manifest.json` (1.26.0 → 1.27.0)
- **Key decisions**: D-1 Option B claim-preservation; D-2 inline `clearDrift` in SW handler (atomic with storage write); D-3 re-claim contention (original wins); D-4 indicators additive, drift last; D-5 context menu host; D-6 inline toast + Undo (6 s default); D-7 `--drifted-color` token correction (R1 said `--color-warning`; that token does not exist); D-8 `buildOpenTabs` filter unchanged (regression guard via UAT-4); D-9 menu insertion between Edit and Move-to-group + H-1 click-time re-read pattern; D-10 closure-captured Undo lifecycle
- **R4 fixes applied**: M-1 `_ensureIndicators` tooltip refresh on true→true drift change; M-2 optimistic-toast pattern (toast painted before SW round-trip resolves); M-3 toast copy reconciliation ("Bookmark snapped to current tab"); M-4 error toast on missing originalUrl
- **UAT outcome**: 14/14 PASS (UAT-9, UAT-10, UAT-13, UAT-14 went through one fix-cycle iteration; UAT-9/10 traced to stale SW; UAT-13 demote-when-live precondition clarified; UAT-14 confirmed window-filter behavior, NOT regression)
- **Follow-ups filed from UAT**: B-100 (delete-on-live UX, P3/M), B-101 (subtle drift indicator, P3/S), B-102 (cross-window demote bug, P2/M), B-103 (promote duplicate bug, P2/S)

### UAT Results
- **B-099**: 14/14 PASS (4 cases through one fix-cycle iteration)

### Velocity
- Planned: 1 item / 1 M (Full pipeline)
- Completed: 1 item / 1 M + 4 follow-up backlog items filed from UAT
- Test growth: +11 (T1-T11)
- Fix cycles: 1 partial (4 UAT cases iterated once)
- Carried over: 0

### R4 Findings Summary
- **B-099**: 0 CRITICAL / 0 HIGH / 4 MEDIUM (all fixed pre-R5) / 2 LOW (inline)
- **Total S33**: 0 CRITICAL / 0 HIGH / 4 MEDIUM / 2 LOW
- **Full dedup**: `docs/findings/sprint-33.md` (if filed; otherwise inline R4 summary in PR body)

### Retrospective

**What Went Well:**
- Single-item Full-tier sprint shipped clean in one calendar day — proven pattern for high-confidence bug fixes.
- Latent S1 bug closed with high-quality regression coverage (11 new tests + 14 UAT cases).
- R4 fix bundle landed cleanly via the optimistic-toast pattern (M-2). Worth documenting for future Snap-style actions.
- Follow-up backlog discipline: 4 new items filed from UAT instead of in-sprint scope creep.

**What to Improve:**
- R5 surfaced two pre-existing test files asserting the buggy behavior. R2 should explicitly enumerate "tests that codify the bug under fix" so they can be pre-flagged for re-pin in R3.
- R1 specified `--color-warning` — token does not exist. R1 AC blocks referencing CSS tokens should grep-verify the token before locking.
- C-1 stale-SW prompt was technically N/A (zero new pref keys / manifest entries / schema) but the user still hit stale-SW symptoms at UAT-9/10. CHANGELOG entries that touch SW-side code (tab-claims, storage-handlers, drift, tab-events) should still suggest a sidepanel/newtab hard-reload tip.

**Action Items for Next Sprint:**
1. [scrum-master] Add R2 subsection: "Pre-existing tests that codify the bug under fix — flag for re-pin in R3." Apply to bug-fix Full-tier sprints. [HIGH]
2. [scrum-master] R1 AC blocks referencing CSS custom properties (`--*` tokens) MUST include a "Token verified" checkbox listing file/line where the token is defined. R2 confirms. [MEDIUM]
3. [technical-writer] CHANGELOG entries that touch SW-side code (tab-claims, storage-handlers, drift, tab-events) should include a "tip: hard-reload the side panel + any open new-tab tabs after updating" line under Note. Apply to v1.28.0+. [LOW]
4. [scrum-master] Triage B-100 / B-101 / B-102 / B-103 at next sprint kickoff. B-102 (cross-window demote stale claim) is the highest-priority of the four (P2/M). [HIGH]

---

## Sprint 34 — Visual polish: group color cohesion + dotted drift bar (2026-04-26)

**Theme:** Two-item visual-polish sprint. B-104 ships colored group headers with a 9-slot semantic palette resolved per-theme (so "red" looks Dracula-red in Dracula, GitHub-red in GitHub Light) across all 14 themes. B-101 replaces the B-099 16 px warning-triangle drift indicator with a 3 px dotted vertical bar in the row's left-edge gutter, stacked parallel to the active row's solid green border. Both items zero schema, zero new permissions, zero new message types.
**Release:** v1.28.0 (release/v2 only — no main merge)
**Branch:** `feature/sprint-34-visual-polish`
**Tests:** 1,412 → 1,426 (+14 net via T1-T6 in `tests/b101-drift-bar.test.js` + T1-T9 in `tests/b104-group-colors.test.js`)

### Completed Items

#### [B-101] Dotted drift bar in row left-edge gutter — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ (locked pre-sprint brainstorm) · R2 ✅ (§48 design chapter D-1..D-5 + C-1..C-12) · R3 ✅ · R4 ✅ (3 reviewers parallel — 0 CRITICAL / 1 HIGH (test stub) / 2 MEDIUM / 7 LOW) · R5 ✅ (6 tests + 6 UAT cases + R4 HIGH stub fix in b011-drift.test.js + b054/b048 hygiene) · R6 ✅ (§48.10 As Built + D-3a live+drifted permutation extension) · R7 ✅ (inline CHANGELOG)
- **Files changed**:
  - `sidepanel/sidepanel.{js,css}` — `_createDriftedIcon` deleted; `_driftTooltipFor` helper; `<span class="item-drift-bar">` injection in `buildItemRow`; `_ensureIndicators` extended; `.item-row { position: relative }` + `.item-drift-bar` rule + `.item-drifted-icon` rules deleted
  - `tests/b101-drift-bar.test.js` (new, 6 tests)
  - `tests/b011-drift.test.js` + `tests/b054-sidepanel.test.js` + `tests/b048-visual-states.test.js` (re-pinned/hygiene)
  - `docs/design/48-b-101-drift-bar.md` (new R2 chapter + R6 As Built)
  - `docs/UAT_B-101.md` (new, 6 UAT cases)
- **Key decisions**: D-1 sibling `<span>` (pseudo-elements can't carry `title`) · D-2 `position: relative` (technically redundant with `contain: layout style` but kept for explicitness) · D-3 active+drifted side-by-side at `left: 3px` (= 6 px total gutter) · D-3a (R6) live+drifted same geometry · D-4 row-level aria-label keeps "drifted"; bar `aria-hidden="true"` · D-5 bar gates only on `_cachedDriftRecords` per §10.7 invariant

#### [B-104] Themed group color system (colored headers + theme-aware palette tokens) — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ ([product-manager] locked Q1-Q6 + 9 ACs) · R2 ✅ ([solution-architect] §47 design chapter D-1..D-5 + C-1..C-12 + 36-value flagship hex table) · R3 ✅ (153 `--gc-*` tokens shipped) · R4 ✅ (3 reviewers parallel — 0 CRITICAL / 3 HIGH (qa-reviewer WCAG/Ungrouped/hover) / 4 MEDIUM / 8 LOW) · R3-fix ✅ (3 HIGHs fixed pre-R5 — `--group-header-tint-amount` per-theme override variable introduced; solarized-light → 0%; synthetic ungrouped color → null; hover automatically resolved) · R5 ✅ (9 tests + 7 UAT cases) · R6 ✅ (§47.10 As Built + M-2 atom-one-dark hand-curation + M-3 D-5 contrast number correction) · R7 ✅ (inline CHANGELOG)
- **Files changed**:
  - `shared/themes.css` — 153 `--gc-*` declarations across 17 blocks (5 hand-curated [one-dark, atom-one-dark, dracula, github-light, system] + 9 algorithmic via sRGB `mix(canonical, --bg-secondary, 0.30)` + 2 legacy aliases); `--group-header-tint-amount: 0%` override on `[data-theme="solarized-light"]`
  - `sidepanel/sidepanel.{js,css}` — `.group-color-<slot>` swatches → `var(--gc-<slot>)`; `.group-header` + `:hover` `color-mix` tint via `var(--group-header-tint-amount, 12%)`; group-header inline-style injection of `--group-header-color` (gated by `GROUP_COLORS.includes`); synthetic `__ungrouped__` group color → `null` (R3-fix H-2)
  - `newtab/newtab.{js,css}` — analogous treatment (incl. R3-fix M-5 newtab hover parity)
  - `popup/group-jump-popup.{js,css}` — D-2 Option C declarative `[data-color="<slot>"]` selectors; `chip.dataset.color = pickerRow.color` (closes latent slate/teal/indigo bug)
  - `tests/b104-group-colors.test.js` (new, 9 tests)
  - `docs/design/47-b-104-themed-group-colors.md` (new R2 chapter + R6 As Built)
  - `docs/UAT_B-104.md` (new, 7 UAT cases)
  - `docs/SOLUTION_DESIGN.md` (TOC entry for §47)
  - `manifest.json` (1.27.0 → 1.28.0)
- **Key decisions**: D-1 hybrid 5 hand-curated + 9 algorithmic (R6 promoted atom-one-dark from algorithmic) · D-2 group-jump popup Option C declarative `[data-color]` selectors · D-3 tokens defined per `[data-theme]` block (not `:root`) · D-4 `color-mix` Chromium 111+ (Edge stable 130+ baseline well above floor) · D-5 single 12% recipe with `--group-header-tint-amount` per-theme escape hatch
- **R3-fix applied (3 HIGHs)**: H-1 solarized-light WCAG AA — `--group-header-tint-amount: 0%` (math: every non-zero tint fails AA on solarized-light's 4.392:1 sub-AA baseline; B-105 tracks theme defect). H-2 Ungrouped slate-tint leak — synthetic `__ungrouped__` group color set to `null`; existing `GROUP_COLORS.includes(group.color)` guard correctly prevents injection. H-3 hover compound — same per-theme variable resolves both rules.

### UAT Results
- **B-101**: 6 cases authored. Pending human walk-through.
- **B-104**: 7 cases authored. Pending human walk-through.

### Velocity
- Planned: 2 items / 1 M (B-104) + 1 S (B-101)
- Completed: 2 items / 1 M + 1 S + 1 follow-up filed (B-105)
- Test growth: +14 (T1-T6 B-101 + T1-T9 B-104)
- Fix cycles: 1 R3-fix on B-104 (3 HIGH WCAG findings caught by qa-reviewer pre-R5)
- Carried over: 0

### R4 Findings Summary
- **B-101**: 0 CRITICAL / 1 HIGH (test stub, R5 fixed) / 2 MEDIUM / 7 LOW
- **B-104**: 0 CRITICAL / 3 HIGH (R3-fix all) / 4 MEDIUM (M-1 doc + M-2 + M-3 + M-5 all addressed) / 8 LOW
- **Total S34**: 0 CRITICAL / 4 HIGH (all closed) / 6 MEDIUM / 15 LOW
- **Full dedup**: `docs/findings/sprint-34.md`

### Retrospective

**What Went Well:**
- Parallel-pipeline pattern paid off: B-101 and B-104 ran R3 + R4 + R5 in interleaved parallel. Two items shipped in one calendar day.
- R4 qa-reviewer caught B-104 WCAG AA failures via contrast math computation pre-R5 — would have shipped silently if discovered only at human UAT.
- R2 design chapter quality stayed high under parallelism (§47 + §48 both carry full D-decisions + C-1..C-12 + Performance + Accessibility + Rollback).
- Follow-up backlog discipline: B-105 filed as the precise pre-existing defect surfaced by B-104 (no scope creep).

**What to Improve:**
- R2 contrast-math validation gap: §47.3 D-5 mental walkthrough was off by ~3:1 ratio. R2 should compute, not approximate.
- R3 deviation handling: B-104 R3 added a hover-tint deviation without inline comment.
- Pre-existing defect surfacing creates surprise: solarized-light's sub-AA baseline was latent v1.0 defect. R2 should pre-flight WCAG AA on all themes for tinted-surface items.

**Action Items for Next Sprint:**
1. [scrum-master] CLAUDE.md R2: add "When citing numeric WCAG contrast values, R2 MUST compute the value via the linear-luminance formula — not approximate." [HIGH]
2. [scrum-master] CLAUDE.md R3: add "Any R3 implementation deviation from the R2 spec MUST land with an inline comment marking it as intentional + R6 As-Built mention BEFORE R4 starts." [MEDIUM]
3. [scrum-master] Triage B-105 at next sprint kickoff. Underlying theme defect; pair with another small item. [HIGH]
4. [scrum-master] Triage B-100 / B-102 / B-103 (S33 follow-ups) at S35. [HIGH]

---

## Sprint 35 — Bug-fix queue + tint-brightness polish (2026-04-26)

**Theme:** Five-item bug-fix-and-polish sprint clearing the entire P2 carryover queue (B-100, B-102, B-103, B-105) plus a P3 polish item (B-106 group-header brightness 12% → 18%). Two HIGH fix-cycles applied (B-100 3 HIGHs; B-102/B-103 shared 1 HIGH + 1 MEDIUM via single ordering change). Two follow-up backlog items filed from R4 surfacing (B-107 aria-label, B-108 secondary-text AA).
**Release:** v1.29.0 (release/v2 only — no main merge)
**Branch:** `feature/sprint-35-bug-fixes`
**Tests:** 1,427 → 1,464 (+37 net via 4 R5 rounds — T1-T10 B-100, T1-T8 B-102, T1-T6 B-103, T1-T7 B-105 + T10 B-106)

### Completed Items

#### [B-100] Delete-on-live UX redesign — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ · R2 ✅ (§49) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / **3 HIGH** / 5 MEDIUM / 5 LOW) · R3-fix ✅ (3 HIGHs + M-1 inline) · R5 ✅ (16 tests + 7 UAT) · R6 ✅ (§49.10 + B-107 follow-up) · R7 ✅
- **Files changed**: `sidepanel/sidepanel.{js,css}` (Delete handler + `_dispatchRowDelete` helper + Undo ERR_NOT_FOUND fallback + keydown delegation; destructive class consumes per-theme tokens), `shared/themes.css` (+`--color-destructive`/`--bg-destructive-hover` × 14 themes; nord uses brighter `#fca5a5`), `tests/b100-delete-on-live.test.js` (16 tests), `docs/UAT_B-100.md` (7 cases), `docs/design/49-b-100-delete-on-live.md`
- **Key decisions**: D-1 keep both delete paths · D-2 `MSG_CREATE_ITEM` payload `{title,url,groupId}` only · D-3 inherit B-099 6s toast · D-5 keydown delegation w/ input-context guard
- **R3-fix applied**: H-1 DRY `_dispatchRowDelete` helper; H-2 Undo deleted-group ERR_NOT_FOUND fallback to Ungrouped + recovery toast; H-3 `--color-destructive` per-theme token (AA verified 5.13–6.88:1 across 4+ themes)
- **Follow-up**: **B-107** (P3/XS) — live-X aria-label reactive flip

#### [B-102] Cross-window demote broadcast bug — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ · R2 ✅ (§50 SHARED with B-103) · R3 ✅ (shared 2-line fix) · R4 ✅ (3 reviewers dual-lens — 0 CRITICAL / 1 HIGH / 2 MEDIUM / 3 LOW) · R3-fix ✅ (single ordering change closes H-1 + M-1) · R5 ✅ (8 tests + 5 UAT cases — 4 multi-window manual) · R6 ✅ (§50.10) · R7 ✅
- **Files changed**: `sidepanel/sidepanel.js` (`'noop'` + `'patch'` branches gain `patchOpenTabsSection(_cachedOpenTabs)`; R3-fix moved `'patch'` placement INSIDE `if (allApplied)` AFTER `_itemById` rebuild), `tests/b102-cross-window-demote.test.js` (8 tests; T5 SKIPPED via sentinel → UAT-1), `docs/UAT_B-102.md`, `docs/design/50-b-102-103-open-tabs-patch.md`
- **NEW R6 precedent**: chrome-mock single-listener-array constraint formalized; SKIP-with-sentinel + mandatory-UAT pattern for multi-context broadcast tests

#### [B-103] Promote-tab duplicate bug — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-26 · **R3 was 0 LOC source change** (inherited from B-102 R3 — shared root cause discovered at R1)
- **Pipeline**: R1 ✅ · R2 ✅ (§51 thin pointer to §50) · R3 ✅ (inherited) · R4 ✅ (inherited dual-lens) · R5 ✅ (6 tests + 4 UAT) · R6 ✅ (§51.10) · R7 ✅
- **Files changed**: `tests/b103-promote-duplicate.test.js` (6 tests including T2 read-only AST atomicity check + T5 dual-angle ordering regression), `docs/UAT_B-103.md`, `docs/design/51-b-103-promote-duplicate.md`
- **D-2 verified**: SW handler atomicity already correct; no SW changes needed

#### [B-105] Solarized-light WCAG AA baseline contrast fix — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ (Q4 deviation — 3% ceiling not 0% removal) · R2 ✅ (§52) · R3 ✅ · R4 ✅ (0 CRITICAL / 0 HIGH / 1 MEDIUM / 3 LOW) · R5 ✅ (7 tests + 5 UAT) · R6 ✅ (§52.7 + §45.7 + §47.7 row 19 corrected; B-108 filed) · R7 ✅
- **Files changed**: `shared/themes.css` (`--text-primary` `#586e75` → `#546a71`; `--group-header-tint-amount` `0%` → `3%`), `tests/b104-group-colors.test.js` (T7 updated), `tests/b105-solarized-light-contrast.test.js` (7 tests with computed WCAG AA), `docs/UAT_B-105.md`, `docs/design/52-b-105-solarized-light-fix.md`, `docs/design/45-b-037-themes.md` (§45.7 in-place correction), `docs/design/47-b-104-themed-group-colors.md` (§47.7 row 19 PASS)
- **NEW R5 precedent**: algorithm-divergent contrast assertions pin directional/monotonic invariants over exact crossover %
- **Follow-up**: **B-108** (P3/S) — solarized-light `--text-secondary` AA (group counts at 3.636:1)

#### [B-106] Group header tint brightness bump — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ (Q1 = 18%) · R3 ✅ · R4 ✅ (Fast Track code + security; 0 CRITICAL / 0 HIGH / 1 MEDIUM / 0 LOW)
- **Files changed**: `shared/themes.css` `:root` (12% → 18%), `tests/b104-group-colors.test.js` (+T10), `docs/design/47-b-104-themed-group-colors.md` (§47.7 column header + matrix annotation; corrected per B-106 R4 M-1 to read "18% color-mix approx")
- **Wave 1 dependency**: depended on B-105 R3 (verified before launch)

### UAT Results
- All authored: B-100 (7), B-102 (5 — 4 multi-window manual), B-103 (4), B-105 (5). Pending human walk-through.

### Velocity
- Planned: 5 items / 2M + 2S + 1XS
- Completed: 5 items / 2M + 2S + 1XS + 2 follow-ups filed
- Test growth: +37 net (+2.6%)
- Fix cycles: 2 R3-fix rounds (B-100 3 HIGHs; B-102/103 single ordering change)

### R4 Findings Summary
- **B-100**: 0 CRITICAL / 3 HIGH (all R3-fix) / 5 MEDIUM (M-1 R3-fix inline; M-2/M-3 R5 coverage; M-4 B-107; M-5 R6 doc) / 5 LOW
- **B-102 + B-103 (dual-lens)**: 0 CRITICAL / 1 HIGH (R3-fix) / 2 MEDIUM (M-1 R3-fix combined; M-2 LOW deferred) / 3 LOW
- **B-105**: 0 CRITICAL / 0 HIGH / 1 MEDIUM (B-108) / 3 LOW
- **B-106 (Fast Track)**: 0 CRITICAL / 0 HIGH / 1 MEDIUM (R3 inline §47.7 column header fix) / 0 LOW
- **Total S35**: 0 CRITICAL / 4 HIGH (all closed) / 9 MEDIUM / 11 LOW
- **Full dedup**: `docs/findings/sprint-35.md`

### Retrospective

**What Went Well:**
- 5 items shipped in one calendar day via aggressive parallelism: 4 R1 simultaneously, 4 R2 simultaneously, Wave A 3 R3 + Wave B 1 R3, 11 R4 reviewers in mega-batch, 4 R5 simultaneously, 4 R6 simultaneously. Zero merge conflicts.
- Shared root-cause discovery (B-102+B-103) at R1 enabled coordinated R2 (one shared §50 chapter + one thin pointer §51) → B-103 R3 = 0 LOC. Pattern: bug-fix sprints should explicitly probe for shared root causes during R1.
- R4 contrast-math discipline (B-100): qa-reviewer caught dark-theme destructive red AA failure pre-R5 — would have shipped silently otherwise. Validates the S34 retrospective action item.
- R3-fix bundled HIGH + MEDIUM: B-102/103 single ordering change closed both H-1 (code) AND M-1 (qa).
- NEW precedents: chrome-mock multi-context constraint (B-102 R6); algorithm-divergent contrast assertions monotonic-decrease guard (B-105 R5).

**What to Improve:**
- R1 inter-item coordination is ad-hoc: B-103 R1 found B-102's root cause by accident — should be deliberate.
- chrome-mock multi-context simulation gap: B-102 SKIP-with-sentinel works but multi-window UAT remains manual.
- R5 test-count overrun (B-100 +167%, B-105 +75%): not a problem; documenting trend.

**Action Items for Next Sprint:**
1. [scrum-master] CLAUDE.md R1: "When a sprint contains multiple bug-fix items, R1 [product-manager] MUST check whether items share a root cause by reading each other's repro cases. Document overlap in R1 handoff notes." [HIGH]
2. [scrum-master] Triage B-107 + B-108 at next sprint kickoff. [MEDIUM]
3. [scrum-master] Consider filing chrome-mock multi-context enhancement (P3/M) to close the manual UAT gap. [LOW]

---

## Sprint 36 — UI/UX polish bundle (2026-04-28)

**Theme:** Nine-item UI/UX polish-and-bugfix sprint. 1 P2/M drift bug + 4 S items (1 WCAG fix + 1 delete-icon swap + 1 drag-handle/multi-select + 1 carryover) + 4 XS polish. Three R2 binding-correction precedents established (B-108 D-2, B-111 D-4, B-113 D-5). One pre-existing AA defect surfaced (atom-one-dark+yellow ~2.81:1 against `--text-primary` on the 20%-tinted bg) — filed as B-117 follow-up.
**Release:** v1.30.0 (release/v2 only — no main merge)
**Branch:** `feature/sprint-36-ui-polish`
**Tests:** 1,464 → 1,504 (+40 across 9 items via 7 R5 rounds — T1-T4 B-107, T1-T5 B-108, T1-T8 B-110, T1-T3 B-112, T1-T3 B-114, T1-T2 B-115, T1-T4 B-109, T1-T4 B-111, T1-T7 B-113)

### Completed Items

#### [B-110] Drift indicator on non-live bookmark (anchor) — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R2 ✅ (§53) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / 0 HIGH / 3 MEDIUM / 6 LOW) · R6-fix (3 MEDIUM addressed in close — b101 stub re-pinning, T8 aria-label asymmetry pin, §53.5 C-9 doc accuracy) · R5 ✅ (8 tests + 5 UAT) · R6 ✅ (§53.11) · R7 ✅
- **Files changed**: `sidepanel/sidepanel.js` (conjunctive `isDrifted && live?.live` gate at first-paint + `_ensureIndicators`), `background/tabs/tab-claims.js` (new `evictedItemIds` tracker + `Promise.allSettled` clearDrift batch + cyclic import of `clearDrift` from `./drift.js`), `background/messages/storage-handlers.js:393` (`clearDrift` after `releaseClaimByTab` in AC3 stale-claim repair), `tests/b110-drift-non-live-fix.test.js` (8 tests T1-T8), `tests/b101-drift-bar.test.js` (post-B-110 stub re-pinning), `docs/UAT_B-110.md` (5 UAT cases), `docs/design/53-b-110-drift-non-live-fix.md`
- **Two-layer fix shipped**: defense-in-depth render gate + source patches at TWO leak paths (`reconcileClaims` cold-start eviction PRIMARY + `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair SECONDARY)
- **NEW R6 precedents**: (1) two-layer-fix pattern for §10.7-style invariant violations; (2) static-source patch-site guards with coarse fallback (R4 L-5); (3) R6 stub-update obligation for inline test reproductions; (4) aria-label asymmetry pin pattern (T8)

#### [B-108] Solarized-light `--text-secondary` WCAG AA fix — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-27
- **Pipeline**: R1 ✅ · R2 ✅ (§54) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / 0 HIGH / 3 MEDIUM / 5 LOW) · R5 ✅ (5 tests + 5 UAT) · R6 ✅ (§54.10) · R7 ✅
- **Files changed**: `shared/themes.css` (BOTH `--text-secondary` AND `--group-count-text` `#657b83` → `#546a72` per §54.3 D-2 binding correction), `tests/b108-solarized-secondary-contrast.test.js` (5 tests T1-T5 with computed WCAG AA + 9-slot tint matrix), `docs/design/54-b-108-solarized-light-secondary-fix.md`
- **D-2 R2 binding correction**: R1 LOCKED Q3 incorrectly claimed `--group-count-text` is `var(--text-secondary)` aliased — verified false (literal hex duplicate). R3 must edit BOTH lines.
- **Verified contrast**: `#546a72` vs `--bg-secondary #eee8d5` = 4.6553:1 (AA pass +0.155 above floor)
- **NEW R6 precedent**: R2 binding-correction pattern (#1 of 3 this sprint)

#### [B-111] Dynamic delete-icon swap (X for live, trash for non-live) — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R2 ✅ (§55) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / 0 HIGH / 0 MEDIUM / 6 LOW) · R6-fix (3 LOWs addressed — T1 regex tightened, symmetric trash-default rule added, UAT-5 promoted to mandatory) · R5 ✅ (4 tests + 5 UAT) · R6 ✅ (§55.12) · R7 ✅
- **Files changed**: `sidepanel/sidepanel.js` (replaced single trash `<svg>` in `.item-action-delete` with two SVGs — X icon `.icon-action-close` + trash icon `.icon-action-trash`; both `aria-hidden="true"`), `sidepanel/sidepanel.css` (4 new rules near `.item-action-delete:hover` — symmetric defaults + live-state visibility toggles), `tests/b111-dynamic-delete-icon.test.js` (4 tests T1-T4), `docs/design/55-b-111-dynamic-delete-icon.md`
- **D-4 R2 binding correction**: R1 Q5 incorrectly claimed `buildOpenTabRow` has an `.item-action-delete` button — verified false. R3 strictly limited footprint to `buildItemRow`.
- **Pure CSS swap**: `.item-row[data-live="true"] .item-action-delete .icon-action-close { display: inline-block; }` — zero JS in the visibility flip hot path
- **NEW R6 precedent**: R2 binding-correction pattern (#2 of 3 this sprint)

#### [B-113] Item-row drag handle on hover + checkbox in multi-select — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R2 ✅ (§56) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / 0 HIGH / 1 MEDIUM / 8 LOW) · R6-fix (M-1 layout bug fixed — flex-overlap replacement of `position: absolute`) · R5 ✅ (7 tests + 7 UAT) · R6 ✅ (§56.12) · R7 ✅
- **Files changed**: `sidepanel/sidepanel.js` (new `<span class="item-drag-handle">` with 6-circle SVG matching `.group-drag-handle` pattern, appended in `buildItemRow` after `.item-select`), `sidepanel/sidepanel.css` (split existing `.item-row:hover .item-select` rule clauses; new `.item-drag-handle` block with flex-overlap positioning + `prefers-reduced-motion` gate; Gmail-pattern persistent reveal), `tests/b048-visual-states.test.js` (header comment + AC6 assertion update for the b048 §31.5 AC6 contract change), `tests/b113-drag-handle-multi-select.test.js` (7 tests T1-T7), `docs/design/56-b-113-drag-handle-multi-select.md`
- **D-5 R2 binding correction**: open-tab rows are NOT draggable — handle omitted from `buildOpenTabRow` for honest UX. T2 is the static-source guard.
- **D-3 b048 §31.5 AC6 contract change**: existing rule split intentionally — `:focus-visible` + `[data-selected="true"]` clauses preserved together; `:hover` scoped under `#item-list.has-bulk-bar`. R3 expanded scope vs. R2 fix-scope (which only listed b048 header comment) to also update the b048 AC6 assertion test.
- **R6 layout iteration (R4 [qa] M-1)**: original `position: absolute; left: 12px` misaligned by 3 px on `data-live="true"` rows because absolute positioning anchors to the row's padding-edge. Replaced with `flex: 0 0 18px; margin-left: -18px;` — invariant across all row states.
- **NEW R6 precedents**: (1) R2 binding-correction pattern (#3 of 3 this sprint); (2) R3 must check pre-existing test assertions when R2 declares a contract change; (3) flex-overlap pattern for sibling-affordance overlay

#### [B-107] Live-X aria-label reactive flip — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-27
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (code + security PASS, no findings any tier)
- **Files changed**: `sidepanel/sidepanel.js` (~+9 LOC in `refetchAndPatchLiveState` patch loop, line 3064-3074 — `aria-label` flips between "Close tab" and "Delete bookmark" per `data-live` state), `tests/b107-live-x-aria.test.js` (4 tests)
- **Resolves**: S35 B-100 R4 [qa-reviewer] M-4 (WCAG 2.1 SC 4.1.2 name-role-value mismatch)

#### [B-112] Remove "Tab Junkie" panel-header label — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-27
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (code + security PASS, no findings)
- **Files changed**: `sidepanel/sidepanel.html` (1 `<span>` removed), `sidepanel/sidepanel.css` (`.panel-header-title` rule removed), `tests/b112-header-label-removed.test.js` (3 tests)

#### [B-114] Brighter dark-theme group-header tint v2 — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-27
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (code + security PASS — `--collapse-icon` cleanup MEDIUM addressed inline)
- **Files changed**: `shared/themes.css` (`--group-header-tint-amount: 20%` added to 11 dark themes + system-OS-dark @media branch), `tests/b114-tint-v2.test.js` (3 tests)
- **Pre-existing AA defect surfaced post-W1-A**: §47.7 + B-114 inline comment claimed worst-case (atom-one-dark + yellow) at 4.55:1 at 20% tint. B-109 R3 verified actual ~2.81:1 — design-doc claims inaccurate. Tracked as **B-117** follow-up.

#### [B-115] Group-header chevron uses themed group color — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-27
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (code PASS-with-fixes — orphaned `--collapse-icon` token finding + security PASS)
- **Files changed**: `sidepanel/sidepanel.css` (`.group-header-collapse` color → `var(--group-header-color, var(--text-primary))`), `tests/b115-chevron-color.test.js` (2 tests). **Wave 0 cleanup (W0-A.1)**: `--collapse-icon` token removed from all 17 sites in `shared/themes.css` (`:root` + system @media + 14 themes); `tests/b037-themes.test.js` token-list assertion updated.

#### [B-109] Group-header text colored to match group color — ✅ DONE
- **Tier**: Fast Track (XS — but R3 expanded scope) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R3 ✅ (Q5 escape hatch invoked) · R4 ✅ (code PASS-with-fixes — drift guard added; security PASS)
- **Files changed**: `shared/themes.css` (new `--group-header-name-color` token at `:root` with 50% color-mix formula; per-theme override to `var(--text-primary)` in 10 failing-AA theme blocks: system, tomorrow, atom-one-light, tomorrow-night, atom-one-dark, solarized-light, solarized-dark, dracula, nord, one-dark), `sidepanel/sidepanel.css` (`.group-header-name` consumes `var(--group-header-name-color)`), `tests/b109-group-name-tint.test.js` (4 tests T1-T4 incl. AA matrix verification + override-list drift guard)
- **R3 discovery**: 50% formula breaches WCAG AA on 10/14 themes (worst: solarized-dark+red = 2.534:1). Per R1 Q5 escape hatch, shipped per-theme overrides. Visual ships on 4 themes (github-light, github-dark, monokai, tokyo-night) + system-OS-dark.
- **Filed B-117 follow-up** for the §47.7 matrix re-verification (pre-existing AA defect surface).

### Sprint Retrospective

**Velocity:** Planned 9 / Completed 9. 1M + 4S + 4XS — fully on plan. Test delta +40 (1,464 → 1,504); zero regressions.

**What Went Well:**
- Chunked execution kept the session resilient — after the prior session froze during a 6-agent parallel launch in Wave 0, breaking work into ~10-minute checkpoints survived the full sprint without freezes.
- R2 binding-correction pattern proved value, third-time — three R1 LOCKED claims caught at R2 (B-108 D-2, B-111 D-4, B-113 D-5).
- CSS-cascade-driven affordance swaps shipped four times (B-110 conjunctive gate, B-111 X/trash swap, B-113 drag-handle/checkbox swap, B-115 chevron themed color) — zero new JS in any swap hot path.

**What to Improve:**
- R1 LOCKED is not always trustworthy on factual claims — three R1 → R2 corrections this sprint. Future R1 should restrict claims to user-facing AC and defer code-shape claims to R2 verification, or adopt a "must verify against source" discipline at lock time.
- R2 fix-scope tables can underspecify pre-existing test assertions that need updating (B-113 R3 had to expand scope to also update the b048 AC6 assertion). New precedent: when R2 declares a contract modification, R2 must grep for any test asserting the pre-change contract and enumerate them in the fix-scope table.
- The §47.7 spot-check matrix has inaccurate "PASS" verdicts. Filed B-117 with explicit goal: re-verify ALL 126 cells.

**Action Items for Next Sprint:**
1. [scrum-master] Add an R1 quality gate: when R1 makes ANY claim about source code structure (line numbers, function bodies, selectors, file existence), the [product-manager] must cite the verified source location OR mark the claim "R2-VERIFY". Prevents the R1-locked-but-factually-wrong pattern. [HIGH]
2. [solution-architect] Extend R2 §X.5 R3 fix-scope tables to include a "pre-existing test assertions to update" subsection when the chapter declares a contract change. [HIGH]
3. [scrum-master] Triage B-117 (§47.7 matrix re-verification) in the next planning round. Pre-existing AA defect surface needs a proper audit. [MEDIUM]

---

## Sprint 37 — Polish + process close-out (2026-04-28)

**Theme:** Three-item polish + process close-out sprint. 1 M WCAG AA group-color matrix re-verification (B-117) + 2 XS CLAUDE.md process gates (B-118 source-citation gate, B-119 fix-scope test-assertion enumeration). Zero regressions. B-120 filed mid-sprint as stale-prose follow-up. Sprint 36 retro HIGH action items #1 and #2 both closed.
**Release:** v1.31.0 (release/v2 only — no main merge)
**Branch:** `feature/sprint-36-ui-polish`
**Tests:** 1,504 → 1,641 (+137 net — 137 new in `tests/b117-gc-matrix-audit.test.js` + T1 redesign in `tests/b114-tint-v2.test.js`)

### Completed Items

#### [B-117] §47.7 group-color WCAG AA matrix re-verification — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R2 ✅ (§57) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / 0 HIGH / 1 MEDIUM / 4 LOW) · R5 ✅ (137 tests + UAT plan filed) · R6 ✅ (§47.7 updated + §57.12 As-Built) · R7 ✅ (user-manual + CHANGELOG)
- **Files changed**:
  - `shared/themes.css` — atom-one-dark + one-dark tint 20%→7%; dracula tint 20%→17%; comment-block corrections at B-114 inline + `:root` block
  - `tests/b117-gc-matrix-audit.test.js` (NEW) — 137 tests: 126 cells, 9 AAL tuples, 3 drift guards; 136 ms runtime
  - `tests/b114-tint-v2.test.js` — T1 redesigned table-driven (`expectedTintByTheme` map)
  - `docs/design/57-b-117-gc-matrix-audit.md` (NEW chapter; §57.12 As-Built appended at R6)
  - `docs/design/47-b-104-themed-group-colors.md` §47.7 — replaced with post-B-117 verified matrix
  - `docs/SOLUTION_DESIGN.md` — TOC entry for §57
  - `docs/user-manual/themes.md` — "Theme accessibility limitations" subsection (Solarized Dark 9-cell measurement table)
  - `CHANGELOG.md` — v1.31.0 entry (B-117 section)
  - `docs/UAT_B-117.md` (NEW) — 10 UAT cases for product-owner Edge run
- **Mid-flight scope adjustments**:
  - §57.9 sentinel-grep gate triggered at R3 entry → 2 stale-prose files deferred to **B-120** (filed); 2 non-factual hits resolved inline
  - `tests/b114-tint-v2.test.js` T1 brought in-scope per AC11(g) operational clarification ([scrum-master]) — active structural assertion of `--group-header-tint-amount`, not stale prose
- **R6 precedents established**: (1) AC11(g) "test-file lock" must distinguish stale prose vs active assertions of changed invariants; (2) B-119 contract-change definition must include CSS-token invariants asserted in test files (retro action item for S38)
- **UAT status**: UAT-1..UAT-10 pending product-owner Edge run (`docs/UAT_B-117.md`). Carried forward per S35/S36 pattern. Not blocking sprint close.

#### [B-118] R1 source-citation gate (CLAUDE.md edit) — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (bundled with B-119; 0/0/0/1 LOW cosmetic deferred)
- **Files changed**: `CLAUDE.md` — new "Source-citation gate" mandatory subsection in Round 1: Definition (lines 347–357)
- **Closes**: Sprint 36 Gate 7 retro action item #1 (R1 LOCKED source-shape claims must cite `file:line` or be marked `R2-VERIFY`)
- **Self-applied immediately**: B-117 R1, B-118 R1, B-119 R1 all cited `file:line` references. Zero R2 binding-correction surprises this sprint (vs. three in S36).

#### [B-119] R2 fix-scope test-assertion enumeration (CLAUDE.md edit) — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-28
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (bundled with B-118)
- **Files changed**: `CLAUDE.md` — new "Fix-scope test-assertion enumeration" mandatory subsection in Round 2: Architecture (lines 378–386)
- **Closes**: Sprint 36 Gate 7 retro action item #2 (R2 contract-change chapters must enumerate pre-existing test-file assertions against old value)
- **Load-bearing miss surfaced**: B-119 R2 contract-change definition was too narrow (DOM/ARIA/message/selector only) — missed `tests/b114-tint-v2.test.js` T1 structural assertion on `--group-header-tint-amount`. R3 hit a mid-build test failure. S38 retro action item #1 expands the definition to include CSS-token invariants.

### Sprint Retrospective

**Velocity:** Planned 3 / Completed 3. M + XS + XS — fully on plan. Test delta +137 (1,504 → 1,641); zero regressions. Items filed mid-sprint: 1 (B-120, stale-prose follow-up, P3/XS, deferred).

**What Went Well:**
- Pipeline parallelization scaled cleanly: 3 R1 agents in parallel · B-117 R2 in parallel with B-118+B-119 R3 bundle · 3 R4 reviewers in parallel · sprint completed in a single session.
- §57.9 sentinel-grep gate caught a real issue at R3 entry: 2 stale-prose comment files identified for follow-up (B-120 filed inline). Gate's STOP-and-escalate semantics worked as designed.
- Self-applied source-citation gate (B-118) was operationally usable from the moment it was R1-LOCKED: all three R1 runs cited `file:line`. Zero R2 binding-correction surprises vs. three in S36.
- B-117 R2 quantitative work (126-cell computation in Node) replaced opinion with evidence: pre-B-117 §47.7 PASS verdicts at 4.78:1 / 4.55:1 were inaccurate (atom-one-dark+yellow actually 2.806:1 at 20% tint). The new matrix test makes future drift impossible.

**What to Improve:**
- B-119 R2 contract-change definition was too narrow — missed the `tests/b114-tint-v2.test.js` T1 active structural assertion of `--group-header-tint-amount`. R3 hit a mid-build test failure that should have been caught at R2. The fix-scope-test-assertion subsection must be expanded for S38 to explicitly include CSS-token invariants.
- R1 AC11(g) "test-file lock" was too coarse: locking out "B-104, B-106, B-114 test files" prevented R3 from updating active assertions of B-117's changed invariant. Mid-R3 operational clarification required. Future R1 templates must distinguish stale prose (lock-out) vs active assertions of the changed invariant (always in-scope).
- §57.9 sentinel-grep gate was over-eager for prose-only matches: 4 hits, only 2 factually concerning. Future gates should triage active-assertion vs prose in-loop before escalating.

**Action Items for Next Sprint (S38):**
1. **[product-manager] / [solution-architect]**: Amend CLAUDE.md B-119 "Fix-scope test-assertion enumeration" subsection to explicitly include CSS-token invariants asserted in test files. File as P2/XS CLAUDE.md edit. [HIGH]
2. **[product-manager]**: Amend CLAUDE.md R1 AC template to distinguish "active assertions of changed invariant" (always in-scope) vs "stale prose comments" (out-of-scope, file as follow-up). File as P3/XS. [MEDIUM]
3. **[scrum-master]**: When R3 sentinel-grep gate triggers, agent should triage in-loop (active vs prose) before halting and escalating. Update agent-prompt templates. [LOW]

---

## Sprint 38 — Bug-fix anchor sprint (2026-04-29)

**Theme:** Four-item bug-fix sprint. 2 P0/P1 regressions in `background/tabs/` subsystem (B-125 + B-121, shared merged R0 spike) + 1 retro process polish (B-126 — expand B-119 for CSS-token invariants) + 1 unblocked S37 follow-up cleanup (B-120 — stale test docblock prose). Sprint 37 retro HIGH action item #1 closed via B-126.
**Release:** v1.32.0 (release/v2 only — no main merge per established pattern)
**Branch:** `feature/sprint-38-bugfix` (off `release/v2`)
**Tests:** 1,641 → 1,663 (+22 net — 5 B-125 + 13 B-121 + 1 floating-shape + 3 fix-round adds)
**Commit:** `d9869ff` (S38 close — B-125 + B-121 + B-120 + B-126)

### Completed Items

#### [B-125] Tab claim ownership jump on URL navigation — ✅ DONE
- **Tier**: Spike-First (R0 + Full M) · **Priority**: P0 · **Closed**: 2026-04-29
- **Pipeline**: R0 ✅ (merged with B-121) · R1 ✅ · R2 ✅ (§59) · R3 ✅ · R4 ✅ · R5 ✅ (5 tests T1-T5 + UAT plan) · R6 ✅ (§59.10 As-Built) · R7 skipped (internal SW-memory change, no user-visible UI)
- **Files changed**:
  - `background/tabs/tab-claims.js` — `inheritedTabs: Set<number>` ephemeral SW-memory marker; `markInherited` / `isInherited` / `pruneInherited` helpers; `reevaluateTab` gate inside `!alreadyClaimed` branch (skip auto-claim when tab is inherited)
  - `background/tabs/tab-events.js` — `pruneInherited` on `tab.onRemoved` + `windows.onRemoved` cascade
  - `tests/b125-claim-jump-fix.test.js` (NEW) — 5 tests T1-T5
  - `docs/design/58-b-125-b-121-r0-spike.md` (NEW — merged R0 spike doc for B-125 + B-121)
  - `docs/design/59-b-125-claim-jump-fix.md` (NEW chapter; §59.10 As-Built appended at R6)
  - `docs/UAT_B-125.md` (NEW) — 8 UAT cases for product-owner Edge run
- **R0 root cause**: NOT a B-099 release-path regression. `tab-claims.js:193-219` `reevaluateTab` auto-claim branch was firing for opener-chain-spawned new tabs, stealing them from their intended floating-group inheritance.
- **Sequencing**: B-125 R3 landed BEFORE B-121 R3 to satisfy B-121 AC8(iv) cleanly.
- **Zero impact**: schema · message contracts · manifest permissions — pure SW in-memory bug fix.
- **UAT status**: UAT-1..UAT-8 pending product-owner Edge run (`docs/UAT_B-125.md`). Carried forward per established pattern.
- **R6 precedent**: Merged R0 spike for two related-subsystem bugs proven cost-effective vs. two separate spikes (~1.5× agent-hour savings).

#### [B-121] Floating tab opener-chain inheritance render path — ✅ DONE
- **Tier**: Spike-First (R0 + Full M) · **Priority**: P1 · **Closed**: 2026-04-29
- **Pipeline**: R0 ✅ (merged with B-125) · R1 ✅ · R2 ✅ (§60) · R3 ✅ · R4 ✅ (1 CRIT + 4 HIGH + 3 MEDIUM all resolved fix-and-reproceed) · R5 ✅ (13 tests T-A..O + UAT plan) · R6 ✅ (§60.14 As-Built) · R7 ✅ (CHANGELOG)
- **Files changed** (~1,800 LOC src+test across 18+ files):
  - `shared/messages.js` — optional `floatingMembers` field on `MSG_LIST_ITEMS` response + `FloatingMember` typedef
  - `background/tabs/floating-members.js` (NEW) — runtime resolver for floating-tab → parent-group hydration
  - `background/tabs/floating-groups.js` — `parentItemId` + `floatingTabId` storage shape; lazy-migration read shim for legacy `itemId`
  - `background/storage/migration.js` — `KNOWN_VERSION` 1→2 + no-op step
  - `background/storage/shapes.js` — `defaultShape` v2 seed
  - `sidepanel/sidepanel.js` + `newtab/newtab.js` — synthetic `[data-floating="true"]` `.item-row` rows rendered under parent group sections
  - `background/tabs/open-tabs.js` — `buildOpenTabs(floatingTabIds)` exclusion
  - `newtab/newtab.css` — floating-row styling + close-button affordance
  - `background/messages/storage-handlers.js` — cascade-prune on `MSG_DELETE_ITEM` + `MSG_BULK_DELETE_ITEMS` + `MSG_DELETE_GROUP`
  - `tests/b121-floating-group-render.test.js` (NEW) — 13 tests (T-A..O minus deferred letters)
  - 7 existing test files updated for `parentItemId` rename + new shape (b099, b013, b018, floating-shape, floating-multi, floating-position, demote-item)
  - `docs/design/60-b-121-floating-tab-render.md` (NEW chapter; §60.14 As-Built appended at R6)
  - `docs/UAT_B-121.md` (NEW) — 15 UAT cases for product-owner Edge run
  - `CHANGELOG.md` — v1.32.0 entry (B-121 schema-bump SW module-cache flush note per C-1)
- **R0 root cause**: NOT a broadcast-scope regression. NO runtime render path for `tj:floatingGroups` ever existed; original B-013 left this as a latent feature gap (~90% confidence in R0).
- **Storage schema**: `tj:floatingGroups` v1 → v2 (lazy, non-destructive read shim). CHANGELOG includes the SW module-cache flush note (extension toggle-OFF/ON cycle after update).
- **R4 fix-and-reproceed (1 CRIT + 4 HIGH + 3 MEDIUM)**:
  - CRIT C-1: `KNOWN_VERSION` bump was missed at R3 (lazy migration is correct for data, but the version increment is governance — independent of data-rewrite strategy)
  - HIGH H-1: newtab close-button affordance was deferred as "future enhancement" by R3 — escalated and fixed in R4 reproceed
  - MEDIUM M-1 + M-2: cascade-prune asymmetry between single-delete and bulk/group-delete — pure R3 oversight (lazy fallback in `buildFloatingMembers` masked the gap until [security-reviewer] flagged it)
- **UAT status**: UAT-1..UAT-15 pending product-owner Edge run (`docs/UAT_B-121.md`). Carried forward per established pattern.

#### [B-120] Stale test docblock prose corrections — ✅ DONE
- **Tier**: Fast Track (XS) · **Priority**: dev-only · **Closed**: 2026-04-29
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (PROCEED — 0 findings any tier; numerical accuracy + cross-references verified; bundled with B-126)
- **Files changed**: `tests/b114-tint-v2.test.js` lines 4-13 + `tests/b104-group-colors.test.js` lines 382-396 — docblock prose updated to post-B-117 contrast values. **Zero assertion changes** (test-file maintenance only).
- **Closes**: S37 mid-sprint follow-up filed when §57.9 sentinel-grep gate triggered at B-117 R3 entry.

#### [B-126] Expand B-119 contract for CSS-token invariants — ✅ DONE
- **Tier**: Fast Track (XS) · **Priority**: dev-process · **Closed**: 2026-04-29
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (PROCEED — 0 findings; bundled with B-120)
- **Files changed**: `CLAUDE.md` lines 378-388 — "Fix-scope test-assertion enumeration" subsection extended to explicitly include CSS-token invariants asserted in test files (regex pins on `shared/themes.css`, structural assertions on `--<token>` values, count-of-N assertions on token declarations). Sprint 37 R3 b114 T1 escalation added as 2nd blocking precedent (alongside Sprint 36 B-113 D-3).
- **Closes**: S37 retro HIGH action item #1 — B-119 contract definition gap (DOM/ARIA/message/selector only) that missed the `tests/b114-tint-v2.test.js` T1 CSS-token invariant assertion is now closed.

### Sprint Retrospective

**Velocity:** Planned 4 / Completed 4. 2×M (Spike-First) + 2×XS (Fast Track) — fully on plan. Test delta +22 (1,641 → 1,663); zero regressions. Items filed mid-sprint: 0.

**What Went Well:**
- **Merged R0 spike** (B-125 + B-121) was the right call — one [solution-architect] investigation produced two refuted hypotheses + two correct root causes in a single pass. Saved an estimated 1.5× agent-hours vs two separate spikes. The pattern is reusable for any future "two related bugs in the same subsystem" pair.
- **B-118 source-citation gate** (shipped S37) had its first real-world test this sprint and worked. R1 across all 4 items cited `file:line` against verified sources; zero R2 binding-correction surprises (vs S36's three-correction trio that motivated the gate).
- **B-126 enumeration expansion** caught and prevented at least one mid-R3 scope-explosion: the B-121 R3 fix-scope subsection covered the CSS-token-invariant test-file impact at R2-time, allowing R3 to update all 7 enumerated test files atomically with no mid-build expansion.

**What to Improve:**
- **R3 under-scoped the newtab close-button affordance** (B-121 H-1 from [code-reviewer] + [qa-reviewer]). R2 §60.6.2(c) AC6 was clear; R3 deferred with a "future enhancement" comment. The R4 fix-and-reproceed cycle caught it but cost ~30 min of additional review + fix loop. Lesson: when R3 sees a "future enhancement" temptation, the right action is to STOP and escalate to [scrum-master], not silently defer past R4.
- **`KNOWN_VERSION` bump was missed at R3** (B-121 CRIT C-1). R2 §60.4.7 was unambiguous; R3 chose lazy migration (correct for data) but skipped the version bump (incorrect — governance, not data). Lesson: schema-version increments are independent of data-rewrite strategy. R2 designs should split these into two checkbox items so R3 can't conflate them.
- **Cascade-prune asymmetry** between single-delete and bulk/group-delete (security M-1 + M-2) was a pure oversight in R3. The lazy fallback in `buildFloatingMembers` masked the gap until [security-reviewer] flagged it. Lesson: when adding a cascade for one entry-point of a multi-entry-point write surface, R2 fix-scope should enumerate ALL entry-points; R3 should grep for siblings before claiming the cascade is complete.

**Action Items for Next Sprint (S39):**
1. **[scrum-master]**: When R3 considers a "future enhancement" deferral on an AC-locked behavior, require an explicit STOP-and-escalate to [scrum-master] (not a silent in-code comment). File as a CLAUDE.md edit P3/XS for S39. [HIGH]
2. **[solution-architect]**: R2 design template — split schema-version-bump and data-migration-strategy into two separate checkbox items so R3 cannot conflate them. File as a CLAUDE.md edit P3/XS for S39. [MEDIUM]
3. **[solution-architect] / [frontend-engineer]**: When R2 fix-scope adds a cascade-prune to one delete entry-point, R3 must grep for sibling delete entry-points (`MSG_DELETE_*`, `bulkDelete*`, etc.) and verify cascade parity before claiming complete. File as a CLAUDE.md edit P3/XS for S39. [MEDIUM]

### Lessons Captured (Pipeline Patterns / Process Precedents)

- **Pattern proven**: Merged R0 spike for two related-subsystem bugs (B-125 + B-121). One [solution-architect] investigates the shared subsystem holistically; produces a feasibility doc enumerating ALL causes per item + which cause is actually firing in production. Decides whether bugs share a fix (one R3) or need separate fixes (parallel R3 runs). Reusable any time two bugs share a subsystem touch surface.
- **Pattern proven**: B-118 source-citation gate (shipped S37) prevents the R2 binding-correction class of failure. S38 saw zero binding-correction surprises across 4 items vs. S36's three corrections in a single sprint.
- **Pattern proven**: B-119 + B-126 fix-scope enumeration extends cleanly to CSS-token + storage-schema contracts. R2 fix-scope tables now enumerate every test `file:line` asserting the pre-change contract, broken out across DOM/ARIA/message/selector/CSS-token/storage-schema dimensions.
- **New pattern (S38)**: Cascade-prune sibling-grep gate — R3 must enumerate all delete entry-points before declaring a cascade complete (action item #3 above).
- **New pattern (S38)**: Schema-version-bump-vs-data-migration split — R2 must split these into two R3 checkbox items so R3 cannot conflate them (action item #2 above).
- **New pattern (S38)**: STOP-and-escalate for AC-locked "future enhancement" deferrals — R3 may not silently defer past R4 (action item #1 above).

### Carried-Forward UAT (S36 + S37 + S38 — pending product-owner Edge UAT)

Product-owner manual UAT in Edge for v1.30.0 + v1.31.0 + v1.32.0. Not blocking sprint close per established pattern, but should be cleared before any v2 → main merge.

- **Sprint 36 (v1.30.0)**: B-107, B-108, B-109, B-110, B-111, B-112, B-113, B-114, B-115 — all UAT pending
- **Sprint 37 (v1.31.0)**: B-117 UAT-1..UAT-10 pending (`docs/UAT_B-117.md`)
- **Sprint 38 (v1.32.0)**: B-125 UAT-1..UAT-8 pending (`docs/UAT_B-125.md`) · B-121 UAT-1..UAT-15 pending (`docs/UAT_B-121.md`)

### Files Changed Summary (high-level — see commit `d9869ff` for full diff)

- **Source code**: `background/tabs/tab-claims.js` · `background/tabs/tab-events.js` · `background/tabs/floating-members.js` (NEW) · `background/tabs/floating-groups.js` · `background/tabs/open-tabs.js` · `background/storage/migration.js` · `background/storage/shapes.js` · `background/messages/storage-handlers.js` · `shared/messages.js` · `sidepanel/sidepanel.js` · `newtab/newtab.js` · `newtab/newtab.css`
- **Tests**: `tests/b125-claim-jump-fix.test.js` (NEW) · `tests/b121-floating-group-render.test.js` (NEW) · 7 existing test files updated for parentItemId rename · `tests/b114-tint-v2.test.js` + `tests/b104-group-colors.test.js` docblock prose
- **Process**: `CLAUDE.md` (B-126 — Round 2 fix-scope subsection extended for CSS-token invariants)
- **Design**: `docs/design/58-b-125-b-121-r0-spike.md` (NEW) · `docs/design/59-b-125-claim-jump-fix.md` (NEW) · `docs/design/60-b-121-floating-tab-render.md` (NEW) · `docs/SOLUTION_DESIGN.md` (TOC entries for §58/§59/§60)
- **UAT plans**: `docs/UAT_B-125.md` (NEW) · `docs/UAT_B-121.md` (NEW)
- **Release**: `manifest.json` 1.31.0 → 1.32.0 · `CHANGELOG.md` v1.32.0 entry · `tab-junkie.zip` 348 KB / 87 files (`./build.sh` exit 0)

### Final State

- **Tests**: 1,663/1,663 passing · zero regressions
- **Release tag**: v1.32.0 (cut on `release/v2`; `gh release create` skipped per established pattern)
- **Storage schema**: `tj:floatingGroups` v1 → v2 (lazy migration; rollback documented at §60.14)
- **Manifest permissions**: zero new permissions added

---

## Sprint 39 — Polish + drag UX (closed 2026-04-30)

**Release**: v1.33.0 (cut tag on `release/v2` after PR #42 merge `e4de232`; `gh release create` skipped per established pattern)
**Branch**: `feature/sprint-39-polish` off `release/v2`
**Test delta**: 1,663 → 1,731 (+68)
**Build**: `tab-junkie.zip` 360 KB / 87 files (`./build.sh` exit 0)

### Items shipped (6)

#### B-124 — Floating-tab visual distinction (P3/M, Full)
- Dotted green left-bar on floating-tab rows in sidepanel + newtab + standalone via new `--floating-bar-color` CSS token (default aliases `var(--live-indicator)`; one-token swap to yellow possible).
- Hover-revealed "Save as bookmark" CTA wires to existing `MSG_PROMOTE_TAB` (no contract change). Distinct ARIA `"floating tab — <title>"`.
- WCAG AA matrix encoded as 34 contrast tests across 14 themes; 3 ACCEPTED_LIMITATIONS (solarized-light Dim 1 @ 2.970:1 + solarized-light Dim 2 @ 4.170:1 + solarized-dark Dim 2 @ 3.281:1 — all pre-existing palette gaps inherited from saved-bookmark row-action buttons).
- Files: `shared/themes.css`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.js`, `newtab/newtab.css`, `newtab/newtab.js`, `tests/b124-floating-visual.test.js` (new, 10 tests), `tests/b124-floating-bar-contrast.test.js` (new, 34 tests), `docs/design/61-b-124-floating-visual.md` (R2 + §61.10 As-Built), `docs/UAT_B-124.md` (13 cases).
- R4: 0 CRIT/HIGH; 4 MEDIUM (M-1 docstring, M-2 silent-degrade, M-3 contrast tests, M-4 cross-flag with B-122). All convergent MEDIUMs resolved in Wave 3a fix-round.

#### B-122 — Sub-group drag-to-root (P2/M, Full)
- Drag a sub-group out of its parent and drop anywhere outside `.group-section` → promotes to top-level via existing `MSG_BULK_REORDER_GROUPS` (no new message contract). Mid-list ordering supported. Same drop-line indicator as drag-reorder (Q2). Open Tabs section REJECTED as a drop target (Wave 3a fix per R4 cross-reviewer convergence).
- F-5 race-guard third branch validates `freshDragged.parentId !== null` AND `pendingInsertAfterGroupId` still top-level.
- Q4 outcome (above-own-parent → PROMOTE): NO explicit conditional needed; `validReorderTargetIds` already filters parent at depth-0.
- Files: `shared/sort-order.js` (new pure helper `computeGroupPromote`), `sidepanel/sidepanel.js` (new `_computeGroupPromoteTarget` + race-guard branch + Open-Tabs reject-guard), `tests/sort-order.test.js` (+9 tests), `tests/b122-drag-to-root.test.js` (new, 7 tests including R5 T7 Open-Tabs guard regression), `docs/design/62-b-122-drag-to-root.md` (R2 + §62.11 As-Built), `docs/UAT_B-122.md` (10 cases).
- R4: 0 CRIT/HIGH; 1 MEDIUM (M-4 Open-Tabs reject-guard, cross-flag with [qa-reviewer] M-2). Resolved in Wave 3a.

#### B-123 — Item-row alignment (P3/XS, Fast Track)
- Sidepanel rows without a live/active vertical indicator now align horizontally with rows that DO have one. Pure CSS structural-placeholder approach: base `.item-row` reserves `border-left: 3px solid transparent` + `padding-left: 9px`; live + active variants override only `border-left-color`; dense-mode preserves `padding-left: 9px`. Newtab + popup are no-op (no left-side indicators).
- Files: `sidepanel/sidepanel.css`, `tests/b123-row-alignment.test.js` (new, 6 tests T1-T6 — sidepanel rule pins + newtab/popup no-op regression guards).
- R4: 0 findings beyond 1 LOW (T6 pin scope; deferred).

#### B-127 — R3 STOP-and-escalate gate (P3/XS, Fast Track · S38 retro action #1)
- Added bullet to CLAUDE.md R3 Build section: when [frontend-engineer] considers deferring AC-locked behavior, MUST stop and escalate to [scrum-master]. Cites Sprint 38 B-121 R3 silently-deferred newtab close-button affordance as the blocking precedent.
- Files: `CLAUDE.md` line 394.

#### B-128 — C-1 schema-bump vs data-migration split (P3/XS, Fast Track · S38 retro action #2)
- Split CLAUDE.md R2 Correctness Checklist C-1 into C-1a (governance: `KNOWN_VERSION` increment + `defaultShape` update + `CHANGELOG` flush note) and C-1b (data-migration strategy: eager / lazy / no-op). Cites Sprint 38 B-121 lazy-migration + missed `KNOWN_VERSION` bump as the blocking precedent.
- Files: `CLAUDE.md` lines 365-366.

#### B-129 — R3 cascade-prune sibling-grep gate (P3/XS, Fast Track · S38 retro action #3)
- Added bullet to CLAUDE.md R3 Build section: when R2 fix-scope adds a cascade-prune to one entry-point of a multi-entry-point write surface, R3 MUST grep for sibling entry-points (`MSG_DELETE_*`, `MSG_BULK_*`, `MSG_*_GROUP`) before claiming complete. Cites Sprint 38 B-121 R3 single-delete-only cascade-prune as the blocking precedent.
- Files: `CLAUDE.md` line 395.

### Quality Summary

- **R4**: 0 CRITICAL / 0 HIGH across all 6 items. 4 convergent MEDIUMs across the two anchors all resolved in Wave 3a fix-round (Open-Tabs reject-guard, docstring inaccuracy, aria-label cross-surface parity, WCAG contrast tests). LOW findings deferred to polish backlog.
- **R5**: 2 UAT plans authored (`docs/UAT_B-124.md`, `docs/UAT_B-122.md`); R5 [test-engineer] added 2 gap-closing tests (T7 Open-Tabs guard regression, T-124-K deleted-group fallback).
- **R6**: chapters 61 + 62 As-Built sections appended; `docs/SOLUTION_DESIGN.md` TOC updated.
- **R7**: `CHANGELOG.md` v1.33.0 entry, `STORE_LISTING.md` surgical bullets, `docs/user-manual/managing-items.md` extended with floating-tab + drag-to-root sections.

### Process Improvements (Gate 7 retrospective)

**What went well**:
- R0 spike not needed; R1 design Q&A pre-locked.
- R4 cross-reviewer convergence as a Wave 3a fix-round signal worked cleanly.
- WCAG matrix encoded as tests on first try (mirrored B-117 / B-105 precedent).
- Self-applying retro items (B-127/B-128/B-129) shipped with 0 R4 findings.

**What to improve / Next-sprint candidates**:
- B-130 candidate: R3 cross-surface diff self-check (3 silent newtab/sidepanel divergences in S39 R3 found at R4).
- B-131 candidate: R3 self-check on R2-deferred-to-UAT items (Open-Tabs reject-guard was deferred at R2 but cheap-fix at R3).
- Toolchain hygiene: pre-create `docs/findings/sprint-NN.md` at sprint kickoff to bypass agent file-write permission friction.

### Final State

- **Tests**: 1,731/1,731 passing · zero regressions
- **Release tag**: v1.33.0 (cut on `release/v2`; `gh release create` skipped per established pattern)
- **Storage schema**: unchanged
- **Manifest permissions**: zero new permissions added
- **Sprints without rollback**: 15 (S23 → S39)

---

## v1.33.1 Hotfix — B-130 floating-tab indicator simplification (closed 2026-04-30)

**Release**: v1.33.1 (cut tag on `release/v2` after PR #43 merge `872ad95`; `gh release create` skipped per established pattern)
**Branch**: `hotfix/v1.33.1-b-130` off `release/v2` (post-S39 close)
**Test delta**: 1,731 → 1,732 (+1 T-124-A.2 JS-side cleanup pin)
**Build**: `tab-junkie.zip` 360 KB / 87 files (`./build.sh` exit 0)

### B-130 — Floating-tab visual indicator simplification (P3/XS, Fast Track)

**Origin**: product-owner observed post-v1.33.0 ship that the new `.item-floating-bar` element added in B-124 R3 (a separate dotted-green bar absolute-positioned at `left: 3px`) visually collided with the dotted-orange `.item-drift-bar` (B-101) which sits in the same x-column. The dotted-green bar looked like it was replacing the drift indicator rather than the open indicator.

**Decision**: floating tabs reuse the existing live-tab open-indicator (the row's left border) and just render it as DOTTED green instead of solid green. No separate bar element.

**Implementation**:
- `sidepanel/sidepanel.css` — removed `.item-floating-bar` rule; added `[data-floating="true"]` override that sets `border-left-style: dotted` + `border-left-color: var(--floating-bar-color)`.
- `sidepanel/sidepanel.js` — removed `<span class="item-floating-bar">` injection in `buildFloatingTabRow` + defensive re-attach in `patchFloatingMembersSections`.
- `newtab/newtab.css` — removed `.newtab-floating-bar` rule entirely (no replacement).
- `newtab/newtab.js` — removed element creation in `_buildFloatingTabRow`. **Newtab decision**: right-side-only — the right-side `.newtab-indicator-live` dot (per R2 §61.3.2) already covers the live-state cue on newtab; no left-side mirror needed since newtab has no left-side `border-left` indicator to inherit a dotted-vs-solid distinction from. The visual collision concern that motivated B-130 doesn't exist on newtab in the first place (no `newtab-drift-bar` element).
- `tests/b124-floating-visual.test.js` — T-124-A + A.2 + F + I rewritten to pin the new architecture (regex-asserts dotted style on the override + asserts `.item-floating-bar` rule does NOT exist).
- `--floating-bar-color` token RETAINED in `shared/themes.css` so a future yellow swap remains a one-token change.

**R4**: 0 CRITICAL / 0 HIGH / 0 MEDIUM. 2 LOW deferred ([code-reviewer] L-1 stale file-level docstring header in `tests/b124-floating-visual.test.js`; L-2 documentation note about B-123 placeholder-contract broadening). [security-reviewer] 0 findings — net surface-reduction (one DOM element + one CSS rule removed per surface).

### Process notes

- **Toolchain hygiene fix applied**: `docs/findings/sprint-39-1.md` was pre-created at hotfix kickoff per S39 retrospective action item. R4 reviewers wrote findings to it without permission-prompt friction. Pattern adopted for future sprints.
- **Bookkeeping commit pattern refined**: split the v1.33.1 work into 3 commits — (1) `5b3ce4a` hotfix code+tests+release-notes, (2) `55b6ba3` BACKLOG/board/findings, (3) `d573248` next-sprint bug filings (B-131 + B-132). Cleaner history vs single-commit-per-sprint pattern.

### Newly filed bugs (queued for next sprint)

- **B-131** (P1, TBD) — Floating tab opens with wrong title initially (sibling item's title shown until tab activates). Suspected render-pipeline race in `buildFloatingTabRow` / `patchFloatingMembersSections` — descriptor mapping may be sourced against stale/off-by-one index, or `chrome.tabs.onCreated` initial empty title triggers a displacement.
- **B-132** (P1, TBD) — Floating tabs route to Open Tabs section instead of originating group after extension reload. Suspected SW-memory loss of `openerMap` (B-013/B-018) or `inheritedTabs` (B-125), or cold-start `tj:floatingGroups` re-bind regression. Distinguish: (a) post-reload-only spawn affected, vs (b) pre-existing floating tabs also lose their group.

Both filed as `backlog | TBD` with triage notes; R1 to investigate at next sprint kickoff.

### Final State

- **Tests**: 1,732/1,732 passing · zero regressions
- **Release tag**: v1.33.1 (cut on `release/v2`; `gh release create` skipped)
- **Storage schema**: unchanged · **Manifest permissions**: unchanged · **Message contracts**: unchanged
- **Sprints + hotfixes without rollback**: 16 (S23 → S39 → v1.33.1)

---

## Sprint 40 — Floating-tab bug-fix anchor + drag-reorder feature (closed 2026-04-30)

**Release**: v1.34.0 (cut tag on `release/v2` after PR #44 merge `f131e95`; `gh release create` skipped per established pattern)
**Branch**: `feature/sprint-40-drag-reorder` off `release/v2`
**Test delta**: 1,734 → 1,778 (+44)
**Build**: `tab-junkie.zip` 380 KB / 87 files (`./build.sh` exit 0)

### Items shipped (4 + 1 wontfix + 1 deferred stub)

#### B-134 — Drag-and-drop reorder for open + floating tabs (P2/M, Full)
- **5 ops**: (1) Open Tabs reorder same-window via `chrome.tabs.move`; (2) within-floating reorder via new `MSG_REORDER_FLOATING_MEMBERS`; (3) ATTACH (Open→Floating) via new `MSG_MOVE_FLOATING_TAB` + `markInherited(tabId)` lock; (4) DETACH (Floating→Open) + `pruneInherited(tabId)`; (5) cross-group floating MOVE atomic single message. Cross-window REJECT silent. 3-branch race-guard (B-122 §62.9 F-5 pattern).
- **Schema bump**: `tj:floatingGroups` v2 → v3 — added `sortOrder: number` field; `KNOWN_VERSION` 2→3; `defaultShape(PARTITION_META)` updated; new no-op `MIGRATION_STEPS` v2→v3 entry; lazy migration with `(windowId, tabIndex)` fallback for legacy v2 records. C-1a + C-1b compliance verified. CHANGELOG SW module-cache flush note included per Sprint 30 B-092 / Sprint 38 B-121 precedent.
- **R4**: 0 CRITICAL, **4 HIGH** (all closed in Wave 3a fix-round): H-1 race-guard B over-trip on title/audible/active changes → content-conditional gen bumps via `_openTabsSignature` + `_floatingMembersSignature` setter guards; H-2 `MSG_REORDER_FLOATING_MEMBERS` ERR_RACE silent fail → mirror MOVE_FLOATING handler pattern; H-3 REJECT indicator stuck-position → exclude REJECT from skip-no-op; H-4 REORDER_FLOATING midline math includes dragged row → exclude in both `_computeTabDropTarget` and `_resolveTabDragIndicatorY`. 12 MEDIUM + 14 LOW deferred per `docs/findings/sprint-40.md`.
- **R6 As-Built §63.18 reconciliation**: R4 [code-reviewer] M-4 (parentItemId re-anchor deviation from R2 §63.8.2 pseudocode) ACCEPTED in favor of as-built behavior — load-bearing for B-129 cascade-prune contract; reusing source's stale `parentItemId` would silently leak floating records past parent-item deletion. T6 in `tests/b134-tab-drag-reorder.test.js:294` is the regression guard.
- **Files**: 8 source + 4 test (`shared/messages.js`, `background/storage/{shapes.js, migration.js}`, `background/tabs/{floating-groups.js, floating-members.js}`, `background/messages/storage-handlers.js`, `sidepanel/{sidepanel.js, sidepanel.css}`; `tests/b134-tab-drag-reorder.test.js` new (32 tests T1-T31), `tests/floating-shape.test.js`, `tests/migration-steps.test.js`, `tests/chrome-mock.js`); design `docs/design/63-b-134-tab-drag-reorder.md` (1,305 lines, R2 + §63.18 As-Built); `docs/UAT_B-134.md` (19 cases).

#### B-132 — Cold-start claim-jump fix (P1/M, Full)
- **Origin**: product-owner observed post-v1.33.0 ship that pre-existing floating tabs route to Open Tabs section after extension reload (Mode-b URL-collision claim-jump).
- **Top hypothesis confirmed (R0 spike, HIGH ~75%)**: cold-start `reconcileClaims` Phase 2 auto-claims unclaimed live tabs whose URL matches saved items. The B-125 `inheritedTabs` gate is INSIDE `reevaluateTab`, NOT inside `reconcileClaims` — so on cold-start (with `chrome.storage.session` cleared on extension reload) Phase 2 sees pre-existing floating tabs as candidates and URL-matches them.
- **Fix**: ~117 LOC across 3 files. NEW `preMarkInheritedFromFloatingGroups()` helper in `background/tabs/floating-groups.js` runs at cold-start BEFORE `reconcileClaims`, populating `inheritedTabs` Set from persisted records (mirrors `reassociateFloatingGroups` position-then-URL match algorithm). NEW Phase 2 gate in `reconcileClaims` (`background/tabs/tab-claims.js:169-200`) skips candidates already in `inheritedTabs` via `while`/shift pattern.
- **AC3 deep-chain carve-out (acceptable limitation)**: tabs spawned post-reload through multi-hop opener-chain (e.g., grandparent claimed → parent floating → child opens) do NOT re-bind to the originating group post-reload, because `openerMap` is empty post-reload and multi-hop walks return null. Structurally infeasible without persisting `openerMap`. Documented across THREE surfaces (R0 §64.6, R2 §65.7, inline JSDoc on helper).
- **R4**: 0 CRITICAL/HIGH/MEDIUM from [code-reviewer] + [security-reviewer]; 2 MEDIUM from [qa-reviewer] both closed in Wave 3a (M-1 clarifying comment blocks on 3 sibling tests with same URL-collision pattern; M-2 try/catch wrap on cold-start helper for graceful degradation).
- **R2-VERIFY 1**: chrome.storage.session wipe behavior on extension reload — confirmed at R2 §65.2 via internal consistency analysis (deferred to UAT-4 for empirical SW-console verification; fix correct under either verdict).
- **No schema bump, no new permissions, no new message contracts**.
- **Files**: 3 source (`floating-groups.js`, `index.js`, `tab-claims.js`); tests `tests/b132-cold-start-inheritance.test.js` (NEW, 8 tests T-132-A..H), comment-only edits to 4 existing test files (`floating-multi`, `floating-position`, `floating-ready-gate`, `b018-persistence`); design `docs/design/64-b-132-r0-spike.md` (1,140 lines R0 spike) + `docs/design/65-b-132-cold-start-claim-jump-fix.md` (1,212 lines R2 + §65.14 As-Built); `docs/UAT_B-132.md` (9 cases).

#### B-133 — Open Tabs section dotted-green indicator (P3/XS, Fast Track)
- **User-visible**: Open Tabs section rows now use dotted-green left-border (matching floating-tab visual from B-130) instead of solid-green. Visual taxonomy completed: solid-green = persistent (saved bookmark, currently live); dotted-green = ephemeral (floating tab in group OR Open Tabs row).
- **Implementation**: single CSS edit at `sidepanel.css:1680-1691` — `.item-row[data-live-only="true"]` now declares `border-left-style: dotted` + `border-left-color: var(--floating-bar-color)` (was solid green via `var(--live-indicator)`).
- **Cross-surface decision**: sidepanel-only (newtab uses right-side dot indicators per B-130 §61.3.2; popup uses favicon-overlay).
- **Bonus architectural fix**: latent CSS-specificity fragility (floating rows matched both `[data-floating]` and `[data-live-only]` at equal specificity, with source-order making `--live-indicator` win) is incidentally fixed — both rules now bind `--floating-bar-color`.
- **R4**: 0 findings from both reviewers.
- **Files**: `sidepanel/sidepanel.css` (~12 LOC) + `tests/b133-open-tabs-dotted.test.js` (NEW, 92 LOC, 2 tests).

#### B-131 — Floating tab title-displacement bug (closed `wontfix-not-repro`)
- Wave 0 [product-manager] verify-first verdict (HIGH confidence): structurally cannot reproduce in v1.33.1. Strict tabId-keyed mapping at every layer (LiveTabIndex, buildFloatingMembers first-match-wins, row reuse, patch path). What user likely observed was the empty-title window during `chrome.tabs.onCreated` (Chrome delivers `tab.title === ''` initially → first paint falls back to URL string or `'Untitled tab'`, NOT a sibling's title). Closed without code change per product-owner: "if this comes back up naturally, i will open a new bug."

#### B-135 — Cross-window Open Tabs drag (deferred stub, no S40 work)
- Filed alongside B-134 per CLAUDE.md scope-change-control. Out of B-134 v1 scope per Q3 brainstorm (same-window only). Future sprint will tackle if surfaced; will involve `chrome.tabs.move({windowId})` cross-window semantics + drop-zone hit-test recognizing per-window regions.

### Quality Summary

- **R4**: 0 CRITICAL across all items. **4 HIGH on B-134 (all closed in Wave 3a fix-round)**. 2 MEDIUM on B-132 (closed Wave 3a). 12 MEDIUM + 14 LOW on B-134 deferred with rationale. 0 findings on B-133.
- **R5**: 2 UAT plans authored (`docs/UAT_B-132.md` 9 cases, `docs/UAT_B-134.md` 19 cases) + 1 gap-closing test (T31 covering `reorderFloatingMembers` SW-side parity-mismatch race-paths). Tests 1,777 → 1,778.
- **R6**: chapters 63 + 65 As-Built sections appended (§63.18 + §65.14, 11 subsections each). `docs/SOLUTION_DESIGN.md` TOC updated.
- **R7**: `CHANGELOG.md` v1.34.0 entry with mandatory C-1a SW module-cache flush note. `STORE_LISTING.md` surgical bullets. `docs/user-manual/managing-items.md` extended with drag-reorder section + B-132 reload-limitation note + visual-taxonomy clarification.

### Process Improvements (Gate 7 retrospective)

**What went well**:
- R0 spike merged with Wave 0 work for B-132 saved sprint capacity (verdict: M Full not XL Spike-First)
- B-131 verify-first saved ~3 effort units (closed Wave 0 without sinking R2/R3)
- R1 LOCKED at brainstorm for B-134 (saved a round-trip)
- Cross-reviewer convergence at R4 surfaced 4 HIGH findings cleanly (qa H-1 caught a UX-blocker)
- Toolchain hygiene fix shipped (`docs/findings/sprint-40.md` pre-created at kickoff; 0 file-write denials)
- Schema-bump compliance worked cleanly (C-1a + C-1b for `tj:floatingGroups` v2→v3 lazy migration; CHANGELOG flush note included)

**Next-sprint candidates** (file before S41 kickoff):
- **B-136**: CLAUDE.md R2 charter addition — for any drag-state / cache invalidation contract, R2 must enumerate "what changes count as gen-counter-relevant" to prevent the H-1 over-trip class
- **B-137**: CLAUDE.md R3 STOP-and-escalate (B-127) extension — fire when R3 finds R2 spec is incorrect, not just for AC-locked deferrals
- Pre-existing S39 retro candidates **B-138/B-139** (R3 cross-surface diff self-check + R3 deferred-to-UAT cheap-fix check) still pending file. Bundle in S41 Wave 1 retro piggyback

### Final State

- **Tests**: 1,778/1,778 passing · zero regressions
- **Release tag**: v1.34.0 (cut on `release/v2`; `gh release create` skipped)
- **Storage schema**: `tj:floatingGroups` v2 → v3 (lazy migration; rollback documented at §63.18)
- **Manifest permissions**: zero new permissions added
- **Sprints + hotfixes without rollback**: 17 (S23 → S40)

---

## v1.34.1 Hotfix — B-136 chrome.tabs.onMoved listener (closed 2026-04-30)

**Release**: v1.34.1 (cut tag on `release/v2` after PR #45 merge `e60eab6`; `gh release create` skipped per established pattern)
**Branch**: `hotfix/v1.34.1-b-136` off `release/v2` (post-S40 close)
**Test delta**: 1,778 → 1,782 (+4)
**Build**: `tab-junkie.zip` 380 KB / 87 files (`./build.sh` exit 0)

### B-136 — chrome.tabs.onMoved listener registration (P0/S, Fast Track)

**Origin**: post-S40 v1.34.0 ship smoke test surfaced 3 issues. R0 discovery spike (`docs/findings/post-s40-smoke-triage.md`) classified Issue 1 (Open Tabs drag no-op despite B-134) as a localized bug:

> `chrome.tabs.onMoved` is never registered in `background/tabs/tab-events.js:41-353`. Drop dispatches `chrome.tabs.move` correctly (browser strip reorders) but `LiveTabIndex.entry.index` never updates → `buildOpenTabs` keeps sorting by stale indices → cache signature unchanged → no patch path runs → TJ row stays put.

**Fix**: ~30-40 production LOC. Register `chrome.tabs.onMoved` listener mirroring existing `onUpdated`/`onActivated`/`onAttached` patterns. Local-renumber strategy chosen (Option B): forward move `(fromIndex, toIndex]` shift -1; backward move `[toIndex, fromIndex)` shift +1. After `LiveTabIndex.updateTabEntry(tabId, { windowId, index: toIndex })`, fire `broadcast(SCOPE.LIVE_STATE, 'tab/moved', { requireClaimsReady: true })`.

**R3-VERIFY confirmations**:
- R3-V-1 (`toIndex` literal — no -1 placeholder per Chrome docs): confirmed via `developer.chrome.com/docs/extensions/reference/api/tabs#event-onMoved`
- R3-V-2 (`LiveTabIndex.updateTabEntry` API supports the patch): confirmed at `live-tab-index.js:52`
- R3-V-3 (broadcast pattern matches existing `onUpdated`): confirmed via grep

**R4**: `[code-reviewer]` CLEAN, `[security-reviewer]` CLEAN. Zero findings of any severity. qa-reviewer skipped per Fast Track tier.

**Test additions**:
- `tests/b134-tab-drag-reorder.test.js` T1 extended (now asserts post-move `LiveTabIndex.get(tabId).index` reflects new index AND `buildOpenTabs(...)` returns rows in new order — was previously asserting only `_moveCalls.length`)
- 4 new T1b tests: forward move, backward move, cross-window isolation, same-position no-op
- `tests/chrome-mock.js` gained `tabs.onMoved` event channel + `_fireOnMoved` helper; `tabs.move` mock now realistically renumbers siblings + fires `onMoved`

**No schema bump, no new permissions, no new message contracts, no DEFAULT_PREFERENCES changes** — therefore **no SW module-cache flush note required** in CHANGELOG (distinct from v1.32.0 / v1.34.0 schema bumps).

**Files**:
- `background/tabs/tab-events.js` (+53 LOC)
- `tests/chrome-mock.js` (+44/-3)
- `tests/b134-tab-drag-reorder.test.js` (+101/-1)
- `manifest.json` (1.34.0 → 1.34.1)
- `CHANGELOG.md` v1.34.1 entry
- `docs/RELEASES.md` v1.34.1 entry
- Bookkeeping: `docs/BACKLOG.md`, `docs/BACKLOG_BOARD.md`, `docs/findings/post-s40-smoke-triage.md`

### Process notes

- **Post-ship smoke-test triage as R0 spike** worked cleanly: 2-hour spike bisected 3 issues to root causes (1 localized bug + 2 data-model gap) with `file:line` evidence. Spike output drove sprint shape decision (Option B mixed: hotfix for B-136 + S41 anchor B-137 for the data-model item).
- **Wave-0 wontfix-not-repro verdict on B-131 was wrong** — static analysis missed the `(windowId, tabIndex)`-keyed JOIN in `buildFloatingMembers` (focused only on tabId-keyed direct lookups). B-131 reclassified `superseded-by-B-137` since the displacement is real and structural.
- **Sprint 40 R4 review process gap** surfaced: B-134 R3 dispatched `chrome.tabs.move` without registering `chrome.tabs.onMoved`. No R2 enumeration of "what updates LiveTabIndex after the move?" — filed as B-139 (CLAUDE.md C-13 candidate: Chrome event-feedback completeness gate).
- **Filed alongside B-136**: B-137 (P1/M Full S41 anchor — `tj:floatingGroups` schema v3→v4 adopting `floatingTabId` as primary live-tab join key; subsumes B-131); B-138 (P2/XS post-B-137 cleanup); B-139 (P3/XS CLAUDE.md C-13 R2 check).

### Final State

- **Tests**: 1,782/1,782 passing · zero regressions
- **Release tag**: v1.34.1 (cut on `release/v2`; `gh release create` skipped)
- **Storage schema**: unchanged (still v3 from v1.34.0)
- **Manifest permissions**: zero new permissions added
- **Sprints + hotfixes without rollback**: 18 (S23 → v1.34.1)

---

## Sprint 41 — Floating-tab data-model evolution + 5 pre-merge fixes (closed 2026-05-01)

**Release**: v1.35.0 (cut tag on `release/v2` after PR #46 merge `dcd7848`; `gh release create` skipped per established pattern)
**Branch**: `feature/sprint-41-floating-tab-id` off `release/v2`
**Test delta**: 1,782 → 1,826 (+44)
**Build**: `tab-junkie.zip` 390 KB / 87 files (`./build.sh` exit 0)

### Items shipped (1 anchor + 5 process gates + 5 pre-merge fixes + 1 deferred)

#### B-137 — `tj:floatingGroups` schema v3→v4 migration (P1/M, Full)
Anchor. Adopt `floatingTabId`-derived `liveTabId` as primary live-tab join key. Subsumes B-131 (sibling-title displacement). 3-tier read join (a `liveTabId` direct → b position → c URL fallback). Cold-start `reassociateFloatingGroups` extends prune-only writeTransaction to lazy-rewrite legacy v3 records. C-1a + C-1b compliance verified (KNOWN_VERSION 3→4, defaultShape v4, no-op MIGRATION_STEPS, lazy migration, CHANGELOG SW flush note). 17-section R2 chapter `docs/design/66-b-137-floating-tab-id-join-key.md` + §66.18 As-Built. UAT plan `docs/UAT_B-137.md` (15 cases).

#### B-139..B-143 — CLAUDE.md process gates (5×P3/XS, Fast Track)
- **C-13**: Chrome event-feedback completeness gate at R2 charter
- **C-14**: Gen-counter content predicate enumeration at R2 charter
- **B-141**: R3 STOP-and-escalate extension (R2-spec-incorrect findings)
- **B-142**: R3 cross-surface diff self-check (2+ surfaces)
- **B-143**: R3 deferred-to-UAT cheap-fix self-check (≤10 LOC threshold)

R4 across the bundle: 0 findings any severity. B-141 self-application gate fired correctly during Sprint 41 (line drift was JSDoc-only, not silent adaptation).

#### Pre-merge fixes (5 items, scope-discipline override per product-owner)

After v1.35.0 release commit but BEFORE PR merge, smoke testing surfaced 5 distinct bugs. Each addressed via R0 spike (where needed) → R3 fix → R4 reviewers (code + security parallel; qa skipped per surgical scope). Each amendment preserved test-suite green throughout.

- **Fix A (P0/Fast-Track-S)** — cascade-prune `tj:floatingGroups` on `chrome.tabs.onRemoved`. Closes "list changed during drag" toast on legitimate floating reorder (orphan-record cause). NEW `pruneFloatingGroupsByLiveTabId(tabId)` helper with `readPartition` pre-flight (preserves `tests/tab-events-no-storage-write.test.js` AC4). Extension fires from BOTH `chrome.tabs.onRemoved` AND `chrome.windows.onRemoved` per B-125 §59.5 belt-and-braces.
- **Fix B (P0/Fast-Track-XS)** — section→strip insertIndex translation in `chrome.tabs.move` dispatch. NEW `_computeStripInsertIndex(state)` helper with `effectiveS = (dPos < S) ? S - 1 : S` formula. Closes user-visible off-by-N bug where N = number of claimed/floating tabs preceding the dragged tab in the strip.
- **Fix C (P0/Fast-Track-S)** — two-layer dedup: (1) `appendFloatingGroup` no-op on duplicate `(liveTabId, parentItemId, groupId)` triple; (2) `reassociateFloatingGroups` cold-start dedup (extends-in-place per B-137 §66.7.5 precedent). Closes the user's actual smoke-test failure (5+ duplicate records pre-dating Fix A's prune-on-close).
- **Fix D (P0/Fast-Track-XS)** — `_computeReorderFloatingPayload` off-by-one fix. Removed obsolete `currentIdx < insertIndex ? -1 : 0` adjustment that was correct for unfiltered insertIndex but was double-correcting forward drops post-B-134-R4-H-4 filtered-list semantics switch. Convention mismatch caught only after Fix C unblocked the actual reorder dispatch.
- **B-149 (P0/Fast-Track-S)** — drop URL-match clause from `reconcileClaims` Phase 1 (`background/tabs/tab-claims.js:141`). Closes drifted-bookmark-tab-loses-tracking-after-SW-idle-restart bug. Pre-fix Phase 1 retained pre-B-099 URL-match validation that re-violated B-099 D-1 contract every cold-start. The bug had pinned itself at 3 test sites (`b110-drift-non-live-fix.test.js` T5+T6, `tab-claims-reconcile.test.js` AC2) — all corrected. NEW `tests/b149-drifted-claim-survives-cold-start.test.js` (4 tests) pins the corrected behavior.

#### B-138 — DEFERRED
Post-B-137 `(windowId, tabIndex)` callers cleanup. Position-fallback retained intentionally for legacy v3 records during transition. Future sprint when v3 cohort confirmed empty.

### Quality Summary

- **R4**: 0 CRITICAL across all items. Sprint 41 R3 build was structurally clean (no Wave 3a fix-round needed). Pre-merge bug-fix bundle averaged 0 CRIT/HIGH/MEDIUM with minor LOW deferrable findings.
- **R5**: UAT plan authored (`docs/UAT_B-137.md` 15 cases). Pre-merge fix bundle test additions: T34-T39 (Fix A), Fix B-T1..T5, T40-T45 (Fix C), T46-T49 (Fix D), b149 T1..T4.
- **R6**: chapter 66 As-Built §66.18 appended.
- **R7**: CHANGELOG v1.35.0 entry with mandatory C-1a SW module-cache flush note. STORE_LISTING unchanged (no surgical-update threshold met). user-manual extended.

### Process Improvements (Gate 7 retrospective)

**What went well**:
- R0 spike pattern proved robust across 3 invocations (post-S40 → S41 plan → post-S41 pre-merge) — produced sharp diagnoses that drove sprint shape decisions
- B-141 self-application gate fired correctly (R2-spec-incorrect detection) during Sprint 41 work
- Schema-bump compliance pattern matured: third sprint applying full C-1a + C-1b lazy-migration (S38 v1→v2, S40 v2→v3, S41 v3→v4) — all landed clean
- Pre-merge bug-fix bundle (5 items) shipped via product-owner scope-discipline override + iterative smoke-test loop. Each fix R3 + R4 reviewer pair worked cleanly.

**What to improve**:
- B-137 R2 chapter 66 §66.1 claimed to subsume Issue 3 entirely but R5 only tested Trigger 1 (`_resolveRecordIndexByTabId` -1). Trigger 2 (storageBucketSize parity) was named in the post-S40 spike but never wired into AC matrix. Surfaced at v1.35.0 pre-merge UAT as Fix A. Improvement: when an item subsumes a multi-trigger R0 finding, R5 MUST enumerate every named trigger and confirm test coverage of each. Filed as B-150 candidate.
- B-149 bug had pinned itself at 3 test sites as "regression guards" for the buggy behavior. Improvement: when fixing a long-standing bug, R3 must grep ALL test files for the pre-fix behavior assertion patterns, not just the spike-identified site. Filed as B-151 candidate.
- Five pre-merge fixes on top of an "already-shipped" v1.35.0 release commit. Sprint structure didn't gracefully accommodate this iterative bug-fix loop. Per product-owner direction at end of S41, sprint ceremony reduced for bug-fix loops.

### Final State

- **Tests**: 1,826/1,826 passing · zero regressions
- **Release tag**: v1.35.0 (cut on `release/v2`; `gh release create` skipped)
- **Storage schema**: `tj:floatingGroups` v3 → v4 (lazy migration; rollback documented at §66.18.10)
- **Manifest permissions**: zero new permissions added
- **Sprints + hotfixes without rollback**: 18 (S23 → S41)

---

## Sprint 42 — Chrome tab group sync (2026-05-01)

**Theme:** One-way snapshot push of TJ's view of the current window onto Chrome's tab strip and tab groups.
**Release:** v1.36.0 (release/v2 only — no main merge)
**Branch:** `feature/sprint-42-chrome-sync` → merged to `release/v2` via PR #47 (merge commit `54f2852`)
**Tag:** `v1.36.0` (tagged on `release/v2` HEAD; `gh release create` skipped per established pattern)

### Completed Items

#### [B-041] Snapshot push: TJ → Chrome tab strip + tab groups — ✅ DONE
- **Tier**: Full (M)
- **Closed**: 2026-05-01
- **Pipeline**: R1 ✅ → R2 ✅ → R3 ✅ (15 plan tasks · 0 escalations) → R4 ✅ (3 reviewers parallel · 4 HIGHs in 6-commit fix-round) → R5 ✅ (coverage matrix · UAT script · +3 gap-fill tests) → R6 ✅ (As-Built §67.12 · 3 deviations recorded) → R7 ✅ (CHANGELOG + RELEASES + user-manual)
- **What shipped**: Settings page → Chrome Integration → "Sync this window to Chrome" button. Reads TJ state for the window the Settings tab is in, reorders Chrome tab strip to match TJ order (groups in `sortOrder`, members in TJ `sortOrder`, then ungrouped Open Tabs), creates Chrome tab groups for each TJ group with ≥1 live tab in this window (matching titles + mapped colors), persists `chromeTabGroupId` on the TJ group record for in-place re-sync. Stale Chrome tab group IDs detected via `chrome.tabGroups.get` and replaced transparently. Pinned tabs and empty groups skipped silently. Best-effort failure handling with `SyncSummary` toast (✓/⚠/✗ glyph variants, View details expander, aria-busy in-progress feedback). Push-only, snapshot-only, current-window only. Auto-sync (continuous mirror), Chrome → TJ pull, multi-window, sub-group flattening, Chrome-group adoption all explicitly deferred.
- **Files Changed**: 40 (3 new source modules: `background/sync/{chrome-sync,color-map}.js` + `settings/settings-chrome-sync.js` + `settings/settings-toast-timer.js` *(R4 fix-round D-3 emergence)*; 11 source modifications; 11 new test files; 4 test modifications; ~10 doc files including the new design chapter `docs/design/67-b-041-chrome-tab-group-sync.md`).
- **Schema**: `tj:groups` v4 → v5 lazy migration. `KNOWN_VERSION` 4→5; `defaultShape(PARTITION_META).schemaVersion` 4→5; new no-op `MIGRATION_STEPS` v4→v5 entry. Validator `isGroup` extended to tolerate optional `chromeTabGroupId: number | null`. `updateGroup` allow-list extended. CHANGELOG ships SW module-cache flush note (toggle OFF→ON after update).
- **Permissions**: zero added. `tabGroups` was already declared at `manifest.json:6` in a prior sprint.
- **Documents**: spec `docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md` · plan `docs/superpowers/plans/2026-05-01-chrome-tab-group-sync.md` · architecture `docs/design/67-b-041-chrome-tab-group-sync.md` (R2 + R6 As-Built) · UAT `docs/UAT_B-041.md` · findings `docs/findings/sprint-42.md`.
- **R6 deviations recorded** (As-Built §67.12.2): D-1 fix-scope test enumeration miss (b091 AC3/AC4 — third occurrence in three sprints) · D-2 `_classifyError` mock-vs-real Chrome string mismatch (caught at R4 fix-round) · D-3 ghost-timer toast architecture refactor surfaced new shared module `settings/settings-toast-timer.js`.
- **Follow-ups created**: 3 Fast-Track-XS CLAUDE.md edit candidates filed as Sprint 43 candidates (Gate 7 action items #1, #2, #3 below).

### Velocity

- Planned: 1 anchor item (B-041 — P2/M Full Tier 2)
- Completed: 1 anchor item · v1.36.0 ready and tagged
- Carried over: 0
- Pipeline duration: ~one calendar day (kickoff 2026-05-01 morning → tag/archive same evening)

### Pipeline summary

- **Brainstorm** (Q1–Q9 + reframe): 9 product-owner questions answered locking spec scope. Reframed mid-brainstorm to cover full window strip (groups + ungrouped Open Tabs) on a single Settings-page action. (Spec written + committed.)
- **Plan**: 15-task TDD-structured implementation plan, ~70 individual steps, +38 tests target. (Plan written + committed.)
- **R1**: 10 ACs locked in BACKLOG.md row · DoR-7 N/A · selector-audit N/A · 8 source-citation gate refs verified.
- **R2**: §67 chapter (~280 lines + R6 As-Built later) · 14-item C-checklist (6 PASS · 4 N/A · rest verified) · 7 spec §7 risks resolved · `chrome.tabs.move` array form confirmed via MDN.
- **R3 [frontend-engineer] subagent**: 14 task commits + 1 progress commit · 0 escalations · self-corrected b091 AC3/AC4 fix-scope miss in real time (test count after R3: 1864).
- **R4** (3 parallel reviewer subagents): 0 CRIT · 4 HIGH · ~9 MED · ~9 LOW deduped. HIGHs all converged on UX/test gaps. Cross-reviewer convergence was the value-add (3 reviewers independently flagged the `_classifyError` mock-vs-real gap and the spec §8.2 tab-gone test gap).
- **R4 fix-round subagent**: 6 fix commits (1 per HIGH/converged-MED) · +25 tests · `settings/settings-toast-timer.js` extracted as shared module · 0 regressions (test count after fix-round: 1889).
- **R5 [test-engineer] subagent**: AC1-AC10 coverage matrix (every AC has explicit PASS + FAIL test) · +3 gap-fill tests (qa-reviewer M-4 ungrouped-only window · AC9 multi-window strengthening · v4→v5 direct-migration parity) · UAT_B-041.md rewritten 15→17 cases on B-134 precedent (test count after R5: 1892).
- **R6 inline**: §67.12 As-Built · 3 deviations · 3 retro precedents flagged.
- **R7 inline**: CHANGELOG + RELEASES augmented with R4 fix-round UX additions · user-manual `docs/user-manual/settings.md` extended ~50 lines covering Chrome Integration section, color mapping table, toast variants, in-progress feedback, what's-not-in-this-version notice, reversibility note.
- **UAT**: PASS via lean smoke test in Edge (product-owner attestation: "sync with chrome looks to have worked"). Same lean-mode model as S41 close.

### Process Improvements (Gate 7 retrospective)

**What went well**:
- Spec-first → plan-first → build pipeline held cleanly. Three-document funnel (spec, plan, R2 chapter) paid for itself with a 0-escalation R3.
- R4 cross-reviewer convergence surfaced highest-impact issues. Three reviewers independently flagged the `_classifyError` gap and the tab-gone test gap.
- Subagent dispatch cadence (5 dispatches at heavy-lift rounds + inline R1/R2/R6/R7) saved ~50% tokens vs full-pipeline subagent cadence with no quality cost.
- R3 self-correction caught a R2 fix-scope miss in real time.
- Lean-mode UAT precedent held — single-user product-owner smoke test sufficient for sprint-close in this codebase.

**What to improve**:
- **Fix-scope test enumeration must include DOM-structural pins (third sprint in three).** S36 B-113 D-3 + S37 B-117 R3 + S42 B-041 D-1 — three sprints in a row of pre-existing test pins missed at R2. CLAUDE.md "Fix-scope test-assertion enumeration" subsection lists CSS-token invariants but doesn't explicitly call out structural pins like fieldset count or section order. Action item #1 below.
- **Browser-API rejection-string contract was assumed stable, wasn't.** R3 wrote tests against chrome-mock synthetic strings only; real Chrome rejection messages differ. Coverage was partly illusory until R4 fix-round caught it. Action item #2 below.
- **Multi-module shared-DOM ownership wasn't inventoried at R2.** Adding `settings-chrome-sync.js` as a second consumer of `#settings-toast` (existing consumer: `settings-import-export.js`) created a ghost-timer race that a R2 inventory would have flagged. Action item #3 below.

**Action Items for Sprint 43**:
- [ ] **B-XXX (file at S43 kickoff)** — CLAUDE.md edit: extend "Fix-scope test-assertion enumeration" subsection to explicitly include DOM-structure assertions (fieldset counts, section orders, selector enumerations) on shared surfaces. Fast-Track XS.
- [ ] **B-XXX (file at S43 kickoff)** — CLAUDE.md edit: add C-15 to R2 Correctness Checklist — "Browser-API rejection-string contract verification". Fast-Track XS.
- [ ] **B-XXX (file at S43 kickoff)** — CLAUDE.md edit: extend "Shared File Governance" subsection to require explicit "shared-surface consumer inventory" in R2 chapters touching any element with `#settings-*` / `#sidepanel-*` / `#newtab-*` / etc. Fast-Track XS.

### Final State

- **Tests**: 1,892 / 1,892 passing · zero regressions · +66 over 1,826 baseline (38 R3 build · 25 R4 fix-round · 3 R5 gap-fill)
- **Release tag**: v1.36.0 cut on `release/v2`; `gh release create` skipped
- **PR**: #47 merged to `release/v2` (merge commit `54f2852`)
- **Storage schema**: `tj:groups` v4 → v5 (lazy migration; rollback documented at §67.2.4 + §67.9 + §67.12.6)
- **Manifest permissions**: zero new permissions added
- **Sprints + hotfixes without rollback**: 19 (S23 → S42)

---

## Sprint 43 — Drag/drop + claim-drift reliability investigation (2026-05-01 → 2026-05-02)

**Theme:** Bug-investigation focus per product-owner feedback at S42 close ("we keep losing sync"). Anchor B-150 R0 spike bisected two distinct symptoms (Q1 ATTACH exception + Q2 lost-sync) and surfaced two pre-existing bugs caught during investigation, plus two scope-gap follow-ons revealed by testing.

**Release:** v1.37.0 (release/v2 only — no main merge)
**Branch:** `feature/sprint-43-claim-drift-reliability` → merged to `release/v2` via PR #48 (merge commit `785a602`)
**Tag:** `v1.37.0` (`gh release create` skipped per established pattern)

### Completed Items

#### [B-149] Drifted-claim-loss row hygiene — flipped backlog → done | 41
Stale BACKLOG row from S41 (fix shipped at `eaff700`, never marked done). Caught at S43 kickoff.

#### [B-150] Q1 — Dynamic import in SW context throws "Internal error" — ✅ DONE
- **Root cause**: `background/tabs/floating-groups.js` called `await import('../storage/partitions.js')` inside `moveFloatingTab`. Chrome/Edge SW reject dynamic import per W3C spec; chrome-mock (Node.js) accepts it so 1,892 tests passed even though every ATTACH-drag in production threw.
- **Fix**: replaced dynamic with static import. Static-scan regression test (`tests/b150-no-dynamic-import-in-sw.test.js`) catches future occurrences across `background/` + `shared/`. Empty allow-list.
- **Q2 (lost-sync)**: paused — awaits real-world repro signal. B-149's hypothesis mechanisms (a/b/d) remain open candidates.

#### [B-151] CLAUDE.md edit: fix-scope DOM-structural pins (S42 retro #1) — ✅ DONE
Extended "Fix-scope test-assertion enumeration" subsection with explicit "DOM-structure assertions on shared surfaces (fieldset counts, section orders, selector-coverage enumerations on settings/sidepanel/newtab/popup pages)" alongside the existing CSS-token-invariant precedent. Cites the third-occurrence pattern S36 B-113 D-3 + S37 B-117 R3 + S42 B-041 D-1 as blocking precedent.

#### [B-152] CLAUDE.md edit: C-15 R2 checklist for browser-API rejection-string verification (S42 retro #2) — ✅ DONE
Added C-15 entry: when error classification depends on rejection-message substrings, R2 MUST verify the actual Chrome message format via 30-second SW REPL probe; mock layers MUST emit verified format. Cites S42 B-041 R4 fix-round (`_classifyError` mock-vs-real Chrome string mismatch) as blocking precedent.

#### [B-153] CLAUDE.md edit: shared-surface consumer inventory in R2 (S42 retro #3) — ✅ DONE
Extended "Shared File Governance" with mandatory "shared-surface consumer inventory" subsection in R2 chapters that introduce new consumers of shared `#settings-*` / `#sidepanel-*` / `#newtab-*` / `#popup-*` elements OR shared module-level state. Cites S42 B-041 R4 H-2 ghost-timer race as blocking precedent.

#### [B-154] Multi-tab drag-and-drop (new feature) — ✅ DONE
- **Scope**: extend B-134's single-tab drag to support multi-select drag for ATTACH/DETACH/MOVE_FLOATING/REORDER_OPEN. REORDER_FLOATING keeps single-tab semantics (multi-tab reorder within one group is ambiguous; deferred).
- **Approach** (Approach A — sequential dispatch, product-owner approved): `_tabDragState.draggedTabIds: number[]` (always array; single = `[oneId]`). Drop fan-out per op. Partial-success accepted with insert-index bumping for contiguous landing.
- **Filter rules**: same drag-class (Open Tabs vs floating), same source window, same source group (for floating). Mixed-class / cross-window selections silently exclude non-matches.
- **Hotfixes shipped during S43**:
  - REORDER_OPEN regressed in Edge for single-tab `[tabId]` array form vs scalar — fixed by branching on length.
  - Custom drag ghost (`_buildMultiDragGhost` + `setDragImage`) rendered as Edge fallback "document with folded corner" icon. B-025 saved-bookmark multi-drag also affected. Filed B-155 follow-on; B-154 reverted to default browser ghost.
- **Tests**: `tests/b154-multi-tab-drag.test.js` (9 tests covering AC1-AC5 + 4 source-text pins + partial-success).

#### [B-155] Multi-drag count-badge ghost (Edge regression) — DEFERRED
Filed P3/TBD as follow-on. Current Edge regressed both the original B-025 UAT-8 strategy and S43's on-screen+microtask hotfix attempt: `setDragImage` with `.multi-drag-ghost` renders as a fallback icon. Investigation candidates listed in BACKLOG row (canvas image, `Image()` object, alternate stacking context, accept default ghost permanently).

#### [B-156] REORDER_OPEN drops N rows above target — ✅ DONE (pre-existing fix)
- **Pre-existing B-145 regression** caught during B-150 R0 spike instrumentation.
- **Root cause**: `_cleanupTabDragDom()` nulled `_tabDragRectCache` BEFORE the drop dispatch. By the time `_computeStripInsertIndex(state)` ran, cache was null → helper hit early-return path returning `state.pendingInsertIndex` (section-relative) instead of `target.tabIndex` (strip-absolute). For users with N saved-bookmark/floating tabs preceding Open Tabs section, dropped tabs landed N rows above target. Product-owner reported: 31 rows above (matches their precedent count).
- **Fix**: cache survives `_cleanupTabDragDom`; explicit nulling moved to drop handler `finally` block + early-return paths + dragend cancel path.
- **Tests**: `tests/b156-rect-cache-survives-drop-cleanup.test.js` (4 source-text pins).
- **Why it evaded UAT**: chrome-mock fixtures don't seed Open Tabs sections with non-zero strip offsets, so section-relative === strip-absolute in tests.

#### [B-157] Whole-group drop target for tab attach (new UX) — ✅ DONE
- **Scope**: drop an Open Tab anywhere within a group's section (header, saved-bookmark area, floating area) to attach. Pre-B-157 the zone was only the area between saved bookmarks and any nested child group — collapsed to zero-height for groups with no floating tabs and excluded the header.
- **Fix** (single line in `_buildTabDragRectCache`): zone top = `section.getBoundingClientRect().top` (was `savedRows[last].bottom` with `itemsContainer.top` fallback).
- **Behavior with the existing midline math**: drops on header / saved area place at top of floating list (insertIndex 0); drops in floating area still use position-precision; empty floating area accepts drops at position 0.
- **Saved-bookmark interleave** is acceptable per B-148 deferral — true interleave is a separate item.
- **Tests**: `tests/b157-floating-zone-expansion.test.js` (2 source-text pins).

### Velocity

- Planned: 1 P1/XL Spike-First anchor (B-150) + 3 P3/XS Fast-Track piggybacks (B-151/152/153). 4 effort units committed.
- Completed: 8 items shipped (1 anchor partial — Q1 fixed, Q2 deferred · 3 retro CLAUDE.md edits · 1 new feature B-154 · 1 new UX B-157 · 2 pre-existing fixes B-150 Q1 + B-156). 1 item filed-and-deferred (B-155).
- **9 commits** since `release/v2` from S43 (post-S42 close at `24d44fa`).
- **Test count delta**: 1892 → 1908 PASS / 0 fail (+16 net new tests across 4 new test files).
- Pipeline duration: ~1 calendar day (kickoff 2026-05-01 evening → tag 2026-05-02).

### Pipeline summary

- **R0 spike instrumentation cycle** drove B-150 + B-156 root cause identification. Two rounds of console.log instrumentation in the SW dispatcher and the sidepanel REORDER_OPEN dispatch surfaced the actual error strings + cache-null state. Both removed at fix.
- **Lean-mode bug-fix loop** continued from S42 close: skipped formal R1/R2 ceremony for the bug-fix items; product-owner smoke-test provided UAT signal at each iteration. Fast-Track XS bundle ran for the 3 retro CLAUDE.md edits.
- **Hotfix-on-hotfix discipline** held: B-154 ship → user smoke test → REORDER_OPEN regression caught → hotfix → ghost regression caught → B-155 deferred + custom ghost dropped → B-156 pre-existing bug surfaced → fix → B-157 oversight surfaced → fix → ship. Six iteration rounds; all caught at user-side smoke testing rather than R4 review.

### Process Improvements (Gate 7 retrospective)

**What went well**:
- R0 spike instrumentation was the right tool — both B-150 Q1 and B-156 needed in-flight log output to identify root cause (static analysis missed the dynamic-import-in-SW + cache-null-at-dispatch failure modes).
- Cross-reviewer-converged S42 retros (B-151/152/153) shipped same-sprint as Fast-Track XS, immediately self-applied to B-154 R3 fix-scope test enumeration update (b091-settings-page tests caught at R3 rather than R4, vindicating the precedent).
- Lean-mode bug-fix loop is converging: each ship → smoke-test → next-fix cycle averaged ~10 minutes of product-owner testing per round, faster than full R4 review cadence for bug-fix scope.

**What to improve**:
- Mock-vs-real Chromium behavior divergence keeps biting: B-150 Q1 (dynamic import), B-154 array-form `chrome.tabs.move` regression, B-155 setDragImage rendering — all worked in chrome-mock + tests but failed in real Edge. The B-152 C-15 retro action item (mandatory SW REPL probe at R2) closes one class but not all. Worth a deeper UAT pre-merge protocol — e.g., a "Edge smoke test" stage that the product-owner runs BEFORE PR merge for any tab-drag-class change. Filed as informal action item; not blocking.
- B-156 (rect-cache lifecycle) had been silently broken since B-145 shipped in v1.35.0. UAT signature was "tabs land at top after drag" but only manifests for users with non-zero offset preceding Open Tabs section. Test fixtures should seed at least one fixture with saved-bookmark claims + floating tabs preceding Open Tabs section so this class of bug is reproducible in chrome-mock.

**Action Items for Sprint 44**:
- [ ] **B-XXX (file at S44 kickoff)** — chrome-mock test fixture: seed an Open Tabs section with non-zero strip offset (5+ saved-bookmark claimed tabs + 5+ floating tabs preceding) so strip-vs-section bugs are reproducible in tests. Fast-Track XS.
- [ ] **B-XXX (file at S44 kickoff)** — Edge pre-merge smoke test protocol: documented checklist of drag/drop / setDragImage / sync paths to manually verify in real Edge before PR merge for any tab-class change. Fast-Track XS.

### Final State

- **Tests**: 1,908 / 1,908 passing · zero regressions · +82 net over pre-S42 baseline (1826)
- **Release tag**: v1.37.0 cut on `release/v2`; `gh release create` skipped
- **PR**: #48 merged to `release/v2` (merge commit `785a602`)
- **Storage schema**: unchanged from v1.36.0 (still v5)
- **Manifest permissions**: unchanged
- **Sprints + hotfixes without rollback**: 20 (S23 → S43)

---

## Sprint 44 — B-148 interleave floating tabs with saved bookmarks (2026-05-02 → 2026-05-21)

**Theme:** Promote saved-bookmark + floating-tab ordering out of the per-record `Item.sortOrder` / `FloatingGroup.sortOrder` strata and into a unified `Group.renderOrder: string[]` of prefix-encoded refs (`item:<id>` / `floating:<floatingTabId>`), so users can freely interleave the two row types within a group.
**Release:** v1.39.0 (tagged on `release/v2` at merge commit `4ddc58a` · PR #54)
**Tier:** Spike-First (XL — full R0 spike → R1 → R2 → R3 → R4 → R5 → R6 → R7)

### Completed Items

#### [B-148] Interleave floating tabs with saved bookmarks via `Group.renderOrder` — ✅ DONE
- **Tier**: Spike-First (XL)
- **Closed**: 2026-05-21
- **Pipeline**: R0 spike ✅ (atomicity confirmation, canonical owner placement, drag-dispatcher payload shape) · R1 LOCKED ✅ · R2 ✅ (`docs/design/68-b-148-interleave-render-order.md`) · R3 ✅ (15-task initial build + 10 polish/hotfix rounds) · R4 Review ✅ (close-out: 1 HIGH + 1 MEDIUM + 4 LOW; HIGH+MEDIUM fixed in `13a4956`) · R5 ✅ (2016/2016 + product-owner Edge UAT) · R6 ✅ (chapter §68) · R7 skipped (CHANGELOG + RELEASES sufficient for the in-app changes)
- **Key files** (35 changed, +3020 / -664):
  - `background/storage/shapes.js` — schema v6 → v7; `isGroup` validator extended for optional `renderOrder: string[]`
  - `background/storage/migration.js` — `KNOWN_VERSION` 6 → 7 + `defaultShape(PARTITION_META).schemaVersion` paired bump (C-1a)
  - NEW `shared/render-order.js` — pure `resolveRenderOrder(group, items, floatingMembers) → RenderRow[]`; bootstrap fallback; stale-ref silent filtering
  - `background/storage/items.js` — `createItem`, `deleteItem`, `updateItem({groupId})`, `bulkCreateItems`, `bulkDeleteItems`, `bulkReorderItems` (hotfix) all maintain `renderOrder` atomically
  - `background/tabs/floating-groups.js` — `appendFloatingGroup`, `moveFloatingTab`, `pruneFloatingGroupsByLiveTabId`, `pruneFloatingGroupsByParentItemId`, `bootstrapAndSweepRenderOrder` (cold-start)
  - `background/messages/storage-handlers.js` — `MSG_REORDER_FLOATING_MEMBERS` accepts new `{groupId, renderOrder}` payload; `commitImport` (replace mode) bootstraps `renderOrder` per imported group
  - `sidepanel/sidepanel.js` — render path consumes resolver · drag hit-test extended for mixed-type drops · multi-select REORDER_FLOATING contiguous-block · broadcast fast-path skips `renderAll` when only `renderOrder` changed · `patchFloatingMembersSections` preserves in-container positions · `window.blur` clears multi-selection
  - `newtab/newtab.js` — render path consumes resolver
  - 8 new B-148 test files + 4 deltas to existing tests + b095 deletion
- **Polish / hotfix rounds folded under the B-148 umbrella** (10, all pre-v1.39.0 ship): opener-chain inheritance anchor (`dd2ace2`) · multi-drop visual selection desync DOM-sweep (`7acdc46`) · `bulkReorderItems` Group.renderOrder fix (`f96962a`) · saved-into-floating bidirectional (`500fcc8`) · off-by-one floating-drag direction (`619477a`) · multi-drop selection Set sync (`bf3940d`) · window.blur clears selection (`0ff4ce3`) · `patchFloatingMembersSections` fast-path interleave preservation (`51f0db6`) · REORDER_FLOATING contiguous-block (`6ab19cf`) · broadcast fast-path skip (`db8f13e`)
- **R4 close-out fix-round** (commit `13a4956`): HIGH `bootstrapAndSweepRenderOrder` cold-start race (read-outside / blind-replace → derivation moved INSIDE the writeTransaction mutator); MEDIUM `floating:undefined` ref filter for pre-S38 legacy records
- **Follow-ups created** (filed during close-out, no S44 code): B-162 (P3/M Ctrl+Shift+T reopen), B-163 (P2/M drift URL fallback), B-164 (P1/M sleep/wake desync), B-165 (P2/M drop scroll preservation), B-166 (P2/S `+` CTA promote in-place)

### Velocity
- Planned: 1 XL anchor (B-148)
- Completed: 1 XL anchor shipped as v1.39.0 + 10 polish/hotfix rounds + 5 docs-only backlog filings + 2 R4 close-out fix-round mutations + retroactive `v1.38.2` tag backfill + new §68 design chapter (670 lines)
- Carried over: 0

### Retrospective

**What Went Well:**
- R0 spike correctly de-risked the largest architectural unknown (multi-partition `writeTransaction` atomicity confirmed before R3 started; zero atomicity-class regressions downstream)
- C-1a / C-1b paired-bump discipline held cleanly — schema v6 → v7 shipped with `KNOWN_VERSION` + `defaultShape` paired-bump + SW-flush note + explicit lazy migration choice (no rewrite step); zero migration-class regressions in UAT
- Product-owner UAT cadence + R3 hotfix loop converged fast — each of the 10 polish/hotfix rounds was caught + fixed without re-spec'ing the AC; iterative R3 fix-rounds proved more efficient than holding all UAT for a single review pass

**What to Improve:**
- R2 write-site enumeration miss (`bulkReorderItems`) — not in the original 15-task R3 plan; required post-UAT hotfix `f96662a`. Parallels the S42 B-041 D-1 and S37 B-117 D-3 enumeration-class precedents already in CLAUDE.md "Fix-scope test-assertion enumeration" subsection (but for code write-sites, not test assertions). Strengthen R2's enumeration discipline to cover both.
- R6 close gap on `docs/design/NN-*.md` chapter — §68 chapter was missed in the initial R6 close (no chapter existed when `299e147` cut the manifest+CHANGELOG+RELEASES for v1.39.0). Recovered at S44 close-out by [scrum-master] retroactively dispatching [solution-architect]. R6 close should produce the chapter BEFORE the version bump commit, not after.
- R4 cold-start race shipped to v1.39.0 — `bootstrapAndSweepRenderOrder` had a read-outside / blind-replace race; narrow window (cold-start only, before first user gesture) so the ship was not blocked, but the gap shows R4 reviewers should also run on the close-out PR's full diff, not just per-item diffs. Caught + fixed during close-out review.

**Action Items for Sprint 45**:
- [ ] **[scrum-master]** Enforce R6 chapter authoring BEFORE the version-bump commit. No `manifest.json` version-bump / `CHANGELOG` / `RELEASES` commits permitted until the relevant `docs/design/NN-*.md` chapter exists AND the root `docs/SOLUTION_DESIGN.md` TOC has been extended. Update CLAUDE.md "Round 6: Close" to make this ordering explicit.
- [ ] **[solution-architect]** Extend CLAUDE.md "Fix-scope test-assertion enumeration" subsection (currently scoped to test files) to ALSO cover code write-site enumeration when an R2 chapter introduces a new cross-cutting field/contract maintained at multiple write entry points (B-148's renderOrder across 12 sites is the new precedent; B-148 hotfix `f96662a` is the blocking case).
- [ ] **[code-reviewer]** Add "blind-replace mutator" anti-pattern to the R4 review checklist. Any `mutator: () => precomputed` (or `mutator: (current) => somethingElse`) that ignores the `current` snapshot inside a `writeTransaction` is a HIGH-severity race candidate for the partition being written. S44 B-148 `bootstrapAndSweepRenderOrder` is the precedent.

### Final State

- **Tests**: 2,016 / 2,016 passing · zero regressions · +86 net over pre-S44 baseline (1930)
- **Release tag**: `v1.39.0` cut on `release/v2` at merge commit `4ddc58a`; `gh release create` skipped per established pattern. Retroactive `v1.38.2` tag also backfilled at `2b93f99` during this close.
- **PR**: #54 merged to `release/v2`
- **Storage schema**: v6 → v7 (lazy migration; no eager rewrite step)
- **Manifest permissions**: unchanged from v1.38.2
- **Sprints + hotfixes without rollback**: 21 (S23 → S44)
