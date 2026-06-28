/**
 * Reusable diagnostic-trace helper for Tab Junkie.
 *
 * Writes SW-console-readable diagnostic traces to `chrome.storage.local` under
 * a `_diag_<key>` namespace. Traces survive service-worker restarts and can be
 * inspected directly from the SW DevTools console:
 *
 *     chrome.storage.local.get('_diag_<key>').then(r => console.log(JSON.stringify(r, null, 2)))
 *
 * Replaces ad-hoc per-investigation instrumentation (e.g. S45's `_b163_debug`,
 * `_s45_premark_trace`, `_s45_reconcile_trace`). All committed diagnostic
 * storage MUST use this module — ad-hoc `chrome.storage.local` debug keys
 * outside the `_diag_*` namespace are forbidden in committed code (see
 * CLAUDE.md "Diagnostic patterns").
 *
 * Filed B-171, Sprint 46.
 */

/** Namespace prefix for all diagnostic-trace keys. */
export const DIAG_KEY_PREFIX = '_diag_';

/**
 * Append a timestamped diagnostic entry to the trace at `_diag_<key>`.
 *
 * Read–modify–write: existing array (or `[]` if absent) is loaded, the new
 * `{ts, payload}` entry is appended, the array is written back. Returns the
 * `Promise` from `chrome.storage.local.set`. On any storage error the failure
 * is swallowed (logged via `console.warn`) and `Promise.resolve()` is returned
 * so diagnostic instrumentation never breaks the caller.
 *
 * @param {string} key — sub-key under the `_diag_` namespace.
 * @param {*} payload — JSON-serializable payload to record.
 * @returns {Promise<void>}
 */
export async function recordTrace(key, payload) {
  const storageKey = DIAG_KEY_PREFIX + key;
  try {
    const existing = await chrome.storage.local.get(storageKey);
    const arr = Array.isArray(existing[storageKey]) ? existing[storageKey] : [];
    arr.push({ ts: Date.now(), payload });
    return await chrome.storage.local.set({ [storageKey]: arr });
  } catch (err) {
    console.warn('[diag] recordTrace failed for key', key, err);
    return undefined;
  }
}

/**
 * Read every diagnostic trace whose key starts with `_diag_<prefix>`.
 *
 * Returns a plain object mapping each matching storage key (with the
 * `_diag_` prefix stripped) to its stored array. Empty match → `{}`.
 *
 * @param {string} [prefix=''] — optional sub-prefix; `''` enumerates all
 *   `_diag_*` keys.
 * @returns {Promise<Object<string, Array<{ts: number, payload: *}>>>}
 */
export async function readTraces(prefix) {
  const fullPrefix = DIAG_KEY_PREFIX + (prefix ?? '');
  try {
    const all = await chrome.storage.local.get(null);
    const out = {};
    for (const k of Object.keys(all)) {
      if (k.startsWith(fullPrefix)) {
        out[k.slice(DIAG_KEY_PREFIX.length)] = all[k];
      }
    }
    return out;
  } catch (err) {
    console.warn('[diag] readTraces failed for prefix', prefix, err);
    return {};
  }
}

/**
 * Remove every diagnostic-trace key whose name starts with
 * `_diag_<prefix>`. Does not touch keys outside the `_diag_` namespace.
 *
 * @param {string} [prefix=''] — optional sub-prefix; `''` clears all
 *   `_diag_*` keys.
 * @returns {Promise<void>}
 */
export async function clearTraces(prefix) {
  const fullPrefix = DIAG_KEY_PREFIX + (prefix ?? '');
  try {
    const all = await chrome.storage.local.get(null);
    const matched = Object.keys(all).filter((k) => k.startsWith(fullPrefix));
    if (matched.length === 0) return undefined;
    return await chrome.storage.local.remove(matched);
  } catch (err) {
    console.warn('[diag] clearTraces failed for prefix', prefix, err);
    return undefined;
  }
}
