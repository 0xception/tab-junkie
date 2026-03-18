# Window Badge & Filter — Design Spec

## Problem

Tab Junkie shows all tabs from all browser windows as a flat list with no indication of which window each tab belongs to. Users with multiple windows can't tell which tabs are where.

## Approach: Badge-Only with Reactive Filter Row

Add a small number badge to items open in non-current windows. A reactive filter row appears below the header when 2+ normal browser windows exist. Filtering only hides unbookmarked/floating tabs — bookmarks always stay visible.

**Why this approach:**
- Zero DOM structure changes inside `.group-items` containers — drag-and-drop is untouched
- Single-window users see no change
- Derived from chrome state on every recompute — no sync issues
- The existing `NAVIGATE_TO` handler already focuses the correct window when clicking a cross-window bookmark

## Design

### 1. State Changes (Backend)

#### broadcaster.js — Add `windows` array to state

Add `chrome.windows.getAll()` to the existing `Promise.all` in `computeState()`. Filter to `type === 'normal'` (excludes Junkie's popup window and devtools). Sort by `window.id` for stable ordering. Map to `{ id, label }` objects where label is `"Window 1"`, `"Window 2"`, etc. Add the resulting `windows` array to `cachedState`.

#### tab-matcher.js — Add `windowId` to enriched bookmarks

When a bookmark matches a tab (both the tracked-tab path and URL-match path in `matchTabsToBookmarks()`), add `windowId: tab.windowId` to the enriched bookmark object. No changes needed for `unbookmarkedTabs` or `floatingTabsByGroup` — those already carry full Chrome tab objects which include `windowId`.

#### service-worker.js — Add window lifecycle listeners

Add listeners that trigger `broadcaster.invalidateAndBroadcast()`:
- `chrome.windows.onCreated`
- `chrome.windows.onRemoved`
- `chrome.windows.onFocusChanged` (ignoring `WINDOW_ID_NONE`)
- `chrome.tabs.onAttached`

### 2. Window Badge on bookmark-item Component

#### bookmark-item.js — Template and shadow DOM styles

Add `<span class="window-badge hidden"></span>` between `.open-dot` and `.close-btn`. Add corresponding CSS to the `<style>` block inside the shadow DOM template: 9px font, dimmed text color, subtle background pill, `border-radius: 6px`, `padding: 1px 4px`. These styles must live in the component's shadow DOM `<style>` tag, not in `sidepanel.css`.

#### bookmark-item.js — Render logic

In `_render()`, after the open-dot/close-btn logic: if `this._data.windowLabel` is truthy, show the badge with the label text (just the number, e.g., `"2"`), otherwise hide it. Items in the user's current window get no badge — `windowLabel` is only set when `windowId !== myWindowId`. No changes to data setter, event handlers, or selection logic.

#### render.js — Passing windowLabel to items

Build a `windowId -> number` map from `state.windows`. The `renderBookmarkTree` function signature gains `myWindowId` and `windowFilter` in its options object. `renderGroup` gains `windowLabelMap` and `myWindowId` parameters, threaded to sub-group rendering.

When rendering any item (bookmarks in `renderGroup()`, floating tabs in `renderFloatingTab()`, ungrouped bookmarks, unbookmarked tabs): if the item has a `windowId` that differs from `myWindowId`, set `windowLabel` on the item data (e.g., `"2"`).

**Constraint preserved:** No new DOM elements inside `.group-items` containers. The badge lives inside the bookmark-item shadow DOM. SortableJS sees identical structure.

### 3. Window Filter Row

#### sidepanel.html — Filter row element

Add `<div id="window-filter" class="window-filter hidden"></div>` between the `.header` and `#bookmark-list`. Outside the bookmark tree entirely.

#### sidepanel.js — State tracking

- Module-level `let myWindowId = null` and `let windowFilter = null` (null = show all, or a window ID)
- In `init()`, call `chrome.windows.getCurrent()` to set `myWindowId`. For side panel mode, this is the attached window and never changes. For popup window mode, this is the popup's own window ID (which won't match any `type: 'normal'` window).
- The `onFocusChanged` listener in sidepanel.js should guard against `WINDOW_ID_NONE` (fired when no window has focus, e.g., clicking OS desktop).
- Pass `myWindowId` and `windowFilter` to `renderBookmarkTree` via options

#### sidepanel.js — Rendering the filter row

In `render()`, after state is available:
- `state.windows.length <= 1`: add `hidden` class to filter row, reset `windowFilter` to null
- `state.windows.length > 1`: remove `hidden`, populate with clickable badge buttons — one per window plus an "All" button
- Active filter gets `.active` class
- Current window's badge gets distinct styling so user knows which is theirs
- Clicking a badge sets `windowFilter` and re-renders

#### render.js — Applying the filter

When `windowFilter` is non-null:
- **Bookmarks**: always rendered, never filtered. Badge still shows.
- **Unbookmarked tabs (Open Tabs section)**: filter to `tab.windowId === windowFilter`
- **Floating tabs in groups**: filter `floatingTabsByGroup[groupId]` to matching `windowId`

Filtering is render-time only on already-computed state. Open Tabs header count reflects filtered count.

#### sidepanel.css — Filter row styles

- `.window-filter` — flex row, gap, padding matching header, border-bottom
- `.window-filter.hidden` — display: none
- `.window-filter-btn` — small pill buttons, clickable
- `.window-filter-btn.active` — highlighted with group-blue
- `.window-filter-btn.current` — subtle indicator for user's current window

### 4. Edge Cases

| Case | Behavior |
|------|----------|
| Single window | No badges, no filter row, zero visual change |
| Junkie popup window | Excluded from `windows` (type !== 'normal'). `myWindowId` won't match any normal window, so all items get badges — correct |
| Tab moved between windows | `chrome.tabs.onAttached` triggers rebroadcast; `windowId` updates automatically |
| Window opened/closed | `onCreated`/`onRemoved` trigger rebroadcast; labels renumber |
| Stale window filter | If filtered window closes, detect stale ID (not in current `windows`) and reset `windowFilter` to null |
| Window label stability | Sorted by `window.id` (monotonically increasing). Labels shift only when a lower-numbered window closes |
| Filter + text search | Window filter row stays visible. Fuse search results are global — no window filtering applied to search. Search results use plain divs (not `<bookmark-item>`), so window badges do not appear in search results. This is acceptable — search is a quick-find tool, not a browsing view. |
| Drag-and-drop with filter | Filtered-out items not in DOM. Dragging within visible items works normally. Drop targets unchanged. SortableJS reinitializes on every render so it picks up the current filtered DOM state. |
| Window label renumbering | Labels are based on sorted `window.id` position, not a stable mapping. If Window 2 of 3 closes, old Window 3 becomes Window 2. This is a known UX trade-off — accepted for simplicity. |
| `onFocusChanged` frequency | Window focus changes trigger rebroadcast in the service worker. This is already the case for `tabs.onActivated`. The existing broadcast mechanism (cache invalidation + single `sendMessage`) is lightweight enough for window switches. |
| Permissions | No new manifest permissions required — `chrome.windows.*` APIs are available with the existing `tabs` permission. |

## Files Modified

| File | Change |
|------|--------|
| `background/service-worker.js` | Add window/tab lifecycle listeners |
| `background/tab-matcher.js` | Add `windowId` to enriched bookmarks (2 lines) |
| `background/broadcaster.js` | Add `windows` metadata to state |
| `sidepanel/sidepanel.html` | Add window filter row element |
| `sidepanel/sidepanel.js` | Track `myWindowId`, manage `windowFilter`, render filter row, pass to renderer |
| `sidepanel/render.js` | Pass `windowLabel` to items, apply `windowFilter` to unbookmarked/floating tabs |
| `components/bookmark-item.js` | Add window badge element + rendering logic in shadow DOM |
| `sidepanel/sidepanel.css` | Filter row styles only |

## Verification

1. Single window — confirm zero visual change
2. Open second window with tabs — confirm badges appear on items open in other window, filter row appears
3. Click a window badge in filter row — confirm only that window's unbookmarked/floating tabs are shown, bookmarks stay
4. Click "All" — confirm full list restored
5. Click a bookmarked item open in another window — confirm that window focuses (existing behavior)
6. Move a tab between windows — confirm badge updates
7. Close second window — confirm badges disappear, filter row hides
8. Test drag-and-drop with filter active — confirm it works normally
9. Test drag-and-drop with multiple windows — confirm it works normally
10. Test in Junkie popup window mode — confirm all items show badges
