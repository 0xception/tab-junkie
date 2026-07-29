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
- **Status**: **✅ DONE** 2026-07-01 — R3 ✅ (test-first) · R4 ✅ [code-reviewer] + [security-reviewer] clean (contract-diff clean, 0 CRIT/HIGH, 2 LOW fixed) · suite 2168 PASS
- **Assigned To**: — (complete)
- **Blockers**: none
- **Feature Context**:
  - Prerequisite for the render merge — the loose (open-tab) tail orders by `(windowId, tabIndex)`, which reads stale indices today.
  - Root cause CONFIRMED in code: `removeTabEntry` (`background/tabs/live-tab-index.js:74`) deletes without renumbering survivors; Chrome emits no `onMoved` for the implicit shift-down (`tab-events.js:343` cascade also skips it).
  - Fix: on single-tab close, decrement `index` for surviving same-window entries above the removed slot (or recompute).
- **Handoff Notes**: Well-understood; Fast Track pipeline (R1 → R3 → R4 code+security → done). Regression test required (test-first per the confirmed root cause).
- **Files Changed**: `background/tabs/live-tab-index.js` (`renumberAfterRemoval`), `background/tabs/tab-events.js` (`onRemoved` wiring), `tests/b186-livetab-index-renumber.test.js` (new, 10 tests)
- **Parallel Opportunity**: S item — can run alongside B-195 per P-2.

### [B-195] Safety-net integration test for the unified top-level region
- **Tier**: Full (M) — test-only, no production behavior change
- **Status**: **✅ DONE** 2026-07-02 — 11-test safety net GREEN against current code (6 stable invariants incl. the single-source partition + 4 B-197-EXTEND + 1 B-186-GATE); suite 2179 PASS. [scrum-master]-reviewed: real net, no illusory asserts.
- **Assigned To**: — (complete)
- **Blockers**: none
- **Feature Context**:
  - The regression net that must exist and pass against current code BEFORE the B-196 render merge (mirrors B-174's role for B-173, and B-187 for the §77 Tier-A work).
  - Seeds saved-ungrouped + floating-under-ungrouped + loose + claimed/dormant; asserts the unified top-level region renders in correct head (renderOrder) + tail (live-ordered) order AND floating resolution is single-sourced. Folds the mock-reproducible B-185 subset.
- **Handoff Notes**: A0 net BUILT before B-196 (test-first). **B-196 must keep all 11 green; B-197 must flip the 4 B-197-EXTEND tests** (it touches `buildFloatingMembers`/opener resolution). Uses `tests/chrome-mock.js` only.
- **Files Changed**: `tests/b195-unified-top-level-net.test.js` (new, 11 tests)
- **Parallel Opportunity**: Can interleave with B-186.

### [B-196] Render merge — single top-level catch-all (sidepanel + newtab)
- **Tier**: Full (L) — **REHOME item** (moves Open Tabs + `__ungrouped__` DOM into one region → R1 selector-audit subsection MANDATORY)
- **Status**: **✅ DONE** 2026-07-10 — R3 ✅ (`bf55cfe`) · R4 ✅ (security CLEAN; code+qa found H-1 + H-2) · R4 fix-round ✅ resolved H-1 (incremental `__toplevel__` renderOrder) + H-2 (collapse-tail) + folded M-1..M-4; `deriveTopLevelRenderOrder` extracted to `shared/render-order.js`. Suite 2197 PASS (+18). [scrum-master] verified both HIGH fixes.
- **Assigned To**: — (complete)
- **Blockers**: none (B-195 ✅ + B-186 ✅ both done)
- **Feature Context**:
  - Replace the `__ungrouped__` synthetic section (`sidepanel.js:2285-2302`) + `buildOpenTabsSection` (`sidepanel.js:3455`) with ONE top-level catch-all region: renderOrder head (anchored/saved) + live-ordered tail (loose open tabs). Same content, one region. Applies to sidepanel AND newtab.
  - Visual variant (Q1: fully-merged vs subtle saved/unsaved divider) → decide at R2, confirm at UAT. Region placement (Q2: above/below groups) → R2.
- **Handoff Notes**: Largest item; sequence AFTER B-186 + B-195. Cross-surface diff self-check (sidepanel vs newtab) required at R3.
- **Files Changed**: `sidepanel/sidepanel.js` (buildTopLevelSection, patch paths, toggle, migration), `newtab/newtab.js` (head-only + derived owner), `shared/render-order.js` (new `deriveTopLevelRenderOrder`), `shared/group-picker-core.js` + `popup/group-jump-popup.js` (sentinel align), `sidepanel/sidepanel.css`; tests `b196-toplevel-region` (new, 18) + b025/b027/b031/b036/b102/b104/b122/b187/b148/b029/b023 (rehome/contract updates)
- **Parallel Opportunity**: None — the L item; runs solo per P-1.

### [B-197] Top-level/ungrouped floating anchoring (absorbs B-185)
- **Tier**: Full (M/L)
- **Status**: **✅ DONE** 2026-07-14 — R3 ✅ (`1c1106a`) · R4 ✅ all three reviewers CLEAN at HIGH+ (contract-diff clean; every opener-inherit edge case PASS; ATTACH double-gated) · fix-round ✅ (M-1 + 4 LOW: 2 comments + `targetParentItemId` typedef + 2 coverage tests). Opener-inherit B-185 wired end-to-end; suite 2202; no schema bump. AC15 → B-200.
- **Assigned To**: — (complete)
- **Blockers**: none (Q3 resolved at R2 — `__toplevel__` runtime-derived owner, B-191-forward-compatible)
- **Feature Context**:
  - Anchor = `parentItemId`; `groupId` becomes derived/nullable. `buildFloatingMembers` (`floating-members.js:35`) stops skipping ungrouped parents; `resolveFloatingOpener`/`walkOpenerChain` drop the non-empty-groupId requirement; `moveFloatingTab` gains ATTACH-to-top-level.
  - **B-185 is fully subsumed here** — "float under a top-level bookmark" is the direct outcome.
- **Handoff Notes**: Depends on B-196's merged region existing. R2 must resolve Q3 before R3.
- **Files Changed**: `background/tabs/floating-members.js` (`__toplevel__` keying), `opener-chain.js` (null-group resolution), `tab-events.js` (record mapping), `floating-groups-mutations.js` (ATTACH-to-top-level), `background/messages/storage-handlers.js` + `shared/messages.js` (`targetParentItemId` contract); tests b195 (4 EXTEND flipped) + b013/b184/b121/b134
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

| Item | Name | Tier | Status |
|------|------|------|--------|
| B-186 | Renumber `LiveTabIndex.index` survivors on tab close | Fast Track (S) | ✅ DONE 2026-07-01 — R4 clean (0 CRIT/HIGH, 2 LOW fixed); suite 2168 PASS |
| B-195 | Safety-net test for the unified top-level region | Full (M, test-only) | ✅ DONE 2026-07-02 — 11-test net GREEN (single-source partition invariant + 4 B-197-EXTEND); suite 2179 PASS |
| B-196 | Render merge — single top-level catch-all | Full (L, rehome) | ✅ DONE 2026-07-10 — R4 3-reviewer gate; H-1/H-2 + M-1..M-4 fixed; suite 2197 PASS (+18) |
| B-197 | Top-level floating anchoring (absorbs B-185) | Full (M/L) | ✅ DONE 2026-07-14 — R4 all-clean at HIGH+; opener-inherit B-185 wired; suite 2202 PASS; AC15→B-200 |

---

_Sprint 47 (B-173 identity epic) full detail, velocity, and Gate 7 retrospective are archived in `docs/SPRINT_ARCHIVE.md`. v1.42.1 (B-184 + §77 Tier-A) shipped as a post-S47 follow-on bundle (no formal sprint)._
