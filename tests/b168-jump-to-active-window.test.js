/**
 * b168-jump-to-active-window.test.js — B-168 (S46) Jump to active window.
 *
 * Coverage (maps to docs/findings/sprint-46.md "R1 LOCKED — Jump to active
 * window (B-168)" + docs/design/72-b-168-jump-to-active-window.md §72.9):
 *
 *   T1 (AC1): popup click → MSG_JUMP_TO_ACTIVE_WINDOW dispatched with
 *             {windowId} payload BEFORE window.close() (C-11).
 *   T2 (AC2): SW chrome.commands.onCommand('jump-to-active-window') →
 *             getLastFocused → MSG_JUMP_TO_ACTIVE_WINDOW dispatched.
 *   T3 (AC3): sidepanel onMessage handler — valid payload routes through
 *             _isValidJumpPayload to _jumpToActiveWindow with the right id.
 *   T4 (AC4): _jumpToActiveWindow match path → scrollIntoView called +
 *             `item-row--jump-highlight` class added then removed after 600 ms.
 *   T5 (AC5): _jumpToActiveWindow empty path → showToast called with
 *             expected message; scrollIntoView NOT called.
 *   T6 (AC6): manifest.json contains `jump-to-active-window` command with
 *             suggested_key.default === 'Alt+W'.
 *   T7 (AC7): MSG_JUMP_TO_ACTIVE_WINDOW constant exported from
 *             shared/messages.js with value 'tj/jumpToActiveWindow'.
 *
 *   Plus C-7 allow-list coverage on _isValidJumpPayload (T6b).
 *
 * Strategy: same shim pattern as b097-settings-shortcut.test.js +
 * b035-standalone-window.test.js. The popup click handler, the SW listener
 * branch, and the sidepanel onMessage branch are each reproduced inline so
 * the tests run in node:test without DOM bootstrap of the actual modules.
 * Divergence is a test gap; UAT covers the integration of the live code.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  installChromeMock,
  __resetMock,
  __getSendMessageCalls,
} from './chrome-mock.js';

import { MSG_JUMP_TO_ACTIVE_WINDOW } from '../shared/messages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* =========================================================================
   T7 (AC7) — message constant export
   ========================================================================= */

test('B-168 T7 (AC7): MSG_JUMP_TO_ACTIVE_WINDOW exported with namespaced value', () => {
  assert.strictEqual(
    MSG_JUMP_TO_ACTIVE_WINDOW,
    'tj/jumpToActiveWindow',
    'MSG_JUMP_TO_ACTIVE_WINDOW must equal "tj/jumpToActiveWindow"',
  );
});

/* =========================================================================
   T6 (AC6) — manifest command + Alt+W binding
   ========================================================================= */

test('B-168 T6 (AC6): manifest.json registers jump-to-active-window with Alt+W default', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  assert.ok(
    manifest.commands && typeof manifest.commands['jump-to-active-window'] === 'object',
    'manifest.commands must contain jump-to-active-window',
  );
  const entry = manifest.commands['jump-to-active-window'];
  assert.ok(entry.suggested_key, 'jump-to-active-window must declare suggested_key');
  assert.strictEqual(
    entry.suggested_key.default,
    'Alt+W',
    'suggested_key.default must be "Alt+W"',
  );
  assert.strictEqual(
    typeof entry.description,
    'string',
    'jump-to-active-window must declare a description',
  );
});

test('B-168 T6 (AC6): manifest.json adds no new permissions', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8');
  const manifest = JSON.parse(raw);
  /* chrome.commands is available in MV3 without a permission entry. The
     baseline matches b097-settings-shortcut AC1-c — B-168 adds zero. */
  const expected = ['tabs', 'tabGroups', 'storage', 'sidePanel', 'search', 'favicon', 'idle'];
  assert.deepEqual(
    manifest.permissions.slice().sort(),
    expected.slice().sort(),
    'manifest.permissions must match the existing baseline (B-168 adds none)',
  );
});

/* =========================================================================
   T1 (AC1) — popup button click handler
   ========================================================================= */

/**
 * Inline reproduction of popup.js _onJumpToWindowClick. Mirrors the live
 * code shape; any divergence is a test gap. The handler resolves the
 * popup's host window via chrome.windows.getCurrent, fires
 * MSG_JUMP_TO_ACTIVE_WINDOW (fire-and-forget), then calls window.close().
 */
async function runPopupJumpClick(closeFn) {
  let windowId;
  try {
    const currentWindow = await chrome.windows.getCurrent({ populate: false }); // eslint-disable-line no-undef
    windowId = currentWindow && currentWindow.id;
  } catch {
    closeFn();
    return;
  }
  if (typeof windowId !== 'number') {
    closeFn();
    return;
  }
  /* C-11: fire BEFORE close; no await between sendMessage and close. */
  chrome.runtime.sendMessage({ // eslint-disable-line no-undef
    type: MSG_JUMP_TO_ACTIVE_WINDOW,
    payload: { windowId },
  }).catch(() => { /* swallow */ });
  closeFn();
}

test('B-168 T1 (AC1): popup click dispatches MSG_JUMP_TO_ACTIVE_WINDOW with correct windowId before window.close()', async () => {
  installChromeMock();
  __resetMock();
  /* Override getCurrent to return a deterministic windowId. */
  const origGetCurrent = globalThis.chrome.windows.getCurrent;
  globalThis.chrome.windows.getCurrent = async () => ({ id: 42 });

  let sendMessageFiredBeforeClose = false;
  let closed = false;
  const closeFn = () => {
    sendMessageFiredBeforeClose = __getSendMessageCalls().length > 0;
    closed = true;
  };

  try {
    await runPopupJumpClick(closeFn);
  } finally {
    globalThis.chrome.windows.getCurrent = origGetCurrent;
  }

  assert.equal(closed, true, 'window.close must be invoked');
  assert.equal(sendMessageFiredBeforeClose, true,
    'sendMessage must fire BEFORE window.close (C-11)');

  const calls = __getSendMessageCalls();
  assert.equal(calls.length, 1, 'exactly one sendMessage call expected');
  const [msg] = calls[0];
  assert.deepEqual(msg, {
    type: MSG_JUMP_TO_ACTIVE_WINDOW,
    payload: { windowId: 42 },
  }, 'sendMessage payload must carry the resolved windowId');
});

test('B-168 T1b: popup handler closes silently when getCurrent rejects (no message dispatched)', async () => {
  installChromeMock();
  __resetMock();
  const origGetCurrent = globalThis.chrome.windows.getCurrent;
  globalThis.chrome.windows.getCurrent = async () => {
    throw new Error('no current window');
  };

  let closed = false;
  try {
    await runPopupJumpClick(() => { closed = true; });
  } finally {
    globalThis.chrome.windows.getCurrent = origGetCurrent;
  }

  assert.equal(closed, true, 'popup must still close on failure');
  assert.equal(__getSendMessageCalls().length, 0,
    'no message must fire when window resolution fails');
});

/* =========================================================================
   T2 (AC2) — SW chrome.commands.onCommand branch
   ========================================================================= */

/**
 * Inline reproduction of the SW onCommand branch added in
 * background/service-worker.js for B-168. Mirrors the live code shape.
 */
function installB168CommandShim() {
  const listeners = [];
  globalThis.chrome.commands = {
    onCommand: {
      addListener(fn) { listeners.push(fn); },
    },
  };

  globalThis.chrome.commands.onCommand.addListener((cmd) => {
    if (cmd === 'open-junkie-settings') return; // not our concern
    if (cmd === 'jump-to-active-window') {
      chrome.windows.getLastFocused({ populate: false }).then((win) => { // eslint-disable-line no-undef
        /* H-1 mirror: guard WINDOW_ID_NONE (-1). */
        if (!win || typeof win.id !== 'number' || win.id <= 0) return;
        chrome.runtime.sendMessage({ // eslint-disable-line no-undef
          type: MSG_JUMP_TO_ACTIVE_WINDOW,
          payload: { windowId: win.id },
        }).catch(() => { /* swallow */ });
      }).catch(() => { /* swallow */ });
      return;
    }
  });

  return {
    fire(cmd) { for (const fn of listeners) fn(cmd); },
  };
}

test('B-168 T2 (AC2): SW onCommand fires getLastFocused + dispatches MSG_JUMP_TO_ACTIVE_WINDOW', async () => {
  installChromeMock();
  __resetMock();

  /* Override getLastFocused — chrome-mock does not provide one by default. */
  const origWindows = globalThis.chrome.windows;
  globalThis.chrome.windows = {
    ...origWindows,
    getLastFocused: async () => ({ id: 99 }),
  };

  const shim = installB168CommandShim();
  try {
    shim.fire('jump-to-active-window');
    /* Flush microtasks for the getLastFocused → sendMessage chain. */
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    globalThis.chrome.windows = origWindows;
  }

  const calls = __getSendMessageCalls();
  assert.equal(calls.length, 1, 'one sendMessage expected from SW path');
  const [msg] = calls[0];
  assert.deepEqual(msg, {
    type: MSG_JUMP_TO_ACTIVE_WINDOW,
    payload: { windowId: 99 },
  }, 'SW must dispatch MSG_JUMP_TO_ACTIVE_WINDOW with the active windowId');
});

test('B-168 T2b: SW onCommand ignores commands other than jump-to-active-window', async () => {
  installChromeMock();
  __resetMock();

  const origWindows = globalThis.chrome.windows;
  let getLastFocusedCalls = 0;
  globalThis.chrome.windows = {
    ...origWindows,
    getLastFocused: async () => { getLastFocusedCalls += 1; return { id: 99 }; },
  };

  const shim = installB168CommandShim();
  try {
    shim.fire('group-jump');
    shim.fire('open-junkie-window');
    shim.fire('_execute_action');
    await Promise.resolve();
  } finally {
    globalThis.chrome.windows = origWindows;
  }

  assert.equal(getLastFocusedCalls, 0, 'getLastFocused must not be called for unrelated commands');
  assert.equal(__getSendMessageCalls().length, 0, 'no jump messages expected for unrelated commands');
});

test('B-168 T2c (H-1 regression guard): SW skips dispatch when getLastFocused returns WINDOW_ID_NONE (-1)', async () => {
  installChromeMock();
  __resetMock();

  /* WINDOW_ID_NONE (-1) is returned by Chromium when no browser window is
     currently focused (system tray, alt-tabbed away to another app). The SW
     MUST guard this case and skip the sendMessage; the sidepanel validator
     would reject ≤ 0 downstream, but the SW-side guard saves a fire-and-
     forget round-trip and pins the contract. */
  const origWindows = globalThis.chrome.windows;
  globalThis.chrome.windows = {
    ...origWindows,
    getLastFocused: async () => ({ id: -1 }),
  };

  const shim = installB168CommandShim();
  try {
    shim.fire('jump-to-active-window');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    globalThis.chrome.windows = origWindows;
  }

  assert.equal(__getSendMessageCalls().length, 0,
    'SW must not dispatch MSG_JUMP_TO_ACTIVE_WINDOW when getLastFocused returns -1');
});

/* =========================================================================
   T3 (AC3) + T4 (AC4) + T5 (AC5) — sidepanel onMessage + _jumpToActiveWindow
   ========================================================================= */

/**
 * Inline reproductions of the sidepanel helpers. Mirrors the live shape
 * in sidepanel/sidepanel.js. _isValidJumpPayload is the C-7 allow-list.
 */
function _isValidJumpPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.windowId !== 'number') return false;
  /* M-2 mirror: integer-only — also subsumes finite + non-NaN. */
  if (!Number.isInteger(payload.windowId)) return false;
  if (payload.windowId <= 0) return false;
  return true;
}

function makeFakeRow() {
  /** Minimal stand-in for an HTMLElement supporting the operations the
   *  helper exercises: classList add/remove + scrollIntoView. */
  const classes = new Set();
  let scrollArgs = null;
  return {
    scrollIntoView(opts) { scrollArgs = opts; },
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      has(c) { return classes.has(c); },
    },
    __getScrollArgs() { return scrollArgs; },
    __getClasses() { return classes; },
  };
}

function makeFakeItemList(rowByWindowId) {
  return {
    querySelector(selector) {
      /* Parse [data-window-id="N"] — only selector shape the helper uses. */
      const m = /^\[data-window-id="(\d+)"\]$/.exec(selector);
      if (!m) return null;
      const id = Number(m[1]);
      return rowByWindowId.get(id) || null;
    },
  };
}

function makeJumpHarness({ rows, toastSpy }) {
  const itemListEl = makeFakeItemList(rows);
  function showToast(message) { toastSpy.calls.push(message); }
  function _jumpToActiveWindow(windowId) {
    const target = itemListEl.querySelector(`[data-window-id="${windowId}"]`);
    if (!target) { showToast('No tabs from the current window are visible here.'); return; }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.add('item-row--jump-highlight');
    setTimeout(() => { target.classList.remove('item-row--jump-highlight'); }, 600);
  }
  return { _jumpToActiveWindow };
}

test('B-168 T3 (AC3): valid payload routes to _jumpToActiveWindow with the right windowId', () => {
  const row = makeFakeRow();
  const rows = new Map([[42, row]]);
  const toastSpy = { calls: [] };
  const harness = makeJumpHarness({ rows, toastSpy });

  /* Simulated onMessage branch: validate then dispatch. */
  const msg = { type: MSG_JUMP_TO_ACTIVE_WINDOW, payload: { windowId: 42 } };
  if (msg.type === MSG_JUMP_TO_ACTIVE_WINDOW && _isValidJumpPayload(msg.payload)) {
    harness._jumpToActiveWindow(msg.payload.windowId);
  }

  assert.deepEqual(row.__getScrollArgs(), { block: 'start', behavior: 'smooth' },
    'scrollIntoView must be called with block:start + behavior:smooth');
  assert.equal(toastSpy.calls.length, 0, 'no toast on match path');
});

test('B-168 T4 (AC4): jump path adds .item-row--jump-highlight then removes it after 600 ms', async () => {
  const row = makeFakeRow();
  const rows = new Map([[7, row]]);
  const toastSpy = { calls: [] };
  const harness = makeJumpHarness({ rows, toastSpy });

  harness._jumpToActiveWindow(7);

  assert.equal(row.__getClasses().has('item-row--jump-highlight'), true,
    'flash class added immediately after scrollIntoView');

  /* Wait > 600 ms for the setTimeout cleanup. */
  await new Promise((r) => setTimeout(r, 650));

  assert.equal(row.__getClasses().has('item-row--jump-highlight'), false,
    'flash class removed after 600 ms');
});

test('B-168 T5 (AC5): empty-state path calls showToast and skips scrollIntoView', () => {
  const rows = new Map(); // no matches
  const toastSpy = { calls: [] };
  const harness = makeJumpHarness({ rows, toastSpy });

  harness._jumpToActiveWindow(123);

  assert.deepEqual(toastSpy.calls, [
    'No tabs from the current window are visible here.',
  ], 'empty-state toast text must match the spec');
});

/* =========================================================================
   T6b (C-7) — _isValidJumpPayload allow-list coverage
   ========================================================================= */

test('B-168 T6b (C-7): _isValidJumpPayload accepts finite positive integers only', () => {
  assert.equal(_isValidJumpPayload({ windowId: 1 }), true, '1 accepted');
  assert.equal(_isValidJumpPayload({ windowId: 9999 }), true, 'large positive accepted');

  assert.equal(_isValidJumpPayload(null), false, 'null rejected');
  assert.equal(_isValidJumpPayload(undefined), false, 'undefined rejected');
  assert.equal(_isValidJumpPayload({}), false, 'missing windowId rejected');
  assert.equal(_isValidJumpPayload({ windowId: '1' }), false, 'string rejected');
  assert.equal(_isValidJumpPayload({ windowId: 0 }), false, 'zero rejected');
  assert.equal(_isValidJumpPayload({ windowId: -1 }), false, 'negative rejected');
  assert.equal(_isValidJumpPayload({ windowId: NaN }), false, 'NaN rejected');
  assert.equal(_isValidJumpPayload({ windowId: Infinity }), false, 'Infinity rejected');
  /* M-2 contract: floats rejected — Chrome windowIds are always integers. */
  assert.equal(_isValidJumpPayload({ windowId: 1.5 }), false, 'float rejected');
});

/* =========================================================================
   T8 (R5 gap-filler — M-2 rapid-click guard)

   Live popup.js:972-1004 uses the `_jumpingToWindow` boolean to swallow
   re-entrant clicks. Re-creates the same gate inline; verifies that
   three rapid clicks produce exactly one MSG_JUMP_TO_ACTIVE_WINDOW
   dispatch + one window.close().
   ========================================================================= */

function makeRapidClickPopupHandler() {
  let jumping = false;
  let closes = 0;
  async function handler(closeFn) {
    if (jumping) return;
    jumping = true;
    let windowId;
    try {
      const w = await chrome.windows.getCurrent({ populate: false }); // eslint-disable-line no-undef
      windowId = w && w.id;
    } catch {
      jumping = false;
      closeFn(); closes += 1;
      return;
    }
    if (typeof windowId !== 'number') {
      jumping = false;
      closeFn(); closes += 1;
      return;
    }
    chrome.runtime.sendMessage({ // eslint-disable-line no-undef
      type: MSG_JUMP_TO_ACTIVE_WINDOW,
      payload: { windowId },
    }).catch(() => {});
    closeFn(); closes += 1;
  }
  return { handler, getCloseCount: () => closes };
}

test('B-168 T8 (M-2 rapid-click guard): three rapid clicks dispatch exactly one message', async () => {
  installChromeMock();
  __resetMock();
  const origGetCurrent = globalThis.chrome.windows.getCurrent;
  /* Slow getCurrent simulates the await window during which a second
     click would arrive in production. */
  globalThis.chrome.windows.getCurrent = async () => {
    await new Promise((r) => setTimeout(r, 20));
    return { id: 17 };
  };

  const { handler, getCloseCount } = makeRapidClickPopupHandler();
  const closeFn = () => {};

  try {
    /* Fire three "clicks" with no awaits between — they share the same
       microtask turn. The first click flips _jumpingToWindow before the
       await yields; clicks 2 and 3 should early-return. */
    const p1 = handler(closeFn);
    const p2 = handler(closeFn);
    const p3 = handler(closeFn);
    await Promise.all([p1, p2, p3]);
  } finally {
    globalThis.chrome.windows.getCurrent = origGetCurrent;
  }

  const calls = __getSendMessageCalls();
  assert.equal(calls.length, 1, 'exactly one sendMessage despite three rapid clicks');
  assert.equal(getCloseCount(), 1, 'window.close called exactly once');
  assert.deepEqual(calls[0][0], {
    type: MSG_JUMP_TO_ACTIVE_WINDOW,
    payload: { windowId: 17 },
  }, 'the single dispatched message carries the resolved windowId');
});

/* =========================================================================
   T9 (R5 gap-filler — M-1 empty-state toast durationMs contract)

   Live sidepanel.js:7157 passes `{ durationMs: 3000 }` explicitly so the
   AC5 3-second contract is pinned against any future showToast default
   change. Asserts both the message text and the options object.
   ========================================================================= */

function makeJumpHarnessWithToastOpts({ rows, toastSpy }) {
  const itemListEl = makeFakeItemList(rows);
  function showToast(message, opts) {
    toastSpy.calls.push({ message, opts });
  }
  function _jumpToActiveWindow(windowId) {
    const target = itemListEl.querySelector(`[data-window-id="${windowId}"]`);
    if (!target) {
      showToast('No tabs from the current window are visible here.', { durationMs: 3000 });
      return;
    }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.add('item-row--jump-highlight');
    if (typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
    setTimeout(() => { target.classList.remove('item-row--jump-highlight'); }, 600);
  }
  return { _jumpToActiveWindow };
}

test('B-168 T9 (M-1): empty-state toast passes durationMs:3000 explicitly', () => {
  const rows = new Map();
  const toastSpy = { calls: [] };
  const harness = makeJumpHarnessWithToastOpts({ rows, toastSpy });

  harness._jumpToActiveWindow(42);

  assert.equal(toastSpy.calls.length, 1, 'one toast call');
  assert.equal(
    toastSpy.calls[0].message,
    'No tabs from the current window are visible here.',
    'message text matches §72.3.4 spec',
  );
  assert.deepEqual(
    toastSpy.calls[0].opts,
    { durationMs: 3000 },
    'durationMs:3000 must be passed explicitly to pin the AC5 contract',
  );
});

test('B-168 T9b (M-1): live sidepanel.js source pins durationMs:3000 on the empty-state toast', () => {
  /* Source-truth assertion: the inline shim mirrors live code, but this
     test goes further and asserts the live source carries the literal
     durationMs option so the contract cannot regress to the default. */
  const src = fs.readFileSync(
    path.join(ROOT, 'sidepanel', 'sidepanel.js'),
    'utf8',
  );
  /* Locate the empty-state showToast call. */
  const re = /showToast\(\s*'No tabs from the current window are visible here\.'\s*,\s*\{\s*durationMs:\s*3000\s*\}\s*\)/;
  assert.ok(
    re.test(src),
    'sidepanel.js empty-state showToast must pass { durationMs: 3000 }',
  );
});

/* =========================================================================
   T10 (R5 gap-filler — L-1 focus management on match path)

   Live sidepanel.js:7165 calls target.focus({ preventScroll: true })
   immediately after scrollIntoView so keyboard users land on the row.
   ========================================================================= */

function makeFakeRowWithFocus() {
  const classes = new Set();
  let scrollArgs = null;
  let focusOpts = null;
  let focusCount = 0;
  return {
    scrollIntoView(opts) { scrollArgs = opts; },
    focus(opts) { focusCount += 1; focusOpts = opts; },
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      has(c) { return classes.has(c); },
    },
    __getScrollArgs() { return scrollArgs; },
    __getFocusOpts() { return focusOpts; },
    __getFocusCount() { return focusCount; },
  };
}

test('B-168 T10 (L-1): match-path calls target.focus({ preventScroll: true }) after scrollIntoView', () => {
  const row = makeFakeRowWithFocus();
  const rows = new Map([[55, row]]);
  const toastSpy = { calls: [] };
  const harness = makeJumpHarnessWithToastOpts({ rows, toastSpy });

  harness._jumpToActiveWindow(55);

  assert.equal(row.__getFocusCount(), 1, 'focus called exactly once on the matched row');
  assert.deepEqual(
    row.__getFocusOpts(),
    { preventScroll: true },
    'focus called with preventScroll:true to avoid re-scrolling after the smooth scrollIntoView',
  );
  assert.deepEqual(
    row.__getScrollArgs(),
    { block: 'start', behavior: 'smooth' },
    'scrollIntoView still uses block:start + behavior:smooth',
  );
});

test('B-168 T10b (L-1): live sidepanel.js source pins target.focus({ preventScroll: true })', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'sidepanel', 'sidepanel.js'),
    'utf8',
  );
  const re = /target\.focus\(\s*\{\s*preventScroll:\s*true\s*\}\s*\)/;
  assert.ok(
    re.test(src),
    'sidepanel.js match path must call target.focus({ preventScroll: true })',
  );
});

/* =========================================================================
   T11 (R5 gap-filler — prefers-reduced-motion CSS path)

   §72.3.3 spec: when prefers-reduced-motion is reduce, the flash class
   skips the keyframe animation and applies the colour change instantly.
   The 600 ms setTimeout removal still runs regardless. CSS-only path —
   asserted against sidepanel.css source.
   ========================================================================= */

test('B-168 T11 (a11y): sidepanel.css declares the keyframe + the prefers-reduced-motion override', () => {
  const css = fs.readFileSync(
    path.join(ROOT, 'sidepanel', 'sidepanel.css'),
    'utf8',
  );

  /* The keyframe rule. */
  assert.ok(
    /@keyframes\s+item-row-jump-pulse\s*\{/.test(css),
    'item-row-jump-pulse keyframe must be declared',
  );

  /* The default class uses the keyframe at 600ms. */
  const defaultRe = /\.item-row--jump-highlight\s*\{[^}]*animation:\s*item-row-jump-pulse\s+600ms[^}]*\}/;
  assert.ok(
    defaultRe.test(css),
    '.item-row--jump-highlight default rule must apply item-row-jump-pulse 600ms',
  );

  /* The reduced-motion override disables the animation and falls back
     to an instant colour swap. */
  const reducedRe = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[^]*?\.item-row--jump-highlight\s*\{[^}]*animation:\s*none[^}]*\}/;
  assert.ok(
    reducedRe.test(css),
    'prefers-reduced-motion: reduce must override .item-row--jump-highlight with animation:none',
  );
});
