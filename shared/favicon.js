/**
 * shared/favicon.js — shared favicon URL safety guard.
 *
 * Promoted from `sidepanel/sidepanel.js` in Sprint 26 (B-022 R4 fix)
 * so popup + sidepanel share the same scheme allowlist. Byte-for-byte
 * equivalent to the original sidepanel helper: accepts only
 * `https://`, `http://`, and `data:image/` prefixes (case-insensitive).
 *
 * Rejects `javascript:`, `data:text/`, `chrome://`, `file://`, and any
 * unknown scheme — protecting `img.src` assignment from executable
 * protocol injection when favicon URLs originate from untrusted sources
 * (bookmark metadata, live tab state).
 */

/**
 * Returns true only for favicon URLs that are safe to assign to img.src.
 * Rejects javascript:, data:text/, and any unknown schemes.
 * @param {string} url
 * @returns {boolean}
 */
export function isSafeFaviconUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/')
  );
}
