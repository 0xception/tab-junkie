# Theme/Color Selector Design

## Context

The Junkie browser extension currently has a single hardcoded dark theme. Users who spend significant time with the extension (especially via the new tab page replacement) want the ability to personalize it with familiar IDE/code editor color themes. This feature adds a theme selector to settings with 12 popular programmer themes (8 dark, 4 light), applied consistently across all extension views.

## Requirements

- Theme selector dropdown in the existing settings panel (Display Settings section)
- 12 built-in themes: 8 dark + 4 light, all popular IDE/programmer themes
- Themes apply to the entire extension: sidepanel, popup, and new tab page
- Group colors (bookmark groups) adapt per theme to match the theme's palette
- No flash of default theme on page load
- Theme preference persists via existing `chrome.storage.local` preferences system
- Theme changes broadcast to all open extension views in real-time

## Approach: CSS Class Swap

Each theme is defined as a CSS class (e.g., `.theme-dracula`) that overrides the `:root` CSS variables. On theme change, the class on `<html>` is swapped via `classList.add/remove`. The CSS cascade handles the rest instantly.

### Why this approach

- The extension already uses CSS custom properties for all colors — this extends the existing pattern
- Pure CSS application — no JS loop to set individual properties
- Naturally supports future "bring your own theme" (user provides JSON mapping of variable names to colors)
- No framework dependencies, no build step, no bundle size increase

## Theme Lineup

### Dark Themes (8)

| Theme | bg-primary | bg-secondary | text-primary | text-secondary | open-color | unbookmarked-color |
|-------|-----------|-------------|-------------|---------------|------------|-------------------|
| Junkie Default (current) | `#1a1a2e` | `#16213e` | `#e0e0e0` | `#888` | `#5bcf72` | `#cfa35b` |
| Monokai | `#272822` | `#1e1f1c` | `#f8f8f2` | `#75715e` | `#a6e22e` | `#e6db74` |
| Dracula | `#282a36` | `#21222c` | `#f8f8f2` | `#6272a4` | `#50fa7b` | `#f1fa8c` |
| One Dark (Atom) | `#282c34` | `#21252b` | `#abb2bf` | `#5c6370` | `#98c379` | `#e5c07b` |
| Solarized Dark | `#002b36` | `#073642` | `#839496` | `#586e75` | `#859900` | `#b58900` |
| Nord | `#2e3440` | `#3b4252` | `#d8dee9` | `#4c566a` | `#a3be8c` | `#ebcb8b` |
| Gruvbox Dark | `#282828` | `#1d2021` | `#ebdbb2` | `#928374` | `#b8bb26` | `#fabd2f` |
| Tokyo Night | `#1a1b26` | `#16161e` | `#a9b1d6` | `#565f89` | `#9ece6a` | `#e0af68` |

### Light Themes (4)

| Theme | bg-primary | bg-secondary | text-primary | text-secondary | open-color | unbookmarked-color |
|-------|-----------|-------------|-------------|---------------|------------|-------------------|
| Solarized Light | `#fdf6e3` | `#eee8d5` | `#657b83` | `#93a1a1` | `#859900` | `#b58900` |
| GitHub Light | `#ffffff` | `#f6f8fa` | `#24292e` | `#6a737d` | `#22863a` | `#e36209` |
| One Light (Atom) | `#fafafa` | `#f0f0f0` | `#383a42` | `#a0a1a7` | `#50a14f` | `#c18401` |
| Gruvbox Light | `#fbf1c7` | `#f2e5bc` | `#3c3836` | `#928374` | `#79740e` | `#b57614` |

**Note:** Each theme defines all CSS variables from `:root` — the tables above show the key differentiators. Additional variables defined per theme include: `--text-dimmed`, `--bg-hover`, `--border-subtle`, `--border-faint`, `--open-bg`, `--unbookmarked-bg`, `--closed-opacity`, and all `--group-*` colors. See the Dracula example below for the full set.

### Per-Theme Group Colors

Each theme provides adapted group colors via CSS variables (`--group-blue`, `--group-purple`, `--group-teal`, `--group-red`, `--group-orange`, `--group-pink`, `--group-indigo`, `--group-yellow`, `--group-slate`). Colors are chosen from each theme's official palette to ensure visual harmony.

For light themes, `--bg-hover`, `--border-subtle`, and `--border-faint` use dark alpha values (e.g., `rgba(0, 0, 0, 0.06)`) instead of white alpha values. Light themes may also adjust `--closed-opacity` for readability against light backgrounds.

### Group Color Data Model Change

**Current state:** Groups store a hardcoded hex color (e.g., `#5b91cf`) in `group.color`. The `GROUP_COLORS` array in `messages.js` maps names to hex values.

**New approach:** Groups store a **semantic color name** (e.g., `"blue"`, `"purple"`, `"teal"`) in `group.color` instead of hex values. The rendering layer resolves the name to the current theme's `--group-{name}` CSS variable. This means:

- `GROUP_COLORS` becomes a static array of `{ name: 'Blue', value: 'blue' }` (semantic names, not hex)
- The color picker in `dialogs.js` shows swatches rendered via CSS variables (`var(--group-blue)`, etc.) so they always match the active theme
- `JUNKIE_TO_CHROME_COLOR` mapping stays functional — it maps semantic names to Chrome's tab group colors (which are also named: `'blue'`, `'purple'`, etc.)
- **Migration:** On first load after update, any stored groups with hex `color` values are migrated to semantic names (reverse lookup from default theme hex → name)

## Architecture

### New Files

#### `shared/themes.css`
All 12 theme class definitions. Each class overrides the CSS variables from `:root`. Also adds a `data-theme-type` attribute selector for light/dark-specific styles.

Example (Dracula — all themes follow this pattern):

```css
.theme-dracula {
  --bg-primary: #282a36;
  --bg-secondary: #21222c;
  --bg-hover: rgba(255, 255, 255, 0.06);
  --text-primary: #f8f8f2;
  --text-secondary: #6272a4;
  --text-dimmed: #44475a;
  --border-subtle: rgba(255, 255, 255, 0.1);
  --border-faint: rgba(255, 255, 255, 0.05);
  --closed-opacity: 0.6;
  --open-color: #50fa7b;
  --open-bg: rgba(80, 250, 123, 0.04);
  --unbookmarked-color: #f1fa8c;
  --unbookmarked-bg: rgba(241, 250, 140, 0.06);
  --group-blue: #8be9fd;
  --group-purple: #bd93f9;
  --group-teal: #50fa7b;
  --group-red: #ff5555;
  --group-orange: #ffb86c;
  --group-pink: #ff79c6;
  --group-indigo: #bd93f9;
  --group-yellow: #f1fa8c;
  --group-slate: #6272a4;
}
```

#### `shared/themes.js`
Theme metadata and application logic:

```js
const THEMES = [
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

function applyTheme(themeId) {
  const el = document.documentElement;
  // Remove any existing theme class
  el.classList.forEach(c => { if (c.startsWith('theme-')) el.classList.remove(c); });
  // Apply new theme (default = no class, uses :root vars)
  if (themeId && themeId !== 'default') {
    el.classList.add(`theme-${themeId}`);
  }
  // Set data-theme-type for light/dark-specific component styles
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  el.setAttribute('data-theme-type', theme.type);
}
```

### Modified Files

#### `shared/styles.css`
Add `--group-*` variables and `--closed-opacity` to `:root` (the default theme's values):

```css
:root {
  /* existing vars unchanged */
  --group-blue: #5b91cf;
  --group-purple: #b45bcf;
  --group-teal: #5bcfbc;
  --group-red: #cf5b5b;
  --group-orange: #cf8a5b;
  --group-pink: #cf5b91;
  --group-indigo: #7b5bcf;
  --group-yellow: #cfcf5b;
  --group-slate: #8899aa;
}
```

#### `shared/messages.js`
- `GROUP_COLORS` changes to semantic names: `{ name: 'Blue', value: 'blue' }` instead of hex values
- `JUNKIE_TO_CHROME_COLOR` maps semantic names to Chrome tab group color names (both sides are now named colors, simplifying the mapping)

#### `components/bookmark-item.js`
Replace all hardcoded colors in Shadow DOM styles with CSS variables:
- `.bookmark:hover` background → `var(--bg-hover)`
- `.open-dot` background/shadow → `var(--open-color)`
- `.checkbox.checked` background/border → `var(--group-blue)` or accent variable
- `.favicon.placeholder` background/color → `var(--bg-secondary)` / `var(--text-dimmed)`
- `.favicon.unbookmarked-placeholder` background → derive from `var(--unbookmarked-color)`
- `.tooltip` background/border/color → `var(--bg-secondary)` / `var(--border-subtle)` / `var(--text-secondary)`
- `.close-btn:hover` background → `var(--bg-hover)`

CSS custom properties inherit into Shadow DOM, so this works without any special handling.

#### `components/group-header.js`
- Replace hardcoded hover color with `var(--bg-hover)`
- Read group colors from CSS variables via `var(--group-{name})` instead of `GROUP_COLORS` hex values
- Update `setProperty` calls that set `--group-color` to resolve from semantic name

#### `components/search-bar.js`
- Replace any hardcoded colors in Shadow DOM styles with CSS variables

#### `sidepanel/sidepanel.html`
- Add `<link rel="stylesheet" href="../shared/themes.css">` in `<head>`
- Add anti-flash styles and theme init script in `<head>` (see Flash Prevention below)
- Add theme dropdown to the Display Settings section

#### `sidepanel/sidepanel.js`
- Populate theme dropdown from `THEMES` array
- Handle dropdown change → send `SET_PREFERENCE` message
- On `STATE_UPDATED`, re-apply theme if preference changed

#### `sidepanel/sidepanel.css`
- Style the theme `<select>` dropdown to match existing settings items

#### `sidepanel/dialogs.js`
- Update color picker swatch rendering to use CSS variables (`var(--group-blue)`, etc.) instead of `GROUP_COLORS` hex values
- Handle semantic color names in group create/edit dialogs

#### `sidepanel/context-menu.js`
- Replace hardcoded `#cf5b5b` destructive color with `var(--group-red)` or a dedicated `--destructive-color` variable

#### `popup/popup.html`
- Add `<link rel="stylesheet" href="../shared/themes.css">` in `<head>`
- Add anti-flash styles and theme init script in `<head>`

#### `newtab/newtab.html`
- Add `<link rel="stylesheet" href="../shared/themes.css">` in `<head>`
- Add anti-flash styles and theme init script in `<head>`

#### `newtab/newtab.js`
- Read group colors from CSS variables for group card styling (semantic name → `var(--group-{name})`)

#### `background/storage.js`
- Add migration logic: on first load, convert any stored groups with hex `color` values to semantic names

**Note:** No `manifest.json` changes needed — `themes.css` and `themes.js` are loaded via HTML `<link>` and `<script>` tags, not as background scripts.

## Flash Prevention

`chrome.storage.local.get` is asynchronous and can take 50-100ms on cold start (especially the new tab page). To prevent a visible flash of the default theme:

**Strategy: Hide until themed.** Add an inline style in `<head>` that hides the page, then reveal after the theme class is applied:

```html
<style>html:not(.theme-ready) { opacity: 0; }</style>
<link rel="stylesheet" href="../shared/themes.css">
<script>
  chrome.storage.local.get('junkie_preferences', (result) => {
    const theme = result?.junkie_preferences?.theme;
    if (theme && theme !== 'default') {
      document.documentElement.classList.add(`theme-${theme}`);
    }
    const type = /* look up theme type */ 'dark';
    document.documentElement.setAttribute('data-theme-type', type);
    document.documentElement.classList.add('theme-ready');
  });
  // Safety fallback: reveal after 100ms even if storage is slow
  setTimeout(() => document.documentElement.classList.add('theme-ready'), 100);
</script>
```

The `opacity: 0` until `theme-ready` class is added ensures no flash. A 100ms safety timeout ensures the page always becomes visible even if storage has issues.

## Data Flow

### Theme Change
```
User selects "Dracula" in settings dropdown
  → JS sends SET_PREFERENCE { key: 'theme', value: 'dracula' }
  → Service worker stores in chrome.storage.local
  → Service worker broadcasts STATE_UPDATED
  → Each page listener calls applyTheme('dracula')
  → classList swap: remove old theme-*, add theme-dracula
  → CSS cascade applies all variable overrides instantly
```

### Page Load
```
Page loads → <head> contains:
  1. <style> hiding page (opacity: 0) until .theme-ready
  2. <link> to themes.css (parsed before body)
  3. Inline <script> reads chrome.storage.local,
     sets theme class + theme-ready on <html>
  4. 100ms safety timeout adds theme-ready regardless
```

## Settings UI

Theme dropdown added as the first item in Display Settings:

```
Display Settings
├── Theme: [Dracula ▾]        ← NEW dropdown
├── Open as window [toggle]
└── Replace new tab page [toggle]
```

Dropdown options grouped with `<optgroup>`:
```html
<select id="theme-select">
  <optgroup label="Dark">
    <option value="default">Junkie Default</option>
    <option value="monokai">Monokai</option>
    <option value="dracula">Dracula</option>
    <option value="one-dark">One Dark (Atom)</option>
    <option value="solarized-dark">Solarized Dark</option>
    <option value="nord">Nord</option>
    <option value="gruvbox-dark">Gruvbox Dark</option>
    <option value="tokyo-night">Tokyo Night</option>
  </optgroup>
  <optgroup label="Light">
    <option value="solarized-light">Solarized Light</option>
    <option value="github-light">GitHub Light</option>
    <option value="one-light">One Light (Atom)</option>
    <option value="gruvbox-light">Gruvbox Light</option>
  </optgroup>
</select>
```

## Implementation Notes

1. **Inline theme script cannot import `themes.js`.** The `<head>` anti-flash script runs before modules load. Either inline a small `{themeId: type}` map in the script, or hardcode a simple lookup object for the ~12 themes.

2. **Group color alpha channels.** The current `group-header.js` appends hex alpha suffixes (e.g., `${color}12` for background). This won't work with CSS variable references like `var(--group-blue)`. Use `color-mix(in srgb, var(--group-blue) 7%, transparent)` for backgrounds and `color-mix(in srgb, var(--group-blue) 40%, transparent)` for dimmed colors. `color-mix()` is supported in all Chromium 111+.

## Future Extensibility

The architecture naturally supports a future "custom theme" feature:
- User provides a JSON object mapping variable names to colors
- System applies it via `style.setProperty()` for custom themes (since they don't have pre-defined CSS classes)
- No architectural changes needed — just a new UI for importing/editing custom theme JSON

## Verification

1. **Load each theme** — Select every theme from the dropdown and verify colors apply correctly across sidepanel, popup, and new tab page
2. **Page reload** — Reload each page and verify the selected theme persists with no flash of default
3. **Multi-window sync** — Open the extension in multiple windows, change theme in one, verify all update
4. **Group colors** — Create bookmark groups and verify group colors match the active theme's palette
5. **Light theme borders** — Verify light themes use dark alpha borders/hovers (not white alpha)
6. **Default fallback** — Verify that selecting "Junkie Default" removes all theme classes and uses `:root` vars
7. **Shadow DOM components** — Verify bookmark-item, group-header, and search-bar components all respond to theme changes (no hardcoded colors visible)
8. **Group color migration** — Verify existing groups with hex colors are migrated to semantic names on first load
9. **Color picker** — Verify the group color picker in dialogs shows theme-appropriate colors
10. **Context menu** — Verify destructive action colors adapt to theme
