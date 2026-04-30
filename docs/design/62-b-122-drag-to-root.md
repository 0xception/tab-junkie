# §62 — B-122 Sub-Group Drag-to-Root (R2 Architecture)

**Sprint**: 39 · **Tier**: Full (M — auto-upgraded from S per CLAUDE.md auto-upgrade rule)
**Status**: R2 LOCKED — ready for R3
**Dependencies (all done)**: §35 B-007 sub-group nesting via dialog, §38 B-031 group drag-reorder + drag-nest, B-083 multi-sibling sub-group fix
**Related code**: `sidepanel/sidepanel.js`, `shared/sort-order.js`, `background/storage/groups.js`

---

## §62.1 Goal

Provide a drag-based UX for promoting a depth-1 sub-group back to root level (`parentId: null`). This is the **inverse** of B-031's drag-to-nest: B-031 lets a top-level group be dropped into the middle 50% of another header to become its child; B-122 lets a sub-group be dropped **outside any group section** (or above its own parent's header) to become a top-level group again. Without B-122 the only promotion path is the B-007 edit-dialog parent-picker (`<select id="group-field-parent">` → `"Top-level (no parent)"` option, see §35.3.1) — drag UX has had no inverse.

The feature operates strictly on existing storage (`parentId` + `sortOrder`); no schema change, no new message type, no manifest delta. The novelty is entirely in the sidepanel: a new drop-zone path on `_computeGroupDropTarget`, a new pure helper `computeGroupPromote`, and reuse of the existing `MSG_UPDATE_GROUP` write boundary.

## §62.2 Resolved R2-VERIFY markers

The R1 row carried four R2-VERIFY markers. All four are resolved below with code-cited rationale. Each conclusion is committed; R3 must implement these decisions verbatim.

### §62.2.1 — Q4 drag-state tiebreaker (TOP RISK)

**R1 question**: when the pointer is in the REORDER_ABOVE zone of the dragged sub-group's own parent's header, does the existing code path cleanly route to PROMOTE, or is an explicit `if (targetGroupId === draggedGroup.parentId && proposedMode === 'REORDER_ABOVE') → PROMOTE` tiebreaker required?

**Outcome**: **NO explicit tiebreaker conditional is required.** The existing code path already routes the gesture to a clean `null` return that B-122 intercepts.

**Code-cited trace** (sub-group → drag over own parent's header, REORDER_ABOVE zone):

1. `sidepanel/sidepanel.js:4248` — at dragstart, `isSubGroupDrag = (sourceParentId !== null)`. For a sub-group drag, this is `true`.
2. `sidepanel/sidepanel.js:4240–4243` — `validReorderTargetIds` is built as `_cachedGroups.filter((g) => (g.parentId ?? null) === sourceParentId && g.id !== draggedGroup.id)`. The dragged sub-group's `sourceParentId` is its parent's `id`; the parent itself has `parentId = null` (depth-0). So **the parent is NOT in `validReorderTargetIds`** — by construction.
3. `sidepanel/sidepanel.js:5232–5246` — geometric zone detection sets `proposedMode = 'REORDER_ABOVE'`.
4. `sidepanel/sidepanel.js:5280–5286` — NEST branch: `if (proposedMode === 'NEST') { … }`. Skipped because mode is REORDER_ABOVE.
5. `sidepanel/sidepanel.js:5289–5293` — REORDER branch:
   ```js
   if (!_groupDragState.validReorderTargetIds.has(targetGroupId)) {
     /* Target is not a sibling — can't REORDER into a different bucket via
        drag (no promote-by-drag at this layer). */
     return null;
   }
   ```
   The parent's `id` is NOT in `validReorderTargetIds` (per step 2). The function returns `null`. The comment literally says "no promote-by-drag at this layer" — B-122 is the layer above that adds promote-by-drag.
6. `sidepanel/sidepanel.js:5083–5094` — `_groupDragTick`'s `if (!target)` branch hides visuals and clears pending state. **B-122 intercepts here** (or in a thin wrapper around `_computeGroupDropTarget`) when `_groupDragState.isSubGroupDrag === true` to compute a PROMOTE target instead.

**Conclusion**: the existing 25/50/25 geometry, hysteresis, and validity gating all surface "REORDER_ABOVE on parent" as `null`. The promote intercept naturally fires whenever (a) `isSubGroupDrag === true`, (b) `_computeGroupDropTarget` returns `null`. No new conditional. No tiebreaker. The same `null` interception also covers AC1 (drop outside any group-section) and AC3 (drop between two top-level groups) — they share a single fallthrough path.

### §62.2.2 — `_computeGroupDropTarget` augmentation strategy

**R1 question**: should `_computeGroupDropTarget` return a `{mode, insertAfterGroupId}` shape extended with a PROMOTE case, or should a separate `_computeGroupPromoteTarget` helper run alongside it?

**Outcome**: **Separate helper.** Implement `_computeGroupPromoteTarget(x, y)` as a sibling function in the same module, called from `_groupDragTick` ONLY in the `null` branch when `_groupDragState.isSubGroupDrag === true`.

**Rationale**:
- `_computeGroupDropTarget` is currently keyed off `header = hit.closest('.group-section > .group-header[data-group-id]')`. The PROMOTE case is the **negation** of that — it fires when there is no such header under the pointer (or when the only header is the parent of the dragged sub-group). Mixing the negative case into the positive function inverts its contract.
- The positive function returns `{ targetGroupId, mode }` — both fields are required. PROMOTE has no `targetGroupId` (the parent is not the target — the gap between top-level groups is). Adding `insertAfterGroupId | null` to a discriminated union widens the contract for every existing caller.
- The 3 callers (line 5081 `_groupDragTick`, the drop handler at 4509–4516 via `state.pendingMode`/`state.pendingTargetGroupId`, and any tests pinning the return shape) all read both fields today.
- A separate helper preserves the existing callgraph and confines the new logic to one function.

**Spec for `_computeGroupPromoteTarget`**:

```js
/**
 * B-122 — promote-to-root drop target detection.
 *
 * Called from _groupDragTick ONLY when:
 *   1. _groupDragState.isSubGroupDrag === true
 *   2. _computeGroupDropTarget(x, y) returned null
 *
 * Returns either:
 *   { mode: 'PROMOTE', insertAfterGroupId: string|null }
 *     where insertAfterGroupId is the top-level group id immediately above
 *     the insertion point (null when inserting at the very top of the list).
 *   OR null when no valid promote target (pointer is over a non-promote
 *     reject zone — currently no such zone exists, but the null return
 *     reserves the option).
 *
 * Hit-testing strategy:
 *   - Iterate cached top-level group section bottoms (sectionBottoms keyed
 *     by top-level group ids, in DOM order).
 *   - If pointer Y is above the first top-level header's top → insertAfterGroupId = null
 *   - Else find the largest sectionBottom < pointerY → that group is "above"
 *   - Else (pointer below the last section bottom) → insertAfterGroupId = lastTopLevelId
 *   - If pointer X is outside #item-list horizontally → return null (defensive)
 */
function _computeGroupPromoteTarget(x, y) { … }
```

This sits immediately below `_computeGroupDropTarget` in `sidepanel/sidepanel.js`. The only state read is `_groupDragRectCache` (extended in §62.2.4 below) and `_groupDragState`.

### §62.2.3 — `computeGroupReorder` PROMOTE extensibility

**R1 question**: add a `PROMOTE` mode to the existing `computeGroupReorder` pure helper, or write a new `computeGroupPromote(groups, draggedId, insertAfterGroupId)` helper?

**Outcome**: **Separate helper `computeGroupPromote`.** Adding PROMOTE to `computeGroupReorder` would force a 4-arg signature where the 4th argument has different semantics depending on mode (a `targetId` for REORDER/NEST, but an `insertAfterGroupId | null` for PROMOTE). Cleaner as separate functions.

**Rationale** (citing the existing helper at `shared/sort-order.js:321`):
- `computeGroupReorder(groups, draggedId, mode, targetId)` — `targetId` is mandatory for all 3 current modes (line 322 returns `[]` if non-string).
- PROMOTE has fundamentally different inputs: there is no target group; there is an "insert AFTER which top-level group, or null for top of list".
- `computeGroupReorder`'s NEST branch at line 339–365 specifically handles the "moving INTO a parent" direction. PROMOTE is the inverse — moving OUT of a parent. Reusing the helper would require parallel inverse logic inside the same function, doubling its complexity.
- The existing test suite `tests/sort-order.test.js:333–335` asserts `unknown mode` returns `[]` — adding PROMOTE without breaking that contract is straightforward (add to the allow-list), but the input-shape mismatch above is the bigger issue.

**Spec for `computeGroupPromote`**:

```js
/**
 * B-122 — pure helper for sub-group → top-level promotion.
 *
 * Pure, DOM-free, chrome-free. Sibling to computeGroupReorder, distinct
 * because PROMOTE has different inputs (no targetId; instead insertAfterGroupId).
 *
 * Behavior:
 *   - Dragged group's parentId is set to null.
 *   - Dragged group's sortOrder is computed so it falls immediately after
 *     `insertAfterGroupId` in the top-level bucket (or first if null).
 *   - Top-level bucket is renumbered to consecutive (idx * 1000) values.
 *   - Source bucket (the former parent's children) is renumbered to close
 *     the gap left by the dragged group.
 *
 * Returns the minimal GroupReorderUpdate[] — buckets unchanged from
 * pre-drop state are not included.
 *
 * Edge cases:
 *   - draggedId not found → []
 *   - draggedId is already top-level (parentId == null) → [] (no-op; UI
 *     should never call with a top-level group, but defense-in-depth)
 *   - insertAfterGroupId not in top-level bucket → [] (caller error)
 *   - insertAfterGroupId === draggedId → [] (cannot insert after self)
 *
 * @param {GroupRow[]} groups
 * @param {string} draggedId
 * @param {string|null} insertAfterGroupId
 * @returns {GroupReorderUpdate[]}
 */
export function computeGroupPromote(groups, draggedId, insertAfterGroupId) { … }
```

`MSG_BULK_REORDER_GROUPS` (B-031, line 50 of `shared/messages.js`) already accepts `parentId` in the per-update shape (line 45 of B-031 §38.3 D-1: `parentId?: string|null`). The dispatch is identical to B-031's NEST path with `parentId: null`. **No new message type.** The drop handler at `sidepanel/sidepanel.js:4511` is extended with a third branch: if `state.pendingMode === 'PROMOTE'`, call `computeGroupPromote` instead of `computeGroupReorder`, then dispatch `MSG_BULK_REORDER_GROUPS` with the result.

### §62.2.4 — `.group-reorder-indicator` translateY for between-top-level-group insertion

**R1 question**: does the existing `sectionBottoms` cache cover the gaps between top-level groups, or does the cache need extension?

**Outcome**: **The existing `sectionBottoms` cache covers all top-level group bottom edges already** (`sidepanel/sidepanel.js:5057` populates it for every `.group-section` regardless of depth). One small extension is required: a sorted list of **top-level** group ids in DOM order, so `_computeGroupPromoteTarget` can iterate them in order without re-querying the DOM each tick.

**Cache extension** (`_buildGroupDragRectCache`, line 5047):

```js
function _buildGroupDragRectCache() {
  const rects = new Map();
  const sectionBottoms = new Map();
  const topLevelOrder = [];   // NEW — top-level group ids in DOM order
  const topLevelTopY = new Map();   // NEW — top-level group section.top edges
  const headers = itemListEl.querySelectorAll('.group-section > .group-header[data-group-id]');
  for (const header of headers) {
    const id = header.dataset.groupId;
    if (!id) continue;
    rects.set(id, header.getBoundingClientRect());
    const section = header.parentElement;
    if (section && section.classList.contains('group-section')) {
      const sectionRect = section.getBoundingClientRect();
      sectionBottoms.set(id, sectionRect.bottom);
      // NEW — only top-level groups (parent of section is itemListEl, not nested)
      // are candidates for promote insertion points. Verify via cached _cachedGroups
      // lookup: g.parentId == null.
      const cachedGroup = _cachedGroups.find((g) => g.id === id);
      if (cachedGroup && (cachedGroup.parentId ?? null) === null) {
        topLevelOrder.push(id);
        topLevelTopY.set(id, sectionRect.top);
      }
    }
  }
  _groupDragRectCache = {
    rects,
    sectionBottoms,
    topLevelOrder,         // NEW
    topLevelTopY,           // NEW
    containerRect: itemListEl.getBoundingClientRect(),
    invalid: false,
  };
}
```

`_computeGroupPromoteTarget` consumes both new fields. The indicator translateY math then mirrors the existing REORDER_BELOW pattern at line 5148–5151:

```js
// PROMOTE indicator positioning (in _groupDragTick, after _computeGroupPromoteTarget)
const containerRect = _groupDragRectCache.containerRect;
const scrollTop = itemListEl.scrollTop;
let y;
if (target.insertAfterGroupId === null) {
  // Insert at top — anchor at first top-level group's top edge
  const firstId = _groupDragRectCache.topLevelOrder[0];
  const topY = _groupDragRectCache.topLevelTopY.get(firstId);
  y = topY - containerRect.top + scrollTop;
} else {
  // Insert after the named top-level group — anchor at its section bottom
  const bottomY = _groupDragRectCache.sectionBottoms.get(target.insertAfterGroupId);
  y = bottomY - containerRect.top + scrollTop;
}
groupReorderIndicatorEl.style.transform = `translateY(${y}px)`;
groupReorderIndicatorEl.style.opacity = '1';
```

This reuses the singleton `groupReorderIndicatorEl` (`sidepanel/sidepanel.js:430–431`, mounted at `2166`). Same DOM element, same CSS class, same transform-only positioning pattern. **AC2 visual-parity is met by reuse, not by new CSS.**

## §62.3 Drop-zone detection design

The new "outside any `.group-section`" detection lives in **`_computeGroupPromoteTarget`** (new helper, §62.2.2). It is invoked from `_groupDragTick` only when the existing `_computeGroupDropTarget` returns `null` AND `_groupDragState.isSubGroupDrag === true`.

**Hit-test logic** (in priority order):

1. **Empty space below the last top-level group** — pointer Y > last `sectionBottoms` value → `insertAfterGroupId = lastTopLevelId`.
2. **Between two top-level groups** — pointer Y > group A's `sectionBottom` AND pointer Y < group B's `topLevelTopY` (where A is immediately before B) → `insertAfterGroupId = A.id`.
3. **Above the first top-level group** — pointer Y < first `topLevelTopY` → `insertAfterGroupId = null`.
4. **Pointer X outside `#item-list` horizontally** → return `null` (defensive, prevents global-page drops from registering).
5. **Pointer over the dragged sub-group's own parent header in REORDER_ABOVE zone** — `_computeGroupDropTarget` already returned `null` (per §62.2.1 trace). The hit-test above maps the pointer Y to the gap immediately above the parent's section, which equals `insertAfterGroupId = <previousTopLevel>` or `null` if the parent is first. AC4 is satisfied.

**No new event listeners.** The existing `dragover` handler at `sidepanel/sidepanel.js:4292–4298` already delegates to `_scheduleGroupDragTick`. The promote intercept lives entirely inside `_groupDragTick`.

## §62.4 Visual indicator

Confirmed: the existing `.group-reorder-indicator` element (`sidepanel/sidepanel.js:430–431`, mounted at `2166`) is reusable as-is. No new DOM element, no new CSS class, no new visual treatment.

**CSS positioning math** (per §62.2.4): the indicator's `transform: translateY(<y>px)` is computed from either (a) the section bottom of `insertAfterGroupId`, or (b) the top edge of the first top-level section if `insertAfterGroupId === null`. Math is identical in shape to B-031's REORDER_BELOW path (line 5148–5151) — no new compositing concerns.

**AC2 enforcement** (visual-indicator parity): R4 [code-reviewer] greps the diff for any new `<div class="...indicator..."...>` element creation OR new CSS class `.group-promote-indicator` (or similar). Any hit is a REJECT. The PROMOTE state MUST emit only the existing `.group-reorder-indicator` class.

## §62.5 `MSG_UPDATE_GROUP` dispatch — no new message type

The drop dispatch reuses **`MSG_BULK_REORDER_GROUPS`** (B-031, `shared/messages.js:50`), not `MSG_UPDATE_GROUP` directly. The R1 row mentioned `MSG_UPDATE_GROUP { id, patch: { parentId: null, sortOrder: <computed> } }` as the conceptual write — and that is correct for a single-record promotion — but the actual implementation goes through `bulkReorderGroups` because:

1. PROMOTE renumbers TWO buckets (the dragged group's former sibling bucket loses one member; the top-level bucket gains one). Both renumbers must be atomic with the parentId change.
2. B-031's bulk path (`background/storage/groups.js#bulkReorderGroups`) wraps the multi-bucket update in a single `writeTransaction` — the established atomicity guarantee.
3. Per-update shape (B-031 §38.3 D-1) already supports `{ id, sortOrder, parentId? }` with `parentId: string|null`.

**Verification of write-path safety** (R1 source-citation gate self-applied):

| Concern | Source | Verdict |
|---------|--------|---------|
| `validateGroupPatch` accepts `parentId: null` | `background/storage/groups.js:116` — `const allowed = ['name', 'color', 'parentId', 'sortOrder', 'collapsed']` | PASS — `parentId` is allow-listed; `null` is permitted as a value (the validator does not type-check `parentId` beyond presence). |
| `updateGroup` `parentId ?? null` handles null | `background/storage/groups.js:200–202` — `if ('parentId' in patch) { const newParent = patch.parentId ?? null; assertDepthAndCycle(groups, id, newParent); }` | PASS — explicit null-coalescing; `assertDepthAndCycle` accepts null (depth-0 is always valid). |
| `hasChildren` guard does NOT block promotion | `background/storage/groups.js:205–210` — `if (newParent !== null) { const hasChildren = groups.some((g) => g.parentId === id); if (hasChildren) throw … }` | PASS — guard runs ONLY when `newParent !== null`. Promotion sets `newParent = null` so the guard is bypassed. **R1 claim verified.** |
| `bulkReorderGroups` per-update shape allows `parentId: null` | B-031 §38.4.3 + `shared/messages.js:50` typedef `parentId?: string\|null` | PASS — established by B-031. |

**No change to `validateGroupPatch`. No change to `updateGroup`. No change to `bulkReorderGroups`.** B-122 is purely additive at the renderer layer.

## §62.6 Fix-scope (mandatory subsection per B-119+B-126)

### Source files to modify

| File | Change | Lines (approximate) |
|------|--------|---------------------|
| `sidepanel/sidepanel.js` | Extend `_buildGroupDragRectCache` (add `topLevelOrder` + `topLevelTopY`); add `_computeGroupPromoteTarget` helper; extend `_groupDragTick` to call promote helper in null-branch when `isSubGroupDrag`; extend pendingMode union to include `'PROMOTE'`; add `pendingInsertAfterGroupId` state field; extend drop handler to dispatch `computeGroupPromote` updates | 366 (state shape comment), 4245–4261 (state init), 5047–5066 (cache), 5075–5154 (tick), 4458–4516 (drop handler) |
| `shared/sort-order.js` | New `computeGroupPromote(groups, draggedId, insertAfterGroupId)` exported pure helper. Sibling to `computeGroupReorder` (line 321) | After line 432 (end of file) |
| `sidepanel/sidepanel.js` import block | Add `computeGroupPromote` to the existing `import { … } from '../shared/sort-order.js'` | Line 76 |
| `sidepanel/sidepanel.css` | **No CSS changes** — `.group-reorder-indicator` reused as-is per §62.4 | — |
| `manifest.json` | **No changes** | — |
| `shared/messages.js` | **No changes** — `MSG_BULK_REORDER_GROUPS` already supports the per-update shape | — |
| `background/storage/groups.js` | **No changes** — `validateGroupPatch` + `updateGroup` + `bulkReorderGroups` already accept `parentId: null` | — |

### Pre-existing test assertions to update

| File:line | Assertion | Update |
|-----------|-----------|--------|
| `tests/sort-order.test.js:333–335` | Asserts `unknown mode` (e.g. `'UNKNOWN_MODE'`) returns `[]` from `computeGroupReorder` | **No change required** — `computeGroupReorder` does NOT add a PROMOTE mode (per §62.2.3). The new pure helper is `computeGroupPromote`, a separate function. The unknown-mode test continues to assert empty for genuinely unknown strings. |
| `tests/b031-group-drag.test.js:251` (`isSubGroupDrag` guard reference comment) and `:262` (`isSubGroupDrag` REJECT contract) | Document `isSubGroupDrag === true` as a NEST-blanket-rejector | **No change required** — B-122 does NOT alter the NEST-blanket-reject contract; it adds a NEW PROMOTE path that ALSO triggers when `isSubGroupDrag === true` but only via the `_computeGroupPromoteTarget` fallthrough. NEST + REORDER paths for sub-group drags are unaffected. |
| `tests/b007-sub-group-nesting.test.js` (full file) | Pins the dialog parent-picker promotion path | **No change required** — AC6 requires this path remains keyboard-accessible and unchanged. |
| `tests/b083-multi-sibling-subgroup.test.js` (if present — verify in R3) | Pins `filterGroupParentCandidates` multi-sibling acceptance | **No change required** — B-122 does not modify `filterGroupParentCandidates`. |

**No existing test asserts a `null` return from `_computeGroupDropTarget` for outside-group drops** — verified via grep at R2-time: search `tests/` for `_computeGroupDropTarget` returns zero hits (it's a private function, not exported). Behavior is exercised indirectly through the drop handler's effects.

**No existing test pins the `MSG_UPDATE_GROUP` payload shape for `parentId` field** in a way that would conflict with B-122. `MSG_BULK_REORDER_GROUPS` is the dispatch target.

### NEW test file

`tests/b122-drag-to-root.test.js` — five test cases per AC9 (R1):

| # | Test | Layer | Maps to AC |
|---|------|-------|------------|
| T1 | `computeGroupPromote(groups, subGroupId, null)` → updates include `{ id: subGroupId, parentId: null, sortOrder: 0 }` + renumber of source bucket | pure helper | AC1 |
| T2 | `computeGroupPromote(groups, subGroupId, 'g-top-A')` → dragged inserted after A; top-level bucket consecutive integers; source bucket renumbered | pure helper | AC3 |
| T3 | Drop handler integration: with `_groupDragState.isSubGroupDrag = true` + pointer Y between two top-level group bottoms → `MSG_BULK_REORDER_GROUPS` dispatched with `parentId: null` in the dragged update | integration (chrome-mock) | AC1 + AC4 |
| T4 | DOM emission parity: during PROMOTE state, the indicator element is `groupReorderIndicatorEl` (class `group-reorder-indicator`); no other element with `*-indicator` or `*-promote-*` class is created | DOM assertion | AC2 |
| T5 | `filterGroupParentCandidates(groups, draggedSubGroup)` continues to return the expected candidates set; B-007 dialog parent-picker path unchanged | regression guard | AC6 |

Test count delta: +5. Baseline 1,663 → expected 1,668+ post-merge.

## §62.7 R2 Correctness Checklist (C-1..C-12)

| # | Check | Verdict | Note |
|---|-------|---------|------|
| C-1 | Storage schema versioned | **N/A** — no schema change. Group records already support `parentId: null` (shipped at B-001a; depth-0 is the default for top-level groups). No `KNOWN_VERSION` bump required. No data migration. |
| C-2 | Message contracts typed | **PASS** — `MSG_BULK_REORDER_GROUPS` typed shape unchanged (B-031 §38.3 D-1; per-update shape `{ id, sortOrder, parentId?: string\|null }` already accepts null). No new message types. |
| C-3 | SW cold-start safe | **PASS** — drag is renderer-only state (`_groupDragState` is sidepanel module-scope). The dispatch through `MSG_BULK_REORDER_GROUPS` reuses the existing handler that re-reads partitions on every call. No SW in-memory dependency. |
| C-4 | ID stability | **PASS** — `parentId` and `sortOrder` are mutable fields; `id` and `createdAt` remain immutable per `validateGroupPatch` line 112–113. Promotion changes only the mutable fields. |
| C-5 | Manifest file references resolvable | **N/A** — no `manifest.json` change. |
| C-6 | Permission minimization | **N/A** — no new permissions. |
| C-7 | Allow-list direction | **PASS** — reuses existing allow-list at `background/storage/groups.js:116` (`['name', 'color', 'parentId', 'sortOrder', 'collapsed']`). No deny-list introduced. |
| C-8 | SW-context feasibility | **N/A** — all new code is sidepanel-side (renderer context). No SW-context APIs. |
| C-9 | Empty-state design | **PASS** — see §62.8 edge cases. Zero-groups state: drag cannot start (no group sections to drag). Single-top-level + zero-sub-groups: `isSubGroupDrag` is always false; promote path never fires. Drag-of-already-top-level: `isSubGroupDrag` is false at dragstart (line 4248); `_computeGroupPromoteTarget` is never called. |
| C-10 | Off-screen rect feasibility | **N/A** — no off-screen positioning. The `.group-reorder-indicator` is positioned in-flow within `#item-list` via `transform: translateY()` from the existing pattern (`sidepanel/sidepanel.js:5152` — already in use). |
| C-11 | Popup-lifecycle message ordering | **N/A** — sidepanel context, not popup. No focus-shifting API calls between dragstart and drop. |
| C-12 | Manifest declaration runtime-mutability | **N/A** — no manifest declarations involved. |

## §62.8 Edge cases

| Case | Expected behavior | Source citation |
|------|-------------------|-----------------|
| Drag a sub-group that has its own children (depth-2 attempt) | **Vacuous** — depth cap is enforced at storage write boundary. Per `assertDepthAndCycle` (B-007 §35) and `hasChildren` guard at `groups.js:205–210`, depth-2 is rejected with `ERR_DEPTH_EXCEEDED`. **B-007 AC4** further forbids depth-2 at creation, so no group in storage has depth ≥ 2 to begin with. The "drag a sub-group with children" gesture is impossible in the current data model. | `background/storage/groups.js:205–210`; `docs/design/35-b-007-sub-group-nesting.md` §35 |
| Drag during multi-select | **Disallowed by B-031 contract.** Group drag uses the singleton `_dragInitiatedFromHandle` flag from B-008 + the per-section `.group-drag-handle`. Multi-select for groups is not supported (only items). | §38.2 reuse table, B-008 mousedown gate |
| Drag of a top-level group (already root) | **No-op promote path.** `isSubGroupDrag = false` at dragstart (line 4248). `_computeGroupPromoteTarget` is never invoked. The existing B-031 REORDER+NEST paths handle top-level group drags as today. The fallthrough on `_computeGroupDropTarget` returning `null` simply hides visuals (`_hideGroupDragVisuals`, line 5089). | `sidepanel/sidepanel.js:4248`, `5083–5093` |
| Cross-window drag | **N/A** — drag-state is per-window per B-031 §38.4.1 (state is sidepanel-module-local). | §38.4.1 |
| Drag a sub-group, drop onto Open Tabs section | **Existing behavior unchanged.** `_computeGroupDropTarget` line 5222 already returns `null` for Open Tabs hits. Since `isSubGroupDrag === true`, the new promote intercept fires. The promote intercept hit-test (§62.3) checks pointer Y against top-level group section bottoms. If the pointer is over the Open Tabs section, the hit-test maps to "below the last top-level group" → `insertAfterGroupId = lastTopLevelId`, which is acceptable promote behavior. **R3 must verify this UX is intuitive in UAT — if the user finds it surprising, add a `pointer is inside .open-tabs-section` REJECT check to `_computeGroupPromoteTarget`.** Filed as F-1 below. |
| Zero top-level groups (only sub-groups exist — impossible by depth-1 rule, but defensive) | **Impossible by data model.** Any sub-group has a parent, which is by definition top-level. Defense-in-depth: `_computeGroupPromoteTarget` returns `null` if `topLevelOrder.length === 0`. | §62.2.4 |
| Drop is cancelled (Escape) | **Existing dragend cleanup handles it.** `sidepanel/sidepanel.js:4579+` `dragend` listener nulls `_groupDragState` and runs `_cleanupGroupDragDom`. PROMOTE intercept inherits this cleanup automatically. | §38.4.1 dragend hook |

## §62.9 Known risks / follow-ups

| # | Risk | Disposition |
|---|------|-------------|
| F-1 | Promote intercept fires when pointer is over Open Tabs section. UX may surprise the user (they may not expect dropping onto Open Tabs to mean "promote to root after last group"). | **R3 + UAT** — verify in test plan T3 + UAT walkthrough; if UAT flags, add `closest('.open-tabs-section')` REJECT to `_computeGroupPromoteTarget`. |
| F-2 | A user who drags a top-level group + drops it well outside any section may expect "no-op" (today's behavior) but get nothing visible because `_groupDragState.isSubGroupDrag` is false → promote path doesn't fire → fallthrough hides visuals → drop with `pendingMode === null` is a no-op. **This IS today's behavior**, so no regression. | Documented; no action. |
| F-3 | Keyboard accessibility for promote — drag-only. AC6 keeps the dialog parent-picker as the keyboard path. No new shortcut. | Existing constraint; matches B-031 F-2 disposition. |
| F-4 | Performance — extending `_buildGroupDragRectCache` with `topLevelOrder` + `topLevelTopY` adds O(n) work at dragstart only (already O(n) for header rect snapshots). No tick-time cost. | No perf risk. |
| F-5 | Broadcast-race during promote — if `_cachedGroupsGen` advances mid-drag (e.g., another window inserts a group), the drop handler's existing race guard at `sidepanel/sidepanel.js:4476–4508` validates target/parent post-fetch. PROMOTE adds a third validation branch: confirm the dragged sub-group still has `parentId !== null` in the fresh fetch (otherwise it was already promoted by a concurrent action, and PROMOTE would be a no-op — abort with toast). | **R3 must add this branch** to the existing race-guard switch. |

## §62.10 Rollback plan

`git revert <B-122 commit>` on `release/v2` is data-clean:

- Any `parentId: null` values set by B-122 promotion remain valid — these groups simply render as top-level groups (which they are, post-promotion).
- Any renormalised `sortOrder` values persist — B-008 / B-031 read unchanged.
- No compatibility shim required.

**Revert removes**: `computeGroupPromote` helper from `shared/sort-order.js`; `_computeGroupPromoteTarget` helper + cache extension (`topLevelOrder`, `topLevelTopY`) + tick-promote branch + drop-handler PROMOTE branch from `sidepanel/sidepanel.js`. Storage layer untouched. Message contracts untouched.

**Atomicity**: `bulkReorderGroups` is single `writeTransaction` (§38 §38.4.3) — all-or-nothing. Same atomicity as B-031.

**SEV tier**: SEV3 (cosmetic regression at worst — failed promote leaves the sub-group in its original parent).

---

## §62.11 As-Built (R6 Close)

**Closed:** 2026-04-29 · **Sprint:** 39 (anchor item #2) · **Branch:** `feature/sprint-39-polish`
**Tier:** Full (M — auto-upgraded from S per CLAUDE.md auto-upgrade rule) · **Pipeline rounds executed:** R1 → R2 → R3 → R4 (parallel × 3) → Wave 3a fix-round → R5 → R6

### §62.11.1 — Files actually changed vs. R2 expected (§62.6 fix-scope table)

| File | Expected (R2 §62.6) | Actual (R6) | Notes |
|------|--------------------|-------------|-------|
| `shared/sort-order.js` | NEW `computeGroupPromote(groups, draggedId, insertAfterGroupId)` exported pure helper after line 432 | ✅ done — lines 419-512 (~93 LOC pure helper) | Defenses landed: `Array.isArray(groups)`, `typeof draggedId === 'string'`, `parentId !== null` (already-top-level short-circuit), self-insert reject, malformed-entry tolerance. |
| `sidepanel/sidepanel.js` | (a) drag-state shape extension (`pendingMode` union + `pendingInsertAfterGroupId`); (b) `_buildGroupDragRectCache` extension (`topLevelOrder` + `topLevelTopY`); (c) `_computeGroupPromoteTarget` helper; (d) `_groupDragTick` PROMOTE intercept; (e) drop handler PROMOTE branch + race-guard third branch | ✅ done — `:355-366` (state) + `:4383-4406` (dragstart init) + `:4604-4694` (drop handler + race-guard) + `:5225-5263` (cache extension) + `:5272-5394` (tick intercept) + `:5530-5625` (`_computeGroupPromoteTarget`) | All five sub-changes landed. F-5 race-guard third branch verified at `:4643-4662`. |
| `sidepanel/sidepanel.js` import | Add `computeGroupPromote` to existing `import { … } from '../shared/sort-order.js'` | ✅ done | Single named-import addition. |
| `sidepanel/sidepanel.css` | No CSS changes — `.group-reorder-indicator` reused as-is | ✅ confirmed — no edits | Per R2 §62.4 single-element reuse. |
| `manifest.json` | No changes | ✅ confirmed — no edits | |
| `shared/messages.js` | No changes — `MSG_BULK_REORDER_GROUPS` per-update shape pre-supports `parentId: null` | ✅ confirmed — no edits | |
| `background/storage/groups.js` | No changes — `validateGroupPatch` + `updateGroup` + `bulkReorderGroups` already accept `parentId: null` | ✅ confirmed — no edits | |
| `tests/sort-order.test.js` | Pure-helper tests (T1, T2 per §62.6 plan) | ✅ done — 9 new B-122 helper tests (`:577-712`) | Expanded beyond the R2 budget of 2 tests; covers all `computeGroupPromote` defenses + monotonic renumber assertions. |
| `tests/b122-drag-to-root.test.js` | NEW per §62.6 — T1..T5 (5 tests budget) | ✅ done — T1..T6 in R3 + T7 added in R5 | R3 shipped 6 tests (one structural-pin extra beyond the 5-test R2 budget — race-guard T5 source-text pin); R5 added T7 to lock the Wave 3a Open-Tabs reject-guard. **7 tests total in this file.** |

### §62.11.2 — Deviations from R2 plan

One R2-deferred risk was upgraded to in-build fix in Wave 3a fix-round (cross-reviewer convergence is a strong fix signal even when the original R2 disposition was "defer to UAT"):

1. **F-1 Open Tabs section reject-guard (R2 deferred-to-UAT → Wave 3a in-build).** R2 §62.9 F-1 explicitly listed the risk that pointer-over-`.open-tabs-section` would surface as PROMOTE-to-bottom (since the Open Tabs section sits below all `.group-section` in DOM order, the helper falls into the "below last sectionBottom" branch). R2 disposition was "R3 + UAT — verify in test plan T3 + UAT walkthrough; if UAT flags, add `closest('.open-tabs-section')` REJECT." R3 shipped without the explicit guard. R4 [code-reviewer] M-4 + [qa-reviewer] M-2 converged on the finding; Wave 3a added the pre-emptive guard:
   ```js
   const hit = document.elementFromPoint(x, y);
   if (hit?.closest?.('.open-tabs-section')) return null;
   ```
   added at `sidepanel.js:_computeGroupPromoteTarget` (right after the X-bounds check). Pattern matches the existing `_computeGroupDropTarget:5462` Open-Tabs reject. R5 added **T7 regression test** to `tests/b122-drag-to-root.test.js` to lock the new guard.

   This is an upgrade — not a scope-change escalation per CLAUDE.md "Scope Change Control". The decision is recorded in `docs/findings/sprint-39.md` ("Wave 3 fix-round scoping" subsection): "pre-emptive UAT-cost saver; R2 §62.9 F-1 explicitly deferred to UAT but the fix is a 5-line addition matching the existing `_computeGroupDropTarget:5462` pattern."

### §62.11.3 — R2-VERIFY marker outcomes

| Marker | R2 disposition | R6 verification |
|--------|---------------|-----------------|
| Q4 above-own-parent tiebreaker (§62.2.1) | "NO explicit conditional needed — `validReorderTargetIds` filters parent at depth-0; PROMOTE intercept fires naturally on `null` return from `_computeGroupDropTarget`" | **VERIFIED at `sidepanel.js:5289-5293`.** REORDER branch returns `null` when `targetGroupId` is not in `validReorderTargetIds`; the dragged sub-group's parent is excluded by construction (parent has `parentId === null`, sub-group's `validReorderTargetIds` only contains other sub-groups of the same parent). PROMOTE intercept at `_groupDragTick` then fires the natural fallthrough. |
| `_computeGroupDropTarget` augmentation (§62.2.2) | Separate helper `_computeGroupPromoteTarget` | **VERIFIED at `sidepanel.js:5530-5625`.** Helper landed as a sibling function; `_groupDragTick` calls it ONLY in the `null` branch when `_groupDragState.isSubGroupDrag === true`. |
| `computeGroupReorder` extensibility (§62.2.3) | Separate `computeGroupPromote` pure helper | **VERIFIED at `shared/sort-order.js:418-512`.** Sibling export; `computeGroupReorder` unchanged; the `tests/sort-order.test.js:333-335` `unknown mode` assertion remains intact (per §62.6 enumeration — no change required). |
| `.group-reorder-indicator` translateY math (§62.2.4) | Cache extension `topLevelOrder` + `topLevelTopY`; reuse existing element | **VERIFIED at `sidepanel.js:5225-5263` (cache build) + `:5278-5328` (tick translateY math).** Single DOM element + single CSS class; AC2 visual-parity satisfied. |
| F-5 race-guard third branch (§62.9) | "R3 must add this branch — confirm dragged sub-group still has `parentId !== null` in fresh fetch + `pendingInsertAfterGroupId` still top-level" | **VERIFIED at `sidepanel.js:4643-4662`.** Both invariants present: `freshDragged.parentId !== null` AND `anchorStillTopLevel` (the `pendingInsertAfterGroupId` resolves to a still-top-level group in the post-fetch snapshot). Toast UX consistent with NEST + REORDER race guards. Two-layer defense — even if guard does not abort, `computeGroupPromote` returns `[]` for already-top-level dragged group (short-circuit at the helper boundary). |

### §62.11.4 — R4 reviewer findings (0 CRIT / 0 HIGH / 1 MEDIUM / 2 LOW for B-122 only)

R4 ran [code-reviewer] + [security-reviewer] + [qa-reviewer] in parallel against the Wave 3 anchors (B-124 + B-122). B-122-attributable findings:

| Severity | # | Reviewer | Finding | Resolution |
|---|---|---|---|---|
| MEDIUM | M-4 | code | `_computeGroupPromoteTarget` does NOT explicitly reject Open Tabs section as promote target despite R2 §62.8 F-1 flagging the UX risk | Resolved in Wave 3a (deviation #1). T7 regression test added in R5. |
| MEDIUM | M-2 | qa | Drop on Open Tabs section silently promotes to "after last top-level group" | (Convergent with M-4 above.) Resolved in Wave 3a. |
| LOW | L-2 (security) | sec | `_groupDragTick` PROMOTE branch reads `topLevelOrder[0]` after entering on `promote` truthy — implicit caller-invariant reliance | **Deferred — defense-in-depth observation only.** Code is safe by construction (`_computeGroupPromoteTarget` guards `topLevelOrder.length === 0` and returns null); the tick branch is only entered when at least one top-level group exists. |
| LOW | L-4 (code) | code | `anchorId === null` fallback to PROMOTE-to-top conflates "above first top-level section.top" with "inside a section body" | **Deferred to UAT.** R2 §62.3 hit-test does not enumerate (b); UAT walkthrough item per §62.11.6. |
| LOW | L-5 (code) | code | PROMOTE/REORDER ternary inlines `const updates =` assignment — readability | **Deferred — refactor opportunity** (single dispatch site verified at `:4710`). |
| LOW | L-6 (code) | code | T5 PROMOTE race-guard pin uses local-name regex (`anchorStillTopLevel`); rename would silently pass | **Deferred — acceptable per established source-text-pin pattern.** R5 T7 strengthens behavioral coverage of the surrounding logic. |
| LOW | L-5 (qa) | qa | `_computeGroupPromoteTarget` "fallback to insert at top" silently triggers for ANY in-section pointer (overlap with [code] L-4) | **Deferred to UAT** (per §62.11.6 walkthrough). |
| LOW | L-6 (qa) | qa | Test coverage missing for two F-class risks (Open-Tabs drop + drag-over-non-parent-section-body) | **Partially resolved** — Open-Tabs drop covered by R5 T7; drag-over-non-parent-section-body deferred to UAT. |
| LOW | L-10 (qa) | qa | PROMOTE carve-out from `!state.pendingTargetGroupId` check has subtle ordering coupling | **Deferred — refactor opportunity.** |

Full deduplicated table in `docs/findings/sprint-39.md` ("Wave 3 anchors" subsection).

### §62.11.5 — R2 Correctness Checklist closure verification (C-1..C-12)

| # | Check | R6 closure verdict |
|---|-------|--------------------|
| C-1a | Storage schema versioned (governance) | **N/A — confirmed.** No schema shape change. Group records pre-supported `parentId: null` since B-001a. No `KNOWN_VERSION` bump. |
| C-1b | Data-migration strategy chosen (data) | **N/A — confirmed.** No schema change. |
| C-2 | Message contracts typed | **PASS — confirmed.** `MSG_BULK_REORDER_GROUPS` typed shape unchanged; per-update shape `{ id, sortOrder, parentId?: string\|null }` already accepts `null` from B-031 §38.3 D-1. No new message types. |
| C-3 | SW cold-start safe | **PASS — confirmed.** Drag is renderer-only state; dispatch through existing `MSG_BULK_REORDER_GROUPS` re-reads partitions on every call. |
| C-4 | ID stability | **PASS — confirmed.** `parentId` and `sortOrder` are mutable fields per `validateGroupPatch:112-113`; `id`/`createdAt` immutable. |
| C-5 | Manifest file references resolvable | **N/A — confirmed.** No `manifest.json` edits. |
| C-6 | Permission minimization | **N/A — confirmed.** Zero permission additions. |
| C-7 | Allow-list direction | **PASS — confirmed.** Reuses existing allow-list at `background/storage/groups.js:116` (`['name', 'color', 'parentId', 'sortOrder', 'collapsed']`). No deny-list introduced. |
| C-8 | SW-context feasibility | **N/A — confirmed.** All new code is sidepanel-side (renderer context). |
| C-9 | Empty-state design | **PASS — confirmed.** Edge cases verified per §62.8 — sole-sub-group-of-sole-top-level-parent produces correct update spec; zero-top-level groups handled defensively (`topLevelOrder.length === 0` → null return). |
| C-10 | Off-screen rect feasibility | **N/A — confirmed.** No off-screen positioning; reuses existing `.group-reorder-indicator` via `transform: translateY(...)`. |
| C-11 | Popup-lifecycle message ordering | **N/A — confirmed.** Sidepanel context; no focus-shifting API calls. |
| C-12 | Manifest declaration runtime-mutability | **N/A — confirmed.** No manifest declaration changes. |

**No C-1..C-12 violations detected at R6 close.**

### §62.11.6 — Test counts (final) — pre/post baseline + delta

- **Pre-B-122 baseline (after Wave 1 + B-123 + B-124 R3+Wave 3a):** ~1,683 tests passing (post-B-124 baseline).
- **B-122 deltas:**
  - `tests/sort-order.test.js`: **+9 tests** (B-122 helper-only — `computeGroupPromote` defenses + monotonic renumber + already-top-level short-circuit + self-insert reject + malformed-entry tolerance).
  - `tests/b122-drag-to-root.test.js`: **+7 tests** (R3 T1..T6 + R5 T7 Open-Tabs reject-guard regression).
- **B-122 total delta: +16 tests.**
- **Combined Sprint 39 anchor delta after B-124 + B-122 R5:** **1,693 tests passing** (per [qa-reviewer] R4 test-suite line — matches expected baseline post-anchors).
- **Zero regressions** in the pre-existing suite.

**UAT must explicitly walk** (per [qa-reviewer] M-2 + L-5 + L-6 deferrals):
1. Drop-on-Open-Tabs gesture — verify Wave 3a guard rejects (no PROMOTE triggers).
2. Drop-on-non-parent-top-level-section-body gesture — verify "fallback to insert at top" UX is acceptable OR flag as polish-backlog item.
3. F-1 above-own-parent edge — verify the `validReorderTargetIds` filter cleanly routes to PROMOTE intercept (Q4 outcome).

### §62.11.7 — Rollback plan (single-commit revert procedure)

The B-122 work is a single atomic commit on `feature/sprint-39-polish` containing:
- `shared/sort-order.js` — new `computeGroupPromote` pure helper (lines 419-512)
- `sidepanel/sidepanel.js` — drag-state extension + `_computeGroupPromoteTarget` + cache extension + tick PROMOTE intercept + drop-handler PROMOTE branch + F-5 race-guard third branch
- `tests/sort-order.test.js` — 9 new helper tests
- `tests/b122-drag-to-root.test.js` (new — 6 R3 tests + 1 R5 T7 = 7 tests)

```bash
# Identify the B-122 commit on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -i "B-122"

# Single-commit revert:
git revert <r3-commit-sha>
git push origin release/v2

# If Wave 3a fix-round landed as a separate commit:
git revert <wave3a-commit-sha>  # before reverting R3 commit
```

**Post-revert state:**
- Sub-group → top-level promotion via drag is removed; users return to the B-007 dialog parent-picker as the sole promotion path (`<select id="group-field-parent">` → `"Top-level (no parent)"` option). Existing B-031 NEST + REORDER drag paths are unaffected.
- Any `parentId: null` values previously set by B-122 promotion remain valid — these groups simply render as top-level groups (which they are, post-promotion).
- Any renormalised `sortOrder` values persist — B-008 / B-031 read them unchanged.
- The two test files revert (16 tests removed).

**Atomicity:** `bulkReorderGroups` is single `writeTransaction` (per B-031 §38.4.3) — all-or-nothing.

**No SW toggle-cycle required** (per C-1a — no schema shape change). **No data migration to roll back. SEV3** if rollback is forced (cosmetic regression at worst — failed promote leaves the sub-group in its original parent; keyboard path via dialog parent-picker remains).

### §62.11.8 — Schema / contract / permission impact

Confirmed by direct re-read of the diff:
- **Storage schema:** unchanged. No `tj:meta.schemaVersion` bump.
- **Message contracts:** unchanged. `MSG_BULK_REORDER_GROUPS` per-update shape pre-supports `parentId: null` from B-031 §38.3 D-1; no `shared/messages.js` typedef edits.
- **Manifest permissions:** unchanged. No new `permissions` or `host_permissions` entries.
- **Validation surfaces:** `validateGroupPatch` + `updateGroup` + `bulkReorderGroups` allow-lists unchanged (verified §62.5 four-row table at R2 — re-verified at R6 against current `background/storage/groups.js`).

### §62.11.9 — Open follow-ups

- **L-4 (code) / L-5 (qa) — in-section-body fallback ambiguity** — UAT-confirm step queued (§62.11.6 walkthrough item 2). Polish-backlog candidate if UAT surfaces it.
- **L-10 (qa) — PROMOTE carve-out refactor opportunity** — defer to refactor pass.
- **L-2 (security) — defense-in-depth `topLevelOrder[0]` short-circuit** — optional one-line hardening if/when the surrounding code grows.

---

**End of §62.**
