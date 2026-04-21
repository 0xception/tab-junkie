# Current Sprint

*Sprint 22 — Drag foundation attempt; B-030 reverted mid-sprint due to perf regression + correctness bug. Closed 2026-04-21 without release. Drag work slips one sprint — re-architected re-implementation scheduled for S23.*

---

## Sprint Readiness (Gate 6) — original scope

Kicked off 2026-04-20 per FEATURE_PARITY_ROADMAP with B-030 (L) + B-009 (S) + B-033 (S) — drag foundation theme.

---

## Scope Change Log

**2026-04-20 — S22 ↔ S23 swap at kickoff** (original entry preserved). Applied before build started; no impact on retrospective.

**2026-04-21 — B-030 reverted mid-sprint (MAJOR scope change)**. After R1 + R2 + R3 + R5 + R6 shipped (PR #27, commit `bfe0559`), product-owner UAT smoke test in Edge surfaced two blocker-grade issues:
1. **Correctness**: same-group reorder indicator positioned correctly but drop produced no actual reorder. Cross-group move worked, drop-onto-Ungrouped worked; only same-group silently failed.
2. **Performance**: cumulative drag-over lag that compounded the longer the drag continued, affecting both the new item drag AND the pre-existing B-008 group drag (regression).

Root-cause analysis in retrospective below. Decision: revert B-030 (`git revert bfe0559` → commit `<this-commit>`) rather than patch forward, because:
- The perf issue stemmed from skipping the R2-specified rAF coalescing + cached-rect optimisation — that's an architectural gap, not a surface bug.
- The same-group correctness bug needs Edge-side debug instrumentation that wasn't feasible in-session.
- B-009 + B-033 were both blocked on B-030 — shipping them on a known-broken foundation would compound the regression.
- Clean revert preserves the roadmap accounting honestly (one-sprint slip, not a quiet patch-over).

**Consequences**: Sprint 22 closes with **zero features shipped** (no v1.17.0 release). B-009 + B-033 revert to `backlog` with their R1 ACs preserved. FEATURE_PARITY_ROADMAP.md updated — drag foundation theme moves to S23; drag stack (B-025 + B-031 + B-032) moves to S24; downstream sprints shift by one.

---

## Active Items

*(none — sprint closed; all three in-flight items reverted to backlog)*

---

## Completed This Sprint

*(none — B-030 R1+R2+R3+R5+R6 work was shipped as PR #27 but reverted as commit `<revert-commit>`; no items kept in release/v2 state)*

---

## Gate 4 — Release Checklist (2026-04-21)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | N/A — no items shipped |
| 2 | All R5 automated tests passing | ✅ — **979/979** (baseline restored post-revert) |
| 3 | UAT sign-off | ⚠️ — B-030 UAT smoke test FAIL (2/8 cases); triggered revert |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` slices updated | Reverted (§36 chapter removed) |
| 6 | `manifest.json` permissions reviewed | ✅ — zero changes |
| 7 | `./build.sh` produces clean package | ✅ |
| 8 | Rollback plan documented | ✅ — clean `git revert` executed |
| 9 | README / user manual updated | N/A — no user-visible change |
| 10 | `BACKLOG.md` — all Sprint 22 items status accurate | ✅ (B-030/B-009/B-033 back to `backlog`) |
| 11 | `BACKLOG_BOARD.md` — dashboard accurate | ✅ |
| 12 | `SPRINT.md` reflects actual outcome | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-close archive step |

**Gate 4 verdict**: PASS (zero features to release; revert verified clean).

---

## Sprint Retrospective — Sprint 22

### Velocity

- **Planned**: B-030 L + B-009 S + B-033 S (3 items, ~L + 2S)
- **Shipped**: 0 items (B-030 merged then reverted; B-009 + B-033 never started R3)
- **Work output**: R1 ACs for all 3 items + R2 architecture for B-030 + R3/R5/R6 for B-030 authored and merged, then reverted
- **Tests**: 979 → 997 (during B-030) → 979 (after revert). Net zero.
- **Release**: none (v1.17.0 skipped; next release will be v1.17.0 in S23 if drag foundation v2 ships clean)

### What Went Well

1. **Gate 6 deps-resolved check (B-071) caught the S22↔S23 ordering mismatch at kickoff.** Without that check, B-025 + B-031 + B-032 would have been attempted first with B-030 as an unmet dep — likely compounding the eventual failure. The new checklist item earned its keep on its second sprint.
2. **Product-owner UAT smoke test surfaced the defect before B-009/B-033 layered on top.** If I'd proceeded to Wave 1 without the check-in, the drag helpers would have inherited the broken foundation. The "pause-for-UAT-before-next-wave" discipline worked as designed.
3. **Clean revert restored baseline in one commit.** `git revert bfe0559` undid the full B-030 surface (9 files, 850 LoC, 18 tests) without touching unrelated work. No rollback friction.

### What to Improve

1. **HIGH — R2 perf specs MUST be implemented in R3, not aspirational.** My R2 §36.3.4 explicitly said "rAF-coalesced indicator writes, bounding-rect reads cached per-drag". My R3 build did neither — the dragover handler recomputed rects and moved DOM on every event (60–120 Hz), causing compounding layout thrash. **Future R2 perf decisions must be encoded as R3 code guardrails** (e.g., an AC: "dragover handler MUST NOT call getBoundingClientRect outside a rAF callback") so R3 can't silently drop them.
2. **HIGH — Drag features need dedicated UAT plan authored at R1, not deferred to S27.** I filed `docs/UAT_B-030.md` as "TBD during R3" per the roadmap's smoke-UAT protocol, but never actually wrote it. If the UAT plan had been authored with perf-specific probes ("drag continuously for 10 seconds; measure cumulative lag") it would have caught the issue at R5, before merge. **Next time: R1 authors the smoke UAT — the plan is a design artefact, not post-hoc documentation.**
3. **MEDIUM — Same-group vs cross-group branching had no dedicated test.** My `computeItemReorder` had a "no-op detection" path for same-group same-position drops, and my pure-helper tests covered the happy path, but I didn't explicitly test same-group reorder at multiple destinations (only "first to last" and "last to first" — boundary cases that happened to work in the simulated backend). The real-world bug (same-group reorder silently dropping) was invisible because the backend `bulkReorderItems` test did work, and the pure helper test did work — but the sidepanel DOM-to-helper wiring had a bug that only manifests in a real browser. **Next time: add sidepanel-side drag simulation (even a primitive fake-DOM test) for drag flows, not just pure-helper + backend tests.**
4. **LOW — UAT smoke test was ad-hoc, not plan-driven.** The user and I walked through 8 checks I generated on the fly. Some were strong (Esc cancel, cross-group move, perf timeline), some were weak (e.g., "tooltip shows disclosure" — barely a smoke-signal). **Next time: pre-authored UAT plan for every feature; walkthrough drives the plan, not the other way around.**

### Action Items for Sprint 23 (Drag Foundation v2)

- [ ] **[scrum-master]** S23 scope: B-030 re-architected + B-009 + B-033. Treat as a new Full-tier L for B-030 (Spike-first tier 3 escalation is optional but recommended given the revert). [HIGH]
- [ ] **[product-manager]** Author `docs/UAT_B-030.md` in R1 with explicit perf probes (continuous 10-second drag → measure cumulative lag; getBoundingClientRect call-count budget). [HIGH]
- [ ] **[solution-architect]** R2 for B-030 v2 MUST include explicit code guardrails for perf decisions — "dragover handler calls rAF and batches DOM writes" as an AC, not a note. Consider an R3 lint rule or ESLint no-synchronous-layout-in-dragover pattern. [HIGH]
- [ ] **[frontend-engineer]** R3 debug strategy for same-group reorder: add targeted console.log at every drop-handler branch in a feature-flagged build, walk an Edge UAT pass, confirm execution path matches expectation. Remove logs before merge. [MEDIUM]
- [ ] **[test-engineer]** Add a primitive fake-DOM drag simulation to `tests/b030-item-drag-reorder.test.js` that exercises the full sidepanel drag path (dragstart → dragover → drop → dispatch). Cover same-group drag-to-end, same-group drag-to-start, cross-group, drop-onto-Ungrouped. [MEDIUM]
- [ ] **Roadmap slip**: all sprints S23+ shift by one. Update FEATURE_PARITY_ROADMAP.md accordingly. [HIGH, done in same commit as this revert]

### R4 Findings Summary (Sprint 22)

- **B-030**: 0 findings at R4 code-review/security-review/qa-review smoke-checks. UAT found 2 blocker-grade issues (correctness + perf). The smoke-check process didn't catch either — because my R4 was a self-attested inline review without a dedicated agent, and the perf issue required instrumented Edge testing that the smoke-check doesn't simulate.
- **Lesson**: R4 smoke-check is a cheap sanity gate; it is NOT a substitute for in-browser UAT. For L items, UAT must happen BEFORE the PR merges, not after.

---

## Sprint Close

**Status**: CLOSED 2026-04-21. **Zero releases.** v1.16.0 remains the current production tag on `release/v2`.

### Follow-on for Sprint 23

Per the updated FEATURE_PARITY_ROADMAP:
- **S23 theme**: Drag foundation v2 (B-030 re-architected) + B-009 + B-033. Smoke UAT plan authored in R1 for each item.
- Subsequent sprints shift by one: S24 drag stack (B-025 + B-031 + B-032); S25 quick search (B-022); S26 group jump + standalone; S27 shortcuts + prefs + new tab page; S28 comprehensive UAT; S29 TBD v2→main.
