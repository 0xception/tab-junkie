/**
 * surface-prefs.js — Shared theme + dense-layout DOM appliers (B-088 fix #1).
 *
 * Three of the four surfaces (sidepanel / newtab / settings) had the SAME
 * `applyTheme` and `applyDenseLayout` body — copy-pasted with minor wording
 * drift in their inline comments. The popup had its own `_applyTheme` clone
 * (no dense layout — the 320px popup ignores compact layout). B-097 set the
 * "third caller" precedent for factoring helpers into `shared/`; these two
 * helpers cross the same threshold.
 *
 * Contract:
 *   • `applyTheme(theme)` — sets `[data-theme]` on <html> and persists the
 *     slug to `sessionStorage('tj-theme')` so the FOUC guard
 *     (shared/theme-init.js) picks it up on next surface load. Returns the
 *     resolved slug so callers that track module-local theme state (e.g.
 *     sidepanel's `currentTheme` for the prefers-color-scheme reactor) can
 *     update from a single source of truth.
 *   • `applyDenseLayout(prefs)` — toggles `body.tj-dense` based on
 *     `prefs.denseLayout === true`. No-op when there is no `document.body`
 *     (defensive, matches newtab.js precedent).
 *
 * Validation: read-time validation against the canonical slug allow-list
 * lives in the FOUC guard (shared/theme-init.js) and in the SW write
 * validator (background/storage/preferences.js → VALID_THEME_SLUGS_WRITE).
 * Surface-side appliers trust the upstream contract — the SW gates writes
 * and the FOUC guard sanitises sessionStorage before the first paint.
 */

/**
 * Apply a theme slug to <html> and persist to sessionStorage.
 *
 * @param {string|undefined|null} theme Canonical theme slug (e.g. 'system',
 *   'dracula'). Missing / non-string / empty falls back to 'system'.
 * @returns {string} The resolved slug actually applied (always a non-empty
 *   string — 'system' on fallback).
 */
export function applyTheme(theme) {
  const slug = (typeof theme === 'string' && theme.length > 0) ? theme : 'system';
  document.documentElement.setAttribute('data-theme', slug);
  try { sessionStorage.setItem('tj-theme', slug); } catch { /* sessionStorage unavailable — non-fatal */ }
  return slug;
}

/**
 * Toggle the `.tj-dense` class on <body> based on the prefs snapshot.
 *
 * @param {{denseLayout?: boolean}|null|undefined} prefs Preferences snapshot.
 *   Missing / non-object / `denseLayout !== true` removes the class.
 */
export function applyDenseLayout(prefs) {
  if (!document || !document.body || !document.body.classList) return;
  const enabled = !!(prefs && prefs.denseLayout === true);
  if (enabled) {
    document.body.classList.add('tj-dense');
  } else {
    document.body.classList.remove('tj-dense');
  }
}
