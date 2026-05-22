# Sprint 45 — Findings (R0 spike + R4 to come)

> Joint R0 spike output for B-164 + B-163 was produced 2026-05-21 by [solution-architect] (Opus) at sprint kickoff. R0 for B-166 was implicit in the BACKLOG filing (3 pre-enumerated options); R2 picks among them. R4 deduplicated findings will be appended below after the review round runs.

---

## R0 — Joint spike for B-164 + B-163

### Chrome Event-Sequence Research (cited)

1. **`chrome.tabs.onReplaced(addedTabId, removedTabId)`** — Per the older Google Code Chromium docs (preserved at `sunnyzhou-1024.github.io/chrome-extension-docs/extensions/tabs.html`): when a tab is reactivated from a discarded state, its tabId is rotated permanently and a new Tab/WebContents is created; `onReplaced` is the translation between the dead and the new id. Modern developer.chrome.com docs are terse ("Fired when a tab is replaced with another tab due to prerendering or instant") and do NOT explicitly confirm the discard-reactivate case. **R2-VERIFY via probe**.
2. **`chrome.tabs.onDiscarded`** — Does NOT exist on the modern API surface. The discard signal is exposed through `chrome.tabs.onUpdated` with `changeInfo.discarded === true` and/or `changeInfo.status === 'unloaded'`. **R2-VERIFY via probe**.
3. **`chrome.tabs.discard(tabId)`** — Returns `Promise<Tab | undefined>`. Modern docs imply tabId is preserved across the call itself; the rotation happens at reactivation (per item 1). **R2-VERIFY**.
4. **`chrome.idle.onStateChanged`** — fires `'locked'` / `'idle'` / `'active'`; default detection interval 60s (configurable; `setDetectionInterval` min ~15s). Requires `"idle"` permission. All `chrome.*` events wake the SW (per chromium-extensions mailing list confirmation).
5. **MV3 SW lifetime on OS sleep** — SW shuts down after 30s idle; no documented "SW survives sleep" guarantee. `chrome.runtime.onStartup` fires only on browser startup, NOT OS wake. Events fired *while the SW is asleep are NOT queued* — the well-known gap behind B-149 / B-110.

### B-164 R0 Decision

**Pick: combination (a) + (c), with (b) as the empirical-probe prerequisite.**

- **(a) Add `chrome.tabs.onReplaced` listener** in `background/tabs/tab-events.js`. On `(addedTabId, removedTabId)`, perform a 5-table sweep: (1) `claimsMirror` rewrite, (2) `inheritedTabs` Set remap, (3) `_faviconStampedItemIds` remap, (4) `reevalTimers` Map remap, (5) `liveTabId` field on every `tj:floatingGroups` record.
- **(c) `chrome.idle.onStateChanged` listener** in a new module `background/tabs/idle-reconciler.js`. On `state === 'active'`, defensively rerun `reconcileClaims(items)`. Costs one `chrome.storage.local` read per wake.
- Adds `"idle"` to `manifest.json` permissions — C-6 minimization justification recorded in R2.

**No storage-schema, message-contract, or UI-surface changes. Purely additive to the SW.**

**Major risk + open R2 question**: order-of-events on wake. If `chrome.tabs.onUpdated` deltas arrive before `onReplaced` fires, the existing `reevaluateTab` 100ms debounce (`tab-events.js:159`) may operate against the new tabId without remap context. R2 must specify whether `onReplaced` remap takes a write-lock-equivalent (gate `reevalTimers` flush on a "remap in flight" Promise) and whether C-14 generation-counter discipline applies.

### B-163 R0 Decision

**Pick: option (a) — defer §53 paired-clear + add Phase-3 drift-URL fallback sweep + Phase-4 conditional drift drop.**

In `background/tabs/tab-claims.js` `reconcileClaims`:
1. **Defer the §53 paired-clear** — do NOT call `clearDrift` during Phase-1 eviction at line 223-225. Collect `evictedItemIds` instead.
2. **New Phase 3 (drift URL fallback)** — for each `itemId` in `evictedItemIds` that is STILL unreconciled after Phase 2, read its drift record (single `getDriftRecords()` call, cached for the loop), look up `safeNormalizeForMatch(driftedToUrl)` in the same `urlToTabs` map Phase 2 built (inherited-tab skip preserved), pop the first unclaimed tab, bind. One-tab-per-drift-record cap (mitigation against unrelated freshly-opened tabs).
3. **New Phase 4 (conditional drift drop)** — call `clearDrift(itemId)` ONLY for evicted items that did NOT match in Phase 3 either. Both URLs failed → drift is truly orphaned → safe to drop. Preserves §10.7 invariant.

**Preserves**: B-149 Phase-1 contract (no URL re-check on existing claims), §10.7 invariant (drift records only exist for genuinely-recoverable items), B-110 §53 spirit (drift drops eventually, just deferred one phase).

**Major risk + open R2 question**: drift-URL hijack of unrelated tabs. If the user opens `https://github.com/anthropic/claude` in a fresh tab post-restart and a *different* bookmark drifted to that URL pre-restart, Phase-3 would bind. Mitigation: primary URL always wins + one-tab-per-drift-record cap. Open R2 question: introduce a fallback-only TTL (`Date.now() - drift.detectedAt < N days`) or accept no-TTL hijack risk? Product-owner decision.

### Cross-Item Analysis

**Separate chapters, ONE shared invariant in both.**

- `docs/design/69-b-164-sleep-claim-remap.md` — runtime event-feedback completeness (new chrome listeners + idle hook)
- `docs/design/70-b-163-drift-fallback-reconcile.md` — cold-start algorithm change (Phase 3/4 in `reconcileClaims`)

**Shared invariant both chapters MUST cite**: claim-mirror authoritativeness — `claimsMirror[itemId] === tabId` is true iff (a) tab exists in `LiveTabIndex` AND (b) item exists in `tj:items`, regardless of URL drift state (B-149 §41). B-164 enforces by *remapping* the mirror when Chromium rotates the tabId; B-163 enforces by *re-establishing* the mirror when neither side existed at reconcile time but a drift-URL match exists.

### Probe Script (for product-owner)

```js
// Tab Junkie B-164/B-163 R0 probe — paste into the SW console.
// edge://extensions → Tab Junkie card → "Inspect views: service worker"
// Safe: read-only on tabs; no chrome.storage writes; no destructive ops.

(() => {
  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;
  const log = (label, ...rest) => console.log(`[B-164-probe ${ts()}] ${label}`, ...rest);

  log('PROBE START — listeners attached. Keep this SW console open.');

  // 1. onReplaced — fires on prerendering AND (per Chromium docs) discard-restore.
  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    log('onReplaced FIRED', { addedTabId, removedTabId });
  });

  // 2. onUpdated with discarded — community-reported channel for discard signal.
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
    if ('discarded' in info || info.status === 'unloaded') {
      log('onUpdated.discarded', { tabId, discarded: info.discarded, status: info.status, url: tab && tab.url });
    }
  });

  // 3. onRemoved — for comparison: did the OS-discard look like a removal?
  chrome.tabs.onRemoved.addListener((tabId, info) => {
    log('onRemoved', { tabId, isWindowClosing: info.isWindowClosing, windowId: info.windowId });
  });

  // 4. idle — does lid-close fire 'locked'? Does wake fire 'active'?
  //    Note: requires "idle" permission. If absent, this call will throw.
  try {
    chrome.idle.setDetectionInterval(15);
    chrome.idle.onStateChanged.addListener((state) => log('idle.onStateChanged', { state }));
    log('idle listener attached (15s threshold)');
  } catch (e) {
    log('idle UNAVAILABLE — need "idle" in manifest.json permissions to probe', e.message);
  }

  // 5. runtime.onStartup — does OS wake fire it? (Expectation: no, only browser start.)
  chrome.runtime.onStartup.addListener(() => log('runtime.onStartup FIRED'));

  // 6. Helper: manually discard a tab to verify tabId behavior right now.
  globalThis.tjProbeDiscard = async (tabId) => {
    if (typeof tabId !== 'number') {
      const tabs = await chrome.tabs.query({});
      log('tjProbeDiscard — pass a tabId. Current tabs:',
        tabs.map(t => ({ id: t.id, url: t.url, discarded: t.discarded, active: t.active })));
      return;
    }
    log('tjProbeDiscard — calling chrome.tabs.discard(' + tabId + ')...');
    const result = await chrome.tabs.discard(tabId);
    log('tjProbeDiscard — returned:', { resultId: result && result.id, discarded: result && result.discarded });
    log('Now CLICK that tab in the strip to reactivate it — watch for onReplaced/onUpdated.');
  };

  log('READY. Two tests to run:');
  log('  TEST A (manual discard): run tjProbeDiscard() to list tabs, then tjProbeDiscard(<id>).');
  log('             Click the discarded tab in the strip — check if onReplaced fires with a NEW addedTabId.');
  log('  TEST B (OS sleep):  Close the laptop lid for 30+ seconds, reopen.');
  log('             Watch this console — note which events appear and in what order.');
  log('             Bonus: leave one tab playing audio or unactivated for > 1hr before sleep — more likely to be auto-discarded on wake.');
})();
```

**How to run + what to observe**: Open `edge://extensions` → Tab Junkie card → click "service worker" under "Inspect views". Paste the snippet at the DevTools console prompt. You should immediately see `[B-164-probe +0.0s] PROBE START`. Run **Test A** first: `tjProbeDiscard()` lists current tabs; pick a non-active tabId from a different window and run `tjProbeDiscard(<id>)`; click that tab in the strip to reactivate it. Note whether `onReplaced` fires and whether `addedTabId !== removedTabId` — this confirms whether modern Chromium still rotates tabIds on discard-restore. Then run **Test B**: close the laptop lid for 30+ seconds, reopen. If `onReplaced` events appear post-wake, B-164 fix (a) is empirically confirmed. If only `onUpdated.discarded` (without onReplaced), fix (a) needs to listen on `onUpdated` with the `discarded` predicate instead. If no events at all, fix (c) is the sole remedy. Either way, capture the console log and paste back for R2 to lock the design.

### Open R2 Questions

- **Q1 (B-164, blocking)**: Does `chrome.tabs.onReplaced` actually fire on OS-triggered discard-restore in modern Chromium/Edge, or only on prerendering? Probe Test A + B resolves; if "no", fix (a) is moot and (c) becomes the sole remedy.
- **Q2 (B-164)**: Order-of-events: if `onReplaced` arrives *after* `onUpdated` for the new tabId, does the existing `reevaluateTab` 100ms debounce provide enough cover, or do we need an explicit remap-in-flight Promise gating the debounce flush?
- **Q3 (B-164)**: Adding `"idle"` to `manifest.json` permissions — does C-6 minimization need a different approach (e.g., `chrome.runtime.onConnect` keep-alive ports instead)? `"idle"` is low-risk but it is a new permission.
- **Q4 (B-163, product decision)**: TTL on drift-record-as-fallback-key — introduce a fallback-only TTL (e.g., 7 days) or accept no-TTL hijack risk?
- **Q5 (B-163)**: Does Phase-3 also need to skip `inheritedTabs` (B-125 §59.3 / §65.5 precedent already applied to Phase-2)? Likely yes — write the same guard into Phase-3 for parity.
- **Q6 (shared)**: Should the `claimsMirror` remap (B-164) and the new Phase-3 (B-163) both bump a "claim generation counter" per C-14, so consumers can detect mid-sweep reads? B-148 §63.8.2 established the precedent.
- **Q7 (shared, docs)**: B-149 has no `docs/design/` chapter — should B-164 R6 back-fill a brief B-149 chapter so both new chapters can cite §X verbatim instead of citing BACKLOG row + RELEASES line? Recommend yes (1-hour effort, closes a known documentation gap).

---

## R1 LOCKED — B-163 acceptance criteria (2026-05-21)

**Tier**: Full (M). **Approach**: R0-LOCKED option (a) — defer §53 paired-clear + Phase-3 drift-URL fallback + Phase-4 conditional drift drop in `reconcileClaims`.

**Scope**: After an MV3 SW idle shutdown, `reconcileClaims` currently evicts items whose tabs drifted to a new URL (Phase-1 drops them; Phase-2 misses because `item.url` no longer matches the live tab's URL). B-163 inserts a Phase-3 that reads drift records (`getDriftRecords`) and attempts a second match on `driftedToUrl`, and a Phase-4 that calls `clearDrift` only for items that fail both phases. User-visible result: a drifted-but-live claimed tab survives cold-start reconcile instead of silently becoming unclaimed.

**DoR Gate 7 — destructive-action confirmation**: N/A — reconciliation algorithm change inside `reconcileClaims` (`background/tabs/tab-claims.js:121-226`). No user-initiated action; no destructive write.
**Selector audit**: N/A — no DOM rehome.
**Source-citation**: all code claims below cite `file:line`. One product-owner decision deferred at AC7.

### AC1 — Cold-start drift re-association via driftedToUrl (happy path)
Precondition: item X saved; tab drifts from `item.url` to `driftedToUrl`; `detectDriftForTab` writes drift record (`background/tabs/drift.js:54`); SW idles + cold-starts. Phase-1 (`tab-claims.js:152-161`) evicts; Phase-2 (`tab-claims.js:163-212`) misses on `item.url`. **Phase-3 (new)**: for each item still unbound after Phase-2, read drift record from `getDriftRecords()` (`drift.js:102-104`), normalize `driftedToUrl` via `safeNormalizeForMatch`, look up in same `urlToTabs` map, pop first unclaimed tab, write `reconciled[itemId] = tabId`. **PASS**: `claimsMirror[X.id] === tabId` after `writeClaims()` (`tab-claims.js:215`); item treated as open in `buildOpenTabs`. **FAIL**: item absent from `claimsMirror` despite live tab at `driftedToUrl`.

### AC2 — Primary item.url still wins over drift URL when both match
Precondition: item X has live tabs at BOTH `item.url` AND `driftedToUrl`. Phase-2 binds primary tab; Phase-3 only runs for items still unbound. **PASS**: bookmark binds to `item.url` tab, not `driftedToUrl` tab. **FAIL**: bookmark binds to drift URL while primary URL tab remains unclaimed.

### AC3 — One-tab-per-drift-record cap (drift hijack mitigation)
Precondition: two items X + Y both have drift records pointing at same `driftedToUrl`; only one live tab post-restart. Phase-3 iterates `evictedItemIds` by sortOrder; first qualifier pops the tabId via `available.shift()` + `claimedTabIds.add(tabId)` (same as Phase-2 `tab-claims.js:204-209`); second iteration finds empty list. **PASS**: exactly one of X/Y binds. **FAIL**: both bind same tabId OR neither binds.

### AC4 — Drift dropped only when both URLs fail (§10.7 invariant preserved)
Scenario A: Phase-3 binds X → §53 `clearDrift` block at `tab-claims.js:223-225` DEFERRED (no unconditional run for all evicted); Phase-4 runs only for items still unbound after Phase-3. Item X NOT in Phase-4 list. Drift record cleared naturally on next `detectDriftForTab` (URLs match post-reconcile, `drift.js:56-58`). Scenario B: Phase-3 finds no live tab → X added to Phase-4 list → `clearDrift(X.id)` called (`drift.js:86-96`). **PASS (A)**: drift partition has no stale record for X after next drift-detection; `claimsMirror[X.id]` set. **PASS (B)**: drift partition has no record for X post-reconcile; `claimsMirror[X.id]` absent. **FAIL**: drift persists for an item with no live tab (orphan leak) OR drift dropped prematurely for an item with live tab at `driftedToUrl` (data loss before re-bind).

### AC5 — Inherited-tab skip in Phase-3 (parity with Phase-2)
Precondition: tab T is in `inheritedTabs` Set (populated by `preMarkInheritedFromFloatingGroups` per B-125 §59.3 / §65.5). T's URL matches a drift record's `driftedToUrl`. Phase-3 applies same inherited-tab guard as Phase-2 at `tab-claims.js:200-203` (`while` loop pattern at `:198-206`): inherited candidates are shifted off without binding. **PASS**: no `claimsMirror` entry binds drifted item to inherited tabId; inherited tab's floating-group association undisturbed. **FAIL**: inherited tab T over-bound to drifted saved item.

### AC6 — No regression on B-149 Phase-1 survival contract
Precondition: stored claim `(itemId, tabId)` where tab URL drifted away from `item.url` but tab exists + item exists. B-149 contract: `tabEntry && item` is the full Phase-1 predicate at `tab-claims.js:155`. B-163 adds Phase-3/4 AFTER Phase-1/2; Phase-1 logic at `:152-161` UNCHANGED. **PASS**: existing B-149 regression tests continue passing without modification. **FAIL**: any B-149 test regresses OR Phase-1 re-introduces URL-match as survival predicate.

### AC7 — TTL on drift records used as Phase-3 fallback keys (PRODUCT-OWNER R2 DECISION REQUIRED)
Risk: drift record from months ago could match freshly-opened unrelated tab at same URL → wrong association. AC2 + AC3 reduce but don't eliminate. Two valid designs:
- **(i) No TTL**: Phase-3 evaluates all drift records regardless of age. Accept residual hijack risk; rely on AC2 + AC3 mitigations. Simpler implementation.
- **(ii) TTL = N days** (suggested 7): Phase-3 skips records where `Date.now() - drift.detectedAt > N * 86_400_000`. Skipped records still cleared by Phase-4 as if no match.

**Default pending decision: NO TTL (option i)**. R2 cannot start until product-owner confirms (i) or selects (ii) with explicit N.

**AC7 RESOLVED 2026-05-21 — product-owner selected option (i) NO TTL.** Rationale: rely on AC2 (primary URL wins) + AC3 (one-tab-per-drift-record cap) as sufficient hijack mitigations; simpler implementation; lower regression surface. R2 may proceed under option (i) — no date-comparison logic in Phase-3.

### Out of scope (B-163)
- §10.7 invariant (upheld; only `clearDrift` timing within `reconcileClaims` shifts)
- B-149 Phase-1 contract (Phase-1 unchanged)
- B-164 sleep/wake desync (sibling, chapter §69)
- Re-introducing URL-match as Phase-1 survival predicate (B-149 prohibited)
- `detectDriftForTab` runtime logic (unchanged)
- Drift record schema (no new fields, no version bump)
- C-14 generation-counter discipline (open Q6 — resolved at R2)

---

## R2 — B-166 (COMPLETE — 2026-05-21)

**R2 PICK**: option (a) — UI-side `replaceFloatingId: string` optional payload field on `MSG_PROMOTE_TAB`. Justified on minimality + explicit intent at dispatch surface + backward-compat via optional-field semantics + matches B-148's "smallest fix per write-site" precedent.

**Chapter**: `docs/design/71-b-166-promote-in-place.md` (~725 lines, 11 sections). TOC extended at `docs/SOLUTION_DESIGN.md:90`.

**Fix-scope test-assertion enumeration (CLAUDE.md mandatory)**: 1 test file requires update (`tests/b124-floating-visual.test.js:250` — 1-line regex extension to allow `replaceFloatingId?` in payload pin). 6 other related test files pass unchanged (B-124 chapter coverage uses `MSG_PROMOTE_TAB` as constant import, coarse regex without payload pin, or surface-mocked dispatcher captures). 1 new test file (`tests/b166-promote-in-place.test.js`, ~10 cases) covers AC1–AC6 + C-7 validator paths.

**Bonus finding from R2 research**: `claimTabForItem` does NOT prune the `tj:floatingGroups` record after MSG_PROMOTE_TAB succeeds today. Orphan persists until `chrome.tabs.onRemoved` (`tab-events.js:328`) OR cold-start reassociation. `buildFloatingMembers` filters by `claimedTabIds` so runtime UI is correct, but storage transient-orphans for the window. B-166's design prunes the floating record in the same `createItem` writeTransaction — closing this window incidentally. Documented in §71.3.2 / §71.6.6.

**R3 hand-off**: 3-partition atomic-swap inside `createItem`'s writeTransaction (PARTITION_GROUPS splice-replace + PARTITION_ITEMS append unchanged + PARTITION_FLOATING_GROUPS prune). Test-assertion enumeration is 100% complete. No open product-owner decisions. R3 can start whenever scrum-master authorizes.

---

## R5 — B-166 UAT script (ready for product-owner execution)

### Setup

1. **Build under test**: HEAD = `2d578a4` ("docs: SPRINT.md — B-163 R2 status update") on branch `feature/sprint-45-claim-desync`. The B-166 R4-fix-round + R5 T13 are at HEAD's preceding commits (`d13c103` / `3bb0dd9`).
2. Open `edge://extensions`, locate the Tab Junkie card, click the reload (↻) button. Confirm version reads **1.39.0** — B-166 ships in v1.40.0 at sprint-close release; the in-tree manifest is bumped by `[release-manager]` then.
3. Open the side panel; confirm at least one group exists with both saved bookmarks AND floating tabs interleaved. If not, create the §71.1 canonical fixture:
   - Create a group `UAT-Interleave`.
   - Save two bookmarks **A** and **B** into it.
   - Open two new tabs (call them **F1** and **F2**) and drag them into the group via the sidepanel drag-zone so the group's `renderOrder` becomes `[item:A, floating:F1, item:B, floating:F2]` (visible row order: A, F1, B, F2).
4. *(Optional, for storage-inspection cases)*: open SW console via `edge://extensions` → Tab Junkie card → "Inspect views: service worker".

---

### UAT-1 — AC1 happy path (in-place position preservation)

- **Preconditions**: `UAT-Interleave` group from Setup step 3 (visible row order A, F1, B, F2).
- **Action**: Hover over the F1 row in the sidepanel; click the `+` "Save as bookmark" CTA.
- **Expected**:
  - F1 row visually transforms into a saved-bookmark row AT THE SAME POSITION (index 1).
  - Post-render row order: `[A, F1-as-saved-bookmark, B, F2]` — NOT `[A, B, F2, F1-as-saved-bookmark]`.
  - The dotted-bar floating-state indicator on the F1 row disappears (it's now a saved bookmark).
  - The `+` CTA disappears from the row.
  - No toast appears (silent success).
- **Storage check (optional)**: in SW console run
  ```js
  chrome.storage.local.get('tj:groups').then(r => console.table(r['tj:groups'].find(g => g.name === 'UAT-Interleave').renderOrder))
  ```
  Verify the array reads `['item:<A>', 'item:<NEW>', 'item:<B>', 'floating:<F2-floatingTabId>']`.
- **Result**: __

### UAT-2 — §71.3.2 bonus prune (floating record pruned atomically)

- **Preconditions**: complete UAT-1 first (F1 was just promoted).
- **Action**: In SW console run
  ```js
  chrome.storage.local.get('tj:floatingGroups').then(r => console.table(r['tj:floatingGroups']))
  ```
- **Expected**: the record for F1 (the one whose `liveTabId` matched the F1 tab id) is GONE from `tj:floatingGroups`. Only the F2 record remains (plus any unrelated floating records across other groups).
- **Result**: __

### UAT-3 — §71.1 canonical 4-slot sibling preservation

- **Preconditions**: **fresh** `UAT-Interleave` seed (re-do Setup step 3 if you used it for UAT-1).
- **Action**: Click `+` on F1 ONLY.
- **Expected**:
  - Row order: `[A, F1-as-saved-bookmark, B, F2]` — F2 still visible at index 3 as a floating row with dotted-bar indicator and its own `+` CTA still present.
  - F2's row state is COMPLETELY UNTOUCHED (the sidebar tab strip still owns F2 as an open tab; no claim mirror entry for F2; clicking F2's `+` should still work and produce the AC1 swap behavior on F2).
- **Result**: __

### UAT-4 — AC1 persistence across SW restart

- **Preconditions**: complete UAT-1 (the swap happened).
- **Action**: In `edge://extensions`, toggle the Tab Junkie card OFF then ON.
- **Expected**:
  - After reload, the sidebar still shows `[A, F1-as-saved-bookmark, B, F2]` in the same order.
  - The new saved bookmark created from F1 still claims its live tab (no duplicate row appears in the Open Tabs section at the top of the sidebar).
- **Result**: __

### UAT-5 — AC2 pre-S38 legacy row → graceful append

- **Preconditions**: `UAT-Interleave` seed with F1 still floating (re-seed if needed).
- **Action**: In SW console, strip the `floatingTabId` field from F1's storage record:
  ```js
  chrome.storage.local.get('tj:floatingGroups').then(r => {
    const records = r['tj:floatingGroups'].map(rec => {
      if (rec.liveTabId === /*<F1-TAB-ID>*/) {  // replace with F1's actual tab id
        const { floatingTabId, ...rest } = rec;
        return rest;
      }
      return rec;
    });
    return chrome.storage.local.set({'tj:floatingGroups': records});
  });
  ```
  Then reload the sidebar (`Ctrl+R` in the sidepanel) so the row rebuilds without `dataset.floatingTabId`. Click `+` on F1's row.
- **Expected**:
  - The new bookmark appears at the BOTTOM of the group (graceful append fallback), not at F1's position.
  - The F1 floating row disappears (its tab is now claimed) and a new bookmark row appears at the group's end.
  - No error toast.
- **Result**: __

### UAT-6 — AC3 group-deleted-mid-flight → Ungrouped fallback

- **Preconditions**: fresh `UAT-Interleave` seed.
- **Action**:
  1. Hover the F1 row to surface its `+` CTA.
  2. Right-click the group header → Delete group → confirm the destructive-action dialog.
  3. Immediately (within ~5s) click the `+` button you were hovering. (If the row is gone, this UAT case validates the AC3 narrow race; skip if the row is no longer clickable.)
- **Expected**:
  - The promoted bookmark lands in **Ungrouped** (visible at the top of the sidepanel under the Ungrouped header).
  - In SW console:
    ```js
    chrome.storage.local.get('tj:floatingGroups').then(r => console.table(r['tj:floatingGroups']))
    ```
    The F1 record is gone (AC3 invariant: prune runs independent of groupId).
- **Result**: __ (mark **WARN** if the race window closed before you could click — that's expected on fast machines; AC3 covers the race, not the common case)

### UAT-7 — AC4 tab-closed-mid-flight → ERR_NOT_FOUND toast

- **Preconditions**: fresh `UAT-Interleave` seed.
- **Action**:
  1. Hover F1's row to surface its `+` CTA.
  2. In the tab strip, close F1's tab.
  3. Click the `+` CTA you were hovering.
- **Expected**:
  - Toast appears: **"Couldn't save tab — try again"**.
  - No new bookmark row appears in the sidebar.
  - Group's row order is unchanged (still `[A, F1, B, F2]` initially — F1 row will then vanish on the next render because `tab-events.js:328` prunes the floating record for closed tabs).
  - SW console:
    ```js
    chrome.storage.local.get('tj:groups').then(r => console.table(r['tj:groups'].find(g => g.name === 'UAT-Interleave').renderOrder))
    ```
    No `item:<NEW>` appears; the `floating:<F1-floatingTabId>` ref will be pruned by the onRemoved cleanup, not by B-166's swap mutator (verify no partial state).
- **Result**: __

### UAT-8 — AC5 right-click "Save to group" picker NOT regressed

- **Preconditions**: at least 2 groups exist (`UAT-Interleave` + a second group `Target`).
- **Action**: Right-click an Open-Tabs row at the top of the sidebar; pick "Save to group" → "Target".
- **Expected**:
  - The new bookmark lands at the BOTTOM of `Target` (cross-group save intentionally appends — no swap, no in-place placement).
  - No error toast.
- **Result**: __

### UAT-9 — AC5 newtab Open-Tabs `+` Save path (cross-surface parity)

- **Preconditions**: `UAT-Interleave` + at least one floating tab.
- **Action**: Open a new tab (newtab page). Find the floating tab in the floating section for `UAT-Interleave`; click its `+` Save CTA.
- **Expected (cross-surface parity — M-4)**:
  - The floating tab promotes IN-PLACE in the newtab page rendering (same renderOrder as the sidebar — newtab consumes the same `Group.renderOrder`).
  - Switch to the sidebar — verify the same in-place swap is visible there as well (proves cross-surface parity).
- **Result**: __

### UAT-10 — AC6 stale hint guard / M-1 defensive scope (optional — narrow race)

- **Preconditions**: `UAT-Interleave` with F1 floating; SW console open.
- **Action**: In SW console, paste this to send a malformed promote with a bogus `replaceFloatingId`:
  ```js
  chrome.runtime.sendMessage({
    type: 'tj/promoteTab',
    payload: { tabId: /*<F1-TAB-ID>*/, groupId: '/*<UAT-INTERLEAVE-GROUP-ID>*/',
               replaceFloatingId: 'BOGUS_DOES_NOT_EXIST_ULID' }
  }).then(r => console.log('result:', r));
  ```
- **Expected**:
  - Console logs `{ok: true, data: {…new item…}}`.
  - Group's renderOrder: the new item appended at END (append-fallback because the hint matched no slot).
  - F1's floating record SURVIVES in `tj:floatingGroups` (the M-1 defensive cross-group scope holds: the hint matched no F1 because the bogus ulid doesn't exist; the prune mutator no-ops).
  - F1 row still visible as a floating row in the group.
- **Result**: __

---

## R4 — Deduplicated review findings

_To be populated after R4 review round runs._
