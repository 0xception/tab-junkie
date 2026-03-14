# Chrome Tab Groups Sync Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance "Sync now" to create Chrome tab groups that mirror Junkie's group structure, with color mapping and sub-group flattening.

**Architecture:** Rewrite the `SYNC_ALL_TAB_ORDER` handler to: (1) ungroup all existing Chrome tabs, (2) collect open tabs per Junkie group with sub-groups flattened into parents, (3) reorder and group tabs via `chrome.tabs.move()` + `chrome.tabs.group()`, (4) set title and color via `chrome.tabGroups.update()`. The `isSyncingTabOrder` flag wraps the entire operation to suppress rebroadcast storms.

**Tech Stack:** Chrome Extension APIs (`chrome.tabs.group`, `chrome.tabGroups.update`, `chrome.tabs.ungroup`)

---

## File Structure

| File | Role |
|------|------|
| `manifest.json` | Add `"tabGroups"` permission |
| `shared/messages.js` | Add `JUNKIE_TO_CHROME_COLOR` color mapping constant |
| `background/service-worker.js` | Rewrite `SYNC_ALL_TAB_ORDER` handler, refactor `syncTabOrderInChrome` to accept `skipFlagManagement` param |

---

### Task 1: Add `tabGroups` permission to manifest

**Files:**
- Modify: `manifest.json:6`

- [ ] **Step 1: Add the permission**

In `manifest.json`, add `"tabGroups"` to the permissions array:

```json
  "permissions": ["tabs", "tabGroups", "storage", "sidePanel"],
```

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "feat: add tabGroups permission for Chrome tab group sync"
```

---

### Task 2: Add color mapping constant

**Files:**
- Modify: `shared/messages.js` (append after `GROUP_COLORS`)

- [ ] **Step 1: Add the color map**

Append after the `GROUP_COLORS` array closing `];` (line 36) in `shared/messages.js`:

```js
// Map Junkie hex colors → Chrome tab group color names
export const JUNKIE_TO_CHROME_COLOR = {
  '#5b91cf': 'blue',
  '#b45bcf': 'purple',
  '#5bcfbc': 'cyan',
  '#cf5b5b': 'red',
  '#cf8a5b': 'orange',
  '#cf5b91': 'pink',
  '#7b5bcf': 'purple',  // Indigo maps to purple (Chrome has no indigo)
  '#cfcf5b': 'yellow',
  '#8899aa': 'grey',
};
```

- [ ] **Step 2: Commit**

```bash
git add shared/messages.js
git commit -m "feat: add Junkie-to-Chrome color mapping constant"
```

---

### Task 3: Refactor `syncTabOrderInChrome` to support external flag management

**Files:**
- Modify: `background/service-worker.js:190-217`

The new `SYNC_ALL_TAB_ORDER` handler needs to hold `isSyncingTabOrder` for the entire operation (ungroup + reorder + group). Currently `syncTabOrderInChrome` manages the flag itself. Add a parameter to skip that when the caller manages it.

- [ ] **Step 1: Add `skipFlagManagement` parameter**

Replace the `syncTabOrderInChrome` function (lines 190-217) with:

```js
async function syncTabOrderInChrome(tabOrder, { skipFlagManagement = false } = {}) {
  if (tabOrder.length < 2) return;
  const tabs = await Promise.all(tabOrder.map(id => chrome.tabs.get(id).catch(() => null)));
  const valid = tabs.filter(Boolean);
  if (valid.length < 2) return;

  // Group by window — can only reorder within same window
  const byWindow = new Map();
  for (const tab of valid) {
    if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
    byWindow.get(tab.windowId).push(tab);
  }

  if (!skipFlagManagement) isSyncingTabOrder = true;
  try {
    for (const [, windowTabs] of byWindow) {
      // Preserve Junkie's order within each window
      const tabIdOrder = tabOrder.filter(id => windowTabs.some(t => t.id === id));
      const anchor = Math.min(...windowTabs.map(t => t.index));
      for (let i = 0; i < tabIdOrder.length; i++) {
        await chrome.tabs.move(tabIdOrder[i], { index: anchor + i });
      }
    }
  } finally {
    if (!skipFlagManagement) {
      isSyncingTabOrder = false;
      broadcaster.invalidateAndBroadcast();
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add background/service-worker.js
git commit -m "refactor: add skipFlagManagement param to syncTabOrderInChrome"
```

---

### Task 4: Rewrite `SYNC_ALL_TAB_ORDER` handler

**Files:**
- Modify: `background/service-worker.js:4` (add import)
- Modify: `background/service-worker.js:151-174` (replace handler)

- [ ] **Step 1: Add `JUNKIE_TO_CHROME_COLOR` import**

Update the import on line 4:

```js
import { MSG, JUNKIE_TO_CHROME_COLOR } from '../shared/messages.js';
```

- [ ] **Step 2: Replace the `SYNC_ALL_TAB_ORDER` handler**

Replace lines 151-174 (the existing `case MSG.SYNC_ALL_TAB_ORDER:` block) with:

```js
    case MSG.SYNC_ALL_TAB_ORDER: {
      try {
        isSyncingTabOrder = true;

        // Step 1: Ungroup all existing Chrome tab groups (clean slate)
        const allTabs = await chrome.tabs.query({});
        const groupedTabIds = allTabs
          .filter(t => t.groupId !== -1)
          .map(t => t.id);
        if (groupedTabIds.length > 0) {
          await chrome.tabs.ungroup(groupedTabIds);
        }

        // Step 2: Get Junkie state
        const state = await broadcaster.getState();

        // Step 3: Build flat sync groups (sub-groups flattened into parents)
        const topLevelGroups = state.groups
          .filter(g => g.parentId === null)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        for (const group of topLevelGroups) {
          // Collect tabs: parent first, then sub-groups in sortOrder
          const tabOrder = [];
          collectGroupTabs(state, group.id, tabOrder);

          const subGroups = state.groups
            .filter(g => g.parentId === group.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          for (const sub of subGroups) {
            collectGroupTabs(state, sub.id, tabOrder);
          }

          if (tabOrder.length === 0) continue;

          // Step 4: Reorder tabs in Chrome
          if (tabOrder.length >= 2) {
            await syncTabOrderInChrome(tabOrder, { skipFlagManagement: true });
          }

          // Step 5: Create Chrome tab group per window
          // Re-fetch tab info after moves to get current windowIds
          const movedTabs = await Promise.all(
            tabOrder.map(id => chrome.tabs.get(id).catch(() => null))
          );
          const validTabs = movedTabs.filter(Boolean);
          if (validTabs.length === 0) continue;

          const byWindow = new Map();
          for (const tab of validTabs) {
            if (!byWindow.has(tab.windowId)) byWindow.set(tab.windowId, []);
            byWindow.get(tab.windowId).push(tab.id);
          }

          const chromeColor = JUNKIE_TO_CHROME_COLOR[group.color] || 'grey';

          for (const [windowId, windowTabIds] of byWindow) {
            const chromeGroupId = await chrome.tabs.group({
              tabIds: windowTabIds,
              createProperties: { windowId },
            });
            await chrome.tabGroups.update(chromeGroupId, {
              title: group.name,
              color: chromeColor,
            });
          }
        }

        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      } finally {
        isSyncingTabOrder = false;
        broadcaster.invalidateAndBroadcast();
      }
    }
```

- [ ] **Step 3: Add the `collectGroupTabs` helper**

Add this function after `syncTabOrderInChrome` (at the end of the file):

```js
function collectGroupTabs(state, groupId, tabOrder) {
  const groupBookmarks = state.bookmarks
    .filter(b => b.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const floatingTabs = state.floatingTabsByGroup[groupId] || [];
  for (const bm of groupBookmarks) {
    if (bm.tabId != null) tabOrder.push(bm.tabId);
  }
  for (const tab of floatingTabs) {
    tabOrder.push(tab.id);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add background/service-worker.js shared/messages.js
git commit -m "feat: sync Junkie groups to Chrome tab groups with color mapping"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Reload extension**
1. Go to `chrome://extensions`
2. Click reload on Junkie
3. Verify no errors in the service worker console

- [ ] **Step 2: Verify Chrome tab group creation**
1. Create 2-3 Junkie groups with different colors
2. Open several bookmarked tabs across the groups
3. Open Settings → click "Sync now" → "Confirm"
4. Check Chrome's tab strip: tabs should be grouped with matching titles and colors
5. Groups should be clustered together

- [ ] **Step 3: Verify sub-group flattening**
1. Create a parent group with a sub-group
2. Open tabs in both parent and sub-group
3. Sync → both sets of tabs should appear in one Chrome group titled after the parent

- [ ] **Step 4: Verify clean slate**
1. Manually create a Chrome tab group (right-click tab → "Add tab to new group")
2. Sync → the manually created Chrome group should be removed, replaced with Junkie groups

- [ ] **Step 5: Verify edge cases**
1. Group with only unopened bookmarks → no Chrome group created
2. Tabs across multiple windows → each window gets its own Chrome group instances
3. Unbookmarked open tabs → remain ungrouped
