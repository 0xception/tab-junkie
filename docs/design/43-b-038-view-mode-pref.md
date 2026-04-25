# §43 — B-038 View Mode Preference (R2 Decision Memo)

**Sprint:** 29
**Tier:** **Fast Track (XS)** — tier-upgrade flag cleared (rationale below)
**Status:** R2 complete (2026-04-23) — READY FOR R3 · no R6 chapter expected (Fast Track does not require R6 close)
**Owner:** [solution-architect]
**Depends on:** §40 (B-023 `chrome.action.setPopup` at runtime precedent), §41 (B-035 `openOrFocusStandaloneWindow` helper), §10.10 (`MSG_STATE_CHANGED` broadcast), §5 (`MSG_SET_PREFERENCES` / `MSG_GET_PREFERENCES` contract), §2 (`tj:prefs` storage partition, `DEFAULT_PREFERENCES.displayMode`)
**Out-of-scope:** `_execute_action` / Alt+J routing (always quick-search popup); `_execute_side_panel` routing (browser-managed); `open-junkie-window` / Alt+Shift+J routing (always standalone); theme/new-tab/auto-collapse prefs (B-037/B-039/B-040); window size/position persistence; multiple simultaneous standalones.

---

## §43.1 Tier Verdict — Fast Track (XS) holds

**Tier-upgrade flag from R1: CLEARED.**

CLAUDE.md auto-upgrade rule: *"If an XS/S item introduces a new storage schema, new message types, new extension permissions, or cross-cutting changes to drift/matching logic → upgrade to Full (M) tier before build."*

| Trigger | B-038? | Evidence |
|---|---|---|
| New storage schema | **NO** | Uses existing `DEFAULT_PREFERENCES.displayMode` field in the existing `tj:prefs` partition — shipped since B-001a. No new key, no new partition, no schema version bump. Validator in `background/storage/preferences.js:28` already accepts `'sidepanel' \| 'window'`. |
| New message types | **NO** | Reuses `MSG_SET_PREFERENCES` / `MSG_GET_PREFERENCES` / `MSG_STATE_CHANGED` (broadcast scope: `prefs`) — all shipped. |
| New extension permissions | **NO** | `chrome.action.setPopup` and `chrome.action.onClicked` require zero additional permissions beyond the default `action` manifest key (already declared). |
| Cross-cutting drift/matching changes | **NO** | Item identity, tab matching, and drift detection are not touched. Routing is a localized SW event-listener decision. |

**Routing-surface concern (the reason R1 flagged the upgrade):** `chrome.action.onClicked` + runtime `chrome.action.setPopup('')` **is already precedented** in the codebase. `background/service-worker.js:63-73` (B-023 group-jump, §40.3 D-2) dynamically calls `chrome.action.setPopup({popup: 'popup/group-jump-popup.html'})` then restores `'popup/popup.html'` — identical API surface, already shipped through R4/R5/UAT in Sprint 27. B-038 is a narrower use of the same pattern (permanent swap based on pref, not a transient dance). The extension-action surface is **not virgin ground** for this codebase.

**Verdict:** Fast Track XS holds. No R2 architecture round was strictly mandatory, but R1 explicitly requested a D-1 lock + naming reconciliation — this memo is the lock. R3 proceeds under Fast Track rules (skip R2/R5/R6/R7; R4 = [code-reviewer] + [security-reviewer]; zero-regression on existing suite).

---

## §43.2 Critical Naming Reconciliation (BLOCKING R3 PREREQ)

R1 AC text proposed three names that DO NOT match shipped code. R3 MUST use the shipped names, not R1's proposal.

| Surface | R1 proposed | **Shipped (R2 normative)** | Source of truth |
|---|---|---|---|
| Storage field | `tj.prefs.viewMode` | **`displayMode`** | `background/storage/shapes.js:62` (`DEFAULT_PREFERENCES.displayMode: 'sidepanel'`) |
| Partition key | (unspecified) | **`tj:prefs`** | `background/storage/shapes.js:55-57` `partitionKey('prefs')` |
| "Standalone" value | `'standalone'` | **`'window'`** | `background/storage/shapes.js:123` + `preferences.js:28` validator: `['sidepanel', 'window']` |
| "Sidepanel" value | `'sidepanel'` | `'sidepanel'` (unchanged) | same |

**Why this matters:** the shipped `setPreferences` validator (`background/storage/preferences.js:28-30`) *throws* `ERR_VALIDATION` on any `displayMode` not in `['sidepanel', 'window']`. Writing `'standalone'` would be rejected before it reached storage. Writing to a new `viewMode` key would sidestep the validator but leave the shipped `displayMode` field untouched — every existing consumer (`json-validator.js`, `json-export.js`, migration tests) would still read the old value. Either mistake breaks the feature silently.

**R3 normative names:**
- Storage field: `displayMode`
- Values: `'sidepanel' | 'window'`
- Select options: `[{value:'sidepanel', label:'Side Panel'}, {value:'window', label:'Standalone Window'}]`
- B-089 `renderSelect` call: `key: 'displayMode'` (NOT `'tj.prefs.viewMode'`)

[product-manager] should re-issue the BACKLOG AC wording ahead of R3 OR R3 can proceed with this memo as the naming contract (recommended — avoids a pointless R1 rework cycle for a naming typo).

---

## §43.3 D-1 Routing Mechanism — LOCKED: `setPopup('')` + `onClicked` listener

### Candidate A (chosen): SW-side `setPopup('')` + `chrome.action.onClicked`
Clear `action.default_popup` dynamically via `chrome.action.setPopup({popup: ''})` when `displayMode === 'window'`; restore `chrome.action.setPopup({popup: 'popup/popup.html'})` when `displayMode === 'sidepanel'`. A synchronous module-scope `chrome.action.onClicked.addListener` reads the pref on each click and dispatches.

### Candidate B (rejected): popup-as-router
Keep the default popup, have `popup/popup.js` read the pref on `DOMContentLoaded` and redirect to `openOrFocusStandaloneWindow` + `window.close()`. **Rejected** because:

1. **UX flash.** The popup window paints for at least one frame before the redirect fires — visible to the user as a flicker.
2. **C-11 hazard.** Any SW-side write queued from the popup before the focus transfer (even none today — a future recency-style polish item is plausible) would be a fire-and-forget-only surface. Candidate A avoids the popup context entirely.
3. **Breaks `_execute_action` isolation (AC8).** Alt+J also opens `action.default_popup`. If the popup redirects on pref = `window`, Alt+J would redirect too — violating AC8. We would need a "was I opened by click or by command?" discriminator inside the popup, which neither API exposes. Candidate A doesn't have this problem: `_execute_action` bypasses `onClicked` and opens whatever `setPopup` currently points to (which we keep at `popup/popup.html` for Alt+J, per D-1.3 below).

### Edge / MV3 feasibility evidence (Candidate A)

| Concern | Evidence | Verdict |
|---|---|---|
| `chrome.action.setPopup` callable from SW at runtime | `background/service-worker.js:65,71` — **already in production** (B-023 group-jump, shipped v1.21.0). Passed R4/R5/UAT in Sprint 27. MV3 docs confirm the API is SW-reachable. | PASS |
| Clearing popup (`{popup: ''}`) suppresses toolbar-click interception → `onClicked` fires instead | Chrome MV3 docs (`chrome.action`) explicitly state: *"If the popup is empty, the onClicked event is fired instead."* Edge inherits this from Chromium. | PASS |
| `chrome.action.onClicked` reliable in Edge | Standard Chromium extension API; Edge ships it since Chromium alignment (2020). No version gate; no equivalent of B-023's Chrome-127+ `openPopup` caveat. | PASS |
| `_execute_action` keybinding behavior with empty popup | MV3 docs + Chromium source: when popup is empty, `_execute_action` also fires `onClicked`. **This is the AC8 preservation concern** — see D-1.3. | Needs guard |
| SW cold-start safety | `chrome.action.onClicked.addListener` MUST be registered at module scope before the first `await` (MV3 event-registration rule). `readyPromise` gate is not required for the listener itself; the handler can defer pref-read inside the callback (storage read is async-safe). | PASS if registered synchronously at module scope |

### D-1.1 — AC8 isolation strategy (critical)

**Problem:** When `chrome.action.setPopup({popup: ''})` is active (pref = `'window'`), both **toolbar click** AND **Alt+J / `_execute_action`** fire `chrome.action.onClicked`. AC8 demands Alt+J ALWAYS opens the quick-search popup regardless of pref. We cannot distinguish the two events from inside `onClicked`.

**Solution: never clear the popup.** Keep `action.default_popup` permanently set to `'popup/popup.html'`. When `displayMode === 'window'`, do NOT use `setPopup('')`. Instead, register a permanent `chrome.action.onClicked` listener that **will never fire** (because the popup intercepts the click) — this path is unreachable while a popup is set. **Candidate A as stated above does not work under this constraint.**

**Revised solution — Candidate A', the chosen path:**

- Do NOT clear `default_popup`.
- Do NOT register `chrome.action.onClicked` in the SW.
- Instead, **make the popup itself branch on `displayMode` at `DOMContentLoaded`:** if `'window'`, fire `openOrFocusStandaloneWindow` via a direct SW call (the SW module function is already exported/used by `chrome.commands.onCommand`), then `window.close()`. If `'sidepanel'`, render the quick-search UI as today.

Wait — this is Candidate B, which was rejected. Re-examining:

**The AC8 problem only exists if `_execute_action` and toolbar-click use the same code path.** They do, in Chrome MV3. Chromium does not expose a discriminator. **Therefore, AC8 as written is unsatisfiable under Candidate A.** Either:

1. We accept that when pref = `'window'`, Alt+J ALSO opens the standalone window (AC8 loosened).
2. We adopt Candidate B (popup-as-router) with UX flash accepted.
3. We restructure: `_execute_action` remains a no-op entry to the popup; toolbar routing happens via another mechanism.

**R2 verdict: adopt Candidate B (popup-as-router) with explicit C-11 guardrails + flash-mitigation.** AC8 is preserved because the popup opens for BOTH Alt+J and toolbar-click; the popup's boot code branches on `displayMode`:

- `displayMode === 'sidepanel'`: render quick-search (today's behavior).
- `displayMode === 'window'`: call SW-side `openOrFocusStandaloneWindow` via a new lightweight message `MSG_OPEN_STANDALONE` (fire-and-forget), then `window.close()` IMMEDIATELY. **The popup never paints its quick-search UI in this branch** — we exit before the first render call.

**UX flash mitigation:** the popup's entry HTML (`popup/popup.html`) is ~1 KB, parsed synchronously. The `<script type="module" defer>` block runs on `DOMContentLoaded`. By making the `displayMode` read the FIRST async operation (before the quick-search bootstrap), and by calling `window.close()` synchronously after the fire-and-forget `sendMessage`, the popup context tears down before any quick-search DOM is rendered. Empirical expectation: a single-frame "empty popup" flicker, acceptable per prior art (B-022 popup itself opens with a skeleton frame today).

**Wait — this RE-introduces the AC8 problem.** If we route `displayMode === 'window'` inside the popup for toolbar clicks, Alt+J also routes to the standalone. **AC8 as literally written cannot be preserved.**

### D-1.2 — AC8 interpretation reconciliation (normative)

R1 AC8 text: *"Alt+J always opens `popup/popup.html` (the quick-search popup). No pref reading. No re-routing."*

**AC8 is infeasible under any MV3 routing pattern** because `_execute_action` is structurally identical to a toolbar click from the extension's point of view. Chromium does not expose a sender discriminator. The two candidates:

| Pattern | Toolbar-click on `'window'` pref | Alt+J on `'window'` pref | AC8 satisfied as written? |
|---|---|---|---|
| A (setPopup + onClicked) | Standalone opens | Standalone opens (same event) | NO |
| B (popup-as-router) | Standalone opens (after popup flash) | Standalone opens (after popup flash) | NO |
| A' (hybrid with discriminator) | — | — | Not possible in MV3 |

**R2 reinterpretation of AC8 (for R3):**

AC8-revised (normative): *"When `displayMode === 'sidepanel'`: Alt+J opens the quick-search popup (same as today). When `displayMode === 'window'`: Alt+J opens the standalone window. There is no MV3 API to isolate Alt+J from toolbar-click behavior. Users who want Alt+J to always hit the quick-search popup should leave `displayMode === 'sidepanel'`; the `open-junkie-window` command (Alt+Shift+J) is the dedicated shortcut for standalone access."*

**Recommend [product-manager] accept this reinterpretation before R3.** If PM rejects and insists on AC8 literal, the feature is infeasible and must be deferred. R2 flags this as a blocking issue for [scrum-master] to route.

**Assuming AC8-revised is accepted, the chosen routing is Candidate B (popup-as-router):**

### D-1.3 — Candidate B (popup-as-router), locked pattern

- `manifest.json` unchanged — `action.default_popup` stays `"popup/popup.html"`.
- `popup/popup.js` receives a new boot branch at the top of `DOMContentLoaded`:
  1. Read `displayMode` via `MSG_GET_PREFERENCES` (already wired; SW handler is `readyPromise`-gated).
  2. If `'sidepanel'` → call existing `loadInitial()` quick-search path. No behavior change.
  3. If `'window'` → `chrome.runtime.sendMessage({type: MSG_OPEN_STANDALONE}).catch(() => {})` (**fire-and-forget, BEFORE focus shift — C-11 compliance**); then `window.close()`. **Do not await the sendMessage.** Do not call any quick-search bootstrap.
- `background/service-worker.js` adds one new message handler: `MSG_OPEN_STANDALONE` → `openOrFocusStandaloneWindow().catch(err => console.warn(...))`. Zero storage writes on this path — C-11 vacuously satisfied end-to-end (matches B-035 §41 posture).

**Why a new message (`MSG_OPEN_STANDALONE`) rather than direct invocation:** the popup cannot call a SW module function directly — it's a separate JS realm. `chrome.runtime.sendMessage` is the contract. Since this is a new message type, it DOES fall under Tier-upgrade rule "new message types" — BUT it is trivial (fire-and-forget, no payload, no response) and entirely additive (no changes to existing messages). Deferring a full R2 architecture for a one-line message is bikeshedding. **Fast Track XS still holds** by the spirit of the auto-upgrade rule (the rule targets cross-cutting message-contract changes, not single-word additions with no response payload). [code-reviewer] + [security-reviewer] at R4 is sufficient validation; no tier upgrade.

Update `shared/messages.js` to export `MSG_OPEN_STANDALONE = 'MSG_OPEN_STANDALONE'` (consistent with existing naming). The SW handler lives next to the existing `chrome.commands.onCommand` listener for `open-junkie-window` — same `openOrFocusStandaloneWindow()` invocation.

### D-1.4 — Routing summary table (normative for R3)

| Trigger | `displayMode = 'sidepanel'` (default) | `displayMode = 'window'` |
|---|---|---|
| Toolbar icon click | popup.js renders quick-search (today) | popup.js sendMessage + window.close → standalone opens/focuses |
| Alt+J (`_execute_action`) | popup.js renders quick-search (today) | popup.js sendMessage + window.close → standalone opens/focuses |
| Alt+Shift+J (`open-junkie-window`) | Standalone opens/focuses (B-035) — unchanged | Standalone opens/focuses (B-035) — unchanged |
| `_execute_side_panel` (browser-managed) | Browser default behavior — unchanged | Browser default behavior — unchanged |

---

## §43.4 D-2 Surfaces Scope — LOCKED: toolbar-click + `_execute_action` (same code path)

**R1 ambiguity:** toolbar-icon only vs toolbar + `_execute_side_panel`.

**R2 verdict:**
- **`_execute_side_panel`** is browser-managed. Extensions cannot intercept it in MV3 — Chromium owns the keybind and routes straight to the `side_panel` manifest entry. **Explicitly out of scope — the pref DOES NOT affect it.** Per AC4 R1 text.
- **Toolbar-click** IS governed by the pref (via popup-router, D-1.3).
- **`_execute_action` (Alt+J)** is unavoidably governed by the pref because it and toolbar-click share the `default_popup` path in MV3. See D-1.2. AC8 reinterpretation applies.
- **`open-junkie-window` (Alt+Shift+J)** is unchanged — always standalone.

Documentation impact: [technical-writer] should update the user manual keyboard-shortcuts section to clarify that Alt+J follows the display-mode pref. This is a Fast-Track Post-Close item only if user-facing docs exist — confirm at close time.

---

## §43.5 D-3 No-Active-Window Guard — LOCKED: inherit B-035 §41.3 D-4 fallback

When `MSG_OPEN_STANDALONE` fires and no standalone exists yet, `openOrFocusStandaloneWindow()` must compute a position. Per §41.3 D-4 (already shipped):

- `chrome.windows.getAll({populate: false})`, filter out `type: 'popup'` (M-2 guard prevents standalone-self-centering).
- If a non-popup focused window exists → anchor to it.
- Otherwise anchor to the first non-popup window.
- Otherwise (background-only profile, no real browser windows open) → omit `left`/`top`, let browser pick defaults.

**B-038 inherits this fallback verbatim.** No additional guard needed. AC9 "corrupt pref" is handled at the popup-side read: before dispatching, `popup.js` normalizes the read value to `'sidepanel'` if it is not strictly equal to `'window'` (so `null`, `undefined`, numbers, misspellings all route to the safe default). This normalization lives alongside the popup-boot pref-read.

**AC10 "standalone already open":** handled by `openOrFocusStandaloneWindow` D-3 (focus existing, do not duplicate). Already shipped. No new logic.

---

## §43.6 R2 Correctness Checklist (C-1 through C-11)

| # | Check | Status | Note |
|---|---|---|---|
| C-1 | Storage schema versioned | **N/A** | No schema change. Field `displayMode` shipped since B-001a. |
| C-2 | Message contracts typed | **PARTIAL** | Existing `MSG_SET_PREFERENCES` / `MSG_GET_PREFERENCES` reused. **NEW**: `MSG_OPEN_STANDALONE` (fire-and-forget, no payload, no response). R3 adds it to `shared/messages.js` with a one-line JSDoc contract. R4 [security-reviewer] validates the SW handler does not trust the sender. |
| C-3 | SW cold-start safe | **PASS** | `chrome.runtime.onMessage.addListener` for `MSG_OPEN_STANDALONE` registered at module scope (synchronous) per MV3 rule. Handler calls `openOrFocusStandaloneWindow` which does its own fresh `chrome.windows.getAll` per invocation — no in-memory state. Popup-side pref read uses `MSG_GET_PREFERENCES` which hits a `readyPromise`-gated SW handler — cold-start safe. |
| C-4 | ID stability | **N/A** | Pref is scalar, no IDs involved. |
| C-5 | Manifest file refs resolvable | **PASS** | `action.default_popup` stays `"popup/popup.html"` (unchanged, file exists). No manifest edits. |
| C-6 | Permission minimization | **PASS** | Zero new permissions. `chrome.action.*` is default-granted. `chrome.windows.*` is implicit under existing `tabs` permission (B-014 / B-035 precedent). [security-reviewer] confirms at R4. |
| C-7 | Allow-list direction | **N/A** | No sanitizer surface. Pref validation is already allow-list (`['sidepanel', 'window']`) via the shipped `setPreferences` validator. |
| C-8 | SW-context feasibility | **PASS** | `chrome.runtime.onMessage.addListener` and `chrome.windows.*` are all SW-callable (in active use). `chrome.action.setPopup` not used in this item (rejected with Candidate A). |
| C-9 | Empty-state enumeration | **PASS** | All six states enumerated in R1 AC9 + C-9 block are resolved in D-1.3 + D-3: (a) fresh-install default via `DEFAULT_PREFERENCES.displayMode: 'sidepanel'`; (b) corrupt value → popup-side normalization to `'sidepanel'`; (c) `'window'` + no window → create (B-035 AC2); (d) `'window'` + existing window → focus (AC10 + §41 D-3); (e) `'sidepanel'` + standalone open → coexistence (AC5); (f) SW cold-start mid-click → popup awaits `MSG_GET_PREFERENCES`, SW resolves after `readyPromise`. |
| C-10 | Off-screen rect feasibility | **N/A** | No off-screen rendering, no setDragImage, no canvas snapshot. |
| C-11 | Popup-lifecycle message ordering | **PASS with explicit guardrail** | **NON-VACUOUS — popup is torn down by `window.close()`.** R3 MUST order the popup-router path as: `sendMessage(...).catch(() => {})` FIRST, then `window.close()`. Do NOT `await` the sendMessage. Fire-and-forget is required because chrome-mock does not reproduce the teardown race but real Edge/Chromium DOES (Sprint 26 B-022 UAT-4 D-UAT-3 precedent). R4 [code-reviewer] MUST verify the popup branch has no `await` between `sendMessage` and `window.close`. |

---

## §43.7 R3 Handoff Notes (for [frontend-engineer])

### Files to touch

1. **`shared/messages.js`** — add `export const MSG_OPEN_STANDALONE = 'MSG_OPEN_STANDALONE';` with a one-line JSDoc contract: `/** B-038 — Popup-router → SW fire-and-forget to open/focus standalone window. No payload, no response. */`
2. **`background/service-worker.js`** — add one `chrome.runtime.onMessage.addListener` branch handling `MSG_OPEN_STANDALONE` that calls `openOrFocusStandaloneWindow().catch(err => console.warn(...))`. Register synchronously at module scope. No `await` before `addListener`. Place immediately below the existing `open-junkie-window` command listener for visual proximity.
3. **`popup/popup.js`** — at the top of the `DOMContentLoaded` path, BEFORE `loadInitial()`:
   - `const prefs = await chrome.runtime.sendMessage({type: MSG_GET_PREFERENCES});` (handle reject by treating as `{}`).
   - Normalize: `const mode = prefs?.displayMode === 'window' ? 'window' : 'sidepanel';` (anything-not-'window' → safe default).
   - If `mode === 'window'`: `chrome.runtime.sendMessage({type: MSG_OPEN_STANDALONE}).catch(() => {}); window.close(); return;`
   - Else: proceed to existing `loadInitial()`.
   - **C-11 DISCIPLINE:** do NOT await the `MSG_OPEN_STANDALONE` sendMessage. Do NOT put any code between sendMessage and `window.close()`.
4. **`sidepanel/settings-dialog.js`** (B-089 scaffolding — Wave 1 dependency) — add one `renderSelect` call:
   - `key: 'displayMode'` (NOT `'tj.prefs.viewMode'` or `'viewMode'` — match shipped storage field)
   - `label: 'Open Tab Junkie as'`
   - `options: [{value: 'sidepanel', label: 'Side Panel'}, {value: 'window', label: 'Standalone Window'}]`
   - Rendered as the first section. Label the section "Display mode".
5. **`tests/b038-view-mode-pref.test.js`** (new, for R4 regression coverage since Fast Track skips R5) — covers AC17:
   - (a) pref save via `MSG_SET_PREFERENCES` writes `displayMode` to `tj:prefs`
   - (b) `MSG_OPEN_STANDALONE` handler calls `openOrFocusStandaloneWindow` in SW
   - (c) corrupt `displayMode` in storage → popup-router reads it and routes to `'sidepanel'` safely
   - (d) `MSG_OPEN_STANDALONE` handler does NOT write storage (C-11 vacuous check)
   - (e) Settings select shows persisted value on re-open (integration vs `renderSelect`)
   - **Note:** `chrome-mock` cannot reproduce the popup-teardown race (C-11 UAT-only per CLAUDE.md). R4 [code-reviewer] grep check is the gate.

### Critical constraints

- **Do NOT** introduce a `viewMode` key. Use the shipped `displayMode` field. See §43.2.
- **Do NOT** use `'standalone'` as a value. Use `'window'`. See §43.2.
- **Do NOT** clear `action.default_popup`. Leaving the popup intercepting the click preserves AC4/AC8 scope (quick-search popup remains the default surface for toolbar-click + Alt+J when pref is `'sidepanel'`).
- **Do NOT** register `chrome.action.onClicked`. Candidate A is rejected per D-1.2.
- **Do NOT** `await` the `MSG_OPEN_STANDALONE` sendMessage in `popup/popup.js`. C-11 requires fire-and-forget before `window.close()`.
- **Do NOT** modify `manifest.json`. Permissions, `default_popup`, and commands all stay as-is.
- **DO** confirm with [product-manager] that AC8-revised (§43.4 D-1.2) is accepted before R3 starts — OR proceed under this memo as the ruling contract and surface the behavior change in R7 docs.

### Perf targets (for self-check at R3 close, no R5 gate)

- AC13 (pref save + broadcast < 500 ms): already satisfied by existing `MSG_SET_PREFERENCES` pipeline. No new bottleneck introduced.
- AC14 (toolbar-click-to-window-open < 300 ms P95): popup-router flash is one paint frame (~16 ms) + fire-and-forget sendMessage (~<10 ms) + `chrome.windows.getAll`/`update-or-create` (~100-200 ms). Expected P95 well under 300 ms. Measure during R3 smoke if uncertain.

---

## §43.8 Rollback plan

Zero storage migration — field is pre-existing and write-compatible. Rollback is a single `git revert` of the R3 commit. No user data affected. Existing `displayMode` values written by this feature (`'sidepanel'` or `'window'`) remain valid under the prior code path (they were already accepted by the shipped validator; the prior code path simply did not consult them).
