# Managing Bookmarks — Select, Act, and Navigate

This page covers three related features shipped in Sprint 12: selecting multiple items at once, the right-click context menu for individual items, and the feedback messages you see when lists are empty or an operation fails.

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

### Bulk action bar

Once one or more items are selected, a bar appears at the bottom of the panel showing how many items are selected and offering the following actions:

- **Move to group** — opens a group picker so you can reassign all selected items at once.
- **Close tabs** — closes the browser tabs for every selected item that is currently open. Items that are not open are unaffected.
- **Remove** — removes the saved entry for each selected item. For items whose tab is open, the tab remains open but the bookmark is deleted. For items whose tab is closed, the bookmark is deleted entirely. A confirmation dialog ("Remove N items?") appears before anything is deleted.
- **Clear** — deselects everything without taking any other action.

If you apply a filter before using Ctrl+A, only the filtered (visible) items are selected — hidden items are never included.

---

## Right-click context menu

Right-clicking any bookmark row opens a small context menu with actions for that single item.

| Action | Description |
|--------|-------------|
| Navigate | Switch to the item's open tab, or open a new tab if it is not currently open |
| Edit | Open the edit dialog to change the item's title, URL, or group |
| Move to group | Reassign the item to a different group via the group picker |
| Close tab | Close the browser tab for this item. Only available when the item's tab is currently open. |
| Delete | Remove the bookmark permanently. This action is shown in red to indicate it is destructive. |

**Closing the menu:** press Escape or click anywhere outside the menu.

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
