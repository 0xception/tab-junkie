# §46 — B-099 Drift Fix (Option B + Reconcile Action) (R2 Design)

**Sprint:** 33
**Tier:** Full (M)
**Status:** R2 complete (2026-04-25) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.5 (LiveTabIndex & TabClaims architecture — defines `claimsMirror`, `reevaluateTab`, `releaseClaimByTab`); §10.7 (Drift Detection Architecture — defines `tj:drift` write/clear paths and indicator lifecycle); §10.10 (Broadcast architecture — `SCOPE.LIVE_STATE` + `SCOPE.ITEMS` re-render contract); §25 (B-024/B-026 — item context menu host where the new "Snap to this tab" entry lands); §26 (B-055 Open Tabs — `buildOpenTabs()` filter contract that depends on `claimsMirror`); §31 (B-048 Item Visual-State Matrix — indicator strip ordering + drifted-icon factory).
**Out-of-scope (explicit, AC13):** (a) push notification or browser badge on drift detection; (b) "Restore tab to bookmark URL" (navigate the live tab back to the saved URL); (c) "Save as new bookmark" from the drift indicator; (d) drift record auto-expiry after N hours/days; (e) aggregate "N items drifted" count badge anywhere in the UI; (f) dedicated "Drifted Items" section/filter in the sidepanel. All deferred to icebox per AC13. **Also out-of-scope:** any storage `schemaVersion` bump (zero schema changes); any new `manifest.json` permission (zero permission changes); any new message type (reuses `MSG_UPDATE_ITEM`).

---

## §46.1 Overview

B-099 is a single-item bug-fix-plus-UX-polish sprint that closes a behavior defect dating to Sprint 1 (B-001d). When a saved bookmark's claimed live tab navigates to a different URL, the current `reevaluateTab` (`background/tabs/tab-claims.js:162-197`) deletes `claimsMirror[itemId]` BEFORE `detectDriftForTab` runs — the very next call (in `tab-events.js:111`) then finds no claim and returns early (AC6 of §10.7). The net result: the original item silently loses both its claim AND its drift indicator, and the now-unclaimed tab "orphans" into the Open Tabs section as if the user had opened a fresh untracked tab. The user's mental model — "this bookmark now points somewhere different" — has no UI surface.

B-099 ships **Option B**: `reevaluateTab` no longer releases the claim on URL mismatch. The only paths that release a claim become (1) `tabs.onRemoved`, (2) `windows.onRemoved`, (3) `MSG_DEMOTE_ITEM`, and (4) `MSG_NAVIGATE_TO_ITEM`'s stale-claim repair branch. The "try to claim a different item" branch in `reevaluateTab` is preserved so a previously-unclaimed tab navigating to a matching item URL still auto-claims. `detectDriftForTab` now runs against a still-claimed tab and successfully writes the drift record. The sidepanel and newtab indicator-render paths already handle the additive case (drift + audible + active + window badge) — no suppression logic — so the only UI deltas needed are (i) a slightly more prominent drift icon (16 px in sidepanel, unchanged 12 px in newtab dense row), and (ii) a new browser-native `title` tooltip on the drift indicator showing the **hostname** of the drifted-to URL.

The paired UX action is **"Snap to this tab"** — a new entry in the item context menu (sidepanel, right-click) that is rendered only when `_cachedDriftRecords[itemId]` is defined. Click dispatches the existing `MSG_UPDATE_ITEM` with `{ id, patch: { url: drift.driftedToUrl } }`. The SW handler (`background/messages/storage-handlers.js` `MSG_UPDATE_ITEM` case) is extended to detect `patch.url` changes and call `clearDrift(p.id)` inline after `updateItem` resolves — the locked P1 strategy: atomic with the storage write, no new message contract, impossible for a UI client to forget. Confirmation is an inline toast with **Undo** (5-8 s window): the click handler captures the pre-snap `originalUrl` from `_itemById` and the Undo lambda dispatches `MSG_UPDATE_ITEM { id, patch: { url: originalUrl } }`. Drift will be re-detected naturally on the next `tab.onUpdated` event if the live tab is still at the drifted URL.

R3 lands ~150 net LOC (one block deletion in `tab-claims.js`, one inline `clearDrift` in `storage-handlers.js`, one new context-menu entry block in `sidepanel.js`, a tooltip pass on `_createDriftedIcon` + `_buildIndicators`, a CSS bump from 14 px to 16 px on `.item-drifted-icon svg`, an extension to `showToast` to support an optional `{ undoLabel, onUndo }` shape, and a corresponding `<button>` slot in `sidepanel.html`'s toast). Zero storage schema changes, zero new manifest permissions, zero new message types. R5 measures the AC11 ≥ 8 automated tests + UAT_B-099.md ≥ 8 cases. R6 documents As-Built deltas in §46.10.

---

## §46.2 Existing-State Reality Check

**Today (2026-04-25 on `feature/sprint-33-drift-fix`, branched off `release/v2`):**

- `background/tabs/tab-claims.js:162-197` `reevaluateTab(tabId, newUrl, items)`:
  - Lines 167-176 (the bug): walks `claimsMirror` for the target `tabId`. If the claim's item URL no longer matches `normalizedNew`, the entry is deleted from `claimsMirror`, `dirty = true`. **This is the Option-B-violating block — B-099 R3 deletes it.**
  - Lines 178-196 (preserved): if the tab is `!alreadyClaimed`, look for an unclaimed item whose URL matches `normalizedNew`, sorted ascending by `sortOrder`, and assign the first match. **This is preserved — a previously-unclaimed tab landing on a matching saved URL still auto-claims.**
  - Single `writeClaims()` at line 195 only when `dirty === true`.
- `background/tabs/tab-events.js:99-117` `tabs.onUpdated` handler (URL branch):
  - Per-tab debounce at 100 ms (`reevalTimers`).
  - Awaits `readyPromise`, then `listItems()`, then **`reevaluateTab` THEN `detectDriftForTab`** in that exact order (lines 110-111). Under current behavior, the claim is gone by the time `detectDriftForTab` runs, hitting the `claimedItemId === null` early-return at `drift.js:34`. **B-099's claim-preservation makes this sequence behaviorally correct.**
  - Single `broadcast(SCOPE.LIVE_STATE, 'tab/updated', { requireClaimsReady: true })` after both await.
- `background/tabs/drift.js:29-59` `detectDriftForTab(tabId, currentTabUrl, items)`:
  - Looks up `claimedItemId` via `getItemIdForTab(tabId)` (centralised reverse-lookup, H2 from §10.7).
  - If unclaimed → no-op. If claimed and URLs mismatch → `writeDrift`. If claimed and URLs match → `clearDrift`. **No code change required for B-099 — this function is correct under Option B.**
- `background/messages/storage-handlers.js:179-180` `MSG_UPDATE_ITEM` case:
  - Currently a one-liner: `return updateItem(p.id, p.patch);`. **B-099 R3 expands to read pre-patch item, call updateItem, then conditionally `clearDrift(p.id)` when `patch.url` changed (P1 inline strategy).**
- `background/storage/items.js:226-257` `updateItem(id, patch)`:
  - Validates patch via `validatePatch` (rejects unknown fields, oversize URL, etc.).
  - Single `writeTransaction` over `PARTITION_GROUPS` (FK read for `groupId` patches) + `PARTITION_ITEMS` (the actual write). Returns the post-patch item shape. **No code change — B-099 calls this unchanged.**
- `background/tabs/open-tabs.js:33` `buildOpenTabs()`:
  - Filters `getLiveTabIndex()` by excluding any `tabId` present in `Object.values(getClaimsMirror())`. Under Option B, a drifted item's tab IS still in `claimsMirror` → already excluded from Open Tabs. **No code change required. AC4 is a regression guard, not a new build.**
- `sidepanel/sidepanel.js`:
  - `_cachedDriftRecords` (line 212): in-memory mirror updated on every `MSG_LIST_ITEMS` round-trip and on every `scope: items` broadcast (line 1956, 2921, 4958, 4986). **R3 reads from this for "Snap to this tab" visibility gating.**
  - `_createDriftedIcon()` (line 2199-2208): hardcoded SVG warning triangle, `aria-hidden="true"`, no `title` attribute. **R3 extends signature to accept an optional `driftedToUrl` and set `title="Drifted to: <hostname>"` when provided.**
  - `_ensureIndicators(row, live, isDrifted)` (line 3051-3097): handles the two delta cases (audible and drifted) on live-state broadcasts. Currently calls `_createDriftedIcon()` with no arguments. **R3 changes the call to `_createDriftedIcon(_cachedDriftRecords[itemId]?.driftedToUrl)`.** When `isDrifted` flips false→true after the row already exists, the new tooltip lands on the freshly-created icon.
  - `buildItemRow` indicator strip (line 2340-2356): builds indicators in DOM order **window badge → audible → drifted**. Already matches Q5's locked order — **no change required to the order, only to the `_createDriftedIcon()` argument** (line 2353).
  - `openContextMenu(row, x, y)` (line 5825-5988): builds the item-row right-click menu in DOM order Navigate → Edit → Move-to-group `<select>` → (Close tab if live) → separator → Delete. **R3 inserts a new "Snap to this tab" entry, gated on `_cachedDriftRecords[itemId]`, between Edit and Move-to-group (AC5 — only present when drifted).**
  - `showToast(message)` (line 1631-1636): single-arg, sets `toastMessageEl.textContent`, shows for 4 s, dismiss button hides it. **R3 extends signature to `showToast(message, options?)` where `options = { undoLabel?: string, onUndo?: () => void, durationMs?: number }`. When `undoLabel` is present, an `<button class="toast-undo">` is rendered alongside the dismiss button; click calls `onUndo()` then hides the toast. Default duration extends to 6 s for undo-bearing toasts (mid-point of the 5-8 s spec).**
- `sidepanel/sidepanel.html:219-223`: existing toast markup carries `id="toast-message"` + `id="toast-dismiss"`. **R3 inserts a new `<button id="toast-undo" class="toast-undo" type="button" hidden>Undo</button>` between message and dismiss.** `role="alert"` and `aria-live="assertive"` are preserved.
- `sidepanel/sidepanel.css:547-551` `.item-drifted-icon`: `display: none` (overridden to `flex` only when `[data-drifted="true"]`), `align-items: center`, `color: var(--drifted-color)`. **R3 changes `_createDriftedIcon`'s SVG `width="14" height="14"` to `width="16" height="16"`.** The CSS already drives color from `--drifted-color`; no new CSS token needed.
- `newtab/newtab.js:819-855` `_buildIndicators(itemId)`: builds a `<span>` strip with optional active/live dot, audible note, and a 12 px drifted dot (`.newtab-indicator-drifted`). The drifted dot already carries `aria-label="Tab has navigated away from its saved URL"` but **no `title` tooltip**. **R3 extends to also set `title="Drifted to: <hostname>"` derived from `_driftRecords[itemId]?.driftedToUrl` (hostname-only via `new URL(...).hostname` with try/catch fallback).**
- `newtab/newtab.css:407-408` `.newtab-indicator-drifted`: `background: var(--drifted-color)`. **No change — newtab dense row keeps the 12 px dot per Q4.**
- `shared/themes.css`: defines `--drifted-color` for **all 14 themes** (verified via `grep --drifted-color shared/themes.css | wc -l` → 16 entries: 14 themed roots + 2 `prefers-color-scheme` overrides for `system`). **No new token needed.** Note: the R1 lock referenced `--color-warning` — that token does NOT exist in the codebase. R2 D-7 corrects this by using the existing `--drifted-color` token (already used by `.item-drifted-icon` and `.newtab-indicator-drifted`). Functionally identical: `--drifted-color` is the amber/orange hue R1 specified ("warning amber/orange on all 14 themes"). See D-7 below.
- **No pre-existing B-099 code, no partial implementation, no unreviewed scaffolding.** R3 modifies six files (`tab-claims.js`, `storage-handlers.js`, `sidepanel.js`, `sidepanel.html`, `sidepanel.css`, `newtab.js`) and adds two (`tests/b099-drift-fix.test.js`, `docs/UAT_B-099.md`).

---

## §46.3 Design Decisions (D-1 through D-10)

### D-1 — Option B claim-preservation locked (R1 P2; carried over)

**Choice:** `reevaluateTab` deletes the URL-mismatch release block (lines 167-176). Claim release is reduced to four explicit triggers: `tabs.onRemoved`, `windows.onRemoved`, `MSG_DEMOTE_ITEM`, `MSG_NAVIGATE_TO_ITEM` stale-claim repair.

**Rationale:** product-owner direction. The claim is the bookmark↔tab association that survives URL drift. Releasing it on URL change orphans the tab and severs the user's mental model. Option B is the only behavior consistent with "drift = the bookmark still points to this tab, but the tab has moved."

**Consequence:** the `_alreadyClaimed` check at line 181 will now be `true` for any drifted tab — the "try to claim a different item" branch (lines 178-196) is therefore a no-op for drifted tabs. **AC2 is the regression guard for this consequence.**

### D-2 — Drift-clear strategy: inline in SW `MSG_UPDATE_ITEM` handler (R1 P1; carried over)

**Choice:** `background/messages/storage-handlers.js` `MSG_UPDATE_ITEM` case is extended to (i) read pre-patch item via `getItem(p.id)`, (ii) call `updateItem(p.id, p.patch)` as today, (iii) iff `p.patch.url !== undefined && p.patch.url !== preItem.url` AND the pre-update fetch succeeded, call `await clearDrift(p.id)` after the storage write. Order: `updateItem` THEN `clearDrift` (drift partition write must observe the post-update item state, not the pre-update). The `MSG_UPDATE_ITEM` broadcast (`SCOPE.ITEMS`) fires after both writes per the existing dispatcher contract (line 642-664).

**Rationale:** atomic with the storage write, no new message contract, impossible for any UI surface (sidepanel, newtab, popup, future surfaces) to forget. Edit dialog URL changes ALSO clear drift correctly under this approach — a strict superset of the locked behavior. The "B-070 plain-language toast precedent" of doing UI-side cleanup is wrong here: drift is SW-owned state, must be SW-owned clear.

**Alternative considered:** a new `MSG_RECONCILE_DRIFT` typed message dispatched from the sidepanel after `MSG_UPDATE_ITEM` resolves. **Rejected** — two round-trips, two broadcasts, two ways for the UI to forget the cleanup, no atomicity guarantee.

### D-3 — Re-claim contention: original claim wins (R1 P2; carried over)

**Choice:** when the locked `_alreadyClaimed` check at line 181 of `reevaluateTab` finds the tab is still claimed (because D-1 removed the release branch), the "try to claim a different item" block (lines 178-196) is skipped. The original claim survives. The new matching item remains unclaimed.

**Rationale:** R1 P2 — explicit product-owner direction. The only way for the new item to gain a claim is for the user to (i) explicitly demote the original via "Close tab & unsave" (`MSG_DEMOTE_ITEM`), (ii) close the tab (`tabs.onRemoved`), or (iii) navigate the saved item via `MSG_NAVIGATE_TO_ITEM` (which the existing handler routes to a fresh `chrome.tabs.create`). **AC2 + UAT-5 are the regression guards for this contention semantics.**

### D-4 — Indicator additive behavior; drift icon last (R1 P3 + Q5; carried over)

**Choice:** drift indicator coexists with all live-state indicators (window badge, audible note, live dot, active dot). DOM order: **window badge → audible → drift** (left-to-right). The existing `buildItemRow` indicator strip (sidepanel.js line 2340-2356) and `_buildIndicators` (newtab.js line 819-855) already match this order. No suppression logic is added.

**Rationale:** the drift indicator answers "what's wrong with the bookmark?" while live indicators answer "what's the tab doing right now?" — orthogonal data, additive UI. R1 Q5 lock. **AC3 + UAT-8 are the regression guards.**

### D-5 — "Snap to this tab" surface: item context menu (R1 Q1 + AC5; carried over)

**Choice:** the new entry lives in the item context menu (`openContextMenu` at sidepanel.js line 5825-5988), not in the persistent `.item-actions` row. Visibility is gated on `_cachedDriftRecords[itemId]`: when the item has no drift record, the menu entry is **completely absent from the DOM** (not disabled, not visually muted). When the item is drifted, the entry is present and enabled. Label: **"Snap to this tab"** (R1 Q1 lock).

**Rationale:** the actions row is a hot path used on every render and must stay compact. The context menu is the established host for state-conditional actions (e.g., "Close tab" — only visible when `isLive`). **AC5 makes the absent-when-not-drifted contract explicit.**

### D-6 — Confirmation pattern: inline toast + Undo (R1 Q2 + AC8; carried over)

**Choice:** no pre-action modal. Click on "Snap to this tab" dispatches `MSG_UPDATE_ITEM` immediately. Within the same handler, `showToast('Bookmark snapped to current tab', { undoLabel: 'Undo', onUndo: () => sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { url: originalUrl } }) })` is called. `originalUrl` is captured from `_itemById.get(itemId).url` BEFORE dispatch. The toast auto-dismisses after **6 seconds** (mid-point of R1's 5-8 s window — chosen to give a clear "5-8 s undo" perception while leaving room for slow human reaction times). The `_toastTimer` reuse in the existing `showToast` already handles re-trigger / dismiss.

**Rationale:** the action is low-blast-radius: storage holds the pre-snap URL until the dispatch resolves; Undo dispatches the inverse update. Modal would interrupt flow for a sub-second, fully reversible action. R1 Q2 lock; B-070 plain-language toast precedent.

**Destructive-action confirmation (DoR item 7) — RETAINED.** The toast + Undo IS the confirmation affordance. Per R1 BACKLOG entry: "an undo-capable inline toast (5-10 s window) is the confirmation affordance." The retention is documented up front in the AC block, not buried in an edge-case AC. AC15-style reactive placement risk (Sprint 20 B-007 precedent) is mitigated.

### D-7 — Drift indicator visual: 16 px (sidepanel) + `--drifted-color` token + `title` tooltip

**Choice:** `_createDriftedIcon` SVG viewport changes from `14×14` to `16×16` in sidepanel. `--drifted-color` is the existing CSS variable (already defined in all 14 themes per `shared/themes.css`). Newtab dense row keeps the 12 px dot (`.newtab-indicator-drifted`). The icon (sidepanel) and dot (newtab) gain a `title="Drifted to: <hostname>"` attribute, derived from `driftedToUrl` via `new URL(driftedToUrl).hostname` with a try/catch fallback to the raw `driftedToUrl` string if parsing throws.

**Rationale:** R1 Q4 specified `--color-warning` — that token does NOT exist in the codebase (verified by `grep --color-warning` returning zero hits in `shared/themes.css`, `sidepanel/sidepanel.css`, `newtab/newtab.css`). The existing token used by the current `.item-drifted-icon` and `.newtab-indicator-drifted` is `--drifted-color`, which IS defined for all 14 themes (16 entries: 14 themed roots + the 2 `system` `prefers-color-scheme` overrides) and renders as warning amber/orange (e.g., `#d97706` light root, `#fbbf24` dark root, `#ffb86c` dracula). Functionally identical to R1's intent; reusing the existing token is a strict win on consistency. **R2 corrects R1 Q4's token name; behavior unchanged.**

R1 Q3 lock: hostname-only tooltip (not full URL). Hostname keeps the tooltip short across long URLs with paths/queries/fragments (e.g., `Drifted to: github.com` not `Drifted to: https://github.com/anthropic/very/long/path?query=string#frag`). The fragment is already stripped at write time (§10.7 step 3) so the stored `driftedToUrl` is path+query but no fragment.

### D-8 — Open Tabs filter unchanged (R1 P4; AC4 regression guard)

**Choice:** `background/tabs/open-tabs.js` `buildOpenTabs()` is **not modified**. Under Option B (D-1), drifted tabs remain in `claimsMirror`, and the existing filter `Object.values(getClaimsMirror()).includes(tabEntry.tabId)` already excludes them. AC4 is a regression guard verified by an automated test (T6) and a UAT case (UAT-1).

**Rationale:** the cleanest fix is the absence of a fix. The B-055 contract was correct; only the upstream `reevaluateTab` was wrong.

### D-9 (NEW R2) — Context menu insertion point and visibility gating (resolves R2 ambiguity)

**Choice:** the "Snap to this tab" menu entry is inserted in `openContextMenu` (sidepanel.js line 5825-5988) **after the Edit button (line 5878) and before the Move-to-group label (line 5884)**. The block is wrapped in a conditional: `if (_cachedDriftRecords[itemId])`. When the conditional is false, neither the button nor any separator is added — the menu collapses naturally to its non-drifted shape. When true, the entry has:

- `<button class="context-menu-item" role="menuitem" tabindex="-1">Snap to this tab</button>`
- Click handler reads `_cachedDriftRecords[itemId]?.driftedToUrl` synchronously at click time (NOT at menu-open time), captures `_itemById.get(itemId)?.url` as `originalUrl`, calls `closeContextMenu()`, shows `showToast('Bookmark snapped to current tab', { undoLabel: 'Undo', onUndo: () => sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { url: originalUrl } }).catch(() => showToast('Couldn\u2019t undo \u2014 try again')) })` optimistically (before SW round-trip), then dispatches `sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { url: driftedToUrl } })` fire-and-forget with `.catch` replacing the toast on failure.
- Re-read at click time guards against the `scope: items` broadcast that may race the right-click → click sequence (B-026 H-1 / H-2 pattern, line 5821 comment block).

**Rationale:** placement after Edit groups the "modify the saved item" actions visually (Edit · Snap to this tab → Move to group → Close tab → Delete). The H-1 re-read pattern is the established defense against menu-stale-snapshot races; it's the same pattern the existing Close tab and Delete entries already use.

### D-10 (NEW R2) — Undo dispatch shape and state lifecycle

**Choice:** the Undo lambda captures `originalUrl` by closure from the click handler. Lifecycle:

1. **t=0**: user clicks "Snap to this tab". Handler reads `originalUrl = _itemById.get(itemId)?.url` (synchronous from in-memory cache). Dispatches `MSG_UPDATE_ITEM { id, patch: { url: driftedToUrl } }` (fire-and-forget; failure handled by a `.catch(() => showToast('Couldn\u2019t update bookmark \u2014 try again'))`).
2. **t=0 + epsilon**: SW handler runs `getItem` → `updateItem` → conditional `clearDrift`. Broadcasts `SCOPE.ITEMS`. Sidepanel `refetchAndPatchLiveState` fires, refreshes `_cachedItems` + `_cachedDriftRecords`, removes drift indicator from the row.
3. **t=0**: handler calls `closeContextMenu()` then shows `showToast('Bookmark snapped to current tab', { undoLabel: 'Undo', onUndo: ... })` optimistically (before SW round-trip completes). Toast paints with Undo button visible.
4. **t=6s** (default): toast auto-dismisses. The Undo lambda is GC-eligible.
5. **Alternative t<6s — user clicks Undo**: lambda fires, dispatches `MSG_UPDATE_ITEM { id, patch: { url: originalUrl } }`. SW handler runs `getItem` (returns post-snap item, `url === driftedToUrl`) → `updateItem` (sets `url` back to `originalUrl`) → conditional `clearDrift` (because `originalUrl !== driftedToUrl`, the condition is met — but `clearDrift` is a no-op when no record exists, AC2/AC4 of §10.7). Toast hides immediately on Undo click. The live tab is still at `driftedToUrl`, so on the next `tabs.onUpdated` URL event for that tab (or on first cold-start reconcile), `detectDriftForTab` writes a fresh drift record. **Drift indicator reappears naturally — no special handling.**
6. **Edge case — Undo clicked after the tab has closed**: `MSG_UPDATE_ITEM` succeeds (storage-only operation, doesn't touch `chrome.tabs`). `claimsMirror` no longer references the closed tab (cleared by `tabs.onRemoved`). The bookmark URL reverts to `originalUrl`, no live tab to drift from, no drift record written. Graceful — see C-9 case (e).
7. **Edge case — Undo clicked twice (race against auto-dismiss)**: the second click is on a `hidden`/removed Undo button → no event fires. The toast is single-instance; `clearTimeout(_toastTimer)` in `showToast` ensures a re-trigger replaces the previous. The Undo lambda closes over its own `originalUrl`, not a shared mutable.

**Rationale:** stateless reversal via the same `MSG_UPDATE_ITEM` round-trip — symmetric, no new message, no new SW state. Drift re-detection on the next `tab.onUpdated` is the natural "self-healing" path; the alternative (explicitly re-writing the drift record from the Undo handler) would require exporting `writeDrift` (currently module-private to `drift.js`) and would race the reconcile loop. The "self-healing on next tick" approach is consistent with §10.7's invariant that drift records are derived from current tab URL state, never authoritative on their own.

---

## §46.4 Architecture Diagram (text)

### Path A — Drift detection on URL change (post-fix behavior)

```
User navigates the live tab (or middle-click, location bar, JS redirect, etc.)
   │
   ▼
chrome.tabs.onUpdated  fires with { url: "https://other.com/..." }, tab object
   │
   ▼  (synchronous LiveTabIndex patch — in-memory only)
updateTabEntry(tabId, { url, ... })
   │
   ▼  (per-tab debounce 100 ms — collapses rapid URL changes)
reevalTimers.set(tabId, setTimeout(... , 100))
   │
   ▼
await readyPromise; const items = await listItems();
   │
   ▼
reevaluateTab(tabId, newUrl, items)
   │   ─ NEW BEHAVIOR (D-1): URL-mismatch release branch DELETED.
   │     The "try to claim a different item" branch still runs — but
   │     `alreadyClaimed === true` (the original claim survives), so
   │     the branch is a no-op for drifted tabs (D-3).
   │
   ▼  (claimsMirror UNCHANGED — original claim preserved)
detectDriftForTab(tabId, newUrl, items)
   │   ─ getItemIdForTab(tabId) returns the original itemId (claim preserved).
   │   ─ safeNormalizeForMatch(item.url) !== safeNormalizeForMatch(newUrl) → mismatch.
   │   ─ writeDrift(itemId, normalizedNewUrl) writes tj:drift[itemId] =
   │     { itemId, driftedToUrl, detectedAt: Date.now() }
   │
   ▼
broadcast(SCOPE.LIVE_STATE, 'tab/updated', { requireClaimsReady: true })
   │
   ├──► sidepanel: refetchAndPatchLiveState → _cachedDriftRecords[itemId] populated
   │     → _ensureIndicators(row, live, true) creates .item-drifted-icon with
   │       title="Drifted to: <hostname>"
   │
   ├──► newtab: refetch → _driftRecords[itemId] populated → _applyRowLiveState
   │     → _buildIndicators rebuilds strip with .newtab-indicator-drifted dot
   │       carrying title="Drifted to: <hostname>"
   │
   └──► standalone: same path as sidepanel (shared sidepanel.js bundle)
```

### Path B — "Snap to this tab" reconcile action

```
User right-clicks a drifted item row (or hits keyboard menu key)
   │
   ▼
document 'contextmenu' handler → openContextMenu(row, x, y)
   │   ─ _cachedDriftRecords[itemId] is defined → "Snap to this tab"
   │     entry is rendered between Edit and Move-to-group (D-9).
   │
   ▼
User clicks "Snap to this tab"
   │
   ▼  (synchronous — captures originalUrl from cache before any await)
const originalUrl = _itemById.get(itemId)?.url;
const driftedToUrl = _cachedDriftRecords[itemId]?.driftedToUrl;
closeContextMenu();
showToast('Bookmark snapped to current tab', {
  undoLabel: 'Undo',
  onUndo: () => sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { url: originalUrl } })
    .catch(() => showToast('Couldn\u2019t undo \u2014 try again')),
});
sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { url: driftedToUrl } })
   .then((resp) => { if (!resp || resp.ok === false) showToast('Could not snap bookmark. Try again.'); })
   .catch(() => showToast('Could not snap bookmark. Try again.'));
   │
   ▼  (SW round-trip — D-2 inline drift-clear)
storage-handlers.js MSG_UPDATE_ITEM case:
  preItem = await getItem(p.id);
  result = await updateItem(p.id, p.patch);   // overwrites item.url
  if (p.patch.url !== undefined && preItem && p.patch.url !== preItem.url) {
    await clearDrift(p.id);                    // removes tj:drift[itemId]
  }
  return result;
   │
   ▼
broadcast(SCOPE.ITEMS, MSG_UPDATE_ITEM)
   │
   ├──► sidepanel: refetch → _cachedDriftRecords no longer has itemId
   │     → drift indicator removed from row → row aria-label updated
   │
   ├──► newtab: same — _driftRecords drops the entry, indicator strip
   │     rebuilds without the drifted dot
   │
   └──► claimsMirror is UNCHANGED. The claim still binds the bookmark
        to the (now-correctly-URL'd) live tab. AC4 preserved: tab does
        not appear in Open Tabs.
```

### Path C — Undo within the 6 s toast window

```
User clicks the "Undo" button in the active toast within 6 s of the snap
   │
   ▼  (closure-captured originalUrl)
sendMessage(MSG_UPDATE_ITEM, { id: itemId, patch: { url: originalUrl } })
   .catch(() => showToast('Couldn\u2019t undo \u2014 try again'));
toastEl.hidden = true;
   │
   ▼  (SW round-trip — same handler as Path B, symmetric)
preItem = post-snap item (item.url === driftedToUrl)
updateItem reverts item.url → originalUrl
condition (originalUrl !== driftedToUrl) holds → clearDrift(p.id)
   ─ no-op (no drift record exists; was cleared at Path B)
   │
   ▼
broadcast(SCOPE.ITEMS, MSG_UPDATE_ITEM) → all surfaces re-render
   │   ─ Item row shows the original saved URL
   │   ─ Drift indicator absent — drift will be re-detected on the
   │     next tabs.onUpdated event for the live tab if it is still
   │     at driftedToUrl, OR on the next reconcileClaims cold-start.
```

---

## §46.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| C-1 | Storage schema versioned | **N/A** | Zero schema changes. No new partition, no field addition, no migration. `tj:items` shape unchanged; `tj:drift` shape unchanged; `tj:tabClaims` shape unchanged. **Stale-SW guidance (S31 B-094 extension):** N/A — no new pref keys, no new manifest entries; the existing `MSG_UPDATE_ITEM` and `clearDrift` paths are already cold-start safe. |
| C-2 | Message contracts typed | **PASS** | Reuses existing `MSG_UPDATE_ITEM` with the same `{ id: string, patch: Partial<Item> }` shape — no contract change. The `patch.url` field is already validated by `updateItem` → `validatePatch` → URL allowlist + length cap. The Undo path reuses the same message. **Zero new message types added or modified.** |
| C-3 | Service worker cold-start safe | **PASS** | Drift detection is event-driven on `tabs.onUpdated` (`tab-events.js:47`) with `readyPromise` gating. `reevaluateTab` and `detectDriftForTab` both await `readyPromise` before reading items. On cold start, `reconcileClaims` (called from `bootstrap.js`) re-derives `claimsMirror` from `LiveTabIndex` + `tj:items` + the persisted `tj:tabClaims` — drifted items reconcile correctly because the URL-match check at `reconcileClaims` line 93 will fail (claim discarded) and `detectDriftForTab` re-runs on the next tab event. Drift records survive in `tj:drift` across SW restarts; stale records (item deleted while drift exists) are filtered out at read time per §10.7 invariant. |
| C-4 | ID stability | **PASS** | `itemId` is a stable ULID (§3) preserved across drift, snap, and undo. `tabId` is stable per browser session (Chrome tab ID contract) and is never persisted in `tj:drift` (only `itemId` is the partition key per §10.7 invariant). Cross-window moves do not change `tabId`. The "Snap to this tab" flow operates on `itemId` end-to-end; tab identity is incidental. |
| C-5 | Manifest file references resolvable | **N/A** | Zero manifest changes. No new `default_path`, `default_popup`, or `chrome_url_overrides` entries. `web_accessible_resources` unchanged. |
| C-6 | Permission minimization | **PASS** | Zero new permissions. `manifest.json` `permissions` array unchanged: `["tabs", "tabGroups", "storage", "sidePanel", "search"]`. All operations use already-granted APIs (`chrome.runtime.sendMessage` for IPC; `chrome.storage.session` for `tj:tabClaims`; `chrome.storage.local` for `tj:items` + `tj:drift`). [security-reviewer] confirms in R4. |
| C-7 | Allow-list direction | **N/A** | No new sanitizer, validator, or export surface. The reused `validatePatch` in `items.js` is already an allow-list (rejects unknown fields, validates URL via `normalizeUrl` allowlist `http`/`https`/`file`). The `driftedToUrl` value passed in `patch.url` is already pre-validated by `drift.js` write path (scheme allowlist + length cap, §10.7 steps 4-5). |
| C-8 | SW-context feasibility | **PASS** | All operations use existing chrome APIs already in use: `chrome.runtime.onMessage`, `chrome.storage.session.set/get`, `chrome.storage.local` (via `writeTransaction`). No `DOMParser`, no `document`, no `IntersectionObserver`, no SW-context-restricted APIs. The "Snap to this tab" UI runs in the sidepanel document context where `URL`, `addEventListener`, etc. are all available. |
| C-9 | Empty-state design | **PASS — 5 paths enumerated** | (a) Item with no drift record (existing behavior): no drift indicator, no "Snap to this tab" menu entry — both branches gated on `_cachedDriftRecords[itemId]`. (b) Item with drift record but tab subsequently closed: `tabs.onRemoved` calls `releaseClaimByTab` then `clearDrift(releasedItemId)` (already wired at `tab-events.js:202-203` per §10.7 B-015 hardening); the drift record is removed; the next surface re-render via `SCOPE.LIVE_STATE` removes the indicator. (c) Item updated to drifted URL while drift detection is mid-write (race): `writeTransaction` is single-key atomic per §4 — the drift partition write completes or doesn't; the `MSG_UPDATE_ITEM` SW handler reads the post-update item via `getItem` BEFORE calling `clearDrift`, so an interleaved drift write either (i) completes first and is then cleared, or (ii) runs after the clear and re-establishes drift if the URL still mismatches. Both are correct end-states. (d) Undo clicked after the 6 s window expires: the toast is gone (`toastEl.hidden = true`), the Undo button is no longer in the DOM, no event fires — graceful no-op. (e) Toast Undo dispatched but the live tab has already closed: `MSG_UPDATE_ITEM` succeeds (storage-only); `claimsMirror` no longer references the closed tab; `clearDrift` is a no-op (no drift record exists for the item once tab closed); the bookmark URL reverts to `originalUrl`; no live tab → no drift re-detection — graceful. |
| C-10 | Off-screen rect feasibility | **N/A** | No drag, no `setDragImage`, no `canvas.toDataURL`, no off-screen DOM positioning. The toast and context menu are always rendered with real layout via the existing CSS (no `-9999px` positioning). |
| C-11 | Popup-lifecycle message ordering | **N/A** | The "Snap to this tab" flow runs in the sidepanel document, NOT in `popup/popup.html` or `popup/group-jump-popup.html`. No `chrome.tabs.update({active:true})`, no `chrome.windows.update({focused:true})`, no `chrome.sidePanel.open` is invoked from this flow. Sidepanel context survives the dispatch + toast lifecycle without focus-shift teardown. The popup/group-jump-popup surfaces do NOT render item rows (they render group rows only) and therefore do NOT host any drift indicator or "Snap to this tab" affordance — confirmed in R1 SPRINT.md handoff notes. |
| C-12 | Manifest mutability | **N/A** | Zero `manifest.json` edits. No `version` bump in this R2 (release-manager bumps to v1.27.0 at sprint close per the sprint plan). |

---

## §46.6 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| `MSG_UPDATE_ITEM` round-trip with drift-clear | < 50 ms added overhead vs. baseline | R5 unit test times `getItem` + `updateItem` + `clearDrift` end-to-end; baseline measured without the new conditional | `getItem` is a single partition read (cached in SW memory after first access). `clearDrift` is a single `writeTransaction` op against `tj:drift` (typically < 5 entries). Both are cheap; combined overhead is well within budget. |
| Toast + Undo button paint | < 100 ms from click to visible | UAT visual check; chrome devtools performance trace | Toast is a single DOM mutation (`hidden = false`, `textContent` set, button `hidden = false`). No layout reflow beyond the toast container itself (already in DOM, fixed-position per existing CSS). |
| Drift indicator re-render on `SCOPE.LIVE_STATE` | < 50 ms P95 on 500-item collection | Existing B-052 perf budget per §34 / §9 | `_ensureIndicators` operates on a single row (the one whose drift state changed); no full-list re-render. The new `title` attribute is one `setAttribute` call — negligible. |
| Context menu open with new entry | < 50 ms (no regression) | Manual UAT spot-check | One additional `appendChild` for the "Snap to this tab" button when drifted; no DOM measurement, no async work in the menu-build path. The H-2 fast-path of reading `_cachedGroups` is preserved. |

No path adds a full collection re-read, a synchronous storage round-trip in the render path, or an unbounded loop. AC11 T1-T8 + UAT cases double as performance regression guards — they fail loudly if the drift round-trip exceeds reasonable bounds.

---

## §46.7 Accessibility Plan

| Surface | Treatment | Rationale |
|---------|-----------|-----------|
| "Snap to this tab" context menu entry | `<button class="context-menu-item" role="menuitem" tabindex="-1">Snap to this tab</button>` — visible focus ring via existing `.context-menu-item:focus-visible` rule; reachable via Tab/ArrowDown from the menu open (existing `contextMenuEl.addEventListener('keydown')` at line 6019-6046 handles Arrow + Enter + Escape). | B-026 / B-024 menu-keyboard contract preserved. The new entry slots in between Edit and Move-to-group seamlessly — no special handling needed. |
| Toast with Undo | Toast container retains `role="alert"` + `aria-live="assertive"` (existing). The new `<button id="toast-undo" class="toast-undo" type="button">Undo</button>` is keyboard-reachable via Tab from page focus (toast is a fixed-position element late in DOM). After dispatch, focus stays on the trigger row (or the body if the context menu collapsed first); Tab traversal reaches Undo before the dismiss `&times;`. | `aria-live="assertive"` is correct for an action confirmation that the user MUST be able to reverse within 6 s. The Undo button is the second action on the toast (ordering: message → Undo → dismiss). Existing dismiss button shape is preserved. |
| Drift indicator (sidepanel + newtab) | Existing `aria-label="Tab has navigated away from its saved URL"` is preserved on `_createDriftedIcon` (sidepanel) and `.newtab-indicator-drifted` (newtab) — these are the screen-reader-visible labels. The new `title="Drifted to: <hostname>"` is an additive **visual** tooltip (browser-native hover). Screen readers MAY also read the `title` after the `aria-label`; both convey the same fact (drifted) plus (optionally) where to. The sidepanel icon retains `aria-hidden="true"` because the row's `aria-label` (line 2382) is the AT carrier (B-048 AC7 pattern). On newtab, the dot's own `aria-label` is preserved. | The hostname-only tooltip is concise enough not to overwhelm the AT pass. The row-level aria carries state per the B-048 visual-state matrix; the `title` is additive for sighted users. |
| Color contrast | `--drifted-color` value-set is unchanged across all 14 themes; existing values were vetted for WCAG AA against each theme's body background at the original 14 px size. The bump to 16 px increases the rendered pixel area without changing color contrast — strictly improves visibility. | No new color audit needed. R4 [qa-reviewer] spot-checks one light + one dark theme. |
| Keyboard-first reachability | Right-click → keyboard menu (Arrow + Enter) → "Snap to this tab" → Enter dispatches; toast appears; Tab reaches Undo; Enter undoes. Full path is keyboard-reachable end-to-end. | Matches the desktop-first / keyboard-first standard in CLAUDE.md. |

---

## §46.8 Rollback Plan

**Single-commit revert restores pre-S33 behavior.** No storage schema migration, no message contract change, no manifest permission change — all rollback risk is mechanical.

```bash
# Identify the merge SHA on release/v2:
git log --oneline release/v2 | grep "B-099"

# Single-commit revert:
git revert <merge-sha>
git push origin release/v2

# Sidepanel surfaces refresh on next reload — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:items` partition | No-op. Items snapped before the rollback retain their post-snap `url`; items not touched are unchanged. Users may want to manually revert specific items via the edit dialog — that's a UX choice, not a data integrity issue. |
| `tj:drift` partition | Drifted items pre-rollback may have stale records that don't match a still-claimed tab. The post-rollback `reevaluateTab` (with the buggy URL-mismatch release branch restored) will release the claim on the next tab URL change — `clearDrift` will fire via the existing `tabs.onRemoved`/`MSG_DEMOTE_ITEM` paths over the next user session. Self-cleaning within minutes of typical use. **No proactive cleanup required.** |
| `tj:tabClaims` (session) | Cleared on browser restart. Pre-rollback claims that survived a URL change (because of D-1) are released by the post-rollback buggy branch on the next URL event for that tab. Same self-cleaning timeline. |
| Manifest permissions | Unchanged — no rollback action. |
| User-facing breakage | Sidepanel users who were trained on "Snap to this tab" lose the affordance. The drift indicator reverts to "occasionally appears, then disappears as the claim is released" — the original confusing behavior. **No data loss; only UX regression.** |

**SEV severity if rollback needed:** SEV3 (minor degradation) — drift behavior reverts to the latent S1 bug; the user's saved bookmarks are unchanged. The rollback would only be triggered by an unforeseen R5/UAT regression in some downstream surface; default response is to fix forward.

---

## §46.9 Open Questions

**None.** R1 locked all 9 product/UX questions (Q1-Q5, P1-P4). R2 D-7 corrected the R1 token name (`--color-warning` → `--drifted-color`) — see §46.3 D-7 rationale. R2 D-9 and D-10 nailed the two architectural ambiguities R1 left for the architect (context menu insertion point + Undo state lifecycle). R3 has zero outstanding decisions to make.

---

## §46.10 As Built (R6)

**Closed:** 2026-04-25 · **Release:** v1.27.0 · **Branch:** `feature/sprint-33-drift-fix`

### Files actually changed vs. expected

All files match R2 expectations — no new files added, no expected files skipped.

| File | Expected (R2) | Actual (R6) | Notes |
|------|---------------|-------------|-------|
| `background/tabs/tab-claims.js` | URL-mismatch release branch removed (~lines 167-176) | ✅ done | `reevaluateTab` now matches D-1: only the auto-claim-for-different-item branch remains; preserved exactly per R2 design. JSDoc updated to document the four-trigger release surface (lines 152-167 of post-R3 file). |
| `background/messages/storage-handlers.js` | `MSG_UPDATE_ITEM` extended with `getItem` → `updateItem` → conditional `clearDrift` | ✅ done | Implementation matches D-2 inline strategy exactly. The `Object.prototype.hasOwnProperty.call(p.patch, 'url')` guard correctly distinguishes "url omitted from patch" from "url set to falsy". |
| `sidepanel/sidepanel.js` | `_createDriftedIcon(driftedToUrl)`, `openContextMenu` "Snap to this tab" entry, `showToast` undo affordance, `_ensureIndicators` tooltip refresh | ✅ done | All four surface deltas landed. `_ensureIndicators` true→true tooltip refresh added per R4 M-1 fix. Optimistic-toast pattern adopted per R4 M-2 fix (toast painted before SW round-trip). Toast copy "Bookmark snapped to current tab" matches updated R5 spec per R4 M-3 fix. Silent no-op on missing `originalUrl` replaced with error toast per R4 M-4 fix. |
| `sidepanel/sidepanel.html` | `#toast-undo` button slot inserted between message and dismiss | ✅ done | Markup matches D-9 spec; `aria-live="assertive"` and `role="alert"` preserved on toast container. |
| `sidepanel/sidepanel.css` | `.toast-undo` styling mirroring `.toast-dismiss`; sidepanel drift icon 16 px | ✅ done | CSS bump driven by inline SVG `width`/`height` attribute change in `_createDriftedIcon` (no separate CSS rule needed); existing `.item-drifted-icon { color: var(--drifted-color) }` already in place from B-048. |
| `newtab/newtab.js` | `_buildIndicators` drift dot tooltip via `dot.title = "Drifted to: <hostname>"` | ✅ done | 12 px dot size unchanged per Q4; tooltip added with `try/catch` URL parsing fallback. |
| `newtab/newtab.css` | No structural change | ✅ no change | `--drifted-color` already wired from B-048 / B-037. |
| `background/tabs/drift.js` | No structural change; `clearDrift` re-export | ✅ no change | `clearDrift` already exported and callable from SW handler. |
| `background/tabs/tab-events.js` | No expected change | **Δ vs. R2** | Confirmed wired per §10.7 B-015 hardening: `tabs.onRemoved` calls `releaseClaimByTab` then `clearDrift(releasedItemId)` (line 202-203). No edit needed; documented in §46.5 C-9(b). |
| `tests/b099-drift-fix.test.js` | NEW, ≥ 8 tests (T1-T8) | ✅ done — 11 tests | T1-T9 from R3/R4; T10-T11 added in R5 for third-URL change and no-op same-URL paths. **Final count: 11 tests** (exceeds AC11 minimum of 8 by 38%). |
| `tests/tab-url-change.test.js` | Pre-existing test contract update | **Δ vs. R2** | Two pre-existing tests asserted the BUGGY behavior; re-pinned to assert Option B (claim preserved on URL change). Caught at R5 by [test-engineer]. |
| `tests/tab-events-no-storage-write.test.js` | Pre-existing test contract update | **Δ vs. R2** | Re-scoped to use an unclaimed tab so the assertion remains meaningful under D-1. |
| `docs/UAT_B-099.md` | NEW, ≥ 8 UAT cases | ✅ done — 14 UAT cases | UAT-1..UAT-14, priority-tagged B/H/M. **Final count: 14 cases** (exceeds AC12 minimum of 8 by 75%). |
| `docs/design/46-b-099-drift-fix.md` | NEW R6 chapter | ✅ this file |

### Test counts (final)

- **Pre-S33 baseline:** 1,401 tests passing on `release/v2`.
- **Post-S33 build:** **1,412 tests passing** on `feature/sprint-33-drift-fix` (+11 net = T1-T11 in `tests/b099-drift-fix.test.js`; the two re-pinned pre-existing test files added zero net tests but their assertions inverted from "asserts buggy behavior" to "asserts Option B contract").
- **Zero regressions** in pre-existing suite after `tab-url-change.test.js` and `tab-events-no-storage-write.test.js` re-pin.

### UAT results summary

| Case | Priority | Result | Notes |
|------|----------|--------|-------|
| UAT-1: Drift detected, claim preserved | B | **PASS** | Drift indicator + claim both visible; tab does not orphan to Open Tabs. |
| UAT-2: Drift clears on navigate-back | B | **PASS** | |
| UAT-3: Indicators additive (live + audible + drifted) | H | **PASS** | DOM order verified: window badge → audible → drift. |
| UAT-4: Drifted-but-claimed tab not in Open Tabs | B | **PASS** | Regression guard for D-8. |
| UAT-5: Context menu entry visible only when drifted | B | **PASS** | DOM-absent (not disabled) when no drift record. |
| UAT-6: Snap to this tab updates URL | B | **PASS** | Toast copy "Bookmark snapped to current tab" + Undo button rendered correctly. |
| UAT-7: Undo reverts within toast window | B | **PASS** | Drift re-detected naturally on next `tab.onUpdated` per D-10. |
| UAT-8: Toast auto-dismisses after ~6 s | H | **PASS** | |
| UAT-9: Drift indicator size, color, tooltip (sidepanel) | H | **PASS** | Initial fail traced to stale SW; PASS after extension toggle OFF/ON per C-1 stale-SW guidance — confirmed reload behavior matches B-094 precedent. |
| UAT-10: Newtab dense row drift dot tooltip | M | **PASS** | Tooltip "Drifted to: example.org" rendered after reload. |
| UAT-11: Second matching item does NOT auto-claim drifted tab | H | **PASS** | D-3 contract holds. |
| UAT-12: Drift survives moving tab to another window | M | **PASS** | Cross-window badge updates; drift indicator persists. |
| UAT-13: "Close tab & unsave" on drifted bookmark | H | **PASS** | Demote-when-live path correctly clears drift via `MSG_DEMOTE_ITEM`. |
| UAT-14: Closing live tab auto-clears drift | H | **PASS** | Initially flagged as fail (bookmark "disappearing") — investigation confirmed window-filter view caused apparent disappearance, NOT a regression. `releaseClaimByTab` + `clearDrift` wiring at `tab-events.js:202-203` correct. Item was always present; window filter was hiding non-live entries. **Filed B-101 (subtle drift indicator) and B-102 (cross-window demote bug) as follow-up backlog items from this UAT cycle.** |

**Final UAT score: 14/14 PASS** (4 of those 14 went through one fix-cycle iteration before reaching PASS — UAT-9, UAT-10, UAT-13, UAT-14).

### Hardening discovered during R4/R5

R4 review (3 reviewers parallel) surfaced 4 MEDIUM + 2 LOW findings, all applied before R5:

- **M-1**: `_ensureIndicators` true→true drift change branch did not refresh tooltip when `driftedToUrl` changed mid-session — fixed by re-applying `_createDriftedIcon(_cachedDriftRecords[itemId]?.driftedToUrl)` even when the icon already exists.
- **M-2**: Toast was shown after `closeContextMenu` — race risk with menu teardown. Fixed by switching to optimistic-toast pattern (toast painted before SW round-trip resolves; `.catch` replaces toast with error message on failure).
- **M-3**: Toast copy mismatch — R3 implemented "Bookmark snapped to current tab" while R1/R2 spec said "Bookmark URL updated". UAT-6 spec + R6 chapter updated to match impl (decision: shorter copy is more user-friendly).
- **M-4**: Silent no-op when `originalUrl` absent — added user-facing error toast: "Couldn't snap — try again."
- **L-1, L-2**: minor JSDoc cleanups — applied inline.

R5 [test-engineer] gap-fills:

- **T10**: third-URL change before snap (drift record `driftedToUrl` updated mid-session, then snap captures the latest value).
- **T11**: no-op when patch.url === preItem.url (avoids spurious `clearDrift` round-trips on unrelated edits).

### Deviations from R2 plan

1. **R2 D-7 token correction** (R1 → R2): R1 spec said `--color-warning` — R2 corrected to `--drifted-color` (the existing token, defined for all 14 themes). Functionally identical; R3 used the corrected token.
2. **Toast copy**: R1/R2 said "Bookmark URL updated"; R3 implemented "Bookmark snapped to current tab"; R4 M-3 ratified the impl text. R6 chapter and UAT spec both reflect the final copy.
3. **Test count**: R2 expected ≥ 8 tests; landed 11 (+38% over minimum). UAT cases: R2 expected ≥ 8; landed 14 (+75%).
4. **No-op edits to `newtab/newtab.css`, `background/tabs/drift.js`, `background/tabs/floating-groups.js`** — confirmed in R6 that these files match the existing post-B-048 / post-B-037 state and need no B-099 changes.
5. **Two pre-existing tests re-pinned** (`tab-url-change.test.js`, `tab-events-no-storage-write.test.js`): not anticipated in R2; surfaced at R5. They had codified the buggy pre-S33 behavior. Updated to assert Option B contract. **Lesson for future bug-fix sprints:** R2 should explicitly enumerate pre-existing tests that codify the bug and pre-flag them for re-pin in R3/R5.

### Follow-up backlog items filed from B-099 UAT

- **B-100** — Delete-on-live UX: when an item is live (claimed), the right-click "Delete" should default to "Close tab" (preserve bookmark) with an explicit "Delete bookmark" secondary action. Surfaced from UAT-2 user feedback (P3/M).
- **B-101** — Subtle drift indicator: current 16 px icon + warning color is too prominent; consider a softer treatment (smaller dot? muted color? subtitle-only on hover?). Surfaced from UAT-9 user feedback (P3/S).
- **B-102** — Cross-window demote bug: closing the live tab in one window via the tab strip while the sidepanel is open in another window may leave a stale claim entry. Surfaced from UAT-14 investigation; needs reproduction case (P2/M).
- **B-103** — Promote duplicate bug: promoting a tab whose URL exactly matches an existing saved bookmark should re-claim the existing bookmark, not create a duplicate. Surfaced from UAT-11 mental-model walkthrough (P2/S).

### Rollback (if needed)

Single-commit revert of the S33 merge to `release/v2` restores pre-S33 behavior. No storage migration, no manifest permission change, no message contract change. **SEV3 — minor degradation.** See §46.8 for full rollback procedure.

---
