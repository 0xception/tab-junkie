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
- **Status**: R1 ✅ (15 PASS/FAIL ACs + smoke UAT plan referenced) · R2 ✅ (architecture review below) · R3 next
- **Assigned To**: [frontend-engineer] for R3 build
- **Blockers**: None
- **Smoke UAT plan**: `docs/UAT_B-030.md` — 8-case smoke plan (TBD during R3).

#### R2 Architecture Review — PASS

**Correctness Checklist (C-1..C-9)**:

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| C-1 | Storage schema versioned | ✅ N/A — `sortOrder` + `groupId` fields exist on Item records since B-001a §32.5.2; no migration |
| C-2 | Message contracts typed | ⚠️ **NEW** message `MSG_BULK_REORDER_ITEMS` required (see D-1 below) |
| C-3 | SW cold-start safe | ✅ All drag logic runs in sidepanel DOM; no SW-memory state |
| C-4 | ID stability | ✅ Items keep ids through drag; only `sortOrder` + optional `groupId` change |
| C-5 | Manifest file refs | ✅ No change |
| C-6 | Permission minimization | ✅ Zero new permissions (drag is DOM-level) |
| C-7 | Allow-list direction | ✅ N/A — no new sanitizer/validator surface |
| C-8 | SW-context feasibility | ✅ All drag APIs (`dragstart`, `dragover`, `drop`, `dragend`) are sidepanel-side; no SW browser-API calls |
| C-9 | Empty-state design | ✅ AC13 enumerates 7 states (empty group drop / start / end / between / Open Tabs invalid / self-drop no-op / group-header drop) |

**Key design decisions** (R3 will follow):

**D-1 — Storage write path**: `bulkUpdateItems` exists (`background/storage/items.js:467`) but is locked to **uniform-patch, groupId-only** semantics (AC enforced at line 485). B-030 needs **per-item `sortOrder` values** — the existing function can't express this. Decision: introduce a new storage function + message:
- **NEW storage fn**: `bulkReorderItems(updates: Array<{id, sortOrder, groupId?}>)` in `background/storage/items.js`. Single `writeTransaction`; per-item `sortOrder` write; optional `groupId` change for cross-group moves. Follows the `bulkCreateItems` / `bulkDeleteItems` precedent from B-005 / B-020.
- **NEW message**: `MSG_BULK_REORDER_ITEMS` in `shared/messages.js`. Handler in `background/messages/storage-handlers.js` dispatches to `bulkReorderItems`.
- **Do NOT extend** `bulkUpdateItems` signature — keeping "uniform patch" vs "per-id patch" as separate functions preserves existing caller safety (B-024 bulk action bar, B-028 selection context menu both use the uniform form).

**D-2 — Sort-order normalisation helper**: per Sprint 21 retro action #3 + B-065 precedent. Extract to `shared/sort-order.js`:
- **`normalizeItemSortOrder(items, affectedGroupIds)`** — takes a collection snapshot + set of groupIds touched by the reorder, returns `Array<{id, sortOrder}>` with consecutive integers (0, 1, 2, ...) within each affected group. Stable sort; breaks ties by pre-existing sortOrder then id.
- The helper is DOM-free + chrome.*-free; sidepanel consumes it for pre-dispatch computation; R3 tests exercise it directly.
- B-008's in-sidepanel group-reorder renumbering is NOT extracted in this sprint (out of scope); the new helper is item-scoped.

**D-3 — DOM-side drag mechanics**:
- **Reuse** the existing `dropIndicatorEl` (`sidepanel/sidepanel.js:258` — imperatively created, used by B-008 group-reorder). Same visual element; different parent scope during item drag (inside a `.group-items` container vs between `.group-section` blocks). The indicator gets a `.drop-indicator--item` modifier class during item-drag for future styling differentiation if needed.
- **Event delegation** on `#item-list` (existing pattern from B-024 multi-select click handling). `dragstart` / `dragover` / `dragleave` / `drop` / `dragend` all hang off the list element; no per-row listeners (memory-safe at 1000 items).
- **Drag state**: module-level `_itemDragState = { itemId, sourceGroupId, sourceIndex, pointerY, dropTarget }`. Cleared on every `dragend` (success or cancel).
- **Insertion indicator positioning**: `dragover` is high-frequency (~60-120 Hz). Positioner coalesces DOM writes via `requestAnimationFrame`; bounding-rect reads cached per-drag (refreshed on `dragstart` + on the first `dragover` after any scroll event). Target ≤ 16 ms pointer-follow latency per AC10.

**D-4 — Drop commit flow**:
1. On `drop`, compute the new position: nearest row-index within the hovered `.group-items` container (or 0 if the container is empty).
2. Build the reorder spec: for each item in the affected groups (source + destination if different), compute post-drop `sortOrder` via `normalizeItemSortOrder`.
3. Dispatch `MSG_BULK_REORDER_ITEMS { updates }` via `sendMessage`. Single round-trip; single `writeTransaction` on the SW side.
4. On success, broadcast scope-targeted `MSG_STATE_CHANGED { scope: SCOPE.ITEMS }` (existing pattern).
5. The broadcast triggers a sidepanel re-render (or targeted DOM patch via the B-052 search-index diffAndPatch path if the change set is small).

**D-5 — Cancel semantics** (per AC8):
- Escape during drag → `dragend` fires with `dataTransfer.dropEffect === 'none'`; state-restore path: hide indicator, clear `_itemDragState`, NO dispatch. DOM didn't change pre-drop (the indicator is a SEPARATE element, not a DOM reparent) so no visual revert needed.
- Release outside valid target → same cancel path as Escape.
- **Partial-commit safety**: the `writeTransaction` atomically commits or rolls back. There is no "partial state". If the commit fails (ERR_QUOTA_EXCEEDED, etc.), the caller toasts the error and no storage change lands.

**D-6 — Cross-ownership with B-033**: the Open Tabs section is a valid drop target for **demote** (B-033 scope), NOT for reorder. B-030's drop handler runs `target.closest('.group-items')` to identify item-reorder drops; Open Tabs container (if it gains a `[data-drop-target="openTabs"]` marker during R3) short-circuits to the B-033 path. AC7 encodes this. R3 order: B-030 ships the drop-target classification; B-033 R3 wires its demote handler on top, relying on B-030's classification.

**D-7 — A11y** (per AC12): native HTML5 DnD is not keyboard-operable (browser limitation). Each `.item-row` gains a `title="Drag to reorder (keyboard reorder not yet available)"` attribute. Matches B-008 AC12's disclosure pattern. A keyboard-reorder alternative is OUT OF SCOPE — file a follow-up item only if prioritised later.

**D-8 — Perf budget** (per AC10 + AC11):
- **Pointer-follow P95 ≤ 16 ms** on 500-item collection: measured via `performance.now()` spans around `dragover`. Budget assumes rAF-coalesced indicator writes + cached rects.
- **Post-drop storage write P95 ≤ 50 ms** on 500-item collection with 5-20 items touched: one `writeTransaction` round-trip; `chrome.storage.local.set` with ~20 items' patches is well under this budget per B-001a AC9.

**Dependencies / integration surface**:
- `shared/messages.js` — add `MSG_BULK_REORDER_ITEMS` export
- `background/storage/items.js` — add `bulkReorderItems` export
- `background/storage/index.js` — re-export `bulkReorderItems`
- `background/messages/storage-handlers.js` — register `MSG_BULK_REORDER_ITEMS` handler + `SCOPE.ITEMS`
- `shared/sort-order.js` — NEW file, pure helpers
- `sidepanel/sidepanel.js` — drag event wiring + state; consume `normalizeItemSortOrder`; dispatch `MSG_BULK_REORDER_ITEMS`
- `sidepanel/sidepanel.css` — `.drop-indicator--item` modifier (if differentiation needed)
- `tests/b030-item-drag-reorder.test.js` — ~7 tests per AC15
- `tests/sort-order.test.js` — NEW pure-helper tests
- `docs/design/36-b-030-item-drag-reorder.md` — R6 close chapter

**R2 verdict**: **PASS**. Zero new permissions; zero storage schema drift; one new purpose-built bulk-reorder function + message; extracted helper module per B-065 precedent; all C-1..C-9 checks satisfied. R3 is unblocked.

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
