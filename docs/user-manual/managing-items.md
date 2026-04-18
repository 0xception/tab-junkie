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

- **Move to group** — opens a group picker so you can reassign all selected items at once.
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
| Move to group | Reassign the item to a different group via the group picker |
| Close tab | Close the browser tab for this item. Only available when the item's tab is currently open. |
| Delete | Remove the bookmark permanently. This action is shown in red to indicate it is destructive. |

### Selection context menu

When two or more items are selected, right-clicking any selected row opens the selection context menu instead. Every action in this menu operates on all selected items at once — the same operations as the bulk action bar, reachable from the keyboard or mouse without moving to the bottom of the panel.

| Action | Description |
|--------|-------------|
| Move to group | Reassign all selected items to a different group |
| Close tabs | Close the browser tabs for every selected item that is currently open |
| Remove | Delete the saved entries for all selected items (with confirmation) |

**Closing either menu:** press Escape or click anywhere outside the menu.

The menu automatically adjusts its position so it never renders partially off-screen, even near the edges of the panel.

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
