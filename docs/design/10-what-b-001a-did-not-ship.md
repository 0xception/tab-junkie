## 10. What B-001a Did NOT Ship (updated through B-001d + B-002 + B-006 + B-016 + B-017 + B-050 + B-019 + B-020 + B-021 + B-011 + B-012 + B-015 + B-053 + B-013 + B-005 + B-054 + B-018)

Items fully resolved by B-001b, B-001c, B-001d, B-002, B-006, B-016, B-017, B-050, B-019, or B-020 are marked **DONE**. The entire B-001 family (a/b/c/d) is now complete. Remaining items are open.

| Handoff | Owner | Status | Detail |
|---|---|---|---|
| Schema version field consumption + migration runner + `ready` barrier | **B-001b** | **DONE** | `runMigrations()` replaces the stub `readyPromise`. `tj:meta.schemaVersion` is now read, compared to `KNOWN_VERSION`, and acted upon on every cold start. See §10.6. |
| Read-only safe-mode (downgrade path, R0 decision #9) | **B-001b** | **DONE** | `isSafeMode()` in `migration.js`; write gate in `storage-handlers.js`; `ERR_SAFE_MODE` returned to callers. |
| Quota warning flag (80% threshold per R0 decision #8) | **B-001b** | **DONE** | `evaluateQuota()` runs after migrations; `quotaWarning` flag exposed via `MSG_GET_STATUS`. UI banner deferred to the sidepanel item (B-022). |
| Legacy `junkie_*` storage key migration | **B-001b** | **DONE** | `migrateLegacyKeys()` runs best-effort post-migration; known legacy keys are shape-mapped to Items and removed. |
| `LiveTabIndex` (ephemeral SW-memory index of live tabs) | **B-001c** | **DONE** | `background/tabs/live-tab-index.js` — `Map<tabId, {url,windowId,active,audible,index}>`, built on cold start, kept current by event handlers. |
| `TabClaims` disambiguation table | **B-001c** | **DONE** | `background/tabs/tab-claims.js` — `storage.session` under `tj:tabClaims`; in-memory mirror; reconciled on cold start; released on tab close/URL change. |
| `MSG_LIST_ITEMS` enriched with `liveStates` | **B-001c** | **DONE** | Response shape is now `{ items, liveStates, driftRecords }`. |
| Drift record persistence | **B-001d** | **DONE** | `background/tabs/drift.js` writes/clears `tj:drift`; `driftedToUrl` normalized via `shared/url.js` (forStorage mode); fragments stripped before storage; unclaimed-tab events are no-ops. `MSG_LIST_ITEMS` response now includes `driftRecords`. See §10.7. |
| Floating-group re-association | **B-002** | **DONE** | `background/tabs/floating-groups.js` implements position-match → URL-fallback → retain-unresolved strategy. First-in-array-wins on ties. Claims propagated to `claimsMirror`. No TTL on unresolved records (documented limitation). See §10.8. |
| Group color palette enforcement + `shared/constants.js` | **B-006** | **DONE** | `GROUP_COLORS` (9-color allowlist) defined in `shared/constants.js`; enforced in `groups.js` at create/update time via `ERR_VALIDATION`. Duplicate-name warning (non-blocking, same-parentId scope, `warning` field on return only). See §10.9. |
| Promote tab to saved item | **B-016** | **DONE** | `MSG_PROMOTE_TAB` handler in `storage-handlers.js`; `file:` scheme blocked; `ERR_DUPLICATE_URL` on URL collision; `claimTabForItem` called on success. See §5 notes. |
| Demote saved item to floating tab | **B-017** | **DONE** | `MSG_DEMOTE_ITEM` handler; operation order: delete → clearDrift → saveFloating → releaseClaim; partial atomicity is a documented limitation. See §5 notes and §10.9. |
| State broadcast to all surfaces | **B-050** | **DONE** | `background/broadcast.js` with `SCOPE` enum; `MSG_STATE_CHANGED` push on every mutation + tab event; fire-and-forget delivery; cold-start suppression via `isClaimsReady` gate; `MUTATION_BROADCASTS` table maps handler names to broadcast payloads. `lastAccessedAt` added to `updateItem` allowed fields (latent bug fix). See §10.10. |
| Navigate to item | **B-019** | **DONE** | `MSG_NAVIGATE_TO_ITEM` handler; switches to claimed tab or opens new tab with immediate `claimTabForItem` call on new-tab path. |
| Close tabs | **B-020** | **DONE** | `MSG_CLOSE_TABS` handler; partitions `ids` array into valid vs already-gone; closes valid tabs via `chrome.tabs.remove`; `onRemoved` handles claim cleanup. |
| Sidepanel UI | **B-022 / B-054** | **DONE** | Full sidepanel implementation: group tree rendering, live-state patching, drag reorder, keyboard navigation, CRUD dialogs, filter, theme support, skeleton loader, empty state. See §23. |
| Newtab UI | **B-035** | pending | Currently a stub `newtab.html`. |
| Popup UI | **B-036** | pending | Currently a stub `popup.html`. |
| ESLint allowlist refactor + circular-dep extraction | **B-053** | pending | Flip denylist → allowlist (only `background/**` may reach `background/storage/**`); resolve the circular `partitions.js` ↔ `write-transaction.js` import that `jsconfig.json` currently papers over. |

---

