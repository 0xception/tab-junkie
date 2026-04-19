## 18. B-008 — Group Reorder & Collapse/Expand Persistence (R6 Close)

This section documents what actually shipped for B-008: drag-to-reorder groups and persisted collapse/expand state.

### 18.1 Storage Schema — No Changes

Both fields used by B-008 already existed in the Group shape (defined in section 2):

| Field | Type | Default | Origin |
|-------|------|---------|--------|
| `sortOrder` | `number` (finite) | `Date.now()` at creation | B-001a schema |
| `collapsed` | `boolean` | `false` | B-001a schema |

No migration is required. No schema version bump. The `KNOWN_VERSION` in `background/storage/migration.js` is unchanged.

### 18.2 Storage Validation — sortOrder Finiteness (R4 Fix M-1)

`validateGroupPatch` in `background/storage/groups.js` was missing the `Number.isFinite()` guard on `sortOrder` that `validateNewGroup` already had. This was flagged as security finding M-1 during R4 and fixed:

```js
// groups.js line 133-134
if ('sortOrder' in patch && (typeof patch.sortOrder !== 'number' || !Number.isFinite(patch.sortOrder))) {
  throw new StorageError(ERR_VALIDATION, 'updateGroup: sortOrder must be a finite number');
}
```

This closes the gap where `Infinity`, `-Infinity`, or `NaN` could be persisted via the update path.

### 18.3 Sidepanel State Model

Module-level drag state in `sidepanel/sidepanel.js`:

| Variable | Type | Purpose |
|----------|------|---------|
| `_dragSrcGroupId` | `string \| null` | Group ID of the section being dragged; `null` when idle |
| `_dragInitiatedFromHandle` | `boolean` | `true` only when `mousedown` fired on `.group-drag-handle`; gates `dragstart` |
| `_pendingGroupsRender` | `boolean` | Set when a `scope === 'groups'` broadcast arrives mid-drag; deferred `renderAll()` fires in `dragend` |
| `dropIndicatorEl` | `HTMLDivElement` | Singleton `<div class="drop-indicator">` appended to `itemListEl`; toggled via `.hidden` |
| `collapsedGroups` | `Set<string>` | Panel-lifetime set tracking collapsed group IDs; hydrated from `group.collapsed` on `DOMContentLoaded` |

### 18.4 Drag Implementation

**Mechanism:** Native HTML5 Drag and Drop on `.group-section[data-group-id]` elements. Only real groups (not `__ungrouped__`) are draggable.

**Handle gating:** A `mousedown` listener on `itemListEl` sets `_dragInitiatedFromHandle` based on whether the event target is inside `.group-drag-handle`. The `dragstart` listener checks this flag and calls `e.preventDefault()` if false. This prevents accidental drags when clicking group headers to collapse/expand.

**Visual feedback:**
- `.dragging-src` class on the source section (reduces opacity).
- `.is-dragging` class on `itemListEl` (enables cursor and visual cues).
- `dropIndicatorEl` positioned before the nearest section whose vertical midpoint is below the cursor; if no section qualifies, positioned before `__ungrouped__` or appended to the list.

**DOM-first reorder:** On `drop`, the source section is moved in the DOM immediately via `itemListEl.insertBefore(srcSection, dropIndicatorEl)`. Then all `[data-group-id]` sections are enumerated and assigned `sortOrder = index * 1000`. Only groups whose `sortOrder` actually changed get a `MSG_UPDATE_GROUP` message.

**sortOrder scheme:** Multiplier of 1000 per position leaves room for future insertion without recalculating all positions (e.g., inserting between positions 0 and 1000 could use 500). Current implementation always recalculates all positions on reorder.

**Error recovery:** If any `MSG_UPDATE_GROUP` call in the `Promise.all` batch fails, the catch handler refetches all items and groups from storage and calls `renderAll()` to revert the DOM to the persisted state.

**Broadcast guard:** When a `scope === 'groups'` broadcast arrives from the service worker while `_dragSrcGroupId` is non-null (mid-drag), the handler sets `_pendingGroupsRender = true` instead of triggering an immediate `renderAll()`. The deferred render fires unconditionally in the `dragend` listener, ensuring the UI is never torn mid-drag.

### 18.5 Collapse/Expand Persistence

**Real groups:** `toggleGroup()` calls `sendMessage(MSG_UPDATE_GROUP, { id, patch: { collapsed: !expanded } })` after updating the DOM. The send is fire-and-forget (`.catch(() => {})`) since the UI is already toggled.

**Ungrouped section:** Collapse state is stored in `sessionStorage` under key `tj-ungrouped-collapsed` (panel-lifetime, not cross-session). This avoids a storage write for a synthetic group that has no storage record.

**Hydration on load:** `DOMContentLoaded` handler reads `sessionStorage` for ungrouped state, then iterates the fetched groups array and adds any group with `collapsed: true` to the `collapsedGroups` set before calling `renderAll()`.

**Click delegation guard:** The group-header click handler checks `e.target.closest('.group-drag-handle')` and returns early if true, preventing a collapse toggle when the user grabs the drag handle.

### 18.6 Message Contracts — No New Types

B-008 uses only existing message types:

| Message | Direction | Payload change |
|---------|-----------|----------------|
| `MSG_UPDATE_GROUP` | sidepanel -> SW | `{ id, patch: { sortOrder: number } }` or `{ id, patch: { collapsed: boolean } }` — both fields were already in the allowed patch schema |
| `MSG_LIST_GROUPS` | sidepanel -> SW | No change — used for error recovery refetch |
| `MSG_LIST_ITEMS` | sidepanel -> SW | No change — used for error recovery refetch |

No new `MSG_*` constants were added. The total remains at 18.

### 18.7 Accessibility

- Drag handle has `tabindex="0"`, `aria-label="Reorder group"`, and `title="Drag to reorder (keyboard reorder not yet available)"`.
- Drag handle uses a 6-dot grip SVG icon with `aria-hidden="true"`.
- Group headers retain existing `role="button"`, `tabindex="0"`, `aria-expanded`, and `aria-controls` attributes.
- Keyboard reorder is not yet implemented (deferred — see 18.9).

### 18.8 Rollback Plan

**No migration required.** Both `sortOrder` and `collapsed` pre-existed in the Group schema. A `git revert` of the B-008 commits removes the drag UI and collapse persistence logic. Groups will render with whatever `sortOrder` values are stored (the field is still read/sorted even without the drag UI). Collapsed groups will render expanded (the default) since the `collapsedGroups` set hydration code would be removed.

No data corruption risk. No storage format change. No compatibility shim needed.

### 18.9 Deferred Items

| Item | Rationale |
|------|-----------|
| Keyboard reorder (arrow keys on drag handle) | Accessibility enhancement; current title attribute discloses the gap; drag handle is focusable but only mouse drag works |
| Batch `MSG_UPDATE_GROUP` | Currently sends one message per changed group in `Promise.all`; a dedicated batch message type would reduce round-trips for large group counts |
| Reorder animation | CSS transition on `.group-section` position changes during drag; currently snaps instantly |
| Touch/pointer event support | HTML5 DnD has inconsistent touch support; a future pass could add pointer event fallback |

### 18.10 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS — No change | `sortOrder` and `collapsed` fields pre-existed. No schema version bump needed. |
| C-2 | Message contracts typed | PASS — No change | No new message types. `MSG_UPDATE_GROUP` payload shape unchanged; `sortOrder` and `collapsed` were already in the allowed patch fields. |
| C-3 | Service worker cold-start safe | PASS | No new SW code. All persistence goes through existing `MSG_UPDATE_GROUP` handler in `storage-handlers.js`. Drag state is panel-local (module-level variables), not SW-dependent. |
| C-4 | ID stability | N/A | No changes to item identity or matching logic. Group IDs are stable ULIDs. |
| C-5 | Manifest file references resolvable | N/A | No new files or manifest entries. |

