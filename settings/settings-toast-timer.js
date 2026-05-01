/**
 * settings/settings-toast-timer.js — Sprint 42 R4 H-2.
 *
 * Single-owner of the auto-dismiss timer for the shared `#settings-toast`
 * DOM node. Two callers (settings-import-export.js + settings-chrome-sync.js)
 * each render into the same toast element; without a shared timer, the
 * second caller's toast can be hidden mid-display by the first caller's
 * still-pending setTimeout (the "ghost timer" race [code-reviewer] H-2
 * called out).
 *
 * Contract:
 *   armToastTimer(fn, ms) — cancel any pending timer, then arm a fresh one.
 *                           When `fn` fires it calls back into the caller's
 *                           hide-the-toast routine. Always pairs cancel +
 *                           arm so the previous owner cannot hide the
 *                           current toast.
 *   cancelToastTimer()   — cancel any pending timer (e.g. on dismiss-button
 *                           click). Idempotent.
 *
 * Module-level state is safe: the Settings page is single-document, single-
 * tab, single-realm. SW cold-restart does not reach this module — it lives
 * on the Settings tab; tab close GCs the realm.
 */

let _timerHandle = null;

/**
 * Cancel any pending auto-dismiss timer, then arm a fresh one. The single
 * shared handle ensures a stale timer from a previous caller cannot hide
 * the current toast.
 *
 * @param {() => void} fn  — hide-the-toast callback to invoke when the timer fires
 * @param {number} ms      — auto-dismiss duration in milliseconds
 */
export function armToastTimer(fn, ms) {
  cancelToastTimer();
  _timerHandle = setTimeout(() => {
    _timerHandle = null;
    try { fn(); } catch { /* hide-routine swallows; never block timer queue */ }
  }, ms);
}

/**
 * Cancel any pending auto-dismiss timer. Idempotent — safe to call when
 * no timer is armed.
 */
export function cancelToastTimer() {
  if (_timerHandle !== null) {
    clearTimeout(_timerHandle);
    _timerHandle = null;
  }
}

/* Test hook: report whether a timer is currently armed. Production callers
   should never need this — it exists so tests can assert the cancel path. */
export function _isTimerArmedForTest() {
  return _timerHandle !== null;
}
