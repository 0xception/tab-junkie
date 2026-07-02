# Current Sprint — Sprint 48: Unified Item Model — Render Bundle (B-194 Sprint A)

**Goal:** Merge the two split top-level pipelines (synthetic `__ungrouped__` section for saved ungrouped bookmarks + separate Open Tabs section for live unsaved tabs) into ONE top-level catch-all region, and enable floating tabs to anchor under top-level/ungrouped bookmarks (**B-185 falls out for free**). This is the render-layer half of the B-194 unified-item-model epic; the identity cutover + schema slim (B-198/B-199) are **Sprint B**, deferred per P-1.

**Epic:** B-194 (Spike-First XL). R0 spike: `docs/design/78-unified-item-model-r0-spike.md`.
**Storage decision:** **Option B — LOCKED** (keep `tj:floatingGroups` a distinct store; unify model + resolution + render only; loose tabs stay pure-live/zero-storage). **No schema bump this sprint** (semantics/render only; the one v9→v10 slim is deferred to B-199/Sprint B).
**Baseline:** v1.42.1 on `release/v2` · tests **2158 PASS** · schema **v9**.
**Sequence:** B-186 (prereq) → B-195 (safety net) → B-196 (render merge) → B-197 (=B-185).
**R1 ✅ COMPLETE** (`docs/sprint-48-r1.md`) — B-186 + B-195 DoR-ready; B-196 at R2 (Q1/Q2 = product-owner UX decisions); B-197 at R2 (Q3 = architect, B-191 forward-compat).

---

## Active Items

### [B-186] Renumber `LiveTabIndex.index` survivors on tab close
- **Tier**: Fast Track (S)
- **Status**: R1 ✅ · **DoR-ready — cleared for R3 build** (Fast Track; R2 skipped — no schema/message/permission change)
- **Assigned To**: [frontend-engineer] (R3, on go)
- **Blockers**: none
- **Feature Context**:
  - Prerequisite for the render merge — the loose (open-tab) tail orders by `(windowId, tabIndex)`, which reads stale indices today.
  - Root cause CONFIRMED in code: `removeTabEntry` (`background/tabs/live-tab-index.js:74`) deletes without renumbering survivors; Chrome emits no `onMoved` for the implicit shift-down (`tab-events.js:343` cascade also skips it).
  - Fix: on single-tab close, decrement `index` for surviving same-window entries above the removed slot (or recompute).
- **Handoff Notes**: Well-understood; Fast Track pipeline (R1 → R3 → R4 code+security → done). Regression test required (test-first per the confirmed root cause).
- **Files Changed**: _(pending)_
- **Parallel Opportunity**: S item — can run alongside B-195 per P-2.

### [B-195] Safety-net integration test for the unified top-level region
- **Tier**: Full (M) — test-only, no production behavior change
- **Status**: R1 ✅ · **DoR-ready** (test-first net; R2 = one-pass fixture-contract check). 6 fixture states enumerated; T5/T6/T7 marked B-197-EXTEND.
- **Assigned To**: [solution-architect] (R2 fixture check) → [test-engineer] (build)
- **Blockers**: none
- **Feature Context**:
  - The regression net that must exist and pass against current code BEFORE the B-196 render merge (mirrors B-174's role for B-173, and B-187 for the §77 Tier-A work).
  - Seeds saved-ungrouped + floating-under-ungrouped + loose + claimed/dormant; asserts the unified top-level region renders in correct head (renderOrder) + tail (live-ordered) order AND floating resolution is single-sourced. Folds the mock-reproducible B-185 subset.
- **Handoff Notes**: Written by [test-engineer] at R5 normally, but as an A0 safety net it is defined at R1 and BUILT before B-196 — test-first discipline. Uses `tests/chrome-mock.js` only.
- **Files Changed**: _(pending)_
- **Parallel Opportunity**: Can interleave with B-186.

### [B-196] Render merge — single top-level catch-all (sidepanel + newtab)
- **Tier**: Full (L) — **REHOME item** (moves Open Tabs + `__ungrouped__` DOM into one region → R1 selector-audit subsection MANDATORY)
- **Status**: R1 ✅ · **R2 IN PROGRESS** — Q1 **fully-merged (no divider)** + Q2 **below the named groups** LOCKED by product-owner 2026-07-01. R2 resolves Q4 (empty-state under no-divider) + the mandatory fix-scope test enumeration (R1 found 12 test files).
- **Assigned To**: [solution-architect] (R2)
- **Blockers**: depends on B-195 (net) + B-186 (loose-tail correctness) — both in-sprint
- **Feature Context**:
  - Replace the `__ungrouped__` synthetic section (`sidepanel.js:2285-2302`) + `buildOpenTabsSection` (`sidepanel.js:3455`) with ONE top-level catch-all region: renderOrder head (anchored/saved) + live-ordered tail (loose open tabs). Same content, one region. Applies to sidepanel AND newtab.
  - Visual variant (Q1: fully-merged vs subtle saved/unsaved divider) → decide at R2, confirm at UAT. Region placement (Q2: above/below groups) → R2.
- **Handoff Notes**: Largest item; sequence AFTER B-186 + B-195. Cross-surface diff self-check (sidepanel vs newtab) required at R3.
- **Files Changed**: _(pending)_
- **Parallel Opportunity**: None — the L item; runs solo per P-1.

### [B-197] Top-level/ungrouped floating anchoring (absorbs B-185)
- **Tier**: Full (M/L)
- **Status**: R1 ✅ · **R2 IN PROGRESS** — resolving Q3 (null-group `renderOrder` owner: sentinel `__toplevel__` vs per-item vs null-id Group; B-191 forward-compat) + Q5 (floatingMembers sentinel key). Q1/Q2 locked (see B-196).
- **Assigned To**: [solution-architect] (R2)
- **Blockers**: **Q3 — the null-group `renderOrder` owner is undesigned** (sentinel `__toplevel__` record vs per-item order). Design decision at R2, **forward-compatible with the deferred B-191** (renderOrder-sole-authority). B-191 itself is NOT a prerequisite — only the design must not paint B-191 into a corner. Owner: [solution-architect] at R2.
- **Feature Context**:
  - Anchor = `parentItemId`; `groupId` becomes derived/nullable. `buildFloatingMembers` (`floating-members.js:35`) stops skipping ungrouped parents; `resolveFloatingOpener`/`walkOpenerChain` drop the non-empty-groupId requirement; `moveFloatingTab` gains ATTACH-to-top-level.
  - **B-185 is fully subsumed here** — "float under a top-level bookmark" is the direct outcome.
- **Handoff Notes**: Depends on B-196's merged region existing. R2 must resolve Q3 before R3.
- **Files Changed**: _(pending)_
- **Parallel Opportunity**: Runs after B-196.

---

## Gate 6 — Sprint Readiness

- ✅ **Deps-resolved check**: B-186 (none) · B-195 (none) · B-196 (deps B-195 + B-186, both in-sprint) · B-197 (dep B-196 in-sprint). **One flag:** B-197's Q3 (null-group renderOrder owner) coordinates with the deferred **B-191** — resolved as a *design-compatibility* constraint at B-197 R2 (B-191 is not a hard prerequisite; the Q3 representation must be forward-compatible). Product-owner acknowledged at scoping.
- ✅ **Effort fits**: 1×S + 1×M(test) + 1×L + 1×M/L, sequenced (P-1 one L/XL active at a time; B-186+B-195 interleave per P-2/P-3). Identity cutover deferred to Sprint B.
- ✅ **Active Items populated** (above). Backlog rows B-195/196/197 created; B-185 subsumed by B-197; B-186 pulled in.
- ⏳ **DoR** per item: pending R1 ([product-manager]) — stories, ACs, priority/effort, deps, R2 architecture (Full items), + the B-196 rehome selector-audit subsection.

**Prior-sprint carryover NOT in this sprint** (remain backlog): B-181, B-182 (open-tab window-filter bugs — candidates to re-test after B-196 since it rewrites the open-tab render surface); B-183 (co-lands as B-199 in Sprint B); B-193 (doc refresh); B-191/B-192 (display-order Tier-B).

---

## Completed This Sprint

_None yet._

---

_Sprint 47 (B-173 identity epic) full detail, velocity, and Gate 7 retrospective are archived in `docs/SPRINT_ARCHIVE.md`. v1.42.1 (B-184 + §77 Tier-A) shipped as a post-S47 follow-on bundle (no formal sprint)._
