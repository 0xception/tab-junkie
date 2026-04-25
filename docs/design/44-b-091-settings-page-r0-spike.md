# §44 R0 Spike — B-091 Settings Page Redesign Surface Strategy

**Sprint:** 30
**Tier:** Spike-First (L)
**Status:** R0 spike memo (2026-04-23) — DELIVERS D-1 SURFACE LOCK · R1 [product-manager] dispatches next
**Owner:** [solution-architect] (R0 spike); R2 design chapter `docs/design/44-b-091-settings-page.md` will be authored separately after R1
**Reads:** §41 (B-035 standalone window — `chrome.windows.create` + cold-start-safe URL match), §42 (B-036 newtab — full-page extension surface, vanilla DOM render strategy, broadcast-receiver precedent), §43 (B-038 view-mode pref — `displayMode` naming + setPopup pattern), `sidepanel/settings-dialog.js` (B-089 module being deprecated/repurposed), `manifest.json`, `sidepanel/sidepanel.{html,js}` (gear button + dialog-overlay host)

---

## §44.1 Spike Overview

B-091 redesigns the user-facing Settings surface from a sidepanel-hosted `<dialog>` modal (B-089, shipped Sprint 29) into a full-page surface that hosts existing prefs (display-mode B-038, sub-group auto-collapse B-040) and adds room for Wave 1 consumers (dense layout B-092, import/export rehome B-093) plus a placeholder slot for Sprint 31 themes (B-037). The spike resolves **D-1: which surface hosts the page?** Four candidates were enumerated in BACKLOG: (a) sidepanel in-place takeover, (b) `chrome.tabs.create` dedicated tab, (c) standalone popup window, (d) bigger modal. The user's stated lean is (b), explicitly deferred to the R0 spike for the final call. This memo locks D-1, inventories implementation risks, evaluates whether B-091 should split into smaller items, summarises manifest impact (zero new permissions / zero new manifest declarations under the chosen path), and feeds R1 + R2 a list of pre-conditions to resolve before R3 begins.

R0 produces this memo only. The R2 design chapter (`docs/design/44-b-091-settings-page.md`) is a separate file written after R1 finalises ACs.

---

## §44.2 D-1 Decision: Surface Strategy

### Recommended: **Candidate B — `chrome.tabs.create({url: chrome.runtime.getURL('settings/settings.html')})` dedicated tab**

The user's lean is correct. Candidate B delivers the largest viable real estate for the redesign goals (theme preview tiles in S31, side-by-side import/export workflows with confirmation previews, multi-section layout with vertical scroll), reuses the precedent established by §42 B-036 (vanilla-DOM extension page, `chrome.runtime.sendMessage`-based bootstrap, B-052 search-index style cross-surface imports), and adds zero new manifest declarations and zero new permissions (`chrome.tabs.create` is already in active use under the existing `tabs` permission). Persistent URL means the user can refresh, bookmark, or pin the Settings tab; closing it returns to whatever they were doing without disturbing the sidepanel context. Tab is the MV3-idiomatic surface for "configuration pages too large for a popup or panel" — it is the same shape Chromium's own extension-options pages use.

### Rejected alternatives

- **Candidate A — Sidepanel in-place takeover.** Rejected. Sidepanel width (~350-400 px in Edge) cannot host theme preview swatches, stacked import/export buttons with confirmation dialogs, and a dense-layout side-by-side preview without forcing the user to scroll constantly. The "Back to bookmarks" page transition inside a panel is awkward UX (panels are spatial fixtures; pages inside them feel unnatural). Existing bookmark grid is pushed off-screen during configuration, defeating the user's documented goal of "single discoverable home for all configuration." The width constraint is the disqualifier — every Wave 1 consumer (B-092 dense, B-093 import/export, S31 B-037 themes) wants room to breathe.

- **Candidate C — Standalone popup window (`chrome.windows.create({type:'popup'})`).** Rejected. Reuses §41 B-035 infrastructure but introduces a second floating window the user must track on top of the sidepanel and any standalone Tab Junkie window. Popup-type windows have less native chrome (no tab bar, no URL bar) which makes them harder to find via Alt+Tab and impossible to bookmark. Settings is not a "frequently invoked alongside other Tab Junkie surfaces" feature — it is a "configure once, dismiss" feature — and a tab is the better fit for that lifecycle. Also: a popup window would compete with B-035's standalone window in the popup-types `chrome.windows.getAll` enumeration, requiring URL discrimination there, an avoidable interaction risk.

- **Candidate D — Bigger modal with vertical sections.** Rejected. Still constrained by sidepanel width; doesn't solve the real estate problem. Every Wave 1 consumer's UX gets worse, not better, by being shoved into a tall narrow scroller. Defeats the user-stated intent ("redesign UI settings panel into a full page (instead of pop-up modal)"). Keeps the user trapped in the sidepanel during configuration. A near-no-op compared to B-089.

**Lock:** D-1 = Candidate B. R1 + R2 proceed under this assumption. If R4 review or R5 UAT surfaces a blocker that invalidates B (e.g., Edge-specific bug we don't anticipate), fallback is C — but B is the chosen path.

---

## §44.3 Risk Inventory

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R-1 | **Multiple Settings tabs at once.** User clicks the gear repeatedly → multiple `chrome.tabs.create` calls → N Settings tabs open simultaneously. Each subscribes to `MSG_STATE_CHANGED`; user toggles a pref in one tab → other tabs reflect change but visual confusion is high. | MED | LOW-MED | "Focus existing if open, else create new" pattern. Reuse §41 B-035 D-3 option (c) precedent: on every gear click, fire `chrome.tabs.query({url: chrome.runtime.getURL('settings/settings.html')})` from SW (or directly from sidepanel), if found call `chrome.tabs.update(id, {active:true})` + `chrome.windows.update(windowId, {focused:true})`, else `chrome.tabs.create({url})`. Cold-start safe by construction (no SW state). R2 documents this as the dispatcher pattern. |
| R-2 | **Focus management after cross-surface navigation.** Gear click in sidepanel → SW (or direct) opens settings tab → focus shifts to new tab → sidepanel popup-lifecycle teardown concern? | LOW | LOW | Sidepanel is NOT a popup (does not tear down on focus shift — §41 D-5 confirms). The gear is in the sidepanel header, which persists. C-11 popup-lifecycle ordering does NOT apply here. The only SW-side write on the settings-open path is zero (no recency, no preference mutation on open). Vacuously safe. R2 documents this as the C-11 audit. |
| R-3 | **Broadcast-listener lifecycle on tab close.** Settings tab subscribes to `MSG_STATE_CHANGED`; user closes the tab; `chrome.runtime.onMessage` listener is GC'd with the tab's JS context. Cleanup is automatic — no leak risk. | LOW | LOW | Document as "free correctness" in R2 §44.5 D-3 (reuse §41 / §42 broadcast pattern). No explicit unmount logic needed. R5 test: open + close + reopen → no listener accumulation in SW. |
| R-4 | **Gear-button continuity.** B-089's gear in `#sidepanel-settings-btn` currently triggers `openSettingsDialog`. R3 must repoint this to a tab-open dispatcher. If the dispatcher fails (browser-level error from `chrome.tabs.create`), user gets no feedback — gear click appears broken. | LOW | MED | Dispatcher must `.catch(...)` and surface a toast on failure (existing toast infrastructure in `sidepanel.js`). R2 documents the dispatcher's error contract. R5 UAT covers `chrome.tabs.create` rejection (mock at integration boundary). |
| R-5 | **`renderToggle` / `renderSelect` API portability.** B-089's helpers depend on shared `dialog-overlay` + focus-trap helpers (`_activateFocusTrap`/`_deactivateFocusTrap`) injected from `sidepanel.js`. Settings page is not a dialog — there is no overlay, no focus-trap. The DI contract assumes dialog-modal semantics. | MED | MED | **Recommended: fork the helpers, do not port verbatim.** Carve out a slimmer module — `settings/settings-fields.js` — that owns the same field registry (`_fields`, `_fieldsByKey`, `_prefsSnapshot`), the same `renderToggle`/`renderSelect` signatures, the same broadcast subscription, but drops the `overlayEl`/`activateFocusTrap`/`deactivateFocusTrap` deps and the `openSettingsDialog`/`closeSettingsDialog` lifecycle (the page IS the surface — no open/close). Section/legend DOM construction stays identical. Field-change → `MSG_SET_PREFERENCES` flow stays identical. Saves ~100 LOC of dialog-specific code; preserves the API shape so B-038 + B-040 + B-092 + B-093 + S31 B-037 all call `renderToggle`/`renderSelect` against the new module without learning a new contract. R2 specifies the fork contract precisely. **B-089 module is then DELETED from `sidepanel/` per AC4 + Wave 1 cleanup.** |
| R-6 | **`renderSelect`/`renderToggle` API divergence between modules during transition.** If the sidepanel module is deleted in the same item that introduces the settings module, R3 may briefly have neither working in the unbuilt state. | LOW | LOW | R3 implementation order: (1) build new module under `settings/`, (2) repoint B-038 + B-040 calls from `./settings-dialog.js` to `./settings-fields.js`, (3) delete `sidepanel/settings-dialog.js` and dialog DOM in same commit. Tests run after step 3. Single-commit landing keeps the tree consistent. |
| R-7 | **Theme tokens reachability.** Settings page lives at `chrome-extension://<id>/settings/settings.html`. Same origin as sidepanel + newtab + popup; theme tokens (CSS custom props) work identically. `theme-init.js` must be loaded as a `<script>` tag in `<head>` before stylesheet (FOUC prevention precedent from sidepanel + newtab). | LOW | LOW | Reuse `sidepanel/theme-init.js` or copy the ~10-LOC pre-paint resolver verbatim into `settings/theme-init.js` (§42 newtab precedent — newtab has its own copy). R2 picks one. |
| R-8 | **Manifest regression — `web_accessible_resources` accidentally added.** A naive R3 might assume `chrome.tabs.create` requires the URL to be web-accessible. It does not — extension-origin URLs are reachable to the extension itself without WAR declaration. | LOW | MED (perm bloat) | R2 documents: zero `web_accessible_resources` change. R4 [security-reviewer] verifies. |
| R-9 | **Interaction with §41 B-035 standalone window.** If the user has standalone window open AND opens settings tab AND uses display-mode pref to switch from window to sidepanel: standalone closes? Stays open? | LOW | LOW | Out of scope — pref change does not auto-dismiss existing surfaces (B-038 §43 ships this contract: pref change updates routing for FUTURE actions, doesn't tear down current windows). Settings tab is independent of any open standalone or sidepanel. No collision. R2 §44.7 documents this explicitly. |
| R-10 | **Mobile/desktop differences.** Tab Junkie is desktop-only (CLAUDE.md). Settings page is full-tab-width — Edge desktop minimum is ~640 px. | NEAR-ZERO | NEAR-ZERO | Settings page CSS targets desktop widths. No mobile breakpoints needed. Confirmed against CLAUDE.md "desktop-first, no mobile layout work required." |
| R-11 | **Performance budget for first paint.** Settings page first paint < 200 ms (CLAUDE.md). Page is small (no item grid, no live state, no fuzzy index) — single `MSG_GET_PREFERENCES` round-trip + render of 5-6 toggle/select rows + 4 import/export buttons. | NEAR-ZERO | LOW | Skeleton placeholder while prefs load (sidepanel-style). R2 specifies a budget. R5 measures against UAT. |
| R-12 | **Destructive-action confirmation drift.** B-093 rehomes import/export buttons; the existing "replace all bookmarks?" preview confirmation (B-070 §AC4) MUST be preserved. AC carve-out is explicit in BACKLOG. | LOW | HIGH (data-loss class) | B-093 R3 owns this preservation. R2 of B-091 calls it out as a constraint on the import/export Data section. R5 UAT exercises every import path from the new entry point. The DoR Gate 7 statement in BACKLOG already commits to "RETAINED" for B-093. |
| R-13 | **B-039 `newTabOverride` ghost key.** §42 D-2a Sprint 29 close left `newTabOverride: false` in `DEFAULT_PREFERENCES` for backward compat but no UI exposes it. R2 must NOT resurrect it in the settings page. | LOW | LOW | Audit: settings page renders ONLY the prefs that have UI (`displayMode`, `autoCollapseSubGroups`, plus B-092 `denseLayout` and B-093-data and S31-themes). `newTabOverride` stays in the schema but is invisible. R2 documents. |

**Top-3 by combined likelihood × impact:** R-5 (helper port strategy — fork recommended); R-12 (destructive-action preservation in import/export rehome — owned by B-093 but flagged here); R-1 (multiple-tabs hygiene — focus-existing dispatcher).

---

## §44.4 Candidate Sub-Item Splits

**Recommendation: NO SPLIT. B-091 ships as one L item per the existing R1+ pipeline.**

Reasoning:

1. **Atomic surface migration.** The B-089 modal is being deprecated AND replaced AND wired to the existing prefs (B-038 + B-040). Splitting into "build the page" + "migrate prefs" + "delete the modal" creates a window in which the gear button is broken or the prefs are double-homed (modal AND page both render them). Atomic landing avoids the half-state.

2. **Wave 1 dependency clarity.** B-092 + B-093 explicitly block on "B-091 R3 lands first." If B-091 is split, the Wave-1 dependency surface fragments — B-092 might depend on sub-item B-091a (page scaffolding) but not B-091b (pref migration); B-093 depends on the Data section being present, which is part of the page scaffolding but not the pref migration. Single L item keeps the dependency hand-off clean.

3. **L is the right size for one Spike-First L.** Estimated surface: new `settings/settings.html` (~100 LOC), `settings/settings.js` (~250 LOC bootstrap + dispatch + render), `settings/settings.css` (~200 LOC), `settings/settings-fields.js` (~250 LOC forked from B-089 module), `settings/theme-init.js` (~10 LOC), `manifest.json` (zero net change), repointing sidepanel.js gear handler (~10 LOC delta), deletion of `sidepanel/settings-dialog.js` + the `#settings-dialog` DOM block in `sidepanel.html` (negative LOC). Total: ~700 net LOC + tests. Comfortably L; not an XL that forces split.

4. **CLAUDE.md Tier 3 rule.** The Spike-First tier exists *to allow* an XL/L to ship as one item with R0 risk-mapping. We have done that here — risks are inventoried, surface is locked. R1 + R2 + R3 can proceed without further fragmentation.

If R2 discovers unexpected complexity (e.g., shared focus-trap helpers turn out to be deeply entangled), [solution-architect] can re-split at R2. The spike does not preclude that. But on current evidence, single L is correct.

---

## §44.5 Manifest Impact

- **New manifest declarations:** **NONE.** `chrome.tabs.create({url: chrome.runtime.getURL('settings/settings.html')})` works without a manifest entry. The URL is extension-origin; no `web_accessible_resources` declaration needed (WAR is for cross-origin reachability — irrelevant here).
- **New permissions required:** **NONE.** `chrome.tabs.create` is already used by §41 B-035 + §43 B-038 + numerous other paths under the existing `tabs` permission. `chrome.tabs.query` (used for "focus existing" dispatcher in R-1 mitigation) likewise runs under `tabs`. `chrome.tabs.update` already in use. **C-6 verdict: PASS — zero new permissions to justify.**
- **Existing manifest declarations affected:** **NONE.** `side_panel.default_path`, `chrome_url_overrides.newtab`, `action.default_popup`, `commands.*`, `content_security_policy.extension_pages` — all unchanged. Settings page is not declared in any of these slots; it is opened on-demand via `chrome.tabs.create` from a runtime trigger (gear button).

**R2 §44 design chapter MUST re-confirm manifest zero-delta. R4 [security-reviewer] audits. R6 close MUST verify against shipped manifest.**

---

## §44.6 Reuse Surface

| Asset | Reuse strategy | Source | Notes |
|-------|---------------|--------|-------|
| `renderToggle` / `renderSelect` field registry + section/legend DOM construction | **Fork** to `settings/settings-fields.js` | `sidepanel/settings-dialog.js` | See R-5. New module drops dialog-lifecycle deps (`overlayEl`, `activateFocusTrap`, `deactivateFocusTrap`, `openSettingsDialog`/`closeSettingsDialog`); preserves `init({ contentEl, errorEl, sendMessage, runtime })` shape, `_fields`, `_fieldsByKey`, `_prefsSnapshot`, `_handleControlChange`, broadcast listener, change-handler optimistic-UI-with-revert. ~250 LOC ported verbatim with the dialog-specific ~150 LOC stripped. |
| Sender-id-validated broadcast subscription (`SCOPE.PREFERENCES` → re-fetch + repaint) | Port verbatim into the forked module | `sidepanel/settings-dialog.js:99-115` | Shape unchanged; tests in `tests/b089-settings-dialog.test.js` provide the contract template — replicate for B-091. |
| `MSG_GET_PREFERENCES` / `MSG_SET_PREFERENCES` / `MSG_STATE_CHANGED` constants | Import from `shared/messages.js` | `shared/messages.js:28-29` + `shared/scopes.js` | Identical wiring to sidepanel + newtab + B-089. Zero new message types. |
| Theme tokens (`--color-bg`, `--color-fg`, `--color-border`, etc.) + `theme-init.js` FOUC pre-paint | Port `theme-init.js` to `settings/theme-init.js` (verbatim copy — same as §42 newtab precedent) | `sidepanel/theme-init.js` (~10 LOC) | Newtab has its own copy; settings page does the same. Single-source-of-truth refactor is S31+ scope. |
| CSS tokens for toggle pill (`.settings-toggle__track`, `.settings-toggle__thumb`) and select (`.settings-select`) | Port from `sidepanel.css` to `settings/settings.css` | `sidepanel/sidepanel.css` (settings-* selectors) | Tokens are theme-agnostic CSS custom props; no new tokens needed. R2 may consider extracting to `shared/settings-controls.css` if drift becomes a concern — flagged for S31+. |
| `chrome.tabs.create` + `chrome.tabs.query` + `chrome.tabs.update` "focus existing if open, else create" pattern | Adapt §41 D-3 option (c) precedent | `background/service-worker.js` (B-035 `openOrFocusStandaloneWindow`) | Re-implement in sidepanel-context (or SW, R2 decides) for the gear-click handler. Cold-start safe by construction. ~30 LOC. |
| Dispatch helper for click-to-open from gear | Reuse existing `sidepanel.js` helper convention | `sidepanel/sidepanel.js` (gear button click listener) | R3 repoints the existing `triggerBtnEl` click listener (currently calls `openSettingsDialog`) to call the new dispatcher. ~5 LOC delta. |
| Settings field validation (allow-list against `DEFAULT_PREFERENCES` keys) | Reuse existing SW-side validator | `background/storage/preferences.js` `validatePrefsPatch` | Already validates `displayMode ∈ {sidepanel, window}`, `autoCollapseSubGroups: boolean`, `newTabOverride: boolean`. B-092 will add `denseLayout: boolean` per the BACKLOG B-092 AC2 spec. Settings page does NOT do its own validation — SW is the single source of truth. |

**Not reused:**
- `dialog-overlay` infrastructure (settings page is not a dialog).
- `_activateFocusTrap` / `_deactivateFocusTrap` (page handles its own focus naturally — first focusable element on `DOMContentLoaded`).
- B-089 module itself (deleted in same commit per AC4).
- Sidepanel's `<dialog>` element semantics (settings page uses semantic `<main>` + `<section>` per §42 newtab precedent).

---

## §44.7 R1 Pre-Conditions

What R1 [product-manager] MUST resolve before R2 can proceed:

1. **Section ordering and labels.** R1 must lock the visible section headings and their order. Proposed (drafting purposes only — R1 owns this): "Display" (B-038 displayMode), "Behavior" (B-040 autoCollapseSubGroups), "Layout" (B-092 denseLayout — placeholder for Wave 1), "Data" (B-093 import/export — placeholder for Wave 1), "Theme" (S31 B-037 placeholder — empty in Sprint 30). R2 cannot draw the layout without locked section ordering.
2. **Navigation/back affordance copy.** Settings tab has no built-in "back" semantics (the user closes the tab via standard browser controls). R1 decides: do we add a top-of-page "Back to Tab Junkie sidepanel" link/button that calls `chrome.runtime.sendMessage` to open the sidepanel + closes the current tab? Recommend: NO in v1 (let the browser tab UX do its job — user dismisses via Cmd/Ctrl+W or tab close button). R1 decides explicitly so R2 doesn't ship a button no one wanted.
3. **Empty-state UX for unfilled sections.** "Theme" section in Sprint 30 has no toggles (S31 fills it). R1 decides: render an empty section with a "Coming soon" placeholder, OR omit the section entirely. Recommend: render with placeholder (sets visual scaffolding so S31 ships into a known slot, no layout shock when S31 lands). R1 confirms.
4. **Error-state UX for `MSG_GET_PREFERENCES` failure on page load.** B-089 modal showed inline error "Could not load settings. Close and try again." Settings page has nothing to "close back to." R1 decides the error copy + recovery affordance (e.g., "Reload page" button calling `location.reload()`).
5. **Gear button label/icon unchanged?** Currently `aria-label="Open settings"` with gear SVG. R1 decides whether the affordance is renamed (e.g., "Settings" with text label) or stays icon-only.
6. **Destructive-action retention statement (DoR Gate 7).** B-091's BACKLOG row already states "**N/A** for the surface itself; existing import/export confirmation flows MUST be preserved unchanged when re-homed (B-093 owns)." R1 confirms this statement carries into the final ACs.
7. **AC10 manifest-permissions zero-new claim restated explicitly.** R1 carries §44.5 into the AC text so R4 reviewers have a concrete claim to audit against.
8. **Test file scope: `tests/b091-settings-page.test.js`.** R1 confirms file name and target test count (≥ N tests covering AC1-AC11). R2 + R5 implement.

R1 pre-condition count: **8.**

---

## §44.8 R2 Pre-Conditions

What R2 [solution-architect] MUST resolve in `docs/design/44-b-091-settings-page.md` before R3 begins:

1. **Dispatcher home (sidepanel-context vs. SW).** Either: (a) gear-button click handler in `sidepanel.js` directly calls `chrome.tabs.query` + `chrome.tabs.create`/`update` — keeps SW write-boundary clean; or (b) gear-button click sends `MSG_OPEN_SETTINGS_PAGE` to SW which dispatches — adds a new message type. Recommend (a) — fewer moving parts, no new message contract. R2 locks.
2. **Focus-management plan on page load.** R2 specifies which element receives initial focus on `DOMContentLoaded` (likely the page H1 or first focusable control once prefs load). Tab order through sections must be deterministic and screen-reader-friendly. Skeleton placeholder visible until prefs resolve.
3. **Performance budget contract.** R2 specifies first paint < 200 ms (CLAUDE.md), prefs round-trip < 50 ms, total interactive < 250 ms. R5 measures.
4. **Broadcast subscription lifecycle.** R2 specifies: subscribe on module load via `chrome.runtime.onMessage.addListener`; do NOT explicitly unsubscribe (tab close GC's the listener with the JS context, per R-3). Sender-id validation against `chrome.runtime.id` (B-089 pattern). Scope filter `SCOPE.PREFERENCES`.
5. **Accessibility plan.** WCAG AA contrast on every section/control; visible focus rings; `<main role="main">` landmark; `<h1>` page title; `<h2>` section headings; toggle `<input type="checkbox">` with associated `<label for>`; select with associated `<label for>`; error states via `role="alert" aria-live="polite"`. R2 specifies.
6. **Rollback plan.** Single `git revert <merge-sha>` removes `settings/` directory + restores `sidepanel/settings-dialog.js` + restores the `#settings-dialog` block in `sidepanel.html` + restores the gear-click handler. Zero storage migration — `tj:prefs` shape is unchanged, so revert is data-safe. R2 documents the rollback procedure verbatim.
7. **C-1 through C-11 audit table.** R2 walks each correctness check. Spoiler from this spike: C-1 N/A (no schema), C-2 N/A (no new message types — but if R2 chooses dispatcher option (b), C-2 PASSES with new `MSG_OPEN_SETTINGS_PAGE`), C-3 PASS (page does its own bootstrap on `DOMContentLoaded`), C-4 N/A, C-5 PASS (`settings/settings.html` resolved via `chrome.runtime.getURL`), C-6 PASS (zero new perms), C-7 N/A or PASS (any URL/title rendering uses `textContent`), C-8 PASS (`chrome.tabs.*` SW-reachable), C-9 PASS (every section has empty/loading/error states defined), C-10 N/A, C-11 PASS-vacuous (zero SW writes on the open path; pref-write path is the existing B-089 fire-and-forget shape preserved by the forked module).
8. **`renderToggle` / `renderSelect` API contract for the forked module.** R2 specifies the new module signature (likely `init({contentEl, errorEl, sendMessage, runtime})` — drop the dialog-related deps), the field registry (unchanged shape), the change handler (unchanged shape with revert + inline row error), and the broadcast listener (unchanged shape but no dialog-open guard on refresh).
9. **B-089 deletion checklist.** R2 enumerates every file/element being removed: `sidepanel/settings-dialog.js` (delete file), `sidepanel/sidepanel.html` `#settings-dialog` block + `#settings-content` + `#settings-error` + `#settings-close-btn` (delete elements; gear button stays but its handler is repointed), `sidepanel/sidepanel.js` settings-dialog import + DOM refs + `initSettingsDialog` call + `renderSettingsSelect` call for B-038 + `renderSettingsToggle` call for B-040 (delete; B-038 and B-040 calls are repointed to the new module loaded inside settings.js's bootstrap, NOT in sidepanel.js). Existing B-089 + B-038 + B-040 tests are inventoried for impact (some test deletions, some test repoints).
10. **Test-file plan.** R2 specifies what `tests/b091-settings-page.test.js` covers (page boot → prefs load → field paint → toggle change → broadcast sync → error state) and whether `tests/b089-settings-dialog.test.js` is deleted, repointed, or partially preserved.

R2 pre-condition count: **10.**

---

## §44.9 Open Questions

1. **Should the settings page replace the gear icon's tooltip from "Open settings" to "Open settings (new tab)" to set user expectation that a tab opens?** Tiny UX nit; R1 decides. Default: leave label unchanged.
2. **Is there appetite to add a "Settings" entry in the toolbar popup (B-082) so users can reach Settings from the popup in addition to the sidepanel gear?** Out of scope for B-091 R0; flagged as a future polish candidate. R1 may decide to defer to S31+ as a polish item.
3. **Does the user want a keyboard shortcut for opening Settings (analogous to Alt+Shift+J for standalone window)?** Out of scope for B-091 R0; flagged as a future polish candidate. Would require a new `commands` entry in manifest. Defer.

Open question count: **3.**

---

## §44.10 Spike Verdict

**READY FOR R1.** D-1 locked: Candidate B (`chrome.tabs.create` dedicated tab). Top risks inventoried with mitigations. No split — single L Spike-First item proceeds. Manifest delta zero. Reuse strategy: fork B-089 helpers into `settings/settings-fields.js`, delete the original module + dialog DOM atomically. Eight R1 pre-conditions and ten R2 pre-conditions enumerated; three open questions documented.

**Hand-off:** [scrum-master] dispatches [product-manager] for R1 against this spike memo as the surface-strategy contract. R2 [solution-architect] writes `docs/design/44-b-091-settings-page.md` after R1 lands with locked ACs.
