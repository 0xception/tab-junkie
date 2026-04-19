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

