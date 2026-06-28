# §75 — B-179 Store Cutover Design (Collapse identity to ONE authoritative store)

**Owner:** [solution-architect]
**Round:** B1 design-confirm spike (post-B-175) — the R2 architecture + the product-owner-deferred record-model decision for B-179.
**Sprint:** 47
**Date:** 2026-06-28
**Status:** Design only — read-only static analysis against current code (post A-tier: B-175/176/177/178 landed). No product code or tests changed by this chapter.
**Anchor:** B-179 (P2 / L). B-173 EPIC sub-item B1. `docs/BACKLOG.md:199`.
**Depends on:** §74 (B-173 R0 spike — six-store map, retirement plan, probe plan); §73 (B-167 durable claim identity — the store we consolidate INTO); §10.5 (LiveTabIndex & TabClaims architecture); §66 (B-137 floating liveTabId join key); §69 (B-164 onReplaced remap + wake-reconcile race-guard); §70 (B-163 drift fallback).
**Reads-against (current code):** `background/tabs/tab-claims.js` (1018 LOC), `background/tabs/index.js`, `background/tabs/idle-reconciler.js`, `background/tabs/tab-event-cascades.js`, `background/tabs/tab-item-resolver.js`, the `floating-groups-*` modules, `background/storage/{shapes,migration}.js`, `background/import/commit.js`, and the 21 session-touching test files.

---

## §75.1 — Purpose and the one decision the product-owner deferred

The R0 spike (§74) decomposed B-173 into B-174…B-180 and **leaned Option A** (two record kinds, consolidate at the resolution + persistence layers — no `tj:itemClaims` shape change) for the B-179 cutover, but the product-owner explicitly deferred the record-model pick to **"let the B1 design-confirm spike decide"** (BACKLOG B-179 row, 2026-06-27). This chapter re-verifies that lean against the **now-consolidated** code (B-175's single resolver `tab-item-resolver.js` + B-178's named `reconcileClaims` phases are landed, which materially changes the blast radius) and delivers:

1. **The record-model decision** (Option A vs Option B) — §75.2. **Headline for product-owner sign-off.**
2. **The cutover design** — retire session, demote `liveTabId`, keep the oracle — §75.3–§75.6.
3. **Schema / migration / rollback** — §75.7.
4. **Real-browser UAT probe plan** (folds waived S46 B-167 + B-168 debt) — §75.8.
5. **Test strategy** (which of ~2117 assertions move; how B-174's T1/T2 shift) — §75.9.
6. **Risk flags** for [scrum-master] / product-owner — §75.10.

---

## §75.2 — THE RECORD-MODEL DECISION (deliverable 1)

### §75.2.1 — The two options, re-verified against current code

| | **Option A — two record kinds, one authoritative store (RECOMMENDED)** | **Option B — one unified binding record** |
|---|---|---|
| `tj:itemClaims` shape | **UNCHANGED**: `{schemaVersion:1, sessionTag, entries:{itemId→{tabId,claimedAt,sessionTag}}}` (`shapes.js:168-175,265-280`) | **CHANGED**: `entries[bindingId] = {kind:'claim'\|'floating', tabId, sessionTag, claimedAt, itemId?, parentItemId?, groupId?, sortOrder?, url?}` (§74.5.2) |
| Floating membership | Stays in `tj:floatingGroups` records; `liveTabId` demoted to a derived/validated cache | Folded INTO `tj:itemClaims`; `tj:floatingGroups` eager-migrated and (eventually) retired |
| `KNOWN_VERSION` | **8 (no bump)** — session retirement is not a local-partition schema event | **8→9** — paired bump + eager migration, pulled EARLIER into B-179 |
| Validator | `isItemClaims` unchanged | `isItemClaims` rewritten to a discriminated-union validator |
| Floating read paths | `buildFloatingMembers` / `reassociateFloatingGroups` / mutations / prune unchanged (still read `tj:floatingGroups`) | All re-pointed at the unified `tj:itemClaims` store |
| Blast radius | `tab-claims.js` + `index.js` + `commit.js` + ~21 test files | All of Option A **plus** every `floating-groups-*` module, `floating-members.js`, the migration runner, the validator, and the `renderOrder` `floating:<id>` ref plumbing |

### §75.2.2 — RECOMMENDATION: **Option A.** Confirm the R0 lean — do NOT overturn.

The post-B-175/B-178 code makes Option A *more* attractive than it was at R0, not less: the resolver is already extracted and already treats `liveTabId` as a validated hint (`resolveRecordToTab` tier (a) requires `liveTabIndex.has(record.liveTabId)` — `tab-item-resolver.js:90-94`), so the "single source of truth at the resolution layer" half of B-179 is **already done**. B-179 under Option A is therefore *mostly the session retirement* — a tightly-scoped, single-module cutover.

### §75.2.3 — The 3 strongest reasons (the sign-off argument)

1. **Risk asymmetry: Option A is a single-module cutover with NO schema bump; Option B lands a schema bump + an eager migration of live data in the SAME behavior-changing item.** Option A touches `tab-claims.js` (session retirement), the one `commit.js:127` sibling write, and re-points ~21 test files — with **zero** `tj:itemClaims` shape change, **zero** `KNOWN_VERSION` bump, **zero** eager migration, and **zero** validator rewrite (§75.7 confirms session storage is not versioned by `tj:meta`). Option B requires a v8→v9 paired bump (`migration.js:110` + `shapes.js:158` + a non-no-op `MIGRATION_STEPS` entry + the 5 schema-version test pins) **and** an eager rewrite that folds every `tj:floatingGroups` record into `tj:itemClaims` *during the cold-start window* — exactly the live-data-touch that B-121/B-137 deliberately avoided with lazy migration (`migration.js:126-220`). That couples the storage cutover and the schema migration into one L/XL item whose only-UAT-verifiable surface (session-wipe-on-reload vs SW-restart, §74.11) **doubles**.

2. **The floating record is dual-role; the charter only asks to demote the *identity* half.** §74.3.4 confirmed each `tj:floatingGroups` record is BOTH a *display* record (`parentItemId`/`groupId`/`sortOrder`/`url`/`floatingTabId`, plus the `renderOrder` `floating:<floatingTabId>` ref it anchors) AND an *identity* record (`liveTabId`). B-179's charter is to demote **`liveTabId`** to a derived cache — Option A does exactly and only that (`liveTabId` stops being a parallel persisted authority; the B-175 resolver recomputes it), while the display fields stay where every renderer, mutation (`floating-groups-mutations.js`), prune (`floating-groups-prune.js`), and `renderOrder` path already reads them. Option B would drag all those display fields into `itemClaims.entries` and re-point `buildFloatingMembers` (`floating-members.js:104`) + the `renderOrder` ref plumbing at a *different partition* — cross-cutting churn with no reliability payoff that B-180's eager v4-only migration doesn't deliver more safely, later, in isolation.

3. **Single authority is delivered by the persistence + resolution collapse, not by merging record types — Option B eliminates no additional drift point.** The drift-bug class (§74.4 D-1…D-7) has two roots: ownership *persisted in two layers* (session + durable) and ownership *re-derived in parallel*. Option A removes both — persistence collapses to **durable-only** (kills D-1 session-vs-durable skew, D-2 `sessionMatches` false-negative cost, D-3 mirror-vs-session reconcile-gap) and resolution **already** collapsed to one resolver at B-175 (covers D-5/D-6/D-7). D-4 (claim-vs-floating double-home) is resolved by the single resolver + claimed-tab exclusion (`floating-members.js:104-107`, `excludeClaimedTabIds`) **regardless** of whether the two record kinds live in one partition or two. So merging the record types buys "truest-SSOT" aesthetics for materially higher risk and **zero** incremental drift elimination. Option B remains a possible B2+ follow-on only if empirical signal (post-B-171 traces) ever warrants it; nothing in the current code makes it necessary now.

**Corroborating facts:** (i) §73.11 + §74.3.2 already document `tj:itemClaims`-as-sole-authority as the intended end-state — Option A *is* that end-state minus the unnecessary record-type merge. (ii) The Tier-C deferral list (§74.8) explicitly parks the per-entry `sessionTag` dead-weight (open question Q3); Option A lets it stay deferred, whereas Option B forces a `sessionTag`-retention decision *now* because it rewrites the entry shape.

**Verdict: Option A. No `tj:itemClaims` shape change at B-179. The v8→v9 schema bump stays at B-180.**

---

## §75.3 — Cutover design overview (Option A)

Three moves, in dependency order. **R-1 (retire session) is the bulk of B-179; R-2 (demote `liveTabId`) is a low-code reclassification because B-175 already made the resolver validate `liveTabId`; R-3 keeps `LiveTabIndex`.**

| Move | What | Where | Code weight |
|------|------|-------|-------------|
| **R-1** | Retire `tj:tabClaims` (session): durable-only writes + one-cold-start compat shim | `tab-claims.js`, `index.js`, `commit.js` | **HIGH** (the cutover) |
| **R-2** | Demote `floatingGroups.liveTabId` to a derived cache | `tab-claims.js` docstrings, `tab-event-cascades.js` inventory, floating resolver call sites | **LOW** (reclassification; resolver already validates) |
| **R-3** | Keep `LiveTabIndex` as the live oracle | `live-tab-index.js` | **NONE** (unchanged) |

---

## §75.4 — R-1: Retire `tj:tabClaims` (session)

### §75.4.1 — The new write/read contract

Today every claim mutation does **two** persisted writes: `writeClaims()` → `chrome.storage.session.set('tj:tabClaims', claimsMirror)` (`tab-claims.js:150-152`) **plus** a parallel durable PATCH (W-1…W-5). The cutover **deletes the session write at all 5 sites; the durable PATCH that already sits next to each becomes the SOLE persisted write.** The in-memory `claimsMirror` stays the synchronous read-hot surface (read by `buildLiveStates` `:875-910`, `getItemIdForTab` `:918-921`, `getClaimsMirror` `:96-98` for `drift.js` + `floating-members.js`) — **unchanged**, so the §73.11 latency concern (don't read local storage on the hot path) is fully addressed: only the *persistence* layer changes, never the read path.

### §75.4.2 — Function-by-function change list

| Function | File:line | Change | New contract |
|----------|-----------|--------|--------------|
| `readClaims()` | `tab-claims.js:141-144` | **DELETE** | Sole caller was `reconcileClaims:725`; replaced per row below |
| `writeClaims()` | `tab-claims.js:150-152` | **DELETE** | Its 5 callers drop the session write (rows below) |
| `prePopulateClaimsFromDurable()` | `tab-claims.js:260-310` | **RENAME → `hydrateClaimsMirrorFromDurable()`**; replace the `chrome.storage.session.set` (`:303`) with a **direct write into the in-memory `claimsMirror`**; keep `sessionMatches` gate + `ensureSessionTag` settle; add the one-cold-start shim (§75.4.3) | Seeds `claimsMirror` from durable directly. This is the original R1 sketch §73.4.3 called "mechanically incorrect" — it was wrong ONLY because reconcile read session; once reconcile reads the mirror (row below) it becomes correct. No session write. |
| `reconcileClaims()` | `tab-claims.js:723-764` | Phase-1 input changes from `await readClaims()` (`:725`) to a **snapshot of the in-memory mirror** (`const storedClaims = { ...claimsMirror }`); remove the `await writeClaims()` at `:749` (W-1 `durableMirrorFullReplace` at `:760` remains the sole persist). Phases 1-4 + `urlToTabs` threading + `claimsReady` flip **unchanged**. | Snapshot at entry preserves the B-164 M-2 race-guard semantics: the snapshot is the pre-reconcile state; an interleaved `onReplaced` mutates the live mirror; the `_pendingReplacements` drain re-applies post-reconcile (`idle-reconciler.js:170-182`). |
| `releaseClaimByTab()` | `tab-claims.js:772-788` | Remove `await writeClaims()` (`:776`); keep `delete claimsMirror[itemId]` + `durableDeleteEntry` (`:783`) | Mirror delete (sync) + durable delete (async) |
| `reevaluateTab()` | `tab-claims.js:813-856` | Remove `await writeClaims()` (`:844`); keep `durableUpsertEntry` (`:853`) | Mirror upsert (sync) + durable upsert (async) |
| `claimTabForItem()` | `tab-claims.js:931-939` | Remove `await writeClaims()` (`:933`); keep `durableUpsertEntry` (`:938`) | Mirror upsert (sync) + durable upsert (async) |
| `remapTabIdInClaims()` | `tab-claims.js:973-1017` | Remove `await writeClaims()` (`:1008`); keep `durableRemapEntry` (`:1014`) | Mirror swap (sync) + durable remap (async) |
| `sessionMatches`, `ensureSessionTag`, `durableMirrorFullReplace`(W-1), `durableUpsertEntry`(W-2/3/4), `durableDeleteEntry`, `durableRemapEntry`(W-5) | `:168-479` | **UNCHANGED** (they already write durable) | The durable partition is now the only persisted store |

**Net:** ~2 functions deleted, ~6 mutated, the durable PATCH helpers untouched. Code is **net-deleted**, per the §74.7 retirement charter ("no new additive layer").

### §75.4.3 — The one-cold-start compatibility shim

The upgrade boundary: the *prior* build wrote claims to `tj:tabClaims` (session). When the user updates to the B-179 build and the SW cold-starts, the new code must not lose claims that live only in the surviving session value (the SW-restart-within-same-session case where the session store survives the code swap). The shim, inside `hydrateClaimsMirrorFromDurable()`:

```
1. Read durable = readPartition(PARTITION_ITEM_CLAIMS).        // graceful-degrade per §73.8
2. Read legacySession = chrome.storage.session.get('tj:tabClaims').  // ONE read, shim-only
3. If durable is empty (or sessionMatches=false) AND legacySession is non-empty:
     a. Fold legacySession into claimsMirror (the live authority for this SW lifetime).
     b. Settle _sessionTag (ensureSessionTag) and W-1-stamp durable from the folded set
        so the NEXT reload hits the trusted durable fast path.
     c. chrome.storage.session.remove('tj:tabClaims').   // retire the key for good
   Else (the steady-state post-upgrade path):
     - sessionMatches(durable) ? seed claimsMirror from durable : leave empty (inference backstop).
4. Never read or write chrome.storage.session for claims again.
```

The shim is **bounded to one cold start**: after the `remove` (step 3c), the session key is absent forever, so on every subsequent cold start step 2 reads empty and step 3 is skipped. There is no standing session dependency. (`chrome.storage.session.remove` is already exercised by `commit.js:127` and modeled in `chrome-mock.js:135` — no new mock surface needed.)

### §75.4.4 — Sibling write-surface: `background/import/commit.js:127` MUST be updated

**Critical, easy-to-miss (cascade-prune sibling-grep, CLAUDE.md R3 rule).** `commit.js:117-131` resets the transient stores after a bulk import that swaps `tj:items`/`tj:groups` — it resets `tj:drift` + `tj:floatingGroups` via `writeTransaction` **and** removes the session claims key: `chrome.storage.session.remove('tj:tabClaims')` (`:127`). Post-cutover the session key carries nothing; if this line is left as-is, **import silently stops clearing stale claims** — the durable `tj:itemClaims` keeps them and the user sees ghost-live rows pointing at pre-import tabs. B-179 MUST re-point this to reset the durable partition's `entries` to `{}` (fold it into the existing `writeTransaction` ops array at `:118-121` as a third op against `PARTITION_ITEM_CLAIMS`, preserving the partition-level `sessionTag`/`schemaVersion`). This is the second-and-final product-code consumer of the session key (`tab-claims.js` is the first); a repo grep for `tj:tabClaims` / `storage.session` at R3 confirms no third.

---

## §75.5 — R-2: Demote `floatingGroups.liveTabId` to a derived cache

Under Option A this is a **reclassification, not a rewrite** — the heavy lifting already landed at B-175.

- **The resolver already treats `liveTabId` as a validated hint, not blind truth.** `resolveRecordToTab` tier (a) binds to `record.liveTabId` **only if** `liveTabIndex.has(record.liveTabId)` (`tab-item-resolver.js:90-94`); otherwise it falls through to position (tier b) / URL (tier c). So `buildFloatingMembers` (`floating-members.js:104`), `reassociateFloatingGroups` (`floating-groups-reconcile.js:153`), and `_resolveRecordIndexByTabId` (`floating-groups-mutations.js:255-278`) already consult `liveTabId` as a cache that is re-validated every call. **No call-site behavior change is required for the demotion.**
- **The cache-refresh path stays.** `reassociateFloatingGroups` lazy-rewrites a stale/missing `liveTabId` on every cold start (`floating-groups-reconcile.js:163-171` → `pruneResolvedFloatingGroups` patch branch, `floating-groups-prune.js:63-69`), and `remapFloatingGroupsLiveTabId` keeps it current on `onReplaced` (`floating-groups-prune.js:289-337`). These ARE the "derived cache" maintenance; they remain.
- **What B-179 actually changes here is the *invariant*, documented in code + this chapter:** `floatingGroups.liveTabId` is no longer a parallel persisted *authority* for the tab↔floating binding — the B-175 resolver is the single owner; `liveTabId` is a recomputed hint. The docstrings in `floating-groups-prune.js` / `floating-groups-reconcile.js` get a one-line status note; no logic moves.
- **B-179 must NOT delete the position/URL recovery tiers.** Deleting them + the eager v4-only migration is **B-180** (§75.7.4). B-179 only stops treating `liveTabId` as authoritative; the tiers stay as the recovery path.

**`onReplaced` store-inventory update (`tab-event-cascades.js:96-117`):** today the inventory lists 7 rows including row 4 `tj:tabClaims (storage.session)` and row 5 `tj:itemClaims (durable)`. Post-cutover **row 4 is removed** (no session write), leaving the durable PATCH (old row 5) + `floatingGroups[].liveTabId` (old row 6) as the only persisted remaps — a 7-row → 6-row inventory. The `releaseTabCascade` inventory (`:184-216`) row 5 ("claimsMirror + session + durable") becomes "claimsMirror + durable". These are documentation edits the B-177 primitives already centralize.

---

## §75.6 — R-3: Keep `LiveTabIndex`; the post-cutover cold-start sequence

`LiveTabIndex` (`live-tab-index.js`) is the ephemeral live-truth oracle — "does tabId N exist and where" — not a binding store (§74.3.3). **Unchanged.** It remains the validation set `sessionMatches` + Phase-1 (`tabEntry && item`) reconcile against.

**Cold-start sequence after the cutover (`initializeLiveState`, `index.js:37-91`):**

1. `Promise.all([buildLiveTabIndex(), initWindowOrdinals(), readyPromise.then(listItems)])` — unchanged (`:42-46`).
2. `preMarkInheritedFromFloatingGroups()` — unchanged (`:61`); marks inherited tabs before reconcile.
3. **`hydrateClaimsMirrorFromDurable()`** (was `prePopulateClaimsFromDurable`, `:75`) — reads `tj:itemClaims`; runs the one-cold-start session→durable shim (§75.4.3) if needed; if `sessionMatches`, seeds `claimsMirror` **directly**; settles `_sessionTag`. **No session write.**
4. `reconcileClaims(items)` (`:79`) — Phase-1 input = snapshot of `claimsMirror` (not `readClaims()`); Phases 2-4 unchanged; W-1 `durableMirrorFullReplace` persists the reconciled set. **No `writeClaims`.**
5. `reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror())` (`:81`) — refreshes the `liveTabId` cache (lazy-rewrite). Unchanged.
6. `bootstrapAndSweepRenderOrder()` (`:87`) — unchanged.

**On-wake reconcile (`idle-reconciler.js:147-189`):** the `'active'` listener calls `reconcileClaims(items)` (`:169`) gated on `readyPromise` (`:164`), which "gates the reconcile invocation until the migration pipeline + initializeLiveState have completed" (`:120-121`). **This gate is load-bearing for the cutover:** it guarantees step 3 (mirror hydration) always precedes any on-wake reconcile, so the on-wake `reconcileClaims` reads an already-hydrated mirror — never an empty one that would force needless inference. Warm-SW re-runs are fast no-ops; cold-SW wakes are preceded by `initializeLiveState`.

---

## §75.7 — Schema / migration / rollback (deliverable 3)

### §75.7.1 — Schema-bump verdict for B-179: **NO `tj:meta` KNOWN_VERSION bump. Unversioned. (R0's claim CONFIRMED.)**

Verified against the migration runner (`migration.js:391-466`): `runMigrations` versions **only `chrome.storage.local` partitions** via `PARTITION_META.schemaVersion`. `chrome.storage.session` is **not** in `ALL_PARTITIONS` (`shapes.js:56-65`), has **no** `defaultShape` entry, **no** validator, and **no** `MIGRATION_STEPS` participation. Retiring a session key therefore changes neither a local-partition shape nor `KNOWN_VERSION`. Under Option A the `tj:itemClaims` shape is **unchanged** (`shapes.js:168-175,265-280`). So **B-179 is unversioned — `KNOWN_VERSION` stays 8, `defaultShape(PARTITION_META)` stays `8` (`shapes.js:158`), no `MIGRATION_STEPS` entry, no schema-version test-pin churn.**

### §75.7.2 — SW module-cache flush

No schema bump means **no migration-driven** toggle-OFF/ON requirement. But B-179 ships new SW *module code* (`tab-claims.js` etc.), so the user must reload the updated extension once to flush the SW module cache — the normal update mechanism. **This reload IS the trigger for the one-cold-start shim (§75.4.3)**, so the CHANGELOG note at R7 should read: *"After updating, toggle the extension OFF then ON in `edge://extensions` so the durable claim store takes over and the legacy session store is retired."* (No "apply schema vN" language — there is no schema change.)

### §75.7.3 — Rollback procedure (trivial — the Option-A payoff)

Because there is **no schema bump**, rollback is a plain `git revert` with **no manual storage surgery** (contrast B-167's v8 rollback, which needed the safe-mode `chrome.storage.local.set` reset, §73.13). The reverted (prior) build re-enables the dual session+durable write. Durable (`tj:itemClaims`) is a **superset** of session — every claim written during the B-179 window is in durable — so the reverted build reconstructs its session Phase-1 input from durable on the next cold start (its own `prePopulateClaimsFromDurable` copies durable→session when `sessionMatches`) or via URL inference otherwise. The session key being absent after the shim is harmless: the reverted build re-creates it. **No data loss, no schema downgrade, no safe-mode.** Two-sentence summary for the BACKLOG: *"Revert is `git revert` only — durable `tj:itemClaims` is a superset of the retired session store, so the prior dual-write build reconstructs session claims from durable on its next cold start with zero data loss; `KNOWN_VERSION` never changed, so there is no safe-mode/migration to unwind."*

### §75.7.4 — Interaction with the deferred B-180 v8→v9 eager migration

The `tj:floatingGroups` v8→v9 eager rewrite (every record carries `liveTabId`+`parentItemId`+`sortOrder`+`floatingTabId`, then delete the position/URL recovery tiers + tolerant multi-shape validator) stays at **B-180** (BACKLOG `:200`). The dependency is one-directional: B-180 **requires** B-179 to have already made the B-175 resolver the single binding authority and `liveTabId` a derived cache; B-180 then makes `liveTabId` mandatory so the recovery tiers can be deleted. B-179 must leave the tiers in place (§75.5). Per §74.12 Risk-3, B-180 should keep the recovery tiers (just stop calling them on the hot path) until a sprint of clean P-4 signal confirms zero orphans before deletion.

---

## §75.8 — Real-browser UAT probe plan (deliverable 4)

The cutover is verifiable only in a real browser (Edge) — `chrome-mock` cannot reproduce session-wipe-on-reload vs SW-restart-in-session, tabId-rotation timing, or focus-shift teardown (§74.11). Each step is **action → UI-observable outcome** (no SW-console state queries, per the S45 retro discipline). Storage-key inspection appears only as a clearly-labeled OPTIONAL developer aid, never as the acceptance signal.

| # | Probe | Action | Expected UI-observable outcome | Folds |
|---|-------|--------|-------------------------------|-------|
| **U-1** | Extension-reload claim preservation | Save bookmark X → `https://music.youtube.com/`; click X to claim tab Y (X shows the live/green dot); toggle the extension OFF then ON in `edge://extensions`; open the sidepanel | X **immediately renders live on the same tab Y**; clicking X **focuses the existing tab** (no duplicate tab opens); Open Tabs does **not** list Y as an unclaimed row | **waived B-167 reload UAT (§74.11 P-1)** |
| **U-2** | Browser-restart recovery | Same setup; fully quit Edge (`File → Exit`); reopen with "Continue where you left off" (Y restored); open the sidepanel; then reload the extension a second time | X renders **live** on the restored tab (one-time URL/position recovery); clicking X focuses it (no dup). After the second reload X is **still live** (proves durable was re-stamped → fast path) | **waived B-167 restart UAT (§74.11 P-2)** |
| **U-3** | Tab discard / restore | Claim tab Y; discard it via `edge://discards`; click the X row (or re-activate Y) | X **stays live with no flicker**; the row never flips to offline; no duplicate tab opens | §74.11 P-3 |
| **U-4** | Sleep / idle wake | Claim Y; sleep the machine past the 60s idle window; wake; open the sidepanel | X **still live** on Y; **exactly one** live row for X (no double-bind); Y not duplicated in Open Tabs | §74.11 P-3 / B-164 |
| **U-5** | Multi-window parity | Parent bookmark P live in window W1; spawn a floating child tab in W2; reload, then restart | The floating child re-appears **under P's group** (not Open Tabs) with the correct cross-window badge; no claim-jump | §74.11 P-5 |
| **U-6** | Floating survives reload + URL collision + stale position | Middle-click inside a bookmarked tab to spawn a floating child under P; also have a separate saved bookmark whose URL **matches** the child's URL; reload | Child re-appears **under P**; the colliding saved bookmark **stays offline** (no claim-jump, D-6); a child whose tab moved slots still re-binds (D-7) | §74.11 P-4 / B-132 / B-137 |
| **U-7** | Import clears stale claims (validates §75.4.4) | Claim several tabs; run Import on a collection that replaces items/groups | Previously-claimed rows **reset correctly**; **no ghost-live rows** pointing at pre-import tabs | new (commit.js sibling) |
| **U-8** | Jump-to-active-window scroll | With tabs across multiple windows, trigger Jump-to-active-window (toolbar icon + keyboard shortcut), on sidepanel + newtab + standalone | The active-window section **scrolls into view, un-occluded by the sticky `.panel-header`**; brief destination flash visible | **waived B-168 UAT (§74.11 P-7)** |
| **U-9** | Rollback smoke | Install the prior build over the B-179 build | Bookmarks/groups intact; live claims reconstruct (rows return live); **no safe-mode banner** (no schema bump) | §75.7.3 |

**Real-browser-mandatory (mock cannot reproduce):** U-1 vs U-3/U-4 (reload-wipe vs SW-restart), U-2/U-3 (tabId rotation timing), U-7 (import+session interplay), U-8 (focus-shift). U-5/U-6 are partly mock-reproducible (B-174 covers the state machine) but the reload/restart distinction is UAT-only. **Probe count: 9 (U-1…U-9); 8 are real-browser-mandatory; 3 fold waived S46 debt (U-1+U-2 = B-167; U-8 = B-168).** When U-1/U-2 pass, the waived S46 B-167 reload/restart UAT closes; when U-8 passes, the waived B-168 jump-scroll UAT closes (§74.11.2).

---

## §75.9 — Test strategy for B-179 (deliverable 5)

The suite is ~2117 assertions across 170 files (1958 `test()`/`it()` blocks). **21 files reference `tj:tabClaims` / `__getSessionStore`** — these are the cutover's blast radius. The session-store assumption is baked in as both **input seeding** and **output asserting**, so the cutover re-points them rather than deletes them.

### §75.9.1 — Existing tests that change/break, by class

| Class | Pattern | Files (representative) | Post-cutover rework |
|-------|---------|------------------------|---------------------|
| **A. Session-as-output assertions** | `__getSessionStore('tj:tabClaims')` deep-equals the reconciled map after `reconcileClaims` | `tab-claims-reconcile.js`(3), `tab-close-claim.js`(3), `window-close-claims.js`(3), `tab-url-change.js`(5), `promote-tab.js`(2), `demote-item.js`(2), `b103-promote-duplicate.js`(2) | Re-point to assert the **durable partition** (`readPartition(PARTITION_ITEM_CLAIMS).entries`) OR the **public surface** (`getItemIdForTab` / `buildLiveStates`). No session write exists to assert. |
| **B. Session-as-input seeding** | `__setSessionStore('tj:tabClaims', {itemId:tabId})` to drive Phase-1 input | `b174` T4 (`:299`), `session-wipe-reclam.js`(3), `b163`(12), `b149`(10), `b132`(5), `b125`(8) | Re-point to seed the **mirror** (warm-SW: pre-populate `claimsMirror`) OR **durable** (`seedPartitions({itemClaims})`). The "SW-restart-in-session: session persisted with stale claims" framing becomes "warm mirror / durable holds stale claims". |
| **C. Session-set-count assertions** | `__getSessionSetCount('tj:tabClaims')` proves a remap persisted | `b164-sleep-claim-remap.js`(10) + the `chrome-mock.js` hatch | Flip to **0** session sets (proves session retired) AND re-target the persistence proof to the **durable** W-5 (`readPartition` shows the remapped `tabId`). |
| **D. Durable-mirror dual-write tests** | `b167-durable-claim-identity.js`(18) asserts session AND durable both written | `b167` | Becomes durable-**only**; the dual-write assertions collapse to single-write; the prePopulate→session-seed tests (§73 T7) re-point to mirror-seed. |
| **E. B-174 E2E safety net** | T1-T7 via public surface | `b174-cold-start-reconciliation-e2e.js`(3 session refs) | See §75.9.2 — mostly stays green by construction. |

**Estimate: all 21 session-touching files get a pass; ~30-50 individual assertions re-point from session → durable/public; the chrome-mock session model STAYS (still needed for the shim's read+remove).**

### §75.9.2 — How B-174's T1 (reload) / T2 (restart) shift

B-174 was built to assert through the **public read surface** precisely so the cutover wouldn't break it — that is the safety-net payoff:

- **T1 (extension-reload, `:151-191`):** the *mechanism* changes (hydrate seeds the **mirror**, not session via `prePopulateClaimsFromDurable`), but T1's **public assertions stay green unchanged** — `getItemIdForTab(200/201)`, `buildLiveStates`, `__getSessionTagForTest()==='reload-tag'`. The one internal line `assert.equal(__getSessionStore('tj:tabClaims'), undefined, 'pre: session wiped on reload')` (`:167`) stays *true* (session is never written) but becomes a tautology — keep it as a "session stays absent" regression guard, or strengthen it to assert the key is **still absent after** `coldStart()` (proves no session write happened). The zero-URL-inference proof (item-B at a drifted URL re-binds, `:173-174`) is unchanged — it now proves durable→mirror hydration + Phase 1.
- **T2 (browser-restart, `:202-237`):** **unchanged, stays green.** T2 already asserts the **durable** path — `readPartition(PARTITION_ITEM_CLAIMS)` re-stamp with the fresh tag + rotated tabIds (`:232-236`) — and never seeds or reads session. Post-cutover this is exactly the contract.
- **T4 (`:296-323`)** is the one B-174 case with a session **input** seed (`__setSessionStore('tj:tabClaims', {…})`, `:299`) — re-point it to seed the **mirror** (or durable) per class B.

### §75.9.3 — New tests pinning the durable-only path

1. **Session-write retirement:** during reconcile/release/reevaluate/claim/remap, `__getSessionSetCount('tj:tabClaims') === 0` (no session write ever fires).
2. **Compat shim (one-cold-start):** seed `__setSessionStore('tj:tabClaims', {item:tab})` + empty durable → `coldStart()` → assert (a) `getItemIdForTab(tab) === item` (mirror bound), (b) `readPartition(PARTITION_ITEM_CLAIMS).entries[item]` exists (durable seeded), (c) `__getSessionStore('tj:tabClaims') === undefined` (key removed). Second `coldStart()` with no session → still bound from durable (proves one-time + idempotent).
3. **Mirror-as-Phase-1-input:** warm SW with `claimsMirror` populated, durable empty, session absent → `reconcileClaims` keeps the live claims (proves Phase 1 reads the mirror snapshot, not session).
4. **Import-commit durable reset (§75.4.4):** seed claims; run the import-commit transient reset → `readPartition(PARTITION_ITEM_CLAIMS).entries` deep-equals `{}` (proves the session.remove→durable-reset swap).
5. **On-wake reconcile reads mirror:** trigger the idle `'active'` path with no session → claims survive from the mirror.
6. **Contract-diff guard (R4 hook):** a test that fails if `reconcileClaims`'s Phase-1 input is a *narrower* set than `{...claimsMirror}` (guards the §75.10 Risk-1 narrowing class).

---

## §75.10 — Risk flags (deliverable 6) — for [scrum-master] / product-owner

**Top 3:**

1. **The Phase-1 input source is the subtle correctness pivot (B-163-narrowing class).** Post-cutover `reconcileClaims` reads `{ ...claimsMirror }` instead of `readClaims()`. This is safe ONLY because (a) cold-start hydrate seeds the mirror from durable before reconcile, and (b) the idle-reconciler's `readyPromise` gate (`idle-reconciler.js:164` / `:120-121`) guarantees hydrate precedes every on-wake reconcile. If a future change calls `reconcileClaims` before hydrate, or narrows the snapshot to a subset (e.g. `evictedItemIds`-only — the exact B-163 R3 Phase-3 narrowing, §74 / CLAUDE.md contract-diff gate), claims silently vanish on wake and **the bug is invisible in tests if fixtures seed both mirror and durable**. **Mitigation:** R4 [code-reviewer] MUST run the contract-vs-implementation diff gate on the Phase-1 input predicate (verbatim `{...claimsMirror}`, no narrowing); ship §75.9.3 test #6 + an invariant comment.

2. **chrome-mock cannot reproduce the reload-wipe vs SW-restart distinction the shim depends on (§74.12 Risk-2).** The compat shim's real correctness — old build wrote session, user updates, new build's first cold start folds session→durable→remove — is **UAT-only** for the actual upgrade timing. The mock can test the shim *mechanics* (§75.9.3 #2) but not the live reload-wipe semantics. **Mitigation:** budget real-browser UAT time for U-1/U-2/U-3 generously; treat them as the acceptance gate, not the mock tests.

3. **The `commit.js:127` sibling write is easy to miss and fails silently (cascade-prune sibling-grep class).** If B-179 retires the session key but leaves the import-commit `chrome.storage.session.remove('tj:tabClaims')`, import stops clearing stale claims → ghost-live rows after import, with no error. **Mitigation:** §75.4.4 re-points it to a durable `entries:{}` reset; R3 grep `tj:tabClaims`/`storage.session` confirms no third consumer; U-7 is the UAT guard.

**Secondary flags (not blocking, surface for decision):**
- **B-179 is an L item with heavy UAT-only verification** (P-1 sprint-fit). The product-owner already authorized the whole B-173 program in Sprint 47, **overriding P-1 with risk acknowledged** (BACKLOG B-173 `:201`). No new decision needed, but the B-179+B-180 pair is the behavior-changing tail — keep it sequenced last with full UAT.
- **Per-entry `sessionTag` dead-weight (Q3, §74.12).** Option A lets it stay deferred (no entry-shape change). No action at B-179; revisit if/when B-180 or B-172 touches the entry shape.
- **Multi-sprint program note (§74.11).** R0 recommended deferring B-179/B-180 to Sprint 48; the product-owner pulled them into Sprint 47. The risk is sprint over-commit, not correctness — flagged for [scrum-master] capacity planning, not a design blocker.

---

## §75.11 — B1 design-confirm sign-off summary

- **Record model:** **Option A** — two record kinds, ONE authoritative persisted store (`tj:itemClaims`); no `tj:itemClaims` shape change; v8→v9 schema bump stays at B-180. R0 lean **confirmed** (post-B-175 code makes it stronger, not weaker — the resolver already validates `liveTabId`).
- **Cutover:** retire `tj:tabClaims` session (durable-only writes at all 5 mutation sites + a one-cold-start session→durable shim that removes the key), re-point `commit.js:127`, demote `floatingGroups.liveTabId` to a derived cache (reclassification — resolver already validates it), keep `LiveTabIndex` as the oracle, read Phase-1 input from the in-memory mirror snapshot.
- **Schema bump for B-179:** **NO** — unversioned (session storage is not `tj:meta`-versioned; confirmed against `migration.js:391-466` + `shapes.js:56-65`). `KNOWN_VERSION` stays 8.
- **Rollback:** plain `git revert` — durable is a superset of session; no data loss, no schema downgrade, no safe-mode.
- **Tests:** 21 session-touching files re-point (~30-50 assertions session→durable/public) + ~6 new durable-only/shim tests; B-174 T1 stays green by construction (public-surface), T2 unchanged, T4 input-seed re-points.
- **UAT:** 9 probes (8 real-browser-mandatory); U-1/U-2 close the waived S46 B-167 UAT; U-8 closes the waived B-168 jump-scroll UAT.
- **Recommended next step:** [scrum-master] routes this Option-A recommendation to the product-owner for sign-off, then B-179 → R1 ([product-manager] writes ACs against this chapter), R2 already substantially captured here.

**End of §75.**
