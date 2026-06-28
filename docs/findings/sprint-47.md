# Sprint 47 — R4 Findings (Deduplicated)

Epic B-173 (single-source-of-truth tab↔item identity consolidation). Findings recorded per sub-item.

---

## B-175 — Extract ONE shared tab↔item resolver (R4, 2026-06-27)

Reviewers: [code-reviewer] Sonnet · [security-reviewer] Opus · [qa-reviewer] Sonnet. Pure refactor; B-174 test net + full suite green throughout.

**Contract-vs-implementation diff gate (B-170): CLEAN** — [code-reviewer] independently traced all 5 consolidated sites (`reconcileClaims` Phase 2/3, `buildFloatingMembers`, `reassociateFloatingGroups`, `preMarkInheritedFromFloatingGroups`) pre-vs-post via `git show HEAD:`; no narrowing. [qa-reviewer] confirmed the same against the R2/§74 contract.

### CRITICAL (must fix before R5)
_None._

### HIGH (must fix before R5)
_None._

### MEDIUM (fix if time permits)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| M-1 (qa) | `background/tabs/tab-item-resolver.js` (all exports) | No dedicated unit tests; flag-combination paths (`useDirectTier:false` with valid liveTabId present; `excludeClaimedTabIds` tier-(a) exclusion) only exercised indirectly. | ✅ R5 — `tests/b175-tab-item-resolver.test.js` T1–T8c (10 cases) cover every flagged path. |
| M-2 (qa) | `background/tabs/floating-groups.js` preMark call block | Comment overstated `excludeClaimedTabIds` as an active guard; at cold start preMark runs before `reconcileClaims` so `claimedTabIds` is always empty (intentional no-op). | ✅ R5 — clarifying comment added noting the cold-start empty-mirror invariant + semantic-symmetry rationale. |

### LOW (defer / doc-only)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| L-1 (code) | `tab-item-resolver.js:31` | Module header "Pure functions." is inaccurate — `takeUnclaimedTabForUrl` mutates its `urlToTabs` arg (load-bearing for the single-winner invariant). | ✅ R5 — header reworded to "Stateless …" + explicit mutation note. |
| L-2 (code) | resolver module | No direct unit tests (duplicate of qa M-1). | ✅ R5 — closed by `tests/b175-tab-item-resolver.test.js`. |
| L-3 (qa) | `tab-item-resolver.js:110-117` | URL tier (c) with `excludeClaimedTabIds` returns null on a claimed first-match rather than falling through to an unclaimed same-URL tab. **Pre-existing behavior preserved verbatim** — not a regression; JSDoc already documents it. | No change (documented design). |

**[security-reviewer]: PASS — security-neutral.** Verified untrusted-URL normalization preserved (all comparisons route through `safeNormalizeForMatch`), single-winner-per-tab invariant intact (no claim-hijack widening), claimed-exclusion is post-resolution (no fall-through), no new console/PII logging, import surface shrank (`safeNormalizeForMatch` only, no dynamic import). 0 findings.

**Outcome:** 0 CRIT / 0 HIGH. All MED/LOW resolved in R5. Suite 2106 → 2116 PASS, zero regressions.

---

## B-176 — Split `floating-groups.js` into cohesive modules (R4, 2026-06-27)

Reviewers: code (Sonnet) · security (Opus) · qa (Sonnet). Pure file-split; barrel pattern preserves all importers. Suite 2116 PASS throughout.

**[code-reviewer]: PASS** — 4 highest-risk function bodies byte-identical to HEAD; barrel re-exports all 12 public symbols; import graph acyclic; zero module-level state. Contract-diff: clean.
**[security-reviewer]: PASS — security-neutral** — no dynamic imports (the lone `import()` is a JSDoc note, won't trip the B-150 guard), import surface unchanged, 9× `writeTransaction` + 13 partition targets parity, no PII logging.
**[qa-reviewer]: PASS** — every cross-module call backed by an explicit import (full call-graph traced); private helpers co-located with callers; all 12 exports have transitive behavioral coverage.

### CRITICAL / HIGH / MEDIUM
_None._

### LOW (deferred polish)
| # | File | Finding | Disposition |
|---|------|---------|-------------|
| L-1 (code) | new modules ×7 sites | Stale `floating-groups.js:NNN` provenance comments now point cross-file (several line numbers were already wrong in HEAD). | Deferred polish — reviewer states a fix-round is not warranted for a structural refactor; clean up in a later pass (line-number cross-refs are inherently fragile; prefer removing/genericizing). |
| L-2 (qa) | `floating-groups-schema.js` / `-prune.js` | `getParentItemId` + `pruneResolvedFloatingGroups` have only transitive (not direct) unit coverage. | Pre-existing characteristic, not a regression; optional hardening. |

**Outcome:** 0 CRIT / 0 HIGH / 0 MED. Suite 2116 PASS, zero regressions. Pure refactor — R5 = full-suite green (no new behavior to test).

---

## B-177 — Name the `onReplaced`/`onRemoved` event fan-out primitives (R4, 2026-06-27)

Reviewers: code (Sonnet) · security (Opus) · qa (Sonnet). New `background/tabs/tab-event-cascades.js`; `tab-events.js` 658→565. Suite 2116 PASS throughout.

**[code-reviewer]: PASS** — per-store order + sync/async preserved for both `applyTabReplacement` and `releaseTabCascade`; the bulk reorder (`Promise.allSettled` now before `unregisterWindow`) proven non-observable (single-threaded: async callbacks can't run until the sync stack + WINDOW_MAP broadcast complete); per-tab-vs-bulk asymmetry preserved (shared kernel = ephemeral detach only, NOT claim release). Contract-diff: clean.
**[security-reviewer]: PASS — security-neutral** — claim release intact (session `tj:tabClaims` + durable `tj:itemClaims` both cleared; no dangling claim → no identity-confusion risk); onReplaced remap drops no store; no dynamic import/eval/PII logging.
**[qa-reviewer]: PASS** — drain-callback arg order `(addedTabId, removedTabId)` matches idle-reconciler; `isClaimsReady()` gating parity (per-tab unconditional, bulk gated) preserved; shared kernel covers exactly the 3 duplicated ephemeral stores; edge cases (empty window, untracked replace, belt-and-braces double-prune) all no-op-correct.

### CRITICAL / HIGH / MEDIUM
_None._

### LOW (both fixed in this round)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| L-1 (code) | `tab-event-cascades.js:209` | Lint 80006 — `releaseTabCascade` returns a `.then` chain; convertible to `async`. | ✅ Converted to `async`/`await` (behavior-equivalent; sync calls still run before first await). Lint cleared. Suite 2116 PASS. |
| L-2 (qa) | `tab-event-cascades.js` header | Module comment said "non-observable reordering" — technically `claimsMirror` differs at WINDOW_MAP-broadcast time though no failure scenario exists. | ✅ Reworded to "semantically equivalent reordering" + explicit single-threaded rationale. |

**Structural-pin test edit (faithful):** `tests/b125-claim-jump-fix.test.js:168` "releaseClaimByTab = exactly 4 production call sites" updated to track the 2 relocated calls (tab-events.js 0 / tab-event-cascades.js 2 / storage-handlers.js 2 = 4). B-099 D-1 intent preserved (now stronger — covers the new module). Per CLAUDE.md Fix-scope test-assertion enumeration rule. All 3 reviewers validated.

**Outcome:** 0 CRIT / 0 HIGH / 0 MED. 2 LOW fixed. Suite 2116 PASS, zero regressions.
