# §76 — B-173 EPIC — Single-Source-of-Truth Tab↔Item Identity Consolidation (R6 As-Built)

**Status:** R6 AS-BUILT — Sprint 47 (v1.42.0). Whole-program EPIC: 7 sub-items (B-174…B-180) all DONE. R0 spike §74 locked 2026-06-27; B-179 cutover design §75 locked 2026-06-28; all R3 builds + R4 fix-rounds + R5 landed 2026-06-27…06-28. Branch `feature/sprint-47-identity-consolidation` off `release/v2` at v1.41.0 (S46 close); ship commit tail `70e42e3`→`7d65a86`.
**Anchor:** B-173 (P2 / XL, Spike-First Tier 3). EPIC parent of B-174…B-180. `docs/BACKLOG.md:194`.
**Tier:** Spike-First (XL) — R0 mandated before R1; decomposed into 5 behavior-preserving refactors (A0–A4) + 2 behavior-changing storage items (B1/B2).
**Depends on:** §74 (B-173 R0 spike — the six-store map + retirement plan); §75 (B-179 store-cutover design — the Option-A record-model decision); §73 (B-167 durable claim identity — the store we consolidated INTO); §10.5 (LiveTabIndex & TabClaims architecture); §10.7 (Drift Detection); §10.8 (Floating-Group Re-Association); §66 (B-137 — `liveTabId` join key); §69 (B-164 — onReplaced remap + wake-reconcile race-guard); §70 (B-163 — drift fallback). Findings: `docs/findings/sprint-47.md` (R4 + UAT record for all 7 sub-items).
**Author:** [solution-architect] (Opus). R6 As-Built reconciliation 2026-06-29.

**R6 As-Built delta summary (one-line):** the program shipped the SSOT collapse the R0 spike designed — durable `tj:itemClaims` is now the sole persisted claim authority, the session store is retired, one resolver owns all matching — with four honest deviations from §74: (a) the product-owner ran the WHOLE program as a single Sprint 47 EPIC (the spike recommended a 47/48 split — P-1 override, recorded); (b) B-179 R4 ADDED a data-loss gate (`durableMirrorFullReplace` returns a success boolean; the shim retains the session key on a failed persist) absent from §75; (c) B-180 kept the conservative scope (eager normalize + schema bump but KEPT the fallback tiers + tolerant validator) and deferred their deletion to B-183; (d) the migration runner gained multi-partition atomic commit, resolving the F3 single-partition limitation.

**Out-of-scope (explicit, carried from §74.8 Tier-C):**
(a) single source of truth for display order (`renderOrder` vs the two `sortOrder` fields) — returned to BACKLOG icebox;
(b) raising message-contract altitude (hiding claims/drift/floating internals from the UI) — icebox;
(c) dead-weight cleanup (`Item.lastAccessedAt`, per-entry `sessionTag`, `Group.collapsed` UI-state-in-storage, legacy theme aliases) — icebox;
(d) deleting the floating-groups position/URL recovery tiers + tightening the tolerant validator — explicitly deferred to **B-183** (the orphan-risk mitigation, §76.7);
(e) the two UAT findings (open tab in own-window not in window filter; jump-to-active-window not reaching open-tab rows) — pre-existing, NOT epic regressions; filed as **B-181 / B-182** (§76.7).

---

## §76.1 — The problem

The 2026-06-27 architectural review of the tab/bookmark tracking state machine found that the single most load-bearing fact in the system — *"which live browser tab corresponds to which saved bookmark item / floating tab"* — was **stored or re-derived in six places**, and every cross-cutting event had to keep them in sync. When they disagreed, the user saw "hard-to-describe" bugs (wrong tab highlighted; a floating tab landing in Open Tabs after reload) with no single breakpoint to debug. Point-fixes (B-149 / B-163 / B-167 / B-132 / B-125) had accreted in the reconcilers purely to paper over that disagreement.

The R0 spike (§74.3) confirmed the six stores empirically, with two count corrections:

| # | Store | Layer | Role | R0 verdict |
|---|-------|-------|------|-----------|
| 1 | `tj:tabClaims` | `chrome.storage.session` | ephemeral `itemId→tabId`, wiped on reload/restart | **RETIRE** |
| 2 | `tj:itemClaims` | `chrome.storage.local` (durable) | the B-167 additive durable claim store | **PROMOTE to sole authority** |
| 3 | `LiveTabIndex` | in-memory | live-truth oracle ("does tabId N exist, and where") | **KEEP** |
| 4 | `tj:floatingGroups[].liveTabId` | `chrome.storage.local` | floating-record → tabId join key | **DEMOTE to derived cache** |
| 5 | URL-norm matching (`safeNormalizeForMatch`) | re-derived | tab↔item match by normalized URL — **6 resolver functions** (§74 corrected "~4") | **CONSOLIDATE into 1 resolver** |
| 6 | `(windowId, tabIndex)` position matching | re-derived | tab↔record match by geometry — **4 sites** (§74 corrected "~3") | **CONSOLIDATE into 1 resolver** |

The decisive R0 confirmation: B-167 §73.11 had **already documented this consolidation as the intended "Sprint 48 revisit"**, deliberately deferred. B-167 added `tj:itemClaims` *alongside* the session store rather than replacing it — that additive move is exactly what created B-173. The charter therefore demanded a **retirement plan, not another additive layer**. B-173 is that revisit, pulled forward into Sprint 47.

The drift-bug class (§74.4 D-1…D-7) had two roots: ownership *persisted in two layers* (session + durable) and ownership *re-derived in parallel* (URL, position, reconcile). Six of the seven drift points existed because ownership was re-derived instead of read from a single authority; the reconcilers were all adjudication machinery for disagreements a single authority would make impossible.

---

## §76.2 — What shipped, per sub-item (B-174…B-180)

The program executed the §74.9 sequence: A0 safety net first, then the A1 resolver, then the A2/A3/A4 pure refactors, then the B1 cutover, then the B2 migration. All five A-tier items are behavior-preserving; the two B-tier items are the behavior change.

### §76.2.1 — B-174 (A0): cold-start reconciliation E2E safety net

End-to-end integration test (`tests/b174-cold-start-reconciliation-e2e.test.js`) that seeds all six stores and asserts the full cold-start across session/durable/floating/drift **through the public read surface** (`getItemIdForTab`, `buildLiveStates`, `readPartition`) rather than internal state. Built FIRST so nothing else proceeded until the net existed and passed against the then-current (pre-refactor) code. As-built outcome: this is the regression guard that stayed green through every subsequent sub-item — and, by design, stayed green through the B-179 cutover (T1/T2 assert the public surface + durable partition, not the session store; see §75.9.2).

### §76.2.2 — B-175 (A1): extract ONE shared tab↔item resolver

New `background/tabs/tab-item-resolver.js` — a stateless module (no chrome API, no storage, no module state; imports only `safeNormalizeForMatch`) exporting three functions that collapse the 6 URL-match functions + 4 position-match sites into one surface:

- `resolveRecordToTab(record, liveTabIndex, options)` — the canonical 3-tier join: (a) direct `liveTabId` (gated on `useDirectTier`, validated against `liveTabIndex.has`), (b) `(windowId, tabIndex)` position (optionally URL-corroborated via `corroborateUrlOnPosition`), (c) URL recovery; with optional `excludeClaimedTabIds`.
- `buildUnclaimedUrlIndex(liveTabIndex, claimedTabIds)` — the one-to-many `urlToTabs` index builder (claimed-skip on build).
- `takeUnclaimedTabForUrl(urlToTabs, normalizedUrl, inheritedTabs)` — the single-winner pop (inherited-skip on read; **intentionally mutates `urlToTabs`** to enforce single-winner-per-tab across reconcile Phase 2 + Phase 3).

Critically, the per-site behavioral differences were preserved as explicit PARAMETERS, never flattened to a common subset (the B-170 narrowing class). As-built outcome: pure refactor, contract-diff CLEAN on all 5 consolidated sites; R4 0 CRIT / 0 HIGH; M/L resolved in R5 (`tests/b175-tab-item-resolver.test.js` T1–T8c — 10 cases covering every flag combination).

### §76.2.3 — B-176 (A2): split `floating-groups.js` into cohesive modules

The 1344-line, ~8-job `floating-groups.js` monolith became a **thin re-export barrel** (`floating-groups.js`, 2.4 KB) so every existing `import { … } from './floating-groups.js'` keeps working unchanged. Implementations now live in cohesive siblings: `floating-groups-schema.js` (record field reads — `getParentItemId`), `floating-groups-mutations.js` (seed/append/reorder/move writes), `floating-groups-prune.js` (prune variants + onReplaced `liveTabId` remap), `floating-groups-reconcile.js` (cold-start re-association), `floating-groups-render.js` (renderOrder bootstrap + preMark). As-built outcome: 4 highest-risk function bodies byte-identical to HEAD; barrel re-exports all 12 public symbols; import graph acyclic; zero module-level state. R4 0 CRIT / 0 HIGH / 0 MED.

### §76.2.4 — B-177 (A3): name the onReplaced/onRemoved fan-out primitives

New `background/tabs/tab-event-cascades.js`; `tab-events.js` shrank 658→565. Names the scattered "table N" fan-outs as primitives, each carrying ONE canonical store inventory: `applyTabReplacement(addedTabId, removedTabId)` (the onReplaced remap), `releaseTabCascade(tabId)` (per-tab onRemoved cascade), `releaseTabsCascade(tabIds)` (bulk windows.onRemoved cascade). The per-tab and bulk paths share their ephemeral-store detach via a private `detachTabFromEphemeralStores` kernel but intentionally do NOT share claim-release shape (the per-tab/bulk `isClaimsReady()` asymmetry is real — flattening it would be a B-170 narrowing). As-built outcome: per-store order + sync/async preserved; the bulk reorder proven non-observable (single-threaded SW). Structural pin `tests/b125-claim-jump-fix.test.js:168` updated for the 2 relocated `releaseClaimByTab` call sites. R4 0 CRIT / 0 HIGH / 0 MED; 2 LOW fixed.

### §76.2.5 — B-178 (A4): decompose `reconcileClaims` into named phases

The 181-line `reconcileClaims` monolith became a 42-line orchestrator + four named phase helpers in `tab-claims.js`: `_phase1ValidateClaims` (`:588`), `_phase2AutoClaimByUrl` (`:628`), `_phase3DriftFallback` (`:689`), `_phase4ConditionalDriftDrop` (`:756`). The heart of the claim system, encoding 5 ticket histories (B-149/B-163/B-132/B-125/B-099). Every phase predicate preserved verbatim; `urlToTabs` built once and shared-mutated across Phase 2/3 (single-winner intact); `claimsReady`/W-1 timing unchanged. As-built outcome: contract-diff CLEAN; R4 0 CRIT / 0 HIGH; M-1 added the missing Phase-2-exhausts-a-bucket-that-Phase-3-would-target cross-boundary single-winner test (`b163` T11, empirically verified to catch the regression).

### §76.2.6 — B-179 (B1): collapse identity to ONE store

**The real fix.** Retired `tj:tabClaims` (session): all 5 claim-mutation sites (reconcile/release/reevaluate/claim/remap) now write durable ONLY; the in-memory `claimsMirror` hydrates directly from `tj:itemClaims` at cold start. Per the §75 Option-A decision, **no `tj:itemClaims` shape change, no `KNOWN_VERSION` bump** — session storage is not `tj:meta`-versioned. Key as-built modules in `tab-claims.js`:

- `hydrateClaimsMirrorFromDurable()` (`:259`) — replaces the old `prePopulateClaimsFromDurable`; seeds `claimsMirror` from durable directly (no session write), graceful-degrades to inference on a durable read failure.
- `foldLegacySessionClaims()` (`:318`) — the one-cold-start compat shim; the **only surviving `chrome.storage.session` get/remove pair** in the codebase. On the post-upgrade boundary it folds a surviving session value into durable, W-1-stamps it, and removes the session key for good.
- `reconcileClaims()` (`:802`) — Phase-1 input is now a snapshot of the in-memory mirror (`{...claimsMirror}`), not `await readClaims()`; the sole persist is `await durableMirrorFullReplace()` (`:841`).

Sibling write-surface `background/import/commit.js` was re-pointed from `chrome.storage.session.remove('tj:tabClaims')` to a durable `entries:{}` reset (the cascade-prune sibling-grep catch from §75.4.4). As-built outcome: contract-diff CLEAN; Phase-1 input did NOT narrow; ~110 re-pointed test assertions verified equal-strength-or-stronger; **two fix-round additions beyond §75** (the data-loss gate H-1/M-1 and the `readyPromise` docstring correction M-2 — §76.4). Suite 2117 → 2121. Real-browser UAT core PASS (§76.6).

### §76.2.7 — B-180 (B2): eager floatingGroups v4 normalization + schema v8→v9

The final sub-item and the program's only schema bump. An **eager** `MIGRATION_STEPS` v8→v9 step (`migration.js`, the FIRST non-no-op step in the runner's history) normalizes every `tj:floatingGroups` record to the canonical v4 stable-field shape via `normalizeFloatingGroupsToV4` (`:153`). `KNOWN_VERSION` 8→9 (`migration.js:118`) + `defaultShape(PARTITION_META)` 8→9 (`shapes.js:171`) bumped in lock-step. The migration is additive-only (never overwrites a present stable field), idempotent (version-gated + absence-gated), drops no record (1:1 map), and **never fabricates the ephemeral `liveTabId`** (left for runtime reassociate). Per the §74.12 Risk-3 orphan mitigation, B-180 **KEPT the position/URL fallback tiers + the tolerant multi-shape validator** — their deletion is deferred to B-183. As-built outcome: contract-diff CLEAN; the meta-bump + record-rewrite commit in ONE atomic `chrome.storage.local.set` (the multi-partition runner refactor, §76.4); R4 0 CRIT / 0 HIGH; M-1 removed the wrong-direction `storage→tabs` import (inlined the `itemId` fallback); a full v1→v9 production-chain test was added. Suite 2126 → 2127.

---

## §76.3 — The as-built architecture (the new steady state)

The end-state the program delivered:

- **Durable `tj:itemClaims` is the SOLE persisted claim authority.** Every claim mutation writes it and only it (W-1 `durableMirrorFullReplace`, W-2/3/4 `durableUpsertEntry`, `durableDeleteEntry`, W-5 `durableRemapEntry`). There is no second persisted claim store.
- **In-memory `claimsMirror` is the synchronous read-hot cache**, hydrated from durable at cold start. `buildLiveStates` / `getItemIdForTab` / `getClaimsMirror` read it unchanged, so the §73.11 latency concern (don't read local storage on the hot path) is fully preserved — only the *persistence* layer changed, never the read path.
- **The session store is retired**, with one bounded exception: the `foldLegacySessionClaims` one-cold-start compat shim, which reads + removes the legacy key exactly once on the post-upgrade boundary and never touches session storage again.
- **`floatingGroups.liveTabId` is a derived cache, not a parallel authority.** B-175's resolver already treats it as a validated hint (`resolveRecordToTab` tier (a) requires `liveTabIndex.has(record.liveTabId)`), so the demotion was a reclassification, not a rewrite. The lazy-rewrite (`floating-groups-reconcile.js`) + onReplaced remap (`floating-groups-prune.js`) maintain it.
- **ONE resolver (`tab-item-resolver.js`) owns all matching.** URL + position derivation moved off the steady-state hot path into the resolver's recovery tiers, consulted only when the trusted binding is unavailable (cold start / browser restart). In steady state, tier (a) direct-binding is authoritative and the recovery tiers are dead paths.
- **`LiveTabIndex` is unchanged — the live-truth oracle.** It answers "does tabId N exist and where," is the validation set the authority reconciles against, and is never a binding store.

**New module layout (`background/tabs/`):**

| Module | Role | Sub-item |
|--------|------|----------|
| `tab-item-resolver.js` | the ONE resolver (3 tiers, parameterized) | B-175 |
| `floating-groups.js` (barrel) + `-schema`/`-mutations`/`-prune`/`-reconcile`/`-render` | floating persistence, split by job | B-176 |
| `tab-event-cascades.js` | named onReplaced/onRemoved fan-out primitives + shared detach kernel | B-177 |
| `tab-claims.js` | decomposed `reconcileClaims` (4 phase helpers) + durable-only writes + `hydrateClaimsMirrorFromDurable` + `foldLegacySessionClaims` shim | B-178 / B-179 |
| `live-tab-index.js` | the live oracle (unchanged) | — (KEEP) |
| `idle-reconciler.js` | wake-reconcile + B-164 race-guard (unchanged) | — |

Net: six stores → ONE durable authority + ONE live oracle + TWO derived caches (`claimsMirror`, the resolver's per-call binding), with ten duplicated match sites collapsed to one resolver.

---

## §76.4 — Deviations from the R0 plan (§74)

The program shipped the §74 design faithfully on the big moves (Option A, durable-as-authority, one resolver, keep the oracle). Four deviations are recorded for honesty and future reference.

### §76.4.1 — (a) Whole-program EPIC, not the 47/48 split (P-1 override)

§74.9 / §74.12 Risk-1 recommended Sprint 47 take only the safety net + the consolidating refactor + the B1 spike-confirm (B-174 + B-175 + the design-confirm), deferring the two behavior-changing L items (B-179, B-180) to Sprint 48, to honor P-1 (max one L/XL active at a time). **The product-owner overrode this and authorized the whole B-173 program in Sprint 47** (BACKLOG B-173 row; reflected in §75.10 secondary flags). The risk was sprint over-commit, not correctness; it was acknowledged and the B-179+B-180 pair was sequenced last with full UAT. Recorded as a deliberate P-1 override, not a process miss.

### §76.4.2 — (b) B-179 R4 ADDED a data-loss gate not in §75

§75.4.3 specified the compat shim as: fold session→durable, W-1-stamp, then **unconditionally** `chrome.storage.session.remove`. R4 [security-reviewer] M-1 found this stranded claims if the durable write failed (quota) or stamped an empty `sessionTag` — claims would land in neither store, undercutting the §75 "no data loss" headline. The fix-round (FIX-1) changed `durableMirrorFullReplace` to **return a success boolean** (false on the empty-tag guard or a write-throw); the shim now removes the session key ONLY on a confirmed `true`, else RETAINS it for a next-cold-start retry (write-before-remove ordering preserved). This is an as-built strengthening of the §75 design, pinned by `tests/b179-store-cutover.test.js` T3 (forced quota rejection → session key retained) via a new `__triggerQuotaOnNextSet` mock primitive. The convergent qa H-1 also surfaced that the shim — the only mechanism protecting mid-upgrade users — had ZERO automated test (b174 had wrongly classified the shim *mechanics* as UAT-only); the fix-round added the 4-test `b179-store-cutover` file.

A related R4 correction (M-2): the `readyPromise` docstrings in `idle-reconciler.js` / `service-worker.js` falsely claimed the promise gates until `initializeLiveState` completes — it gates **migrations only**; `initializeLiveState` is concurrent fire-and-forget. The §75.6 narrative leaned on the false guarantee. The fix-round corrected the docstrings (hydrate-before-reconcile is guaranteed *within* `initializeLiveState`; the idle-wake gap self-heals via Phase-2 re-infer). Logic unchanged — the pre-existing race was left for a future item.

### §76.4.3 — (c) B-180 kept the conservative scope (deletion deferred to B-183)

§74.7 Step R-3 / §74.10 framed B-180 as "eager v4-only migration + **delete** the position/URL fallback tiers + tolerant validator." Per the §74.12 Risk-3 orphan-risk mitigation ("keep the recovery resolver's tiers — just stop calling them on the hot path — until a full sprint of P-4 signal confirms zero orphans, then delete"), B-180 shipped only the eager normalize + the schema bump and **kept both the fallback tiers and the tolerant multi-shape validator**. Deleting them is filed as **B-183** (§76.7), to run after a sprint of clean signal. This is the spike's own recommended risk posture, made explicit at build time rather than assumed.

### §76.4.4 — (d) The migration runner gained multi-partition atomic commit (F3 resolved)

The pre-B-180 runner could rewrite only `tj:meta` (a single-partition scaffold; the F3 limitation noted in prior chapters). B-180 needed to rewrite `tj:floatingGroups` records AND bump the meta version without a corruption window. The runner was refactored: a `MIGRATION_STEPS` entry MAY now declare a `partitionMigrations` map of `{ [partition]: (current) => next }` pure idempotent transforms; the runner adds one `writeTransaction` op per declared partition so the data rewrite **commits ATOMICALLY with the `tj:meta` version bump** in one `chrome.storage.local.set`. This resolves F3 and is the mechanism that makes the eager v8→v9 step safe (no half-migrated state observable). Not in the §74 plan as an explicit deliverable; it emerged as the correct as-built shape for an eager multi-partition migration.

---

## §76.5 — Schema + rollback

**Two storage-affecting items; one schema bump.**

| Item | Persisted shape change | `KNOWN_VERSION` | Strategy | Rollback |
|------|------------------------|-----------------|----------|----------|
| B-179 | NO — session retirement is unversioned; `tj:itemClaims` shape unchanged | stays **8** | session→durable cutover; one-cold-start shim | plain `git revert` |
| B-180 | YES — eager `tj:floatingGroups` v4 normalize | **8→9** | eager (C-1b option 1) `MIGRATION_STEPS` + atomic multi-partition commit | `git revert` + `tj:meta` reset |

**B-179 rollback (trivial — the Option-A payoff).** Because there is no schema bump, rollback is a plain `git revert` with no manual storage surgery. Durable `tj:itemClaims` is a **superset** of the retired session store — every claim written during the B-179 window is in durable — so the reverted (prior) dual-write build reconstructs its session Phase-1 input from durable on its next cold start with **zero data loss**; `KNOWN_VERSION` never changed, so there is no safe-mode/migration to unwind. The session key being absent after the shim is harmless; the reverted build re-creates it.

**B-180 rollback.** v9 records are forward-readable by v8 code — the migration is additive (it only fills stable v4 fields the validator already tolerates), so a v8 build reads v9-normalized records fine. To downgrade `KNOWN_VERSION`, reset `tj:meta` (the documented safe-mode trap: a stored schema version > `KNOWN_VERSION` triggers safe-mode; resetting `tj:meta.schemaVersion` to 8 via the safe-mode `chrome.storage.local.set` path clears it). No record data is lost on downgrade.

**SW module-cache flush (C-1a).** The v9 bump requires the user to toggle the extension OFF then ON in `edge://extensions` after update to flush the SW module cache and apply schema v9 — chrome-mock cannot reproduce the SW module-cache stale state, so this is a UAT-time item carried into the CHANGELOG. (B-179 ships new SW module code too, so the same OFF/ON reload is the trigger for the one-cold-start compat shim — but B-179 alone carries **no** "apply schema vN" language, since it has no schema change.)

---

## §76.6 — UAT outcome

**B-179 core cutover — PASS** (product-owner, Edge, 2026-06-28; §75.8 probe plan):

- **U-1 extension reload — PASS.** Claim renders live on the same tab after OFF/ON; no duplicate. **→ waived S46 B-167 reload UAT CLOSED.**
- **U-2 browser restart — PASS.** Claim live on the restored tab; still live after a second reload (proves durable re-stamp → fast path). **→ waived S46 B-167 restart UAT CLOSED.**
- **U-3 discard / U-4 sleep — PASS.**
- **U-6 floating + URL collision — PASS** (no claim-jump, D-6/D-7 covered).
- **U-5 — finding (NOT a regression).** An open tab broken out into its own new window doesn't appear in that window's filter list. Verified pre-existing (all UI + open-tabs/window/move code untouched by the epic). **→ filed B-181.**
- **U-8 — finding (NOT a regression).** Jump-to-active-window reaches saved/floating rows but not a plain open tab. Verified pre-existing (sidepanel untouched); the "open-tabs-outside-itemListEl" theory was DISPROVEN. **→ filed B-182.** The waived B-168 jump UAT does NOT fully close — it surfaced this real B-168 gap.
- **U-7 (import) + U-9 (rollback) — deferred-skipped** by product-owner. U-7 is unit-covered (`b044` + the `b179` import-commit durable-reset test); U-9 is reasoned (no schema bump → no safe-mode). Both optionally re-runnable before final merge.

**B-180 migration — PASS** (the v8→v9 migration + SW-cache-flush toggle-OFF/ON in Edge, the C-1a UAT item chrome-mock can't reproduce).

The claim-storage cutover is real-browser-validated across all storage-wipe scenarios; the two findings are pre-existing, separately filed, and do not block the epic.

---

## §76.7 — Deferred follow-ups

| ID | Name | Origin | Why deferred |
|----|------|--------|--------------|
| **B-181** | Open tab broken out into its own window not in that window's filter list | B-179 U-5 | Pre-existing (UI/open-tabs/window/move code untouched by the epic); NOT an epic regression. Filed for its own pipeline. |
| **B-182** | Jump-to-active-window doesn't reach plain open-tab rows | B-179 U-8 | Pre-existing (sidepanel untouched); NOT an epic regression. Likely shares B-181's root cause (single-tab broken-out window not rendered); root cause TBD. The waived B-168 jump UAT stays open behind this. |
| **B-183** | Delete the floating-groups position/URL fallback tiers + tighten the tolerant validator | §74.12 Risk-3 / B-180 conservative scope | The orphan-risk mitigation: keep the recovery tiers until a full sprint of clean P-4 (floating-survives-reload) signal confirms zero orphans, then delete. The eager v4 normalization (B-180) is the prerequisite that makes deletion safe. |

---

## §76.8 — Test posture

Suite **2099 → 2127 PASS (+28)** across the epic, **zero regressions throughout**, contract-diff CLEAN on every behavior-sensitive change (21 reviewer passes + 3 fix-rounds).

- **B-174 is the regression guard.** The cold-start E2E net (`tests/b174-cold-start-reconciliation-e2e.test.js`) asserts through the public read surface, so it stayed green by construction through every refactor AND through the B-179 cutover (T1/T2 needed no rework; T4's session input-seed re-pointed to the mirror).
- **Per-item new tests:** `tests/b175-tab-item-resolver.test.js` (T1–T8c resolver unit cases for every flag combination); `tests/b179-store-cutover.test.js` (4 tests — happy-path fold→stamp→remove, one-cold-start idempotency, the FIX-1 failure gate, empty steady-state); the B-180 migration tests including a full **v1→v9 production-chain** upgrade (seeds v1 + legacy `itemId`-only records; asserts schemaVersion 9 + full normalization + no drop).
- **Cutover blast radius absorbed:** ~110 session-touching assertions across 21 files re-pointed from session → durable/public surface, verified equal-strength-or-stronger (e.g. `b164` T3 still proves the B-164 M-1 invocation-count contract via `__getLocalSetCount('tj:itemClaims')===1`, not final-state). The chrome-mock session model was kept (still needed for the shim's read+remove) and gained `__triggerQuotaOnNextSet` for the data-loss-gate test.

**End of §76.**
