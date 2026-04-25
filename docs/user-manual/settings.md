# Settings

The Settings page is where you configure Tab Junkie's display, layout, and data preferences. It opens as a dedicated browser tab so you have plenty of room to work — no cramped modal or sidebar overlay.

---

## Opening Settings

There are three ways to open the Settings page:

- **Keyboard shortcut** — press **Alt+,** (Alt+Comma) from any browser tab. If a Settings tab is already open, this shortcut focuses it rather than opening a second copy. You can remap the shortcut at `edge://extensions/shortcuts` (or `chrome://extensions/shortcuts`).
- **Gear icon** — click the **⚙** icon in the top-right corner of the Tab Junkie side panel header.
- **Quick-search popup** — press **Alt+J** to open the quick-search popup, then click the **Open Settings** button in the popup footer.

All three paths focus an existing Settings tab rather than opening a duplicate.

---

## Sections

Settings is organised into six sections from top to bottom.

### Display

Controls how Tab Junkie opens when you trigger it from a shortcut or toolbar icon.

| Setting | Options | Default |
|---------|---------|---------|
| **Display mode** | Side Panel · Standalone Window | Side Panel |

- **Side Panel** — pressing Alt+J or clicking the toolbar icon opens Tab Junkie in the browser side panel alongside your current tab.
- **Standalone Window** — same triggers open a detachable 1200×800 window instead. Alt+Shift+J always opens the standalone window regardless of this setting.

### Layout

Controls the visual density of bookmark rows in the side panel and new tab grid.

| Setting | Options | Default |
|---------|---------|---------|
| **Compact layout** | On · Off | Off |

- **Off** — standard two-line rows (title on top, URL below) with normal spacing.
- **On** — single-line rows with smaller fonts. Useful if you manage a large number of bookmarks and want to see more at once without scrolling.

### Groups

Controls group collapse behavior in the side panel.

| Setting | Options | Default |
|---------|---------|---------|
| **Sub-group auto-collapse** | On · Off | Off |

- **Off** — collapsing a parent group collapses only that group; any expanded sub-groups inside it stay expanded.
- **On** — collapsing a parent group collapses all its sub-groups in one action. Expanding a parent does **not** auto-expand sub-groups.

### Theme

Choose a color theme for all Tab Junkie surfaces. The selected theme applies instantly across the side panel, new tab page, standalone window, settings page, and both popups (quick-search and group-jump).

| Setting | Options | Default |
|---------|---------|---------|
| **Theme** | System Default · 13 named themes | System Default |

**Available themes:**

| Theme | Style |
|-------|-------|
| System Default | Follows your OS dark/light preference automatically |
| Dracula | Dark — purple-tinted dark background, vivid accents |
| Nord | Dark — cool blue-grey tones |
| One Dark | Dark — Atom-inspired neutral dark |
| Monokai | Dark — high-contrast with orange/green highlights |
| Tomorrow Night | Dark — muted dark with warm accents |
| Atom One Dark | Dark — true Atom One Dark palette |
| Solarized Dark | Dark — warm amber-on-dark Solarized palette |
| GitHub Dark | Dark — GitHub's official dark mode palette |
| Tokyo Night | Dark — neon-accented cool dark (newest) |
| Tomorrow | Light — soft light complement to Tomorrow Night |
| Atom One Light | Light — Atom One Light palette |
| Solarized Light | Light — classic Solarized light |
| GitHub Light | Light — GitHub's official light mode palette |

**To change your theme:** open Settings → Theme → select a theme from the dropdown. The change applies within ~500ms across all open Tab Junkie surfaces — no reload required.

> **After updating Tab Junkie:** if you have just installed or updated to v1.26.0 and theme changes produce "Could not save" errors, disable and re-enable the extension at `edge://extensions` (or `chrome://extensions`). This flushes the service worker module cache so the extended theme validator loads correctly. See the [After updating settings](#after-changing-settings) note below.

### Data

Import and export your bookmarks.

| Action | Description |
|--------|-------------|
| **Export HTML** | Download a standard Netscape bookmark file. Opens cleanly in Chrome, Firefox, Safari, Edge, and any other browser. |
| **Export JSON** | Download a schema-versioned Tab Junkie backup including groups, items, colors, and preferences. For lossless round-trip restores. |
| **Import HTML** | Bring in a Netscape-format bookmarks file from any browser. Shows a preview dialog confirming counts and warning that the import **replaces all existing data**. Cancel backs out; Replace All commits atomically. |
| **Import JSON** | Restore a Tab Junkie-native JSON backup. Preview dialog reports counts and any automatic repairs before you commit. |

> **Important:** HTML and JSON imports replace your existing bookmarks. The preview dialog shows exactly what will happen before you confirm. There is no undo — export a JSON backup first if you want a safety copy.

---

## Keyboard navigation

The Settings page is fully keyboard-navigable:

- **Tab** — moves focus forward through controls (Display → Layout → Groups → Theme → Data) in top-to-bottom DOM order.
- **Shift+Tab** — moves focus backward.
- **Space** or **Enter** — toggles a checkbox (On/Off settings).
- **Arrow keys** — cycles options in a `<select>` dropdown.

There is no focus trap — Tab can leave the page via the browser address bar or tab strip per browser default.

---

## Returning to your bookmarks

Close the Settings tab to return to browsing. The gear button in the side panel reopens it whenever you need it.

Settings has no "Back" or "Close" button by design — the browser tab model provides this naturally. Pin the Settings tab if you find yourself returning to it frequently; Tab Junkie will always focus the pinned tab rather than opening a new one.

---

## After changing settings

Most settings take effect immediately — toggle a control and the change applies on the next action (for example, toggling Compact layout updates the side panel the next time it renders). Preference saves are indicated by the control snapping to its new value; if a save fails you will see an inline error and the control reverts to its previous value.

> **First-time setup note:** if you have just installed or updated Tab Junkie and see a "Could not save" error when toggling a new preference, try disabling and re-enabling the extension at `edge://extensions` (or `chrome://extensions`). This restarts the service worker and ensures all preference keys are registered correctly.
