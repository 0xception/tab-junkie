# §45 — B-037 Theme Selection (R2 Design)

**Sprint:** 31
**Tier:** Full (M)
**Status:** R2 complete (2026-04-25) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §10.10 (broadcast architecture — `MSG_STATE_CHANGED` + `SCOPE.PREFERENCES`); §41 (B-035 standalone window — confirms 3rd surface fed by the same theme infrastructure); §42 (B-036 newtab — `theme-init.js` FOUC pattern, `data-theme` attribute lock-step with sidepanel); §43 (B-038 view-mode pref — `renderSelect` consumer pattern); §44 (B-091 Settings page — Theme `<fieldset>` placeholder slot, `settings-fields.js` field registry).
**Out-of-scope (explicit):** (a) Custom user-defined themes; (b) Theme preview swatches in the picker; (c) Per-surface independent theme selection (one global theme); (d) Animated theme transitions (instant swap only); (e) Theme export/import; (f) Any new `manifest.json` permissions; (g) Light/dark *auto* token-pair generation for non-`system` themes (each named theme is a fixed palette, no media-query auto-switch); (h) Storage `schemaVersion` bump (D-5 confirms additive enum extension does not require a bump).

---

## §45.1 Overview

B-037 ships **13 theme slugs** (1 auto + 6 dark-base named + 6 light-base named) reachable from the B-091 Settings page Theme `<fieldset>` placeholder. The existing `tj:prefs.theme` enum is extended from `'light' | 'dark' | 'system'` to the full 13-slug allow-list; on read, legacy stored values `'light'` and `'dark'` are normalised to the closest named slug **at the boundary of `getPreferences()`** so the runtime contract sees only the new enum. CSS palette declarations — currently triplicated across `sidepanel/sidepanel.css`, `newtab/newtab.css`, `settings/settings.css` — are extracted into a single `shared/themes.css` (LOCKED via D-3 option A) imported by every surface. The three byte-identical `theme-init.js` FOUC guards are unified into one `shared/theme-init.js` (sessionStorage sync read; fallback `'system'` instead of `'light'`) and referenced via relative `../shared/theme-init.js` paths from every surface HTML. Live theme application reuses the existing `MSG_SET_PREFERENCES` → `MSG_STATE_CHANGED (SCOPE.PREFERENCES)` broadcast pipe; each receiving surface re-reads `prefs.theme` and assigns `document.documentElement.dataset.theme = slug`. CSS custom properties resolve under the new `[data-theme="slug"]` selector and the surface repaints — no DOM mutation, no layout reflow. Zero new manifest declarations, zero new permissions, zero new message contracts, zero storage `schemaVersion` bump. R3 lands ~250 net LOC (mostly CSS palette tokens + the consolidated init script + a `renderSelect` call site in `settings/settings.js`); R5 measures perf against AC10's 500 ms broadcast/repaint budget; R6 documents As-Built deltas in §45.10.

---

## §45.2 Existing-State Reality Check

**Today (2026-04-25 on `feature/sprint-31-themes`, branched off `release/v2`):**

- `tj:prefs.theme` is enum `'light' | 'dark' | 'system'` with default `'system'`. `DEFAULT_PREFERENCES` lives at `background/storage/shapes.js:60-81`.
- Validators: `isPreferences` at `background/storage/shapes.js:130-148` rejects any non-allowlist string; `validatePrefsPatch` at `background/storage/preferences.js:25-27` rejects non-allowlist patches with `ERR_VALIDATION`.
- Three byte-identical FOUC guards at `sidepanel/theme-init.js`, `newtab/theme-init.js`, `settings/theme-init.js`: each is a 4-line synchronous read `sessionStorage.getItem('tj-theme') || 'light'` → `document.documentElement.dataset.theme = cached`. The fallback `'light'` is a known divergence from `DEFAULT_PREFERENCES.theme = 'system'`; B-037 corrects it.
- Three CSS palette triplications: `sidepanel/sidepanel.css:7-145` carries the **full 28-token** sidepanel palette (includes sidepanel-only tokens like `--live-indicator`, `--audible-color`, `--drifted-color`, `--active-bg`, `--selected-bg`, `--collapse-icon`, `--mark-bg`); `newtab/newtab.css:12-134` carries a 26-token subset (no `--danger`, no `--selected-*`, no `--collapse-icon`); `settings/settings.css:12-86` carries a 15-token subset (settings-page-only tokens). All three currently express only `[data-theme="light"]`, `[data-theme="dark"]`, and `@media (prefers-color-scheme: dark|light) [data-theme="system"]`. With 13 themes, the deny-list is ~39 palette blocks across 3 files (~3,500 LOC duplicated) — flagged in S30 retro as the leading tech-debt to clear in S31.
- `settings/settings.html:60-63` reserves the Theme `<fieldset>` slot:
  ```html
  <fieldset class="settings-section" data-section="Theme">
    <legend class="settings-section-legend">Theme</legend>
    <p class="settings-section-placeholder">Theme selection coming in a future update.</p>
  </fieldset>
  ```
  B-037 R3 deletes the `<p class="settings-section-placeholder">` and the `renderSelect` call (in `settings/settings.js`) populates the section.
- `settings/settings-fields.js` `renderSelect` (line 201-224) accepts `{ key, label, section, options: [{value, label}], defaultValue }` — flat options array. **No `<optgroup>` support today.** D-6 evaluates extension vs flat-13.
- `manifest.json` v1.24.0: `permissions: ["tabs", "tabGroups", "storage", "sidePanel", "search"]`. No `web_accessible_resources`. No `commands`. **Zero changes anticipated for B-037.**
- Broadcast pipeline: `background/messages/storage-handlers.js:112` maps `MSG_SET_PREFERENCES` → `SCOPE.PREFERENCES`; `background/broadcast.js:13` fires `chrome.runtime.sendMessage({type: MSG_STATE_CHANGED, payload: {scope: 'prefs', trigger}})` after the SW write commits. Receivers (`sidepanel.js`, `newtab.js`, `settings/settings-fields.js`) all subscribe with sender-id and scope filters. **No new infrastructure needed; B-037 is a consumer of an existing pipe.**

**No pre-existing B-037 code, no partial implementation, no unreviewed scaffolding.** Greenfield expansion of the existing 3-theme infrastructure.

---

## §45.3 Design Decisions (D-1 through D-8)

### D-1 — Final Theme Catalog: 14 slugs (13 from B-037 R1 + `tokyo-night` added in B-098 Sprint 32)

**Choice:** the R1 13-slug list is the base. B-098 (Sprint 32 Fast Track XS) adds `tokyo-night` as the 14th entry. Visual grouping in the `<select>` is delivered by **three `<optgroup>` blocks** (Auto → Light → Dark — shipped order; see D-6 for the `renderSelect` extension).

| Slug | Display Label | Base | Notes |
|---|---|---|---|
| `system` | System Default | auto | Existing default; auto-switches with OS via `prefers-color-scheme` (preserved as-is). |
| `dracula` | Dracula | dark | Magenta/purple accent on near-black `#282a36` body; classic IDE palette. |
| `nord` | Nord | dark | Cool blue-grey accent on `#2e3440` body. |
| `one-dark` | One Dark | dark | Atom's One Dark; default *migration target* for legacy `'dark'` (D-2). |
| `monokai` | Monokai | dark | Warm yellow/pink/green accents on `#272822` body. |
| `tomorrow-night` | Tomorrow Night | dark | Muted accent on `#1d1f21` body. |
| `atom-one-dark` | Atom One Dark | dark | Slightly lighter variant of `one-dark`. |
| `github-light` | GitHub Light | light | White body, `#0969da` accent. |
| `solarized-light` | Solarized Light | light | `#fdf6e3` body, `#268bd2` accent. |
| `tomorrow` | Tomorrow | light | Off-white body, muted accent. |
| `atom-one-light` | Atom One Light | light | Default *migration target* for legacy `'light'` (D-2). |
| `github-dark` | GitHub Dark | dark | Dark-base palette — slug name retained from R1 (R1 deliberately puts this in the "light" bucket as a "dark counterpart to GitHub Light"). For UX grouping (D-6), it lives in the **Dark** optgroup. |
| `solarized-dark` | Solarized Dark | dark | `#002b36` body, `#268bd2` accent. **Lives in the Dark optgroup.** |
| `tokyo-night` | Tokyo Night | dark | Deep navy `#1a1b26` body, `#7aa2f7` blue accent; popular IDE palette. Added B-098 Sprint 32. |

**Optgroup mapping** (D-6 grouped UX):
- **Auto** (1): `system`
- **Dark** (9): `dracula`, `nord`, `one-dark`, `monokai`, `tomorrow-night`, `atom-one-dark`, `github-dark`, `solarized-dark`, `tokyo-night`
- **Light** (4): `github-light`, `solarized-light`, `tomorrow`, `atom-one-light`

**Rationale on Dark/Light split count (9/4):** the R1 slug list as written includes `github-dark` and `solarized-dark` in what R1 calls the "Light slugs" bucket — that grouping was the *catalog-paragraph reading order*, not a UX directive. Visually grouping by base (9 dark / 4 light) is what the user actually sees. AC1 PASS-condition is "Settings page Theme section renders all 14 options"; the AC does not constrain grouping. Total count = 14; grouping is purely visual. No AC violation.

**Slug stability contract:** the 14 slugs above are normative. Any slug rename or removal post-R6 would orphan stored values for users who picked that theme; this is a one-way door. R5 [test-engineer] AC13 test 1 asserts the exact 14-slug list against the rendered `<option>`s.

### D-2 — Storage migration mapping: `'light'` → `'atom-one-light'`, `'dark'` → `'one-dark'`

**Choice:**

| Legacy stored value | Migration target slug | Rationale |
|---|---|---|
| `'light'` | `'atom-one-light'` | Closest visual match to the existing 15-token light palette (off-white body, blue accent, no warm tint). |
| `'dark'` | `'one-dark'` | Closest visual match to the existing dark palette (Atom's One Dark is the canonical "modern dark IDE" baseline; matches the user's prior expectation of a non-saturated dark surface). |
| `'system'` | unchanged (`'system'`) | Already a valid slug in the new enum. |

**Migration site:** the legacy-to-new mapping runs **on read inside `getPreferences()`** at `background/storage/preferences.js:49-52`, *after* `readPartition(PARTITION_PREFS)` returns and *before* the `{ ...DEFAULT_PREFERENCES, ...stored }` merge. The mapped value flows through the merge so the runtime caller always sees a current-enum slug. Persisted disk state stays at `'light'` / `'dark'` until the user (a) changes themes via the picker (which writes the new slug atomically through `MSG_SET_PREFERENCES`) or (b) the SW commits any other prefs write that includes `theme` in its patch. **The migration is read-time-normalisation; there is no one-shot write-on-first-read.** This keeps rollback trivial (D-2 §45.8): if R6 is reverted, the still-present `'light'`/`'dark'` disk values continue to validate against the pre-B-037 enum.

**Validator coexistence during read-side migration:** `isPreferences()` runs on `assertShape()` — invoked by `readPartition()` *before* the migration step in `getPreferences()`. If we extend `isPreferences` to accept *only* the 13 new slugs, a stored `'light'`/`'dark'` value would throw `ERR_CORRUPT_DATA` *before* migration runs. **Fix:** `isPreferences` must accept the **union of legacy slugs (`'light'`, `'dark'`) and the 13 new slugs** — totalling 15 valid string values for the `theme` field. The migration in `getPreferences()` collapses the legacy two into their new targets; `validatePrefsPatch` (which gates *writes*) accepts only the 13 new slugs (legacy values can never be re-written). This split — read accepts 15, write accepts 13 — is the safe migration shape and is documented in C-1 below.

**Edge case — corrupt or future-removed slug:** `isPreferences()` rejects any string outside the 15-value union; `assertShape()` raises `ERR_CORRUPT_DATA`; `getPreferences()`'s existing safe-mode fallback returns `DEFAULT_PREFERENCES` (theme `'system'`). This is the AC9(c) path.

### D-3 — CSS consolidation strategy: Option A — `shared/themes.css` (LOCKED)

**Choice: Option A — extract all `[data-theme="*"]` palette blocks into a single `shared/themes.css`, imported by every surface HTML.**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (A) `shared/themes.css` — single source of truth, imported via `<link>` from `sidepanel.html`, `newtab.html`, `settings.html` | Zero token drift across surfaces; one edit to add the 14th theme; eliminates ~3,500 LOC of triplication called out in S30 retro; AC7 PASS condition met | One additional `<link>` per surface; surfaces with strict order requirements (theme-init must run before stylesheet to set `data-theme`) need careful ordering — already the case today, so no regression | **Chosen** |
| (B) Per-surface triplication of all 13 themes | No new file | ~3,500 LOC triplicated; every theme tweak requires three coordinated edits; high drift risk; AC7 explicitly disallows partial consolidation | Rejected |

**Token-set differential — implementation contract:** the three current surfaces have *different* token sets in their `[data-theme="…"]` blocks (sidepanel = 28 tokens including `--live-indicator`, `--active-bg`, `--audible-color`, `--drifted-color`, `--selected-bg`, `--selected-border`, `--collapse-icon`, `--mark-bg`; newtab = 26 tokens; settings = 15 tokens). To keep `shared/themes.css` a **single source of truth without losing surface-specific tokens**, R3 picks the **superset approach**: `shared/themes.css` declares the **full sidepanel-superset 28-token palette** for all 13 themes. Surfaces that don't reference the extra tokens (newtab, settings) simply ignore them — CSS custom properties not consumed do not affect rendering. This is preferred over the alternative ("only the shared 15 tokens in `shared/themes.css`; per-surface CSS still declares its surface-only tokens") because the alternative re-introduces partial duplication of surface-only tokens × 13 themes, which is the same drift problem at smaller scale.

**Per-surface CSS files keep:** non-token CSS only (layout, typography, components). After R3, **zero `[data-theme=` selectors remain in `sidepanel.css`, `newtab.css`, `settings.css`** — AC14 PASS condition. The two existing sidepanel-only `[data-theme="dark"] .item-select[…]` and `[data-theme="system"] .item-select[…]` selectors at `sidepanel.css:1492-1500` are component-state overrides, not palette tokens; they are **rewritten to use a CSS custom property** (`--item-select-checked-bg` declared per-theme in `shared/themes.css`) so the rule no longer needs to switch on `data-theme` directly. This preserves AC14's "no `[data-theme=` palette block in any per-surface CSS file" condition cleanly.

**Stylesheet load order:** every surface HTML must load `shared/themes.css` **before** its surface-specific stylesheet (so surface-specific rules can override or augment palette tokens if ever needed). The theme-init script still runs first (sets `data-theme` on `<html>`), then `shared/themes.css` and the surface stylesheet load — the cascade resolves at the time the body paints.

### D-4 — `theme-init.js` FOUC-guard pattern: consolidated `shared/theme-init.js`; sessionStorage sync read; fallback `'system'`

**Choice:** unify the three byte-identical `theme-init.js` copies into one `shared/theme-init.js`. Surface HTML files reference it via relative path. Behavioural change: **fallback string changes from `'light'` to `'system'`** so cold-start matches `DEFAULT_PREFERENCES.theme`.

**FOUC mechanism reality check:** `chrome.storage.local.get` is async — not safe to await before first paint. The current `theme-init.js` uses a **synchronous `sessionStorage.getItem('tj-theme')`** as a per-window cache. The cache is populated at the bottom of the surface bootstrap (after `MSG_GET_PREFERENCES` resolves) so subsequent navigations / refreshes within the same window get the right theme on first paint. **First-ever cold load** (no sessionStorage entry) falls through to the default. This is the **established pattern from B-036 §42.4.3 / B-091 §44.3 D-9** — proven across 3 surfaces × 30 sprints. R2 retains it.

**Edge MV3 inline-script context (C-8 check):** `sessionStorage` is reachable from inline scripts in extension-origin pages without any permission. `document.documentElement.dataset` is reachable from `<script>` blocks at parse time before stylesheets resolve. **Both APIs verified reachable; no SW context involved (the script runs in the page document).** No spike needed.

**sessionStorage write site:** every surface bootstrap writes `sessionStorage.setItem('tj-theme', prefs.theme)` after the first successful `MSG_GET_PREFERENCES` resolve and on every broadcast-driven theme change. R3 audit point: confirm `sidepanel.js`, `newtab.js`, and `settings/settings.js` all perform the write. (Currently only the sidepanel does — the broadcast flow is the place to write across the board.)

**Consolidated script body:**
```js
/* B-037 §45.3 D-4 — shared FOUC guard for sidepanel/newtab/settings.
   Sync sessionStorage read; fallback aligned with DEFAULT_PREFERENCES.theme
   per AC6. */
const cached = sessionStorage.getItem('tj-theme') || 'system';
document.documentElement.dataset.theme = cached;
```

**Migration of legacy sessionStorage value:** if a user's session has `tj-theme = 'light'` from a pre-B-037 install, the inline script sets `data-theme="light"` on `<html>` for first paint. CSS in `shared/themes.css` will not include a `[data-theme="light"]` block (the slug `light` is no longer a member of the 13-slug enum). **First paint on the legacy session gets unstyled custom properties (browser-default colors).** Mitigation: `shared/themes.css` ships **legacy aliases** `[data-theme="light"]` and `[data-theme="dark"]` that copy the migration-target palettes (`atom-one-light` and `one-dark`). The aliases are **transitional** — kept until the bootstrap rewrites sessionStorage with the new slug on first prefs-load (a single round-trip later, ~30-100 ms). After that the next paint uses the new slug. Aliases also harden against a stale sessionStorage value persisting across an extension downgrade-then-upgrade cycle.

**FOUC test surface (R5):** AC13 encourages a FOUC test; AC10(c) measures "no flash of wrong theme is visible." R5 [test-engineer] verifies by JS-driven UAT: pre-set `sessionStorage`, reload a surface, screenshot first paint.

### D-5 — Storage schema version: NO bump (additive enum extension; OPTIONAL-field merge precedent)

**Choice:** **NO `tj:meta.schemaVersion` bump.** The B-037 change is an *enum extension* on an existing field — the field type (`string`), key (`theme`), partition shape (`PARTITION_PREFS` keyed Object), and merge semantics (`{...DEFAULT, ...stored}`) are all unchanged. The validators' allow-lists grow: `isPreferences` from 3 → 15 (legacy + new), `validatePrefsPatch` from 3 → 13. No on-disk byte layout change. This precisely matches the B-060 (`importSkipDuplicates`) and B-092 (`denseLayout`) precedent in `shapes.js:135-146`: "If the key IS present on disk … its type must be boolean … pre-B-XXX stored prefs lack the key, and `getPreferences()` merges DEFAULT_PREFERENCES over stored so the runtime value is always populated."

**Rollback safety (read-time-only migration):** because we never re-write existing `'light'` / `'dark'` disk values until the user picks a new theme, an R6 revert (un-deploying B-037) restores the pre-B-037 enum *and* the disk values still validate. Users who *did* pick a new theme during the B-037 deployment window will have e.g. `'dracula'` on disk; on rollback, the pre-B-037 `isPreferences` would reject `'dracula'` as `ERR_CORRUPT_DATA` and `getPreferences()` returns `DEFAULT_PREFERENCES.theme = 'system'`. This is acceptable — the user sees their theme reset to system default but no data is lost. (Items / groups / floating-groups are unaffected.) The §45.8 rollback plan documents this.

**C-1 stale-SW note (per B-094 CLAUDE.md amendment):** *Even though no schemaVersion bump is required*, the change to `validatePrefsPatch` and `isPreferences` is a SW-module-cache-affecting change. After updating to a B-037 build, **the user MUST toggle the extension OFF then ON in `chrome://extensions` (Edge: `edge://extensions`)** — otherwise the SW serves the stale validator + receives the new picker's `MSG_SET_PREFERENCES { theme: 'dracula' }` write and rejects it with `ERR_VALIDATION` ("theme must be light|dark|system"). The release notes (`CHANGELOG.md`) MUST flag this in the v1.25.0 entry. This codifies the B-094 + B-092 stale-SW precedent and is enforced as part of D-8.

### D-6 — `renderSelect` ergonomics: extend with optional `optgroups` parameter

**Choice:** extend `renderSelect` to accept an **optional `optgroups`** argument that, when present, replaces the flat `options` array with grouped option lists. Backward compatible — existing call sites (B-038 `displayMode`) continue working unchanged.

**API extension contract:**

```js
// Existing call shape (B-038 displayMode) — unchanged:
renderSelect({
  key: 'displayMode',
  label: 'Display mode',
  section: 'Display',
  options: [
    { value: 'sidepanel', label: 'Side panel' },
    { value: 'window',    label: 'Standalone window' },
  ],
  defaultValue: 'sidepanel',
});

// New B-037 call shape with optgroups (shipped order: Auto → Light → Dark):
renderSelect({
  key: 'theme',
  label: 'Theme',
  section: 'Theme',
  optgroups: [
    { label: 'Auto',  options: [{ value: 'system', label: 'System Default' }] },
    { label: 'Light', options: [
        { value: 'github-light',    label: 'GitHub Light' },
        { value: 'solarized-light', label: 'Solarized Light' },
        { value: 'tomorrow',        label: 'Tomorrow' },
        { value: 'atom-one-light',  label: 'Atom One Light' },
    ]},
    { label: 'Dark',  options: [
        { value: 'dracula',        label: 'Dracula' },
        { value: 'nord',           label: 'Nord' },
        { value: 'one-dark',       label: 'One Dark' },
        { value: 'monokai',        label: 'Monokai' },
        { value: 'tomorrow-night', label: 'Tomorrow Night' },
        { value: 'atom-one-dark',  label: 'Atom One Dark' },
        { value: 'github-dark',    label: 'GitHub Dark' },
        { value: 'solarized-dark', label: 'Solarized Dark' },
    ]},
  ],
  defaultValue: 'system',
});
```

**Builder extension (`_buildFieldDom` in `settings/settings-fields.js`):** the `else` branch at line 474-485 (which currently builds a flat `<select>` with `<option>` children) gains a sibling code path for `field.optgroups`: iterate the array, create a `<optgroup label="…">`, append `<option>` children per group. Field metadata at line 208-219 stores `field.optgroups` alongside `field.options`. The `field.options` flat list is **derived** from `optgroups` (concat of all `optgroups[].options`) so `_writeControlValue`'s "valid option" check at line 373 (`field.options.some(o => o.value === value)`) continues to work without change.

**Spec-derivation rule:** if both `options` and `optgroups` are provided, throw an error at `renderSelect` call time. Mutually exclusive.

**Accessibility:** native `<optgroup>` is announced by all major screen readers (NVDA, JAWS, VoiceOver). Keyboard navigation through grouped options works the same as flat (arrow keys cycle all options regardless of group; the group label is announced when crossing the boundary). No additional ARIA wiring needed.

**Why not a richer custom control:** a `<select>` is already keyboard-accessible, screen-reader-friendly, and zero LOC for the visible chrome. A custom listbox or radio-card UI would multiply complexity for no functional benefit at this scope. Theme preview swatches were considered and explicitly out-of-scope per R1.

### D-7 — C-12 manifest mutability audit: N/A (zero manifest changes)

**Verdict: N/A.** B-037 introduces zero new `manifest.json` declarations. The Theme picker is a `<select>` inside the existing Settings page; it persists via the existing `MSG_SET_PREFERENCES`; it broadcasts via the existing `MSG_STATE_CHANGED`; it applies via existing CSS custom properties. AC12 PASS condition is `git diff manifest.json` returns empty (modulo the version bump applied at sprint close by [release-manager]). C-12 has nothing to verify because no manifest declaration is being added or modified — there is no enable/disable behavior tied to a manifest field. R5 [security-reviewer] reconfirms.

### D-8 — Stale-SW release-note flag: REQUIRED in CHANGELOG v1.25.0 entry

**Choice:** the v1.25.0 CHANGELOG entry **MUST** include the stale-SW notice per the B-094 CLAUDE.md C-1 amendment.

**Mandatory CHANGELOG copy block (verbatim suggestion for [technical-writer] R7):**

> ⚠️ **After updating, toggle Tab Junkie OFF then ON in `chrome://extensions` (or `edge://extensions` on Edge) before changing themes.** This refreshes the extension's background script so the new theme list is recognised. Without this step, choosing a theme other than Light / Dark / System will report a "Could not save" error.

Rationale: extending `validatePrefsPatch` enum + `isPreferences` enum is a SW-module-cache-affecting change. Chrome / Edge MV3 SW caching in unpacked-development install mode (and in some packaged-update flows) does not always invalidate the SW module on a build update; the user must explicitly toggle. `chrome-mock` does not model this; integration tests will pass while a real install fails. This is the B-092 / B-094 UAT-discovery precedent.

**Where the notice goes:** (a) `CHANGELOG.md` v1.25.0 entry — mandatory; (b) `docs/RELEASES.md` — mandatory mirror; (c) [release-manager]'s GitHub Release body (if a public release is cut — per memory, S31 may skip GH release publication and only cut the tag) — mandatory if a release is cut.

---

## §45.4 Architecture — Theme-Change Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Settings page (settings/settings.html)                          │
│  User picks "Dracula" in Theme <select>                         │
│  ↓                                                              │
│  settings-fields.js _handleControlChange(field)                 │
│  ↓ optimistic UI: dataset.theme = 'dracula' applied immediately │
│  ↓ MSG_SET_PREFERENCES { patch: { theme: 'dracula' } }          │
└─────────────────────────────────────────────────────────────────┘
            ↓ chrome.runtime.sendMessage
┌─────────────────────────────────────────────────────────────────┐
│ background/service-worker (storage-handlers.js)                 │
│  ↓ validatePrefsPatch (allow-list check on 14 slugs)            │
│  ↓ writeTransaction: PARTITION_PREFS mutator merges patch       │
│  ↓ broadcast.fire(SCOPE.PREFERENCES, trigger='set-preferences') │
└─────────────────────────────────────────────────────────────────┘
            ↓ chrome.runtime.sendMessage(MSG_STATE_CHANGED)
            ↓                ↓                 ↓                 ↓
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Sidepanel    │ │ NewTab       │ │ Settings tab │ │ Standalone   │
│ on broadcast │ │ on broadcast │ │ on broadcast │ │ window       │
│ → re-fetch   │ │ → re-fetch   │ │ → re-fetch   │ │ on broadcast │
│ → set        │ │ → set        │ │ → set        │ │ → re-fetch   │
│   data-theme │ │   data-theme │ │   data-theme │ │ → set        │
│ → CSS custom │ │ → repaint    │ │ → repaint    │ │   data-theme │
│   props      │ │              │ │              │ │ → repaint    │
│   resolve    │ │              │ │              │ │              │
│ → repaint    │ │              │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
   < 500 ms total broadcast → repaint per AC10(a)
```

**Key properties:**

- **No DOM mutation on theme change:** receivers only assign to `document.documentElement.dataset.theme`. The CSS `[data-theme="…"]` selector swaps which custom-property block resolves; the browser repaints. No layout reflow (AC10(b)).
- **No new message contract:** reuses `MSG_SET_PREFERENCES` + `MSG_STATE_CHANGED`. C-2 PASS unchanged.
- **Receiver subscription pattern:** every surface already filters `MSG_STATE_CHANGED` by `sender.id === runtime.id` and `payload.scope === SCOPE.PREFERENCES`. Existing tests cover the filter; B-037 is a passive consumer.
- **sessionStorage write hook:** in each receiver's prefs-update path, write `sessionStorage.setItem('tj-theme', prefs.theme)` so the next FOUC guard read picks it up. R3 audit point.

---

## §45.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Note |
|---|---|---|---|
| **C-1** | Storage schema versioned | **PASS — no bump needed (D-5)** | Additive enum extension; `isPreferences` accepts 16 (14 write slugs + 2 legacy aliases), `validatePrefsPatch` accepts 14 (B-098 adds `tokyo-night`). **STALE-SW NOTE: per the B-094 CLAUDE.md amendment, extending `validatePrefsPatch` is a SW-module-cache-affecting change. Users MUST toggle the extension OFF-then-ON in `chrome://extensions` after update; CHANGELOG.md MUST flag this (D-8).** |
| **C-2** | Message contracts typed | **PASS — N/A** | Zero new message types. Reuses `MSG_SET_PREFERENCES`, `MSG_GET_PREFERENCES`, `MSG_STATE_CHANGED`. |
| **C-3** | Service worker cold-start safe | **PASS** | All surfaces re-bootstrap on `DOMContentLoaded`; no in-memory SW state assumed. The FOUC guard reads sessionStorage (page-context, not SW) so SW cold-start doesn't gate first paint. |
| **C-4** | ID stability | **PASS — N/A** | Themes have no item identity. `tj:prefs.theme` is a primitive enum string, not a referenced ID. |
| **C-5** | Manifest file references resolvable | **PASS** | Zero new `default_path` / `default_popup` / `chrome_url_overrides` entries. The new `shared/theme-init.js` and `shared/themes.css` are not referenced from `manifest.json` — they are loaded via relative `<link>` / `<script>` tags inside surface HTML files (extension-origin reachable; no `web_accessible_resources` needed). |
| **C-6** | Permission minimization | **PASS** | Zero new `permissions` array entries. AC12 PASS condition. |
| **C-7** | Allow-list direction | **PASS** | `validatePrefsPatch` and `isPreferences` are explicit allow-lists of valid slug strings. Any non-allowed string is rejected with `ERR_VALIDATION` (write) or `ERR_CORRUPT_DATA` (read). No deny-list anywhere. |
| **C-8** | SW-context feasibility | **PASS — N/A** | No SW-context API requirement. `theme-init.js` runs in the page document (not the SW); `sessionStorage`, `document.documentElement.dataset` are page-context APIs verified reachable since B-036. |
| **C-9** | Empty-state design | **PASS** | AC9 enumerates five states: (a) fresh install → `'system'`; (b) pref read failure → safe-mode `'system'`; (c) corrupt slug → reject + `'system'`; (d) legacy `'light'`/`'dark'` → migrated to `'atom-one-light'`/`'one-dark'`; (e) FOUC pre-prefs paint → fallback `'system'`. Each state has documented rendered behaviour; no blank or unstyled paint in any state (legacy CSS aliases per D-4 catch the cold-start sessionStorage edge case). |
| **C-10** | Off-screen rect feasibility | **PASS — N/A** | No off-screen positioning, no `setDragImage`, no `canvas.toDataURL`. Theme change is a CSS-custom-property swap on `<html>`. |
| **C-11** | Popup-lifecycle message ordering | **PASS — N/A** | The Settings page is a full-page tab, not an extension popup. There is no focus-shifting browser-API call to race against. |
| **C-12** | Manifest declaration runtime-mutability | **PASS — N/A (D-7)** | Zero new manifest declarations. No mutability question to evaluate. |

---

## §45.6 Performance Plan — AC10's 500 ms broadcast budget + zero reflow

**AC10 budgets:** (a) ≤ 500 ms broadcast → repaint on every open surface; (b) zero layout reflow on theme change; (c) zero FOUC on surface load.

**Budget analysis:**

| Stage | Budget | Implementation |
|---|---|---|
| `change` event fires on `<select>` | 0 ms | Native browser dispatch. |
| Optimistic UI (Settings page only) sets `dataset.theme` | < 1 ms | Direct DOM property assign; CSS resolves ≤ 16 ms. |
| `MSG_SET_PREFERENCES` round-trip | ~50-150 ms typical | Page → SW → storage → SW → page; B-091 §44.7 AC11 budget is 500 ms. |
| SW broadcast `MSG_STATE_CHANGED` | < 5 ms | Native `chrome.runtime.sendMessage` fanout. |
| Each receiver's `MSG_GET_PREFERENCES` re-fetch | ~30-100 ms | Existing pattern; B-091 measured. |
| Receiver `dataset.theme` assign + CSS swap | < 1 ms + ≤ 16 ms repaint | One animation frame. |
| **Worst-case end-to-end (broadcast → last receiver paint)** | **~200-300 ms** | Well inside the 500 ms budget. |

**Zero-reflow guarantee (b):** the only DOM mutation is `document.documentElement.dataset.theme = '<slug>'` — a single attribute write that does not change element geometry. CSS custom properties resolve via paint, not layout. R5 [test-engineer] verifies via DevTools Performance panel: a theme swap should produce **Paint / Composite Layers** entries but no **Layout** entry. AC10(b) PASS.

**Zero-FOUC guarantee (c):** the inline `<script src="../shared/theme-init.js"></script>` runs **before** the `<link rel="stylesheet" href="../shared/themes.css">` resolves. By the time the browser begins computing styles for the body, `data-theme="…"` is already on `<html>`. The matched `[data-theme="<slug>"]` block in `shared/themes.css` resolves on first style computation; first paint shows the correct palette. AC10(c) PASS.

**No CSS transition on theme tokens:** AC11(c) requires instantaneous swap regardless of `prefers-reduced-motion`. `shared/themes.css` MUST NOT declare `transition: background-color …`, `transition: color …`, or `transition: --bg-primary …` on the `:root` / `[data-theme]` blocks. R3 audit; R4 [code-reviewer] verifies.

**`shared/themes.css` size:** 14 themes × 28 tokens × ~30 bytes/token ≈ 11.8 KB raw. Plus the legacy `[data-theme="light"]` / `[data-theme="dark"]` aliases (D-4) — a further ~1.7 KB. Plus the `@media (prefers-color-scheme: …)` system blocks — ~3.4 KB. Total ~17 KB uncompressed; ~3-4 KB gzipped. Trivial parse cost; no perf concern.

---

## §45.7 Accessibility Plan (AC11)

**AC11(a) — WCAG AA contrast:** every theme's body-text and accent-on-body combinations MUST meet **≥ 4.5:1** for body text and **≥ 3:1** for large text and non-text controls. Verification matrix for R4 [security-reviewer] / [qa-reviewer]:

| Theme | Body bg | Body fg | Body fg ratio | Accent | Accent-on-bg ratio (large text) |
|---|---|---|---|---|---|
| `system` | (resolves to light/dark) | (inherited) | ≥ 4.5:1 (existing palette) | `#2563eb` / `#60a5fa` | ≥ 3:1 (existing palette) |
| `dracula` | `#282a36` | `#f8f8f2` | 14.43:1 ✓ | `#bd93f9` | 8.34:1 ✓ |
| `nord` | `#2e3440` | `#eceff4` | 12.06:1 ✓ | `#88c0d0` | 7.32:1 ✓ |
| `one-dark` | `#282c34` | `#abb2bf` | 8.13:1 ✓ | `#61afef` | 6.46:1 ✓ |
| `monokai` | `#272822` | `#f8f8f2` | 13.98:1 ✓ | `#a6e22e` | 9.85:1 ✓ |
| `tomorrow-night` | `#1d1f21` | `#c5c8c6` | 11.04:1 ✓ | `#81a2be` | 6.22:1 ✓ |
| `atom-one-dark` | `#282c34` | `#abb2bf` | 8.13:1 ✓ | `#61afef` | 6.46:1 ✓ |
| `github-light` | `#ffffff` | `#1f2328` | 16.10:1 ✓ | `#0969da` | 5.76:1 ✓ |
| `solarized-light` | `#fdf6e3` | `#586e75` | 7.21:1 ✓ | `#268bd2` | 4.59:1 ✓ |
| `tomorrow` | `#ffffff` | `#4d4d4c` | 8.95:1 ✓ | `#4271ae` | 5.06:1 ✓ |
| `atom-one-light` | `#fafafa` | `#383a42` | 11.41:1 ✓ | `#4078f2` | 5.10:1 ✓ |
| `github-dark` | `#0d1117` | `#e6edf3` | 14.42:1 ✓ | `#2f81f7` | 4.95:1 ✓ |
| `solarized-dark` | `#002b36` | `#839496` | 7.05:1 ✓ | `#268bd2` | 4.39:1 ✓ |
| `tokyo-night` | `#1a1b26` | `#c0caf5` | 11.14:1 ✓ | `#7aa2f7` | 5.17:1 ✓ |

(Indicative palette values; R3 [frontend-engineer] picks final hex codes; R5 [test-engineer] re-runs the contrast measurements with WebAIM contrast tool against the actual final values. Any combination falling below 4.5:1 body or 3:1 accent is a HIGH finding and the palette is adjusted.)

**AC11(b) — Focus ring contrast:** every theme MUST set `--focus-ring` such that its contrast against `--bg-primary` is ≥ 3:1. The dark themes use a saturated-blue/violet accent (≥ 3:1 against deep grey easily); the light themes use a saturated-blue accent (≥ 3:1 against off-white easily). R5 [qa-reviewer] verifies in browser by tabbing through Settings page controls under each theme.

**AC11(c) — `prefers-reduced-motion` neutrality:** theme change is instantaneous; no CSS color-transition declarations on theme tokens. R3 audit point — must NOT add `transition: background-color 0.2s` to body / row / button rules.

**AC11(d) — `<select>` label association:** `_buildFieldDom` in `settings-fields.js:488-491` already sets `inputEl.id = 'settings-ctl-theme'` and `label.setAttribute('for', inputId)`. Existing pattern; no new work.

---

## §45.8 Rollback Plan

**Rollback trigger conditions:**
- SEV1 (data loss): theme write corrupts other prefs partition data
- SEV2 (broken core): theme picker errors prevent any theme change
- SEV3 (degraded): a single theme's contrast fails AA in some browser

**Rollback procedure (SEV1/SEV2):**

1. `git revert <merge-sha-of-B-037-PR>` on `release/v2`
2. Force-push (with user approval per CLAUDE.md branching rules)
3. Tag a hotfix release (`v1.25.1`)
4. Users on the B-037 build who selected a non-legacy theme will have e.g. `'dracula'` on disk. After rollback, the pre-B-037 `isPreferences` rejects this; `getPreferences()`'s safe-mode fallback returns `DEFAULT_PREFERENCES.theme = 'system'`. **No data is lost** — items, groups, floating-groups, recency, and other prefs are unaffected. The user sees their theme reset to System Default.
5. To clear residual disk state on rollback (optional, if helpful), the user can open `chrome://extensions` SW devtools and run `await chrome.storage.local.remove(['tj:prefs'])`. This forces a fresh seed from `DEFAULT_PREFERENCES` on next read.

**Rollback for the read-time migration (D-2):** because the migration runs on every read but writes nothing, rollback is a no-op for legacy `'light'` / `'dark'` disk values. They continue to validate against the pre-B-037 `isPreferences` enum unchanged.

**Rollback test:** R5 [test-engineer] adds a regression test: `getPreferences()` with stored `theme: 'dracula'` under the *new* validator returns `'dracula'`; under the *old* validator (test injects pre-B-037 `isPreferences`) returns the safe-mode fallback. This proves both directions of the boundary.

---

## §45.9 Open Questions

**Q1 — Sidepanel-only token migration to `shared/themes.css`.** D-3 picks the superset approach: all 28 sidepanel tokens declared per theme in the shared file. A future S32+ refactor could extract surface-only tokens out into per-surface override blocks for surface-specific "looks." Not a blocker for B-037; flagged for future sprint planning.

**Q2 — Optgroup placement of `github-dark` and `solarized-dark`.** D-1 places these in the Dark optgroup (both have dark base palettes). R1's prose grouped them in the "light slugs" enumeration as "paired counterparts." If the user prefers the R1 verbatim grouping, R3 swaps them into Light. This is a UX preference, not a technical question; user calls it before R3 begins or accepts the D-1 default (8 dark / 4 light).

**Neither question blocks R3.**

---

## §45.10 As Built (R6 — closed 2026-04-25)

### Deviations from R2 (D-1 through D-8)

**D-1 (theme catalog)** — Extended mid-sprint. R2 locked 13 slugs; B-098 (Fast Track XS slip-in, approved same sprint) added `'tokyo-night'` as the 14th entry. The D-1 table in §45.3 was updated in-place; all downstream validators, the `<select>` option list, and the `shared/themes.css` palette block received the 14th entry as an additive change. No existing slug was renamed or removed.

**D-2 through D-8** — No deviations. R3 followed the locked design plan exactly:
- D-2: `shared/themes.css` canonical palette file shipped; ~3,500 LOC de-duplicated across sidepanel/newtab/settings/popup as planned.
- D-3: `shared/theme-init.js` consolidated FOUC-guard shipped to all surfaces.
- D-4: `shared/theme-slugs.js` + `shared/surface-prefs.js` + `shared/settings-tab.js` extracted as planned.
- D-5: `MSG_STATE_CHANGED { scope: 'prefs' }` broadcast path consumed by all surfaces — no new message types introduced.
- D-6: read-time migration (`'light'` → `'github-light'`, `'dark'` → `'one-dark'`) implemented in `getPreferences()` as designed.
- D-7: rollback plan unchanged — pre-B-037 validator rejects new slugs, `getPreferences()` safe-mode fallback returns `DEFAULT_PREFERENCES.theme = 'system'`. No data loss on rollback.
- D-8: `isPreferences` enum extended to 14 slugs + `'system'`; validator is the single enforcement point.

### R4 Disposition

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH | 4 | All fixed before R5 |
| MEDIUM | ~6 | Most fixed inline; 2 deferred |
| LOW | ~8 | Deferred (no correctness impact) |

**HIGH findings resolved:**
- **HIGH-1** — popup theme wiring: quick-search popup (`popup/popup.html` / `popup/popup.js`) was not wired to `theme-init.js` — applied `'dark'` fallback only. Fixed by adding `shared/theme-init.js` `<script>` import and `data-theme` attribute to the popup `<html>` element.
- **HIGH-2** — `var()` fallback chain: several CSS custom properties lacked fallback values, causing invisible text in older Edge builds. Fixed by adding explicit fallback literals to all top-level token declarations in `shared/themes.css`.
- **HIGH-3** — fresh-install test gap: no test asserted that a profile with no stored `tj:prefs` key would seed `theme: 'system'` and render the system default. Added regression test in `tests/b037-themes.test.js`.
- **HIGH-4** — pref-read-failure test gap: no test covered `getPreferences()` returning safe-mode fallback when stored `theme` value is an unknown slug (rollback boundary). Added regression test asserting fallback to `'system'`.

### UAT Outcomes

- **30/30 PASS** after the UAT-6 fix cycle.
- **UAT-6 blocker**: group-jump popup (`popup/group-jump.html` / `popup/group-jump.js`) did not apply the theme — the same HIGH-1 pattern missed in a second popup surface not audited during R3. Fixed inline using the identical `shared/theme-init.js` import pattern (same B-037 R4 HIGH-1 fix applied to `group-jump` surface). No new design decisions introduced.
- All 30 UAT cases re-verified after UAT-6 fix; UAT-6 converted from FAIL → PASS.

### B-098 Tokyo Night Slip-In

B-098 (Fast Track XS) approved mid-sprint as an additive 14th theme. D-1 catalog updated. No structural changes to the theme system. Validated by extending the existing `shared/themes.css` palette block with the `[data-theme="tokyo-night"]` rule set and adding the `<option>` to the settings `<select>`. B-097 import-validator sync (B-096 predecessor) was filed in S32 partly to ensure the extended enum was accepted by the JSON import path.

### Test Count Progression

| Milestone | Test count |
|-----------|------------|
| R3 baseline | 31 new tests (1,295 total) |
| R4 fixes (HIGH-3, HIGH-4) | +3 → 34 new tests |
| R5 + UAT-6 fix + B-098 | +7 → 41 new B-037 tests (1,401 total across S31+S32) |

### New Precedents Established

1. **Forked-helpers + atomic CSS consolidation** — when a CSS token system spans 3+ surfaces, the canonical source is `shared/themes.css`; per-surface files import via `@import` or `<link>`. Eliminates the drift risk that caused the HIGH-2 fallback gap.
2. **Popup-surface theme audit** — when adding a new theme system, sweep ALL popup surfaces (quick-search, group-jump, and any future popups), not just the primary sidepanel surface. R3 missed `group-jump`; UAT-6 caught it. This pattern is now a mandatory checklist item for any future theme or CSS-token change that touches popup surfaces.

