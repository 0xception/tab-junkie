# UAT — B-048 Item Visual States (live / active / drifted / audible / selected)

Sprint 16 · Full tier (M) · Round 5 UAT plan

Related artefacts:
- `docs/BACKLOG.md` — B-048 row (10 acceptance criteria)
- `docs/SOLUTION_DESIGN.md §31` — R2 design (14 subsections)
- `docs/SPRINT_FINDINGS.md` — Sprint 16 B-048 code / security / qa-reviewer findings + R4 fix-pass note
- `docs/a11y-audit-B-048.md` — contrast audit (H-1 checkmark-stroke row + B-064 deferral)
- `tests/b048-visual-states.test.js` — AC1 / AC2 / AC4 / AC5 / AC6 / AC7 / AC8 / AC9 automated regressions (41 test cases after R5 additions)
- `tests/b055-open-tabs-section.test.js` — B-055 Open Tabs section integration

Baseline suite: 721 pass / 0 fail after R5 additions (+14 tests over the 707 post-R4 baseline).

## Setup

1. Load the unpacked extension from the repo root.
   - Chrome: `chrome://extensions` → Developer Mode on → "Load unpacked" → select repo root.
   - Edge: `edge://extensions` → Developer Mode on → "Load unpacked" → select repo root.
2. Open the Tab Junkie side panel.
3. Pre-create state the test cases below rely on:
   - Create at least three groups (e.g. `Work`, `Reading`, `Music`).
   - Save one bookmark under each group, including one whose URL you will deliberately drift (e.g. open the saved URL, then navigate the tab to a different URL so the "live URL ≠ saved URL" drift record is produced).
   - Keep one tab open that matches a saved bookmark URL exactly (so the row lights up as `live`).
   - Keep one tab open that is playing audio (YouTube / Spotify / any audible tab) — its saved counterpart should light up `audible`.
   - Make sure one tab is the currently *active* tab in the browser and is also saved — so that row picks up `data-active`.
4. Verify the side panel is running in both the light theme and the dark theme for every case that carries a "both themes" note (use macOS / Windows system theme switching or the extension's theme toggle if present).

Legend: **PASS** = behaviour matches expected · **FAIL** = deviation from expected · **WARN** = behaves correctly but surfaced a concern · **SKIP** = unable to execute (document why).

## Test Cases

### UAT-1: Each of the 5 states alone (AC1 — grayscale distinction)
Covers AC1 (every state has a non-color cue).

**Steps**:
1. Trigger each state in isolation and inspect the row:
   - (a) `live` only — saved row whose tab is open but not the active tab.
   - (b) `active` — saved row whose tab is the currently focused tab in the active window.
   - (c) `drifted` — saved row whose tab URL has diverged from the saved URL.
   - (d) `audible` — saved row whose tab is playing audio.
   - (e) `selected` — Ctrl-click (Cmd-click) an otherwise-neutral saved row.
2. For each row, confirm the visible cue is present even when you squint or mentally remove color:
   - live → green left rail (3px) on the left edge.
   - active → blue left rail + shifted background.
   - drifted → triangle icon in the indicators column.
   - audible → speaker icon in the indicators column.
   - selected → persistent filled checkbox (`.item-select[aria-checked="true"]`) as the first child of the row, plus a 1px `box-shadow` border.
3. In DevTools Elements pane, confirm the matching `data-*` attribute on the `.item-row`: `data-live`, `data-active`, `data-drifted`, `data-audible`, `data-selected`.

**Expected**:
- All five visual cues are distinct from each other without relying on color.
- All five `data-*` attributes land on the expected row.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-2: All 5 states together on one row (AC2 — coexistence without occlusion)
Covers AC2 (cues don't fight each other) and AC7 (SR label carries all 5 tokens in order).

**Steps**:
1. Find a saved row whose URL matches a currently-active-and-audible-and-drifted tab (you may need to navigate a saved tab to a new URL *and* start audio to stack drift+audible on the active row).
2. Ctrl-click / Cmd-click the row to add it to a multi-selection.
3. Observe the row's visual state:
   - Left rail: blue (`--active-border`) — active wins over live.
   - Background: selection background (`--selected-bg`) — selection wins over active.
   - Indicators column: triangle + speaker icons side-by-side, NOT overlapping the checkbox.
   - Checkbox: filled with visible checkmark.
   - Title + URL: remain readable (URL uses `--text-secondary` on selected rows).
4. In DevTools Elements pane, inspect the row's `aria-label` attribute.

**Expected**:
- All five visual cues coexist without clipping or overlap.
- `aria-label` value is exactly: `<title>, active tab, live tab, tab content has changed, playing audio, selected` (comma-space separated, tokens lowercase, priority order `active → live → drifted → audible → selected`).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-3: Hover on an active row is distinguishable (AC4 — hover distinct per state)
Covers AC4 — the new `--active-bg-hover` token.

**Steps (both themes)**:
1. Hover an active-but-unselected saved row.
2. In DevTools, force `:hover` on the row via Elements → "Force element state" and inspect the computed `background` — confirm it resolves to the `--active-bg-hover` token (`#e2e8fd` light / `#263147` dark), NOT `--active-bg`.
3. Move the pointer away; confirm the background reverts to `--active-bg`.
4. Compare the two backgrounds side-by-side in DevTools screenshots; the two shades must be visually distinguishable (not a "no-op hover").

**Expected**:
- Computed background on hover = `var(--active-bg-hover)`.
- Off hover = `var(--active-bg)`.
- Both themes pass.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-4: Focus-visible ring paints on top of the selection border (AC5)
Covers AC5 + §31.4 box-shadow-inset swap.

**Steps (both themes)**:
1. Ctrl-click / Cmd-click any row to select it.
2. Using the keyboard only, Tab to the selected row.
3. Inspect the row: there should be TWO concentric blue layers:
   - Outer: the 2px `:focus-visible` outline (`--focus-ring`).
   - Inner: the 1px `box-shadow` selection border (`--selected-border`).
4. Confirm there is a 1-pixel clear-air gap between them; neither layer clips the other.
5. Repeat on a non-selected row (focus ring only, no selection border) — the ring should still paint cleanly.
6. Repeat on a row that is both live + active + selected + focused — all visual states compose without any layer being eaten.

**Expected**:
- Focus ring and selection border are BOTH visible when both states apply.
- No clipping, no visual collapse.
- Both themes pass.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-5: Checkbox hover-reveal with no reflow (AC6)
Covers AC6 — hover-reveal, persistent-when-selected, layout-stable.

**Steps (both themes)**:
1. Hover any unselected row — empty-checkbox outline appears immediately (no layout shift to the right of the checkbox).
2. Move pointer off — checkbox disappears.
3. Tab (keyboard) onto the row — checkbox reappears via `:focus-visible`.
4. Ctrl-click / Cmd-click to select the row — checkbox becomes persistent (stays visible even after pointer leaves and focus moves elsewhere).
5. Shift+Tab away — checkbox stays because `[data-selected="true"]` holds the reveal.
6. Measure layout stability: with pointer off the row, note the horizontal X position of the favicon. Hover on; the favicon should NOT shift horizontally. (The 18px flex-basis slot is always reserved; only `visibility` flips.)

**Expected**:
- Empty checkbox outline visible on `:hover`, `:focus-visible`, and `[data-selected="true"]`.
- Favicon and title do NOT reflow horizontally on hover-reveal.
- Persistent when selected; no reveal on neutral rows.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-6: VoiceOver sweep — screen-reader label order (AC7)
Covers AC7 priority-first concat and the M-1 fix (checkbox `aria-hidden="true"` prevents double-announce).

**Steps (macOS)**:
1. Enable VoiceOver (Cmd + F5).
2. Navigate via VO + Right Arrow through 5 rows configured as:
   - (a) saved-only (neutral — no flags),
   - (b) live only,
   - (c) active + live,
   - (d) drifted + audible,
   - (e) all five (active + live + drifted + audible + selected).
3. For each row, listen carefully to the announcement.

**Expected**:
- Token order for each row: `<title>, active tab, live tab, tab content has changed, playing audio, selected` — skipping tokens whose flag is off.
- Icons (triangle, speaker) do NOT double-announce — they are `aria-hidden="true"`.
- The child `.item-select` checkbox does NOT double-announce — its `aria-hidden="true"` and the row-level label already carries ", selected".

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-7: NVDA sweep — Windows screen reader parity (AC7)
Covers AC7 cross-platform SR parity.

**SKIP condition**: If no Windows test environment is available this sprint, document as SKIP (not FAIL) — the automated 32-combination AC7 sweep already locks the concat-order contract.

**Steps (Windows, if available)**:
1. Enable NVDA (Insert + the key below the Esc key, or launch NVDA manually).
2. Repeat UAT-6's 5-row sweep using NVDA's Browse mode and Focus mode.

**Expected**:
- Same token order and lowercase tokens as VoiceOver.
- No duplicate checkbox or icon announcements.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-8: Icons are `aria-hidden` — no double-announce (AC7)
Covers the `aria-hidden="true"` contract on `.item-audible-icon` and `.item-drifted-icon`.

**Steps**:
1. Open DevTools Elements pane.
2. Inspect the `.item-indicators` column on a drifted + audible row.
3. Confirm both the triangle `<span class="item-drifted-icon">` and speaker `<span class="item-audible-icon">` carry `aria-hidden="true"`.
4. Also inspect the `.item-select` child on any row — confirm `aria-hidden="true"` (M-1 fix).

**Expected**:
- `.item-audible-icon`, `.item-drifted-icon`, and `.item-select` all carry `aria-hidden="true"`.
- No per-icon `aria-label` — the row-level aria-label owns SR announcement.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-9: Contrast spot-check — the 3 borderline cells (AC3 — Q-UAT-10)
Covers AC3 WCAG AA contrast + validates the audit against the browser's measured values.

**Steps (light theme only — borderline cells are light-specific)**:
1. Open DevTools → Elements → Accessibility pane → Contrast.
2. For each of the three cells below, hover the element, read the measured ratio, and compare to the audit prediction:
   - (a) `.item-url` text on `--active-bg-hover` (light) — hover an active row; audit predicts **3.04:1** for `--text-tertiary` on `#e2e8fd` (borderline text fail, documented).
   - (b) live rail on `--bg-hover` (light) — hover an unselected live row; audit predicts **2.92:1** for the 3px green rail on `#ebedf0` (borderline non-text, 0.08 miss).
   - (c) drifted icon on `--selected-bg` (light) — select a drifted row; audit predicts **3.07:1** for the triangle on `#dbeafe`.
3. Record the measured vs. predicted delta for each.

**Expected**:
- Any measured value within ±0.10 of the audit prediction = PASS.
- A delta > 0.10 flags a palette-render mismatch — WARN and file a calibration follow-up.
- All three cells are DOCUMENTED borderlines; a slightly-below-threshold measurement is still a PASS for UAT (they are covered by `docs/a11y-audit-B-048.md §5` and B-064 deferral) — the point of this case is to confirm the browser agrees with the audit maths.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-10: Dark-theme checkmark stroke (H-1 fix verification)
Covers the H-1 fix — dark-theme checkmark uses `stroke='%230a0f1a'` for ≈10.7:1 (AAA) instead of `white` (≈2.9:1 FAIL).

**Steps**:
1. Switch the side panel to dark theme (system dark + extension theme = `system`, OR extension theme = `dark`).
2. Ctrl-click / Cmd-click a row to select it — the `.item-select` renders as filled with a checkmark.
3. DevTools Elements → inspect the `.item-select[aria-checked="true"]` — confirm computed `background-image` resolves to the dark-theme override (stroke value in the data URI is `%230a0f1a`, NOT `white`).
4. Visually verify: the checkmark is clearly readable against the light-blue background; it does NOT look washed-out (the bug before H-1 fix was a near-invisible white-on-light-blue).
5. Repeat for BOTH `[data-theme="dark"]` (forced dark) AND the system-dark path (extension theme = `system`, OS in dark mode).

**Expected**:
- Dark-theme checkmark stroke resolves to `%230a0f1a` in both forced-dark and system-dark.
- Visual: high-contrast dark glyph on light-blue fill — no readability concern.
- Light-theme checkmark stroke remains `white` (audited 4.80:1).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-11: B-024 multi-select regression — Space / Enter toggles `.item-select`
Covers the B-024 multi-select contract after the B-048 DOM migration (pseudo `::before` → real `.item-select` child).

**Steps**:
1. Tab onto a neutral row (keyboard focus visible).
2. Press Space — row becomes selected, `.item-select[aria-checked="true"]`, `[data-selected="true"]` on the row, bulk action bar appears.
3. Press Space again — selection toggles off, checkbox unchecked, row returns to neutral state.
4. Move focus to another row; press Enter — confirm Enter also toggles selection (if that is the B-024 binding) OR opens the row target (if Space is the sole toggle key).
5. Ctrl-click / Cmd-click a third row — added to the selection; multiple rows show `.item-select` filled simultaneously.
6. Shift+click a fourth row — range selection fills all rows in between.

**Expected**:
- All selection gestures flip `aria-checked` and `data-selected` correctly on the new real `.item-select` child.
- Bulk action bar count matches the visible filled-checkbox count.
- No stale `::before` pseudo-element ghost anywhere (DevTools → Elements → check for any `::before` on `.item-row` — there should be none).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-12: B-055 Open Tabs rows carry `.item-select` + aria-label parity
Covers B-055 regression — Open Tabs section rows participate in multi-select with identical DOM contract.

**Steps**:
1. Expand the "Open Tabs" section at the bottom of the side panel.
2. Inspect one Open Tabs row in DevTools Elements:
   - First child is `<span class="item-select" role="checkbox" aria-checked="false" aria-hidden="true" tabindex="-1">`.
   - `aria-label` on the row follows the same concat rules (e.g. for a non-active non-audible tab: `<title>, live tab`; for an active audible tab: `<title>, active tab, live tab, playing audio`).
3. Ctrl-click / Cmd-click the Open Tabs row to select it — checkbox fills, `data-selected="true"` lands, aria-label picks up `, selected` suffix.
4. VoiceOver / NVDA announces the same priority order as saved-item rows.

**Expected**:
- Open Tabs rows have visual and SR parity with saved-item rows.
- Hover-reveal, focus-reveal, and persistent-when-selected all work on Open Tabs rows.
- No shape drift between the two row types.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-13: AC8 patch-latency + AC9 zero full-re-render
Covers AC8 (≤500ms per patch) and AC9 (targeted DOM patches, no full re-render).

**Steps**:
1. Load a profile with ≥ 100 saved items (the more, the better — use a large `chrome.storage.local` seed or accumulate items naturally).
2. Open DevTools → Performance → Record.
3. Trigger rapid live-state churn:
   - Alt-Tab to another window so the sidepanel loses focus.
   - In another window, play an audible tab whose URL is saved, then pause it, then re-play — each change fires `MSG_STATE_CHANGED` which routes to `refetchAndPatchLiveState`.
   - Repeat 10× to gather timing samples.
4. Stop the recording. Inspect the performance flame chart:
   - Each `refetchAndPatchLiveState` call should complete in < 500ms (typically well under 50ms for sub-1000 items).
   - NO `renderAll` calls during the recording (AC9 — `renderAll` only fires on initial load or empty-state fallback).
   - `itemListEl.replaceChildren` should NOT appear in the trace during a live-state patch.
5. Open DevTools Elements → check that the DOM node count of `#item-list > .item-row` is stable across patches (note the count before + after — must be identical unless a tab was opened/closed during the recording).
6. Focus a row with keyboard, trigger a live-state change in another window, confirm focus SURVIVES on the same row (the row node is not replaced — it's patched in place).

**Expected**:
- All `refetchAndPatchLiveState` calls < 500ms.
- Zero `renderAll` invocations during steady-state patches.
- DOM node count stable.
- Keyboard focus survives live-state patches (no focus loss from row replacement).

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

### UAT-14: Q-M2 deferred — rename-race staleness window (flag only)
Covers the deferred Q-M2 issue flagged for R6 (solution-architect). `_setRowSelected` reads `_itemById` while `refetchAndPatchLiveState` reads the fresh `itemMap`; a user who toggles selection *immediately* after a rename broadcast (but before the next broadcast applies) may see a one-frame stale title in the row's `aria-label`.

**Steps**:
1. Open side panel window A with at least one saved item.
2. In window B (or via the omnibox in a separate window), rename the same bookmark's title (`chrome.bookmarks.update`) — the rename fires a `MSG_STATE_CHANGED` with `scope: 'items'`.
3. In window A, the moment the rename broadcast lands, Ctrl-click / Cmd-click the renamed row to toggle selection.
4. Using DevTools Elements, inspect the row's `aria-label` — does it read the NEW title or the OLD title?

**Expected**:
- Best case: fresh title appears immediately in the aria-label (no stale frame).
- Documented known-issue case: one frame of the old title is visible, then self-heals on the next broadcast. This is a WARN (not FAIL) — it is flagged for R6 discussion, not a blocker.
- If the stale frame persists across multiple broadcasts (does NOT self-heal), that is a FAIL — escalate.

**Status**: [ ] PASS / [ ] FAIL / [ ] WARN / [ ] SKIP
**Notes**:

---

## Final UAT Summary

| # | Case | Result |
|---|------|--------|
| 1 | All 5 states alone — grayscale distinction (AC1) | |
| 2 | All 5 states on one row — coexistence (AC2 + AC7 full label) | |
| 3 | Hover distinguishable on active row (AC4) | |
| 4 | Focus-visible composes over selection border (AC5) | |
| 5 | Checkbox hover-reveal, no reflow, persistent when selected (AC6) | |
| 6 | VoiceOver sweep — priority-first token order (AC7) | |
| 7 | NVDA sweep — Windows SR parity (AC7) | |
| 8 | Icons + checkbox `aria-hidden="true"` — no double-announce (AC7) | |
| 9 | Contrast spot-check — 3 borderline cells vs audit (AC3 / Q-UAT-10) | |
| 10 | Dark-theme checkmark stroke (H-1 fix) | |
| 11 | B-024 multi-select regression — Space/Enter toggles `.item-select` | |
| 12 | B-055 Open Tabs rows carry `.item-select` + aria-label parity | |
| 13 | AC8 patch latency + AC9 zero full-re-render | |
| 14 | Q-M2 deferred — rename-race staleness (flag only) | |

**Overall**: [ ] PASS / [ ] FAIL

**UAT performed by**: _______________________
**Date**: _______________________
**Browser + build**: _______________________

If any of UAT-1..UAT-6, UAT-10, UAT-11, UAT-12, or UAT-13 land FAIL, B-048 returns to the [frontend-engineer] per Gate 3 — do not mark the sprint item done. UAT-7 may be SKIPPED if no Windows machine is available (the automated 32-combination AC7 sweep already locks the contract). UAT-9 WARN is allowed for the documented borderline cells — they are covered by the audit + the B-064 deferral. UAT-14 WARN is allowed and flagged for R6 — a FAIL there only if the stale frame does not self-heal.
