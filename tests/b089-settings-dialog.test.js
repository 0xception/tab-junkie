/**
 * b089-settings-dialog.test.js — B-089 R5 regression tests for the
 * Settings dialog scaffolding module (sidepanel/settings-dialog.js).
 *
 * Coverage targets (B-089 acceptance criteria):
 *   AC2  — dialog opens on trigger click, closes on Close button.
 *   AC3  — dialog fetches prefs via MSG_GET_PREFERENCES on open; error path
 *          sets inline error text.
 *   AC4  — control change dispatches MSG_SET_PREFERENCES with partial patch;
 *          failure path reverts the control and shows inline row error.
 *   AC5  — renderToggle and renderSelect helpers insert rows + label/input
 *          pairs correctly; duplicate key throws; missing options throws.
 *   AC6  — empty-state (C-9) paths: fresh install defaults, partial prefs,
 *          corrupt select value falls back to default.
 *   AC7  — accessibility scaffolding: aria attributes, label-for wiring,
 *          first-focusable control on open.
 *   AC8  — MSG_STATE_CHANGED (scope: 'preferences') re-reads prefs without
 *          reopening the dialog.
 *
 * No jsdom: the test uses a lightweight FakeElement shim (same pattern as
 * b027-group-header-menu.test.js + b028-selection-context-menu.test.js)
 * plus a spy sendMessage and a spy chrome.runtime.onMessage to exercise
 * the module with real behavior + deterministic inputs.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  init,
  openSettingsDialog,
  closeSettingsDialog,
  renderToggle,
  renderSelect,
  _resetForTest,
  _fireBroadcastForTest,
  _getFieldsForTest,
} from '../sidepanel/settings-dialog.js';

/* =========================================================================
   FakeElement — minimal DOM shim with ownerDocument so the module's
   createElement path resolves to the fake document.
   ========================================================================= */

class FakeElement {
  constructor(tag, doc) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.ownerDocument = doc;
    this.id = '';
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.type = '';
    this.childNodes = [];
    this.children = this.childNodes;
    this.dataset = {};
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this._parent = null;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(child) {
    if (child._parent) child._parent._removeChild(child);
    this.childNodes.push(child);
    child._parent = this;
    return child;
  }
  _removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) { this.childNodes.splice(i, 1); child._parent = null; }
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  _dispatch(type, eventArg) {
    for (const fn of (this._listeners[type] || [])) fn(eventArg);
  }
  /* Simulated interactions */
  click() { this._dispatch('click', {}); }
  triggerChange() { this._dispatch('change', {}); }
  focus() { this.ownerDocument._activeElement = this; }
  /* Recursive search for first descendant matching predicate (test helpers). */
  findByAttr(key, value) {
    if (this.dataset[key] === value) return this;
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) {
        const hit = c.findByAttr(key, value);
        if (hit) return hit;
      }
    }
    return null;
  }
  countDescendants(predicate) {
    let n = 0;
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) {
        if (predicate(c)) n += 1;
        n += c.countDescendants(predicate);
      }
    }
    return n;
  }
}

function makeFakeDocument() {
  const doc = {
    _activeElement: null,
    createElement(tag) { return new FakeElement(tag, doc); },
  };
  return doc;
}

/* =========================================================================
   Test harness — initialise the module with FakeElement DOM + spy helpers.
   ========================================================================= */

function setupHarness({ getPrefsResult, getPrefsError, setPrefsError } = {}) {
  const doc = makeFakeDocument();
  const overlayEl = new FakeElement('div', doc);
  overlayEl.hidden = true;

  const dialogEl = new FakeElement('div', doc);
  dialogEl.hidden = true;
  overlayEl.appendChild(dialogEl);

  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('span', doc);
  errorEl.hidden = true;
  const closeBtnEl = new FakeElement('button', doc);
  const triggerBtnEl = new FakeElement('button', doc);

  dialogEl.appendChild(contentEl);
  dialogEl.appendChild(errorEl);
  dialogEl.appendChild(closeBtnEl);

  const sendCalls = [];
  async function sendMessage(type, payload) {
    sendCalls.push({ type, payload });
    if (type === 'tj/getPreferences') {
      if (getPrefsError) throw getPrefsError;
      return getPrefsResult !== undefined ? getPrefsResult : {
        theme: 'system',
        displayMode: 'sidepanel',
        newTabOverride: false,
        autoCollapseSubGroups: false,
        importSkipDuplicates: true,
      };
    }
    if (type === 'tj/setPreferences') {
      if (setPrefsError) throw setPrefsError;
      return { ok: true };
    }
    return { ok: true };
  }

  const runtimeListeners = [];
  const runtime = {
    id: 'test-extension-id',
    onMessage: {
      addListener(fn) { runtimeListeners.push(fn); },
      removeListener(fn) {
        const i = runtimeListeners.indexOf(fn);
        if (i >= 0) runtimeListeners.splice(i, 1);
      },
    },
  };

  const focusTrapCalls = { activate: 0, deactivate: 0 };

  init({
    overlayEl,
    dialogEl,
    contentEl,
    errorEl,
    closeBtnEl,
    triggerBtnEl,
    activateFocusTrap: () => { focusTrapCalls.activate += 1; },
    deactivateFocusTrap: () => { focusTrapCalls.deactivate += 1; },
    sendMessage,
    runtime,
  });

  return {
    doc, overlayEl, dialogEl, contentEl, errorEl, closeBtnEl, triggerBtnEl,
    sendCalls, runtime, runtimeListeners, focusTrapCalls,
  };
}

beforeEach(() => {
  _resetForTest();
});

/* =========================================================================
   AC5 — renderToggle / renderSelect insert rows with correct DOM.
   ========================================================================= */

test('B-089 renderToggle: registers a field and inserts a row under the named section', () => {
  const h = setupHarness();
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups',
    section: 'Behavior',
    defaultValue: false,
  });

  const fields = _getFieldsForTest();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].kind, 'toggle');
  assert.equal(fields[0].key, 'autoCollapseSubGroups');

  // Section fieldset + legend created.
  const section = h.contentEl.findByAttr('section', 'Behavior');
  assert.ok(section, 'section fieldset exists');
  assert.equal(section.tagName, 'FIELDSET');
  const legend = section.childNodes.find((c) => c.tagName === 'LEGEND');
  assert.ok(legend, 'legend exists');
  assert.equal(legend.textContent, 'Behavior');

  // Row + label + checkbox exist.
  const row = section.findByAttr('prefKey', 'autoCollapseSubGroups');
  assert.ok(row, 'row exists for key');
  const label = row.childNodes.find((c) => c.tagName === 'LABEL');
  assert.ok(label, 'label exists');
  assert.equal(label.textContent, 'Auto-collapse sub-groups');

  // Label-for/input-id association (AC7 accessibility).
  assert.equal(label.getAttribute('for'), 'settings-ctl-autoCollapseSubGroups');
  assert.equal(fields[0].inputEl.id, 'settings-ctl-autoCollapseSubGroups');
  assert.equal(fields[0].inputEl.type, 'checkbox');
});

test('B-089 renderSelect: registers a select field with options', () => {
  setupHarness();
  renderSelect({
    key: 'displayMode',
    label: 'Open on click',
    section: 'Appearance',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Standalone window' },
    ],
    defaultValue: 'sidepanel',
  });

  const fields = _getFieldsForTest();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].kind, 'select');
  assert.equal(fields[0].inputEl.tagName, 'SELECT');
  const optionCount = fields[0].inputEl.childNodes.filter((c) => c.tagName === 'OPTION').length;
  assert.equal(optionCount, 2);
});

test('B-089 renderToggle: duplicate key throws to prevent accidental overwrites', () => {
  setupHarness();
  renderToggle({ key: 'newTabOverride', label: 'A' });
  assert.throws(
    () => renderToggle({ key: 'newTabOverride', label: 'B' }),
    /already registered/,
  );
});

test('B-089 renderSelect: missing options array throws (defensive)', () => {
  setupHarness();
  assert.throws(
    () => renderSelect({ key: 'displayMode', label: 'x' }),
    /options array is required/,
  );
});

test('B-089 renderToggle before init throws clearly', () => {
  _resetForTest();
  assert.throws(
    () => renderToggle({ key: 'theme', label: 'Theme' }),
    /init\(\) must run/,
  );
});

/* =========================================================================
   AC2 — open / close.
   ========================================================================= */

test('B-089 AC2: clicking the trigger opens the dialog + overlay', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  await openSettingsDialog(h.triggerBtnEl);

  assert.equal(h.dialogEl.hidden, false);
  assert.equal(h.overlayEl.hidden, false);
  assert.equal(h.overlayEl.getAttribute('aria-hidden'), null);
  assert.equal(h.focusTrapCalls.activate, 1);
});

test('B-089 AC2: close button hides the dialog + overlay + deactivates focus trap', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  await openSettingsDialog(h.triggerBtnEl);
  closeSettingsDialog();

  assert.equal(h.dialogEl.hidden, true);
  assert.equal(h.overlayEl.hidden, true);
  assert.equal(h.overlayEl.getAttribute('aria-hidden'), 'true');
  assert.equal(h.focusTrapCalls.deactivate, 1);
});

test('B-089 AC2: trigger click handler opens dialog (wired in init)', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  // The trigger's click handler schedules openSettingsDialog; we drive the
  // microtask queue by awaiting a resolved promise after dispatching.
  h.triggerBtnEl.click();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(h.dialogEl.hidden, false);
});

test('B-089 AC2: opening when overlay is already visible is a no-op (guards against dialog stacking)', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  h.overlayEl.hidden = false; // simulate another dialog already open

  await openSettingsDialog(h.triggerBtnEl);

  assert.equal(h.dialogEl.hidden, true, 'dialog stays hidden when overlay is occupied');
});

test('B-089 UAT-9f-1 (S29): opening Settings while another dialog sibling is visible is REFUSED (no stacking)', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  /* Mount an Add Bookmark dialog as a sibling of the Settings dialog under
     the shared overlay. This mirrors sidepanel.html:
       <div id="dialog-overlay">
         <div id="bookmark-dialog">…</div>
         <div id="settings-dialog">…</div>
         …
       </div>
     The Add Bookmark dialog is currently visible (hidden=false) and the
     overlay itself is also visible. The user clicks the gear → Settings
     must REFUSE to open per UAT-9f-1 (Option A: defensive guard at both
     overlay + sibling level). */
  const addBookmarkDialog = new (h.dialogEl.constructor)('div', h.doc);
  addBookmarkDialog.id = 'bookmark-dialog';
  addBookmarkDialog.hidden = false;
  h.overlayEl.appendChild(addBookmarkDialog);
  h.overlayEl.hidden = false;

  /* Click the gear (or call openSettingsDialog directly). */
  await openSettingsDialog(h.triggerBtnEl);

  /* Settings dialog stays hidden — refused. */
  assert.equal(h.dialogEl.hidden, true,
    'Settings dialog must stay closed while Add Bookmark sibling is visible');
  /* Add Bookmark stays open — settings did not steal the overlay. */
  assert.equal(addBookmarkDialog.hidden, false,
    'Add Bookmark dialog stays open — Settings did not stomp on it');
  /* Focus trap was NOT re-activated for settings (would break the
     existing trap on Add Bookmark). */
  assert.equal(h.focusTrapCalls.activate, 0,
    'focus trap not re-activated when settings open is refused');
});

/* =========================================================================
   AC3 — fetches prefs on open; error path.
   ========================================================================= */

test('B-089 AC3: open dispatches MSG_GET_PREFERENCES and paints control', async () => {
  const h = setupHarness({
    getPrefsResult: {
      theme: 'dark',
      displayMode: 'window',
      newTabOverride: true,
      autoCollapseSubGroups: true,
      importSkipDuplicates: true,
    },
  });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });
  renderSelect({
    key: 'displayMode',
    label: 'Display',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Window' },
    ],
    defaultValue: 'sidepanel',
  });

  await openSettingsDialog(h.triggerBtnEl);

  assert.ok(h.sendCalls.some((c) => c.type === 'tj/getPreferences'));
  const fields = _getFieldsForTest();
  const toggle = fields.find((f) => f.key === 'autoCollapseSubGroups');
  const select = fields.find((f) => f.key === 'displayMode');
  assert.equal(toggle.inputEl.checked, true, 'toggle reflects stored value');
  assert.equal(select.inputEl.value, 'window', 'select reflects stored value');
});

test('B-089 AC3: getPreferences failure surfaces inline error and leaves controls disabled', async () => {
  const err = new Error('no response');
  const h = setupHarness({ getPrefsError: err });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  await openSettingsDialog(h.triggerBtnEl);

  assert.equal(h.errorEl.hidden, false);
  assert.match(h.errorEl.textContent, /Could not load settings/);
  const fields = _getFieldsForTest();
  assert.equal(fields[0].inputEl.disabled, true);
});

/* =========================================================================
   AC4 — save on change, revert on error.
   ========================================================================= */

test('B-089 AC4: toggle change dispatches MSG_SET_PREFERENCES with partial patch', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });

  await openSettingsDialog(h.triggerBtnEl);
  const [field] = _getFieldsForTest();
  field.inputEl.checked = true;
  field.inputEl.triggerChange();

  // Let the change handler's microtasks settle.
  await new Promise((r) => setTimeout(r, 0));

  const setCall = h.sendCalls.find((c) => c.type === 'tj/setPreferences');
  assert.ok(setCall, 'setPreferences was dispatched');
  assert.deepEqual(setCall.payload, { patch: { autoCollapseSubGroups: true } });
});

test('B-089 AC4: setPreferences failure reverts the control and shows inline row error', async () => {
  const h = setupHarness({
    setPrefsError: Object.assign(new Error('boom'), { code: 'ERR_UNKNOWN' }),
    getPrefsResult: {
      theme: 'system', displayMode: 'sidepanel', newTabOverride: false,
      autoCollapseSubGroups: false, importSkipDuplicates: true,
    },
  });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });

  await openSettingsDialog(h.triggerBtnEl);
  const [field] = _getFieldsForTest();
  field.inputEl.checked = true;
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(field.inputEl.checked, false, 'control reverted to previous value');
  assert.equal(field.errorEl.hidden, false);
  assert.match(field.errorEl.textContent, /Could not save/);
});

test('B-089 AC4: ERR_SAFE_MODE produces the safe-mode-specific error copy', async () => {
  const h = setupHarness({
    setPrefsError: Object.assign(new Error('safe'), { code: 'ERR_SAFE_MODE' }),
  });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });
  await openSettingsDialog(h.triggerBtnEl);
  const [field] = _getFieldsForTest();
  field.inputEl.checked = true;
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));
  assert.match(field.errorEl.textContent, /safe mode/i);
});

test('B-089 AC4: programmatic paint during open does NOT dispatch a save (echo suppression)', async () => {
  const h = setupHarness({
    getPrefsResult: {
      theme: 'system', displayMode: 'sidepanel', newTabOverride: false,
      autoCollapseSubGroups: true, importSkipDuplicates: true,
    },
  });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });

  await openSettingsDialog(h.triggerBtnEl);
  // No setPreferences call should have been made, only getPreferences.
  const setCalls = h.sendCalls.filter((c) => c.type === 'tj/setPreferences');
  assert.equal(setCalls.length, 0);
});

/* =========================================================================
   AC6 — empty state (C-9) paths.
   ========================================================================= */

test('B-089 AC6a: fresh install (empty prefs object) falls back to registered defaults', async () => {
  const h = setupHarness({ getPrefsResult: {} });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });
  renderToggle({ key: 'newTabOverride', label: 'NTO', defaultValue: true });

  await openSettingsDialog(h.triggerBtnEl);

  const fields = _getFieldsForTest();
  assert.equal(fields[0].inputEl.checked, false);
  assert.equal(fields[1].inputEl.checked, true);
});

test('B-089 AC6b: partial prefs — missing key uses field default', async () => {
  const h = setupHarness({
    getPrefsResult: { theme: 'light' }, // no autoCollapseSubGroups
  });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });

  await openSettingsDialog(h.triggerBtnEl);

  assert.equal(_getFieldsForTest()[0].inputEl.checked, false);
});

test('B-089 AC6 select corrupt: unknown value in prefs falls back to field default', async () => {
  const h = setupHarness({ getPrefsResult: { displayMode: 'garbage' } });
  renderSelect({
    key: 'displayMode',
    label: 'Display',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Window' },
    ],
    defaultValue: 'sidepanel',
  });

  await openSettingsDialog(h.triggerBtnEl);
  assert.equal(_getFieldsForTest()[0].inputEl.value, 'sidepanel');
});

/* =========================================================================
   AC7 — accessibility scaffolding.
   ========================================================================= */

test('B-089 AC7: first focusable control receives focus on open', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });
  renderToggle({ key: 'newTabOverride', label: 'NTO' });

  await openSettingsDialog(h.triggerBtnEl);

  const fields = _getFieldsForTest();
  assert.equal(h.doc._activeElement, fields[0].inputEl);
});

test('B-089 AC7: no registered controls — focus falls back to Close button', async () => {
  const h = setupHarness();

  await openSettingsDialog(h.triggerBtnEl);

  assert.equal(h.doc._activeElement, h.closeBtnEl);
});

test('B-089 AC7: rendered toggle has aria-hidden decorative spans on track + thumb', () => {
  setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  const field = _getFieldsForTest()[0];
  // The checkbox sits inside a wrapper with two decorative spans (track, thumb).
  // Walk from the row → control wrap → wrapper → children.
  const ariaHiddenSpans = field.rowEl.countDescendants((el) => el.getAttribute('aria-hidden') === 'true');
  assert.ok(ariaHiddenSpans >= 2, 'track and thumb are marked aria-hidden');
});

/* =========================================================================
   AC8 — state-changed broadcast re-reads prefs without reopening.
   ========================================================================= */

test('B-089 AC8: MSG_STATE_CHANGED (scope preferences) re-reads and patches controls', async () => {
  let served = {
    theme: 'system', displayMode: 'sidepanel', newTabOverride: false,
    autoCollapseSubGroups: false, importSkipDuplicates: true,
  };
  const doc = makeFakeDocument();
  const overlayEl = new FakeElement('div', doc);
  overlayEl.hidden = true;
  const dialogEl = new FakeElement('div', doc);
  dialogEl.hidden = true;
  overlayEl.appendChild(dialogEl);
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('span', doc);
  errorEl.hidden = true;
  const closeBtnEl = new FakeElement('button', doc);
  const triggerBtnEl = new FakeElement('button', doc);
  dialogEl.appendChild(contentEl);
  dialogEl.appendChild(errorEl);
  dialogEl.appendChild(closeBtnEl);

  const sendCalls = [];
  async function sendMessage(type) {
    sendCalls.push({ type });
    if (type === 'tj/getPreferences') return served;
    return { ok: true };
  }
  const runtime = {
    id: 'test-extension-id',
    onMessage: {
      _l: [],
      addListener(fn) { this._l.push(fn); },
      removeListener() {},
    },
  };

  init({
    overlayEl, dialogEl, contentEl, errorEl, closeBtnEl, triggerBtnEl,
    activateFocusTrap: () => {},
    deactivateFocusTrap: () => {},
    sendMessage, runtime,
  });
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto', defaultValue: false });

  await openSettingsDialog(triggerBtnEl);
  const field = _getFieldsForTest()[0];
  assert.equal(field.inputEl.checked, false);

  // Mutate the served snapshot and fire a broadcast.
  served = { ...served, autoCollapseSubGroups: true };
  const ok = _fireBroadcastForTest('preferences');
  assert.equal(ok, true);

  // Let the async broadcast handler resolve.
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(field.inputEl.checked, true, 'broadcast refreshed the control');
});

test('B-089 AC8: broadcast from foreign extension (sender.id mismatch) is ignored', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  await openSettingsDialog(h.triggerBtnEl);
  // Capture sendCall count before broadcast.
  const baselineCalls = h.sendCalls.length;

  // Manually invoke the listener with a foreign sender — the listener should
  // return early without issuing another getPreferences fetch.
  assert.equal(h.runtimeListeners.length, 1);
  h.runtimeListeners[0]({ type: 'tj/stateChanged', payload: { scope: 'preferences' } }, { id: 'other-extension' });
  await new Promise((r) => setTimeout(r, 0));

  const newCalls = h.sendCalls.length - baselineCalls;
  assert.equal(newCalls, 0, 'foreign sender does not trigger a refetch');
});

test('B-089 AC8: broadcast for unrelated scope does NOT trigger a prefs re-read', async () => {
  const h = setupHarness();
  renderToggle({ key: 'autoCollapseSubGroups', label: 'Auto' });

  await openSettingsDialog(h.triggerBtnEl);
  const baseline = h.sendCalls.length;

  h.runtimeListeners[0]({ type: 'tj/stateChanged', payload: { scope: 'items' } }, { id: 'test-extension-id' });
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(h.sendCalls.length, baseline, 'items broadcast is ignored by settings-dialog');
});
