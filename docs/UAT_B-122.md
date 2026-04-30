# B-122 UAT — Sub-Group Drag-to-Root

**Sprint:** 39 (v1.33.0)
**Branch:** `feature/sprint-39-polish`
**Spec:** `docs/design/62-b-122-drag-to-root.md`
**Tier:** Full (M, auto-upgraded from S) — UAT mandatory per CLAUDE.md Gate 2
**Build target:** `./build.sh` produces `tab-junkie.zip`; load unpacked from repo root in Edge developer mode
**R3 file changes:**
- `shared/sort-order.js` (new pure helper `computeGroupPromote(groups, draggedId, insertAfterGroupId)`)
- `sidepanel/sidepanel.js` (drag-state shape extension `pendingMode: 'PROMOTE'` + `pendingInsertAfterGroupId`; new `_computeGroupPromoteTarget` helper; `_buildGroupDragRectCache` extension with `topLevelOrder` + `topLevelTopY`; tick-PROMOTE intercept; drop-handler PROMOTE branch + race-guard third branch + Open-Tabs section reject-guard)
- `tests/sort-order.test.js` (9 new B-122 helper tests T1..T5)
- `tests/b122-drag-to-root.test.js` (new — 7 tests T1..T7 incl. Wave 3a Open-Tabs reject-guard)

**Automated test status:** 1,731/1,731 passing (9 sort-order helper + 7 integration / source-text pin tests).

Manual test cases against the unpacked extension loaded in **Edge** (Developer Mode → Load unpacked → repo root). Run **after** verifying the automated suite passes.

> **Edge gotcha (per user memory):** `chrome://` URLs do not work in Edge. Use `edge://extensions` and `edge://serviceworker-internals` equivalents. To force-reload the extension after changes, toggle the extension OFF then ON in `edge://extensions`.

> **B-122 surface:** sidepanel only. Newtab and standalone (popup-window-rendering-sidepanel) inherit no drag UX changes — out of scope per AC8(f).

| Symbol | Meaning |
|---|---|
| **PASS** | Observed behavior matches PASS criteria |
| **FAIL** | Observed behavior matches FAIL criteria; route back to [frontend-engineer] |
| **WARN** | Observed but documented R2 tradeoff (not a regression) |
| **SKIP** | Could not be exercised in this run; record reason |

**Setup that applies to every case below:**
1. Load unpacked extension from repo root.
2. Open the side panel.
3. Have at least the groups listed per case seeded in the active collection. Add groups via the existing Add-Group flow if missing.
4. Have the SW console open so any thrown errors during dispatch are visible.

**Common seed (used by UAT-1, UAT-2, UAT-3, UAT-5):**
- Top-level group **A** (first in DOM order)
- Top-level group **B** (second)
- Top-level group **C** (third)
- Sub-group **A1** nested inside **A** (depth-1)

To seed A1: open A's group menu → Edit → set parent to A's id, OR drag A1 onto A's header (B-031 drag-nest path) to create the nesting if you started with a flat list.

---

## UAT-1 — Drag sub-group out of parent and drop in empty space (AC1)

**Priority:** H — primary acceptance test for AC1.

**Setup:** Common seed (A with sub-group A1; B; C).

**Action:**
1. Click and hold A1's drag handle (per B-031 drag-handle pattern).
2. Drag A1 outward — release the pointer in the empty area below all `.group-section` elements (e.g., below C's section bottom, or in the unused area to the right of all groups inside `#item-list`).
3. As you drag, observe whether the `.group-reorder-indicator` line appears at the insertion point.
4. Release the pointer.

**Expected result:**
- During drag: a single drop-line indicator (the existing `.group-reorder-indicator` element from B-031) appears at the bottom of the top-level group list.
- After drop:
  - A1 promotes to top-level (`parentId: null`).
  - A1 appears at the bottom of the top-level group list (after C).
  - SW console shows `MSG_BULK_REORDER_GROUPS` dispatched with `{ id: A1.id, parentId: null, sortOrder: <consecutive int> }` in the per-update array.
  - Top-level group order in sidepanel: A, B, C, A1 (A1 last).

**PASS:** A1 promoted to top level + indicator was visible during drag + final order is correct.
**FAIL:** A1 stays nested in A, OR A1 promoted but `parentId` not actually `null` (verify via `chrome.storage.local.get` REPL: `tj:groups`), OR indicator did not appear during drag.

**Validates:** AC1 (drag outside `.group-section` → promote-to-root) + AC2 (visual indicator parity).

---

## UAT-2 — Mid-list drop between two top-level groups (AC3)

**Priority:** H — confirms mid-list ordering.

**Setup:** Common seed (A with sub-group A1; B; C).

**Action:**
1. Click and hold A1's drag handle.
2. Drag A1 toward the gap between **B** and **C** — specifically aim the pointer at the empty space between B's section bottom and C's section top.
3. Observe the `.group-reorder-indicator` — it should anchor at B's section bottom (insertAfterGroupId = B).
4. Release the pointer.

**Expected result:**
- Indicator appears between B and C during drag (not above A or below C).
- After drop: top-level order is A, B, A1, C — A1 is inserted between B and C.
- All four top-level groups have consecutive `sortOrder` values (multiples of 1000 per B-008 normalisation): A=0, B=1000, A1=2000, C=3000 (or equivalent post-normalisation).
- Source bucket (former children of A): now empty (A1 was the sole child); A's section may collapse the empty children container or render as a no-children parent.

**PASS:** A1 inserted between B and C + indicator was at the correct gap during drag + sortOrder values are consecutive.
**FAIL:** A1 inserted at wrong ordinal (e.g., before B or after C), OR indicator anchored at the wrong gap, OR sortOrder values are non-consecutive after a fresh page reload (would indicate normalisation broke).

**Validates:** AC3 (mid-list ordering) + AC2.

---

## UAT-3 — Above-own-parent edge case (AC4 — Q4 outcome)

**Priority:** H — primary acceptance test for AC4 (the Q4 "above own parent" tiebreaker resolution).

**Setup:**
1. Common seed PLUS: A is the **second** top-level group (so create one ahead of it — call it **Z**: Z, A, B, C with A1 inside A).
2. (Goal: A1's parent A has another top-level group above it (Z), so when we drag A1 to the REORDER_ABOVE zone of A's header, the resolution per Q4 should be PROMOTE — inserting A1 between Z and A.)

**Action:**
1. Click and hold A1's drag handle.
2. Drag A1 upward into the **top 25%** of A's group header (the REORDER_ABOVE zone).
3. Observe the indicator.
4. Release the pointer.

**Expected result (per R2 §62.2.1 Q4 resolution):**
- During drag: the `.group-reorder-indicator` appears at A's section TOP edge (i.e., between Z's section bottom and A's section top), NOT inside A's header.
- After drop:
  - A1 promotes to top-level (`parentId: null`).
  - A1 appears between Z and A in the top-level list.
  - Top-level order: Z, A1, A, B, C.

**PASS:** A1 promoted and inserted between Z and A.
**FAIL:** A1 stays nested (Q4 tiebreaker failed and the gesture was silently ignored), OR A1 ends up above Z (wrong anchor), OR a sibling-bucket REORDER fired instead of PROMOTE (would indicate `validReorderTargetIds` incorrectly included A's parent).

**Validates:** AC4 (Q4 above-own-parent edge → PROMOTE).

---

## UAT-4 — Drop on Open Tabs section is REJECTED (Wave 3a fix-round; M-4 / qa M-2)

**Priority:** H — confirms the Wave 3a Open-Tabs reject-guard. Without this guard, a sub-group released over Open Tabs would silently promote to "after last top-level group" — a confusing UX outcome.

**Setup:** Common seed (A with sub-group A1; B; C). Open Tabs section visible at the bottom of the sidepanel (with at least one open tab, or in its empty state).

**Action:**
1. Click and hold A1's drag handle.
2. Drag A1 downward toward the **Open Tabs** section.
3. Hover the pointer **inside** the Open Tabs section's bounds (over its header or its rows or its empty-state placeholder).
4. Observe the indicator.
5. Release the pointer.

**Expected result (per Wave 3a M-4 fix at `sidepanel.js:5582-5593`):**
- During drag, while pointer is over Open Tabs:
  - The `.group-reorder-indicator` is **hidden** (no insertion line shown).
  - The Open Tabs section may show its existing drop-target highlight (`open-tabs-section--drop-target`) from another drag-state handler — this is acceptable as long as no PROMOTE indicator is shown.
- After drop:
  - A1 stays nested under A (no promotion fires).
  - No `MSG_BULK_REORDER_GROUPS` dispatch in the SW console.
  - Top-level order unchanged: A, B, C.

**PASS:** A1 stays nested + no promote indicator + no message dispatched.
**FAIL:** A1 promotes to "after last top-level group" (would indicate the reject-guard at `_computeGroupPromoteTarget:5592-5593` is missing or broken), OR a promote indicator appeared during drag, OR `MSG_BULK_REORDER_GROUPS` was dispatched.

**Validates:** [code-reviewer] M-4 + [qa-reviewer] M-2 + R2 §62.9 F-1 fix-round.

---

## UAT-5 — Drop on a non-parent top-level section's body (qa L-5)

**Priority:** M — qa L-5 documents that `_computeGroupPromoteTarget`'s "fallback to insert at top" branch fires for any in-section pointer (not just above-own-parent). UAT verifies this is intuitive vs surprising.

**Setup:** Common seed (A with sub-group A1; B; C).

**Action:**
1. Click and hold A1's drag handle.
2. Drag A1 over **B**'s section **body** (NOT B's header — the area where B's items render, or below B's items if B is empty).
3. Observe the indicator.
4. Release the pointer.

**Expected result (per qa L-5 documented behavior):**
- During drag: the `.group-reorder-indicator` may appear at the **top of the top-level list** (insert at top fallback) OR at a position above B's section (anchored at the previous top-level group's bottom). The exact position depends on the helper's hit-test for "pointer is inside a top-level section but not over its header".
- After drop: A1 either:
  - (a) Promotes to top-level inserted at the top of the list (insertAfterGroupId = null fallback), or
  - (b) Promotes to top-level inserted between A and B (insertAfterGroupId = A.id from the previous-section-bottom anchor), or
  - (c) Stays nested if the helper returned null (defensive).

**PASS criterion:** A1 promotes to a sensible top-level position (the user understands where it went). Record the actual outcome (a/b/c) for product-owner review.
**FAIL criterion:** A1 lands in a non-deterministic / weird position (e.g., partway inside B's section as if nested in B), OR the gesture errored.
**WARN criterion:** Outcome (a) — insert at top — surprises the user when they expected the drop to NEAR B. Document for product-owner triage; per qa L-5, the fallback path is acceptable but UX could be tightened in a follow-up sprint.

**Validates:** [qa-reviewer] L-5 + R2 §62.3 hit-test priority order.

---

## UAT-6 — F-5 race-guard: concurrent edit aborts the drag with a toast

**Priority:** M — confirms the third branch of the broadcast-race guard at `sidepanel.js:4643-4662` (per R2 §62.9 F-5).

**Setup:**
1. Common seed (A with sub-group A1; B; C).
2. Open the **standalone** window (toolbar popup → Open in standalone). This gives us a second sidepanel-rendering surface backed by the same SW.

**Action:**
1. In the standalone window, start dragging A1 (click + hold + move slightly to the right but DO NOT release).
2. Switch focus to the main sidepanel **without** releasing the drag.
3. In the main sidepanel, edit A1's group settings: open A1's edit dialog → change its parent to **B** (or any non-A parent). Click Save.
4. Wait ~500 ms for the broadcast to arrive in the standalone window.
5. Return to the standalone window and complete the drag (release the pointer over the empty space below all groups, expecting a promote).

**Expected result:**
- Mid-drag: `_cachedGroupsGen` advances on the standalone window when the broadcast arrives.
- On drop: the race-guard third branch fires:
  - It re-validates that A1 still has a non-null `parentId` in the fresh group fetch — it does NOT (A1's parent is now B, but parentId is still set, so this check passes IF the fresh fetch shows A1 with parentId=B).
  - Wait — the actual race-guard check is "freshDragged.parentId !== null". If the concurrent edit moved A1 from A to B (still nested), the guard does NOT fire (parentId is still non-null).
  - The race-guard **does** fire if the concurrent edit promoted A1 to top-level (parentId became null) before the drop dispatched.
- **Refined action**: change step 3 to: in the main sidepanel, edit A1 → set parent to "Top-level (no parent)" via the dialog parent-picker (B-007 path). THEN return to standalone and release the drag.

**Refined expected result:**
- On drop in standalone: race-guard observes `freshDragged.parentId === null` (A1 was already promoted by the concurrent edit). The guard aborts the drag and shows a toast (e.g., "Group changed during drag — please retry") matching the NEST/REORDER race-guard UX.
- A1 is NOT re-promoted (no double-write).

**PASS:** Toast appears + no `MSG_BULK_REORDER_GROUPS` dispatched on the drop + A1's storage state is consistent.
**FAIL:** No toast appears AND a stale promote dispatch fires (would indicate the third race-guard branch is missing).
**WARN:** The race window is too narrow to reproduce reliably in manual UAT — record SKIP with a note that T5 source-text pin in `tests/b122-drag-to-root.test.js` covers the structural invariant.
**SKIP:** Cannot reliably reproduce the race window in Edge; rely on T5 automated coverage.

**Validates:** R2 §62.9 F-5 + automated test T5.

---

## UAT-7 — Mid-drag scroll: indicator tracks correctly

**Priority:** M — confirms the cache + pointer Y are both viewport-relative (per [qa-reviewer] notes), so scrolling mid-drag doesn't desync the indicator.

**Setup:**
1. Seed enough groups so the sidepanel scrolls (e.g., 10+ top-level groups + A with A1 inside).
2. Scroll the sidepanel so that A1's parent A is visible but C (or a later group) is below the fold.

**Action:**
1. Click and hold A1's drag handle.
2. Drag A1 toward the bottom of the visible area.
3. Trigger auto-scroll (B-032) by holding near the bottom edge — the sidepanel scrolls down to reveal lower groups.
4. As scroll happens, observe the `.group-reorder-indicator` position relative to the pointer.
5. Continue dragging into the now-visible empty space below all groups.
6. Release the pointer.

**Expected result:**
- Throughout the drag, the indicator tracks correctly with the scroll position — it appears at the correct top-level-group-gap regardless of where the user has scrolled to.
- After release, A1 promotes to the correct ordinal.

**PASS:** Indicator stays attached to the correct gap during scroll + final ordinal is correct.
**FAIL:** Indicator drifts away from its anchor during scroll (would indicate the cache is using outdated rect data), OR indicator visually lags the pointer in a confusing way.

**Validates:** R2 §62.2.4 cache invariants under auto-scroll.

---

## UAT-8 — Visual indicator parity (AC2)

**Priority:** M — explicit confirmation that the PROMOTE state reuses the existing `.group-reorder-indicator` element (Q2 outcome — no new visual primitive).

**Setup:** Common seed (A with sub-group A1; B; C).

**Action:**
1. First exercise: drag B (a top-level group) into A's header (B-031 drag-nest gesture). Observe the indicator color, thickness, and shape. Cancel the drop (Esc).
2. Second exercise: drag A1 to the empty space below all groups (UAT-1 gesture). Observe the indicator.
3. Compare the two indicators visually.

**Expected result:**
- Both gestures use the SAME `.group-reorder-indicator` DOM element with the SAME class.
- Visual treatment (color, thickness, position rendering) is identical between drag-reorder and drag-promote.
- Inspect Element confirms only `.group-reorder-indicator` is in the DOM; no `.group-promote-indicator` or similar new class.

**PASS:** Indicators are visually identical + DOM contains only `.group-reorder-indicator`.
**FAIL:** A new `.group-promote-indicator` (or other) class appears in the DOM during PROMOTE drag, OR the visual treatment differs.

**Validates:** AC2 + automated test T3.

---

## UAT-9 — Keyboard alternative regression guard (AC6)

**Priority:** H — confirms the B-007 dialog parent-picker promote path remains keyboard-accessible.

**Setup:** Common seed (A with sub-group A1; B; C).

**Action:**
1. With the side panel open, navigate via keyboard (Tab) to A1's row or its menu trigger.
2. Open A1's edit dialog (typically via the group context menu).
3. In the dialog, Tab to the **Parent** select element.
4. Open the select with keyboard (Space or Alt+Down).
5. Select the **"Top-level (no parent)"** option.
6. Tab to the Save button → press Enter.

**Expected result:**
- Dialog opens via keyboard.
- Parent select includes "Top-level (no parent)" as an option.
- Saving promotes A1 to top-level (`parentId: null`).
- A1 appears as a new top-level group at the end of the top-level list (or wherever sortOrder dictates).

**PASS:** A1 promoted via dialog + top-level position visible after save.
**FAIL:** Dialog cannot be opened via keyboard, OR "Top-level (no parent)" option missing, OR Save does not promote A1 (would indicate B-122 broke `filterGroupParentCandidates` or the dialog wiring).

**Validates:** AC6 + automated test T4 + B-007 regression guard.

---

## UAT-10 — Drag a sub-group with grandchildren attempt (AC5 / AC8(a) edge case — vacuous)

**Priority:** L — defensive: confirms the depth-cap invariant (depth ≥ 2 is impossible by construction).

**Setup:**
1. Common seed (A with sub-group A1).
2. Attempt to nest a third group **C1** inside A1 (depth-2). The B-007 / B-031 contracts should reject this — verify via the dialog parent-picker (C1 cannot pick A1 as parent).

**Action:**
1. Try to drag A1 into the empty space (UAT-1 gesture) and observe — this should work normally (A1 itself is depth-1, has no children).
2. Document: the "drag a sub-group that has its own children" case is **impossible** in the current data model per `assertDepthAndCycle`.

**Expected result:**
- UAT-1 gesture succeeds normally (A1 promotes).
- A1 cannot have children to begin with (B-007 contract); no test scenario can produce a depth-2 attempt.

**PASS:** A1 promotes normally + we confirm depth-2 cannot exist.
**FAIL:** A1 has children somehow (would indicate a B-007 regression), OR promotion of A1-with-children produces an error.

**Validates:** AC5 + AC8(a) + R2 §62.8 first row.

---

## Reporting

After running UAT, record results in `docs/SPRINT.md` "Completed This Sprint" → B-122 entry, in this format:

```
- UAT-1: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-2: PASS / FAIL / WARN / SKIP — <one-line note: sortOrder values after reload>
- UAT-3: PASS / FAIL / WARN / SKIP — <one-line note: did indicator appear at A's top edge?>
- UAT-4: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-5: PASS / FAIL / WARN / SKIP — <one-line note: which fallback outcome (a/b/c)?>
- UAT-6: PASS / FAIL / WARN / SKIP — <one-line note: was race window reproducible?>
- UAT-7: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-8: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-9: PASS / FAIL / WARN / SKIP — <one-line note>
- UAT-10: PASS / FAIL / WARN / SKIP — <one-line note: vacuous case>
```

**Routing rules:**
- FAIL on UAT-1, UAT-2, UAT-3, UAT-4, UAT-8, or UAT-9 → route back to [frontend-engineer]; these are core acceptance gates for AC1/AC2/AC3/AC4/AC6.
- FAIL on UAT-5 → route back to [frontend-engineer] for `_computeGroupPromoteTarget` hit-test priority-order debugging.
- FAIL on UAT-6 (race-guard) → route back to [frontend-engineer] for race-guard branch verification.
- FAIL on UAT-7 (mid-drag scroll) → route back to [frontend-engineer] for cache-rebuild-on-scroll review.
- FAIL on UAT-10 → route back to [solution-architect] for B-007 / depth-cap invariant audit (this would be a SEV3 regression in the existing depth-cap path, not a B-122 regression).
- WARN on UAT-5 outcome (a) "insert at top" surprises user → record for product-owner; defer to follow-up sprint per qa L-5.
- WARN on UAT-6 (cannot reproduce race window) → acceptable; T5 source-text pin covers the structural invariant.

**Gate 3 (UAT Acceptance):** All 10 cases must reach PASS or acceptable WARN/SKIP for B-122 to pass Gate 3 and be marked done.
