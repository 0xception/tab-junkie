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
