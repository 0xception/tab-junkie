/**
 * B-091 — Settings page field-helper module (forked + slimmed from B-089's
 * sidepanel/settings-dialog.js per §44.3 D-8).
 *
 * Owns the field registry + change-handler + broadcast subscription for the
 * full-page Settings surface (settings/settings.html). Unlike B-089 — which
 * managed dialog open/close lifecycle, focus trap, overlay sibling guards —
 * this module ONLY manages the field rows. The page itself IS the surface;
 * there is no open/close.
 *
 * Preserved verbatim from B-089:
 *   - Field registry (`_fields`, `_fieldsByKey`, `_prefsSnapshot`).
 *   - `_handleControlChange` optimistic-UI-with-revert pattern + ERR_SAFE_MODE
 *     friendly copy.
 *   - `_buildFieldDom` section discovery + row construction (label/input pair
 *     + per-row inline error span + label-for/input-id association).
 *   - `_writeControlValue` corrupt-value fallback for select fields.
 *   - Sender-id-validated, scope-filtered broadcast listener.
 *   - Test-only helpers (`_resetForTest`, `_fireBroadcastForTest`,
 *     `_getFieldsForTest`).
 *
 * Dropped vs B-089 (per §44.3 D-8):
 *   - Dialog/overlay/closeBtn/triggerBtn deps + activate/deactivateFocusTrap.
 *   - `openSettingsDialog` / `closeSettingsDialog` exports + their lifecycle.
 *   - The init-time click handler that opened the dialog.
 *   - The "refuse to stack" overlay-sibling guard (no overlay any more).
 *
 * New vs B-089:
 *   - `init({ contentEl, errorEl, sendMessage, runtime })` — slimmer dep set.
 *   - `getFirstFocusableControl()` — public helper for D-3 focus management.
 *   - `_setPageError` / `_clearPageError` — page-level banner instead of
 *     dialog-level inline span. Reads `_deps.errorEl` (banner text node).
 */

import { MSG_GET_PREFERENCES, MSG_SET_PREFERENCES, MSG_STATE_CHANGED } from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';

/* =========================================================================
   Module state
   ========================================================================= */

/** @type {null | {
 *   contentEl: any,
 *   errorEl: any,
 *   sendMessage: (type: string, payload?: any) => Promise<any>,
 *   runtime: any,
 * }} */
let _deps = null;

/** Ordered list of registered fields. Each entry owns its row DOM + metadata. */
const _fields = [];

/** Keyed lookup for fast patch-dispatch lookups. */
const _fieldsByKey = new Map();

/** Most recently loaded prefs snapshot (used on broadcast re-sync + revert). */
let _prefsSnapshot = null;

/** Broadcast listener reference so init() is idempotent. */
let _onRuntimeMessage = null;

/* =========================================================================
   Public API
   ========================================================================= */

/**
 * One-time initialisation. Called from settings/settings.js after
 * DOMContentLoaded. Idempotent: subsequent calls are no-ops so the broadcast
 * listener attaches exactly once. Tests call `_resetForTest()` between cases.
 *
 * @param {Object} deps
 * @param {any} deps.contentEl Container element where section <fieldset>s are
 *   discovered (or appended if a section is missing). Static fieldsets in
 *   settings.html are looked up by `data-section` attribute.
 * @param {any} deps.errorEl Top-of-page error-banner container. The forked
 *   module reads its `_text` child for message text and toggles the banner
 *   `hidden` attribute. The page also exposes a Reload button inside the
 *   banner — that button's click handler is owned by settings.js, not this
 *   module.
 * @param {(type: string, payload?: any) => Promise<any>} deps.sendMessage
 *   Promise wrapper around chrome.runtime.sendMessage.
 * @param {any} deps.runtime chrome.runtime (for onMessage + id).
 */
export function init(deps) {
  // Idempotency guard — same shape as B-089. `_resetForTest()` clears _deps.
  if (_deps) return;
  _deps = deps;

  // Broadcast listener — sender-id + scope-filtered. Pattern verbatim from
  // B-089 init() lines 99-115. Page-level GC handles cleanup on tab close
  // (per §44.3 D-5).
  if (
    !_onRuntimeMessage
    && deps.runtime
    && deps.runtime.onMessage
    && typeof deps.runtime.onMessage.addListener === 'function'
  ) {
    _onRuntimeMessage = (msg, sender) => {
      if (!sender || sender.id !== deps.runtime.id) return;
      if (!msg || msg.type !== MSG_STATE_CHANGED) return;
      const scope = msg.payload && msg.payload.scope;
      if (scope !== SCOPE.PREFERENCES) return;
      _refreshFromBroadcast().catch(() => {
        /* broadcast re-read failure is non-fatal; controls hold previous values. */
      });
    };
    deps.runtime.onMessage.addListener(_onRuntimeMessage);
  }
}

/**
 * Fetch prefs from the SW and paint controls. Returns the snapshot on success
 * and rejects on failure so the bootstrap (settings.js) can route to the
 * error banner + Reload button focus path (§44.3 D-3 error path).
 *
 * @returns {Promise<Object>} the prefs snapshot
 */
export async function loadPreferences() {
  _assertInit();
  _clearPageError();
  const prefs = await _deps.sendMessage(MSG_GET_PREFERENCES);
  _prefsSnapshot = prefs || {};
  _applySnapshotToControls(_prefsSnapshot);
  return _prefsSnapshot;
}

/**
 * Surface a top-of-page error banner. settings.js calls this on prefs-load
 * failure. The banner element + its Reload button live in settings.html;
 * this helper only flips visibility + writes message text.
 *
 * @param {string} msg User-visible error copy.
 */
export function showPageError(msg) {
  _setPageError(msg);
}

/**
 * Return the first focusable control's input element, or null if no fields
 * are registered. settings.js calls this after loadPreferences() resolves to
 * move focus to the first row (§44.3 D-3 success path).
 */
export function getFirstFocusableControl() {
  return _firstFocusableControl();
}

/**
 * Disable every registered field's input element. settings.js calls this on
 * `loadPreferences()` failure so controls stay non-interactive until the
 * Reload button is used (HIGH-1 / AC10(a) — controls must not accept edits
 * while no last-known-good prefs snapshot is available).
 */
export function disableAllControls() {
  _disableAllControls();
}

/**
 * Register a toggle row. Same signature as B-089's renderToggle — byte-for-byte
 * compatible so existing B-038 / B-040 specs continue to work.
 *
 * @param {Object} spec
 * @param {string} spec.key Pref key (must be in DEFAULT_PREFERENCES).
 * @param {string} spec.label User-visible label (plain text).
 * @param {string} [spec.section] Section name. Defaults to 'General'.
 * @param {boolean} [spec.defaultValue] Fallback paint when the pref is absent.
 * @returns {{ key: string, type: 'toggle' }}
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
 * Register a select row. Same signature as B-089's renderSelect.
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
  _onRuntimeMessage = null;
}

/** Fire a synthetic state-changed broadcast against the registered listener
 *  (tests only). Returns true when the listener was invoked. */
export function _fireBroadcastForTest(scope) {
  if (!_onRuntimeMessage) return false;
  _onRuntimeMessage(
    { type: MSG_STATE_CHANGED, payload: { scope } },
    { id: _deps && _deps.runtime && _deps.runtime.id },
  );
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
  if (!_deps) throw new Error('settings-fields.init() must run before renderToggle / renderSelect');
}

function _assertNewKey(key) {
  if (!key || typeof key !== 'string') throw new Error('settings-fields: field key is required');
  if (_fieldsByKey.has(key)) throw new Error(`settings-fields: key "${key}" already registered`);
}

function _firstFocusableControl() {
  for (const f of _fields) {
    if (f.inputEl && !f.inputEl.disabled) return f.inputEl;
  }
  return null;
}

function _clearPageError() {
  if (!_deps || !_deps.errorEl) return;
  // Banner element carries an optional `_text` child for message text. If
  // the banner is a plain element (no _text child), fall back to textContent
  // on the banner itself.
  const textNode = _resolveBannerTextNode(_deps.errorEl);
  if (textNode) textNode.textContent = '';
  _deps.errorEl.hidden = true;
}

function _setPageError(msg) {
  if (!_deps || !_deps.errorEl) return;
  const textNode = _resolveBannerTextNode(_deps.errorEl);
  if (textNode) textNode.textContent = String(msg);
  _deps.errorEl.hidden = false;
}

/* The banner is structured as <div id="settings-error-banner"><span
   id="settings-error-banner-text"></span><button>Reload</button></div>. The
   forked module writes the message into the inner <span> by querying via
   ownerDocument.getElementById when available; falls back to walking
   descendants by id in headless test setups where lookup-by-id is not wired.
   MEDIUM-1: never return the banner element itself — overwriting its
   textContent would destroy the Reload button. If neither lookup finds the
   text node, log + create-or-reuse a child <span> for the message instead. */
function _resolveBannerTextNode(banner) {
  // ownerDocument lookup (real DOM + most test harnesses).
  if (banner.ownerDocument && typeof banner.ownerDocument.getElementById === 'function') {
    const node = banner.ownerDocument.getElementById('settings-error-banner-text');
    if (node) return node;
  }
  // Fallback: look up directly by descendants' id (FakeElement test path).
  const descendant = _findDescendantById(banner, 'settings-error-banner-text');
  if (descendant) return descendant;
  // MEDIUM-1 defensive fallback: the canonical <span> child is missing. Warn
  // so any production occurrence is observable, then create or reuse a child
  // span. NEVER return the banner itself — that would overwrite the Reload
  // button when textContent is set.
  console.warn('[B-091] settings banner text node not found; defensive fallback engaged');
  const doc = banner.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') return null;
  const fallback = doc.createElement('span');
  fallback.id = 'settings-error-banner-text';
  fallback.className = 'settings-error-banner-text';
  // Insert before any existing children so the Reload button (typically last)
  // remains positioned correctly.
  const firstChild = banner.childNodes && banner.childNodes[0];
  if (firstChild && typeof banner.insertBefore === 'function') {
    banner.insertBefore(fallback, firstChild);
  } else if (typeof banner.appendChild === 'function') {
    banner.appendChild(fallback);
  } else {
    return null;
  }
  return fallback;
}

function _findDescendantById(root, id) {
  const kids = root.children || root.childNodes || [];
  for (const c of kids) {
    if (c && c.id === id) return c;
    const hit = _findDescendantById(c, id);
    if (hit) return hit;
  }
  return null;
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
      // prefs that somehow slipped the backend validator). Verbatim from
      // B-089 line 397-401.
      const valid = field.options.some((o) => o.value === value);
      field.inputEl.value = valid ? String(value) : String(field.defaultValue);
    }
  } finally {
    field._building = false;
  }
}

/** Paint the given snapshot into every registered control. Missing keys fall
 *  back to the field's documented default (B-091 AC10c fresh-install path).
 *  Re-enables each control after writing — controls are built `disabled=true`
 *  per HIGH-1 / AC10(a) so the load-pending window cannot accept edits. */
function _applySnapshotToControls(snapshot) {
  for (const f of _fields) {
    const hasKey = snapshot && Object.prototype.hasOwnProperty.call(snapshot, f.key);
    const value = hasKey ? snapshot[f.key] : f.defaultValue;
    _writeControlValue(f, value);
    if (f.inputEl) f.inputEl.disabled = false;
    _setRowError(f, null);
  }
}

/** Disable every registered control's input element (HIGH-1 / AC10(a)
 *  load-failure path: keep controls non-interactive until the user reloads). */
function _disableAllControls() {
  for (const f of _fields) {
    if (f && f.inputEl) f.inputEl.disabled = true;
  }
}

/** Broadcast refresh: re-fetch prefs and paint into the live page. Focus is
 *  NOT moved by this path — the user's focus ring stays where they put it. */
async function _refreshFromBroadcast() {
  if (!_deps) return;
  try {
    const prefs = await _deps.sendMessage(MSG_GET_PREFERENCES);
    _prefsSnapshot = prefs || {};
    _applySnapshotToControls(_prefsSnapshot);
  } catch (err) {
    // Broadcast re-read failure is non-fatal; controls keep prior values.
    void err;
  }
}

/**
 * Build the DOM nodes for a single field and append it into the correct
 * section <fieldset> (lookup by `data-section` attribute on the static
 * settings.html scaffold; fallback to creating one if absent).
 *
 * Verbatim port of B-089 _buildFieldDom (lines 439-529) minus the
 * `_clearInlineError` call (which became `_clearPageError` and is now
 * triggered separately at change-time, not row-build-time).
 */
function _buildFieldDom(field) {
  const doc = _getDoc();
  const contentEl = _deps.contentEl;

  // Find the static section in settings.html OR create a new fieldset (test
  // harness path / future Wave 1 sections that don't exist in HTML yet).
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

  // HIGH-1 / AC10(a): start every control disabled. _applySnapshotToControls
  // re-enables on successful load; disableAllControls() (called by
  // settings.js's catch path) keeps them disabled on load failure until the
  // user clicks Reload.
  inputEl.disabled = true;

  // Inline per-row error surface (optimistic-revert path).
  // role="alert" implies aria-live="assertive" — drop the explicit
  // aria-live="polite" so AT users get consistent assertive interruption
  // (HIGH-3: NVDA honors aria-live, JAWS honors role; the contradiction
  // produced split AT behavior). Save errors are time-critical → assertive.
  const rowError = doc.createElement('span');
  rowError.className = 'settings-row-error';
  rowError.setAttribute('role', 'alert');
  rowError.id = `settings-err-${field.key}`;
  rowError.hidden = true;
  // §44.7 accessibility plan — every control gets aria-describedby pointing
  // at its inline row error.
  inputEl.setAttribute('aria-describedby', rowError.id);

  row.appendChild(label);
  row.appendChild(controlWrap);
  row.appendChild(rowError);
  sectionEl.appendChild(row);

  field.rowEl = row;
  field.inputEl = inputEl;
  field.errorEl = rowError;

  // Change listener — dispatch partial patch with optimistic UI + revert.
  inputEl.addEventListener('change', () => {
    if (field._building) return; // suppress echo during programmatic paint
    _handleControlChange(field).catch(() => {
      /* handler owns its own error surface; prevent unhandled-rejection noise */
    });
  });
}

/** Dispatch MSG_SET_PREFERENCES with a single-key patch. On success, update
 *  the snapshot. On failure, revert the DOM and show an inline row error.
 *  Verbatim port of B-089 _handleControlChange (lines 533-559). */
async function _handleControlChange(field) {
  if (!_deps) return;
  _setRowError(field, null);
  _clearPageError();

  const newValue = _readControlValue(field);
  const previousValue = _prefsSnapshot && Object.prototype.hasOwnProperty.call(_prefsSnapshot, field.key)
    ? _prefsSnapshot[field.key]
    : field.defaultValue;

  try {
    await _deps.sendMessage(MSG_SET_PREFERENCES, { patch: { [field.key]: newValue } });
    if (!_prefsSnapshot || typeof _prefsSnapshot !== 'object') _prefsSnapshot = {};
    _prefsSnapshot[field.key] = newValue;
  } catch (err) {
    _writeControlValue(field, previousValue);
    const code = err && err.code;
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
  if (_deps && _deps.contentEl && _deps.contentEl.ownerDocument) {
    return _deps.contentEl.ownerDocument;
  }
  return globalThis.document;
}
