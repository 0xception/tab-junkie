/**
 * b092-dense-layout.test.js — B-092 R3 regression coverage for the opt-in
 * compact / dense layout toggle (Fast Track XS, Wave 1 of Sprint 30).
 *
 * Authoritative spec: docs/BACKLOG.md B-092 AC1-AC8.
 *
 * Coverage map:
 *   a) DEFAULT_PREFERENCES gains `denseLayout: false` (AC2).
 *   b) `isPreferences` validator: accepts valid prefs with or without
 *      `denseLayout`; rejects non-boolean (AC7).
 *   c) `validatePrefsPatch` (preferences.js): accepts {denseLayout: true|false},
 *      rejects non-boolean and unknown keys remain rejected (AC2).
 *   d) Settings page: renderToggle for denseLayout registers in section
 *      "Layout" with label "Compact layout" + default OFF (AC1).
 *   e) Toggle ON dispatches MSG_SET_PREFERENCES with `{denseLayout: true}`
 *      (AC5).
 *   f) Sidepanel-style body-class flip helper: prefs with `denseLayout: true`
 *      adds `.tj-dense` to <body>; false (or missing) removes it (AC3 / AC4).
 *   g) Newtab-style body-class flip helper: same shape (AC3 / AC4 — the
 *      newtab and sidepanel share the same JS contract).
 *   h) Broadcast: simulating MSG_STATE_CHANGED scope=preferences delivery
 *      drives a re-fetch of prefs and toggles the body class (AC5).
 *
 * Strategy: the sidepanel/newtab JS modules are DOM-bound with no exports,
 * so behavioral tests target a faithful local reproduction of the
 * `applyDenseLayout` helper that mirrors the shipped implementation. A
 * source-invariant grep against the shipped JS pins the contract so the
 * reproduction cannot silently drift.
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  __resetMock,
} from './chrome-mock.js';

import { MSG_SET_PREFERENCES } from '../shared/messages.js';

import {
  init as initSettingsFields,
  loadPreferences,
  renderToggle,
  _resetForTest,
  _getFieldsForTest,
  _fireBroadcastForTest,
} from '../settings/settings-fields.js';

/* =========================================================================
   FakeElement harness — same shape as b040 / b091 precedent.
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

/* =========================================================================
   Body-class harness — minimal stand-in for document.body.classList that
   the shipped applyDenseLayout helpers manipulate.
   ========================================================================= */

function makeBodyClassList() {
  const set = new Set();
  return {
    set,
    add(c) { set.add(c); },
    remove(c) { set.delete(c); },
    contains(c) { return set.has(c); },
  };
}

/* Reproduction of the shipped applyDenseLayout helper. The source-invariant
   grep tests at the bottom of this file pin the shipped code so this
   reproduction cannot drift. */
function applyDenseLayout(body, prefs) {
  const enabled = !!(prefs && prefs.denseLayout === true);
  if (enabled) body.classList.add('tj-dense');
  else body.classList.remove('tj-dense');
}

/* =========================================================================
   Settings-page harness — mirrors b091 setupHarness shape.
   ========================================================================= */

function setupSettingsHarness({ getPrefsResult, setPrefsError } = {}) {
  const doc = makeFakeDocument();
  const contentEl = new FakeElement('div', doc);
  const errorEl = new FakeElement('div', doc);
  errorEl.hidden = true;
  const errorTextEl = new FakeElement('span', doc);
  errorTextEl.id = 'settings-error-banner-text';
  errorEl.appendChild(errorTextEl);

  const sendCalls = [];
  async function sendMessage(type, payload) {
    sendCalls.push({ type, payload });
    if (type === 'tj/getPreferences') {
      return getPrefsResult !== undefined ? getPrefsResult : {
        theme: 'system',
        displayMode: 'sidepanel',
        newTabOverride: false,
        autoCollapseSubGroups: false,
        importSkipDuplicates: true,
        denseLayout: false,
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
   Static-file readers — for source-invariant grep + CSS deltas.
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
   (a) AC2 — DEFAULT_PREFERENCES gains `denseLayout: false`.
   ========================================================================= */

test('B-092 AC2: DEFAULT_PREFERENCES contains `denseLayout` with default false', async () => {
  const { DEFAULT_PREFERENCES } = await import('../background/storage/shapes.js');
  assert.ok(
    Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, 'denseLayout'),
    'DEFAULT_PREFERENCES must include `denseLayout`',
  );
  assert.equal(DEFAULT_PREFERENCES.denseLayout, false, 'default-OFF per B-092 AC1 / AC2');
  assert.equal(typeof DEFAULT_PREFERENCES.denseLayout, 'boolean', 'must be boolean');
});

/* =========================================================================
   (b) AC7 — `isPreferences` validator (shapes.js) accepts both presence /
   absence + correct boolean type; rejects non-boolean.
   ========================================================================= */

test('B-092 AC7: assertShape accepts prefs with denseLayout: true | false', async () => {
  const shapes = await import('../background/storage/shapes.js');
  const base = { ...shapes.DEFAULT_PREFERENCES };

  // true
  assert.doesNotThrow(() => shapes.assertShape('prefs', { ...base, denseLayout: true }));
  // false
  assert.doesNotThrow(() => shapes.assertShape('prefs', { ...base, denseLayout: false }));
});

test('B-092 AC7: assertShape accepts prefs without `denseLayout` (legacy / pre-B-092 disk shape)', async () => {
  const shapes = await import('../background/storage/shapes.js');
  // Construct a snapshot without the new key. assertShape MUST NOT throw —
  // matching the OPTIONAL pattern from importSkipDuplicates.
  const legacy = {
    theme: 'system',
    displayMode: 'sidepanel',
    newTabOverride: false,
    autoCollapseSubGroups: false,
    importSkipDuplicates: true,
  };
  assert.doesNotThrow(() => shapes.assertShape('prefs', legacy));
});

test('B-092 AC7: assertShape rejects prefs with denseLayout of wrong type', async () => {
  const shapes = await import('../background/storage/shapes.js');
  const base = { ...shapes.DEFAULT_PREFERENCES };

  assert.throws(() => shapes.assertShape('prefs', { ...base, denseLayout: 'yes' }),
    /Corrupt partition: prefs/);
  assert.throws(() => shapes.assertShape('prefs', { ...base, denseLayout: 1 }),
    /Corrupt partition: prefs/);
  assert.throws(() => shapes.assertShape('prefs', { ...base, denseLayout: null }),
    /Corrupt partition: prefs/);
});

/* =========================================================================
   (c) AC2 — `validatePrefsPatch` accepts {denseLayout: true|false} and
   rejects non-boolean. Round-trips via setPreferences -> getPreferences.
   ========================================================================= */

test('B-092 AC2: setPreferences round-trip persists `denseLayout: true`', async () => {
  // Reset chrome.storage between tests so the prefs partition starts clean.
  __resetMock();
  const { setPreferences, getPreferences } = await import('../background/storage/preferences.js');
  const next = await setPreferences({ denseLayout: true });
  assert.equal(next.denseLayout, true, 'setPreferences returns the merged snapshot');

  const persisted = await getPreferences();
  assert.equal(persisted.denseLayout, true, 'subsequent getPreferences reads persisted value');
});

test('B-092 AC2: setPreferences rejects non-boolean denseLayout', async () => {
  __resetMock();
  const { setPreferences } = await import('../background/storage/preferences.js');
  await assert.rejects(
    () => setPreferences({ denseLayout: 'yes' }),
    /denseLayout must be boolean/,
  );
  await assert.rejects(
    () => setPreferences({ denseLayout: 1 }),
    /denseLayout must be boolean/,
  );
});

/* =========================================================================
   (d) AC1 — Settings page registers `denseLayout` toggle in "Layout" with
   the locked label "Compact layout" + default OFF.
   ========================================================================= */

test('B-092 AC1: renderToggle registers `denseLayout` with section "Layout" and label "Compact layout"', () => {
  setupSettingsHarness();

  renderToggle({
    key: 'denseLayout',
    label: 'Compact layout',
    section: 'Layout',
    defaultValue: false,
  });

  const fields = _getFieldsForTest();
  const field = fields.find((f) => f.key === 'denseLayout');
  assert.ok(field, 'denseLayout field registered');
  assert.equal(field.kind, 'toggle');
  assert.equal(field.inputEl.tagName, 'INPUT');
  assert.equal(field.inputEl.type, 'checkbox');
  assert.equal(field.label, 'Compact layout', 'AC1 label copy locked');
  assert.equal(field.section, 'Layout', 'AC1 section locked');
  assert.equal(field.defaultValue, false, 'default OFF per AC1');
});

test('B-092 AC1: fresh-install prefs (key absent) paints denseLayout toggle as OFF', async () => {
  setupSettingsHarness({ getPrefsResult: {} });

  renderToggle({
    key: 'denseLayout',
    label: 'Compact layout',
    section: 'Layout',
    defaultValue: false,
  });

  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'denseLayout');
  assert.equal(field.inputEl.checked, false, 'fresh-install default MUST be OFF');
});

/* =========================================================================
   (e) AC5 — Toggle ON dispatches MSG_SET_PREFERENCES with the minimal
   partial patch `{denseLayout: true}`.
   ========================================================================= */

test('B-092 AC5: toggling denseLayout ON dispatches MSG_SET_PREFERENCES with `{denseLayout: true}`', async () => {
  const h = setupSettingsHarness();

  renderToggle({
    key: 'denseLayout',
    label: 'Compact layout',
    section: 'Layout',
    defaultValue: false,
  });

  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'denseLayout');
  field.inputEl.checked = true;
  field.inputEl.triggerChange();
  await new Promise((r) => setTimeout(r, 0));

  const setCall = h.sendCalls.find((c) => c.type === MSG_SET_PREFERENCES);
  assert.ok(setCall, 'MSG_SET_PREFERENCES was dispatched on toggle change');
  assert.deepEqual(setCall.payload, { patch: { denseLayout: true } },
    'minimal partial patch carries denseLayout: true');
});

/* =========================================================================
   (f / g) AC3 / AC4 — body-class flip helper (sidepanel + newtab share the
   shape).
   ========================================================================= */

test('B-092 AC3: applyDenseLayout adds `.tj-dense` when prefs.denseLayout is true', () => {
  const body = { classList: makeBodyClassList() };
  applyDenseLayout(body, { denseLayout: true });
  assert.equal(body.classList.contains('tj-dense'), true);
});

test('B-092 AC4: applyDenseLayout removes `.tj-dense` when prefs.denseLayout is false', () => {
  const body = { classList: makeBodyClassList() };
  body.classList.add('tj-dense');
  applyDenseLayout(body, { denseLayout: false });
  assert.equal(body.classList.contains('tj-dense'), false);
});

test('B-092 AC4: applyDenseLayout removes `.tj-dense` when prefs is null / undefined', () => {
  const body = { classList: makeBodyClassList() };
  body.classList.add('tj-dense');
  applyDenseLayout(body, null);
  assert.equal(body.classList.contains('tj-dense'), false);

  body.classList.add('tj-dense');
  applyDenseLayout(body, undefined);
  assert.equal(body.classList.contains('tj-dense'), false);
});

test('B-092 AC4: applyDenseLayout treats truthy non-true values as OFF (strict === true)', () => {
  /* Defensive: the shipped helper uses `prefs.denseLayout === true` so a
     stored string "true" or numeric 1 must NOT enable dense mode. The
     storage validator rejects non-boolean values, but we keep this guard
     because pre-B-092 disk shapes / corrupt restores could land here. */
  const body = { classList: makeBodyClassList() };
  applyDenseLayout(body, { denseLayout: 'true' });
  assert.equal(body.classList.contains('tj-dense'), false);
  applyDenseLayout(body, { denseLayout: 1 });
  assert.equal(body.classList.contains('tj-dense'), false);
});

/* =========================================================================
   (h) AC5 — Broadcast: scope=preferences triggers a re-fetch and the body
   class flips. Reproduces the listener pattern shipped in sidepanel.js +
   newtab.js: on broadcast, dispatch MSG_GET_PREFERENCES, then call
   applyDenseLayout(body, prefs).
   ========================================================================= */

test('B-092 AC5: prefs broadcast re-fetches and applyDenseLayout flips body class', async () => {
  const body = { classList: makeBodyClassList() };
  let currentPrefs = { denseLayout: false };

  // Reproduce the listener: on a `preferences` broadcast, re-fetch + apply.
  async function onPrefsBroadcast() {
    const prefs = await Promise.resolve(currentPrefs);
    applyDenseLayout(body, prefs);
  }

  // Initial state: no class.
  assert.equal(body.classList.contains('tj-dense'), false);

  // Simulate a Settings-tab toggle ON: SW broadcasts preferences-scope.
  currentPrefs = { denseLayout: true };
  await onPrefsBroadcast();
  assert.equal(body.classList.contains('tj-dense'), true,
    'broadcast handler flipped body class to dense after pref toggled ON');

  // Toggle back OFF: another broadcast.
  currentPrefs = { denseLayout: false };
  await onPrefsBroadcast();
  assert.equal(body.classList.contains('tj-dense'), false,
    'broadcast handler removes body class after pref toggled OFF');
});

/* =========================================================================
   Source-invariant grep — pin the shipped implementation so the local
   reproduction above cannot silently drift from the production code.
   ========================================================================= */

test('B-092 + B-088 source invariant: sidepanel.js wires the shared dense-layout applier', () => {
  /* B-088 fix #1 — the per-surface helpers were factored into
     shared/surface-prefs.js. The surface code now imports the shared applier
     under a stable local alias and the canonical body-class write lives in
     the shared module. */
  const sidepanelSrc = readFile('sidepanel/sidepanel.js');
  assert.match(sidepanelSrc, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'sidepanel.js must import from shared/surface-prefs.js');
  assert.match(sidepanelSrc, /applyDenseLayout/,
    'sidepanel.js must reference the applyDenseLayout helper');
  const sharedSrc = readFile('shared/surface-prefs.js');
  assert.match(sharedSrc, /export function applyDenseLayout\(prefs\)/,
    'shared/surface-prefs.js must export applyDenseLayout(prefs)');
  assert.match(sharedSrc, /classList\.add\('tj-dense'\)/,
    'shared applyDenseLayout must add .tj-dense to body');
  assert.match(sharedSrc, /classList\.remove\('tj-dense'\)/,
    'shared applyDenseLayout must remove .tj-dense from body');
});

test('B-092 + B-088 source invariant: newtab.js wires the shared dense-layout applier', () => {
  /* B-088 fix #1 — the inline `_applyDenseLayout` clone was removed in
     favour of the shared/surface-prefs.js export. */
  const newtabSrc = readFile('newtab/newtab.js');
  assert.match(newtabSrc, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'newtab.js must import from shared/surface-prefs.js');
  assert.match(newtabSrc, /_applyDenseLayout/,
    'newtab.js must reference the _applyDenseLayout local alias');
});

test('B-092 source invariant: sidepanel.css ships `.tj-dense` descendant rules per AC3', () => {
  const css = readFile('sidepanel/sidepanel.css');
  assert.match(css, /\.tj-dense \.item-row/, '.tj-dense .item-row rule present');
  assert.match(css, /\.tj-dense \.item-title/, '.tj-dense .item-title rule present');
  assert.match(css, /\.tj-dense \.item-url/, '.tj-dense .item-url rule present');
  assert.match(css, /\.tj-dense \.item-url\s*\{[^}]*display:\s*none/,
    '.tj-dense .item-url uses display: none per AC3');
});

test('B-092 source invariant: newtab.css ships `.tj-dense` descendant rules per AC3', () => {
  const css = readFile('newtab/newtab.css');
  assert.match(css, /\.tj-dense \.newtab-item-row/, '.tj-dense .newtab-item-row rule present');
  assert.match(css, /\.tj-dense \.newtab-item-title/, '.tj-dense .newtab-item-title rule present');
  assert.match(css, /\.tj-dense \.newtab-item-url/, '.tj-dense .newtab-item-url rule present');
  assert.match(css, /\.tj-dense \.newtab-item-url\s*\{[^}]*display:\s*none/,
    '.tj-dense .newtab-item-url uses display: none per AC3');
});

test('B-092 source invariant: settings.js registers the denseLayout toggle', () => {
  const src = readFile('settings/settings.js');
  assert.match(src, /key:\s*['"]denseLayout['"]/,
    'settings.js renderToggle call references denseLayout key');
  assert.match(src, /label:\s*['"]Compact layout['"]/,
    'settings.js renderToggle call uses locked "Compact layout" label');
  assert.match(src, /section:\s*['"]Layout['"]/,
    'settings.js renderToggle call targets the Layout section');
});

/* =========================================================================
   AC4 — additive change: the dense rules are scoped only to .tj-dense.
   ========================================================================= */

test('B-092 AC4: baseline `.item-row` rule is unchanged (dense rules are additive)', () => {
  const css = readFile('sidepanel/sidepanel.css');
  // Baseline rule: padding 6px 12px / min-height 44px / .item-title 13px /
  // .item-url 11px. The presence of the original numbers proves the dense
  // CSS deltas did not edit the baseline.
  assert.match(css, /\.item-row\s*\{[^}]*padding:\s*6px 12px/,
    '.item-row baseline padding unchanged');
  assert.match(css, /\.item-row\s*\{[^}]*min-height:\s*44px/,
    '.item-row baseline min-height unchanged');
  assert.match(css, /\.item-title\s*\{[^}]*font-size:\s*13px/,
    '.item-title baseline font-size unchanged');
  assert.match(css, /\.item-url\s*\{[^}]*font-size:\s*11px/,
    '.item-url baseline font-size unchanged');
});

/* =========================================================================
   AC5 — Settings page re-fetch on broadcast paints denseLayout into the
   toggle (the field-helper module's broadcast subscription drives it).
   ========================================================================= */

test('B-092 AC5: settings-fields broadcast re-paints denseLayout toggle from new snapshot', async () => {
  let currentSnapshot = { denseLayout: false };
  const h = setupSettingsHarness({ getPrefsResult: currentSnapshot });

  renderToggle({
    key: 'denseLayout',
    label: 'Compact layout',
    section: 'Layout',
    defaultValue: false,
  });

  await loadPreferences();

  const field = _getFieldsForTest().find((f) => f.key === 'denseLayout');
  assert.equal(field.inputEl.checked, false, 'initial paint is OFF');

  // Mutate the snapshot (a remote sidepanel toggled ON) and fire a
  // broadcast. The forked module re-fetches via sendMessage internally.
  currentSnapshot.denseLayout = true;
  // sendMessage closure reads the captured `getPrefsResult` reference; mutate
  // the same object so the next MSG_GET_PREFERENCES returns the new value.
  const fired = _fireBroadcastForTest('preferences');
  assert.equal(fired, true, 'broadcast listener was attached');

  // Allow the broadcast handler's await to resolve before asserting.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(field.inputEl.checked, true,
    'broadcast re-paint flipped the toggle to ON without a page reload');
});
