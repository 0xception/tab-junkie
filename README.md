# Tab Junkie

A Chrome/Edge extension that unifies bookmark and tab management into a single organized view. Bookmarks are first-class objects — their open/closed status is derived in real time from your browser tabs.

## Features

### Unified Bookmark + Tab View
- Bookmarks and open tabs merged into one interface (side panel or standalone window)
- Green dot indicators for bookmarks that are currently open as tabs
- Active tab highlighting
- Unbookmarked open tabs shown in a dedicated "Open Tabs" section with amber styling

### Groups and Organization
- Color-coded groups with one level of sub-group nesting
- 9 accent colors: Blue, Purple, Teal, Red, Orange, Pink, Indigo, Yellow, Slate
- Collapsible groups with persisted state
- Ungrouped section for unorganized bookmarks

### Drag-and-Drop
- Reorder bookmarks within and between groups
- Reorder groups and sub-groups
- Drag floating tabs into groups
- Multi-select drag with SortableJS MultiDrag
- Drag-to-expand collapsed groups on hover

### Quick Search Popup (Alt+J)
- Fuzzy search across all bookmarks and open tabs
- Recent items shown by default
- Group search and drill-in — browse groups and view their contents inline
- Keyboard navigation: arrows to browse, Enter to open, Tab for full view, Esc to close
- Breadcrumb paths showing group hierarchy

### Quick Jump to Group (Alt+K)
- Jump directly to any group from anywhere
- Fuzzy search across group names
- Works from side panel, popup, or standalone window

### Multi-Window Mode
- Open multiple Tab Junkie instances across browser windows
- State synchronized in real time between all instances
- Each window reflects the same bookmarks, groups, and tab status

### Inline Side Panel Search
- Real-time fuzzy filtering of bookmarks and tabs
- Match highlighting across titles and URLs

### Multi-Selection and Bulk Actions
- Ctrl+Click, Shift+Click, and Ctrl+A selection
- Bulk move to group, close tabs, or remove bookmarks
- Context menus for single items and selections

### Chrome Tab Sync
- Reorder Chrome tabs to match Tab Junkie's group order
- Creates Chrome tab groups with matching names and colors
- Works across multiple windows

### Import/Export
- Export bookmarks as browser-compatible HTML (Netscape Bookmark format)
- Export full backup as JSON (bookmarks, groups, colors, sort orders)
- Import from either format with confirmation dialog

### Display Modes
- **Side panel** (default) — persistent panel alongside your browsing
- **Standalone window** (Alt+Shift+J) — popup window, no tab strip
- **Multi-window** — multiple instances stay synchronized across browser windows

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Alt+J | Open quick search popup |
| Alt+Shift+J | Open Tab Junkie as standalone window |
| Alt+K | Jump to group |
| Ctrl+A | Select all visible items |
| Escape | Clear selection |

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` (or `edge://extensions`)
3. Enable **Developer mode**
4. Click **Load unpacked** and select the project folder

## Architecture

Vanilla JavaScript with Web Components. No framework, no build step.

```
junkie/
├── manifest.json
├── background/
│   ├── service-worker.js    # Message handling, tab events, Chrome tab sync
│   ├── storage.js           # chrome.storage.local CRUD
│   ├── broadcaster.js       # State merging and broadcasting to UI
│   └── tab-matcher.js       # URL normalization and bookmark↔tab matching
├── sidepanel/
│   ├── sidepanel.html/js/css  # Main UI — bookmark tree, settings, import/export
│   ├── render.js              # Bookmark tree rendering
│   ├── dialogs.js             # Add/edit dialogs
│   ├── context-menu.js        # Right-click menus
│   └── group-picker.js        # Group selection modal
├── popup/
│   └── popup.html/js/css    # Quick search launcher
├── components/
│   ├── bookmark-item.js     # <bookmark-item> web component
│   ├── group-header.js      # <group-header> web component
│   └── search-bar.js        # <search-bar> web component
├── shared/
│   ├── styles.css           # Global styles
│   ├── themes.js            # Theme switching logic
│   ├── themes.css           # 12 IDE color themes
│   ├── messages.js          # Message types and color palette
│   └── import-export.js     # Import/export utilities
└── lib/
    ├── sortable.min.js      # SortableJS (drag-and-drop)
    └── fuse.min.js          # Fuse.js (fuzzy search)
```

## Data Model

- **Bookmarks** — id, title, url, groupId, sortOrder, favicon, createdAt, lastAccessedAt
- **Groups** — id, name, parentId, sortOrder, color (max one nesting level)
- **Preferences** — collapsedGroups, viewMode
