/**
 * highlight.js — shared match-highlight renderer.
 *
 * Promoted from `sidepanel/sidepanel.js` (B-022 §39.4.5 / §39.2) so both the
 * sidepanel (B-021 filter) and the quick-search popup (B-022) render match
 * highlights via a single source of truth. Behaviour is byte-for-byte
 * identical to the pre-promotion sidepanel implementation — the caller receives
 * a `DocumentFragment` with matching substrings wrapped in `<mark>` elements,
 * built entirely from `document.createTextNode` + `document.createElement`
 * (no `innerHTML`, no string concatenation with user data).
 *
 * Contract:
 *   - Case-insensitive substring match; every occurrence of `query` in `text`
 *     is wrapped in a `<mark>`.
 *   - Empty or falsy `query` → fragment with a single text node containing
 *     `text` verbatim (caller can append without special-casing).
 *   - `text` is always set via `textContent` / `createTextNode`, so any HTML-
 *     or script-bearing string in the user's bookmark title or URL renders
 *     as literal text (XSS-safe by construction).
 *   - Style comes from the caller's CSS `mark { … }` rule — the tag itself
 *     carries no inline style.
 */

/**
 * Build a DocumentFragment with each case-insensitive occurrence of `query`
 * in `text` wrapped in a `<mark>` element.
 *
 * @param {string} text   Source text — treated as untrusted user content.
 * @param {string} query  Substring to highlight. Leading/trailing whitespace
 *                        is NOT trimmed here — callers trim as appropriate.
 * @returns {DocumentFragment} Fragment ready to append to any element.
 */
export function buildHighlightedText(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      frag.appendChild(document.createTextNode(text.slice(cursor)));
      break;
    }
    if (idx > cursor) {
      frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
    }
    const mark = document.createElement('mark');
    mark.textContent = text.slice(idx, idx + lowerQuery.length);
    frag.appendChild(mark);
    cursor = idx + lowerQuery.length;
  }
  return frag;
}
