# Current Sprint

*Sprint 34 closed 2026-04-26. Awaiting product-owner direction for next sprint.*

The post-close state below documents the v1.28.0 release. Two-item visual-polish sprint shipped clean: B-101 (dotted drift bar) + B-104 (themed group color system). One follow-up backlog item filed (B-105 — solarized-light baseline contrast defect).

Ships to `release/v2` as v1.28.0. **No main merge** — that remains a manual product-owner task.

---

## Gate 4 — Release Checklist (verified 2026-04-26)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — B-101: 1 HIGH (test stub stale) absorbed by R5 + 2 MEDIUM addressed; B-104: 3 HIGH (qa-reviewer WCAG/Ungrouped/hover) all fixed in R3-fix + 4 MEDIUM (M-1, M-2, M-3, M-5) all addressed in R3-fix or R6 |
| 2 | All R5 automated tests passing | ✅ — 1,426/1,426 (+14 net via T1-T6 B-101 + T1-T9 B-104) |
| 3 | UAT sign-off recorded by [test-engineer] | 🟡 — UAT plans authored (B-101: 6 cases; B-104: 7 cases). **Pending human walk-through during sprint close.** Following S33 pattern. |
| 4 | No open blockers in `SPRINT.md` | ✅ |
| 5 | Relevant `docs/design/NN-*.md` chapters updated | ✅ — `docs/design/47-b-104-themed-group-colors.md` §47.10 As Built filled (incl. M-2 atom-one-dark promotion + M-3 D-5 contrast correction); `docs/design/48-b-101-drift-bar.md` §48.10 As Built filled (incl. D-3a live+drifted permutation extension) |
| 6 | `manifest.json` permissions reviewed | ✅ — zero new permissions; version bumped 1.27.0 → 1.28.0 |
| 7 | `./build.sh` produces a clean package | ✅ — 328K, 87 files, no errors |
| 8 | Rollback plan documented for storage schema changes | ✅ — N/A (zero schema changes for both items); single-commit revert documented in §47.8 + §48.8 |
| 9 | README/STORE_LISTING/CHANGELOG updated | ✅ — CHANGELOG `[1.28.0]` entry added covering both items + B-105 follow-up disclosure. User-manual: no update needed (drift indicator behavior section in `managing-items.md` reads correctly with the new visual — only icon→bar change is visual-only) |
| 10 | `BACKLOG.md` updated — completed items set to `done` | ✅ — B-101 + B-104 → `done`; B-105 filed as new backlog row |
| 11 | `BACKLOG_BOARD.md` updated — progress dashboard accurate | ✅ — totals: 105 items / 95 done / 90% completion / 1 new follow-up in backlog |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all finished items | ✅ (below) |
| 13 | `SPRINT_ARCHIVE.md` updated — Sprint 34 entry appended | ✅ |

---

## Completed This Sprint

### [B-101] Dotted drift bar in row left-edge gutter — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ (locked pre-sprint brainstorm) · R2 ✅ (§48 design chapter D-1..D-5 + C-1..C-12) · R3 ✅ · R4 ✅ (3 reviewers parallel — 0 CRITICAL / 1 HIGH (test stub) / 2 MEDIUM / 7 LOW) · R5 ✅ (6 tests + 6 UAT cases + R4 HIGH/MEDIUM stub fixes in b011/b054/b048) · R6 ✅ (§48.10 As Built + D-3a live+drifted permutation extension) · R7 = inline CHANGELOG (this sprint close)
- **Files changed**:
  - `sidepanel/sidepanel.js` — `_createDriftedIcon` deleted; `_driftTooltipFor` helper added; `<span class="item-drift-bar">` injected as first child of `.item-row` in `buildItemRow`; `_ensureIndicators` signature extended to `(row, live, isDrifted, driftedToUrl)`; `refetchAndPatchLiveState` call site updated
  - `sidepanel/sidepanel.css` — `.item-row { position: relative; }` added; `.item-drifted-icon` rules deleted; new `.item-drift-bar` rule
  - `tests/b101-drift-bar.test.js` (new, 6 tests T1-T6)
  - `tests/b011-drift.test.js` (re-pinned — inlined `_ensureIndicators` stub updated to new signature/behavior)
  - `tests/b054-sidepanel.test.js` + `tests/b048-visual-states.test.js` (stale comments + local stubs hygiene)
  - `docs/design/48-b-101-drift-bar.md` (new R2 chapter + R6 As Built)
  - `docs/UAT_B-101.md` (new, 6 UAT cases)
- **Key decisions**: D-1 sibling `<span>` (not pseudo-element) · D-2 `.item-row { position: relative }` · D-3 active+drifted side-by-side at `left: 3px` · D-3a live+drifted same geometry · D-4 row-level `aria-label` keeps "drifted" · D-5 bar visibility gates only on `_cachedDriftRecords`
- **Test/UAT outcome**: 1,412 → 1,417 (+5 net). UAT plan authored (6 cases). Pending human walk-through.

### [B-104] Themed group color system (colored headers + theme-aware palette tokens) — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ ([product-manager] locked Q1-Q6 + 9 ACs) · R2 ✅ ([solution-architect] §47 design chapter D-1..D-5 + C-1..C-12 + 36-value flagship hex table) · R3 ✅ (153 `--gc-*` tokens shipped) · R4 ✅ (3 reviewers parallel — 0 CRITICAL / 3 HIGH (qa-reviewer WCAG/Ungrouped/hover) / 4 MEDIUM / 8 LOW) · R3-fix ✅ (3 HIGHs fixed pre-R5) · R5 ✅ (9 tests + 7 UAT cases) · R6 ✅ (§47.10 As Built + M-2 atom-one-dark hand-curation + M-3 D-5 contrast correction) · R7 = inline CHANGELOG
- **Files changed**:
  - `shared/themes.css` — 153 `--gc-*` declarations across 17 blocks (5 hand-curated + 9 algorithmic + 2 legacy aliases); `--group-header-tint-amount: 0%` override on `[data-theme="solarized-light"]`
  - `sidepanel/sidepanel.css` — `.group-color-<slot>` swatches migrated to `var(--gc-<slot>)`; `.group-header` + `:hover` tint via `color-mix`
  - `sidepanel/sidepanel.js` — group-header inline-style injection (gated by `GROUP_COLORS.includes(...)`); synthetic `__ungrouped__` group color → `null` (R3-fix H-2)
  - `newtab/newtab.css` + `newtab/newtab.js` — analogous tint rule + injection (incl. R3-fix M-5 hover parity)
  - `popup/group-jump-popup.css` — D-2 Option C `[data-color="<slot>"]` rules (9 slots)
  - `popup/group-jump-popup.js` — `chip.dataset.color = pickerRow.color`
  - `tests/b104-group-colors.test.js` (new, 9 tests T1-T9)
  - `docs/design/47-b-104-themed-group-colors.md` (new R2 chapter + R6 As Built)
  - `docs/UAT_B-104.md` (new, 7 UAT cases)
  - `docs/SOLUTION_DESIGN.md` (TOC entry for §47)
- **Key decisions**: D-1 hybrid 5 hand-curated + 9 algorithmic (R6 promoted atom-one-dark) · D-2 group-jump popup Option C (closes latent slate/teal/indigo bug) · D-3 tokens per `[data-theme]` block · D-4 `color-mix` Chromium 111+ baseline · D-5 single 12% recipe with `--group-header-tint-amount` per-theme escape hatch (solarized-light overrides to 0%)
- **R3-fix applied (3 HIGHs)**: H-1 solarized-light WCAG (0% tint via `--group-header-tint-amount` override); H-2 Ungrouped slate-tint leak (synthetic group color → null); H-3 hover compound (resolved by H-1 fix automatically).
- **R6 applied (2 MEDIUMs)**: M-2 atom-one-dark hand-curated; M-3 §47.3 D-5 + §47.5 row 19 corrected.
- **Test/UAT outcome**: 1,417 → 1,426 (+9 net). UAT plan authored (7 cases). Pending human walk-through.
- **Follow-up filed**: **B-105** (P2/S) — solarized-light underlying theme baseline contrast defect.

---

## Wave Plan (executed)

```
Wave 0 (both items in parallel — independent surfaces)
  ├── B-104 R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ → R3-fix ✅ → R5 ✅ → R6 ✅ → R7 ✅    [Full M]
  └── B-101 R1 ✅ (pre-sprint) → R2 ✅ → R3 ✅ → R4 ✅ → R5 ✅ → R6 ✅ → R7 ✅    [Full S]

Sprint Close
  Gate 4 ✅ → Gate 7 ✅ → [release-manager] v1.28.0 → archive (release/v2 only; no main merge)
```

**P-1 / P-2 / P-3 compliance**:
- P-1 ✅ — zero L/XL items
- P-2 ✅ — only one S item (B-101)
- P-3 ✅ — only one M item (B-104), max is two

---

## Gate 7 — Sprint Retrospective (Sprint 34)

### Velocity
- Planned: 2 items / 1 M (B-104) + 1 S (B-101)
- Completed: 2 items / 1 M + 1 S + 1 follow-up backlog item (B-105) filed from R4 surface
- Carried over: 0
- Test growth: 1,412 → 1,426 (+14 net, +1.0%)
- Fix cycles: 1 R3-fix on B-104 (3 HIGH WCAG findings caught by qa-reviewer's contrast computation pre-R5)

### What Went Well

- **Parallel-pipeline pattern paid off**: B-101 R3 + B-104 R2 + R4 reviewers all ran simultaneously; B-104 R3 + B-101 R4 + R5 also overlapped. Two items shipped in one calendar day with full 7-round pipeline on both.
- **R4 qa-reviewer caught the WCAG AA failure pre-R5** — contrast math computation surfaced 3 HIGHs that would have shipped silently if discovered only at human UAT (no contrast tooling assumed in UAT spec). The cost-of-late-discovery tradeoff justifies investing in contrast-math review during R4 for any tinted-surface item going forward.
- **R2 design chapter quality stayed high under parallelism**: both §47 and §48 carried full D-decisions + C-1..C-12 + Performance + Accessibility + Rollback sections. R6 As Built sections close the loop cleanly.
- **Follow-up backlog discipline held**: B-105 filed as the precise pre-existing defect surfaced by B-104 (not absorbed into B-104 scope creep). Workaround documented in B-104 R6.

### What to Improve

- **R2 contrast-math validation gap**: §47.3 D-5 mental walkthrough claimed solarized-light baseline = 7.21:1; actual was 4.392:1. The R2 [solution-architect] eyeballed it. Action item: when R2 cites a numeric WCAG contrast value, the agent MUST show the actual sRGB linear-luminance computation — not approximate.
- **R3 deviation handling**: B-104 R3 added a hover-tint deviation (`--bg-hover` instead of `--bg-secondary`) without an inline comment marking it as intentional. Caught by code-reviewer M-1. Action item: any R3 deviation from R2 spec MUST land with an inline comment + R6 As-Built mention BEFORE R4 starts.
- **Pre-existing defect surfacing creates surprise**: solarized-light's sub-AA baseline was a latent v1.0 defect. Surfacing it during a polish sprint cost a fix-cycle iteration. Action item: when adding a tinted-surface feature in any future sprint, R2 should include a pre-flight WCAG AA spot-check across all 14 themes' baseline (text vs. each surface bg token) — surfaces baseline issues BEFORE they cascade into the new feature.

### Action Items for Next Sprint

1. [scrum-master] CLAUDE.md R2 round details: add "When citing numeric WCAG contrast values, R2 MUST compute the value via the linear-luminance formula or scripted calculation — not approximate via mental walkthrough." [HIGH]
2. [scrum-master] CLAUDE.md R3 round details: add "Any R3 implementation deviation from the R2 spec MUST land with an inline comment marking it as intentional + a corresponding R6 As-Built mention BEFORE R4 starts." [MEDIUM]
3. [scrum-master] Triage B-105 at next sprint kickoff. Underlying theme defect — relevant to both this sprint's polish AND any future tinted-surface work. P2/S — pair with another small item. [HIGH]
4. [scrum-master] Triage carryover bug-fix items B-100 / B-102 / B-103 (S33 follow-ups, P2/M and P2/S) — not absorbed by S34 visual-polish theme; ready for triage at S35. [HIGH]

---

## Blockers

*None.*

---

## Backlog Items Filed This Sprint

| ID | Title | Priority | Effort | Source |
|----|-------|----------|--------|--------|
| B-105 | Solarized-light baseline WCAG AA contrast defect | P2 | S | B-104 R4 qa-reviewer HIGH (worked around in B-104; B-105 tracks the actual theme palette fix) |
