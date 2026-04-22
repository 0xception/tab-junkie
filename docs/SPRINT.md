# Current Sprint

*Sprint 24 — Drag stack (B-025 multi-item drag + B-031 group drag-reorder+nesting + B-032 auto-scroll). Closed 2026-04-22 with v1.18.0.*

All three items shipped. Pre-merge UAT caught two B-025 UAT failures (UAT-3 empty-group drop, UAT-8 ghost visibility) — both fixed in-sprint, UAT re-run PASS. UAT-3 fix surfaced a **latent B-030 bug** (empty-group drop was silently no-op on single-item path too) — resolved for both paths via shared fix.

---

## Sprint Readiness (Gate 6) — verified at kickoff ✅

All deps resolved ✅. Baseline 1001/1001 → final **1074/1074** (+73 tests across the three items + fix-cycle regressions).

---

## Retro Action-Item Application — all resolved

Per Sprint 23 retrospective:

| # | Action | Applied |
|---|--------|---------|
| MEDIUM-1 | R2 CSS property enumeration | ✅ B-025 §37.3 D-3 + B-031 §38.3 D-3; R4 verified; UAT-8 surfaced a missing detail (`-9999px` off-screen breaks rect) → §37.10 As Built documents the `position: fixed` + reflow fix |
| MEDIUM-2 | B-052 hashItem render-path | ✅ B-025 R2 chose explicit `renderAll` (not hashItem extension) |
| Per-item UAT plans (HIGH-2) | ✅ UAT_B-025.md (9), UAT_B-031.md (11), UAT_B-032.md (6) |
| Pre-merge UAT for L/M items (HIGH-3) | ✅ B-031 11/11 PASS first pass · B-025 9/9 PASS after 2 fix cycles · B-032 deferred per Fast Track |
| B-031 filterGroupParentCandidates reuse (S22 LOW) | ✅ single source of truth; R4 verified no parallel filter logic |

---

## Completed This Sprint

### [B-025] Multi-item drag as single unit — DONE
- **Tier**: Full (M) · **Status**: Shipped v1.18.0
- **Pipeline**: R1 ✅ · R2 ✅ · R3 ✅ · R4 ✅ (3 HIGH fixed) · R5 ✅ (+29 tests) · UAT 9/9 PASS (after UAT-3 + UAT-8 fix cycle) · R6 ✅ (§37.10 As Built)
- **Files**: `shared/messages.js` (JSDoc ext), `shared/sort-order.js` (+`computeMultiItemReorder`), `sidepanel/sidepanel.{js,css}`, `tests/sort-order.test.js` (+14), `tests/b025-multi-item-drag.test.js` (new, +15+5)
- **UAT fixes** (post-UAT-FAIL): ghost positioning (`position: fixed` + reflow), empty-group drop path (`{type:'emptyGroup', destGroupId}` branch — benefits B-030 too)

### [B-031] Group drag-reorder + nesting via drag — DONE
- **Tier**: Full (M) · **Status**: Shipped v1.18.0
- **Pipeline**: R1 ✅ · R2 ✅ · R3 ✅ · R4 ✅ (4 HIGH + M-1 fixed) · R5 ✅ (+39 tests) · UAT 11/11 PASS · R6 ✅ (§38.10 As Built)
- **Files**: `shared/messages.js` (+MSG_BULK_REORDER_GROUPS), `shared/sort-order.js` (+`computeGroupReorder`), `background/storage/groups.js` (+`bulkReorderGroups`), `background/storage/{index.js,messages/storage-handlers.js}`, `sidepanel/sidepanel.{js,css}`, `tests/b031-group-drag.test.js` (new)

### [B-032] Auto-scroll during drag — DONE
- **Tier**: Fast Track (S) · **Status**: Shipped v1.18.0
- **Pipeline**: R1 ✅ · R2 skipped · R3 ✅ · R4 ✅ (0 CRITICAL/HIGH) · R5 ✅ (+17 tests) · UAT deferred to S28 per Fast Track tier rule
- **Files**: `sidepanel/sidepanel.js` (~60 lines — `_maybeAutoScroll` helper + integration), `tests/b032-auto-scroll.test.js` (new)

---

## Gate 4 — Release Checklist (verified 2026-04-22)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 CRITICAL / 7 HIGH (3 B-025 + 4 B-031) all fixed pre-R5 · MEDIUMs triaged |
| 2 | All R5 automated tests passing | ✅ — **1074/1074** green on `release/v2` (1001 baseline + 73 new) |
| 3 | UAT sign-off recorded | ✅ — B-031 11/11 · B-025 9/9 (post-fix) · B-032 Fast Track (existing-suite-only) |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` slices updated | ✅ — §37.10 + §38.10 As Built · §36.11 cross-sprint amendment · §36.12 B-032 Fast Track note · root index labels flipped to R6 Close |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions |
| 7 | `./build.sh` produces clean package | ✅ — 228 K zip, 67 files |
| 8 | Rollback plan documented | ✅ — §37.8 (B-025) + §38.8 (B-031) + §36.11 (bonus B-030 fix) all document `git revert` is data-clean |
| 9 | README / user manual / STORE_LISTING updated | ✅ — CHANGELOG [1.18.0] · STORE_LISTING bullets · `docs/user-manual/managing-items.md` new "Drag and drop" section |
| 10 | `BACKLOG.md` — all Sprint 24 items `done` | ✅ (71/84) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ (85% · 0 in-progress · Sprint 24 closed) |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all 3 items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 24

### Velocity

- Planned: 3 items (2M + 1S)
- Delivered: 3 items — 100% of scope
- Test growth: **1001 → 1074 (+73 tests)** across three items
- UAT rounds: B-031 = 1 (PASS first pass) · B-025 = 2 (9/9 PASS after UAT-3 + UAT-8 fix cycle) · B-032 = 0 (Fast Track deferred)
- Follow-ups filed: B-083 (multi-sibling sub-group allow), B-084 (drag drop-zone visual refinement)
- Release: **v1.18.0**

### What Went Well

1. **R2 decision resolution discipline paid off**. Both Full-tier items (B-025, B-031) had 5–6 explicit R1→R2 decision points captured in SPRINT.md handoff notes. R2 [solution-architect] resolved every one with alternatives + rationale + blast radius. R3 built against a clear spec; R4 reviewed against a measurable bar; R6 close documented deviations in As Built sections. Zero drift between spec and build beyond the three deliberate deviations (token mapping, browser-default group ghost, post-UAT ghost positioning fix).
2. **Pre-merge UAT discipline (S23 retro HIGH-3) caught real bugs twice**. UAT-3 empty-group drop and UAT-8 ghost visibility would have shipped silently without HIGH-3's merge-gate requirement. Net 2 blockers caught pre-merge across both L/M items — exactly the failure mode retro was designed to prevent. **Validated HIGH-3 retroactively** just as S23 validated it for B-030.
3. **Cross-sprint bug fix as bonus win**. UAT-3 surfaced a latent B-030 empty-group drop bug (single-item path had same silent no-op). Fix applied to both paths via a shared `{type:'emptyGroup'}` branch in `_computeDropTarget`. §36.11 amendment documents the cross-sprint scope. Net: one sprint shipped three features AND closed a latent v1.17.0 defect.
4. **Parallel pipeline execution optimisation**. R3 build was sequenced (B-031 → B-032 → B-025) to avoid sidepanel merge conflicts, but R4 reviews + R5 tests + subsequent R3s ran in parallel waves. Total wall-clock for the automated pipeline was ~2 hours — the user-driven UAT + two B-025 fix cycles were the critical path.

### What to Improve

1. **HIGH — R2 CSS enumeration needs a layout-completion probe**. B-025 §37.3 D-3 enumerated every CSS property for the ghost, but the `-9999px` off-screen positioning pattern was not validated against the `getBoundingClientRect`-before-layout-flush gotcha. Result: UAT-8 FAIL on first try. Fix shipped as `position: fixed` + forced reflow. For S25+ drag or off-screen-element work: R2 MUST include an "offscreen-element rect feasibility" probe when a design uses `setDragImage` / snapshot APIs. Add to R2 Correctness Checklist as **C-10**: "If the design uses off-screen positioning + a browser snapshot/measurement API, verify the element has a real computed rect at snapshot time (document the reflow / positioning strategy)."
2. **MEDIUM — `filterGroupParentCandidates` over-restrictive filter slipped from B-007 to B-031**. The one-line filter at `shared/group-nesting.js:47` excludes any parent-with-children from the valid-target set, blocking multiple sibling sub-groups under one parent. This is arguably the wrong product requirement and was inherited unreviewed from B-007 (shipped in S20). B-031 UAT caught it as a usability complaint but all 11 B-031 UAT cases still PASSED because the cases tested simpler scenarios. Tracked as B-083 for S25.
3. **LOW — Drop-zone visual clarity is a known UX polish gap**. User flagged during UAT: "we may also need to come back and adjust the drag and drop visual drop zone and indicator for when we are dropping between groups vs inside of the group." Tracked as B-084 for S25.

### Action Items for Sprint 25

- [ ] **[solution-architect]** Add C-10 to R2 Correctness Checklist in CLAUDE.md: "Off-screen rect feasibility" probe for designs using `setDragImage` / snapshot APIs. [HIGH]
- [ ] **B-083 prioritised** — fix `filterGroupParentCandidates` to allow multiple siblings under one parent. P1 · S. Affects both B-007 dialog and B-031 drag-nest. Needs re-UAT for both paths. [HIGH]
- [ ] **B-084 scheduled** — drag drop-zone visual differentiation (REORDER vs NEST). P2 · S. [MEDIUM]
- [ ] **[scrum-master]** In S28 comprehensive UAT sweep, include B-032 auto-scroll cases (deferred per Fast Track tier). [MEDIUM]

### R4 Findings Summary (Sprint 24)

- **B-025**: 0 CRITICAL / 3 HIGH (all fixed) / 4 MEDIUM (1 fixed M-1 selection clear; 3 deferred) / 7 LOW
- **B-031**: 0 CRITICAL / 4 HIGH (all fixed) / 6 MEDIUM (1 fixed M-1 title copy; 5 deferred) / 7 LOW
- **B-032**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (deferred) / 2 LOW
- **UAT layer**: 2 blockers caught pre-merge on B-025 (UAT-3 + UAT-8) — both resolved in-sprint
- **Full dedup**: `docs/findings/sprint-24.md`

**Key lesson**: R4 + R5 clean does NOT mean UAT will pass. For L/M runtime-sensitive items, pre-merge UAT in-browser remains load-bearing (third sprint to validate this — S22 → S23 → S24).

---

## Sprint Close

**Status**: CLOSED 2026-04-22. v1.18.0 release pending commit + tag + archive.

### Follow-on for Sprint 25

S25 scope candidates (per action items):
- **B-083** (P1 · S) — `filterGroupParentCandidates` fix (multi-sibling sub-group allow)
- **B-084** (P2 · S) — drag drop-zone visual refinement
- **[solution-architect]** — CLAUDE.md C-10 checklist addition
- Plus normal backlog triage (11 remaining To-Do items + filed follow-ups)
