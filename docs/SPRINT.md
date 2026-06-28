# Current Sprint — Sprint 47

**Theme:** Single-source-of-truth tab↔item identity consolidation — the architectural follow-up to the 2026-06-27 review that found bookmark↔tab identity is multi-homed across six stores (the direct consequence of B-167 adding a durable store *alongside* the session store).
**Branch:** `feature/sprint-47-identity-consolidation` (off `release/v2` at v1.41.0 / `4355b2a`)
**Opened:** 2026-06-27
**Estimated effort:** 1 × XL (Spike-First anchor). Scope split into M/L sub-items is the explicit output of the R0 spike, approved by product-owner before R1.

---

## Sprint 47 Charter

This sprint executes the architectural-review roadmap. Per CLAUDE.md the XL Spike-First anchor begins with an R0 discovery spike; the spike's job is to confirm the diagnosis empirically, pick the single-source-of-truth target, and split the work into reviewable sub-items the product-owner approves before R1.

**Product-owner directions (2026-06-27):**
- **Ambition:** full single-source-of-truth fix (collapse `tj:tabClaims` + `tj:itemClaims` + `floatingGroups.liveTabId`), with the low-risk Tier A refactors sequenced as safe early steps.
- **Baseline:** Sprint 46 closed (v1.41.0 on `release/v2`); this branch is off the updated `release/v2` so it builds on the landed B-167 durable store.

---

## Gate 6 — Sprint Readiness (verified 2026-06-27)

- ✅ Anchor item B-173 filed in BACKLOG.md (`in-progress`, sprint 47) with R0 deliverables enumerated.
- ✅ Tier declared: Spike-First (XL) — starts with R0 before R1.
- ✅ Total effort fits: single XL anchor; the spike resequences the rest.
- ✅ **Deps-resolved check** — all B-173 deps are `done`: B-167 ✅ / B-164 ✅ / B-163 ✅ / B-132 ✅ / B-148 ✅ (all S46-and-earlier).
- ✅ "Active Items" populated below.
- ⚠️ **Carried debt:** B-167 + B-168 UAT was WAIVED at S46 close — to be folded into the B-173 R0 empirical real-browser probe plan.

---

## Active Items

### [B-173] Single-source-of-truth tab↔item identity consolidation (anchor)

- **Tier**: Spike-First (XL)
- **Priority**: P2
- **Status**: **R0 SPIKE IN PROGRESS** ([solution-architect])
- **Assigned To**: [solution-architect] Opus (R0 spike)
- **Blockers**: none
- **Feature Context**:
  - The 2026-06-27 review found bookmark↔tab identity is stored/re-derived in six places: `tj:tabClaims` (session), `tj:itemClaims` (durable, B-167), `LiveTabIndex` (in-memory), `tj:floatingGroups.liveTabId` (persisted), URL-normalization matching (~4 sites), `(windowId,tabIndex)` position matching (~3 sites). Cross-cutting events must keep all six in sync; disagreement = "hard-to-describe" bugs with no single breakpoint.
  - B-167 (S46) added the durable store *alongside* the session store rather than replacing it — increasing the number of identity sources. This item retires the redundancy.
  - Goal: one authoritative identity store; in-memory mirror + `floatingGroups.liveTabId` become derived caches. Low-risk refactors (shared resolver, split `floating-groups.js`, named event fan-out, decomposed `reconcileClaims`) sequenced as safe early steps.
- **Handoff Notes (R0 spike must produce)**: (i) empirical confirmation of the six-store map + drift points; (ii) single-source-of-truth target + derived-cache design; (iii) a RETIREMENT plan for the redundant stores (not another additive layer — the S46 lesson); (iv) split into reviewable M/L sub-items for scrum-master/product-owner approval before R1; (v) migration path + rollback + C-1a/b schema impact; (vi) fold the waived B-167/B-168 reload/restart/scroll verification into the empirical probe plan.
- **Proposed roadmap (spike to confirm/resequence)**: Tier A (A0 cold-start integration test net · A1 shared resolver · A2 split floating-groups.js · A3 named onReplaced/onRemoved fan-out · A4 decompose reconcileClaims) → Tier B (B1 collapse identity store · B2 floatingGroups eager v4-only migration) → Tier C (deferred). Recommended sequence: A0 → A1 → spike-confirm B1.
- **Files Changed**: (none yet — R0 is discovery)
- **Parallel Opportunity**: anchor item; P-1 limit (one L/XL active) — no other L/XL this sprint.

---

## Completed This Sprint

_None yet — sprint just opened; R0 spike in progress._
