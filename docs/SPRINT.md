# Current Sprint

*Sprint 20 — Sprint 19 retro action items + polish-debt burndown + sub-group nesting + UAT burndown track. Kicked off 2026-04-20.*

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved by product owner: B-071 + B-072 + B-073 + B-074 + B-075 + B-007 (plus parallel UAT burndown track)
- ✅ Total effort: 5 XS + 1 M — matches Sprints 17/18/19 cadence
- ✅ **Deps-resolved check (NEW — Sprint 19 retro HIGH action item, applied as house rule for Sprint 20 ahead of B-071 landing)**:
  - **B-071** (Gate 6 deps check codified in CLAUDE.md): no code deps ✅
  - **B-072** (AC template destructive-action retention clause in CLAUDE.md): no code deps ✅
  - **B-073** (Backfill C-6 + C-7 in R2 Correctness Checklist): no code deps ✅
  - **B-074** (Remove pre-existing `TODO(sprint-19+)` in `background/import/json-validator.js:531`): no blocking deps ✅
  - **B-075** (Convert B-052 `byId` Map → frozen plain object): B-052 done (Sprint 19 `b727979`) ✅
  - **B-007** (Sub-group nesting depth = 1): B-001 done (Sprint 1) ✅, B-006 done (Sprint 4) ✅
- ✅ Sprint 19 closed 2026-04-19; v1.14.0 tag on `release/v2`; archive commit `5f9dac5`
- ⚠️ Carry-over from Sprint 19: **8 deferred UAT plans** (~180 cases, ~46% of full sweep). Sprint 19 retro HIGH action item mandated a Sprint 20 burndown window — see UAT Burndown Track below.

---

## UAT Burndown Track (Parallel, User-Executed)

Running alongside the pipeline — not on the critical path of any sprint item. Target: **≥ 4 of 8 plans PASS** before sprint close (Sprint 19 retro HIGH action item).

| Plan | Item | Est. cases | Status |
|------|------|-----------|--------|
| `docs/UAT_B-042.md` | Export HTML | ~14 | pending |
| `docs/UAT_B-043.md` | Export JSON | ~15 | pending |
| `docs/UAT_B-048.md` | Item visual states | ~? | pending |
| `docs/UAT_B-029.md` | Group picker modal | ~? | pending |
| `docs/UAT_B-059.md` | Allow duplicate URLs | ~? | pending |
| `docs/UAT_B-044.md` | Import HTML | 29 | pending |
| `docs/UAT_B-045.md` | Import JSON | 30 | pending |
| `docs/UAT_B-052.md` | Fuzzy search perf | 15 | pending |

Each plan has PASS/FAIL/WARN/SKIP columns pre-laid for the user. Gate 3 sign-off for `release/v2` → `main` requires the full 8-plan sweep (not blocked by Sprint 20; informational marker).

---

## Active Items

*(all 6 items moved to "Completed This Sprint" below — Sprint 20 closed 2026-04-20)*

---

## Completed This Sprint

### [B-007] Sub-group nesting (depth = 1) — DONE (Wave 2)
- **Tier**: Full (M)
- **Merged**: `0993189` on `release/v2` (PR #24, 2026-04-20)
- **Files Changed**: NEW `shared/group-nesting.js` (pure helpers: `filterGroupParentCandidates` + `translateGroupError`), `sidepanel/sidepanel.html` (parent picker `<select>` in `#group-dialog`), `sidepanel/sidepanel.js` (+dialog population, +parentId threading on create/update, +error translation), `sidepanel/sidepanel.css` (`--group-indent: 20px` token + `.group-section--child` padding-left), NEW `tests/b007-sub-group-nesting.test.js` (+13 tests), NEW `docs/design/35-b-007-sub-group-nesting.md` (R6 chapter), `docs/SOLUTION_DESIGN.md` (index TOC extended), NEW `docs/UAT_B-007.md` (18 cases, DEFERRED), `CHANGELOG.md` [Unreleased] § Added
- **R1**: 15 refined PASS/FAIL ACs + AC15 explicitly applies the new Sprint 20 Wave 0 DoR item 7 (destructive-action confirmation is retained via existing B-027 delete-group confirm; re-parenting itself is reversible — no new confirmation dialog needed).
- **R2**: First Full-tier R2 under Sprint 20's **new C-6 + C-7** (permission minimization + allow-list direction) — both PASS/NA. C-8 + C-9 (from Sprint 19) also covered. §35.2 checklist table.
- **R4**: [code-reviewer] PASS (B-065 extraction precedent), [security-reviewer] PASS (zero new perms, no new message fields, textContent-only on user strings), [qa-reviewer] PASS (C-9 empty states enumerated + U17).
- **R5**: 13 new tests — exceeds AC13 target (≥ 961). Total 955 → 968 green.
- **R6**: §35 new chapter with §35.4 empty-state enumeration + §35.5 rollback (pure git revert — no schema change) + §35.6 D-1..D-3 deviations table.
- **R7**: CHANGELOG added + UAT_B-007.md plan filed. STORE_LISTING's drag-nest line is future-facing B-031 copy, left unchanged (non-regression).
- **Scope**: UI-only — zero manifest / messages / errors / schema / SW / background drift. Drag-to-nest remains B-031 territory.

### [B-075] Convert B-052 `byId` Map → frozen plain object — DONE (Wave 1)
- **Tier**: Fast Track (XS)
- **Merged**: `a488c90` on `release/v2` (PR #23, 2026-04-20)
- **Files Changed**: `sidepanel/search-index.js` (Map → frozen `{}` + `Object.freeze` in `buildIndex` + `makeIndex` + structural-share spread in `diffAndPatch`; header docstring + JSDoc `Readonly<Record>` types updated), `sidepanel/sidepanel.js` (one `.get()` → `[id]`), `tests/b052-fuzzy-search-perf.test.js` (~10 call sites migrated + R4 Fix #2 mutation-contract test rewritten for B-075 semantics)
- **R4**: [code-reviewer] PASS (grep-clean migration), [security-reviewer] PASS (internal data structure; zero storage/message drift)
- **Test suite**: 955/955 unchanged (all B-052 perf assertions still green on deterministic seed → AC3/AC4 perf parity held)
- **Scope**: internal to sidepanel/search-index module + 1 external reader + tests. Zero manifest / messages / errors drift.

### [B-074] Remove pre-existing `TODO(sprint-19+)` from json-validator.js — DONE (Wave 1)
- **Tier**: Fast Track (XS)
- **Merged**: `a488c90` on `release/v2` (PR #23, 2026-04-20)
- **Files Changed**: `background/import/json-validator.js` (TODO replaced with non-TODO reference comment pointing at B-076 + §33.18 F-4), `docs/BACKLOG.md` (new B-076 row added as future-work placeholder)
- **R4**: [code-reviewer] PASS (grep-clean: `grep -rn 'TODO(sprint' background/` returns zero matches), [security-reviewer] PASS (comment-only edit)
- **Test suite**: 955/955 unchanged (no semantic code change; just comment + backlog row)
- **Decision**: chose AC1 option (b) — file new backlog item (B-076) + replace TODO with reference comment. Not option (a) inline because implementing the MIGRATION_STEPS hook without a real migration step is YAGNI.

### [B-073] Backfill C-6 + C-7 slots in R2 Correctness Checklist — DONE (Wave 0)
- **Tier**: Fast Track (XS)
- **Merged**: `c2154c9` on `release/v2` (PR #22, 2026-04-20)
- **Files Changed**: `CLAUDE.md` (+2 R2 Correctness Checklist rows C-6 + C-7), `CHANGELOG.md` Process breadcrumb
- **R4**: [code-reviewer] smoke PASS (exact-text ACs matched, C-1..C-5 untouched, C-8+C-9 preserved), [security-reviewer] no-op gate protector PASS
- **Test suite**: 955/955 unchanged (docs-only)
- **Scope**: zero code / manifest / test drift

### [B-072] AC template — destructive-action confirmation clause — DONE (Wave 0)
- **Tier**: Fast Track (XS)
- **Merged**: `c2154c9` on `release/v2` (PR #22, 2026-04-20)
- **Files Changed**: `CLAUDE.md` (+1 DoR item 7), `CHANGELOG.md` Process breadcrumb
- **R4**: [code-reviewer] smoke PASS, [security-reviewer] no-op gate protector PASS
- **Scope**: Sprint 19 retro MEDIUM action item; addresses B-070 AC1 literal-reading silent-waiver risk.

### [B-071] Extend Gate 6 Sprint Readiness with deps-resolved check — DONE (Wave 0)
- **Tier**: Fast Track (XS)
- **Merged**: `c2154c9` on `release/v2` (PR #22, 2026-04-20)
- **Files Changed**: `CLAUDE.md` (+1 Gate 6 bullet), `CHANGELOG.md` Process breadcrumb
- **R4**: [code-reviewer] smoke PASS, [security-reviewer] no-op gate protector PASS
- **Scope**: Sprint 19 retro HIGH action item; deps check applied as house rule for Sprint 20 itself (all 6 items passed).

---

## Planned Pipeline Parallelization

- **R1 [product-manager]**:
  - **B-071, B-072, B-073, B-074, B-075** — PRE-APPROVED (scope + ACs are concrete from SPRINT.md descriptions; meta-items and polish items don't benefit from R1 rubber-stamp).
  - **B-007** — R1 REQUIRED. Current BACKLOG.md ACs are concept-level ("Sub-groups can be created by setting a parent during group creation or by drag-nesting…") — need PASS/FAIL per criterion per B-003/B-006 precedent.
- **R2 [solution-architect]**: **B-007 only.** Exercises new C-6 + C-7 (after B-073 lands) + C-8 + C-9 checks.
- **R3 sequencing**:
  1. **Wave 0 — B-071 + B-072 + B-073** (batched CLAUDE.md edits, one commit): [scrum-master] + [product-manager] + [solution-architect] co-edit. Must merge before B-007 R2.
  2. **Wave 1 — B-074 + B-075** ([frontend-engineer], parallel Fast Track): independent file touches, no shared state.
  3. **Wave 2 — B-007** ([frontend-engineer]): after R1 + R2 complete.
- **R4** per item:
  - **B-071 / B-072 / B-073**: [code-reviewer] smoke check (CLAUDE.md edits only) + [security-reviewer] no-op gate protector. [qa-reviewer] skipped (Fast Track, docs-only).
  - **B-074 / B-075**: [code-reviewer] + [security-reviewer] parallel (Fast Track).
  - **B-007**: [code-reviewer] + [security-reviewer] + [qa-reviewer] (3 parallel — Full tier).
- **R5** B-007 only (Full tier). Wave 0 + Wave 1 on Fast Track rely on existing suite + `./build.sh` staying green.
- **R6** [solution-architect] covers B-007 — update `docs/design/05-groups.md` (or add new chapter) with as-shipped nesting behavior.
- **R7** [technical-writer] covers user-visible nesting — update `README.md` + `docs/user-manual/` + `CHANGELOG.md`.

### Cross-Item Parallelization (per CLAUDE.md P-1/P-2/P-3)

- P-1 Max one L/XL active: ✅ zero L/XL items in Sprint 20.
- P-2 S/XS pair with anything: ✅ B-071 + B-072 + B-073 + B-074 + B-075 are all XS.
- P-3 Max two M in parallel: ✅ only B-007 is M; no conflict.
- P-4 Interleave, don't overlap: Waves 0 → 1 → 2 sequential. B-007 R1 may run in parallel with Wave 0 build to maximize throughput, but R2 waits until B-073 lands so the C-6/C-7 rows are active.

---

## Sprint 20 Goals (Definition of Success)

1. Sprint 19 retro action items HIGH + MEDIUM all land as codified CLAUDE.md changes (B-071 + B-072 + B-073).
2. Pre-existing `TODO(sprint-19+)` in `background/import/json-validator.js` removed — no-TODO rule compliance restored (B-074).
3. B-052 `byId` Map restructure per §34.14 D-1 (B-075).
4. Sub-group nesting shipped at depth = 1 with full R4 review + R5 test + UAT (B-007). Unblocks B-009 + B-031 downstream.
5. UAT burndown: ≥ 4 of 8 deferred plans PASS before close.
6. v1.15.0 ships with 6 items merged to `release/v2`.

---

## Scope Change Log

*(none yet)*

---

---

## Gate 4 — Release Checklist (verified 2026-04-20)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved (no open CRITICAL/HIGH) | ✅ — zero findings this sprint; 5 Fast-Track-XS items + 1 Full M, all smoke-checks PASS |
| 2 | All R5 automated tests passing | ✅ — **968/968 green** on `release/v2` (post-B-007 merge `0993189`) |
| 3 | UAT sign-off recorded | ⏳ DEFERRED — 9 UAT plans now carrying (previous 8 + B-007). Scheduled for Sprint 21 burndown per Sprint 20 retro action item carry-over. |
| 4 | No open blockers in `SPRINT.md` | ✅ |
| 5 | `docs/design/*` slices updated | ✅ — §35 authored for B-007. SOLUTION_DESIGN index TOC extended. |
| 6 | `manifest.json` permissions reviewed | ✅ — **zero additions** across all 6 Sprint 20 items (C-6 check passed) |
| 7 | `./build.sh` produces clean package | ✅ — 599 K zip, 66 files (post-B-007) |
| 8 | Rollback plan documented | ✅ — B-007 §35.5 (pure git revert, no schema change); B-074/B-075 internal refactors (git revert); B-071/B-072/B-073 docs-only (git revert) |
| 9 | README / user manual updated | ✅ — CHANGELOG [Unreleased] updated for B-007. STORE_LISTING unchanged (drag-nest line already aspirational for B-031). No user-manual slice touched. |
| 10 | `BACKLOG.md` — all Sprint 20 items `done` | ✅ (60/77, plus B-076 added as future-work backlog) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ (78%, 0 in progress, Sprint 20 closed) |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all 6 items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated with Sprint 20 entries | ⏳ — pending post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive step.

---

## Sprint Retrospective — Sprint 20

### Velocity

- **Planned (kickoff)**: 6 items — B-071 (XS), B-072 (XS), B-073 (XS), B-074 (XS), B-075 (XS), B-007 (M). Total: 1M + 5XS.
- **Completed**: 6 items / 1M + 5XS = 100% of scope.
- **Carried over**: 0 items.
- **Test suite growth**: 955 → 968 (+13 — all in B-007).
- **New backlog items filed**: B-076 (deferred migration-hook work, future-work placeholder).

### What Went Well

1. **Sprint 20 retro action items ALL landed this sprint.** The usual "we'll catch that next sprint" drift was avoided. Gate 6 deps-resolved check (B-071), DoR destructive-action clause (B-072), and C-6/C-7 backfill (B-073) are all live and were exercised by the same sprint's B-007 R2 — a one-sprint feedback loop.
2. **B-007 scope discovery saved ~60% of estimated effort.** Initial M-sized estimate assumed fresh storage-layer work. Reading `background/storage/groups.js` at R2 revealed B-001a already shipped depth-1 + cycle + cascade enforcement. Scope collapsed to UI-only. Lesson: always read the storage layer before estimating "nesting" features.
3. **Pre-existing rendering infrastructure did half the B-007 work.** `buildGroupSection(..., isChild)` already nested child groups inside parent `.group-items` containers. `.group-section--child` already had `padding-left: 20px`. Only the parent picker, error translation, and token refactor were genuinely new code.
4. **Polish queue burndown cleared 2 LOW findings before they accreted further.** B-074 (pre-existing TODO) and B-075 (Sprint 19 §34.14 D-1) would have lingered indefinitely without a scheduled window. Fast-Track XS is the right size for this kind of debt.

### What to Improve

1. **B-007 ACs needed R1 refinement mid-sprint.** Backlog ACs were concept-level; PM output (15 PASS/FAIL ACs) required a dedicated pass. Consider adding a pre-sprint triage step: for every M/L item, a 15-minute "AC health check" before kickoff — flag concept-level ACs for pre-sprint refinement instead of in-sprint.
2. **UAT debt continues to grow.** 8 → 9 plans DEFERRED this sprint (B-007 joined the queue). Sprint 19 retro flagged this HIGH and Sprint 20 kickoff committed to a burndown window — it didn't happen. Sprint 21 must NOT plan a forward feature until UAT burndown is scheduled as a first-class item, not a side track.
3. **B-072's new DoR item 7 (destructive-action confirmation) was applied reactively in B-007 AC15 rather than as a template.** R1 output would benefit from a literal "DoR Gate 7" subsection that every new AC block fills in explicitly (even if the answer is "N/A — not a destructive surface"). Forces the check to happen at authoring time.

### Action Items for Sprint 21

- [ ] **Sprint 21 MUST treat UAT burndown as a first-class sprint item** (not a parallel track). Allocate dedicated budget for user-executed burndown of ≥ 4 plans. If that commitment can't be met, do not plan a forward feature. [HIGH — prevents a third consecutive UAT-debt growth sprint]
- [ ] **[product-manager]** — Add a "DoR Gate 7 check" subsection to the R1 AC template: every AC block explicitly states "destructive-action confirmation: retained / waived / N/A (not destructive)" up front, not buried in an edge-case AC. [MEDIUM]
- [ ] **[scrum-master]** — For every M/L item in sprint planning, spend ≥ 15 minutes pre-sprint verifying the BACKLOG.md ACs are PASS/FAIL-level. If they're concept-level (e.g. B-007 at kickoff), add a dedicated pre-kickoff R1 step to refine BEFORE Gate 6. [MEDIUM]

### R4 Findings Summary (Sprint 20)

- **B-071 / B-072 / B-073**: 0 findings (docs-only smoke-checks)
- **B-074**: 0 must-fix; decided AC1 option (b) — filed B-076 as deferral.
- **B-075**: 0 must-fix; one design clarification inline (freeze at makeIndex rather than callsite — chose for single freeze site)
- **B-007**: 0 must-fix; all three reviewers PASS at smoke-check (code-reviewer = B-065 pattern compliance; security-reviewer = zero perm/message drift; qa-reviewer = C-9 enumerated, keyboard a11y inherited)
- **Total**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW. Cleanest-R4 sprint since B-068 split work in Sprint 18.

---

## Sprint Close

**Status**: CLOSED 2026-04-20. v1.15.0 release pending [release-manager] execution.

### Follow-on polish items for Sprint 21 triage

1. **UAT burndown (MANDATORY first-class item)** — 9 DEFERRED plans at ~195 cases.
2. B-031 Group drag-reorder + nesting-via-drag (unblocked by B-007 rendering scaffold + B-007 `filterGroupParentCandidates` helper; dialog path + drag path share the same depth-1 / cycle / children-of exclusions).
3. B-076 deferred migration-hook — remains `backlog` until MIGRATION_STEPS ships first non-empty entry.
4. B-046 Global keyboard shortcuts — still blocked on B-022 + B-035.
5. B-070 Sprint 19 LOWs: `breakCycles` adversarial-input hardening; query-length cap on filter input; repair-summary plain-language extended pass.

## Status: CLOSED 2026-04-20 · v1.15.0 pending [release-manager]
