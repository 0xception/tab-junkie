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
  MSG_NAVIGATE_TO_ITEM,
  MSG_CLOSE_TABS,
  MSG_BULK_CREATE_ITEMS,
  MSG_BULK_DELETE_ITEMS,
  MSG_BULK_UPDATE_ITEMS,
  MSG_BULK_REORDER_ITEMS,
  MSG_BULK_REORDER_GROUPS,
  MSG_EXPORT_COLLECTION,
  MSG_IMPORT_COLLECTION,
  MSG_RECENCY_ADD,
  MSG_REORDER_FLOATING_MEMBERS,
  MSG_MOVE_FLOATING_TAB,
  MSG_SYNC_TO_CHROME,
} from '../../shared/messages.js';

import { syncToChrome } from '../sync/chrome-sync.js';

import {
  EXPORT_FORMATS,
  EXPORT_MIME_TYPES,
  EXPORT_FILENAME_PREFIXES,
  EXPORT_FILENAME_EXTENSIONS,
} from '../../shared/export-schema.js';
import { buildFilenameWithDate } from '../export/shared.js';
import { buildHtmlExport, countNonEmptyGroupsForHtml } from '../export/html-export.js';
import { buildJsonExport } from '../export/json-export.js';
import { importCollection } from '../import/index.js';
import { partitionKey, PARTITION_PREFS, PARTITION_RECENCY, RECENCY_CAP } from '../storage/partitions.js';
import { writeTransaction } from '../storage/write-transaction.js';

import {
  createItem,
  updateItem,
  deleteItem,
  listItems,
  getItem,
  bulkCreateItems,
  bulkDeleteItems,
  bulkUpdateItems,
  bulkReorderItems,
  createGroup,
  updateGroup,
  deleteGroup,
  listGroups,
  getGroup,
  bulkReorderGroups,
  getPreferences,
  setPreferences,
  StorageError,
  ERR_DIRECT_WRITE,
  ERR_NOT_FOUND,
  ERR_NOT_READY,
  ERR_TX_CONFLICT,
  ERR_VALIDATION,
  ERR_SAFE_MODE,
} from '../storage/index.js';

import { getSystemStatus, isSafeMode, KNOWN_VERSION } from '../storage/migration.js';
import { buildLiveStates, getDriftRecords } from '../tabs/index.js';
import {
  getClaimsMirror,
  getItemIdForTab,
  claimTabForItem,
  releaseClaimByTab,
  /* B-134 §63.9 — inheritedTabs side-effects fire from MSG_MOVE_FLOATING_TAB
     post-write block (ATTACH → markInherited; DETACH → pruneInherited). */
  markInherited,
  pruneInherited,
} from '../tabs/tab-claims.js';
import { clearDrift } from '../tabs/drift.js';
import {
  saveFloatingGroups,
  pruneFloatingGroupsByParentItemId,
  reorderFloatingMembers,
  moveFloatingTab,
} from '../tabs/floating-groups.js';
import { buildFloatingMembers, collectFloatingTabIds } from '../tabs/floating-members.js';
import { getLiveTabIndex } from '../tabs/live-tab-index.js';
import { buildOpenTabs } from '../tabs/open-tabs.js';
/* B-014 */
import { getWindowMap } from '../tabs/window-ordinals.js';
import { broadcast, SCOPE } from '../broadcast.js';

/** Lookup table: message type → broadcast scope for write operations. */
const MUTATION_BROADCASTS = {
  [MSG_CREATE_ITEM]: SCOPE.ITEMS,
  [MSG_UPDATE_ITEM]: SCOPE.ITEMS,
  [MSG_DELETE_ITEM]: SCOPE.ITEMS,
  [MSG_CREATE_GROUP]: SCOPE.GROUPS,
  [MSG_UPDATE_GROUP]: SCOPE.GROUPS,
  [MSG_DELETE_GROUP]: SCOPE.GROUPS,
  [MSG_BULK_REORDER_GROUPS]: SCOPE.GROUPS,
  [MSG_SET_PREFERENCES]: SCOPE.PREFERENCES,
  [MSG_BULK_CREATE_ITEMS]: SCOPE.ITEMS,
  [MSG_BULK_DELETE_ITEMS]: SCOPE.ITEMS,
  [MSG_BULK_UPDATE_ITEMS]: SCOPE.ITEMS,
  [MSG_BULK_REORDER_ITEMS]: SCOPE.ITEMS,
  [MSG_PROMOTE_TAB]: SCOPE.ITEMS,
  [MSG_DEMOTE_ITEM]: SCOPE.ITEMS,
  [MSG_NAVIGATE_TO_ITEM]: SCOPE.ITEMS, // Included because navigate bumps lastAccessedAt via updateItem — a real storage mutation.
  [MSG_IMPORT_COLLECTION]: SCOPE.ITEMS, // B-044 / B-045 — replace-all import. One broadcast covers items + groups (+ prefs); the sidepanel re-fetches on scope: items.
  /* B-134 §63.7.4 — both new messages mutate `tj:floatingGroups` and require
     a liveState-equivalent re-fetch. SCOPE.ITEMS triggers `MSG_LIST_ITEMS`
     in the sidepanel which carries the refreshed `floatingMembers` map. */
  [MSG_REORDER_FLOATING_MEMBERS]: SCOPE.ITEMS,
  [MSG_MOVE_FLOATING_TAB]: SCOPE.ITEMS,
};

/**
 * B-055 H-1: safe-mode write classification.
 *
 * Pure storage writes are always classified as writes. MSG_CLOSE_TABS is a
 * pure tab operation (no storage mutation) and is NOT blocked by safe mode.
 * MSG_NAVIGATE_TO_ITEM has two variants: the itemId form bumps `lastAccessedAt`
 * (a real storage write, blocked in safe mode) while the tabId-only form is a
 * pure tab focus and must be allowed in safe mode.
 */
const WRITE_MESSAGE_TYPES = new Set([
  MSG_CREATE_ITEM, MSG_UPDATE_ITEM, MSG_DELETE_ITEM,
  MSG_BULK_CREATE_ITEMS, MSG_BULK_DELETE_ITEMS, MSG_BULK_UPDATE_ITEMS, MSG_BULK_REORDER_ITEMS,
  MSG_CREATE_GROUP, MSG_UPDATE_GROUP, MSG_DELETE_GROUP, MSG_BULK_REORDER_GROUPS,
  MSG_SET_PREFERENCES, MSG_PROMOTE_TAB, MSG_DEMOTE_ITEM,
  /* B-044 / B-045 — import is a destructive REPLACE. Safe-mode must block it
     with ERR_SAFE_MODE (B-044 AC12). The preview round-trip is also gated —
     preview-then-commit is two messages, and we reject both under safe mode
     to avoid surfacing import UI that can't complete. */
  MSG_IMPORT_COLLECTION,
  /* B-022 §39.3 D-3 — recency append is a persistent storage write.
     Safe-mode blocks it; the popup handles the ERR_SAFE_MODE response
     silently (recency is a best-effort UX feature, never user-visible
     failure). */
  MSG_RECENCY_ADD,
  /* B-134 §63.7.4 — both reorder + move are persistent writes to
     `tj:floatingGroups` and must be blocked in safe mode. */
  MSG_REORDER_FLOATING_MEMBERS,
  MSG_MOVE_FLOATING_TAB,
  /* B-041 (S42 §3.3) — syncToChrome persists `chromeTabGroupId` back to TJ
     group records via updateGroup. Safe-mode (stored schemaVersion >
     KNOWN_VERSION) blocks the call to prevent writing v5 fields under v4
     code on a downgraded extension. */
  MSG_SYNC_TO_CHROME,
]);

function isWriteType(message) {
  if (WRITE_MESSAGE_TYPES.has(message.type)) return true;
  if (message.type === MSG_NAVIGATE_TO_ITEM) {
    // Only the itemId variant writes (bumps lastAccessedAt). The tabId-only
    // variant is a pure tab focus and must pass through in safe mode.
    return message.payload?.itemId !== undefined;
  }
  return false;
}

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

/**
 * B-160 (S43, 2026-05-03) — append a popup recency entry.
 *
 * Validates the id format (`item:` or `url:` prefix, length cap), then
 * unshift/dedupe/trim in a single writeTransaction. No broadcast (popup
 * is the sole reader, per B-022 §39.4.4).
 *
 * Shared by MSG_RECENCY_ADD (popup-to-SW direct) and the MSG_NAVIGATE_TO_ITEM
 * dispatcher (any-surface navigation feeds recency automatically).
 *
 * @param {string} id  `item:<itemId>` or `url:<url>`
 * @throws {StorageError} ERR_VALIDATION on bad id; ERR_TX_CONFLICT on quota
 */
async function appendRecencyEntry(id) {
  if (typeof id !== 'string' || id.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'recencyAdd: id must be a non-empty string');
  }
  if (!(id.startsWith('item:') || id.startsWith('url:'))) {
    throw new StorageError(ERR_VALIDATION, 'recencyAdd: id must be prefixed item: or url:');
  }
  /* Defensive upper bound — protects the partition from oversized URL
     entries that would bloat storage past the quota guard. Item ids are
     bounded by ULID length; URL ids are bounded by the same MAX_URL that
     validates stored Item.url values. */
  if (id.length > 4200) {
    throw new StorageError(ERR_VALIDATION, 'recencyAdd: id exceeds maximum length');
  }
  const accessedAt = Date.now();
  await writeTransaction([{
    partition: PARTITION_RECENCY,
    mutator: (current) => {
      const existing = Array.isArray(current.entries) ? current.entries : [];
      /* Dedupe: drop any prior entry with the same id, then unshift the
         fresh one at the head (newest-first). */
      const filtered = existing.filter((e) => e && e.id !== id);
      const next = [{ id, accessedAt }, ...filtered];
      /* Cap — single splice on write per §39.3 D-3. */
      if (next.length > RECENCY_CAP) next.length = RECENCY_CAP;
      return { schemaVersion: 1, entries: next };
    },
  }]);
}

/** @returns {Promise<*>} the typed success `data` for this message type */
async function dispatch(type, payload) {
  const p = payload || {};
  switch (type) {
    case MSG_CREATE_ITEM:
      return createItem(p);
    case MSG_UPDATE_ITEM: {
      /* B-099 §46.3 D-2 — inline drift-clear strategy: read the pre-patch
         item BEFORE updateItem so we can detect a real URL change, run the
         storage write, then clear the drift record IFF the URL actually
         changed. Order is load-bearing — clearDrift must observe the post-
         update item state, and the conditional is gated on `patch.url`
         being defined AND the value actually changing (AC7 regression
         guard: title-only or sortOrder-only patches must NOT clear drift). */
      const preItem = await getItem(p.id);
      const result = await updateItem(p.id, p.patch);
      if (
        p.patch
        && Object.prototype.hasOwnProperty.call(p.patch, 'url')
        && preItem
        && p.patch.url !== preItem.url
      ) {
        await clearDrift(p.id);
      }
      return result;
    }
    case MSG_DELETE_ITEM:
      await deleteItem(p.id);
      /* B-121 §60.8 (ii): cascade-prune any floating-group record whose
         parent saved item is the one being deleted. Best-effort — if this
         fails the next MSG_LIST_ITEMS dispatch will skip the orphan record
         (parent missing) so the UI never stays wrong, just slightly stale
         in storage. */
      try {
        await pruneFloatingGroupsByParentItemId(p.id);
      } catch (err) {
        console.warn('[tab-junkie] pruneFloatingGroupsByParentItemId failed', err);
      }
      return null;
    case MSG_LIST_ITEMS: {
      const items = await listItems('groupId' in p ? { groupId: p.groupId } : undefined);
      const liveStates = buildLiveStates(items);
      const driftRecords = await getDriftRecords();
      /* B-121 §60.3 / §60.7: build the floating-member map BEFORE
         buildOpenTabs so the latter can exclude tabs already surfaced as
         synthetic rows under their parent's group. The whole field is
         always-present on post-S38 responses (possibly empty `{}`) so
         renderers can rely on `itemsResp.floatingMembers || {}`. */
      const floatingMembers = await buildFloatingMembers(items);
      const floatingTabIds = collectFloatingTabIds(floatingMembers);
      const openTabs = buildOpenTabs(floatingTabIds);
      /* B-014: every MSG_LIST_ITEMS response carries the current window
         ordinal map (rawWindowId string → ordinal). Empty object `{}` when no
         windows are open. Never null/undefined — defensive copy from
         window-ordinals.js. */
      const windowMap = getWindowMap();
      return { items, liveStates, driftRecords, openTabs, windowMap, floatingMembers };
    }
    case MSG_BULK_CREATE_ITEMS:
      return bulkCreateItems(p.inputs);
    case MSG_BULK_DELETE_ITEMS: {
      const result = await bulkDeleteItems(p.ids);
      /* B-121 R4 security M-1: cascade-prune any floating-group record
         whose parent saved item was bulk-deleted. Mirrors the per-item
         MSG_DELETE_ITEM cascade (line 207-211). Best-effort per id —
         failures fall back to the lazy buildFloatingMembers skip path. */
      if (Array.isArray(p.ids)) {
        for (const id of p.ids) {
          try {
            await pruneFloatingGroupsByParentItemId(id);
          } catch (err) {
            console.warn('[tab-junkie] pruneFloatingGroupsByParentItemId failed (bulk-delete cascade)', err);
          }
        }
      }
      return result;
    }
    case MSG_BULK_UPDATE_ITEMS:
      return bulkUpdateItems(p.ids, p.patch);
    case MSG_BULK_REORDER_ITEMS:
      return bulkReorderItems(p.updates);
    case MSG_GET_ITEM:
      return getItem(p.id);
    case MSG_CREATE_GROUP:
      return createGroup(p);
    case MSG_UPDATE_GROUP:
      return updateGroup(p.id, p.patch);
    case MSG_DELETE_GROUP: {
      /* B-121 R4 security M-2: cascade-prune floating-group records for
         every saved item that lived in the deleted group. We capture the
         affected itemIds BEFORE deleteGroup runs so the listItems read
         still sees the original membership. After deleteGroup succeeds we
         iterate the captured ids and prune their floating-group records
         best-effort (matching the MSG_DELETE_ITEM pattern). */
      let affectedItemIds = [];
      try {
        const groupItems = await listItems({ groupId: p.id });
        affectedItemIds = (Array.isArray(groupItems) ? groupItems : [])
          .map((it) => it && it.id)
          .filter((id) => typeof id === 'string' && id.length > 0);
      } catch (err) {
        console.warn('[tab-junkie] listItems failed during MSG_DELETE_GROUP cascade snapshot', err);
      }
      await deleteGroup(p.id);
      for (const id of affectedItemIds) {
        try {
          await pruneFloatingGroupsByParentItemId(id);
        } catch (err) {
          console.warn('[tab-junkie] pruneFloatingGroupsByParentItemId failed (delete-group cascade)', err);
        }
      }
      return null;
    }
    case MSG_LIST_GROUPS:
      return listGroups();
    case MSG_GET_GROUP:
      return getGroup(p.id);
    case MSG_BULK_REORDER_GROUPS:
      return bulkReorderGroups(p.updates);
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

      // AC3 (B-058): scheme validation is now owned entirely by normalizeUrl
      // inside createItem → validateNewItem. ALLOWED_URL_SCHEMES is the single
      // source of truth; the old prefix block-list is removed to eliminate
      // drift (it also incorrectly rejected file: which the allowlist allowed).
      // NOTE: javascript:/data: are still rejected inside normalizeUrl via
      // ALLOWED_URL_SCHEMES — no XSS/data-smuggling regression from this change.
      const url = tab.url || '';
      // B-059: duplicate-URL detection has moved to the UI layer as a pre-dispatch
      // soft-warn (sidepanel `_findDuplicateSavedItem`). The storage layer
      // unconditionally accepts a promote request for any valid URL — duplicate
      // saved items are now allowed by product design (PRD §3.3; SOLUTION_DESIGN §29).
      // ERR_DUPLICATE_URL is retained in shared/errors.js for deploy-window stability
      // but is no longer thrown from this handler.
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
          /* B-121 §60.4: floating-group records use `parentItemId`. The
             demoted item is the parent of any future opener-chain children
             spawned from this tab; the saveFloatingGroups path does NOT
             auto-stamp `floatingTabId` (that is appendFloatingGroup's job)
             so the record persists in legacy form, which the read-side
             validators tolerate. */
          await saveFloatingGroups([{
            groupId: item.groupId,
            parentItemId: p.itemId,
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
    case MSG_NAVIGATE_TO_ITEM: {
      // B-055: tabId-only variant (open-tab row click — no saved item involved).
      // Callers pass `{ tabId, windowId }`; this path is a pure tab focus with
      // no storage mutation, so it does NOT broadcast (see dispatcher below).
      if (p.itemId === undefined && typeof p.tabId === 'number') {
        if (typeof p.windowId !== 'number') {
          throw new StorageError(ERR_VALIDATION, 'navigateToItem: windowId required with tabId');
        }
        const liveIndex = getLiveTabIndex();
        const liveEntry = liveIndex.get(p.tabId);
        if (!liveEntry) {
          throw new StorageError(ERR_NOT_FOUND, 'navigateToItem: tab not in live index');
        }
        /* B-055 M-3: a late tab-close race can cause chrome.tabs.update /
           chrome.windows.update to reject with a raw Chrome error. Normalise
           to ERR_NOT_FOUND to mirror the itemId-path contract. */
        try {
          await chrome.tabs.update(p.tabId, { active: true });
          await chrome.windows.update(p.windowId, { focused: true });
        } catch {
          throw new StorageError(ERR_NOT_FOUND, 'Tab not found');
        }
        /* B-160 — feed popup recency from any-surface navigation. The url:
           id is derived from the live tab's URL (popup uses the same key
           per B-022 §39.2 D-3). Fire-and-forget; never break navigation. */
        if (liveEntry.url) {
          appendRecencyEntry('url:' + liveEntry.url).catch(() => { /* swallow */ });
        }
        return { tabId: p.tabId, opened: false };
      }

      // AC1: validate itemId
      if (typeof p.itemId !== 'string' || p.itemId.length === 0) {
        throw new StorageError(ERR_VALIDATION, 'navigateToItem: itemId must be a non-empty string');
      }

      // AC2: fetch item
      const item = await getItem(p.itemId);
      if (item === null) {
        throw new StorageError(ERR_NOT_FOUND, 'navigateToItem: item not found');
      }

      // AC4: reject items with no URL
      if (!item.url) {
        throw new StorageError(ERR_VALIDATION, 'Item has no URL');
      }

      const mirror = getClaimsMirror();
      const claimedTabId = mirror[p.itemId] !== undefined ? mirror[p.itemId] : null;
      const index = getLiveTabIndex();

      let resultTabId;
      let opened;

      if (claimedTabId !== null && index.has(claimedTabId)) {
        // AC2: live tab exists — activate it
        const entry = index.get(claimedTabId);
        await chrome.tabs.update(claimedTabId, { active: true });
        await chrome.windows.update(entry.windowId, { focused: true });
        resultTabId = claimedTabId;
        opened = false;
      } else {
        // AC3: stale claim — release it (B-110 §53: paired clearDrift to
        // honour the §10.7 invariant that drift records only exist for
        // claimed items; clearDrift is a no-op when no record exists)
        if (claimedTabId !== null) {
          await releaseClaimByTab(claimedTabId);
          await clearDrift(p.itemId);
        }
        // AC5: open a new tab
        const newTab = await chrome.tabs.create({ url: item.url });
        await claimTabForItem(p.itemId, newTab.id);
        resultTabId = newTab.id;
        opened = true;
      }

      // AC8: bump lastAccessedAt
      await updateItem(p.itemId, { lastAccessedAt: Date.now() });

      /* B-160 — feed popup recency from any-surface navigation. The
         item: prefix matches the popup's PREFIX_ITEM (popup.js §39.2 D-3).
         Fire-and-forget; never break navigation. */
      appendRecencyEntry('item:' + p.itemId).catch(() => { /* swallow */ });

      return { tabId: resultTabId, opened };
    }
    case MSG_CLOSE_TABS: {
      // AC6: validate tabIds
      if (!Array.isArray(p.tabIds) || p.tabIds.length === 0) {
        throw new StorageError(ERR_VALIDATION, 'closeTabs: tabIds must be a non-empty array');
      }
      for (const id of p.tabIds) {
        if (typeof id !== 'number') {
          throw new StorageError(ERR_VALIDATION, 'closeTabs: all tabIds must be numbers');
        }
      }

      // AC5: partition into valid (present in index) and notFound
      const closeIndex = getLiveTabIndex();
      const validTabIds = [];
      const notFoundIds = [];
      for (const id of p.tabIds) {
        if (closeIndex.has(id)) {
          validTabIds.push(id);
        } else {
          notFoundIds.push(id);
        }
      }

      // AC3: single chrome call for all valid tabs; catch per-tab failures
      if (validTabIds.length > 0) {
        try {
          await chrome.tabs.remove(validTabIds);
        } catch {
          // AC10: move all valid tabs to notFound on error
          for (const id of validTabIds) notFoundIds.push(id);
          validTabIds.length = 0;
        }
      }

      // AC7: do NOT call releaseClaimByTab — tabs.onRemoved handles cleanup
      // Intentionally absent from MUTATION_BROADCASTS — chrome.tabs.remove triggers tabs.onRemoved which handles claim cleanup and broadcasts LIVE_STATE.
      return { closed: validTabIds, notFound: notFoundIds };
    }
    case MSG_IMPORT_COLLECTION: {
      /* B-044 / B-045 — two-round preview → commit protocol (§33.4). The
         safe-mode gate ran above; we still validate payload shape here. */
      if (!p || typeof p !== 'object') {
        throw new StorageError(ERR_VALIDATION, 'importCollection: payload required');
      }
      if (p.format !== 'html' && p.format !== 'json') {
        throw new StorageError(ERR_VALIDATION, 'importCollection: format must be "html" or "json"');
      }
      if (typeof p.content !== 'string') {
        throw new StorageError(ERR_VALIDATION, 'importCollection: content must be a string');
      }
      if (p.content.length === 0) {
        throw new StorageError(ERR_VALIDATION, 'importCollection: content must be non-empty');
      }
      /* Defense-in-depth (R4 security-reviewer M-1): the sidepanel caps the
         file read at 5 MiB (§33.10); the SW caps the IPC payload at 10 MiB
         to tolerate UTF-8 expansion on edge-case inputs while still bounding
         memory + CPU at the trust boundary. */
      if (p.content.length > 10 * 1024 * 1024) {
        throw new StorageError(ERR_VALIDATION, 'Import content exceeds 10 MiB limit');
      }
      if (p.commit !== undefined && typeof p.commit !== 'boolean') {
        throw new StorageError(ERR_VALIDATION, 'importCollection: commit must be boolean');
      }
      if (p.options !== undefined) {
        if (typeof p.options !== 'object' || p.options === null) {
          throw new StorageError(ERR_VALIDATION, 'importCollection: options must be an object');
        }
        if (p.options.skipDuplicates !== undefined && typeof p.options.skipDuplicates !== 'boolean') {
          throw new StorageError(ERR_VALIDATION, 'importCollection: options.skipDuplicates must be boolean');
        }
      }
      return importCollection({
        format: p.format,
        content: p.content,
        commit: !!p.commit,
        options: p.options,
      });
    }
    case MSG_EXPORT_COLLECTION: {
      /* B-042 / B-043 — read-only export. Never mutates storage and therefore
         is intentionally absent from MUTATION_BROADCASTS and WRITE_MESSAGE_TYPES
         (safe-mode passes exports through unmodified). */
      if (!EXPORT_FORMATS.includes(p.format)) {
        throw new StorageError(ERR_VALIDATION, 'exportCollection: format must be "html" or "json"');
      }

      /* Single-snapshot read — items first, then groups. Concurrent mutations
         between the two reads are rare on a local-only extension (§32.13 F-3);
         orphaned groupId references are tolerated by both builders (HTML
         rescues to Ungrouped via Q-H1; JSON emits `groupId: null`). */
      const exportItems = await listItems();
      const exportGroups = await listGroups();

      if (p.format === 'json') {
        /* §32.5.4: `preferences` is present iff the user has persisted at
           least one preference. `getPreferences()` always returns defaults
           merged on top of whatever is stored, so we probe the underlying
           `tj:prefs` key directly — its *presence* is the source of truth
           for "has the user ever run setPreferences?". This keeps a clean
           first-run export from forcing the importing profile's preferences
           to match the exporting profile's first-run defaults (AC2). */
        const prefsKey = partitionKey(PARTITION_PREFS);
        const prefsRaw = await chrome.storage.local.get(prefsKey);
        const preferences = (prefsKey in prefsRaw) ? prefsRaw[prefsKey] : null;

        const jsonContent = buildJsonExport({
          items: exportItems,
          groups: exportGroups,
          preferences,
          /* AC3: schemaVersion is read dynamically from migration.js at export
             time — hardcoding is a FAIL. `KNOWN_VERSION` and the JSON export
             version share a single source of truth because the persisted
             item/group shapes *are* the exported shapes (§32.5.7). */
          schemaVersion: KNOWN_VERSION,
        });
        const jsonFilename = buildFilenameWithDate(
          EXPORT_FILENAME_PREFIXES.json,
          EXPORT_FILENAME_EXTENSIONS.json,
        );
        /* Q-10 (B-042 R4): size reports UTF-8 byte length, not content.length. */
        const jsonSize = new TextEncoder().encode(jsonContent).length;
        return {
          filename: jsonFilename,
          mimeType: EXPORT_MIME_TYPES.json,
          content: jsonContent,
          size: jsonSize,
          itemCount: exportItems.length,
          groupCount: exportGroups.length,
        };
      }

      const content = buildHtmlExport({ items: exportItems, groups: exportGroups });
      const filename = buildFilenameWithDate(
        EXPORT_FILENAME_PREFIXES.html,
        EXPORT_FILENAME_EXTENSIONS.html,
      );
      const groupCount = countNonEmptyGroupsForHtml({ items: exportItems, groups: exportGroups });

      /* Q-10: size reports UTF-8 byte length (what lands on disk), not
         content.length (UTF-16 code units). Accurate for ASCII-only corpora
         too, so no regression. Diverges from content.length only for content
         with non-BMP characters (emoji, etc). */
      const size = new TextEncoder().encode(content).length;

      return {
        filename,
        mimeType: EXPORT_MIME_TYPES.html,
        content,
        size,
        itemCount: exportItems.length,
        groupCount,
      };
    }
    case MSG_RECENCY_ADD: {
      /* B-022 §39.3 D-3 — append a popup recency entry.
       * B-160 (S43, 2026-05-03) — implementation moved to the shared
       * `appendRecencyEntry` helper below so the SW MSG_NAVIGATE_TO_ITEM
       * dispatcher can also feed recency from any-surface navigation
       * (sidepanel, newtab, popup) without each caller dispatching a
       * separate MSG_RECENCY_ADD message. */
      await appendRecencyEntry(p?.id);
      return { ok: true };
    }
    case MSG_REORDER_FLOATING_MEMBERS: {
      /* B-148 §3.5 / §3.8 D-3 (S44, v6→v7) — NEW payload shape per R0 spike C
         (Option A): {groupId, renderOrder: string[]} writes Group.renderOrder
         directly. Caller (sidepanel drag at Task 13) computes the full new
         interleaved order and sends it; SW handler validates per-element ref
         shape then delegates to updateGroup.

         LEGACY payload shape (B-134 §63.8.1): {groupId, orderedTabIds:
         number[]} delegates to reorderFloatingMembers for the floating-only
         sortOrder renumber. Retained for backwards compatibility until the
         sidepanel client switches over (Task 13).

         Allow-list direction (C-7): payload validated by positive
         field/type checks. */
      if (!p || typeof p.groupId !== 'string' || p.groupId.length === 0) {
        return { reordered: false, reason: 'ERR_VALIDATION' };
      }
      /* B-148 path — new {groupId, renderOrder} payload. */
      if (Array.isArray(p.renderOrder)) {
        for (const ref of p.renderOrder) {
          if (typeof ref !== 'string' || ref.length === 0) {
            return { reordered: false, reason: 'ERR_VALIDATION' };
          }
          if (!ref.startsWith('item:') && !ref.startsWith('floating:')) {
            return { reordered: false, reason: 'ERR_VALIDATION' };
          }
          if (ref.length > 64) {
            return { reordered: false, reason: 'ERR_VALIDATION' };
          }
        }
        try {
          await updateGroup(p.groupId, { renderOrder: p.renderOrder });
        } catch (e) {
          /* updateGroup throws on missing group / corrupt patch. The handler
             surfaces the failure as a generic reordered:false outcome. */
          return { reordered: false, reason: 'ERR_VALIDATION' };
        }
        return { reordered: true };
      }
      /* Legacy path — {groupId, orderedTabIds: number[]}. */
      if (!Array.isArray(p.orderedTabIds) || p.orderedTabIds.length === 0) {
        return { reordered: false, reason: 'ERR_VALIDATION' };
      }
      for (const id of p.orderedTabIds) {
        if (typeof id !== 'number' || !Number.isFinite(id)) {
          return { reordered: false, reason: 'ERR_VALIDATION' };
        }
      }
      const ok = await reorderFloatingMembers(p.groupId, p.orderedTabIds);
      if (!ok) return { reordered: false, reason: 'ERR_RACE' };
      return { reordered: true };
    }
    case MSG_MOVE_FLOATING_TAB: {
      /* B-134 §63.8.2 — atomic detach+attach. Validates payload shape, then
         delegates to `moveFloatingTab`. Post-write inheritedTabs side-effects
         (§63.9) fire ONLY when the writeTransaction resolved successfully —
         never before (matches B-013 §21.5 precedent). */
      if (!p || typeof p.tabId !== 'number' || !Number.isFinite(p.tabId)) {
        return { moved: false, reason: 'ERR_VALIDATION' };
      }
      if (p.sourceGroupId !== null
        && (typeof p.sourceGroupId !== 'string' || p.sourceGroupId.length === 0)) {
        return { moved: false, reason: 'ERR_VALIDATION' };
      }
      if (p.targetGroupId !== null
        && (typeof p.targetGroupId !== 'string' || p.targetGroupId.length === 0)) {
        return { moved: false, reason: 'ERR_VALIDATION' };
      }
      if (p.sourceGroupId === null && p.targetGroupId === null) {
        return { moved: false, reason: 'ERR_VALIDATION' };
      }
      if (p.sourceGroupId === p.targetGroupId) {
        return { moved: false, reason: 'ERR_VALIDATION' };
      }
      if (typeof p.insertIndex !== 'number'
        || !Number.isFinite(p.insertIndex)
        || p.insertIndex < 0) {
        return { moved: false, reason: 'ERR_VALIDATION' };
      }

      const ok = await moveFloatingTab(p.tabId, p.sourceGroupId, p.targetGroupId, p.insertIndex);
      if (!ok) return { moved: false, reason: 'ERR_RACE' };

      /* B-134 §63.9.1 inheritedTabs invariants. Op 5 (MOVE_FLOATING) is a
         no-op on inheritedTabs (the tab was already in the set). */
      if (p.sourceGroupId === null && p.targetGroupId !== null) {
        markInherited(p.tabId);   // ATTACH (op 3)
      } else if (p.targetGroupId === null && p.sourceGroupId !== null) {
        pruneInherited(p.tabId);  // DETACH (op 4)
      }

      return { moved: true };
    }
    case MSG_SYNC_TO_CHROME: {
      /* B-041 (S42 §3.4) — snapshot push to Chrome tab strip + tab groups.
         Validates payload.windowId is a finite number; passes through to the
         orchestrator which returns a SyncSummary describing the operation. */
      if (typeof p.windowId !== 'number' || !Number.isFinite(p.windowId)) {
        throw new StorageError(ERR_VALIDATION, 'MSG_SYNC_TO_CHROME: windowId must be a finite number');
      }
      const summary = await syncToChrome(p.windowId);
      return { summary };
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
      if (isSafeMode() && isWriteType(message)) {
        sendResponse({
          ok: false,
          error: {
            code: ERR_SAFE_MODE,
            message: 'Extension is in read-only safe mode — update to the latest version to restore write access',
          },
        });
        return;
      }

      try {
        const data = await dispatch(message.type, message.payload);
        // AC6: sendResponse completes synchronously before broadcast fires.
        sendResponse({ ok: true, data });
        const broadcastScope = MUTATION_BROADCASTS[message.type];
        if (broadcastScope !== undefined) {
          // B-055: the MSG_NAVIGATE_TO_ITEM tabId-only variant is a no-op on
          // storage (pure tab focus), so suppress its broadcast. Otherwise
          // every Open-Tabs-row click would trigger a full `items` invalidation
          // and re-render every open surface — defeating AC16's performance budget.
          const p = message.payload || {};
          const isNavigateTabIdOnly = message.type === MSG_NAVIGATE_TO_ITEM
            && p.itemId === undefined
            && typeof p.tabId === 'number';
          /* B-044 / B-045: preview round-trip makes no storage mutation. The
             handler returns `{ previewOnly: true, ... }`; suppress the
             broadcast so open surfaces do not re-fetch on the preview. The
             follow-up commit round-trip carries `commit: true` and broadcasts
             normally. */
          const isImportPreviewOnly = message.type === MSG_IMPORT_COLLECTION
            && p.commit !== true;
          if (!isNavigateTabIdOnly && !isImportPreviewOnly) {
            broadcast(broadcastScope, message.type);
          }
        }
      } catch (err) {
        sendResponse(errorEnvelope(err));
      }
    })();

    // Keep the channel open for the async sendResponse above.
    return true;
  });
}
