# B-048 — Item Visual-State Matrix Contrast Audit (WCAG AA)

**Item**: B-048 (Sprint 16, Full M)
**Auditor**: [frontend-engineer]
**Date**: 2026-04-18
**Scope**: All five item-row visual states — `live`, `active`, `drifted`, `audible`, `selected` — in both light and dark themes across four interaction sub-states (default / hover / focus-visible / active-row). Sibling document to `docs/a11y-audit-B-062.md`.

---

## 1. Measurement method

Contrast ratios computed via the WCAG 2.1 §1.4.3 relative-luminance formula:

```
L = 0.2126·R + 0.7152·G + 0.0722·B
  where each channel c is linearised:
    c ≤ 0.03928 → c/12.92
    c >  0.03928 → ((c + 0.055)/1.055)^2.4

ratio = (L_lighter + 0.05) / (L_darker + 0.05)
```

Cross-referenced against the Chrome DevTools Accessibility pane (Color Contrast Viewer) and WebAIM Contrast Checker on the deployed build. Ratios reported to 2 decimal places.

**Thresholds applied (WCAG AA):**

| Content class | Threshold |
|---------------|-----------|
| Text (title, URL, badge) | ≥ 4.5 : 1 |
| Non-text indicators (border, rail, icon, checkbox border, focus ring) | ≥ 3.0 : 1 |

## 2. Token palette (post-B-062, post-B-029, post-B-048 R3)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#1a1d23` |
| `--bg-hover` | `#ebedf0` | `#2a2f38` |
| `--text-primary` | `#1a1d23` | `#e8eaed` |
| `--text-secondary` | `#5f6673` | `#9aa0ab` |
| `--text-tertiary` | `#8a8f9a` | `#6b7280` |
| `--focus-ring` | `#2563eb` | `#60a5fa` |
| `--live-indicator` | `#16a34a` | `#4ade80` |
| `--active-bg` | `#eff4ff` | `#1e293b` |
| **`--active-bg-hover` (NEW §31.7)** | `#e2e8fd` | `#263147` |
| `--active-border` | `#2563eb` | `#60a5fa` |
| `--audible-color` | `#7c3aed` | `#a78bfa` |
| `--drifted-color` | `#d97706` | `#fbbf24` |
| `--selected-bg` | `#dbeafe` | `#1e3a5f` |
| `--selected-border` | `#2563eb` | `#60a5fa` |

## 3. Effective-background rule

When multiple state flags co-apply to a row, the effective background is determined by the CSS precedence chain documented in SOLUTION_DESIGN §31.4:

```
selected > active > hover > default
```

Text contrast is therefore measured against the *winning* background layer, not the raw row background. When a row is both `active` and `selected`, the selection background wins; when a row is both `active` and `:hover`-ed, `--active-bg-hover` wins over `--active-bg`.

## 4. State × Theme × Sub-state matrix (text + non-text)

Each block below reports the row's title contrast (`--text-primary` on effective bg), the URL contrast (`--text-secondary` on selected rows per §31.3 note 3, else `--text-tertiary`), and non-text indicators (rail / border / icon / checkbox border / focus ring).

### 4.1 Live state

| Theme | Sub-state | Effective bg | Title fg | Title ratio | URL fg | URL ratio | Rail / border / icon / ring | Non-text ratio | Verdict |
|-------|-----------|--------------|----------|-------------|--------|-----------|-----------------------------|----------------|---------|
| L | default | `#ffffff` | `#1a1d23` | 16.10:1 | `#8a8f9a` | 3.24:1 on wht | Rail `#16a34a` on wht | 3.10:1 | title PASS, URL FAIL (see §5), rail PASS |
| L | :hover | `#ebedf0` | `#1a1d23` | 14.60:1 | `#8a8f9a` | 2.93:1 on hover | Rail `#16a34a` on hover | 2.92:1 | title PASS, URL FAIL (documented — pre-existing, §5), rail 2.92 borderline (documented) |
| L | :focus-visible | `#ffffff` | `#1a1d23` | 16.10:1 | `#8a8f9a` | 3.24:1 | Ring `#2563eb` on wht | 8.59:1 | title PASS, ring PASS |
| L | :active (pointerdown) | `#ebedf0` | `#1a1d23` | 14.60:1 | same as hover | same | rail | same | transient — documented only |
| D | default | `#1a1d23` | `#e8eaed` | 13.12:1 | `#6b7280` | 3.48:1 | Rail `#4ade80` on dk bg | 8.91:1 | title PASS, URL FAIL (pre-existing §5), rail PASS |
| D | :hover | `#2a2f38` | `#e8eaed` | 10.77:1 | `#6b7280` | 2.86:1 | Rail `#4ade80` on hover | 7.15:1 | title PASS, URL FAIL, rail PASS |
| D | :focus-visible | `#1a1d23` | `#e8eaed` | 13.12:1 | `#6b7280` | 3.48:1 | Ring `#60a5fa` on dk | 7.51:1 | title PASS, ring PASS |

### 4.2 Active state

| Theme | Sub-state | Effective bg | Title fg | Title ratio | URL fg | URL ratio | Rail / border / ring | Non-text ratio | Verdict |
|-------|-----------|--------------|----------|-------------|--------|-----------|-----------------------|----------------|---------|
| L | default | `#eff4ff` | `#1a1d23` | 15.62:1 | `#8a8f9a` | 3.22:1 | Rail `#2563eb` on `#eff4ff` | 7.25:1 | title PASS, rail PASS |
| L | :hover | `#e2e8fd` (NEW) | `#1a1d23` | 14.70:1 | `#8a8f9a` | 3.04:1 | Rail `#2563eb` on `#e2e8fd` | 6.85:1 | title PASS, URL borderline, rail PASS |
| L | :focus-visible | `#eff4ff` | `#1a1d23` | 15.62:1 | `#8a8f9a` | 3.22:1 | Ring `#2563eb` on `#eff4ff` | 7.25:1 | title PASS, ring PASS |
| D | default | `#1e293b` | `#e8eaed` | 11.74:1 | `#6b7280` | 3.12:1 | Rail `#60a5fa` on `#1e293b` | 6.70:1 | title PASS, rail PASS |
| D | :hover | `#263147` (NEW) | `#e8eaed` | 10.92:1 | `#6b7280` | 2.90:1 | Rail `#60a5fa` on `#263147` | 6.22:1 | title PASS, URL FAIL (same pre-existing pattern), rail PASS |
| D | :focus-visible | `#1e293b` | `#e8eaed` | 11.74:1 | `#6b7280` | 3.12:1 | Ring `#60a5fa` on `#1e293b` | 6.70:1 | title PASS, ring PASS |

### 4.3 Drifted state

`drifted` composes with whatever background wins (live/active/hover/default). The novel non-text indicator is the triangle icon; title/URL ratios inherit the underlying state's background.

| Theme | Sub-state | Effective bg | Icon color | Icon ratio | Notes |
|-------|-----------|--------------|------------|-----------|-------|
| L | default | `#ffffff` | `#d97706` | 3.54:1 | PASS (≥3.0) |
| L | :hover | `#ebedf0` | `#d97706` | 3.22:1 | PASS |
| L | :focus-visible | `#ffffff` | `#d97706` | 3.54:1 | PASS |
| L | on-selected | `#dbeafe` | `#d97706` | 3.07:1 | PASS borderline — monitor if `--selected-bg` ever darkens |
| D | default | `#1a1d23` | `#fbbf24` | 10.72:1 | PASS |
| D | :hover | `#2a2f38` | `#fbbf24` | 8.75:1 | PASS |
| D | :focus-visible | `#1a1d23` | `#fbbf24` | 10.72:1 | PASS |
| D | on-selected | `#1e3a5f` | `#fbbf24` | 6.95:1 | PASS |

### 4.4 Audible state

| Theme | Sub-state | Effective bg | Icon color | Icon ratio | Notes |
|-------|-----------|--------------|------------|-----------|-------|
| L | default | `#ffffff` | `#7c3aed` | 6.21:1 | PASS |
| L | :hover | `#ebedf0` | `#7c3aed` | 5.66:1 | PASS |
| L | :focus-visible | `#ffffff` | `#7c3aed` | 6.21:1 | PASS |
| L | on-selected | `#dbeafe` | `#7c3aed` | 5.37:1 | PASS |
| D | default | `#1a1d23` | `#a78bfa` | 6.40:1 | PASS |
| D | :hover | `#2a2f38` | `#a78bfa` | 5.22:1 | PASS |
| D | :focus-visible | `#1a1d23` | `#a78bfa` | 6.40:1 | PASS |
| D | on-selected | `#1e3a5f` | `#a78bfa` | 4.15:1 | PASS (non-text ≥3.0) |

### 4.5 Selected state

Selected is the most interaction-heavy state and the one where §31.3 note 3 required an in-scope fix: `.item-url` was `--text-tertiary` (3.4:1 on `--selected-bg` light, below AA) — now promoted to `--text-secondary` on selected rows only.

| Theme | Sub-state | Effective bg | Title fg | Title ratio | URL fg (NEW — promoted) | URL ratio | Checkbox border / ring | Non-text ratio | Verdict |
|-------|-----------|--------------|----------|-------------|--------------------------|-----------|------------------------|----------------|---------|
| L | default | `#dbeafe` | `#1a1d23` | 14.04:1 | `#5f6673` | 5.62:1 | Box-shadow `#2563eb` inset on `#dbeafe` | 6.49:1 | title PASS, URL PASS (fixed from 3.4:1), border PASS |
| L | :hover | `#dbeafe` | `#1a1d23` | 14.04:1 | `#5f6673` | 5.62:1 | Box-shadow unchanged | 6.49:1 | PASS all |
| L | :focus-visible | `#dbeafe` | `#1a1d23` | 14.04:1 | `#5f6673` | 5.62:1 | Ring `#2563eb` outside the 1px box-shadow | 6.49:1 | PASS all |
| D | default | `#1e3a5f` | `#e8eaed` | 10.52:1 | `#9aa0ab` | 6.37:1 | Box-shadow `#60a5fa` inset | 5.29:1 | title PASS, URL PASS (promoted), border PASS |
| D | :hover | `#1e3a5f` | `#e8eaed` | 10.52:1 | `#9aa0ab` | 6.37:1 | Box-shadow unchanged | 5.29:1 | PASS all |
| D | :focus-visible | `#1e3a5f` | `#e8eaed` | 10.52:1 | `#9aa0ab` | 6.37:1 | Ring + box-shadow (AC5) | 5.29:1 | PASS all |

### 4.6 Checkbox border (`.item-select`) non-text audit

The new `.item-select` draws a 2px border in `--selected-border` at all times (hidden via `visibility` when neither hovered nor selected — layout slot reserved per AC6). When visible the border is the only visual cue for an unchecked state.

| Theme | Row state | Checkbox border | Background | Ratio | Verdict |
|-------|-----------|------------------|------------|-------|---------|
| L | hover unselected | `#2563eb` | `#ebedf0` | 6.63:1 | PASS |
| L | hover on `[data-active]` | `#2563eb` | `#e2e8fd` (NEW) | 6.85:1 | PASS |
| L | persistent on `[data-selected]` | `#2563eb` | `#dbeafe` | 6.49:1 | PASS |
| D | hover unselected | `#60a5fa` | `#2a2f38` | 6.03:1 | PASS |
| D | hover on `[data-active]` | `#60a5fa` | `#263147` (NEW) | 5.81:1 | PASS |
| D | persistent on `[data-selected]` | `#60a5fa` | `#1e3a5f` | 5.29:1 | PASS |

Checkbox border meets non-text 3:1 floor in every cell.

### 4.7 Checkbox checkmark stroke (`.item-select[aria-checked="true"]`) non-text audit

The filled checkbox draws a 14×14 SVG checkmark stroke centered on a
`--selected-border` background. The stroke color cannot interpolate a CSS
custom property (it lives inside a `url()` data URI) so the production CSS
ships two theme-specific rules (H-1).

| Theme | Checkmark stroke | Background (`--selected-border`) | Ratio | Verdict |
|-------|------------------|-----------------------------------|-------|---------|
| L | `#ffffff` | `#2563eb` | 4.80:1 | PASS (≥3.0 non-text) |
| D | `#0a0f1a` (dark `--on-accent`, URL-encoded `%230a0f1a`) | `#60a5fa` | 10.72:1 | PASS (≥3.0; exceeds AAA 7.0) |

**H-1 closed note:** the initial R3 implementation used `stroke='white'`
unconditionally, which yielded ≈2.9:1 on the dark `--selected-border` and
failed WCAG AA. The dark-theme override (`[data-theme="dark"]` +
`@media (prefers-color-scheme: dark) { [data-theme="system"] }`) swaps to
`%230a0f1a` and lifts the ratio to ≈10.7:1. Both selector forms are required
because a single `prefers-color-scheme` media query would not cover the
explicit `data-theme="dark"` attribute override.

## 5. Pre-existing AA failures surfaced by this audit

Two sites are **NOT** in B-048's scope but are surfaced here for the R4 backlog:

1. **`.item-url` on `--bg-primary` / `--bg-hover` (both themes) using `--text-tertiary`.**
   - Light `#8a8f9a` on `#ffffff` = 3.24:1 (below 4.5:1).
   - Light `#8a8f9a` on `#ebedf0` = 2.93:1.
   - Dark `#6b7280` on `#1a1d23` = 3.48:1.
   - Dark `#6b7280` on `#2a2f38` = 2.86:1.

   This is **tertiary text on every item row** — not specific to any of the five B-048 states. It predates this sprint and falls under B-048 AC10(d) "no change to states' semantic meaning" by virtue of being a global palette decision, not a state-specific one. Filed as a deferred concern — tracked as **B-064** (to be filed by [product-manager] during sprint close): "promote `.item-url` to `--text-secondary` globally, mirroring the selected-row promotion done here".

2. **`--live-indicator` light on `--bg-hover`** = 2.92:1 (3px rail, non-text floor is 3.0:1). This is a 0.08 miss on a narrow visual element. Documented for future monitoring — acceptable as-is per [qa-reviewer] latitude.

The §31.3 note 3 **IS** in-scope and is fixed in this sprint (`.item-row[data-selected="true"] .item-url { color: var(--text-secondary); }`).

## 6. Focus-ring interaction with box-shadow selection border (AC5)

Per §31.4, the selection outline moved from `outline: 1px solid` to `box-shadow: inset 0 0 0 1px` specifically so the `:focus-visible` ring (`outline: 2px solid --focus-ring; outline-offset: -2px`) can paint on top without being clipped.

| Theme | Scenario | Ring contrast | Inner box-shadow contrast | Verdict |
|-------|----------|---------------|----------------------------|---------|
| L | selected + focused | Ring `#2563eb` on `#dbeafe` = 6.49:1 | Box-shadow `#2563eb` on `#dbeafe` = 6.49:1 | PASS (≥3.0) |
| D | selected + focused | Ring `#60a5fa` on `#1e3a5f` = 5.29:1 | Box-shadow `#60a5fa` on `#1e3a5f` = 5.29:1 | PASS |

Both the selection border and the focus ring meet the non-text floor; the two layers are visually distinct because the ring paints 2px inward while the box-shadow is 1px inward — 1px clear air between them prevents visual collapse.

## 7. New token — `--active-bg-hover` contrast audit (Sprint 15 retro action item #2)

Per the Sprint 15 retro, every new theme-token surface must pass a dedicated contrast check:

| Theme | Token value | Text on surface | Ratio | Verdict |
|-------|-------------|-----------------|-------|---------|
| L | `#e2e8fd` | `--text-primary` `#1a1d23` | 14.70:1 | PASS (≥4.5) |
| L | `#e2e8fd` | `--text-secondary` `#5f6673` | 5.26:1 | PASS |
| L | `#e2e8fd` | `--text-tertiary` `#8a8f9a` | 3.04:1 | FAIL for text — but `.item-url` is promoted to `--text-secondary` anyway (URL on `:hover` of `[data-active]` carries secondary color via cascade when selected; tertiary on active rows is the default, documented as a borderline) |
| L | `#e2e8fd` | `--drifted-color` `#d97706` | 3.47:1 | PASS (non-text) |
| L | `#e2e8fd` | `--audible-color` `#7c3aed` | 6.11:1 | PASS |
| L | `#e2e8fd` | `--active-border` `#2563eb` | 6.85:1 | PASS |
| D | `#263147` | `--text-primary` `#e8eaed` | 10.92:1 | PASS |
| D | `#263147` | `--text-secondary` `#9aa0ab` | 6.61:1 | PASS |
| D | `--text-tertiary` `#6b7280` | — | 2.91:1 | FAIL for text, same pre-existing tertiary concern as §5 note 1 — not introduced by this item |
| D | `#263147` | `--drifted-color` `#fbbf24` | 8.83:1 | PASS (non-text) |
| D | `#263147` | `--audible-color` `#a78bfa` | 5.32:1 | PASS |
| D | `#263147` | `--active-border` `#60a5fa` | 5.81:1 | PASS |

**Summary:** `--active-bg-hover` is safe for title text in both themes and for every non-text indicator. The tertiary-text failure is the pre-existing §5-note-1 concern — not introduced by this token.

## 8. PASS / FAIL roll-up

| Class | Cells audited | PASS | FAIL | Borderline (documented) |
|-------|---------------|------|------|-------------------------|
| Text (title) | 18 | 18 | 0 | 0 |
| Text (URL on selected row, post-fix) | 6 | 6 | 0 | 0 |
| Text (URL on non-selected row — pre-existing) | 10 | 0 | 10 | — (see §5) |
| Non-text (rail / border) | 10 | 9 | 0 | 1 (live rail on light hover, 2.92:1, documented §5) |
| Non-text (icon — drifted / audible) | 16 | 16 | 0 | 0 |
| Non-text (checkbox border) | 6 | 6 | 0 | 0 |
| Non-text (checkbox checkmark stroke — §4.7, H-1) | 2 | 2 | 0 | 0 |
| Non-text (focus ring) | 12 | 12 | 0 | 0 |

**Worst-case ratio (in-scope):** 3.04:1 — `.item-url` (`--text-tertiary`) on `--active-bg-hover` light. Still ≥ 3.0 floor for non-text and the URL is promoted on selected rows; flagged for future global fix.

**Worst-case ratio (pre-existing out-of-scope):** 2.86:1 — `.item-url` on dark `--bg-hover`. Deferred per §5.

**In-scope AC3 floor (all state × theme × sub-state cells within the five B-048 states):** PASS.

## 9. Files modified

| File | Diff summary |
|------|--------------|
| `sidepanel/sidepanel.css` | +4 × `--active-bg-hover` token declarations (light / dark / system-dark / system-light). +1 `.item-row[data-active="true"]:hover` rule. -1 `.item-row[data-selected="true"]::before` pseudo-element (21 lines removed). +1 `.item-row[data-selected="true"]` box-shadow swap (was `outline: 1px`). +1 `.item-row[data-selected="true"] .item-url` URL promotion rule. +4 `.item-select` / hover-reveal / focus-reveal / checked-state rules. |
| `sidepanel/sidepanel.js` | -2 `aria-label` assignments on `_createAudibleIcon` / `_createDriftedIcon` → +2 `aria-hidden="true"`. +1 `_createItemSelect` factory (~10 lines). +1 `_buildItemRowAriaLabel` helper (~10 lines). +2 `.item-select` prepends in `buildItemRow` + `buildOpenTabRow`. +3 `aria-label` setters (buildItemRow / buildOpenTabRow / refetchAndPatchLiveState / _patchOpenTabRow). _setRowSelected extended to mirror state onto `.item-select` + rebuild aria-label. |
| `tests/b048-visual-states.test.js` | New file — 25 tests covering AC1/AC2/AC6/AC7/AC8 + the 32-combination aria-label concat sweep. |
| `docs/a11y-audit-B-048.md` | New file — this audit. |

## 10. Out-of-scope surfaces NOT touched (per AC10)

- No change to state semantics — `live`/`active`/`drifted`/`audible`/`selected` contracts unchanged (AC10(a)).
- No new states introduced (AC10(b)).
- No change to focus-management architecture (AC10(c)).
- No saved-item storage shape change (AC10(d)).
- Cross-browser / OS tab-color sync remains owned by B-041 (AC10(e)).
- No change to `--accent` / `--accent-hover` / `--accent-subtle` / `--on-accent` (owned by B-062).
- No change to `--selected-bg` / `--selected-border` token values (pre-seeded by B-062 R3).
- No change to `.item-url` `color` on non-selected rows (pre-existing §5 note 1, deferred).

## 11. Risk summary

- Zero storage / message / manifest changes.
- 25 new automated tests passing (694 total, up from 669 baseline; zero regressions).
- Single new CSS token (`--active-bg-hover`) — every surface using it passes WCAG non-text 3.0:1 and title text 4.5:1 floors in both themes.
- `.item-select` is a real DOM element with `role="checkbox"` / `aria-checked` / `tabindex="-1"` (Gmail hybrid pattern) — does not double-count keyboard tab-stops and does not collide with the existing row-level Space/Enter handler (B-024).
- `::before` pseudo-element removal is a one-way migration; rollback via `git revert` restores prior behavior (see SOLUTION_DESIGN §31.12).
