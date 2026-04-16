/**
 * `chrome.runtime.onMessage` dispatcher for storage operations.
 *
 * Responsibilities:
 *  - Validate sender (AC5 runtime defense-in-depth): only messages from this
 *    extension's own origin are processed. Foreign senders are rejected with
 *    ERR_DIRECT_WRITE.
 *  - Wait for the service worker's `readyPromise` before processing any op;
 *    reject with ERR_NOT_READY if the gate fails. In B-001a this is a stub
 *    that always resolves — B-001b swaps it for the migration-gated promise.
 *  - Route the request to the appropriate storage API.
 *  - Wrap the result in the typed envelope defined in `shared/messages.js`.
 *    StorageError instances are surfaced with their `{code, message}` shape;
 *    unknown errors are normalized to ERR_TX_CONFLICT on the wire so UI code
 *    always sees a typed envelope.
 *
 * Chrome's `onMessage` contract: return `true` synchronously to keep the
 * message channel open for an async `sendResponse`.
 */

import {
  MSG_CREATE_ITEM,
  MSG_UPDATE_ITEM,
  MSG_DELETE_ITEM,
  MSG_LIST_ITEMS,
  MSG_GET_ITEM,
  MSG_CREATE_GROUP,
  MSG_UPDATE_GROUP,
  MSG_DELETE_GROUP,
  MSG_LIST_GROUPS,
  MSG_GET_GROUP,
  MSG_GET_PREFERENCES,
  MSG_SET_PREFERENCES,
} from '../../shared/messages.js';

import {
  createItem,
  updateItem,
  deleteItem,
  listItems,
  getItem,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroups,
  getGroup,
  getPreferences,
  setPreferences,
  StorageError,
  ERR_DIRECT_WRITE,
  ERR_NOT_READY,
  ERR_TX_CONFLICT,
  ERR_VALIDATION,
} from '../storage/index.js';

/**
 * Build a typed error envelope regardless of whether the thrown value is a
 * StorageError or an unexpected exception.
 */
function errorEnvelope(err) {
  if (err instanceof StorageError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  const message = err && err.message ? err.message : String(err);
  return { ok: false, error: { code: ERR_TX_CONFLICT, message } };
}

/** @returns {Promise<*>} the typed success `data` for this message type */
async function dispatch(type, payload) {
  const p = payload || {};
  switch (type) {
    case MSG_CREATE_ITEM:
      return createItem(p);
    case MSG_UPDATE_ITEM:
      return updateItem(p.id, p.patch);
    case MSG_DELETE_ITEM:
      await deleteItem(p.id);
      return null;
    case MSG_LIST_ITEMS:
      return listItems('groupId' in p ? { groupId: p.groupId } : undefined);
    case MSG_GET_ITEM:
      return getItem(p.id);
    case MSG_CREATE_GROUP:
      return createGroup(p);
    case MSG_UPDATE_GROUP:
      return updateGroup(p.id, p.patch);
    case MSG_DELETE_GROUP:
      await deleteGroup(p.id);
      return null;
    case MSG_LIST_GROUPS:
      return listGroups();
    case MSG_GET_GROUP:
      return getGroup(p.id);
    case MSG_GET_PREFERENCES:
      return getPreferences();
    case MSG_SET_PREFERENCES:
      return setPreferences(p.patch);
    default:
      throw new StorageError(ERR_VALIDATION, `Unknown message type: ${String(type)}`);
  }
}

/**
 * Register the storage message dispatcher on the given readyPromise.
 * @param {Promise<void>} readyPromise
 */
export function registerStorageHandlers(readyPromise) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // AC5 runtime guard: only accept messages from THIS extension. Any other
    // id (including `undefined` for external web pages) is a hard reject.
    if (!sender || sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, error: { code: ERR_DIRECT_WRITE, message: 'Foreign sender rejected' } });
      return false;
    }

    if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
      sendResponse({ ok: false, error: { code: ERR_VALIDATION, message: 'Invalid message envelope' } });
      return false;
    }

    // Only handle the tj/* namespace — let other listeners see foreign types.
    if (!message.type.startsWith('tj/')) return false;

    (async () => {
      try {
        await readyPromise;
      } catch (e) {
        sendResponse({ ok: false, error: { code: ERR_NOT_READY, message: 'Service worker not ready' } });
        return;
      }
      try {
        const data = await dispatch(message.type, message.payload);
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse(errorEnvelope(err));
      }
    })();

    // Keep the channel open for the async sendResponse above.
    return true;
  });
}
