/**
 * Tab-event fan-out cascades (B-177 / §74 A3).
 *
 * When a tab is REPLACED (`chrome.tabs.onReplaced` — discard/restore tabId
 * rotation) or REMOVED (`chrome.tabs.onRemoved` / `chrome.windows.onRemoved`),
 * many independent stores must be kept in sync. Before B-177 that knowledge
 * was scattered across `tab-events.js` as inline handler bodies + a duplicated
 * per-tab loop inside the window-removal handler, with the affected stores
 * documented only in piecemeal "table N" comments.
 *
 * This module names those fan-outs as primitives and carries ONE canonical
 * store inventory per primitive (sync vs async / fire-and-forget per store):
 *
 *   - `applyTabReplacement(addedTabId, removedTabId)` — the onReplaced remap.
 *   - `releaseTabCascade(tabId)`                       — the per-tab onRemoved cascade.
 *   - `releaseTabsCascade(tabIds)`                     — the bulk windows.onRemoved cascade.
 *
 * The per-tab and bulk removal paths SHARE their ephemeral-store detach via the
 * private `detachTabFromEphemeralStores` kernel (the "duplicated logic" the §74
 * review flagged). They intentionally do NOT share the claim-release shape:
 * the per-tab path releases unconditionally and broadcasts once per release,
 * while the bulk path is gated on `isClaimsReady()` and batches releases via
 * `Promise.allSettled` with a single trailing broadcast. That asymmetry is
 * real (B-170-class narrowing risk if flattened) and is preserved here — the
 * broadcast + window-ordinal handling stay in the `tab-events.js` handlers.
 *
 * B-177 is a PURE REFACTOR: zero behavior change. The semantics extracted here
 * (call order, sync-vs-fire-and-forget per store, the `isClaimsReady()` /
 * race-guard gates) are byte-for-byte the pre-B-177 `tab-events.js` behavior,
 * modulo semantically equivalent reordering of independent operations on
 * disjoint module state (claimsMirror vs ordinalMap vs reevalTimers): the
 * synchronous stack — including `unregisterWindow` + the WINDOW_MAP broadcast —
 * always completes before any released-claim async callback runs.
 */

import { removeTabEntry } from './live-tab-index.js';
import { releaseClaimByTab, remapTabIdInClaims, pruneInherited, isClaimsReady } from './tab-claims.js';
import { clearDrift } from './drift.js';
import { broadcast, SCOPE } from '../broadcast.js';
import { pruneOpener } from './opener-chain.js';
import { remapFloatingGroupsLiveTabId, pruneFloatingGroupsByLiveTabId } from './floating-groups.js';

/**
 * Per-tab URL-change debounce timers (H2). Keyed by tabId.
 *
 * Owned here because every CLEAR of a timer is part of a tab-event cascade
 * (onReplaced clears the removed tabId's timer; onRemoved / windows.onRemoved
 * clear each closed tab's timer). The single place that ARMS a timer is the
 * `onUpdated` URL-change branch in `tab-events.js`, which drives this map via
 * `armReevalTimer` / `clearReevalTimer`.
 *
 * @type {Map<number, ReturnType<typeof setTimeout>>}
 */
const reevalTimers = new Map();

/**
 * Arm (or replace) the reevaluation debounce timer for a tab. Callers that
 * re-arm MUST call `clearReevalTimer` first to cancel any in-flight timer.
 *
 * @param {number} tabId
 * @param {ReturnType<typeof setTimeout>} handle
 * @returns {void}
 */
export function armReevalTimer(tabId, handle) {
  reevalTimers.set(tabId, handle);
}

/**
 * Cancel and forget the reevaluation debounce timer for a tab. Safe to call
 * when no timer exists (no-op) and when the timer has already fired
 * (`clearTimeout` on a fired handle is a documented no-op).
 *
 * @param {number} tabId
 * @returns {void}
 */
export function clearReevalTimer(tabId) {
  if (reevalTimers.has(tabId)) {
    clearTimeout(reevalTimers.get(tabId));
    reevalTimers.delete(tabId);
  }
}

/**
 * B-164 §69.3.1 / B-177 — `chrome.tabs.onReplaced` identity fan-out.
 *
 * Chrome rotates tabIds at discard/restore time; without this remap the
 * in-memory mirror tables go stale and saved bookmarks falsely render as
 * offline. This primitive serves BOTH the live `onReplaced` listener (inline
 * remap when no wake-reconcile is in flight) and the queued-drain path inside
 * `idle-reconciler.js` (post-reconcile FIFO replay) — it is registered as the
 * drain callback via `setReplacementDrainCallback`.
 *
 * Argument order matches Chrome's native `onReplaced(addedTabId, removedTabId)`
 * event signature so the drain callback contract is preserved unchanged.
 *
 * CANONICAL STORE INVENTORY (remap `removedTabId` → `addedTabId`):
 *
 *   | # | Store                        | Mechanism                         | Sync / Async |
 *   |---|------------------------------|-----------------------------------|--------------|
 *   | 1 | reevalTimers (Map)           | clearReevalTimer (clearTimeout +  | SYNC         |
 *   |   |                              | delete; R2 §69.3.4 option (ii) —  |              |
 *   |   |                              | discard, do NOT re-arm; on-wake   |              |
 *   |   |                              | reconcileClaims is the safety net)|              |
 *   | 2 | claimsMirror (in-memory)     | remapTabIdInClaims                | SYNC swap    |
 *   | 3 | inheritedTabs (Set)          | remapTabIdInClaims (same call)    | SYNC swap    |
 *   | 4 | tj:itemClaims (durable local)| remapTabIdInClaims (W-5 remap)    | ASYNC f-a-f  |
 *   | 5 | floatingGroups[].liveTabId   | remapFloatingGroupsLiveTabId      | ASYNC f-a-f  |
 *   | 6 | _faviconStampedItemIds (Set) | NONE — itemId-keyed, not tabId-   | NO-OP        |
 *   |   |   [lives in tab-events.js]   | keyed; itemId is stable across    |              |
 *   |   |                              | tabId rotation, so no remap needed|              |
 *
 * B-179 §75.5 retired the session store (old row 4), so claim persistence is
 * durable-only. Stores 2–4 are all driven by the single `remapTabIdInClaims`
 * call (its in-memory swaps are synchronous; its durable persistence is awaited
 * internally but fire-and-forget at this boundary via `.catch`, per the B-132
 * precedent). A final `tab/replaced` LIVE_STATE broadcast (gated on
 * `requireClaimsReady`) lets the sidepanel re-render shifted tabId references.
 *
 * @param {number} addedTabId
 * @param {number} removedTabId
 * @returns {void}
 */
export function applyTabReplacement(addedTabId, removedTabId) {
  /* Store 1 — reevalTimers. The pending setTimeout closure captured
     tabId = removedTabId; re-keying alone would still call reevaluateTab
     against the dead id, so option (ii) discards the captured state with
     the timer. */
  clearReevalTimer(removedTabId);

  /* Stores 2+3+4 — claimsMirror + inheritedTabs + durable tj:itemClaims, all
     via remapTabIdInClaims. In-memory swap is synchronous; durable persistence
     is fire-and-forget at this boundary (B-132 precedent, R4 L-4 correction). */
  remapTabIdInClaims(removedTabId, addedTabId).catch((err) => {
    console.warn('[tab-junkie] B-164 remapTabIdInClaims failed', err);
  });

  /* Store 5 — tj:floatingGroups[].liveTabId (atomic writeTransaction;
     fire-and-forget). Pre-flight read inside the helper short-circuits when
     no record's liveTabId matches removedTabId — the common path. */
  remapFloatingGroupsLiveTabId(removedTabId, addedTabId).catch((err) => {
    console.warn('[tab-junkie] B-164 remapFloatingGroupsLiveTabId failed', err);
  });

  /* Store 6 — _faviconStampedItemIds: intentionally untouched (NO-OP). The set
     is keyed by itemId (stamped via getItemIdForTab in tab-events.js), and
     itemId is stable across tabId rotation, so there is nothing to remap. */

  /* Broadcast so the sidepanel re-renders any rows whose tabId reference may
     have shifted. Gated on requireClaimsReady so the cold-start window is not
     flooded. */
  broadcast(SCOPE.LIVE_STATE, 'tab/replaced', { requireClaimsReady: true });
}

/**
 * Shared ephemeral-store detach for a single closed tab — the per-tab kernel
 * common to both `releaseTabCascade` and `releaseTabsCascade` (the duplicated
 * logic the §74 review flagged). Touches ONLY the per-tab-granular stores that
 * are detached identically in both the per-tab and bulk removal paths.
 *
 * Stores touched (in this fixed order):
 *   - reevalTimers (Map)        — clearReevalTimer                SYNC
 *   - inheritedTabs (Set)       — pruneInherited (B-125)          SYNC
 *   - floatingGroups records    — pruneFloatingGroupsByLiveTabId  ASYNC f-a-f
 *
 * The floating-group prune mirrors the B-132 graceful-degradation pattern: a
 * storage error never throws past this boundary and never blocks the caller's
 * downstream broadcast.
 *
 * @param {number} tabId
 * @returns {void}
 */
function detachTabFromEphemeralStores(tabId) {
  clearReevalTimer(tabId);
  pruneInherited(tabId);
  pruneFloatingGroupsByLiveTabId(tabId).catch((err) => {
    console.warn('[tab-junkie] pruneFloatingGroupsByLiveTabId failed during tab-removal cascade', err);
  });
}

/**
 * B-177 — `chrome.tabs.onRemoved` per-tab cascade. Fans a single closed tab
 * out to every store that holds a reference to it.
 *
 * CANONICAL STORE INVENTORY (7 subsystems):
 *
 *   | # | Subsystem                    | Mechanism                         | Sync / Async |
 *   |---|------------------------------|-----------------------------------|--------------|
 *   | 1 | openerMap                    | pruneOpener                       | SYNC         |
 *   | 2 | inheritedTabs (Set)          | pruneInherited (kernel)           | SYNC         |
 *   | 3 | reevalTimers (Map)           | clearReevalTimer (kernel)         | SYNC         |
 *   | 4 | LiveTabIndex                 | removeTabEntry                    | SYNC         |
 *   | 5 | claimsMirror +               | releaseClaimByTab                 | SYNC delete, |
 *   |   |   durable tj:itemClaims      |                                   | ASYNC persist|
 *   | 6 | tj:drift                     | clearDrift, only if a claim was   | ASYNC        |
 *   |   |                              |   released                        |              |
 *   | 7 | floatingGroups records       | pruneFloatingGroupsByLiveTabId    | ASYNC f-a-f  |
 *   |   |                              |   (kernel)                        |              |
 *
 * Returns the claim-release promise (resolving to the released itemId or null)
 * so the `tab-events.js` handler can chain the single `tab/removed` broadcast
 * onto it (and own the `.catch` for the release chain), exactly as the
 * pre-B-177 inline handler did. The per-tab release uses the single-promise
 * `.then` shape; the bulk path (`releaseTabsCascade`) uses `Promise.allSettled`
 * — that async-shape asymmetry is deliberately NOT consolidated.
 *
 * @param {number} tabId
 * @returns {Promise<string|null>} the claim-release promise
 */
export async function releaseTabCascade(tabId) {
  pruneOpener(tabId);
  detachTabFromEphemeralStores(tabId);
  removeTabEntry(tabId);
  const releasedItemId = await releaseClaimByTab(tabId);
  if (releasedItemId) await clearDrift(releasedItemId);
  return releasedItemId;
}

/**
 * B-177 — `chrome.windows.onRemoved` bulk cascade. Fans every tab that lived
 * in a closing window out to the per-tab-granular stores, then performs the
 * gated, batched claim release.
 *
 * Subsystem coverage mirrors `releaseTabCascade`'s 7-store inventory, with two
 * structural differences inherent to the bulk path (preserved exactly):
 *
 *   - openerMap (#1) and LiveTabIndex (#4) are pruned at WINDOW granularity by
 *     the caller BEFORE this primitive runs (`pruneOpenersByWindow` and
 *     `removeTabsByWindow` — the latter is also the SOURCE of `tabIds`), so
 *     they are intentionally NOT touched here.
 *   - The claim release (#5/#6) is GATED on `isClaimsReady()` and BATCHED via
 *     `Promise.allSettled` so the caller emits ONE `tab/removed` broadcast for
 *     the whole window — not one per tab. When claims are not yet reconciled
 *     (cold start) or the window held no tracked tabs, the ephemeral detach
 *     still runs for every tab but the release short-circuits (returns null).
 *
 * Returns the batched release promise, or null when the release is gated off,
 * so the caller can decide whether to emit the trailing broadcast.
 *
 * @param {number[]} tabIds — the tabIds removed from the closing window
 * @returns {Promise<PromiseSettledResult<void>[]>|null}
 */
export function releaseTabsCascade(tabIds) {
  for (const tabId of tabIds) {
    detachTabFromEphemeralStores(tabId);
  }
  if (tabIds.length === 0) return null;
  if (!isClaimsReady()) return null;
  return Promise.allSettled(tabIds.map(async (tabId) => {
    const releasedItemId = await releaseClaimByTab(tabId);
    if (releasedItemId) await clearDrift(releasedItemId);
  }));
}
