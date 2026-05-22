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
import { releaseClaimByTab, reevaluateTab, isClaimsReady, getClaimsMirror, markInherited, pruneInherited, getItemIdForTab, remapTabIdInClaims } from './tab-claims.js';
import { detectDriftForTab, clearDrift } from './drift.js';
import { listItems, getItem, updateItem } from '../storage/items.js';
import { isSafeFaviconUrl } from '../../shared/favicon.js';
import { broadcast, SCOPE } from '../broadcast.js';
import { recordOpener, pruneOpener, pruneOpenersByWindow, walkOpenerChain } from './opener-chain.js';
import { appendFloatingGroup, pruneFloatingGroupsByLiveTabId, remapFloatingGroupsLiveTabId } from './floating-groups.js';
import { readPartition } from '../storage/partitions.js';
import { PARTITION_FLOATING_GROUPS } from '../storage/shapes.js';
/* B-014 */
import { registerWindow, unregisterWindow } from './window-ordinals.js';
/* B-041 (S42 §67.6.6) — chrome-sync produces a storm of onMoved events
   during its bulk strip-reorder. The flag below short-circuits the
   listener for the duration so floating-group state isn't churned. */
import { isSyncInFlight } from '../sync/chrome-sync.js';

/** @type {Map<number, ReturnType<typeof setTimeout>>} per-tab debounce timers (H2) */
const reevalTimers = new Map();

/* B-159 §A (S43 close, 2026-05-03) — once-per-session set of itemIds we've
   already stamped a favicon on. Prevents repeated writes when the same tab
   navigates and emits multiple favIconUrl change events. The set lives for
   the SW lifetime; on cold-start it resets, and the first onUpdated event
   per item per session re-stamps if the persisted value is still empty.
   Items that already carry a non-empty favIconUrl on disk are skipped on
   the read inside `_maybePersistItemFavicon` regardless of set membership.
   Trade-off: rebrand favicon changes won't propagate to disk after the
   first stamp. Acceptable for v1; future iteration could add an explicit
   "refresh favicon" gesture per item. */
const _faviconStampedItemIds = new Set();

/**
 * B-159 §A — fire-and-forget capture: when a claimed tab's favicon updates,
 * stamp the matching Item record's `favIconUrl` field IF the field is still
 * empty/null on disk. One-shot per session per item via _faviconStampedItemIds.
 *
 * Pure side-effect; never throws (errors swallowed). Safe to call from any
 * tab event listener.
 *
 * @param {number} tabId
 * @param {string|undefined} favIconUrl
 */
function _maybePersistItemFavicon(tabId, favIconUrl) {
  if (!favIconUrl || !isSafeFaviconUrl(favIconUrl)) return;
  if (!isClaimsReady()) return;
  const itemId = getItemIdForTab(tabId);
  if (!itemId) return;
  if (_faviconStampedItemIds.has(itemId)) return;
  _faviconStampedItemIds.add(itemId);
  /* Read the item once to avoid clobbering an existing persisted favicon —
     the user may have a different favicon stamped from a prior session. */
  getItem(itemId).then((item) => {
    if (!item) return;
    if (item.favIconUrl && item.favIconUrl.length > 0) return;
    return updateItem(itemId, { favIconUrl });
  }).catch(() => { /* never let favicon persistence break the dispatch */ });
}

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

    /* B-159 §A — capture-once persistence to the Item record. Runs only
       when the changeInfo carries a favIconUrl (the patch path above also
       requires it for the LiveTabIndex update); uses the new normalized
       `patch.favIconUrl` so we share `'' → no-op` semantics. */
    if ('favIconUrl' in changeInfo && patch.favIconUrl) {
      _maybePersistItemFavicon(tabId, patch.favIconUrl);
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
            /* B-148 hotfix (S44 polish) — anchor the new floating tab DIRECTLY
               UNDER the opener page in renderOrder so it appears next to the
               page the user just clicked from. Two cases:
               (a) opener tab is itself a floating record in the same group
                   → anchor at `floating:<openerFloatingTabId>`
               (b) opener resolves to the saved item via walkOpenerChain
                   → anchor at `item:<result.itemId>`
               Either way, appendFloatingGroup splices the new ref AT
               anchor+1, not at end. Falls back to append-at-end when no
               anchor resolves (e.g., legacy v6 group with no renderOrder). */
            let insertAfterRef = 'item:' + result.itemId;
            try {
              const floatingRecords = await readPartition(PARTITION_FLOATING_GROUPS);
              if (Array.isArray(floatingRecords)) {
                const openerFloating = floatingRecords.find(
                  (r) => r
                    && typeof r === 'object'
                    && r.groupId === result.groupId
                    && r.liveTabId === tab.openerTabId
                    && typeof r.floatingTabId === 'string'
                    && r.floatingTabId.length > 0,
                );
                if (openerFloating) {
                  insertAfterRef = 'floating:' + openerFloating.floatingTabId;
                }
              }
            } catch {
              /* swallow — fallback to item-anchor is correct on read failure */
            }
            await appendFloatingGroup({
              groupId: result.groupId,
              parentItemId: result.itemId,
              windowId: liveWindowId,
              tabIndex: typeof liveIndex === 'number' ? liveIndex : 0,
              url: liveUrl,
              savedAt: Date.now(),
              /* B-137 §66.5.5 — caller-supplies `liveTabId`. `tab.id` is in
                 scope from the `chrome.tabs.onCreated` callback parameter;
                 the `liveEntry` re-validation above (line 151-152) ensures
                 the tab is still alive at write time. */
              liveTabId: tab.id,
              /* B-148 hotfix — see anchor comment above. */
              insertAfterRef,
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
   *
   * Origin (Fix A — pre-v1.35.0 hotfix bundle): also cascade-prune any
   * `tj:floatingGroups` record whose `liveTabId` matches the closed tab.
   * Without this prune, orphan records survive in storage and break
   * subsequent floating-tab reorders via the `storageBucketSize` parity
   * check at floating-groups.js:397-401 (returns ERR_RACE on every drag).
   * B-141 self-application: R2 chapter 66 §66.1 claimed Issue 3 (race-toast
   * on rapid floating reorder) was structurally eliminated by B-137; this
   * fixes the orphan-record half that the original chapter scoped out.
   * See `docs/findings/post-s41-pre-merge-triage.md` Issue A.
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
    /* Fix A — orphan-record cascade-prune. Fire-and-forget with try/catch
       on the helper itself; mirror the B-132 `preMarkInheritedFromFloatingGroups`
       graceful-degradation pattern so a storage error here never throws past
       the listener boundary and never blocks the broadcast above. */
    pruneFloatingGroupsByLiveTabId(tabId).catch((err) => {
      console.warn('[tab-junkie] pruneFloatingGroupsByLiveTabId failed on tab removal', err);
    });
  });

  /**
   * B-164 §69.3.1 — `chrome.tabs.onReplaced` 5-table remap.
   *
   * Chrome rotates tabIds at discard/restore time (empirically verified in
   * the Test A probe — `docs/findings/sprint-45.md`); without this listener
   * the in-memory mirror tables go stale and saved bookmarks falsely render
   * as offline. The C-13 (Chrome event-feedback completeness) gap this
   * closes is the discard write-API surface — `chrome.tabs.discard()` had
   * no corresponding listener pre-B-164.
   *
   * Per R2 §69.3.1, the 5 tables remap as follows:
   *   1. `claimsMirror`        — `remapTabIdInClaims` (tab-claims.js)
   *   2. `inheritedTabs`       — `remapTabIdInClaims` (same helper)
   *   3. `_faviconStampedItemIds` — NO-OP (itemId-keyed Set per R2 AC3
   *                             clarification at `tab-events.js:49,67-68`;
   *                             itemId is stable across tabId rotation, so
   *                             no remap is needed for this table. Verified
   *                             at R3 — `_maybePersistItemFavicon` adds the
   *                             itemId from `getItemIdForTab(tabId)` at :68,
   *                             not the tabId itself.)
   *   4. `reevalTimers`        — `clearTimeout` + `delete` (R2 §69.3.4
   *                             option (ii); no re-arm because the
   *                             pending `setTimeout` callback captured
   *                             `tabId = removedTabId` in its closure and
   *                             cannot be re-keyed without re-arming a
   *                             fresh closure; the on-wake `reconcileClaims`
   *                             — fix (c) — is the safety net for any
   *                             reevaluation lost to this branch.)
   *   5. `tj:floatingGroups[].liveTabId` — `remapFloatingGroupsLiveTabId`
   *                             (floating-groups.js); fire-and-forget per
   *                             B-132 graceful-degradation precedent.
   *
   * AC contract (R1 LOCKED + R2 clarifications, `docs/findings/sprint-45.md`):
   *   AC1 — tab discard remap (saved-item claim survives)
   *   AC3 — 5-table atomicity (tables 1+2+4 synchronous; table 3 N/A;
   *         table 5 atomic via single `writeTransaction`)
   *   AC4 — floating tab survives discard (via table 5)
   *   AC5 — inherited-tab guard preserved (via table 2)
   *   AC6 — reevalTimer race resolved gracefully (via table 4 option (ii))
   */
  chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
    if (typeof addedTabId !== 'number' || typeof removedTabId !== 'number') return;
    if (addedTabId === removedTabId) return;
    /* C-9(ii) defer: during cold-start before reconcileClaims resolves,
       claimsMirror is {} and the storage partition has not been read.
       Any tabId rotation in this window is observationally equivalent to
       "the new tabId is the one that always existed"; reconcileClaims +
       reassociateFloatingGroups will bind it correctly. Mirrors the
       existing isClaimsReady() guard pattern at :64. */
    if (!isClaimsReady()) return;

    /* Table 4 — reevalTimers (R2 PICK option (ii): clearTimeout + delete,
       no re-arm). The pending setTimeout closure captured tabId =
       removedTabId; re-keying the Map entry alone would still call
       reevaluateTab against the dead id. Option (ii) discards the
       captured state along with the timer; the on-wake reconcileClaims
       (fix (c)) is the safety net for any lost reevaluation. */
    if (reevalTimers.has(removedTabId)) {
      clearTimeout(reevalTimers.get(removedTabId));
      reevalTimers.delete(removedTabId);
    }

    /* Tables 1+2 — claimsMirror + inheritedTabs (synchronous in-memory
       mirror update + writeClaims persistence). Awaits the
       chrome.storage.session round-trip; the `.catch` keeps the listener
       boundary clean per the B-132 precedent. */
    remapTabIdInClaims(removedTabId, addedTabId).catch((err) => {
      console.warn('[tab-junkie] B-164 remapTabIdInClaims failed', err);
    });

    /* Table 5 — tj:floatingGroups[].liveTabId (atomic writeTransaction;
       fire-and-forget). Pre-flight read inside the helper short-circuits
       when no record's liveTabId matches removedTabId — common path. */
    remapFloatingGroupsLiveTabId(removedTabId, addedTabId).catch((err) => {
      console.warn('[tab-junkie] B-164 remapFloatingGroupsLiveTabId failed', err);
    });

    /* Broadcast so the sidepanel re-renders any rows whose tabId
       reference may have shifted. Gated on requireClaimsReady so the
       cold-start window is not flooded. */
    broadcast(SCOPE.LIVE_STATE, 'tab/replaced', { requireClaimsReady: true });
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
      // Fix A (pre-v1.35.0 hotfix bundle): symmetric with the per-tab
      // onRemoved handler above — cascade-prune any tj:floatingGroups
      // record whose liveTabId matches a tab closed by the window-removal
      // event. Per Chrome's contract, tabs.onRemoved fires for each tab in
      // a closing window before windows.onRemoved, so the per-tab listener
      // already handles the prune; this loop is belt-and-braces against
      // any ordering edge case (matches the B-125 §59.5 pattern). See
      // `docs/findings/post-s41-pre-merge-triage.md` Issue A.
      pruneFloatingGroupsByLiveTabId(tabId).catch((err) => {
        console.warn('[tab-junkie] pruneFloatingGroupsByLiveTabId failed on window removal', err);
      });
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

  /**
   * B-136: tabs.onMoved fires when a tab is moved WITHIN a window (Chrome
   * dispatches separate onDetached/onAttached for cross-window drags).
   * Without this listener, `LiveTabIndex.entry.index` goes stale after
   * `chrome.tabs.move` and `buildOpenTabs` (background/tabs/open-tabs.js:34-63)
   * keeps sorting by stale indices — the sidepanel cache signature does not
   * change and no patch path runs. See `docs/findings/post-s40-smoke-triage.md`
   * Issue 1 for the full failure trace.
   *
   * Payload: `(tabId, { windowId, fromIndex, toIndex })`. Per Chrome docs
   * (developer.chrome.com/docs/extensions/reference/api/tabs#event-onMoved),
   * `toIndex` is always a literal 0-based index — Chrome resolves the -1
   * "end of strip" convention before firing this event. Local renumber is
   * therefore safe (no -1 special case needed).
   *
   * Local-renumber strategy (vs. full re-query): mirror Chrome's own
   * shift behaviour for the affected range:
   *   forward  (from < to): tabs at indices [from+1, to] shift -1
   *   backward (from > to): tabs at indices [to, from-1] shift +1
   *   moved tab itself takes `toIndex`
   * Rationale: synchronous + O(window-size) — matches the in-memory cost
   * of `onUpdated`. Avoids the extra `chrome.tabs.query` await.
   */
  chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    /* B-041 (S42 §67.6.6) — suppress floating-group re-bind during chrome-sync.
       The bulk strip-reorder fires onMoved per-tab; processing each event
       wastes cycles and risks racing with our own writes. */
    if (isSyncInFlight()) return;
    if (!moveInfo || typeof moveInfo.windowId !== 'number') return;
    if (typeof moveInfo.fromIndex !== 'number' || typeof moveInfo.toIndex !== 'number') return;
    const { windowId, fromIndex, toIndex } = moveInfo;
    if (fromIndex === toIndex) return;

    const index = getLiveTabIndex();
    if (fromIndex < toIndex) {
      // Forward move: tabs in (fromIndex, toIndex] shift down by 1.
      for (const [otherTabId, entry] of index) {
        if (otherTabId === tabId) continue;
        if (entry.windowId !== windowId) continue;
        if (entry.index > fromIndex && entry.index <= toIndex) {
          updateTabEntry(otherTabId, { index: entry.index - 1 });
        }
      }
    } else {
      // Backward move: tabs in [toIndex, fromIndex) shift up by 1.
      for (const [otherTabId, entry] of index) {
        if (otherTabId === tabId) continue;
        if (entry.windowId !== windowId) continue;
        if (entry.index >= toIndex && entry.index < fromIndex) {
          updateTabEntry(otherTabId, { index: entry.index + 1 });
        }
      }
    }
    updateTabEntry(tabId, { windowId, index: toIndex });
    broadcast(SCOPE.LIVE_STATE, 'tab/moved', { requireClaimsReady: true });
  });
}
