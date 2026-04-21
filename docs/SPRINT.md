# Current Sprint

*Sprint 21 — Product-owner pivot to feature-parity roadmap. Closed 2026-04-20 with v1.16.0.*

This sprint started as a first-class UAT burndown sprint (per Sprint 20 retro HIGH rule). Mid-sprint, after B-042 essentials-only pass completed (6/6 PASS), the product-owner pivoted: defer comprehensive UAT to a dedicated sweep at the end of feature parity work. Sprint 21 reshaped to close the polish queue + file + ship the feature-parity roadmap.

---

## Sprint Readiness (Gate 6) — as originally scoped

- ✅ Scope approved (original): UAT burndown (≥ 4 of 9 plans PASS) + B-077 + B-078 + B-079 + B-080
- ✅ Scope changed (mid-sprint): B-042 essentials-only pass (6/6 PASS; 8 SKIP) + B-081 added (UAT-unblocker) + B-082 filed (feature-parity roadmap) + docs/FEATURE_PARITY_ROADMAP.md authored
- ✅ Sprint 20 closed 2026-04-20; v1.15.0 tag on `release/v2`; archive commit `d48136f`
- ✅ Deps-resolved check (new Gate 6 bullet from Sprint 20 B-071): all items passed

---

## Completed This Sprint

### [B-042] UAT — essentials-only pass — PASS (6/6 essential cases)
- **Plan**: `docs/UAT_B-042.md` · **Committed**: `8cf8e2c` on `release/v2`
- **Passed**: UAT-1 happy path · UAT-2 keyboard · UAT-3 Chromium round-trip (Edge) · UAT-6 orphan rescue (Q-H1) · UAT-7 XSS probe (AC10) · UAT-8 Unicode/emoji (Q-4)
- **Skipped**: UAT-4 (Firefox not installed) · UAT-5 (destructive empty-state, deferred) · UAT-9..14 (automated coverage + niche scenarios — all deferred to S27 comprehensive sweep)
- **Plan drift logged**: UAT-1/UAT-2 plan steps referenced an "overflow menu" entry point that doesn't exist in the shipped build; actual path is the direct `#export-html-btn` button.

### [B-081] New-group button in sidepanel header — DONE (mid-sprint, UAT-surfaced)
- **Tier**: Fast Track (XS) · **Merged**: `05a4049` on `release/v2` (PR #25, 2026-04-20)
- **Files**: `sidepanel/sidepanel.html` (+button), `sidepanel/sidepanel.js` (+ref + delegation), `tests/b081-add-group-button.test.js` (+3 tests)
- **Origin**: real UX gap surfaced during Sprint 21 UAT setup — post-B-029, once ≥ 1 group exists the only group-create path was unreachable from the UI. Fix was ~15 LoC.

### [B-077] DoR Gate 7 check subsection in R1 AC template — DONE (Wave 0)
- **Tier**: Fast Track (XS) · **Merged**: `fa1a8df` on `release/v2` (PR #26, 2026-04-20)
- **Files**: `CLAUDE.md` (new R1 subsection), `CHANGELOG.md` (Process breadcrumb)
- **R4**: [code-reviewer] smoke PASS, [security-reviewer] no-op gate protector PASS
- **Sprint 20 retro MEDIUM closed** — B-007 AC15 reactive-placement pattern prevented going forward.

### [B-078] `breakCycles` adversarial-input hardening — DONE (Wave 1)
- **Tier**: Fast Track (XS defensive) · **Merged**: `fa1a8df` on `release/v2` (PR #26, 2026-04-20)
- **Files**: `background/import/json-validator.js` (MAX_CYCLE_WALK_DEPTH = 1000 + depth-counter in cycle walk), `tests/sprint-21-polish.test.js` (+2 tests)
- **Sprint 18 R4 LOW closed** — adversarial 1500-node cycle test terminates in < 100 ms (budget: 10 s).

### [B-079] Query-length cap on filter input — DONE (Wave 1)
- **Tier**: Fast Track (XS security) · **Merged**: `fa1a8df` on `release/v2` (PR #26, 2026-04-20)
- **Files**: `sidepanel/sidepanel.html` (`maxlength="256"` on `#filter-input`), `tests/sprint-21-polish.test.js` (+1 test)
- **Sprint 19 R4 security LOW closed** — DoS-only vector capped at 256 chars.

### [B-080] Import-toast plain-language repair breakdown — DONE (Wave 1)
- **Tier**: Fast Track (XS UX) · **Merged**: `fa1a8df` on `release/v2` (PR #26, 2026-04-20)
- **Files**: `sidepanel/sidepanel.js` (extracted `_plainLanguageRepairParts` shared helper; toast path expanded to use it; preview-dialog body refactored to call it), `tests/sprint-21-polish.test.js` (+3 tests)
- **Sprint 19 R4 QA LOW closed** — toast now shows inline per-type breakdown ("2 repairs: 1 group loop fixed, 1 item with no group moved to Ungrouped") instead of summary count only.

### [FEATURE_PARITY_ROADMAP] — AUTHORED
- `docs/FEATURE_PARITY_ROADMAP.md` — 7-sprint plan covering S22 (drag foundation) through S27 (comprehensive UAT sweep) + S28 TBD (v2→main merge decision, deferred pending S27 results per product-owner).
- Supersedes the Sprint 20 retro HIGH "UAT burndown first-class" rule **for Sprint 21 only** — Sprint 21's abbreviated UAT pass (essentials on B-042 only) is the documented exception.

### [B-082] Popup "Open side panel" button — FILED (backlog)
- `docs/BACKLOG.md` — new P1 XS item. Scheduled for S26 per roadmap.
- Scope: button in `popup/popup.html` wired to `chrome.sidePanel.open()`. Complements B-046 (keyboard-shortcut registration side) for the Ctrl+J → popup → Tab → Enter flow.

---

## Gate 4 — Release Checklist (verified 2026-04-20)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 findings this sprint |
| 2 | All R5 automated tests passing | ✅ — **979/979** green on `release/v2` (post-merge `fa1a8df`) |
| 3 | UAT sign-off recorded | ✅ — B-042 essentials-only PASS (6/6 essential cases); 8 plans + B-042 non-essentials DEFERRED to S27 comprehensive sweep per product-owner pivot |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` slices updated | N/A — no new design chapters this sprint (all polish items are internal hardening; no new architecture) |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions |
| 7 | `./build.sh` produces clean package | ✅ — 605 K zip, 66 files |
| 8 | Rollback plan documented | ✅ — all items are pure-revert safe (no schema / message / manifest drift) |
| 9 | README / user manual updated | ✅ — CHANGELOG [1.16.0] entry authored; user-manual slices unchanged (no new user-visible feature beyond B-081's `+` button) |
| 10 | `BACKLOG.md` — all Sprint 21 items `done` | ✅ (65/82) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ (79%, 0 in-progress, Sprint 21 closed) |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 21

### Velocity

- **Planned (kickoff)**: 4 items — B-077 (XS), B-078 (XS), B-079 (XS), B-080 (XS) + UAT burndown (target ≥ 4/9 plans PASS).
- **Delivered**: 5 items shipped (+ B-081 mid-sprint UAT-unblocker) + 1 UAT plan essentials PASS + FEATURE_PARITY_ROADMAP.md authored + B-082 filed.
- **Scope changed**: UAT burndown target dropped from "≥ 4 plans PASS" to "essentials only on 1 plan (B-042)" per product-owner mid-sprint pivot. 8 plans deferred to S27 comprehensive sweep.
- **Test suite growth**: 971 → 979 (+8 in `tests/sprint-21-polish.test.js`; +3 in `tests/b081-add-group-button.test.js` landed mid-sprint).

### What Went Well

1. **UAT walkthrough surfaced B-081 as a real UX gap in minutes.** B-029's empty-state-CTA was the only group-create path; once ≥ 1 group existed it was unreachable. Sprint 1 + Sprint 11 neither owner caught this because "create a group" was always done via a fresh-profile picker. A 20-minute product-owner walkthrough surfaced + fixed + shipped the gap. Validates the in-session UAT pattern.
2. **Sprint 20 retro rules fired correctly.** B-071's deps-resolved Gate 6 check ran cleanly on all 6 Sprint 21 items. B-072's DoR item 7 was applied to every new AC block (B-081 AC6 and B-082 AC8). Sprint 20's C-6 + C-7 didn't fire (no manifest/sanitizer surface this sprint).
3. **Product-owner pivot was clean.** UAT walkthrough reached a natural decision point after 6 PASS + 2 SKIP; product-owner called the pivot to feature parity; Sprint 21 reshaped in-place (SCOPE CHANGE LOG + retro action supersede note + roadmap authoring) without ceremony. Scope control protocol followed.
4. **Polish queue cleared.** B-078 (Sprint 18 LOW), B-079 + B-080 (Sprint 19 LOWs) all shipped. The polish backlog is shorter than it's been in months.

### What to Improve

1. **UAT plan drift.** B-042 UAT-1 + UAT-2 both referenced a "sidepanel header overflow menu" that doesn't exist in the shipped build. The plans were authored in Sprint 17 against a speculative UI that was never built. Action: S27 comprehensive UAT sweep MUST include a plan-correction pre-pass — before running any plan, grep the plan's `#element-id` references + `click X → Y` flows against the current markup. Any drift gets a correction commit BEFORE the user walks the cases.
2. **Sprint 20 retro HIGH rule was superseded on its second sprint.** "UAT burndown as a first-class sprint item" lasted half a sprint before the product-owner chose feature parity instead. Action for the FEATURE_PARITY_ROADMAP: S27 MUST be the true first-class UAT sprint — no forward feature; comprehensive sweep is the full sprint. Treat S27 as the only dispensation.
3. **Stash workflow friction.** The Phase-1 / Phase-2 split (feature branch for code, direct commit on release/v2 for release bump) required a stash dance for CHANGELOG + manifest that nearly lost the edits twice. Future sprints: either (a) bundle the release bump into the feature PR and accept the small impurity, or (b) do release work as a chained commit on release/v2 immediately after merge, not in a stash. I'll default to (a) for small sprints with a single PR.

### Action Items for Sprint 22 and beyond

- [ ] **[scrum-master]** S27 plan-correction pre-pass: before walking any UAT plan, grep plan references vs current markup; file any drift as correction commits pre-UAT. [HIGH]
- [ ] **Every S22–S26 feature ships with a 5–10 case smoke UAT plan** authored during R1 (not as an afterthought). Per FEATURE_PARITY_ROADMAP. [MEDIUM]
- [ ] **Release flow**: bundle release bump + CHANGELOG [version] promotion into the feature PR for single-PR sprints; reserve the stash dance for multi-PR sprints where Phase 1 spans days. [LOW]

### R4 Findings Summary (Sprint 21)

- **B-077 / B-078 / B-079 / B-080 / B-081**: 0 findings each. Fast Track smoke-checks all PASS.
- **Total**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW. Second consecutive zero-findings sprint.

---

## Sprint Close

**Status**: CLOSED 2026-04-20. v1.16.0 release pending tag + archive.

### Follow-on for Sprint 22 (per FEATURE_PARITY_ROADMAP.md)

S22 theme: **Drag foundation** — B-025 Multi-item drag + B-031 Group drag-reorder+nesting + B-032 Auto-scroll helper. Parallelization P-3 hit (max 2 M), P-2 allows S. Each item ships with a 5–10 case smoke UAT plan.
