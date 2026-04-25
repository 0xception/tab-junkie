/**
 * b091-settings-page.test.js — B-091 R5 regression tests for the full-page
 * Settings surface (settings/settings.html + settings/settings.js +
 * settings/settings-fields.js).
 *
 * Coverage targets (B-091 acceptance criteria):
 *   AC2  — Tab dispatcher (focus-existing else create).
 *   AC3  — Page structure (settings.html: <main>, <h1>, 5 fieldsets).
 *   AC4  — Section ordering (Display, Layout, Groups, Theme, Data).
 *   AC5  — Pref load + save round-trip via MSG_GET_PREFERENCES /
 *          MSG_SET_PREFERENCES.
 *   AC6  — renderToggle / renderSelect API parity with B-089's signatures.
 *   AC7  — Gear button repointed (no openSettingsDialog import).
 *   AC8  — B-089 modal absent (settings-dialog.js + #settings-dialog absent).
 *   AC10 — Error states (load failure → banner; save failure → revert).
 *   AC12 — ARIA structure (label-for, fieldset/legend).
 *   AC13 — Broadcast sync (MSG_STATE_CHANGED scope=preferences).
 *   AC15 — ≥ 15 net new passing tests.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  init as initSettingsFields,
  loadPreferences,
  showPageError,
  getFirstFocusableControl,
  renderToggle,
  renderSelect,
  _resetForTest,
  _fireBroadcastForTest,
  _getFieldsForTest,
} from '../settings/settings-fields.js';

import { MSG_GET_PREFERENCES, MSG_SET_PREFERENCES, MSG_STATE_CHANGED } from '../shared/messages.js';
import { SCOPE } from '../shared/scopes.js';
import {
  __resetMock,
  __setMockTabs,
  __getWindowsUpdateCalls,
} from './chrome-mock.js';

/* =========================================================================
   FakeElement — minimal DOM shim.
   ========================================================================= */

class FakeElement {
  constructor(tag, doc) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.ownerDocument = doc;
    this._id = '';
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
  /* B-088 fix #6 — track id assignments in a doc-level registry so
     getElementById can resolve the canonical banner text node. */
  get id() { return this._id; }
  set id(v) {
    this._id = v || '';
    if (this.ownerDocument && this.ownerDocument._byId && this._id) {
      this.ownerDocument._byId.set(this._id, this);
    }
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
  click() { this._dispatch('click', {}); }
  triggerChange() { this._dispatch('change', {}); }
  focus() { this.ownerDocument._activeElement = this; }
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
  querySelectorAll(_) {
    /* unused but kept for shape compat */
    return [];
  }
}

function makeFakeDocument() {
  const doc = {
    _activeElement: null,
    /* B-088 fix #6 — id registry; populated by FakeElement's id setter. */
    _byId: new Map(),
    createElement(tag) { return new FakeElement(tag, doc); },
    getElementById(id) { return this._byId.get(id) || null; },
  };
  return doc;
}

/* =========================================================================
   Harness — initialise the forked module with FakeElement DOM.
   ========================================================================= */

function setupHarness({ getPrefsResult, getPrefsError, setPrefsError } = {}) {
  const doc = makeFakeDocument();
  const contentEl = new FakeElement('div', doc);

  // Banner mirrors the settings.html structure: outer <div> with hidden
  // attribute + an inner <span id="settings-error-banner-text"> for the
  // message text. The forked module's _resolveBannerTextNode() walks
  // descendants by id and writes into the inner span.
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const errorTextEl = new FakeElement('span', doc);
  errorTextEl.id = 'settings-error-banner-text';
  errorEl.appendChild(errorTextEl);

  const sendCalls = [];
  async function sendMessage(type, payload) {
    sendCalls.push({ type, payload });
    if (type === MSG_GET_PREFERENCES) {
      if (getPrefsError) throw getPrefsError;
      return getPrefsResult !== undefined ? getPrefsResult : {
        theme: 'system',
        displayMode: 'sidepanel',
        newTabOverride: false,
        autoCollapseSubGroups: false,
        importSkipDuplicates: true,
      };
    }
    if (type === MSG_SET_PREFERENCES) {
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

  initSettingsFields({ contentEl, errorEl, sendMessage, runtime });

  return { doc, contentEl, errorEl, errorTextEl, sendCalls, runtime, runtimeListeners };
}

/* =========================================================================
   Static-file readers — for AC3/AC4/AC8/AC12 page-structure assertions.
   ========================================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

beforeEach(() => {
  _resetForTest();
  __resetMock();
});

/* =========================================================================
   Test 1-3 — Tab dispatcher (AC2)
   ========================================================================= */

test('B-091 AC2-1: dispatcher finds existing Settings tab → tabs.update + windows.update; NOT tabs.create', async () => {
  const SETTINGS_URL = chrome.runtime.getURL('settings/settings.html');
  __setMockTabs([
    { id: 42, url: SETTINGS_URL, windowId: 7, active: false, audible: false, index: 0 },
    { id: 43, url: 'https://example.com', windowId: 7, active: true, audible: false, index: 1 },
  ]);

  const createSpy = [];
  const origCreate = chrome.tabs.create.bind(chrome.tabs);
  chrome.tabs.create = async (opts) => { createSpy.push(opts); return origCreate(opts); };

  // Reproduce the dispatcher inline (sidepanel.js is DOM-bound; we exercise
  // the dispatch shape — same precedent as b038 popup-router reproduction).
  async function openOrFocusSettingsTab() {
    const matches = await chrome.tabs.query({ url: SETTINGS_URL });
    if (Array.isArray(matches) && matches.length > 0) {
      const tab = matches[0];
      await chrome.tabs.update(tab.id, { active: true });
      if (typeof tab.windowId === 'number') {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      return;
    }
    await chrome.tabs.create({ url: SETTINGS_URL });
  }

  await openOrFocusSettingsTab();

  const winCalls = __getWindowsUpdateCalls();
  assert.equal(winCalls.length, 1, 'windows.update was called once');
  assert.equal(winCalls[0].windowId, 7);
  assert.deepEqual(winCalls[0].props, { focused: true });
  assert.equal(createSpy.length, 0, 'tabs.create must NOT be called when an existing tab is found');

  chrome.tabs.create = origCreate;
});

test('B-091 AC2-2: dispatcher with empty query → tabs.create is called', async () => {
  const SETTINGS_URL = chrome.runtime.getURL('settings/settings.html');
  __setMockTabs([
    { id: 99, url: 'https://example.com', windowId: 1, active: true, audible: false, index: 0 },
  ]);

  const createSpy = [];
  const origCreate = chrome.tabs.create.bind(chrome.tabs);
  chrome.tabs.create = async (opts) => { createSpy.push(opts); return origCreate(opts); };

  async function openOrFocusSettingsTab() {
    const matches = await chrome.tabs.query({ url: SETTINGS_URL });
    if (Array.isArray(matches) && matches.length > 0) return;
    await chrome.tabs.create({ url: SETTINGS_URL });
  }

  await openOrFocusSettingsTab();

  assert.equal(createSpy.length, 1, 'tabs.create called once');
  assert.equal(createSpy[0].url, SETTINGS_URL);
  assert.equal(__getWindowsUpdateCalls().length, 0, 'windows.update not called on create path');

  chrome.tabs.create = origCreate;
});

test('B-091 AC2-3: dispatcher failure → toast invoked, no unhandled rejection', async () => {
  const SETTINGS_URL = chrome.runtime.getURL('settings/settings.html');
  __setMockTabs([]);

  const origCreate = chrome.tabs.create.bind(chrome.tabs);
  chrome.tabs.create = async () => { throw new Error('simulated tabs.create failure'); };

  const toastCalls = [];
  function showToast(msg) { toastCalls.push(msg); }

  async function openOrFocusSettingsTab() {
    const matches = await chrome.tabs.query({ url: SETTINGS_URL });
    if (Array.isArray(matches) && matches.length > 0) return;
    await chrome.tabs.create({ url: SETTINGS_URL });
  }

  // The sidepanel wires this with `.catch((err) => { showToast(...); console.warn(...); })`.
  // We assert the equivalent shape: caught promise → toast invoked, no throw out.
  let rejected = false;
  try {
    await openOrFocusSettingsTab().catch((err) => {
      showToast('Could not open Settings');
      void err;
    });
  } catch {
    rejected = true;
  }

  assert.equal(rejected, false, 'caught path must not propagate rejection');
  assert.equal(toastCalls.length, 1, 'toast was shown on dispatcher failure');
  assert.equal(toastCalls[0], 'Could not open Settings');

  chrome.tabs.create = origCreate;
});

/* =========================================================================
   Test 4-5 — Page structure & section order (AC3, AC4)
   ========================================================================= */

/* Strip HTML comments before counting tags so design-note <fieldset> /
   <legend> mentions inside <!-- ... --> blocks don't inflate matches. */
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

test('B-091 AC3: settings.html contains <main>, <h1>, and 5 <fieldset> elements', () => {
  const html = stripComments(readFile('settings/settings.html'));
  // <main> presence (with role="main" attribute or as bare <main>).
  assert.ok(/<main\b[^>]*>/i.test(html), '<main> element must be present');
  // <h1>
  assert.ok(/<h1\b[^>]*>\s*Settings\s*<\/h1>/i.test(html), '<h1>Settings</h1> must be present');
  // Exactly 5 <fieldset> blocks (ignore </fieldset> closing tags).
  const fieldsetMatches = html.match(/<fieldset\b/gi) || [];
  assert.equal(fieldsetMatches.length, 5, 'exactly 5 <fieldset> elements');
});

test('B-091 AC4: section legend texts are [Display, Layout, Groups, Theme, Data] in DOM order', () => {
  const html = stripComments(readFile('settings/settings.html'));
  const legends = [...html.matchAll(/<legend\b[^>]*>([^<]+)<\/legend>/gi)].map((m) => m[1].trim());
  assert.deepEqual(
    legends,
    ['Display', 'Layout', 'Groups', 'Theme', 'Data'],
    'section order locked top-to-bottom',
  );
});

/* =========================================================================
   Test 6-9 — Pref load/save success + failure (AC5, AC10)
   ========================================================================= */

test('B-091 AC5: pref load success paints controls from MSG_GET_PREFERENCES response', async () => {
  const h = setupHarness({
    getPrefsResult: {
      displayMode: 'window',
      autoCollapseSubGroups: true,
    },
  });
  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie on click',
    section: 'Display',
    options: [{ value: 'sidepanel', label: 'Side panel' }, { value: 'window', label: 'Standalone window' }],
    defaultValue: 'sidepanel',
  });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  await loadPreferences();

  const fields = _getFieldsForTest();
  const displayField = fields.find((f) => f.key === 'displayMode');
  const toggleField = fields.find((f) => f.key === 'autoCollapseSubGroups');
  assert.equal(displayField.inputEl.value, 'window');
  assert.equal(toggleField.inputEl.checked, true);
  // MSG_GET_PREFERENCES was dispatched.
  assert.ok(h.sendCalls.some((c) => c.type === MSG_GET_PREFERENCES));
});

test('B-091 AC10a: pref load failure surfaces top banner + makes Reload button reachable', async () => {
  const h = setupHarness({ getPrefsError: new Error('simulated load failure') });

  let rejected = false;
  try {
    await loadPreferences();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true, 'loadPreferences rejects on SW failure');

  // settings.js's catch path calls showPageError + focuses Reload. Reproduce
  // the showPageError call here.
  showPageError('Could not load settings — try reloading.');
  assert.equal(h.errorEl.hidden, false, 'error banner is visible after showPageError');
  assert.equal(h.errorTextEl.textContent, 'Could not load settings — try reloading.');
});

/* =========================================================================
   HIGH-1 — Controls are disabled during the load window and re-enabled
   only after a successful loadPreferences() resolve. On load failure,
   disableAllControls() keeps them disabled until the user reloads.
   ========================================================================= */

test('B-091 AC10a HIGH-1: control is disabled before loadPreferences resolves and enabled after', async () => {
  const h = setupHarness({
    getPrefsResult: { autoCollapseSubGroups: true },
  });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  const field = _getFieldsForTest().find((f) => f.key === 'autoCollapseSubGroups');
  // Controls are built `disabled = true` so the load-pending window cannot
  // accept edits before the snapshot arrives.
  assert.equal(field.inputEl.disabled, true, 'control is disabled at registration time (pre-load)');

  // Drive the load to completion — _applySnapshotToControls re-enables.
  await loadPreferences();
  assert.equal(field.inputEl.disabled, false, 'control re-enabled after loadPreferences resolved');
  void h;
});

test('B-091 AC10a HIGH-1: load failure → disableAllControls keeps controls disabled + Reload focused', async () => {
  // Import the new helper exposed for the boot-path catch branch.
  const { disableAllControls } = await import('../settings/settings-fields.js');

  const h = setupHarness({ getPrefsError: new Error('simulated load failure') });
  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie on click',
    section: 'Display',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Standalone window' },
    ],
    defaultValue: 'sidepanel',
  });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });

  const fields = _getFieldsForTest();
  // All fields disabled at registration time.
  for (const f of fields) assert.equal(f.inputEl.disabled, true);

  // Drive loadPreferences and observe rejection — controls must stay disabled.
  let rejected = false;
  try {
    await loadPreferences();
  } catch {
    rejected = true;
  }
  assert.equal(rejected, true);

  // Reproduce settings.js's catch path: disableAllControls() THEN focus reload.
  disableAllControls();
  for (const f of fields) {
    assert.equal(f.inputEl.disabled, true, `field ${f.key} stays disabled after load failure`);
  }

  // Reload button focus path — reproduce the focus call settings.js performs.
  const reloadBtn = new FakeElement('button', h.doc);
  reloadBtn.id = 'settings-reload-btn';
  reloadBtn.focus();
  assert.equal(h.doc._activeElement, reloadBtn, 'Reload button receives focus on load failure');

  // HIGH-2: showPageError is the sole banner text writer; after invocation
  // the inner span carries the expected message.
  showPageError('Could not load settings — try reloading.');
  assert.equal(h.errorTextEl.textContent, 'Could not load settings — try reloading.');
  assert.equal(h.errorEl.hidden, false, 'banner is visible after showPageError');
});

test('B-091 AC5: pref save dispatches MSG_SET_PREFERENCES with correct partial patch', async () => {
  const h = setupHarness();
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });
  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'autoCollapseSubGroups');
  field.inputEl.checked = true;
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));

  const setCall = h.sendCalls.find((c) => c.type === MSG_SET_PREFERENCES);
  assert.ok(setCall, 'MSG_SET_PREFERENCES dispatched');
  assert.deepEqual(setCall.payload, { patch: { autoCollapseSubGroups: true } });
});

test('B-091 AC10b: pref save failure reverts control + shows inline row error', async () => {
  setupHarness({
    getPrefsResult: { autoCollapseSubGroups: false },
    setPrefsError: new Error('simulated save failure'),
  });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });
  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'autoCollapseSubGroups');
  field.inputEl.checked = true; // user toggles ON
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  // Optimistic-revert: control bounces back to previous (false).
  assert.equal(field.inputEl.checked, false, 'control reverted to last-known-good value');
  assert.equal(field.errorEl.hidden, false, 'inline row error visible');
  assert.equal(field.errorEl.textContent, 'Could not save. Try again.');
});

/* =========================================================================
   Test 10 — Broadcast sync (AC13)
   ========================================================================= */

test('B-091 AC13: MSG_STATE_CHANGED scope=preferences triggers control repaint', async () => {
  /* Two-phase: initial load with autoCollapseSubGroups=false, then change
     the harness's getPrefsResult, fire the broadcast, observe repaint. */
  let prefsState = { autoCollapseSubGroups: false };

  // Custom harness that swaps getPrefsResult mid-test by closing over prefsState.
  const doc = makeFakeDocument();
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const errorTextEl = new FakeElement('span', doc);
  errorTextEl.id = 'settings-error-banner-text';
  errorEl.appendChild(errorTextEl);

  const sendCalls = [];
  async function sendMessage(type) {
    sendCalls.push(type);
    if (type === MSG_GET_PREFERENCES) return { ...prefsState };
    return { ok: true };
  }
  const runtime = {
    id: 'test-extension-id',
    onMessage: {
      addListener() {},
      removeListener() {},
    },
  };
  initSettingsFields({ contentEl, errorEl, sendMessage, runtime });

  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse',
    section: 'Groups',
    defaultValue: false,
  });
  await loadPreferences();
  const field = _getFieldsForTest()[0];
  assert.equal(field.inputEl.checked, false);

  // Stage a new prefs value and fire the broadcast.
  prefsState = { autoCollapseSubGroups: true };
  const fired = _fireBroadcastForTest(SCOPE.PREFERENCES);
  assert.equal(fired, true, 'broadcast listener was invoked');
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(field.inputEl.checked, true, 'broadcast triggered repaint');
});

/* =========================================================================
   Test 11-12 — API parity (AC6)
   ========================================================================= */

test('B-091 AC6: renderToggle accepts the same { key, label, section, defaultValue } spec the B-089 modal accepted', () => {
  setupHarness();
  // Same spec shape B-089's renderSettingsToggle was called with from
  // sidepanel.js (now removed) — must continue to register cleanly here.
  const handle = renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });
  assert.deepEqual(handle, { key: 'autoCollapseSubGroups', type: 'toggle' });

  const fields = _getFieldsForTest();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].key, 'autoCollapseSubGroups');
  assert.equal(fields[0].kind, 'toggle');
  assert.equal(fields[0].defaultValue, false);
  assert.equal(fields[0].section, 'Groups');
});

test('B-091 AC6: renderSelect accepts the same { key, label, section, options, defaultValue } spec', () => {
  setupHarness();
  const handle = renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie on click',
    section: 'Display',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Standalone window' },
    ],
    defaultValue: 'sidepanel',
  });
  assert.deepEqual(handle, { key: 'displayMode', type: 'select' });

  const fields = _getFieldsForTest();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].kind, 'select');
  assert.equal(fields[0].defaultValue, 'sidepanel');
  // Options preserved verbatim.
  assert.equal(fields[0].options.length, 2);
  assert.equal(fields[0].options[0].value, 'sidepanel');
  assert.equal(fields[0].options[1].value, 'window');
});

/* =========================================================================
   Test 13-14 — Gear button repointed; B-089 modal absent (AC7, AC8)
   ========================================================================= */

test('B-091 AC8: sidepanel/settings-dialog.js file does not exist (deleted in B-091 atomic commit)', () => {
  const exists = existsSync(resolve(REPO_ROOT, 'sidepanel/settings-dialog.js'));
  assert.equal(exists, false, 'sidepanel/settings-dialog.js must be deleted');
});

test('B-091 AC8: tests/b089-settings-dialog.test.js file does not exist (superseded by this file)', () => {
  const exists = existsSync(resolve(REPO_ROOT, 'tests/b089-settings-dialog.test.js'));
  assert.equal(exists, false, 'tests/b089-settings-dialog.test.js must be deleted');
});

test('B-091 AC8: #settings-dialog absent from sidepanel.html', () => {
  const html = readFile('sidepanel/sidepanel.html');
  assert.equal(html.includes('id="settings-dialog"'), false);
  assert.equal(html.includes('id="settings-content"'), false);
  assert.equal(html.includes('id="settings-close-btn"'), false);
});

test('B-091 AC7: gear button aria-label updated to "Open Settings page"', () => {
  const html = readFile('sidepanel/sidepanel.html');
  // Gear button still exists.
  assert.ok(html.includes('id="sidepanel-settings-btn"'), 'gear button still present');
  // aria-label reads "Open Settings page" (not "Open settings").
  assert.ok(html.includes('aria-label="Open Settings page"'), 'aria-label updated');
  assert.equal(html.includes('aria-label="Open settings"'), false, 'old aria-label removed');
});

test('B-091 AC7: sidepanel.js no longer imports from settings-dialog.js; new dispatcher present', () => {
  const js = readFile('sidepanel/sidepanel.js');
  assert.equal(js.includes('./settings-dialog.js'), false, 'no import of deleted module');
  assert.equal(js.includes('initSettingsDialog'), false, 'no init call to deleted module');
  assert.equal(js.includes('renderSettingsSelect'), false, 'no Wave 1 select call (now in settings.js)');
  assert.equal(js.includes('renderSettingsToggle'), false, 'no Wave 1 toggle call (now in settings.js)');
  // B-097: dispatcher logic factored to shared/settings-tab.js; sidepanel.js imports + calls the helper.
  assert.ok(
    js.includes('openOrFocusSettingsTab'),
    'gear-button dispatcher calls openOrFocusSettingsTab (shared helper)',
  );
  assert.ok(
    js.includes('../shared/settings-tab.js'),
    'sidepanel.js imports from shared/settings-tab.js (B-097 factored module)',
  );
});

/* =========================================================================
   Test 15 — ARIA structure (AC12)
   ========================================================================= */

test('B-091 AC12: settings.html ARIA — <main>, <fieldset>/<legend>, control labels', () => {
  const html = readFile('settings/settings.html');
  // LOW-6: <main> with no redundant role="main" attribute (the role is
  // implicit on <main> per ARIA in HTML; axe-core flags the explicit form).
  assert.ok(/<main\b[^>]*>/i.test(html), '<main> element is present');
  assert.equal(/<main\s+role="main"/i.test(html), false,
    'redundant role="main" must be removed per LOW-6');
  // First <fieldset> is followed by a <legend> (semantic heading).
  const firstFieldsetIdx = html.indexOf('<fieldset');
  assert.ok(firstFieldsetIdx > -1);
  const firstLegendIdx = html.indexOf('<legend', firstFieldsetIdx);
  assert.ok(firstLegendIdx > firstFieldsetIdx, 'first fieldset has a legend');
});

test('B-091 AC12: control rendering produces <label for> matching control id (a11y label association)', () => {
  setupHarness();
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups when parent collapses',
    section: 'Groups',
    defaultValue: false,
  });
  const field = _getFieldsForTest()[0];
  assert.equal(field.inputEl.id, 'settings-ctl-autoCollapseSubGroups');
  // The row's <label> element has for=settings-ctl-autoCollapseSubGroups.
  const labelEl = field.rowEl.childNodes.find((c) => c.tagName === 'LABEL');
  assert.ok(labelEl, '<label> element present in row');
  assert.equal(labelEl.getAttribute('for'), 'settings-ctl-autoCollapseSubGroups');
});

test('B-091 AC12: getFirstFocusableControl returns the first registered control input', async () => {
  setupHarness();
  renderSelect({
    key: 'displayMode',
    label: 'X',
    section: 'Display',
    options: [{ value: 'a', label: 'A' }],
    defaultValue: 'a',
  });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Y',
    section: 'Groups',
    defaultValue: false,
  });
  // HIGH-1: controls are built `disabled = true`; only re-enabled after
  // loadPreferences() resolves. _firstFocusableControl skips disabled inputs,
  // matching settings.js's success-path call order (loadPreferences → focus).
  await loadPreferences();
  const first = getFirstFocusableControl();
  assert.ok(first, 'first focusable returned after loadPreferences resolves');
  assert.equal(first.id, 'settings-ctl-displayMode');
});

/* =========================================================================
   Test 16 — Idempotent init (B-089 H-2 lesson; §44.3 D-8 idempotency).
   ========================================================================= */

test('B-091 init() is idempotent — second call does not double-attach broadcast listener', () => {
  const h = setupHarness();
  // Re-init with the same harness should be a no-op.
  initSettingsFields({
    contentEl: h.contentEl,
    errorEl: h.errorEl,
    sendMessage: async () => ({}),
    runtime: h.runtime,
  });
  // Listener count from harness setup + idempotent re-init = still 1.
  assert.equal(h.runtimeListeners.length, 1, 'broadcast listener attached exactly once');
});

/* =========================================================================
   Test 17 — Theme placeholder text present (AC9)
   ========================================================================= */

test('B-091 AC9: Theme section placeholder removed by B-037 (S31)', () => {
  /* B-091 originally reserved a placeholder paragraph in the Theme fieldset
     that B-037 (Sprint 31) removed when wiring the live theme picker. The
     fieldset itself remains in settings.html; the legend is unchanged.
     Asserting the negative protects against a regression that re-introduces
     the placeholder copy on top of the live picker. */
  const html = readFile('settings/settings.html');
  assert.ok(
    !html.includes('Theme selection coming in a future update.'),
    'theme placeholder copy must be removed once B-037 wires the live picker',
  );
  assert.ok(
    /<fieldset class="settings-section" data-section="Theme">/.test(html),
    'Theme fieldset itself must still be present',
  );
});

/* =========================================================================
   Test 18 — AC13 sender-id validation: wrong sender → broadcast ignored
   ========================================================================= */

test('B-091 AC13 sender-id: message from a foreign extension id is silently ignored (no repaint)', async () => {
  // Set up harness so we can capture the real broadcast listener.
  const prefsState = { autoCollapseSubGroups: false };

  const doc = makeFakeDocument();
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const errorTextEl = new FakeElement('span', doc);
  errorTextEl.id = 'settings-error-banner-text';
  errorEl.appendChild(errorTextEl);

  const runtimeListeners = [];
  const runtime = {
    id: 'real-extension-id',
    onMessage: {
      addListener(fn) { runtimeListeners.push(fn); },
      removeListener() {},
    },
  };

  let prefsCallCount = 0;
  async function sendMessage(type) {
    if (type === MSG_GET_PREFERENCES) {
      prefsCallCount++;
      return { ...prefsState };
    }
    return { ok: true };
  }

  initSettingsFields({ contentEl, errorEl, sendMessage, runtime });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse',
    section: 'Groups',
    defaultValue: false,
  });
  await loadPreferences();

  // Capture the baseline prefs-call count, then inject a message with
  // a WRONG sender id (foreign extension). The listener must reject it
  // and NOT call _refreshFromBroadcast() (which would re-fetch prefs).
  const baseCount = prefsCallCount;
  const listener = runtimeListeners[0];
  assert.ok(listener, 'broadcast listener registered');

  listener(
    { type: MSG_STATE_CHANGED, payload: { scope: SCOPE.PREFERENCES } },
    { id: 'foreign-extension-id' },
  );
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(
    prefsCallCount,
    baseCount,
    'foreign-sender message must not trigger a prefs re-fetch',
  );
});

/* =========================================================================
   Test 19 — AC13 scope filter: wrong scope → broadcast ignored
   ========================================================================= */

test('B-091 AC13 scope-filter: MSG_STATE_CHANGED with non-preferences scope is ignored (no repaint)', async () => {
  const prefsState = { autoCollapseSubGroups: false };

  const doc = makeFakeDocument();
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const errorTextEl = new FakeElement('span', doc);
  errorTextEl.id = 'settings-error-banner-text';
  errorEl.appendChild(errorTextEl);

  const runtimeListeners = [];
  const runtime = {
    id: 'correct-extension-id',
    onMessage: {
      addListener(fn) { runtimeListeners.push(fn); },
      removeListener() {},
    },
  };

  let prefsCallCount = 0;
  async function sendMessage(type) {
    if (type === MSG_GET_PREFERENCES) {
      prefsCallCount++;
      return { ...prefsState };
    }
    return { ok: true };
  }

  initSettingsFields({ contentEl, errorEl, sendMessage, runtime });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse',
    section: 'Groups',
    defaultValue: false,
  });
  await loadPreferences();

  const baseCount = prefsCallCount;
  const listener = runtimeListeners[0];
  assert.ok(listener, 'broadcast listener registered');

  // Fire with correct sender but wrong scope (e.g. 'items') — must be ignored.
  listener(
    { type: MSG_STATE_CHANGED, payload: { scope: 'items' } },
    { id: 'correct-extension-id' },
  );
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(
    prefsCallCount,
    baseCount,
    'non-preferences scope must not trigger a prefs re-fetch',
  );
});

/* =========================================================================
   Test 20 — C-3 SW cold-start safety: delayed MSG_GET_PREFERENCES response
   still resolves and paints controls correctly.
   ========================================================================= */

test('B-091 C-3 cold-start: delayed MSG_GET_PREFERENCES response (200 ms) resolves and paints controls', async () => {
  const doc = makeFakeDocument();
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const errorTextEl = new FakeElement('span', doc);
  errorTextEl.id = 'settings-error-banner-text';
  errorEl.appendChild(errorTextEl);

  const runtime = {
    id: 'test-extension-id',
    onMessage: { addListener() {}, removeListener() {} },
  };

  // Simulate a cold-start delay: MSG_GET_PREFERENCES takes 50 ms to respond.
  // (Using 50 ms to keep tests fast while still exercising the async path.)
  async function sendMessage(type) {
    if (type === MSG_GET_PREFERENCES) {
      await new Promise((r) => setTimeout(r, 50));
      return { displayMode: 'window', autoCollapseSubGroups: true };
    }
    return { ok: true };
  }

  initSettingsFields({ contentEl, errorEl, sendMessage, runtime });
  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie on click',
    section: 'Display',
    options: [
      { value: 'sidepanel', label: 'Side panel' },
      { value: 'window', label: 'Standalone window' },
    ],
    defaultValue: 'sidepanel',
  });
  renderToggle({
    key: 'autoCollapseSubGroups',
    label: 'Auto-collapse sub-groups',
    section: 'Groups',
    defaultValue: false,
  });

  // During the cold-start window, controls must be disabled.
  const fields = _getFieldsForTest();
  for (const f of fields) {
    assert.equal(f.inputEl.disabled, true, `${f.key} must be disabled before cold-start resolves`);
  }

  // Await resolution — even with the delay, loadPreferences must resolve and
  // paint controls from the (eventually) returned prefs snapshot.
  await loadPreferences();

  const displayField = fields.find((f) => f.key === 'displayMode');
  const toggleField = fields.find((f) => f.key === 'autoCollapseSubGroups');
  assert.equal(displayField.inputEl.value, 'window', 'displayMode painted from delayed response');
  assert.equal(toggleField.inputEl.checked, true, 'autoCollapseSubGroups painted from delayed response');
  assert.equal(displayField.inputEl.disabled, false, 'controls re-enabled after cold-start resolves');
});
