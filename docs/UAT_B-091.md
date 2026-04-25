# UAT Plan — B-091 Settings Page Redesign

Sprint 30 · Full (L) · Spike-First · R5 UAT plan (authored by [test-engineer])

Related artefacts:
- `docs/BACKLOG.md` — B-091 row (15 acceptance criteria)
- `docs/design/44-b-091-settings-page.md` — R2 design chapter (D-1..D-10 + C-1..C-11)
- `docs/design/44-b-091-settings-page-r0-spike.md` — R0 spike (risk inventory R-1..R-13)
- `tests/b091-settings-page.test.js` — 27 automated tests (24 original + 3 R5 gap-fills)
- `settings/settings.html`, `settings/settings.js`, `settings/settings.css`, `settings/settings-fields.js`, `settings/theme-init.js`
- `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js` (gear-button repoint + B-089 modal removal)

## Preconditions

1. Extension loaded unpacked from `feature/sprint-30-settings-redesign` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser). Re-run UAT-1 through UAT-4, UAT-11, UAT-25 in Chrome as a spot check.
3. Fixture: any non-empty bookmarks collection (existing dev data is fine; minimum 1 group with 3+ items).
4. DevTools open on the background service worker (`edge://extensions` → Tab Junkie → "Inspect views: service worker") for storage inspection.
5. Confirm starting state: `chrome.storage.local.get('tj:prefs')` in the SW console — note current `displayMode` and `autoCollapseSubGroups` values before running pref-change cases.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Tab dispatcher (AC1, AC2)

#### UAT-1: First gear-click opens a new Settings tab — Priority: B

**Given** the extension is loaded and no Settings tab exists.
**When** I click the gear icon (`#sidepanel-settings-btn`) in the sidepanel header.
**Then** a new browser tab opens at `chrome-extension://<id>/settings/settings.html` and becomes the active tab.
**Expected**: New tab visible in the tab strip at the correct extension URL. No modal appears in the sidepanel.

#### UAT-2: Second gear-click focuses existing Settings tab — Priority: B

**Given** a Settings tab is already open (from UAT-1).
**When** I click the gear icon again in the sidepanel.
**Then** the existing Settings tab becomes active (no new tab is created).
**Expected**: Tab strip shows exactly one Settings tab; that tab gains focus. No duplicate.

#### UAT-3: Close and re-open creates a new tab — Priority: H

**Given** I close the Settings tab.
**When** I click the gear icon in the sidepanel.
**Then** a new Settings tab opens.
**Expected**: Fresh Settings tab at the same URL. Content re-hydrates from storage.

#### UAT-4: Gear-click from window B focuses Settings tab in window A — Priority: H

**Given** a Settings tab is open in window A and a sidepanel is open in window B.
**When** I click the gear icon in window B's sidepanel.
**Then** window A gains focus AND the Settings tab within window A becomes active.
**Expected**: OS window focus shifts to window A. No second Settings tab opened.

---

### Page structure (AC3, AC4, AC9)

#### UAT-5: Page renders correct top-level DOM structure — Priority: B

**Given** the Settings tab is open and prefs have loaded.
**When** I inspect the DOM (DevTools Elements panel).
**Then** I see `<main>` wrapping all content, `<h1>Settings</h1>` as the first heading, and exactly five `<fieldset class="settings-section">` blocks.
**Expected**: `document.querySelectorAll('fieldset.settings-section').length === 5`; `document.querySelector('h1').textContent === 'Settings'`.

#### UAT-6: Five sections render in correct order with visible legends — Priority: B

**Given** the Settings page is open.
**When** I read the section headings top-to-bottom.
**Then** I see, in order: **Display**, **Layout**, **Groups**, **Theme**, **Data**.
**Expected**: Each section's `<legend>` text matches exactly (no trailing spaces, no extra copy). DOM order matches the visual order.

#### UAT-7: Theme section shows placeholder text only — Priority: H

**Given** the "Theme" fieldset is visible.
**When** I inspect its contents.
**Then** I see the text "Theme selection coming in a future update." and no interactive controls (no toggles, no selects, no buttons) inside the fieldset.
**Expected**: Fieldset contains exactly one `<p class="settings-section-placeholder">` element and nothing else. No empty-fieldset visual artifact.

#### UAT-8: Layout and Data sections render Wave 0 placeholders or Wave 1 controls — Priority: M

**Given** B-092 and B-093 Wave 1 may or may not have landed in this branch.
**When** I inspect the "Layout" and "Data" fieldsets.
**Then** each section renders either (a) a placeholder `<p>` message OR (b) the actual Wave 1 controls (dense layout toggle / import-export buttons) — no empty bare fieldset.
**Expected**: User can visually distinguish each section even if controls are not yet present.

---

### Wave 0 prefs (AC5)

#### UAT-9: Display section reflects current `displayMode` pref — Priority: B

**Given** I know the current `displayMode` value from SW console.
**When** the Settings page loads.
**Then** the "Open Tab Junkie on click" `<select>` reflects the current stored value ("Side panel" or "Standalone window").
**Expected**: Select value matches `tj:prefs.displayMode`. Default ("Side panel") if no pref is stored.

#### UAT-10: Groups section reflects current `autoCollapseSubGroups` pref — Priority: B

**Given** I know the current `autoCollapseSubGroups` value from SW console.
**When** the Settings page loads.
**Then** the "Auto-collapse sub-groups" toggle `<input type="checkbox">` is checked or unchecked to match the stored value.
**Expected**: Checkbox state matches `tj:prefs.autoCollapseSubGroups`. Unchecked if not stored.

#### UAT-11: Changing Display select persists to storage — Priority: B

**Given** the Settings page is open with prefs loaded.
**When** I change the "Open Tab Junkie on click" select to the alternative option and wait ~500 ms.
**Then** `chrome.storage.local.get('tj:prefs')` in the SW console shows the updated `displayMode` value.
**Expected**: `tj:prefs.displayMode` reflects the new selection. No page reload required.

#### UAT-12: Changing Groups toggle persists to storage — Priority: B

**Given** the Settings page is open.
**When** I toggle "Auto-collapse sub-groups" and wait ~500 ms.
**Then** `chrome.storage.local.get('tj:prefs')` shows the updated `autoCollapseSubGroups` value.
**Expected**: `tj:prefs.autoCollapseSubGroups` toggles between `true` and `false`.

---

### Error and loading states (AC10)

#### UAT-13: SW unreachable → error banner with Reload button — Priority: B

**Given** I navigate to `edge://extensions`, click "Stop" on the Tab Junkie service worker to suspend it.
**When** I click the gear icon in the sidepanel (if the SW suspension prevents the tab from opening, navigate to the Settings URL directly).
**Then** the page loads with a visible top-of-page error banner containing text starting with "Could not load settings —" and a "Reload" button.
**Expected**: Banner is visible; controls are disabled or absent; no unhandled JS errors in DevTools console.

#### UAT-14: Reload button is keyboard-accessible and restores the page — Priority: H

**Given** the error banner is showing (from UAT-13), and the SW has been re-enabled.
**When** I Tab-navigate to the "Reload" button and press Enter.
**Then** the page reloads and loads successfully (prefs hydrate, controls enable).
**Expected**: Reload button is reachable by Tab; Enter activates it; page reloads fully.

#### UAT-15: Controls are disabled during the prefs fetch — Priority: H

**Given** the Settings page is loading.
**When** I observe the page during the brief pref-fetch window (may require throttling the SW in DevTools to slow the round-trip).
**Then** the controls are rendered in a disabled state (greyed-out, non-interactive) until the prefs response arrives.
**Expected**: Controls visually indicate a loading/disabled state before becoming interactive.

#### UAT-16: Save failure → control reverts + inline error — Priority: H

**Given** the Settings page has loaded successfully.
**When** I throttle or stop the SW after load, then change a toggle or select.
**Then** after the save attempt fails, the control reverts to its previous value and an inline "Could not save. Try again." message appears adjacent to the changed control.
**Expected**: Control value snaps back; inline row error text visible; no unhandled rejection in console.

---

### Broadcast sync (AC13)

#### UAT-17: Pref change in Settings tab does not break sidepanel — Priority: H

**Given** the sidepanel and the Settings tab are both open.
**When** I change a pref in the Settings tab and save it.
**Then** the sidepanel continues to function normally (no crash, no broken state, no uncaught errors in the SW console).
**Expected**: Sidepanel remains interactive after the broadcast is delivered.

#### UAT-18: Two Settings tabs sync on pref change — Priority: H

**Given** two Settings tabs are open simultaneously (open the URL directly in a second tab after the first is open).
**When** I change a pref in tab 1.
**Then** tab 2 reflects the same new value within a few seconds (broadcast latency), without a page reload.
**Expected**: Tab 2's control updates in-place to match tab 1's saved value.

---

### Accessibility (AC12)

#### UAT-19: Keyboard navigation cycles through controls in DOM order — Priority: H

**Given** the Settings page is loaded and prefs are resolved.
**When** I press Tab repeatedly starting from the first control.
**Then** focus cycles through each control in the order: Display select → Groups toggle → (Layout/Data controls if Wave 1 landed) → end of document.
**Expected**: Each focusable control receives a visible focus ring when reached by Tab. Shift+Tab reverses the order. No keyboard trap.

#### UAT-20: Focus management on load and error paths — Priority: H

**Given** a fresh Settings tab opens.
**When** prefs load successfully.
**Then** focus moves to the first focusable control (the Display select, `#settings-ctl-displayMode`) automatically.
**When** prefs load fails (error path from UAT-13).
**Then** focus moves to the "Reload" button automatically.
**Expected**: No manual click required; AT users hear the focused element announced on page ready.

#### UAT-21: Screen reader announces headings and controls — Priority: H

**Given** Narrator (Edge on Windows) or VoiceOver (macOS) is enabled.
**When** I navigate to the Settings tab.
**Then** Narrator announces: "Settings" (h1 heading), then each section as "[section name] group" when entering a fieldset, then each control with its label.
**Expected**: "Settings, heading 1"; "Display, group"; "Open Tab Junkie on click, combo box"; "Auto-collapse sub-groups, checkbox". No unlabelled controls announced.

#### UAT-22: WCAG AA contrast — light theme — Priority: M

**Given** the Settings page in light theme.
**When** I run Lighthouse Accessibility audit or axe-core DevTools extension.
**Then** zero critical or serious contrast violations are reported.
**Expected**: All text on `--color-bg` background passes 4.5:1 ratio at body size. Toggle pill and select border meet AA.

#### UAT-23: WCAG AA contrast — dark theme — Priority: M

**Given** the OS is set to dark mode (Settings → Personalisation → Colours → Dark).
**When** I open the Settings page and run the same audit as UAT-22.
**Then** zero critical or serious contrast violations in dark theme.
**Expected**: Same thresholds as UAT-22 in the dark colour token set.

#### UAT-24: Reduced motion honoured — Priority: M

**Given** the OS reduced-motion preference is enabled (Edge Settings → Accessibility → Reduce animation).
**When** I toggle a control that may have a CSS transition (toggle pill animation).
**Then** the transition is suppressed or instantaneous.
**Expected**: `settings.css` `prefers-reduced-motion` media query removes or speeds up toggle/select transitions.

---

### Performance (AC11)

#### UAT-25: Settings tab first paint < 300 ms — Priority: M

**Given** DevTools Performance panel is open on a blank tab; the Settings tab is not currently open.
**When** I click the gear icon and record the tab-open event.
**Then** the time from the gear click to the first visible paint (DOMContentLoaded) is under 300 ms on a desktop Edge instance.
**Expected**: Record three consecutive opens; all three are under 300 ms. Note: this is a UAT-measured budget — no automated synthetic timing assertion in the test suite.

#### UAT-26: `MSG_GET_PREFERENCES` round-trip < 200 ms — Priority: M

**Given** DevTools Network panel (or SW console timing) is open.
**When** the Settings page loads and the prefs fetch completes.
**Then** the time from `DOMContentLoaded` to the controls becoming enabled is under 200 ms.
**Expected**: Measure three consecutive reloads of the Settings tab; all under 200 ms.

#### UAT-27: Save round-trip + broadcast delivery < 500 ms — Priority: M

**Given** two Settings tabs are open.
**When** I change a control in tab 1 and observe tab 2.
**Then** tab 2 reflects the change within 500 ms of the control-change event in tab 1.
**Expected**: Broadcast latency is perceptibly instantaneous; tab 2 does not require a reload.

---

### B-089 modal absence (AC8)

#### UAT-28: Gear click does not open a modal — Priority: B

**Given** the sidepanel is open.
**When** I click the gear icon.
**Then** no modal appears in the sidepanel; only the new Settings tab opens.
**Expected**: `#dialog-overlay` remains invisible; no `#settings-dialog` element in the sidepanel DOM.

#### UAT-29: `#settings-dialog` absent from sidepanel DOM — Priority: B

**Given** the sidepanel is open.
**When** I inspect the sidepanel DOM in DevTools.
**Then** `document.getElementById('settings-dialog')` returns `null`. `document.getElementById('settings-content')` returns `null`. `document.getElementById('settings-close-btn')` returns `null`.
**Expected**: Zero remnants of the B-089 dialog in the live DOM.

#### UAT-30: `sidepanel/settings-dialog.js` file is gone from the repo — Priority: B

**Given** the branch is checked out.
**When** I run `ls sidepanel/settings-dialog.js` in a terminal at the repo root.
**Then** the shell returns "No such file or directory".
**Expected**: File is deleted; no dead import or reference survives in `sidepanel.js` (verify via DevTools source panel or console).

---

## Pass Criteria

- **Zero blocker (B) failures** to mark B-091 done.
- **At most 1 high (H) failure** with documented rationale and a follow-up backlog item.
- **Medium (M) failures** noted but non-blocking; logged as S31 polish candidates.
- Any UAT FAIL on B-rated cases routes the item back to [frontend-engineer] before close.
