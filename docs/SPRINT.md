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

_None — all three S45 items closed below._

---

## Completed This Sprint

### [B-164] Saved-bookmark→tab claims survive system sleep / lid-close

- **Tier**: Full (M)
- **Priority**: P1
- **Status**: ✅ **DONE through R6 (S45 close, 2026-05-28)**
- **As-Shipped Summary**: New `chrome.tabs.onReplaced` listener (`background/tabs/tab-events.js`) performs an atomic 5-table remap (claimsMirror, inheritedTabs, drift, floatingGroups.liveTabId, openerMap) within a single `writeTransaction`. New `background/tabs/idle-reconciler.js` module subscribes to `chrome.idle.onStateChanged` with `setDetectionInterval(60)` and triggers a defensive `reconcileClaims` on wake — guarded by an `_reconcileActive` flag + `_pendingReplacements` queue + drain-callback pattern (R4 M-2 Option B) so concurrent `onReplaced` events during the reconcile pass are queued and drained, not lost. New `"idle"` manifest permission. New `remapFloatingGroupsLiveTabId` atomic write site. **Tests**: T1–T12 (10 from R3 + T11 dedup-counter / T12 race-guard from R4 fix-round); 2038 → 2050 PASS, zero regressions. **R4 findings**: 2 MEDIUM closed (M-1 dedup, M-2 race-guard); 5 LOWs deferred to P3 backlog. **R6 As-Built**: chapter §69 (1249 → 1400 lines), new §69.3.2.1 race-guard architecture subsection, §69.5.4 SW event-loop serialization claim corrected, §69.13 R6 audit trail, SOLUTION_DESIGN TOC descriptor R2 Plan → R6 As-Built.
- **Files Changed**: `manifest.json`, `background/service-worker.js`, `background/tabs/tab-events.js`, `background/tabs/tab-claims.js`, `background/tabs/floating-groups.js`, `background/tabs/idle-reconciler.js` (new), `tests/b164-sleep-claim-remap.test.js` (new, T1–T12), `tests/chrome-mock.js` (chrome.idle + chrome.tabs.onReplaced infra), `tests/b132-cold-start-inheritance.test.js` (baseline pin), `tests/b149-drifted-claim-survives-cold-start.test.js` (baseline pin), `docs/design/69-b-164-sleep-claim-remap.md` (new R6 As-Built chapter), `docs/SOLUTION_DESIGN.md` (TOC §69 entry).

### [B-163] Drift URL fallback on cold-start re-association (incl. B-132 sibling fix)

- **Tier**: Full (M)
- **Priority**: P2
- **Status**: ✅ **DONE through R6 (S45 close, 2026-05-28)**
- **As-Shipped Summary**: `reconcileClaims` extended with Phase 3 (drift-URL fallback lookup) and Phase 4 (conditional drift drop). Phase 3 iterates all unbound items (R4 round-2 scope broadening from R3's initial `evictedItemIds` source — extension-reload regression caught at empirical UAT and fixed in `eb714fd`); primary `item.url` always wins over `drift.driftedToUrl`; one-tab-per-drift-record cap mitigates hijack risk; inherited-tab skip preserves B-125 parity. Phase 4 drops drift records only when BOTH `item.url` and `driftedToUrl` failed to match (§10.7 invariant preserved). `getDriftRecords()` wrapped in try/catch graceful degradation (R4 HIGH-1, fixed in `edd83c8`) — storage-read failure logs and continues with empty drift map rather than aborting reconcile. **Sibling B-132 fix**: `preMarkInheritedFromFloatingGroups` (`background/tabs/floating-groups.js`) now requires URL corroboration on position match (commit `ea84211`) — closes a stale-position false-positive surfaced at S45 post-UAT review. **Tests**: T1–T10 covering happy-path re-association, primary-wins, one-tab cap, drift-preservation when only one URL matches, inherited-tab skip, B-149 Phase-1 regression guard, storage-failure graceful degradation, R4 round-2 unbound-items iteration. **R6 As-Built**: chapter §70 (R2 LOCKED → R6 AS-BUILT), §70.3.1.1 graceful-degradation contract, §70.13 audit trail, §70.13.7 cascade narrative for the R4 round-2 + B-132 sibling fix. §65.15 R6 As-Built addendum added to B-132 chapter for the post-UAT URL-corroboration fix. SOLUTION_DESIGN TOC descriptor updated.
- **Files Changed**: `background/tabs/tab-claims.js`, `background/tabs/floating-groups.js`, `background/tabs/index.js`, `background/messages/storage-handlers.js`, `tests/b163-drift-fallback-reconcile.test.js` (new, T1–T10), `tests/b110-drift-non-live-fix.test.js` (baseline pin), `tests/b132-cold-start-inheritance.test.js` (URL-corroboration test), `docs/design/70-b-163-drift-fallback-reconcile.md` (new R6 As-Built chapter), `docs/design/65-b-132-cold-start-claim-jump-fix.md` (§65.15 S45 addendum), `docs/SOLUTION_DESIGN.md` (TOC §70 entry).

### [B-166] `+` CTA on floating tab promotes in-place (not bottom of group)

- **Tier**: Full (M) — auto-upgraded from Fast Track (S) per the message-contract rule (MSG_PROMOTE_TAB payload extension).
- **Priority**: P2
- **Status**: ✅ **DONE through R6 (S45 close, 2026-05-28)**
- **As-Shipped Summary**: R0 picked option (a) — UI-side `replaceFloatingId` hint on `MSG_PROMOTE_TAB`. Sidepanel `_onFloatingSaveCtaClick` (`sidepanel/sidepanel.js:3169`) and newtab `_promoteFloatingTab` (cross-surface extension per R3 escalation — both surfaces consume the same `Group.renderOrder`) pass `row.dataset.floatingTabId` as the hint. SW handler in `background/messages/storage-handlers.js` detects the hint and performs an atomic 3-partition swap (items + groups.renderOrder + floatingGroups) within a single `writeTransaction`: `createItem` lands the new item, the `floating:<id>` entry in `group.renderOrder` is swapped for `item:<newItemId>` at the same index, and the floating-tab row is pruned from `floatingGroups`. Cascade-prune sibling-grep verified — 3 MSG_PROMOTE_TAB sender sites + 1 SW handler; bulk-promote + right-click picker correctly omit the hint (AC5). **R4 fix-round**: 4 MEDIUM findings closed (cross-group prune scoping + 4-slot canonical test + source-text pin tightening). **Tests**: T1–T13 (10 from R3 + 3 R4 fix-round incl. T13 atomicity guard in the swap branch); 2016 → 2029 PASS. **R6 As-Built**: chapter §71 reconciled — 11-row delta table + 4 "behaviors shipped the chapter didn't anticipate" documented.
- **Files Changed**: `background/messages/storage-handlers.js`, `background/storage/items.js`, `sidepanel/sidepanel.js`, `newtab/newtab.js`, `tests/b166-promote-in-place.test.js` (new, T1–T13), `tests/b124-floating-visual.test.js` (baseline pin), `docs/design/71-b-166-promote-in-place.md` (new R6 As-Built chapter), `docs/SOLUTION_DESIGN.md` (TOC §71 entry).

### Backlog filing during S45

- **[B-167]** Durable `tj:itemClaims` architectural rework filed 2026-05-28 (P2 / XL / Spike-First). S45 surfaced three URL-inference bugs in four days (B-163 Phase 3 scope narrowing; B-132 preMark position-only false-positive; M-1 dedup test verifying final-state-not-invocation-count) — all fixed point-wise, but underlying pattern is that `tj:tabClaims` lives in `chrome.storage.session` (wiped on every reload/restart/crash) forcing URL re-inference. R0 spike candidates: durable `tj:itemClaims` partition, `chrome.sessions` API integration, URL-history-per-claim, or combination. P2 / XL — queued for S46+ triage.

---

## Sprint Retrospective — Sprint 45

### Velocity

- **Planned**: 3 items (B-164 P1/M anchor + B-163 P2/M sibling + B-166 P2/S→Full)
- **Completed**: 3 items shipped + sibling B-132 fix (post-UAT cascade) + 1 new backlog filed (B-167)
- **Tests**: 1930 (S44 baseline) → **2052 PASS** (+122 net, zero regressions)
- **Carried over**: 0
- **Cascade fix-rounds in-sprint**: 4 (B-163 R4 HIGH-1 graceful degradation · B-163 R4 round-2 Phase-3 broadening · B-164 R4 M-1/M-2 race-guard · B-132 sibling preMark URL corroboration)
- **Diagnostics shipped + reverted**: 2 instrumentation rounds via `chrome.storage.local._s45_*` traces; reverted at root-cause identification (`cb20b96`)

### What Went Well

- **Probe-driven R0 spike.** B-164's `chrome.tabs.onReplaced` empirical probe in real Edge captured the exact event sequence (`addedTabId: 803729449, removedTabId: 803725065` on `chrome.tabs.discard`) eliminating R0 guesswork that would otherwise have lurked into R3. The probe-script-then-design pattern should be precedent for any item investigating Chrome event-feedback gaps (C-13 class).
- **Cascade-fix iteration converged within the sprint.** Three URL-inference bugs (R3 Phase 3 narrowing; R4 round-2 broadening; B-132 preMark position-only) each surfaced via different signal pathways — R4 reviewer convergence on the HIGH-1 graceful-degradation gap; empirical UAT on the Phase 3 scope; deeper UAT trace on the preMark false positive. All closed before merge; the user-story symptom is now empirically validated end-to-end.
- **Filing B-167 as backlog instead of rushing architectural rework into S45.** Patches genuinely work; architectural concern recorded with full R0 spike candidates enumerated; S46 product-owner gets clean optionality without S45 scope creep.

### What to Improve

- **Spec-vs-implementation narrowing pattern surfaced THREE times in S45.** B-163 R3 narrowed Phase 3 from R1's "all unbound" to "evictedItemIds only"; M-1 dedup test verified final-state instead of invocation count; preMark used position-only match from R2's spec that documented both position AND URL paths. R4 reviewers caught some via convergence; empirical UAT caught the rest. The pattern is "the implementation simplifies a documented predicate; the test fixture matches the simplification; the bug is invisible in tests but real in production." The CLAUDE.md S46 retro candidate is to extend R4 reviewer charter with an explicit "contract-vs-implementation diff" gate: read the R1/R2 wording, trace the implementation predicate verbatim, flag any narrowing.
- **SW-console diagnostic UX was too technical for product-owner execution.** UAT scripts requiring `chrome.storage.local.get(...)` or `chrome.tabs.discard(...)` are documented in `docs/findings/sprint-45.md` as out-of-scope for UAT (S45 retro action item from B-166 close). Both cascade diagnostics (`_b163_debug`, `_s45_premark_trace`) shipped ad-hoc per-bug. A reusable `recordTrace(key, data)` helper that writes to `chrome.storage.local._diag_*` for SW-console-readable diagnostics surviving SW restart would replace per-investigation instrumentation.
- **The inference-recovery architectural layer is structurally fragile.** Three URL-inference bugs in four days. B-167 captures the wider class; the lesson for S45's process is "weigh point-fix vs symptom-of-wider-class before committing to a fix-round." All four S45 cascade rounds were correct interventions in isolation; the wider pattern was only visible at the post-cascade reflection.

### Action Items for Sprint 46

- [ ] **[code-reviewer]** Add "contract-vs-implementation diff" gate to the R4 review checklist. For every implementation predicate, read the R1/R2 contract wording, then trace the predicate to its implementation; flag any narrowing. The three S45 occurrences (B-163 Phase 3 scope, M-1 dedup test, preMark position-only) are the canonical precedents. Land as a CLAUDE.md "Round 4: Review" subsection update.
- [ ] **[scrum-master]** Triage B-167 at S46 kickoff. Durable `tj:itemClaims` architectural rework, P2 / XL / Spike-First. R0 spike before scoping; pick durability strategy from (a) durable partition / (b) `chrome.sessions` API / (c) URL-history-per-claim / (d) combination. Decision determines whether B-167 is an S46 anchor or deferred further.
- [ ] **[test-engineer]** Build a standard diagnostic-writes-to-storage helper. `shared/diag.js#recordTrace(key, data)` writes to `chrome.storage.local._diag_*` keys for SW-console-readable diagnostics that survive SW restart. Replaces the ad-hoc `globalThis._s45_*` + `chrome.storage.local._b163_debug` patterns. Reusable across future bug investigations; consistent with the S45 retro action item from B-166 close (UAT scripts should use UI-observable signals; SW-console-diagnostic helpers should be a reusable engineering tool, not per-bug improvisation).

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
