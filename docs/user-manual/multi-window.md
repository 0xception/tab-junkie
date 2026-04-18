# Multi-Window Mode

When you have two or more browser windows open, Tab Junkie shows you which window each tab belongs to and lets you narrow the side panel view to a single window. This keeps multi-window sessions organized without extra manual effort.

---

## Window badges

A small badge — **W1**, **W2**, **W3**, and so on — appears on saved-item rows and Open Tabs rows when the associated tab is in a different window than the side panel itself. Tabs in the same window as the panel show no badge, keeping the common case noise-free.

Window numbers are assigned in the order windows are first seen during a session. The lowest-numbered open window is W1, the next is W2, and so on.

**Ordinal stability:** if a window closes, its ordinal is retired and the remaining windows are not renumbered. For example, if W2 closes, the remaining windows stay W1 and W3 — they are not collapsed to W1 and W2. This prevents items from appearing to jump between windows.

Window numbers are session-only and are never saved to storage. They reset when you restart the browser.

---

## Window filter row

When two or more browser windows are open, a filter row appears in the side panel header. It contains:

- An **All** chip (selected by default) — shows every item regardless of window.
- One chip per open window — **W1**, **W2**, etc. — in ordinal order.

Selecting a window chip narrows the panel to rows whose live tab is in that window. Saved bookmarks with no open tab are hidden while a specific window is selected, because they have no window to match against.

The filter row disappears automatically when you close windows until only one remains.

---

## Keyboard navigation

The window filter row follows the standard ARIA `tablist` keyboard pattern:

| Key | Effect |
|-----|--------|
| Arrow Left / Right | Move focus between chips |
| Home | Move focus to the All chip |
| End | Move focus to the last window chip |
| Enter or Space | Activate the focused chip |
| Tab | Exit the filter row |

---

## Automatic filter reset

If the window you are currently filtering by closes, the filter resets to **All** automatically. The closed window's chip is removed from the row. If that was the last additional window (leaving only one window open), the filter row itself disappears.

---

## Real-time badge updates

When a tab is moved from one browser window to another (for example, by dragging it out of the tab strip), the badge on that row updates immediately without a full panel refresh. Only the affected row changes.

---

## Out of scope

- Named or labeled windows — ordinals are the only identifier.
- Ordinal assignment based on which window is "more important" — assignment is purely first-seen order, lowest raw ID first at startup.
- Cross-device or cross-profile window awareness.
- Persistent window ordinals across browser restarts.
