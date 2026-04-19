## 15. B-003 — Bookmark CRUD Dialog Architecture

**Date:** 2026-04-16
**Status:** SHIPPED — UAT PASS 2026-04-16. R6 close complete.

### 15.1 Open Question Resolutions (binding for R3 and R5)

**OQ-1 — Canonical "Ungrouped" groupId value in the group picker `<select>`**

**Decision: Use the JavaScript value `""` (empty string) as the `<option value>` for the Ungrouped entry. When reading the select's `.value`, convert `""` → `null` before dispatching any message.**

Rationale: The storage schema defines `item.groupId` as `string | null` where `null` = Ungrouped (`SOLUTION_DESIGN.md §2`). The sidepanel rendering already uses the `__ungrouped__` synthetic id internally for group-section DOM wiring, but that id is never sent to the SW. The select element must map option values to what the SW expects. Empty string is the natural HTML falsy sentinel (`<option value="">Ungrouped</option>`), maps cleanly to `null` on submit (`groupId: selectEl.value || null`), and requires no special constants visible to template code. Using `__ungrouped__` as the option value would require importing or duplicating a constant that has no meaning outside the DOM grouping scaffold. Using `null` directly as an option value is not representable in HTML. Decision: `""` in HTML, `null` on the wire.

**OQ-2 — HTML element and id for the secondary "Add Bookmark" header trigger**

**Decision: A `<div id="panel-header">` wrapper is added as the first child of `<body>` (before `#skeleton`). Inside it, a `<button id="add-bookmark-btn" class="header-add-btn" aria-label="Add bookmark" hidden>` is the trigger. It is hidden by default and revealed by `renderAll` once items exist (i.e., when `#item-list` is shown).**

Rationale: The existing HTML has no panel header. Adding one now is the minimal change that gives B-003 a stable mount point for the add button without restructuring existing state elements. `hidden` matches the pattern already used for `#item-list`, `#empty-state`, and `#error-state`. The button is keyboard-reachable, has an explicit `aria-label`, and uses `<button>` (not `<div role="button">`) to get native focus and Enter/Space handling for free.

**OQ-3 — HTML element and id for per-item Edit and Delete triggers**

**Decision: Two `<button>` elements are appended inside each `.item-row` by `buildItemRow`, after the existing indicators container. They are NOT in the DOM during normal display — they are always present but visually hidden via CSS (`opacity: 0; pointer-events: none`) and revealed on `.item-row:hover` and `.item-row:focus-within` via CSS. They use `data-action="edit"` and `data-action="delete"` attributes for event delegation. No ids are needed on these (they are repeated per row); the parent row's `data-item-id` provides item identity.**

Specific element structure appended to each `.item-row`:
```html
<div class="item-actions" aria-hidden="true">
  <button class="item-action-btn item-action-edit"
          data-action="edit"
          tabindex="-1"
          aria-label="Edit bookmark">
    <!-- inline SVG pencil icon -->
  </button>
  <button class="item-action-btn item-action-delete"
          data-action="delete"
          tabindex="-1"
          aria-label="Delete bookmark">
    <!-- inline SVG trash icon -->
  </button>
</div>
```

`tabindex="-1"` keeps action buttons out of the main Tab order (the row itself is the focus target). They become keyboard-reachable via `Tab` only when the focus trap is active inside a row-action context — standard pattern for compound widgets. The `aria-hidden="true"` on the container means the buttons are announced only when they receive programmatic focus (which the focus trap manages). `data-action` values are consumed by the existing `document.addEventListener('click', ...)` delegation in `sidepanel.js`.

> **R6 as-built note (D-4):** `tabindex="-1"` was removed during build. Action buttons are now keyboard-focusable in normal Tab order, since they are revealed on `:focus-within` and must be reachable to complete the interaction. See §15.9 D-4.

**OQ-4 — Whether ERR_DUPLICATE_URL is in scope for B-003**

**Decision: OUT OF SCOPE for B-003. No special handling beyond the generic SW error path.**

Rationale: `ERR_DUPLICATE_URL` is currently thrown only by `MSG_PROMOTE_TAB` (B-016), not by `MSG_CREATE_ITEM` or `MSG_UPDATE_ITEM`. The ACs for B-003 do not mention duplicate URL detection. If a future sprint adds duplicate-URL checking to `createItem`, the dialog error-rendering path (which already handles `ERR_VALIDATION` from the SW) will surface the error generically. No B-003 code change would be required. Adding proactive duplicate-URL detection in B-003 would require a full-collection read before every submit — a performance and scope violation. Explicitly deferred.

**OQ-5 — Dialog mount point: inline in sidepanel.html vs dynamically created in JS**

**Decision: The overlay and both dialogs (CRUD dialog + confirmation dialog) are declared as static HTML in `sidepanel.html` with `hidden` attribute, then shown/hidden by JS. They are NOT dynamically created via `document.createElement`.**

Rationale: Static HTML in `sidepanel.html` keeps DOM structure reviewable, makes ARIA relationships (`aria-labelledby`, `aria-describedby`) stable, avoids the overhead of re-parsing template strings on every dialog open, and integrates cleanly with the existing CSS file. The sidepanel is not a component tree — it is a single document. Dynamic creation would add complexity without benefit in this context. The dialogs are hidden at paint time (`[hidden]` → `display: none !important`), so they incur zero layout cost while closed.

---

### 15.2 HTML Additions (to sidepanel.html)

All additions are static markup. No new files are created. Changes are additive only.

#### A. Panel header (`#panel-header`)

Inserted as the **first child of `<body>`**, before `#skeleton`.

```html
<div id="panel-header" class="panel-header" hidden>
  <span class="panel-header-title">Tab Junkie</span>
  <button
    id="add-bookmark-btn"
    class="header-add-btn"
    aria-label="Add bookmark"
    type="button"
  >
    <!-- inline SVG: 16×16 plus icon -->
  </button>
</div>
```

- `hidden` attribute: removed by JS when `renderAll` transitions to the populated state (same lifecycle as `#item-list`).
- `.panel-header`: flex row, space-between, `position: sticky; top: 0; z-index: 10` so it stays visible when the list scrolls.
- The `#item-list` height rule (`height: 100vh`) will need to change to `height: calc(100vh - <header-height>)` — the [frontend-engineer] is responsible for this adjustment.

#### B. Empty-state CTA fix

The existing `button.empty-state-cta` currently has `disabled` attribute and `cursor: default`. **B-003 removes `disabled` and enables it as the primary create trigger.** The existing element requires no structural change, only CSS and a JS handler.

#### C. CRUD dialog (create + edit)

Inserted as the **last child of `<body>`**, after all state containers.

```html
<!-- Dialog overlay (backdrop + modal) -->
<div id="dialog-overlay" class="dialog-overlay" hidden aria-hidden="true">

  <div
    id="bookmark-dialog"
    class="dialog-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="dialog-title"
  >
    <h2 id="dialog-title" class="dialog-title">Add Bookmark</h2>

    <form id="bookmark-form" class="dialog-form" novalidate>

      <div class="dialog-field">
        <label for="field-title" class="dialog-label">Title</label>
        <input
          id="field-title"
          name="title"
          type="text"
          class="dialog-input"
          autocomplete="off"
          maxlength="512"
          required
        />
        <span id="error-title" class="dialog-field-error" aria-live="polite" hidden></span>
      </div>

      <div class="dialog-field">
        <label for="field-url" class="dialog-label">URL</label>
        <input
          id="field-url"
          name="url"
          type="url"
          class="dialog-input"
          autocomplete="off"
          required
        />
        <span id="error-url" class="dialog-field-error" aria-live="polite" hidden></span>
      </div>

      <div class="dialog-field">
        <label for="field-group" class="dialog-label">Group</label>
        <select id="field-group" name="groupId" class="dialog-select">
          <!-- Options populated dynamically on every open via MSG_LIST_GROUPS -->
          <!-- First option is always: <option value="">Ungrouped</option> -->
        </select>
      </div>

      <span id="error-dialog" class="dialog-error" aria-live="assertive" hidden></span>

      <div class="dialog-actions">
        <button type="button" id="dialog-cancel-btn" class="dialog-btn dialog-btn--secondary">Cancel</button>
        <button type="submit" id="dialog-submit-btn" class="dialog-btn dialog-btn--primary">Save</button>
      </div>

    </form>
  </div>

</div>
```

Key attributes:
- `#dialog-overlay`: full-panel backdrop. `hidden` when closed. `aria-hidden="true"` when closed (toggled by JS alongside `hidden`).
- `#bookmark-dialog`: the focusable modal card. `aria-modal="true"` confines virtual cursor to dialog.
- `aria-labelledby="dialog-title"`: title text announced as dialog name. JS updates `#dialog-title` text for create ("Add Bookmark") vs edit ("Edit Bookmark").
- `#error-title`, `#error-url`: inline field errors. `aria-live="polite"` so screen readers announce them after submission attempt. Set `hidden` when empty, remove `hidden` when content is set.
- `#error-dialog`: dialog-level error (e.g., `ERR_NOT_FOUND` on edit submit). `aria-live="assertive"`.
- `maxlength="512"` on `#field-title`: client-side cap per AC13. The SW enforces `MAX_TITLE=2048`; B-003 applies the tighter AC13 cap of 512 chars at the form level.
- `type="url"` on `#field-url`: browser's native URL parsing is used as the first-pass format check (AC12 client-side validation), before dispatching to the SW.
- `novalidate` on `<form>`: disables browser's default validation UI in favor of B-003's custom inline error rendering.

#### D. Confirmation dialog (delete non-live-tab item)

Separate modal, also inside `#dialog-overlay`. The overlay is shared; only one dialog is visible at a time.

```html
<div
  id="confirm-dialog"
  class="dialog-modal"
  role="alertdialog"
  aria-modal="true"
  aria-labelledby="confirm-title"
  aria-describedby="confirm-body"
  hidden
>
  <h2 id="confirm-title" class="dialog-title">Delete Bookmark?</h2>
  <p id="confirm-body" class="dialog-body">
    <!-- JS sets: "Delete «title»? This cannot be undone." -->
  </p>
  <div class="dialog-actions">
    <button type="button" id="confirm-cancel-btn" class="dialog-btn dialog-btn--secondary">Cancel</button>
    <button type="button" id="confirm-delete-btn" class="dialog-btn dialog-btn--danger">Delete</button>
  </div>
</div>
```

- `role="alertdialog"`: for destructive confirmations (ARIA spec distinction from `role="dialog"`).
- `aria-describedby="confirm-body"`: body text announces automatically on open.
- The title and body text are set by JS before showing.
- `#confirm-dialog` is inside `#dialog-overlay` but a sibling of `#bookmark-dialog`. Overlay `hidden` controls both.

---

### 15.3 CSS Additions (class inventory for sidepanel.css)

No new CSS files. All additions go into `sidepanel.css`.

| Class | Visual role |
|---|---|
| `.panel-header` | Sticky top bar: `display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-primary); position: sticky; top: 0; z-index: 10` |
| `.panel-header-title` | Extension name label: `font-size: 13px; font-weight: 600; color: var(--text-secondary)` |
| `.header-add-btn` | Compact icon button in header: `24×24px; border-radius: 6px; border: 1px solid var(--border-primary); background: var(--bg-primary)`. Focus ring via existing `:focus-visible` rule (no new rule needed if selector is added). |
| `.dialog-overlay` | Full-panel semi-transparent backdrop: `position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100` |
| `.dialog-modal` | Centered card: `background: var(--bg-primary); border: 1px solid var(--border-primary); border-radius: 10px; padding: 20px; width: calc(100% - 32px); max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,0.18)` |
| `.dialog-title` | Modal heading: `font-size: 15px; font-weight: 600; margin-bottom: 16px; color: var(--text-primary)` |
| `.dialog-body` | Confirmation body text: `font-size: 13px; color: var(--text-secondary); margin-bottom: 20px; line-height: 1.5` |
| `.dialog-form` | Stack layout: `display: flex; flex-direction: column; gap: 12px` |
| `.dialog-field` | Per-field wrapper: `display: flex; flex-direction: column; gap: 4px` |
| `.dialog-label` | Field label: `font-size: 12px; font-weight: 500; color: var(--text-secondary)` |
| `.dialog-input` | Text/URL input: `padding: 7px 10px; border: 1px solid var(--border-primary); border-radius: 6px; font-size: 13px; background: var(--bg-primary); color: var(--text-primary)`. Error state: `.dialog-input--error { border-color: #dc2626 }` |
| `.dialog-select` | Group dropdown: same sizing as `.dialog-input`; inherits OS styles with minimal override |
| `.dialog-field-error` | Inline error below field: `font-size: 11px; color: #dc2626; line-height: 1.4` |
| `.dialog-error` | Dialog-level error: `font-size: 12px; color: #dc2626; padding: 8px; background: #fef2f2; border-radius: 6px; border: 1px solid #fecaca` |
| `.dialog-actions` | Button row: `display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px` |
| `.dialog-btn` | Base button: `padding: 7px 14px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer` |
| `.dialog-btn--primary` | Accent fill: `background: var(--accent); color: #fff; border: 1px solid var(--accent)` |
| `.dialog-btn--secondary` | Ghost: `background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-primary)` |
| `.dialog-btn--danger` | Red fill: `background: #dc2626; color: #fff; border: 1px solid #dc2626` |
| `.item-actions` | Per-row action button container: `display: flex; gap: 4px; flex-shrink: 0; opacity: 0; pointer-events: none; transition: opacity 0.1s` |
| `.item-row:hover .item-actions`, `.item-row:focus-within .item-actions` | Reveal on hover/focus: `opacity: 1; pointer-events: auto` |
| `.item-action-btn` | Small icon button: `width: 24px; height: 24px; border-radius: 4px; border: none; background: transparent; display: flex; align-items: center; justify-content: center; color: var(--text-tertiary)` |
| `.item-action-btn:hover` | `background: var(--bg-hover); color: var(--text-primary)` |
| `.item-action-edit` | Edit-specific color on hover: `color: var(--accent)` |
| `.item-action-delete:hover` | Delete-specific color: `color: #dc2626` |

**Dark mode:** All colors above reference existing `--` custom properties, which already have dark/system variants. Only `#dc2626` (error red) and the hardcoded danger-button colors need explicit dark overrides if they fail contrast. The [frontend-engineer] must validate contrast in dark mode during build.

---

### 15.4 JavaScript Architecture

All code lives in `sidepanel/sidepanel.js` (no new files for B-003). The dialog logic is added as new functions in the existing module. The existing event delegation handler is extended — not replaced.

#### Module-level state additions

```js
// Tracks which item is being edited (null when creating)
let _editingItemId = null;

// Tracks which element triggered the current dialog open
// (used by closeDialog to restore focus)
let _dialogTriggerEl = null;

// Cached group list for the picker — refreshed on every dialog open
// No persistent cache; always fetch fresh to avoid stale group names.
let _groupCache = [];
```

#### `openCreateDialog(opts = {})`

**Signature:** `openCreateDialog({ triggerEl })`
- `triggerEl`: the DOM element that triggered the open (for focus restoration on close).
- Sets `_editingItemId = null`.
- Updates `#dialog-title` text to `"Add Bookmark"`.
- Clears all form fields and all inline errors.
- Calls `_populateGroupPicker()` (awaits MSG_LIST_GROUPS; shows "Loading…" option while in-flight).
- Shows `#dialog-overlay` and `#bookmark-dialog`; hides `#confirm-dialog`.
- Sets `aria-hidden="false"` on `#dialog-overlay`.
- Moves focus to `#field-title`.
- Activates focus trap (see Focus Trap section).

#### `openEditDialog(item)`

**Signature:** `openEditDialog(item, { triggerEl })`
- `item`: the full Item object (title, url, groupId).
- `triggerEl`: the edit button element.
- Sets `_editingItemId = item.id`.
- Updates `#dialog-title` text to `"Edit Bookmark"`.
- Pre-populates `#field-title.value = item.title`, `#field-url.value = item.url`.
- Calls `_populateGroupPicker()`, then after it resolves, sets `#field-group.value = item.groupId ?? ""`.
- Clears all inline errors.
- Shows `#dialog-overlay` and `#bookmark-dialog`.
- Moves focus to `#field-title`.
- Activates focus trap.

#### `closeDialog()`

- Adds `hidden` to `#dialog-overlay`; sets `aria-hidden="true"`.
- Removes focus trap.
- Restores focus to `_dialogTriggerEl` (if it is still in the DOM; fallback to `document.body`).
- Resets `_editingItemId = null`, `_dialogTriggerEl = null`.
- Does NOT clear form fields — they are cleared on open, not on close, so there is no flash of stale content.

#### `openConfirmDialog(item, onConfirm, { triggerEl })`

- Sets confirm dialog body text to `"Delete "${item.title}"? This cannot be undone."`.
- Shows `#dialog-overlay` and `#confirm-dialog`; hides `#bookmark-dialog`.
- Moves focus to `#confirm-cancel-btn` (safe default for destructive action — user must actively move to Delete).
- Activates focus trap scoped to `#confirm-dialog`.
- `onConfirm` is called when `#confirm-delete-btn` is clicked. `closeDialog()` is called in both confirm and cancel paths.

#### `_populateGroupPicker(selectedGroupId = null)`

**Always called on dialog open — no persistent cache.**

```
1. Set <select> to single "Loading groups…" disabled option
2. sendMessage(MSG_LIST_GROUPS, {})
3. On resolve: clear select; insert <option value="">Ungrouped</option> first
4. For each group (sorted by sortOrder): insert <option value="{group.id}">{group.name}</option>
5. Set select.value = selectedGroupId ?? "" (defaults to Ungrouped)
6. On reject: insert <option value="">Ungrouped</option> only (graceful degradation)
```

Rationale for always fetching: the dialog may be opened while the group list is being mutated by another message. Fetching on open ensures the list is always current. The fetch is fast (single storage.local.get on the SW side) and this is a user-triggered action, so latency is not a concern.

#### Client-side validation — `_validateForm()`

Returns `{ valid: boolean }`. Called on form submit. Runs synchronously before any message dispatch.

Validation rules (in order):
1. `title = #field-title.value.trim()`. If empty → set `#error-title` to "Title is required." → `valid: false`.
2. ~~If `title.length > 512` → set `#error-title` to "Title must be 512 characters or fewer."~~ **Removed (D-5):** `maxlength="512"` on the input enforces this at the browser level; the JS guard was unreachable dead code. See §15.9 D-5.
3. `url = #field-url.value.trim()`. If empty → set `#error-url` to "URL is required." → `valid: false`.
4. Try `new URL(url)`. If it throws, or if the resulting protocol is not in `['http:', 'https:']` → set `#error-url` to "Enter a valid URL (must start with http:// or https://)." → `valid: false`. Note: `ftp:` and `mailto:` are valid at the storage layer but are not surfaced in the create/edit dialog to avoid user confusion; they can be added in a future sprint if needed.
5. If all pass → clear all inline errors → `valid: true`.

Error attach/detach:
- `_setFieldError(errorEl, inputEl, message)`: sets `errorEl.textContent = message`, removes `hidden` from `errorEl`, adds class `dialog-input--error` to `inputEl`.
- `_clearFieldError(errorEl, inputEl)`: clears text, adds `hidden`, removes `dialog-input--error`.
- Called at the start of each submit attempt to clear stale errors before re-running validation.

#### Form submit handler

Attached to `#bookmark-form` via `addEventListener('submit', ...)`.

```
1. e.preventDefault()
2. _validateForm() → if not valid, return
3. Disable #dialog-submit-btn, set textContent "Saving…"
4. Build payload: { title, url, groupId: #field-group.value || null }
5. If _editingItemId is null: sendMessage(MSG_CREATE_ITEM, payload)
   Else: sendMessage(MSG_UPDATE_ITEM, { id: _editingItemId, title, url, groupId })
6. On success: closeDialog() — re-render triggered by MSG_STATE_CHANGED broadcast from SW
7. On error (resp.error.code):
   - ERR_VALIDATION → parse message; show in #error-url or #error-title heuristically
     (if message contains "url" → url field; otherwise → title field; fallback → #error-dialog)
   - ERR_NOT_FOUND (edit path) → show in #error-dialog: "This bookmark was deleted by another window."
   - Other → show in #error-dialog: "Something went wrong. Please try again."
8. Re-enable #dialog-submit-btn, restore label "Save"
```

#### Event delegation extensions (in existing `document.addEventListener('click', ...)`)

New branches added to the existing click handler:

```js
// Empty-state CTA
if (e.target.closest('.empty-state-cta')) {
  openCreateDialog({ triggerEl: e.target.closest('.empty-state-cta') });
  return;
}

// Header add button
if (e.target.closest('#add-bookmark-btn')) {
  openCreateDialog({ triggerEl: e.target.closest('#add-bookmark-btn') });
  return;
}

// Per-item edit/delete action buttons
const actionBtn = e.target.closest('[data-action]');
if (actionBtn) {
  e.stopPropagation(); // prevent row click (navigate) from firing
  const row = actionBtn.closest('.item-row');
  const itemId = row?.dataset.itemId;
  if (!itemId) return;
  if (actionBtn.dataset.action === 'edit') {
    // Fetch item data, then open edit dialog
    sendMessage(MSG_GET_ITEM, { id: itemId }).then(item => {
      if (item) openEditDialog(item, { triggerEl: actionBtn });
    }).catch(() => {}); // silent fail — item may have been deleted
    return;
  }
  if (actionBtn.dataset.action === 'delete') {
    const isLive = row.dataset.live === 'true';
    if (isLive) {
      sendMessage(MSG_DEMOTE_ITEM, { id: itemId }).catch(() => {});
    } else {
      const title = row.querySelector('.item-title')?.textContent ?? 'this bookmark';
      const syntheticItem = { id: itemId, title };
      openConfirmDialog(syntheticItem, () => {
        sendMessage(MSG_DELETE_ITEM, { id: itemId }).catch(() => {});
      }, { triggerEl: actionBtn });
    }
    return;
  }
}

// Dialog cancel buttons
if (e.target.closest('#dialog-cancel-btn') || e.target.closest('#confirm-cancel-btn')) {
  closeDialog();
  return;
}

// Confirm delete button
if (e.target.closest('#confirm-delete-btn')) {
  // onConfirm callback is called here (stored in module-level ref set by openConfirmDialog)
  _pendingConfirmCallback?.();
  closeDialog();
  return;
}

// Overlay backdrop click (click on overlay but not on modal)
if (e.target === document.getElementById('dialog-overlay')) {
  closeDialog();
  return;
}
```

A module-level `_pendingConfirmCallback` holds the `onConfirm` closure set by `openConfirmDialog`.

#### Keyboard handling extensions (in existing `document.addEventListener('keydown', ...)`)

```js
// Escape closes any open dialog
if (e.key === 'Escape') {
  const overlay = document.getElementById('dialog-overlay');
  if (!overlay.hidden) {
    e.preventDefault();
    closeDialog();
    return;
  }
}

// Enter on form inputs submits (browser default on <form> handles this;
// no extra handler needed because the form has a type="submit" button)
```

#### Focus trap implementation

**Pattern: `inert` attribute on all siblings of the dialog, not a manual Tab-cycle interceptor.**

When a dialog opens:
1. All direct children of `<body>` that are NOT `#dialog-overlay` receive `inert` attribute (`#skeleton`, `#empty-state`, `#error-state`, `#item-list`, `#panel-header`).
2. `inert` makes those elements non-focusable and hides them from the accessibility tree without removing them from the DOM.
3. Focus is placed on the first interactive element inside the active dialog modal (`#field-title` for CRUD, `#confirm-cancel-btn` for confirm).

When a dialog closes:
1. `inert` is removed from all sibling elements.
2. Focus returns to `_dialogTriggerEl`.

Rationale for `inert` over manual Tab trapping: `inert` is supported in all Chromium versions that support MV3 extensions (Chrome 102+, Edge 102+). It correctly handles nested focusable elements, shadow DOM, and iframes without any manual `Tab`/`Shift+Tab` interception logic. It is the WCAG-recommended modern approach. No polyfill needed.

---

### 15.5 Message Flow Diagrams

#### Create happy path
```
User → clicks "Add Bookmark" (empty-state CTA or header button)
  → openCreateDialog()
    → MSG_LIST_GROUPS → SW → Group[] (populates picker)
  → User fills form, clicks Save / presses Enter
    → _validateForm() → valid: true
    → MSG_CREATE_ITEM { title, url, groupId } → SW
      → SW: createItem() → writeTransaction(PARTITION_ITEMS)
        → broadcastState(SCOPE.ITEMS)
          → MSG_STATE_CHANGED { scope: 'items' } → sidepanel
            → renderAll() triggered
    → ok: true, data: Item
  → closeDialog() (focus returns to trigger)
```

#### Edit happy path
```
User → hovers item row → clicks edit button
  → MSG_GET_ITEM { id } → SW → Item
  → openEditDialog(item)
    → MSG_LIST_GROUPS → SW → Group[] (populates picker, pre-selects item.groupId)
  → User edits fields, clicks Save
    → _validateForm() → valid: true
    → MSG_UPDATE_ITEM { id, title, url, groupId } → SW
      → SW: updateItem() → writeTransaction(PARTITION_ITEMS)
        → broadcastState(SCOPE.ITEMS)
          → MSG_STATE_CHANGED { scope: 'items' } → sidepanel
            → renderAll() triggered
    → ok: true, data: Item
  → closeDialog()
```

#### Delete → live tab path
```
User → hovers item row (data-live="true") → clicks delete button
  → row.dataset.live === 'true'
  → MSG_DEMOTE_ITEM { id } → SW → null
    (No confirmation dialog. SW: delete → clearDrift → saveFloating → releaseClaim)
    → broadcastState(SCOPE.ITEMS)
      → MSG_STATE_CHANGED → sidepanel → renderAll()
```

#### Delete → non-live-tab path
```
User → hovers item row (no data-live) → clicks delete button
  → openConfirmDialog(item, onConfirm)
    → focus: #confirm-cancel-btn
  → User clicks "Delete"
    → _pendingConfirmCallback()
      → MSG_DELETE_ITEM { id } → SW → null
        → broadcastState(SCOPE.ITEMS)
          → MSG_STATE_CHANGED → sidepanel → renderAll()
    → closeDialog()
  → User clicks "Cancel"
    → closeDialog() (no message dispatched)
```

#### Validation error path (client-side)
```
User → submits form with empty title
  → _validateForm()
    → title.trim().length === 0
    → _setFieldError(#error-title, #field-title, "Title is required.")
    → returns { valid: false }
  → no message dispatched
  → focus stays in dialog
```

#### Validation error path (ERR_VALIDATION from SW)
```
User → submits form (passes client-side validation)
  → MSG_CREATE_ITEM { title, url, groupId } → SW
    → SW rejects with { ok: false, error: { code: 'ERR_VALIDATION', message: '...' } }
  → error handling branch:
    → if message contains 'url' → _setFieldError(#error-url, ...)
    → else → _setFieldError(#error-title, ...) or #error-dialog
  → #dialog-submit-btn re-enabled
  → focus stays in dialog (user corrects and resubmits)
```

---

### 15.6 What is NOT in scope for B-003

The following are explicitly excluded and must not be implemented as part of B-003:

- **Drag-to-reorder** items within a dialog or list (B-030).
- **Create/Edit/Delete Groups** — B-003 covers items only. Group management is a separate backlog item.
- **Favicon fetching** for the item avatar in the list (B-004).
- **Duplicate URL detection in createItem/updateItem** — `ERR_DUPLICATE_URL` is currently only on `MSG_PROMOTE_TAB`. B-003 renders the error generically if the SW ever emits it, but does not proactively check for duplicates.
- **Fuzzy search** of the item list (separate backlog item).
- **Sorting or reordering items in the group picker** beyond what the SW returns.
- **Rich text or markdown in titles/URLs**.
- **Batch delete** (selecting multiple items).
- **`ftp:` and `mailto:` URL schemes** in the create/edit URL field (client-side validation restricts to `http:`/`https:` only for now; storage layer accepts them).
- **Mobile/touch layout** — desktop-first per CLAUDE.md non-negotiables.
- **The `newtab/` or `popup/` surfaces** — B-003 scopes exclusively to `sidepanel/`.
- **Any changes to `manifest.json`** — no new permissions are required. `MSG_GET_ITEM`, `MSG_CREATE_ITEM`, `MSG_UPDATE_ITEM`, `MSG_DELETE_ITEM`, `MSG_DEMOTE_ITEM`, and `MSG_LIST_GROUPS` are all already in the message registry with the correct sender allowance for sidepanel.

---

### 15.7 Manifest Permission Impact

Zero new permissions. All message types used by B-003 (`MSG_GET_ITEM`, `MSG_CREATE_ITEM`, `MSG_UPDATE_ITEM`, `MSG_DELETE_ITEM`, `MSG_DEMOTE_ITEM`, `MSG_LIST_GROUPS`) are already declared in `shared/messages.js` and wired in `storage-handlers.js` with `sidepanel` as an allowed sender (per §5 message registry). No `manifest.json` changes are required for B-003.

---

### 15.8 Shared File Governance Notes

- `shared/messages.js` — **read only**. All required message types are already present. No additions.
- `shared/errors.js` — **read only**. `ERR_VALIDATION`, `ERR_NOT_FOUND` are the only SW error codes B-003 handles specially; both already exist.
- `shared/constants.js` — **read only**. `GROUP_COLORS` is not used by B-003 dialogs (group color selection is out of scope).
- `sidepanel/sidepanel.js` — **primary file**. All new JS logic is added here.
- `sidepanel/sidepanel.html` — **structural additions only**. New static HTML for header, dialogs. No removals.
- `sidepanel/sidepanel.css` — **additions only**. New classes for dialog and header. No changes to existing rules.

---

### 15.9 R6 Close — As-Built Deviations from R2 Plan

The following deviations were discovered during R3 build and R4 review. All are improvements over the R2 spec.

| # | R2 Plan | As-Built | Reason |
|---|---------|----------|--------|
| D-1 | Event delegation used `e.target === addBookmarkBtnEl` for the header add button | Changed to `e.target.closest('#add-bookmark-btn')` | SVG child elements (the `<path>` inside the `<svg>` icon) intercepted click events, so `e.target` was the SVG path, not the button. `closest()` walks up to the button regardless of which child was clicked. |
| D-2 | `_activateFocusTrap` sets `inert` on all `<body>` direct children except `#dialog-overlay` | `_activateFocusTrap(activeDialogEl)` now also inerts sibling dialogs *within* `#dialog-overlay` | R2 only considered body-level siblings. When the confirm dialog opens inside the overlay, `#bookmark-dialog` is a sibling that must also be inerted to prevent focus leaking between dialogs. Discovered in R4 review. |
| D-3 | Re-render relies solely on `MSG_STATE_CHANGED` broadcast from SW after create/update | Added fallback fire-and-forget `Promise.all([MSG_LIST_ITEMS, MSG_LIST_GROUPS])` re-render after successful create/update | Belt-and-suspenders against broadcast loss (e.g., if the SW shuts down between write and broadcast). The broadcast path is still primary; the fallback is a safety net. |
| D-4 | Per-item action buttons had `tabindex="-1"` to keep them out of Tab order | `tabindex="-1"` removed; buttons are now keyboard-focusable in normal Tab order | R4 accessibility finding: `tabindex="-1"` made action buttons unreachable by keyboard-only users. Since the buttons are visually revealed on `:focus-within`, they must be focusable to complete the interaction. |
| D-5 | `_validateForm()` included a JS guard `if (title.length > 512)` | Guard removed as dead code | The `<input maxlength="512">` attribute enforces the cap at the browser level, making the JS guard unreachable. Removing it eliminates dead code per CLAUDE.md non-negotiables. |

---

### 15.10 R6 Close — OQ Resolution Confirmation

All five Open Question resolutions from §15.1 were confirmed accurate as-built:

- **OQ-1** (Ungrouped = `""` in HTML, `null` on wire): Implemented as designed. `_populateGroupPicker` inserts `<option value="">Ungrouped</option>` first; submit handler converts via `selectEl.value || null`.
- **OQ-2** (Panel header with `#add-bookmark-btn`): Implemented as designed. `#panel-header` is first child of `<body>`, button revealed by `renderAll`.
- **OQ-3** (Per-item edit/delete action buttons via `data-action`): Implemented as designed, with D-4 deviation (tabindex removed).
- **OQ-4** (ERR_DUPLICATE_URL out of scope): Confirmed out of scope. No duplicate-URL logic was added.
- **OQ-5** (Static HTML dialogs, not dynamic creation): Implemented as designed. Both dialogs are static in `sidepanel.html`.

---

### 15.11 Lesson Learned — SVG-Icon Buttons and Event Delegation

**Pattern**: When using inline SVG icons inside `<button>` elements, event delegation via `e.target === buttonEl` will fail because the click target is often the `<svg>`, `<path>`, or `<circle>` child element, not the button itself.

**Rule**: Always use `e.target.closest('#button-id')` or `e.target.closest('.button-class')` for event delegation on any button that contains child elements (SVG icons, `<span>` labels, etc.). This applies to all future icon buttons across the extension.

**Applies to**: `#add-bookmark-btn`, `.item-action-btn`, and any future buttons with SVG icons in sidepanel, newtab, or popup surfaces.

---

