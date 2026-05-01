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
- **Status**: requirements → architecture → build → code-review → security-review → qa-review → test-engineer → close → post-close
- **Assigned To**: [product-manager] (R1)
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
- **Files Changed** (target — accumulated across the build round):
  - Create: `background/sync/chrome-sync.js`, `background/sync/color-map.js`, `settings/settings-chrome-sync.js`
  - Modify: `shared/messages.js`, `background/storage/migration.js`, `background/storage/shapes.js`, `background/storage/groups.js`, `background/messages/storage-handlers.js`, `tests/chrome-mock.js`, `settings/settings.html`, `settings/settings.js`, `manifest.json`
  - Tests (new): ~7 test files / +38 tests target (1826 → ~1864)
  - Docs: `docs/UAT_B-041.md`, `docs/design/67-b-041-chrome-tab-group-sync.md` (R6 close), `CHANGELOG.md`, `docs/RELEASES.md`
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
| R1 | [product-manager] | pending | Locks ACs from spec §11 preview |
| R2 | [solution-architect] | pending | Authors `docs/design/67-*.md` + 30-second SW-REPL probe for C-8 |
| R3 | [frontend-engineer] | pending | Executes plan tasks 1–15 |
| R4 | [code-reviewer] + [security-reviewer] + [qa-reviewer] | pending — parallel | Findings → `docs/findings/sprint-42.md` |
| R5 | [test-engineer] | pending | +38 automated tests + UAT_B-041.md walkthrough in Edge |
| R6 | [solution-architect] | pending | §67 As-Built |
| R7 | [technical-writer] | pending | CHANGELOG + user-manual entry |
| Close | [release-manager] | pending | v1.36.0 tag on release/v2 (skip `gh release create` per pattern) |
