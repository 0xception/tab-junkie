# Managing Bookmarks — Select, Act, and Navigate

This page covers selecting multiple items at once, right-click context menus, keyboard shortcuts, and the feedback messages you see when lists are empty or an operation fails.

---

## Multi-select and bulk actions

You can select one or more items in the side panel and act on all of them in a single step.

### Selection gestures

| Gesture | Effect |
|---------|--------|
| Click | Navigate to the item (open or focus its tab) |
| Ctrl+Click / Cmd+Click | Toggle that item in or out of the selection |
| Shift+Click | Select a range from the last-clicked item to the one you just clicked |
| Ctrl+A / Cmd+A | Select all items currently visible (respects any active filter) |
| Escape | Clear the selection without navigating or closing anything |

Double-clicking navigates to an item even when a selection is active.

**Keyboard shortcuts note:** Ctrl/Cmd+A and Escape work anywhere in the panel except when your cursor is inside a text field (the filter bar, for example). This prevents the shortcuts from interfering with normal typing.

### Bulk action bar

Once one or more items are selected, a bar appears at the bottom of the panel showing how many items are selected and offering the following actions:

- **Move to group** — opens the group picker (see [The group picker](#the-group-picker) below) so you can reassign all selected items at once.
- **Close tabs** — closes the browser tabs for every selected item that is currently open. Items that are not open are unaffected.
- **Remove** — removes the saved entry for each selected item. For items whose tab is open, the tab remains open but the bookmark is deleted. For items whose tab is closed, the bookmark is deleted entirely. A confirmation dialog ("Remove N items?") appears before anything is deleted.
- **Clear** — deselects everything without taking any other action.

If you apply a filter before using Ctrl+A, only the filtered (visible) items are selected — hidden items are never included.

---

## Right-click context menu

### Single-item menu

Right-clicking any bookmark row (with no multi-item selection active) opens a context menu for that single item.

| Action | Description |
|--------|-------------|
| Navigate | Switch to the item's open tab, or open a new tab if it is not currently open |
| Edit | Open the edit dialog to change the item's title, URL, or group |
| Move to group | Reassign the item to a different group via the [group picker](#the-group-picker) |
| Close tab | Close the browser tab for this item. Only available when the item's tab is currently open. |
| Delete | Remove the bookmark permanently. This action is shown in red to indicate it is destructive. |

### Selection context menu

When two or more items are selected, right-clicking any selected row opens the selection context menu instead. Every action in this menu operates on all selected items at once — the same operations as the bulk action bar, reachable from the keyboard or mouse without moving to the bottom of the panel.

| Action | Description |
|--------|-------------|
| Move to group | Reassign all selected items to a different group via the [group picker](#the-group-picker) |
| Close tabs | Close the browser tabs for every selected item that is currently open |
| Remove | Delete the saved entries for all selected items (with confirmation) |

### Group header context menu

Right-clicking a named group's header opens a menu that acts on the group as a whole.

| Action | Description |
|--------|-------------|
| Open all bookmarks | Open every bookmark in the group as a new tab (or focus the existing tab if one is already open) |
| Close all open tabs | Close every tab that belongs to this group's items — bookmarks are kept |
| Select all | Select every item in the group |
| Select open | Select only the items in the group whose tabs are currently open |
| Select bookmarked | Select only the items in the group that have no open tab |
| Move items out of group | Send every item in the group to Ungrouped in one step. The group itself is kept. |
| Edit group | Open the edit dialog to rename the group or change its color |
| Delete group | Delete the group. Items in the group move to Ungrouped. A confirmation is required. |

The **Ungrouped** header is a virtual section, not a real group, so right-clicking it shows the browser's native context menu instead.

**Closing any menu:** press Escape, click anywhere outside the menu, or click outside the side panel entirely (for example, on the web page, the address bar, or another Chrome tab). The menu dismisses itself in all of these cases. Moving the mouse away without clicking does not close it.

The menu automatically adjusts its position so it never renders partially off-screen, even near the edges of the panel.

---

## The group picker

Every **Move to group** action — from the bulk action bar, the single-item and selection context menus, and the Open Tabs **Save to group** action — opens the same modal picker.

The picker shows:

- A filter box (focused automatically) — type part of a group name to narrow the list.
- One row per group, showing the group's color chip, name, saved-item count, and open-tab count.
- **Create group** link — shown at the top of an otherwise empty list when no groups exist yet. Selecting it opens the group-create dialog so you can add a group without leaving the picker flow.

Keyboard shortcuts inside the picker:

| Key | Effect |
|-----|--------|
| Arrow Up / Down | Move the highlight between groups in the list |
| Enter | Confirm the highlighted group and run the move |
| Escape | Close the picker without moving anything |
| Tab / Shift+Tab | Cycle focus between the filter, the list, and the close control |

While the picker is open, focus stays inside it — pressing Tab will not land outside the modal. Closing the picker with Escape or the close control leaves your selection unchanged.

---

## Saving URLs and duplicates

### Supported URL schemes

Tab Junkie saves bookmarks for most URL schemes, including regular web pages (`http`, `https`), local files (`file`), and browser-internal pages (`chrome://`, `edge://`, `chrome-extension://`, `about:`, `view-source:`).

Only two schemes are rejected outright:

- `javascript:` — blocked because running arbitrary script from a stored URL is a security risk.
- `data:` — blocked because data URLs can carry arbitrary content and cannot be safely restored.

In the Open Tabs section, rows with these two schemes are shown dimmed with a "Cannot be saved" tooltip so you can see at a glance which tabs you will not be able to bookmark.

**Cross-browser note:** browser-specific URLs are saved as-is. A bookmark for `edge://settings` will not work in Chrome and vice versa — there is no automatic translation between browser-internal URL schemes.

### Duplicate URLs

Saving a URL that matches an existing bookmark is now allowed. When you try to save a duplicate, a confirmation appears:

> URL already saved — save anyway?

Choosing **Save anyway** creates an additional saved copy in the group you picked. Choosing **Cancel** leaves your bookmarks unchanged.

For bulk Save-to-group operations (multiple Open Tabs rows saved at once), the confirmation is aggregated across the batch — for example, "3 of 5 tabs already saved — save anyway?" Confirming saves the whole batch, including the duplicates; cancelling aborts the entire operation.

---

## Empty states and error feedback

### Empty bookmark list

If you have not added any bookmarks yet, the panel shows an icon, a short message, and an **Add bookmark** button so you can get started right away.

### No filter results

If you type in the filter bar and no items match, the panel shows:

> No results for "your query"

A link below the message lets you clear the filter and return to the full list in one click.

### Empty group

If a group exists but contains no items, an inline message — "No items in this group" — is shown in place of the item list for that group.

### Error notifications (toasts)

When an operation fails (for example, a save fails due to a storage issue), a notification appears in the bottom-left corner of the panel. It dismisses itself after 4 seconds, or you can close it manually by clicking the dismiss button.

Error messages describe what went wrong in plain language. No technical codes are shown to end users.

---

## Drag and drop

### Reordering bookmarks

Drag any bookmark row up or down to change its position within its group, or drop it into a different group to move it there. A horizontal insertion indicator shows exactly where the item will land. Release to commit, or press **Escape** to cancel without making any changes.

Drop a bookmark onto the **Ungrouped** section to remove it from its group.

### Dragging multiple items at once

You can drag a selection of bookmarks as a single unit:

1. Select the items you want to move using Ctrl/Cmd+Click, Shift+Click, or Ctrl/Cmd+A.
2. Click and hold any item in the selection and start dragging.
3. A drag ghost appears with a count badge showing how many items are moving.
4. Drop the group onto the target position. All items land there in their original relative order.

This works across groups and into the Ungrouped section. If you have no selection active, dragging picks up only the single item under your pointer.

### Reordering and nesting groups

You can drag a group header to reorder groups or nest one group inside another.

| Drop zone | Effect |
|-----------|--------|
| Outer quarter of a group header (top or bottom) | Reorder — the dragged group lands above or below the target |
| Middle half of a group header | Nest — the dragged group becomes a sub-group of the target |

A visual indicator shows which zone is active as you hover. Invalid drop targets — such as dropping a group onto itself, creating a circular reference, or trying to nest deeper than one level — are highlighted in red and the drop is rejected.

**Nesting limit:** Tab Junkie supports one level of nesting. A group that already has sub-groups cannot be nested inside another group.

### Auto-scroll during drag

When you drag near the top or bottom edge of the bookmark list, the list scrolls automatically in that direction. Scroll speed increases the closer your pointer is to the edge and stops as soon as you move away from the scroll zone or release the drag.
