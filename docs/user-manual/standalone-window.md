# Standalone Window

The standalone window opens Tab Junkie in a detachable floating window — separate from the browser's side panel, sitting on top of your tabs. It is useful when you want to keep your bookmark manager visible on a second monitor or work with it independently while browsing.

---

## Opening the window

Press **Alt+Shift+J** from any browser tab. The window appears centered on your active display at 1200×800 pixels and is focused immediately.

If you press **Alt+Shift+J** again while the window is already open, the browser brings it into focus rather than opening a second copy. There is always at most one standalone Tab Junkie window at a time.

If Alt+Shift+J conflicts with another shortcut on your system, you can remap it:

- **Edge:** go to `edge://extensions/shortcuts`
- **Chrome:** go to `chrome://extensions/shortcuts`

Find "Tab Junkie" in the list and update the shortcut for the "Open Tab Junkie window" action.

---

## Size and position

The window opens at **1200×800 px**, centered on your active display. You can resize and reposition it freely after opening — drag the title bar to move it, or drag any edge or corner to resize. The browser does not remember the position or size between sessions; it resets to the default each time you open it.

---

## State sync with the side panel

The standalone window and the side panel share the same underlying data. Changes you make in one surface — adding a bookmark, renaming a group, reordering items — appear in the other surface within a few seconds. You do not need to refresh either surface manually.

If you have the side panel and the standalone window open at the same time:

- Dragging to reorder items within a group updates both surfaces.
- Creating, editing, or deleting a bookmark or group updates both surfaces.
- Tab status changes (a bookmarked URL opening or closing as a live tab) update both surfaces.

---

## Closing and reopening

Close the standalone window the same way you close any browser window — press the **×** button in the title bar, or use your operating-system shortcut (e.g., Alt+F4 on Windows, Cmd+W on macOS). Closing the window does not affect the side panel or your data.

Reopen it any time with **Alt+Shift+J**.

---

## Keyboard and accessibility

The standalone window hosts the same Tab Junkie interface as the side panel. All keyboard shortcuts, focus management, and screen-reader behavior that apply in the side panel apply here as well — see the individual feature pages (such as [Quick-Search Popup](quick-search-popup.md) and [Group Jump Popup](group-jump-popup.md)) for details.

---

## Use cases

- **Multi-monitor setup** — move the standalone window to a second monitor so you can drag bookmarks, manage groups, and monitor open tabs while keeping your primary display free for browsing.
- **Picture-in-picture style** — float the window over your current tab to quickly reference or add bookmarks without switching away from what you are working on.
- **Dedicated session** — keep the standalone window open all day as your bookmark home base while using the side panel only when you need it alongside a specific tab.

---

## Relationship to the side panel

The standalone window and the side panel show the same content and stay in sync, but they are independent surfaces. You can have both open at once. The standalone window does not replace the side panel; it complements it for workflows where a separate, repositionable window is more convenient.
