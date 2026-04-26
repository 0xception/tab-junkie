# UAT Plan — B-104 Themed Group Color System

Sprint 34 · Full (M) · R5 UAT plan (authored by [test-engineer])

Related artefacts:

- `docs/BACKLOG.md` — B-104 row (9 acceptance criteria; R1 LOCKED 2026-04-25)
- `docs/design/47-b-104-themed-group-colors.md` — R2 design chapter (D-1..D-5 + C-1..C-12 + §47.5 C-9 empty-state enumeration + §47.7 WCAG spot-check matrix)
- `docs/SPRINT.md` — Sprint 34 active item (R3 + R3-fix + R4 handoff notes)
- `docs/findings/sprint-34.md` — R4 deduped findings (3 HIGH all closed in R3-fix; 4 MEDIUM partial; 8 LOW deferred or absorbed)
- `tests/b104-group-colors.test.js` — 9 automated tests (T1..T9 covering AC1..AC3, AC6, plus R4 H-1 / H-2 regression guards)
- `shared/themes.css` — 153 `--gc-*` declarations across 17 palette blocks; `--group-header-tint-amount: 0%` override on `[data-theme="solarized-light"]`
- `sidepanel/sidepanel.js` — synthetic `__ungrouped__` group with `color: null`; inline `--group-header-color` injection guarded by `GROUP_COLORS.includes(...)`
- `sidepanel/sidepanel.css` — `.group-header` + `.group-header:hover` recipes consume `var(--group-header-tint-amount, 12%)`
- `newtab/newtab.css` — analogous tint formula on `.newtab-group-header` + `.newtab-group-header:hover`
- `popup/group-jump-popup.css` + `popup/group-jump-popup.js` — D-2 Option C (`[data-color="<slot>"]` selectors + `chip.dataset.color` injection)
- `docs/UAT_B-101.md` — sister UAT plan (B-101 dotted drift bar) — same Sprint 34 wave; structural template

## Preconditions

1. Extension loaded unpacked from `feature/sprint-34-visual-polish` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser per user environment). Re-run UAT-1 / UAT-3 in Chrome as a spot check (cross-browser parity for the `color-mix` recipe).
3. Fixture: a non-empty bookmarks collection containing AT LEAST four groups with distinct colors — for example: a `red` group, a `blue` group, a `slate` group, and a `yellow` group. If you don't have four colored groups handy, create them via the sidepanel's "+ Group" button before starting UAT-1.
4. Fixture: AT LEAST one Ungrouped item (any saved bookmark NOT assigned to a group) so the synthetic Ungrouped section renders.
5. DevTools open on the sidepanel (right-click sidepanel → Inspect) so you can inspect `.group-header` elements + computed `background` value + the inline `--group-header-color` style on each header.
6. (UAT-7 only) A WCAG contrast checker available — Edge DevTools' built-in "Inspect element → Accessibility → Contrast" affordance, or a browser extension like "WCAG Contrast Checker", or `https://webaim.org/resources/contrastchecker/`.

**C-1 stale-SW note (per CLAUDE.md B-094 extension):** B-104 introduces zero new pref keys, zero new manifest entries, zero storage schema changes, zero `DEFAULT_PREFERENCES` additions. The C-1 verdict in §47.5 is N/A — no extension toggle OFF/ON cycle is required after the update lands. Load the extension once and proceed. Theme switching via Settings is a pure CSS-cascade event (B-037 mechanism); no SW message-traffic gating involved.

**Out-of-scope (per AC9 — do not test):** (a) `--drifted-color` token or B-101 drift bar (separate item, separate UAT plan); (b) `.group-header[data-active]` active-row treatment (untouched by B-104); (c) group create/edit dialog flow / field set / validation logic beyond the picker swatch CSS reference (AC3 only); (d) drift detection logic in `background/tabs/drift.js`; (e) any new pref keys, manifest entries, message types (none introduced); (f) `GROUP_COLORS` allow-list contents or `validateGroup` validation in `background/storage/groups.js` (untouched). If anomalies in those surfaces appear during UAT, file as new icebox rows — do NOT amend B-104.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Sidepanel header tinting (AC1)

#### UAT-1: Sidepanel — colored groups render with full-bleed tinted headers across themes — Priority: B

**Given** the sidepanel is open AND I have AT LEAST one `red` group and one `blue` group containing items.
**When** I observe the rendered group headers in the sidepanel.
**Then** each colored group's header shows a low-opacity full-bleed tint of its slot color (NOT just the small chip):
  - the `red` group header reads as a subtly red-tinted strip,
  - the `blue` group header reads as a subtly blue-tinted strip,
  - the small `.group-color-chip` (10×10 px) is also visible inside the header (retained per R2 recommendation).
**Then** I switch theme via Settings → Theme to a flagship hand-curated theme: try `dracula` (dark) AND `github-light` (light). The `red` group's tint shifts to Dracula's red (`#ff5555` family) under Dracula and GitHub's red (`#cf222e` family) under GitHub Light. The `blue` group similarly shifts to each theme's harmonized blue.
**Expected**: DevTools Elements panel on a colored `.group-header` shows `style="--group-header-color: var(--gc-red);"` (or the slot for the group). Computed style: `background: rgb(...)` matching the `color-mix` of the resolved slot at 12% over `var(--bg-secondary)`. Theme switch propagates without re-render — purely CSS cascade.

---

### Newtab header tinting (AC1)

#### UAT-2: Newtab — colored groups render with tinted headers — Priority: H

**Given** the newtab override is enabled (Settings → "Override new tab page") OR I open `newtab/newtab.html` directly via `edge://extensions` Service Worker DevTools URL.
**When** I open a new tab AND observe the rendered group headers.
**Then** each colored group's `.newtab-group-header` shows a low-opacity full-bleed tint of its slot color (analogous to the sidepanel — same recipe, same tint amount, blended over `--bg-primary` instead of `--bg-secondary`).
**Then** I hover one of the colored group headers — the hover state remains tinted (does NOT wipe to a flat `--bg-hover`); the blend base shifts from `--bg-primary` to `--bg-hover` so the tint identity persists across hover/non-hover transitions.
**Expected**: DevTools Elements panel on a colored `.newtab-group-header` shows the same `--group-header-color` inline-style pattern as sidepanel. Computed `background` resolves the `color-mix` recipe correctly. Hover preserves tint without visual jump.

---

### Group-jump popup chip rendering (AC1 — D-2 latent-bug closure)

#### UAT-3: Group-jump popup — color chips render correct theme-resolved color for ALL 9 slots (incl. previously-broken slate/teal/indigo) — Priority: H

**Given** the extension is loaded AND I have groups assigned to a variety of slots — at minimum: one `slate`, one `teal`, one `indigo` group (the three that previously fell through to `--color-avatar-bg` in the popup before D-2).
**When** I open the group-jump popup via the keyboard shortcut (Ctrl+Shift+G or whatever's bound — see `manifest.json`).
**Then** EACH group row in the popup shows its color chip filled with the correct per-theme slot color:
  - `slate` chip is the theme's slate (NOT the avatar-bg fallback grey),
  - `teal` chip is the theme's teal,
  - `indigo` chip is the theme's indigo,
  - `red` / `blue` / `green` / `purple` / `orange` / `pink` / `yellow` chips are also correctly colored.
**Then** I switch theme (Settings → Theme → another theme) AND re-open the popup. ALL chips re-render in the new theme's slot colors automatically (CSS cascade only; no JS re-render needed).
**Expected**: DevTools Elements panel on each chip shows `<span class="gj-color-chip" data-color="<slot>" ...>`. Computed `background-color` reads `var(--gc-<slot>)` resolving to the per-theme hex. The pre-D-2 `style="--gj-group-color: slate"` raw-slot-name pattern MUST be ABSENT (closed latent bug per §47.3 D-2).

---

### Picker swatches consume tokens (AC3)

#### UAT-4: Group color picker swatches reflect the active theme's resolved colors (and re-skin on theme switch) — Priority: H

**Given** the sidepanel is open AND I am on a theme like `github-light` (a hand-curated flagship).
**When** I click "+ Group" (or right-click an existing group → "Edit") to open the create/edit group dialog.
**Then** the 9 color picker swatches show the active theme's resolved slot colors — `red` swatch is GitHub Light's red, `blue` is GitHub Light's blue, etc. (NOT the canonical `#dc2626` / `#2563eb` hex from the pre-B-104 hardcoded values).
**Then** without closing the dialog, I switch theme via Settings → Theme to `dracula`. The dialog's swatches re-skin to Dracula's resolved slot colors WITHOUT re-opening the dialog (CSS cascade).
**Expected**: DevTools Elements panel on a swatch shows `<button class="group-color-swatch group-color-red" ...>`. Computed `background-color` reads `var(--gc-red)` resolving to the active-theme hex. After theme swap, the same swatch's computed `background-color` reads the new theme's hex without any DOM mutation.

---

### Ungrouped section regression (R4 H-2 closure)

#### UAT-5: Ungrouped section header has NO color tint, regardless of theme — Priority: B

**(R4 qa-reviewer HIGH H-2 — the synthetic `__ungrouped__` group must NOT receive the slate tint that pre-fix versions injected.)**

**Given** my fixture contains at least one Ungrouped item AND the sidepanel is rendering normally.
**When** I locate the "Ungrouped" section header at the bottom of the sidepanel collection.
**Then** the Ungrouped header renders with NO color tint — its background is the bare `var(--bg-secondary)` (or whatever neutral surface the active theme uses), NOT a slate-tinted strip.
**Then** I switch theme to `solarized-light`, then to `dracula`, then to `github-light`. In every theme, the Ungrouped header remains untinted (matches the pre-B-104 visual baseline).
**Expected**: DevTools Elements panel on the Ungrouped `.group-header` shows NO inline `--group-header-color` style attribute (the `GROUP_COLORS.includes(null)` guard skipped the injection). Computed `background` resolves to the `transparent` fallback in the `color-mix` recipe → effectively just `var(--bg-secondary)`. The Ungrouped section reads visually identical to its pre-B-104 baseline.

---

### Theme switch propagation across all surfaces (AC1 + AC3 cascade verification)

#### UAT-6: Theme switch live-broadcasts tint updates across sidepanel + newtab + popup WITHOUT page reload — Priority: H

**Given** I have the sidepanel open AND a newtab page open in another tab AND (if possible) the group-jump popup ready to invoke.
**When** I change theme in Settings (Settings → Theme → switch from current to a different one — try `solarized-light` → `dracula` for a maximally distinct swap).
**Then** within ~500 ms the sidepanel's group header tints AND the newtab's group header tints update to the new theme's resolved slot colors WITHOUT any visible re-render flash, page reload, or row-DOM mutation. The picker swatches (if a dialog is open) and the group-jump popup chips (if open) also update via CSS cascade.
**Then** I open the group-jump popup AFTER the theme swap — chips render with the post-swap theme's colors immediately on first paint.
**Expected**: DevTools Network tab shows zero new fetches during the swap. DevTools Elements panel: `<html data-theme="...">` attribute changes; the `--gc-<slot>` token values cascade automatically through every `var(--gc-<slot>)` consumer. No JS broadcast specific to B-104 (the existing B-037 theme-broadcast is the carrier).

---

### WCAG AA spot-check (AC5 — recommended, optional if no contrast tool)

#### UAT-7: WCAG AA spot-check on 5 representative (theme, color) combinations — Priority: M

**Given** I have a WCAG contrast checker available (Edge DevTools' built-in Accessibility → Contrast affordance, a browser extension, or webaim.org).
**When** I measure body text contrast (`var(--text-primary)`) against the tinted group header background for each of the 5 representative combinations from §47.7:

| # | Theme | Group color | Expected ratio | Notes |
|---|-------|-------------|----------------|-------|
| a | `solarized-light` | `yellow` | ≥ 4.39:1 (matches bare `--bg-secondary` baseline) | R4 H-1: 0% tint override → baseline contrast unchanged. PASS gate is "no worse than untinted". |
| b | `github-light` | `blue` | ≥ 4.5:1 | Hand-curated flagship; should comfortably clear AA. |
| c | `dracula` | `red` | ≥ 4.5:1 | Hand-curated flagship; dark theme + Dracula red. |
| d | `one-dark` | `slate` | ≥ 4.5:1 | Hand-curated flagship; muted slate tint. |
| e | `nord` | `purple` | ≥ 4.5:1 | Algorithmic theme; sanity-check the recipe. |

**Then** every measured ratio meets or exceeds 4.5:1 (the AA threshold for normal-size body text).
**Expected**: All 5 measurements PASS. If (a) `solarized-light + yellow` measures 4.39:1 (the bare baseline), record it as PASS-with-note — the 0% tint override means the tinted bg equals the untinted bg, so the metric is the underlying theme baseline, not a B-104 regression. The pre-existing solarized-light `--text-primary` 4.39:1 defect is a separate follow-up flagged for product-owner triage (NOT a B-104 blocker).

**Skip condition**: If no contrast tool is handy, skip UAT-7 and rely on the static-token T7 + R3-fix's algebraic computation for solarized-light. Mark as SKIP in the results, NOT FAIL.

---

## Pass criteria

- All B-priority cases (UAT-1, UAT-5) PASS.
- All H-priority cases (UAT-2, UAT-3, UAT-4, UAT-6) PASS or have one documented FAIL with rationale.
- UAT-7 PASS or SKIP (with note); a hard FAIL on UAT-7 (4 of 5 ratios below 4.5:1) routes back to [frontend-engineer] for token re-tuning. A single-row FAIL on (a) `solarized-light + yellow` is acceptable per the 0%-tint-baseline note above.

A single FAIL on any B-priority case blocks the sprint close — route back to [frontend-engineer] for fix, do NOT mark B-104 done.

## Out of scope (per AC9 — do not test)

- B-101 dotted drift bar / `--drifted-color` (separate Sprint 34 item, separate UAT plan).
- `.group-header[data-active]` active-row treatment / `--active-bg` / `--active-border` tokens.
- Group create/edit dialog flow, field set, or validation logic beyond the picker swatch CSS reference (AC3 only).
- Drift detection logic in `background/tabs/drift.js`.
- Any new pref keys, manifest entries, message types (none introduced).
- `GROUP_COLORS` allow-list contents or `validateGroup` validation in `background/storage/groups.js` (untouched).

If anomalies in the above surfaces appear during UAT, file as new icebox rows — do NOT amend B-104.

---

## R4 finding closure status (carried into UAT)

- **HIGH H-1 (solarized-light WCAG AA)** — closed in R3-fix via `--group-header-tint-amount: 0%` override; UAT-7 row (a) re-measures the bare baseline.
- **HIGH H-2 (Ungrouped slate-tint leak)** — closed in R3-fix via `color: null` on synthetic group; UAT-5 is the regression check.
- **HIGH H-3 (hover compounds H-1)** — closed in R3-fix via the same per-theme tint variable consumed by `:hover` rule; UAT-2's hover step re-validates.
- **MEDIUM M-1 (hover uses --bg-hover)** — accepted as documented deviation; R6 As-Built notes.
- **MEDIUM M-2 (atom-one-dark algorithmic mismatch with one-dark hand-curated)** — DEFERRED to R6: [solution-architect] should promote atom-one-dark to hand-curated by copying one-dark's 9 values (the two themes share `--bg-secondary` per R3 handoff). Not a blocker — current values still PASS contrast.
- **MEDIUM M-3 (R2 §47.3 D-5 baseline error)** — R6 As-Built corrects the §47.3 walkthrough numbers (4.39:1 actual, not 7.21:1 claimed) and §47.5 row 19.
- **MEDIUM M-4 (newtab hover parity)** — closed in R3-fix via Option A (added `.newtab-group-header:hover` rule); T4 covers it.
- **LOW** findings (8): all deferred or absorbed per `docs/findings/sprint-34.md`. T9 covers LOW #5 (defense-in-depth import). LOW #4 (Dracula/one-dark intentional collisions) is documentation-only and noted in the R6 As-Built.
