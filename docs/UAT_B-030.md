# UAT — B-030 Item Drag-Reorder (v2)

Sprint 23 · Spike-First tier (L) · Round 1 UAT plan (authored at R1 per Sprint 22 retro HIGH-2)

Related artefacts:
- `docs/BACKLOG.md` — B-030 row (24 acceptance criteria, includes ACs 16-24 for perf + correctness guardrails)
- `docs/SPRINT.md` — B-030 R0 spike decisions (D-A..D-E), risk-flag mitigations
- `tests/b030-item-drag-reorder.test.js` — fake-DOM drag simulation (AC20) + backend tests
- `tests/sort-order.test.js` — computeItemReorder pure-helper tests incl. same-group 3-destination (AC21)
- `docs/design/36-b-030-item-drag-reorder-v2.md` — R6 close chapter

**v1 failure mode recap (do not repeat)**: S22 dragover at 60-120 Hz called `getBoundingClientRect` + mutated DOM in the same handler → layout thrash compounding over time; `dropIndicatorEl.parentElement` was the drop-handler's source of truth for destination group, coupling visual indicator state to logical drop state → same-group reorder silently dropped. v2 eliminates both via rAF coalescing + cached rects + transform-positioned indicator + logical state decoupled from indicator DOM position.

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Open the side panel.
3. Pre-create state:
   - 3 top-level groups (e.g. `Work`, `Reading`, `Personal`), each with 4-5 bookmarks.
   - At least 1 ungrouped bookmark.
4. Leave DevTools open on the side panel (right-click → Inspect) — Performance tab ready for UAT-6.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

## Test Cases

### UAT-1: Same-group reorder — THE S22 FAILURE CASE (AC4 · AC9 · correctness)

**Setup**: `Work` group with items [a, b, c, d, e] in that visual order.

**Steps**:
1. Click-and-hold on item `a` (first row in Work); drag it below `e` (last row).
2. Release the drag at a position clearly below `e`'s midpoint.
3. Inspect the new order of Work's items.
4. Reload the side panel (close + reopen, or refresh the extension).
5. Re-inspect the order.

**Expected**:
- On drop: Work's items reorder to [b, c, d, e, a] immediately (within ~200 ms).
- After reload: the new order persists exactly.
- No console errors surface during the drag, drop, or reload.
- No toast appears announcing an error.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Cross-group move (AC5)

**Steps**:
1. Click-and-hold on item `a` (in Work); drag it onto the middle of `Reading`'s items area.
2. Release over a position between two Reading items.
3. Inspect both groups' item counts + orders.
4. Reload the side panel.

**Expected**:
- `a` appears in Reading at the drop position; Work no longer contains `a`.
- Both groups' sortOrder values remain consecutive integers (no gaps visible via a storage inspector if checked).
- Post-reload state matches post-drop state.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Drop onto Ungrouped (AC6)

**Steps**:
1. Drag an item from `Work` onto the `Ungrouped` section header or into its items area.
2. Release the drop.
3. Inspect the Ungrouped section + the source group.

**Expected**:
- Dragged item now appears under Ungrouped.
- Source group loses the item; its remaining items renumber.
- Post-reload: state persists.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Escape cancels drag (AC8)

**Steps**:
1. Click-and-hold on any item; move the pointer to a new position (indicator should appear).
2. Press **Escape** before releasing.
3. Inspect the DOM + storage.

**Expected**:
- Indicator hides immediately.
- No visible change in item order.
- No `MSG_BULK_REORDER_ITEMS` dispatched (verify via Network / background-SW inspect if convenient; otherwise confirm via post-reload: order unchanged).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Release outside valid target (AC8)

**Steps**:
1. Click-and-hold on any item; drag to the side panel header area (above `#add-bookmark-btn`).
2. Release the drag there (not on any `.group-items` container).

**Expected**:
- Same as Escape: indicator hides; no reorder occurs.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: PERF — continuous 10-second drag (AC10 · AC16 · AC17 · AC18 — THE S22 PERF-REGRESSION CASE)

**Setup**: DevTools **Performance** tab open, recording ready.

**Steps**:
1. Start a Performance recording.
2. Click-and-hold on any item; continuously move the pointer in a circle within the item list area for **~10 seconds** (do not release).
3. Release the drag (anywhere valid).
4. Stop the Performance recording.
5. Inspect the recording:
   - Look for "Long tasks" (> 50 ms) in the Main track during the drag.
   - Check the "Frames" track — are frames dropping (< 60 fps) or missing?
   - Check the Summary — total scripting + rendering time.

**Expected**:
- NO long tasks (> 50 ms) during drag.
- Frames sustain ~60 fps throughout the 10-second drag (no compounding slowdown).
- Pointer-follow feels smooth end-to-end — no perceptible lag at any point.
- Scripting time bounded (not exponentially growing).

**WARN** if any single frame exceeds 16 ms but the cumulative average is smooth.
**FAIL** if lag is visible OR long tasks appear OR frames drop below ~50 fps sustained.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: B-008 regression — group drag still performant (S22 REGRESSION CASE)

**Steps**:
1. Grab a group header's **drag handle** (`⋮⋮` icon) — NOT the body of the header.
2. Drag the group up or down; release at a new position among the other groups.
3. Observe drag smoothness + post-drop order.

**Expected**:
- Drag feels as smooth as it did pre-B-030 (no regression).
- Group reorders correctly.
- Post-reload state persists.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Accessibility disclosure (AC12)

**Steps**:
1. Hover any `.item-row` without clicking.
2. Wait for the browser's tooltip to appear.

**Expected**:
- Tooltip reads: "Drag to reorder (keyboard reorder not yet available)".

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Mid-drag broadcast race (AC24 — correctness guardrail)

**Setup**: requires two side panel instances (open in two Edge windows).

**Steps**:
1. In window B, delete an item from any group.
2. Quickly in window A, start a drag (on a different item in the same group).
3. Before releasing, wait ~1 second for the broadcast from window B's delete to land in window A.
4. Release the drag at a new position in the same group.

**Expected**:
- No console errors.
- Either: (a) the drop completes and the reorder persists correctly (broadcast-race guard re-fetched fresh state), or (b) the drop aborts with a toast "Order changed — try again" and no partial write lands.
- If (a): both windows show consistent final state after broadcast settles.

**WARN** if window A shows ghost state for > 2 seconds post-release.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Same-group reorder — THE S22 FAILURE CASE | |
| 2 | Cross-group move | |
| 3 | Drop onto Ungrouped | |
| 4 | Escape cancels | |
| 5 | Release outside valid target | |
| 6 | PERF continuous 10s drag — THE S22 PERF-REGRESSION CASE | |
| 7 | B-008 regression check | |
| 8 | A11y disclosure | |
| 9 | Mid-drag broadcast race | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

### Merge-blocking gates

Per Sprint 22 retro HIGH-3: **B-030 PR does NOT merge until product-owner reports ≥ 6/9 cases PASS AND UAT-1 + UAT-6 are both PASS** (those two are the S22 blocker-case regression guards). UAT-9 SKIP is acceptable if a two-window setup isn't convenient; UAT-7 SKIP is NOT acceptable (must confirm no regression).
