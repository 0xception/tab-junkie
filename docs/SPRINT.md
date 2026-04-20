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

### [B-071] Extend Gate 6 Sprint Readiness with deps-resolved check
- **Tier**: Fast Track (XS)
- **Status**: backlog → in-progress (Wave 0)
- **Assigned To**: [scrum-master] (R3 build — CLAUDE.md edit)
- **Blockers**: None
- **Feature Context**: Sprint 19 retro HIGH. Prevents mid-sprint deferrals (B-046 Sprint 19 style) by making the Gate 6 check explicit. Adds a new bullet to the Gate 6 block in `CLAUDE.md` enumerating: "For every in-scope item, verify each dependency in BACKLOG.md `Dependencies` column is either `done` OR also in this sprint. If any dep is `backlog`, flag for product-owner triage before kickoff."
- **Handoff Notes**: Batch with B-072 + B-073 in a single Wave 0 commit + single R4 smoke-check.

### [B-072] AC template — destructive-action confirmation clause
- **Tier**: Fast Track (XS)
- **Status**: backlog → in-progress (Wave 0)
- **Assigned To**: [product-manager] (R3 build — CLAUDE.md edit)
- **Blockers**: None
- **Feature Context**: Sprint 19 retro MEDIUM. B-070 AC1 "proceed with commit" nearly shipped a silent destructive-action waiver — literal reading skipped the confirmation dialog; R4 caught the HIGH inline. Future ACs for carved-out edge cases (prefs-only, zero-match, partial-input) MUST explicitly state whether destructive-action confirmation is retained or waived, with rationale. Adds a new bullet to the Definition of Ready section in `CLAUDE.md`.
- **Handoff Notes**: Batch with B-071 + B-073.

### [B-073] Backfill C-6 + C-7 slots in R2 Correctness Checklist
- **Tier**: Fast Track (XS)
- **Status**: backlog → in-progress (Wave 0)
- **Assigned To**: [solution-architect] (R3 build — CLAUDE.md edit)
- **Blockers**: None
- **Feature Context**: B-069 (Sprint 19) appended C-8 + C-9 leaving a numbering gap — Sprint 17 retro's aspirational "C-7 allow-list direction check" was never codified, and C-6 slot was similarly aspirational. Close the gap by writing both rows based on the Sprint 17 retro intent: C-6 covers permission-minimization review; C-7 covers allow-list direction (outputs prefer allow-lists over deny-lists per B-067 Sprint 18 precedent).
- **Handoff Notes**: Batch with B-071 + B-072.

### [B-074] Remove pre-existing `TODO(sprint-19+)` from `background/import/json-validator.js`
- **Tier**: Fast Track (XS)
- **Status**: backlog → in-progress (Wave 1)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None
- **Feature Context**: Pre-existing `TODO(sprint-19+)` at `background/import/json-validator.js:531` flagged by [code-reviewer] in Sprint 19 B-060 R4 as violating the CLAUDE.md "no TODOs" rule. Either resolve the underlying concern (adversarial-input hardening on `breakCycles`, filed as a separate sibling item) or strip the TODO and replace with an intentional no-op (or Enforce + Test if the concern is real). R3 must decide which path based on file inspection.
- **Handoff Notes**: Can run in parallel with B-075 and with B-007 R1.

### [B-075] Convert B-052 `byId` Map → frozen plain object
- **Tier**: Fast Track (XS)
- **Status**: backlog → in-progress (Wave 1)
- **Assigned To**: [frontend-engineer]
- **Blockers**: None
- **Feature Context**: Sprint 19 B-052 R4 [code-reviewer] MEDIUM finding — current `byId` is a `new Map()` where every consumer needs `.get(id)`. §34.14 D-1 decision was to restructure to a frozen plain object `Object.freeze({ ...byId })` for simpler property access + structural sharing. Fast Track XS — 1 file touch plus 2-3 call sites.
- **Handoff Notes**: Can run in parallel with B-074 and with B-007 R1.

### [B-007] Sub-group nesting (depth = 1)
- **Tier**: Full (M)
- **Status**: backlog → in-progress (Wave 2)
- **Assigned To**: [product-manager] (R1 AC refinement — current backlog ACs are concept-level, not PASS/FAIL testable)
- **Blockers**: None
- **Feature Context**: Phase A foundation item. Enables users to nest a group one level deep into a parent group. Storage schema already supports `parentId` (B-001a AC4 validates the depth cap at write time). B-007 adds the UI affordance (create-with-parent in dialog + drag-to-nest), the depth-cap user-facing error, sub-group indentation in the tree, and the delete-parent → promote-children cascade.
- **Handoff Notes**:
  - **C-8 check**: no new SW-context browser APIs expected — all drag logic runs in sidepanel. R2 to confirm.
  - **C-9 check**: enumerate empty states (zero child groups, zero items in sub-group, drag over already-nested group, drag a group onto itself, drag a group onto its own child).
  - **Schema impact**: `parentId` field on Group records is already validated by B-001a; no new schema fields or migration. R2 to re-verify.
  - **Unblocks downstream**: B-009 (drag-to-expand collapsed group), B-031 (group drag-reorder & nesting via drag) — both `⬜` in Sprint 1 list.

---

## Completed This Sprint

*(none yet — sprint just kicked off)*

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

## Status: ACTIVE — Wave 0 starting
