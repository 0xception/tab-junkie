# Group Jump Popup

The group jump popup lets you jump directly to any of your saved groups from anywhere in the browser — without switching to the side panel or touching the mouse.

---

## Opening the popup

Press **Alt+K** from any browser tab to open the popup. The search input is focused automatically so you can start typing immediately.

If Alt+K conflicts with another shortcut on your system, you can remap it:

- **Edge:** go to `edge://extensions/shortcuts`
- **Chrome:** go to `chrome://extensions/shortcuts`

Find "Tab Junkie" in the list and update the shortcut for the "Group Jump" action.

---

## The group list view

When the popup opens you see a list of all your groups. Type any part of a group name to filter the list — matching is case-insensitive and substring-based, so typing `work` finds "Work", "Artwork", and "Networking".

Each row shows:
- Group color chip and name
- Parent breadcrumb for sub-groups (e.g., `Work › Projects`)
- A count badge: `(N bookmarks · M open)` — bookmarks saved in that group and how many of those are currently open as tabs

Sub-groups appear in the list alongside top-level groups; the breadcrumb makes it clear which parent they belong to.

---

## Drilling into a group

> **Enter drills in.** Pressing Enter (or clicking a row) opens the drill-in view for that group — you do not navigate away from the popup.

The drill-in view shows:
- The group's saved bookmarks and any sub-groups it contains
- Its own filter input so you can narrow results within the group
- A **Back** button (top-left of the popup) that returns you to the full group list

From the drill-in view you can open any bookmark by clicking it or pressing Enter on the selected row.

---

## Keyboard navigation

| Key | Action |
|-----|--------|
| **ArrowDown / ArrowUp** | Move selection through the group rows (wraps at both ends) |
| **Enter** | Drill into the selected group (group list view) or open the selected bookmark (drill-in view) |
| **Left arrow** (when input is empty) | Return to the group list from the drill-in view |
| **Escape** | Close the popup without navigating or changing anything |
| **Tab** | Move focus between the query input and the result list |

Pressing ArrowDown from the query input selects the first row without moving the text cursor.

---

## Relationship to the quick-search popup (Alt+J)

The group jump popup (Alt+K) and the quick-search popup (Alt+J) are separate tools:

- **Alt+J** — searches across all bookmarks and open tabs by title or URL.
- **Alt+K** — navigates the group hierarchy; lets you drill into a specific group to see its contents.

Use Alt+J when you know what you are looking for. Use Alt+K when you want to browse or jump to everything inside a particular group.

---

## Accessibility

The popup is fully keyboard-navigable. It uses standard ARIA roles — the popup is a dialog, the search input is a combobox, the group list is a listbox, and each row is an option. A live region announces the current result count as you type. Focus stays inside the popup until you press Escape or activate an item, so Tab and Shift+Tab do not accidentally leave the popup while you are navigating. The popup is compatible with screen readers.
