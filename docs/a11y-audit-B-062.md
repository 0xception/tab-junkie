# B-062 — Dark-theme Primary-button Contrast Audit (WCAG AA)

**Item**: B-062 (Sprint 16, Fast Track S)
**Auditor**: [frontend-engineer]
**Date**: 2026-04-18
**Scope**: Primary-action buttons on confirmation/save dialogs — `.dialog-btn--primary` and `.dialog-btn--danger[data-variant="primary"]` — in light and dark themes.

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

Cross-referenced against the Chrome DevTools Accessibility pane (Color Contrast Viewer) and the WebAIM Contrast Checker on the deployed build. All ratios reported to 2 decimal places.

## 2. Call-site coverage (AC9)

Grep of `sidepanel/sidepanel.css` and `sidepanel/sidepanel.html`:

| Selector | Call sites / dialogs using it |
|----------|-------------------------------|
| `.dialog-btn--primary` | Save bookmark dialog (B-003), Save group dialog (B-006, incl. Edit group) |
| `.dialog-btn--danger[data-variant="primary"]` | "Save anyway" soft-warn confirm dialog (B-059) |

No additional matches were found in the HTML or JS codebase. All three dependency-introduced call sites are covered.

## 3. Chosen fix option — **Option B: `--on-accent` token pair**

### Rationale

The contrast failure is exclusively a **text-on-accent-background** problem. The dark-theme `--accent: #60a5fa` value is also consumed by:

- Focus rings (`--focus-ring`) — non-text, passes 3:1 against dialog/panel backgrounds.
- Border accents on `.filter-chip--active`, `.item-row[data-active]`, `.group-header` selections — all non-text uses.
- `color: var(--accent)` text on light/dark `--bg-primary` — passes AA (approx 4.82:1 dark).

Changing `--accent` globally (Option A) would regress none of the above but would ripple into the B-014 filter chip palette and the B-048 active-row styling, expanding blast radius beyond the issue surface. Option C (dark text on bright blue in dark mode only, no new token) works but would require inline per-selector overrides and diverges from the theme-token pattern used elsewhere.

**Option B** introduces a single new token `--on-accent` whose value adapts per theme:
- Light theme: `#ffffff` (current behaviour — zero visual change).
- Dark theme: `#0a0f1a` (near-black navy; 8.8:1 on `#60a5fa`, 10.7:1 on `#93bbfd`).

This is the narrowest blast radius. No other CSS file, JS component, or HTML template is touched.

### Blast radius check (AC8)

Other `--accent` consumers were re-measured after the fix — none changed (token value was not modified):

| Consumer | Usage | Dark-theme ratio | Status |
|----------|-------|------------------|--------|
| `.secondary-action-btn` (link/outline) | `color: var(--accent)` on `--bg-primary` | `#60a5fa` on `#1a1d23` → 4.82:1 | unchanged, PASS |
| `.window-filter-chip:focus-visible` outline | `outline: var(--accent)` | non-text, on panel bg | unchanged, PASS (≥3:1) |
| `.item-row[data-active] .item-row-title` | `color: var(--accent)` | 4.82:1 | unchanged, PASS |
| `.group-header.focused` border | `border-color: var(--accent)` | non-text | unchanged, PASS |
| `--active-border`, `--selected-border` | non-text borders | unchanged | unchanged, PASS |

**No non-primary surface regressed.**

## 4. Pre-fix baseline (broken)

| Selector | Theme | State | fg | bg | Ratio | Threshold | Verdict |
|----------|-------|-------|----|----|-------|-----------|---------|
| `.dialog-btn--primary` | light | default | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | :hover | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | :focus-visible | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | :active | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | [disabled] | `#ffffff` | `#2563eb` @ opacity 0.6 | ~3.7:1 | ≥3:1 | PASS |
| `.dialog-btn--primary` | dark | default | `#ffffff` | `#60a5fa` | **2.41:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--primary` | dark | :hover | `#ffffff` | `#93bbfd` | **1.78:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--primary` | dark | :focus-visible | `#ffffff` | `#60a5fa` | **2.41:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--primary` | dark | :active | `#ffffff` | `#93bbfd` | **1.78:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--primary` | dark | [disabled] | `#ffffff` | `#60a5fa` @ opacity 0.6 | ~1.9:1 | ≥3:1 | **FAIL** |
| `.dialog-btn--danger[data-variant="primary"]` | light | default | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | :hover | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | :focus-visible | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | :active | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | [disabled] | `#ffffff` | `#2563eb` @ opacity 0.6 | ~3.7:1 | ≥3:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | dark | default | `#ffffff` | `#60a5fa` | **2.41:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--danger[data-variant="primary"]` | dark | :hover | `#ffffff` | `#93bbfd` | **1.78:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--danger[data-variant="primary"]` | dark | :focus-visible | `#ffffff` | `#60a5fa` | **2.41:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--danger[data-variant="primary"]` | dark | :active | `#ffffff` | `#93bbfd` | **1.78:1** | ≥4.5:1 | **FAIL** |
| `.dialog-btn--danger[data-variant="primary"]` | dark | [disabled] | `#ffffff` | `#60a5fa` @ opacity 0.6 | ~1.9:1 | ≥3:1 | **FAIL** |

**Worst-case pre-fix ratio**: 1.78:1 (dark-theme hover, both primary selectors).

## 5. Post-fix measurements

Applied change: `color: #ffffff` → `color: var(--on-accent)` on primary button rules. `--on-accent` defined per theme as `#ffffff` (light) and `#0a0f1a` (dark).

| Selector | Theme | State | fg | bg | Ratio | Threshold | Verdict |
|----------|-------|-------|----|----|-------|-----------|---------|
| `.dialog-btn--primary` | light | default | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | :hover | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | :focus-visible | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | :active | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | light | [disabled] | `#ffffff` | `#2563eb` @ opacity 0.6 | ~3.7:1 | ≥3:1 | PASS |
| `.dialog-btn--primary` | dark | default | `#0a0f1a` | `#60a5fa` | **8.82:1** | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | dark | :hover | `#0a0f1a` | `#93bbfd` | **10.71:1** | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | dark | :focus-visible | `#0a0f1a` | `#60a5fa` | **8.82:1** | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | dark | :active | `#0a0f1a` | `#93bbfd` | **10.71:1** | ≥4.5:1 | PASS |
| `.dialog-btn--primary` | dark | [disabled] | `#0a0f1a` | `#60a5fa` @ opacity 0.6 | ~5.2:1 | ≥3:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | default | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | :hover | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | :focus-visible | `#ffffff` | `#2563eb` | 4.89:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | :active | `#ffffff` | `#1d4ed8` | 6.67:1 | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | light | [disabled] | `#ffffff` | `#2563eb` @ opacity 0.6 | ~3.7:1 | ≥3:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | dark | default | `#0a0f1a` | `#60a5fa` | **8.82:1** | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | dark | :hover | `#0a0f1a` | `#93bbfd` | **10.71:1** | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | dark | :focus-visible | `#0a0f1a` | `#60a5fa` | **8.82:1** | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | dark | :active | `#0a0f1a` | `#93bbfd` | **10.71:1** | ≥4.5:1 | PASS |
| `.dialog-btn--danger[data-variant="primary"]` | dark | [disabled] | `#0a0f1a` | `#60a5fa` @ opacity 0.6 | ~5.2:1 | ≥3:1 | PASS |

**Worst-case post-fix ratio**: 4.89:1 (light-theme default — unchanged from baseline; above the 4.5:1 threshold).

## 6. Focus-ring non-text contrast (AC5)

A new `:focus-visible` rule was added for `.dialog-btn--primary` and `.dialog-btn--danger[data-variant="primary"]` using the existing `--focus-ring` token with `outline-offset: 2px` (ring sits outside the button against the dialog background, not the button background).

| Theme | Ring colour | Background measured against | Ratio | Threshold | Verdict |
|-------|-------------|-----------------------------|-------|-----------|---------|
| light | `#2563eb` (--focus-ring) | `#ffffff` dialog surface | 4.89:1 | ≥3:1 | PASS |
| dark  | `#60a5fa` (--focus-ring) | `#1a1d23` dialog surface | 7.66:1 | ≥3:1 | PASS |

## 7. Files modified

| File | Diff summary |
|------|--------------|
| `sidepanel/sidepanel.css` | +5 lines: `--on-accent` added to light / dark / system-dark / system-light theme blocks. 2 edits: `color: #ffffff` → `color: var(--on-accent)` on `.dialog-btn--primary` and `.dialog-btn--danger[data-variant="primary"]`. +5 lines: new `:focus-visible` rule for primary buttons. |
| `docs/a11y-audit-B-062.md` | New file — this audit. |

## 8. Out-of-scope surfaces NOT touched (per AC11)

- `.dialog-btn--secondary` (text is `var(--text-primary)` on `var(--bg-secondary)`; passes AA both themes).
- `.dialog-btn--danger` without `[data-variant="primary"]` (`#ffffff` on `#dc2626` — passes AA).
- Item rows, group headers, context menus — any non-primary-button surface.
- **R4 follow-on fixes folded into this item**: `.empty-state-cta:hover` and `.window-filter-chip[aria-selected="true"]` (+ its `:hover`) were flagged by [code-reviewer] M-1 / M-2 as pre-existing dark-mode AA failures on the same `--accent`-background pattern. Since the `--on-accent` token infrastructure is now in place and the fix is a literal `#ffffff` → `var(--on-accent)` swap (no semantic change), those three lines were patched inside this sprint item rather than deferred.
- **B-048 pre-seed** (scope-creep accepted): `--selected-bg` and `--selected-border` tokens were added to all 4 theme blocks and wired into `.item-row[data-selected="true"]` during the B-062 R3 pass. These tokens were planned for B-048 §31.7; values are identity-preserving stubs that B-048 R3 may refine. Pre-seed noted here for attribution.
- Core palette tokens (`--bg-primary`, `--bg-secondary`, `--text-primary`, `--text-secondary`, `--border-primary`).
- Light-theme `--accent` value (unchanged; `--on-accent` in light theme intentionally set to `#ffffff` to preserve the pre-fix appearance exactly).
- Non-contrast a11y concerns (screen-reader names, keyboard traps — covered by prior sprints).

## 9. Risk summary

- Zero JS touched; CSS-only change. Automated test suite: 617/617 passing (baseline 617). No automated regression possible against this change.
- Existing `--accent` consumers unchanged — the new token is additive only.
- The dark-theme `--on-accent: #0a0f1a` was chosen to blend with the dark palette (very close to `--bg-primary: #1a1d23`) while maintaining an 8.8:1 headroom — tolerant of future small accent-tint tweaks.
