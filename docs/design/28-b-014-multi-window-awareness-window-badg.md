## 28. B-014 — Multi-Window Awareness & Window Badge (R2 Design)

### 28.1 Overview

B-014 introduces session-scoped human-readable window ordinals (W1, W2, W3…) for the ephemeral `chrome.windows.Window.id` integers, a cross-window badge on every saved-item and open-tab row whose live tab is in a different window than the sidepanel's own window, and a window filter row that only appears when two or more browser windows are currently open. B-014 **absorbs** B-034 (window filter row — previously an icebox item). The ordinal map is purely in-memory; **no storage schema changes, no new `manifest.json` permissions, no migrations**. One new broadcast scope (`SCOPE.WINDOW_MAP`) is added. One `MSG_LIST_ITEMS` response field is added (`windowMap`). One `liveStates[itemId]` field is widened (`windowId`).

The feature rests on four existing primitives shipped in prior sprints:
- `LiveTabIndex` (B-010, B-055) — every tab entry already carries `windowId`.
- `getClaimsMirror()` (B-001c) — maps `itemId → tabId`, joined with `LiveTabIndex` to resolve a saved item's live `windowId`.
- Broadcast fan-out (B-050) — `SCOPE.LIVE_STATE`, `SCOPE.ITEMS`, `SCOPE.GROUPS`, `SCOPE.PREFERENCES`. B-014 adds `SCOPE.WINDOW_MAP`.
- Open Tabs section (B-055) — `buildOpenTabRow` already sets `row.dataset.windowId` and renders a raw `W${windowId}` badge via `_createWindowBadge`; B-014 replaces the raw integer with the ordinal lookup and extends the same badge to saved-item rows.

R2 locks every architectural decision before R3 so the [frontend-engineer] can build without re-opening shape debates. Out-of-scope exclusions (AC18) are reconfirmed in §28.11.

### 28.2 Window Ordinal Map — Module & Lifecycle

#### 28.2.1 New module: `background/tabs/window-ordinals.js`

**Decision: extract into a dedicated module rather than fold into `live-tab-index.js`.**

Rationale:
1. `live-tab-index.js` is keyed by `tabId` (per-tab entries). The ordinal map is keyed by `windowId` (per-window entries). Mixing two distinct key spaces in one module muddies the single-responsibility boundary that `live-tab-index.js` / `tab-claims.js` / `open-tabs.js` / `floating-groups.js` have maintained since B-001c.
2. The ordinal map has its own event surface (`chrome.windows.onCreated`, `chrome.windows.onRemoved`) that `live-tab-index.js` does not currently subscribe to. `tab-events.js` already owns `windows.onRemoved`; adding the ordinal bookkeeping as a thin set of exports keeps `tab-events.js` as the event-router and `window-ordinals.js` as the state-owner.
3. Testability: the ordinal allocator is a pure function of the event sequence, ideal for unit tests against the chrome-mock. Extracting it makes the tests single-purpose and short.
4. Symmetry with the §26.12.1 precedent (`background/tabs/open-tabs.js` was promoted from "optional" to a committed module for the same reasons).

Public API (proposed):
```js
// background/tabs/window-ordinals.js
export async function initWindowOrdinals();      // cold-start enumeration (§28.2.2)
export function registerWindow(windowId);         // onCreated path (§28.2.3)
export function deregisterWindow(windowId);       // onRemoved path (§28.2.4)
export function getWindowOrdinal(windowId);       // number | undefined
export function getWindowMap();                   // Record<string, number>  ({ "12345": 1, "12346": 2 })
export function getWindowOrdinalsSize();          // number (count of known windows)
export function __resetWindowOrdinals();          // test hatch
```

Internal state is a single `Map<number, number>` (rawWindowId → ordinal). Never persisted. Never written to `chrome.storage.*`.

#### 28.2.2 Cold-start enumeration (AC2)

On service-worker cold start, `initWindowOrdinals()` calls `chrome.windows.getAll({ populate: false })`, sorts the returned windows by `id` ascending, and assigns ordinals `1..N` in that order. This is called from the SW bootstrap sequence (alongside `buildLiveTabIndex()` and `reconcileClaims()`) **before** the `readyPromise` resolves.

**Monotonicity assumption:** Chromium assigns `windows.Window.id` as monotonically increasing per browser session. Older windows have smaller ids. The first-seen-order invariant (AC1) is therefore satisfied by sorting the cold-start enumeration by raw id. This is documented behaviour of Chromium's window management, consistent across Chrome, Edge, and Chromium derivatives. **Alternative considered and rejected:** sorting by the `chrome.windows.getAll()` return order alone — Chromium does not guarantee any particular order in the array, so relying on it is a latent bug.

**Fallback if the assumption ever breaks:** the function can be switched to use `chrome.windows.getLastFocused()` repeatedly in a fresh-enumeration pattern. This is called out as an architectural escape hatch only; we do not implement it in the first build.

#### 28.2.3 New window opens (AC1)

`chrome.windows.onCreated(callback)` in `tab-events.js` (new handler) calls `registerWindow(window.id)`, which sets `ordinalMap.set(windowId, maxExistingOrdinal + 1)`. `maxExistingOrdinal` is tracked in a module-scoped variable updated on every set/delete, so registration is O(1).

After the map is updated, `tab-events.js` fires `broadcast(SCOPE.WINDOW_MAP, 'window/created', { requireClaimsReady: true })` (§28.3).

#### 28.2.4 Window closes (AC3 — gap-preserving)

`chrome.windows.onRemoved(callback)` already exists in `tab-events.js` (handles tab cleanup). The handler is widened with one line: `deregisterWindow(windowId)` after `removeTabsByWindow(windowId)` runs, **before** the claim-release block. `deregisterWindow` calls `ordinalMap.delete(windowId)` and **does not renumber** any surviving ordinals. Gaps are preserved: if the map was `{12345:1, 12346:2, 12347:3}` and window `12346` closes, the result is `{12345:1, 12347:3}` — W2 is now a hole. Future windows get `maxExistingOrdinal + 1` (W4 in this example), not the reclaimed W2.

Per AC3, the hole is the documented, correct behaviour. Renumbering on close would be confusing: any sidepanel badge referencing "W3" would suddenly point at a different window without the user doing anything.

After `deregisterWindow`, `tab-events.js` fires `broadcast(SCOPE.WINDOW_MAP, 'window/removed')`. This broadcast is **not** gated on `requireClaimsReady` — window close during cold start is rare but legitimate; the sidepanel is already responsible for handling an empty or sparse map gracefully (§28.4).

#### 28.2.5 SW restart recovery

Ordinals are **session-only** and **not persisted**. On SW cold start after a suspend/resume cycle, `initWindowOrdinals()` re-enumerates from `chrome.windows.getAll()` and assigns fresh ordinals. Because the SW suspends only when no extension-triggered activity has occurred recently — not when windows close — the common case is that the same set of windows is still open, and the re-enumeration produces the same ordinal assignment (monotonic id ordering). The ordinals users see across a suspend/resume cycle are therefore stable in practice, though the architecture does not guarantee it across arbitrary scenarios.

**Edge case documented (AC1 implication):** if the user closes every browser window and then opens a new one, the SW suspends (no pages or tabs), and on the next cold start the reopened window is assigned W1 from a fresh enumeration. It is **not** assigned the "next" ordinal that would have been allocated had the SW stayed alive. This is consistent with AC2's "first-seen order" semantics and matches user expectation ("I closed everything, reopened a single window — it should be W1"). Architectural choice: session-local ordinals are the contract; cross-suspend continuity is not promised.

#### 28.2.6 Integration with `chrome.windows.WINDOW_ID_NONE`

`chrome.windows.onFocusChanged` can fire with `WINDOW_ID_NONE` when the user alt-tabs away. `window-ordinals.js` **never** registers or deregisters on focus events — only on `onCreated` / `onRemoved`. `WINDOW_ID_NONE` is filtered out defensively in `registerWindow`/`deregisterWindow` (early return if `windowId < 0`) as a belt-and-braces check.

### 28.3 Message Contract & Broadcast Architecture

#### 28.3.1 Decision: extend `MSG_LIST_ITEMS` response + new `SCOPE.WINDOW_MAP` broadcast

**Extend** the existing `MSG_LIST_ITEMS` response with a `windowMap` field, **and** introduce a new `SCOPE.WINDOW_MAP` broadcast scope. Both are needed; neither is sufficient alone.

- The `MSG_LIST_ITEMS` field satisfies AC14's "every list response carries the current map" requirement and delivers the map on sidepanel cold-open in a single round trip, matching the precedent set by `openTabs` (§26.2).
- The broadcast scope satisfies AC13/AC17: the sidepanel updates the filter row and badges on `onCreated`/`onRemoved` **without** triggering a full `renderAll()`. Without a dedicated scope, the sidepanel would have to debounce on `SCOPE.LIVE_STATE` or re-fetch the full items list on every window event, both of which violate AC17's performance guardrail.

**Rejected alternative: a dedicated `MSG_GET_WINDOW_MAP` request.** This would force the sidepanel to issue a second IPC on cold-open and after every broadcast, doubling round-trips. The `MSG_LIST_ITEMS`-extension pattern is already the established idiom for attaching derived views of in-memory SW state.

**Rejected alternative: reuse `SCOPE.LIVE_STATE` for window events.** `SCOPE.LIVE_STATE` currently fires on every tab URL / title / focus change — many times per second during heavy browsing. Window events are rare (minutes apart). Folding them into the same scope would force the sidepanel to do the window-map work on every tab event and lose the per-event specificity AC17 requires.

#### 28.3.2 Wire shape

**Before (post-B-055):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, { live, active, audible, favIconUrl, tabId? }>,
  driftRecords: Record<itemId, DriftRecord>,
  openTabs: OpenTab[],
}
```

**After (B-014):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, { live, active, audible, favIconUrl, tabId?, windowId? }>,  // widened
  driftRecords: Record<itemId, DriftRecord>,
  openTabs: OpenTab[],
  windowMap: Record<string, number>,   // NEW — stringified windowId → ordinal. Empty object {} when no windows open (only possible during SW suspend/resume window). Never null/undefined.
}
```

Keys are stringified windowIds because JSON object keys are strings. The sidepanel converts back via `Number(key)` or stores as strings and compares against `String(windowId)` — implementation choice, documented in handoff.

**`liveStates[itemId].windowId` widening:** for saved-item rows to render a window badge (AC7), the sidepanel needs to know each live item's windowId. Two options were considered:

| Option | Path | Cost |
|--------|------|------|
| A. Widen `buildLiveStates` to attach `windowId` to each live entry. | Read `tabEntry.windowId` from the already-joined `LiveTabIndex` entry in `tab-claims.js:buildLiveStates`. | 1 line in `tab-claims.js`; typedef update in `shared/messages.js`. |
| B. Sidepanel joins on its own via `_cachedOpenTabs`-like structure. | Client-side join, requires a claim-mirror payload extension. | Introduces an additional wire field and duplicates SW-side data. |

**Decision: Option A.** `tab-claims.js:222-228` already reads `tabEntry.{active,audible,favIconUrl}` in the same join; adding `windowId: tabEntry.windowId` to that object literal is a one-line change with no contract break. The `ListItemsResponse` typedef in `shared/messages.js` documents `windowId?: number` as present when `live === true`.

#### 28.3.3 `shared/messages.js` typedef update

```js
/**
 * @typedef {Object} ListItemsResponse
 * @property {Array<Object>} items
 * @property {Record<string, {live: boolean, active: boolean, audible: boolean, favIconUrl: string|null, tabId?: number, windowId?: number}>} liveStates
 *   Per-item live state. `tabId` and `windowId` present iff `live === true`.
 *   `windowId` is ephemeral — not stable across browser restart. Used by the
 *   sidepanel window badge (B-014 AC7). Saved-item rows with no live claim
 *   have `windowId` absent (badge suppression is the default).
 * @property {Record<string, Object>} driftRecords
 * @property {OpenTab[]} openTabs
 * @property {Record<string, number>} windowMap
 *   Session-scoped human-readable window ordinals (B-014). Key = stringified
 *   rawWindowId; value = ordinal (1, 2, 3, …). Gaps are preserved on window
 *   close. Empty object `{}` when no windows are open (rare — only observable
 *   during the brief window of SW suspend/resume). Never null/undefined.
 *   Callers MUST treat rawWindowIds as ephemeral — not stable across browser
 *   restart — and never persist either key or value. Ordinals are UI-only.
 */
```

No new `MSG_*` string constant is introduced. `MSG_LIST_ITEMS = 'tj/listItems'` is unchanged (identical wire identity as in B-055).

#### 28.3.4 New broadcast scope

```js
// background/broadcast.js (addition to existing SCOPE Object.freeze)
export const SCOPE = Object.freeze({
  ITEMS: 'items',
  GROUPS: 'groups',
  PREFERENCES: 'preferences',
  LIVE_STATE: 'liveState',
  WINDOW_MAP: 'windowMap',   // NEW — fires on windows.onCreated / windows.onRemoved only
});
```

No `MUTATION_BROADCASTS` table entry is needed — `SCOPE.WINDOW_MAP` is fired by `tab-events.js` directly (event-driven, not mutation-driven). This mirrors how `SCOPE.LIVE_STATE` is fired from `tab-events.js` today without a dispatcher entry.

#### 28.3.5 Broadcast payload

The broadcast payload intentionally carries **only** the scope and trigger string — not the map itself:
```js
{ type: MSG_STATE_CHANGED, payload: { scope: 'windowMap', trigger: 'window/created' } }
```

The sidepanel refetches the full map via `MSG_LIST_ITEMS` on receipt (§28.4.3). This matches the `SCOPE.LIVE_STATE` pattern and avoids having to serialize / deserialize / version the map payload across two different wire sites. The cost (one extra IPC per window event) is negligible — window events are rare (minutes apart), not high-frequency.

#### 28.3.6 Event-to-scope mapping

| Event | Scope fired | Why |
|-------|-------------|-----|
| `chrome.windows.onCreated` | `WINDOW_MAP` | New ordinal assigned. Filter row may need to appear (≥ 2 windows). |
| `chrome.windows.onRemoved` | `WINDOW_MAP` + existing `LIVE_STATE` (for tab cleanup) | Ordinal removed; existing `LIVE_STATE` broadcast continues for the per-tab teardown path. **Two broadcasts, not merged** — different receivers care about different scopes. |
| `tabs.onDetached` / `tabs.onAttached` | `LIVE_STATE` (existing behaviour; **not** `WINDOW_MAP`) | A tab moving between windows does not change the window *set*; the map is unchanged. Only the tab's `windowId` field in `LiveTabIndex` changes, which is already covered by the existing `tab/updated` broadcast. |
| `tabs.onUpdated` with `tab.windowId` change | `LIVE_STATE` | Same as above — windowId field on the tab moves; map itself is untouched. |
| `chrome.windows.onFocusChanged` | **none new** (existing `LIVE_STATE` via focus-change path) | Focus change does not create or destroy windows; no WINDOW_MAP broadcast. |

#### 28.3.7 Cold-start suppression

`registerWindow` may be called by `chrome.windows.onCreated` during SW cold start **before** `initWindowOrdinals()` has completed. Defence:
1. `initWindowOrdinals()` acquires the "bootstrapping" state at call start and clears it on return. If `registerWindow` is called during bootstrap, it is a no-op (the window is already being captured by `getAll()`).
2. The `broadcast(SCOPE.WINDOW_MAP, ...)` in the `onCreated` handler is gated on `requireClaimsReady: true`, using the existing cold-start suppression pattern (§10.10). This matches the behaviour of every `LIVE_STATE` broadcast: first post-bootstrap broadcast arrives after `reconcileClaims()` resolves.
3. `onRemoved` is **not** gated (no `requireClaimsReady`) — if a window closes during cold start, the surfaces that already loaded their initial state need to hear about it immediately.

### 28.4 Sidepanel Rendering

#### 28.4.1 State cache additions (`sidepanel.js`)

Three new module-scoped state slots:
```js
let _windowOrdinalMap = {};      // Record<string, number>  — cached from MSG_LIST_ITEMS response
let _panelWindowId = null;       // number | null — the sidepanel's own rawWindowId (§28.4.2)
let _activeWindowFilter = null;  // number | null — rawWindowId currently filtered, null = All (§28.5)
```

A `_setWindowOrdinalMap(nextMap)` helper is the single writer (mirrors `_setCachedOpenTabs` precedent from §26.12.3). Callers must not assign directly.

#### 28.4.2 Panel window detection (AC5)

The sidepanel knows its own rawWindowId via:
```js
// On module load, before renderAll runs:
try {
  const self = await chrome.windows.getCurrent();
  _panelWindowId = self?.id ?? null;
} catch {
  _panelWindowId = null;  // badge suppression falls back to "always show if windowMap.size >= 2"
}
```

This is re-fetched on every `MSG_LIST_ITEMS` response (§28.4.3) to handle the rare case of the sidepanel being moved to a different window mid-session (Edge allows this).

**Open question (not blocking — documented for B-035):** in B-035's future "standalone window" mode, the standalone window has its own `windows.Window.id` and is itself a browser window. `chrome.windows.getCurrent()` from inside the standalone window returns the standalone window's id. Badge logic is identical: "hide badge when the item's windowId === my own windowId." What changes is that **two** surfaces are open simultaneously (docked sidepanel + standalone), each showing its own set of badges. B-014 makes no special accommodation for this — each surface renders independently based on its own `_panelWindowId`. When B-035 ships, this behaviour is already correct; no B-014 architectural change is needed.

**Rejected alternative: use `chrome.windows.getLastFocused()` instead of `getCurrent()`.** Last-focused is user-intent semantics (which window did the user most recently interact with); current is panel-identity semantics (which window does this script run in). For badge suppression we need panel-identity — `getCurrent` is correct.

#### 28.4.3 Broadcast handler wiring

The existing `msg.type === MSG_STATE_CHANGED` branch in `sidepanel.js` (around line 1994) gets a new `scope === 'windowMap'` arm:
```js
if (scope === 'windowMap') {
  // Refetch only the map via MSG_LIST_ITEMS. We intentionally reuse the existing
  // message (not a new MSG_GET_WINDOW_MAP) so the sidepanel always reads a
  // consistent snapshot (map + liveStates + openTabs from the same SW call).
  sendMessage(MSG_LIST_ITEMS).then((itemsResp) => {
    _setWindowOrdinalMap(itemsResp.windowMap || {});
    _applyWindowMapToUI(itemsResp);  // patch filter row + badges only (§28.4.4)
  }).catch(() => {});
  return;
}
```

The handler **does not** call `renderAll()`. It only patches (a) the filter row and (b) existing badges. This satisfies AC17.

The existing `liveState` arm (`refetchAndPatchLiveState`) is widened to also reassign `_windowOrdinalMap` from the response (defensive — the SW emits both scopes on most transitions; two broadcasts can arrive out of order). This is a safe no-op when the map is unchanged.

#### 28.4.4 `_applyWindowMapToUI(itemsResp)` — targeted DOM patch

Two tasks, both targeted (no full re-render):
1. **Filter row visibility/contents** (§28.5.1) — rebuild the chip set from the new map size.
2. **Badges on every live row** — iterate DOM rows with `[data-window-id]`, re-resolve the ordinal from `_windowOrdinalMap`, re-render the badge text. For rows whose tab just left `_panelWindowId` (or arrived in it), create/destroy the badge element.

Pseudo-algorithm:
```js
function _applyWindowMapToUI(itemsResp) {
  _rebuildWindowFilterRow(_windowOrdinalMap);    // §28.5.1
  _patchAllWindowBadges(itemsResp);              // §28.4.5
  // AC12: if the currently-filtered window no longer exists, reset.
  if (_activeWindowFilter !== null
      && !Object.prototype.hasOwnProperty.call(_windowOrdinalMap, String(_activeWindowFilter))) {
    _activeWindowFilter = null;
    applyFilter();  // re-apply the B-021 filter pipeline without the window constraint
  }
}
```

#### 28.4.5 Badge rendering helper

A single helper replaces the existing raw-integer `_createWindowBadge`:
```js
/**
 * Render or patch the window badge for a row.
 * - If the item is not live in another window: remove any existing badge.
 * - Otherwise: compute ordinal from _windowOrdinalMap and render "W<ordinal>".
 * - Defensive fallback: if ordinal is missing (race — broadcast arrived before
 *   MSG_LIST_ITEMS completed), render "W<rawWindowId>" so the user sees
 *   *something*; a follow-up broadcast will correct it. This fallback matches
 *   B-055's behaviour and is intentional — a missing badge would be harder to
 *   debug than a raw-id badge for the <500ms window before correction.
 */
function _renderWindowBadge(row, rawWindowId, indicatorsEl) {
  if (rawWindowId == null || rawWindowId === _panelWindowId) {
    const existing = indicatorsEl?.querySelector('.open-tab-window-badge');
    if (existing) existing.remove();
    return;
  }
  const ordinal = _windowOrdinalMap[String(rawWindowId)];
  const label = ordinal != null ? `W${ordinal}` : `W${rawWindowId}`; // defensive fallback
  const ariaLabel = ordinal != null ? `Window ${ordinal}` : `Window ${rawWindowId}`;

  let badge = indicatorsEl.querySelector('.open-tab-window-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'open-tab-window-badge';
    indicatorsEl.prepend(badge);
  }
  if (badge.textContent !== label) badge.textContent = label;
  badge.setAttribute('aria-label', ariaLabel);
}
```

**Deprecation of `_createWindowBadge`:** the current raw-integer helper (§sidepanel.js:1237) is removed in favour of `_renderWindowBadge`. All three of its callers (`buildOpenTabRow`, `_patchOpenTabRow`, the new saved-item paths in §28.4.6) are migrated to the new helper. This is a mechanical edit documented in the handoff.

#### 28.4.6 Saved-item row badge (AC7 — new code path)

`buildItemRow` (`sidepanel.js:1107`) is widened to render a window badge when `live?.live && live.windowId != null && live.windowId !== _panelWindowId`:
- Set `row.dataset.windowId = String(live.windowId)` so `applyFilter` can target the row (§28.5.2).
- Ensure the `.item-indicators` container is created (today it is only created when audible or drifted is truthy — widen the predicate to include the cross-window case).
- Call `_renderWindowBadge(row, live.windowId, indicators)`.

`refetchAndPatchLiveState()` is widened to call `_renderWindowBadge` on every saved-item row whose `live.windowId` may have changed (tab moved between windows). The existing patch loop iterates `[data-item-id]:not([data-live-only])`; no new loop is needed — one call per row inside the existing loop is sufficient.

### 28.5 Window Filter Row (absorbed from B-034)

#### 28.5.1 Component placement & lifecycle (AC8, AC9)

**Placement: inside `#panel-header`, below the filter input row (new row / new flex line).** The HTML addition is a sibling of `#filter-container`:
```html
<!-- sidepanel.html -->
<div id="panel-header" class="panel-header" hidden>
  <span class="panel-header-title">Tab Junkie</span>
  <div id="filter-container"> ... existing filter input + clear btn ... </div>
  <button id="add-bookmark-btn">...</button>
  <!-- NEW: window filter row -->
  <div id="window-filter-row"
       class="window-filter-row"
       role="tablist"
       aria-label="Filter by window"
       hidden>
    <!-- Chips injected by _rebuildWindowFilterRow at runtime -->
  </div>
</div>
```

The row is a sibling of the filter input (not nested inside `#filter-container`) so CSS flex wrapping flows naturally — chips appear on the row **below** the filter/add-button row when ≥ 2 windows are open, and the container collapses to zero height when hidden.

**Visibility rule (AC8):** `_rebuildWindowFilterRow` sets `row.hidden = Object.keys(_windowOrdinalMap).length < 2`. When down to one window, it hides and resets `_activeWindowFilter = null`. When the first second window opens, it appears populated with the current map.

**Contents (AC9):**
- First chip: "All windows" (selected by default; `role="tab"`, `aria-selected="true"`, `data-filter-window="all"`, `tabindex="0"`).
- One chip per ordinal, in ordinal order (W1, W2, W3, …): `role="tab"`, `aria-selected="false"`, `data-filter-window="<rawWindowId>"`, `tabindex="-1"`. Text content `W<ordinal>`.

The ARIA pattern matches the W3C ARIA Authoring Practices **Tabs with Automatic Activation** pattern (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). Automatic activation (not manual) is chosen because the filter is cheap (a targeted DOM `hidden` toggle per row — see §28.5.2) and instant feedback is the expected UX for filter chips.

#### 28.5.2 Filter state & application (AC11)

`_activeWindowFilter: number | null` — `null` means "All windows," a number is a rawWindowId.

Activation flow:
1. User clicks chip (or presses Enter/Space on focused chip).
2. Handler: `_activeWindowFilter = Number(chip.dataset.filterWindow) || null` (the "all" chip yields `NaN → null`).
3. Update `aria-selected` on all chips.
4. Call `applyFilter()` — existing B-021 pipeline.

Filter application (inside existing `applyFilter`, new branch):
```js
// After the text-filter matching loop, but before the "hide groups with zero
// matching items" loop:
if (_activeWindowFilter !== null) {
  const wanted = String(_activeWindowFilter);
  for (const row of itemListEl.querySelectorAll('[data-window-id]')) {
    if (row.hidden) continue;  // already hidden by text filter — don't un-hide
    if (row.dataset.windowId !== wanted) row.hidden = true;
  }
  // Saved items with NO live tab (no data-window-id) are hidden under a
  // specific-window filter, per AC11. The text-filter loop above handled the
  // live rows; this loop handles the remaining saved-item rows:
  for (const row of itemListEl.querySelectorAll('.item-row[data-item-id]:not([data-window-id]):not([hidden])')) {
    row.hidden = true;
  }
}
```

Collapse-state and text-filter semantics from B-021 are preserved byte-for-byte — the window filter is an additional constraint layered on top of the existing pipeline, not a replacement.

#### 28.5.3 Auto-reset on window close (AC12)

Handled in `_applyWindowMapToUI` (§28.4.4): if `_activeWindowFilter` is a rawWindowId no longer present in the new `_windowOrdinalMap`, set it back to `null` and re-apply the filter. The user sees the filter chip disappear and the view return to "All windows" smoothly. Aria-live announcement is **not** emitted (rare event, low-value; documented as a potential R5 enhancement if UAT reveals disorientation).

#### 28.5.4 Keyboard interaction (AC10)

The tablist keyboard pattern requires:
| Key | Action |
|-----|--------|
| `Tab` | Moves focus **into** the tablist (to the selected chip) or **out** of it (to the next focusable element). |
| `ArrowLeft` / `ArrowRight` | Move focus to the previous/next chip, wrapping at the ends. With automatic activation, the focused chip becomes the filter. |
| `Home` / `End` | Move focus to the first / last chip (and activate). |
| `Enter` / `Space` | Activate the focused chip (redundant with automatic activation but required by the pattern). |

Implementation: a single `keydown` listener on `#window-filter-row` delegated to `role="tab"` children. Roving tabindex (`tabindex="0"` on the selected chip, `-1` on the rest) is maintained on every activation.

#### 28.5.5 Integration with existing bulk actions

A window-filter selection **hides** rows — it does not remove them from `_cachedItems` or `_cachedOpenTabs`. Existing bulk-action code paths (Ctrl/Cmd+A, the bulk bar, context menus) already use DOM `:not([hidden])` selectors (B-024 / B-055). No changes required to bulk logic — selections under a window filter naturally exclude hidden rows.

### 28.6 Real-Time Badge Updates (AC13)

When a tab is dragged between windows (`tabs.onDetached`/`tabs.onAttached` or `tabs.onUpdated` with a changed `windowId`), the existing `tab-events.js` `onUpdated` handler captures the new `windowId` into `LiveTabIndex` (`updateTabEntry(tabId, { windowId: tab.windowId })`, lines 54-57). The broadcast path (`SCOPE.LIVE_STATE`) already fires.

B-014 adds one behaviour: `refetchAndPatchLiveState` (§28.4.6) now calls `_renderWindowBadge` for each saved-item row and `patchOpenTabsSection` already reads the latest `tab.windowId` per row. Both update only the badge element — no row rebuild, no full re-render. AC13 is satisfied by these two existing patch paths + the new helper.

**No `SCOPE.WINDOW_MAP` broadcast fires** for tab-move-between-windows events. The window *set* did not change — only which tabs are in which windows. This is a deliberate split: the sidepanel's live-state patch loop handles per-row badge re-resolution; the WINDOW_MAP broadcast handles filter row + badge refresh when the map structure itself changes.

### 28.7 R2 Correctness Checklist

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | Per AC15, the window ordinal map is purely in-memory and session-scoped — never written to `chrome.storage.local` or `chrome.storage.session`. No new partition, no field on any persisted shape, no migration. `KNOWN_VERSION` unchanged. The `windowId` field added to `liveStates[itemId]` is computed at read time from the (also in-memory) `LiveTabIndex` entry — zero storage impact. |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` typedef updated to document the new `windowMap: Record<string, number>` field on `ListItemsResponse` and the widened `liveStates[itemId]` shape (`windowId?: number` present iff `live === true`). New `SCOPE.WINDOW_MAP` value documented in this section and added to the `SCOPE` frozen object in `background/broadcast.js`. No new `MSG_*` string constant — `MSG_LIST_ITEMS` wire identity is unchanged. Handler payload validation is unchanged. |
| C-3 | Service worker cold-start safe | **PASS** | `initWindowOrdinals()` is part of the cold-start bootstrap sequence (alongside `buildLiveTabIndex` and `reconcileClaims`); `MSG_LIST_ITEMS` callers await the existing `readyPromise`, so the dispatcher never responds with a partially-built map. `getWindowMap()` returns `{}` if called before bootstrap (defensive no-throw contract). Window events during cold start are handled: `onCreated` during bootstrap is a no-op (the window is already in the enumeration); the `SCOPE.WINDOW_MAP` broadcast is gated on `requireClaimsReady: true` to avoid flooding surfaces before the first coherent state. `onRemoved` is **not** gated — windows closing during cold start must be immediately reflected. |
| C-4 | ID stability | **PASS** | Raw `chrome.windows.Window.id` values are ephemeral (not stable across browser restart) — explicitly documented in the `windowMap` and `liveStates[].windowId` typedefs. Ordinals are session-only, cleared on SW suspend, and re-enumerated on cold start. Nothing persists either key or value (AC15). Saved-item identity (stable uuid) is unchanged. The sidepanel's cached `_windowOrdinalMap` is a UI-lifetime structure invalidated on every reload. No durable reference to an ephemeral id leaks into storage, messages beyond the `MSG_LIST_ITEMS` response, or broadcast payload metadata. |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new permissions (`windows` permission already required and granted by B-010). No new `default_path`, no new `chrome_url_overrides`, no new `commands`. Existing `sidepanel.html` / `sidepanel.js` references are unaffected. |

### 28.8 Rollback Plan

No schema change, no permission change, no data migration — rollback is a straightforward `git revert` of the B-014 commits. Specifically:

- Reverting the `shared/messages.js` typedef additions (`windowMap`, widened `liveStates`) has no runtime effect (typedefs are JSDoc comments).
- Reverting `background/broadcast.js` removes `SCOPE.WINDOW_MAP`. Any in-flight broadcast with the reverted scope string is silently ignored by the sidepanel's `scope` switch (falls through without action).
- Reverting `background/tabs/window-ordinals.js` (new file — deleted on revert) and the `onCreated`/`onRemoved` wiring in `background/tabs/tab-events.js` stops ordinal bookkeeping. `MSG_LIST_ITEMS` no longer includes `windowMap`; the sidepanel treats the absent field as `{}` (defensive `resp.windowMap || {}` pattern) and renders no badges, hides the filter row.
- Reverting `background/tabs/tab-claims.js` drops the one-line `windowId: tabEntry.windowId` addition to `buildLiveStates`. Saved-item rendering falls back to no cross-window badge (pre-B-014 behaviour).
- Reverting the `sidepanel/sidepanel.js` changes removes `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_renderWindowBadge`, `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, and the filter-row keyboard handler. The Open Tabs section returns to rendering `W${rawWindowId}` (B-055 pre-B-014 behaviour) and saved-item rows have no window badge.
- Reverting `sidepanel/sidepanel.html` removes the `#window-filter-row` element. No other HTML structure changes.
- Reverting `sidepanel/sidepanel.css` removes the `.window-filter-row` styling.
- No cleanup of `chrome.storage.local` / `chrome.storage.session` needed — nothing was written.

**Expected SHA at rollback target:** `bd7634a` (Sprint 13 close) or the most recent commit prior to the B-014 merge, whichever is later.

### 28.9 Risks & Flags

**Tier decision: Full (M) — NOT escalated to Spike-First (XL).** Three foundational triggers are checked and all absent:
- No new storage partition (AC15 locks this).
- No new `manifest.json` permission (the `windows` permission is already granted and used — `chrome.windows.getCurrent`, `chrome.windows.update`, `chrome.windows.onRemoved`, `chrome.windows.onFocusChanged` are all in active use today).
- No new cross-cutting change to drift / matching / reconciliation logic.

The feature is a targeted refinement of existing primitives — the ordinal map is a small in-memory allocator, the filter row is an additional overlay on the existing B-021 filter pipeline, the badge is a one-element patch on existing row renderers. No tier upgrade warranted.

**Medium-severity risks tracked (not blockers):**

1. **Windows `id` monotonicity assumption.** §28.2.2 depends on `chrome.windows.Window.id` being monotonically increasing within a session. This is consistent Chromium behaviour but not formally contracted by the MV3 extension API spec. If a future Chromium release changes the allocation strategy, the cold-start ordering could produce unstable ordinals. Mitigation: the fallback to `chrome.windows.getLastFocused()` reconstruction is documented as an escape hatch. R5 can add a regression test that opens N windows sequentially and asserts ordinal == open-order — if Chromium ever breaks the assumption, the test catches it.
2. **Badge text-width overflow in narrow sidepanels.** Double-digit ordinals (W10+) are wider than the single-digit W1–W9 pattern. If the user runs a narrow side panel with many windows, the badge could wrap or truncate. Mitigation: CSS `.open-tab-window-badge { min-width: 2ch; white-space: nowrap; }` is an existing property in `sidepanel.css` for the B-055 badge; B-014 inherits it. UAT should confirm the 2-digit case.
3. **`chrome.windows.getCurrent()` race at sidepanel open.** The `_panelWindowId` fetch is asynchronous; a very-fast cold open could render one round of badges before `_panelWindowId` is set (default `null`). Mitigation: when `_panelWindowId === null`, `_renderWindowBadge` renders the badge (no suppression) — a brief "wrong" badge is preferable to no badge on first paint, and the first `refetchAndPatchLiveState` cycle will correct it.
4. **Standalone window (B-035) interaction — open question documented, not blocking.** When B-035 ships, two surfaces open simultaneously each independently fetch their own `_panelWindowId` via `chrome.windows.getCurrent()`. Each surface correctly suppresses badges for its own window. No B-014 change required; this is called out so B-035's R2 author does not re-open the question.
5. **Filter row visual stacking in narrow panel.** With many open windows (e.g., 10+), chips may wrap to two or more rows. `.window-filter-row { flex-wrap: wrap; }` is the expected CSS. UAT should confirm the visual is still clean at 10+ windows — if not, a horizontal-scroll fallback is a simple follow-up (out of scope for B-014).

No SEV1 / SEV2 risks identified. Proceed to R3 build.

### 28.10 Handoff Notes for [frontend-engineer]

**File touchpoints:**

- `shared/messages.js` — add `windowMap` to `ListItemsResponse` typedef; widen `liveStates[]` entry typedef with `windowId?: number`.
- `background/broadcast.js` — add `SCOPE.WINDOW_MAP: 'windowMap'` to the frozen `SCOPE` object.
- `background/tabs/window-ordinals.js` — **new module**. Implements the ordinal allocator, cold-start enumeration, `getWindowMap()`, and test hatches.
- `background/tabs/tab-claims.js` — one-line change in `buildLiveStates` (line ~227) adding `windowId: tabEntry.windowId` to the live-entry object literal.
- `background/tabs/tab-events.js` — register `chrome.windows.onCreated` (new handler) that calls `registerWindow()` and broadcasts `SCOPE.WINDOW_MAP`; widen the existing `windows.onRemoved` handler to call `deregisterWindow()` and broadcast `SCOPE.WINDOW_MAP`.
- `background/messages/storage-handlers.js` — extend the `MSG_LIST_ITEMS` case (line ~151-158) to include `windowMap: getWindowMap()` in the returned object. Import `getWindowMap` from `../tabs/window-ordinals.js`.
- `background/service-worker.js` (or wherever the bootstrap sequence is) — add `initWindowOrdinals()` to the cold-start sequence; await it as part of `readyPromise`.
- `sidepanel/sidepanel.html` — add `<div id="window-filter-row" class="window-filter-row" role="tablist" aria-label="Filter by window" hidden></div>` inside `#panel-header` after `#filter-container` / `#add-bookmark-btn`.
- `sidepanel/sidepanel.css` — style `.window-filter-row` (flex row, wrap, spacing) and `.window-filter-chip` (chip pill, `[aria-selected="true"]` variant, focus ring for keyboard). Inherit color tokens from the filter-input family to stay theme-safe.
- `sidepanel/sidepanel.js` — add `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_setWindowOrdinalMap` helper; replace `_createWindowBadge` with `_renderWindowBadge`; add `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, keyboard handler for the tablist; wire the new `scope === 'windowMap'` broadcast arm; widen `applyFilter` with the window-constraint branch (§28.5.2); call `_renderWindowBadge` from `buildItemRow`, `buildOpenTabRow`, `_patchOpenTabRow`, and the saved-item loop in `refetchAndPatchLiveState`.
- `tests/` — add unit coverage for `background/tabs/window-ordinals.js` (cold start, register, deregister, gap preservation, re-enumeration); extend `tests/enriched-list-items.test.js` to assert the new `windowMap` field is present, well-formed, and consistent with `liveStates[].windowId` for a multi-window fixture. UAT cases per every AC.

**Order of implementation (smaller → bigger, TDD-friendly):**

1. `shared/messages.js` typedef + `background/broadcast.js` `SCOPE.WINDOW_MAP`. Pure doc/enum — no runtime behaviour yet.
2. `background/tabs/window-ordinals.js` with unit tests (pure module, no chrome API calls outside `initWindowOrdinals`).
3. `background/tabs/tab-claims.js` one-line `windowId` widening + update the one `buildLiveStates` unit test.
4. `background/tabs/tab-events.js` — add `onCreated` handler; extend `onRemoved`. Integration tests via chrome-mock.
5. `background/messages/storage-handlers.js` — splice `windowMap` into `MSG_LIST_ITEMS` response. Update `tests/enriched-list-items.test.js`.
6. `sidepanel/sidepanel.js` — deprecate `_createWindowBadge`, add `_renderWindowBadge`, wire into both `buildItemRow` and `buildOpenTabRow` / `_patchOpenTabRow`. First pass: badges render with no filter row, no broadcast handler.
7. `sidepanel/sidepanel.js` — add the `scope === 'windowMap'` broadcast arm; wire `_applyWindowMapToUI`. Badges now update live.
8. `sidepanel/sidepanel.html` + `sidepanel.css` — add the filter row markup and styles.
9. `sidepanel/sidepanel.js` — wire `_rebuildWindowFilterRow`, chip click handler, keyboard handler; widen `applyFilter` with the window-constraint branch.
10. `sidepanel/sidepanel.js` — AC12 auto-reset + AC5 re-fetch of `_panelWindowId` on every `MSG_LIST_ITEMS` response.
11. UAT per every AC1–AC18.

**Non-obvious gotchas:**

- `chrome.windows.WINDOW_ID_NONE === -1` — always filter this out in `registerWindow`/`deregisterWindow`. The `onFocusChanged` listener already handles it.
- The `_panelWindowId` fetch is async; do **not** block `renderAll()` on it. The first paint renders with `_panelWindowId === null` (all badges shown); the follow-up patch corrects it. The UI flash is <100ms in practice.
- `applyFilter` runs on every text-filter keystroke (debounced) AND on every broadcast patch AND on every chip click. Confirm the window-constraint branch does not re-cost the no-filter case (short-circuit on `_activeWindowFilter === null`).
- Ordinal map keys are **stringified** windowIds because JSON object keys are strings. Always compare via `String(rawWindowId)` in the sidepanel; never trust identity-equality on a freshly-parsed map.
- The `_renderWindowBadge` helper must be called every time a row is rebuilt (after `patchOpenTabsSection` inserts a fresh `<li>`, after `buildItemRow` creates a saved-item row) AND every time a broadcast patches existing rows. The common failure mode is "badge renders correctly on first paint but doesn't update" — usually caused by forgetting to call the helper from `refetchAndPatchLiveState`'s saved-item loop.
- The tablist keyboard handler must NOT preventDefault on `Tab` — `Tab` should exit the tablist to the next focusable element per the ARIA pattern. Arrow keys **do** preventDefault (they would otherwise scroll the page).

### 28.11 Out-of-Scope — Reconfirmed from AC18

The following are explicitly **not** in scope for B-014. Implementing any of them would be scope creep:

- Cross-device synchronization of window ordinals (requires storage + sync — not a valid extension of an in-memory session-scoped map).
- Named or user-labeled windows ("Work", "Research", etc.) — would require a persistence layer and a naming UI.
- Window-pane reordering of ordinals (letting the user drag W3 to be W1) — breaks the "first-seen order" invariant; not requested by any persona.
- Assigning ordinals to windows with no Tab Junkie presence (e.g., an incognito window or a window opened before the SW booted with no tabs tracked) — the current enumeration covers every window the `windows` API returns, which includes all windows in the main profile; incognito windows are out of scope entirely.
- Multi-profile handling (users with simultaneous Chrome profiles) — each profile runs an independent SW; ordinals are per-profile by construction. No cross-profile reconciliation.

### 28.12 B-014 Build Outcome (R6 Close)

Sprint 14 closed 2026-04-17. B-014 shipped as part of Sprint 14 alongside the B-057 URL-policy spike (research-only — no code). This subsection records what was actually built, deviating from or extending the §28.1–§28.11 R2 plan. §28.1–§28.11 remain the R2 design of record and are not modified here.

#### 28.12.1 Deviations from R2

**D-1 — `shared/scopes.js` created as SSOT for broadcast scopes (NEW module, not in R2 plan).**
The R2 plan (§28.3) added `SCOPE.WINDOW_MAP` to the frozen `SCOPE` object already living in `background/broadcast.js` and expected the sidepanel to import from there. R4 M-1 surfaced that the sidepanel was still comparing against bare-string literals (`scope === 'windowMap'`). Importing from `background/` into `sidepanel/` crosses the background/UI boundary we otherwise keep clean. The [frontend-engineer] lifted `SCOPE` into a new file `shared/scopes.js` (21 lines) and made `background/broadcast.js` re-export it. Both surfaces now consume the same frozen constant. Flagged below under Shared File Governance.

**D-2 — `tabs.onDetached` + `tabs.onAttached` handlers added (R4 H-3 fix).**
R2 §28.3 wired `chrome.windows.onCreated` and `chrome.windows.onRemoved` only, on the assumption that drag-between-windows would flow through existing `tabs.onUpdated` infrastructure. R4 H-3 proved otherwise — Chrome fires `onDetached`/`onAttached` (NOT `onUpdated`) for cross-window drag. Handlers added at `background/tabs/tab-events.js:309` (onDetached — transitional marker only) and `:323` (onAttached — authoritative `updateTabEntry({windowId, index})` + dual broadcast `SCOPE.LIVE_STATE` then `SCOPE.WINDOW_MAP`). Without this, AC13 (badge updates on cross-window drag) would have silently failed.

**D-3 — `_activateWindowFilterChip` windowId coercion hardened (R4 H-1 fix).**
R2 §28.5.2 sketched `_activeWindowFilter = Number(raw) || null`. R4 H-1 flagged that `Number("0") === 0` is falsy, so a real windowId of 0 would silently behave as if the "All" chip were active. Final code at `sidepanel/sidepanel.js:1998` uses `raw === 'all' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : null)`. Semantically safe even if Chromium ever hands out `windowId === 0`.

**D-4 — `renderAll` re-applies filter on window-filter state too (R4 H-2 fix).**
R2 §28.5 assumed `renderAll`'s existing post-render `if (_filterQuery) applyFilter()` guard covered the window filter. R4 H-2 proved it didn't — a window chip active with no text query caused any `scope: items | groups` broadcast to rebuild the DOM with all rows visible while the chip kept its selected state. Fix at `sidepanel.js:1050` (and the three other `renderAll` call sites at 406/1684/2406): `if (_filterQuery || _activeWindowFilter !== null) applyFilter();`.

**D-5 — `refetchAndPatchLiveState` and `SCOPE.WINDOW_MAP` handler both re-apply filter on exit (UAT-D2 fix).**
UAT-D2 revealed that even after D-4 fixed `renderAll`, two other paths rebuilt DOM state without re-running `applyFilter`:
- `refetchAndPatchLiveState()` (sidepanel.js:1780) — triggered by every `SCOPE.LIVE_STATE` broadcast.
- `SCOPE.WINDOW_MAP` handler (sidepanel.js:2412) — triggered when a window opens/closes.

Both patched `data-window-id` attributes but left the filter un-reapplied. Dragging a tab between windows while a window filter was active left the moved row visible in the wrong filter view. Same one-line guard (`if (_filterQuery || _activeWindowFilter !== null) applyFilter();`) added at the tail of both paths. The pattern "after any DOM-patching broadcast, re-apply the active filter" is now established across all three exit points.

**D-6 — Window-filter chip `:focus-visible` uses explicit outline (UAT-D1 fix).**
R2 §28.5.3 specified a `box-shadow: 0 0 0 3px var(--accent-subtle)` halo for focus. In dark mode, `--accent-subtle` resolves to `#1e293b` — too close to the panel background for the halo to be visible. Replaced at `sidepanel.css:1252–1256` with `outline: 2px solid var(--accent); outline-offset: 2px; border-color: var(--accent);`. Visible in both light and dark modes. Flagged in the Sprint 14 retrospective: other elements across the stylesheet use the same anti-pattern and warrant a cross-sprint audit.

**D-7 — `M-3` ordering tweak in `SCOPE.WINDOW_MAP` handler.**
R2 §28.6 described the handler as `_setWindowOrdinalMap → _applyWindowMapToUI`. R4 M-3 showed this could flash stale badge ordinals when a tab moved between windows and the `windowMap` broadcast arrived before the `liveState` broadcast. Final order at `sidepanel.js:2394–2412`: `_setWindowOrdinalMap → _refreshPanelWindowId → refresh caches → patchOpenTabsSection(_cachedOpenTabs) → _applyWindowMapToUI → re-apply filter`. The additional `patchOpenTabsSection` call guarantees that `data-window-id` attributes are fresh before the badge pass reads them.

#### 28.12.2 New Contracts Finalized

| Contract | Location | Shape | Notes |
|----------|----------|-------|-------|
| `MSG_LIST_ITEMS.windowMap` | `shared/messages.js` typedef | `Record<string, number>` (string rawWindowId → positive-integer ordinal) | Always present, may be `{}` if SW booted pre-enumeration. Sidepanel uses `resp.windowMap \|\| {}` defensive. |
| `liveStates[itemId].windowId?` | `shared/messages.js` + `background/tabs/tab-claims.js:204` (buildLiveStates JSDoc widened per M-4) | `number` present iff `live === true` and a claim is held | Raw Chromium windowId, session-ephemeral. |
| `SCOPE.WINDOW_MAP` | `shared/scopes.js` (SSOT), re-exported by `background/broadcast.js` | `'windowMap'` | Fires on `windows.onCreated` / `windows.onRemoved` (bootstrap-gated to avoid cold-start flood) and on `tabs.onAttached` (AC13). Sidepanel handler refetches `MSG_LIST_ITEMS` and patches ordinal caches + DOM attrs + badges + filter. |
| `shared/scopes.js` | NEW cross-boundary shared module | `export const SCOPE = Object.freeze({...})` | **Shared File Governance flag**: cross-boundary module touched by `background/broadcast.js` and `sidepanel/sidepanel.js`; future contracts that add scopes must edit here first. |

No new `MSG_*` type string was added. No new storage keys. No new manifest permissions. Wire identity of `MSG_LIST_ITEMS` is unchanged (response payload additive only).

#### 28.12.3 Lifecycle

**Cold-start bootstrap fan-out** (`background/tabs/index.js:37–42`):
```
Promise.all([
  reconcileClaims(),
  buildLiveTabIndex(),
  initWindowOrdinals(),   // B-014 — joins the existing fan-out
]);
```
`initWindowOrdinals()` calls `chrome.windows.getAll()` and registers each window in monotonically-increasing raw-id order (§28.2.2). `MSG_LIST_ITEMS` callers await the existing `readyPromise`, so the dispatcher never returns a partially-built ordinal map.

**Runtime event flow**:
- `chrome.windows.onCreated` → `registerWindow(windowId)` → broadcast `SCOPE.WINDOW_MAP` (gated on `requireClaimsReady`).
- `chrome.windows.onRemoved` → `deregisterWindow(windowId)` → broadcast `SCOPE.WINDOW_MAP` (NOT gated — closure events during cold start must be reflected immediately).
- `chrome.tabs.onAttached` → `updateTabEntry(tabId, {windowId, index})` → broadcast `SCOPE.LIVE_STATE`, then broadcast `SCOPE.WINDOW_MAP` (latter second so the sidepanel re-patches badges with fresh windowIds already resolved).
- `chrome.tabs.onDetached` → transitional marker only; `onAttached` is authoritative.

**SW restart**: `window-ordinals.js` module state is cleared (module lives in the SW). Fresh enumeration via `chrome.windows.getAll()` on the next bootstrap. No persistence; session-scoped by design (AC15).

#### 28.12.4 UAT-Discovered Defects (Fixed In-Pipeline)

| ID | Severity | Description | Fix |
|----|----------|-------------|-----|
| UAT-D1 | Defect (accessibility) | Window-filter chip `:focus-visible` invisible in dark mode — `--accent-subtle` (`#1e293b`) too close to panel background for the box-shadow halo to register visually. Keyboard users lost focus on the filter row. | `sidepanel.css:1252–1256` — replaced box-shadow halo with explicit `outline: 2px solid var(--accent); outline-offset: 2px;`. Visible in both themes. |
| UAT-D2 | Defect (state consistency) | Dragging a tab between windows while a window filter was active left the row visible in the wrong filter view. Root cause: even after R4 H-2 fixed the `renderAll` path, the `refetchAndPatchLiveState` and `SCOPE.WINDOW_MAP` handler paths both patched DOM attributes without re-running `applyFilter`. | Added `if (_filterQuery \|\| _activeWindowFilter !== null) applyFilter();` guard at the tail of both paths (`sidepanel.js:1780` and `sidepanel.js:2412`). Pattern now consistent across all three DOM-patching exit points. |

Both defects were caught by interactive UAT against the loaded unpacked extension. Neither surfaced in automated tests nor in R4 static review. Sprint retrospective Action Item: add "where does filter state need to be re-applied" as an explicit R4 checklist item for any future feature that patches DOM on broadcast.

#### 28.12.5 R2 Correctness Checklist — Post-Build

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | No write to `chrome.storage.*`. Ordinal map is module-scoped in-memory only (verified by grep: `window-ordinals.js` contains no `chrome.storage` reference). `liveStates[].windowId` is computed at read time from in-memory `LiveTabIndex`. `KNOWN_VERSION` unchanged. |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` typedef documents `windowMap: Record<string, number>` and widened `liveStates[]` shape. `shared/scopes.js` (new) exports frozen `SCOPE` with `WINDOW_MAP: 'windowMap'` as SSOT. `background/broadcast.js` re-exports. Sidepanel imports and compares against `SCOPE.WINDOW_MAP` constant. `MSG_LIST_ITEMS` wire identity unchanged (additive field). |
| C-3 | Service worker cold-start safe | **PASS** | `initWindowOrdinals()` runs in the `Promise.all` bootstrap fan-out alongside `buildLiveTabIndex` and `reconcileClaims` in `background/tabs/index.js:37–42`. `MSG_LIST_ITEMS` handler awaits `readyPromise` so dispatcher never returns a partial map. `onCreated` broadcasts are bootstrap-gated; `onRemoved` is not (closure during cold start must be immediately reflected). `getWindowMap()` returns `{}` defensively if called pre-bootstrap. |
| C-4 | ID stability | **PASS** | Raw `chrome.windows.Window.id` is ephemeral — documented in typedefs for `windowMap` and `liveStates[].windowId`. Ordinals are session-only, cleared on SW suspend, re-enumerated on cold start. Nothing persists either key or value. Saved-item stable uuid identity unchanged. `_windowOrdinalMap` in sidepanel is UI-lifetime only. |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new permissions — `windows` permission was already granted and in active use pre-B-014. No new `default_path` / `chrome_url_overrides` / `commands`. |

#### 28.12.6 Rollback Plan

**No storage schema change. No permission change. No data migration.** Rollback is a straightforward `git revert` of the B-014 commits. Specifically:

- Reverting `shared/messages.js` typedef additions has no runtime effect (JSDoc comments only).
- Reverting `shared/scopes.js` (NEW file — deleted on revert) removes the `SCOPE` frozen object. `background/broadcast.js` must be reverted alongside to drop its re-export. Any in-flight broadcast with scope string `'windowMap'` is silently ignored by the sidepanel `scope` switch (falls through with no action).
- Reverting `background/tabs/window-ordinals.js` (NEW file — deleted on revert) and the wiring in `background/tabs/tab-events.js` (onCreated, onRemoved, onDetached, onAttached) stops ordinal bookkeeping entirely. `MSG_LIST_ITEMS` no longer includes `windowMap`; sidepanel falls back to `resp.windowMap || {}` (empty map) → no badges rendered, filter row hidden.
- Reverting `background/tabs/tab-claims.js` drops the one-line `windowId: tabEntry.windowId` addition to `buildLiveStates` return shape.
- Reverting the `sidepanel/sidepanel.{js,html,css}` changes removes `_windowOrdinalMap`, `_panelWindowId`, `_activeWindowFilter`, `_renderWindowBadge`, `_rebuildWindowFilterRow`, `_applyWindowMapToUI`, the tablist keyboard handler, and the `#window-filter-row` HTML element. Open Tabs section returns to B-055 pre-B-014 behaviour (renders `W${rawWindowId}` directly).
- No cleanup of `chrome.storage.local` or `chrome.storage.session` needed — nothing was written.

**Rollback target SHA**: `bd7634a` (Sprint 13 close) or whatever commit was last green prior to the B-014 merge, whichever is later.

#### 28.12.7 Sibling Context — B-057 Spike Outcome

B-057 (URL-scheme allowlist + duplicate-URL policy review) shipped as Sprint 14's Spike-First research item. Output document: `docs/spikes/B-057-url-policy-spike.md` (277 lines). Two user-accepted decisions:

1. **Expand URL allowlist** to include `chrome://`, `edge://`, `chrome-extension://`, `about:`, `view-source:`; keep hard-reject for `javascript:` and `data:` (XSS / exfil vectors).
2. **Remove `ERR_DUPLICATE_URL` reject** from `MSG_PROMOTE_TAB`; replace with a soft-warn UI ("This page is already saved — promote anyway?").

Four follow-on items queued for Sprint 15 (B-058 S, B-059 M, B-060 S, B-061 XS — latter replaces retired B-056). No implementation landed in Sprint 14; the spike correctly recommended deferral. See the spike document for full decision rationale and follow-up scope.

#### 28.12.8 Flagged for Future Hardening

Items deferred from B-014 R4 LOW findings (not fixed this sprint) plus cross-sprint concerns surfaced during UAT. None are blockers.

| Source | Item | Notes |
|--------|------|-------|
| R4 L-2 | `.item-window-badge` / `.open-tab-window-badge` CSS duplication (100% identical today) | Intentional — retained so the two surfaces can diverge without a cascade edit. Revisit on next CSS pass. |
| R4 L-1 | `registerWindow` idempotent-replay still broadcasts | Returns existing ordinal on duplicate `onCreated` but fires a `SCOPE.WINDOW_MAP` broadcast anyway. Wastes one IPC round-trip per duplicate. Benign; no correctness impact. |
| R4 L-5 | `clearFilter()` does not reset `_activeWindowFilter` | Arguably correct (orthogonal filter axes) but UX-ambiguous. Needs [product-manager] review before a code change. |
| Retrospective | Bare-string `scope === 'items' \| 'groups' \| 'liveState'` comparisons still exist in sidepanel | Only the `WINDOW_MAP` branch uses `SCOPE.*`. Full sweep to `SCOPE.ITEMS` / `SCOPE.GROUPS` / `SCOPE.LIVE_STATE` / `SCOPE.PREFERENCES` added as Sprint 14 retro Action Item. |
| Retrospective | Dark-mode `:focus-visible` using `--accent-subtle` anti-pattern | UAT-D1 surfaced one instance. Other elements may have the same issue — cross-sprint CSS audit queued as retro Action Item. |
| R4 H-3 context | `shared/scopes.js` as cross-boundary shared module was not flagged under Shared File Governance in R4 | Noted in Sprint 14 retrospective — R4 prompt update to require any new `shared/` module to be explicitly flagged by [code-reviewer]. |

None of these are SEV1 or SEV2. All are schedule-negotiable for future sprints.

