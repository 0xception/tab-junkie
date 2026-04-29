# §59 — B-125 Claim-Jump Fix (R2 Design)

**Sprint:** 38
**Tier:** Full (M)
**Status:** R2 complete (2026-04-28) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture — `claimsMirror`, `reevaluateTab`, `releaseClaimByTab`); §10.7 (Drift Detection); §21 (B-013 Opener-Chain Group Inheritance — `openerMap`, `walkOpenerChain`, `appendFloatingGroup`); §24 (B-018 Floating-Tab Persistence Across Restart — cold-start re-association); §46 (B-099 Drift Fix Option B — claim survives URL change; D-1/D-3 contracts and the four sanctioned `releaseClaimByTab` call sites); §58 (R0 spike for B-125 + B-121).

---

## §59.1 Purpose and scope

B-125 closes a P0 bug-fix where a tab spawned via opener-chain inheritance from
a bookmarked parent (e.g., user clicks an in-page link on
`https://xcelenergy.sharepoint.com/` claimed by bookmark "The Source",
opening a new tab to a Workday URL) silently auto-claims a coincidentally
URL-matching saved bookmark ("Home - Workday") via `reevaluateTab`. The
result observed in the product-owner repro: the original tab keeps its claim
(B-099 D-1 holds — confirmed by R0 §58.3 cause (a)/(b) falsification), but
the spawned tab is "stolen" away from its opener-chain parent group into a
different bookmark — and a second click produces a duplicate Open-Tabs row
because the second spawned tab finds "Home - Workday" already claimed.

The fix is a single behavior gate: a new ephemeral SW-memory
`inheritedTabs: Set<number>` records every tab that successfully completed
opener-chain inheritance via `appendFloatingGroup`. `reevaluateTab`'s
`!alreadyClaimed` auto-claim branch (lines 204-213 of `tab-claims.js`)
becomes a no-op for any tab in the set. The set is pruned on
`chrome.tabs.onRemoved`. No storage schema change, no message-contract
change, no manifest change, no UI change — strictly an internal
behavior-narrowing of the auto-claim path.

- BACKLOG row: `docs/BACKLOG.md` line 163 (B-125 R1 LOCKED 2026-04-28).
- R0 spike: `docs/design/58-b-125-b-121-r0-spike.md §58.3` (B-125 cause
  enumeration), `§58.5` (cross-cutting causes), `§58.7` (R3 fix-structure
  recommendation), `§58.8` (R1 + R2 handoff).

This R2 chapter resolves the four R2-VERIFY markers raised in R1.

---

## §59.2 R2-VERIFY marker resolutions

### §59.2.1 — `opener-chain.js` declaration line offsets

R1 deferred per-function line offsets to R2-VERIFY. Direct file read
(`background/tabs/opener-chain.js`, 85 lines total — matches R0 §58.2):

| Symbol | File:line | Description |
|---|---|---|
| `openerMap` declaration | `background/tabs/opener-chain.js:12` | `const openerMap = new Map();` (typed as `Map<number, number>`, tabId → openerTabId) |
| `MAX_OPENER_MAP_ENTRIES` | `background/tabs/opener-chain.js:15` | `const MAX_OPENER_MAP_ENTRIES = 512;` |
| `recordOpener` definition | `background/tabs/opener-chain.js:22-25` | Capacity-guarded set; no-op when at capacity |
| `pruneOpener` definition | `background/tabs/opener-chain.js:31-33` | `openerMap.delete(tabId)` |
| `pruneOpenersByWindow` | `background/tabs/opener-chain.js:39-43` | Bulk delete by tabIds |
| `walkOpenerChain` definition | `background/tabs/opener-chain.js:58-78` | Pure function — H-1 cycle guard via `visited` Set; `maxHops = 3` default |
| `__resetOpenerMap` | `background/tabs/opener-chain.js:83-85` | Test hatch — `openerMap.clear()` |

These offsets are the citation source for §59.3 module-ownership
recommendation.

### §59.2.2 — `releaseClaimByTab` 4-call-site invariant

R1 cited §58.5 X3 with provisional line numbers; R2 confirms via
`grep -n "releaseClaimByTab" background/ shared/`:

| # | File:line | Path | B-099 D-1 trigger |
|---|---|---|---|
| 1 | `background/tabs/tab-events.js:202` | `chrome.tabs.onRemoved` | Trigger 1 — tabs.onRemoved |
| 2 | `background/tabs/tab-events.js:280` | `chrome.windows.onRemoved` cascade | Trigger 2 — windows.onRemoved |
| 3 | `background/messages/storage-handlers.js:331` | `MSG_DEMOTE_ITEM` (after `saveFloatingGroups`) | Trigger 3 — MSG_DEMOTE_ITEM |
| 4 | `background/messages/storage-handlers.js:396` | `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair | Trigger 4 — MSG_NAVIGATE_TO_ITEM |

The 5th and 6th `grep` hits at `tab-claims.js:159, 177-179` are the function
definition + its docstring — not call sites. The grep hit at
`storage-handlers.js:94` is the `import` line. The grep hit at
`storage-handlers.js:305, 313, 329, 445` are comment lines (no function
call). **Total call-site count post-grep: exactly 4. AC4 invariant
verified.**

### §59.2.3 — Module ownership of `inheritedTabs`

**Recommendation: declare `inheritedTabs` and its three helpers
(`markInherited`, `isInherited`, `pruneInherited`) in
`background/tabs/tab-claims.js` alongside `claimsMirror`.**

**Rationale:**

1. **Consumer locality.** The set is consulted exactly once at runtime —
   inside `reevaluateTab` (`tab-claims.js:193-219`). Co-locating the
   declaration with the only consumer keeps the file self-contained: a
   reader of `reevaluateTab` sees both `claimsMirror` and `inheritedTabs`
   in the same lexical scope, and the gate logic is one local read.

2. **Test-reset symmetry.** `tab-claims.js` already exports
   `__resetTabClaims()` (line 44-47) which is called in every relevant
   `beforeEach`. Extending `__resetTabClaims` to also clear
   `inheritedTabs` is a one-line change and keeps the test-reset
   contract centralized in one module — no second reset function to
   forget. This directly addresses the R1 R2-VERIFY-4 concern.

3. **Lifecycle parallel.** `claimsMirror` is SW-memory + persisted
   (`storage.session`); `inheritedTabs` is SW-memory only. Although the
   persistence story differs, both share the "tab-identity" lifecycle:
   they exist for the lifetime of a tab, are cleared when the tab is
   removed, and are re-derived on cold start (claims via
   `reconcileClaims`, inherited tabs via `reassociateFloatingGroups` —
   though the inherited-marker is allowed to be lost on cold start; see
   §59.4(c)).

4. **`tab-events.js` would import a setter.** If `inheritedTabs` lived
   in `tab-events.js`, the consumer (`tab-claims.js`) would need to
   import a getter from `tab-events.js` — but `tab-claims.js` is
   imported by `tab-events.js`, creating a circular-import smell.
   Owning the state in `tab-claims.js` and exporting `markInherited` for
   `tab-events.js` to import is the natural direction (mirrors the
   existing `claimTabForItem` export consumed by `floating-groups.js`
   per §58.5 dependency map).

**Trade-off acknowledged:** `openerMap` lives in `opener-chain.js`
because that file is purely about opener relationships. One could argue
`inheritedTabs` is also "opener-chain related" and belongs there. R2
rejects that placement: the set's *consumer* is `reevaluateTab` (in
tab-claims.js), and the set's *meaning* is "skip auto-claim" (a claims
concept), not "this tab has an opener" (an opener-chain concept).
Co-locate with the consumer.

### §59.2.4 — Test reset protocol

R1 R2-VERIFY-4 asks which existing reset function must also reset
`inheritedTabs`. Direct read of `tests/_setup.js` (single line — installs
chrome-mock; no global reset hook) and grep across test files for
`__resetTabClaims`:

```
beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();   // <-- existing test hatch in tab-claims.js:44-47
  __resetOpenerMap();    // <-- present in b013-opener-chain.test.js:42 only
  ...
});
```

**Decision: extend the existing `__resetTabClaims()` function in
`tab-claims.js:44-47` to also clear `inheritedTabs`.** Pseudocode:

```js
export function __resetTabClaims() {
  claimsMirror = {};
  claimsReady = false;
  inheritedTabs.clear();  // NEW
}
```

Every existing test file that resets `tab-claims` already calls
`__resetTabClaims()` in its `beforeEach` — there is no other reset hatch
to add or update. The existing test files' setup remains unchanged at
the call-site level; only the function body of `__resetTabClaims`
expands. This keeps the B-119 enumeration footprint at zero (see §59.6).

**Verified test files that call `__resetTabClaims`** (grep result):

- `tests/b099-drift-fix.test.js:82`
- `tests/tab-url-change.test.js:11`
- `tests/b010-live-state.test.js`, `tests/b013-opener-chain.test.js`,
  `tests/b011-drift.test.js`, `tests/b110-drift-non-live-fix.test.js`,
  and others in the wider suite (full coverage via the existing reset
  function — no test-file change required).

---

## §59.3 `inheritedTabs` design

### Declaration

In `background/tabs/tab-claims.js`, add at module scope (next to
`claimsMirror` declaration at line 19):

```js
/** @type {Set<number>} B-125: opener-chain-inherited tabs that must NOT
 *  auto-claim a URL-matching saved bookmark. Populated by
 *  markInherited (called from tab-events.js after appendFloatingGroup
 *  resolves successfully). Pruned by pruneInherited (called from
 *  tab-events.js onRemoved). Ephemeral — empty on SW cold start;
 *  cold-start re-association via tj:floatingGroups is the recovery path. */
const inheritedTabs = new Set();
```

### Type

`Set<number>` — tabId is the natural identity primitive (matches
`openerMap`'s key type and `claimsMirror`'s value type). O(1) `has`
check inside the auto-claim hot path.

### Population

In `background/tabs/tab-events.js:140-171` opener-chain async block,
**after** `await appendFloatingGroup({...})` resolves successfully, call
`markInherited(tab.id)`. Placement is critical and aligns with §59.4
edge-case (ii):

```js
// Existing code (tab-events.js:156-163):
await appendFloatingGroup({
  groupId: result.groupId,
  itemId: result.itemId,
  windowId: liveWindowId,
  tabIndex: typeof liveIndex === 'number' ? liveIndex : 0,
  url: liveUrl,
  savedAt: Date.now(),
});
markInherited(tab.id);  // NEW — added strictly after the await resolves
// Existing broadcast continues:
broadcast(SCOPE.LIVE_STATE, 'tab/opener-inherited');
```

The catch block already exists at `tab-events.js:167-169` (verified —
prints a console.warn but does not re-throw). If `appendFloatingGroup`
throws, control transfers to the catch and `markInherited` is
**unreachable** — exactly the C-9(ii) behavior we want.

### Consumption

In `background/tabs/tab-claims.js` `reevaluateTab` (currently
lines 193-219), insert a check **before** the `!alreadyClaimed` branch.
The function shape becomes:

```js
export async function reevaluateTab(tabId, newUrl, items) {
  const normalizedNew = safeNormalizeForMatch(newUrl);
  let dirty = false;

  if (normalizedNew) {
    const alreadyClaimed = Object.values(claimsMirror).includes(tabId);
    if (!alreadyClaimed) {
      // B-125: an opener-chain-inherited tab must not auto-claim a
      // URL-matching saved bookmark (§59 / B-125). The inheritance
      // marker says the tab is "spoken for" by the parent group.
      if (inheritedTabs.has(tabId)) {
        return;  // skip auto-claim entirely; nothing dirty.
      }
      // ... existing candidates filter + assign block (unchanged) ...
    }
  }

  if (dirty) {
    await writeClaims();
  }
}
```

Note: the `inheritedTabs` check sits **inside** the
`if (!alreadyClaimed)` block. Putting it outside would mask any future
case where an `inheritedTabs` tab is somehow already in `claimsMirror`
(`alreadyClaimed === true`) — the existing short-circuit returns
correctly without the gate, so the gate must run only on the auto-claim
path it is actually narrowing.

### Pruning

In `background/tabs/tab-events.js` `chrome.tabs.onRemoved` handler
(currently lines 195-208), call `pruneInherited(tabId)` adjacent to the
existing `pruneOpener(tabId)` call at line 196:

```js
chrome.tabs.onRemoved.addListener((tabId) => {
  pruneOpener(tabId);
  pruneInherited(tabId);  // NEW — symmetric with pruneOpener
  if (reevalTimers.has(tabId)) {
    clearTimeout(reevalTimers.get(tabId));
    reevalTimers.delete(tabId);
  }
  removeTabEntry(tabId);
  releaseClaimByTab(tabId).then(...).catch(...);
});
```

`pruneOpenersByWindow` (called from `chrome.windows.onRemoved`,
line 261) does NOT need a paired `pruneInheritedByWindow` because the
existing handler already iterates `removedTabIds` (line 261-267) for
per-tab cleanup. Adding `pruneInherited(tabId)` inside that
existing per-tab loop is the cleanest path for window-removal cascade
(see §59.5 fix-scope row).

### Cold-start state

`inheritedTabs` is **empty** on SW cold-restart. This is consistent with
`openerMap`'s ephemeral nature (§58 §58.5 X1 documents this as the
intended pattern). On cold start, `reassociateFloatingGroups` runs and
re-establishes claims for any floating-group records that match a live
tab; tabs that were inherited but have already been auto-claimed by
their cold-start re-association will hit the `alreadyClaimed`
short-circuit naturally. Tabs that were inherited but for which
`reassociateFloatingGroups` does not match (e.g., parent bookmark gone)
will be eligible for auto-claim — but C-9(iii) below documents this as
acceptable: a cold-restart is a clean slate and the user's expectation
of "this tab inherited from X 30 minutes ago, before I restarted" is
not preserved by any system today.

### Concurrency

SW-memory only, no storage, no broadcast, single-threaded JS. No race
window: `markInherited(tab.id)` runs synchronously inside the
`onCreated` async callback after the await; the next consumer
(`reevaluateTab`) runs from the debounced `onUpdated` callback at least
100 ms later (per `tab-events.js:116`) — well after the
`appendFloatingGroup` write has resolved. No locking needed.

---

## §59.4 Edge-case enumeration (C-9 empty-state)

R1 AC8 / C-9 enumerates three empty states. R2 confirms implementation
specifics:

### (i) `walkOpenerChain` returns null (no parent found)

Implementation: `tab-events.js:148-149` already guards with
`if (result) { ... }`. When `result` is null, the entire async block at
lines 149-166 is skipped and `appendFloatingGroup` is not called.
**`markInherited(tab.id)` is also not called** (it lives inside the
`if (result)` block).

Outcome: `reevaluateTab` proceeds normally — auto-claim eligible. No
behavior change vs. pre-B-125. This is the correct fallback for a tab
that has no inheritance ancestor (e.g., user explicitly opened a new
tab from the address bar, opener-chain hop limit exceeded, or all
ancestors are unclaimed).

### (ii) `appendFloatingGroup` throws

Implementation: `tab-events.js:167-169` (verified by Read) is the
existing catch block:

```js
} catch (err) {
  console.warn('[tab-junkie] opener-chain inheritance failed', err);
}
```

Per §59.3 placement, `markInherited(tab.id)` is the next statement
**after** `await appendFloatingGroup(...)`. If the await rejects, control
transfers to the catch block before `markInherited` runs.
**`inheritedTabs` is NOT polluted with a tab whose floating-group
record never persisted.**

Outcome: `reevaluateTab` proceeds normally — auto-claim eligible. The
user's expectation here is "the floating-group write failed, so the tab
behaves like an ungrouped opener-tab and may auto-claim a matching
bookmark like any other tab." This is the correct degraded fallback.

### (iii) Parent bookmark deleted after successful inheritance mark

Implementation: nothing in B-125's design proactively detects this.
The tab stays in `inheritedTabs` until close. Subsequent
`reevaluateTab` invocations skip auto-claim because the marker is still
present.

Outcome: tab is "ungrouped-but-marked-inherited" — pre-B-121 it lives
in Open Tabs (because no claim exists, `buildOpenTabs` includes it);
post-B-121 it would render under the deleted parent group's now-empty
section (which itself disappears when the parent is deleted, per
existing buildGroupSection semantics — that's B-121 territory, not
B-125's). The tab is recoverable via `chrome.tabs.onRemoved` (close the
tab) or the user can take no action — there is no data loss or claim
corruption.

**Documented as known-acceptable edge case** per R1 AC7. The alternative
(claim a different bookmark because the parent is gone) is the bug
B-125 is fixing; preserving the gate is the correct design.

---

## §59.5 Fix-scope table (R3 deliverables)

| File | Function/Region | Change Kind | LOC est |
|---|---|---|---|
| `background/tabs/tab-claims.js` | Module scope, near line 19 — declare `const inheritedTabs = new Set()` | Add | +3 (decl + JSDoc) |
| `background/tabs/tab-claims.js` | New exports: `markInherited(tabId)`, `isInherited(tabId)`, `pruneInherited(tabId)` | Add | +9 (3 helpers × ~3 LOC) |
| `background/tabs/tab-claims.js:44-47` | `__resetTabClaims` body — add `inheritedTabs.clear()` | Edit | +1 |
| `background/tabs/tab-claims.js:193-219` | `reevaluateTab` — add `if (inheritedTabs.has(tabId)) return;` inside the `!alreadyClaimed` branch | Edit | +3 (gate + comment) |
| `background/tabs/tab-events.js:25` | Import `markInherited, pruneInherited` from `./tab-claims.js` | Edit | +1 (extend existing import line) |
| `background/tabs/tab-events.js:156-166` | After `await appendFloatingGroup(...)` resolves, call `markInherited(tab.id)` | Edit | +1 |
| `background/tabs/tab-events.js:195-208` | `chrome.tabs.onRemoved` handler — call `pruneInherited(tabId)` next to `pruneOpener(tabId)` | Edit | +1 |
| `background/tabs/tab-events.js:259-287` | `chrome.windows.onRemoved` handler — extend the per-tab loop at lines 261-267 to also call `pruneInherited(tabId)` | Edit | +1 |
| `tests/b125-claim-jump-fix.test.js` | New test file — 5 cases per §59.8 | Add | ~150 LOC |

**Estimated totals:**

- Production code: **6 files? No — 2 files** (`tab-claims.js`,
  `tab-events.js`). ~20 LOC net add.
- Test code: 1 new file, ~150 LOC.

**No changes to:**

- `background/tabs/opener-chain.js` (no new behavior in opener-chain
  itself; the `inheritedTabs` set is owned by `tab-claims.js`).
- `background/tabs/floating-groups.js` (the `appendFloatingGroup`
  caller in `tab-events.js` is the gate event; no change in
  `floating-groups.js`).
- `shared/messages.js` (no message-contract change).
- `manifest.json` (no permission change).
- Any UI surface (`sidepanel/`, `newtab/`, `popup/`, `standalone/`).

---

## §59.6 Pre-existing test assertions to update (B-119 / B-126 enumeration)

R1 enumerated 7 call sites in 2 test files. R2 verifies each via direct
file read:

| File:line | Test name | `reevaluateTab` argument | Pre-fix `claimsMirror` state | Short-circuit reached? |
|---|---|---|---|---|
| `tests/b099-drift-fix.test.js:125` | T1 | `tabId = 10` | `{item-1: 10}` (claimed by reconcileClaims) | YES — `alreadyClaimed = true`; `inheritedTabs` gate not reached |
| `tests/b099-drift-fix.test.js:296` | T6 | `tabId = 15` | `{item-6: 15}` (claimed) | YES |
| `tests/b099-drift-fix.test.js:332` | T7 | `tabId = 17` | `{itemA: 17}` (claimed) | YES |
| `tests/b099-drift-fix.test.js:397` | T9 first drift | `tabId = 19` | `{item-9: 19}` (claimed) | YES |
| `tests/b099-drift-fix.test.js:407` | T9 second drift | `tabId = 19` | `{item-9: 19}` (still claimed) | YES |
| `tests/tab-url-change.test.js:46` | D-1 (case A) | `tabId = 50` | `{itemA: 50}` (claimed) | YES |
| `tests/tab-url-change.test.js:74` | D-1 (case B) | `tabId = 60` | `{saved-item: 60}` (claimed) | YES |

In every existing call site, the tab is **already claimed** before
`reevaluateTab` runs. The `alreadyClaimed = Object.values(claimsMirror).includes(tabId)`
short-circuit at `tab-claims.js:203-204` evaluates to `true`, and the
`if (!alreadyClaimed) { ... }` branch is skipped entirely — the new
`inheritedTabs.has(tabId)` gate is **not reached** in any of these
seven existing call sites. None of these tests pollute `inheritedTabs`
in their setup (the set is declared in `tab-claims.js` and starts empty,
and `__resetTabClaims` (extended per §59.2.4) clears it in every
`beforeEach`).

**Result: No pre-existing JS-contract test assertions require updates;
all 7 enumerated call sites short-circuit on `alreadyClaimed` before
reaching the new `inheritedTabs` gate.**

This matches R1's expectation. The B-119 / B-126 (CSS-token expansion
not relevant here — B-125 is JS-only) enumeration discipline is
satisfied: the change is internal to one function's branch logic,
existing test contracts are preserved bit-for-bit, and the new
behavior is exercised exclusively by the new test file
`tests/b125-claim-jump-fix.test.js` (§59.8).

---

## §59.7 R2 Correctness Checklist (C-1..C-12)

| # | Check | Status |
|---|---|---|
| C-1 | Storage schema versioned | **N/A** — `inheritedTabs` is SW-memory only; no persisted shape. No `tj:*` partition added or modified. No schemaVersion bump. No `DEFAULT_PREFERENCES` extension (so the SW module-cache toggle-OFF/ON note from S30 B-092 does not apply). |
| C-2 | Message contracts typed | **N/A** — no new messages. No changes to `shared/messages.js`. The `tab/opener-inherited` broadcast at `tab-events.js:165` is unchanged. |
| C-3 | SW cold-start safe | **APPLIES** — `inheritedTabs` is empty on SW cold restart. This is consistent with `openerMap` (§58 §58.5 X1) and is documented at §59.3 "Cold-start state". On cold restart, `reassociateFloatingGroups` re-establishes claims via the position-match → URL-fallback algorithm (`floating-groups.js:60-132`); any tab that was inherited but has already been re-claimed will hit the `alreadyClaimed` short-circuit. Inherited tabs that fail re-association become eligible for auto-claim — documented as known-acceptable per §59.4(iii). |
| C-4 | ID stability | **APPLIES** — tabId is the ephemeral key, stable for the tab's lifetime, pruned on `chrome.tabs.onRemoved` (§59.3 Pruning). The `MAX_OPENER_MAP_ENTRIES = 512` cap in `opener-chain.js:15` provides the upstream bound; `inheritedTabs` size is bounded by `openerMap.size` (a tab can only be inherited if it had an opener relationship), so 512 is also the natural ceiling for `inheritedTabs`. No proactive cap needed. |
| C-5 | Manifest paths | **N/A** — no `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** — no new permissions. |
| C-7 | Allow-list direction | **APPLIES** — `inheritedTabs` is conceptually a **skip-list** (skip auto-claim if the tab is in the set). Strictly, this is a positive enumeration of "do not auto-claim", which is the inverse of an allow-list. R2 ruling: this is acceptable because the gate **narrows** an existing permissive default (auto-claim runs unless the tab is already-claimed), and the enumeration is bounded by an upstream success event (`appendFloatingGroup` resolved). The "blast radius" of a false-positive (a tab incorrectly in `inheritedTabs`) is "the user does not get auto-claim on that tab" — a soft degradation, not a security or data-integrity issue. The default behavior for a tab NOT in the set is unchanged from pre-B-125, satisfying the safety bar that motivates C-7's allow-list preference. Documented for [security-reviewer] R4 sign-off. |
| C-8 | SW-context feasibility | **N/A** — `Set<number>` is supported in all SW contexts. No browser API gate; no `DOMParser` / `document` / `window` assumption. |
| C-9 | Empty-state design | **APPLIES** — three empty states enumerated in §59.4: (i) `walkOpenerChain` returns null; (ii) `appendFloatingGroup` throws; (iii) parent bookmark deleted post-inheritance. Each has a documented expected behavior (§59.4). [qa-reviewer] R4 should verify against this enumeration. |
| C-10 | Off-screen rect | **N/A** — no DOM, no positioning, no snapshot/measurement API. |
| C-11 | Popup-lifecycle ordering | **N/A** — no popup interaction. The fix is entirely within the SW. |
| C-12 | Manifest declaration runtime-mutability | **N/A** — no manifest.json declaration involved. |

**Net flagged checks: C-3, C-4, C-7, C-9.** All are documented in this
chapter and resolved at design-time. None require [security-reviewer]
or [qa-reviewer] escalation pre-R3.

---

## §59.8 Test design

### Test file

`tests/b125-claim-jump-fix.test.js` (new). Mirrors the existing
`tests/b099-drift-fix.test.js` and `tests/b013-opener-chain.test.js`
file structure (imports `./_setup.js`, `node:test`, chrome-mock,
storage modules; `beforeEach` resets all relevant state).

### Required test cases (mirror R1 ACs)

**T1 — AC1: Opener-chain-spawned tab does NOT auto-claim a URL-matching
bookmark.**

```
Seeds:
  items = [
    { id: 'item-A', url: 'https://a.example', sortOrder: 0 },
    { id: 'item-B', url: 'https://b.example', sortOrder: 1 },
  ]
  claimsMirror = { 'item-A': 100 }   (set via reconcileClaims with tab 100 at https://a.example)

Action:
  recordOpener(101, 100)              (simulate onCreated capturing opener)
  markInherited(101)                  (simulate appendFloatingGroup resolving)
  await reevaluateTab(101, 'https://b.example', items)

Assert:
  claimsMirror['item-A'] === 100     (original claim survives — B-099 D-1)
  claimsMirror['item-B'] === undefined (new tab did NOT auto-claim item-B — B-125 fix)
```

**T2 — AC2: User-initiated tab DOES auto-claim (regression guard).**

```
Seeds:
  items = [{ id: 'item-B', url: 'https://b.example', sortOrder: 0 }]
  claimsMirror = {} (empty after reconcileClaims)
  inheritedTabs = empty (tab 102 NOT marked inherited)

Action:
  await reevaluateTab(102, 'https://b.example', items)

Assert:
  claimsMirror['item-B'] === 102 (regression guard — auto-claim still works for non-inherited tabs)
```

**T3 — AC3: `inheritedTabs` set pruned on tab close.**

```
Action:
  markInherited(101)
  isInherited(101) === true
  pruneInherited(101)

Assert:
  isInherited(101) === false
```

(Optional second assert: invoking `reevaluateTab(101, 'https://b.example', items)`
with the same seeds as T1 but AFTER `pruneInherited(101)` results in
auto-claim of item-B, proving the gate releases correctly.)

**T4 — AC4 + Q2: B-099 release-path call-site count remains 4.**

This is a static-analysis assertion, not a runtime test. R3 should add
either:

(a) A test that imports the source file and uses a regex to count
    `releaseClaimByTab(` call occurrences in the production source
    (pattern used in some existing test files for invariant guards), OR
(b) A comment-only assertion at the top of `b125-claim-jump-fix.test.js`
    referencing the `grep` invariant + the four file:line citations from
    §59.2.2.

R2 prefers (a) for automated enforcement. R3 is free to choose either
based on existing test conventions.

**T5 — AC5: User's exact repro scenario (xcelenergy → Workday).**

```
Seeds:
  items = [
    { id: 'the-source', url: 'https://xcelenergy.sharepoint.com/', sortOrder: 0 },
    { id: 'home-workday', url: 'https://wd5.myworkday.com/xcel/d/home.htmld', sortOrder: 1 },
  ]
  __setMockTabs([{ id: 200, url: 'https://xcelenergy.sharepoint.com/', windowId: 1, ... }])
  await reconcileClaims(items)
  // Sanity: claimsMirror = { 'the-source': 200 }

Action (simulate user clicking the in-page Workday link):
  recordOpener(201, 200)
  // (in real code, walkOpenerChain runs and returns { groupId: 'g-source', itemId: 'the-source' };
  //  appendFloatingGroup writes the floating record;
  //  THEN markInherited(201) is called)
  markInherited(201)
  __setMockTabs([
    { id: 200, url: 'https://xcelenergy.sharepoint.com/', windowId: 1 },
    { id: 201, url: 'https://wd5.myworkday.com/xcel/d/home.htmld', windowId: 1 },
  ])
  // (simulate onUpdated URL-resolved → reevaluateTab fires for tab 201)
  await reevaluateTab(201, 'https://wd5.myworkday.com/xcel/d/home.htmld', items)

Assert:
  claimsMirror['the-source'] === 200       (original survives)
  claimsMirror['home-workday'] === undefined (the bug is fixed — no claim transfer)
```

**Test runtime budget:** All five tests should complete in well under
200 ms (matches existing `b099-drift-fix.test.js` runtime; no async
sleep, no `chrome.storage.local.get` over network).

**Helper imports:** existing `chrome-mock.js`, `_setup.js`. No new
harness pieces. The new exports `markInherited`, `isInherited`,
`pruneInherited` are imported from `../background/tabs/tab-claims.js`.

---

## §59.9 Rollback plan

**Single-commit revert is sufficient.** No storage migration, no schema
version bump, no broadcast contract change, no manifest change.

```bash
git revert <r3-commit-sha>
```

After revert: `inheritedTabs` is removed; `reevaluateTab` reverts to
its pre-B-125 behavior (auto-claim fires for any unclaimed tab whose
URL matches an unclaimed item). The B-125 bug returns, but no other
behavior is affected. Existing B-099 D-1/D-3 tests continue to pass
(they were never modified). The new `tests/b125-claim-jump-fix.test.js`
file is also reverted in the same operation.

No paired data-migration or rollback ordering concerns: a tab that was
in `inheritedTabs` at SW shutdown is simply forgotten on next SW start
under either pre- or post-B-125 code, so the in-memory state has no
durability requirement.

---

## §59.10 As-Built (R6 close)

**Built:** 2026-04-29 (Sprint 38, R3 → R5).
**Author:** [frontend-engineer] (R3 build); [test-engineer] (R5 tests + UAT
plan); [solution-architect] (this R6 close section).

### §59.10.1 As-built vs. as-designed summary

The R3 implementation followed the §59.3 / §59.5 plan with one minor
addition. All structural decisions (module ownership in `tab-claims.js`,
gate placement inside the `!alreadyClaimed` branch, prune symmetry across
`tabs.onRemoved` and `windows.onRemoved`, extending `__resetTabClaims`)
were preserved without deviation.

**One additive deviation — the Security M-1 race-window comment:**
At R4 [security-reviewer] flagged the narrow window between
`await appendFloatingGroup(...)` and the synchronous `markInherited(tab.id)`
call. The race is bounded by the existing 100 ms `reevaluateTab` debounce,
but that coupling is not enforced by code. The fix was an inline comment
block at `tab-events.js:163-172` (within the new `markInherited` call site)
documenting the coupling and the invariant "do not lower the debounce
without revisiting this gate." This was not in the R2 plan; it is a
defensive documentation addition only — no behavior change.

### §59.10.2 Final fix-scope LOC table (actual)

| File | Region | Change | Net LOC |
|---|---|---|---|
| `background/tabs/tab-claims.js` | Module scope (line 24) — `inheritedTabs` Set + JSDoc | Add | +7 |
| `background/tabs/tab-claims.js` | New exports `markInherited`, `isInherited`, `pruneInherited` | Add | +30 (with JSDoc) |
| `background/tabs/tab-claims.js` | `__resetTabClaims` body — `inheritedTabs.clear()` + comment | Edit | +4 |
| `background/tabs/tab-claims.js` | `reevaluateTab` — `if (inheritedTabs.has(tabId)) return;` gate + comment | Edit | +7 |
| `background/tabs/tab-events.js:20` | Import line — extend with `markInherited, pruneInherited` | Edit | +0 (same line) |
| `background/tabs/tab-events.js:163-172` | After `appendFloatingGroup` await — `markInherited(tab.id)` + R4 M-1 comment | Edit | +13 |
| `background/tabs/tab-events.js:209-211` | `chrome.tabs.onRemoved` — `pruneInherited(tabId)` + comment | Edit | +3 |
| `background/tabs/tab-events.js:283-286` | `chrome.windows.onRemoved` per-tab loop — `pruneInherited(tabId)` + comment | Edit | +4 |
| `tests/b125-claim-jump-fix.test.js` | NEW — T1–T5 (5 cases) | Add | +246 LOC |

**Production totals:** 2 files, +48 LOC in `tab-claims.js`, +15 LOC in
`tab-events.js`. Estimate at R2 was ~20 LOC net production add; actual is
~63 LOC (overshoot driven by JSDoc on the three new exports + the M-1
comment block). No new files in `background/`. No changes to
`opener-chain.js`, `floating-groups.js`, `shared/messages.js`, or
`manifest.json` — exactly as predicted at §59.5.

### §59.10.3 R4 outcome

All three reviewers ([code-reviewer], [security-reviewer], [qa-reviewer])
returned PROCEED with **0 CRITICAL / 0 HIGH** findings. One inline fix
applied during R4 (security M-1 comment, see §59.10.1). All other
findings deferred per `docs/findings/sprint-38.md` (Anchor — B-125):

- code-reviewer M-1 (`tab-events.js:147` `claimsMirror` shadowing) — pre-existing.
- qa-reviewer M-1 (T3 Phase 3 mid-test `__resetTabClaims` clears the Set) — Phase 1/2 cover the API contract.
- qa-reviewer M-2 (no automated test for `appendFloatingGroup` throw path) — see §59.10.5.
- 7 LOW findings (regex specificity, PII in `console.warn`, range validation, accessibility N/A, etc.) — see `docs/findings/sprint-38.md:131-138`.

### §59.10.4 R5 outcome

Automated suite: **1,646 / 1,646 PASS** (1,641 baseline + 5 new B-125
tests). Tests live at `tests/b125-claim-jump-fix.test.js` and exercise the
five scenarios documented in §59.8 verbatim — no design drift.

UAT plan authored at `docs/UAT_B-125.md` (8 cases, 277 lines), pending
manual run by the product-owner in Edge against the unpacked extension.
The plan covers the user's exact repro (xcelenergy → Workday), the AC2
regression-guard path, tab-close pruning, multi-tab concurrent inheritance,
and SW cold-restart behavior per §59.3 "Cold-start state".

### §59.10.5 Open follow-ups

**qa-reviewer M-2 — no automated test for the `appendFloatingGroup` throw
path (C-9(ii) fallback).** The success path is fully covered by T1/T5; the
failure path where `appendFloatingGroup` rejects and `markInherited` is
therefore never called is currently asserted by code-reading + the T2
regression guard. If a future regression ever surfaces that an inherited
tab incorrectly skips auto-claim because `appendFloatingGroup` failed
silently, a targeted integration test should be added that stubs
`appendFloatingGroup` to throw and asserts auto-claim eligibility post-
catch. Candidate for a future hardening sprint; not blocking.

### §59.10.6 Schema / contract / permission impact

Confirmed by direct re-read of the diff:

- **Storage schema:** unchanged. No new `tj:*` partition. No `schemaVersion` bump. No `DEFAULT_PREFERENCES` extension. SW module-cache toggle-OFF/ON note (S30 B-092) does not apply.
- **Message contracts:** unchanged. The existing `tab/opener-inherited` broadcast at `tab-events.js:174` fires after `markInherited` as before.
- **Manifest permissions:** unchanged.
- **Rollback plan:** the §59.9 single-commit revert plan is unchanged and remains the rollback-of-record.

---

**End of §59.**
