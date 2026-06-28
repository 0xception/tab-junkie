# §74 — B-173 R0 Spike (Single-Source-of-Truth Tab↔Item Identity Consolidation)

**Owner:** [solution-architect]
**Round:** R0 (Spike-First Tier 3 — XL; R0 mandated before R1 per the XL Spike-First pipeline)
**Sprint:** 47
**Date:** 2026-06-27
**Status:** R0 spike output — read-only static analysis, no product-code or test changes.

---

## §74.1 — Purpose and scope

Discovery spike for **B-173** (P2 / XL, filed 2026-06-27 from the architectural
review of the tab/bookmark tracking state machine). BACKLOG row:
`docs/BACKLOG.md:194`.

The review found that the single most load-bearing fact in the system — *"which
live browser tab corresponds to which saved bookmark item / floating tab"* — is
**stored or re-derived in six places**, and every cross-cutting event must keep
them in sync. When they disagree, the user sees "hard-to-describe" bugs (wrong
tab highlighted; floating tab lands in Open Tabs after reload) with no single
breakpoint to debug. Point-fixes (B-149 / B-163 / B-167 / B-132 / B-125) have
accreted in the reconcilers that paper over disagreement.

Product-owner direction (2026-06-27): **full single-source-of-truth ambition** —
collapse stores 1 + 2 + 4 into one authoritative store, with the in-memory mirror
and `floatingGroups.liveTabId` becoming DERIVED caches, and the low-risk refactors
sequenced as safe early steps. **The explicit S46 lesson is encoded in the
charter: B-167 added a store *alongside* the session store rather than replacing
it — that additive move is what created B-173. R0 must produce a RETIREMENT plan,
not another additive layer.**

This R0 delivers: (1) empirical six-store confirmation with `file:line` drift
points; (2) the SSOT target design; (3) the retirement plan; (4) a sub-item split
(B-174…B-180); (5) migration / rollback / schema impact; (6) a real-browser probe
plan folding in the waived S46 UAT; (7) risk flags + open questions for
[scrum-master] and product-owner.

R0 mirrors the §58 / §64 merged-spike house style — confirm-or-correct with
citations, then recommend tier and sub-item structure.

---

## §74.2 — Investigation method

Read-only static analysis. Files walked in full or in scope:

- `background/tabs/tab-claims.js` (978 lines) — `claimsMirror`, `inheritedTabs`,
  `reconcileClaims` 4-phase, the W-1..W-5 durable PATCH helpers, `sessionMatches`,
  `ensureSessionTag`, `prePopulateClaimsFromDurable`, `remapTabIdInClaims`,
  `releaseClaimByTab`, `reevaluateTab`, `claimTabForItem`, `buildLiveStates`.
- `background/tabs/floating-groups.js` (1344 lines) — `reassociateFloatingGroups`
  (3-tier join + dedup + lazy-rewrite), `appendFloatingGroup`, `moveFloatingTab`,
  `reorderFloatingMembers`, `_resolveRecordIndexByTabId`, the prune variants,
  `remapFloatingGroupsLiveTabId`, `preMarkInheritedFromFloatingGroups`,
  `bootstrapAndSweepRenderOrder`.
- `background/tabs/floating-members.js` (217 lines) — `buildFloatingMembers`
  runtime resolver (3-tier join, tier a/b/c), `collectFloatingTabIds`.
- `background/tabs/live-tab-index.js` (103 lines) — `buildLiveTabIndex`,
  `getLiveTabIndex`, `updateTabEntry`, `removeTabEntry`, `removeTabsByWindow`.
- `background/tabs/drift.js` (104 lines) — `detectDriftForTab`, `writeDrift`,
  `clearDrift`, `getDriftRecords`.
- `background/tabs/tab-events.js` (658 lines) — all `chrome.tabs.*` /
  `chrome.windows.*` listeners; `_applyTabReplacement` (the onReplaced fan-out);
  the onCreated opener-chain block; the onRemoved cascade.
- `background/tabs/idle-reconciler.js` (212 lines) — wake-reconcile +
  `_reconcileActive` race-guard + `_pendingReplacements` drain.
- `background/tabs/index.js` (91 lines) — `initializeLiveState` cold-start order.
- `background/tabs/open-tabs.js` (skim) — `buildOpenTabs` exclusion predicate.
- `background/storage/shapes.js` (418 lines) — partition consts, `defaultShape`,
  validators, `isItemClaims`, `assertShape`, `KNOWN_VERSION` literal source.
- `background/storage/migration.js` (487 lines) — `KNOWN_VERSION = 8`,
  `MIGRATION_STEPS` (all no-op governance bumps v1→v8).
- Design chapters for confirmation: `73-b-167-durable-claim-identity.md`,
  `10.5-livetabindex-tabclaims-architecture.md`, `70-b-163-drift-fallback-reconcile.md`,
  `66-b-137-floating-tab-id-join-key.md`, `69-b-164-sleep-claim-remap.md`.
- Test-surface survey: `grep -rln` over `tests/` for each store + the
  `initializeLiveState` call sites.

Recent-commit context: branch `feature/sprint-47-identity-consolidation` off
`release/v2` at v1.41.0 (Sprint 46 close). HEAD `266ea52` (Sprint 47 open). No
product code touched since S46 close.

---

## §74.3 — Empirical six-store confirmation

The charter lists six identity stores. R0 verified each against current code.
**Verdict per store: CONFIRMED unless noted. Two count claims are corrected.**

### §74.3.1 — Store 1: `tj:tabClaims` (chrome.storage.session) — CONFIRMED

- **What:** `Record<itemId, tabId>`, ephemeral, wiped on reload/restart.
- **Declared:** `tab-claims.js:22` — `const SESSION_KEY = 'tj:tabClaims';`
- **Written:** `writeClaims()` at `tab-claims.js:149-151`
  (`chrome.storage.session.set({ [SESSION_KEY]: claimsMirror })`). Called from
  `reconcileClaims:700`, `releaseClaimByTab:737`, `reevaluateTab:805`,
  `claimTabForItem:894`, `remapTabIdInClaims:969`. **Additionally** written
  directly by `prePopulateClaimsFromDurable` at `tab-claims.js:302` (the B-167
  durable→session seed).
- **Read:** `readClaims()` at `tab-claims.js:140-143`; consumed at
  `reconcileClaims:514` (Phase 1 input).
- **Wipe contract:** session storage is cleared on extension reload AND browser
  restart (Chrome MV3) — the entire reason B-167 exists. Confirmed in the
  `tab-claims.js:4-6` docstring and §73.1.

### §74.3.2 — Store 2: `tj:itemClaims` (chrome.storage.local, durable) — CONFIRMED (and is the additive layer the S46 lesson names)

- **What:** `{ schemaVersion, sessionTag, entries: { itemId → {tabId, claimedAt, sessionTag} } }`,
  durable across reload + restart. Added by B-167 (Sprint 46).
- **Partition const:** `shapes.js:47` — `PARTITION_ITEM_CLAIMS = 'itemClaims'`;
  in `ALL_PARTITIONS` at `shapes.js:64`.
- **Default shape:** `shapes.js:168-175` — `{ schemaVersion: 1, sessionTag: '', entries: {} }`.
- **Validator:** `isItemClaims` at `shapes.js:265-280`; `assertShape` case at
  `shapes.js:407-414`. Allow-list (C-7), forward-permissive.
- **Written:** five PATCH helpers in `tab-claims.js` — W-1 `durableMirrorFullReplace`
  (`:325-355`, called `:709`); W-2/3/4 `durableUpsertEntry` (`:363-409`);
  `durableDeleteEntry` (`:411-439`); W-5 `durableRemapEntry` (`:446-478`). Plus
  `ensureSessionTag` stamps the partition-level `sessionTag` at `:214-222`.
- **Read:** `ensureSessionTag:198` and `prePopulateClaimsFromDurable:267`
  (`readPartition(PARTITION_ITEM_CLAIMS)`).
- **CRITICAL ARCHITECTURAL FACT (confirmed at `docs/design/73-…:12,571-577`,
  §73.11):** B-167 layered `tj:itemClaims` **ABOVE** the session pipeline (as a
  cold-start pre-populator) and **BELOW** it (as a passive mirror of every write).
  The Q5 R2-DECISION explicitly chose to **RETAIN `tj:tabClaims` as
  defense-in-depth in v1; revisit in Sprint 48** after empirical hit-rate signal.
  Out-of-scope item (c) at `73-…:12` says the same. **B-173 IS that Sprint 48
  revisit, pulled forward to Sprint 47.** The recommended follow-up backlog entry
  at `73-…:577` ("deprecate `tj:tabClaims` and consolidate to `tj:itemClaims` as
  the sole source of truth") is, in substance, B-173's B1 sub-item. This is the
  single most useful confirmation in this spike: the retirement target is already
  documented as the intended end-state — B-167 deliberately deferred it.

### §74.3.3 — Store 3: `LiveTabIndex` (in-memory) — CONFIRMED (but it is NOT an identity store — see §74.5)

- **What:** `Map<tabId, {url, title, windowId, active, audible, index, favIconUrl}>`.
- **Declared:** `live-tab-index.js:16` — `const liveTabIndex = new Map()`.
- **Built:** `buildLiveTabIndex()` at `live-tab-index.js:23-37` from
  `chrome.tabs.query({})`, once per cold start.
- **Maintained:** `updateTabEntry` (`:52`), `removeTabEntry` (`:74`),
  `removeTabsByWindow` (`:92`) — driven by the `tab-events.js` listeners.
- **Read:** `getLiveTabIndex()` (`:43`) — consumed by `reconcileClaims`,
  `buildFloatingMembers`, `reassociateFloatingGroups`, `preMarkInheritedFromFloatingGroups`,
  `buildOpenTabs`, `buildLiveStates`, `sessionMatches`, `_resolveRecordIndexByTabId`.
- **Correction/nuance:** `LiveTabIndex` is the live-truth ORACLE (what tabs exist
  + their geometry/url), not a *binding* store. It answers "does tabId N still
  exist, and where," not "which item owns N." R0 treats it as the validation
  oracle the other stores are reconciled against — it should NOT be retired (see
  §74.5 / §74.7). Listing it as one of the "six identity stores" is fair in the
  sense that every resolver reaches into it, but it is categorically different
  from stores 1/2/4 (persisted bindings).

### §74.3.4 — Store 4: `tj:floatingGroups[].liveTabId` (chrome.storage.local, persisted) — CONFIRMED

- **What:** the schema-v4 join key on each floating-group record (`floating record → tabId`).
- **Stamped:** `appendFloatingGroup` at `floating-groups.js:327`; `moveFloatingTab`
  at `:730` (`liveTabIdForRecord`). Validator tolerance at `shapes.js:378-382`.
- **Read / matched (tier a, direct):** `buildFloatingMembers:104-111`,
  `reassociateFloatingGroups:208-211`, `_resolveRecordIndexByTabId:484`.
- **Lazy-rewritten:** `reassociateFloatingGroups:251` →
  `pruneResolvedFloatingGroups:844-846` (the staleLiveTabId patch branch).
- **Remapped on `onReplaced`:** `remapFloatingGroupsLiveTabId:1067-1115` (table 5).
- **Pruned on close:** `pruneFloatingGroupsByLiveTabId:960-1040`.
- **Note:** the record ALSO stores `windowId`, `tabIndex`, `url`, `parentItemId`,
  `groupId`, `sortOrder`, `floatingTabId` — so the floating record is BOTH a
  display record (parent/group/order/url) AND an identity record (`liveTabId`).
  This dual role is why it cannot simply be deleted; the identity field can be
  demoted to a derived cache while the display fields stay (§74.7).

### §74.3.5 — Store 5: URL-normalization matching (`safeNormalizeForMatch`) — CONFIRMED, **count corrected: 6 resolver functions, not ~4**

The same "match a tab to an item/record by normalized URL" logic is
re-implemented across these resolver functions (`grep` evidence):

1. `reconcileClaims` Phase 2 — `tab-claims.js:560,576` (build `urlToTabs`, match `item.url`).
2. `reconcileClaims` Phase 3 drift fallback — `tab-claims.js:674` (match `record.driftedToUrl`).
3. `reevaluateTab` auto-claim — `tab-claims.js:795`.
4. `buildFloatingMembers` tier (c) — `floating-members.js:125,128`.
5. `reassociateFloatingGroups` URL fallback — `floating-groups.js:225,228`.
6. `preMarkInheritedFromFloatingGroups` URL corroboration + fallback —
   `floating-groups.js:1169,1193,1205`.

(`drift.js:39-40` also calls `safeNormalizeForMatch`, but that is drift
*detection* — comparing a claimed tab's URL to its item's URL — not tab↔item
*resolution*, so R0 excludes it from the resolver count.) **The charter's "~4
sites" undercounts: there are 6 distinct resolver functions doing URL-match
re-derivation.** This strengthens the A1 case (one shared resolver).

### §74.3.6 — Store 6: `(windowId, tabIndex)` position matching — CONFIRMED, **count corrected: 4 sites, not ~3**

The `entry.windowId === record.windowId && entry.index === record.tabIndex`
position-match predicate appears at:

1. `buildFloatingMembers` tier (b) — `floating-members.js:117`.
2. `reassociateFloatingGroups` position match — `floating-groups.js:216`.
3. `_resolveRecordIndexByTabId` tier (b) — `floating-groups.js:496`
   (`rec.windowId === live.windowId && rec.tabIndex === live.index`).
4. `preMarkInheritedFromFloatingGroups` position match — `floating-groups.js:1192`.

**The charter's "~3 sites" undercounts by one — there are 4.** Together with §74.3.5
this is the duplicated-resolver surface A1 consolidates (10 call-sites across two
matching strategies, spread over 6 functions).

### §74.3.7 — Summary table

| # | Store | Persist layer | Write sites | Read/match sites | Retire / keep |
|---|-------|--------------|-------------|------------------|---------------|
| 1 | `tj:tabClaims` | session | `tab-claims.js` ×6 (`:700,737,805,894,969` + `:302`) | `:140-143` → `:514` | **RETIRE (B1)** |
| 2 | `tj:itemClaims` | local (durable) | W-1..W-5 `:325-478` | `:198,267` | **PROMOTE to sole authority (B1)** |
| 3 | `LiveTabIndex` | in-memory | `live-tab-index.js:52,74,92` | `getLiveTabIndex()` everywhere | **KEEP (live oracle)** |
| 4 | `floatingGroups[].liveTabId` | local | `floating-groups.js:327,730` (+ remap/lazy-rewrite) | tier-(a) `:104-111,208-211,484` | **DEMOTE to derived cache (B1/B2)** |
| 5 | URL-match (`safeNormalizeForMatch`) | re-derived | n/a | **6 functions** (§74.3.5) | **CONSOLIDATE into 1 resolver (A1)** |
| 6 | `(windowId,tabIndex)` position-match | re-derived | n/a | **4 sites** (§74.3.6) | **CONSOLIDATE into 1 resolver (A1)** |

---

## §74.4 — Drift-point catalog (where two stores disagree)

The core of the bug class: every pair below has a window in which the two stores
hold different answers to "who owns this tab." Each is the seed of a
"hard-to-describe" bug.

- **D-1 — session (1) vs durable (2), best-effort skew.** Every claim mutation
  writes session synchronously (`writeClaims`) then PATCHes durable in a
  *separate* `await` (e.g. `reevaluateTab:805` then `:814`; `releaseClaimByTab:737`
  then `:744`). The durable PATCH is best-effort (`.catch` swallow, e.g. `:403-408`).
  If the durable write fails or the SW dies between the two awaits, session has
  the claim and durable does not → the next extension reload *loses* a claim that
  was live pre-reload. Self-heals only if the URL still matches at next cold start
  (inference backstop). This is the dual-write amplification §73.11 accepted as
  "belt-and-suspenders" — B-173 removes the skew by removing one of the two writes.
- **D-2 — session (1) wiped, durable (2) survives, `sessionMatches` false-negative.**
  At reload the truth lives only in durable. `prePopulateClaimsFromDurable` copies
  durable→session ONLY when `sessionMatches` ≥ 0.5 (`tab-claims.js:280`). A
  false-negative (e.g. many tabs discarded during the idle window) discards
  durable knowledge and forces full inference — exactly the cost B-167 tried to
  avoid. The threshold is a heuristic papering over the absence of a single
  authority.
- **D-3 — `claimsMirror` (in-memory) vs session (1), reconcile async-gap.** The
  B-164 M-2 race (`idle-reconciler.js:47-73`): `reconcileClaims` snapshots
  `storedClaims` at `:514`, awaits Phase-3 storage reads, and an interleaved
  `onReplaced` updates `claimsMirror` + `writeClaims` during the gap; on resume,
  `reconcileClaims` overwrites with its pre-remap snapshot. Papered over by the
  `_reconcileActive` flag + `_pendingReplacements` queue. This race exists *because*
  reconcile re-derives truth instead of reading an authority.
- **D-4 — `claimsMirror` (1/2) vs `floatingGroups.liveTabId` (4), double-home.**
  A tab can be simultaneously claimed (in `claimsMirror`) AND carry a floating
  record. The system resolves the conflict in two places independently:
  `reassociateFloatingGroups` prunes matched-AND-claimed records (`floating-groups.js:236-243`),
  and `buildFloatingMembers` skips claimed tabs (`floating-members.js:139`). Between
  the SW event that claims a tab and the next cold-start prune, the two stores
  disagree → "wrong tab highlighted" / the same tab shown as both a saved-item
  live row and a floating row.
- **D-5 — `floatingGroups.liveTabId` (4) vs `LiveTabIndex` (3), onReplaced skew.**
  `onReplaced` must remap table 1+2 (`remapTabIdInClaims`), table 4
  (`remapFloatingGroupsLiveTabId`), table 5-eval-timers, all fire-and-forget
  (`tab-events.js:119-128`). If one PATCH fails, `liveTabId` points at a dead
  handle while `claimsMirror` is correct (or vice versa). Recovered only at the
  next cold-start position/URL fallback.
- **D-6 — URL re-derivation (5) vs the stored binding — the B-132 claim-jump.**
  `reconcileClaims` Phase 2 re-derives ownership by URL; a floating tab whose URL
  collides with a saved item gets auto-claimed away from its parent group. Papered
  over by `preMarkInheritedFromFloatingGroups` + the `inheritedTabs` gate
  (`tab-claims.js:592`, `:790`). The gate is a second derived store layered on the
  first to suppress a false positive of URL re-derivation.
- **D-7 — position re-derivation (6) vs reality — the B-132 stale-position false
  positive.** A record's `(windowId, tabIndex)` can coincidentally match an
  unrelated tab that drifted into that slot
  (`floating-groups.js:1171-1200` documents this); the false match falsely marks a
  tab `inherited`, breaking the B-163 relief. Papered over by adding URL
  corroboration to the position match (`:1193`). Two derivation strategies
  disagreeing required a third rule to adjudicate.

**Pattern:** six of the seven drift points exist because ownership is *re-derived*
(by URL, by position, by reconcile) instead of *read from a single authority*. The
reconcilers (`reconcileClaims` 4-phase, `reassociateFloatingGroups` 3-tier,
`preMark`, drift fallback, the onReplaced/onRemoved fan-outs, the idle-reconciler
queue) are all adjudication machinery for disagreements that a single authority
would make impossible.

---

## §74.5 — Single-source-of-truth target design (B1)

### §74.5.1 — Authoritative store

**`tj:itemClaims` (chrome.storage.local, durable) becomes the sole persisted
authority for "which tab is bound to which identity."** It is the natural
candidate (already durable, already the cold-start pre-populator, already the
documented end-state per §73.11). The collapse is **1 + 2 + 4 → one store**:

- Store 1 (`tj:tabClaims` session) is RETIRED — the in-memory `claimsMirror`
  hydrates directly from `tj:itemClaims` at cold start, removing the
  durable→session→Phase-1 hop.
- Store 4 (`floatingGroups.liveTabId`) is DEMOTED — the binding (tab↔floating
  record) is resolved by the single resolver and cached in memory; the persisted
  `liveTabId` becomes a *hint* re-derived once per cold start, not a parallel
  authority. The floating record retains its *display* fields
  (`parentItemId`/`groupId`/`sortOrder`/`url`/`floatingTabId`).

### §74.5.2 — Canonical record shape

Two viable shapes; R0 recommends the lower-risk **Option A** for B1, with
**Option B** flagged as a product-owner decision (Q2, §74.11):

- **Option A (keep two record kinds, one store):** `tj:itemClaims.entries`
  continues to key saved-item claims by `itemId`. Floating bindings stay in
  `tj:floatingGroups` records but their `liveTabId` is no longer trusted as an
  independent source — it is overwritten by the single resolver. *No schema-shape
  change to `itemClaims` at B1.* The "single source of truth" is achieved at the
  *resolution* layer (one resolver, §74.5.3) plus the *persistence* layer (durable
  only) without merging the two record types. Lowest risk.
- **Option B (one unified binding record):** fold floating membership into
  `tj:itemClaims` so every live binding — saved-item claim OR floating member —
  is one record:
  ```
  entries[bindingId] = {
    kind: 'claim' | 'floating',
    tabId, sessionTag, claimedAt,
    itemId?,            // for kind==='claim'
    parentItemId?, groupId?, sortOrder?, url?,  // for kind==='floating'
  }
  ```
  This is the "truest" SSOT but is a v8→v9 schema change with an eager migration
  of `tj:floatingGroups` into the unified store — a much bigger blast radius.
  Defer the decision to product-owner; R0 recommends Option A for B1 and treating
  Option B as a possible B2+ follow-on only if empirical signal warrants.

### §74.5.3 — In-memory mirror + the derived resolver

- **`claimsMirror` stays the synchronous read-hot surface.** `buildLiveStates`
  (`tab-claims.js:836`) and `buildOpenTabs` (`open-tabs.js:38`) keep reading the
  in-memory mirror, so the §73.11 latency concern (don't read local storage on
  every reconcile/lookup) is fully addressed — only the *persistence* layer
  changes (durable instead of session+durable), not the read path.
- **One derived resolver (A1) replaces the 10 duplicated match sites.** A single
  function `resolveTabForRecord(record, liveTabIndex, claimsMirror)` (and its
  inverse) implements the canonical 3-tier join ONCE:
  (a) trust `liveTabId`/`tabId` iff `liveTabIndex.has(it)` AND the session is
  trusted; (b) `(windowId, tabIndex)` position recovery; (c) URL recovery. Every
  current call site (`reconcileClaims` Phase 2/3, `reevaluateTab`,
  `buildFloatingMembers`, `reassociateFloatingGroups`, `preMark`) calls this one
  resolver. The resolver's output is cached in a `Map<tabId, binding>` rebuilt on
  cold-start + `onReplaced` + `onRemoved`, so steady-state reads are O(1) and never
  re-derive.

### §74.5.4 — URL/position matching becomes one-time RECOVERY, not steady-state truth

Tiers (b) position + (c) URL are demoted from "consulted on every resolve" to
"consulted only when the trusted binding is unavailable" — i.e. at cold start when
`liveTabId` is stale/missing, or at browser restart when all tabIds rotated. In
steady state, tier (a) direct-binding is authoritative and the recovery tiers are
dead paths. This is the architectural inversion the SSOT delivers: derivation
moves from the hot path to a one-shot recovery path.

### §74.5.5 — Relationship of `LiveTabIndex`

Unchanged. `LiveTabIndex` remains the ephemeral live-truth oracle: it answers
"does this tabId still exist and where," and is the validation set the authority
is reconciled against at cold start (`sessionMatches`, Phase 1 `tabEntry && item`).
It is never a *binding* store and is not retired.

---

## §74.6 — Browser-restart authority case (tab IDs rotate)

The hardest case, addressed explicitly per the charter:

- On **browser restart**, Chromium rotates every tabId. All durable `tabId`/
  `liveTabId` values are stale. `sessionMatches` (`tab-claims.js:167-176`) returns
  false (stamped `sessionTag` no longer matches; resolved-ratio ≈ 0).
- **Authority then = the one-time recovery resolver (§74.5.4), run once.** The
  resolver re-binds each durable record to a current tab via tier (b) position →
  tier (c) URL recovery, mints a fresh `sessionTag` (`ensureSessionTag:211`), and
  re-stamps `tj:itemClaims` with the new `sessionTag` + recovered tabIds (W-1
  full-replace, `:709`). After that single pass, tier (a) direct-binding is
  authoritative for the rest of the session.
- This is *exactly today's inference pipeline* (Phase 2 URL + Phase 3 drift
  fallback), but (i) consolidated into the single resolver, (ii) run once at
  cold-start instead of being a standing source of truth, and (iii) followed by an
  authoritative durable re-stamp so the next *reload* (not restart) hits the
  trusted fast path. **No regression to the B-149 / B-163 / B-164 backstop** — the
  recovery resolver subsumes them; their tests become the recovery resolver's
  tests.
- Net: the authority is `tj:itemClaims` when `sessionMatches` is true (reload), and
  the one-time recovery resolver when false (restart). There is never *more than
  one* live authority at a time — the ambiguity that produces D-1..D-7 is removed.

---

## §74.7 — Retirement plan (MANDATORY — the explicit S46 lesson)

**No new additive layer.** Each redundant store is removed or demoted to a derived
cache, in this order:

### Step R-1 — Retire `tj:tabClaims` (session, store 1). [sub-item B-179 / B1]

- **Change:** replace the dual session+durable write with **durable-only**.
  `claimsMirror` hydrates at cold start directly from `tj:itemClaims` (filtered by
  `sessionMatches` + `liveTabIndex.has`), not via the durable→session copy. Delete
  `readClaims`/`writeClaims` session calls; the five mutation sites
  (`reconcile`/`release`/`reevaluate`/`claim`/`remap`) write durable only.
- **Compatibility shim (one cold start):** on first post-upgrade cold start, if
  `tj:itemClaims.entries` is empty BUT a `tj:tabClaims` session value exists (the
  SW-restart-within-same-session, pre-upgrade case), seed durable from session
  once, then never read/write session again. After the shim window, remove the
  session key (`chrome.storage.session.remove('tj:tabClaims')`).
- **Why this is retirement not addition:** the dual-write goes from 2 stores → 1;
  `prePopulateClaimsFromDurable` collapses from "copy durable→session so Phase 1
  reads it" into "hydrate `claimsMirror` from durable directly." Net code DELETED.

### Step R-2 — Demote `floatingGroups.liveTabId` (store 4) to a derived cache. [B-179 / B1, completed by B-180 / B2]

- **Change:** the in-memory derived resolver (A1) owns tab↔floating resolution.
  `liveTabId` persists as a hint, authoritatively recomputed by the resolver on
  cold-start + `onReplaced`. The 3-tier *read* join in `buildFloatingMembers`
  collapses to "consult the resolver's cached Map."
- **Compatibility shim:** none needed for the demotion itself (the field stays;
  only its authority status changes). The eager floatingGroups v4-only migration
  (R-3) finishes the job.

### Step R-3 — Consolidate URL-match (store 5, 6 fns) + position-match (store 6, 4 sites) into ONE resolver, then delete the duplicated tiers. [B-175 / A1, finalized by B-180 / B2]

- **Change:** A1 extracts the single resolver and routes all 10 call sites through
  it (pure refactor, no behavior change, guarded by A0). B2 then *deletes* the
  per-call-site position/URL fallback tiers, leaving them only inside the resolver's
  one-time recovery path, and eager-migrates `tj:floatingGroups` to v4-only
  (every record carries `liveTabId`) so the recovery tiers are no longer needed in
  steady state.

### Step R-4 — `LiveTabIndex` (store 3): KEEP. Not retired (it is the live oracle, §74.5.5).

**End-state:** identity persists in ONE durable store (`tj:itemClaims`); the
in-memory `claimsMirror` + the resolver's `Map<tabId, binding>` are derived caches
of it; `LiveTabIndex` is the live oracle; URL/position matching is one shared
recovery function invoked once at cold-start/restart. Six stores → one durable
authority + one live oracle + two derived caches, with ten duplicated match sites
collapsed to one.

---

## §74.8 — Sub-item split (for [scrum-master] / product-owner approval)

Proposed IDs B-174…B-180, mapped to the review's A0–A4 / B1–B2 roadmap and
resequenced where the code warrants.

| ID | Name | Maps to | Tier | Behavior change? | Depends on | Risk |
|----|------|---------|------|------------------|------------|------|
| **B-174** | End-to-end cold-start reconciliation integration test (safety net) | A0 | **M** | No (test-only) | — | **Low**. Pure test. Seeds all 6 stores + asserts the full cold-start across session/durable/floating/drift; folds in waived B-167 reload/restart UAT where chrome-mock-reproducible. |
| **B-175** | Extract ONE shared tab↔item resolver (collapse the 6 URL-match fns + 4 position-match sites) | A1 | **L** | No (pure refactor) | B-174 | **Medium**. Touches 6 functions / 10 call sites in the hottest subsystem. Guarded by B-174. |
| **B-176** | Split `floating-groups.js` (1344 LOC, ~8 jobs) into ~4 cohesive modules | A2 | **M** | No (pure refactor) | B-174 (B-175 preferred first) | **Low-Medium**. Mechanical module split; import-graph + circular-import care. |
| **B-177** | Extract + name the `onReplaced`/`onRemoved` fan-out primitives with ONE documented table list | A3 | **M** | No (pure refactor) | B-174 | **Low-Medium**. Names the 6-table remap + onRemoved 7-subsystem cascade as named primitives; one canonical table inventory (kills the scattered "table N" comments). |
| **B-178** | Decompose `reconcileClaims` into named `Phase1..Phase4` + explicit durable-restore step | A4 | **M** | No (pure refactor) | B-174, B-175 | **Medium**. The hottest function; encodes 5 ticket histories. Behavior-preserving decomposition only. |
| **B-179** | Collapse identity to ONE authoritative store (retire `tj:tabClaims` session; hydrate `claimsMirror` from durable; demote `liveTabId` to derived cache) | B1 | **L** | **Yes (storage cutover)** | B-174, B-175, B-178 | **High**. The real fix. Storage-source cutover; SW-restart compat shim; chrome-mock cannot reproduce session-wipe-vs-SW-restart → heavy UAT burden. |
| **B-180** | One-time eager migration of `tj:floatingGroups` to v4-only + delete position/URL fallback tiers + tolerant validator | B2 | **M/L** | **Yes (eager migration + schema bump)** | B-179, B-175 | **Medium-High**. v8→v9 eager data migration; deleting recovery tiers risks orphaning legacy records if recovery resolver doesn't fully subsume them. |

**Tier-C deferrals (NOT split into B-173 sub-items; return to BACKLOG icebox):**
single source of truth for display order (`renderOrder` vs the two `sortOrder`
fields); raising message-contract altitude (hide claims/drift/floating internals
from the UI); dead-weight cleanup (`Item.lastAccessedAt`, per-entry `sessionTag`,
`Group.collapsed` UI-state-in-storage, legacy theme aliases). Per the BACKLOG row
these are explicitly out of B-173's invisible-reliability scope.

---

## §74.9 — Recommended execution sequence

Per the review's "A0 → A1 → spike-confirm B1," resequenced for the code:

1. **B-174 (A0)** FIRST — the safety net. Nothing else proceeds until the
   end-to-end cold-start integration test exists and passes against current code.
2. **B-175 (A1)** — the shared resolver. Behavior-preserving; B-174 guards it.
3. **Spike-confirm B1** — a short [solution-architect] confirmation pass after
   B-175 lands: with the resolver extracted, re-verify the B-179 cutover design
   against the now-consolidated code before committing the storage change.
4. **B-176 / B-177 / B-178 (A2/A3/A4)** — pure refactors; interleave as capacity
   allows (each is M, behavior-preserving). B-178 prefers B-175 first.
5. **B-179 (B1)** — the storage cutover. After B-174 + B-175 + B-178.
6. **B-180 (B2)** — eager floatingGroups migration + delete fallback tiers + schema
   bump. Last, after B-179.

**Sprint-fit caveat (see §74.11 Risk-1):** the full program is multi-sprint.
R0 recommends Sprint 47 take **B-174 + B-175 + the B1 spike-confirm** (the safety
net + the consolidating refactor + the go/no-go on the cutover), and defer
**B-179 + B-180** (the behavior-changing L items) to Sprint 48, with B-176/177/178
slotted opportunistically. This honors P-1 (max one L/XL active) and keeps the
behavior-changing storage cutover in its own sprint with full UAT.

---

## §74.10 — Migration / rollback / schema impact (C-1a / C-1b)

| Sub-item | Persisted shape change? | KNOWN_VERSION | Strategy | Rollback |
|----------|------------------------|---------------|----------|----------|
| B-174 (A0) | No | 8 (unchanged) | n/a | n/a |
| B-175 (A1) | No | 8 | n/a | git revert (pure refactor) |
| B-176 (A2) | No | 8 | n/a | git revert |
| B-177 (A3) | No | 8 | n/a | git revert |
| B-178 (A4) | No | 8 | n/a | git revert |
| B-179 (B1) | **No** if Option A (§74.5.2) — `itemClaims` shape unchanged; only the *write/read layer* changes (session retired). **Yes (v8→v9)** if Option B unified record. | 8 (Option A) / 9 (Option B) | Option A: no migration (session retire is not a `tj:meta` schema concern — session storage isn't versioned). Compat shim seeds durable from session once. | Revert restores dual-write; durable data is a superset, no loss. |
| B-180 (B2) | **Yes** — eager `tj:floatingGroups` v4-only rewrite | **9** | **Eager** `MIGRATION_STEPS` v8→v9 that rewrites every floatingGroups record to carry `liveTabId` (recover via resolver) + drops the position/URL recovery tiers from steady state | Revert to v8 reads v4-stamped records fine (the v4 field is already tolerated at `shapes.js:378-382`); no data loss. |

**C-1a/C-1b verdict:** the *only* schema bump in the whole B-173 program is at
**B-180 (B2), v8→v9, eager strategy**. It requires, in lock-step: `KNOWN_VERSION`
`8→9` (`migration.js:110`); `defaultShape(PARTITION_META)` literal `8→9`
(`shapes.js:158`); a v8→v9 `MIGRATION_STEPS` entry (eager, not no-op); the five
schema-version test pins updated (the same set B-167 enumerated at §73.9.2 —
`tests/migration-fresh-install.test.js`, `tests/b148-schema-v7.test.js` [now v8],
`tests/sync-schema-v5.test.js`, `tests/storage-init.test.js:18` if
`ALL_PARTITIONS` length changes under Option B, `tests/b040-…:667`); and a
**CHANGELOG SW module-cache flush note** ("toggle the extension OFF then ON in
`edge://extensions` after update to flush the SW module cache and apply schema
v9"). B-179 under Option A needs **no** `tj:meta` bump (session-storage retirement
is not versioned), which is the recommended path. **If product-owner picks Option
B (unified record) the bump moves earlier to B-179 (v8→v9) and the eager migration
folds floatingGroups into `itemClaims` — larger blast radius; R0 recommends against
it for the first pass.**

Rollback discipline: B-179 ships with the documented compat shim and an explicit
"durable is a superset of session — reverting cannot lose claims" note. B-180's
eager migration ships with the standard storage-migration rollback (v9 records are
forward-readable by v8 code because `liveTabId` is already an optional tolerated
field).

---

## §74.11 — Empirical real-browser probe plan

R0 cannot run a browser. The probes below MUST run at the relevant sub-item's R5
(B-179/B-180 especially). **The waived S46 UAT is folded in** so that debt is
covered when this program lands.

### §74.11.1 — Core SSOT probes (B-179 / B-180 R5)

- **P-1 Extension reload, claims preserved (folds waived B-167 reload UAT).**
  Bookmark X claimed to tab Y; reload via `edge://extensions` ↻; assert X still
  shows live on Y, zero duplicate tab, with `tj:tabClaims` session key now ABSENT
  (B-179 retired it) and `claimsMirror` hydrated from `tj:itemClaims`. Inspect the
  SW console: confirm no session read/write occurred.
- **P-2 Browser restart, one-time recovery (folds waived B-167 restart UAT).**
  Same setup; fully quit + reopen Edge (Continue-where-you-left-off). Assert
  `sessionMatches` returns false, the recovery resolver re-binds X by URL/position
  once, durable is re-stamped with a fresh `sessionTag`, and a *subsequent reload*
  hits the trusted fast path (P-1 behavior).
- **P-3 Tab discard / restore / sleep.** Discard a claimed tab (`edge://discards`
  or memory pressure); on restore, assert `onReplaced` remaps the binding (table-1
  durable PATCH) and X stays live with no flicker. Idle/sleep the machine past the
  60s idle window; on wake assert the idle-reconciler recovery does not double-bind.
- **P-4 Floating tab survives reload (B-132 + B-137 regression).** Spawn a floating
  tab under parent P; reload; assert it re-appears under P (not Open Tabs), and the
  derived resolver — not three independent re-derivations — produced the binding.
  Include the D-6 URL-collision case (floating tab URL matches another saved item)
  and the D-7 stale-position case.
- **P-5 Multi-window parity.** Parent in W1, floating tab in W2; reload + restart;
  assert correct group placement + window badge with no claim-jump.
- **P-6 onReplaced fan-out integrity (B-179/B-177).** Force a discard during a
  wake-reconcile (the B-164 M-2 race window); assert the `_pendingReplacements`
  drain still applies the remap against the single authority (no overwrite).

### §74.11.2 — Folded waived S46 UAT

- **B-167 (durable-identity reload/restart preservation):** covered by P-1 + P-2
  above — this is the exact scenario S46 deferred. Mark the S46 waived B-167 UAT
  closed when P-1/P-2 pass.
- **B-168 (jump-to-active-window scroll):** the jump-to-window scroll-into-view
  UAT (sticky-header occlusion / Edge 4-shortcut cap, per the two B-168 hotfix
  commits `b59de3f`/`c310078`). Not identity-related, but it is open S46 debt the
  charter asks to fold in: add **P-7 — jump to a saved item live in a non-focused
  window; assert the target row scrolls into view un-occluded by the sticky
  `.panel-header`, across sidepanel + newtab + standalone.** Owned by whichever
  sub-item touches the UI last (or a standalone Fast-Track if B-173 stays
  SW-internal). R0 flags it so it is not lost again.

`chrome-mock` cannot reproduce: session-wipe-on-reload vs SW-restart (P-1 vs P-3),
tabId rotation timing (P-2/P-3), focus-shift teardown (P-7). These are UAT-only
signal classes — B-174's integration test covers the mock-reproducible subset; the
rest are real-browser-only.

---

## §74.12 — Risk flags & open questions (for [scrum-master] / product-owner)

### Top 3 risk flags

- **Risk-1 — XL decomposes into a multi-sprint program; P-1 cannot hold for a
  single sprint.** B-173 splits into 7 sub-items, two of them **L** (B-175 A1,
  B-179 B1). CLAUDE.md P-1 allows max one L/XL active at a time. The full
  A0→B2 program will not fit Sprint 47. **Decision needed before R1:** R0
  recommends Sprint 47 = B-174 (A0) + B-175 (A1) + the B1 spike-confirm; defer
  B-179 + B-180 (the behavior-changing L items) to Sprint 48. Without this split
  the sprint over-commits and the behavior-changing cutover gets rushed.
- **Risk-2 — B-179 storage cutover correctness, UAT-only verification.** Retiring
  the session store changes the cold-start hydration source. The
  SW-restart-within-same-session path (session survives, durable may be one cold
  start behind) needs the compat shim to be exactly right or it regresses the very
  reload-preservation B-167 added. `chrome-mock` does not model session-wipe-on-
  reload vs SW-restart, so the regression surface is UAT-only (P-1/P-3). High
  empirical-verification burden; budget real-browser UAT time generously.
- **Risk-3 — B-180 "delete fallback tiers" can orphan records.** Deleting the
  per-call-site position/URL recovery tiers assumes the single resolver's one-time
  recovery fully subsumes them, AND the eager v4-only migration touches every
  record. Any record the eager migration misses (corrupt, mid-write, legacy v3
  with no `liveTabId` and a tab that's not currently live) loses its recovery path
  and orphans its floating tab. Eager migration also touches live floating data
  during the cold-start window — exactly what B-121/B-137 avoided with lazy
  migration. Mitigation: keep the recovery resolver's tiers (just stop calling
  them on the hot path) until a full sprint of P-4 signal confirms zero orphans,
  then delete.

### Open questions (product-owner input before R1)

- **Q1 (timeline):** single multi-sprint EPIC vs Sprint-47-A-tier-only +
  Sprint-48-B-tier? R0 recommends the latter (Risk-1).
- **Q2 (record model):** Option A (keep two record kinds, consolidate at the
  resolver + persistence layer — no `itemClaims` shape change, recommended) vs
  Option B (one unified binding record folding floating into `itemClaims` —
  truest SSOT, v8→v9 schema, bigger blast radius)? Decide before B-179 R1.
- **Q3 (dead-weight):** retain or drop the per-entry `sessionTag` (B-167's
  forward-compat field for the deferred B-172 url-history) during the
  consolidation? It is Tier-C dead-weight today; dropping it is a shape change.
- **Q4 (B-168 debt owner):** which sub-item (or a standalone Fast-Track) owns the
  folded-in P-7 jump-to-window scroll UAT, given B-173 is otherwise SW-internal?

---

## §74.13 — Sign-off and next round

- **R0 outputs:** this chapter (§74).
- **Six-store confirmation:** all six CONFIRMED; two count corrections (URL-match
  is **6 resolver functions**, not ~4; position-match is **4 sites**, not ~3);
  `LiveTabIndex` reclassified as live-oracle (keep) rather than a binding store.
  Key confirmation: B-167 §73.11 already documents this retirement as the intended
  "Sprint 48 revisit" — B-173 is not new architecture, it is the deferred
  collapse B-167 deliberately postponed.
- **SSOT target:** `tj:itemClaims` (durable) becomes the sole persisted authority;
  `claimsMirror` + a derived resolver `Map` are caches of it; `floatingGroups.liveTabId`
  demotes to a derived hint; URL/position matching collapses into one one-time
  recovery resolver; `LiveTabIndex` stays the live oracle.
- **Tier:** confirmed **Spike-First XL**, decomposed into 7 reviewable sub-items
  (B-174…B-180), at least one of which (the cutover) is itself L-tier.
- **Schema-bump verdict:** ONE bump across the program — **v8→v9 eager at B-180
  (B2)** under the recommended Option A. (Option B would move a v8→v9 bump earlier
  to B-179.)
- **Recommended next step:** [scrum-master] reviews the Risk-1 timeline split and
  the Q1–Q4 product-owner questions, then routes **B-174 (A0) to R1** as the first
  sub-item (safety net before any refactor). B-175 (A1) R1 follows. The B-179/B-180
  R1s gate on the post-A1 spike-confirm and the Q1/Q2 decisions.

**End of §74.**
