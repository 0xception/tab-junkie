# UAT — B-033 Drag Saved+Live Item to Open Tabs → Demote

Sprint 23 · Fast Track (S) · R1 UAT plan (authored at R1 per Sprint 22 retro HIGH-2)

**Depends on**: B-030 drag pipeline live. Execute these cases AFTER B-030 UAT passes and B-030 PR merges.

Related artefacts:
- `docs/BACKLOG.md` — B-033 row (9 ACs)
- `tests/b033-drag-to-demote.test.js` — to be authored in R5

## Setup

1. Reload the extension in Edge after B-030 + B-033 both ship.
2. Open the side panel + at least 1 browser tab whose URL matches a saved bookmark (so at least one saved+live item exists).
3. Pre-create state:
   - 2 groups (e.g. `Work`, `Reading`), each with 2+ bookmarks.
   - Open ≥ 3 browser tabs; at least 1 tab URL matches a saved bookmark (making it saved+live — the row has a live-tab indicator).
   - At least 1 browser tab whose URL does NOT match any saved item (so the Open Tabs section is non-empty with a live-only row).
4. Confirm the side panel shows the `Open Tabs` section and at least one saved+live item in a group.

Legend: **PASS** · **FAIL** · **WARN** · **SKIP**.

## Test Cases

### UAT-1: Drag saved+live item to Open Tabs → demote fires (AC1 · AC2 · AC6)

**Steps**:
1. Identify a saved+live item in one of your groups (has both saved state AND a live-tab indicator).
2. Click-and-hold on that item; drag it down toward the `Open Tabs` section.
3. Observe the Open Tabs section as the cursor enters it — a drop-target indicator should appear on the section (per AC1).
4. Release the drop inside the Open Tabs section.
5. Check: (a) post-drop layout; (b) the live tab; (c) the success toast.

**Expected**:
- A drop-target indicator / highlight renders on the Open Tabs section while the saved+live item hovers over it.
- On release: the dragged item DISAPPEARS from its saved group AND APPEARS in the Open Tabs section (as a live-only row).
- The live tab in the browser stays open at its URL — no tab closure.
- A toast appears reading something like "Bookmark removed — tab stays open."
- Post-reload: saved item is gone (only live-only row remains).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Saved-only item drag → rejected (AC3)

**Setup**: Identify a saved item that does NOT have an open live tab (no live indicator on the row).

**Steps**:
1. Click-and-hold on the saved-only item; drag it toward the Open Tabs section.
2. Observe the Open Tabs section during the hover.
3. Release the drop.

**Expected**:
- NO drop-target indicator appears on the Open Tabs section during the hover (per AC3 — saved-only drags are rejected by the Open Tabs drop zone).
- On release: item stays in its original group; no demote.
- No toast.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Drag live-only row within Open Tabs → no-op (AC4)

**Steps**:
1. Locate a live-only row in the Open Tabs section (a browser tab with no matching saved bookmark).
2. Click-and-hold on that row; attempt to drag it within the Open Tabs section.
3. Release.

**Expected**:
- No demote occurs (it's already live-only).
- No error toast.
- Browser tab remains open.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Cross-ownership with B-030 (AC5)

**Setup**: Verify that B-030's drop-target classification treats Open Tabs as out-of-scope for reorder.

**Steps**:
1. Drag a saved-only item (no live tab) and attempt to drop it onto Open Tabs.
2. Drag a saved+live item onto a specific `.group-items` container (NOT Open Tabs).
3. Observe both drop behaviors.

**Expected**:
- Saved-only → Open Tabs: no-op (per UAT-2; B-033 drop handler rejects).
- Saved+live → group-items: reorder happens (B-030 owns), NOT demote.
- Never both a B-030 reorder AND a B-033 demote fire on the same drop event.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Post-demote live tab remains open (AC2)

**Steps**:
1. Execute UAT-1 (drag saved+live to Open Tabs → demote).
2. Locate the live tab in the browser's tab bar (the tab that was saved+live; now just live).
3. Verify the tab is still open at its original URL.
4. Navigate the tab forward to a new URL, then back to the original.

**Expected**:
- Tab is still open at original URL immediately post-demote.
- No ghost state where the tab URL changes or the tab flickers.
- Navigation works normally.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Drag cancel during hover — no demote

**Steps**:
1. Start a drag on a saved+live item; hover over the Open Tabs section (drop indicator visible).
2. Press **Escape** or drag the item back OUT of the Open Tabs section before releasing.
3. Release outside Open Tabs (or press Escape).

**Expected**:
- No demote fires.
- Item stays saved+live in its original group.
- No toast, no console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Saved+live → Open Tabs → demote | |
| 2 | Saved-only → Open Tabs → rejected | |
| 3 | Live-only within Open Tabs → no-op | |
| 4 | B-030 cross-ownership boundary | |
| 5 | Post-demote tab remains open | |
| 6 | Drag cancel → no demote | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________
