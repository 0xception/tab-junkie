# §54 — B-108 Solarized-Light `--text-secondary` WCAG AA Contrast Fix (R2 Design)

**Sprint:** 36
**Tier:** Full (S)
**Status:** R6 close complete (2026-04-27) — shipped on `feature/sprint-36-ui-polish`. See §54.10.
**Owner:** [solution-architect]
**Depends on:** §52 (B-105 — `--text-primary` baseline + 3% per-theme tint override pattern); §47 (B-104 — `--group-header-tint-amount` per-theme escape hatch + 9-slot `--gc-*` algorithmic tint recipe); §45 (B-037 — theme system + `shared/themes.css` token surface)
**Out-of-scope (explicit):** (a) Changing `--text-primary` (already at `#546a71` post-B-105); (b) Lightening `--bg-secondary` (cascading change surface, REJECTED at R1 Q1); (c) Adjusting `--text-tertiary` (`#93a1a1`) — pre-existing 2.18:1 vs `--bg-secondary`, but `--text-tertiary` consumers are UI components governed by WCAG 1.4.11 (3:1 floor) — separate palette concern; (d) Adjusting `--drifted-color`, `--audible-color`, or other indicator tokens; (e) Touching any other theme — only solarized-light's secondary text fails AA; (f) Storage schema changes; (g) Manifest changes; (h) New message contracts; (i) New tests on `chrome-mock` (CSS-token + JS pure-math contrast test, mirrors B-105 R5 pattern).

---

## §54.1 Overview

B-108 corrects a pre-existing WCAG AA contrast defect in the `solarized-light` theme's `--text-secondary` token. The defect was surfaced — not caused — by S35 B-105 R4 [qa-reviewer] (MEDIUM M-1) and explicitly deferred to B-108 per §52.6 Q1 and §52.3 D-1 footnote. Today's value `--text-secondary: #657b83` (Solarized canonical base00) on `--bg-secondary: #eee8d5` (Solarized canonical base2) measures **3.6355:1** — sub-AA *before* any group-color tint is applied. This affects group count badges (`--group-count-text` aliases the same hex), helper text in dialog bodies / settings labels / item URLs, and the `.empty-state-message` / `.error-state-message` / `.filter-empty-state-message` copy.

The R2 design ships **two coordinated edits** inside `[data-theme="solarized-light"]` in `shared/themes.css`:
1. Darken `--text-secondary` from `#657b83` → `#546a72` (4.6553:1 vs `#eee8d5`, +0.155 above the 4.5:1 floor). Delta −17 per channel from canonical base00. R1 LOCKED.
2. Darken `--group-count-text` from `#657b83` → `#546a72` to match. **R1's claim that updating `--text-secondary` automatically fixes `--group-count-text` is FACTUALLY WRONG** — `--group-count-text` is a string-duplicated hex on line 333 of `shared/themes.css`, NOT a `var(--text-secondary)` reference. R3 MUST edit both tokens. **This is the binding R2 correction to R1 LOCKED.**

Zero new manifest permissions, zero new message contracts, zero storage schema bump. R3 lands ~3 LOC of CSS edits in one block (two token assignments + one inline comment) plus a test file (~80 LOC of pure-math contrast assertions). This is structurally identical to the B-105 (§52) shipping pattern.

---

## §54.2 Existing-State Reality Check

**Today (2026-04-26 on `feature/sprint-36-ui-polish`, branched off `release/v2`):**

- `shared/themes.css:307-365` declares the `[data-theme="solarized-light"]` palette block (post-B-105 / B-106 state).
- The two load-bearing tokens for B-108:
  - `--text-secondary: #657b83;` (line 313) — Solarized canonical base00. **The defect.**
  - `--group-count-text: #657b83;` (line 333) — string-duplicated hex of base00. **Also defective and must be updated together.**
- The bg-secondary surface that triggers the failure: `--bg-secondary: #eee8d5;` (line 309). Computed contrast `#657b83` vs `#eee8d5` = **3.6355:1 — FAIL AA (4.5:1 floor)**.
- Adjacent token state (post-B-105):
  - `--text-primary: #546a71;` (line 312) — already passes AA at 4.6611:1 vs `--bg-secondary`.
  - `--group-header-tint-amount: 3%;` (line 364) — per-theme override locked at 3% as the AA safe ceiling for `--text-primary` on tinted group headers (§52 D-2). B-108 does NOT touch this.
- `--text-secondary` consumers across the codebase (verified by `grep -rn "var(--text-secondary)"`):
  - `sidepanel/sidepanel.css`: 23 references (item URL, dialog body, dialog labels, panel header title, error/empty/filter-empty state messages, group drag handle icon, helper text in import dialog, etc.)
  - `newtab/newtab.css`: 3 references (newtab web-search-submit icon, header secondary copy)
  - `popup/group-jump-popup.css`: 1 reference (aliased to `--color-fg-muted`)
  - `popup/popup.css`: 1 reference (aliased to `--color-fg-muted`)
  - `settings/settings.css`: 5 references (section placeholders, helper labels, theme picker secondary copy, etc.)
  - **Total: 33 references across 5 surface files** (R1's count of 32 was off by one — `popup/popup.css` was missed; corrected here).
- `docs/design/52-b-105-solarized-light-fix.md` §52.6 Q1 explicitly tracks this defect and forwards it to B-108. §52.3 D-1 footnote also records the deferral.
- `docs/findings/sprint-35.md` records B-105 R4 M-1 as the originating event.

**No pre-existing B-108 code, no scaffolding.** Single-file CSS change to `shared/themes.css` (two token edits in one block) plus one new test file.

---

## §54.3 Design Decisions (D-1 through D-3)

### D-1 — `--text-secondary` darkened from `#657b83` → `#546a72` (R1 LOCKED, R2 confirmed)

**Choice:** Confirm R1 LOCKED `#546a72`. Delta of −17 per RGB channel from canonical Solarized base00 (R: 101→84, G: 123→106, B: 131→114). Luminance reduction ~28% in linear sRGB.

**Computed WCAG 2.1 contrast (R2 independent re-verification):**

| Surface | Hex | Contrast vs `#546a72` | Verdict |
|---|---|---|---|
| `--bg-primary` | `#fdf6e3` | **5.2880:1** | PASS (+0.788 above floor) |
| `--bg-secondary` (the failure surface) | `#eee8d5` | **4.6553:1** | PASS (+0.155 above floor) |
| `--bg-hover` | `#e4dcc4` | 4.1649:1 | Sub-AA (4.5) but PASS WCAG 1.4.11 (3:1 for UI) — see C-9 footnote below |
| `--bg-active` | `#d8d2bd` | 3.7683:1 | Sub-AA (4.5) but PASS WCAG 1.4.11 (3:1 for UI) — see C-9 footnote below |
| `--accent-subtle` / `--selected-bg` / `--active-bg` | `#e3eef7` | **4.8455:1** | PASS (+0.346 above floor) |
| `--mark-bg` (search highlight) | `#f4e8a8` | **4.6053:1** | PASS (+0.105 above floor) |
| `--group-count-bg` | `#eee8d5` | **4.6553:1** | PASS (identical to `--bg-secondary`) |
| `--active-bg-hover` | `#cfe1f0` | 4.2595:1 | Sub-AA (4.5) but PASS 1.4.11 (3:1) — see footnote |

**Tinted group header surfaces (3% per-theme override × 9 `--gc-*` slots):**

| Slot | Tinted bg (3% color-mix vs `#eee8d5`) | Contrast vs `#546a72` | Verdict |
|---|---|---|---|
| blue (`#618be4`) | `#eae5d5` | 4.5272:1 | PASS |
| purple (`#9e6ee6`) | `#ece4d6` | 4.5185:1 | PASS (worst slot) |
| teal (`#50ad9f`) | `#e9e6d3` | 4.5427:1 | PASS |
| red (`#e1605b`) | `#eee4d1` | 4.5235:1 | PASS |
| orange (`#eb8348`) | `#eee5d1` | 4.5535:1 | PASS |
| pink (`#e16193`) | `#eee4d3` | 4.5289:1 | PASS |
| indigo (`#7f77e0`) | `#ebe5d5` | 4.5364:1 | PASS |
| yellow (`#d5a643`) | `#ede6d1` | 4.5742:1 | PASS |
| slate (`#8d97a1`) | `#ebe6d3` | 4.5611:1 | PASS |

All 9 tinted slots pass AA at 3% tint. Worst slot (purple) at 4.5185:1 leaves +0.018 headroom. This is binding only for the `.group-drag-handle` SVG icon (six-dot grab handle) which renders inside `.group-header` — but per WCAG 1.4.11 (Non-text Contrast) icons require only 3:1, not 4.5:1, so the 4.52 worst-case is comfortable headroom. No body text consumer of `--text-secondary` renders directly on a tinted group header surface (group titles use `--text-primary`, group counts use the untinted `--group-count-bg`).

**Why `#546a72` specifically (R2 ratification of R1 LOCKED):**
- The R1 LOCKED rationale mirrors the B-105 §52.3 D-1 precedent: target ~0.155 headroom above the 4.5:1 floor (B-105 landed `--text-primary` at 4.661:1 with 0.161 headroom; B-108 lands `--text-secondary` at 4.655:1 with 0.155 headroom). This is intentional consistency, not coincidence.
- R2 swept candidates from delta -10 to delta -24 per channel (see §54.2 sweep table reference). Smaller deltas (e.g., delta -14 `#576d75` at 4.4522:1, delta -15 `#566c74` at 4.5187:1 with +0.019 headroom) are FAIL or too tight; larger deltas (delta -22 `#4f656d` at 5.0191:1) overshoot the B-105 precedent margin. Delta -17 `#546a72` is the precise inflection point that mirrors B-105.
- **Visual hierarchy observation (R2 acknowledgement, not a blocker):** at `#546a72`, the luminance gap between `--text-primary` (`#546a71`, lum 0.13385) and `--text-secondary` (`#546a72`, lum 0.13408) is only +0.00023 in linear sRGB (~0.17%). This is below the typical perceptual threshold for adjacent surfaces (~1%). In side-by-side renders, secondary text and primary text will read as functionally identical in luminance — only the slight bluish bias of secondary distinguishes them. R2 considered alternative `#556b73` (lum 0.13684, ~2.24% lighter than primary, 4.5864:1 vs `--bg-secondary`) for stronger hierarchy, but `#556b73` would re-introduce sub-4.5 readings on 8 of 9 tinted group header surfaces (worst purple at 4.4515:1) — even though those surfaces only host icons (1.4.11 3:1 governs), the precedent of B-105's safe-ceiling philosophy argues against accepting any surface drop below 4.5. **R2 confirms R1 LOCKED `#546a72`** and accepts the visual-hierarchy collapse as a deliberate tradeoff for AA-everywhere-text margin. Future sprint may revisit if the hierarchy collapse is identified as a UAT regression.
- **Why deviate from Solarized canonical at all:** WCAG AA is a stronger product value than canonical-palette purity for Tab Junkie users. Same precedent as B-105 D-1. The deviation is the second AA-driven deviation in the solarized-light block (text-primary was the first); both are documented in-CSS and in adjacent design chapters (§52, §54).

**Why not lighten `--bg-secondary` instead:** would cascade into `--bg-hover`, `--bg-active`, `--border-primary`, `--border-subtle`, `--skeleton-base`, `--group-count-bg`, AND would invalidate the B-105 baseline (`--text-primary` at 4.661:1 vs `#eee8d5` would shift). High change surface for a 1-token AA fix. R1 Q1 already rejected this approach.

### D-2 — `--group-count-text` ALSO darkened from `#657b83` → `#546a72` (R2 BINDING CORRECTION to R1 LOCKED)

**Choice:** R2 binding correction to R1 LOCKED Q3.

**R1 LOCKED Q3 claim:** *"`--group-count-text` in `shared/themes.css` line 334 directly aliases `--text-secondary` hex; updating `--text-secondary` automatically fixes `--group-count-text` — no separate token edit required."*

**R2 finding: this is FACTUALLY WRONG.** `shared/themes.css` line 333 reads `--group-count-text: #657b83;` — a **string-duplicated literal hex value**, NOT `var(--text-secondary)`. Updating `--text-secondary` to `#546a72` will NOT propagate to `--group-count-text` because there is no var-reference link. If R3 ships only the `--text-secondary` edit per R1 LOCKED, `--group-count-text` will remain at `#657b83` and the group count badges will continue to fail AA at 3.6355:1. AC2 (computed contrast assertion) would pass; AC3 (the inheritance assertion) would FAIL because there is no inheritance to begin with. Group count badges — the *originating* failure surface called out in the B-105 R4 M-1 finding — would NOT be fixed.

**R2 binding correction:** R3 MUST update BOTH lines:
- Line 313: `--text-secondary: #657b83;` → `--text-secondary: #546a72;`
- Line 333: `--group-count-text: #657b83;` → `--group-count-text: #546a72;`

**Why not refactor to `--group-count-text: var(--text-secondary);` instead:** the existing pattern across all 14 themes uses string-duplicated hex values for `--group-count-text` (each theme has its own literal, sometimes intentionally diverging from `--text-secondary` — e.g., `github-dark` has both at `#8b949e`; `dracula` has both at `#c5c5d2`; but the duplication-vs-aliasing decision was made at B-037 and has been consistent across 35 sprints). Changing the pattern from "literal hex" to "var alias" is a B-104-style cross-theme refactor — out of scope for B-108 (which is a single-theme accessibility fix). R3 ships the simpler "two literal hex updates" pattern, matching the 13 other themes' duplication style. A future sprint may file a separate refactor item to convert `--group-count-text` to `var(--text-secondary)` across all 14 themes if a global pattern simplification is desired.

**AC3 implication for the test plan:** R1 LOCKED's AC3 reads *"`--group-count-text` in solarized-light (`#657b83`, aliasing `--text-secondary`) inherits the fix automatically; test T2 guards that the `--group-count-text` declaration in the solarized-light block equals `#657b83`"*. This AC is **incorrect** as authored. R2 reframes AC3 for R3:

> **AC3 (R2-corrected):** Both `--text-secondary` AND `--group-count-text` in `[data-theme="solarized-light"]` are updated to `#546a72`. T2 guards the post-update value of BOTH tokens (NOT the pre-update value). The test asserts: solarized-light `--text-secondary` == `#546a72` AND solarized-light `--group-count-text` == `#546a72`.

R3 [frontend-engineer] should treat this corrected AC3 as binding. The `BACKLOG.md` row text remains unchanged (R1 LOCKED is locked) but the test/fix scope is updated per this R2 correction. Orchestrator may update `BACKLOG.md` row B-108 acceptance text to reflect the R2-corrected AC3 wording, or leave R1 text as-is and rely on this chapter as the authoritative interpretation.

### D-3 — Inline comment block update (R3 work — flagged at R2)

**Choice:** R3 [frontend-engineer] adds a B-108 comment block adjacent to (or inline with) the two updated token declarations, mirroring the B-105 comment style (lines 355-363 of `shared/themes.css`).

**Suggested copy for R3:**

```css
--text-secondary: #546a72; /* B-108: bumped from canonical Solarized base00 #657b83 to #546a72 for WCAG AA (4.655:1 vs --bg-secondary). See docs/design/54-b-108-solarized-light-secondary-fix.md */
...
--group-count-text: #546a72; /* B-108: matches --text-secondary; literal hex (not var alias) per cross-theme pattern. See docs/design/54-b-108-solarized-light-secondary-fix.md */
```

**Why a comment is mandatory, not optional:** the per-theme accessibility-override docstring rule established as a B-105 new precedent (§52 "New precedents established" item 2) requires that any per-theme variable override chosen for accessibility be documented explicitly in the CSS comment block above the override. B-108 extends this rule to cover token VALUE choices (not just override-presence). Without the comment, a future R3 author swapping `--text-secondary` back to canonical `#657b83` (e.g., during a "Solarized canonical fidelity restoration" refactor) would silently re-introduce the AA failure.

---

## §54.4 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Note |
|---|---|---|---|
| **C-1** | Storage schema versioned | **N/A** | Zero storage changes. No `tj:meta.schemaVersion` bump. No persisted-data shape change. No `DEFAULT_PREFERENCES` modification. |
| **C-2** | Message contracts typed | **N/A** | Zero new message types. Zero modified message handlers. |
| **C-3** | Service worker cold-start safe | **N/A** | Zero SW code touched. CSS-token edit only. |
| **C-4** | ID stability | **N/A** | No item, group, or other identity surface affected. |
| **C-5** | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. |
| **C-6** | Permission minimization | **N/A** | Zero new `permissions` array entries. |
| **C-7** | Allow-list direction | **N/A** | No validators or sanitizers modified. |
| **C-8** | SW-context feasibility | **N/A** | No browser-API requirement. CSS resolves in page context. |
| **C-9** | Empty-state design | **PASS** | Six enumerated states: (a) user on solarized-light with `.empty-state-message` rendered (zero-items / zero-groups) — text on `--bg-primary` `#fdf6e3` at **5.288:1 PASS**; (b) user on solarized-light with `.error-state-message` rendered — text on `--bg-primary` at **5.288:1 PASS**; (c) user on solarized-light with `.filter-empty-state-message` rendered (zero search matches) — text on `--bg-primary` at **5.288:1 PASS**; (d) group count badge visible — text on `--group-count-bg` `#eee8d5` at **4.655:1 PASS** (the originating failure surface); (e) item URL on row hover (`--bg-hover` `#e4dcc4`) — `.item-url` color is `--text-secondary`, contrast at hover is **4.165:1**, sub-AA — but this is a PRE-EXISTING borderline state on solarized-light (`--text-primary` itself measures only 4.170:1 vs `--bg-hover`), NOT introduced by B-108. The item-url in the dense layout is hidden entirely; in standard layout the URL line is rendered briefly during pointer hover. WCAG 1.4.3 governs (4.5:1 for normal text under 18pt) — `.item-url` is 11px which qualifies as small text; therefore borderline FAIL at hover on solarized-light is a known limitation inherited from the entire solarized-light hover surface, NOT a B-108 regression. Tracked as a future-work flag in §54.6 Open Questions; (f) user switches FROM solarized-light to another theme → CSS cascade picks up the destination theme's `--text-secondary` and `--group-count-text` — no orphan styling, no in-between state. **R2 independently re-verified the math** for all surfaces (see §54.3 D-1 contrast tables). |
| **C-10** | Off-screen rect feasibility | **N/A** | No off-screen positioning, no snapshot APIs. |
| **C-11** | Popup-lifecycle message ordering | **N/A** | No popup surfaces involved. The `popup/popup.css` and `popup/group-jump-popup.css` consumers of `--text-secondary` are pure styling — no message-passing dependency on the token value. |
| **C-12** | Manifest declaration runtime-mutability | **N/A** | Zero manifest declarations added or modified. Pure CSS token update. |

**Verdict count:** 0 PASS-with-action / 1 PASS / 11 N/A. Zero blocking concerns. R3 may proceed with the binding D-2 correction applied (update BOTH `--text-secondary` AND `--group-count-text`).

---

## §54.5 R3 Fix Scope

**Files touched in R3:**

| File | Edit type | LOC count | Notes |
|------|-----------|-----------|-------|
| `shared/themes.css` | 2 token-value updates + 1 inline comment block | ~3-5 LOC | Lines 313 + 333 inside `[data-theme="solarized-light"]` block. Comment block per §54.3 D-3 suggested copy. |
| `tests/b108-solarized-secondary-contrast.test.js` | NEW file | ~80 LOC | T1-T4 per AC5; can be authored by R5 [test-engineer] or R3 [frontend-engineer]. |

**Total R3 source change footprint:** ~3-5 LOC of CSS + ~80 LOC of new test = ~85 LOC. Single file edit + one new test file.

**No JS code touched.** No HTML touched. No manifest touched. No other CSS files touched (the consumer CSS files at `sidepanel/sidepanel.css`, `newtab/newtab.css`, `settings/settings.css`, `popup/popup.css`, `popup/group-jump-popup.css` already use `var(--text-secondary)` and require zero changes — they automatically pick up the new token value via CSS cascade).

**Surfaces verified to receive the fix automatically:** all 33 `var(--text-secondary)` consumers across the 5 surface files. Plus the 14 themes' worth of `--group-count-text` declarations (only solarized-light is touched; the other 13 themes' `--group-count-text` literals are unchanged and continue to work as before).

---

## §54.6 R5 Test Plan (test-engineer obligation)

**File:** `tests/b108-solarized-secondary-contrast.test.js` (NEW — ≥ 4 tests per AC5)

**T1 — Computed WCAG AA contrast assertion (the binding accessibility check).**
- Compute WCAG 2.1 luminance + contrast ratio for `#546a72` against `#eee8d5` (solarized-light `--bg-secondary`).
- Assert ratio ≥ 4.5 (strict).
- Expected: 4.6553:1 PASS.

**T2 — Token value regression guard (corrected per §54.3 D-2 R2 binding correction).**
- Read `shared/themes.css` as a string.
- Locate the `[data-theme="solarized-light"]` block (regex match on the selector + opening brace through the closing brace).
- Assert the block contains BOTH:
  - `--text-secondary: #546a72;` (post-update value)
  - `--group-count-text: #546a72;` (post-update value, matching `--text-secondary`)
- Assert the block does NOT contain `--text-secondary: #657b83;` (the pre-update value) anywhere.
- Assert the block does NOT contain `--group-count-text: #657b83;` (the pre-update value) anywhere.
- This T2 explicitly guards against R3 forgetting the D-2 binding correction (a literal grep for the pre-update hex catches partial fixes).

**T3 — Cross-surface completeness check.**
- Compute contrast of `#546a72` against each of: `--bg-primary` `#fdf6e3`, `--bg-secondary` `#eee8d5`, `--mark-bg` `#f4e8a8`, `--accent-subtle` `#e3eef7`, `--group-count-bg` `#eee8d5`.
- Assert every contrast ≥ 4.5 except `--bg-hover`/`--bg-active`/`--active-bg-hover` (these are documented sub-AA pre-existing surfaces, see §54.4 C-9 footnote (e); T3 does NOT assert these to avoid over-constraining the check).
- Expected: all 5 listed surfaces PASS.

**T4 — Catalog regression (other 13 themes unchanged).**
- For each theme other than solarized-light (13 themes per the actual catalog in `shared/themes.css`: `system`, `github-light`, `tomorrow`, `atom-one-light`, `github-dark`, `tomorrow-night`, `atom-one-dark`, `solarized-dark`, `dracula`, `nord`, `one-dark`, `monokai`, `tokyo-night`), assert the `--text-secondary` and `--group-count-text` token values in their respective theme blocks are unchanged from pre-B-108 values.
- **R6 correction (was: github-dim, one-dark-pro, palenight, gruvbox-dark) — those slugs do not exist in `shared/themes.css`. R5 [qa-reviewer] M-2 caught the divergence; the shipped test `PRE_B108_BASELINE` uses the correct slugs above.**
- Specifically: capture pre-B-108 baseline values from the source-controlled `shared/themes.css` (or hard-code the 13 expected values in the test) and assert post-B-108 the same 13 themes have identical token values.
- Expected: all 13 themes' `--text-secondary` and `--group-count-text` unchanged (only solarized-light's two tokens were modified).

**T5 (optional bonus, mirrors B-105 T6) — 9-slot @ 3% tint contrast smoke test on solarized-light.**
- For each of the 9 `--gc-*` slots, compute the 3% color-mix tint of the slot color over `--bg-secondary`, then compute contrast of `#546a72` against the tinted bg.
- Assert all 9 contrasts ≥ 4.5 (strict — body text floor) OR ≥ 3.0 (UI component floor, since `.group-drag-handle` icon is the only `--text-secondary` consumer on tinted headers).
- Expected: all 9 slots PASS the stricter 4.5 floor (worst slot purple at 4.5185:1 — see §54.3 D-1 table).

**Test count:** ≥ 4 tests required by AC5; R5 may ship 5 if T5 is included. The B-105 precedent (§52.7) shipped 7 tests including a directional/monotonic-decrease guard — B-108 doesn't strictly need that since the tint% is fixed at 3% (not swept), but T5 provides equivalent peace of mind.

---

## §54.7 R5 UAT Plan (test-engineer obligation, ≥ 3 cases per AC5)

**UAT-1 (priority B — basic) — Group count badges legible in solarized-light.**
- Steps: Switch theme to `solarized-light` in settings. Open the sidepanel. Observe group count badges (the small pill numbers next to each group name in the group header).
- Expected: count text is clearly legible against the cream pill background (`--group-count-bg` `#eee8d5`). No "washed out" or "ghost text" feel.
- PASS criterion: legibility comparable to other light themes (e.g., github-light, atom-one-light).
- Validates: AC1 + AC3 (post-R2 D-2 correction).

**UAT-2 (priority H — high) — Helper text and secondary copy legible across sidepanel + settings + dialog surfaces.**
- Steps: In solarized-light theme, walk through (a) the empty state (clear all items so `.empty-state-message` is visible); (b) the filter empty state (apply a filter that matches no items so `.filter-empty-state-message` is visible); (c) open the bookmark CRUD dialog and inspect `.dialog-body`, `.dialog-label`, helper text under inputs; (d) open the settings page and inspect `.settings-section-placeholder` italic copy.
- Expected: every secondary-text surface reads clearly without squinting. The text is darker than canonical Solarized base00 (intentionally — see §54.3 D-1 deviation rationale) but still maintains the warm Solarized aesthetic.
- PASS criterion: subjective legibility on a normal-DPI display at arm's length passes a "comfortable to read for 30 seconds" check.
- Validates: AC1 (cross-surface coverage).

**UAT-3 (priority H — high) — Other 13 themes show zero regression.**
- Steps: Cycle through all 13 non-solarized-light themes via the settings theme picker. For each theme, open the sidepanel, observe group count badges and helper text.
- Expected: no visual difference from pre-B-108 in any of the 13 other themes. Token values unchanged → rendering unchanged.
- PASS criterion (R6-clarified per R4 [qa-reviewer] M-3): a sanity check, not a binding regression gate — "no obvious visual change is detectable" in any other theme. The binding regression check is T4 (automated; reads pre-B-108 baseline hex values for all 13 themes from a frozen `PRE_B108_BASELINE` map and asserts equality). UAT-3 catches drift not captured by static-token assertions (cascade interactions, runtime-only computed surfaces). Side-by-side comparison with a pre-B-108 build is impractical in a single Edge profile; rely on T4 for the binding check.
- Validates: AC4 (catalog regression guard) + complements T4 automated test.

**UAT-4 (priority M — medium, optional) — `#546a72` deviation from canonical Solarized base00 `#657b83` is barely perceptible.**
- Steps: In solarized-light theme, view secondary text (e.g., dialog body, group counts). Mentally compare with the canonical Solarized base00 color (e.g., by viewing a reference image of the canonical Solarized palette in another browser tab or app).
- Expected: the darker `#546a72` is detectable on close inspection but does not break the warm-cream Solarized aesthetic. Most observers will not notice the deviation in normal use.
- PASS criterion: deviation is acceptable for the AA improvement it delivers.
- Validates: §54.3 D-1 deviation tradeoff.

**UAT-5 (priority M — medium, optional) — Visual hierarchy primary-vs-secondary detectable (or noted as collapsed).**
- Steps: In solarized-light theme, open a dialog with both `.dialog-title` (primary text) and `.dialog-body` (secondary text) visible. View an item row with `.item-title` (primary) above `.item-url` (secondary).
- Expected: there IS a perceivable difference between primary and secondary text but it is more subtle than in other light themes (R2 §54.3 D-1 explicitly noted the luminance gap collapses to ~0.17%; only the slight bluish bias of `#546a72` distinguishes it from `#546a71`).
- PASS criterion: observer can still tell which text is primary vs secondary on close inspection. If observer reports "they look identical" — record as WARN, NOT FAIL (the AA win takes precedence per R2 D-1, but the data point informs the §54.6 Q1 future-work decision).
- Validates: R2 D-1 visual-hierarchy observation.

**UAT count:** ≥ 3 required by AC5; R5 may ship 5. Mirrors B-105 §52.7 "5 cases UAT-1..UAT-5" precedent footprint.

---

## §54.8 Rollback Plan

**Rollback trigger conditions:**
- SEV3 (visual regression): user reports `#546a72` text reads as visibly different from canonical Solarized OR is "too dark" for the warm cream aesthetic.
- SEV3 (visual-hierarchy critique): user reports they cannot distinguish primary from secondary text in solarized-light.
- SEV3 (AA-fix incomplete): if a missed surface is discovered post-merge that still reads sub-AA at the new value (e.g., a new dialog surface introduced by a future sprint that uses `--text-secondary` on a previously-unverified bg).

**Rollback procedure (SEV3, single-token revert):**

1. `git revert <merge-sha-of-B-108-PR>` on `release/v2`. The diff is one CSS file (`shared/themes.css`) with two token edits + one comment block + the new test file.
2. Tag a hotfix release if the revert lands mid-sprint (e.g., `v1.30.1`).
3. The reverted state matches the pre-B-108 v1.29.0 visual exactly. No data is lost. No storage migration. No user action required after the revert lands.

**Rollback for any partial-revert scenario:** if a future palette refactor wants to keep B-108's `--text-secondary` darkening but revert `--group-count-text` (or vice versa), the two tokens are independently revertable since they are separate CSS declarations. A surgical revert of just one line is mechanically trivial.

**Rollback compatibility with B-105 / B-106:** B-108 does NOT touch `--text-primary` (B-105's domain) or `--group-header-tint-amount` (B-105 D-2 / B-106's domain). Reverting B-108 has zero interaction with B-105 or B-106 — they remain in force. Conversely, reverting B-105 (which is now in production at v1.29.0) would not invalidate B-108's `--text-secondary` value because B-108's contrast computation against `--bg-secondary` is independent of `--text-primary`.

**SEV severity:** SEV3 (minor visual refinement). Not a data-loss path, not a broken-feature path, not a security path. Same severity envelope as B-105.

---

## §54.9 Open Questions

**Q1 — Visual-hierarchy collapse between `--text-primary` (`#546a71`) and `--text-secondary` (`#546a72`).** R2 §54.3 D-1 documented that the luminance gap is ~0.17% — below the typical perceptual threshold for adjacent surfaces. R2 confirmed `#546a72` over the alternative `#556b73` because the alternative would re-introduce sub-4.5 readings on tinted group header surfaces. **Decision needed for a future sprint:** if UAT-5 records observer reports of "primary and secondary look identical," consider one of: (a) refactor the solarized-light tinted-header strategy to use a different bg base so secondary can be lighter; (b) accept the collapse as a known characteristic of the AA-compliant Solarized Light variant and document it in the user manual; (c) revisit the `--text-primary` / `--text-secondary` palette using OKLCH-based perceptual color math to find a hue-shifted (not luminance-shifted) secondary that preserves AA AND maintains a perceivable hierarchy distinction. R2 recommends (c) as the most principled long-term fix; not a blocker for B-108 close.

**Q2 — `--text-tertiary` (`#93a1a1`) measures 2.18:1 vs `--bg-secondary` and 2.48:1 vs `--bg-primary`.** Below WCAG 1.4.11 (3:1 for UI components) on most surfaces. Affects `.group-header-collapse` icon (the chevron), `.collapse-icon` token consumers, and the `--empty-color` icon (`#93a1a1` is also `--empty-color`'s value — string-duplicated from `--text-tertiary`). **Decision needed for a future sprint:** is the chevron + empty-state icon contrast a B-108-style follow-up (e.g., `--text-tertiary: #7a8990` or similar to clear 3:1)? R1 LOCKED scoped this OUT (similar to how B-105 scoped `--text-secondary` out). Recommend filing as B-XXX in a future sprint with the same R1+R2+R3 pattern.

**Q3 — `--group-count-text` literal-vs-var pattern across all 14 themes.** Currently every theme has `--group-count-text` declared as a literal hex (sometimes matching `--text-secondary`, sometimes diverging). B-108 D-2 correction extends the duplication pattern to solarized-light. **Decision needed for a future sprint:** is a global refactor to `--group-count-text: var(--text-secondary);` (cross all 14 themes) desirable for token-graph simplicity? R2 §54.3 D-2 recommended NOT making this a B-108 scope expansion; deferral to a future sprint stands.

**None of these questions block R3 or R5 of B-108.**

---

## §54.10 As Built (R6 close — 2026-04-27)

**§54.3 D-2 binding correction verification:** R3 applied BOTH token edits as required. Verified by:
- Live grep of `[data-theme="solarized-light"]` block: `--text-secondary: #546a72;` and `--group-count-text: #546a72;` both present.
- T2 assertion (literal grep guard) passes — neither pre-update `#657b83` reference remains.
- R6 status: **COMPLETE — not routed back to R3.**

**Files changed (vs. §54.5 R3 fix scope expectation):**

| File | Edit | LOC | Matches §54.5? |
|------|------|-----|----------------|
| `shared/themes.css` (lines 313, 333) | 2 token-value updates + 2 inline B-108 comments | +2 / -2 = 4 LOC delta | ✅ within "~3-5 LOC" expectation |
| `tests/b108-solarized-secondary-contrast.test.js` (NEW) | T1 + T2 + T3 + T4 + T5 (5 tests) | 256 LOC | ✅ ≥4 tests required by AC5; shipped 5 (matches B-105 precedent's optional T5/T6 expansion) |
| `docs/SOLUTION_DESIGN.md` (TOC) | +1 line — §54 added to chapter index | +1 LOC | Required by R6 close (new chapter added) |
| `docs/design/54-b-108-solarized-light-secondary-fix.md` (this file) | M-2 fix in §54.6 T4 prose, M-3 fix in §54.7 UAT-3, §54.10 As Built filled | ~15 LOC delta | R6 work product |

**Test counts:** pre-B-108 baseline 1,476 → post-B-108 **1,481 (+5)**. Full suite passes; zero regressions.

**R4 disposition (2026-04-27):**
- **[code-reviewer]**: PASS. 3 LOW findings (helper-dup deferred, T4 system-block scope is OS-light-only, root TOC entry — all non-blocking). LOW #3 (TOC) addressed in this close.
- **[security-reviewer]**: PASS. No findings any tier — token-value-only CSS edit, pure-math test imports `node:*` only.
- **[qa-reviewer]**: PASS. 3 MEDIUM findings:
  - **M-1** (T5 reads `--gc-*` from solarized-light block): verified non-issue at orchestration time — solarized-light declares all 9 `--gc-*` tokens inside its block per B-104 algorithmic mix recipe. T5 ran 9 lookups + 9 contrast assertions successfully.
  - **M-2** (§54.6 T4 prose listed wrong theme slugs): fixed in this close — the prose now lists the actual catalog and credits the [qa-reviewer] catch.
  - **M-3** (§54.7 UAT-3 PASS criterion impractical for two-build comparison): clarified in this close — UAT-3 is a sanity check; T4 carries the binding regression guard.
- 4 LOW findings across reviewers were either pre-existing-debt acknowledgements (sub-AA hover/active surfaces, `--text-tertiary` Q2) or positive precedents (T2 literal-hex guard) — no R6 action.

**Deviations from §54.3 R2 plan:** none material. R3 shipped exactly the two token edits + comment style mirroring §52 B-105. The optional T5 (9-slot @ 3% tint) was included per §54.6 "may ship 5"; mirrors B-105 T6.

**UAT execution:** deferred to product-owner manual run in Edge per Sprint 36 close convention. UAT-1 through UAT-5 (§54.7) are documented as a checklist; results to be recorded in `SPRINT.md` "Completed This Sprint" section at sprint close.

**Follow-up backlog candidates** (file in BACKLOG.md as separate items if/when prioritized):
- **§54.9 Q1** — Solarized-light `--text-primary` vs `--text-secondary` luminance gap collapse (~0.17%). Future-work options: OKLCH-based perceptual rebalance, or accept as known characteristic.
- **§54.9 Q2** — Solarized-light `--text-tertiary: #93a1a1` measures 2.18:1 vs `--bg-secondary` (sub-WCAG 1.4.11 3:1 floor for UI). Affects chevron/empty-state-icon/collapse-icon consumers. Same pattern as B-105/B-108 follow-up.
- **§54.9 Q3** — Cross-theme refactor `--group-count-text: var(--text-secondary)` to eliminate the literal-hex duplication pattern across all 14 themes. Token-graph simplification only.
- **R4 [code-reviewer] LOW #1** — Extract `tests/_helpers/wcag.js` shared module to DRY the WCAG math helpers across `b104-group-colors.test.js`, `b105-solarized-light-contrast.test.js`, and `b108-solarized-secondary-contrast.test.js` (~40 LOC duplication across 3 files). Defer.
- **R4 [code-reviewer] LOW #2** — Extend T4 to cover both `[data-theme="system"]` branches (OS-light + OS-dark `@media`); current T4 reads only the first match (OS-light). The dark branch is currently unchanged so no false negative, but coverage is narrower than the test docstring claims.

**New precedents established:**
1. **R2 binding-correction-to-R1-LOCKED pattern** (§54.3 D-2): when R2 finds R1 LOCKED contains a factually wrong claim (string-aliased vs. literal-hex), R2 may correct the technical scope without forcing a re-lock; the corrected interpretation is binding for R3, and a literal-grep test guard (§54.6 T2) MUST be included to defend the partial-fix failure mode.
2. **WARN-not-FAIL for documented R2 tradeoffs** (§54.7 UAT-5): when R2 explicitly accepts a tradeoff (here: visual-hierarchy collapse for AA win), UAT records the tradeoff observation as WARN, not FAIL. Documented tradeoffs are not regressions; they inform follow-up sprint prioritization.
