# Current Sprint

*Sprint 19 — Retro action items + Sprint 18 polish bundle + imports polish + keyboard shortcuts + search perf. Kicked off 2026-04-19.*

---

## Sprint Readiness (Gate 6)

- ✅ Scope approved by product owner: B-069 + B-070 + B-060 + ~~B-046~~ + B-052 (B-046 deferred mid-sprint — see Scope Change Log below)
- ✅ Total effort: 1M + 2S + 1XS (after B-046 deferral) — matches Sprints 17/18 cadence lower-bound
- 🔄 **Scope change (B-046 deferred, 2026-04-19)**: Scrum-master caught dependency gap at Wave 3 start — B-046 AC explicitly targets "quick search popup" (B-022, ⬜ not shipped) AND "standalone Tab Junkie window" (B-035, ⬜ not shipped). Shipping stubs creates dead-shortcut UX friction; scope-reducing to one shortcut distorts the item. Clean choice: defer B-046 to whichever future sprint ships B-022 or B-035. Status reverted to `backlog`.
- ✅ Sprint 18 closed; v1.13.0 tag on `release/v2` (commit `cb019ba`); archive commit `54bd608`
- ⚠️ Carry-over from Sprint 18: **7 deferred UAT plans** (B-042, B-043, B-048, B-029, B-059, B-044, B-045 — ~165 cases total). User-executed burndown scheduled for **start of Sprint 19** (per product-owner instruction). Runs in parallel with the R2/R3 pipeline — does NOT block B-069/B-070/B-060/B-046/B-052 from proceeding.
- ✅ Sprint 18 retro action items C-8 + C-9 are the subject of B-069 (Wave 0) — delivered within the sprint, not carried as meta-items.
- 🆕 **B-069 is Wave 0 — MUST land before B-052 R2** so the new C-8/C-9 checks apply to the only Full-tier R2 pass this sprint.

---

## UAT Burndown Track (Parallel, User-Executed)

Running alongside the pipeline — not on the critical path of any sprint item.

| Plan | Item | Est. cases | Status |
|------|------|-----------|--------|
| `docs/UAT_B-042.md` | Export HTML | ~14 | pending |
| `docs/UAT_B-043.md` | Export JSON | ~15 | pending |
| `docs/UAT_B-048.md` | Item visual states | ~? | pending |
| `docs/UAT_B-029.md` | Group picker modal | ~? | pending |
| `docs/UAT_B-059.md` | Allow duplicate URLs | ~? | pending |
| `docs/UAT_B-044.md` | Import HTML | 29 | pending |
| `docs/UAT_B-045.md` | Import JSON | 30 | pending |

Each UAT plan has PASS/FAIL/WARN/SKIP columns pre-laid for the user. Gate 3 sign-off is satisfied once the full 7-plan sweep is PASS — that's the quality gate for `release/v2` → `main`.

---

## Active Items

*(all 4 in-scope Sprint 19 items are now in "Completed This Sprint" below — B-046 deferred mid-sprint per Scope Change; sprint closed 2026-04-19)*

---

## Completed This Sprint

### [B-052] Fuzzy search index caching & perf targets — DONE (Wave 3)
- **Tier**: Full (M)
- **Merged**: `b727979` on `release/v2` (PR #21, 2026-04-19)
- **Files Changed**: NEW `sidepanel/search-index.js` (333-line pure module — `buildIndex`, `diffAndPatch`, `search`, `entryMatches`, `BULK_REBUILD_THRESHOLD`); `sidepanel/sidepanel.js` (+241/-4 — index integration, `_patchSingleRow` + `_findGroupItemsContainer`, broadcast-branch dispatch, SEARCH_INDEX_ENABLED rollback gate); NEW `tests/b052-fuzzy-search-perf.test.js` (15 tests — 13 R3 + 2 R4 fix-up + … actually 18 after R5 gap-fillers → 955 total); NEW `docs/design/34-b-052-fuzzy-search-caching.md` (R2 + R6 close with §34.14 Build Deviations table); NEW `docs/UAT_B-052.md` (15 cases, 543 lines, DEFERRED); CHANGELOG.md Improved section; STORE_LISTING.md "near-instant search" bullet.
- **R4**: [code-reviewer] PASS with 2 MEDIUM (byId Map freeze gap + cross-group-move DOM divergence — both fixed inline), [security-reviewer] PASS zero findings, [qa-reviewer] PASS with 1 MEDIUM (redundant applyFilter in `_patchSingleRow` — fixed inline) + C-9 empty-state coverage PASS (all 7 states).
- **R5**: 15 B-052 automated tests (5 ACs covered). UAT plan DEFERRED for Edge execution.
- **R6**: §34 amended with as-shipped decisions; new §34.14 Build Deviations table (byId freeze Option A, row-replace vs text-patch, applyFilter redundancy removal).
- **R7**: CHANGELOG Improved + STORE_LISTING bullet.
- **Measured perf** (deterministic seed=4242):
  - AC3 search P95 on 1000 items: **0.152 ms** (263× under 40 ms CI budget, 329× under 50 ms product AC)
  - AC4 first-paint DOM-build proxy on 500 items: **1.14 ms** (140× under 160 ms budget)
  - Index build wall time on 1000 items: **0.96 ms**
- **Test suite**: 937 → 955 green (+18 new). `./build.sh`: clean (200 K zip, 65 files).
- **Scope**: sidepanel-only; zero manifest / messages / errors / export-schema / background drift.

### [B-060] Import duplicate-handling with skip/allow override — DONE (Wave 2)
- **Tier**: Fast Track (S)
- **Merged**: `81b8a2d` on `release/v2` (PR #20, 2026-04-19)
- **Files Changed**: `sidepanel/sidepanel.{js,css}` (checkbox UI + pref read/write + toast branching), `background/storage/shapes.js` (DEFAULT_PREFERENCES + tolerant isPreferences for upgrade path), `background/storage/preferences.js` (validatePrefsPatch), `background/import/{html-parser,json-validator,index}.js` (options threading); NEW `tests/b060-import-dup-handling.test.js` (7 tests); updates to `tests/b04{4,5}-e2e-import.test.js` + `tests/b045-json-validator.test.js`
- **R4**: [code-reviewer] PASS with 2 LOW (pre-existing sprint-19+ TODO in json-validator from B-070; cosmetic `<span>` vs `<div>` — a11y correct). [security-reviewer] PASS zero findings.
- **Test suite**: 926 → 937 green (+11 new). `./build.sh`: clean (192 K zip).
- **Schema migration**: none required — tolerant `isPreferences` + `getPreferences()` merge preserves backward compat for pre-B-060 profiles.

### [B-070] Sprint 18 follow-on polish bundle — DONE (Wave 1)
- **Tier**: Fast Track (S)
- **Merged**: `5a3e1e9` on `release/v2` (PR #19, 2026-04-19)
- **Files Changed**: `sidepanel/sidepanel.js` (new `_hasPopulatedPreferences` helper + `_buildPrefsOnlyImportBody` helper + `prefsOnly` flag on `_openImportPreviewDialog` + plain-language repair-summary labels + JSON-path dialog heading ternary), `background/import/json-validator.js` (removed `validateAndRepair` alias), `tests/b045-e2e-import.test.js` (+3 tests)
- **R4**: [code-reviewer] flagged HIGH F-1 (prefs-only silent-wipe UX) — **FIXED inline** with dedicated confirmation dialog. [security-reviewer] PASS zero findings. LOW/MEDIUM deferrables filed for future triage.
- **Test suite**: 923 → 926 green (+3). `./build.sh`: clean (188 K zip).
- **Scope**: zero manifest / messages / errors / export-schema / html-parser / commit drift.

### [B-069] Add C-8 + C-9 to R2 Correctness Checklist — DONE (Wave 0)
- **Tier**: Fast Track (XS)
- **Merged**: `11a7d33` on `release/v2` (PR #18, 2026-04-19)
- **Files Changed**: `CLAUDE.md` (+2 R2 Correctness Checklist rows C-8 SW-context feasibility + C-9 empty-state design), `CHANGELOG.md` (+5 lines [Unreleased] → Process breadcrumb)
- **R4**: [code-reviewer] PASS (zero findings), [security-reviewer] no-op gate protector
- **Test suite**: 923/923 unchanged (documentation edit). `./build.sh` clean.
- **Known artifact**: pre-existing numbering gap at C-6 + C-7 (Sprint 17 retro's aspirational "C-7 allow-list direction check" never codified). Backfill item to be filed for future sprint.

---

## Planned Pipeline Parallelization

- **R1 [product-manager]**: PRE-APPROVED for all 5 items (ACs comprehensive in BACKLOG.md — this sprint repeats the Sprint 18 "skip R1 rubber-stamp" pattern that worked well).
- **R2 [solution-architect]**:
  - **B-069** is itself a meta-R2 update (writes C-8 + C-9 into the Correctness Checklist). Treated as R3 (implementation).
  - **B-052** only Full-tier item requiring a standalone R2 pass. Gated on B-069 landing so the updated checklist (C-8 + C-9) is active.
- **R3 sequencing**:
  0. **Wave 0 — B-069** ([solution-architect]): add C-8 + C-9 rows to CLAUDE.md R2 Correctness Checklist. MUST merge before B-052 R2.
  1. **Wave 1 — B-070** ([frontend-engineer]): Sprint 18 polish bundle.
  2. **Wave 2 — B-060** ([frontend-engineer]): import duplicate-handling override.
  3. **Wave 3 — B-046** ([frontend-engineer]): global keyboard shortcuts. **Auto-upgrade watch** — if `commands` entries plus standalone-window stub scope grows, upgrade to Full tier.
  4. **Wave 4 — B-052** ([frontend-engineer]): fuzzy search index caching + perf harness. R2 first, then R3.
- **R4** per item:
  - **B-069**: [code-reviewer] smoke check (1 file, 2 table-row edits). [security-reviewer] no-op gate protector. [qa-reviewer] skipped (Fast Track).
  - **B-070**, **B-060**, **B-046**: code + security (2 parallel — Fast Track).
  - **B-052**: code + security + qa (3 parallel — Full tier).
- **R5** B-052 only (Full tier). B-069/B-070/B-060/B-046 on Fast Track rely on existing suite + `./build.sh` staying green.
- **R6** [solution-architect] covers B-052 — update `docs/design/*` with fuzzy-search architecture (likely a new §34 chapter).
- **R7** [technical-writer] covers any user-visible change — B-060 checkbox, B-046 shortcuts documentation, B-052 if user-observable perf note needed. Batched at sprint close.

### Cross-Item Parallelization (per CLAUDE.md P-1/P-2/P-3)

- P-1 Max one L/XL active: ✅ zero L/XL items in Sprint 19.
- P-2 S/XS pair with anything: ✅ B-069 + B-070 + B-060 + B-046 can interleave.
- P-3 Max two M in parallel: ✅ only B-052 is M; no conflict.
- P-4 Interleave, don't overlap: run waves sequentially per the plan above; do NOT open multiple R1s simultaneously.

---

## Sprint 19 Goals (Definition of Success) — Scorecard

1. ✅ v1.14.0 ships with **4 of 5 items** merged to `release/v2` (B-046 deferred mid-sprint).
2. ✅ R2 Correctness Checklist gained C-8 + C-9 (permanent quality improvement shipped in B-069 + exercised by B-052 R2 immediately).
3. ✅ Sprint 18 polish backlog consumed (B-070 shipped prefs-only support + repair-summary plain language + JSON dialog heading + alias removal).
4. ✅ Duplicate import UX closed (B-060 shipped checkbox + pref persistence + UX wording correction "in this file" not "in your collection").
5. ⏭️ Global keyboard shortcuts (B-046) deferred — depends on B-022 + B-035 which are still ⬜. Will return in the sprint that ships those.
6. ✅ Fuzzy search meets < 50 ms P95 perf target on 1,000-item collection (B-052 ships **0.152 ms P95** — 329× under product AC).
7. ⏭️ UAT burndown target: ≥ 4 of 7 deferred plans — **NOT RUN** this sprint. Carries to Sprint 20.

**Overall: 5/7 goals hit, 2 deferred with explicit reasons.** Sprint velocity matches Sprint 17/18 at revised scope (1M + 2S + 1XS after B-046 pull).

---

## Gate 4 — Release Checklist (verified 2026-04-19)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved (no open CRITICAL/HIGH) | ✅ — 3 MEDIUM + 1 HIGH (B-070 prefs-only wipe) all fixed inline across the sprint; LOWs filed for Sprint 20 polish triage |
| 2 | All R5 automated tests passing | ✅ — 955/955 green on `release/v2` (post-B-052 merge `b727979`) |
| 3 | UAT sign-off recorded | ⏳ DEFERRED — 8 UAT plans now carrying (B-042, B-043, B-048, B-029, B-059, B-044, B-045, B-052 — ~180 cases total). Per Sprint 18 precedent + product-owner direction. Scheduled for Sprint 20 burndown. |
| 4 | No open blockers in `SPRINT.md` | ✅ |
| 5 | `docs/design/*` slices updated | ✅ — §34 authored (R2) + amended (R6) for B-052. §33 untouched (imports already shipped). |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions across all 4 Sprint 19 items |
| 7 | `./build.sh` produces clean package | ✅ — 200 K zip (post-B-052) |
| 8 | Rollback plan documented | ✅ — B-052 §34.11 (SEARCH_INDEX_ENABLED flag); B-070 destructive-action confirm dialog; B-060 schema tolerant (no bump needed) |
| 9 | README / user manual updated | ✅ — CHANGELOG Improved + STORE_LISTING "near-instant search" for B-052; `docs/user-manual/importing-bookmarks.md` already live from Sprint 18 (B-070's wording adjustments integrated) |
| 10 | `BACKLOG.md` — all Sprint 19 items `done` or formally deferred | ✅ (54/71, B-046 → backlog) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ (76%, 0 in progress, Sprint 19 closed) |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all 4 items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated with Sprint 19 entries | ⏳ — pending [release-manager] + [scrum-master] archive step |

**Gate 4 verdict**: PASS conditional on post-release archive step.

---

## Sprint Retrospective — Sprint 19

### Velocity

- **Planned (kickoff)**: 5 items — B-069 (XS), B-070 (S), B-060 (S), B-046 (S), B-052 (M). Total: 1M + 3S + 1XS.
- **Mid-sprint scope change**: B-046 deferred at Wave 3 start (scrum-master caught dependency gap — ACs explicitly target B-022 quick-search popup + B-035 standalone window, neither shipped).
- **Revised scope**: 4 items — 1M + 2S + 1XS.
- **Completed**: 4 items / 1M + 2S + 1XS = 100% of revised scope.
- **Carried over**: B-046 returns to `backlog`, dependencies unchanged.
- **Test suite growth**: 923 → 955 (+32 across the 4 shipped items).

### What Went Well

1. **C-8 + C-9 delivered value on first use.** B-052 R2 was the first Full-tier R2 under the new checklist. C-9 forced explicit empty-state enumeration (7 states in §34.9); R4 [qa-reviewer] used it to confirm coverage. The retro-to-permanent-rule loop worked exactly as designed.
2. **Perf ACs work when they're concrete.** B-052 AC3 (< 50 ms P95 on 1000 items) + AC4 (< 200 ms first paint on 500) gave R3 a hard target and R5 a measurable gate. Engineer shipped 0.152 ms P95 — 329× under the product AC. Concrete numeric thresholds prevent the "it feels fast" hand-wave trap.
3. **Scope Change Control followed its own rules.** B-046 deferral was caught before dispatching R3. Protocol (assess impact, identify what gets re-prioritized, document rationale) was respected. No half-built features shipped.
4. **R4 parallel reviewer pattern caught the correctness bug R3 missed.** B-052 R3 shipped `_patchSingleRow` with silent DOM divergence on cross-group moves. [code-reviewer] caught it in R4 via static analysis + a mental-model check of the diff-patch contract. Would have been a user-reported bug otherwise.

### What to Improve

1. **Sprint Readiness Gate 6 missed B-046's dep gap.** Deps column in BACKLOG.md explicitly lists B-022, B-035 — neither shipped. Gate 6 should include a deps-resolved check: "Every in-scope item's `Dependencies` column items are either already-done or also in this sprint." Catches forward-referenced ACs before pipeline burn.
2. **UAT debt keeps growing.** 7 → 8 plans DEFERRED this sprint. At ~180 cases, this is a real cost. Per Sprint 18 retro action item, Sprint 20 needs a dedicated burndown window.
3. **B-070 AC1 literal reading nearly shipped a UX defect.** "Proceed with commit" was interpreted as "skip confirmation dialog" — engineer followed spec literally, R4 [code-reviewer] flagged HIGH, fix-up added confirmation. Future PM output should be explicit when destructive-action confirmation is still required on a carved-out path.

### Action Items for Sprint 20

- [ ] **[scrum-master]** — Extend Gate 6 Sprint Readiness check: "For every in-scope item, verify each dependency in BACKLOG.md `Dependencies` column is either `done` OR also in this sprint. If any dep is `backlog`, flag for product-owner triage before kickoff." [HIGH — prevents Sprint 19-style mid-sprint deferrals]
- [ ] **[product-manager]** — When authoring ACs for carved-out edge cases (prefs-only backup, zero-match, partial-input paths), explicitly state whether destructive-action confirmation is retained or waived, with rationale. Don't rely on AC readers to infer CLAUDE.md precedence. [MEDIUM]
- [ ] **Sprint 20 kickoff MUST include a UAT burndown track** — 1 Fast-Track-S equivalent of user execution time budgeted. Target: clear 4–6 of the 8 deferred plans (B-042, B-043, B-048, B-029, B-059, B-044, B-045, B-052) before sprint close. [HIGH]

### R4 Findings Summary (Sprint 19)

- **B-069**: 0 findings.
- **B-070**: 1 HIGH (prefs-only wipe UX — fixed inline with confirmation dialog), 2 MEDIUM (default-key sensitivity + dead guard — resolved by HIGH fix), 1 LOW deferred.
- **B-060**: 0 must-fix; 2 LOW deferred (pre-existing TODO from B-070 + cosmetic `<span>`).
- **B-052**: 3 MEDIUM must-fix (DOM divergence, freeze gap, redundant applyFilter — all fixed inline), 6 LOW deferred.
- Total: 1 HIGH + 6 MEDIUM + 9 LOW. All HIGH + MEDIUM resolved before merge.

---

## Sprint Close

**Status**: CLOSED 2026-04-19. v1.14.0 release pending [release-manager] execution.

### Follow-on polish items for Sprint 20 triage

1. B-046 Global keyboard shortcuts — return when B-022 or B-035 ships.
2. B-052 `byId` Map restructure to frozen plain object (R6 surfaced; S).
3. B-070 deferrables: `breakCycles` adversarial-input hardening (from B-045 R4); repair-summary UX polish pass.
4. Pre-existing `TODO(sprint-19+)` in `background/import/json-validator.js:531` — violates CLAUDE.md "no TODOs" rule (XS cleanup).
5. Backfill `C-6` + `C-7` slots in R2 Correctness Checklist (historical numbering gap; from B-069 close note).
6. B-060 follow-ons: query-length cap on filter input (security LOW, DoS-only); repair-summary jargon → plain-language extended pass.
