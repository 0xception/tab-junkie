# UAT — B-009 Drag-to-Expand Collapsed Group

Sprint 23 · Fast Track (S) · R1 UAT plan (authored at R1 per Sprint 22 retro HIGH-2)

**Depends on**: B-030 drag pipeline live. Execute these cases AFTER B-030 UAT passes and B-030 PR merges.

Related artefacts:
- `docs/BACKLOG.md` — B-009 row (8 ACs)
- `tests/b009-drag-to-expand.test.js` — to be authored in R5

## Setup

1. Reload the extension in Edge after B-030 + B-009 both ship.
2. Open the side panel.
3. Pre-create state:
   - 3 top-level groups (e.g. `Work`, `Reading`, `Personal`), each with at least 2 bookmarks.
   - At least 1 ungrouped bookmark (so a draggable source exists outside the target collapsed group).
4. **Collapse at least 2 of the 3 groups** (click the group header to toggle collapse).

Legend: **PASS** · **FAIL** · **WARN** · **SKIP**.

## Test Cases

### UAT-1: Hover-hold 600ms expands the collapsed group (AC1)

**Steps**:
1. Click-and-hold on an ungrouped item or an item from an **expanded** group.
2. Drag the pointer over a **collapsed** group's header.
3. **Hold the pointer still** over the collapsed header for ~1 second.
4. Observe the collapsed group.

**Expected**:
- After ~600 ms of continuous hover, the collapsed group expands automatically.
- The drag remains active (indicator remains visible inside the newly-expanded group).
- No console error.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Fast pass does NOT expand (AC2)

**Steps**:
1. Start a drag as in UAT-1.
2. Move the pointer **rapidly** across a collapsed group's header (< 600 ms dwell).
3. Observe the collapsed group.

**Expected**:
- Group stays collapsed.
- No flicker, no accidental expansion.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Hover-hold without an active drag is inert (AC3)

**Steps**:
1. **Do NOT start a drag.**
2. Hover the pointer over a collapsed group's header for 2+ seconds.

**Expected**:
- Group stays collapsed (the pre-existing click-to-toggle behavior is the only interaction; hover alone does nothing).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Expansion persists past drag end (AC4)

**Steps**:
1. Execute UAT-1 (hover-hold → group expands).
2. Either (a) drop the item into the now-expanded group, OR (b) press Escape to cancel the drag.
3. Reload the side panel.

**Expected**:
- After drag ends (drop OR cancel): group stays expanded.
- After reload: group still expanded (persisted via `MSG_UPDATE_GROUP { collapsed: false }`).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Dragleave before 600ms cancels the timer (AC5)

**Steps**:
1. Start a drag.
2. Hover over a collapsed group's header for ~300 ms (less than 600 ms).
3. Move the pointer AWAY from the collapsed header before the 600 ms elapses.
4. Observe.

**Expected**:
- Group stays collapsed (timer was cancelled when pointer left).
- No delayed expansion occurs even after waiting further.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Already-expanded group hover is a no-op (AC6)

**Setup**: Open DevTools → background SW inspect → Network/Messages (or console with message logging hook).

**Steps**:
1. Start a drag.
2. Hover over an **already-expanded** group's header for 2+ seconds.
3. Observe message traffic.

**Expected**:
- No `MSG_UPDATE_GROUP` message is dispatched during the hover.
- Group remains expanded (no-op).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Hover-hold 600ms → expands | |
| 2 | Fast pass → no expansion | |
| 3 | Hover-hold without drag → inert | |
| 4 | Expansion persists past drag end | |
| 5 | Dragleave before 600ms → cancel | |
| 6 | Already-expanded → no-op | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________
