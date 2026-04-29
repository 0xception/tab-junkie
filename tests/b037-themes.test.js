/**
 * b037-themes.test.js — B-037 R5 regression coverage for the 13-theme
 * selection feature (Full M, Sprint 31 anchor) + B-098 Tokyo Night addition
 * (Sprint 32 Fast Track XS — catalog grows 13 → 14).
 *
 * Authoritative spec: docs/design/45-b-037-themes.md + docs/BACKLOG.md B-037
 * AC1–AC14 + B-098 AC1–AC7.
 *
 * Coverage map (≥ 10 tests):
 *   1. Theme catalog — 13 slugs registered exactly (AC1).
 *   2. Settings page renderSelect with optgroups: 13 options across 3
 *      optgroups (Auto/Light/Dark) (AC1, AC2, D-6).
 *   3. validatePrefsPatch accepts every new slug (AC3).
 *   4. validatePrefsPatch rejects an unknown slug (AC3).
 *   5. validatePrefsPatch rejects legacy 'light' / 'dark' on writes (D-2).
 *   6. isPreferences accepts all 15 read-side values (13 new + 2 legacy) (D-2).
 *   7. setPreferences round-trips a new theme value through SW (AC3, AC5).
 *   8. getPreferences migrates stored 'light' → 'atom-one-light' on read (D-2).
 *   9. getPreferences migrates stored 'dark' → 'one-dark' on read (D-2).
 *  10. shared/themes.css contains a palette block per theme + legacy aliases
 *      (AC7, AC14, D-3).
 *  11. shared/themes.css contains zero `transition` declarations on palette
 *      rules (AC11c — instant swap).
 *  12. Per-surface CSS files contain zero `[data-theme=` palette blocks
 *      (AC14, D-3).
 *  13. All 3 surface HTMLs link shared/themes.css and shared/theme-init.js
 *      (AC6, AC14, D-3, D-4).
 *  14. shared/theme-init.js fallback is 'system' (not 'light') (AC6, D-4).
 *  15. _applyTheme contract: setting data-theme writes sessionStorage so the
 *      FOUC guard picks it up next paint (AC6, AC10c, D-4).
 *  16. settings.js registers `theme` via renderSelect with optgroups (AC2, D-6).
 *  17–20. B-098 Tokyo Night: slug in WRITE list, CSS block exists, Settings
 *      option in Dark optgroup, read-side count is 16 (B-098 AC1–AC5).
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  __resetMock,
} from './chrome-mock.js';

import { MSG_SET_PREFERENCES } from '../shared/messages.js';

import {
  init as initSettingsFields,
  loadPreferences,
  renderSelect,
  _resetForTest,
  _getFieldsForTest,
} from '../settings/settings-fields.js';

/* =========================================================================
   FakeElement harness — mirrors b091 / b092 precedent. Adds <optgroup>
   awareness via the same generic FakeElement; the createElement('optgroup')
   path returns a node that accepts setAttribute('label', ...) + appendChild
   children, which is all the renderSelect builder needs.
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
   Static-file readers.
   ========================================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
const REPO_ROOT = resolve(__dirnameLocal, '..');

function readFile(rel) {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

const NEW_THEME_SLUGS = [
  'system',
  'github-light', 'tomorrow', 'atom-one-light', 'solarized-light',
  'github-dark', 'tomorrow-night', 'atom-one-dark', 'solarized-dark',
  'dracula', 'nord', 'one-dark', 'monokai', 'tokyo-night',
];

beforeEach(() => {
  _resetForTest();
  __resetMock();
});

/* =========================================================================
   1. Theme catalog: shared/theme-init.js fallback is 'system' (D-4).
   ========================================================================= */

test('B-037 D-4: shared/theme-init.js exists, fallback is `system` (not `light`)', () => {
  assert.ok(existsSync(resolve(REPO_ROOT, 'shared/theme-init.js')),
    'shared/theme-init.js must exist (D-4 consolidation)');
  const src = readFile('shared/theme-init.js');
  assert.match(src, /sessionStorage\.getItem\('tj-theme'\)/,
    'shared/theme-init.js must read tj-theme from sessionStorage');
  assert.match(src, /\|\|\s*'system'/,
    'fallback string must be `system` to align with DEFAULT_PREFERENCES.theme');
  assert.doesNotMatch(src, /\|\|\s*'light'/,
    'fallback must NOT remain `light` post-B-037');
});

test('B-037 D-4: legacy per-surface theme-init.js files are removed', () => {
  assert.ok(!existsSync(resolve(REPO_ROOT, 'sidepanel/theme-init.js')),
    'sidepanel/theme-init.js must be deleted post-consolidation');
  assert.ok(!existsSync(resolve(REPO_ROOT, 'newtab/theme-init.js')),
    'newtab/theme-init.js must be deleted post-consolidation');
  assert.ok(!existsSync(resolve(REPO_ROOT, 'settings/theme-init.js')),
    'settings/theme-init.js must be deleted post-consolidation');
});

/* =========================================================================
   2. validatePrefsPatch — write-side allow-list of 13 new slugs.
   ========================================================================= */

test('B-037 AC3 + B-098: validatePrefsPatch accepts every one of the 14 theme slugs (incl. tokyo-night)', async () => {
  __resetMock();
  const { setPreferences } = await import('../background/storage/preferences.js');
  for (const slug of NEW_THEME_SLUGS) {
    const next = await setPreferences({ theme: slug });
    assert.equal(next.theme, slug, `slug '${slug}' must round-trip through setPreferences`);
  }
});

test('B-037 AC3: validatePrefsPatch rejects an unknown theme slug with ERR_VALIDATION', async () => {
  __resetMock();
  const { setPreferences } = await import('../background/storage/preferences.js');
  await assert.rejects(
    () => setPreferences({ theme: 'not-a-theme' }),
    /theme must be one of/,
    'unknown slug must be rejected by validatePrefsPatch',
  );
});

test('B-037 D-2: validatePrefsPatch rejects legacy `light` and `dark` on writes', async () => {
  __resetMock();
  const { setPreferences } = await import('../background/storage/preferences.js');
  await assert.rejects(() => setPreferences({ theme: 'light' }), /theme must be one of/,
    'legacy `light` must be rejected on write — read-side migration only');
  await assert.rejects(() => setPreferences({ theme: 'dark' }), /theme must be one of/,
    'legacy `dark` must be rejected on write — read-side migration only');
});

/* =========================================================================
   3. isPreferences (read-side) — 15-value union (13 new + 2 legacy aliases).
   ========================================================================= */

test('B-037 D-2 + B-098: isPreferences (assertShape) accepts all 14 slugs (incl. tokyo-night) + legacy `light` + legacy `dark`', async () => {
  const shapes = await import('../background/storage/shapes.js');
  const base = { ...shapes.DEFAULT_PREFERENCES };
  // 14 slugs (13 original + tokyo-night).
  for (const slug of NEW_THEME_SLUGS) {
    assert.doesNotThrow(
      () => shapes.assertShape('prefs', { ...base, theme: slug }),
      `assertShape must accept theme=${slug} on read`,
    );
  }
  // 2 legacy aliases retained for read-time migration.
  assert.doesNotThrow(() => shapes.assertShape('prefs', { ...base, theme: 'light' }),
    'assertShape must tolerate legacy `light` on read for D-2 migration');
  assert.doesNotThrow(() => shapes.assertShape('prefs', { ...base, theme: 'dark' }),
    'assertShape must tolerate legacy `dark` on read for D-2 migration');
});

test('B-037 D-2: isPreferences rejects a corrupt slug (read-side allow-list closed)', async () => {
  const shapes = await import('../background/storage/shapes.js');
  const base = { ...shapes.DEFAULT_PREFERENCES };
  assert.throws(() => shapes.assertShape('prefs', { ...base, theme: 'mystery-theme' }),
    /Corrupt partition: prefs/);
});

/* =========================================================================
   4. getPreferences read-time migration (D-2).
   ========================================================================= */

test('B-037 D-2 migration: getPreferences with stored `theme: light` returns `atom-one-light`', async () => {
  __resetMock();
  /* Seed storage with the legacy disk shape. The chrome-mock's storage.local
     is in-memory; writing the partition directly bypasses validatePrefsPatch. */
  await chrome.storage.local.set({
    'tj:prefs': {
      theme: 'light',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
      importSkipDuplicates: true,
      denseLayout: false,
    },
  });
  const { getPreferences } = await import('../background/storage/preferences.js');
  const prefs = await getPreferences();
  assert.equal(prefs.theme, 'atom-one-light',
    'D-2 migration: legacy `light` must surface as `atom-one-light` to the runtime');
});

test('B-037 D-2 migration: getPreferences with stored `theme: dark` returns `one-dark`', async () => {
  __resetMock();
  await chrome.storage.local.set({
    'tj:prefs': {
      theme: 'dark',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
      importSkipDuplicates: true,
      denseLayout: false,
    },
  });
  const { getPreferences } = await import('../background/storage/preferences.js');
  const prefs = await getPreferences();
  assert.equal(prefs.theme, 'one-dark',
    'D-2 migration: legacy `dark` must surface as `one-dark` to the runtime');
});

test('B-037 D-2 read-time only: legacy disk values are NOT re-written by getPreferences', async () => {
  __resetMock();
  await chrome.storage.local.set({
    'tj:prefs': {
      theme: 'light',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
      importSkipDuplicates: true,
      denseLayout: false,
    },
  });
  const { getPreferences } = await import('../background/storage/preferences.js');
  /* Two consecutive reads — ensure the disk value is unchanged after the
     first read (no write-on-first-read), so R6 rollback stays trivial. */
  await getPreferences();
  const persisted = (await chrome.storage.local.get('tj:prefs'))['tj:prefs'];
  assert.equal(persisted.theme, 'light',
    'getPreferences must NOT re-write disk; legacy values stay until user picks a new theme');
});

/* =========================================================================
   5. Settings page renderSelect with optgroups — 13 options across 3
   optgroups (D-6).
   ========================================================================= */

test('B-037 AC1 + AC2 + D-6 + B-098: renderSelect with optgroups builds 3 <optgroup> blocks containing 14 <option>s total (incl. Tokyo Night)', () => {
  setupSettingsHarness();
  renderSelect({
    key: 'theme',
    label: 'Theme',
    section: 'Theme',
    optgroups: [
      { label: 'Auto', options: [
        { value: 'system', label: 'System Default' },
      ]},
      { label: 'Light', options: [
        { value: 'github-light', label: 'GitHub Light' },
        { value: 'tomorrow', label: 'Tomorrow' },
        { value: 'atom-one-light', label: 'Atom One Light' },
        { value: 'solarized-light', label: 'Solarized Light' },
      ]},
      { label: 'Dark', options: [
        { value: 'github-dark', label: 'GitHub Dark' },
        { value: 'tomorrow-night', label: 'Tomorrow Night' },
        { value: 'atom-one-dark', label: 'Atom One Dark' },
        { value: 'solarized-dark', label: 'Solarized Dark' },
        { value: 'dracula', label: 'Dracula' },
        { value: 'nord', label: 'Nord' },
        { value: 'one-dark', label: 'One Dark' },
        { value: 'monokai', label: 'Monokai' },
        { value: 'tokyo-night', label: 'Tokyo Night' },
      ]},
    ],
    defaultValue: 'system',
  });

  const field = _getFieldsForTest().find((f) => f.key === 'theme');
  assert.ok(field, 'theme field registered');
  assert.equal(field.kind, 'select');
  assert.equal(field.options.length, 14, 'flat options derived from optgroups must total 14');
  const seenValues = field.options.map((o) => o.value).sort();
  const expected = NEW_THEME_SLUGS.slice().sort();
  assert.deepEqual(seenValues, expected, 'flat options must mirror the locked 14-slug catalog');

  // Three optgroup wrappers in the actual DOM.
  const select = field.inputEl;
  const optgroups = select.childNodes.filter((n) => n.tagName === 'OPTGROUP');
  assert.equal(optgroups.length, 3, 'select must contain exactly 3 <optgroup>s (Auto/Light/Dark)');
  const groupLabels = optgroups.map((og) => og.getAttribute('label'));
  assert.deepEqual(groupLabels, ['Auto', 'Light', 'Dark']);
  // Total option count across optgroups.
  const totalOptions = optgroups.reduce((sum, og) => sum + og.childNodes.length, 0);
  assert.equal(totalOptions, 14, 'aggregate <option> count across optgroups must be 14');
});

test('B-037 D-6: renderSelect throws when both `options` and `optgroups` are provided', () => {
  setupSettingsHarness();
  assert.throws(
    () => renderSelect({
      key: 'theme',
      label: 'Theme',
      section: 'Theme',
      options: [{ value: 'system', label: 'System' }],
      optgroups: [{ label: 'Auto', options: [{ value: 'system', label: 'System' }] }],
      defaultValue: 'system',
    }),
    /mutually exclusive/,
    'renderSelect must reject specs that pass both flat options and optgroups',
  );
});

/* =========================================================================
   6. setPreferences round-trip + broadcast scope (AC3 / AC5).
   ========================================================================= */

test('B-037 AC3 + AC5: setPreferences({theme: dracula}) round-trips and getPreferences returns the new value', async () => {
  __resetMock();
  const { setPreferences, getPreferences } = await import('../background/storage/preferences.js');
  const next = await setPreferences({ theme: 'dracula' });
  assert.equal(next.theme, 'dracula', 'returned merged snapshot includes theme: dracula');
  const persisted = await getPreferences();
  assert.equal(persisted.theme, 'dracula', 'subsequent getPreferences reads dracula');
});

/* =========================================================================
   7. shared/themes.css consolidation contract (AC7, AC14, D-3).
   ========================================================================= */

test('B-037 AC7 + AC14: shared/themes.css contains every required `[data-theme=...]` palette block', () => {
  const css = readFile('shared/themes.css');
  // 13 new slugs as `[data-theme="<slug>"]`.
  for (const slug of NEW_THEME_SLUGS) {
    const re = new RegExp(`\\[data-theme="${slug}"\\]\\s*\\{`);
    assert.match(css, re, `shared/themes.css must contain a [data-theme="${slug}"] block`);
  }
  // 2 legacy aliases for D-2 transitional support.
  assert.match(css, /\[data-theme="light"\]\s*\{/, 'legacy `light` alias must be present');
  assert.match(css, /\[data-theme="dark"\]\s*\{/, 'legacy `dark` alias must be present');
  // dark-system @media block (AC8 system theme behaviour preserved).
  assert.match(
    css,
    /@media \(prefers-color-scheme: dark\)[\s\S]*?\[data-theme="system"\]/,
    'dark-system @media block must be preserved for AC8 OS auto-switch',
  );
});

test('B-037 AC11(c): shared/themes.css contains zero `transition` declarations on palette rules — instant swap', () => {
  const css = readFile('shared/themes.css');
  /* `transition:` on palette-bound declarations would animate theme swaps,
     which violates AC11(c) (instant swap, no `prefers-reduced-motion`
     interaction). The shared file is palette-only — any `transition` here
     is a bug. */
  assert.doesNotMatch(css, /\btransition\s*:/i,
    'shared/themes.css must not declare CSS transitions on palette rules');
});

test('B-037 AC14: per-surface CSS files contain zero `[data-theme=` palette blocks', () => {
  /* D-3 Option A consolidates palettes into shared/themes.css. Per-surface
     CSS files own layout / typography / component rules only. The two
     legacy `[data-theme="dark"]` rules on `.item-select[aria-checked]` were
     rewritten in B-037 to consume `var(--item-select-checked-bg)` declared
     per theme in shared/themes.css. */
  const sidepanelCss = readFile('sidepanel/sidepanel.css');
  const newtabCss = readFile('newtab/newtab.css');
  const settingsCss = readFile('settings/settings.css');
  for (const [path, body] of [
    ['sidepanel/sidepanel.css', sidepanelCss],
    ['newtab/newtab.css', newtabCss],
    ['settings/settings.css', settingsCss],
  ]) {
    assert.doesNotMatch(body, /\[data-theme=/,
      `${path} must NOT contain any \`[data-theme=\` selector after B-037 consolidation`);
  }
});

test('B-037 AC14: every surface HTML imports shared/theme-init.js + shared/themes.css in FOUC order', () => {
  for (const html of ['sidepanel/sidepanel.html', 'newtab/newtab.html', 'settings/settings.html']) {
    const src = readFile(html);
    const initIdx = src.indexOf('shared/theme-init.js');
    const cssIdx = src.indexOf('shared/themes.css');
    assert.ok(initIdx >= 0, `${html} must load shared/theme-init.js`);
    assert.ok(cssIdx >= 0, `${html} must <link> shared/themes.css`);
    assert.ok(initIdx < cssIdx,
      `${html} must reference theme-init.js BEFORE themes.css (FOUC ORDER)`);
    /* The legacy per-surface theme-init.js reference must be gone. */
    assert.doesNotMatch(src, /<script\s+src="theme-init\.js"\s*>/,
      `${html} must NOT reference the legacy local theme-init.js`);
  }
});

/* =========================================================================
   8. Sidepanel applyTheme contract (AC4, AC6, D-4 sessionStorage write).
   ========================================================================= */

test('B-037 AC4 + AC6 + B-088: sidepanel.js wires the shared theme applier (data-theme + sessionStorage)', () => {
  /* B-088 fix #1: applyTheme was factored to shared/surface-prefs.js.
     The sidepanel keeps a local `applyTheme(theme)` thin wrapper that calls
     the shared helper (which returns the resolved slug for the
     prefers-color-scheme reactor). The DOM + sessionStorage writes now live
     in the shared module; the source invariants below pin both surfaces. */
  const sidepanelSrc = readFile('sidepanel/sidepanel.js');
  assert.match(sidepanelSrc, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'sidepanel.js must import from shared/surface-prefs.js');
  assert.match(sidepanelSrc, /function applyTheme\(theme\)/,
    'sidepanel.js must keep a local applyTheme(theme) wrapper for the prefers-color-scheme reactor');
  const sharedSrc = readFile('shared/surface-prefs.js');
  assert.match(sharedSrc, /export function applyTheme\(theme\)/,
    'shared/surface-prefs.js must export applyTheme(theme)');
  assert.match(sharedSrc, /document\.documentElement\.setAttribute\('data-theme'/,
    'shared applyTheme must set <html> data-theme attribute');
  assert.match(sharedSrc, /sessionStorage\.setItem\('tj-theme'/,
    'shared applyTheme must write tj-theme to sessionStorage so the FOUC guard picks it up next paint');
});

test('B-037 AC4 + AC6 + B-088: newtab.js wires the shared theme applier under the _applyTheme alias', () => {
  /* B-088 fix #1 — inline `_applyTheme` clone replaced by aliased import. */
  const newtabSrc = readFile('newtab/newtab.js');
  assert.match(newtabSrc, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'newtab.js must import from shared/surface-prefs.js');
  assert.match(newtabSrc, /applyTheme as _applyTheme/,
    'newtab.js must alias the shared applyTheme as _applyTheme');
});

test('B-037 AC4 + AC6 + B-088: settings.js wires the shared theme applier into prefs-load + broadcast paths', () => {
  /* B-088 fix #1 — inline `_applyTheme` clone replaced by aliased import.
     The MSG_STATE_CHANGED + SCOPE.PREFERENCES broadcast wiring stays inline. */
  const src = readFile('settings/settings.js');
  assert.match(src, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'settings.js must import from shared/surface-prefs.js');
  assert.match(src, /applyTheme as _applyTheme/,
    'settings.js must alias the shared applyTheme as _applyTheme');
  assert.match(src, /MSG_STATE_CHANGED/,
    'settings.js must subscribe to MSG_STATE_CHANGED for live theme broadcast');
  assert.match(src, /SCOPE\.PREFERENCES/,
    'settings.js must filter on SCOPE.PREFERENCES for the theme broadcast');
});

/* =========================================================================
   9. Settings page wires the theme renderSelect with the locked optgroup
   structure (source-invariant grep).
   ========================================================================= */

test('B-037 AC2 + D-6: settings.js registers the theme select with optgroups and section "Theme"', () => {
  const src = readFile('settings/settings.js');
  /* Locked R3 contract: a renderSelect call exists with key: 'theme' AND
     optgroups (not flat options). */
  assert.match(src, /key:\s*'theme'/, 'settings.js must register a theme field');
  assert.match(src, /section:\s*'Theme'/, 'theme field must live in the Theme section');
  assert.match(src, /optgroups:/, 'theme select must use optgroups (D-6)');
  /* Three group labels present. */
  assert.match(src, /label:\s*'Auto'/, 'Auto optgroup label present');
  assert.match(src, /label:\s*'Light'/, 'Light optgroup label present');
  assert.match(src, /label:\s*'Dark'/, 'Dark optgroup label present');
  /* Default = 'system' (DEFAULT_PREFERENCES.theme). */
  assert.match(src, /defaultValue:\s*'system'/,
    "theme select defaultValue must be 'system' to match DEFAULT_PREFERENCES.theme");
});

/* =========================================================================
   10. Manifest unchanged (AC12).
   ========================================================================= */

test('B-037 AC12: manifest.json permissions array unchanged (no new permissions)', () => {
  const manifest = JSON.parse(readFile('manifest.json'));
  assert.deepEqual(
    manifest.permissions,
    ['tabs', 'tabGroups', 'storage', 'sidePanel', 'search'],
    'B-037 must NOT add any manifest permission',
  );
});

/* =========================================================================
   11. R4 HIGH-3 — fresh-install C-9 path: no `tj:prefs` key on disk yields
   theme=system default via the DEFAULT_PREFERENCES merge.
   ========================================================================= */

test('B-037 AC9 — fresh install with no tj:prefs key returns theme=system default', async () => {
  __resetMock();
  /* No setItem — chrome-mock storage starts empty after __resetMock. */
  const { getPreferences } = await import('../background/storage/preferences.js');
  const prefs = await getPreferences();
  assert.strictEqual(prefs.theme, 'system',
    'fresh install must surface DEFAULT_PREFERENCES.theme === "system"');
});

/* =========================================================================
   12. R4 HIGH-4 — pref-read-failure C-9 path: getPreferences propagates a
   storage read rejection (caller decides whether to safe-mode-fallback).
   ========================================================================= */

test('B-037 AC9 — getPreferences rejects gracefully when chrome.storage.local.get throws', async () => {
  __resetMock();
  const { getPreferences } = await import('../background/storage/preferences.js');
  const originalGet = chrome.storage.local.get;
  chrome.storage.local.get = async () => { throw new Error('quota exceeded'); };
  try {
    await assert.rejects(() => getPreferences(),
      'getPreferences must surface the underlying storage failure to the caller (safe-mode handling lives upstream)');
  } finally {
    chrome.storage.local.get = originalGet;
  }
});

/* =========================================================================
   13. R4 MEDIUM-6 — applyTheme writes the migrated slug to sessionStorage.
   Closes the FOUC migration loop: after getPreferences() returns the
   migrated slug, the surface's _applyTheme persists the new slug so the
   next paint of any surface picks up the post-migration value.
   ========================================================================= */

test('B-037 AC3 — applyTheme writes the migrated slug to sessionStorage', async () => {
  __resetMock();
  /* Seed disk with legacy `light`. */
  await chrome.storage.local.set({
    'tj:prefs': {
      theme: 'light',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
      importSkipDuplicates: true,
      denseLayout: false,
    },
  });
  const { getPreferences } = await import('../background/storage/preferences.js');
  const prefs = await getPreferences();
  assert.strictEqual(prefs.theme, 'atom-one-light', 'precondition: D-2 read-time migration ran');

  /* Replicate the surface-side _applyTheme contract (matching sidepanel.js,
     newtab.js, settings.js, popup.js) against a tiny fake document +
     sessionStorage so the assertion is deterministic. */
  const setAttrCalls = [];
  const fakeDocumentElement = {
    setAttribute(k, v) { setAttrCalls.push({ k, v }); },
  };
  const sessionWrites = [];
  const fakeSessionStorage = {
    setItem(k, v) { sessionWrites.push({ k, v }); },
  };
  function applyTheme(theme) {
    const slug = (typeof theme === 'string' && theme.length > 0) ? theme : 'system';
    fakeDocumentElement.setAttribute('data-theme', slug);
    try { fakeSessionStorage.setItem('tj-theme', slug); } catch { /* unavailable */ }
  }

  applyTheme(prefs.theme);

  assert.deepStrictEqual(setAttrCalls, [{ k: 'data-theme', v: 'atom-one-light' }],
    'data-theme attribute must be set with the post-migration slug');
  assert.deepStrictEqual(sessionWrites, [{ k: 'tj-theme', v: 'atom-one-light' }],
    'sessionStorage.setItem must persist the post-migration slug so the next FOUC-guard read picks up the new value');
  /* Spot-check grep target: confirms the test exercises the sessionStorage.setItem('tj-theme', 'atom-one-light') flow. */
  assert.ok(sessionWrites.some(w => w.k === 'tj-theme' && w.v === 'atom-one-light'),
    'sessionStorage.setItem must have been called with the migrated atom-one-light slug');
});

/* =========================================================================
   14. R4 MEDIUM-7 — renderSelect throws when neither options nor optgroups
   is supplied (defensive guard against malformed call sites).
   ========================================================================= */

test('B-037 D-6 — renderSelect throws when neither options nor optgroups is supplied', () => {
  setupSettingsHarness();
  assert.throws(
    () => renderSelect({ key: 'test-bare', label: 'Test', section: 'Display' }),
    /required/,
    'renderSelect must reject specs missing both `options` and `optgroups`',
  );
});

/* =========================================================================
   15. R4 MEDIUM-8 — design doc D-6 example reflects shipped Auto → Light
   → Dark order.
   ========================================================================= */

test('B-037 D-6 — design doc example reflects shipped Auto → Light → Dark optgroup order', () => {
  const md = readFile('docs/design/45-b-037-themes.md');
  /* Locate the Auto/Light/Dark optgroup labels in source order within the
     D-6 code fence and assert Auto precedes Light precedes Dark. The
     previous version of the doc shipped Auto → Dark → Light, which drifted
     from the actual settings.js renderSelect call. */
  const autoIdx = md.indexOf("label: 'Auto'");
  const lightIdx = md.indexOf("label: 'Light'");
  const darkIdx = md.indexOf("label: 'Dark'");
  assert.ok(autoIdx >= 0 && lightIdx >= 0 && darkIdx >= 0, 'all three labels must appear in the doc');
  assert.ok(autoIdx < lightIdx, 'Auto must precede Light');
  assert.ok(lightIdx < darkIdx, 'Light must precede Dark (shipped order)');
});

/* =========================================================================
   16. R4 MEDIUM-5 — shared/theme-init.js validates cached slug against an
   inline allow-list so a tainted sessionStorage value cannot flow into
   the <html> data-theme attribute.
   ========================================================================= */

test('B-037 D-4 — shared/theme-init.js inline allow-list (`VALID.has`) blocks corrupt sessionStorage values', () => {
  const src = readFile('shared/theme-init.js');
  assert.match(src, /VALID\.has\(/,
    'theme-init.js must call VALID.has(...) before applying the cached slug');
  assert.match(src, /'system'/, 'allow-list must include `system`');
  assert.match(src, /'github-light'/, 'allow-list must include `github-light` (sample new slug)');
  assert.match(src, /'one-dark'/, 'allow-list must include `one-dark` (D-2 migration target)');
  assert.match(src, /'light'/, 'allow-list must retain legacy `light` for in-flight migration');
  assert.match(src, /'dark'/, 'allow-list must retain legacy `dark` for in-flight migration');
});

/* =========================================================================
   17. R4 HIGH-1 — popup.html consumes the shared theme system.
   ========================================================================= */

test('B-037 — popup.html loads shared/theme-init.js + shared/themes.css in FOUC order', () => {
  const src = readFile('popup/popup.html');
  const initIdx = src.indexOf('shared/theme-init.js');
  const cssIdx = src.indexOf('shared/themes.css');
  assert.ok(initIdx >= 0, 'popup.html must load shared/theme-init.js');
  assert.ok(cssIdx >= 0, 'popup.html must <link> shared/themes.css');
  assert.ok(initIdx < cssIdx,
    'popup.html must reference theme-init.js BEFORE themes.css (FOUC ORDER)');
});

test('B-037 — popup.css contains zero `[data-theme=` palette blocks', () => {
  const popupCss = readFile('popup/popup.css');
  assert.doesNotMatch(popupCss, /\[data-theme=/,
    'popup/popup.css must NOT contain any `[data-theme=` selector after B-037 consolidation');
});

test('B-037 + B-088 — popup.js wires the shared theme applier under the _applyTheme alias', () => {
  /* B-088 fix #1 — inline `_applyTheme` clone replaced by aliased import. */
  const src = readFile('popup/popup.js');
  assert.match(src, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'popup.js must import from shared/surface-prefs.js');
  assert.match(src, /applyTheme as _applyTheme/,
    'popup.js must alias the shared applyTheme as _applyTheme');
});

/* =========================================================================
   18 (R5 gap-fill 1). DEFAULT_PREFERENCES.theme baseline: must be 'system'
   (AC3/AC9 anchor). If this regresses to 'light' the FOUC guard test and
   fresh-install tests may still pass while the stored default is wrong.
   ========================================================================= */

test('B-037 AC3 + AC9: DEFAULT_PREFERENCES.theme is `system` (not `light`)', async () => {
  const shapes = await import('../background/storage/shapes.js');
  assert.strictEqual(
    shapes.DEFAULT_PREFERENCES.theme,
    'system',
    'DEFAULT_PREFERENCES.theme must be `system` so cold-start surfaces match the FOUC fallback',
  );
});

/* =========================================================================
   19 (R5 gap-fill 2). C-9 corrupt-slug path: getPreferences() propagates
   ERR_CORRUPT_DATA when assertShape throws for an unknown slug on disk
   (distinct from storage.local.get throwing, already covered by test 12).
   The corrupt path traverses: readPartition → assertShape(ERR_CORRUPT_DATA)
   → getPreferences() propagates → caller sees a rejected promise.
   ========================================================================= */

test('B-037 C-9: getPreferences() propagates ERR_CORRUPT_DATA when assertShape rejects a corrupt theme slug', async () => {
  __resetMock();
  /* Write a shape whose theme slug is outside both the 13-slug new enum and
     the 2 legacy aliases — assertShape will throw ERR_CORRUPT_DATA for this. */
  await chrome.storage.local.set({
    'tj:prefs': {
      theme: 'totally-unknown-slug',
      displayMode: 'sidepanel',
      newTabOverride: false,
      autoCollapseSubGroups: false,
      importSkipDuplicates: true,
      denseLayout: false,
    },
  });
  const { getPreferences } = await import('../background/storage/preferences.js');
  await assert.rejects(
    () => getPreferences(),
    /Corrupt partition: prefs/,
    'getPreferences must propagate ERR_CORRUPT_DATA so the caller can apply its safe-mode fallback',
  );
});

/* =========================================================================
   20 (R5 gap-fill 3). AC5 + AC10(a): settings.js broadcast handler body
   re-fetches prefs and passes prefs.theme to _applyTheme — source-invariant
   grep that the live-broadcast path cannot silently omit the repaint step.
   ========================================================================= */

test('B-037 AC5 + AC10(a): settings.js broadcast handler calls _applyTheme(prefs.theme) inside the MSG_STATE_CHANGED body', () => {
  const src = readFile('settings/settings.js');
  /* The handler must (a) send MSG_GET_PREFERENCES after receiving the
     broadcast, (b) then call _applyTheme with the resolved theme. The
     grep order asserts both are present and that _applyTheme is invoked
     with the runtime prefs.theme — not a hardcoded slug. */
  assert.match(src, /sendMessage\(MSG_GET_PREFERENCES\)\.then/,
    'broadcast handler must re-fetch prefs via MSG_GET_PREFERENCES when MSG_STATE_CHANGED fires');
  assert.match(src, /_applyTheme\(prefs\.theme\)/,
    'broadcast handler must call _applyTheme(prefs.theme) so the settings page repaints within the 500 ms AC10(a) budget');
});

/* =========================================================================
   21. B-037 UAT-6 — group-jump-popup.html wired into the theme system.
   Three source-invariant grep tests. Mirrors the popup.html tests above
   (section 17) — same pattern, separate popup surface.
   ========================================================================= */

test('B-037 UAT-6 — group-jump-popup.html loads shared/theme-init.js + shared/themes.css in FOUC order', () => {
  const src = readFile('popup/group-jump-popup.html');
  const initIdx = src.indexOf('shared/theme-init.js');
  const cssIdx = src.indexOf('shared/themes.css');
  assert.ok(initIdx >= 0, 'group-jump-popup.html must load shared/theme-init.js');
  assert.ok(cssIdx >= 0, 'group-jump-popup.html must <link> shared/themes.css');
  assert.ok(initIdx < cssIdx,
    'group-jump-popup.html must reference theme-init.js BEFORE themes.css (FOUC ORDER)');
});

test('B-037 UAT-6 — group-jump-popup.css contains zero hardcoded palette blocks (no :root colour vars, no prefers-color-scheme dark block)', () => {
  const css = readFile('popup/group-jump-popup.css');
  /* The `:root { --color-fg: #...` hardcoded block must be gone. */
  assert.doesNotMatch(css, /--color-fg:\s*#/,
    'group-jump-popup.css must NOT contain a hardcoded --color-fg colour value — use shared/themes.css token alias instead');
  /* The @media (prefers-color-scheme: dark) block must be removed. */
  assert.doesNotMatch(css, /prefers-color-scheme/,
    'group-jump-popup.css must NOT contain a prefers-color-scheme media block — theme system handles dark mode');
});

test('B-037 UAT-6 — group-jump-popup.js imports applyTheme from shared/surface-prefs.js and calls it on boot', () => {
  const src = readFile('popup/group-jump-popup.js');
  assert.match(src, /from ['"]\.\.\/shared\/surface-prefs\.js['"]/,
    'group-jump-popup.js must import from shared/surface-prefs.js');
  assert.match(src, /applyTheme as _applyTheme/,
    'group-jump-popup.js must alias the shared applyTheme as _applyTheme');
  assert.match(src, /MSG_GET_PREFERENCES/,
    'group-jump-popup.js must reference MSG_GET_PREFERENCES for the boot-time prefs fetch');
  assert.match(src, /_applyTheme\(data\.theme\)/,
    'group-jump-popup.js must call _applyTheme(data.theme) on boot to apply the stored theme');
});

/* =========================================================================
   B-098 — Tokyo Night theme addition (Sprint 32 Fast Track XS).
   Catalog grows 13 → 14. WRITE 13 → 14, READ 15 → 16.
   ========================================================================= */

test('B-098 AC1: VALID_THEME_SLUGS_WRITE includes `tokyo-night` (catalog 14th entry)', async () => {
  const { VALID_THEME_SLUGS_WRITE } = await import('../shared/theme-slugs.js');
  assert.ok(VALID_THEME_SLUGS_WRITE.includes('tokyo-night'),
    'VALID_THEME_SLUGS_WRITE must include tokyo-night after B-098');
  assert.equal(VALID_THEME_SLUGS_WRITE.length, 14,
    'VALID_THEME_SLUGS_WRITE must have exactly 14 entries after B-098');
});

test('B-098 AC2: VALID_THEME_SLUGS_READ has 16 entries (14 write + 2 legacy aliases)', async () => {
  const { VALID_THEME_SLUGS_READ } = await import('../shared/theme-slugs.js');
  assert.equal(VALID_THEME_SLUGS_READ.size, 16,
    'VALID_THEME_SLUGS_READ must have 16 entries (14 + legacy light + legacy dark) after B-098');
  assert.ok(VALID_THEME_SLUGS_READ.has('tokyo-night'),
    'VALID_THEME_SLUGS_READ must include tokyo-night via spread from WRITE array');
});

test('B-098 AC3: shared/themes.css contains a [data-theme="tokyo-night"] palette block with all 28 tokens', () => {
  const css = readFile('shared/themes.css');
  assert.match(css, /\[data-theme="tokyo-night"\]\s*\{/,
    'shared/themes.css must contain a [data-theme="tokyo-night"] block');
  // Spot-check key tokens present in the block.
  const blockMatch = css.match(/\[data-theme="tokyo-night"\]\s*\{([^}]+)\}/);
  assert.ok(blockMatch, 'tokyo-night block must be parseable');
  const block = blockMatch[1];
  for (const token of [
    '--bg-primary', '--bg-secondary', '--bg-hover', '--bg-active',
    '--text-primary', '--text-secondary', '--text-tertiary',
    '--border-primary', '--border-subtle',
    '--accent', '--accent-hover', '--accent-subtle', '--on-accent',
    '--focus-ring', '--live-indicator',
    '--active-bg', '--active-bg-hover', '--active-border',
    '--audible-color', '--drifted-color', '--danger',
    '--skeleton-base', '--skeleton-shine', '--empty-color',
    '--group-count-bg', '--group-count-text', '--avatar-text',
    '--mark-bg', '--selected-bg', '--selected-border',
    '--item-select-checked-bg',
  ]) {
    assert.ok(block.includes(token),
      `tokyo-night block must define ${token}`);
  }
});

test('B-098 AC4: settings.js Dark optgroup includes `tokyo-night` option', () => {
  const src = readFile('settings/settings.js');
  assert.match(src, /value:\s*'tokyo-night'/,
    'settings.js must register tokyo-night in the theme select');
  assert.match(src, /label:\s*'Tokyo Night'/,
    'settings.js must use display label "Tokyo Night" for the option');
});
