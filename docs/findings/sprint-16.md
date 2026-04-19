## Sprint 16 — B-063 [code-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:3725–3729` | The `window.blur` listener is registered unconditionally at module load with no cleanup path. For the current architecture (single sidepanel, no programmatic teardown) this is harmless, but if B-035 (standalone window) ever creates a second sidepanel instance in the same window context the listener accumulates. | No action for B-063 — the B-035 forward-checklist note in `BACKLOG.md` already flags this. Confirm at R6 that the note is committed to B-035's AC. |
| L-2 | `tests/b063-blur-close.test.js` | AC2 ("no hover-driven close") is not tested. It is a pure negative / UAT-only AC (verify in browser that `mouseleave` does not close), so automated coverage is legitimately not possible in the JSDOM shim. | Mark explicitly in the test file header that AC2 is UAT-only, consistent with documentation practice on other shim-based tests. |
| L-3 | `tests/b063-blur-close.test.js:127–152` | AC3 invariant test rewires `onBlur` as a local closure that inline-copies the blur handler logic rather than calling `w.onWindowBlur`. This is correct for ordering verification, but the test and the handler can silently diverge if the handler's body is later refactored. | Acceptable for a shim-based test; no code change required. Informational only. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 3 LOW (all informational/deferrable). AC3 ordering invariant (`_contextMenuTriggerRow = null` before `closeContextMenu()`) is correct in both the implementation and the dedicated ordering test. AC7 idempotency early-return is present. No dead code, no stray `console.log`, no commented-out blocks. Test suite covers AC1, AC3, AC4, AC5, AC6, AC7, AC8; AC2 and AC9 are appropriately UAT-only and forward-checklist respectively. B-063 is clear to proceed to [security-reviewer].

---

## Sprint 16 — B-063 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM
_None._

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:3725` | `window.addEventListener('blur', ...)` scope verified: the side panel runs as a top-level extension document (`sidepanel.html` as `default_path`), so `window` is the side panel's own realm — no iframe/frame leakage. Pages in other tabs cannot programmatically force focus away from the side panel (blur is user-gesture-driven in practice). Informational. | None. |
| L-2 | `sidepanel/sidepanel.js:3726–3728` | Handler only reads `contextMenuEl.hidden`, nulls `_contextMenuTriggerRow`, and calls `closeContextMenu()`. It does NOT invoke any menu action (delete / move / save / promote), so a hypothetical programmatic blur cannot be weaponized into a destructive operation. Confirmed in diff. | None. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 2 LOW (informational). Thin UX-only surface: one `window.blur` listener that dismisses a menu. Confirmed: no `console.*` additions (no PII leakage of URLs/titles/group names), no new `manifest.json` permissions, no manifest changes, no new message contracts, no storage writes. Handler is dismiss-only — it never dispatches a menu action, so blur cannot be used as a bypass vector against the confirm-dialog / allowlist / selection guards. Dialog and filter state are explicitly untouched (AC5/AC6 preserved → no form-state leakage). Ship.

---

## Sprint 16 — B-048 [code-reviewer]

Files inspected: `sidepanel/sidepanel.css` (net +56/-21), `sidepanel/sidepanel.js` (~+90 net), `tests/b048-visual-states.test.js` (new, 459 lines, 25 tests), `docs/a11y-audit-B-048.md` (new, 236 lines). Git diff scoped to B-048-tagged changes only.

### CRITICAL
_None._

### HIGH

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| H-1 | `sidepanel/sidepanel.css:1257` | **Hardcoded `stroke='white'` in the checked-state checkmark SVG data URL is below WCAG AA 3:1 in dark theme.** In dark theme `--selected-border` is `#60a5fa`; white (`#ffffff`) on `#60a5fa` yields approximately 2.9:1 — below the WCAG AA 3:1 non-text threshold. The `a11y-audit-B-048.md` audit does not include a row for the checkmark icon stroke itself, so the gap is not documented as accepted. The audit captures the white stroke for light theme where `--selected-border` is `#2563eb` (approximately 4.8:1 — PASS), but the dark-theme case is absent. This is the most visible affordance when a row is selected in dark theme. | CSS custom properties cannot be interpolated directly into `url()` data URIs. The fix is a second `.item-select[aria-checked="true"]` rule block scoped inside the existing dark-theme `prefers-color-scheme: dark` media query (and the forced-dark attribute block) that overrides `background-image` with a freshly-encoded SVG using `stroke='%230a0f1a'` (the `--on-accent` dark value, URL-encoded). Alternatively introduce a `--checkbox-check-color` token with per-theme values and accept a two-rule solution. |

### MEDIUM

| # | File:line | Finding | Fix |
|---|-----------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:1957` | **`_createItemSelect` sets `aria-hidden="false"` which causes double-announcement on tree-traversal screen readers.** The JSDoc at line 1945 states "AT composes the role + state when focus is on the parent row" — accurate for focused-row traversal, but `aria-hidden="false"` is an explicit in-tree signal meaning AT in browse/reading mode also traverses into the child and announces `role="checkbox"` independently of the row label. The row `aria-label` already appends ", selected" via `_buildItemRowAriaLabel`, making the child announcement redundant. The Gmail pattern this implementation references works precisely because the child checkbox is hidden from AT (`aria-hidden="true"`) and the row label carries the state. The test at `tests/b048-visual-states.test.js:240` asserts `aria-hidden === 'false'` and will need updating. | Change `span.setAttribute('aria-hidden', 'false')` to `span.setAttribute('aria-hidden', 'true')` at `sidepanel.js:1957`. Update the test assertion at `b048-visual-states.test.js:240`. No information loss: the row `aria-label` already communicates "selected" state. |
| M-2 | `tests/b048-visual-states.test.js:36–44` | **`_buildItemRowAriaLabel` is reproduced verbatim in the test file, testing its own copy rather than the production function.** The file header acknowledges this but frames it as a contract guard. The causality is reversed: renaming a flag label in production passes the tests because the test copy is independent. This is the same pattern flagged as B-059 M-3. | Extract `_buildItemRowAriaLabel` to `shared/aria-label.js` and import it in both `sidepanel.js` and the test. The function is 4 lines of pure logic with no DOM or Chrome API dependencies. If extraction is deferred, rename the test helper to `_buildItemRowAriaLabelCopy` and add a cross-reference comment with the exact source line it mirrors. |
| M-3 | `sidepanel/sidepanel.js:1975–1976` | **`_buildItemRowAriaLabel` lacks an explicit null-item guard, creating implicit coupling with every call site.** The `(item && item.title) \|\| 'Untitled'` expression handles undefined item, but correctness depends on all four call sites doing their own null-check (which they do today). A future call site that omits the guard silently produces `'Untitled'` with no error. | Add `if (!item) return 'Untitled';` as the first line of `_buildItemRowAriaLabel` so the null-item contract is owned by the function, not delegated to each call site. |
| M-4 | `tests/b048-visual-states.test.js:69–80` | **Test `querySelector` shim is documented as supporting `.class` selectors only, with no error when an unsupported selector type is used.** All current usages are `.class` selectors and the limitation is documented. A future PR adding an attribute or compound selector inside a reproduced function branch would silently return `null` with no test error. | Add a prominent comment at the shim class definition (line 69): `// LIMITATION: only .class selectors supported. Attribute/compound selectors return null silently — extend shim before testing those paths.` Documentation-only; no code change required. |

### LOW

| # | File:line | Finding |
|---|-----------|---------|
| L-1 | `sidepanel/sidepanel.css:1230–1243` | `.item-select` has `flex: 0 0 18px` (flex-basis 18px) but `width: 14px`. The 4px gap provides lateral padding to prevent layout shift (AC6), but is implicit. A future maintainer adjusting the visual width may not realize the flex-basis must also change. Add a comment: `/* flex-basis 18px > visual width 14px: lateral padding keeps AC6 no-reflow guarantee — adjust flex-basis if width changes */`. |
| L-2 | `sidepanel/sidepanel.js:2016` and `:2231` | `_createItemSelect(false)` is always called with `false` at both build sites because `_setRowSelected` owns the checked-state transition. The `selected` parameter is dead at the only two call sites. Consider removing the parameter and hardcoding `aria-checked="false"` internally, with a comment pointing to `_setRowSelected` as the state owner. |
| L-3 | `tests/b048-visual-states.test.js` | A null-item test case is absent. If M-3 above is implemented, add `assert.equal(_buildItemRowAriaLabel(null, undefined, undefined, false), 'Untitled')` to explicitly document and protect the null-item contract boundary. |
| L-4 | `docs/a11y-audit-B-048.md` | The audit table is missing a row for the `.item-select[aria-checked="true"]` checkmark stroke contrast (white on `--selected-border`). The table covers background/text pairs thoroughly but omits this new non-text indicator. Adding the row would surface H-1 as a documented gap rather than an uncaught blind spot, and demonstrate due diligence for the new affordance. |
| L-5 | `sidepanel/sidepanel.css:1207–1209` | The comment above `.item-row[data-selected="true"]` says "CSS allows only one `outline` per element; the focus ring is prioritized." The mechanism is compositional, not competitive: `box-shadow: inset` and `outline` compose on the same element; the inset shadow renders behind the outline. Revise to: `/* swap outline -> box-shadow: inset so the :focus-visible outline (which draws on top of box-shadows) visually overlays the selection border instead of being hidden beneath it */`. |

### Verdict

**1 HIGH, 4 MEDIUM, 5 LOW. H-1 and M-1 must be resolved before R5.** Core architecture is sound: `_buildItemRowAriaLabel` is a pure function called consistently at all 4 sites and handles `undefined` live/drifted state gracefully. `_createItemSelect` is correctly called from both `buildItemRow` and `buildOpenTabRow`. The old `::before` pseudo-element is completely removed with no stray selectors. The outline-to-inset-box-shadow swap stacks correctly with the `:focus-visible` outline. AC7 concat order is correct and validated by the 32-combo test sweep. Icon factories use `aria-hidden="true"` — no double-announcement from that direction. The `_setRowSelected` patch path is trivially within the AC8 budget. H-1 is a WCAG AA compliance failure for the most visible selected-state affordance in dark theme. M-1 contradicts the Gmail accessibility pattern the implementation explicitly cites.

---

## Sprint 16 — B-062 [security-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. Purely visual CSS change. Confirmed against security lens:
1. **No permission changes** — `manifest.json` not touched; zero new permissions.
2. **No new user-input surface** — no interactive handlers, inputs, or form fields added. Focus-visible outline is a passive visual indicator.
3. **No dynamic content** — `--on-accent` token values are hardcoded literals (`#ffffff` light, `#0a0f1a` dark) in all 4 theme blocks; no `attr()`, no `env()`, no user-controlled computation.
4. **No JavaScript changes in scope** — `sidepanel/sidepanel.js` diff is B-063 only (separate item, separately reviewed); B-062 touches CSS exclusively.
5. **Audit file integrity** — `docs/a11y-audit-B-062.md` is documentation; no executable content, no script tags, no embedded iframes.
6. **No new manifest file references** — zero additions to `chrome_url_overrides`, `content_scripts`, `web_accessible_resources`, `default_path`, or `default_popup`.
7. **Pre-seed scope-creep note** — `--selected-bg` / `--selected-border` tokens already exist on `release/v2` (not introduced in this diff); no net change from B-062.
8. **XSS/CSP posture unchanged** — no `innerHTML` paths touched, no CSP relaxation, no new `style=` attributes injected.

Zero attack surface. Ship.

---

## Sprint 16 — B-062 [code-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.css:262` | `.empty-state-cta:hover` still uses hardcoded `color: #ffffff`. This is a primary-button-style hover state on an accent background (`--accent-hover`) — the same class of contrast failure B-062 was created to fix. In dark theme `#ffffff` on `#93bbfd` is 1.78:1, a WCAG AA fail. Out of scope for this item's ACs, but the `--on-accent` token introduced here is precisely the fix. | Replace `color: #ffffff` with `color: var(--on-accent)` on `.empty-state-cta:hover`. Raise as a follow-on AC or fold into a B-062 patch before close. |
| M-2 | `sidepanel/sidepanel.css:1332,1339` | `.window-filter-chip[aria-selected="true"]` and its `:hover` variant both hardcode `color: #ffffff` on `var(--accent)` / `var(--accent-hover)` backgrounds. Same dark-theme contrast failure pattern (2.41:1 default, 1.78:1 hover). The B-062 audit §2 grep is scoped to `.dialog-btn` selectors only — these chip call-sites were not in scope for AC9, but they are now visibly inconsistent with the newly-tokenised button rules and carry the same AA failure in dark mode. | Replace both with `color: var(--on-accent)`. Raise as B-062 follow-on or queue as a standalone XS item. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `docs/a11y-audit-B-062.md:27` | The grep source path is hardcoded to an absolute machine-local path (`/Users/courtney.d.wenman/workspaces/fun/junkie/...`). The audit is a committed doc that other contributors will read. | Replace with a repo-relative path. Low priority — no functional impact. |
| L-2 | `sidepanel/sidepanel.css` (scope-creep) | `--selected-bg` and `--selected-border` pre-seeded in all 4 theme blocks and consumed by `.item-row[data-selected="true"]`. These are planned for B-048 R2 §31.7. Values are visually identity-preserving and the token contract is additive, so no regression. However the change is undocumented in this item's audit and `SPRINT.md` files-changed list. B-048 R3 will inherit these values without knowing they originated in B-062. | Accept the scope-creep (see Verdict). Add a one-line note to `docs/a11y-audit-B-062.md` §8 and `SPRINT.md` handoff notes: "Pre-seeded `--selected-bg`/`--selected-border` for B-048; values are identity-preserving stubs." |

### Verdict

**PASS WITH MEDIUM NOTES** — 0 CRITICAL, 0 HIGH, 2 MEDIUM (out-of-scope hardcoded-color AA failures surfaced by the audit; not regressions introduced by this item), 2 LOW. The core B-062 fix is correct and complete: `--on-accent` token is defined in all 4 theme blocks, both primary-button selectors are tokenised, light-theme visual identity is preserved, focus-ring contrast passes 3:1 non-text AA (audit §6), call-site coverage confirmed for the three dialog surfaces (AC9), and the test suite is unaffected (CSS-only change, 617/617). The two MEDIUM findings are pre-existing dark-theme contrast failures on `.empty-state-cta:hover` and `.window-filter-chip[aria-selected]` that the audit's scoped grep did not surface — they should be raised as a follow-on item or patched before sprint close. Scope-creep (`--selected-bg`/`--selected-border` pre-seed): **accept** — the token values are additive and identity-preserving, B-048 R3 retains full authority to refine them, and reverting would produce noise with no safety benefit. Document the pre-seed in handoff notes.

---

## Sprint 16 — B-029 [security-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:712` | **CSS-class construction from data without explicit allowlist at the render boundary.** `chip.classList.add('group-color-' + row.color)` concatenates `row.color` into a class name. Today this is safe because `background/storage/groups.js:39` enforces `GROUP_COLORS.includes(color)` on every create/update, so only 9 fixed slugs can ever reach storage. However the picker render path has no defensive check of its own — if a future SW regression, a pre-validation schema migration, or a direct `chrome.storage` write ever seeds an unsanitized color value, the picker becomes a CSS-class-injection vector (e.g. `"blue; } body { display:none"` — benign under CSP but would cover arbitrary selector tokens). Defense-in-depth: the render surface should not trust storage validation alone. | Gate the concat with an inline allowlist check, e.g. `if (GROUP_COLORS.includes(row.color)) chip.classList.add('group-color-' + row.color);`. Same treatment for the sibling call at `sidepanel.js:1687` (pre-existing, out of scope for B-029 but worth a follow-on LOW). |
| M-2 | `sidepanel/sidepanel.js:704` | **Counts are interpolated via string concat** (`row.savedCount + ' saved, ' + row.openCount + ' open'`) into `textContent`. `textContent` is safe against HTML injection, but `savedCount` / `openCount` originate from `_cachedItems.length` math and `_cachedLiveStates[id].live` boolean coercion — both sourced from storage/SW broadcasts. If a malformed storage payload ever caused `savedByGroup.get(key)` to return a non-number (e.g. `"[object Object]"`), the row would render confusing UI instead of a count. Not an XSS vector; is a robustness gap. | Coerce to integers at the render boundary: `Number(row.savedCount) || 0`. Or assert shape in `_buildGroupPickerRows`. |
| M-3 | `sidepanel/sidepanel.js:241` (handler at L586, via broadcast path) | **`_clearSelection()` now calls `closeGroupPickerDialog()` unconditionally.** The picker is a dialog (not a context menu) and was meant to survive selection changes. A `MSG_STATE_CHANGED` broadcast that triggers `_clearSelection()` (e.g. concurrent item delete from another surface) will now silently dismiss an open picker mid-interaction, discarding the user's typed filter query and their onSelect intent. Not a security issue per the scoped lens, but it IS a message-passing robustness concern: the callback `_groupPickerOnSelect` is zeroed before the user can confirm, and the trigger element focus is restored to a stale row. | Scope `closeGroupPickerDialog()` in `_clearSelection()` to the legacy bulk-move-picker case only (i.e. close only if the picker was opened for a selection-scoped flow; keep it open for B-027 "Move items out of group" which operates on a fixed groupItems snapshot). At minimum, document the trade-off in a code comment so future callers don't assume picker survives broadcasts. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:579` (header comment) | **The `openGroupPickerDialog` JSDoc contract does not declare the trust boundary** — callers are free to pass any `triggerEl` / `sourceGroupId` without validation. A future caller misuse (e.g. passing a detached DOM node as `triggerEl`) will `focus()` into nothing on close; silent UX failure, not a security bug. | Add a one-line `@contract` note: "All inputs are assumed trusted (sidepanel-internal). Picker does not re-validate." |
| L-2 | `sidepanel/sidepanel.js:239` (`try { callback(groupId); } catch {}`) | **Silent swallow of onSelect errors.** The caller (B-027 Move-out, B-024 bulk move, B-028 selection menu, B-059 Open-Tabs save) handles its own error surfacing, but a bug inside those callbacks that throws synchronously (not via a rejected Promise) is lost without any telemetry. Low severity — no user-data leak, no state corruption — but an unnoticed bug here could hide data-loss regressions. | Minimal: `catch (err) { console.warn('[tab-junkie] group-picker onSelect threw:', err?.message); }`. Do NOT log `err` directly (may contain item names/URLs — PII per §Privacy). |
| L-3 | `sidepanel/sidepanel.js:796` (`row.hidden = !match`) | **Client-side filter does not strip combining/invisible Unicode** before `includes()` comparison. Group names are user-provided; a group named with zero-width joiners or RTL override marks will match unexpectedly (or fail to match the user's visually-identical query). Not exploitable — just a usability edge case. | Accept as-is (v1 scope). Document in a comment or defer to a future normalization helper. |
| L-4 | `sidepanel/sidepanel.js:853` (dialog keydown listener, `capture: true`) | **Capture-phase listener on `groupPickerDialogEl`.** This correctly intercepts Escape before the global handler runs, but capture-phase listeners are invisible in devtools "event listeners" panel in older Chromium versions — a future maintainer could add a conflicting `keydown` listener on the dialog without realizing the capture listener pre-empts it. | Add a code comment at the attachment site: "capture: true intentional — picker owns Escape / Tab / Arrow routing; see AC4". |
| L-5 | `sidepanel/sidepanel.html:168` (dialog markup) | **The picker markup uses `aria-labelledby="group-picker-heading"`** but the heading text is overwritten on every `openGroupPickerDialog` call (L838). Screen readers that cache the accessible name at dialog-open time will read the correct label; those that re-query on focus will also be fine. No security concern — accessibility hardening only. | No action; flagged for completeness. |

### Verdict

**PASS** — 0 CRITICAL, 0 HIGH, 3 MEDIUM, 5 LOW. The security-critical surfaces are clean: (1) all user-provided strings (`row.name`, `row.breadcrumb`, empty-state message) reach the DOM exclusively via `textContent` (L718, L722, and the hardcoded HTML string `<p>No groups yet &mdash; create a group first.</p>` which contains no interpolation); (2) the filter input is used only for `String.prototype.includes` (sidepanel.js:788) and is never echoed to HTML; (3) the CSS-class construction at L712 is currently sound because `GROUP_COLORS` validates at storage write time (`background/storage/groups.js:39`) — M-1 flags this as defense-in-depth; (4) `MSG_BULK_UPDATE_ITEMS` payload from the new B-027 Move-out path is properly shaped (`ids: groupItems.map(it => it.id)` — array of storage-validated strings; `patch: { groupId: targetGroupId }` where `targetGroupId` originates from `rowEl.dataset.groupId`, coerced to `null` for the empty-string sentinel); (5) no `manifest.json` changes (`git diff --name-only` confirms); (6) no new `console.*` log statements added by B-029 — the existing `console.warn` calls at L2244/L2297/L2989/L3016/L3037 are pre-existing B-011/B-015 paths untouched by this diff; (7) focus-trap, overlay-click, and Escape handling are consistent with the existing `openConfirmDialog` / `openBookmarkEditDialog` pattern and do not expose new cross-origin focus vectors (browser-level guarantee applies unchanged); (8) no new message types introduced — existing `MSG_UPDATE_ITEM` / `MSG_BULK_UPDATE_ITEMS` / `MSG_PROMOTE_TAB` contracts unchanged. No blockers for R5. Recommend addressing M-1 (allowlist defense) and M-3 (broadcast-dismiss semantics) before sprint close; M-2 and all LOWs can defer.

---

## Sprint 16 — B-029 [code-reviewer]

### CRITICAL
_None._

### HIGH
_None._

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| M-1 | `sidepanel/sidepanel.js:842–850` | `_onGroupPickerKeydown` Tab handler has a **dead-branch bug**: both `active === groupPickerFilterEl && !e.shiftKey` and `active === groupPickerFilterEl && e.shiftKey` focus `groupPickerListEl`. Shift+Tab from the filter should cycle backward, but instead sends focus to the listbox in both directions. The trap is functionally a 1-stop loop, not a 2-stop cycle as documented in the comment. Shift+Tab from the filter cannot reach the Create-group button in the empty state, stranding keyboard users when the empty state is visible. | `if (active === groupPickerFilterEl && e.shiftKey)` branch should call `groupPickerListEl.focus()` only if there is no focusable button below (e.g. `groupPickerCreateBtnEl`), or restructure to explicitly distinguish forward/backward Tab so the empty-state create-btn is reachable. |
| M-2 | `sidepanel/sidepanel.html:175` + `sidepanel/sidepanel.js:760–766` | The `role="listbox"` container has no `aria-activedescendant` attribute. The ARIA 1.2 listbox pattern requires the container to advertise the active option via `aria-activedescendant` when it does not use a roving `tabindex` strategy. Here the container holds `tabindex="-1"` with options also at `tabindex="-1"`, but the active item is communicated only by class and `aria-selected` on the child — with no `id` on the child and no `aria-activedescendant` on the container. Screen readers will not announce highlight changes when keyboard-navigating the list. | Assign an `id` to each rendered `group-picker-row` (e.g. `group-picker-row-${idx}`), then call `groupPickerListEl.setAttribute('aria-activedescendant', active.id)` inside `_setGroupPickerHighlight`, and clear it to `''` in `_resetGroupPicker`. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| L-1 | `sidepanel/sidepanel.js:957–963` | AC9 Create-group CTA closes the picker and shows a toast (`'Create a group from the + menu, then try again'`) because `openGroupCreateDialog` does not yet exist. The toast is an adequate MVP fallback given the dependency is out of scope per B-029's out-of-scope block. Severity is LOW (not MEDIUM) because no user data is lost, the picker closes cleanly, and the message is actionable. Track as a follow-on: when B-006 create-mode is wired, replace the toast branch with `openGroupEditDialog({ mode: 'create' })`. | Accept for now. Document the stub in `SPRINT.md` handoff notes and add a comment cross-referencing the B-006 backlog item so the next engineer finds it. |
| L-2 | `sidepanel/sidepanel.js:163–169` | `groupPickerColor` chip uses `.group-color-${row.color}` palette classes instead of `style.backgroundColor` per §30.5. This is intentionally cleaner (avoids inline style, reuses the established palette) but diverges from the R2 spec. The deviation is visually equivalent and lower maintenance. Accept, but [solution-architect] should ratify in R6 so the spec stays authoritative. | Record deviation in `docs/SOLUTION_DESIGN.md` §30.5 note during R6 close. No code change needed. |
| L-3 | `sidepanel/sidepanel.js:239` | `_confirmGroupPickerRow` swallows the callback error silently (`try { callback(groupId); } catch { }`). This can hide real bugs during development: if `_bulkMoveToGroup` throws synchronously (unlikely but possible), the error disappears without a toast. The catch is there to prevent an unhandled rejection, but there is no fallback user feedback path. | Add a minimal `showToast('Couldn\u2019t complete the move \u2014 try again')` in the catch body, or at minimum `console.error` in debug builds. |

### Verdict

**PASS WITH MEDIUM NOTES** — 0 CRITICAL, 0 HIGH, 2 MEDIUM, 3 LOW. The group picker primitive is well-encapsulated: 4 call-sites share a single open/close path, dead code (`_closeBulkMovePicker`, native `<select>` blocks) is cleanly removed with zero orphan references, `shared/` is untouched, `textContent` is used consistently for all user-supplied strings, the AC7 close-before-callback sequence is correct, and the F-1/F-3 guards (blur-close immunity, Escape stopPropagation with capture) are implemented correctly. The two MEDIUM findings are: a Tab focus-trap dead branch that makes Shift+Tab non-functional from the filter input, and a missing `aria-activedescendant` wiring that breaks screen reader list navigation. Both must be fixed before R5.

---

## Sprint 16 — B-029 [qa-reviewer]

### CRITICAL
_None_

### HIGH

| # | File | Finding | Fix |
|---|------|---------|-----|
| H-1 | `sidepanel/sidepanel.js:956-967` (AC9 CTA) | **Broken flow — AC9 regression.** AC9 PASS criterion: clicking "Create group" closes the picker AND opens the B-006 create dialog. Current impl closes the picker and shows `showToast('Create a group from the + menu, try again')`. There is NO "+ menu" on the sidepanel header. A fresh-profile user clicks the CTA, sees a cryptic toast referencing a nonexistent surface, and is stranded. FE flagged this but classified it as adequate — it is materially different from AC9 PASS. [code-reviewer] L-1 softens it to LOW as an "MVP fallback"; disagree on severity — user-facing copy refers to a surface that does not exist, which is a shipped-bug in a core first-run flow. | Wire to `openGroupEditDialog` in create mode (B-006 already ships the dialog for edit; create-mode uses the same dialog without a preload). If dispatch is truly blocked, fix the toast copy to reference the real surface (e.g., "Right-click any existing group header and choose Edit, or create from the groups list"). Ship H-1 before R5. |
| H-2 | `sidepanel/sidepanel.js:2982-3039` (broadcast handler) vs picker lifecycle | **Stale-target race.** On `MSG_STATE_CHANGED` `scope: 'groups'` broadcast while picker is open (another window deletes/renames the highlighted group), `renderAll` overwrites `_cachedGroups` but the picker's rendered rows are NOT re-built and no guard prevents confirming a deleted row. `_confirmGroupPickerRow` dispatches `MSG_BULK_UPDATE_ITEMS` against a ghost target; the generic catch surfaces "Couldn't move bookmarks — try again" which hides the real cause. | On `scope === 'groups'` broadcast while picker is open, rebuild rows from fresh `_cachedGroups` (preserve filter text and highlighted group-id if still present) — stays zero-IPC per AC10. Alternative: pre-dispatch existence check in `_confirmGroupPickerRow` with targeted toast "That group was just deleted — pick another." |
| H-3 | `sidepanel/sidepanel.js:3303-3309` (`_bulkMoveToGroup` itemIds branch) + `:3516-3521` (B-027 Move-out) | **Safe-mode error hidden on move.** tabIds branch (L3264) translates `ERR_SAFE_MODE` → `'Cannot save while in safe mode'`. itemIds branch catches all errors into generic `'Couldn't move bookmarks — try again'`. Same flaw at the B-027 Move-out callback. Users in safe mode see misleading toast for callers 1/2/3 itemIds path. | Extract `_translateMoveError(err)` helper; inspect `err?.code === ERR_SAFE_MODE` and surface the correct toast at all three itemIds sites. |

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-M1 | `sidepanel/sidepanel.js:945-954` (list printable-key forward) | **Keystroke lost on first type.** AC4: "Typing while the list is focused forwards the keystroke to the search input". Impl focuses the input but does NOT inject the key — the first keystroke is dropped; user must re-press. | Append `e.key` to `groupPickerFilterEl.value` and dispatch `input` event to re-run `_applyGroupPickerFilter`. |
| Q-M2 | `sidepanel/sidepanel.js:904-911` (outside-click) | **No automated coverage for overlay click.** `tests/b029-group-picker.test.js` covers Arrow/Enter/Escape but not outside-click. Future refactor of the overlay DOM could silently trap users. | Add test: dispatch `click` on `dialogOverlayEl` with `ev.target === dialogOverlayEl`; assert picker closes and `onSelect` not called. |
| Q-M3 | `sidepanel/sidepanel.css:820-823` (`.group-picker-row--highlighted`) | **Highlight visibility ambiguous.** Pseudo-focus uses `--accent-subtle` background + `--focus-ring` 2px border. Hover uses `--bg-hover`; hovered+highlighted combos may be indistinguishable in light theme. AA contrast on the 2px border against `--accent-subtle` not quantified — may drop below 3:1 depending on resolved tokens. | Measure contrast in both themes. If ≥ 3:1, accept; else bump border to 3px or swap to `outline: 2px solid` over `--bg-primary`. [test-engineer] AA spot-check in UAT. |
| Q-M4 | `sidepanel/sidepanel.js:860-872` (open-guard invariant) | **`_dialogTriggerEl` clobber risk.** L867 guard (`if (!dialogOverlayEl.hidden) return;`) is the sole protection against the picker overwriting another dialog's trigger. Not currently reachable via any call path but fragile to future refactors. | Add `/* INVARIANT: picker can never open over another dialog — preserves _dialogTriggerEl */` comment at L867. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-L1 | `sidepanel/sidepanel.js:728-730` (counts template) | Rows render "0 saved, 0 open" for freshly-created empty groups — noisy in the common first-group case. | Hide counts span when both are zero, or render `"(empty)"`. |
| Q-L2 | `sidepanel/sidepanel.html:170` | Default heading HTML is "Move to group"; always overwritten at open time. Harmless but a test inspecting pre-open DOM could assert wrong text. | None; flagged for completeness. |
| Q-L3 | `tests/b029-group-picker.test.js` | Picker core logic is reproduced in-test rather than imported. Future refactor of `_buildGroupPickerRows` in `sidepanel.js` will not fail these tests (false-green risk). Matches b027 pattern. | Accept for Sprint 16; file tech-debt to extract core into `shared/group-picker-core.js`. |
| Q-L4 | `sidepanel/sidepanel.js:596-598` (header-comment) | Comment claims picker is "pure view over cached state — no IPC". True for the picker itself, but the sidepanel's broadcast handler still fires IPC in response to unrelated `scope: 'liveState' / 'items' / 'groups'` broadcasts during an open picker. AC10 still passes (picker itself issues none), but comment could mislead future readers. | Tighten wording: "picker itself issues no IPC on open or filter". |
| Q-L5 | `sidepanel/sidepanel.css:811-813` (row border) | `border: 2px solid transparent` placeholder keeps layout stable under highlight — good pattern. | None; noted. |

### UAT scenarios

14 proposed cases for [test-engineer] R5:

1. **U-1 Bulk bar — items only (AC1 caller 1)** — Select 3 saved items across 2 groups → bulk "Move to group" → pick target → items moved, selection cleared.
2. **U-2 Bulk bar — tabs only, save mode (AC1 + AC7)** — Multi-select 2 open tabs → bulk "Save to group" → pick target → verify B-059 soft-warn appears AFTER picker closes (no overlap), both tabs promoted on confirm.
3. **U-3 Group header — Move items out of group (AC1 caller 2 + AC5)** — Right-click group with 5 items → "Move items out of group" → heading "Move to group", source group absent → pick target → 5 items moved.
4. **U-4 Group header — disabled on empty group (AC1(b))** — Right-click zero-item group → action disabled/greyed.
5. **U-5 Selection menu — Move to group (AC1 caller 3)** — Multi-select 2 items, right-click → "Move to group" → no inline `<select>`, picker opens, target move succeeds.
6. **U-6 Open Tabs — Save with duplicate (AC1 caller 4 + AC7)** — Right-click open tab whose URL is already saved → "Save to group" → pick target → picker closes FIRST, then B-059 soft-warn; "Save anyway" creates duplicate, Cancel leaves no duplicate.
7. **U-7 Empty-profile CTA (AC9 — H-1 check)** — Fresh profile, no groups → trigger picker → click "Create group" → expect B-006 create dialog. Current impl shows toast referencing "+ menu" — records as FAIL until H-1 fixed.
8. **U-8 Keyboard-only walkthrough (AC4 + AC8)** — Enter on bulk button → focus on filter → ArrowDown advances (wraps) → Enter confirms → Escape cancels. Verify Shift+Tab direction (code-reviewer M-1 check) and printable-key doesn't drop first keystroke (Q-M1 check).
9. **U-9 100-group latency (AC3 + AC10)** — Seed 100 groups → Perf trace filter latency P95 < 50ms; verify zero IPC and zero storage writes during open+filter.
10. **U-10 Broadcast-during-open (H-2 check)** — Open picker in window A, delete highlighted target from window B → picker refreshes OR rejects with targeted toast.
11. **U-11 Safe-mode move items (H-3 check)** — Enable safe mode → bulk move items via picker → "Cannot save while in safe mode" toast (not generic).
12. **U-12 Blur-close isolation (F-1)** — Open picker → Alt-Tab away and back → picker still open; context menu blur-close still works.
13. **U-13 Source-group exclusion (AC5)** — B-027 menu on "Work" → "Work" absent; bulk bar → "Work" present.
14. **U-14 ARIA / a11y audit (AC8 + code-reviewer M-2 activedescendant)** — axe-core or NVDA/VoiceOver: `role="dialog"` + `aria-modal` + `aria-labelledby` + listbox/option + exactly one `aria-selected="true"` + focus-ring ≥ 3:1 + screen-reader announces highlight changes on ArrowDown.

### Verdict

**CONDITIONAL PASS — block on H-1, H-2, H-3.** 0 CRITICAL, 3 HIGH, 4 MEDIUM (qa-specific, non-overlapping with code/security reviewer MEDIUMs), 5 LOW. Architecture is solid: modal primitive cleanly separated from 4 callers; B-059 handoff sequence correct and invariant-tested; ARIA listbox structure matches AC8; AC5 source-exclusion works; O(n) filter with pre-lowered search keys meets AC3; B-027 new action correctly bypasses `_bulkMoveToGroup` to avoid selection side effects; B-063 blur-close properly scoped to context menu only (F-1 verified). Blockers: **(H-1)** AC9 CTA advertises a non-existent "+ menu" — ships a broken first-run flow. **(H-2)** Broadcast races dispatch bulk-move to deleted group-ids; generic catch masks the failure. **(H-3)** Safe-mode toast inconsistency between tab-save and item-move paths. All three are user-facing regressions against explicit ACs or known error handling patterns. MEDIUMs (keystroke injection Q-M1, outside-click coverage Q-M2, highlight contrast Q-M3, invariant comment Q-M4) should be addressed before R5 UAT; LOWs can defer. With H-1/H-2/H-3 fixed, B-029 passes into R5.

---

## Sprint 16 — B-048 [qa-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-M1 | `sidepanel/sidepanel.js:2082` (buildItemRow indicators branch) | **AC2 coexistence gap on non-live saved item that is drifted**: `_ensureIndicators` / first-paint branch only appends `.item-indicators` when `needsAudible || needsDrifted || needsWindowBadge` is true. Verified this path; OK. However a drifted+audible row where `live?.live=false` (drift persists after tab close) still paints correctly only because drift itself qualifies. No bug — but add a test for `drifted && !live` at first paint to lock AC2 against future regressions. | Add one additional test case to `b048-visual-states.test.js` covering `buildItemRow` with no live + drift truthy (currently the AC1 drifted test uses `live: true`; no test exercises drift-without-live at the buildItemRow level). |
| Q-M2 | `sidepanel/sidepanel.js:1475-1491` (`_setRowSelected`) | **Saved-item branch reads `_itemById`, patch-path (L.2588) reads `itemMap`** — two sources of truth for the same label rebuild. If `_itemById` is stale at the exact moment a user toggles selection immediately after a rename broadcast has not yet fired `_setItemByIdCache`, the label will reflect the old title for one frame. Not CRITICAL (self-heals on next MSG), but inconsistent with the "fresh wins" pattern used in the patch path. | Either (a) pass `item` into `_setRowSelected` callers (explicit freshness), or (b) document the staleness-window in `_setRowSelected`'s header comment and add a note that the label will re-settle on the next broadcast. |
| Q-M3 | `sidepanel/sidepanel.css:1248-1252` | **AC5 focus-visible on `.item-select` child**: the child carries `tabindex="-1"` (correct — non-tab-stop), but no CSS rule paints a focus ring on `.item-select:focus-visible` in case a future code path programmatically focuses the child (e.g. `_setActivedescendant`). Today no such call exists; if one is added the child will gain OS default focus (browser-specific, likely low-contrast) rather than the `--focus-ring` token. | Add `.item-select:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }` defensively, OR add a comment in `_createItemSelect` explicitly forbidding `.focus()` calls on this element. |
| Q-M4 | `sidepanel/sidepanel.js:2016, 2231` | **Open Tabs + saved-item rows both prepend `.item-select` as first flex child** — symmetry verified. However `buildOpenTabRow` does NOT call `_setRowSelected` on its initial render (the `isSelected` branch in `patchOpenTabsSection` at L.2402-2404 applies selection AFTER DOM insertion). If a concurrent keyboard gesture selects a tab row between `buildOpenTabRow` and `_setRowSelected`, the `aria-checked="false"` initial state is briefly seen by AT. Race window is sub-frame; low user impact. | Consider passing `isSelected = _selection.has('tab:' + tab.tabId)` into `buildOpenTabRow` so `_createItemSelect(isSelected)` starts checked when the selection is already known. Mirrors how `buildItemRow` would need the same if rebuilds are ever triggered on pre-selected items. |

### LOW

| # | File | Finding | Fix |
|---|------|---------|-----|
| Q-L1 | `docs/a11y-audit-B-048.md:146-154` | **Pre-existing `.item-url` contrast failure on non-selected rows** is deferred to a follow-up item. Scope discipline is CORRECT (AC10(d) — palette-global concern, not one of the five states), but the audit doc should cite a BACKLOG id (e.g. "B-064: promote `.item-url` to `--text-secondary` globally") so the deferral has a tracking anchor. | Add the backlog id to §5 note 1 after [product-manager] files the item, or add a one-line TODO pointer that [scrum-master] can resolve during sprint close. |
| Q-L2 | `tests/b048-visual-states.test.js:153-196` | **AC1 tests reproduce the factory logic in-test** (same pattern as B-027, B-029). Low false-green risk because the real helpers are tiny and the concat order is sweep-tested. Tech-debt to extract `_buildItemRowAriaLabel` to `shared/aria-labels.js` for direct import (mirrors the B-029 Q-L3 suggestion). | Defer to a shared-helpers sweep — `_buildItemRowAriaLabel`, `_buildGroupPickerRows`, etc. all deserve extraction. |
| Q-L3 | `sidepanel/sidepanel.css:1238-1243` | **`.item-select` uses `visibility: hidden`** to reserve layout slot (correct for AC6 — prevents reflow). `visibility: hidden` leaves the element in the AT tree because of `aria-hidden="false"`. Two AT implementations (NVDA + VoiceOver) handle `visibility: hidden` differently — some announce the checkbox role even when visually invisible. Since the row-level aria-label already carries "selected" status, a double-announce is possible. | VoiceOver + NVDA spot-check during UAT (U-9 below). If double-announce occurs, consider `aria-hidden="true"` when `visibility: hidden` (and flip to `aria-hidden="false"` on `:hover` / `:focus-visible` / `[data-selected="true"]`). |
| Q-L4 | `sidepanel/sidepanel.css:1215-1217` | **`.item-row[data-selected="true"]:hover` explicitly pins the background to `--selected-bg`** — visually correct (selected wins over hover), but means hover feedback is entirely absent on already-selected rows. Users accustomed to the `:hover` affordance may briefly think the row stopped responding to pointer events. Low concern; the box-shadow border persists for visual anchor. | Consider a subtle secondary cue on `[data-selected="true"]:hover` (e.g. `box-shadow: inset 0 0 0 2px var(--selected-border)` — thicker border) if UAT surfaces any hover-feedback complaints. |
| Q-L5 | `docs/a11y-audit-B-048.md:169` | **Selection border is 1px box-shadow, focus ring is 2px outline** — documented as 1px clear-air separation between them. On 2x HiDPI displays this reduces to effectively 0.5 CSS px of clear air; on low-DPI external monitors the separation is 1 device pixel. Marginal visual distinction in rare environments. | Accept; flag for a follow-up if users report the focus ring "merging" with the selection border on low-DPI displays. |

### UAT scenarios

10 proposed cases for [test-engineer] R5. Each must run in BOTH light and dark themes unless otherwise noted.

1. **U-1 All five states alone (AC1)** — Trigger each state in isolation and visually confirm a non-color cue: (a) live-only row has a green left rail, (b) active row has a blue left rail + active background, (c) drifted row shows the triangle icon, (d) audible row shows the speaker icon, (e) selected row persistently shows the filled checkbox + box-shadow border. Disable theme color in macOS System Settings → Accessibility → Display → "Transparency / Increase contrast" to simulate color-blind / monochrome user perception.
2. **U-2 All five states together on one row (AC2)** — Select a saved item whose tab is currently active AND audibly playing AND has drifted from its saved URL, then Cmd-click to multi-select it. Verify: left rail is blue (active), checkbox is filled (selected), triangle + speaker icons coexist in the indicators column without overlapping the checkbox, title+URL remain readable, `aria-label` reads `"<title>, active tab, live tab, tab content has changed, playing audio, selected"` (AC7).
3. **U-3 AC4 hover distinction — active row** — Hover an active-but-unselected row in both themes. Confirm background shifts from `--active-bg` to `--active-bg-hover`. Take a DevTools screenshot; verify the two shades are visually distinguishable (not a "no-op hover").
4. **U-4 AC5 focus-ring over selection border** — Tab to an already-selected row. Focus ring MUST paint on top of the 1px box-shadow border (both visible, both blue, 1px clear air between). Repeat on light + dark. Verify NOT clipped (common regression: old `outline: 1px` would have stacked at the same z-level).
5. **U-5 AC6 hover-reveal timing** — Hover any unselected row and verify the empty-checkbox outline appears immediately (no reflow — surrounding content must not shift horizontally). Move pointer off; checkbox disappears. Tab via keyboard onto the row; checkbox appears via `:focus-visible`. Select (Cmd-click); checkbox becomes persistent.
6. **U-6 AC7 VoiceOver sweep** — macOS VoiceOver, navigate via VO+Right Arrow through 5 rows in these states: (a) saved-only, (b) live, (c) active+live, (d) drifted+audible, (e) all-five. For each row VO MUST announce the title followed by the flags in order: `active → live → drifted → audible → selected`. Icons MUST NOT be double-announced (they are `aria-hidden="true"`).
7. **U-7 AC7 NVDA sweep (Windows)** — Same as U-6 using NVDA on Windows. Confirms WAI-ARIA announcement parity across the two dominant screen readers.
8. **U-8 AC8 / AC9 patch-latency + zero full re-render** — With DevTools Performance recording, toggle a tab's audible state 10 times in a 1000-item profile. Verify: (a) each toggle triggers a `refetchAndPatchLiveState` call only, not `renderAll`, (b) DOM node count remains stable across toggles (spot-check `document.querySelectorAll('.item-row').length` before/after), (c) each patch completes in <500ms (Performance timeline).
9. **U-9 Double-announce screen-reader check (Q-L3)** — With NVDA or VoiceOver running, focus a hovered unselected row. Listen for any duplicate "checkbox unchecked" announcement after the row's own aria-label. If duplicated, log as a follow-up MEDIUM (AC7 deduplication is partial — the icon path is deduplicated, the checkbox path may not be).
10. **U-10 AC3 contrast spot-check (light theme)** — Open DevTools → Inspect → Accessibility pane → Contrast. Measure in-browser for three cells the audit called borderline: (a) `.item-url` on `--active-bg-hover` light (`#8a8f9a` on `#e2e8fd` — audit says 3.04:1), (b) live rail on `--bg-hover` light (audit says 2.92:1), (c) drifted icon on `--selected-bg` light (audit says 3.07:1). Record measured-vs-audit-predicted ratios; any >0.10 delta flags a palette-render mismatch that warrants a calibration follow-up.

**SKIP conditions**: U-7 (NVDA) is SKIP if no Windows test environment is available this sprint — document as SKIP in the UAT report, not FAIL. All other cases are expected PASS; any FAIL blocks B-048 from done and routes back to [frontend-engineer].

### Verdict

**PASS — READY FOR R5.** 0 CRITICAL, 0 HIGH, 4 MEDIUM, 5 LOW. All 10 ACs are testable and covered either by the 25 automated cases or the 10 UAT cases above. AC1 (grayscale) — every state has a dataset attribute + visual affordance (rail, icon, checkbox, background). AC2 (coexistence) — single test locks all five flags on one row; layout-slot reservation via `flex: 0 0 18px` prevents reflow. AC3 (contrast) — audit doc §4–§7 shows every in-scope state × theme × sub-state cell ≥ threshold; the `.item-url`-on-selected promotion to `--text-secondary` was correctly pulled in-scope (§31.3 note 3). AC4 (hover distinct on active) — new `--active-bg-hover` token verified 6.85:1 non-text contrast on the `--active-border` rail and 14.70:1 title text. AC5 (focus-visible on every state) — box-shadow-for-selection swap lets the 2px focus outline paint on top cleanly; no clipping. AC6 (hover-reveal + persistent-when-selected) — CSS selector triad `:hover, :focus-visible, [data-selected="true"]` verified; layout slot always reserved. AC7 (SR concat order) — 32-mask exhaustive test locks `active → live → drifted → audible → selected`, all lowercase, all comma-space delimited; icons `aria-hidden="true"` prevents double-announce (for the icon path — Q-L3 flags checkbox-path verification during UAT). AC8 (≤500ms patch) — `refetchAndPatchLiveState` rebuilds `aria-label` via targeted attribute set, not full re-render; verify timing during U-8. AC9 (zero full re-render) — grep confirms no `renderAll` call added to the live-patch path. AC10 (out-of-scope) — no new state introduced, no storage change, no message-contract change, no focus-management change, no `--accent` token changes. B-024 regression risk — `::before` removal: grep confirms zero B-024 tests reference `::before`, `item-select`, or `aria-checked` on rows, so the DOM migration cannot false-green any B-024 assertion. B-055 regression risk — open-tab rows use identical `.item-select` + `_buildItemRowAriaLabel` wiring; symmetry verified at L.2231/2263/2482. Pre-existing `.item-url` contrast failure deferral is correct scope discipline (palette-wide, not state-specific — cleanly separable into a future item). MEDIUMs are polish issues that do not block; LOWs are future-monitoring flags. [test-engineer] may proceed to R5 once [frontend-engineer] optionally addresses Q-M1/Q-M2/Q-M3/Q-M4.

---

## Sprint 16 — B-048 [security-reviewer]

### CRITICAL
_None_

### HIGH
_None_

### MEDIUM
_None_

### LOW
_None_

### Verdict

**PASS — clean.** 0 CRITICAL, 0 HIGH, 0 MEDIUM, 0 LOW. Attack surface is exceptionally thin — CSS tweaks plus a purely structural DOM affordance. **(1)** `_buildItemRowAriaLabel` (`sidepanel.js:1975`) concatenates only static state literals (`'active tab'`, `'live tab'`, `'tab content has changed'`, `'playing audio'`, `'selected'`) plus `item.title`; the result is applied via `row.setAttribute('aria-label', ...)` at lines 1481, 1489, 2110, 2263, 2482, 2593 — attribute sink, never parsed as HTML — so even a bookmark title containing HTML markup cannot escape into a script context. **(2)** `_createItemSelect` (`sidepanel.js:1951`) uses `document.createElement` + `setAttribute` + static `className`; no user-controlled string reaches `className`, attributes, or `innerHTML`. The 5 pre-existing `innerHTML` sites in `sidepanel.js` (lines 1827, 1839, 1919, 1930, 2095, 2101) are all static SVG literals with zero interpolation — unchanged by this sprint and re-verified clean. **(3)** `aria-checked` values are derived exclusively from the `selected` boolean parameter (`selected ? 'true' : 'false'`) and the `_selection.has(...)` return — cannot be forced into a non-boolean state. **(4)** No new `console.*` calls introduced; no bookmark titles or URLs logged. **(5)** `manifest.json` untouched (`git diff` empty) — zero permission delta. **(6)** `tests/b048-visual-states.test.js` grep for `eval`/`new Function`/`console.*` returns no matches — shim-based per standard. No defense-in-depth gaps worth a LOW. Ship it.

---

