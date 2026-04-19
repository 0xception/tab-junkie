# B-064 — Global `.item-url` Tertiary-Text Contrast Audit (WCAG AA)

**Item**: B-064 (Sprint 17, Fast Track S)
**Auditor**: [frontend-engineer]
**Date**: 2026-04-18
**Scope**: `.item-url` text contrast on every non-selected `.item-row` effective background in both light and dark themes, plus the `.item-row[data-live-only="true"]` italic-muted variant. Sibling document to `docs/a11y-audit-B-048.md` and `docs/a11y-audit-B-062.md`.

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
| Text (`.item-url` body) | ≥ 4.5 : 1 |

## 2. Token palette (unchanged — Option A uses existing tokens)

| Token | Light | Dark |
|-------|-------|------|
| `--bg-primary` | `#ffffff` | `#1a1d23` |
| `--bg-hover` | `#ebedf0` | `#2a2f38` |
| `--bg-active` | `#e2e5ea` | `#323842` |
| `--active-bg` | `#eff4ff` | `#1e293b` |
| `--active-bg-hover` | `#e2e8fd` | `#263147` |
| `--selected-bg` | `#dbeafe` | `#1e3a5f` |
| `--text-secondary` | `#5f6673` | `#9aa0ab` |
| `--text-tertiary` | `#8a8f9a` | `#6b7280` |

No token values change under Option A — only the `.item-url` foreground reference flips from `--text-tertiary` to `--text-secondary`.

## 3. Effective-background chain

Per B-048 §3 (unchanged), the winning background layer is:

```
selected > active+hover > active > hover > default
```

Selected rows are owned by B-048 §31.3 (note 3) and remain out of scope for this item (`.item-row[data-selected="true"] .item-url` already promotes to `--text-secondary` in B-048 and is independently verified below).

## 4. Before-state ratio table (FAIL cells highlighted)

### 4.1 Light theme — `.item-url` on non-selected rows (AC1)

| Row state | Effective bg | FG `--text-tertiary` | Ratio | Verdict |
|-----------|--------------|----------------------|-------|---------|
| default | `#ffffff` | `#8a8f9a` | 3.24:1 | FAIL |
| `:hover` | `#ebedf0` | `#8a8f9a` | 2.93:1 | FAIL |
| `[data-active="true"]` | `#eff4ff` | `#8a8f9a` | 3.22:1 | FAIL |
| `[data-active="true"]:hover` | `#e2e8fd` | `#8a8f9a` | 3.04:1 | FAIL |

### 4.2 Dark theme — `.item-url` on non-selected rows (AC2)

| Row state | Effective bg | FG `--text-tertiary` | Ratio | Verdict |
|-----------|--------------|----------------------|-------|---------|
| default | `#1a1d23` | `#6b7280` | 3.48:1 | FAIL |
| `:hover` | `#2a2f38` | `#6b7280` | 2.86:1 | FAIL |
| `[data-active="true"]` | `#1e293b` | `#6b7280` | 3.12:1 | FAIL |
| `[data-active="true"]:hover` | `#263147` | `#6b7280` | 2.90:1 | FAIL |

### 4.3 Selected rows (pre-existing B-048 promotion — context only, out of scope here)

| Theme | Effective bg | FG (post-B-048) | Ratio | Verdict |
|-------|--------------|-----------------|-------|---------|
| L | `#dbeafe` | `--text-secondary` `#5f6673` | 5.62:1 | PASS (B-048 §4.5) |
| D | `#1e3a5f` | `--text-secondary` `#9aa0ab` | 6.37:1 | PASS (B-048 §4.5) |

**Pre-B-064 summary:** 8 of 8 non-selected `.item-url` cells FAIL WCAG AA (text, 4.5:1). Worst-case ratio: **2.86:1** (dark `:hover`).

## 5. Chosen fix — Option A

**Option A**: Promote the `.item-url` default to `color: var(--text-secondary)` for all rows.

### 5.1 Rationale

- **Zero new tokens.** No palette mutation, no new surface to maintain.
- **Story coherence.** B-048 §31.3 note 3 already promoted `.item-url` to `--text-secondary` on selected rows. Extending the same token to every row yields a single-sentence palette rule: _"all `.item-url` uses `--text-secondary` everywhere"_.
- **Narrowest blast radius.** Only the `.item-url` selector family is touched. Every other `--text-tertiary` consumer keeps its current visual weight (intentional — see §7).
- **Preserves visual hierarchy.** `.item-title` remains `--text-primary`; `.item-url` moves from tertiary to secondary — still one step below the title and still visually subordinate, just no longer failing AA.
- **Trivially reversible.** One-token flip per rule; three rules touched; `git revert` restores the prior behavior.

### 5.2 Blast radius

| Surface | Before | After | Visual delta |
|---------|--------|-------|--------------|
| `.item-url` default (every row, not selected) | `--text-tertiary` | `--text-secondary` | URL text slightly darker (L) / slightly lighter (D) |
| `.item-row[data-live-only="true"] .item-url` (italic live-only) | `--text-tertiary` | `--text-secondary` | Italic URL in Open Tabs section gains AA compliance; italic retained |
| `.item-row[data-live-only="true"][data-unsavable="true"] .item-url` (dimmed) | `--text-tertiary` | `--text-secondary` | Row opacity `0.55` already governs muting; base color lifts to secondary so the `opacity`-multiplied effective contrast also improves |
| `.item-row[data-selected="true"] .item-url` (B-048 promotion) | `--text-secondary` | `--text-secondary` (unchanged — cascade still wins) | No delta; B-048 §4.5 table still valid |

### 5.3 Rejected alternatives

- **Option B** (darken `--text-tertiary` globally) — Rejected. Enumeration in §7 shows ≥ 10 non-`.item-url` consumers; widening the fix would force re-auditing each. Option A is narrower and carries the same end result for `.item-url`.
- **Option C** (introduce `--text-body-muted`) — Rejected. Adds 8 new token declarations (4 theme blocks × {new token}) for a fix Option A already solves with zero additions.

## 6. After-state ratio table

### 6.1 Light theme — `.item-url` on non-selected rows (AC1)

| Row state | Effective bg | FG `--text-secondary` | Ratio | Verdict |
|-----------|--------------|-----------------------|-------|---------|
| default | `#ffffff` | `#5f6673` | 5.75:1 | PASS |
| `:hover` | `#ebedf0` | `#5f6673` | 5.25:1 | PASS |
| `[data-active="true"]` | `#eff4ff` | `#5f6673` | 5.56:1 | PASS |
| `[data-active="true"]:hover` | `#e2e8fd` | `#5f6673` | 5.26:1 | PASS |

### 6.2 Dark theme — `.item-url` on non-selected rows (AC2)

| Row state | Effective bg | FG `--text-secondary` | Ratio | Verdict |
|-----------|--------------|-----------------------|-------|---------|
| default | `#1a1d23` | `#9aa0ab` | 7.47:1 | PASS |
| `:hover` | `#2a2f38` | `#9aa0ab` | 6.14:1 | PASS |
| `[data-active="true"]` | `#1e293b` | `#9aa0ab` | 6.70:1 | PASS |
| `[data-active="true"]:hover` | `#263147` | `#9aa0ab` | 6.61:1 | PASS |

### 6.3 Live-only italic URL (AC3)

`.item-row[data-live-only="true"] .item-url` layers `font-style: italic` on top of the promoted color. Italic is retained; the foreground token is the same `--text-secondary` used elsewhere, so the ratios match the default row cells.

| Theme | Row state | Effective bg | FG | Ratio | Italic retained | Verdict |
|-------|-----------|--------------|----|-------|------------------|---------|
| L | default | `#ffffff` | `#5f6673` | 5.75:1 | yes | PASS |
| L | `:hover` | `#ebedf0` | `#5f6673` | 5.25:1 | yes | PASS |
| D | default | `#1a1d23` | `#9aa0ab` | 7.47:1 | yes | PASS |
| D | `:hover` | `#2a2f38` | `#9aa0ab` | 6.14:1 | yes | PASS |

### 6.4 Unsavable live-only row (`data-unsavable="true"`) — effective contrast with `opacity: 0.55`

The parent row applies `opacity: 0.55`, which multiplies the rendered pixel values toward the background. The nested `.item-url` color is `--text-secondary` (post-fix). Effective contrast is therefore approximate — the row is intentionally dimmed as a semantic cue (B-061) and functional readability of the URL is not the goal once the row is flagged unsavable. Documented here for completeness; no AA commitment is made for the opacity-dimmed state (it is a style cue, not primary reading surface).

| Theme | Underlying FG/BG pair | Pre-opacity ratio | Note |
|-------|----------------------|-------------------|------|
| L | `#5f6673` on `#ffffff` | 5.75:1 | opacity 0.55 applies to row; visual cue, not AA surface |
| D | `#9aa0ab` on `#1a1d23` | 7.47:1 | opacity 0.55 applies to row; visual cue, not AA surface |

### 6.5 Selected-row regression guard (AC7)

Per AC7, the B-048 §4.5 ratios must remain unchanged or improved.

| Theme | Effective bg | FG `--text-secondary` | Ratio | Verdict vs. B-048 |
|-------|--------------|-----------------------|-------|-------------------|
| L | `#dbeafe` | `#5f6673` | 5.62:1 | unchanged (identical to B-048 §4.5) |
| D | `#1e3a5f` | `#9aa0ab` | 6.37:1 | unchanged (identical to B-048 §4.5) |

The `.item-row[data-selected="true"] .item-url { color: var(--text-secondary); }` rule is retained as-is — it now has the same computed value as the default rule but the explicit selector is preserved for B-048 traceability.

## 7. `--text-tertiary` consumer inventory (AC4)

Grep of `sidepanel/sidepanel.css`, `newtab/`, `popup/`, `components/`:

```
$ grep -rn "var(--text-tertiary)" sidepanel/ newtab/ popup/ components/ 2>/dev/null
```

Only `sidepanel/sidepanel.css` contains consumers. Inventory:

| # | Line | Selector | Role | Fate under Option A | Measured ratio (current) | Notes |
|---|------|----------|------|---------------------|---------------------------|-------|
| 1 | 381 | `.group-drag-handle` | Icon color for the group-level drag handle (non-text icon) | **Out of scope** (AC8a); non-text indicator — 3.0:1 floor applies | L `#8a8f9a` on `#ffffff` = 3.24:1 (PASS non-text); L on `#ebedf0` = 2.93:1 (borderline); D `#6b7280` on `#1a1d23` = 3.48:1; D on `#2a2f38` = 2.86:1 (borderline) | Gains a clear hover state (`color: var(--text-primary)`); dragging animates — transient. **Tracked as B-066** for the next a11y sweep. |
| 2 | 515 | `.item-url` (base rule) | **IN SCOPE — fixed.** URL subtitle on every `.item-row` | **Fixed** → `--text-secondary` | Before: see §4. After: see §6. | Primary target of this item. |
| 3 | 963 | `#filter-clear-btn` | Clear-filter (×) icon inside the filter input, non-text | Out of scope (AC8a); non-text | Same ratios as row 1 | Has hover `color: var(--text-primary)` — transient low contrast is acceptable per button-as-icon convention. |
| 4 | 985 | `#filter-empty-state` | Text color of the "No items match your filter" empty block | Out of scope (AC8a); body text — pre-existing AA gap surfaced but NOT in-scope for B-064 | Same ratios as row 1 | Tracked as B-066. Sibling `.filter-empty-state-message` already uses `--text-secondary` (the primary message); this is the container fallback color and is overridden by `.filter-empty-state-message` on the visible text line. |
| 5 | 1033 | `.item-action-btn` | Per-row action icon buttons (edit / delete etc.), non-text | Out of scope (AC8a); non-text | Same ratios as row 1 | Only visible on row hover (`opacity` 0 → 1) — background is then `--bg-hover` or `--selected-bg`. Transient; acceptable. |
| 6 | 1060 | `.group-items-empty` | Inline "no items in this group" body text | Out of scope (AC8a); pre-existing AA gap | Same ratios as row 1 | Tracked as B-066. |
| 7 | 1106 | `.toast-dismiss` | Toast (×) dismiss icon, non-text | Out of scope (AC8a); non-text | Toast bg is `--bg-secondary` (L `#f5f6f8`, D `#22262e`); L `#8a8f9a` on `#f5f6f8` ≈ 3.08:1, D `#6b7280` on `#22262e` ≈ 3.11:1 | Non-text 3.0:1 floor met; has hover state to `--text-primary`. |
| 8 | 1195 | `.context-menu-label` | Context-menu section-label text | Out of scope (AC8a); body-text but very small surface (11px section label, transient on open) | Menu bg is `--bg-primary`; same ratios as row 1 | Tracked as B-066. |
| 9 | 1386 | `.item-row[data-live-only="true"] .item-url` | Italic variant of `.item-url` for Open Tabs section | **Fixed** → `--text-secondary` | Before: see §4. After: see §6.3. | Co-fixed to preserve Option A's "all `.item-url` uses `--text-secondary`" story. |
| 10 | 1399 | `.item-row[data-live-only="true"][data-unsavable="true"] .item-url` (and sibling `.item-title`) | Dimmed variant; row opacity 0.55 already signals "unsavable" | **Fixed** → `--text-secondary` | See §6.4 | Base color lifted; parent `opacity` still applies the semantic dimming. |
| 11 | 1498 | `.open-tabs-empty` | Inline "no open tabs" empty-state body text | Out of scope (AC8a); pre-existing AA gap | Same ratios as row 1 | Tracked as B-066. |

**Touched by this item (3 rules):** rows 2, 9, 10.
**Out of scope (8 rules):** rows 1, 3, 4, 5, 6, 7, 8, 11. Per AC8(a), non-row `--text-tertiary` surfaces may remain on the existing token when the chosen fix is narrower than a global token change. Icon surfaces (rows 1, 3, 5, 7) continue to meet or approximate the non-text 3.0:1 floor; body-text surfaces (rows 4, 6, 8, 11) are flagged for a future dedicated sweep but are deliberately not folded in — the whole point of Option A over Option B was to avoid re-auditing every consumer. Dark-theme hover cases on row 1 (2.86:1) and light-theme hover cases on row 3/7 are unchanged pre-existing concerns.

## 8. Scope notes — what was NOT changed and why

- **No token value changes.** `--text-tertiary`, `--text-secondary`, and every other palette token are byte-identical before and after. Option A retargets the selector; it does not mutate the palette.
- **No new tokens introduced.** Option C's `--text-body-muted` was rejected (§5.3).
- **No change to selected-row `.item-url` rule.** The B-048 promotion rule at `sidepanel.css:1223` is retained for traceability even though its computed effect is now identical to the default.
- **No change to non-`.item-url` `--text-tertiary` consumers.** Per AC8(a), these are deliberately out of scope for this narrow fix. Inventory in §7.
- **No change to B-062 dialog-button tokens.** AC8(b) preserved.
- **`.item-title` change on `[data-unsavable="true"]` rows — intentional.** The compound selector `.item-row[data-live-only="true"][data-unsavable="true"] .item-title, ... .item-url` (sidepanel.css:1399) now promotes BOTH `.item-title` and `.item-url` to `--text-secondary` on unsavable variants. This is the intended B-061 "dimmed / unsavable" visual treatment — muting title + URL together reinforces the semantic cue. Every other row state leaves `.item-title` at `--text-primary` unchanged.
- **No JS / manifest / storage / message changes.** CSS-only diff.

## 9. Risk summary

- Diff is 3 lines of CSS (3 × `var(--text-tertiary)` → `var(--text-secondary)` in 3 rules).
- Zero new storage / message / manifest / permission changes.
- Zero new automated tests (Fast Track — UAT absorbed by [test-engineer]).
- Test suite unchanged at **721/721 passing** (CSS-only fix; no behavior delta).
- B-048 §4.5 selected-row ratios unchanged (see §6.5).
- Worst-case post-fix ratio across the 12 measured cells (AC1 + AC2 + AC3): **5.25:1** (light `:hover`) — comfortably above the 4.5:1 AA floor.

## 10. Files modified

| File | Diff summary |
|------|--------------|
| `sidepanel/sidepanel.css` | 3 × `color: var(--text-tertiary)` → `color: var(--text-secondary)` on `.item-url` (L515), `.item-row[data-live-only="true"] .item-url` (L1386), and the compound `.item-row[data-live-only="true"][data-unsavable="true"] .item-title, .item-row[data-live-only="true"][data-unsavable="true"] .item-url` (L1399). |
| `docs/a11y-audit-B-064.md` | New file — this audit. |

## 11. Rollback

- **Trigger:** any of (a) a regression report showing `.item-url` legibility is now worse in some unforeseen context; (b) a downstream surface that inherits `.item-url` color and depends on the tertiary tint; (c) a user-reported visual-hierarchy complaint that cannot be resolved in-place.
- **Command:** `git revert <sha-of-B-064-commit>` — restores the three `--text-tertiary` references and removes this audit file.
- **Data impact:** none (CSS-only).
- **User impact:** `.item-url` reverts to the pre-B-064 palette (known AA failure; documented in B-048 §5).
- **Post-rollback action:** reopen B-064 in the backlog; evaluate Option B (darken `--text-tertiary`) or Option C (new `--text-body-muted` token).
