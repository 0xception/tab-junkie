/**
 * Shared URL normalization for Tab Junkie (B-002).
 *
 * Single source of truth for URL canonicalization across create/edit/import
 * flows and tab-matching logic. Pure function — no side effects, no chrome
 * API calls.
 */

import { StorageError, ERR_VALIDATION } from './errors.js';

/**
 * Schemes accepted at the storage boundary. Only schemes safe for downstream
 * `<a href>` rendering are included. `javascript:`, `data:`, `chrome:` etc.
 * are rejected so stored XSS cannot originate from the storage layer.
 *
 * Note: `file:` URLs have limited functionality in MV3 — acceptable for
 * storage but may not be openable without explicit host permissions.
 */
export const ALLOWED_URL_SCHEMES = new Set(['http:', 'https:', 'file:']);

/**
 * Safe match-normalization wrapper. Returns empty string for unparseable or
 * disallowed URLs (e.g. chrome://, about:, javascript:) rather than throwing.
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
  // Use a proper scheme-detection regex to avoid false positives from '://' in
  // query strings or path segments (F-002).
  let raw = input;
  if (!/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//i.test(raw)) {
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
