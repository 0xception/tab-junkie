# Current Sprint

*Sprint 29 — B-089 Settings Panel + B-036 New Tab Page + B-038 View Mode Pref + B-040 Sub-group Auto-collapse. **B-039 dropped pre-merge.** Closed 2026-04-24 with v1.23.0.*

5-item kickoff slate; 4 shipped, 1 dropped at sprint close. B-089 (Fast Track S) filed mid-kickoff as scaffolding to unblock the XS prefs (no settings surface existed). B-036 anchored as the final feature-parity item (Full L). B-039 newtab toggle was built and reviewed clean, but pre-merge UAT surfaced that MV3 prevents runtime removal of `chrome_url_overrides.newtab` — meaning the OFF state could not actually return browser-default new tab behavior. Product-owner call: drop B-039, ship newtab always-on. UAT-2 (sub-group ordering) and UAT-3 (duplicate indicator dots) and UAT-9f-1 (dialog stacking) all caught in pre-merge UAT and fixed.

---

## Completed This Sprint

### [B-089] Settings Panel Scaffolding — DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ (~ +780 LOC: dialog markup + module + helpers + 24 tests) · R4 ✅ (0 CRITICAL · 0 HIGH security · 2 HIGH code [Escape close + init dedup] both fixed · 3 MEDIUM defense-in-depth · LOW dropped)
- **Files**: `sidepanel/settings-dialog.js` (new, ~547 LOC), `sidepanel/sidepanel.{html,js,css}` (gear button + overlay wiring + 165 LOC dialog styles), `tests/b089-settings-dialog.test.js` (new, 24 tests)
- **Highlights**: `renderToggle` / `renderSelect` helpers consumed by B-038 + B-040. Sender-id validation + textContent-only render + idempotent init guard. Modal-stacking guard added pre-merge to address UAT-9f-1 (Settings + Add Bookmark coexistence bug).

### [B-036] New Tab Page Replacement — DONE
- **Tier**: Full (L) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ (23 ACs) · R2 ✅ (§42 design chapter) · R3 ✅ (5 new files; 32 R3 tests) · R4 ✅ (0 CRITICAL · 4 HIGH all fixed [`_itemById` O(n²) hot loop, `_applyFilter` redundant DOM walk, missing `console.warn` breadcrumb, missing `_handleBroadcast` try/catch] + ~10 MEDIUM/LOW · QA included) · R5 ✅ (4 gap-fill tests + 30-case UAT plan) · pre-merge UAT 5 fix cycles
- **Files**: `newtab/newtab.{html,js,css}` (new), `newtab/theme-init.js` (new — verbatim duplicate of sidepanel; S30+ extraction candidate), `tests/b036-newtab.test.js` (new), `docs/design/42-b-036-newtab-page.md` (new), `docs/user-manual/new-tab-page.md` (new), `docs/UAT_B-036.md` (new, 30 cases)
- **R2 decisions** (§42.3): D-1 vanilla DOM (no sidepanel.js import); D-2a `about:blank` redirect (RESCINDED at sprint close — newtab is always-on); D-2b `chrome.search.query`; D-3 CSS Grid `repeat(auto-fill, minmax(320px,1fr))`; D-4 import fuzzy index from sidepanel verbatim; D-5 C-11 fire-and-forget click-to-navigate; D-6 serial pref-read then `Promise.all([items, groups])`; D-7 module-scope onMessage subscription
- **Pre-merge UAT fix bundle** (5 issues caught + fixed):
  - UAT-2 sub-group order swap → removed name tiebreaker in `_orderedGroupIds`; preserve insertion order matching sidepanel
  - UAT-3 two green circles → `_buildItemRow` was double-creating indicator wrap; removed early `_applyRowLiveState` call from initial-render path
  - UAT-5 `/` shortcut → guard was over-broad (any INPUT short-circuited); narrowed to web-search input only
  - UAT-9f-1 dialog stacking → Settings dialog now refuses to open when another overlay sibling is visible (`_isAnyOtherDialogVisible` walk)
  - UAT-9f-2 `about:blank` UX → reverted to disabled-state CTA → ULTIMATELY rolled back entirely with B-039 drop (newtab is always-on)
- **As Built deviations** (§42.10): D-2a rescinded (B-039 drop), `_itemMap` O(1) lookup added, render-in-flight guard, broadcast handler try/catch, ARIA polish (no `aria-live` on grid, no redundant `role="listitem"` on button, count-badge label)

### [B-038] View Mode Preference — DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ (17 ACs) · R2 ✅ (§43 design chapter — tier-upgrade flag cleared; routing pattern locked: popup-as-router) · R3 ✅ (5 file delta + 18 tests) · R4 ✅ code PROCEED + security PROCEED (0 CRITICAL/HIGH; all 4 gate checks PASS — C-11 ordering, dispatcher-naming, corrupt-pref allow-list, AC17g ordering test)
- **Files**: `shared/messages.js` (+`MSG_OPEN_STANDALONE` — non-`tj/` prefix per dispatcher-collision avoidance), `background/service-worker.js` (+onMessage branch), `popup/popup.js` (`_bootWithPref` + `_bootQuickSearch` split; fire-and-forget sendMessage + immediate `window.close`), `sidepanel/sidepanel.js` (renderSelect call), `tests/b038-view-mode-pref.test.js` (new, 18 tests)
- **R2 decisions** (§43): D-1 popup-as-router (Candidate B; A rejected — MV3 cannot discriminate Alt+J from toolbar-click); D-2 surfaces governed = toolbar + `_execute_action`; D-3 inherit B-035 fallback. Naming normative: `displayMode` ∈ `'sidepanel'|'window'`.
- **AC8 reinterpretation**: literal AC8 (Alt+J always opens quick-search) infeasible in MV3; revised: Alt+J follows `displayMode`. Documented in §43.4 D-1.2; product-owner ack on close.

### [B-040] Sub-group Auto-collapse Preference — DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ (14 ACs) · R3 ✅ (~75 LOC: renderToggle + cascade helper + toggleGroup gate + 17 tests) · R4 ✅ code PROCEED + security PROCEED (0 CRITICAL/HIGH; 1 MEDIUM unreachable double-catch — non-blocking S30+ hygiene; 1 LOW console.warn policy)
- **Files**: `sidepanel/sidepanel.js` (+~75 LOC), `tests/b040-auto-collapse-subgroups.test.js` (new, 17 tests)
- **Outcome**: One-way collapse cascade gated on `autoCollapseSubGroups` pref (canonical key — caught lowercase drift in BACKLOG R1 AC). `Promise.all` over individual `MSG_UPDATE_GROUP` calls (no bulk variant). Default OFF preserves B-008 independence.

---

## Dropped at Sprint Close

### [B-039] New Tab Page Toggle Preference — DROPPED
- **Tier**: Fast Track (XS) · originally shipped R3 + R4 clean (12 tests, 460 LOC)
- **Reason**: Pre-merge UAT-9f-2 surfaced that "OFF" cannot truly hand control back to the browser's default new tab page. Manifest V3 does NOT allow runtime removal of `chrome_url_overrides.newtab` — once declared, the extension's HTML loads on every new tab. The only available "OFF" behaviors are (a) redirect to `about:blank`, (b) render a custom disabled-state page with re-enable CTA. Neither matches user expectation of "browser default new tab page".
- **Product-owner decision** (2026-04-24): rather than ship a misleading toggle, drop the feature. Tab Junkie's new tab page is always-on whenever the extension is installed; users who don't want the override must uninstall via `edge://extensions` or `chrome://extensions`.
- **Reverted**: B-039 R3 + UAT-9f-2 fix code rolled back in same sprint. Pref key `newTabOverride` retained in `DEFAULT_PREFERENCES` for backward compat (removing requires schema migration). Newtab boot is now unconditional. Settings dialog "New tab page" section removed.
- **Caught a real win**: during the original B-039 R3, the [frontend-engineer] discovered B-036 R3 had shipped a silent canonical-key drift (`prefs.newTabEnabled` vs DEFAULT_PREFERENCES `newTabOverride`) — the validator would have rejected the toggle's writes. Without the B-039 R3 audit, this would have been a latent silent-bug. Drift fix preserved across the revert.

---

## Gate 4 — Release Checklist (verified 2026-04-24)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 open CRITICAL/HIGH across all 4 shipped items |
| 2 | All R5 automated tests passing | ✅ — **1295/1295** green (1190 baseline + ~105 net new) |
| 3 | UAT sign-off | ✅ — B-036 pre-merge UAT 5 cycles cleared; UAT-2 / UAT-3 / UAT-5 / UAT-9f-1 all PASS post-fix; B-039 dropped (UAT-9f-2 root cause) |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` updated | ✅ — §42 chapter + §42.10 As Built · §43 chapter (B-038) · §34.15 inherited from S28 (no further edits) |
| 6 | `manifest.json` permissions reviewed | ✅ — zero new permissions; only version bump 1.22.0 → 1.23.0 |
| 7 | `./build.sh` produces clean package | ✅ — 292 K zip, 78 files |
| 8 | Rollback plan documented | ✅ — §42.8 (no schema changes; `git revert` restores prior state); B-038 popup-router pattern revertible to default popup |
| 9 | README / user manual / STORE_LISTING | ✅ — CHANGELOG [1.23.0] · `docs/user-manual/new-tab-page.md` (new) · §42 chapter + §43 chapter · STORE_LISTING update pending if user-facing copy needs refresh |
| 10 | `BACKLOG.md` — all S29 items `done` or `dropped` | ✅ (B-089/B-036/B-038/B-040 done; B-039 dropped with rationale) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ — 90% (79/88) · 0 in-progress · S30 next |
| 12 | `SPRINT.md` "Completed This Sprint" | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 29

### Velocity

- Planned: 5 items (1 Full L + 1 Fast Track S + 3 Fast Track XS)
- Delivered: 4 items shipped + 1 dropped at sprint close = **80% scope shipped + 100% honest scope** (the dropped item was a discovery, not a slip)
- Test growth: **1190 → 1295 (+105 net)** — across 5 items' work plus pre-merge UAT fix tests minus the deleted B-039 suite
- UAT rounds: B-036 took 2 cycles to clear (initial 5-issue UAT batch, then re-validation)
- Release: **v1.23.0**
- **7 consecutive sprints shipped without rollback or post-merge regression** (S23 through S29)

### What Went Well

1. **Pre-merge UAT caught what tests didn't.** The S26 retro action HIGH-3 (mandatory pre-merge UAT for L tier) again paid out — 5 separate issues surfaced (sub-group order, duplicate indicator dots, `/` shortcut over-broad guard, dialog stacking, disabled-state UX). Three of them (UAT-2, UAT-3, UAT-9f-1) would have shipped silently and been hard-to-debug user complaints. UAT-9f-2 surfaced a deeper product issue (dropped B-039). Pre-merge UAT remains the strongest quality gate for L tier.
2. **B-039 R3 audit caught silent bug in B-036.** During B-039's canonical-key reconciliation, the agent discovered B-036 R3 had shipped `prefs.newTabEnabled` against the canonical `newTabOverride` — validator would have silently rejected toggle writes. Even though B-039 itself was dropped, its R3 audit prevented a latent bug. Naming-drift discipline pays out across items.
3. **Settings panel scaffolding pattern worked.** B-089 was filed mid-kickoff when pre-R1 audit found no settings UI existed. The S/M/XS tiered approach (B-089 scaffolding S → B-038/B-040 XS consumers) shipped 3 features against a single new surface. The `renderToggle` / `renderSelect` helpers were consumed cleanly by Wave 1.
4. **Dropping a feature mid-sprint is a discovery, not a failure.** Sprint scope adjusted from 5 items to 4 because the product-owner identified a fundamental MV3 constraint that made B-039's value proposition impossible. The team built the toggle, UAT exposed the limit, the toggle was reverted in the same sprint. Net cost: ~half a day of agent time. Net win: avoided shipping a misleading feature. Future sprints should normalize "build, validate, drop" as a legitimate path.

### What to Improve

1. **HIGH — Audit for MV3 manifest constraints at R1 / R2.** B-039's drop was driven by an MV3 constraint (`chrome_url_overrides` not runtime-removable) that R1 + R2 should have caught. Add an R2 Correctness Checklist item (candidate **C-12**): "**Manifest declarations runtime-mutability check** — for any feature whose enable/disable behavior depends on a `manifest.json` declaration (`chrome_url_overrides`, `chrome_settings_overrides`, `commands.suggested_key`, etc.), R2 MUST verify whether the declaration can be modified at runtime. If not, R2 explicitly enumerates the available 'OFF' behaviors and confirms with [product-manager] that the limited set is acceptable BEFORE R3 build." File this as a small CLAUDE.md edit item in S30.
2. **MEDIUM — Pre-merge UAT round count is unbounded.** B-036 took 2 UAT cycles (5 issues batch 1 → re-validate batch 2). For Full L items, allocate explicit "UAT polish budget" of 1-2 cycles after R5. Don't treat each UAT round as a sprint slip; treat it as part of the L-tier definition.
3. **MEDIUM — Cross-item naming normative reconciliation.** Two canonical-key drifts caught in S29 alone (B-036's `newTabEnabled`/`newTabOverride`, B-040's `autoCollapseSubgroups`/`autoCollapseSubGroups`). Both were R1 AC drift vs `DEFAULT_PREFERENCES`. R1 PMs should cross-check shipped storage shape names BEFORE writing AC text.
4. **LOW — Documentation lag during reverts.** When B-039 was dropped, multiple docs needed updating (§42 chapter, user manual, BACKLOG, BACKLOG_BOARD, CHANGELOG). The fix agent caught all of these, but a "drop checklist" template would speed up future reverts. Consider a small CLAUDE.md addition: a "Sprint-close drop checklist" alongside Gate 4.

### Action Items for Sprint 30

- [ ] **[solution-architect]** File **B-090** — Add **C-12** "Manifest declarations runtime-mutability check" to R2 Correctness Checklist in CLAUDE.md. P2/XS. Reference: Sprint 29 B-039 drop. [HIGH]
- [ ] **[product-manager]** R1 ACs MUST cross-check `DEFAULT_PREFERENCES` canonical key names (both case + spelling) before publishing. Add a one-line item to the R1 self-checklist in CLAUDE.md. [MEDIUM]
- [ ] **[scrum-master]** Add "Sprint Close — Item Drop Checklist" subsection to CLAUDE.md (alongside Gate 4): docs to update when an item is dropped mid-sprint (BACKLOG, BACKLOG_BOARD, design chapter, user manual, CHANGELOG, retro). [LOW]
- [ ] **S30 scope candidates**: B-037 theme selection (P2/M, last big feature), B-090 (C-12 checklist add — XS), comprehensive UAT sweep (long-deferred), B-086 UI/UX design pass (P3/M). Possibly start v2 → main merge prep. Product-owner decides at kickoff. [HIGH]

### R4 Findings Summary (Sprint 29)

- **B-089**: 0 CRITICAL / 2 HIGH (both fixed pre-R5: Escape close, init dedup) / 3 MEDIUM defense-in-depth / 2 LOW
- **B-036**: 0 CRITICAL / 4 HIGH (all fixed: `_itemById` O(n²), `_applyFilter` DOM walk, missing console.warn, missing try/catch) / ~10 MEDIUM/LOW (mostly fixed inline)
- **B-038**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (catch broadness, test reproduction drift) / 2 LOW
- **B-040**: 0 CRITICAL / 0 HIGH / 1 MEDIUM (unreachable double-catch) / 2 LOW
- **B-039** (dropped): 0 CRITICAL / 0 HIGH / 2 MEDIUM (coverage map gap, fragile comment-strip filter) / 1 LOW. R4 was clean on the dropped item; the drop was product-driven, not quality-driven.
- **UAT layer**: 5 issues caught pre-merge in B-036 batch 1; all resolved. 1 product-discovery issue led to B-039 drop. UAT effectiveness HIGH for the 7th consecutive sprint.
- **Security posture**: 1 additive message type (`MSG_OPEN_STANDALONE`, fire-and-forget, no payload). Zero new permissions. Zero CSP changes. Zero new partitions. XSS posture clean across all 4 shipped items.
- **Full dedup**: per-item findings deferred (no consolidated `docs/findings/sprint-29.md` due to fix-agent batches; advisory only)

**Key lessons**: 
- **Lesson 1**: MV3 constraints have product implications, not just technical ones. R2 architecture review must enumerate "what does OFF actually deliver?" for any feature whose value depends on enable/disable parity with browser-native behavior.
- **Lesson 2**: Test-first culture combined with naming-drift audits caught two latent silent-bug risks (B-036 newTabEnabled, B-040 autoCollapseSubgroups). Cross-item discipline pays out.
- **Lesson 3**: The cost of dropping a feature mid-sprint is ~half a day. The cost of shipping a misleading feature is unbounded user friction. Encourage drops when discovery shows the product hypothesis is wrong.

---

## Sprint Close

**Status**: CLOSED 2026-04-24. v1.23.0 release pending commit + tag + archive.

### Follow-on for Sprint 30

Per roadmap + S29 retro:
- **B-090** (new, P2/XS) — C-12 checklist add (manifest runtime-mutability)
- **B-037** (P2/M) — Theme selection (≥12 themes; could be paired with B-086 UI/UX pass)
- **B-086** (P3/M) — Sidepanel UI/UX design pass (post-feature-parity, themes-aware)
- **B-088** (not yet filed, P2/S) — Hygiene-pass bundle (now ~25 deferred items across S25-S29)
- **Comprehensive UAT sweep** (long-deferred, S30 candidate)
- **v2 → main merge prep** — feature-parity roadmap is closed; v1.23.0 is the "feature-complete v2" candidate. S30 + S31 should be polish + final validation before the v2 → main merge PR.
