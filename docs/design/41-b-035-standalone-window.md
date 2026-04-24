# §41 — B-035 Standalone Window Display Mode (R2 Design)

**Sprint:** 28
**Tier:** Full (M)
**Status:** R2 complete (2026-04-23) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §16/§17 (B-010 live tab reflection + `chrome.windows.*` baseline), §23 (B-054 sidepanel shell verification), §28 (B-014 multi-window awareness, `_panelWindowId` + ordinal map), §40 (B-023 SW `chrome.commands.onCommand` dispatch precedent), §39 (B-022 popup-surface precedent — D-UAT-3 popup-lifecycle), §10.10 (broadcast architecture — `MSG_STATE_CHANGED` delivery model)
**Out-of-scope (explicit):** B-038 side-panel vs standalone preference UI; B-036 new-tab override toggle; custom window chrome; multiple simultaneous standalones; position/size persistence across sessions; drag-out from the side panel to "detach" (the user opens via Alt+Shift+J — no detach gesture).

---

## §41.1 Overview

B-035 adds a second first-class extension surface — a **standalone browser window** hosting the same `sidepanel/sidepanel.html` content that the side panel hosts today. Invoked via `Alt+Shift+J` (the already-registered `open-junkie-window` command from v1.21.0), the command path is a service-worker-level `chrome.commands.onCommand` listener that either (a) focuses an existing standalone Tab Junkie window if one is already open, or (b) creates a new `chrome.windows.create({type:"popup", url:"sidepanel/sidepanel.html", ...})` window centered on the active display at roughly 1200×800 px. No new HTML, no new CSS, no new ES module, no new storage partition, no new message contract, no new manifest permission — the reuse surface is near-total. The `MSG_STATE_CHANGED` broadcast delivered by the service-worker reaches the standalone window identically to the side panel because both are extension pages on the same origin; `chrome.runtime.onMessage.addListener` in `sidepanel.js` (§10.10 pattern, `sidepanel.js:5631`) subscribes on `DOMContentLoaded` regardless of which shell hosts the HTML. The B-063 context-menu `window.blur` close listener (`sidepanel.js:6812`) attaches at module scope and therefore fires in any extension-page context that loads `sidepanel.js` — no forward port needed. `chrome.windows.create`/`update`/`getAll` are SW-callable, are implicit under the existing `tabs` permission (no `windows` key required in manifest), and are already in active use by B-014 + B-010, so there is zero new permission surface. Existing-instance detection is cold-start-safe by design (D-3 option c): every Alt+Shift+J trigger re-enumerates `chrome.windows.getAll({populate:false})`, URL-matches against the extension-origin sidepanel URL, and dispatches to either `update({focused:true})` or `create({...})` accordingly — the SW holds no session-scoped state on the standalone window id. C-11 is **vacuously satisfied** in v1: there are zero SW-side writes on the open/focus path (no recency store, no preference mutation, no position persistence), so no focus-shift-before-write race can exist. The design is additive (≈ 40 LOC in `background/service-worker.js`) and fully revertible by a single `git revert`.

## §41.2 Reuse Surface

**Reuse contracts in this chapter are normative, not advisory.** R3 MUST NOT re-implement any listed primitive inline; R3 MUST NOT fork any listed module. The B-023 precedent (§40.10.1 D-R4-1) confirmed that inline re-implementations of shared helpers are [code-reviewer] HIGH findings. This section uses MUST language deliberately — each row is a contract R3 signs by not editing it.

| Surface | Source | How B-035 consumes it |
|---|---|---|
| `sidepanel/sidepanel.html` — full DOM skeleton (header, item list, skeleton loader, empty state, error state, filter empty state, bulk-action bar, all dialogs, context menu, toast, theme-init script) | `sidepanel/sidepanel.html:1-245` | **MUST be loaded verbatim** as the `url` target of `chrome.windows.create`. Zero modifications. No duplicate file, no shim, no wrapper. The same file that ships to `chrome.sidePanel.setOptions({path:"sidepanel/sidepanel.html"})` today ships to `chrome.windows.create({url:"sidepanel/sidepanel.html"})` tomorrow. |
| `sidepanel/sidepanel.js` — 6863-LOC ES module containing all render, filter, drag, message, context-menu, dialog, and bootstrap logic | `sidepanel/sidepanel.js` | **MUST be loaded verbatim** via the existing `<script src="sidepanel.js" type="module" defer>` tag in sidepanel.html:243. The module has zero calls to `chrome.sidePanel.*` (verified by codebase grep 2026-04-23); it is context-agnostic extension-page code. R3 MUST NOT branch behaviour on "am I in the side panel or in the standalone window?" — the answer is "it does not matter," and writing any such branch is a drift risk. |
| `sidepanel/sidepanel.css` — 1743 LOC of styling | `sidepanel/sidepanel.css` | **MUST be loaded verbatim.** The stylesheet sizes to `html, body { width: 100%; }` (standard extension-page layout) so the standalone window at 1200×800 will render the full-width layout the side panel renders at side-panel widths, with identical row margins, gaps, and color tokens. Zero new CSS, zero prefix-scoped overrides. |
| `sidepanel/theme-init.js` — FOUC-prevention pre-paint theme resolver | `sidepanel/sidepanel.html:8` (`<script src="theme-init.js"></script>` before stylesheet) | **MUST be loaded verbatim** via the same `<script>` tag. Theme resolution uses `chrome.storage.local` reads, which work identically in any extension-page context. |
| `chrome.runtime.onMessage.addListener` subscription for `MSG_STATE_CHANGED` (broadcast-receiver pattern per §10.10) | `sidepanel/sidepanel.js:5631-5633` + downstream scope branches (`liveState`, `WINDOW_MAP`, default full-re-render) | **MUST NOT be re-wired.** The listener is a module-scope registration; it attaches when sidepanel.js loads in any extension-page context and receives the SW's `chrome.runtime.sendMessage` broadcasts the same way whether the page is in the side panel or in a `chrome.windows.create` popup. The SW broadcast path is indifferent to the receiving surface — `chrome.runtime.sendMessage` fans out to all extension pages on the same runtime id. Verified against Chrome MV3 docs + local manual smoke test at R2. |
| B-063 context-menu `window.blur` close listener | `sidepanel/sidepanel.js:6812-6816` | **MUST NOT be re-wired or branched on surface.** The `window.addEventListener('blur', …)` attaches at module scope; it fires on the standalone window's `window` exactly the same way it fires on the side-panel iframe's `window`. AC15 + UAT-8 verify this. |
| `_refreshPanelWindowId()` — `chrome.windows.getCurrent()` self-healing panel-window lookup (B-014 + B-018 precedent) | `sidepanel/sidepanel.js:3957-3966` | **MUST NOT be re-wired.** `chrome.windows.getCurrent()` returns the enclosing window regardless of host surface. In the standalone window this returns the standalone window itself — and since any live tabs rendered inside Tab Junkie that reside in *that same* window get no badge (B-014 AC4), items inside the standalone's own window will correctly suppress the badge. Any items in other real browser windows continue to show the badge. Verified in §41.3 D-5 below. |
| SW `chrome.commands.onCommand` dispatch pattern | `background/service-worker.js:63-73` (B-023 precedent, §40.3 D-2) | **MUST be followed as the pattern template.** Synchronous listener at module scope, no `async`/`await` on the outer function (D-R4-2 reshape lesson from B-023 carries forward). B-035's handler has NO `setPopup`/`openPopup` dance — instead it calls `chrome.windows.getAll` → `chrome.windows.update` OR `chrome.windows.create`. The synchronicity invariant still matters because `chrome.commands.onCommand` listeners registered via `addListener` MUST be at module scope before the first `await` in the SW bootstrap (MV3 event-registration rule). |
| `readyPromise` gate in SW — migrations + `initWindowOrdinals` + `initializeLiveState` serialized before any message handler resolves | `background/service-worker.js:34-49` | **MUST NOT be altered.** B-035's command handler does not touch storage, so it does not need to be `readyPromise`-gated for its own correctness — the listener may fire during cold start. The standalone window's own `MSG_LIST_ITEMS` / `MSG_LIST_GROUPS` requests on `DOMContentLoaded` hit the existing `readyPromise`-gated handlers; this gives free cold-start safety for content hydration. |
| Existing sidepanel bootstrap path — `DOMContentLoaded` → `MSG_GET_PREFERENCES` → `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` → `_setWindowOrdinalMap` + `_refreshPanelWindowId` + `renderAll` + `_applyWindowMapToUI` | `sidepanel/sidepanel.js:6822-6862` | **MUST NOT be re-ordered or duplicated.** Runs identically in the standalone window because it is the *same module loading into a different host*. |
| B-082 "Open side panel" button in toolbar popup | `popup/popup.js:889` (`chrome.sidePanel.open({windowId})`) | **MUST NOT be confused with B-035's path.** B-082 opens the *side panel* (subject to the browser's one-side-panel-per-window rule and requiring a user gesture). B-035 opens a *standalone window* via `chrome.windows.create` — a different API entirely with different constraints. The two surfaces can coexist (AC19 + UAT-12). |

**Not reused:** no shared state between the side panel and the standalone window (each is its own JS realm with its own module instance — module-level `let _items = []` in sidepanel.js exists once per surface). No cross-surface IPC beyond the SW broadcast. No visual-parity test against the side panel (visual parity is by-construction — same HTML, same CSS, same JS — not by-assertion). No new translation of sidepanel CSS tokens (`--color-bg`, `--color-fg`, etc.) — the theme-init script resolves them identically in any extension-page context.

## §41.3 Decision Resolutions (D-1 through D-8)

### D-1 — Window type: `chrome.windows.create({type: "popup"})` (chosen)

**Choice:** **`type: "popup"`**. Produces a standalone browser window with no address bar, no tab bar, no bookmarks bar — just the extension content and standard OS window chrome (title bar, minimize/maximize/close, drag-to-resize). This is the MV3-idiomatic shape for extension-hosted standalone UI.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `type: "popup"` | Clean UX (no tab bar noise in the Tab Junkie window itself); resizable by default; user can minimize/maximize like any OS window; distinct from the regular browser windows in task-switcher; supported in both Chromium and Edge since MV2 era | Cannot host tabs itself (but we never need that — the window hosts one sidepanel.html page) | **Chosen** |
| (b) `type: "panel"` | Similar visual to popup, slightly more OS-integrated | **Deprecated** — Chromium removed `panel` support for public extensions circa Chrome 80; only works with command-line flags or dev-only builds. Not viable for shipping Tab Junkie | Rejected |
| (c) `type: "normal"` | Full browser chrome (tab bar, address bar) — feels like a regular browser window | Confusing UX (a tab bar that can't hold user tabs); breaks Tab Junkie's identity as a distinct surface; user could accidentally middle-click a bookmark and get a new tab *inside* the Tab Junkie window, which is visually inside but functionally a separate concept; larger surface area to explain | Rejected |

**Edge compatibility verdict:** `chrome.windows.create({type:"popup"})` is Chromium-core API; Edge has supported it since Chromium alignment (2020). No version gate required. No equivalent of B-023's `chrome.action.openPopup` 127+ caveat applies here.

**Rationale:** `popup` is the only viable choice. `panel` is dead, `normal` is confusing.

**Blast radius:** minimal. If the user complains about the `popup` chrome (e.g., "I want a tab bar"), we can switch to `normal` in a one-line change to the `create` call. No storage impact, no permission impact.

### D-2 — Standalone URL target: load `sidepanel/sidepanel.html` directly (chosen)

**Choice:** **Option (a) — `url: "sidepanel/sidepanel.html"`** passed directly to `chrome.windows.create`. Zero new HTML. Zero new ES module. Zero new CSS. The standalone window hosts the exact same DOM, the exact same JS module, the exact same stylesheet that the side panel hosts.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) `sidepanel/sidepanel.html` directly | Zero new files; identical rendering; identical features (drag, context menu, dialogs, filters, bulk-action, B-014 window badges, B-063 blur-close); identical state sync; zero divergence risk | Slightly odd conceptually — the file is named "sidepanel" but hosts a non-sidepanel surface. Naming is cosmetic; refactoring is out of scope | **Chosen** |
| (b) New `standalone/standalone.html` shell that imports sidepanel.js | Semantically cleaner filename; room for future divergence | Immediate cost: new HTML file + wiring. Immediate risk: two shells for the same content silently diverging (one gets a new dialog, the other doesn't) — classic fork rot. Any future "side panel gets a new button" requires syncing two HTMLs. Forces R3 to establish a shim module that re-exports sidepanel.js logic. No benefit today because we need zero divergence | Rejected |
| (c) `chrome_url_overrides.newtab`-adjacent approach (separate page in manifest) | None relevant to B-035 | Not applicable — that's B-036's territory. Would require a new manifest entry and change the semantics from "open a window" to "override a built-in page" | Rejected |

**Context-transition verification:** `sidepanel.js` was audited for any assumption that it runs only in the side panel. Findings:
- Zero calls to `chrome.sidePanel.*` — verified by grep across `sidepanel/`.
- Zero DOM queries that select shell-identifying markers.
- Zero references to `window.parent`, `window.top`, or cross-frame messaging that would differ between the sidepanel-iframe-host and the window-direct-host.
- `chrome.windows.getCurrent()` (used by `_refreshPanelWindowId` at `sidepanel.js:3957`) returns the enclosing window in both hosts; its semantics are well-defined in both cases.
- `MSG_STATE_CHANGED` subscription at `sidepanel.js:5631` attaches at module scope; it works identically in both hosts.
- `DOMContentLoaded` bootstrap at `sidepanel.js:6822` works identically.
- B-063 `window.blur` listener at `sidepanel.js:6812` works identically.

**Rationale:** We gain nothing by forking the shell and lose everything (duplicate maintenance, divergence, retest burden). The "filename says sidepanel but hosts standalone too" mild awkwardness is purely aesthetic and is revisitable in a future sprint as a pure rename if anyone cares.

**Blast radius:** zero. The `url` argument to `chrome.windows.create` is a runtime string; it doesn't touch manifest, doesn't touch storage, doesn't change permission surface. Revertible by changing the string.

### D-3 — Existing-instance detection: `chrome.windows.getAll` + URL match at each trigger (chosen)

**Choice:** **Option (c) — enumerate `chrome.windows.getAll({populate:false, windowTypes:["popup"]})` on every Alt+Shift+J, URL-match each result against the extension-origin sidepanel URL, and dispatch accordingly.** No SW in-memory state. No storage persistence. No cached window id.

**Alternatives considered:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Persist window id to `chrome.storage.local` on create; clear on `onRemoved` | Single lookup per trigger (O(1)) | Adds a storage partition (schema bump); requires cleanup on window close; race between `onRemoved` firing and storage write completing; stale entries after browser crash; persistence across SW restart is a footgun if not reconciled. Violates "no new storage partition" principle for an ephemeral concern | Rejected |
| (b) Hold window id in SW module-level variable | Cheap, zero storage | SW restarts clear it → cold-start Alt+Shift+J after SW teardown would duplicate; violates C-3 ("no assumption SW is already running"). Could mitigate with `chrome.windows.getAll` re-seed on SW cold start, but that's just option (c) plus extra state | Rejected |
| (c) Re-enumerate `getAll` on each trigger, URL-match | Zero SW state; cold-start safe by construction; race-free (single atomic enumeration per trigger); handles browser crash / SW teardown / user-closed window transparently; cheap (`getAll` is a fast browser-local call, typical N ≤ 10 windows) | Two API calls per Alt+Shift+J (getAll + either create or update) vs one for options (a)/(b) on the hot path | **Chosen** |

**URL-match predicate (R3 implementation contract):**

```js
// Resolve the extension-origin sidepanel URL once at module scope.
const SIDEPANEL_URL = chrome.runtime.getURL('sidepanel/sidepanel.html');

// Inside the command handler:
const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
const existing = wins.find((w) =>
  Array.isArray(w.tabs)
  && w.tabs.length === 1
  && typeof w.tabs[0].url === 'string'
  && w.tabs[0].url === SIDEPANEL_URL
);
```

- `populate: true` is necessary because the `url` lives on `Window.tabs[i].url`, not on the `Window` object itself.
- `windowTypes: ['popup']` filters out regular browser windows and scopes the match.
- URL must be an **exact** string match to the extension-origin `chrome-extension://<extension-id>/sidepanel/sidepanel.html`. `chrome.runtime.getURL` produces this path deterministically per install, so the match is race-free.
- If multiple popup windows with that URL exist (edge case — e.g., dev tooling opened one manually), the first match wins and we focus it. A follow-up polish could warn/clean up duplicates; not in v1 scope.

**Rationale:** Option (c) is the only option that is cold-start-safe without a schema bump. The per-trigger cost is negligible (sub-millisecond for a handful of windows).

**Blast radius:** contained to the SW listener. No storage, no manifest, no permission. Revertible by reverting the handler.

### D-4 — Initial size + position: 1200×800 px, centered on active display, no persistence

**Choice:** `{ width: 1200, height: 800, left: …, top: … }` where `left`/`top` are computed to center the window on whichever display the active browser window currently occupies. No storage — every fresh create re-centers at 1200×800. The user may resize and reposition freely; position changes are *not* persisted (AC7).

**Active-display resolution (R3 implementation contract):**

```js
// Find the active browser window; use its position to pick the display.
const [activeWin] = await chrome.windows.getAll({ populate: false });
// (More accurately: prefer the focused window, but fall back to [0].)
const focused = wins.find((w) => w.focused) || activeWin;
// `chrome.system.display` is NOT available (no permission granted).
// So compute a centered-ish position using `focused`'s own rect:
//   left = focused.left + Math.round((focused.width  - 1200) / 2)
//   top  = focused.top  + Math.round((focused.height -  800) / 2)
// Clamp to non-negative: Math.max(0, left), Math.max(0, top).
// If the target rect exceeds the display, Chromium will clamp to the screen.
```

**Why not `chrome.system.display.getInfo`?** It requires the `system.display` permission, which we do not grant. B-035 avoids adding permissions (D-7). Computing center relative to the active window's rect is a reasonable approximation — it opens the standalone window near where the user is looking, which is the primary UX goal. Exact pixel-perfect display-centering is not a requirement.

**Rationale:** 1200×800 is a reasonable default for a desktop surface wider than the typical side panel (~350-400 px). Enough room to see group columns side-by-side and several rows of items.

**Blast radius:** cosmetic only. R3 can tweak the numbers (e.g., to 1024×720) without any architectural impact.

### D-5 — State-sync: `MSG_STATE_CHANGED` broadcast reaches the standalone window automatically

**Verification:** `chrome.runtime.sendMessage` and its sister broadcast path (`chrome.runtime.sendMessage` called from the SW with no target) fan out to **all extension pages on the same runtime id**. This is Chromium MV3 spec, unchanged across Chrome and Edge. The standalone window is an extension page hosted on the runtime; its `chrome.runtime.onMessage.addListener` subscription attaches at `sidepanel/sidepanel.js:5631` when the module loads on `DOMContentLoaded`. The SW broadcasts `MSG_STATE_CHANGED` from `background/messages/broadcast.js` (the §10.10 broadcast architecture) every time storage mutates; the listener in sidepanel.js branches on `msg.payload.scope` to apply liveState patches, windowMap patches, or full re-renders.

**Why this needs explicit verification:** the distinction between `chrome.sidePanel.open`-hosted content and `chrome.windows.create`-hosted content matters for some APIs (e.g., `chrome.sidePanel.setOptions` is sidepanel-only). For `chrome.runtime` messaging specifically, the surface distinction is **irrelevant**: both hosts are extension pages with the same origin and the same runtime. Any `chrome.runtime.sendMessage` from the SW reaches both. Verified against MDN + the Chrome extension docs at R2.

**AC10 + UAT-4 coverage:** the standalone window, when opened alongside an existing side panel, will receive every `MSG_STATE_CHANGED` broadcast the side panel receives. A rename in the side panel causes an `items` broadcast → both surfaces re-fetch and re-render. No code changes needed to make this work — it is a free consequence of "load sidepanel.js unchanged in a different extension-page host."

**Rationale:** This is the strongest argument for D-2 option (a): we get state sync for free because the JS module is the same module attaching the same listener.

**Blast radius:** none. If the broadcast reception were somehow broken for `chrome.windows.create`-hosted pages (it isn't — verified), the fallback would be a polling approach, but this is hypothetical.

### D-6 — C-11 message-ordering audit: zero SW writes on the open path → vacuously satisfied

**Audit result:** **NO SW-side writes fire on any flow in the B-035 v1 design.** C-11 is vacuously satisfied. Flow-by-flow:

| Flow | Triggers SW write? | Verdict |
|---|---|---|
| Alt+Shift+J → `chrome.commands.onCommand('open-junkie-window')` listener fires | No storage touched in the listener body itself | No write |
| Listener calls `chrome.windows.getAll({populate:true, windowTypes:['popup']})` | Read-only browser API | No write |
| Listener dispatches to `chrome.windows.update(id, {focused:true})` if existing | Browser-level focus change; no storage | No write |
| Listener dispatches to `chrome.windows.create({url, type:'popup', width, height, left, top})` if not existing | Browser-level window create; no storage | No write |
| Standalone window's `sidepanel.js` bootstrap runs `MSG_GET_PREFERENCES` + `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` | All three are read-only handlers | No write |
| User interacts inside standalone (rename group, create bookmark, etc.) | Routes through existing sidepanel → SW write messages, which already pass C-11-style checks in their own chapters (B-022/B-023 precedent for popup lifecycle, not applicable here because standalone does NOT tear down on focus shift — it is a window, not a popup) | Writes happen, but they are not B-035's responsibility — they are the existing sidepanel mutation paths |
| Window close (X button, OS close) | `chrome.windows.onRemoved` fires at SW level; B-014's `deregisterWindow` removes the ordinal; no B-035-specific write | No B-035 write |

**Future follow-up candidates flagged (S29+):**
- **Position/size persistence.** If a future story persists the last standalone window rect to storage, C-11 applies: the write must fire BEFORE any `chrome.windows.update(id, {focused:true})` that could race with window close. Not in v1 scope; explicitly out per D-4 / AC7.
- **Open-history recency.** If a future story tracks "last opened standalone at TS" for analytics/UX purposes, C-11 applies: the write must fire on the SW side before any focus-shift API call. Not in v1 scope.
- **B-038 display-mode preference write.** B-038 is the separate story that adds the "side panel vs standalone" setting. When B-038 ships, reading the preference is part of the Alt+Shift+J dispatch path; writing it happens from Settings UI, which is a separate flow with its own C-11 audit.

**D-6 verdict:** Vacuously satisfied. R3 MUST NOT add any SW-write path to B-035 without updating this chapter and explicitly walking C-11 for the new path.

### D-7 — `windows` permission audit: no new permission needed

**Current manifest permissions:** `["tabs", "tabGroups", "storage", "sidePanel", "search"]`. No explicit `"windows"` key.

**API usage audit:**
- `chrome.windows.create` — used by B-035 (new).
- `chrome.windows.update` — already used by B-014 and B-010 (existing).
- `chrome.windows.getAll` — already used by `background/tabs/window-ordinals.js:51` (existing).
- `chrome.windows.getCurrent` — already used by `sidepanel/sidepanel.js:3959` and elsewhere (existing).
- `chrome.windows.onRemoved` — already used by `background/service-worker.js:42` and `background/tabs/tab-events.js` (existing).
- `chrome.windows.onCreated` — already used by B-014 (existing).
- `chrome.windows.onFocusChanged` — already used by B-014 (existing).

**Chrome MV3 reality:** the `chrome.windows.*` namespace is **accessible without a dedicated `"windows"` permission**. It is implicitly granted alongside `"tabs"` — Chrome extension docs state that the `windows` API is "an extension of the tabs API." The `"windows"` key in the permissions array exists only in legacy docs for MV2; under MV3, Chrome ignores it silently if listed and grants the API anyway if `"tabs"` is present.

**Existing evidence that `chrome.windows.*` works today without the permission:** B-014 (shipped v1.13.0, 2026-04) calls `chrome.windows.getAll` + `chrome.windows.update` + `chrome.windows.onRemoved` successfully in the same manifest that ships today with no `"windows"` entry. `background/tabs/window-ordinals.js:51` runs `await chrome.windows.getAll(...)` on every SW cold start. No permission warning in the extension-load log. B-010 and B-018 similarly ship without `"windows"`.

**B-014 R6 chapter documentation drift:** §28.4 states "windows permission already required and granted" — this is a documentation error from B-014 R6; the API works without it. R6 note: **this chapter's D-7 supersedes B-014 §28.4's claim.** A future documentation hygiene pass should correct B-014 §28.4.

**Rationale:** No new permission. `chrome.windows.create` works under the existing `"tabs"` permission.

**Blast radius for [security-reviewer] at R4:** zero new permission surface. Nothing to audit.

### D-8 — B-063 context-menu `window.blur` listener survival across the context transition

**Verification:** the `window.addEventListener('blur', …)` call at `sidepanel/sidepanel.js:6812` is a module-scope statement executed once per module load. It attaches to the `window` object of whichever extension-page host loads the module. When the module loads in the standalone window, it attaches to the standalone window's `window`. When the standalone window loses focus (Alt+Tab, click-off, minimize), the `blur` event fires on the standalone window's `window`, the listener runs, it reads `contextMenuEl.hidden`, and if false closes the menu via `closeContextMenu()`. Identical behaviour to the side panel.

**Why this needs explicit verification at R2:** the side panel in Edge hosts its content inside an iframe embedded in the browser chrome; its `window` object is the iframe's `window`, and `blur` on that iframe fires when the containing panel loses focus. The standalone window hosts the content directly; its `window` is the top-level window. Blur semantics differ subtly: the standalone-window `blur` fires on OS-level focus loss (Alt+Tab, click-off), which is exactly when we want to close the menu. The listener behaviour is actually **more reliable** in the standalone context than in the side panel, because there are fewer intermediate focus targets.

**AC15 + UAT-8 coverage:** R5 verifies the context-menu-closes-on-blur behaviour in the standalone window. No code changes needed.

**Rationale:** The listener is context-agnostic by construction. Module-scope event registration is the right pattern; B-063 already applied it correctly.

**Blast radius:** none. If an unexpected Edge-specific blur semantics difference surfaced at UAT, the mitigation would be a surface-detection branch — but we don't anticipate needing one.

## §41.4 Component Structure

### §41.4.1 `background/service-worker.js` — new command listener

Appended AFTER the existing B-023 `group-jump` listener block (lines 63-73). Uses the same synchronous-listener pattern and the same MV3 module-scope registration invariant. Approximate structure:

```js
// B-035 — chrome.commands.onCommand dispatch for Alt+Shift+J (open-junkie-window).
// Per §41.3 D-2/D-3: focus an existing standalone Tab Junkie window if one is
// open, else create a new one pointed at sidepanel/sidepanel.html.
// Registered synchronously at module scope (MV3 event-registration rule).
// No storage writes; no readyPromise gate needed. Cold-start safe by design
// because existing-window detection re-enumerates windows.getAll on every
// trigger (D-3 option c).

const STANDALONE_URL = chrome.runtime.getURL('sidepanel/sidepanel.html');
const STANDALONE_WIDTH = 1200;
const STANDALONE_HEIGHT = 800;

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-junkie-window') return;
  openOrFocusStandaloneWindow().catch((err) => {
    console.warn('[tab-junkie] open-junkie-window failed', err);
  });
});

async function openOrFocusStandaloneWindow() {
  const wins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
  const existing = wins.find((w) =>
    Array.isArray(w.tabs)
    && w.tabs.length === 1
    && typeof w.tabs[0].url === 'string'
    && w.tabs[0].url === STANDALONE_URL
  );
  if (existing) {
    await chrome.windows.update(existing.id, { focused: true });
    return;
  }
  // Pick the focused real browser window as the "active" display anchor.
  const allWins = await chrome.windows.getAll({ populate: false });
  const anchor = allWins.find((w) => w.focused) || allWins[0] || null;
  const left = anchor && typeof anchor.left === 'number' && typeof anchor.width === 'number'
    ? Math.max(0, anchor.left + Math.round((anchor.width - STANDALONE_WIDTH) / 2))
    : undefined;
  const top = anchor && typeof anchor.top === 'number' && typeof anchor.height === 'number'
    ? Math.max(0, anchor.top + Math.round((anchor.height - STANDALONE_HEIGHT) / 2))
    : undefined;
  await chrome.windows.create({
    url: STANDALONE_URL,
    type: 'popup',
    width: STANDALONE_WIDTH,
    height: STANDALONE_HEIGHT,
    ...(left !== undefined ? { left } : {}),
    ...(top !== undefined ? { top } : {}),
    focused: true,
  });
}
```

**LOC estimate:** ~40 LOC including module-level constants and error handling. One `addListener` call; one async function; one helper block.

**No other SW-side changes.** `readyPromise` unchanged. `registerStorageHandlers` unchanged. `registerTabEventListeners` unchanged. `initializeLiveState` unchanged.

### §41.4.2 `manifest.json` — no changes

- `commands.open-junkie-window` — already registered in v1.21.0 at lines 35-40. Alt+Shift+J shortcut already bound.
- `permissions` — unchanged. No `"windows"` addition (D-7).
- `side_panel.default_path` — unchanged (points to `sidepanel/sidepanel.html`, which is the same file the standalone window loads).
- `content_security_policy.extension_pages` — unchanged (`script-src 'self'; object-src 'self'` — no relaxation needed).

### §41.4.3 `sidepanel/*` — no changes

- `sidepanel.html` — unchanged. Zero new elements, zero new IDs, zero new scripts.
- `sidepanel.js` — unchanged. Zero branches on "which host am I in." Zero new imports.
- `sidepanel.css` — unchanged. Zero prefix-scoped overrides.
- `theme-init.js` — unchanged.

### §41.4.4 New files — none

B-035 ships no new source files. Only `background/service-worker.js` is modified. New artefacts are the R5 test file and this design chapter.

### §41.4.5 Broadcast subscription — reused as-is

Covered in §41.2. The standalone window inherits the subscription by loading `sidepanel.js`.

### §41.4.6 Summary

| Change | Kind | File | Scope |
|---|---|---|---|
| SW listener for `chrome.commands.onCommand('open-junkie-window')` + `openOrFocusStandaloneWindow` helper | NEW | `background/service-worker.js` | ~40 LOC appended below the B-023 listener block |
| `tests/b035-standalone-window.test.js` | NEW | `tests/b035-standalone-window.test.js` | ~15-20 tests per §41.6 |
| `manifest.json` | NO CHANGE | `manifest.json` | `open-junkie-window` command pre-registered; no permission changes |
| `sidepanel/sidepanel.html` | NO CHANGE | `sidepanel/sidepanel.html` | Loaded verbatim by the standalone window |
| `sidepanel/sidepanel.js` | NO CHANGE | `sidepanel/sidepanel.js` | Loaded verbatim by the standalone window |
| `sidepanel/sidepanel.css` | NO CHANGE | `sidepanel/sidepanel.css` | Loaded verbatim by the standalone window |
| `shared/messages.js` | NO CHANGE | `shared/messages.js` | No new message types |
| `background/storage/*` | NO CHANGE | (none) | No new partitions |
| `background/messages/storage-handlers.js` | NO CHANGE | (none) | No new cases |
| `popup/*` | NO CHANGE | (none) | B-022/B-023 popups coexist; AC19 confirms independence |

## §41.5 No New CSS — Verification

**D-2 option (a) chosen → no new CSS file, no prefix-scoped overrides, no `@media` rules for window-versus-panel hosting.**

All styling derives from `sidepanel/sidepanel.css` as-is. The stylesheet uses relative units (`%`, `em`, `rem`) and CSS variables (`--color-bg`, `--color-fg`, `--color-border`, …) resolved by `theme-init.js` on page load. Both hosts — side panel iframe (~350-400 px wide) and standalone window (1200×800 px) — render the same CSS correctly because the CSS was always written to scale with the host width.

**Spot-check results (sidepanel.css audit):**
- `html, body { width: 100%; }` — scales to host. ✅
- `#panel-header` uses flex layout with relative flex-basis. ✅
- `#item-list` uses block layout with `width: auto`. ✅
- Drag-and-drop CSS (B-030 v2 per §36) uses row-relative positioning. ✅
- Dialogs use fixed positioning relative to the viewport. ✅
- Context menu uses absolute positioning within its container. ✅

**No body-width anchor issue** (the B-022 D-UAT-1 problem that forced `html, body { width: 480px; min-width: 480px }` in `popup/group-jump-popup.css`): B-022 and B-023 hit that because **extension popups** size to body rect, and without an anchor the popup collapses. `chrome.windows.create` standalone windows size based on the `width`/`height` arguments passed to `create`, not based on the body CSS — the window opens at exactly 1200×800 regardless of the CSS. No anchor needed.

**Accessibility parity** (AC18 + UAT-11): all ARIA roles, `aria-label` bindings, focus rings, and WCAG AA contrast tokens come from the existing stylesheet. The standalone window inherits them verbatim. No new accessibility work.

## §41.6 Test Plan Delta — `tests/b035-standalone-window.test.js`

Mapped to AC21 test coverage requirement. All tests use the existing `tests/chrome-mock.js` boundary (mocked `chrome.windows.*`, `chrome.commands.onCommand`, and `chrome.runtime.getURL`).

| # | Test case | Target |
|---|---|---|
| a | SW listener registers on module load | Import `background/service-worker.js` with mocked `chrome.*`; assert `chrome.commands.onCommand.addListener` called exactly once (after B-023 listener) with a function; dispatching a command string other than `'open-junkie-window'` is a no-op |
| b | Dispatch to `open-junkie-window` with no existing window → calls `create` | Mock `chrome.windows.getAll` to return `[]` for popup-typed windows; assert `chrome.windows.create` called exactly once with `{url, type:'popup', width:1200, height:800, focused:true, left, top}`; assert `chrome.windows.update` NOT called |
| c | Dispatch with existing URL-matched popup window → calls `update({focused:true})` | Mock `chrome.windows.getAll` to return one popup with `tabs[0].url === STANDALONE_URL`; assert `chrome.windows.update(existingId, {focused:true})` called; assert `chrome.windows.create` NOT called |
| d | URL-match predicate rejects non-matching popups | Mock `chrome.windows.getAll` to return a popup with `tabs[0].url === 'chrome-extension://other/other.html'`; assert `chrome.windows.create` called (no match), `update` not called |
| e | URL-match predicate rejects popup with no tabs | Mock a popup with `tabs: []`; assert `create` called, `update` not called |
| f | `chrome.windows.create` rejection is caught | Mock `chrome.windows.create` to reject with `Error('create denied')`; assert the listener's outer `.catch` runs (no unhandled rejection); `console.warn` called with the error |
| g | `chrome.windows.update` rejection is caught | Mock `update` rejection; assert `.catch` runs, no unhandled rejection |
| h | `chrome.windows.getAll` rejection is caught | Mock `getAll` rejection; assert `.catch` runs; neither `create` nor `update` called |
| i | Post-close re-detection: second dispatch after `onRemoved` fires calls `create` again | Mock sequence: `getAll` returns existing → `update` → window closes (next `getAll` returns `[]`) → `create` called on next Alt+Shift+J |
| j | Anchor-window computation: focused window picked over first | Mock two real browser windows, the second with `focused: true` at `{left:100, top:50, width:800, height:600}`; assert `create` called with `left ≈ 100+200 = 300`, `top ≈ 50+(-100)= -50 → clamped to 0` |
| k | Anchor-window fallback when no focused window | Mock all real windows with `focused: false`; assert `create` called with undefined left/top (browser-default) |
| l | URL-match uses `chrome.runtime.getURL('sidepanel/sidepanel.html')` — not a hard-coded path | Verify the constant is resolved via `chrome.runtime.getURL` and matches the mock's return value |
| m | Listener ignores non-B-035 commands without side effects | Dispatch `'group-jump'` and `'_execute_action'`; assert no `chrome.windows.*` calls |
| n | Concurrent dispatch: rapid double Alt+Shift+J handles both | Dispatch twice back-to-back while first `getAll` promise is still pending; assert the second dispatch also awaits `getAll` and dispatches correctly (documents the race behaviour — both may call `update` on the same window; documented as acceptable, no duplicate `create`) |
| o | Zero storage writes on open path (C-11 vacuous guard) | Spy on `chrome.storage.local.set` and `chrome.storage.local.get`; dispatch Alt+Shift+J; assert `set` never called. Codifies the C-11 invariant so a future polish item adding a write path is flagged as a regression |

**Integration-level tests** (spanning SW + sidepanel mock context):
- **p** — Broadcast propagation: dispatch a `MSG_STATE_CHANGED` broadcast from the SW mock; assert it is delivered to a fake extension-page listener standing in for the standalone window. (Tests the D-5 claim end-to-end at the message-passing level.)

**Full suite target:** 1163 baseline + ~15-17 new ≈ **1178-1180 passing.**

**UAT coverage:** 13 cases in `docs/UAT_B-035.md` (already authored at R1 per Sprint 22 retro action). Test cases `a-o` above directly correspond to AC1-AC13, AC15, AC16, AC20, and the C-11-vacuous guard.

## §41.7 R2 Correctness Checklist (C-1 through C-11)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| C-1 | Storage schema versioned | N/A | No new storage partition. Zero schema changes. Position/size persistence explicitly deferred (D-4 / AC7). Recency/open-history deferred (D-6). |
| C-2 | Message contracts typed | N/A | No new message types. The standalone window's own content hydration reuses `MSG_GET_PREFERENCES` + `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` unchanged via the shared sidepanel bootstrap. `MSG_STATE_CHANGED` broadcast reused verbatim. |
| C-3 | SW cold-start safe | PASS | SW listener registered synchronously at module scope (MV3 requirement); no `await` before `addListener`. Listener body touches no storage — safe to fire during cold start. Existing-window detection uses per-trigger `chrome.windows.getAll` (D-3 option c) — no SW in-memory state to survive restart. Standalone window's own content fetches hit existing `readyPromise`-gated handlers. AC13 + AC14 + UAT-7 cover both fresh cold start and mid-session SW restart. |
| C-4 | ID stability | PASS | Window IDs returned by `chrome.windows.create` are ephemeral per Chrome extension spec. B-035 **never persists a window id**; per-trigger `getAll` re-enumeration (D-3) side-steps the stability concern entirely. Group + item IDs viewed inside the standalone window are unchanged (§3 ULIDs). |
| C-5 | Manifest file references resolvable | PASS | The `url` argument to `chrome.windows.create` is a runtime string resolved via `chrome.runtime.getURL('sidepanel/sidepanel.html')`. The target file is `sidepanel/sidepanel.html`, which already exists and is already referenced by `manifest.json:11-13` (`side_panel.default_path`). No new manifest file reference. `open-junkie-window` command in `manifest.json:35-40` carries no URL field — it is a command, not a popup reference. |
| C-6 | Permission minimisation | PASS | **Zero new permissions.** D-7 audit confirms `chrome.windows.create`/`update`/`getAll`/`onRemoved` work under the existing `"tabs"` permission; no `"windows"` key needed. `chrome.commands.onCommand` requires no explicit permission (implicit via the `commands` manifest block). [security-reviewer] at R4 has nothing new to audit on the permission front. |
| C-7 | Allow-list direction | N/A | No sanitizer, validator, or export surface added. All rendering inside the standalone window goes through existing `sidepanel.js` paths that already use `textContent` + `shared/highlight.js` DocumentFragment helpers (B-021/B-022 pattern). |
| C-8 | SW-context feasibility | PASS | `chrome.commands.onCommand.addListener` — SW-reachable (already in use by B-023). `chrome.windows.getAll` — SW-reachable (already in use by B-014 cold-start). `chrome.windows.create` — SW-reachable (documented MV3 API; verified against MDN). `chrome.windows.update` — SW-reachable (already in use by B-010). `chrome.runtime.getURL` — SW-reachable (core extension API). **No DOM APIs used in SW context** (no `DOMParser`, no `document`, no `CSS.paintWorklet`). |
| C-9 | Empty-state design | PASS | AC19 + the AC-C-9 enumeration (8 sub-states) already covers: (a) zero groups/items → sidepanel's existing empty state renders (AC20); (b) window already open → focus path (AC3); (c) secondary-monitor display — `getAll` + URL match is display-agnostic; (d) SW cold-start mid-create → race handled by re-trigger (next Alt+Shift+J re-enumerates); (e) SW cold-start mid-session → re-hydrates on interaction per AC14; (f) drag events inside standalone — sidepanel.js drag handlers work identically; (g) `chrome.windows.*` rejection → caught + logged (AC12 + test (f)(g)(h)); (h) `windows` permission absent — D-7 proves no permission needed. All 8 sub-states mapped to either existing sidepanel behaviour or the SW listener's error-handling path. |
| C-10 | Off-screen rect feasibility | N/A | No `setDragImage`, no `canvas.toDataURL`, no `top: -9999px` snapshotting. Standard window creation with browser-native OS chrome. B-085 class does not apply. |
| C-11 | Popup-lifecycle message ordering | **PASS (vacuous)** | D-6 audit confirms **zero SW-side writes in v1**. No `MSG_RECENCY_ADD`-class pattern. No preference write on open. No position/size write on resize. No `MSG_NAVIGATE_TO_ITEM`-class before focus shift. Activation flows (click bookmark inside standalone) route through existing sidepanel → SW write messages that already pass C-11 in their own chapters. Standalone window **is a window, not a popup** — it does NOT tear down on focus shift (B-022/B-023 lifecycle concerns do not apply). Test (o) in §41.6 codifies the zero-write guard as a regression test. **If a future polish item adds any SW write on open/focus/close, C-11 REQUIRES re-audit before ship.** |

All eleven checks PASS or N/A-PASS. No CONCERN blockers. No VERIFICATION REQUIREMENTS outstanding for R3 (B-023's Edge-127 gate for `openPopup` does not apply; B-035's `chrome.windows.*` APIs are Edge-old-baseline compatible).

## §41.8 Rollback Plan

**Risk level:** LOW. Additive surface only — ~40 LOC in `background/service-worker.js` + one new test file. Zero storage mutations. Zero manifest permission changes. Zero manifest file-reference changes. Zero modifications to existing `sidepanel/*` files.

**Rollback procedure:**

1. `git revert <B-035-merge-sha>`. This reverts:
   - Removes the `chrome.commands.onCommand('open-junkie-window')` listener block + `openOrFocusStandaloneWindow` helper + module-level constants from `background/service-worker.js`.
   - Deletes `tests/b035-standalone-window.test.js`.
2. **No data cleanup required** — no storage writes, no orphan keys. Any standalone window open at revert time continues to work (it's just a `chrome.windows.create` popup hosting `sidepanel/sidepanel.html` — nothing about revert touches that open window's state). The user can close it manually; post-revert, Alt+Shift+J no longer does anything because the listener is gone, but no broken state remains.
3. **No manifest cleanup** — `open-junkie-window` command registration at `manifest.json:35-40` stays (pre-existing since v1.21.0). Leaving it in place costs nothing and means a future re-attempt doesn't need to re-register.
4. **No sidepanel code cleanup** — sidepanel.{html,js,css} were not modified.
5. **Chrome Web Store / Edge Add-ons rollback:** build from pre-B-035 tag (v1.21.0), re-submit. No user data affected.

**Non-revert rollback (hotfix):** Replace the `chrome.commands.onCommand` listener body with a no-op (`if (command !== 'open-junkie-window') return; /* feature-disabled */ return;`). Preserves scaffold for a next attempt. Ship as v1.22.1 patch.

**Storage schema changes:** none. No rollback procedure needed on the storage dimension.

## §41.9 Known Risks / Follow-ups (S29+ candidates)

1. **No window position/size persistence.** Fresh 1200×800 every open (D-4 / AC7). User preference for a different default (e.g., remembered last size) is deferred — would require new storage partition + C-11 audit per D-6 note.
2. **No multiple simultaneous standalones.** D-3 option (c) focuses the first URL-match; if the user somehow has two standalones (dev tooling, race), the second is ignored. Edge case; R5 test (d) + (e) verifies predicate hygiene. Polish: detect and warn/close duplicates.
3. **Anchor-window centering uses `active_window.rect`, not `chrome.system.display.getInfo`.** D-4 rationale — avoiding a new permission. Approximation is "good enough" for the center-on-active-display UX goal, but can place the window slightly off on multi-monitor setups if the active window itself is partially off-display. Low-impact.
4. **No detach-from-side-panel gesture.** User opens via Alt+Shift+J only; no drag-to-detach. Out of scope for v1; would require new UX + storage hand-off of panel state.
5. **B-038 display-mode preference interaction.** B-038 (backlog) will add a Settings toggle to choose default surface. When B-038 ships, the Alt+Shift+J path and the side-panel path both need to read the preference and potentially skip the secondary-surface invocation. Out of scope for B-035 proper.
6. **`chrome.sidePanel.open` + Alt+Shift+J coexistence.** If a user opens both surfaces simultaneously (side panel and standalone), they operate independently with shared state via `MSG_STATE_CHANGED` (AC10 + D-5). No collision. R5 UAT-4 verifies.
7. **SW cold-start mid-`getAll`.** If the SW terminates between `chrome.windows.getAll` resolving and the subsequent `update`/`create` call, the `await` continuation may be aborted. Chromium currently delivers the promise-resolution before tearing down; the risk is bounded by Chromium's behaviour. If observed as a FAIL at UAT-5/UAT-7, mitigation is to break the handler into a synchronous dispatch-and-forget with `chrome.windows.getAll(...).then(...)` instead of `await` — same pattern as B-023's D-R4-2 reshape. **Flagged for R4 [code-reviewer] attention** even though the current shape is acceptable.
8. **URL-match is exact-string.** If the extension's origin URL changes mid-session (never happens on stable installs; only on unpack-reload during dev), a previously-opened standalone window would fail to match on next trigger, leading to a duplicate. Dev-only concern; UAT is done against a stable load.
9. **Focus-return after standalone close.** Browser returns focus naturally to whichever window was previously focused. Same behaviour as closing any popup window. No explicit handling needed.
10. **Broadcast propagation latency.** D-5 state-sync assumes `MSG_STATE_CHANGED` reaches both surfaces within the existing broadcast timing (~ms). UAT-4 verifies with a manual probe. If perceived latency is an issue in practice, it is a §10.10 broadcast-architecture concern, not a B-035 concern.
11. **`chrome.windows.create` `focused:true` on Edge.** Edge respects `focused: true` for popup windows. Verified against Edge 125+ docs. No known regression.
12. **Accessibility: focus on standalone open.** When the window opens, Chromium gives it OS-level focus; the first focusable element inside (`#filter-input` via standard tab order) gets DOM focus on `DOMContentLoaded`. Existing sidepanel focus behaviour carries over. No new accessibility work.

---

**R2 verdict: READY FOR R3.**

## §41.10 As Built (R6 Close — Sprint 28)

### §41.10.1 Deviations from R2 Plan

Three R4-discovered deviations, all resolved in-sprint before R5; plus two UAT-4-discovered deviations that required cross-module fixes:

#### D-R4-1 — Anchor fallback spec drift (code-reviewer H-1) — FIXED

**R2 spec (§41.4.1):** `allWins.find((w) => w.focused) || allWins[0] || null`

**R3 as shipped:** `allWins.find((w) => w.focused) || null` — the `|| allWins[0]` fallback was dropped. In the edge case where no window reports `focused: true` (e.g., only the newly created popup itself is present and it hasn't reported focus yet), `anchor` resolves to `null`, and the `left`/`top` computation short-circuits to `undefined` — the window falls back to browser-default placement rather than display-centering.

**Fix:** restored `|| realWins[0] || null` using the M-2 `realWins` filter (see D-R4-2) so the fallback excludes the newly-created popup itself from anchor consideration.

#### D-R4-2 — Popup-type filter for anchor set (qa-reviewer M-2) — FIXED

**R3 as shipped:** anchor computation used raw `allWins` (the full `chrome.windows.getAll` response from the first call, including popup-type windows). Race condition: if an existing standalone window is present but not focused, it could become its own anchor for centering a new standalone — placing the new window on top of the old one rather than centered on the user's active display.

**Fix:** introduced `realWins = allWins.filter((w) => w.type !== 'popup')` before the anchor lookup. The anchor is now always a real browser window, never a popup (standalone Tab Junkie window or otherwise).

#### D-R4-3 — `focused: true` key order + comment D-4 citation (code-reviewer L-1/L-2) — FIXED

**R3 as shipped:** `focused: true` appeared after the conditional spread (`...(left !== undefined ? { left } : {})`), contra the R2 spec skeleton. The block comment cited D-1/D-2/D-3 but omitted D-4. Both fixed inline: `focused: true` moved before the spread, comment updated to cite D-1 through D-4.

---

#### D-UAT-4a — `hashItem` sortOrder-blindness (sidepanel/search-index.js) — FIXED

**Root cause (pre-existing tech debt, §37.9 F-1):** `hashItem` excluded `sortOrder` from its hash string. Same-group reorders produced items where every field matched except `sortOrder`; `diffAndPatch` resolved them as `deltaType: 'noop'` and emitted no patch deltas. The originating sidepanel surface worked around this with an explicit `renderAll` tail in the B-025/B-030 mutation handlers — local compensation that was invisible to remote surfaces.

**Why this surfaced in B-035:** the standalone window is the first remote surface that receives `MSG_STATE_CHANGED` broadcasts without the local originating-surface compensation. It has no `renderAll` tail; it depends entirely on broadcast-delivered deltas for updates. A same-group reorder broadcast arrived with `deltaType: 'noop'` for every item → no re-render → stale display.

**Fix:** `sortOrder` added to `hashItem`. Same-group reorders now produce `deltaType: 'patch'` deltas. Closes §37.9 F-1. Perf impact is marginal — one additional string concatenation per item per diff pass. The B-030/B-025 `renderAll` tails on the originating sidepanel remain in place (redundant but harmless — they are local compensations for a problem now solved at the hash level).

**Test suite impact:** one existing test in `tests/b052-fuzzy-search-perf.test.js` asserted that a sortOrder-only edit produced a `noop` delta. That assertion is now incorrect by design. The test was inverted to expect `patch`; a Sprint 28 docstring in the test file records the inversion rationale so the change is not mistaken for a regression.

#### D-UAT-4b — Patch-consumer keeps old DOM position (sidepanel/sidepanel.js broadcast handler) — FIXED

**Root cause:** after the `hashItem` fix, `diffAndPatch` correctly emitted `kind: 'updated'` deltas for reordered items. However, `_patchSingleRow`'s `updated` branch calls `existing.replaceWith(freshRow)` — it swaps the row's *content* in the old DOM node's position. For a rename or URL-edit (different group position is irrelevant), this is correct. For a sortOrder change within the same group, the row must move to a different position in the group's DOM sequence, but `replaceWith` leaves it at its old index.

**Fix:** in the broadcast handler (the `MSG_STATE_CHANGED` items-scope branch in `sidepanel.js`), before routing to the patch loop, a pre-patch check compares each incoming updated item's `sortOrder` against the locally cached value. If any updated item's `sortOrder` differs from the cache, the handler skips the patch branch entirely and falls through to `renderAll`. This preserves the `_patchSingleRow` optimization for rename-only and groupId-only updates; only position-affecting changes trigger a full re-render of the affected surface.

**Fix chain summary:**

```
UAT-4 FAIL: same-group reorder not reflected in standalone window
  → hashItem fix: noop → patch delta (D-UAT-4a)
    → delta is correct, but DOM position stale
      → patch-consumer pre-check: bail to renderAll on sortOrder diff (D-UAT-4b)
        → UAT-4 PASS
```

---

### §41.10.2 R4 Findings Disposition

| Severity | Count | Resolved in-sprint | Deferred |
|---|---|---|---|
| HIGH | 2 | 2 (B-082-H1 tab trap · B-035-H1 anchor fallback D-R4-1) | 0 |
| MEDIUM | 4 | 4 (popup filter D-R4-2 · 3 other items inline) | 0 |
| LOW | ~4 | 0 | 4 (test file coverage gap · UAT-6 SKIP disposition · second getAll redundancy · §28.4 docs hygiene) |

All CRITICAL/HIGH findings resolved before R5 per the mandatory gate. LOW findings logged to `docs/findings/sprint-28.md` for S29+ hygiene triage.

### §41.10.3 C-1 through C-11 Re-verification

All checks re-verified against shipped code:

| # | Status | Notes |
|---|---|---|
| C-1 | N/A | No storage schema changes. Zero new partitions. |
| C-2 | N/A | No new message types. Bootstrap reuses `MSG_GET_PREFERENCES` + `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS`. |
| C-3 | PASS | SW listener at module scope. Per-trigger `getAll` (D-3). No SW in-memory window state. |
| C-4 | PASS | No window id persisted. ULID item/group IDs unchanged. |
| C-5 | PASS | `chrome.runtime.getURL('sidepanel/sidepanel.html')` — file pre-exists in manifest. |
| C-6 | PASS | Zero new permissions. `chrome.windows.create` runs under existing `tabs` grant (D-7 confirmed). |
| C-7 | N/A | No new sanitizer or export surface. |
| C-8 | PASS | All SW-side APIs (`chrome.commands.onCommand`, `chrome.windows.*`, `chrome.runtime.getURL`) are SW-reachable. No DOM APIs in SW context. |
| C-9 | PASS | All 8 empty-state sub-states from R2 §41.7 verified at UAT. |
| C-10 | N/A | No off-screen snapshotting. |
| C-11 | PASS (vacuous) | Zero SW writes on the open/focus/create path. D-UAT-4a/4b fixes are UI-layer (sidepanel.js broadcast handler + search-index.js); they do not touch SW write paths. The zero-write guard is codified in test (o) of `tests/b035-standalone-window.test.js`. |

### §41.10.4 New Precedents

**P-1 — Remote-surface broadcast audit rule (S29 retro action):** when a new extension surface is added that consumes `MSG_STATE_CHANGED` broadcasts without an originating-surface compensation (i.e., the new surface is a pure broadcast receiver, not the mutation initiator), the broadcast-receiver paths in ALL other surfaces must be audited for local workarounds that silently mask delta-completeness gaps. D-UAT-4a lived hidden for 9 sprints (Sprint 19 → Sprint 28) because the originating sidepanel's `renderAll` tail masked the `hashItem` gap for that surface exclusively. The standalone window, as the first pure-receiver surface, had no such masking.

**Recommendation for CLAUDE.md:** add a check — "New broadcast-receiver surface: audit all existing compensations in originating-surface mutation handlers for delta-completeness gaps (precedent: B-035 UAT-4, S28)" — to the R2 correctness checklist as C-12 when a sprint item introduces a new extension page that subscribes to `MSG_STATE_CHANGED`.

### §41.10.5 Test Count Reconciliation

| Source | Count |
|---|---|
| Baseline before Sprint 28 | 1 190 |
| `tests/b035-standalone-window.test.js` (new) | +15 |
| `tests/b052-fuzzy-search-perf.test.js` (1 test inverted — sortOrder noop → patch) | ±0 net |
| Sprint 28 final | **1 190 baseline + net new = 1 190+ (all green)** |

R2 projected ~1178-1180; actual baseline was 1 190 (12 tests added in S24-S27 that post-dated the R2 estimate). Net addition of 15 B-035 tests matches the R2 plan's ~15-17 target.

### §41.10.6 Final File Manifest

| File | Status | Change |
|---|---|---|
| `background/service-worker.js` | MODIFIED | +~40 LOC: `open-junkie-window` command handler + `openOrFocusStandaloneWindow` + constants. D-R4-1/2/3 fixes applied. |
| `sidepanel/search-index.js` | MODIFIED | `hashItem` now includes `sortOrder` (D-UAT-4a). Closes §37.9 F-1. |
| `sidepanel/sidepanel.js` | MODIFIED | Broadcast handler pre-patch sortOrder check (D-UAT-4b). |
| `tests/b035-standalone-window.test.js` | NEW | 15 tests per §41.6. |
| `tests/b052-fuzzy-search-perf.test.js` | MODIFIED | 1 test inverted (sortOrder noop → patch) + S28 docstring. |
| `sidepanel/sidepanel.html` | UNTOUCHED | Loaded verbatim. D-2 option (a) confirmed. |
| `sidepanel/sidepanel.css` | UNTOUCHED | Zero new CSS. |
| `sidepanel/theme-init.js` | UNTOUCHED | — |
| `manifest.json` | UNTOUCHED | No new permissions, no new file refs. |
| `shared/messages.js` | UNTOUCHED | No new message types. |
| `background/storage/*` | UNTOUCHED | No new partitions. |
| `popup/*` | UNTOUCHED | B-082 coexists independently. |

D-2 option (a), D-3 option (c), D-6 C-11 vacuous, and D-7 no-new-permission — all confirmed as shipped.

---

**R6 verdict: CLOSED. Sprint 28 B-035 As Built complete.**
