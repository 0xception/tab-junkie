# Sprint 15 — R4 Findings

> Reviewers: [code-reviewer], [security-reviewer] (Fast Track — no qa-reviewer).
> Items: B-058 (S), B-027 (S). B-059 (M) has its own Full-tier R4 block below once built.

---

## Sprint 15 — B-058 [code-reviewer]

Files in scope: `shared/url.js`, `background/messages/storage-handlers.js`, `tests/b058-scheme-allowlist.test.js`, `tests/promote-tab.test.js`, `tests/legacy-migration.test.js`.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `shared/url.js:71–73` | `hasScheme` opaque-scheme detection is a named-scheme allowlist inside a named-scheme allowlist. The `/^(about\|view-source):/i` branch must be kept in sync with `ALLOWED_URL_SCHEMES` manually. Any future opaque-path scheme added to the `Set` would silently have `https://` prepended, causing a parse error. Coupling is non-obvious from the `Set` definition alone. | Extract an `OPAQUE_PATH_SCHEMES` constant (or derive from `ALLOWED_URL_SCHEMES`) so `hasScheme` stays aligned. At minimum, add a `// KEEP IN SYNC WITH ALLOWED_URL_SCHEMES` cross-reference comment. |
| M-2 | `background/messages/storage-handlers.js:214` | Extra blank line left after removed block-list: `const url = tab.url \|\| '';` is followed by a blank line before the AC4 comment, creating asymmetric whitespace vs surrounding blocks. | Remove the extra blank line. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `tests/promote-tab.test.js:99` | AC3 chrome:// test asserts `assert.equal(item.url, 'chrome://settings')` against the exact raw tab URL. `normalizeUrl` may canonicalize to `chrome://settings/` (WHATWG trailing slash on authority-only URLs). Prefer `startsWith` or assert against `normalizeUrl(tab.url)`. |
| L-2 | `tests/b058-scheme-allowlist.test.js:63–65` | Only asserts `startsWith('chrome://settings')` for a query-string URL — truncated output would still pass. Consider tightening to check query string or full path. |
| L-3 | `shared/url.js:23–32` | `ALLOWED_URL_SCHEMES` is a mutable `Set` exported as `const` — any importer can `.add()` / `.delete()` silently. Pre-existing pattern; surface expanded with B-058. Consider `Object.freeze` wrapper or `@readonly` JSDoc. |

### Verdict
**Clean with minor cleanup.** 0 CRITICAL / 0 HIGH. No fixes required before R5; MEDIUMs are small pre-merge polish.


---

## Sprint 15 — B-027 [code-reviewer]

Files in scope: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`, `sidepanel/sidepanel.html`, `tests/b027-group-header-menu.test.js`.

### CRITICAL
_None_

### HIGH

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:3495–3504` | `e.preventDefault()` is called unconditionally before `_openGroupContextMenu` runs its `__ungrouped__` early-return. Right-clicking the Ungrouped header suppresses the browser's native context menu and shows nothing — a silent dead zone. | Check `groupId === '__ungrouped__'` in the event handler itself before calling `preventDefault`. |
| H-2 | `sidepanel/sidepanel.js:3005–3048` | All three `select-*` handlers call `_clearSelection()` (which internally calls `_updateBulkBar()`) then immediately call `_updateBulkBar()` again — two DOM renders where one suffices (empty intermediate + final). | Replace `_clearSelection()` with inline `_selection.clear()` and a single trailing `_updateBulkBar()`. |

### MEDIUM
_Details not captured by reviewer summary (3 MEDIUM items noted — counts only)._

### LOW
_Details not captured by reviewer summary (3 LOW items noted — counts only)._

### Verdict
**Must-fix H-1 and H-2 before R5.** Implementation is solid; all 7 menu actions present, ARIA/focus OK, test coverage thorough. Two HIGH issues are localized fixes.


---

## Sprint 15 — B-058 [security-reviewer]

Scope: Files reviewed — `shared/url.js`, `background/messages/storage-handlers.js`, `tests/b058-scheme-allowlist.test.js`, `tests/promote-tab.test.js`, `tests/legacy-migration.test.js`.

**Threat model checked**:
- `javascript:` / `data:` hard-reject on every ingress path (promote, bulk-create, import, legacy migration) — all route through `createItem → validateNewItem → normalizeUrl → ALLOWED_URL_SCHEMES` in the SW
- Case-sensitivity bypass (`JaVaScRiPt:`) — WHATWG URL parser lowercases `protocol`, blocked
- Whitespace / unicode / zero-width bypass — URL parser restricts scheme to ASCII `[a-zA-Z][a-zA-Z0-9+\-.]*`, rejected at parse
- `view-source:javascript:` / `view-source:data:` nesting — Chrome renders view-source as text (no execution); `chrome.tabs.create` additionally refuses raw `javascript:` URLs
- Allowlist enforcement is server-side in the SW — not client-side only
- URL rendering: sidepanel uses `chrome.tabs.create({url})`, never `.href`. `innerHTML` confined to static SVG icons
- No new `console.*` statements leaking URL strings

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (sec) | `shared/url.js:71–73` | Opaque-scheme detection hard-coded to `(about\|view-source)` only. If `ALLOWED_URL_SCHEMES` is ever extended with another opaque-path scheme, the `hasScheme` regex will NOT match, `https://` will be silently prepended, and the input will fall through to the `https:` branch of the allowlist. Not exploitable today — latent bypass fragility / defense-in-depth gap. Overlaps with [code-reviewer] M-1. | Derive the opaque-scheme regex from `ALLOWED_URL_SCHEMES` (or an `OPAQUE_PATH_SCHEMES` subset). Minimum: add `// SECURITY: keep in sync with ALLOWED_URL_SCHEMES — drift allows scheme-coercion on the https fallback` comment at the regex. |

### LOW

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| L-1 (sec) | `shared/url.js:82` | `StorageError` details carry raw user `input` on parse failure. Swallowed today, but any future `console.error(err)` would leak rejected URL payloads (PII, credential-bearing strings). B-058 widens the funnel. | Drop raw `input` from `details`, or document project-wide: StorageError details must never be logged verbatim. |
| L-2 (sec) | `background/messages/storage-handlers.js:210–214` | Comment describes delegation but does not restate that `javascript:`/`data:` remain blocked. Future readers skimming only the promote handler won't see the XSS defense. | Add: `// NOTE: javascript:/data: still rejected inside normalizeUrl via ALLOWED_URL_SCHEMES.` |
| L-3 (sec) | `tests/b058-scheme-allowlist.test.js` | Missing regression tests for mixed-case (`JaVaScRiPt:alert(1)`), leading whitespace, zero-width (`'javascript\u200B:alert(1)'`), and opaque base64 data URL vectors. Parser + allowlist handles all four today; explicit tests catch regressions if the regex is loosened. | Add `assert.throws(..., ERR_VALIDATION)` cases for the four vectors. |

### UAT Security Checks

| AC | UAT check |
|----|-----------|
| Security | Paste `javascript:alert(1)` into new-item dialog → must reject, no alert fires |
| Security | Paste `data:text/html,<script>alert(1)</script>` → must reject |
| Security | Promote a `chrome://extensions` tab → stored; click opens internal page (no sandbox escape) |
| Security | Promote `view-source:https://example.com` → stored; click opens as rendered text |
| Security | Devtools-set a live tab URL to `JaVaScRiPt:alert(1)` and promote → must reject at `normalizeUrl` |

### Verdict
**Security-sound.** `javascript:` and `data:` remain hard-blocked; removing the duplicate promote-handler block-list eliminates drift without loosening enforcement. One MEDIUM (overlapping [code-reviewer] M-1) and three LOW hardening nits; none block R5.


---

## Sprint 15 — B-027 [security-reviewer]

Scope: `sidepanel/sidepanel.js`, `sidepanel/sidepanel.html`, `sidepanel/sidepanel.css`, `tests/b027-group-header-menu.test.js`. No `manifest.json` change, no new message types (reuses `MSG_UPDATE_GROUP`, `MSG_DELETE_GROUP`, `MSG_NAVIGATE_TO_ITEM`, `MSG_CLOSE_TABS`), no new permissions.

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 (sec) | `sidepanel/sidepanel.js:2979–2990` (Close all open tabs) | `openConfirmDialog` called without `triggerEl: header` in the options bag; on dismissal, focus falls back to whatever `_dialogTriggerEl` was previously set to (could be `null` → `<body>`). The sibling Delete Group branch at line 3086 correctly passes `triggerEl: header`. Focus-trap / a11y hygiene inconsistency. | Add `triggerEl: header` to the options object at `sidepanel.js:2986–2989`. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 (sec) | `sidepanel/sidepanel.js:2988, 3085` | Group name concatenated into confirm-dialog `body` strings. Safe today (line 497 sets via `textContent`), but would become XSS if a future refactor switched to `innerHTML`. Add `/* SECURITY: set via textContent — do not switch to innerHTML */` comment at `sidepanel.js:497`. |
| L-2 (sec) | `sidepanel/sidepanel.js:404–409` (`_buildGroupColorSwatches`) | `className` / `aria-label` interpolate `color`. Safe because callers pass `GROUP_COLORS` allowlist, but the function itself does not enforce this. Defense-in-depth: early-return if `!GROUP_COLORS.includes(color)`. |
| L-3 (sec) | `sidepanel/sidepanel.js:406` | Swatch `aria-label` is the raw English token — not localized. a11y/i18n follow-up, not security. |
| L-4 (sec) | `sidepanel/sidepanel.js:2960, 3077` | `{ title: group.name }` passed to `openConfirmDialog` is unused when `body` override is present (line 498 short-circuits). Future-reader note only. |

### Verdict
**No security blockers for R5.** Clean XSS story — all user-provided group names flow only through `textContent` / `input.value`. Destructive actions gated behind `openConfirmDialog`. One MEDIUM focus-management inconsistency (M-1) worth bundling with [code-reviewer] H-1/H-2 fix.

---

## Sprint 15 — R4 Rollup

| Item | Tier | CRIT | HIGH | MED | LOW | Gate |
|------|------|------|------|-----|-----|------|
| B-058 [code-reviewer] | S | 0 | 0 | 2 | 3 | ✅ pass |
| B-058 [security-reviewer] | S | 0 | 0 | 1 | 3 | ✅ pass |
| B-027 [code-reviewer] | S | 0 | **2** | 3 | 3 | ⚠️ fix HIGH before R5 |
| B-027 [security-reviewer] | S | 0 | 0 | 1 | 4 | ✅ pass |

**Must fix before closure (HIGH):**
- B-027 H-1: Ungrouped header `preventDefault` dead zone
- B-027 H-2: Double DOM render in `select-*` handlers

**Bundled MEDIUMs (small, same diff area):**
- B-027 M-1 (sec): `triggerEl: header` on Close-all-tabs confirm
- B-058 M-1 / M-1 (sec): opaque-scheme `// SECURITY / KEEP IN SYNC` comment at `shared/url.js:71`
- B-058 M-2: blank line at `storage-handlers.js:214`

LOWs deferred. Routing to [frontend-engineer] next.

---

## Sprint 15 — B-059 [security-reviewer]

Scope + threat model checked against the 8 focus areas in the R4 brief.
Files inspected: `background/messages/storage-handlers.js`,
`shared/errors.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`,
`sidepanel/sidepanel.html`, `tests/promote-tab.test.js`,
`tests/b059-duplicate-warn.test.js`. Also verified `manifest.json` (no
changes) and `background/tabs/floating-groups.js` (not in diff).

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._ The duplicate-warn dialog body composes a user-controlled title
(`existing.title`) and a group label (`_groupLabelForItem(existing)`)
into a string, but that string is written to `confirmBodyEl.textContent`
at `sidepanel/sidepanel.js:555` — no HTML parsing path, so even a title
containing `<script>` or angle-bracket payloads is rendered as inert
text. Heading uses `textContent` at :554. Confirm button label uses
`textContent` at :557. No XSS surface.

### LOW
| # | File | Finding | Fix |
|---|------|---------|-----|
| B-059 L-1 (sec) | `sidepanel/sidepanel.js:557–558` | `variant` param default is `'destructive'` and the two call sites use string literals `'primary'` / (default). Safe today, but `dataset.variant` writes whatever string it's given — a future caller that forwards a user-controlled value would paint arbitrary CSS-attribute state. Hardening nit: `confirmDeleteBtnEl.dataset.variant = variant === 'primary' ? 'primary' : 'destructive';` would lock the set to a two-value enum and defend against future misuse. | Optional: clamp to allowlist at the call site. |
| B-059 L-2 (sec) | `shared/errors.js:28–35` | The retained `ERR_DUPLICATE_URL` constant + comment explicitly documents the deploy-window fall-through. Good. Nit: add a TODO-removal marker tied to a version (e.g. "remove after v2.1.0") so the stale code path doesn't linger indefinitely once the deploy window closes. | Add version-gated removal note to the JSDoc. |
| B-059 L-3 (sec) | `sidepanel/sidepanel.js:3466–3468` | Fall-through `ERR_DUPLICATE_URL` toast `'A bookmark with this URL already exists'` is user-facing text only — no URL or title leaked to console or DOM. Confirmed no `console.log(url)` / `console.error(item)` added anywhere in the B-059 diff. | No action. |

### UAT security checks
- **XSS (title field)**: Save tab whose title is `<img src=x onerror=alert(1)>` to group A. Open a second tab with the same URL; context-menu → Save to group B. Dialog body must render the literal string, no alert fires. `textContent` usage verified statically at :555.
- **XSS (group name)**: Rename group to `<script>alert(1)</script>`. Trigger duplicate-warn. Group label must render inert.
- **Payload validation regression**: `MSG_PROMOTE_TAB` with `{tabId: "1"}` (string), `{tabId: null}`, `{groupId: 42}` must still reject with `ERR_VALIDATION`. Handler checks preserved at `storage-handlers.js:189–195`.
- **Scheme allowlist**: `javascript:alert(1)` and `data:text/html,<script>` must still reject through `createItem → normalizeUrl → ALLOWED_URL_SCHEMES`. Test `promote-tab.test.js` AC9 covers `javascript:` rejection.
- **Storage flood**: Confirm no UI affordance lets a page script auto-promote. Context-menu + keyboard are both user-initiated; `MSG_BULK_CREATE_ITEMS` size caps (B-024 M3) still cover the bulk path.
- **Sender validation**: No new `chrome.runtime.onMessage.addListener` calls in diff. Sole listener at `sidepanel.js:2558` is pre-existing.
- **No network**: Grep for `fetch(` / `XMLHttpRequest` / `new WebSocket` in diff — none present.

### Verdict
**PASS** — ship as-is. No CRITICAL/HIGH/MEDIUM findings. Three LOW hardening nits are deferrable to a follow-up sweep; none block B-059 closure. The removal of the SW-side duplicate check is a controlled data-layer relaxation (product decision, §29) and does NOT open any new injection, permission-escalation, or data-exfiltration surface: all user-controlled strings flowing into the new soft-warn dialog go through `textContent`, payload validation is intact, and no manifest permissions were touched.

---

## Sprint 15 — B-059 [code-reviewer]

Scope: `background/messages/storage-handlers.js` (removed duplicate-reject block, lines ~205–233 pre-diff); `shared/errors.js` (JSDoc added ~line 25); `sidepanel/sidepanel.js` (helpers `_findDuplicateSavedItem` ~509–521, `_groupLabelForItem` ~528–532, `openConfirmDialog` signature ~537–574, `_openOpenTabContextMenu` change-handler ~3365–3416, `_bulkMoveToGroup` tabIds branch ~2806–2879; B-027 group dialog code ~389–551, ~3003–3209); `sidepanel/sidepanel.css` (primary-variant rule ~749–759; B-027 swatch rules ~769–792); `tests/promote-tab.test.js` (AC4 flip); `tests/b059-duplicate-warn.test.js` (new, 13 cases).

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `tests/b059-duplicate-warn.test.js:65` | **Test fixture key field diverges from production shape.** `makeCtx` builds `openTabsById` with `t.id` as the map key (`openTabsById.set(t.id, t)`), but production populates `_cachedOpenTabsById` with `t.tabId` (`new Map(_cachedOpenTabs.map((t) => [t.tabId, t]))`; `open-tabs.js:43`). Tests pass because the numeric `id` values in fixtures (42, 7, 1–5) happen to match the numeric `tabId` parameter passed to `singleTabSaveHandler` / `bulkSaveHandler` — but the fixture object lacks the `tabId` field that the production object carries. If a future test accesses `tab.tabId` inside the shim (the production code does `tab.url`, `tab.title`, `tab?.tabId`) no crash occurs today, but the naming divergence is a latent maintenance trap. Fix: rename `id` → `tabId` in all fixture open-tab objects (`{ id: 42 … }` → `{ tabId: 42 … }`) and update `makeCtx` to `openTabsById.set(t.tabId, t)` to mirror production. |
| M-2 | `tests/b059-duplicate-warn.test.js` — missing T-8 | **T-8 (URL-normalization boundary / fragment stripping) has no coverage in this file.** `SOLUTION_DESIGN §29.8` explicitly designates T-8 as a test obligation for B-059, instructing it land in either `b059-duplicate-warn.test.js` or `url-normalize.test.js`. Neither file has a `safeNormalizeForMatch('https://example.com#a') === safeNormalizeForMatch('https://example.com#b')` assertion. The `b058-scheme-allowlist.test.js` forMatch tests do not cover the `https:` fragment-stripping path in the context of `_findDuplicateSavedItem`. Fix: add a case to `b059-duplicate-warn.test.js` asserting that `findDuplicateSavedItem` treats `https://example.com#section1` and `https://example.com#section2` as duplicates (i.e., the function returns a match). |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:515` | **`safeNormalizeForMatch` called twice per cached item in `_findDuplicateSavedItem`'s inner loop.** The outer call normalizes the incoming `url` (correct, hoisted), but each iteration re-normalizes `it.url` live. With `_cachedItems` bounded to ~2 000 items and saves being user-initiated (not high-frequency), this is not a measured performance problem. However, the architecture comment in the JSDoc promises "zero IPC, O(n) over cached items" — the hidden constant is actually 2× the normalization cost. Preferred fix: no change required at this scale; acceptable as-is. Optional micro-optimization: pre-normalize `_cachedItems` into a parallel `Map<normalizedUrl, item>` keyed on first-seen during `renderAll`, eliminating per-call linear scans entirely. Defer to B-022 (de-duplication) when that map would be useful anyway. |
| L-2 | `sidepanel/sidepanel.css` (diff lines +19–+50) | **B-027 group-color-swatch CSS rules are in the B-059 diff but are not B-059 logic.** The `.group-color-swatches`, `.group-color-swatch`, `.group-color-swatch:hover`, `:focus-visible`, and `[aria-checked="true"]` rules were absent from the previous commit of `sidepanel.css` yet belong to B-027's group-edit dialog (already shipped in the JS layer). This appears to be a previously-omitted CSS chunk carried in this PR rather than scope creep — the rules have no functional overlap with the soft-warn feature. No action needed for B-059, but flag for [solution-architect] to confirm B-027's DoD CSS checklist was satisfied. |
| L-3 | `sidepanel/sidepanel.js` — B-027 block (~389–551, ~3003–3209) | **Substantial B-027 group-dialog code appears in the B-059 diff.** `openGroupEditDialog`, `closeGroupDialog`, `_handleGroupFormSubmit`, `_buildGroupColorSwatches`, `_openGroupContextMenu`, and six new DOM-element bindings (`groupDialogEl`, `groupFormEl`, etc.) are all attributed to B-027, not B-059. This is either a missed-commit carry-over from the B-027 sprint or code that was intentionally deferred. The B-059 R4 scope-of-review is the six B-059-tagged files; this block has not been through its own R4 gate. Flag for [scrum-master]: confirm B-027's R4 + Definition of Done were completed for this block, or open a new tracking item if this is unreviewed code entering the branch for the first time. |

---

## Sprint 15 — B-059 [qa-reviewer]

Review surface: `background/messages/storage-handlers.js`, `shared/errors.js`,
`shared/url.js`, `sidepanel/sidepanel.js`, `sidepanel/sidepanel.css`,
`sidepanel/sidepanel.html`, `tests/promote-tab.test.js`,
`tests/b059-duplicate-warn.test.js`. Cross-referenced SOLUTION_DESIGN §29,
specifically §29.3.1, §29.4.3, §29.6, and §29.8 (T-1..T-10).

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| B-059 M-1 (qa) | `sidepanel/sidepanel.js:3366–3416` (single-tab) + `:2820–2855` (bulk) | **Dialog copy goes stale if state changes while the dialog is open.** `MSG_STATE_CHANGED` broadcasts (`:2584`) call `renderAll` which overwrites `_cachedItems`. The already-open duplicate-warn dialog still shows the old `existing.title` / group label, and the aggregate `"N of M tabs already saved"` heading references counts that may no longer be accurate (tabs closed, existing item renamed/moved/deleted). On confirm the dispatch still fires correctly — the bug is a trust/cosmetic one: user sees "saved as X in Work" when X has been renamed in the background. §29.3.1 accepts the *mid-fetch* pre-check staleness but is silent on the *mid-dialog* staleness. | (a) Refresh the dialog copy when an `items`-scope broadcast arrives while `confirmDialogEl` is visible — re-compute `existing` from fresh cache and re-write `confirmBodyEl.textContent`; or (b) document as accepted behaviour in §29.3.1 and add a regression test asserting the UI does not crash on broadcast-during-open. Lightweight (b) is acceptable for M-tier. |
| B-059 M-2 (qa) | `sidepanel/sidepanel.js:3366–3416` | **Cancel → retry friction in single-tab flow.** The context menu is closed synchronously before the dialog opens (`:3374`). If the user cancels the soft-warn, the menu is gone — they have to right-click the row again to retry with a different group. No affordance indicates this. T-3 still passes. | Optional: on Cancel, show a toast "Save cancelled — right-click to retry", or re-open the context menu anchored to the same row. Defer if not a frequent user report. |
| B-059 M-3 (qa) | `tests/b059-duplicate-warn.test.js` | **Tests reproduce the handler logic verbatim rather than importing it.** The test file restates `findDuplicateSavedItem` + `groupLabelForItem` + the dispatch wiring by hand. A future refactor to the real `_findDuplicateSavedItem` in `sidepanel.js` will pass these tests while silently breaking the real UI. Consistent with `b027-group-header-menu.test.js` house style, but weakens the R5 gate for B-059. | Option A: extract `_findDuplicateSavedItem` and `_groupLabelForItem` to `shared/duplicate-detect.js` so both sidepanel and tests import the same function. Option B (cheaper): add a ESLint comment-based cross-reference check. |
| B-059 M-4 (qa) | `tests/promote-tab.test.js:36–59` vs §29.8 T-7 | **T-7 mapping to the handler test is indirect.** T-7 says "call the `MSG_PROMOTE_TAB` handler directly … asserts no throw, no `ERR_DUPLICATE_URL`". `promote-tab.test.js` re-declares a local `promoteTab()` helper that mirrors the handler body. If someone re-introduces the `ERR_DUPLICATE_URL` throw inside the real dispatch while forgetting to update the helper, the test stays green. | Port `promote-tab.test.js` to dispatch through the real `dispatch()` in `storage-handlers.js`, matching the pattern of other handler-level tests. Cheaper interim fix: add a single regression case that imports the real dispatcher. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| B-059 L-1 (qa) | `sidepanel/sidepanel.js:534–565` | `variant` is documented as `'primary' \| 'destructive'` but is not validated — any caller can write `variant: 'fubar'` and the CSS falls through to red silently. Not a bug today (two callers); latent risk as the signature is reused. | Clamp inside `openConfirmDialog`: `const v = variant === 'primary' ? 'primary' : 'destructive';` then use `v` for the dataset write. |
| B-059 L-2 (qa) | `sidepanel/sidepanel.js:2866` | Aggregate dialog uses `{ title: tabIds.length + ' tabs' }` as the synthetic item. Harmless today because `openConfirmDialog` reads `item.title` only when `body` is absent. A future refactor that reads `item.title` unconditionally will produce "3 tabs" in a delete dialog. | Pass `null` and tighten the defaults, or drop the synthetic item and accept `null` as the first arg. |
| B-059 L-3 (qa) | `sidepanel/sidepanel.js:3411` | Single-tab confirm label is `'Save anyway'`; bulk is `'Save all N'`. Consistent with §29.6.3 and §29.4.2, but the single-tab label loses count context. Accepted per design. | No action — note for [technical-writer] in R7. |
| B-059 L-4 (qa) | `sidepanel/sidepanel.css:749–758` | `.dialog-btn--danger[data-variant="primary"]` overrides `background`/`border-color` but inherits `color: #ffffff` from the base `.dialog-btn--danger` rule. If the base ever uses a theme token, the primary override silently picks up an unintended foreground. | Write `color: #ffffff;` explicitly in the `[data-variant="primary"]` block. |
| B-059 L-5 (qa) | `sidepanel/sidepanel.html:141` | Confirm button `id="confirm-delete-btn"` even when label is "Save anyway". Most AT announce `textContent`, but some dev-tooling/AT extensions expose the id — contradicts the rendered label. | Rename to `confirm-action-btn` (breaking: 4–6 `sidepanel.js` references). Defer. |
| B-059 L-6 (qa) | `tests/b059-duplicate-warn.test.js` | **T-8 (fragment-only diff) and T-9 (floating-group regression) are not in this file.** §29.8 routes T-8 to `tests/url-normalize.test.js` and T-9 to `tests/b010-live-state.test.js`; neither file was touched this sprint. Separately flagged by [code-reviewer] M-2. | Read those test files in R5 and explicitly link the T-8 / T-9 case IDs as comments; if not covered, add cases (matches [code-reviewer] M-2). |
| B-059 L-7 (qa) | `sidepanel/sidepanel.js:2812–2818` | Bulk pre-scan is O(n·m): per-tab linear scan of `_cachedItems`. At 1 000 × 50 = 50k normalizations — within perf budget but wasteful. | Build a Set once per `_bulkMoveToGroup` call: `const saved = new Set(_cachedItems.map((i) => safeNormalizeForMatch(i.url \|\| ''))); for (…) if (saved.has(norm)) …` — drops to O(n+m). Overlaps with [code-reviewer] L-1. |
| B-059 L-8 (qa) | `sidepanel/sidepanel.js:3386–3392` | The `ERR_DUPLICATE_URL` fall-through toast is unreachable in steady state. The comment at :3381 documents the deploy-window rationale, but no unit-level test asserts the branch still works if it fires. | Add a test that stubs `sendMessage` to reject with `{code:'ERR_DUPLICATE_URL'}` and asserts the toast copy. |
| B-059 L-9 (qa) | `sidepanel/sidepanel.js:2841` | `_clearSelection()` in bulk `proceed()` runs regardless of outcome. If all promotes fail (e.g., safe-mode), selection is cleared AND nothing is saved — user loses their selection and the retry target. Pre-B-059 behaviour, but the soft-warn magnifies the pain (explicit approval + no result + no selection). | On `safeModeHit === true` or `failures === tabIds.length`, skip `_clearSelection`. Out of scope for B-059 proper; file as follow-up. |
| B-059 L-10 (qa) | `sidepanel/sidepanel.js:554` | Default `heading` is hard-coded `'Delete Bookmark?'`. With the new multi-purpose dialog, any future non-delete caller that forgets `heading` gets a delete heading on a non-delete dialog. Both B-059 callers pass `heading` explicitly. | Throw in dev builds when `heading` omitted AND `variant !== 'destructive'`. |

### UAT scenarios

Manual test plan for [test-engineer] in R5. Run against Edge (user's browser, per memory) with the extension loaded unpacked. Every case must PASS before sprint close.

**Happy path**
- UAT-1 (T-1): Save a unique tab from Open-Tabs context menu → no dialog; tab promoted; appears in target group.
- UAT-2 (T-4): Select 3 unique open-tab rows → bulk "Move to group" → no dialog; 3 items created.

**Soft-warn path**
- UAT-3 (T-2): Save a tab whose URL already exists → dialog appears with `role="alertdialog"`, heading "URL already saved", body cites existing title + group label, confirm button is blue (primary) NOT red, label "Save anyway". Click "Save anyway" → second item created; focus returns to Open-Tabs row.
- UAT-4 (T-3): Same setup; press Escape → dialog closes; no item created; focus returns to trigger row.
- UAT-5 (T-5): Select 5 tabs (2 duplicates, 3 unique) → bulk Move → dialog "2 of 5 tabs already saved", button "Save all 5", blue. Confirm → 5 promotes; 5 new items.
- UAT-6 (T-6): Select 3 tabs all duplicates → bulk Move → dialog "3 of 3 …" → Cancel → no items created. (Note L-9: selection is still cleared.)

**A11y**
- UAT-7: Keyboard-only. Right-click row → Tab through options → select duplicate group → dialog opens with focus on Cancel. Tab cycles Cancel → Save anyway → wraps to Cancel (never leaves). Shift+Tab backward. Enter on Cancel = close; Enter on Save anyway = promote.
- UAT-8: Screen reader (NVDA / Narrator on Edge). On dialog open, announce reads heading → body (existing title + group label) → action buttons. `aria-describedby="confirm-body"` must be announced.
- UAT-9: Contrast. Primary button on `--accent` light (#2563eb / white text ≈ 4.86:1 — WCAG AA PASS) vs dark (#60a5fa / white text ≈ 2.77:1 — **WCAG AA FAIL** for normal-size text). This is a pre-existing `--accent` token issue, but B-059 creates the first primary-in-destructive-slot caller, so it's the first time a *confirm-dialog* button exposes it. Flag for [product-manager]: either darken the dark-theme accent, or accept as known token defect and file separately.
- UAT-10: Reduced motion. No animation added to the dialog — safe.

**State coverage**
- UAT-11: Safe mode. Force safe mode (stored schema version > `KNOWN_VERSION`) → trigger duplicate save → dialog shows; confirm → toast "Cannot save while in safe mode"; no item created; no dialog regression.
- UAT-12: Empty `_cachedItems` on fresh install → context-menu save of any tab → no dialog (pre-check returns null), promote dispatched directly.
- UAT-13: Stale menu. Open context menu on tab T; close T in another window; pick a group. Handler dispatches, SW returns `ERR_NOT_FOUND`, toast "Couldn't save tab — try again". No crash.
- UAT-14: Mid-dialog broadcast (M-1). Open duplicate-warn dialog; in another window create a tab that triggers an `items`-scope broadcast → `renderAll` runs underneath. Dialog remains visible and functional; Confirm dispatches. Note the cosmetic staleness per M-1.
- UAT-15 (T-8): Fragment-only. Saved `https://example.com#intro`; open `https://example.com#methods`; Save → soft-warn SHOULD fire. Confirm body cites the existing item title.
- UAT-16 (T-8 adjacent): Trailing slash. Saved `https://example.com`; tab URL `https://example.com/` → soft-warn should fire.
- UAT-17: 50-duplicate bulk. 50 open tabs all matching saved items; Select all; bulk Move. Heading "50 of 50 tabs already saved"; button "Save all 50". Verify copy doesn't overflow the modal; verify pre-scan perf feels instant.

**Regression**
- UAT-18: Delete an item via row action → existing confirm dialog shows with RED "Delete" button (variant default restored). No leak of primary-blue from a prior duplicate-warn open. Critical regression check — `dataset.variant` is always written, should be safe.
- UAT-19: Bulk Remove 3 items → dialog "Remove 3 items?" with RED confirm.
- UAT-20: Group delete confirm (at `:3072` and `:3173`) → RED destructive treatment.

### Verdict

**CONDITIONAL PASS** — 0 CRITICAL, 0 HIGH, 4 MEDIUM, 10 LOW. Core soft-warn flow meets M-tier DoD: T-1..T-6 and T-10 covered, `role="alertdialog"` + `aria-labelledby` + `aria-describedby` wired correctly, primary-variant CSS swap applied via `data-variant` on every open (regression-safe), Escape-to-cancel + trigger-focus-restore intact.

Recommended fixes BEFORE closing B-059:
- **M-4** (bind T-7 to the real dispatcher) — small; closes the biggest R5 gap the agent's own test-file header acknowledges.
- **L-6** (verify T-8 + T-9 coverage, add reference comments) — documentation only. Overlaps [code-reviewer] M-2.

Deferrable with explicit backlog entries:
- **M-1** (mid-dialog broadcast staleness) — document acceptance per §29.3.1 or add a re-render hook.
- **M-2** (Cancel → retry friction) — UX polish.
- **M-3** (test-file reproduces logic) — house style; revisit when a shared module is extracted.
- All LOW — file as nits.

**Blocking UAT gate**: if UAT-9 (dark-theme contrast) fails 4.5:1 on the primary button, that is a new WCAG AA regression introduced by B-059 at this specific call site. Either (a) swap `--accent` for a higher-contrast token in `[data-variant="primary"]` on the dark theme, or (b) accept as pre-existing `--accent` defect and file separately. Needs [product-manager] call before ship.

---

## Sprint 15 — B-061 [code-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js` | `UNSAVABLE_SCHEME_PATTERN` is a UI-policy twin of `ALLOWED_URL_SCHEMES` in `shared/url.js`. The two constants encode the same policy from opposite directions (allowed set vs. rejected set) and will drift silently if a new scheme is added to one without updating the other. The comment in `url.js` already calls out the opaque-scheme sync risk; this is a second such surface. | Consider exporting a `isUnsavableScheme(url)` helper from `shared/url.js` derived from `ALLOWED_URL_SCHEMES` (e.g. try-parse + `!ALLOWED_URL_SCHEMES.has(parsed.protocol)`), or at minimum add a comment cross-referencing the two constants. Keeps the policy in one place and eliminates silent-drift risk. |
| M-2 | `tests/b061-unsavable-dim.test.js` (lines 95–104) | `patchRow` in the test stub clears `title` by setting `row.title = ''` (an empty string assignment), but the real `_patchOpenTabRow` in `sidepanel.js` calls `row.removeAttribute('title')`. The two behaviors are observably different: an empty `title` attribute is still present in the DOM and may surface a blank browser tooltip on hover, whereas `removeAttribute` removes it entirely. The test passes under the stub but does not exercise the actual cleanup path. | Align either the stub (change `row.title = ''` to a `removeAttribute` call, updating the assertion to check `row.getAttribute('title') === null`) or document the intentional simplification with a comment explaining the stub's limits. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.css` (lines 1227–1244) | The B-061 CSS block has no newline between the closing brace of the opacity rule and the opening of the `.item-title` / `.item-url` compound selector, unlike the surrounding rules which all have a blank line between them. Minor but inconsistent with the file's formatting convention. | Add a blank line between `.item-row[data-live-only="true"][data-unsavable="true"] { opacity: 0.55; }` and the following compound selector. |
| L-2 | `tests/b061-unsavable-dim.test.js` | No test case covers a URL with leading whitespace (e.g., `' javascript:alert(1)'`). The real `chrome.tabs` API can theoretically return a URL with a leading space if the page reports a malformed `location.href`. `_isUnsavableScheme` would return `false` for such input (regex is anchored at `^`), so those rows would NOT be dimmed — which is arguably correct, but the behavior is undocumented and untested. | Add one test asserting `_isUnsavableScheme(' javascript:alert(1)') === false` with a comment explaining that leading whitespace is not trimmed (consistent with how `ALLOWED_URL_SCHEMES` checks via `new URL()` which does strip whitespace — a cross-module inconsistency worth noting). |
| L-3 | `sidepanel/sidepanel.js` (line 328) | `UNSAVABLE_SCHEME_PATTERN` is a module-level `const` defined inside the function comment block for `buildOpenTabRow`, far from the other module-level constants at the top of the file. A reader scanning the constants section will miss it. | Hoist `UNSAVABLE_SCHEME_PATTERN` to the module-level constants section near the other pattern/scheme definitions, with a cross-reference comment to `ALLOWED_URL_SCHEMES` in `shared/url.js`. |
| L-4 | `tests/b061-unsavable-dim.test.js` (line 66) | The lookalike test checks `'javascripts:foo'` and `'database:foo'` — good anchoring tests. However, `'javascript:'` (colon with empty body) is not tested. This is a valid `javascript:` URL in some browser contexts and the regex correctly matches it, but adding it as an explicit positive case would document the boundary. | Add `assert.ok(_isUnsavableScheme('javascript:'))` to the pattern correctness section. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 4 LOW. The implementation is correct and safe. The core pattern, DOM contract (build + patch), attribute cleanup, and CSS selector are all sound. M-1 (policy drift risk between `UNSAVABLE_SCHEME_PATTERN` and `ALLOWED_URL_SCHEMES`) and M-2 (test stub uses empty-string assignment instead of `removeAttribute`, masking a real behavioral difference) are the only items that should be addressed before merge. All LOW items are nits and can be deferred. Fast Track DoD items 1, 2, 3, 7, 8, 9 are satisfied.



---

## Sprint 15 — B-061 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._ No new SW-gate bypass, no XSS surface, no new permissions. The regex is anchored and not subject to ReDoS. Any regex "miss" (e.g., leading whitespace `  javascript:...`) results in a non-dimmed row whose Save action is still hard-rejected by `ALLOWED_URL_SCHEMES` in `background/messages/storage-handlers.js` — the authoritative gate. Dimming is pure visual cue; no new code path touches storage or message dispatch. `row.title` is a hardcoded literal (`'Cannot be saved — unsupported URL scheme.'`), no user-provided string concatenation — no title-attribute XSS vector. No PII in tooltip.

### LOW
| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:1594, 1781` | Regex won't catch URLs Chrome itself normalizes but that a race-condition cold-start payload might report with leading whitespace or trailing junk before the colon (e.g., `"\tjavascript:..."`). Chrome's `tabs` API virtually never surfaces such strings — informational only. | Optional: trim the URL before testing, or leave as-is (SW still rejects at save time). Accept as-is. |
| L-2 | `sidepanel/sidepanel.js:1598, 1785` | Tooltip em-dash encoded as `\u2014`; no i18n layer. | Defer — no i18n infra exists in the project. |
| L-3 | `sidepanel/sidepanel.js` | Story explicitly says "dimming ≠ disabling" — user can still right-click a dimmed row and pick a group from the save-select; SW returns `ERR_VALIDATION`, caller shows the "Cannot save this tab" toast (`sidepanel.js:3412`). This is the documented intended flow per §29.3.1 neighbor (B-059). UX is consistent. No finding. | None. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (all deferrable / informational). B-061 is a pure-rendering visual affordance that layers ON TOP of the authoritative SW allowlist gate. No new attack surface. Regex is safe, tooltip is hardcoded, no user data in attributes. Defense-in-depth intact: even if the dim-check mis-classifies a URL, the SW still rejects `javascript:` / `data:` at save time. Ship.

---

