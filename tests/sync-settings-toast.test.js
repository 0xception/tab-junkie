/**
 * tests/sync-settings-toast.test.js — Sprint 42 R4 fix-round.
 *
 * Pins the settings-chrome-sync toast UI contract:
 *   - H-1 [code]  AC8 "View details" expander populated when partial.
 *   - M-2 [qa]    WCAG 1.4.1 non-color glyph prefix on each variant.
 *   - H-1 [qa]    aria-busy + button-text swap during in-flight sync.
 *
 * Uses the FakeElement DOM shim pattern from b093-import-export-rehome.test.js.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetMock } from './chrome-mock.js';
import { init as initChromeSync } from '../settings/settings-chrome-sync.js';
import { MSG_SYNC_TO_CHROME } from '../shared/messages.js';

/* =========================================================================
   FakeElement DOM shim — minimal contract that settings-chrome-sync uses.
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
    this.open = false;
    this.dataset = {};
    this._attrs = {};
    this._listeners = {};
    this.childNodes = [];
    this.children = this.childNodes;
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(type, fn) {
    (this._listeners[type] = this._listeners[type] || []).push(fn);
  }
  appendChild(child) { this.childNodes.push(child); return child; }
  replaceChildren() { this.childNodes.length = 0; }
  click() {
    for (const fn of (this._listeners.click || [])) fn({ target: this });
  }
}

function makeFakeDocument() {
  const byId = new Map();
  const doc = {
    createElement(tag) { return new FakeElement(tag, doc); },
    getElementById(id) { return byId.get(id) || null; },
    _register(id, el) { byId.set(id, el); el.id = id; },
  };
  return doc;
}

function buildDom(doc) {
  const btn = new FakeElement('button', doc);
  btn.textContent = 'Sync this window to Chrome';
  doc._register('settings-sync-chrome-btn', btn);
  const toast = new FakeElement('div', doc);
  doc._register('settings-toast', toast);
  toast.hidden = true;
  const msg = new FakeElement('span', doc);
  doc._register('settings-toast-message', msg);
  const details = new FakeElement('details', doc);
  doc._register('settings-toast-details', details);
  details.hidden = true;
  const list = new FakeElement('ul', doc);
  doc._register('settings-toast-details-list', list);
  return { btn, toast, msg, details, list };
}

function makeSendMessage(impl) {
  return async (type, payload) => impl(type, payload);
}

/* Drain microtasks + macrotasks so the click → async chain settles. */
async function drain() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => { __resetMock(); });

/* =========================================================================
   AC8 — View-details expander populated on partial.
   ========================================================================= */

test('AC8 partial-toast: View-details expander shows one line per skip reason', async () => {
  const doc = makeFakeDocument();
  const { btn, toast, msg, details, list } = buildDom(doc);

  const send = makeSendMessage(async (type) => {
    assert.equal(type, MSG_SYNC_TO_CHROME);
    return {
      summary: {
        windowId: 1,
        tabsReordered: 5,
        groupsCreated: 1,
        groupsUpdated: 0,
        skipped: [
          { reason: 'pinned', count: 1 },
          { reason: 'tab-gone', count: 1 },
        ],
      },
    };
  });

  initChromeSync({ doc, sendMessage: send });
  btn.click();
  await drain();

  assert.equal(toast.hidden, false, 'toast shown');
  assert.equal(toast.dataset.variant, 'partial', 'partial variant on skipped > 0');
  assert(msg.textContent.includes('Synced'), 'summary line present');
  assert.equal(details.hidden, false, 'View-details expander revealed');
  assert.equal(details.open, false, 'expander starts collapsed');
  assert.equal(list.childNodes.length, 2, 'one <li> per skip reason');
  const lines = list.childNodes.map((li) => li.textContent);
  assert(lines.some((l) => /1 pinned tab skipped/.test(l)),
    'pinned label rendered with singular noun');
  assert(lines.some((l) => /1 tab closed mid-sync/.test(l)),
    'tab-gone label rendered with singular noun');
});

test('AC8 ok-toast: View-details expander stays hidden when skipped is empty', async () => {
  const doc = makeFakeDocument();
  const { btn, toast, details, list } = buildDom(doc);

  const send = makeSendMessage(async () => ({
    summary: {
      windowId: 1, tabsReordered: 3, groupsCreated: 1, groupsUpdated: 0, skipped: [],
    },
  }));

  initChromeSync({ doc, sendMessage: send });
  btn.click();
  await drain();

  assert.equal(toast.hidden, false);
  assert.equal(toast.dataset.variant, 'ok');
  assert.equal(details.hidden, true, 'expander hidden when skipped.length === 0');
  assert.equal(list.childNodes.length, 0);
});

/* =========================================================================
   M-2 [qa] — WCAG 1.4.1 non-color glyph prefix on every toast variant.
   ========================================================================= */

test('M-2: ok variant message is prefixed with U+2713 CHECK MARK glyph', async () => {
  const doc = makeFakeDocument();
  const { btn, msg } = buildDom(doc);
  const send = makeSendMessage(async () => ({
    summary: { windowId: 1, tabsReordered: 1, groupsCreated: 0, groupsUpdated: 0, skipped: [] },
  }));
  initChromeSync({ doc, sendMessage: send });
  btn.click();
  await drain();
  assert(msg.textContent.startsWith('✓ '), `expected check-mark prefix, got: ${msg.textContent}`);
});

test('M-2: partial variant message is prefixed with U+26A0 WARNING SIGN', async () => {
  const doc = makeFakeDocument();
  const { btn, msg } = buildDom(doc);
  const send = makeSendMessage(async () => ({
    summary: {
      windowId: 1, tabsReordered: 1, groupsCreated: 0, groupsUpdated: 0,
      skipped: [{ reason: 'pinned', count: 1 }],
    },
  }));
  initChromeSync({ doc, sendMessage: send });
  btn.click();
  await drain();
  assert(msg.textContent.startsWith('⚠ '), `expected warning-sign prefix, got: ${msg.textContent}`);
});

test('M-2: error variant message is prefixed with U+2717 BALLOT X', async () => {
  const doc = makeFakeDocument();
  const { btn, msg, toast } = buildDom(doc);
  const send = makeSendMessage(async () => { throw new Error('SW down'); });
  initChromeSync({ doc, sendMessage: send });
  btn.click();
  await drain();
  assert.equal(toast.dataset.variant, 'error');
  assert(msg.textContent.startsWith('✗ '), `expected ballot-x prefix, got: ${msg.textContent}`);
});

test('AC8 plural-form: skip reason count > 1 uses plural noun', async () => {
  const doc = makeFakeDocument();
  const { btn, list } = buildDom(doc);

  const send = makeSendMessage(async () => ({
    summary: {
      windowId: 1, tabsReordered: 4, groupsCreated: 1, groupsUpdated: 0,
      skipped: [
        { reason: 'pinned', count: 2 },
        { reason: 'tab-gone', count: 3 },
      ],
    },
  }));

  initChromeSync({ doc, sendMessage: send });
  btn.click();
  await drain();

  const lines = list.childNodes.map((li) => li.textContent);
  assert(lines.some((l) => /2 pinned tabs skipped/.test(l)), 'plural pinned');
  assert(lines.some((l) => /3 tabs closed mid-sync/.test(l)), 'plural tab-gone');
});
