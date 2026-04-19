## 30. B-029 — Group Picker Modal (R2 Design)

### 30.1 Overview

B-029 replaces four disparate "choose a group" surfaces with a single modal primitive. Today the side-panel has three native `<select>` pickers (bulk action bar `#bulk-move-picker` L2944, selection context-menu `moveSelect` L3264, Open-Tabs context-menu `saveSelect` L3366) plus a still-missing bulk "Move items out of group" action on the B-027 group-header menu. Each caller reimplements the same "sort `_cachedGroups`, prepend Ungrouped, build `<option>` rows, wire `change`" sequence. Four copies of the same logic drift (e.g. the bulk-action `<select>` shows no item counts; the Open-Tabs one has no search; none of them are keyboard-friendly with >20 groups).

Unifying on one `openGroupPickerDialog({ sourceGroupId, onSelect, triggerEl, mode })` call gives us: (1) a single place to enforce ARIA listbox semantics, (2) a single filter/search implementation that AC3 can performance-budget, (3) a single focus-trap that honors the existing B-024 Escape-to-clear-selection guard, and (4) a single rendering path that includes saved-count + open-count + breadcrumb on every row. The B-027 "Move items out of group" action ships in the same item because it is the most natural consumer of the picker (it already has the group context and the item set) and because adding it separately would require building and then discarding a fourth ad-hoc `<select>`.

Scope is strictly UI-surface consolidation. No storage schema, no message contracts, no manifest permissions change (see §30.10).

### 30.2 Data-Layer Changes

**None.**

Groups are already populated at boot via `MSG_LIST_GROUPS` (`sidepanel.js` L591, L1888, L2540, L2560, L2623, L3727) and cached in the module-scope `_cachedGroups` (L135, assignment L1135). The cache stays fresh via `MSG_STATE_CHANGED` broadcasts — callers at L2955, L3045, L3273, L3375 already read it synchronously with zero IPC. Item counts per group derive from the equally-resident `_cachedItems` array; open-tab counts derive from `_cachedLiveStates` (tabId-valued when `live: true`). `_cachedOpenTabsById` supplies Open-Tabs row context for B-059's duplicate check callback.

No new `MSG_*` constant. No new storage partition. No manifest change. The picker is a pure view component over already-cached state.

### 30.3 Modal Primitive Decision

**Decision: introduce a new `openGroupPickerDialog(...)` primitive (not an extension of `openConfirmDialog`).**

#### 30.3.1 The two candidates

**Candidate A — extend `openConfirmDialog`.** Add a fifth option bag field (e.g. `listBody: { items, onSelect, filterPlaceholder }`) that, when present, swaps the `<p id="confirm-body">` for a list + filter input and hides the two action buttons. Reuses the existing `dialog-overlay` + focus-trap + Escape plumbing.

**Candidate B — new `openGroupPickerDialog(...)` primitive.** A dedicated function that reuses the shared `#dialog-overlay` wrapper and the existing `_activateFocusTrap` / `_dialogTriggerEl` helpers, but owns its own `<div id="group-picker-dialog">` node with its own markup, keyboard handling, and close path.

#### 30.3.2 Why B wins

1. **`openConfirmDialog` is already leaky.** §29.4.4 extended it once for B-059 with `confirmLabel` + `variant`. Those are mild extensions of the same 2-button confirm pattern. A list-body + filter input + listbox keyboard nav is a different interaction model — Enter means "pick the highlighted row", not "fire the default button"; Escape cancels without confirming; Tab must cycle input↔list, not cycle action buttons. Forcing those semantics through a `confirmLabel`-shaped API produces either (a) a function with two mutually exclusive modes (confirm vs list) gated by which options are set, or (b) feature flags on the options object. Both are tomorrow's refactor tickets.
2. **Listbox ARIA conflicts with `role="alertdialog"`.** `#confirm-dialog` currently declares `role="alertdialog"` (L135 of `sidepanel.html`). Alert dialogs are a W3C-specified subtype for urgent messages; a listbox picker is `role="dialog"`. Mixing them is an accessibility regression.
3. **Future reuse.** B-037 (theme picker) and B-023 (group-jump) are plausible second consumers of a general single-select list picker. If we build the primitive right, those items become XS/S tier. If we stretch `openConfirmDialog`, every future picker replays this debate.
4. **Cost is low.** The primitive is ~150 lines: HTML skeleton reused from `#dialog-overlay`, focus-trap reused from `_activateFocusTrap`, Escape routing reused from the existing document-level handler (L2377 already has a `!dialogOverlayEl.hidden` check that we ride on).

**Tradeoffs accepted.** More CSS surface area (new `.group-picker-*` namespace). More test surface (new file `tests/b029-group-picker.test.js`). Both are priced into the M-tier effort.

### 30.4 Call-Site Integration Matrix

The picker API is:

```js
openGroupPickerDialog({
  mode,              // 'move' | 'save'  — drives heading text
  sourceGroupId,     // string|null      — excluded from list (AC5)
  triggerEl,         // HTMLElement|null — focus-restore target
  onSelect,          // (groupId: string|null) => void
});
```

`onSelect` receives `null` for the "Ungrouped" row and the group's ULID string otherwise. `onSelect` is the only resolution channel; there is no separate `onCancel` — Escape and outside-click simply close without invoking `onSelect`.

| # | Caller (file:line) | Trigger fn | `mode` | `sourceGroupId` | `triggerEl` | `onSelect(groupId)` dispatches |
|---|--------------------|------------|--------|-----------------|-------------|--------------------------------|
| 1 | Bulk action bar `bulkMoveBtn.click` (`sidepanel.js` L2934) | `_bulkMoveToGroup(groupId)` | `'move'` (pure itemIds) / `'save'` (pure tabIds) | `null` (selection spans groups) | `bulkMoveBtn` | `_bulkMoveToGroup(groupId)` (existing L2817 — already handles bulk-itemIds via `MSG_BULK_UPDATE_ITEMS`, bulk-tabIds via `MSG_PROMOTE_TAB` per-tab with B-059 aggregate confirm) |
| 2 | Group-header menu — NEW "Move items out of group" (`_openGroupContextMenu` L3038) | inline handler: set selection to all items in `group`, then `openGroupPickerDialog` | `'move'` | the source `groupId` (AC5 hides it) | `header` | inline: `sendMessage(MSG_BULK_UPDATE_ITEMS, { ids: groupItemIds, patch: { groupId } })`, then `showToast` on reject, then `_clearSelection()` is a no-op (we never entered selection mode for this path) |
| 3 | Selection context menu (`_openSelectionContextMenu` L3238) | replace the inline `<select>` block L3257-3287 | `'save'` when `onlyTabs`, else `'move'` | `null` | `row` | `_bulkMoveToGroup(groupId)` (same dispatcher as #1) |
| 4 | Open-Tabs context menu (`_openOpenTabContextMenu` L3352) | replace the inline `<select>` block L3360-3434 | `'save'` | `null` (open tab has no current group) | `row` | B-059 handoff: `_findDuplicateSavedItem(tab.url)` → if hit, `openConfirmDialog(..., variant: 'primary', confirmLabel: 'Save anyway')` with `dispatchSave` as the callback; else `sendMessage(MSG_PROMOTE_TAB, { tabId, groupId })` directly |

#### 30.4.1 Context-menu close sequence (callers 2, 3, 4)

All three context-menu callers MUST close the context menu **synchronously** before invoking `openGroupPickerDialog`. Order of operations inside the menu-item click handler:

```
1. closeContextMenu();          // existing helper, L3013
2. openGroupPickerDialog({...}); // opens on the same microtask
```

Rationale: `closeContextMenu()` hides `#context-menu` and clears its children. If the picker opens first, the menu remains visible beneath the modal overlay until the user tabs into it (the overlay's semi-transparent backdrop does not hide the menu for screen readers). Closing first gives a clean focus transition from `row`/`header` → picker input, with `_dialogTriggerEl` pointing at the row for restore on Escape.

#### 30.4.2 B-059 Save-to-Group Handoff Contract (caller 4)

Picker is unaware of duplicates. Sequence:

```
1. User right-clicks Open-Tabs row → _openOpenTabContextMenu opens menu.
2. User clicks "Save to group"    → closeContextMenu(); openGroupPickerDialog({ mode: 'save', sourceGroupId: null, triggerEl: row, onSelect: handleSave });
3. User selects a group in picker → onSelect(groupId) fires; picker closes; focus returns to row.
4. handleSave(groupId):
     a. tab = _cachedOpenTabsById.get(tabId);
     b. existing = _findDuplicateSavedItem(tab.url || '');
     c. if (!existing) { sendMessage(MSG_PROMOTE_TAB, { tabId, groupId }) … }
     d. else openConfirmDialog({ title: tab.title }, dispatchSave, { heading, body, confirmLabel: 'Save anyway', variant: 'primary', triggerEl: row });
5. If the B-059 confirm opens, focus moves to its Cancel button; Escape from the confirm returns focus to row.
```

**Invariants** (enforced by tests):
- The picker's `onSelect` fully returns and the picker's DOM is removed before `openConfirmDialog` is invoked. No overlap between the two modals.
- `_findDuplicateSavedItem` is called exactly once per caller-4 path (in `handleSave`, not in the picker).
- Picker never reaches into `_cachedItems` — it only reads `_cachedGroups`, `_cachedItems` (for counts only), and `_cachedLiveStates` (for open counts only).

#### 30.4.3 B-027 new menu-item detail

**Insertion point in `_openGroupContextMenu` (`sidepanel.js` L3038-3222):**

The new action inserts as item **#5.5** — after the three Select actions (Select all L3111 / Select open L3128 / Select bookmarked L3146) and **before** `sep2` at L3166 (the separator before Edit/Delete). Menu order becomes:

```
1. Open all bookmarks            L3059
2. Close all open tabs           L3074    (destructive, disabled when openCount === 0)
-- sep1                          L3106
3. Select all                    L3111
4. Select open                   L3128
5. Select bookmarked             L3146
*** NEW: 6. Move items out of group ***
-- sep2 (was L3166)
7. Edit group                    L3171
8. Delete group                  L3183    (destructive)
```

**Label:** `"Move items out of group"` (matches the AC1 text exactly — product-manager-confirmed).

**Destructive?** **No.** Move is not data loss — it's just a group reassignment. No red styling, no `context-menu-item--destructive` class. Keeps destructive-visual discipline tight (only Close-all and Delete are red).

**Disabled state:** The button's `disabled` property is set to `true` when `groupItems.length === 0`. Without disable, clicking opens an empty picker (no-op), which is worse UX than not offering the action at all. Exact construction:

```js
const moveOutBtn = document.createElement('button');
moveOutBtn.className = 'context-menu-item';
moveOutBtn.setAttribute('role', 'menuitem');
moveOutBtn.setAttribute('tabindex', '-1');
moveOutBtn.textContent = 'Move items out of group';
moveOutBtn.disabled = groupItems.length === 0;
moveOutBtn.addEventListener('click', () => {
  closeContextMenu();
  if (groupItems.length === 0) return; // defensive
  const itemIds = groupItems.map((it) => it.id);
  openGroupPickerDialog({
    mode: 'move',
    sourceGroupId: groupId,  // AC5: hide the source group
    triggerEl: header,
    onSelect: (targetGroupId) => {
      sendMessage(MSG_BULK_UPDATE_ITEMS, { ids: itemIds, patch: { groupId: targetGroupId } })
        .catch(() => showToast('Couldn\u2019t move bookmarks \u2014 try again'));
    },
  });
});
contextMenuEl.appendChild(moveOutBtn);
```

Note: this path does not go through `_bulkMoveToGroup` because it does not use `_selection` — we bulk-move the group's full item set directly. Using `_bulkMoveToGroup` would require mutating `_selection`, which is a side effect this action does not want.

### 30.5 Modal Markup + Class Convention

**Grep audit before naming** (per Sprint 15 retro action item):

| Class/ID proposed | Exists in `sidepanel.html`? | Exists in `sidepanel.css`? |
|-------------------|----------------------------|----------------------------|
| `#group-picker-dialog` | No (verified — only `#bookmark-dialog`, `#confirm-dialog`, `#group-dialog`) | No |
| `.group-picker-filter` | No | No |
| `.group-picker-list` | No | No |
| `.group-picker-row` | No | No |
| `.group-picker-row--highlighted` | No | No |
| `.group-picker-row-chip` | No | No |
| `.group-picker-row-name` | No | No |
| `.group-picker-row-breadcrumb` | No | No |
| `.group-picker-row-counts` | No | No |
| `.group-picker-empty` | No | No |
| `.group-picker-heading` | No | No |

All names are new. Namespace is `.group-picker-*` — deliberately NOT folded into `.dialog-*` so (a) grep-by-feature keeps working, (b) the picker's listbox styles can't leak into the confirm/edit dialogs, and (c) a future deprecation of the picker can delete all `.group-picker-*` selectors cleanly.

**HTML skeleton** (inserted as a sibling of `#group-dialog` inside `#dialog-overlay`, `sidepanel.html` L167 area, hidden by default):

```html
<div id="group-picker-dialog" class="dialog-modal" role="dialog"
     aria-modal="true" aria-labelledby="group-picker-heading" hidden>
  <h2 id="group-picker-heading" class="dialog-title group-picker-heading">Move to group</h2>
  <input id="group-picker-filter" class="dialog-input group-picker-filter"
         type="search" placeholder="Filter groups..."
         aria-label="Filter groups" autocomplete="off" spellcheck="false" />
  <div id="group-picker-list" class="group-picker-list"
       role="listbox" aria-label="Groups" tabindex="-1"></div>
  <div id="group-picker-empty" class="group-picker-empty" hidden>
    <p>No groups yet — create a group first.</p>
    <button type="button" class="dialog-btn dialog-btn--primary">Create group</button>
  </div>
</div>
```

Row template (built at open time, not in HTML):

```html
<div class="group-picker-row" role="option"
     data-group-id="<id or empty for Ungrouped>"
     tabindex="-1" aria-selected="false">
  <span class="group-picker-row-chip" style="background-color: <color>"></span>
  <span class="group-picker-row-name"></span>   <!-- textContent only -->
  <span class="group-picker-row-breadcrumb"></span>   <!-- hidden for top-level groups -->
  <span class="group-picker-row-counts">12 saved, 3 open</span>
</div>
```

**Reused classes** (verified against `sidepanel.css`): `.dialog-modal` (L598), `.dialog-title` (L611), `.dialog-input` (L642), `.dialog-btn` (L701), `.dialog-btn--primary` (L710). Reusing these keeps typography and button styling consistent with existing modals.

### 30.6 Keyboard Nav + Focus Trap

**Open sequence:**
1. `_activateFocusTrap(groupPickerDialogEl)` — reuses the existing inert-siblings helper at L328.
2. Focus the filter input (`.group-picker-filter`).
3. Row #0 gets `aria-selected="true"` and `.group-picker-row--highlighted`; no DOM focus (focus stays in the input). Highlight is a visual pseudo-focus state, not DOM focus — lets the user keep typing while arrow-navigating.

**Key handler** (attached to the dialog root, not the input, so it catches events regardless of which of {input, list, row} has DOM focus):

| Key | Behavior |
|-----|----------|
| `ArrowDown` | Advance highlight one row (wrap to first after last); `preventDefault` so the input cursor doesn't move |
| `ArrowUp` | Reverse highlight (wrap to last before first); `preventDefault` |
| `Enter` | Invoke `onSelect(highlightedGroupId)`; `closeGroupPickerDialog()`; `preventDefault` |
| `Escape` | `closeGroupPickerDialog()` without invoking `onSelect`; `preventDefault`; `stopPropagation` (so the global L2377 handler doesn't also fire, though it's idempotent here — stopPropagation is defense-in-depth) |
| `Tab` | If focus is on filter input and Shift held: focus `.group-picker-list`. If focus is on list: focus filter input. Else default. This creates a 2-stop focus cycle that matches AC4 "cycles focus between the search input and the list". |
| Any printable key | If focus is not on the filter input, forward to filter input (focus it, let the keystroke fall through via `requestAnimationFrame` to avoid double-entry). Matches AC4 "typing while the list is focused forwards the keystroke to the search input". |

**Click on a row:** `onSelect(row.dataset.groupId || null)` → close.

**Outside click:** close without `onSelect` (same as Escape).

#### 30.6.1 Interplay with B-024 Escape-to-clear-selection

The document-level `keydown` handler at `sidepanel.js` L2375-2398 has this order:
1. L2377: if dialog open, close dialog and `return` — we ride on this.
2. L2384: else if selectionMode, clear selection and `return`.

When `#dialog-overlay` is visible (our picker opens with `dialogOverlayEl.hidden = false`), branch 1 fires and branches 2+ never run. No code change needed to L2375 as long as the picker lives inside `#dialog-overlay`. **R3 must verify** that `closeDialog()` at L2379 also closes the picker — the existing `closeDialog` handles the full overlay dismiss, so we wire the picker's close-on-Escape through the same path OR we intercept Escape locally at the picker root and stopPropagation (chosen above). The local interception is safer because `closeDialog()` was written for the bookmark dialog and assumes specific state reset.

### 30.7 Performance Budgets

**AC10 — First paint < 100 ms:**
- Read from `_cachedGroups` + `_cachedItems` + `_cachedLiveStates` — all in-memory.
- Build all rows upfront with a single `DocumentFragment`, one append. At 100 groups, that's ~600 DOM nodes (row + 5 spans per row) — cheap (~5-15 ms on a mid-range laptop).
- Compute counts in a single pass: `for item of _cachedItems { countsByGroup[item.groupId].saved++; if (liveStates[item.id]?.live) countsByGroup[item.groupId].open++ }`. O(n) where n = items, not O(groups × items).
- No `MSG_*` IPC during open (AC10 PASS criterion).
- No `chrome.storage` read during open.
- `performance.now()` markers: `tPickerOpenStart` at click handler entry, `tPickerOpenEnd` in `requestAnimationFrame` after first list render. Log delta in dev console only (gated by a dev flag) — never ship a `console.log` per CLAUDE.md.

**AC3 — Filter < 50 ms P95 on 100 groups:**
- No debounce. Filter handler is synchronous, runs on every `input` event.
- Substring match via `String.prototype.includes` on pre-lowercased `group.name` (cached once per group at build time, stored on `row.dataset.searchKey`).
- Sub-group match includes the pre-lowercased `breadcrumb` string.
- Toggle row visibility via `row.hidden = !match` — no DOM rebuild, no reflow of the list itself (the list is already laid out).
- At 100 rows, 100 `includes` calls per keystroke ≈ sub-millisecond. Budget is met with three orders of magnitude headroom.
- No virtualization needed at this scale. If a future user has 500+ groups (unlikely — the app is local-only), revisit with a windowed listbox. Flag in §30.12.

### 30.8 ARIA / A11y

- Root: `role="dialog"`, `aria-modal="true"`, `aria-labelledby="group-picker-heading"`.
- Heading: `id="group-picker-heading"`; text is `"Move to group"` when `mode === 'move'` and `"Save to group"` when `mode === 'save'`. Heading text is updated at open time; never stored stale in the DOM across opens.
- Filter input: `aria-label="Filter groups"`.
- List container: `role="listbox"`, `aria-label="Groups"`, `tabindex="-1"` (not in the tab order — reached via Shift+Tab from filter per §30.6).
- Each row: `role="option"`, `aria-selected` set to `"true"` on the highlighted row and `"false"` on all others. Updated together in a single pass when highlight moves — never more than one row with `aria-selected="true"` at a time.
- Focus indicator: `.group-picker-row--highlighted` uses `outline: 2px solid var(--focus-ring)` + `outline-offset: -2px` — matches the existing focus-ring pattern in `sidepanel.css` L247 and elsewhere. `--focus-ring` is `#2563eb` (light) / `#60a5fa` (dark), both ≥ 3:1 against their backgrounds per AC8.
- Empty state: heading stays visible; empty-state `<p>` and "Create group" button are interactive via normal tab order (input → empty-state button via Tab; no list to cycle into).

### 30.9 Out of Scope

R3 MUST NOT implement any of the following in B-029:
1. Creating a new group from inside the picker (the empty-state CTA dispatches to the existing B-006 `openGroupCreateDialog` and the picker does not auto-reopen after).
2. Editing a group from inside the picker.
3. Deleting a group from inside the picker.
4. Multi-select (picking multiple target groups at once).
5. Drag-and-drop onto the picker (owned by B-030 / B-033).
6. Inline bookmark-count editing or per-row actions on rows.
7. Recent-group surfacing or sort-by-recency (all rows use `sortOrder` ascending).
8. Fuzzy-match or prefix-match on filter (AC3 specifies substring match; upgrade is a separate backlog item).
9. Persistent filter state between opens (every open starts with an empty filter).
10. Grouping the list (e.g. by parent). Sub-groups render inline with a breadcrumb prefix; no visual tree.

### 30.10 R2 Correctness Checklist

| # | Check | Status | Rationale |
|---|-------|--------|-----------|
| C-1 | Storage schema versioned | N/A (PASS) | No storage schema change. No migration needed. |
| C-2 | Message contracts typed | PASS | No new `MSG_*`. Picker consumes already-cached state from `_cachedGroups` / `_cachedItems` / `_cachedLiveStates`. `onSelect` dispatches existing `MSG_BULK_UPDATE_ITEMS` (callers 1, 2, 3 when items), `MSG_PROMOTE_TAB` (callers 1 when tabs, 3 when tabs, 4), all with their current typed shapes. |
| C-3 | Service worker cold-start safe | PASS | Picker only opens after the side-panel has received its first `MSG_LIST_ITEMS` + `MSG_LIST_GROUPS` responses (renderAll populates `_cachedGroups` at L1135 during boot). Rows are rendered exclusively from populated caches. Opening the picker before boot is guarded by the panel's own skeleton state — the trigger buttons live inside `#panel-header` / context menus that are themselves only interactive post-boot. |
| C-4 | ID stability | N/A (PASS) | Group ids are ULIDs generated by the SW and are opaque to the picker. The picker never constructs or transforms them. `null` is the canonical "Ungrouped" sentinel and matches the existing convention throughout `sidepanel.js` and `_bulkMoveToGroup`. |
| C-5 | Manifest file references resolvable | N/A (PASS) | No new manifest paths. No new popup, no new side-panel entry, no new `chrome_url_overrides`. |

### 30.11 Rollback Plan

No schema migration, so rollback is a pure `git revert` of the B-029 PR. After rollback, users see the pre-Sprint-16 state: the three native `<select>` pickers reappear on the bulk bar, selection menu, and Open-Tabs menu; the B-027 group-header menu loses the "Move items out of group" action. No user data is affected. No lingering storage keys. No toast-on-startup. `_cachedGroups` + `_cachedItems` are unaffected because the picker never wrote to them.

If a partial rollback is needed (e.g. B-029 ships but the B-027 new action is buggy), git revert only the menu-insertion hunk in `_openGroupContextMenu`; the picker remains usable from its other three call sites.

### 30.12 Flagged Risks

| # | Severity | Risk | Owner at R4 |
|---|----------|------|-------------|
| F-1 | MEDIUM | New "Move items out of group" menu item may collide with in-flight B-063 (close-on-blur refinement for group context menu). Coordinate merge order: B-063 rebases after B-029, not before. | [code-reviewer] verify no double-listener on `blur`; [qa-reviewer] UAT both menus together |
| F-2 | LOW/MEDIUM | New `.group-picker-*` namespace adds ~80-120 lines to `sidepanel.css` (currently 1346 lines). Propose: inline for Sprint 16. If CSS grows past ~1500 lines after B-029 + B-062, file a backlog item to split into `sidepanel-modals.css` (picker + confirm + edit) and `sidepanel-core.css`. | [code-reviewer] file size comment; do NOT block merge |
| F-3 | MEDIUM | Focus-trap interaction with the B-024 Escape-to-clear-selection handler (L2384). The picker lives inside `#dialog-overlay`, so L2377 fires first and returns — L2384 never runs. R3 MUST confirm this with an automated test that opens the picker while a selection is active and asserts the selection is still present after Escape closes the picker. | [test-engineer] T-R5 case |
| F-4 | LOW | Focus-indicator contrast on the highlighted row: `--focus-ring` on `--surface` in light mode is 4.5:1, in dark mode ~5.1:1 — both AA. B-062 (same sprint) is re-keying `--accent` but has committed to holding `--focus-ring` stable. Track the final dark-mode pairing post-B-062. | [qa-reviewer] AA spot-check in UAT |
| F-5 | LOW | AC9 empty-state CTA closes the picker and opens the B-006 create dialog but does NOT auto-reopen the picker after creation. This is a deliberate scope choice (§30.9 item 1). If users complain, B-037-adjacent backlog item can add a post-create `onCreate → openGroupPickerDialog` callback. | none at R4; product decision |

No risk rises to CRITICAL or HIGH. Tier stays **M** (Full pipeline).

### 30.13 Handoff Notes for [frontend-engineer] R3

**Files to touch:**
1. `sidepanel/sidepanel.html` — add `#group-picker-dialog` sibling inside `#dialog-overlay` (after `#group-dialog`, before the overlay's closing `</div>`).
2. `sidepanel/sidepanel.css` — add the `.group-picker-*` block near the existing `.dialog-*` block (around L760, before `.group-color-swatches`). Reuse `--focus-ring`, `--accent`, `--border-primary`, `--text-primary`, `--text-muted` (already on theme); do NOT introduce new color tokens.
3. `sidepanel/sidepanel.js` — new module-scope function `openGroupPickerDialog`; delete three `<select>` blocks (L2940-3005 in `bulkMoveBtn` click, L3257-3287 in `_openSelectionContextMenu`, L3360-3434 in `_openOpenTabContextMenu`); insert the new menu item in `_openGroupContextMenu` at §30.4.3's insertion point; keep `_bulkMoveToGroup` unchanged (reused by callers 1 and 3).
4. `tests/b029-group-picker.test.js` — new file: filter correctness, keyboard nav, focus trap (F-3), source-group exclusion, empty state, B-059 handoff sequence.
5. `tests/b027-group-header-menu.test.js` — add cases for the new "Move items out of group" item: visible/disabled, invokes picker with correct `sourceGroupId`, dispatches `MSG_BULK_UPDATE_ITEMS` on select.
6. `tests/promote-tab.test.js` — regression: Open-Tabs picker → `onSelect` → duplicate hit → confirm → dispatch. No changes to existing AC1-AC7 cases beyond the picker swap.

**Suggested build order (minimises rework):**
1. Add HTML skeleton + CSS block (visible via DevTools hack; no JS yet).
2. Implement `openGroupPickerDialog(options)` + `closeGroupPickerDialog()` with filter and keyboard nav. Unit-test in isolation.
3. Wire caller 1 (bulk bar) — smallest refactor; validates the dispatcher wiring.
4. Wire caller 3 (selection menu) — same `_bulkMoveToGroup` path; validates mode toggle.
5. Wire caller 4 (Open-Tabs) — most complex (B-059 handoff); validates §30.4.2 invariants.
6. Add the new "Move items out of group" action to `_openGroupContextMenu` (§30.4.3). Wire caller 2.
7. Delete the `#bulk-move-picker` CSS block (L1166-1190) — no longer used.
8. Run full test suite; fix regressions.

**Theme-token audit flag:** §30.5 / §30.8 reference `--accent` (row-highlight background) and `--focus-ring` (row-highlight outline) on a new surface. B-062 is concurrently modifying `--accent`. Confirm AA contrast in both themes after B-062 lands. If B-062 ships first and changes `--accent` meaningfully, retest F-4 in R5 UAT.

### 30.14 B-029 — Deviations From R2 (Sprint 16 as-built)

*R6 close — reconciles what R2 prescribed in §30.1–§30.13 against what shipped in Sprint 16. Source material: `docs/SPRINT_FINDINGS.md` Sprint 16 B-029 sections ([code-reviewer], [security-reviewer], [qa-reviewer]), `docs/UAT_B-029.md`, and the shipped diff on `release/v2`.*

**1. Modal primitive — no deviation.** R3 shipped `openGroupPickerDialog` + `closeGroupPickerDialog` as prescribed by §30.3. Candidate B was honoured; `openConfirmDialog` was not extended. Entry points at `sidepanel/sidepanel.js:918` (open) and the close helper within the same module. All four callers (`sidepanel.js:3650`, `3832`, `3954`, `4049`) invoke the primitive; the three native `<select>` blocks called out in §30.13 were deleted cleanly.

**2. Color chip — ratified deviation from §30.5.** §30.5 sketched inline `style.backgroundColor` on the row chip. R3 instead applied the existing `.group-color-*` palette classes via `className` (`sidepanel.js:743`, `group-picker-row-chip` concatenated with the palette slug). Visually identical, DRY with the rest of the codebase, and consistent with `.group-header` chip rendering. **Guidance for future readers:** reuse the palette class convention — inline-style is not the preferred path.

**3. B-027 new menu action — no deviation.** The "Move items out of group" action was inserted in `_openGroupContextMenu` between "Select bookmarked" and `sep2`, dispatches `MSG_BULK_UPDATE_ITEMS` directly without mutating `_selection` (preserves the §30.4.3 invariant), and is `disabled` when `groupItems.length === 0`. Matches §30.4.3 exactly.

**4. R4-fix H-1 — AC9 Create-group CTA now satisfied.** R1 PM drafted AC9 expecting a real "Create group" affordance on the picker's empty state. R3 initially shipped a toast fallback (`'Create a group from the + menu, then try again'`) because no `openGroupCreateDialog` existed; qa-reviewer H-1 correctly flagged this as a broken first-run flow. R4 fix-pass took Option A: B-006's `openGroupEditDialog` now accepts `null`/undefined for the group argument to mean "create mode", and a thin `openGroupCreateDialog({ triggerEl })` wrapper (`sidepanel.js:467`) calls `openGroupEditDialog(null, { triggerEl })`. Empty-state CTA at `sidepanel.js:1087` invokes the wrapper; AC9 is fully satisfied by a real create flow. **Semantic extension recorded:** `openGroupEditDialog(groupId, { triggerEl })` — `groupId = null` → create mode; non-null → edit mode. Future B-006 callers should prefer `openGroupCreateDialog` for discoverability.

**5. R4-fix H-2 — broadcast-refresh hook.** Not anticipated in §30. On `MSG_STATE_CHANGED scope:'groups'` broadcasts while the picker is open, `_refreshGroupPickerIfOpen()` (`sidepanel.js:988`) rebuilds rows from fresh `_cachedGroups`, preserving the filter query and the highlighted-index (restored by `group-id` lookup with fall-back to the first visible row). Wired at the broadcast handler (`sidepanel.js:3337`). **Formalize as required behavior** for any modal that renders over cached state: if a broadcast scope could invalidate the render, the modal must either (a) re-render in-place, or (b) close with a targeted toast. B-029 chose (a).

**6. R4-fix H-3 — `_translateMoveError` helper.** New helper at `sidepanel.js:3526` maps error codes to user-facing toast copy. Translation table:

| `err.code` | Toast copy |
|---|---|
| `ERR_SAFE_MODE` | "Read-only mode — can't move items" |
| `ERR_NOT_FOUND` | "Target group no longer exists" |
| *(default)* | "Couldn't complete the move — try again" |

Applied at three call sites: `sidepanel.js:832` (picker `onSelect` branch), `:3629` (bulk move dispatcher), `:3843` (B-027 Move-items-out callback). Future move/save callers SHOULD use this helper; ad-hoc generic toasts are a regression risk.

**7. R4-fix M-1 (code) — Tab direction.** R3 had a dead `Shift+Tab` branch in the picker focus-trap. Fixed to cycle list ↔ filter ↔ (empty-state Create button when applicable). Tab sequence in both directions is now symmetric and test-covered in `tests/b029-group-picker.test.js`.

**8. R4-fix M-2 (code) — `aria-activedescendant` wiring.** §30.8 specified `role="listbox"` / `role="option"` but did not pin down the element-ID scheme. R3 delivered stable row IDs of the form `group-picker-row-${idx}` (`sidepanel.js:737`); `_setGroupPickerHighlight` writes the active row's `id` to `groupPickerListEl.setAttribute('aria-activedescendant', ...)`; `_resetGroupPicker` clears it to `''`. Required by ARIA 1.2 listbox pattern (non-roving `tabindex`). **Formalize** in §30.8: listbox containers MUST advertise the active option via `aria-activedescendant` when options are non-tab-stop.

**9. R5 coverage + follow-up tech-debt.** 28 initial tests + 21 R4-fix additions + 11 R5 additions = **60 dedicated B-029 tests**. Test architecture reproduces picker logic as shims inside `tests/b029-group-picker.test.js` (same pattern as B-027 and B-061). This carries false-green risk if `_buildGroupPickerRows` / `_applyGroupPickerFilter` drift from the in-test copies. **Recorded tech-debt:** extract these two helpers to `shared/group-picker-core.js` so tests import the real implementation. Mirrors B-048 Q-L2 and will be batched with that item in a future "shared-helpers sweep" sprint.

---

