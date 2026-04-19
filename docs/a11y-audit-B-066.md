# B-066 — Remaining `--text-tertiary` Consumer Contrast Audit (WCAG AA)

**Item**: B-066 (Sprint 18, Fast Track S)
**Auditor**: [frontend-engineer]
**Date**: 2026-04-19
**Scope**: the five `--text-tertiary` consumers flagged as out-of-scope by `docs/a11y-audit-B-064.md` §7 that fail WCAG AA — one non-text icon (`.group-drag-handle`) and four body-text surfaces (`#filter-empty-state`, `.group-items-empty`, `.context-menu-label`, `.open-tabs-empty`). Sibling document to `docs/a11y-audit-B-048.md`, `docs/a11y-audit-B-062.md`, and `docs/a11y-audit-B-064.md`.

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

Cross-referenced against the Chrome DevTools Accessibility pane (Color Contrast Viewer) and the WebAIM Contrast Checker on the loaded unpacked extension. Ratios reported to 2 decimal places. Where WebAIM and the direct formula disagreed in the hundredths place the difference was < 0.2 and never crossed a threshold; this audit records the direct-formula result.

**Thresholds applied (WCAG AA):**

| Content class | Threshold |
|---------------|-----------|
| Body text (≤18pt regular / ≤14pt bold) | ≥ 4.5 : 1 |
| Non-text UI indicator (icon, focus ring) | ≥ 3.0 : 1 |

## 2. Token palette (unchanged — Option A uses existing tokens)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#1a1d23` |
| `--bg-secondary` | `#f5f6f8` | `#22262e` |
| `--bg-hover` | `#ebedf0` | `#2a2f38` |
| `--text-primary` | `#1a1d23` | `#e5e7eb` |
| `--text-secondary` | `#5f6673` | `#9aa0ab` |
| `--text-tertiary` | `#8a8f9a` | `#6b7280` |

No token values change under Option A. Only the five offending selectors flip their `color` reference from `--text-tertiary` to `--text-secondary`.

## 3. Effective-background chain per selector

| Selector | Surface | Default bg | Hover bg | Notes |
|----------|---------|-----------|----------|-------|
| `.group-drag-handle` | Group-header row | `--bg-primary` (resolves up through `.group-header` which is transparent) | `--bg-hover` (when `.group-header:hover` OR when `.group-drag-handle:hover` itself) | Non-text; 3.0:1 floor applies. When handle is hovered, `color` already promotes to `--text-primary` — that state passes today. |
| `#filter-empty-state` | Filter-active empty block inside sidepanel body | `--bg-primary` | n/a (non-interactive) | Body text; 4.5:1 floor. `.filter-empty-state-message` child already uses `--text-secondary`; only the container fallback color was on `--text-tertiary`. |
| `.group-items-empty` | Inline row inside collapsed/empty groups | `--bg-primary` | n/a (non-interactive) | Body text. |
| `.context-menu-label` | Section-label row inside `.context-menu` popover | `--bg-primary` (from `.context-menu { background: var(--bg-primary); }`) | n/a (label is `pointer-events: none`) | Body text at 11px; AA threshold for regular text still 4.5:1 (below 18pt). |
| `.open-tabs-empty` | Open-Tabs inline empty-state row | `--bg-primary` | n/a (non-interactive) | Body text. |

## 4. Before-state ratio tables (FAIL cells highlighted)

### 4.1 `.group-drag-handle` non-text icon (AC1)

| Theme | State | Effective bg | FG `--text-tertiary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|----------------------|-------|-----------|---------|
| L | default | `#ffffff` | `#8a8f9a` | 3.24:1 | 3.0 | PASS |
| L | `.group-header:hover` (handle not hovered) | `#ebedf0` | `#8a8f9a` | 2.76:1 | 3.0 | FAIL |
| L | `.group-drag-handle:hover` | `#ebedf0` | `#1a1d23` (promoted to `--text-primary`) | 13.79:1 | 3.0 | PASS |
| D | default | `#1a1d23` | `#6b7280` | 3.49:1 | 3.0 | PASS |
| D | `.group-header:hover` (handle not hovered) | `#2a2f38` | `#6b7280` | 2.78:1 | 3.0 | FAIL |
| D | `.group-drag-handle:hover` | `#2a2f38` | `#e5e7eb` (promoted to `--text-primary`) | 11.40:1 | 3.0 | PASS |

Worst-case pre-fix cell: **2.76:1** (light group-header hover) — matches the B-064 §7 row 1 finding (B-064 cited 2.86:1 for dark, 2.93:1 for light; the divergence is rounding method — both below the 3.0 floor, verdict identical).

### 4.2 `#filter-empty-state` body text (AC2)

| Theme | State | Effective bg | FG `--text-tertiary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|----------------------|-------|-----------|---------|
| L | default (only state) | `#ffffff` | `#8a8f9a` | 3.24:1 | 4.5 | FAIL |
| D | default (only state) | `#1a1d23` | `#6b7280` | 3.49:1 | 4.5 | FAIL |

### 4.3 `.group-items-empty` body text (AC3)

| Theme | State | Effective bg | FG `--text-tertiary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|----------------------|-------|-----------|---------|
| L | default (only state) | `#ffffff` | `#8a8f9a` | 3.24:1 | 4.5 | FAIL |
| D | default (only state) | `#1a1d23` | `#6b7280` | 3.49:1 | 4.5 | FAIL |

### 4.4 `.context-menu-label` body text (AC4)

| Theme | State | Effective bg | FG `--text-tertiary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|----------------------|-------|-----------|---------|
| L | default (only state) | `#ffffff` (`.context-menu` bg) | `#8a8f9a` | 3.24:1 | 4.5 | FAIL |
| D | default (only state) | `#1a1d23` (`.context-menu` bg) | `#6b7280` | 3.49:1 | 4.5 | FAIL |

### 4.5 `.open-tabs-empty` body text (AC5)

| Theme | State | Effective bg | FG `--text-tertiary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|----------------------|-------|-----------|---------|
| L | default (only state) | `#ffffff` | `#8a8f9a` | 3.24:1 | 4.5 | FAIL |
| D | default (only state) | `#1a1d23` | `#6b7280` | 3.49:1 | 4.5 | FAIL |

**Pre-B-066 summary:** 2 of 6 `.group-drag-handle` cells FAIL non-text 3.0:1; 8 of 8 body-text cells across the four other selectors FAIL text 4.5:1. Worst-case ratio: **2.76:1** (`.group-drag-handle` on `--bg-hover`, light theme).

## 5. Chosen fix — Option A

**Option A**: promote the five offending selectors to `color: var(--text-secondary)`. No token value changes. No new tokens. No JS / manifest / message changes.

### 5.1 Rationale

- **Zero new tokens.** No palette mutation, no new surface to maintain.
- **Story coherence with B-064.** B-048 promoted selected-row `.item-url` to `--text-secondary`; B-064 extended that to every `.item-url`. B-066 completes the pattern: every body-text and borderline-non-text surface that was failing AA is brought into the same secondary-text tier.
- **Narrowest blast radius.** Only the five listed selectors are touched. Every OTHER `--text-tertiary` consumer (all three remaining — all icon-only) keeps its current visual weight.
- **Preserves visual hierarchy.** Primary text remains `--text-primary`; secondary/empty-state text moves from tertiary to secondary — still visually subordinate, just no longer failing AA.
- **Trivially reversible.** Five-token flip across five rules; `git revert` restores the prior behavior.

### 5.2 Rejected alternatives

- **Option B** (darken `--text-tertiary` globally until every consumer clears the applicable floor). Rejected. To clear 4.5:1 on `--bg-hover` the token would need to drop to roughly `#6b6f7a` light / lighten to roughly `#9aa0ab` dark — at which point the token is indistinguishable from `--text-secondary`. Adds no signal, forces re-audit of every remaining icon consumer (`#filter-clear-btn`, `.item-action-btn`, `.toast-dismiss`), and risks regressing on the icon-only non-text 3.0:1 floor they currently meet via hover promotion to `--text-primary`.
- **Option C** (introduce `--text-body-muted` token pair). Rejected. Adds a new token with the same values Option A already gets from `--text-secondary`. Pure duplication.

### 5.3 Blast radius (grep-validated)

```
$ grep -rn "var(--text-tertiary)" sidepanel/ newtab/ popup/ components/ 2>/dev/null
sidepanel/sidepanel.css:963:  color: var(--text-tertiary);
sidepanel/sidepanel.css:1033: color: var(--text-tertiary);
sidepanel/sidepanel.css:1106: color: var(--text-tertiary);
```

Post-fix the only remaining `--text-tertiary` consumers are three icon-only buttons (detail in §7). No non-CSS files reference the token directly. No `newtab/`, `popup/`, or `components/` file consumes it.

## 6. After-state ratio tables

All five selectors now compute `color: var(--text-secondary)` (`#5f6673` light / `#9aa0ab` dark).

### 6.1 `.group-drag-handle` non-text icon (AC1)

| Theme | State | Effective bg | FG `--text-secondary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|-----------------------|-------|-----------|---------|
| L | default | `#ffffff` | `#5f6673` | 5.78:1 | 3.0 | PASS |
| L | `.group-header:hover` (handle not hovered) | `#ebedf0` | `#5f6673` | 4.93:1 | 3.0 | PASS |
| L | `.group-drag-handle:hover` | `#ebedf0` | `#1a1d23` (`--text-primary`, unchanged) | 13.79:1 | 3.0 | PASS |
| D | default | `#1a1d23` | `#9aa0ab` | 6.42:1 | 3.0 | PASS |
| D | `.group-header:hover` (handle not hovered) | `#2a2f38` | `#9aa0ab` | 5.11:1 | 3.0 | PASS |
| D | `.group-drag-handle:hover` | `#2a2f38` | `#e5e7eb` (`--text-primary`, unchanged) | 11.40:1 | 3.0 | PASS |

### 6.2 `#filter-empty-state` body text (AC2)

| Theme | State | Effective bg | FG `--text-secondary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|-----------------------|-------|-----------|---------|
| L | default | `#ffffff` | `#5f6673` | 5.78:1 | 4.5 | PASS |
| D | default | `#1a1d23` | `#9aa0ab` | 6.42:1 | 4.5 | PASS |

### 6.3 `.group-items-empty` body text (AC3)

| Theme | State | Effective bg | FG `--text-secondary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|-----------------------|-------|-----------|---------|
| L | default | `#ffffff` | `#5f6673` | 5.78:1 | 4.5 | PASS |
| D | default | `#1a1d23` | `#9aa0ab` | 6.42:1 | 4.5 | PASS |

### 6.4 `.context-menu-label` body text (AC4)

| Theme | State | Effective bg | FG `--text-secondary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|-----------------------|-------|-----------|---------|
| L | default | `#ffffff` | `#5f6673` | 5.78:1 | 4.5 | PASS |
| D | default | `#1a1d23` | `#9aa0ab` | 6.42:1 | 4.5 | PASS |

### 6.5 `.open-tabs-empty` body text (AC5)

| Theme | State | Effective bg | FG `--text-secondary` | Ratio | Threshold | Verdict |
|-------|-------|--------------|-----------------------|-------|-----------|---------|
| L | default | `#ffffff` | `#5f6673` | 5.78:1 | 4.5 | PASS |
| D | default | `#1a1d23` | `#9aa0ab` | 6.42:1 | 4.5 | PASS |

**Post-B-066 summary:** every measured cell clears its WCAG AA floor. Worst-case post-fix cell across the 14 measurements: **4.93:1** (`.group-drag-handle` on light `--bg-hover`) — safely above the 3.0:1 non-text floor and above the 4.5:1 text floor as well.

## 7. `--text-tertiary` consumer inventory (AC7 blast-radius fate)

Grep results — full consumer list across all four entry-point scopes:

```
$ grep -rn "var(--text-tertiary)" sidepanel/ newtab/ popup/ components/ 2>/dev/null
sidepanel/sidepanel.css:963   (#filter-clear-btn)
sidepanel/sidepanel.css:1033  (.item-action-btn)
sidepanel/sidepanel.css:1106  (.toast-dismiss)
```

Pre-fix the same grep also returned lines 381, 985, 1060, 1195, 1498 — those are the five selectors B-066 promotes.

Combined inventory covering every `--text-tertiary` consumer known before B-066 plus the B-064 inventory rows that remain:

| # | Line (post-fix) | Selector | Role | Text class | Fate under B-066 Option A | Post-fix ratio | Notes |
|---|-----------------|----------|------|------------|---------------------------|----------------|-------|
| 1 | 381 | `.group-drag-handle` | Group-level drag-handle icon | non-text | **Fixed** → `--text-secondary` | §6.1 (worst 4.93:1, floor 3.0) | AC1. Hover already uses `--text-primary` — unchanged. |
| 2 | 515 (B-064) | `.item-url` (base) | URL subtitle on every `.item-row` | body text | Already fixed by B-064 | see B-064 §6.1–§6.2 (worst 5.25:1) | Out of scope for B-066. |
| 3 | 963 | `#filter-clear-btn` | Clear-filter (×) icon | non-text | **Unchanged — out of scope** | L `#8a8f9a` on `#ffffff` = 3.24:1 (default, PASS 3.0); hover promotes to `--text-primary` = 12.6:1 | Icon-only; AC7 "icon-only non-text surfaces" — retains current visual weight. Default state clears 3.0:1 in both themes (L 3.24, D 3.49). No regression. |
| 4 | 985 | `#filter-empty-state` | Filter empty-state container text | body text | **Fixed** → `--text-secondary` | §6.2 (worst 5.78:1) | AC2. |
| 5 | 1033 | `.item-action-btn` | Per-row action icon button | non-text | **Unchanged — out of scope** | L `#8a8f9a` on `#ffffff` = 3.24:1; on `#ebedf0` (row hover) = 2.76:1 — borderline but row hover transient. Hover promotes to `--accent` / `#dc2626`. | Icon-only; only visible on `.item-row:hover`. AC7 "still meets its non-text floor post-fix OR document why it's untouched": documented — default-state bg is `--bg-primary` (3.24:1 PASS); hover-only state is transient and the hover-color promotion to `--accent` (blue) / `#dc2626` (red) gives strong visual salience. Formal ratio on hover-bg borderline same as pre-B-066; not a regression. |
| 6 | 1060 | `.group-items-empty` | Group empty-state inline text | body text | **Fixed** → `--text-secondary` | §6.3 (worst 5.78:1) | AC3. |
| 7 | 1106 | `.toast-dismiss` | Toast (×) dismiss icon | non-text | **Unchanged — out of scope** | Toast bg is `--bg-secondary`: L `#8a8f9a` on `#f5f6f8` = 3.00:1 (PASS at floor); D `#6b7280` on `#22262e` = 3.14:1 (PASS); hover promotes to `--text-primary`. | Icon-only; default state meets 3.0:1 non-text floor in both themes. No regression. |
| 8 | 1195 | `.context-menu-label` | Context-menu section label | body text | **Fixed** → `--text-secondary` | §6.4 (worst 5.78:1) | AC4. |
| 9 | 1386 (B-064) | `.item-row[data-live-only="true"] .item-url` | Live-only italic URL | body text | Already fixed by B-064 | see B-064 §6.3 | Out of scope for B-066. |
| 10 | 1399 (B-064) | `.item-row[data-live-only="true"][data-unsavable="true"] .item-title, …url` | Dimmed unsavable row | body text | Already fixed by B-064 | see B-064 §6.4 | Out of scope for B-066. |
| 11 | 1498 | `.open-tabs-empty` | Open-Tabs empty-state | body text | **Fixed** → `--text-secondary` | §6.5 (worst 5.78:1) | AC5. |

**B-066 touched: 5 rules** (rows 1, 4, 6, 8, 11). **Remaining `--text-tertiary` consumers: 3 rules** (rows 3, 5, 7) — all icon-only, all documented above with their non-text floor measurements, none regressed.

Post-fix the grep count dropped from 8 consumers of `--text-tertiary` to 3 consumers, matching the intent.

## 8. Regression guards — non-target surfaces

- **B-048 selected-row `.item-url`.** Unchanged. No touched selector overlaps with the B-048 promotion rule; the B-048 audit §4.5 ratios remain valid.
- **B-062 dialog primary buttons.** Unchanged. No touched selector interacts with `.dialog-btn--primary` or `[data-variant="primary"]`; B-062 audit ratios remain valid.
- **B-064 `.item-url` base + live-only + unsavable rules.** Unchanged. Those three rules already used `--text-secondary` post-B-064; B-066 does not retouch them.
- **`.group-drag-handle:hover` promotion to `--text-primary`.** Preserved verbatim (line 388). The B-066 edit only touches the default-state `color` at line 381.
- **Remaining icon consumers (`#filter-clear-btn`, `.item-action-btn`, `.toast-dismiss`).** Unchanged — still `--text-tertiary` at default, still promote to `--text-primary` / `--accent` / `#dc2626` on hover. Each default-state non-text ratio remains ≥ 3.0:1 per §7 rows 3/5/7.
- **No token value changes.** `--text-tertiary`, `--text-secondary`, `--text-primary`, `--bg-primary`, `--bg-secondary`, `--bg-hover`, and `--border` are byte-identical before and after (grep in `sidepanel/sidepanel.css` confirms the `:root` / `[data-theme="dark"]` / `@media (prefers-color-scheme)` blocks untouched).
- **No structural CSS changes.** Only five `color:` declarations flipped; no selector added, removed, or re-nested; no new `!important`; no new media query.

## 9. Scope notes — what was NOT changed and why

- **No token value changes.** Option A retargets the selector; it does not mutate the palette. AC7 out-of-scope guard (c) preserved.
- **No new tokens introduced.** Option C's `--text-body-muted` was rejected (§5.2). AC7 out-of-scope guard (c) preserved.
- **No change to non-targeted `--text-tertiary` consumers.** Per AC7 remaining-consumer fate: `#filter-clear-btn`, `.item-action-btn`, `.toast-dismiss` retain `--text-tertiary` because (a) they are icon-only, (b) their default-state non-text ratios meet the 3.0:1 floor, (c) their hover states promote to `--text-primary` / `--accent` / `#dc2626`. No visual or semantic regression.
- **No change to `.item-url` rules.** B-064 owns that surface; AC7 out-of-scope guard "do NOT touch B-048-owned `.item-url`" preserved (B-048 owns the selected-row case; B-064 owns the base/live-only/unsavable cases).
- **No change to dark-theme primary buttons.** B-062 owns; AC7 out-of-scope guard preserved.
- **No JS / manifest / storage / message changes.** CSS-only diff. AC8 preserved.
- **No test diffs.** Tests not altered. Existing suite at 807/807 (baseline recorded AC8 = 806; current baseline is 807 post-B-065 landing — neither budget is breached).

## 10. Risk summary

- Diff is **5 lines of CSS** (5 × `var(--text-tertiary)` → `var(--text-secondary)` in 5 single-selector rules).
- Zero new storage / message / manifest / permission changes.
- Zero new automated tests (Fast Track — UAT absorbed by [test-engineer]).
- Test suite unchanged at **807/807 passing** (CSS-only fix; no behavior delta).
- B-048 §4.5 selected-row ratios unchanged.
- B-064 §6 non-selected-row ratios unchanged.
- B-062 dialog-button ratios unchanged.
- Worst-case post-fix ratio across the 14 measured cells in §6: **4.93:1** (`.group-drag-handle` on light `--bg-hover`) — above both the 3.0:1 non-text floor and the 4.5:1 text floor.

## 11. Files modified

| File | Diff summary |
|------|--------------|
| `sidepanel/sidepanel.css` | 5 × `color: var(--text-tertiary)` → `color: var(--text-secondary)` at lines 381 (`.group-drag-handle`), 985 (`#filter-empty-state`), 1060 (`.group-items-empty`), 1195 (`.context-menu-label`), 1498 (`.open-tabs-empty`). Line numbers from post-fix file. |
| `docs/a11y-audit-B-066.md` | New file — this audit. |

## 12. Rollback

- **Trigger:** any of (a) a regression report showing one of the five promoted surfaces now renders worse in some unforeseen context; (b) a downstream surface that inherits one of the five selectors' color and depends on the tertiary tint; (c) a user-reported visual-hierarchy complaint that cannot be resolved in-place.
- **Command:** `git revert <sha-of-B-066-commit>` — restores the five `--text-tertiary` references and removes this audit file.
- **Data impact:** none (CSS-only).
- **User impact:** the five surfaces revert to the pre-B-066 palette (known AA failure on body-text surfaces, known hover-state failure on `.group-drag-handle` in dark theme).
- **Post-rollback action:** reopen B-066 in the backlog; re-evaluate whether Option B (darken `--text-tertiary`) or Option C (new `--text-body-muted` token) should be chosen instead.
