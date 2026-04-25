/* Theme FOUC prevention — loaded synchronously before module scripts.
   Reads cached theme from sessionStorage (sync) and applies immediately. */
const cached = sessionStorage.getItem('tj-theme') || 'light';
document.documentElement.dataset.theme = cached;
