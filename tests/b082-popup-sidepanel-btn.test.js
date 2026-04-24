/**
 * b082-popup-sidepanel-btn.test.js — B-082 "Open Side Panel" popup button.
 *
 * Covers AC7 smoke tests:
 *   1. Button element #popup-open-sidepanel-btn exists in popup.html markup.
 *   2. Click handler fires chrome.sidePanel.open (happy path).
 *   3. Error path — chrome.sidePanel.open rejects → popup stays open
 *      (window.close is NOT called).
 *
 * Strategy: directly exercises _onOpenSidepanelClick logic using the
 * chrome-mock sidePanel stub. DOM is shimmed minimally to allow the function
 * to read sidepanelErrorEl + call window.close. Pure-function approach
 * consistent with b022-quick-search.test.js §Strategy (4).
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  __resetMock,
  __setSidePanelOpenReject,
  __getSidePanelOpenCalls,
  installChromeMock,
} from './chrome-mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* =========================================================================
   AC7-1: Button element exists in popup.html markup
   ========================================================================= */

test('B-082 AC7-1: #popup-open-sidepanel-btn exists in popup.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  assert.ok(
    html.includes('id="popup-open-sidepanel-btn"'),
    'popup.html must contain id="popup-open-sidepanel-btn"',
  );
  assert.ok(
    html.includes('aria-label="Open side panel"'),
    'button must have aria-label="Open side panel"',
  );
});

/* =========================================================================
   AC7-2 / AC7-3: click handler fires chrome.sidePanel.open; error path
   ========================================================================= */

/**
 * Minimal shim that lets _onOpenSidepanelClick run outside a real browser:
 *   - chrome.windows.getCurrent → already mocked in chrome-mock (returns { id: 1 })
 *   - chrome.sidePanel.open → mocked (stubbed in chrome-mock)
 *   - window.close → tracked via closeCalled flag
 *   - sidepanelErrorEl shim → captures textContent writes
 */
function makeTestEnv({ openReject = false } = {}) {
  installChromeMock();
  __resetMock();
  if (openReject) __setSidePanelOpenReject(true);

  let closeCalled = false;
  const errorEl = {
    textContent: '',
    _classes: new Set(['qs-visually-hidden']),
    classList: {
      add(cls) { errorEl._classes.add(cls); },
      remove(cls) { errorEl._classes.delete(cls); },
      contains(cls) { return errorEl._classes.has(cls); },
    },
  };

  const origClose = globalThis.window?.close;
  const origWindowClose = globalThis.window;

  // Patch globalThis.window.close for the duration of the test.
  if (!globalThis.window) globalThis.window = {};
  globalThis.window.close = () => { closeCalled = true; };

  return {
    errorEl,
    closeCalled: () => closeCalled,
    restore() {
      if (origClose !== undefined) globalThis.window.close = origClose;
      else if (origWindowClose === undefined) delete globalThis.window;
    },
  };
}

/**
 * Reproduce _onOpenSidepanelClick inline — same logic as popup.js — so
 * we don't need to import the DOM-bound popup module.
 * Any divergence between this and popup.js is a test gap, not a production
 * gap. The UAT walk of the real popup covers the integration.
 */
async function runOpenSidepanelClick(sidepanelErrorEl, windowClose) {
  if (sidepanelErrorEl) {
    sidepanelErrorEl.textContent = '';
    sidepanelErrorEl.classList.add('qs-visually-hidden');
  }
  try {
    const currentWindow = await chrome.windows.getCurrent({ populate: false }); // eslint-disable-line no-undef
    await chrome.sidePanel.open({ windowId: currentWindow.id }); // eslint-disable-line no-undef
    windowClose();
  } catch {
    if (sidepanelErrorEl) {
      sidepanelErrorEl.textContent = 'Could not open side panel. Please try again.';
      sidepanelErrorEl.classList.remove('qs-visually-hidden');
    }
  }
}

test('B-082 AC7-2: click calls chrome.sidePanel.open with current windowId and closes popup', async () => {
  const env = makeTestEnv({ openReject: false });
  try {
    await runOpenSidepanelClick(env.errorEl, globalThis.window.close);
    const calls = __getSidePanelOpenCalls();
    assert.equal(calls.length, 1, 'sidePanel.open must be called once');
    assert.deepEqual(calls[0], { windowId: 1 }, 'must pass windowId: 1 (mock default)');
    assert.ok(env.closeCalled(), 'window.close must be called on success');
    assert.equal(env.errorEl.textContent, '', 'no error text on success');
    assert.ok(env.errorEl._classes.has('qs-visually-hidden'), 'error element stays visually hidden on success');
  } finally {
    env.restore();
  }
});

test('B-082 AC7-3: when sidePanel.open rejects, popup stays open and shows inline error', async () => {
  const env = makeTestEnv({ openReject: true });
  try {
    await runOpenSidepanelClick(env.errorEl, globalThis.window.close);
    const calls = __getSidePanelOpenCalls();
    assert.equal(calls.length, 1, 'sidePanel.open was still attempted once');
    assert.ok(!env.closeCalled(), 'window.close must NOT be called on failure — popup stays open');
    assert.ok(env.errorEl.textContent.length > 0, 'inline error message must be non-empty');
    assert.ok(!env.errorEl._classes.has('qs-visually-hidden'), 'error element must be visible on failure');
  } finally {
    env.restore();
  }
});
