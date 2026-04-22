# UAT — B-031 Group Drag-Reorder & Nesting via Drag (v2)

Sprint 24 · Full tier (M) · Round 1 UAT plan (authored at R1 per Sprint 22/23 retro HIGH-2)

Related artefacts:
- `docs/BACKLOG.md` — B-031 row (acceptance criteria)
- `docs/SPRINT.md` — B-031 active item entry
- `tests/b031-group-drag.test.js` — automated test file (written at R5)
- `docs/design/37-b-031-group-drag-reorder-nesting.md` — R6 close chapter (added at R6)

**Dependency recap**: B-007 (sub-group depth=1 cap + `filterGroupParentCandidates` helper), B-008 (group reorder + drag handle + `sortOrder` persistence), B-030 (item drag foundation — rAF coalescing, cached rects, broadcast-race guard pattern). All three are `done` on `release/v2` as of v1.17.0.

**Two distinct drop modes**:
- **REORDER** — cursor in top 25% or bottom 25% of a group header → shows horizontal indicator line between groups → commits new `sortOrder` values
- **NEST** — cursor in middle 50% of a group header → highlights that header as nest destination → commits `parentGroupId` + `sortOrder` inside new parent

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Open the side panel.
3. Pre-create state:
   - At least 4 top-level groups: `Work`, `Reading`, `Personal`, `Archive` — each with 3–4 bookmarks.
   - Optionally nest `Archive` as a sub-group of `Work` first (to test rejection cases).
   - At least 1 ungrouped bookmark.
4. Leave DevTools open on the side panel (right-click → Inspect) — Performance tab ready for UAT-6.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

## Test Cases

---

### UAT-1: Reorder two top-level groups (REORDER mode — AC2 · AC4 · AC10)

**Setup**: Groups visible in order `Work`, `Reading`, `Personal`, `Archive`.

**Steps**:
1. Grab the drag handle on `Work`'s group header.
2. Drag it downward past `Reading` and `Personal` — position the pointer in the top 25% of `Archive`'s header (REORDER zone, upper edge).
3. Observe the horizontal indicator line appearing between `Personal` and `Archive`.
4. Release the drag.
5. Inspect the new group order.
6. Reload the side panel (close + reopen); re-inspect order.

**Expected**:
- Horizontal indicator line appears between `Personal` and `Archive` (not a header highlight — that would be NEST mode).
- On drop: groups reorder to `Reading`, `Personal`, `Work`, `Archive` immediately (≤ 200 ms).
- All group items remain under their respective groups — no item displacement.
- Post-reload: order persists; `sortOrder` values are consecutive integers (verify via storage inspector if convenient).
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Nest a top-level group into another — NEST mode (AC5 · AC6 · AC10 · AC11)

**Setup**: `Work`, `Reading`, `Personal`, `Archive` all top-level; none has sub-groups.

**Steps**:
1. Grab `Reading`'s drag handle.
2. Drag toward `Work`'s header; position the pointer in the middle 50% of `Work`'s header (NEST zone).
3. Observe: `Work`'s header highlights as a nest destination (distinct from the reorder line).
4. Release the drag.
5. Expand `Work`'s sub-group list.
6. Reload; re-expand `Work`.

**Expected**:
- `Work`'s header becomes highlighted (nest target indicator, e.g. solid blue border or background tint) while cursor is in middle 50%.
- On drop: `Reading` appears as a sub-group of `Work` (indented under `Work` in the panel, `parentGroupId` set).
- `Reading`'s items remain under `Reading`.
- `Work`'s collapse/expand toggle still works; expanding shows `Reading` as a child.
- Post-reload: nesting persists.
- `sortOrder` inside `Work`'s children is `1` (or `0`) — no gaps.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Reject stacking — drag sub-group onto another sub-group (AC7 · AC8 · AC9)

**Setup**: Ensure `Reading` is already a sub-group of `Work` (from UAT-2, or set up manually). Ensure `Personal` is still top-level.

**Steps**:
1. Attempt to grab `Reading`'s drag handle (it is now a sub-group).
2. Drag it toward `Personal`'s header; position in the middle 50% (NEST zone).
3. Observe feedback during hover.
4. Release the drag.

**Expected**:
- While hovering over `Personal` in NEST zone: rejection visual feedback fires (e.g. red flash on `Personal`'s header, or a "no-entry" cursor / ❌ indicator) — `Personal` does NOT highlight as a valid nest target.
- On release: no nesting occurs; `Reading` remains a sub-group of `Work`.
- No storage writes (verify post-reload: structure unchanged).
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Reject circular nesting — drag parent onto its own sub-group (AC8 · AC9)

**Setup**: `Reading` is a sub-group of `Work`.

**Steps**:
1. Grab `Work`'s drag handle (it is a parent group with a sub-group).
2. Drag toward `Reading`'s header; position in the middle 50% (NEST zone, would create a cycle: Work → child of Reading → child of Work).
3. Observe feedback during hover.
4. Release.

**Expected**:
- Rejection feedback on `Reading`'s header while `Work` hovers over it in the NEST zone.
- On release: no nesting occurs; structure unchanged.
- Post-reload: `Reading` is still a sub-group of `Work`; `Work` remains top-level.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Drop-on-self no-op — drag group onto its own header (AC3)

**Steps**:
1. Grab `Personal`'s drag handle.
2. Drag slightly and drop back on `Personal`'s own header (in any zone — top, middle, bottom).

**Expected**:
- No reorder, no nesting, no visual change, no storage write.
- DOM reverts immediately; indicator hides if it appeared.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: PERF — continuous 10-second group header drag (AC13 — perf guardrail)

**Setup**: DevTools **Performance** tab open, recording ready.

**Steps**:
1. Start a Performance recording.
2. Grab any group's drag handle; continuously move the pointer in a circle over the group list for **~10 seconds** (do not release).
3. Release the drag at any valid position.
4. Stop the recording.
5. Inspect:
   - "Long tasks" (> 50 ms) in the Main track during the drag.
   - Frames track — drops below 60 fps?
   - Summary — is scripting time bounded (not exponentially growing)?

**Expected**:
- NO long tasks (> 50 ms) during drag.
- Frames sustain ~60 fps throughout.
- No perceptible lag or compounding slowdown.

**WARN** if a single frame exceeds 16 ms but cumulative average remains smooth.
**FAIL** if lag is visible OR long tasks appear OR frames drop below ~50 fps sustained.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Persistence verification — reload after reorder + nest (AC10 · AC11)

**Steps**:
1. Perform a group reorder (e.g. move `Archive` to top position).
2. Nest `Personal` into `Archive`.
3. Close the side panel entirely and reopen it (or reload the extension).
4. Inspect group order and nesting.

**Expected**:
- `Archive` is first in the list.
- `Personal` appears as a sub-group of `Archive` — still expanded/accessible.
- All items within each group are intact.
- `sortOrder` values for top-level groups are consecutive integers (no gaps).
- No console errors on reload.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Broadcast-race — mid-drag group update from another window (AC15)

**Setup**: Two Edge windows with the side panel open in each.

**Steps**:
1. In **Window B**: rename any group (or add a bookmark to a group) — triggers a `MSG_STATE_CHANGED` broadcast.
2. In **Window A**: begin a group drag at the same time (or immediately after), before releasing.
3. Release the drag in Window A at a new reorder position.
4. Observe final state in both windows.

**Expected**:
- Either: (a) the drop completes correctly — Window A re-fetches fresh group state before committing, both windows converge on consistent order; or (b) the drop aborts with a toast "Order changed — try again" and no partial write lands.
- No console errors in either window.
- Post-reload: no phantom or stale group order persists.

**WARN** if Window A shows ghost state for > 2 seconds post-release.
**SKIP** acceptable if a two-window setup is not convenient — document reason.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Escape cancels group drag (AC12)

**Steps**:
1. Grab any group drag handle; move the pointer to a new position (indicator or highlight should appear).
2. Press **Escape** before releasing.
3. Inspect the DOM + storage.

**Expected**:
- Indicator/highlight hides immediately.
- No visible change in group order or nesting.
- No message dispatched (verify post-reload: structure unchanged).
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Reject — drag onto Ungrouped pseudo-group in NEST mode (AC9)

**Steps**:
1. Grab any top-level group's drag handle.
2. Drag toward the **Ungrouped** section header; position in the middle 50% (NEST zone).
3. Observe feedback.
4. Release.

**Expected**:
- Rejection visual feedback fires on the Ungrouped header — Ungrouped cannot accept sub-groups.
- On release: no nesting occurs; source group remains top-level.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Reject — group with existing sub-groups dropped as a sub-group (AC7)

**Setup**: `Work` has `Reading` as a sub-group (depth-1 group with children).

**Steps**:
1. Grab `Work`'s drag handle.
2. Drag toward `Archive`'s header; position in NEST zone (middle 50%).
3. Observe feedback — `Work` already has children, so nesting it would create depth-2.
4. Release.

**Expected**:
- Rejection visual feedback on `Archive`'s header while `Work` hovers over it in NEST zone.
- On release: `Work` remains top-level; `Archive` does not gain `Work` as a sub-group.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Reorder two top-level groups (REORDER mode) | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 2 | Nest a top-level group into another (NEST mode) | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 3 | Reject stacking — sub-group dragged onto another sub-group | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 4 | Reject circular nesting — parent onto its own descendant | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 5 | Drop-on-self no-op | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 6 | PERF — continuous 10-second group header drag | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 7 | Persistence after reorder + nest | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 8 | Broadcast-race mid-drag | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 9 | Escape cancels group drag | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 10 | Reject — drag onto Ungrouped in NEST mode | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 11 | Reject — group with sub-groups dropped as sub-group | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |

**Overall**: [ ] PASS / [ ] FAIL

### Merge-blocking gates

B-031 PR does NOT merge until:
- UAT-1 (reorder persist), UAT-2 (nest persist), UAT-3 (stacking reject), UAT-4 (circular reject) are all **PASS**.
- UAT-6 (perf) is **PASS** — group drag must not regress item-drag perf baseline.
- UAT-11 (depth-2 prevent via drag) is **PASS** — mirrors B-007 keyboard-path depth cap.
- UAT-7 (persistence) is **PASS**.
- UAT-8 SKIP is acceptable if two-window setup is unavailable; UAT-5 and UAT-9 SKIP are NOT acceptable.

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________
