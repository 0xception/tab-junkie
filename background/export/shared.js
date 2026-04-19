/**
 * Pure utilities shared by the HTML (B-042) and JSON (B-043) export builders.
 *
 * Zero state, zero chrome.* API usage, zero DOM access. Both functions are
 * deterministic given their inputs (except `buildFilenameWithDate`, which
 * reads `new Date()` — callers may inject a fixed date via the `today`
 * parameter for deterministic tests).
 *
 * Per SOLUTION_DESIGN §32.7, the sidepanel-side blob-download helper lives
 * inside `sidepanel/sidepanel.js` (next to the UI that owns the `Document`),
 * not here. The service worker never touches `URL.createObjectURL` / DOM.
 */

/**
 * Single-pass HTML escape, safe for both text-node and attribute-value
 * contexts (superset: &, <, >, ", '). Single-quote is included so the helper
 * remains safe even if a future template accidentally switches to
 * single-quoted attribute values.
 *
 * @param {string} text
 * @returns {string}
 */
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function htmlEscape(text) {
  return String(text).replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/**
 * Build a download filename with a local-date suffix.
 *   buildFilenameWithDate('tab-junkie-bookmarks', 'html')
 *     → 'tab-junkie-bookmarks-2026-04-18.html'
 *
 * Uses the local date per B-042 AC5 ("YYYY-MM-DD (local date)"). Tests may
 * inject a fixed `today` to avoid wall-clock flakes.
 *
 * @param {string} prefix    e.g. 'tab-junkie-bookmarks'
 * @param {string} extension e.g. 'html' or 'json' (no leading dot)
 * @param {Date} [today]     Injected date for deterministic tests.
 * @returns {string}
 */
export function buildFilenameWithDate(prefix, extension, today) {
  const d = today instanceof Date ? today : new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${prefix}-${yyyy}-${mm}-${dd}.${extension}`;
}

/**
 * Convert an epoch-ms timestamp to epoch-seconds (integer) for the Netscape
 * ADD_DATE / LAST_MODIFIED attributes.
 *
 * Per B-042 AC4: attribute values are unix-epoch seconds, not milliseconds.
 * @param {number} ms
 * @returns {number}
 */
export function toUnixSeconds(ms) {
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / 1000);
}
