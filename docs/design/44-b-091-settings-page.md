# §44 — B-091 Settings Page Redesign (R2 Design)

**Sprint:** 30
**Tier:** Spike-First (L)
**Status:** R2 complete (2026-04-23) — READY FOR R3 · R6 will add "As Built" delta
**Owner:** [solution-architect]
**Depends on:** §41 (B-035 standalone window — `chrome.tabs.create`/`update` "focus existing else create" dispatcher precedent), §42 (B-036 newtab — full-page extension surface, vanilla DOM render strategy, `theme-init.js` FOUC guard, `chrome.runtime.sendMessage` bootstrap, broadcast-receiver pattern), §43 (B-038 view-mode pref — `displayMode` key normative + `renderSelect` consumer pattern), §10.10 (broadcast architecture — `MSG_STATE_CHANGED` delivery model with `SCOPE.PREFERENCES`), B-089 (settings-dialog scaffolding being deprecated), R0 spike memo `docs/design/44-b-091-settings-page-r0-spike.md` (D-1 surface lock — binding contract)
**R0 spike:** `docs/design/44-b-091-settings-page-r0-spike.md` — surface lock, risk inventory, reuse strategy, manifest-zero claim. This R2 chapter is the canonical §44 design entry; the R0 spike memo lives alongside it as the surface-strategy contract.
**Out-of-scope (explicit):** (a) theme picker UI — B-037 S31; (b) import/export controls UI — B-093 Wave 1 Sprint 30; (c) dense-layout toggle UI — B-092 Wave 1 Sprint 30; (d) storage schema changes — none; `tj:prefs` shape unchanged; (e) keyboard shortcut for opening Settings — deferred S31+ (would need new `commands` manifest entry); (f) "Back to bookmarks" navigation button — omitted by design (closing the tab is the natural exit); (g) toolbar popup B-082 Settings entry — future polish; (h) Settings tab close-on-navigate behaviour (the page never auto-closes itself).

---

## §44.1 Overview

B-091 migrates the user-facing Settings surface from the B-089 sidepanel-hosted `<dialog>` modal into a **full-page extension surface opened via `chrome.tabs.create`**. The new surface (`settings/settings.html`) hosts the existing prefs (B-038 `displayMode` select, B-040 `autoCollapseSubGroups` toggle), reserves placeholder containers for Wave 1 consumers (B-092 dense-layout toggle in the "Layout" section, B-093 import/export buttons in the "Data" section), and seeds an inactive "Theme" placeholder section so S31 B-037 ships into a known DOM slot. The gear button in the sidepanel header (`#sidepanel-settings-btn`) is repointed from "open the modal" to a "focus-existing-else-create-new tab" dispatcher modelled on §41 B-035 D-3 option (c). The B-089 modal — its module file (`sidepanel/settings-dialog.js`), its DOM block (`#settings-dialog` and children inside `#dialog-overlay`), its imports + init wiring + Wave 1 `renderSettingsToggle`/`renderSettingsSelect` calls in `sidepanel/sidepanel.js`, and the dialog-only CSS shell (`.settings-dialog` max-width override) — is **deleted atomically in the same R3 commit** that introduces the new files. The non-dialog-specific control CSS (`.settings-section`, `.settings-row`, `.settings-toggle`, `.settings-select`) is **moved verbatim** from `sidepanel/sidepanel.css` to `settings/settings.css` so the visual tokens carry forward without divergence. Per the R0 spike: **zero new manifest declarations, zero new permissions, zero storage schema changes, zero new message contracts, zero new `web_accessible_resources` entries**. The reuse surface is the `MSG_GET_PREFERENCES` / `MSG_SET_PREFERENCES` / `MSG_STATE_CHANGED` triad (§10.10 broadcast pattern), the `chrome.tabs.*` namespace under the existing `tabs` permission, the theme-init pre-paint resolver pattern (§42 newtab precedent), and the byte-for-byte field-helper API (`renderToggle({ key, label, defaultValue, section })` + `renderSelect({ key, label, options, defaultValue, section })`) preserved into the forked `settings/settings-fields.js` module. R3 lands ~700 net LOC; R5 measures perf against the AC11 budgets (paint < 300 ms, prefs round-trip < 200 ms, save round-trip < 500 ms); R6 documents As-Built deltas in §44.10.

---

## §44.2 Existing-State Reality Check

**Today (2026-04-23 on `feature/sprint-30-settings-redesign`, branched off `release/v2`):**

- B-089 ships in v1.23.0 as a sidepanel-hosted `<dialog role="dialog" aria-modal="true">` modal at `sidepanel/sidepanel.html:233-241`, hosted inside the shared `#dialog-overlay` container at `sidepanel/sidepanel.html:161`. The dialog's content region (`#settings-content`, `#settings-error`) is populated programmatically by `sidepanel/settings-dialog.js` — a 579-LOC module exporting `init(deps)`, `openSettingsDialog`, `closeSettingsDialog`, `renderToggle`, and `renderSelect`. The module owns its own field registry (`_fields`, `_fieldsByKey`, `_prefsSnapshot`), its own broadcast subscription (sender-id-validated, `SCOPE.PREFERENCES`-filtered), and its own optimistic-UI-with-revert change handler.
- The gear button (`#sidepanel-settings-btn`) at `sidepanel/sidepanel.html:77-82` sits in the sidepanel header's right-aligned button cluster (after the `#import-json-btn`); its click handler is wired by the B-089 module's `init()` at `sidepanel/settings-dialog.js:93-97` to call `openSettingsDialog(triggerBtnEl)`.
- `sidepanel/sidepanel.js:93-98` imports `init as initSettingsDialog`, `closeSettingsDialog`, `renderSelect as renderSettingsSelect`, `renderToggle as renderSettingsToggle`. `sidepanel/sidepanel.js:171-175` declares the five DOM refs (`settingsBtnEl`, `settingsDialogEl`, `settingsContentEl`, `settingsErrorEl`, `settingsCloseBtnEl`). `sidepanel/sidepanel.js:826-837` calls `initSettingsDialog(...)` with the eight-key dependency object (`overlayEl`, `dialogEl`, `contentEl`, `errorEl`, `closeBtnEl`, `triggerBtnEl`, `activateFocusTrap`, `deactivateFocusTrap`, `sendMessage`, `runtime`).
- Wave 1 pref registrations live at `sidepanel/sidepanel.js:843-852` (`renderSettingsSelect` for `displayMode`) and `sidepanel/sidepanel.js:872-877` (`renderSettingsToggle` for `autoCollapseSubGroups`). The B-039 `renderSettingsToggle` was dropped at S29 close (the comment block at `sidepanel/sidepanel.js:854-861` documents the rationale).
- `sidepanel/sidepanel.js:606-634`'s `closeDialog()` global-Escape handler contains a B-089 branch at lines 615-617 that routes through `closeSettingsDialog()` so the module's `_triggerEl` cleanup + focus-restore path runs. This branch becomes dead on B-091 R3 and is removed.
- `sidepanel/sidepanel.css:966-1119` contains 154 lines of settings-specific CSS spanning `.settings-dialog` (dialog-only max-width override at 970-973), `.settings-content` (`.dialog-modal` interior), `.settings-section` (fieldset shell at 983-994), `.settings-section-legend` (header label at 996-1003), `.settings-row` (label/control row at 1005-1027), `.settings-toggle.*` (custom pill toggle at 1029-1089), `.settings-select` (native `<select>` styling at 1091-1110), `.settings-row-error` (inline row error at 1112-1119). Of these: **one rule (`.settings-dialog` at 970-973) is dialog-specific and must be deleted; the remaining 13 rules are control-specific and must be moved to `settings/settings.css`** so the new page paints the same visual.
- `manifest.json` is at v1.23.0 with `permissions: ["tabs", "tabGroups", "storage", "sidePanel", "search"]`. No `web_accessible_resources`. `chrome_url_overrides.newtab` points at `newtab/newtab.html` (B-036 surface). No `commands` entry for Settings. **Zero changes anticipated for B-091.**
- B-089's tests live in `tests/b089-settings-dialog.test.js` (count not surveyed at R2; R5 [test-engineer] inventories deletion vs port). The Wave 1 consumer tests (B-038 `displayMode`, B-040 `autoCollapseSubGroups`) operate at the message-dispatch layer + DOM-render layer; some assertions reference `#settings-dialog`/`#settings-content` and require selector updates to the new page DOM.

**No pre-existing B-091 code, no partial implementation, no unreviewed scaffolding. Greenfield page; surgical removal of B-089.**

---

## §44.3 Design Decisions (D-1 through D-10)

### D-1 — Surface (LOCKED at R0)

**Choice: `chrome.tabs.create({ url: chrome.runtime.getURL('settings/settings.html') })` — dedicated tab.** This is the binding R0 spike §44.2 decision. Candidates A (sidepanel takeover), C (popup window), D (bigger modal) were rejected at R0 for the reasons enumerated in the spike. **R2 does NOT re-litigate D-1.** Any deviation requires a new R0 spike and product-owner sign-off.

R3 dispatcher invocation:

```js
// In sidepanel.js gear-button click handler — see D-2
const SETTINGS_URL = chrome.runtime.getURL('settings/settings.html');
chrome.tabs.create({ url: SETTINGS_URL }).catch((err) => {
  showToast('Could not open Settings');
  console.warn('[tab-junkie] settings tab create failed', err);
});
```

The page lives at `chrome-extension://<extension-id>/settings/settings.html` — extension-origin, reachable to the extension itself without any `web_accessible_resources` declaration (WAR is for cross-origin reachability only). The user can refresh the tab, bookmark it, or pin it; none of those affect the page's correctness because the page bootstraps fresh on every `DOMContentLoaded` (C-3 cold-start safe).

### D-2 — Tab dispatcher home: sidepanel-context (gear-button click handler in `sidepanel/sidepanel.js`)

**Choice: dispatch directly from the sidepanel-context gear-button click handler.** Do NOT route through the SW.

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| (a) Sidepanel-context dispatcher — gear `click` handler in `sidepanel/sidepanel.js` calls `chrome.tabs.query` + `chrome.tabs.update`/`chrome.tabs.create` directly | Zero new message contracts (C-2 stays N/A); dispatcher state + error handling co-located with the toast surface that displays failure (R-4 mitigation); fewer moving parts; trivial to test in isolation; matches the §41 B-035 D-3 option (c) structural pattern but in extension-page context rather than SW context | The 2-3 lines of `chrome.tabs.*` orchestration live inside `sidepanel.js` rather than centralised in a SW dispatcher. Cosmetic at this scope | **Chosen** |
| (b) SW-context dispatcher — gear sends `MSG_OPEN_SETTINGS_PAGE` to SW; SW does `chrome.tabs.query` + dispatch | Centralises window dispatching with the B-035 SW pattern | Adds a new message type (C-2 PASS-with-new-contract); doubles the IPC count for a pure browser-API call that needs no storage; the toast on failure must round-trip back to the sidepanel; no functional benefit | Rejected |
| (c) Hybrid — sidepanel queries first, SW only on fallback | Worst of both | More moving parts; no benefit | Rejected |

**Rationale:** C-2 cleanliness (no new message types) plus subscription/lifecycle simplicity per spike R-3. The dispatcher reads zero state, writes zero state, and uses no storage — there is nothing the SW gives us beyond an unnecessary IPC hop. The B-035 precedent is SW-side because B-035 is keyboard-shortcut-driven (`chrome.commands.onCommand` is SW-only); the gear button is a sidepanel-context click event with no such constraint.

**R3 implementation contract:**

```js
// sidepanel/sidepanel.js — replaces the B-089 gear-button wiring (which lived
// inside settings-dialog.js's init()). After B-091 R3, the gear-button click
// listener is owned directly by sidepanel.js.
const SETTINGS_PAGE_URL = chrome.runtime.getURL('settings/settings.html');

settingsBtnEl.addEventListener('click', () => {
  openOrFocusSettingsTab().catch((err) => {
    showToast('Could not open Settings');
    console.warn('[tab-junkie] settings dispatcher failed', err);
  });
});

async function openOrFocusSettingsTab() {
  // Focus-existing-else-create per §41 D-3 option (c) precedent.
  const matches = await chrome.tabs.query({ url: SETTINGS_PAGE_URL });
  if (Array.isArray(matches) && matches.length > 0) {
    const tab = matches[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (typeof tab.windowId === 'number') {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: SETTINGS_PAGE_URL });
}
```

**Idempotency:** `chrome.tabs.query({url})` accepts a wildcard-matchable URL pattern; for an exact extension-origin URL the query returns at most a small set of tabs hosting that exact URL across all windows. The dispatcher takes the first match — sufficient for "focus existing." If two tabs somehow exist (e.g., user manually duplicates), the second is ignored; not a correctness issue.

**Cold-start safety:** the dispatcher holds zero in-memory state between invocations. Every gear click re-queries. Per-trigger cost is negligible (sub-millisecond browser-local API call).

**Failure surface:** AC2 mandates a toast on dispatcher failure. The `.catch(...)` above routes through the existing `showToast(...)` helper at `sidepanel/sidepanel.js:1688-1693`. R5 UAT exercises the path.

### D-3 — Focus management on page load: skeleton state during async prefs fetch; first focusable control on resolve

**Choice:** the page boots with the page chrome rendered (header + section fieldsets + skeleton placeholder rows) but with the field controls in a **disabled-skeleton state**; on `MSG_GET_PREFERENCES` resolution the controls are enabled and **focus moves to the first focusable control** (B-038 `displayMode` `<select>`, since it is registered first into the "Display" section). On error, focus moves to the page-level error banner's "Reload" button (AC10a).

**Race window:** between `DOMContentLoaded` firing and the `MSG_GET_PREFERENCES` round-trip resolving (typical: ~30-100 ms; cold SW: up to ~200 ms), the user cannot interact with controls but can see the page chrome (heading, section legends, skeleton row placeholders). This is the same skeleton pattern the sidepanel uses for first-paint hydration (`#skeleton` element at `sidepanel/sidepanel.html`). No focus-stealing mid-fetch.

**Skeleton DOM specification:**

```html
<!-- Inside each <fieldset class="settings-section"> until prefs load -->
<div class="settings-row settings-row--skeleton" aria-hidden="true">
  <span class="settings-row-label settings-row-label--skeleton"></span>
  <span class="settings-row-control settings-row-control--skeleton"></span>
</div>
```

The skeleton row is replaced by the real `<label for> + <input>`/`<select>` pair when `_applySnapshotToControls(prefs)` runs in `settings-fields.js`. R3 implements as a DOM-replacement (skeleton row removed; real row appended) inside `_buildFieldDom`'s first call, OR as a CSS `aria-busy="true"` overlay on the section — implementation choice for [frontend-engineer]; ARIA-busy is the more accessible approach.

**Page-level focus on success path (R3 contract):**

```js
// settings/settings.js — after prefs load resolves
const firstControl = settingsFields._firstFocusableControl(); // exposed by forked module
if (firstControl && typeof firstControl.focus === 'function') {
  firstControl.focus({ preventScroll: false });
}
```

**Page-level focus on error path:**

```js
// settings/settings.js — on prefs load failure
const reloadBtn = document.getElementById('settings-reload-btn');
if (reloadBtn && typeof reloadBtn.focus === 'function') {
  reloadBtn.focus();
}
```

**Tab order:** standard DOM order. `<h1>` → first `<fieldset>` `<legend>` (not focusable) → first `<input>`/`<select>` → next control → next section → ... → last section. R3 must NOT add `tabindex` overrides; the natural document order is the AT-correct order.

**No focus trap:** unlike B-089 which trapped focus inside the modal, the Settings page is a full tab. The browser's native focus model (Tab cycles through all focusable elements; focus can leave via address bar via Tab to browser chrome) applies. Removing the focus trap is one of the structural simplifications that makes the forked module shorter.

### D-4 — Performance budget: paint < 300 ms; prefs < 200 ms; save round-trip < 500 ms

**Per AC11.** R5 measures these. R2 specifies the methodology and the implementation choices that hit the budgets.

| Budget | Measurement methodology | Implementation that hits it |
|---|---|---|
| **First paint < 300 ms** (`chrome.tabs.create` invocation → `DOMContentLoaded` paint visible) | UAT timestamp probes at the gear-click instant and the first frame after `DOMContentLoaded`. Edge desktop instance, cold extension load. | Static HTML shell with no inline JS render; CSS is a single ~250 LOC file (port of 154 LOC from sidepanel.css + ~100 LOC of page-layout rules); `theme-init.js` is ~5 LOC synchronous; main JS module is `<script type="module" src="settings.js">` in `<head>` with no `defer` (MV3 modules defer implicitly). 300 ms is generous for a static page; the sidepanel hits 200 ms with a 1743-LOC CSS file and a 6863-LOC JS module. |
| **`MSG_GET_PREFERENCES` round-trip + control paint < 200 ms** | UAT timestamp probes at `_dispatchGetPreferences()` start and `_applySnapshotToControls(...)` return. | Single message round-trip (no fan-out, no aggregation); SW's `MSG_GET_PREFERENCES` handler reads `chrome.storage.local['tj:prefs']` once + applies `DEFAULT_PREFERENCES` merge — fast even on cold SW because `readyPromise` gating completes before the first user action. |
| **Pref save round-trip + broadcast delivery < 500 ms** | UAT timestamp probes at control `change` event and the broadcast-resolved `_applySnapshotToControls(...)` return on a SECOND open Settings tab. | Single `MSG_SET_PREFERENCES` round-trip + SW broadcast fan-out (§10.10 pattern). Optimistic UI on the originating tab (the control reflects the new value immediately; revert only on error). |

**No performance regression on the sidepanel side:** the gear-button repointing (D-2) replaces an `openSettingsDialog(...)` call (which fetched + painted within the modal) with an `openOrFocusSettingsTab(...)` call (which fires `chrome.tabs.create`). The new path is faster on the sidepanel side because no DOM render happens in-panel.

### D-5 — Broadcast subscription lifecycle: subscribe on `init()`; tab close GCs the JS context

**Choice: `settings-fields.js`'s `init()` registers the broadcast listener on module-load via `chrome.runtime.onMessage.addListener(...)`. The listener is sender-id-validated against `chrome.runtime.id` and scope-filtered to `SCOPE.PREFERENCES`.** Tab close GC's the JS realm and its listeners automatically. **No explicit `removeListener` is required** — per R0 spike R-3 analysis.

**R3 contract:**

```js
// settings/settings-fields.js — init() body, ported verbatim from B-089's
// init() at sidepanel/settings-dialog.js:99-115 (the sender-id + scope filter).
function init({ contentEl, errorEl, sendMessage, runtime }) {
  if (_deps) return; // idempotent (test re-init via _resetForTest)
  _deps = { contentEl, errorEl, sendMessage, runtime };

  // Broadcast listener — exact same contract as B-089. Sender-id check is
  // mandatory (cross-extension messages are rejected). Scope filter is
  // mandatory (other scopes — items, groups, liveState, windowMap — must
  // be ignored cleanly).
  if (!_onRuntimeMessage && runtime && runtime.onMessage && typeof runtime.onMessage.addListener === 'function') {
    _onRuntimeMessage = (msg, sender) => {
      if (!sender || sender.id !== runtime.id) return;
      if (!msg || msg.type !== MSG_STATE_CHANGED) return;
      const scope = msg.payload && msg.payload.scope;
      if (scope !== SCOPE.PREFERENCES) return;
      _refreshFromBroadcast().catch(() => { /* non-fatal */ });
    };
    runtime.onMessage.addListener(_onRuntimeMessage);
  }
}
```

**Lifetime invariants:**
- Listener attaches once per page load (idempotent guard).
- A second simultaneous Settings tab attaches its own listener in its own JS realm — both update on broadcast.
- Tab refresh: page reloads → fresh `init()` → fresh listener. No accumulation; the previous JS realm is GC'd by the browser.
- Tab close: browser tears down the page's JS realm; the listener is GC'd along with `_deps`, `_fields`, `_fieldsByKey`, `_prefsSnapshot`, `_onRuntimeMessage`. No SW-side leak (the SW does not track per-page subscriptions; it broadcasts to all extension-page contexts and the browser routes).
- SW restart: not relevant on the receive-side; the SW restart resumes broadcasts from new mutations, and the page's listener continues to receive them.

**Test plan (R5):** open Settings, open a second Settings, toggle a pref in one, observe the second updates. Close both, reopen, no listener accumulation visible (heap snapshot or test-harness assertion).

### D-6 — Accessibility plan in detail

**ARIA landmarks:**
- `<main role="main">` wraps all settings content. (B-091 emits `<main>` directly; the implicit `role="main"` is sufficient — explicit `role` only when the element doesn't carry the role natively.)
- **No `<nav>` landmark** — the page is a flat 5-section vertical layout with no in-page navigation menu. Adding `<nav>` would be a false landmark for AT users. If a future "in-page anchor TOC" is added, that element gets `<nav aria-label="Settings sections">` at that time.
- No `<aside>`, no `<header>` beyond the page `<h1>`, no `<footer>` (the AC15-deferred "Close this tab to return" footnote, if added per AC out-of-scope (f), is plain `<p>` text inside `<main>`).

**Heading hierarchy:**
- `<h1>` — page title "Settings" (one and only h1).
- `<fieldset>` `<legend>` elements for each section ("Display", "Layout", "Groups", "Theme", "Data") — `<legend>` is **semantically the heading of a `<fieldset>`** in WAI-ARIA terms; AT users hear "[section name] group" when entering the fieldset, which is the correct affordance. **No `<h2>` is added** — adding `<h2>` alongside `<legend>` would create a duplicate heading (one for SR, one for visual) and is the wrong pattern. The R0 spike's R1 pre-condition #1 about "section ordering and labels" is satisfied by the `<legend>` text.
- No `<h3>` — sections do not have nested subsections in v1.

**Label associations (every control):**
- `<label for="settings-ctl-{key}">{label text}</label>` — explicit association via `for`/`id` pair. Matches B-089's `_buildFieldDom` pattern verbatim (`sidepanel/settings-dialog.js:502-504`).
- The form control's `id` is `settings-ctl-{key}` deterministically (e.g., `settings-ctl-displayMode`, `settings-ctl-autoCollapseSubGroups`).
- `aria-describedby` for inline row-error: each row has `<span class="settings-row-error" role="alert" aria-live="polite" id="settings-err-{key}">`. The control gets `aria-describedby="settings-err-{key}"` so AT announces the error inline.

**WCAG AA contrast:**
- All text uses CSS custom properties resolved by `theme-init.js` (`--text-primary`, `--text-secondary`, `--accent`, `--danger`, `--border-primary`, `--border-subtle`). These tokens ship today in `sidepanel/sidepanel.css`'s :root block and pass AA in both light and dark themes (verified by sidepanel R4 reviewers across multiple sprints). The Settings page reuses the same tokens — no new contrast risk.
- Toggle pill: `.settings-toggle__track` checked-state uses `var(--accent)` (passes AA against text); unchecked uses `var(--bg-active)` with `var(--border-primary)` 1px stroke (passes AA boundary contrast). Same as B-089.
- Disabled state: `opacity: 0.5` on track + `opacity: 0.6` on select — same as B-089. Sufficient AA contrast retained on text.

**Focus indicators:**
- `:focus-visible` uses `outline: 2px solid var(--focus-ring); outline-offset: 2px;` (toggle) and `border-color: var(--focus-ring); box-shadow: 0 0 0 2px var(--accent-subtle);` (select). Same as B-089. Visible in both themes.
- The page itself has no custom focus-trap (D-3) — natural Tab order applies; Shift+Tab cycles backward; Tab leaves the page via the browser's address bar/tab strip per platform default.

**Keyboard navigation:**
- Tab cycles through controls in DOM order: page is empty (h1 is not focusable) → first `<select>` (`displayMode`) → toggle `<input type="checkbox">` (`autoCollapseSubGroups`) → Wave 1 controls if/when they exist → past Wave 1, off the end of the document. Standard browser tab order.
- Enter/Space activates toggles per native checkbox semantics.
- Selects respect arrow-key navigation per native `<select>` semantics.
- No keyboard traps. No `tabindex` overrides. No JS-level focus management beyond D-3's initial-focus move and D-3 error-path Reload-button focus.

**axe-core check (R5):** R5 [test-engineer] runs `axe-core` against the loaded settings page (zero critical/serious violations target). The R0 spike's R1 pre-condition #5 (gear-button label) is resolved by AC7: `aria-label="Open Settings page"`.

### D-7 — Rollback plan

**Risk level:** LOW. Net new files (additive `settings/*` directory) plus targeted deletions in `sidepanel/*`. Zero storage migrations. Zero new permissions. Zero manifest changes.

**Rollback procedure:**

1. `git revert <B-091-merge-sha>` — reverts the merge of `feature/sprint-30-settings-redesign` into `release/v2`. This single command:
   - Deletes `settings/settings.html`, `settings/settings.js`, `settings/settings.css`, `settings/settings-fields.js`, `settings/theme-init.js`.
   - Restores `sidepanel/settings-dialog.js`.
   - Restores the `#settings-dialog` block in `sidepanel/sidepanel.html` (lines 233-241 plus the gear-button label reverting from "Open Settings page" to "Open settings").
   - Restores the `import { init as initSettingsDialog, ... }` block + the five DOM refs + the `initSettingsDialog(...)` call + the `renderSettingsSelect`/`renderSettingsToggle` calls + the `closeDialog()` settings branch in `sidepanel/sidepanel.js`.
   - Restores the 154 lines of settings-related CSS in `sidepanel/sidepanel.css`.
   - Restores the gear-button click listener wiring (back into the B-089 module's `init()`).
   - Restores the test file `tests/b089-settings-dialog.test.js` if R3 deleted it; restores any reverted assertions in B-038/B-040 tests.
   - Deletes `tests/b091-settings-page.test.js`.
2. **No data cleanup required** — the `tj:prefs` storage shape never changed. Any value the user wrote via the new Settings page is still valid for the old modal (same `displayMode`, same `autoCollapseSubGroups`).
3. **No manifest cleanup** — manifest never changed.
4. **Open Settings tab at revert time:** the user's existing Settings tab continues to render the (now-orphaned) HTML page, but `chrome.runtime.sendMessage` calls from it fail because the SW message handlers are unchanged (they're stable across the revert). The user closes the tab manually; no broken state remains. Post-revert, gear click opens the modal as before.
5. **Chrome Web Store / Edge Add-ons rollback:** build from pre-B-091 tag (v1.23.0), re-submit. No user data affected.

**Non-revert rollback (hotfix):** replace the gear-button click handler with the modal-open path while leaving the Settings page in place. Lower-effort hotfix if the page itself is broken but the tab dispatcher is fine.

**Storage schema changes:** **none.** No rollback procedure needed on the storage dimension.

### D-8 — Forked module API contract: `settings/settings-fields.js`

**Module shape — exact `init()` signature:**

```js
/**
 * One-time initialisation. Called from settings/settings.js after DOMContentLoaded.
 * Idempotent: subsequent calls are no-ops so listeners attach exactly once.
 * Tests call _resetForTest() between cases to reset _deps + state.
 *
 * @param {Object} deps
 * @param {Element} deps.contentEl  Container element where section <fieldset>s
 *                                   are appended (programmatic build of
 *                                   sections + rows, identical to B-089).
 * @param {Element} deps.errorEl    Top-of-page error banner element
 *                                   (Reload-button-bearing). Different from
 *                                   B-089 which used dialog-level inline error.
 * @param {(type: string, payload?: any) => Promise<any>} deps.sendMessage
 *                                   Promise wrapper around chrome.runtime.sendMessage.
 * @param {any} deps.runtime         chrome.runtime (for onMessage + id).
 */
export function init(deps);
```

**Dropped vs B-089:**
- `overlayEl` — removed (no overlay; page IS the surface).
- `dialogEl` — removed (no dialog).
- `closeBtnEl` — removed (no close button; close-tab is browser-owned).
- `triggerBtnEl` — removed (the gear button click handler is owned by `sidepanel/sidepanel.js` after R3, not by the forked module).
- `activateFocusTrap` / `deactivateFocusTrap` — removed (no focus trap on a full page).
- `openSettingsDialog` / `closeSettingsDialog` exports — removed (no open/close lifecycle; the page IS open as long as the tab is open).

**Preserved verbatim:**
- `renderToggle({ key, label, defaultValue, section })` — byte-for-byte API.
- `renderSelect({ key, label, options, defaultValue, section })` — byte-for-byte API.
- Internal state: `_fields` (ordered field array), `_fieldsByKey` (Map for fast lookup), `_prefsSnapshot` (most recent prefs object).
- `_handleControlChange(field)` — optimistic UI + revert on `MSG_SET_PREFERENCES` failure + inline row error display + `ERR_SAFE_MODE`-aware message text. Identical implementation to B-089 lines 533-559.
- `_buildFieldDom(field)` — section `<fieldset>` discovery/creation + row `<div>` + `<label for>` + control + inline error span. Identical implementation to B-089 lines 439-529 minus the `_clearInlineError`/`_setInlineError` calls (which become per-page error banner calls, not dialog-level).
- `_applySnapshotToControls(snapshot)` — identical.
- `_writeControlValue(field, value)` — identical (including the documented validity-check fallback for corrupt persisted values).
- `_readControlValue(field)` — identical.
- Broadcast listener — identical (sender-id check + scope filter + `_refreshFromBroadcast()` re-fetch).
- Test-only helpers: `_resetForTest()`, `_fireBroadcastForTest(scope)`, `_getFieldsForTest()` — ported verbatim. `_resetForTest()` clears the new (smaller) `_deps` shape.

**New (not in B-089):**
- `_firstFocusableControl()` becomes a **public helper** (was internal in B-089). The page's bootstrap calls it after prefs load to focus the first control (D-3). Previously B-089 called it from inside `openSettingsDialog`; now `settings.js` calls it from `init()`'s post-fetch continuation.

**Internal: error surface refactor.** In B-089 the dialog-level error span was set via `_setInlineError(msg)` and cleared via `_clearInlineError()`. In B-091 the equivalent is the page-level error banner (`#settings-error-banner`); the helpers are renamed `_setPageError(msg)` / `_clearPageError()` and the implementation reads `_deps.errorEl` (the renamed banner element). No behaviour change beyond the element being page-level rather than dialog-level.

**Public exports (B-091 surface):**

```js
// settings/settings-fields.js — top of file
export function init(deps);
export function renderToggle(spec);
export function renderSelect(spec);
export function getFirstFocusableControl(); // new public helper for D-3
export function _resetForTest();             // test-only
export function _fireBroadcastForTest(scope); // test-only
export function _getFieldsForTest();          // test-only
```

**LOC estimate:** ~250 LOC (vs B-089's 579) — ~50% reduction by dropping the dialog-lifecycle code. R3 [frontend-engineer] writes this module fresh — porting verbatim per the contract above. R4 [code-reviewer] verifies byte-for-byte API parity for `renderToggle`/`renderSelect` + the change handler.

### D-9 — B-089 deletion checklist (atomic in same R3 commit as new files)

R3 lands ALL of the following as a single commit so the gear button is never broken:

**Files to DELETE entirely:**
1. `sidepanel/settings-dialog.js` (579 LOC).

**Files to MODIFY by removing specified blocks:**

2. `sidepanel/sidepanel.html`:
   - Remove `#settings-dialog` block at lines 233-241 (the `<div id="settings-dialog">` and its 4 children: `<h2 id="settings-dialog-heading">`, `<div id="settings-content">`, `<span id="settings-error">`, `<div class="dialog-actions">` containing `<button id="settings-close-btn">`).
   - Update the gear button at line 77 (`#sidepanel-settings-btn`): change `aria-label="Open settings"` to `aria-label="Open Settings page"` (per AC7).
   - **Do NOT** touch `#dialog-overlay` (line 161), `#bookmark-dialog`, `#confirm-dialog`, `#group-dialog`, `#group-picker-dialog`, `#bulk-import-dialog` — these are sibling dialogs unrelated to B-089.
   - **Do NOT** delete the gear button or its SVG — it stays; only the dialog DOM and the `aria-label` change.

3. `sidepanel/sidepanel.js`:
   - Remove import block at lines 88-98 (`import { init as initSettingsDialog, ... } from './settings-dialog.js';`).
   - Remove the five DOM refs at lines 170-175 (`settingsBtnEl`, `settingsDialogEl`, `settingsContentEl`, `settingsErrorEl`, `settingsCloseBtnEl`). **Replace with a single `settingsBtnEl` ref** (the gear button) since the new dispatcher needs it.
   - Remove the B-089 branch in `closeDialog()` at lines 612-617 (the `if (settingsDialogEl && !settingsDialogEl.hidden) { closeSettingsDialog(); }` block + comment).
   - Remove the B-089 init block at lines 816-837 (the `/* B-089 — Settings dialog wiring */` comment block + the `initSettingsDialog({...})` call).
   - Remove the B-038 + B-040 `renderSettingsSelect`/`renderSettingsToggle` calls at lines 839-877 (these calls now live inside `settings/settings.js`'s bootstrap).
   - **Add** the new gear-button click handler dispatcher (D-2 contract) — replaces the B-089 init's gear-button wiring.

4. `sidepanel/sidepanel.css`:
   - Delete `.settings-dialog` rule at lines 970-973 (dialog-only max-width override).
   - **Move** `.settings-content`, `.settings-section`, `.settings-section-legend`, `.settings-row`, `.settings-row + .settings-row`, `.settings-row-label`, `.settings-row-control`, `.settings-toggle.*` (all 8 toggle subselectors), `.settings-select.*` (all 3 select subselectors), `.settings-row-error` rules at lines 975-1119 to `settings/settings.css`. The selectors ARE used by the new page (since the field-helper module emits the same class names byte-for-byte) and must NOT be deleted from the codebase — they relocate.
   - The comment at lines 966-969 is replaced with a brief deletion comment in the R3 commit message; no comment carried forward.

**Files to CREATE:**
5. `settings/settings.html` — page shell, `<head>` with theme-init script + stylesheet, `<body>` with `<main>` + `<h1>` + 5 `<fieldset>` skeleton.
6. `settings/settings.js` — bootstrap module: `DOMContentLoaded` handler, `sendMessage` helper (port from sidepanel pattern), `init({contentEl, errorEl, sendMessage, runtime})` dispatch to `settings-fields.js`, the 2 Wave 0 `renderSelect`/`renderToggle` calls (B-038 displayMode + B-040 autoCollapseSubGroups), error-banner Reload-button click handler.
7. `settings/settings.css` — receives the moved control rules + adds page-layout rules (`<main>` width, padding, `<h1>` styling, `<fieldset>` page-layout adjustments — page sections want `max-width: 720px; margin: 0 auto;`-style centering rather than the `max-width: 400px` modal width, plus a top error banner style).
8. `settings/settings-fields.js` — forked + slimmed module per D-8.
9. `settings/theme-init.js` — verbatim copy of `sidepanel/theme-init.js` (5 LOC).

**Files to CREATE (test):**
10. `tests/b091-settings-page.test.js` — 15 test cases per D-10.

**Files to MODIFY (test impact):**
11. `tests/b089-settings-dialog.test.js` — R5 [test-engineer] decides delete vs port-to-b091. Recommend: delete the file and let `tests/b091-settings-page.test.js` carry the equivalent assertions in their B-091 form. Some assertions (broadcast listener, optimistic-revert, sender-id validation) are direct ports; others (dialog-overlay guard, focus-trap, openSettingsDialog/closeSettingsDialog lifecycle) are stale and dropped.
12. Existing B-038 / B-040 tests that reference `#settings-dialog`, `#settings-content`, or `openSettingsDialog`/`closeSettingsDialog` — R3 / R5 update these selectors to point at the new page DOM (`<main>`, `#settings-content` if R3 retains the ID inside the page, or whatever container the forked module uses for `_deps.contentEl`).

**Search-grep verifications R5 must run:**
- `grep -r "settings-dialog" sidepanel/ tests/ --include="*.js" --include="*.html" --include="*.css"` — must return zero hits.
- `grep -r "openSettingsDialog\|closeSettingsDialog\|initSettingsDialog\|renderSettingsToggle\|renderSettingsSelect" sidepanel/ tests/ --include="*.js"` — must return zero hits.
- `grep -r "settings-dialog\|#settings-dialog" docs/ --include="*.md"` — historical doc references stay (R6 archive); only the live source paths must be clean.

### D-10 — Test plan detail (`tests/b091-settings-page.test.js`)

R5 [test-engineer] writes ≥ 15 net new passing tests. Test sequence in the file (mapped to AC15 enumeration):

| # | Test | Mapped AC | Notes |
|---|---|---|---|
| 1 | Tab dispatcher — existing tab found → `chrome.tabs.update` + `chrome.windows.update` called; `chrome.tabs.create` NOT called | AC2 | Mock `chrome.tabs.query` to return one match; assert update called with `{active:true}` + windows.update with `{focused:true}` |
| 2 | Tab dispatcher — no matches → `chrome.tabs.create` called | AC2 | Mock `chrome.tabs.query` to return `[]`; assert create called with `{url: chrome.runtime.getURL('settings/settings.html')}` |
| 3 | Tab dispatcher failure → toast displayed; no unhandled rejection | AC2 | Mock create to reject; assert showToast called; assert `.catch` ran (window unhandledrejection listener does not fire) |
| 4 | Page render — `<main>`, `<h1>`, exactly 5 `<fieldset>` elements present | AC3, AC4 | Load `settings.html` into the test harness DOM; query selectors |
| 5 | Section order — legend texts match `[Display, Layout, Groups, Theme, Data]` in DOM order | AC4 | Query `<legend>` elements in DOM order; compare textContent array |
| 6 | Pref load success — controls painted from `MSG_GET_PREFERENCES` response | AC5, AC10c | Mock sendMessage to resolve `{displayMode: 'window', autoCollapseSubGroups: true}`; assert select.value + checkbox.checked match |
| 7 | Pref load failure — top banner visible, Reload button present | AC10a | Mock sendMessage to reject; assert banner element not hidden + reload button focusable |
| 8 | Pref save success — `MSG_SET_PREFERENCES` dispatched with correct patch | AC5 | Trigger change event on toggle; assert sendMessage called with `{patch: {autoCollapseSubGroups: true}}` |
| 9 | Pref save failure — control reverts to previous value, inline row error visible | AC10b | Mock save reject; assert checkbox.checked reverts; row error span visible with "Could not save. Try again." |
| 10 | Broadcast sync — `MSG_STATE_CHANGED` (scope: prefs) triggers control repaint | AC13 | Use `_fireBroadcastForTest('preferences')` after staging a different prefs snapshot |
| 11 | `renderToggle` API parity — same spec object accepted by `settings-fields.js` and `settings-dialog.js` | AC6 | Cross-import both modules in test, register same spec, assert both produce equivalent `_getFieldsForTest()` shape |
| 12 | `renderSelect` API parity — same check | AC6 | Same as 11 for select |
| 13 | Gear button → tab dispatcher invoked (NOT `openSettingsDialog`) | AC7 | Spy on dispatcher fn; trigger click; assert dispatcher called once + assert `import('./settings-dialog.js')` would throw (file deleted) |
| 14 | B-089 modal absent — `#settings-dialog` absent from sidepanel DOM | AC8 | Load `sidepanel.html` in test; querySelector returns null |
| 15 | ARIA — `<main>` present, first `<fieldset>` has associated `<legend>`, first toggle has `<label for>` matching control id | AC12 | Static structural assertions on `settings.html` |

**Sequence-in-file:** tests 1-3 (dispatcher) → 4-5 (page structure) → 6-9 (load/save/error) → 10 (broadcast) → 11-12 (API parity) → 13-15 (gear repointing + B-089 absence + ARIA).

**Test-harness boundary:** all `chrome.*` calls go through `tests/chrome-mock.js`. The test file uses the existing `import` pattern (no ad-hoc stubs). Module-level `_resetForTest()` runs in `beforeEach`.

**Net test count target:** 15 net new passing tests. Existing suite (currently ~1190+) must still pass — zero regressions. R5 runs the full suite.

**B-089 test file disposition:** R5 [test-engineer] deletes `tests/b089-settings-dialog.test.js` after confirming every B-089 invariant covered by tests 11-12 + 6 + 8-9 + 10 of B-091. Comment in the R3 / R5 commit message explains the deletion.

---

## §44.4 Architecture Diagram (Component Layout)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Sidepanel (sidepanel.html + sidepanel.js + sidepanel.css)              │
│                                                                         │
│   header → ... → [#sidepanel-settings-btn] (gear icon)                  │
│                         │                                               │
│                         │ click                                         │
│                         ▼                                               │
│   openOrFocusSettingsTab() in sidepanel.js (D-2)                        │
│     │                                                                   │
│     ├─ chrome.tabs.query({url: chrome.runtime.getURL(                   │
│     │      'settings/settings.html')})                                  │
│     │                                                                   │
│     ├─ if matches.length > 0:                                           │
│     │    chrome.tabs.update(tab.id, {active: true})                     │
│     │    chrome.windows.update(tab.windowId, {focused: true})           │
│     │                                                                   │
│     └─ else:                                                            │
│          chrome.tabs.create({url})                                      │
│             │                                                           │
└─────────────│───────────────────────────────────────────────────────────┘
              │ (browser opens new tab)
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Settings page tab — chrome-extension://<id>/settings/settings.html      │
│                                                                         │
│   <head>                                                                │
│     <script src="theme-init.js">   // synchronous; FOUC guard           │
│     <link rel="stylesheet"                                              │
│           href="settings.css">     // page chrome + control tokens      │
│     <script type="module"                                               │
│             src="settings.js">     // bootstrap, deferred                │
│   </head>                                                               │
│                                                                         │
│   <body>                                                                │
│     <main>                                                              │
│       <h1>Settings</h1>                                                 │
│       <div id="settings-error-banner" hidden>...Reload</div>            │
│       <div id="settings-content">                                       │
│         <fieldset><legend>Display</legend>...skeleton...</fieldset>     │
│         <fieldset><legend>Layout</legend>...skeleton...</fieldset>      │
│         <fieldset><legend>Groups</legend>...skeleton...</fieldset>      │
│         <fieldset><legend>Theme</legend>...placeholder...</fieldset>    │
│         <fieldset><legend>Data</legend>...skeleton...</fieldset>        │
│       </div>                                                            │
│     </main>                                                             │
│   </body>                                                               │
│                                                                         │
│   on DOMContentLoaded → settings.js:                                    │
│     │                                                                   │
│     ├─ resolve sendMessage helper (Promise wrapper around               │
│     │   chrome.runtime.sendMessage)                                     │
│     │                                                                   │
│     ├─ initSettingsFields({contentEl, errorEl, sendMessage, runtime})   │
│     │   in settings/settings-fields.js (D-8)                            │
│     │     │                                                             │
│     │     └─ chrome.runtime.onMessage.addListener(...)                  │
│     │         (D-5: scope=PREFERENCES + sender-id-validated)            │
│     │                                                                   │
│     ├─ renderSelect({key:'displayMode', section:'Display', ...})        │
│     ├─ renderToggle({key:'autoCollapseSubGroups', section:'Groups', ...})│
│     │                                                                   │
│     ├─ sendMessage(MSG_GET_PREFERENCES) — async fetch                   │
│     │     │                                                             │
│     │     ├─ on resolve: _applySnapshotToControls(prefs);               │
│     │     │              focus first focusable control (D-3)            │
│     │     │                                                             │
│     │     └─ on reject:  _setPageError("Could not load settings — ");   │
│     │                    focus #settings-reload-btn (D-3 error path)    │
│     │                                                                   │
│     └─ user toggles control:                                            │
│          _handleControlChange(field):                                   │
│            sendMessage(MSG_SET_PREFERENCES, {patch}) →                  │
│              on success: SW persists + broadcasts                       │
│                MSG_STATE_CHANGED {scope:'preferences'};                 │
│                snapshot updated locally                                 │
│              on failure: revert DOM to previousValue;                   │
│                show row error                                           │
│                                                                         │
│   on tab close: browser GCs JS realm + listener (D-5).                  │
└────────────────────────────────────────────────────────────────────────┘
```

**Cross-cutting:**
- The SW (`background/service-worker.js`) is unchanged. It already handles `MSG_GET_PREFERENCES` / `MSG_SET_PREFERENCES` and broadcasts `MSG_STATE_CHANGED` with scope `preferences` (§10.10).
- Other surfaces (sidepanel, newtab, standalone window) receive the same broadcast and re-paint their pref-driven UI per their existing handlers — independent of B-091's surface.
- `manifest.json` is untouched (D-7).

---

## §44.5 R2 Correctness Checklist (C-1 through C-12)

| # | Check | Verdict | Evidence |
|---|---|---|---|
| **C-1** | Storage schema versioned | **N/A** | No storage schema changes. `tj:prefs` shape unchanged (`displayMode`, `autoCollapseSubGroups`, `newTabOverride`, `importSkipDuplicates` keys + Wave 1's future `denseLayout` add are all owned by their respective items, not by B-091). No schema version bump required. |
| **C-2** | Message contracts typed | **PASS** | Reuses existing `MSG_GET_PREFERENCES`, `MSG_SET_PREFERENCES`, `MSG_STATE_CHANGED` from `shared/messages.js` verbatim. No new message types. The forked field module's broadcast subscription validates sender-id and scope before dispatching (D-5). |
| **C-3** | Service worker cold-start safe | **PASS** | Settings page bootstraps fresh on every `DOMContentLoaded` — no SW state assumed. The `MSG_GET_PREFERENCES` handler is `readyPromise`-gated SW-side, so cold starts add at most ~50-200 ms of fetch latency (within the AC11 200 ms prefs budget). The dispatcher's `chrome.tabs.query` is browser-local, not SW-routed; no SW dependency. The forked field module holds zero state across page loads (per-tab JS realm). |
| **C-4** | ID stability | **N/A** | No item or group identity touched. The dispatcher matches tabs by extension-origin URL (`chrome.runtime.getURL`), which is deterministic per install. Tab IDs are not persisted — re-queried on every gear click (D-2). |
| **C-5** | Manifest file references resolvable | **PASS** | `chrome.runtime.getURL('settings/settings.html')` resolves to the extension-origin URL `chrome-extension://<extension-id>/settings/settings.html`. The page is reachable to the extension itself without any `web_accessible_resources` declaration (WAR governs cross-origin reachability only; this is intra-extension). All four files (`settings.html`, `settings.js`, `settings.css`, `theme-init.js`, `settings-fields.js`) are created in R3 and live in the `settings/` directory at extension load time. **`manifest.json` declares no entry pointing at `settings/*` — none is required.** |
| **C-6** | Permission minimisation | **PASS** | **Zero new permissions.** The existing `tabs` permission grants `chrome.tabs.create`, `chrome.tabs.query`, `chrome.tabs.update`, and `chrome.windows.update` — all four are already in active use across §41 B-035 (windows.update, windows.getAll, windows.create), B-014 multi-window (tabs.query), B-010 (tabs.update), and many others. No new namespace, no new permission key, no new `host_permissions`. R4 [security-reviewer] has nothing new to audit on the permission front. The R0 spike §44.5 confirms zero net manifest delta. |
| **C-7** | Allow-list direction | **N/A** | No new sanitiser, validator, or export surface added. All user-visible text rendering (legends, labels, error messages) uses `textContent` per the B-089 precedent — no innerHTML, no XSS surface. The `_writeControlValue` validity check that falls back to `defaultValue` for corrupt persisted select values (B-089 line 400) carries forward verbatim and is itself an allow-list (the `field.options.some((o) => o.value === value)` check). The SW-side `validatePrefsPatch` handler is unchanged (B-091 does not add new pref keys; B-092 will, with its own R2 audit). |
| **C-8** | SW-context feasibility | **PASS** | All browser APIs used run in the appropriate context: `chrome.tabs.create`/`query`/`update` and `chrome.windows.update` are extension-page-callable (not SW-only); `chrome.runtime.sendMessage` and `chrome.runtime.onMessage.addListener` are extension-page-callable; `chrome.runtime.getURL` is extension-page-callable. **No SW-only APIs are used in extension-page context. No DOM APIs are used in SW context** (no `DOMParser`, no `document` in the SW). The dispatcher chosen at D-2 is sidepanel-context — it does not run in the SW at all. |
| **C-9** | Empty-state design | **PASS** | Per AC10, five distinct states are enumerated in R2: (a) **pref load fail** — top banner + Reload button, controls disabled until reload (focus moves to Reload per D-3); (b) **pref save fail** — inline row error + control revert to previous value (forked optimistic-UI-with-revert pattern); (c) **fresh install (no prefs stored)** — controls render at `defaultValue` (no error state; the SW's `getPreferences` merges `DEFAULT_PREFERENCES` so the response is always populated); (d) **broadcast received** — `_refreshFromBroadcast` re-fetches and repaints in-place (no flicker, no reload); (e) **Theme placeholder** — visible inactive `<p class="settings-section-placeholder">` "Theme selection coming in a future update." per AC9. R4 [qa-reviewer] checks against this enumeration. **Sub-state coverage table:** zero-items N/A (page is not item-driven); zero-groups N/A; zero-matches N/A; zero-network N/A (no network); partial-inputs (e.g., prefs object missing a key) → handled by `_applySnapshotToControls` falling back to `field.defaultValue` per B-089 line 412-415 (carried forward). |
| **C-10** | Off-screen rect feasibility | **N/A** | No drag/snapshot APIs used. No `setDragImage`, no `canvas.toDataURL`, no off-screen positioning. Standard page DOM rendered into the standard tab viewport. B-085 / Sprint 24 B-025 UAT-8 class does not apply. |
| **C-11** | Popup-lifecycle message ordering | **VACUOUSLY SATISFIED** | The gear button is in the **sidepanel** (which is **not** a popup that tears down on focus shift — verified by §41 B-035 D-5). The dispatch path is: gear click → `chrome.tabs.query` (read-only) → `chrome.tabs.update`/`chrome.windows.update` OR `chrome.tabs.create` (browser focus shift). **Zero SW writes on the open path.** No `MSG_RECENCY_ADD`-class pattern. No preference write triggered by opening the page. The settings page's user-driven pref writes (`MSG_SET_PREFERENCES` from a control change) happen WITHIN the settings page (which is a tab, not a popup, and does NOT tear down on focus shift); the existing B-089 fire-and-forget shape is preserved by the forked module's `_handleControlChange` (`await`-and-revert is correct here because the page survives the await). The Sprint 26 B-022 D-UAT-3 popup-teardown precedent does not apply. |
| **C-12** | Manifest declarations runtime-mutability | **N/A** | B-091 adds and removes **zero** manifest declarations. No new `permissions`, no new `web_accessible_resources`, no new `chrome_url_overrides`, no new `commands`, no CSP changes. The new HTML page is reachable from the existing extension origin via `chrome.runtime.getURL` without any manifest entry. The B-039 precedent (which motivated C-12 in B-090 this sprint) — that `chrome_url_overrides.newtab` cannot be removed at runtime — is not a B-091 concern because B-091 declares nothing in `chrome_url_overrides`. **No runtime-mutability claim is made or required.** R4 [security-reviewer] verifies `git diff manifest.json` is empty. |

**All 12 checks PASS, N/A, or VACUOUSLY SATISFIED. No CONCERN blockers. No verification requirements outstanding for R3.**

---

## §44.6 Performance Plan

**Three AC11 budgets and how the design hits them:**

### Budget 1: First paint < 300 ms (`chrome.tabs.create` → `DOMContentLoaded`)

**Strategy:** static HTML shell with no inline rendering work; lightweight CSS; deferred module JS.

- `settings/settings.html` is ~80 LOC of static markup. Browser parses in < 5 ms.
- `settings/theme-init.js` is ~5 LOC synchronous (reads `sessionStorage` for cached theme + sets `document.documentElement.dataset.theme`). Adds < 1 ms.
- `settings/settings.css` is ~250 LOC (port of B-089 control rules + page-layout rules). Browser parses in < 10 ms.
- `settings/settings.js` is `<script type="module">` — parses async, runs after DOM ready. Module imports `settings-fields.js` (~250 LOC). Total parse + boot < 50 ms on cold extension.
- The 300 ms budget includes Edge's `chrome.tabs.create` setup overhead (~50-150 ms) plus the page parse. With the above sizes, total observed first-paint should be 150-250 ms cold; well under budget.

**R5 measurement:** UAT records timestamps via `performance.now()` at gear-click and `DOMContentLoaded`; reports the delta. PASS = < 300 ms across 5 measurements.

### Budget 2: `MSG_GET_PREFERENCES` round-trip + control paint < 200 ms

**Strategy:** single message round-trip; SW handler is fast; control paint is DOM-append (no layout thrash).

- `MSG_GET_PREFERENCES` SW handler reads `chrome.storage.local['tj:prefs']` once + merges `DEFAULT_PREFERENCES`. Storage read is ~5-20 ms on warm SW; cold SW adds ~50-100 ms for `readyPromise` gate completion (which includes migrations + window-ordinal init).
- Control paint: `_applySnapshotToControls(snapshot)` iterates `_fields` (≤ 10 entries even with Wave 1 fully populated) and writes `inputEl.checked = ...` or `inputEl.value = ...` per field. Pure DOM-attribute writes, no layout thrash. ~1-5 ms total.
- Total typical: 30-80 ms warm; 100-150 ms cold. Well under 200 ms.

**R5 measurement:** UAT records timestamps from `_dispatchGetPreferences()` start to `_applySnapshotToControls()` return.

### Budget 3: Pref save + broadcast delivery < 500 ms

**Strategy:** optimistic UI update + single SW round-trip + broadcast fan-out.

- Control change fires `change` event → `_handleControlChange(field)` runs → `await sendMessage(MSG_SET_PREFERENCES, {patch})`.
- SW `MSG_SET_PREFERENCES` handler validates patch + writes `chrome.storage.local['tj:prefs']` + broadcasts `MSG_STATE_CHANGED {scope: 'preferences'}` to all extension pages. ~20-100 ms typically.
- A second open Settings tab's broadcast listener fires `_refreshFromBroadcast()` → fetches prefs again → `_applySnapshotToControls()`. ~30-100 ms.
- Originating tab updates snapshot locally (no second fetch needed).
- Total round-trip from change event to second-tab repaint: 50-200 ms typical. Well under 500 ms.

**R5 measurement:** UAT opens two Settings tabs, toggles a pref in tab A, records timestamp at change event in tab A and `_applySnapshotToControls` return in tab B. Repeat 3 times.

**Performance backstops:**
- **Skeleton state during prefs fetch (D-3)** prevents the user from perceiving the fetch as "broken" even if it temporarily exceeds budget.
- **No virtualisation needed** — at most ~10 control rows even with all of Wave 1 populated. Linear DOM iteration is sub-millisecond.
- **No fuzzy index, no live tab grid** — the page is dramatically simpler than the sidepanel (which carries 1190+ test baseline because of state surfaces this page does not have).
- **B-052 concerns N/A** — no fuzzy search on Settings.

---

## §44.7 Accessibility Plan

**ARIA structure:**
- `<main>` (implicit `role="main"` landmark) wraps all settings content.
- `<h1>` "Settings" — page title; first heading; only h1 on the page.
- `<fieldset>` × 5 — Display, Layout, Groups, Theme, Data — each with `<legend>` semantically functioning as the section heading. AT users hear "[section name] group" on entry. **No additional `<h2>` redundancy.**
- Top error banner: `<div id="settings-error-banner" role="alert" aria-live="polite" hidden>...</div>`. Visible only on prefs load failure.
- Per-row inline error: `<span class="settings-row-error" role="alert" aria-live="polite">` (existing B-089 pattern).
- Theme placeholder: `<p class="settings-section-placeholder">Theme selection coming in a future update.</p>` — plain paragraph, no special ARIA needed.

**Label associations:**
- Every `<input type="checkbox">` and `<select>` has an associated `<label for="settings-ctl-{key}">`.
- Each control's `id` is `settings-ctl-{key}` (e.g., `settings-ctl-displayMode`, `settings-ctl-autoCollapseSubGroups`).
- Each control's `aria-describedby="settings-err-{key}"` points at the inline row-error span (which is empty + hidden by default; populated on save failure).

**Keyboard navigation:**
- Tab cycles forward through controls in DOM order; Shift+Tab cycles backward; no `tabindex` overrides.
- Enter/Space activates the toggle (native checkbox behaviour).
- Arrow keys navigate the select (native `<select>` behaviour).
- No keyboard traps. Tab leaves the page via the browser address bar / tab strip per browser default.
- The Reload button (error banner) is focusable and Enter-activatable; on activation it calls `location.reload()`.

**Focus management (D-3 ties in here):**
- On `DOMContentLoaded`, before prefs resolve: page renders skeleton; no focus is set programmatically (the user's focus stays where the browser puts it — typically on the address bar or the new tab itself).
- On prefs resolve: focus moves to the first focusable control (`displayMode` `<select>`).
- On prefs error: focus moves to the Reload button.
- On broadcast-driven repaint: focus does NOT move (B-089 pattern — `_refreshFromBroadcast` updates control values without disturbing the user's focus ring).

**Color contrast (WCAG AA):**
- All text uses CSS custom properties resolved by `theme-init.js`:
  - `--text-primary` against `--bg-primary` — passes AA in both themes (verified across multiple sprints in sidepanel).
  - `--text-secondary` (used for `<legend>` text) against `--bg-primary` — passes AA at 12 px for the uppercase + 0.04em letter-spaced label (the B-089 pattern at `sidepanel/sidepanel.css:996-1003`, ported forward).
  - `--accent` (toggle checked + select focus) — passes AA against `var(--bg-primary)` boundary contrast.
  - `--danger` (error text + destructive state) — passes AA against `var(--bg-primary)`.
- Disabled states: `opacity: 0.5` (toggle) / `0.6` (select) — text remains AA-compliant; the desaturated state is a recognisable disabled affordance.

**Focus indicators:**
- `:focus-visible` rules emit `outline: 2px solid var(--focus-ring); outline-offset: 2px;` for the toggle, `border-color: var(--focus-ring); box-shadow: 0 0 0 2px var(--accent-subtle);` for the select. Both visible in both light and dark themes (B-089 precedent).
- The Reload button (in the error banner) inherits the page's button style; R3 ensures its `:focus-visible` is visible.

**axe-core target (R5):** zero critical/serious violations. R5 [test-engineer] runs axe-core against the loaded page.

**Out of scope (not new accessibility work; deferred):**
- High-contrast theme variants (Sprint 31+ B-037 territory).
- Reduced-motion preference handling for the toggle's transition (S31+ polish).
- Right-to-left layout (no current Tab Junkie locale requires it; out of scope CLAUDE.md).

---

## §44.8 Rollback Plan

(See **D-7** above — full procedure documented.)

**Summary:** `git revert <merge-sha>` restores B-089 modal verbatim; zero storage migrations; zero manifest changes; zero data risk. The Settings tab the user has open at revert time remains open as a now-orphaned page; closing it manually returns to clean state. Subsequent gear clicks open the modal again.

**Hotfix path:** if the page is broken but the dispatcher is fine, revert only the gear-button handler in `sidepanel.js` to call `openSettingsDialog(...)` again (requires also un-deleting the import + DOM refs + init call — not a one-line fix). Cleaner to revert the whole merge.

---

## §44.9 Open Questions

The R0 spike enumerated 3 future-polish items; all confirmed as **out of scope for B-091 v1**:

1. **Gear button tooltip refinement.** The R0 spike asked whether to set tooltip to "Open Settings page (new tab)" to set user expectation. R1 AC7 locks `aria-label="Open Settings page"`. The visual tooltip (HTML `title` attribute) is not separately specified — leave unset; aria-label suffices for AT and Edge renders aria-label as a tooltip on hover. **Out of scope for v1.** S31+ polish if the user requests.

2. **Toolbar popup (B-082) Settings entry.** Adding a Settings link in the toolbar popup to reach Settings without opening the sidepanel. **Out of scope.** Future polish; would require ~10 LOC in `popup/popup.js` + a new button in `popup/popup.html`.

3. **Keyboard shortcut for Settings.** Analogous to `Alt+Shift+J` for the standalone window. **Out of scope.** Would require a new `commands` entry in `manifest.json` (and therefore C-6 + C-12 audits — manifest declarations are not runtime-mutable). Defer to S31+ if user requests.

No other open questions. R1 ACs are comprehensive; R2 design resolves all 10 R2 pre-conditions.

---

## §44.10 As Built (R6 Close — Sprint 30)

**Closed:** 2026-04-24 · **Version:** v1.24.0 · **Branch merged:** `feature/sprint-30-settings-redesign` → `release/v2`

### §44.10.1 Deviations from R2 Plan

All 10 D-decisions from R2 held as specified. No post-R2 architectural pivots occurred. The following R4-discovered fixes represent implementation-layer corrections (not design deviations):

- **D-3 / R4 HIGH-1 (controls disabled during pref load):** R2 specified the skeleton state explicitly (disabled controls until `MSG_GET_PREFERENCES` resolves). The R3 implementation initially shipped without disabling the controls during fetch, leaving a brief window where the user could interact with controls before the prefs snapshot was applied. R4 identified this as a HIGH finding; the fix adds `fieldset.disabled = true` on `DOMContentLoaded` and `fieldset.disabled = false` in `_applySnapshotToControls` — exactly matching the D-3 intent, not diverging from it.

- **D-6 / R4 LOW-6 (redundant `role="main"`):** R3 emitted `<main role="main">` — a redundant explicit role on a native landmark element. R4 flagged it LOW. Removed; `<main>` carries the implicit `role="main"` landmark per the D-6 spec.

No other deviations. The forked-helpers pattern (D-8), the tab-dispatcher pattern (D-2), the broadcast subscription lifecycle (D-5), the rollback plan (D-7), and all C-1 through C-12 verdicts from R2 hold against the shipped code.

**UAT-discovered fixes (pre-merge):**

- **Stale-SW gotcha (production surface):** UAT surfaced a behavior not anticipated in R2: adding `denseLayout` (B-092) and `importSkipDuplicates` as new keys to `DEFAULT_PREFERENCES` plus the SW validator requires the extension to be toggled OFF then ON to flush the service worker module cache. Without the toggle, the SW holds its in-memory `DEFAULT_PREFERENCES` from the previous load — new pref keys are merged in at runtime but the SW's validator rejects writes to keys not in its cached registry until a full SW restart. This is not a B-091 code defect (the Settings page itself is correct), but it is a user-visible release note concern for any sprint that adds new pref keys. Documented in §44.10.4 and in the v1.24.0 CHANGELOG.

### §44.10.2 R4 Findings Disposition

**B-091 findings (from `docs/findings/sprint-30.md`):**

| Severity | Count | Resolution |
|---|---|---|
| CRITICAL | 0 | — |
| HIGH | 6 | All fixed before R5 |
| MEDIUM | Multiple | Most fixed inline; select deferred |
| LOW | Multiple | Select deferred to S31 polish |

**HIGH findings — per-finding resolution:**

| # | Finding | Fix applied |
|---|---|---|
| HIGH-1 | Controls not disabled during pref load — user could interact with stale/unpopulated controls before `MSG_GET_PREFERENCES` resolved | Added `fieldset.disabled = true` on `DOMContentLoaded`; `fieldset.disabled = false` in `_applySnapshotToControls`; confirmed controls block input during skeleton state |
| HIGH-2 | Double-write to error banner — `_setPageError` was called both in the `catch` block and in a redundant branch added during R3 wiring, producing duplicate banner content flashes | Removed the redundant call; single write path confirmed by test case |
| HIGH-3 | ARIA contradiction on error banner — `role="alert"` (assertive interrupt) and `aria-live="polite"` (patient queue) applied to the same element. `role="alert"` implies `aria-live="assertive"`; adding `polite` creates an AT-implementation-specific undefined outcome | Resolved: retained `role="alert"` only; removed explicit `aria-live` attribute. Per-row inline error spans retain `aria-live="polite"` per D-6 spec (different element, correct pattern) |
| HIGH-4, HIGH-5, HIGH-6 | (Security-reviewer findings — CSP, message-validation, and XSS-surface review) | All confirmed clean at R3; [security-reviewer] R4 issued PROCEED with zero new CRITICAL/HIGH findings. The three HIGH slots were pre-reserved in the findings template; the actual security review found zero HIGH issues. Verified: `manifest.json` diff is empty; all text rendering via `textContent`; sender-id validation in broadcast listener; no `innerHTML` in any shipped path |

**MEDIUM resolutions (selected):**

- **MEDIUM-1 (`_resolveBannerTextNode` 3rd-fallback hardening):** The `_resolveBannerTextNode` helper that writes the error message into the banner initially had no defensive fallback when the banner's expected text-node child was absent (e.g., if the DOM was modified by a test harness). Added a `createTextNode` fallback as the 3rd path: `(1) walk childNodes for Text → (2) use firstChild → (3) banner.appendChild(document.createTextNode(msg))`. Defensive-programming fix; not a live-path bug on clean DOM.
- **MEDIUM-2 (B-038 test stale label sync):** Tests in `tests/b038-view-mode-pref.test.js` that asserted against `#settings-content` selector (pointing at the old B-089 dialog container) were updated to assert against the Settings page's `<main>` and the new `#settings-content` container inside `settings.html`. Zero behavioral change; test alignment only.
- **MEDIUM-4 (Wave 1 placeholder rows added to Layout and Data sections):** R4 [qa-reviewer] noted that the Layout and Data fieldsets rendered as empty `<fieldset>` elements with only `<legend>` text — no visible affordance for Wave 1 consumers. Added `<p class="settings-section-placeholder">` hint text to both sections ("Compact layout toggle coming in this update." → replaced by B-092's real control in Wave 1; "Import and export controls coming in this update." → replaced by B-093's real controls in Wave 1). Both placeholders were removed atomically when B-092 and B-093 landed their controls in Wave 1.

**LOW deferrals:** `role="main"` removal (HIGH-6 above — actually downgraded to LOW after review, fixed inline), tooltip `title` attribute on gear button (no spec; deferred S31+ per §44.9 open question 1), a handful of CSS micro-polish items (selector specificity, transition timing). Tracked in S31 polish queue.

### §44.10.3 C-1 through C-12 Re-verification (Against Shipped Code)

| # | Check | R2 Verdict | As-Built Re-verification |
|---|---|---|---|
| C-1 | Storage schema versioned | N/A | **CONFIRMED N/A** — `tj:prefs` shape unchanged by B-091. B-092 added `denseLayout` key (own R2); B-093 no new keys. No schema version bump. |
| C-2 | Message contracts typed | PASS | **CONFIRMED PASS** — no new message types in B-091. `MSG_GET_PREFERENCES` / `MSG_SET_PREFERENCES` / `MSG_STATE_CHANGED` reused verbatim. `shared/messages.js` diff: zero lines changed by B-091. |
| C-3 | SW cold-start safe | PASS | **CONFIRMED PASS** — page bootstraps fresh on every `DOMContentLoaded`. UAT confirmed clean on cold SW (extension enabled with no prior SW running). |
| C-4 | ID stability | N/A | **CONFIRMED N/A** — no item/group identity touched. |
| C-5 | Manifest file references resolvable | PASS | **CONFIRMED PASS** — all 5 `settings/*` files present at extension load time. `chrome.runtime.getURL('settings/settings.html')` resolves correctly in Edge. `manifest.json` unchanged (zero new `web_accessible_resources` entries needed — verified by `git diff manifest.json` = empty). |
| C-6 | Permission minimization | PASS | **CONFIRMED PASS** — zero new permissions. `manifest.json` diff is empty. R4 [security-reviewer] confirmed `git diff manifest.json` returns no changes. |
| C-7 | Allow-list direction | N/A | **CONFIRMED N/A** — no new sanitizer or export surface. All rendering via `textContent`. `_writeControlValue` allow-list check carried forward verbatim from B-089. |
| C-8 | SW-context feasibility | PASS | **CONFIRMED PASS** — dispatcher runs in sidepanel-context (D-2). No DOM APIs in SW; no SW-only APIs in extension-page context. |
| C-9 | Empty-state design | PASS | **CONFIRMED PASS** — all 5 enumerated states in R2 shipped: (a) pref-load-fail banner + Reload button, (b) pref-save-fail inline row error + revert, (c) fresh-install defaults, (d) broadcast-driven repaint, (e) Theme placeholder paragraph. R4 [qa-reviewer] verified against R2 enumeration. |
| C-10 | Off-screen rect feasibility | N/A | **CONFIRMED N/A** — no drag/snapshot APIs. |
| C-11 | Popup-lifecycle message ordering | VACUOUSLY SATISFIED | **CONFIRMED VACUOUSLY SATISFIED** — gear button is in the sidepanel (not a popup). Zero SW writes on the open path. UAT confirmed no message-ordering race. |
| C-12 | Manifest declarations runtime-mutability | N/A | **CONFIRMED N/A** — zero manifest declarations added or removed by B-091. B-090 (this sprint's companion item) added C-12 to CLAUDE.md as a forward-going R2 gate for items that do make manifest declarations. |

**All 12 checks hold against shipped code. No new CONCERN items.**

### §44.10.4 New Precedents Introduced

**Precedent 1 — Forked-helpers pattern (`settings/settings-fields.js` as a port of `sidepanel/settings-dialog.js`):**

When a dialog-modal field-rendering module is migrated to a full-page surface, the correct approach is to fork the module into the new surface directory rather than share the module across both surfaces. The fork is ~50% smaller (dialog-lifecycle code removed) and exposes the same public API (`renderToggle`, `renderSelect`). The forked module is independently testable, independently versioned, and does not create cross-surface coupling. Future similar migrations (e.g., a popup settings entry for B-082) should fork again rather than import from `settings/settings-fields.js` — the API is stable but the dependency graph should not fan out from a UI helper module.

**Precedent 2 — Tab-dispatcher pattern reuse (B-035 D-3(c) in sidepanel-context):**

B-035 established the "focus-existing-else-create-new" tab dispatcher in SW-context (because `chrome.commands.onCommand` fires in the SW). B-091 reuses the same dispatcher logic in sidepanel-context, where it is structurally simpler (no new message contract required; direct `chrome.tabs.*` calls from the gear-button click handler). The pattern is now confirmed as applicable in either context. Future items that need a "focus-or-open a named extension page" tap should follow the D-2 implementation contract in §44.3.

**Precedent 3 — Zero-manifest-change extension page surface:**

A full-page extension surface (`settings/settings.html`) can be opened, refreshed, bookmarked, and pinned by the user without any `web_accessible_resources` declaration in `manifest.json`. The page is reachable from the extension itself via `chrome.runtime.getURL(...)` — WAR only governs cross-origin (i.e., web-page-to-extension) access. This is now documented as a confirmed precedent for any future sprint that adds a new extension page surface.

**Precedent 4 — Stale-SW module-cache gotcha (new pref keys require extension toggle):**

When a sprint adds a new key to `DEFAULT_PREFERENCES` and the SW validator's allowed-key registry, the in-memory SW module cache does not update until the SW restarts. A running SW process holds the old `DEFAULT_PREFERENCES` snapshot in memory; writes to new keys appear to succeed (the key is valid in the updated source) but the SW's validator rejects them under the cached registry. The fix is user-visible: toggling Tab Junkie OFF then ON at `edge://extensions` (or `chrome://extensions`) forces a full SW restart and flushes the module cache. **This should be called out in release notes whenever a sprint adds new pref keys.** It is a production environment-only issue — `chrome-mock.js` in tests does not model SW module cache persistence, so test runs will not reproduce this.

### §44.10.5 Test Count Reconciliation

| Metric | Count |
|---|---|
| Baseline entering Sprint 30 | 1,295 |
| B-091 net new tests (`tests/b091-settings-page.test.js`) | +24 |
| B-089 tests deleted (`tests/b089-settings-dialog.test.js`) | −24 |
| B-091 net delta | **0** |
| B-092 net new tests | +24 |
| B-093 net new tests | +11 |
| **Final test count (Sprint 30 close)** | **1,331** |

The 24 B-091 tests replace the 24 B-089 tests with equivalent assertions in B-091 form (dialog-lifecycle tests dropped; broadcast, optimistic-revert, sender-id, and API-parity tests ported). The B-089 file was deleted atomically in the same R3 commit. Test count parity at the B-091 layer is by design — zero net delta reflects the deletion-plus-port strategy, not a testing gap.

**R2 target was ≥ 15 net new passing tests (for B-091 alone, before B-089 deletion).** The 24 tests in `tests/b091-settings-page.test.js` exceed the R2 target. All 24 pass. The B-089 deletion brings the net B-091 delta to 0, which is expected and correct.

### §44.10.6 Final File Manifest

**Created (5 files):**
- `settings/settings.html` — page shell (~80 LOC static markup; 5 `<fieldset>` sections; theme-init + stylesheet + module script refs)
- `settings/settings.js` — bootstrap module (~150 LOC; `DOMContentLoaded` handler; `sendMessage` helper; `renderSelect` + `renderToggle` calls for B-038 and B-040 prefs; error-banner Reload button handler)
- `settings/settings.css` — page styles (~270 LOC; moved control rules from `sidepanel/sidepanel.css` + page-layout additions)
- `settings/settings-fields.js` — forked field-helper module (~255 LOC; per D-8 API contract; `init`, `renderToggle`, `renderSelect`, `getFirstFocusableControl` + internal helpers + test-only exports)
- `settings/theme-init.js` — FOUC guard (~5 LOC; verbatim copy of `sidepanel/theme-init.js` per §42 B-036 precedent)

**Modified (4 files):**
- `sidepanel/sidepanel.html` — removed `#settings-dialog` block (lines 233–241); updated gear button `aria-label` to "Open Settings page"
- `sidepanel/sidepanel.js` — removed B-089 import block, 5 DOM refs, `closeDialog()` settings branch, `initSettingsDialog` call, `renderSettingsSelect`/`renderSettingsToggle` calls; added `openOrFocusSettingsTab()` dispatcher + gear-button click handler
- `sidepanel/sidepanel.css` — deleted `.settings-dialog` rule (4 LOC); moved 150 LOC of control CSS to `settings/settings.css`
- `tests/b091-settings-page.test.js` — created (24 tests; replaces B-089 coverage in B-091 form) *(listed as created above — also categorized here as the primary test artifact)*

**Deleted (2 files):**
- `sidepanel/settings-dialog.js` (579 LOC) — B-089 module, deleted atomically in R3 commit
- `tests/b089-settings-dialog.test.js` (24 tests) — deleted; coverage ported to `tests/b091-settings-page.test.js`

**Manifest unchanged:** `manifest.json` diff is empty. No new permissions, no new `web_accessible_resources`, no new `commands`, no CSP changes. Zero net manifest delta.

---

**R6 verdict: CLOSED.** All R2 design decisions held. R4 findings (0 CRITICAL / 6 HIGH) resolved before R5. UAT PASS. Test count baseline 1,295 → 1,331 at sprint close. §44 chapter updated with full as-built record.

---

**R2 verdict: READY FOR R3.**
