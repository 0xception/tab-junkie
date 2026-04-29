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
import { releaseClaimByTab, reevaluateTab, isClaimsReady, getClaimsMirror, markInherited, pruneInherited } from './tab-claims.js';
import { detectDriftForTab, clearDrift } from './drift.js';
import { listItems } from '../storage/items.js';
import { broadcast, SCOPE } from '../broadcast.js';
import { recordOpener, pruneOpener, pruneOpenersByWindow, walkOpenerChain } from './opener-chain.js';
import { appendFloatingGroup } from './floating-groups.js';
/* B-014 */
import { registerWindow, unregisterWindow } from './window-ordinals.js';

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
    // B-055: keep LiveTabIndex title current for the Open Tabs section.
    if ('title' in changeInfo) patch.title = changeInfo.title || '';

    // Also capture windowId, active, and index from the full tab object
    if (tab) {
      patch.windowId = tab.windowId;
      if ('active' in tab) patch.active = tab.active;
      if (typeof tab.index === 'number') patch.index = tab.index;
      // B-055 fallback: some Chromium versions may set only the tab.title
      // rather than changeInfo.title on title mutations. Keep index current.
      if (!('title' in changeInfo) && typeof tab.title === 'string') {
        patch.title = tab.title;
      }
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

    // B-055: broadcast a title change so the Open Tabs section's title text
    // re-renders. Suppress when a URL change is present (the URL path already
    // broadcasts tab/updated; a second broadcast would double-patch). Suppress
    // when favIconUrl/audible were also present because those branches already
    // fired their own broadcast for this update.
    if (
      'title' in changeInfo
      && !('url' in changeInfo)
      && !('favIconUrl' in changeInfo)
      && !('audible' in changeInfo)
    ) {
      broadcast(SCOPE.LIVE_STATE, 'tab/title-changed', { requireClaimsReady: true });
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
   * tabs.onCreated: capture opener relationship and attempt group inheritance.
   * - openerMap populated synchronously (before any await)
   * - inheritance logic gated on readyPromise (needs items + claims)
   */
  chrome.tabs.onCreated.addListener((tab) => {
    updateTabEntry(tab.id, {
      url: tab.url || '',
      title: tab.title || '',
      windowId: tab.windowId,
      active: tab.active || false,
      audible: false,
      index: typeof tab.index === 'number' ? tab.index : 0,
      favIconUrl: '',
    });
    // B-055: a new tab may qualify for the Open Tabs section; surfaces need to
    // know even before any URL resolves. Broadcast LIVE_STATE so the sidepanel
    // re-fetches openTabs (AC8). Gated on claimsReady to avoid cold-start bursts.
    broadcast(SCOPE.LIVE_STATE, 'tab/created', { requireClaimsReady: true });

    if (typeof tab.openerTabId === 'number') {
      recordOpener(tab.id, tab.openerTabId);

      (async () => {
        try {
          await readyPromise;
          const items = await listItems();
          const claimsMirror = getClaimsMirror();
          const result = walkOpenerChain(tab.id, claimsMirror, items);
          if (result) {
            // H-4/H-5: re-read live state after async gap; bail if tab was removed
            const liveEntry = getLiveTabIndex().get(tab.id);
            if (!liveEntry) return;
            const liveUrl = liveEntry.url || '';
            const liveIndex = liveEntry.index ?? tab.index;
            const liveWindowId = liveEntry.windowId ?? tab.windowId;
            await appendFloatingGroup({
              groupId: result.groupId,
              parentItemId: result.itemId,
              windowId: liveWindowId,
              tabIndex: typeof liveIndex === 'number' ? liveIndex : 0,
              url: liveUrl,
              savedAt: Date.now(),
            });
            // B-125 (§59.3): mark the inherited tab so reevaluateTab will
            // skip the auto-claim branch. Placed strictly AFTER the
            // appendFloatingGroup await resolves — if the write throws,
            // control transfers to the catch and the marker is not set
            // (C-9(ii) fallback: tab is auto-claim eligible).
            // B-125 R4 [security-reviewer] M-1: there is a narrow race
            // window between the appendFloatingGroup write and this mark
            // call. The 100 ms reevaluateTab debounce in onUpdated provides
            // adequate margin for chrome.storage.session writes (sub-ms in
            // practice). Do NOT lower that debounce without revisiting this
            // coupling — a faster reevaluateTab path would re-introduce
            // B-125 under storage-write contention.
            markInherited(tab.id);
            // H-6: remove requireClaimsReady so broadcast always fires
            broadcast(SCOPE.LIVE_STATE, 'tab/opener-inherited');
          }
        } catch (err) {
          console.warn('[tab-junkie] opener-chain inheritance failed', err);
        }
      })();
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
    pruneOpener(tabId);
    // B-125 (§59.3): symmetric with pruneOpener — drop the inheritance
    // marker so a recycled tabId cannot inherit a stale skip-auto-claim gate.
    pruneInherited(tabId);
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
   *
   * B-014: also unregister the ordinal mapping for this windowId and broadcast
   * SCOPE.WINDOW_MAP so sidepanel surfaces can patch their filter row + badges
   * without a full re-render. The WINDOW_MAP broadcast is NOT gated on
   * `requireClaimsReady` — if a window closes during cold start, already-loaded
   * surfaces need to hear about it immediately (§28.3.7).
   */
  chrome.windows.onRemoved.addListener((windowId) => {
    const removedTabIds = removeTabsByWindow(windowId);
    pruneOpenersByWindow(removedTabIds);
    for (const tabId of removedTabIds) {
      if (reevalTimers.has(tabId)) {
        clearTimeout(reevalTimers.get(tabId));
        reevalTimers.delete(tabId);
      }
      // B-125 (§59.5): cascade-prune the inheritance marker for every tab
      // closed by the window-removal event. Symmetric with the per-tab
      // onRemoved handler above.
      pruneInherited(tabId);
    }

    /* B-014: drop the ordinal mapping regardless of claims readiness. The
       map change must be observable to any surface that already loaded
       state; suppressing it would leave stale badges in the UI. */
    const hadOrdinal = unregisterWindow(windowId);
    if (hadOrdinal) {
      broadcast(SCOPE.WINDOW_MAP, 'window/removed');
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

  /**
   * B-014: windows.onCreated — assign the next ordinal and broadcast
   * SCOPE.WINDOW_MAP. Gated on `requireClaimsReady` (§28.3.7) so the
   * bootstrap sequence does not flood surfaces before the first coherent
   * state has been reconciled.
   */
  chrome.windows.onCreated.addListener((win) => {
    if (!win || typeof win.id !== 'number') return;
    const assigned = registerWindow(win.id);
    if (assigned == null) return;
    broadcast(SCOPE.WINDOW_MAP, 'window/created', { requireClaimsReady: true });
  });

  /**
   * B-014 H-3 / AC13: tabs.onDetached fires when a user drags a tab out of a
   * window (to create or attach to another). Chrome does NOT fire onUpdated
   * for this motion — so LiveTabIndex.windowId would otherwise remain stale
   * until a full reload. We leave the entry in place during the brief
   * detach→attach gap; onAttached is authoritative for the new windowId.
   */
  chrome.tabs.onDetached.addListener((tabId, detachInfo) => {
    // Transitional — windowId will be authoritative on onAttached.
    // Leave the entry in place; clients tolerate stale windowId for the
    // ~ms between detach and attach.
    void tabId; void detachInfo;
  });

  /**
   * B-014 H-3 / AC13: tabs.onAttached fires when a dragged tab lands in a
   * (possibly new) window. Patch LiveTabIndex and broadcast LIVE_STATE first
   * so the sidepanel re-fetches liveStates and patches saved-item
   * `data-window-id` attributes; then broadcast WINDOW_MAP so the badge pass
   * reads the fresh attributes (R2 §28.3.7 ordering).
   */
  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    if (!attachInfo || typeof attachInfo.newWindowId !== 'number') return;
    const patch = { windowId: attachInfo.newWindowId };
    if (typeof attachInfo.newPosition === 'number') {
      patch.index = attachInfo.newPosition;
    }
    updateTabEntry(tabId, patch);
    broadcast(SCOPE.LIVE_STATE, 'tab/attached', { requireClaimsReady: true });
    broadcast(SCOPE.WINDOW_MAP, 'tab/attached');
  });
}
