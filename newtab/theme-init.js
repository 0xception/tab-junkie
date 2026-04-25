/* Theme FOUC prevention — loaded synchronously before module scripts.
   Reads cached theme from sessionStorage (sync) and applies immediately.

   B-036 (Sprint 29, §42.3 D-1 / §42.4.3): byte-for-byte duplicate of
   `sidepanel/theme-init.js`. Extraction to a shared module is flagged as
   an S30+ follow-up — keeping them in lockstep is trivial given the
   6-line body. If either file drifts from the other, unify before adding
   new theme-bootstrap behaviour. */
const cached = sessionStorage.getItem('tj-theme') || 'light';
document.documentElement.dataset.theme = cached;
