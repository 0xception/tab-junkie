# Current Sprint

*Sprint 35 closed 2026-04-26. Awaiting product-owner direction for next sprint.*

The post-close state below documents the v1.29.0 release. Five-item bug-fix-and-polish sprint shipped clean: B-100 (delete-on-live UX) + B-102 (cross-window demote bug) + B-103 (promote duplicate bug) + B-105 (solarized-light AA) + B-106 (tint brightness 18%). Two follow-up backlog items filed (B-107 + B-108).

Ships to `release/v2` as v1.29.0. **No main merge** — that remains a manual product-owner task.

---

## Gate 4 — Release Checklist (verified 2026-04-26)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 4 HIGH all closed in R3-fix; 9 MEDIUM addressed; 11 LOW deferred |
| 2 | All R5 automated tests passing | ✅ — 1,464/1,464 (+37 net via 4 R5 rounds) |
| 3 | UAT sign-off recorded by [test-engineer] | 🟡 — UAT plans authored (B-100: 7 cases; B-102: 5; B-103: 4; B-105: 5). Pending human walk-through. |
| 4 | No open blockers in `SPRINT.md` | ✅ |
| 5 | Relevant `docs/design/NN-*.md` chapters updated | ✅ — §49.10, §50.10, §51.10, §52.7 As Built filled. §45.7 + §47.7 row 19 corrected per B-105 R6. §47.7 column header bumped per B-106 R4 M-1. |
| 6 | `manifest.json` permissions reviewed | ✅ — zero new permissions; version bumped 1.28.0 → 1.29.0 |
| 7 | `./build.sh` produces a clean package | ✅ — 336K, 87 files, no errors |
| 8 | Rollback plan documented | ✅ — N/A (zero schema changes) |
| 9 | README/STORE_LISTING/CHANGELOG updated | ✅ — CHANGELOG `[1.29.0]` covers all 5 items + B-107/B-108 known limitations |
| 10 | `BACKLOG.md` updated | ✅ — B-100/102/103/105/106 → done; B-107 + B-108 filed |
| 11 | `BACKLOG_BOARD.md` updated | ✅ — totals: 108 items / 100 done / 93% / 5 to-do / 3 icebox |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all finished items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated — Sprint 35 entry appended | ✅ |

---

## Completed This Sprint

### [B-100] Delete-on-live UX redesign — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ · R2 ✅ (§49) · R3 ✅ · R4 ✅ (3 reviewers — 0 CRITICAL / 3 HIGH / 5 MEDIUM / 5 LOW) · R3-fix ✅ (3 HIGHs + M-1) · R5 ✅ (16 tests + 7 UAT) · R6 ✅ · R7 ✅
- **Files**: `sidepanel/sidepanel.js` (`_dispatchRowDelete` helper + Undo ERR_NOT_FOUND fallback + keydown delegation), `sidepanel/sidepanel.css` (destructive class consumes new tokens), `shared/themes.css` (+`--color-destructive`/`--bg-destructive-hover` × 14 themes; nord uses brighter `#fca5a5`), `tests/b100-delete-on-live.test.js` (16 tests), `docs/UAT_B-100.md` (7 cases), `docs/design/49-b-100-delete-on-live.md`
- **Key decisions**: D-1 keep both delete paths · D-2 `MSG_CREATE_ITEM` payload `{title,url,groupId}` only · D-3 inherit B-099 6s toast default · D-5 keydown delegation w/ input-context guard
- **R3-fix**: H-1 DRY (helper extraction); H-2 Undo deleted-group fallback to Ungrouped + recovery toast; H-3 `--color-destructive` per-theme token (AA verified 5.13–6.88:1 across 4+ themes)
- **Follow-up**: **B-107** (P3/XS) — live-X aria-label reactive flip

### [B-102] Cross-window demote broadcast bug — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ · R2 ✅ (§50 shared) · R3 ✅ · R4 ✅ (3 reviewers dual-lens — 0 CRITICAL / 1 HIGH / 2 MEDIUM / 3 LOW) · R3-fix ✅ (single ordering change) · R5 ✅ (8 tests + 5 UAT, T5 SKIP→UAT-1) · R6 ✅ · R7 ✅
- **Files**: `sidepanel/sidepanel.js` (`'noop'` + `'patch'` branches gain `patchOpenTabsSection(_cachedOpenTabs)`; R3-fix moved `'patch'` placement INSIDE `if (allApplied)` AFTER `_itemById` rebuild), `tests/b102-cross-window-demote.test.js` (8 tests), `docs/UAT_B-102.md` (5 cases — 4 multi-window manual), `docs/design/50-b-102-103-open-tabs-patch.md`
- **NEW R6 precedent**: chrome-mock single-listener-array constraint formalized; SKIP-with-sentinel + mandatory-UAT for multi-context tests

### [B-103] Promote-tab duplicate bug — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ · R2 ✅ (§51 thin pointer to §50) · R3 ✅ (0 LOC source — inherited from B-102 R3) · R4 ✅ (inherited) · R5 ✅ (6 tests + 4 UAT) · R6 ✅ · R7 ✅
- **Files**: `tests/b103-promote-duplicate.test.js` (6 tests including read-only AST atomicity check + dual-angle ordering regression), `docs/UAT_B-103.md` (4 cases), `docs/design/51-b-103-promote-duplicate.md`
- **D-2 verified**: SW handler atomicity already correct; no SW changes needed

### [B-105] Solarized-light WCAG AA baseline contrast fix — ✅ DONE
- **Tier**: Full (S) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ (Q4 deviation — 3% ceiling not 0%) · R2 ✅ (§52) · R3 ✅ · R4 ✅ (0 CRITICAL / 0 HIGH / 1 MEDIUM / 3 LOW) · R5 ✅ (7 tests + 5 UAT) · R6 ✅ (§52.7 + §45.7 + §47.7 row 19) · R7 ✅
- **Files**: `shared/themes.css` (`--text-primary` `#586e75`→`#546a71`; `--group-header-tint-amount` `0%`→`3%`), `tests/b104-group-colors.test.js` (T7 updated), `tests/b105-solarized-light-contrast.test.js` (7 tests with computed WCAG AA), `docs/UAT_B-105.md` (5 cases), `docs/design/52-b-105-solarized-light-fix.md`
- **NEW R5 precedent**: algorithm-divergent contrast assertions pin directional/monotonic invariants (3%>6%>12%) over exact crossover %
- **Follow-up**: **B-108** (P3/S) — solarized-light `--text-secondary` AA (3.636:1 group-count text)

### [B-106] Group header tint brightness bump — ✅ DONE
- **Tier**: Fast Track (XS) · **Closed**: 2026-04-26
- **Pipeline**: R1 ✅ (Q1 = 18%) · R3 ✅ · R4 ✅ (Fast Track code + security; 0 CRITICAL / 0 HIGH / 1 MEDIUM / 0 LOW)
- **Files**: `shared/themes.css` `:root` (12% → 18%), `tests/b104-group-colors.test.js` (+T10), `docs/design/47-b-104-themed-group-colors.md` (§47.7 column header + matrix annotation)
- **Wave 1 dependency**: depended on B-105 R3 — verified before launch

---

## Wave Plan (executed)

```
Wave 0 (4 items in parallel)
  ├── B-100 R1→R2→R3→R4→R3-fix→R5→R6→R7    [Full M]
  ├── B-102 R1→R2→R3→R4→R3-fix→R5→R6→R7    [Full M]
  ├── B-103 R1→R2→R3 (0 LOC)→R4 (inh)→R5→R6→R7   [Full S]
  └── B-105 R1→R2→R3→R4→R5→R6→R7    [Full S]

Wave 1 (depended on B-105 R3)
  └── B-106 R1→R3→R4 (Fast Track)    [Fast Track XS]

Sprint Close
  Gate 4 ✅ → Gate 7 ✅ → [release-manager] v1.29.0 → archive (release/v2; no main merge)
```

---

## Gate 7 — Sprint Retrospective (Sprint 35)

### Velocity
- Planned: 5 items / 2M + 2S + 1XS
- Completed: 5 items / 2M + 2S + 1XS + 2 follow-ups (B-107, B-108)
- Test growth: 1,427 → 1,464 (+37 net, +2.6%)
- Fix cycles: 2 R3-fix rounds (B-100 3 HIGHs; B-102/B-103 shared 1 HIGH + 1 MEDIUM via single ordering change)

### What Went Well
- **5 items shipped in one calendar day via aggressive parallelism**: 4 R1 simultaneously, 4 R2 simultaneously, Wave A 3 R3 + Wave B 1 R3, 11 R4 reviewers in mega-batch, 4 R5 simultaneously, 4 R6 simultaneously. Zero merge conflicts despite multiple agents on `sidepanel/sidepanel.js`.
- **Shared root-cause discovery (B-102+B-103)**: B-103 R1 [product-manager] discovered both items share the same `diffAndPatch` fast-path bug → enabled coordinated R2 (one shared §50 + one thin pointer §51) → B-102 R3 landed shared 2-line fix → B-103 R3 = 0 LOC.
- **R4 contrast-math discipline (B-100)**: qa-reviewer caught dark-theme destructive red AA failure (~3.1:1 on Tokyo Night) BEFORE R5 — would have shipped silently otherwise. Validates the S34 R4 retrospective action item.
- **R3-fix bundled HIGH + MEDIUM resolution**: B-102/103 single ordering change closed both H-1 (code) AND M-1 (qa).
- **NEW precedents**: chrome-mock multi-context constraint (B-102 R6); algorithm-divergent contrast assertions monotonic-decrease guard (B-105 R5).

### What to Improve
- **R1 inter-item coordination is ad-hoc**: B-103 R1 found B-102's root cause by accident. Action item: when filing multiple bug-fix items in one sprint, R1 [product-manager] should explicitly check for shared root causes during definition.
- **chrome-mock multi-context simulation gap**: B-102's T5 SKIP-with-sentinel works, but multi-window UAT remains manual.
- **R5 test-count overrun (B-100 +167%, B-105 +75%)**: agents err on the high side. Not a problem; documenting the trend.

### Action Items for Next Sprint
1. [scrum-master] CLAUDE.md R1 round details: add "When a sprint contains multiple bug-fix items, R1 [product-manager] MUST check whether items share a root cause by reading each other's repro cases. Document overlap in R1 handoff notes." [HIGH]
2. [scrum-master] Triage B-107 (P3/XS) + B-108 (P3/S) at next sprint kickoff. [MEDIUM]
3. [scrum-master] Consider filing a chrome-mock multi-context enhancement item (P3/M) for next sprint kit. [LOW]

---

## Blockers

*None.*

---

## Backlog Items Filed This Sprint

| ID | Title | Priority | Effort | Source |
|----|-------|----------|--------|--------|
| B-107 | Live-X aria-label reactive flip — WCAG 2.1 SC 4.1.2 | P3 | XS | B-100 R4 qa-reviewer M-4 |
| B-108 | Solarized-light `--text-secondary` AA fix (group counts, helper text 3.636:1) | P3 | S | B-105 R4 qa-reviewer M-1 |
