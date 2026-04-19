## 24. B-018 — Floating Tab Group Persistence Across Restart (R6 Close)

### 24.1 Summary

B-018 is a verification item confirming that floating-group records in `tj:floatingGroups` survive service-worker restarts and browser restarts, and that `reassociateFloatingGroups` correctly re-claims tabs on cold start. The core persistence logic was pre-built in B-001d (drift/claim infrastructure) and B-002 (floating-group re-association). B-018 verified the end-to-end flow and fixed two race conditions found during R4 review.

### 24.2 Architecture Confirmed

The cold-start sequence for floating-group persistence:

1. Service worker wakes (cold start or browser restart).
2. `readyPromise` gates on `runMigrations()` completing.
3. `reconcileClaims()` rebuilds `claimsMirror` from `storage.session` and `liveTabIndex`.
4. `reassociateFloatingGroups(liveTabIndex, existingClaims)` runs post-`reconcileClaims`.
5. For each `tj:floatingGroups` record: position match (`windowId` + `tabIndex`) first, URL fallback second.
6. Disambiguation: first-record-wins via `claimedTabIds` Set prevents multiple records from claiming the same tab.
7. Resolved records are pruned from `tj:floatingGroups`; unresolved records are retained.

No post-restart broadcast is needed. The sidepanel uses a pull-on-open pattern (`MSG_LIST_ITEMS` on every `DOMContentLoaded`), so it always fetches current state including any claims established during re-association.

### 24.3 R4 Fixes

| # | Severity | Finding | File | Fix |
|---|----------|---------|------|-----|
| H-1 | HIGH | TOCTOU in `pruneResolvedFloatingGroups`: stale `records` snapshot used inside `writeTransaction` callback | `background/tabs/floating-groups.js` | Mutator reads live `current` from `writeTransaction`; filters by `resolvedItemIds` Set (stable keys) instead of positional indices |
| H-2 | HIGH | Premature resolution marking: `resolvedItemIds.add()` called before `await claimTabForItem()` succeeded | `background/tabs/floating-groups.js` | Moved `add` to after successful claim; on failure, releases the tab and logs warning |

### 24.4 Storage Schema — No Changes

No new partitions. No schema version bump. `tj:floatingGroups` shape (`FloatingGroup[]`) is unchanged from B-002/B-013. `KNOWN_VERSION` remains at `1`.

### 24.5 Message Contracts — No New Types

No new message types. The re-association flow is internal to the service worker cold-start sequence and does not use `chrome.runtime.onMessage`.

### 24.6 Manifest Permissions — No Changes

No new permissions required.

### 24.7 Test Coverage

9 new tests added (374 total), covering:
- Position-match resolution on cold start
- URL-fallback resolution when tab position has changed
- Disambiguation (first-record-wins via `claimedTabIds`)
- TOCTOU fix: prune uses live `current` not stale snapshot
- Premature-resolution fix: failed claim does not mark record as resolved
- Unresolved records retained across restart cycles

### 24.8 Known Deferred Items

| # | Item | Severity | Notes |
|---|------|----------|-------|
| 1 | No TTL on unresolved `FloatingGroup` records | LOW | Inherited from B-002 (§10.8). Records for permanently closed windows accumulate indefinitely. Cleanup job tracked as tech debt. |

### 24.9 Rollback Plan

No storage schema changes. No new permissions. Reverting B-018 code changes reverts the two race-condition fixes (H-1 and H-2); the pre-B-018 code still functions but has the TOCTOU and premature-resolution bugs under concurrent-write and claim-failure edge cases. No data migration needed.

### 24.10 R2 Correctness Checklist (Post-Build Verification)

| # | Check | Status | Notes |
|---|-------|--------|-------|
| C-1 | Storage schema versioned | N/A | No schema change. Verification item only. |
| C-2 | Message contracts typed | N/A | No new message types. |
| C-3 | Service worker cold-start safe | PASS | `reassociateFloatingGroups` runs after `reconcileClaims` completes; `readyPromise` gates all message handlers. The two race-condition fixes (H-1, H-2) improve cold-start correctness. |
| C-4 | ID stability | PASS | `resolvedItemIds` Set uses `record.itemId` (stable bookmark ID). No positional-index dependency. |
| C-5 | Manifest file references resolvable | N/A | No manifest changes. |

---

