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
        if (!win || typeof win.id !== 'number') return;
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
  if (!Number.isFinite(payload.windowId)) return false;
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
});
