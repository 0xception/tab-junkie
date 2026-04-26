# Sprint 34 — R4 Findings (Deduplicated)

## B-101 (Dotted drift bar)

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| 1 | `tests/b011-drift.test.js:79` | Test file inlines a verbatim reproduction of `_ensureIndicators` that implements the **pre-B-101 behavior** (injects/removes `.item-drifted-icon`). After R3, this stub is stale — production no longer creates `.item-drifted-icon`; it flips `bar.hidden` on an always-present `.item-drift-bar`. Tests still pass because they only exercise the local stub, providing false coverage. A future regression in the new drift-bar flip logic would not be caught. | R5 [test-engineer]: update the inlined `_ensureIndicators` stub to match the new signature `(row, live, isDrifted, driftedToUrl)` and behavior (`bar.hidden` toggle on `.item-drift-bar`). Update the `buildRow` helper to inject a `<span class="item-drift-bar" hidden>` as the row's first child. Rewrite AC11 assertions from `querySelector('.item-drifted-icon') !== null` to `bar.hidden === false/true`. | code-reviewer |

### MEDIUM (fix if time permits)

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| 1 | `tests/b054-sidepanel.test.js:103-109,272-284` and `tests/b048-visual-states.test.js:398-409` | Stale documentation comments referencing `_createDriftedIcon` and local-stub `item-drifted-icon` span constructions. Tests still pass but mislead future readers about codebase state. | R5: search-replace comment blocks and local stubs to reference `_driftTooltipFor` and `.item-drift-bar`. Low effort. | code-reviewer |
| 2 | `sidepanel/sidepanel.css:442-444` | `data-live="true"` (non-active) + drifted coexistence not explicitly tested or documented. Same gutter geometry as `data-active` (`border-left: 3px solid var(--live-indicator)` at `left: 0`), so D-3 layout works for free — but R2 §48.3 D-3 only documents active+drifted; the live+drifted permutation is missed in C-9 enumeration. | R5 UAT: add a case for live+drifted (not-active). R6 [solution-architect]: extend D-3 table to enumerate the live+drifted permutation explicitly. | qa-reviewer |

### LOW (defer to future sprint)

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| 1 | `sidepanel/sidepanel.js:2272-2284` (`_driftTooltipFor`) | Hostname tooltip fallback returns static `"Drifted to a different URL"` instead of the raw URL — improvement over B-099. Theoretical Unicode/IDN punycode rendering ambiguity in `title` tooltip; `URL.hostname` already returns punycode-ASCII for IDN domains in Chromium. No action required. | None. | security-reviewer |
| 2 | `sidepanel/sidepanel.css:425` | `.item-row` already has `contain: layout style` (line 432) which establishes the containing block for absolute positioning — making the new `position: relative` technically redundant. Comment says "positioned ancestor for drift bar" which is accurate but slightly misleading about which property provides it. | Add a one-line comment clarifying that `contain: layout` is the actual containing-block mechanism; `position: relative` is retained for explicitness. No code change required. | code-reviewer |
| 3 | `sidepanel/sidepanel.js:3193-3197` | Defensive `_cachedDriftRecords[row.dataset.itemId]?.driftedToUrl` fallback inside `_ensureIndicators` is redundant given the only call site already passes `drifted?.driftedToUrl`. Acknowledged in R3 handoff. | Document in the R6 chapter as a known tradeoff. R5 may add a T6 test case exercising this fallback path. | code-reviewer + qa-reviewer |
| 4 | `sidepanel/sidepanel.js:2364-2371` (drift bar injection) + `sidepanel/sidepanel.js:3199-3208` (refresh path) | Safe DOM API usage confirmed: `document.createElement('span')`, `setAttribute('aria-hidden', 'true')`, `bar.title = ...` (string assignment to `title` IDL — plain text in tooltip, no HTML/script execution). Class names + aria-hidden value are static literals. No `innerHTML`, no template HTML interpolation. | None. | security-reviewer |
| 5 | `sidepanel/sidepanel.css:549-550` | Comment says active green border "lives at `left: 0`". Slightly imprecise: `border-left: 3px` occupies the border area outside padding box; drift bar `left: 3px` is measured from padding edge. Visual coexistence works correctly but comment may mislead someone calculating offsets. | Tighten comment to note `left: 3px` is relative to padding box (sits in inner padding zone), not relative to border. No code change. | code-reviewer |
| 6 | `sidepanel/sidepanel.css:558-566` | Drift bar has `width: 3px` with `border-left: 3px` — effective visual width is 3 px (the border only). Assumes `box-sizing: border-box` from root reset; if any theme ever overrode to `content-box`, bar would render at 6 px. Current root reset mitigates. | Add a comment confirming the assumption. No code change. | qa-reviewer |
| 7 | `tests/b048-visual-states.test.js:165` | Test description still says "triangle icon" in `data-drifted` test. Test still passes (it checks `data-drifted`, not icon type) but description is stale. | R5: update description to "dot/bar" or remove icon-type reference. | qa-reviewer |

### Summary

- **B-101 R4 totals**: 0 CRITICAL / 1 HIGH / 2 MEDIUM / 7 LOW
- **Verdict**: FIX-BEFORE-R5 (the HIGH is a test-file stub update, naturally absorbed by R5 [test-engineer]'s round)
- **Security**: PROCEED (0 findings above LOW)
- **QA**: PROCEED (1 MEDIUM is documentation + UAT coverage gap, not a layout defect)
- **Code review**: FIX-BEFORE-R5 (HIGH is test-coverage false-positive; the listed MEDIUM/LOWs are test-file hygiene)

---

## B-104 (Themed group color system)

### CRITICAL (must fix before R5)

_None._

### HIGH (must fix before R5)

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| 1 | `shared/themes.css` (solarized-light block) + `sidepanel/sidepanel.css:204` + `newtab/newtab.css:248` | **WCAG AA contrast failure — ALL 9 slots on `solarized-light`**: text `#586e75` vs tinted `--bg-secondary` measures 3.90–4.10:1 against every slot (all < 4.5:1 AA threshold). The R2 §47.3 D-5 mental walkthrough claimed 7.21:1 baseline but actual is 4.39:1 (sub-AA before any tint). Newtab also fails on 7 of 9 slots. | Introduce per-theme tint-amount override: add `[data-theme="solarized-light"] { --group-header-tint-amount: 6%; }` (or 8% if 6% is too subtle elsewhere) and rewrite both `.group-header` and `.group-header:hover` recipes to use `color-mix(in srgb, var(--group-header-color, transparent) var(--group-header-tint-amount, 12%), var(--bg-secondary))`. Apply same change to `.newtab-group-header`. R3-fix agent measures contrast at 6%/8%; picks the highest tint that keeps all 9 slots ≥ 4.5:1. | qa-reviewer |
| 2 | `sidepanel/sidepanel.js:2087-2093` (`renderTree` synthetic `__ungrouped__` group) | **Ungrouped section receives unintended slate tint**: synthetic group hardcodes `color: 'slate'`. `GROUP_COLORS.includes('slate')` is true, so the inline-style injection at line 2191 sets `--group-header-color: var(--gc-slate)` on the Ungrouped header. Violates R2 §47.5 C-9(c) "Ungrouped section — no group record → no `--group-header-color` injection → untinted header." | Remove `color: 'slate'` from the synthetic group object (set to `null` or omit the key entirely). The inline-style injection MUST also be guarded against null/undefined: `if (group.color && GROUP_COLORS.includes(group.color))` — verify the existing guard. | qa-reviewer |
| 3 | `sidepanel/sidepanel.css:218` (`.group-header:hover`) | **Hover compounds H-1 on solarized-light**: `--bg-hover` is darker than `--bg-secondary` for solarized-light (`#e4dcc4` vs `#eee8d5`), so the hover blend pushes contrast even lower. Computed yellow slot hover ≈ 3.91:1. | Same fix as H-1 — `--group-header-tint-amount` override applies to both `:hover` and base rule. Per H-1, rewrite the hover formula to use the per-theme variable. | qa-reviewer |

### MEDIUM (fix if time permits)

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| 1 | `sidepanel/sidepanel.css:219` | **Hover state uses `--bg-hover` instead of `--bg-secondary` (undocumented D-5 deviation)**. Functionally correct but diverges from D-5 "single recipe" constraint. On some themes `--bg-hover` is noticeably different from `--bg-secondary`, producing a tint-intensity shift on hover. | R3-fix already addresses via H-1/H-3 tint-amount override. Add a code comment noting the intentional deviation: `/* Hover uses --bg-hover (not --bg-secondary) so blend base matches the hover surface state; D-5 recipe is otherwise identical via --group-header-tint-amount. */`. R6 As-Built notes this. | code-reviewer |
| 2 | `shared/themes.css` `[data-theme="atom-one-dark"]` block | **`atom-one-dark` uses algorithmic recipe with `--bg-secondary: #21252b` — same `--bg-secondary` as `one-dark`; but `one-dark` is hand-curated.** Visually near-identical themes render group colors with markedly different vibrancy. | Promote `atom-one-dark` from algorithmic to hand-curated by copying `one-dark`'s 9 hand-curated values (the two themes share `--bg-secondary` and the same Atom One Dark base). Document in §47.10 R6. | code-reviewer |
| 3 | `docs/design/47-b-104-themed-group-colors.md:234` | **R2 §47.3 D-5 mental walkthrough contains a factual error**: claimed solarized-light baseline is 7.21:1; actual is 4.39:1. R2 §47.5 row 19 incorrectly marked the combination as PASS. Cascades into the design premise that 12% is safe on solarized-light. | Update §47.3 D-5 walkthrough + §47.5 row 19 with correct values. Add "known LOW-baseline theme" note for solarized-light. R6 As-Built territory. | qa-reviewer |
| 4 | `sidepanel/sidepanel.css:218` + `newtab/newtab.css` | **Hover state has no tint on newtab**: `.newtab-group-header` has no `:hover` rule, so the hover tint exists only on sidepanel. Visual inconsistency between two surfaces. | R3-fix: either add `.newtab-group-header:hover { background: color-mix(in srgb, var(--group-header-color, transparent) var(--group-header-tint-amount, 12%), var(--bg-hover)); }` OR remove the sidepanel `:hover` tint to keep both surfaces static. Pick parity. | qa-reviewer |

### LOW (defer to future sprint or document)

| # | File:line | Finding | Fix | Source |
|---|-----------|---------|-----|--------|
| 1 | `shared/themes.css` (10 algorithmic blocks) | R2 anchor approximations (~) deviate from R3's correct sRGB values. R5 must verify against the recipe directly, not the R2 approximation table. | R6: update §47.3 anchor table with final exact values. | code-reviewer |
| 2 | `sidepanel/sidepanel.css:51-57` `.group-color-chip` | Pre-existing issue (not B-104): no `background-color` default; uncolored groups render a transparent 10×10 phantom chip. More visible now that headers are tinted. | Add explicit `background-color: transparent` for clarity, OR document chip-removal-on-uncolored-headers as a follow-up. | code-reviewer |
| 3 | `popup/group-jump-popup.js:730` comment | References `--gj-group-color` in code comment on a line that has already deleted the property. Slightly confusing past-tense omission. | Rephrase comment to past-tense to make it clearly historical. | code-reviewer |
| 4 | `shared/themes.css` `[data-theme="dracula"]` block | `--gc-indigo` and `--gc-blue` are intentionally non-unique per §47.3 D-1, but no in-code comment flagging the collision. Risk a future reviewer "fixing" by mistake. | Add comment directly above `--gc-indigo` line: `/* intentional: Dracula has no native indigo; reuses purple per §47.3 D-1 */`. Same for `one-dark` `--gc-pink` and `--gc-indigo`. | code-reviewer |
| 5 | `popup/group-jump-popup.js:736` | Defense-in-depth: `chip.dataset.color = pickerRow.color` is gated by `GROUP_COLORS.includes(pickerRow.color)`; safe. But the per-slot `[data-color="<slot>"]` selector list in CSS and the JS allow-list are two separate sources of truth — if a 10th slot is added, both must update in lockstep. | Optional: add a test asserting every entry in `GROUP_COLORS` has a matching `[data-color="<slot>"]` rule. Defer to a future sprint. | security-reviewer |
| 6 | `sidepanel/sidepanel.js:2190` / `newtab/newtab.js:710` | Template-literal interpolation `` `var(--gc-${group.color})` `` into inline style. Two-layer defense in place (`GROUP_COLORS.includes` gate + upstream `assertValidColor` allow-list at write time). | Optional: add a single-line comment at each interpolation site noting the safety contract (gate + upstream). | security-reviewer |
| 7 | `shared/themes.css` (count of `--gc-blue` = 17 vs expected 16) | R2 D-3 expected count off-by-one (didn't account for system-dark nested override). Actual count is correct. | R6: update R2/R6 documentation count from 16 to 17. | qa-reviewer |
| 8 | `sidepanel/sidepanel.css:204` | No CSS `@supports` fallback for `color-mix` unsupported environment. Defensive only — Edge/Chrome 130+ baseline makes this unnecessary. | Optional: add `@supports not (background: color-mix(...)) { ... }` block as defensive fallback. LOW priority. | qa-reviewer |

### Summary

- **B-104 R4 totals**: 0 CRITICAL / 3 HIGH / 4 MEDIUM / 8 LOW
- **Verdict**: FIX-BEFORE-R5 — 3 HIGHs (solarized-light WCAG AA + ungrouped slate leak + hover compound) all require R3-fix before R5
- **Code review**: PROCEED (0 HIGH; 2 MEDIUM are documentation/clarity)
- **Security review**: PROCEED (0 HIGH; 2 LOW are defense-in-depth notes)
- **QA review**: FIX-BEFORE-R5 (3 HIGH WCAG AA failures + 2 MEDIUM)

---

## Cross-item totals (Sprint 34)

- **CRITICAL**: 0 (both items)
- **HIGH**: 1 B-101 (test-stub stale, R5 fix) + 3 B-104 (WCAG AA + ungrouped + hover) = **4 HIGH**
- **MEDIUM**: 2 B-101 + 4 B-104 = **6 MEDIUM**
- **LOW**: 7 B-101 + 8 B-104 = **15 LOW**

All 4 HIGHs have explicit fix paths. No CRITICAL findings.
