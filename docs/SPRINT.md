# Current Sprint — Sprint 45

**Theme:** Claim-desync correctness (post-B-148 follow-up)
**Branch:** `feature/sprint-45-claim-desync` (off `release/v2` at v1.39.0 / `6600010`)
**Opened:** 2026-05-21
**Estimated effort:** 2 × M + 1 × S = ~5 effort units (Full pipeline on all three; B-166 auto-upgraded from Fast Track per the storage/message contract rule)

---

## Sprint 45 Charter — additional discipline (rolled in from S44 retrospective)

Three CLAUDE.md edit action items inherited from S44 retrospective; the [scrum-master] folds these into Sprint 45 close-out (not separate Fast Track items, just live process upgrades):

- [ ] **[scrum-master]** Enforce R6 chapter authoring BEFORE the version-bump commit. No `manifest.json` version-bump / `CHANGELOG` / `RELEASES` commits permitted until the relevant `docs/design/NN-*.md` chapter exists AND the root `docs/SOLUTION_DESIGN.md` TOC has been extended. Update CLAUDE.md "Round 6: Close" to make this ordering explicit.
- [ ] **[solution-architect]** Extend CLAUDE.md "Fix-scope test-assertion enumeration" subsection (currently scoped to test files) to ALSO cover code write-site enumeration when an R2 chapter introduces a new cross-cutting field/contract maintained at multiple write entry points. S44 B-148 + the `bulkReorderItems` hotfix `f96662a` are the blocking precedent.
- [ ] **[code-reviewer]** Add "blind-replace mutator" anti-pattern to the R4 review checklist. Any `mutator: () => precomputed` (or `mutator: (current) => somethingElse`) that ignores the `current` snapshot inside a `writeTransaction` is a HIGH-severity race candidate for the partition being written. S44 B-148 `bootstrapAndSweepRenderOrder` is the precedent.

---

## Gate 6 — Sprint Readiness (verified 2026-05-21)

- ✅ All three sprint items have passed Definition of Ready (B-164 R1 PENDING per BACKLOG; B-163 R1 PENDING per BACKLOG; B-166 R1 PENDING per BACKLOG — three R0 spike option sets already enumerated in BACKLOG)
- ✅ Total sprint effort (2M + 1S = ~5) fits the sprint duration
- ✅ No unresolved blockers from S44 (close-out clean; v1.39.0 shipped)
- ✅ "Active Items" section below populated with all three
- ✅ BACKLOG.md updated — B-164/B-163/B-166 set to `in-progress` / sprint 45
- ✅ BACKLOG_BOARD.md updated — In-Progress count 0 → 3; To-Do 10 → 7
- ✅ **Deps-resolved check** — all dependencies are either `done` OR also in S45:
  - B-164 deps: B-099 ✅, B-149 ✅, B-163 (in S45 ✅) — was a backlog dep gap; resolved by bringing B-163 in-sprint
  - B-163 deps: B-099 ✅, B-110 ✅, B-149 ✅
  - B-166 deps: B-148 ✅ (S44 close), B-124 ✅, B-121 ✅

---

## Cross-item parallelization plan (per CLAUDE.md P-1..P-4)

| Rule | Application |
|---|---|
| P-1 (max 1 L/XL) | N/A — no L/XL items |
| P-2 (S/XS rides alongside) | B-166 (S) rides alongside B-164 + B-163 |
| P-3 (max 2 M parallel) | B-164 (M) + B-163 (M) — within limit |
| P-4 (interleave full pipelines, don't overlap) | Sibling R0 spike runs JOINTLY for B-164 + B-163 (shared investigation of Chrome event sequence on sleep/wake/restart for the claim mirror); then R1+ runs independently per item |

**Suggested execution order:**
1. **Joint R0 spike** (single [solution-architect] dispatch covering B-164 + B-163) — establish the Chrome event sequence (`onReplaced`/`onDiscarded`/SW-cold-start) and pick a fix shape per item. Output: two R0 decision records.
2. **R1 for all three** in parallel ([product-manager] × 3) — joint R0 output drives B-164 + B-163 ACs; B-166 R1 is independent.
3. **R2 architecture** — B-164 + B-163 may share a single `docs/design/NN-*.md` chapter if the fix mechanisms align (TBD at R2 entry); B-166 gets its own R2 review.
4. **R3 build** — independent per item; [frontend-engineer] sequences as needed.
5. **R4 review × 3 (parallel)** per CLAUDE.md Gate 1.
6. **R5 testing + UAT** per item.
7. **R6 close** — chapter(s) FIRST, then version bump per S44 retro action item #1.
8. **Sprint close** — Gate 4 + Gate 7 + release.

---

## Active Items

### [B-164] Saved-bookmark→tab claims survive system sleep / lid-close

- **Tier**: Full (M)
- **Priority**: P1
- **Status**: **R3 BUILD COMPLETE (2026-05-22)** — 13 files modified (manifest + 5 background + 5 tests + new b164 test file + chrome-mock infra). New `chrome.tabs.onReplaced` listener performing 5-table remap (table 3 no-op per R2 clarification; table 4 clearTimeout+delete per R2 option-ii). New `idle-reconciler.js` module with `setDetectionInterval(60)` + `_reconcileInFlight` dedup flag + B-132 graceful-degradation. New `remapFloatingGroupsLiveTabId` atomic writeTransaction (blind-replace check clean: `(current) =>` mutator). **Tests 2038 → 2048 PASS** (+10 new B-164 tests T1-T10; zero regressions; 4 baseline pin updates net-zero). Zero R2 spec deviations.
- **Assigned To**: PRODUCT-OWNER (UAT execution — 4 cases) → sprint-close cleanup
- **Blockers**: ⏳ UAT execution — 4 cases in `docs/findings/sprint-45.md` "R5 — B-164 UAT script"; ~5-10 min runtime (UAT-3 is multi-day smoke). **R5 audit done** (100% AC coverage T1-T12; 2050 PASS). **R6 As-Built done** (chapter §69 1249 → 1400 lines; new §69.3.2.1 race-guard architecture; §69.5.4 corrected; §69.13 R6 audit trail; SOLUTION_DESIGN TOC flipped).
- **Feature Context**:
  - Product-owner reports that over days of continuous use, across system sleep / laptop-lid-close cycles, saved-bookmark→tab claims progressively break: live tab appears in Open Tabs as if unclaimed, matching bookmark renders as non-live.
  - Distinct from B-149 (SW idle-shutdown, fixed) and B-163 (full browser restart, in-sprint sibling).
  - Strongest root-cause lead: zero `chrome.tabs.onReplaced` / `onDiscarded` listeners in `background/`; claim mirror keyed `itemId → tabId` (`background/tabs/tab-claims.js:19`) never remapped if Chrome rotates tab ids on discard/restore post-sleep. Maps to CLAUDE.md C-13 (Chrome event-feedback completeness).
- **Handoff Notes**: R0 spike (joint with B-163) must confirm the actual Chrome event sequence on sleep/wake (which of `onReplaced`/`onDiscarded`/nothing/SW-cold-start fires) — fix shape depends on it. 30-second SW REPL probe (`chrome.tabs.discard(N)` → compare id before/after reactivation) is a minimum check.
- **Files Changed**: (none yet)
- **Parallel Opportunity**: Joint R0 spike with B-163 (siblings); R1 + R3 can run in parallel with B-166 (independent surface).

### [B-163] Drift URL fallback on cold-start re-association

- **Tier**: Full (M)
- **Priority**: P2
- **Status**: **R1 LOCKED (2026-05-21)** — 7 testable ACs: AC1 cold-start drift re-association (happy) · AC2 primary `item.url` wins over drift URL · AC3 one-tab-per-drift-record cap (hijack mitigation) · AC4 drift dropped only when both URLs fail (§10.7 invariant preserved) · AC5 inherited-tab skip in Phase-3 (B-125 parity) · AC6 zero B-149 Phase-1 regression · **AC7 PRODUCT-OWNER R2 DECISION REQUIRED — TTL on drift-as-fallback-key (None / 7 days / N days)**. Full block in `docs/findings/sprint-45.md` R1 LOCKED section.
- **Assigned To**: PRODUCT-OWNER (UAT execution — 4 UI-observable cases) → sprint-close cleanup
- **Blockers**: ⏳ UAT execution — 4 cases in `docs/findings/sprint-45.md` "R5 — B-163 UAT script" section; ~5-7 min runtime; UI-observable signals only. **R5 audit done** (100% AC coverage T1-T9; 2048 PASS). **R6 As-Built done** (chapter §70 flipped R2 LOCKED → R6 AS-BUILT; §70.3.1.1 graceful-degradation contract added; §70.13 R4 audit trail; SOLUTION_DESIGN TOC descriptor updated).
- **Feature Context**:
  - Today `reconcileClaims` Phase 2 uses ONLY `item.url` as the URL-match candidate. Phase 1 evictions paired-clear drift records (B-110 §53).
  - Result: a claimed item that drifts to URL X, then loses its claim across an SW idle + tab-recreate cycle, will NOT re-bind to a fresh tab on URL X — even though `tj:drift` recorded the drift before eviction.
  - R0 options pre-enumerated in BACKLOG: (a) defer §53 paired-clear + Phase-3 sweep / (b) Phase-2 fallback lookup against `driftedToUrl` / (c) persist `lastClaimedUrl` rolling field on Items.
- **Handoff Notes**: Joint R0 spike with B-164 (both touch the claim re-binding lifecycle). Out of scope: re-introducing URL-match as a Phase-1 survival predicate (B-149 specifically inverted that).
- **Files Changed**: (none yet)
- **Parallel Opportunity**: Sibling of B-164 — joint R0 spike, then independent R1+ pipelines.

### [B-166] `+` CTA on floating tab promotes in-place (not bottom of group)

- **Tier**: Full (M) — auto-upgraded from Fast Track per CLAUDE.md "If an XS/S item introduces a new storage schema, new message types, new extension permissions, or cross-cutting changes…": R0 options (a) and (c) propose message-contract (MSG_PROMOTE_TAB payload extension) or storage-contract (`createItem({insertAt})`) changes; (b) is purely SW-side detection. R2 review needed regardless of option.
- **Priority**: P2
- **Status**: **R3 BUILD COMPLETE (2026-05-21)** — 6 files modified, 10 new tests, 2016 → 2026 PASS (zero regressions). Cross-surface extension: newtab `_promoteFloatingTab` also extended (R2 spec deviation escalated — §71 chapter said newtab unchanged, but both surfaces consume the same `Group.renderOrder`; agent extended in lockstep with proper escalation per CLAUDE.md). All 6 R1 ACs covered. Cascade-prune sibling-grep verified 3 MSG_PROMOTE_TAB sender sites + 1 SW handler (bulk-promote + right-click picker correctly omit the hint per AC5).
- **Status**: ✅ **DONE through R6 (2026-05-21)** — chapter §71 As-Built reconciled (11-row delta table + 4 behaviors-shipped-the-chapter-didn't-anticipate documented). SOLUTION_DESIGN.md TOC descriptor updated R2 Plan → R6 As-Built. Awaiting sprint close to mark BACKLOG.md status → done.
- **Assigned To**: [scrum-master] (sprint-close cleanup)
- **Blockers**: none
- **Feature Context**:
  - The floating-row `+` CTA (`_onFloatingSaveCtaClick` at `sidepanel/sidepanel.js:3169`) saves the floating tab into its parent group correctly (no modal), but the new bookmark lands at the BOTTOM of the group instead of taking over the floating tab's interleaved position.
  - Root cause: `MSG_PROMOTE_TAB` (`background/messages/storage-handlers.js:407`) calls `createItem({title, url, groupId})` with no positioning hint; `createItem` (`background/storage/items.js:174-225`) unconditionally appends — `renderOrder.push('item:' + item.id)` at `:207` and `sortOrder: bucketSize` at `:220`. Post-B-148 the group `renderOrder` already contains a `floating:<floatingTabId>` entry at the visible position; the promote path neither reads nor replaces it.
  - R0 options pre-enumerated in BACKLOG: (a) UI-side `replaceFloatingId` hint on MSG_PROMOTE_TAB / (b) SW-side detection / (c) general-purpose `createItem({insertAt})` parameter.
- **Handoff Notes**: Out of scope: right-click `_openOpenTabContextMenu` "Save to group" picker path (intentional UX for cross-group saves — confirmed at filing); Open-Tabs save flows (no group to preserve position within).
- **Files Changed**: (none yet)
- **Parallel Opportunity**: Independent of B-164 + B-163; can run start-to-end in parallel.

---

## Completed This Sprint

_None yet — sprint just opened._

---

## Carryover backlog candidates (not in S45 scope)

These remain in the backlog; the product owner may add at S46 kickoff:

- **B-150 Q2** — lost-sync continuation; awaits real-world repro signal.
- **B-155** — Multi-drag count-badge ghost (Edge regression).
- **B-162** — Ctrl+Shift+T reopen (P3 / M); deferable per the "Ctrl+Shift+T was never integrated with TJ pre-B-148" rationale.
- **B-165** — drop scroll preservation (P2 / M); can ride alongside any sidepanel polish wave.
- **B-076** — `MIGRATION_STEPS` hook (P2 / S, pre-S33).
- **B-086** — Sidepanel UI/UX umbrella (P3 / M, pre-S33).
- **B-135** — Cross-window Open Tabs drag (P3, deferred stub from B-134 v1).
- **chrome-mock fixture: non-zero strip offset for Open Tabs section** — S43 retro action item.
- **Edge pre-merge smoke test protocol** — S43 retro action item.
