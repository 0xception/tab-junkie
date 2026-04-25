# Current Sprint

*Sprint 30 closed 2026-04-24 with v1.24.0.*

Sprint 30 delivered the Settings page redesign — the biggest user-facing surface change since the new tab page in Sprint 29. B-091 (Spike-First L) replaced the B-089 compact modal with a dedicated full-page Settings tab, and Wave 1 consumers B-092 (compact layout toggle) and B-093 (import/export rehome) plugged into the new surface cleanly. B-090 completed the Sprint 29 retro HIGH action, adding C-12 to the R2 Correctness Checklist. All 4 items shipped; 0 deferrals; 0 regressions. Test count grew from 1,295 to 1,331 (+36 net). One production-surface gotcha discovered during UAT (stale-SW module-cache behavior on new pref keys) was documented in §44.10.4, the CHANGELOG, and the Settings user manual as a release note.

---

## Completed This Sprint

### [B-090] C-12 Manifest Runtime-Mutability Checklist Add — ✅ DONE
- **Tier**: Fast Track (XS)
- **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (code PROCEED + security PROCEED; 0 CRITICAL/HIGH)
- **Files changed**: `CLAUDE.md` (+1 row C-12 in R2 Correctness Checklist table)
- **Outcome**: C-12 "Manifest declarations runtime-mutability" added to the R2 checklist. Verdict for items that add zero manifest declarations: N/A. Verdict for items that declare new `chrome_url_overrides` or `commands`: MUST enumerate available OFF behaviors and confirm with product-owner before R3. References B-039 as blocking precedent.
- **R4 findings**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW (doc-only change; security review PASS)
- **UAT**: N/A (doc-only; no code path)

### [B-091] Settings Page Redesign — ✅ DONE
- **Tier**: Spike-First (L)
- **Closed**: 2026-04-24
- **Pipeline**: R0 spike ✅ · R1 ✅ (15 ACs) · R2 ✅ (§44 design chapter, 10 D-decisions) · R3 ✅ (~700 net LOC; 5 new files, 4 modified, 2 deleted) · R4 ✅ (0 CRITICAL / 6 HIGH fixed / MEDIUM+LOW resolved or deferred) · R5 ✅ (24 tests PASS; UAT PASS) · R6 ✅ (§44.10 As Built filled) · R7 ✅ (user manual + CHANGELOG + STORE_LISTING updated)
- **Files changed**:
  - **Created**: `settings/settings.html`, `settings/settings.js`, `settings/settings.css`, `settings/settings-fields.js`, `settings/theme-init.js`, `tests/b091-settings-page.test.js`, `docs/design/44-b-091-settings-page.md`
  - **Modified**: `sidepanel/sidepanel.html`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`
  - **Deleted**: `sidepanel/settings-dialog.js`, `tests/b089-settings-dialog.test.js`
- **Outcome**: Gear button in side panel header opens a full-page Settings tab (focus-existing-else-create dispatcher per D-2). Hosts Display mode (B-038), Sub-group auto-collapse (B-040), and Wave 1 slots for B-092 and B-093. Theme section ships as a placeholder for S31 B-037. Zero new manifest permissions; zero storage schema changes. B-089 modal deleted atomically in the same R3 commit.
- **R4 findings**: 0 CRITICAL / 6 HIGH fixed (controls disabled during pref load; double-write to banner; ARIA `role="alert"` + `aria-live` contradiction; 3 security checks PASS) / MEDIUM+LOW resolved or deferred
- **UAT**: PASS — stale-SW gotcha documented (new pref keys require extension toggle after update)

### [B-092] Dense / Compact Layout Toggle — ✅ DONE
- **Tier**: Fast Track (XS)
- **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ (~80 LOC; 24 tests) · R4 ✅ (code PROCEED + security PROCEED; 0 CRITICAL/HIGH)
- **Files changed**: `settings/settings.js` (+`renderToggle` call for `denseLayout`), `sidepanel/sidepanel.css` (+`.tj-dense` class rules), `newtab/newtab.css` (+`.tj-dense` class rules), `background/storage/preferences.js` (+`denseLayout` default key), `tests/b092-dense-layout.test.js` (new, 24 tests)
- **Outcome**: Settings → Layout → Compact layout toggle. When ON, `document.body.classList` flips to `.tj-dense` — single-line rows, smaller fonts, tighter padding. Pure CSS behavior; no per-row JS. Default OFF. Pref key `denseLayout` added to `DEFAULT_PREFERENCES`.
- **R4 findings**: 0 CRITICAL / 0 HIGH / 1 MEDIUM (CSS specificity — resolved inline) / 1 LOW
- **UAT**: PASS

### [B-093] Import/Export Controls Rehome — ✅ DONE
- **Tier**: Fast Track (S)
- **Closed**: 2026-04-24
- **Pipeline**: R1 ✅ · R3 ✅ (~120 LOC net; 11 tests) · R4 ✅ (code PROCEED + security PROCEED; 0 CRITICAL/HIGH)
- **Files changed**: `sidepanel/sidepanel.html` (removed header import/export buttons), `sidepanel/sidepanel.js` (removed header button wiring), `settings/settings.js` (+Data section import/export wiring), `settings/settings.html` (+Data section DOM), `tests/b093-import-export-rehome.test.js` (new, 11 tests), updated selector references in existing import/export test files
- **Outcome**: Import HTML, Import JSON, Export HTML, Export JSON controls moved from the side panel header to Settings → Data. All B-042/B-043/B-044/B-045 functionality unchanged, including the replace-all confirmation dialog. Side panel header now contains only New Group and Settings (gear) buttons.
- **R4 findings**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (DOM ID selector updates in existing tests; selector hygiene) / 1 LOW
- **UAT**: PASS

---

## Gate 4 — Release Checklist (verified 2026-04-24)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved (no open CRITICAL/HIGH) | ✅ — 0 CRITICAL; 6 HIGH on B-091 all fixed pre-R5; 0 HIGH on B-090/B-092/B-093 |
| 2 | All R5 automated tests passing | ✅ — 1,331 tests pass; 0 failures |
| 3 | UAT sign-off recorded for every item | ✅ — B-091 UAT PASS; B-092 UAT PASS; B-093 UAT PASS; B-090 UAT N/A (doc-only) |
| 4 | No open blockers in `SPRINT.md` | ✅ — None |
| 5 | Relevant `docs/design/NN-*.md` chapter updated by [solution-architect] | ✅ — §44.10 As Built filled in `docs/design/44-b-091-settings-page.md`; B-090 is CLAUDE.md doc-only (no design chapter required) |
| 6 | `manifest.json` permissions reviewed — no unnecessary additions | ✅ — Zero new permissions; `manifest.json` diff: version bump only (1.23.0 → 1.24.0) |
| 7 | `./build.sh` produces a clean package with no errors | ✅ — clean zip produced |
| 8 | Rollback plan documented for any storage schema changes | ✅ — B-091: `git revert <merge-sha>`; zero storage migration (documented in §44.10 + D-7). B-092 adds `denseLayout` to `DEFAULT_PREFERENCES`; rollback: `git revert`; no migration needed (key absent from storage is treated as `false` via `DEFAULT_PREFERENCES` merge) |
| 9 | README/STORE_LISTING updated for user-facing features | ✅ — `STORE_LISTING.md` updated; `docs/user-manual/settings.md` created; `keyboard-shortcuts.md` updated; `CHANGELOG.md` entry added |
| 10 | `BACKLOG.md` updated — all completed items set to `done` | ✅ — B-090, B-091, B-092, B-093 → `done` |
| 11 | `BACKLOG_BOARD.md` updated — progress dashboard and status summary accurate | ✅ — all 4 items ✅; progress dashboard recalculated |
| 12 | `SPRINT.md` "Completed This Sprint" section reflects all finished items | ✅ — this document |
| 13 | `SPRINT_ARCHIVE.md` updated — Sprint 30 appended | ✅ — appended at sprint close |

---

## Sprint Retrospective — Sprint 30

### Velocity
- Planned: 4 items — 1 Spike-First (L) + 1 Fast Track (S) + 2 Fast Track (XS)
- Completed: 4 items / all effort levels delivered
- Carried over: 0
- Test growth: 1,295 → 1,331 (+36 net)
- Release: v1.24.0
- **8 consecutive sprints shipped without rollback or post-merge regression** (S23 → S30)

### What Went Well
- Wave architecture (Wave 0 anchor → Wave 1 consumers) worked cleanly: B-091 landed in R3 before B-092 and B-093 started build, and both Wave 1 items plugged into the Settings surface without merge conflicts or rework.
- Zero regressions across the entire test suite. The forked-helpers pattern (B-091 D-8) kept the `settings-fields.js` module independently testable and produced 24 clean tests on the first R5 run.
- The B-090 C-12 checklist addition was the fastest item in the sprint — doc-only, zero review findings, closed in R1→R3→R4 in a single agent pass. Process hygiene items like this pay forward immediately (B-091 C-12 was N/A, confirmed cleanly, zero discussion needed).
- The tab-dispatcher pattern (B-035 D-3(c) precedent, re-applied in sidepanel-context for B-091 D-2) required no deliberation — existing precedent directly answered the design question. Precedent documentation is working.

### What to Improve
- **MEDIUM — Stale-SW module-cache gotcha must be anticipated at R2 for any item that adds new pref keys.** The gotcha (new key in `DEFAULT_PREFERENCES` + validator not visible to a running SW until toggle OFF/ON) was a UAT surprise, not a design-time catch. Going forward, R2 MUST include a note in the C-1 or C-9 checklist row whenever a sprint adds a new pref key: "Requires extension toggle after update; document in release notes." This is a production-environment-only issue that `chrome-mock.js` cannot reproduce — it must be flagged at R2, not discovered at UAT.
- **MEDIUM — Import/export rehome (B-093) changed existing test selector IDs, requiring updates across more test files than anticipated.** The scope of selector-reference updates was underestimated in R1. For future rehome items, R1 ACs should include an explicit "selector audit" step: identify every test file that references the moved element's IDs and list them in the AC block so R3 has a complete checklist.
- **LOW — Settings page has no keyboard shortcut path.** Two sprints in a row (S29 B-089 and S30 B-091) shipped Settings without a keyboard shortcut because `commands` manifest additions require C-6 + C-12 audit overhead. If the user frequently accesses Settings, this will become a friction point. Candidate for S31+ polish (B-082 toolbar popup Settings entry is a lower-friction alternative that does not require a new manifest entry).

### Action Items for Sprint 31
- [ ] [solution-architect] Add "new-pref-key stale-SW release note" subsection to the R2 C-1 checklist item in CLAUDE.md. Template: if a sprint adds a new key to `DEFAULT_PREFERENCES`, R2 MUST note "toggle required after update; add to release notes." [MEDIUM — from stale-SW gotcha]
- [ ] [product-manager] R1 AC template addition — for any rehome item, include a "selector audit" step listing existing test files that reference moved element IDs. [MEDIUM — from B-093 underestimate]
- [ ] [scrum-master] Evaluate B-037 (themes) for S31 anchor. B-091 Settings page ships the Theme placeholder section; B-037 is the natural next wave anchor. Confirm effort and dependency readiness before S31 kickoff. [HIGH — S31 scope decision]

---

## R4 Findings Summary

- **B-090**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW (doc-only; [security-reviewer] PROCEED)
- **B-091**: 0 CRITICAL / 6 HIGH fixed (controls disabled during load; double banner write; ARIA contradiction; 3 security-reviewer PASS checks) / multiple MEDIUM (most inline) / LOW deferred
- **B-092**: 0 CRITICAL / 0 HIGH / 1 MEDIUM resolved inline / 1 LOW
- **B-093**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (selector updates) / 1 LOW
- **Total**: 0 CRITICAL / 6 HIGH (all fixed pre-R5) / ~6 MEDIUM (most resolved) / ~3 LOW deferred
- **Security posture**: Zero new permissions. Zero new manifest declarations. Zero new message types. All rendered text via `textContent`. Sender-id validation in broadcast listener confirmed by [security-reviewer] R4.

---

## Sprint Close

Sprint 30 closed 2026-04-24 with v1.24.0 on branch `feature/sprint-30-settings-redesign` → `release/v2`.

**Sprint 31 candidates (from S30 retro + backlog):**
- **B-037** — Theme picker (S31 anchor; B-091 Settings page ships the placeholder slot; natural next wave anchor)
- **B-082** — Toolbar popup Settings entry (lower-friction alternative to keyboard shortcut; no manifest entry needed)
- **B-086** — UI/UX polish pass (P3/M; accumulated hygiene)
- **B-088** — Hygiene bundle (P3/S)
