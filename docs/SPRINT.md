# Current Sprint

**Sprint 41 — Floating-tab data-model evolution (kicked off 2026-04-30)**

Seven-item sprint: 1 P1 anchor (B-137 schema v3→v4 migration adopting `floatingTabId` as primary live-tab join key) + 6 Fast Track XS piggybacks (B-138 cleanup + B-139/B-140/B-141/B-142/B-143 CLAUDE.md gate edits — 4 new retro action items filed at kickoff).

- **Branch**: `feature/sprint-41-floating-tab-id` off `release/v2` (post-v1.34.1 hotfix at `e60eab6`)
- **Target version**: v1.35.0 (release/v2 only — no main merge per established pattern)
- **Test baseline at kickoff**: 1,782/1,782
- **Anchor**: B-137 (P1/M Full · subsumes B-131; structurally eliminates Issues 2+3 from post-S40 spike)
- **Wave 1**: B-138 + B-139 + B-140 + B-141 + B-142 + B-143 (all Fast Track XS — 5 are CLAUDE.md edits, 1 is post-B-137 cleanup)

---

## Active Items

_B-137 closed DONE 2026-04-30 — moved to "Completed This Sprint" below._

_B-138 DEFERRED (position-fallback retained intentionally for legacy v3 records during transition; see B-137 As-Built §66.18.11). Remains backlog for future sprint when v3 cohort confirmed empty._

_B-139..B-143 bundle DONE 2026-04-30 — moved to "Completed This Sprint" below._

---

## Completed This Sprint

### ✅ B-137 — `tj:floatingGroups` schema v3→v4 migration (P1 anchor · Full M)
- **Status**: DONE 2026-04-30 — Full pipeline complete. R1 LOCKED → R2 chapter 66 (1,129 lines incl. As-Built) → R3 build (~242 net LOC + 15 tests) → R4 (3 reviewers PROCEED — 0 CRIT/HIGH; 1 MEDIUM routed to UAT) → R5 (UAT_B-137.md 15 cases + 2 cheap-fix tests) → R6 As-Built §66.18 + R7 docs.
- **Files Changed**: 5 source (`background/storage/{migration.js, shapes.js}` · `background/tabs/{floating-groups.js, floating-members.js, tab-events.js}`); 9 test (15 new tests + fixture updates across `floating-shape, floating-position, floating-multi, b132-cold-start-inheritance, b134-tab-drag-reorder, migration-steps, b013-opener-chain, b018-persistence, b121-floating-group-render`); 2 R5-added tests (`floating-multi.test.js` qa L-2 H-2 dedup + `migration-fresh-install.test.js` qa L-3 defaultShape literal pin); design `docs/design/66-b-137-floating-tab-id-join-key.md` (R2 + §66.18 As-Built); `docs/UAT_B-137.md` (15 cases). Plus R7 docs: CHANGELOG / user-manual.
- **What shipped**: schema v3→v4 lazy migration adopting `floatingTabId`-derived `liveTabId` as primary live-tab join key. 3-tier read join (a `liveTabId` direct → b position fallback → c URL fallback). Cold-start `reassociateFloatingGroups` extends prune-only writeTransaction to also lazy-rewrite legacy v3 records. `_resolveRecordIndexByTabId` (B-134 R3 helper) refactored to O(1) for v4 records. **Subsumes B-131** (sibling-title displacement); **structurally eliminates Issue 3** (race-toast on rapid floating reorder).
- **C-1a + C-1b compliance**: KNOWN_VERSION 3→4 ✓ defaultShape(PARTITION_META) v4 ✓ no-op MIGRATION_STEPS v3→v4 ✓ lazy migration option 2 ✓ CHANGELOG SW module-cache flush note included in v1.35.0 entry.
- **R4 verdict**: code APPROVE 0 findings · security PROCEED 0 CRIT/HIGH/MEDIUM 1 LOW (advisory) · qa PROCEED 0 CRIT/HIGH 1 MEDIUM (UAT-1 mandatory; closed by R5) 4 LOW (2 closed by R5 cheap-fixes, 1 by R6 As-Built JSDoc, 1 by UAT).
- **B-141 self-application gate**: did NOT fire (R3 verified all R2-cited line numbers matched reality; documentation drift only). First successful Sprint 41 self-application.
- **Tests**: 1,782 → 1,799 (+17 across the B-137 lifecycle).

### ✅ B-138 — Post-B-137 `(windowId, tabIndex)` callers cleanup (Fast Track XS, **DEFERRED**)
- **Status**: DEFERRED 2026-04-30 — position-fallback retained intentionally for legacy v3 records during transition. Per B-137 R6 As-Built §66.18.11, B-138 is recommended for future sprint (S45+) once observation window confirms zero v3 cohort. R5 UAT-15 verifies the fallback REMAINS active as a regression guard for the deferred state.
- **No code shipped**; row stays `backlog | TBD` post-S41 close (re-flipped from `in-progress | 41`).

### ✅ B-139..B-143 — CLAUDE.md process-gate bundle (Fast Track XS, 5 items)
- **Status**: DONE 2026-04-30 — Fast Track DoD met. R1 LOCKED (Wave 0 bundle) → R3 build (single CLAUDE.md edit pass per R3 ordering note) → R4 [code-reviewer] CLEAN + [security-reviewer] CLEAN (qa skipped per Fast Track tier).
- **Files Changed**: `CLAUDE.md` (5 insertions + 1 deletion across 2 regions: R2 Correctness Checklist + ROUND 3 Build section).
- **What shipped**: Five new process gates closing real failure-mode classes:
  - **C-13 (B-139)** — Chrome event-feedback completeness: when R2 adopts a Chrome write API, R2 MUST enumerate corresponding event listeners. Closes the B-136 missing-`onMoved` class.
  - **C-14 (B-140)** — gen-counter content predicate enumeration: R2 must specify "what counts as gen-bump-relevant" for cache-invalidation / drag-state contracts. Closes the B-134 H-1 over-trip class.
  - **B-141** — STOP-and-escalate extension: fires when R3 finds R2 spec is incorrect (not just for AC-locked deferrals). Closes the B-134 §63.8.2 parentItemId re-anchor late-surfacing class.
  - **B-142** — R3 cross-surface diff self-check: when same AC lands on 2+ surfaces, R3 MUST diff vs R2 spec. Closes the B-124 silent-divergence class.
  - **B-143** — R3 R2-deferred-to-UAT cheap-fix self-check: ≤10 LOC fixes get pre-empted at R3, not deferred. Closes the B-122 §62.9 F-1 deferred-but-cheap-fix class.
- **B-141 self-application gate**: did NOT trigger (line numbers all matched reality at R3 time). First successful self-application of the new gate.
- **R4 findings**: 0 CRIT/HIGH/MEDIUM/LOW from both reviewers.
- **Tests**: 1,782/1,782 PASS (no test changes for CLAUDE.md edits).

---

## Blockers

*None.*

---

## Gate 4 — Release Checklist (verified 2026-04-30)

- ✅ All R4 review findings resolved — 0 CRIT/HIGH on B-137; MEDIUMs/LOWs closed at R5 (cheap-fix tests + UAT-1) or R6 As-Built (qa L-1 JSDoc) or routed to UAT-13. Documented in `docs/findings/sprint-41.md` + As-Built §66.18.4.
- ✅ All R5 automated tests passing — **1,799/1,799 PASS**. Net delta from S40 baseline 1,782: +17 tests.
- ✅ UAT plan authored: `docs/UAT_B-137.md` (15 cases). Manual UAT by product-owner pending — NOT blocking close per established pattern.
- ✅ No open blockers
- ✅ R6 As-Built §66.18 appended to `docs/design/66-b-137-floating-tab-id-join-key.md` (chapter 923 → 1,129 lines)
- ✅ `docs/SOLUTION_DESIGN.md` TOC updated for chapter 66 to "R2 + R6 Close"
- ✅ `manifest.json` permissions reviewed — no additions
- ✅ `./build.sh` clean (release-manager will re-run with version bump)
- ✅ Rollback plan documented in As-Built §66.18.10 (single-revert; lazy self-rolls-back)
- ✅ R7 docs updated: `CHANGELOG.md` v1.35.0 entry **with mandatory C-1a SW module-cache flush note** for `tj:floatingGroups` v3→v4 schema bump (B-137) + `docs/user-manual/managing-items.md` extended with "Reliable title rendering (v1.35.0 onward)" subsection. STORE_LISTING.md unchanged (no surgical-update threshold met). README.md does not exist on this branch.
- ✅ `BACKLOG.md` updated — B-137 → `done | 41`; B-138 reverted to `backlog | TBD` (DEFERRED disposition); B-139..B-143 → `done | 41`.
- ✅ `BACKLOG_BOARD.md` updated — progress recalculated; status summary refreshed.
- ✅ `SPRINT.md` "Completed This Sprint" section reflects all 6 finished items + B-138 DEFERRED entry.

**Gate 4 status: PASS** — sprint may close.

---

## Sprint Retrospective — Sprint 41 (Gate 7)

### Velocity
- **Planned**: 7 items / ~7 effort units (1×P1/M anchor + 1×P2/XS B-138 + 5×P3/XS B-139..B-143)
- **Completed**: 6 shipped + 1 DEFERRED (B-138 intentional defer) / ~6.5 effort units
- **Carried over**: B-138 reverts to backlog with documented disposition (DEFERRED); not a slip — position-fallback intentionally retained
- **Test count delta**: 1,782 → 1,799 (+17 tests across the sprint)

### What Went Well
- **R0 spike from post-S40 carried into S41 cleanly** — the spike's HIGH-confidence root cause for Issue 2 + Issue 3 (`(windowId, tabIndex)` join fragility) directly drove B-137's design without R0/R1 friction.
- **Wave 1 Fast Track bundle worked smoothly** — 5 CLAUDE.md process gates in one R3 [frontend-engineer] agent + one R4 reviewer pair (mirrors S39 B-127/B-128/B-129 + v1.33.1 B-130 patterns).
- **B-141 self-application gate worked correctly** — first self-applied test of the new "STOP-and-escalate on R2-spec-incorrect" extension; R3 confirmed line-number drift was JSDoc-only (not silent adaptation), so gate did NOT fire (correctly).
- **Cross-reviewer convergence at R4 was minimal** — R3 build was clean enough that no Wave 3a fix-round needed (vs S40 which had 4 HIGH findings requiring fix-round). Validates that careful R2 design (chapter 66 = 923 lines) catches problems pre-build.
- **Toolchain hygiene continues** — `docs/findings/sprint-41.md` pre-created at kickoff; 0 file-write denials across all R4/R5 agent runs.
- **Schema-bump compliance pattern matured** — third sprint applying full C-1a + C-1b lazy-migration recipe (S38 v1→v2, S40 v2→v3, S41 v3→v4); all three landed clean.

### What to Improve
- **B-138 disposition routing** — at sprint kickoff B-138 was filed as Wave 1 piggyback assuming "post-B-137 cleanup" would be possible same-sprint. R2/R3 correctly identified that the position-fallback must be retained for legacy v3 records. The disposition flipped from "fold into B-137 R3" → "DEFERRED" mid-sprint without explicit [scrum-master] routing. Improvement: when an item's tier/disposition can flip on R2 outcome, R1 should explicitly enumerate the disposition-flip conditions, so sprint planning knows to expect the deferral. Filed as B-144 candidate for next CLAUDE.md retro.
- **R5 UAT plan is the single source of B-131 user-visible repro coverage** — qa-reviewer flagged at R4 that the unit T1 test verifies the position-collision MECHANISM but not the user-visible PATH. R5 UAT-1 closes this, but the gap was discovered late. Improvement: when R3 introduces a structural fix for a previously-reported user-visible bug, R3 (or R5) should always include a unit test that walks the actual user-visible reproduction path, not just the mechanism. Filed as B-145 candidate.

### Action Items for Next Sprint
- [ ] **B-144 candidate**: CLAUDE.md R1 charter addition — when an item's tier/disposition can flip based on R2 outcome (e.g., "fold into anchor" vs "deferred"), R1 must enumerate the disposition-flip conditions so [scrum-master] expects the routing change. Filed as P3/XS Fast Track for S42.
- [ ] **B-145 candidate**: CLAUDE.md R3 charter addition — when R3 ships a structural fix for a previously-reported user-visible bug, R3 must include a unit test walking the user-visible reproduction path (not just the structural mechanism). Filed as P3/XS Fast Track for S42.
- [ ] B-138 watch — after one or two sprints of v4 production observation, check whether v3 cohort has fully turned over (via UAT or telemetry-equivalent — extension storage inspection); when zero v3 cohort confirmed, B-138 cleanup becomes safe to schedule.


---

## Pipeline Plan

**Wave 0 (parallel — 2 agents)**:
- **B-137 R1** [product-manager] — write tight 6-8 ACs with B-118 source-citation gate; R1 LOCKED block ready for R2 [solution-architect]. ~30-45 minutes.
- **B-139/B-140/B-141/B-142/B-143 R1 bundle** [product-manager] — five CLAUDE.md-edit items; each 2-3 AC tight block; R1 LOCKED on first pass. ~45-60 minutes.

B-138 R1 auto-derives at R3 (no Wave 0 work).

**Wave 2 (B-137 R2 only)**:
- **B-137 R2** [solution-architect] — chapter 66 (`docs/design/66-b-137-floating-tab-id-join-key.md`). Schema v3→v4 design; lazy migration semantics; `_resolveRecordIndexByTabId` refactor; cold-start re-bind path; fix-scope test-assertion enumeration (B-119/B-126 mandatory subsection). C-1a + C-1b explicit closure. Reuse B-121 §60.X resolver pattern + B-122 §62.4 cache extension as architectural references.

**Wave 3 (parallel R3)**:
- **B-137 R3** [frontend-engineer] — implement schema migration + join-key change (~150-200 LOC; ~15-20 tests). May fold B-138 cleanup if same files touched (R3 decides).
- **B-139/B-140/B-141/B-142/B-143 R3 bundle** [frontend-engineer] — 5 CLAUDE.md edits in one agent (mirrors S39 B-127/B-128/B-129 bundle pattern). All edits must apply B-141's "R3 STOP-and-escalate on R2-spec-incorrect" self-application.

**Wave 4 (parallel R4)**:
- B-137 (M tier): 3 reviewers (code + security + qa)
- B-139/B-140/B-141/B-142/B-143 bundle (Fast Track XS): code + security parallel; qa skipped per Fast Track tier
- B-138 (if not folded): code + security parallel

**Wave 5 (R5 + R6 + R7 + close)**:
- R5 [test-engineer] writes UAT_B-137.md + any gap tests
- R6 [solution-architect] As-Built §66.X + cross-cutting TOC update for §66
- R7 [technical-writer] CHANGELOG (with C-1a SW module-cache flush note for v3→v4 schema bump per Sprint 30 B-092 / Sprint 38 B-121 / Sprint 40 B-134 precedent) + STORE_LISTING + user-manual updates
- Sprint close: Gate 4 → Gate 7 retrospective → [release-manager] v1.35.0 → archive

---

## Pending UAT (Sprint 36 + Sprint 37 + Sprint 38 + Sprint 39 + Sprint 40 + v1.33.1 + v1.34.1 + Sprint 41 — carry-forward tracking)

Product-owner manual UAT in Edge for v1.30.0 + v1.31.0 + v1.32.0 + v1.33.0 + v1.33.1 + v1.34.0 + v1.34.1 + v1.35.0 (planned). Not blocking sprint close per established pattern, but should be cleared before any v2 → main merge.

- **Sprint 36 (v1.30.0)**: B-107..B-115 — UAT pending
- **Sprint 37 (v1.31.0)**: B-117 UAT-1..UAT-10 pending (`docs/UAT_B-117.md`)
- **Sprint 38 (v1.32.0)**: B-125 UAT-1..UAT-8 pending (`docs/UAT_B-125.md`) · B-121 UAT-1..UAT-15 pending (`docs/UAT_B-121.md`)
- **Sprint 39 (v1.33.0)**: B-124 UAT-1..UAT-13 pending (`docs/UAT_B-124.md`) · B-122 UAT-1..UAT-10 pending (`docs/UAT_B-122.md`)
- **Sprint 40 (v1.34.0)**: B-132 UAT-1..UAT-9 pending (`docs/UAT_B-132.md`) · B-134 UAT-1..UAT-19 pending (`docs/UAT_B-134.md`)
- **v1.34.1 hotfix**: B-136 — covered by extended B-134 UAT
- **Sprint 41 (v1.35.0)**: B-137 UAT plan authored at R5 (this sprint)

---

## Backlog (Sprint 42+ candidates)

After S41 close — pending product-owner triage:

- **B-041** Sync tab order (P2/L · pre-S33) — last big v2 feature item; may absorb B-135 cross-window drag
- **B-076** MIGRATION_STEPS hook (P2/S · pre-S33) — passive future-work placeholder
- **B-086** Sidepanel UI/UX umbrella (P3/M · pre-S33)
- **B-135** Cross-window Open Tabs drag (P3 · deferred from B-134 v1 scope)
- v2 → main merge prep (only after UAT clears)

---

## Pre-flight reminders for S41 execution

When [scrum-master] launches Wave 0:
- 2 agents in parallel (single message): B-137 R1 + B-139/140/141/142/143 R1 bundle
- All apply **B-118 source-citation gate**
- Bundle agent applies the **B-127/B-128/B-129/B-130 precedent format** for CLAUDE.md edits
- **B-141's self-application**: B-141 (STOP-and-escalate on R2-spec-incorrect) is itself an R3 charter change. R3 [frontend-engineer] when implementing B-139..B-143 must apply B-141's rule to its own work.

---

## Gate 6 — Sprint Readiness Verification

- ✅ Total sprint effort fits — ~7 effort units (1×M + 6×XS = 4 + 3 = 7). Comparable to S38 (6) / S39 (7) / S40 (7-8).
- ✅ No unresolved blockers from v1.34.1
- ✅ Deps-resolved check:
  - **B-137** deps: B-121 ✅, B-134 ✅, B-136 ✅
  - **B-138** deps: B-137 (sequenced — same sprint OK per CLAUDE.md Gate 6 deps-resolved-check rule)
  - **B-139** deps: B-118 ✅, B-119 ✅, B-126 ✅, B-127 ✅, B-128 ✅, B-129 ✅
  - **B-140/B-141/B-142/B-143** deps: B-118 ✅, B-127 ✅
- ✅ All sprint items in BACKLOG.md flipped to `in-progress | 41` at kickoff
- ✅ SPRINT.md "Active Items" populated (this section)
- ✅ Findings file `docs/findings/sprint-41.md` pre-created (S39 retro toolchain hygiene action)

**Gate 6 status: PASS** — Sprint 41 ready to launch Wave 0.
