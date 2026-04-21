# Current Sprint

*Sprint 23 — Drag foundation v2: B-030 re-architected + B-009 + B-033. Kicked off 2026-04-21 per FEATURE_PARITY_ROADMAP.*

Second attempt at the drag foundation after the S22 revert. Every Sprint 22 retro action item is **explicitly addressed** at kickoff (see "Retro Action-Item Application" below) so the lessons don't recur.

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved: B-030 L (Spike-First tier 3) + B-009 S (Fast Track) + B-033 S (Fast Track)
- ✅ Total effort: 1L + 2S — matches P-1 (one L max) + P-2 (S pairs with L)
- ✅ **Deps-resolved check** (Sprint 20 B-071 rule):
  - **B-030** (Item drag-reorder v2): deps B-001 ✅, B-008 ✅ — both resolved; no new deps vs S22 attempt
  - **B-009** (Drag-to-expand collapsed): deps B-008 ✅, B-030 ⬜ (in-sprint) — resolved per "done OR in-sprint" rule
  - **B-033** (Drag saved+live to Open Tabs → demote): deps B-017 ✅, B-030 ⬜ (in-sprint), B-055 ✅ — all resolved
- ✅ Sprint 22 closed 2026-04-21 WITHOUT release; v1.16.0 remains live on `release/v2`; archive commit `772364e`
- ✅ **Post-S22-revert baseline**: 979/979 tests green; 605 K zip; 66 files; no code-surface residue from the reverted B-030 work (clean `git revert`)

---

## Retro Action-Item Application (explicit — do NOT skip)

Per Sprint 22 retrospective `docs/SPRINT_ARCHIVE.md`. Each HIGH/MEDIUM item gets a here's-how-we're-applying-it note at kickoff, not after-the-fact.

### HIGH-1: R2 perf decisions MUST be R3 ACs

Per retro: the rAF coalescing + cached rects in S22's R2 §36.3.4 were aspirational notes that R3 silently dropped. This sprint:

- **B-030's updated AC block** (in BACKLOG.md) gains FOUR new perf-guardrail ACs:
  - `AC16 — dragover handler MUST NOT call getBoundingClientRect outside a rAF callback`
  - `AC17 — dragover DOM mutations MUST be batched into a single rAF per frame`
  - `AC18 — per-drag bounding-rect cache is built at dragstart; invalidated only on scroll events within itemListEl`
  - `AC19 — R5 test suite MUST include an explicit "getBoundingClientRect call count during dragover" assertion with a bounded budget`
- Enforced in R4 [code-reviewer]: grep for `getBoundingClientRect` inside the dragover handler body → any hit outside a rAF closure is a REJECT.

### HIGH-2: R1 authors per-feature UAT plans (including perf probes)

Per retro: in S22, UAT plans were deferred to "R3 or later" and never materialised. This sprint:

- **R1 is blocked from closing** until `docs/UAT_B-030.md`, `docs/UAT_B-009.md`, and `docs/UAT_B-033.md` exist on the feature branch with ≥ 6 cases each.
- **B-030's smoke UAT plan MUST include perf probes**: (a) continuous 10-second drag → measure cumulative lag; (b) simulated 500-item drag budget — pointer-follow observed ≤ 20ms (real-world headroom above the 16ms AC10 target); (c) `getBoundingClientRect` call-count ≤ `(drag duration seconds) * 60 + 2 * (item count in active group)` over the full drag.
- **Every UAT plan also includes a "same-group reorder" case** (specifically: drag first item to last position, then drag last to first; assert visible reorder happens AND persists across reload).

### HIGH-3: L items require in-browser UAT BEFORE PR merge

Per retro: S22 B-030 was merged with R4 inline smoke-check but UAT smoke-test only ran the next day, after merge. This sprint:

- **B-030 PR gating rule**: no merge until product-owner executes the smoke UAT in Edge and reports ≥ 6/8 cases PASS (any of the perf/correctness cases must be PASS to merge).
- **Wave 0 order**: R1 → R2 → R3 BUILD → R4 inline reviews → **PRE-MERGE UAT** (pause for product-owner) → R5 automated tests → R6 close → merge.
- Fast Track B-009 + B-033 retain the existing "smoke check is the merge gate" pattern (they're S, not L, and runtime behaviour is simpler).

### MEDIUM-1: Fake-DOM drag simulation in tests

Per retro: S22 automated tests covered pure helpers + backend, but not the sidepanel ↔ storage wiring where the same-group-reorder bug lived. This sprint:

- **AC20 added to B-030**: `tests/b030-item-drag-reorder.test.js` MUST include a primitive fake-DOM drag simulation exercising the full sidepanel path (dragstart → dragover × 3 → drop → dispatch). Four cases: same-group drag-to-end, same-group drag-to-start, cross-group, drop-onto-Ungrouped.
- Reuses the `chrome-mock` pattern; DOM shim follows the `tests/b054-sidepanel.test.js` precedent (FakeNode class).

### MEDIUM-2 (from S22 retro): same-group reorder dedicated test

Per retro: same-group drag in S22 silently dropped writes — no test caught it because the cases were implicit (first-to-last, last-to-first happened to exercise reorder but the bug was something else in wiring).

- **AC21 added to B-030**: `tests/sort-order.test.js` (re-created in R3) MUST pin same-group reorder at THREE destinations for a 5-item group: drag-to-start, drag-to-middle, drag-to-end. Asserts final `bulkReorderItems` call is dispatched with the correct update list in each case.

### LOW: frontend-engineer debug strategy for same-group reorder

Per retro: need to pin down the exact failure path. This sprint:

- R3 build starts with a feature-flagged `DRAG_DEBUG` constant (default off); when on, logs every drop-handler branch decision. Engineer walks an Edge UAT pass, confirms execution path matches expectation. Flag stays in code behind `false` default until R4 approval, then removed before merge.

---

## Active Items

### [B-030] Item drag-reorder within / between groups (v2)
- **Tier**: **Spike-First (L)** — Tier 3 escalation per Sprint 22 retro action-item. R0 spike before R1 validates the rAF-coalesced dragover approach in code (not spec) so R1 ACs can encode real-world perf findings.
- **Status**: backlog → in-progress (R0 spike next)
- **Assigned To**: [solution-architect] for R0 spike; then [product-manager] for R1 (incl. UAT plan authoring)
- **Blockers**: None
- **Feature Context**: Same scope as S22 attempt — drag-reorder within group + cross-group move + drop-onto-Ungrouped. Full backend shipped then reverted in S22 (`bulkReorderItems` + `MSG_BULK_REORDER_ITEMS` + `computeItemReorder` helper); S23 re-implements with perf + correctness guardrails baked into ACs.
- **R0 Spike scope**:
  - Feasibility: rAF-coalesced dragover achieves ≤ 16ms pointer-follow on 500 items (AC10 target).
  - Risk flags: scroll-during-drag rect invalidation; Edge browser quirks re: `dataTransfer.effectAllowed`; indicator DOM-reparent vs fixed-position overlay.
  - Major decisions: cache invalidation strategy (on scroll vs on every frame vs hybrid); indicator positioning algorithm (reparent vs transform).
  - Sub-item candidates: if spike reveals the same-group reorder bug is a broadcast-loop issue, split off as B-083 (or similar); if rAF coalescing alone isn't enough, escalate to a fixed-position overlay indicator (separate follow-up).
  - Output: written R0 spike note (1-2 pages) in SPRINT.md or a dedicated `docs/spikes/b-030-v2.md`.

### [B-009] Drag-to-expand collapsed group
- **Tier**: Fast Track (S)
- **Status**: backlog → in-progress (R1 after B-030 R0 spike)
- **Assigned To**: [product-manager] for R1 (UAT plan authoring mandatory per HIGH-2)
- **Blockers**: None — will run R3 after B-030 R3 merges.
- **Feature Context**: unchanged from S22 attempt — hover-hold 600ms over collapsed group header during drag triggers expansion. ACs already authored in S22 R1 (BACKLOG.md — status flip only, no AC rewrite needed).

### [B-033] Drag saved+live item to Open Tabs → demote
- **Tier**: Fast Track (S)
- **Status**: backlog → in-progress (R1 after B-030 R0 spike)
- **Assigned To**: [product-manager] for R1 (UAT plan authoring mandatory)
- **Blockers**: None — will run R3 after B-030 R3 merges.
- **Feature Context**: unchanged from S22 attempt — drag saved+live row into Open Tabs section → `MSG_DEMOTE_ITEM` (existing message from B-017). ACs already authored in S22 R1.

---

## Completed This Sprint

*(none yet — sprint just kicked off)*

---

## Planned Pipeline Parallelization

- **R0 [solution-architect]**: B-030 spike (~1–2 hours). Output: perf feasibility note + cache-invalidation decision + indicator-strategy decision + sub-item split (if any).
- **R1 [product-manager]**: All three items — R1 AC refinement + smoke UAT plan authoring. MUST NOT close R1 until all three `docs/UAT_B-*.md` plans exist with ≥ 6 cases each.
- **R2 [solution-architect]**: B-030 only. Incorporates R0 spike findings into a locked architecture. C-1..C-9 checklist. All perf specs become explicit ACs (HIGH-1).
- **R3 sequencing**:
  1. **Wave 0 — B-030 R3** ([frontend-engineer]): drag infrastructure with perf guardrails baked in. Feature-flagged `DRAG_DEBUG` during build; removed pre-merge.
  2. **Wave 1 — B-009 + B-033 R3** (parallel Fast Track after B-030 merges).
- **R4** per item:
  - **B-030**: [code-reviewer] + [security-reviewer] + [qa-reviewer] — 3 parallel (Full tier). **Enforcement**: [code-reviewer] greps for `getBoundingClientRect` outside rAF → REJECT.
  - **B-009, B-033**: [code-reviewer] + [security-reviewer] parallel (Fast Track).
- **PRE-MERGE UAT for B-030** (NEW gate per HIGH-3): product-owner executes `docs/UAT_B-030.md` in Edge → ≥ 6/8 cases PASS before PR merge.
- **R5** — B-030 only (Full tier automated tests with fake-DOM drag simulation per MEDIUM-1). B-009 + B-033 rely on existing suite + build green.
- **R6** [solution-architect] — **new** chapter `docs/design/36-b-030-item-drag-reorder-v2.md` (NOT the reverted §36; this is the v2 close). Documents as-shipped architecture + S22→S23 lessons-learned addendum.
- **R7** [technical-writer] — CHANGELOG + user manual update.

### Cross-Item Parallelization (per CLAUDE.md P-1/P-2/P-3)

- P-1 Max one L/XL active: ✅ one L (B-030 Spike-First); no other L/XL.
- P-2 S/XS pair with anything: ✅ B-009 + B-033 pair with B-030.
- P-3 Max two M in parallel: ✅ zero M items.
- P-4 Interleave, don't overlap: B-030 R3 + pre-merge UAT + merge BEFORE B-009 + B-033 R3 start.

---

## Sprint 23 Goals (Definition of Success)

1. B-030 drag-reorder infrastructure shipped and **UAT-validated in Edge before PR merge** — Full tier L with R0 spike + R1-authored UAT plan.
2. B-009 drag-to-expand + B-033 drag-to-demote shipped on top of B-030.
3. All three items have R1-authored UAT plans on disk (`docs/UAT_B-030.md` with perf probes, `docs/UAT_B-009.md`, `docs/UAT_B-033.md`).
4. B-030 test coverage includes fake-DOM drag simulation covering the full sidepanel path.
5. v1.17.0 ships drag foundation v2 (the release S22 was meant to be).
6. Zero S22-style regressions: B-008 group drag remains performant; same-group reorder works; no UAT FAIL on core cases.

---

## Scope Change Log

*(none yet)*

---

## Status: ACTIVE — R0 spike for B-030 next
