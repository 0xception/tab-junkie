/**
 * `chrome.runtime.onMessage` dispatcher for storage operations.
 *
 * Responsibilities:
 *  - Validate sender (AC5 runtime defense-in-depth): only messages from this
 *    extension's own origin are processed. Foreign senders are rejected with
 *    ERR_DIRECT_WRITE.
 *  - MSG_GET_STATUS is handled BEFORE the readyPromise gate so callers can
 *    query system status even while migrations run or fail (B-001b).
 *  - Wait for the service worker's `readyPromise` before processing any op;
 *    reject with ERR_NOT_READY if the gate fails.
 *  - In safe mode (schema downgrade), block write operations with ERR_SAFE_MODE
 *    while allowing reads to continue (B-001b AC5).
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
  MSG_GET_STATUS,
  MSG_PROMOTE_TAB,
  MSG_DEMOTE_ITEM,
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
  ERR_NOT_FOUND,
  ERR_NOT_READY,
  ERR_TX_CONFLICT,
  ERR_VALIDATION,
  ERR_SAFE_MODE,
  ERR_DUPLICATE_URL,
} from '../storage/index.js';

import { getSystemStatus, isSafeMode } from '../storage/migration.js';
import { buildLiveStates, getDriftRecords } from '../tabs/index.js';
import { getClaimsMirror, getItemIdForTab, claimTabForItem, releaseClaimByTab } from '../tabs/tab-claims.js';
import { clearDrift } from '../tabs/drift.js';
import { saveFloatingGroups } from '../tabs/floating-groups.js';
import { getLiveTabIndex } from '../tabs/live-tab-index.js';
import { safeNormalizeForMatch } from '../../shared/url.js';

/**
 * Build a typed error envelope regardless of whether the thrown value is a
 * StorageError or an unexpected exception.
 */
function errorEnvelope(err) {
  if (err instanceof StorageError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  // M3: Do not forward raw error messages to the UI — they may contain
  // unsanitized internal details. Use a fixed string; keep the original
  // message in `cause` for debugging.
  return { ok: false, error: { code: ERR_TX_CONFLICT, message: 'Internal error', cause: err?.message ?? String(err) } };
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
    case MSG_LIST_ITEMS: {
      const items = await listItems('groupId' in p ? { groupId: p.groupId } : undefined);
      const liveStates = buildLiveStates(items);
      const driftRecords = await getDriftRecords();
      return { items, liveStates, driftRecords };
    }
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
    case MSG_PROMOTE_TAB: {
      // AC1: validate tabId
      if (typeof p.tabId !== 'number') {
        throw new StorageError(ERR_VALIDATION, 'promoteTab: tabId must be a number');
      }
      const groupId = p.groupId !== undefined ? p.groupId : null;
      if (groupId !== null && typeof groupId !== 'string') {
        throw new StorageError(ERR_VALIDATION, 'promoteTab: groupId must be string or null');
      }

      // AC2: fetch the tab — chrome.tabs.get rejects if the tab doesn't exist
      let tab;
      try {
        tab = await chrome.tabs.get(p.tabId);
      } catch {
        throw new StorageError(ERR_NOT_FOUND, 'tab not found');
      }
      if (!tab) {
        throw new StorageError(ERR_NOT_FOUND, 'tab not found');
      }

      // AC3: reject restricted URL schemes
      const url = tab.url || '';
      if (
        url.startsWith('chrome://') ||
        url.startsWith('about:') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('file:')
      ) {
        throw new StorageError(ERR_VALIDATION, 'promoteTab: restricted URL scheme cannot be saved');
      }

      // AC4: duplicate detection — check ALL stored items for a matching URL,
      // regardless of whether the tab is currently claimed.
      const normalizedTabUrl = safeNormalizeForMatch(url);
      const allItems = await listItems();
      const duplicate = allItems.find(
        (it) => safeNormalizeForMatch(it.url) === normalizedTabUrl,
      );
      if (duplicate) {
        throw new StorageError(ERR_DUPLICATE_URL, 'promoteTab: an item with this URL already exists');
      }

      // AC5-6: create item (URL normalization happens inside createItem)
      const newItem = await createItem({
        title: tab.title || url,
        url,
        groupId,
      });

      // AC6: immediately claim the tab
      await claimTabForItem(newItem.id, p.tabId);

      return newItem;
    }
    case MSG_DEMOTE_ITEM: {
      // AC1: validate payload
      if (typeof p.itemId !== 'string' || p.itemId.length === 0) {
        throw new StorageError(ERR_VALIDATION, 'demoteItem: itemId must be a non-empty string');
      }

      // AC6: read item first; if null, return silent success (idempotent)
      const item = await getItem(p.itemId);
      if (item === null) {
        return null;
      }

      // Snapshot the tab claim before deletion (needed for AC7 ordering)
      const mirror = getClaimsMirror();
      const tabId = mirror[p.itemId] !== undefined ? mirror[p.itemId] : null;

      // AC9: deleteItem first — if this throws nothing else runs.
      // Partial atomicity: deleteItem is transactional; clearDrift,
      // saveFloatingGroups, and releaseClaimByTab are best-effort sequential.
      // A crash between steps leaves a dangling claim that reconcileClaims
      // cleans up on next cold start.
      await deleteItem(p.itemId);

      // clearDrift is a no-op if no record exists
      await clearDrift(p.itemId);

      // AC7: saveFloatingGroups before releaseClaimByTab
      if (item.groupId !== null && tabId !== null) {
        const index = getLiveTabIndex();
        const tabEntry = index.get(tabId);
        if (tabEntry) {
          await saveFloatingGroups([{
            groupId: item.groupId,
            windowId: tabEntry.windowId,
            tabIndex: tabEntry.index,
            url: tabEntry.url,
            savedAt: Date.now(),
          }]);
        }
      }

      // AC7: releaseClaimByTab AFTER saveFloatingGroups
      if (tabId !== null) {
        await releaseClaimByTab(tabId);
      }

      return null;
    }
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
      // MSG_GET_STATUS bypasses the readyPromise gate so callers can query
      // system status even while migrations are running or have failed.
      if (message.type === MSG_GET_STATUS) {
        try {
          sendResponse({ ok: true, data: getSystemStatus() });
        } catch (err) {
          sendResponse(errorEnvelope(err));
        }
        return;
      }

      try {
        await readyPromise;
      } catch (e) {
        sendResponse({ ok: false, error: { code: ERR_NOT_READY, message: 'Service worker not ready' } });
        return;
      }

      // Safe-mode write gate: when the stored schema version is newer than
      // KNOWN_VERSION, block all write operations to prevent data corruption.
      // Read operations (list, get, getPreferences) are still allowed.
      if (isSafeMode()) {
        const writeTypes = new Set([
          MSG_CREATE_ITEM, MSG_UPDATE_ITEM, MSG_DELETE_ITEM,
          MSG_CREATE_GROUP, MSG_UPDATE_GROUP, MSG_DELETE_GROUP,
          MSG_SET_PREFERENCES, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM,
        ]);
        if (writeTypes.has(message.type)) {
          sendResponse({
            ok: false,
            error: {
              code: ERR_SAFE_MODE,
              message: 'Extension is in read-only safe mode — update to the latest version to restore write access',
            },
          });
          return;
        }
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
