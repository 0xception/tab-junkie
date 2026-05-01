# Current Sprint

**Sprint 42 — Chrome tab group sync (kicked off 2026-05-01)**

Single-anchor sprint: 1 P2 anchor (B-041 snapshot push to Chrome tab strip + tab groups). Closes the last big v2 feature placeholder (B-041 has been on the backlog since pre-S33).

- **Branch**: `feature/sprint-42-chrome-sync` off `release/v2` (post-S41 close at `714dec0` · post-spec/plan commits at `e15e8e1` + `ac107a2`)
- **Target version**: v1.36.0 (release/v2 only — no main merge per established pattern)
- **Test baseline at kickoff**: 1,826 / 1,826 PASS
- **Anchor**: B-041 (P2/M Full Tier 2 · spec narrows pre-S33 backlog scope to snapshot-only, current-window-only, top-level groups; deferred items enumerated below)
- **Pipeline**: full R1 → R7 (no Spike-First; R0 not required — single 30-second SW-REPL probe at R2 covers `chrome.tabs.move` array-atomicity per C-8)
- **Spec**: `docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md` (commit `e15e8e1`)
- **Implementation plan**: `docs/superpowers/plans/2026-05-01-chrome-tab-group-sync.md` (15 tasks, ~70 TDD steps, +38 tests target; commit `ac107a2`)

---

## Active Items

### [B-041] Snapshot push: TJ → Chrome tab strip + tab groups
- **Tier**: Full (M)
- **Status**: ✅ requirements → ✅ architecture → ✅ build → ✅ code-review → ✅ security-review → ✅ qa-review (R4 fix-round complete 2026-05-01) → test-engineer → close → post-close
- **Assigned To**: [test-engineer] (R5)
- **Blockers**: none
- **Feature Context**:
  - One user action — Settings page → Chrome Integration → "Sync this window to Chrome" — pushes TJ's view of the current window onto Chrome's tab strip + tab groups.
  - TJ groups become Chrome tab groups (title from TJ group name; color via static palette mapping in `background/sync/color-map.js`).
  - Tabs reordered in the strip to match TJ order (groups first, then ungrouped Open Tabs).
  - Stateful `chromeTabGroupId` mapping persisted on the TJ group record; re-sync updates in place; stale mappings (Chrome group manually deleted) are detected and replaced.
  - Push-only, snapshot-only, current-window-only this sprint. Auto-sync (continuous mirror), Chrome → TJ pull, multi-window sync, sub-group flattening, "open all unclaimed bookmarks" all explicitly deferred (see spec §10).
- **Brainstorm decision log** (Q1–Q9 + reframe locked 2026-05-01):
  - Q1 push-only · Q2 snapshot trigger · Q3 current-window only, live tabs only · Q4 stateful update-in-place · Q5 match TJ order · Q6 static color map · Q7' Settings page only (no main-panel UI) · Q8 settings-tab window · Q9 best-effort summary toast · Reframe full-strip (groups + ungrouped Open Tabs).
- **Handoff Notes** (for [product-manager]):
  - Spec §11 contains an AC preview (10 numbered ACs). Re-author into a SPRINT.md acceptance-criteria block following the established R1 format with AC1..AC10 + DoR item-7 destructive-action note (N/A per spec — sync is reversible) + selector-audit note (N/A — no DOM rehome) + source-citation gate (cite `manifest.json:6`, `background/storage/migration.js:89`, `tests/chrome-mock.js`).
  - The original B-041 BACKLOG row carries a "confirmation dialog before execution" clause that conflicts with the spec's N/A destructive-action stance (sync is reversible — no data destruction). PM reconciles: drop the confirmation clause; narrow the row to top-level groups + current-window-only.
- **Files Changed** (R3 + R4 fix-round actual — 1889/1889 PASS, +63 tests over 1826 baseline):
  - Create (source): `background/sync/chrome-sync.js`, `background/sync/color-map.js`, `settings/settings-chrome-sync.js`, `settings/settings-toast-timer.js` *(R4 H-2)*
  - Modify (source): `shared/messages.js`, `background/storage/migration.js`, `background/storage/shapes.js`, `background/storage/groups.js`, `background/messages/storage-handlers.js`, `background/tabs/tab-events.js`, `settings/settings.html`, `settings/settings.js`, `settings/settings.css`, `settings/settings-import-export.js` *(R4 H-2)*, `manifest.json` (1.35.0 → 1.36.0)
  - Create (tests, 10 new files / +63 tests): `tests/sync-message-constant.test.js`, `tests/sync-schema-v5.test.js`, `tests/sync-color-map.test.js`, `tests/sync-chrome-mock-extensions.test.js`, `tests/sync-target-order.test.js`, `tests/sync-build-summary.test.js`, `tests/sync-chrome-sync.test.js`, `tests/sync-handler.test.js`, `tests/sync-classify-error.test.js` *(R4 M-1/M-4)*, `tests/sync-settings-toast.test.js` *(R4 H-1 code/M-2/H-1 qa)*, `tests/sync-toast-timer-shared.test.js` *(R4 H-2 code)*
  - Modify (tests — fix-scope updates per R2 §67.7 + B-091 AC3/AC4 contract bumps + R4 mock realignment): `tests/chrome-mock.js`, `tests/migration-fresh-install.test.js`, `tests/migration-steps.test.js`, `tests/b091-settings-page.test.js`
  - Docs: `docs/UAT_B-041.md` (new), `CHANGELOG.md`, `docs/RELEASES.md`, `docs/BACKLOG.md` (B-041 → done), `docs/BACKLOG_BOARD.md` (✅ + dashboard update)
- **Parallel Opportunity**: R4 reviewers run in parallel after R3 build. No cross-item parallelization (single-anchor sprint).

---

## Completed This Sprint

_(none yet)_

---

## Gate 6 — Sprint Readiness Verification

- ✅ User story written by [product-manager] — _to be locked at R1_
- ✅ ACs defined — _to be locked at R1; spec §11 preview already drafted_
- ✅ Priority + effort assigned — P2 / M (narrowed from L per spec scope reduction)
- ✅ Dependencies — none (B-041 has no blocking deps; the original `B-006, B-014` deps in BACKLOG.md are both `done`)
- ✅ Total sprint effort fits — single M item (~4 effort units). Comparable to S38 (6) / S39 (7) / S40 (7-8) / S41 (7).
- ✅ R2 architecture review — _to run at R2 dispatch_
- ✅ Performance ACs — sync of 50 tabs across 5 groups < 1s rough budget (spec §8.3)
- ✅ Destructive-action confirmation — N/A explicitly per spec §11 (sync is reversible)
- ✅ No unresolved blockers from S41 (closed at `714dec0` · v1.35.0 tagged + pushed)
- ✅ Branch created — `feature/sprint-42-chrome-sync` off `release/v2`
- ✅ Findings file scaffold — `docs/findings/sprint-42.md` to be pre-created at R4 dispatch (S39 retro toolchain hygiene action)

**Gate 6 status**: PASS (one-anchor sprint with comprehensive pre-pipeline spec + plan; remaining R1/R2 items lock during dispatch).

---

## Carried over from S41

_None._

S41 left B-138 (post-B-137 cleanup, XS) DEFERRED — explicitly not part of S42 scope; remains backlog for a future sprint when the v3 floating-group cohort is confirmed empty.

---

## Pipeline State

| Round | Agent | Status | Notes |
|-------|-------|--------|-------|
| R1 | [product-manager] | ✅ DONE 2026-05-01 | 10 ACs locked in BACKLOG.md row; DoR-7 N/A; selector-audit N/A; source-citation gate cited 8 file:line references |
| R2 | [solution-architect] | ✅ DONE 2026-05-01 | `docs/design/67-b-041-chrome-tab-group-sync.md` written (~280 lines, 11 sections + As-Built placeholder for R6); 14 R2 checklist items closed (C-1a, C-1b, C-2, C-7, C-8, C-13 all PASS; C-10 / C-11 / C-12 / C-14 N/A); 7 R2 risks resolved; `chrome.tabs.move` array form confirmed via MDN docs; SOLUTION_DESIGN.md TOC extended |
| R3 | [frontend-engineer] | ✅ DONE 2026-05-01 | Executed plan tasks 1–15 across 14 commits. Final test count: 1864/1864 PASS (+38 over 1826 baseline). Zero escalations; one fix-scope test-assertion update (B-091 AC3/AC4 — fieldset count + section order, not enumerated in R2 §67.7). Schema bump v4→v5 wired (KNOWN_VERSION + defaultShape + new MIGRATION_STEPS entry); validator + updateGroup allow-list extended; chrome-mock extended with tabGroups + multi-tab move; orchestrator + state collector + group resolver + applier + isSyncInFlight flag wired; SW handler + WRITE_MESSAGE_TYPES registered; Settings page fieldset + JS module + CSS variants in place; manifest version bumped 1.35.0 → 1.36.0; CHANGELOG + RELEASES populated; UAT_B-041.md drafted with 15 cases. |
| R4 | [code-reviewer] + [security-reviewer] + [qa-reviewer] | ✅ DONE 2026-05-01 — ✅ fix-round complete 2026-05-01 | 0 CRIT · 4 HIGH · ~9 MED · ~9 LOW (deduped). HIGHs: H-1 code (AC8 View-details expander missing), H-2 code (ghost timer race shared `#settings-toast`), H-1 qa (no aria-busy / in-progress feedback), H-2 qa + code M-3 converged (Spec §8.2 tab-gone integration test missing). Plus 2 converged MEDs rolled into fix-round (security M-1 / code M-4 _classifyError locale fragility · qa M-2 WCAG 1.4.1 toast variant by-color-alone). Findings → `docs/findings/sprint-42.md`.<br><br>**Fix-round (6 commits, +25 tests, 1864→1889 PASS):**<br>1. `67c2a9b` — M-1/M-4 `_classifyError` covers real Chrome error strings (+11 tests)<br>2. `aa1b855` — H-2 qa / M-3 code "tab gone mid-sync" integration test (+1 test)<br>3. `eeb6a7a` — H-1 code AC8 "View details" expander (+3 tests)<br>4. `0040ff0` — M-2 qa WCAG 1.4.1 non-color glyph prefix on toast variants (+3 tests)<br>5. `d3ed7d9` — H-1 qa aria-busy + "Syncing…" button-text (+2 tests)<br>6. `087f313` — H-2 code shared toast-timer fixes ghost-timer race (+5 tests) |
| R5 | [test-engineer] | pending | +38 automated tests + UAT_B-041.md walkthrough in Edge |
| R6 | [solution-architect] | pending | §67 As-Built |
| R7 | [technical-writer] | pending | CHANGELOG + user-manual entry |
| Close | [release-manager] | pending | v1.36.0 tag on release/v2 (skip `gh release create` per pattern) |
