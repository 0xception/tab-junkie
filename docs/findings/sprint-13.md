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

