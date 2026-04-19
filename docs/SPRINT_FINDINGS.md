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


---

# Sprint 15 — R4 Findings

> Reviewers: [code-reviewer], [security-reviewer] (Fast Track — no qa-reviewer).
> Items: B-058 (S), B-027 (S). B-059 (M) has its own Full-tier R4 block below once built.

---

## Sprint 15 — B-058 [code-reviewer]

Files in scope: `shared/url.js`, `background/messages/storage-handlers.js`, `tests/b058-scheme-allowlist.test.js`, `tests/promote-tab.test.js`, `tests/legacy-migration.test.js`.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `shared/url.js:71–73` | `hasScheme` opaque-scheme detection is a named-scheme allowlist inside a named-scheme allowlist. The `/^(about\|view-source):/i` branch must be kept in sync with `ALLOWED_URL_SCHEMES` manually. Any future opaque-path scheme added to the `Set` would silently have `https://` prepended, causing a parse error. Coupling is non-obvious from the `Set` definition alone. | Extract an `OPAQUE_PATH_SCHEMES` constant (or derive from `ALLOWED_URL_SCHEMES`) so `hasScheme` stays aligned. At minimum, add a `// KEEP IN SYNC WITH ALLOWED_URL_SCHEMES` cross-reference comment. |
| M-2 | `background/messages/storage-handlers.js:214` | Extra blank line left after removed block-list: `const url = tab.url \|\| '';` is followed by a blank line before the AC4 comment, creating asymmetric whitespace vs surrounding blocks. | Remove the extra blank line. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `tests/promote-tab.test.js:99` | AC3 chrome:// test asserts `assert.equal(item.url, 'chrome://settings')` against the exact raw tab URL. `normalizeUrl` may canonicalize to `chrome://settings/` (WHATWG trailing slash on authority-only URLs). Prefer `startsWith` or assert against `normalizeUrl(tab.url)`. |
| L-2 | `tests/b058-scheme-allowlist.test.js:63–65` | Only asserts `startsWith('chrome://settings')` for a query-string URL — truncated output would still pass. Consider tightening to check query string or full path. |
| L-3 | `shared/url.js:23–32` | `ALLOWED_URL_SCHEMES` is a mutable `Set` exported as `const` — any importer can `.add()` / `.delete()` silently. Pre-existing pattern; surface expanded with B-058. Consider `Object.freeze` wrapper or `@readonly` JSDoc. |

### Verdict
**Clean with minor cleanup.** 0 CRITICAL / 0 HIGH. No fixes required before R5; MEDIUMs are small pre-merge polish.


---

## Sprint 15 — B-027 [code-reviewer]

Files in scope: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html`, `tests/b027-group-header-menu.test.js`.

### CRITICAL
_None_

### HIGH

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:3495–3504` | `e.preventDefault()` is called unconditionally before `_openGroupContextMenu` runs its `__ungrouped__` early-return. Right-clicking the Ungrouped header suppresses the browser's native context menu and shows nothing — a silent dead zone. | Check `groupId === '__ungrouped__'` in the event handler itself before calling `preventDefault`. |
| H-2 | `sidepanel/sidepanel.js:3005–3048` | All three `select-*` handlers call `_clearSelection()` (which internally calls `_updateBulkBar()`) then immediately call `_updateBulkBar()` again — two DOM renders where one suffices (empty intermediate + final). | Replace `_clearSelection()` with inline `_selection.clear()` and a single trailing `_updateBulkBar()`. |

### MEDIUM
_Details not captured by reviewer summary (3 MEDIUM items noted — counts only)._

### LOW
_Details not captured by reviewer summary (3 LOW items noted — counts only)._

### Verdict
**Must-fix H-1 and H-2 before R5.** Implementation is solid; all 7 menu actions present, ARIA/focus OK, test coverage thorough. Two HIGH issues are localized fixes.


---

## Sprint 15 — B-058 [security-reviewer]

Scope: Files reviewed — `shared/url.js`, `background/messages/storage-handlers.js`, `tests/b058-scheme-allowlist.test.js`, `tests/promote-tab.test.js`, `tests/legacy-migration.test.js`.

**Threat model checked**:
- `javascript:` / `data:` hard-reject on every ingress path (promote, bulk-create, import, legacy migration) — all route through `createItem → validateNewItem → normalizeUrl → ALLOWED_URL_SCHEMES` in the SW
- Case-sensitivity bypass (`JaVaScRiPt:`) — WHATWG URL parser lowercases `protocol`, blocked
- Whitespace / unicode / zero-width bypass — URL parser restricts scheme to ASCII `[a-zA-Z][a-zA-Z0-9+\-.]*`, rejected at parse
- `view-source:javascript:` / `view-source:data:` nesting — Chrome renders view-source as text (no execution); `chrome.tabs.create` additionally refuses raw `javascript:` URLs
- Allowlist enforcement is server-side in the SW — not client-side only
- URL rendering: sidepanel uses `chrome.tabs.create({url})`, never `.href`. `innerHTML` confined to static SVG icons
- No new `console.*` statements leaking URL strings

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (sec) | `shared/url.js:71–73` | Opaque-scheme detection hard-coded to `(about\|view-source)` only. If `ALLOWED_URL_SCHEMES` is ever extended with another opaque-path scheme, the `hasScheme` regex will NOT match, `https://` will be silently prepended, and the input will fall through to the `https:` branch of the allowlist. Not exploitable today — latent bypass fragility / defense-in-depth gap. Overlaps with [code-reviewer] M-1. | Derive the opaque-scheme regex from `ALLOWED_URL_SCHEMES` (or an `OPAQUE_PATH_SCHEMES` subset). Minimum: add `// SECURITY: keep in sync with ALLOWED_URL_SCHEMES — drift allows scheme-coercion on the https fallback` comment at the regex. |

### LOW

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| L-1 (sec) | `shared/url.js:82` | `StorageError` details carry raw user `input` on parse failure. Swallowed today, but any future `console.error(err)` would leak rejected URL payloads (PII, credential-bearing strings). B-058 widens the funnel. | Drop raw `input` from `details`, or document project-wide: StorageError details must never be logged verbatim. |
| L-2 (sec) | `background/messages/storage-handlers.js:210–214` | Comment describes delegation but does not restate that `javascript:`/`data:` remain blocked. Future readers skimming only the promote handler won't see the XSS defense. | Add: `// NOTE: javascript:/data: still rejected inside normalizeUrl via ALLOWED_URL_SCHEMES.` |
| L-3 (sec) | `tests/b058-scheme-allowlist.test.js` | Missing regression tests for mixed-case (`JaVaScRiPt:alert(1)`), leading whitespace, zero-width (`'javascript\u200B:alert(1)'`), and opaque base64 data URL vectors. Parser + allowlist handles all four today; explicit tests catch regressions if the regex is loosened. | Add `assert.throws(..., ERR_VALIDATION)` cases for the four vectors. |

### UAT Security Checks

| AC | UAT check |
|----|-----------|
| Security | Paste `javascript:alert(1)` into new-item dialog → must reject, no alert fires |
| Security | Paste `data:text/html,<script>alert(1)</script>` → must reject |
| Security | Promote a `chrome://extensions` tab → stored; click opens internal page (no sandbox escape) |
| Security | Promote `view-source:https://example.com` → stored; click opens as rendered text |
| Security | Devtools-set a live tab URL to `JaVaScRiPt:alert(1)` and promote → must reject at `normalizeUrl` |

### Verdict
**Security-sound.** `javascript:` and `data:` remain hard-blocked; removing the duplicate promote-handler block-list eliminates drift without loosening enforcement. One MEDIUM (overlapping [code-reviewer] M-1) and three LOW hardening nits; none block R5.


---

## Sprint 15 — B-027 [security-reviewer]

Scope: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `tests/b027-group-header-menu.test.js`. No `manifest.json` change, no new message types (reuses `MSG_UPDATE_GROUP`, `MSG_DELETE_GROUP`, `MSG_NAVIGATE_TO_ITEM`, `MSG_CLOSE_TABS`), no new permissions.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (sec) | `sidepanel/sidepanel.js:2979–2990` (Close all open tabs) | `openConfirmDialog` called without `triggerEl: header` in the options bag; on dismissal, focus falls back to whatever `_dialogTriggerEl` was previously set to (could be `null` → `<body>`). The sibling Delete Group branch at line 3086 correctly passes `triggerEl: header`. Focus-trap / a11y hygiene inconsistency. | Add `triggerEl: header` to the options object at `sidepanel.js:2986–2989`. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 (sec) | `sidepanel/sidepanel.js:2988, 3085` | Group name concatenated into confirm-dialog `body` strings. Safe today (line 497 sets via `textContent`), but would become XSS if a future refactor switched to `innerHTML`. Add `/* SECURITY: set via textContent — do not switch to innerHTML */` comment at `sidepanel.js:497`. |
| L-2 (sec) | `sidepanel/sidepanel.js:404–409` (`_buildGroupColorSwatches`) | `className` / `aria-label` interpolate `color`. Safe because callers pass `GROUP_COLORS` allowlist, but the function itself does not enforce this. Defense-in-depth: early-return if `!GROUP_COLORS.includes(color)`. |
| L-3 (sec) | `sidepanel/sidepanel.js:406` | Swatch `aria-label` is the raw English token — not localized. a11y/i18n follow-up, not security. |
| L-4 (sec) | `sidepanel/sidepanel.js:2960, 3077` | `{ title: group.name }` passed to `openConfirmDialog` is unused when `body` override is present (line 498 short-circuits). Future-reader note only. |

### Verdict
**No security blockers for R5.** Clean XSS story — all user-provided group names flow only through `textContent` / `input.value`. Destructive actions gated behind `openConfirmDialog`. One MEDIUM focus-management inconsistency (M-1) worth bundling with [code-reviewer] H-1/H-2 fix.

---

## Sprint 15 — R4 Rollup

| Item | Tier | CRIT | HIGH | MED | LOW | Gate |
|------|------|------|------|-----|-----|------|
| B-058 [code-reviewer] | S | 0 | 0 | 2 | 3 | ✅ pass |
| B-058 [security-reviewer] | S | 0 | 0 | 1 | 3 | ✅ pass |
| B-027 [code-reviewer] | S | 0 | **2** | 3 | 3 | ⚠️ fix HIGH before R5 |
| B-027 [security-reviewer] | S | 0 | 0 | 1 | 4 | ✅ pass |

**Must fix before closure (HIGH):**
- B-027 H-1: Ungrouped header `preventDefault` dead zone
- B-027 H-2: Double DOM render in `select-*` handlers

**Bundled MEDIUMs (small, same diff area):**
- B-027 M-1 (sec): `triggerEl: header` on Close-all-tabs confirm
- B-058 M-1 / M-1 (sec): opaque-scheme `// SECURITY / KEEP IN SYNC` comment at `shared/url.js:71`
- B-058 M-2: blank line at `storage-handlers.js:214`

LOWs deferred. Routing to [frontend-engineer] next.

---

## Sprint 15 — B-059 [security-reviewer]

Scope + threat model checked against the 8 focus areas in the R4 brief.
Files inspected: `background/messages/storage-handlers.js`,
`shared/errors.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`,
`sidepanel/sidepanel.html`, `tests/promote-tab.test.js`,
`tests/b059-duplicate-warn.test.js`. Also verified `manifest.json` (no
changes) and `background/tabs/floating-groups.js` (not in diff).

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._ The duplicate-warn dialog body composes a user-controlled title
(`existing.title`) and a group label (`_groupLabelForItem(existing)`)
into a string, but that string is written to `confirmBodyEl.textContent`
at `sidepanel/sidepanel.js:555` — no HTML parsing path, so even a title
containing `<script>` or angle-bracket payloads is rendered as inert
text. Heading uses `textContent` at :554. Confirm button label uses
`textContent` at :557. No XSS surface.

### LOW
| # | File | Finding | Fix |
|---|------|---------|-----|
| B-059 L-1 (sec) | `sidepanel/sidepanel.js:557–558` | `variant` param default is `'destructive'` and the two call sites use string literals `'primary'` / (default). Safe today, but `dataset.variant` writes whatever string it's given — a future caller that forwards a user-controlled value would paint arbitrary CSS-attribute state. Hardening nit: `confirmDeleteBtnEl.dataset.variant = variant === 'primary' ? 'primary' : 'destructive';` would lock the set to a two-value enum and defend against future misuse. | Optional: clamp to allowlist at the call site. |
| B-059 L-2 (sec) | `shared/errors.js:28–35` | The retained `ERR_DUPLICATE_URL` constant + comment explicitly documents the deploy-window fall-through. Good. Nit: add a TODO-removal marker tied to a version (e.g. "remove after v2.1.0") so the stale code path doesn't linger indefinitely once the deploy window closes. | Add version-gated removal note to the JSDoc. |
| B-059 L-3 (sec) | `sidepanel/sidepanel.js:3466–3468` | Fall-through `ERR_DUPLICATE_URL` toast `'A bookmark with this URL already exists'` is user-facing text only — no URL or title leaked to console or DOM. Confirmed no `console.log(url)` / `console.error(item)` added anywhere in the B-059 diff. | No action. |

### UAT security checks
- **XSS (title field)**: Save tab whose title is `<img src=x onerror=alert(1)>` to group A. Open a second tab with the same URL; context-menu → Save to group B. Dialog body must render the literal string, no alert fires. `textContent` usage verified statically at :555.
- **XSS (group name)**: Rename group to `<script>alert(1)</script>`. Trigger duplicate-warn. Group label must render inert.
- **Payload validation regression**: `MSG_PROMOTE_TAB` with `{tabId: "1"}` (string), `{tabId: null}`, `{groupId: 42}` must still reject with `ERR_VALIDATION`. Handler checks preserved at `storage-handlers.js:189–195`.
- **Scheme allowlist**: `javascript:alert(1)` and `data:text/html,<script>` must still reject through `createItem → normalizeUrl → ALLOWED_URL_SCHEMES`. Test `promote-tab.test.js` AC9 covers `javascript:` rejection.
- **Storage flood**: Confirm no UI affordance lets a page script auto-promote. Context-menu + keyboard are both user-initiated; `MSG_BULK_CREATE_ITEMS` size caps (B-024 M3) still cover the bulk path.
- **Sender validation**: No new `chrome.runtime.onMessage.addListener` calls in diff. Sole listener at `sidepanel.js:2558` is pre-existing.
- **No network**: Grep for `fetch(` / `XMLHttpRequest` / `new WebSocket` in diff — none present.

### Verdict
**PASS** — ship as-is. No CRITICAL/HIGH/MEDIUM findings. Three LOW hardening nits are deferrable to a follow-up sweep; none block B-059 closure. The removal of the SW-side duplicate check is a controlled data-layer relaxation (product decision, §29) and does NOT open any new injection, permission-escalation, or data-exfiltration surface: all user-controlled strings flowing into the new soft-warn dialog go through `textContent`, payload validation is intact, and no manifest permissions were touched.

---

## Sprint 15 — B-059 [code-reviewer]

Scope: `background/messages/storage-handlers.js` (removed duplicate-reject block, lines ~205–233 pre-diff); `shared/errors.js` (JSDoc added ~line 25); `sidepanel/sidepanel.js` (helpers `_findDuplicateSavedItem` ~509–521, `_groupLabelForItem` ~528–532, `openConfirmDialog` signature ~537–574, `_openOpenTabContextMenu` change-handler ~3365–3416, `_bulkMoveToGroup` tabIds branch ~2806–2879; B-027 group dialog code ~389–551, ~3003–3209); `sidepanel/sidepanel.css` (primary-variant rule ~749–759; B-027 swatch rules ~769–792); `tests/promote-tab.test.js` (AC4 flip); `tests/b059-duplicate-warn.test.js` (new, 13 cases).

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `tests/b059-duplicate-warn.test.js:65` | **Test fixture key field diverges from production shape.** `makeCtx` builds `openTabsById` with `t.id` as the map key (`openTabsById.set(t.id, t)`), but production populates `_cachedOpenTabsById` with `t.tabId` (`new Map(_cachedOpenTabs.map((t) => [t.tabId, t]))`; `open-tabs.js:43`). Tests pass because the numeric `id` values in fixtures (42, 7, 1–5) happen to match the numeric `tabId` parameter passed to `singleTabSaveHandler` / `bulkSaveHandler` — but the fixture object lacks the `tabId` field that the production object carries. If a future test accesses `tab.tabId` inside the shim (the production code does `tab.url`, `tab.title`, `tab?.tabId`) no crash occurs today, but the naming divergence is a latent maintenance trap. Fix: rename `id` → `tabId` in all fixture open-tab objects (`{ id: 42 … }` → `{ tabId: 42 … }`) and update `makeCtx` to `openTabsById.set(t.tabId, t)` to mirror production. |
| M-2 | `tests/b059-duplicate-warn.test.js` — missing T-8 | **T-8 (URL-normalization boundary / fragment stripping) has no coverage in this file.** `SOLUTION_DESIGN §29.8` explicitly designates T-8 as a test obligation for B-059, instructing it land in either `b059-duplicate-warn.test.js` or `url-normalize.test.js`. Neither file has a `safeNormalizeForMatch('https://example.com#a') === safeNormalizeForMatch('https://example.com#b')` assertion. The `b058-scheme-allowlist.test.js` forMatch tests do not cover the `https:` fragment-stripping path in the context of `_findDuplicateSavedItem`. Fix: add a case to `b059-duplicate-warn.test.js` asserting that `findDuplicateSavedItem` treats `https://example.com#section1` and `https://example.com#section2` as duplicates (i.e., the function returns a match). |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:515` | **`safeNormalizeForMatch` called twice per cached item in `_findDuplicateSavedItem`'s inner loop.** The outer call normalizes the incoming `url` (correct, hoisted), but each iteration re-normalizes `it.url` live. With `_cachedItems` bounded to ~2 000 items and saves being user-initiated (not high-frequency), this is not a measured performance problem. However, the architecture comment in the JSDoc promises "zero IPC, O(n) over cached items" — the hidden constant is actually 2× the normalization cost. Preferred fix: no change required at this scale; acceptable as-is. Optional micro-optimization: pre-normalize `_cachedItems` into a parallel `Map<normalizedUrl, item>` keyed on first-seen during `renderAll`, eliminating per-call linear scans entirely. Defer to B-022 (de-duplication) when that map would be useful anyway. |
| L-2 | `sidepanel/sidepanel.css` (diff lines +19–+50) | **B-027 group-color-swatch CSS rules are in the B-059 diff but are not B-059 logic.** The `.group-color-swatches`, `.group-color-swatch`, `.group-color-swatch:hover`, `:focus-visible`, and `[aria-checked="true"]` rules were absent from the previous commit of `sidepanel.css` yet belong to B-027's group-edit dialog (already shipped in the JS layer). This appears to be a previously-omitted CSS chunk carried in this PR rather than scope creep — the rules have no functional overlap with the soft-warn feature. No action needed for B-059, but flag for [solution-architect] to confirm B-027's DoD CSS checklist was satisfied. |
| L-3 | `sidepanel/sidepanel.js` — B-027 block (~389–551, ~3003–3209) | **Substantial B-027 group-dialog code appears in the B-059 diff.** `openGroupEditDialog`, `closeGroupDialog`, `_handleGroupFormSubmit`, `_buildGroupColorSwatches`, `_openGroupContextMenu`, and six new DOM-element bindings (`groupDialogEl`, `groupFormEl`, etc.) are all attributed to B-027, not B-059. This is either a missed-commit carry-over from the B-027 sprint or code that was intentionally deferred. The B-059 R4 scope-of-review is the six B-059-tagged files; this block has not been through its own R4 gate. Flag for [scrum-master]: confirm B-027's R4 + Definition of Done were completed for this block, or open a new tracking item if this is unreviewed code entering the branch for the first time. |

---

## Sprint 15 — B-059 [qa-reviewer]

Review surface: `background/messages/storage-handlers.js`, `shared/errors.js`,
`shared/url.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`,
`sidepanel/sidepanel.html`, `tests/promote-tab.test.js`,
`tests/b059-duplicate-warn.test.js`. Cross-referenced SOLUTION_DESIGN §29,
specifically §29.3.1, §29.4.3, §29.6, and §29.8 (T-1..T-10).

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| B-059 M-1 (qa) | `sidepanel/sidepanel.js:3366–3416` (single-tab) + `:2820–2855` (bulk) | **Dialog copy goes stale if state changes while the dialog is open.** `MSG_STATE_CHANGED` broadcasts (`:2584`) call `renderAll` which overwrites `_cachedItems`. The already-open duplicate-warn dialog still shows the old `existing.title` / group label, and the aggregate `"N of M tabs already saved"` heading references counts that may no longer be accurate (tabs closed, existing item renamed/moved/deleted). On confirm the dispatch still fires correctly — the bug is a trust/cosmetic one: user sees "saved as X in Work" when X has been renamed in the background. §29.3.1 accepts the *mid-fetch* pre-check staleness but is silent on the *mid-dialog* staleness. | (a) Refresh the dialog copy when an `items`-scope broadcast arrives while `confirmDialogEl` is visible — re-compute `existing` from fresh cache and re-write `confirmBodyEl.textContent`; or (b) document as accepted behaviour in §29.3.1 and add a regression test asserting the UI does not crash on broadcast-during-open. Lightweight (b) is acceptable for M-tier. |
| B-059 M-2 (qa) | `sidepanel/sidepanel.js:3366–3416` | **Cancel → retry friction in single-tab flow.** The context menu is closed synchronously before the dialog opens (`:3374`). If the user cancels the soft-warn, the menu is gone — they have to right-click the row again to retry with a different group. No affordance indicates this. T-3 still passes. | Optional: on Cancel, show a toast "Save cancelled — right-click to retry", or re-open the context menu anchored to the same row. Defer if not a frequent user report. |
| B-059 M-3 (qa) | `tests/b059-duplicate-warn.test.js` | **Tests reproduce the handler logic verbatim rather than importing it.** The test file restates `findDuplicateSavedItem` + `groupLabelForItem` + the dispatch wiring by hand. A future refactor to the real `_findDuplicateSavedItem` in `sidepanel.js` will pass these tests while silently breaking the real UI. Consistent with `b027-group-header-menu.test.js` house style, but weakens the R5 gate for B-059. | Option A: extract `_findDuplicateSavedItem` and `_groupLabelForItem` to `shared/duplicate-detect.js` so both sidepanel and tests import the same function. Option B (cheaper): add a ESLint comment-based cross-reference check. |
| B-059 M-4 (qa) | `tests/promote-tab.test.js:36–59` vs §29.8 T-7 | **T-7 mapping to the handler test is indirect.** T-7 says "call the `MSG_PROMOTE_TAB` handler directly … asserts no throw, no `ERR_DUPLICATE_URL`". `promote-tab.test.js` re-declares a local `promoteTab()` helper that mirrors the handler body. If someone re-introduces the `ERR_DUPLICATE_URL` throw inside the real dispatch while forgetting to update the helper, the test stays green. | Port `promote-tab.test.js` to dispatch through the real `dispatch()` in `storage-handlers.js`, matching the pattern of other handler-level tests. Cheaper interim fix: add a single regression case that imports the real dispatcher. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| B-059 L-1 (qa) | `sidepanel/sidepanel.js:534–565` | `variant` is documented as `'primary' \| 'destructive'` but is not validated — any caller can write `variant: 'fubar'` and the CSS falls through to red silently. Not a bug today (two callers); latent risk as the signature is reused. | Clamp inside `openConfirmDialog`: `const v = variant === 'primary' ? 'primary' : 'destructive';` then use `v` for the dataset write. |
| B-059 L-2 (qa) | `sidepanel/sidepanel.js:2866` | Aggregate dialog uses `{ title: tabIds.length + ' tabs' }` as the synthetic item. Harmless today because `openConfirmDialog` reads `item.title` only when `body` is absent. A future refactor that reads `item.title` unconditionally will produce "3 tabs" in a delete dialog. | Pass `null` and tighten the defaults, or drop the synthetic item and accept `null` as the first arg. |
| B-059 L-3 (qa) | `sidepanel/sidepanel.js:3411` | Single-tab confirm label is `'Save anyway'`; bulk is `'Save all N'`. Consistent with §29.6.3 and §29.4.2, but the single-tab label loses count context. Accepted per design. | No action — note for [technical-writer] in R7. |
| B-059 L-4 (qa) | `sidepanel/sidepanel.css:749–758` | `.dialog-btn--danger[data-variant="primary"]` overrides `background`/`border-color` but inherits `color: #ffffff` from the base `.dialog-btn--danger` rule. If the base ever uses a theme token, the primary override silently picks up an unintended foreground. | Write `color: #ffffff;` explicitly in the `[data-variant="primary"]` block. |
| B-059 L-5 (qa) | `sidepanel/sidepanel.html:141` | Confirm button `id="confirm-delete-btn"` even when label is "Save anyway". Most AT announce `textContent`, but some dev-tooling/AT extensions expose the id — contradicts the rendered label. | Rename to `confirm-action-btn` (breaking: 4–6 `sidepanel.js` references). Defer. |
| B-059 L-6 (qa) | `tests/b059-duplicate-warn.test.js` | **T-8 (fragment-only diff) and T-9 (floating-group regression) are not in this file.** §29.8 routes T-8 to `tests/url-normalize.test.js` and T-9 to `tests/b010-live-state.test.js`; neither file was touched this sprint. Separately flagged by [code-reviewer] M-2. | Read those test files in R5 and explicitly link the T-8 / T-9 case IDs as comments; if not covered, add cases (matches [code-reviewer] M-2). |
| B-059 L-7 (qa) | `sidepanel/sidepanel.js:2812–2818` | Bulk pre-scan is O(n·m): per-tab linear scan of `_cachedItems`. At 1 000 × 50 = 50k normalizations — within perf budget but wasteful. | Build a Set once per `_bulkMoveToGroup` call: `const saved = new Set(_cachedItems.map((i) => safeNormalizeForMatch(i.url \|\| ''))); for (…) if (saved.has(norm)) …` — drops to O(n+m). Overlaps with [code-reviewer] L-1. |
| B-059 L-8 (qa) | `sidepanel/sidepanel.js:3386–3392` | The `ERR_DUPLICATE_URL` fall-through toast is unreachable in steady state. The comment at :3381 documents the deploy-window rationale, but no unit-level test asserts the branch still works if it fires. | Add a test that stubs `sendMessage` to reject with `{code:'ERR_DUPLICATE_URL'}` and asserts the toast copy. |
| B-059 L-9 (qa) | `sidepanel/sidepanel.js:2841` | `_clearSelection()` in bulk `proceed()` runs regardless of outcome. If all promotes fail (e.g., safe-mode), selection is cleared AND nothing is saved — user loses their selection and the retry target. Pre-B-059 behaviour, but the soft-warn magnifies the pain (explicit approval + no result + no selection). | On `safeModeHit === true` or `failures === tabIds.length`, skip `_clearSelection`. Out of scope for B-059 proper; file as follow-up. |
| B-059 L-10 (qa) | `sidepanel/sidepanel.js:554` | Default `heading` is hard-coded `'Delete Bookmark?'`. With the new multi-purpose dialog, any future non-delete caller that forgets `heading` gets a delete heading on a non-delete dialog. Both B-059 callers pass `heading` explicitly. | Throw in dev builds when `heading` omitted AND `variant !== 'destructive'`. |

### UAT scenarios

Manual test plan for [test-engineer] in R5. Run against Edge (user's browser, per memory) with the extension loaded unpacked. Every case must PASS before sprint close.

**Happy path**
- UAT-1 (T-1): Save a unique tab from Open-Tabs context menu → no dialog; tab promoted; appears in target group.
- UAT-2 (T-4): Select 3 unique open-tab rows → bulk "Move to group" → no dialog; 3 items created.

**Soft-warn path**
- UAT-3 (T-2): Save a tab whose URL already exists → dialog appears with `role="alertdialog"`, heading "URL already saved", body cites existing title + group label, confirm button is blue (primary) NOT red, label "Save anyway". Click "Save anyway" → second item created; focus returns to Open-Tabs row.
- UAT-4 (T-3): Same setup; press Escape → dialog closes; no item created; focus returns to trigger row.
- UAT-5 (T-5): Select 5 tabs (2 duplicates, 3 unique) → bulk Move → dialog "2 of 5 tabs already saved", button "Save all 5", blue. Confirm → 5 promotes; 5 new items.
- UAT-6 (T-6): Select 3 tabs all duplicates → bulk Move → dialog "3 of 3 …" → Cancel → no items created. (Note L-9: selection is still cleared.)

**A11y**
- UAT-7: Keyboard-only. Right-click row → Tab through options → select duplicate group → dialog opens with focus on Cancel. Tab cycles Cancel → Save anyway → wraps to Cancel (never leaves). Shift+Tab backward. Enter on Cancel = close; Enter on Save anyway = promote.
- UAT-8: Screen reader (NVDA / Narrator on Edge). On dialog open, announce reads heading → body (existing title + group label) → action buttons. `aria-describedby="confirm-body"` must be announced.
- UAT-9: Contrast. Primary button on `--accent` light (#2563eb / white text ≈ 4.86:1 — WCAG AA PASS) vs dark (#60a5fa / white text ≈ 2.77:1 — **WCAG AA FAIL** for normal-size text). This is a pre-existing `--accent` token issue, but B-059 creates the first primary-in-destructive-slot caller, so it's the first time a *confirm-dialog* button exposes it. Flag for [product-manager]: either darken the dark-theme accent, or accept as known token defect and file separately.
- UAT-10: Reduced motion. No animation added to the dialog — safe.

**State coverage**
- UAT-11: Safe mode. Force safe mode (stored schema version > `KNOWN_VERSION`) → trigger duplicate save → dialog shows; confirm → toast "Cannot save while in safe mode"; no item created; no dialog regression.
- UAT-12: Empty `_cachedItems` on fresh install → context-menu save of any tab → no dialog (pre-check returns null), promote dispatched directly.
- UAT-13: Stale menu. Open context menu on tab T; close T in another window; pick a group. Handler dispatches, SW returns `ERR_NOT_FOUND`, toast "Couldn't save tab — try again". No crash.
- UAT-14: Mid-dialog broadcast (M-1). Open duplicate-warn dialog; in another window create a tab that triggers an `items`-scope broadcast → `renderAll` runs underneath. Dialog remains visible and functional; Confirm dispatches. Note the cosmetic staleness per M-1.
- UAT-15 (T-8): Fragment-only. Saved `https://example.com#intro`; open `https://example.com#methods`; Save → soft-warn SHOULD fire. Confirm body cites the existing item title.
- UAT-16 (T-8 adjacent): Trailing slash. Saved `https://example.com`; tab URL `https://example.com/` → soft-warn should fire.
- UAT-17: 50-duplicate bulk. 50 open tabs all matching saved items; Select all; bulk Move. Heading "50 of 50 tabs already saved"; button "Save all 50". Verify copy doesn't overflow the modal; verify pre-scan perf feels instant.

**Regression**
- UAT-18: Delete an item via row action → existing confirm dialog shows with RED "Delete" button (variant default restored). No leak of primary-blue from a prior duplicate-warn open. Critical regression check — `dataset.variant` is always written, should be safe.
- UAT-19: Bulk Remove 3 items → dialog "Remove 3 items?" with RED confirm.
- UAT-20: Group delete confirm (at `:3072` and `:3173`) → RED destructive treatment.

### Verdict

**CONDITIONAL PASS** — 0 CRITICAL, 0 HIGH, 4 MEDIUM, 10 LOW. Core soft-warn flow meets M-tier DoD: T-1..T-6 and T-10 covered, `role="alertdialog"` + `aria-labelledby` + `aria-describedby` wired correctly, primary-variant CSS swap applied via `data-variant` on every open (regression-safe), Escape-to-cancel + trigger-focus-restore intact.

Recommended fixes BEFORE closing B-059:
- **M-4** (bind T-7 to the real dispatcher) — small; closes the biggest R5 gap the agent's own test-file header acknowledges.
- **L-6** (verify T-8 + T-9 coverage, add reference comments) — documentation only. Overlaps [code-reviewer] M-2.

Deferrable with explicit backlog entries:
- **M-1** (mid-dialog broadcast staleness) — document acceptance per §29.3.1 or add a re-render hook.
- **M-2** (Cancel → retry friction) — UX polish.
- **M-3** (test-file reproduces logic) — house style; revisit when a shared module is extracted.
- All LOW — file as nits.

**Blocking UAT gate**: if UAT-9 (dark-theme contrast) fails 4.5:1 on the primary button, that is a new WCAG AA regression introduced by B-059 at this specific call site. Either (a) swap `--accent` for a higher-contrast token in `[data-variant="primary"]` on the dark theme, or (b) accept as pre-existing `--accent` defect and file separately. Needs [product-manager] call before ship.

---

## Sprint 15 — B-061 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js` | `UNSAVABLE_SCHEME_PATTERN` is a UI-policy twin of `ALLOWED_URL_SCHEMES` in `shared/url.js`. The two constants encode the same policy from opposite directions (allowed set vs. rejected set) and will drift silently if a new scheme is added to one without updating the other. The comment in `url.js` already calls out the opaque-scheme sync risk; this is a second such surface. | Consider exporting a `isUnsavableScheme(url)` helper from `shared/url.js` derived from `ALLOWED_URL_SCHEMES` (e.g. try-parse + `!ALLOWED_URL_SCHEMES.has(parsed.protocol)`), or at minimum add a comment cross-referencing the two constants. Keeps the policy in one place and eliminates silent-drift risk. |
| M-2 | `tests/b061-unsavable-dim.test.js` (lines 95–104) | `patchRow` in the test stub clears `title` by setting `row.title = ''` (an empty string assignment), but the real `_patchOpenTabRow` in `sidepanel.js` calls `row.removeAttribute('title')`. The two behaviors are observably different: an empty `title` attribute is still present in the DOM and may surface a blank browser tooltip on hover, whereas `removeAttribute` removes it entirely. The test passes under the stub but does not exercise the actual cleanup path. | Align either the stub (change `row.title = ''` to a `removeAttribute` call, updating the assertion to check `row.getAttribute('title') === null`) or document the intentional simplification with a comment explaining the stub's limits. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.css` (lines 1227–1244) | The B-061 CSS block has no newline between the closing brace of the opacity rule and the opening of the `.item-title` / `.item-url` compound selector, unlike the surrounding rules which all have a blank line between them. Minor but inconsistent with the file's formatting convention. | Add a blank line between `.item-row[data-live-only="true"][data-unsavable="true"] { opacity: 0.55; }` and the following compound selector. |
| L-2 | `tests/b061-unsavable-dim.test.js` | No test case covers a URL with leading whitespace (e.g., `' javascript:alert(1)'`). The real `chrome.tabs` API can theoretically return a URL with a leading space if the page reports a malformed `location.href`. `_isUnsavableScheme` would return `false` for such input (regex is anchored at `^`), so those rows would NOT be dimmed — which is arguably correct, but the behavior is undocumented and untested. | Add one test asserting `_isUnsavableScheme(' javascript:alert(1)') === false` with a comment explaining that leading whitespace is not trimmed (consistent with how `ALLOWED_URL_SCHEMES` checks via `new URL()` which does strip whitespace — a cross-module inconsistency worth noting). |
| L-3 | `sidepanel/sidepanel.js` (line 328) | `UNSAVABLE_SCHEME_PATTERN` is a module-level `const` defined inside the function comment block for `buildOpenTabRow`, far from the other module-level constants at the top of the file. A reader scanning the constants section will miss it. | Hoist `UNSAVABLE_SCHEME_PATTERN` to the module-level constants section near the other pattern/scheme definitions, with a cross-reference comment to `ALLOWED_URL_SCHEMES` in `shared/url.js`. |
| L-4 | `tests/b061-unsavable-dim.test.js` (line 66) | The lookalike test checks `'javascripts:foo'` and `'database:foo'` — good anchoring tests. However, `'javascript:'` (colon with empty body) is not tested. This is a valid `javascript:` URL in some browser contexts and the regex correctly matches it, but adding it as an explicit positive case would document the boundary. | Add `assert.ok(_isUnsavableScheme('javascript:'))` to the pattern correctness section. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 4 LOW. The implementation is correct and safe. The core pattern, DOM contract (build + patch), attribute cleanup, and CSS selector are all sound. M-1 (policy drift risk between `UNSAVABLE_SCHEME_PATTERN` and `ALLOWED_URL_SCHEMES`) and M-2 (test stub uses empty-string assignment instead of `removeAttribute`, masking a real behavioral difference) are the only items that should be addressed before merge. All LOW items are nits and can be deferred. Fast Track DoD items 1, 2, 3, 7, 8, 9 are satisfied.



---

## Sprint 15 — B-061 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._ No new SW-gate bypass, no XSS surface, no new permissions. The regex is anchored and not subject to ReDoS. Any regex "miss" (e.g., leading whitespace `  javascript:...`) results in a non-dimmed row whose Save action is still hard-rejected by `ALLOWED_URL_SCHEMES` in `background/messages/storage-handlers.js` — the authoritative gate. Dimming is pure visual cue; no new code path touches storage or message dispatch. `row.title` is a hardcoded literal (`'Cannot be saved — unsupported URL scheme.'`), no user-provided string concatenation — no title-attribute XSS vector. No PII in tooltip.

### LOW
| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:1594, 1781` | Regex won't catch URLs Chrome itself normalizes but that a race-condition cold-start payload might report with leading whitespace or trailing junk before the colon (e.g., `"\tjavascript:..."`). Chrome's `tabs` API virtually never surfaces such strings — informational only. | Optional: trim the URL before testing, or leave as-is (SW still rejects at save time). Accept as-is. |
| L-2 | `sidepanel/sidepanel.js:1598, 1785` | Tooltip em-dash encoded as `\u2014`; no i18n layer. | Defer — no i18n infra exists in the project. |
| L-3 | `sidepanel/sidepanel.js` | Story explicitly says "dimming ≠ disabling" — user can still right-click a dimmed row and pick a group from the save-select; SW returns `ERR_VALIDATION`, caller shows the "Cannot save this tab" toast (`sidepanel.js:3412`). This is the documented intended flow per §29.3.1 neighbor (B-059). UX is consistent. No finding. | None. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (all deferrable / informational). B-061 is a pure-rendering visual affordance that layers ON TOP of the authoritative SW allowlist gate. No new attack surface. Regex is safe, tooltip is hardcoded, no user data in attributes. Defense-in-depth intact: even if the dim-check mis-classifies a URL, the SW still rejects `javascript:` / `data:` at save time. Ship.

---

## Sprint 16 — B-063 [code-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:3725–3729` | The `window.blur` listener is registered unconditionally at module load with no cleanup path. For the current architecture (single sidepanel, no programmatic teardown) this is harmless, but if B-035 (standalone window) ever creates a second sidepanel instance in the same window context the listener accumulates. | No action for B-063 — the B-035 forward-checklist note in `BACKLOG.md` already flags this. Confirm at R6 that the note is committed to B-035's AC. |
| L-2 | `tests/b063-blur-close.test.js` | AC2 ("no hover-driven close") is not tested. It is a pure negative / UAT-only AC (verify in browser that `mouseleave` does not close), so automated coverage is legitimately not possible in the JSDOM shim. | Mark explicitly in the test file header that AC2 is UAT-only, consistent with documentation practice on other shim-based tests. |
| L-3 | `tests/b063-blur-close.test.js:127–152` | AC3 invariant test rewires `onBlur` as a local closure that inline-copies the blur handler logic rather than calling `w.onWindowBlur`. This is correct for ordering verification, but the test and the handler can silently diverge if the handler's body is later refactored. | Acceptable for a shim-based test; no code change required. Informational only. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (all informational/deferrable). AC3 ordering invariant (`_contextMenuTriggerRow = null` before `closeContextMenu()`) is correct in both the implementation and the dedicated ordering test. AC7 idempotency early-return is present. No dead code, no stray `console.log`, no commented-out blocks. Test suite covers AC1, AC3, AC4, AC5, AC6, AC7, AC8; AC2 and AC9 are appropriately UAT-only and forward-checklist respectively. B-063 is clear to proceed to [security-reviewer].

---

## Sprint 16 — B-063 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:3725` | `window.addEventListener('blur', ...)` scope verified: the side panel runs as a top-level extension document (`sidepanel.html` as `default_path`), so `window` is the side panel's own realm — no iframe/frame leakage. Pages in other tabs cannot programmatically force focus away from the side panel (blur is user-gesture-driven in practice). Informational. | None. |
| L-2 | `sidepanel/sidepanel.js:3726–3728` | Handler only reads `contextMenuEl.hidden`, nulls `_contextMenuTriggerRow`, and calls `closeContextMenu()`. It does NOT invoke any menu action (delete / move / save / promote), so a hypothetical programmatic blur cannot be weaponized into a destructive operation. Confirmed in diff. | None. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (informational). Thin UX-only surface: one `window.blur` listener that dismisses a menu. Confirmed: no `console.*` additions (no PII leakage of URLs/titles/group names), no new `manifest.json` permissions, no manifest changes, no new message contracts, no storage writes. Handler is dismiss-only — it never dispatches a menu action, so blur cannot be used as a bypass vector against the confirm-dialog / allowlist / selection guards. Dialog and filter state are explicitly untouched (AC5/AC6 preserved → no form-state leakage). Ship.

---

## Sprint 16 — B-048 [code-reviewer]

Files inspected: `sidepanel/sidepanel.css` (net +56/-21), `sidepanel/sidepanel.js` (~+90 net), `tests/b048-visual-states.test.js` (new, 459 lines, 25 tests), `docs/a11y-audit-B-048.md` (new, 236 lines). Git diff scoped to B-048-tagged changes only.

### CRITICAL
_None._

### HIGH

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `sidepanel/sidepanel.css:1257` | **Hardcoded `stroke='white'` in the checked-state checkmark SVG data URL is below WCAG AA 3:1 in dark theme.** In dark theme `--selected-border` is `#60a5fa`; white (`#ffffff`) on `#60a5fa` yields approximately 2.9:1 — below the WCAG AA 3:1 non-text threshold. The `a11y-audit-B-048.md` audit does not include a row for the checkmark icon stroke itself, so the gap is not documented as accepted. The audit captures the white stroke for light theme where `--selected-border` is `#2563eb` (approximately 4.8:1 — PASS), but the dark-theme case is absent. This is the most visible affordance when a row is selected in dark theme. | CSS custom properties cannot be interpolated directly into `url()` data URIs. The fix is a second `.item-select[aria-checked="true"]` rule block scoped inside the existing dark-theme `prefers-color-scheme: dark` media query (and the forced-dark attribute block) that overrides `background-image` with a freshly-encoded SVG using `stroke='%230a0f1a'` (the `--on-accent` dark value, URL-encoded). Alternatively introduce a `--checkbox-check-color` token with per-theme values and accept a two-rule solution. |

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:1957` | **`_createItemSelect` sets `aria-hidden="false"` which causes double-announcement on tree-traversal screen readers.** The JSDoc at line 1945 states "AT composes the role + state when focus is on the parent row" — accurate for focused-row traversal, but `aria-hidden="false"` is an explicit in-tree signal meaning AT in browse/reading mode also traverses into the child and announces `role="checkbox"` independently of the row label. The row `aria-label` already appends ", selected" via `_buildItemRowAriaLabel`, making the child announcement redundant. The Gmail pattern this implementation references works precisely because the child checkbox is hidden from AT (`aria-hidden="true"`) and the row label carries the state. The test at `tests/b048-visual-states.test.js:240` asserts `aria-hidden === 'false'` and will need updating. | Change `span.setAttribute('aria-hidden', 'false')` to `span.setAttribute('aria-hidden', 'true')` at `sidepanel.js:1957`. Update the test assertion at `b048-visual-states.test.js:240`. No information loss: the row `aria-label` already communicates "selected" state. |
| M-2 | `tests/b048-visual-states.test.js:36–44` | **`_buildItemRowAriaLabel` is reproduced verbatim in the test file, testing its own copy rather than the production function.** The file header acknowledges this but frames it as a contract guard. The causality is reversed: renaming a flag label in production passes the tests because the test copy is independent. This is the same pattern flagged as B-059 M-3. | Extract `_buildItemRowAriaLabel` to `shared/aria-label.js` and import it in both `sidepanel.js` and the test. The function is 4 lines of pure logic with no DOM or Chrome API dependencies. If extraction is deferred, rename the test helper to `_buildItemRowAriaLabelCopy` and add a cross-reference comment with the exact source line it mirrors. |
| M-3 | `sidepanel/sidepanel.js:1975–1976` | **`_buildItemRowAriaLabel` lacks an explicit null-item guard, creating implicit coupling with every call site.** The `(item && item.title) \|\| 'Untitled'` expression handles undefined item, but correctness depends on all four call sites doing their own null-check (which they do today). A future call site that omits the guard silently produces `'Untitled'` with no error. | Add `if (!item) return 'Untitled';` as the first line of `_buildItemRowAriaLabel` so the null-item contract is owned by the function, not delegated to each call site. |
| M-4 | `tests/b048-visual-states.test.js:69–80` | **Test `querySelector` shim is documented as supporting `.class` selectors only, with no error when an unsupported selector type is used.** All current usages are `.class` selectors and the limitation is documented. A future PR adding an attribute or compound selector inside a reproduced function branch would silently return `null` with no test error. | Add a prominent comment at the shim class definition (line 69): `// LIMITATION: only .class selectors supported. Attribute/compound selectors return null silently — extend shim before testing those paths.` Documentation-only; no code change required. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `sidepanel/sidepanel.css:1230–1243` | `.item-select` has `flex: 0 0 18px` (flex-basis 18px) but `width: 14px`. The 4px gap provides lateral padding to prevent layout shift (AC6), but is implicit. A future maintainer adjusting the visual width may not realize the flex-basis must also change. Add a comment: `/* flex-basis 18px > visual width 14px: lateral padding keeps AC6 no-reflow guarantee — adjust flex-basis if width changes */`. |
| L-2 | `sidepanel/sidepanel.js:2016` and `:2231` | `_createItemSelect(false)` is always called with `false` at both build sites because `_setRowSelected` owns the checked-state transition. The `selected` parameter is dead at the only two call sites. Consider removing the parameter and hardcoding `aria-checked="false"` internally, with a comment pointing to `_setRowSelected` as the state owner. |
| L-3 | `tests/b048-visual-states.test.js` | A null-item test case is absent. If M-3 above is implemented, add `assert.equal(_buildItemRowAriaLabel(null, undefined, undefined, false), 'Untitled')` to explicitly document and protect the null-item contract boundary. |
| L-4 | `docs/a11y-audit-B-048.md` | The audit table is missing a row for the `.item-select[aria-checked="true"]` checkmark stroke contrast (white on `--selected-border`). The table covers background/text pairs thoroughly but omits this new non-text indicator. Adding the row would surface H-1 as a documented gap rather than an uncaught blind spot, and demonstrate due diligence for the new affordance. |
| L-5 | `sidepanel/sidepanel.css:1207–1209` | The comment above `.item-row[data-selected="true"]` says "CSS allows only one `outline` per element; the focus ring is prioritized." The mechanism is compositional, not competitive: `box-shadow: inset` and `outline` compose on the same element; the inset shadow renders behind the outline. Revise to: `/* swap outline -> box-shadow: inset so the :focus-visible outline (which draws on top of box-shadows) visually overlays the selection border instead of being hidden beneath it */`. |

### Verdict

**1 HIGH, 4 MEDIUM, 5 LOW. H-1 and M-1 must be resolved before R5.** Core architecture is sound: `_buildItemRowAriaLabel` is a pure function called consistently at all 4 sites and handles `undefined` live/drifted state gracefully. `_createItemSelect` is correctly called from both `buildItemRow` and `buildOpenTabRow`. The old `::before` pseudo-element is completely removed with no stray selectors. The outline-to-inset-box-shadow swap stacks correctly with the `:focus-visible` outline. AC7 concat order is correct and validated by the 32-combo test sweep. Icon factories use `aria-hidden="true"` — no double-announcement from that direction. The `_setRowSelected` patch path is trivially within the AC8 budget. H-1 is a WCAG AA compliance failure for the most visible selected-state affordance in dark theme. M-1 contradicts the Gmail accessibility pattern the implementation explicitly cites.

---

## Sprint 16 — B-062 [security-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. Purely visual CSS change. Confirmed against security lens:
1. **No permission changes** — `manifest.json` not touched; zero new permissions.
2. **No new user-input surface** — no interactive handlers, inputs, or form fields added. Focus-visible outline is a passive visual indicator.
3. **No dynamic content** — `--on-accent` token values are hardcoded literals (`#ffffff` light, `#0a0f1a` dark) in all 4 theme blocks; no `attr()`, no `env()`, no user-controlled computation.
4. **No JavaScript changes in scope** — `sidepanel/sidepanel.js` diff is B-063 only (separate item, separately reviewed); B-062 touches CSS exclusively.
5. **Audit file integrity** — `docs/a11y-audit-B-062.md` is documentation; no executable content, no script tags, no embedded iframes.
6. **No new manifest file references** — zero additions to `chrome_url_overrides`, `content_scripts`, `web_accessible_resources`, `default_path`, or `default_popup`.
7. **Pre-seed scope-creep note** — `--selected-bg` / `--selected-border` tokens already exist on `release/v2` (not introduced in this diff); no net change from B-062.
8. **XSS/CSP posture unchanged** — no `innerHTML` paths touched, no CSP relaxation, no new `style=` attributes injected.

Zero attack surface. Ship.

---

## Sprint 16 — B-062 [code-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.css:262` | `.empty-state-cta:hover` still uses hardcoded `color: #ffffff`. This is a primary-button-style hover state on an accent background (`--accent-hover`) — the same class of contrast failure B-062 was created to fix. In dark theme `#ffffff` on `#93bbfd` is 1.78:1, a WCAG AA fail. Out of scope for this item's ACs, but the `--on-accent` token introduced here is precisely the fix. | Replace `color: #ffffff` with `color: var(--on-accent)` on `.empty-state-cta:hover`. Raise as a follow-on AC or fold into a B-062 patch before close. |
| M-2 | `sidepanel/sidepanel.css:1332,1339` | `.window-filter-chip[aria-selected="true"]` and its `:hover` variant both hardcode `color: #ffffff` on `var(--accent)` / `var(--accent-hover)` backgrounds. Same dark-theme contrast failure pattern (2.41:1 default, 1.78:1 hover). The B-062 audit §2 grep is scoped to `.dialog-btn` selectors only — these chip call-sites were not in scope for AC9, but they are now visibly inconsistent with the newly-tokenised button rules and carry the same AA failure in dark mode. | Replace both with `color: var(--on-accent)`. Raise as B-062 follow-on or queue as a standalone XS item. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `docs/a11y-audit-B-062.md:27` | The grep source path is hardcoded to an absolute machine-local path (`/Users/courtney.d.wenman/workspaces/fun/junkie/...`). The audit is a committed doc that other contributors will read. | Replace with a repo-relative path. Low priority — no functional impact. |
| L-2 | `sidepanel/sidepanel.css` (scope-creep) | `--selected-bg` and `--selected-border` pre-seeded in all 4 theme blocks and consumed by `.item-row[data-selected="true"]`. These are planned for B-048 R2 §31.7. Values are visually identity-preserving and the token contract is additive, so no regression. However the change is undocumented in this item's audit and `SPRINT.md` files-changed list. B-048 R3 will inherit these values without knowing they originated in B-062. | Accept the scope-creep (see Verdict). Add a one-line note to `docs/a11y-audit-B-062.md` §8 and `SPRINT.md` handoff notes: "Pre-seeded `--selected-bg`/`--selected-border` for B-048; values are identity-preserving stubs." |

### Verdict

**PASS WITH MEDIUM NOTES** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (out-of-scope hardcoded-color AA failures surfaced by the audit; not regressions introduced by this item), 2 LOW. The core B-062 fix is correct and complete: `--on-accent` token is defined in all 4 theme blocks, both primary-button selectors are tokenised, light-theme visual identity is preserved, focus-ring contrast passes 3:1 non-text AA (audit §6), call-site coverage confirmed for the three dialog surfaces (AC9), and the test suite is unaffected (CSS-only change, 617/617). The two MEDIUM findings are pre-existing dark-theme contrast failures on `.empty-state-cta:hover` and `.window-filter-chip[aria-selected]` that the audit's scoped grep did not surface — they should be raised as a follow-on item or patched before sprint close. Scope-creep (`--selected-bg`/`--selected-border` pre-seed): **accept** — the token values are additive and identity-preserving, B-048 R3 retains full authority to refine them, and reverting would produce noise with no safety benefit. Document the pre-seed in handoff notes.

---

## Sprint 16 — B-029 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:712` | **CSS-class construction from data without explicit allowlist at the render boundary.** `chip.classList.add('group-color-' + row.color)` concatenates `row.color` into a class name. Today this is safe because `background/storage/groups.js:39` enforces `GROUP_COLORS.includes(color)` on every create/update, so only 9 fixed slugs can ever reach storage. However the picker render path has no defensive check of its own — if a future SW regression, a pre-validation schema migration, or a direct `chrome.storage` write ever seeds an unsanitized color value, the picker becomes a CSS-class-injection vector (e.g. `"blue; } body { display:none"` — benign under CSP but would cover arbitrary selector tokens). Defense-in-depth: the render surface should not trust storage validation alone. | Gate the concat with an inline allowlist check, e.g. `if (GROUP_COLORS.includes(row.color)) chip.classList.add('group-color-' + row.color);`. Same treatment for the sibling call at `sidepanel.js:1687` (pre-existing, out of scope for B-029 but worth a follow-on LOW). |
| M-2 | `sidepanel/sidepanel.js:704` | **Counts are interpolated via string concat** (`row.savedCount + ' saved, ' + row.openCount + ' open'`) into `textContent`. `textContent` is safe against HTML injection, but `savedCount` / `openCount` originate from `_cachedItems.length` math and `_cachedLiveStates[id].live` boolean coercion — both sourced from storage/SW broadcasts. If a malformed storage payload ever caused `savedByGroup.get(key)` to return a non-number (e.g. `"[object Object]"`), the row would render confusing UI instead of a count. Not an XSS vector; is a robustness gap. | Coerce to integers at the render boundary: `Number(row.savedCount) || 0`. Or assert shape in `_buildGroupPickerRows`. |
| M-3 | `sidepanel/sidepanel.js:241` (handler at L586, via broadcast path) | **`_clearSelection()` now calls `closeGroupPickerDialog()` unconditionally.** The picker is a dialog (not a context menu) and was meant to survive selection changes. A `MSG_STATE_CHANGED` broadcast that triggers `_clearSelection()` (e.g. concurrent item delete from another surface) will now silently dismiss an open picker mid-interaction, discarding the user's typed filter query and their onSelect intent. Not a security issue per the scoped lens, but it IS a message-passing robustness concern: the callback `_groupPickerOnSelect` is zeroed before the user can confirm, and the trigger element focus is restored to a stale row. | Scope `closeGroupPickerDialog()` in `_clearSelection()` to the legacy bulk-move-picker case only (i.e. close only if the picker was opened for a selection-scoped flow; keep it open for B-027 "Move items out of group" which operates on a fixed groupItems snapshot). At minimum, document the trade-off in a code comment so future callers don't assume picker survives broadcasts. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:579` (header comment) | **The `openGroupPickerDialog` JSDoc contract does not declare the trust boundary** — callers are free to pass any `triggerEl` / `sourceGroupId` without validation. A future caller misuse (e.g. passing a detached DOM node as `triggerEl`) will `focus()` into nothing on close; silent UX failure, not a security bug. | Add a one-line `@contract` note: "All inputs are assumed trusted (sidepanel-internal). Picker does not re-validate." |
| L-2 | `sidepanel/sidepanel.js:239` (`try { callback(groupId); } catch {}`) | **Silent swallow of onSelect errors.** The caller (B-027 Move-out, B-024 bulk move, B-028 selection menu, B-059 Open-Tabs save) handles its own error surfacing, but a bug inside those callbacks that throws synchronously (not via a rejected Promise) is lost without any telemetry. Low severity — no user-data leak, no state corruption — but an unnoticed bug here could hide data-loss regressions. | Minimal: `catch (err) { console.warn('[tab-junkie] group-picker onSelect threw:', err?.message); }`. Do NOT log `err` directly (may contain item names/URLs — PII per §Privacy). |
| L-3 | `sidepanel/sidepanel.js:796` (`row.hidden = !match`) | **Client-side filter does not strip combining/invisible Unicode** before `includes()` comparison. Group names are user-provided; a group named with zero-width joiners or RTL override marks will match unexpectedly (or fail to match the user's visually-identical query). Not exploitable — just a usability edge case. | Accept as-is (v1 scope). Document in a comment or defer to a future normalization helper. |
| L-4 | `sidepanel/sidepanel.js:853` (dialog keydown listener, `capture: true`) | **Capture-phase listener on `groupPickerDialogEl`.** This correctly intercepts Escape before the global handler runs, but capture-phase listeners are invisible in devtools "event listeners" panel in older Chromium versions — a future maintainer could add a conflicting `keydown` listener on the dialog without realizing the capture listener pre-empts it. | Add a code comment at the attachment site: "capture: true intentional — picker owns Escape / Tab / Arrow routing; see AC4". |
| L-5 | `sidepanel/sidepanel.html:168` (dialog markup) | **The picker markup uses `aria-labelledby="group-picker-heading"`** but the heading text is overwritten on every `openGroupPickerDialog` call (L838). Screen readers that cache the accessible name at dialog-open time will read the correct label; those that re-query on focus will also be fine. No security concern — accessibility hardening only. | No action; flagged for completeness. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 5 LOW. The security-critical surfaces are clean: (1) all user-provided strings (`row.name`, `row.breadcrumb`, empty-state message) reach the DOM exclusively via `textContent` (L718, L722, and the hardcoded HTML string `<p>No groups yet &mdash; create a group first.</p>` which contains no interpolation); (2) the filter input is used only for `String.prototype.includes` (sidepanel.js:788) and is never echoed to HTML; (3) the CSS-class construction at L712 is currently sound because `GROUP_COLORS` validates at storage write time (`background/storage/groups.js:39`) — M-1 flags this as defense-in-depth; (4) `MSG_BULK_UPDATE_ITEMS` payload from the new B-027 Move-out path is properly shaped (`ids: groupItems.map(it => it.id)` — array of storage-validated strings; `patch: { groupId: targetGroupId }` where `targetGroupId` originates from `rowEl.dataset.groupId`, coerced to `null` for the empty-string sentinel); (5) no `manifest.json` changes (`git diff --name-only` confirms); (6) no new `console.*` log statements added by B-029 — the existing `console.warn` calls at L2244/L2297/L2989/L3016/L3037 are pre-existing B-011/B-015 paths untouched by this diff; (7) focus-trap, overlay-click, and Escape handling are consistent with the existing `openConfirmDialog` / `openBookmarkEditDialog` pattern and do not expose new cross-origin focus vectors (browser-level guarantee applies unchanged); (8) no new message types introduced — existing `MSG_UPDATE_ITEM` / `MSG_BULK_UPDATE_ITEMS` / `MSG_PROMOTE_TAB` contracts unchanged. No blockers for R5. Recommend addressing M-1 (allowlist defense) and M-3 (broadcast-dismiss semantics) before sprint close; M-2 and all LOWs can defer.

---

## Sprint 16 — B-029 [code-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:842–850` | `_onGroupPickerKeydown` Tab handler has a **dead-branch bug**: both `active === groupPickerFilterEl && !e.shiftKey` and `active === groupPickerFilterEl && e.shiftKey` focus `groupPickerListEl`. Shift+Tab from the filter should cycle backward, but instead sends focus to the listbox in both directions. The trap is functionally a 1-stop loop, not a 2-stop cycle as documented in the comment. Shift+Tab from the filter cannot reach the Create-group button in the empty state, stranding keyboard users when the empty state is visible. | `if (active === groupPickerFilterEl && e.shiftKey)` branch should call `groupPickerListEl.focus()` only if there is no focusable button below (e.g. `groupPickerCreateBtnEl`), or restructure to explicitly distinguish forward/backward Tab so the empty-state create-btn is reachable. |
| M-2 | `sidepanel/sidepanel.html:175` + `sidepanel/sidepanel.js:760–766` | The `role="listbox"` container has no `aria-activedescendant` attribute. The ARIA 1.2 listbox pattern requires the container to advertise the active option via `aria-activedescendant` when it does not use a roving `tabindex` strategy. Here the container holds `tabindex="-1"` with options also at `tabindex="-1"`, but the active item is communicated only by class and `aria-selected` on the child — with no `id` on the child and no `aria-activedescendant` on the container. Screen readers will not announce highlight changes when keyboard-navigating the list. | Assign an `id` to each rendered `group-picker-row` (e.g. `group-picker-row-${idx}`), then call `groupPickerListEl.setAttribute('aria-activedescendant', active.id)` inside `_setGroupPickerHighlight`, and clear it to `''` in `_resetGroupPicker`. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:957–963` | AC9 Create-group CTA closes the picker and shows a toast (`'Create a group from the + menu, then try again'`) because `openGroupCreateDialog` does not yet exist. The toast is an adequate MVP fallback given the dependency is out of scope per B-029's out-of-scope block. Severity is LOW (not MEDIUM) because no user data is lost, the picker closes cleanly, and the message is actionable. Track as a follow-on: when B-006 create-mode is wired, replace the toast branch with `openGroupEditDialog({ mode: 'create' })`. | Accept for now. Document the stub in `SPRINT.md` handoff notes and add a comment cross-referencing the B-006 backlog item so the next engineer finds it. |
| L-2 | `sidepanel/sidepanel.js:163–169` | `groupPickerColor` chip uses `.group-color-${row.color}` palette classes instead of `style.backgroundColor` per §30.5. This is intentionally cleaner (avoids inline style, reuses the established palette) but diverges from the R2 spec. The deviation is visually equivalent and lower maintenance. Accept, but [solution-architect] should ratify in R6 so the spec stays authoritative. | Record deviation in `docs/SOLUTION_DESIGN.md` §30.5 note during R6 close. No code change needed. |
| L-3 | `sidepanel/sidepanel.js:239` | `_confirmGroupPickerRow` swallows the callback error silently (`try { callback(groupId); } catch { }`). This can hide real bugs during development: if `_bulkMoveToGroup` throws synchronously (unlikely but possible), the error disappears without a toast. The catch is there to prevent an unhandled rejection, but there is no fallback user feedback path. | Add a minimal `showToast('Couldn\u2019t complete the move \u2014 try again')` in the catch body, or at minimum `console.error` in debug builds. |

### Verdict

**PASS WITH MEDIUM NOTES** — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW. The group picker primitive is well-encapsulated: 4 call-sites share a single open/close path, dead code (`_closeBulkMovePicker`, native `<select>` blocks) is cleanly removed with zero orphan references, `shared/` is untouched, `textContent` is used consistently for all user-supplied strings, the AC7 close-before-callback sequence is correct, and the F-1/F-3 guards (blur-close immunity, Escape stopPropagation with capture) are implemented correctly. The two MEDIUM findings are: a Tab focus-trap dead branch that makes Shift+Tab non-functional from the filter input, and a missing `aria-activedescendant` wiring that breaks screen reader list navigation. Both must be fixed before R5.

---

## Sprint 16 — B-029 [qa-reviewer]

### CRITICAL
_None_

### HIGH

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:956-967` (AC9 CTA) | **Broken flow — AC9 regression.** AC9 PASS criterion: clicking "Create group" closes the picker AND opens the B-006 create dialog. Current impl closes the picker and shows `showToast('Create a group from the + menu, try again')`. There is NO "+ menu" on the sidepanel header. A fresh-profile user clicks the CTA, sees a cryptic toast referencing a nonexistent surface, and is stranded. FE flagged this but classified it as adequate — it is materially different from AC9 PASS. [code-reviewer] L-1 softens it to LOW as an "MVP fallback"; disagree on severity — user-facing copy refers to a surface that does not exist, which is a shipped-bug in a core first-run flow. | Wire to `openGroupEditDialog` in create mode (B-006 already ships the dialog for edit; create-mode uses the same dialog without a preload). If dispatch is truly blocked, fix the toast copy to reference the real surface (e.g., "Right-click any existing group header and choose Edit, or create from the groups list"). Ship H-1 before R5. |
| H-2 | `sidepanel/sidepanel.js:2982-3039` (broadcast handler) vs picker lifecycle | **Stale-target race.** On `MSG_STATE_CHANGED` `scope: 'groups'` broadcast while picker is open (another window deletes/renames the highlighted group), `renderAll` overwrites `_cachedGroups` but the picker's rendered rows are NOT re-built and no guard prevents confirming a deleted row. `_confirmGroupPickerRow` dispatches `MSG_BULK_UPDATE_ITEMS` against a ghost target; the generic catch surfaces "Couldn't move bookmarks — try again" which hides the real cause. | On `scope === 'groups'` broadcast while picker is open, rebuild rows from fresh `_cachedGroups` (preserve filter text and highlighted group-id if still present) — stays zero-IPC per AC10. Alternative: pre-dispatch existence check in `_confirmGroupPickerRow` with targeted toast "That group was just deleted — pick another." |
| H-3 | `sidepanel/sidepanel.js:3303-3309` (`_bulkMoveToGroup` itemIds branch) + `:3516-3521` (B-027 Move-out) | **Safe-mode error hidden on move.** tabIds branch (L3264) translates `ERR_SAFE_MODE` → `'Cannot save while in safe mode'`. itemIds branch catches all errors into generic `'Couldn't move bookmarks — try again'`. Same flaw at the B-027 Move-out callback. Users in safe mode see misleading toast for callers 1/2/3 itemIds path. | Extract `_translateMoveError(err)` helper; inspect `err?.code === ERR_SAFE_MODE` and surface the correct toast at all three itemIds sites. |

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-M1 | `sidepanel/sidepanel.js:945-954` (list printable-key forward) | **Keystroke lost on first type.** AC4: "Typing while the list is focused forwards the keystroke to the search input". Impl focuses the input but does NOT inject the key — the first keystroke is dropped; user must re-press. | Append `e.key` to `groupPickerFilterEl.value` and dispatch `input` event to re-run `_applyGroupPickerFilter`. |
| Q-M2 | `sidepanel/sidepanel.js:904-911` (outside-click) | **No automated coverage for overlay click.** `tests/b029-group-picker.test.js` covers Arrow/Enter/Escape but not outside-click. Future refactor of the overlay DOM could silently trap users. | Add test: dispatch `click` on `dialogOverlayEl` with `ev.target === dialogOverlayEl`; assert picker closes and `onSelect` not called. |
| Q-M3 | `sidepanel/sidepanel.css:820-823` (`.group-picker-row--highlighted`) | **Highlight visibility ambiguous.** Pseudo-focus uses `--accent-subtle` background + `--focus-ring` 2px border. Hover uses `--bg-hover`; hovered+highlighted combos may be indistinguishable in light theme. AA contrast on the 2px border against `--accent-subtle` not quantified — may drop below 3:1 depending on resolved tokens. | Measure contrast in both themes. If ≥ 3:1, accept; else bump border to 3px or swap to `outline: 2px solid` over `--bg-primary`. [test-engineer] AA spot-check in UAT. |
| Q-M4 | `sidepanel/sidepanel.js:860-872` (open-guard invariant) | **`_dialogTriggerEl` clobber risk.** L867 guard (`if (!dialogOverlayEl.hidden) return;`) is the sole protection against the picker overwriting another dialog's trigger. Not currently reachable via any call path but fragile to future refactors. | Add `/* INVARIANT: picker can never open over another dialog — preserves _dialogTriggerEl */` comment at L867. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-L1 | `sidepanel/sidepanel.js:728-730` (counts template) | Rows render "0 saved, 0 open" for freshly-created empty groups — noisy in the common first-group case. | Hide counts span when both are zero, or render `"(empty)"`. |
| Q-L2 | `sidepanel/sidepanel.html:170` | Default heading HTML is "Move to group"; always overwritten at open time. Harmless but a test inspecting pre-open DOM could assert wrong text. | None; flagged for completeness. |
| Q-L3 | `tests/b029-group-picker.test.js` | Picker core logic is reproduced in-test rather than imported. Future refactor of `_buildGroupPickerRows` in `sidepanel.js` will not fail these tests (false-green risk). Matches b027 pattern. | Accept for Sprint 16; file tech-debt to extract core into `shared/group-picker-core.js`. |
| Q-L4 | `sidepanel/sidepanel.js:596-598` (header-comment) | Comment claims picker is "pure view over cached state — no IPC". True for the picker itself, but the sidepanel's broadcast handler still fires IPC in response to unrelated `scope: 'liveState' / 'items' / 'groups'` broadcasts during an open picker. AC10 still passes (picker itself issues none), but comment could mislead future readers. | Tighten wording: "picker itself issues no IPC on open or filter". |
| Q-L5 | `sidepanel/sidepanel.css:811-813` (row border) | `border: 2px solid transparent` placeholder keeps layout stable under highlight — good pattern. | None; noted. |

### UAT scenarios

14 proposed cases for [test-engineer] R5:

1. **U-1 Bulk bar — items only (AC1 caller 1)** — Select 3 saved items across 2 groups → bulk "Move to group" → pick target → items moved, selection cleared.
2. **U-2 Bulk bar — tabs only, save mode (AC1 + AC7)** — Multi-select 2 open tabs → bulk "Save to group" → pick target → verify B-059 soft-warn appears AFTER picker closes (no overlap), both tabs promoted on confirm.
3. **U-3 Group header — Move items out of group (AC1 caller 2 + AC5)** — Right-click group with 5 items → "Move items out of group" → heading "Move to group", source group absent → pick target → 5 items moved.
4. **U-4 Group header — disabled on empty group (AC1(b))** — Right-click zero-item group → action disabled/greyed.
5. **U-5 Selection menu — Move to group (AC1 caller 3)** — Multi-select 2 items, right-click → "Move to group" → no inline `<select>`, picker opens, target move succeeds.
6. **U-6 Open Tabs — Save with duplicate (AC1 caller 4 + AC7)** — Right-click open tab whose URL is already saved → "Save to group" → pick target → picker closes FIRST, then B-059 soft-warn; "Save anyway" creates duplicate, Cancel leaves no duplicate.
7. **U-7 Empty-profile CTA (AC9 — H-1 check)** — Fresh profile, no groups → trigger picker → click "Create group" → expect B-006 create dialog. Current impl shows toast referencing "+ menu" — records as FAIL until H-1 fixed.
8. **U-8 Keyboard-only walkthrough (AC4 + AC8)** — Enter on bulk button → focus on filter → ArrowDown advances (wraps) → Enter confirms → Escape cancels. Verify Shift+Tab direction (code-reviewer M-1 check) and printable-key doesn't drop first keystroke (Q-M1 check).
9. **U-9 100-group latency (AC3 + AC10)** — Seed 100 groups → Perf trace filter latency P95 < 50ms; verify zero IPC and zero storage writes during open+filter.
10. **U-10 Broadcast-during-open (H-2 check)** — Open picker in window A, delete highlighted target from window B → picker refreshes OR rejects with targeted toast.
11. **U-11 Safe-mode move items (H-3 check)** — Enable safe mode → bulk move items via picker → "Cannot save while in safe mode" toast (not generic).
12. **U-12 Blur-close isolation (F-1)** — Open picker → Alt-Tab away and back → picker still open; context menu blur-close still works.
13. **U-13 Source-group exclusion (AC5)** — B-027 menu on "Work" → "Work" absent; bulk bar → "Work" present.
14. **U-14 ARIA / a11y audit (AC8 + code-reviewer M-2 activedescendant)** — axe-core or NVDA/VoiceOver: `role="dialog"` + `aria-modal` + `aria-labelledby` + listbox/option + exactly one `aria-selected="true"` + focus-ring ≥ 3:1 + screen-reader announces highlight changes on ArrowDown.

### Verdict

**CONDITIONAL PASS — block on H-1, H-2, H-3.** 0 CRITICAL, 3 HIGH, 4 MEDIUM (qa-specific, non-overlapping with code/security reviewer MEDIUMs), 5 LOW. Architecture is solid: modal primitive cleanly separated from 4 callers; B-059 handoff sequence correct and invariant-tested; ARIA listbox structure matches AC8; AC5 source-exclusion works; O(n) filter with pre-lowered search keys meets AC3; B-027 new action correctly bypasses `_bulkMoveToGroup` to avoid selection side effects; B-063 blur-close properly scoped to context menu only (F-1 verified). Blockers: **(H-1)** AC9 CTA advertises a non-existent "+ menu" — ships a broken first-run flow. **(H-2)** Broadcast races dispatch bulk-move to deleted group-ids; generic catch masks the failure. **(H-3)** Safe-mode toast inconsistency between tab-save and item-move paths. All three are user-facing regressions against explicit ACs or known error handling patterns. MEDIUMs (keystroke injection Q-M1, outside-click coverage Q-M2, highlight contrast Q-M3, invariant comment Q-M4) should be addressed before R5 UAT; LOWs can defer. With H-1/H-2/H-3 fixed, B-029 passes into R5.

---

## Sprint 16 — B-048 [qa-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-M1 | `sidepanel/sidepanel.js:2082` (buildItemRow indicators branch) | **AC2 coexistence gap on non-live saved item that is drifted**: `_ensureIndicators` / first-paint branch only appends `.item-indicators` when `needsAudible || needsDrifted || needsWindowBadge` is true. Verified this path; OK. However a drifted+audible row where `live?.live=false` (drift persists after tab close) still paints correctly only because drift itself qualifies. No bug — but add a test for `drifted && !live` at first paint to lock AC2 against future regressions. | Add one additional test case to `b048-visual-states.test.js` covering `buildItemRow` with no live + drift truthy (currently the AC1 drifted test uses `live: true`; no test exercises drift-without-live at the buildItemRow level). |
| Q-M2 | `sidepanel/sidepanel.js:1475-1491` (`_setRowSelected`) | **Saved-item branch reads `_itemById`, patch-path (L.2588) reads `itemMap`** — two sources of truth for the same label rebuild. If `_itemById` is stale at the exact moment a user toggles selection immediately after a rename broadcast has not yet fired `_setItemByIdCache`, the label will reflect the old title for one frame. Not CRITICAL (self-heals on next MSG), but inconsistent with the "fresh wins" pattern used in the patch path. | Either (a) pass `item` into `_setRowSelected` callers (explicit freshness), or (b) document the staleness-window in `_setRowSelected`'s header comment and add a note that the label will re-settle on the next broadcast. |
| Q-M3 | `sidepanel/sidepanel.css:1248-1252` | **AC5 focus-visible on `.item-select` child**: the child carries `tabindex="-1"` (correct — non-tab-stop), but no CSS rule paints a focus ring on `.item-select:focus-visible` in case a future code path programmatically focuses the child (e.g. `_setActivedescendant`). Today no such call exists; if one is added the child will gain OS default focus (browser-specific, likely low-contrast) rather than the `--focus-ring` token. | Add `.item-select:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }` defensively, OR add a comment in `_createItemSelect` explicitly forbidding `.focus()` calls on this element. |
| Q-M4 | `sidepanel/sidepanel.js:2016, 2231` | **Open Tabs + saved-item rows both prepend `.item-select` as first flex child** — symmetry verified. However `buildOpenTabRow` does NOT call `_setRowSelected` on its initial render (the `isSelected` branch in `patchOpenTabsSection` at L.2402-2404 applies selection AFTER DOM insertion). If a concurrent keyboard gesture selects a tab row between `buildOpenTabRow` and `_setRowSelected`, the `aria-checked="false"` initial state is briefly seen by AT. Race window is sub-frame; low user impact. | Consider passing `isSelected = _selection.has('tab:' + tab.tabId)` into `buildOpenTabRow` so `_createItemSelect(isSelected)` starts checked when the selection is already known. Mirrors how `buildItemRow` would need the same if rebuilds are ever triggered on pre-selected items. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-L1 | `docs/a11y-audit-B-048.md:146-154` | **Pre-existing `.item-url` contrast failure on non-selected rows** is deferred to a follow-up item. Scope discipline is CORRECT (AC10(d) — palette-global concern, not one of the five states), but the audit doc should cite a BACKLOG id (e.g. "B-064: promote `.item-url` to `--text-secondary` globally") so the deferral has a tracking anchor. | Add the backlog id to §5 note 1 after [product-manager] files the item, or add a one-line TODO pointer that [scrum-master] can resolve during sprint close. |
| Q-L2 | `tests/b048-visual-states.test.js:153-196` | **AC1 tests reproduce the factory logic in-test** (same pattern as B-027, B-029). Low false-green risk because the real helpers are tiny and the concat order is sweep-tested. Tech-debt to extract `_buildItemRowAriaLabel` to `shared/aria-labels.js` for direct import (mirrors the B-029 Q-L3 suggestion). | Defer to a shared-helpers sweep — `_buildItemRowAriaLabel`, `_buildGroupPickerRows`, etc. all deserve extraction. |
| Q-L3 | `sidepanel/sidepanel.css:1238-1243` | **`.item-select` uses `visibility: hidden`** to reserve layout slot (correct for AC6 — prevents reflow). `visibility: hidden` leaves the element in the AT tree because of `aria-hidden="false"`. Two AT implementations (NVDA + VoiceOver) handle `visibility: hidden` differently — some announce the checkbox role even when visually invisible. Since the row-level aria-label already carries "selected" status, a double-announce is possible. | VoiceOver + NVDA spot-check during UAT (U-9 below). If double-announce occurs, consider `aria-hidden="true"` when `visibility: hidden` (and flip to `aria-hidden="false"` on `:hover` / `:focus-visible` / `[data-selected="true"]`). |
| Q-L4 | `sidepanel/sidepanel.css:1215-1217` | **`.item-row[data-selected="true"]:hover` explicitly pins the background to `--selected-bg`** — visually correct (selected wins over hover), but means hover feedback is entirely absent on already-selected rows. Users accustomed to the `:hover` affordance may briefly think the row stopped responding to pointer events. Low concern; the box-shadow border persists for visual anchor. | Consider a subtle secondary cue on `[data-selected="true"]:hover` (e.g. `box-shadow: inset 0 0 0 2px var(--selected-border)` — thicker border) if UAT surfaces any hover-feedback complaints. |
| Q-L5 | `docs/a11y-audit-B-048.md:169` | **Selection border is 1px box-shadow, focus ring is 2px outline** — documented as 1px clear-air separation between them. On 2x HiDPI displays this reduces to effectively 0.5 CSS px of clear air; on low-DPI external monitors the separation is 1 device pixel. Marginal visual distinction in rare environments. | Accept; flag for a follow-up if users report the focus ring "merging" with the selection border on low-DPI displays. |

### UAT scenarios

10 proposed cases for [test-engineer] R5. Each must run in BOTH light and dark themes unless otherwise noted.

1. **U-1 All five states alone (AC1)** — Trigger each state in isolation and visually confirm a non-color cue: (a) live-only row has a green left rail, (b) active row has a blue left rail + active background, (c) drifted row shows the triangle icon, (d) audible row shows the speaker icon, (e) selected row persistently shows the filled checkbox + box-shadow border. Disable theme color in macOS System Settings → Accessibility → Display → "Transparency / Increase contrast" to simulate color-blind / monochrome user perception.
2. **U-2 All five states together on one row (AC2)** — Select a saved item whose tab is currently active AND audibly playing AND has drifted from its saved URL, then Cmd-click to multi-select it. Verify: left rail is blue (active), checkbox is filled (selected), triangle + speaker icons coexist in the indicators column without overlapping the checkbox, title+URL remain readable, `aria-label` reads `"<title>, active tab, live tab, tab content has changed, playing audio, selected"` (AC7).
3. **U-3 AC4 hover distinction — active row** — Hover an active-but-unselected row in both themes. Confirm background shifts from `--active-bg` to `--active-bg-hover`. Take a DevTools screenshot; verify the two shades are visually distinguishable (not a "no-op hover").
4. **U-4 AC5 focus-ring over selection border** — Tab to an already-selected row. Focus ring MUST paint on top of the 1px box-shadow border (both visible, both blue, 1px clear air between). Repeat on light + dark. Verify NOT clipped (common regression: old `outline: 1px` would have stacked at the same z-level).
5. **U-5 AC6 hover-reveal timing** — Hover any unselected row and verify the empty-checkbox outline appears immediately (no reflow — surrounding content must not shift horizontally). Move pointer off; checkbox disappears. Tab via keyboard onto the row; checkbox appears via `:focus-visible`. Select (Cmd-click); checkbox becomes persistent.
6. **U-6 AC7 VoiceOver sweep** — macOS VoiceOver, navigate via VO+Right Arrow through 5 rows in these states: (a) saved-only, (b) live, (c) active+live, (d) drifted+audible, (e) all-five. For each row VO MUST announce the title followed by the flags in order: `active → live → drifted → audible → selected`. Icons MUST NOT be double-announced (they are `aria-hidden="true"`).
7. **U-7 AC7 NVDA sweep (Windows)** — Same as U-6 using NVDA on Windows. Confirms WAI-ARIA announcement parity across the two dominant screen readers.
8. **U-8 AC8 / AC9 patch-latency + zero full re-render** — With DevTools Performance recording, toggle a tab's audible state 10 times in a 1000-item profile. Verify: (a) each toggle triggers a `refetchAndPatchLiveState` call only, not `renderAll`, (b) DOM node count remains stable across toggles (spot-check `document.querySelectorAll('.item-row').length` before/after), (c) each patch completes in <500ms (Performance timeline).
9. **U-9 Double-announce screen-reader check (Q-L3)** — With NVDA or VoiceOver running, focus a hovered unselected row. Listen for any duplicate "checkbox unchecked" announcement after the row's own aria-label. If duplicated, log as a follow-up MEDIUM (AC7 deduplication is partial — the icon path is deduplicated, the checkbox path may not be).
10. **U-10 AC3 contrast spot-check (light theme)** — Open DevTools → Inspect → Accessibility pane → Contrast. Measure in-browser for three cells the audit called borderline: (a) `.item-url` on `--active-bg-hover` light (`#8a8f9a` on `#e2e8fd` — audit says 3.04:1), (b) live rail on `--bg-hover` light (audit says 2.92:1), (c) drifted icon on `--selected-bg` light (audit says 3.07:1). Record measured-vs-audit-predicted ratios; any >0.10 delta flags a palette-render mismatch that warrants a calibration follow-up.

**SKIP conditions**: U-7 (NVDA) is SKIP if no Windows test environment is available this sprint — document as SKIP in the UAT report, not FAIL. All other cases are expected PASS; any FAIL blocks B-048 from done and routes back to [frontend-engineer].

### Verdict

**PASS — READY FOR R5.** 0 CRITICAL, 0 HIGH, 4 MEDIUM, 5 LOW. All 10 ACs are testable and covered either by the 25 automated cases or the 10 UAT cases above. AC1 (grayscale) — every state has a dataset attribute + visual affordance (rail, icon, checkbox, background). AC2 (coexistence) — single test locks all five flags on one row; layout-slot reservation via `flex: 0 0 18px` prevents reflow. AC3 (contrast) — audit doc §4–§7 shows every in-scope state × theme × sub-state cell ≥ threshold; the `.item-url`-on-selected promotion to `--text-secondary` was correctly pulled in-scope (§31.3 note 3). AC4 (hover distinct on active) — new `--active-bg-hover` token verified 6.85:1 non-text contrast on the `--active-border` rail and 14.70:1 title text. AC5 (focus-visible on every state) — box-shadow-for-selection swap lets the 2px focus outline paint on top cleanly; no clipping. AC6 (hover-reveal + persistent-when-selected) — CSS selector triad `:hover, :focus-visible, [data-selected="true"]` verified; layout slot always reserved. AC7 (SR concat order) — 32-mask exhaustive test locks `active → live → drifted → audible → selected`, all lowercase, all comma-space delimited; icons `aria-hidden="true"` prevents double-announce (for the icon path — Q-L3 flags checkbox-path verification during UAT). AC8 (≤500ms patch) — `refetchAndPatchLiveState` rebuilds `aria-label` via targeted attribute set, not full re-render; verify timing during U-8. AC9 (zero full re-render) — grep confirms no `renderAll` call added to the live-patch path. AC10 (out-of-scope) — no new state introduced, no storage change, no message-contract change, no focus-management change, no `--accent` token changes. B-024 regression risk — `::before` removal: grep confirms zero B-024 tests reference `::before`, `item-select`, or `aria-checked` on rows, so the DOM migration cannot false-green any B-024 assertion. B-055 regression risk — open-tab rows use identical `.item-select` + `_buildItemRowAriaLabel` wiring; symmetry verified at L.2231/2263/2482. Pre-existing `.item-url` contrast failure deferral is correct scope discipline (palette-wide, not state-specific — cleanly separable into a future item). MEDIUMs are polish issues that do not block; LOWs are future-monitoring flags. [test-engineer] may proceed to R5 once [frontend-engineer] optionally addresses Q-M1/Q-M2/Q-M3/Q-M4.

---

## Sprint 16 — B-048 [security-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Verdict

**PASS — clean.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. Attack surface is exceptionally thin — CSS tweaks plus a purely structural DOM affordance. **(1)** `_buildItemRowAriaLabel` (`sidepanel.js:1975`) concatenates only static state literals (`'active tab'`, `'live tab'`, `'tab content has changed'`, `'playing audio'`, `'selected'`) plus `item.title`; the result is applied via `row.setAttribute('aria-label', ...)` at lines 1481, 1489, 2110, 2263, 2482, 2593 — attribute sink, never parsed as HTML — so even a bookmark title containing HTML markup cannot escape into a script context. **(2)** `_createItemSelect` (`sidepanel.js:1951`) uses `document.createElement` + `setAttribute` + static `className`; no user-controlled string reaches `className`, attributes, or `innerHTML`. The 5 pre-existing `innerHTML` sites in `sidepanel.js` (lines 1827, 1839, 1919, 1930, 2095, 2101) are all static SVG literals with zero interpolation — unchanged by this sprint and re-verified clean. **(3)** `aria-checked` values are derived exclusively from the `selected` boolean parameter (`selected ? 'true' : 'false'`) and the `_selection.has(...)` return — cannot be forced into a non-boolean state. **(4)** No new `console.*` calls introduced; no bookmark titles or URLs logged. **(5)** `manifest.json` untouched (`git diff` empty) — zero permission delta. **(6)** `tests/b048-visual-states.test.js` grep for `eval`/`new Function`/`console.*` returns no matches — shim-based per standard. No defense-in-depth gaps worth a LOW. Ship it.

---

## Sprint 17 — B-065 [security-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Verdict

**PASS — clean.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. Pure refactor, zero attack-surface delta. **(1)** `manifest.json` and `shared/messages.js` untouched (`git status` confirms neither file appears in working tree) — zero permission delta, zero new message contracts. **(2)** Both new modules (`shared/aria-label.js` 35 lines, `shared/group-picker-core.js` 128 lines) are pure functions: grep for `chrome\.|console\.|innerHTML|eval|Function\(|fetch\(|XMLHttpRequest` returns zero hits in `aria-label.js` and one hit in `group-picker-core.js` which is the literal string "chrome.*" inside a doc-comment describing what the module *doesn't* do. No I/O, no storage, no network, no module-level mutable state. **(3)** XSS posture preserved: all 8 `buildItemRowAriaLabel` consumers in `sidepanel.js` (lines 1450, 1458, 2073, 2239, 2458, 2568, etc.) feed the return value into `row.setAttribute('aria-label', ...)` — attribute sink, never an HTML sink; no new `.innerHTML =` assignments introduced (grep clean). **(4)** The extracted helpers still treat all inputs as untrusted — the null-item guard (`if (!item) return 'Untitled'`) *tightens* the contract vs. callers having to guard individually, which is a defense-in-depth win, not a regression. `normalizeGroupPickerQuery` trims+lowercases the query; no regex construction from the query, no prototype pollution vector. **(5)** `buildGroupPickerRows` uses `Map` (not object literal) for `savedByGroup`/`openByGroup`/`groupById` — immune to prototype-pollution via a malicious `groupId` like `__proto__` or `constructor`. **(6)** Sentinel `'__ungrouped__'` is handled as an exclusion-only value; it is never used as an attacker-controlled key since it's a hardcoded constant. No findings, no nits. Ship it.

---

## Sprint 17 — B-065 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `shared/group-picker-core.js:124–128` | `applyGroupPickerFilter` is exported but never imported by `sidepanel/sidepanel.js`. The sidepanel's `_applyGroupPickerFilter()` delegates only `normalizeGroupPickerQuery` from the shared module; the filter-predicate (`row.searchKey.includes(lower)`) remains re-implemented inline in the DOM-side function and again inside the test's local `applyFilter` wrapper — the false-green drift risk AC2 was meant to eliminate persists for this code path. The export is dead relative to the two consumers it was designed to serve. | In `sidepanel.js::_applyGroupPickerFilter`, import and call `applyGroupPickerFilter(rows, query)` using the last-built row descriptors to produce the visibility decisions, then apply `row.hidden` from the result. In `tests/b029-group-picker.test.js::applyFilter`, replace the local `includes(lower)` loop with a call to the shared export. DOM mutation (setting `row.hidden`, highlight reset, `aria-activedescendant` clearing) stays local as the architect intended. |
| M-2 | `shared/group-picker-core.js:82–84` | When `g.parentId` is set but `groupById.get(g.parentId)` returns `undefined` (orphaned child — parent was deleted between writes), `breadcrumb` silently remains `''` and `searchKey` drops to just the child's lowercase name. This matches the pre-refactor sidepanel behaviour exactly, so it is not a regression, but now that this is the canonical shared implementation future callers will rely on it without access to the sidepanel history that explains the silent fallback. | Add an inline comment at `group-picker-core.js:83`: "If parentId does not resolve (orphaned child), breadcrumb is empty and the row renders as top-level." No behaviour change required. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `tests/b027-group-header-menu.test.js:31` | The deferral comment is present and readable, satisfying AC3. However it does not cite the follow-up backlog id that AC7 requires ("filed as future tech-debt" without a `B-0??` anchor makes the deferral non-discoverable via backlog search). | Once the follow-up item is filed per AC7, update the comment to include the new backlog id, e.g. `// B-065 deferral: see B-0XX — extracting this helper requires consumer refactor (DOM + _pendingConfirm state).` |
| L-2 | `sidepanel/sidepanel.js:44–48` | The import aliases `_buildGroupPickerRowsShared` and `_normalizeGroupPickerQueryShared` carry a leading underscore. In this codebase underscore-prefix conventionally signals module-private functions defined in the file; imported bindings are neither. The `Shared` suffix is already sufficient disambiguation. A future reader doing a grep for private function definitions will get false hits. | Drop the leading underscore from the aliases: `buildGroupPickerRows as _buildGroupPickerRowsShared` could become `buildGroupPickerRows as buildGroupPickerRowsCore` or simply remove the underscore: `_buildGroupPickerRowsShared` -> `buildGroupPickerRowsShared`. |
| L-3 | `shared/group-picker-core.js:109–111` | `normalizeGroupPickerQuery` has a correctly typed JSDoc but no `@example`. Given it is now shared across production and tests, a one-line example (`normalizeGroupPickerQuery(' Docs ') // => 'docs'`) would match the documentation quality set by `buildItemRowAriaLabel` and aid discoverability for future callers. | Add one `@example` line to the JSDoc block. |

### Verdict

**PASS — READY FOR FAST TRACK CLOSE with M-1 and M-2 addressed before merge.** 0 CRITICAL, 0 HIGH. Both core invariants hold: no circular imports (both new shared files have zero import statements, confirmed by grep), and behavior is preserved byte-for-byte (function bodies in `shared/aria-label.js` and `shared/group-picker-core.js` are verbatim lifts confirmed against the removed diff blocks; 721/721 tests unchanged). The B-027 deferral comment is present at `tests/b027-group-header-menu.test.js:31`. The `normalizeGroupPickerQuery` split is architecturally defensible. M-1 (the `applyGroupPickerFilter` export is dead code relative to both intended consumers — filter-predicate drift risk survives) and M-2 (orphaned-parent edge case undocumented in the now-canonical shared location) must be resolved before merge. L-1 through L-3 are nits at author discretion.

---

## Sprint 17 — B-064 [code-reviewer]

### CRITICAL

_None_

### HIGH

_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `docs/a11y-audit-B-064.md §7, row 1` | The audit correctly flags `.group-drag-handle` (L381) as out-of-scope non-text, but records dark `:hover` at 2.86:1 — below the non-text 3.0:1 minimum — and marks it only as "borderline; monitored" with no follow-up backlog id. Per the deferral-comment pattern established in B-027, an unanchored "monitored" note is non-discoverable via backlog search and risks being lost between sprints. | File a follow-up backlog item (e.g. B-065) covering the group-drag-handle and the other non-text borderline consumers, and annotate §7 row 1 with that id. No CSS change required for B-064 itself. |
| M-2 | `sidepanel/sidepanel.css:1396–1399` | The compound selector `.item-row[data-live-only="true"][data-unsavable="true"] .item-title, ... .item-url` promotes `.item-title` to `var(--text-secondary)` as a side effect of the token flip, but the audit's §5.2 blast-radius table lists only `.item-url` in the "After" column; `.item-title` is not acknowledged. In practice `.item-title` normally resolves to `--text-primary` through the base rule, so this compound selector's specificity overrides it to `--text-secondary` on unsavable rows — which may be intentional (B-061 dimming intent) but is undocumented. | Add a row in audit §5.2 explicitly acknowledging that `.item-title` on the unsavable variant is also promoted to `--text-secondary` by this rule and confirm this is intentional. If unintentional, split the compound selector to target only `.item-url`. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `docs/a11y-audit-B-064.md §6.4` | The after-state table for `data-unsavable="true"` rows documents base pre-opacity ratios but explicitly declines to make an AA commitment for the 0.55-opacity-dimmed state. This is defensible given B-061's intentional-semantic-cue framing, but leaves the effective pixel contrast unmeasured. A future auditor has no baseline to regression-test against. | Add an informational non-normative row estimating the effective ratio at 0.55 opacity against `--bg-primary` (e.g. L ~2.4:1 estimated, D ~3.6:1 estimated), annotated as "visual-cue surface, not AA-normative." This makes the trade-off explicit and auditable in future sprints. |
| L-2 | `docs/a11y-audit-B-064.md §7, rows 6, 8, 11` | Four out-of-scope body-text consumers are described as "flagged for future sweep." Row 4 names a candidate id ("B-065+") but rows 6 (`group-items-empty`), 8 (`.context-menu-label`), and 11 (`.open-tabs-empty`) have no backlog anchor, leaving three known AA gaps untracked. | Assign a single follow-up backlog id to all four body-text consumers and update each row's Notes column with that id. |

### Verdict

**PASS — READY FOR FAST TRACK CLOSE.** 0 CRITICAL, 0 HIGH. The 3-line CSS diff is correct, minimal, and precisely scoped. All 8 non-selected AC1/AC2 cells pass at or above 5.25:1 (AA floor 4.5:1). AC3 italic live-only variant is covered in §6.3 with its own table showing AA compliance while retaining italic. AC4 consumer inventory enumerates all 11 `--text-tertiary` rules with 3 fixed and 8 correctly triaged out-of-scope. AC5 audit file is present and complete across all 11 sections. AC6 option rationale is documented in §5. No dead code, no stray changes, 721/721 tests unaffected. M-1 (unanchored non-text borderline gap on drag handle) and M-2 (undocumented `.item-title` side-effect in the compound selector) should be resolved before sprint close; neither blocks merge. L-1 and L-2 are documentation nits at author discretion.

---

## Sprint 17 — B-064 [security-reviewer]
### CRITICAL
_None_
### HIGH
_None_
### MEDIUM
_None_
### LOW
_None_
### Verdict

**PASS — CLEAN.** Attack surface confirmed empty. `git diff sidepanel/sidepanel.css` shows exactly three hunks, each a single-token swap `var(--text-tertiary)` → `var(--text-secondary)` on `.item-url` selectors (lines 512, 1383, 1396) — no new selectors, no `url()`/`@import`/`expression()`/external fetches introduced, no CSS variables defined or redirected. Zero JS changes attributable to B-064 (sidepanel.js / shared/ / background/ deltas belong to B-065 and are out of scope for this review). Zero `manifest.json` changes — confirmed via `git diff --stat`. No new user-input surfaces; CSS custom properties are hardcoded design tokens with no user-controlled path reaching them. `docs/a11y-audit-B-064.md` is plain Markdown documentation (no executable content, no embedded scripts, no fetchable links that alter extension behavior). No CSP implications — no `style-src` relaxation, no inline-style injection vectors, and Manifest V3 CSP remains strict. No privacy implications — no telemetry, no logging of URLs/titles added. Safe to merge from a security standpoint.

---

## Sprint 17 — B-042 [security-reviewer]
### CRITICAL
_None_
### HIGH
_None_
### MEDIUM
_None_
### LOW
_None_
### Verdict

**PASS — CLEAN.** XSS surface systematically reviewed against every injection vector.

**Text-context escaping (H-1):** Every `title`/`name` insertion in `background/export/html-export.js` routes through `htmlEscape`: `renderItem` line 64 (`item.title`), `renderFolder` line 91 (`group.name`), top-level Ungrouped line 157 (constant, still escaped defensively). No raw concatenation bypasses — verified by grep for `item.title`/`group.name` across the file.

**Attribute-context escaping (H-2, H-3):** `HREF`, `ICON`, `ADD_DATE`, `LAST_MODIFIED` all flow through `htmlEscape` which encodes the five critical chars including `"` → `&quot;` and `'` → `&#39;` (shared.js lines 23-32). An attacker-supplied URL like `https://a.test/"><img src=x onerror=alert(1)>` is rendered inert (test line 307 proves `"><img` does not appear in output; `&quot;&gt;&lt;img` does). Timestamps pass through `toUnixSeconds` → integer, then through template literal — defense-in-depth confirmed.

**XSS test coverage (H-5):** `tests/b042-html-export.test.js` covers the text probe `</A><script>alert(1)</script>` (line 291) AND the attribute-breakout probe (line 305). Both assertions confirm the raw byte sequences are absent from output. Group-name escaping also tested (line 316 — `Dev & <QA>` → `Dev &amp; &lt;QA&gt;`).

**Sidepanel Blob handling (H-6):** `sidepanel.js:1408` — the MIME type is sourced from `data.mimeType` (SW response), which the dispatcher hardcodes to `EXPORT_MIME_TYPES.html` (`text/html`). No caller path passes user-controlled MIME. `_triggerBlobDownload` is only invoked from `_exportCollectionAsHtml` with SW-returned values. Blob URL is revoked via `queueMicrotask` after click — no lifetime leak.

**Payload size (H-7):** Response is a single string; 1000-item collection ≈ 265KB, well below Chrome's ~64MB `sendMessage` cap. `size: content.length` is informational only, no DoS surface.

**Network egress (H-8):** Grep for `fetch|XMLHttpRequest|xhr|WebSocket` in `background/export/` returns zero. Export is 100% local.

**PII in console (H-9):** Grep for `console.(log|info|debug|warn)` in `background/export/` returns zero. Sidepanel `_exportCollectionAsHtml` catch block uses a "code-only fallback message" per AC11 privacy comment (sidepanel.js:1418) — no title/URL logging.

**Manifest permissions (H-10):** `git diff main..HEAD -- manifest.json` shows only a version bump (`0.2.0` → `1.11.0`); permissions array unchanged (`["tabs", "tabGroups", "storage", "sidePanel", "search"]`). Zero new permissions for export functionality — as claimed.

**Dispatcher validation:** `storage-handlers.js:399-410` enforces `format === 'html'` via `ERR_VALIDATION`. AC5 sender gate (`sender.id !== chrome.runtime.id`) blocks foreign-origin export requests — no external exfil vector.

**Defensive depth guard:** `MAX_GROUP_DEPTH = 2` recursion cap in `renderFolder` prevents a runaway render if storage invariants are ever relaxed. No stack-exhaustion or ReDoS vectors identified — `htmlEscape` uses a linear regex with no backtracking.

Safe to merge from a security standpoint.

---

## Sprint 17 — B-042 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `background/messages/storage-handlers.js:403` | **Format guard duplicates `EXPORT_FORMATS`**. The inline check `p.format !== 'html' && p.format !== 'json'` is a second source of truth for the canonical `EXPORT_FORMATS` array defined in `shared/export-schema.js` (line 25). When B-043 ships a third format the guard must be updated separately, risking drift. | Replace the two-part inequality with `!EXPORT_FORMATS.includes(p.format)`. Import `EXPORT_FORMATS` and add it to the existing import from `export-schema.js` on lines 48–51. |
| M-2 | `background/export/html-export.js:157` | **Ungrouped `<H3>` missing `ADD_DATE`/`LAST_MODIFIED` attributes**. Named group folders emit `<H3 ADD_DATE="..." LAST_MODIFIED="...">` (line 97). The Ungrouped folder header at line 157 emits a bare `<H3>Ungrouped</H3>` with no timestamp attributes. Importers that require valid timestamps on all `<H3>` nodes (e.g. Firefox) will either substitute `0` or reject the folder. AC4 requires all entries to carry unix-second timestamps. | Use a synthetic epoch of `0` for both attributes: `<DT><H3 ADD_DATE="0" LAST_MODIFIED="0">Ungrouped</H3>`. This matches how browsers emit the "Other Bookmarks" folder when timestamps are unavailable. Update the AC3 Ungrouped-suppressed test to assert the attributes are absent only when the folder itself is absent. |
| M-3 | `sidepanel/sidepanel.js:1427` | **`_exportCollectionAsHtml()` return promise is silently dropped**. The click handler `() => { _exportCollectionAsHtml(); }` discards the returned Promise. An async rejection that escapes the internal `try/catch` (e.g. an unexpected throw before the `try` block) becomes an unhandled rejection with no user feedback. | Add `void` before the call — `void _exportCollectionAsHtml()` — to signal intentional fire-and-forget and silence linter warnings. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `background/messages/storage-handlers.js:420` | **`'html'` extension is hardcoded rather than derived from format**. `buildFilenameWithDate(EXPORT_FILENAME_PREFIXES.html, 'html')` passes the extension as a literal. When B-043 adds the `'json'` branch the extension will need a parallel literal, creating a second copy-paste opportunity. | Add `EXPORT_FILENAME_EXTENSIONS: Object.freeze({ html: 'html', json: 'json' })` to `shared/export-schema.js` and use it in the handler. Not blocking for B-042. |
| L-2 | `background/export/html-export.js:89` | **Over-depth group suppression is silent**. `if (depth > MAX_GROUP_DEPTH) return ''` correctly guards against runaway recursion but drops the group and all its descendants with no diagnostic trace. A future storage relaxation allowing depth-3 groups would silently omit them from the export without any signal to the developer testing the extension. | Add a `console.warn('buildHtmlExport: group depth exceeded, skipping', group.id)` (code and ID only — no title, no URL) inside the guard. |
| L-3 | `sidepanel/sidepanel.js:1414–1415` | **`itemCount` / `groupCount` declared as separate `const` lines then used inline**. Minor style inconsistency with the destructuring pattern used elsewhere in the file. | Replace with `const { filename, mimeType, content, itemCount, groupCount } = data;` and call `_triggerBlobDownload(filename, mimeType, content)`. |
| L-4 | `shared/messages.js:78` | **`size` typedef comment says "UTF-16 code units" without byte-budget context**. For a future JSON export with many non-ASCII bookmark titles this distinction matters to any consumer computing byte budgets for storage or transfer limits. | Amend to `content.length (UTF-16 code units; not equal to byte length for non-ASCII content)`. |

### Verdict

**PASS with MEDIUM findings — READY FOR R5 after M-1, M-2, and M-3 are fixed.** 0 CRITICAL, 0 HIGH. Architecture is sound: `_triggerBlobDownload` lives in the sidepanel (not SW) per §32.7.3; `htmlEscape` escaping single-quote as defense-in-depth is safe and test-verified; `countNonEmptyGroupsForHtml` correctly drives AC7 toast copy; safe-mode classification is confirmed correct. The real-dispatcher integration test is present per Sprint 15 retro. XSS probes are non-trivial and cover title, URL attribute-context, and group-name vectors. M-1 (format guard diverges from `EXPORT_FORMATS`) and M-2 (Ungrouped `<H3>` missing AC4-required timestamps) are required fixes before R5. M-3 (unhandled promise on click handler) is a low-risk reliability gap also recommended before R5. L-1 through L-4 are at author discretion.

---

## Sprint 17 — B-042 [qa-reviewer]

### CRITICAL
_None._

### HIGH

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-1 | `background/export/html-export.js:122-173` + `background/messages/storage-handlers.js:413-415` | **Orphan items silently dropped, contradicting handler contract.** Handler comment says "items whose group no longer exists fall through to Ungrouped on re-import" but the builder does not implement that rescue: items with a non-null `groupId` are bucketed into `itemsByGroupId.get(<missing-id>)`, which no `renderFolder` call ever reads because the group record is absent from `childrenByParentId`. If the storage state ever has a stale `item.groupId` (race between `deleteGroup` + export, recovery from a partial migration, or a future bug), those items disappear from the exported file without warning — AC11 says we ship all saved data. Zero test covers this. **Fix (pick one):** (a) After bucketing, spill unresolved-groupId items into `ungrouped`; (b) Emit a dedicated `Orphans` folder; (c) Treat as a validation error and surface via `ERR_CORRUPT_DATA`. Update the handler comment to match whatever the builder does, and add a regression test with one orphan item. |
| Q-2 | `tests/b042-html-export.test.js` (absent) | **No timing test for AC9 (< 500ms P95 on 1000-item / 100-group corpus).** AC9 is an explicit PASS/FAIL metric; R5 coverage should wrap `buildHtmlExport` + `countNonEmptyGroupsForHtml` on a seeded 1000-item / 100-group fixture with `performance.now()` and assert median of 5 runs is under a CI-headroom threshold (e.g., `< 1500ms` to absorb jitter). The test-engineer owns this at R5 — flagging it now because no such case exists yet. |
| Q-3 | `sidepanel/sidepanel.js:1412-1416` | **Toast copy diverges from AC7 literal.** AC7 specifies exactly `Exported {N} bookmarks across {M} groups`. Implementation appends ` to {filename}`. Useful UX, but it is AC-literal drift that [test-engineer] will catch at UAT. Either update AC7 to bless the filename suffix (PM call) or strip the suffix to match AC7 literally. |

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-4 | `tests/b042-html-export.test.js` (absent) | **No test for unicode / emoji title preservation.** Regression where the builder accidentally ASCII-escapes non-BMP code points wouldn't be caught. Add a test with title `Café 日本語 🚀` asserting exact byte survival in output. |
| Q-5 | `tests/b042-html-export.test.js` (absent) | **No test for items with null / undefined title.** `renderItem` does `htmlEscape(item.title \|\| '')`, emitting `<A ...></A>` — a zero-length anchor. Add a test asserting current behavior (empty anchor) and decide if we should fall back to `item.url` as the visible label. AC4 does not document this fallback; PM decision needed. |
| Q-6 | `tests/b042-html-export.test.js` (absent) | **No test covering `ERR_NOT_READY` / cold service worker.** `registerStorageHandlers(Promise.resolve())` bypasses the readyPromise in every test; the real production path awaits storage init. Add one test that passes an unresolved promise and asserts the dispatch awaits it (or, if the handler short-circuits with `ERR_NOT_READY`, that the sidepanel toast is user-friendly — see Q-8). |
| Q-7 | `tests/b042-html-export.test.js` (absent) | **No test asserting safe-mode passthrough for read-only export.** SOLUTION_DESIGN §32.3 relies on `MSG_EXPORT_COLLECTION` being absent from `WRITE_MESSAGE_TYPES`. Add a test that enters safe-mode (schema downgrade) and confirms a `format: 'html'` dispatch still succeeds. Protects the invariant against a future refactor accidentally adding export to `WRITE_MESSAGE_TYPES`. |
| Q-8 | `sidepanel/sidepanel.js:1421` | **AC8 error toast copy is generic for every failure.** AC8 says "a brief human reason (e.g., `Export failed: unable to read bookmarks`)". Implementation shows the same `Export failed — try again` for every `err.code` including `ERR_VALIDATION`, `ERR_NOT_READY`, and (hypothetically) `ERR_SAFE_MODE`. Map the top 2-3 error codes to human strings with a generic fallback. |
| Q-9 | `background/messages/storage-handlers.js:406-410` + `sidepanel/sidepanel.js:1417-1422` | **`format: 'json'` error is integration-tested but never surfaces in a friendly way.** The `ERR_VALIDATION` "JSON export is not yet available" string only lands in `console.warn`; user sees "Export failed — try again". No current sidepanel UI dispatches JSON, so this is moot today — but when B-043 lands in Wave 4 the path becomes user-visible. Either defer or map now to shrink the Wave 4 lift. |
| Q-10 | `background/messages/storage-handlers.js:427` | **`size` is reported as `content.length` (UTF-16 code units), not UTF-8 byte length.** For ASCII content the values match, but any emoji / non-BMP title diverges. Either rename to `charCount`, or compute `new TextEncoder().encode(content).length`. Informational today (no consumer acts on `size`), but a latent correctness bug — and overlaps with [code-reviewer] L-4 on the typedef comment. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-11 | `tests/b042-html-export.test.js` (absent) | **No test for 10k-character title.** Defensive; `htmlEscape` is O(n) so not a hot risk, but worth one assertion that a 10k title survives without truncation and without perf collapse. |
| Q-12 | `tests/b042-html-export.test.js` (absent) | **No test for items with identical URLs across groups** — B-058 policy permits them. Confirm both entries are emitted. |
| Q-13 | `tests/b042-html-export.test.js` (absent) | **No `buildHtmlExport`-level test for missing `createdAt` / `updatedAt`.** `toUnixSeconds(undefined) → 0` is unit-tested in isolation; add an end-to-end builder test asserting `ADD_DATE="0"` lands in output when the item has no timestamp. |
| Q-14 | `tests/b042-html-export.test.js` (absent) | **No test for a sub-group whose parent record is missing (orphan sub-group).** Sibling to Q-1 but for groups — a `childrenByParentId` entry whose parent group record is absent is never rendered. Intentional? Document or fix. |
| Q-15 | `tests/b042-html-export.test.js` (absent) | **No test for a group literally named `Ungrouped`.** Overlaps with [code-reviewer] M-2: once Ungrouped gains `ADD_DATE`/`LAST_MODIFIED`, confirm a user-created `Ungrouped` group doesn't collide with the virtual folder during re-import. Add a regression test that documents the behavior. |
| Q-16 | `sidepanel/sidepanel.css:582-593` | **No explicit `:focus-visible` rule on `.header-add-btn`.** Button is focusable (AC1 satisfied) but relies on browser-default ring; sibling controls like `.group-header` (line 542) have explicit focus-visible styles. Consistency nit; not an AC-blocker. |
| Q-17 | `background/export/html-export.js:182-204` | **`countNonEmptyGroupsForHtml` walks items twice** (once inside build, once in count). Negligible at 1000 items; could be fused with `buildHtmlExport` returning the count as a tuple. Tech-debt note. |

### UAT scenarios

Proposed UAT cases for [test-engineer] at R5 (load unpacked in Edge + dev fixtures):

1. **UAT-01 Happy path.** Seed 3 items across 2 named groups + 1 ungrouped. Click Export → HTML. File downloads with today's local-date filename; toast reads `Exported 3 bookmarks across 3 groups to tab-junkie-bookmarks-…`. PASS if counts + filename correct.
2. **UAT-02 Keyboard-only invocation (AC1).** Tab into the header. Focus ring lands on Export button. Press Enter. File downloads. PASS if activation works with zero mouse and focus indicator is visible.
3. **UAT-03 Edge/Chrome re-import round-trip (AC2 + AC3).** Take the UAT-01 export → Edge `edge://favorites` → Import bookmarks from HTML. PASS if Tab Junkie group tree mirrors 1:1 (name, nesting, order, item titles, URLs).
4. **UAT-04 Firefox re-import cross-browser (AC2).** Repeat UAT-03 in Firefox → Library → Import HTML. PASS if accepted without errors.
5. **UAT-05 XSS probe (AC10).** Seed item with title `</A><script>alert(1)</script>` + URL `https://safe.example/`. Export → re-import into Chrome → click the re-imported bookmark. PASS if title displays as literal text and NO alert fires.
6. **UAT-06 Empty collection.** Clear all items and groups. Click Export. PASS if a valid HTML file still downloads (root DL only), toast reads `Exported 0 bookmarks across 0 groups…`, and Chrome re-import accepts it without error.
7. **UAT-07 Large-collection perf (AC9).** Seed 1000 items / 100 groups via dev fixture. Click Export, measure with DevTools Performance. PASS if median of 5 runs ≤ 500ms.
8. **UAT-08 Unicode preservation.** Seed item with title `Café 日本語 🚀`. Export. Open file in UTF-8-aware editor. PASS if bytes match exactly; re-import and confirm title renders.
9. **UAT-09 Failure path — SW killed mid-export.** DevTools → Application → Service Workers → Stop, then click Export. PASS if error toast appears and no partial file lands on disk.
10. **UAT-10 No blob leak (AC6).** Click Export 10× rapidly. PASS if 10 downloads complete and DevTools Memory snapshot shows no retained `Blob` / `ObjectURL` references.
11. **UAT-11 Download prompt / pop-up blocker.** If Edge enforces an extensions-initiated-download prompt, confirm one activation = exactly one download. PASS if user can suppress/allow without breaking the flow.
12. **UAT-12 Safe-mode passthrough (Q-7 confirmation).** Force safe-mode (manual schema-version bump via DevTools). Click Export. PASS if HTML export succeeds even though item writes are blocked with `ERR_SAFE_MODE`.

### Verdict

**CONDITIONAL PASS — 3 HIGH findings block R5.** Q-1 (orphan items silently dropped) is a functional correctness gap that needs code + regression test before [test-engineer] absorbs UAT; Q-2 (perf timing test for AC9) and Q-3 (toast copy literal drift) must also land before R5 is declared done. MEDIUM findings Q-4…Q-10 are predominantly test-coverage and user-facing-copy gaps that [test-engineer] can absorb at R5 in a single pass. LOW findings can defer. The feature shape is sound and closely matches the R2 design; the one behavioral deviation (Q-1) slipped because the handler comment assumed a rescue the builder doesn't perform.

---

## Sprint 17 — B-043 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `background/export/json-export.js:43–49` | **`compareNullFirst` accepts `undefined` but the schema contract uses `null` only.** The comparator treats `undefined` and `null` identically (`return -1` for either). If any stored record ever carries `groupId: undefined` (e.g., a migration gap or a malformed create) it sorts as null-first rather than exposing the anomaly. The sort silently masks a data quality issue that the importer B-045 would then have to handle. | Restrict the guard to `a === null` and `b === null`; add a defensive `console.warn` (key-only, no PII) if `undefined` is encountered so the data quality gap surfaces during development. |
| M-2 | `background/messages/storage-handlers.js:415–416` | **`listItems()` + `listGroups()` are two sequential reads with no consistency guarantee.** A concurrent `MSG_DELETE_GROUP` arriving between the two calls could produce an items snapshot that references a group ID absent from the groups snapshot, triggering orphan rescue in `buildJsonExport` for a group that was live at read time. The handler comment acknowledges the race but misclassifies it as "rare" with no mitigation. For a read-only export this is acceptable only if documented as a known limitation in `SOLUTION_DESIGN.md`. | Either (a) wrap both reads in a single `chrome.storage.local.get` across the two partition keys (guaranteed atomic snapshot), or (b) document the race explicitly in `SOLUTION_DESIGN §32.13 F-3` as a known limitation with justification. This is a correctness-vs-simplicity tradeoff that [solution-architect] should record. |
| M-3 | `background/export/json-export.js:167` | **`preferences` truthiness check silently drops a stored empty-object `{}`.** `if (preferences && typeof preferences === 'object')` is false when `preferences` is `{}` because `{}` is truthy — actually this is correct — but `null` and `undefined` are the only falsy non-object values the handler can pass. The real gap is that a persisted `tj:prefs = {}` (an empty patch written by `setPreferences({})`) passes the truthy check and emits `"preferences": {}` which is technically correct per §32.5.4 but may confuse B-045 importers expecting the key to carry at least one field. | Change the guard to `if (preferences !== null && preferences !== undefined)` for explicitness. Add a comment documenting that an empty `{}` preferences object is a valid edge case (user explicitly reset all prefs) and that B-045 must handle it. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `background/export/json-export.js:61` | **`compareItems` coerces `id` to string via `String(a.id ?? '')` but `makeItem` fixtures always use string IDs.** ULID IDs are always strings, so the coercion is dead code in practice. The `?? ''` fallback means a null/undefined `id` sorts identically to an item with id `''` — a vacuous tiebreak that hides a corrupt record. | Replace with a direct `a.id < b.id ? -1 : a.id > b.id ? 1 : 0` and add a `|| ''` fallback only with a comment that an absent `id` is a schema violation. |
| L-2 | `sidepanel/sidepanel.js:1476` | **`console.warn('export failed:', code)` in the JSON error path duplicates the same warn in the HTML path (line 1443).** Both branches call the same `_exportErrorToast` and produce identical console output. The warn pattern is correct (code-only, no PII), but both branches should ideally route through a single shared warn-then-toast helper to prevent the two copies from diverging in future sprints. | Extract `_handleExportError(err)` — one `console.warn` + `showToast(_exportErrorToast(code))` — and call it from both `_exportCollectionAsHtml` and `_exportCollectionAsJson`. |
| L-3 | `tests/b043-json-export.test.js:9–22` | **AC9 is labelled as the button-to-download-prompt wall-clock test, but the test only measures `buildJsonExport` CPU time.** The storage reads (`listItems`, `listGroups`, the `tj:prefs` probe) are excluded from the budget. The in-process chrome-mock is synchronous so omitting them is harmless for the automated test, but the AC text says "wall-clock measured from trigger to download-prompt" which would include the storage reads. | Add a comment in the test acknowledging that the chrome-mock's synchronous storage makes the storage-read latency negligible; the CPU-only measurement is therefore a conservative lower bound. No code change needed, just inline documentation. |
| L-4 | `tests/b043-json-export.test.js:22` | **AC9 (button → download-prompt) is listed in the AC-mapping comment but no test covers the sidepanel-level flow (button click → dispatch → blob download).** The 500ms budget is asserted at the builder level only. A future regression in the handler or the blob-trigger path wouldn't be caught. | Add a shallow integration test that stubs `_triggerBlobDownload` (or asserts `URL.createObjectURL` was called) via the real listener path, wrapped in a `performance.now()` probe. Low priority since B-042 has an equivalent gap and the builder test covers the dominant CPU cost. |

### Verdict

**PASS — no CRITICAL or HIGH findings. READY FOR R5 as-is.** The pure `buildJsonExport` function is well-structured, deterministic, and correctly strips all runtime enrichments. The handler's direct `chrome.storage.local.get` probe for `tj:prefs` (flagged deviation #1) is the correct design choice for §32.5.4 preference-presence semantics and does not need to change. The `GROUP_RUNTIME_FIELDS` inclusion of `warning` (flagged deviation #2) is correct belt-and-braces and should be kept. All 13 ACs are covered by the 32-test suite; the real-dispatcher integration test is present per Sprint 15 retro. M-1 through M-3 are recommended pre-R5 for correctness hygiene but are not blocking. L-1 through L-4 are at author discretion.

---

## Sprint 17 — B-043 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
| # | File | Finding | Fix |
|---|------|---------|-----|
| S-1 | `background/export/json-export.js:31-33` | **Block-list strategy for runtime-field exclusion.** `sanitizeItem` spreads all `Object.keys(item)` through to output, excluding only names in `ITEM_RUNTIME_FIELDS`. This is the risky pattern flagged by review-concern #4: the primary defense is that the export handler calls raw `listItems()` (no enrichment), but the in-file comment (L76-78) explicitly frames the deny-list as defense-in-depth against future memory decorations. Any future refactor that accidentally threads enriched items (e.g., via `buildLiveStates` merge, MSG_LIST_ITEMS reuse) into `buildJsonExport` would silently leak any field not listed. The deny-list is also not exhaustive relative to known enrichments — `favIconUrl` (capital `I`) returned by `buildLiveStates` (`tab-claims.js:229`) and `open-tabs.js:47` is NOT in the set, and the schema-allowlist logic in `live-tab-index.js` also uses `favIconUrl`. | Either (a) switch to an allow-list based on the documented persisted `Item` / `Group` shape (§32.5 frozen contract), OR (b) add `favIconUrl` to `ITEM_RUNTIME_FIELDS` and add a test asserting the deny-list covers every key enumerated in the Sprint 14 `buildLiveStates` return type. Option (a) is preferred for a frozen schema — unknown persisted fields are actually a signal of corruption, not forward-compat data. |
| S-2 | `background/messages/storage-handlers.js:426-428` | **Preferences probe is correctly scoped, but value is re-emitted verbatim with no shape filter.** `buildJsonExport` line 167-169 writes `root.preferences = preferences` without filtering. If the on-disk `tj:prefs` partition has ever been written with an unrecognised key (corruption, interrupted migration, future dev-only flag), the export leaks it to a shared backup file. Analogous to S-1 — current persisted-prefs shape is small and local-only, so blast radius is minimal, but a schema-frozen `preferences` allow-list would be consistent with §32.5.4. | Filter `preferences` through the set of documented keys before emission, or note the forward-compat pass-through decision explicitly in the schema spec. |

### LOW
| # | File | Finding | Fix |
|---|------|---------|-----|
| S-3 | `background/export/json-export.js:174` | JSON serialisation uses `JSON.stringify` — safe (no manual concat, no HTML escape surface, no injection risk). Note: a downstream consumer that pipes the export into an HTML `<pre>` or `innerHTML` would re-introduce XSS; the export path itself is clean. No action — documented as confirmation. |
| S-4 | `background/messages/storage-handlers.js:445` | `TextEncoder().encode(jsonContent).length` is deterministic and does not allocate persistently (encoder instance GC'd). No DoS surface beyond the already-unbounded export size itself. No action. |

### Verdict

**PASS — no CRITICAL or HIGH findings. READY FOR R5.** All 10 review vectors clear: JSON.stringify handles quoting safely (#1), exclusion is correctly enforced by raw-read + deny-list (#2-3), `schemaVersion` sources from `KNOWN_VERSION` (not user input) (#5), prefs probe is single-key scoped (#6), `TextEncoder` size is deterministic (#7), no PII logging (#8), manifest diff is empty (#9), and `MSG_EXPORT_COLLECTION` remains correctly absent from `WRITE_MESSAGE_TYPES` with a dedicated regression test at `tests/b043-json-export.test.js:638` (#10). The one genuine defense-in-depth gap (S-1, review-concern #4) — block-list vs. allow-list for runtime-field exclusion — is MEDIUM because the primary defense holds today and the gap is a future-refactor hazard only. Recommend switching to an allow-list before B-045 import lands so the frozen-schema contract is enforced symmetrically on both sides.

---

## Sprint 17 — B-043 [qa-reviewer]

Scope: `background/export/json-export.js` (176 LOC), `tests/b043-json-export.test.js` (720 LOC, 24 tests), `background/messages/storage-handlers.js` MSG_EXPORT_COLLECTION JSON branch (lines 403–454), `sidepanel/sidepanel.{html,js}` wiring for `#export-json-btn`.

### CRITICAL

_None._

### HIGH

_None._ All 13 ACs have matching assertions; the 3-HIGH gap that blocked B-042 at R4 (orphan rescue, perf timing, toast-copy literal) is explicitly covered here: orphan rescue tests land on lines 387–420, AC11 5-run-median perf at 426–455, AC10 copy is literal `'Backup exported: ' + data.filename` matching the AC's "e.g." exemplar.

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-1 | `tests/b043-json-export.test.js` | Deeply-nested sub-groups (≥ 3 levels) untested. Current AC5 nesting test only exercises parent→child; §32.5.5 determinism claim over `(parentId, sortOrder, id)` is unverified when the `parentId` chain is long enough to cross multiple sort partitions. | Add a 3-level nest fixture (A → B → C → D) and assert sorted output has the expected chain order. |
| Q-2 | `tests/b043-json-export.test.js` | No storage-read-fails-mid-build test. `ERR_NOT_READY` (cold SW) and `ERR_VALIDATION` (bad format) are covered, but `listItems()` resolving then `listGroups()` rejecting (partial snapshot) never surfaces — would wrap in a dispatcher-level StorageError with an unknown code. | Stub `chrome.storage.local.get` to reject on the 2nd call; assert `ok: false` and no blob leaks. |
| Q-3 | `tests/b043-json-export.test.js` | Null / empty title never exercised. JSON spec permits `"title": ""` and `"title": null`; B-045 import contract will need both. Builder passes through verbatim today, but no regression test pins it. | Add `makeItem({ title: '' })` + `makeItem({ title: null })` round-trip assertions. |
| Q-4 | `tests/b043-json-export.test.js` | `preferences: undefined` (vs. `null` / omitted) is not pinned. The `if (preferences && typeof preferences === 'object')` check suppresses correctly today, but an explicit test enforces intent against future refactors. | Add `buildJsonExport({ ..., preferences: undefined })` → assert `!('preferences' in parsed)`. |
| Q-5 | `sidepanel/sidepanel.js:1481–1485` | `#export-json-btn` keyboard activation (Tab → focus ring → Enter/Space triggers export) has no automated assertion. Inherits from `header-add-btn` pattern shared with `#export-html-btn`, but B-042 caught a regression here; symmetry warrants explicit UAT coverage. | UAT-03 below covers it; no code fix needed. |
| Q-6 | `background/export/json-export.js` | Non-palette `color` on groups (e.g., `"color": "#ff00ff"`) passes through unchanged. AC5 says "every persisted field as stored" so passthrough is correct, but B-045 will need to decide reject vs. rescue. | Document in SOLUTION_DESIGN §32.5 that color validation is an import-time (B-045) concern. No code fix here. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-7 | `tests/b043-json-export.test.js:461–497` | UTF-8 `size` probe uses a single emoji (🚀). CJK-only titles also diverge (3B utf-8 vs 1 code unit). Low-value coverage gain. | Optional: add Café 日本語 size assertion. |
| Q-8 | `background/messages/storage-handlers.js:426–428` | `preferences` probe uses direct `chrome.storage.local.get(prefsKey)` — bypasses the partition abstraction. Works today; if prefs ever move to a composite sub-key, this snaps. | Note in SOLUTION_DESIGN §32.5.4 as a known coupling. |
| Q-9 | `sidepanel/sidepanel.js:1472` | `'Backup exported: ' + data.filename` concatenates filename into a text-context toast. `showToast` assumed to use `textContent` (per B-042); worth a one-line assumption comment. | Optional inline comment citing `showToast` uses `textContent`. |

### UAT scenarios

Proposed UAT cases for [test-engineer] at R5 (load unpacked in Edge + dev fixtures):

1. **UAT-01 Happy path.** Seed 5 items across 2 named groups + ungrouped. Click `#export-json-btn`. File downloads as `tab-junkie-backup-YYYY-MM-DD.json`; toast reads `Backup exported: tab-junkie-backup-…json`. PASS if filename + toast match.
2. **UAT-02 JSON.parse round-trip.** Open the downloaded file in a JSON validator (or `jq .`). PASS if it parses with zero errors and root keys are `schemaVersion`, `exportedAt`, `items`, `groups` (plus `preferences` only when user has customized settings).
3. **UAT-03 Keyboard-only invocation.** Tab into header until focus lands on `#export-json-btn`. Focus ring must be visible. Press Enter. File downloads. PASS with zero mouse.
4. **UAT-04 Empty collection.** Clear all items and groups. Click Export. PASS if file downloads with `"items": []` and `"groups": []` and toast still appears.
5. **UAT-05 Only-ungrouped items.** Seed 3 items, no named groups. PASS if `items` has 3 entries (all `groupId: null`) and `groups: []`.
6. **UAT-06 Deep nesting.** Create A → B → C (3-level hierarchy) with 1 item per group. PASS if all 3 groups round-trip with correct `parentId` chain; export twice → diffs show only `exportedAt`.
7. **UAT-07 Orphan rescue — item.** Via DevTools → storage, manually corrupt one item's `groupId` to a non-existent group ID. Click Export. PASS if the orphan appears in output with `groupId: null` (no data loss, no silent drop).
8. **UAT-08 Preferences omission (first run).** Fresh profile, Settings never opened. Export. PASS if exported root has NO `preferences` key.
9. **UAT-09 Preferences present (customized).** Change theme to dark. Export. PASS if root has `"preferences": { theme: "dark", … }`.
10. **UAT-10 Unicode round-trip.** Seed item with title `Café 日本語 🚀`. Export. Open file in a UTF-8-aware editor. PASS if title is preserved exactly; `JSON.parse` succeeds; response `size` exceeds `content.length`.
11. **UAT-11 Large-collection perf (AC11).** Seed 1000 items / 100 groups. Export. PASS if median of 5 runs (DevTools Performance) < 500ms wall-clock from click to download prompt.
12. **UAT-12 schemaVersion authenticity.** Inspect downloaded file. PASS if `"schemaVersion"` equals current `KNOWN_VERSION` (1) and is an integer (not string).
13. **UAT-13 Safe-mode passthrough.** Force safe-mode (manual schema bump via DevTools). Click Export. PASS if JSON export succeeds and file downloads even though writes are blocked (MSG_EXPORT_COLLECTION absent from WRITE_MESSAGE_TYPES).
14. **UAT-14 SW cold-start failure.** DevTools → Application → Service Workers → Stop; click Export within 500ms of page load. PASS if toast reads "Export failed — extension is still starting, try again in a moment" and no partial file lands on disk.

### Verdict

**PASS — ready for R5.** All 13 ACs have matching assertions; the three HIGH findings that gated B-042 (orphan rescue, perf timing, toast-copy literal) are explicitly covered here. Six MEDIUM findings are test-coverage gaps that [test-engineer] can absorb in a single R5 pass alongside UAT; three LOW findings can defer to B-045 or a hygiene sprint. The builder's `exportedAt` injection via a `now` parameter is a standout — it unlocks the byte-identical determinism tests that make this one of the cleanest review targets of the sprint. No code changes required before R5.
