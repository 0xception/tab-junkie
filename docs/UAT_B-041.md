# UAT — B-041 Chrome tab group sync (Sprint 42)

**Browser**: Edge (per project memory — user runs Edge, not Chrome)
**Pre-conditions**: Extension loaded unpacked, schema migrated to v5,
no existing chromeTabGroupId on any TJ group.

## Test cases

| # | Scenario | Expected | Actual | Status |
|---|----------|----------|--------|--------|
| 1 | First-time sync (2 groups, 4 tabs in current window) | Strip reordered to TJ order; 2 Chrome tab groups created with matching titles + mapped colors; toast "Synced - 4 tabs - 2 groups" |  |  |
| 2 | Re-sync with no changes | No duplicate groups; toast shows groupsUpdated:2, groupsCreated:0 |  |  |
| 3 | Re-sync after TJ group rename | Chrome group renamed; mapping persists |  |  |
| 4 | Re-sync after TJ color change (teal -> blue) | Chrome color updates from cyan to blue |  |  |
| 5 | Re-sync after manual Chrome group rename | TJ wins — Chrome name overwritten back to TJ name |  |  |
| 6 | Re-sync after manual Chrome group delete | Stale mapping cleared; fresh Chrome group created |  |  |
| 7 | Sync with one pinned tab in a TJ group | Pinned tab skipped; toast shows "1 skipped"; pinned tab stays at left of strip |  |  |
| 8 | Sync with two windows open, only one is the Settings window | Only the Settings window's tab strip is touched; the other window is untouched |  |  |
| 9 | Sync with one TJ group having zero live tabs in this window | Empty group not represented in Chrome; no error |  |  |
| 10 | Sync color check — TJ teal | Chrome cyan |  |  |
| 11 | Sync color check — TJ indigo | Chrome blue |  |  |
| 12 | Sync color check — TJ slate | Chrome grey |  |  |
| 13 | Reload extension -> re-sync | chromeTabGroupId mappings survive cold start; re-sync hits Chrome get(), validates, updates in place |  |  |
| 14 | Sync with chromeTabGroupId in storage but Chrome restart cleared all groups | All stale mappings detected; fresh groups created |  |  |
| 15 | Settings page in Window A, sync, then move Settings tab to Window B, sync again | Each sync targets the window the Settings tab was in at click time |  |  |

## Performance
- Sync of 50 tabs across 5 groups should complete in < 1s (rough budget; chrome.tabs.move + chrome.tabGroups.update are cheap APIs).

## Sign-off
- [ ] All 15 cases PASS
- [ ] No console errors during any sync
- [ ] No regressions in existing UI (sidepanel, newtab, popup all behave as before)
