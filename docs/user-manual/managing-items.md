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

### Group header context menu

Right-clicking a named group's header opens a menu that acts on the group as a whole.

| Action | Description |
|--------|-------------|
| Open all bookmarks | Open every bookmark in the group as a new tab (or focus the existing tab if one is already open) |
| Close all open tabs | Close every tab that belongs to this group's items — bookmarks are kept |
| Select all | Select every item in the group |
| Select open | Select only the items in the group whose tabs are currently open |
| Select bookmarked | Select only the items in the group that have no open tab |
| Edit group | Open the edit dialog to rename the group or change its color |
| Delete group | Delete the group. Items in the group move to Ungrouped. A confirmation is required. |

The **Ungrouped** header is a virtual section, not a real group, so right-clicking it shows the browser's native context menu instead.

**Closing any menu:** press Escape or click anywhere outside the menu.

The menu automatically adjusts its position so it never renders partially off-screen, even near the edges of the panel.

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
