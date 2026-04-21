# Current Sprint

*Sprint 23 — Drag foundation v2 (B-030) + drag helpers (B-009 + B-033). Closed 2026-04-21 with v1.17.0.*

Second attempt at the drag foundation after the S22 revert — this time with every Sprint 22 retro action item explicitly applied at kickoff. Pre-merge UAT caught two blocker bugs that R4 smoke-check alone would have shipped (the exact failure mode from S22). Retro discipline validated in the very next sprint.

---

## Sprint Readiness (Gate 6) — verified at kickoff

- ✅ Scope: B-030 L (Spike-First) + B-009 S + B-033 S
- ✅ Deps-resolved check: B-030's deps shipped (B-001, B-008); B-009 + B-033 deps in-sprint
- ✅ Post-revert baseline restored: 979/979 tests green on `release/v2`

---

## Retro Action-Item Application (explicit — verified applied)

Per Sprint 22 retrospective:

| # | Action | Applied |
|---|--------|---------|
| HIGH-1 | R2 perf decisions as R3 ACs | ✅ ACs 16–19 (getBoundingClientRect outside rAF = REJECT) |
| HIGH-2 | R1 authors per-feature UAT plans | ✅ `UAT_B-030.md` (9 cases w/ perf probes), `UAT_B-009.md` (6), `UAT_B-033.md` (6) |
| HIGH-3 | L items require PRE-MERGE UAT | ✅ B-030 UAT round 1 → 2 bugs found → round 2 9/9 PASS before merge |
| MEDIUM-1 | Fake-DOM drag simulation | ✅ Drop-resolution simulation in `sort-order.test.js` (AC20) |
| MEDIUM-2 | Same-group reorder dedicated test | ✅ AC21 three-destination in `sort-order.test.js` |
| LOW | Feature-flagged DRAG_DEBUG | ✅ Present; default false; flipped during R3 debug pass |

---

## Completed This Sprint

### [B-030] Item drag-reorder v2 (Full tier L, Spike-First) — DONE
- **Closed**: 2026-04-21 · **Merged**: `791d50e` (PR #28)
- **Pipeline**: R0 spike ✅ (`fabbee5`) · R1 ✅ (`68364a8` — ACs 1-24 + 3 UAT plans) · R2 ✅ (`2272f3a` — 6 binding contracts) · R3 ✅ (`fedd24d` — initial build) · PRE-MERGE UAT Round 1 FAIL (2 blocker bugs) → **fixes** (`a558b41` — top:0 + explicit renderAll + cleanup order) · PRE-MERGE UAT Round 2 ✅ **9/9 PASS** · Merge ✅ (`791d50e`) · R6 ✅ (`25b7e52` — `docs/design/36-b-030-item-drag-reorder-v2.md`)
- **Files**: `shared/messages.js` (+MSG_BULK_REORDER_ITEMS), `shared/sort-order.js` (computeItemReorder), `background/storage/items.js` (bulkReorderItems), `background/storage/index.js`, `background/messages/storage-handlers.js`, `sidepanel/sidepanel.{js,css}`, `tests/sort-order.test.js` (14 tests), `tests/b030-item-drag-reorder.test.js` (8 backend tests)
- **Tests**: 979 → 1001 (+22)
- **UAT**: 9/9 PASS in Edge (round 2 after fixing indicator `top: 0` + explicit post-drop `renderAll` since B-052 hashItem doesn't include sortOrder)

### [B-009] Drag-to-expand collapsed group (Fast Track S) — DONE
- **Closed**: 2026-04-21 · **Merged**: `df4a024` (PR #29)
- **Pipeline**: R1 ACs ✅ · R3 ✅ · R4 ✅ (inline smoke)
- **Files**: `sidepanel/sidepanel.js` (+`_hoveredCollapsedGroup`, `_b009HoverState`, hover-hold timer in `_dragTick`)
- **UAT**: deferred to S28 comprehensive sweep (Fast Track S — product-owner option per HIGH-3)

### [B-033] Drag saved+live item to Open Tabs → demote (Fast Track S) — DONE
- **Closed**: 2026-04-21 · **Merged**: `df4a024` (PR #29)
- **Pipeline**: R1 ACs ✅ · R3 ✅ · R4 ✅ (inline smoke)
- **Files**: `sidepanel/sidepanel.js` (+`_computeDropTarget` Open Tabs branch with live-state guard, drop handler `pendingDropType === 'openTabs'` dispatches MSG_DEMOTE_ITEM), `sidepanel/sidepanel.css` (+`.open-tabs-section--drop-target` highlight)
- **UAT**: deferred to S28 comprehensive sweep (Fast Track S — product-owner option)

---

## Gate 4 — Release Checklist (verified 2026-04-21)

| # | Check | Status |
|---|-------|--------|
| 1 | All R4 review findings resolved | ✅ — 0 findings across all 3 items |
| 2 | All R5 automated tests passing | ✅ — **1001/1001** green on `release/v2` (post-Wave-1 merge `df4a024`) |
| 3 | UAT sign-off recorded | ✅ — B-030 9/9 PASS round 2 (pre-merge); B-009 + B-033 deferred to S28 per HIGH-3 tier rule |
| 4 | No open blockers | ✅ |
| 5 | `docs/design/*` slices updated | ✅ — §36 chapter for B-030 v2 authored (`docs/design/36-b-030-item-drag-reorder-v2.md`); §35 (B-007) + existing chapters unchanged |
| 6 | `manifest.json` permissions reviewed | ✅ — zero additions |
| 7 | `./build.sh` produces clean package | ✅ — 636 K zip, 67 files |
| 8 | Rollback plan documented | ✅ — §36.7 documents the pure `git revert` path (no schema migration) |
| 9 | README / user manual updated | ✅ — CHANGELOG [1.17.0] authored with 3 user-visible entries |
| 10 | `BACKLOG.md` — all Sprint 23 items `done` | ✅ (68/82) |
| 11 | `BACKLOG_BOARD.md` — progress dashboard accurate | ✅ (83%, 0 in-progress, Sprint 23 closed) |
| 12 | `SPRINT.md` "Completed This Sprint" reflects all 3 items | ✅ |
| 13 | `SPRINT_ARCHIVE.md` updated | ⏳ — post-release archive step |

**Gate 4 verdict**: PASS conditional on post-release archive.

---

## Sprint Retrospective — Sprint 23

### Velocity

- Planned: 3 items (1L + 2S)
- Delivered: 3 items — 100% of scope
- Revert count: 0 (vs S22's 1)
- Test growth: 979 → 1001 (+22)
- UAT rounds: B-030 = 2 (round 1 fail, round 2 pass); B-009 + B-033 deferred per tier rule
- Release: **v1.17.0** (the release S22 was meant to be)

### What Went Well

1. **Retro discipline validated on its first application**. Sprint 22 retro said "L items need pre-merge UAT in Edge" — Sprint 23 applied it — 2 blocker bugs caught before PR merge. Without that discipline, S22's failure mode would have repeated verbatim (indicator invisible + same-group no-render are the same class of bug that killed S22).
2. **R0 spike de-risked the architecture before R1**. Locking rAF coalescing + cached rects + transform indicator as the design pattern BEFORE writing ACs meant the S22 perf-note-ignored failure mode was structurally impossible — ACs 16-19 encode the approach.
3. **R1-authored UAT plans paid off**. The UAT plan's perf probe (UAT-6 — continuous 10-second drag) WAS the S22 regression case. Round 1 hit the right tests in the right order; fixes landed scoped to exactly what the probe surfaced.
4. **Backend reused byte-identical from S22**. The S22 revert taught that only sidepanel drag handlers had bugs; backend (`bulkReorderItems`, `MSG_BULK_REORDER_ITEMS`, `computeItemReorder`) had shipped clean. S23 re-used those files verbatim via `git show` — saved real time and preserved known-good test coverage.

### What to Improve

1. **MEDIUM — R2 specs should embed their CSS requirements explicitly**. My R2 said "indicator is `position: absolute` + transform-positioned" but missed `top: 0`. An absolute element without `top` defaults to `auto` (flow position) → indicator rendered invisibly below content. Fix shipped as D-1. For S24+ drag work: R2 MUST enumerate every required CSS property for positioned elements, not just structural strategies.
2. **MEDIUM — B-052 hashItem semantics surfaced a render-path blind spot**. Same-group reorder returned `deltaType: 'noop'` from `diffAndPatch` because `hashItem` only considers `{id, title, url, groupId}` — not sortOrder. Drop handler now explicitly calls `renderAll` after `MSG_BULK_REORDER_ITEMS`. A cleaner long-term fix: add `sortOrder` to hashItem OR surface a `forceRender: true` flag on the broadcast. Tracked as a known follow-up in §36.8.
3. **LOW — UAT plan drift watch**. Not this sprint, but Sprint 22 UAT plan text referenced a non-existent "overflow menu" (B-042). A plan-correction pre-pass before S28 comprehensive UAT is still an open retro action from S21 — carry forward.

### Action Items for Sprint 24 (drag stack)

- [ ] **[scrum-master]** S24 scope = B-025 multi-item drag + B-031 group drag-nest + B-032 auto-scroll. Per P-3 (max 2 M parallel) + P-2 (S pairs with M). All three sit on the B-030 drag pipeline shipped in S23 — can reuse `_dragRectCache` + `_scheduleDragTick` + `_computeDropTarget` with extensions. [HIGH]
- [ ] **[solution-architect]** R2 for each S24 item: enumerate CSS requirements explicitly (not just "transform-positioned") per lesson 1 above. [MEDIUM]
- [ ] **[product-manager]** Continue R1-authored UAT plans for every item. B-031 reuses `filterGroupParentCandidates` from Sprint 20 B-007 per Sprint 21 retro action. [MEDIUM]
- [ ] **B-031 note**: S22 retro LOW action — group drag-nest path should reuse B-007's `filterGroupParentCandidates` helper (same depth-1 + cycle + children-of exclusions). Not a blocker; efficiency gain. [LOW]

### R4 Findings Summary (Sprint 23)

- **B-030**: R4 smoke-check 0 findings; round 1 pre-merge UAT caught 2 bugs → round 2 post-fix clean
- **B-009**: R4 smoke-check 0 findings
- **B-033**: R4 smoke-check 0 findings
- **Total**: 0 CRITICAL / 0 HIGH / 0 MEDIUM / 0 LOW at automated-review layer. 2 blocker bugs at UAT layer (both fixed pre-merge).

**Key lesson**: R4 smoke-check cleanliness does NOT mean zero bugs. For L-tier runtime-sensitive features, pre-merge UAT in-browser is load-bearing, not optional.

---

## Sprint Close

**Status**: CLOSED 2026-04-21. v1.17.0 release pending tag + archive.

### Follow-on for Sprint 24 (per FEATURE_PARITY_ROADMAP.md)

S24 theme: **Drag stack** — B-025 multi-item drag (M) + B-031 group drag-reorder+nesting (M) + B-032 auto-scroll (S). All three sit on the B-030 drag pipeline. P-3 max two M + P-2 S pairs with M.
