# Product Requirements Document: Tab Junkie

## 1. Overview

Tab Junkie is a browser extension (Chrome / Edge / Chromium) that unifies bookmark management and live tab management into a single, persistent interface. Where traditional browsers treat bookmarks and open tabs as separate concerns, Tab Junkie merges them: every bookmark shows its live open/active state, every open tab can be promoted to or associated with a bookmark, and groups can be reorganized via drag-and-drop, search, or keyboard.

The product targets users who keep many tabs open across multiple windows, rely on bookmarks as an active workspace (not an archive), and want fast keyboard-driven navigation across both.

### 1.1 Goals

- Eliminate the gap between "bookmarks" and "open tabs" by treating them as one unified, stateful collection.
- Provide instant fuzzy search and keyboard navigation across all bookmarks and tabs.
- Allow flexible grouping, reordering, and bulk operations without losing data across browser restarts.
- Support multi-window workflows with per-window awareness and cross-window state sync.
- Preserve user data through import/export with broad compatibility.

### 1.2 Non-Goals

- Cloud sync of user data (data is stored locally per browser profile).
- Replacement of the browser's native bookmark store.
- Mobile / non-desktop support.

---

## 2. Core Concepts

The product centers on a single concept — an **item** — representing something the user navigates to. An item has a title and a URL and may exist in any combination of the following orthogonal states. The product does not prescribe how these states are decomposed into stored entities.

### 2.1 Item
A title + URL the user can navigate to. An item may be saved, live, both, or (transiently) neither. Items carry display metadata (favicon, ordering) and may belong to a group.

### 2.2 Item States

- **Saved**: the item is persisted and survives browser restarts. Saved items have a creation timestamp and an optional last-accessed timestamp.
- **Live**: the item has a corresponding open browser tab right now. Live items expose the tab's window, active state, audible state, and last-accessed time.
- **Grouped**: the item is associated with a group (or sub-group) and participates in that group's ordering. An item may be ungrouped.
- **Active**: the item is the focused tab in its window (only meaningful for live items).
- **Drifted**: the item is both saved and live, but the live tab's current URL no longer matches the saved URL. Drift is detected, displayed distinctly, and must survive restarts.
- **Audible**: the item's live tab is currently producing audio.

These states are independent: the same item can be saved + live + grouped + active + audible simultaneously, or saved + dormant + ungrouped, and so on.

### 2.3 Common State Combinations (User-Facing Vocabulary)

The UI may surface these combinations under familiar names, but they are not separate entity types:

- **Bookmark** — a saved item (typically grouped). May or may not be live.
- **Floating tab** — a live, ephemeral (not saved), grouped item.
- **Unbookmarked open tab** — a live, ephemeral, ungrouped item.

### 2.4 Group
A named, colored container for items. Groups have a sort order and may optionally have a single level of sub-groups (max nesting depth: 1). Groups carry a semantic color from a fixed palette.

---

## 3. Data Model Requirements

This section describes what the system must be able to *represent and persist*. It deliberately does not prescribe how items are decomposed into records, tables, or files — a single unified item model and a split model (e.g., separate bookmark and tab structures) are both valid implementations.

### 3.1 Representable Item Properties

The system must be able to represent an item with any combination of:
- Identity (stable across the item's lifetime), title, URL, optional favicon.
- Group membership (nullable) and an ordering within its group.
- Saved aspect: creation timestamp, optional last-accessed timestamp.
- Live aspect: associated browser tab, the tab's window, active state, audible state, and the tab's currently displayed URL (which may differ from the item's saved URL).
- Derived state: whether the item is currently drifted.

### 3.2 Group
- Identity, name, optional parent group, sort order, semantic color from a fixed palette.
- Maximum nesting depth: one level (a sub-group cannot itself contain sub-groups).

### 3.3 Persistence Requirements

The following must survive browser restarts and extension reloads:
- All saved items, groups, and user preferences.
- The association between a saved item and the live tab that represents it, sufficient to redetect drift after a restart.
- The group association of a live-but-unsaved item (so that "floating tabs" return to their group when the browser restarts).
- The user's custom ordering within a group, including interleavings of saved and live-only items.
- Disambiguation when multiple saved items share the same URL: the system must be able to remember which saved item corresponds to which live tab, rather than relying solely on URL matching.

The following are transient and need not persist:
- Live state of tabs that no longer exist.
- Active/audible state at the moment of shutdown.

### 3.4 URL Handling
- Only `http`, `https`, and `file` protocols are accepted for new/edited bookmarks.
- Missing protocols on user input default to `https://`.
- URL normalization (for matching) strips trailing slashes, normalizes protocol, and preserves fragments (since fragments may represent SPA routes).

---

## 4. Functional Requirements

### 4.1 Saved Item Management

- **Save a new item** via dialog: title, URL, target group, favicon (auto-captured from a matching open tab if available, else manual).
- **Edit a saved item**: title, URL, group assignment.
- **Delete the saved aspect of an item**: if the item is currently live, the live tab is retained (as an ephemeral, grouped item) by default.
- **Insert at position**: a new saved item may be inserted after a specific existing item.
- **Bulk create**: create many saved items at once (used by import flows).
- **Favicon fallback**: when no favicon is available, render a colored letter avatar based on the first character of the title.
- **Validation**: invalid URLs are rejected at create/edit time with a user-visible error.

### 4.2 Group Management

- **Create group**: name, optional parent group, color from a fixed palette of 9 semantic colors (blue, purple, teal, red, orange, pink, indigo, yellow, slate).
- **Edit group**: name and color.
- **Delete group**: bookmarks belonging to the group are moved to "Ungrouped"; sub-groups are similarly handled.
- **Sub-groups**: a group may contain sub-groups, but only to one level of depth. The system must prevent attempts to nest groups that already contain sub-groups, and prevent circular references.
- **Reorder**: groups and sub-groups can be reordered via drag-and-drop on a drag handle.
- **Nest via drag**: a top-level group can be dragged onto another top-level group to become its sub-group, subject to nesting constraints.
- **Collapse / expand**: each group can be independently collapsed or expanded; collapse state persists.
- **Drag-to-expand**: a collapsed group expands automatically when an item is hovered over it during a drag (after a short delay).

### 4.3 Live State Tracking

- **Live reflection**: every saved item must reflect, in real time, whether it has a corresponding open tab and, if so, in which window.
- **Active highlight**: the currently focused tab must be visually distinguished from merely-live items.
- **Drift detection**: when a live tab navigates away from the URL of the saved item it represents, the item must be marked as drifted and displayed distinctly. Drift state must survive browser restarts.
- **Audible indicator**: items whose live tab is producing audio must show an audible indicator.
- **Opener-chain grouping**: when a new tab is opened from a grouped item (and is not itself saved), the system must associate it with the parent item's group by walking the opener chain up to a small bounded number of hops.
- **Multi-window awareness**: every live item must record the window it belongs to; items in non-current windows must be visually badged with their window number.
- **Cleanup**: internal tracking associated with closed tabs must be cleaned up automatically.

### 4.4 Item Lifecycle and State Transitions

Items move between states over their lifetime. The product must support the following transitions, regardless of how the underlying data is stored:

- **Acquire live state**: an existing saved item becomes live when its URL is opened in a browser tab (either by user action within Tab Junkie or externally).
- **Lose live state**: a live item becomes dormant when its tab closes. If the item is saved, it persists as a dormant saved item. If it is not saved, it disappears entirely unless it is grouped (see "orphaning" below).
- **Acquire saved state (promote)**: a user must be able to save a live-only item (grouped or ungrouped), making it persist beyond the lifetime of its tab.
- **Lose saved state (demote)**: a user must be able to remove the saved aspect of an item. If the item is currently live, the demotion must preserve the live tab and its group association by default, rather than closing the tab or orphaning it.
- **Acquire group membership**: live-only items that are opened from a grouped item must inherit that group (via opener-chain association). Users may also explicitly move an item into a group.
- **Lose group membership**: deletion of a group must move its items to the ungrouped state rather than destroying them.
- **Orphan handling**: a live item that loses its saved aspect but retains a group association must continue to appear inside that group until its tab closes. Its group association must persist across browser restarts for the duration of its live tab's lifetime.

**Display implications** of these states (the UI manifests the states, but the requirement is on the state model, not on having distinct item types):
- Live, ungrouped, ephemeral items are surfaced in a dedicated "Open Tabs" section.
- Live, grouped items — whether saved or ephemeral — appear interleaved with the group's other items according to the user's custom ordering.
- The interleaved ordering must be persistable and survive reloads.

### 4.5 Navigation and Tab Reuse

- Clicking any item must:
  - Switch to the existing matching tab if one is open (preferring exact tab association over URL match).
  - Focus the window containing that tab.
  - Otherwise, open a new tab.
- Each navigation updates the item's last-accessed timestamp.
- Users must be able to close any open tab from the Tab Junkie UI individually or in bulk.

### 4.6 Search

The product provides three search surfaces.

#### 4.6.1 Quick Search Popup
- Opened via a global keyboard shortcut.
- Fuzzy search across bookmark and tab titles and URLs with match highlighting.
- Results grouped into "Bookmarks" and "Open Tabs."
- When the query is empty, shows the most recently accessed items.
- Each result shows favicon, title, URL, and the group breadcrumb path.
- Keyboard navigation: arrow keys to move, Enter to open, Escape to close, Tab to view in the full side panel, and a key to switch to group-jump mode.
- Single-click on a result must open/focus the item and close the popup.

#### 4.6.2 Group Jump Popup
- Opened via a separate global shortcut (or toggled from the search popup).
- Fuzzy search across group names, including parent context.
- Drilling into a group reveals its bookmarks and sub-groups, with counts ("N bookmarks · M open").
- Sub-groups can themselves be drilled into; a back action and breadcrumb display allow navigating back up.
- An in-group filter narrows the contents of the currently open group.
- Keyboard navigation parity with the search popup.

#### 4.6.3 Inline Side Panel Filter
- A filter input in the side panel header filters the entire bookmark/tab tree in real time with match highlighting.
- A clear control restores the full view.
- Filter input is debounced for performance.

### 4.7 Selection and Bulk Actions

- **Single click** selects an item.
- **Shift+Click** selects a range from the last clicked item to the current.
- **Ctrl/Cmd+Click** toggles individual items into / out of the selection.
- **Ctrl/Cmd+A** selects all currently visible items.
- **Escape** clears the selection.
- A bulk action bar must appear when one or more items are selected, showing the count and offering: move to group, close tabs, clear selection, and any context-appropriate destructive actions.
- Right-clicking a selected item must operate on the entire selection.
- Selection must survive view changes (filtering, scrolling); IDs no longer present must be silently pruned.
- Multi-item drag must move all selected items together as a unit.

### 4.8 Context Menus

- **Bookmark item menu**: edit, delete, close tab (if open), open in / save to group, selection actions.
- **Group header menu**: open all bookmarks, close all open tabs in the group, select all / select open / select bookmarked, edit group, delete group.
- **Selection menu**: appears when right-clicking with a multi-selection active; offers move, close, remove operations.
- Destructive actions must be visually distinguished (e.g., red).
- Menus must be clamped to the viewport so they never render off-screen.

### 4.9 Group Picker Modal

- A reusable modal for selecting a target group, used by all "move to group" operations.
- Lists groups (and sub-groups) with item and open-tab counts.
- Real-time search by group name.
- Keyboard navigation: arrow keys, Enter to confirm, Escape to cancel.
- Can be positioned at the cursor (when invoked from a context menu) or anchored to the bulk action bar.
- May exclude the source group from available targets when appropriate.

### 4.10 Drag and Drop

- **Item drag**: reorder within a group, move between groups, move multiple selected items together.
- **Group drag**: reorder groups, nest a group into a parent (subject to depth constraints).
- **Drag-to-expand**: hovering over a collapsed group during a drag expands it after a short delay.
- **Auto-scroll** during drag near the edges of the scrollable region.
- **Drop interleaving**: saved and live-only items may be freely interleaved within a group, and that order must persist.
- **Drag into the "Open Tabs" section**: dragging a saved, live item out of its group and into the unbookmarked-tabs section must demote it — removing its saved aspect while preserving the live tab and (optionally) its original group association.
- Drag operations must produce stable, normalized sort orders so the result is deterministic.
- Cross-window drag is not required.

### 4.11 Multi-Window Support

- A separate side panel instance may run in each browser window.
- All instances must reflect the same underlying data and stay in sync as state changes.
- Each instance must know its own window so it can highlight its own active tab.
- Items belonging to other windows must show a window-number badge.
- A window filter row (visible only when more than one window is open) must allow filtering the visible items to a single window or showing all.
- Windows must be labeled with stable, predictable numbers.

### 4.12 Display Modes

The product must support multiple presentation modes, switchable by user preference:

- **Side panel**: persistent panel attached to the browser window.
- **Standalone window**: detachable popup-style window. Must reuse / focus an existing instance rather than creating duplicates. Must be sized and positioned sensibly relative to the active browser window.
- **New Tab page replacement** (optional, toggleable): replaces the browser's new tab page with a Tab Junkie surface that includes a web search input and, optionally, a bookmark grid view. The grid must show groups and bookmarks, support a quick filter, and respect live state updates.

### 4.13 Settings and Preferences

- **Theme selection**: a fixed catalog of themes (a mix of dark and light variants based on popular IDE/editor color schemes, totaling at least a dozen options). Theme selection must apply across all open instances.
- **View mode**: side panel vs. standalone window.
- **New tab page override**: enable / disable.
- **Sub-group collapse behavior**: optional auto-collapse of sub-groups when parent is collapsed.
- **Sync tab order**: a manual action that aligns the browser's native tab arrangement (and tab groups) with Tab Junkie's grouping and ordering. Must show a confirmation before executing, and provide success/failure feedback.

### 4.14 Chrome Tab Group Sync

- A user-invoked action must create native browser tab groups corresponding to Tab Junkie groups, with matching colors and ordering.
- Because the browser's tab groups do not support nesting, sub-groups must be flattened into their parent during sync.
- Tab Junkie's semantic color palette must map onto the browser's supported tab group colors.
- Sync operates per window since native tab groups are window-scoped.
- After sync, tabs in each window should be ordered to match Tab Junkie's order.

### 4.15 Import and Export

- **Export to HTML**: produce a standard browser-compatible (Netscape) bookmarks file with nested folders representing groups and sub-groups, preserving creation dates.
- **Export to JSON**: produce a complete backup of all bookmarks, groups, colors, metadata, timestamps, and structural data, including a version field.
- **Import HTML**: parse standard Netscape bookmark files from any major browser. Folder hierarchy deeper than the supported nesting depth must be flattened safely. The user must be shown a count of bookmarks/groups to be imported and warned that import replaces all existing data.
- **Import JSON**: parse a Tab Junkie backup. Must validate structure, handle orphaned sub-groups (reparent to top level), break circular references, and detect duplicate IDs.
- Import is destructive (replaces all existing data) and must be gated by an explicit confirmation dialog.
- The file picker must restrict to relevant extensions (`.html`, `.htm`, `.json`).
- Successful and failed import/export operations must show user-visible feedback.

### 4.16 Keyboard Shortcuts

- A global shortcut to open the **quick search popup**.
- A global shortcut to open / focus the **standalone Tab Junkie window**.
- A global shortcut (or popup mode toggle) to open the **group jump popup**.
- Within popups: arrow keys to navigate, Enter to open, Escape to dismiss, Tab to expand to the full side panel, and a key to toggle between search and group-jump modes.
- Within the side panel: select-all and clear-selection shortcuts.

---

## 5. UI / UX Requirements

### 5.1 Visual States

- Open bookmarks must be visually distinct from closed bookmarks (e.g., a status indicator).
- The currently active tab must be highlighted distinctly from other open tabs.
- Drifted bookmarks must be visually distinct from non-drifted open bookmarks.
- Audible tabs must show an audio indicator.
- Selected items must show a clear selection state, including a checkbox affordance.
- Hover, focus, and active states must be present throughout for keyboard and mouse users.

### 5.2 Information Display

- Each item shows: favicon (or letter fallback), title, optional URL or breadcrumb, status indicators.
- Hovering an item must surface a tooltip with the full title and URL after a short delay.
- Group headers must show item counts.
- Search results must show breadcrumbs reflecting group hierarchy.
- Match highlighting must be applied wherever a search filter is active.

### 5.3 Empty and Error States

- Empty bookmark list, empty filter results, and empty group cases must each have appropriate messages.
- Failed operations (sync errors, import failures, invalid input) must surface a user-visible message.

### 5.4 Performance

- Search must be responsive even with thousands of bookmarks.
- Filter input must be debounced.
- State broadcasts during drag must be deferred so the UI does not flicker mid-drag.
- The search index must be cached and only rebuilt when the underlying collections change.

---

## 6. Cross-Cutting Requirements

### 6.1 State Synchronization
- Any mutation (add, edit, delete, move, reorder, preference change, tab event) must broadcast updated state to all open instances (side panels, popups, new tab pages, standalone window).
- Stale UI state must be reconciled with broadcast updates without disrupting in-progress user interactions (e.g., active drags).

### 6.2 Data Integrity
- Sort orders must be normalized after operations that could leave gaps or duplicates.
- Selection sets must be pruned of IDs that no longer exist.
- Imported data must be validated and repaired (orphaned references, cycles, duplicates) without aborting the entire import.

### 6.3 Privacy and Storage
- All user data is stored locally in browser-managed extension storage. There is no server, no telemetry, and no third-party data transmission.

### 6.4 Compatibility
- Targets Chromium-based browsers (Chrome, Edge, and compatible).
- Import/export must be interoperable with the standard Netscape bookmark format used by all major browsers.

---

## 7. Edge Cases the Product Must Handle

- **Duplicate URLs**: multiple bookmarks pointing to the same URL must be disambiguated via explicit tab associations.
- **Tab redirects**: a tab navigating away from its original URL must be detected as drifted, not as "closed and a new unrelated tab opened."
- **Browser restart**: floating tab → group associations and drift state must be re-established where possible by matching previously known tab URLs.
- **Group deletion**: orphaned bookmarks must move to Ungrouped, not be lost.
- **Imported deeply nested folders**: must be flattened to fit the supported nesting depth.
- **Cyclic groups in imports**: must be detected and broken.
- **Single-window vs. multi-window**: window filter UI must hide itself when only one window is open.
- **Standalone window already open**: opening it again must focus the existing window, not create a duplicate.
- **Drag with multi-select where selection diverges from DOM order**: state must be the source of truth.
- **Removing a bookmark whose tab is open**: the tab must be preserved (as a floating tab) by default rather than orphaned or closed.

---

## 8. Out of Scope (Current Release)

- Cloud sync of bookmarks/groups across devices or browsers.
- Cross-browser-profile sync.
- Mobile or non-desktop platforms.
- Tagging beyond the group/sub-group structure.
- Collaboration / multi-user.
- Replacing the browser's native bookmark bar/store.
- Cross-window drag and drop.
- Tab group nesting beyond what the host browser natively supports.
