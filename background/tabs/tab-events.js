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
import { detectDriftForTab } from './drift.js';
import { listItems } from '../storage/items.js';

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

    // Also capture windowId, active, and index from the full tab object
    if (tab) {
      patch.windowId = tab.windowId;
      if ('active' in tab) patch.active = tab.active;
      if (typeof tab.index === 'number') patch.index = tab.index;
    }

    if (Object.keys(patch).length > 0) {
      updateTabEntry(tabId, patch);
    }

    // H1: Only re-evaluate when URL is a non-empty string
    if ('url' in changeInfo && typeof changeInfo.url === 'string' && changeInfo.url !== '') {
      // H2: Per-tab debounce — collapse rapid URL changes into one evaluation
      if (reevalTimers.has(tabId)) {
        clearTimeout(reevalTimers.get(tabId));
      }
      reevalTimers.set(tabId, setTimeout(() => {
        reevalTimers.delete(tabId);
        readyPromise.then(() => {
          return listItems().then((items) => {
            return reevaluateTab(tabId, changeInfo.url, items).then(() => {
              return detectDriftForTab(tabId, changeInfo.url, items);
            });
          });
        }).catch((err) => {
          console.warn('[tab-junkie] reevaluateTab/detectDrift failed after URL change', err);
        });
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
        entry.active = false;
      }
    }
    // Activate the new tab
    updateTabEntry(tabId, { active: true, windowId });
  });

  /**
   * tabs.onRemoved: remove from LiveTabIndex, release claim.
   */
  chrome.tabs.onRemoved.addListener((tabId) => {
    removeTabEntry(tabId);
    releaseClaimByTab(tabId).catch((err) => {
      console.warn('[tab-junkie] releaseClaimByTab failed on tab removal', err);
    });
  });

  /**
   * windows.onRemoved: bulk remove all tabs for the window, release claims.
   * M4: Early return if claims haven't been reconciled yet — reconcileClaims
   * will handle everything when it runs.
   */
  chrome.windows.onRemoved.addListener((windowId) => {
    const removedTabIds = removeTabsByWindow(windowId);
    if (removedTabIds.length === 0) return;
    if (!isClaimsReady()) return;
    Promise.all(removedTabIds.map((tabId) => releaseClaimByTab(tabId))).catch((err) => {
      console.warn('[tab-junkie] batch releaseClaimByTab failed on window removal', err);
    });
  });
}
