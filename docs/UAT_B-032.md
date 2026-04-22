# UAT — B-032 Auto-scroll During Drag

Sprint 24 · Fast Track tier (S) · Round 1 UAT plan (authored at R1 per Sprint 23 retro action items)

Related artefacts:
- `docs/BACKLOG.md` — B-032 row (AC1–AC12)
- `docs/SPRINT.md` — B-032 active item
- `tests/b032-auto-scroll.test.js` — auto-scroll unit tests (or additions to `tests/b030-item-drag-reorder.test.js`)
- `sidepanel/sidepanel.js` — auto-scroll implementation (rAF loop, edge detection, `itemListEl.scrollTop`)

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Open the side panel.
3. Pre-create state:
   - At least 2 groups with enough items that the list overflows the sidepanel viewport (scroll visible — e.g., 3 groups × 6 items each).
4. Leave DevTools open on the side panel (right-click → Inspect) — Console clear, Performance tab ready for UAT-6.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

## Test Cases

### UAT-1: Top-edge activation — scroll up continuously (AC1 · AC2 · AC4)

**Setup**: Scroll the item list down so there are items above the visible viewport. Start a drag on any visible item.

**Steps**:
1. Click-and-hold on a visible item and begin dragging.
2. Move the pointer to within 40 px of the **top edge** of `#item-list` — hold it there without releasing.
3. Observe the list for 2–3 seconds.
4. Move the pointer back to the centre of the list (away from the edge zone).

**Expected**:
- While pointer is within the 60 px top-edge zone: `#item-list` scrolls **upward continuously**.
- Scroll speed is noticeably slower at 55 px from edge than at 10 px from edge (proportional ramp visible).
- When pointer moves to centre: scrolling **stops immediately** (next rAF tick — no coasting).
- No console errors at any point.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Bottom-edge activation — scroll down continuously (AC1 · AC2 · AC4)

**Setup**: Scroll the item list to top so there are items below the visible viewport. Start a drag on any visible item.

**Steps**:
1. Click-and-hold on a visible item and begin dragging.
2. Move the pointer to within 40 px of the **bottom edge** of `#item-list` — hold it there without releasing for 2–3 seconds.
3. Observe: the list should scroll **downward** continuously.
4. Move the pointer back to the centre.

**Expected**:
- Continuous downward scroll while in the 60 px bottom-edge zone.
- Scrolling stops immediately when pointer leaves the zone.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Deactivation on pointer leaving edge zone (AC5)

**Steps**:
1. Initiate a drag and move to the top-edge zone — confirm scroll starts.
2. Slowly move the pointer from the edge zone toward the vertical centre of the list in one smooth motion.
3. Note the exact moment scrolling stops.

**Expected**:
- Scrolling stops within the next rAF frame after the pointer crosses the 60 px boundary.
- No residual scrolling or "coast" after the boundary is crossed.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Deactivation on drag cancel (Escape) and on drop (AC5 · AC6)

**Steps (Escape path)**:
1. Initiate a drag and hold near the bottom edge (auto-scroll active).
2. Press **Escape** without releasing the mouse.
3. Observe scroll + indicator.

**Steps (drop path)**:
1. Initiate a drag and hold near the top edge (auto-scroll active).
2. Release the drag (drop the item anywhere valid).
3. Observe scroll after release.

**Expected — both paths**:
- Auto-scroll stops immediately.
- Drop indicator disappears (Escape: no reorder; drop: item placed at logical position).
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Speed ramp — slow near boundary, fast near extreme edge (AC2 · AC3)

**Setup**: Long item list, items overflowing in both directions.

**Steps**:
1. Initiate a drag. Move pointer to **59 px from the top edge** — hold for ~2 seconds. Note (or measure) scroll cadence.
2. Move pointer to **5 px from the top edge** — hold for ~2 seconds. Note scroll cadence.

**Expected**:
- Scroll at 59 px from edge: perceptibly **slow** (≈ max_speed × (1/60) per frame at linear ramp — nearly zero).
- Scroll at 5 px from edge: perceptibly **fast** (≈ max_speed × (55/60) per frame — close to cap).
- Speed difference is clearly visible — not a binary on/off.
- Max speed does not cause the list to jump entire viewports in a single frame (cap enforced).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: Perf probe — 10-second continuous edge-drag with auto-scroll active (AC9 · AC10)

**Setup**: DevTools **Performance** tab open, recording ready.

**Steps**:
1. Start a Performance recording.
2. Click-and-hold on any item; move pointer to the bottom-edge zone and **hold there for ~10 seconds** (do not release — let auto-scroll run continuously).
3. Release the drag.
4. Stop the Performance recording.
5. Inspect the recording:
   - Look for "Long tasks" (> 50 ms) in the Main track during the auto-scroll period.
   - Check the "Frames" track — frames sustaining ~60 fps or dropping?
   - Confirm no compounding slowdown across the 10-second window.

**Expected**:
- NO long tasks (> 50 ms) during auto-scroll.
- Frames sustain ~60 fps (no compounding degradation from concurrent rAF loops).
- Pointer-follow and drop-indicator remain smooth throughout.
- Scripting time is bounded — not growing over the 10-second window.

**WARN** if any single frame exceeds 16 ms but cumulative average is smooth.
**FAIL** if lag is visible OR long tasks appear OR frames drop below ~50 fps sustained.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Top-edge activation — continuous scroll up | |
| 2 | Bottom-edge activation — continuous scroll down | |
| 3 | Deactivation on pointer leaving edge zone | |
| 4 | Deactivation on Escape and on drop | |
| 5 | Speed ramp — slow at boundary, fast at extreme edge | |
| 6 | Perf probe — 10s continuous auto-scroll (B-030 budget) | |

**Overall**: [ ] PASS / [ ] FAIL

### Merge-blocking gates

B-032 PR does NOT merge until:
- UAT-1 AND UAT-2 both PASS (core auto-scroll behaviour).
- UAT-4 PASS (drag lifecycle deactivation — correctness guardrail).
- UAT-6 PASS or WARN-only (no perf regression vs B-030 budget).
- Existing test suite (1001 tests on entry) reports zero regressions.

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________
