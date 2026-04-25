# Current Sprint

*Sprint 33 closed 2026-04-25. Awaiting product-owner direction for next sprint.*

The post-close state below documents the v1.27.0 release. Single-item Full-tier sprint shipped clean: B-099 drift fix (Option B + "Snap to this tab" reconcile action) + 4 new follow-up backlog items filed from UAT (B-100 / B-101 / B-102 / B-103).

Ships to `release/v2` as v1.27.0. **No main merge** — that remains a manual product-owner task. The v2 → main merge has been deferred since v1.26.0 close.

---

## Gate 4 — Release Checklist (verified 2026-04-25)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 4 MEDIUM + 2 LOW applied; 0 CRITICAL / 0 HIGH from any reviewer |
| 2 | All R5 automated tests passing | ✅ — 1,412/1,412 (+11 net via T1-T11) |
| 3 | UAT sign-off recorded by [test-engineer] | ✅ — 14/14 PASS (4 went through one fix-cycle iteration) |
| 4 | No open blockers in `SPRINT.md` | ✅ |
| 5 | Relevant `docs/design/NN-*.md` chapter updated | ✅ — `docs/design/46-b-099-drift-fix.md` §46.10 As Built filled |
| 6 | `manifest.json` permissions reviewed | ✅ — zero new permissions (`tabs`, `tabGroups`, `storage`, `sidePanel`, `search` unchanged) |
| 7 | `./build.sh` produces a clean package | ✅ — 312 KB, 86 files, no errors |
| 8 | Rollback plan documented for storage schema changes | ✅ — N/A (zero schema changes); single-commit revert documented in §46.8 |
| 9 | README/STORE_LISTING/CHANGELOG updated | ✅ — CHANGELOG `[1.27.0]` entry added; user-manual `managing-items.md` + `new-tab-page.md` updated for "Snap to this tab" + drift tooltip |
| 10 | `BACKLOG.md` updated — completed items set to `done` | ✅ — B-099 → `done`; B-100/101/102/103 filed as new backlog rows |
| 11 | `BACKLOG_BOARD.md` updated — progress dashboard accurate | ✅ — totals: 99 items / 93 done / 92→93% completion / 4 new in backlog |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all finished items | ✅ (below) |
| 13 | `SPRINT_ARCHIVE.md` updated — Sprint 33 entry appended | ✅ |

---

## Completed This Sprint

### [B-099] Drift Fix (Option B) + "Snap to this tab" Reconcile Action — ✅ DONE
- **Tier**: Full (M) · **Closed**: 2026-04-25
- **Pipeline**: R1 ✅ · R2 ✅ (§46 design chapter) · R3 ✅ · R4 ✅ (3 reviewers parallel — 0 CRITICAL / 0 HIGH / 4 MEDIUM all fixed / 2 LOW inline) · R5 ✅ (11 automated tests + 14 UAT cases) · R6 ✅ (§46.10 As Built filled) · R7 ✅ (CHANGELOG + user manual)
- **Files changed**:
  - `background/tabs/tab-claims.js` — `reevaluateTab` URL-mismatch release branch removed (D-1)
  - `background/messages/storage-handlers.js` — `MSG_UPDATE_ITEM` extended with inline `clearDrift` on URL change (D-2)
  - `sidepanel/sidepanel.js` — `_createDriftedIcon` 16 px + hostname tooltip; `openContextMenu` "Snap to this tab" entry; `showToast` extended with optional `{ undoLabel, onUndo, durationMs }`; `_ensureIndicators` true→true tooltip refresh
  - `sidepanel/sidepanel.html` — `#toast-undo` button slot
  - `sidepanel/sidepanel.css` — `.toast-undo` styling
  - `newtab/newtab.js` — `_buildIndicators` drift dot hostname tooltip
  - `tests/b099-drift-fix.test.js` (new, 11 tests T1-T11)
  - `tests/tab-url-change.test.js` (re-pinned to assert Option B contract)
  - `tests/tab-events-no-storage-write.test.js` (re-scoped to use unclaimed tab)
  - `docs/design/46-b-099-drift-fix.md` (new R2 chapter, R6 As Built filled)
  - `docs/UAT_B-099.md` (new, 14 UAT cases)
  - `docs/SOLUTION_DESIGN.md` (TOC entry for §46)
  - `CHANGELOG.md` (`[1.27.0]` entry)
  - `docs/user-manual/managing-items.md` + `docs/user-manual/new-tab-page.md` (drift + Snap action documented)
  - `manifest.json` (version 1.26.0 → 1.27.0)
- **Key decisions**: D-1 Option B claim-preservation; D-2 inline `clearDrift` in SW handler; D-3 re-claim contention (original wins); D-4 indicators additive, drift last; D-5 context menu host; D-6 inline toast + Undo (6 s default); D-7 `--drifted-color` token correction; D-8 `buildOpenTabs` filter unchanged; D-9 menu insertion between Edit and Move-to-group + H-1 click-time re-read pattern; D-10 closure-captured Undo lifecycle
- **R4 fixes applied**: M-1 tooltip refresh on true→true drift change; M-2 optimistic-toast pattern; M-3 toast copy reconciliation ("Bookmark snapped to current tab"); M-4 error toast on missing originalUrl
- **UAT outcome**: 14/14 PASS · UAT-9, UAT-10, UAT-13, UAT-14 went through one fix-cycle iteration (UAT-9/10 traced to stale SW per C-1; UAT-13 demote-when-live precondition clarified; UAT-14 confirmed window-filter behavior, NOT regression)
- **Follow-ups filed**: B-100 (delete-on-live UX, P3/M), B-101 (subtle drift indicator, P3/S), B-102 (cross-window demote bug, P2/M), B-103 (promote duplicate bug, P2/S)

---

## Wave Plan (executed)

```
Wave 0 (single item — full pipeline)
  └── B-099 R1 ✅ → R2 ✅ → R3 ✅ → R4 ✅ (3 reviewers parallel) → R5 ✅ → R6 ✅ → R7 ✅

Sprint Close
  Gate 4 ✅ → Gate 7 ✅ → [release-manager] v1.27.0 → archive (release/v2 only; no main merge)
```

**P-1 / P-2 / P-3 compliance**:
- P-1 ✅ — zero L items
- P-2 N/A — no S/XS items
- P-3 ✅ — only one M item

---

## Gate 7 — Sprint Retrospective (Sprint 33)

### Velocity
- Planned: 1 item / 1 M (Full pipeline)
- Completed: 1 item / 1 M (Full pipeline) + 4 follow-up backlog items filed from UAT
- Carried over: 0
- Test growth: 1,401 → 1,412 (+11 net, +0.78%)
- Fix cycles: 1 partial cycle (4 UAT cases iterated once before reaching PASS — all traceable to stale SW or UAT spec ambiguity, not code defects)

### What Went Well

- **Single-item Full-tier sprint executed cleanly**: kickoff to v1.27.0 in one calendar day with 7-round pipeline + 14-case UAT + 4 R4 fixes + 4 follow-up backlog items filed. Single-item-Full-pipeline is now a proven pattern for high-confidence bug fixes.
- **Latent S1 bug closed with high-quality regression coverage**: B-099 fixed a defect that had been latent since Sprint 1 (B-001d). 11 new tests + 14 UAT cases ensure the contract is locked. Two pre-existing tests were re-pinned because they had codified the buggy behavior — caught by [test-engineer] at R5 (good catch).
- **R4 fix bundle landed cleanly via optimistic-toast pattern**: M-2's switch to "show toast before SW round-trip resolves; replace with error toast in `.catch`" is a pattern worth documenting for future Snap-style actions. C-11 popup-lifecycle precedent applied here even though this isn't a popup surface.
- **Follow-up backlog discipline**: 4 new items filed from UAT instead of attempting in-sprint scope creep. B-100/101/102/103 each have priority + effort + clear repro, ready for next-sprint triage.

### What to Improve

- **Pre-existing test re-pins should be R2-flagged for bug-fix sprints**: R5 surfaced two test files (`tab-url-change.test.js`, `tab-events-no-storage-write.test.js`) that asserted the buggy behavior. R2 should explicitly enumerate "tests that codify the bug under fix" so they can be pre-flagged for re-pin in R3 — would have prevented the R5 surprise.
- **R1 token validation step**: R1 specified `--color-warning` as the drift color token; that token does not exist. R2 caught and corrected (D-7) but the round-trip cost ~10 minutes. R1 AC blocks that reference CSS tokens should grep-verify the token exists in `shared/themes.css` before locking.
- **C-1 stale-SW prompt**: even with zero new pref keys / zero new manifest entries / zero schema changes, the user hit stale-SW symptoms at UAT-9/10. The "no reload required" assertion in §46.5 was technically correct (no SW module cache invalidation needed for B-099) but in practice the user's existing SW had pre-S33 code loaded. Recommendation: when a sprint touches `tab-claims.js` OR `storage-handlers.js` OR `drift.js`, the CHANGELOG note should still say "after updating, hard-reload the Tab Junkie sidepanel and any open new-tab tabs" even if the formal C-1 stale-SW prompt is not required.

### Action Items for Next Sprint

1. [scrum-master] Add an R2 subsection: "Pre-existing tests that codify the bug under fix — flag for re-pin in R3." Apply to all bug-fix sprints (Tier: Full where the item is a bug fix vs. new feature).
2. [scrum-master] R1 AC blocks that reference CSS custom properties (`--*` tokens) MUST include a "Token verified" checkbox listing the file/line where the token is defined. R2 confirms.
3. [technical-writer] Even when C-1 stale-SW prompt is not required (zero new pref keys / manifest entries / schema), CHANGELOG entries that touch SW-side code (tab-claims, storage-handlers, drift, tab-events) should include a "tip: hard-reload the side panel + any open new-tab tabs after updating" line under Note. Apply retroactively — no need to amend v1.27.0 if already shipped, but the pattern is established for v1.28.0+.

---

## Blockers

*None.*

---

## Backlog Items Filed This Sprint

| ID | Title | Priority | Effort | Source |
|----|-------|----------|--------|--------|
| B-100 | Delete-on-live UX — Delete should default to "Close tab" when item is live | P3 | M | UAT-2 user feedback |
| B-101 | Subtle drift indicator — softer treatment for the 16 px warning triangle | P3 | S | UAT-9 user feedback |
| B-102 | Cross-window demote bug — closing live tab in non-sidepanel window may leave stale claim | P2 | M | UAT-14 investigation |
| B-103 | Promote duplicate bug — promoting tab matching existing bookmark should re-claim, not duplicate | P2 | S | UAT-11 mental-model walkthrough |

All four filed in `BACKLOG.md` with status `backlog`. Triage at next sprint kickoff.
