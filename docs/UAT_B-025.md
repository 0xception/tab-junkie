# UAT — B-025 Multi-Item Drag as Single Unit

Sprint 24 · Full tier (M) · Round 1 UAT plan (authored at R1 per Sprint 23 retro action item)

Related artefacts:
- `docs/BACKLOG.md` — B-025 row (refined AC block, Sprint 24)
- `docs/SPRINT.md` — B-025 pipeline status
- `tests/b025-multi-item-drag.test.js` — automated tests (written at R5)
- `docs/design/NN-b-025-multi-item-drag.md` — R6 close chapter (authored at R6)
- `docs/UAT_B-030.md` — B-030 precedent (single-item drag foundation)

**B-030 foundation recap**: B-030 shipped in v1.17.0 (Sprint 23) with rAF-coalesced dragover, per-drag rect cache, transform-positioned indicator, and `_cachedItemsGen` broadcast-race guard. B-025 extends that infrastructure to carry the entire multi-selection as one logical unit. The B-052 `hashItem`/`sortOrder` render-path fix was applied at drop time via explicit `renderAll` in the B-030 drop handler — B-025 must follow the same pattern.

## Setup

1. Reload the extension in Edge (`edge://extensions` → Tab Junkie → reload icon).
2. Open the side panel.
3. Pre-create state:
   - 3 top-level groups (`Work`, `Reading`, `Personal`), each with **5–6** bookmarks labelled A–F for traceability.
   - At least 1 ungrouped bookmark.
4. Use B-024 multi-select (Shift+Click or Ctrl+Click) to build test selections as described per case.
5. Leave DevTools open on the side panel (right-click → Inspect) — Application → Storage inspector ready for UAT-7; Performance tab ready for UAT-6.

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation · **WARN** = correct but surfaced a concern · **SKIP** = unable to execute.

---

## Test Cases

### UAT-1: Single-selected-item drag — B-030 path delegation (AC1 · AC13)

**Purpose**: Confirm that when only one item is selected (or no selection exists and the user drags a single row), B-025 transparently delegates to the existing B-030 single-item drag path — no regression.

**Steps**:
1. Click item `Work-A` once (no Shift/Ctrl) to select it.
2. Click-and-hold `Work-A`; drag it below `Work-D`; release.
3. Inspect Work's item order.
4. Reload the side panel.

**Expected**:
- Work reorders to [B, C, D, A, E, F] immediately.
- Ghost shows item title (B-030 AC2 ghost) with no count badge (count badge only appears for N > 1).
- Post-reload state persists.
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: 2-item drag within the same group (AC1 · AC4 · AC8 · AC9)

**Purpose**: Core same-group multi-drag.

**Steps**:
1. Shift+Click `Work-B` then `Work-D` to select 2 items (B and D).
2. Click-and-hold `Work-B` (the drag initiator); move the pointer below `Work-F`.
3. Release the drag.
4. Inspect Work's final order.
5. Open DevTools → Application → Storage → `chrome.storage.local` → confirm sortOrder values are consecutive integers.
6. Reload the side panel; re-inspect order.

**Expected**:
- Ghost shows a count badge "2 items".
- Drop inserts [B, D] together (in their original relative order — B before D) after F.
- Final Work order: [A, C, E, F, B, D] with sortOrder 0–5 consecutively.
- Storage shows consecutive integers; no gaps.
- Post-reload matches.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: 5-item drag across groups (AC1 · AC5 · AC6-adjacent · AC9)

**Purpose**: Cross-group multi-drop with stable ordering.

**Steps**:
1. In `Work`, Ctrl+Click items A, B, C, D, E (5 items).
2. Click-and-hold `Work-C` (mid-selection initiator); drag to the `Reading` group, between Reading-B and Reading-C.
3. Release.
4. Inspect Reading's order + Work's remaining items.
5. Inspect storage sortOrder for both groups.
6. Reload and re-inspect.

**Expected**:
- Ghost shows "5 items" count badge during drag.
- Reading now contains: [Reading-A, Reading-B, **Work-A, Work-B, Work-C, Work-D, Work-E**, Reading-C, Reading-D, Reading-E] — inserted in original relative order (A→B→C→D→E) at the drop position.
- Work contains only [F] (or whatever non-selected items remained).
- All groupId fields for the moved items updated to Reading's groupId.
- sortOrder in both groups: consecutive integers starting at 0.
- Post-reload state matches.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Cancel via Escape mid-drag (AC11)

**Steps**:
1. Shift+Click `Work-A` and `Work-C` to select 2 items.
2. Click-and-hold `Work-A`; move the pointer so the insertion indicator appears between two items.
3. Press **Escape** before releasing.
4. Inspect Work's order.
5. Check DevTools → Network (SW worker) to confirm no MSG_BULK_REORDER_ITEMS was dispatched.

**Expected**:
- Indicator hides immediately on Escape.
- Work's order is unchanged from before the drag.
- No storage writes occurred (confirm via reload — order identical).
- No console errors.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Stable-ordering verification — non-contiguous selection (AC4 · stable-sort)

**Purpose**: Selection A, C, E (non-contiguous in group) dropped together must preserve A→C→E adjacency in the same relative order.

**Steps**:
1. Ctrl+Click Work-A, Work-C, Work-E (skip B and D).
2. Click-and-hold Work-A; drag to just below Work-F (end of group).
3. Release.
4. Read final Work order.

**Expected**:
- Final order: [B, D, F, A, C, E] — non-selected items (B, D, F) retain relative order; selected items land in original relative order (A, C, E) at the insertion point.
- Not [B, D, F, E, C, A] or any other permutation.
- sortOrder 0–5 consecutive.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: PERF — continuous 10-second drag with 10 items selected (AC14 · retro HIGH-2 validation pattern)

**Setup**: Select 10 items across Work (extend with Personal if needed — at least 10 items total selected). DevTools Performance tab recording ready.

**Steps**:
1. Start a Performance recording.
2. Click-and-hold any selected item; continuously move the pointer in a circle within the item list area for **~10 seconds** (do not release).
3. Release (cancel via Escape or outside-release is fine — the perf target is during drag, not post-drop).
4. Stop the Performance recording.
5. Inspect:
   - Long tasks (> 50 ms) in the Main track.
   - Frames track — frame rate during drag.
   - Scripting time trend (should not grow over time).

**Expected**:
- NO long tasks (> 50 ms) during the 10-second drag.
- Frames sustain ~60 fps throughout (no compounding slowdown vs UAT-1 single-item baseline).
- No perceptible lag increase as the drag extends in time.
- Scripting time bounded and flat (not growing).

**WARN** if any single frame exceeds 16 ms but cumulative average is smooth.
**FAIL** if lag is visible OR long tasks appear OR frames drop below ~50 fps sustained OR performance degrades relative to UAT-6 single-item B-030 baseline.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: sortOrder normalisation verification via storage inspector (AC9)

**Purpose**: Confirm consecutive-integer normalisation post-drop using the DevTools storage inspector directly.

**Steps**:
1. Shift+Click Work-B and Work-E (2 non-contiguous items).
2. Drag them to the top of Work (above Work-A).
3. Open DevTools → Application → chrome.storage.local.
4. Inspect all Work items' sortOrder values.

**Expected**:
- After drop, Work items have sortOrder values 0, 1, 2, 3, 4, 5 (no gaps, no duplicates, no floats).
- B and E appear with the lowest sortOrder values (0, 1), as they were inserted at the top.
- No item retains a stale/pre-drop sortOrder.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: B-024 selection-to-B-025-drag handoff (AC1 · B-024 integration)

**Purpose**: Validate that B-024 multi-select state is correctly consumed by the B-025 drag initiator.

**Steps**:
1. From a clean state (no prior selection), Shift+Click Work-B to begin selection, then Shift+Click Work-D (should select B, C, D as a range).
2. WITHOUT clicking anywhere else (preserving the B-024 selection state), click-and-hold Work-C (a selected item, not the anchor).
3. Drag to `Personal` group; drop between Personal-A and Personal-B.
4. Inspect both Work and Personal.

**Expected**:
- All 3 items (B, C, D) move to Personal — the drag carried the full B-024 selection, not just Work-C.
- Ghost shows "3 items" during drag.
- Personal order: [A, **B, C, D**, B-orig, ...] in stable relative order.
- Work retains only [A, E, F].
- B-024 selection state clears post-drop (selection UI resets).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Drag initiator NOT in current selection — solo-drag fallback (AC2)

**Purpose**: Confirm the AC2 decision (clear selection, drag only the non-selected initiator) is enforced.

**Steps**:
1. Shift+Click Work-A and Work-B (2 items selected).
2. Click-and-hold Work-D (**not** in selection) and drag below Work-F.
3. Release.

**Expected**:
- Only Work-D moves to the end of Work. Work-A and Work-B are NOT moved.
- B-024 selection state clears on dragstart from an unselected item.
- Ghost shows item title only (no count badge — solo drag).
- Final Work order: [A, B, C, E, F, D].

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Single-selected-item drag — B-030 delegation | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 2 | 2-item drag within same group | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 3 | 5-item drag across groups | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 4 | Cancel via Escape mid-drag | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 5 | Stable-ordering — non-contiguous selection A, C, E | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 6 | PERF — 10-second drag, 10 items selected | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 7 | sortOrder normalisation via storage inspector | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 8 | B-024 selection-to-B-025-drag handoff | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |
| 9 | Drag initiator NOT in selection — solo-drag fallback | [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP |

**Overall**: [ ] PASS / [ ] FAIL

### Merge-blocking gates

Per Sprint 23 retro HIGH-3 precedent: **B-025 PR does NOT merge until product-owner reports ≥ 7/9 cases PASS AND UAT-3 (cross-group multi-drop) + UAT-6 (perf) + UAT-5 (stable-ordering) are all PASS**. UAT-9 SKIP is acceptable if the solo-drag fallback path cannot be isolated in the test environment. UAT-6 SKIP is NOT acceptable.

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________
