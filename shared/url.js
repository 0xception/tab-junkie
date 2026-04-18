/**
 * Shared URL normalization for Tab Junkie (B-002).
 *
 * Single source of truth for URL canonicalization across create/edit/import
 * flows and tab-matching logic. Pure function — no side effects, no chrome
 * API calls.
 */

import { StorageError, ERR_VALIDATION } from './errors.js';

/**
 * Schemes accepted at the storage boundary. Includes browser-internal and
 * developer schemes that power users legitimately bookmark. `javascript:` and
 * `data:` remain rejected — they are XSS / payload vectors.
 *
 * Note: `file:` URLs require the user to enable "Allow access to file URLs"
 * for Tab Junkie in chrome://extensions. `chrome:` / `edge:` bookmarks are
 * profile-local and not portable across browsers — expected and documented.
 *
 * B-058: expanded from ['http:', 'https:', 'file:'] to include browser-
 * internal and developer schemes per the B-057 spike (Memo 1).
 */
export const ALLOWED_URL_SCHEMES = new Set([
  'http:',
  'https:',
  'file:',
  'chrome:',
  'edge:',
  'chrome-extension:',
  'about:',
  'view-source:',
]);

/**
 * B-061: Schemes that are permanently rejected by the storage layer and surface
 * as "cannot be saved" in the UI. Kept explicit rather than derived from the
 * complement of ALLOWED_URL_SCHEMES — the UI specifically cares about the two
 * XSS vectors, not about every unknown scheme.
 *
 * SECURITY: keep this list aligned with the two schemes that `normalizeUrl`
 * rejects at the storage boundary. If a new XSS-class scheme is added (e.g.
 * `blob:text/html`), add it here too so the Open Tabs section dims those rows.
 */
const UNSAVABLE_SCHEME_PATTERN = /^(javascript|data):/i;

/**
 * Returns true when `url` has a permanently-rejected scheme (`javascript:` or
 * `data:`). Used by the sidepanel to visually dim Open Tabs rows whose URL
 * cannot be saved — a pure UI affordance layered over the SW allowlist.
 * Tolerant of non-string inputs.
 * @param {unknown} url
 * @returns {boolean}
 */
export function isUnsavableScheme(url) {
  return typeof url === 'string' && UNSAVABLE_SCHEME_PATTERN.test(url);
}

/**
 * Safe match-normalization wrapper. Returns empty string for unparseable or
 * disallowed URLs (e.g. javascript:, data:) rather than throwing.
 * Single source of truth — imported by drift.js, floating-groups.js, tab-claims.js.
 * @param {string} url
 * @returns {string}
 */
export function safeNormalizeForMatch(url) {
  if (!url) return '';
  try {
    return normalizeUrl(url, { forMatch: true });
  } catch {
    return '';
  }
}

/**
 * Normalize a raw URL string for storage or match-comparison.
 *
 * @param {string} input — raw URL string from user input
 * @param {{ forStorage?: boolean, forMatch?: boolean }} [opts]
 * @returns {string} normalized URL
 * @throws {StorageError} ERR_VALIDATION on invalid/disallowed URL
 */
export function normalizeUrl(input, opts = {}) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new StorageError(ERR_VALIDATION, 'url must be a non-empty string');
  }

  // Protocol defaulting: bare hostnames get https://
  // Detect any scheme (including opaque-path schemes like `about:` and
  // `view-source:` that don't use `://`). The regex matches the standard
  // `scheme://` form; the fallback check covers opaque schemes whose authority
  // is absent (about:blank, view-source:https://…). Without this two-part
  // check, `about:blank` would be prepended to `https://about:blank` and then
  // misparse. (F-002: avoid false positives from `://` inside query strings.)
  let raw = input;
  // SECURITY: the opaque-scheme branch below MUST stay in sync with any
  // opaque-path scheme added to ALLOWED_URL_SCHEMES. If it drifts, an input
  // like "newopaque:foo" would fall through to the https:// prefix branch
  // and be silently coerced — a scheme-substitution footgun. Keep the list
  // here (about, view-source) aligned with the Set above.
  const hasScheme =
    /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//i.test(raw) ||
    /^(about|view-source):/i.test(raw);
  if (!hasScheme) {
    raw = 'https://' + raw;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new StorageError(ERR_VALIDATION, 'url is not a valid URL', { url: input });
  }

  if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    throw new StorageError(ERR_VALIDATION, 'url scheme not allowed', { scheme: parsed.protocol });
  }

  // Lowercase hostname for consistent comparison
  parsed.hostname = parsed.hostname.toLowerCase();

  if (opts.forMatch) {
    // Strip fragment
    parsed.hash = '';
    let result = parsed.href;
    // Strip trailing slash only from path-only URLs (not query strings)
    if (result.endsWith('/') && !parsed.search) {
      result = result.slice(0, -1);
    }
    return result;
  }

  // Default / forStorage: return canonical href (keeps fragment, keeps trailing slash)
  return parsed.href;
}
