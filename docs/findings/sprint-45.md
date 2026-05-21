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

## R4 — Deduplicated review findings

_To be populated after R4 review round runs._
