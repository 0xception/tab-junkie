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
