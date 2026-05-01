/**
 * Message contract between UI surfaces and the background service worker.
 *
 * UI code imports ONLY from this module and `chrome.runtime.sendMessage`.
 * Direct imports from `background/storage/**` or `background/messages/**`
 * are statically blocked by ESLint (see `.eslintrc.json`) and rejected at
 * runtime by the storage-handlers dispatcher (see AC5, R2 §6).
 */

// ---- Item operations ----
export const MSG_CREATE_ITEM = 'tj/createItem';
export const MSG_UPDATE_ITEM = 'tj/updateItem';
export const MSG_DELETE_ITEM = 'tj/deleteItem';
export const MSG_LIST_ITEMS = 'tj/listItems';
export const MSG_GET_ITEM = 'tj/getItem';

/** Bulk-create multiple saved items with partial-success semantics. */
export const MSG_BULK_CREATE_ITEMS = 'tj/bulkCreateItems';

// ---- Group operations ----
export const MSG_CREATE_GROUP = 'tj/createGroup';
export const MSG_UPDATE_GROUP = 'tj/updateGroup';
export const MSG_DELETE_GROUP = 'tj/deleteGroup';
export const MSG_LIST_GROUPS = 'tj/listGroups';
export const MSG_GET_GROUP = 'tj/getGroup';

// ---- Preferences ----
export const MSG_GET_PREFERENCES = 'tj/getPreferences';
export const MSG_SET_PREFERENCES = 'tj/setPreferences';

// ---- System status ----
export const MSG_GET_STATUS = 'tj/getStatus';

// ---- Tab promotion ----
export const MSG_PROMOTE_TAB = 'tj/promoteTab';

// ---- Tab demotion ----
export const MSG_DEMOTE_ITEM = 'tj/demoteItem';

// ---- Tab navigation ----
export const MSG_NAVIGATE_TO_ITEM = 'tj/navigateToItem';

// ---- Tab close ----
export const MSG_CLOSE_TABS = 'tj/closeTabs';

// ---- Bulk operations ----
/** Bulk-delete saved items by id array. Partial-success semantics. */
export const MSG_BULK_DELETE_ITEMS = 'tj/bulkDeleteItems';
/** Bulk-update saved items' groupId by id array + patch. Partial-success semantics. */
export const MSG_BULK_UPDATE_ITEMS = 'tj/bulkUpdateItems';
/**
 * B-030 — bulk-reorder items. Accepts per-item `{id, sortOrder, groupId?}`
 * updates (unlike MSG_BULK_UPDATE_ITEMS which is uniform-patch). Applied in a
 * single writeTransaction; the handler then normalises affected bucket
 * sortOrders to consecutive integers. Partial-success semantics — unknown ids
 * surface in `notFound`.
 *
 * B-025 — same message type carries multi-item drag payloads (N per-item
 * updates computed by `computeMultiItemReorder`). Handler is unchanged: each
 * update is applied independently inside the same writeTransaction and every
 * touched bucket is normalised. `MAX_BULK_INPUTS = 500` caps total payload.
 *
 * @typedef {Object} BulkReorderItemsRequest
 * @property {Array<BulkReorderUpdate>} updates
 *   Per-item reorder spec. 1 <= updates.length <= MAX_BULK_INPUTS.
 *   Supports both single-item (B-030) and multi-item (B-025) drops.
 *
 * @typedef {Object} BulkReorderUpdate
 * @property {string}       id
 * @property {number}       sortOrder
 * @property {string|null} [groupId]   Present only for cross-group moves.
 *
 * @typedef {Object} BulkReorderItemsResponse
 * @property {string[]} updated
 * @property {string[]} notFound
 */
export const MSG_BULK_REORDER_ITEMS = 'tj/bulkReorderItems';

/**
 * B-031 — bulk-reorder groups. Accepts per-group updates in a single
 * writeTransaction; handler normalises sortOrder within each affected
 * depth bucket (top-level siblings, or children of a parentId) to
 * consecutive integers. Partial-success semantics.
 *
 * Parallels MSG_BULK_REORDER_ITEMS. `parentId` is present only on updates
 * that change parentage (NEST drop); omitting it preserves the current value.
 *
 * @typedef {Object} GroupReorderUpdate
 * @property {string} id
 * @property {number} sortOrder
 * @property {string|null} [parentId]   present only when changing parentage
 *
 * Request: { updates: GroupReorderUpdate[] }
 * Response: { updated: string[], notFound: string[] }
 */
export const MSG_BULK_REORDER_GROUPS = 'tj/bulkReorderGroups';

// ---- Data export (B-042 / B-043) ----
/**
 * Export the entire saved collection to a user-chosen file format.
 * Read-only: the handler performs no storage mutations and is therefore
 * allowed in safe mode (schema-downgrade). Wave 3 (B-042) implements the
 * HTML branch; Wave 4 (B-043) fills in the JSON branch.
 */
export const MSG_EXPORT_COLLECTION = 'tj/exportCollection';

/**
 * @typedef {Object} ExportCollectionRequest
 * @property {'html' | 'json'} format
 *   'html' emits Netscape Bookmark File Format 1 (B-042).
 *   'json' emits Tab Junkie schema-v1 backup (B-043 — Wave 4).
 */

/**
 * @typedef {Object} ExportCollectionResponse
 * @property {string} filename     e.g. 'tab-junkie-bookmarks-2026-04-18.html'
 * @property {string} mimeType     'text/html' or 'application/json'
 * @property {string} content      Serialized file body (UTF-8 string).
 * @property {number} size         UTF-8 byte length of `content` (what lands on disk). Differs from `content.length` for non-ASCII characters; informational — no caller acts on it today.
 * @property {number} itemCount    Number of bookmarks included — drives toast copy.
 * @property {number} groupCount   Number of non-empty groups included — drives toast copy.
 */

// ---- Data import (B-044 / B-045) ----
/**
 * Import a user-supplied collection file, replacing all existing data atomically.
 * Write path: gated by the safe-mode guard (rejects with ERR_SAFE_MODE). On
 * successful commit, broadcasts scope `'items'` so open surfaces re-fetch
 * (B-050 pattern). Wave 3 (B-044) implements the HTML branch; Wave 4 (B-045)
 * fills in the JSON branch.
 *
 * Two-round protocol (see §33.4): the same message type carries both the
 * preview and the commit round-trips; the handler discriminates on
 * `payload.commit`. Preview (commit: false/absent) parses + returns counts
 * with zero mutation. Commit (commit: true) re-parses the same content and
 * applies the atomic writeTransaction.
 */
export const MSG_IMPORT_COLLECTION = 'tj/importCollection';

/**
 * @typedef {Object} ImportCollectionRequest
 * @property {'html' | 'json'} format
 *   'html' parses Netscape Bookmark File Format 1 (B-044).
 *   'json' parses Tab Junkie schema-v1 backup (B-045 — Wave 4).
 * @property {string} content
 *   Raw file text (UTF-8). The sidepanel reads the user-picked File via
 *   FileReader.readAsText before dispatching; Blob/File objects do NOT cross
 *   the message boundary (structured-clone overhead + test-harness friction).
 * @property {boolean} [commit]
 *   When absent/false the handler runs a preview pass (parse + count, no
 *   storage mutation). When `true`, the handler re-parses and commits via
 *   writeTransaction.
 * @property {Object} [options]
 * @property {boolean} [options.skipDuplicates=true]
 *   B-060 hook. Default true (skip duplicate URLs inside the file). B-060 flips
 *   the default via UI; B-044/B-045 always pass true at v1.
 */

/**
 * @typedef {Object} ImportCollectionResponse
 * @property {boolean} previewOnly     True when the response is a preview (no
 *                                     mutation). Absent/false on commit responses.
 * @property {number} itemsImported    Count of items that will be / were written.
 * @property {number} groupsImported   Count of groups that will be / were written.
 * @property {number} duplicatesSkipped Count of duplicate-URL items dropped
 *                                     (in-file duplicates only).
 * @property {number} [skipped]        B-044 only — malformed-entry skip count (AC10).
 * @property {string} [filename]       Echo of the user-picked filename when provided.
 *
 * On success: { ok: true, data: ImportCollectionResponse }.
 * On failure: { ok: false, error: { code: 'ERR_*', message: string } }.
 */

// ---- Floating-tab drag operations (B-134) ----
/**
 * B-134 §63.7.1 — reorder floating-tab members within a single group.
 *
 * Payload validated by the SW handler (`background/messages/storage-handlers.js`):
 *  - groupId: string, non-empty.
 *  - orderedTabIds: number[]; finite, non-NaN. The handler asserts the set
 *    matches the live tabIds resolved by `buildFloatingMembers` for `groupId`
 *    (race guard against a tab that closed mid-drag).
 *
 * Atomicity: single `writeTransaction` over `PARTITION_FLOATING_GROUPS`. The
 * handler resolves each tabId → floatingTabId via the LiveTabIndex
 * (windowId, tabIndex) geometry — Strategy A per §63.14.1. After the
 * mutator returns, the affected bucket carries `sortOrder` = consecutive
 * integers `[0, 1, ..., N-1]` (renormalised on every write).
 *
 * Allow-list direction (C-7): the handler reads authoritative records from
 * storage and accepts the client-supplied order ONLY when the set membership
 * matches the live floating members. No deny-list.
 *
 * Scope: SCOPE.ITEMS. Broadcast fires liveState-scoped so all open surfaces
 * re-fetch.
 *
 * @typedef {Object} ReorderFloatingMembersRequest
 * @property {string}   groupId
 * @property {number[]} orderedTabIds   sortOrder = index in this array
 *
 * @typedef {Object} ReorderFloatingMembersResponse
 * @property {boolean}  reordered
 * @property {string}  [reason]   present when reordered=false ('ERR_VALIDATION'|'ERR_RACE')
 */
export const MSG_REORDER_FLOATING_MEMBERS = 'tj/reorderFloatingMembers';

/**
 * B-134 §63.7.2 — atomic detach+attach of a floating tab between groups
 * (or between a group and Open Tabs in either direction).
 *
 * Payload validated by the SW handler:
 *  - tabId: number, finite. The Chrome tabId of the dragged row.
 *  - sourceGroupId: string|null. null → ATTACH (op 3); string → DETACH
 *    (when targetGroupId is null) OR MOVE_FLOATING (when both are non-null).
 *  - targetGroupId: string|null. null → DETACH (op 4); string → ATTACH
 *    (op 3) OR MOVE_FLOATING (op 5).
 *  - insertIndex: number, finite, >= 0. Position in the target bucket
 *    (ignored when targetGroupId is null).
 *
 * Reject if both sourceGroupId === null AND targetGroupId === null.
 * Reject if sourceGroupId === targetGroupId (same-group → REORDER instead).
 *
 * Atomicity: single `writeTransaction` over `PARTITION_FLOATING_GROUPS`.
 *  - ATTACH (op 3): append a v3 record with sortOrder = insertIndex,
 *    renumber the target bucket. Calls `markInherited(tabId)` post-write.
 *  - DETACH (op 4): remove the source group's record, renumber the source
 *    bucket. Calls `pruneInherited(tabId)` post-write.
 *  - MOVE_FLOATING (op 5): remove from source + append to target, both
 *    bucket renumbers in the same writeTransaction. inheritedTabs unchanged.
 *
 * inheritedTabs side-effects fire ONLY after `writeTransaction` resolves
 * successfully — never before (§63.9.2).
 *
 * Scope: SCOPE.ITEMS. Broadcast is liveState-scoped.
 *
 * @typedef {Object} MoveFloatingTabRequest
 * @property {number}      tabId
 * @property {string|null} sourceGroupId
 * @property {string|null} targetGroupId
 * @property {number}      insertIndex
 *
 * @typedef {Object} MoveFloatingTabResponse
 * @property {boolean}  moved
 * @property {string}  [reason]   present when moved=false ('ERR_VALIDATION'|'ERR_RACE')
 */
export const MSG_MOVE_FLOATING_TAB = 'tj/moveFloatingTab';

// ---- Quick-search popup (B-022) ----
/**
 * B-022 — append an entry to the popup's persistent recency store
 * (`tj:recency` partition). Fired by `popup/popup.js` immediately AFTER a
 * successful navigation (`chrome.tabs.create` or `chrome.tabs.update`).
 * Handler semantics (`background/messages/storage-handlers.js`):
 *   1. Validate `payload.id` — non-empty string with a known prefix
 *      (`item:<ulid>` for saved items, `url:<url>` for open-tab-only).
 *   2. Read the current partition via the standard write path.
 *   3. Unshift the new entry, drop any prior entry with the same id
 *      (dedupe — most-recent wins), trim to RECENCY_CAP (50).
 *   4. Write via `writeTransaction` (atomic, serialised).
 *   5. Return `{ ok: true }`.
 * No broadcast — the popup is the only reader (see §39.4.4).
 *
 * @typedef {Object} RecencyAddRequest
 * @property {string} id   `item:<ulid>` | `url:<url>` — validated at the handler.
 *
 * @typedef {Object} RecencyAddResponse
 * @property {true} ok
 */
export const MSG_RECENCY_ADD = 'tj/recencyAdd';

// ---- Popup → SW window routing (B-038) ----
/**
 * B-038 — Popup-router → SW fire-and-forget to open or focus the standalone
 * Tab Junkie window. Fired by `popup/popup.js` at `DOMContentLoaded` when
 * `displayMode === 'window'`, immediately followed by `window.close()` (no
 * `await` between — C-11 discipline). SW handler calls the existing
 * `openOrFocusStandaloneWindow()` helper.
 *
 * No payload. No response. Intentionally NOT in the `tj/*` namespace so the
 * storage-handlers dispatcher (which claims all `tj/*` types) skips it,
 * leaving the dedicated SW listener as the sole handler.
 */
export const MSG_OPEN_STANDALONE = 'MSG_OPEN_STANDALONE';

// ---- Chrome integration (S42 / B-041) ----

/**
 * Snapshot-push the current window's TJ view into Chrome:
 * reorder the tab strip in TJ order, create/update Chrome tab groups for each
 * TJ group with live tabs, leave ungrouped Open Tabs ungrouped.
 *
 * Request:  { windowId: number }
 * Response: { ok: boolean, summary?: SyncSummary, error?: { code, message } }
 *
 * SyncSummary shape — see background/sync/chrome-sync.js.
 */
export const MSG_SYNC_TO_CHROME = 'tj/syncToChrome';

// ---- State broadcast ----
export const MSG_STATE_CHANGED = 'tj/stateChanged';

/**
 * Broadcast scopes surfaced via `MSG_STATE_CHANGED` (see `background/broadcast.js`):
 *   - `'items'` / `'groups'` / `'preferences'` — storage mutations.
 *   - `'liveState'` — tab / window live-state transitions (LiveTabIndex + TabClaims).
 *   - `'windowMap'` — B-014. Fires on `chrome.windows.onCreated` and
 *     `chrome.windows.onRemoved` only. Payload carries `{ scope, trigger }`
 *     — the full map is NOT embedded; receivers re-fetch via MSG_LIST_ITEMS.
 */

/**
 * @typedef {Object} MessageRequest
 * @property {string} type       // one of the MSG_* constants
 * @property {Object} [payload]  // shape depends on `type`
 * @property {string} [requestId]
 */

/**
 * @typedef {Object} OpenTab
 * @property {number} tabId         Browser-assigned tab id (ephemeral, NOT stable across browser restart).
 * @property {number} windowId      Browser-assigned window id (ephemeral).
 * @property {string} title         Tab title — untrusted; must be rendered via textContent.
 * @property {string} url           Tab URL — untrusted.
 * @property {string|null} favIconUrl  Tab favicon URL, or null when the browser has not provided one.
 * @property {boolean} audible      Audio indicator for the tab.
 * @property {boolean} active       True when this is the focused tab in its window.
 * @property {number} tabIndex      Position in the window's tab strip (used for sort — B-055 AC9).
 */

/**
 * @typedef {Object} FloatingMember
 * @property {number} tabId         Browser-assigned tab id (ephemeral).
 * @property {number} windowId      Browser-assigned window id (ephemeral).
 * @property {number} tabIndex      Position in the window's tab strip.
 * @property {string} url           Tab URL — untrusted; render via textContent.
 * @property {string} parentItemId  The saved item the floating tab inherits from.
 * @property {string} title         Tab title — untrusted; render via textContent.
 * @property {string|null} favIconUrl  Tab favicon URL or null.
 * @property {boolean} audible      Audio indicator for the tab.
 * @property {boolean} active       True when this is the focused tab in its window.
 */

/**
 * @typedef {Object} ListItemsResponse
 * @property {Array<Object>} items        The stored items (optionally filtered by groupId)
 * @property {Record<string, {live: boolean, active: boolean, audible: boolean, favIconUrl: string|null, tabId?: number, windowId?: number}>} liveStates
 *   Per-item live state derived from LiveTabIndex + TabClaims. Items with no
 *   claim have `{ live: false, active: false, audible: false }`. No live-state
 *   field is stored on the Item object in `tj:items` — this is computed at
 *   read time (B-001c AC9).
 *   `tabId` and `windowId` are present iff `live === true`. `windowId` is
 *   ephemeral (not stable across browser restart) and used by the sidepanel
 *   window badge (B-014 AC7). Saved-item rows with no live claim omit
 *   `windowId`; badge suppression is the default.
 * @property {Record<string, Object>} driftRecords  Per-item drift record keyed by itemId.
 * @property {OpenTab[]} openTabs
 *   Live browser tabs NOT claimed by any saved item and NOT rendered as a
 *   resolved floating-group member (B-055). Empty array `[]` when none qualify —
 *   never null/undefined. Recomputed on every MSG_LIST_ITEMS call. `tabId` and
 *   `windowId` are ephemeral and must not be persisted.
 * @property {Record<string, number>} windowMap
 *   Session-scoped human-readable window ordinals (B-014). Key = stringified
 *   rawWindowId; value = ordinal (1, 2, 3, …). Gaps are preserved on window
 *   close (if W2 closes, remaining windows stay W1 and W3). Empty object `{}`
 *   when no windows are open (rare — only observable during the brief window
 *   of SW suspend/resume). Never null/undefined. Callers MUST treat
 *   rawWindowIds as ephemeral (not stable across browser restart) and never
 *   persist either key or value. Ordinals are UI-only.
 * @property {Record<string, FloatingMember[]>} [floatingMembers]
 *   B-121 — per-group runtime list of opener-chain-spawned tabs that have a
 *   tj:floatingGroups record but are not yet claimed by any saved item.
 *   Key = parent bookmark's groupId. Empty/missing key = no floating members
 *   for that group. The whole field is OPTIONAL on the response: pre-S38
 *   callers see `undefined`; post-S38 callers see a (possibly empty) Record.
 *   Renderers MUST treat `undefined` identically to `{}` (no floating members).
 */

/**
 * MSG_NAVIGATE_TO_ITEM request payload is one of:
 *   (a) { itemId: string }                     — navigate to a saved item (may open a new tab).
 *   (b) { tabId: number, windowId: number }    — focus an existing live tab (B-055).
 * The tabId-only variant does NOT perform any storage mutation and therefore
 * is intentionally excluded from the broadcast path — see
 * `background/messages/storage-handlers.js` for the suppression logic.
 *
 * @typedef {({itemId: string} | {tabId: number, windowId: number})} NavigateToItemPayload
 */

/**
 * Response shape for MSG_CREATE_GROUP and MSG_UPDATE_GROUP.
 * The group is always created/updated regardless of the warning.
 * `warning` is present only when a sibling group at the same parentId level
 * already has the same name (case-sensitive comparison).
 *
 * @typedef {Object} CreateGroupResponse
 * @property {import('../background/storage/partitions.js').Group} group  The created/updated group
 * @property {'DUPLICATE_NAME'} [warning]  Present when a name collision exists at the same parentId level
 */

/**
 * @typedef {Object} MessageSuccess
 * @property {true} ok
 * @property {*} data
 */

/**
 * @typedef {Object} MessageError
 * @property {false} ok
 * @property {{code: string, message: string}} error
 */

/** @typedef {MessageSuccess | MessageError} MessageResponse */
