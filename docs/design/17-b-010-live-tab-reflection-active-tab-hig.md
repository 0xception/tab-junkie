## 17. B-010 — Live Tab Reflection & Active-Tab Highlight (R6 Close — What Shipped)

### 17.1 Summary

B-010 closed all gaps in the live-tab and active-tab indicator pipeline. The data infrastructure shipped in B-001c (LiveTabIndex, TabClaims, `buildLiveStates`) was verified correct and extended with: (1) a `windows.onFocusChanged` handler for multi-window active-tab tracking, (2) broadcast noise cleanup, (3) dynamic audible-indicator DOM creation/removal in the sidepanel, and (4) favicon rendering integrated from B-004.

### 17.2 What Was Built

#### Background layer

**`background/tabs/live-tab-index.js`** — In-memory `Map<tabId, LiveTabEntry>` unchanged in shape from B-001c. `LiveTabEntry = { url: string, windowId: number, active: boolean, audible: boolean, index: number, favIconUrl: string }`. Populated at SW cold start via `buildLiveTabIndex()` calling `chrome.tabs.query({})`. Mutated only through `updateTabEntry(tabId, patch)`, `removeTabEntry(tabId)`, and `removeTabsByWindow(windowId)`. `getLiveTabIndex()` returns the live Map reference (read-only contract).

**`background/tabs/tab-events.js`** — Registers 5 event listeners inside `registerTabEventListeners(readyPromise)`:

| Listener | Behavior |
|----------|----------|
| `tabs.onUpdated` | Updates LiveTabIndex synchronously with url/audible/favIconUrl/windowId/active/index. Guards `tab/favicon-changed` broadcast to fire only when favIconUrl changes WITHOUT a simultaneous URL change (prevents double-patch on navigation). **B-012:** Guards `tab/audible-changed` broadcast to fire only when `'audible' in changeInfo && !('url' in changeInfo)` — same pattern as favicon, prevents double-broadcast on navigation. Debounces URL-change re-evaluation at 100ms per tab via `reevalTimers` Map. Cancels pending timers on tab removal. |
| `tabs.onActivated` | Deactivates previous active tab in the same window via `updateTabEntry(id, { active: false })` (never direct Map mutation). Activates new tab. Broadcasts `tab/activated`. |
| `tabs.onRemoved` | Cancels reevalTimers for the tab, then `removeTabEntry` + `releaseClaimByTab`. **B-015:** `clearDrift(releasedItemId)` is now `await`ed after `releaseClaimByTab` resolves (in the async `.then` callback), ensuring drift records are cleaned up on tab close. Broadcasts `tab/removed` after claim release + drift clear. |
| `windows.onFocusChanged` | **NEW in B-010.** Fills the gap where `tabs.onActivated` does not fire on window focus switch. On `WINDOW_ID_NONE`: deactivates ALL tabs (user left the browser), broadcasts `window/blurred`. On a real windowId: deactivates tabs in non-focused windows, queries the active tab in the focused window via `chrome.tabs.query({ windowId, active: true })`, activates it AFTER the query resolves, broadcasts `window/focused`. |
| `windows.onRemoved` | Bulk timer cleanup + `removeTabsByWindow` + batch `releaseClaimByTab`. **B-015:** Each released claim now also `await`s `clearDrift(releasedItemId)` inside a `Promise.allSettled` over all removed tabs, ensuring bulk drift cleanup on window close. Early-returns if `!isClaimsReady()` (reconcileClaims will handle on next run). Broadcasts `tab/removed`. |

**`background/tabs/tab-claims.js`** — `buildLiveStates(items)` now includes `favIconUrl: tabEntry.favIconUrl || null` in each live-state entry (integrated from B-004). Shape: `Record<string, { live: boolean, active: boolean, audible: boolean, favIconUrl: string|null }>`.

**`background/broadcast.js`** — OQ-2 fix: removed the `console.warn('[tab-junkie:broadcast] firing:', scope, trigger)` debug line. Only the error-path `console.warn` on `sendMessage` failure remains.

#### Sidepanel layer

**`sidepanel/sidepanel.js`** — four key functions:

| Function | Purpose |
|----------|---------|
| `isSafeFaviconUrl(url)` | Allowlist helper accepting only `https://`, `http://`, `data:image/` scheme prefixes. Guards all favicon `<img>` creation against unsafe protocols (e.g., `chrome://`, `javascript:`, `file://`). |
| `buildItemRow(item, liveStates, driftRecords)` | Sets `data-item-id`, `data-live`, `data-active`, `data-audible`, `data-drifted` on the row element. Renders `<img class="item-favicon">` (with `isSafeFaviconUrl` guard + `onerror` fallback) or `<div class="item-avatar">` (first-letter + djb2 hash color). Static `aria-label` on edit/delete buttons. Indicator icons (audible, drifted) created only when state is truthy at render time. |
| `refetchAndPatchLiveState()` | Called on `MSG_STATE_CHANGED { scope: 'liveState' }`. Patches existing rows in-place (no full re-render). Error-safe: clears all stale indicators on `MSG_LIST_ITEMS` failure via atomic `indicators.replaceChildren()` + `indicators.remove()` (B-011). Guards against detached-node race with `itemListEl.contains(row)`. Patches favicon/avatar transitions (img to avatar, avatar to img, src update) using `getAttribute('src')` comparison to avoid IDL-resolved URL false positives (H-2 fix). Calls `_ensureIndicators()` for audible and drifted DOM transitions. |
| `_ensureIndicators(row, live, isDrifted)` | **(B-011 extended from audible-only.)** Creates/removes `.item-audible-icon` and `.item-drifted-icon` spans when state transitions occur post-render. `isConnected` guard prevents DOM ops on detached nodes. Creates/removes the `.item-indicators` container as needed. Inserts before `.item-actions` to maintain correct DOM order. SVG markup is hardcoded (no user data — XSS-safe). See section 10.7 for full specification. |

### 17.3 Deviations from R2 Plan (section 16)

| # | R2 Plan | What Shipped | Reason |
|---|---------|-------------|--------|
| D-1 | `WINDOW_ID_NONE` guard was "do NOT deactivate everything" (keep last-focused window highlighted) | Shipped: deactivates ALL tabs on `WINDOW_ID_NONE` and broadcasts `window/blurred` | More accurate representation — when the browser loses focus, no tab is truly "active" from the user's perspective. The next `onFocusChanged` with a real windowId re-activates correctly. |
| D-2 | R2 pseudocode used direct `entry.active = false` mutation in the onFocusChanged loop | Shipped: all mutations go through `updateTabEntry(id, { active: false })` | Consistent with the mutation contract established in B-001c; avoids bypassing any future instrumentation on `updateTabEntry`. |
| D-3 | R2 did not mention `_ensureIndicators` handling drifted icons | **RESOLVED in B-011 (Sprint 9):** `_ensureIndicators(row, live, isDrifted)` now handles both audible and drifted icon lifecycle. Originally deferred because drifted transitions were rare; resolved to close the indicator DOM gap completely. See section 10.7 "Sidepanel drift icon lifecycle". |
| D-4 | `buildLiveStates` return shape was `{ live, active, audible }` | Shipped: `{ live, active, audible, favIconUrl }` | B-004 integration added `favIconUrl` to the live-state contract. This was approved during B-004 R2; not a deviation from B-010's scope but worth documenting since it changed the shape referenced in section 16.2. |

### 17.4 Message Types

No new message types introduced. B-010 reuses the existing contract:

- **Broadcast**: `MSG_STATE_CHANGED { scope: 'liveState', trigger: '<event>' }` — triggers include `tab/updated`, `tab/activated`, `tab/removed`, `tab/favicon-changed`, `window/focused`, `window/blurred`.
- **Request/response**: `MSG_LIST_ITEMS` response includes `{ items, liveStates, driftRecords }` where `liveStates` shape is now `Record<string, { live: boolean, active: boolean, audible: boolean, favIconUrl: string|null }>`.

New trigger values added by B-010: `window/focused`, `window/blurred`. These are string values in the existing `trigger` field — no contract change.

### 17.5 Manifest Permissions

`tabs` and `windows` events were already available. `chrome.windows.onFocusChanged` and `chrome.windows.onRemoved` do not require any additional permission. No changes to `manifest.json`.

### 17.6 Storage Schema

No changes. LiveTabIndex is purely in-memory (lost on SW termination, rebuilt on cold start). TabClaims remain in `chrome.storage.session` under `tj:tabClaims` with unchanged shape `Record<string, number>`. The only addition to `buildLiveStates` output (`favIconUrl`) is an in-flight response field, not persisted.

### 17.7 Rollback Plan

No storage schema changes. No new permissions. No durable state changes. LiveTabIndex is ephemeral (in-memory). Rollback = `git revert` the B-010 commits. No data migration needed.

### 17.8 Known Deferred Items (from R4 MEDIUM findings)

| # | Finding | Severity | Status | Notes |
|---|---------|----------|--------|-------|
| 1 | Broadcast amplification — `broadcast()` sends to ALL open contexts (sidepanel, newtab, popup) via `chrome.runtime.sendMessage`; each context refetches `MSG_LIST_ITEMS` independently | MEDIUM | Deferred | Acceptable at current scale (<5 open surfaces). If Tab Junkie adds many open contexts, consider targeted messaging or a shared observable. |
| 2 | TOCTOU in rapid `onFocusChanged` — two rapid window-focus events could interleave: event 1 deactivates synchronously, then event 2 deactivates synchronously, then event 1's async `tabs.query` resolves and activates a tab in the wrong window | MEDIUM | Deferred | Extremely rare in practice (requires sub-millisecond focus switching). The next legitimate focus event self-corrects. No user-visible impact observed in UAT. |
| 3 | No `MSG_GET_LIVE_STATES` optimization — sidepanel refetches the full item list via `MSG_LIST_ITEMS` on every live-state broadcast, even though only `liveStates` changed | MEDIUM | Deferred | Performance is within budget (items list is typically <500 items, serialization is fast). A dedicated lightweight message could reduce payload but adds contract surface area. Tracked for future optimization. |

### 17.9 Test Coverage

| Suite | File | Tests | Coverage |
|-------|------|-------|----------|
| B-004 favicon | `tests/b004-favicon.test.js` | 19 | favIconUrl in liveStates, isSafeFaviconUrl allowlist (https/http/data:image allowed; chrome://javascript://file:// blocked), broadcast guard for favicon-only vs URL+favicon changes |
| B-010 live state | `tests/b010-live-state.test.js` | 18 | LiveTabIndex CRUD (build/update/remove/removeByWindow), all 5 event handlers (onUpdated, onActivated, onRemoved, onFocusChanged, windows.onRemoved), buildLiveStates output shape, claimsReady gate |
| Chrome mock additions | `tests/chrome-mock.js` | — | Added `windows.WINDOW_ID_NONE` constant, `windows.onFocusChanged` mock, `tabs.query` filter support for `{ windowId, active }` |

### 17.10 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS — No change | No persisted data shapes modified. |
| C-2 | Message contracts typed | PASS — No change | New trigger values (`window/focused`, `window/blurred`) are strings in existing `trigger` field. `favIconUrl` added to `buildLiveStates` output (B-004 integration, not a B-010 contract change). |
| C-3 | Service worker cold-start safe | PASS | All 5 listeners registered synchronously in `registerTabEventListeners()`. `onFocusChanged` handler uses only in-memory LiveTabIndex + async `tabs.query` + `requireClaimsReady` broadcast gate. No `readyPromise` await needed. |
| C-4 | ID stability | N/A | No changes to item identity or matching logic. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

---

