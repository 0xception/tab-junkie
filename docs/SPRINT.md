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
- **Tier**: **Spike-First (L)** — Tier 3 escalation per Sprint 22 retro action-item.
- **Status**: R0 spike ✅ (below) · R1 next
- **Assigned To**: [product-manager] for R1 (incl. UAT plan authoring — blocked until UAT plans on disk per HIGH-2)
- **Blockers**: None
- **Feature Context**: Same scope as S22 attempt — drag-reorder within group + cross-group move + drop-onto-Ungrouped. Backend (`bulkReorderItems` + `MSG_BULK_REORDER_ITEMS`) shipped+reverted in S22; re-implementation can reuse the ACs for the backend surface but MUST reuse nothing from the sidepanel drag handlers (that's where the bugs lived).

#### R0 Spike — decisions locked

**Perf feasibility (≤16ms pointer-follow on 500 items)**

S22 failure mode was layout thrashing: dragover at 60–120 Hz called `getBoundingClientRect` on every `.item-row` AND mutated DOM (`dropIndicatorEl.before()`) in the same handler, forcing synchronous reflow on each mutation-then-read cycle. The v2 architecture eliminates this via **four concurrent strategies**:

| # | Strategy | How it kills the S22 perf bug |
|---|----------|-------------------------------|
| **S-1** | `requestAnimationFrame` coalescing | Dragover just records `pointerY + pointerX` (cheap primitives); DOM work runs in a single rAF callback per frame. At 60 Hz ceiling, the worst-case update rate is 60× per second, not 120× |
| **S-2** | Per-drag rect cache | At `dragstart`, snapshot all `.item-row` rects into an array keyed by row id. Invalidate ONLY on `scroll` events fired on `itemListEl` within the drag window. No rect reads during dragover |
| **S-3** | `elementFromPoint` target detection | Cheap browser API — no layout forced, no DOM traversal. Returns the element at (pointerX, pointerY); we walk up to the `.item-row` ancestor |
| **S-4** | Transform-positioned indicator | Indicator is `position: absolute` inside `itemListEl` (relatively positioned parent). Moving via `style.transform = 'translateY(N)'` uses the compositor — zero layout. Replaces S22's `.before()` / `.appendChild()` which reparented the DOM node and invalidated layout |

**Architecture decisions**:

- **D-A**: Indicator lives at a stable DOM position (appended once to `itemListEl` at dragstart). Position via transform only. Hidden via `opacity: 0` rather than `hidden` attr to avoid layout flicker.
- **D-B**: Cache invalidation: `itemListEl.addEventListener('scroll', invalidateCache, { passive: true })` registered at dragstart, removed at dragend. One rebuild per scroll event, not per rAF tick.
- **D-C**: Target detection: `document.elementFromPoint(pointerX, pointerY)?.closest('.item-row')`. Returns null if pointer is outside any item row → indicator hides.
- **D-D**: Drop-position computation: use cached rect's `top + height/2` midpoint. No fresh `getBoundingClientRect` call at drop time either.
- **D-E**: Skip-no-op: rAF callback compares `nextInsertBefore` vs `lastInsertBefore`; if same, skips the DOM update. Prevents visual jitter + unneeded work.

**Same-group correctness bug — hypothesis + debug strategy**

Without a live repro, best hypothesis: S22's drop handler computed `destIndex` from `container.children.indexOf(dropIndicatorEl)` but the indicator was reparented via `.before()`/`.appendChild()` during each dragover, so its parent might NOT match the "target container" at drop time in edge cases (e.g., dragover fires on a sibling group's `.group-items`, indicator moves; then drop event fires before next dragover re-positions it). This is a timing / DOM-state-synchronisation bug.

**v2 mitigation (inherent to the new architecture)**: the indicator never reparents. Drop handler reads the computed target from `_itemDragState.pendingTargetRowId + pendingInsertPosition` (set by the rAF callback), NOT from the indicator's DOM position. Decouples visual state from logical state.

**Additional debug strategy (LOW retro action)**:
- Feature-flagged `DRAG_DEBUG = false` module-level constant in sidepanel.js
- When `true`: logs `[drag]` prefixed messages at every branch in dragstart / rAF-tick / drop / dragend
- R3 sets `DRAG_DEBUG = true` for the targeted Edge UAT pass; flipped back to `false` pre-merge

**Risk flags**

| Risk | Severity | Mitigation |
|------|----------|------------|
| `elementFromPoint` returns indicator itself when pointer hovers over it | MEDIUM | Indicator has `pointer-events: none` CSS → never a hit-test target |
| Scroll during drag invalidates cache; rebuild cost | LOW | Cache rebuild is one rAF tick (~2–5ms for 500 rows); acceptable transient |
| Edge browser `dataTransfer.effectAllowed` quirk | LOW | Defensive `try { setData(...) } catch {}` retained from S22; Chromium-based Edge behaves like Chrome |
| Reordering during active broadcast re-render race | MEDIUM | Guard: dragstart stores `_itemDragState.cachedItemsGeneration`; drop checks if `_cachedItems` gen matches — if not (broadcast landed mid-drag), re-fetch fresh items before computing the reorder spec |
| rAF tick runs WHILE user is mid-scroll (cache invalidated, not yet rebuilt) | LOW | rAF callback short-circuits if cache invalid: hide indicator, skip this frame, wait for next |

**Sub-item split decision**: **NO split**. The backend (`bulkReorderItems` + message) shipped correctly in S22 and doesn't need re-implementation — the bugs were entirely in the sidepanel drag handler. One cohesive L item is the right shape.

**R0 verdict — PASS**: perf budget (≤16ms) is achievable with rAF + cached rects + transform indicator. The same-group bug root-cause (likely DOM-state-coupling via `dropIndicatorEl.parentElement`) is eliminated by design in v2 (logical state decoupled from visual indicator position). R1 unblocked.

#### R2 Architecture Review — PASS — R3 binding contracts

**Correctness Checklist (C-1..C-9)** — re-run against v2 with the new ACs:

| # | Check | Verdict (v2) |
|---|-------|--------------|
| C-1 | Storage schema versioned | ✅ N/A — unchanged from S22 R2; `sortOrder` + `groupId` ship since B-001a |
| C-2 | Message contracts typed | ✅ N/A — `MSG_BULK_REORDER_ITEMS` shipped in S22, reverted, and can be re-shipped byte-identical; backend `bulkReorderItems` tests passed in S22 so the storage surface is known-good |
| C-3 | SW cold-start safe | ✅ — all drag state in sidepanel module |
| C-4 | ID stability | ✅ — items keep ids; sortOrder / groupId only |
| C-5 | Manifest file refs | ✅ — no change |
| C-6 | Permission minimization | ✅ — zero new permissions |
| C-7 | Allow-list direction | N/A — no new sanitizer |
| C-8 | SW-context feasibility | ✅ — all drag APIs sidepanel-side |
| C-9 | Empty-state design | ✅ — ACs 13 + 16-24 enumerate all states + perf/correctness edge cases |

**Architecture shape — 3 sidepanel helpers + 1 CSS decision**

The sidepanel drag logic MUST split into three cohesive functions + constants, each with a bounded responsibility. This replaces S22's monolithic inline drag-handler block.

| Module | Location | Responsibility | Inputs | Outputs |
|--------|----------|----------------|--------|---------|
| **`_dragRectCache`** | `sidepanel/sidepanel.js` (module-level state) | At dragstart, snapshot all `.item-row` client-rects into `Map<itemId, DOMRectReadOnly>`. Invalidate on scroll; rebuild lazily on next rAF tick. | dragstart event / scroll event | `Map` keyed by `itemId`; `invalid: boolean` flag |
| **`_scheduleDragTick()`** | `sidepanel/sidepanel.js` | rAF-coalesce indicator position updates. Dragover sets `_pendingPointerY + _pendingPointerX`; `_scheduleDragTick` ensures at most one `requestAnimationFrame` is pending. | `pointerY`, `pointerX` (module-level state) | Side effect: indicator CSS transform + `_itemDragState.pendingTargetRowId` + `pendingInsertPosition` |
| **`_computeDropTarget(pointerX, pointerY)`** | `sidepanel/sidepanel.js` | Pure-ish helper: given pointer coords + the rect cache + DOM, returns `{targetRowId, insertPosition: 'before'|'after', targetGroupId}` or `null`. Uses `document.elementFromPoint` for cheap target detection. | pointer coords | Target descriptor or null |
| **Indicator element** | `sidepanel/sidepanel.js` + `sidepanel/sidepanel.css` | Existing `dropIndicatorEl` (created at `sidepanel.js:258`) repurposed. CSS: `position: absolute`, `pointer-events: none`, default `opacity: 0`. Moved via `style.transform = 'translateY(Npx)'`. Never reparented during item drag (remains a single child of `itemListEl`). | `translateY` value from `_scheduleDragTick` | Visual indicator |

**R3 binding contracts** — these are the "must implement" interfaces R4 will enforce:

```
// Module-level state (sidepanel.js)
let _itemDragState = null; // {itemId, sourceGroupId, cachedItemsGen, pendingTargetRowId, pendingInsertPosition, rafHandle}
let _dragRectCache = null; // {rects: Map<itemId, DOMRectReadOnly>, invalid: boolean}
let _pendingPointerY = null, _pendingPointerX = null;
const DRAG_DEBUG = false;  // feature-flagged console.log; TRUE during R3 debug pass, flipped false pre-merge

// Contract #1: dragstart handler
// - Sets _itemDragState with cachedItemsGen = current _cachedItemsGen
// - Builds _dragRectCache via SINGLE pass over .item-row elements (ONE getBoundingClientRect call per row, once)
// - Attaches passive scroll listener on itemListEl that sets _dragRectCache.invalid = true
// - Sets indicator's CSS transform to hide it off-screen AND opacity 0

// Contract #2: dragover handler (PERF-CRITICAL — AC16, AC17)
// - MUST NOT call getBoundingClientRect
// - MUST NOT perform DOM mutations (no classList writes, no style assignments other than via rAF)
// - MUST NOT compute layout
// - Body limited to: e.preventDefault(); e.dataTransfer.dropEffect='move';
//   _pendingPointerY = e.clientY; _pendingPointerX = e.clientX;
//   _scheduleDragTick();
// - Any additional logic is a REJECT at R4

// Contract #3: _scheduleDragTick
// - If rafHandle already set, return early (dedupe)
// - Otherwise, rafHandle = requestAnimationFrame(_dragTick)
// - _dragTick:
//   1. Clear rafHandle
//   2. If cache invalid: rebuild via one pass (acceptable layout cost, batched)
//   3. Call _computeDropTarget(pointerX, pointerY) → target descriptor
//   4. If target === last-committed target: skip (AC: skip-no-op)
//   5. Write indicator CSS transform + opacity (SINGLE rAF-scoped DOM write)
//   6. Update _itemDragState.pendingTargetRowId + pendingInsertPosition

// Contract #4: drop handler (CORRECTNESS-CRITICAL — AC24 broadcast-race guard)
// - e.preventDefault()
// - If _itemDragState.pendingTargetRowId is null → cancel (no dispatch)
// - If _itemDragState.cachedItemsGen !== _cachedItemsGen → await sendMessage(MSG_LIST_ITEMS) first, update _cachedItems, then proceed
// - Resolve destGroupId from pendingTargetRowId (look up cached item's groupId, or __ungrouped__ marker)
// - Compute destIndex from pendingTargetRowId + pendingInsertPosition
// - updates = computeItemReorder(_cachedItems, draggedId, destGroupId, destIndex)
// - If updates.length === 0 → no-op (same-position drop); no dispatch
// - sendMessage(MSG_BULK_REORDER_ITEMS, {updates}) with error-path toast
// - Clear _itemDragState, indicator off-screen, remove scroll listener

// Contract #5: dragend / escape
// - Cancel rafHandle if pending
// - Clear indicator (transform off-screen, opacity 0)
// - Remove scroll listener
// - Clear _itemDragState

// Contract #6: CSS — `sidepanel/sidepanel.css`
// - itemListEl gains `position: relative` (so indicator's absolute positioning works)
// - .drop-indicator: `position: absolute; pointer-events: none; opacity: 0; transition: none;` — no transitions mid-drag
// - Item-drag-active modifier class `.is-item-dragging` on itemListEl to set indicator opacity: 1 only when needed
```

**Cache invalidation strategy (D-B refinement)**

- Scroll listener registered ONCE at dragstart with `{ passive: true }`
- Listener body: `_dragRectCache.invalid = true` (no rebuild inline — lazy rebuild in next rAF tick)
- Rebuild cost: O(N) rect reads once — acceptable because (a) batched inside rAF tick with no intervening mutations, and (b) scroll events typically fire at ≤ 10 Hz, not per-frame
- AC19 budget accounts for this: base 500 (initial snapshot) + optional scroll-triggered rebuilds capped at 5

**Target-detection strategy (D-C)**

`document.elementFromPoint(x, y)` returns the element at coordinates (x, y). The indicator has `pointer-events: none` so it's transparent to hit-testing (AC23 guard). Walk up via `.closest('.item-row')` to find the row. Walk up to `.group-section` for the group. If row not found: check for `.group-items` container (empty group) or `Open Tabs` section (B-033 territory — B-030 treats as invalid drop).

**Indicator positioning math (D-D)**

Given a `targetRow` + `insertPosition`:
- `targetRect = _dragRectCache.rects.get(targetRow.dataset.itemId)`
- `containerRect = itemListEl.getBoundingClientRect()` (ONE call at dragstart, cached in `_containerRect`)
- If `insertPosition === 'before'`: `translateY = targetRect.top - containerRect.top`
- Else (`'after'`): `translateY = targetRect.bottom - containerRect.top`

All coords in container-local space. Indicator's absolute positioning consumes the value directly.

**Test strategy (v2)**

| Layer | Coverage | Assertion |
|-------|----------|-----------|
| `tests/sort-order.test.js` | `computeItemReorder` pure helper | 10 existing cases (from S22 helper, to be re-authored in R3) + AC21 three-destination same-group cases |
| `tests/b030-item-drag-reorder.test.js` — backend layer | `bulkReorderItems` + MSG handler | 8 existing cases (from S22, re-authored) — AC4/AC5/AC6/atomic-tx/validation/unknown-id/unknown-group/non-finite |
| `tests/b030-item-drag-reorder.test.js` — fake-DOM layer (NEW per AC20) | Full sidepanel drag path | 4 cases: same-group drag-to-end, same-group drag-to-start, cross-group, drop-onto-Ungrouped. Asserts correct `MSG_BULK_REORDER_ITEMS` dispatch spec. |
| `tests/b030-item-drag-reorder.test.js` — perf assertion (NEW per AC19) | `getBoundingClientRect` call count | 3-second simulated drag on 500 rows; assert ≤ 510 calls total |
| **In-browser UAT** (NEW per HIGH-3) | 9 cases per `docs/UAT_B-030.md` | Required ≥ 6/9 PASS + UAT-1 + UAT-6 PASS before PR merge |

**Rollback plan**

Sprint 22 taught that reverts work cleanly. Rollback procedure if UAT fails post-merge:
1. `git revert <merge-sha>` on `release/v2` — undoes all code, test, doc changes atomically.
2. Preserved artefacts after revert: BACKLOG.md ACs stay, UAT plans stay, this R2 block stays, design-chapter (R6) is removed by revert.
3. B-030 returns to `backlog` status; Sprint re-plans per the Sprint 22 revert precedent.

**R3 pre-flight checklist** — [frontend-engineer] confirms before starting the build:

- [ ] I've read all 24 ACs in BACKLOG.md for B-030.
- [ ] I've read `docs/UAT_B-030.md` — UAT-1 + UAT-6 are the merge-gate cases.
- [ ] I will NOT call `getBoundingClientRect` outside a rAF callback (AC16 — R4 greps for this).
- [ ] I will NOT perform DOM mutations in the `dragover` handler body (AC17).
- [ ] I will register the scroll listener as `{ passive: true }` at dragstart; remove at dragend.
- [ ] I will use `document.elementFromPoint` for target detection, not `event.target.closest`.
- [ ] The indicator will be `position: absolute` inside a `position: relative` parent, moved via `style.transform`.
- [ ] Indicator will have `pointer-events: none` in CSS.
- [ ] I will set `DRAG_DEBUG = false` before PR (may flip to `true` during development for Edge debug pass).
- [ ] The `computeItemReorder` pure helper + `bulkReorderItems` backend + `MSG_BULK_REORDER_ITEMS` are re-authored byte-identical to the S22 backend (known-good code).
- [ ] Fake-DOM drag simulation tests exercise all four required cases (AC20) + perf call-count assertion (AC19).

**R2 verdict — PASS**. Architecture locked. All 24 ACs are unambiguous. R3 has binding contracts, not suggestions. R1 UAT plans gate the merge. Rollback path is proven.

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
