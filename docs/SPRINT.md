# Current Sprint

*Sprint 31 + Sprint 32 — Combined close. Both sprints shipped on branch `feature/sprint-31-themes`, released as v1.26.0 on 2026-04-25.*

Both sprints executed sequentially on the same feature branch. Sprint 31 delivered the theme system anchor (B-037) plus two Fast Track XS items (B-094, B-095). Sprint 32 delivered four Fast Track items (B-088 hygiene, B-096 validator sync, B-097 Settings shortcut, B-098 Tokyo Night slip-in) that closed out carry-forward debt and extended the theme catalog. Combined release skipped v1.25.0 per product-owner direction.

---

## Sprint 31 Close

### Gate 6 — Sprint 31 Readiness (verified 2026-04-25)

| # | Check | Status |
|---|-------|--------|
| 1 | All sprint items passed Definition of Ready | ✅ |
| 2 | Total sprint effort fits the sprint duration | ✅ — 1 M + 2 XS |
| 3 | No unresolved blockers from prior sprint | ✅ — S30 closed clean |
| 4 | `SPRINT.md` "Active Items" populated | ✅ |
| 5 | `BACKLOG.md` items → `in-progress` as work began | ✅ |
| 6 | Deps-resolved check | ✅ — B-037 deps B-001 ✅, B-091 ✅; B-094/B-095 deps met |

### Sprint 31 Completed Items

#### [B-037] Theme Selection — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R2 ✅ (§45 design chapter) · R3 ✅ · R4 ✅ (0 CRITICAL / 4 HIGH all fixed) · R5 ✅ (30/30 UAT PASS after UAT-6 fix cycle) · R6 ✅ (§45.10 As Built filled) · R7 ✅
- **Files changed**: `shared/themes.css` (new, ~3,500 LOC canonical palette), `shared/theme-init.js` (new, consolidated FOUC-guard), `shared/theme-slugs.js` (new), `shared/surface-prefs.js` (new), `shared/settings-tab.js` (new), `settings/settings.{html,js,css}` (Theme section wired), `sidepanel/sidepanel.{html,js}` (theme-init import + theme-aware CSS tokens), `newtab/newtab.{html,js}` (same), `popup/popup.{html,js}` (theme wired — HIGH-1 fix), `popup/group-jump.{html,js}` (theme wired — UAT-6 fix), `docs/design/45-b-037-themes.md` (new, §45.1–§45.10), `tests/b037-themes.test.js` (new, 41 tests)
- **B-098 additive**: `shared/themes.css` + `settings/settings.js` + `shared/theme-slugs.js` extended with `'tokyo-night'` as 14th slug

#### [B-094] Process Polish Bundle — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings — doc-only)
- **Files changed**: `CLAUDE.md` (C-1 stale-SW release-note guidance sentence + R1 selector-audit subsection)
- **Outcome**: Sprint 30 retro MEDIUM action items × 2 closed

#### [B-095] Toolbar Popup → Settings Link — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 HIGH, 2 MEDIUM inline)
- **Files changed**: `popup/popup.{html,js,css}` (Settings button in footer), `shared/settings-tab.js` (factor-out reused), `tests/b095-popup-settings-btn.test.js` (new, 7 tests)

### Sprint 31 Gate 4 — Release Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved (no open CRITICAL/HIGH) | ✅ — 4 HIGH fixed (B-037); 0 HIGH on B-094/B-095 |
| 2 | All R5 automated tests passing | ✅ |
| 3 | UAT sign-off recorded for every item | ✅ — B-037 30/30 PASS; B-094 N/A (doc); B-095 smoke PASS |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/45-b-037-themes.md` chapter created; §45.10 As Built filled | ✅ |
| 6 | `manifest.json` permissions reviewed — no unnecessary additions | ✅ — zero new permissions |
| 7 | `./build.sh` produces clean package | ✅ |
| 8 | Rollback plan documented | ✅ — §45.8 + §45.10 D-7 |
| 9 | README/STORE_LISTING updated | ✅ |
| 10 | `BACKLOG.md` items set to `done` | ✅ — B-037, B-094, B-095 |
| 11 | `BACKLOG_BOARD.md` updated | ✅ |
| 12 | `SPRINT_ARCHIVE.md` entry appended | ✅ |

### Sprint 31 Gate 7 — Retrospective

#### Velocity
- Planned: 3 items / 1M + 2XS
- Completed: 3 items / 1M + 2XS — 100% scope
- B-098 Tokyo Night added mid-sprint as approved slip-in (additive, no scope impact)
- Carried over: 0 items

#### What Went Well
- Full 7-round pipeline on B-037 (M anchor) executed cleanly; R2 chapter locked the design before R3, preventing mid-build rework.
- `shared/themes.css` consolidation delivered the expected ~3,500 LOC reduction in CSS duplication without per-surface regressions.
- UAT-6 (group-jump popup theme miss) caught by in-browser testing before release — validates the pop-up-surface audit precedent now documented in §45.10.

#### What to Improve
- R3 missed the group-jump popup surface in the theme-wiring sweep; required a post-R4 UAT-6 fix cycle. Mitigation documented as the "popup-surface theme audit" precedent in §45.10.
- B-098 was approved mid-sprint but could have been filed earlier alongside B-037 R1 to appear in the initial catalog planning.

#### Action Items for Sprint 32
- [x] B-096 — sync `validatePreferences` import-validator with 13→14 slug enum (S30 security MEDIUM from B-092, now also covers B-037 slugs)
- [x] B-097 — Settings keyboard shortcut Alt+Comma (S30 LOW deferred; C-1 stale-SW guidance now in CLAUDE.md)
- [x] B-088 — Hygiene bundle (carry-forward debt from S25-S31)

### Sprint 31 R4 Findings Summary

- **B-037**: 0 CRITICAL / 4 HIGH (all fixed: popup theme wiring H-1, var() fallback H-2, fresh-install test gap H-3, pref-read-failure test gap H-4) / ~6 MEDIUM (most fixed inline) / ~8 LOW (deferred)
- **B-094**: 0 findings (doc-only)
- **B-095**: 0 CRITICAL / 0 HIGH / 2 MEDIUM (both fixed inline) / 0 LOW
- **Total**: 0 CRITICAL / 4 HIGH / ~8 MEDIUM / ~8 LOW
- **Full dedup**: `docs/findings/sprint-31.md`

---

## Sprint 32 Close

### Gate 6 — Sprint 32 Readiness (verified 2026-04-25)

| # | Check | Status |
|---|-------|--------|
| 1 | All sprint items passed Definition of Ready | ✅ |
| 2 | Total sprint effort fits the sprint duration | ✅ — 1 S + 3 XS |
| 3 | No unresolved blockers from S31 | ✅ |
| 4 | `SPRINT.md` "Active Items" populated | ✅ |
| 5 | `BACKLOG.md` items → `in-progress` as work began | ✅ |
| 6 | Deps-resolved check | ✅ — B-096 deps B-037 ✅, B-045 ✅; B-097 deps B-091 ✅; B-088 no new deps |

### Sprint 32 Completed Items

#### [B-088] Hygiene Bundle — ✅ DONE
- **Tier**: Fast Track (S) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ (8 targeted fixes) · R4 ✅ (R4 PROCEED — 0 HIGH)
- **8 fixes shipped**:
  1. Cross-surface helper factor-out (`shared/surface-prefs.js`, `shared/settings-tab.js` extracted — consumed by B-037 + B-095)
  2. `newTabOverride` ghost-key removed from `DEFAULT_PREFERENCES` + validators (B-039 drop S29 residue)
  3. `DRAG_DEBUG` constant + debug logging removed from drag subsystem
  4. Dead code removal: `_tabById` helper (unused since B-001c refactor)
  5. `_pickerRowFromGroup` O(n²) → O(n+m) perf fix (pre-computed lookup map)
  6. Banner text-node 3-path collapse → single `textContent` assignment
  7. Nested-catch simplification (double try/catch → single catch with typed branch)
  8. JSDoc/comment drift pass across `background/` + `shared/` modules
- **Files changed**: `background/service-worker.js`, `background/storage/preferences.js`, `background/tabs/tab-claims.js`, `shared/surface-prefs.js`, `shared/settings-tab.js`, `sidepanel/sidepanel.js`, `tests/b088-hygiene.test.js` (new, +4 perf regression tests)

#### [B-096] Import Validator Sync — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (R4 PROCEED — 0 HIGH)
- **Files changed**: `background/import/json-validator.js` (theme enum extended to 14 slugs), `tests/b096-import-validator.test.js` (new, +10 tests)
- **Outcome**: Closes S30 B-092 security MEDIUM — JSON import was silently rejecting valid B-037 theme slugs via fail-closed validator

#### [B-097] Settings Keyboard Shortcut Alt+Comma — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (R4 PROCEED — 0 HIGH)
- **Files changed**: `manifest.json` (`open-junkie-settings` command + `Alt+Comma` default key — already present from S30 deferred work), `background/service-worker.js` (`chrome.commands.onCommand` handler for `open-junkie-settings`), `shared/settings-tab.js` (reused focus-or-create helper), `docs/user-manual/keyboard-shortcuts.md` (Alt+Comma entry verified present), `tests/b097-settings-shortcut.test.js` (new, +18 tests)

#### [B-098] Tokyo Night Theme — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-25 · *Slip-in approved mid-S31; closed in S32 accounting*
- **Pipeline**: R1 ✅ · R3 ✅ · R4 ✅ (0 findings — additive palette)
- **Files changed**: `shared/themes.css` (+`[data-theme="tokyo-night"]` block), `shared/theme-slugs.js` (+`'tokyo-night'`), `settings/settings.js` (+option in theme `<select>`)

### Sprint 32 Gate 4 — Release Checklist

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved (no open CRITICAL/HIGH) | ✅ — 0 HIGH across all 4 items |
| 2 | All R5 automated tests passing | ✅ — 1,401 total (up from 1,295; +106 net S31+S32) |
| 3 | UAT sign-off recorded for every item | ✅ — B-088/B-096/B-097/B-098 smoke PASS |
| 4 | No open blockers | ✅ |
| 5 | Design chapter coverage | ✅ — §45 covers B-037+B-098; Fast Track items need no new chapter |
| 6 | `manifest.json` permissions reviewed | ✅ — zero new permissions; `open-junkie-settings` command uses existing `commands` API |
| 7 | `./build.sh` produces clean package | ✅ |
| 8 | Rollback plan documented | ✅ — B-088 `newTabOverride` removal: backups strip ghost-key on import; B-097 shortcut: unregister by removing `open-junkie-settings` from manifest and toggling extension |
| 9 | README/STORE_LISTING updated | ✅ |
| 10 | `BACKLOG.md` items set to `done` | ✅ — B-088, B-096, B-097, B-098 |
| 11 | `BACKLOG_BOARD.md` updated | ✅ |
| 12 | `SPRINT_ARCHIVE.md` entry appended | ✅ |

### Sprint 32 Gate 7 — Retrospective

#### Velocity
- Planned: 3 items / 1S + 2XS
- Completed: 4 items / 1S + 3XS — B-098 Tokyo Night slip-in absorbed without scope impact
- Carried over: 0 items

#### What Went Well
- All 4 items shipped as Fast Track with 0 HIGH findings — cleanest R4 block since Sprint 25.
- B-088 hygiene bundle pattern (8 independent fixes bundled into one Fast Track S) continues to be efficient for carry-forward debt that doesn't justify individual sprint items.
- B-096 closed the S30 B-092 security MEDIUM that would otherwise have silently rejected valid theme slugs on import — catching it in S32 before v1.26.0 shipped was correct timing.

#### What to Improve
- B-098 Tokyo Night could have been scoped during S31 R1 alongside the initial theme catalog to avoid the mid-sprint approval interruption.
- S32 had no R5 [test-engineer] formal test pass beyond the automated suite — all items were Fast Track, but a brief UAT sweep of the combined S31+S32 theme system would have been cleaner procedurally.

#### Action Items for Next Sprint
- [ ] [scrum-master] Evaluate v2 → main merge readiness: S32 closes the last outstanding carry-forward debt queue. Feature set is complete. Recommend scheduling a dedicated merge-prep sprint or merge directly if UAT sweep is satisfactory. [HIGH]
- [ ] [scrum-master] File B-086 (UI/UX design pass, P3/M) for post-merge consideration if v2 ships to main. [LOW]
- [ ] [technical-writer] Review `docs/user-manual/` for coverage gaps now that the full v2 feature set is shipped (themes, keyboard shortcuts, Settings page, all surfaces). [MEDIUM]

### Sprint 32 R4 Findings Summary

- **B-088**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW (hygiene pass — no review flags)
- **B-096**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **B-097**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW
- **B-098**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW (additive palette — no new logic)
- **Total S32**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW — clean sprint
- **Full dedup**: `docs/findings/sprint-32.md`

---

## Combined Release Summary

**Release**: v1.26.0 · **Branch**: `feature/sprint-31-themes` · **Date**: 2026-04-25
**Test count**: 1,295 → 1,401 (+106 net across S31+S32)
**Items delivered**: 7 (B-037 Full M + B-094 XS + B-095 XS + B-088 S + B-096 XS + B-097 XS + B-098 XS)
**Highlights**: 14-theme system shipped and integrated across all surfaces; Settings keyboard shortcut (Alt+Comma); popup Settings link; hygiene debt queue closed; import validator synced.

---

## Blockers

*None.*
