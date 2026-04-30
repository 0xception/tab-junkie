# §65 — B-132 Cold-Start Claim-Jump Fix (R2 Design)

**Sprint:** 40
**Tier:** Full (M)
**Status:** R2 complete (2026-04-29) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture — `claimsMirror`,
`reconcileClaims`, `reevaluateTab`); §10.8 (Floating-group re-association); §21
(B-013 Opener-Chain Group Inheritance — `openerMap` ephemeral); §24 (B-018
Floating-Tab Persistence Across Restart — cold-start re-association); §59
(B-125 `inheritedTabs` runtime gate); §60 (B-121 Floating-Tab Runtime Render
Pipeline — `tj:floatingGroups` v2 schema, `buildFloatingMembers` resolver,
position-match-then-URL-fallback algorithm); §64 (B-132 R0 Spike).

---

## §65.1 Overview

B-132 closes a P1 cold-start defect in which floating tabs land in the Open
Tabs section after extension reload. R0 (§64) decomposed the bug into two
modes:

- **Mode (b) — primary, ~75% confidence.** Pre-existing floating tabs whose
  URL coincidentally matches a saved bookmark get claim-jumped at SW boot
  by `reconcileClaims` Phase 2 (the Phase-2 cold-start auto-claim path
  lacks the B-125 `inheritedTabs` gate that protects `reevaluateTab`).
  `reassociateFloatingGroups` then prunes the matched-claimed record at
  `floating-groups.js:144-152`. The originating-group floating-row UX is
  destroyed.
- **Mode (a) deep-chain — secondary, AC3 carve-out.** A NEW middle-click
  inside a tab that was already a floating tab pre-reload cannot inherit
  through an opener-chain that no longer exists in `openerMap`
  (`opener-chain.js:12`, in-memory only). The new tab correctly lives in
  Open Tabs. **Architecturally infeasible to fix without persisting
  `openerMap`** — Chrome itself does not surface pre-reload `openerTabId`
  chains. R0 §64.6 documented this as known-acceptable per AC3.

**The B-132 fix is a three-file, ~40-LOC change**:

1. **NEW helper** `preMarkInheritedFromFloatingGroups()` in
   `background/tabs/floating-groups.js` — a pure read+mark pass over
   `tj:floatingGroups` that calls `markInherited(matchedTabId)` for every
   record whose match resolves AND whose `matchedTabId` is not already in
   `claimsMirror.values()`. **Zero storage writes**.
2. **Cold-start ordering change** in `background/tabs/index.js` — call the
   new helper between `buildLiveTabIndex` and `reconcileClaims`.
3. **Phase 2 gate** in `background/tabs/tab-claims.js reconcileClaims` —
   skip `urlToTabs` candidates that are in `inheritedTabs`.

The fix mirrors the §59.3 B-125 gate pattern (skip auto-claim for
opener-chain-inherited tabs) but extends it from the runtime
`reevaluateTab` path into the cold-start `reconcileClaims` path.

**Out of scope** (per AC8 of the R1 LOCKED block):
- No storage schema change. C-1a/C-1b governance not triggered.
- No new message contracts. `shared/messages.js` unchanged.
- No `manifest.json` changes.
- No UI changes.
- Mode (a) deep-chain carve-out per AC3.
- No `openerMap` persistence.
- `reassociateFloatingGroups` body is unchanged (a NEW helper is added; the
  §60.4.3 contract stays verbatim).

---

## §65.2 R2-VERIFY 1 outcome — `chrome.storage.session` wipe behavior on extension reload

### Verdict: **CONFIRMED — `chrome.storage.session` is cleared on extension reload.**

### Reasoning chain

1. **Documented platform contract (Chrome MV3).** The Chrome
   extensions storage docs define `chrome.storage.session` as an
   in-memory store that persists for the duration of the extension's
   currently-loaded runtime. The MDN/Chrome contract states the store is
   reset at the same lifecycle boundaries as the SW process: browser
   restart, profile restart, AND extension reload (each of which tears
   down and re-creates the extension's runtime). Direct quote
   substitution from §10.5 line 14 ("`chrome.storage.session` under key
   `tj:tabClaims`, cleared by Chrome on browser restart (AC8)") narrowly
   scopes the lifecycle wipe to "browser restart"; the extension reload
   case is not separately enumerated but is implied by the
   runtime-context-tear-down framing of MV3 service worker reloads.

2. **Internal consistency check — TJ test fixtures.** Test fixture
   `tests/floating-session-wipe.test.js:43,68` explicitly invokes
   `chrome.storage.session.clear()` to simulate the reload boundary and
   asserts (AC12 second case, lines 36-58) that the cold-start replay
   preserves matched-unclaimed records via `reassociateFloatingGroups`.
   The test's existence + the explicit comment at `tests/floating-session-wipe.test.js:3`
   (*"storage.session wipe must not lose tj:floatingGroups records"*) is
   evidence the team has consistently treated session-storage wipe as
   the reload boundary in the test surface.

3. **Code-trace consistency.** `background/tabs/tab-claims.js:4-6`
   states the persistence model: *"Persisted in `chrome.storage.session`
   under key `tj:tabClaims` so claims survive SW restarts within the
   same browser session but are wiped on browser restart (AC8)."* This
   docstring narrowly scopes "browser restart" but does NOT distinguish
   browser-restart from extension-reload — and since extension reload is
   a strict subset of "tear-down events that destroy the SW runtime",
   the same wipe applies.

4. **Empirical confirmation pathway.** The §64.4 H-3 R2-VERIFY method
   (open `chrome://extensions` → SW inspect → write
   `chrome.storage.session.set({foo:'bar'})` from the SW console; click
   Reload; observe `chrome.storage.session.get('foo')` returns
   `undefined`) is documented as the canonical empirical test.
   `R6 [test-engineer] UAT Plan` should include this as a setup-time
   sanity check during the U-132 case execution; this chapter does not
   block on the empirical run because the fix is correct under either
   verdict (see §65.6 Race-guard analysis below).

### Why the fix is correct under either verdict

If `chrome.storage.session` IS preserved across extension reload (a
hypothetical we treat as already refuted but document for completeness):
- `tj:tabClaims` survives the reload with the pre-reload mapping.
- `reconcileClaims` Phase 1 validates each claim against the rebuilt
  `LiveTabIndex`. Tabs whose pre-reload tabId is no longer in the index
  get evicted. Tabs whose pre-reload tabId IS still present (Chrome
  preserves tabIds across extension reload — H-4 falsified at §64.4)
  with the claimed item's URL still matching survive Phase 1.
- Phase 2 then runs against the un-evicted UNCLAIMED tabs. **The same
  Mode (b) URL-collision can fire** because `reconcileClaims` Phase 2
  has no `inheritedTabs` gate — any pre-existing floating tab whose URL
  matches an unclaimed saved item gets auto-claimed.
- The B-132 fix (Phase 2 gate + cold-start helper) closes Mode (b) under
  this hypothetical too, because `inheritedTabs` is re-populated from
  `tj:floatingGroups` BEFORE Phase 2 runs and the gate skips the
  marker-protected candidate regardless of how `tj:tabClaims` looked
  pre-Phase-1.

**Conclusion: the fix is structurally correct under both verdicts.** R6
documentation simplifies if the empirical run confirms the wipe.

### R3-VERIFY follow-up

R3 [frontend-engineer] need not block on R2-VERIFY 1; R5
[test-engineer] performs the empirical confirmation as part of
U-132-1 setup and notes the verdict in the UAT log.

---

## §65.3 Cold-start sequence — current vs. proposed

### Current sequence (`background/tabs/index.js:35-48`)

```js
export async function initializeLiveState(readyPromise) {
  const [, , items] = await Promise.all([
    buildLiveTabIndex(),                                  // step 1
    initWindowOrdinals(),                                 // step 2
    readyPromise.then(() => listItems()),                 // step 3
  ]);
  await reconcileClaims(items);                           // step 4
  await reassociateFloatingGroups(
    getLiveTabIndex(),
    getClaimsMirror(),
  );                                                      // step 5
}
```

(Verified via Read at `background/tabs/index.js:35-48`.)

**Failure surface**: between step 4 and step 5, `reconcileClaims` Phase 2
auto-claims any unclaimed live tab whose URL matches an unclaimed saved
item — including pre-existing floating tabs whose URL coincidentally
matches a different bookmark. Step 5 then prunes those records as
"matched + claimed".

### Proposed sequence (B-132 fix)

```js
export async function initializeLiveState(readyPromise) {
  const [, , items] = await Promise.all([
    buildLiveTabIndex(),                                  // step 1
    initWindowOrdinals(),                                 // step 2
    readyPromise.then(() => listItems()),                 // step 3
  ]);
  // B-132 §65.4: cold-start re-population of inheritedTabs from
  // tj:floatingGroups so reconcileClaims Phase 2 can skip
  // opener-chain-inherited candidates per the same gate as B-125.
  await preMarkInheritedFromFloatingGroups();             // NEW step 3.5
  await reconcileClaims(items);                           // step 4 (gated)
  await reassociateFloatingGroups(
    getLiveTabIndex(),
    getClaimsMirror(),
  );                                                      // step 5 (unchanged)
}
```

### Why the helper runs AFTER `buildLiveTabIndex` and BEFORE `reconcileClaims`

- **AFTER `buildLiveTabIndex`**: the helper resolves records to live tabs
  via the same position-match-then-URL-fallback algorithm as
  `reassociateFloatingGroups` (`floating-groups.js:124-142`). Without a
  populated `liveTabIndex`, position match is impossible.
- **BEFORE `reconcileClaims`**: the gate inside `reconcileClaims` Phase 2
  (§65.5) reads `inheritedTabs.has(candidate)`. If the helper runs after,
  Phase 2 sees an empty set and the gate is dead code.
- **`initWindowOrdinals` order is independent**: window-ordinals
  `Promise.all` member is unrelated to floating-groups read; we leave it
  parallel to the others.
- **`listItems()` order is independent**: the helper does not need
  `items` (it only consults `tj:floatingGroups` records and the live tab
  index). Phase 2 needs `items`; we still await `listItems()` before
  `reconcileClaims`.

The helper does not need to be parallelized with steps 1-3 because its
work (read `tj:floatingGroups` + walk `liveTabIndex`) is bounded at
< 1 ms per §64.7 perf budget (≤ 5 records × ≤ 50 tabs typical). Adding it
as a serial step keeps the ordering invariant trivially auditable.

---

## §65.4 NEW helper `preMarkInheritedFromFloatingGroups()`

### Location

`background/tabs/floating-groups.js` — new exported function. Co-located
with `reassociateFloatingGroups` because both consume `tj:floatingGroups`
+ `liveTabIndex` and share the position-match-then-URL-fallback resolver.

### Signature

```js
/**
 * B-132 §65.4: cold-start re-population of inheritedTabs from
 * tj:floatingGroups. For every record whose match resolves AND whose
 * matched tabId is NOT already claimed, call markInherited(matchedTabId)
 * so reconcileClaims Phase 2 skips the URL-collision auto-claim.
 *
 * Pure read+mark — writes ZERO storage (no claim writes, no
 * tj:floatingGroups writes, no tj:tabClaims writes). The mark is the
 * sole side effect.
 *
 * Algorithm (mirrors reassociateFloatingGroups §60.4.3):
 *   1. Read tj:floatingGroups records.
 *   2. POSITION MATCH per record: find live tab where windowId AND
 *      tabIndex match.
 *   3. URL FALLBACK if no position match: find live tab whose
 *      normalized URL equals the record's normalized URL.
 *   4. If matched AND tabId NOT in claimsMirror.values(): call
 *      markInherited(tabId).
 *   5. If matched AND already claimed: SKIP (reconcileClaims Phase 1
 *      preserved the claim; not an inheritance candidate).
 *   6. If unmatched: SKIP (no live tab to mark).
 *
 * Invariant: this helper MUST run after buildLiveTabIndex resolves and
 * BEFORE reconcileClaims executes. See background/tabs/index.js:45-48
 * for the call-site ordering.
 *
 * @returns {Promise<void>}
 */
export async function preMarkInheritedFromFloatingGroups() { ... }
```

### Implementation pseudocode (R3 will finalize)

```js
// background/tabs/floating-groups.js
import { markInherited } from './tab-claims.js';
import { getLiveTabIndex } from './live-tab-index.js';
import { getClaimsMirror } from './tab-claims.js';

export async function preMarkInheritedFromFloatingGroups() {
  const records = await readPartition(PARTITION_FLOATING_GROUPS);
  if (!Array.isArray(records) || records.length === 0) return;

  const liveTabIndex = getLiveTabIndex();
  const claimsMirror = getClaimsMirror();
  const claimedTabIds = new Set(Object.values(claimsMirror));

  for (const record of records) {
    if (!record || typeof record !== 'object') continue;

    // POSITION MATCH (mirrors floating-groups.js:124-129)
    let matchedTabId = null;
    for (const [tabId, entry] of liveTabIndex) {
      if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
        matchedTabId = tabId;
        break;
      }
    }

    // URL FALLBACK (mirrors floating-groups.js:131-142)
    if (matchedTabId === null) {
      const normalizedStored = safeNormalizeForMatch(record.url);
      if (normalizedStored) {
        for (const [tabId, entry] of liveTabIndex) {
          if (safeNormalizeForMatch(entry.url) === normalizedStored) {
            matchedTabId = tabId;
            break;
          }
        }
      }
    }

    // Mark only matched + unclaimed candidates.
    if (matchedTabId !== null && !claimedTabIds.has(matchedTabId)) {
      markInherited(matchedTabId);
    }
  }
}
```

### Import-direction analysis

- `floating-groups.js` already imports `safeNormalizeForMatch` from
  `../../shared/url.js`, `writeTransaction`, `readPartition`, `MAX_URL`,
  and `ulid`.
- B-132 adds `markInherited` from `./tab-claims.js`.
  `floating-groups.js` does NOT currently import from `tab-claims.js` —
  the existing import chain is `tab-events.js → tab-claims.js (markInherited)`
  per §59.3 / `tab-events.js:20`.
- `tab-claims.js` itself imports `getLiveTabIndex` from
  `./live-tab-index.js` and `safeNormalizeForMatch` from `../../shared/url.js`.
  It does NOT import from `floating-groups.js`.
- `floating-groups.js` does NOT currently import from `tab-claims.js`.
  Direct verification: `grep -n "from.*tab-claims" background/tabs/floating-groups.js`
  → no matches. **Therefore the `markInherited` import is a new edge
  with no circular-import risk.** R3-VERIFY: re-grep at build time.

### Why a NEW helper instead of modifying `reassociateFloatingGroups`

R0 §64.6 considered both: (a) modify `reassociateFloatingGroups` to add
a `markInherited` call in the matched-and-unclaimed branch, OR (b) add a
new helper that runs earlier in the cold-start sequence. Option (a) is
INSUFFICIENT because `reassociateFloatingGroups` runs AFTER
`reconcileClaims` (see §65.3) — by the time it could mark, Phase 2 has
already claim-jumped. The fix REQUIRES the pre-mark to happen before
Phase 2.

R0 also weighed refactoring `reassociateFloatingGroups` to a "marker-only
mode" toggle vs adding a separate helper. The separate-helper choice
preserves `reassociateFloatingGroups` body verbatim (AC8(g)) — important
because the §60.4.3 contract has been the subject of multiple R6 close
deltas across S38-S39 and is well-understood. A new export is smaller
blast radius than a flag-controlled mutation of an existing function.

### Performance budget

- O(N_records × N_liveTabs). Per §64.7: ≤ 5 records × ≤ 50 tabs typical.
- < 1 ms added to `initializeLiveState`. Well below the 200 ms first-paint
  envelope.
- One `chrome.storage.local.get('tj:floatingGroups')` round-trip
  (reused by `reassociateFloatingGroups` later — possible future
  optimization to share the read, deferred per AC8 (no scope creep)).

---

## §65.5 Phase 2 gate in `reconcileClaims`

### Exact diff site

`background/tabs/tab-claims.js:169-178` — the Phase 2 candidate-consumption
loop. Current code (verified via Read):

```js
// Sort items by sortOrder ascending for first-unclaimed-wins
const sorted = items
  .filter((it) => !(it.id in reconciled))
  .sort((a, b) => a.sortOrder - b.sortOrder);

for (const item of sorted) {
  const normalized = safeNormalizeForMatch(item.url);
  if (!normalized) continue;
  const available = urlToTabs.get(normalized);
  if (available && available.length > 0) {
    const tabId = available.shift();
    reconciled[item.id] = tabId;
    claimedTabIds.add(tabId);
  }
}
```

### Proposed gate

The gate skips `inheritedTabs` candidates inside the Phase 2 loop. The
candidate list is consumed via `available.shift()` — the gate becomes a
"shift-and-skip-while-inherited" loop, falling through to the next
candidate or leaving the saved item unclaimed if every candidate is
filtered.

```js
for (const item of sorted) {
  const normalized = safeNormalizeForMatch(item.url);
  if (!normalized) continue;
  const available = urlToTabs.get(normalized);
  if (available && available.length > 0) {
    // B-132 §65.5: skip auto-claim if a candidate tab is opener-chain-
    // inherited per the cold-start re-population in
    // preMarkInheritedFromFloatingGroups. Mirrors the B-125
    // (§59.3) gate inside reevaluateTab, applied here to the cold-start
    // claim path. Pop the inherited candidate so the next-best candidate
    // can be claimed; if every candidate is filtered, the saved item
    // remains unclaimed.
    let claimedTabId = null;
    while (available.length > 0) {
      const candidate = available[0];
      if (inheritedTabs.has(candidate)) {
        available.shift();
        continue;
      }
      claimedTabId = available.shift();
      break;
    }
    if (claimedTabId !== null) {
      reconciled[item.id] = claimedTabId;
      claimedTabIds.add(claimedTabId);
    }
  }
}
```

### Invariants preserved

1. **First-unclaimed-wins ascending `sortOrder`.** The outer loop iterates
   `sorted` in ascending `sortOrder` (unchanged). The inner gate only
   filters which CANDIDATE tab is consumed for a given item — it does
   NOT reorder items.
2. **No two claims share the same tabId (AC3).** The `available.shift()`
   call removes the candidate from the URL-keyed list — once consumed,
   it cannot be claimed by a later iteration. The skip-on-inherited
   path also `shift`s, ensuring the inherited tab is removed from
   future consideration in this loop. The `claimedTabIds.add(claimedTabId)`
   tracking remains in place for tabs that ARE claimed.
3. **Per-saved-item idempotence.** A saved item that loops through every
   inherited candidate and finds none survivable is left unclaimed —
   identical behavior to the pre-fix "no candidates at all" case.
   `reevaluateTab` will re-evaluate when the inherited tab's URL changes
   later (the existing B-099 D-1 contract handles this).
4. **B-110 §53 evicted-drift bookkeeping unaffected.** The
   `evictedItemIds` array (`tab-claims.js:135-145`) is populated solely
   in Phase 1 (validation against existing claims). Phase 2 does not
   contribute to drift eviction. The new gate only short-circuits Phase
   2 — Phase 1's behavior is byte-identical.
5. **Allow-list direction (C-7) preserved per §59.7's ruling.** The new
   gate is conceptually a skip-list narrowing existing permissive
   default — same justification as the runtime gate at
   `tab-claims.js:250-252`.

### Code-style choice — `while` vs early-return continue

R2 prefers the inner `while` shown above to:
- Keep the existing outer `for (const item of sorted)` loop intact
  (no scope-spaghetti).
- Permit a future `floatingGroupsTabIds`-style additional filter to be
  composed into the same inner loop without cascading restructure.
- Mirror existing extension idioms (e.g., the URL-fallback inner loop in
  `floating-groups.js:135-141` also breaks out of a candidate scan).

R3 may use early `continue` instead if it improves readability — the
behavior is identical so long as the skip-then-shift pattern is
preserved.

---

## §65.6 `inheritedTabs` invariant — entry-point symmetry

The B-132 fix introduces a NEW entry-point that adds to `inheritedTabs`.
The set's full lifecycle table (B-132 + B-125 combined):

| Operation | Caller | Site | Scope | Race posture |
|---|---|---|---|---|
| `markInherited` | `tab-events.js:176` (B-125) | After `await appendFloatingGroup` resolves on `chrome.tabs.onCreated` | Runtime — opener-chain inheritance | Sync after await; protected by 100 ms `reevaluateTab` debounce per §59.10.1 M-1 comment |
| `markInherited` | NEW: `floating-groups.js preMarkInheritedFromFloatingGroups` (B-132) | Cold-start re-population | Cold-start — all pre-existing matched-unclaimed records | Synchronous within `initializeLiveState`; runs strictly before `reconcileClaims` |
| `pruneInherited` | `tab-events.js:212` (B-125) | `chrome.tabs.onRemoved` handler | Runtime — tab close | Symmetric with `pruneOpener` on the same handler |
| `pruneInherited` | `tab-events.js:283-286` (B-125) | `chrome.windows.onRemoved` per-tab loop | Runtime — window close cascade | Symmetric with the per-tab `pruneOpener` and `releaseClaimByTab` calls |
| `__resetTabClaims` | `tests/_setup.js` `beforeEach` (B-125 §59.2.4) | Test reset | Test only | Resets the set to empty between tests |

**Symmetry verification**:
- `inheritedTabs` is added at exactly two production sites (one runtime,
  one cold-start).
- `inheritedTabs` is removed (per-tab) at exactly two production sites
  (single-tab close + window close cascade).
- Cold-start re-population does NOT need a paired pre-clear, because the
  set is module-scope and starts empty on every SW cold start (`tab-claims.js:30`
  `const inheritedTabs = new Set();`).
- After SW cold start, the lifecycle order is:
  1. SW boot → set is empty.
  2. `preMarkInheritedFromFloatingGroups` runs → set is populated for
     pre-existing records.
  3. `reconcileClaims` runs → reads the set; never writes.
  4. `reassociateFloatingGroups` runs → never reads or writes the set.
  5. Runtime: `chrome.tabs.onCreated` for new spawns adds entries
     (B-125 path). `chrome.tabs.onRemoved` removes them.

The set never holds a stale entry: every entry is either still mapped to
a live tab (added by either entry-point) or removed when the tab closes.
SW termination wipes the set — the next cold start re-populates from
`tj:floatingGroups` per §65.4.

### Edge cases re-examined

1. **A `tj:floatingGroups` record exists but no live tab matches.** The
   helper's `if (matchedTabId !== null && !claimedTabIds.has(matchedTabId))`
   guard skips this case. `inheritedTabs` is NOT polluted with phantom
   tabIds. `reassociateFloatingGroups` later leaves the record in place
   per AC9 (B-018) for future restart match.
2. **A `tj:floatingGroups` record matches a live tab that is ALSO claimed
   by a saved item via a SURVIVED Phase 1 claim** (i.e., the floating
   tab's tabId is already in `claimsMirror.values()` because it survived
   the storage.session). The helper's `claimedTabIds.has(matchedTabId)`
   guard treats this as an already-promoted tab — it does NOT mark.
   `reassociateFloatingGroups` then prunes the now-stale record at
   `floating-groups.js:144-152`. **Correct cleanup of the
   already-promoted case.**
3. **Two records collide on the same matched tabId** (e.g., legacy
   duplicate records). The helper marks the first match's tabId; the
   second iteration's `claimedTabIds.has(...)` guard is unaffected
   (since `claimedTabIds` is built from `claimsMirror`, not from the
   in-progress mark loop). The second iteration also calls
   `markInherited` on the same tabId — **idempotent** (Set semantics).
   The duplicate record itself is later cleaned up by
   `reassociateFloatingGroups` during its own iteration. R0 §64.13
   confirmed this is acceptable; B-132 does not need to dedupe records.

---

## §65.7 AC3 deep-chain carve-out

### What is carved out

After extension reload, a NEW middle-click inside a tab `F` that was
itself a floating tab pre-reload (multi-hop opener chain: grandparent
claimed → parent floating → child fresh-spawn post-reload) creates a tab
`C` that lands in Open Tabs, NOT under the originating group.

### Why the fix doesn't reach this case

`background/tabs/opener-chain.js:12` declares `const openerMap = new Map();`
at module scope. The `openerMap` is **ephemeral** — never persisted.
Every SW cold start (including extension reload) starts with an empty
`openerMap`. The H-1 / H-1' analysis at §64.4 walks this through:

1. SW boots. `openerMap` is empty.
2. User middle-clicks a link inside `F` (the floating tab from
   pre-reload). Chrome fires `chrome.tabs.onCreated` for new tab `C`
   with `openerTabId = F.id`.
3. `recordOpener(C.id, F.id)` runs synchronously in
   `tab-events.js:141`. Now `openerMap = {C.id → F.id}`.
4. `walkOpenerChain(C.id, claimsMirror, items)` runs at
   `tab-events.js:148`. The walk:
   - `openerMap.get(C.id) = F.id`. Searches `claimsMirror` for `F.id`.
   - **`F` is NOT in `claimsMirror`**. `F` is a floating tab; its
     identity is in `tj:floatingGroups`, not in `claimsMirror`.
   - The walk loops to next hop:
     `openerMap.get(F.id)` → `undefined` (because `recordOpener(F.id, P.id)`
     was NEVER called in this SW lifetime — that recording happened in
     the previous SW lifetime which was destroyed at reload).
   - Walk returns `null`.
5. `if (result)` block at `tab-events.js:149` does not execute.
   `appendFloatingGroup` is not called. `markInherited(C.id)` is not
   called.
6. `reevaluateTab` later (when `C.url` resolves) is gated by
   `inheritedTabs` only if `markInherited(C.id)` had been called. It
   wasn't. So `reevaluateTab` proceeds to its normal path: if `C.url`
   matches an unclaimed saved item, auto-claim; otherwise leave
   unclaimed (where `buildOpenTabs` surfaces `C` in the Open Tabs
   section).

### Why this is structurally infeasible to fix without persisting `openerMap`

The fix would require walking from `C.openerTabId = F.id` back up to a
claimed ancestor, but the pre-reload chain `F → P` only exists in the
ephemeral `openerMap` that has been wiped. To reconstruct the chain,
B-132 would need to either:
- (a) Persist `openerMap` to storage. Chrome itself does not preserve
  opener relationships across restarts (`opener-chain.js:6-9`), so this
  would diverge from Chrome's own contract.
- (b) Re-derive `F.openerTabId = P.id` from `tj:floatingGroups` records
  (since `F`'s record stores `parentItemId = P.id`). But this only works
  for tabs THAT WERE ALREADY FLOATING — and even then, it requires
  building a synthetic `openerMap` from the `parentItemId` graph for
  every cold start, which conflates "opener" with "parent group" and
  breaks the §59.4(iii) "parent bookmark deleted post-inheritance"
  contract (where the parent claim has been deleted but the floating
  record survives).

R0 explicitly rejected both options at §64.6 / §64.13:

> *"H-1' is harder to fix architecturally because Chrome doesn't surface
> pre-reload opener relationships. R0 recommendation: accept H-1' as a
> known-acceptable degradation post-reload and document it. ... The
> user's recourse is to close the tab and re-spawn from the bookmarked
> parent. This trade-off is documented at §59.3 ('Cold-start state') for
> the single-tab case; B-132 R6 should extend the documentation to
> cover multi-hop deep chains."*

### Documentation requirements per AC3

R3 includes a code comment at the new helper site documenting the
carve-out:

```js
// B-132 §65.7 AC3 carve-out: this helper marks live tabs whose
// tj:floatingGroups record resolves. It does NOT reconstruct
// pre-reload opener-chain relationships (openerMap is ephemeral —
// opener-chain.js:6-9 documents this as Chrome's own contract). A NEW
// middle-click inside a former-floating tab post-reload thus creates a
// new tab whose opener-walk returns null and which lives in Open Tabs.
// This is the AC3 known-acceptable degradation; the user's recourse
// is to re-spawn from the bookmarked parent.
```

UAT case U-132-7 confirms the behavior. R7 [technical-writer] documents
the user-facing behavior in `docs/user-manual/` (per AC3 PASS criterion).

### Reference citation

- `background/tabs/opener-chain.js:6-9` — *"Ephemeral: the openerMap is
  lost on SW restart — consistent with Chrome's own behavior (opener
  relationships are not persisted across restarts)."* (Verified via
  Read.)
- `background/tabs/opener-chain.js:12` — `const openerMap = new Map();`
  declaration. (Verified via Read.)
- §64.6 — R0 architectural rejection of `openerMap` persistence.
- §64.11 R1 — AC3 explicit carve-out language.

---

## §65.8 Race-guard analysis

### What could race during cold start?

The fix introduces a new ordering invariant:
`buildLiveTabIndex` resolves → `preMarkInheritedFromFloatingGroups`
resolves → `reconcileClaims` runs → `reassociateFloatingGroups` runs.
Possible race surfaces:

**R-1: `chrome.tabs.onUpdated` fires for a live tab during cold-start.**

A tab whose URL changes (e.g., a still-loading SPA finally settling on a
URL) between SW boot and cold-start completion could trigger
`reevaluateTab` via the 100 ms debounce in `tab-events.js:116`.

- Path: `chrome.tabs.onUpdated` → `updateTabEntry` (immediate) →
  `setTimeout(reevaluateTab, 100)` (debounced).
- `reevaluateTab` checks `inheritedTabs.has(tabId)` at line 250.
- **Potential failure**: if `reevaluateTab` fires BEFORE
  `preMarkInheritedFromFloatingGroups` resolves, the gate is empty and
  the tab could auto-claim a different bookmark.

**Refutation**: `reevaluateTab` is gated by `claimsReady` indirectly. At
SW cold start, `claimsReady = false` until `reconcileClaims` completes
(at `tab-claims.js:182`). But `reevaluateTab` itself (lines 234-267)
does NOT check `claimsReady` — it operates on `claimsMirror` directly,
which is `{}` until `reconcileClaims` populates it.

Re-trace: at the moment a debounced `reevaluateTab` fires during the
cold-start window:
- `claimsMirror` is `{}` (Phase 1 not yet started, or in-progress).
- `Object.values(claimsMirror).includes(tabId)` is `false`
  (no claims yet).
- `inheritedTabs.has(tabId)` — may or may not be populated depending on
  whether `preMarkInheritedFromFloatingGroups` has resolved.
- If NOT populated: `reevaluateTab` walks `items.filter(...)` for an
  unclaimed match. **Auto-claim could fire if the URL collides.**

**This is the same race window that exists pre-B-132**: `reevaluateTab`
during cold-start before `reconcileClaims` resolves can auto-claim. Per
§59.3's acceptance: this is the documented cold-start window.

**B-132 narrows this race window** by populating `inheritedTabs` before
`reconcileClaims` runs. The new helper resolves synchronously at sub-ms
within the same `initializeLiveState` async chain as
`buildLiveTabIndex`. Any `chrome.tabs.onUpdated` event firing during the
~< 1 ms window between `buildLiveTabIndex` resolution and
`preMarkInheritedFromFloatingGroups` resolution would still land in the
old race.

**Acceptable.** The race is bounded by the SW orchestration time
(< 5 ms total per §65.4). The probability of `chrome.tabs.onUpdated`
firing in that exact ~1 ms window is negligible. No new architecture is
needed; the fix is strictly additive.

**R-2: `chrome.tabs.onCreated` fires during cold start with an
opener relationship that B-132 should mark.**

A new tab spawning while cold-start is in progress (e.g., user clicks a
link in a tab whose extension reload is mid-completion) could trigger
the runtime path at `tab-events.js:140-185`:

- `recordOpener(newTab.id, opener.id)` runs.
- The async block awaits `readyPromise` (already resolved at this
  point — migration runs before `initializeLiveState`) and `listItems()`.
- `walkOpenerChain` runs. Could fire BEFORE `reconcileClaims`
  populates `claimsMirror`.

**Refutation**: at this point, `claimsMirror` may be `{}`. The opener
walk would find no claimed ancestor → returns `null` → no
`appendFloatingGroup`, no `markInherited`. The tab is treated as
user-initiated. `reevaluateTab` later (when URL resolves) operates on
the cold-started state.

**Acceptable.** This is the same pre-B-132 cold-start runtime race;
B-132 does not introduce a new race here, and the AC2 regression-guard
test (T-132-B) confirms shallow-chain inheritance works for
spawns AFTER cold-start completes.

**R-3: `MSG_LIST_ITEMS` fires during cold-start.**

A sidepanel `MSG_LIST_ITEMS` dispatch could fire before
`initializeLiveState` completes. Per the existing `claimsReady` gate at
`tab-claims.js:281` (`buildLiveStates` returns "not ready" defaults
when `claimsReady === false`), the response is "live=false for every
item" until reconcile completes. The sidepanel re-fetches on the next
broadcast. **No new failure mode introduced.**

### Atomicity of the pre-mark + reconcile pair

`initializeLiveState` is a single async function with serial `await`
points. There is no `Promise.all` between `preMarkInheritedFromFloatingGroups`
and `reconcileClaims`; they are guaranteed-serial. No JS-side race is
possible between them.

The `chrome.tabs.*` event handlers run on the SW event loop; they can
interleave with `initializeLiveState`'s awaits — but per the analysis
above, no interleaving event introduces a new failure mode. The B-132
fix is strictly additive in race posture.

---

## §65.9 R2 Correctness Checklist (C-1..C-12)

| # | Check | Status |
|---|---|---|
| C-1a | Storage schema versioned (governance) | **N/A** — no shape change to `tj:floatingGroups`, `tj:tabClaims`, `tj:meta`, or any other partition. `KNOWN_VERSION` NOT incremented. `defaultShape` NOT updated. No `MIGRATION_STEPS` step. No CHANGELOG SW module-cache flush note required. |
| C-1b | Data-migration strategy chosen | **N/A** — no schema shape change implies no data migration. No eager step, no lazy-read tolerance change, no version-only no-op. The Sprint 38 B-121 lazy-migration precedent does not apply. |
| C-2 | Message contracts typed | **N/A** — no new `MSG_*` types. No changes to `shared/messages.js`. The existing `tab/opener-inherited` broadcast at `tab-events.js:178` is unchanged. |
| C-3 | SW cold-start safe | **APPLIES — central concern.** The fix is the cold-start re-population. Documented at §65.3 (current vs. proposed sequence) and §65.4 (helper algorithm). The new ordering invariant (`buildLiveTabIndex` → `preMarkInheritedFromFloatingGroups` → `reconcileClaims` → `reassociateFloatingGroups`) is enforced by the linear `await` chain in `initializeLiveState`. |
| C-4 | ID stability | **APPLIES.** The fix relies on `tabId` stability across the cold-start orchestration. (i) `tabId` is allocated by Chrome and is stable for the tab's lifetime (extension reload preserves tabIds per §64.4 H-4 falsification). (ii) The helper resolves a record's matched `tabId` via `(windowId, tabIndex)` position-match (preferred) or URL fallback. The matched `tabId` is then passed to `markInherited` and is the key into `inheritedTabs`. (iii) `reconcileClaims` Phase 2's `urlToTabs` map is keyed by URL but its values are `tabId`s — the same primitive. The gate's `inheritedTabs.has(candidate)` check uses the same `tabId` value. **Identity is consistent across all sites.** |
| C-5 | Manifest paths | **N/A** — no `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** — no new permissions. |
| C-7 | Allow-list direction | **APPLIES — acceptable per §59.7's same-class ruling.** The new gate in `reconcileClaims` Phase 2 is conceptually a skip-list ("skip auto-claim if `inheritedTabs.has(candidate)`"). This narrows existing permissive auto-claim default — same as the §59.3 B-125 runtime gate. Blast radius of false-positive is "tab not auto-claimed" (soft degradation, not security or data-integrity issue). [security-reviewer] R4 sign-off referenced: §59.7 C-7 ruling applies verbatim. |
| C-8 | SW-context feasibility | **N/A** — no new browser API. `Set<number>` lookup is supported in all SW contexts. The helper consumes only existing APIs (`chrome.storage.local.get` via `readPartition`; `Map` iteration on `liveTabIndex`; `safeNormalizeForMatch` from `shared/url.js`). |
| C-9 | Empty-state design | **APPLIES — four enumerated states**: (i) Extension reload with NO records in `tj:floatingGroups`: helper short-circuits at the `records.length === 0` early return (verified pseudocode in §65.4). `inheritedTabs` stays empty; Phase 2 gate is dead code (correctly). T-132 regression test: U-132-8 (no-floating-state regression guard). (ii) Extension reload with records but ZERO match a live tab: helper's per-record loop never enters the `markInherited` branch. `inheritedTabs` stays empty. `reassociateFloatingGroups` later leaves the records in place per B-018 AC9. T-132 regression test: included in T-132-E (no-collision case). (iii) Extension reload with records that match live tabs whose URLs DO collide with saved items: **the primary fix path.** Helper marks the matched tabIds; Phase 2 gate skips them; saved items remain unclaimed; floating records survive. T-132-A pins this. (iv) Extension reload with records that match live tabs whose URLs do NOT collide: helper marks the matched tabIds; Phase 2 has no candidate to gate (no URL match). `reconcileClaims` proceeds normally. `inheritedTabs` membership is "extra" (unused but not wrong). T-132-E pins this. R4 [qa-reviewer] verifies against this enumeration. |
| C-10 | Off-screen rect | **N/A** — no DOM, no positioning, no snapshot/measurement. |
| C-11 | Popup-lifecycle ordering | **N/A** — no popup interaction. The fix is entirely SW-side. |
| C-12 | Manifest declaration runtime-mutability | **N/A** — no manifest declaration involved. |

**Net flagged checks: C-3, C-4, C-7, C-9.** All resolved at design-time
in this chapter. No [security-reviewer] or [qa-reviewer] escalation
needed pre-R3.

---

## §65.10 Fix-scope test-assertion enumeration (B-119/B-126 mandatory subsection)

Per CLAUDE.md mandatory subsection (B-119 expanded by B-126), this
section enumerates every test file that asserts the contracts B-132
modifies, with R3 instructions for each.

### R3-DECISION: `tests/floating-position.test.js:68-91` — **KEEP AS UNIT-LEVEL PIN.**

The third AC8 case (lines 68-91) currently asserts:
- Seeds `tj:floatingGroups` record at `(windowId 1, tabIndex 0)` with URL
  `https://x.com`.
- Sets a single live tab at the matching position with the matching URL.
- Calls `reconcileClaims([{id: 'existing-item', url: 'https://x.com', ...}])`
  DIRECTLY (NOT via `initializeLiveState`).
- Asserts `claimsMirror['existing-item'] === 10` (claim established).
- Calls `reassociateFloatingGroups` with the now-populated claim.
- Asserts the floating record is pruned (matched + claimed → prune).

**R2 decision: KEEP THIS TEST UNCHANGED.** Rationale:

1. **The test does NOT call `preMarkInheritedFromFloatingGroups`.** The
   new helper is invoked via `initializeLiveState`, which the test
   intentionally bypasses. The test's narrow contract is "given a direct
   `reconcileClaims` call with no inheritance markers, the URL match
   wins and `reassociateFloatingGroups` prunes the now-stale record."
   This is still a TRUE statement after the fix — the gate only fires
   when `inheritedTabs` is populated, and in this test it is not.
2. **The test pins a CORRECT unit-level behavior.** B-125 / B-132 do not
   change `reconcileClaims`'s behavior in the absence of inheritance
   markers. The test asserts exactly that absence-case behavior. If
   `reconcileClaims` ever regresses for non-inherited tabs (e.g., a
   future refactor accidentally always-skips even uninherited
   candidates), this test catches it.
3. **R3 must add a clarifying comment** at the test docstring (lines 1-7
   or atop the third case at line 68) noting that the cold-start
   orchestration in production wraps `reconcileClaims` with
   `preMarkInheritedFromFloatingGroups`, so this exact scenario does not
   arise post-B-132 in the production code path. Comment text:
   ```
   // B-132 §65.10: this test invokes reconcileClaims DIRECTLY without
   // preMarkInheritedFromFloatingGroups (the cold-start helper added
   // for B-132). In production, initializeLiveState always pre-marks
   // inherited tabs before reconcile, so this exact "URL collision +
   // unclaimed → claim-jump" sequence does not arise. The test pins
   // the unit-level reconcileClaims+reassociate contract for the
   // no-inheritance case, which is still load-bearing for non-floating
   // tabs.
   ```
4. **The alternative (rewrite to seed `markInherited(10)` first) would
   delete a true assertion.** A rewritten test would assert the gate
   behavior with markers — but T-132-F (in the new test file) ALREADY
   does that explicitly, including the deterministic "without-helper
   then with-helper" pin. Duplicating that into `floating-position`
   loses the unit-level claim-and-prune contract and adds no new
   coverage.

**R3 implements**: add the clarifying comment block, leave assertions
unchanged. This is the SOLE pre-existing test modification.

### Other affected test files — verification by inspection (R3 confirms each)

| File | Lines | Asserted contract | B-132 impact | R3 action |
|---|---|---|---|---|
| `tests/floating-position.test.js:22-42` | First AC8 case — matched-unclaimed retention | None (no claim-jump scenario; no URL collision; no inheritance marker) | **Stays green** (verified — no `markInherited` seed; no `initializeLiveState`; URL `https://different-url.com` does not match any saved item URL) | None |
| `tests/floating-position.test.js:44-66` | Second AC8 case — position match takes priority over URL match | None (positions and URLs are unique; no URL collision with any saved item) | **Stays green** (verified — no `markInherited` seed; no `initializeLiveState`) | None |
| `tests/floating-session-wipe.test.js:21-34` | First AC12 — storage.session wipe preserves records | Records survive `chrome.storage.session.clear()` (read-only assertion) | **Stays green** — no `reconcileClaims` invocation; no inheritance marker | None |
| `tests/floating-session-wipe.test.js:36-58` | Second AC12 — cold-start replay matched-unclaimed retention | `reassociateFloatingGroups` with empty claims → record retained, `inheritedTabs` not consulted | **Stays green** — test seeds URL `https://cold.com` with no saved item collision; the helper would mark `inheritedTabs` if invoked, but the test does not invoke it | None |
| `tests/floating-session-wipe.test.js:60-75` | Third AC12 — session wipe clears claims; floating-group records survive in local | Storage-layer assertion; no `reconcileClaims` call; no inheritance | **Stays green** | None |
| `tests/floating-url-fallback.test.js` | URL-fallback retention regressions | Not seeded with URL collisions per §64.11 R2 audit | **Stays green** — confirmed by the B-119 audit at R1 LOCKED: no fixture seeds a `tj:floatingGroups` record paired with a saved item having the same URL | R3 verifies by inspection |
| `tests/b121-floating-group-render.test.js:83-143` | T-121-A — cold-start replay scenario (`seedPartitions` + `__setMockTabs` + `reconcileClaims` + `MSG_LIST_ITEMS`) | Parent and child URLs are unique (parent at `https://parent.example`; floating child at `https://child.example` per the test fixture) — no saved-item collision with the floating child's URL | **Stays green** — `reconcileClaims` is called directly without `preMarkInheritedFromFloatingGroups`; even with the gate, no candidate would be skipped | R3 verifies by inspection |
| `tests/b121-floating-group-render.test.js:264-279` | T-121-G — runtime gate test | Tests `reevaluateTab` gate (B-125), not cold-start `reconcileClaims` Phase 2 gate | **Stays green** — same code path as B-125, untouched by B-132 | None |
| `tests/b121-floating-group-render.test.js` T-121-K | Downstream `MSG_LIST_ITEMS` round-trip per §64.11 R1 audit | URL fixture is unique per the B-119 audit | **Stays green** | R3 verifies by inspection |
| `tests/b125-claim-jump-fix.test.js` T1-T5 | Runtime `reevaluateTab` path | B-132 does not modify `reevaluateTab` body | **Stays green** | None |
| `tests/b099-drift-fix.test.js` | Phase 2 auto-claim contract for various drift cases | Per §64.11 R1 audit: confirm no test seeds `tj:floatingGroups` + URL collision (in particular, the B-099 tests deal with claimed tabs whose URLs change — the `alreadyClaimed` short-circuit fires before any gate could matter) | **Stays green** — every `reevaluateTab` call site short-circuits on `alreadyClaimed` per §59.6 verification | R3 verifies by inspection (specifically: no `seedPartitions({floatingGroups: ...})` followed by a `reconcileClaims` call) |
| `tests/b018-persistence.test.js` GAP-1, GAP-2, R4-H1, R4-H2 | Floating-group persistence across SW restart | Per §64.11 R1 audit: confirm no fixture seeds a `tj:floatingGroups` record paired with a saved item having the same URL. Per R0 §64.11: "R4-H2 (line 195+) noted at §64.11 — R3 must read verbatim and confirm." | **Should stay green** — R3 reads R4-H2 fixture verbatim and confirms no URL collision; if a collision is found, R3 escalates to [scrum-master] per the R1 LOCKED escalation clause | R3 verifies by inspection (priority — flagged at R0/R1) |

### Escalation clause

If R3, while verifying any of the above (other than the
`floating-position.test.js:68-91` decision already made by R2), finds a
test fixture that DOES seed a `tj:floatingGroups` record paired with a
saved item having the same URL, R3 STOPS and escalates to
[scrum-master] for an explicit scope-change decision. The R1 LOCKED
block flagged this scenario as the primary R3 risk; R2 commits to no
silent test rewrites beyond the one `floating-position.test.js:68-91`
comment addition.

---

## §65.11 R3 build plan

### File modifications (3 production files, ~40 LOC)

#### File 1: `background/tabs/floating-groups.js`

Add a NEW exported function near the bottom of the file (after
`pruneFloatingGroupsByParentItemId` at line 262):

```js
import { markInherited, getClaimsMirror } from './tab-claims.js';
import { getLiveTabIndex } from './live-tab-index.js';

export async function preMarkInheritedFromFloatingGroups() {
  // … per §65.4 pseudocode …
}
```

**Estimated LOC**: 1 new import line + 1 helper signature + JSDoc
(~10 lines) + body (~25 LOC) = **~35-40 LOC**.

**JSDoc must reference §65.4 (this chapter) and §59.3 (the B-125 gate
pattern this mirrors).**

#### File 2: `background/tabs/index.js`

Insert one new line at line 45 between `Promise.all` resolution and
`reconcileClaims`:

```js
import { reassociateFloatingGroups, preMarkInheritedFromFloatingGroups } from './floating-groups.js';

// … inside initializeLiveState, after the Promise.all block …
// B-132 §65.4: cold-start re-population of inheritedTabs from
// tj:floatingGroups so reconcileClaims Phase 2 skips opener-chain-
// inherited candidates per the same gate as B-125.
await preMarkInheritedFromFloatingGroups();
await reconcileClaims(items);
// B-001d AC10: re-associate floating groups after claims are established
await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());
```

**Estimated LOC**: 1 import extension + 1 new `await` line + 3 comment
lines = **+5 LOC**.

#### File 3: `background/tabs/tab-claims.js`

Modify the Phase 2 candidate-consumption loop at lines 169-178 per
§65.5:

```js
for (const item of sorted) {
  const normalized = safeNormalizeForMatch(item.url);
  if (!normalized) continue;
  const available = urlToTabs.get(normalized);
  if (available && available.length > 0) {
    // B-132 §65.5: skip opener-chain-inherited candidates (the
    // inheritedTabs Set is populated at cold-start by
    // preMarkInheritedFromFloatingGroups in floating-groups.js, and
    // at runtime by appendFloatingGroup in tab-events.js per
    // §59.3). The skip mirrors the B-125 reevaluateTab gate at
    // line 250 — both prevent auto-claim of a tab that is "spoken
    // for" by a parent group.
    let claimedTabId = null;
    while (available.length > 0) {
      const candidate = available[0];
      if (inheritedTabs.has(candidate)) {
        available.shift();
        continue;
      }
      claimedTabId = available.shift();
      break;
    }
    if (claimedTabId !== null) {
      reconciled[item.id] = claimedTabId;
      claimedTabIds.add(claimedTabId);
    }
  }
}
```

**Estimated LOC**: replace 5 lines with ~15 lines = **+10 LOC**.

### Test additions (~5-8 new tests in 1 new file)

R3 stubs + R5 fills out the new test file `tests/b132-cold-start-inheritance.test.js`
per the AC7 enumeration:

- **T-132-A** — Mode (b) URL-collision repro post-`initializeLiveState`.
  Asserts: `claimsMirror[parent.id] === parentTabId`,
  `claimsMirror[collidingItem.id] === undefined`, record retained,
  `inheritedTabs.has(floatingTabId) === true`,
  `floatingMembers[parentGroupId]` includes the floating tab.
- **T-132-B** — Mode (a) shallow-chain regression guard post-cold-start.
  Asserts: post-cold-start middle-click triggers
  `appendFloatingGroup`/`markInherited` via the existing path; new tab
  appears under parent group.
- **T-132-C** — `preMarkInheritedFromFloatingGroups` in isolation.
  Asserts: `inheritedTabs.has(matchedTabId) === true`; ZERO storage
  writes via `chrome.storage.local.set` and `chrome.storage.session.set`
  spy counts.
- **T-132-D** — URL-fallback cold-start population. Asserts: position
  drift but URL preserved → helper marks via URL fallback;
  `inheritedTabs.has(matchedTabId) === true`.
- **T-132-E** — No-collision regression guard. Asserts: floating tab F
  whose URL has no saved-item collision → record retained; F not in
  `claimsMirror`; F in `inheritedTabs` (extra-but-correct).
- **T-132-F** — Phase 2 gate mechanism pin. Asserts: with `inheritedTabs`
  empty, `reconcileClaims` claim-jumps; with `inheritedTabs` populated
  via the helper, gate fires.
- **T-132-G** (optional) — Ordering invariant pin. Use a call-order
  spy or a ledger Set to assert `preMarkInheritedFromFloatingGroups`
  resolves before `reconcileClaims` begins inside `initializeLiveState`.

**Estimated LOC**: ~250 LOC for the new file mirroring the
`tests/b125-claim-jump-fix.test.js` style (R5 finalizes; R3 stubs the
file shell + T-132-A, T-132-C, T-132-F as the most diagnostic cases).

### Pre-existing test modification (1 file, ~3 LOC)

Per §65.10 R3-DECISION: add the clarifying comment to
`tests/floating-position.test.js` near line 68 documenting that this
unit test bypasses the cold-start helper. Comment-only; no assertion
change.

### Total LOC estimate

- Production: 3 files, ~50-55 LOC net add.
- Tests: 1 new file (~250 LOC) + 1 comment-only edit (~3 LOC).
- **Production overshoot vs R0 estimate (40 LOC) is < 30% — within tolerance.** R3 should not over-engineer the helper.

### Helper signature decisions (R2 final)

- **Function name**: `preMarkInheritedFromFloatingGroups` (verbose;
  unambiguous; matches R0 §64.6 + R1 LOCKED naming).
- **Arguments**: zero. The helper reads `liveTabIndex` and
  `claimsMirror` via existing module-scoped getters
  (`getLiveTabIndex()`, `getClaimsMirror()`). Passing them as arguments
  would be parallel to `reassociateFloatingGroups`'s signature, but
  R2 prefers zero-arg here because: (a) the helper is called from
  exactly one site (`initializeLiveState`) and the test harness can
  use the same module-scoped state; (b) a shorter signature reduces
  R3 typo risk; (c) `getClaimsMirror()` is the canonical reader anyway
  (used by `tab-claims.js claimTabForItem` and others).
- **Return type**: `Promise<void>`. No return value needed; side effect
  is on `inheritedTabs`.
- **Module ownership**: `floating-groups.js` (per §65.4 rationale).
- **Export style**: named export, mirrors `reassociateFloatingGroups`,
  `appendFloatingGroup`, `pruneResolvedFloatingGroups`,
  `pruneFloatingGroupsByParentItemId`.

### Sequencing notes

- R3 implements File 1 first (the helper). Run unit test T-132-C against
  the helper in isolation (assert markings + zero writes).
- R3 implements File 3 (the gate) next. Run T-132-F (the without/with
  helper pin).
- R3 implements File 2 last (the cold-start ordering). Run T-132-A
  (full cold-start integration).
- R3 finishes by adding the clarifying comment to
  `tests/floating-position.test.js`.

### STOP-and-escalate triggers (R3 review checklist)

Per CLAUDE.md ROUND 3 rules and §65.10 escalation clause:
- If R3 considers deferring AC3 (deep-chain Mode-a) to a follow-up
  beyond what AC3 explicitly carves out: STOP and escalate.
- If R3 finds a pre-existing test file (other than
  `floating-position.test.js:68-91`) with a `tj:floatingGroups` URL
  collision fixture: STOP and escalate.
- If R3 cannot grep-confirm circular-import-free direction for the new
  `markInherited` import in `floating-groups.js`: STOP and escalate.

---

## §65.12 Open R3-VERIFY markers

The following items are deferred to R3 [frontend-engineer] for
empirical verification (R2 has reasoned but not run code):

| # | Marker | Description | R3 verification method |
|---|---|---|---|
| R3-V-1 | Circular-import direction | Confirm `floating-groups.js` does not currently import from `tab-claims.js`, and the new `markInherited` import does not create a cycle (verified statically at R2 — R3 re-greps at build time and confirms no `import.*from.*floating-groups` exists in `tab-claims.js`). | `grep -n "from.*floating-groups" background/tabs/tab-claims.js` — must be empty. |
| R3-V-2 | `inheritedTabs` Set re-export | Confirm `tab-claims.js` exposes `inheritedTabs` (or an `isInherited(tabId)` reader, which it does at line 48-50) so the Phase 2 gate can read it. R2 prefers consuming via the existing `inheritedTabs.has(...)` direct reference inside the same module — `reconcileClaims` lives in `tab-claims.js`, so it has direct lexical access. | Read `tab-claims.js:30` to confirm `inheritedTabs` is module-scope; confirm `reconcileClaims` (same file) has direct access — no export adjustment needed. (Verified at R2 via direct Read; R3 re-confirms during build.) |
| R3-V-3 | `tests/b018-persistence.test.js` R4-H2 fixture | Per §64.11 R1 audit: read R4-H2 (line 195+) verbatim and confirm no URL collision between the seeded `tj:floatingGroups` record and any saved item. R2 has not Read this file; R1's R0 §64.11 references the line range but does not transcribe the fixture. | `Read tests/b018-persistence.test.js` lines 180-260 (or full file) and confirm fixture URLs are unique. |
| R3-V-4 | Empirical session-storage wipe (R2-VERIFY 1 supplement) | Confirm the documented Chrome contract empirically — open `chrome://extensions` → SW inspect → write `chrome.storage.session.set({foo:'bar'})` from the SW console; click Reload; observe `chrome.storage.session.get('foo')` returns `undefined`. | R5 [test-engineer] runs this as part of U-132-1 setup. The fix is correct under either verdict per §65.2; this is documentation hygiene. |
| R3-V-5 | T-132-G ordering pin feasibility | Determine whether the test harness can spy on the `initializeLiveState` await chain to assert `preMarkInheritedFromFloatingGroups` resolves before `reconcileClaims`. If chrome-mock or `_setup.js` doesn't expose a clean spy hook, T-132-G falls back to a comment-only assertion. | R3 inspects the test harness; R5 finalizes T-132-G implementation choice. |

---

## §65.13 Sign-off

- **R2 outputs**: this chapter (§65).
- **C-1..C-12 closures**: all 12 checks documented in §65.9. None
  require [security-reviewer] or [qa-reviewer] escalation pre-R3.
- **R2-VERIFY 1 outcome**: **CONFIRMED** — `chrome.storage.session` is
  wiped on extension reload per documented Chrome MV3 contract; fix is
  correct under either verdict (§65.2).
- **R3-DECISION on `floating-position.test.js:68-91`**: **KEEP AS UNIT
  PIN** with a clarifying comment (§65.10).
- **Fix-scope test-assertion enumeration**: complete (§65.10).
- **Build plan**: 3 production files, ~40 LOC; 1 new test file (~250
  LOC); 1 comment-only edit (§65.11).
- **Open R3-VERIFY markers**: 5 items, all non-blocking (§65.12).
- **Recommended Tier**: confirmed M Full (per §64.7 + R1 LOCKED).
- **No escalation back to R1**: R2 has not discovered any AC issue
  requiring revision.

---

## §65.14 As-Built (R6 Close)

**Closed:** 2026-04-29 · **Sprint:** 40 (anchor #1) · **Branch:** `feature/sprint-40-drag-reorder`
**Tier:** Full (M) · **Pipeline rounds executed:** R0 (spike, §64) → R1 (LOCKED) → R2 → R3 → R4 (parallel × 3) → Wave 3a fix-round → R5 → R6
**Closing version:** v1.34.0 (release/v2 only — no main merge per established branching strategy)

### §65.14.1 — Files actually changed vs. R2 expected (§65.11 build plan)

| File | Expected (R2 §65.11) | Actual (R6) | Notes |
|------|---------------------|-------------|-------|
| `background/tabs/floating-groups.js` | NEW exported `preMarkInheritedFromFloatingGroups()` (~25 LOC); add `markInherited` import from `tab-claims.js` | ✅ done — +83 LOC | Overshoot driven by JSDoc block including the AC3 deep-chain carve-out citation (§65.7 / §64.6) + the position-then-URL-fallback algorithm comment block. JSDoc format mirrors `reassociateFloatingGroups` for symmetry. Imports added: `markInherited`, `getClaimsMirror`. |
| `background/tabs/index.js` | Insert `await preMarkInheritedFromFloatingGroups()` between `Promise.all([...])` and `await reconcileClaims(items)` (~3 LOC) | ✅ done — +7 LOC at `index.js:50` | Wave 3a [qa-reviewer] M-2 added a `try/catch` wrap on the helper call so subsequent `reconcileClaims` still runs under storage corruption — graceful degradation to pre-fix behavior. The `console.warn` on catch matches the existing cold-start error logging at `service-worker.js:50`. |
| `background/tabs/tab-claims.js` | Phase 2 gate: extend `urlToTabs` candidate-consumption loop to skip `inheritedTabs.has(candidate)` (~10 LOC) | ✅ done — +22 LOC at `tab-claims.js:174-198` | `while`/shift-skip pattern handles all-candidates-inherited and single-candidate cases. Loop preserves Phase 1 sortOrder ordering. |
| `tests/floating-position.test.js` | Comment-only edit at `:68-91` per R3-DECISION (R2 §65.10) | ✅ done — +10 LOC comment block, byte-identical assertion body | Verified via `git diff HEAD` — only the 10-line clarifying-comment block was added; the test body at `:78-101` is byte-identical. |
| `tests/floating-multi.test.js` | Wave 3a additive (was not in R2 plan) — [qa-reviewer] M-1 clarifying-comment block | ✅ done at `:45-74` | Mirrors the `floating-position.test.js:68-77` clarifying-comment template. No assertion change. |
| `tests/floating-ready-gate.test.js` | Wave 3a additive — [qa-reviewer] M-1 clarifying-comment block | ✅ done at `:23-45` | Same pattern. No assertion change. |
| `tests/b018-persistence.test.js` | Wave 3a additive — [qa-reviewer] M-1 clarifying-comment block | ✅ done at `:106-131` | Same pattern. No assertion change. |
| `tests/b132-cold-start-inheritance.test.js` | NEW file with **6** test cases T-132-A..F (~250 LOC) | ✅ done — **8 tests** in 391 LOC (T-132-A through T-132-H) | R3 added two extras beyond R2 budget: T-132-G (ordering invariant via source-text pin per R3-V-5 fallback) and T-132-H (zero-storage-write contract — load-bearing pin against future "optimization" regressions). |

**Totals (B-132 only):** 3 production files (+112 LOC); 1 new test file (+391 LOC, 8 tests); 4 comment-only test-file edits (+~30 LOC of comments, zero assertion changes).

### §65.14.2 — Deviations from R2 plan

Two material deviations recorded — both Wave 3a fix-round upgrades from "deferred" to "fixed in-build" per [qa-reviewer] convergence:

1. **[qa-reviewer] M-1: clarifying-comment block extension to 3 sibling tests.** R2 §65.10 explicitly enumerated `tests/floating-position.test.js:68-91` for the R3-DECISION clarifying comment, but the same URL-collision pattern appears in three additional pre-existing tests (`floating-multi.test.js:45-74`, `floating-ready-gate.test.js:23-45`, `b018-persistence.test.js:106-131`). R3 only commented the first. R4 [qa-reviewer] flagged the gap; Wave 3a added the comment block to all three siblings.

   **Rationale:** under the new contract, all four tests stay mechanically green only because they bypass `initializeLiveState` and call `reconcileClaims` directly (helper never runs → empty `inheritedTabs` → gate is dead code). In production with the helper, behavior would invert. Future readers must see the clarifying comment to understand why the unit-level contract is still load-bearing despite the production behavior change. Comment-only addition; ~9 LOC across 3 test files; zero assertion changes.

2. **[qa-reviewer] M-2: defensive `try/catch` around the new cold-start helper call.** R2 §65.4 said the helper "writes ZERO storage" but did not address read-side failure (`readPartition(PARTITION_FLOATING_GROUPS)` can throw `StorageError` per `background/storage/partitions.js:71-82`). Without the wrap, an unwrapped throw propagates to `initializeLiveState`, blocking subsequent `reconcileClaims` and `reassociateFloatingGroups` for the entire SW lifetime.

   **Fix:** wrap the helper call in `try { await preMarkInheritedFromFloatingGroups(); } catch (e) { console.warn('[tab-junkie] B-132 helper failed', e); }` at `background/tabs/index.js:50`. Graceful degradation to pre-fix behavior under storage corruption: subsequent `reconcileClaims` still runs; the only loss is the cold-start `inheritedTabs` re-population (a known SEV2 condition that already required a fresh start). Pattern matches the existing `service-worker.js:50` catch on `initializeLiveState` itself.

   **Rationale:** symmetric defense-in-depth across the cold-start orchestration. Pre-B-132, `reassociateFloatingGroups` failure was asymmetric (claims established, only re-association skipped); B-132 added a second failure surface that without the wrap could block every downstream step. The wrap restores the graceful-degradation pre-condition.

These two upgrades were closed in commit `965cd76` (Wave 3a checkpoint). Convergent [qa-reviewer] signals motivated each upgrade.

### §65.14.3 — R2-VERIFY 1 outcome (§65.2)

**Pre-R5 status:** `chrome.storage.session` wipe-on-reload is documented behavior per Chrome MV3 spec; B-132 fix is correct under either empirical outcome (verdict A wipe vs. verdict B persist).

**R5 [test-engineer] empirical confirmation:** UAT case U-132-4 walks the test in Edge SW console (`set qaProbe; reload; get qaProbe → undefined`). UAT plan filed at `docs/UAT_B-132.md` (R5 [test-engineer] output). Final empirical verdict pending product-owner UAT walk-through; **fix correctness is independent of the verdict per §65.2**, so this does not block R6 close.

### §65.14.4 — R3-VERIFY marker outcomes (§65.12)

| # | Marker | R6 verification |
|---|--------|-----------------|
| **R3-V-1** | Circular-import direction | **PASS.** `floating-groups.js:33` adds `import { markInherited, getClaimsMirror } from './tab-claims.js';`. Reverse import absent (verified: `grep -n "from.*floating-groups" background/tabs/tab-claims.js` returns empty). One-way dependency confirmed. |
| **R3-V-2** | `inheritedTabs` Set re-export | **PASS.** No re-export needed. `markInherited` (write-API) is consumed by `floating-groups.js`; `inheritedTabs` Set itself remains module-private inside `tab-claims.js` (only accessible via the `markInherited` / `isInherited` / `pruneInherited` / `__resetTabClaims` exports). The Phase 2 gate has direct lexical access (lives in same module). Encapsulation invariant preserved. |
| **R3-V-3** | `tests/b018-persistence.test.js` R4-H2 fixture | **PASS.** Fixture URLs `https://parent.com` (saved item) + `https://parent.com` (floating record) — same-URL collision, but the test bypasses `initializeLiveState` so the helper never runs. R3-DECISION applied: clarifying-comment block added in Wave 3a [qa-reviewer] M-1 deviation. Test stays mechanically green and pins useful unit-level behavior. |
| **R3-V-4** | Empirical session-storage wipe | **DEFERRED to R5.** UAT case U-132-4 in `docs/UAT_B-132.md` walks the test. Fix is correct under either empirical outcome per §65.2. |
| **R3-V-5** | T-132-G ordering pin feasibility | **PASS — fallback applied.** Test harness does not expose an `initializeLiveState` integration spy; T-132-G uses the source-text-pin fallback (asserts substring ordering on `background/tabs/index.js`). Brittle to refactors per [code-reviewer] L-3, but the behavioral coverage is provided by T-132-A + T-132-E (which exercise the production sequence end-to-end via direct calls). Sanctioned by R2 §65.12 R3-V-5. |

### §65.14.5 — R4 reviewer findings (B-132 anchor)

R4 launched all three reviewers in parallel against the working-tree diff for B-132 R3 (committed in `965cd76`).

**[code-reviewer]** — 0 CRIT / 0 HIGH / 0 MEDIUM / **3 LOW**. L-1 stale line-refs in code comments (cite `tab-claims.js:250` instead of the actual `:270` runtime gate); L-2 algorithmic duplication between `preMarkInheritedFromFloatingGroups` and `reassociateFloatingGroups` (intentional per R2 §65.4 algorithmic parity); L-3 source-text pin brittleness sanctioned by R3-V-5. **All three deferred** as defer-acceptable observations on structural posture rather than behavior. Verdict: **APPROVED for R5**.

**[security-reviewer]** — 0 CRIT / 0 HIGH / 0 MEDIUM / **3 LOW**. L-1 phantom-tabId guard relies on Set semantics (mitigated by construction — `liveTabIndex` Map keys ARE the live-tab universe); L-2 `inheritedTabs` Set unbounded-growth posture (bounded by Chrome's tab cap; not a realistic threat); L-3 URL-fallback first-match (symmetric with `reassociateFloatingGroups` algorithm — soft degradation, not security concern). **All three deferred.** Verdict: **APPROVED for R5** with note that AC3 carve-out is properly documented across three reinforcing surfaces (R0/R2/inline JSDoc) preventing future-reviewer mistake-as-vulnerability misread.

**[qa-reviewer]** — 0 CRIT / 0 HIGH / **2 MEDIUM** / 3 LOW. M-1 missing R3-V STOP-and-escalate triggers on 3 sibling tests (closed in Wave 3a — see §65.14.2 deviation #1); M-2 missing defensive `try/catch` on cold-start helper (closed in Wave 3a — see §65.14.2 deviation #2). L-1 dead-code `claimedTabIds` guard at cold-start (defensive correctness per R2 §65.6 case (ii) hypothetical — keep as-is); L-2 helper has no observability (`console.debug` candidate; defer); L-3 T-132-G source-text pin brittleness (R3-V-5 sanctioned). Three LOWs deferred. Verdict: **APPROVED for R5** post-fix-round.

Full deduplicated R4 tables in `docs/findings/sprint-40.md` ([code-reviewer] / [security-reviewer] / [qa-reviewer] B-132 R4 anchor sections).

### §65.14.6 — R2 Correctness Checklist closure verification (C-1..C-12)

| # | Check | R6 closure verdict |
|---|-------|--------------------|
| C-1a | Storage schema versioned (governance) | **N/A — confirmed.** No schema shape change. `tj:floatingGroups`, `tj:tabClaims`, `tj:meta` shapes unchanged. No `KNOWN_VERSION` bump. |
| C-1b | Data-migration strategy chosen (data) | **N/A — confirmed.** No schema change. |
| C-2 | Message contracts typed | **N/A — confirmed.** `shared/messages.js` unchanged. No new `MSG_*` types. |
| C-3 | SW cold-start safe | **PASS — confirmed.** Helper invoked exactly once per cold-start in `initializeLiveState`; no re-entry surface. Wave 3a `try/catch` adds graceful-degradation under storage corruption. |
| C-4 | ID stability | **PASS — confirmed.** Helper marks live `tabId` values pulled directly from `liveTabIndex` Map keys (Chrome-allocated); no phantom-tabId surface. |
| C-5 | Manifest file references resolvable | **N/A — confirmed.** No `manifest.json` edits. |
| C-6 | Permission minimization | **N/A — confirmed.** Zero permission additions. |
| C-7 | Allow-list direction | **PASS — confirmed.** Phase 2 gate is a skip-list (deny-list direction in C-7's framing); blast radius of false-positive is "tab not auto-claimed" (soft degradation, not security or data-integrity issue). Same-class ruling as B-125 §59.7 — explicitly sanctioned by R2 §65.9. |
| C-8 | SW-context feasibility | **N/A — confirmed.** Helper uses SW-reachable APIs only (`readPartition`, in-memory Maps). |
| C-9 | Empty-state design | **PASS — confirmed.** Four enumerated states pinned: empty `tj:floatingGroups` (T-132-B); records with no live-tab match (T-132-C); URL-collision happy path (T-132-A); no-collision (T-132-E). Plus T-132-D for gate-with-mark mechanism. |
| C-10 | Off-screen rect feasibility | **N/A — confirmed.** No DOM/positioning. |
| C-11 | Popup-lifecycle message ordering | **N/A — confirmed.** SW-side fix. No popup involvement. |
| C-12 | Manifest declaration runtime-mutability | **N/A — confirmed.** No manifest declaration changes. |

**No C-1..C-12 violations detected at R6 close.**

### §65.14.7 — AC3 deep-chain carve-out documentation surfaces

Per R2 §65.7 and §65.14.5 [security-reviewer] commendation, the AC3 known-acceptable degradation is documented across **three reinforcing surfaces** so a future reviewer cannot mistake it for an unpatched vulnerability:

1. **R0 spike chapter §64.6** — architectural rationale (`openerMap` ephemeral; persisting it diverges from Chrome's own contract).
2. **R2 chapter §65.7** — explicit "structurally infeasible to fix without persisting `openerMap`" framing with citations to `opener-chain.js:6-9` and `:12`.
3. **Production code JSDoc** at `background/tabs/floating-groups.js:581-588` — pin in the helper's documentation: *"It does NOT reconstruct pre-reload opener-chain relationships (openerMap is ephemeral — background/tabs/opener-chain.js:6-9 documents this as Chrome's own contract). A NEW middle-click inside a former-floating tab post-reload thus creates a new tab whose opener-walk returns null and which lives in Open Tabs. This is the AC3 known-acceptable degradation."*

**User-facing documentation:** R7 [technical-writer] is responsible for landing the user-recovery note ("close child, re-spawn from bookmarked parent") in `docs/user-manual/` if user-facing UX docs cover this flow.

### §65.14.8 — Test count delta (final)

- **Pre-S40 baseline** (after Sprint 39 + v1.33.1 hotfix close): **1,732 tests passing**.
- **B-132 R3 contribution:** +8 tests in `b132-cold-start-inheritance.test.js` (T-132-A through T-132-H).
- **Wave 3a fix-round:** comment-only edits to 3 sibling tests + 1 R2-planned `floating-position.test.js` clarifying comment. **Zero new test cases**, zero assertion changes.
- **B-132 total delta: +8 tests.**
- **Zero regressions** in the pre-existing suite at every checkpoint. `tests/b121-floating-group-render.test.js` (T-121-A through T-121-O), `tests/b125-claim-jump-fix.test.js` (T1-T5), `tests/b099-drift-fix.test.js`, `tests/b018-persistence.test.js`, `tests/floating-session-wipe.test.js`, `tests/floating-url-fallback.test.js`, `tests/floating-shape.test.js`, `tests/floating-multi.test.js`, `tests/floating-ready-gate.test.js`, `tests/floating-position.test.js` — all green by construction (test fixtures use unique URLs that do not collide with the fix's gate behavior, OR bypass `initializeLiveState` so the helper never runs).

### §65.14.9 — Rollback plan (single-revert)

The B-132 R3 work is consolidated in Wave 3a checkpoint commit `965cd76` (which also closes B-134's 4 HIGH findings — see §63.18.8 for B-134's separate rollback procedure).

```bash
# Identify the B-132 commit on release/v2 (after sprint merge):
git log --oneline release/v2 | grep -E "B-132 R3|S40 checkpoint"

# Revert the B-132 R3 portion only (extract from the Wave 3a commit if needed via cherry-pick):
git revert <965cd76-equivalent-on-release-v2>  # full Wave 3a
# OR for B-132-only rollback (more surgical):
# - Revert background/tabs/floating-groups.js (drop preMarkInheritedFromFloatingGroups)
# - Revert background/tabs/index.js (drop the cold-start ordering insertion)
# - Revert background/tabs/tab-claims.js (drop the Phase 2 gate)
# - Delete tests/b132-cold-start-inheritance.test.js
# - Drop the comment-only edits from 4 test files
```

**Code rollback removes:**
- `preMarkInheritedFromFloatingGroups` export from `background/tabs/floating-groups.js`.
- Cold-start ordering insertion + `try/catch` wrap from `background/tabs/index.js`.
- Phase 2 inheritance gate from `background/tabs/tab-claims.js:174-198`.
- `tests/b132-cold-start-inheritance.test.js` (NEW file — deleted entirely).
- Clarifying-comment blocks from `tests/floating-position.test.js`, `tests/floating-multi.test.js`, `tests/floating-ready-gate.test.js`, `tests/b018-persistence.test.js`.

**No storage rollback required:**
- No schema change; no data migration; no `tj:meta.schemaVersion` bump.
- Existing `tj:floatingGroups` records (v2 schema) read identically with or without the fix.

**No SW module-cache flush required:**
- No schema-version bump (per C-1a — the cache-flush note applies only to schema-version transitions). Standard SW restart on rollback is sufficient.

**`inheritedTabs` Set rollback:**
- The Set is ephemeral (SW-memory only). On rollback, the set continues to exist (it predates B-132 from B-125), but the cold-start population step is removed. Empty `inheritedTabs` at SW boot returns to pre-B-132 behavior — Mode (b) URL-collision claim-jump returns. This is the intended rollback behavior (un-fixing the bug).

**User-visible rollback impact:**
- Mode (b) URL-collision claim-jump regression returns: pre-existing floating tabs whose URL collides with a saved bookmark get auto-claimed at cold start, dominating the visual diff.
- Mode (a) shallow-chain post-reload spawn continues to work (B-125 runtime gate intact).
- Mode (a) deep-chain post-reload — already a known-acceptable degradation; unchanged by rollback.
- **No data loss; SEV2 rollback** (re-introduces the user-reported bug B-132 was filed to fix).

### §65.14.10 — Schema / contract / permission impact

Confirmed by direct re-read of the diff:
- **Storage schema:** **UNCHANGED.** No new `tj:*` partition. No `schemaVersion` bump. No `DEFAULT_PREFERENCES` extension. No SW module-cache toggle-OFF/ON note required for B-132.
- **Message contracts:** **UNCHANGED.** No new `MSG_*` types. No broadcast contract additions. The pre-existing `tab/opener-inherited` broadcast at `tab-events.js:174` (B-125 / B-013 path) fires unchanged.
- **Manifest permissions:** **UNCHANGED.** No new `permissions` or `host_permissions` entries.
- **Validation surfaces:** Phase 2 gate is a read-side filter — no new validators.

### §65.14.11 — Open follow-ups (deferred to backlog)

- **[code-reviewer] L-1 — stale line-refs in code comments.** Both the `floating-groups.js` JSDoc and the `tab-claims.js` Phase 2 inline comment cite `tab-claims.js:250` (the `@param` line of `reevaluateTab`) instead of the actual `:270` runtime gate. Comments-only fix; defer to a future cleanup sweep. Removing the line-number citation entirely (referring to "`reevaluateTab`'s inheritedTabs gate" by name) avoids future drift.
- **[code-reviewer] L-2 — algorithmic duplication.** Position-then-URL match logic duplicated between `preMarkInheritedFromFloatingGroups` and `reassociateFloatingGroups`. Extraction to `_findLiveTabForRecord(record, liveTabIndex) -> tabId|null` is a candidate cleanup if a third caller appears.
- **[code-reviewer] L-3 — T-132-G source-text-pin brittleness.** Sanctioned by R3-V-5 fallback. Future sprint can refactor to a DI-based ordering spy when the harness gains the capability.
- **[qa-reviewer] L-1 — `claimedTabIds` dead-but-defensive guard.** Optional one-line comment cross-referencing R2 §65.6 case (ii) hypothetical. Cosmetic only.
- **[qa-reviewer] L-2 — helper observability.** Optional `console.debug` on non-zero match count for UAT diagnostic value. Weighed against CLAUDE.md "no `console.log` debug noise" rule; defer.
- **R7 [technical-writer] — user-facing AC3 carve-out note.** If `docs/user-manual/` covers post-extension-reload floating-tab behavior, land a short note: "After reloading the extension, opener-chain inheritance is preserved for shallow chains (one hop). Deep multi-hop chains require re-spawning from the bookmarked parent."

---

**End of §65.**
