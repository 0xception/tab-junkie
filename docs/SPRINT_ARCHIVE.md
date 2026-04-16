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
