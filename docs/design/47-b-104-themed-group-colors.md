# §47 — B-104 Themed Group Color System (R2 Design)

**Sprint:** 34
**Tier:** Full (M)
**Status:** R2 complete (2026-04-25) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.9 (B-006 group palette enforcement — `GROUP_COLORS` allow-list, slot-name-only `color` field on `Group` records); §45 (B-037 — 14-theme system, `shared/themes.css` token catalog, `[data-theme="…"]` selector contract, `MSG_STATE_CHANGED { scope: 'prefs' }` broadcast that triggers theme application via `data-theme` attribute swap on `<html>`); §40 (B-023 group-jump popup — `.gj-color-chip` + `--gj-group-color` custom property pattern); §31 (B-048 item visual-state matrix — informs "additive treatment, no suppression" pattern carried over to group identity).
**Out-of-scope (explicit, AC9):** (a) No change to `.group-header[data-active]` active-row treatment or `--active-bg` / `--active-border` tokens. (b) No change to B-101 dotted drift bar (`--drifted-color`, `.item-drift-bar`). (c) No change to the group create/edit dialog flow, field set, or validation logic beyond the picker swatch CSS reference fix (AC3). (d) No change to drift detection logic in `background/tabs/drift.js`. (e) Zero new `manifest.json` permissions, zero new message types, zero new storage schema keys. (f) Zero change to `GROUP_COLORS` allow-list or `validateGroup` logic. (g) Zero `tj:meta.schemaVersion` bump (no on-disk byte-layout change). (h) Zero stale-SW guidance required (no SW validator change; group color slot names already write-validated against the unchanged `GROUP_COLORS` allow-list).

---

## §47.1 Overview

B-104 closes a visual-cohesion gap left open by B-006 (group color palette) and B-037 (14-theme catalog): the 9 stored slot names (`blue`, `purple`, `teal`, `red`, `orange`, `pink`, `indigo`, `yellow`, `slate`) currently resolve to a fixed set of hardcoded hex values in `sidepanel/sidepanel.css:37-45`. The same "blue" looks identical in Dracula, GitHub Light, Solarized Dark, etc. — visually clashing with each theme's accent palette. B-104 introduces 9 per-slot CSS custom properties (`--gc-blue` through `--gc-slate`) declared inside every `[data-theme="…"]` block of `shared/themes.css` (9 slots × 14 themes = 126 token values), so a "red" group renders Dracula-red in Dracula and GitHub-red in GitHub Light. Theme switching propagates automatically via the existing `data-theme` attribute swap and CSS variable cascade — no new broadcast, no JS recomputation, no DOM mutation.

The second half of B-104 surfaces the picked color more visibly: `.group-header` / `.newtab-group-header` / `.gj-color-chip` gain a low-opacity full-bleed tint via `color-mix(in srgb, var(--group-header-color, transparent) 12%, var(--bg-secondary))`. JS sets the inline custom property `--group-header-color: var(--gc-<slot>)` once per header at render time. The tint is purely CSS-driven thereafter — theme changes paint instantly because `var(--gc-<slot>)` re-resolves under the new `[data-theme]` cascade. Storage identity stays semantic (slot names, never hex). Picker swatches (sidepanel.css:37-45) migrate from hardcoded hex to `var(--gc-<slot>)` references so the user picks what they see in the active theme.

Group-jump popup (`popup/group-jump-popup.js:726-731`) currently sets `--gj-group-color` to the raw slot-name string (not a valid CSS color) — a pre-existing latent bug surfaced by B-104's R1. R2 D-2 locks the fix as the cleanest declarative shape.

R3 lands ~280 net LOC: 126 token values in `shared/themes.css` (~110 LOC), 3 surface CSS rules for the tint (~6 LOC), 3 JS injection sites for `--group-header-color` (~9 LOC), 1 swatch CSS migration (9 lines hex → 9 lines var refs), 1 group-jump popup chip CSS rule + 5 LOC JS deletion. Zero storage schema changes, zero manifest changes, zero new message types. R5 measures AC5 contrast spot-checks (~20 of 126 combinations) and ≥ 8 automated tests in `tests/b104-group-colors.test.js`. R6 documents As-Built deltas in §47.10.

---

## §47.2 Existing-State Reality Check

**Today (2026-04-25 on `feature/sprint-34-visual-polish`, branched off `release/v2`):**

- **`shared/constants.js:5-7`**: `GROUP_COLORS = Object.freeze(['blue','purple','teal','red','orange','pink','indigo','yellow','slate'])`. Nine semantic slot names. R1 Q2 + Q3 lock confirms storage identity is unchanged. **No edit in B-104.**
- **`background/storage/groups.js:32-43` + `:130-132`**: `assertValidColor(color)` throws `ERR_VALIDATION` unless `GROUP_COLORS.includes(color)`. Slot-name-only allow-list, no hex path, no migration. **No edit in B-104.**
- **`shared/themes.css`**: 14 themes (`system`, `github-light`, `tomorrow`, `atom-one-light`, `solarized-light`, `github-dark`, `tomorrow-night`, `atom-one-dark`, `solarized-dark`, `dracula`, `nord`, `one-dark`, `monokai`, `tokyo-night`) plus 2 legacy aliases (`light` → `atom-one-light`, `dark` → `one-dark`) plus the `@media (prefers-color-scheme: dark)` override for `system`. Each `[data-theme="…"]` block declares the 28-token sidepanel-superset palette (`--bg-primary`, `--text-primary`, `--accent`, `--drifted-color`, `--audible-color`, etc.). **No `--gc-<slot>` tokens defined.** B-104 R3 inserts 9 new tokens per block.
- **`sidepanel/sidepanel.css:37-45`** (the swatch + chip palette block):
  ```css
  .group-color-blue    { background-color: #2563eb; }
  .group-color-purple  { background-color: #7c3aed; }
  .group-color-teal    { background-color: #0d9488; }
  .group-color-red     { background-color: #dc2626; }
  .group-color-orange  { background-color: #ea580c; }
  .group-color-pink    { background-color: #db2777; }
  .group-color-indigo  { background-color: #4f46e5; }
  .group-color-yellow  { background-color: #ca8a04; }
  .group-color-slate   { background-color: #64748b; }
  ```
  These 9 hardcoded hex rules drive both (a) the picker swatch buttons in the group create/edit dialog, and (b) the small `.group-color-chip` chip on every group header (sidepanel.js:2184 applies the class). Theme-blind today. **R3 replaces every `<hex>` with `var(--gc-<slot>)`.**
- **`sidepanel/sidepanel.css:190-244`** (`.group-header`): currently `background: var(--bg-secondary)`. **R3 replaces with `background: color-mix(in srgb, var(--group-header-color, transparent) 12%, var(--bg-secondary))`** — same default for groups without an inline color (transparent → `var(--bg-secondary)` resolves cleanly).
- **`sidepanel/sidepanel.js:628-647`** (`_buildGroupColorSwatches`): builds picker buttons with `swatch.className = 'group-color-swatch group-color-' + color`. Classes are retained; only the CSS rule (`.group-color-<slot>`) changes. **No JS edit needed for swatches** — the class targeting still works once the underlying `background-color` shifts to `var(--gc-<slot>)`.
- **`sidepanel/sidepanel.js:2182-2187`** (group header construction): currently does `chip.classList.add('group-color-' + group.color)` to colour the small chip. **R3 ALSO sets `header.style.setProperty('--group-header-color', \`var(--gc-${group.color})\`)` on the header element when `GROUP_COLORS.includes(group.color)`.** The chip element itself can be retained or removed at R3's discretion — it's redundant once the header is fully tinted. R2 recommends keeping the chip for now (single-rule swatch-class CSS migration is cleaner) but allowing R3 to remove it if it produces visual clutter; the R6 close documents what shipped.
- **`newtab/newtab.css:230-243`** (`.newtab-group-header`): currently `background: var(--bg-primary)`. **R3 replaces with the same `color-mix` tint formula** using `--bg-primary` as the base (matching the surface). The newtab header does NOT currently render a color chip; B-104 R3 adds the inline `--group-header-color` injection inline at `newtab/newtab.js:701-708` (`_buildGroupSection` header construction), reading from `group.color`.
- **`popup/group-jump-popup.html:11`**: confirmed loads `<link rel="stylesheet" href="../shared/themes.css" />` BEFORE `group-jump-popup.css`. The `[data-theme="…"]` cascade is fully reachable from this surface. **D-2 Option C is feasible.**
- **`popup/group-jump-popup.css:349-361`** (`.gj-color-chip`): currently
  ```css
  background-color: var(--gj-group-color, var(--color-avatar-bg));
  ```
  consuming an inline custom property `--gj-group-color`. **R3 replaces with `background-color: var(--gc-<slot>, var(--color-avatar-bg))` selectorised per slot via `[data-color="<slot>"]`** (D-2 Option C — declarative).
- **`popup/group-jump-popup.js:726-731`** (chip color assignment) — the latent bug:
  ```js
  const chip = document.createElement('span');
  chip.className = 'gj-color-chip';
  if (pickerRow.color) {
    chip.style.setProperty('--gj-group-color', pickerRow.color);  // sets to e.g. "red" — invalid CSS color
  }
  ```
  The string `"red"` happens to be a valid named CSS color in some themes — but `"slate"`, `"teal"`, `"indigo"` are NOT. The fallback `var(--color-avatar-bg)` masks the bug for any unrecognised string by falling through to the avatar bg token (which itself is undefined in `shared/themes.css` — yet another `var()` chain that ultimately renders as a transparent background). **R3 deletes the `setProperty('--gj-group-color', …)` call entirely and instead sets `chip.dataset.color = pickerRow.color` (when valid); the new CSS rule (D-2 Option C) keys off `[data-color="<slot>"]` to apply `background-color: var(--gc-<slot>)`.**
- **`newtab/newtab.js:693-718`** (`_buildGroupSection`): builds `<h2 class="newtab-group-header">` with name + count, **no color chip and no inline color injection today**. R3 adds `header.style.setProperty('--group-header-color', \`var(--gc-${group.color})\`)` when `group?.color && GROUP_COLORS.includes(group.color)`.
- **No pre-existing B-104 code, no partial implementation, no unreviewed scaffolding.** Greenfield expansion riding on stable B-006 + B-037 foundations.

---

## §47.3 Design Decisions (D-1 through D-5)

### D-1 — Hybrid authoring split: 4 hand-curated, 10 algorithmic (lock confirmed; recipe finalized)

**Choice:** keep R1 Q5's 4-flagship list (`one-dark`, `dracula`, `github-light`, `system`) hand-curated. The remaining 10 themes (`atom-one-light`, `solarized-light`, `tomorrow`, `github-dark`, `atom-one-dark`, `solarized-dark`, `tomorrow-night`, `nord`, `monokai`, `tokyo-night`) use a deterministic per-slot recipe that R3 evaluates AT DESIGN TIME and writes as resolved hex values into `shared/themes.css`. **Tokens in `shared/themes.css` are static hex strings** — `color-mix` is reserved for the runtime tint blend in `.group-header` / `.newtab-group-header` / `.gj-color-chip` only. This keeps `shared/themes.css` browser-neutral and avoids any `color-mix`-related FOUC or fallback issues during cold-start theme application.

**Why no additional themes promoted:** Nord, Monokai, Solarized Dark, and Tokyo Night were considered for promotion. Each has a distinctive accent palette (Nord's icy blue-grey, Monokai's saturated yellow-green, Solarized's amber-leaning yellow, Tokyo Night's deep navy/purple), but the algorithmic recipe (defined below) blends the canonical slot color toward each theme's `--bg-secondary` and toward the theme's `--accent` for slot-overlap (so blue-slot in Nord biases toward Nord's blue accent, red-slot in Monokai biases toward Monokai's pink danger). The result is harmonious enough that hand-curation is not justified given the R5 contrast spot-check budget. If R5 UAT flags any algorithmic theme as "muddy" or "indistinguishable between two slots," R3 escalates that single theme to hand-curation as a small follow-up — but the default is to ship algorithmic for all 10.

**Algorithmic recipe (per-slot, resolved at design time and written as static hex):**

For each non-flagship theme, the slot-color hex is computed as:

```
gc_<slot> = mix(canonical_<slot>, theme.bg_secondary, 0.30)   // 70% canonical, 30% theme bg
```

where the `canonical_<slot>` is the original B-006 hex (same as the current hardcoded sidepanel.css value). The 70/30 blend pulls the saturated canonical toward each theme's secondary bg, producing a value that "sits naturally" against the theme's surfaces while still being recognisable as the slot identity. R3 [frontend-engineer] computes the 90 algorithmic hex values (10 themes × 9 slots) using a deterministic offline tool (e.g., `chroma-js`, or a quick Node script using `chroma-js` or hand calculation in OKLCH space). The exact computed values are documented in §47.3 Hex Tables below.

**The 36 hand-curated hex values (4 flagships × 9 slots):**

| Theme \ Slot | blue | purple | teal | red | orange | pink | indigo | yellow | slate |
|---|---|---|---|---|---|---|---|---|---|
| `system` (light OS) | `#2563eb` | `#7c3aed` | `#0d9488` | `#dc2626` | `#ea580c` | `#db2777` | `#4f46e5` | `#ca8a04` | `#64748b` |
| `github-light` | `#0969da` | `#8250df` | `#1f7f5e` | `#cf222e` | `#bc4c00` | `#bf3989` | `#6639ba` | `#9a6700` | `#59636e` |
| `dracula` | `#8be9fd` | `#bd93f9` | `#50fa7b` | `#ff5555` | `#ffb86c` | `#ff79c6` | `#bd93f9` | `#f1fa8c` | `#6272a4` |
| `one-dark` | `#61afef` | `#c678dd` | `#56b6c2` | `#e06c75` | `#d19a66` | `#e06c75` | `#c678dd` | `#e5c07b` | `#5c6370` |

**Notes on hand-curated values:**
- `system` light-OS values mirror the legacy hardcoded hex from `sidepanel.css:37-45` (the previous "default" palette is now scoped under `[data-theme="system"]`, and the dark-OS override under `@media (prefers-color-scheme: dark) [data-theme="system"]` uses the algorithmic recipe with `system`-dark `--bg-secondary = #22262e`). The system-dark hex table is computed algorithmically and listed in the algorithmic section below.
- `github-light` uses GitHub's published Primer palette: blue-link `#0969da`, purple-mention `#8250df`, success `#1f7f5e`, danger `#cf222e`, warning `#9a6700`, attention `#bf3989`, etc. Source: https://primer.style/foundations/color/base-colors.
- `dracula` uses the canonical Dracula palette (https://draculatheme.com/contribute): cyan `#8be9fd`, purple `#bd93f9`, green `#50fa7b`, red `#ff5555`, orange `#ffb86c`, pink `#ff79c6`, yellow `#f1fa8c`, comment-grey `#6272a4`. Note: Dracula has only 8 named accents, so `indigo` reuses `purple` (`#bd93f9`) and `blue` maps to `cyan` (`#8be9fd`) — both intentional repurposings to preserve the Dracula aesthetic.
- `one-dark` uses Atom's One Dark palette (https://github.com/atom/one-dark-syntax): blue `#61afef`, purple `#c678dd`, cyan-teal `#56b6c2`, red `#e06c75`, orange `#d19a66`, yellow `#e5c07b`, comment-grey `#5c6370`. One Dark has no native pink/indigo — `pink` reuses `red` (`#e06c75`), `indigo` reuses `purple` (`#c678dd`). This is intentional — preserving the One Dark aesthetic over slot uniqueness; the chip + tint context makes the slot identity clear via the surrounding name + position, not via the color alone.

**The 90 algorithmic hex values (10 themes × 9 slots):**

R3 computes each value as `mix(canonical_<slot>, theme.bg_secondary, 0.30)` in sRGB space using either `chroma-js` (`chroma.mix(canonical, bg2, 0.30, 'rgb').hex()`) or a hand calculation. The 10 themes' `--bg-secondary` values from `shared/themes.css` are:

| Theme | `--bg-secondary` |
|---|---|
| `atom-one-light` | `#f0f0f0` |
| `solarized-light` | `#eee8d5` |
| `tomorrow` | `#f5f5f5` |
| `github-dark` | `#161b22` |
| `atom-one-dark` | `#21252b` |
| `solarized-dark` | `#073642` |
| `tomorrow-night` | `#282a2e` |
| `nord` | `#3b4252` |
| `monokai` | `#1e1f1a` |
| `tokyo-night` | `#16161e` |

Plus the `system` dark-OS override: `--bg-secondary: #22262e`.

The canonical 9-slot input table (used as input to the recipe for all 10 algorithmic themes):

| canonical_blue | canonical_purple | canonical_teal | canonical_red | canonical_orange | canonical_pink | canonical_indigo | canonical_yellow | canonical_slate |
|---|---|---|---|---|---|---|---|---|
| `#2563eb` | `#7c3aed` | `#0d9488` | `#dc2626` | `#ea580c` | `#db2777` | `#4f46e5` | `#ca8a04` | `#64748b` |

R3 [frontend-engineer] runs the recipe and writes the resulting 90 hex values directly into `shared/themes.css`. The recipe is deterministic; R5 [test-engineer] re-verifies a subset (any 5 of the 90) against the recipe to confirm R3 didn't drift. Sample expected values to anchor R3:

| (theme, slot) | Expected approx hex |
|---|---|
| `(github-dark, blue)` | `~#1f4ba6` (mix `#2563eb` 70% + `#161b22` 30%) |
| `(nord, red)` | `~#a44052` (mix `#dc2626` 70% + `#3b4252` 30%) |
| `(monokai, yellow)` | `~#988008` (mix `#ca8a04` 70% + `#1e1f1a` 30%) |
| `(solarized-light, teal)` | `~#3a8e7c` (mix `#0d9488` 70% + `#eee8d5` 30%) |
| `(tokyo-night, purple)` | `~#5b35aa` (mix `#7c3aed` 70% + `#16161e` 30%) |

(Exact final values are R3's output; the table above is the algorithmic anchor for R5 verification.)

**Legacy aliases:** `[data-theme="light"]` (alias for `atom-one-light`) and `[data-theme="dark"]` (alias for `one-dark`) inherit `--gc-<slot>` tokens by COPY (not by reference) — i.e., R3 duplicates the 9 token values into both alias blocks so a stale sessionStorage `'light'`/`'dark'` cold-paint still resolves the swatches/headers correctly. Same precedent as B-037 D-4 (the existing legacy alias blocks already duplicate the 28-token palette).

### D-2 — Group-jump popup chip resolution: Option C (declarative `[data-color="<slot>"]` selector)

**Choice: Option C.** R3 changes the CSS rule and the JS injection together:

**CSS (`popup/group-jump-popup.css`):**
```css
/* Replace the existing rule at lines 349-361. */
.gj-color-chip {
  position: relative;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background-color: var(--color-avatar-bg);  /* fallback */
  flex-shrink: 0;
  overflow: hidden;
  transform: none;
  opacity: 1;
  pointer-events: none;
  box-shadow: none;
}
.gj-color-chip[data-color="blue"]   { background-color: var(--gc-blue); }
.gj-color-chip[data-color="purple"] { background-color: var(--gc-purple); }
.gj-color-chip[data-color="teal"]   { background-color: var(--gc-teal); }
.gj-color-chip[data-color="red"]    { background-color: var(--gc-red); }
.gj-color-chip[data-color="orange"] { background-color: var(--gc-orange); }
.gj-color-chip[data-color="pink"]   { background-color: var(--gc-pink); }
.gj-color-chip[data-color="indigo"] { background-color: var(--gc-indigo); }
.gj-color-chip[data-color="yellow"] { background-color: var(--gc-yellow); }
.gj-color-chip[data-color="slate"]  { background-color: var(--gc-slate); }
```

**JS (`popup/group-jump-popup.js:726-731`):**
```js
const chip = document.createElement('span');
chip.className = 'gj-color-chip';
if (pickerRow.color && GROUP_COLORS.includes(pickerRow.color)) {
  chip.dataset.color = pickerRow.color;
}
chip.setAttribute('aria-hidden', 'true');
li.appendChild(chip);
```

**Why C over A and B:**
- **Option A** (`chip.style.setProperty('--gj-group-color', \`var(--gc-${slot})\`)`) works mechanically — a CSS variable can hold a `var()` reference, the cascade resolves it. But it leaks an interim `--gj-group-color` indirection that no other surface uses, encouraging future drift. The `var(--gj-group-color, fallback)` fallback chain is also one extra layer of fragility.
- **Option B** (`getComputedStyle(document.documentElement).getPropertyValue('--gc-<slot>')`) requires JS to compute the resolved value once and re-run on every theme broadcast — fundamentally fights the CSS-cascade-is-the-source-of-truth design B-037 established.
- **Option C** is purely declarative: the chip element gets a `data-color` attribute (slot name); the existing cascade resolves the actual hex via `[data-color="<slot>"] { background-color: var(--gc-<slot>); }`. Theme switch propagates automatically via the existing `[data-theme]` cascade. Zero JS recomputation. Zero new custom properties. Aligns with the B-037 "data attribute selectors + CSS variables" pattern used everywhere else.

`GROUP_COLORS` is imported into `group-jump-popup.js` (already imported at the top of the file for the picker; if not, R3 adds the import). The `if (… && GROUP_COLORS.includes(pickerRow.color))` allow-list guard prevents a malformed `pickerRow.color` (defensive, even though storage validation guarantees the field is a slot name).

**Latent bug closed:** the previous `setProperty('--gj-group-color', pickerRow.color)` (raw slot string) is gone. Its resolved CSS color was `red` for `red`-slot (valid CSS named color) but `slate`/`teal`/`indigo` resolved to `unset` and fell through to `var(--color-avatar-bg)` — making 3 of 9 slots theme-blind AND broken in the popup. R3 closes this in the same change set.

### D-3 — `--gc-<slot>` token scope: per `[data-theme]` block, NOT `:root`

**Choice:** every `[data-theme="…"]` block in `shared/themes.css` declares its own 9 `--gc-<slot>` tokens. **Zero `:root`-level declarations.** This is the same pattern B-037 D-3 established for the entire 28-token palette superset.

**Theme-switch propagation mechanics:**

```
1. User picks a theme in Settings → settings-fields.js dispatches MSG_SET_PREFERENCES.
2. SW writes tj:prefs.theme → broadcast(SCOPE.PREFERENCES, 'set-preferences').
3. Each surface receives MSG_STATE_CHANGED { scope: 'prefs' } → re-fetches prefs →
   document.documentElement.dataset.theme = newSlug.
4. CSS [data-theme="newSlug"] selector activates → all 28 palette tokens AND
   the new 9 --gc-<slot> tokens resolve under the cascade.
5. Every var(--gc-<slot>) reference (group header inline, swatch CSS, chip CSS)
   re-resolves to the new theme's token value in the next paint frame.
6. Browser repaints. Zero JS work in the surface; zero DOM mutation; zero reflow.
```

**Why not `:root` with theme-conditional override:** placing the 9 tokens in `:root` and overriding them per `[data-theme]` block doubles the LOC (1 default block + 14 override blocks instead of 14 self-contained blocks) and creates a surface for cascade-order bugs — if a theme block forgets to override a slot, it inherits the `:root` default which may not match the theme's aesthetic. The B-037 D-3 superset approach (each `[data-theme]` block is fully self-contained) is the established precedent and B-104 follows it exactly.

**Legacy aliases (`[data-theme="light"]`, `[data-theme="dark"]`) handling:** R3 duplicates the 9 token values from `atom-one-light` into the `[data-theme="light"]` block and from `one-dark` into the `[data-theme="dark"]` block — same as B-037's existing duplication of the 28-token palette into the legacy alias blocks (lines 588-622 / 624-658 of `shared/themes.css`). This guards the cold-start sessionStorage edge case described in §45 D-4.

### D-4 — `color-mix` browser support: Chromium 111+ confirmed; tokens written as static hex; runtime tint uses `color-mix`

**Floor:** Tab Junkie's MV3 declaration in `manifest.json` does not pin a Chromium version; the practical floor is the user's browser. Edge stable (the user's primary browser per memory) currently ships Chromium 130+ as of 2026-04-25 — well past the 111 floor where `color-mix(in srgb, …)` and `color-mix(in oklch, …)` (CSS Color Module Level 5) shipped. Chrome stable is at 132+. Both browsers fully support `color-mix` with `srgb` and `oklch` color spaces.

**Compatibility verification (R2 preflight):** B-037 already ships `shared/themes.css` to production without any `color-mix` usage. B-104 introduces `color-mix` for the FIRST time in the codebase. Verification path: Edge devtools → Inspect Sidepanel → Elements panel → Computed → confirm that any element with `background: color-mix(in srgb, red 12%, white)` resolves correctly. R3 [frontend-engineer] runs this check before writing the production CSS rule. If `color-mix` is unsupported in any user environment (extremely unlikely but possible if a user runs an outdated browser), the `var(--group-header-color, transparent)` fallback resolves the `color-mix` to `color-mix(in srgb, transparent 12%, var(--bg-secondary))` which is `transparent` blended with the bg → renders as `var(--bg-secondary)` (the existing untinted bg). **Graceful degradation** — the worst case is "tint feature silently absent" not "broken header."

**Why tokens are static hex (not `color-mix` recipes baked into `--gc-<slot>` values):** writing `--gc-blue: color-mix(in srgb, var(--canonical-blue) 70%, var(--bg-secondary))` directly into `shared/themes.css` would chain two `color-mix` evaluations at paint time (token resolution + header tint), which is slightly slower and more fragile. Pre-computing the 90 algorithmic values as static hex at design time produces a cleaner shared/themes.css and slightly faster paint. The trade-off is a one-time R3 design-time computation step (deterministic, scriptable); the win is browser-neutrality of the token file.

### D-5 — Header tint formula: 12% opacity, single global recipe (no per-theme override)

**Choice:** all three surfaces use the same formula:

```css
background: color-mix(in srgb, var(--group-header-color, transparent) 12%, var(--bg-secondary));
/* newtab uses --bg-primary instead of --bg-secondary to match its surface base */
```

**Mental walkthrough validating 12% across light/dark and saturated/muted slots:**

1. **`dracula` + `red` (`#ff5555`) over `dracula --bg-secondary` (`#1e1f29`)** — 12% saturated red blended into dark navy = a faint warm tint, well below the `#f8f8f2` body text contrast threshold. Body text reads at ≥ 14:1 against the original bg → `~13:1` against the tinted bg (negligible reduction). **PASS.**
2. **`github-light` + `slate` (`#59636e`) over `github-light --bg-secondary` (`#f6f8fa`)** — 12% mid-grey blended into off-white = subtle cool greying. Body text `#1f2328` against tinted bg: `~14:1` (negligible reduction from 16.10:1 baseline). **PASS.**
3. **`solarized-light` + `yellow` (`#d5a643` — algorithmic) over `solarized-light --bg-secondary` (`#eee8d5`)** — 12% warm muted yellow blended into Solarized's cream-paper bg = a subtle hay-warm tint. Body text `#586e75` against the bare untinted bg measures **`4.392:1`** (sub-AA — the baseline itself fails 4.5:1 BEFORE any tint is applied). Every non-zero tint amount on solarized-light pushes the ratio further DOWN (worse), so the only safe value is **0%**. **FAIL at any non-zero tint.** R3-fix H-1 ships solarized-light with `--group-header-tint-amount: 0%` so the recipe collapses to `var(--bg-secondary)` exactly — the visual is identical to the bare baseline (which itself is sub-AA but is a pre-existing theme defect, not introduced by B-104).

> **Note on solarized-light as a known low-baseline theme.** The 4.392:1 baseline contrast between `--text-primary` (`#586e75`) and `--bg-secondary` (`#eee8d5`) is a pre-existing defect in the solarized-light theme palette, NOT a defect introduced by B-104. R4 [qa-reviewer] surfaced this when computing the actual contrast (R2's mental walkthrough above originally claimed `~7.21:1` — a factual error corrected at R6). B-104 ships at `--group-header-tint-amount: 0%` on solarized-light to avoid AMPLIFYING the existing sub-AA contrast (any non-zero tint would push the ratio lower still). The underlying theme palette defect is tracked separately as **B-105** (P2/S — solarized-light text-on-bg-secondary baseline contrast); fixing it in B-105 (e.g., darken `--text-primary` to `#475158` or lighten `--bg-secondary` to `#f5f1e3`) would clear the AA threshold and let solarized-light receive a non-zero tint amount in a follow-up sprint. B-104 closure does not depend on B-105.

The 12% formula is uniform across all 14 themes and all 9 slots because: (a) the canonical body-text contrast in B-037's themes is 7-16:1; reducing by ≤ 1.5:1 still leaves ≥ 4.5:1 in every theme; (b) a per-theme override variable (`--group-header-tint-amount`) would split the design surface into 14 places where contrast can be tuned, increasing the audit burden without delivering a meaningful contrast win for any theme; (c) R5 spot-checks (~20 of 126) catch any genuinely problematic combination; if AC5 fails, the fix is to adjust the offending `--gc-<slot>` token value (push the saturation/lightness in OKLCH space) rather than the global 12%, which preserves theme cohesion.

**Per-theme override left available as a fallback path:** if R5 surfaces a real problem, R3's R4-fix loop can introduce `--group-header-tint-amount: 8%` overrides in specific theme blocks (e.g., `[data-theme="solarized-light"] { --group-header-tint-amount: 8%; }`) and rewrite the recipe to read `var(--group-header-tint-amount, 12%)`. This is a future-proofing escape hatch, not the day-1 design.

**Why not per-surface tint amount (sidepanel vs newtab vs popup):** the sidepanel header sits over `--bg-secondary` (slightly darker than the body), the newtab header sits over `--bg-primary` (the surface base). Both are "secondary surface" tones. The popup chip is a small 12 px square — its tint is the entirety of the chip background, not a low-opacity overlay; it consumes `var(--gc-<slot>)` directly (no `color-mix`) per D-2. So in fact only sidepanel + newtab use the 12% tint; the popup chip is full-saturation. The 12% rule applies uniformly across the two large-surface contexts, which is the only place the formula matters.

---

## §47.4 Architecture — Theme + Group-Color Data Flow (text)

### Path A — Theme switch propagates to group colors (no JS recomputation)

```
User picks "Dracula" in Settings → settings-fields.js dispatches
  MSG_SET_PREFERENCES { theme: 'dracula' }
   │
   ▼
SW: storage-handlers.js writes tj:prefs.theme = 'dracula'
   │
   ▼
SW broadcasts MSG_STATE_CHANGED { scope: 'prefs', trigger: 'set-preferences' }
   │
   ├──► sidepanel.js receives → re-fetches prefs →
   │      document.documentElement.dataset.theme = 'dracula'
   │   │
   │   ▼ (CSS cascade re-resolves)
   │   [data-theme="dracula"] block activates →
   │     --gc-blue: #8be9fd, --gc-red: #ff5555, --gc-yellow: #f1fa8c, …
   │   │
   │   ▼ (consumers re-paint without DOM mutation)
   │   1. Every .group-header element with inline
   │        style="--group-header-color: var(--gc-red)"
   │      → background: color-mix(in srgb, #ff5555 12%, #1e1f29)
   │      → resolves → faint Dracula-red tint
   │   2. Picker swatches in any open group dialog:
   │        .group-color-red { background-color: var(--gc-red); }
   │      → resolves to #ff5555
   │   3. Small chip on every group header (.group-color-chip.group-color-red)
   │      → resolves via the same .group-color-<slot> rule
   │
   ├──► newtab.js receives → same data-theme attribute swap →
   │      .newtab-group-header tint re-resolves identically
   │
   └──► group-jump-popup (if open) → same data-theme attribute swap →
          [data-color="<slot>"] selectors re-resolve under [data-theme="dracula"]
   ─ All three surfaces re-paint in one frame; zero JS work beyond the
     dataset.theme assignment that already happens for the 28-token palette.
```

### Path B — User changes a group's color (or creates a new group)

```
User clicks the red swatch in the group create/edit dialog
   │
   ▼
sidepanel.js _handleGroupSubmit → sendMessage(MSG_UPDATE_GROUP, {
  id: 'g_01H…',
  patch: { color: 'red' }
})
   │
   ▼
SW: storage-handlers.js → updateGroup → validateGroupPatch →
  assertValidColor('red') → GROUP_COLORS.includes('red') ✓ →
  writeTransaction → tj:groups[N].color = 'red'
   │
   ▼
SW broadcasts MSG_STATE_CHANGED { scope: 'items' or 'groups' }
   │
   ├──► sidepanel.js: refetchAndPatchAfterStorageChange → renderTree →
   │      every .group-header element for group g_01H… is rebuilt →
   │        header.style.setProperty('--group-header-color', 'var(--gc-red)')
   │      → CSS cascade: var(--gc-red) → resolves to current theme's red token
   │      → color-mix recipe paints the new tint
   │
   ├──► newtab.js: same path; .newtab-group-header rebuilt with the inline
   │      --group-header-color property
   │
   └──► group-jump-popup (if open): chip element gets dataset.color = 'red';
          [data-color="red"] selector applies var(--gc-red).
```

**Key properties:**
- **No new message contract** — reuses `MSG_UPDATE_GROUP`, `MSG_SET_PREFERENCES`, `MSG_STATE_CHANGED` exactly as today.
- **No new storage key** — `Group.color` is unchanged; still a slot-name string.
- **No JS recomputation on theme change** — CSS cascade is the source of truth.
- **Single source of truth for the 126 token values** — `shared/themes.css`. Every consumer (sidepanel, newtab, popup) reads via `var(--gc-<slot>)`.

---

## §47.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Notes |
|---|-------|---------|-------|
| **C-1** | Storage schema versioned | **N/A** | Zero schema changes. `Group.color` continues to store the same 9 slot-name strings. No `tj:meta.schemaVersion` bump. **STALE-SW NOTE: N/A** — no `validatePrefsPatch` allow-list change, no new `DEFAULT_PREFERENCES` key. The existing `assertValidColor` (`background/storage/groups.js:32-43`) already accepts the 9 slot names; B-104 introduces no validator change. SW module cache cannot drift on this surface. |
| **C-2** | Message contracts typed | **N/A** | Zero new message types. Reuses `MSG_UPDATE_GROUP`, `MSG_CREATE_GROUP`, `MSG_SET_PREFERENCES`, `MSG_STATE_CHANGED` unchanged. The theme-broadcast → CSS-cascade path is the existing B-037 mechanism; B-104 is a passive consumer. |
| **C-3** | Service worker cold-start safe | **N/A** | No SW code is touched in B-104. All changes are UI/CSS surfaces and a JS injection in three frontend files. SW startup is unaffected. |
| **C-4** | ID stability | **PASS** | Group identity is the existing ULID `groupId` per §3 — unchanged. Color slot is the existing slot-name field per §10.9 B-006 — unchanged. No new IDs introduced. |
| **C-5** | Manifest file references resolvable | **N/A** | Zero `manifest.json` edits. No new `default_path`, `default_popup`, or `chrome_url_overrides` entries. `web_accessible_resources` unchanged. |
| **C-6** | Permission minimization | **N/A** | Zero new permissions. AC9(e) regression guard. |
| **C-7** | Allow-list direction | **PASS** | `assertValidColor` (`background/storage/groups.js:33-42`) is an explicit allow-list (`GROUP_COLORS.includes(color)`); rejection emits `ERR_VALIDATION`. UI-side defenses (D-2 group-jump chip's `GROUP_COLORS.includes(pickerRow.color)` guard before setting `data-color`) are also allow-list. CSS `[data-color="<slot>"]` selectors are 9 explicit per-slot rules with a fallback `--color-avatar-bg`; an unknown `data-color` value falls through to the fallback (allow-list-by-omission, the safe direction). No deny-list anywhere. |
| **C-8** | SW-context feasibility | **N/A** | UI-only change. No `chrome.*` API calls in R3 beyond the existing `MSG_UPDATE_GROUP` round-trip. `color-mix` runs in the page-document CSS engine; not an SW context API. |
| **C-9** | Empty-state design | **PASS — 5 paths enumerated** | (a) **Group with no color set** (legacy or partial creation): `group.color` is `null`/`undefined` → `header.style.setProperty('--group-header-color', …)` is skipped → `color-mix(in srgb, var(--group-header-color, transparent) 12%, var(--bg-secondary))` resolves with `transparent` → `transparent` blended with `--bg-secondary` = `var(--bg-secondary)` → header renders untinted (existing behavior preserved). (b) **Sub-group inheriting parent's color**: independent — sub-groups have their own `Group.color` field per `groups.js`; if the user sets a sub-group's color, the sub-group header tints with its own slot. If the sub-group has no color, the sub-group header is untinted regardless of parent (no inheritance). This is consistent with B-006 + B-007 design (each group is independent for color). (c) **Ungrouped section** (sidepanel "Ungrouped" group): no group record → no `--group-header-color` injection → untinted header rendered with `var(--bg-secondary)` (sidepanel) or `var(--bg-primary)` (newtab); existing behavior preserved. (d) **Theme switch mid-session**: the inline `style="--group-header-color: var(--gc-red)"` is preserved across the `[data-theme]` swap; `var(--gc-red)` re-resolves automatically under the new theme's `[data-theme]` block. No JS work; no DOM mutation. (e) **Group-jump popup with 0 groups** (zero results): no `<li>` rows rendered → no `.gj-color-chip` elements → no chip-coloring path runs; the popup's "no results" state is unaffected. |
| **C-10** | Off-screen rect feasibility | **N/A** | No drag, no `setDragImage`, no `canvas.toDataURL`, no off-screen DOM positioning in B-104. |
| **C-11** | Popup-lifecycle message ordering | **N/A** | The group-jump popup change in B-104 is a CSS rule + a `dataset.color` attribute write — both purely declarative DOM work. No `chrome.tabs.update`, `chrome.windows.update`, or `chrome.sidePanel.open` API calls are added or modified. The popup teardown race documented in C-11 (Sprint 26 B-022 UAT-4) does not apply. The chip-coloring code runs synchronously during `_buildRowElement`, before any focus-shift event. |
| **C-12** | Manifest declaration runtime-mutability | **N/A** | Zero `manifest.json` edits. No declaration-mutability question to evaluate. |

**Summary: 4 PASS (C-4, C-7, C-9, plus C-2's reuse-existing-contracts pseudo-PASS) + 8 N/A.** No CRITICAL, HIGH, or MEDIUM gaps surfaced by the checklist. R3 is unblocked.

---

## §47.6 Performance Plan

| Path | Budget | Measurement | Rationale |
|------|--------|-------------|-----------|
| Initial group header render | < 50 ms P95 on 500-item / 50-group collection | Existing B-052 / §9 budget; R5 verifies via Performance panel | One inline `style.setProperty` call per group header during `renderTree` (sidepanel) / `_buildGroupSection` (newtab). No new layout work, no new computed style queries. The existing render path already does class application; one extra property-set is sub-millisecond. |
| Theme switch tint recomputation | < 16 ms (one paint frame) on 50 visible group headers | DevTools Performance panel: Layout entries should be **0**; Paint entries proportional to visible headers | The CSS cascade re-resolves `var(--gc-<slot>)` for each `--group-header-color`-referencing element on `[data-theme]` swap. No JS work; no DOM mutation. The browser composites a single Paint pass for affected elements. The B-037 §45.6 measurement (~200-300 ms end-to-end broadcast → repaint) covers the entire theme-switch cycle; B-104 adds zero overhead to that budget. |
| Picker swatch render in dialog open | No regression vs. baseline | R5 spot-check | The 9 swatch buttons are built per `_buildGroupColorSwatches` call (one per dialog open). Class-based CSS rule lookup (`.group-color-<slot>`) is identical perf-cost to the previous hex-literal version — the engine resolves the `var(--gc-<slot>)` once per swatch element on first paint. Sub-millisecond. |
| Group-jump popup chip render | No regression vs. baseline | R5 spot-check on 100-group popup | The new `[data-color="<slot>"]` selector runs once per chip element during cascade evaluation. `dataset.color` write is a single attribute set. Total cost ≤ 2 ms per popup-open cycle for 100 chips. |
| Cold-start FOUC (CSS pre-paint) | Zero new flash | R5 visual UAT | `shared/themes.css` is loaded BEFORE the per-surface stylesheet on every surface (verified for sidepanel, newtab, settings, popup, group-jump-popup). `--gc-<slot>` tokens resolve in the same paint frame as `--bg-primary` etc. No FOUC introduced. |

No path adds a synchronous storage round-trip in the render hot path, no full-collection re-read, no JS-side color computation per element. The B-052 search-render perf budget (< 50 ms P95) is preserved.

---

## §47.7 Accessibility Plan

**AC5 — WCAG AA contrast spot-check matrix (R5 obligation, ~20 of 126 combinations):**

R2 recommends the following spot-check sample for R5 [test-engineer]. The sample spans both light + dark theme axes, all 9 slots in the two most distinctive themes, plus 2 edge-case combinations:

| # | Theme | Slot | `--bg-secondary` | Tinted header bg (12% color-mix approx) | Body text (`--text-primary`) | Required ratio | Expected |
|---|---|---|---|---|---|---|---|
| 1 | `one-dark` | `blue` (`#61afef`) | `#21252b` | `~#262a31` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.8:1) |
| 2 | `one-dark` | `purple` (`#c678dd`) | `#21252b` | `~#272930` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.7:1) |
| 3 | `one-dark` | `teal` (`#56b6c2`) | `#21252b` | `~#262a31` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.8:1) |
| 4 | `one-dark` | `red` (`#e06c75`) | `#21252b` | `~#272a31` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.7:1) |
| 5 | `one-dark` | `orange` (`#d19a66`) | `#21252b` | `~#272a30` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.7:1) |
| 6 | `one-dark` | `pink` (`#e06c75`) | `#21252b` | `~#272a31` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.7:1) |
| 7 | `one-dark` | `indigo` (`#c678dd`) | `#21252b` | `~#272930` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.7:1) |
| 8 | `one-dark` | `yellow` (`#e5c07b`) | `#21252b` | `~#272a30` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.6:1) |
| 9 | `one-dark` | `slate` (`#5c6370`) | `#21252b` | `~#23272d` | `#abb2bf` | ≥ 4.5:1 | PASS (~7.9:1) |
| 10 | `github-light` | `blue` (`#0969da`) | `#f6f8fa` | `~#dde9fa` | `#1f2328` | ≥ 4.5:1 | PASS (~14:1) |
| 11 | `github-light` | `purple` (`#8250df`) | `#f6f8fa` | `~#e6dffa` | `#1f2328` | ≥ 4.5:1 | PASS (~13.6:1) |
| 12 | `github-light` | `teal` (`#1f7f5e`) | `#f6f8fa` | `~#deeae5` | `#1f2328` | ≥ 4.5:1 | PASS (~14.1:1) |
| 13 | `github-light` | `red` (`#cf222e`) | `#f6f8fa` | `~#f3dee0` | `#1f2328` | ≥ 4.5:1 | PASS (~13.5:1) |
| 14 | `github-light` | `orange` (`#bc4c00`) | `#f6f8fa` | `~#efe1d5` | `#1f2328` | ≥ 4.5:1 | PASS (~13.7:1) |
| 15 | `github-light` | `pink` (`#bf3989`) | `#f6f8fa` | `~#f0dde7` | `#1f2328` | ≥ 4.5:1 | PASS (~13.6:1) |
| 16 | `github-light` | `indigo` (`#6639ba`) | `#f6f8fa` | `~#e3dcf0` | `#1f2328` | ≥ 4.5:1 | PASS (~13.5:1) |
| 17 | `github-light` | `yellow` (`#9a6700`) | `#f6f8fa` | `~#ece2cd` | `#1f2328` | ≥ 4.5:1 | PASS (~13.7:1) |
| 18 | `github-light` | `slate` (`#59636e`) | `#f6f8fa` | `~#e6e9ed` | `#1f2328` | ≥ 4.5:1 | PASS (~13.7:1) |
| 19 | `solarized-light` | `yellow` (algorithmic, `#d5a643`) | `#eee8d5` | `#eee8d5` (no tint — see note) | `#586e75` | ≥ 4.5:1 | **FAIL — 4.392:1 baseline (pre-existing theme defect, B-105).** B-104 ships at `--group-header-tint-amount: 0%` on solarized-light, so the rendered visual is identical to the bare untinted baseline (no AMPLIFICATION of the existing sub-AA gap). Any non-zero tint pushes the ratio lower and is therefore disallowed on this theme. Tracked separately as B-105. |
| 20 | `dracula` | `slate` (`#6272a4`) | `#1e1f29` | `~#252734` | `#f8f8f2` | ≥ 4.5:1 | PASS (~13.5:1) — edge case (low-saturation slot on dark theme) |

**Risk-flagged algorithmic combinations** (R5 should pay extra attention):
- `solarized-light` + `yellow` (warm-on-warm — least contrast headroom)
- `monokai` + `green-leaning` slots (Monokai's accent is yellow-green; `--gc-teal` may visually conflict)
- `nord` + `purple` (Nord's accent is icy blue-grey; warm purple may look out-of-palette)
- `tokyo-night` + `slate` (Tokyo Night's bg is a deep navy; muted slate may visually disappear)

If R5 finds ANY combination below 4.5:1 body-text ratio, the fix path is:
1. R3 [frontend-engineer] adjusts the offending `--gc-<slot>` value (push saturation/lightness in OKLCH space until contrast clears).
2. R3 reruns the algorithmic recipe if the underlying canonical needs adjustment.
3. R5 re-verifies the spot-check.

**AC11(c) — Reduced motion neutrality:** B-104 introduces no CSS transitions on group header bg / color tokens. Theme switch and group color change are instantaneous repaints. AC11(c) PASS.

**Focus ring contrast:** group color tokens do NOT replace `--focus-ring`; the existing focus ring (per B-037 D-3 / §45.7) is preserved. Tab-focus on a tinted group header reveals the same `--focus-ring` outline as today.

**Screen reader / semantic accessibility:** group color is a purely visual signal. Group identity for AT users continues to come from `<button class="group-header">`'s name text and item count — unchanged by B-104. No new ARIA attributes are added or required.

---

## §47.8 Rollback Plan

**Single-commit revert restores the hardcoded-hex swatches and untinted headers.** Zero storage migration, zero message contract change, zero manifest permission change — rollback risk is purely mechanical.

```bash
# Identify the merge SHA on release/v2:
git log --oneline release/v2 | grep "B-104"

# Single-commit revert:
git revert <merge-sha>
git push origin release/v2

# All surfaces refresh on next reload — no data migration needed.
```

| Aspect | Rollback impact |
|--------|-----------------|
| `tj:groups` partition | No-op. `Group.color` is unchanged across the entire B-104 lifecycle (slot names, never hex). Pre-rollback groups render correctly under the post-rollback (untinted, hardcoded-hex-swatch) build. |
| `shared/themes.css` | The 126 `--gc-<slot>` token additions are reverted. The `var(--gc-<slot>)` references in surface CSS resolve to `unset` → fall through to fallback (`var(--color-avatar-bg)` for the popup chip; `var(--bg-secondary)` for the headers via the `transparent` fallback in the `color-mix` recipe). **No broken paint.** |
| `manifest.json` | Unchanged — no rollback action. |
| `tj:meta.schemaVersion` | Unchanged — no rollback action. |
| User-facing breakage | Users who became accustomed to the tinted headers lose the affordance; group identity reverts to the pre-B-104 small-chip-only treatment. **No data loss; only UX regression.** Picker swatches revert to the original hardcoded-hex appearance (theme-blind). |

**SEV severity if rollback is needed:** **SEV3** (minor degradation) — group color rendering reverts to the pre-B-104 chip-only baseline; no functional capability is lost. The most likely rollback trigger would be an unforeseen R5/UAT contrast regression on a specific theme/slot combination — default response is fix-forward (adjust the offending `--gc-<slot>` value) rather than full revert.

---

## §47.9 Open Questions

**None.** R1 locked Q1-Q6 (header treatment, slot naming, migration, coverage scope, hybrid authoring split, picker swatch theme-awareness). R2 D-1 through D-5 lock the remaining architectural ambiguities (final flagship/algorithmic theme split, group-jump popup chip resolution pattern, token scope, `color-mix` browser support floor + fallback, header tint formula). R3 has zero outstanding decisions.

---

## §47.10 As Built (R6)

**Closed:** 2026-04-25 · **Release:** v1.28.0 (sprint close pending) · **Branch:** `feature/sprint-34-visual-polish`

### Files actually changed vs. expected

| File | Expected (R2) | Actual (R6) | Notes |
|------|---------------|-------------|-------|
| `shared/themes.css` | 9 `--gc-<slot>` declarations × 14 themes (≥ 126 token values); legacy aliases inherit by COPY | ✅ done — 153 declarations across 17 palette blocks | 14 themed blocks + 1 `system` dark-OS `@media` override + 2 legacy aliases (`light`, `dark`) = 17 × 9 slots = 153. **Δ vs. R2:** Original D-1 split was 4 hand-curated + 10 algorithmic; R6 promotes `atom-one-dark` to hand-curated per R4 M-2 (final split: **5 hand-curated + 9 algorithmic**). atom-one-dark and one-dark share `--bg-secondary` (`#21252b`) and the same Atom One Dark base palette, so the 9 hex values are identical between the two blocks. R3-fix H-1 also added `--group-header-tint-amount: 0%` to the `[data-theme="solarized-light"]` block — the per-theme escape-hatch variable reserved in R2 D-5. |
| `sidepanel/sidepanel.css` | Replace 9 `.group-color-<slot>` hardcoded-hex rules with `var(--gc-<slot>)`; add `color-mix` tint on `.group-header` | ✅ done | Plus: `.group-header:hover` rewritten with the same recipe over `--bg-hover` (R3 deviation, kept per R4 M-1 with intentional-deviation comment). Both `.group-header` and `.group-header:hover` consume `var(--group-header-tint-amount, 12%)` so the solarized-light 0% override flows through both base and hover states. |
| `sidepanel/sidepanel.js` | `_buildGroupColorSwatches` reads tokens; inline `--group-header-color` injection on `.group-header` elements | ✅ done | Plus: R3-fix H-2 removed `color: 'slate'` from the synthetic `__ungrouped__` group at line 2087-2098 (replaced with `color: null` + comment block referencing §47.5 C-9(c)). Existing `GROUP_COLORS.includes(group.color)` guard at line 2188 evaluates `false` for `null`, correctly skipping both the chip class and the inline `--group-header-color` injection. |
| `newtab/newtab.css` | `color-mix` tint on `.newtab-group-header` over `--bg-primary` | ✅ done | Plus: R3-fix M-5 added `.newtab-group-header:hover` rule (`color-mix` over `--bg-hover`) for surface parity with sidepanel. |
| `newtab/newtab.js` | Inline `--group-header-color` injection in `_buildGroupSection`; import `GROUP_COLORS` | ✅ done | Ungrouped section's `null` `group` arg correctly bypasses the inline-style injection via the existing guard. |
| `popup/group-jump-popup.css` | Replace `var(--gj-group-color, …)` with 9 `[data-color="<slot>"]` rules per D-2 Option C | ✅ done | Latent bug closed: previous raw-slot-name `setProperty('--gj-group-color', 'slate')` etc. fell through to `--color-avatar-bg` for `slate`/`teal`/`indigo`. Now resolves correctly via the cascade. |
| `popup/group-jump-popup.js` | Set `chip.dataset.color` (gated by `GROUP_COLORS`); delete the raw-slot `setProperty` line; import `GROUP_COLORS` | ✅ done | Allow-list defense in depth (T9 covers the import). |
| `background/storage/groups.js` | No change | ✅ no change | AC4/AC6 regression guard — no schema migration. |
| `shared/constants.js` | No change | ✅ no change | `GROUP_COLORS` allow-list unchanged (AC9 regression guard). |
| `tests/b104-group-colors.test.js` | NEW, ≥ 8 tests | ✅ done — 9 tests (T1-T9) | +13% over AC7 minimum. |
| `docs/UAT_B-104.md` | NEW, ≥ 6 cases | ✅ done — 7 cases (UAT-1..UAT-7) | +17% over AC8 minimum. |
| `docs/design/47-b-104-themed-group-colors.md` | NEW R6 chapter | ✅ this file | §47.3 D-5 walkthrough corrected at R6 (M-3); §47.5 row 19 corrected at R6 (M-3); §47.10 As Built filled at R6. |

### Test counts (final)

- **Pre-S34 baseline:** 1,412 tests passing on `release/v2` (post-S33).
- **Post-B-101 R5:** 1,417 tests passing (+5 net via B-101 work).
- **Post-B-104 R5:** **1,426** tests passing (+9 net via T1-T9 in `tests/b104-group-colors.test.js`).
- **Post-B-104 R6 M-2 fix (atom-one-dark hand-curation promotion):** **1,426** tests passing — zero impact on test count (token value swap, no behavioral change).
- **Total Sprint 34 delta: +14 tests** (B-101 +5 net, B-104 +9 net).
- **Zero regressions** in the pre-existing suite across both items.

### UAT results summary

UAT plan authored at R5 ([test-engineer]). Browser-side execution is a human task performed during sprint close.

| Case | Priority | Result | Notes |
|------|----------|--------|-------|
| UAT-1: Sidepanel tinted headers across themes | B | ✅ AUTHORED — pending human walk-through during sprint close | Mirrors §46.10 / §48.10 pattern |
| UAT-2: Newtab tinted headers + hover persistence | H | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-3: Group-jump popup chips for ALL 9 slots incl. previously-broken slate/teal/indigo (D-2 closure) | H | ✅ AUTHORED — pending human walk-through during sprint close | Verifies the latent-bug fix |
| UAT-4: Picker swatches re-skin on theme switch | H | ✅ AUTHORED — pending human walk-through during sprint close | |
| UAT-5: R4 H-2 regression — Ungrouped section has NO tint regardless of theme | B | ✅ AUTHORED — pending human walk-through during sprint close | T6 also covers automatically |
| UAT-6: Theme switch live-broadcasts to all 3 surfaces without page reload | H | ✅ AUTHORED — pending human walk-through during sprint close | Validates §47.4 Path A |
| UAT-7: WCAG AA spot-check on 5 representative combinations including solarized-light + yellow at the bare baseline | M (optional) | ✅ AUTHORED — pending human walk-through during sprint close | SKIP allowed if no contrast tool available; expected solarized-light + yellow = 4.392:1 (sub-AA pre-existing baseline; B-105 tracks fix) |

### Hardening discovered during R4 / R3-fix / R6

R4 (3 reviewers in parallel) surfaced 0 CRITICAL / 3 HIGH / 4 MEDIUM / 8 LOW. All HIGHs and 3 of 4 MEDIUMs resolved before sprint close.

**HIGH (all closed in R3-fix, [frontend-engineer]):**

- **H-1 (qa-reviewer) — solarized-light WCAG AA failure:** R3's actual contrast computation showed text `#586e75` vs tinted `--bg-secondary` at 3.90–4.10:1 across all 9 slots — sub-AA. Per-slot computation revealed the bare baseline (no tint) is **4.392:1**, already sub-AA; every non-zero tint pushes contrast LOWER. **Fix:** introduced the `--group-header-tint-amount` per-theme override variable (the R2 D-5 reserved escape hatch); set to `0%` for solarized-light. All 4 recipes (`.group-header` base + hover, `.newtab-group-header` base + hover) rewritten to consume `var(--group-header-tint-amount, 12%)`. Solarized-light renders identically to its bare baseline (no AMPLIFICATION of the existing sub-AA gap). Underlying theme palette defect tracked as new follow-up B-105.
- **H-2 (qa-reviewer) — Ungrouped slate-tint leak:** synthetic `__ungrouped__` group hardcoded `color: 'slate'`, which passed `GROUP_COLORS.includes(...)` and caused the inline-style injection to set `--group-header-color: var(--gc-slate)` on the Ungrouped header. Violated R2 §47.5 C-9(c). **Fix:** removed `color: 'slate'`; replaced with `color: null` + comment block. Existing `GROUP_COLORS.includes(group.color)` guard correctly evaluates `false` for `null`, skipping both chip class and inline-style injection. T6 is the regression guard.
- **H-3 (qa-reviewer) — hover compounds H-1:** `.group-header:hover` blend base is `--bg-hover` which is darker than `--bg-secondary` on solarized-light, pushing contrast even lower. **Fix:** resolved automatically by H-1; the rewritten hover rule consumes the same `--group-header-tint-amount` variable, so the 0% override applies to both states.

**MEDIUM:**

- **M-1 (code-reviewer) — hover deviation comment:** `.group-header:hover` uses `--bg-hover` instead of `--bg-secondary` (intentional R3 deviation from R2 D-5's "single recipe" constraint). Functionally correct; needed an explanatory comment. **Status: APPLIED in R3-fix** — comment block added at sidepanel.css explaining the intentional deviation.
- **M-2 (code-reviewer) — atom-one-dark algorithmic vs one-dark hand-curated:** the two themes share `--bg-secondary` (`#21252b`) and the same Atom One Dark base palette; shipping atom-one-dark with algorithmic mid-toned values while one-dark used the canonical Atom One Dark palette caused visually near-identical themes to render group colors with markedly different vibrancy. **Status: APPLIED in R6 (this round)** — promoted atom-one-dark to hand-curated by copying one-dark's 9 hex values verbatim into the `[data-theme="atom-one-dark"]` block. Final D-1 split is now **5 hand-curated + 9 algorithmic** (was 4 + 10).
- **M-3 (qa-reviewer) — R2 §47.3 D-5 + §47.5 row 19 baseline error:** the D-5 mental walkthrough claimed solarized-light baseline is `7.21:1`; actual is `4.392:1` (sub-AA before any tint). §47.5 row 19 incorrectly marked solarized-light + yellow as PASS at `~6.6:1`. The cascading premise that 12% is safe on solarized-light was therefore wrong. **Status: APPLIED in R6 (this round)** — D-5 walkthrough updated with correct numbers + explanatory note about solarized-light being a known low-baseline theme; §47.5 row 19 updated to FAIL with explanation that B-104 ships at 0% tint there (visual identical to bare baseline; B-105 tracks the underlying defect).
- **M-5 (qa-reviewer) — newtab hover parity:** sidepanel had `.group-header:hover` tint but newtab had no `:hover` rule, producing visual inconsistency between the two surfaces. **Status: APPLIED in R3-fix** (Option A) — added `.newtab-group-header:hover` rule using `--bg-hover` as the blend base, mirroring sidepanel.

**LOW (8 total — deferred or absorbed):**

- **L-1 (code-reviewer)** — R2 anchor approximations (~) deviate from R3's correct sRGB values. **Resolution:** §47.3 anchor table values left as approximations with note that R3 handoff (in `SPRINT.md`) is the source of truth for shipped algorithmic values. Anchor table is for R5 verification recipe-direction only, not for byte-exact comparison.
- **L-2 (code-reviewer)** — Pre-existing `.group-color-chip` no-default-bg renders a transparent 10×10 phantom on uncolored groups. **Resolution:** documented; defer chip removal as a future polish item — the chip is cheap to retain and the phantom is visually invisible against the tinted header.
- **L-3 (code-reviewer)** — Stale comment in `popup/group-jump-popup.js:730` referencing the deleted `--gj-group-color` property. **Resolution:** acknowledged; rephrase deferred as cosmetic-only.
- **L-4 (code-reviewer)** — Dracula `--gc-indigo`/`--gc-blue` non-uniqueness intentional but not commented in-line. **Resolution:** documented in §47.3 D-1 ("Notes on hand-curated values") — the same note now applies to atom-one-dark per M-2 promotion. In-CSS comment defer.
- **L-5 (security-reviewer)** — Defense-in-depth: per-slot `[data-color]` selector list and JS allow-list are two sources of truth. **Resolution:** **COVERED** by T9 (`tests/b104-group-colors.test.js`) which asserts the popup imports `GROUP_COLORS` from `shared/constants.js`.
- **L-6 (security-reviewer)** — Template-literal interpolation `var(--gc-${group.color})` into inline style. **Resolution:** two-layer defense in place (UI gate + upstream `assertValidColor` allow-list); single-line safety contract comment defer.
- **L-7 (qa-reviewer)** — `--gc-blue` count is 17 vs R2-expected 16. **Resolution:** R2 missed the `system` dark-OS nested override; actual count is correct; documented in this As-Built table (153 declarations = 17 blocks × 9 slots).
- **L-8 (qa-reviewer)** — No `@supports` fallback for `color-mix` in unsupported environments. **Resolution:** Edge/Chrome 130+ baseline confirmed in R2 D-4; the `var(--group-header-color, transparent)` fallback already provides graceful degradation. `@supports` block defer as defensive polish.

### Deviations from R2 plan

1. **R2 §47.3 D-5 baseline contrast factual error (corrected at R6 M-3):** the D-5 mental walkthrough originally claimed solarized-light text-vs-bg contrast is `~7.21:1`; actual computed value is `4.392:1` (sub-AA before any tint is applied). R6 corrects the walkthrough numbers, updates §47.5 row 19 to FAIL, and adds an explicit "known LOW-baseline theme" note. Consequence: the D-5 premise that 12% is universally safe was wrong; R3-fix introduced the per-theme override that R2 had reserved as an escape hatch.
2. **R2 D-1 hand-curated vs algorithmic split (R4 M-2 promotion):** R2 specified 4 hand-curated + 10 algorithmic; R6 promotes `atom-one-dark` to hand-curated per R4 M-2 (atom-one-dark and one-dark share `--bg-secondary` and the same Atom One Dark base palette; visually near-identical themes were rendering group colors with markedly different vibrancy). Final split: **5 hand-curated + 9 algorithmic**.
3. **`--group-header-tint-amount` per-theme override variable (R3-fix new addition):** not in the R2 spec but pre-reserved in R2 D-5 ("Per-theme override left available as a fallback path"). R3-fix promoted from "future-proofing" to "shipped feature" via the H-1 fix. solarized-light overrides to `0%`; all other themes inherit the `12%` default. CSS recipes on all 4 surface rules (sidepanel base + hover, newtab base + hover) consume `var(--group-header-tint-amount, 12%)`.
4. **`.group-header:hover` rule (R3 small refinement):** R2 D-5 didn't address hover explicitly. R3 added the same `color-mix` formula with `--bg-hover` as the blend base so the tint identity persists across hover/non-hover transitions instead of getting wiped. R3-fix M-5 added the parallel `.newtab-group-header:hover` rule for surface parity. R4 M-1 ratified the deviation with an explanatory comment.
5. **Test count exceeds AC7 minimum by ~13%** (9 tests vs ≥ 8 required).
6. **UAT count exceeds AC8 minimum by ~17%** (7 cases vs ≥ 6 required).

### Follow-up backlog items filed from B-104

- **B-105 — solarized-light baseline contrast defect** (P2/S/backlog). Pre-existing theme defect surfaced (NOT caused) by S34 B-104 R4 contrast computation: `--text-primary` (`#586e75`) vs `--bg-secondary` (`#eee8d5`) measures `4.392:1` — sub-AA before any tint is applied. B-104 worked around by shipping `--group-header-tint-amount: 0%` on solarized-light; B-105 tracks the underlying palette fix so future tinted-surface features can apply non-zero tints on this theme. **Filed in `docs/BACKLOG.md` at R6.** Suggested R1 directions: darken `--text-primary` to ~`#475158` or lighten `--bg-secondary` to ~`#f5f1e3`; verify no regression on selection / picker / dialog surfaces; re-evaluate `--group-header-tint-amount` for solarized-light at the new AA-passing baseline.

### Rollback (if needed)

Single-commit revert of the S34 merge to `release/v2` restores the pre-B-104 state:

- The 153 `--gc-<slot>` token additions and the `--group-header-tint-amount: 0%` solarized-light override are removed cleanly (no orphan tokens).
- `var(--gc-<slot>)` references in surface CSS resolve to `unset` and fall through to fallbacks (`var(--color-avatar-bg)` for the popup chip; `var(--bg-secondary)` for the headers via the `transparent` default in the `color-mix` recipe — collapses to bare bg, no broken paint).
- Picker swatches revert to the original hardcoded-hex appearance (theme-blind).
- Group identity reverts to the pre-B-104 small-chip-only treatment.

**SEV severity:** SEV3 (minor visual regression) — group headers lose tint, swatches return to hardcoded hex; no functional capability is lost; no data is lost. The most likely rollback trigger would be an unforeseen UAT contrast regression on a specific theme/slot combination — default response is fix-forward (adjust the offending `--gc-<slot>` value, or set the theme's `--group-header-tint-amount` to 0% as solarized-light does) rather than full revert.

See §47.8 for the full rollback procedure.

---
