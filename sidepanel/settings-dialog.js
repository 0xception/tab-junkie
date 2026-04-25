/**
 * B-089 — Settings dialog scaffolding.
 *
 * Owns the sidepanel settings surface: a modal dialog that reads preferences
 * via MSG_GET_PREFERENCES on open and writes partial patches via
 * MSG_SET_PREFERENCES on every control change. Exposes `renderToggle` and
 * `renderSelect` helpers that Wave 1 consumers (B-038 view-mode,
 * B-039 new-tab toggle, B-040 auto-collapse) call to insert their rows —
 * Wave 0 ships the scaffolding only; no pref controls are registered here.
 *
 * Design constraints (R1 ACs):
 *   - Zero new storage schema, message types, or permissions.
 *   - Existing DEFAULT_PREFERENCES (shapes.js) defines valid keys.
 *   - Dialog reuses the sidepanel's existing overlay + focus-trap pattern.
 *   - ARIA role=dialog + aria-labelledby + aria-modal. Escape closes.
 *   - Broadcast-driven sync: SCOPE.PREFERENCES (scope === 'preferences')
 *     broadcasts trigger a re-read so a second sidepanel instance updates
 *     without reopening.
 *
 * Dependency injection: the module is initialised once from sidepanel.js
 * (`init({ ... })`) with the DOM references + sendMessage helper it needs.
 * This keeps the module unit-testable — tests pass FakeElement shims + a
 * spy sendMessage + a spy chrome.runtime instead of loading the whole
 * sidepanel bundle.
 */

import { MSG_GET_PREFERENCES, MSG_SET_PREFERENCES, MSG_STATE_CHANGED } from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';

/* =========================================================================
   Module state
   ========================================================================= */

/** @type {null | {
 *   overlayEl: any,
 *   dialogEl: any,
 *   contentEl: any,
 *   errorEl: any,
 *   closeBtnEl: any,
 *   triggerBtnEl: any,
 *   activateFocusTrap: (el: any) => void,
 *   deactivateFocusTrap: () => void,
 *   sendMessage: (type: string, payload?: any) => Promise<any>,
 *   runtime: any,
 * }} */
let _deps = null;

/** Ordered list of registered fields. Each entry owns its row DOM + metadata. */
const _fields = [];

/** Keyed lookup for fast patch-dispatch lookups. */
const _fieldsByKey = new Map();

/** Most recently loaded prefs snapshot (used on broadcast re-sync). */
let _prefsSnapshot = null;

/** Saved reference to the trigger element so we can restore focus on close. */
let _triggerEl = null;

/** Broadcast listener reference so init() is idempotent. */
let _onRuntimeMessage = null;

/* =========================================================================
   Public API
   ========================================================================= */

/**
 * One-time initialization. Called from sidepanel.js with the DOM refs +
 * helpers the module needs. Idempotent: subsequent calls are no-ops so
 * click listeners and the broadcast listener are attached exactly once.
 * Tests call `_resetForTest()` (which clears `_deps`) between cases so the
 * guard allows re-initialisation in the test harness.
 *
 * @param {Object} deps
 * @param {any} deps.overlayEl         Shared dialog overlay element
 * @param {any} deps.dialogEl          The #settings-dialog element
 * @param {any} deps.contentEl         Target for programmatic row insertion
 * @param {any} deps.errorEl           Inline top-level error container
 * @param {any} deps.closeBtnEl        Close button inside the dialog
 * @param {any} deps.triggerBtnEl      Gear button in the header
 * @param {(el: any) => void} deps.activateFocusTrap
 * @param {() => void} deps.deactivateFocusTrap
 * @param {(type: string, payload?: any) => Promise<any>} deps.sendMessage
 * @param {any} deps.runtime           chrome.runtime (for onMessage + id)
 */
export function init(deps) {
  // Idempotency guard — matches the broadcast-listener pattern so every
  // listener (click + runtime) is attached exactly once. `_resetForTest()`
  // unsets `_deps` so tests can re-initialise cleanly between cases.
  if (_deps) return;
  _deps = deps;
  deps.closeBtnEl.addEventListener('click', closeSettingsDialog);
  deps.triggerBtnEl.addEventListener('click', () => {
    openSettingsDialog(deps.triggerBtnEl).catch(() => {
      /* open errors surface via inline error; no console noise. */
    });
  });

  // Broadcast listener — rebroadcast-triggered refresh. Register exactly once.
  if (!_onRuntimeMessage && deps.runtime && deps.runtime.onMessage && typeof deps.runtime.onMessage.addListener === 'function') {
    _onRuntimeMessage = (msg, sender) => {
      // Sender validation (B-089 AC7 / shared pattern — reject cross-extension).
      if (!sender || sender.id !== deps.runtime.id) return;
      if (!msg || msg.type !== MSG_STATE_CHANGED) return;
      const scope = msg.payload && msg.payload.scope;
      if (scope !== SCOPE.PREFERENCES) return;
      // Dialog doesn't need to be open — we still refresh the snapshot so
      // the next open paints with fresh values. When the dialog IS open,
      // reflect the change into the live controls without reopening.
      _refreshFromBroadcast().catch(() => {
        /* broadcast re-read failure is non-fatal; next open will re-fetch. */
      });
    };
    deps.runtime.onMessage.addListener(_onRuntimeMessage);
  }
}

/**
 * Open the dialog. Fetches prefs via MSG_GET_PREFERENCES, paints controls
 * with the stored values, traps focus inside the dialog, moves initial
 * focus to the first registered control (or Close when empty).
 *
 * @param {any} [triggerEl] Element to restore focus to on close.
 */
export async function openSettingsDialog(triggerEl = null) {
  if (!_deps) throw new Error('settings-dialog not initialised');
  // UAT-9f-1 (S29): defensive double-guard against modal stacking.
  //
  // (a) Overlay-level guard: if the shared dialog overlay is already
  //     visible, another dialog is open. Refuse — the user must close it
  //     first. The previous single-line check (`if (!hidden) return`) was
  //     correct in theory but UAT showed Settings + Add Bookmark BOTH
  //     visible, suggesting the gear's `inert` block was bypassed in some
  //     race window. This is the safety net.
  // (b) Sibling-level guard: even if the overlay element flags as hidden
  //     (could happen mid-teardown), explicitly check that none of the
  //     other dialog siblings under the overlay are currently visible.
  //     Both checks are cheap; "refuse to stack" is the safer default per
  //     the "Option A" recommendation in the UAT-9f-1 fix plan.
  if (!_deps.overlayEl.hidden) return;
  if (_isAnyOtherDialogVisible()) return;

  _triggerEl = triggerEl || null;

  // Paint baseline DOM (show dialog + inline error cleared) BEFORE the async
  // prefs fetch so AC3 gate (a) — dialog visible < 100ms — is met deterministic-
  // ally. The fetch fills values asynchronously; controls remain in their
  // unchecked/first-option state until the fetch resolves (< 200ms target).
  _clearInlineError();
  // Disable all controls during the fetch so the user can't race a save
  // against an in-flight load.
  _setAllControlsDisabled(true);

  _deps.dialogEl.hidden = false;
  _deps.overlayEl.hidden = false;
  _deps.overlayEl.removeAttribute('aria-hidden');
  _deps.activateFocusTrap(_deps.dialogEl);

  // Baseline focus — Close button is reachable even before prefs load so a
  // slow fetch cannot leave the dialog without a focused element (AC7 +
  // focus-trap invariants). First control focus happens after the fetch
  // resolves below so we aim focus at an ENABLED control, not one that's
  // still disabled from the in-flight fetch.
  if (typeof _deps.closeBtnEl.focus === 'function') {
    _deps.closeBtnEl.focus();
  }

  try {
    const prefs = await _deps.sendMessage(MSG_GET_PREFERENCES);
    _prefsSnapshot = prefs || {};
    _applySnapshotToControls(_prefsSnapshot);
    _setAllControlsDisabled(false);
    // Move focus to the first registered control once it's enabled. If the
    // dialog has no registered pref rows (Wave 0 scaffolding), focus stays
    // on the Close button per the baseline above.
    const firstFocusable = _firstFocusableControl();
    if (firstFocusable && typeof firstFocusable.focus === 'function') {
      firstFocusable.focus();
    }
  } catch (err) {
    // Load failure — user sees inline error, controls stay disabled.
    void err;
    _setInlineError('Could not load settings. Close and try again.');
  }
}

/** Close the dialog and restore focus to the trigger. */
export function closeSettingsDialog() {
  if (!_deps) return;
  _deps.dialogEl.hidden = true;
  _deps.overlayEl.hidden = true;
  _deps.overlayEl.setAttribute('aria-hidden', 'true');
  _deps.deactivateFocusTrap();
  _clearInlineError();
  if (_triggerEl && typeof _triggerEl.focus === 'function') {
    _triggerEl.focus();
  }
  _triggerEl = null;
}

/**
 * Register a toggle row. Call this ONCE at init time (before or after
 * settings-dialog init() — the row is held in the module's field registry
 * and paints into the dialog on every open).
 *
 * Wave 1 consumers (B-040, B-039) each call this once:
 *   renderToggle({
 *     key: 'autoCollapseSubGroups',
 *     label: 'Auto-collapse sub-groups',
 *     section: 'Behavior',
 *     defaultValue: false,
 *   });
 *
 * @param {Object} spec
 * @param {string} spec.key           Key inside the prefs partition (must be
 *                                    one of DEFAULT_PREFERENCES's keys).
 * @param {string} spec.label         User-visible label (plain text).
 * @param {string} [spec.section]     Grouping heading. Defaults to 'General'.
 * @param {boolean} [spec.defaultValue] Fallback paint when the pref is absent.
 * @returns {{ key: string, type: 'toggle' }} Handle for future extensions.
 */
export function renderToggle(spec) {
  _assertInit();
  _assertNewKey(spec && spec.key);
  const section = (spec && spec.section) || 'General';
  const defaultValue = !!(spec && spec.defaultValue);
  const field = {
    kind: 'toggle',
    key: spec.key,
    label: String(spec.label || ''),
    section,
    defaultValue,
    rowEl: null,
    inputEl: null,
    errorEl: null,
    _building: false,
  };
  _fields.push(field);
  _fieldsByKey.set(field.key, field);
  _buildFieldDom(field);
  return { key: field.key, type: 'toggle' };
}

/**
 * Register a select row. Wave 1 B-038 consumes this:
 *   renderSelect({
 *     key: 'displayMode',
 *     label: 'Open on click',
 *     options: [
 *       { value: 'sidepanel', label: 'Side panel' },
 *       { value: 'window',    label: 'Standalone window' },
 *     ],
 *     defaultValue: 'sidepanel',
 *   });
 *
 * @param {Object} spec
 * @param {string} spec.key
 * @param {string} spec.label
 * @param {string} [spec.section]
 * @param {Array<{value: string, label: string}>} spec.options
 * @param {string} [spec.defaultValue]
 * @returns {{ key: string, type: 'select' }}
 */
export function renderSelect(spec) {
  _assertInit();
  _assertNewKey(spec && spec.key);
  if (!spec || !Array.isArray(spec.options) || spec.options.length === 0) {
    throw new Error('renderSelect: options array is required');
  }
  const section = spec.section || 'General';
  const field = {
    kind: 'select',
    key: spec.key,
    label: String(spec.label || ''),
    section,
    options: spec.options.map((o) => ({ value: String(o.value), label: String(o.label) })),
    defaultValue: spec.defaultValue != null ? String(spec.defaultValue) : spec.options[0].value,
    rowEl: null,
    inputEl: null,
    errorEl: null,
    _building: false,
  };
  _fields.push(field);
  _fieldsByKey.set(field.key, field);
  _buildFieldDom(field);
  return { key: field.key, type: 'select' };
}

/* =========================================================================
   Test-only helpers (underscore-prefixed; not part of the public API).
   ========================================================================= */

/** Reset the module's in-memory state. Used by tests between cases. */
export function _resetForTest() {
  _deps = null;
  _fields.length = 0;
  _fieldsByKey.clear();
  _prefsSnapshot = null;
  _triggerEl = null;
  _onRuntimeMessage = null;
}

/** Fire a synthetic state-changed broadcast against the registered listener
 *  (tests only). Returns true when the listener was invoked. */
export function _fireBroadcastForTest(scope) {
  if (!_onRuntimeMessage) return false;
  _onRuntimeMessage({ type: MSG_STATE_CHANGED, payload: { scope } }, { id: _deps && _deps.runtime && _deps.runtime.id });
  return true;
}

/** Return the current registered fields (test introspection). */
export function _getFieldsForTest() {
  return _fields.slice();
}

/* =========================================================================
   Internal helpers
   ========================================================================= */

function _assertInit() {
  if (!_deps) throw new Error('settings-dialog.init() must run before renderToggle / renderSelect');
}

function _assertNewKey(key) {
  if (!key || typeof key !== 'string') throw new Error('settings-dialog: field key is required');
  if (_fieldsByKey.has(key)) throw new Error(`settings-dialog: key "${key}" already registered`);
}

/* UAT-9f-1 (S29): walk the overlay's children and report whether any
   sibling dialog (other than our own #settings-dialog) is currently
   visible. Returns false when the only un-hidden child IS the settings
   dialog (legitimate "already-open" — overlay guard above already handled
   that case). */
function _isAnyOtherDialogVisible() {
  if (!_deps || !_deps.overlayEl) return false;
  const overlay = _deps.overlayEl;
  const kids = overlay.children || overlay.childNodes || [];
  for (const child of kids) {
    if (!child || child === _deps.dialogEl) continue;
    if (child.hidden === false) return true;
  }
  return false;
}

function _firstFocusableControl() {
  for (const f of _fields) {
    if (f.inputEl && !f.inputEl.disabled) return f.inputEl;
  }
  return null;
}

function _setAllControlsDisabled(disabled) {
  for (const f of _fields) {
    if (f.inputEl) f.inputEl.disabled = !!disabled;
  }
}

function _clearInlineError() {
  if (!_deps) return;
  _deps.errorEl.textContent = '';
  _deps.errorEl.hidden = true;
}

function _setInlineError(msg) {
  if (!_deps) return;
  _deps.errorEl.textContent = msg;
  _deps.errorEl.hidden = false;
}

function _setRowError(field, msg) {
  if (!field || !field.errorEl) return;
  if (msg) {
    field.errorEl.textContent = msg;
    field.errorEl.hidden = false;
  } else {
    field.errorEl.textContent = '';
    field.errorEl.hidden = true;
  }
}

/** Read the current displayed value from the DOM control. */
function _readControlValue(field) {
  if (!field.inputEl) return undefined;
  if (field.kind === 'toggle') return !!field.inputEl.checked;
  if (field.kind === 'select') return field.inputEl.value;
  return undefined;
}

/** Write a pref value into the DOM control (does not dispatch a save). */
function _writeControlValue(field, value) {
  if (!field.inputEl) return;
  field._building = true;
  try {
    if (field.kind === 'toggle') {
      field.inputEl.checked = value === true;
    } else if (field.kind === 'select') {
      // Only accept values that are registered options; otherwise fall back
      // to the documented default (C-9 empty-state handling for corrupt
      // prefs that somehow slipped the backend validator).
      const valid = field.options.some((o) => o.value === value);
      field.inputEl.value = valid ? String(value) : String(field.defaultValue);
    }
  } finally {
    field._building = false;
  }
}

/** Paint the given snapshot into every registered control. Missing keys fall
 *  back to the field's documented default (AC6b). */
function _applySnapshotToControls(snapshot) {
  for (const f of _fields) {
    const hasKey = snapshot && Object.prototype.hasOwnProperty.call(snapshot, f.key);
    const value = hasKey ? snapshot[f.key] : f.defaultValue;
    _writeControlValue(f, value);
    _setRowError(f, null);
  }
}

/** Broadcast refresh: re-fetch prefs and paint into any open or closed
 *  dialog. When the dialog is open, values update in-place without disturbing
 *  the user's focus ring. */
async function _refreshFromBroadcast() {
  if (!_deps) return;
  try {
    const prefs = await _deps.sendMessage(MSG_GET_PREFERENCES);
    _prefsSnapshot = prefs || {};
    _applySnapshotToControls(_prefsSnapshot);
  } catch (err) {
    // Broadcast re-read failure is non-fatal; the next dialog open will
    // re-fetch or surface the error inline.
    void err;
  }
}

/**
 * Build the DOM nodes for a single field and append it into the correct
 * section fieldset (creating the fieldset when the section is new).
 */
function _buildFieldDom(field) {
  const doc = _getDoc();
  const contentEl = _deps.contentEl;

  // Find or create the section container.
  let sectionEl = _findSection(field.section);
  if (!sectionEl) {
    sectionEl = doc.createElement('fieldset');
    sectionEl.className = 'settings-section';
    sectionEl.dataset.section = field.section;
    const legend = doc.createElement('legend');
    legend.className = 'settings-section-legend';
    legend.textContent = field.section;
    sectionEl.appendChild(legend);
    contentEl.appendChild(sectionEl);
  }

  const row = doc.createElement('div');
  row.className = 'settings-row';
  row.dataset.prefKey = field.key;

  const label = doc.createElement('label');
  label.className = 'settings-row-label';
  label.textContent = field.label; /* textContent — never innerHTML */

  const controlWrap = doc.createElement('span');
  controlWrap.className = 'settings-row-control';

  let inputEl;
  if (field.kind === 'toggle') {
    // Pill-toggle wraps a real checkbox for full keyboard/AT semantics.
    const wrapper = doc.createElement('span');
    wrapper.className = 'settings-toggle';
    const checkbox = doc.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'settings-toggle__input';
    const track = doc.createElement('span');
    track.className = 'settings-toggle__track';
    track.setAttribute('aria-hidden', 'true');
    const thumb = doc.createElement('span');
    thumb.className = 'settings-toggle__thumb';
    thumb.setAttribute('aria-hidden', 'true');
    wrapper.appendChild(checkbox);
    wrapper.appendChild(track);
    wrapper.appendChild(thumb);
    controlWrap.appendChild(wrapper);
    inputEl = checkbox;
  } else {
    // Native <select> for AT + keyboard. Options are built from the field's
    // registered options array.
    const select = doc.createElement('select');
    select.className = 'settings-select';
    for (const opt of field.options) {
      const o = doc.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label; /* textContent — never innerHTML */
      select.appendChild(o);
    }
    controlWrap.appendChild(select);
    inputEl = select;
  }

  // Associate label with input for screen readers + click-to-focus.
  const inputId = `settings-ctl-${field.key}`;
  inputEl.id = inputId;
  label.setAttribute('for', inputId);

  // Inline per-row error surface (AC4 — revert + inline error on failure).
  const rowError = doc.createElement('span');
  rowError.className = 'settings-row-error';
  rowError.setAttribute('role', 'alert');
  rowError.setAttribute('aria-live', 'polite');
  rowError.hidden = true;

  row.appendChild(label);
  row.appendChild(controlWrap);
  row.appendChild(rowError);
  sectionEl.appendChild(row);

  field.rowEl = row;
  field.inputEl = inputEl;
  field.errorEl = rowError;

  // Change listener — dispatch partial patch with optimistic UI + revert on err.
  inputEl.addEventListener('change', () => {
    if (field._building) return; // suppress echo during programmatic paint
    _handleControlChange(field).catch(() => {
      /* handler owns its own error surface; prevent unhandled-rejection noise */
    });
  });
}

/** Dispatch MSG_SET_PREFERENCES with a single-key patch. On success, update
 *  the snapshot. On failure, revert the DOM and show an inline row error. */
async function _handleControlChange(field) {
  if (!_deps) return;
  _setRowError(field, null);
  _clearInlineError();

  const newValue = _readControlValue(field);
  const previousValue = _prefsSnapshot && Object.prototype.hasOwnProperty.call(_prefsSnapshot, field.key)
    ? _prefsSnapshot[field.key]
    : field.defaultValue;

  try {
    await _deps.sendMessage(MSG_SET_PREFERENCES, { patch: { [field.key]: newValue } });
    // Merge into snapshot so a subsequent broadcast round-trip is a no-op.
    if (!_prefsSnapshot || typeof _prefsSnapshot !== 'object') _prefsSnapshot = {};
    _prefsSnapshot[field.key] = newValue;
  } catch (err) {
    // Revert the control to the last-known-good value.
    _writeControlValue(field, previousValue);
    const code = err && err.code;
    // Friendly error text. ERR_SAFE_MODE gets a specific message; everything
    // else gets the generic AC4 copy.
    const msg = code === 'ERR_SAFE_MODE'
      ? 'Cannot save while in safe mode.'
      : 'Could not save. Try again.';
    _setRowError(field, msg);
  }
}

function _findSection(name) {
  if (!_deps || !_deps.contentEl || !_deps.contentEl.children) return null;
  for (const child of _deps.contentEl.children) {
    if (child && child.dataset && child.dataset.section === name) return child;
  }
  return null;
}

function _getDoc() {
  // Prefer ownerDocument of the content element so the module works in test
  // harnesses that pass FakeElement-style shims with their own createElement
  // hooks wired into globalThis.document. In production (real DOM), both
  // resolve to `document` — the extra indirection is a no-op.
  if (_deps && _deps.contentEl && _deps.contentEl.ownerDocument) {
    return _deps.contentEl.ownerDocument;
  }
  return globalThis.document;
}
