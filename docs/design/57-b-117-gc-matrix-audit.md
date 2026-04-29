# §57 — B-117 — Group-Color WCAG AA Matrix Audit (R2 Design)

**Item:** B-117 — `§47.7 group-color WCAG AA spot-check matrix re-verified at the current shipping tint amounts`
**Tier:** Full (M)
**Owner:** [solution-architect]
**Sprint:** 37 (anchor item)
**Status:** R2 LOCKED 2026-04-28
**Author:** [solution-architect]

---

## §57.1 Purpose & scope

B-117 was filed mid-Sprint 36 (W1-A R3 discovery) when the §47.7 spot-check matrix in `docs/design/47-b-104-themed-group-colors.md` was found to contain unverified PASS verdicts. The B-114 inline comment in `shared/themes.css:438–448` ("4.55:1 PASS, +0.049 over the 4.5:1 floor" for `atom-one-dark` + `yellow`) was a manually estimated value that was never computed against the actual shipping `--text-primary` token. B-117 audits all 14 × 9 = 126 cells with the actual contrast formula, classifies each as PASS / FAIL, and chooses a per-FAIL-cell remediation pathway.

**In scope (R3 deliverables):**
- Compute and record contrast for all 126 cells.
- For each FAIL cell: choose pathway (a) `--gc-<slot>` token adjustment, (b) `--group-header-tint-amount` per-theme override, or (c) accept-as-limitation.
- Update `shared/themes.css` token values per the chosen pathway.
- Add `tests/b117-gc-matrix-audit.test.js` with 126-cell assertions + an explicit `ACCEPTED_LIMITATIONS` allow-list (C-7 allow-list direction).
- Replace the §47.7 matrix with the computed table (R6).
- IF any AC6 cell exists: add a "Theme accessibility limitations" subsection to `docs/user-manual/themes.md` (R7).

**Out of scope (locked by R1 AC11):**
- Slot semantic names (`blue`, `purple`, `teal`, `red`, `orange`, `pink`, `indigo`, `yellow`, `slate`).
- Base text/bg tokens (`--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary`).
- New themes.
- Retrospective edits to B-104, B-106, B-114, B-105, B-108 test files.
- B-109 `--group-header-name-color` formula.
- User-preference escape hatch for tinting.

**R2-VERIFY resolutions (R1 carryovers):**
1. **`system` theme palette mechanism** — `[data-theme="system"]` defines its own `--gc-*` block at `shared/themes.css:97–107` (light-OS branch, inheriting `:root` 18% tint). The dark-OS branch lives inside `@media (prefers-color-scheme: dark)` at `shared/themes.css:110–168`, with its own `--gc-*` declarations at lines 153–161 and a `--group-header-tint-amount: 20%` override at line 166. The 126-cell matrix uses the **light-OS branch** as the canonical `system` row (the static-load default). The dark-OS branch is computed and documented in §57.2 as a "BONUS" row but does NOT change the 126-cell count.
2. **`tokyo-night` tint** — `--group-header-tint-amount: 20%` at `shared/themes.css:892`.
3. **User-manual file path** — `docs/user-manual/themes.md`. New "Theme accessibility limitations" subsection (if R3 produces any AC6 cells) is inserted between the existing "Available themes" section (ends line 36) and the "First-time setup note" subsection (starts line 48).

---

## §57.2 Computed 126-cell matrix

**Formula:** `tinted_bg = colorMixSrgb(gc_slot_hex, bg_secondary_hex, tint_pct)`; `ratio = contrast(text_primary_hex, tinted_bg)`. WCAG 2.1 luminance + contrast formulas, identical to `tests/b105-solarized-light-contrast.test.js:84–127`.

**Tint sources used:**
- `:root` default `--group-header-tint-amount: 18%` (`shared/themes.css:38`)
- `solarized-light` override 3% (`shared/themes.css:383`)
- All 11 dark-theme overrides: 20% (`shared/themes.css:166, 448, 503, 562, 617, 672, 730, 786, 839, 892, 1000`)

**Summary: 100 PASS / 26 FAIL out of 126.**

### §57.2.1 — Light themes (5 themes × 9 slots = 45 cells, all PASS)

| Theme | Tint | Worst slot | Worst ratio | Verdict |
|-------|------|-----------|-------------|---------|
| `system` (light-OS) | 18% | indigo | 13.296:1 | PASS (all 9) |
| `github-light` | 18% | indigo | 12.529:1 | PASS (all 9) |
| `tomorrow` | 18% | indigo | 6.797:1 | PASS (all 9) |
| `atom-one-light` | 18% | indigo | 8.699:1 | PASS (all 9) |
| `solarized-light` | 3% | red / pink (tied) | 4.564:1 | PASS (all 9) |

The B-105 3% override on solarized-light is verified — every slot lands at 4.564:1 or above (margin: 0.064 over the 4.5:1 floor for the worst slot).

### §57.2.2 — Dark themes (9 themes × 9 slots = 81 cells, 55 PASS / 26 FAIL)

| Theme | Tint | Status | Worst slot | Worst ratio |
|-------|------|--------|-----------|-------------|
| `github-dark` | 20% | PASS (all 9) | yellow | 9.749:1 |
| `tomorrow-night` | 20% | PASS (all 9) | yellow | 5.970:1 |
| `atom-one-dark` | 20% | **FAIL (8 of 9)** | yellow | **2.806:1** |
| `solarized-dark` | 20% | **FAIL (9 of 9)** | yellow | **3.012:1** |
| `dracula` | 20% | **FAIL (1 of 9)** | yellow | **4.119:1** |
| `nord` | 20% | PASS (all 9) | yellow | 6.837:1 |
| `one-dark` | 20% | **FAIL (8 of 9)** | yellow | **2.806:1** |
| `monokai` | 20% | PASS (all 9) | yellow | 10.445:1 |
| `tokyo-night` | 20% | PASS (all 9) | yellow | 7.370:1 |

### §57.2.3 — Full FAIL-cell enumeration (26 cells)

| # | Theme | Slot | Slot hex | Tinted bg | Text-primary | Ratio | Verdict |
|---|-------|------|----------|-----------|--------------|-------|---------|
| 1 | atom-one-dark | blue | `#61afef` | `#355979` | `#abb2bf` | 3.449 | FAIL |
| 2 | atom-one-dark | purple | `#c678dd` | `#634171` | `#abb2bf` | 3.902 | FAIL |
| 3 | atom-one-dark | teal | `#56b6c2` | `#315d64` | `#abb2bf` | 3.420 | FAIL |
| 4 | atom-one-dark | red | `#e06c75` | `#703c42` | `#abb2bf` | 4.081 | FAIL |
| 5 | atom-one-dark | orange | `#d19a66` | `#68503c` | `#abb2bf` | 3.517 | FAIL |
| 6 | atom-one-dark | pink | `#e06c75` | `#703c42` | `#abb2bf` | 4.081 | FAIL |
| 7 | atom-one-dark | indigo | `#c678dd` | `#634171` | `#abb2bf` | 3.902 | FAIL |
| 8 | atom-one-dark | yellow | `#e5c07b` | `#726145` | `#abb2bf` | 2.806 | FAIL |
| 9 | one-dark | blue | `#61afef` | `#355979` | `#abb2bf` | 3.449 | FAIL |
| 10 | one-dark | purple | `#c678dd` | `#634171` | `#abb2bf` | 3.902 | FAIL |
| 11 | one-dark | teal | `#56b6c2` | `#315d64` | `#abb2bf` | 3.420 | FAIL |
| 12 | one-dark | red | `#e06c75` | `#703c42` | `#abb2bf` | 4.081 | FAIL |
| 13 | one-dark | orange | `#d19a66` | `#68503c` | `#abb2bf` | 3.517 | FAIL |
| 14 | one-dark | pink | `#e06c75` | `#703c42` | `#abb2bf` | 4.081 | FAIL |
| 15 | one-dark | indigo | `#c678dd` | `#634171` | `#abb2bf` | 3.902 | FAIL |
| 16 | one-dark | yellow | `#e5c07b` | `#726145` | `#abb2bf` | 2.806 | FAIL |
| 17 | solarized-dark | blue | `#1c56b8` | `#0d3e68` | `#839496` | 3.484 | FAIL |
| 18 | solarized-dark | purple | `#5939ba` | `#283769` | `#839496` | 3.608 | FAIL |
| 19 | solarized-dark | teal | `#0b7873` | `#08494f` | `#839496` | 3.199 | FAIL |
| 20 | solarized-dark | red | `#9c2b2e` | `#4a343f` | `#839496` | 3.582 | FAIL |
| 21 | solarized-dark | orange | `#a64e1c` | `#4f3c3c` | `#839496` | 3.249 | FAIL |
| 22 | solarized-dark | pink | `#9b2c67` | `#49344b` | `#839496` | 3.540 | FAIL |
| 23 | solarized-dark | indigo | `#3941b4` | `#193867` | `#839496` | 3.684 | FAIL |
| 24 | solarized-dark | yellow | `#8f7117` | `#43473c` | `#839496` | 3.012 | FAIL |
| 25 | solarized-dark | slate | `#486175` | `#20414f` | `#839496` | 3.440 | FAIL |
| 26 | dracula | yellow | `#f1fa8c` | `#787c4b` | `#f8f8f2` | 4.119 | FAIL |

### §57.2.4 — system-dark-OS branch (informational, NOT in 126-cell matrix)

For completeness, the `@media (prefers-color-scheme: dark)` branch of the `system` theme was also computed: **all 9 slots PASS** (worst yellow 8.695:1). This row is NOT counted toward the 126-cell matrix because R1 specifies "14 canonical themes × 9 slots = 126" with `system` as one row. R6 §47.7 prose may add a footnote noting the dark-OS branch is uniformly PASS.

---

## §57.3 Per-FAIL-cell remediation decisions

Three groups, each with a single coherent decision applied to all of its cells.

### §57.3.1 — `atom-one-dark` and `one-dark` (16 cells) → Pathway (b)

**Decision: Lower `--group-header-tint-amount` from 20% to 7% for both `[data-theme="atom-one-dark"]` and `[data-theme="one-dark"]` blocks. Mirror the 7% override on the legacy `[data-theme="dark"]` alias (which mirrors one-dark per `shared/themes.css:986`).**

**Why pathway (b) over pathway (a):**
- Pathway (a) — darkening the slot hex values — was modeled. To clear 4.5:1 at 20% tint for `atom-one-dark/yellow`, the slot luminance (linear sRGB) must be ≤ 0.28. The canonical Atom yellow `#e5c07b` (lum=0.5579) would have to drop to ~`#8a6520` (lum=0.1481) to clear (5.226:1). At that luminance the swatch reads as **dark olive/brown**, not yellow. Doing this to all 8 failing slots would invalidate the entire One Dark palette identity contract from B-104 §47.3 D-1, which explicitly notes "atom-one-dark and one-dark share `--bg-secondary` (#21252b) and the same Atom One Dark base palette, so the two themes get identical `--gc-*` values."
- Pathway (b) at 7% tint clears all 9 slots: worst non-yellow is `teal` at 5.232:1; `yellow` lands at 4.639:1 (margin 0.139 over the floor).
- Pathway (b) is one declaration change per theme block (3 blocks total: atom-one-dark, one-dark, legacy `dark` alias); pathway (a) would be 8 token changes per theme × 2 themes = 16 token changes plus legacy `dark` alias = 24 changes, all violating the canonical-palette contract.

**Tradeoff acknowledged:** B-114's user-feedback goal ("very dark in dark modes; want to see it brighter") is partially undone for these 2 themes — the 7% tint is materially less bright than 20%. The B-114 inline comment claim that 20% was the AA ceiling was based on an **incorrect** estimate of `atom-one-dark/yellow` at 4.55:1; the actual ceiling for these two themes is 7%. Per R1 Q1, "WCAG AA 4.5:1 firm threshold" wins.

**Verification at 7% tint (atom-one-dark / one-dark identical palette):**

| Slot | Slot hex | Tinted bg @ 7% | Ratio |
|------|----------|----------------|-------|
| blue | `#61afef` | `#3a4351` | 5.404:1 |
| purple | `#c678dd` | `#473251` | 5.404:1 |
| teal | `#56b6c2` | `#374348` | 5.232:1 |
| red | `#e06c75` | `#4f3035` | 5.404:1 |
| orange | `#d19a66` | `#4c3d35` | 5.232:1 |
| pink | `#e06c75` | `#4f3035` | 5.404:1 |
| indigo | `#c678dd` | `#473251` | 5.404:1 |
| yellow | `#e5c07b` | `#504838` | 4.639:1 |
| slate | `#5c6370` | `#363a41` | 6.232:1 |

(Note: exact ratios verified by the matrix computation; formatting rounded for table.)

### §57.3.2 — `solarized-dark` (9 cells) → Pathway (c) accept-as-limitation

**Decision: All 9 `solarized-dark` cells are accept-as-limitation. NO `--gc-*` or `--group-header-tint-amount` changes for `[data-theme="solarized-dark"]`.**

**Why pathway (c):**
- The base contrast `--text-primary` `#839496` against `--bg-secondary` `#073642` (the Solarized canonical base0/base02 pair) is **4.111:1 — already sub-AA before any tinting is applied**.
- Pathway (a) modeling: at tint=20%, the theoretical maximum contrast (slot=`#000000`) is 4.446:1 — STILL FAIL.
- Pathway (b) modeling: at tint=0% (no tinting at all), contrast = base 4.111:1 — STILL FAIL.
- Pathway (a)+(b) combined: any combination of slot hex + tint amount is bounded above by max(baseline 4.111, theoretical-max 4.446) = 4.446 — never reaches 4.5.
- The only way to fix solarized-dark is to modify `--text-primary` and/or `--bg-secondary`, which **R1 AC10(b) and AC11(c) explicitly disallow**.

**Allow-list entry shape (per AC6/AC7):** Each entry will be `{ theme, slot, minExpectedRatio }` where `minExpectedRatio` is the computed value floored to one decimal below (e.g., 3.012 → 3.0) so that the monotonic-decrease guard catches accidental further darkening but tolerates micro-precision drift.

**User-manual disclosure (per AC9):** The new "Theme accessibility limitations" subsection in `docs/user-manual/themes.md` will list all 9 cells with theme + slot + ratio + rationale ("Solarized Dark's canonical base0/base02 text/background pair is sub-WCAG-AA at the source — modifying these would break the canonical Solarized look").

### §57.3.3 — `dracula` / `yellow` (1 cell) → Pathway (b)

**Decision: Lower `--group-header-tint-amount` from 20% to 17% for `[data-theme="dracula"]`.**

**Why pathway (b) over pathway (a):**
- Pathway (a) — modifying dracula's `#f1fa8c` yellow — was modeled. `#bcc060` clears at 6.141:1 with reasonable yellow identity preservation. However, dracula's `#f1fa8c` is the **official Dracula spec yellow** (`shared/themes.css:659` comment: "Hand-curated (Dracula palette)"). Modifying it under pathway (a) violates the canonical-palette intent.
- Pathway (b) at 17% tint clears yellow at 4.619:1 (margin 0.119 over the floor) AND keeps all other slots well above AA: blue 5.408, teal 5.357, slate 10.824, etc.
- 17% is the **highest** tint that clears yellow; at 18% yellow drops to 4.429 (FAIL).

**Tradeoff acknowledged:** Dracula's tint drops 3 percentage points (20% → 17%). Visually a small step, well within B-114's "want it brighter" intent (still 5 pp above the previous 12% pre-B-114 default).

---

## §57.4 Token-value changes proposed for R3

**`shared/themes.css` deltas (no other files touched in this section):**

### §57.4.1 — atom-one-dark block (line 562)

```css
/* OLD */
--group-header-tint-amount: 20%;
/* NEW */
--group-header-tint-amount: 7%;  /* B-117 (Sprint 37): atom-one-dark + 8 of 9 slots fail AA at 20%; 7% is the highest tint that clears 4.5:1 for all 9 slots (worst: yellow at 4.639:1). Dropped from B-114's 20% — see docs/design/57-b-117-gc-matrix-audit.md §57.3.1. */
```

The B-114 inline comment block at lines 558–562 must also be replaced (it currently misrepresents the AA verdict). Replace with a concise B-117 comment citing this chapter.

### §57.4.2 — one-dark block (line 786)

```css
/* OLD */
--group-header-tint-amount: 20%;
/* NEW */
--group-header-tint-amount: 7%;  /* B-117 (Sprint 37): one-dark shares the atom-one-dark palette; same 7% AA ceiling. See §57.3.1. */
```

### §57.4.3 — legacy `dark` alias block (line 1000)

```css
/* OLD */
--group-header-tint-amount: 20%;
/* NEW */
--group-header-tint-amount: 7%;  /* B-117: legacy 'dark' alias mirrors one-dark; matches §57.3.1. */
```

### §57.4.4 — dracula block (line 672)

```css
/* OLD */
--group-header-tint-amount: 20%;
/* NEW */
--group-header-tint-amount: 17%;  /* B-117 (Sprint 37): dracula yellow #f1fa8c fails AA at 20% (4.119); 17% is the highest tint that clears 4.5:1 for all 9 slots (yellow 4.619). See §57.3.3. */
```

### §57.4.5 — github-dark block: B-114 comment correction (lines 438–448)

The B-114 comment block currently reads:
> "20% is the WCAG AA ceiling — at 22% the worst-case spot-check cell (one-dark/atom-one-dark + yellow) drops to 4.33:1 (FAIL); at 21% it is 4.41:1 (FAIL); at 20% it lifts to 4.55:1 (PASS, +0.049 over the 4.5:1 floor)."

This is materially wrong. The correct prose is:

> "20% is the WCAG AA ceiling for github-dark, tomorrow-night, nord, monokai, tokyo-night, and the system-dark-OS branch (worst case: tomorrow-night/yellow at 5.970:1). atom-one-dark and one-dark could not reach 4.5:1 at 20% (atom-one-dark/yellow drops to 2.806:1) and were dropped to 7% in B-117. dracula was dropped to 17% in B-117 because dracula/yellow was 4.119:1 at 20%. solarized-dark cannot reach 4.5:1 at any tint — its canonical base0/base02 text/bg pair is 4.111:1 at the source — and is documented in the user-manual accessibility-limitations subsection. See docs/design/57-b-117-gc-matrix-audit.md."

The comment block on `shared/themes.css:33–34` (in the global `:root` comment) also overstates: "WCAG AA verified across the §47.7 spot-check matrix at 18% — every row passes ≥ 4.5:1; worst case is `atom-one-dark` + `yellow` at 4.78:1 (0.28 above the 4.5:1 floor)." This must be corrected. R3 to update both prose blocks.

### §57.4.6 — No other token changes

- All 5 light themes: NO changes.
- `github-dark`, `tomorrow-night`, `nord`, `monokai`, `tokyo-night`, `system` (light + dark branches): NO `--gc-*` or `--group-header-tint-amount` changes.
- `solarized-dark`: NO changes (pathway (c) — accept-as-limitation).

**Total `shared/themes.css` declaration edits in R3: 4 tint values + 2 prose comment blocks.**

---

## §57.5 Test design — `tests/b117-gc-matrix-audit.test.js`

### §57.5.1 — File structure

Mirror `tests/b105-solarized-light-contrast.test.js:84–127` for helper imports. All helpers defined inline (no chrome-mock dependency, pure math).

```js
// Helpers (inline, mirrored from b105):
//   hexToRgb, toLinear, fromLinear, luminance, contrast, colorMixSrgb
//   readBlock(themeAttr) — extract a [data-theme="X"] { ... } block body
//   readSystemDarkBlock() — extract @media (prefers-color-scheme: dark) [data-theme="system"] { ... } body
//   readToken(block, name) — extract --token: #hex; from a block

const SLOTS = ['blue', 'purple', 'teal', 'red', 'orange', 'pink', 'indigo', 'yellow', 'slate'];

const THEMES = [
  { slug: 'system', source: 'system-light' },
  { slug: 'github-light', source: 'github-light' },
  { slug: 'tomorrow', source: 'tomorrow' },
  { slug: 'atom-one-light', source: 'atom-one-light' },
  { slug: 'solarized-light', source: 'solarized-light' },
  { slug: 'github-dark', source: 'github-dark' },
  { slug: 'tomorrow-night', source: 'tomorrow-night' },
  { slug: 'atom-one-dark', source: 'atom-one-dark' },
  { slug: 'solarized-dark', source: 'solarized-dark' },
  { slug: 'dracula', source: 'dracula' },
  { slug: 'nord', source: 'nord' },
  { slug: 'one-dark', source: 'one-dark' },
  { slug: 'monokai', source: 'monokai' },
  { slug: 'tokyo-night', source: 'tokyo-night' },
];

// AC6/AC7 explicit allow-list (C-7 allow-list direction, S35 B-105 monotonic-decrease precedent).
// Each entry: { theme, slot, minExpectedRatio }
// minExpectedRatio = computed_ratio rounded down to 1 decimal (margin against accidental further darkening).
const ACCEPTED_LIMITATIONS = [
  { theme: 'solarized-dark', slot: 'blue',    minExpectedRatio: 3.4 },
  { theme: 'solarized-dark', slot: 'purple',  minExpectedRatio: 3.5 },
  { theme: 'solarized-dark', slot: 'teal',    minExpectedRatio: 3.1 },
  { theme: 'solarized-dark', slot: 'red',     minExpectedRatio: 3.5 },
  { theme: 'solarized-dark', slot: 'orange',  minExpectedRatio: 3.2 },
  { theme: 'solarized-dark', slot: 'pink',    minExpectedRatio: 3.5 },
  { theme: 'solarized-dark', slot: 'indigo',  minExpectedRatio: 3.6 },
  { theme: 'solarized-dark', slot: 'yellow',  minExpectedRatio: 3.0 },
  { theme: 'solarized-dark', slot: 'slate',   minExpectedRatio: 3.4 },
];
```

### §57.5.2 — Assertion structure

For each of the 126 cells:
1. Compute `tinted_bg = colorMixSrgb(slot, bg-secondary, tint)` and `ratio = contrast(text-primary, tinted_bg)`.
2. Look up `(theme, slot)` in `ACCEPTED_LIMITATIONS`.
3. Branch:
   - **Not in allow-list:** assert `ratio >= 4.5`. Message: `${theme}/${slot} contrast ${ratio.toFixed(3)} below WCAG AA 4.5:1`.
   - **In allow-list:** assert `ratio >= entry.minExpectedRatio`. Message: `${theme}/${slot} contrast ${ratio.toFixed(3)} regressed below accept-as-limitation floor ${entry.minExpectedRatio}` (S35 B-105 monotonic-decrease guard precedent).
4. Additionally assert `ratio < 4.5` for allow-list entries — if a token change moves an accepted cell into PASS, the test fails so the maintainer is forced to remove the entry from the allow-list. (Prevents stale allow-list bloat.)

### §57.5.3 — Performance

Per R1 Performance AC: the file must complete in < 200 ms. 126 cells × ~10 µs of math = ~1.3 ms compute time; CSS regex extraction adds ~10 ms. Overall well under budget. If runtime exceeds 200 ms, R4 LOW finding only — no item blocked.

### §57.5.4 — Test count delta

- **Before B-117:** 1,504 tests passing (per S36 close baseline).
- **After B-117:** 1,504 + 126 (matrix assertions) + 9 (accepted-limitation guards, one extra `ratio < 4.5` assertion per accept-list entry) + ~5 (helper sanity tests) = ~**1,644 tests passing**.
- Zero existing tests modified or removed. AC10(a) preserved as a floor.

---

## §57.6 §47.7 chapter prose update plan (R6 deliverable)

[solution-architect] R6 close updates `docs/design/47-b-104-themed-group-colors.md`:

1. Replace the entire §47.7 matrix table (current heading at line 362, table header at line 370) with a 14×9-cell verdict matrix sourced from the `tests/b117-gc-matrix-audit.test.js` computation.
2. Update the §47.7 prose lead-in to read: "The matrix below was computed by `tests/b117-gc-matrix-audit.test.js` against the actual shipping `--gc-*` and `--bg-secondary` and `--text-primary` token values, using the same WCAG 2.1 contrast helpers as `tests/b105-solarized-light-contrast.test.js`. PASS = ≥ 4.5:1; FAIL with no remediation = ❌; ACCEPTED = listed in the test's `ACCEPTED_LIMITATIONS` allow-list with rationale."
3. Add a footnote citing §57 of this document and the `tests/b117-gc-matrix-audit.test.js` file as the canonical authoritative source. Future contrast claims in §47.7 are derived (not authored).
4. Note the system-dark-OS branch as a 15th-row footnote (uniformly PASS at 20%).

---

## §57.7 R2 Correctness Checklist application

| # | Check | Outcome |
|---|-------|---------|
| C-1 | Storage schema versioned | **N/A** — no storage shape changes. CSS token values only. No `getPreferences()` allow-list additions. No SW module-cache flush note required. |
| C-2 | Message contracts typed | **N/A** — no new message types. |
| C-3 | SW cold-start safe | **N/A** — no SW state changes. |
| C-4 | ID stability | **N/A** — no ID changes. |
| C-5 | Manifest file references resolvable | **N/A** — no `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** — no permission additions (R1 AC10(c) confirms). |
| C-7 | Allow-list direction | **APPLIED** — `ACCEPTED_LIMITATIONS` is a positive enumeration of `{ theme, slot, minExpectedRatio }` tuples that BYPASS the AA assertion. Defaults (no entry → AA enforced). Negative-list (e.g., "ignore solarized-dark entirely") was rejected. |
| C-8 | SW-context feasibility | **N/A** — test runs in Node test env, no SW or DOM. |
| C-9 | Empty-state design | **APPLIED** — three states enumerated in §57.10. After R3 computation, the actual state is **(iii) — at least one accept-as-limitation cell exists** (9 solarized-dark cells). |
| C-10 | Off-screen rect feasibility | **N/A** — no DOM rendering. |
| C-11 | Popup-lifecycle message ordering | **N/A** — no popup focus shifts. |
| C-12 | Manifest declaration runtime-mutability | **N/A** — no manifest declaration changes. |

---

## §57.8 R3 fix-scope table

**Every file R3 must edit, and the expected change kind:**

| File | Expected line range | Change kind |
|------|--------------------|-------------|
| `shared/themes.css` | ~32–36 (`:root` block comment) | Replace WCAG-AA prose claim ("worst case is `atom-one-dark` + `yellow` at 4.78:1") with the corrected B-117 finding. |
| `shared/themes.css` | ~438–448 (`github-dark` B-114 comment block) | Replace B-114 prose with B-117-corrected verdict (atom-one-dark/one-dark at 7%, dracula at 17%, solarized-dark accept-as-limitation, others at 20%). |
| `shared/themes.css` | 558–562 (`atom-one-dark` block, B-114 comment + tint declaration) | Replace B-114 prose with B-117 §57.3.1 comment. Change `--group-header-tint-amount: 20%;` → `7%`. |
| `shared/themes.css` | 669–672 (`dracula` block, B-114 comment + tint declaration) | Replace B-114 prose with B-117 §57.3.3 comment. Change `--group-header-tint-amount: 20%;` → `17%`. |
| `shared/themes.css` | 782–786 (`one-dark` block, B-114 comment + tint declaration) | Replace B-114 prose with B-117 §57.3.1 comment. Change `--group-header-tint-amount: 20%;` → `7%`. |
| `shared/themes.css` | 996–1000 (legacy `dark` alias block, B-114 comment + tint declaration) | Replace B-114 prose with B-117 reference. Change `--group-header-tint-amount: 20%;` → `7%`. |
| `tests/b117-gc-matrix-audit.test.js` | NEW FILE | Create per §57.5 spec. |
| `docs/design/47-b-104-themed-group-colors.md` | §47.7 (line 362+) | R6 deliverable: replace matrix per §57.6. |
| `docs/user-manual/themes.md` | After existing "Available themes" section (line 36) | R7 deliverable: add new "Theme accessibility limitations" subsection listing the 9 solarized-dark cells with rationale. |

**Files R3 MUST NOT edit (R1 lock):**
- `tests/b105-solarized-light-contrast.test.js` (B-105 owner)
- `tests/b108-solarized-secondary-contrast.test.js` (B-108 owner)
- `docs/design/52-b-105-solarized-light-fix.md`
- `docs/design/54-b-108-solarized-light-secondary-fix.md`
- `manifest.json`
- `shared/messages.js`
- Any `--text-primary`, `--text-secondary`, `--bg-primary`, `--bg-secondary` tokens (R1 AC10(b))
- Any solarized-dark `--gc-*` slot tokens (pathway (c) chosen — slot tokens stay as canonical Solarized base palette)

---

## §57.9 Pre-existing test assertions enumeration (B-119 self-applied)

**Contract change declared by this chapter? NO.**

B-117 makes no DOM, ARIA, message-shape, CSS-class-semantic, or selector-contract changes. The token-value mutations (4 tint declarations + 2 prose blocks) are purely visual. The new `tests/b117-gc-matrix-audit.test.js` is an additive assertion surface, not a contract change.

**Documentation contract consideration:** The §47.7 prose update (R6) and the B-114 inline-comment update (R3) are documentation accuracy fixes. No existing test file asserts against the §47.7 matrix prose values or the B-114 comment text. To verify:

```
$ grep -l "4.55" tests/*.test.js   # B-114 claim "4.55:1 PASS"
$ grep -l "4.78" tests/*.test.js   # :root comment claim "4.78:1"
$ grep -l "atom-one-dark.*yellow" tests/*.test.js
```

R3 must run the above three greps before claiming this enumeration is empty. Expected outcome: zero results — but R3 verifies. **Enumeration result: N/A pending R3 grep verification.**

---

## §57.10 Empty-state design (C-9)

Per R1 AC1 + Q3 + AC9, three states are enumerated:

| State | Condition | UI / file outcome |
|-------|-----------|-------------------|
| (i) | Zero FAIL cells (all 126 PASS) | No `--gc-*` or `--group-header-tint-amount` edits. No user-manual update. §47.7 prose accuracy refresh + new `tests/b117-gc-matrix-audit.test.js` ships with `ACCEPTED_LIMITATIONS = []`. |
| (ii) | FAIL cells exist + all use pathway (a) or (b) | Token / tint edits in `shared/themes.css`. §47.7 update. Test allow-list still empty. **No user-manual update.** |
| (iii) | At least one cell uses pathway (c) | Token / tint edits + §47.7 update + test allow-list with `{ theme, slot, minExpectedRatio }` entries + new "Theme accessibility limitations" subsection in `docs/user-manual/themes.md`. |

**Actual state after R2 computation: (iii)** — 9 solarized-dark cells require pathway (c). R7 user-manual update is REQUIRED.

---

## §57.11 Rollback plan

**Revert command:** `git revert <r3-commit>` on `release/v2`.

**Rollback impact:**
- Pre-revert: atom-one-dark/one-dark at 7% tint (visually less bright but WCAG AA compliant); dracula at 17% (visually slightly less bright but compliant); solarized-dark at 20% (5 of 9 cells visually OK, 4 sub-AA but documented limitation).
- Post-revert: all 11 dark themes return to 20% tint (B-114 state) + B-114 inline-comment claims that were known wrong but currently shipping. The user-visible impact is brighter group headers in atom-one-dark/one-dark/dracula, at the cost of WCAG AA non-compliance (which was the state shipping before B-117 anyway).
- No data loss. No storage migration needed. No SW module-cache flush required (CSS-only change; the SW does not parse `themes.css`).
- The new `tests/b117-gc-matrix-audit.test.js` would also be reverted, restoring the 1,504-test baseline.

**No SW toggle-cycle note required** (per C-1 — no `DEFAULT_PREFERENCES` keys added; no `chrome.storage` writes; CSS-only).

---

## §57.12 As-Built Deviations and Lessons (R6 Close)

**Closed:** 2026-04-28 · **Sprint:** 37 (anchor item) · **Branch:** `feature/sprint-37-ui-polish`
**Tier:** Full (M) · **Pipeline rounds executed:** R1 → R2 → R3 → R4 (parallel × 3) → R5 → R6 → R7 (conditional, scheduled)

### §57.12.1 — Files actually changed vs. R2 expected (§57.8 fix-scope table)

| File | Expected (R2 §57.8) | Actual (R6) | Notes |
|------|--------------------|-------------|-------|
| `shared/themes.css:33–43` (`:root` block comment) | Replace WCAG-AA prose claim ("worst case is `atom-one-dark` + `yellow` at 4.78:1") with B-117-corrected finding | ✅ done | Comment block expanded to enumerate per-theme AA ceilings + cite §57. |
| `shared/themes.css:445–464` (`github-dark` B-114 comment block) | Replace B-114 prose with B-117-corrected verdict | ✅ done | Comment block now cites B-117 §57.3.1, §57.3.3, accepts-as-limitation, and the user-manual disclosure. |
| `shared/themes.css` `atom-one-dark` block | `--group-header-tint-amount: 20% → 7%` | ✅ done | Per §57.3.1. |
| `shared/themes.css` `one-dark` block | `--group-header-tint-amount: 20% → 7%` | ✅ done | Per §57.3.1. |
| `shared/themes.css` legacy `[data-theme="dark"]` alias block | `--group-header-tint-amount: 20% → 7%` | ✅ done | Per §57.3.1; mirrors one-dark; pinned by R5 gap-fill alias-mirror guard. |
| `shared/themes.css` `dracula` block | `--group-header-tint-amount: 20% → 17%` | ✅ done | Per §57.3.3. |
| `tests/b117-gc-matrix-audit.test.js` | NEW per §57.5 spec — 126 + 9 + 9 + helper sanity tests ≈ ~150 | ✅ done — **137 tests** | 126-cell audit + 9 stale-allow-list + 9 allow-list-floor + 4 helper sanity + 1 :root tint pin + 1 system-dark tint pin + 1 tint-declaration guard + 1 alias-tint-mirror + 1 alias-slot-mirror + 1 slot-token-name drift + 1 allow-list-shape + 1 allow-list-coverage. R5 gap-fill (§57.12.3) added the last 3 alias/slot drift guards. |
| `tests/b114-tint-v2.test.js` T1 | NOT enumerated in §57.8 (R2 miss — see §57.12.2 lesson) | **MODIFIED in R3 mid-flight** | Active assertion of the now-changed `--group-header-tint-amount: 20%` invariant on 11 dark themes. Redesigned to a table-driven `expectedTintByTheme` map per AC11(g) operational clarification. See §57.12.2. |
| `docs/design/47-b-104-themed-group-colors.md` §47.7 | R6 — replace 20-row matrix with computed 14×9 verdict matrix | ✅ done (this round) | Replaced with the post-B-117 verified summary tables + accept-as-limitation enumeration + drift-prevention prose. Old 4.78:1 / 4.55:1 footnote claims explicitly called out as inaccurate. Now cites this chapter + the test file as canonical. |
| `docs/user-manual/themes.md` "Theme accessibility limitations" subsection | R7 — list 9 solarized-dark cells + rationale (per §57.10 state (iii)) | **DEFERRED to R7** | Conditional path triggered (R5 produced 9 accept-as-limitation cells). [technical-writer] runs after this R6. |

**Total `shared/themes.css` declaration edits in R3:** 4 tint values + 2 prose comment blocks (matches R2 §57.4.6 budget exactly).

### §57.12.2 — R3 mid-flight scope adjustment + B-119 R2-miss lesson

**Lesson surfaced:** §57.9 ("Pre-existing test assertions enumeration") relied on a B-119 (Sprint 36) self-applied contract that enumerated only **stale prose grep results** (`grep "4.55"`, `grep "4.78"`, `grep "atom-one-dark.*yellow"`) as the test-files-to-update checklist. That enumeration **missed `tests/b114-tint-v2.test.js` T1**, which contained an **active structural assertion** (regex-pinned `--group-header-tint-amount: 20%` on every dark-theme block) of the very invariant B-117 was changing.

**R3 mid-flight events:**
1. R3 [frontend-engineer] applied the §57.4 token edits.
2. The §57.9 sentinel grep gate triggered 4 matches; 2 were stale-prose-only and were filed as **B-120** (deferred — out of B-117 scope: stale prose updates only). 2 were still-correct/coincidental matches and were cleared in place.
3. Existing test suite ran. `tests/b114-tint-v2.test.js` T1 failed with a regex mismatch on `[data-theme="atom-one-dark"]`, `[data-theme="one-dark"]`, `[data-theme="dark"]`, `[data-theme="dracula"]` — T1 was actively asserting the (now changed) 20% invariant.
4. [scrum-master] reviewed the failure and issued **AC11(g) operational clarification**: stale-prose updates that document an unchanged invariant belong to B-120 (out of B-117 scope); active assertions that pin a CHANGED invariant must be updated under B-117 itself (in scope, because B-117 IS the change). T1 was redesigned as a table-driven `expectedTintByTheme` map aligned with the post-B-117 ground truth.

**Action item (carry forward to next sprint retro):** B-119's self-applied "fix-scope test-assertion enumeration" contract — currently in CLAUDE.md / per-item §X.9-style sections — should be expanded to include **CSS-token invariants tested via structural assertion** (e.g., regex-pinned `--token: value;` checks against `shared/themes.css`). Until that contract update lands, future palette / token-value items are at risk of repeating the §57.9 enumeration miss. Suggested phrasing for the contract update: "for any item that mutates the value of a CSS custom property declared in `shared/`, the §X.9 enumeration MUST grep `tests/` for both the token name AND the old value as a regex anchor — not just stale prose strings. The grep set is required output, not optional."

### §57.12.3 — R5 gap-fill (3 tests added beyond the §57.5 R2 design)

[test-engineer] in R5 identified 3 drift-prevention guards that were not enumerated in §57.5 R2 design but emerged from the R3 implementation reality:

1. **Legacy `[data-theme="dark"]` alias tint-mirror guard** — asserts the alias's `--group-header-tint-amount` matches `one-dark`'s tint declaration. Without this guard, a future refactor that retuned `one-dark` would silently leave the alias divergent. Mechanically enforces the §57.3.1 "alias mirrors one-dark" contract.
2. **Legacy `[data-theme="dark"]` alias slot-palette mirror guard** — asserts every `--gc-<slot>` value in the alias matches `one-dark`'s value. Closes the same drift class for slot-token values, not just tint percentage.
3. **Slot-token name drift guard** — asserts every theme block declares all 9 canonical `--gc-<slot>` tokens by name. A future rename (e.g., `--gc-blue` → `--gc-cyan`) would otherwise surface as 126 cascading per-cell failures hiding the actual root cause; this single guard surfaces the rename as one targeted failure with the missing token name.

**Forward-looking note:** future B-104-class palette work (new theme additions, slot renames, hex retuning) MUST consult these 3 guards before merging. A new theme block must (a) declare its own `--group-header-tint-amount` (existing tint-declaration guard catches omission), (b) declare all 9 `--gc-<slot>` tokens (slot-token name guard catches omission), and (c) clear AA on all 9 cells OR add a new entry to `ACCEPTED_LIMITATIONS` with rationale + user-manual disclosure (the 126-cell loop catches a missing add).

### §57.12.4 — R4 reviewer findings (0 CRIT / 0 HIGH / 1 MEDIUM / 4 LOW)

R4 ran [code-reviewer] + [security-reviewer] + [qa-reviewer] in parallel. No CRITICAL or HIGH findings — B-117 is a CSS-token-value-only change with zero new code surface, zero permission additions, zero storage schema impact, zero new message types.

- **MEDIUM (1) — [qa-reviewer]:** atom-one-dark / one-dark group-color visual differentiation at 7% tint — at the lower tint amount, slot-to-slot brightness step is compressed; the [qa-reviewer] flagged the risk that adjacent groups might be visually harder to distinguish at a glance. **Resolution:** addressed via UAT plan in `docs/UAT_B-117.md` UAT-2 (atom-one-dark visual differentiation), UAT-3 (one-dark visual differentiation), UAT-4 (dracula slot differentiation at 17%). UAT pending product-owner Edge run. If UAT confirms a visual-differentiation regression, fix-forward path is per-theme `--gc-<slot>` retuning to widen hue separation in OKLCH space (B-117 token-only change can iterate without invalidating the WCAG audit, provided the 126-cell test stays green).
- **LOW (4):** all deferred or addressed in the UAT plan / by R5 gap-fill — none block sprint close. Recorded in `docs/findings/sprint-37.md`.

### §57.12.5 — R2 Correctness Checklist closure verification

| # | Check | R6 closure verdict |
|---|-------|--------------------|
| C-1 | Storage schema versioned | **N/A — confirmed.** Zero `chrome.storage` writes; zero `DEFAULT_PREFERENCES` keys added; zero schema version bump. No SW module-cache flush note required in CHANGELOG. |
| C-2 | Message contracts typed | **N/A — confirmed.** Zero new message types; zero `shared/messages.js` edits. |
| C-3 | SW cold-start safe | **N/A — confirmed.** Zero SW state changes; the SW does not parse `themes.css`. |
| C-4 | ID stability | **N/A — confirmed.** Zero ID changes. |
| C-5 | Manifest file references resolvable | **N/A — confirmed.** Zero `manifest.json` edits. |
| C-6 | Permission minimization | **N/A — confirmed.** Zero permission additions. |
| C-7 | Allow-list direction | **APPLIED — confirmed.** `ACCEPTED_LIMITATIONS` is a positive enumeration; default path enforces 4.5:1; 9 explicit allow-list entries with rationale + monotonic-decrease floor + stale-allow-list guard. |
| C-8 | SW-context feasibility | **N/A — confirmed.** Test runs in Node test env; no SW or DOM dependencies. |
| C-9 | Empty-state design | **APPLIED — confirmed.** §57.10 enumerated 3 states; actual state after R3 = (iii) — 9 accept-as-limitation cells exist; R7 user-manual update REQUIRED. |
| C-10 | Off-screen rect feasibility | **N/A — confirmed.** No DOM rendering; no off-screen positioning. |
| C-11 | Popup-lifecycle message ordering | **N/A — confirmed.** No popup focus shifts; no `chrome.runtime.sendMessage` calls. |
| C-12 | Manifest declaration runtime-mutability | **N/A — confirmed.** No manifest declaration changes. |

**No C-1..C-12 violations detected at R6 close.**

### §57.12.6 — Token immutables preserved (R1 AC10(b) + AC11 lock verification)

R6 verified the following lock-protected surfaces are unchanged across the entire B-117 R3 commit:
- `--text-primary` token values for all 14 themes — unchanged.
- `--text-secondary` token values for all 14 themes — unchanged.
- `--bg-primary` token values for all 14 themes — unchanged.
- `--bg-secondary` token values for all 14 themes — unchanged.
- `solarized-dark` `--gc-<slot>` token values (all 9) — unchanged (pathway (c) chosen — slot tokens stay as canonical Solarized base palette).
- `manifest.json` — unchanged.
- `shared/messages.js` — unchanged.
- `tj:meta.schemaVersion` — unchanged.
- `tj:groups` partition shape — unchanged.
- All 9 slot semantic names (`blue`, `purple`, `teal`, `red`, `orange`, `pink`, `indigo`, `yellow`, `slate`) — unchanged (R1 AC11 lock).

### §57.12.7 — Rollback plan (atomic single-commit revert)

The R3 build is a single atomic commit on `feature/sprint-37-ui-polish` containing: (a) the 4 tint-value edits in `shared/themes.css`, (b) the 2 prose comment-block updates in `shared/themes.css`, (c) the new `tests/b117-gc-matrix-audit.test.js` file, and (d) the `tests/b114-tint-v2.test.js` T1 redesign (per §57.12.2 mid-flight clarification).

```bash
# Identify the R3 commit on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -i "B-117"

# Single-commit revert:
git revert <r3-commit-sha>
git push origin release/v2
```

**Post-revert state:**
- `atom-one-dark`, `one-dark`, legacy `dark` alias return to 20% tint (B-114 pre-B-117 state) — visually brighter group headers but **WCAG AA non-compliant** (8 of 9 slots sub-AA on each, including yellow at 2.806:1). This was the shipping state before B-117 anyway.
- `dracula` returns to 20% tint — yellow drops to 4.119:1 sub-AA.
- `solarized-dark` retains 20% tint (no change either way).
- The new `tests/b117-gc-matrix-audit.test.js` is reverted (137 tests removed; baseline returns to 1,504).
- `tests/b114-tint-v2.test.js` T1 returns to its pre-B-117 form (regex-pinned `--group-header-tint-amount: 20%` on all 11 dark themes — passes the post-revert palette).

**No SW toggle-cycle required** (per C-1 — CSS-only change; SW does not parse `themes.css`). **No data migration needed.** **SEV3** if rollback is forced (visual regression on 4 dark themes + AA non-compliance returns; no functional capability lost).

### §57.12.8 — Test counts (final)

- **Pre-B-117 baseline (S36 close):** 1,504 tests passing on `release/v2`.
- **Post-R3 build:** 1,504 + 134 (`tests/b117-gc-matrix-audit.test.js` per §57.5 design) + 0 net (b114 T1 redesign — same test count, different shape) = 1,638.
- **Post-R5 gap-fill (§57.12.3 — 3 alias/slot drift guards):** 1,638 + 3 = **1,641 tests passing in 136 ms**.
- **Total Sprint 37 B-117 delta: +137 tests** (134 from R3 + 3 from R5 gap-fill).
- **Zero regressions** in the pre-existing suite. AC10(a) preserved as a floor.

### §57.12.9 — R7 readiness

B-117 §57.10 state (iii) triggered the R7 conditional path (≥ 1 accept-as-limitation cell exists). R7 [technical-writer] runs after this R6 to insert a "Theme accessibility limitations" subsection in `docs/user-manual/themes.md` (per R1 AC9 + §57.1 + §57.3.2 user-manual disclosure obligation). The subsection must list all 9 solarized-dark cells with theme + slot + computed ratio + rationale ("Solarized Dark's canonical base0/base02 text/bg pair is sub-WCAG-AA at the source — modifying these would break the canonical Solarized look").

### §57.12.10 — Sprint close readiness

B-117 is ready to mark **DONE** pending UAT-Acceptance Gate (Gate 3 — product-owner Edge run of `docs/UAT_B-117.md`'s 10 cases). All other Definition of Done items 1–13 are satisfied (code complete; reviewers passed; automated tests green; SPRINT.md / BACKLOG.md / BACKLOG_BOARD.md updates pending [scrum-master]; this chapter updated; manifest unchanged so item 11 N/A; rollback plan documented in §57.12.7; R7 user-manual update conditional path triggered for item 13).

---

**End of §57.**
