/**
 * B-164 §69.3.2 — `chrome.idle.onStateChanged` defensive on-wake reconcile.
 *
 * On OS/display wake (state transition to `'active'`), defensively rerun
 * `reconcileClaims` to repair any mirror staleness from events that fired
 * while the SW was asleep or that the SW never received. Covers both Test B
 * probe interpretations (`docs/findings/sprint-45.md`):
 *   (B-i)  SW shut down during sleep; tab events post-sleep were silently
 *          lost (the well-known MV3 30s-idle gap).
 *   (B-ii) SW alive but Edge didn't discard any tabs in the sleep window.
 *
 * Either way, the next `'active'` transition triggers a fresh
 * `reconcileClaims` call — Phase 1 keeps every live claim, Phase 2 claims
 * any unclaimed tabs by URL, Phase 3/4 (B-163) handle any drift records
 * for items evicted in Phase 1. Idempotent: a rerun on a non-stale mirror
 * completes in <10ms per §69.8.
 *
 * Detection-interval (R2 PICK): 60s — Chromium's documented default.
 *   - <30s offers no benefit (MV3 SW idle shutdown is ~30s; any event
 *     during the 30-60s window wakes the SW via Chrome's own event
 *     dispatch path).
 *   - 60s matches the OS-level "screen off → idle" intuition users have.
 *
 * Duplicate-reconcile suppression: `_reconcileInFlight` flag (R2 PICK over
 * setTimeout debounce). Chrome's own state machine prevents back-to-back
 * `'active'` fires (an intervening `'idle'` or `'locked'` is required),
 * but the flag covers rare OS configurations where a quick lock+unlock
 * could fire `'locked' → 'active'` and `'idle' → 'active'` in rapid
 * succession.
 *
 * Graceful degradation (B-132 precedent at
 * `background/tabs/index.js:58-62`): if `chrome.idle.setDetectionInterval`
 * throws (permission grant race on extension update; Chromium API
 * unavailable), we log a console.warn and skip the call — Chromium falls
 * back to its built-in default (60s) when no explicit interval is set.
 * `chrome.idle.onStateChanged.addListener` should be reachable whenever
 * the `"idle"` permission is granted; if `chrome.idle` itself is
 * undefined (older Chromium / different runtime), we skip listener
 * registration entirely so the SW does not crash.
 */

import { reconcileClaims } from './tab-claims.js';
import { listItems } from '../storage/items.js';

let _reconcileInFlight = false;

/* B-164 R4 M-2 (S45) — wake-reconcile race guard.
 *
 * `_reconcileInFlight` (above) is a *listener-entry* dedup flag: it short-
 * circuits a second `chrome.idle.onStateChanged('active')` fire before its
 * async work begins. It does NOT cover the async-gap race between an
 * in-flight `reconcileClaims` and an interleaved `chrome.tabs.onReplaced`.
 *
 * The race (qa R4 M-2): `reconcileClaims` captures `storedClaims` as a
 * snapshot of `claimsMirror` at entry, then awaits Phase-3 storage reads.
 * During those awaits, `onReplaced` can fire (because `isClaimsReady()` is
 * true), remapping the live `claimsMirror` + persisting via the durable W-5.
 * When `reconcileClaims` resumes and assigns `claimsMirror = reconciled`, it
 * overwrites the mirror with the pre-remap snapshot — silently erasing the
 * B-164 remap.
 *
 * Fix (Option B): block `onReplaced` from persisting during the wake-
 * reconcile work. Pending replacements are queued in `_pendingReplacements`
 * and drained AFTER `reconcileClaims` completes, BEFORE the flag is cleared,
 * so any events that arrive mid-drain are also queued (preventing a
 * drain-itself race). Order is FIFO via Array push + copy-and-clear.
 *
 * Coupling note: `tab-events.js` calls `isReconcileActive()` to decide
 * whether to apply the remap inline OR enqueue. The drain calls the
 * `_drainCallback` that `tab-events.js` registers via
 * `setReplacementDrainCallback(fn)` — callback registration avoids a
 * circular import (`idle-reconciler.js` → `tab-events.js`).
 */
let _reconcileActive = false;
/** @type {Array<{addedTabId: number, removedTabId: number}>} */
const _pendingReplacements = [];
/** @type {((addedTabId: number, removedTabId: number) => void) | null} */
let _drainCallback = null;

/**
 * Returns true while a wake-reconcile is between its first await and its
 * final commit. `tab-events.js`'s `onReplaced` listener consults this to
 * decide between inline remap (false) and enqueue (true).
 *
 * @returns {boolean}
 */
export function isReconcileActive() {
  return _reconcileActive;
}

/**
 * Append a tabId rotation to the pending-replacements queue. Called by
 * `tab-events.js`'s `onReplaced` listener when `isReconcileActive()` is
 * true. FIFO order preserved by Array push.
 *
 * @param {number} addedTabId
 * @param {number} removedTabId
 * @returns {void}
 */
export function enqueuePendingReplacement(addedTabId, removedTabId) {
  _pendingReplacements.push({ addedTabId, removedTabId });
}

/**
 * Register the drain callback that the wake-reconcile invokes after
 * `reconcileClaims` completes. Called once from `registerTabEventListeners`
 * with `_applyTabReplacement` bound. Idempotent — last registration wins.
 *
 * @param {(addedTabId: number, removedTabId: number) => void} fn
 * @returns {void}
 */
export function setReplacementDrainCallback(fn) {
  _drainCallback = fn;
}

/**
 * Register the chrome.idle on-wake reconcile listener. Must be called
 * synchronously at module scope (MV3 event-registration requirement).
 *
 * @param {Promise<void>} readyPromise — gates the reconcile invocation until
 *   the migration pipeline completes (it resolves when `runMigrations`
 *   resolves; `initializeLiveState` runs CONCURRENTLY as fire-and-forget and is
 *   NOT awaited by this gate). The hydrate-before-reconcile ordering is
 *   guaranteed WITHIN `initializeLiveState`'s cold-start sequence; an idle-wake
 *   that lands in the migrations-done-but-hydrate-pending gap self-heals —
 *   Phase 2 re-infers from the live index, and the next cold-start reconcile
 *   corrects. Mirrors the pattern used by registerTabEventListeners.
 * @returns {void}
 */
export function registerIdleReconciler(readyPromise) {
  /* B-132 graceful-degradation guard: chrome.idle may be unavailable in
     test runtimes or older Chromium builds. Skip registration entirely so
     the SW does not throw at module load. */
  if (typeof chrome === 'undefined' || !chrome.idle || !chrome.idle.onStateChanged) {
    console.warn('[tab-junkie] B-164 chrome.idle unavailable; on-wake reconcile disabled');
    return;
  }

  /* R2 PICK — 60s detection interval (documented Chromium default).
     The setDetectionInterval call may throw if the permission grant
     hasn't propagated yet on extension update; log and proceed — the
     listener registration below is still valid because Chromium uses its
     built-in default when no explicit interval is set. */
  try {
    if (typeof chrome.idle.setDetectionInterval === 'function') {
      chrome.idle.setDetectionInterval(60);
    }
  } catch (err) {
    console.warn('[tab-junkie] B-164 chrome.idle.setDetectionInterval failed', err?.message || err);
  }

  chrome.idle.onStateChanged.addListener((state) => {
    /* C-7 allow-list: ONLY 'active' triggers a reconcile. 'idle' and
       'locked' are explicit no-ops (no logging — they fire frequently
       during normal use). */
    if (state !== 'active') return;
    /* R2 flag-semantic: suppress duplicate reconciles within same wake
       event. Reset in the finally block below so the next genuine
       'active' transition is not blocked. */
    if (_reconcileInFlight) return;
    _reconcileInFlight = true;
    /* R4 M-2: set the race-guard flag synchronously, BEFORE the first
       await. From this point until the drain completes, onReplaced events
       are queued rather than persisted (see tab-events.js:373). */
    _reconcileActive = true;

    (async () => {
      try {
        await readyPromise;
        const items = await listItems();
        /* reconcileClaims is idempotent — Phase 1 keeps live claims;
           Phase 2 claims unclaimed tabs by URL; B-163 Phases 3+4 handle
           drift. A rerun on a non-stale mirror is a fast no-op. */
        await reconcileClaims(items);
        /* R4 M-2: drain queued onReplaced events BEFORE clearing
           _reconcileActive. Copy-and-clear pattern: any events arriving
           mid-drain are appended to _pendingReplacements and picked up by
           the next iteration of the while loop. Once the array is empty
           AND no further enqueue happens before the flag clears (the next
           statement), the queue is provably drained. */
        while (_pendingReplacements.length > 0 && _drainCallback) {
          const drain = _pendingReplacements.slice();
          _pendingReplacements.length = 0;
          for (const { addedTabId, removedTabId } of drain) {
            _drainCallback(addedTabId, removedTabId);
          }
        }
      } catch (err) {
        console.warn('[tab-junkie] B-164 on-wake reconcileClaims failed', err);
      } finally {
        _reconcileActive = false;
        _reconcileInFlight = false;
      }
    })();
  });
}

/**
 * Test hatch — reset all module-level state so back-to-back tests in the
 * same process do not bleed state. Only used by test suites.
 */
export function __resetIdleReconciler() {
  _reconcileInFlight = false;
  _reconcileActive = false;
  _pendingReplacements.length = 0;
  _drainCallback = null;
}

/**
 * Test hatch — return a snapshot of the pending-replacements queue so
 * tests can assert FIFO order and queue-depth before/after the drain.
 *
 * @returns {Array<{addedTabId: number, removedTabId: number}>}
 */
export function __getPendingReplacements() {
  return _pendingReplacements.slice();
}
