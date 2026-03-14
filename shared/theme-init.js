// shared/theme-init.js — Runs early in <head> to apply theme before first paint
// Must be loaded as <script src="..."> (not inline) to satisfy extension CSP
(function() {
  var TT = {
    'default':'dark','monokai':'dark','dracula':'dark','one-dark':'dark',
    'solarized-dark':'dark','nord':'dark','gruvbox-dark':'dark','tokyo-night':'dark',
    'solarized-light':'light','github-light':'light','one-light':'light','gruvbox-light':'light'
  };
  chrome.storage.local.get('junkie_preferences', function(r) {
    var t = r && r.junkie_preferences && r.junkie_preferences.theme;
    if (t && t !== 'default') document.documentElement.classList.add('theme-' + t);
    document.documentElement.setAttribute('data-theme-type', TT[t] || 'dark');
    document.documentElement.classList.add('t-ready');
  });
  setTimeout(function() { document.documentElement.classList.add('t-ready'); }, 100);
})();
