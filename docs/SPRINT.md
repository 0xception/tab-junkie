# Current Sprint

*Sprint 26 — B-022 Quick Search Popup (Full L, single-item sprint). Closed 2026-04-23 with v1.20.0.*

First major L feature since B-030 v2 (S23). Pre-merge UAT caught one critical design-spec race (D-UAT-3) and two layout bugs (D-UAT-1 + D-UAT-2) — all fixed in-sprint. Spawned a new R2 Correctness Checklist item (C-11) for future popup-surface work.

---

## Sprint Readiness (Gate 6) ✅

Verified at kickoff. All deps resolved. Baseline 1080/1080 → final **1119/1119** (+39 via `tests/b022-quick-search.test.js`).

---

## Retro Action-Item Application (from S25)

| # | Action | Applied |
|---|--------|---------|
| HIGH (resume roadmap B-022) | S25 retro prioritised B-022 as S26 | ✅ shipped |
| LOW (S25 hygiene carry-forward) | Opportunistic | 🧊 deferred to S27+ |
| C-10 check (if snapshot APIs used) | R2 §39.7 confirmed N/A — popup uses standard in-flow DOM | ✅ N/A verified |
| Pre-merge UAT (HIGH-3) | L tier mandatory | ✅ 12/12 PASS (after 3 fix cycles on UAT-4) |
| Per-item UAT plan (HIGH-2) | R1 authored UAT_B-022.md (12 cases) | ✅ |

---

## Completed This Sprint

### [B-022] Quick Search Popup — DONE
- **Tier**: Full (L) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R2 ✅ (§39 design chapter, ~5k words) · R3 ✅ (~1200 LOC new) · R4 ✅ (3 HIGH + 2 MEDIUM fixed) · R5 ✅ (+39 tests) · UAT 12/12 PASS · R6 ✅ (§39.10 As Built) · R7 ✅ (CHANGELOG + user manual)
- **UAT fixes shipped in-sprint** (after UAT-4 FAIL × 3):
  - D-UAT-1 popup body-width anchor (`html, body { width: 480px }`)
  - D-UAT-2 empty-state reparented out of `#qs-results-scroll` (overflow clipping fix)
  - D-UAT-3 popup-lifecycle message race (MSG_RECENCY_ADD sent BEFORE MSG_NAVIGATE_TO_ITEM)
- **R4 fixes shipped pre-R5**: H-1 google.com favicon removed + `isSafeFaviconUrl` promoted to `shared/favicon.js` + letter-avatar fallback · H-2 Tab/Shift+Tab focus trap · H-3 bookmark/live-dot icon differential on favicon overlay · M-1 `maxlength="256"` on input · M-2 empty-state live-region routing through `#qs-status`
- **Files** (12 changed / 6 new):
  - NEW: `popup/popup.{js,css}`, `shared/{favicon,highlight}.js`, `docs/design/39-b-022-quick-search-popup.md`, `docs/findings/sprint-26.md`, `docs/UAT_B-022.md`, `docs/user-manual/quick-search-popup.md`, `tests/b022-quick-search.test.js`
  - MOD: `manifest.json` (version bump only), `CHANGELOG.md`, `popup/popup.html` (stub → real), `shared/messages.js` (+`MSG_RECENCY_ADD`), `background/storage/{shapes,partitions,index,migration}.js` (+`tj:recency` partition), `background/messages/storage-handlers.js` (+dispatch case), `sidepanel/sidepanel.js` (imports `isSafeFaviconUrl` + `buildHighlightedText` from shared), `tests/storage-init.test.js`, `docs/{BACKLOG,BACKLOG_BOARD,SOLUTION_DESIGN,SPRINT,SPRINT_FINDINGS}.md`

---

## Gate 4 — Release Checklist (verified 2026-04-23)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 CRITICAL / 3 HIGH (B-022-H1/H2/H3) fixed · 2 MEDIUM (M-1/M-2) applied inline · 6 DM + 6 LOW deferred to S27+ hygiene |
| 2 | All R5 automated tests passing | ✅ — **1119/1119** green (1080 baseline + 39 new B-022 cases) |
| 3 | UAT sign-off | ✅ — 12/12 PASS in Edge after 3 fix cycles on UAT-4 |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` slices updated | ✅ — §39 chapter authored at R2 + §39.10 As Built at R6 (6 deviations documented: 3 R3 + 3 UAT) · root index flipped "R2 Design" → "R6 Close" |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions; only `version` 1.19.0 → 1.20.0 bump |
| 7 | `./build.sh` produces clean package | ✅ — 248 K zip, 71 files |
| 8 | Rollback plan documented | ✅ — §39.8: `git revert` is data-clean; `tj:recency` orphan key is inert |
| 9 | README / user manual / STORE_LISTING updated | ✅ — CHANGELOG [1.20.0] + new `docs/user-manual/quick-search-popup.md` (per-feature page) + STORE_LISTING already had quick-search bullet from prior prep |
| 10 | `BACKLOG.md` — B-022 `done` | ✅ |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ — 87% (75/86) · 0 in-progress · S27 next |
| 12 | `SPRINT.md` "Completed This Sprint" reflects B-022 | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 26

### Velocity

- Planned: 1 item (Full L) — single-item sprint
- Delivered: 1 item — 100% scope, no descope
- Test growth: 1080 → **1119 (+39)** via new `tests/b022-quick-search.test.js`
- UAT rounds: **3** fix cycles on UAT-4 (width → empty-state positioning → popup-lifecycle race) before all 12 cases cleared
- Follow-ups filed: **B-087** (proposed — CLAUDE.md C-11 checklist addition); hygiene bundle DM-1 through DM-6 remains unfiled (opportunistic S27+)
- Release: **v1.20.0**

### What Went Well

1. **R2 discipline carried most of the design**. §39 chapter (~5k words with 6 decisions + 10-item correctness checklist + 8-element CSS enumeration) survived R3 with only 3 R3-time deviations (migration, breadcrumb, cap-split) — all minor simplifications, not redesigns. Frontend-engineer followed the spec precisely through ~1200 LOC of new code.
2. **Search index + highlight helper reuse paid off**. `shared/highlight.js` (promoted from sidepanel B-021) + `sidepanel/search-index.js` (B-052 cache) consumed verbatim — zero parallel implementations in the popup. DRY discipline validated: promoting `isSafeFaviconUrl` to `shared/favicon.js` during the R4 H-1 google-favicon removal was a bonus DRY win.
3. **39 automated tests in R5 covered pure + SW-side layers solidly**. Pure-logic reproduction (scoring, cap-split, selection) + real SW-side handler exercise (migration + writeTransaction) gave confidence in the surfaces that matter. Popup DOM tests skipped by design (§39.6 precedent) with UAT backstop.
4. **Cross-sprint infrastructure holds**. The `writeTransaction` + `ALL_PARTITIONS` seeding primitive let B-022 introduce `tj:recency` as a purely additive partition (no `MIGRATION_STEPS` entry needed). This is the fourth partition added post-v1.0.0 without a schema break.

### What to Improve

1. **HIGH — Three UAT-discovered design defects traced to a single root cause**: "R2 reasoned about the spec, not about the MV3 popup runtime." UAT-4 FAIL × 3:
   - D-UAT-1 (width): spec assumed root element sized popup; actual MV3 popup sizes to `<body>`. Pure runtime gotcha R2 didn't catch.
   - D-UAT-2 (empty-state clipping): R4 code-reviewer flagged the positioning-parent deviation as LOW (L-1) and I deferred it. Wrong call — layout-parent findings that affect user-visible behavior are HIGH by default.
   - D-UAT-3 (popup-lifecycle race): spec wrote "send recency AFTER navigate resolves." In practice, `chrome.tabs.update({active: true})` tears the popup down mid-await. Chrome-mock in tests doesn't reproduce the race. **This one would have shipped silently to users** (automated tests green, popup-facing errors swallowed) had UAT not checked post-action recency state.
   - Pattern: three separate fix cycles on a single AC (UAT-4 recency mode). The Sprint 23 retro HIGH-3 "pre-merge UAT for L tier" is load-bearing for the FOURTH consecutive sprint (S22→S23→S24→S26 — S25 was trivial Fast Track).
2. **MEDIUM — R4 LOW-severity triage needs revisiting**. Code-reviewer L-1 (`#qs-empty` nested in wrong parent) was a direct user-visible layout bug. I marked it LOW based on the description "centring still works (nearest positioned ancestor)" — missed that `overflow: hidden` + absolute-positioned child + small container = clipped content. Lesson: "deviates from spec skeleton" should default to HIGH when the deviation is structural, not MEDIUM/LOW. Absorb as an R4 triage heuristic.
3. **MEDIUM — Chrome-mock gap for popup lifecycle races**. Automated tests didn't reproduce D-UAT-3 because the mock doesn't simulate "popup closed mid-await." Tests would need to simulate the focus-shift side effect to catch this class of bug. Flag as a test-infrastructure S27+ improvement: a `chrome.tabs.update` mock that optionally "closes" the sender context could catch the whole class.
4. **LOW — UAT-5 noted scroll below the fold with 9 results**. User flagged this as "UI tweaks needed — push to backlog." Already captured in B-086 (P3/M deferred UI design pass filed S25). Adding a specific sub-note: popup list height + result-row density should be re-examined when B-086 runs.

### Action Items for Sprint 27

- [ ] **[solution-architect]** File B-087 — add **C-11** "Popup-lifecycle message ordering" to R2 Correctness Checklist in CLAUDE.md. Pattern: B-085 (C-10 addition). P1/XS. Precedent text: Sprint 26 B-022 UAT-4 D-UAT-3. [HIGH]
- [ ] **[scrum-master]** R4 triage rubric update — "deviates from spec skeleton" + "touches user-visible positioning" = HIGH by default; LOW reserved for purely cosmetic or doc-only drift. Document in retro action list for the next CLAUDE.md editorial pass. [MEDIUM]
- [ ] **[test-engineer]** Investigate chrome-mock for `chrome.tabs.update` focus-shift simulation. If feasible, add a `__test__.simulateActivateShuttersPopup()` helper that closes the sender context, then rerun b022 tests with it to pin D-UAT-3 as a regression. S27 scoping; if complex, defer. [MEDIUM]
- [ ] **B-083/B-084 hygiene carry-forward** (S25 debt): absorb during any S27+ sidepanel work. [LOW]
- [ ] **B-086 UI design pass** — add "popup row-density + list height" as an in-scope item when triggered. Already filed; note added to the chapter. [LOW]

### R4 Findings Summary (Sprint 26)

- **B-022**: 0 CRITICAL / 3 HIGH (all fixed) / 4 MEDIUM (M-1 + M-2 fixed; M-3 + M-4 deferred) / 6 LOW (L-2 fixed via H-1 side-effect; L-1 upgraded to UAT-2 fix; rest deferred)
- **Total R4**: 0 CRITICAL / 3 HIGH / 4 MEDIUM / 6 LOW
- **UAT layer**: 3 blockers caught pre-merge (width + empty-state + recency-race) — all resolved in-sprint. HIGH-3 validated for the 4th sprint in a row.
- **Security posture**: zero new network calls (post-H1 fix) · zero new permissions · new `MSG_RECENCY_ADD` handler validated (payload shape, prefix allow-list, 4200-char cap) · `tj:recency` partition asserts v1 schema on read.
- **Full dedup**: `docs/findings/sprint-26.md`

**Key lesson**: single-item L sprints are the highest-risk sprint tier because there's no diversity of work to surface cross-cutting process issues. B-022 exposed three UAT-discovered runtime gotchas in the popup lifecycle — all invisible to automated tests, all surface-critical. Future popup / standalone-window / new-tab work (B-023, B-035, B-036) inherits the C-11 requirement.

---

## Sprint Close

**Status**: CLOSED 2026-04-23. v1.20.0 release pending commit + tag + archive.

### Follow-on for Sprint 27

S27 scope (per action items + feature-parity roadmap):
- **B-087** (new, P1/XS) — CLAUDE.md C-11 addition (retro-HIGH action)
- **B-023** (P1/L) per roadmap — Group jump popup (inherits B-022's popup-surface patterns + now C-11 requirement)
- **B-035** (P2/M) per roadmap — Standalone window (popup-surface, C-11 applies)
- Possibly B-083/B-084 hygiene drive-by
- S27 is a two-L sprint candidate per P-1 (max one L/XL active) — likely B-023 alone, push B-035 to S28
