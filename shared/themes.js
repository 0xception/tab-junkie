// shared/themes.js — Theme metadata and application logic

export const THEMES = [
  { id: 'default', name: 'Junkie Default', type: 'dark' },
  { id: 'monokai', name: 'Monokai', type: 'dark' },
  { id: 'dracula', name: 'Dracula', type: 'dark' },
  { id: 'one-dark', name: 'One Dark (Atom)', type: 'dark' },
  { id: 'solarized-dark', name: 'Solarized Dark', type: 'dark' },
  { id: 'nord', name: 'Nord', type: 'dark' },
  { id: 'gruvbox-dark', name: 'Gruvbox Dark', type: 'dark' },
  { id: 'tokyo-night', name: 'Tokyo Night', type: 'dark' },
  { id: 'solarized-light', name: 'Solarized Light', type: 'light' },
  { id: 'github-light', name: 'GitHub Light', type: 'light' },
  { id: 'one-light', name: 'One Light (Atom)', type: 'light' },
  { id: 'gruvbox-light', name: 'Gruvbox Light', type: 'light' },
];

export function applyTheme(themeId) {
  const el = document.documentElement;
  el.classList.forEach(c => { if (c.startsWith('theme-')) el.classList.remove(c); });
  if (themeId && themeId !== 'default') {
    el.classList.add(`theme-${themeId}`);
  }
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  el.setAttribute('data-theme-type', theme.type);
}
