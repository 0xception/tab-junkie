/**
 * Canonical theme slug enums for B-037 Theme Selection.
 *
 * VALID_THEME_SLUGS_WRITE — 14 slugs (1 system + 4 light + 9 dark).
 * Used by write-time validators (MSG_SET_PREFERENCES, JSON import).
 *
 * VALID_THEME_SLUGS_READ — 16 values (14 + 2 legacy aliases 'light'/'dark').
 * Used by read-time validators (assertShape on storage reads, JSON import
 * for backup-restore symmetry). Legacy values are migrated to canonical
 * slugs by getPreferences() before reaching the surface; storage is not
 * rewritten. See docs/design/45-b-037-themes.md §45.3 D-2.
 */

export const VALID_THEME_SLUGS_WRITE = Object.freeze([
  'system',
  'github-light', 'tomorrow', 'atom-one-light', 'solarized-light',
  'github-dark', 'tomorrow-night', 'atom-one-dark', 'solarized-dark',
  'dracula', 'nord', 'one-dark', 'monokai', 'tokyo-night',
]);

export const VALID_THEME_SLUGS_READ = Object.freeze(new Set([
  ...VALID_THEME_SLUGS_WRITE,
  'light',  // legacy alias → 'atom-one-light' on read
  'dark',   // legacy alias → 'one-dark' on read
]));
