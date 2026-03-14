# Sync to Chrome Tab Groups

## Problem

The current "Sync now" feature only reorders tabs in Chrome's tab strip. It doesn't create Chrome/Edge tab groups, so there's no visual grouping in the browser itself. Users who want Junkie to be their primary tab manager need Chrome's tab strip to reflect Junkie's group structure — not just tab order.

## Solution

Enhance the existing `SYNC_ALL_TAB_ORDER` handler to also create Chrome tab groups that mirror Junkie's groups. On sync, all existing Chrome tab groups are removed (clean slate), then Junkie's groups are recreated as Chrome tab groups with matching titles and mapped colors. Sub-groups are flattened into their parent group. Unopened bookmarks are skipped since Chrome groups only work with open tabs.

## Design

### Sync Flow

When the user clicks "Sync now" in the settings panel:

1. **Ungroup all tabs:** Query all tabs via `chrome.tabs.query({})`, filter for `tab.groupId !== -1` (where `-1` is `chrome.tabGroups.TAB_GROUP_ID_NONE`), then call `chrome.tabs.ungroup(tabIds)` on those tab IDs. This removes all existing Chrome tab groups across all windows.
2. **Get state:** Call `broadcaster.getState()` to get Junkie's groups, bookmarks, and floating tabs. The cached state is valid here because the ungroup operation only affects Chrome's visual grouping — it does not mutate Junkie's stored data (groups, bookmarks, floatingTabsByGroup).
3. **Build flat sync groups:** For each top-level Junkie group, collect open tab IDs from the group itself and all its sub-groups (see Sub-group Flattening below).
4. **Set `isSyncingTabOrder = true`** for the entire operation to suppress rebroadcast storms from `chrome.tabs.onMoved` events triggered by both `chrome.tabs.move()` and `chrome.tabs.ungroup()`.
5. For each sync group with 1+ open tabs:
   - Reorder tabs via `chrome.tabs.move()` (existing `syncTabOrderInChrome` logic, scoped per window — but called directly without its own `isSyncingTabOrder` management since the flag is already held)
   - Group the tabs via `chrome.tabs.group({ tabIds })` — done per window since `chrome.tabs.group` requires all tabs be in the same window
   - Set group title and color via `chrome.tabGroups.update(groupId, { title, color })`
   - Each window's Chrome tab group receives the same title and color for the same Junkie group
6. **Reset `isSyncingTabOrder = false`** in a `finally` block, then broadcast once.
7. Tabs not in any Junkie group (unbookmarked open tabs) remain ungrouped
8. Return `{ success: true }` or `{ success: false, error }` with try/catch

### Sub-group Flattening

Chrome tab groups don't support nesting. Sub-groups are flattened into their parent:
- Parent group "Work" with sub-groups "Frontend" and "Backend"
- All open tabs from Work + Frontend + Backend appear in one Chrome group titled "Work"
- Tab order within the Chrome group:
  1. Parent group's bookmarks in ascending `sortOrder`, followed by the parent's floating tabs (pre-sorted by `tab.index` from `matchTabsToBookmarks`)
  2. Sub-groups are visited in ascending sub-group `sortOrder`. Within each sub-group, bookmarks are collected in ascending bookmark `sortOrder`, followed by the sub-group's floating tabs.

### Color Mapping

A constant map from Junkie hex values to Chrome's fixed color names:

```js
const JUNKIE_TO_CHROME_COLOR = {
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

Fallback for unknown colors: `'grey'`.

### Manifest Change

Add `"tabGroups"` to the permissions array in `manifest.json`. The `"tabs"` permission is already present. Edge supports this permission via its shared Chromium base (88+).

### Window Scoping

`chrome.tabs.group()` requires all tabs in the call to be in the same window. The handler groups collected tab IDs by `windowId` before creating Chrome tab groups. Each window gets its own Chrome tab group instance for the same Junkie group. If a Junkie group's tabs are split across N windows, N separate Chrome tab groups are created, all with the same title and color.

## Files to Modify

| File | Change |
|------|--------|
| `manifest.json` | Add `"tabGroups"` to permissions |
| `shared/messages.js` | Add `JUNKIE_TO_CHROME_COLOR` constant map |
| `background/service-worker.js` | Rewrite `SYNC_ALL_TAB_ORDER` handler: ungroup all tabs, hold `isSyncingTabOrder` for entire operation, build flat group list with sub-group flattening, create Chrome tab groups per window, set title and color. Refactor `syncTabOrderInChrome` to accept an optional flag to skip its own `isSyncingTabOrder` management when called from the new handler. |

No UI changes — the settings panel, confirmation dialog, and feedback indicator are already wired up.

## Edge Cases

- **Group with zero open tabs:** skipped, no Chrome group created
- **Sub-group with no parent open tabs:** sub-group's tabs still appear in the parent's Chrome group
- **Multiple windows:** each window gets independent Chrome tab groups; a Junkie group may produce separate Chrome groups in different windows, all with the same title and color
- **Tab that was closed between confirmation and sync:** `chrome.tabs.get()` catch handles gracefully (existing behavior)
- **Ungrouped bookmarks with open tabs:** left ungrouped in Chrome (no Chrome group created for the "Ungrouped" section)
- **Stale cached state:** `syncTabOrderInChrome` already handles missing tab IDs via `.catch(() => null)`. Cached Junkie state is valid since ungroup doesn't affect stored data.

## Out of Scope

- Auto-sync on state changes (future enhancement — designed for but not implemented)
- Settings toggle for clean-slate vs preserve-existing behavior
- Syncing Chrome tab group state back into Junkie
- Collapsing Chrome tab groups to match Junkie's collapsed state
