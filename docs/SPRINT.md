# Current Sprint

**Sprint 40 — Floating-tab bug-fix anchor + drag-reorder feature (kicked off 2026-04-30)**

Five-item sprint: 2 P1 floating-tab bugs (B-131 + B-132) + 1 P2 drag-reorder feature with R1-locked design (B-134) + 1 P3 visual consolidation Fast Track (B-133). One sibling deferred stub filed (B-135 cross-window drag — no sprint work).

- **Branch**: `feature/sprint-40-drag-reorder` off `release/v2` (post-v1.33.1 hotfix at `872ad95`)
- **Target version**: v1.34.0 (release/v2 only — no main merge per established pattern)
- **Test baseline at kickoff**: 1,732/1,732
- **Anchors**: B-132 (P1 bug · SW-memory + cold-start regression in B-121/B-125 subsystem · likely Spike-First R0) + B-134 (P2 drag-reorder · M Full · R1 LOCKED at brainstorm)
- **Wave 1**: B-131 verify-first + B-133 Fast Track XS

---

## R1 design status (Wave 0 inputs)

**B-131 — Floating tab title-displacement bug**
- **Verify-first**: product-owner reports may no longer reproduce post-v1.33.1. Wave 0 [product-manager] verifies repro on latest `release/v2` build BEFORE sinking R2 effort. If not-repro, downgrade to static-analysis review of suspected `buildFloatingTabRow` / `patchFloatingMembersSections` descriptor mapping; close as `wontfix-not-repro` if review is clean.
- **Tier**: TBD pending verify-first outcome.

**B-132 — Floating tabs route to Open Tabs after extension reload**
- **Likely Spike-First R0** — same B-121/B-125 subsystem that needed an R0 spike in S38 (B-125 + B-121 merged spike pattern).
- Distinguish: (a) post-reload-only spawn affected (SW lost opener context), vs (b) pre-existing floating tabs also lose their group (cold-start `tj:floatingGroups` re-bind regression).
- Wave 0 [solution-architect] runs R0 discovery spike to surface root cause + sub-item candidates.

**B-133 — Open Tabs section dotted-green indicator (visual consolidation)**
- **Tier**: Fast Track (XS) — pure CSS rule extension mirroring B-130 pattern.
- Visual taxonomy: solid-green = persistent (saved bookmark currently live); dotted-green = ephemeral (floating tab OR Open Tabs row).
- Wave 0 [product-manager] writes tight ACs. R1 source-citation gate (B-118) applies: cite `buildOpenTabRow` selector + `--floating-bar-color` token references.

**B-134 — Drag-and-drop reorder for open + floating tabs**
- **R1 LOCKED at brainstorm 2026-04-30** — see BACKLOG.md row B-134 for the full 8-AC block.
- 5 ops: Open Tabs reorder (chrome.tabs.move), within-floating reorder, ATTACH (open→floating), DETACH (floating→open), cross-group MOVE (floating→floating).
- **R2-VERIFY 1 (CRITICAL)**: schema-bump-or-not — does `tj:floatingGroups` already carry an ordering field? R2 first action.
- No PM agent needed in Wave 0 — design already locked.

---

## Active Items

### [B-131] Floating tab title-displacement bug (P1 — verify-first)
- **Tier**: TBD (verify-first determines)
- **Status**: 🔄 R1 verify-first → next round in flight (Wave 0)
- **Assigned To**: [product-manager] for Wave 0 verify-first agent
- **Feature Context**: product-owner reports floating-tab row briefly shows wrong title (sibling item's) on initial open, then corrects on tab activation. May no longer reproduce post-v1.33.1.
- **Handoff Notes for Wave 0**: load v1.33.1 unpacked extension; attempt repro per the BACKLOG triage notes; produce verdict (repro/not-repro/intermittent). If not-repro: write static-analysis review of suspected `buildFloatingTabRow` / `patchFloatingMembersSections` descriptor mapping for any latent race; close as `wontfix-not-repro` if clean. If repro: write full R1 ACs and route to R2.
- **Files Changed**: TBD
- **Parallel Opportunity**: Wave 0 verify can run parallel with B-132 R0 + B-133 R1

### [B-132] Floating tabs land in Open Tabs after extension reload (P1 — anchor #1)
- **Tier**: TBD (likely Spike-First M/XL pending R0 spike)
- **Status**: 🔄 R0 [solution-architect] in flight (Wave 0)
- **Assigned To**: [solution-architect] for R0 discovery spike
- **Feature Context**: post-extension-reload, opener-chain-spawned tabs route to Open Tabs section instead of originating group. Suspected: SW-memory loss of `openerMap` (B-013/B-018) or `inheritedTabs` (B-125), or cold-start `tj:floatingGroups` re-bind regression.
- **Handoff Notes for Wave 0**: read B-121/B-125 As-Built + the existing `background/tabs/opener-chain.js` + `background/tabs/floating-groups.js` cold-start re-association code. Distinguish failure mode (a) post-reload spawn only vs (b) pre-existing floating tabs also affected. Produce R0 output: feasibility verdict, suspected root cause(s) with `file:line` citations, sub-item candidates if scope splits, recommended Tier (M Full vs XL Spike-First with R0 captured).
- **Files Changed**: TBD
- **Parallel Opportunity**: Wave 0 R0 can run parallel with B-131 verify + B-133 R1

### [B-133] Open Tabs section dotted-green indicator (P3 — Wave 1 Fast Track)
- **Tier**: Fast Track (XS)
- **Status**: 🔄 R1 [product-manager] in flight (Wave 0)
- **Assigned To**: [product-manager] for R1
- **Feature Context**: Visual consolidation per ephemeral-state taxonomy. Open Tabs section rows currently use SOLID green live indicator; should use DOTTED green (matching floating-tab visual from B-130) to clearly mark ephemeral state.
- **Handoff Notes for Wave 0**: tight, lock-on-first-pass ACs. Apply B-118 source-citation gate. Cite `sidepanel.js buildOpenTabRow` selector + `sidepanel.css` rule that currently sets `border-left-color: var(--live-indicator)` on Open Tabs rows + `--floating-bar-color` token + B-130 §61.X precedent. Decide cross-surface coverage (sidepanel-only vs sidepanel+newtab+popup).
- **Files Changed**: TBD by R3
- **Parallel Opportunity**: Wave 0 R1 can run parallel with B-131 verify + B-132 R0

### [B-134] Drag-and-drop reorder for open + floating tabs (P2 — anchor #2)
- **Tier**: Full (M)
- **Status**: ✅ R1 LOCKED at brainstorm 2026-04-30 → R2 [solution-architect] next (Wave 2)
- **Assigned To**: pending Wave 0 completion → [solution-architect] for Wave 2 R2
- **Feature Context**: 5 drag operations (Open Tabs reorder, within-floating reorder, ATTACH, DETACH, cross-group MOVE). Open Tabs reorder mirrors to browser tab strip via `chrome.tabs.move`; floating-tab membership changes are TJ-metadata only.
- **R1 LOCKED Output**: full 8-AC block in BACKLOG.md row B-134 (R1 design Q&A locked at brainstorm per product-owner answers).
- **Handoff Notes for R2**: **R2-VERIFY 1 (CRITICAL) is the first action** — read `background/storage/shapes.js` + `buildFloatingMembers` iteration logic to disambiguate Case 1 (records carry ordering field) vs Case 2 (need to add `sortOrder` + comply with C-1a/C-1b). R2 chapter format: new `docs/design/63-b-134-tab-drag-reorder.md`. Reuse B-122 §62.3-§62.9 patterns (drop-target hit-test, sectionBottoms cache extension, F-5 race-guard third branch).
- **Files Changed**: TBD by R3
- **Parallel Opportunity**: R2 can run parallel with B-132 R2 (both M tier; CLAUDE.md P-3 allows 2 M parallel)

### [B-135] Cross-window Open Tabs drag (P3 — deferred stub)
- **Tier**: N/A — deferred stub, NO Sprint 40 work
- **Status**: 🔄 Filed only (Sprint 40 has zero work on this; documented for traceability)
- **Files Changed**: none
- **Notes**: filed alongside B-134 per CLAUDE.md scope-change-control (don't silently defer; file the followup). Out of B-134 v1 scope per Q3 decision (same-window only).

---

## Completed This Sprint

*None yet.*

---

## Blockers

*None.*

---

## Pipeline Plan

**Wave 0 (parallel — 3 agents)**:
- B-131 verify-first [product-manager] — load v1.33.1 in Edge, attempt repro, produce verdict
- B-132 R0 [solution-architect] — discovery spike on SW-memory persistence + cold-start re-bind
- B-133 R1 [product-manager] — tight ACs with B-118 source-citation gate

B-134 already R1 LOCKED — no Wave 0 agent needed.

**Wave 1 (B-131 branch decision)**:
- If not-repro → static-analysis review → close `wontfix-not-repro`. Done. Removed from active items.
- If repro → continue Full pipeline through R2/R3/R4/R5/R6.

**Wave 2 (parallel R2 — anchors)**:
- B-132 R2 [solution-architect] — chapter for SW-memory persistence story (chapter # TBD)
- B-134 R2 [solution-architect] — `docs/design/63-b-134-tab-drag-reorder.md`; first action is R2-VERIFY 1 (schema bump or not)

**Wave 3 (parallel R3 — build)**:
- B-132 R3 [frontend-engineer]
- B-134 R3 [frontend-engineer]
- B-133 R3 [frontend-engineer] — bundleable with B-134 R3 (both touch sidepanel CSS)

**Wave 4 (parallel R4 — review)**:
- 3 reviewers (code + security + qa) for B-132 + B-134 (M tier, all 3 mandatory per CLAUDE.md Gate 1)
- 2 reviewers (code + security; qa skipped per Fast Track) for B-133

**Wave 5 (R5 + R6 + R7 + close)**:
- R5 [test-engineer] writes UAT plans for B-132 + B-134 + integration tests
- R6 [solution-architect] As-Built sections appended
- R7 [technical-writer] CHANGELOG + STORE_LISTING + user-manual updates
- Sprint close: Gate 4 → Gate 7 retrospective → [release-manager] v1.34.0 → archive

---

## Pending UAT (Sprint 36 + Sprint 37 + Sprint 38 + Sprint 39 + v1.33.1 + Sprint 40 — carry-forward tracking)

Product-owner manual UAT in Edge for v1.30.0 + v1.31.0 + v1.32.0 + v1.33.0 + v1.33.1 + v1.34.0 (planned). Not blocking sprint close per established pattern, but should be cleared before any v2 → main merge.

- **Sprint 36 (v1.30.0)**: B-107..B-115 — UAT pending
- **Sprint 37 (v1.31.0)**: B-117 UAT-1..UAT-10 pending (`docs/UAT_B-117.md`)
- **Sprint 38 (v1.32.0)**: B-125 UAT-1..UAT-8 pending (`docs/UAT_B-125.md`) · B-121 UAT-1..UAT-15 pending (`docs/UAT_B-121.md`)
- **Sprint 39 (v1.33.0)**: B-124 UAT-1..UAT-13 pending (`docs/UAT_B-124.md`) · B-122 UAT-1..UAT-10 pending (`docs/UAT_B-122.md`)
- **Sprint 40 (v1.34.0)**: B-132 + B-134 UAT plans authored at R5 (this sprint)

---

## Backlog (Sprint 41+ candidates)

After S40 close — pending product-owner triage:

- **B-041** Sync tab order (P2/L · pre-S33) — last big v2 feature item; may absorb B-135 cross-window drag
- **B-076** MIGRATION_STEPS hook (P2/S · pre-S33) — passive future-work placeholder
- **B-086** Sidepanel UI/UX umbrella (P3/M · pre-S33)
- **B-135** Cross-window Open Tabs drag (P3 · deferred from B-134 v1 scope)
- **S39 retro action items** still pending file (R3 cross-surface diff self-check + R3 deferred-to-UAT self-check) — file as `B-???` after S40

---

## Pre-flight reminders for S40 execution

When [scrum-master] launches Wave 0:
- 3 agents in parallel (single message): B-131 verify, B-132 R0, B-133 R1
- All apply **B-118 source-citation gate** (every R1/R0 source-code claim cites `file:line` or is marked `R2-VERIFY`)
- B-132 R0 is the highest-risk path — possible auto-upgrade to XL Spike-First if discovery surfaces complexity
- B-131 verify-first is the highest-uncertainty path — outcome determines whether item joins full pipeline or closes
- B-134 R1 already LOCKED; no Wave 0 work; SPRINT.md routes directly to R2 once Wave 0 + Wave 1 complete

---

## Gate 6 — Sprint Readiness Verification

- ✅ Total sprint effort fits — 8.5–13 effort units (8.5 best case, 13 worst case if all risks fire). Comparable to S38 (6) and S39 (7); slight stretch but manageable. Mitigation: defer B-134 to S41 if B-132 R0 spike comes back as XL.
- ✅ No unresolved blockers from S39 / v1.33.1 hotfix
- ✅ Deps-resolved check:
  - **B-131** deps: B-013 ✅, B-018 ✅, B-121 ✅, B-124 ✅
  - **B-132** deps: B-013 ✅, B-018 ✅, B-121 ✅, B-125 ✅
  - **B-133** deps: B-124 ✅, B-130 ✅
  - **B-134** deps: B-031 ✅, B-122 ✅, B-121 ✅, B-125 ✅, B-130 ✅
- ✅ All sprint items in BACKLOG.md flipped to `in-progress | 40` at kickoff
- ✅ SPRINT.md "Active Items" populated (this section)
- ✅ B-134 R1 design Q&A LOCKED at brainstorm — saves 1 round-trip vs deferring to mid-R1
- ✅ Findings file `docs/findings/sprint-40.md` pre-created (S39 retro toolchain hygiene action item)

**Gate 6 status: PASS** — Sprint 40 ready to launch Wave 0.
