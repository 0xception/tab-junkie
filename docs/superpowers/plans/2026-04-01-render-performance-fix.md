# Render Performance Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate re-render cascades during drag-and-drop and multi-select operations, and fix O(n×m) lookup in state computation.

**Architecture:** Add a render-suppression guard in the sidepanel so STATE_UPDATED messages received during an active drag are deferred into a single post-drag render. Convert a linear tab lookup in `computeState()` to a Map for O(1) access. Debounce filter input to avoid per-keystroke renders.

**Tech Stack:** Vanilla JS, Chrome Extensions API, SortableJS

---

### Task 1: Suppress renders during drag operations

**Files:**
- Modify: `sidepanel/sidepanel.js:31-38` (STATE_UPDATED listener)
- Modify: `sidepanel/sidepanel.js:997-1006` (handleDragStart)
- Modify: `sidepanel/sidepanel.js:1008-1112` (handleDragEnd)

The main performance problem: each `sendMessage()` in `handleDragEnd` triggers `invalidateAndBroadcast()` in the background, which sends STATE_UPDATED back to the sidepanel, which calls `render()`. A single multi-item drag can cause N+3 full DOM teardown/rebuild cycles. Fix: set a flag during drag, defer renders, render once when drag completes.

- [ ] **Step 1: Add drag-in-progress guard and deferred render flag**

At the top of `sidepanel.js` near the other `let` declarations (around line 18), add:

```js
let isDragging = false;
let renderPendingAfterDrag = false;
```

- [ ] **Step 2: Guard the STATE_UPDATED listener**

In the `chrome.runtime.onMessage` listener (line 32-38), change the STATE_UPDATED handler to defer renders during drag:

```js
if (message.type === MSG.STATE_UPDATED) {
  currentState = message.payload;
  if (isDragging) {
    renderPendingAfterDrag = true;
  } else {
    render();
  }
}
```

This still updates `currentState` so post-drag logic has fresh data, but skips the expensive DOM rebuild.

- [ ] **Step 3: Set drag flag in handleDragStart**

In `handleDragStart` (line 997), add `isDragging = true;` as the first line of the function body.

- [ ] **Step 4: Clear drag flag and flush deferred render in handleDragEnd**

At the very end of `handleDragEnd` (after the `persistDragExpandedGroups()` call, around line 1111), add:

```js
isDragging = false;
if (renderPendingAfterDrag) {
  renderPendingAfterDrag = false;
  render();
}
```

- [ ] **Step 5: Manual test**

1. Open the extension sidepanel with multiple groups and items
2. Multi-select 3+ items (Ctrl/Cmd+Click)
3. Drag them to a different group
4. Verify items appear in the target group correctly
5. Verify no visible lag or flicker during the drop
6. Verify single-item drag still works

- [ ] **Step 6: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "perf: suppress re-renders during drag operations

Each sendMessage in handleDragEnd triggered a full DOM teardown/rebuild.
A multi-item drag could cause N+3 re-renders. Now defers STATE_UPDATED
renders while dragging and flushes a single render when drag completes."
```

---

### Task 2: Fix O(n×m) tab lookup in computeState

**Files:**
- Modify: `background/broadcaster.js:207-230` (promote tracking loop)

The "promote tracking" loop added in recent commits uses `tabs.find(t => t.id === bm.tabId)` inside a loop over all enrichedBookmarks. With 100 bookmarks and 50 tabs, that's 5000 comparisons per state computation. Fix: build a Map once.

- [ ] **Step 1: Build tabsById Map before the loop**

In `computeState()`, just before the promote-tracking loop (around line 207), add:

```js
const tabsById = new Map(tabs.map(t => [t.id, t]));
```

- [ ] **Step 2: Replace tabs.find() with Map lookup**

Change line 219 from:
```js
const tab = tabs.find(t => t.id === bm.tabId);
```
to:
```js
const tab = tabsById.get(bm.tabId);
```

- [ ] **Step 3: Verify existing tests pass**

Run: `npm test` (or whatever test runner is configured)
Expected: All tests pass — this is a pure refactor with identical behavior.

- [ ] **Step 4: Commit**

```bash
git add background/broadcaster.js
git commit -m "perf: replace O(n×m) tabs.find() with Map lookup in computeState"
```

---

### Task 3: Debounce filter input

**Files:**
- Modify: `sidepanel/sidepanel.js:440-457` (setupFilter function)

The filter input calls `render()` on every keystroke with no debounce. Each render rebuilds the Fuse index, clears DOM, recreates all elements, and reinitializes Sortable. Fix: debounce the input handler.

- [ ] **Step 1: Add debounce to the input handler**

Replace the `setupFilter` function (lines 440-457) with:

```js
function setupFilter() {
  const input = document.getElementById('filter-input');
  const clearBtn = document.getElementById('filter-clear');
  let filterTimer = null;

  input.addEventListener('input', () => {
    filterQuery = input.value.trim();
    clearBtn.classList.toggle('hidden', !filterQuery);
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => render(), 150);
  });

  clearBtn.addEventListener('click', () => {
    clearTimeout(filterTimer);
    input.value = '';
    filterQuery = '';
    clearBtn.classList.add('hidden');
    render();
    input.focus();
  });
}
```

The clear button still renders immediately (user expects instant feedback on explicit action). Only the typing path is debounced.

- [ ] **Step 2: Manual test**

1. Open sidepanel with many bookmarks
2. Type quickly in the filter input
3. Verify results appear after a brief pause (not per-keystroke)
4. Verify clear button still works instantly
5. Verify backspace/delete work smoothly

- [ ] **Step 3: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "perf: debounce filter input to avoid per-keystroke re-renders"
```

---

### Task 4: Guard group drag handlers with same drag flag

**Files:**
- Modify: `sidepanel/sidepanel.js:933-983` (group drag handlers)

Group drag-and-drop has the same cascade problem — `handleGroupDragEnd` sends multiple `MSG.MOVE_GROUP` messages sequentially, each triggering a full re-render. Reuse the same `isDragging` guard.

- [ ] **Step 1: Set drag flag in handleGroupDragStart**

In `handleGroupDragStart` (line 933), add `isDragging = true;` as the first line.

- [ ] **Step 2: Clear drag flag and flush in handleGroupDragEnd**

At the end of `handleGroupDragEnd` (after the for loop, around line 982), add:

```js
isDragging = false;
if (renderPendingAfterDrag) {
  renderPendingAfterDrag = false;
  render();
}
```

- [ ] **Step 3: Manual test**

1. Drag a group to reorder it
2. Drag a group into a sub-group container
3. Verify no lag/flicker during drop
4. Verify groups land in correct positions

- [ ] **Step 4: Commit**

```bash
git add sidepanel/sidepanel.js
git commit -m "perf: suppress re-renders during group drag operations"
```
