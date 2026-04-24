# Current Sprint

*Sprint 27 — B-023 Group Jump Popup + B-087 C-11 R2 Checklist Addition. Closed 2026-04-23 with v1.21.0.*

Two-item sprint: B-087 XS (S26 retro HIGH action) landed early; B-023 L shipped with 5 R4 HIGH fixes in a single cycle + 13/15 UAT PASS (1 SKIP vacuous + 1 unknown observability-limited, no FAILs). Second popup-surface feature after B-022 — the new C-11 R2 checklist item was applied from day one.

---

## Completed This Sprint

### [B-087] Add C-11 "Popup-lifecycle message ordering" to R2 Correctness Checklist — DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings) · no UAT (doc edit)
- **Files**: `CLAUDE.md` (+1 line — C-11 row inserted after C-10)
- **Outcome**: future popup-surface work (B-035 standalone window, B-036 new-tab page, any popup extensions) now has an explicit checklist gate. Cites Sprint 26 B-022 UAT-4 D-UAT-3 as the blocking precedent.

### [B-023] Group Jump Popup — DONE
- **Tier**: Full (L) · **Closed**: 2026-04-23
- **Pipeline**: R1 ✅ · R2 ✅ (§40 design chapter, ~5000 words) · R3 ✅ (~1400 LOC new) · R4 ✅ (3 HIGH code + 2 HIGH UAT-text + 2 MEDIUM fixed) · R5 ✅ (+44 tests) · UAT 13 PASS + 1 SKIP + 1 unknown · R6 ✅ (§40.10 As Built) · R7 ✅
- **R4 fixes shipped pre-R5**:
  - H-1 `applyGroupPickerFilter` import (spec-mandated reuse, was inline re-implementation)
  - H-2 SW listener async→sync `.catch().finally()` chain (lifecycle-continuation risk on default_popup restore)
  - H-3 UAT-3 text updated for D-6 N/A resolution
  - H-4 UAT-10 sub-case (h) added (whitespace-only query)
  - H-5 Live-tab `{tabId, windowId}` variant dispatch (was always sending `{itemId}` — functional regression vs B-022)
  - M-1 Back-button focus-visible outline (WCAG AA)
  - M-3 Drill-in listbox `aria-label` reflects group context
- **Files** (15 changed / 7 new):
  - NEW: `popup/group-jump-popup.{html,js,css}`, `tests/b023-group-jump-popup.test.js`, `docs/design/40-b-023-group-jump-popup.md`, `docs/findings/sprint-27.md`, `docs/UAT_B-023.md`, `docs/user-manual/group-jump-popup.md`
  - MOD: `CLAUDE.md` (B-087 C-11 row), `CHANGELOG.md` ([1.21.0]), `STORE_LISTING.md` (marketing expansion), `manifest.json` (version bump), `background/service-worker.js` (+chrome.commands listener), `docs/BACKLOG.md`, `docs/BACKLOG_BOARD.md`, `docs/SPRINT.md`, `docs/SPRINT_FINDINGS.md`, `docs/SOLUTION_DESIGN.md`

---

## Gate 4 — Release Checklist (verified 2026-04-23)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 CRITICAL / 5 HIGH (3 code + 2 UAT-text) all fixed · 2 MEDIUM (M-1 + M-3) applied inline · M-2 resolved as side effect of H-1 · M-4 + 7 LOW deferred to S28+ |
| 2 | All R5 automated tests passing | ✅ — **1163/1163** green (1119 baseline + 44 new B-023 cases) |
| 3 | UAT sign-off | ✅ — 13 PASS · 1 SKIP (UAT-14 C-11 vacuous per D-7) · 1 unknown (UAT-3 popup-to-popup transition, observability-limited; not FAIL) |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` slices updated | ✅ — §40 chapter authored at R2 + §40.10 As Built at R6 (3 R4 + 2 R3 deviations documented) · root index §40 TOC entry · §39 (B-022) untouched (verified) |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions; only `version` 1.20.0 → 1.21.0 bump; `group-jump` command was pre-registered v1.18.0+ |
| 7 | `./build.sh` produces clean package | ✅ — 260 K zip, 74 files |
| 8 | Rollback plan documented | ✅ — §40.8: `git revert` is data-clean; zero new partitions, zero new message types, zero new permissions |
| 9 | README / user manual / STORE_LISTING updated | ✅ — CHANGELOG [1.21.0] + new `docs/user-manual/group-jump-popup.md` + STORE_LISTING bullet expanded |
| 10 | `BACKLOG.md` — B-023 + B-087 `done` | ✅ |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ — 89% (77/87) · 0 in-progress · S28 next |
| 12 | `SPRINT.md` "Completed This Sprint" reflects B-023 + B-087 | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 27

### Velocity

- Planned: 2 items (1 Full L + 1 Fast Track XS)
- Delivered: 2 items — 100% scope
- Test growth: **1119 → 1163 (+44)** via new `tests/b023-group-jump-popup.test.js`
- UAT rounds: **1** fix cycle for B-023 (5 HIGH fixed pre-R5; no UAT-driven fix cycles post-R5)
- Follow-ups filed: none net new (S25 + S26 + S27 hygiene absorbed into S28 candidate bundle)
- Release: **v1.21.0**

### What Went Well

1. **B-087 discipline — the meta-loop worked**. Sprint 26 retro identified a load-bearing gap (popup-lifecycle message ordering). S27 filed B-087 in kickoff, shipped it early-wave so B-023 R2 could reference the canonical C-11 text. The whole chain (retro → filing → sprint kickoff → early ship → downstream application) took under one sprint. Validates the "small-item codification of runtime lessons" pattern established by B-085 (C-10) and B-077 (DoR Gate 7 subsection).
2. **R4 triage rubric update paid off on first use**. S26 retro said "deviates from spec skeleton + user-visible = HIGH by default." qa-reviewer elevated `async` listener deviation from M-1 to HIGH per this rubric and caught a real lifecycle bug. Without the rubric update, the async listener bug would likely have shipped (silent regression of B-022's default_popup).
3. **B-022 precedent reuse was dense and correct**. `shared/highlight.js` + `shared/favicon.js` + `shared/group-picker-core.js` consumed verbatim; popup shell patterns (aria-activedescendant, focus trap, debounce 120ms, empty-state direct-child-of-root, body-width anchor) lifted from §39 As Built without adjustment. The three patterns from S26 UAT fixes (D-UAT-1/2/3) all applied from day one — no re-discovery.
4. **Zero UAT fix cycles for B-023**. All 5 HIGHs landed at R4 (before R5 tests); R5 wrote tests against the fixed code; pre-merge UAT cleared 13/13 actionable cases first pass. Contrast with S26 B-022 which needed 3 UAT-4 fix cycles for popup-lifecycle issues. Codifying S26's lessons into rubric + checklist (B-087) directly reduced S27's UAT surface.

### What to Improve

1. **MEDIUM — R3 code quality drift on reuse contracts**. R3 shipped three independent deviations from R2's reuse spec: H-1 (inline `applyGroupPickerFilter`), H-2 (async listener), H-5 (missing live-tab variant). All three were well-specified in R2 but glossed in R3. Pattern suggests R3 frontend-engineer under-reads R2 §N.2 "Reuse surface" tables when they're presented as expository rather than prescriptive. For S28+: tighten R2 reuse-surface tables to use MUST language ("MUST import", "MUST match precedent at line N") — make the contract unambiguous.
2. **MEDIUM — UAT-3 observability limitation**. Popup-to-popup transitions (Alt+K while B-022 is focused) are hard to observe manually because MV3 popup tear-down + SW listener dispatch happen atomically. Same class of observability gap as S26 chrome-mock popup-lifecycle race. Candidate for test infrastructure investment: a SW-logged event trace that UAT tester can inspect post-action to verify the sequence occurred. S28 investigation.
3. **MEDIUM — C-11 adjacent-pattern class surfaced**. D-R4-2 (async `setPopup` restore race) is NOT a C-11 violation (no `sendMessage` writes involved), but IS the same root-cause class: popup lifecycle can terminate async continuations mid-flight. C-11 covers writes; the restore-state issue is an adjacent-but-distinct check. Consider proposing a C-12 "Popup-lifecycle continuation state" check for future retro (after one more precedent event — don't over-proliferate checklist items for single occurrences).
4. **LOW — hygiene debt accumulating**. S25 carry-forward (3 items) + S26 carry-forward (6 DM items) + S27 carry-forward (2 MEDIUM + 7 LOW) = ~15 opportunistic-debt items. Proposal for S28 or S29: bundle a "B-088 Popup + sidepanel hygiene pass" item (P2/S) — absorbs the drive-by debt without cluttering feature sprints. Alternative: keep absorbing as drive-bys on touched files.

### Action Items for Sprint 28

- [ ] **[scrum-master]** S28 kickoff — per roadmap, candidates are B-035 (standalone window, P2/M) + B-046 (global shortcuts, P2/S, now fully unblocked by B-023 shipping) + B-082 (popup open-sidepanel button, P1/XS). P-1 allows one M; could pair all three. [HIGH]
- [ ] **[solution-architect]** R2 reuse-surface tables — adopt MUST language going forward. Document retrospective note in CLAUDE.md §Round 2 mentoring section (if section exists; else file as a new sub-item for next R2 template update). [MEDIUM]
- [ ] **[test-engineer]** Investigate SW-logged event trace for UAT popup-to-popup observability. S28+. [MEDIUM]
- [ ] **Hygiene carry-forward**: either absorb as drive-by during S28 sidepanel/popup work, OR file B-088 as dedicated hygiene-pass item. Product-owner decision at S28 kickoff. [LOW]

### R4 Findings Summary (Sprint 27)

- **B-087**: 0 findings (clean CLAUDE.md edit)
- **B-023**: 0 CRITICAL / 5 HIGH (all fixed) / 4 MEDIUM (2 fixed inline; 2 deferred) / 7 LOW (deferred)
- **Total**: 0 CRITICAL / 5 HIGH / 4 MEDIUM / 7 LOW
- **UAT layer**: 0 blockers caught (contrast with S26: 3 blockers). Effectiveness of S26 retro action items visible — B-087 C-11 codification + rubric update + R4 triage elevation all contributed.
- **Security posture**: B-022 patterns inherited; zero new network calls; zero new permissions; zero new message types or partitions; XSS surface tight (textContent + `buildHighlightedText` DocumentFragment); SW listener sync + idempotent
- **Full dedup**: `docs/findings/sprint-27.md`

**Key lesson**: two-item sprints (1 L + 1 XS/S) feel optimal when the XS/S closes a retro action from the prior sprint and the L applies it. This was the "meta-loop" pattern validated in S27.

---

## Sprint Close

**Status**: CLOSED 2026-04-23. v1.21.0 release pending commit + tag + archive.

### Follow-on for Sprint 28

Per roadmap + retro:
- **B-035** (P2/M) — standalone window. Applies C-11 (window lifecycle similar to popup). Full tier.
- **B-046** (P2/S) — Global keyboard shortcuts (now fully unblocked after B-023). Fast Track.
- **B-082** (P1/XS) — popup open-sidepanel button. Fast Track.
- Optional: **B-088** (new, P2/S) — Popup + sidepanel hygiene pass (S25 + S26 + S27 carry-forward). Product-owner decision.
- P-1 satisfied (single M); P-2 satisfied (multiple S/XS pair).
