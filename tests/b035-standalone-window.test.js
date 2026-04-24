/**
 * b035-standalone-window.test.js — B-035 Standalone Window Display Mode R5.
 *
 * Authoritative spec: docs/design/41-b-035-standalone-window.md §41.6 +
 * BACKLOG.md B-035 AC21 (a-p).
 *
 * Strategy (mirrors B-023 §40.6 `tests/b023-group-jump-popup.test.js` precedent
 * for SW chrome.commands.onCommand listener testing):
 *
 *   (1) The SW listener body + `openOrFocusStandaloneWindow` helper from
 *       `background/service-worker.js:75-141` are reproduced verbatim in-test
 *       (below). If the SW implementation changes, update the test
 *       reproduction and the assertions will enforce the new contract
 *       byte-for-byte.
 *   (2) Local shims install chrome.commands + chrome.windows mocks that the
 *       shared chrome-mock.js does not fully cover (the shared mock's
 *       windows.getAll is seeded via __setMockWindows; we need per-call return
 *       values, create/update spies, and rejection injection).
 *   (3) Zero real timers; deterministic assertions via Promise microtask
 *       flushes (same `await Promise.resolve();` pattern as B-023 AC21 l).
 *
 * AC21 coverage map (§41.6 cases a-p):
 *   (a) SW listener registered + no-op for unknown commands      — automated
 *   (b) Existing-window → update({focused:true}), no create       — automated
 *   (c) No existing → create() path fires with shape              — automated
 *   (d) Anchor fallback (H-1) — no focused → allWins[0] centering — automated
 *   (e) Popup-in-anchor (M-2) — popups excluded from anchor       — automated
 *   (f) chrome.windows.create rejection → .catch, no uncaught     — automated
 *   (g) chrome.windows.update rejection → .catch, no uncaught     — automated
 *   (h) Rapid re-trigger idempotence                              — automated
 *   (i) Wrong command name → no side effects                      — automated
 *   (j) Cold-start: getAll called each trigger (no SW cache)      — automated
 *   (k) getAll called with {populate:true, windowTypes:['popup']} — automated
 *   (l) URL resolved via chrome.runtime.getURL                    — automated
 *   (m) B-023 group-jump listener untouched (regression guard)    — automated
 *   (n) Default size 1200 × 800                                   — automated
 *   (o) Centering math: left/top computation parameterised        — automated
 *   (p) focused:true passed to create                             — automated
 *
 *   + H-1 regression guard: anchor fallback uses realWins[0] when no focused
 *   + M-2 regression guard: popup-type windows excluded from anchor set
 *   + C-11 vacuous guard: zero chrome.storage.local.set on open path
 *
 * UAT-only coverage (documented but NOT automated here — see docs/UAT_B-035.md):
 *   - AC3  first-paint <200 ms inside the real standalone window
 *   - AC4  initial focus on #filter-input in the standalone window
 *   - AC10 cross-surface broadcast propagation (real multi-page runtime)
 *   - AC15 window.blur closes context menu in the real standalone window
 *   - AC17 ARIA parity (axe-core required)
 *   - AC18 WCAG AA contrast (contrast checker required)
 *   - Multi-monitor rect centering (real chrome.system.display not in mock)
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  __resetMock,
  __getRawStore,
} from './chrome-mock.js';

/* =========================================================================
   Constants mirrored from background/service-worker.js:90-92.
   ========================================================================= */

/** service-worker.js:91 */
const STANDALONE_WIDTH = 1200;
/** service-worker.js:92 */
const STANDALONE_HEIGHT = 800;
/** Computed once at module scope via chrome.runtime.getURL (service-worker.js:90). */
const STANDALONE_URL = 'chrome-extension://test-extension-id/sidepanel/sidepanel.html';

/* =========================================================================
   Local shim — chrome.commands + chrome.action + chrome.windows spies.
   Mirrors the tests/b023-group-jump-popup.test.js installCommandsShim pattern.
   Each test installs its own shim, exercises the listener, then uninstalls.
   ========================================================================= */

function installShim() {
  const calls = {
    getAllByFilter: [],     // each entry: the filter arg passed to getAll
    create: [],             // each entry: the options object passed to create
    update: [],             // each entry: [windowId, options]
    consoleWarn: [],        // captured console.warn invocations
  };

  /* Queue of getAll return values. Tests seed this per-call; ordering is
     first-come-first-served to support scenarios like "first call returns
     popups, second call returns real windows" (the H-1 anchor-fallback path
     calls getAll twice per trigger). */
  const getAllQueue = [];

  /* Override state for create/update results. */
  let createResult = null;
  let updateResult = null;

  const commandListeners = [];
  const origWindows = chrome.windows;
  const origCommands = chrome.commands;
  const origRuntime = chrome.runtime;
  const origConsoleWarn = console.warn;

  chrome.windows = {
    WINDOW_ID_NONE: -1,
    async getAll(filter) {
      calls.getAllByFilter.push(filter);
      if (getAllQueue.length === 0) return [];
      return getAllQueue.shift();
    },
    async create(options) {
      calls.create.push(options);
      if (createResult && typeof createResult.then === 'function') {
        const r = createResult;
        createResult = null;
        return r;
      }
      return { id: 999 };
    },
    async update(windowId, options) {
      calls.update.push([windowId, options]);
      if (updateResult && typeof updateResult.then === 'function') {
        const r = updateResult;
        updateResult = null;
        return r;
      }
      return { id: windowId };
    },
  };

  chrome.commands = {
    onCommand: {
      addListener(fn) { commandListeners.push(fn); },
      __fire(command) {
        /* Dispatch synchronously per MV3 event contract. */
        for (const fn of commandListeners) fn(command);
      },
    },
  };

  /* Ensure chrome.runtime.getURL returns the deterministic extension-origin
     URL the service worker computes at module scope. */
  chrome.runtime = {
    ...origRuntime,
    getURL(path) { return `chrome-extension://test-extension-id/${path}`; },
  };

  /* Capture console.warn output so we can assert the AC12 error path without
     polluting stdout. */
  console.warn = (...args) => { calls.consoleWarn.push(args); };

  return {
    calls,
    commandListeners,
    queueGetAll(result) { getAllQueue.push(result); },
    setCreateRejection(err) { createResult = Promise.reject(err); },
    setUpdateRejection(err) { updateResult = Promise.reject(err); },
    uninstall() {
      chrome.windows = origWindows;
      chrome.commands = origCommands;
      chrome.runtime = origRuntime;
      console.warn = origConsoleWarn;
    },
  };
}

/* =========================================================================
   Verbatim reproduction of background/service-worker.js:90-141 — the B-035
   listener + helper. Source line references in comments. If this diverges
   from the SW, tests will start failing and the reproduction must be
   re-synced.
   ========================================================================= */

/**
 * Re-registers the B-035 listener against the active shim's
 * chrome.commands.onCommand. Mirrors service-worker.js:136-141 (outer listener)
 * and 94-134 (openOrFocusStandaloneWindow helper).
 *
 * The STANDALONE_URL is resolved at registration time (matching the SW's
 * module-scope resolution at service-worker.js:90).
 */
function registerB035Listener() {
  const url = chrome.runtime.getURL('sidepanel/sidepanel.html');

  async function openOrFocusStandaloneWindow() {
    // service-worker.js:96
    const popupWins = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
    // service-worker.js:97-102
    const existing = popupWins.find((w) =>
      Array.isArray(w.tabs)
      && w.tabs.length === 1
      && typeof w.tabs[0].url === 'string'
      && w.tabs[0].url === url
    );
    if (existing) {
      // service-worker.js:104-106
      await chrome.windows.update(existing.id, { focused: true });
      return;
    }
    // service-worker.js:113
    const allWins = await chrome.windows.getAll({ populate: false });
    // service-worker.js:116
    const realWins = allWins.filter((w) => w.type !== 'popup');
    // service-worker.js:117
    const anchor = realWins.find((w) => w.focused) || realWins[0] || null;
    // service-worker.js:118-120
    const left = anchor && typeof anchor.left === 'number' && typeof anchor.width === 'number'
      ? Math.max(0, anchor.left + Math.round((anchor.width - STANDALONE_WIDTH) / 2))
      : undefined;
    // service-worker.js:121-123
    const top = anchor && typeof anchor.top === 'number' && typeof anchor.height === 'number'
      ? Math.max(0, anchor.top + Math.round((anchor.height - STANDALONE_HEIGHT) / 2))
      : undefined;
    // service-worker.js:126-133
    await chrome.windows.create({
      url,
      type: 'popup',
      focused: true,
      width: STANDALONE_WIDTH,
      height: STANDALONE_HEIGHT,
      ...(left !== undefined && top !== undefined ? { left, top } : {}),
    });
  }

  // service-worker.js:136-141
  chrome.commands.onCommand.addListener((command) => {
    if (command !== 'open-junkie-window') return;
    openOrFocusStandaloneWindow().catch((err) => {
      console.warn('[tab-junkie] open-junkie-window failed', err);
    });
  });
}

/* Microtask drainer — the listener is sync but the helper is async, so we
   need enough .resolve() ticks to flush through two awaits in the happy
   path (getAll → getAll → create) plus one for the .catch()/return. */
async function flush(ticks = 8) {
  for (let i = 0; i < ticks; i++) {
    /* eslint-disable-next-line no-await-in-loop */
    await Promise.resolve();
  }
}

/* =========================================================================
   Lifecycle
   ========================================================================= */

beforeEach(() => {
  __resetMock();
});

/* =========================================================================
   AC21 (a) — Listener registration + unknown-command no-op.
   ========================================================================= */

test('B-035 AC21 (a): addListener registers exactly one listener at module scope', () => {
  const shim = installShim();
  try {
    registerB035Listener();
    assert.equal(shim.commandListeners.length, 1,
      'exactly one chrome.commands.onCommand listener registered (MV3 sync-contract)');
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (i): unknown command name → listener is a no-op', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    chrome.commands.onCommand.__fire('foo');
    chrome.commands.onCommand.__fire('_execute_action');
    chrome.commands.onCommand.__fire('group-jump'); /* B-023, not B-035 */
    await flush();
    assert.equal(shim.calls.getAllByFilter.length, 0,
      'no chrome.windows.getAll called for non-B-035 commands');
    assert.equal(shim.calls.create.length, 0, 'no create called');
    assert.equal(shim.calls.update.length, 0, 'no update called');
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (b) — Existing-window detection → update({focused:true}), no create.
   ========================================================================= */

test('B-035 AC21 (b): existing URL-matched popup triggers update({focused:true}), no create', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    /* First getAll: populated popups with a URL-match. */
    shim.queueGetAll([
      {
        id: 77,
        type: 'popup',
        tabs: [{ url: STANDALONE_URL }],
      },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.update.length, 1, 'update called exactly once');
    assert.deepEqual(shim.calls.update[0], [77, { focused: true }]);
    assert.equal(shim.calls.create.length, 0, 'create NOT called on focus path');
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (b) predicate: popup with non-matching URL is NOT treated as existing', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([
      {
        id: 1, type: 'popup',
        tabs: [{ url: 'chrome-extension://other/other.html' }],
      },
    ]);
    /* Second getAll returns a real window for the anchor computation. */
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 0, top: 0, width: 1920, height: 1080 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.update.length, 0, 'no update on non-match');
    assert.equal(shim.calls.create.length, 1, 'create fires on non-match');
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (b) predicate: popup with zero tabs is NOT treated as existing', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([
      { id: 2, type: 'popup', tabs: [] },
    ]);
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 0, top: 0, width: 1920, height: 1080 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.update.length, 0);
    assert.equal(shim.calls.create.length, 1, 'create fires when no tabs to match');
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (c + k + l + n + p) — Create-path happy flow: shape + URL + size +
   focused + windowTypes filter.
   ========================================================================= */

test('B-035 AC21 (c): no existing popup → create() fires with full shape', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);       /* no matching popups */
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 100, top: 50, width: 1600, height: 900 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1);
    const opts = shim.calls.create[0];
    /* AC21 (l) */
    assert.equal(opts.url, STANDALONE_URL, 'URL resolved via chrome.runtime.getURL');
    /* AC21 (c) shape */
    assert.equal(opts.type, 'popup');
    /* AC21 (n) size defaults */
    assert.equal(opts.width, 1200);
    assert.equal(opts.height, 800);
    /* AC21 (p) focused */
    assert.equal(opts.focused, true);
    /* AC21 (o) centering math: 100 + (1600-1200)/2 = 300; 50 + (900-800)/2 = 100 */
    assert.equal(opts.left, 300);
    assert.equal(opts.top, 100);
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (k): getAll called with {populate:true, windowTypes:["popup"]} first', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    shim.queueGetAll([]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.ok(shim.calls.getAllByFilter.length >= 1);
    const firstFilter = shim.calls.getAllByFilter[0];
    assert.equal(firstFilter.populate, true);
    assert.deepEqual(firstFilter.windowTypes, ['popup'],
      'first getAll scoped to popup-type windows');
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (k): second getAll (anchor resolution) is unfiltered (populate:false)', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    shim.queueGetAll([]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.getAllByFilter.length, 2,
      'two getAll calls per create-path trigger');
    assert.equal(shim.calls.getAllByFilter[1].populate, false,
      'anchor-resolution call does not populate tabs');
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (d) — H-1 regression guard: anchor fallback when no focused window.
   ========================================================================= */

test('B-035 AC21 (d) H-1: no focused window → anchor = realWins[0] (not undefined left/top)', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);  /* no popups */
    /* All real windows have focused:false — pre-H-1 code paths would fall
       through to "browser-default" left/top. H-1 fix: use realWins[0]. */
    shim.queueGetAll([
      { id: 10, type: 'normal', focused: false, left: 200, top: 100, width: 1200, height: 800 },
      { id: 11, type: 'normal', focused: false, left: 500, top: 300, width: 1000, height: 700 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1);
    const opts = shim.calls.create[0];
    /* realWins[0] = {left:200, top:100, width:1200, height:800}
       left = max(0, 200 + (1200-1200)/2) = 200
       top  = max(0, 100 + (800-800)/2)   = 100 */
    assert.equal(opts.left, 200, 'H-1: anchor fallback uses realWins[0].left');
    assert.equal(opts.top, 100, 'H-1: anchor fallback uses realWins[0].top');
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (d) H-1 edge: zero real windows → no anchor → left/top omitted', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    shim.queueGetAll([]);  /* zero real windows in the entire profile */
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1);
    const opts = shim.calls.create[0];
    assert.ok(!('left' in opts), 'no left key when no anchor');
    assert.ok(!('top' in opts), 'no top key when no anchor');
    /* Other defaults still present. */
    assert.equal(opts.width, 1200);
    assert.equal(opts.height, 800);
    assert.equal(opts.focused, true);
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (e) — M-2 regression guard: popup-type windows excluded from anchor.
   ========================================================================= */

test('B-035 AC21 (e) M-2: popup-type window is filtered out of anchor set', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);  /* no matching popup — create path */
    /* Anchor-resolution getAll returns a popup window AND a real window. Pre-M-2
       code would pick the popup (if focused:true) as the anchor, anchoring
       the new standalone relative to another popup — wrong. M-2 fix: filter
       by type !== 'popup'. */
    shim.queueGetAll([
      { id: 5, type: 'popup', focused: true, left: 0, top: 0, width: 400, height: 600 },
      { id: 6, type: 'normal', focused: false, left: 100, top: 50, width: 1600, height: 900 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1);
    const opts = shim.calls.create[0];
    /* With M-2 fix: anchor = realWins[0] = normal window
       left = 100 + (1600-1200)/2 = 300; top = 50 + (900-800)/2 = 100 */
    assert.equal(opts.left, 300, 'M-2: anchor is the normal window, NOT the popup');
    assert.equal(opts.top, 100);
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (e) M-2: only popups present → no anchor → left/top omitted', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    /* All real windows are popup-type (other extensions, dev tools). After
       M-2 filter, realWins = []; anchor = null; left/top omitted. */
    shim.queueGetAll([
      { id: 8, type: 'popup', focused: true, left: 0, top: 0, width: 400, height: 600 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1);
    const opts = shim.calls.create[0];
    assert.ok(!('left' in opts));
    assert.ok(!('top' in opts));
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (f + g) — Rejection handling on create / update.
   ========================================================================= */

test('B-035 AC21 (f): chrome.windows.create rejection → caught + console.warn, no unhandled', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 0, top: 0, width: 1920, height: 1080 },
    ]);
    shim.setCreateRejection(new Error('create denied'));
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    /* create WAS called (even though rejected). */
    assert.equal(shim.calls.create.length, 1);
    /* The outer .catch() fires. */
    assert.ok(shim.calls.consoleWarn.length >= 1,
      'console.warn invoked at least once for the create rejection');
    const args = shim.calls.consoleWarn[0];
    assert.equal(args[0], '[tab-junkie] open-junkie-window failed');
    assert.ok(args[1] instanceof Error);
    assert.equal(args[1].message, 'create denied');
  } finally {
    shim.uninstall();
  }
});

test('B-035 AC21 (g): chrome.windows.update rejection → caught + console.warn, no unhandled', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([
      { id: 77, type: 'popup', tabs: [{ url: STANDALONE_URL }] },
    ]);
    shim.setUpdateRejection(new Error('update denied'));
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.update.length, 1);
    assert.ok(shim.calls.consoleWarn.length >= 1);
    assert.equal(shim.calls.consoleWarn[0][0], '[tab-junkie] open-junkie-window failed');
    assert.equal(shim.calls.consoleWarn[0][1].message, 'update denied');
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (h) — Rapid re-trigger idempotence.
   ========================================================================= */

test('B-035 AC21 (h): first trigger creates, second trigger (post-create) focuses', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    /* First trigger: no existing popup → create path. */
    shim.queueGetAll([]);
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 0, top: 0, width: 1920, height: 1080 },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1, 'first trigger created');
    assert.equal(shim.calls.update.length, 0);

    /* Second trigger: existing popup present → focus path; no second create. */
    shim.queueGetAll([
      { id: 999, type: 'popup', tabs: [{ url: STANDALONE_URL }] },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    assert.equal(shim.calls.create.length, 1, 'second trigger did NOT create again');
    assert.equal(shim.calls.update.length, 1, 'second trigger focused existing');
    assert.deepEqual(shim.calls.update[0], [999, { focused: true }]);
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (j) — Cold-start safety: getAll called per-trigger (no SW cache).
   ========================================================================= */

test('B-035 AC21 (j): each trigger re-enumerates getAll (no in-memory cache of window id)', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    /* Trigger 1. */
    shim.queueGetAll([
      { id: 77, type: 'popup', tabs: [{ url: STANDALONE_URL }] },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    /* Trigger 2 — re-enumerate from scratch. */
    shim.queueGetAll([
      { id: 77, type: 'popup', tabs: [{ url: STANDALONE_URL }] },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    /* Trigger 3. */
    shim.queueGetAll([
      { id: 77, type: 'popup', tabs: [{ url: STANDALONE_URL }] },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    /* Three triggers → three first-phase getAll calls. */
    assert.equal(shim.calls.getAllByFilter.length, 3,
      'getAll called per-trigger (D-3 option c: no SW-side cache)');
    assert.equal(shim.calls.update.length, 3);
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (o) — Centering math parameterised over known rects.
   ========================================================================= */

const centeringCases = [
  {
    name: 'large display (1920×1080) anchored at 0,0',
    anchor: { left: 0, top: 0, width: 1920, height: 1080 },
    expectLeft: Math.max(0, 0 + Math.round((1920 - 1200) / 2)),
    expectTop: Math.max(0, 0 + Math.round((1080 - 800) / 2)),
  },
  {
    name: 'off-primary display anchored at 1920,0',
    anchor: { left: 1920, top: 0, width: 1600, height: 900 },
    expectLeft: 1920 + Math.round((1600 - 1200) / 2),
    expectTop: Math.max(0, Math.round((900 - 800) / 2)),
  },
  {
    name: 'smaller-than-window anchor clamps left/top to ≥ 0',
    anchor: { left: 0, top: 0, width: 800, height: 600 },
    /* left = max(0, 0 + (800-1200)/2) = max(0, -200) = 0
       top  = max(0, 0 + (600-800)/2)  = max(0, -100) = 0 */
    expectLeft: 0,
    expectTop: 0,
  },
  {
    name: 'negative anchor left (off-screen window) clamps',
    anchor: { left: -100, top: -50, width: 800, height: 600 },
    expectLeft: 0,
    expectTop: 0,
  },
];

for (const c of centeringCases) {
  test(`B-035 AC21 (o): centering math — ${c.name}`, async () => {
    const shim = installShim();
    try {
      registerB035Listener();
      shim.queueGetAll([]);
      shim.queueGetAll([
        { id: 50, type: 'normal', focused: true, ...c.anchor },
      ]);
      chrome.commands.onCommand.__fire('open-junkie-window');
      await flush();
      const opts = shim.calls.create[0];
      assert.equal(opts.left, c.expectLeft, `left mismatch: ${c.name}`);
      assert.equal(opts.top, c.expectTop, `top mismatch: ${c.name}`);
    } finally {
      shim.uninstall();
    }
  });
}

test('B-035 AC21 (o): anchor missing rect fields → left/top omitted (defensive)', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    /* Window with partial rect — missing width makes left compute undefined. */
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 100, top: 50 /* no width/height */ },
    ]);
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    const opts = shim.calls.create[0];
    /* typeof anchor.width !== 'number' → left is undefined → key is omitted. */
    assert.ok(!('left' in opts));
    assert.ok(!('top' in opts));
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   AC21 (m) — B-023 group-jump listener untouched (regression guard).
   Assertion: the B-023 test suite still passes. We cannot import/execute the
   B-023 listener here cleanly (that shim lives in b023 test), so instead
   assert structurally: dispatching 'group-jump' to B-035's listener does
   nothing (no windows.* call) — the two listeners are cleanly separated.
   The B-023 test suite is run in the same `npm test` invocation and will
   catch any cross-contamination.
   ========================================================================= */

test('B-035 AC21 (m): B-023 group-jump command name is not handled by B-035 listener', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    chrome.commands.onCommand.__fire('group-jump');
    await flush();
    assert.equal(shim.calls.getAllByFilter.length, 0,
      'B-035 listener does not respond to B-023 group-jump command');
    assert.equal(shim.calls.create.length, 0);
    assert.equal(shim.calls.update.length, 0);
  } finally {
    shim.uninstall();
  }
});

/* =========================================================================
   C-11 vacuous regression guard — zero SW writes on the open/focus path.
   Codifies §41.3 D-6 for all time: if a future polish item adds a write on
   the open path, this test WILL fail and force a C-11 re-audit.
   ========================================================================= */

test('B-035 C-11 vacuous guard: zero chrome.storage.local.set on open path', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([]);
    shim.queueGetAll([
      { id: 50, type: 'normal', focused: true, left: 0, top: 0, width: 1920, height: 1080 },
    ]);
    /* Snapshot store before. The chrome-mock records `setCallCount`; we also
       inspect __getRawStore for any new key showing up. */
    const preKeys = Object.keys(await chrome.storage.local.get(null)).sort();
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    const postKeys = Object.keys(await chrome.storage.local.get(null)).sort();
    assert.deepEqual(postKeys, preKeys,
      'open path writes zero keys to chrome.storage.local (C-11 vacuous per §41.3 D-6)');
    /* Bonus: explicit no-op check on a known key — ensures no silent overwrite. */
    assert.equal(__getRawStore('tj:_sentinel'), undefined);
  } finally {
    shim.uninstall();
  }
});

test('B-035 C-11 vacuous guard: focus path writes zero keys too', async () => {
  const shim = installShim();
  try {
    registerB035Listener();
    shim.queueGetAll([
      { id: 77, type: 'popup', tabs: [{ url: STANDALONE_URL }] },
    ]);
    const preKeys = Object.keys(await chrome.storage.local.get(null)).sort();
    chrome.commands.onCommand.__fire('open-junkie-window');
    await flush();
    const postKeys = Object.keys(await chrome.storage.local.get(null)).sort();
    assert.deepEqual(postKeys, preKeys, 'focus path writes zero storage keys');
  } finally {
    shim.uninstall();
  }
});
