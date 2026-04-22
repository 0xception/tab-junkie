# §38 — B-031 Group Drag-Reorder + Nesting via Drag (R6 Close)

**Sprint**: 24 · **Tier**: Full (M) · **Status**: Shipped — UAT 11/11 PASS in Edge (pre-merge, user-driven per S23 retro HIGH-3)
**Dependencies (all done)**: B-007 sub-group nesting, B-008 group reorder + collapse, B-030 v2 drag foundation

---

## §38.1 Overview

B-031 adds a second drag mode on top of B-008's existing group-header drag: a pointer-position-sensitive dual-behavior drop that either **REORDERS** top-level groups (outer 25% zones of a target header) or **NESTS** the dragged group into the target (middle 50% of the header) — with the nesting path gated by the same sub-group constraints B-007 enforces in the dialog. The feature operates strictly on `sortOrder` + `parentId` of existing group records; it does not add storage schema, permissions, manifest keys, or SW-context surface. Its novelty is entirely in the sidepanel: a new mode-aware drag state machine, a second drag-indicator visual primitive (nest highlight + rejection flash), and a second `bulkReorderGroups` message/handler mirroring B-030's item-side plumbing. By reusing `filterGroupParentCandidates` as the single source of truth for valid nest targets and `computeGroupReorder` (new, parallel to `computeItemReorder`) for sort-order math, B-031 extends the drag stack without forking logic.

**Terminology flag**: R1 ACs write `parentGroupId` (AC7 / AC10) while the schema field is `parentId` (per B-001a, B-007). **Code MUST use `parentId`** — the field name in the database. This is a documentation issue in the ACs; R4 should not re-raise as a spec deviation.

## §38.2 Reuse surface

| Reused from | Artifact | Use |
|---|---|---|
| B-007 | `shared/group-nesting.js#filterGroupParentCandidates` | **MANDATORY** single source of truth for valid-nest target set. Invoked once at dragstart; projected to `Set<groupId>` for O(1) lookup in rAF tick. |
| B-007 | `shared/group-nesting.js#translateGroupError` | Maps storage-layer errors to toast copy if broadcast-race slips past UI pre-filter. |
| B-008 | `_dragInitiatedFromHandle` mousedown gate | Unchanged — disambiguates handle-grab from header-click. |
| B-008 | `.group-drag-handle` + `section.draggable = true` + dataset | DOM hooks unchanged. |
| B-008 | `_pendingGroupsRender` broadcast-defer flag | Unchanged — defers `scope === 'groups'` re-renders until dragend. |
| B-030 v2 | `_buildDragRectCache` / `_scheduleDragTick` / `_dragTick` pattern | Parallel instance `_buildGroupDragRectCache` / `_scheduleGroupDragTick` / `_groupDragTick` keyed by groupId over `.group-header` elements. |
| B-030 v2 | `MSG_BULK_REORDER_ITEMS` storage pattern (`writeTransaction` + `normaliseGroupSortOrders`) | `bulkReorderGroups` mirrors shape (single atomic tx, per-record updates, post-normalise). |
| B-030 v2 | `_cachedItemsGen` broadcast-race guard | New `_cachedGroupsGen` counter follows same pattern. |
| B-030 v2 | `#item-list { position: relative }` | Reused as positioning root for new reorder indicator. |
| B-001a / B-006 | Backend `updateGroup` depth + cycle enforcement | Storage remains fail-closed; UI is pre-filter only. |

## §38.3 Decision resolutions

### D-1 — Message contract: **`MSG_BULK_REORDER_GROUPS` (new type)**

**Typed shape** (`shared/messages.js`):

```
/**
 * B-031 — bulk-reorder groups. Accepts per-group updates in a single
 * writeTransaction; handler normalises sortOrder within each affected
 * depth bucket (top-level siblings, or children of a parentId) to
 * consecutive integers. Partial-success semantics.
 *
 * @typedef {Object} GroupReorderUpdate
 * @property {string} id
 * @property {number} sortOrder
 * @property {string|null} [parentId]   present only when changing parentage
 *
 * Request: { updates: GroupReorderUpdate[] }
 * Response: { updated: string[], notFound: string[] }
 */
export const MSG_BULK_REORDER_GROUPS = 'tj/bulkReorderGroups';
```

Alternatives rejected:
1. Extend `MSG_BULK_REORDER_ITEMS` with group discriminator — fights one-message-per-partition pattern; inflates handler.
2. B-008's `MSG_UPDATE_GROUP × N` via `Promise.all` — race window; single-tx closes it.

**Change plan**:
- `shared/messages.js` — append constant + JSDoc typedef
- `background/storage/groups.js` — add `bulkReorderGroups(updates)` exported function with single `writeTransaction`. Validations: per-update shape → unknown ids to `notFound` → depth+cycle assertion for `parentId` changes → apply → normalise affected buckets.
- `background/storage/index.js` — re-export `bulkReorderGroups`
- `background/messages/storage-handlers.js` — import constant + fn, add dispatch case, add to `MUTATION_BROADCASTS` as `SCOPE.GROUPS`, add to `WRITE_MESSAGE_TYPES`

### D-2 — `filterGroupParentCandidates` integration: **Prebuilt Set at dragstart, O(1) lookup in tick**

New sub-state on `_groupDragState`:
```
validNestTargetIds: Set<string>       // from filterGroupParentCandidates
validReorderTargetIds: Set<string>    // siblings at same depth
isSubGroupDrag: boolean               // parentId != null at source
```

**Dragstart flow**:
1. `draggedGroup = _cachedGroups.find(g => g.id === _dragSrcGroupId)`
2. `candidates = filterGroupParentCandidates(_cachedGroups, draggedGroup)`
3. `validNestTargetIds = new Set(candidates.map(g => g.id))`
4. Compute valid-reorder siblings based on `draggedGroup.parentId` (top-level if null; otherwise children of same parent). Project to `validReorderTargetIds`.
5. `isSubGroupDrag = (draggedGroup.parentId != null)` — governs NEST blanket-reject for sub-group sources.

**`_groupDragTick` lookup**:
- NEST mode: `validNestTargetIds.has(targetGroupId) && targetGroupId !== _dragSrcGroupId` — O(1)
- REORDER mode: `validReorderTargetIds.has(targetGroupId) && targetGroupId !== _dragSrcGroupId` — O(1)

**Rebuild triggers**: Set is rebuilt only on dragstart. `_pendingGroupsRender` defers `scope === 'groups'` broadcast re-renders until dragend, so `_cachedGroups` doesn't mutate mid-drag. D-5 broadcast-race commit guard catches the edge case where state advanced but drop proceeded.

**R4 enforcement**: grep `sidepanel/sidepanel.js` for manual `parentId` comparisons inside the drag block — any `.filter(g => g.parentId ...)` is REJECT unless specifically sourcing the reorder sibling set.

### D-3 — CSS enumeration

FOUR dedicated CSS classes. All four elements appended once to `itemListEl` by `renderAll`; NEVER reparented during drag (B-030 §36.3.5 correction).

**Ghost**: B-031 uses browser default drag image (dragged `.group-section` with `.dragging-src` at 0.5 opacity — B-008 existing). Group name + item count already embedded via `.group-header-count`. **No custom ghost CSS**. Deviation from literal AC2 documented in R6 as D-deviation.

**Reorder indicator** (`.group-reorder-indicator`):

| Property | Value | Rationale |
|---|---|---|
| `position` | `absolute` | Parent `#item-list` is `position: relative` |
| `top` | `0` | **Critical — B-030 D-1 lesson** (REJECT-on-absence) |
| `left` | `0` | Span full container width |
| `right` | `0` | Span full container width |
| `height` | `2px` | Match B-008 visual |
| `background-color` | `var(--accent)` | Theme-safe token |
| `border-radius` | `1px` | Cosmetic |
| `margin` | `0 8px` | Inset from edges |
| `pointer-events` | `none` | Prevent self-hit (B-030 AC23) |
| `z-index` | `10` | Above group headers |
| `opacity` | `0` default / `1` during valid REORDER | rAF-gated |
| `transform` | `translateY(-9999px)` / `translateY(Npx)` | Compositor-only move |
| `transition` | `opacity 80ms ease` | Subtle fade; no transform transition |

**Nest highlight** (`.group-header.group-header--nest-target`):

| Property | Value | Rationale |
|---|---|---|
| `outline` | `2px solid var(--accent)` | Distinct from rejection; solid |
| `outline-offset` | `-2px` | No layout shift |
| `background-color` | `color-mix(in srgb, var(--accent) 12%, var(--bg-secondary))` | Tinted wash; theme-safe |
| `border-radius` | `4px` | Matches outline convention |
| `transition` | `outline-color 80ms ease, background-color 80ms ease` | Cross-fade |
| `position` | (unchanged) | Static inherit |

Fallback: `@supports not (background-color: color-mix(...))` → `var(--bg-hover)`.

**Rejection indicator** (`.group-header.group-header--nest-reject`):

| Property | Value | Rationale |
|---|---|---|
| `outline` | `2px dashed var(--danger)` | Dashed (not solid) — differentiate from accept |
| `outline-offset` | `-2px` | No layout shift |
| `background-color` | `color-mix(in srgb, var(--danger) 10%, var(--bg-secondary))` | Red wash |
| `border-radius` | `4px` | Shape match |
| `transition` | `outline-color 80ms ease, background-color 80ms ease` | Cross-fade |

Distinct via color (blue vs red) + dash pattern (solid vs dashed) — two orthogonal channels for colorblind-accessibility.

**Source-section opacity** (`.group-section.dragging-src`) — existing B-008 rule, unchanged: `opacity: 0.5`.

At most ONE of {reorder indicator, nest highlight, rejection} is active at any time. The rAF tick clears the other two when setting one.

### D-4 — Collapsed-group NEST-drop: **accept-and-expand post-drop**

Drop commits normally + target's `collapsed` flag flipped to `false` via fire-and-forget `MSG_UPDATE_GROUP { id: targetGroupId, patch: { collapsed: false } }` AFTER the main `bulkReorderGroups` resolves. Also add target to local `collapsedGroups` Set (UI-side) immediately for snappy feedback.

Alternatives rejected:
- Reject-if-collapsed — forces two-step gesture for one intent; violates least-astonishment.
- Accept stay-collapsed — user can't see the drop took effect.

Matches B-009's drag-to-expand precedent. Edge case (collapsed sub-group) is vacuous under depth-1.

### D-5 — Sub-group REORDER scope: **supported in S24, sibling-only; NEST blanket-rejected**

Sub-group (parentId != null) can REORDER among siblings (other children of same parentId). Cannot REORDER past parent boundary (no promote-by-drag). NEST universally rejected for sub-group drags (would create depth-2).

Implementation: `_groupDragState.validReorderTargetIds = new Set(siblings.map(g => g.id))` where siblings = groups with same parentId ≠ dragged. Any REORDER hit on non-sibling → no drop. Any NEST hit → rejection indicator.

### D-6 — Detection thresholds: **25% / 50% / 25% (ratio-based)**

Top 25% = REORDER_ABOVE · middle 50% = NEST · bottom 25% = REORDER_BELOW. Ratio-based measurement (not pixel-based) for zoom robustness.

```js
const rect = _groupDragRectCache.rects.get(targetGroupId);
const ratio = (pointerY - rect.top) / rect.height;
const mode = ratio < 0.25 ? 'REORDER_ABOVE'
           : ratio > 0.75 ? 'REORDER_BELOW'
           : 'NEST';
```

Alternatives considered: 30/40/30 (squeezes NEST on 32-px headers) and 20/60/20 (biases toward NEST; REORDER is the more common gesture). Chosen 25/50/25 matches Figma/Slack tree conventions.

At 32 px header: 25% = 8 px REORDER zone, 50% = 16 px NEST zone — both pointer-reachable.

Accessibility note: zone cues are visual (indicator + highlight); tooltip discloses "Drag to reorder or nest (keyboard reorder not yet available)". A first-use toast hint is a future enhancement candidate (§38.9 F-3).

## §38.4 Component structure

### 4.1 `sidepanel/sidepanel.js` — mode-exclusive drag routing

**New module-scope state** (adjacent to `_itemDragState`):

```
let _groupDragState = null;
/* Shape:
   {
     draggedGroupId, draggedGroup,
     isSubGroupDrag: boolean,
     validNestTargetIds: Set<string>,
     validReorderTargetIds: Set<string>,
     cachedGroupsGen: number,
     pendingTargetGroupId: string|null,
     pendingMode: 'REORDER_ABOVE'|'REORDER_BELOW'|'NEST'|'REJECT'|null,
     rafHandle: number|null,
     scrollListener: Function|null,
   }
*/

let _groupDragRectCache = null;
/* { rects: Map<groupId, DOMRectReadOnly>, containerRect, invalid: boolean } */

let _cachedGroupsGen = 0;
/* Monotonic counter; bumped on every _cachedGroups assignment
   (currently 3 sites: line 2744 renderAll, lines 4884 + 4897 broadcast patch paths). */
```

**Hook points**:

- **`itemListEl.dragstart` (~4348)**: existing item-drag branch stays first. The existing B-008 group-drag branch is REPLACED with the B-031 expanded branch per D-2 flow.
- **`itemListEl.dragover` (~4395)**: after `if (_itemDragState) { ... return; }`, add `if (_groupDragState) { ... }` block implementing the B-030-AC16 3-statement pattern:
  ```
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  _pendingGroupPointerX = e.clientX;
  _pendingGroupPointerY = e.clientY;
  _scheduleGroupDragTick();
  ```
  All hit-testing + DOM writes happen in `_groupDragTick`.
- **`itemListEl.dragleave` (~4432)**: add `if (_groupDragState) return;` — indicator visibility is rAF-gated via opacity, not toggled here.
- **`itemListEl.drop` (~4442)**: after item-drop branch, add B-031 branch:
  1. Cache state, cleanup DOM, null `_groupDragState` (B-030 UAT-surfaced cleanup-order lesson).
  2. Validate `pendingMode` → early-return if null or REJECT.
  3. **Broadcast-race guard**: if `state.cachedGroupsGen !== _cachedGroupsGen`, await `sendMessage(MSG_LIST_GROUPS)` → refresh → re-validate target still in `filterGroupParentCandidates` set → abort with toast if invalid.
  4. `computeGroupReorder(_cachedGroups, draggedGroupId, mode, targetGroupId)` → dispatch `MSG_BULK_REORDER_GROUPS` → re-fetch + renderAll (parallel to B-030 D-2 explicit renderAll).
  5. For NEST mode onto collapsed target (D-4): fire-and-forget `MSG_UPDATE_GROUP { id: targetGroupId, patch: { collapsed: false } }`.
  6. On error: refetch + renderAll, toast "Couldn't save group order — reverting".
- **`itemListEl.dragend` (~4568)**: `if (_groupDragState) { _groupDragState = null; _cleanupGroupDragDom(); }` before existing B-008 cleanup. Keep `_dragSrcGroupId = null` (gate for `_pendingGroupsRender`).

**New helpers** (sibling to `_buildDragRectCache` et al.):
- `_buildGroupDragRectCache()` — snapshots `.group-header[data-group-id]` rects
- `_scheduleGroupDragTick()` — rAF-dedupe via `_groupDragState.rafHandle`
- `_groupDragTick()` — hit-test pointer → compute mode from 25/50/25 zones → update REORDER indicator (transform translateY + opacity 0↔1) OR class toggles on target header (`.group-header--nest-target` / `.group-header--nest-reject`)
- `_computeGroupDropTarget(x, y)` — `elementFromPoint` → `closest('.group-header[data-group-id]')` → `{targetGroupId, mode}` or `null`
- `_cleanupGroupDragDom()` — hide REORDER indicator, clear nest-target + reject classes from all headers, remove source `dragging-src`, cancel rAF, remove scroll listener

**Indicator elements** (singletons appended by `renderAll` to `itemListEl`):
1. `<div class="group-reorder-indicator">` — REORDER line (separate from B-008's `dropIndicatorEl`; B-008's indicator uses `.before()` reparent which fights B-030's absolute-positioned transform pattern)
2. Nest highlight: class toggle on target `.group-header` (no new DOM)
3. Rejection indicator: class toggle on target `.group-header` (no new DOM)

**Mutual exclusivity**: at most ONE of these three states active at any time.

### 4.2 `shared/sort-order.js` — add `computeGroupReorder`

Pure function parallel to `computeItemReorder`:

```
/**
 * @typedef {Object} GroupReorderUpdate
 * @property {string} id
 * @property {number} sortOrder
 * @property {string|null} [parentId]
 */

/**
 * @param {GroupRecord[]} groups
 * @param {string} draggedId
 * @param {'REORDER_ABOVE'|'REORDER_BELOW'|'NEST'} mode
 * @param {string} targetId
 * @returns {GroupReorderUpdate[]}
 */
export function computeGroupReorder(groups, draggedId, mode, targetId) { ... }
```

- **NEST**: dragged's new `parentId = targetId`; new `sortOrder = childCount` (append). Affected buckets for normalisation: target's children + dragged's former bucket (top-level or former parent's children).
- **REORDER_ABOVE / REORDER_BELOW**: same depth bucket. New index = target's index ±0 (above) or ±1 (below). Splice + renumber bucket.
- **Sub-group REORDER** (D-5): bucket = groups with same parentId ≠ dragged. `parentId` omitted from update (unchanged).
- **Top-level REORDER**: bucket = groups with parentId == null. `parentId` omitted.
- Returns minimal set — unchanged groups not included.

### 4.3 `background/storage/groups.js` — add `bulkReorderGroups`

```
export async function bulkReorderGroups(updates) {
  const updated = [], notFound = [];
  await writeTransaction([{
    partition: PARTITION_GROUPS,
    mutator: (groups) => {
      // 1. Per-update shape validation
      // 2. Unknown ids → notFound
      // 3. For parentId changes: assertDepthAndCycle + "has children" rule from updateGroup
      // 4. Apply updates (sortOrder, parentId if present, updatedAt)
      // 5. Normalise each affected bucket (null + each changed parentId) to consecutive integers
      return mutated;
    }
  }]);
  return { updated, notFound };
}
```

Storage layer remains the fail-closed authority for depth + cycle even if UI pre-filter slips.

### 4.4 `background/storage/index.js` — re-export

### 4.5 `background/messages/storage-handlers.js`
- Import `MSG_BULK_REORDER_GROUPS` + `bulkReorderGroups`
- Add to `MUTATION_BROADCASTS` as `SCOPE.GROUPS`
- Add to `WRITE_MESSAGE_TYPES`
- Add dispatch case

### 4.6 `sidepanel/sidepanel.css` — new rules per D-3

Four new selectors: `.group-reorder-indicator`, `.group-header--nest-target`, `.group-header--nest-reject`. Fallback rules for `color-mix` non-support.

### 4.7 `sidepanel/sidepanel.js` import
- `filterGroupParentCandidates` — already imported at line 62. No change.
- `MSG_BULK_REORDER_GROUPS` — added to existing messages import block (mirrors S23 B-030 pattern).

## §38.5 CSS enumeration summary

See §38.3 D-3 tables for all four categories. **R4 gate**: every listed property must appear in shipped CSS or REJECT.

## §38.6 Test plan delta

New file `tests/b031-group-drag.test.js`. AC18's 8 required cases expanded:

| # | Test | Layer |
|---|---|---|
| T-1 | `computeGroupReorder` top-level REORDER_ABOVE shifts target + siblings, renumbers bucket | pure helper |
| T-2 | `computeGroupReorder` top-level REORDER_BELOW | pure helper |
| T-3 | `computeGroupReorder` NEST sets `parentId` + sortOrder = targetChildCount | pure helper |
| T-4 | `bulkReorderGroups` applies spec + normalises to consecutive integers | storage |
| T-5 | `bulkReorderGroups` rejects depth-2 attempt with `ERR_DEPTH_EXCEEDED` | storage |
| T-6 | `bulkReorderGroups` rejects circular with `ERR_CIRCULAR_REF` | storage |
| T-7 | `bulkReorderGroups` rejects drag into Ungrouped (pseudo-id) with `ERR_NOT_FOUND` | storage |
| T-8 | `bulkReorderGroups` partial-success: unknown id in `notFound`, known applied | storage |
| T-9 | `computeGroupReorder` sub-group REORDER keeps parentId unchanged, renumbers sibling bucket | pure helper (D-5) |
| T-10 | `filterGroupParentCandidates(_cachedGroups, draggedSubGroup)` returns `[]` — verify blanket NEST rejection | integration |
| T-11 | Broadcast-race guard: `_cachedGroupsGen` advances mid-drag → drop handler triggers `MSG_LIST_GROUPS` refresh | integration |

Existing suites preserved: `b007-sub-group-nesting.test.js`, `b008-group-reorder.test.js` both stay green.

**Target**: 1001 → 1011+ green.

**Perf assertion**: AC13 16 ms P95 dragover enforced by R4 grep for `getBoundingClientRect(` inside group-drag path — must all be inside `_buildGroupDragRectCache` or tick's cache-rebuild branch.

## §38.7 R2 Correctness Checklist

| # | Check | Verdict |
|---|---|---|
| C-1 | Storage schema versioned | N/A — no schema change |
| C-2 | Message contracts typed | PASS — `MSG_BULK_REORDER_GROUPS` typed in D-1 |
| C-3 | SW cold-start safe | PASS — all drag state sidepanel-local; handler stateless |
| C-4 | ID stability | PASS — only sortOrder + parentId + collapsed change |
| C-5 | Manifest file references | N/A |
| C-6 | Permission minimization | N/A |
| C-7 | Allow-list direction | N/A — reuses existing allow-list `validateGroupPatch` + `assertDepthAndCycle` |
| C-8 | SW-context feasibility | N/A — all drag APIs sidepanel-side |
| C-9 | Empty-state design | PASS — AC15 (a)–(f) all resolved in D-4/D-5/filter-set semantics |

## §38.8 Rollback plan

`git revert <B-031 commit>` on `release/v2` is data-clean:
- Any `parentId` values set by B-031 drag remain valid — B-007 UI renders unchanged.
- Any renormalised `sortOrder` values persist — B-008 UI reads unchanged.
- No compatibility shim needed.

**Revert removes**: `MSG_BULK_REORDER_GROUPS` + handler + dispatcher + broadcast-map + write-set; `bulkReorderGroups` storage fn; `_groupDragState`/`_groupDragRectCache`/`_cachedGroupsGen`; four CSS rules + indicator element; `computeGroupReorder` helper; mode-aware dragstart branch (falls back to B-008 single-mode REORDER).

**Atomicity**: `bulkReorderGroups` is single `writeTransaction` — all-or-nothing. The optional `MSG_UPDATE_GROUP { collapsed: false }` fire-and-forget is NOT atomic with the reorder; worst case: a group expands cosmetically without the reorder taking effect. Cosmetic; recoverable; no data corruption.

**SEV tier**: SEV3.

## §38.9 Known risks / follow-ups

| # | Risk / Follow-up | Disposition |
|---|---|---|
| F-1 | Custom drag ghost showing "Work (5)" — AC2 literal reading expects custom. Chose browser default. | Document D-deviation at R6. S25 polish candidate if UAT flags. |
| F-2 | Keyboard accessibility (inherited from B-008 AC12) | Future item; tooltip discloses gap |
| F-3 | Zone discoverability (25/50/25 not self-announcing) | Future: first-drag-of-session toast hint; S25 backlog |
| F-4 | `color-mix()` fallback for Chromium ≤110 | `@supports not (...)` fallback rules already in §38.3 D-3 |
| F-5 | Terminology drift (`parentGroupId` in AC vs `parentId` in code) | Fix AC templates at R6; code uses `parentId` |
| F-6 | Auto-scroll during group drag (B-032 scope excludes group drag) | Group count typically small; S25 backlog item "B-032 extension: group-drag auto-scroll" |
| F-7 | Large `_cachedGroups.length` (200+) — rect cache builds all headers | Human scale fine; measure in UAT; lazy-per-hit fallback available if needed |
| F-8 | No runtime `getBoundingClientRect` call counter (B-030 AC19 had one) | R4 grep is safety net; 10-sec UAT perf probe confirms runtime |
| F-9 | Collapsed-expand fire-and-forget non-atomic with reorder | Worst case cosmetic; accepted |

---

**R2 verdict**: READY FOR R3. All six R1 decision points resolved. All applicable correctness checks PASS.

## §38.10 As Built (R6 Close)

This section records deltas between the R2 plan (§38.1–§38.9) and the B-031 code that shipped in Sprint 24. All decision resolutions (D-1 through D-6) landed as designed; three code deltas noted below address terminology confirmation, the R2 D-3 custom-ghost deviation flagged in F-1, and an R4 perf-budget fix.

### Deviations from R2

#### D-1 — Terminology flag confirmed (no code change)

R2 §38.1 flagged the mismatch between `parentGroupId` (AC7 / AC10 text) and `parentId` (the schema field used since B-001a / B-007). Code ships with `parentId` as expected. R4 did not re-raise this as a spec deviation. Future pass may update the AC templates; no code follow-up required.

#### D-2 — Browser default drag ghost confirmed (R2 F-1 disposition)

R2 §38.3 D-3 noted an explicit deviation from the literal AC2 reading (which expected a custom "Work (5)" ghost) in favor of the browser's default drag image of the dragged `.group-section`. UAT confirmed this was the right call — the default ghost already embeds the group name + item count via the existing `.group-header-count` element and behaves correctly on Edge. No custom ghost shipped. F-1 is closed.

#### D-3 — REORDER_BELOW section-bottom caching (R4-H3 fix)

R2 §38.4.1 described `_groupDragTick` as snapshotting `.group-header` rects via `_buildGroupDragRectCache`, but the initial R3 build issued a live `getBoundingClientRect` on the `.group-section` element each tick to compute the REORDER_BELOW indicator position (the indicator for "drop below this group" has to anchor at the section's bottom edge, not the header's bottom). R4 [code-reviewer] flagged this as an AC13 16 ms P95 perf-budget risk (B-031-H3).

Fix: extended `_buildGroupDragRectCache` to snapshot `.group-section` bottom edges into a second `Map<groupId, number>` at dragstart. Tick reads the cached value. Post-fix R4 grep confirms zero `getBoundingClientRect` calls in the group-drag hot path.

### R4 findings applied (all HIGH resolved before R5)

| # | Finding | Fix |
|---|---|---|
| B-031-H1 | Cleanup-order inversion on dragend cancel — scroll listener + rAF leak if state nulled before cleanup | Re-ordered: `_cleanupGroupDragDom()` runs first, then `_groupDragState = null`. Mirrors B-030 drop-handler pattern (§36.4 D-3). |
| B-031-H2 | `bulkReorderGroups` lacked DoS cap | Added `MAX_BULK_INPUTS = 500` rejection at handler entry, mirroring `bulkReorderItems` precedent |
| B-031-H3 | Live `getBoundingClientRect` on `.group-section` in tick (see D-3 above) | Extended rect cache to include section-bottom map |
| B-031-H4 | Ungrouped NEST hover returned `null` (no user feedback), but REORDER zones over Ungrouped returned `null` as intended per AC15d | NEST-over-Ungrouped now returns `{mode: 'REJECT'}` so the rejection indicator fires; REORDER zones still return `null` so adjacent real-group hit tests take over. |
| B-031-M1 | Group drag handle tooltip drifted from AC16 text | Updated to exact AC16 string: `"Drag to reorder or nest (keyboard reorder not yet available)"` |

### Deferred to Sprint 25

- **B-031-M2**, **M-3**, **M-4**, **M-5**, **M-6** (all MEDIUM)
- All LOW findings
- **B-083** (filed) — `filterGroupParentCandidates` over-restrictive filter blocks multiple sibling sub-groups under one parent; affects both B-007 dialog and B-031 drag-nest path
- **B-084** (filed) — drop-zone visual differentiation between REORDER (top/bottom 25%) vs NEST (middle 50%) zones — shipped uses indicator-based distinction only; B-084 proposes additional zone hint

### Test coverage

- Entering Sprint 24: 1001 green (from §36 B-030 v2 merge)
- After B-031 landing: 1040 green (+39 tests — `tests/b031-group-drag.test.js` full AC18 set + sub-group REORDER + broadcast-race guard + bulk cap + Ungrouped REJECT)
- Sprint total (incl. B-025 + B-032 contributions): 1074 green

### UAT outcome

11/11 PASS in Edge (pre-merge, user-driven). No fix cycles required on B-031 itself — all UAT findings were against B-025 (UAT-3 empty-group drop, UAT-8 ghost positioning — see §37.10 D-2 + D-3).
