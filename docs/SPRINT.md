# Current Sprint

*Sprint 11 — Sidepanel Shell + Floating Tab Persistence. Closed 2026-04-16.*

---

## Active Items

*(none — sprint closed)*

---

## Completed This Sprint

### [B-054] Sidepanel shell: item/group rendering + live states + click-to-navigate + broadcasts ✅
- **Tier**: Full (M) — downgraded from L; ~95% pre-built across prior sprints
- **Closed**: 2026-04-16
- **Pipeline**: R1 ✅ → R2 ✅ → R3 skipped → R4 ✅ (3H fixed: SVG factories, O(N²) fix, nested group drag) → R5 ✅ (33 tests, 16/17 UAT PASS, AC12 SKIP) → R6 ✅ (SOLUTION_DESIGN.md v2.4 §23)
- **Files Changed**: `sidepanel/sidepanel.js` (R4 fixes: _createAudibleIcon/_createDriftedIcon factories, itemMap O(1) lookup, nested group drag selector fix, replaceChildren consistency), `tests/b054-sidepanel.test.js` (new, 33 tests)

### [B-018] Floating tab group persistence across restart ✅
- **Tier**: Full (M) — core implementation pre-built; verification + 2 HIGH fixes
- **Closed**: 2026-04-16
- **Pipeline**: R1 ✅ → R2 ✅ → R3 skipped → R4 ✅ (2H fixed: TOCTOU prune, premature resolution) → R5 ✅ (9 tests, 13/13 UAT PASS) → R6 ✅ (SOLUTION_DESIGN.md v2.5 §24)
- **Files Changed**: `background/tabs/floating-groups.js` (pruneResolvedFloatingGroups uses live current + resolvedItemIds; claim failure releases tab), `tests/b018-persistence.test.js` (new, 9 tests)

---

## Gate 4 — Release Checklist ✅

- ✅ All R4 review findings resolved (no open CRITICAL/HIGH issues)
- ✅ All R5 automated tests passing — 374/374 (332 baseline + 33 B-054 + 9 B-018)
- ✅ UAT sign-off: B-054 PASS (16/17 ACs; AC12 SKIP), B-018 PASS (13/13 ACs)
- ✅ No open blockers
- ✅ `docs/SOLUTION_DESIGN.md` updated to v2.5 by [solution-architect] (§23 B-054, §24 B-018)
- ✅ `manifest.json` permissions — no new permissions added
- ✅ Rollback plan: all changes are targeted fixes in existing files; revert commits to restore prior state
- ✅ README/STORE_LISTING: B-054 is verification of pre-built UI; B-018 is backend. No new user-facing features — [technical-writer] R7 skipped
- ✅ `BACKLOG.md` updated — B-054, B-018 set to `done`
- ✅ `BACKLOG_BOARD.md` v1.7 — 24/56 done (43%), 0 in progress, dashboard accurate
- ✅ `SPRINT.md` "Completed This Sprint" reflects both finished items

---

## Gate 7 — Sprint Retrospective

### Velocity
- Planned: 2 items / 1M (downgraded from L) + 1M effort
- Completed: 2 items / 2M effort
- Carried over: 0

### What Went Well
- Both items were identified as ~95% pre-built during R1 — sprint became verification + targeted fixes rather than greenfield. This is the payoff of the R1 "scan for pre-existing code" action item from Sprint 9.
- R4 caught 5 HIGH findings across both items (3 for B-054, 2 for B-018) that would have been production bugs: the TOCTOU prune race in floating-groups would silently drop records under concurrent appends, and the premature resolution marking would permanently lose floating-group records on transient claim failures.
- 42 new tests (+33 B-054, +9 B-018) brought the suite to 374. Coverage now spans sidepanel logic, floating-group TOCTOU, and cold-start integration.

### What to Improve
- B-054's 1249-line single file (`sidepanel.js`) was flagged by [code-reviewer] as approaching unmaintainable. The R4 fixes (factory extraction, replaceChildren) are incremental improvements but a dedicated modularity sprint item is needed.
- AC12 (first-paint < 200ms) was SKIPped because it requires a browser environment. A future sprint should add a browser-context performance test or document the measurement methodology for manual UAT.
- B-018's `reassociateFloatingGroups` has no TTL on unresolved records — these accumulate in storage.local indefinitely. Should be tracked as a backlog item.

### Action Items for Next Sprint
- [ ] [product-manager] Create backlog item for sidepanel.js modularization (extract render, dialog, filter, drag into separate modules)
- [ ] [product-manager] Create backlog item for floating-group TTL pruning (unresolved records older than N days)
- [ ] [test-engineer] Define methodology for AC12 browser-context performance measurement; add to B-054's test plan for future regression runs
