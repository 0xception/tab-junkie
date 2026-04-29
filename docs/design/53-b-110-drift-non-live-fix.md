# §53 — B-110 Drift Indicator on Non-Live Bookmark Bug Fix (R2 Design)

**Sprint:** 36
**Tier:** Full (M)
**Status:** R6 close complete (2026-04-28) — shipped on `feature/sprint-36-ui-polish`. See §53.11.
**Owner:** [solution-architect]
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture — defines `claimsMirror`, `reconcileClaims` cold-start eviction semantics, `releaseClaimByTab` sole release surface); §10.7 (Drift Detection Architecture — defines the **invariant**: drift records derive from claimed items, are valid only while the claim exists, and MUST be cleared when the claim is released); §46 (B-099 Drift Fix — Option B claim preservation, four-trigger release surface, `MSG_UPDATE_ITEM` inline `clearDrift`); §48 (B-101 Dotted Drift Bar — `_ensureIndicators` visibility logic, the `D-5` design comment that documented "drift records only exist for claimed items per §10.7, so no live/claim coupling is needed" — that note is the source of the symptom side of the bug); §49 (B-100 Delete on Live).

**Out-of-scope (explicit):** (a) drift record auto-expiry (still icebox per §46 AC13); (b) any drift-record schema change; (c) any new `manifest.json` permission; (d) any new message type; (e) any change to `_cachedDriftRecords` lifecycle in the sidepanel; (f) MSG_DELETE_ITEM cascade — `deleteItem` does not call `clearDrift` today, but the orphan record is filtered out at sidepanel render (no item in `_itemById` → no row to render → no surfaced indicator). That is a separate hardening opportunity, NOT in scope for B-110; (g) the two non-leak release paths (`MSG_DEMOTE_ITEM` already calls `clearDrift` line 311; `tabs.onRemoved` already calls `clearDrift` line 203) are confirmed correct and are NOT touched.

---

## §53.1 Overview

B-110 is a single-item P2/M bug-fix that resolves a violation of the §10.7 drift invariant. The product-owner's UI/UX review of v1.29.0 surfaced a screenshot of a saved bookmark row displaying the dotted drift bar in its left gutter while the row was visibly NOT live (no green border, no live indicator, no claimed tab). Per §10.7, drift records are only ever supposed to exist for items whose tab is currently claimed — the symptom proves that drift records CAN persist after claim release, contradicting the invariant.

The fix is two-layer:

1. **Defense-in-depth at the render layer** — `_ensureIndicators` (`sidepanel/sidepanel.js:3170`) gains a conjunctive guard so the drift bar is only shown when BOTH `isDrifted === true` AND `live?.live === true`. Even if a stale drift record reaches the UI, the render path refuses to surface it on a non-live row. This is the symptom shield.

2. **Source patch at the leaking claim-release path(s)** — R2's audit (§53.2) identifies **two leaks** in `background/tabs/tab-claims.js` and `background/messages/storage-handlers.js` where claims are released WITHOUT a paired `clearDrift` call. R3 patches both paths so every claim release ends with a `clearDrift` call (or confirms a drift record cannot exist by construction at that path). After the source patch lands, the defense-in-depth gate is hardening only — but the gate stays in place permanently (low cost; high payoff if a future regression reintroduces a leak).

R3 lands ~25 net LOC across two source files and adds ~110 LOC of new test coverage. Zero schema changes, zero new manifest permissions, zero new message types, zero UI surface changes beyond the `_ensureIndicators` gate flip. The bug is **strictly latent for users** — the UI now refuses to show stale records (so symptom is invisible) AND the storage no longer accumulates orphan records (so no quiet growth in `tj:drift`).

---

## §53.2 Root Cause Analysis

### Leak path #1 (PRIMARY) — `reconcileClaims` cold-start eviction (`background/tabs/tab-claims.js:79-133`)

`reconcileClaims` runs at every service-worker cold start (called from `initializeLiveState` in `background/tabs/index.js:45`). Phase 1 (lines 89-97) walks every persisted claim from `tj:tabClaims` and discards any claim where:

- `tabEntry` is missing from `LiveTabIndex` (the tab no longer exists in this browser session — most common cause: tab was closed while the SW was asleep), OR
- `item` is missing from `tj:items` (the saved bookmark was deleted while the SW was asleep), OR
- the tab's URL no longer matches the item's URL after `safeNormalizeForMatch`.

When a claim is discarded, the entry is simply **omitted** from the new `reconciled` object. The `claimsMirror` is then overwritten with `reconciled`, and `writeClaims()` flushes to `chrome.storage.session`. **`clearDrift` is never called for the evicted itemId.** Any drift record that existed for that item before the SW slept survives in `tj:drift` (which lives in `chrome.storage.local`, not `session` — it persists across SW restarts AND across browser restarts).

**The exact code at fault** (file:line — `tab-claims.js:89-97`):

```js
// Phase 1: validate existing claims
for (const [itemId, tabId] of Object.entries(storedClaims)) {
  const tabEntry = index.get(tabId);
  const item = items.find((it) => it.id === itemId);
  if (tabEntry && item && safeNormalizeForMatch(tabEntry.url) === safeNormalizeForMatch(item.url)) {
    reconciled[itemId] = tabId;
    claimedTabIds.add(tabId);
  }
  // ELSE branch (implicit): claim is dropped on the floor; clearDrift is never called.
}
```

### Leak path #2 (SECONDARY) — `MSG_NAVIGATE_TO_ITEM` stale-claim repair (`background/messages/storage-handlers.js:393-395`)

When the user clicks a saved-item row whose claimed tab no longer exists in `LiveTabIndex` (race between sidepanel render and a tab close), the AC3 stale-claim repair branch calls `releaseClaimByTab(claimedTabId)` then opens a fresh tab. **`clearDrift` is never called for the released itemId.** If the bookmark was drifted at the time the tab was closed during the SW's wake window, the stored drift record survives the navigate-to-item flow.

**The exact code at fault** (file:line — `storage-handlers.js:392-395`):

```js
// AC3: stale claim — release it
if (claimedTabId !== null) {
  await releaseClaimByTab(claimedTabId);   // ← no paired clearDrift
}
// AC5: open a new tab
const newTab = await chrome.tabs.create({ url: item.url });
```

### Verified-correct paths (NOT leaks; documented for completeness)

- **`tabs.onRemoved`** (`background/tabs/tab-events.js:202-207`): correctly chains `releaseClaimByTab(tabId).then(async (releasedItemId) => { if (releasedItemId) await clearDrift(releasedItemId); ... })`. The `.catch` branch logs the error but does not silently swallow `clearDrift` — `clearDrift` runs inside the `.then`, so a failure of `releaseClaimByTab` skips both steps consistently. NO leak here.
- **`windows.onRemoved`** (`tab-events.js:279-286`): correctly batches `releaseClaimByTab` + `clearDrift` per tab via `Promise.allSettled(removedTabIds.map(async (tabId) => { const releasedItemId = await releaseClaimByTab(tabId); if (releasedItemId) await clearDrift(releasedItemId); }))`. NO leak here.
- **`MSG_DEMOTE_ITEM`** (`storage-handlers.js:308-332`): correctly calls `clearDrift(p.itemId)` at line 311 BEFORE `releaseClaimByTab(tabId)` at line 331. NO leak here.
- **`MSG_UPDATE_ITEM`** (`storage-handlers.js:179-198`): per §46 D-2, correctly calls `clearDrift(p.id)` after `updateItem` when the patch changed `url`. This is the "Snap to this tab" + edit-dialog URL-change path. NO leak here.
- **`detectDriftForTab` clear branch** (`background/tabs/drift.js:55-58`): when the tab navigates back to the saved URL, calls `clearDrift(claimedItemId)`. NO leak here.

### User-action sequence that triggers leak #1 (PRIMARY repro per R1 UAT-1)

1. User opens a saved bookmark from the sidepanel — the bookmark becomes live, claimed by the opened tab. `claimsMirror[itemId] = tabId`, persisted to `chrome.storage.session`.
2. User navigates the live tab to a different URL. `tabs.onUpdated` fires; `reevaluateTab` (post-B-099 Option B) preserves the claim; `detectDriftForTab` writes `tj:drift[itemId] = { itemId, driftedToUrl, detectedAt }` to `chrome.storage.local`. Drift bar visible in left gutter; row is live + drifted.
3. **The service worker goes idle** (Chrome MV3 SW sleeps after ~30s of inactivity; the user does not have to do anything to trigger this — natural idle is sufficient).
4. While the SW is asleep, user closes the live tab via the browser tab strip. `tabs.onRemoved` does NOT fire while the SW is asleep (events are buffered to `chrome.storage.session` for stateful APIs but `onRemoved` is fire-and-forget; if the SW is not running, the listener never executes for that event). The `releaseClaimByTab` + `clearDrift` chain at `tab-events.js:202-203` is skipped entirely.
5. Later, the user opens the sidepanel (or navigates a different tab, or any action that wakes the SW). `bootstrap.js` runs; `initializeLiveState` runs; `reconcileClaims` runs.
6. Phase 1 of `reconcileClaims` walks the persisted claim. `index.get(tabId)` returns `undefined` because the tab was closed during the sleep. The claim is omitted from `reconciled`. **No `clearDrift` is called for the evicted itemId.** `tj:drift[itemId]` still contains the drift record.
7. `MSG_LIST_ITEMS` runs; `getDriftRecords()` returns `tj:drift` raw — the orphan record is included in the response. Sidepanel populates `_cachedDriftRecords[itemId]`.
8. `buildItemRow` for the affected item: `liveStates[itemId].live === false` (claim is gone), but `driftRecords[itemId]` is defined. Pre-fix code: row gets `data-drifted="true"`, drift bar `<span>` gets `title` set + visible (B-101 D-5 gates only on `_cachedDriftRecords[itemId]` truthiness, not on `live`). **User sees dotted drift bar on a non-live row — the bug.**

### User-action sequence that triggers leak #2 (SECONDARY)

1. User opens a saved bookmark; tab becomes live + claimed.
2. User navigates the tab to drift; drift record written.
3. User closes the live tab via the browser tab strip while the SW is asleep (same SW-sleep gating as leak #1, step 3-4). Claim is NOT released; drift NOT cleared.
4. User opens the sidepanel BEFORE `reconcileClaims` runs (race window — small but real). Sidepanel renders the row as still-live (claim still in `_cachedLiveStates`).
5. User clicks the row to navigate. `MSG_NAVIGATE_TO_ITEM` fires; SW wakes; `reconcileClaims` may not have completed yet OR ran but the staleness was the URL-mismatch case (item not in `LiveTabIndex` → AC3 stale-claim repair path triggered).
6. `releaseClaimByTab(claimedTabId)` runs at line 394 — drops the claim. **`clearDrift` is NOT called.**
7. Fresh tab opens; new claim assigned. Old drift record persists in `tj:drift`.
8. Sidepanel re-renders. Item is now live again (new claim, new tab) but drift is technically stale (it referred to the old tab's drifted URL, which is no longer relevant to the current tab). The drift bar continues to show with the old `driftedToUrl` tooltip — visually the wrong information for the new live state.

### Why §10.7's invariant is violated

Per §10.7, drift records are derived state — they "only exist for claimed items." The architecture assumes that every claim-release path ends with `clearDrift`. Two of the four release paths today fail to call `clearDrift`: the `reconcileClaims` cold-start eviction (PRIMARY) and the `MSG_NAVIGATE_TO_ITEM` stale-claim repair (SECONDARY). The "Snap to this tab" + `MSG_UPDATE_ITEM` URL-change path is correct because it goes through `clearDrift` before any release happens (URL update → drift cleared → claim PRESERVED per Option B). The four-trigger release surface documented in §46 D-1 was correct in scope, but two of those triggers shipped without the corresponding `clearDrift` call.

The §48 D-5 design comment ("drift records only exist for claimed items per §10.7, so no live/claim coupling is needed") was correct **as a statement of the invariant** but incorrect **as a basis for the render gate** — the invariant is asserted but not enforced at every release site. B-110 fixes both halves: enforce at the source AND defend at the render.

---

## §53.3 R3 Fix Scope

### AC1 fix — Defense-in-depth gate at `_ensureIndicators` (`sidepanel/sidepanel.js`)

**Single condition change at line 3202.**

The `live` parameter is already passed in at the only call site (`refetchAndPatchLiveState` line 3081: `_ensureIndicators(row, live, !!drifted, drifted?.driftedToUrl)`). The shape is `{ live: boolean, active: boolean, audible: boolean, ... }` from `buildLiveStates` (`tab-claims.js:213-246`). The conjunctive guard reads `live?.live === true` (defensive nullish-safe access — `live` may be `undefined` if the item is unknown to the live-state system).

**Pre-fix** (`sidepanel/sidepanel.js:3201-3214`):

```js
const bar = row.querySelector('.item-drift-bar');
if (bar) {
  if (isDrifted) {
    const url = typeof driftedToUrl === 'string' && driftedToUrl.length > 0
      ? driftedToUrl
      : (row.dataset.itemId
        ? _cachedDriftRecords[row.dataset.itemId]?.driftedToUrl
        : undefined);
    bar.hidden = false;
    bar.title = _driftTooltipFor(url);
  } else {
    bar.hidden = true;
    bar.removeAttribute('title');
  }
}
```

**Post-fix** (one-line conditional change):

```js
const bar = row.querySelector('.item-drift-bar');
if (bar) {
  // B-110 §53 — conjunctive invariant: per §10.7, drift records only exist
  // for claimed items. The render path enforces this defensively even if a
  // stale drift record leaks through from storage (defense-in-depth).
  if (isDrifted && live?.live) {
    const url = typeof driftedToUrl === 'string' && driftedToUrl.length > 0
      ? driftedToUrl
      : (row.dataset.itemId
        ? _cachedDriftRecords[row.dataset.itemId]?.driftedToUrl
        : undefined);
    bar.hidden = false;
    bar.title = _driftTooltipFor(url);
  } else {
    bar.hidden = true;
    bar.removeAttribute('title');
  }
}
```

**Symmetric gate at `buildItemRow` first-paint** (`sidepanel/sidepanel.js:2375-2379`):

The first-paint path also conditionally sets the drift bar's title + `hidden` flag. R3 must apply the same `live?.live` gate here so the bug is fixed on the initial render of a stale-record row, not just after a `refetchAndPatchLiveState` patch. Today's first-paint code:

```js
if (drifted) {
  driftBar.title = _driftTooltipFor(drifted.driftedToUrl);
} else {
  driftBar.hidden = true;
}
```

R3 changes to:

```js
// B-110 §53 — conjunctive invariant; same gate as `_ensureIndicators` at line ~3202.
if (drifted && live?.live) {
  driftBar.title = _driftTooltipFor(drifted.driftedToUrl);
} else {
  driftBar.hidden = true;
}
```

The `live` variable is already in scope at this point (declared line 2347: `const live = liveStates?.[item.id];`).

**Aside: `data-drifted` row attribute.** Today the row sets `data-drifted = 'true'` whenever `drifted` is truthy, regardless of `live`. The B-101 CSS does not currently use `data-drifted` as a render gate (the only consumer was the deleted `.item-drifted-icon` rule); the attribute is now informational only. R3 leaves the attribute write unchanged (does NOT gate on `live?.live`) so test stubs that key on `data-drifted` retain their semantics — drift state in storage IS true, the row reflects that fact, but the bar visibility is the conjunctive gate. If a future feature (e.g., a tooltip on the row itself) wants the conjunctive contract, it should consume `live?.live && drifted` directly rather than relying on `data-drifted` alone.

### AC2 fix — Source patch at the leaking release paths (`background/`)

**Patch #1 (PRIMARY): `reconcileClaims` cold-start eviction** (`background/tabs/tab-claims.js`).

Phase 1 must collect the set of evicted itemIds and call `clearDrift` for each. The eviction set is the diff between `Object.keys(storedClaims)` and `Object.keys(reconciled)` — i.e., every itemId that was in the persisted claims but did not survive validation.

**Pre-fix** (`tab-claims.js:79-133`, abbreviated to the relevant span 86-133):

```js
const reconciled = {};
const claimedTabIds = new Set();

// Phase 1: validate existing claims
for (const [itemId, tabId] of Object.entries(storedClaims)) {
  const tabEntry = index.get(tabId);
  const item = items.find((it) => it.id === itemId);
  if (tabEntry && item && safeNormalizeForMatch(tabEntry.url) === safeNormalizeForMatch(item.url)) {
    reconciled[itemId] = tabId;
    claimedTabIds.add(tabId);
  }
}

// Phase 2: claim unclaimed items in sortOrder
// ... unchanged ...

claimsMirror = reconciled;
await writeClaims();
claimsReady = true;
```

**Post-fix** — collect `evictedItemIds` in Phase 1; after `writeClaims()` succeeds, run `clearDrift` for each evicted itemId in parallel (`Promise.allSettled`, best-effort — same pattern as `windows.onRemoved` line 279):

```js
const reconciled = {};
const claimedTabIds = new Set();
const evictedItemIds = [];   // B-110 §53 — track every claim that did NOT survive validation

// Phase 1: validate existing claims
for (const [itemId, tabId] of Object.entries(storedClaims)) {
  const tabEntry = index.get(tabId);
  const item = items.find((it) => it.id === itemId);
  if (tabEntry && item && safeNormalizeForMatch(tabEntry.url) === safeNormalizeForMatch(item.url)) {
    reconciled[itemId] = tabId;
    claimedTabIds.add(tabId);
  } else {
    evictedItemIds.push(itemId);   // B-110 §53 — claim is being dropped; drift must follow
  }
}

// Phase 2: claim unclaimed items in sortOrder
// ... unchanged ...

claimsMirror = reconciled;
await writeClaims();
claimsReady = true;

// B-110 §53 — clear any drift records that were paired with evicted claims.
// `clearDrift` is a no-op when no record exists (`drift.js:86-95`), so it is
// safe to call unconditionally for every evicted itemId. Best-effort: if any
// individual clearDrift fails (storage quota, browser shutting down), the
// reconcile completes successfully and the next reconcile cycle will retry.
if (evictedItemIds.length > 0) {
  await Promise.allSettled(evictedItemIds.map((itemId) => clearDrift(itemId)));
}
```

**Import addition required** (`tab-claims.js` top of file — currently imports only `getLiveTabIndex` and `safeNormalizeForMatch`):

```js
import { clearDrift } from './drift.js';
```

**Note on circular imports.** `drift.js` already imports `getClaimsMirror` and `getItemIdForTab` from `tab-claims.js`. Adding `clearDrift` from `drift.js` into `tab-claims.js` creates a cycle. The cycle is safe because:

- Both modules export named functions that are only called at runtime (not during module evaluation).
- The `clearDrift` call lives inside the `reconcileClaims` async function body, executed only when the function is invoked (post-bootstrap), by which point both modules are fully loaded.
- ES modules support cyclic imports as long as no top-level code tries to read the cyclic binding before it is initialized. Neither module does.

Verified zero existing cyclic imports between these two files today; the cycle introduced here is mechanically safe but should be called out for [code-reviewer] in R4. An alternative refactor (move `clearDrift` to its own thin module, or add a dedicated `evictClaims` function in `drift.js` that reads from `tab-claims.js` non-cyclically) is rejected as over-engineering for a one-call-site fix.

**Patch #2 (SECONDARY): `MSG_NAVIGATE_TO_ITEM` stale-claim repair** (`background/messages/storage-handlers.js:392-395`).

**Pre-fix:**

```js
// AC3: stale claim — release it
if (claimedTabId !== null) {
  await releaseClaimByTab(claimedTabId);
}
```

**Post-fix:**

```js
// AC3: stale claim — release it (B-110 §53 — paired clearDrift to honour
// the §10.7 invariant that drift records only exist for claimed items)
if (claimedTabId !== null) {
  await releaseClaimByTab(claimedTabId);
  await clearDrift(p.itemId);   // no-op when no drift record exists
}
```

`clearDrift` is already imported at line 95 (`import { clearDrift } from '../tabs/drift.js';`). No new import needed.

### Files changed / added (R3 deliverables)

| File | Change | Net LOC |
|------|--------|---------|
| `sidepanel/sidepanel.js` | One-line condition flip at `_ensureIndicators:3202` (`isDrifted` → `isDrifted && live?.live`); same gate added at `buildItemRow:2375` first-paint | +6, -2 (mostly comments) |
| `background/tabs/tab-claims.js` | Track `evictedItemIds` in Phase 1; `Promise.allSettled` `clearDrift` after `writeClaims`; new `import { clearDrift }` | +12 |
| `background/messages/storage-handlers.js` | One-line `await clearDrift(p.itemId)` added after `releaseClaimByTab` in AC3 stale-claim repair | +2 |
| `tests/b110-drift-non-live-fix.test.js` | NEW; ≥ 5 tests per AC5 | +110 |
| `docs/UAT_B-110.md` | NEW; ≥ 4 UAT cases per AC6 | +50 |
| `docs/design/53-b-110-drift-non-live-fix.md` | NEW; this chapter | (this file) |

**Total source LOC delta: ~22 lines.** No HTML changes; no CSS changes; no manifest changes; no message contract changes.

---

## §53.4 R5 Test Plan (≥ 5 tests, AC5)

New file: `tests/b110-drift-non-live-fix.test.js`. The tests are written against the existing `tests/chrome-mock.js` infrastructure plus an inlined `_ensureIndicators` stub mirroring the pattern used in `tests/b101-drift-bar.test.js`. Note: the SW cold-start race (sleep → tab close while asleep → wake) cannot be reproduced exactly in the chrome-mock — the mock has no SW sleep/wake state model. Tests T3 + T4 reproduce the same OUTCOME (claim discarded by `reconcileClaims`, drift record present) by directly seeding `chrome.storage.session.tj:tabClaims` + `chrome.storage.local.tj:drift` to the post-sleep state, then calling `reconcileClaims(items)` and asserting against `tj:drift` afterward. UAT-1 is the end-to-end real-browser walk-through.

| # | Name | Setup | Assertion | Maps to AC |
|---|------|-------|-----------|------------|
| **T1** | `_ensureIndicators hides drift bar when isDrifted=true and live=false (defense-in-depth gate)` | Build a row with the `<span class="item-drift-bar" hidden>` injected; call `_ensureIndicators(row, { live: false, active: false }, true, 'https://example.com/drifted')` | `bar.hidden === true` AND `bar.hasAttribute('title') === false`. Comment in test: "Direct regression test for B-110 — pre-fix this test would have FAILED because the bar was visible whenever isDrifted, regardless of live state." | AC1 |
| **T2** | `_ensureIndicators shows drift bar when isDrifted=true AND live=true (B-099 + B-101 contract preserved)` | Same row stub; call `_ensureIndicators(row, { live: true, active: false }, true, 'https://github.com/anthropic/claude')` | `bar.hidden === false` AND `bar.title === 'Drifted to: github.com'` | AC3 |
| **T3** | `_ensureIndicators hides drift bar when isDrifted=true and live={live:false,active:false,audible:false,favIconUrl:null}` (post-cold-start orphan-record sidepanel render) | Same row stub; populate `_cachedDriftRecords[itemId] = {driftedToUrl: 'x', detectedAt: 0}` to simulate orphan record sitting in cache; call `_ensureIndicators(row, {live: false, active: false, audible: false, favIconUrl: null}, true, 'https://example.com/drifted')` | `bar.hidden === true` AND `bar.removeAttribute('title')` was called (verify via lack of `title` attribute on `bar`). Comment: "Reproduces the post-cold-start UI render for an item whose claim was evicted by reconcileClaims but drift record survived." | AC1, AC2 (UI half) |
| **T4** | `reconcileClaims clears drift records for claims evicted in Phase 1 (tab missing from LiveTabIndex)` | Seed `chrome.storage.session.tj:tabClaims = {'item-A': 100}` (claimed tab is 100); seed `chrome.storage.local.tj:drift = {'item-A': {itemId:'item-A', driftedToUrl:'https://x.com/', detectedAt: 1}}`; build a `LiveTabIndex` that does NOT contain tabId 100 (the tab "was closed during SW sleep"); call `reconcileClaims([{id: 'item-A', url: 'https://saved.com/', sortOrder: 0}])` | After `reconcileClaims`: `claimsMirror['item-A'] === undefined` (claim evicted) AND `chrome.storage.local.tj:drift` does NOT contain `'item-A'` (drift cleared). Comment: "Reproduces the SW-sleep + tab-close cold-start sequence — pre-fix this test would have FAILED because reconcileClaims dropped the claim but left the drift record orphaned." | AC2 |
| **T5** | `reconcileClaims clears drift records for claims evicted via URL mismatch (Option B repair edge — item URL changed while SW asleep)` | Seed `chrome.storage.session.tj:tabClaims = {'item-A': 100}`; seed `chrome.storage.local.tj:drift = {'item-A': {itemId:'item-A', driftedToUrl:'https://x.com/', detectedAt: 1}}`; build a `LiveTabIndex` where tabId 100 has `url: 'https://different.com/'`; call `reconcileClaims([{id: 'item-A', url: 'https://saved.com/', sortOrder: 0}])` (the saved item URL is different from what the tab now holds; URL-mismatch validation drops the claim) | `claimsMirror['item-A'] === undefined` AND `chrome.storage.local.tj:drift` does NOT contain `'item-A'`. Asserts the URL-mismatch eviction branch also clears drift. | AC2 |
| **T6** | `reconcileClaims does NOT touch drift records for claims that survive validation (regression guard against over-clearing)` | Seed `chrome.storage.session.tj:tabClaims = {'item-A': 100, 'item-B': 200}`; seed `chrome.storage.local.tj:drift = {'item-A': {itemId:'item-A', driftedToUrl:'https://x.com/', detectedAt: 1}, 'item-B': {itemId:'item-B', driftedToUrl:'https://y.com/', detectedAt: 2}}`; build a `LiveTabIndex` where tabId 100 holds `https://saved-a.com/` (matches item-A — claim survives) AND tabId 200 holds `https://different-b.com/` (does NOT match item-B's saved URL — claim evicted); call `reconcileClaims([{id: 'item-A', url: 'https://saved-a.com/', sortOrder: 0}, {id: 'item-B', url: 'https://saved-b.com/', sortOrder: 1}])` | After: `claimsMirror === { 'item-A': 100 }` (item-A claim survives, item-B evicted); `chrome.storage.local.tj:drift` contains `'item-A'` (preserved — surviving claim's drift record is left alone for the natural `detectDriftForTab` clear path on the next `tabs.onUpdated`); `chrome.storage.local.tj:drift` does NOT contain `'item-B'` (cleared because claim was evicted). Asserts the fix only clears drift for EVICTED itemIds, not for surviving ones. | AC2 (regression guard) |
| **T7** | `MSG_NAVIGATE_TO_ITEM stale-claim repair clears the drift record for the released itemId` | Set up `claimsMirror['item-A'] = 100`; `chrome.storage.local.tj:drift = {'item-A': {...}}`; remove tabId 100 from `LiveTabIndex` (stale claim — tab gone but mirror not yet repaired); dispatch `MSG_NAVIGATE_TO_ITEM { itemId: 'item-A' }` to the storage-handlers dispatcher | After dispatch: `claimsMirror['item-A']` points at the newly-created tab (NOT tabId 100); `chrome.storage.local.tj:drift` does NOT contain `'item-A'`. | AC2 |

T1 + T2 + T3 + T4 + T5 = 5 mandatory tests per AC5. T6 + T7 are extras for stronger coverage of the leak-#2 path and a regression-guard for over-clearing. R5 [test-engineer] may add additional permutations (e.g., multiple evicted claims in one reconcile call) at gap-fill discretion.

**Test stub geometry** (carried from §48 `tests/b101-drift-bar.test.js`):

```js
function buildRow(itemId) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.dataset.itemId = itemId;
  const bar = document.createElement('span');
  bar.className = 'item-drift-bar';
  bar.hidden = true;
  row.appendChild(bar);
  document.body.appendChild(row);
  return row;
}

function ensureIndicatorsStub(row, live, isDrifted, driftedToUrl) {
  // Mirror the post-fix sidepanel.js logic verbatim (the actual function is
  // not exported; we reproduce the gate so test failures pinpoint the gate
  // condition specifically rather than incidental sidepanel state).
  const bar = row.querySelector('.item-drift-bar');
  if (!bar) return;
  if (isDrifted && live?.live) {
    bar.hidden = false;
    bar.title = `Drifted to: ${new URL(driftedToUrl).hostname}`;
  } else {
    bar.hidden = true;
    bar.removeAttribute('title');
  }
}
```

**Pre-existing tests that may need re-pinning** (lesson from §46 / §48 R5 hygiene rounds):

R3 should grep for `_ensureIndicators` and `item-drift-bar` across `tests/` to find any pre-existing inlined stub that asserts the pre-fix gate (`isDrifted` only). Likely candidates: `tests/b011-drift.test.js`, `tests/b101-drift-bar.test.js`. Any stub asserting `bar.hidden === false` with a `live: false` state must be updated to either (a) use `live: true` to preserve the original test intent (the live+drifted contract) or (b) be re-purposed as a new B-110-style assertion with the conjunctive gate. R3 grep result determines exact edit count.

---

## §53.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. `tj:items`, `tj:drift`, `tj:tabClaims`, `tj:groups` shapes all unchanged. No new pref keys, no validator allow-list change — therefore no SW module-cache stale-state risk per the S31 B-094 stale-SW guidance; release notes do NOT need a "toggle off-on" instruction for B-110 alone. |
| C-2 | Message contracts typed | **N/A** | Zero new message types; zero edits to message handler shapes. The `MSG_NAVIGATE_TO_ITEM` handler signature is unchanged; only an internal `clearDrift` call is added in the AC3 stale-claim repair branch. `MSG_LIST_ITEMS` response shape unchanged. |
| C-3 | SW cold-start safe | **PASS — primary focus** | The fix is fundamentally a cold-start safety repair. `reconcileClaims` runs in `initializeLiveState` (`background/tabs/index.js:45`) at every cold start; the new `Promise.allSettled(evictedItemIds.map(clearDrift))` runs AFTER `writeClaims` so a partial failure (storage quota, browser shutting down mid-await) leaves `claimsMirror` consistent — the next cold start will re-run reconciliation against the current state and have another opportunity to clear stragglers. The `clearDrift` call is itself idempotent (no-op when record doesn't exist, `drift.js:90-94`), so duplicate eviction across cold starts is safe. **Cold-start sequence after fix:** SW boots → `bootstrap.js` → `initializeLiveState` → `Promise.all([buildLiveTabIndex(), initWindowOrdinals(), readyPromise.then(listItems)])` → `reconcileClaims(items)` (Phase 1 validates + collects evictedItemIds; Phase 2 auto-claims; `writeClaims`; Promise.allSettled on `clearDrift` for evictedItemIds). Subsequent `MSG_LIST_ITEMS` responses include `driftRecords` from `getDriftRecords()` — guaranteed orphan-free relative to `claimsMirror`. The defense-in-depth gate at `_ensureIndicators` is the safety net for any drift record that escapes the source patch (e.g., a future code path adds another release without paired `clearDrift`). |
| C-4 | ID stability | **PASS** | Drift records are keyed by stable ULID `itemId` per §10.7 / §3 — unchanged. `evictedItemIds` is collected from `Object.keys(storedClaims)` which are itemIds. The `clearDrift(itemId)` call uses the same key as `writeDrift` did originally. Cross-window moves do not change the itemId. |
| C-5 | Manifest file references resolvable | **N/A** | Zero `manifest.json` changes. |
| C-6 | Permission minimization | **N/A** | Zero new permissions. `chrome.storage.local` (used by `clearDrift` via `writeTransaction`) and `chrome.storage.session` (used by `writeClaims`) are both already in the manifest. |
| C-7 | Allow-list direction | **N/A** | No new sanitizer, validator, or export surface. The `clearDrift` mutator (`drift.js:88-94`) is a partition-scoped delete keyed by a known itemId — there is no input shape to allow-list. |
| C-8 | SW-context feasibility | **PASS** | All affected APIs are already in use in the SW context: `chrome.storage.session.set` (already called from `writeClaims`), `chrome.storage.local` write via `writeTransaction` (already called from `writeDrift`/`clearDrift`), `Promise.allSettled` (native ES2020+, available in MV3 SW). No `DOMParser`, no `document`, no SW-context-restricted APIs. The sidepanel-side gate runs in document context where `live?.live` access is trivially supported. |
| C-9 | Empty-state design | **PASS — 6 paths enumerated** | (a) `reconcileClaims` with zero stored claims: `Object.entries(storedClaims)` iterates zero times; `evictedItemIds === []`; the `if (evictedItemIds.length > 0)` guard skips `Promise.allSettled` entirely — zero-cost empty path. (b) `reconcileClaims` with all claims surviving validation: `evictedItemIds === []`; same zero-cost empty path. (c) `reconcileClaims` with one or more claims evicted but no drift records exist for any of them: `clearDrift` is called for each. The mutator at `drift.js:90-94` returns the input `current` reference unchanged when the itemId is absent; **R6 correction (R4 [qa-reviewer] M-3): `writeTransaction` does NOT short-circuit on identity-equal mutator output — `background/storage/write-transaction.js:116` always issues `chrome.storage.local.set(next)`.** Net cost is therefore "one storage write of unchanged `tj:drift` partition data per evicted itemId." With ~10 evictions in the worst case this is 10 sequential queue-serialized writes for unchanged data — functionally harmless (all writes are idempotent, no data change observed by readers) but not "zero-cost" as the original R2 wording claimed. Within the §53.7 <10 ms cold-start budget on a 500-item collection. (d) `reconcileClaims` with one claim evicted AND drift record exists for that itemId: `clearDrift` removes the record; subsequent `MSG_LIST_ITEMS` response no longer includes the orphan; sidepanel `_cachedDriftRecords` clears the entry on next refresh. (e) `_ensureIndicators` called on a row where `live` is `undefined` (item not in `liveStates` map — should not happen by §10.5 contract but defensive): `live?.live === undefined` — falsy — bar hidden. Safe. (f) `_ensureIndicators` called where `live.live === false` AND `isDrifted === false`: bar already hidden; remains hidden; idempotent. |
| C-10 | Off-screen rect feasibility | **N/A** | No drag, no `setDragImage`, no `canvas.toDataURL`. The drift bar is in-DOM (out-of-flow via `position: absolute`) but always inside the row's bounding box. |
| C-11 | Popup-lifecycle message ordering | **N/A** | The fix paths run in (a) the SW (no popup involvement; `reconcileClaims` runs at SW startup) and (b) the sidepanel document (no focus-shift APIs invoked). The `MSG_NAVIGATE_TO_ITEM` handler does call `chrome.tabs.update` + `chrome.windows.update` — but the fix adds `clearDrift` INSIDE the SW handler, BEFORE the `chrome.tabs.create` call (in the stale-claim repair branch) and not from any popup context. C-11 was authored for popup-side senders awaiting an SW round-trip after the focus shift; this fix is an SW-internal sequencing change. |
| C-12 | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` edits. |

**Summary: 1 PASS-with-focus (C-3) + 1 PASS (C-4) + 1 PASS-with-enumeration (C-8) + 1 PASS-with-enumeration (C-9) + 8 N/A.** C-3 is the central architectural concern; the rest of the checks are correctly N/A because B-110 is a surgical bug-fix on a stable foundation.

---

## §53.6 UAT Plan (≥ 4 cases, AC6)

New file: `docs/UAT_B-110.md`. Manual test cases against the unpacked extension on `feature/sprint-36-ui-polish`.

| # | Case | Steps | PASS criteria | FAIL criteria |
|---|------|-------|---------------|---------------|
| **UAT-1** | Primary repro — drift bar disappears on tab-close-while-SW-asleep | (1) Open a saved bookmark from the sidepanel (item becomes live; row shows green border, no drift bar). (2) In the opened tab, navigate to a different URL (item becomes drifted; dotted amber bar appears in left gutter alongside green border). (3) Wait ~30 seconds with no other browser activity — SW will go to sleep. Optionally inspect SW lifecycle in `edge://serviceworker-internals` to confirm. (4) Close the tab via the browser tab strip (NOT via the sidepanel). (5) Bring focus back to the sidepanel (this wakes the SW). | After step 5: dotted drift bar is GONE from the item row; row shows non-live state (no green border, no live indicator). DevTools → Application → Storage → `chrome-extension://...` → Local Storage → `tj:drift` does NOT contain an entry for the item's id. | Drift bar still visible on the item row OR `tj:drift` still contains an entry for the item id. |
| **UAT-2** | Storage verification (post-UAT-1) | After UAT-1 step 5, open DevTools → Application → Storage → Local Storage → inspect `tj:drift`. | The JSON-stringified value of `tj:drift` does NOT contain the item's id as a key. | The item's id is present as a key in `tj:drift`. |
| **UAT-3** | Regression: live + drifted still shows | (1) Open a saved bookmark. (2) Navigate the live tab to a different URL. (3) Leave the tab open. (4) Sidepanel row remains visible. | Dotted drift bar visible in row gutter alongside green border (or live indicator); hostname tooltip on hover shows "Drifted to: <hostname>". | Drift bar absent OR tooltip missing — would indicate the conjunctive gate over-suppressed the bar. |
| **UAT-4** | Multi-window propagation | (1) Open the sidepanel in two browser windows (Window A and Window B). (2) In Window A, open a saved bookmark; navigate the tab to drift; close the tab via the browser tab strip after the SW sleeps (~30s). (3) Bring focus to Window B. | Window B's sidepanel row reflects cleared drift state (no dotted bar) within ~1 s of focus change (broadcast propagation). | Window B still shows the drift bar after Window A's tab close. |
| **UAT-5** (extra) | MSG_NAVIGATE_TO_ITEM stale-claim repair clears drift | (1) Open a saved bookmark; navigate to drift; let SW sleep; close the tab. (2) Without bringing focus to the sidepanel first (avoid waking the SW via sidepanel render), click directly on the row in the sidepanel — the navigate-to-item path triggers; if the stale-claim repair branch fires (race with reconcileClaims), the drift should still be cleared. | After click: new tab opens at the saved URL; sidepanel row eventually shows live again (newly claimed); `tj:drift` no longer contains the item id. | `tj:drift` still contains the item id after the navigate-to-item flow completes. |

UAT-5 is timing-sensitive (depends on the order in which the SW's reconcile vs. the popup's message arrive); it may not always reach the AC3 stale-claim repair branch. If it does not, the test PASSES trivially (the AC1 defense-in-depth gate hides the bar regardless). If [test-engineer] finds UAT-5 unreliable to reproduce manually, it can be downgraded to PRIORITY=LOW and replaced with a test-only assertion (covered by T7 in §53.4).

---

## §53.7 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| `reconcileClaims` cold-start with eviction | < 10 ms incremental vs. baseline on 500-item collection with 20 evicted claims | R5 unit test times `reconcileClaims` end-to-end | `Promise.allSettled` with N parallel `clearDrift` calls. Each `clearDrift` is one `writeTransaction` op against `tj:drift` (typically < 50 entries). On 20 evictions: 20 parallel storage writes + the existing `writeClaims`. Expected total overhead < 10 ms — well within the §9 cold-start budget. |
| `_ensureIndicators` per-row gate evaluation | < 1 µs incremental vs. baseline | N/A — micro-optimization, not measured | One additional `live?.live` truthiness check per call. Negligible. |
| `MSG_NAVIGATE_TO_ITEM` stale-claim repair | < 5 ms incremental vs. baseline | UAT spot-check | One additional `await clearDrift(p.itemId)` (one writeTransaction) inserted between `releaseClaimByTab` and `chrome.tabs.create`. Sequential await is necessary to honour the §10.7 invariant before any subsequent `MSG_LIST_ITEMS` reads `tj:drift`. Single-key delete; cheap. |

No path adds a full collection re-read, an unbounded loop, or a synchronous storage round-trip in the render hot path.

---

## §53.8 Accessibility Plan

| Surface | Treatment | Rationale |
|---------|-----------|-----------|
| Drift bar (`.item-drift-bar`) — visibility gated by conjunctive `live?.live && drifted` | `aria-hidden="true"` retained per B-101 D-4 / B-048 AC7. Row-level `aria-label` continues to be the AT carrier for drift state via `buildItemRowAriaLabel` (`shared/aria-label.js:31`). | The gate is purely visual; the AT contract is unaffected by B-110. The row aria continues to announce "tab content has changed" whenever the `drifted` parameter to `buildItemRowAriaLabel` is truthy — i.e., whenever `_cachedDriftRecords[itemId]` is defined, regardless of `live?.live`. **Minor consideration:** if `_cachedDriftRecords` contains an orphan record (stale leak to the UI before reconcileClaims has run), the row aria-label will still announce "tab content has changed" while the visual bar is hidden. R3 leaves this asymmetric on purpose: the source patch removes orphans on every cold start, so the stale-aria window is at most one cold-start cycle. After one full cold-start sequence, the orphan is cleared from storage, the next `MSG_LIST_ITEMS` round-trip refreshes `_cachedDriftRecords` to drop the orphan, and the next `buildItemRowAriaLabel` call no longer announces drift for that item. **Alternative:** also gate the aria-label on `live?.live` — REJECTED because (a) the source patch is the proper fix and the aria-label asymmetry is short-lived; (b) gating the aria-label would conflate drift facts with claim facts at the AT layer, fighting the §31 B-048 contract that the row label reflects the complete state ensemble. |
| Tooltip + hostname extraction | Unchanged. The bar's `title` attribute is set ONLY when the bar is visible (gate guards both `bar.hidden = false` and `bar.title = ...`). When hidden, `removeAttribute('title')` clears any prior tooltip — no zombie tooltip from a state flip. | Symmetric: state flip closes both the visual and the tooltip in lock-step. |
| Color contrast | No CSS changes. `--drifted-color` value-set unchanged across all 14 themes. | No new color audit needed. |
| Keyboard reachability | No keyboard contract changes. The drift bar is `aria-hidden` + `pointer-events: none` — not a tab-stop. The keyboard-first interaction path with a drifted row is unchanged (B-099 "Snap to this tab" via right-click context menu / keyboard menu key). | No new interactive elements added. |

**Net accessibility effect: zero AT-visible behavior change after one cold-start cycle.** The conjunctive gate is sighted-user-only.

---

## §53.9 Rollback Plan

**Single-commit revert of the S36 B-110 merge restores pre-S36 behavior** — i.e., the bug returns. No storage migration, no manifest permission change, no message contract change.

```bash
# Identify the merge SHA on release/v2:
git log --oneline release/v2 | grep "B-110"

# Single-commit revert:
git revert <merge-sha>
git push origin release/v2

# Sidepanel surfaces refresh on next reload — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:drift` partition | Pre-rollback orphan records that the source patch had cleared remain cleared. Records cleared by the patch are gone for good (no data loss — drift records are derived state, re-derivable from the next `tabs.onUpdated` event for any still-claimed item that diverges from its saved URL). |
| `tj:items` / `tj:tabClaims` | No-op. Untouched by B-110. |
| Manifest permissions | No-op. Untouched by B-110. |
| User-facing breakage | The bug returns: stale drift bars may reappear on non-live rows after SW sleep + tab close cycles. The render gate is gone; orphan drift records from any cold-start eviction will surface to the UI again. **No data loss; only UX regression.** |

**SEV severity if rollback needed: SEV3 (minor degradation).** The drift indicator displays incorrectly on non-live rows; the user's saved bookmarks are unchanged; no storage corruption.

---

## §53.10 Open Questions

**None.** R1 was fully locked (Q1, Q2, Q3 + 6 ACs locked 2026-04-25). R2 confirmed the leak via direct code audit:

- Q1 defense-in-depth gate at `_ensureIndicators` line 3201 — confirmed location is now line 3202 in the post-B-101 file (`isDrifted` branch); R3 applies the conjunctive change documented in §53.3.
- Q2 source fix candidate paths — R2 audit identified TWO leaks (PRIMARY: `reconcileClaims` Phase 1 eviction, SECONDARY: `MSG_NAVIGATE_TO_ITEM` AC3 stale-claim repair). Both are patched per §53.3. The four other release paths are confirmed correct.
- Q3 UAT repro scope — locked by R1; UAT-1..UAT-4 in §53.6 match the R1 spec exactly. UAT-5 added as an extra coverage case for the SECONDARY leak.

R3 has zero outstanding architectural decisions.

---

## §53.11 As Built (R6 close — 2026-04-28)

**Files changed (vs. §53.3 R3 fix scope expectation):**

| File | Edit | Net LOC | Matches §53.3? |
|------|------|--------:|----------------|
| `sidepanel/sidepanel.js` (line ~2375 first-paint, line ~3208 `_ensureIndicators`) | conjunctive gate `&& live?.live` at both render sites + comment update | +14 / -7 | ✅ within "+6/-2" expectation (slightly over due to expanded comment block; see [code-reviewer] L-3 below) |
| `background/tabs/tab-claims.js` | new `import { clearDrift } from './drift.js'` + `evictedItemIds` tracker + `Promise.allSettled` clearDrift batch after `writeClaims` | +18 / -1 | ✅ within "+12" expectation (slightly over due to comment density) |
| `background/messages/storage-handlers.js:393` | `await clearDrift(p.itemId)` after `await releaseClaimByTab(claimedTabId)` in AC3 stale-claim repair | +5 / -2 | ✅ within "+2" expectation |
| `tests/b110-drift-non-live-fix.test.js` (NEW) | T1-T8 (8 tests; T8 added in R6 per [qa-reviewer] M-2) | 339 LOC | ✅ ≥5 mandatory; shipped 8 |
| `tests/b101-drift-bar.test.js` (R4 [code-reviewer] M-1 + [qa-reviewer] M-1 fix) | inlined `_ensureIndicators` and `buildItemRow` stubs updated to mirror post-B-110 production gate; T2 + T3 call sites updated to pass `liveStates` with `live: true` | +12 / -3 | R6 hygiene fix; not in original §53.3 scope but called out in §53.4 "may need re-pinning" — addressed in R6 |
| `docs/UAT_B-110.md` (NEW) | UAT-1..UAT-5 cases | 50 LOC | ✅ ≥4 mandatory; shipped 5 |
| `docs/SOLUTION_DESIGN.md` (TOC) | +1 line — §53 added to chapter index | +1 LOC | Required by R6 close (new chapter added) |
| `docs/design/53-b-110-drift-non-live-fix.md` (this file) | §53.5 C-9 (c) text corrected per [qa-reviewer] M-3; §53.11 As Built filled | ~30 LOC delta | R6 work product |

**Test counts:** pre-B-110 baseline 1,481 → post-B-110 **1,489 (+8)**. Full suite passes; zero regressions.

**R4 disposition (2026-04-28):**
- **[code-reviewer]**: PASS-WITH-FIXES.
  - **M-1** (b101 stubs out of sync with post-B-110 production gate): fixed in R6 — both inlined stubs in `tests/b101-drift-bar.test.js` now use `if (isDrifted && live?.live)` and `if (drifted && live?.live)`. T2 + T3 call sites updated to pass `liveStates` with `{ live: true }` for the drifted-item paths.
  - **L-1** (cyclic import has no in-file marker): noted; the import line lives next to existing imports without a dedicated B-110 comment. Could be addressed in a future hygiene round; non-blocking.
  - **L-2** (Promise.allSettled runs after `claimsReady = true`): documented as design choice — defense-in-depth render gate covers the brief window. The R6 close adds an explicit clarification in §53.5 C-9 (c) about the cost ordering.
  - **L-3** (rewritten _ensureIndicators comment block is wordy): retained as-is. The historical narrative is load-bearing for a future engineer reading just the source file; the slight verbosity is acceptable for a §10.7 invariant gate.
  - **L-4** (gate duplicated across two render paths): retained — duplication explicitly documented in §53.3 as acceptable; the two paths legitimately differ.
  - **L-5** (T7 regex could fail opaquely): addressed — T7 now includes coarse fallback `assert.ok(src.includes(...))` for both calls before the ordered-pair regex, so failure messages distinguish "patch site missing entirely" from "patch site present but ordering wrong."
  - **L-6** (`row.dataset.drifted` still reflects storage truth, not conjunctive truth): retained per §53.3 "Aside" — attribute is informational, no CSS gates on it.
- **[security-reviewer]**: PASS. No findings any tier. Confirmed: zero new manifest permissions, zero new message types, zero CSP-relaxing constructs, zero new sinks. `clearDrift(p.itemId)` is fed by existing `MSG_NAVIGATE_TO_ITEM` payload validation; no untrusted-data path created.
- **[qa-reviewer]**: PASS-WITH-FIXES.
  - **M-1** (same as code-reviewer M-1): fixed in R6.
  - **M-2** (no automated test for the documented aria-label asymmetry): fixed in R6 — T8 added to `tests/b110-drift-non-live-fix.test.js` pinning that `buildItemRowAriaLabel` still announces "tab content has changed" when `live.live=false` AND `drifted=true`. Defends against a future engineer "fixing" the asymmetry by gating the aria-label on `live?.live` (which would silently fight the §31 B-048 contract).
  - **M-3** (R2 §53.5 C-9 (c) inaccurately claimed `writeTransaction` short-circuits): fixed in R6 — text updated to acknowledge `writeTransaction` always issues `chrome.storage.local.set(next)`; the cost is "one storage write of unchanged `tj:drift` partition data per evicted itemId" rather than zero. Functionally harmless (idempotent writes), within the §53.7 cold-start budget.
  - **L-1** (T7 regex robustness): addressed in R6 alongside [code-reviewer] L-5 — coarse fallback added.
  - **L-2** (UAT-5 SKIP escape hatch): retained; T7 is correctly framed as a static patch-site guard, not a runtime test.
  - **L-3** (UAT-4 timing fragility re: `requireClaimsReady` broadcast suppression): noted; out-of-scope follow-up — pre-existing `claims-ready` broadcast gap, not introduced by B-110.
  - **L-4** (DOM shim minimality): acceptable for current scope; no extension needed for B-110.

**Deviations from §53.3 R2 plan:**
1. R3 LOC came in slightly above the estimate (+39/-13 source vs. predicted +20/-2) due to expanded comment density on the gate sites and import-cycle commentary. Functionally identical to the R2 plan.
2. R6 added T8 (aria-label asymmetry pin) and a b101 stub-update — both are R4-driven hygiene fixes, not deviations from the underlying fix.

**UAT execution:** deferred to product-owner manual run in Edge per Sprint 36 close convention. UAT-1 through UAT-5 (`docs/UAT_B-110.md`) are documented as a checklist; results to be recorded in `SPRINT.md` "Completed This Sprint" → B-110 entry at sprint close. SEV3 rollback procedure documented in §53.9 (single-commit revert; no storage migration).

**Follow-up backlog candidates** (file in BACKLOG.md as separate items if/when prioritized):
- **R4 [code-reviewer] L-1** — Add an in-file comment marker at `background/tabs/tab-claims.js` import line documenting the drift.js cycle so a future contributor refactoring either module sees the constraint without having to read §53.3.
- **R4 [code-reviewer] L-2** — Optional: invert the order so `Promise.allSettled(clearDrift)` completes BEFORE `claimsReady = true`. Trade-off: delays the first `MSG_LIST_ITEMS` read by N×writeTransaction latency on cold starts that have evictions. Defense-in-depth gate makes the current order safe.
- **R4 [qa-reviewer] L-3** — Pre-existing `claims-ready` broadcast gap (the `requireClaimsReady` flag at `broadcast.js:12` suppresses focus-change broadcasts during reconcile, with no replay after `claimsReady = true`). May intermittently affect UAT-4. Independent of B-110.
- **R4 [qa-reviewer] M-3 (option a)** — Optimize `writeTransaction` to short-circuit when the mutator returns the input `current` reference unchanged. Would eliminate the no-op storage writes for non-drifted evictions documented in §53.5 C-9 (c). Small perf optimization with cross-cutting blast radius (touches the central write boundary at `background/storage/write-transaction.js`); deferred for a separate item.

**New precedents established:**
1. **Two-layer fix pattern for invariant violations** (§53.3 D-1 + D-2): when a documented invariant (e.g., §10.7 "drift records only exist for claimed items") is found to be violated in production, the canonical fix is (a) defense-in-depth render gate that enforces the invariant at the surface AND (b) source patches at every leak path that violates it. Either alone is incomplete: the gate alone leaves storage to grow; the source patch alone has no safety net for a future regression.
2. **Static-source patch-site guards** (§53.4 T7 + R6 L-5 fallback addition): when modeling the full message dispatcher in tests is out-of-scope (focus-shift races, popup teardown, etc.), a static-source `assert.match` regex against the production file is acceptable as a patch-site guard. Pair with a coarse `assert.ok(src.includes(...))` fallback so failure messages distinguish "missing entirely" from "present but ordering wrong."
3. **R6 stub-update obligation for inline test reproductions** (R4 [code-reviewer] M-1 + [qa-reviewer] M-1): when a test file contains an inlined reproduction of a production helper (because the helper is not exported), the R6 close MUST grep for the reproduction and update it to mirror the post-fix production gate. Otherwise the test becomes a false-green: existing assertions still pass (because they happen to use compatible inputs) while the reproduction has silently drifted from production. Pre-pin against future regressions.
4. **Aria-label asymmetry pin pattern** (T8): when an R2 chapter explicitly accepts an asymmetry between visual UI gating and AT-layer announcement, R5 MUST add a regression test that pins the asymmetry. Defends against a future engineer "fixing" the asymmetry without realizing the documented tradeoff.

