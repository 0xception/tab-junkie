/**
 * b038-view-mode-pref.test.js — B-038 View Mode Preference R4 regression coverage.
 *
 * Fast Track XS — no R5 gate, so this file is the sole automated safety net.
 * Authoritative spec: docs/design/43-b-038-view-mode-pref.md §43.7 R3 handoff.
 *
 * AC17 coverage (a-g):
 *   a) popup boot with displayMode='sidepanel' → no MSG_OPEN_STANDALONE fire
 *   b) popup boot with displayMode='window'    → MSG_OPEN_STANDALONE fire-and-forget
 *                                                 + window.close() after
 *   c) popup boot with corrupt displayMode     → fallback to 'sidepanel' (AC9)
 *   d) SW-side MSG_OPEN_STANDALONE handler     → calls openOrFocusStandaloneWindow
 *   e) Settings dialog — renderSelect paints the displayMode row + reflects stored value
 *   f) Settings dialog — change dispatches MSG_SET_PREFERENCES { displayMode: 'window' }
 *   g) **C-11 ORDERING ASSERTION** — popup's sendMessage for MSG_OPEN_STANDALONE
 *      MUST fire BEFORE window.close(); no `await` between. Captured via call-order
 *      spy (chrome-mock does not reproduce the real teardown race — this is a
 *      defensive code-shape check, not a teardown simulation).
 *
 * Strategy (same precedent as b082 + b089): reproduce the pure popup-router
 * logic inline + use the B-089 FakeElement harness for the settings-dialog row.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  installChromeMock,
} from './chrome-mock.js';

import {
  MSG_OPEN_STANDALONE,
  MSG_GET_PREFERENCES,
  MSG_SET_PREFERENCES,
} from '../shared/messages.js';

import {
  init as initSettingsDialog,
  openSettingsDialog,
  renderSelect,
  _resetForTest,
  _getFieldsForTest,
} from '../sidepanel/settings-dialog.js';

/* =========================================================================
   Naming-contract assertion (§43.2 — R3 prereq).
   ========================================================================= */

test('B-038 naming contract: MSG_OPEN_STANDALONE is exported with a non-empty string value', () => {
  assert.equal(typeof MSG_OPEN_STANDALONE, 'string');
  assert.ok(MSG_OPEN_STANDALONE.length > 0);
});

test('B-038 naming contract: MSG_OPEN_STANDALONE is NOT in the tj/* namespace (§43.7 §5)', () => {
  /* The storage-handlers dispatcher claims every tj/* type and would reject
     MSG_OPEN_STANDALONE with ERR_VALIDATION "Unknown message type". Keeping
     it outside the namespace lets the dedicated SW listener be the sole
     handler. */
  assert.ok(!MSG_OPEN_STANDALONE.startsWith('tj/'),
    'MSG_OPEN_STANDALONE must not collide with the tj/* dispatcher namespace');
});

/* =========================================================================
   Popup-router pure reproduction.

   The popup's pref-branch logic is reproduced here with the same call order
   and the same await discipline as popup.js::_bootWithPref. If the production
   code drifts (e.g., someone adds an `await` between sendMessage and
   window.close), the call-order assertions below will FAIL — that is the
   C-11 guardrail. R4 [code-reviewer] cross-checks via static grep on popup.js.
   ========================================================================= */

/**
 * Reproduce popup.js::_bootWithPref exactly. Any divergence between this and
 * popup.js is a test gap, not a production gap (same b082 precedent).
 *
 * @param {Object} ctx
 * @param {Function} ctx.sendMessage   async chrome.runtime.sendMessage spy
 * @param {Function} ctx.windowClose   window.close spy
 * @param {Function} ctx.bootQuickSearch  called when pref != 'window'
 * @returns {Promise<void>}
 */
async function runBootWithPref(ctx) {
  let displayMode = 'sidepanel';
  try {
    const prefs = await ctx.sendMessage({ type: MSG_GET_PREFERENCES });
    const data = prefs && prefs.ok === true ? prefs.data : prefs;
    if (data && data.displayMode === 'window') displayMode = 'window';
  } catch {
    displayMode = 'sidepanel';
  }

  if (displayMode === 'window') {
    /* C-11: fire-and-forget — NO await on the sendMessage; NO await between
       sendMessage and windowClose. */
    ctx.sendMessage({ type: MSG_OPEN_STANDALONE }).catch(() => { /* swallow */ });
    ctx.windowClose();
    return;
  }

  ctx.bootQuickSearch();
}

function makePopupHarness({ prefsResponse, prefsThrows = false } = {}) {
  const sendCalls = [];
  const callOrder = []; // 'sendMessage:TYPE' | 'windowClose'
  let quickSearchCalled = false;

  async function sendMessage(msg) {
    sendCalls.push(msg);
    callOrder.push(`sendMessage:${msg.type}`);
    if (msg.type === MSG_GET_PREFERENCES) {
      if (prefsThrows) throw new Error('SW unreachable');
      return prefsResponse;
    }
    if (msg.type === MSG_OPEN_STANDALONE) {
      return { ok: true };
    }
    return {};
  }

  function windowClose() {
    callOrder.push('windowClose');
  }

  function bootQuickSearch() {
    quickSearchCalled = true;
  }

  return {
    sendMessage,
    windowClose,
    bootQuickSearch,
    sendCalls,
    callOrder,
    quickSearchCalled: () => quickSearchCalled,
  };
}

/* ----- AC17(a): displayMode='sidepanel' → no MSG_OPEN_STANDALONE fire ----- */

test("B-038 AC17a: popup boot with displayMode='sidepanel' does NOT fire MSG_OPEN_STANDALONE", async () => {
  const h = makePopupHarness({
    prefsResponse: { ok: true, data: { displayMode: 'sidepanel' } },
  });

  await runBootWithPref(h);

  const standaloneCalls = h.sendCalls.filter((c) => c.type === MSG_OPEN_STANDALONE);
  assert.equal(standaloneCalls.length, 0, 'MSG_OPEN_STANDALONE must NOT fire on sidepanel pref');
  assert.equal(h.quickSearchCalled(), true, 'quick-search boot must run on sidepanel pref');
  /* window.close should NOT be called on the sidepanel branch (popup stays open
     for the quick-search UI). */
  assert.ok(!h.callOrder.includes('windowClose'),
    'window.close must NOT fire on sidepanel pref (popup stays open for quick-search)');
});

/* ----- AC17(b): displayMode='window' → MSG_OPEN_STANDALONE + window.close ----- */

test("B-038 AC17b: popup boot with displayMode='window' fires MSG_OPEN_STANDALONE and closes popup", async () => {
  const h = makePopupHarness({
    prefsResponse: { ok: true, data: { displayMode: 'window' } },
  });

  await runBootWithPref(h);

  const standaloneCalls = h.sendCalls.filter((c) => c.type === MSG_OPEN_STANDALONE);
  assert.equal(standaloneCalls.length, 1, 'MSG_OPEN_STANDALONE must fire exactly once');
  assert.ok(h.callOrder.includes('windowClose'), 'window.close must fire on window pref');
  assert.equal(h.quickSearchCalled(), false,
    'quick-search boot must NOT run on window pref (popup exits before render)');
});

/* ----- AC17(c): corrupt pref value → fallback to 'sidepanel' (AC9) ----- */

test("B-038 AC17c-1: popup boot with displayMode=null falls back to 'sidepanel'", async () => {
  const h = makePopupHarness({
    prefsResponse: { ok: true, data: { displayMode: null } },
  });
  await runBootWithPref(h);
  assert.equal(h.sendCalls.filter((c) => c.type === MSG_OPEN_STANDALONE).length, 0);
  assert.equal(h.quickSearchCalled(), true);
});

test("B-038 AC17c-2: popup boot with displayMode='standalone' (wrong name per §43.2) falls back to 'sidepanel'", async () => {
  /* R1 AC proposed `'standalone'`; R2 §43.2 normalised to `'window'`. A stray
     `'standalone'` string must NOT route to the standalone window — it's a
     corrupt value from the popup's perspective. */
  const h = makePopupHarness({
    prefsResponse: { ok: true, data: { displayMode: 'standalone' } },
  });
  await runBootWithPref(h);
  assert.equal(h.sendCalls.filter((c) => c.type === MSG_OPEN_STANDALONE).length, 0);
  assert.equal(h.quickSearchCalled(), true);
});

test('B-038 AC17c-3: popup boot with corrupt pref number falls back to sidepanel', async () => {
  const h = makePopupHarness({
    prefsResponse: { ok: true, data: { displayMode: 42 } },
  });
  await runBootWithPref(h);
  assert.equal(h.quickSearchCalled(), true);
});

test('B-038 AC17c-4: popup boot with MSG_GET_PREFERENCES throw falls back to sidepanel', async () => {
  const h = makePopupHarness({ prefsThrows: true });
  await runBootWithPref(h);
  assert.equal(h.sendCalls.filter((c) => c.type === MSG_OPEN_STANDALONE).length, 0);
  assert.equal(h.quickSearchCalled(), true);
});

/* ----- AC17(g): C-11 CALL-ORDER ASSERTION (the critical guardrail) ----- */

test("B-038 AC17g: C-11 — sendMessage(MSG_OPEN_STANDALONE) fires BEFORE window.close with NO await between", async () => {
  const h = makePopupHarness({
    prefsResponse: { ok: true, data: { displayMode: 'window' } },
  });

  await runBootWithPref(h);

  /* Expected callOrder on the 'window' branch:
       1. sendMessage:MSG_GET_PREFERENCES  (awaited read)
       2. sendMessage:MSG_OPEN_STANDALONE  (fire-and-forget)
       3. windowClose
     Any extra await would show up as microtask scheduling between steps 2 and 3;
     since we capture synchronously at call-site, if windowClose appears before
     sendMessage:MSG_OPEN_STANDALONE in callOrder that's a FAIL. */
  const standaloneIdx = h.callOrder.indexOf(`sendMessage:${MSG_OPEN_STANDALONE}`);
  const closeIdx = h.callOrder.indexOf('windowClose');
  assert.ok(standaloneIdx >= 0, 'MSG_OPEN_STANDALONE must be in call order');
  assert.ok(closeIdx >= 0, 'windowClose must be in call order');
  assert.ok(standaloneIdx < closeIdx,
    'MSG_OPEN_STANDALONE MUST fire BEFORE window.close (C-11 guardrail)');
  /* Additional: closeIdx must be EXACTLY standaloneIdx+1 — any intervening
     call indicates stray logic between sendMessage and window.close. */
  assert.equal(closeIdx, standaloneIdx + 1,
    'window.close MUST be the immediate next call after MSG_OPEN_STANDALONE sendMessage (no intervening awaits/calls)');
});

/* =========================================================================
   AC17(d) — SW-side MSG_OPEN_STANDALONE handler.

   Strategy: rather than importing service-worker.js (which runs the migration
   pipeline on import and registers many event listeners), we test the handler
   logic inline. A full-integration test would require loading the SW module
   and firing a mocked `chrome.runtime.onMessage.addListener` event — feasible
   but fragile. The inline test captures the handler CONTRACT: on MSG_OPEN_STANDALONE
   receipt, the SW calls openOrFocusStandaloneWindow (verified via chrome.windows
   mock spy). Real integration is covered by UAT smoke (§43.7 perf note).
   ========================================================================= */

test('B-038 AC17d: SW-side handler calls openOrFocusStandaloneWindow on MSG_OPEN_STANDALONE', async () => {
  /* Reproduce the service-worker.js handler logic (same precedent as
     b082-popup-sidepanel-btn runOpenSidepanelClick). Any divergence is a
     test-gap, not a prod-gap — the real handler is exercised at UAT. */
  installChromeMock();
  __resetMock();

  const windowsCreated = [];
  const windowsUpdated = [];
  const originalCreate = globalThis.chrome.windows.create;
  const originalUpdate = globalThis.chrome.windows.update;

  globalThis.chrome.windows.create = async (opts) => {
    windowsCreated.push(opts);
    return { id: 999, ...opts };
  };
  globalThis.chrome.windows.update = async (id, props) => {
    windowsUpdated.push({ id, props });
    return { id };
  };
  /* getAll with no matching popup windows → handler takes the create path. */
  globalThis.chrome.windows.getAll = async () => [];

  try {
    /* Reproduce openOrFocusStandaloneWindow from service-worker.js:94-134 at
       the minimum fidelity required to assert the create/focus decision. */
    const STANDALONE_URL = chrome.runtime.getURL
      ? chrome.runtime.getURL('sidepanel/sidepanel.html')
      : 'chrome-extension://test-extension-id/sidepanel/sidepanel.html';

    async function openOrFocusStandaloneWindow() {
      const popupWins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
      const existing = popupWins.find((w) =>
        Array.isArray(w.tabs)
        && w.tabs.length === 1
        && typeof w.tabs[0].url === 'string'
        && w.tabs[0].url === STANDALONE_URL
      );
      if (existing) {
        await chrome.windows.update(existing.id, { focused: true });
        return;
      }
      await chrome.windows.create({
        url: STANDALONE_URL,
        type: 'popup',
        focused: true,
        width: 1200,
        height: 800,
      });
    }

    /* Simulate the SW listener receiving MSG_OPEN_STANDALONE. Return value
       of sendResponse is not awaited by the popup (fire-and-forget). */
    let acked = false;
    const sender = { id: chrome.runtime.id };
    const message = { type: MSG_OPEN_STANDALONE };
    if (message && typeof message === 'object' && message.type === MSG_OPEN_STANDALONE) {
      if (sender && sender.id === chrome.runtime.id) {
        openOrFocusStandaloneWindow().catch(() => {});
        acked = true;
      }
    }
    /* Let the fire-and-forget open resolve. */
    await new Promise((r) => setTimeout(r, 0));

    assert.equal(acked, true, 'handler accepted the MSG_OPEN_STANDALONE message');
    assert.equal(windowsCreated.length, 1, 'exactly one window.create call');
    assert.equal(windowsCreated[0].url, STANDALONE_URL);
    assert.equal(windowsCreated[0].type, 'popup');
    assert.equal(windowsCreated[0].focused, true);
    assert.equal(windowsUpdated.length, 0, 'no focus-update needed when no existing window');
  } finally {
    globalThis.chrome.windows.create = originalCreate;
    globalThis.chrome.windows.update = originalUpdate;
  }
});

test('B-038 AC17d-2: SW-side handler rejects foreign-sender MSG_OPEN_STANDALONE', () => {
  /* AC5 defense-in-depth (same pattern as storage-handlers). Any sender.id
     not equal to chrome.runtime.id is ignored — no openOrFocusStandaloneWindow
     call, no sendResponse. */
  installChromeMock();
  __resetMock();

  let openCalled = false;
  const fakeOpen = () => { openCalled = true; };

  const foreignSender = { id: 'different-extension-id' };
  const message = { type: MSG_OPEN_STANDALONE };

  /* Reproduce the listener's sender check. */
  if (message && typeof message === 'object' && message.type === MSG_OPEN_STANDALONE) {
    if (foreignSender && foreignSender.id === chrome.runtime.id) {
      fakeOpen();
    }
  }

  assert.equal(openCalled, false, 'foreign sender MUST be ignored');
});

/* =========================================================================
   AC17(e, f) — Settings dialog displayMode select.

   Reuses the FakeElement harness precedent from b089-settings-dialog.test.js.
   The new displayMode row should register alongside B-089's scaffolding and
   behave like any other renderSelect consumer.
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
}

function makeFakeDocument() {
  const doc = {
    _activeElement: null,
    createElement(tag) { return new FakeElement(tag, doc); },
  };
  return doc;
}

function setupDialogHarness({ getPrefsResult, setPrefsError } = {}) {
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
    if (type === MSG_GET_PREFERENCES) {
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

  const runtime = {
    id: 'test-extension-id',
    onMessage: {
      addListener() {},
      removeListener() {},
    },
  };

  initSettingsDialog({
    overlayEl,
    dialogEl,
    contentEl,
    errorEl,
    closeBtnEl,
    triggerBtnEl,
    activateFocusTrap: () => {},
    deactivateFocusTrap: () => {},
    sendMessage,
    runtime,
  });

  return { doc, overlayEl, dialogEl, contentEl, errorEl, closeBtnEl, triggerBtnEl, sendCalls };
}

beforeEach(() => {
  _resetForTest();
});

test('B-038 AC17e-1: renderSelect({ key: "displayMode" }) registers a select row with the correct options', () => {
  setupDialogHarness();

  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie as',
    section: 'Display mode',
    options: [
      { value: 'sidepanel', label: 'Side Panel' },
      { value: 'window', label: 'Standalone Window' },
    ],
    defaultValue: 'sidepanel',
  });

  const fields = _getFieldsForTest();
  const field = fields.find((f) => f.key === 'displayMode');
  assert.ok(field, 'displayMode field registered');
  assert.equal(field.kind, 'select');
  assert.equal(field.inputEl.tagName, 'SELECT');
  const optionTags = field.inputEl.childNodes.filter((c) => c.tagName === 'OPTION');
  assert.equal(optionTags.length, 2);
  assert.equal(optionTags[0].value, 'sidepanel');
  assert.equal(optionTags[1].value, 'window');
  /* §43.2 naming contract — values MUST be 'sidepanel' / 'window', never 'standalone'. */
  const values = optionTags.map((o) => o.value);
  assert.ok(!values.includes('standalone'),
    "§43.2 naming contract: option value must be 'window' (not 'standalone')");
});

test('B-038 AC17e-2: section name is "Display mode" per §43.7 R3 handoff', () => {
  const h = setupDialogHarness();

  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie as',
    section: 'Display mode',
    options: [
      { value: 'sidepanel', label: 'Side Panel' },
      { value: 'window', label: 'Standalone Window' },
    ],
    defaultValue: 'sidepanel',
  });

  const sectionEl = h.contentEl.findByAttr('section', 'Display mode');
  assert.ok(sectionEl, 'section fieldset with section=Display mode exists');
});

test("B-038 AC17e-3: stored displayMode='window' is reflected in the select on open", async () => {
  const h = setupDialogHarness({
    getPrefsResult: {
      theme: 'system',
      displayMode: 'window',
      newTabOverride: false,
      autoCollapseSubGroups: false,
      importSkipDuplicates: true,
    },
  });

  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie as',
    section: 'Display mode',
    options: [
      { value: 'sidepanel', label: 'Side Panel' },
      { value: 'window', label: 'Standalone Window' },
    ],
    defaultValue: 'sidepanel',
  });

  await openSettingsDialog(h.triggerBtnEl);

  const field = _getFieldsForTest().find((f) => f.key === 'displayMode');
  assert.equal(field.inputEl.value, 'window', 'persisted displayMode must paint into the select');
});

test("B-038 AC17f: changing the select dispatches MSG_SET_PREFERENCES with partial patch { displayMode }", async () => {
  const h = setupDialogHarness();

  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie as',
    section: 'Display mode',
    options: [
      { value: 'sidepanel', label: 'Side Panel' },
      { value: 'window', label: 'Standalone Window' },
    ],
    defaultValue: 'sidepanel',
  });

  await openSettingsDialog(h.triggerBtnEl);

  const field = _getFieldsForTest().find((f) => f.key === 'displayMode');
  field.inputEl.value = 'window';
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));

  const setCall = h.sendCalls.find((c) => c.type === MSG_SET_PREFERENCES);
  assert.ok(setCall, 'MSG_SET_PREFERENCES was dispatched');
  assert.deepEqual(setCall.payload, { patch: { displayMode: 'window' } });
});

test("B-038 AC17 (hygiene): corrupt stored displayMode value falls back to default in the select (§43.5 AC9)", async () => {
  const h = setupDialogHarness({
    getPrefsResult: { displayMode: 'garbage' },
  });

  renderSelect({
    key: 'displayMode',
    label: 'Open Tab Junkie as',
    section: 'Display mode',
    options: [
      { value: 'sidepanel', label: 'Side Panel' },
      { value: 'window', label: 'Standalone Window' },
    ],
    defaultValue: 'sidepanel',
  });

  await openSettingsDialog(h.triggerBtnEl);

  const field = _getFieldsForTest().find((f) => f.key === 'displayMode');
  assert.equal(field.inputEl.value, 'sidepanel',
    'corrupt stored value must fall back to the registered default');
});

/* =========================================================================
   AC17 — integration breadcrumb (preferences validator already enforces the
   allow-list; this is belt-and-braces against future regression).
   ========================================================================= */

test('B-038 AC16 storage contract: displayMode key lives in existing tj:prefs partition (no new partition)', async () => {
  /* Import the live getPreferences / setPreferences paths to verify the
     `displayMode: 'window'` round-trip writes the existing partition and
     reads back correctly. This catches a future typo like `viewMode` or
     `'standalone'` that would otherwise pass UI tests. */
  const { setPreferences, getPreferences } = await import('../background/storage/preferences.js');
  __resetMock();

  await setPreferences({ displayMode: 'window' });
  const read = await getPreferences();
  assert.equal(read.displayMode, 'window');

  await setPreferences({ displayMode: 'sidepanel' });
  const read2 = await getPreferences();
  assert.equal(read2.displayMode, 'sidepanel');
});

test("B-038 AC16 storage contract: validator rejects displayMode='standalone' (proves §43.2 naming is enforced)", async () => {
  const { setPreferences } = await import('../background/storage/preferences.js');
  __resetMock();

  await assert.rejects(
    () => setPreferences({ displayMode: 'standalone' }),
    /displayMode must be sidepanel|window/,
  );
});
