# §39 — B-022 Quick Search Popup (R2 Design)

**Sprint:** 26
**Tier:** Full (L)
**Status:** R2 complete (2026-04-22) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §19 (B-021 filter + highlight), §26 (B-055 Open Tabs section + `openTabs` wire field), §34 (B-052 `_searchIndex` + `search-index.js` module), §28 (B-014 windowMap for window badge), §10.10 (broadcast)
**Out-of-scope (explicit):** B-023 group-jump popup, B-035 standalone window, custom shortcut UI, search history, typeahead autocomplete, drag-drop within popup, bulk selection within popup.

---

## §39.1 Overview

B-022 adds a quick-search popup, opened by Alt+J (manifest `_execute_action`), that fuzzy-filters saved bookmarks + live open tabs in a single list with two labelled sections, full keyboard navigation, safe `<mark>` match highlighting, and a small persistent recency store (cap 50) used as the empty-query default view. The popup is a standalone extension surface rendered from `popup/popup.html` with its own ES module (`popup/popup.js`) and CSS (`popup/popup.css`); it reuses the §34 `search-index.js` module verbatim for substring matching over saved items and consumes the existing §26 `openTabs` array via `MSG_LIST_ITEMS`. No new manifest permissions, no new message-type string constants beyond one (`MSG_RECENCY_ADD`), one new `chrome.storage.local` partition (`tj:recency`) with v1 schema, cap-50 LRU trim on write. The popup is purely navigational — it creates tabs or focuses existing ones; it never mutates items, groups, or preferences.

## §39.2 Reuse Surface

The feature is reuse-heavy by design — almost every load-bearing primitive already ships.

| Surface | Source | How B-022 consumes it |
|---|---|---|
| `buildIndex(items)` + `search(index, query)` + `entryMatches(entry, q)` | `sidepanel/search-index.js:134-347` — B-052 §34.3 / §34.6 | Popup imports the module at load. On opening, once `MSG_LIST_ITEMS` resolves, the popup builds its own popup-scoped `_searchIndex` from `resp.items` — the popup does NOT share the sidepanel's live index (the two surfaces may be open independently; sharing would require cross-context IPC). Build cost at 1000 items ≈ 1 ms; measured in §34.8. |
| `openTabs: OpenTab[]` on `MSG_LIST_ITEMS` response | `shared/messages.js:194-231` + §26.2 | Consumed verbatim. Popup also builds a parallel flat array `_openTabIndex: Array<{tabId, windowId, titleLower, urlLower, title, url, favIconUrl, active, audible, tabIndex}>` to mirror the pre-lowercased structure of `_searchIndex`. |
| `buildHighlightedText(text, query)` DocumentFragment helper | `sidepanel/sidepanel.js:1369-1393` — §19.3 | **Promoted to `shared/highlight.js`** by this item. DRY move: the popup consumes the same helper; the sidepanel imports it from the new shared location. Preserves B-021 semantics byte-for-byte (zero behaviour change). No callers outside sidepanel/popup. |
| `MSG_LIST_ITEMS` message | `shared/messages.js:14` + dispatcher at `background/messages/storage-handlers.js` | Single round-trip at popup open. Returns `{items, liveStates, driftRecords, openTabs, windowMap}`. Popup ignores `driftRecords` (not shown in row) and uses `liveStates` only for the saved-vs-live activation branch at Enter. |
| `MSG_NAVIGATE_TO_ITEM` two-variant payload | `shared/messages.js:234-241` + §26.4 tabId branch | Popup invokes variant (a) `{itemId}` for saved-not-open, variant (b) `{tabId, windowId}` for open-tab rows and for saved+live rows routed via `openTabs`. Broadcast suppression for variant (b) — already in place per §26.12.4. |
| Broadcast listener pattern | §10.10 | Popup does NOT subscribe to `MSG_STATE_CHANGED` — session is short and single-fetch on open is sufficient. Rationale in §39.4.4. |
| Window ordinal badge | §28 `windowMap` | Popup renders the live-tab row's window badge as `W{ordinal}` using `resp.windowMap[String(tab.windowId)]` when `ordinal > 1`; suppressed when ordinal is 1 or the map lacks the key. Matches sidepanel §28 usage. |

**Not reused:** the sidepanel DOM itself, `_cachedItems` caches, `applyFilter()`, `renderAll()`. The popup has its own independent JS state.

## §39.3 Decision Resolutions (D-1 through D-6)

### D-1 — Popup lifecycle: `default_popup` (chosen) vs `chrome.action.openPopup()` (rejected)

**Choice:** `default_popup` in `manifest.json:18`. Already registered and pointing at `popup/popup.html` (stub from Sprint 1). Works identically in Chrome and Edge when the user presses Alt+J (via the `_execute_action` command binding) or clicks the action icon.

**Alternatives:**
- `chrome.action.openPopup()` programmatic — MV3 supports it but with caveats: (a) in Edge it historically requires an explicit user gesture and a registered default popup anyway, so the programmatic path adds no capability; (b) we would need an SW-side keybinding handler for `commands.onCommand` that invokes it, doubling the control plane; (c) the SW context cannot guarantee `chrome.action.openPopup()` fires synchronously from a cold start.
- **Edge compat verdict:** `default_popup` + `_execute_action` is the Edge-native path. Existing v1.19.0 ship of `default_popup = popup/popup.html` stub has not surfaced Edge compat issues.

**Rationale:** simplest, works everywhere, zero SW code required for the open path.

**Blast radius if wrong:** if Edge ever degrades `_execute_action` handling for popups, fallback is to add `commands.onCommand` listener in the SW that calls `chrome.action.openPopup()`. Additive, reversible, no storage impact.

### D-2 — Shortcut path: `_execute_action → Alt+J` (chosen)

**Choice:** no change to `manifest.json`. The binding is already present:

```json
"commands": {
  "_execute_action": { "suggested_key": { "default": "Alt+J" }, "description": "Open quick search popup" },
  "_execute_side_panel": { "description": "Open side panel" },
  "open-junkie-window": { "suggested_key": { "default": "Alt+Shift+J" }, "description": "Open Tab Junkie window" },
  "group-jump": { "suggested_key": { "default": "Alt+K" }, "description": "Jump to group" }
}
```

**Conflict check:**
- `_execute_side_panel` has no `suggested_key` — no collision.
- `open-junkie-window` uses `Alt+Shift+J` — different chord, no collision.
- `group-jump` uses `Alt+K` — different key, no collision.
- Edge: `_execute_action` fires the popup (`default_popup`), not the side panel.

**User override:** `edge://extensions/shortcuts` (Chrome: `chrome://extensions/shortcuts`) surfaces all four bindings for remapping. AC1 documents this.

**Rationale:** reuses the Sprint 19 registration. Zero new surface area. Blast radius zero.

### D-3 — Recency tracking storage: option (a) `chrome.storage.local` partition `tj:recency` (chosen)

**Choice:** new partition `tj:recency`, schema v1, cap 50, in `chrome.storage.local`.

**Schema (JSDoc):**

```js
/**
 * @typedef {Object} RecencyEntry
 * @property {string} id
 *   'item:<itemUlid>' for saved-bookmark access, 'url:<encodedUrl>' for
 *   open-tab-only access. Prefix discriminates the resolution strategy at
 *   read time.
 * @property {number} accessedAt
 *   Unix ms. Monotonic; ties broken by array position (LRU trim preserves
 *   insertion order within the same ms).
 */

/**
 * @typedef {Object} RecencyPartition
 * @property {1} schemaVersion
 * @property {RecencyEntry[]} entries
 *   Newest-first. Max 50 entries; writes that push the array beyond 50
 *   trim the tail in a single splice.
 */

const PARTITION_RECENCY = 'recency';      // key: 'tj:recency'
const RECENCY_CAP = 50;
const RECENCY_SCHEMA_VERSION = 1;
```

**Cost/benefit:**
- Persistent across browser restart — recency survives the user's primary failure mode (close browser, reopen next day).
- One write per successful Enter. Writes are coalesced at most once per keypress (not batched).
- SW-side handler required (`MSG_RECENCY_ADD`); see C-2. Read is popup-side via `chrome.storage.local.get` direct — no message round-trip needed at open time.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `tj:recency` partition in `chrome.storage.local` | Survives restart; fits existing partition model; C-1 clean with v1 schema | Needs a migration runner entry + SW write handler | **Chosen** |
| (b) `chrome.storage.session` | MV3-clean, no migration, no schema version | Cleared on browser close — defeats the empty-query recency value-proposition the very next day | Rejected |
| (c) In-memory only (module-scope variable) | Simplest; zero storage surface | Lost on SW cold-start (which happens every ~30 s of extension idle in MV3) AND on popup close; renders recency mode effectively useless | Rejected |

**ID stability (C-4):** `id` uses `'item:<ulid>'` for saved items — ULID is stable per §3. For open-tab-only accesses we use `'url:<url>'` — `tabId` is ephemeral per §26.12.5 and must NOT be persisted. At read time the popup resolves `'item:*'` ids by lookup against `items` (from MSG_LIST_ITEMS); if the id is absent (item was deleted), the entry is silently dropped from the render list (not the store — store reconciles on the next write). `'url:*'` entries render only if a tab with that URL is currently open; otherwise dropped from the render list. This means the recency list shown to the user may be shorter than 50, which is correct (stale entries suppressed) and explicitly PASS for AC19(c).

**Read-time reconciliation logic (popup.js):**

```js
// Pseudocode
async function loadRecentForRender(items, openTabs) {
  const partition = await chrome.storage.local.get('tj:recency');
  const stored = partition['tj:recency'] ?? { schemaVersion: 1, entries: [] };
  if (stored.schemaVersion !== 1) return []; // unknown future version — degrade gracefully
  const itemById = new Map(items.map((it) => [it.id, it]));
  const tabByUrl = new Map(openTabs.map((t) => [t.url, t]));
  const rendered = [];
  for (const entry of stored.entries) {
    if (entry.id.startsWith('item:')) {
      const it = itemById.get(entry.id.slice(5));
      if (it) rendered.push({ kind: 'saved', item: it, accessedAt: entry.accessedAt });
    } else if (entry.id.startsWith('url:')) {
      const url = entry.id.slice(4);
      const tab = tabByUrl.get(url);
      if (tab) rendered.push({ kind: 'openTab', tab, accessedAt: entry.accessedAt });
    }
    if (rendered.length >= 20) break; // AC13(a): ≤ 20 recent items in the view
  }
  return rendered;
}
```

**Write path:** popup.js invokes `chrome.runtime.sendMessage({type: MSG_RECENCY_ADD, payload: {id}})` immediately after successful navigation (after `chrome.tabs.create` or `chrome.tabs.update` resolve). The SW handler reads the partition, unshifts the new entry, de-dupes against any prior entry with the same id (removes the older copy), trims to cap 50, writes back. Write goes through the existing `writeTransaction` primitive so it is atomic and serialised with other writes.

**Rollback plan:** delete the `tj:recency` key; the partition simply reverts to its default empty shape. No migration DOWN script needed — the schema is additive.

### D-4 — Keyboard model (focus trap + arrow-key interception)

**Choice:**
- **Focus trap:** Tab / Shift+Tab cycle through the query input and the currently-selected result row only. No close button — Escape is the sole dismissal.
- **ArrowDown / ArrowUp:** intercepted at `keydown` on the popup root via `e.preventDefault()` + `e.stopPropagation()`, move the logical selection across result rows. Do NOT preventDefault on `ArrowLeft` / `ArrowRight` — the query input needs them for cursor movement.
- **Enter:** intercepted on the popup root; submits the currently-selected row. `preventDefault()` to stop form submission.
- **Escape:** intercepted on the popup root; calls `window.close()` immediately. Zero storage writes, no recency append (AC11).
- **Home / End / PageUp / PageDown:** NOT intercepted in v1 — left to native behaviour (caret nav in the input). Deferred to follow-up.
- **ArrowDown from empty selection:** sets selection to first row; does NOT move the caret in the input.
- **ArrowUp from first row:** wraps to last row. **ArrowDown from last row:** wraps to first row. AC9.

**Focus management:**
- Popup root carries `tabindex="-1"`. Query input carries native tab-ability (`<input>` default). Result rows are NOT tabbable individually — selection is managed via `aria-activedescendant` on the listbox, not via DOM focus on each row (prevents screen-reader focus-bouncing per established a11y pattern B-048).
- On popup open: programmatic `queryInput.focus()` in `DOMContentLoaded`. Browser may also honour `autofocus` as a belt-and-braces fallback.
- On Escape: `window.close()`; focus returns naturally to the previously-active browser element (handled by the browser, not the popup).

**Rationale:** this keyboard model matches the sidepanel B-021 filter pattern and the B-024 multi-select pattern, both of which survived R4 a11y review. Decoupling selection-state from DOM-focus is the established approach to listbox navigation in Tab Junkie.

**Blast radius:** contained to `popup/popup.js` keydown handler. No shared module impact.

### D-5 — Result ranking + tie-break

**Choice:** two-stage filter → sort.

Stage 1 — filter:
- Saved items: `search(_searchIndex, query)` returns the subset whose `titleLower.includes(q) || urlLower.includes(q)`.
- Open tabs: equivalent loop over `_openTabIndex` — same predicate against `titleLower` / `urlLower`.

Stage 2 — rank within each section (applied independently to the two arrays):
- **Score formula:**
  ```
  score = 0
  if entry.titleLower === q:              score += 1000   // exact title match
  else if entry.titleLower.startsWith(q): score += 500    // title prefix
  else if entry.titleLower.includes(q):   score += 250    // title substring
  if entry.urlLower.includes(q):          score += 100    // url substring bonus
  if recencyRank(entry.id) < 10:          score += (10 - recencyRank) * 5
                                                         // recency boost for top-10 recent items
  ```
- `recencyRank` is a Map built once per open from `RecencyPartition.entries` by id → index. Lookup is O(1).
- **Tie-break:** equal score → recency rank ascending (earlier/more-recent wins) → then stable sort (original index in `_searchIndex` / `_openTabIndex`, which is already title-sorted by B-052 indexing order).

**Proof of <50 ms P95:**
- B-052 filter at 1000 items measured at 0.152 ms P95 (§34.8). Scoring adds one if-chain per entry = ~5 operations × 1000 = sub-ms.
- Sort of ≤50 entries (post-cap) is sub-ms.
- Total P95 budget spent: ~2–3 ms for 1000 items + 50 open tabs. Cap-50 render is ~5 ms DOM. Total well under 50 ms.

**Rationale for not using Fuse.js / typo tolerance:** §34.12 forbids third-party search libs and typo tolerance. B-022 honours that. Substring matching with rank boost is the established contract.

### D-6 — Dedupe: two rows (one per section) when URL is both saved and open

**Choice:** two rows, always. No cross-section dedupe.

Saved-items section is sourced from B-052 `_searchIndex` (backed by `resp.items`). Open-tabs section is sourced from `_openTabIndex` (backed by `resp.openTabs`). Both are filtered independently; the same URL appearing in both produces two rows, one in each section.

**Visual distinction:**
- Bookmarks row: group breadcrumb "Group name ›" in the meta line.
- Open Tabs row: window badge `W2` (when ordinal > 1) + "active tab" indicator if `tab.active`.
- Icon differential: saved rows show a tiny bookmark icon overlay on the favicon; live-only rows show a live-dot indicator. Meets AC12 "label + icon, not color-only".

**Activation paths:**
- Enter on Bookmarks row → `chrome.tabs.update` if the item has a live claim (via `liveStates[item.id].tabId` check), else `chrome.tabs.create({url: item.url})`.
- Enter on Open Tabs row → `chrome.tabs.update(tab.tabId, {active: true})` + `chrome.windows.update(tab.windowId, {focused: true})`.
- Both variants record recency: saved path records `'item:<id>'`, open-tab path records `'url:<url>'`.

**Rationale:** users have two different intents — "jump to my saved version of this page" (opens in correct group breadcrumb context, may open new tab if not live) vs "focus the tab I already have open" (instant focus). Collapsing these into one row strips agency. The Sprint 13 B-055 dedupe debate (§26.12.6) locked this semantic; B-022 inherits it.

## §39.4 Component Structure

### §39.4.1 `popup/popup.html` — DOM skeleton

```
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tab Junkie — Quick Search</title>
    <link rel="stylesheet" href="popup.css" />
    <script type="module" src="popup.js"></script>
  </head>
  <body>
    <div id="qs-root" role="dialog" aria-label="Quick Search" aria-modal="true" tabindex="-1">
      <div id="qs-input-wrap" role="combobox" aria-expanded="false" aria-controls="qs-list" aria-haspopup="listbox">
        <input id="qs-input" type="search" autocomplete="off" spellcheck="false"
               placeholder="Search bookmarks and tabs…"
               aria-autocomplete="list" aria-controls="qs-list" />
      </div>
      <div id="qs-status" role="status" aria-live="polite" aria-atomic="true" class="visually-hidden"></div>
      <div id="qs-results-scroll">
        <ul id="qs-list" role="listbox" aria-label="Results">
          <!-- Sections built by popup.js -->
        </ul>
      </div>
      <div id="qs-empty" hidden role="status">
        <!-- built dynamically: "No results" / "No recent items yet" / "Loading…" -->
      </div>
    </div>
  </body>
</html>
```

### §39.4.2 `popup/popup.js` — module structure

**Modules imported:**
- `../shared/messages.js` — `MSG_LIST_ITEMS`, `MSG_NAVIGATE_TO_ITEM`, `MSG_RECENCY_ADD` (new), `MSG_STATE_CHANGED`.
- `../sidepanel/search-index.js` — `buildIndex`, `search`, `entryMatches` (reused — NOT duplicated).
- `../shared/highlight.js` (new) — `buildHighlightedText(text, query)` promoted from sidepanel.

**State machine (module-scope):**

```js
/** @type {Item[]} */ let _items = [];
/** @type {OpenTab[]} */ let _openTabs = [];
/** @type {Record<string, {windowId?: number, tabId?: number, ...}>} */ let _liveStates = {};
/** @type {Record<string, number>} */ let _windowMap = {};
/** @type {SearchIndex} */ let _searchIndex = null;
let _openTabIndex = [];
/** @type {RecencyEntry[]} */ let _recencyEntries = [];
/** @type {Map<string, number>} */ let _recencyRank = new Map();
/** @type {string} */ let _query = '';
/** @type {number|null} */ let _filterTimer = null;
let _currentRows = [];
/** @type {number} */ let _selectedIndex = -1; // -1 = no selection
/** @type {'loading'|'recency'|'results'|'empty-query-no-recency'|'empty-results'} */ let _mode = 'loading';
```

**Event handlers:**
- `DOMContentLoaded` — focus query input, dispatch `loadInitial()`.
- `loadInitial()` — async: `sendMessage(MSG_LIST_ITEMS)` + `chrome.storage.local.get('tj:recency')` in parallel via `Promise.all`. On resolve, build `_searchIndex`, `_openTabIndex`, `_recencyEntries`, set `_mode = 'recency'` (or `'empty-query-no-recency'` if empty), call `render()`.
- `qs-input` `input` event — set `_query`; `clearTimeout(_filterTimer)`; `_filterTimer = setTimeout(applyFilter, 120)`. Debounce: 120 ms.
- `qs-root` `keydown` — switch on `e.key`: ArrowDown/Up (preventDefault, move selection, wrap), Enter (preventDefault, activate), Escape (preventDefault, `window.close()`), Tab (allow native).
- Row `click` — activate the clicked row (same path as Enter).
- Row `mouseenter` — set selection to hovered row (mouse + keyboard coexist).

**Message surface:**

```js
// Outbound (popup → SW):
//   MSG_LIST_ITEMS          (reused — B-055)
//   MSG_NAVIGATE_TO_ITEM    (reused — {itemId} OR {tabId, windowId})
//   MSG_RECENCY_ADD         (new — {id: 'item:<ulid>' | 'url:<url>'})
//
// Inbound (popup ← SW):
//   MSG_STATE_CHANGED       (NOT subscribed — see §39.4.4)
```

### §39.4.3 `popup/popup.css` — structure

Structured as:
1. CSS custom properties (theme variables) — inlined at top, mirror the sidepanel's light/dark tokens.
2. Layout primitives (`#qs-root`, `#qs-input-wrap`, `#qs-results-scroll`, `#qs-list`).
3. Row styling (`li[role="option"]` + `[data-kind="saved"]` / `[data-kind="openTab"]`).
4. Selection highlight (`li[aria-selected="true"]`).
5. `<mark>` styling (reuse `--mark-bg` token from B-021).
6. Empty-state + loading-skeleton styles.
7. Media queries: `prefers-color-scheme: dark`; `prefers-reduced-motion: reduce`.

See §39.5 for enumerated positioned properties.

### §39.4.4 Broadcast subscription — NOT

The popup does NOT subscribe to `MSG_STATE_CHANGED`. Rationale:

- **Session length:** the popup is typically open for < 5 s. The probability of a `scope: items` broadcast arriving mid-session is low.
- **Cost of subscription:** a listener would need to debounce broadcasts, handle SW cold-start mid-session, and invalidate `_searchIndex` correctly. All doable, all adds surface area.
- **Trade-off:** a stale popup shows data from popup-open moment. The next open reflects any changes.
- **AC18 (SW cold-start during popup session):** addressed without a listener. If the SW terminates while the popup is open, the user's next keystroke triggers a new `MSG_RECENCY_ADD` — that re-wakes the SW. We do NOT re-fetch items on every keystroke; the popup's view is built from its initial fetch.

### §39.4.5 New messages, new handlers, new storage — summary table

| Change | Kind | File | Scope |
|---|---|---|---|
| `MSG_RECENCY_ADD` string constant | NEW | `shared/messages.js` | One new line; typedef for request `{id: string}` + response `{ok: true}` |
| `tj:recency` partition with v1 schema | NEW | `background/storage/partitions.js` + `background/storage/shapes.js` | New `PARTITION_RECENCY = 'recency'` constant; new default shape `{schemaVersion: 1, entries: []}`; new `assertShape` branch |
| `MSG_RECENCY_ADD` dispatcher branch | NEW | `background/messages/storage-handlers.js` | One `case` branch; reads partition, unshifts + dedupes + trims to 50, writes via `writeTransaction` |
| Migration entry for v1 recency partition | NEW | `background/storage/migration.js` | Additive migration: on first read where `tj:recency` is missing, write the default shape |
| `shared/highlight.js` | NEW (promotion) | `shared/highlight.js` | Extract `buildHighlightedText` verbatim from `sidepanel/sidepanel.js:1369-1393`; both surfaces import from new location. Zero behaviour change. |
| `popup/popup.html` | MODIFIED (stub replaced) | `popup/popup.html` | Full UI skeleton (§39.4.1) |
| `popup/popup.js` | NEW | `popup/popup.js` | ~500 LOC ES module (§39.4.2) |
| `popup/popup.css` | NEW | `popup/popup.css` | ~200 LOC (§39.5) |
| `manifest.json` | NO CHANGE | `manifest.json` | `default_popup` + `_execute_action` already present |

## §39.5 CSS Enumeration (AC4 — REJECT-on-omission at R4)

Every positioned element with its full property set + rationale.

### §39.5.1 Popup container `#qs-root`

| Property | Value | Rationale |
|---|---|---|
| `position` | `static` | The popup window is provided by Chrome; `#qs-root` is just the top flex column. |
| `width` | `480px` | AC4 recommendation. Narrow enough to remain focused; wide enough for 2-line row content without truncation. |
| `max-width` | `100vw` | Safety bound — Chrome/Edge caps popup width at ~800px anyway. |
| `height` | `auto` | Dynamic — shrinks when results are few. |
| `max-height` | `560px` | ~70% of typical viewport. |
| `overflow` | `hidden` | Child `#qs-results-scroll` owns the scroll. |
| `z-index` | `auto` | Popup is its own top-level. |
| `border-radius` | `8px` | Matches sidepanel card radius. |
| `box-shadow` | `0 4px 18px rgba(0, 0, 0, 0.12)` | Elevation. Light theme. Dark theme overrides to `0 4px 18px rgba(0, 0, 0, 0.40)`. |
| `transform` | `none` | No transform. |
| `opacity` | `1` | Fully opaque. |
| `pointer-events` | `auto` | Default. |
| `color` | `var(--color-fg)` | Theme token; light = `#1a1a1a`, dark = `#f4f4f4`. |
| `background-color` | `var(--color-bg)` | Light = `#ffffff`; dark = `#1e1e1e`. |
| `display` | `flex` | Stacks children vertically. |
| `flex-direction` | `column` | — |

### §39.5.2 Result row `li[role="option"]`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | Stacking context for selection focus ring. |
| `width` | `auto` | Fills parent. |
| `max-width` | `100%` | Prevents horizontal overflow. |
| `height` | `auto` | Can grow to 2 lines (title + url). |
| `overflow` | `hidden` | Truncation via `text-overflow: ellipsis` on children. |
| `z-index` | `0` | Resets stacking so selection focus ring renders above siblings. |
| `border-radius` | `6px` | Matches B-048 row style. |
| `box-shadow` | `none` | No per-row shadow. |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `auto` | Clickable. |
| `color` | `var(--color-fg)` | — |
| `background-color` | `transparent` | Inherits popup bg. |
| `padding` | `8px 12px` | — |
| `display` | `flex` | Favicon + text columns. |
| `align-items` | `center` | — |
| `gap` | `10px` | — |
| `cursor` | `pointer` | — |

### §39.5.3 Selection highlight `li[role="option"][aria-selected="true"]`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | Inherited. |
| `z-index` | `1` | Raises above non-selected siblings. |
| `border-radius` | `6px` | Matches base row. |
| `box-shadow` | `inset 0 0 0 2px var(--color-accent)` | Focus ring via inset shadow — doesn't disturb layout. Light: `#2563eb` (blue-600), contrast 4.5:1 vs white bg ≥ WCAG AA. Dark: `#60a5fa` (blue-400), contrast 4.2:1 vs `#1e1e1e` ≥ WCAG AA per AC17. |
| `background-color` | `var(--color-row-selected)` | Light: `#eff6ff` (blue-50); dark: `#1e3a5f`. Contrast verified WCAG AA. |

### §39.5.4 Section headers `.qs-section-header`

| Property | Value | Rationale |
|---|---|---|
| `position` | `sticky` | Keeps header visible during scroll. |
| `top` | `0` | Sticks to top of `#qs-results-scroll`. |
| `width` | `100%` | Full row. |
| `overflow` | `visible` | Badge may slightly extend. |
| `z-index` | `2` | Above rows. |
| `pointer-events` | `none` | Not interactive. |
| `color` | `var(--color-fg-muted)` | Light: `#6b7280`; dark: `#9ca3af`. |
| `background-color` | `var(--color-bg-header)` | Subtle tint. Light: `#f9fafb`; dark: `#171717`. |
| `padding` | `6px 12px` | — |
| `font-size` | `11px` | Small caps label. |
| `text-transform` | `uppercase` | — |
| `font-weight` | `600` | — |
| `letter-spacing` | `0.04em` | — |
| `border-bottom` | `1px solid var(--color-border)` | Light: `#e5e7eb`; dark: `#262626`. |

### §39.5.5 Empty-state container `#qs-empty`

| Property | Value | Rationale |
|---|---|---|
| `position` | `absolute` | Overlays list area. |
| `top` | `50%` | Vertically centred. |
| `left` | `50%` | Horizontally centred. |
| `width` | `auto` | Shrinks to content. |
| `max-width` | `80%` | Wraps message comfortably. |
| `height` | `auto` | — |
| `max-height` | `80%` | Prevents overflow. |
| `overflow` | `hidden` | — |
| `z-index` | `1` | Above empty `<ul>`. |
| `transform` | `translate(-50%, -50%)` | Centring. |
| `opacity` | `1` | — |
| `pointer-events` | `none` | Decorative. |
| `color` | `var(--color-fg-muted)` | — |
| `background-color` | `transparent` | — |
| `padding` | `16px` | — |
| `text-align` | `center` | — |
| `display` | `flex` | Icon + text column. |
| `flex-direction` | `column` | — |
| `align-items` | `center` | — |
| `gap` | `10px` | — |

### §39.5.6 `<mark>` highlight inside row text

| Property | Value | Rationale |
|---|---|---|
| `position` | `static` | Inline flow. |
| `overflow` | `visible` | Inline; no clipping. |
| `z-index` | `auto` | — |
| `border-radius` | `2px` | Subtle rounding. |
| `box-shadow` | `none` | — |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `auto` | Inherits from row. |
| `color` | `inherit` | — |
| `background-color` | `var(--mark-bg)` | Light: `#fef08a` (yellow-200); dark: `#713f12` (yellow-900). Reuses B-021's token. |
| `padding` | `0 1px` | Micro-breathing. |

### §39.5.7 Favicon holder `.qs-favicon`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | Allows letter-avatar fallback overlay. |
| `width` | `16px` | Standard favicon size. |
| `max-width` | `16px` | — |
| `height` | `16px` | — |
| `max-height` | `16px` | — |
| `overflow` | `hidden` | Crops non-standard favicons. |
| `z-index` | `0` | — |
| `border-radius` | `3px` | Rounded square. |
| `box-shadow` | `none` | — |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `none` | Non-interactive. |
| `color` | `var(--color-fg-muted)` | Applies to letter-avatar text. |
| `background-color` | `var(--color-avatar-bg)` | Light: `#e5e7eb`; dark: `#3f3f46`. Fallback when `<img>` fails. |
| `display` | `flex` | Centres letter-avatar text. |
| `align-items` | `center` | — |
| `justify-content` | `center` | — |
| `font-size` | `11px` | — |
| `font-weight` | `600` | — |

### §39.5.8 Overlay — loading skeleton `.qs-skeleton`

Only shown while `_mode === 'loading'`; transitions out on first render.

| Property | Value | Rationale |
|---|---|---|
| `position` | `absolute` | Overlays list area. |
| `top` | `0` | — |
| `left` | `0` | — |
| `width` | `100%` | — |
| `max-width` | `100%` | — |
| `height` | `100%` | — |
| `max-height` | `100%` | — |
| `overflow` | `hidden` | — |
| `z-index` | `3` | Above rows and section headers. |
| `transform` | `none` | — |
| `opacity` | `1` | Fades to 0 on hydrate via transition. |
| `pointer-events` | `none` | — |
| `color` | `transparent` | — |
| `background-color` | `var(--color-bg)` | Matches popup bg. |

## §39.6 Test Plan Delta — `tests/b022-quick-search.test.js`

Mapped from AC20. Numbers align with AC letter labels:

| # | Test case | Target |
|---|---|---|
| a | Fuzzy filter over 1000-item fixture | Build `_searchIndex` via `buildIndex`; query matches counted; section assignment correct. Also filter 50-tab `_openTabIndex`. P95 < 50 ms over 50 samples. |
| b | `buildHighlightedText` safe DOM — shared/highlight.js import | Assert `<mark>` elements created via `document.createElement('mark')`; `<script>` in title remains literal (textContent). |
| c | Arrow-key navigation + wrap | DOM fixture with 5 rows; dispatch `keydown` ArrowDown 6 times; wrap. ArrowUp from row 1 wraps to row 5. |
| d | Enter on saved-not-open → `chrome.tabs.create` | Mock `chrome.tabs.create`; select saved row NOT in `liveStates`; Enter; assert `{url: item.url}`. |
| e | Enter on saved+live → `chrome.tabs.update` + `chrome.windows.update` | Select saved row IN `liveStates` with `{tabId: 42, windowId: 3}`; Enter; assert both calls. |
| f | Enter on open-tab → focus path | Select Open Tabs row; Enter; assert `MSG_NAVIGATE_TO_ITEM` sent with `{tabId, windowId}`. |
| g | Escape → zero writes/calls | Open, type, select, Escape; assert no `chrome.tabs.*`, no `chrome.storage.local.set`, no `MSG_RECENCY_ADD`. |
| h | Whitespace-only query → recency mode | Input `"   "`; dispatch input; wait 120 ms; assert `_mode === 'recency'`. |
| i | Recency append on navigate, NOT on Escape | (1) Enter → assert `MSG_RECENCY_ADD` sent. (2) Escape → assert no `MSG_RECENCY_ADD`. |
| j | Result cap 50 | 100-match fixture; query; assert exactly 50 rows in DOM. |

Additional coverage: XSS regression, empty-state matrix (AC19 a-g, 7 sub-tests), storage schema migration, recency de-dupe, recency cap trim.

All new tests use existing `tests/chrome-mock.js` mock boundary.

**Full suite target:** ≥ 1080 (baseline) + ~20 new = ~1100 passing.

## §39.7 R2 Correctness Checklist

| # | Check | Verdict | Evidence |
|---|---|---|---|
| C-1 | Storage schema versioned | PASS | New `tj:recency` partition with `schemaVersion: 1`. Default shape in `shapes.js`. Migration entry in `migration.js`. Schema mismatch → empty recency render (graceful downgrade, no data loss). Rollback: delete key. |
| C-2 | Message contracts typed | PASS | New `MSG_RECENCY_ADD` constant + JSDoc `RecencyAddRequest`/`Response`. Existing `MSG_LIST_ITEMS` + `MSG_NAVIGATE_TO_ITEM` reused unchanged. Payload validator for `MSG_RECENCY_ADD` throws `ERR_VALIDATION` when `payload.id` missing or non-string. |
| C-3 | SW cold-start safe | PASS | Popup open triggers `MSG_LIST_ITEMS`; dispatcher awaits `readyPromise`. `MSG_RECENCY_ADD` also awaits `readyPromise`. Popup doesn't subscribe to `MSG_STATE_CHANGED` — see §39.4.4. AC18 satisfied by on-write wake-up. |
| C-4 | ID stability | PASS | `RecencyEntry.id` uses `'item:<ulid>'` (stable per §3) for saved and `'url:<url>'` (content-addressable, stable) for open-tab-only. `tabId`/`windowId` explicitly NOT persisted. |
| C-5 | Manifest file references resolvable | PASS | `default_popup = popup/popup.html` already points at existing file. `_execute_action` already registered. `popup.js`/`popup.css` referenced by HTML (relative) — no manifest impact. |
| C-6 | Permission minimisation | PASS | No new permissions. `tabs`, `tabGroups`, `storage`, `sidePanel`, `search` all granted. R4 [security-reviewer] verifies final diff. |
| C-7 | Allow-list direction | N/A | No sanitizer/validator/export surface. |
| C-8 | SW-context feasibility | PASS | Popup runs in its own extension-page context. All DOM APIs native to popup context. SW-side code uses only `chrome.storage.local` + existing `writeTransaction` — confirmed SW-reachable. |
| C-9 | Empty-state design | PASS | AC19 enumerates 7 sub-states mapped to distinct `_mode` values. `#qs-empty` renders appropriate copy per mode. R4 [qa-reviewer] confirms all 7 sub-states tested. |
| C-10 | Off-screen rect feasibility | N/A (PASS) | Popup uses standard in-flow DOM. No `setDragImage`, no `canvas.toDataURL`, no off-screen snapshotting. No `top: -9999px` pattern. B-025 UAT-8 regression class does not apply. |

All ten checks PASS or N/A-PASS. No CONCERN blockers.

## §39.8 Rollback Plan

**Risk level:** LOW-to-MEDIUM. Two new surfaces (`tj:recency` partition + new message type) add small blast radius; primary popup UI is additive and sandboxed to its own files.

**Rollback procedure (cleanest):**

1. `git revert <B-022-merge-sha>`. This reverts:
   - `popup/popup.html` to Sprint 1 stub.
   - Deletes `popup/popup.js` and `popup/popup.css`.
   - Removes `MSG_RECENCY_ADD` + typedef from `shared/messages.js`.
   - Removes `PARTITION_RECENCY` + default shape + assertShape branch.
   - Removes the `MSG_RECENCY_ADD` case from `storage-handlers.js`.
   - Removes the `tj:recency` migration from `migration.js`.
   - Reverts `shared/highlight.js` promotion → sidepanel reabsorbs `buildHighlightedText` locally.
2. **Data cleanup** (optional, non-blocking): `chrome.storage.local.remove('tj:recency')` in SW inspect console. Not required — orphan key is inert.
3. No manifest cleanup needed.
4. Chrome Web Store rollback: build from pre-B-022 tag (v1.19.0), re-submit.

**Non-revert rollback (hotfix):** ship a point-release that replaces `popup/popup.html` with the stub and ignores `MSG_RECENCY_ADD` in the dispatcher. Preserves scaffold for a next attempt.

## §39.9 Known Risks / Follow-ups (S27+ candidates)

1. **No cross-surface recency visibility.** Recency only read by popup. Future item could surface "recently accessed" in sidepanel.
2. **No pagination / infinite scroll.** Cap 50 is hard. Queries with > 50 matches silently truncate.
3. **No typo tolerance / fuzzy matching.** Same deferred stance as B-052 (§34.12).
4. **Mixed-selection multi-activate.** Shift+Enter for multiple rows — not in scope.
5. **Recent items beyond top-20 invisible.** Recency partition holds 50; render shows 20.
6. **Popup close-on-blur behaviour.** Chrome/Edge close the popup automatically when focus leaves — document in user manual.
7. **Filter debounce tuning.** 120 ms inherited from sidepanel patterns; R5 perf probe may reveal 80 ms is fine or 150 ms is safer.
8. **Shared highlight module's reach.** After promoting to `shared/highlight.js`, any future surface (newtab, B-023) can reuse it. Flag in R6 close.
9. **Accessibility: `aria-activedescendant` vs roving tabindex.** Chose `aria-activedescendant` (same as B-024/B-048). If UAT-10 surfaces AT-specific issues, follow-up item.
10. **Edge browser-specific keybinding quirks.** `edge://` tabs may block extension shortcuts (UAT-2 acknowledges as WARN-not-FAIL).
11. **popup.js bundle size.** Pure ES module, no bundler. Total ≤ 20 KB estimated.

---

**R2 verdict: READY FOR R3.**

## §39.10 As Built

Closed at R6 (2026-04-23) after UAT 12/12 PASS (three fix cycles on UAT-4). Six deviations from the §39.1–§39.9 design — three flagged during R3, three discovered during UAT — plus R4 findings disposition and one new R2 Correctness Checklist item proposed for CLAUDE.md.

### §39.10.1 Deviations

**D-R3-1 — Migration simplified (§39.4.5).** The plan table listed "Migration entry for v1 recency partition" as a `MigrationStep` in `migration.js`. R3 noted that the `tj:recency` partition is purely additive (new key, no existing data to reshape), and `initializePartitions()` already seeds defaults via `ALL_PARTITIONS` + `defaultShape()`. A dedicated `MIGRATION_STEPS` entry was therefore unnecessary. The partition and its default shape are now registered alongside the others and seeded on first read; an inline comment in `migration.js` records the rationale. Rollback semantics are preserved (`chrome.storage.local.remove('tj:recency')` still suffices).

**D-R3-2 — Group breadcrumb placeholder (§39.2 / §39.3 D-6).** The R2 row shape specified "group name breadcrumb" on saved rows, matching `Parent / Child` in the bookmarks section. Resolving the group name in the popup would require a second message round-trip (`MSG_LIST_GROUPS`) or broadening `MSG_LIST_ITEMS`'s response — both violate §39.2's "single round-trip at popup open" constraint. R3 shipped the row with literal placeholder text (`Group ›` for items with a `groupId`, `Ungrouped ›` for null), matching the D-6 "label + icon, not color-only" test. UAT-5 tester noted the limitation and accepted it as acceptable for v1. Full group-name resolution is queued as S27+ polish (see §39.9 risk 1 and the B-086 UI-polish triage candidate).

**D-R3-3 — Result-cap proportional split (§39.3 D-5 / AC14).** AC14 specified a hard cap of 50 rows total. R2 did not enumerate how to split the cap between the two sections when both are oversized. R3 implemented a "shorter section keeps its full set; larger section fills the remainder" rule — e.g., 100 bookmarks + 3 open tabs renders as 47 bookmarks + 3 open tabs, not 25 + 3 and not 25 + 25. Rationale is fairness (shorter section always intact) + agency (user intent to see as many matches as possible is preserved). An inline comment in `popup.js` documents the choice; B-022-DM-6 captured the originally-misleading "up to half each" comment and is deferred to S27 hygiene.

**D-UAT-1 — Popup body width anchor (§39.5.1).** The R2 CSS block set `width: 480px; max-width: 100vw` on `#qs-root`, implicitly assuming Edge would size the extension popup to its root content. In practice, MV3 popups size to the `<body>` element's dimensions, and `<body>` had no explicit width — the popup collapsed to its minimum content width (~50 px) at first open. Fix: apply `width: 480px; min-width: 480px` to `html, body` directly and set `#qs-root { width: 100%; max-width: 100% }` to fill the anchored body. **The body-width anchor is now a load-bearing pattern for any future popup surface in this codebase** (B-023 group-jump popup, B-035 standalone window, any B-036-class surface) and is documented inline at the top of `popup.css`.

**D-UAT-2 — Empty-state positioning (§39.4.1 / R4 L-1 escalation).** R3 nested `#qs-empty` inside `#qs-results-scroll` rather than as a direct child of `#qs-root` (R4 code-reviewer L-1 flagged this as "minor spec drift"; it was accepted and deferred). UAT-4 surfaced that `#qs-results-scroll`'s `overflow-y: auto` + `min-height: 60px` clipped the absolutely-positioned empty-state so it only rendered as a 60 px strip at the top of the scroll area instead of centred inside the popup. Fix: `#qs-empty` promoted to direct child of `#qs-root`; `#qs-root { position: relative }` becomes the positioning parent; the empty-state changed from `top: 50%; left: 50%; transform: translate(-50%, -50%)` centring to `inset: 0` full-fill with flex `justify-content: center` / `align-items: center` for inner content centring (more robust under content-length changes). **Lesson:** R4 LOW findings that touch user-visible behaviour — especially layout parentage and positioning ancestor — must be scrutinised more carefully; this should have been HIGH and blocked R5.

**D-UAT-3 — Popup-lifecycle message race (§39.3 D-3 — CRITICAL design error).** The R2 write-path specified that `popup.js` would dispatch `MSG_RECENCY_ADD` *after* awaiting the navigation's resolution (`chrome.tabs.update`/`create`). In practice, Edge (and Chrome) auto-close the popup window the instant `chrome.tabs.update({active: true})` shifts focus to the target tab — the popup's JS context is torn down mid-await, and any `await _sendMessage(MSG_RECENCY_ADD)` scheduled *after* the navigate is dropped with no SW-side delivery. Symptom surfaced in UAT-4 re-test (after D-UAT-1 and D-UAT-2 were fixed): recency store stayed empty across sessions. Fix: queue `MSG_RECENCY_ADD` **before** awaiting navigate — `chrome.runtime.sendMessage` native delivery continues past popup teardown, so fire-and-forget is correct. `recencyId` is derivable from the row alone (`item:<ulid>` for saved, `url:<url>` for open-tab), so nothing requires awaiting the navigate call's resolution. Test coverage remains green by construction — the in-process `chrome-mock` does not reproduce the focus-shift teardown, so integration tests never caught the race. The inline comment in `popup.js` lines 539-544 documents the invariant: *"Fire recency FIRST. Don't await — we need the call to dispatch before the navigate await closes the popup."* **This is the single most important lesson for future popup-surface work** (B-023, B-035, B-036) — see §39.10.4 for the proposed CLAUDE.md C-11 checklist item.

### §39.10.2 R4 findings disposition

Fixed in-sprint before R5 (all HIGHs + both quick MEDIUMs):
- **B-022-H1** (google.com favicon) — FIXED. `isSafeFaviconUrl` promoted to `shared/favicon.js`; popup uses `item.favIconUrl` / `liveState.favIconUrl` when safe, falls back to letter-avatar when absent. Zero outbound network surface (preserves the "local-only" invariant).
- **B-022-H2** (Tab focus trap) — FIXED. Keydown handler intercepts Tab/Shift+Tab: from input → first row; from row → input; wraps at ends via `aria-activedescendant`.
- **B-022-H3** (icon differential) — FIXED. `.qs-favicon-overlay` pseudo-element with `.qs-overlay-bookmark` (saved) vs `.qs-overlay-livedot` (open-tab) colour tokens; visual distinction holds when section headers scroll off.
- **B-022-M1** (maxlength) — FIXED. `maxlength="256"` on `#qs-input`, matching the B-079 sidepanel precedent.
- **B-022-M2** (empty-state live-region routing) — FIXED. Empty-state strings announce through the `#qs-status` `aria-live="polite"` region; `#qs-empty` is visual-only (`aria-hidden="true"`).

Deferred to S27+ hygiene bundle:
- **B-022-DM-1 through DM-6** — copy/comment corrections and a dead-code `_tabById` removal; accepted as-is for v1.
- **B-022-L1** — superseded by D-UAT-2 fix (empty-state is now a direct child of `#qs-root`; L-1 no longer applicable).
- **B-022-L2** — superseded by H-1 fix (helper is now in `shared/favicon.js`).
- **B-022-L3, L5, L6** — presentation and UAT-doc polish; no-risk, triaged to hygiene.
- **B-022-L4** — accepted as-is (graceful-degrade recency read via per-entry defensive checks).

Sprint 26 security posture post-H1 fix: zero new network surfaces, zero new permissions, XSS fully closed by construction (`textContent` only, `shared/highlight.js` byte-for-byte promoted from B-021).

### §39.10.3 C-1 through C-10 re-verification

| # | Check | Verdict | As-built note |
|---|---|---|---|
| C-1 | Storage schema versioned | PASS | `tj:recency` v1 seeded via `initializePartitions` + `defaultShape`; no dedicated migration step needed (D-R3-1). Rollback unchanged. |
| C-2 | Message contracts typed | PASS | `MSG_RECENCY_ADD` string + JSDoc typedefs shipped in `shared/messages.js`. Payload validator in dispatcher. |
| C-3 | SW cold-start safe | PASS (after D-UAT-3) | Pre-fix, popup teardown ate the post-navigate write; the popup-lifecycle race exposed a previously-invisible SW-delivery gap. Now fire-and-forget before navigate. |
| C-4 | ID stability | PASS | `'item:<ulid>'` for saved, `'url:<url>'` for open-tab-only; tabId never persisted. |
| C-5 | Manifest file references resolvable | PASS | No manifest changes. `default_popup`/`_execute_action` pre-existing. |
| C-6 | Permission minimisation | PASS | No new permissions. |
| C-7 | Allow-list direction | N/A | No sanitizer/export surface. |
| C-8 | SW-context feasibility | PASS | Popup runs in extension-page context; SW handler uses only `chrome.storage.local` + existing `writeTransaction`. |
| C-9 | Empty-state design | PARTIAL PASS (see lesson) | All 7 sub-states enumerated in AC19 shipped correctly, but **C-9 does not currently require layout-parent / positioning-ancestor verification for overlay empty-states.** The D-UAT-2 clipping defect was a layout-parent bug, not an AC19 enumeration gap. Worth considering a C-9 sub-clause for "absolutely-positioned empty-state must be a direct child of a `position: relative` parent that is NOT a scroll container." |
| C-10 | Off-screen rect feasibility | N/A | No snapshot/canvas/`-9999px` pattern. |

### §39.10.4 Recommendation for CLAUDE.md — propose C-11

Add a new entry to the R2 Correctness Checklist in CLAUDE.md:

> **C-11 Popup-lifecycle message ordering.** For extension-popup surfaces that trigger focus changes (tab activation, window focus, or any API that transfers browser focus away from the popup), all write messages (`MSG_RECENCY_ADD`-class patterns — any SW-side state mutation the popup fires) MUST be queued BEFORE the focus-shifting API call. Awaiting after the shift is a race — the popup tears down when focus leaves the browser window, and any post-shift `await sendMessage` is dropped with no SW-side delivery. Verification prompt at R2: *"Does this popup trigger `chrome.tabs.update({active})`, `chrome.windows.update({focused})`, or any focus-shifting API?"* — if yes, write messages must go first. `chrome.runtime.sendMessage` native delivery continues past popup teardown, so fire-and-forget (unawaited) is the correct pattern.

Precedent: Sprint 26 B-022 UAT-4 recency-not-persisting defect (D-UAT-3 above). Integration tests did not reproduce the race because `chrome-mock` does not model popup-teardown-on-focus-shift; this is a UAT-only signal class.

### §39.10.5 Test count reconciliation

§39.6 projected "baseline 1080 + ~20 new ≈ 1100 passing." Actual: **1080 → 1119 (+39 new)** via `tests/b022-quick-search.test.js`. The larger delta reflects additional coverage for the empty-state enumeration matrix (AC19 a-g, 7 sub-tests), recency schema migration, recency de-dupe/cap-trim, the H-1 favicon safety branch, and Tab/Shift+Tab focus-trap assertions added during the R4 fix cycle.

### §39.10.6 Final file manifest — corrections to §39.4.5

| Change | Kind | File | As-built delta vs §39.4.5 |
|---|---|---|---|
| `MSG_RECENCY_ADD` + typedefs | NEW | `shared/messages.js` | No delta |
| `tj:recency` partition + default shape + assertShape | NEW | `background/storage/partitions.js` + `background/storage/shapes.js` + `background/storage/index.js` | Touches `index.js` too (partition export); no separate migration entry (D-R3-1) |
| `MSG_RECENCY_ADD` dispatcher branch | NEW | `background/messages/storage-handlers.js` | No delta |
| Additive-only seeding of `tj:recency` | NEW | `background/storage/migration.js` | Inline comment only, no `MIGRATION_STEPS` entry (D-R3-1) |
| `shared/highlight.js` | NEW (promotion) | `shared/highlight.js` | No delta; sidepanel refactored to import |
| `shared/favicon.js` | **NEW (added at R4 H-1 fix — NOT in R2 plan)** | `shared/favicon.js` | Promoted `isSafeFaviconUrl` from `sidepanel/sidepanel.js:90`; both surfaces now share the guard |
| `popup/popup.html` | MODIFIED (stub replaced) | `popup/popup.html` | Delta: `#qs-empty` is a direct child of `#qs-root` (D-UAT-2); `#qs-input` has `maxlength="256"` (M-1) |
| `popup/popup.js` | NEW | `popup/popup.js` | ~884 LOC (vs ~500 estimated); recency-first-before-navigate write path (D-UAT-3) |
| `popup/popup.css` | NEW | `popup/popup.css` | ~446 LOC (vs ~200 estimated); body-width anchor (D-UAT-1); `#qs-root { position: relative }` + `#qs-empty { inset: 0 }` full-fill layout (D-UAT-2) |
| `tests/b022-quick-search.test.js` | NEW | `tests/b022-quick-search.test.js` | +39 tests (vs ~20 estimated; see §39.10.5) |
| `tests/storage-init.test.js` | MODIFIED | `tests/storage-init.test.js` | Added `tj:recency` seed assertion |
| `sidepanel/sidepanel.js` | MODIFIED | `sidepanel/sidepanel.js` | Inlined `buildHighlightedText` removed; imports from `shared/highlight.js`. `isSafeFaviconUrl` removed; imports from `shared/favicon.js` |
| `manifest.json` | NO CHANGE | `manifest.json` | Confirmed at R6 — no permission or command-binding drift |

---

**R6 verdict: CLOSED. B-022 Quick Search Popup shipped 2026-04-23 with UAT 12/12 PASS. Three R3 deviations acceptable; three UAT deviations fixed in-sprint. D-UAT-3 is the load-bearing precedent for future popup-surface work (C-11 proposed).**
