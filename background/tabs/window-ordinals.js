/* B-014 */
/**
 * WindowOrdinals — session-scoped human-readable window ordinals (W1, W2, W3…).
 *
 * Rationale (R2 §28.2):
 *  - `chrome.windows.Window.id` integers are ephemeral and not user-friendly.
 *  - A first-seen-order ordinal (1, 2, 3, …) gives users a stable reference
 *    per browser session for the sidepanel window badge and window filter row.
 *
 * Invariants:
 *  - The map is purely in-memory and session-scoped. Never written to
 *    `chrome.storage.*` (AC15).
 *  - Ordinals are assigned in first-seen order and NOT renumbered on close —
 *    gaps are preserved (AC3).
 *  - `chrome.windows.WINDOW_ID_NONE` (−1) and any negative / non-finite id is
 *    defensively ignored in register / unregister paths.
 *
 * Shape: `Map<number, number>` (rawWindowId → ordinal).
 */

/** @type {Map<number, number>} rawWindowId → ordinal */
const ordinalMap = new Map();

/** Tracks the highest ordinal ever assigned, so gap-preserving registration
 *  (`maxOrdinal + 1`) stays O(1) rather than O(n) over the surviving map. */
let maxOrdinal = 0;

/** When true, cold-start enumeration is in flight; `registerWindow()` becomes
 *  a no-op for ids already captured by `chrome.windows.getAll()`. */
let bootstrapping = false;

/**
 * Cold-start enumeration. Called from the service-worker bootstrap sequence
 * (alongside `buildLiveTabIndex` and `reconcileClaims`) BEFORE `readyPromise`
 * resolves.
 *
 * Enumerates all currently-open windows via `chrome.windows.getAll()`, sorts
 * by raw id ascending (monotonicity assumption — Chromium assigns windowIds
 * monotonically per session, §28.2.2), and assigns ordinals 1..N.
 *
 * Idempotent: calling again after cold-start is a no-op for any windowIds
 * already in the map (same ordinal returned — see `registerWindow`).
 *
 * @returns {Promise<void>}
 */
export async function initWindowOrdinals() {
  bootstrapping = true;
  try {
    let wins;
    try {
      wins = await chrome.windows.getAll({ populate: false });
    } catch (err) {
      console.warn('[tab-junkie:window-ordinals] chrome.windows.getAll failed', err?.message);
      wins = [];
    }
    if (!Array.isArray(wins)) wins = [];
    const ids = wins
      .map((w) => (w && typeof w.id === 'number' ? w.id : null))
      .filter((id) => id != null && id >= 0)
      .sort((a, b) => a - b);
    for (const id of ids) {
      if (!ordinalMap.has(id)) {
        maxOrdinal += 1;
        ordinalMap.set(id, maxOrdinal);
      }
    }
  } finally {
    bootstrapping = false;
  }
}

/**
 * Assign the next ordinal to a newly-opened window. Idempotent: if the
 * windowId is already in the map (cold-start race, or a replayed event),
 * the existing ordinal is returned without mutation.
 *
 * @param {number} windowId
 * @returns {number|null} the assigned (or existing) ordinal, or null on
 *   invalid input. Callers can ignore the return value — mutation only.
 */
export function registerWindow(windowId) {
  if (typeof windowId !== 'number' || !Number.isFinite(windowId) || windowId < 0) {
    return null;
  }
  /* B-014 M-2: During initWindowOrdinals, windows.onCreated may fire for a
     window opened AFTER the chrome.windows.getAll() await resumed. In that
     case, the new window's raw id may be numerically greater than the largest
     id returned by getAll(), and registerWindow assigns ordinal = maxOrdinal
     + 1. The for-loop in initWindowOrdinals skips ids already present in the
     map. Net effect: first-seen-order is best-effort; a race window exists
     during bootstrap. Acceptable — ordinals are ephemeral and strict
     monotonicity is not a correctness property. */
  if (bootstrapping && ordinalMap.has(windowId)) {
    return ordinalMap.get(windowId);
  }
  if (ordinalMap.has(windowId)) {
    return ordinalMap.get(windowId);
  }
  maxOrdinal += 1;
  ordinalMap.set(windowId, maxOrdinal);
  return maxOrdinal;
}

/**
 * Remove a window from the map. Does NOT renumber surviving ordinals — gaps
 * are preserved deliberately (AC3).
 *
 * @param {number} windowId
 * @returns {boolean} true if an entry was removed, false otherwise.
 */
export function unregisterWindow(windowId) {
  if (typeof windowId !== 'number' || !Number.isFinite(windowId) || windowId < 0) {
    return false;
  }
  return ordinalMap.delete(windowId);
}

/**
 * Synchronous ordinal lookup for a raw windowId.
 *
 * @param {number} windowId
 * @returns {number|undefined}
 */
export function getWindowOrdinal(windowId) {
  return ordinalMap.get(windowId);
}

/**
 * Return a defensive copy of the ordinal map, keyed by stringified
 * rawWindowId (JSON-safe — JSON object keys are always strings).
 *
 * The copy guarantees downstream callers (message handlers, tests) cannot
 * corrupt the internal state by mutating the returned object.
 *
 * @returns {Record<string, number>}
 */
export function getWindowMap() {
  const out = {};
  for (const [id, ordinal] of ordinalMap) {
    out[String(id)] = ordinal;
  }
  return out;
}

/**
 * @returns {number} count of currently-known windows
 */
export function getWindowOrdinalsSize() {
  return ordinalMap.size;
}

/**
 * Test hatch: reset internal state. Only used by test suites.
 */
export function __resetWindowOrdinals() {
  ordinalMap.clear();
  maxOrdinal = 0;
  bootstrapping = false;
}
