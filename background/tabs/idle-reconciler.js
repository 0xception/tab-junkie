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

/**
 * Register the chrome.idle on-wake reconcile listener. Must be called
 * synchronously at module scope (MV3 event-registration requirement).
 *
 * @param {Promise<void>} readyPromise — gates the reconcile invocation
 *   until the migration pipeline + initializeLiveState have completed.
 *   Mirrors the pattern used by registerTabEventListeners.
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

    (async () => {
      try {
        await readyPromise;
        const items = await listItems();
        /* reconcileClaims is idempotent — Phase 1 keeps live claims;
           Phase 2 claims unclaimed tabs by URL; B-163 Phases 3+4 handle
           drift. A rerun on a non-stale mirror is a fast no-op. */
        await reconcileClaims(items);
      } catch (err) {
        console.warn('[tab-junkie] B-164 on-wake reconcileClaims failed', err);
      } finally {
        _reconcileInFlight = false;
      }
    })();
  });
}

/**
 * Test hatch — reset the in-flight flag so back-to-back tests in the
 * same process do not bleed state. Only used by test suites.
 */
export function __resetIdleReconciler() {
  _reconcileInFlight = false;
}
