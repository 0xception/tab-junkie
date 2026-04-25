/* B-037 §45.3 D-4 — shared FOUC guard for sidepanel/newtab/settings/popup.
   Sync sessionStorage read; fallback aligned with DEFAULT_PREFERENCES.theme
   per AC6. Loaded synchronously before the stylesheet so the
   `[data-theme="<slug>"]` selector resolves on first style computation.

   M-5 R4 fix: validate the cached value against an inline allow-list before
   writing it to <html>. A corrupt or attacker-tainted sessionStorage value
   (e.g. `"]/><script>…"`) would otherwise flow straight into a DOM attribute
   selector and bypass the SW-side validator. The allow-list mirrors
   shared/themes.css so any future slug additions must update both files. */
const VALID = new Set([
  'system',
  'github-light', 'tomorrow', 'atom-one-light', 'solarized-light',
  'github-dark', 'tomorrow-night', 'atom-one-dark', 'solarized-dark',
  'dracula', 'nord', 'one-dark', 'monokai', 'tokyo-night',
  'light', 'dark', // legacy aliases — kept until next-paint migration completes
]);
const cached = sessionStorage.getItem('tj-theme') || 'system';
const slug = VALID.has(cached) ? cached : 'system';
document.documentElement.setAttribute('data-theme', slug);
