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

// ---- Group operations ----
export const MSG_CREATE_GROUP = 'tj/createGroup';
export const MSG_UPDATE_GROUP = 'tj/updateGroup';
export const MSG_DELETE_GROUP = 'tj/deleteGroup';
export const MSG_LIST_GROUPS = 'tj/listGroups';
export const MSG_GET_GROUP = 'tj/getGroup';

// ---- Preferences ----
export const MSG_GET_PREFERENCES = 'tj/getPreferences';
export const MSG_SET_PREFERENCES = 'tj/setPreferences';

/**
 * @typedef {Object} MessageRequest
 * @property {string} type       // one of the MSG_* constants
 * @property {Object} [payload]  // shape depends on `type`
 * @property {string} [requestId]
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
