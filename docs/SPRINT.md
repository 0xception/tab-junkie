# Current Sprint

**Sprint 40 — Floating-tab bug-fix anchor + drag-reorder feature (kicked off 2026-04-30)**

Five-item sprint: 2 P1 floating-tab bugs (B-131 + B-132) + 1 P2 drag-reorder feature with R1-locked design (B-134) + 1 P3 visual consolidation Fast Track (B-133). One sibling deferred stub filed (B-135 cross-window drag — no sprint work).

- **Branch**: `feature/sprint-40-drag-reorder` off `release/v2` (post-v1.33.1 hotfix at `872ad95`)
- **Target version**: v1.34.0 (release/v2 only — no main merge per established pattern)
- **Test baseline at kickoff**: 1,732/1,732
- **Anchors**: B-132 (P1 bug · SW-memory + cold-start regression in B-121/B-125 subsystem · likely Spike-First R0) + B-134 (P2 drag-reorder · M Full · R1 LOCKED at brainstorm)
- **Wave 1**: B-131 verify-first + B-133 Fast Track XS

---

## R1 design status (Wave 0 inputs)

**B-131 — Floating tab title-displacement bug**
- **Verify-first**: product-owner reports may no longer reproduce post-v1.33.1. Wave 0 [product-manager] verifies repro on latest `release/v2` build BEFORE sinking R2 effort. If not-repro, downgrade to static-analysis review of suspected `buildFloatingTabRow` / `patchFloatingMembersSections` descriptor mapping; close as `wontfix-not-repro` if review is clean.
- **Tier**: TBD pending verify-first outcome.

**B-132 — Floating tabs route to Open Tabs after extension reload**
- **Likely Spike-First R0** — same B-121/B-125 subsystem that needed an R0 spike in S38 (B-125 + B-121 merged spike pattern).
- Distinguish: (a) post-reload-only spawn affected (SW lost opener context), vs (b) pre-existing floating tabs also lose their group (cold-start `tj:floatingGroups` re-bind regression).
- Wave 0 [solution-architect] runs R0 discovery spike to surface root cause + sub-item candidates.

**B-133 — Open Tabs section dotted-green indicator (visual consolidation)**
- **Tier**: Fast Track (XS) — pure CSS rule extension mirroring B-130 pattern.
- Visual taxonomy: solid-green = persistent (saved bookmark currently live); dotted-green = ephemeral (floating tab OR Open Tabs row).
- Wave 0 [product-manager] writes tight ACs. R1 source-citation gate (B-118) applies: cite `buildOpenTabRow` selector + `--floating-bar-color` token references.

**B-134 — Drag-and-drop reorder for open + floating tabs**
- **R1 LOCKED at brainstorm 2026-04-30** — see BACKLOG.md row B-134 for the full 8-AC block.
- 5 ops: Open Tabs reorder (chrome.tabs.move), within-floating reorder, ATTACH (open→floating), DETACH (floating→open), cross-group MOVE (floating→floating).
- **R2-VERIFY 1 (CRITICAL)**: schema-bump-or-not — does `tj:floatingGroups` already carry an ordering field? R2 first action.
- No PM agent needed in Wave 0 — design already locked.

---

## Active Items

_B-131 closed `wontfix-not-repro` 2026-04-30 — moved to "Completed This Sprint" below._

_B-132 closed DONE 2026-04-30 — moved to "Completed This Sprint" below._

_B-133 closed DONE 2026-04-30 — moved to "Completed This Sprint" below._

_B-134 closed DONE 2026-04-30 — moved to "Completed This Sprint" below._

### [B-135] Cross-window Open Tabs drag (P3 — deferred stub)
- **Tier**: N/A — deferred stub, NO Sprint 40 work
- **Status**: 🔄 Filed only (Sprint 40 has zero work on this; documented for traceability)
- **Files Changed**: none
- **Notes**: filed alongside B-134 per CLAUDE.md scope-change-control (don't silently defer; file the followup). Out of B-134 v1 scope per Q3 decision (same-window only).

---

## Completed This Sprint

### ✅ B-134 — Drag-and-drop reorder for open + floating tabs (P2 anchor · Full M)
- **Status**: DONE 2026-04-30 — Full pipeline complete. R1 LOCKED at brainstorm → R2 chapter 63 (1,103 lines) → R3 build (~1,300 LOC + 26 tests) → R4 (4 HIGH, 12 MEDIUM, 14 LOW across 3 reviewers) → Wave 3a fix-round (4 HIGH closed) → R5 UAT plan (19 cases) + 1 gap test → R6 As-Built §63.18 + R7 docs.
- **Files Changed**: 8 source (`shared/messages.js` · `background/storage/{shapes.js, migration.js}` · `background/tabs/{floating-groups.js, floating-members.js}` · `background/messages/storage-handlers.js` · `sidepanel/{sidepanel.js, sidepanel.css}`); 4 test (`tests/b134-tab-drag-reorder.test.js` new (32 tests T1-T31), `tests/floating-shape.test.js`, `tests/migration-steps.test.js`, `tests/chrome-mock.js`); design `docs/design/63-b-134-tab-drag-reorder.md` (R2 + §63.18 As-Built); `docs/UAT_B-134.md` (19 cases). Plus R7 docs: CHANGELOG / STORE_LISTING / docs/user-manual/managing-items.md.
- **What shipped**: 5 drag ops in sidepanel — (1) Open Tabs reorder same window via `chrome.tabs.move`; (2) within-floating reorder via new `MSG_REORDER_FLOATING_MEMBERS`; (3) ATTACH (Open→Floating) via new `MSG_MOVE_FLOATING_TAB` + `markInherited(tabId)` lock; (4) DETACH (Floating→Open) + `pruneInherited(tabId)`; (5) cross-group MOVE atomic single-message. Cross-window REJECT silent. 3-branch race-guard (B-122 §62.9 F-5 pattern).
- **Schema bump**: `tj:floatingGroups` v2 → v3 — added `sortOrder: number` per record. Lazy migration; legacy v2 records readable via `(windowId, tabIndex)` fallback. C-1a (`KNOWN_VERSION` + `defaultShape`) + C-1b (eager / lazy / no-op chosen: lazy) compliance verified. SW module-cache flush note in CHANGELOG v1.34.0.
- **Wave 3a fix-round resolutions** (4 HIGH closed): H-1 race-guard B over-trip → content-conditional gen bumps via signature setter guards · H-2 `MSG_REORDER_FLOATING_MEMBERS` ERR_RACE silent fail → toast on race + validation · H-3 REJECT indicator stuck-position → exclude REJECT from skip-no-op · H-4 REORDER_FLOATING midline math includes dragged row → exclude in both `_computeTabDropTarget` and `_resolveTabDragIndicatorY`.
- **R5 UAT plan**: `docs/UAT_B-134.md` — 19 cases (UAT-1..UAT-19) covering all 5 ops + 4 Wave 3a regression guards + edge cases.
- **Tests**: 1,734 → 1,778 (+44 across the B-134 lifecycle).
- **Deferred MEDIUMs/LOWs** documented in As-Built §63.18 — payload upper-bound hardening (security M-1/M-2/M-3), parentItemId re-anchor reconciliation (decided in favor of as-built per §63.18.2), 4 qa polish items.

### ✅ B-132 — Cold-start claim-jump fix (P1 anchor · Full M)
- **Status**: DONE 2026-04-30 — Full pipeline complete. R0 spike chapter 64 (1,103 lines) → R1 (8 ACs) → R2 chapter 65 (1,047 lines) → R3 build (~117 LOC + 8 tests) → R4 (0 CRIT/HIGH/MEDIUM from code+security; 2 MEDIUM from qa) → Wave 3a fix-round (qa M-1 + M-2 closed) → R5 UAT plan (9 cases) → R6 As-Built §65.14.
- **Files Changed**: source `background/tabs/{floating-groups.js, index.js, tab-claims.js}`; tests `tests/b132-cold-start-inheritance.test.js` (new, 8 tests T-132-A..H), comment-only edits to `tests/floating-multi.test.js`, `tests/floating-position.test.js`, `tests/floating-ready-gate.test.js`, `tests/b018-persistence.test.js`; design `docs/design/64-b-132-r0-spike.md` (R0) + `docs/design/65-b-132-cold-start-claim-jump-fix.md` (R2 + §65.14 As-Built); `docs/UAT_B-132.md` (9 cases).
- **What shipped**: Mode (b) URL-collision claim-jump fix — new `preMarkInheritedFromFloatingGroups()` helper runs at cold-start BEFORE `reconcileClaims`, populating `inheritedTabs` Set from persisted `tj:floatingGroups` records. New Phase 2 gate in `reconcileClaims` skips candidates already in `inheritedTabs` (mirrors B-125 `reevaluateTab` gate pattern). Pre-existing floating tabs survive extension reload without claim-jumping.
- **AC3 deep-chain carve-out**: post-reload multi-hop opener-spawned tabs land in Open Tabs section (structural — `openerMap` is in-memory only). Documented across THREE surfaces (R0 §64.6, R2 §65.7, inline JSDoc on helper). Future-reader cannot mistake for unpatched vulnerability.
- **R2-VERIFY 1**: `chrome.storage.session` wipe behavior on extension reload — confirmed at R2 §65.2 via internal consistency analysis (deferred to UAT-4 for empirical SW-console verification; fix correct under either verdict).
- **Wave 3a fix-round resolutions** (2 MEDIUM closed): qa M-1 → comment blocks on 3 sibling tests with same URL-collision pattern · qa M-2 → try/catch wrap on cold-start helper for graceful degradation.
- **R5 UAT plan**: `docs/UAT_B-132.md` — 9 cases (UAT-1..UAT-9) covering Mode-b primary fix + Mode-a regression + AC3 carve-out + R2-VERIFY 1 empirical.
- **No schema bump, no new permissions, no new message contracts**.
- **Tests**: 1,769 → 1,778 (+9 across the B-132 lifecycle: 8 in T-132-A..H + 1 commented edit pin).

### ✅ B-133 — Open Tabs dotted-green indicator (Fast Track XS)
- **Status**: DONE 2026-04-30 — Fast Track DoD met. R3 build complete + R4 [code-reviewer] CLEAN + R4 [security-reviewer] CLEAN (qa skipped per Fast Track tier).
- **Files Changed**: `sidepanel/sidepanel.css` (lines 1680-1691 — comment block + rule body edit on `.item-row[data-live-only="true"]`); `tests/b133-open-tabs-dotted.test.js` (new, 87 lines, 2 tests T-133-A + T-133-B)
- **Tests**: 1,732 → 1,734 (+2)
- **Visual taxonomy now consolidated**: solid-green = persistent (saved bookmark, currently live); dotted-green = ephemeral (floating tab in group OR Open Tabs section row).
- **Bonus architectural fix**: the latent CSS-specificity fragility flagged at R1 (floating rows matching both `[data-floating]` and `[data-live-only]` at equal specificity, with source order making `--live-indicator` win) is incidentally fixed — both rules now bind `--floating-bar-color`. Any future yellow/per-theme swap propagates consistently.
- **Cross-surface verification**: newtab and popup confirmed without left-side border on Open Tabs rows (no-op per R1 R2-VERIFY).
- **R4 findings**: 0 CRIT/HIGH/MEDIUM/LOW from both reviewers.

### ❌ B-131 — Floating tab title-displacement (closed `wontfix-not-repro`)
- **Status**: CLOSED 2026-04-30 — `wontfix-not-repro` per product-owner decision after Wave 0 [product-manager] verify-first analysis
- **Verdict**: structurally cannot reproduce in v1.33.1. Strict tabId-keyed mapping at every layer (LiveTabIndex tabId-keyed; `buildFloatingMembers` first-match-wins on tabId; row reuse keyed by tabId; patch path row-scoped by tabId) — no pathway for cross-row title bleed.
- **Likely actual observation**: empty-title window during `chrome.tabs.onCreated` (Chrome delivers `tab.title === ''` initially → first paint falls back to URL string or `'Untitled tab'`, NOT a sibling's title). Different (much smaller) UX concern. Not filed as new item per product-owner decision: "if this comes back up naturally, i will open a new bug."
- **B-130 hotfix impact**: orthogonal. Hotfix removed `.item-floating-bar` element + defensive re-attach + CSS; touched zero title-rendering paths.
- **Confidence**: HIGH (Wave 0 [product-manager] static-analysis verdict).
- **Files Changed**: none (no code change). Analysis recorded in `docs/findings/sprint-40.md`.
- **Sprint capacity impact**: ~M-tier item closed in Wave 0 → freed capacity for B-132 + B-134 + B-133.

---

## Blockers

*None.*

---

## Gate 4 — Release Checklist (verified 2026-04-30)

- ✅ All R4 review findings resolved — 4 HIGH on B-134 closed in Wave 3a fix-round (H-1 race-guard scoping; H-2 ERR_RACE toast; H-3 REJECT cache key; H-4 midline excludes dragged row); 2 MEDIUM on B-132 closed in Wave 3a (qa M-1 sibling-test comments; qa M-2 try/catch wrap); MEDIUMs documented as deferred in As-Built sections + `docs/findings/sprint-40.md`.
- ✅ All R5 automated tests passing — **1,778/1,778 PASS**. Net delta from S39 baseline 1,734: +44 tests.
- ✅ UAT plans authored: `docs/UAT_B-132.md` (9 cases), `docs/UAT_B-134.md` (19 cases). Manual UAT by product-owner pending — NOT blocking close per established pattern.
- ✅ No open blockers
- ✅ R6 As-Built sections appended: `docs/design/63-b-134-tab-drag-reorder.md` §63.18 + `docs/design/65-b-132-cold-start-claim-jump-fix.md` §65.14
- ✅ `docs/SOLUTION_DESIGN.md` TOC updated for chapters 63 + 64 + 65
- ✅ `manifest.json` permissions reviewed — no additions
- ✅ `./build.sh` clean (release-manager will re-run with version bump)
- ✅ Rollback plans documented in As-Built §63.18 + §65.14
- ✅ R7 docs updated: `CHANGELOG.md` v1.34.0 entry **with mandatory C-1a SW module-cache flush note** for `tj:floatingGroups` v2→v3 schema bump (B-134) + `STORE_LISTING.md` surgical bullets + `docs/user-manual/managing-items.md` extended (drag-reorder section + B-132 reload-limitation note + visual-taxonomy clarification)
- ✅ `BACKLOG.md` updated — all 5 items: B-131 `wontfix` | 40, B-132 `done` | 40, B-133 `done` | 40, B-134 `done` | 40, B-135 `backlog | TBD` (deferred stub)
- ✅ `BACKLOG_BOARD.md` updated — progress 96% (127/134); status summary recalculated
- ✅ `SPRINT.md` "Completed This Sprint" section reflects all 4 finished items + 1 wontfix closure

**Gate 4 status: PASS** — sprint may close.

---

## Sprint Retrospective — Sprint 40 (Gate 7)

### Velocity
- **Planned**: 5 items / ~8.5–13 effort units (1×P1 verify-first + 1×P1 M-Spike-First + 1×P3 XS + 1×P2 M + 1 deferred stub)
- **Completed**: 4 items / ~7-8 effort units (B-131 closed in Wave 0 saved ~3 units; B-132 came back M Full not XL Spike-First; B-134 hit the 4 HIGH finding fix-round adding ~0.5 unit)
- **Carried over**: 0 items (B-135 deferred stub stays in backlog as planned)
- **Test count delta**: 1,734 → 1,778 (+44 tests across the sprint)

### What Went Well
- **R0 spike merged for B-132** — discovery completed in Wave 0 alongside R1 work; verdict came back M Full (not XL Spike-First), saving sprint capacity. Pattern: when a P1 bug touches a known-tricky subsystem, R0-in-Wave-0 is faster than serial R0→R1.
- **B-131 verify-first saved ~3 effort units** — Wave 0 [product-manager] static-analysis verdict (HIGH confidence: structurally cannot reproduce) closed the bug as `wontfix-not-repro` without sinking R2/R3 effort. Pattern worth keeping for any P1 bug where repro is uncertain post-fix-of-related-issue.
- **R1 LOCKED at brainstorm for B-134** — saved an entire round-trip; R2 chapter 63 dropped in directly per the locked design. Visual-companion offer wasn't needed (decision-tree style) but the brainstorm Q1-Q5 sequence was crisp.
- **Cross-reviewer convergence at R4 surfaced 4 HIGH findings cleanly** — qa-reviewer caught the gen-counter over-trip (H-1) which would have been a UX-blocker had it shipped. Validates the "3 reviewers in parallel" Gate 1 pattern.
- **Toolchain hygiene fix shipped** (S39 retro action item) — `docs/findings/sprint-40.md` pre-created at kickoff; agents wrote findings without permission-prompt friction. 0 file-write denials this sprint.
- **Schema-bump compliance worked** — C-1a + C-1b governance applied cleanly for `tj:floatingGroups` v2→v3 lazy migration; SW module-cache flush note in CHANGELOG v1.34.0 per precedent.

### What to Improve
- **Gen-counter over-trip near-miss** — H-1 (race-guard B over-trips on title/audible/active changes) was a substantial UX bug that almost shipped. R3 didn't think about cache-write granularity vs drag-state stability when implementing the gen counter pattern. Improvement: when introducing in-memory cache invalidation for drag-state guards, R2 should explicitly enumerate "what counts as a relevant change" for each guard. Filed as B-136 candidate for Sprint 41 retro piggyback (CLAUDE.md R2 charter addition).
- **B-134 R3 docstring vs R2 deviation (parentItemId re-anchor)** — code-reviewer M-4 flagged a deviation from R2 §63.8.2 pseudocode. R6 reconciliation decided in favor of the as-built behavior (more correct), but the deviation surfaced at R4 not at R3. Improvement: R3 STOP-and-escalate (B-127) should also fire when R3 finds R2 spec is incorrect, not just when deferring AC-locked behavior. Filed as B-137 candidate for Sprint 41 retro piggyback.
- **R2-VERIFY 1 deferred to UAT** — chrome.storage.session wipe-on-reload empirical confirmation pushed to UAT-4. Acceptable since fix is correct under either verdict, but ideally R2 would have a way to verify environment behavior without UAT round-trip. Improvement: consider adding an "R2 environment probe" pattern — small standalone scripts that R2 can run via the SW console to empirically verify Chrome/Edge behavior without requiring UAT. Defer to backlog triage.

### Action Items for Next Sprint
- [ ] **B-136 candidate**: CLAUDE.md R2 charter addition — for any drag-state / cache invalidation contract, R2 must enumerate "what changes count as gen-counter-relevant" to prevent the H-1 over-trip class.
- [ ] **B-137 candidate**: CLAUDE.md R3 STOP-and-escalate (B-127) extension — fire when R3 finds R2 spec is incorrect, not just for AC-locked deferrals. Mirrors B-127 origin (B-121 silent deferral). Filed as P3/XS Fast Track for Sprint 41.
- [ ] Pre-existing S39 retro candidates **B-138/B-139** (R3 cross-surface diff self-check + R3 deferred-to-UAT cheap-fix check) still pending file. Bundle with B-136/B-137 in Sprint 41 retro Wave 1 piggyback.


---

## Pipeline Plan

**Wave 0 (parallel — 3 agents)**:
- B-131 verify-first [product-manager] — load v1.33.1 in Edge, attempt repro, produce verdict
- B-132 R0 [solution-architect] — discovery spike on SW-memory persistence + cold-start re-bind
- B-133 R1 [product-manager] — tight ACs with B-118 source-citation gate

B-134 already R1 LOCKED — no Wave 0 agent needed.

**Wave 1 (B-131 branch decision)**:
- If not-repro → static-analysis review → close `wontfix-not-repro`. Done. Removed from active items.
- If repro → continue Full pipeline through R2/R3/R4/R5/R6.

**Wave 2 (parallel R2 — anchors)**:
- B-132 R2 [solution-architect] — chapter for SW-memory persistence story (chapter # TBD)
- B-134 R2 [solution-architect] — `docs/design/63-b-134-tab-drag-reorder.md`; first action is R2-VERIFY 1 (schema bump or not)

**Wave 3 (parallel R3 — build)**:
- B-132 R3 [frontend-engineer]
- B-134 R3 [frontend-engineer]
- B-133 R3 [frontend-engineer] — bundleable with B-134 R3 (both touch sidepanel CSS)

**Wave 4 (parallel R4 — review)**:
- 3 reviewers (code + security + qa) for B-132 + B-134 (M tier, all 3 mandatory per CLAUDE.md Gate 1)
- 2 reviewers (code + security; qa skipped per Fast Track) for B-133

**Wave 5 (R5 + R6 + R7 + close)**:
- R5 [test-engineer] writes UAT plans for B-132 + B-134 + integration tests
- R6 [solution-architect] As-Built sections appended
- R7 [technical-writer] CHANGELOG + STORE_LISTING + user-manual updates
- Sprint close: Gate 4 → Gate 7 retrospective → [release-manager] v1.34.0 → archive

---

## Pending UAT (Sprint 36 + Sprint 37 + Sprint 38 + Sprint 39 + v1.33.1 + Sprint 40 — carry-forward tracking)

Product-owner manual UAT in Edge for v1.30.0 + v1.31.0 + v1.32.0 + v1.33.0 + v1.33.1 + v1.34.0 (planned). Not blocking sprint close per established pattern, but should be cleared before any v2 → main merge.

- **Sprint 36 (v1.30.0)**: B-107..B-115 — UAT pending
- **Sprint 37 (v1.31.0)**: B-117 UAT-1..UAT-10 pending (`docs/UAT_B-117.md`)
- **Sprint 38 (v1.32.0)**: B-125 UAT-1..UAT-8 pending (`docs/UAT_B-125.md`) · B-121 UAT-1..UAT-15 pending (`docs/UAT_B-121.md`)
- **Sprint 39 (v1.33.0)**: B-124 UAT-1..UAT-13 pending (`docs/UAT_B-124.md`) · B-122 UAT-1..UAT-10 pending (`docs/UAT_B-122.md`)
- **Sprint 40 (v1.34.0)**: B-132 + B-134 UAT plans authored at R5 (this sprint)

---

## Backlog (Sprint 41+ candidates)

After S40 close — pending product-owner triage:

- **B-041** Sync tab order (P2/L · pre-S33) — last big v2 feature item; may absorb B-135 cross-window drag
- **B-076** MIGRATION_STEPS hook (P2/S · pre-S33) — passive future-work placeholder
- **B-086** Sidepanel UI/UX umbrella (P3/M · pre-S33)
- **B-135** Cross-window Open Tabs drag (P3 · deferred from B-134 v1 scope)
- **S39 retro action items** still pending file (R3 cross-surface diff self-check + R3 deferred-to-UAT self-check) — file as `B-???` after S40

---

## Pre-flight reminders for S40 execution

When [scrum-master] launches Wave 0:
- 3 agents in parallel (single message): B-131 verify, B-132 R0, B-133 R1
- All apply **B-118 source-citation gate** (every R1/R0 source-code claim cites `file:line` or is marked `R2-VERIFY`)
- B-132 R0 is the highest-risk path — possible auto-upgrade to XL Spike-First if discovery surfaces complexity
- B-131 verify-first is the highest-uncertainty path — outcome determines whether item joins full pipeline or closes
- B-134 R1 already LOCKED; no Wave 0 work; SPRINT.md routes directly to R2 once Wave 0 + Wave 1 complete

---

## Gate 6 — Sprint Readiness Verification

- ✅ Total sprint effort fits — 8.5–13 effort units (8.5 best case, 13 worst case if all risks fire). Comparable to S38 (6) and S39 (7); slight stretch but manageable. Mitigation: defer B-134 to S41 if B-132 R0 spike comes back as XL.
- ✅ No unresolved blockers from S39 / v1.33.1 hotfix
- ✅ Deps-resolved check:
  - **B-131** deps: B-013 ✅, B-018 ✅, B-121 ✅, B-124 ✅
  - **B-132** deps: B-013 ✅, B-018 ✅, B-121 ✅, B-125 ✅
  - **B-133** deps: B-124 ✅, B-130 ✅
  - **B-134** deps: B-031 ✅, B-122 ✅, B-121 ✅, B-125 ✅, B-130 ✅
- ✅ All sprint items in BACKLOG.md flipped to `in-progress | 40` at kickoff
- ✅ SPRINT.md "Active Items" populated (this section)
- ✅ B-134 R1 design Q&A LOCKED at brainstorm — saves 1 round-trip vs deferring to mid-R1
- ✅ Findings file `docs/findings/sprint-40.md` pre-created (S39 retro toolchain hygiene action item)

**Gate 6 status: PASS** — Sprint 40 ready to launch Wave 0.
