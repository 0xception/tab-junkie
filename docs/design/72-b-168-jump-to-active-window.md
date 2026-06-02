# §72 — B-168 — Jump to Active Window

**Status:** R2 DESIGN — Sprint 46 (2026-06-02).
**Anchor:** B-168 (P2 / S — Fast Track upgraded to Full per manifest `commands` interaction; Full pipeline confirmed at R2).
**Tier:** Full pipeline (M — manifest change + new message type cross-cuts SW, popup, and sidepanel).
**Depends on:** B-014 ✅ (`data-window-id` stamping on all rows).
**Author:** [solution-architect] (Sonnet). R2 plan — R3 owns implementation.

---

## §72.1 — Problem statement

When the user has multiple browser windows open, the sidepanel renders
rows grouped by window. The active window's section may be anywhere in
the list depending on window open order and the `_activeWindowFilter`
chip state. There is no one-shot gesture to jump to the section for
the currently-focused window — the user must scroll manually.

B-168 adds two triggers that converge on the same behaviour:

1. **Toolbar icon click** — a new "Jump to current window" button
   in the popup footer (`#qs-footer`).
2. **Keyboard shortcut** — new `Alt+W` binding (W = Window).

Both triggers cause the sidepanel to scroll smoothly to the first
`[data-window-id="<activeWindowId>"]` row and briefly flash the
destination section. If no rows for that window are visible, a
short toast informs the user instead of silently doing nothing.

The change is purely additive. No existing sidepanel controls are
moved or removed.

---

## §72.2 — R0 option resolution

Three design choices were evaluated at R1 before locking ACs.

### §72.2.1 — Toolbar surface

**Options considered:**
- A. Dedicated `chrome.action.onClicked` handler (separate from existing popup).
- B. New button in existing popup footer (`#qs-footer`).

**Picked: B.** Reuses the existing popup surface with no new extension
entry-points. The popup already resolves the current window id (pattern
at `popup/popup.js:933`) and has the fire-and-forget → `window.close()`
C-11 discipline baked in. Minimal UI delta.

### §72.2.2 — Keyboard binding

**Options considered:** `Alt+W`, `Alt+Shift+W`, `Alt+G` (G for Go).

**Picked: `Alt+W`** (W for Window). Collision-free against all existing
commands in `manifest.json:25-51`:
- `Alt+J` — `_execute_action` (open quick-search popup)
- `Alt+Shift+J` — `open-junkie-window`
- `Alt+K` — `group-jump`
- `Alt+Comma` — `open-junkie-settings`
- `Alt+Left/Right/F4` — reserved browser bindings

`Alt+W` is not reserved by any browser on the target desktop platforms
(Windows/macOS/Linux Chromium). Verified against the Chrome commands
reference — no platform collision.

### §72.2.3 — Empty-state behaviour

**Options considered:**
- A. Silent no-op.
- B. Scroll to top of list.
- C. Toast message.

**Picked: C.** Silent no-op (A) gives the user no signal that the action
ran. Scroll-to-top (B) is misleading — the user asked to go to the
current window, not the top. A toast (C) is the established explicit-
signal pattern in this codebase (see `sidepanel.js:972`, `:1222`).
Auto-dismiss 3 s per the existing default.

---

## §72.3 — Architecture

### §72.3.1 — Message flow

Both triggers converge on one new message type: `MSG_JUMP_TO_ACTIVE_WINDOW`.

**Popup path (toolbar button):**
```
popup button click
  → chrome.windows.getCurrent({ populate: false })  // popup.js:933 pattern
  → chrome.runtime.sendMessage({ type: MSG_JUMP_TO_ACTIVE_WINDOW,
                                  payload: { windowId } })
    .catch(() => {})                                  // fire-and-forget, C-11
  → window.close()
```

The message is a fire-and-forget per C-11 discipline: the `sendMessage`
call completes before any focus-shifting API. `window.close()` is the
focus-shifting call here; the message must be fired before it. There is
no `await` between `sendMessage` and `window.close()`.

**Keyboard shortcut path (SW):**
```
chrome.commands.onCommand('jump-to-active-window')
  → chrome.windows.getLastFocused({ populate: false })
  → chrome.runtime.sendMessage({ type: MSG_JUMP_TO_ACTIVE_WINDOW,
                                  payload: { windowId } })
    .catch(() => {})
```

SW has no window context — `getCurrent` in the SW would fail or return
an unexpected context (see §72.3.2). The SW sends the message to the
sidepanel, which handles the scroll.

**Sidepanel onMessage handler (receiver):**
```
chrome.runtime.onMessage.addListener (at sidepanel.js:7130, new branch):
  if msg.type === MSG_JUMP_TO_ACTIVE_WINDOW
    → validate payload { windowId: number }  // allow-list, C-7
    → _jumpToActiveWindow(windowId)
```

`_jumpToActiveWindow` is a new helper function in `sidepanel.js`:
```js
function _jumpToActiveWindow(windowId) {
  const target = itemListEl
    .querySelector(`[data-window-id="${windowId}"]`);
  if (!target) {
    showToast('No tabs from the current window are visible here.');
    return;
  }
  target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  target.classList.add('item-row--jump-highlight');
  setTimeout(() => target.classList.remove('item-row--jump-highlight'), 600);
}
```

### §72.3.2 — Window-detection API choice (R2-VERIFY resolved)

**Popup context — `chrome.windows.getCurrent`:**

Verified at `popup/popup.js:933` — the existing `_onOpenSidepanelClick`
handler uses `chrome.windows.getCurrent({ populate: false })` successfully
to resolve the popup's host window. This is the correct pattern for popup
context: the popup is rendered inside the browser action icon's window,
and `getCurrent` returns that window. R2-VERIFY resolved: trust the
existing `:933` precedent. No fallback to `getLastFocused` needed in
popup context.

**SW context — `chrome.windows.getLastFocused`:**

Service workers have no window context; `chrome.windows.getCurrent` in
SW context returns a rejection or a null window. `chrome.windows.getLastFocused`
is the correct API — it returns the most recently focused browser window
regardless of calling context. This is why the existing `open-junkie-settings`
command handler (`service-worker.js:157-162`) does NOT call `getCurrent`.

R3 MUST use `chrome.windows.getLastFocused` in the SW handler and
`chrome.windows.getCurrent` in the popup handler.

### §72.3.3 — Scroll mechanism and visual feedback

**Scroll target:**
`itemListEl.querySelector('[data-window-id="<windowId>"]')` selects the
first element in document order with a matching `data-window-id` attribute.

`data-window-id` is stamped at two sites:
- `sidepanel/sidepanel.js:2578-2579` — saved-item rows (live-claimed items
  only; items without a live claim have no `data-window-id` attribute).
- `sidepanel/sidepanel.js:3549` — open-tab rows.

This means the scroll will target whichever of those two row types appears
first in the rendered list for the given `windowId`. This is correct: both
row types belong to the active window's section, and the first visible row
is the natural scroll target.

**Scroll call:**
```js
target.scrollIntoView({ block: 'start', behavior: 'smooth' });
```

`block: 'start'` pins the target row to the top of the viewport.
`behavior: 'smooth'` enables the browser's native animated scroll.

**Visual feedback (`item-row--jump-highlight`):**
- CSS class added immediately after `scrollIntoView`.
- Removed via `setTimeout` after 600 ms.
- `@keyframes item-row-jump-pulse` in `sidepanel/sidepanel.css`:

```css
@keyframes item-row-jump-pulse {
  0%   { background-color: var(--active-bg); }
  70%  { background-color: var(--active-bg); }
  100% { background-color: transparent; }
}

.item-row--jump-highlight {
  animation: item-row-jump-pulse 600ms ease-out forwards;
}
```

R2-VERIFY resolved: `--active-bg` token exists in `shared/themes.css:91`
(light theme), `:146` (dark theme), `:210` (GitHub light), `:261`
(Solarized light), `:311` (Atom One Light), `:362` (Solarized dark),
`:426` (dark variant) — confirmed present and theme-specific across all
seven theme definitions. Using `var(--active-bg)` in the `@keyframes`
guarantees correct flash colour in all themes automatically.

The 600 ms flash duration is chosen to match the existing visual-feedback
convention: long enough to be noticed on a first glance, short enough not
to linger annoyingly.

### §72.3.4 — Empty-state behaviour (C-9)

C-9 requires every user-facing product path to enumerate empty-state UX.

| State | Condition | Behaviour |
|-------|-----------|-----------|
| Match found | `querySelector` returns a non-null element | Scroll + 600 ms flash. |
| No match | `querySelector` returns `null` (no `data-window-id` rows for `windowId`) | `showToast('No tabs from the current window are visible here.')` — auto-dismiss 3 s. No scroll. |
| Payload invalid | `windowId` missing or not a number in the received message | Handler returns early; no scroll; no toast. No JS error. |

**Why no match occurs in practice:**
- User has filtered the sidepanel via `_activeWindowFilter` to a different
  window and then triggers "jump to active window" — the active window's
  rows are hidden by the filter, not present in `itemListEl`.
- The active window has only unsavable-scheme tabs
  (`data-unsavable` rows have `data-window-id` but those rows should still
  be present in `itemListEl`; this case likely still matches).
- Edge case: fresh sidepanel with zero tabs loaded (very brief window).

The toast satisfies the "explicit user signal" design principle established
at §72.2.3.

R2-VERIFY resolved: `showToast` (not `_showToast`) is the function name.
Verified at `sidepanel/sidepanel.js:1804`. Signature:
`showToast(message, options?)`. Plain string call is backward-compatible
per the JSDoc at `:1796-1802`. Existing callers use `showToast('text')`
at `:972` and `:1222`. R3 MUST call `showToast('No tabs from the current
window are visible here.')` — no second argument needed.

---

## §72.4 — Message contract (C-2 + C-7)

### §72.4.1 — New constant

```js
/**
 * Sent by popup (toolbar button) or SW (keyboard shortcut) to scroll the
 * sidepanel to the first row belonging to the specified browser window.
 *
 * Sender:   popup/popup.js  (via chrome.runtime.sendMessage fire-and-forget)
 *           background/service-worker.js  (via chrome.runtime.sendMessage)
 * Receiver: sidepanel/sidepanel.js  (chrome.runtime.onMessage)
 *
 * @type {'tj/jumpToActiveWindow'}
 * Payload:  { windowId: number }  — Chrome window ID of the target window.
 */
export const MSG_JUMP_TO_ACTIVE_WINDOW = 'tj/jumpToActiveWindow';
```

Location: `shared/messages.js` after `MSG_SYNC_TO_CHROME` at `:297`,
before `// ---- State broadcast ----` comment at `:299`.

### §72.4.2 — Payload validator (C-7 allow-list)

Both the SW dispatch site and the sidepanel `onMessage` branch MUST
validate the payload using an allow-list strategy (C-7: default to
permit-known-good, not strip-known-bad).

Validation predicate (sketch):
```js
function _isValidJumpPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.windowId !== 'number') return false;
  if (!Number.isFinite(payload.windowId) || payload.windowId <= 0) return false;
  return true;
}
```

In the sidepanel `onMessage` branch:
```js
if (msg.type === MSG_JUMP_TO_ACTIVE_WINDOW) {
  if (!_isValidJumpPayload(msg.payload)) return;
  _jumpToActiveWindow(msg.payload.windowId);
  return;
}
```

This guard is intentionally placed before any DOM access. If the
payload is malformed (e.g., a rogue extension spoofing the message —
though `sender.id !== chrome.runtime.id` already gates entry at `:7131`)
the handler exits silently without error or side-effect.

---

## §72.5 — Fix scope

### §72.5.1 — Code files touched

| File | Change |
|------|--------|
| `manifest.json` | New `commands` entry `"jump-to-active-window"` with `"suggested_key": {"default": "Alt+W"}`. |
| `popup/popup.html` | New `<button id="popup-jump-to-window-btn">` inside `#qs-footer`. |
| `popup/popup.css` | Minor styling — inherit existing footer-button style; no new design tokens needed. |
| `popup/popup.js` | New click handler `_onJumpToWindowClick`: `getCurrent` → fire-and-forget sendMessage → `window.close()`. Import `MSG_JUMP_TO_ACTIVE_WINDOW` from `shared/messages.js`. |
| `background/service-worker.js` | New block inside or adjacent to `chrome.commands.onCommand.addListener` (`:157-162`): `if (cmd === 'jump-to-active-window')` branch → `getLastFocused` → `sendMessage`. |
| `sidepanel/sidepanel.js` | New `MSG_JUMP_TO_ACTIVE_WINDOW` import. New branch in `chrome.runtime.onMessage.addListener` (`:7130`). New `_jumpToActiveWindow(windowId)` helper. New `_isValidJumpPayload(payload)` helper. |
| `sidepanel/sidepanel.css` | New `@keyframes item-row-jump-pulse` + `.item-row--jump-highlight` rule. |
| `shared/messages.js` | New `MSG_JUMP_TO_ACTIVE_WINDOW` constant at `:297` (after `MSG_SYNC_TO_CHROME`). |

**No schema changes. No new manifest permissions required.**

`manifest.json` `commands` is a declaration, not a permission. The
`chrome.commands` API is available in MV3 without an explicit permission
entry. C-6 is satisfied vacuously: no `permissions` array change.

### §72.5.2 — Pre-existing test assertions to update

Per CLAUDE.md R2 fix-scope test-assertion enumeration requirement:

- **`tests/b097-settings-shortcut.test.js`** — contains assertions about
  the manifest `commands` object (verifies that `open-junkie-settings` with
  `Alt+Comma` is registered). If the test pins the count of commands or
  enumerates all command keys, the new `jump-to-active-window` command must
  be added to the expected set.

  R3 MUST grep `tests/b097-settings-shortcut.test.js` for the commands
  assertion and update it to include `jump-to-active-window` with
  `suggested_key.default: 'Alt+W'`.

- **`tests/b036-newtab.test.js`** — pins manifest fields but focuses on
  `chrome_url_overrides` and `permissions`, not `commands`. Likely no
  update needed. R3 to confirm by inspection.

- **`tests/b037-themes.test.js`** — CSS token tests; not manifest-related.
  No update needed.

- **`tests/b093-import-export-rehome.test.js`** — import/export tests; not
  manifest-related. No update needed.

- **`tests/b168-jump-to-active-window.test.js`** — new test file, coverage
  defined at §72.9.

---

## §72.6 — AC reconciliation

**AC1 — Toolbar icon click triggers scroll.**
The `_onJumpToWindowClick` handler in `popup/popup.js` follows the
`_onOpenSidepanelClick` pattern at `:933`: `getCurrent` resolves `windowId`,
fire-and-forget `sendMessage(MSG_JUMP_TO_ACTIVE_WINDOW, {windowId})`, then
`window.close()`. The C-11 ordering (message before close) is preserved.
The sidepanel receives the message and calls `_jumpToActiveWindow`. Design
satisfies AC1.

**AC2 — Keyboard shortcut triggers scroll.**
`manifest.json` gains `"jump-to-active-window": { "suggested_key": { "default": "Alt+W" } }`.
SW `chrome.commands.onCommand` listener gains a new `if (cmd === 'jump-to-active-window')`
branch that calls `getLastFocused` and sends `MSG_JUMP_TO_ACTIVE_WINDOW`.
The sidepanel receives and handles it identically to the popup path.
Design satisfies AC2.

**AC3 — Scroll target is correct row.**
`itemListEl.querySelector('[data-window-id="<windowId>"]')` selects the
first DOM-order row whose `data-window-id` matches the active window.
`data-window-id` is stamped at `:2578-2579` (saved rows) and `:3549`
(open-tab rows). `.scrollIntoView({ block: 'start', behavior: 'smooth' })`
pins the row at the viewport top. Design satisfies AC3.

**AC4 — Visual feedback on arrival.**
`item-row--jump-highlight` class added immediately after `scrollIntoView`;
removed after 600 ms via `setTimeout`. The `@keyframes item-row-jump-pulse`
animation uses `--active-bg` (verified across all seven theme definitions).
Design satisfies AC4 in both light and dark themes.

**AC5 — Empty-state behaviour.**
If `querySelector` returns `null`, `showToast('No tabs from the current window are visible here.')`
is called. Auto-dismiss is the default behaviour of `showToast` (`:1828-1831`
— `setTimeout` 4 s default for plain toasts, which is close enough to the
AC5 "3 s" spec; R3 may pass `{ durationMs: 3000 }` to pin exactly 3 s).
No scroll occurs. Design satisfies AC5.

**AC6 — Default keyboard binding chosen + collision-free.**
`Alt+W` verified non-colliding against all five existing commands at
`manifest.json:25-51` and standard browser reserved bindings. Design
satisfies AC6.

**AC7 — New message constant registered.**
`MSG_JUMP_TO_ACTIVE_WINDOW = 'tj/jumpToActiveWindow'` exported from
`shared/messages.js` after `:297`, with JSDoc sender/receiver contract
and payload shape `{windowId: number}`. Importable from both `popup/popup.js`
and `sidepanel/sidepanel.js` without circular deps (`shared/messages.js`
has no imports from sidepanel or popup). Design satisfies AC7.

---

## §72.7 — Rollback plan

B-168 is **purely additive**. No existing storage schema is altered.
No existing message types are changed. No existing UI elements are moved.

**Rollback procedure (if a regression is detected post-merge):**

1. Remove `"jump-to-active-window"` entry from `manifest.json` `commands`.
2. Remove `<button id="popup-jump-to-window-btn">` from `popup/popup.html`.
3. Remove the `_onJumpToWindowClick` handler and `MSG_JUMP_TO_ACTIVE_WINDOW`
   import from `popup/popup.js`.
4. Remove the `'jump-to-active-window'` branch from the SW `onCommand`
   listener in `background/service-worker.js`.
5. Remove the `MSG_JUMP_TO_ACTIVE_WINDOW` branch, `_jumpToActiveWindow`,
   and `_isValidJumpPayload` from `sidepanel/sidepanel.js`.
6. Remove `@keyframes item-row-jump-pulse` and `.item-row--jump-highlight`
   from `sidepanel/sidepanel.css`.
7. Remove `MSG_JUMP_TO_ACTIVE_WINDOW` constant from `shared/messages.js`.

After these seven file edits, the extension is restored to pre-B-168
behaviour. No storage migration or user-data cleanup is required.

---

## §72.8 — Performance

Both trigger paths follow the same pattern: one cheap browser-API call
(< 1 ms), one IPC `sendMessage`, one `querySelector`, one `scrollIntoView`.

| Path | API call | Expected wall time |
|------|----------|--------------------|
| Toolbar click | `chrome.windows.getCurrent` (sync-like within popup context) | < 50 ms click-to-scroll |
| Keyboard shortcut | `chrome.windows.getLastFocused` (lightweight SW call) | < 100 ms keypress-to-scroll |
| Empty-state | Same as above + `showToast` (synchronous DOM write) | Same bounds |

`querySelector` with an attribute selector on `itemListEl` is a linear
scan but on a bounded list (Chrome's tab limit per window is ~500 tabs,
rendering limit in practice much lower). Sub-millisecond for realistic
collections.

`scrollIntoView` is a browser-native layout operation. No custom scroll
animation code is introduced.

No new storage reads. No new storage writes. No new chrome API surface
beyond `chrome.windows.getLastFocused` (already available — same family
as `getCurrent` which the popup already calls; no new permission required).

---

## §72.9 — Tests planned for R5

New test file: `tests/b168-jump-to-active-window.test.js`.

| # | Test case | Maps to |
|---|-----------|---------|
| T1 | `MSG_JUMP_TO_ACTIVE_WINDOW` constant exported from `shared/messages.js` with value `'tj/jumpToActiveWindow'` | AC7 |
| T2 | `manifest.json` contains `jump-to-active-window` command with `suggested_key.default === 'Alt+W'`; `tests/b097-settings-shortcut.test.js` updated baseline | AC6 |
| T3 | Sidepanel onMessage handler: valid `{windowId: N}` payload → `_jumpToActiveWindow` called with `N` | AC3 |
| T4 | `_jumpToActiveWindow`: when matching row exists → `scrollIntoView` called + `item-row--jump-highlight` class toggled | AC3 + AC4 |
| T5 | `_jumpToActiveWindow`: when no matching row → `showToast` called with the empty-state message; `scrollIntoView` not called | AC5 |
| T6 | `_isValidJumpPayload`: rejects missing `windowId`, string `windowId`, `windowId: 0`, non-finite values; accepts `windowId: 1` | C-7 |
| T7 | SW `onCommand` handler for `'jump-to-active-window'` → calls `getLastFocused` → sends message | AC2 |

R5 [test-engineer] may add additional cases based on UAT findings. Total
estimated: 7 deterministic cases.

---

## §72.10 — UAT plan

**Setup:** Open two browser windows, each with 2–3 tabs. Open the
sidepanel. Verify it renders rows from both windows.

**Scenario A — Toolbar button, match found:**
1. Focus Window 1. Open popup. Click "Jump to current window" button.
2. **Expected:** Popup closes. Sidepanel scrolls to first row with Window 1's
   `data-window-id`. Row flashes briefly (visible in both light and dark themes).
3. **PASS signal:** Row is at or near top of sidepanel viewport; flash observed.

**Scenario B — Keyboard shortcut, match found:**
1. Focus Window 2. Press `Alt+W`.
2. **Expected:** Sidepanel scrolls to first row with Window 2's `data-window-id`.
   Row flashes.
3. **PASS signal:** Same as Scenario A for Window 2's section.

**Scenario C — Empty state (no visible rows for active window):**
1. Apply the `_activeWindowFilter` chip to filter to Window 1 only.
2. Focus Window 2. Press `Alt+W` (or click button).
3. **Expected:** Toast "No tabs from the current window are visible here."
   Appears and auto-dismisses. Sidepanel scroll position unchanged.
4. **PASS signal:** Toast text correct; no JS error in DevTools console.

**Scenario D — Collision check:**
1. Confirm that pressing `Alt+J` still opens the quick-search popup.
2. Confirm that pressing `Alt+K` still opens the group-jump popup.
3. Confirm that pressing `Alt+Comma` still opens Settings.
4. **PASS signal:** All three still fire their correct commands.

---

## §72.11 — Future-work hooks

The following are explicitly out of scope for B-168 and candidates for
future sprint items:

- **Multi-window cycle** — repeated `Alt+W` presses step forward through
  all windows in sequence (cycle semantics). This would require the sidepanel
  to track the last-jumped window and advance to the next. Separate item.

- **Filter to active window only** — sidepanel chip-style filter that hides
  rows from all other windows, complementing the existing `_activeWindowFilter`
  chip at `sidepanel.js:354`. Different UX from scroll-jump. Separate item.

- **Per-theme flash colour tuning** — if UAT feedback indicates the
  `--active-bg` pulse is too subtle in a specific theme, a theme-specific
  override token could be introduced. Low priority; standard `--active-bg`
  passes visual contrast in all seven themes by construction.
