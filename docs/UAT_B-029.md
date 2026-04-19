# UAT — B-029 Group Picker Modal

Sprint 16 · Full tier (M) · Round 5 UAT plan

Related artefacts:
- `docs/SOLUTION_DESIGN.md §30` (R2 design)
- `docs/SPRINT_FINDINGS.md` Sprint 16 — B-029 (security / code / qa reviewer findings)
- `tests/b029-group-picker.test.js` (AC1–AC10 + R4-fix regressions: H-1/H-2/H-3 + code-M-1/M-2 + sec-M-1 + qa Q-M1/Q-M2)
- `tests/b027-group-header-menu.test.js` (B-027 "Move items out of group" integration cases — AC1 caller 2)

## Setup

1. Load the unpacked extension from the repo root.
   - Chrome: `chrome://extensions` → Developer Mode on → "Load unpacked" → select repo root.
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select repo root.
2. Open the Tab Junkie side panel.
3. Pre-create state the test cases below rely on:
   - Create at least three groups, e.g. `Work`, `Reading`, `Personal`.
   - Create one sub-group, e.g. `Projects / Tab Junkie` (nested under a parent `Projects`).
   - Save at least one bookmark under `Work`.
   - Save at least one bookmark under `Reading`.
   - Keep at least one open browser tab whose URL is NOT already saved.
   - Keep at least one open browser tab whose URL IS already saved (for the B-059 duplicate handoff case).

Legend: PASS = behaviour matches expected · FAIL = deviation from expected · WARN = behaves correctly but surfaced a concern · SKIP = unable to execute.

## Test Cases

### UAT-1: Bulk bar — "Move to group" opens picker (AC1 caller 1)
Covers AC1(a), AC2, AC6.

**Steps**:
1. Ctrl-click (Cmd-click on macOS) two saved items in `Work` to build a multi-selection.
2. Click **Move to group** in the bulk action bar.

**Expected**:
- Modal appears with heading `Move to group`.
- Row order: `Ungrouped` (first), then groups sorted by `sortOrder`.
- Every row shows: color chip, group name, and counts like `N saved, M open`.
- Nested group `Tab Junkie` shows breadcrumb `Projects / Tab Junkie`.
- No native `<select>` anywhere; no secondary `Confirm` button.
- Clicking a row immediately dismisses the picker and moves both items.
- Selection clears after the bulk operation (pre-existing B-024 behaviour).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: Group-header menu — "Move items out of group" (AC1 caller 2 + AC5)
Covers AC1(b), AC5, and the new B-027 menu action introduced by B-029.

**Steps**:
1. Right-click the `Work` group header.
2. Verify the menu contains `Move items out of group` (after `Select bookmarked`, before `Edit group`).
3. Click it.

**Expected**:
- Picker opens with heading `Move to group`.
- Source group `Work` is absent from the list.
- Other groups and `Ungrouped` are present.
- Pick `Reading` → every item that was in `Work` is now under `Reading`.
- The sidepanel's multi-selection (if any) is unchanged — this action does not mutate selection state.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Group-header menu — action disabled on empty group (AC1 caller 2 edge)
Covers AC1(b) edge — empty group handling.

**Steps**:
1. Create a new group `Empty` with zero items.
2. Right-click the `Empty` group header.

**Expected**:
- `Move items out of group` is visible but disabled / greyed out.
- Clicking it is a no-op; picker does NOT open.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Selection context menu — "Move to group" (AC1 caller 3)
Covers AC1(c).

**Steps**:
1. Multi-select two items across `Work` and `Reading`.
2. Right-click any selected item.
3. Choose **Move to group** from the selection menu.

**Expected**:
- Picker opens (no native `<select>`, no duplicated picker code).
- Pick `Personal` → both items move.
- No confirm dialog appears (single-click confirmation — AC6).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Open Tabs row — "Save to group" (AC1 caller 4 + AC7 no-duplicate path)
Covers AC1(d), AC7.

**Steps**:
1. Right-click an open-tab row in **Open Tabs** whose URL is NOT saved.
2. Choose **Save to group**.
3. Pick `Reading`.

**Expected**:
- Picker appears with heading `Save to group` (mode-dependent copy).
- Row click dismisses the picker and immediately promotes the tab to a saved item in `Reading`.
- No B-059 soft-warn appears (no duplicate).
- The Open Tabs row for that tab disappears (claimed by the new saved item).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: B-059 duplicate handoff — picker closes BEFORE soft-warn opens (AC7)
Covers AC7 — the critical sequencing contract.

**Steps**:
1. Right-click an open-tab row whose URL IS already saved (from setup).
2. Choose **Save to group**.
3. Pick any group in the picker.

**Expected**:
- Picker closes **first** — no picker chrome remains on-screen.
- B-059 `URL already saved` confirm dialog then appears.
- Picker and soft-warn never overlap.
- **Save anyway** creates a duplicate; **Cancel** leaves no new item.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: Real-time filter — case-insensitive substring + breadcrumb (AC3)
Covers AC3 filter correctness.

**Steps**:
1. Open the picker from any caller.
2. In the filter input, type `wor` (lowercase).
3. Verify the visible rows.
4. Clear the filter; type `projects`.

**Expected**:
- `wor` leaves visible: `Work` (and any other group whose name contains `wor` substring, case-insensitive) — `Personal` is hidden.
- `projects` leaves visible: `Projects` itself AND `Tab Junkie` (breadcrumb match: `Projects / Tab Junkie`).
- Typing feels instantaneous — no visible lag even after 3 chars.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Keyboard navigation — arrows / Enter / Escape / Tab (AC4 + AC8)
Covers AC4 + Gate3 a11y requirements + Q-M1 printable-key-forward + code-reviewer M-1 focus-trap.

**Steps (keyboard only — do NOT use the mouse)**:
1. Tab to the bulk `Move to group` button, press Enter to open the picker.
2. Filter input is focused. ArrowDown moves the highlight into the listbox.
3. Press ArrowDown until you wrap past the last row to the first row.
4. Press ArrowUp from the first row — highlight should wrap to the last row.
5. Press `a` (a printable key) while the listbox is focused.
6. Press Enter on a highlighted row.
7. Re-open the picker; press Escape.
8. Re-open the picker; Tab / Shift+Tab to confirm the focus cycle between filter input and listbox.

**Expected**:
- ArrowDown / ArrowUp wrap cleanly at both ends.
- The printable `a` keystroke is NOT lost — it appears as the first character in the filter input (Q-M1 fix).
- Enter on a row confirms and closes the picker.
- Escape closes the picker WITHOUT clearing any pre-existing selection (F-3).
- Tab from filter focuses listbox; Shift+Tab from listbox returns to filter.
- Focus is visible at every step.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Empty-state CTA opens the real create dialog (AC9 + H-1 fix)
Covers AC9 and the H-1 blocker fix.

**Steps**:
1. Create a fresh Chrome / Edge profile (or delete all your groups first).
2. Open the side panel — confirm there are no groups.
3. From any call site that allows opening the picker (e.g., bulk bar after multi-selecting in a flat-list view if possible, or Open-Tabs row → Save to group), trigger the picker so the picker-body shows the empty state.
4. Click the `Create group` button.

**Expected**:
- Picker closes cleanly.
- The real B-006 group-edit dialog appears in **create mode** (title input empty, Create button present).
- NO legacy toast referencing a "+ menu" appears (previously H-1 FAIL).
- If you cancel the create dialog, the picker does NOT auto-reopen (per §30.9 out-of-scope).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Broadcast-during-open refresh (H-2 fix)
Covers the stale-target race fixed in the R4 pass.

**Steps**:
1. In sidepanel window A: open the bulk picker, filter to `wo`, ArrowDown to highlight `Work`.
2. Without closing the picker, switch to another browser window B that has Tab Junkie open (or a second side-panel instance).
3. In window B: delete the `Work` group (right-click header → Delete group → confirm).
4. Return to window A — observe the open picker.

**Expected**:
- The picker rows re-render to reflect the deletion — `Work` is gone.
- The filter text `wo` is preserved; visible-row count adjusts accordingly.
- The highlight falls back to the first visible row (since the previously-highlighted `Work` is gone).
- Confirming whatever is now highlighted dispatches cleanly — no "Couldn't complete the move" ghost-target generic error.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: Safe-mode move surfaces the read-only toast (H-3 fix)
Covers the H-3 safe-mode toast mapping.

**Steps**:
1. Enable safe mode (via the safe-mode toggle or whatever developer surface is available). Alternatively, provoke `ERR_SAFE_MODE` by running a known safe-mode scenario.
2. Multi-select two saved items; click **Move to group** in the bulk bar; pick any group.

**Expected**:
- Toast copy: `Read-only mode — can't move items` (or exact post-H-3 copy).
- NOT the generic `Couldn't complete the move — try again` fallback.
- Repeat for caller 2 (B-027 Move-out) — same read-only toast.
- Repeat for caller 3 (selection menu) — same read-only toast.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: B-063 blur-close does NOT dismiss the picker (F-1)
Covers F-1 — the R2-flagged risk that the extension's context-menu blur-close could also dismiss the picker.

**Steps**:
1. Open the picker from any caller.
2. Alt-Tab (Cmd-Tab on macOS) to another application, then Alt-Tab back to the browser.
3. Observe the picker state.
4. For comparison: open the item context menu (right-click an item), Alt-Tab away and back — the context menu MUST still close on blur.

**Expected**:
- Picker remains open after the Alt-Tab cycle — the blur handler skips it.
- The context-menu blur-close still works for actual context menus (regression check).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: Escape closes picker, does NOT clear multi-selection (F-3)
Covers F-3 — the B-024 Escape-to-clear-selection must be suppressed while the picker is open.

**Steps**:
1. Multi-select two items (Ctrl-click / Cmd-click).
2. Click bulk bar **Move to group** to open the picker.
3. Press Escape.

**Expected**:
- Picker closes.
- Multi-selection is **preserved** — both items are still highlighted as selected.
- The B-024 Escape-to-clear-selection does NOT fire.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Outside-click / overlay click closes the picker (Q-M2)
Covers Q-M2 — the overlay-click close path previously had no automated coverage.

**Steps**:
1. Open the picker from any caller.
2. Click outside the picker body but inside the dialog overlay (the dimmed backdrop).

**Expected**:
- Picker closes immediately.
- `onSelect` is NOT invoked — no items move.
- Clicking a row inside the picker body does NOT dismiss via this path (it goes through the row-click confirm path instead).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-15: aria-activedescendant + screen-reader announcement (AC8 + code-M-2)
Covers AC8 and the code-reviewer M-2 fix for listbox/option ARIA semantics.

**Steps**:
1. Enable a screen reader (VoiceOver on macOS, NVDA / Narrator on Windows).
2. Open the picker and ArrowDown through several rows.
3. Listen for the per-row announcement.
4. Inspect the DOM (devtools Elements panel): find the `role="listbox"` element.

**Expected**:
- Screen reader announces each row as it is highlighted (not only the first one).
- In devtools: the listbox carries `aria-activedescendant="group-picker-row-N"` that matches the highlighted row's `id`.
- Exactly one row has `aria-selected="true"` at a time; others are `"false"`.
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` resolve to the correct heading.
- Visible focus indicator on the highlighted row is discernible in both light and dark themes (WARN if contrast looks < 3:1 — file against Q-M3 for follow-on, not B-029).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-16: Performance — 100 groups under 50 ms filter P95 (AC3 + AC10)
Covers AC3 latency target and AC10 no-IPC / no-storage-write invariant.

**Steps**:
1. Seed 100 groups (via a dev-only helper or by importing a fixture — document whichever harness you use).
2. Open DevTools → Performance.
3. Open the picker from the bulk bar.
4. Start a recording; type a 3-char filter query; stop recording.
5. Inspect the trace for Message-channel / `runtime.sendMessage` spans AND any `chrome.storage.local.set` spans during open / type.

**Expected**:
- Filter rendering per keystroke is < 50 ms on the main thread (no visible jank).
- Zero `chrome.runtime.sendMessage` during picker open OR during filter typing.
- Zero `chrome.storage.local.set` during open OR filter.
- Record the actual P95 latency observed for B-029 R6 design-doc note.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | Bulk bar — Move to group (AC1 caller 1) | |
| 2 | Group-header menu — Move items out of group (AC1 caller 2 + AC5) | |
| 3 | Group-header menu — disabled on empty group | |
| 4 | Selection context menu — Move to group (AC1 caller 3) | |
| 5 | Open Tabs — Save to group, no duplicate (AC1 caller 4) | |
| 6 | B-059 duplicate handoff — picker closes before soft-warn (AC7) | |
| 7 | Real-time filter — substring + breadcrumb (AC3) | |
| 8 | Keyboard nav — arrows / Enter / Escape / Tab + Q-M1 forward (AC4) | |
| 9 | Empty-state CTA opens create dialog (AC9 + H-1 fix) | |
| 10 | Broadcast-during-open refresh (H-2 fix) | |
| 11 | Safe-mode move surfaces read-only toast (H-3 fix) | |
| 12 | Blur-close does not dismiss picker (F-1) | |
| 13 | Escape closes picker, preserves selection (F-3) | |
| 14 | Overlay click closes picker without onSelect (Q-M2) | |
| 15 | aria-activedescendant + SR announcement (AC8 + code-M-2) | |
| 16 | 100-group filter < 50 ms, zero IPC / writes (AC3 + AC10) | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any core case (UAT-1..UAT-9) lands FAIL, B-029 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done. UAT-10..UAT-16 cover regressions of the R4 fix pass and the R2 flagged risks; a FAIL there is also a Gate 3 blocker. UAT-15 WARN for contrast is allowed (tracked as Q-M3 follow-on in SPRINT_FINDINGS).
