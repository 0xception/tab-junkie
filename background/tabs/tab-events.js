/**
 * Tab and window event handlers.
 *
 * These handlers keep `LiveTabIndex` current and maintain `TabClaims` when
 * tabs are updated, activated, removed, or when windows are closed.
 *
 * CRITICAL (AC4): LiveTabIndex mutations are in-memory only. TabClaims
 * mutations go through `chrome.storage.session` only. The sole exception is
 * drift detection (B-001d): `detectDriftForTab` writes to `tj:drift` via
 * `writeTransaction` — this is a durable state change, not ephemeral
 * live-state, and is explicitly allowed per R2 design.
 */

import {
  updateTabEntry,
  removeTabEntry,
  removeTabsByWindow,
  getLiveTabIndex,
} from './live-tab-index.js';
import { releaseClaimByTab, reevaluateTab, isClaimsReady } from './tab-claims.js';
import { detectDriftForTab, clearDrift } from './drift.js';
import { listItems } from '../storage/items.js';
import { broadcast, SCOPE } from '../broadcast.js';

/** @type {Map<number, ReturnType<typeof setTimeout>>} per-tab debounce timers (H2) */
const reevalTimers = new Map();

/**
 * Register all tab and window event listeners. Must be called at module
 * scope (synchronous) in the service worker before the first `await`, per
 * MV3 event registration requirements.
 *
 * @param {Promise<void>} readyPromise — awaited internally before reading
 *   items for re-evaluation. Event handlers that only touch LiveTabIndex
 *   fire immediately; those needing the items list await this first.
 */
export function registerTabEventListeners(readyPromise) {
  /**
   * tabs.onUpdated: URL or audible changes.
   * - Always update LiveTabIndex immediately (in-memory, no await needed).
   * - If URL changed and ready, reevaluate claims.
   */
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const patch = {};
    if ('url' in changeInfo) patch.url = changeInfo.url;
    if ('audible' in changeInfo) patch.audible = changeInfo.audible;
    if ('favIconUrl' in changeInfo) patch.favIconUrl = changeInfo.favIconUrl || '';

    // Also capture windowId, active, and index from the full tab object
    if (tab) {
      patch.windowId = tab.windowId;
      if ('active' in tab) patch.active = tab.active;
      if (typeof tab.index === 'number') patch.index = tab.index;
    }

    if (Object.keys(patch).length > 0) {
      updateTabEntry(tabId, patch);
    }

    // B-004: broadcast when favIconUrl changes WITHOUT a simultaneous URL change.
    // When a URL change is present, the debounced reevaluateTab path already
    // broadcasts tab/updated — firing tab/favicon-changed here too would cause
    // a double patch cycle for every navigation (H-1 fix).
    if ('favIconUrl' in changeInfo && !('url' in changeInfo)) {
      broadcast(SCOPE.LIVE_STATE, 'tab/favicon-changed', { requireClaimsReady: true });
    }

    // B-012: broadcast when audible changes WITHOUT a simultaneous URL change.
    // Same pattern as favIconUrl above — the URL-change path already broadcasts.
    if ('audible' in changeInfo && !('url' in changeInfo)) {
      broadcast(SCOPE.LIVE_STATE, 'tab/audible-changed', { requireClaimsReady: true });
    }

    // H1: Only re-evaluate when URL is a non-empty string
    if ('url' in changeInfo && typeof changeInfo.url === 'string' && changeInfo.url !== '') {
      // H2: Per-tab debounce — collapse rapid URL changes into one evaluation
      if (reevalTimers.has(tabId)) {
        clearTimeout(reevalTimers.get(tabId));
      }
      reevalTimers.set(tabId, setTimeout(async () => {
        reevalTimers.delete(tabId);
        try {
          await readyPromise;
          const items = await listItems();
          await reevaluateTab(tabId, changeInfo.url, items);
          await detectDriftForTab(tabId, changeInfo.url, items);
          broadcast(SCOPE.LIVE_STATE, 'tab/updated', { requireClaimsReady: true });
        } catch (err) {
          console.warn('[tab-junkie] reevaluateTab/detectDrift failed after URL change', err);
        }
      }, 100));
    }
  });

  /**
   * tabs.onActivated: update active flags in LiveTabIndex.
   * Deactivate the previously active tab in the same window, activate the
   * new one.
   */
  chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
    const index = getLiveTabIndex();
    // Deactivate previous active tab in this window
    for (const [id, entry] of index) {
      if (entry.windowId === windowId && entry.active && id !== tabId) {
        updateTabEntry(id, { active: false });
      }
    }
    // Activate the new tab
    updateTabEntry(tabId, { active: true, windowId });
    broadcast(SCOPE.LIVE_STATE, 'tab/activated', { requireClaimsReady: true });
  });

  /**
   * tabs.onRemoved: remove from LiveTabIndex, release claim.
   */
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (reevalTimers.has(tabId)) {
      clearTimeout(reevalTimers.get(tabId));
      reevalTimers.delete(tabId);
    }
    removeTabEntry(tabId);
    releaseClaimByTab(tabId).then(async (releasedItemId) => {
      if (releasedItemId) await clearDrift(releasedItemId);
      broadcast(SCOPE.LIVE_STATE, 'tab/removed', { requireClaimsReady: true });
    }).catch((err) => {
      console.warn('[tab-junkie] releaseClaimByTab failed on tab removal', err);
    });
  });

  /**
   * windows.onFocusChanged: transfer active-tab highlight between windows.
   * When user switches focus to a different window, tabs.onActivated does NOT
   * fire for the already-active tab in the newly focused window. This listener
   * fills that gap (AC6).
   */
  chrome.windows.onFocusChanged.addListener(async (windowId) => {
    const index = getLiveTabIndex();

    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // All windows lost focus (user alt-tabbed away) — deactivate all tabs
      for (const [id, entry] of index.entries()) {
        if (entry.active) updateTabEntry(id, { active: false });
      }
      broadcast(SCOPE.LIVE_STATE, 'window/blurred', { requireClaimsReady: true });
      return;
    }

    // Deactivate all tabs NOT in the newly focused window
    for (const [id, entry] of index.entries()) {
      if (entry.windowId !== windowId && entry.active) {
        updateTabEntry(id, { active: false });
      }
    }

    // Query for the active tab in the focused window and activate it
    try {
      const [activeTab] = await chrome.tabs.query({ windowId, active: true });
      if (activeTab) {
        updateTabEntry(activeTab.id, { active: true, windowId });
      }
      broadcast(SCOPE.LIVE_STATE, 'window/focused', { requireClaimsReady: true });
    } catch (err) {
      console.warn('[tab-junkie] tabs.query failed in onFocusChanged', err);
      broadcast(SCOPE.LIVE_STATE, 'window/focused', { requireClaimsReady: true });
    }
  });

  /**
   * windows.onRemoved: bulk remove all tabs for the window, release claims.
   * M4: Early return if claims haven't been reconciled yet — reconcileClaims
   * will handle everything when it runs.
   */
  chrome.windows.onRemoved.addListener((windowId) => {
    const removedTabIds = removeTabsByWindow(windowId);
    for (const tabId of removedTabIds) {
      if (reevalTimers.has(tabId)) {
        clearTimeout(reevalTimers.get(tabId));
        reevalTimers.delete(tabId);
      }
    }
    if (removedTabIds.length === 0) return;
    if (!isClaimsReady()) return;
    Promise.allSettled(removedTabIds.map(async (tabId) => {
      const releasedItemId = await releaseClaimByTab(tabId);
      if (releasedItemId) await clearDrift(releasedItemId);
    })).then(() => {
      broadcast(SCOPE.LIVE_STATE, 'tab/removed', { requireClaimsReady: true });
    }).catch((err) => {
      console.warn('[tab-junkie] batch releaseClaimByTab failed on window removal', err);
    });
  });
}
