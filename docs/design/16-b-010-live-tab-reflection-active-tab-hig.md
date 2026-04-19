## 16. B-010 — Live Tab Reflection & Active-Tab Highlight (R2 Design)

### 16.1 Overview

B-010 verifies and closes gaps in the end-to-end live-tab and active-tab indicator pipeline. The data infrastructure shipped in B-001c (LiveTabIndex, TabClaims, `buildLiveStates`, `refetchAndPatchLiveState`). B-010 is NOT a rebuild; it is a verification + gap-close sprint item.

### 16.2 R1 Open Question Resolutions

**OQ-1: `windows.onFocusChanged` gap — CONFIRMED GAP, FIX REQUIRED.**

`chrome.tabs.onActivated` fires only when the active tab *within a window* changes. Switching focus between two windows (e.g., Alt-Tab) does NOT fire `tabs.onActivated` if the active tab in the target window was already its active tab before the switch. This means:

- Window A has tab 1 active. Window B has tab 5 active.
- User clicks on Window B. `tabs.onActivated` does NOT fire because tab 5 was already the active tab in Window B.
- Result: LiveTabIndex still shows tab 1 as `active: true` in Window A AND tab 5 as `active: true` in Window B. Neither is wrong per-window, but AC6 requires that only the *focused* window's active tab shows the active highlight.

**Fix**: Add a `chrome.windows.onFocusChanged` listener in `tab-events.js`. When a window gains focus (ignoring `chrome.windows.WINDOW_ID_NONE`), query the active tab in the focused window via `chrome.tabs.query({ active: true, windowId })`, then update the LiveTabIndex to set `active: false` for all tabs NOT in the focused window and `active: true` for the focused window's active tab. Broadcast `SCOPE.LIVE_STATE` with trigger `window/focused`.

**OQ-2: `console.warn` leakage in `broadcast.js` — CONFIRMED, FIX REQUIRED.**

Line 13 of `background/broadcast.js` has `console.warn('[tab-junkie:broadcast] firing:', scope, trigger)`. This fires on every tab event (activated, updated, removed) and violates CLAUDE.md's "No `console.log` debug noise" rule. Must be removed. The existing `console.warn` on line 15 (sendMessage failure) is legitimate error handling and stays.

**OQ-3: `tabs.onUpdated` debounce latency — CONFIRMED WITHIN BUDGET.**

The 100ms per-tab debounce in `tab-events.js` (line 65) only gates *claim re-evaluation* (which triggers `broadcast(SCOPE.LIVE_STATE)`). The LiveTabIndex itself is updated synchronously before the debounce (lines 44-57). Since `refetchAndPatchLiveState` in the sidepanel calls `MSG_LIST_ITEMS` which reads from the in-memory index synchronously, the actual live-state read is always current. The debounce only delays the *notification* to the UI, not the data. Worst case: 100ms debounce + ~50ms message round-trip + ~10ms DOM patch = ~160ms, well within the 500ms budget. No change needed.

**OQ-4: `requireClaimsReady` guard on cold open — CONFIRMED SAFE, NO GAP.**

Flow analysis:
1. SW cold start: `registerTabEventListeners(readyPromise)` registers listeners synchronously.
2. `initializeLiveState(readyPromise)` runs concurrently: builds LiveTabIndex, awaits `readyPromise`, then calls `reconcileClaims(items)` which sets `claimsReady = true`.
3. Any tab events firing before `reconcileClaims` completes are gated by `{ requireClaimsReady: true }` — broadcasts are suppressed.
4. Sidepanel's `DOMContentLoaded` handler calls `sendMessage(MSG_LIST_ITEMS)`, which in `storage-handlers.js` awaits `readyPromise`. By the time `readyPromise` resolves AND the dispatch runs `buildLiveStates(items)`, `initializeLiveState` has already run `reconcileClaims` (both await the same `readyPromise` and `initializeLiveState` starts its work at the same time). Edge case: if `buildLiveTabIndex()` takes longer than `readyPromise`, `reconcileClaims` could still be pending when `MSG_LIST_ITEMS` reads. However, `buildLiveStates` checks `if (!claimsReady)` and returns all-false defaults (line 208 of `tab-claims.js`). The first broadcast after `claimsReady` flips to true will trigger `refetchAndPatchLiveState` which corrects the UI. Net effect: at most one frame of "no live indicators" on cold open, then correct state within ~200ms. This is acceptable.

**OQ-5: `tabs.onUpdated` with empty URL in transit — CONFIRMED SAFE, NO GAP.**

The guard on line 60 of `tab-events.js`: `typeof changeInfo.url === 'string' && changeInfo.url !== ''` correctly filters out:
- `changeInfo.url === undefined` (non-URL updates like `audible` changes)
- `changeInfo.url === ''` (blank URL during navigation initiation)

During redirect chains, each intermediate URL that is non-empty triggers a debounced re-evaluation. The 100ms debounce collapses rapid redirect hops. If an intermediate URL briefly unsets a claim (URL doesn't match any item), the final URL re-evaluation corrects it. The temporary "un-claimed" state lasts at most one debounce cycle (~100ms) and is not user-visible because the broadcast is also debounced.

### 16.3 Code Changes Required

| # | File | Change | Reason |
|---|------|--------|--------|
| C-1 | `background/tabs/tab-events.js` | Add `chrome.windows.onFocusChanged` listener inside `registerTabEventListeners()` | OQ-1: multi-window active-tab tracking requires window focus events |
| C-2 | `background/broadcast.js` | Remove `console.warn` on line 13 | OQ-2: debug noise in production code |
| C-3 | `sidepanel/sidepanel.js` | Patch `refetchAndPatchLiveState()` to reconcile audible/drifted indicator DOM elements, not just data attributes | Currently only updates `dataset.*` attributes but audible/drifted indicator `<span>` elements are only created at full-render time; if a tab becomes audible after initial render, the icon element doesn't exist to become visible. Active/live work because they use CSS attribute selectors on the row itself. |
| C-4 | `sidepanel/sidepanel.css` | No changes needed | CSS already has `[data-live]`, `[data-active]`, `[data-audible]`, `[data-drifted]` selectors with correct theme variables for light/dark |

**No changes needed:**
- `manifest.json` — no new permissions required (see 16.5)
- `background/messages/storage-handlers.js` — `MSG_LIST_ITEMS` response shape (`{ items, liveStates, driftRecords }`) is already correct; `buildLiveStates` already returns `{ live, active, audible }` per item
- `shared/messages.js` — no new message types needed; `MSG_STATE_CHANGED` with `scope: 'liveState'` is sufficient

### 16.4 `windows.onFocusChanged` Listener Design

```js
// Inside registerTabEventListeners(readyPromise):
chrome.windows.onFocusChanged.addListener((windowId) => {
  // Ignore WINDOW_ID_NONE (all windows lost focus, e.g. user switched to another app)
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;

  // Deactivate all tabs in other windows, activate the focused window's active tab
  const index = getLiveTabIndex();
  for (const [id, entry] of index) {
    if (entry.windowId !== windowId) {
      entry.active = false;
    }
  }

  // Query the active tab in the focused window to ensure correctness
  chrome.tabs.query({ active: true, windowId }).then((tabs) => {
    if (tabs.length > 0) {
      updateTabEntry(tabs[0].id, { active: true, windowId });
    }
    broadcast(SCOPE.LIVE_STATE, 'window/focused', { requireClaimsReady: true });
  }).catch((err) => {
    console.warn('[tab-junkie] window focus query failed', err);
  });
});
```

**Key design decisions:**
- **Deactivate-then-query pattern**: First deactivate all tabs in non-focused windows (synchronous, in-memory), then query the actual active tab in the focused window (async) to set it. This avoids a race where two tabs are momentarily both active.
- **`WINDOW_ID_NONE` guard**: When the user switches to a non-browser app, all windows lose focus. We do NOT deactivate everything — the last-focused window's active tab remains highlighted. This is correct UX: when the user returns to the browser, the highlight is already there.
- **No `readyPromise` await**: This listener only touches the in-memory LiveTabIndex and issues a broadcast. No storage read needed. The `requireClaimsReady` gate on broadcast is sufficient.

### 16.5 Permissions Review

Current `manifest.json` permissions: `["tabs", "tabGroups", "storage", "sidePanel", "search"]`

| Permission | Required for B-010? | Present? | Notes |
|-----------|-------------------|----------|-------|
| `tabs` | Yes — `tab.url`, `tab.active`, `chrome.tabs.query`, `tabs.onActivated`, `tabs.onUpdated`, `tabs.onRemoved` | Yes | Already present |
| (none for windows) | `chrome.windows.onFocusChanged` and `chrome.windows.onRemoved` do NOT require any permission | N/A | These are available to all extensions by default; only `windows.getAll`, `windows.get`, `windows.create`, `windows.update` need the implicit access that `tabs` provides |
| `storage` | Yes — `chrome.storage.session` for TabClaims | Yes | Already present |

**No new permissions needed for B-010.**

### 16.6 Message Flow — End-to-End per AC

**AC1: Tab opens at saved URL -> live indicator appears**
```
chrome.tabs.onUpdated(tabId, {url: "..."}, tab)
  -> updateTabEntry(tabId, {url, windowId, active, index})     [sync, in-memory]
  -> debounce 100ms -> reevaluateTab(tabId, url, items)         [async, writes session storage]
  -> broadcast(SCOPE.LIVE_STATE, 'tab/updated')                 [fire-and-forget]
  -> sidepanel receives MSG_STATE_CHANGED {scope: 'liveState'}
  -> refetchAndPatchLiveState() -> MSG_LIST_ITEMS
  -> buildLiveStates(items) returns {itemId: {live: true, active: ?, audible: ?}}
  -> patches data-live="true" on matching .item-row
  -> CSS rule .item-row[data-live="true"] applies green left border
```

**AC2: Tab closes -> live indicator clears**
```
chrome.tabs.onRemoved(tabId)
  -> removeTabEntry(tabId)                                      [sync, in-memory]
  -> releaseClaimByTab(tabId)                                   [async, writes session storage]
  -> broadcast(SCOPE.LIVE_STATE, 'tab/removed')
  -> sidepanel patches data-live removed -> CSS reverts to no border
```

**AC3: Tab focused -> active highlight appears**
```
chrome.tabs.onActivated({tabId, windowId})
  -> deactivate previous active tab in same window              [sync, in-memory]
  -> updateTabEntry(tabId, {active: true, windowId})            [sync, in-memory]
  -> broadcast(SCOPE.LIVE_STATE, 'tab/activated')
  -> sidepanel patches data-active="true" on row
  -> CSS rule .item-row[data-active="true"] applies blue bg + blue left border
```

**AC6: Window focus switches -> active transfers (NEW with B-010 fix)**
```
chrome.windows.onFocusChanged(windowId)
  -> [guard: skip WINDOW_ID_NONE]
  -> deactivate all tabs in other windows                       [sync, in-memory]
  -> chrome.tabs.query({active: true, windowId})                [async]
  -> updateTabEntry(activeTab.id, {active: true})               [sync, in-memory]
  -> broadcast(SCOPE.LIVE_STATE, 'window/focused')
  -> sidepanel patches: old window's tab loses data-active, new window's tab gains data-active
  -> Only one item-row has data-active="true" at any time
```

### 16.7 `refetchAndPatchLiveState` Indicator DOM Gap — RESOLVED

~~Current `refetchAndPatchLiveState()` only toggles `dataset.*` attributes on existing `.item-row` elements. For `audible` and `drifted`, the CSS selectors target *child elements* that are only created during `buildItemRow()` when the state is truthy at render time.~~

**RESOLVED (B-010 for audible, B-011 for drifted):** `_ensureIndicators(row, live, isDrifted)` now handles both audible and drifted icon DOM lifecycle. Called from `refetchAndPatchLiveState` after updating data attributes. Creates indicator icons on false-to-true transitions and removes them on true-to-false transitions, including cleanup of the empty `.item-indicators` container. See section 10.7 "Sidepanel drift icon lifecycle" for full specification.

### 16.8 R2 Correctness Checklist

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS — No change | B-010 does not modify any persisted data shapes. LiveTabIndex is in-memory only. TabClaims shape (`Record<string, number>`) is unchanged. |
| C-2 | Message contracts typed | PASS — No change | `MSG_STATE_CHANGED { scope: 'liveState', trigger: string }` is unchanged. `liveStates` shape in `MSG_LIST_ITEMS` response (`Record<string, {live, active, audible}>`) is unchanged. New trigger value `'window/focused'` is a string — no contract change. |
| C-3 | Service worker cold-start safe | PASS | `windows.onFocusChanged` listener is registered synchronously in `registerTabEventListeners()`. It only reads/writes in-memory LiveTabIndex and broadcasts with `requireClaimsReady` gate. `initializeLiveState` builds the index and reconciles claims before the gate opens. |
| C-4 | ID stability | N/A | B-010 does not change item identity or matching logic. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

### 16.9 Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| `windows.onFocusChanged` fires rapidly during window drag/resize | LOW | The listener only does in-memory map mutations (O(n) over open tabs) + one async `tabs.query`. No debounce needed — the operation is cheap and idempotent. |
| `tabs.query` fails in the `onFocusChanged` handler | LOW | Wrapped in `.catch()` with `console.warn`. LiveTabIndex may have stale active flags until next `tabs.onActivated` corrects it. |
| Indicator DOM manipulation in `refetchAndPatchLiveState` introduces XSS | MEDIUM | All indicator elements use `innerHTML` with hardcoded SVG literals (no user data). Same pattern as `buildItemRow`. [security-reviewer] should verify. |

### 16.10 Rollback Plan

No storage schema changes. No new permissions. Rollback = revert the commit. No data migration needed.

---

