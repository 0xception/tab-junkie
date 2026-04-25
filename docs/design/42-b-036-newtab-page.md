# §42 — B-036 New Tab Page Replacement (R2 Design)

**Sprint:** 29
**Tier:** Full (L)
**Status:** R2 complete (2026-04-23) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.10 (broadcast architecture — `MSG_STATE_CHANGED` delivery model), §16/§17 (B-010 live tab reflection — `liveStates` shape and indicators), §19 (B-021 inline filter — 150 ms debounce + highlight contract), §30 (B-029 `shared/group-picker-core.js` — pure row builder), §34 (B-052 fuzzy search index — `buildIndex` / `search` / `diffAndPatch`), §39 (B-022 quick-search popup — popup-lifecycle C-11 precedent, `shared/highlight.js` + `shared/favicon.js`), §40 (B-023 group-jump popup — fire-and-forget-write-before-focus pattern), §41 (B-035 standalone window — broadcast-receiver-surface precedent), §26 (B-055 Open Tabs / `MSG_LIST_ITEMS` response shape), §28 (B-014 window badges — `windowMap`)
**Blocked by:** none — all dependencies done.
**Out-of-scope (explicit):** (a) theme selection UI (B-037); (b) settings UI beyond the B-039 enable toggle (B-089 owns the settings panel); (c) bookmark creation / editing / deletion — the new tab page is a read-only grid; (d) drag-reorder on the new tab page; (e) recency / most-used / jump-count ordering; (f) widgets, clock, background image customisation; (g) Ctrl+T shortcut handling (browser-owned); (h) sub-groups rendered as nested sections (flat breadcrumb labels only in v1 — see §42.3 D-3).

---

## §42.1 Overview

B-036 replaces the current ten-line `newtab/newtab.html` stub with a full new-tab surface: a prominent web-search input at the top, a live bookmark grid organised by groups with per-row live / active / drifted indicators, and a quick-filter input that narrows the grid via the existing B-052 fuzzy search index. The feature is **opt-in**: on every fresh new tab the page reads the `tj:prefs.newTabOverride` preference (B-039) and — when the preference is `false` (the default) — immediately hands off to the browser default new-tab behaviour, never rendering the grid. When enabled, the page boots with a skeleton placeholder, parallel-fetches items + groups + preferences via the existing `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` + `MSG_GET_PREFERENCES` handlers (all `readyPromise`-gated), attaches a `chrome.runtime.onMessage` subscriber for `MSG_STATE_CHANGED` broadcasts to keep the live indicators fresh (§10.10), and renders a desktop-width multi-column grid using the same CSS custom-property tokens that the sidepanel uses today. Click-to-navigate dispatches the existing `MSG_NAVIGATE_TO_ITEM` contract verbatim — the SW internally opens a new tab (or activates an existing claim) and bumps `lastAccessedAt`. No new storage partition, no new message type, no new permission (`search` already ships as of v1.18.0 for B-022; all other calls are already granted). The web-search input submits via `chrome.search.query({ disposition: 'NEW_TAB' })`, opening results in a new tab so the user's new-tab surface stays on the grid between queries. The visual design reuses `sidepanel.css`'s token palette and `theme-init.js` for FOUC-free theme resolution; the HTML/JS/CSS for the grid are new files under `newtab/` (vanilla DOM — we do NOT import the 6 879-LOC `sidepanel/sidepanel.js` module into every new tab because first-paint budget cannot absorb it; see §42.3 D-1). B-036 is the first non-sidepanel surface that ships its own JS-and-CSS bundle targeting the same storage contract, and the first pure broadcast receiver to consume `MSG_STATE_CHANGED` via a dedicated delta-apply path rather than via a shared module.

## §42.2 Existing-State Reality Check

**Today (2026-04-23 on `release/v2`):**

- `manifest.json:14-16` already wires `chrome_url_overrides.newtab` to `newtab/newtab.html`. Opening a new tab in Edge today immediately hits the Tab Junkie stub.
- `newtab/newtab.html` is a 10-line placeholder: `<!doctype html>` + `<html>` + `<head>` with a `<title>` + `<body>` with a single `<p>` telling the user "UI not yet built."
- There is no `newtab/newtab.js`, no `newtab/newtab.css`, no `newtab/theme-init.js` — `newtab/` holds exactly one file.
- The `search` permission is granted at `manifest.json:6` (reserved for B-022 quick search; B-036 reuses it). No other new permission is required.
- All fetch primitives the page needs — `MSG_LIST_ITEMS`, `MSG_LIST_GROUPS`, `MSG_GET_PREFERENCES`, `MSG_NAVIGATE_TO_ITEM`, `MSG_STATE_CHANGED` broadcast — already ship and are exercised in test by `tests/b054-sidepanel-shell.test.js`, `tests/b022-quick-search.test.js`, `tests/b035-standalone-window.test.js`, and others.
- The broadcast scope constants are centralised in `shared/scopes.js` and exported as `SCOPE.ITEMS` / `SCOPE.GROUPS` / `SCOPE.PREFERENCES` / `SCOPE.LIVE_STATE` / `SCOPE.WINDOW_MAP`. The newtab subscriber can import these directly without reaching into `background/`.
- The B-052 search index (`sidepanel/search-index.js` — poorly named by location; is pure and DOM-free) is already imported by `popup/popup.js:32` as a cross-surface reuse. B-036 imports the same module from the same path.
- Per-item visual states (live / active / drifted / audible / window badge) are encoded today in `sidepanel/sidepanel.js`'s `buildItemRow` (~200 LOC tightly coupled to sidepanel DOM structure). B-036 needs equivalent indicators but CANNOT import that function — it must build its own row primitive that consumes the same `liveStates` + `driftRecords` inputs and renders the same CSS classes. See §42.3 D-1.

**No pre-existing B-036 code, no partial implementation, no unreviewed artefacts. Greenfield.**

## §42.3 Design Decisions (D-1 through D-7)

### D-1 — Render strategy: vanilla DOM in `newtab/newtab.js` (chosen) vs importing `sidepanel/sidepanel.js`

**Choice:** **Option (a) — vanilla DOM in a new `newtab/newtab.js` module.** The module is small (~400 LOC target: bootstrap + render + filter + broadcast + event handlers) and imports **only pure helpers** from shared modules — it does NOT import the sidepanel module as a whole.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Vanilla DOM, selective shared-helper imports | Narrow module bounded by the newtab's own scope; first-paint budget unconstrained by sidepanel bloat; zero drag/drop/dialog/bulk-action code loaded per new tab; no accidental coupling to sidepanel-only state (`_selection`, `_dragSrcGroupId`, `_cachedLiveStates` module singletons, `_groupPickerHighlightIndex`, etc.); module can evolve independently as UX requirements for new-tab vs sidepanel diverge | Duplicates a subset of sidepanel render logic (row builder, group section builder, live-state mapping) — ~150-200 LOC of structural overlap; R4 [code-reviewer] will scrutinise for drift risk | **Chosen** |
| (b) Import `sidepanel/sidepanel.js` verbatim (B-035 precedent) | Maximum reuse — dialogs, drag, multi-select, context menus all "free" | 6 879 LOC of JS + 1 743 LOC of CSS loaded on every new tab the user opens. First-paint budget of 200 ms P95 at 500 items is already tight; adding module-load + DOM-shell + chrome-API-listener-registration cost is unacceptable. Would force the newtab to render in sidepanel-narrow-column layout, defeating D-3's multi-column choice. Pulls in sidepanel-only features (drag, multi-select, bulk bar) that have no newtab use case but still execute on boot. Attaches the sidepanel's global `chrome.runtime.onMessage` listener to every new tab → N-way broadcast receiver amplification. The B-035 precedent does NOT apply: B-035 is one window-per-install that the user manually opens; B-036 is every-new-tab, which can be dozens per session | Rejected |
| (c) New shared `shared/bookmark-grid.js` render module imported by both sidepanel and newtab | Medium term the "correct" factoring; no duplication | Out of scope for v1. Extracting `buildItemRow` + `buildGroupSection` out of sidepanel.js is a multi-sprint refactor (the sidepanel versions depend on `_selection`, `_collapsedGroups`, `_windowOrdinalMap`, `_cachedLiveStates`, and a dozen other module-singletons). Doing it now blocks B-036. Flagged as a S29+ follow-up in §42.9 | Deferred |

**What B-036 imports (the "selective shared-helper imports" contract):**

| Helper | Source | Why imported |
|---|---|---|
| `buildHighlightedText` | `shared/highlight.js` | Match highlighting on filter results (AC7). Byte-for-byte identical semantics to sidepanel / popup. |
| `isSafeFaviconUrl` | `shared/favicon.js` | XSS-safe favicon URL guard for row avatars (B-022 §39 R4 H-1 precedent). |
| `buildIndex`, `search`, `diffAndPatch` | `sidepanel/search-index.js` (module is pure — DOM-free; name is legacy per §34.1 comment) | B-052 fuzzy filter (AC7 + AC18). Popup already imports these; newtab adds a third consumer. |
| `SCOPE` | `shared/scopes.js` | Broadcast scope comparison without reaching into `background/`. |
| Message-type constants | `shared/messages.js` | `MSG_LIST_ITEMS`, `MSG_LIST_GROUPS`, `MSG_GET_PREFERENCES`, `MSG_NAVIGATE_TO_ITEM`, `MSG_STATE_CHANGED`. |
| `buildGroupPickerRows` / `applyGroupPickerFilter` | `shared/group-picker-core.js` | **NOT imported.** B-036 renders grouped item rows, not picker rows (different shape). Noted here so R3 does not accidentally reuse the wrong primitive. |

**What B-036 does NOT import:**

- `sidepanel/sidepanel.js` — any piece.
- `sidepanel/sidepanel.css` — new CSS file; see §42.3 D-8 (not a decision point per R1, but documented for clarity under §42.3 D-1 / §42.4).
- Any `background/**` module (write-boundary enforcement — ESLint-blocked; documented in §4 + §6).

**Rationale:** first-paint budget and feature isolation both point to vanilla DOM with selective reuse. The ~150-200 LOC of duplicated row-and-section builder logic is a known cost accepted to keep the surface cheap. If sidepanel drift becomes observable, C-12-candidate (see §41.10.4) applies: add an audit hook that compares the two row primitives at test time.

**Blast radius:** contained to the `newtab/` directory. No sidepanel changes, no manifest changes.

### D-2a — Disabled-pref UX: RESCINDED at Sprint 29 close (B-039 dropped — newtab is always on)

> **Sprint 29 close (RESCINDED):** This decision was rescinded at sprint close because B-039 (the "Replace new tab page" preference toggle) was dropped entirely. The Manifest V3 platform does not allow runtime removal of `chrome_url_overrides.newtab`; once the manifest declares the override, the extension cannot hand the new-tab surface back to the browser's default behavior without being uninstalled. Both the original R2 choice (`about:blank` redirect) and the late-sprint revert (in-place disabled-state page) failed to deliver what the user actually wanted from an "OFF" state — the browser's true default new tab page. Product-owner decision: ship the newtab page **always-on**. Users who want their browser default back must disable or uninstall Tab Junkie via the browser's extension management page.
>
> **Shipped behavior (Sprint 29 close):**
>   - `newtab/newtab.js` boot path skips any pref read; the grid renders unconditionally on every new tab open.
>   - There is no `_renderDisabledState` helper, no `.newtab-disabled-state*` CSS, no `MSG_GET_PREFERENCES` import in newtab code.
>   - The newtab still subscribes to `MSG_STATE_CHANGED` broadcasts for the `items`, `groups`, and `liveState` scopes. The `preferences` scope is received but is a no-op (B-038 display-mode and B-040 auto-collapse do not affect newtab rendering).
>   - The `newTabOverride` key remains in `DEFAULT_PREFERENCES` for backward compat — removing it would require a schema migration. No UI surface exposes it; no code reads it.
>   - The B-039 settings toggle ("Replace new tab page with Tab Junkie") was removed from the sidepanel Settings dialog. The "New tab page" section no longer exists.
>   - Tests `B-036 AC3 + AC11 (B-039 dropped at S29 close)` and `B-036 §42.3 D-7 preferences (B-039 dropped at S29 close)` pin the new contract.
>
> The original R2 alternatives table below is preserved for historical context — the trade-off chain explains why neither (b) "in-place disabled-state page" nor (c) "about:blank redirect" was satisfactory, and why dropping the toggle was the cleanest resolution.

---

**Original D-2a (R2 choice — RESCINDED):** When `newTabOverride === false`, the page calls `window.location.replace('about:blank')` inside the earliest possible synchronous block after reading the preference. The user sees the Tab Junkie page for one frame at most; the URL bar shows `about:blank`; the browser's new-tab user experience degrades gracefully to a blank page. R1 recommended option (b) "minimal disabled state + CTA"; R2 **overrides to option (c) — `about:blank` redirect**, see alternatives table below.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `chrome.tabs.update({url: <browser-default>})` from the page | Attempts to give the user their "original" new tab (Edge home, Bing, configured new-tab URL) | The extension cannot know the user's configured new-tab URL without `chrome.tabs.setAsDefault` or reading Edge internal prefs — neither are exposed to extensions. Using a hard-coded URL (`edge://newtab` or `about:newtab`) violates Edge's cross-origin rules from extension pages and fails silently. Adds complexity for zero gain | Rejected |
| (b) Minimal disabled-state UI with "Enable in Tab Junkie settings" CTA | Discoverable; no redirect flash | The feature is default-OFF; every first-run user hits this state. Showing a permanent "we took over your new tab but didn't do anything useful" message is a worse UX than the zero-friction `about:blank` redirect. If the user wants the grid, they toggle it ON; they don't need a constant reminder. The feature is OPT-IN per AC2 — the existence of the manifest override is what enables discovery via the settings panel (B-089), not a first-run banner | Rejected |
| (c) `window.location.replace('about:blank')` | Simplest possible; zero JS state beyond the preference read; no flash beyond the one-frame Tab Junkie HTML parse before the replace fires; fits the "opt-in, default-OFF" semantics cleanly; `about:blank` is the MV3-safe navigation target for any extension page | One-frame flash of Tab Junkie HTML before `about:blank` loads (unavoidable unless we render the HTML shell to match `about:blank` exactly — not worth the complexity) | **Chosen** |
| (d) `window.history.back()` | Returns user to the page they were on before opening the tab | Fails on a freshly opened tab with no history; leaves the user on the Tab Junkie blank page | Rejected |

**Flash-minimisation technique:**

- `newtab/newtab.html` body renders EMPTY (no visible DOM) before JS boots. The skeleton placeholder (§42.6) is injected by `newtab.js` only AFTER the preference read resolves to `true`.
- `newtab/newtab.css` sets `body { background: var(--color-bg); }` matching the sidepanel palette so the one-frame flash is the user's theme background — not a visually disruptive white-then-grey transition.
- The `<script type="module" src="newtab.js">` is placed in `<head>` with no `defer` (MV3 extension pages run `type="module"` scripts after the DOM is ready regardless, so explicit `defer` is redundant) — the script executes as early as possible.
- Preference read uses the existing `MSG_GET_PREFERENCES` handler which is `readyPromise`-gated; SW cold start may add ~20-50 ms, during which the body is still empty (no visible skeleton yet). The skeleton renders only on the enabled branch.

**Rationale:** option (c) is the zero-state, zero-friction choice. Users who enable the grid get the grid; users who don't get a near-instant `about:blank`. No persistent "we intercepted your tab" UI.

**Edge compatibility:** `window.location.replace` is universal; `about:blank` is universal. No version gate.

**Blast radius:** confined to the boot branch. Toggling the preference ON re-enables the grid without any data cleanup.

### D-2b — Web-search submission: `chrome.search.query({ disposition: 'NEW_TAB' })` (chosen)

**Choice:** On Enter in the search input (or on click of the submit button), the page calls `chrome.search.query({ text: query, disposition: 'NEW_TAB' })`. Search results open in a new tab; the newtab surface itself stays open and retains its filter state.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `chrome.search.query({ text, disposition: 'NEW_TAB' })` — SW-free client-side dispatch | Uses the user's configured default search engine (Bing on Edge, Google on Chrome, DuckDuckGo if configured); opens results in a new tab so the newtab remains available for more searches; `search` permission already granted for B-022 | Requires the `search` API to be accessible from extension-page context (not SW-only). Chromium MV3 docs confirm it is | **Chosen** |
| (b) `chrome.search.query({ text, disposition: 'CURRENT_TAB' })` | Keeps the user on a single tab | Destroys the newtab state on every search; user must re-open a new tab to see the grid again; defeats the "grid + search" UX promise | Rejected |
| (c) Form submission to a hard-coded search URL (`https://bing.com/search?q=${encoded}`) | Zero API dependency | Bypasses the user's default-engine setting; opens results on the wrong engine for non-Bing users; fragile to URL schema changes | Rejected |
| (d) `chrome.search.query` from the SW via `MSG_SEARCH_QUERY` | Consolidates API surface in SW | Adds a new message type for zero gain — the SW does no storage work, so moving the API call there is pure overhead | Rejected |

**SW-context feasibility check (C-8):** `chrome.search.query` is NOT SW-only. It is reachable from extension-page contexts (sidepanel, popup, newtab) and from the SW equally. The newtab calls it directly — no IPC needed. Verified against MDN (`chrome.search.query` has no SW restriction; requires only the `search` permission).

**Edge compatibility:** `chrome.search.query` shipped in Chrome 87 / Edge 87 (October 2020). Universal compatibility.

**Rationale:** `chrome.search.query` with `NEW_TAB` is the MV3-idiomatic choice. Uses the user's configured engine, preserves newtab state across searches, zero new permission, zero new message type.

**Blast radius:** contained to the search-input event handler. ~10 LOC.

### D-3 — Grid layout: CSS multi-column (chosen) over single-column list

**Choice:** **CSS Grid with `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))`** — responsive multi-column layout where the number of columns scales to the viewport width (typical desktop: 3-5 columns; narrow desktop: 2; very wide: 5-6). Each group section is a single grid item whose internal layout is a vertical flex list of item rows.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Single-column list (sidepanel mirror) | Reuses sidepanel visual rhythm; zero layout work | Wastes the ~1 000-2 000 px of horizontal space a desktop new tab provides; forces the user to scroll for content that would fit on-screen in multi-column; defeats the "new tab page as dashboard" UX goal | Rejected |
| (b) Flex-wrap tiles (one row per tile) | Simple | No grouping — tiles would be loose, losing the "organised by group" semantic of AC6. If each tile is a group, flex-wrap works; see (c) | See (c) |
| (c) CSS Grid `repeat(auto-fill, minmax(320px, 1fr))` per-group-section | Each group is a grid item, internal layout is flex-column of item rows; naturally responsive; empty grid cells do not break layout; native browser layout perf; no virtualisation needed for <500 items | Grid item height varies by group size; tall groups may force row tracks to stretch. Mitigation: `grid-auto-flow: dense` + `align-items: start` keeps short groups from padding to match tall ones | **Chosen** |
| (d) Masonry layout (CSS `grid-template-rows: masonry`) | Perfect height-packing for variable-length groups | `masonry` is draft-stage; Chromium flag-gated; Edge support inconsistent. Not safe for ship | Rejected |

**Responsive breakpoints:**

- `< 640 px` viewport: single column (narrow browser windows, docked sidepanel coexistence).
- `640-1024 px`: 2 columns.
- `1024-1440 px`: 3 columns.
- `1440-1920 px`: 4 columns.
- `> 1920 px`: 5 columns (cap).

Achieved declaratively via `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` — no explicit `@media` queries needed (CSS Grid computes column count from the viewport width and the `minmax` floor).

**Group-section internal structure:**

```
.group-section                       (grid item; border + header + items)
  .group-header                      (name + count pill)
  .group-items                       (flex column of .item-row)
    .item-row                        (favicon + title + url + indicator dots)
      <img> favicon (with isSafeFaviconUrl guard)
      .item-text
        .item-title                  (textContent + <mark> highlight fragments)
        .item-url                    (textContent + <mark>)
      .item-indicators
        .live-dot (if live)
        .active-dot (if active)
        .drifted-dot (if drifted)
```

**Rationale:** multi-column is the only layout that respects desktop real estate. The `auto-fill, minmax(320px, 1fr)` pattern is well-supported in Edge and Chromium and requires no JS-side layout code.

**Blast radius:** isolated to `newtab/newtab.css`. Trivially tweakable (change `320px` to adjust column min-width).

### D-4 — Fuzzy-filter source: import `sidepanel/search-index.js` as-is (chosen)

**Choice:** B-036 imports `buildIndex` + `search` + `diffAndPatch` from `sidepanel/search-index.js` and consumes the B-052 search index as the popup already does.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Import the existing B-052 module | Zero duplication; perf headroom already validated (§34.8: P95 0.152 ms at 1 000 items); popup already a consumer | Module path is `sidepanel/search-index.js` — its name encodes legacy location. Cross-surface import is not aesthetically clean but is functionally correct. Rename is a separate sprint's scope | **Chosen** |
| (b) Duplicate the index in `newtab/search-index.js` | Matches the "newtab has its own code" philosophy from D-1 | Duplicates battle-tested code for no functional reason; doubles the maintenance burden for every B-052 bug fix; §34's invariants (hash, diff, freeze) must be kept in two places | Rejected |
| (c) Extract to `shared/search-index.js` (rename + relocate) | Semantically cleaner | Out of scope for v1 (S29 is prefs-heavy; the rename would ripple through `sidepanel/sidepanel.js`, `popup/popup.js`, and `tests/b052-fuzzy-search-perf.test.js`). Flagged for S30+ | Deferred |

**Import contract:**

```js
import {
  buildIndex,
  search,
  diffAndPatch,
} from '../sidepanel/search-index.js';
```

The path traverses `../sidepanel/` from `newtab/`. This is the same traversal pattern `popup/popup.js:32` already uses — precedent established.

**Filter integration (AC7):**

- On boot (after `MSG_LIST_ITEMS` resolves), build the index once: `_index = buildIndex(items)`.
- On quick-filter input, debounce 200 ms (AC7 contract; note this is the B-036-specific debounce — sidepanel uses 150 ms per B-021, and the 200 ms in AC7 is a deliberate R1 choice not to revisit here).
- On debounce fire, call `search(_index, query)` → returns `SearchEntry[]` → toggle `hidden` on matching / non-matching `.item-row` nodes.
- Highlight integration: for visible rows, replace the title / url spans' contents with `buildHighlightedText(text, query)` fragments.
- On `MSG_STATE_CHANGED` broadcast with scope `items`, refetch via `MSG_LIST_ITEMS` and run `diffAndPatch(_index, nextItems)` — the delta tells the newtab how to update the index and DOM incrementally (or fall through to full re-render per §34.7).

**Rationale:** zero duplication, zero new code, proven perf.

**Blast radius:** none — the import is read-only; the module has no module-level mutable state.

### D-5 — C-11 SW-write enumeration (BLOCKING GATE — non-vacuous)

**Audit summary:** the newtab surface fires exactly TWO SW messages on the click-to-navigate path. Only one triggers a SW-side write, and that write is fire-and-forget (the awaited response does not affect the newtab's own correctness) — see enumeration below.

**Tear-down risk:** the newtab **does NOT tear down** when `MSG_NAVIGATE_TO_ITEM` resolves, for two reasons:
1. **New-tab opens (saved-not-live):** SW calls `chrome.tabs.create({ url: item.url })` — creates a SEPARATE tab. The newtab itself is unaffected; its JS context persists; the user can return to it via tab switch.
2. **Existing-tab activation (saved-already-live):** SW calls `chrome.tabs.update(otherTabId, { active: true })` + `chrome.windows.update(windowId, { focused: true })`. This activates a DIFFERENT tab. The newtab loses focus but is not unloaded — modern Chromium / Edge keep background-tab JS contexts alive (with throttling, but the context survives). Any `await` in the newtab continues to resolve.

**Contrast with popup B-022 (D-UAT-3, §39.10.4):** popups tear down the moment focus shifts. Newtab is a full tab and does NOT. The C-11 risk for B-036 is therefore LOWER than the popup precedent, BUT NOT ZERO, and the fire-and-forget pattern is retained defensively.

**Why retain fire-and-forget defensively:**
- Chromium tab throttling in the background can suspend JS execution unpredictably (tabs marked "discarded" after low memory). An awaited `sendMessage` may resolve after the tab resumes — no data is lost, but the ordering invariant is unclear.
- A future polish item may add an optional "close the newtab after navigation" behaviour (`chrome.tabs.remove(currentTab.id)` after the nav fires). If that ships, C-11 becomes SHARP — same semantics as B-022. Baking the fire-and-forget pattern in now means the future polish does not have to retrofit it.
- Cost of fire-and-forget vs await is negligible (one `.catch(() => {})` instead of `try { await … } catch {}`).

**Enumerated SW-write messages fired from the newtab click path:**

| # | Message | Storage write? | Fire-and-forget? | Reason |
|---|---|---|---|---|
| 1 | `MSG_NAVIGATE_TO_ITEM` with `{ itemId }` | YES — SW bumps `lastAccessedAt` via `updateItem` (§background/messages/storage-handlers.js:386) | **Fire-and-forget-before-focus-shift** | Fire via `chrome.runtime.sendMessage({type: MSG_NAVIGATE_TO_ITEM, payload: {itemId}}).catch(() => {})` — do NOT `await`. The SW itself internally performs the focus shift (`chrome.tabs.update({active:true})`); the newtab is a bystander. The newtab does not need the response to do its own UI work (AC10: grid stays rendered; no UI state depends on the response). |
| 2 | `MSG_NAVIGATE_TO_ITEM` with `{ tabId, windowId }` | NO — tabId-only variant is a pure tab focus (§background/messages/storage-handlers.js:318-341); broadcast-suppressed per B-055 §26.12.4 | **Fire-and-forget** | Same pattern as (1) for consistency; even though there is no write, the focus shift is a SW-driven tab activation and a late-arriving response is not useful to the newtab. |

**NOT fired from the newtab:**

- `MSG_RECENCY_ADD` — B-036 does NOT implement recency ordering in v1 (out of scope per AC and §42.1). The B-022 popup is the only surface that writes to `tj:recency`.
- Any `MSG_CREATE_*` / `MSG_UPDATE_*` / `MSG_DELETE_*` — newtab is read-only (AC12 + AC13 + out-of-scope).
- `MSG_CLOSE_TABS`, `MSG_PROMOTE_TAB`, `MSG_DEMOTE_ITEM` — all out of scope.
- `MSG_SET_PREFERENCES` — the settings panel (B-089) writes prefs; newtab only reads.

**C-11 ordering contract (MUST follow — R3 implementation gate):**

```js
// newtab/newtab.js — click-to-navigate handler (shape contract)
itemRow.addEventListener('click', (event) => {
  event.preventDefault();
  const itemId = itemRow.dataset.itemId;
  if (!itemId) return;
  // C-11: fire-and-forget BEFORE any awaits. Do NOT `await`. Do NOT put
  // UI-state updates on the response. The SW handles the focus shift
  // internally; the newtab's job is to queue the message and return
  // control to the event loop as fast as possible.
  chrome.runtime.sendMessage({
    type: MSG_NAVIGATE_TO_ITEM,
    payload: { itemId },
  }).catch(() => {
    // Swallow all errors — the newtab has no error-path UI for failed
    // navigation beyond the existing `showToast` sidepanel pattern, which
    // we deliberately do NOT port here (D-1 isolation). Silent failure
    // is acceptable because the user will retry the click if nothing
    // happens.
  });
});
```

**`applyFilter` ordering:** quick-filter input debounce is entirely client-side (no IPC). No C-11 exposure.

**`MSG_STATE_CHANGED` subscription ordering:** the newtab subscribes via `chrome.runtime.onMessage.addListener` at module scope. Broadcasts are receiver-side events; no outbound messages are triggered by receipt. No C-11 exposure.

**Search query ordering:** `chrome.search.query` fires an extension API call that opens a new tab; it is NOT a `chrome.runtime.sendMessage` call and does NOT touch the SW at all. No C-11 exposure.

**D-5 verdict:** **Non-vacuous but contained.** Exactly one `MSG_NAVIGATE_TO_ITEM` call, dispatched fire-and-forget before any awaits. R3 MUST implement the handler shape above. If R3 adds any other SW-write path (recency, prefs write, anything else), R3 MUST update this section and explicitly re-walk C-11 before proceeding.

**Blocking-gate status:** **PASS** — all SW-write paths enumerated with explicit fire-and-forget contract. R3 is cleared to proceed.

### D-6 — Storage-read pattern: `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS, MSG_GET_PREFERENCES])` (chosen)

**Choice:** On boot, after confirming the enabled branch, the newtab fires three messages in parallel via `Promise.all` and renders once all three resolve. Matches the sidepanel bootstrap pattern (`sidepanel.js:6822-6862`) and the B-035 standalone bootstrap (which runs the sidepanel bootstrap verbatim).

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS, MSG_GET_PREFERENCES])` — three messages in parallel | Minimises total round-trip latency (~1 network RTT + SW resolution for the slowest of the three); matches sidepanel pattern; three broadcast-aware handlers | Three messages instead of one | **Chosen** |
| (b) Extend `MSG_LIST_ITEMS` to return groups + preferences in its response | One round-trip | New message contract (response-shape change); breaks consumers (sidepanel, popup, standalone all expect the current shape); violates "no new message types" principle | Rejected |
| (c) Serial: `MSG_GET_PREFERENCES` first (to check enabled), then items + groups | Avoids fetching items when disabled | The enabled branch is the main path — this optimises for the rare OFF case at the cost of the common ON case. Preference-read already happens first in the boot sequence (to decide whether to redirect); items + groups fetch only runs after the enabled branch is taken. So the serial ordering is already in place for free; the PARALLEL nature applies to items + groups fetch after the pref check passes | See corrected flow |

**Corrected flow (final):**

```
DOMContentLoaded
  → MSG_GET_PREFERENCES (serial, single message)
    → if newTabOverride === false: window.location.replace('about:blank'); HALT
    → else: render skeleton
      → Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])
        → buildIndex(items)
        → renderGrid(items, groups, liveStates, driftRecords, windowMap)
        → subscribe to MSG_STATE_CHANGED
```

So it is effectively **one serial call followed by two parallel calls**. `MSG_GET_PREFERENCES` must complete first because its result gates whether the rest of the bootstrap runs.

**Cold-start:** all three messages are `readyPromise`-gated in the SW. If the SW is cold when the user opens a new tab, the messages queue and resolve after migration completes (~100-300 ms typical). The skeleton covers the gap (AC4 + AC23).

**Rationale:** option (a) with the serial pref-check preamble is the correct shape. Matches existing patterns; no new message contracts.

**Blast radius:** none — all messages already exist.

### D-7 — `MSG_STATE_CHANGED` subscription pattern (chosen)

**Choice:** The newtab attaches a `chrome.runtime.onMessage.addListener` at module scope during the enabled-boot path. The listener receives **all** `MSG_STATE_CHANGED` broadcasts from the SW, filters by `scope`, and re-fetches + re-renders accordingly. The subscription is fresh per-tab-open (newtab is a page, not a persistent SW; each new tab gets its own JS realm with its own listener).

**Subscription lifecycle:**

- Attached in `newtab.js` after the enabled check passes. Disabled-path pages never attach a listener (they redirect to `about:blank`).
- Torn down implicitly when the tab closes or navigates away (browser reclaims the JS realm).
- Survives SW cold-start-mid-session: the listener is attached to `chrome.runtime`, which is stable across SW restarts. The SW side re-attaches its broadcaster on cold start (`broadcast` helper in `background/broadcast.js`); messages sent post-restart reach the newtab's still-live listener.

**Scope handling (matches sidepanel pattern at `sidepanel.js:5631-5786`):**

| Scope | Newtab behaviour |
|---|---|
| `'items'` | `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` → `diffAndPatch(index, items)` → apply delta or full rebuild. Re-apply active filter query if any. |
| `'groups'` | Same as `'items'` — re-fetch both and re-render. (Newtab group order depends on `sortOrder` + name — a group rename/reorder requires rebuild.) |
| `'liveState'` | `MSG_LIST_ITEMS` (liveStates are in its response) → patch `.live-dot` / `.active-dot` classes on affected rows without full rebuild. Lightweight path; mirrors sidepanel `refetchAndPatchLiveState` at a smaller scope. |
| `'windowMap'` | Either no-op (newtab does not render window badges in v1 — see §42.9 follow-up) OR re-fetch windowMap via `MSG_LIST_ITEMS` and update badge attributes. **R3 decision:** v1 ships WITHOUT window badges per D-1 isolation (not AC'd in R1); the newtab does not need to handle `'windowMap'` beyond ignoring it. Noted for §42.9 follow-up. |
| `'preferences'` | `MSG_GET_PREFERENCES` → if `newTabOverride` flipped to `false`, `window.location.replace('about:blank')` on next tick (graceful teardown). Otherwise apply theme changes if theme pref changed. |

**Drift detection:** `driftRecords` are in the `MSG_LIST_ITEMS` response. On every refetch, the newtab re-derives per-row drifted state and toggles the `.drifted-dot` class. No separate drift broadcast scope — drift changes are delivered via the `items` scope (broadcast.js at `background/storage/drift.js` already triggers items broadcasts on drift record mutations; no new plumbing needed).

**XSS / message-validation posture:**

```js
chrome.runtime.onMessage.addListener((msg, sender) => {
  // B-022 H-2 precedent: reject messages that do not originate from this
  // extension's own runtime. Prevents any cross-extension message spoof.
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type !== MSG_STATE_CHANGED) return;
  const scope = msg.payload?.scope;
  // scope dispatch (see table above)
});
```

**Rationale:** standard broadcast-receiver pattern, same as sidepanel. Nothing novel. The B-035 precedent (§41.10.4 P-1 "Remote-surface broadcast audit rule") applies: the newtab is the SECOND pure-receiver surface after standalone window. All broadcast paths have already been audited in S28 for delta-completeness.

**Blast radius:** isolated to `newtab/newtab.js`. Listener detach is automatic on tab close.

## §42.4 Architecture

### §42.4.1 Component Diagram (text)

```
┌─────────────────────────────────────────────────────────────────┐
│ newtab/newtab.html                                              │
│   ├─ <link rel="stylesheet" href="newtab.css">                 │
│   ├─ <script src="theme-init.js"> (synchronous, pre-paint)     │
│   └─ <script type="module" src="newtab.js">                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ newtab/newtab.js — ES module (~400 LOC target)                 │
│                                                                 │
│  Imports:                                                       │
│    shared/highlight.js       — buildHighlightedText             │
│    shared/favicon.js         — isSafeFaviconUrl                 │
│    shared/scopes.js          — SCOPE                            │
│    shared/messages.js        — MSG_* constants                  │
│    sidepanel/search-index.js — buildIndex, search, diffAndPatch │
│                                                                 │
│  Responsibilities:                                              │
│    (a) Boot: check newTabOverride → render skeleton or redirect  │
│    (b) Fetch items + groups (parallel)                          │
│    (c) Build search index + render grid                         │
│    (d) Attach MSG_STATE_CHANGED subscriber                      │
│    (e) Quick-filter: debounce input → search → toggle hidden    │
│    (f) Web-search submit → chrome.search.query                  │
│    (g) Click-to-navigate → fire-and-forget MSG_NAVIGATE_TO_ITEM │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ chrome.runtime.sendMessage
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ background/service-worker.js (NO CHANGES)                       │
│   ├─ readyPromise gate                                          │
│   ├─ storage-handlers dispatcher                                │
│   ├─ broadcast helper (SCOPE.ITEMS / GROUPS / LIVE_STATE / …)   │
│   └─ MSG_NAVIGATE_TO_ITEM handler (existing)                    │
└─────────────────────────────────────────────────────────────────┘
```

### §42.4.2 File Manifest

| File | Status | Purpose |
|---|---|---|
| `newtab/newtab.html` | **MODIFIED** (replaces 10-line stub) | DOM shell: search input, filter input, skeleton placeholder, grid container, empty states, error state. |
| `newtab/newtab.js` | **NEW** | Bootstrap + render + filter + broadcast + event handlers. ~400 LOC target. |
| `newtab/newtab.css` | **NEW** | CSS Grid layout + indicator styles + skeleton + empty-state styles. Uses sidepanel CSS variables (`--color-bg`, `--color-fg`, `--color-border`, `--color-accent`, etc.). |
| `newtab/theme-init.js` | **NEW** (content identical to `sidepanel/theme-init.js`) | Pre-paint theme resolver. See §42.4.3 for "duplicate vs symlink vs relative-import" decision. |
| `manifest.json` | UNCHANGED | `chrome_url_overrides.newtab` already wired; `search` permission already granted. |
| `sidepanel/*` | UNCHANGED | No coupling. |
| `shared/*` | UNCHANGED | Read-only imports. |
| `background/*` | UNCHANGED | No new handlers, no new broadcast scopes. |
| `tests/b036-newtab.test.js` | **NEW** | Unit + integration coverage per R1 test scaffold. ~15-20 tests. |
| `docs/UAT_B-036.md` | **NEW at R5** | UAT scaffold; [test-engineer] owns the fill-in during R5. |
| `docs/user-manual/new-tab-page.md` | **NEW at R7** | User-facing documentation. |

### §42.4.3 `newtab/theme-init.js` — duplicate vs relative-import

**Choice:** **duplicate the file byte-for-byte from `sidepanel/theme-init.js`.**

**Rationale:**
- `theme-init.js` is 6 lines of code (per `wc -l`, it is 261 bytes). Duplicating 6 lines of theme-bootstrap code is a zero-maintenance cost vs relative imports (which would require `../sidepanel/theme-init.js` traversal — works but odd).
- Theme-init must run BEFORE the stylesheet parses (FOUC prevention). A `<script src="../sidepanel/theme-init.js">` from `newtab/newtab.html` parses fine in Edge, but the path traversal is uglier than a local file.
- If theme-init ever needs newtab-specific theme handling (unlikely — themes are global per B-037), duplication gives us a natural divergence point.

**Alternative rejected:** `<script src="../sidepanel/theme-init.js">` — functional but aesthetically worse. Defer to R3 if maintenance preference differs; the functional outcome is identical.

### §42.4.4 Data Flow on Boot (B-039 dropped at S29 close — always-on)

```
1. Tab opened (Ctrl+T or new-tab button).
2. Browser loads newtab/newtab.html.
3. <script> theme-init.js runs synchronously — resolves theme class on <html>.
4. Stylesheet (newtab.css) parses — body background painted in theme color.
5. <script type="module" src="newtab.js"> executes.
6. newtab.js renders skeleton placeholder into grid container immediately
   (no pref gate — B-039 dropped; the page is always on).
7. Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS]) fires.
8. On resolve:
     - _items = itemsResp.items
     - _liveStates = itemsResp.liveStates
     - _driftRecords = itemsResp.driftRecords
     - _groups = groupsResp
     - _index = buildIndex(_items)
     - renderGrid() replaces skeleton with group-sections + item-rows.
9. chrome.runtime.onMessage.addListener attached (MSG_STATE_CHANGED subscriber).
10. Focus placed on web-search input (AC11).
```

### §42.4.5 Data Flow on Click-to-Navigate (C-11 critical path)

```
1. User clicks .item-row (or presses Enter with focus on row).
2. Handler reads itemRow.dataset.itemId.
3. chrome.runtime.sendMessage({type: MSG_NAVIGATE_TO_ITEM, payload: {itemId}}).catch(() => {});
     -- FIRE-AND-FORGET. No await. No response-dependent UI state.
4. Handler returns immediately. Event loop frees.
5. Meanwhile, SW handler:
     - Fetches item by id.
     - Checks TabClaims for existing claim.
     - If claim present: chrome.tabs.update(claimedTabId, {active: true}) + windows.update.
       → Newtab loses focus; grid stays rendered in background.
     - If no claim: chrome.tabs.create({url: item.url}).
       → Newtab keeps focus; new tab appears but newtab stays on-screen until
         the user switches to it. On some Edge configurations the new tab
         auto-activates; behaviour matches `chrome.tabs.create`'s default.
     - Bumps lastAccessedAt via updateItem.
     - Broadcasts scope: items (via MUTATION_BROADCASTS).
6. Newtab receives the items broadcast (if still alive) → refetch + diffAndPatch
   → visible state updates (e.g., the newly opened item now has .live-dot).
```

### §42.4.6 Subscription Plumbing (`MSG_STATE_CHANGED`)

- SW `broadcast()` helper (`background/broadcast.js:11`) calls `chrome.runtime.sendMessage` with no target — fans out to all extension pages.
- Newtab's `chrome.runtime.onMessage.addListener` receives the broadcast. Filters by `sender.id === chrome.runtime.id` (XSS / cross-extension posture).
- Listener handler branches by `msg.payload.scope`:
  - `items` / `groups` → Promise.all refetch → diffAndPatch → patch or rebuild DOM.
  - `liveState` → MSG_LIST_ITEMS refetch → update indicator classes only (no DOM rebuild).
  - `preferences` → MSG_GET_PREFERENCES refetch → if `newTabOverride` flipped false, redirect to about:blank; otherwise apply theme change if any.
  - `windowMap` → ignored in v1 (no window badges).

### §42.4.7 Error Paths

- `MSG_GET_PREFERENCES` rejects: fall back to the disabled branch (`about:blank` redirect). Rationale: if we cannot read the pref, we cannot know if the user opted in; the safe default is to honour opt-in semantics by defaulting to the browser's new-tab.
- `MSG_LIST_ITEMS` or `MSG_LIST_GROUPS` rejects: render the error state (AC16) with a Reload button. Reload triggers `window.location.reload()`.
- `chrome.runtime.sendMessage` network-style failure (SW uninstalled mid-session, etc.): caught by `.catch(() => {})` — silent degrade. User retries.
- `chrome.search.query` rejects (no default engine configured, extremely rare): no visible error. User can type manually; worst case nothing happens when they press Enter.

## §42.5 R2 Correctness Checklist (C-1 through C-11)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| C-1 | Storage schema versioned | **N/A** | B-036 makes zero storage writes of its own. No new partitions, no schema migrations. The only storage touched is the read of `tj:prefs.newTabOverride`, which is a pre-existing field owned by B-089 (scaffolding) / B-039 (toggle). B-036 ships the reader only. |
| C-2 | Message contracts typed | **PASS (N/A-style)** | Zero new message types. Consumes existing `MSG_GET_PREFERENCES`, `MSG_LIST_ITEMS`, `MSG_LIST_GROUPS`, `MSG_NAVIGATE_TO_ITEM`, `MSG_STATE_CHANGED` — all documented in `shared/messages.js` with existing JSDoc typedefs. |
| C-3 | SW cold-start safe | **PASS** | Newtab is a page, not the SW. Its own cold-start is a fresh JS realm per tab-open. The SW's cold-start is transparent to the newtab: MSG_GET_PREFERENCES / MSG_LIST_ITEMS / MSG_LIST_GROUPS are all `readyPromise`-gated; the skeleton covers the latency (AC4 + AC23). If the SW terminates mid-session, the newtab's `chrome.runtime.onMessage` listener stays attached to the runtime — the fresh SW's broadcasts reach it on wake. No SW in-memory state survives or needs to survive for the newtab's correctness. |
| C-4 | ID stability | **PASS** | Newtab reads item IDs (ULIDs — §3) via `MSG_LIST_ITEMS`; passes them back via `MSG_NAVIGATE_TO_ITEM`. Zero ID generation, zero persistence, zero drift logic of its own. All drift handling (URL change, rename) flows through the existing SW-side drift detection (§10.7); the newtab only renders the `driftRecords` map it receives. |
| C-5 | Manifest file refs resolvable | **PASS** | `chrome_url_overrides.newtab` → `newtab/newtab.html` is already wired and MUST NOT be modified (AC1). R3 creates `newtab/newtab.js`, `newtab/newtab.css`, `newtab/theme-init.js` — the HTML references these relatively (`./newtab.js`, `./newtab.css`, `./theme-init.js`). R3 MUST create these files before or in the same commit that updates `newtab.html` to reference them, otherwise the manifest-declared page 404s on any new tab. |
| C-6 | Permission minimisation | **PASS** | **Zero new permissions.** `search` (AC5) granted at v1.18.0 for B-022. `tabs`, `storage`, `tabGroups`, `sidePanel` already present. No `windows`, `system.display`, `downloads`, `scripting`, `activeTab`, `alarms`, `notifications`, `host_permissions`. [security-reviewer] at R4 has nothing new to audit on the permission surface. AC22 codifies this check as a test requirement. |
| C-7 | Allow-list direction | **PASS (N/A)** | No new sanitizer, validator, or export surface. All rendered text (titles, URLs, group names, search queries) flows through `textContent` or `shared/highlight.js`'s `buildHighlightedText` — both XSS-safe-by-construction. No `innerHTML`, no string concatenation into DOM. Favicon URLs guarded by `isSafeFaviconUrl`. |
| C-8 | SW-context feasibility | **PASS** | All newtab-side APIs run in extension-page context (content/module), NOT in SW. `chrome.search.query` — verified SW-reachable AND extension-page-reachable per MDN; B-036 uses extension-page context. `chrome.runtime.sendMessage` + `onMessage` — both contexts. `chrome.runtime.getURL` — both contexts (not used in v1). `document.createElement`, `createTextNode`, `querySelector`, `appendChild` — DOM APIs, extension-page context only (newtab IS an extension page). `window.location.replace` — page context only. `Promise.all` — pure JS. No DOM API is called in SW context. |
| C-9 | Empty-state design | **PASS — 8 sub-states enumerated** | See §42.5.1 below for the full table mapping each R1 AC (AC12-AC16 + C-9 enumeration a-h) to specific UI behaviour. |
| C-10 | Off-screen rect feasibility | **N/A** | No `setDragImage`, no `canvas.toDataURL`, no off-screen positioning. Newtab is a read-only surface; drag-reorder is explicitly out of scope per AC-out-of-scope list and §42.1. |
| C-11 | Popup-lifecycle message ordering | **PASS (non-vacuous, contained)** | Full enumeration in §42.3 D-5. Summary: (a) `MSG_NAVIGATE_TO_ITEM` is the ONLY SW-write from the newtab; (b) it is fired fire-and-forget via `chrome.runtime.sendMessage(…).catch(() => {})` BEFORE any awaits or focus-shift-inducing operation; (c) the SW internally performs the focus shift, not the newtab — so the classic B-022 popup teardown race does not directly apply; (d) defensive fire-and-forget pattern retained regardless, per B-022 D-UAT-3 precedent, because future polish items (auto-close newtab on navigate) could make the race sharp. R3 MUST follow the handler shape in §42.3 D-5. Test coverage: one unit test asserts the `sendMessage` is called without `await` on the click path; one integration test asserts the sequence `sendMessage → (other DOM work allowed) → return from handler`. |

### §42.5.1 C-9 Empty-State Enumeration (AC12-AC16 + sub-states)

| # | State | AC | Expected UI | Fallthrough |
|---|---|---|---|---|
| a | Zero items stored, zero groups | AC12 | Icon + "No bookmarks yet" + CTA "Open the side panel to add bookmarks" (opens the sidepanel via the existing `chrome.sidePanel.open({windowId})` pattern from `popup/popup.js:889`). No grid, no filter, no skeleton. Web-search input remains functional. | — |
| b | Zero groups, items exist (ungrouped) | AC13 | Render an implicit "Ungrouped" section with all items — same sortOrder rules as inside a real group. Section header reads "Ungrouped" (matches sidepanel precedent). Filter works normally. | — |
| c | Non-empty collection, filter matches zero items | AC14 | Hide all group sections (via `hidden` attribute, not DOM removal — preserves structure for fast re-show). Show a filter-empty state: "No matches for «query»" + "Clear filter" button. Button restores `_filterQuery = ''` and unhides all rows. | — |
| d | Partial search query (1-2 characters typed in web search, not submitted) | AC15 | No SW call. Grid stable, unchanged. No visual flicker. The search input captures keystrokes but only `Enter`/submit triggers `chrome.search.query`. | — |
| e | ~~`newTabOverride` pref is false (disabled branch)~~ | ~~AC2~~ | **RESCINDED at S29 close — B-039 dropped; the newtab is always on. The "preferences OFF redirect" sub-state no longer exists.** | — |
| f | SW cold-start — responses delayed | AC23 | Skeleton placeholder visible during fetch latency. After SW resolves (~100-300 ms typical), skeleton replaced by grid atomically. No blank flash, no error state unless the fetch actually rejects. | — |
| g | `MSG_LIST_ITEMS` or `MSG_LIST_GROUPS` rejects | AC16 | Error state: icon + "Something went wrong — try reloading" + "Reload" button. Button calls `window.location.reload()`. No silent failure, no console-only error. `console.warn` the underlying error message for dev diagnostics. | — |
| h | `MSG_NAVIGATE_TO_ITEM` rejects | R1 C-9 (h) | **No visible UI feedback.** The `.catch(() => {})` on the fire-and-forget call swallows the error. User retries the click. Rationale: the newtab has no toast primitive (D-1 isolation from sidepanel.js); showing an error inline on a row would require a toast subsystem that is out of scope. Silent degrade is consistent with the B-022 popup's handling of navigate rejection (popup closes either way). Optional: `console.warn` for dev diagnostics. | — |

**Note on destructive-action confirmation (DoR item 7):** N/A for B-036 — the newtab is a read-only grid surface. No items, groups, or bookmarks are created/modified/deleted. Click-to-navigate activates a tab or creates a new one (browser-native, non-destructive). No confirmation dialog is required or present.

## §42.6 Performance Plan

### §42.6.1 Budget Table (AC17 + AC18)

| Phase | Budget | Estimated cost (500-item / 1 000-item where relevant) |
|---|---|---|
| HTML parse + CSS parse + skeleton paint | ≤ 30 ms | ~10-20 ms on dev machine (extension pages parse faster than web pages — no network fetches, no third-party JS) |
| `MSG_GET_PREFERENCES` round-trip | ≤ 40 ms | ~10-20 ms warm; up to ~150 ms on SW cold start (absorbed by skeleton) |
| `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` | ≤ 60 ms | ~20-40 ms at 500 items (sidepanel baseline) |
| `buildIndex(items)` | ≤ 10 ms | ~1 ms at 1 000 items per §34.8 measurement |
| `renderGrid()` DOM construction | ≤ 70 ms | DocumentFragment-based — all item rows built off-DOM, appended once per group. Measured sidepanel first-paint is ~80 ms at 500 items; newtab is slightly more expensive per-row (multi-column layout) but rebuilds simpler DOM (no drag affordances, no multi-select checkboxes, no window badges). Expected ~50-80 ms. |
| Margin | ≥ 20 ms | — |
| **Total (AC17)** | **≤ 200 ms P95 at 500 items** | Target met with margin |
| Filter latency per keystroke (post-debounce, AC18) | ≤ 50 ms P95 at 1 000 items | `search(index, q)` is sub-millisecond per §34.8 measurement (P95 0.152 ms at 1 000); DOM toggling + highlight fragment rebuild dominate the budget. Expected ~5-15 ms total. |

### §42.6.2 Perf-Specific Design Rules

- **Skeleton-first:** body background paints via CSS at parse time (`body { background: var(--color-bg) }`). Skeleton DOM injected by `newtab.js` only after pref check passes. On disabled branch, body stays empty until `about:blank` replaces it — minimising flash duration.
- **DocumentFragment batching:** `renderGrid` builds the entire grid tree inside a `DocumentFragment`, then appends it to the grid container in one DOM operation. Prevents intermediate layout thrash.
- **No virtualisation in v1:** at 500 items across 3-5 columns (~100-170 rows per column), Chromium's layout engine handles the DOM size without perceivable jank. Virtualisation would break accessibility (screen readers need row nodes) and complicate filter (filtered-out rows must still exist to toggle `hidden`). If a future user hits 5 000+ items and reports jank, revisit.
- **Indicator patches (not re-renders):** on `liveState` broadcast, the listener calls `MSG_LIST_ITEMS`, computes the delta between `_liveStates` and the fresh map, and toggles `.live-dot` / `.active-dot` classes on the affected rows via a keyed lookup (`Map<itemId, HTMLElement>` maintained alongside `_items`). No `renderGrid()` call. Matches sidepanel `refetchAndPatchLiveState` pattern.
- **Filter re-highlight:** on filter keystroke, the visible-row set changes. For each row that is visible, replace its title / url span contents with fresh `buildHighlightedText` fragments. Expensive (two `DocumentFragment` builds per visible row) but bounded by the visible set size (typically ≤ 50 rows after a narrowing query).
- **Debounce:** 200 ms on the quick-filter input per AC7. Matches B-036's explicit AC7 contract (note: sidepanel uses 150 ms per B-021 — the 200 ms value in AC7 is deliberately not revisited here).
- **No polling:** all freshness comes from `MSG_STATE_CHANGED` broadcasts. No `setInterval`, no `requestAnimationFrame` loops.

### §42.6.3 Measurement Harness (R5)

- `tests/b036-newtab.test.js` includes perf sub-tests patterned after §34.8:
  - Fixture: deterministic 500-item / 1 000-item collections via the existing `tests/_fixtures/generate-item-collection.js`.
  - `renderGrid` timing: measure `performance.now()` from `renderGrid` entry to first `appendChild` on the grid container. Assert P95 < 160 ms (20% margin below 200 ms AC17 budget).
  - Filter timing: measure `performance.now()` around `search(index, query) + hidden-toggle + highlight-fragment-rebuild` over the full cached visible set. Assert P95 < 40 ms (20% margin below 50 ms AC18 budget).
- No real paint measurement (Node cannot paint); the DOM-construction time is the load-bearing proxy.

## §42.7 Accessibility Plan

### §42.7.1 ARIA Roles (AC19)

| Element | Role | Additional attributes |
|---|---|---|
| Page root container | `role="main"` | `aria-label="Tab Junkie new tab page"` |
| Web-search form | `role="search"` | — |
| Web-search input | (native `<input type="search">`) | `aria-label="Search the web"` + placeholder "Search…" |
| Quick-filter input | `role="searchbox"` | `aria-label="Filter bookmarks"` + `aria-controls="grid-root"` |
| Grid root container | `role="region"` + `aria-live="polite"` | `aria-label="Bookmark grid"` — live-region announces filter results changes |
| Group section | (native `<section>`) | `aria-labelledby="group-<id>-header"` |
| Group header | `role="heading"` + `aria-level="2"` | Native `<h2>` also acceptable — R3 choice. |
| Group's item list | `role="list"` | — |
| Item row | `role="listitem"` | `tabindex="0"` (keyboard-reachable) + `aria-label="<title> — <url>"` (screen-readers announce both) |
| Indicator dots | `aria-hidden="true"` | Visual-only; semantic state carried via row `aria-label` if needed (e.g. "<title> — <url> (currently open)") |
| Filter-empty state | `role="status"` + `aria-live="polite"` | Auto-announces on appearance |
| Error state | `role="alert"` | Auto-announces on appearance |

### §42.7.2 Keyboard Flow (AC11)

1. `DOMContentLoaded` → focus lands on the web-search input (explicit `searchInputEl.focus()` after `renderGrid`).
2. `Tab` sequence:
   - Web-search input → Web-search submit button (if rendered as a discrete button) → Quick-filter input → Filter clear button (if filter has text) → first group header → first item row in first group → subsequent items in DOM order → next group header → … → empty-state CTAs if visible → error-state Reload button if visible.
3. `Shift+Tab` reverses.
4. `Enter` on web-search input: submits via `chrome.search.query`.
5. `Enter` on quick-filter input: no-op (debounced input already triggers on every keystroke).
6. `Escape` on quick-filter input: clears the filter (matches sidepanel B-021 pattern).
7. `Enter` on item row: navigates (same as click).
8. No focus traps — every Tab cycle eventually returns to the web-search input.

### §42.7.3 WCAG AA Contrast + Focus Indicators (AC20)

- All text uses the sidepanel CSS tokens (`--color-fg`, `--color-fg-muted`, `--color-accent`). These tokens are WCAG AA-verified in the sidepanel's theme palette (per §37 and `sidepanel.css` audit).
- Focus indicators: `:focus-visible` rule applies a 2 px outline in `--color-focus` on every interactive element. Matches sidepanel.
- Light + dark theme: newtab inherits the user's selected theme via `theme-init.js` (applies `.theme-light` or `.theme-dark` class on `<html>` before paint). No theme-switcher UI on the newtab itself (B-037 owns theme UI).
- Color-only indicators: `.live-dot`, `.active-dot`, `.drifted-dot` are visual-only; the accessibility name via `aria-label` on the row carries the semantic state (e.g., "Stack Overflow — stackoverflow.com (currently open)"). R3 MUST format `aria-label` to include state when state is non-default.

## §42.8 Rollback Plan

**Risk level:** LOW — additive surface only; no storage schema migrations; no message contract changes; no manifest permission changes; no modifications to existing modules outside `newtab/`.

**Rollback procedure:**

1. `git revert <B-036-merge-sha>`. This reverts:
   - `newtab/newtab.html` restored to the 10-line stub.
   - `newtab/newtab.js`, `newtab/newtab.css`, `newtab/theme-init.js` deleted.
   - `tests/b036-newtab.test.js` deleted.
   - `docs/design/42-b-036-newtab-page.md` deleted (this file).
   - `docs/SOLUTION_DESIGN.md` §42 TOC row reverted.
2. **No data cleanup required.** No storage writes, no orphan keys. The `tj:prefs.newTabOverride` field remains (it is owned by B-089 scaffolding / B-039 toggle) — stale readers (none, after revert) simply ignore it.
3. **No manifest cleanup.** `chrome_url_overrides.newtab` stays wired to `newtab/newtab.html` (stub). New tabs continue to open the stub — cosmetic but non-breaking.
4. **Non-revert hotfix (hotfix path):** flip `newTabOverride` default to `false` (already is) OR hard-code the disabled-branch redirect in `newtab.js` behind a `SAFE_MODE` flag. Ships as a patch release without full revert.
5. **Chrome Web Store / Edge Add-ons rollback:** build from the pre-B-036 tag, re-submit. No user data affected.

**Storage schema changes:** none. No rollback procedure needed on the storage dimension.

**Message contract changes:** none. No compat shim needed.

**Interaction with B-039 toggle:** if B-039 is merged before B-036 is reverted, the toggle UI in the settings panel still exists but has no consumer (toggle writes `newTabOverride` but no one reads it after B-036 revert). The toggle is functionally inert; it does not error. Recommend reverting B-039 in the same rollback commit if both must go together.

## §42.9 Known Risks / Follow-ups (S30+ candidates)

1. **No window badges on newtab rows (B-014).** The newtab v1 ignores `windowMap` broadcasts and renders no window ordinal badges on items. In multi-window sessions, the user cannot tell from the newtab which window an open item is in. Flagged as a S30+ follow-up: extend `renderItemRow` to compute + render the badge from `windowMap` + `_liveStates[item.id].windowId`.
2. **Hardcoded 200 ms filter debounce (AC7).** Sidepanel uses 150 ms (B-021). The asymmetry is intentional per R1 AC7 but worth confirming at UAT — if users find the newtab filter sluggish relative to the sidepanel, unify on 150 ms.
3. **Row primitive duplication with sidepanel.** D-1 accepts ~150-200 LOC of structural overlap between `newtab.js` `buildItemRow` and `sidepanel.js` `buildItemRow`. A future sprint should extract a shared `buildItemRow` to `shared/bookmark-grid.js` (option (c) from D-1). Flagged for S30+.
4. **No recency / most-used ordering.** Current grid order is `sortOrder` within group. Some users may prefer "most-recently-opened-first" as an optional sort. Out of scope for v1; noted for a future story.
5. **No right-click context menu.** Users who want "Copy URL", "Remove bookmark", "Move to group" on a newtab row must use the sidepanel. Not a regression (newtab did not exist before B-036), but a divergence from sidepanel parity. Noted for a future story.
6. **Tab discard behaviour under memory pressure.** Modern Chromium can discard background tabs to save RAM. A discarded newtab tab's `chrome.runtime.onMessage` listener detaches; when the user returns to the tab and it reloads, the listener re-attaches on fresh boot. No data loss; possible perception of "stale" content for the split-second before the reload fires. Not actionable at R3.
7. **`window.location.replace('about:blank')` flash (D-2a).** One frame of Tab Junkie HTML before the redirect commits. Mitigated by empty-body-until-JS-runs CSS technique in §42.3 D-2a, but not zero. Could be eliminated by moving the pref check into a `<script>` tag in the `<head>` that synchronously reads a cached preference — adds complexity for a non-user-blocking issue. Flagged.
8. **SW cold-start timing for disabled-branch.** If the SW is cold and `MSG_GET_PREFERENCES` takes > ~200 ms, the user sees empty-body Tab Junkie HTML longer than on the enabled branch. The `about:blank` redirect fires as soon as the pref resolves. Not a bug; user-perceived as a slightly-longer-than-usual new-tab load.
9. **Coexistence with B-037 theme switcher.** When B-037 ships, the newtab will inherit the user's theme via `theme-init.js` + the `preferences` broadcast. No B-036 changes needed — the design anticipates this.
10. **Broadcast-receiver delta-completeness.** Per §41.10.4 P-1, the newtab is the second pure-receiver surface after standalone window. All `hashItem` gaps (sortOrder, groupId) are already closed by S28's fix. Any future field that affects item display on the newtab but is NOT in `hashItem` will silently fail to trigger patches on the newtab — R3 and R4 MUST audit new fields for inclusion.
11. **`chrome.search.query` default engine configuration.** If the user has no default search engine configured (rare but possible on fresh browser installs), `chrome.search.query` rejects silently. UX degrades to "Enter does nothing". Flagged for QA at R4.
12. **First-paint target at > 500 items.** AC17 budgets P95 < 200 ms at 500 items. At 1 000+ items (long-tail power users), first paint may exceed budget. Virtualisation (deferred per §42.6.2) would address this if needed.

## §42.10 As Built (R6 Close — Sprint 29)

### §42.10.1 Headline deviation — B-039 dropped at sprint close (newtab is always on)

The single largest deviation from the R2 plan is the late-sprint drop of B-039 (the "Replace new tab page" preference toggle). Pre-merge UAT surfaced that the OFF state could not deliver what the user actually wanted from "off" — the browser's true default new tab page. The Manifest V3 platform does not expose any API to remove `chrome_url_overrides.newtab` at runtime; once the manifest declares the override, the only paths available to the disabled state are (a) redirect to `about:blank`, (b) render an in-place "off" page, or (c) attempt to navigate to a hard-coded URL the extension cannot validate as the user's configured default. None of these are equivalent to "give me my browser's default new tab back" — only uninstalling the extension is.

**Decision (product-owner):** ship the new tab page **always-on**. Users who want their browser default back must disable or uninstall Tab Junkie via the browser's extension management page (e.g., `edge://extensions` or `chrome://extensions`).

**Code shipped in S29 then reverted in the same sprint:**

| File | What was shipped | What was reverted |
|---|---|---|
| `newtab/newtab.js` | `MSG_GET_PREFERENCES` boot read + `_renderDisabledState()` + `_handlePreferencesBroadcast()` + `_readNewTabEnabled()` helpers | All of the above; boot path now skips pref read and renders the grid unconditionally |
| `newtab/newtab.css` | `.newtab-disabled-state*` rules (heading, body, CTA, brand, focus ring) | All `.newtab-disabled-state*` rules removed |
| `sidepanel/sidepanel.js` | `renderSettingsToggle({ key: 'newTabOverride', label: 'Replace new tab page with Tab Junkie', section: 'New tab page', defaultValue: false })` | Toggle removed; "New tab page" Settings section disappears |
| `tests/b039-newtab-toggle.test.js` | 12 tests covering the toggle save / read / broadcast paths | File deleted |
| `tests/b036-newtab.test.js` | OFF-default tests + broadcast-flip-off test | OFF tests removed; D-7 preferences broadcast test rewritten as a no-op assertion |
| `docs/design/42-b-036-newtab-page.md` D-2a | UAT-9f-2 in-place disabled-state revert (which itself reverted the original R2 about:blank choice) | RESCINDED — D-2a marker reads "B-039 dropped at sprint close" |
| `docs/user-manual/new-tab-page.md` | "Enabling / disabling the new tab page" section + toggle copy | Replaced with "to restore browser default, disable or uninstall the extension" |

**Backward-compat retention:** the `newTabOverride` key remains in `DEFAULT_PREFERENCES` (`background/storage/shapes.js`). Removing the key would force a schema migration; retaining it costs nothing because no code reads it. The pref shape validator (`validatePrefsPatch`) still accepts boolean writes to the key, but no UI surface produces those writes any longer.

**Why ship the now-unused `newTabOverride` key:** dropping a pref key cleanly requires a migration step that prunes the key from existing `tj:prefs` objects. We have one (B-001b's migration runner) but using it for a vestigial-but-harmless field is overkill — the "as built" cost of leaving the field in place is one extra boolean in every prefs read; the cost of removing it is a schema bump, a migration entry, and the corresponding R5 + UAT coverage. The product-owner accepted the unused-key cost.

### §42.10.2 R4 findings disposition (Wave 0)

All R4 findings raised against the originally-shipped B-036 + B-039 code remained valid against the simplified always-on shape. The pre-revert R4 fixes (HIGH-1 through HIGH-4, MEDIUM-5, QA-1 through QA-3) all survive the revert — none of them depended on the pref-gate code paths that were removed.

### §42.10.3 C-1 through C-11 re-verification against shipped code

| # | Check | Status post-revert |
|---|---|---|
| C-1 | Storage schema versioned | **N/A** (still). No storage writes from newtab; the `newTabOverride` key remains in `DEFAULT_PREFERENCES` for backward compat with no schema bump. |
| C-2 | Message contracts typed | **PASS**. `MSG_GET_PREFERENCES` is no longer called from newtab; the remaining contracts (`MSG_LIST_ITEMS`, `MSG_LIST_GROUPS`, `MSG_NAVIGATE_TO_ITEM`, `MSG_STATE_CHANGED`) are byte-for-byte unchanged. |
| C-3 | SW cold-start safe | **PASS**. Skeleton covers the items + groups fetch latency; no pref read on the cold path. |
| C-4 | ID stability | **PASS** (unchanged). |
| C-5 | Manifest file refs resolvable | **PASS** (unchanged). |
| C-6 | Permission minimization | **PASS** (unchanged — zero new permissions, zero permission removals). |
| C-7 | Allow-list direction | **PASS (N/A)** (unchanged). |
| C-8 | SW-context feasibility | **PASS** (unchanged). |
| C-9 | Empty-state design | **PASS — sub-state (e) RESCINDED**. The "preferences OFF redirect" enumeration is removed; remaining sub-states (a-d, f-h) are unchanged and still ship. |
| C-10 | Off-screen rect feasibility | **N/A** (unchanged). |
| C-11 | Popup-lifecycle message ordering | **PASS** (unchanged — fire-and-forget on `MSG_NAVIGATE_TO_ITEM` retained). |

### §42.10.4 New precedents for CLAUDE.md or for the R2 checklist

**Candidate precedent (S30+ retro):** the MV3 `chrome_url_overrides.newtab` non-removability constraint is a class of platform restriction that the R2 checklist does not currently surface. C-5 ("Manifest file references resolvable") covers existence of referenced files; it does NOT prompt R2 to ask "can this manifest entry be removed/disabled at runtime?" A new R2 check — call it C-12 candidate, "Runtime mutability of manifest declarations" — would force R2 to enumerate which manifest entries the user-facing UX assumes are mutable and verify against the MV3 docs whether they are. Flagged for the S29 retro.

### §42.10.5 Test count reconciliation

| Source | Pre-revert (Sprint 29 R5) | Post-revert (final) |
|---|---|---|
| `tests/b036-newtab.test.js` | ~32 tests (incl. 3 disabled-state tests) | 30 tests (3 removed, 1 added — UAT-2 sortOrder tiebreaker) |
| `tests/b039-newtab-toggle.test.js` | 12 tests | 0 (file deleted) |
| Total project test count | 1308 | 1295 |

Net delta: −13 tests (−12 from the deleted B-039 file; −2 from the disabled-state path removal in B-036; +1 from the new UAT-2 sortOrder tiebreaker test).

### §42.10.6 Final file manifest

| File | Status | LOC delta |
|---|---|---|
| `newtab/newtab.html` | Unchanged from R3 ship | 0 |
| `newtab/newtab.js` | Simplified (pref read + disabled-state code removed) | −74 LOC |
| `newtab/newtab.css` | `.newtab-disabled-state*` rules removed | −62 LOC |
| `newtab/theme-init.js` | Unchanged | 0 |
| `sidepanel/sidepanel.js` | B-039 toggle call removed; comment retained | −7 LOC |
| `tests/b036-newtab.test.js` | Two disabled-state tests removed; broadcast-D-7 test rewritten; one UAT-2 sortOrder tiebreaker test added | net ~−25 LOC |
| `tests/b039-newtab-toggle.test.js` | DELETED | −484 LOC |
| `background/storage/shapes.js` | Comment added next to `newTabOverride` key | +5 LOC |
| `docs/design/42-b-036-newtab-page.md` | RESCINDED note in D-2a; §42.4.4 boot flow updated; §42.5.1 sub-state (e) RESCINDED; §42.10 As Built filled in | +180 LOC |
| `docs/user-manual/new-tab-page.md` | Toggle/disable section replaced with uninstall-to-restore guidance | net ~−15 LOC |
| `docs/BACKLOG.md` | B-039 row marked DROPPED with rationale | text-only edit |
| `docs/BACKLOG_BOARD.md` | B-039 row moved to icebox; counts recalculated | text-only edit |

---

**R2 verdict: READY FOR R3.**
