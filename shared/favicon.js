/**
 * shared/favicon.js — shared favicon URL safety guard + Chrome _favicon API
 * helper (B-159 §B).
 *
 * Promoted from `sidepanel/sidepanel.js` in Sprint 26 (B-022 R4 fix)
 * so popup + sidepanel share the same scheme allowlist.
 *
 * Allowlist: `https://`, `http://`, `data:image/`, and `chrome-extension://`
 * (B-159 §B — for the Chrome `_favicon` API URLs returned by
 * `getChromeFaviconUrl(pageUrl)` below).
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
    lower.startsWith('data:image/') ||
    /* B-159 §B (S43) — Chrome's `_favicon` API returns
       chrome-extension://<our-id>/_favicon/?pageUrl=...&size=...
       URLs. These are safe to img.src — they're sandboxed within the
       extension and cannot resolve to attacker-controlled resources
       (Chrome blocks cross-extension resource loads). */
    lower.startsWith('chrome-extension://')
  );
}

/**
 * B-159 §B (S43) — build a Chrome `_favicon` API URL for a page URL. Requires
 * the `favicon` manifest permission (added at S43 close, 2026-05-03). The
 * resulting URL is suitable for img.src; passes isSafeFaviconUrl above.
 *
 * Coverage: Chrome's favicon cache backs every page Chrome has visited in any
 * tab. For never-visited URLs, the API returns Chrome's generic globe icon
 * fallback. Combined with B-159 §A (persisted Item.favIconUrl), this gives
 * three-layer fallback: live tab favicon → persisted Item favicon → Chrome
 * cache → letter-avatar.
 *
 * Returns null for invalid input. Caller should fall back to letter-avatar.
 *
 * @param {string} pageUrl  the page URL (https://example.com/path)
 * @param {number} [size=16]  icon size in CSS pixels (Chrome supports 16/24/32)
 * @returns {string|null}
 */
export function getChromeFaviconUrl(pageUrl, size = 16) {
  if (!pageUrl || typeof pageUrl !== 'string') return null;
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) return null;
  try {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', String(size));
    return url.toString();
  } catch {
    return null;
  }
}
