# UAT Plan — B-037 Theme Selection

Sprint 31 · Full (M) · R5 UAT plan (authored by [test-engineer])

Related artefacts:
- `docs/BACKLOG.md` — B-037 row (14 ACs)
- `docs/design/45-b-037-themes.md` — R2 design chapter (D-1..D-8 + C-1..C-12)
- `tests/b037-themes.test.js` — 34 automated tests (22 R3 + 9 R4 fix + 3 R5 gap-fills)
- `shared/themes.css`, `shared/theme-init.js`
- `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`
- `newtab/newtab.html`, `newtab/newtab.js`
- `settings/settings.html`, `settings/settings.js`, `settings/settings-fields.js`
- `popup/popup.html`, `popup/popup.js`

## Preconditions

1. Extension loaded unpacked from `feature/sprint-31-themes` via `edge://extensions` → "Load unpacked" → repo root.
2. **CRITICAL — stale-SW flush**: `edge://extensions` → Tab Junkie row → toggle OFF, then back ON. This re-loads the SW module so the new 13-slug validator is active. Without this, choosing any theme other than Light / Dark / System will produce a "Could not save" error (D-5 / D-8 stale-SW precedent from B-092 / B-094).
3. Edge (primary target browser). Re-run UAT-1, UAT-5, UAT-26 in Chrome as spot-checks.
4. Fixture: any non-empty bookmarks collection (existing dev data is fine).
5. DevTools: open the SW inspector (`edge://extensions` → Tab Junkie → "Inspect views: service worker") for storage / console access during migration and error-state cases.
6. Confirm starting state: `chrome.storage.local.get('tj:prefs')` in SW console — note current `theme` value before running pref-change cases.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (≤ 1 fail allowed, must be documented) · **M** = medium (non-blocking, note and defer)

---

## Test Cases

### Settings page Theme picker (AC1, AC2, AC4)

#### UAT-1: Theme section renders — no placeholder — Priority: B

**Given** the extension is freshly toggled ON.
**When** I open the Settings tab (click gear icon in sidepanel) → scroll to the Theme section.
**Then** the Theme section contains a `<select>` control labelled "Theme" with no placeholder paragraph ("Theme selection coming in a future update." is gone).
**Expected**: A functional dropdown is visible, not static text.

#### UAT-2: Theme select has 3 optgroups — Priority: B

**Given** the Theme section is visible.
**When** I click the Theme `<select>` to open the dropdown.
**Then** three labelled groups appear: **Auto**, **Light**, **Dark** (in that order, top to bottom).
**Expected**: Three distinct group headers in the dropdown; no ungrouped options.

#### UAT-3: Option counts per optgroup (Auto=1, Light=4, Dark=8) — Priority: B

**Given** the dropdown is open.
**When** I count the options within each group.
**Then**: Auto = 1 ("System default"), Light = 4, Dark = 8 — total 13 options.
**Expected**: Exact counts; no duplicates; no missing themes from the catalog in D-1.

#### UAT-4: Default selection is "System default" — Priority: B

**Given** this is the first use (or storage was cleared — see UAT-17).
**When** I open Settings → Theme section.
**Then** the select control shows "System default" as the pre-selected value.
**Expected**: `select.value` === `'system'` and the label reads "System default".

---

### Theme application + cross-surface broadcast (AC4, AC5, AC10)

#### UAT-5: Dracula theme applies to Settings page — Priority: B

**Given** Settings tab is open.
**When** I select "Dracula" from the Theme picker.
**Then** the Settings page repaints with Dracula colors (near-black `#282a36` background, magenta/purple accents) within ~1 second. No "Could not save" error banner appears.
**Expected**: Visible color change; no error. `chrome.storage.local.get('tj:prefs')` shows `theme: 'dracula'`.

#### UAT-6: Broadcast reaches all 4 open surfaces — Priority: B

**Given** sidepanel, newtab, standalone window (if available), and Settings tab are all open.
**When** I select "Dracula" in the Settings picker.
**Then** all open surfaces repaint in Dracula colors within ≤ 500 ms.
**Expected**: All surfaces flip simultaneously. No surface stays on the old theme until refresh.

#### UAT-7: Switch to Solarized Light — all surfaces flip — Priority: H

**Given** theme is currently "Dracula".
**When** I select "Solarized Light" from the picker.
**Then** all open surfaces switch to the warm-cream Solarized Light palette (`#fdf6e3` background, blue accent).
**Expected**: All surfaces flip. Settings page control shows "Solarized Light" selected.

#### UAT-8: Switch to GitHub Dark — all surfaces flip — Priority: H

**Given** any non-GitHub-Dark theme is active.
**When** I select "GitHub Dark".
**Then** all surfaces render with dark background (`#0d1117`) and blue accent (`#2f81f7`).
**Expected**: Consistent flip across all open surfaces.

#### UAT-9: Cycle all 13 themes — distinct palettes — Priority: M

**Given** Settings tab is open.
**When** I select each of the 13 themes in sequence (system → github-light → tomorrow → atom-one-light → solarized-light → github-dark → tomorrow-night → atom-one-dark → solarized-dark → dracula → nord → one-dark → monokai).
**Then** each theme produces a visually distinct color scheme on the Settings page.
**Expected**: No two consecutive themes look identical. No error banners during cycling.

---

### Popup theme broadcast (AC4, AC5 — H-1 fix)

#### UAT-10: Popup renders in active theme (Dracula spot-check) — Priority: B

**Given** theme is set to "Dracula" via Settings.
**When** I open the quick-search popup (Alt+J or the extension icon).
**Then** the popup renders in Dracula colors (dark background, purple/magenta accent).
**Expected**: Popup has `data-theme="dracula"` on its `<html>` element (visible in DevTools).

#### UAT-11: Popup reflects theme switch (Tomorrow spot-check) — Priority: H

**Given** I switch to "Tomorrow" via Settings.
**When** I close and reopen the popup.
**Then** the popup renders in Tomorrow colors (off-white background, muted accent).
**Expected**: Popup is not stuck on the previous theme.

#### UAT-12: Popup reflects Atom One Dark — Priority: M

**Given** I switch to "Atom One Dark" via Settings.
**When** I reopen the popup.
**Then** the popup renders in Atom One Dark colors.
**Expected**: Consistent with all other surfaces.

---

### System auto-switch (AC8)

#### UAT-13: System default follows OS dark mode — Priority: H

**Given** theme is set to "System default".
**When** OS is in dark mode (Settings → Personalisation → Colors → Dark).
**Then** all surfaces render the dark system palette (same as the pre-B-037 dark theme).
**Expected**: Surfaces are dark; no light flash.

#### UAT-14: System default auto-switches to light mode — Priority: H

**Given** theme is "System default" and OS is currently in dark mode.
**When** I toggle OS to light mode.
**Then** all surfaces flip to the light system palette within the window focus cycle (browser or tab reload may be needed — the `@media` responds on repaint).
**Expected**: Surfaces repaint light. `data-theme="system"` is unchanged on `<html>`; the CSS `@media` block drives the visual switch.

---

### Legacy migration (AC3, D-2)

#### UAT-15: Legacy `theme: 'light'` migrates to atom-one-light on read — Priority: H

**Given** in the SW DevTools console I run:
```js
await chrome.storage.local.set({'tj:prefs': {theme:'light', displayMode:'sidepanel', newTabOverride:false, autoCollapseSubGroups:false, importSkipDuplicates:true, denseLayout:false}})
```
**When** I reload the sidepanel (close and reopen).
**Then** the sidepanel renders in Atom One Light colors. In the SW console, `(await chrome.storage.local.get('tj:prefs'))['tj:prefs'].theme` still reads `'light'` (disk unchanged by read-time migration).
**Expected**: Visual: Atom One Light palette. Disk: still `'light'` until the user picks a new theme.

#### UAT-16: Legacy `theme: 'dark'` migrates to one-dark on read — Priority: H

**Given** same setup as UAT-15 but with `theme: 'dark'`.
**When** I reload the sidepanel.
**Then** sidepanel renders in One Dark colors. Disk value stays `'dark'`.
**Expected**: Visual: One Dark palette. Disk unchanged.

---

### Empty / error states (AC9, C-9)

#### UAT-17: Fresh install — defaults to System default — Priority: B

**Given** I clear all extension storage: SW DevTools → Application tab → Storage → Clear all (or run `await chrome.storage.local.clear()`).
**When** I close and reopen the sidepanel.
**Then** the sidepanel renders with the "System default" theme (follows OS setting). Settings page Theme picker shows "System default" selected.
**Expected**: No error; no blank/unstyled paint; system theme active.

#### UAT-18: Corrupt theme slug gracefully falls back — Priority: H

**Given** in SW console I run:
```js
await chrome.storage.local.set({'tj:prefs': {theme:'invalid-slug', displayMode:'sidepanel', newTabOverride:false, autoCollapseSubGroups:false, importSkipDuplicates:true, denseLayout:false}})
```
**When** I reload the sidepanel.
**Then** the sidepanel falls back gracefully — renders in the system theme (caller safe-mode); no crash; no blank white surface.
**Expected**: Graceful fallback to system colors. The corrupt value does NOT persist to a new write.

#### UAT-19: SW unavailable mid-session shows inline error — Priority: M

**Given** a Settings tab is open.
**When** I disable the extension in `edge://extensions` and immediately attempt to change the Theme picker in the still-open Settings tab.
**Then** the Settings page shows an inline error banner ("Could not save" or equivalent) rather than silently failing or crashing.
**Expected**: Error feedback visible. No unhandled exception in the DevTools console.

---

### Accessibility — contrast spot-check (AC11a, AC11b)

#### UAT-20: GitHub Light — body text contrast ≥ AA — Priority: H

**Given** theme is "GitHub Light" (`#ffffff` bg, `#1f2328` fg).
**When** I run Lighthouse or axe DevTools on the sidepanel.
**Then** no contrast failures for body text. Expected ratio: ~16:1 (passes AA and AAA).
**Expected**: Zero contrast errors on text elements.

#### UAT-21: One Dark — body text contrast ≥ AA — Priority: H

**Given** theme is "One Dark" (`#282c34` bg, `#abb2bf` fg).
**When** I run the contrast checker.
**Then** body text ratio ≥ 4.5:1. Expected: ~8.1:1.
**Expected**: Passes AA.

#### UAT-22: Solarized Light — spot-check — Priority: M

**Given** theme is "Solarized Light" (`#fdf6e3` bg, `#586e75` fg).
**When** I check body text contrast.
**Then** ratio ≥ 4.5:1. Expected: ~7.2:1.
**Expected**: Passes AA.

#### UAT-23: Dracula — accent visibility on dark bg — Priority: M

**Given** theme is "Dracula" (`#282a36` bg, `#bd93f9` accent).
**When** I inspect link / accent text contrast.
**Then** accent ratio ≥ 3:1 for large text. Expected: ~8.3:1.
**Expected**: No washed-out accent text.

#### UAT-24: Focus ring visible across themes — Priority: H

**Given** I switch to each of the following themes: GitHub Light, One Dark, Dracula, Nord, Tomorrow.
**When** I press Tab to cycle through controls in the Settings page.
**Then** a visible focus ring is present on each focused element under each theme.
**Expected**: `--focus-ring` CSS variable resolves to a contrasting color in every theme; no invisible focus states.

---

### FOUC prevention (AC6, AC10c)

#### UAT-26: No white flash on sidepanel open — Priority: B

**Given** theme is set to "Dracula".
**When** I close the sidepanel and immediately reopen it.
**Then** the sidepanel paints in Dracula colors on first visible frame — no white or light flash before the theme loads.
**Expected**: Zero FOUC. The `shared/theme-init.js` sessionStorage sync-read fires before stylesheet resolution.

#### UAT-27: No white flash on newtab and Settings page — Priority: H

**Given** theme is "GitHub Dark".
**When** I open a new tab and navigate to the Settings page.
**Then** both render in GitHub Dark colors from first paint.
**Expected**: No flash of default browser styling (white/grey) before the dark theme appears.

---

### Performance (AC10a, AC10b)

#### UAT-28: Broadcast repaint ≤ 500 ms — Priority: H

**Given** sidepanel, newtab, and Settings tab are all open.
**When** I select "Nord" in the Settings picker and eyeball (or use DevTools Performance panel to record the event).
**Then** all surfaces visually flip to Nord colors within approximately 500 ms of the picker change.
**Expected**: Fast visual flip; no noticeable lag on a warm storage path.

#### UAT-29: No layout reflow during theme switch — Priority: M

**Given** DevTools Performance panel is recording.
**When** I switch from "Tomorrow" to "Tomorrow Night" in the Settings picker.
**Then** the Performance trace shows Paint / Composite Layers events but **no Layout event** triggered by the theme switch.
**Expected**: Zero layout reflow on theme change (only CSS custom-property swap on `<html>` data-theme).

---

### Out-of-scope confirmation (AC12)

#### UAT-30: Manifest permissions unchanged — Priority: B

**Given** the extension is loaded from `feature/sprint-31-themes`.
**When** I inspect the extension detail page at `edge://extensions` → Tab Junkie → "Details".
**Then** no new permissions appear beyond the pre-B-037 set: Tabs, Tab groups, Storage, Side Panel, Search.
**Expected**: Permission list identical to v1.24.0 baseline. (`git diff manifest.json` is empty modulo the version field.)

---

## AC Coverage Summary

| AC | Description (abbreviated) | Automated test(s) | UAT case(s) |
|----|--------------------------|-------------------|-------------|
| AC1 | 13 themes registered | T1 (catalog count in renderSelect) | UAT-3, UAT-9 |
| AC2 | Theme picker in Settings with optgroups | T5 (renderSelect optgroups) | UAT-1, UAT-2, UAT-3 |
| AC3 | Validator accepts 13 new slugs; legacy migrated | T2, T3, T7, T8, T9, T10, T19 (gap-fill 1) | UAT-15, UAT-16 |
| AC4 | Theme applied immediately on picker change | T15, T16, T17, T20 (gap-fill 3) | UAT-5, UAT-10 |
| AC5 | Broadcast reaches all open surfaces | T6 (setPreferences round-trip), T20 (gap-fill 3) | UAT-6, UAT-7, UAT-8 |
| AC6 | FOUC prevention via theme-init.js + sessionStorage | T1, T13, T14, T16, T18 | UAT-26, UAT-27 |
| AC7 | Consolidated shared/themes.css, 13 palette blocks | T10 | (CSS file test; UAT confirms visuals) |
| AC8 | System theme auto-switches with OS | T10 (`@media` block present) | UAT-13, UAT-14 |
| AC9 | Empty / error states (fresh, corrupt, failure) | T12, T13, T20 (gap-fill 2), T19 (gap-fill 2) | UAT-17, UAT-18, UAT-19 |
| AC10 | Performance: ≤ 500 ms broadcast, no reflow, no FOUC | T11 (no transition), T15, T16 | UAT-28, UAT-29, UAT-26 |
| AC11 | Accessibility: AA contrast, focus ring, instant swap | T11 (no transition) | UAT-20–UAT-25 |
| AC12 | Manifest unchanged | T17 | UAT-30 |
| AC13 | Slug catalog stability (slugs do not change post-R6) | T5 (exact slug list) | UAT-9 |
| AC14 | CSS consolidation: zero [data-theme=] in per-surface CSS | T12, T13, T15 | UAT-5 through UAT-9 (visual confirmation) |

---

## Known R5 Gaps (UAT-only signals)

- **AC10 real-paint timing** (UAT-28, UAT-29): Chrome/Edge DevTools Performance panel. `chrome-mock` does not model SW message latency or CSS repaint timing.
- **AC11a contrast ratios** (UAT-20–UAT-24): Requires a real rendering engine (Lighthouse / axe-core). Automated tests verify token values exist; they cannot measure rendered contrast.
- **AC8 OS auto-switch** (UAT-13, UAT-14): `@media (prefers-color-scheme: dark)` response requires an OS-level media query change; not reproducible in Node test harness.
- **Stale-SW behavior** (D-5, D-8): `chrome-mock` does not model SW module cache; stale-validator rejection is UAT-only. The CHANGELOG v1.25.0 notice covers this.
- **Popup teardown race** (C-11): N/A for this item (Settings page is a full tab, not a popup-origin picker), but UAT-10–UAT-12 manually confirm popup theme fidelity.

## Pass Criteria

- Zero **B** (blocker) failures.
- ≤ 2 **H** (high) failures — each documented with root cause and remediation plan before sprint close.
- Any **M** (medium) failures noted in `SPRINT.md` handoff notes and scheduled for S32 polish queue.
- All 34 automated tests pass (`node --test tests/b037-themes.test.js` clean).
