# Current Sprint

*Sprint 22 — Drag foundation: B-030 item drag-reorder + B-009 drag-to-expand + B-033 drag-to-Open-Tabs demote. Kicked off 2026-04-20 per FEATURE_PARITY_ROADMAP.*

First sprint under the feature-parity roadmap. First Full-tier L item (B-030) since Sprint 17's B-042/B-043. Every feature ships with a 5–10 case smoke UAT plan authored during R1 (Sprint 21 retro MEDIUM action item).

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved: B-030 L + B-009 S + B-033 S (drag foundation theme per FEATURE_PARITY_ROADMAP.md, adjusted from original roadmap — see Scope Change Log)
- ✅ Total effort: 1L + 2S — matches P-1 (one L) + P-2 (S pairs with anything)
- ✅ **Deps-resolved check** (Sprint 20 B-071):
  - **B-030** (Item drag-reorder): deps B-001 ✅ (done), B-008 ✅ (done) — both resolved
  - **B-009** (Drag-to-expand collapsed): deps B-008 ✅, B-030 ⬜ (in this sprint) — resolved per Gate 6 "done OR in-sprint" rule
  - **B-033** (Drag to Open Tabs → demote): deps B-017 ✅, B-030 ⬜ (in-sprint), B-055 ✅ — all resolved
- ✅ Sprint 21 closed 2026-04-20; v1.16.0 tag on `release/v2`; archive commit `84b2259`

---

## Scope Change Log

**2026-04-20 — S22 ↔ S23 swap at kickoff.** Original FEATURE_PARITY_ROADMAP scheduled B-025 + B-031 + B-032 for S22, but each of those three depends on **B-030** (the drag infrastructure foundation), which was scheduled for S23. Gate 6 deps-resolved check caught the ordering mismatch. **Swap applied**: drag foundation (B-030 + helpers) lands in S22 so S23 can ship the drag stack (B-025 + B-031 + B-032) with all deps resolved. Roadmap doc updated; no velocity impact.

---

## Active Items

### [B-030] Item drag-reorder within / between groups
- **Tier**: Full (L) — first Full-tier L since Sprint 17
- **Status**: backlog → in-progress (R1 next)
- **Assigned To**: [product-manager] for R1 AC refinement; current BACKLOG ACs are concept-level (v1.0 pre-R1-discipline era)
- **Blockers**: None
- **Feature Context**: The drag infrastructure foundation. Enables drag-reorder within a group and drag-move between groups; rewrites affected items' sortOrder values in a single `writeTransaction` (atomic); normalises sortOrder post-drop (no gaps or duplicates). Every other drag feature (B-025 multi-item, B-031 group drag, B-032 auto-scroll, B-009 drag-to-expand, B-033 drag-to-demote) sits on this.
- **Handoff Notes**:
  - **C-8 (SW-context)**: all drag logic runs in sidepanel; R2 to confirm no SW-context API issues.
  - **C-9 (empty-state)**: enumerate drop states — drop on empty group, drop at group-section start, drop at list end, drop on ungrouped, drop on current group (no-op), drag cancel via Escape, invalid drop target (hover out).
  - **C-1 (storage schema)**: item `sortOrder` already exists (B-001a); no schema change. Batch updates in a single `writeTransaction`.
  - **Performance**: drag response < 16 ms (60 fps pointer follow); post-drop storage write < 50 ms for typical reorder (5-20 items touched).
  - **A11y**: native DnD isn't keyboard-operable; match B-008 AC12's deferral disclosure pattern.
- **Smoke UAT plan**: `docs/UAT_B-030.md` — 8-case smoke plan authored in R1.

### [B-009] Drag-to-expand collapsed group
- **Tier**: Fast Track (S)
- **Status**: backlog → in-progress (R1 next)
- **Assigned To**: [product-manager] for R1 refinement
- **Blockers**: None — B-030 ships in same sprint; order this item's R3 after B-030's R3 so the drag-enter event is live.
- **Feature Context**: While dragging an item, hovering over a **collapsed** group header for ~600 ms auto-expands that group so the user can drop the item inside. Prevents accidental expansions on fast cursor passes by gating on dwell time. Delay hysteresis + cancellation on `dragleave` keeps the behaviour predictable.
- **Handoff Notes**:
  - **C-9 (empty-state)**: define behaviour on hover-hold over (a) collapsed sub-group, (b) collapsed top-level group, (c) already-expanded group (no-op), (d) drag end while still hovering (no collapse-back), (e) fast pass (no expansion).
  - Run R3 AFTER B-030 R3 merge — needs the `dragover` event pipeline in place.
- **Smoke UAT plan**: `docs/UAT_B-009.md` — 6-case smoke plan authored in R1.

### [B-033] Drag saved+live item to Open Tabs → demote
- **Tier**: Fast Track (S)
- **Status**: backlog → in-progress (R1 next)
- **Assigned To**: [product-manager] for R1 refinement
- **Blockers**: None — B-030 ships in same sprint; B-055 Open Tabs section already live.
- **Feature Context**: Drag a saved+live item out of its group onto the Open Tabs drop zone → the item demotes (saved aspect removed; live tab stays open; item now renders in Open Tabs). No confirmation required (intent is explicit via the drag gesture + destination).
- **Handoff Notes**:
  - **DoR Gate 7 (NEW Sprint 21 B-077)**: destructive-action confirmation = **waived** (drag gesture to a destination section IS the confirmation; matches B-017 click-to-demote pattern). Rationale recorded up-front in AC block.
  - **C-9 (empty-state)**: drag saved-only item (no live tab) onto Open Tabs — rejected (nothing to demote to). Drag live-only item — no-op (already ungrouped live). Drag from Open Tabs back — not a demote (that's B-017 promote path).
  - Run R3 AFTER B-030 R3 merge.
- **Smoke UAT plan**: `docs/UAT_B-033.md` — 6-case smoke plan authored in R1.

---

## Completed This Sprint

*(none yet — sprint just kicked off)*

---

## Planned Pipeline Parallelization

- **R1 [product-manager]**:
  - **B-030, B-009, B-033** — R1 REQUIRED. Current BACKLOG ACs are concept-level. PM authors PASS/FAIL ACs per B-003/B-006/B-007 precedent + DoR Gate 7 check (new B-077 subsection) + smoke UAT plan (per Sprint 21 retro action #2).
  - Three items in R1 parallel (independent AC authoring).
- **R2 [solution-architect]**:
  - **B-030** — R2 REQUIRED (Full tier L). Runs C-1..C-9 checklist. Key question: whether to extend `sortOrder` normalization logic from B-008 (group reorder) or introduce a new per-partition normaliser.
  - **B-009, B-033** — R2 skipped (Fast Track S).
- **R3 sequencing**:
  1. **Wave 0 — B-030 R3** ([frontend-engineer]): drag infrastructure — dragstart, dragover, drop, sort-order rewrite, storage commit. MUST merge first.
  2. **Wave 1 — B-009 + B-033 R3** (parallel Fast Track, after B-030 lands): hover-hold expansion + drop-zone demote. Both sit on the drag pipeline.
- **R4** per item:
  - **B-030**: [code-reviewer] + [security-reviewer] + [qa-reviewer] — 3 parallel (Full tier).
  - **B-009, B-033**: [code-reviewer] + [security-reviewer] parallel (Fast Track).
- **R5** — B-030 only (Full tier automated tests). B-009 + B-033 rely on existing suite + build green.
- **R6** [solution-architect] — new chapter `docs/design/36-b-030-item-drag-reorder.md` documenting the drag architecture. B-009 + B-033 get brief sections if warranted.
- **R7** [technical-writer] — CHANGELOG + user manual update for all three (user-visible drag behaviour).

### Cross-Item Parallelization (per CLAUDE.md P-1/P-2/P-3)

- P-1 Max one L/XL active: ✅ one L (B-030); no other L/XL.
- P-2 S/XS pair with anything: ✅ B-009 + B-033 pair with B-030.
- P-3 Max two M in parallel: ✅ zero M items.
- P-4 Interleave, don't overlap: B-030 R3 completes BEFORE B-009 + B-033 R3 start (they depend on the drag pipeline being in place).

---

## Sprint 22 Goals (Definition of Success)

1. B-030 drag-reorder infrastructure shipped — Full tier L with all 7 rounds + smoke UAT plan (8 cases).
2. B-009 drag-to-expand collapsed group shipped — Fast Track S + 6-case smoke UAT.
3. B-033 drag-to-Open-Tabs demote shipped — Fast Track S + 6-case smoke UAT.
4. v1.17.0 ships the drag foundation.
5. Per-feature smoke UAT plans live at `docs/UAT_B-030.md`, `docs/UAT_B-009.md`, `docs/UAT_B-033.md` (all DEFERRED for user execution in S27 comprehensive sweep + light session-based smoke pass if product-owner chooses).
6. Storage schema unchanged; `sortOrder` normalisation logic generalised (if extracted from B-008) into a `shared/*` helper — Sprint 21 retro action #3 pattern (B-007's `filterGroupParentCandidates` style).

---

## Status: ACTIVE — R1 AC authoring next (all 3 items)
