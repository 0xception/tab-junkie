# §40 — B-023 Group Jump Popup (R2 Design)

**Sprint:** 27
**Tier:** Full (L)
**Status:** R2 complete (2026-04-23) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §39 (B-022 popup surface + `shared/highlight.js` + `shared/favicon.js` + popup-lifecycle precedent D-UAT-3), §30 (B-029 `shared/group-picker-core.js` pure row-builder), §35 (B-007 sub-group breadcrumb semantics), §26 (B-055 `openTabs` wire field + `MSG_LIST_ITEMS` single round-trip shape), §28 (B-014 windowMap), §10.10 (broadcast architecture)
**Out-of-scope (explicit):** Group CRUD from popup (B-006 owns); item CRUD (sidepanel owns); standalone window (B-035); custom shortcut UI; drag-drop in popup; bulk selection in popup; multi-level depth > 1 (blocked by B-001a/B-007 depth cap).

---

## §40.1 Overview

B-023 adds a second extension-popup surface, triggered by `Alt+K` (the already-registered `group-jump` command from v1.18.0), that lets a user fuzzy-search group names, see per-group `(N bookmarks · M open)` counts, and drill into a group to view its contents (bookmarks + sub-groups). The popup is **a separate surface** from B-022's quick-search popup — rendered from a new `popup/group-jump-popup.html` entry point with its own ES module (`popup/group-jump-popup.js`) and dedicated CSS (`popup/group-jump-popup.css`). The MV3 `default_popup` stays bound to B-022 (Alt+J = toolbar action); B-023 is opened programmatically from a service-worker `chrome.commands.onCommand` listener via `chrome.action.setPopup({popup: 'popup/group-jump-popup.html'}) + chrome.action.openPopup()` — a documented MV3 pattern that Edge supports in v119+. Group rows reuse the `shared/group-picker-core.js` `buildGroupPickerRows()` helper (pure data), match highlighting reuses `shared/highlight.js` byte-for-byte, and the single round-trip fetch reuses `MSG_LIST_ITEMS` verbatim (groups + items + liveStates all flow through the existing broadcast-aware handler). Drill-in is **in-popup** (option (a), not "send-to-sidepanel") — rendering the group's bookmarks and sub-groups inside the same popup with a Back affordance; Enter on a bookmark inside the drill-in delegates to the existing `MSG_NAVIGATE_TO_ITEM` message (same contract B-022 uses), at which point the popup tears down as the tab focus shifts. No new manifest permissions, no new message type, no new storage partition (recency/jump-count deferred per D-7) — so **C-11 is vacuously satisfied** and documented as such below.

## §40.2 Reuse Surface

Almost every load-bearing primitive already ships; B-023 is a thin UI layer on top.

| Surface | Source | How B-023 consumes it |
|---|---|---|
| `buildGroupPickerRows({groups, items, liveStates, sourceGroupId})` — group-row builder with breadcrumb + saved/open counts | `shared/group-picker-core.js:45-104` (§30) | **Imported verbatim.** Popup calls it with `sourceGroupId: null` (no exclusion — user picks any group) on open. Output `PickerRow[]` is the popup's primary render corpus for the group-list view. Breadcrumb field (`"Parent / Child"`) is already precomputed per §30 AC2. |
| `normalizeGroupPickerQuery(q)` + `matchesGroupPickerRow(searchKey, lq)` + `applyGroupPickerFilter(rows, q)` | `shared/group-picker-core.js:113-146` (§30) | **Reused verbatim** for the case-insensitive substring fuzzy match. The pre-lowercased `searchKey` (`name + ' ' + breadcrumb`) handles sub-group breadcrumb matching correctly (AC6). |
| `buildHighlightedText(text, query)` — safe `<mark>` DocumentFragment helper | `shared/highlight.js:33` (§39.2 / B-021 semantics) | **Reused verbatim** for match highlighting on group names. XSS safety (AC8 + UAT-13) is closed by construction — identical to B-022's posture. |
| `isSafeFaviconUrl(url)` — URL-scheme allow-list guard | `shared/favicon.js:21` (§39 R4 H-1 fix) | **Reused** for drill-in bookmark rows (favicon render path identical to B-022). Not used on group rows (groups do not carry favicons). |
| `MSG_LIST_ITEMS` → `{items, liveStates, driftRecords, openTabs, windowMap}` | `shared/messages.js:14` + `background/messages/storage-handlers.js:214` | **Single round-trip at popup open**, identical to B-022's §39.2 pattern. Returns everything needed: `items` for drill-in, `liveStates` for "M open" count, **plus** we need `MSG_LIST_GROUPS` separately (one extra message) because `MSG_LIST_ITEMS` does NOT include the groups array — see D-5 below for the two-message `Promise.all` pattern. |
| `MSG_LIST_GROUPS` → `Group[]` | `shared/messages.js:24` + `background/messages/storage-handlers.js:215` | **Second leg** of the parallel fetch. Returns the full group array (top-level + sub-groups, with `parentId`, `sortOrder`, `name`, `color`, etc.) — the exact input shape `buildGroupPickerRows` expects. |
| `MSG_NAVIGATE_TO_ITEM` — two-variant activation payload | `shared/messages.js:41` + §26.4 | Invoked from drill-in bookmark rows. Two variants: `{itemId}` for saved-not-open (opens new tab) vs `{tabId, windowId}` for saved+live (focuses the existing tab). Broadcast-suppression for variant (b) is already in place per §26.12.4. |
| `buildIndex(items)` + `search(index, query)` — B-052 prebuilt index | `sidepanel/search-index.js:134-347` (§34) | **Reused for drill-in filter** (AC13). The drill-in filter narrows a *subset* of items (those in the drilled group + descendants) so the filter is bounded, not full-corpus. We build a popup-scoped scoped `_drillSearchIndex` from the bookmarks of the drilled group on drill-in open; cost at worst 50-100 items ≈ sub-ms (§34.8 perf curve). |
| Popup-surface idioms — `role=dialog` + `aria-modal=true` + listbox with `aria-activedescendant` + focus-trap + body-width anchor | §39.4.1 + §39.5 + §39.10.D-UAT-1 | **Directly mirrored.** See §40.5 for the enumerated CSS block. The `html, body { width: 480px; min-width: 480px }` body anchor from B-022 D-UAT-1 is mandatory — we hit the same Edge popup-sizing quirk if we omit it. |
| C-11 popup-lifecycle invariant — "fire write messages via fire-and-forget BEFORE any focus-shifting API" | §39.10.4 (D-UAT-3) + CLAUDE.md C-11 (adopted S27 B-087) | **Applied on day one.** See D-7 resolution and §40.7 C-11 row. B-023 has *zero* SW writes in the v1 design, so the invariant is vacuously satisfied — but the pattern is baked in so a future polish item (jump-recency, jump-count) cannot silently regress. |

**Not reused:** the B-022 popup's recency store, score-boost formula, two-section layout (B-022 has Bookmarks + Open Tabs; B-023 has groups + drill-in), `_openTabIndex` parallel flat array (no open-tab fuzzy match in B-023). Zero shared HTML / CSS file — two separate popup surfaces with their own bundles (see D-1).

## §40.3 Decision Resolutions (D-1 through D-7)

### D-1 — Popup architecture: two separate popup surfaces (chosen) vs one shared popup with mode toggle (rejected)

**Choice:** **Option (b) — two separate popup surfaces.** A new `popup/group-jump-popup.html` file + dedicated `group-jump-popup.js` module + `group-jump-popup.css`. `manifest.json` `default_popup` stays bound to B-022's `popup/popup.html` (Alt+J / toolbar action). B-023 is opened programmatically by the SW on `Alt+K` via `chrome.action.setPopup({popup: 'popup/group-jump-popup.html'})` then `chrome.action.openPopup()` then `chrome.action.setPopup({popup: 'popup/popup.html'})` (restore) — three SW calls, all synchronous-returning, inside the `chrome.commands.onCommand` listener.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Single popup, mode-toggle key switches between items-search (B-022) and groups-search (B-023) | One HTML file, one CSS bundle, one JS module, can share state across modes | Violates B-022's §39.4's shipped architecture (module-scope state assumes a single mode); mixing modes inside one file nearly doubles `popup.js` LOC (~884 today → ~1600+); blast radius of every future B-022 regression now hits B-023 and vice versa; D-UAT-1/D-UAT-2/D-UAT-3 fix paths already specific to B-022's one-purpose state machine; the "single popup" argument assumes shared state is a benefit, but there is no shared state — the two surfaces have different data sources (items+tabs vs groups), different row shapes, different row counts, different recency semantics | Rejected |
| **(b) Two separate popup surfaces**, dynamic `chrome.action.setPopup()` swap at the SW command boundary | Each popup is its own narrow module; zero cross-feature regression risk; B-022 ships unchanged; symmetrical with B-035's eventual standalone window pattern; MV3-idiomatic (`openPopup()` is the supported path) | Requires one SW `chrome.commands.onCommand` listener + two `chrome.action.setPopup` swaps per Alt+K; adds ~25 LOC in SW; Edge compat check required (see C-8 below) | **Chosen** |

**Edge compatibility verdict for `chrome.action.openPopup()`:**
- The API is available in Chromium 127+ (March 2024) and Edge 127+ (April 2024). Current stable Edge is 125+ in most deployments; **R3 builder MUST verify the Edge install targeted for UAT is ≥ 127** (see UAT-1 and UAT-11 prerequisites).
- Edge requires the command to be user-invoked (keyboard shortcut counts as a user gesture; `Alt+K` qualifies). Programmatic invocation from a non-user-gesture path (e.g. setTimeout) would fail — we never hit that path.
- If the target Edge does not support `openPopup()`, fallback is to drop Alt+K and document the feature as "click the extension icon, choose 'Jump to group' from a sub-menu" — but this is a last-resort; R3 should target Edge 127+.

**Rationale:** Zero cross-regression risk is worth the cost of ~25 SW LOC. B-022's `popup.js` is 884 LOC of purpose-built state machine; shared-mode would re-open every UAT-class defect we just closed in §39.10.

**Blast radius if wrong:** If `chrome.action.openPopup()` misbehaves on target Edge, fallback is to make Alt+K toggle `chrome.action.setPopup` permanently (user re-clicks toolbar to re-invoke B-022). Additive, reversible, no storage impact. Documented in §40.8 rollback.

### D-2 — Shortcut dispatch path: `chrome.commands.onCommand` → `chrome.action.setPopup + openPopup` (chosen)

**Choice:** `group-jump` command at Alt+K is **already registered** in `manifest.json:41-45` (v1.18.0+). R2 confirms the SW dispatch path:

```js
// background/service-worker.js additions (new code, ~15 LOC):

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'group-jump') return;
  // Swap default_popup to the group-jump surface.
  chrome.action.setPopup({ popup: 'popup/group-jump-popup.html' });
  // Programmatically open it. User-gesture invariant: Alt+K keypress IS the gesture.
  chrome.action.openPopup().catch((err) => {
    console.warn('[tab-junkie] group-jump openPopup failed', err);
    // User can fall back to clicking the toolbar icon — no further recovery needed here.
  });
  // Restore default_popup for subsequent toolbar clicks (B-022 = default).
  chrome.action.setPopup({ popup: 'popup/popup.html' });
});
```

**Setup-order note:** `setPopup({popup: 'group-jump'})` + `openPopup()` + `setPopup({popup: 'popup.js default'})` are all synchronous from the SW's POV. The two `setPopup` calls are fire-and-forget (`chrome.action.setPopup` returns a Promise we don't await). Between them `chrome.action.openPopup()` already resolves the popup URL by reading the just-set value; restoring immediately after is safe because the popup has already captured its HTML reference.

**Edge-specific cold-start verification:**
- `chrome.commands.onCommand.addListener` must be registered synchronously at module scope (before any `await`). Same invariant as `chrome.tabs.onCreated` etc — the existing `background/service-worker.js` already follows this pattern.
- SW cold-start: if the first Alt+K after browser restart hits a cold SW, Chromium serialises the command event until the SW boots. `readyPromise` gates all message handlers, but `chrome.commands.onCommand` listener itself does not need to await it — setPopup + openPopup do not touch storage. The popup then fetches via `MSG_LIST_ITEMS` / `MSG_LIST_GROUPS`, which are `readyPromise`-gated in the existing handlers.

**Rationale:** This is the MV3-native pattern. `default_popup` can only hold one URL at a time; swapping it on command is the documented way to route shortcuts to distinct popup surfaces.

**Blast radius:** contained to ~15 SW LOC + two `action.setPopup` calls. No storage, no persistence. Revertible by deleting the listener block and retargeting the Alt+K binding in a follow-up.

### D-3 — Drill-in model: in-popup drill-in (chosen) vs send-to-sidepanel (rejected)

**Choice:** **Option (a) — in-popup drill-in.** Enter on a group row transitions the popup from "group-list view" to "drill-in view" (same `<body>`, different JS mode). Drill-in view shows: breadcrumb strip ("All Groups › Work"), back button, query input (repurposed for drill-in filter — AC13), list of the group's bookmarks (rendered with favicon + title + url per §40.5) + list of direct child sub-groups (rendered as group rows — recursive drill supported per AC10 up to depth 1 max, which is the storage cap per §35).

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) In-popup drill | Self-contained UX; keyboard stays in popup; user can drill + filter + back-out without opening sidepanel; no cross-surface coordination required; reuses B-022 rendering primitives for bookmark rows | Adds ~200 LOC of drill-view state machine; duplicates some B-022 row rendering; popup closes on bookmark Enter (focus shift) — back-out UX is via popup re-open | **Chosen** |
| (b) Send-to-sidepanel via new `MSG_NAVIGATE_TO_GROUP` | Simpler popup (single-view only); sidepanel is the "canonical" group viewer anyway | Popup closes immediately after drill (user loses query context); sidepanel may not be open (user sees nothing happen if sidepanel is closed); adds a new message contract; cross-surface focus juggling; violates popup self-containment principle; C-11 implication (would require `MSG_NAVIGATE_TO_GROUP` fired before focus shift, and we'd need to check what receiver expects) | Rejected |

**In-popup drill-in state transitions:**
- `mode = 'group-list'` (default on open) → Enter on group row → `mode = 'drill-in'` + `drilledGroupId = row.id` → render drill-in view.
- In drill-in: `mode = 'drill-in'` → Back button / ArrowLeft at list-top → `mode = 'group-list'` → render group list (preserving prior query text if any — debatable UX, R3 decides default).
- Enter on a bookmark row inside drill-in → dispatches `MSG_NAVIGATE_TO_ITEM` (same two-variant contract B-022 uses) → popup tears down as tab focus shifts. Next Alt+K opens fresh to `mode = 'group-list'`. (The popup has no persistent session state across opens — by design, same as B-022.)
- Enter on a sub-group row inside drill-in → drill one more level. Storage depth cap = 1 (per §35), so sub-groups have no further children; a further drill just shows the sub-group's own bookmarks.

**Rationale:** Self-containment wins. The user who hits Alt+K wants "show me my groups, let me peek at one, maybe open a bookmark from it" — all within a single popup session. Send-to-sidepanel fragments the flow and breaks when the sidepanel isn't already open.

**Blast radius:** confined to `popup/group-jump-popup.js`. No shared-module impact. No new message type.

### D-4 — Breadcrumb + Escape semantics: Escape always closes (R1 default retained); ArrowLeft at list-top = Back

**Choice:** Confirm R1's recommendation — **Escape always closes the popup** (from any view level: group-list OR drill-in). UAT-9's default expectation is retained. Sub-case B of UAT-9 stays as "Escape closes even when drilled in."

**Back affordance (drill-in only):**
- A visible `←` back button in the drill-in header's breadcrumb strip. Clickable, keyboard-accessible via Tab focus order.
- Additional keyboard shortcut: **ArrowLeft when selection is on the first row of the drill-in list** OR when the drill-in query input is empty (no caret movement ambiguity). Exits drill-in back to group-list. *Does NOT* override ArrowLeft when the caret is inside a non-empty query input (user must be able to move the caret).
- The breadcrumb "All Groups" segment is clickable as a back shortcut (AC11). The drilled-group segment (e.g. "Work") is not clickable — it's the current location.

**Rationale:** Escape-always-closes is the industry-standard popup idiom (Gmail search popup, VS Code command palette, Raycast, Alfred) and matches B-022 semantics so the two popups have a consistent dismissal model. Back-navigates-one-level would surprise users who expect Escape to end the flow. Breaking escape-consistency between B-022 and B-023 would be a WARN at R4 qa review.

**Blast radius:** contained to `popup/group-jump-popup.js` keydown handler. No persistence impact.

### D-5 — Open-tab count resolution: single `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` parallel fetch (chosen)

**Choice:** Popup opens with **two messages in parallel via `Promise.all`** — `MSG_LIST_ITEMS` (for items + liveStates + windowMap) + `MSG_LIST_GROUPS` (for groups). Both messages are existing, broadcast-aware, and `readyPromise`-gated. Counts are computed client-side by `buildGroupPickerRows` (§30), which does a single O(n) pass over items + liveStates per §30:51-61.

**Per-group `(N bookmarks · M open)` field derivation** (AC7):
- `savedCount = items.filter(it => it.groupId === group.id).length` — pre-computed by `buildGroupPickerRows` into the `PickerRow.savedCount` field.
- `openCount = items.filter(it => it.groupId === group.id && liveStates[it.id]?.live).length` — pre-computed into `PickerRow.openCount`.
- Display: `` `${savedCount} bookmark${s} · ${openCount} open` ``, with empty-count hidden (e.g., `3 bookmarks` when `openCount === 0`, or `2 open` when `savedCount === 0` — though that's rare because group-with-open-no-saved is edge-case).

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` in parallel (chosen) | Zero new message contracts; uses existing broadcast-aware handlers; reuses §30 row-builder verbatim; both messages fit cleanly in a `Promise.all` | Two message round-trips at open (vs one) | **Chosen** |
| (b) Enrich `MSG_LIST_GROUPS` response with a `counts: {savedById, openById}` map at the handler | Single round-trip | New message contract; breaks §30 row-builder's (groups, items, liveStates) interface; counts must be kept consistent with broadcast events; adds C-2 scope | Rejected |
| (c) Client-side compute from `MSG_LIST_ITEMS` alone (no groups fetch; derive group names from items) | Single round-trip | Cannot render empty groups (groups with no items); loses parent breadcrumb context; breaks AC5 "full flat list of all groups" | Rejected |
| (d) Via `liveStates` lookup at popup open (a variant of (a)) | Same as (a) | — | This IS (a) — `liveStates` is the `.live` field inside `MSG_LIST_ITEMS` response; not a separate path |

**Single round-trip perf cost:** Two parallel messages in Edge cost ~3-8 ms combined for a 500-item collection (measured empirically in §26.12 + §34.8). First paint budget of 200 ms (AC3) leaves ~190 ms for DOM render — plenty of headroom.

**Rationale:** Zero new message contracts + reuses the exact data shape `buildGroupPickerRows` expects. Option (b) would be an optimisation at the cost of a wider API surface, and the 3-8 ms savings are imperceptible.

**Blast radius:** zero — both messages already exist.

### D-6 — Mode-toggle key binding: N/A (D-1 = separate surfaces)

**Resolution:** D-1 chose two separate popup surfaces. **D-6 is therefore N/A.** No mode-toggle key is defined inside the B-022 popup. UAT-3 must be updated to verify that pressing `Alt+K` inside the B-022 popup **closes B-022** (browser behaviour — popups close when focus leaves) and opens B-023 fresh. (See §40.6 test-plan delta.)

**R3 note:** the UAT-3 rewrite for separate-surfaces world is:
> Set up: Open B-022 (Alt+J), type a character in query.
> Steps: Press Alt+K.
> Expected: B-022 closes (browser dismissal on focus leave); B-023 opens fresh with empty query + full group list; no residual B-022 state leaks into B-023 (module-scope state is per-surface by construction — different JS module, different popup).

### D-7 — C-11 lifecycle audit: zero SW writes in v1 → vacuously satisfied

**Audit result:** **NO SW-side writes fire on any flow in the B-023 v1 design.** C-11 is therefore vacuously satisfied. UAT-14 is expected to mark SKIP per its own expected-if-no-writes branch.

**Flow-by-flow verification:**

| Flow | Triggers SW write? | Verdict |
|---|---|---|
| Popup open → `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` | Both are **read-only** (`listItems`, `listGroups`) — no writeTransaction invocation | No write |
| Typing in query input → filter via `applyGroupPickerFilter` (client-side) | Pure client-side filter, zero IPC | No write |
| ArrowDown/Up + Enter on group row → transition to drill-in | Pure client-side state transition (mode change), zero IPC | No write |
| Enter on bookmark row inside drill-in → `MSG_NAVIGATE_TO_ITEM` | `MSG_NAVIGATE_TO_ITEM` is already broadcast-suppressed for the tabId-only variant (§26.12.4); the itemId variant also does NOT touch storage — it just invokes `chrome.tabs.create` which is a browser API not a storage write. **No SW-side write in either case.** | No write |
| Enter on sub-group row inside drill-in → drill one more level | Client-side state transition | No write |
| Escape → `window.close()` | No IPC of any kind | No write |
| Back button → `mode = 'group-list'` | Client-side state transition | No write |

**Future follow-up candidates flagged (S28+):**
- **Jump-recency** — if we want "most-recently-jumped-to group" to sort to the top of the empty-query list. Would require `MSG_GROUP_JUMP_RECENCY_ADD` + a new `tj:groupJumpRecency` partition. **If added, C-11 REQUIRES the message to be dispatched fire-and-forget BEFORE the drill-in transition OR before any focus-shifting activation.** The empty-query list is entirely client-side today so this would be a new SW write path — C-11 applies the moment it ships.
- **Jump-count telemetry** — not applicable; Tab Junkie is local-only, no telemetry.

**D-7 verdict:** No writes → C-11 vacuously satisfied. R3 MUST NOT add any SW-write path to B-023 without updating this design chapter (§40 R6 close) and explicitly walking C-11 for the new path.

## §40.4 Component Structure

### §40.4.1 `popup/group-jump-popup.html` — DOM skeleton

```
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Tab Junkie — Jump to Group</title>
    <link rel="stylesheet" href="group-jump-popup.css" />
    <script type="module" src="group-jump-popup.js"></script>
  </head>
  <body>
    <div id="gj-root" role="dialog" aria-label="Jump to Group" aria-modal="true" tabindex="-1">
      <!-- Breadcrumb strip (hidden at mode=group-list; visible at mode=drill-in) -->
      <nav id="gj-breadcrumb" aria-label="Group path" hidden>
        <button id="gj-back-btn" type="button" aria-label="Back to all groups">←</button>
        <span id="gj-crumb-root" role="link" tabindex="0">All Groups</span>
        <span class="gj-crumb-separator" aria-hidden="true">›</span>
        <span id="gj-crumb-current"></span>
      </nav>

      <div id="gj-input-wrap" role="combobox" aria-expanded="false"
           aria-controls="gj-list" aria-haspopup="listbox">
        <input id="gj-input" type="search" autocomplete="off" spellcheck="false"
               maxlength="256"
               placeholder="Search groups…"
               aria-autocomplete="list" aria-controls="gj-list"
               aria-activedescendant="" />
      </div>

      <div id="gj-status" role="status" aria-live="polite" aria-atomic="true"
           class="gj-visually-hidden"></div>

      <div id="gj-results-scroll">
        <ul id="gj-list" role="listbox" aria-label="Groups"></ul>
        <div id="gj-skeleton" class="gj-skeleton" hidden aria-hidden="true"></div>
      </div>

      <div id="gj-empty" hidden aria-hidden="true"></div>
    </div>
  </body>
</html>
```

Note placeholder cycles between `"Search groups…"` (at `mode=group-list`) and `"Filter bookmarks…"` (at `mode=drill-in`) via JS (no i18n).

### §40.4.2 `popup/group-jump-popup.js` — module structure

**Imports:**
- `../shared/messages.js` — `MSG_LIST_ITEMS`, `MSG_LIST_GROUPS`, `MSG_NAVIGATE_TO_ITEM`.
- `../shared/group-picker-core.js` — `buildGroupPickerRows`, `applyGroupPickerFilter`, `normalizeGroupPickerQuery`, `matchesGroupPickerRow`.
- `../shared/highlight.js` — `buildHighlightedText`.
- `../shared/favicon.js` — `isSafeFaviconUrl`.
- `../sidepanel/search-index.js` — `buildIndex`, `search` (for drill-in filter over the group's bookmarks).

**Module-scope state:**

```js
/** @type {Array<Object>}                 */ let _items = [];
/** @type {Record<string, LiveState>}     */ let _liveStates = {};
/** @type {Array<Object>}                 */ let _groups = [];
/** @type {Record<string, number>}        */ let _windowMap = {};
/** @type {import('../shared/group-picker-core.js').PickerRow[]} */ let _allRows = [];
/** @type {import('../shared/group-picker-core.js').PickerRow[]} */ let _visibleRows = [];
/** @type {string}                        */ let _query = '';
/** @type {number|null}                   */ let _filterTimer = null;
/** @type {number}                        */ let _selectedIndex = -1;
/** @type {'loading'|'group-list'|'drill-in'|'empty-matches'|'empty-no-groups'} */ let _mode = 'loading';
/** @type {string|null}                   */ let _drilledGroupId = null;   // set when mode='drill-in'
/** @type {SearchIndex|null}              */ let _drillSearchIndex = null; // built on drill-in
/** @type {Array<Object>}                  */ let _drillChildGroups = [];  // sub-groups of drilled group
/** @type {Array<Object>}                  */ let _drillItems = [];        // bookmarks in drilled group
```

**Event handlers:**
- `DOMContentLoaded` → focus `#gj-input`, dispatch `loadInitial()`.
- `loadInitial()` → `Promise.all([sendMessage(MSG_LIST_ITEMS), sendMessage(MSG_LIST_GROUPS)])` → on resolve: populate `_items`, `_liveStates`, `_windowMap`, `_groups`; call `buildGroupPickerRows({groups: _groups, items: _items, liveStates: _liveStates, sourceGroupId: null})` → `_allRows`; set `_mode = 'group-list'` (or `'empty-no-groups'` if `_allRows.length === 0`); call `render()`.
- `#gj-input` input → `clearTimeout(_filterTimer)` → `_filterTimer = setTimeout(applyFilter, 120)`.
- `#gj-root` keydown → switch: ArrowDown/Up (preventDefault, move selection + wrap), Enter (preventDefault, activate selected row per mode), Escape (preventDefault, `window.close()`), ArrowLeft at input-start (preventDefault, Back — drill-in only), Tab (allow native cycle input ↔ row).
- `#gj-back-btn` click → back-to-group-list.
- `#gj-crumb-root` click/Enter → back-to-group-list.
- Row `click` → activate (same as Enter).
- Row `mouseenter` → set selection.

**Render modes:**
- `group-list` → render `_visibleRows` (filter output of `_allRows` by `_query`) as group rows. Each row shows: group color chip (12×12 swatch), name (with `<mark>` highlight from `shared/highlight.js`), breadcrumb (if subgroup), `(N bookmarks · M open)` count badge. If `_visibleRows.length === 0` and `_query !== ''` → `_mode = 'empty-matches'` → `#gj-empty` visible with "No groups matching '<q>'".
- `drill-in` → render (1) header strip with breadcrumb "All Groups › {group name}", (2) sub-group rows (from `_drillChildGroups`) + bookmark rows (from `_drillItems`) interleaved with section dividers (sub-groups first, bookmarks second). If a drill-in query is typed, filter `_drillItems` via `_drillSearchIndex` (B-052) and filter `_drillChildGroups` via substring.
- `empty-no-groups` → `#gj-empty` visible with "No groups yet" + icon + "Create a group" CTA that closes popup and focuses sidepanel (future — v1 just closes popup, user opens sidepanel manually).
- `empty-matches` → `#gj-empty` visible with "No groups matching '<q>'" + hint to clear.

### §40.4.3 `popup/group-jump-popup.css` — structure

Mirrors §39.4.3 but with a `gj-` prefix and its own theme scope. See §40.5 for the full enumeration. Note that the body-width anchor (`html, body { width: 480px; min-width: 480px }`) is **mandatory** per §39.10.D-UAT-1 — omitting this collapses the popup to ~50 px on Edge.

### §40.4.4 Broadcast subscription — NOT

Same decision as §39.4.4. The popup does NOT subscribe to `MSG_STATE_CHANGED`. Session is short (< 5 s typical); stale-data risk is bounded to one session; next open reflects any mutations. The `_allRows` cache is the popup's single source of truth for the session.

### §40.4.5 New messages, new handlers, new storage — summary

| Change | Kind | File | Scope |
|---|---|---|---|
| SW listener for `chrome.commands.onCommand('group-jump')` | NEW | `background/service-worker.js` | +15 LOC at module scope; calls `chrome.action.setPopup` + `chrome.action.openPopup` |
| `popup/group-jump-popup.html` | NEW | `popup/group-jump-popup.html` | DOM skeleton per §40.4.1 |
| `popup/group-jump-popup.js` | NEW | `popup/group-jump-popup.js` | ~600 LOC ES module per §40.4.2 |
| `popup/group-jump-popup.css` | NEW | `popup/group-jump-popup.css` | ~300 LOC per §40.5 |
| `tests/b023-group-jump-popup.test.js` | NEW | `tests/b023-group-jump-popup.test.js` | +~20 tests per §40.6 |
| `manifest.json` | NO CHANGE | `manifest.json` | `group-jump` command already registered; default_popup stays on B-022's HTML |
| `shared/messages.js` | NO CHANGE | `shared/messages.js` | No new message types |
| `background/storage/*` | NO CHANGE | (none) | No new partitions |
| `background/messages/storage-handlers.js` | NO CHANGE | (none) | No new cases |

## §40.5 CSS Enumeration (AC16 — REJECT-on-omission at R4)

Every positioned element with its full property set + rationale. Body-width anchor is first.

### §40.5.0 Body-width anchor (MANDATORY per §39.10.D-UAT-1)

```css
html, body {
  width: 480px;
  min-width: 480px;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
}
```

**Load-bearing.** Edge MV3 popups size to the `<body>` rect; without this anchor, `#gj-root`'s `width: 100%` resolves to the minimum content width (~50 px) and the popup renders unusable. B-022 hit this at UAT-4; B-023 MUST NOT re-live it.

### §40.5.1 Popup container `#gj-root`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | Positioning ancestor for `#gj-empty` (inset: 0 overlay). B-022 §39.10.D-UAT-2 precedent — empty-state MUST anchor to the popup root, not the scroll container. |
| `width` | `100%` | Fills the body-anchor 480 px. |
| `max-width` | `100%` | — |
| `height` | `auto` | Dynamic. |
| `max-height` | `560px` | ~70% of typical viewport, matches B-022. |
| `overflow` | `hidden` | Child `#gj-results-scroll` owns the scroll. |
| `z-index` | `auto` | Popup is its own top-level. |
| `border-radius` | `8px` | Matches B-022. |
| `box-shadow` | `var(--shadow-popup)` | Theme token. Light: `0 4px 18px rgba(0,0,0,0.12)`; dark: `0 4px 18px rgba(0,0,0,0.40)`. |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `auto` | — |
| `color` | `var(--color-fg)` | Light `#1a1a1a`, dark `#f4f4f4`. |
| `background-color` | `var(--color-bg)` | Light `#ffffff`, dark `#1e1e1e`. |
| `display` | `flex` | Stacks children vertically. |
| `flex-direction` | `column` | — |

### §40.5.2 Breadcrumb strip `#gj-breadcrumb` (drill-in only)

| Property | Value | Rationale |
|---|---|---|
| `position` | `static` | Flows above input wrap. |
| `width` | `100%` | Full row. |
| `max-width` | `100%` | — |
| `height` | `auto` | Single-line strip. |
| `overflow` | `hidden` | `text-overflow: ellipsis` on `#gj-crumb-current`. |
| `z-index` | `auto` | — |
| `border-bottom` | `1px solid var(--color-border)` | Visual divider from input. |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `auto` | Clickable back nav. |
| `color` | `var(--color-fg-muted)` | Subdued. |
| `background-color` | `var(--color-bg-header)` | Same tint as section headers. |
| `padding` | `8px 12px` | — |
| `display` | `flex` | Back-btn + crumb segments. |
| `align-items` | `center` | — |
| `gap` | `6px` | — |
| `font-size` | `12px` | — |

Back button `#gj-back-btn`:

| Property | Value | Rationale |
|---|---|---|
| `position` | `static` | Inline flex item. |
| `width` | `24px` | Touch-friendly. |
| `height` | `24px` | — |
| `border-radius` | `4px` | — |
| `background-color` | `transparent` | Hover: `var(--color-row-selected)`. |
| `color` | `var(--color-fg)` | — |
| `cursor` | `pointer` | — |
| `border` | `none` | — |
| `display` | `flex` | Centre glyph. |
| `align-items` | `center` | — |
| `justify-content` | `center` | — |

### §40.5.3 Drill-in header (breadcrumb strip doubles as header — no separate element)

The breadcrumb strip IS the drill-in header in B-023's design. No `#gj-drill-header` element — the breadcrumb strip at §40.5.2 covers AC11's "Back button + breadcrumb" requirement.

### §40.5.4 Group row `li[role="option"][data-kind="group"]`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | Stacking context for selection ring. |
| `width` | `auto` | Fills parent. |
| `max-width` | `100%` | — |
| `height` | `auto` | Can grow to 2 lines (name + breadcrumb). |
| `overflow` | `hidden` | Truncation. |
| `z-index` | `0` | Reset; selection ring raises to 1. |
| `border-radius` | `6px` | Matches B-022. |
| `box-shadow` | `none` | — |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `auto` | — |
| `color` | `var(--color-fg)` | — |
| `background-color` | `transparent` | Inherits. |
| `padding` | `8px 12px` | — |
| `display` | `flex` | Color chip + text column + count badge. |
| `align-items` | `center` | — |
| `gap` | `10px` | — |
| `cursor` | `pointer` | — |
| `margin` | `1px 6px` | Horizontal breathing, matches B-022 row margin. |

### §40.5.5 Selection highlight `li[role="option"][aria-selected="true"]`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | Inherited. |
| `z-index` | `1` | Raises above non-selected siblings. |
| `border-radius` | `6px` | Matches base row. |
| `box-shadow` | `inset 0 0 0 2px var(--color-accent)` | Focus ring via inset shadow — same as B-022 §39.5.3. Light: `#2563eb` contrast ≥ 4.5:1 vs `#ffffff` (WCAG AA pass). Dark: `#60a5fa` contrast ≥ 4.2:1 vs `#1e1e1e`. |
| `background-color` | `var(--color-row-selected)` | Light `#eff6ff`, dark `#1e3a5f`. |

### §40.5.6 Group color chip `.gj-color-chip`

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | — |
| `width` | `12px` | Matches B-029 AC2. |
| `height` | `12px` | — |
| `border-radius` | `3px` | Subtle square-ish. |
| `background-color` | `var(--gj-group-color, var(--color-avatar-bg))` | Per-row inline CSS var; fallback `--color-avatar-bg` for Ungrouped. |
| `flex-shrink` | `0` | Never compressed. |
| `overflow` | `hidden` | — |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `none` | — |
| `box-shadow` | `none` | — |

### §40.5.7 Count badge `.gj-row-count`

| Property | Value | Rationale |
|---|---|---|
| `position` | `static` | Inline. |
| `overflow` | `hidden` | — |
| `pointer-events` | `none` | — |
| `color` | `var(--color-fg-muted)` | — |
| `background-color` | `transparent` | — |
| `font-size` | `11px` | Matches B-022 meta. |
| `white-space` | `nowrap` | — |
| `margin-left` | `auto` | Right-align within row's flex. |
| `flex-shrink` | `0` | Never compressed. |

### §40.5.8 Empty-state container `#gj-empty` (B-022 D-UAT-2 anchored)

| Property | Value | Rationale |
|---|---|---|
| `position` | `absolute` | Overlays scroll area. |
| `inset` | `0` | Full-fill of popup root — §39.10.D-UAT-2 precedent (do NOT use `top:50%`/`translate(-50%,-50%)` inside a scroll container). |
| `width` | `auto` | Filled by inset. |
| `max-width` | `100%` | — |
| `height` | `auto` | — |
| `max-height` | `100%` | — |
| `overflow` | `hidden` | — |
| `z-index` | `1` | Above list. |
| `transform` | `none` | Full-fill approach — no translate needed. |
| `opacity` | `1` | — |
| `pointer-events` | `none` | Decorative. CTA buttons if present override to `auto`. |
| `color` | `var(--color-fg-muted)` | — |
| `background-color` | `var(--color-bg)` | Opaque overlay to hide any partial list behind. |
| `padding` | `16px` | — |
| `text-align` | `center` | — |
| `display` | `flex` | Icon + text + CTA column. |
| `flex-direction` | `column` | — |
| `align-items` | `center` | — |
| `justify-content` | `center` | — |
| `gap` | `10px` | — |

### §40.5.9 `<mark>` highlight (group name matches)

| Property | Value | Rationale |
|---|---|---|
| `position` | `static` | Inline flow. |
| `overflow` | `visible` | — |
| `z-index` | `auto` | — |
| `border-radius` | `2px` | — |
| `box-shadow` | `none` | — |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `auto` | Inherits. |
| `color` | `inherit` | — |
| `background-color` | `var(--mark-bg)` | Light `#fef08a`, dark `#713f12`. Reuses B-021/B-022 token. |
| `padding` | `0 1px` | — |

### §40.5.10 Favicon holder (drill-in bookmark rows only) `.gj-favicon`

Identical shape to B-022 §39.5.7 with prefix swap:

| Property | Value | Rationale |
|---|---|---|
| `position` | `relative` | — |
| `width` | `16px` | Standard. |
| `max-width` | `16px` | — |
| `height` | `16px` | — |
| `max-height` | `16px` | — |
| `overflow` | `hidden` | — |
| `z-index` | `0` | — |
| `border-radius` | `3px` | — |
| `box-shadow` | `none` | — |
| `transform` | `none` | — |
| `opacity` | `1` | — |
| `pointer-events` | `none` | — |
| `color` | `var(--color-fg-muted)` | Letter-avatar text. |
| `background-color` | `var(--color-avatar-bg)` | — |
| `display` | `flex` | — |
| `align-items` | `center` | — |
| `justify-content` | `center` | — |
| `font-size` | `11px` | — |
| `font-weight` | `600` | — |
| `flex-shrink` | `0` | — |

### §40.5.11 Loading skeleton `.gj-skeleton` (shown during `mode=loading`)

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
| `z-index` | `3` | Above rows + headers. |
| `transform` | `none` | — |
| `opacity` | `1` | Fades to 0 on hydrate. |
| `pointer-events` | `none` | — |
| `color` | `transparent` | — |
| `background-color` | `var(--color-bg)` | Matches popup bg. |

## §40.6 Test Plan Delta — `tests/b023-group-jump-popup.test.js`

Mapped from AC21. All tests use the existing `tests/chrome-mock.js` boundary.

| # | Test case | Target |
|---|---|---|
| a | Fuzzy filter over 50-group fixture + sub-group breadcrumb | Build `_allRows` via `buildGroupPickerRows`; query `work` matches `Work`, `Work / Projects`, `Homework`. P95 < 50 ms. |
| b | `buildHighlightedText` reuse + XSS | Group name `<script>alert(1)</script>`; assert `<mark>` is a `document.createElement('mark')` node and the `<script>` stays literal text. |
| c | Arrow-key navigation + wrap | DOM fixture 5 rows; ArrowDown 6 times wraps to row 1; ArrowUp from row 1 wraps to row 5. `aria-activedescendant` tracked. |
| d | Enter on group row → drill-in | Select group A (3 bookmarks, 1 sub-group). Enter. Assert `_mode === 'drill-in'`, `_drilledGroupId === A.id`, DOM shows `#gj-breadcrumb` visible, lists 1 sub-group + 3 bookmark rows. |
| e | Back button returns to group-list | From drill-in, click `#gj-back-btn`. Assert `_mode === 'group-list'`, drill-in cleared, previous query retained. |
| f | Escape at any level — zero writes | From drill-in (or group-list), dispatch `keydown` Escape. Assert `window.close()` called exactly once, no `chrome.runtime.sendMessage` fired. |
| g | Empty-state 8 sub-states | Parameterised over AC19 (a)-(h). Each assertion: correct `_mode`, correct `#gj-empty` text content, `aria-hidden="false"` on empty, no crash. |
| h | C-11 write-before-navigate (vacuous) | Assert popup's navigate-to-bookmark path (Enter on drill-in bookmark row) dispatches `MSG_NAVIGATE_TO_ITEM` as fire-and-forget BEFORE any `chrome.tabs.update`/`create` resolves. Even though there's no "write" today, the *ordering* test codifies the C-11 invariant so a future jump-recency addition can't silently regress. |
| i | Cap 100 groups | 200-group fixture; empty query; assert exactly 100 rows in DOM; ensure `_allRows.length === 200` (cap is render-time, not data-time). |
| j | Whitespace-only query → full group list | Input `"   "`; after debounce, `_visibleRows === _allRows`, `_mode === 'group-list'`. |
| k | Drill-in filter (B-052 index) | Drill into group with 20 bookmarks. Type `git` in query. Assert only bookmarks with `git` in title/url render. P95 < 50 ms. |
| l | Sub-group breadcrumb rendering | Fixture: parent `Work`, child `Work/Projects`. Assert child row's breadcrumb div renders `Work / Projects`. |

Additional coverage: `buildGroupPickerRows` count correctness (saved/open), empty-group drill-in shows "No items in this group", concurrent-delete race (assert no crash if `_drilledGroupId` references a group that was deleted between open and drill).

**Full suite target:** 1119 baseline + ~20 new ≈ **1139 passing.**

## §40.7 R2 Correctness Checklist (C-1 through C-11)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| C-1 | Storage schema versioned | N/A | No new storage partition. Zero schema changes. Jump-recency/jump-count explicitly deferred (D-7). |
| C-2 | Message contracts typed | N/A | No new message types. Reuses `MSG_LIST_ITEMS`, `MSG_LIST_GROUPS`, `MSG_NAVIGATE_TO_ITEM` — all already typed in `shared/messages.js`. |
| C-3 | SW cold-start safe | PASS | `chrome.commands.onCommand.addListener` registered synchronously at module scope in `service-worker.js` — MV3 requires this. The listener itself touches no storage; `setPopup`/`openPopup` are synchronous SW APIs. The popup's own `MSG_LIST_ITEMS`/`MSG_LIST_GROUPS` fetches go through the existing `readyPromise`-gated handlers — cold-start-safe by inheritance. AC15/UAT-15 covered. |
| C-4 | ID stability | PASS | Group IDs are stable ULIDs (`crypto.randomUUID`-based, never renamed). Items likewise (§3). No ephemeral IDs persisted. |
| C-5 | Manifest file references resolvable | PASS | `group-jump` command in `manifest.json` does NOT carry a URL field — URL is set at runtime via `chrome.action.setPopup({popup: 'popup/group-jump-popup.html'})`. **R3 MUST create `popup/group-jump-popup.html` as a real file before the SW listener fires** (i.e., ship the HTML file in the same commit as the SW listener, never in sequence). Default popup `popup/popup.html` remains B-022's — unchanged. |
| C-6 | Permission minimisation | PASS | **Zero new permissions.** `tabs`, `tabGroups`, `storage`, `sidePanel`, `search` already granted. `chrome.action.openPopup()` requires NO permission. `chrome.commands.onCommand` requires NO permission (covered by `commands` in manifest, which is implicit). Confirmed. |
| C-7 | Allow-list direction | N/A | No sanitizer / validator / export surface added. All untrusted string rendering uses `textContent` + `shared/highlight.js` DocumentFragment (safe). |
| C-8 | SW-context feasibility | PASS with verification requirement | `chrome.commands.onCommand` is SW-reachable (documented in MDN + verified by existing v1.19.0 `_execute_action` command binding working for B-022). `chrome.action.openPopup()` requires Chromium 127+ / Edge 127+ — **R3 builder MUST verify UAT target Edge version is ≥ 127** and if <127, escalate to [scrum-master] for version-gate decision (defer B-023 OR drop Alt+K and rely on toolbar-click only). No SW-incompatible API (no `document`, no `DOMParser` — all DOM work is in the popup HTML context, which is a standard extension page). |
| C-9 | Empty-state design | PASS | AC19 enumerates 8 sub-states (a-h). Each mapped to a distinct `_mode` value or rendering branch. §40.5.8 defines the CSS for `#gj-empty`. `#gj-empty` is a **direct child of `#gj-root`** (not of `#gj-results-scroll`) — §39.10.D-UAT-2 precedent enforced from day one. Sub-state (g) "concurrent group delete mid-drill" handled via tolerant rendering (empty drill-in view falls back to "No items in this group"). |
| C-10 | Off-screen rect feasibility | N/A | No `setDragImage`, no `canvas.toDataURL`, no `top: -9999px` snapshotting. Standard in-flow popup DOM. B-085 class does not apply. |
| C-11 | Popup-lifecycle message ordering | **PASS (vacuous)** | D-7 audit confirms **zero SW-side writes in v1**. No `MSG_RECENCY_ADD`-class pattern. `MSG_NAVIGATE_TO_ITEM` is a navigation message, not a storage write (broadcast-suppressed for the `{tabId, windowId}` variant and storage-inert for the `{itemId}` variant — it calls `chrome.tabs.create` which is a browser API). No focus-shift + post-await-write race exists. UAT-14 marked SKIP per its own instructions. **If a future polish item adds any SW write on navigate/drill, C-11 REQUIRES re-audit before ship.** Test (h) in §40.6 codifies the ordering contract as a regression test. |

All eleven checks PASS or N/A-PASS. No CONCERN blockers. One VERIFICATION REQUIREMENT (C-8 Edge version).

## §40.8 Rollback Plan

**Risk level:** LOW. Additive surface only — new files + ~15 LOC in `service-worker.js`. Zero storage mutations. Zero manifest permission changes. Zero message contract changes.

**Rollback procedure:**

1. `git revert <B-023-merge-sha>`. This reverts:
   - Deletes `popup/group-jump-popup.{html,js,css}`.
   - Deletes `tests/b023-group-jump-popup.test.js`.
   - Removes the `chrome.commands.onCommand` listener block from `background/service-worker.js`.
2. **No data cleanup required** — no storage writes, no orphan keys.
3. **No manifest cleanup** — `group-jump` command binding stays (pre-existing since v1.18.0).
4. **Chrome Web Store rollback:** build from pre-B-023 tag (v1.20.0), re-submit.

**Non-revert rollback (hotfix):** Replace the `chrome.commands.onCommand` listener body with a no-op (`if (command !== 'group-jump') return; /* feature-disabled */ return;`). Preserves scaffold for a next attempt.

**Edge version fallback (if C-8 verification reveals `openPopup()` unavailable):** ship B-023 without Alt+K wiring — user opens popup only via toolbar button with a manual menu selection (future UI polish). This is a pre-merge pivot, not a post-merge rollback.

## §40.9 Known Risks / Follow-ups (S28+ candidates)

1. **Edge `chrome.action.openPopup()` availability on older builds.** Mitigated by C-8 verification requirement + §40.8 fallback. Adds UAT-2 WARN-not-FAIL flexibility for edge:// pages.
2. **No jump-recency / jump-count.** Deferred to explicit S28+ candidate (and noted in D-7). When added, **must re-walk C-11** — the invariant is baked into test (h) already.
3. **Drill-in does not reopen after bookmark navigate.** Popup tears down on focus shift (AC10 / D-UAT-3 lineage). User presses Alt+K again to resume. Acceptable per v1 scope.
4. **Create-group CTA in "empty-no-groups" state is future work.** v1 shows "No groups yet" + copy but no CTA button (CTA would need to close popup + focus sidepanel + trigger group-create dialog — out of scope).
5. **Depth > 1 not supported.** Inherited from §35 storage cap. Drill-in of a sub-group renders its bookmarks only (no further depth).
6. **Concurrent delete-group-while-drilled.** Tolerant rendering (stale view until next interaction) — no auto-refresh. Acceptable per AC19(g) + UAT-10(g).
7. **Filter debounce 120 ms.** Inherited from B-022. R5 perf probe may reveal 80 ms is fine or 150 ms is safer.
8. **SW listener `setPopup` race on rapid repeat Alt+K.** If a user mashes Alt+K while the popup is still mid-open, the second call's `setPopup('group-jump-popup.html')` + `setPopup('popup.html')` pair could interleave with the first open's completion. Low risk (openPopup resolves before restore call in practice), but R5 test (i) exercises rapid-repeat to confirm.
9. **Accessibility: `aria-activedescendant` vs roving tabindex.** Same choice as B-022/B-024/B-048. Consistent across surfaces.
10. **Focus return on Escape.** Browser returns focus naturally; if a user had the sidepanel focused before Alt+K, focus returns to sidepanel, not to the plain tab. Verified OK in B-022.
11. **popup/group-jump-popup.js bundle size.** Target ≤ 20 KB; estimated ~15 KB uncompressed.

---

**R2 verdict: READY FOR R3.**

## §40.10 As Built

**Closed:** 2026-04-23 · **UAT outcome:** 13 PASS · 1 SKIP (UAT-14 C-11 vacuous) · 1 unknown (UAT-3 popup-to-popup transition — observability-limited, not a FAIL). **Test count:** 1119 → **1163 (+44)**. **Verdict:** R2 design shipped largely as written — two R3-time adjustments + three R4-discovered deviations, all resolved in-sprint before R5.

### §40.10.1 Deviations from R2 plan

**R4-discovered (fixed in-sprint):**

- **D-R4-1 `applyGroupPickerFilter` reuse contract violated.** (code-reviewer H-1.) R3 initially shipped an inline `_applyGroupListFilter` loop re-implementing `matchesGroupPickerRow` with a result-cap early-exit. §40.2 explicitly called for `applyGroupPickerFilter` reused verbatim. The inline form was functionally equivalent but created drift risk against `shared/group-picker-core.js`. Fix: `import { applyGroupPickerFilter } from '../shared/group-picker-core.js'`; replaced the inline loop with `applyGroupPickerFilter(_allRows, _query).slice(0, GROUP_RESULT_CAP)`. Side effect: the fix also resolves M-2 (empty-matches mode guard now keys on `_allRows.length === 0` rather than on `lq === ''`).

- **D-R4-2 SW `chrome.commands.onCommand` listener shipped `async/await`.** (qa-reviewer H-1 / code-reviewer M-1 elevated.) R3 shipped the listener as `async` with `await` on `setPopup`/`openPopup`. §40.3 D-2 spec was a synchronous three-call pattern. Risk: if the SW is torn down between `openPopup` resolving and the `finally` block executing, `default_popup` remains pointed at `group-jump-popup.html` and the next toolbar click or Alt+J opens the wrong popup. Fix: re-shaped to a synchronous handler using `.catch().finally()` chaining so the restore runs on all resolution paths without relying on post-`await` continuation surviving SW teardown. This is the critical lifecycle fix for B-023. Note: it is an **adjacent-but-distinct** concern from C-11 (C-11 governs write-message ordering across focus shifts; this governs `setPopup` restore across SW lifecycle) — flagged for retro as a potential new check class ("popup-lifecycle continuation state").

- **D-R4-3 Live-tab navigation variant missing.** (qa-reviewer M-4 elevated to HIGH.) R3's `_activateRow` always dispatched `MSG_NAVIGATE_TO_ITEM { itemId }`, which opens a new tab. §40.2 + the B-022 precedent required the `{ tabId, windowId }` variant when the bookmark has a live claim, to focus the existing tab instead of duplicating it. Fix: `_activateRow` now consults `_liveStates[row.item.id]` and branches to the tabId variant when live, falling back to the itemId variant otherwise. Shape matches `popup/popup.js` byte-for-byte.

**R3-time adjustments (no R4 surfacing, documented in-commit):**

- **D-R3-1 `_enterUngroupedDrillIn` added.** §40.3 D-3 described `buildGroupPickerRows` unshifting an Ungrouped pseudo-row with `id: null`. R3 recognised that Enter on this row should drill into the Ungrouped bookmark list rather than no-op. Implementation parallels `_enterDrillIn` for real groups, gated on `row.id === null`.

- **D-R3-2 Defensive `try/finally` in SW listener.** §40.3 D-2 showed three plain synchronous calls. R3 added `try/finally` so `setPopup(restore)` runs even if `openPopup()` throws synchronously. After D-R4-2 re-shaped the listener to `.catch().finally()`, the defensiveness is preserved (finally branch survives rejection).

### §40.10.2 R4 findings disposition

- **HIGH — all resolved in-sprint:** H-1 (import `applyGroupPickerFilter`), H-2 (sync SW listener), H-3 (UAT-3 rewrite), H-4 (UAT-10 sub-state h), H-5 (live-tab variant).
- **MEDIUM — resolved in-sprint:** M-1 (back-button focus ring), M-3 (drill-in aria-label).
- **MEDIUM — deferred to S28 hygiene:** M-2 (unreachable branch — addressed as side-effect of H-1 fix, marked closed); M-4 (`_pickerRowFromGroup` O(n×m) perf — acceptable at current scale bounds, revisit if group count crosses ~500).
- **LOW — all deferred to future sprints**, catalogued in `docs/findings/sprint-27.md` (L-1 through L-7).

### §40.10.3 C-1..C-11 re-verification against shipped code

| # | Check | Verdict | Evidence |
|---|---|---|---|
| C-1 | Storage schema versioned | N/A | Zero new partitions (D-7 kept vacuous). |
| C-2 | Message contracts typed | N/A | `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` + `MSG_NAVIGATE_TO_ITEM` reused unchanged. |
| C-3 | SW cold-start safe | PASS | Popup single-fetch at open; SW listener registered at module scope; stateless between invocations. |
| C-4 | ID stability | PASS | Group + item IDs are ULIDs; no ephemeral IDs persisted. |
| C-5 | Manifest file references resolvable | PASS | `popup/group-jump-popup.html` shipped in the same commit as the SW listener; referenced programmatically via `chrome.action.setPopup()`. |
| C-6 | Permission minimisation | PASS | Zero new permissions. |
| C-7 | Allow-list direction | N/A | No sanitizer/validator/export surface touched. |
| C-8 | SW-context feasibility | PASS | Edge ≥ 127 confirmed by UAT-1 PASS on the user's browser. |
| C-9 | Empty-state design | PASS | AC19's 8 sub-states all exercised in R5 tests + UAT-10. |
| C-10 | Off-screen rect feasibility | N/A | Standard in-flow DOM only. |
| C-11 | Popup-lifecycle message ordering | **PASS (vacuous)** | D-7 zero-writes audit still holds post-ship — no SW-side writes were added in R3. Test (h) in `tests/b023-group-jump-popup.test.js` codifies the ordering contract as a regression guard for any future jump-recency feature. |

**C-11 note:** D-R4-2's `setPopup`-after-SW-teardown concern is **adjacent-but-distinct** from C-11 proper — C-11 governs `sendMessage` ordering across focus shifts; D-R4-2 governs `chrome.action.setPopup` restore across SW lifecycle. Neither invalidates the vacuous-PASS verdict, but the class ("popup-lifecycle continuation state") is flagged for possible incorporation as a C-11-adjacent check in a future CLAUDE.md revision.

### §40.10.4 New precedents / CLAUDE.md recommendations

- **Popup-lifecycle continuation state (D-R4-2 class).** When a service-worker-hosted command handler invokes a popup-swap-then-restore pattern (`setPopup(A) → openPopup() → setPopup(default)`), `async`/`await` across the `openPopup()` boundary is unsafe under SW teardown. The synchronous `.catch().finally()` chain is the correct shape. Consider promoting to a C-11-adjacent correctness check in a future design-review round.
- **Inline-vs-imported helper drift.** D-R4-1 reinforces that when R2 prescribes "reused verbatim" for a shared helper, R3 inline re-implementation — even when functionally equivalent — should surface as a [code-reviewer] HIGH. Already covered by existing reviewer norms; no CLAUDE.md change needed.
- **UAT observability limits.** UAT-3's "popup-to-popup transition when user presses Alt+K while B-022 is focused" is difficult to observe definitively because MV3 tears down the first popup atomically on focus loss while the SW command listener fires the second popup — no intermediate observable state. Same class as the S26 chrome-mock gap for popup-lifecycle races. Flagged as a test-infra follow-up (not a sprint blocker).

### §40.10.5 Test count reconciliation

§40.6 projected "baseline 1119 + ~20-25 new ≈ ~1139-1144 passing." Actual: **1119 → 1163 (+44)**. Overage driven by R5 expanding the empty-state sub-state matrix (AC19 a-h each got dedicated cases) and the dual-variant dispatch table (tabId-variant vs itemId-variant matrix × live/not-live × same-window/cross-window) — both richer than the projection.

### §40.10.6 Final file manifest (reconciles §40.4.5)

**NEW:**
- `popup/group-jump-popup.html`, `popup/group-jump-popup.js`, `popup/group-jump-popup.css`
- `tests/b023-group-jump-popup.test.js`
- `docs/design/40-b-023-group-jump-popup.md` (this chapter)
- `docs/findings/sprint-27.md`
- `docs/UAT_B-023.md`
- `docs/user-manual/group-jump-popup.md` (R7)

**MODIFIED:**
- `manifest.json` (version bump only — no new permissions, no new command; `group-jump` pre-existing)
- `CHANGELOG.md`
- `background/service-worker.js` (+SW `chrome.commands.onCommand` listener, ~20 LOC including the D-R4-2 `.catch().finally()` reshape)
- `docs/BACKLOG.md`, `docs/BACKLOG_BOARD.md`, `docs/SPRINT.md`
- `docs/SPRINT_FINDINGS.md` (index entry for S27)
- `docs/SOLUTION_DESIGN.md` (root index §40 entry added)

**UNTOUCHED (verified at close):**
- `popup/popup.{html,js,css}` (B-022) — zero regression risk validated
- `shared/highlight.js`, `shared/favicon.js`, `shared/group-picker-core.js` — reused as-is, no modifications

---

**R6 verdict: CHAPTER CLOSED — READY FOR SPRINT CLOSE.**
