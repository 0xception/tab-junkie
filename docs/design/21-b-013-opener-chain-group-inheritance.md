## 21. B-013 — Opener-Chain Group Inheritance (R6 Close)

### Overview

When a user opens a new tab from an existing tab (e.g., Ctrl+click, middle-click, "Open in new tab"), the new tab inherits the group membership of its opener's saved item. This enables automatic group propagation without manual user intervention.

### Architecture

#### New module: `background/tabs/opener-chain.js`

Maintains an ephemeral in-memory `Map<tabId, openerTabId>` and provides a pure walk function to find the nearest grouped ancestor.

**Exports:**

| Export | Kind | Description |
|--------|------|-------------|
| `recordOpener(tabId, openerTabId)` | `function` | Records opener relationship; no-op when map is at capacity |
| `pruneOpener(tabId)` | `function` | Removes the child's entry; does NOT remove entries where tabId appears as a value (children maintain their opener references even after parent closes) |
| `pruneOpenersByWindow(tabIds[])` | `function` | Bulk prune for window close |
| `walkOpenerChain(tabId, claimsMirror, items, maxHops?)` | `function` | Pure function; walks up opener chain looking for nearest grouped ancestor; returns `{ groupId, itemId }` or `null` |
| `__resetOpenerMap()` | `function` | Test hatch — clears the map between tests |

**Design constraints:**

- **`MAX_OPENER_MAP_ENTRIES = 512`**: Hard cap prevents unbounded memory growth over long browser sessions. When the cap is reached, new opener relationships are silently dropped — the tab opens normally without group inheritance.
- **Cycle guard**: `walkOpenerChain` uses a `visited` Set initialized with the starting tabId. If a cycle is detected (openerMap points back to an already-visited tabId), the walk terminates immediately.
- **Max hops = 3** (default): Limits the walk depth. O(N * hops) linear scan of `claimsMirror` per hop, where N = number of claimed items. Acceptable for expected claim counts (< 1000 items).
- **Ephemeral**: The openerMap is lost on service worker restart. This is intentional and consistent with Chrome's own behavior — opener relationships (`tab.openerTabId`) are not persisted by Chrome across restarts. Consequence: tabs whose `onCreated` fired before a SW restart and whose `onRemoved` fires after will not have their opener relationships available. This is an accepted limitation.

#### Changes to `background/tabs/tab-events.js`

The `tabs.onCreated` listener now:

1. **Synchronous phase** (before any `await`): calls `updateTabEntry(tab.id, ...)` to register the tab in LiveTabIndex, then calls `recordOpener(tab.id, tab.openerTabId)` if the tab has an opener.
2. **Async IIFE**: awaits `readyPromise`, reads items, gets `claimsMirror`, calls `walkOpenerChain`. If a grouped ancestor is found:
   - Re-reads live state from `getLiveTabIndex().get(tab.id)` after the async gap (the tab's URL and index may have settled from the creation-time `about:blank` to the actual navigation target).
   - Bails out if the tab was removed during the async gap.
   - Calls `appendFloatingGroup` with the live URL, windowId, and tabIndex — not the stale creation-time values.
   - Broadcasts `tab/opener-inherited` without the `requireClaimsReady` guard (so the UI is notified even if claims haven't fully reconciled yet).

The `tabs.onRemoved` listener calls `pruneOpener(tabId)`.
The `windows.onRemoved` listener calls `pruneOpenersByWindow(removedTabIds)`.

#### Changes to `background/tabs/floating-groups.js`

- **`appendFloatingGroup(entry)`** (new): Atomic append via `writeTransaction` mutator. Unlike `saveFloatingGroups` which replaces the entire `tj:floatingGroups` partition, `appendFloatingGroup` reads-then-appends inside a single mutator, avoiding race conditions with concurrent appends.
- **Floating-group record shape**: Now includes `itemId: string` (required on write) and `savedAt: number` (required). The `assertShape` validator in `shapes.js` treats `itemId` as optional for backward compatibility with records written before B-013.
- **`reassociateFloatingGroups`**: Now calls `claimTabForItem(record.itemId, matchedTabId)` instead of using `record.groupId`. Records lacking a valid `itemId` (pre-B-013 orphans) are silently pruned without claim propagation to prevent poisoning the claims mirror with `undefined`.

### Data flow

```
tabs.onCreated(tab)
  |-- [sync] updateTabEntry(tab.id, {...})
  |-- [sync] recordOpener(tab.id, tab.openerTabId)
  +-- [async IIFE]
       |-- await readyPromise
       |-- items = await listItems()
       |-- claimsMirror = getClaimsMirror()
       |-- result = walkOpenerChain(tab.id, claimsMirror, items)
       |-- if result:
       |    |-- liveEntry = getLiveTabIndex().get(tab.id)  // re-read after async gap
       |    |-- if !liveEntry -> return (tab was removed)
       |    |-- await appendFloatingGroup({groupId, itemId, windowId, tabIndex, url, savedAt})
       |    +-- broadcast(SCOPE.LIVE_STATE, 'tab/opener-inherited')
       +-- catch -> console.warn (non-fatal)
```

### Files changed

| File | Change |
|------|--------|
| `background/tabs/opener-chain.js` | **New.** openerMap, recordOpener, pruneOpener, pruneOpenersByWindow, walkOpenerChain, __resetOpenerMap. |
| `background/tabs/tab-events.js` | `onCreated` listener: synchronous recordOpener + async inheritance IIFE. `onRemoved`: pruneOpener. `windows.onRemoved`: pruneOpenersByWindow. |
| `background/tabs/floating-groups.js` | `appendFloatingGroup` added. `saveFloatingGroups` and `reassociateFloatingGroups` updated for `itemId` field. Orphan guard for records lacking `itemId`. |
| `background/storage/shapes.js` | `assertShape` for `floatingGroups` partition: `itemId` validated on write but treated as optional in the shape validator for backward compatibility. |

### Manifest permissions — No changes

No new permissions required. `tabs` permission (already declared) provides `tab.openerTabId`.

### Rollback plan

**Risk:** Low — openerMap is ephemeral; floating-group records with `itemId` are backward-compatible (assertShape treats `itemId` as optional). `git revert <commit-sha>` removes opener-chain logic. Existing floating-group records with `itemId` are harmless — the extra field is ignored by pre-B-013 code. No storage migration needed.

### R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | PASS | `tj:floatingGroups` shape extended with optional `itemId`. No schema version bump needed — `assertShape` treats `itemId` as optional for backward compatibility. |
| C-2 | Message contracts typed | N/A | No new message types. `tab/opener-inherited` is a broadcast event, not a request/response message. |
| C-3 | Service worker cold-start safe | PASS | openerMap starts empty on every cold start — no stale state. `readyPromise` gate ensures items and claims are loaded before walking the chain. |
| C-4 | ID stability | PASS | `itemId` in floating-group records is the ULID of the opener's item — stable across URL drift and window moves. |
| C-5 | Manifest file references resolvable | N/A | No new manifest entries. |

---

