/**
 * b093-import-export-rehome.test.js — B-093 R5 regression tests for the
 * Import / Export controls relocation (sidepanel header → Settings page
 * Data section).
 *
 * Coverage targets (B-093 acceptance criteria):
 *   AC1 — six DOM IDs (4 buttons + 2 file inputs) ABSENT from sidepanel header.
 *   AC2 — four new DOM IDs (settings-*-btn) + two new file-input IDs PRESENT
 *         in settings page; "Data" section heading present.
 *   AC3 — click handlers dispatch MSG_EXPORT_COLLECTION / MSG_IMPORT_COLLECTION
 *         with correct payload shapes (smoke); the destructive-confirmation
 *         dialog flow is preserved.
 *   AC4 — keyboard semantics retained: hidden file inputs have tabindex="-1".
 *   AC6 — manifest.json unchanged (covered indirectly — no new permissions).
 *
 * Test target: ≥ 6 net new passing tests.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { MSG_EXPORT_COLLECTION, MSG_IMPORT_COLLECTION } from '../shared/messages.js';
import { __resetMock } from './chrome-mock.js';
import { init as initImportExport, _internal } from '../settings/settings-import-export.js';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

/* =========================================================================
   FakeElement — minimal DOM shim mirroring the b091 test pattern.
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
    this.files = null;
    this.childNodes = [];
    this.children = this.childNodes;
    this.dataset = {};
    this.style = {};
    this._attrs = {};
    this._listeners = {};
    this._parent = null;
    this._clickHandled = 0;
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
  removeChild(child) { this._removeChild(child); }
  _removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) { this.childNodes.splice(i, 1); child._parent = null; }
  }
  replaceChildren() {
    for (const c of [...this.childNodes]) this._removeChild(c);
  }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  _dispatch(type, eventArg) {
    for (const fn of (this._listeners[type] || [])) fn(eventArg);
  }
  click() {
    this._clickHandled += 1;
    this._dispatch('click', { target: this });
  }
  triggerChange() { this._dispatch('change', { target: this }); }
  focus() { this.ownerDocument._activeElement = this; }
}

function makeFakeDocument() {
  const elementsById = new Map();
  const doc = {
    _activeElement: null,
    body: null,
    createElement(tag) { return new FakeElement(tag, doc); },
    createDocumentFragment() {
      const frag = new FakeElement('DOCUMENT-FRAGMENT', doc);
      return frag;
    },
    getElementById(id) { return elementsById.get(id) || null; },
    _register(id, el) { elementsById.set(id, el); el.id = id; },
    addEventListener() { /* no-op for tests */ },
  };
  doc.body = new FakeElement('body', doc);
  doc.body.children = doc.body.childNodes;
  return doc;
}

/* Build the minimum DOM the module needs: 4 buttons + 2 file inputs +
   confirm-dialog overlay + toast. Mirrors settings.html. */
function buildSettingsDom(doc) {
  const ids = [
    ['settings-export-html-btn', 'button'],
    ['settings-export-json-btn', 'button'],
    ['settings-import-html-btn', 'button'],
    ['settings-import-json-btn', 'button'],
    ['settings-import-file-input', 'input'],
    ['settings-import-json-file-input', 'input'],
  ];
  for (const [id, tag] of ids) {
    const el = new FakeElement(tag, doc);
    if (tag === 'input') el.type = 'file';
    doc._register(id, el);
    doc.body.appendChild(el);
  }
  /* Dialog overlay + confirm dialog + heading + body + buttons. */
  const overlay = new FakeElement('div', doc);
  doc._register('settings-dialog-overlay', overlay);
  overlay.hidden = true;
  doc.body.appendChild(overlay);
  const dialog = new FakeElement('div', doc);
  doc._register('settings-confirm-dialog', dialog);
  dialog.hidden = true;
  overlay.appendChild(dialog);
  const heading = new FakeElement('h2', doc);
  doc._register('settings-confirm-heading', heading);
  dialog.appendChild(heading);
  const body = new FakeElement('p', doc);
  doc._register('settings-confirm-body', body);
  dialog.appendChild(body);
  const cancel = new FakeElement('button', doc);
  doc._register('settings-confirm-cancel-btn', cancel);
  dialog.appendChild(cancel);
  const del = new FakeElement('button', doc);
  doc._register('settings-confirm-delete-btn', del);
  dialog.appendChild(del);
  /* Toast. */
  const toast = new FakeElement('div', doc);
  doc._register('settings-toast', toast);
  toast.hidden = true;
  doc.body.appendChild(toast);
  const toastMsg = new FakeElement('span', doc);
  doc._register('settings-toast-message', toastMsg);
  toast.appendChild(toastMsg);
  const toastDis = new FakeElement('button', doc);
  doc._register('settings-toast-dismiss', toastDis);
  toast.appendChild(toastDis);
}

beforeEach(() => {
  __resetMock();
  _internal.reset();
});

/* =========================================================================
   Test 1 — AC1: sidepanel header DOES NOT contain the six removed IDs.
   ========================================================================= */

test('B-093 AC1: sidepanel header has no #export-html-btn / #export-json-btn / #import-html-btn / #import-json-btn / #import-file-input / #import-json-file-input', () => {
  const html = readFile('sidepanel/sidepanel.html');
  assert.equal(html.includes('id="export-html-btn"'), false, '#export-html-btn must be removed from sidepanel header');
  assert.equal(html.includes('id="export-json-btn"'), false, '#export-json-btn must be removed from sidepanel header');
  assert.equal(html.includes('id="import-html-btn"'), false, '#import-html-btn must be removed from sidepanel header');
  assert.equal(html.includes('id="import-json-btn"'), false, '#import-json-btn must be removed from sidepanel header');
  assert.equal(html.includes('id="import-file-input"'), false, '#import-file-input must be removed from sidepanel header');
  assert.equal(html.includes('id="import-json-file-input"'), false, '#import-json-file-input must be removed from sidepanel header');
});

/* =========================================================================
   Test 2 — AC2: settings page contains the four new buttons + two new
   hidden file inputs, with aria-labels matching the originals.
   ========================================================================= */

test('B-093 AC2: settings/settings.html has #settings-export-html-btn, #settings-export-json-btn, #settings-import-html-btn, #settings-import-json-btn, #settings-import-file-input, #settings-import-json-file-input', () => {
  const html = readFile('settings/settings.html');
  assert.ok(html.includes('id="settings-export-html-btn"'), '#settings-export-html-btn must be present');
  assert.ok(html.includes('id="settings-export-json-btn"'), '#settings-export-json-btn must be present');
  assert.ok(html.includes('id="settings-import-html-btn"'), '#settings-import-html-btn must be present');
  assert.ok(html.includes('id="settings-import-json-btn"'), '#settings-import-json-btn must be present');
  assert.ok(html.includes('id="settings-import-file-input"'), '#settings-import-file-input must be present');
  assert.ok(html.includes('id="settings-import-json-file-input"'), '#settings-import-json-file-input must be present');
  /* aria-labels preserved from the originals (verbatim). */
  assert.ok(html.includes('aria-label="Export bookmarks to HTML"'), 'aria-label "Export bookmarks to HTML" preserved');
  assert.ok(html.includes('aria-label="Export bookmarks to JSON backup"'), 'aria-label "Export bookmarks to JSON backup" preserved');
  assert.ok(html.includes('aria-label="Import bookmarks from HTML"'), 'aria-label "Import bookmarks from HTML" preserved');
  assert.ok(html.includes('aria-label="Import bookmarks from JSON backup"'), 'aria-label "Import bookmarks from JSON backup" preserved');
});

test('B-093 AC2: "Data" section legend present in settings.html', () => {
  const html = readFile('settings/settings.html');
  assert.ok(/<legend[^>]*>\s*Data\s*<\/legend>/i.test(html), '"Data" legend must be present in DOM');
});

/* =========================================================================
   Test 3 — AC4: hidden file inputs retain tabindex="-1" + aria-hidden.
   ========================================================================= */

test('B-093 AC4: hidden file inputs in settings.html have tabindex="-1" + aria-hidden="true"', () => {
  const html = readFile('settings/settings.html');
  const fileInputRegex = /<input[^>]*id="settings-import-(?:json-)?file-input"[^>]*>/g;
  const matches = html.match(fileInputRegex) || [];
  assert.equal(matches.length, 2, 'exactly two hidden file inputs in the Data section');
  for (const m of matches) {
    assert.ok(/tabindex="-1"/.test(m), `tabindex="-1" preserved on ${m}`);
    assert.ok(/aria-hidden="true"/.test(m), `aria-hidden="true" preserved on ${m}`);
    assert.ok(/\bhidden\b/.test(m), `hidden attribute preserved on ${m}`);
  }
});

/* =========================================================================
   Test 4 — AC3 smoke: Export HTML click dispatches MSG_EXPORT_COLLECTION
   with format html.
   ========================================================================= */

test('B-093 AC3 smoke: #settings-export-html-btn click dispatches MSG_EXPORT_COLLECTION with format=html', async () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);

  const calls = [];
  async function sendMessage(type, payload) {
    calls.push({ type, payload });
    if (type === MSG_EXPORT_COLLECTION) {
      return { filename: 'tab-junkie-2026.html', mimeType: 'text/html', content: '<html></html>', itemCount: 0, groupCount: 0 };
    }
    return {};
  }

  /* Stub URL.createObjectURL/revokeObjectURL for the blob path — node has no
     URL on the global by default. */
  const origCreate = globalThis.URL.createObjectURL;
  const origRevoke = globalThis.URL.revokeObjectURL;
  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  /* Stub Blob — only constructor is needed. */
  if (typeof globalThis.Blob !== 'function') {
    globalThis.Blob = function Blob() {};
  }

  initImportExport({ doc, sendMessage });
  doc.getElementById('settings-export-html-btn').click();
  /* Microtask flush. */
  await new Promise((r) => setTimeout(r, 0));

  const exportCall = calls.find((c) => c.type === MSG_EXPORT_COLLECTION);
  assert.ok(exportCall, 'MSG_EXPORT_COLLECTION must be dispatched');
  assert.equal(exportCall.payload.format, 'html', 'payload.format must be html');

  globalThis.URL.createObjectURL = origCreate;
  globalThis.URL.revokeObjectURL = origRevoke;
});

/* =========================================================================
   Test 5 — AC3 smoke: Export JSON click dispatches with format json.
   ========================================================================= */

test('B-093 AC3 smoke: #settings-export-json-btn click dispatches MSG_EXPORT_COLLECTION with format=json', async () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);

  const calls = [];
  async function sendMessage(type, payload) {
    calls.push({ type, payload });
    if (type === MSG_EXPORT_COLLECTION) {
      return { filename: 'tab-junkie-backup-2026.json', mimeType: 'application/json', content: '{}', itemCount: 0, groupCount: 0 };
    }
    return {};
  }

  globalThis.URL.createObjectURL = () => 'blob:mock';
  globalThis.URL.revokeObjectURL = () => {};
  if (typeof globalThis.Blob !== 'function') globalThis.Blob = function Blob() {};

  initImportExport({ doc, sendMessage });
  doc.getElementById('settings-export-json-btn').click();
  await new Promise((r) => setTimeout(r, 0));

  const exportCall = calls.find((c) => c.type === MSG_EXPORT_COLLECTION);
  assert.ok(exportCall, 'MSG_EXPORT_COLLECTION must be dispatched');
  assert.equal(exportCall.payload.format, 'json', 'payload.format must be json');
});

/* =========================================================================
   Test 6 — AC3 smoke: Import HTML click triggers the hidden file input.
   ========================================================================= */

test('B-093 AC3 smoke: #settings-import-html-btn click triggers #settings-import-file-input.click()', () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);
  const sendMessage = async () => ({});
  initImportExport({ doc, sendMessage });

  const fileInput = doc.getElementById('settings-import-file-input');
  assert.equal(fileInput._clickHandled, 0, 'file input has not been clicked yet');
  doc.getElementById('settings-import-html-btn').click();
  assert.equal(fileInput._clickHandled, 1, 'Import HTML click must trigger the hidden file input click()');
  assert.equal(fileInput.accept, '.html,.htm,text/html', 'accept attribute must be set to the HTML filter');
});

/* =========================================================================
   Test 7 — AC3 smoke: Import JSON click triggers the JSON file input.
   ========================================================================= */

test('B-093 AC3 smoke: #settings-import-json-btn click triggers #settings-import-json-file-input.click()', () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);
  const sendMessage = async () => ({});
  initImportExport({ doc, sendMessage });

  const fileInput = doc.getElementById('settings-import-json-file-input');
  assert.equal(fileInput._clickHandled, 0);
  doc.getElementById('settings-import-json-btn').click();
  assert.equal(fileInput._clickHandled, 1, 'Import JSON click must trigger the hidden file input click()');
  assert.equal(fileInput.accept, 'application/json,.json', 'accept attribute must be set to the JSON filter');
});

/* =========================================================================
   Test 8 — AC3 smoke: file-input change fires _handleImportFile which
   dispatches MSG_IMPORT_COLLECTION (preview round-trip with non-empty
   counts → confirm dialog opens).
   ========================================================================= */

test('B-093 AC3 smoke: file-input change → MSG_IMPORT_COLLECTION dispatched (preview), confirm dialog opened', async () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);

  const calls = [];
  async function sendMessage(type, payload) {
    calls.push({ type, payload });
    if (type === MSG_IMPORT_COLLECTION) {
      /* Preview round-trip — non-empty so the confirm dialog opens. */
      return { itemsImported: 2, groupsImported: 1, duplicatesSkipped: 0, skipped: 0 };
    }
    /* Default for MSG_GET_PREFERENCES etc. */
    return { importSkipDuplicates: true };
  }

  /* FileReader stub — node-test environments don't have one. */
  globalThis.FileReader = function FileReader() {
    this.readAsText = function readAsText(_file) {
      const self = this;
      queueMicrotask(() => {
        self.result = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://x/">x</A></DL>';
        if (typeof self.onload === 'function') self.onload();
      });
    };
  };

  initImportExport({ doc, sendMessage });

  const fileInput = doc.getElementById('settings-import-file-input');
  fileInput.files = [{ name: 'bookmarks.html', size: 100 }];
  fileInput.triggerChange();
  /* Drain microtasks for FileReader.onload + sendMessage round-trip. */
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  const importCall = calls.find((c) => c.type === MSG_IMPORT_COLLECTION);
  assert.ok(importCall, 'MSG_IMPORT_COLLECTION must be dispatched on file change');
  assert.equal(importCall.payload.format, 'html');
  assert.equal(typeof importCall.payload.content, 'string');
  /* Preview round-trip carries no commit:true. */
  assert.notEqual(importCall.payload.commit, true);
  /* Confirm dialog opened — overlay no longer hidden. */
  assert.equal(doc.getElementById('settings-dialog-overlay').hidden, false,
    'confirm dialog overlay must be visible after preview resolves with non-empty counts');
});

/* =========================================================================
   Test 9 — AC3: oversize guard rejects > 5 MiB before dispatching anything.
   ========================================================================= */

test('B-093 AC3: file > 5 MiB is rejected with toast; MSG_IMPORT_COLLECTION never dispatched', async () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);

  const calls = [];
  async function sendMessage(type, payload) { calls.push({ type, payload }); return {}; }

  initImportExport({ doc, sendMessage });

  const fileInput = doc.getElementById('settings-import-file-input');
  fileInput.files = [{ name: 'huge.html', size: 6 * 1024 * 1024 }];
  fileInput.triggerChange();
  await new Promise((r) => setTimeout(r, 0));

  /* No MSG_IMPORT_COLLECTION dispatched. */
  assert.equal(calls.find((c) => c.type === MSG_IMPORT_COLLECTION), undefined,
    'MSG_IMPORT_COLLECTION must not be dispatched when file exceeds 5 MiB');
  /* Toast surface populated with the oversize message. */
  assert.equal(doc.getElementById('settings-toast').hidden, false, 'toast must be visible');
  assert.equal(doc.getElementById('settings-toast-message').textContent, 'File too large (max 5 MiB)');
});

/* =========================================================================
   Test 10 — M-1 fix: _wireOnce idempotency for document keydown listener.
   Calling init() twice must NOT double-attach the Escape keydown handler —
   only one _closeDialog call per Escape press even after two inits.
   ========================================================================= */

test('B-093 M-1: init() called twice does not double-attach document keydown — single Escape closes dialog once', () => {
  /* Custom doc that tracks its own addEventListener calls. */
  const elementsById = new Map();
  const docListeners = {};
  const doc = {
    _activeElement: null,
    body: null,
    _keydownCallCount: 0,
    createElement(tag) { return new FakeElement(tag, doc); },
    createDocumentFragment() { return new FakeElement('DOCUMENT-FRAGMENT', doc); },
    getElementById(id) { return elementsById.get(id) || null; },
    _register(id, el) { elementsById.set(id, el); el.id = id; },
    addEventListener(type, fn) {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
  };
  doc.body = new FakeElement('body', doc);
  doc.body.children = doc.body.childNodes;
  buildSettingsDom(doc);

  const sendMessage = async () => ({});

  /* First init — wires the document keydown once. */
  initImportExport({ doc, sendMessage });
  /* Second init (no reset) — _wireOnce must block the second addEventListener
     call by recognising the key already in _wireOnceSet. */
  initImportExport({ doc, sendMessage });

  /* Open the dialog manually so Escape has something to close. */
  const overlay = doc.getElementById('settings-dialog-overlay');
  overlay.hidden = false;

  /* Fire the Escape keydown — should trigger exactly ONE handler. */
  const escEvent = { key: 'Escape' };
  let closeCalls = 0;
  /* Patch hidden setter to count how many times overlay.hidden is set to true. */
  const originalHiddenDesc = Object.getOwnPropertyDescriptor(overlay, 'hidden');
  let _hiddenValue = overlay.hidden;
  Object.defineProperty(overlay, 'hidden', {
    get() { return _hiddenValue; },
    set(v) { _hiddenValue = v; if (v === true) closeCalls += 1; },
    configurable: true,
  });

  for (const fn of (docListeners['keydown'] || [])) fn(escEvent);

  Object.defineProperty(overlay, 'hidden', originalHiddenDesc || { value: _hiddenValue, writable: true, configurable: true });

  assert.equal(docListeners['keydown']?.length ?? 0, 1,
    'document.addEventListener("keydown") must be called exactly once after two inits');
  assert.equal(closeCalls, 1,
    'Escape keydown must trigger _closeDialog exactly once (overlay.hidden set to true once)');
});

/* =========================================================================
   Test 11 — M-2 fix: _importInFlight stays true while preview dialog is open.
   After file-select triggers _handleImportFile and the preview dialog opens,
   _importInFlight must be true (buttons stay disabled). Cancelling the dialog
   must clear it back to false.
   ========================================================================= */

test('B-093 M-2: _importInFlight stays true while confirm dialog open; cancel clears it', async () => {
  const doc = makeFakeDocument();
  buildSettingsDom(doc);

  async function sendMessage(type) {
    if (type === MSG_IMPORT_COLLECTION) {
      return { itemsImported: 3, groupsImported: 1, duplicatesSkipped: 0, skipped: 0 };
    }
    return { importSkipDuplicates: true };
  }

  globalThis.FileReader = function FileReader() {
    this.readAsText = function (_file) {
      const self = this;
      queueMicrotask(() => {
        self.result = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><A HREF="https://a/">a</A></DL>';
        if (typeof self.onload === 'function') self.onload();
      });
    };
  };

  initImportExport({ doc, sendMessage });

  const fileInput = doc.getElementById('settings-import-file-input');
  fileInput.files = [{ name: 'bm.html', size: 100 }];
  fileInput.triggerChange();

  /* Drain microtasks so _handleImportFile resolves up to dialog open. */
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  /* Dialog should be open and _importInFlight must still be true. */
  assert.equal(doc.getElementById('settings-dialog-overlay').hidden, false,
    'confirm dialog overlay must be visible');
  assert.equal(_internal.isImportInFlight(), true,
    '_importInFlight must be true while confirm dialog is open (M-2)');

  /* Cancel the dialog — _importInFlight must clear. */
  doc.getElementById('settings-confirm-cancel-btn').click();
  assert.equal(_internal.isImportInFlight(), false,
    '_importInFlight must be false after cancel (M-2)');
  assert.equal(doc.getElementById('settings-dialog-overlay').hidden, true,
    'confirm dialog overlay must be hidden after cancel');
});

/* =========================================================================
   Test 12 — AC6: manifest.json unchanged (no new permissions vs HEAD~1
   baseline). Fast Track S MUST NOT introduce new manifest entries.
   ========================================================================= */

test('B-093 AC6 (B-164 §69.3.3 update): manifest.json declares baseline permissions (incl. B-164 idle), no web_accessible_resources, no CSP relaxation', () => {
  const manifest = JSON.parse(readFile('manifest.json'));
  /* Pin baseline updated by B-164 §69.3.3 (idle permission added for
     chrome.idle.onStateChanged on-wake claim repair). B-093 itself
     adds no permissions. */
  assert.deepEqual(
    manifest.permissions.sort(),
    ['favicon', 'idle', 'search', 'sidePanel', 'storage', 'tabGroups', 'tabs'].sort(),
    'permissions list matches current baseline',
  );
  assert.equal(manifest.web_accessible_resources, undefined, 'no web_accessible_resources block');
  /* CSP must remain strict. */
  assert.equal(
    manifest.content_security_policy?.extension_pages,
    "script-src 'self'; object-src 'self'",
    'CSP unchanged',
  );
});
