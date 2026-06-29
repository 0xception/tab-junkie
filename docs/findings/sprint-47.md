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

---

## B-178 — Decompose `reconcileClaims` into named phase helpers (R4, 2026-06-27)

Reviewers: code (Sonnet) · security (Opus) · qa (Sonnet). `reconcileClaims` 181-line monolith → 42-line orchestrator + `_phase1ValidateClaims`/`_phase2AutoClaimByUrl`/`_phase3DriftFallback`/`_phase4ConditionalDriftDrop`. The heart of the claim system — highest behavior-sensitivity.

**[code-reviewer]: PASS** — every phase predicate PRESERVED verbatim; `urlToTabs` built once and shared-mutated across Phase 2/3 (single-winner intact); Phase-3 all-unbound, Phase-1 no-URL-recheck, Phase-4 conditional, graceful-degradation try/catch, `claimsReady`/W-1 timing all confirmed; no new module-level state. Contract-diff: clean. 0 findings.
**[security-reviewer]: PASS — security-neutral** — claim-binding integrity preserved (no double-claim path); W-1 `ensureSessionTag` + `durableMirrorFullReplace` timing/tag unchanged (B-167 CONV-1 not reintroduced); graceful degradation contained; no PII logging.
**[qa-reviewer]: PASS** — state-threading traced clean (reconciled/claimedTabIds/evictedItemIds flow by reference; Phase 2 mutations reach Phase 3/4); all edge cases (empty items, empty index, all-evicted, drift-read throw, already-reconciled) match the monolith; idempotent across cold-start + idle-wake re-run.

### CRITICAL / HIGH
_None._

### MEDIUM (fixed in R5)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| M-1 (qa) | `tests/b163-...test.js` | No test pinned the Phase-2-exhausts-a-bucket-that-Phase-3-would-target cross-boundary single-winner case (B-163 T3 only covered Phase 3 vs Phase 3). | ✅ R5 — T11 added (`b163-...test.js:645`), driven through the real `reconcileClaims` orchestrator. **Empirically verified it catches the regression**: temporarily rebuilding the Phase-3 map made only T11 fail; the load-bearing assertion is `claims['item-A'] === undefined`. |

### LOW
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| L-1 (qa) | `tab-claims.js:663` | Phase 4 docstring said "not recovered by Phase 3" but `reconciled` includes Phase 2 rebinds too. | ✅ R5 — reworded to "not recovered by Phase 2 OR Phase 3" (filter logic untouched). |
| L-2 (qa) | `tab-claims.js:562/654` | `claimedTabIds.add()` in Phase 2/3 is accumulated but not consumed post-build (single-winner enforced by the `urlToTabs` shift). Harmless, consistent with monolith. | No action (reader-expectation note only; changing it would exceed the no-behavior-change scope). |

**Outcome:** 0 CRIT / 0 HIGH. MED + L-1 resolved in R5; L-2 noted. Suite 2116 → 2117 PASS, zero regressions.

---

## B-173 EPIC — safe-refactor tier (A0–A4) COMPLETE
B-174 (test net) · B-175 (resolver) · B-176 (split floating-groups.js) · B-177 (event fan-out) · B-178 (reconcileClaims phases) — all DONE, all behavior-preserving, suite 2099 → **2117 PASS**, zero regressions throughout, contract-diff clean on every behavior-sensitive change.

---

## B-179 — Collapse to ONE store; retire session `tj:tabClaims`; demote `floatingGroups.liveTabId` (R4 + fix-round, 2026-06-28)

BEHAVIOR-CHANGING, irreversible cutover. Option A (B1 design-confirm spike `docs/design/75`, product-owner sign-off). Reviewers: code (Sonnet) · security (Opus) · qa (Sonnet).

**Headline verifications (all 3 reviewers):** Phase-1 input did **NOT** narrow (`{...claimsMirror}` is the full prior-claims set; hydrate runs before reconcile in `initializeLiveState`); all 5 durable writes (W-1..W-5) intact as the sole persist; rollback genuinely safe (`KNOWN_VERSION` stays 8, durable is a superset → plain `git revert`); the ~110 re-pointed test assertions are **equal-strength or stronger** (b164 T3 still proves the B-164 M-1 invocation-count contract via `__getLocalSetCount('tj:itemClaims')===1`, not final-state). Contract-diff: clean.

### CRITICAL
_None._

### HIGH (fixed in fix-round)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| H-1 (qa; = code M-1) | `tab-claims.js:318` `foldLegacySessionClaims` | The one-cold-start session→durable compat shim — the only mechanism protecting mid-upgrade users — had ZERO automated test (design §75.9.3 #2 specified one; b174 wrongly classified the shim *mechanics* as UAT-only). | ✅ Fix-round — `tests/b179-store-cutover.test.js` (4 tests): happy-path fold→stamp→remove, one-cold-start idempotency, the FIX-1 failure gate, empty steady-state. |

### MEDIUM (fixed in fix-round)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| M-1 (security; data integrity) | `tab-claims.js` shim + `durableMirrorFullReplace` | Session-key removal was UNCONDITIONAL — if the durable write failed (quota) or stamped an empty `sessionTag`, claims stranded in neither store (undercuts the §75 "no data loss" headline). | ✅ Fix-round FIX-1 — `durableMirrorFullReplace` now returns a success boolean (false on empty-tag guard or write-throw); the shim removes the session key ONLY on confirmed `true`, else RETAINS it for next-cold-start retry. Write-before-remove ordering preserved. Pinned by `b179` T3 (forced quota rejection → session key retained). |
| M-2 (qa) | `idle-reconciler.js:120`, `service-worker.js:48` | `readyPromise` docstrings falsely claimed it gates until `initializeLiveState` completes (it gates migrations only; `initializeLiveState` is concurrent fire-and-forget). Pre-existing race (not a B-179 regression; self-heals via Phase-2 re-infer), but B-179 §75.6 leaned on the false guarantee. | ✅ Fix-round FIX-3 — docstrings corrected (gates migrations; hydrate-before-reconcile guaranteed *within* initializeLiveState; idle-wake gap self-heals). Logic unchanged (pre-existing race left for a future item). |

### LOW (fixed)
Stale `tj:tabClaims`-as-active docstrings in `shapes.js`/`migration.js`/`tab-events.js` header + `durableMirrorFullReplace` "passive mirror" JSDoc → annotated "RETIRED by B-179 §75 / sole persisted write". b174 T1 tautological `__getSessionStore===undefined` → strengthened to `__getSessionSetCount===0`. b163 T10 comment corrected (models fresh-install/restart, not extension-reload, post-cutover). demote-item dead guard cleaned.

**Outcome:** 0 CRIT. HIGH + both MED + LOWs all fixed in the fix-round. New `__triggerQuotaOnNextSet` mock primitive (for the failure-gate test). Suite 2117 → **2121 PASS**, zero regressions. **Automated side complete; real-browser UAT (9 probes, §75.8) is the remaining acceptance gate — product-owner-run in Edge.**

### B-179 real-browser UAT result (product-owner, Edge, 2026-06-28)
- **U-1 Extension reload — PASS.** Claim renders live on the same tab after OFF/ON; no duplicate. **→ waived S46 B-167 reload UAT CLOSED.**
- **U-2 Browser restart — PASS.** Claim live on restored tab; still live after a second reload (durable re-stamp). **→ waived S46 B-167 restart UAT CLOSED.**
- **U-3 discard / U-4 sleep — PASS.**
- **U-6 floating + URL collision — PASS** (no claim-jump).
- **U-5 — finding (NOT a regression):** an open tab broken out into its own new window doesn't appear in that window's filter list. Verified pre-existing (all UI + open-tabs/window/move code untouched by the epic). **→ filed B-181.**
- **U-8 — finding (NOT a regression):** jump-to-active-window reaches saved/floating rows but not a plain open tab. Verified pre-existing (sidepanel untouched). Initial "open-tabs-outside-itemListEl" theory DISPROVEN (`renderAll` mounts the section into `itemListEl`); root cause TBD, likely shares B-181's cause (single-tab broken-out window not rendered). **→ filed B-182.** (Waived B-168 jump UAT does NOT fully close — surfaced this real B-168 gap.)
- **U-7 (import) + U-9 (rollback) — deferred-skipped** by product-owner.

**Verdict: B-179 core cutover UAT PASS.** The claim-storage cutover is real-browser-validated across all storage-wipe scenarios. The two findings are pre-existing, separately-filed, and do not block B-179. Residual: U-7 (import-clears-claims; unit-covered by b044) + U-9 (rollback; reasoned, no schema bump) optionally re-runnable before final merge.

---

## B-180 — Eager `tj:floatingGroups` v4 normalization + schema v8→v9 (R4 + fix-round, 2026-06-28)

BEHAVIOR-CHANGING (data migration + schema bump). Final epic sub-item. Conservative scope per the orphan-risk mitigation: eager normalize stable fields + schema bump; **fallback tiers + tolerant validator KEPT** (deletion deferred to B-183). Reviewers: code (Sonnet) · security (Opus) · qa (Sonnet).

**Headline verifications (all 3):** the migration is additive-only (never overwrites a present stable field), idempotent (version-gated + absence-gated; byte-for-byte no-op on re-run), **drops no record** (1:1 map), **never fabricates the ephemeral `liveTabId`** (left for runtime reassociate), and commits the meta-bump + record-rewrite in ONE atomic `chrome.storage.local.set` (no corruption window — verified against the multi-partition runner refactor). Rollback forward-readable by the v8 build (additive shape, validator unchanged); `KNOWN_VERSION` downgrade safe-mode trap documented in CHANGELOG. Contract-diff: clean.

### CRITICAL / HIGH
_None._

### MEDIUM (fixed in fix-round)
| # | File | Finding | Resolution |
|---|------|---------|-----------|
| M-1 (code) | `migration.js` import | First `storage → tabs` layering import (`getParentItemId` from `floating-groups-schema.js`) — wrong dependency direction, risks a future cycle. | ✅ Fix-round — import removed; the 3-line `itemId`-fallback derivation inlined (behavior-identical). No `storage → tabs` import remains. |
| M-1 (qa) / L-1 (code) | b180 test | No test exercised the real production MIGRATION_STEPS chain for a v<8 user (b180 always seeded v8). | ✅ Fix-round — added a full v1→v9 production-chain upgrade test (seeds v1 + legacy `itemId`-only records; asserts schemaVersion 9 + full normalization + no drop). |
| M-2 (qa) | b180 test | No direct migration→runtime re-association test. | ✅ Fix-round — referenced as transitive coverage (`floating-position.test.js:85` already feeds the migration-output shape through `reassociateFloatingGroups`); a duplicate test would add zero signal. |

### LOW
Runner F6 deep-clone asymmetry (benign — transform is non-mutating spread); non-object/degenerate-record branches (fail-closed via `assertShape`, near-unreachable); stale `KNOWN_VERSION (5)` comment in migration-steps.test.js → fixed.

**Outcome:** 0 CRIT / 0 HIGH. MEDIUMs + LOW fixed in fix-round. Migration-runner F3 single-partition limitation resolved (atomic multi-partition commit). Suite 2126 → **2127 PASS**, zero regressions. **Automated side complete; B-180 UAT = the v8→v9 migration + SW-cache-flush (toggle OFF/ON) verification in Edge (C-1a UAT item — chrome-mock can't reproduce the SW module-cache stale state).**

---

## B-173 EPIC — CODE COMPLETE (all 7 sub-items)
B-174…B-180 all DONE (code + R4 + fix-rounds + R5). Suite **2099 → 2127 PASS** (+28), zero regressions across the entire epic, contract-diff clean on every behavior-sensitive change, 21 reviewer passes + 3 fix-rounds. Remaining gates before ship: B-180 UAT (schema-migration smoke in Edge) + the deferred B-179 U-7/U-9 (optional) → then Gate 4 / Gate 7 / release v1.42.0.
