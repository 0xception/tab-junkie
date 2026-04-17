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

// ---- State broadcast ----
export const MSG_STATE_CHANGED = 'tj/stateChanged';

/**
 * @typedef {Object} MessageRequest
 * @property {string} type       // one of the MSG_* constants
 * @property {Object} [payload]  // shape depends on `type`
 * @property {string} [requestId]
 */

/**
 * @typedef {Object} ListItemsResponse
 * @property {Array<Object>} items        The stored items (optionally filtered by groupId)
 * @property {Record<string, {live: boolean, active: boolean, audible: boolean}>} liveStates
 *   Per-item live state derived from LiveTabIndex + TabClaims. Items with no
 *   claim have `{ live: false, active: false, audible: false }`. No live-state
 *   field is stored on the Item object in `tj:items` — this is computed at
 *   read time (B-001c AC9).
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
