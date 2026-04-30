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

### [B-137] Floating-tab `floatingTabId` join-key adoption (P1 — anchor)
- **Tier**: Full (M)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0)
- **Assigned To**: [product-manager] for R1 (Wave 0)
- **Feature Context**: `tj:floatingGroups` records currently use `(windowId, tabIndex)` position heuristic to join to LiveTabIndex in `buildFloatingMembers`. The B-121 v2 schema added a `floatingTabId` ulid which is stored on the record but never used as the join key. Bug post-S40 spike Issue 2 (sibling-title displacement) + Issue 3 (race toast) both trace to this fragile join. B-137 replaces the position join with `floatingTabId`-based identity-stable resolution.
- **Handoff Notes for R1 [product-manager]**:
  - **Authoritative spec inputs**: `docs/findings/post-s40-smoke-triage.md` Issue 2 + B-131 re-eval section (already classified data-model gap with HIGH confidence). `docs/design/60-b-121-floating-tab-render.md` for current schema + `buildFloatingMembers` resolver. `docs/design/63-b-134-tab-drag-reorder.md` §63.18.2 for the parentItemId re-anchor R6 reconciliation. `docs/BACKLOG.md` row B-137 has the user story + dependencies.
  - Apply B-118 source-citation gate (every claim cites `file:line` or `R2-VERIFY`).
  - Apply DoR Gate 7 destructive-action confirmation status (likely N/A — schema migration is reversible via lazy fallback).
  - Apply B-119/B-126 fix-scope test-assertion enumeration mandatory subsection at R2-time, not R1.
  - Target 6-8 ACs covering: (a) v3→v4 schema bump (`liveTabId: number|null` field on each record); (b) write-path: `appendFloatingGroup` stamps `liveTabId`; (c) read-path: `buildFloatingMembers` uses `liveTabId` first, falls back to position+URL ONLY for cold-start re-bind; (d) `_resolveRecordIndexByTabId` (B-134 R3) refactored to O(1) via the new join; (e) cold-start re-bind populates `liveTabId` on legacy v3 records; (f) lazy migration: legacy v3 records resolve via fallback until next write; (g) C-1a + C-1b governance compliance (KNOWN_VERSION 3→4, defaultShape v4, MIGRATION_STEPS v3→v4 no-op step, CHANGELOG SW flush note); (h) regression guards for B-121, B-125, B-130, B-132, B-134 contracts.
- **Files Changed**: TBD by R3 (estimate ~150-200 prod LOC + ~15-20 tests)
- **Parallel Opportunity**: R1 can run parallel with the B-139..B-143 R1 bundle

### [B-138] Post-B-137 `(windowId, tabIndex)` callers cleanup (P2 — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 auto-derive at R3 (no Wave 0 work; foldable into B-137 R3)
- **Feature Context**: After B-137 lands, audit remaining position-heuristic callers; remove redundant code; ensure `liveTabId` is the single source of truth.
- **Handoff Notes for R3**: B-137 R3 [frontend-engineer] decides at R3-time whether to fold B-138 into B-137 R3 commit (recommended if same files touched) OR keep as separate Fast Track R3 sequenced after B-137 close.
- **Files Changed**: TBD

### [B-139] CLAUDE.md C-13 — Chrome event-feedback completeness gate (P3 — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0 bundle)
- **Feature Context**: Post-S40 process-gap finding (B-136 origin). When R2 adopts a Chrome write API (e.g., `chrome.tabs.move`), R2 MUST enumerate the corresponding event listeners that update the in-memory mirror.
- **Handoff Notes for Wave 0 bundle**: tight 2-3 ACs; mirrors B-118/B-126/B-127/B-128/B-129 precedent format.
- **Files Changed**: `CLAUDE.md` only (R2 Correctness Checklist new C-13 row)

### [B-140] CLAUDE.md R2 gen-counter content predicate enumeration (P3 — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0 bundle)
- **Feature Context**: S40 retro action item (origin: Wave 3a H-1 over-trip class). When R2 designs a drag-state / cache-invalidation contract using gen counters, R2 MUST enumerate "what counts as content" for the gen-bump predicate.
- **Files Changed**: `CLAUDE.md` only (R2 charter addition)

### [B-141] CLAUDE.md B-127 STOP-and-escalate extension (P3 — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0 bundle)
- **Feature Context**: S40 retro action item (origin: B-134 R3 §63.8.2 parentItemId re-anchor deviation surfaced at R4 not R3). Extend B-127 STOP-and-escalate to fire when R3 finds R2 spec is incorrect.
- **Files Changed**: `CLAUDE.md` only (R3 Build section bullet extension)

### [B-142] CLAUDE.md R3 cross-surface diff self-check (P3 — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0 bundle)
- **Feature Context**: S39 retro action item (origin: 3 silent newtab/sidepanel divergences in B-124 R3 caught at R4). When same AC lands on 2+ surfaces, R3 MUST diff implementations against R2 spec before claiming complete.
- **Files Changed**: `CLAUDE.md` only (R3 Build section)

### [B-143] CLAUDE.md R3 deferred-to-UAT cheap-fix self-check (P3 — Wave 1)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0 bundle)
- **Feature Context**: S39 retro action item (origin: B-122 §62.9 F-1 Open-Tabs reject-guard UAT-deferred-but-cheap-fixed at Wave 3a). When R2 defers a UX-risk to UAT, R3 MUST assess whether fix is ≤10 LOC and document keep-deferred-or-pre-empt with rationale.
- **Files Changed**: `CLAUDE.md` only (R3 Build section)

---

## Completed This Sprint

*None yet.*

---

## Blockers

*None.*

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
