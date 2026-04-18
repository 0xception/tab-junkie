# Sprint 9 — R4 Findings (Deduplicated)

## CRITICAL (must fix before R5)
_None_

## HIGH (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 | `background/tabs/tab-events.js:122–127` | **B-015 single-tab drift race**: `clearDrift(releasedItemId)` is called but its Promise is not awaited before `broadcast()` fires. Broadcast reaches sidepanel before drift record cleared from storage — `refetchAndPatchLiveState` reads stale drift state. Bulk `windows.onRemoved` path correctly awaits. | Make `.then` callback `async`; add `await` before `clearDrift`. |
| H-2 | `sidepanel/sidepanel.js` (catch block in `refetchAndPatchLiveState`) | **B-011 catch-path cleanup race**: removes `.item-drifted-icon` and `.item-audible-icon` individually then checks `indicators.children.length`. If concurrent DOM mutation altered children between removes and check, container might not be cleaned. | Use `indicators?.replaceChildren()` to clear all children atomically, then `indicators?.remove()` unconditionally. |
| H-3 | `sidepanel/sidepanel.js:897` | **B-011 aria-label "URL drifted" is cryptic jargon** — WCAG 4.1.2 Name/Role/Value: screen reader users get no context. Compare audible's self-explanatory "Playing audio". | Change to `"Tab has navigated away from its saved URL"` |

## MEDIUM (fix if time permits)

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js` (`_ensureIndicators`) | No `row.isConnected` guard — future call sites that skip the containment check could silently mutate detached nodes. | Add `if (!row.isConnected) return;` as first line of `_ensureIndicators`. |
| M-2 | `sidepanel/sidepanel.css:25` | `--drifted-color: #d97706` (amber-600) in light mode has ~3.0:1 contrast on white — borderline below WCAG AA 3:1 for non-text. | Shift to `#b45309` (amber-700, ~4.5:1). |
| M-3 | `sidepanel/sidepanel.js` (`_ensureIndicators`, `buildItemRow`) | SVG markup and indicator container creation duplicated between `buildItemRow` and `_ensureIndicators`. | Extract `_getOrCreateIndicators(row)`, `_createAudibleIcon()`, `_createDriftedIcon()` helpers. |
| M-4 | `sidepanel/sidepanel.js:872-873, 898-899` | `innerHTML` used for hardcoded SVG icons — not exploitable today but maintenance hazard (future interpolation risk). | Add `/* SECURITY: static SVG — do not interpolate user data */` comment, or build via `createElementNS`. |
| M-5 | `background/tabs/tab-events.js:183` | `Promise.all` in `windows.onRemoved` — one failing `clearDrift` blocks broadcast and other clears. | Use `Promise.allSettled` so partial failures don't suppress broadcast. |

## LOW (defer to future sprint)

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:862–867` | Fallback `row.appendChild(indicators)` when `.item-actions` absent — silent incorrect DOM order if row ever lacks actions. | Assert/warn if `actions` is null. |
| L-2 | `sidepanel/sidepanel.js:770–772` | `console.warn` logs internal message constant name — violates "no implementation detail in console" rule. | Shorten to `'[tab-junkie] Live state refresh failed — clearing indicators'`. |
| L-3 | `background/tabs/tab-events.js:70–72` | B-012 `tab/audible-changed` broadcast has no payload — sidepanel re-fetches ALL items per audible event. Consistent with favicon pattern, but inefficient at scale. | Future: targeted audible patch by tabId. |

---

# Sprint 10 — R4 Findings (Deduplicated)

## B-053 — Circular dep fix (Fast Track S)

All R4 findings resolved before R5:
- **HIGH-1 (code-reviewer)**: Duplicate `import { ALL_PARTITIONS, partitionKey, defaultShape, assertShape } from './shapes.js'` block (lines 61-66) in `partitions.js` — `export { } from` re-export syntax doesn't bind names locally; `initializePartitions` and `readPartition` were reading `undefined`. **Fixed**: added local `import` at line 38 alongside the `export { } from` re-export block. 296/296 tests pass. ✅

---

## B-013 — Opener-chain group inheritance (Full M) — R4 FINDINGS

### CRITICAL (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| C-1 (qa) | `background/tabs/tab-events.js:121–128` + `background/tabs/floating-groups.js:103` | **Missing `itemId` in floating-group record**: `walkOpenerChain` returns `{ groupId, itemId }` but `appendFloatingGroup` call only stores `groupId`. `reassociateFloatingGroups` then calls `claimTabForItem(record.groupId, matchedTabId)` — passing a groupId where an itemId is required, poisoning `claimsMirror` with a phantom entry. | Store `itemId` in the floating-group record. Pass `result.itemId` at the call site in `tab-events.js`. Extend `appendFloatingGroup` validation guard to require `itemId`. Fix `reassociateFloatingGroups` to call `claimTabForItem(record.itemId, matchedTabId)`. |

### HIGH (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 (code) | `background/tabs/opener-chain.js:54–70` | **No cycle guard in `walkOpenerChain`**: hop budget can be silently consumed by phantom nodes if a cycle exists (however formed), masking valid grouped ancestors. | Add `visited = new Set([tabId])`; before following each hop check `visited.has(currentTabId)` and break; add `visited.add(currentTabId)` each iteration. |
| H-2 (code) | `background/tabs/floating-groups.js:122–136` | **`savedAt` not validated in `appendFloatingGroup` guard**: entry with `savedAt: undefined` passes validation and is written to storage. Future TTL pruning will mis-sort or error on it. | Add `typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)` to guard. Same fix needed in `saveFloatingGroups` filter. |
| H-3 (security) | `background/tabs/opener-chain.js:12` | **`openerMap` unbounded**: no size cap. Tab-bomb scenario writes one entry per opened tab until SW memory is exhausted. | Enforce `MAX_OPENER_MAP_ENTRIES` (e.g. 512) in `recordOpener`; reject new entries when cap reached. |
| H-4 (qa) | `background/tabs/tab-events.js:122–128` | **Stale `tab.url`/`tab.index` in floating-group entry**: captured at `onCreated` time (usually `''`/`about:blank`), used after async gap. URL-fallback path in `reassociateFloatingGroups` will always skip entry. | After async gap, read current URL from `getLiveTabIndex().get(tab.id)?.url` and current index from live entry instead of closure-captured `tab.url`/`tab.index`. |
| H-5 (qa) | `background/tabs/tab-events.js:115–134` | **No live-tab existence guard after async gap**: tab may have been removed before IIFE resumes; `appendFloatingGroup` could write a floating-group for a deleted tab. | Add `if (!getLiveTabIndex().has(tab.id)) return;` immediately after `await readyPromise`. |
| H-6 (qa) | `background/tabs/tab-events.js:129` | **`broadcast` with `requireClaimsReady: true` may silently drop**: if `isClaimsReady()` is false when IIFE resumes, broadcast is swallowed; sidepanel stays stale. | Broadcast without `requireClaimsReady` guard, or add a retry/defer path if claims not ready. |

### MEDIUM (fix if time permits)

| # | File | Finding |
|---|------|---------|
| M-1 (security) | `floating-groups.js:103` | `groupId` in floating-group record not validated against live groups before `claimTabForItem` call; dangling groupId if group deleted between write and reassociation. Add existence check in `reassociateFloatingGroups`. |
| M-2 (security) | `tab-events.js:126` | `tab.url` written to storage without scheme validation; disallowed schemes (e.g. `chrome://`, `javascript:`) can enter `tj:floatingGroups`. Add `safeNormalizeForMatch` check in `appendFloatingGroup` guard. |
| M-3 (qa) | `tab-events.js:115` | Concurrent `onCreated` events can produce duplicate floating-group entries for same tab. Deduplicate by `(groupId, windowId, tabIndex)` inside `appendFloatingGroup` mutator. |
| M-4 (code) | `opener-chain.js:58` | O(N) linear scan of `claimsMirror` per hop; O(3N) per `onCreated`. Invert to `Map<tabId, itemId>` before walk for O(1) per hop. |

---

## B-005 — Bulk-create saved items (Full M) — R4 FINDINGS

### CRITICAL (must fix before R5)
_None_

### HIGH (must fix before R5)

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 (code+security) | `background/storage/items.js:273–297` | **`writeTransaction` throws not caught**: if tx fails (`ERR_QUOTA_EXCEEDED`/`ERR_TX_CONFLICT`), `created` is empty and `skipped` context is lost. Caller can't distinguish "all inputs bad" from "write failed". | Wrap `writeTransaction` in try/catch inside `bulkCreateItems`; on storage error return `{ created: [], skipped: [...phase1Skipped, ...candidates as skipped], storageError: {code, message} }`. |
| H-2 (code+security) | `background/storage/items.js:232–237` | **No upper-bound on `inputs` array**: no cap allows near-quota-exhaustion in a single call; blocking pre-validation loop on huge arrays. | Add `MAX_BULK_INPUTS` constant (export from `shapes.js`); throw `ERR_VALIDATION` when `inputs.length > MAX_BULK_INPUTS`. |
| H-3 (code) | `background/storage/items.js:285–289` | **Side-effect mutation inside mutator**: `created.push(item)` and `groupSkipped.push(...)` run inside the `writeTransaction` mutator. If tx later fails (e.g. `assertShape` throws), `created` contains phantom items never persisted. | Collect passing candidates into a local variable inside the mutator (return value); populate `created`/`groupSkipped` only after `await writeTransaction(...)` resolves successfully. |
| H-4 (qa) | `background/storage/items.js:232–234` + `storage-handlers.js:124` | **Non-array `inputs` throws instead of partial-success envelope**: caller receives `{ok: false}` instead of `{created: [], skipped: []}`. Breaks B-005 partial-success contract. | Coerce non-array inputs to `[]` at dispatch level, or return `{ created: [], skipped: [] }` from `bulkCreateItems` for non-array (not throw). |

### MEDIUM (fix if time permits)

| # | File | Finding |
|---|------|---------|
| M-1 (security) | `items.js:259–261` | `skipped` entries echo back raw unfiltered input objects; downstream UI `innerHTML` interpolation would be XSS. Project to bounded safe subset `{ title: ..slice(0,MAX_TITLE), url: ..slice(0,MAX_URL) }` before returning. |
| M-2 (qa) | `items.js:281–292` | No URL deduplication — same URL appears twice → two items created, no feedback. Deduplicate by normalized URL within batch; excess copies go to `skipped` with reason `'duplicate URL'`. |
| M-3 (qa) | `storage-handlers.js:403–406` | Broadcast fires even when `created.length === 0`; causes unnecessary sidepanel re-render for fully-failed imports. Guard broadcast with `if (data.created?.length > 0)`. |
| M-4 (code) | `items.js:248–257` | Item construction literals duplicated from `createItem`. Extract private `buildItemPayload(input, normalizedUrl, now)` factory. |

---

# Sprint 12 — R4 Findings (Deduplicated)

> Items under review: B-024 (Full M, 3 reviewers) · B-026 (Fast Track S, 2 reviewers) · B-049 (Fast Track S, 2 reviewers).
> Note: all three items shipped in a single parallel build per SPRINT.md. The "scope bleed" findings (code-reviewer B-026 M-6, code-reviewer B-049 H-1) are a consequence of the sprint's explicit parallel-build strategy — not scope creep. Each item's code is clearly tagged with `/* B-024 */` / `/* B-026 */` / `/* B-049 */` markers. No action required beyond keeping the markers intact for attribution.

## B-024 — Multi-select + bulk action bar

### CRITICAL (must fix before R5)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| C-1 (qa) | `sidepanel/sidepanel.js:551–570` + `refetchAndPatchLiveState` path | `_updateBulkBar` reads stale `_cachedLiveStates`. `refetchAndPatchLiveState` patches DOM but never reassigns `_cachedLiveStates`, so the "Close tabs" disabled state can lag reality — user dispatches `MSG_CLOSE_TABS` for tabs that already closed. | In `refetchAndPatchLiveState`, reassign `_cachedLiveStates = liveStates`, and call `_updateBulkBar()` after every live-state patch. |
| C-2 (qa) | `sidepanel/sidepanel.js:1472–1504` + `sidepanel/sidepanel.html:130` | Bulk Remove confirm dialog: static `<h2>` reads "Delete Bookmark?" regardless of count, and body text says "Delete \"N bookmarks\"? This cannot be undone." — misleading for bulk + inaccurate for live items (which are demoted, not deleted). | Extend `openConfirmDialog` to accept heading + body overrides; pass bulk-appropriate copy ("Remove N items? Live tab(s) remain open."). |

### HIGH (must fix before R5)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 (code) | `sidepanel/sidepanel.js:1468–1470` | `_clearSelection()` does not close the open bulk-move picker. Escape/Clear leaves picker orphaned in DOM with a live capture-phase `onDocClick` listener. | Call `_closeBulkMovePicker()` at top of `_clearSelection()`. |
| H-2 (qa) | `sidepanel/sidepanel.js:1534–1602` | Bulk-move picker has no Escape handler. Escape hits global handler → `_clearSelection()` wipes selection but picker stays open with a stale `ids` snapshot. Also `onDocClick` leaks when picker closes via the `change`-selection path (not outside-click). | Add `keydown`/Escape on the picker `<select>` that calls `_closeBulkMovePicker()` with `stopPropagation`. Always `document.removeEventListener('click', onDocClick, true)` inside `_closeBulkMovePicker()`. |
| H-3 (qa) | `sidepanel/sidepanel.js:592–606` | `_rangeSelect` does not update `_lastSelectedId`, but `_toggleSelection` does. Net result: the range anchor drifts with each toggle. | Introduce `_rangeAnchorId` set only by `_toggleSelection`/`_selectAll`. `_rangeSelect` reads `_rangeAnchorId` and never mutates it. |
| H-4 (qa) | `sidepanel/sidepanel.js:1184–1209` | Shift+Click with no prior selection falls through to navigation instead of starting a selection. | When `e.shiftKey && !_selectionMode`, call `_toggleSelection(itemId)` instead of navigating. |
| H-5 (qa) | `sidepanel/sidepanel.js:1472–1504` | Partial failure in bulk Remove: the `for (id of liveIds) await MSG_DEMOTE_ITEM` loop stops on first rejection; subsequent demotes + `bulkDelete` skipped; selection not pruned of successful IDs. | Replace with `Promise.allSettled` or per-item try/catch; collect fulfilled vs rejected; prune only succeeded IDs from `_selection`; show toast with failure count. |
| H-6 (code) | `sidepanel/sidepanel.js:1200–1213` | `click` fires before `dblclick`: in selection mode the single-click toggles AND the dblclick navigates. Net: unintended selection mutation before navigation. Additionally `dblclick` while Shift is held navigates instead of range-selecting. | In the `click` handler, defer selection toggle by ~200ms and cancel on `dblclick`. In `dblclick`, skip navigation when `e.shiftKey` is held. |
| H-7 (code) | `sidepanel/sidepanel.js:1477` (bulk Remove copy) | The word "Delete" is hardcoded in the confirm body; mixed live+non-live selection actually demotes live items (tabs stay open). Covered by C-2 fix. | — (see C-2) |

### MEDIUM (fix if time permits)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (security) | `background/messages/storage-handlers.js:310–314` | `MSG_CLOSE_TABS` only checks `typeof === 'number'`. Accepts `NaN`, `Infinity`, `0`, floats — caught later by Chrome, but validation contract lies. | Require `Number.isInteger(id) && id > 0`; throw `ERR_VALIDATION` on failure. |
| M-2 (security) | `background/messages/storage-handlers.js:305–342` | `MSG_CLOSE_TABS` has no upper bound on `tabIds.length`. Sibling bulk handlers cap at `MAX_BULK_INPUTS`. | Import `MAX_BULK_INPUTS`; throw `ERR_VALIDATION` when `tabIds.length > MAX_BULK_INPUTS`. |
| M-3 (security) | `background/storage/items.js:397–399` | `bulkUpdateItems` allows `patch.groupId === ''` — passes string check, fails later inside tx with `ERR_NOT_FOUND` instead of `ERR_VALIDATION`. | Reject empty string at validation boundary. |
| M-4 (code) | `sidepanel/sidepanel.js:1554–1566` + `:1655–1683` + `:196` | Group list fetch + sort is duplicated 3×. `_cachedGroups` is already maintained; all three callers can use it. | Extract `_buildGroupOptions(selectEl, preselectedId)` and read from `_cachedGroups`. |
| M-5 (code) | `sidepanel/sidepanel.js:826–854` | Group inline empty-state SVG built via `createElementNS`; rest of file uses `innerHTML` for static SVG. Inconsistent pattern. | Switch to `innerHTML` matching the existing icon factories. |
| M-6 (code) | `sidepanel/sidepanel.js:1584` | Bulk move picker has no top-clamp — overflow possible if picker taller than bar gap. Context menu has clamp (`:1759–1765`). | Mirror context-menu viewport clamping. |
| M-7 (code) | `background/storage/items.js:348–364` | `bulkDeleteItems` mutator iterates items twice (builds `existingIds` then filters). | Collapse into single-pass using `seen` set. |
| M-8 (qa) | `sidepanel/sidepanel.js:551–570` + filter | `_updateBulkBar` count includes hidden-by-filter selections — misleading "N selected" label when filter active. | Count only rows whose DOM is visible, or document behavior intentionally. |
| M-9 (qa) | `sidepanel/sidepanel.js:1568–1578` | Bulk move race: `ids = [..._selection]` snapshot taken before async SW call. Intervening `renderAll` may prune `_selection` but snapshot already dispatched. Server handles via `notFound`; UI ignores it. | Document as intentional (AC #5 "silently pruned") with comment; or surface partial-success count. |
| M-10 (qa) | `sidepanel/sidepanel.js:612–619` | `_selectAll` on empty visible list silently no-ops. AC #2-compatible but edge-case behavior not documented. | UAT flag only — no code change. |

### LOW (defer)

| # | File:line | Finding |
|---|-----------|---------|
| L-1 (code) | `sidepanel/sidepanel.js:80` + `sidepanel/sidepanel.html:85` | `#bulk-clear` missing `aria-label="Clear selection"`. |
| L-2 (code) | `sidepanel/sidepanel.js:646` | `_reapplySelection` re-stamps `data-selected` on hidden rows — cosmetic inconsistency. |
| L-3 (code) | `background/messages/storage-handlers.js:391` | Inline write-type set getting long — extract `WRITE_TYPES` constant at next addition. |
| L-4 (security) | `sidepanel/sidepanel.js:1588–1601` | Duplicate of H-1/H-2 — picker `onDocClick` listener leak. |
| L-5 (security) | `background/storage/items.js:417–421` | `bulkUpdateItems` no-op write to groups partition — minor quota waste. |
| L-6 (security) | `sidepanel/sidepanel.js:612–620` | `_selectAll()` has no client-side cap — server rejects >500 but error is generic. |
| L-7 (qa) | `sidepanel/sidepanel.html:92–98` | `bulk-close` button no `title`/`aria-describedby` clarifying live-tab-only. |
| L-8 (qa) | `sidepanel/sidepanel.js:1200` | Dead-branch comment — `_selectionMode` is false when empty; plain-click branch only fires second-click onward. Add clarifying comment. |
| L-9 (qa) | `sidepanel/sidepanel.css:1032–1044` | Checkbox visual via `::before` pseudo; no ARIA state exposed. Needs solution-architect guidance on correct ARIA pattern. |

## B-026 — Item context menu

### CRITICAL
_None_

### HIGH (must fix before R5)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 (code) | `sidepanel/sidepanel.js:1627` + `:1673` | `isLive` captured from `row.dataset.live` **before** `await sendMessage(MSG_LIST_GROUPS)` — a broadcast during the await can invalidate it. | Derive liveness from `_cachedLiveStates[itemId]?.live` **after** the await; re-read in each action handler. |
| H-2 (code) | `sidepanel/sidepanel.js:1673` + `:1555` + `:197` | Every right-click fires `MSG_LIST_GROUPS` IPC; `_cachedGroups` is already in memory and kept fresh by `MSG_STATE_CHANGED`. | Replace with `[..._cachedGroups]`; remove redundant message call in all three sites. |

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (security) | `sidepanel/sidepanel.js:1401–1428` (broadcast listener) | Open context menu not closed on cross-window `MSG_STATE_CHANGED` → row under menu may be replaced by a different item at the same coords. Action closures capture `itemId` correctly (integrity safe) but UX is spoofable. | Call `closeContextMenu()` inside broadcast branch before `renderAll()`. |
| M-2 (security) | `sidepanel/sidepanel.js:1709–1713` + `background/tabs/tab-claims.js:227` + `storage-handlers.js:317–326` | `MSG_CLOSE_TABS` only checks `tabId` is in `getLiveTabIndex()` — that's every browser tab, not junkie-claimed tabs. Stale `_cachedLiveStates.tabId` after Chrome reassignment could close an unrelated tab. | Server-side: require `tabId` to be present in `getClaimsMirror()` before allowing `chrome.tabs.remove`. |
| M-3 (security) | `sidepanel/sidepanel.js:1620–1624`, `:1730–1742` | No `itemId`/`tabId` freshness check after async work in action handlers. | Guard each action: `if (!_itemById.has(itemId)) { closeContextMenu(); return; }`; for Close tab, re-read from `_cachedLiveStates`. |
| M-4 (code) | `sidepanel/sidepanel.css:983–989` | `#fef2f2` destructive-hover background renders near-white in dark mode. | Introduce `--danger-hover-bg` token with dark override. |
| M-5 (code) | `sidepanel/sidepanel.html:145` | `<div id="context-menu" role="menu">` has no accessible name. | Add `aria-label="Item actions"`. |
| M-6 (code) | `sidepanel/sidepanel.js:1620` + `:1771` | Async `openContextMenu` called without `.catch()` — unhandled rejection if `sendMessage` throws. | Outer: `openContextMenu(...).catch(() => {})`; replace with cached groups per H-2 then async-ness goes away. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 (code) | `sidepanel/sidepanel.js:1700–1702` | Separator `<div>` has no `role="separator"` — invisible to screen readers inside a `role="menu"`. |
| L-2 (code) | `sidepanel/sidepanel.js:1658–1661` | `context-menu-label` span and `<select>` are not valid direct children of `role="menu"`. Wrap in `role="group"`. |
| L-3 (code) | `sidepanel/sidepanel.js` around bulk-remove handler | `bulkDeleteItems` returns `{ notFound }`; caller ignores it — no toast when some items silently missing. |
| L-4 (code) | `sidepanel/sidepanel.js:1749–1758` | Context-menu positioning triggers two layout flushes (write → measure → re-write). |
| L-5 (security) | `sidepanel/sidepanel.js:1767–1772` | `contextmenu` listener at `document` level — scope to `itemListEl` to reduce surface. |
| L-6 (security) | `sidepanel/sidepanel.js:1774–1779` | "Click outside to close" document listener never removed — benign but inconsistent with B-024's pattern. |
| L-7 (security) | `sidepanel/sidepanel.js:1812–1814` | Scroll listener attached unconditionally, never cleaned — benign but inconsistent. |
| L-8 (security) | `sidepanel/sidepanel.js:1747–1759` | Viewport clamping doesn't re-measure after clamping — very tall menus can still overflow. Consider `max-height` + `overflow-y: auto` CSS. |
| L-9 (security) | `background/tabs/tab-claims.js:227` | `tabId` now surfaced on every live-state response — document in SOLUTION_DESIGN.md at R6. |

## B-049 — Empty states & error feedback

### CRITICAL / HIGH
_None_ (the "scope bleed" H-1 is a sprint-design artifact, not a finding — see preface).

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (code) | `sidepanel/sidepanel.css:809–820` vs `:232–243` | `.filter-empty-state-*` and `.empty-state-*` classes duplicate property pairs; only difference is 14px vs 15px font-size. | Consolidate into a single base class + ID-level font-size override, or share via CSS variables. |
| M-2 (code) | `sidepanel/sidepanel.js:1591–1601` | Picker `onDocClick` listener only removed on outside click. Programmatic close leaks it. | Duplicate of B-024 H-1/H-2 fix. |
| M-3 (code) | `sidepanel/sidepanel.js:537` + `:511` | `clearFilter()` sets `filterClearBtnEl.hidden = true` preemptively; `applyFilter()` already owns that invariant. | Remove preemptive set; trust `applyFilter()`. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 (code) | `sidepanel/sidepanel.js:833–846` | Group inline empty-state SVG built via `createElementNS` — inconsistent with the rest of the codebase (duplicate of B-024 M-5). |
| L-2 (code) | `sidepanel/sidepanel.js:522` | Toast duration magic number `4000` — extract `TOAST_DURATION_MS` constant. |
| L-3 (code) | `sidepanel/sidepanel.html:64` | Pre-existing `Add your first bookmark` button lacks `type="button"`. New `filter-empty-clear-btn` has it. |
| L-4 (security) | `sidepanel/sidepanel.html:141` | Toast uses `role="alert"` + `aria-live="assertive"`; `role="status"` + `polite` may be more appropriate for non-urgent recoverable errors. |

---

## Rollup — items to fix before R5

- **2 CRITICAL** (B-024 C-1, C-2)
- **9 HIGH** (B-024 H-1…H-7, B-026 H-1, H-2)

[frontend-engineer] fixes the above, then R5 proceeds.

---

## UAT-Discovered Defects (Round 5 manual UAT)

Both found during interactive UAT with [scrum-master] and fixed in-pipeline before sprint close.

| # | File:line | Finding | Fix applied |
|---|-----------|---------|-------------|
| UAT-D1 | `sidepanel/sidepanel.js:1162–1166` | **Confirm dialog stayed open after clicking Delete.** Pre-existing latent bug (not introduced by R4): document click handler invoked `_pendingConfirmCallback()` but never called `closeDialog()`. Affected single-item delete flow too. | Capture callback locally, call `closeDialog()`, then invoke the callback. |
| UAT-D2 | `sidepanel/sidepanel.js:1169` + `sidepanel/sidepanel.html:85` | **Filter-empty "Clear filter" button also opened the Add Bookmark dialog.** Both CTAs share class `.empty-state-cta`; document handler matched both. | Narrowed selector to `.empty-state-cta:not(#filter-empty-clear-btn)`. |

Both fixes verified against test suite (427/427 passing) and re-tested in UAT.


---

# Sprint 13 — R4 Findings (Deduplicated)

> Items reviewed: B-055 (Full M, 3 reviewers) · B-028 (Fast Track S, 2 reviewers) · B-047 (Fast Track XS, 2 reviewers) · B-051 (Fast Track S, 2 reviewers) = 9 parallel R4 agents.
>
> Cross-item overlap note: B-028's code-reviewer found issues in `_openOpenTabContextMenu` (which is actually B-055 territory). Those findings are merged into the B-055 section below. Two reviewers independently flagged the same safe-mode write-gate issue (security B-055 L-2 and qa B-055 H-1 agree with code B-055 H-1) — consolidated as a single HIGH.

## B-055 — Open Tabs section (Full M)

### CRITICAL
_None_

### HIGH (must fix before R5)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `background/messages/storage-handlers.js:417` | **AC14 violation**: `MSG_CLOSE_TABS` and tabId-only `MSG_NAVIGATE_TO_ITEM` are in the safe-mode `writeTypes` set, but neither performs a storage write. In safe mode, Close tab silently fails and tab-focus navigation silently fails. Confirmed by code-reviewer H-1, security-reviewer L-2, qa-reviewer H-1. | Remove `MSG_CLOSE_TABS` from `writeTypes` unconditionally. For `MSG_NAVIGATE_TO_ITEM`, gate the write-classification on `p.itemId !== undefined` so the tabId-only variant is allowed in safe mode. |
| H-2 | `sidepanel/sidepanel.js:1237–1242` + `sidepanel/sidepanel.html:89` | **AC15 ARIA violation**: `<section role="region">` is appended directly to `div#item-list[role="list"]`. Per ARIA spec, `role="list"` children must be `role="listitem"`. axe-core audit will fail. | Wrap the `<section role="region">` in a `<div role="listitem">` before appending to `itemListEl`. The outer `listitem` carries list membership; the inner `section` remains the landmark. |
| H-3 | `sidepanel/sidepanel.js:2142–2150` (`_bulkMoveToGroup`) | **AC14 safe-mode UX**: Bulk "Save to group" on all-tabs selection swallows `ERR_SAFE_MODE` into a generic "check URL scheme or duplicates" toast. The single-tab context-menu path at 2442 correctly surfaces "Cannot save while in safe mode". | Inspect `r.reason?.code` in the `Promise.allSettled` results; if any is `ERR_SAFE_MODE`, short-circuit with the specific safe-mode toast before the generic failure message. |
| H-4 | `sidepanel/sidepanel.js:2442, 2444` | **Error codes as string literals**: `_openOpenTabContextMenu` compares `code === 'ERR_SAFE_MODE'` / `'ERR_DUPLICATE_URL'` as raw strings. `ERR_VALIDATION` on next line uses imported constant. | Add `ERR_SAFE_MODE` and `ERR_DUPLICATE_URL` to the existing `import from '../shared/errors.js'`; replace string literals with constants. |
| H-5 | `sidepanel/sidepanel.js:2438–2453` | **UX ordering bug**: in `_openOpenTabContextMenu` save-select change handler, `closeContextMenu()` fires synchronously before the `sendMessage(MSG_PROMOTE_TAB).catch(...)` rejection can surface. The toast still appears (DOM reference valid) but visually the menu vanishes before user sees the error flow. | Either (a) move `closeContextMenu()` into the `.then()` of the success path, or (b) add comment `// Intentional: menu closes immediately; toast appears independently`. Pattern decision needs consistency across B-026/B-028/B-055 context menus. |

### MEDIUM (fix if time permits)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:524` | **O(n²) filter**: `_cachedOpenTabs.find(t => t.tabId === tabId)` per row. At 50 tabs / 150ms keystroke debounce, 2,500 comparisons per tick. Saved-item path uses `_itemById.get(itemId)` O(1). | Pre-build a `Map<number, OpenTab>` from `_cachedOpenTabs` outside the loop. |
| M-2 | `background/tabs/tab-events.js:86–92` | **Misleading suppress comment**: title-changed suppression when favicon/audible co-arrive — comment says "already fired own broadcast" but the refetch path means title is carried through. Not lossy, but future maintainers will misread. | Rewrite comment to explain: `tab/favicon-changed` / `tab/audible-changed` trigger `refetchAndPatchLiveState` which re-reads `buildOpenTabs()`, so title is included in re-fetch. |
| M-3 | `background/messages/storage-handlers.js:273–274` | **Unguarded Chrome API**: tabId-only navigate variant does not wrap `chrome.tabs.update` / `chrome.windows.update` in try/catch. A late tab-close race can leak raw rejection into `errorEnvelope.cause`. | Wrap in try/catch; rethrow as `StorageError(ERR_NOT_FOUND, '...')` matching the itemId-navigate pattern. |
| M-4 | `sidepanel/sidepanel.js` (all selection writes: 725, 748, 763, 807) | **AC15 gap**: selected rows set `data-selected="true"` + CSS but not `aria-selected`. Screen readers cannot programmatically detect selection. | At every `row.dataset.selected = 'true'` call site, also `row.setAttribute('aria-selected', 'true')` (and `'false'` / removeAttribute when unselected). |
| M-5 | `tests/navigate-to-item.test.js` | **No test for tabId-only navigate variant**: new SW handler path uncovered. | Add tests: (a) valid `{tabId, windowId}` → update+update+returns `{tabId, opened:false}`; (b) tabId absent from live index → `ERR_NOT_FOUND`; (c) missing windowId → `ERR_VALIDATION`. |
| M-6 | `tests/broadcast.test.js` | **No test for `tab/created` + `tab/title-changed` broadcasts**: both added in B-055 for AC8 real-time updates. | Add tests covering suppression conditions and cold-start gating. |
| M-7 | `tests/enriched-list-items.test.js` | **AC13 no-write invariant untested**: no spy on `chrome.storage.local.set` during open-tabs rendering. | Add spy-based test confirming zero storage writes when `buildOpenTabs()` runs. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `sidepanel/sidepanel.js:1154,1156` | `OPEN_TABS_LIST_ID` / `OPEN_TABS_EMPTY_ID` constants set but lookups use class selectors — unused as IDs. |
| L-2 | `background/tabs/open-tabs.js:37` | `Object.values(getClaimsMirror())` allocates new array on every hot-path call. Flag for future perf sprint. |
| L-3 | `sidepanel/sidepanel.js:1328–1332` | Map deletion during `for...of` iteration (ES2015-safe but fragile pattern). |
| L-4 | `background/tabs/open-tabs.js:33-61` | Unbounded `openTabs` size for users with 1000+ tabs. Accepted per §26.10 risk 1. |
| L-5 | `background/messages/storage-handlers.js:264-276` | tabId-only navigate doesn't verify tab is unclaimed. Defense-in-depth; not exploitable. |
| L-6 | `sidepanel/sidepanel.js:1430–1434` | Potential stale window badge when multi-window → single-window mid-session. **UAT-only** verification. |
| L-7 | `sidepanel/sidepanel.js:buildOpenTabRow` | No inline hover-action buttons on open-tab rows; keyboard users rely on native context-menu shortcut. UAT doc follow-up. |
| L-8 | `sidepanel/sidepanel.js:1278–1280` | `role="status"` + `aria-live="polite"` is redundant (role implies live region). |

## B-028 — Selection context menu (Fast Track S)

> Most B-028 HIGH findings from code-reviewer were actually about `_openOpenTabContextMenu` (B-055 territory) and are merged above (B-055 H-4, H-5). B-028's own findings are lighter.

### CRITICAL / HIGH
_None_ (after cross-attribution).

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:2145–2151` | `_bulkMoveToGroup` all-open-tabs path calls `_clearSelection()` unconditionally even when all promotes fail — user can't retry. Saved-item path correctly only clears on success. | Clear only when `failures === 0`; otherwise call `_updateBulkBar()` so bar reflects surviving selection. |
| M-2 | `sidepanel/sidepanel.js:2323–2334` + `2420–2435` | Group-option builder duplicated between selection context menu and open-tab context menu. | Extract `_buildGroupOptions(selectEl)` helper. |
| M-3 | `sidepanel/sidepanel.js:2307–2310` | Selection menu heading `<span class="context-menu-label">` has no ARIA role — screen readers read it as a menu item. | Add `role="presentation"` or `aria-disabled="true"` or convert to `<p role="note">`. |
| M-4 (security) | `sidepanel/sidepanel.js:2273–2276` (`closeContextMenu`) | **Pre-existing inherited from B-026**: focus restoration to `_contextMenuTriggerRow` fails silently when the row is detached by a concurrent `renderAll`. Accessibility regression under broadcast churn. B-028 inherits the pattern. | Capture row's selection key, re-resolve via `_rowForSelectionKey(key)` on close, fall back to `itemListEl`. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `tests/b028-selection-context-menu.test.js:118-194` | Test-local logic reproduction — same pattern as b024/b054. Limitation documented. |
| L-2 | `sidepanel/sidepanel.js:2168-2170` | `_bulkClose` called without `await` — internal try/catch covers it but pattern fragile. |
| L-3 | `sidepanel/sidepanel.js:2149` | Bulk promote failure toast collapses all errors into one generic string; single-tab path distinguishes SAFE_MODE / DUPLICATE_URL / VALIDATION. |

## B-047 — In-panel keyboard shortcuts (Fast Track XS)

### CRITICAL
_None_

### HIGH (test-only, not production bugs)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `tests/b024-multi-select.test.js` (B-047 block) | Test helper `_selectAll(ctx)` queries only `[data-item-id]:not([hidden])`. Production at `sidepanel.js:758` includes `[data-tab-id]:not([hidden])`. B-047 tests never exercise open-tab row inclusion — coverage gap with B-055. | Seed test rows with `data-tab-id` + `data-live-only="true"`; widen `_selectAll(ctx)` to match production query. Add at least one mixed-gesture test. |
| H-2 | `tests/b024-multi-select.test.js` (B-047 block) | Test helper `handleGlobalKeydownReal` lacks the dialog-open Escape guard present in production at `sidepanel.js:1736–1740`. Future dialog-scenario tests would mislead. | Add `dialogOpen = false` parameter to the helper, mirroring `propagationStopped` pattern. |

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `tests/b024-multi-select.test.js` ~line 1310 | AC3 Escape-in-input test does not assert `clearFilter()` is called (filter-side behaviour). Coverage gap for the filter side. | Add comment clarifying test scope or add a dedicated filter-side test. |
| M-2 | `tests/b024-multi-select.test.js` ~line 1406 | contentEditable gap test documents broken behaviour but no backlog reference / `TODO(B-XXX)` / `KNOWN-GAP` marker. | Add backlog reference or `KNOWN-GAP` prefix. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | Test naming inconsistency (`B-047 AC1:` vs existing `AC1 (UI):` pattern). |
| L-2 | `activeTagName: null` default in helper — production reads `undefined` from `document.activeElement?.tagName`. Same result today. |

## B-051 — Sort-order normalisation (Fast Track S)

### CRITICAL / HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `shared/selection.js:1–33` + `sidepanel/sidepanel.js:2035–2066` | **AC3 partially incomplete**: `pruneSelection` exported but not wired into sidepanel bulk-action path. AC3 requires selection sets be pruned "before bulk actions are applied" — today silent pruning via partial-success envelope satisfies the outcome but the library is orphan. | Wire `pruneSelection(selection, _itemById)` into `_bulkClose` / `_bulkRemove` / `_bulkMoveToGroup` BEFORE snapshotting `ids`. |
| M-2 | `background/storage/items.js:515–520` | O(n×m) `items.find()` inside source-group loop in `bulkUpdateItems`. 500×500=250k comparisons worst-case. `existingIds` Set already built two lines earlier. | Pre-build `Map<id, item>` before the loop; use `.get()` inside. |
| M-3 | `background/storage/items.js:203–204` | Closure mutation of outer `item.sortOrder` after tx — correct but subtle. Comment missing. | Add one-line comment explaining `writeTransaction` await semantics and the no-copy-to-retry-loops constraint. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `background/storage/items.js:382–384` | Double-sync: `txCreated` updated twice in `bulkCreateItems` (pre-norm + post-norm). First pass redundant. |
| L-2 | `background/storage/items.js:113` | `normaliseGroupSortOrders` lacks `@private`/`@internal` JSDoc marker. |
| L-3 | `tests/b051-normalisation.test.js:245` | Idempotency test name conflates bucket isolation with idempotency. |
| L-4 | `background/storage/items.js:144` | Non-stable sort on duplicate `sortOrder` — V8 is stable since ES2019 but undocumented reliance. Add tiebreaker. |
| L-5 | `background/storage/items.js:147` | Fast-path doesn't validate integer sortOrders (only sequentiality). Future drag-reorder with fractional values could clobber. |
| L-6 | `shared/selection.js:24-33` | `pruneSelection` no type guards on inputs — `Set` instance check, array check. Robustness hardening. |
| L-7 | `shared/selection.js:27-31` | Non-string IDs silently dropped — intentional; document. |
| L-8 | `background/storage/items.js:197-205` | Quota-write spike on first post-upgrade `createItem` if existing bucket has gaps. Acceptable. |

---

## Rollup — items to fix before R5

- **CRITICAL: 0**
- **HIGH (must fix): 7**
  - B-055 H-1 safe-mode write-gate (AC14)
  - B-055 H-2 ARIA role="list" child violation (AC15)
  - B-055 H-3 safe-mode toast in bulk promote (AC14)
  - B-055 H-4 error codes as string literals
  - B-055 H-5 `closeContextMenu` ordering (decision + comment OR reorder)
  - B-047 H-1 test helper coverage gap with open-tab rows
  - B-047 H-2 test helper dialog-open guard documentation
- **MEDIUM selected for this sprint:**
  - B-055 M-1 (O(n²) filter — trivial 3-line fix)
  - B-055 M-3 (Chrome API try/catch — hardens tabId-only navigate)
  - B-055 M-4 (`aria-selected` — AC15 quality)
  - B-051 M-1 (wire `pruneSelection` — AC3 completeness)
  - B-051 M-2 (bulk-update Map lookup — trivial)

All LOW findings deferred.

UAT-only items (drive interactive UAT with user):
- B-055 AC6 (focus change + sidepanel stays open)
- B-055 AC8 (external tab open/promote propagation under 500ms)
- B-055 AC10 (empty-state always mounted)
- B-055 AC11 (filter across saved + open-tab rows)
- B-055 AC14 (safe-mode interactions — re-verify after fixes)
- B-055 AC15 (keyboard walkthrough + axe-core)
- B-055 AC16 (50-row perf budget)
- B-055 L-6 (stale window badge when multi→single-window)
- B-055 L-7 (Shift+F10 context-menu keyboard reachability)

---

# Sprint 14 — R4 Findings (Deduplicated)

> Items reviewed: B-014 (Full M, 3 reviewers). B-057 is research-only (no code); no R4.
>
> Cross-reviewer convergence: [code-reviewer] H-1 and [qa-reviewer] M-1 are the same `Number(raw) || null` bug. [qa-reviewer] H-1 (window-filter loss after renderAll) converges with [qa-reviewer] M-3 (same root cause on the fallback path). Merged below.

## B-014 — Multi-window awareness & window badge

### CRITICAL
_None_

### HIGH (must fix before R5)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:1982` | **`Number(raw) \|\| null` silently maps windowId=0 to "All windows"**: `Number("0") === 0` is falsy → `0 \|\| null → null`. A real windowId=0 would behave as if the All chip were active. Latent today (registerWindow rejects negative but not 0), but semantically unsafe. | `_activeWindowFilter = raw === 'all' ? null : (Number.isFinite(Number(raw)) ? Number(raw) : null);` |
| H-2 | `sidepanel/sidepanel.js:1042` + all `renderAll` call sites (406, 1684, 2406) | **Window filter silently lost after broadcast-driven renderAll**: `renderAll` only re-applies `applyFilter()` when `_filterQuery` is truthy. If a user has a window chip active but no text query, any `scope: items \| groups` broadcast rebuilds the DOM with all rows visible; the chip shows selected but no rows are filtered. Silent state mismatch. | Change line 1042 from `if (_filterQuery) applyFilter()` to `if (_filterQuery \|\| _activeWindowFilter !== null) applyFilter()`. Covers all call sites. |
| H-3 | `background/tabs/tab-events.js` | **AC13 gap — `tabs.onDetached` / `tabs.onAttached` not registered**: Chrome fires these events (NOT `onUpdated`) when a user drags a tab between windows. `LiveTabIndex.windowId` never updates → `liveStates[id].windowId` is wrong → badge stays stale until the next full reload. The badge-update infrastructure (`_patchItemWindowBadge`, `_applyWindowMapToUI`, `SCOPE.WINDOW_MAP`) is complete but never triggered for this case. | Register `onDetached` → mark transitional; register `onAttached` → `updateTabEntry(tabId, {windowId: newWindowId, index: newPosition})` + broadcast `SCOPE.LIVE_STATE` and `SCOPE.WINDOW_MAP` (latter last so sidepanel re-fetches with fresh windowId before patching badges). |

### MEDIUM (selected fixes this sprint)

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:2378` + broadcast.js | Scope comparison uses bare string `'windowMap'` instead of imported `SCOPE.WINDOW_MAP` constant. Hidden coupling; silent breakage on rename. | Export `SCOPE` from `background/broadcast.js` (or a thin `shared/scopes.js`), import into sidepanel, compare against constant. |
| M-2 | `background/tabs/window-ordinals.js:85–87` | Bootstrap guard comment is misleading — suggests `getAll()` re-captures post-bootstrap, but it doesn't. Race window exists where a window opened during the getAll await gets interleaved ordinals. | Correct the comment to describe actual best-effort behaviour (security reviewer L-1 also flags this as a defense-in-depth concern). |
| M-3 | `sidepanel/sidepanel.js:2378–2391` (windowMap broadcast handler) | Handler calls `_setCachedOpenTabs` + `_applyWindowMapToUI` but NOT `patchOpenTabsSection`. DOM `data-window-id` attributes can be stale when a tab moves between windows and the windowMap broadcast arrives before the liveState broadcast. Badge reads stale attribute → brief UX flicker. | In the `windowMap` scope handler, call `patchOpenTabsSection(_cachedOpenTabs)` after `_setCachedOpenTabs` and BEFORE `_applyWindowMapToUI()`. |
| M-4 | `background/tabs/tab-claims.js:204` | `buildLiveStates` JSDoc return-type annotation predates B-014 — doesn't mention `tabId` or `windowId`. Future maintainers will be misled. | Widen the `@returns` typedef to include the optional `tabId?: number` + `windowId?: number`. |

### LOW (defer)

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `background/tabs/tab-events.js:297` | `registerWindow` returns existing ordinal on idempotent replay — broadcast still fires. Wastes one IPC round-trip per duplicate `onCreated`. Benign. |
| L-2 | `sidepanel/sidepanel.css` | `.item-window-badge` and `.open-tab-window-badge` are 100% duplicate CSS today — intentional for future divergence, note for next CSS pass. |
| L-3 | `background/tabs/window-ordinals.js:150–154` | Test hatch `__resetWindowOrdinals` redundantly resets `bootstrapping=false`. Harmless. |
| L-4 | `sidepanel/sidepanel.js` | `_refreshPanelWindowId` called up to 2-3× during cold open — fire-and-forget pattern; idempotent; no dedupe. |
| L-5 | `sidepanel/sidepanel.js:696–703` | `clearFilter()` doesn't reset `_activeWindowFilter`. Arguably correct (orthogonal filters) but UX-ambiguous. Product review. |
| L-6 (security) | `window-ordinals.js` | Same as M-2 — first-seen-order invariant not strictly held during bootstrap race. Defense-in-depth only; no security impact. |

### ACs requiring UAT

| AC | UAT check |
|----|-----------|
| AC5 | First-paint race: open panel with 2 windows, observe any flash of badges on same-window rows before suppression kicks in |
| AC13 | Tab drag between windows → badge updates without full re-render (blocked until H-3 fix lands) |
| AC16 | B-035 standalone-window cross-panel consistency — SKIP (B-035 not yet shipped) |
| AC18 | Out-of-scope exclusions — confirm cross-device sync / named windows / multi-profile code paths do not exist |
| Visual | Double-digit ordinals (W10+) render without wrapping; filter row layout in narrow panel |
| Layout shift | Opening 2nd window mid-session — confirm no focus jump / scroll jump when filter row appears |

## Rollup — items to fix before R5

- **CRITICAL: 0**
- **HIGH (must fix): 3** (B-014 H-1, H-2, H-3)
- **MEDIUM (selected): 4** (M-1, M-2, M-3, M-4)

All LOW findings deferred to future sprints.
