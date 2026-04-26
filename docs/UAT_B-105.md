# UAT Plan — B-105 Solarized-Light WCAG AA Contrast Fix

Sprint 35 · Full (S) · R5 UAT plan (authored by [test-engineer])

Related artefacts:

- `docs/BACKLOG.md` — B-105 row (6 acceptance criteria; R1 LOCKED 2026-04-25)
- `docs/design/52-b-105-solarized-light-fix.md` — R2 design chapter (D-1..D-3 + C-1..C-12 N/A or PASS + §52.5 rollback + §52.6 open questions)
- `docs/SPRINT.md` — Sprint 35 active item (R3 + R4 → R5 handoff)
- `docs/findings/sprint-35.md` — B-105 R4 deduped findings (0 CRITICAL / 0 HIGH / 1 MEDIUM M-1 / 3 LOW; M-1 is `--group-count-text` palette-debt comment, deferred per §52.6 Q1)
- `tests/b105-solarized-light-contrast.test.js` — 7 automated tests (T1..T7) covering AC1..AC5
- `tests/b104-group-colors.test.js` — sister file; T7 already pinned the post-B-105 invariants at the static-file level (text-primary == #546a71 + tint-amount == 3%)
- `shared/themes.css` — `[data-theme="solarized-light"]` block: `--text-primary: #546a71` + `--group-header-tint-amount: 3%` (with B-105 comment block)
- `docs/UAT_B-104.md` — sister UAT plan (B-104 themed group colors, Sprint 34); structural template

## Preconditions

1. Extension loaded unpacked from `feature/sprint-35-bug-fixes` via `edge://extensions` → "Load unpacked" → repo root.
2. Edge (primary target browser per user environment); spot-check UAT-1 + UAT-3 in Chrome if convenient (no expected divergence — the change is pure CSS-token + cascade).
3. Fixture: a non-empty bookmarks collection containing AT LEAST four groups with distinct colors — for example a `red` group, a `blue` group, a `purple` group, and a `yellow` group. If you don't have four colored groups handy, create them via the sidepanel's "+ Group" button before starting UAT-1.
4. Fixture: AT LEAST one Ungrouped item (any saved bookmark NOT assigned to a group) so the synthetic Ungrouped section renders too. Ungrouped headers are intentionally untinted (B-104 H-2 regression guard); UAT-3 spot-checks this.
5. DevTools open on the sidepanel (right-click sidepanel → Inspect) so you can inspect `.group-header` elements + computed `background` value + the inline `--group-header-color` style on each header.
6. (UAT-2 only) Edge DevTools' built-in "Inspect element → Accessibility → Contrast" affordance, OR a contrast checker extension, OR `https://webaim.org/resources/contrastchecker/`. Used to corroborate the automated WCAG math against a known-good reference implementation on at least one surface.

**C-1 stale-SW note (per CLAUDE.md B-094 extension):** B-105 introduces zero new pref keys, zero new manifest entries, zero storage schema changes, zero `DEFAULT_PREFERENCES` additions, zero new message contracts. The C-1 verdict in §52.4 is N/A — no extension toggle OFF/ON cycle is required after the update lands. Load the extension once and proceed. Theme switching via Settings is a pure CSS-cascade event (B-037 mechanism); no SW message-traffic gating is involved.

**Out-of-scope (per §52 explicit exclusions — do not test):** (a) `--text-secondary` (`#657b83`) palette correction — separate concern (§52.6 Q1; tracked via R4 M-1); (b) lightening `--bg-secondary` — rejected at R1 Q1 cascading change surface; (c) `--drifted-color` (`#b58900`) indicator contrast — pre-existing 2.619:1 (§52.6 Q2); (d) any other theme — solarized-light is the only theme with sub-AA baseline body text; (e) storage/manifest/message changes (none introduced); (f) `--bg-hover` 4.170:1 surface — pre-existing sub-AA on hover (S3 in R1 Q3); UAT-2 documents but does NOT block on it. If anomalies in those surfaces appear during UAT, file as new icebox rows — do NOT amend B-105.

Legend: **B** = blocker (zero failures tolerated) · **H** = high (at most 1 fail, documented) · **M** = medium (non-blocking)

---

## Test Cases

### Solarized-light baseline AA fix (AC1 + AC2 + AC3)

#### UAT-1: Solarized-light — body text on group headers + dialog surfaces reads comfortably (no longer washed-out sub-AA) — Priority: B

**Given** the extension is loaded AND I have AT LEAST one colored group (e.g. `red`).
**When** I open Settings → Theme → select **Solarized Light**.
**Then** the sidepanel repaints in the warm-cream Solarized Light palette WITHOUT a page reload (B-037 broadcast cascade).
**Then** body text on group headers — both the colored ones (now subtly tinted at 3%, see UAT-3) and the Ungrouped header (no tint) — reads comfortably and clearly. The text should be a deep cyan-grey on the cream background; legibility should be visibly improved compared to the prior v1.28.0 solarized-light experience (where the same text felt slightly washed-out).
**Then** open any dialog (e.g. "+ Group" → name a new group → cancel; OR right-click an item → "Properties" if available; OR open Settings — same warm cream + cyan-grey text). Body text in dialogs reads with the same comfortable contrast. Heading and label text feel similarly crisp.
**Expected**: DevTools Elements panel on the `<html>` element shows `data-theme="solarized-light"`. Inspecting any body-text element under `.group-header` or in a dialog shows computed color `rgb(84, 106, 113)` (`#546a71`). Body text on `--bg-secondary` (`#eee8d5`) reads at 4.66:1 — a perceptible improvement over the prior 4.39:1 baseline. **PASS** if text reads visibly clearer; **FAIL** if text still appears washed-out or harder to read than other themes.

---

#### UAT-2: Solarized-light — cross-surface AA spot-check (S1, S2, S4 PASS; S3 pre-existing sub-AA, documented) — Priority: H

**Given** Solarized Light theme is active (per UAT-1) AND I have at least one item in a colored group AND at least one item visible in the Open Tabs / live-state row area.
**When** I use Edge DevTools "Inspect element → Accessibility → Contrast" (or webaim.org/contrastchecker) on body-text-bearing surfaces. Sample one element from each of:
  - **S1 — main content area**: an item title in `--bg-primary` (cream `#fdf6e3`). **Expected ≥ 4.5:1** (R2: 5.295:1).
  - **S2 — group header background**: a body-text element on a group header (`--bg-secondary` `#eee8d5`). **Expected ≥ 4.5:1** (R2: 4.661:1).
  - **S4 — selected/active row**: click an item to select/activate it; sample the selected row's text (`--active-bg` `#e3eef7`). **Expected ≥ 4.5:1** (R2: 4.852:1).
  - **S3 — hovered row (PRE-EXISTING sub-AA, NOT in B-105 scope)**: hover an item; sample text on the hovered row (`--bg-hover` `#e4dcc4`). **Expected: ~4.17:1 — sub-AA but PRE-EXISTING per §52 footnote.** Document the value; do NOT block on it.
**Then** S1, S2, and S4 all read at ≥ 4.5:1.
**Then** S3 measures around 4.17:1 (or whatever the live tool reports — exact value depends on the tool's tone-curve implementation; should be in the 4.0–4.3 range). This is the documented carry-over; B-105 does NOT promise to fix it.
**Expected**: 3 of 4 sampled surfaces PASS; S3 is documented as the known carry-over. **PASS** if S1+S2+S4 all measure ≥ 4.5:1; **WARN** if S3 falls below 4.5:1 (acknowledged); **FAIL** if any of S1/S2/S4 falls below 4.5:1.

---

### 3% tint visual confirmation (AC2 + AC4)

#### UAT-3: Solarized-light — colored group headers now show a SUBTLE 3% tint (was 0% / no tint pre-B-105) — Priority: H

**Given** Solarized Light theme is active AND I have at least one `red` group AND at least one `blue` group AND at least one `purple` group (the Q4 worst-slot validators) AND the Ungrouped synthetic group is rendered (any unassigned item).
**When** I observe the rendered group headers side-by-side.
**Then** each colored group's header shows a SUBTLE tint of its slot color over the warm-cream Solarized base — visible on close inspection but NOT garish. Specifically:
  - the `red` group header reads as the cream base with a faint warm pinkish-red wash (NOT a flat strong red strip),
  - the `blue` group header reads as cream with a faint cool wash,
  - the `purple` group header reads as cream with a faint lavender wash.
**Then** the **Ungrouped** header by contrast remains pure untinted cream `#eee8d5` (B-104 R4 H-2 regression — Ungrouped carries `color: null` and is skipped by the `GROUP_COLORS.includes` guard).
**Then** I switch theme (Settings → Theme) to a different theme (e.g. `github-light` or `dracula`) and back to Solarized Light. The 3% tint reappears identically; the cascade is deterministic.
**Expected**: DevTools Elements panel on a colored `.group-header` shows `style="--group-header-color: var(--gc-red);"` (or the slot for the group). Computed `background` reads roughly `rgb(238, 229, 211)` to `rgb(238, 230, 213)` (depending on slot — the `color-mix(... 3%, --bg-secondary)` result — the tinted hex hovers around `#eee5d3` to `#ece6d6`). The tint is perceptible but understated. **PASS** if subtle tint visible AND Ungrouped header is plain cream; **FAIL** if either (a) headers look identical to plain cream (3% override didn't apply / cascade failed), (b) headers look garishly colored (would suggest 18% cascade leaked through), or (c) Ungrouped picked up a tint (regression of B-104 H-2).

---

### Visual deviation from canonical Solarized (AC1)

#### UAT-4: Solarized-light — `#546a71` `--text-primary` deviation from canonical base01 `#586e75` is barely perceptible — Priority: M

**Given** Solarized Light theme is active.
**When** I look at body text on the sidepanel — items, group headers, dialog labels — at normal viewing distance (arm's length, ~50 cm from a typical 27-inch monitor).
**Then** the body text color reads as a deep cyan-grey indistinguishable (or very nearly so) from the canonical Solarized Light base01 (`#586e75`). The shift is `−4` per RGB channel (a ~3.4% luminance reduction); this is below the perceptual just-noticeable-difference threshold for most consumer displays at typical viewing distances.
**Then** I do NOT have a side-by-side comparison available to a known-canonical Solarized Light render (e.g. an editor, a dotfile preview); UAT-4 is purely a "does the new color feel WRONG?" subjective check.
**Expected**: text feels right — warm-but-cool deep grey-blue, harmonious with the cream Solarized base. **PASS** if text feels indistinguishable from canonical Solarized Light; **WARN** if a discriminating eye notices the deviation but acknowledges it as minor; **FAIL** if the text looks visibly off-palette (would suggest the wrong hex was committed). For most users, expected verdict is PASS.

---

### Other-theme regression spot-check (AC4)

#### UAT-5: Other 13 themes — no regression; only solarized-light was touched — Priority: M

**Given** the extension is loaded AND I have at least one colored group.
**When** I switch through 3-4 other themes via Settings → Theme. Recommended sample: one light + two dark — e.g. `github-light`, `one-dark`, `dracula`, `tokyo-night`.
**Then** for EACH sampled theme:
  - body text contrast feels comparable to v1.28.0 (no perceptible change),
  - group header tint feels comparable to v1.28.0 (the B-106 18% bump lands separately and may or may not have shipped before this UAT — that is its own UAT scope),
  - no token regressed silently.
**Then** I observe DevTools `<html data-theme="<slug>">` updates correctly on each switch and the sidepanel re-paints without a reload.
**Expected**: each sampled theme appears unchanged from its pre-B-105 v1.28.0 visual. **PASS** if every sampled theme reads as before; **FAIL** if any theme other than solarized-light shows a visual regression (would indicate a token leaked from the B-105 diff into the wrong block).

---

## Acceptance Criteria Coverage Map

| AC | Criterion | UAT Coverage |
|----|-----------|--------------|
| AC1 | `--text-primary` updated to `#546a71` in solarized-light block | UAT-1, UAT-4 (visual); T1, T5 (auto) |
| AC2 | `--group-header-tint-amount` 0% → 3% on solarized-light | UAT-3 (visual); T2, T7 (auto) |
| AC3 | WCAG AA `--text-primary` vs `--bg-secondary` ≥ 4.5:1 | UAT-1, UAT-2 S2 (live tool); T1 (auto) |
| AC4 | Cross-surface spot-checks (S1/S2/S4 PASS; S3/S5/S6 documented pre-existing) | UAT-2 (live tool); T3, T4, T5, T6 (auto) |
| AC5 | ≥ 4 tests in `tests/b105-solarized-light-contrast.test.js` | T1–T7 (7 tests; covered by automated suite) |
| AC6 | Doc update — §45 forward-pointer / §47 row 19 update / §52 As Built | R6 [solution-architect] work item; UAT does not test |

## Sign-off

- [ ] All UAT cases run on Edge against `feature/sprint-35-bug-fixes` build
- [ ] UAT-1 (B): PASS / FAIL noted
- [ ] UAT-2 (H): PASS / WARN (S3 acknowledged) / FAIL noted
- [ ] UAT-3 (H): PASS / FAIL noted
- [ ] UAT-4 (M): PASS / WARN / FAIL noted
- [ ] UAT-5 (M): PASS / FAIL noted
- [ ] Automated test suite green: `npm test` → 1456+ pass, 0 fail
- [ ] Findings (UAT-3 Ungrouped tint regression, UAT-5 cross-theme regression) flagged as new icebox rows IF observed; otherwise no follow-up required
