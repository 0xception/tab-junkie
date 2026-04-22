# Current Sprint

*Sprint 25 — Drag-stack polish + R2 checklist (B-083 + B-084 + B-085). Kickoff 2026-04-22.*

Polish sprint following Sprint 24's drag stack ship. Two UX/bug-fix follow-ups (B-083 filter helper, B-084 drop-zone visual refinement) + one process improvement (B-085 C-10 R2 Correctness Checklist addition per S24 retro HIGH action).

---

## Sprint Readiness (Gate 6) — verified at kickoff

- ✅ Scope: B-083 S + B-084 S + B-085 XS (all Fast Track tier)
- ✅ Deps-resolved check: **B-083** deps B-007 ✅, B-031 ✅ · **B-084** deps B-031 ✅ · **B-085** no deps (doc-only)
- ✅ Baseline: **1074/1074** tests green on `release/v2` (v1.18.0 shipped)
- ✅ No tier auto-upgrades triggered: none of the three items introduces new storage schema, new message types, new permissions, or drift/matching changes
- ✅ Per Fast Track tier rule, the pipeline is: **R1 (Definition) → R3 (Build) → R4 (code-reviewer + security-reviewer) → existing tests green → done**. R2, R5 (formal tests), R6 (design chapter), R7 (user docs) skipped. [qa-reviewer] skipped.

---

## Retro Action-Item Application (applied at kickoff)

Per Sprint 24 retrospective:

| # | Action | Applied to S25 |
|---|--------|----------------|
| HIGH (C-10 checklist) | Add C-10 off-screen rect feasibility probe to R2 Correctness Checklist | ✅ **B-085** — covers this item directly |
| HIGH (B-083) | Fix `filterGroupParentCandidates` multi-sibling block | ✅ **B-083** — in-sprint |
| MEDIUM (B-084) | Drag drop-zone visual refinement | ✅ **B-084** — in-sprint |
| MEDIUM (S28 inclusion) | S28 comprehensive UAT must include deferred B-032 auto-scroll | 🧊 carry to S28 |

---

## Active Items

### [B-085] Add C-10 "Off-screen rect feasibility" to R2 Correctness Checklist
- **Tier**: Fast Track (XS) — CLAUDE.md documentation edit only
- **Status**: R1 ✅ · R3 ✅ · R4 ✅ (clean — 0 findings) · ready to close
- **Assigned To**: [solution-architect] (owns the R2 Correctness Checklist per CLAUDE.md)
- **Blockers**: none
- **Feature Context**:
  - Adds a new `C-10` row to the R2 Correctness Checklist table in `CLAUDE.md` §Round 2
  - Purpose: future R2 designs that use `setDragImage` or similar browser snapshot APIs with off-screen elements must validate rect feasibility before UAT surfaces the failure
  - Precedent text cites the S24 B-025 UAT-8 failure mode (`-9999px` → zero-dim rect → broken ghost)
- **R3 Handoff Notes**:
  - Single file edit: `CLAUDE.md` §Round 2 table
  - No runtime code changes — baseline `npm test` must stay 1074/1074
  - `./build.sh` clean (CLAUDE.md is included in the zip)

### [B-083] Allow multiple sibling sub-groups under one parent
- **Tier**: Fast Track (S) — shared helper fix + targeted re-UAT
- **Status**: R1 ✅ · R3 ✅ (+6 tests — 1074 → 1080) · R4 ✅ (0 HIGH · 2 LOW deferred) · **pending user-driven re-UAT**
- **Assigned To**: [frontend-engineer]
- **Blockers**: none
- **Feature Context**:
  - `shared/group-nesting.js:47` has an over-restrictive `.filter((g) => !idsWithChildren.has(g.id))` line that excludes any parent-with-children from the valid-target set
  - Intended to prevent depth-2, but that constraint is already enforced by the `g.parentId == null` filter above it
  - Affects BOTH the B-007 group-edit dialog AND the B-031 drag-nest path (single source of truth)
- **R3 Handoff Notes**:
  - One-line deletion in `shared/group-nesting.js`
  - Update existing B-007 tests (`tests/b007-sub-group-nesting.test.js`) that may assert the old restrictive behavior
  - Add regression tests (AC3 B-007 dialog path + AC4 B-031 drag-nest path)
  - **Requires targeted re-UAT in Edge** (per user mandate): (a) B-007 dialog — Work with child Personal → edit Projects → parent picker should list Work as a valid parent option; (b) B-031 drag — drag Projects onto Work header (middle 50%) → should NEST, not reject
  - This is Fast Track tier but with a UAT checkpoint because the fix changes user-visible behavior in two shipped features

### [B-084] Refine drag drop-zone visual differentiation (REORDER vs NEST)
- **Tier**: Fast Track (S) — CSS + optional sidepanel drag logic tweak
- **Status**: R1 ✅ · R3 ✅ (Option A+C shipped — CSS polish + ±2 px hysteresis) · R4 ✅ (0 HIGH · 2 MEDIUM + 2 LOW deferred) · **pending user-driven visual UAT**
- **Assigned To**: [frontend-engineer]
- **Blockers**: none
- **Feature Context**:
  - B-031 ships with 25/50/25 zone detection — outer 25% = REORDER (horizontal line), middle 50% = NEST (target header highlight)
  - User feedback: "we may also need to come back and adjust the drag and drop visual drop zone and indicator for when we are dropping between groups vs inside of the group"
  - The visual distinction at zone boundaries can be ambiguous during fast pointer motion
- **R3 Handoff Notes**:
  - CSS-first fix likely (stronger differentiation via color/shape/label) — preferred approach per AC1 options
  - Optional: small hysteresis band at zone boundaries to reduce flicker (AC2)
  - Must preserve all B-031 UAT cases (11/11 PASS) — no behavior regression
  - Accessibility: don't rely on color alone (use shape/pattern) per AC4

---

## Pipeline Plan (waves)

Fast Track items run in parallel — no R3 sequencing required since each item touches a different file:
- **B-085** → `CLAUDE.md` only
- **B-083** → `shared/group-nesting.js` + `tests/b007-sub-group-nesting.test.js` (and maybe a new `tests/b083-*.test.js`)
- **B-084** → `sidepanel/sidepanel.css` + possibly `sidepanel/sidepanel.js`

| Wave | Round | B-085 | B-083 | B-084 |
|------|-------|-------|-------|-------|
| Wave 0 ✅ | R1 Definition | ✅ at filing | ✅ at filing | ✅ at filing |
| Wave 1 ⏳ | R3 Build | [solution-architect] ⏳ | [frontend-engineer] ⏳ | [frontend-engineer] ⏳ |
| Wave 2 | R4 Review | code-reviewer ∥ security-reviewer | code-reviewer ∥ security-reviewer | code-reviewer ∥ security-reviewer |
| Wave 3 | Re-UAT / Visual UAT | N/A (doc only) | user-driven in Edge | user-driven in Edge (optional) |
| Wave 4 | Close | Gate 4 + retro + release | | |

---

## Blockers

_None._

---

## Completed This Sprint

### [B-083] Allow multiple sibling sub-groups under one parent — DONE
- **Closed**: 2026-04-22 · Fast Track (S) · Re-UAT PASS (B-007 dialog path + B-031 drag-nest path)
- **Files**: `shared/group-nesting.js` (filter deletion + docstring update), `tests/b007-sub-group-nesting.test.js` (4 existing tests updated + 5 new B-083 sanity tests), `tests/b031-group-drag.test.js` (T-10 pair rewritten + 1 new B-083 regression test)
- **Tests**: 1074 → 1080 (+6)
- **Security verdict**: backend `assertDepthAndCycle` + `bulkReorderGroups:343-348` remain fail-closed for depth-2 + cycle rejection; B-083 removes UI pre-filter but storage layer still authoritative.

### [B-084] Refine drag drop-zone visual differentiation — DONE
- **Closed**: 2026-04-22 · Fast Track (S) · Visual UAT PASS (reorder line visually beefier with glow; nest highlight contrast stronger; hysteresis reduces boundary flicker)
- **Option shipped**: A+C — CSS polish (height 2→3 px + soft glow on reorder line; bg tint 12%→20% + inset outline on nest highlight) + ±2 px hysteresis band at 25%/75% boundaries via new pure helper `_applyGroupDragHysteresis`
- **Files**: `sidepanel/sidepanel.css` (+39 / −13), `sidepanel/sidepanel.js` (+82 / −8)
- **User note**: future UI design pass candidate tracked as B-086 (deferred to post-feature-parity)

### [B-085] Add C-10 "Off-screen rect feasibility" to R2 Correctness Checklist — DONE
- **Closed**: 2026-04-22 · Fast Track (XS) · No UAT (documentation edit)
- **Files**: `CLAUDE.md` (+1 line — C-10 row inserted in R2 Correctness Checklist table, lines ~343-351 preserved)
- **Outcome**: future R2 designs using `setDragImage` / snapshot APIs with off-screen elements now have an explicit checklist gate requiring rect-feasibility validation before UAT surfaces the failure

---

## Gate 4 — Release Checklist (verified 2026-04-22)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 CRITICAL / 0 HIGH across all three items; 2 MEDIUM + 6 LOW deferred to S26+ hygiene |
| 2 | All R5 automated tests passing | ✅ — **1080/1080** green on `feature/sprint-25-drag-polish` |
| 3 | UAT sign-off recorded | ✅ — B-083 re-UAT PASS (both paths); B-084 visual UAT PASS; B-085 N/A (doc edit) |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` chapter updates | N/A — Fast Track tier skips R6 chapter work; S26+ hygiene may revisit §38 if B-084 hysteresis merits a design-chapter note |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions; only `version` bumped 1.18.0 → 1.19.0 |
| 7 | `./build.sh` produces clean package | ✅ — verified below |
| 8 | Rollback plan documented | ✅ — all three items are surgical / data-clean: `git revert` is safe. B-083 restores the filter; B-084 reverts CSS + hysteresis; B-085 removes the row. No schema or message contract changes. |
| 9 | README / user manual / STORE_LISTING updated | ✅ — CHANGELOG [1.19.0] authored (Fixed + Changed sections); no STORE_LISTING update needed (user-visible polish, not marketable feature); user manual unchanged (drag-and-drop section added in S24 already covers the nesting UX) |
| 10 | `BACKLOG.md` — all Sprint 25 items `done` | ✅ — B-083, B-084, B-085 all `done` |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ — 86% (74/86) · 0 in-progress · S26 next |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all 3 items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 25

### Velocity

- Planned: 3 items (2 S + 1 XS) — polish sprint following S24's feature ship
- Delivered: 3 items — 100% scope
- Test growth: **1074 → 1080 (+6)** — B-083 regression suite; B-084 ships without new tests per §38.6 precedent + hysteresis testability concession
- Fix cycles: 0 (no UAT failures)
- Follow-ups filed: **B-086** — deferred UI/UX design pass post-feature-parity (user request during B-084 UAT)
- Release: **v1.19.0**

### What Went Well

1. **S24 retro action items closed at speed**. All three S24 retro items (C-10 checklist, B-083 multi-sibling fix, B-084 drop-zone visual refinement) shipped in a single sprint with zero UAT fix cycles. Demonstrates that when retro items are sized to Fast Track and the scope is well-defined, closing them in the next sprint is a low-overhead path.
2. **B-083 depth-2 security analysis was thorough**. The [security-reviewer] explicitly walked the depth-2 escape scenario through `bulkReorderGroups` + `assertDepthAndCycle` to verify the UI-filter removal didn't widen the attack surface. Result: 0 findings, clean pass. This level of rigour on a one-line fix is the right calibration for changes to shared security-load-bearing helpers.
3. **B-084 hysteresis implemented defensively**. Pure helper `_applyGroupDragHysteresis` isolated from REJECT-mode poisoning, clamped deadzone for micro-headers, state reset on dragend + target change. No UAT fix cycles despite introducing new state machine behaviour.
4. **Process improvement captured in CLAUDE.md (B-085)**. C-10 checklist item now prevents the exact S24 B-025 UAT-8 failure mode (off-screen positioning + browser snapshot APIs → zero-dim rect) from recurring. Precedent reference grepable (`B-025 UAT-8`) links forward from CLAUDE.md to §37.10 for future R2 authors.

### What to Improve

1. **LOW — Several findings deferred to S26+ hygiene pass**. B-083 L-1 (orphaned test name), L-2 (dead `outIds` variable). B-084 M-2 (side-effect in `_compute*` function), L-2 (`DEADZONE_PX` not module-level constant). These are all trivial but reflect the cumulative technical debt of Fast Track sprints. Recommend S26 or S27 include a small hygiene-pass item to absorb these.
2. **MEDIUM — B-084 shipped without new tests**. The hysteresis helper is testable but wasn't tested at R5 (consistent with §38.6 precedent that the full drag-flow fake-DOM simulation is not required). A future extraction of `_applyGroupDragHysteresis` to `shared/` would enable unit testing; not worth doing for this sprint but flag for any future changes to the hysteresis math.
3. **LOW — User flagged UI design pass as deferred concern during UAT**. Captured as B-086 with audit-first, code-second approach. Aligned with product-owner direction that UI refresh should happen once v2 features stabilise — NOT interleaved with feature work.

### Action Items for Sprint 26

- [ ] **[scrum-master]** S26 scope — resume feature-parity roadmap. B-022 L quick-search popup was scheduled for S25 but deferred to accommodate S24 retro items; now the top of the roadmap. [HIGH]
- [ ] **Hygiene items carried from S25** — B-083 L-2 dead variable + B-084 M-2/L-2 refactors — absorb into a "hygiene pass" item if bundled, or handle as drive-by during unrelated S26+ work. [LOW]
- [ ] **B-086 scheduled** as post-feature-parity (likely S29+ or after v2 stabilises). [DEFERRED]

### R4 Findings Summary (Sprint 25)

- **B-083**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 2 LOW (test-only hygiene)
- **B-084**: 0 CRITICAL / 0 HIGH / 2 MEDIUM / 2 LOW (all hygiene; no correctness concerns)
- **B-085**: 0 findings (clean CLAUDE.md edit)
- **Total**: 0 CRITICAL / 0 HIGH / 2 MEDIUM / 4 LOW — cleanest R4 since S21's polish close
- **Security posture**: backend fail-closed authority for depth/cycle preserved; no new attack surface; no new message types or permissions
- **Full dedup**: `docs/findings/sprint-25.md`

**Key lesson**: Fast Track sprints that resolve prior retro items + clear small backlog debt produce very low finding counts. Good pattern for sprints immediately after large L/M feature ships where the team benefits from tech-debt absorption.
