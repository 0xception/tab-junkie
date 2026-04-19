## 26. B-055 — Open Tabs Section (R2 Design)

### 26.1 Overview

B-055 introduces a pinned "Open Tabs" section at the bottom of the sidepanel scroll area that surfaces every live browser tab NOT already represented as a saved item or a floating-group member. The section is ephemeral: it carries no persisted state and introduces no new storage partitions, no new message constants, and no new manifest permissions. The enriched `MSG_LIST_ITEMS` response is extended with one new array field (`openTabs`); everything else reuses infrastructure shipped in B-050 (broadcast), B-024 (multi-select + bulk bar), B-010 (`LiveTabIndex`), and B-018 (floating-group re-association).

The goal of this section is to bind every architectural decision before R3 so the [frontend-engineer] can build without replaying shape debates. Out-of-scope exclusions (user reordering, cross-window drag, bulk "Save all open tabs", "Open in new window" context action, group-picker modal full implementation) are enumerated in AC17 and repeated in §26.9.

### 26.2 Message Contract — Extend `MSG_LIST_ITEMS`

#### Decision: extend, do not introduce a new message

AC2 locks this in: `MSG_LIST_ITEMS` already does a single-round-trip fetch of `{items, liveStates, driftRecords}` at sidepanel open. Adding a fourth field `openTabs` keeps first-paint latency flat (no second IPC, no second `await`), matches the existing "fetch once, render once" pattern in `renderAll()`, and avoids adding a new message constant that every future surface would have to know about.

A separate `MSG_LIST_OPEN_TABS` was considered and rejected: it would force the sidepanel to sequence two messages (or parallelise them and then join), introduce a second cold-start race window, and add a constant to `shared/messages.js` that only one surface consumes.

#### Before/after shape

**Before (current, post-B-024):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, {
    live: boolean,
    active: boolean,
    audible: boolean,
    favIconUrl: string | null,
    tabId?: number,     // present only when live (B-024)
  }>,
  driftRecords: Record<itemId, DriftRecord>,
}
```

**After (B-055):**
```js
// MSG_LIST_ITEMS response data
{
  items: Item[],
  liveStates: Record<itemId, { ... }>,   // unchanged
  driftRecords: Record<itemId, DriftRecord>,  // unchanged
  openTabs: OpenTab[],   // NEW — empty array [] when none qualify, never null/undefined
}

// New shape
/**
 * @typedef {Object} OpenTab
 * @property {number} tabId         Browser-assigned tab id (ephemeral, NOT stable across browser restart)
 * @property {number} windowId      Browser-assigned window id (ephemeral)
 * @property {string} title         Tab title, untrusted — must be rendered with textContent
 * @property {string} url           Tab URL, untrusted — see §26.4 for scheme policy
 * @property {string | null} favIconUrl  Tab favicon URL or null if none (letter-avatar fallback in UI)
 * @property {boolean} audible      Audio indicator
 * @property {boolean} active       True if this is the focused tab in its window
 * @property {number} tabIndex      Position in the window's tab strip (used for sort — AC9)
 */
```

#### `lastAccessedAt` decision — EXCLUDED

`chrome.tabs.Tab.lastAccessed` exists in recent Chromium versions and would support a future "Recently Active" sort mode. It is deliberately **excluded** from the `OpenTab` shape for B-055 because:

1. AC9 defines sort order as `(windowId asc, tabIndex asc)` — no field in `OpenTab` is needed for any other sort today.
2. AC17 explicitly marks user-defined reordering and alternative sorts as out of scope.
3. Adding a field "just in case" violates YAGNI and widens the surface area the [security-reviewer] has to audit.

If a future item introduces a recency sort, it will add the field then (additive, non-breaking change to the response shape — no schema bump because `OpenTab` is not persisted).

#### `shared/messages.js` typedef changes

Update the existing `ListItemsResponse` typedef and add an `OpenTab` typedef. The string constant `MSG_LIST_ITEMS = 'tj/listItems'` is **unchanged**. No new `MSG_*` constant is introduced (AC3).

```js
/**
 * @typedef {Object} OpenTab
 * @property {number} tabId
 * @property {number} windowId
 * @property {string} title
 * @property {string} url
 * @property {string | null} favIconUrl
 * @property {boolean} audible
 * @property {boolean} active
 * @property {number} tabIndex
 */

/**
 * @typedef {Object} ListItemsResponse
 * @property {Array<Object>} items
 * @property {Record<string, {live: boolean, active: boolean, audible: boolean, favIconUrl: string|null, tabId?: number}>} liveStates
 * @property {Record<string, Object>} driftRecords
 * @property {OpenTab[]} openTabs
 *   Live browser tabs NOT claimed by any saved item AND NOT claimed by any
 *   resolved floating-group record. Empty array `[]` when none qualify (never null/undefined).
 *   The array is recomputed on every `MSG_LIST_ITEMS` call; receivers must treat
 *   `tabId` and `windowId` as ephemeral (not stable across browser restart).
 */
```

### 26.3 Derivation Logic — Service Worker Side

#### Location: `MSG_LIST_ITEMS` handler in `background/messages/storage-handlers.js`

The `openTabs` array is built inside the existing `case MSG_LIST_ITEMS` branch of `dispatch()`, AFTER `items`, `liveStates`, and `driftRecords` are assembled. It is a pure synchronous computation over three existing in-memory structures:

1. `getLiveTabIndex()` — the authoritative map of all currently open tabs (populated by B-010, kept current by `tab-events.js`).
2. `getClaimsMirror()` — the item→tab mapping (populated by B-001c, updated on every claim/release).
3. `readPartition(PARTITION_FLOATING_GROUPS)` — unresolved floating-group records on disk (B-018 / B-002). Only records with a resolved `claimedTabId` exclude tabs; unresolved records do not — they have no live tab to exclude.

#### Exclusion predicate (AC1)

A live tab `t` qualifies as "open tab" iff **all three** conditions hold:

```
(a) t.tabId ∈ liveTabIndex                           — trivially true by iteration source
(b) t.tabId ∉ Object.values(claimsMirror)            — not claimed by any saved item
(c) t.tabId ∉ resolvedFloatingGroupTabIds             — not already rendered inside a group section as a live floating member
```

#### Pseudocode

```js
// Inside case MSG_LIST_ITEMS, after existing items/liveStates/driftRecords assembly:
const openTabs = buildOpenTabs();

return { items, liveStates, driftRecords, openTabs };

// ---- helper (can live in a new background/tabs/open-tabs.js or inline) ----
function buildOpenTabs() {
  // H3 cold-start: if claims have not been reconciled yet, return [] rather
  // than throw or return a misleading snapshot. See §26.7 C-3.
  if (!isClaimsReady()) return [];

  const index = getLiveTabIndex();
  const claimedTabIds = new Set(Object.values(getClaimsMirror()));

  // Floating-group exclusion: a floating-group record with a resolved tab
  // would have already been upgraded into a real claim by reassociateFloatingGroups
  // during cold start (see §10.8 / §24). At this point, every floating-group
  // tab IS in claimsMirror. Therefore claimsMirror alone is a sufficient
  // exclusion set; we do NOT need a second pass over tj:floatingGroups at read time.
  //
  // Rationale: reassociateFloatingGroups -> claimTabForItem writes the tabId into
  // the mirror BEFORE pruneResolvedFloatingGroups removes the record. Unresolved
  // floating-group records (no live tab matched) exclude nothing because there
  // is no tab to exclude.

  const tabs = [];
  for (const [tabId, entry] of index) {
    if (claimedTabIds.has(tabId)) continue;
    tabs.push({
      tabId,
      windowId: entry.windowId,
      title: entry.title || '',        // see §26.3 LiveTabIndex shape note below
      url: entry.url || '',
      favIconUrl: entry.favIconUrl || null,
      audible: !!entry.audible,
      active: !!entry.active,
      tabIndex: typeof entry.index === 'number' ? entry.index : 0,
    });
  }

  // AC9 sort: windowId asc, tabIndex asc (deterministic, stable)
  tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.tabIndex - b.tabIndex;
  });

  return tabs;
}
```

#### LiveTabIndex shape note — `title` field

The current `LiveTabIndex` entry shape (see `background/tabs/live-tab-index.js`) is:
```
{ url, windowId, active, audible, index, favIconUrl }
```
It does **not** include `title`. B-055 requires `title` for row rendering (AC5). Architectural choice:

- **Add `title` to the `LiveTabIndex` entry shape** — populated in `buildLiveTabIndex()` from `tab.title`, updated in `tab-events.js onUpdated` when `changeInfo.title` changes.
- Emit a `liveState` scope broadcast on `changeInfo.title` mutations (the B-050 broadcast path already handles `tab.onUpdated`; adding `title` to the dispatch is a widening, not a new contract).

This is a one-field widening, not a contract change. It keeps `buildOpenTabs()` fully synchronous and avoids `await chrome.tabs.get(tabId)` per-tab lookups (which would blow the 200ms first-paint budget on 50 open tabs — AC16).

**Fallback:** if an entry's `title` is empty string, the UI uses the first character of the URL's hostname for the letter-avatar (AC5 row rendering), matching how saved items fall back today.

#### Purity and memoization

`buildOpenTabs()` is pure over its three inputs and cheap (O(n) over `LiveTabIndex` where n is the total live-tab count, typically ≤ 200 in realistic sessions). No memoization is needed at the SW layer — it runs at most once per `MSG_LIST_ITEMS` call, and sidepanel calls this on cold-open + on broadcast-driven refetch (§26.5). Memoizing would be premature; the 50-row AC16 benchmark budget is the guard.

#### Cold-start / pre-`isClaimsReady()` behaviour

Before `reconcileClaims()` completes on SW cold start, `claimsMirror` is empty. If `MSG_LIST_ITEMS` runs in that window it would currently return *every* live tab in `openTabs` because no tab appears claimed. That is wrong — the sidepanel would momentarily show every saved bookmark ALSO in the Open Tabs section.

**Decision: short-circuit `openTabs = []` when `!isClaimsReady()`.** This matches the existing `buildLiveStates()` behaviour which returns `{live: false, ...}` defaults in the same window (see `tab-claims.js:207-214`). A follow-up `MSG_STATE_CHANGED` broadcast fires after `reconcileClaims()` completes (via the `liveState` scope in B-050), at which point the sidepanel refetches and gets the real `openTabs` array. The brief empty state is acceptable — far better than leaking saved items into the section.

#### Non-http(s) schemes — INCLUDE

Tabs with URLs like `chrome://`, `edge://`, `about:`, `file://`, `chrome-extension://` are included in `openTabs`. Rationale:

- They are real live tabs in the user's browser. Hiding them would make the section's row count disagree with what the user sees in their tab strip — confusing.
- They already exist in `LiveTabIndex` (no filter has ever been applied there).
- The "Save to group…" context action (AC7) maps to `MSG_PROMOTE_TAB`, which **already** rejects restricted schemes via `ERR_VALIDATION` (see `storage-handlers.js:175-183`). So a user can see a `chrome://` tab in the list and click Close, but "Save to group" will surface an inline error — acceptable UX, already modelled by the existing handler.
- AC1 exclusion predicate does not mention URL scheme.

### 26.4 Rendering Architecture — Sidepanel Side

#### Section placement and lifecycle (AC4, AC10)

A new `<section id="open-tabs-section">` is appended to `itemListEl` as the **last child** — after all named root groups AND after the Ungrouped section. The section header reads "Open Tabs" with a live count badge (`Open Tabs · N`). The section is **always mounted**, even when `openTabs.length === 0` — in that case it renders an inline empty-state block matching B-049's pattern ("No untracked tabs — all open tabs are saved or grouped").

```
itemListEl
  ├─ group-section (named group A)
  ├─ group-section (named group B)
  ├─ group-section (Ungrouped — when any ungrouped saved items exist)
  └─ open-tabs-section       ← new, always present
       ├─ header ("Open Tabs · 3" or "Open Tabs")
       ├─ <ul role="list">
       │    ├─ li[data-live-only="true"][data-tab-id="..."] × N  (when N > 0)
       │    └─ ...
       └─ empty-state block (shown only when N === 0)
```

The section is inserted inside `renderAll()` after the existing Ungrouped append. `buildGroupSection()` is NOT reused — Open Tabs rows have different data attributes, different click behaviour, and different context-menu actions, so a parallel `buildOpenTabsSection(openTabs)` helper is cleaner than overloading the saved-item path with conditionals.

#### Row attribute strategy — `data-tab-id` vs `data-item-id`

Saved-item rows use `data-item-id="<uuid>"` and are addressed by that attribute throughout the sidepanel (selection, filter, drag, context menu, live-state patching). Open-tab rows have **no saved item** — they cannot reuse `data-item-id`.

**Decision:** open-tab rows use `data-tab-id="<number>"` AND `data-live-only="true"`. Saved-item rows never carry `data-live-only`. Every row-addressing selector that is Open-Tabs-aware uses:

```js
// Query saved items only
itemListEl.querySelectorAll('[data-item-id]:not([data-live-only])')
// Query open tabs only
itemListEl.querySelectorAll('[data-tab-id][data-live-only]')
// Query ALL rows (filter, multi-select traversal)
itemListEl.querySelectorAll('[data-item-id], [data-tab-id]')
```

This keeps existing saved-item queries unchanged (they already use `[data-item-id]`) and introduces a single parallel selector family for Open Tabs.

#### Cache strategy — parallel `_cachedOpenTabs` array

`_cachedLiveStates` is keyed by `itemId` — Open Tabs have no `itemId`, so they cannot fit. Two options considered:

1. **Store open tabs inside `_cachedLiveStates` under synthetic keys** (e.g., `tab:42`) — rejected. Every consumer of `_cachedLiveStates` (`_updateBulkBar`, `refetchAndPatchLiveState`, context menu gating in `sidepanel.js:1611` / `:1749` / `:1832`) would have to learn to split synthetic vs real keys. High blast radius for ugly prefix checks.
2. **Parallel cache: `let _cachedOpenTabs = [];`** — accepted. Open Tabs are a self-contained feature; a dedicated cache isolates their state from the saved-item path. `refetchAndPatchLiveState` assigns both caches in the same pass (`_cachedLiveStates = resp.liveStates; _cachedOpenTabs = resp.openTabs;`). `renderAll()` calls `buildOpenTabsSection(_cachedOpenTabs)` after the Ungrouped append.

**Decision: use a parallel `_cachedOpenTabs: OpenTab[]` module-level variable.** Lower blast radius; no churn in existing live-state consumers.

#### Selection set — canonical string keys

`_selection` today is `Set<string>` holding item ids. AC12 requires it to hold a mix of item ids (strings) and tab ids (numbers). Two options:

1. **Parallel selection sets** (`_itemSelection: Set<string>`, `_openTabSelection: Set<number>`) — rejected. Every existing selection call site (`_toggleSelection`, `_rangeSelect`, `_selectAll`, `_clearSelection`, `_reapplySelection`, `_updateBulkBar`) would fork. Too much duplication.
2. **Canonical prefixed string keys: `item:<id>` or `tab:<number>`** — accepted. `_selection` remains `Set<string>` with a single type invariant. Call sites that need to dispatch actions parse the prefix:

```js
// Entry point: _toggleSelection now accepts a row element, derives the key.
function _selectionKeyForRow(row) {
  if (row.dataset.liveOnly === 'true') return 'tab:' + row.dataset.tabId;
  return 'item:' + row.dataset.itemId;
}

// Bulk actions partition the set:
function _partitionSelection() {
  const itemIds = [];
  const tabIds = [];
  for (const key of _selection) {
    if (key.startsWith('item:')) itemIds.push(key.slice(5));
    else if (key.startsWith('tab:')) tabIds.push(Number(key.slice(4)));
  }
  return { itemIds, tabIds };
}
```

**Decision: canonical `item:<id>` / `tab:<number>` prefixed keys in the single `_selection: Set<string>`.** The prefix parser `_selectionKeyForRow` / `_partitionSelection` is the only new primitive; every other call site stays sorted by string Set semantics.

Migration note: existing call sites that read `row.dataset.itemId` to write into `_selection` must be refactored to call `_selectionKeyForRow(row)`. This is a mechanical edit across ~10 sites (`_toggleSelection`, `_rangeSelect`, `_selectAll`, `_reapplySelection`, the click handler path) — documented in the handoff (§26.10).

#### Click-to-focus (AC6) — reuse `MSG_NAVIGATE_TO_ITEM` with a `tabId` variant

Two options:

1. **Introduce new `MSG_FOCUS_TAB`** — rejected. One more constant, one more handler, one more safe-mode entry, one more broadcast-scope decision, for an operation that is semantically identical to "navigate to an item that happens to already have a live tab."
2. **Extend `MSG_NAVIGATE_TO_ITEM` to accept a `{ tabId, windowId }` variant** — accepted. The handler already does `chrome.tabs.update(tabId, {active: true}) + chrome.windows.update(windowId, {focused: true})` when the item has a live claim (see `storage-handlers.js:281-287`). Factoring that path so it can be invoked without an `itemId` is a tight refactor:

```js
// storage-handlers.js :: MSG_NAVIGATE_TO_ITEM handler
case MSG_NAVIGATE_TO_ITEM: {
  // NEW: tabId-only variant (open-tab row click — no saved item involved)
  if (p.itemId === undefined && typeof p.tabId === 'number') {
    if (typeof p.windowId !== 'number') {
      throw new StorageError(ERR_VALIDATION, 'navigateToItem: windowId required with tabId');
    }
    const index = getLiveTabIndex();
    const entry = index.get(p.tabId);
    if (!entry) {
      throw new StorageError(ERR_NOT_FOUND, 'navigateToItem: tab not in live index');
    }
    await chrome.tabs.update(p.tabId, { active: true });
    await chrome.windows.update(p.windowId, { focused: true });
    // No updateItem, no lastAccessedAt bump — there is no saved item.
    return { tabId: p.tabId, opened: false };
  }

  // ... existing itemId-only branch unchanged ...
}
```

**Broadcast implication:** `MSG_NAVIGATE_TO_ITEM` is currently in `MUTATION_BROADCASTS` under `SCOPE.ITEMS` (`storage-handlers.js:96`) because the itemId path bumps `lastAccessedAt` via `updateItem`, which is a real storage mutation. The new tabId-only variant does NOT bump `lastAccessedAt` (no saved item), so it must NOT broadcast. Implementation: the dispatcher broadcasts based on `message.type` alone today; we add a conditional skip for the tabId-only variant.

```js
// In registerStorageHandlers, after dispatch returns:
const broadcastScope = MUTATION_BROADCASTS[message.type];
if (broadcastScope !== undefined) {
  // B-055: MSG_NAVIGATE_TO_ITEM tabId-only variant is a no-op on storage —
  // suppress the broadcast to avoid a spurious ITEMS scope invalidation.
  const isNavigateTabIdOnly = message.type === MSG_NAVIGATE_TO_ITEM
    && message.payload?.itemId === undefined
    && typeof message.payload?.tabId === 'number';
  if (!isNavigateTabIdOnly) {
    broadcast(broadcastScope, message.type);
  }
}
```

Typedef update in `shared/messages.js` documents both variants:
```js
/**
 * MSG_NAVIGATE_TO_ITEM request payload is one of:
 *   (a) { itemId: string }            — navigate to saved item (may open a new tab)
 *   (b) { tabId: number, windowId: number }  — focus an existing live tab (B-055)
 */
```

**Decision: extend `MSG_NAVIGATE_TO_ITEM` with a `{tabId, windowId}` variant, suppress its broadcast, update the typedef. No new constant.**

### 26.5 Broadcast Handling & Real-Time Updates

#### Broadcast sources that affect `openTabs`

Per B-050, `MSG_STATE_CHANGED` fires with:
- `scope: 'liveState'` on `tabs.onCreated`, `tabs.onUpdated`, `tabs.onActivated`, `tabs.onRemoved`, `windows.onRemoved` (source: `tab-events.js`).
- `scope: 'items'` on every item CRUD + `MSG_PROMOTE_TAB` / `MSG_DEMOTE_ITEM` (source: `storage-handlers.js` mutation broadcasts).

`openTabs` membership can change when:

| Event | Scope | Why Open Tabs changes |
|-------|-------|----------------------|
| New external tab opens | `liveState` | New row appears in section |
| Tab closes | `liveState` | Row leaves section |
| Tab URL changes | `liveState` | If a claim attaches, row leaves section; if a claim detaches, row appears |
| Tab focus changes | `liveState` | `active: true` moves to a different row |
| Saved item created from tab (promote) | `items` | Tab is now claimed → row leaves section |
| Saved item deleted (demote) | `items` | Tab is released → row appears (or stays floating-pending) |

Therefore the sidepanel's broadcast listener treats both `liveState` and `items` scopes as triggers to refresh `openTabs` (AC8).

#### Refresh path — reuse `refetchAndPatchLiveState` path, widened

Today `refetchAndPatchLiveState()` re-fetches `MSG_LIST_ITEMS` and patches live-state attributes on saved-item rows (see `sidepanel.js:1002`). For B-055 we widen its responsibility:

```js
async function refetchAndPatchLiveState() {
  const resp = await sendMessage(MSG_LIST_ITEMS);
  _cachedLiveStates = resp.liveStates || {};
  _cachedDriftRecords = resp.driftRecords || {};
  _cachedOpenTabs = resp.openTabs || [];

  // Existing saved-item patch loop — unchanged ...
  // NEW: targeted open-tabs patch
  patchOpenTabsSection(_cachedOpenTabs);
  _updateBulkBar();
}
```

The existing broadcast listener (`sidepanel.js:1451`) already dispatches `refetchAndPatchLiveState()` on `scope === 'liveState'`. For `scope === 'items'` it currently falls through to a full `renderAll()`. That is correct for our case too: a `items` broadcast means a saved item changed, which can cause **both** a `liveStates` keyset shuffle AND an `openTabs` membership change — a full `renderAll()` is the simplest response, and AC16's performance guardrail targets the `liveState` path specifically (where most churn happens).

#### `patchOpenTabsSection` — targeted DOM diff (AC8, AC16)

Full re-renders of the Open Tabs section on every `liveState` broadcast would be expensive at 50 rows. Instead, `patchOpenTabsSection(nextOpenTabs)` does a keyed diff against the existing `<li>` elements (`<li data-tab-id="...">`). Algorithm:

```
1. Build Map<tabId, <li>> from existing DOM children.
2. Build Map<tabId, OpenTab> from nextOpenTabs.
3. For each existing tabId NOT in next map: remove the <li>.
4. For each next tabId NOT in existing map: build and insert a new <li>
   at the correct (windowId, tabIndex) sort position.
5. For each tabId in both: compare fields; patch only what changed
   (title, url, favIconUrl, audible, active attributes).
6. Update the section header count badge and aria-live region.
```

No full section re-render on any single-tab event. Matches the saved-item `refetchAndPatchLiveState` pattern byte-for-byte in spirit.

#### Section empty-state transitions

When `nextOpenTabs.length === 0` after a patch, hide the `<ul>` and show the empty-state block; reverse when the first tab arrives. The section header (`open-tabs-section`) never unmounts — AC4.

### 26.6 Multi-Select Integration (AC12)

#### Row participation

Open-tab rows participate in selection gestures identically to saved-item rows once the `_selectionKeyForRow` primitive (§26.4) is in place:

| Gesture | Open-tab behaviour |
|---------|-------------------|
| Plain click (no selection mode) | Fire click-to-focus (AC6) — no selection toggle. |
| Plain click (selection mode) | Toggle `tab:<id>` in `_selection`; defer via `_pendingClickTimer` so a follow-up dblclick can cancel and focus. |
| Shift+Click | Range-select between `_rangeAnchorId` and target in DOM order. Range can span saved-item and open-tab rows (AC12 "mixed selection"). |
| Ctrl/Cmd+Click | Toggle `tab:<id>` in `_selection`; set `_rangeAnchorId` to new key. |
| Ctrl/Cmd+A | Select all visible rows (saved + open-tab) — `_selectAll` traverses `[data-item-id], [data-tab-id]` both. |
| Escape | `_clearSelection` — unchanged. |

#### Bulk action bar — valid-action intersection

When `_selection` contains any open-tab keys, the bulk bar's visible actions are the intersection of what is valid for every selected row type:

| Selection composition | Close tabs | Move to group | Remove / Delete | Demote |
|----------------------|:----------:|:-------------:|:---------------:|:------:|
| All saved items, all live | ✓ (via tabId lookup) | ✓ (`MSG_BULK_UPDATE_ITEMS`) | ✓ (`MSG_BULK_DELETE_ITEMS`) | ✓ (loop `MSG_DEMOTE_ITEM`) |
| All saved items, some non-live | ✓ (disabled unless ≥1 live) | ✓ | ✓ | ✓ |
| All open tabs | ✓ (always) | ✓ (promote-all path, see below) | — hidden — | — hidden — |
| Mixed (saved + open tabs) | ✓ (closes live saved tabs + open tabs) | ✗ — hidden — (mixed promote+update not in scope) | ✗ — hidden — | ✗ — hidden — |

**Rationale for the mixed "Move to group" hide:** a single bulk action that simultaneously promotes N open tabs (via `MSG_PROMOTE_TAB` per tab — `MSG_BULK_PROMOTE_TABS` does not exist) and updates K saved items (via `MSG_BULK_UPDATE_ITEMS`) is compound. It requires a new bulk-promote handler or sequential dispatch with partial-failure aggregation. Both are new contracts. AC12 says "the intersection of valid actions"; for the mixed case the intersection over the current message set is empty for move-to-group. Deferred to a future backlog item if user demand emerges.

#### "Move to group" for all-open-tabs selection

When every selected row is an open tab, the bulk bar shows "Move to group" (same picker UI as saved-item bulk move). On confirm the sidepanel dispatches `MSG_PROMOTE_TAB` once per selected tabId (sequentially or Promise.all), aggregates partial failures into a toast (matching the existing partial-failure pattern from B-024 §25.6). No new bulk message — `MSG_PROMOTE_TAB` already exists and is the correct primitive.

**Performance note:** at ≤ 50 selected tabs (realistic worst case) this is 50 sequential IPC calls to the SW. Each is O(1) relative to storage. Total ≤ 500ms budget at 10ms/call. Acceptable without introducing a new bulk message for this first version. If demand appears, `MSG_BULK_PROMOTE_TABS` can be added later as a pure optimisation.

#### Close tabs for mixed selection

"Close tabs" with a mixed selection closes:
- Every open-tab in the selection (directly via their `tabId`).
- Every saved-item in the selection whose `_cachedLiveStates[itemId].tabId` is defined (via the same `MSG_CLOSE_TABS` call).

`MSG_CLOSE_TABS` already accepts `{tabIds: number[]}`. The sidepanel collects both lists into one array and dispatches once. `MSG_CLOSE_TABS` does not broadcast `scope: items` (tabs.onRemoved broadcasts `scope: liveState` asynchronously — see `storage-handlers.js:340`), which correctly triggers the open-tabs section to re-fetch and the closed tabs to disappear.

### 26.7 R2 Correctness Checklist

| # | Check | Status | Reasoning |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | **N/A (PASS)** | No new partition. No new field on any persisted shape. `OpenTab` is an in-memory/wire-only shape derived at read time from `LiveTabIndex` + `claimsMirror`. `KNOWN_VERSION` unchanged. No migration. The `title` field added to `LiveTabIndex` entries is in-memory only (B-010's `LiveTabIndex` is never persisted — see §10.5 / AC4 of B-001c). |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` typedef is updated to document the new `openTabs: OpenTab[]` field and the `OpenTab` shape. The `MSG_LIST_ITEMS` string constant is unchanged (same wire identity). `MSG_NAVIGATE_TO_ITEM` typedef is widened to document both `{itemId}` and `{tabId, windowId}` variants; payload validation is explicit in the handler (throws `ERR_VALIDATION` on malformed variants). No new `MSG_*` constant introduced. |
| C-3 | Service worker cold-start safe | **PASS** | `buildOpenTabs()` short-circuits to `[]` when `!isClaimsReady()`, so cold-open cannot leak saved items into the section. A `MSG_STATE_CHANGED {scope: liveState}` broadcast fires after `reconcileClaims()` completes (existing B-050 path), prompting the sidepanel to refetch. No assumption of in-memory SW state beyond what's already guaranteed by `readyPromise` gating at the dispatcher. Handler never throws on empty index / empty mirror. |
| C-4 | ID stability | **PASS** | `tabId` and `windowId` are explicitly documented (in both the `OpenTab` typedef and §26.2) as ephemeral — not stable across browser restart. The feature never persists either value. Saved-item identity (stable uuid) flows through the saved-items path unchanged. The prefixed selection keys (`tab:<number>`) are UI-only, lifetime-bounded by the sidepanel session, and pruned by `_reapplySelection` + the partial-success silent prune in bulk actions. No durable reference to an ephemeral id leaks into storage, messages beyond the `MSG_LIST_ITEMS` response, or the broadcast payload. |
| C-5 | Manifest file references resolvable | **N/A (PASS)** | No `manifest.json` changes. No new `default_path`, no new `chrome_url_overrides` entry, no new `commands`. Existing `sidepanel.html` / `sidepanel.js` references are unaffected. |

### 26.8 Rollback Plan

No schema change, no permission change, no data migration — rollback is a straightforward `git revert` of the B-055 commits. Specifically:

- Reverting the `shared/messages.js` typedef addition has no runtime effect (typedefs are JSDoc comments).
- Reverting the `storage-handlers.js` changes (`openTabs` assembly in `MSG_LIST_ITEMS`, tabId-only branch of `MSG_NAVIGATE_TO_ITEM`, broadcast suppression for the tabId-only variant) returns the dispatcher to its Sprint 12 shape. Any in-flight `MSG_NAVIGATE_TO_ITEM` call from a stale sidepanel with `{tabId, windowId}` would fall through to the `!p.itemId` validation and return `ERR_VALIDATION` — benign.
- Reverting `background/tabs/live-tab-index.js` drops `title` from entries. Saved-item rendering is unaffected (titles come from `Item.title`).
- Reverting the `sidepanel/sidepanel.js` changes removes the Open Tabs section, `_cachedOpenTabs`, `_selectionKeyForRow` / `_partitionSelection`, and the bulk-bar action intersection logic. The sidepanel returns to its pre-B-055 shape with identical saved-items UX.
- No cleanup of `chrome.storage.local` / `chrome.storage.session` needed — nothing was written.

### 26.9 Out-of-Scope — Reconfirmed from AC17

The following are explicitly **not** in scope for B-055. Implementing any of them would be scope creep:

- User-defined reordering of rows within the section (would require persistence — deferred).
- Cross-window drag of open-tab rows.
- Bulk "Save all open tabs" single-click action.
- "Open in new window" context-menu action (deferred to B-035).
- Full group-picker modal (use simplified inline picker if B-029 has not shipped).
- `MSG_BULK_PROMOTE_TABS` bulk message (the per-tab loop via existing `MSG_PROMOTE_TAB` is acceptable at the 50-row target — see §26.6).
- Alternative sort modes (recency, alphabetical) — AC9 locks in `(windowId asc, tabIndex asc)`.

### 26.10 Flagged Risks

**None warrant a tier upgrade to Spike-First (XL).** All architectural decisions above are local refinements of existing infrastructure; no foundational primitive is being introduced or reversed. Specifically:

- No new storage partition, no new message constant, no new manifest permission — the three most common XL-escalation triggers are all absent.
- `LiveTabIndex` widening (`title` field) is a one-field additive change to an in-memory, ephemeral, never-persisted structure.
- The `_selection` prefixed-key migration is mechanical and testable in isolation.
- The `MSG_NAVIGATE_TO_ITEM` variant is a narrow refactor of an existing handler, with explicit broadcast suppression and explicit typedef documentation.

**Medium-severity risks tracked (not blockers):**

1. **Open-tab row churn during heavy browsing sessions.** A user with 200+ open tabs plus rapid navigation could generate a high rate of `MSG_STATE_CHANGED {scope: liveState}` broadcasts. The `patchOpenTabsSection` keyed diff bounds DOM work per broadcast to O(Δ) where Δ is the changed-row count; the AC16 50-row performance budget should hold. If UAT reveals jank, a debounce wrapper in `refetchAndPatchLiveState` is a simple follow-up (out of scope for B-055).
2. **Tab title updates without a `tab.onUpdated changeInfo.title` field.** In some Chromium versions, title changes may not set `changeInfo.title` (the change is inferred from `chrome.tabs.query`). The [frontend-engineer] should verify `tab-events.js onUpdated` triggers on title mutations, else add a `chrome.tabs.onUpdated` listener that polls `tab.title` on any update. Falls back gracefully: a stale title is cosmetic, not a correctness issue.
3. **Mixed-selection "Move to group" hidden** may confuse users who expect the action to be available. Empty-intersection rule is explicit in §26.6; acceptable tradeoff vs. introducing a new bulk-promote message this sprint. Documented for the [technical-writer] to call out in R7 user manual.

No SEV1/SEV2 risks identified. Proceed to R3 build.

### 26.11 Handoff Notes for [frontend-engineer]

**File touchpoints:**

- `shared/messages.js` — add `OpenTab` typedef; widen `ListItemsResponse` typedef; document `MSG_NAVIGATE_TO_ITEM` variants.
- `background/tabs/live-tab-index.js` — add `title` field to entry shape; populate from `tab.title` in `buildLiveTabIndex()` and `updateTabEntry()`.
- `background/tabs/tab-events.js` — ensure `onUpdated` propagates `changeInfo.title` into `updateTabEntry` and fires `liveState` broadcast.
- `background/messages/storage-handlers.js` — add `openTabs` to `MSG_LIST_ITEMS` response; add tabId-only branch to `MSG_NAVIGATE_TO_ITEM`; suppress its broadcast.
- (optional) `background/tabs/open-tabs.js` — new helper module hosting `buildOpenTabs()` if inline clutter argues for extraction.
- `sidepanel/sidepanel.js` — add `_cachedOpenTabs`; refactor selection to prefixed keys (`_selectionKeyForRow`, `_partitionSelection`); add `buildOpenTabsSection` and `patchOpenTabsSection`; call them from `renderAll` and `refetchAndPatchLiveState`; widen `_updateBulkBar` to compute the valid-action intersection; wire context-menu actions (Close tab → `MSG_CLOSE_TABS`, Save to group → `MSG_PROMOTE_TAB`).
- `sidepanel/sidepanel.html` — minor: ensure the list container is structured so the Open Tabs section can be appended as a sibling (the existing `itemListEl` is already compatible).
- `sidepanel/sidepanel.css` — style the `data-live-only` row, section header/count badge, empty-state block matching B-049 pattern.
- `tests/enriched-list-items.test.js` — already-modified file in working tree; extend to cover the `openTabs` field on the enriched response.

**Order of implementation suggestion (smaller first):**

1. `shared/messages.js` typedef updates (no runtime effect — cheap to commit, clear intent for reviewers).
2. `LiveTabIndex` widening with `title` — isolated; covered by existing `tabs/` tests.
3. `storage-handlers.js` — `openTabs` assembly + `MSG_NAVIGATE_TO_ITEM` variant + broadcast suppression. Unit tests first (TDD-friendly).
4. `sidepanel.js` — selection key refactor (before the section render, so the section drops cleanly into an already-generalised selection model).
5. `sidepanel.js` — `buildOpenTabsSection` + `patchOpenTabsSection` + broadcast wiring.
6. `sidepanel.js` — bulk-bar valid-action intersection + context menu.
7. CSS + empty-state polish.
8. Test coverage (unit + integration via chrome-mock) and UAT.

**Non-obvious gotchas:**

- Broadcast suppression for the `MSG_NAVIGATE_TO_ITEM` tabId-only variant is load-bearing — without it, every open-tab click fires a spurious `scope: items` broadcast, which triggers a full `renderAll()` in every open surface, defeating the AC16 performance guardrail.
- `_selection` prefixed keys must be migrated **atomically** — a partial refactor where half the call sites write bare `itemId` and the other half write `item:<id>` will produce very confusing bugs. Use a single commit for the prefix rename.
- The `_cachedOpenTabs` order is display order (sorted by `(windowId, tabIndex)`). `patchOpenTabsSection` must respect that order when inserting new rows — use the sorted array's index to find the correct insertion point rather than appending.
- `chrome.tabs.get(tabId)` is NOT called from the UI click path — `chrome.tabs.update(tabId, {active: true})` goes through `MSG_NAVIGATE_TO_ITEM`, which does the SW-side lookup in `LiveTabIndex` before the chrome API call. This keeps sender validation (`sender.id === chrome.runtime.id`) on the tab-focus path.

### 26.12 Build Outcome (R6 Close)

Sprint 13 closed 2026-04-17. B-055 shipped alongside three Fast-Track siblings (B-028, B-047, B-051). UAT PASS across all three blocks (16/16 tested, 2 AC14 safe-mode cases SKIPPED and verified by code review per §26.12.5). This subsection captures what was actually built, where the implementation deviated from §26.1–26.11, and the invariants future work must preserve. It is additive — it does NOT supersede the R2 design above; the R2 text is the contract, this text is the delivery record.

#### 26.12.1 Deviations from R2

The implementation matched the R2 design almost byte-for-byte. Two planned refactors were promoted from "noted in handoff" to "committed as load-bearing primitives," and one implementation detail was tightened during R4 remediation.

1. **Open Tabs helper extracted to a dedicated module.** §26.3 marked `background/tabs/open-tabs.js` as "optional … if inline clutter argues for extraction." The [frontend-engineer] extracted it. Rationale: `buildOpenTabs()` has three distinct inputs (`LiveTabIndex`, `claimsMirror`, `isClaimsReady`), is test-target-worthy in isolation, and is the natural counterpart to `live-tab-index.js` / `tab-claims.js`. The dispatcher in `storage-handlers.js` imports `buildOpenTabs` and calls it inside the `MSG_LIST_ITEMS` branch. The module performs no storage writes (confirmed by R4 M-7 test coverage).
2. **Safe-mode classification refactored into a `Set` + predicate.** §26.4 implied per-case decisions inside the dispatcher's safe-mode branch. R4 surfaced a correctness bug (AC14 violation — `MSG_CLOSE_TABS` and tabId-only `MSG_NAVIGATE_TO_ITEM` were blocked despite performing no storage write) and the remediation collapsed the classification into `WRITE_MESSAGE_TYPES: Set<string>` plus `isWriteType(message)` predicate (`background/messages/storage-handlers.js:109–124`). `MSG_CLOSE_TABS` is now unconditionally allowed in safe mode (pure tab operation, no storage mutation). `MSG_NAVIGATE_TO_ITEM` is write-classified **only when `message.payload?.itemId !== undefined`** (the itemId branch bumps `lastAccessedAt`). The tabId-only variant is a pure tab focus and passes through safe mode. This is the canonical mechanism — future write/read message additions edit the `Set` or extend `isWriteType`.
3. **Parallel cache mirrors added for O(1) lookups.** §26.4 settled on `_cachedOpenTabs: OpenTab[]`. The build added `_cachedOpenTabsById: Map<number, OpenTab>` beside it (`sidepanel/sidepanel.js:118–128`) to eliminate the O(n²) filter pass flagged as R4 M-1. Both caches are always assigned together via the new `_setCachedOpenTabs(next)` helper — callers MUST use the helper, direct writes to `_cachedOpenTabs` would desync the mirror. Same invariant applied to the `_setRowSelected(row, selected)` helper (`sidepanel/sidepanel.js:670–679`) which keeps `data-selected` (CSS) and `aria-selected` (assistive tech) in lock-step per AC15 / R4 M-4.

None of the above changes contract shapes. Every deviation is a refinement internal to its subsystem.

#### 26.12.2 New contracts finalized

**Wire contracts (shared/):**

- `MSG_LIST_ITEMS` response extended with `openTabs: OpenTab[]` (§26.2). Empty array `[]` — never null/undefined. The `OpenTab` typedef in `shared/messages.js` is the source of truth: `{tabId, windowId, title, url, favIconUrl|null, audible, active, tabIndex}`. `tabId` / `windowId` explicitly documented as ephemeral.
- `MSG_NAVIGATE_TO_ITEM` accepts two payload variants documented in `shared/messages.js` typedef:
  - `{itemId: string}` — navigates to a saved item, may open a new tab, bumps `lastAccessedAt`, broadcasts `SCOPE.ITEMS`, write-classified in safe mode.
  - `{tabId: number, windowId: number}` — focuses an existing live tab, zero storage writes, suppresses its broadcast, passes through safe mode. Requires both fields; missing `windowId` throws `ERR_VALIDATION`.
- `MSG_CLOSE_TABS` is now unconditionally allowed in safe mode. This was implicitly broken in v1.7.0 (AC14 regression B-055 H-1 fixed in this sprint). Callers should treat safe-mode + close-tabs as a supported path.

**Shared modules (per "Shared File Governance" in CLAUDE.md):**

- `shared/errors.js` — **canonical** home for `StorageError`, `ERR_*` constants. `background/storage/errors.js` is now a re-export shim. This flags cross-boundary (SW ⇄ sidepanel) ownership: any new `ERR_*` code must be added here, not in the background shim. R4 H-4 consolidated the last string-literal error-code comparisons in `sidepanel.js` against these constants.
- `shared/selection.js` — **new** cross-boundary module. Exports `pruneSelection(selection: Set<string>, items: Array<{id}>): Set<string>`. Pure, zero storage deps. Imported by `sidepanel/sidepanel.js` and wired into `_pruneStaleSelection()` which runs at the top of every bulk-action entry point (`_bulkRemove`, `_bulkMoveToGroup`, `_bulkClose` — `sidepanel/sidepanel.js:2078, 2175, 2204`). Only `item:*` keys are pruned; `tab:*` keys are self-cleaning via `tabs.onRemoved` → `MSG_STATE_CHANGED` re-render.
- `shared/messages.js` — `MUTATION_BROADCASTS[MSG_NAVIGATE_TO_ITEM] = SCOPE.ITEMS` unchanged; the dispatcher's post-dispatch broadcast is gated by the tabId-only suppression block (`storage-handlers.js:459–472`). The contract is: the broadcast map declares the upper bound of what a type MAY broadcast; runtime suppression narrows it on a per-payload basis.

**UI primitives (sidepanel only — flagged so future items don't re-invent):**

- `_selectionKeyForRow(row)` → `'item:<uuid>' | 'tab:<number>' | null` — every write into `_selection` goes through this.
- `_rowForSelectionKey(key)` → `HTMLElement | null` — companion for focus-restore and post-broadcast re-application.
- `_partitionSelection()` → `{itemIds: string[], tabIds: number[]}` — every bulk-action read of `_selection` goes through this.
- `_setRowSelected(row, boolean)` — every toggle of `data-selected` goes through this; pairs with `aria-selected`.
- `_setCachedOpenTabs(next)` — single writer for both `_cachedOpenTabs` and `_cachedOpenTabsById`.
- `_pruneStaleSelection()` — front door for `shared/selection.js` usage on the sidepanel side.

#### 26.12.3 Sibling integration notes

- **B-028 (Selection context menu, Fast Track S).** Right-click while multi-selection active opens a selection-aware menu with Move-to-group / Close tabs / Remove actions. Reuses B-026 menu infrastructure. The build extracted bulk-bar handlers into `_bulkMoveToGroup`, `_bulkClose`, `_bulkRemove` helpers so the bar and the context menu share a single code path. These helpers are the ones `_pruneStaleSelection` now guards. Tests in `tests/b028-selection-context-menu.test.js` (12 tests).
- **B-047 (In-panel keyboard shortcuts, Fast Track XS).** **Zero production code changes.** R3 was a verify-only audit confirming Ctrl/Cmd+A, Escape, and text-input guards already met all 3 ACs via B-024's handlers. 17 regression tests added to `tests/b024-multi-select.test.js`; 5 of those added during R4 remediation to cover the open-tab mixed-row path and dialog-open Escape guard. No architectural impact — the item is a pure test-coverage hardening.
- **B-051 (Sort-order normalisation & selection pruning, Fast Track S).** Added `normaliseGroupSortOrders(groupId, items)` in `background/storage/items.js` with an idempotent fast-path (already-sequential buckets short-circuit with zero writes). Wired into every create / bulk-create / bulk-update / delete path (`items.js:201, 277, 389, 534, 536`). Also introduced `shared/selection.js :: pruneSelection` and the sidepanel wiring described in §26.12.2. The B-055 M-4 wiring satisfies AC3.

#### 26.12.4 Safe-mode classification contract (post-R4)

The R4 remediation produced a crisp, testable invariant: **a message type is write-classified iff it performs a `chrome.storage.*` mutation.** Pure tab operations (`MSG_CLOSE_TABS`, tabId-only `MSG_NAVIGATE_TO_ITEM`) are NOT write-classified. Read operations (`MSG_LIST_*`, `MSG_GET_*`, `MSG_GET_PREFERENCES`) are not write-classified.

The mechanism:

```js
// background/messages/storage-handlers.js:109–124
const WRITE_MESSAGE_TYPES = new Set([
  MSG_CREATE_ITEM, MSG_UPDATE_ITEM, MSG_DELETE_ITEM,
  MSG_BULK_CREATE_ITEMS, MSG_BULK_DELETE_ITEMS, MSG_BULK_UPDATE_ITEMS,
  MSG_CREATE_GROUP, MSG_UPDATE_GROUP, MSG_DELETE_GROUP,
  MSG_SET_PREFERENCES, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM,
]);

function isWriteType(message) {
  if (WRITE_MESSAGE_TYPES.has(message.type)) return true;
  if (message.type === MSG_NAVIGATE_TO_ITEM) {
    return message.payload?.itemId !== undefined;
  }
  return false;
}
```

Rules for future additions:

1. A new pure-storage-write message type → add the constant to `WRITE_MESSAGE_TYPES`.
2. A new pure-tab-op or read message type → do NOT add it. No change.
3. A new dual-variant message (payload-shape-dependent classification) → add a branch to `isWriteType()` mirroring the `MSG_NAVIGATE_TO_ITEM` pattern. The predicate must be payload-aware but side-effect-free.

This pairs with the broadcast-suppression clause at `storage-handlers.js:459–472`: the dispatcher broadcasts `MUTATION_BROADCASTS[message.type]` unless the payload shape marks the call as a no-op on storage. The two mechanisms (safe-mode gate, broadcast suppression) share the same "which variant is this?" logic.

#### 26.12.5 R2 Correctness Checklist revisited (post-build verification)

Same grid as §26.7, re-verified after R3/R4/R5:

| # | Check | Post-build status | Evidence |
|---|-------|------------------|----------|
| C-1 | Storage schema versioned | **PASS (N/A)** — no persistence. | `buildOpenTabs()` is derived in-memory from `LiveTabIndex` + `claimsMirror`. No new partition, no `KNOWN_VERSION` bump, no migration. The R4 M-7 test in `tests/enriched-list-items.test.js` spies on `chrome.storage.local.set` during open-tabs rendering and asserts zero writes. |
| C-2 | Message contracts typed | **PASS** | `shared/messages.js` `ListItemsResponse` typedef includes `openTabs: OpenTab[]`. `MSG_NAVIGATE_TO_ITEM` typedef documents both variants. Payload validation is explicit at the handler boundary (`ERR_VALIDATION` on malformed variants). No new `MSG_*` string constants introduced. |
| C-3 | Service worker cold-start safe | **PASS** | `buildOpenTabs()` short-circuits to `[]` when `!isClaimsReady()` (`background/tabs/open-tabs.js:34`). `MSG_LIST_ITEMS` dispatch awaits `readyPromise` before calling. The existing `liveState` broadcast path re-triggers sidepanel refetch after `reconcileClaims()` completes. Tests for the cold-start branch in `tests/enriched-list-items.test.js`. |
| C-4 | ID stability | **PASS** | `tabId` / `windowId` documented as ephemeral in both the `OpenTab` typedef and §26.2. Nothing persists them. `tab:*` selection keys are UI-lifetime-bounded and never written to storage. `_pruneStaleSelection` keeps `item:*` keys in sync with live saved-item ids on every bulk-action entry. No durable reference to an ephemeral id leaks into storage, message payloads beyond the wire `MSG_LIST_ITEMS` response, or broadcast metadata. |
| C-5 | Manifest file references resolvable | **PASS (N/A)** — no `manifest.json` changes. | No new `default_path`, no new `chrome_url_overrides`, no new `commands`, no new permissions. Existing `sidepanel.html` / `sidepanel.js` entries unaffected. |

All five checks pass. No regressions against R2.

#### 26.12.6 UAT outcomes and follow-ups

UAT executed by [test-engineer] in R5. Results recorded in `docs/SPRINT.md` Sprint 13 "Completed This Sprint" section:

- **B-055**: PASS (16/16 tested, 2 AC14 safe-mode cases SKIPPED — require manual storage corruption to reproduce, code path verified by review).
- **B-028, B-047, B-051**: all implicit-verified inside B-055 UAT blocks (Block 3 step 16 for B-028, Block 3 keyboard interactions for B-047, Block 2 step 9 promote flow for B-051).

Interactive UAT surfaced two product-design questions that were promoted to new backlog items (both scheduled for Sprint 14):

- **B-056 — Visually distinguish unsavable tabs.** Tabs with restricted URL schemes (`chrome://`, `about:`, `chrome-extension://`, `file:`) and tabs with URLs that duplicate an existing saved item are currently indistinguishable from savable tabs in the Open Tabs section. The "Save to group" action fails at dispatch time with `ERR_VALIDATION` / `ERR_DUPLICATE_URL` — fine, but UX-discoverability is poor. B-056 adds inline visual affordances (dim, badge, or disabled "Save" affordance).
- **B-057 — SPIKE: URL-scheme allowlist + duplicate-URL policy review.** Current allowlist is implicit (`promoteTab` rejects a hard-coded scheme list). The spike will audit every promote/save path, define the canonical allowlist in one place, and evaluate whether duplicate-URL detection should prompt "switch to existing saved copy" instead of rejecting.

Mid-UAT defect fix (in-sprint, not deferred): the `_bulkMoveToGroup` toast for all-open-tabs selection was too vague ("Couldn't save N tabs — check URL scheme or duplicates"). Replaced with a categorised toast that counts `ERR_DUPLICATE_URL` vs `ERR_VALIDATION` vs other failures — matching the single-tab context-menu path's per-error messaging (`sidepanel/sidepanel.js:2220–2235`). This pattern should be the template for any future bulk action that fans out via `Promise.allSettled`.

#### 26.12.7 Rollback plan

**No schema change, no new permissions, no persisted state — rollback is a clean `git revert` of the Sprint 13 commit(s).**

Specifically:

- Reverting `shared/messages.js` typedef additions has no runtime effect.
- Reverting `background/messages/storage-handlers.js` drops `openTabs` assembly, the tabId-only `MSG_NAVIGATE_TO_ITEM` branch, the broadcast-suppression clause, and the `WRITE_MESSAGE_TYPES` Set / `isWriteType` predicate. Safe-mode gate reverts to its prior per-case logic. Any in-flight stale sidepanel call with the new payload shape falls through to `ERR_VALIDATION` — benign.
- Reverting `background/tabs/live-tab-index.js` removes the `title` field. Saved-item rendering unaffected (titles come from `Item.title`). Open Tabs rows disappear with the sidepanel revert.
- Reverting `background/tabs/open-tabs.js` deletes the module. Reverting the two new `tab/created` and `tab/title-changed` broadcasts in `tab-events.js` returns live-state broadcast to its Sprint 12 shape.
- Reverting `sidepanel/sidepanel.js` removes the Open Tabs section, `_cachedOpenTabs*`, prefixed selection keys, bulk-bar action intersection logic, `_pruneStaleSelection` wiring, and the `shared/errors.js` / `shared/selection.js` imports. Sidepanel returns to Sprint 12 saved-items-only UX.
- Deleting `shared/selection.js` is safe — it is imported only by the sidepanel, which reverts in lockstep.
- `shared/errors.js` cannot be deleted (existing SW imports depend on the re-export shim in `background/storage/errors.js`). Roll it back to its Sprint 12 content; the sidepanel imports vanish with the sidepanel revert.

**No `chrome.storage.local` / `chrome.storage.session` cleanup required** — nothing was ever written. No migration is needed and no user-visible data loss can occur on rollback.

#### 26.12.8 Files changed (reference)

Complete list (also recorded in `docs/SPRINT.md`):

- `shared/messages.js` — `OpenTab` typedef, `ListItemsResponse` widened, `MSG_NAVIGATE_TO_ITEM` variant documentation.
- `shared/errors.js` — now canonical; exports `ERR_SAFE_MODE`, `ERR_DUPLICATE_URL` consumed by sidepanel.
- `shared/selection.js` *(new)* — `pruneSelection` helper.
- `background/tabs/open-tabs.js` *(new)* — `buildOpenTabs` helper.
- `background/tabs/live-tab-index.js` — `title` field added to entry shape, `buildLiveTabIndex` / `updateTabEntry` populate it.
- `background/tabs/tab-events.js` — `changeInfo.title` propagation, `tab/created` + `tab/title-changed` live-state broadcasts with co-event suppression to prevent double-patch.
- `background/messages/storage-handlers.js` — `openTabs` in `MSG_LIST_ITEMS` response, tabId-only `MSG_NAVIGATE_TO_ITEM` branch (with try/catch per R4 M-3), `WRITE_MESSAGE_TYPES` Set + `isWriteType`, broadcast suppression for tabId-only navigate.
- `background/storage/items.js` — `normaliseGroupSortOrders` helper and wiring (B-051).
- `sidepanel/sidepanel.js` — all B-055 / B-028 / B-051 sidepanel changes (see §26.12.2 primitive list).
- `sidepanel/sidepanel.css` — Open Tabs section styles, `data-live-only` row styling.
- `tests/` — `enriched-list-items.test.js`, `live-tab-index.test.js`, `b010-live-state.test.js`, `b024-multi-select.test.js`, `navigate-to-item.test.js` (extended); `b028-selection-context-menu.test.js`, `b051-normalisation.test.js`, `b005-bulk-create.test.js` (new/updated).

