# Open Tabs Section

The Open Tabs section is a live view of every browser tab that is not yet saved as a bookmark or assigned to a group. It sits at the bottom of the side panel, below all named groups and the Ungrouped saved-items section, and updates in real time as you open, close, or navigate tabs.

---

## What appears here

A tab appears in the Open Tabs section only when all three conditions are true:

1. The tab is currently open in your browser.
2. The tab is not claimed by any saved bookmark (it has no saved counterpart).
3. The tab is not part of a floating group already shown in a named group section.

If a tab is already saved or grouped, it appears in its group — not here.

---

## Navigating to a tab

Click any row to switch focus to that tab and bring its window to the front. The side panel stays open after you click.

Tab rows in the section are sorted by window, then by the tab's position within that window — matching the left-to-right order you see in the browser's native tab strip.

---

## Row indicators

Each open-tab row shows:

- **Favicon** — the tab's actual favicon, or a letter-avatar when no favicon is available
- **Title** — truncated to one line
- **URL** — truncated on a second line
- **Window badge** — shown when more than one browser window is open, so you can tell which window the tab belongs to
- **Speaker icon** — shown when the tab is playing audio
- **Active-tab highlight** — a distinct accent on the tab that currently has focus

---

## Right-click actions

Right-clicking an open-tab row opens a context menu with two actions:

| Action | Description |
|--------|-------------|
| Save to group | Save the tab as a bookmark and assign it to a group you choose |
| Close tab | Close the browser tab immediately. This action is shown in red. |

**Save to group** is not available for tabs with restricted URL schemes (such as `edge://`, `chrome://`, `about:`, or `chrome-extension://`) or when the tab's URL already matches an existing saved bookmark. Attempting to save these tabs shows a categorised error toast that explains the reason (for example, "1 already saved, 1 restricted URL"). Visual indicators to make unsavable tabs obvious before you try to save them are planned for a future release.

---

## Multi-select and bulk actions

Open-tab rows participate in the same multi-select gestures as saved bookmarks (click, Shift+Click, Ctrl/Cmd+Click, Ctrl/Cmd+A). When a selection that includes open-tab rows is active, the bulk action bar shows only the actions valid for those rows:

- **Close tabs** — available for all open-tab rows
- **Move to group (Save)** — promotes the selected open tabs to saved bookmarks in a group you choose

**Remove bookmark** does not appear for open-tab rows because they are not saved items.

A mixed selection of saved items and open-tab rows shows the intersection of valid actions (for example, Close tabs if all selected rows are currently open).

---

## Filter integration

The inline filter at the top of the panel searches open-tab rows alongside saved bookmarks. Matching is case-insensitive and covers both the title and URL of each tab. If no open-tab rows match the current filter query, the entire Open Tabs section (header and content) is hidden until you clear the filter.

---

## Empty state

When all your open tabs are already saved or grouped, the section shows:

> No untracked tabs — all open tabs are saved or grouped

The section header remains visible so you always know where the section is.

---

## Accessibility

The Open Tabs section is keyboard-navigable. Tab and Shift+Tab move focus through each row; pressing Enter on a focused row focuses that browser tab (the same as clicking). The section header count badge is announced to screen readers when the count changes.
