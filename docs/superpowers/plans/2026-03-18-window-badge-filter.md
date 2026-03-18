# Window Badge & Filter Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add window-awareness to Tab Junkie via number badges on cross-window items and a reactive filter row, without modifying drag-and-drop DOM structure.

**Architecture:** Backend state gains a `windows` array and enriched bookmarks gain `windowId`. The renderer computes window labels and passes them to bookmark-item shadow DOM badges. A filter row outside the SortableJS tree filters unbookmarked/floating tabs by window.

**Tech Stack:** Chrome Extensions API (`chrome.windows`, `chrome.tabs`), vanilla JS web components, SortableJS (untouched)

**Spec:** `docs/superpowers/specs/2026-03-18-window-badge-filter-design.md`

---

## File Structure

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `background/service-worker.js` | Event listeners for window/tab lifecycle | Modify (add 4 listeners) |
| `background/tab-matcher.js` | Enrich bookmarks with `windowId` | Modify (2 lines) |
| `background/broadcaster.js` | Add `windows` metadata to state | Modify (add to Promise.all + cachedState) |
| `components/bookmark-item.js` | Window badge in shadow DOM | Modify (template + styles + render) |
| `sidepanel/render.js` | Compute windowLabel, apply windowFilter | Modify (signature + label logic + filter logic) |
| `sidepanel/sidepanel.js` | Track myWindowId, windowFilter, render filter row | Modify (state + init + render) |
| `sidepanel/sidepanel.html` | Window filter row element | Modify (1 line) |
| `sidepanel/sidepanel.css` | Filter row styles | Modify (add styles) |

---

## Task 1: Backend — Window lifecycle listeners

**Files:**
- Modify: `background/service-worker.js:24-29`

- [ ] **Step 1: Add window and tab-attach listeners**

After the existing `chrome.tabs.onActivated` listener (line 24) and before the `syncingTabOrderCount` variable (line 26), add:

```js
chrome.windows.onCreated.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.windows.onRemoved.addListener(() => broadcaster.invalidateAndBroadcast());
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) broadcaster.invalidateAndBroadcast();
});
chrome.tabs.onAttached.addListener(() => broadcaster.invalidateAndBroadcast());
```

- [ ] **Step 2: Verify no syntax errors**

Load the extension in Chrome, open the service worker console (chrome://extensions → "Inspect views: service worker"). Confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add window lifecycle event listeners for rebroadcast"
```

---

## Task 2: Backend — Add windowId to enriched bookmarks

**Files:**
- Modify: `background/tab-matcher.js:137,146`

- [ ] **Step 1: Add windowId to tracked-tab match path**

On line 137, change:
```js
return { ...bookmark, isOpen: true, tabId: trackedTabId, tabLastAccessed: tab.lastAccessed || 0 };
```
to:
```js
return { ...bookmark, isOpen: true, tabId: trackedTabId, tabLastAccessed: tab.lastAccessed || 0, windowId: tab.windowId };
```

- [ ] **Step 2: Add windowId to URL-match path**

On line 146, change:
```js
return { ...bookmark, isOpen: true, tabId: matchingTab.id, tabLastAccessed: matchingTab.lastAccessed || 0 };
```
to:
```js
return { ...bookmark, isOpen: true, tabId: matchingTab.id, tabLastAccessed: matchingTab.lastAccessed || 0, windowId: matchingTab.windowId };
```

- [ ] **Step 3: Commit**

```bash
git add background/tab-matcher.js
git commit -m "feat: add windowId to enriched bookmarks in tab matcher"
```

---

## Task 3: Backend — Add windows metadata to broadcast state

**Files:**
- Modify: `background/broadcaster.js:75-80,123-130`

- [ ] **Step 1: Add chrome.windows.getAll() to Promise.all**

On lines 75-80, change:
```js
const [bookmarks, groups, preferences, tabs] = await Promise.all([
  storage.getBookmarks(),
  storage.getGroups(),
  storage.getPreferences(),
  chrome.tabs.query({}),
]);
```
to:
```js
const [bookmarks, groups, preferences, tabs, allWindows] = await Promise.all([
  storage.getBookmarks(),
  storage.getGroups(),
  storage.getPreferences(),
  chrome.tabs.query({}),
  chrome.windows.getAll(),
]);

// Build window metadata — only normal browser windows, sorted by ID for stable labels
const normalWindows = allWindows
  .filter(w => w.type === 'normal')
  .sort((a, b) => a.id - b.id);
const windows = normalWindows.map((w, i) => ({ id: w.id, label: `Window ${i + 1}` }));
```

- [ ] **Step 2: Add windows to cachedState**

On lines 123-130, change:
```js
cachedState = {
  bookmarks: enrichedBookmarks,
  groups,
  unbookmarkedTabs,
  floatingTabsByGroup,
  preferences,
  activeTabId: currentActiveTab?.id ?? null,
};
```
to:
```js
cachedState = {
  bookmarks: enrichedBookmarks,
  groups,
  unbookmarkedTabs,
  floatingTabsByGroup,
  preferences,
  activeTabId: currentActiveTab?.id ?? null,
  windows,
};
```

- [ ] **Step 3: Verify state includes windows**

Reload extension. Open side panel. In the service worker console, run:
```js
chrome.runtime.sendMessage({ type: 'get-state' }).then(s => console.log(s.windows));
```
Expected: Array of `{ id: <number>, label: "Window 1" }` objects.

- [ ] **Step 4: Commit**

```bash
git add background/broadcaster.js
git commit -m "feat: add windows metadata array to broadcast state"
```

---

## Task 4: Component — Window badge in bookmark-item shadow DOM

**Files:**
- Modify: `components/bookmark-item.js:90-97,152-162,242-271`

- [ ] **Step 1: Add badge CSS to shadow DOM style block**

After the `.open-dot` style block (line 97, after the closing `}`), add:
```css
    .window-badge {
      font-size: 9px;
      color: var(--text-dimmed, #555);
      background: color-mix(in srgb, var(--text-dimmed, #555) 15%, transparent);
      padding: 1px 4px;
      border-radius: 6px;
      flex-shrink: 0;
      line-height: 1.2;
    }
```

- [ ] **Step 2: Add badge element to template HTML**

On line 161, after `<span class="open-dot hidden"></span>`, add:
```html
    <span class="window-badge hidden"></span>
```

So lines 160-163 become:
```html
    <span class="title"></span>
    <span class="open-dot hidden"></span>
    <span class="window-badge hidden"></span>
    <button class="close-btn hidden" title="Close tab">&#x2715;</button>
```

- [ ] **Step 3: Add badge rendering logic to _render()**

After the existing open-dot/close-btn toggle lines (line 299: `closeBtn.classList.toggle('hidden', !isOpen);`), add:

```js
    // Window badge — shows which window a tab is in (multi-window only)
    const windowBadge = el.querySelector('.window-badge');
    if (this._data.windowLabel) {
      windowBadge.textContent = this._data.windowLabel;
      windowBadge.classList.remove('hidden');
    } else {
      windowBadge.classList.add('hidden');
    }
```

- [ ] **Step 4: Verify badge element exists but is hidden**

Reload extension. Inspect a bookmark-item in DevTools → Shadow DOM. Confirm `.window-badge` element exists with class `hidden`.

- [ ] **Step 5: Commit**

```bash
git add components/bookmark-item.js
git commit -m "feat: add window badge element and render logic to bookmark-item shadow DOM"
```

---

## Task 5: Renderer — Pass windowLabel to all rendered items

**Files:**
- Modify: `sidepanel/render.js:6,9,24,51-53,84-94,111,157-169,182-184,210`

This is the largest task. It updates the renderer to compute window labels and attach them to item data, without changing any DOM structure inside `.group-items`.

- [ ] **Step 1: Update renderBookmarkTree signature and build windowLabelMap**

On line 6, change:
```js
export function renderBookmarkTree(container, state, { initDragAndDrop, selectedIds }) {
```
to:
```js
export function renderBookmarkTree(container, state, { initDragAndDrop, selectedIds, myWindowId, windowFilter }) {
```

On line 9, change:
```js
const { bookmarks, groups, unbookmarkedTabs, floatingTabsByGroup, preferences, activeTabId } = state;
```
to:
```js
const { bookmarks, groups, unbookmarkedTabs, floatingTabsByGroup, preferences, activeTabId, windows } = state;
```

After line 10 (`const collapsedGroups = ...`), add:
```js
  // Build windowId → label number map for badge rendering
  const windowLabelMap = new Map();
  const multipleWindows = windows && windows.length > 1;
  if (multipleWindows) {
    for (const w of windows) {
      windowLabelMap.set(w.id, w.label.replace('Window ', ''));
    }
  }
```

- [ ] **Step 2: Pass window info to renderGroup calls**

On line 24, change:
```js
const section = renderGroup(group, bookmarks, groups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup);
```
to:
```js
const section = renderGroup(group, bookmarks, groups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup, windowLabelMap, myWindowId, windowFilter);
```

- [ ] **Step 3: Add windowLabel to ungrouped bookmarks**

On lines 51-53, change:
```js
    for (const bookmark of ungrouped) {
      const item = document.createElement('bookmark-item');
      item.data = { ...bookmark, isBookmarked: true, isActive: bookmark.tabId === activeTabId };
```
to:
```js
    for (const bookmark of ungrouped) {
      const item = document.createElement('bookmark-item');
      const wLabel = (windowLabelMap.size > 0 && bookmark.windowId && bookmark.windowId !== myWindowId) ? windowLabelMap.get(bookmark.windowId) : null;
      item.data = { ...bookmark, isBookmarked: true, isActive: bookmark.tabId === activeTabId, windowLabel: wLabel };
```

- [ ] **Step 4: Apply windowFilter to unbookmarked tabs and add windowLabel**

Replace lines 62-101 (the entire "Unbookmarked open tabs" section) with:

```js
  // Unbookmarked open tabs
  const filteredUnbookmarkedTabs = windowFilter
    ? unbookmarkedTabs.filter(t => t.windowId === windowFilter)
    : unbookmarkedTabs;

  if (filteredUnbookmarkedTabs.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const isCollapsed = collapsedGroups.includes('__open_tabs__');
    const header = document.createElement('group-header');
    header.data = {
      id: '__open_tabs__',
      name: 'Open Tabs',
      count: filteredUnbookmarkedTabs.length,
      collapsed: isCollapsed,
      isUnbookmarked: true,
    };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items' + (isCollapsed ? ' collapsed' : '');
    items.dataset.groupId = '__open_tabs__';

    for (const tab of filteredUnbookmarkedTabs) {
      const itemId = `tab-${tab.id}`;
      const item = document.createElement('bookmark-item');
      const wLabel = (windowLabelMap.size > 0 && tab.windowId !== myWindowId) ? windowLabelMap.get(tab.windowId) : null;
      item.data = {
        id: itemId,
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || null,
        isOpen: true,
        tabId: tab.id,
        isBookmarked: false,
        isActive: tab.id === activeTabId,
        windowLabel: wLabel,
      };
      applySelection(item, itemId, selectedIds, hasSelection);
      items.appendChild(item);
    }

    section.appendChild(items);
    container.appendChild(section);
  }
```

- [ ] **Step 5: Update renderGroup signature**

On line 111, change:
```js
function renderGroup(group, bookmarks, allGroups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup = {}) {
```
to:
```js
function renderGroup(group, bookmarks, allGroups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup = {}, windowLabelMap = new Map(), myWindowId = null, windowFilter = null) {
```

- [ ] **Step 6: Filter floating tabs and add windowLabel to them**

On line 121, change:
```js
  const groupFloatingTabs = floatingTabsByGroup[group.id] || [];
```
to:
```js
  const allGroupFloatingTabs = floatingTabsByGroup[group.id] || [];
  const groupFloatingTabs = windowFilter
    ? allGroupFloatingTabs.filter(t => t.windowId === windowFilter)
    : allGroupFloatingTabs;
```

Also update the `totalCount` reduce callback (lines 127-130) to filter sub-group floating tabs consistently. Change:
```js
  const totalCount = groupBookmarks.length + groupFloatingTabs.length + subGroups.reduce((sum, sg) => {
    const subFloating = floatingTabsByGroup[sg.id] || [];
    return sum + bookmarks.filter(b => b.groupId === sg.id).length + subFloating.length;
  }, 0);
```
to:
```js
  const totalCount = groupBookmarks.length + groupFloatingTabs.length + subGroups.reduce((sum, sg) => {
    const subFloating = floatingTabsByGroup[sg.id] || [];
    const filteredSubFloating = windowFilter ? subFloating.filter(t => t.windowId === windowFilter) : subFloating;
    return sum + bookmarks.filter(b => b.groupId === sg.id).length + filteredSubFloating.length;
  }, 0);
```

On lines 157-169, in the `renderFloatingTab` function, change:
```js
  function renderFloatingTab(tab) {
    const itemId = `tab-${tab.id}`;
    const item = document.createElement('bookmark-item');
    item.data = {
      id: itemId,
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || null,
      isOpen: true,
      tabId: tab.id,
      isBookmarked: false,
      isActive: tab.id === activeTabId,
    };
```
to:
```js
  function renderFloatingTab(tab) {
    const itemId = `tab-${tab.id}`;
    const item = document.createElement('bookmark-item');
    const wLabel = (windowLabelMap.size > 0 && tab.windowId !== myWindowId) ? windowLabelMap.get(tab.windowId) : null;
    item.data = {
      id: itemId,
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || null,
      isOpen: true,
      tabId: tab.id,
      isBookmarked: false,
      isActive: tab.id === activeTabId,
      windowLabel: wLabel,
    };
```

- [ ] **Step 7: Add windowLabel to group bookmarks**

On lines 182-184, change:
```js
  for (const bookmark of groupBookmarks) {
    const item = document.createElement('bookmark-item');
    item.data = { ...bookmark, isBookmarked: true, isActive: bookmark.tabId === activeTabId };
```
to:
```js
  for (const bookmark of groupBookmarks) {
    const item = document.createElement('bookmark-item');
    const wLabel = (windowLabelMap.size > 0 && bookmark.windowId && bookmark.windowId !== myWindowId) ? windowLabelMap.get(bookmark.windowId) : null;
    item.data = { ...bookmark, isBookmarked: true, isActive: bookmark.tabId === activeTabId, windowLabel: wLabel };
```

- [ ] **Step 8: Thread window params to sub-group rendering**

On line 210, change:
```js
      const subSection = renderGroup(subGroup, bookmarks, allGroups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup);
```
to:
```js
      const subSection = renderGroup(subGroup, bookmarks, allGroups, collapsedGroups, selectedIds, activeTabId, floatingTabsByGroup, windowLabelMap, myWindowId, windowFilter);
```

- [ ] **Step 9: Verify badges appear with multiple windows**

Reload extension. Open a second browser window with some tabs. Open the side panel. Confirm:
- Bookmarks matched to tabs in the other window show a number badge (e.g., "2")
- Bookmarks in the current window show no badge
- Unbookmarked tabs in the other window show a badge
- Drag-and-drop still works normally

- [ ] **Step 10: Commit**

```bash
git add sidepanel/render.js
git commit -m "feat: compute window labels and pass to bookmark-item, apply window filter to tabs"
```

---

## Task 6: Side panel — Track myWindowId and pass to renderer

**Files:**
- Modify: `sidepanel/sidepanel.js:9,35-36,146-149`

- [ ] **Step 1: Add module-level state variables**

After line 9 (`let currentState = null;`), add:
```js
let myWindowId = null;
let windowFilter = null; // null = show all, or a window ID to filter to
```

- [ ] **Step 2: Set myWindowId in init()**

At the top of `init()` (line 35-36), before `currentState = await sendMessage(MSG.GET_STATE);`, add:
```js
  // Track which window we're in (set once — side panel is attached to one window)
  const currentWindow = await chrome.windows.getCurrent();
  myWindowId = currentWindow.id;
```

Note: The spec mentions guarding `onFocusChanged` in sidepanel.js against `WINDOW_ID_NONE`. There is no `onFocusChanged` listener in sidepanel.js — `myWindowId` is set once and not updated. The `WINDOW_ID_NONE` guard is handled in the service worker listener (Task 1). No sidepanel.js guard is needed.

- [ ] **Step 3: Pass myWindowId and windowFilter to renderBookmarkTree**

On lines 146-149, change:
```js
    renderBookmarkTree(container, currentState, {
      initDragAndDrop,
      selectedIds: selectedItems,
    });
```
to:
```js
    renderBookmarkTree(container, currentState, {
      initDragAndDrop,
      selectedIds: selectedItems,
      myWindowId,
      windowFilter,
    });
```

- [ ] **Step 4: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "feat: track myWindowId and pass window context to renderer"
```

---

## Task 7: Window filter row — HTML, JS, and CSS

**Files:**
- Modify: `sidepanel/sidepanel.html:26-27`
- Modify: `sidepanel/sidepanel.js:130-152` (render function)
- Modify: `sidepanel/sidepanel.css` (append styles)

- [ ] **Step 1: Add filter row element to HTML**

In `sidepanel.html`, after the closing `</header>` tag (line 26) and before `<section id="settings-panel"` (line 28), add:
```html
  <div id="window-filter" class="window-filter hidden"></div>
```

- [ ] **Step 2: Add filter row rendering to render() function**

In `sidepanel.js`, in the `render()` function, after the settings-panel early return check (`if (settingsOpen) return;` at line 137) and before `buildFuseIndex();` (line 138), add:

```js
  // Window filter row — show when multiple windows exist
  renderWindowFilter();
```

Then add the `renderWindowFilter` function after the `render()` function (after line 153):

```js
function renderWindowFilter() {
  const filterEl = document.getElementById('window-filter');
  if (!filterEl) return;

  const windows = currentState?.windows || [];

  if (windows.length <= 1) {
    filterEl.classList.add('hidden');
    windowFilter = null;
    return;
  }

  // Reset filter if the selected window no longer exists
  if (windowFilter !== null && !windows.some(w => w.id === windowFilter)) {
    windowFilter = null;
  }

  filterEl.classList.remove('hidden');
  filterEl.innerHTML = '';

  // "All" button
  const allBtn = document.createElement('button');
  allBtn.className = 'window-filter-btn' + (windowFilter === null ? ' active' : '');
  allBtn.textContent = 'All';
  allBtn.addEventListener('click', () => {
    windowFilter = null;
    render();
  });
  filterEl.appendChild(allBtn);

  // Per-window buttons
  for (const win of windows) {
    const btn = document.createElement('button');
    const num = win.label.replace('Window ', '');
    const isCurrent = win.id === myWindowId;
    btn.className = 'window-filter-btn'
      + (windowFilter === win.id ? ' active' : '')
      + (isCurrent ? ' current' : '');
    btn.textContent = num;
    btn.title = win.label + (isCurrent ? ' (current)' : '');
    btn.addEventListener('click', () => {
      windowFilter = win.id;
      render();
    });
    filterEl.appendChild(btn);
  }
}
```

- [ ] **Step 3: Hide filter row when settings panel opens**

In the `openSettings()` function (find `document.getElementById('bookmark-list').classList.add('hidden');`), add after it:
```js
  document.getElementById('window-filter')?.classList.add('hidden');
```

In the `closeSettings()` function (find `document.getElementById('bookmark-list').classList.remove('hidden');`), the filter row visibility will be restored by `render()` which is called at the end of `closeSettings()`. No additional code needed.

- [ ] **Step 4: Add filter row CSS**

Append to `sidepanel/sidepanel.css`:

```css
/* Window filter row */
.window-filter {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-faint);
}

.window-filter.hidden {
  display: none;
}

.window-filter-btn {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s;
}

.window-filter-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.window-filter-btn.active {
  background: var(--group-blue);
  color: #fff;
  border-color: var(--group-blue);
}

.window-filter-btn.current {
  border-color: var(--open-color);
}

.window-filter-btn.current.active {
  border-color: var(--group-blue);
}
```

- [ ] **Step 5: Verify filter row behavior**

Reload extension.
1. With one window: confirm filter row is hidden
2. Open a second window: confirm filter row appears with "All" (active) and "1", "2" buttons
3. Click "2": confirm only Window 2's unbookmarked/floating tabs show; bookmarks still visible with badges
4. Click "All": confirm everything is back
5. Close second window: confirm filter row hides and `windowFilter` resets
6. Drag-and-drop with filter active: confirm it works normally

- [ ] **Step 6: Commit**

```bash
git add sidepanel/sidepanel.html sidepanel/sidepanel.js sidepanel/sidepanel.css
git commit -m "feat: add reactive window filter row with per-window badge buttons"
```

---

## Task 8: Final verification

- [ ] **Step 1: Single window — zero visual change**

Open extension with one window. Confirm no badges, no filter row, identical to before.

- [ ] **Step 2: Multi-window badges**

Open a second window with tabs. Confirm badges on cross-window items. Current-window items have no badge.

- [ ] **Step 3: Filter behavior**

Click window buttons. Confirm bookmarks stay, unbookmarked/floating tabs filter correctly. Count in Open Tabs header updates.

- [ ] **Step 4: Navigation**

Click a bookmark open in another window. Confirm that window focuses.

- [ ] **Step 5: Tab moves**

Drag a tab from one Chrome window to another. Confirm badge updates.

- [ ] **Step 6: Drag-and-drop**

With filter active and inactive: drag items between groups, to Open Tabs, from Open Tabs to groups. Confirm all work.

- [ ] **Step 7: Selection and bulk actions**

Multi-select items across window boundaries. Confirm selection, bulk close, and bulk group-move work.
