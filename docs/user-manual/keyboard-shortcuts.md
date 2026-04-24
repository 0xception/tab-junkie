# Keyboard Shortcuts

Tab Junkie registers global keyboard shortcuts so you can open its surfaces from any browser tab — without clicking the extension icon or switching windows.

---

## Default shortcuts

| Shortcut | Action |
|----------|--------|
| **Alt+J** | Open the quick-search popup |
| **Alt+K** | Open the group-jump popup |
| **Alt+Shift+J** | Open Tab Junkie in a standalone window |
| *(unbound — user-assignable)* | Open the Tab Junkie side panel |

The three shortcuts with default keys (Alt+J, Alt+K, Alt+Shift+J) work from any ordinary browser tab. The side-panel shortcut has no default key assigned; you can set one yourself (see below).

> **Browser limit:** most Chromium-based browsers cap custom extension commands at 4 user-assignable slots (the built-in `_execute_action` and `_execute_side_panel` entries do not count toward this limit). Tab Junkie currently uses 2 custom slots (`open-junkie-window`, `group-jump`), leaving room for future shortcuts.

---

## How shortcuts work

Shortcuts are registered globally, meaning you do not need to have the Tab Junkie side panel or any Tab Junkie surface open for them to respond. Press the key combination from any browser tab and the corresponding surface opens immediately.

- **Alt+J** opens the [quick-search popup](quick-search-popup.md), which lets you fuzzy-search bookmarks and open tabs by title or URL.
- **Alt+K** opens the [group-jump popup](group-jump-popup.md), which lets you jump directly to a bookmark group.
- **Alt+Shift+J** opens a standalone Tab Junkie window. If the window is already open, this shortcut brings it into focus rather than opening a second copy.

---

## Customizing shortcuts

You can remap any shortcut to a key combination that suits your workflow:

- **Edge:** go to `edge://extensions/shortcuts`
- **Chrome:** go to `chrome://extensions/shortcuts`

Scroll to Tab Junkie in the list. Click the edit field next to any entry, press your preferred key combination, and the change takes effect immediately — no extension reload required.

> **Conflict note:** if a key combination is already in use by the browser or another extension, the browser may silently ignore the binding. Choose a combination that does not conflict with existing shortcuts on your system.

---

## Accessibility

Keyboard shortcuts are the primary way for keyboard-first users to discover and reach Tab Junkie surfaces without touching the mouse. Once a surface is open, all navigation within it is fully keyboard-accessible — see the individual feature pages for details on in-surface keyboard controls.
