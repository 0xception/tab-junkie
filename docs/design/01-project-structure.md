## 1. Project Structure

Current build-relevant layout on `feature/rebuild-from-prd` (paths shipped through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-053 + B-013 + B-005 + B-054):

```
junkie/
├── manifest.json                          Chrome MV3 manifest
├── jsconfig.json                          TS checker shim (suppresses circular-import false positives, see B-053)
├── .eslintrc.json                         Write-boundary denylist (see §6)
├── background/
│   ├── service-worker.js                  Entry point · exports `readyPromise` (gates on runMigrations) · wires onMessage + tab events
│   ├── broadcast.js                       State broadcaster · SCOPE enum · fire-and-forget runtime.sendMessage to all open surfaces · cold-start suppression via isClaimsReady gate (B-050)
│   ├── messages/
│   │   └── storage-handlers.js            runtime.onMessage dispatcher + sender guard + safe-mode write gate
│   ├── storage/
│   │   ├── index.js                       Public barrel (no writeTransaction export — M3)
│   │   ├── shapes.js                      Partition key constants, defaults, shape validators, length caps (extracted from partitions.js; B-053)
│   │   ├── partitions.js                  Re-exports shapes.js + readPartition + initializePartitions (B-053 refactor)
│   │   ├── ids.js                         Zero-dep ULID generator (strict-monotonic)
│   │   ├── errors.js                      StorageError + ERR_* constants (incl. ERR_SAFE_MODE) + isQuotaError
│   │   ├── write-transaction.js           Serialized atomic batcher — SOLE write path
│   │   ├── migration.js                   Migration runner · KNOWN_VERSION · safe-mode · quota monitor (B-001b)
│   │   ├── items.js                       Item CRUD + bulkCreateItems (B-005)
│   │   ├── groups.js                      Group CRUD + depth/cycle enforcement + cascade on delete
│   │   └── preferences.js                 Preferences CRUD
│   └── tabs/
│       ├── index.js                       Barrel · exports registerTabEventListeners, initializeLiveState, buildLiveStates (B-001c)
│       ├── live-tab-index.js              SW-memory Map<tabId,{url,windowId,active,audible,index}> — never written to storage.local (B-001c)
│       ├── tab-claims.js                  storage.session TabClaims mirror + reconcile/release/reevaluate + buildLiveStates + claimTabForItem (B-001c/d)
│       ├── tab-events.js                  chrome.tabs/windows event handlers + drift detection hook + opener-chain inheritance in onCreated (B-001c/d + B-013)
│       ├── drift.js                       Drift write/clear logic; driftedToUrl normalized via shared/url.js; fragment stripped before storage (B-001d)
│       ├── opener-chain.js                Ephemeral openerMap + walkOpenerChain with cycle guard and size cap (B-013)
│       └── floating-groups.js             Floating-group re-association + appendFloatingGroup atomic append (B-002 + B-013)
├── shared/
│   ├── messages.js                        MSG_* constants (19 total, incl. MSG_GET_STATUS, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM, MSG_STATE_CHANGED, MSG_NAVIGATE_TO_ITEM, MSG_CLOSE_TABS, MSG_BULK_CREATE_ITEMS) + envelope typedefs incl. ListItemsResponse (NO storage logic)
│   ├── constants.js                       GROUP_COLORS — 9-color allowlist palette for group color values (B-006)
│   ├── url.js                             URL normalization — normalizeUrl(url, mode) with forStorage/forMatch modes; scheme allowlist; protocol defaulting; hostname lowercasing (B-001d)
│   └── errors.js                          Canonical home for StorageError + ERR_* constants (moved from background/storage/errors.js, which now re-exports from here) (B-001d)
├── sidepanel/
│   ├── sidepanel.html                     Shell HTML: header, filter, group list, dialogs, skeleton, empty state (B-054)
│   ├── sidepanel.js                       Main module: renderAll, refetchAndPatchLiveState, drag/drop, keyboard nav, CRUD dialogs (B-054, 1249 lines)
│   ├── sidepanel.css                      Full stylesheet: layout, indicators, themes, skeletons, dialogs, drag states (B-054)
│   └── theme-init.js                      Synchronous theme class application before first paint (B-054)
├── newtab/
│   └── newtab.html                        Placeholder stub — overwritten by B-035
├── popup/
│   └── popup.html                         Placeholder stub — overwritten by B-036
└── tests/                                 R5 test suite (unit · integration · perf · UAT notes)
```

The sidepanel is fully implemented (B-054). The HTML stubs in `newtab/` and
`popup/` exist only so Chrome's manifest validator can resolve
`chrome_url_overrides.newtab` / `action.default_popup` at extension load
time. They have no script content and will be replaced when the
corresponding UI backlog items land.

---

