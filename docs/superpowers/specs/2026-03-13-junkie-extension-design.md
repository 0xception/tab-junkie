# Junkie — Bookmark & Tab Manager Extension

## Overview

Junkie is a Chrome/Edge extension that unifies bookmarks and open tabs into a single organized view. Bookmarks are first-class objects; whether a bookmark is currently open as a tab is simply a visual status attribute — not a separate list. This eliminates the fragmentation of managing bookmarks and tabs in two separate places.

## Core Concept

- **One unified list** of bookmarked pages, organized into color-coded groups
- **Open/closed status is derived**, not stored — the extension matches open tab URLs against stored bookmarks at runtime
- **Unbookmarked open tabs** appear in a dedicated section (or inline, user-togglable) with distinct visual treatment

## Architecture

### Stack

- **Vanilla JS + Web Components** — no framework, no build step
- **External libraries:** SortableJS (drag-and-drop), Fuse.js (fuzzy search)
- **Storage:** `chrome.storage.local` (designed for future `storage.sync` migration)
- **Manifest V3**

### Components

```
Service Worker (background/service-worker.js)
├── Tab Watcher — listens to chrome.tabs events (onCreated, onRemoved, onUpdated, onActivated)
├── Storage Manager (background/storage.js) — CRUD for bookmarks, groups, and preferences via chrome.storage.local
├── Tab Matcher (background/tab-matcher.js) — normalizes URLs and matches open tabs against stored bookmarks
└── State Broadcaster (background/broadcaster.js) — merges bookmarks + tabs into unified state, pushes to connected UIs

Side Panel (sidepanel/)
└── Full bookmark tree with groups, sub-groups, drag-and-drop, and visual open/closed states

Popup (popup/)
└── Fuzzy search quick-launcher with autocomplete results

Shared Components (components/)
├── <bookmark-item> — renders a single bookmark with appropriate visual state
├── <group-header> — renders a group header with color, collapse toggle, count
└── <search-bar> — reusable search input with autocomplete
```

### Data Flow

1. Service worker watches `chrome.tabs` events
2. On any tab change, re-computes which bookmarks are "open" by matching normalized URLs
3. Broadcasts merged state (bookmarks with derived `isOpen`/`tabId` + unbookmarked tabs) to connected UIs
4. UIs render what they receive — no direct storage reads from UI code

### File Structure

```
junkie/
├── manifest.json
├── background/
│   ├── service-worker.js
│   ├── storage.js
│   ├── tab-matcher.js
│   └── broadcaster.js
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.js
│   └── sidepanel.css
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── components/
│   ├── bookmark-item.js
│   ├── group-header.js
│   └── search-bar.js
├── shared/
│   ├── styles.css
│   └── messages.js
├── lib/
│   ├── sortable.min.js
│   └── fuse.min.js
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

## Data Model

### BookmarkItem

| Field     | Type            | Description                                   |
|-----------|-----------------|-----------------------------------------------|
| id        | string          | Unique UUID                                   |
| title     | string          | Page title                                    |
| url       | string          | Full URL                                      |
| groupId   | string \| null  | Which group it belongs to                     |
| sortOrder | number          | Position within group                         |
| favicon   | string \| null  | Cached favicon URL (fallback: first-letter)   |
| createdAt | number          | Timestamp                                     |

**Derived at runtime (not stored):**
- `isOpen: boolean` — matched against `chrome.tabs`
- `tabId: number | null` — for switching/closing the tab

### Group

| Field     | Type            | Description                                   |
|-----------|-----------------|-----------------------------------------------|
| id        | string          | Unique UUID                                   |
| name      | string          | Group display name                            |
| parentId  | string \| null  | null = top-level, string = sub-group          |
| sortOrder | number          | Position among siblings                       |
| color     | string          | Accent color from preset palette              |

**Constraint:** Maximum one level of nesting (groups and sub-groups, no deeper).

**UI state (stored separately in preferences, not synced with bookmark data):**
- `collapsedGroups: string[]` — list of group IDs that are collapsed

### URL Matching Strategy

- Strip trailing slashes
- Ignore URL fragments (#)
- Normalize protocol (http/https treated as same)
- Compare normalized URLs for equality
- If a URL matches multiple bookmarks, the first match wins

## UI Design

### Side Panel (Full View)

The side panel is the primary management interface, always accessible without leaving the current page.

**Layout:**
- Header with "Junkie" title, add-group button, settings button
- Collapsible groups with color-coded headers (left border + text in group color)
- Bookmarks listed under their group with visual state indicators
- Sub-groups indented under parents, inheriting parent color at reduced opacity
- "Open Tabs" section at bottom for unbookmarked tabs (user can toggle inline mode)

**Visual States:**

| State                    | Visual Treatment                                                |
|--------------------------|----------------------------------------------------------------|
| Bookmarked + Open        | Full opacity, green dot indicator, close button (✕) visible    |
| Bookmarked + Closed      | 60% opacity, dimmed favicon, no indicators                     |
| Unbookmarked + Open      | Amber text, dashed left border, in "Open Tabs" section         |

**Color-Coded Groups:**
- Each group has a user-selected accent color from a preset palette of 8 colors:
  - Blue (`#5b91cf`), Purple (`#b45bcf`), Teal (`#5bcfbc`), Red (`#cf5b5b`), Orange (`#cf8a5b`), Pink (`#cf5b91`), Indigo (`#7b5bcf`), Slate (`#8899aa`)
- Color applied to: group header text, left border, sub-group indicators
- Green dot for "open" status is universal and independent of group color
- Amber is reserved for the "Open Tabs" (unbookmarked) section

**Interactions:**
- Click bookmark → navigate to tab (switch if open, open new tab if closed)
- Click ✕ on open item → close that tab
- Drag-and-drop to reorder within groups or move between groups
- Drag unbookmarked tab into a group → promotes to bookmark (initial implementation; may be replaced with explicit action later)
- Click group header → collapse/expand
- Right-click → context menu for rename, delete, change color, etc.

### Popup (Quick Search Launcher)

A compact dropdown opened by clicking the toolbar icon.

**Behavior:**
- Search input auto-focused on open
- Fuzzy search across **bookmark titles** and **open tab titles** only (not URLs, not group names, not the internet)
- Results split into "Bookmarks" and "Open Tabs" sections
- Fuzzy match characters highlighted in results
- Group breadcrumb path shown below bookmark titles (e.g., "Work Tools → Dashboards")
- Green dot on items that are currently open tabs
- Unbookmarked tabs shown in amber styling

**Empty state:** Shows recently visited bookmarks before user starts typing

**Keyboard navigation:**
- ↑↓ to navigate results
- Enter to open/switch to selected result
- Esc to dismiss popup

## Edge Cases

- **Duplicate URL bookmarks:** If the same URL is bookmarked in multiple groups, only the first match shows the "open" indicator
- **Service worker suspension:** Chrome may suspend/restart the service worker. All state must be recoverable from `chrome.storage.local` — no in-memory-only state
- **Tab events while side panel closed:** Service worker continues tracking; panel gets fresh snapshot on reopen
- **Favicon failures:** Fall back to first-letter avatar (styled to match group color)
- **Storage quota:** `chrome.storage.local` has a 10 MB limit (was 5 MB, increased in Manifest V3). Favicon URLs are stored as strings (small). If quota is approached, warn the user and stop caching new favicons (fall back to first-letter avatars)

## Browser Compatibility

- **Target:** Chrome 114+, Edge 114+ (Manifest V3, Side Panel API)
- **Not supported:** Firefox (no Side Panel API — would need sidebar migration)
- **Storage:** `chrome.storage.local` is universal across Chromium

## Testing Strategy

- **Unit tests:** URL normalization, tab matching, fuzzy search filtering — pure functions tested with a lightweight runner
- **Manual testing:** Load as unpacked extension, exercise all states
- **Cross-browser:** Verify in both Chrome and Edge

## Future Considerations (Not in Scope)

- Cross-device sync via `chrome.storage.sync` or external backend
- Firefox support via sidebar API
- Explicit "Add to bookmarks" action replacing drag-to-promote
- Tags for cross-cutting views alongside groups
- Import from native browser bookmarks
- Keyboard shortcuts for power users
