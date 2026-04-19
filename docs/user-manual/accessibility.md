# Accessibility

Tab Junkie is designed so that every primary action can be completed with the keyboard, and every row state can be recognized without relying on color alone. This page summarizes the accessibility characteristics of the side panel.

---

## Row states

Each bookmark and Open Tabs row can be in one or more of five states. Each state has a non-color visual cue in addition to any color treatment, so the state is recognizable even in high-contrast modes or to users who perceive color differently.

| State | What it means | Non-color cue |
|-------|---------------|---------------|
| Live | The bookmark has an open browser tab | A dot indicator next to the favicon |
| Active | This is the tab currently in focus in the browser | A left-edge accent bar + a distinct background tint |
| Drifted | The open tab has navigated away from the saved URL | A subtle pattern overlay on the row plus the drift indicator icon |
| Audible | The tab is currently playing audio | A speaker icon inline with the title |
| Selected | The row is part of an active multi-selection | A visible checkbox in the selected state, plus a selection background color |

Hover and keyboard-focus use distinct treatments so you can tell at a glance whether a row is being pointed at or has the keyboard focus.

---

## Screen readers

Every row exposes a single accessible label that describes all active states in a consistent order: **active, live, drifted, audible, selected**. For example, a row might be announced as:

> Active, live, audible — "GitHub — PRs" — github.com

This ordering is deterministic, so repeated announcements for the same row read the same way, and the most operationally important state (active, meaning the tab has focus) is announced first.

The side panel uses ARIA roles for its list structure. The window filter row (visible when two or more browser windows are open) uses the standard ARIA `tablist` pattern.

---

## Keyboard

Every primary action is reachable from the keyboard:

- **Tab / Shift+Tab** — move focus through the side panel.
- **Arrow keys** — navigate inside the group picker and the window filter row.
- **Enter / Space** — activate the focused row, chip, or button.
- **Escape** — close any open menu, dialog, or modal; or clear the current multi-selection.
- **Ctrl+A / Cmd+A** — select every currently visible item (respects any active filter). Suppressed when the cursor is inside a text field such as the filter bar.

The group picker (used by every **Move to group** action) traps focus inside the modal while it is open, so Tab cycles within the picker rather than escaping to the page behind it.

---

## Contrast

Text, icons, and indicators in the side panel meet WCAG AA contrast ratios against their backgrounds in both the light theme and the dark theme. Primary-action buttons ("Save bookmark", "Save group", "Save anyway", and similar) use a text color that adapts to the current theme so the label remains legible on the accent background.

The URL text beneath each bookmark title (the secondary line on every saved-item row) has been strengthened across every theme so that every theme-and-background combination — light, dark, hovered, selected — meets the WCAG AA 4.5:1 contrast ratio. This applies uniformly to item rows everywhere in the panel.

---

## Known gaps

- A small number of tertiary-text surfaces — the group drag handle and some empty-state body messages — remain slightly below WCAG AA contrast. A final sweep to bring these into compliance is tracked for the next release.
