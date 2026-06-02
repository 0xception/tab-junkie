# §73 — Durable claim identity (B-167)

**Status:** R2 DESIGN — Sprint 46 active branch `feature/sprint-46-claim-identity`. R0 spike committed `144d8bb`; R1 LOCKED in `docs/findings/sprint-46.md`; R2 this chapter. R3 build pending.
**Anchor:** B-167 (P1 / XL). Spike-First. Sibling-precedent of §65 (B-132 cold-start claim-jump fix), §69 (B-164 sleep / discard-restore remap), §70 (B-163 drift URL fallback).
**Tier:** Spike-First (XL).
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture); §53 (B-110 paired-clear surfaces); §65 (B-132 cold-start re-population of `inheritedTabs`); §69 (B-164 5-table remap + wake-reconcile race-guard); §70 (B-163 Phase 3 drift-URL fallback + Phase 4 conditional drop + R4 HIGH-1 graceful-degradation pattern); B-149 ✅ (Phase 1 URL-drift survival predicate). New chapter for the durable `tj:itemClaims` partition introduced by Durable claim identity.
**Author:** [solution-architect] (Opus). Written BEFORE R3 build, per S44 retro action item 1 (chapter-first).

**Out-of-scope (explicit):**
(a) URL-history per claim — deferred to follow-up Durable claim history (B-172) per Q1 product-owner decision (R0 spike). Schema v8 design does NOT preclude a future v9 bump that adds an optional `urlHistory: string[]` field; the validator in §73.3.4 tolerates the extra field through allow-list semantics.
(b) `chrome.sessions` API integration — REJECTED at R0 (`docs/findings/sprint-46.md:23`); no public surface bridges old→new tabId across a Chromium session restore.
(c) Removal of the existing `tj:tabClaims` session-storage path — see §73.11 (Q5 PICK: retain as defense-in-depth in v1; revisit in Sprint 48 after empirical hit-rate signal).
(d) Telemetry counter for durable-hit-rate vs inference-hit-rate — see §73.10 (Q4 PICK: defer to a separate diagnostics item using the new `shared/diag.js` (B-171) helper).
(e) Any sidepanel / newtab / popup / standalone UI surface change — Durable claim identity is purely SW-internal storage + cold-start orchestration. No row markup, no badge, no theme token, no message contract addition. `shared/messages.js` unchanged.
(f) Changes to the B-149 URL-mismatch claim-preservation contract or the B-163 Phase 3 / Phase 4 drift logic beyond the additive pre-population at Phase 1's input.
(g) Phase 1/2/3/4 algorithm structure — preserved verbatim. Durable identity is layered ABOVE the existing pipeline as a pre-populator and BELOW the existing pipeline as a passive mirror of every write.

---

## §73.1 — Problem statement

The current claim subsystem (`background/tabs/tab-claims.js`) persists item→tab bindings in `chrome.storage.session` under the key `tj:tabClaims` (`background/tabs/tab-claims.js:16`). Session storage survives service-worker (SW) cold start within one browser session but is wiped on:

- Extension reload (toggle OFF/ON in `edge://extensions`, the `↻` reload button, or any unpacked-code change pushed during development).
- Browser restart (whether by user choice, OS update, or crash recovery, including the "Continue where you left off" path).
- SW crash + restart without a full browser restart (rare; same code path as extension reload from the storage perspective).
- OS sleep / lid-close paths where the SW is killed by the OS during the sleep window (the well-known MV3 idle gap behind B-149).

On every wipe, the cold-start `reconcileClaims` (`tab-claims.js:139`) enters with `storedClaims = {}` and must reconstruct every item↔tab binding from scratch using the Phase 2 primary-URL match (`tab-claims.js:182-231`) and the Phase 3 drift-URL fallback (`tab-claims.js:233-324`). Reconstruction is structurally fragile because it relies on URL inference — three of the bugs surfaced in Sprint 45 (the "S45 three-bug cascade") had inference-layer DNA:

| Bug | Origin | Root cause class |
|-----|--------|------------------|
| B-163 R3 Phase 3 narrowing | R3 built `evictedItemIds.filter(id => !(id in reconciled))` instead of the R1 LOCKED "all items still unbound after Phase 2" wording | The narrowing only mattered when `storedClaims = {}` (extension reload), because without Phase 1 evictions `evictedItemIds` was always empty — exactly the path durable identity removes from the critical path |
| B-132 preMark stale-position | Pre-marked from `tj:floatingGroups[]` records whose `(windowId, tabIndex)` had drifted out from under the record | URL inference + position inference are both stand-ins for a durable identity; the durable identity makes both moot for the durable-trust path |
| B-164 M-2 wake-reconcile race | `reconcileClaims` async-gap window between Phase 1 `readClaims()` and Phase 4 `writeClaims()` allowed an interleaved `chrome.tabs.onReplaced` to be overwritten | Reconcile is unavoidable while inference is the source of truth; reducing how often reconcile must run (durable direct-match short-circuits reconcile for the happy path) reduces how often the race-guard load-bears |

The pattern: every S45 cascade bug had reconstruction-from-inference at its root. Removing the reconstruction step for the common "user reloaded the extension; nothing changed in the live browser session" path eliminates an entire class of failure modes at the same time.

The user-visible symptom (from S45 UAT, reproduced empirically on YouTube Music): user has bookmark X claimed to tab Y; user reloads the extension; bookmark X appears offline; the user clicks X and a duplicate tab opens. The current design's fix (B-163 + B-164 + B-132) addresses the symptom via inference repair; Durable claim identity addresses it via durable persistence so inference is never required for the happy path.

---

## §73.2 — R0 spike outcomes

Full survey in `docs/findings/sprint-46.md` § "R0 — Durable claim identity (B-167) spike". R2 PICK confirmed: **combination (d) — durable `tj:itemClaims` partition + `sessionTag` discriminator + Phase 1/2/3/4 inference preserved as a backstop**.

### §73.2.1 — Storage-wipe scenario coverage

| Scenario | Pre-B-167 behavior | Post-B-167 behavior |
|----------|-------------------|---------------------|
| **S-1 Extension reload** | `tj:tabClaims` wiped; Phase 1 no-op; Phase 2/3 URL inference reconstructs (the S45 cascade-bug class) | `tj:itemClaims` survives. `sessionTag` matches current session → durable tabIds trusted directly; reconcile completes with zero URL-inference operations for surviving claims |
| **S-2 Browser restart** | Both session storage AND tab IDs wiped/rotated; Phase 1 no-op; Phase 2/3 URL inference reconstructs | `tj:itemClaims` survives but stamped `sessionTag` no longer matches new browser session → `sessionMatches` returns false → durable record acts as a stale-hint only; Phase 1/2/3/4 inference pipeline runs as the backstop (identical to today's S-2 behavior) |
| **S-3 OS sleep / lid-close** | Session storage MAY survive a short lid-close if SW stays warm (Test B inconclusive). Events fired during sleep are lost. B-164 idle-reconciler rerun catches stale tabIds | Durable record survives regardless of SW lifecycle. Idle-reconciler re-runs `reconcileClaims` which now pre-populates from `tj:itemClaims` BEFORE the existing 4-phase pipeline. No regression to B-164's wake-reconcile coverage |
| **S-4 SW crash** | Indistinguishable from S-1 from storage perspective; B-163 R4 HIGH-1 graceful-degradation guard covers corrupt-partition class | Indistinguishable from S-1. Durable partition's own graceful-degradation guard (§73.8) mirrors the B-163 pattern |
| **S-5 Profile resume** | Equivalent to S-2 | Equivalent to S-2 |

The S-1 path is the dominant win — extension-reload during development is hourly for the maintainer and frequent for any user updating the extension. S-2 and S-3 retain the existing inference pipeline as a correctness backstop, so Durable claim identity is strictly additive in those scenarios.

### §73.2.2 — Why `chrome.sessions` was rejected

`chrome.sessions.getRecentlyClosed()` and `chrome.sessions.restore()` operate on Chromium's own session-recovery tabs and do NOT expose a stable old-tabId → new-tabId mapping across a "Continue where you left off" restore. Verified at R0 by inspecting the MDN `chrome.sessions` reference + the Chromium source for `SessionService::RestoreSessionAfterCrash` — there is no public callback or event that fires with both ids. Building a durable identity layer of our own is the only path that covers S-2 without a Chromium-internal hook.

---

## §73.3 — Storage architecture

### §73.3.1 — Schema v7 → v8 paired bump (C-1a)

Per CLAUDE.md C-1a, a partition-shape addition requires `KNOWN_VERSION` to be incremented AND the `defaultShape(PARTITION_META)` literal to advance in lock-step. Three files change:

1. `background/storage/migration.js:100` — `KNOWN_VERSION` `7 → 8`. Add a v7→v8 entry to `MIGRATION_STEPS` (no-op identity step per C-1b option 2 below).
2. `background/storage/shapes.js:135` — `defaultShape(PARTITION_META)` literal `7 → 8`. The hardcoded literal is intentional (the storage layer does not import from the migration runner — see the comment at `shapes.js:100-134`); bumping this in lock-step is the C-1a discipline.
3. `background/storage/shapes.js:32-57` — add `PARTITION_ITEM_CLAIMS = 'itemClaims'` constant; append to `ALL_PARTITIONS`. Re-export through `partitions.js:43-62`.

Tests pinning the pre-change literals (per the mandatory fix-scope test-assertion enumeration in §73.9.2):

- `tests/migration-fresh-install.test.js:54-59` — `B-137 R5 L-3: defaultShape(PARTITION_META).schemaVersion === 7 (B-148 §3.1 paired-bump invariant)`. Literal `7` MUST update to `8`; the trailing `KNOWN_VERSION` cross-check stays as-is.
- `tests/b148-schema-v7.test.js:9-15` — `KNOWN_VERSION === 7` AND `defaultShape(PARTITION_META).schemaVersion === 7`. Both literals update to `8`. The test title (`B-148 §3.1: KNOWN_VERSION === 7`) should be renamed in R3 to reflect the bump origin (recommend: keep as a regression guard with a comment noting the v7→v8 bump origin for Durable claim identity).
- `tests/sync-schema-v5.test.js:7-13` — `KNOWN_VERSION is 7` literal pins. Update to `8`.
- `tests/storage-init.test.js:18` — `ALL_PARTITIONS.length, 7`. Update to `8`.
- `tests/b040-auto-collapse-subgroups.test.js:667` — `ALL_PARTITIONS.length, 7`. Update to `8`.

The SW module-cache flush note (C-1a CHANGELOG discipline) MUST land in `CHANGELOG.md` at R7: "After update, toggle the extension OFF then ON in `edge://extensions` to flush the SW module cache and apply the schema v8 migration." Sprint 30 B-092 `denseLayout` is the precedent.

### §73.3.2 — New `tj:itemClaims` partition shape

The partition lives in `chrome.storage.local` (NOT session — that is the whole point). Shape:

```js
{
  schemaVersion: 1,               // partition's own internal version, independent of tj:meta.schemaVersion
  sessionTag: string,             // crypto.randomUUID() stamped per browser session; empty string on fresh-install
  entries: {                      // itemId → claim record
    [itemId: string]: {
      tabId: number,              // finite int; the live Chrome tab id at claim time
      claimedAt: number,          // Date.now() at claim time; informational for future TTL / GC
      sessionTag: string,         // copy of partition-level sessionTag at write time
    }
  }
}
```

Three rationales for the inner-`sessionTag` duplication:

1. **Stale-record discrimination at item-level granularity.** A user could have an extension running across multiple browser-restart cycles; some entries written this session, some inherited from a prior session. Per-entry `sessionTag` lets a future refinement (B-172 or beyond) decide per-item trust. For v1, the partition-level `sessionTag` IS the authoritative value and per-entry copy is redundant; it costs one extra UUID string per entry (~36 bytes × 500 items = ~18KB worst case, well within quota).
2. **Forward-compatibility with multi-session histories.** If B-172 (URL-history per claim) lands, per-entry `sessionTag` lets the URL-history array note which session each entry was written in without a wrapping table.
3. **Audit-trail when investigating drift.** The diagnostic-trace helper (B-171, `shared/diag.js`) can record `{itemId, partitionTag, entryTag}` triples to reason about cross-session bleed.

R2-VERIFY at R3 time: `crypto.randomUUID()` is available in SW context across Chromium 92+ and Edge 92+. Spot-check: `typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'` in the SW console. The SW-context API surface check satisfies C-8.

### §73.3.3 — Lazy migration (C-1b option 2)

The v7→v8 step is a no-op governance bump. No eager rewrite of any existing partition data. The new `tj:itemClaims` partition is additive: `initializePartitions()` (`partitions.js:89-114`) iterates `ALL_PARTITIONS` and seeds any missing key with `defaultShape(partition)` on the first SW cold start that observes the new code. Fresh installs land at v8 directly via the `defaultShape(PARTITION_META)` literal bump (no migration step runs).

`MIGRATION_STEPS` append (after the v6→v7 entry at `migration.js:181-195`):

```js
/* B-167 §73.3.3 — v7 → v8 governance bump. No-op migrate: lazy data
   migration (C-1b option 2). Introduces a new additive partition
   `tj:itemClaims` (chrome.storage.local) holding a durable per-item
   tabId binding across extension reload + browser restart. Legacy v7
   profiles lack the key; `initializePartitions()` seeds the default
   empty shape on first SW cold start. Existing `tj:tabClaims`
   (session storage) writes are preserved unchanged — durable identity
   is layered ABOVE the existing pipeline as a pre-populator and
   BELOW it as a passive mirror of every write. The governance bump
   is required by C-1a even when data migration is lazy. */
{
  fromVersion: 7,
  toVersion: 8,
  migrate: (snapshot) => snapshot,
},
```

### §73.3.4 — `isItemClaims` allow-list validator (C-7)

Add `isItemClaims(v)` to `shapes.js` and a `PARTITION_ITEM_CLAIMS` case to `assertShape`. Per C-7 (allow-list direction), the validator permits known-good fields and TOLERATES extra fields (forward-compat for B-172's potential `urlHistory` addition).

Sketch:

```js
function isItemClaims(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (!isNumber(v.schemaVersion)) return false;
  if (!isString(v.sessionTag)) return false;  // empty string is valid (fresh install)
  if (!v.entries || typeof v.entries !== 'object' || Array.isArray(v.entries)) return false;
  for (const [itemId, entry] of Object.entries(v.entries)) {
    if (!isString(itemId) || itemId.length === 0) return false;
    if (!entry || typeof entry !== 'object') return false;
    if (!isNumber(entry.tabId)) return false;
    if (!isNumber(entry.claimedAt)) return false;
    if (!isString(entry.sessionTag)) return false;
    // Extra fields tolerated per C-7 allow-list direction (forward-compat for B-172).
  }
  return true;
}
```

Symmetric to `isFloatingGroups` validation: arbitrary unknown fields on an entry are NOT corruption (they pass `assertShape`); unknown TOP-LEVEL fields are NOT corruption either (no `Object.keys(v).every(...)` check). The validator is forward-permissive and backward-strict.

---

## §73.4 — Cold-start read path with sessionMatches

### §73.4.1 — `sessionMatches(durable, liveTabIndex, threshold)` predicate

A pure function in `tab-claims.js` (or extracted to a small `session-tag.js` helper if preferred at R3 time):

```js
/**
 * Returns true if the durable partition's recorded sessionTag most-likely
 * belongs to the CURRENT browser session, based on how many of the stamped
 * tabIds resolve in the live tab index.
 *
 * @param {Object} durable — full `tj:itemClaims` partition value
 * @param {Map<number, TabEntry>} liveTabIndex — current LiveTabIndex
 * @param {number} [threshold=0.5] — resolve ratio above which we trust
 *   the durable tabIds directly (Q2 R2 PICK = 0.5; see §73.4.2)
 * @returns {boolean}
 */
function sessionMatches(durable, liveTabIndex, threshold = 0.5) {
  if (!durable || !durable.entries) return false;
  const entries = Object.values(durable.entries);
  if (entries.length === 0) return false;  // empty partition — nothing to match
  const sameSessionEntries = entries.filter((e) => e.sessionTag === durable.sessionTag);
  if (sameSessionEntries.length === 0) return false;
  const resolved = sameSessionEntries.filter((e) => liveTabIndex.has(e.tabId)).length;
  return (resolved / sameSessionEntries.length) >= threshold;
}
```

Semantics: "≥50% of the entries stamped with this partition's `sessionTag` still resolve in the current `liveTabIndex` → we are still in the same browser session."

### §73.4.2 — Q2 R2-DECISION: threshold choice

**PICK: `threshold = 0.5` (50%).** Rationale:

- Extension reload (the dominant win path) keeps 100% of tabIds intact, so any threshold from 0.1 to 1.0 returns true correctly.
- Browser restart rotates 100% of tabIds, so any threshold from 0.0 to 1.0 returns false correctly.
- The threshold only matters in the AMBIGUOUS middle: a single tab was closed-and-reopened-fresh during the SW idle window, or Chromium discarded several tabs during sleep. In those cases the durable partition has, say, 8 entries from the current session of which 5 still resolve. 5/8 = 62.5% — both 50% and 80% return true. 5/10 = 50% — only 50% returns true; 80% returns false and falls through to inference.
- The cost of a false-positive (returning true when we should have fallen through to inference) is LOW: pre-populated claims enter Phase 1 which validates `tabEntry && item`; entries whose tabIds no longer resolve are evicted into `evictedItemIds` and flow through Phase 3 drift-URL fallback exactly as the inference path would have. So 50% is safe.
- The cost of a false-negative (returning false when the session really did match) is HIGHER: we throw away durable knowledge and force the full inference pipeline, which is exactly the cost we are trying to avoid.

The 50% bias toward "trust durable" matches the design intent: durable identity is the new source of truth; inference is the backstop, not the default. Revisitable in Sprint 48 if empirical signal (post-B-171 diagnostic traces) shows false-positives causing eviction churn.

### §73.4.3 — Pre-population of claimsMirror BEFORE reconcileClaims

`initializeLiveState` (`background/tabs/index.js:37`) gains an additional pre-step:

```js
export async function initializeLiveState(readyPromise) {
  const [, , items] = await Promise.all([
    buildLiveTabIndex(),
    initWindowOrdinals(),
    readyPromise.then(() => listItems()),
  ]);

  try {
    await preMarkInheritedFromFloatingGroups();
  } catch (err) {
    console.warn('[tab-junkie] B-132 preMarkInheritedFromFloatingGroups failed; proceeding with empty inheritedTabs', err);
  }

  /* B-167 §73.4.3 — durable claim pre-population.
     Read tj:itemClaims; if sessionMatches against the current liveTabIndex,
     pre-populate claimsMirror so Phase 1 sees the durable bindings as if
     they were the storedClaims. If !sessionMatches OR the partition read
     fails (graceful degradation per §73.8), the pre-population is a no-op
     and the full Phase 1/2/3/4 pipeline runs against an empty mirror as
     the inference backstop. */
  await prePopulateClaimsFromDurable(getLiveTabIndex());

  await reconcileClaims(items);
  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());

  try {
    await bootstrapAndSweepRenderOrder();
  } catch (err) { /* ... */ }
}
```

Where `prePopulateClaimsFromDurable` is a new exported helper in `tab-claims.js`:

```js
async function prePopulateClaimsFromDurable(liveTabIndex) {
  let durable;
  try {
    durable = await readPartition(PARTITION_ITEM_CLAIMS);
  } catch (err) {
    console.warn('[tab-junkie] B-167 durable-claims partition read failed; falling back to inference', err);
    return;
  }
  if (!sessionMatches(durable, liveTabIndex)) return;
  for (const [itemId, entry] of Object.entries(durable.entries)) {
    if (entry.sessionTag !== durable.sessionTag) continue;  // skip cross-session bleed
    if (!liveTabIndex.has(entry.tabId)) continue;  // skip stale tabIds
    claimsMirror[itemId] = entry.tabId;  // pre-seed mirror; Phase 1 will keep these
  }
  // claimsMirror is the in-memory mirror; we do NOT writeClaims() here because
  // reconcileClaims will writeClaims at the end of Phase 4 anyway.
}
```

The pre-populated entries enter Phase 1 (`tab-claims.js:171-180`) as if they came from `storedClaims`. Phase 1 validates each against `liveTabIndex.has(tabId) && items.find(it => it.id === itemId)`; survivors stay in `reconciled`; failures land in `evictedItemIds` and flow through Phase 3 drift-URL fallback exactly as the inference path would have. **Critically**: Phase 1 does NOT re-check URL match per the B-149 contract — durable bindings inherit the same URL-drift-survives invariant as session-storage bindings.

Critical sequencing notes:

- Pre-population MUST run BEFORE `reconcileClaims` so the `storedClaims = await readClaims()` read inside `reconcileClaims` (`tab-claims.js:141`) merges with the pre-populated mirror. Per the C-3 SW cold-start-safety check, `reconcileClaims` re-reads `tj:tabClaims` (session) on every invocation; the durable pre-population sits ABOVE that read by writing to `claimsMirror` directly before `reconcileClaims` is called.
- Actually that creates an issue: `reconcileClaims` calls `readClaims()` which returns the session-storage `tj:tabClaims` value; the function then builds its `reconciled` map from `storedClaims` only, NOT from the current `claimsMirror`. So pre-populating `claimsMirror` before `reconcileClaims` does NOT inject those entries into Phase 1's input.

This is a design bug in the naive sketch above. **R2 correction**: the pre-population must either (a) merge into `storedClaims` by writing to `tj:tabClaims` session before `reconcileClaims` runs, OR (b) be passed into `reconcileClaims` as an explicit optional parameter.

**R2 PICK option (a)**: write the durable-trusted bindings to `tj:tabClaims` session-storage BEFORE `reconcileClaims`. This makes `reconcileClaims`'s `readClaims()` see the pre-populated entries naturally and Phase 1 validates them exactly as if they had survived through session storage. Net effect: extension reload now restores the same `storedClaims` state as a pure SW cold-start (no extension reload) would have had, and `reconcileClaims` is functionally identical to the pre-B-167 case for the happy path.

Updated `prePopulateClaimsFromDurable` sketch:

```js
async function prePopulateClaimsFromDurable(liveTabIndex) {
  let durable;
  try {
    durable = await readPartition(PARTITION_ITEM_CLAIMS);
  } catch (err) { /* graceful degradation */ return; }
  if (!sessionMatches(durable, liveTabIndex)) return;
  const restored = {};
  for (const [itemId, entry] of Object.entries(durable.entries)) {
    if (entry.sessionTag !== durable.sessionTag) continue;
    if (!liveTabIndex.has(entry.tabId)) continue;
    restored[itemId] = entry.tabId;
  }
  if (Object.keys(restored).length === 0) return;
  /* Write to chrome.storage.session so reconcileClaims's readClaims() sees
     the restored bindings as its Phase 1 input. The in-memory claimsMirror
     stays empty until reconcileClaims completes — it is NOT a parallel
     source of truth. */
  await chrome.storage.session.set({ 'tj:tabClaims': restored });
}
```

Phase 1 then validates each restored binding via `tabEntry && item` (`tab-claims.js:174`). Survivors stay; failures flow to `evictedItemIds`. Phase 2 + 3 + 4 run unchanged.

Trade-off acknowledged: this design technically does TWO writes to `tj:tabClaims` per cold start (one from the pre-populate; one from the reconcile end), but both are tiny and atomic. The alternative — passing pre-populated bindings as a function parameter — would change the `reconcileClaims` signature and break all five existing call sites (tests, idle-reconciler drain, etc.); the indirection through session storage is the cheaper change.

---

## §73.5 — Five durable PATCH write sites

Every existing `tj:tabClaims` (session) write site gains a parallel PATCH to `tj:itemClaims` (local). Each PATCH stamps the partition's current `sessionTag` on the affected entry. The five sites:

| # | Helper | File:line | Mutation pattern | Per-entry write payload |
|---|--------|-----------|-----------------|--------------------------|
| W-1 | `reconcileClaims` end-of-Phase-4 full-replace | `tab-claims.js:327` (current `writeClaims()` call) | Replace entire `entries` map; stamp current `sessionTag` partition-wide | `entries = {for each itemId in claimsMirror: {tabId, claimedAt: existing OR Date.now(), sessionTag: partition.sessionTag}}` |
| W-2 | `releaseClaimByTab` (cascade on tab close + windows.onRemoved) | `tab-claims.js:356` (current `writeClaims()` call) | Delete `entries[itemId]` | `entries: {...entries, [itemId]: undefined}` via PATCH mutator |
| W-3 | `reevaluateTab` new-claim branch | `tab-claims.js:417` (current `writeClaims()` after the `dirty` flag set) | Upsert `entries[itemId] = {tabId, claimedAt: Date.now(), sessionTag}` | Per-item upsert |
| W-4 | `claimTabForItem` (promote / floating re-association) | `tab-claims.js:494-496` (current `writeClaims()`) | Upsert `entries[itemId]` | Per-item upsert |
| W-5 | `remapTabIdInClaims` (B-164 `chrome.tabs.onReplaced`) | `tab-claims.js:531` (current `writeClaims()` after `dirty` set) | Update `entries[itemId].tabId` PRESERVING `claimedAt` + `sessionTag` | Per-item field-patch |

All five PATCHes route through `writeTransaction` (`background/storage/write-transaction.js`) which provides atomicity + serialization (R2 §8 guarantees). Each PATCH is a single-partition `TxOp` so there is no cross-partition atomicity question.

`sessionTag` is generated once per SW cold start and held as a module-level constant in `tab-claims.js`:

```js
let _sessionTag = '';

async function ensureSessionTag() {
  if (_sessionTag) return _sessionTag;
  /* On cold start: read the durable partition; if its sessionTag matches
     (via sessionMatches), keep it (we are continuing the same browser
     session). If !sessionMatches OR partition is empty, mint a fresh UUID
     and stamp it into the partition. */
  const durable = await readPartition(PARTITION_ITEM_CLAIMS);
  if (sessionMatches(durable, getLiveTabIndex())) {
    _sessionTag = durable.sessionTag;
  } else {
    _sessionTag = crypto.randomUUID();
    /* Also reset the partition-level sessionTag via writeTransaction;
       leave entries untouched so they remain as stale hints (which the
       sessionMatches check will continue to reject in subsequent
       cold-starts until they self-evict via natural turnover). */
    await writeTransaction([{
      partition: PARTITION_ITEM_CLAIMS,
      mutator: (cur) => ({ ...cur, sessionTag: _sessionTag }),
    }]);
  }
  return _sessionTag;
}
```

The sessionTag generation timing is awaited inside `prePopulateClaimsFromDurable` so it is settled BEFORE any W-1 through W-5 write runs. This is the C-3 SW cold-start guard — the sessionTag is the same value across all five write sites in the same SW lifetime.

### §73.5.1 — Q3 R2-DECISION: `MSG_DEMOTE_ITEM` durable-clear semantics

The current `MSG_DEMOTE_ITEM` handler at `background/messages/storage-handlers.js:437-491` orders its writes:

1. `deleteItem(p.itemId)` — transactional via `writeTransaction`.
2. `clearDrift(p.itemId)` — best-effort.
3. `saveFloatingGroups([...])` — best-effort.
4. `releaseClaimByTab(tabId)` — best-effort sequential (this is W-2's trigger for demote).

The R0 question: should the durable-clear (W-2's `entries[itemId]` delete) run inside the `deleteItem` transaction (sync, same `writeTransaction` ops array) OR as a best-effort sequential step after `releaseClaimByTab`?

**PICK: best-effort sequential inside `releaseClaimByTab`'s existing implementation.** Rationale:

- The current architecture already accepts partial-atomicity at this boundary: the docstring at `storage-handlers.js:454-457` explicitly says "A crash between steps leaves a dangling claim that reconcileClaims cleans up on next cold start." Adding the durable-clear as a fifth best-effort step preserves the existing contract.
- Promoting the durable-clear into the `deleteItem` transaction would require multi-partition atomicity (`items` + `itemClaims` in one ops array). The existing `writeTransaction` supports this technically, but it couples item-deletion to a partition that the deleteItem helper currently knows nothing about — a layering violation.
- The cost of a crash between `deleteItem` and `releaseClaimByTab` is bounded: the next cold-start `reconcileClaims` validates each entry via `tabEntry && item`, finds the item missing (deleted), and evicts the entry into `evictedItemIds` which Phase 4 flows into `clearDrift`. The durable partition entry survives ONE cold-start cycle as a dangling reference, then is naturally cleaned via the W-1 full-replace at end-of-Phase-4 (the survivor set excludes deleted items, so the new `entries` map omits the dangling entry). Self-healing within one cycle.
- Refactoring `releaseClaimByTab` to ALSO PATCH the durable partition (W-2) is a one-line addition; it does not require changing the demote handler's structure.

`releaseClaimByTab` sketch (W-2 PATCH added):

```js
export async function releaseClaimByTab(tabId) {
  for (const [itemId, claimedTabId] of Object.entries(claimsMirror)) {
    if (claimedTabId === tabId) {
      delete claimsMirror[itemId];
      await writeClaims();
      /* B-167 W-2: durable PATCH — delete entries[itemId]. Best-effort;
         crash between writeClaims and this write is self-healing per
         §73.5.1 (next cold-start reconcile evicts on tabEntry/item check). */
      try {
        await writeTransaction([{
          partition: PARTITION_ITEM_CLAIMS,
          mutator: (cur) => {
            const { [itemId]: _, ...rest } = cur.entries;
            return { ...cur, entries: rest };
          },
        }]);
      } catch (err) {
        console.warn('[tab-junkie] B-167 W-2 durable-clear failed (self-heals on next cold start)', err);
      }
      return itemId;
    }
  }
  return null;
}
```

---

## §73.6 — Backstop preservation: Phase 1/2/3/4 untouched

The Phase 1/2/3/4 algorithm in `reconcileClaims` (`tab-claims.js:139-344`) is preserved verbatim:

- **Phase 1** — Validate existing claims via `tabEntry && item`. URL is intentionally NOT re-checked (B-149 contract; see §69.4 invariant). Durable pre-population (§73.4.3) writes restored bindings to `tj:tabClaims` BEFORE `readClaims()` runs, so Phase 1's input is the union of (a) durable entries that survived `sessionMatches` AND `liveTabIndex.has(tabId)` filtering, AND (b) any in-session writes that survived the SW lifetime.
- **Phase 2** — Primary-URL match for unclaimed items. Inherited tabs (B-125) skipped. Unchanged.
- **Phase 3** — Drift-URL fallback for items still unbound after Phase 2. The §70 R2-locked "all items still unbound" wording (verbatim, post-S45 R4 round-2 fix) is preserved. Unchanged.
- **Phase 4** — Conditional drift drop ONLY for items that were evicted in Phase 1 AND not recovered by Phase 3. The §10.7 invariant ("drift records only exist for claimed items") is preserved. Unchanged.

Cross-reference: §69 (B-164) sleep / discard-restore remap stays in force. Its 5-table remap (§69.3.1) extends to 6 tables in §73.7. The wake-reconcile race-guard (`_reconcileActive` flag + `_pendingReplacements` queue in `idle-reconciler.js`) is preserved; durable pre-population happens INSIDE `initializeLiveState` which is invoked by the wake-reconcile drain path, so the guard naturally covers durable pre-population too.

Cross-reference: §70 (B-163) drift-URL fallback stays in force as the backstop for S-2 / S-3 / S-4 paths where `sessionMatches` returns false.

Cross-reference: §65 (B-132) cold-start re-population of `inheritedTabs` stays in force; durable pre-population runs AFTER `preMarkInheritedFromFloatingGroups` (per the sequencing in §73.4.3) so the inherited-tab gate continues to block claim-jumps.

---

## §73.7 — `chrome.tabs.onReplaced` extension to 6-table remap

B-164 §69.3.1 enumerated five tables that must remap on `chrome.tabs.onReplaced(addedTabId, removedTabId)`:

| # | Structure | Owner | Remap path |
|---|-----------|-------|-----------|
| 1 | `claimsMirror` | `tab-claims.js:19` | `remapTabIdInClaims` |
| 2 | `inheritedTabs` Set | `tab-claims.js:30` | `remapTabIdInClaims` (same helper) |
| 3 | `_faviconStampedItemIds` Set | `tab-events.js:49` | No remap needed (itemId-keyed) |
| 4 | `reevalTimers` Map | `tab-events.js:37` | `clearTimeout + delete` in `_applyTabReplacement` |
| 5 | `tj:floatingGroups[].liveTabId` | `floating-groups.js:208-211` | `remapFloatingGroupsLiveTabId` (atomic `writeTransaction`) |

**6th table: `tj:itemClaims.entries[itemId].tabId`.** W-5 (§73.5) extends `remapTabIdInClaims` to also PATCH the durable partition. Sketch:

```js
export async function remapTabIdInClaims(removedTabId, addedTabId) {
  if (/* preconditions */) return;

  let dirty = false;
  let dirtyItemId = null;

  // Tables 1 + 2 — same as today
  for (const [itemId, claimedTabId] of Object.entries(claimsMirror)) {
    if (claimedTabId === removedTabId) {
      claimsMirror[itemId] = addedTabId;
      dirty = true;
      dirtyItemId = itemId;
    }
  }
  if (inheritedTabs.has(removedTabId)) {
    inheritedTabs.add(addedTabId);
    inheritedTabs.delete(removedTabId);
  }

  if (dirty) {
    await writeClaims();
    /* B-167 W-5 — 6th table: tj:itemClaims durable PATCH.
       Preserves claimedAt + sessionTag; only tabId field changes. */
    if (dirtyItemId !== null) {
      try {
        await writeTransaction([{
          partition: PARTITION_ITEM_CLAIMS,
          mutator: (cur) => {
            const existing = cur.entries[dirtyItemId];
            if (!existing) return cur;  // no-op if durable entry missing
            return {
              ...cur,
              entries: {
                ...cur.entries,
                [dirtyItemId]: { ...existing, tabId: addedTabId },
              },
            };
          },
        }]);
      } catch (err) {
        console.warn('[tab-junkie] B-167 W-5 durable remap failed (self-heals on next cold start)', err);
      }
    }
  }
}
```

Per the B-164 fire-and-forget pattern at `tab-events.js:119-121`, the call to `remapTabIdInClaims` from `_applyTabReplacement` is already `.catch()`-wrapped, so the new durable write inherits the same non-fatal failure handling. The in-memory mirror update is synchronous and authoritative for the current SW lifetime; the durable PATCH is a defense-in-depth persist for the NEXT cold start.

Additional B-164 remap-table audit per C-13 (Chrome event-feedback completeness): no other event listeners write the durable partition. `chrome.tabs.onUpdated` (`tab-events.js:151-230`) only updates `LiveTabIndex` and triggers `reevaluateTab`; the W-3 PATCH inside `reevaluateTab` is the durable write for that path. `chrome.tabs.onRemoved` cascades to `releaseClaimByTab` which carries W-2. `chrome.windows.onRemoved` cascades to per-tab `releaseClaimByTab` calls (same W-2). All event-feedback paths are covered.

---

## §73.8 — Graceful degradation on corrupt-data read

Per CLAUDE.md C-9 empty-state design + B-163 R4 HIGH-1 precedent at `background/tabs/index.js:60-64`, the durable partition read MUST handle three failure paths gracefully:

1. **Partition missing** (fresh install OR pre-v8 profile): `readPartition` returns `defaultShape(PARTITION_ITEM_CLAIMS)` which is `{schemaVersion: 1, sessionTag: '', entries: {}}`. `sessionMatches` returns false (empty entries). Pre-population is a no-op. The 4-phase pipeline runs against empty `storedClaims` exactly as today. **No regression.**

2. **Partition corrupt** (`assertShape` throws `ERR_CORRUPT_DATA` because an entry's shape doesn't pass `isItemClaims`): `prePopulateClaimsFromDurable` wraps `readPartition` in try/catch, logs a `console.warn`, and returns without pre-populating. The 4-phase pipeline runs against the existing session-storage `storedClaims` (which may be empty if S-1, or populated if SW restart only). Reconcile completes; W-1's end-of-Phase-4 full-replace overwrites the corrupt partition with the well-formed result. **Self-healing within one cold-start cycle.**

3. **`chrome.storage.local.get` rejects** (transient storage error, quota issue, profile lock): same try/catch path as (2). Pre-population is a no-op; reconcile runs against session storage; the W-1 overwrite at end-of-Phase-4 also fails (same storage layer) but the in-memory mirror is correct for the SW lifetime; the next cold-start retries the storage read.

This mirrors the B-132 graceful-degradation pattern (`preMarkInheritedFromFloatingGroups` wrapped at `index.js:60-64`) and the B-163 R4 HIGH-1 pattern (`getDriftRecords` wrapped at `tab-claims.js:273-283`). Both are existing precedents that the [code-reviewer] and [security-reviewer] have already validated; B-167 reuses the same pattern.

Test coverage (per §73.15): T6 seeds a corrupt `entries: 'not-an-object'`; cold-start completes; `isClaimsReady()` returns true; no unhandled rejection.

---

## §73.9 — Fix scope

### §73.9.1 — Code files touched

| File | Change | LOC est. |
|------|--------|---------|
| `background/storage/shapes.js` | Add `PARTITION_ITEM_CLAIMS` const; add to `ALL_PARTITIONS`; add `defaultShape(PARTITION_ITEM_CLAIMS)` case; add `isItemClaims` + `assertShape(PARTITION_ITEM_CLAIMS)` case; bump `defaultShape(PARTITION_META).schemaVersion` literal `7 → 8` | ~60 |
| `background/storage/migration.js` | `KNOWN_VERSION` `7 → 8`; append v7→v8 no-op `MIGRATION_STEPS` entry with §73.3.3 comment | ~20 |
| `background/storage/partitions.js` | Re-export `PARTITION_ITEM_CLAIMS` | ~2 |
| `background/tabs/tab-claims.js` | Add `_sessionTag` module state; `ensureSessionTag` helper; `sessionMatches` predicate; `prePopulateClaimsFromDurable`; W-2 / W-3 / W-4 / W-5 durable PATCH additions; W-1 stamped inside the existing end-of-Phase-4 `writeClaims` call as a parallel PATCH | ~220 |
| `background/tabs/index.js` | Add `prePopulateClaimsFromDurable` call AFTER `preMarkInheritedFromFloatingGroups` and BEFORE `reconcileClaims` (wrapped in try/catch per §73.8) | ~10 |
| `tests/b167-durable-claim-identity.test.js` (new) | ~12-15 cases per §73.15 | ~300 |

**Total**: ~610 LOC (matches R0 estimate). Fits in Sprint 46.

### §73.9.2 — Test-assertion enumeration (MANDATORY per CLAUDE.md fix-scope rule)

R2 declares a contract change (new partition + schema bump + extended `ALL_PARTITIONS` length). Per the CLAUDE.md "Fix-scope test-assertion enumeration" rule (precedent: B-117 R3 b114 T1 escalation, B-041 D-1 b091 fieldset count), every test pinning the pre-change contract MUST update at R3. Enumeration:

| # | File:line | Pre-change assertion | Post-change assertion |
|---|-----------|---------------------|----------------------|
| 1 | `tests/migration-fresh-install.test.js:54-59` | `defaultShape(PARTITION_META).schemaVersion === 7` (literal) + `=== KNOWN_VERSION` (cross-check) | Literal updates to `8`; cross-check stays as-is. Test comment ("bump this when KNOWN_VERSION bumps") stays accurate verbatim |
| 2 | `tests/b148-schema-v7.test.js:9-15` | `KNOWN_VERSION === 7`; `defaultShape(PARTITION_META).schemaVersion === 7` | Both literals update to `8`. Recommended: rename test titles to note v7→v8 origin (keep the file as a v7→v8 paired-bump regression guard, since the v7 floor was B-148's contribution and the v8 ceiling is B-167's) |
| 3 | `tests/sync-schema-v5.test.js:7-13` | `KNOWN_VERSION is 7`; `defaultShape(PARTITION_META) seeds schemaVersion: 7` | Both update to `8`. Recommended: rename file or add a v8 sibling test |
| 4 | `tests/storage-init.test.js:18` | `ALL_PARTITIONS.length, 7` | Update to `8` |
| 5 | `tests/b040-auto-collapse-subgroups.test.js:667` | `ALL_PARTITIONS.length, 7` | Update to `8` |

Additionally, no test file currently asserts the SHAPE of `tj:itemClaims` (because the partition does not exist pre-B-167); the new `tests/b167-*.test.js` adds those assertions. The five updates above are the COMPLETE set of pre-existing pins.

R2-VERIFY at R3 time: rerun `grep -rn "KNOWN_VERSION.*=.*7\|schemaVersion: 7\|toVersion: 7\|fromVersion: 7\|ALL_PARTITIONS.length.*7" tests/` to confirm no additional pins crept in between R2 lock and R3 build.

### §73.9.3 — Shared-surface consumer inventory

Per the CLAUDE.md "Shared-surface consumer inventory" rule (precedent: B-041 R4 H-2 ghost-timer race in `#settings-toast`):

**Surface 1**: `tj:tabClaims` (session storage).
- Existing consumers (pre-B-167):
  - Read: `readClaims()` (`tab-claims.js:94-97`).
  - Write: `writeClaims()` (`tab-claims.js:103-105`) called from `reconcileClaims`, `releaseClaimByTab`, `reevaluateTab`, `claimTabForItem`, `remapTabIdInClaims` (5 sites).
  - Read for lookups: `drift.js` does NOT read `tj:tabClaims` directly; it goes through `getClaimsMirror()` (in-memory) for the drift-detection lookup.
- New consumer (B-167): `prePopulateClaimsFromDurable` writes to `tj:tabClaims` (session) once per cold start to seed Phase 1's input. Single writer per cold-start window; coordination via SW single-thread event-loop serialization (B-164 §69.5 invariant).

**Surface 2**: `tj:itemClaims` (local storage) — NEW.
- No existing consumers (the partition is being introduced).
- New consumers (B-167): the 5 W-1 through W-5 writers + the `prePopulateClaimsFromDurable` reader + `ensureSessionTag` reader/writer. All within `tab-claims.js`; single owner module. Coordination: per-partition `writeTransaction` serialization (`write-transaction.js:33-37` module-level `txQueue`) PLUS SW single-thread event-loop serialization.

**Surface 3**: `claimsMirror` in-memory state.
- Existing consumers (pre-B-167): `getClaimsMirror`, `getItemIdForTab`, `buildLiveStates`, `reconcileClaims`, `releaseClaimByTab`, `reevaluateTab`, `claimTabForItem`, `remapTabIdInClaims`.
- New consumer (B-167): no NEW consumer; `prePopulateClaimsFromDurable` writes to `tj:tabClaims` session-storage (Surface 1), not to `claimsMirror` directly. `claimsMirror` continues to be populated by `reconcileClaims` at the end of Phase 4.

No new shared-surface contention is introduced. The pattern mirrors B-148 §3.6's `bootstrapAndSweepRenderOrder` which also sits at cold-start and writes through `writeTransaction` without contending with the runtime writers.

---

## §73.10 — Q4 R2-DECISION: telemetry counter

**PICK: DEFER to a separate diagnostic-trace item.** Rationale:

- The B-171 (Reusable diagnostic-trace helper) is shipping in the same sprint (`shared/diag.js`). Its `recordTrace(key, payload)` API is the right surface for durable-hit-rate measurement.
- Adding a `tj:meta.durableHits` / `inferenceHits` counter pair to `tj:meta` requires another partition write per cold-start, on a hot path. The B-171 helper writes to namespaced `_diag_*` keys which are cleared at sprint close (per B-171 AC5) — measurement does not pollute long-lived storage.
- Empirical signal is most valuable AFTER S-1 / S-2 are observed in the wild for a sprint cycle. Adding the counter as a follow-up task (in Sprint 47 or 48) lets us calibrate the `sessionMatches` threshold (§73.4.2) based on real data rather than guess.
- v1 of B-167 ships without telemetry; the [test-engineer] UAT walks the S-1 scenario manually as the v1 acceptance proof.

Recommended follow-up backlog entry (for [product-manager] to triage at Sprint 47 planning): "Instrument `prePopulateClaimsFromDurable` to `recordTrace('b167.coldStart', {sessionMatched, restoredCount, evictedCount})` so the durable-hit-rate is measurable post-ship."

---

## §73.11 — Q5 R2-DECISION: `tj:tabClaims` post-S48 retention

**PICK: RETAIN as defense-in-depth in v1; revisit in Sprint 48.** Rationale:

- The pre-population design (§73.4.3) WRITES to `tj:tabClaims` from the durable partition; the existing 5 write sites also continue to write to `tj:tabClaims`. So `tj:tabClaims` remains a valid, current source of truth within the SW lifetime AND across SW cold starts within the same browser session.
- Dropping `tj:tabClaims` would mean the in-SW-lifetime path also reads from `tj:itemClaims` (local storage). The local storage layer has higher latency than session storage; the latency hit would be felt on every `reconcileClaims` invocation (including the B-164 wake-reconcile + the B-110 cascade-prune surfaces).
- Retaining `tj:tabClaims` preserves the existing read-path performance contract (session storage reads are essentially memory-mapped in Chromium).
- The defense-in-depth value: if the durable partition is corrupted (covered by §73.8 graceful degradation), `tj:tabClaims` is the fallback for the current SW lifetime. Belt-and-suspenders.
- Cost of retention: every write site now writes to TWO storage layers instead of one. Doubling the write amplification on the hot path is acceptable (the writes are tiny — a single record patch per event; the writes are batched through `writeTransaction` serialization; the storage layers are both local-only with no network).

Sprint 48 revisit: after empirical signal from B-171 diagnostic traces shows zero `tj:tabClaims`-fallback hits across multiple weeks, file a backlog item to deprecate `tj:tabClaims` and consolidate to `tj:itemClaims` as the sole source of truth. Until then, the dual-write is the correctness-first design.

---

## §73.12 — Edge cases reconciled to R1 ACs

**AC1 (Schema v7→v8 + new `tj:itemClaims` partition shape).** §73.3.1 + §73.3.2 + §73.3.4 cover the paired bump, the partition shape literal, and the allow-list validator. The C-1a paired-bump tests pinned in §73.9.2 update at R3.

**AC2 (Write-site mirror, 5 sites).** §73.5 enumerates W-1 through W-5 with file:line anchors. Each PATCH routes through `writeTransaction` for atomicity. Q3 R2 PICK (§73.5.1) confirms `MSG_DEMOTE_ITEM` durable-clear is best-effort sequential via the updated `releaseClaimByTab`.

**AC3 (Cold-start read with `sessionMatches` discrimination).** §73.4.1 defines the predicate; §73.4.2 documents the Q2 PICK (50%); §73.4.3 shows the pre-population sequencing relative to `preMarkInheritedFromFloatingGroups` and `reconcileClaims`. The pre-population writes restored bindings to `tj:tabClaims` (session) so Phase 1's `readClaims()` sees them as input.

**AC4 (Durable direct match: extension-reload S-1 happy path).** With `sessionMatches === true`, `prePopulateClaimsFromDurable` writes restored entries to `tj:tabClaims`; `reconcileClaims` Phase 1 validates each via `tabEntry && item`; survivors stay claimed; no Phase 2/3 URL-inference operation runs for those items. `getItemIdForTab(claimedTabId)` returns the correct itemId immediately after `claimsReady` flips true. The B-149 contract (URL NOT re-checked) is preserved.

**AC5 (Phase 1/2/3/4 backstop preservation).** §73.6 confirms the 4-phase pipeline is unchanged. Existing test suites for B-149, B-163, B-164 pass without modification (other than the 5 schema-version literal updates in §73.9.2).

**AC6 (Graceful degradation on corrupt-data read).** §73.8 covers the three failure modes (missing partition / corrupt partition / storage rejection). Pattern reused verbatim from B-132 and B-163 R4 HIGH-1.

**AC7 (`chrome.tabs.onReplaced` 6-table remap).** §73.7 documents W-5's durable PATCH as the 6th table extension to B-164 §69.3.1. Fire-and-forget `.catch` wrapping preserved per B-164 precedent.

**AC8 (Migration: lazy, no eager rewrite).** §73.3.3 documents the C-1b option 2 lazy migration choice. v7→v8 step is a no-op identity function matching the pattern of v6→v7 (`migration.js:191-195`). `tj:itemClaims` is seeded by `initializePartitions` on first cold start.

**AC9 (CHANGELOG SW-flush note).** Documented in §73.3.1; [technical-writer] owns the actual CHANGELOG line at R7.

**AC10 (Rollback constraint documented).** See §73.13 below.

**AC11 (URL-history per claim: out of scope).** §73.3.2 + §73.3.4 confirm `entries[itemId]` shape is `{tabId, claimedAt, sessionTag}` only; the allow-list validator tolerates extra fields so B-172 can add `urlHistory` as an additive v8→v9 change without revalidating existing data.

---

## §73.13 — Rollback plan (per R1 AC10)

Per the C-12 manifest-mutability check (N/A — no manifest change) and C-1a (storage schema bump), the rollback procedure for reverting from schema v8 to v7 is:

**No data-loss risk on rollback.** `tj:items`, `tj:groups`, `tj:prefs`, `tj:drift`, `tj:floatingGroups`, `tj:recency` are all unchanged by B-167. `tj:itemClaims` is a derived cache — pre-B-167 inference reconstructs from `tj:tabClaims` session storage + URL inference exactly as it did before, so dropping the durable partition does not lose any user data.

**Rollback steps:**

1. User installs the prior build (schema v7-aware, `KNOWN_VERSION = 7`).
2. On first SW cold start, the prior build reads `tj:meta.schemaVersion` and observes `8`. Because `8 > 7 = KNOWN_VERSION`, the migration runner enters safe-mode (`migration.js:382`) — read-only for the SW lifetime.
3. **Required manual user action to exit safe-mode:** open Edge DevTools → Console → run ONE of:
   - `chrome.storage.local.set({ 'tj:meta': { schemaVersion: 7, createdAt: Date.now() } })` to reset the version stamp, OR
   - `chrome.storage.local.remove(['tj:meta', 'tj:itemClaims'])` to drop both the version stamp AND the v8-only partition (recommended — keeps `tj:itemClaims` from being read by the prior build, which would not understand its shape).
4. Reload the extension. The prior build re-seeds `tj:meta` at v7 via `defaultShape(PARTITION_META)` (which in the prior build returns `{schemaVersion: 7, ...}`).
5. The user's bookmark / group / drift state is intact and the prior build runs normally.

R7 [technical-writer] documents the rollback steps in the user-facing CHANGELOG under the v1.X.0 entry's "Downgrade safety" note (precedent: B-148 §3.6 rollback note in the Sprint 44 CHANGELOG).

---

## §73.14 — Performance

**Write amplification.** Each of the 5 write sites now hits 2 partitions: `tj:tabClaims` (session) AND `tj:itemClaims` (local). For the dominant path (single-item claim mutation), each event triggers two writes serialized through the existing `writeTransaction` queue. Empirical magnitude: each write is a single PATCH of a record (~150 bytes); session storage is in-memory (~10µs); local storage is disk-backed (~1ms in Chromium based on past measurements). The W-1 end-of-Phase-4 full-replace stamps the entire `entries` map at once (one write), bounded by the saved-item count (~500 items × ~150 bytes ≈ 75KB) — still well within Chrome's 5MB local-storage quota.

**Cold-start read cost.** One additional `readPartition('itemClaims')` call BEFORE `reconcileClaims`. The read is a single `chrome.storage.local.get('tj:itemClaims')` (~1ms), followed by `assertShape` validation (~O(items) JavaScript check, ~1µs per entry). Net cold-start overhead: <5ms for a 500-item collection. The performance budget at the sidepanel first-paint level (the CLAUDE.md target: <200ms first paint on 500 items) has 195ms of headroom; the durable read is a ~3% increment.

**`sessionMatches` cost.** `Object.values(durable.entries)` + filter + count + division. O(items). Bounded by saved-item count. <1ms for 500 items.

**`crypto.randomUUID()` cost.** Called at most ONCE per SW cold start (only when `sessionMatches` returns false and a new sessionTag is needed). Sub-microsecond per call. Negligible.

**Memory cost.** The durable partition adds ~150 bytes per claimed item to local storage. The in-memory mirror (`claimsMirror`) is unchanged — durable entries are not mirrored in memory; the partition is read on cold start and on the W-1 full-replace only.

No performance acceptance-criteria regression vs. the existing budget.

---

## §73.15 — Tests planned for R5

[test-engineer] owns at R5. Target: ~12-15 cases in `tests/b167-durable-claim-identity.test.js`. Coverage matrix:

| # | Test | AC mapping |
|---|------|-----------|
| T1 | Fresh install: `defaultShape('itemClaims')` returns `{schemaVersion: 1, sessionTag: '', entries: {}}` | AC1 |
| T2 | `isItemClaims` accepts well-formed empty partition; rejects malformed entry (non-object `entries`, missing `tabId`, non-number `claimedAt`) | AC1 + AC6 |
| T3 | `isItemClaims` tolerates extra fields on entries (allow-list per C-7; forward-compat for B-172) | AC11 |
| T4 | `KNOWN_VERSION === 8`; migration from v7 → v8 runs the no-op step and stamps `tj:meta.schemaVersion = 8` | AC1 + AC8 |
| T5 | `sessionMatches`: returns true when ≥50% of stamped tabIds resolve in liveTabIndex; returns false when <50% | AC3 (Q2 PICK) |
| T6 | Cold-start with corrupt `tj:itemClaims` (e.g. `entries: 'not-an-object'`): `prePopulateClaimsFromDurable` logs warn, returns without writing; `reconcileClaims` runs normally; `claimsReady` flips true | AC6 |
| T7 | S-1 happy path: durable partition seeded with current sessionTag + 3/4 tabIds resolve → pre-populated entries written to `tj:tabClaims`; Phase 1 validates; `getItemIdForTab(tabId)` returns correct itemId; no Phase 2/3 URL-inference observable via spy | AC3 + AC4 |
| T8 | S-2 fallback path: durable partition seeded with stale sessionTag + 0 tabIds resolve → `sessionMatches` false; pre-population no-op; Phase 1/2/3/4 runs against empty `storedClaims`; new sessionTag minted + stamped to partition; W-1 end-of-Phase-4 overwrites stale entries | AC3 + AC5 |
| T9 | W-2: `releaseClaimByTab(tabId)` deletes `entries[itemId]` from durable partition AND session storage | AC2 |
| T10 | W-3: `reevaluateTab` new-claim branch upserts `entries[itemId]` in durable partition with `claimedAt = Date.now()` | AC2 |
| T11 | W-4: `claimTabForItem(itemId, tabId)` upserts `entries[itemId]` in durable partition | AC2 |
| T12 | W-5: `remapTabIdInClaims(old, new)` updates `entries[itemId].tabId` from old→new while preserving `claimedAt` + `sessionTag` (6th table per AC7) | AC2 + AC7 |
| T13 | B-149 regression-guard: cold-start with durable entry whose item URL has drifted (item.url !== live tab url) keeps the claim (URL NOT re-checked) | AC5 |
| T14 | B-163 regression-guard: durable pre-population does NOT preempt Phase 3 drift-URL fallback for items unbound after Phase 1 | AC5 |
| T15 | `MSG_DEMOTE_ITEM` (Q3 R2 PICK best-effort sequential): `entries[itemId]` is removed from durable partition AFTER `deleteItem` + `clearDrift` + `saveFloatingGroups` complete | AC2 (Q3 PICK) |

All 15 cases pass deterministically via `tests/chrome-mock.js`. The existing test suites for B-149, B-132, B-163, B-164 also run as part of the R5 regression sweep; the 5 schema-version literal updates (§73.9.2) are the only modifications expected.

---

## §73.16 — UAT plan

[test-engineer] owns at R5 UAT. The S-1 user-visible benefit is: "Extension reload no longer causes drift-tab desync."

**UAT-1 (S-1 happy path; YT Music empirical scenario from S45):**
1. Load the unpacked extension; save a bookmark X pointing at `https://music.youtube.com/`.
2. Click bookmark X; verify it claims the resulting tab and renders as live (green dot or equivalent).
3. Toggle the extension OFF then ON in `edge://extensions` (this is the SW module-cache flush noted in the CHANGELOG per AC9).
4. Open the sidepanel.
5. **Expected**: bookmark X immediately renders as live, claimed to the same tab Y from step 2. No duplicate appears in the Open Tabs section. No URL-inference operations observable in the SW console (R2-VERIFY: temporarily instrument `prePopulateClaimsFromDurable` to log the restored-count for the UAT walk-through).
6. **Pre-B-167 expected (regression-guard)**: bookmark X renders as offline; tab Y appears in Open Tabs as if it were unclaimed.

**UAT-2 (S-2 backstop path):**
1. Same setup as UAT-1.
2. Close Edge completely (`File → Exit`).
3. Reopen Edge with "Continue where you left off" enabled so tab Y is restored.
4. Open the sidepanel.
5. **Expected**: bookmark X renders as live (Phase 2 primary-URL match recovers the binding because tab Y restored to the same URL). The durable partition's stale entries are silently overwritten by W-1 at end-of-Phase-4. No user-visible regression vs. pre-B-167 behavior.

**UAT-3 (corrupt-partition graceful degradation):**
1. DevTools → Console: `chrome.storage.local.set({ 'tj:itemClaims': { schemaVersion: 1, sessionTag: 'x', entries: 'not-an-object' } })`.
2. Toggle extension OFF/ON.
3. **Expected**: sidepanel loads normally; no error toast; `console.warn` in the SW logs the corrupt-partition message; W-1 overwrites the corrupt partition at end-of-Phase-4 (verify via `chrome.storage.local.get('tj:itemClaims')` in the console — should now be well-formed).

**UAT-4 (rollback path, §73.13):**
1. After installing v1.X.0 (KNOWN_VERSION=8), follow §73.13 rollback steps and reinstall the prior v1.(X-1).0 build.
2. **Expected**: extension exits safe-mode after the manual `chrome.storage.local.set` reset; all bookmarks/groups/drift state intact; live-tab claims reconstruct via inference exactly as they did pre-B-167.

UAT walkthrough is recorded in `SPRINT.md` per Gate 3 acceptance.

---

## §73.17 — Future-work hooks

- **B-172 (URL-history per claim)** — additive v8→v9 schema bump. Adds optional `urlHistory: string[]` to each `entries[itemId]` record. The B-167 allow-list validator (§73.3.4) already tolerates the field. Hooks into the W-3 `reevaluateTab` site to append the new URL on every drift event. Storage cost ceiling per R0 spike: 5 entries × 4KB × 500 items = up to 10MB worst-case (likely far less in practice). Enables a "navigated-away-from" recovery path for the S-2 / S-3 backstop.
- **`chrome.sessions` API revisit** — re-evaluate if Chromium ever exposes a public `onRestored(addedTabId, removedTabId)` event. As of 2026-06, no such API exists; the rejection in R0 stands.
- **Per-claim TTL on durable record** — if hijack risk surfaces empirically (e.g., a user reports a durable entry trusting a tabId that has been recycled by Chromium for an unrelated page in a long-running browser session), add a `Date.now() - entry.claimedAt > TTL_MS` gate to `sessionMatches` per-entry filter. Defer to follow-up; pre-condition is empirical signal.
- **Telemetry instrumentation via B-171** — recommended follow-up per §73.10. `recordTrace('b167.coldStart', {sessionMatched, restoredCount, evictedCount})` inside `prePopulateClaimsFromDurable` to measure hit-rate.
- **`tj:tabClaims` deprecation** — per §73.11, revisit in Sprint 48 once empirical signal supports consolidating to `tj:itemClaims` as the sole source of truth.

---

## §73.18 — R2 PICK summary

| ID | Question | R2 PICK | Rationale ref |
|----|----------|--------|---------------|
| Combination | Storage architecture | (d) durable partition + sessionTag + Phase 1/2/3/4 backstop | §73.2.2 / R0 spike confirmation |
| Q2 | `sessionMatches` threshold | `0.5` (50%) | §73.4.2 |
| Q3 | `MSG_DEMOTE_ITEM` durable-clear semantics | Best-effort sequential via updated `releaseClaimByTab` | §73.5.1 |
| Q4 | Telemetry counter for durable-hit-rate | Defer to follow-up using B-171 `recordTrace` | §73.10 |
| Q5 | `tj:tabClaims` post-S48 retention | Retain in v1 as defense-in-depth; revisit Sprint 48 | §73.11 |

No open product-owner questions. All four R2-time decisions (Q2-Q5) resolved architecturally; Q1 (URL-history) was resolved by product-owner at R1 (deferred to B-172).
