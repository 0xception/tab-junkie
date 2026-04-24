# Quick-Search Popup

The quick-search popup lets you fuzzy-search every saved bookmark and open tab from anywhere in the browser — without switching to the side panel or touching the mouse.

---

## Opening the popup

Press **Alt+J** from any browser tab to open the popup. The search input is focused automatically so you can start typing immediately.

If Alt+J conflicts with another shortcut on your system, you can remap it:

- **Edge:** go to `edge://extensions/shortcuts`
- **Chrome:** go to `chrome://extensions/shortcuts`

Find "Tab Junkie" in the list and update the shortcut for the "Quick Search" action.

---

## Searching

Type any part of a bookmark title or URL. Search is case-insensitive and matches substrings, so typing `git` finds "GitHub", "gitignore docs", and any URL containing `git`. Matching characters are highlighted in the results.

Results are grouped into two sections:

| Section | What it contains |
|---------|-----------------|
| **Bookmarks** | Saved items whose title or URL matches the query |
| **Open Tabs** | Live browser tabs whose title or URL matches the query |

Each section shows a count badge (e.g., "Bookmarks · 7"). A section with zero matches hides completely. Results are capped at 50 total rows.

Each result row shows:
- Favicon (or a letter-avatar if no favicon is available)
- Title (one line, truncated)
- URL (second line, truncated)
- Breadcrumb — group name for saved bookmarks, window label for live tabs

---

## Keyboard navigation

| Key | Action |
|-----|--------|
| **ArrowDown / ArrowUp** | Move selection through the result rows (wraps at both ends) |
| **Enter** | Activate the selected item (see below) |
| **Escape** | Close the popup without navigating or changing anything |
| **Tab** | Move focus between the query input and the result list |

Pressing ArrowDown from the query input selects the first result row without moving the text cursor.

### What Enter does

- **Saved bookmark not currently open** — opens it in a new tab.
- **Saved bookmark that is already open** — switches focus to the existing tab (and its window, if it is in a different window).
- **Open Tabs row** — switches focus to that tab.

The popup closes automatically after any successful activation.

---

## Recent items (empty query)

When the query input is empty the popup shows your most recently opened items (up to 20), displayed under a "Recent" section header. This makes it easy to resume where you left off without typing anything.

If you have not yet opened any item via the popup the section shows a "No recent items yet" message.

---

## Items that appear in both sections

A URL that is saved as a bookmark and also open as a live tab appears once in each section — one row in "Bookmarks" and one row in "Open Tabs". This is intentional:

- Clicking or pressing Enter on the **Bookmarks** row opens the saved entry in a new tab.
- Clicking or pressing Enter on the **Open Tabs** row focuses the tab that is already open.

The two rows are visually distinct (section label and row icon), so it is clear which action you are taking.

---

## Opening the side panel from the popup

Below the results list the popup shows an **Open side panel** button. Clicking it (or pressing **Tab** to focus it, then **Enter**) opens the Tab Junkie side panel in the current window and closes the popup. This is handy when a quick search leads you to a task that needs the full side panel — you do not have to close the popup and then hunt for the extension icon.

---

## Accessibility

The popup is fully keyboard-navigable. It uses standard ARIA roles — the popup is a dialog, the search input is a combobox, the result list is a listbox, and each row is an option. A live region announces the current result count as you type. Focus stays inside the popup until you press Escape or activate an item, so Tab and Shift+Tab do not accidentally leave the popup while you are navigating.
