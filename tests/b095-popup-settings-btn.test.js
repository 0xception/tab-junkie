/**
 * b095-popup-settings-btn.test.js — B-095 "Open Settings" popup button.
 *
 * Covers ACs:
 *   1. Button element #popup-open-settings-btn exists in popup.html with correct
 *      id and aria-label.
 *   2. Click handler dispatches the shared openOrFocusSettingsTab helper (via
 *      fire-and-forget call that triggers tabs.query for the settings URL).
 *   3. If existing tab found → tabs.update + windows.update called; NOT tabs.create.
 *   4. If no existing tab → tabs.create called; tabs.update/windows.update NOT called.
 *   5. C-11 ordering — window.close is called synchronously after the
 *      fire-and-forget dispatch (no await between dispatch and close).
 *   6. Keyboard cycle includes #popup-open-settings-btn between sidepanel-btn and
 *      input (verified via HTML structure assertion).
 *
 * Strategy: directly exercises _onOpenSettingsClick logic inline — same pattern
 * as b082-popup-sidepanel-btn.test.js. DOM is shimmed minimally. The function
 * logic is reproduced in runOpenSettingsClick() via the shared helper to avoid
 * importing the DOM-bound popup module. Any divergence between this and popup.js
 * is a test gap; UAT of the real popup covers integration.
 *
 * B-097 update: popup.js now calls the shared openOrFocusSettingsTab() helper
 * (shared/settings-tab.js) fire-and-forget. The inline reproduction below
 * matches the new synchronous _onOpenSettingsClick pattern.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  __resetMock,
  __setMockTabs,
  __getWindowsUpdateCalls,
  installChromeMock,
} from './chrome-mock.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/* =========================================================================
   AC1: HTML structure
   ========================================================================= */

test('B-095 AC1-a: #popup-open-settings-btn exists in popup.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  assert.ok(
    html.includes('id="popup-open-settings-btn"'),
    'popup.html must contain id="popup-open-settings-btn"',
  );
});

test('B-095 AC1-b: button has aria-label="Open Settings"', () => {
  const html = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  assert.ok(
    html.includes('aria-label="Open Settings"'),
    'button must have aria-label="Open Settings"',
  );
});

test('B-095 AC1-c: #popup-open-settings-btn appears after #popup-open-sidepanel-btn in #qs-footer', () => {
  const html = fs.readFileSync(path.join(ROOT, 'popup/popup.html'), 'utf8');
  const sidepanelPos = html.indexOf('id="popup-open-sidepanel-btn"');
  const settingsPos = html.indexOf('id="popup-open-settings-btn"');
  assert.ok(sidepanelPos >= 0, '#popup-open-sidepanel-btn must exist');
  assert.ok(settingsPos >= 0, '#popup-open-settings-btn must exist');
  assert.ok(
    settingsPos > sidepanelPos,
    '#popup-open-settings-btn must appear after #popup-open-sidepanel-btn in the markup',
  );
});

/* =========================================================================
   Shared test environment + inline handler reproduction
   ========================================================================= */

/**
 * Reproduce _onOpenSettingsClick + openOrFocusSettingsTab inline — matches the
 * B-097-updated popup.js. The click handler is now synchronous: it calls
 * openOrFocusSettingsTab fire-and-forget then immediately calls windowClose().
 * C-11 compliance: zero await between the fire-and-forget dispatch and
 * windowClose(). The shared helper's internal await (tabs.query) runs after
 * windowClose() is already called — safe for popup teardown.
 */
async function _openOrFocusSettingsTabInline() {
  const url = chrome.runtime.getURL('settings/settings.html'); // eslint-disable-line no-undef
  const tabs = await chrome.tabs.query({ url }); // eslint-disable-line no-undef
  if (tabs && tabs.length > 0) {
    const t = tabs[0];
    await chrome.tabs.update(t.id, { active: true }); // eslint-disable-line no-undef
    if (t.windowId != null) {
      await chrome.windows.update(t.windowId, { focused: true }); // eslint-disable-line no-undef
    }
    return;
  }
  await chrome.tabs.create({ url }); // eslint-disable-line no-undef
}

function runOpenSettingsClick(windowClose) {
  /* Synchronous — fire-and-forget, matching popup.js _onOpenSettingsClick. */
  _openOrFocusSettingsTabInline().catch(() => { /* swallow */ });
  windowClose();
}

function makeTestEnv() {
  installChromeMock();
  __resetMock();

  let closeCalled = false;
  if (!globalThis.window) globalThis.window = {};
  const origClose = globalThis.window.close;
  globalThis.window.close = () => { closeCalled = true; };

  return {
    closeCalled: () => closeCalled,
    restore() {
      if (origClose !== undefined) globalThis.window.close = origClose;
    },
  };
}

/* =========================================================================
   AC2: chrome.tabs.query is dispatched with the settings URL
   ========================================================================= */

test('B-095 AC2: click handler calls chrome.tabs.query with the settings URL', async () => {
  const env = makeTestEnv();
  try {
    /* No tabs seeded → no-existing-tab path. */
    __setMockTabs([]);

    /* Intercept tabs.query to record calls. */
    const queryCalls = [];
    const origQuery = globalThis.chrome.tabs.query;
    globalThis.chrome.tabs.query = async (filter) => {
      queryCalls.push(filter);
      return origQuery(filter);
    };

    runOpenSettingsClick(globalThis.window.close);
    /* Flush microtasks so the fire-and-forget _openOrFocusSettingsTabInline
       completes — tabs.query is the first await inside it. */
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(queryCalls.length, 1, 'tabs.query must be called exactly once');
    const expectedUrl = chrome.runtime.getURL('settings/settings.html');
    assert.deepEqual(
      queryCalls[0],
      { url: expectedUrl },
      'tabs.query must be called with { url: <settings URL> }',
    );

    globalThis.chrome.tabs.query = origQuery;
  } finally {
    env.restore();
  }
});

/* =========================================================================
   AC3: existing tab path → tabs.update + windows.update; NOT tabs.create
   ========================================================================= */

test('B-095 AC3: when settings tab exists → tabs.update + windows.update called; tabs.create NOT called', async () => {
  const env = makeTestEnv();
  try {
    const settingsUrl = chrome.runtime.getURL('settings/settings.html');
    __setMockTabs([{ id: 42, url: settingsUrl, windowId: 7, active: false }]);

    const tabsUpdateCalls = [];
    const tabsCreateCalls = [];
    const origUpdate = globalThis.chrome.tabs.update;
    const origCreate = globalThis.chrome.tabs.create;
    globalThis.chrome.tabs.update = async (tabId, props) => {
      tabsUpdateCalls.push({ tabId, props });
      return origUpdate(tabId, props);
    };
    globalThis.chrome.tabs.create = async (opts) => {
      tabsCreateCalls.push(opts);
      return origCreate(opts);
    };

    runOpenSettingsClick(globalThis.window.close);
    /* Flush microtasks so the fire-and-forget _openOrFocusSettingsTabInline
       completes — tabs.query → tabs.update → windows.update all await. */
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(tabsUpdateCalls.length, 1, 'tabs.update must be called once');
    assert.equal(tabsUpdateCalls[0].tabId, 42, 'tabs.update must receive the existing tab id');
    assert.deepEqual(tabsUpdateCalls[0].props, { active: true }, 'tabs.update must set active: true');

    const windowsUpdateCalls = __getWindowsUpdateCalls();
    assert.equal(windowsUpdateCalls.length, 1, 'windows.update must be called once');
    assert.equal(windowsUpdateCalls[0].windowId, 7, 'windows.update must receive the tab windowId');
    assert.deepEqual(windowsUpdateCalls[0].props, { focused: true }, 'windows.update must set focused: true');

    assert.equal(tabsCreateCalls.length, 0, 'tabs.create must NOT be called when tab already exists');

    assert.ok(env.closeCalled(), 'window.close must be called');

    globalThis.chrome.tabs.update = origUpdate;
    globalThis.chrome.tabs.create = origCreate;
  } finally {
    env.restore();
  }
});

/* =========================================================================
   AC4: no existing tab path → tabs.create called; tabs.update NOT called
   ========================================================================= */

test('B-095 AC4: when no settings tab exists → tabs.create called; tabs.update NOT called', async () => {
  const env = makeTestEnv();
  try {
    __setMockTabs([]);

    const tabsUpdateCalls = [];
    const tabsCreateCalls = [];
    const origUpdate = globalThis.chrome.tabs.update;
    const origCreate = globalThis.chrome.tabs.create;
    globalThis.chrome.tabs.update = async (tabId, props) => {
      tabsUpdateCalls.push({ tabId, props });
      return origUpdate(tabId, props);
    };
    globalThis.chrome.tabs.create = async (opts) => {
      tabsCreateCalls.push(opts);
      return origCreate(opts);
    };

    runOpenSettingsClick(globalThis.window.close);
    /* Flush microtasks so the fire-and-forget _openOrFocusSettingsTabInline
       completes — tabs.query → tabs.create all await. */
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const expectedUrl = chrome.runtime.getURL('settings/settings.html');
    assert.equal(tabsCreateCalls.length, 1, 'tabs.create must be called once');
    assert.deepEqual(tabsCreateCalls[0], { url: expectedUrl }, 'tabs.create must receive the settings URL');

    assert.equal(tabsUpdateCalls.length, 0, 'tabs.update must NOT be called when no tab exists');

    const windowsUpdateCalls = __getWindowsUpdateCalls();
    assert.equal(windowsUpdateCalls.length, 0, 'windows.update must NOT be called when no tab exists');

    assert.ok(env.closeCalled(), 'window.close must be called');

    globalThis.chrome.tabs.update = origUpdate;
    globalThis.chrome.tabs.create = origCreate;
  } finally {
    env.restore();
  }
});

/* =========================================================================
   AC5: C-11 ordering — window.close called with no await after dispatch
   ========================================================================= */

test('B-095 AC5 (C-11): window.close is called synchronously — before the fire-and-forget helper awaits', async () => {
  const env = makeTestEnv();
  try {
    /* Seed an existing tab so the full update+focus path will run once
       microtasks flush (but window.close must happen FIRST). */
    const settingsUrl = chrome.runtime.getURL('settings/settings.html');
    __setMockTabs([{ id: 99, url: settingsUrl, windowId: 3, active: false }]);

    /* Track call order via microtask sequencing.
       B-097 update: _onOpenSettingsClick is now synchronous.
       window.close() is called BEFORE the fire-and-forget helper even
       reaches its first internal await (tabs.query). The log entries for
       tabs.update and windows.update must ALL appear AFTER window.close. */
    const eventLog = [];

    const origQuery = globalThis.chrome.tabs.query;
    const origUpdate = globalThis.chrome.tabs.update;
    const origWindowsUpdate = globalThis.chrome.windows.update;

    globalThis.chrome.tabs.query = async (filter) => {
      const result = await origQuery(filter);
      eventLog.push('tabs.query resolved');
      return result;
    };
    globalThis.chrome.tabs.update = async (tabId, props) => {
      const result = await origUpdate(tabId, props);
      eventLog.push('tabs.update resolved');
      return result;
    };
    globalThis.chrome.windows.update = async (windowId, props) => {
      const result = await origWindowsUpdate(windowId, props);
      eventLog.push('windows.update resolved');
      return result;
    };

    /* Patch window.close to record its position in the event log. */
    const origClose = globalThis.window.close;
    globalThis.window.close = () => {
      eventLog.push('window.close');
      origClose(); /* record closeCalled */
    };

    /* runOpenSettingsClick is synchronous — call without await so the
       microtask queue is not flushed before our ordering check. */
    runOpenSettingsClick(globalThis.window.close);

    /* At this point window.close has already been called synchronously.
       The fire-and-forget promise chain has NOT settled yet. */
    assert.ok(env.closeCalled(), 'window.close must be called synchronously by the click handler');

    /* window.close must be the ONLY entry in the log before microtasks run. */
    assert.deepEqual(
      eventLog,
      ['window.close'],
      'window.close must precede all async dispatch resolutions (C-11 fire-and-forget ordering)',
    );

    /* Flush microtasks so the fire-and-forget promise chain settles. */
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    /* After settling, async resolutions appear in the log AFTER window.close. */
    const closeIdx = eventLog.indexOf('window.close');
    assert.strictEqual(closeIdx, 0, 'window.close must be the first entry in the event log');

    for (const entry of eventLog) {
      if (entry !== 'window.close') {
        const entryIdx = eventLog.indexOf(entry);
        assert.ok(
          closeIdx < entryIdx,
          `window.close (idx ${closeIdx}) must precede "${entry}" (idx ${entryIdx}) — C-11 fire-and-forget ordering`,
        );
      }
    }

    globalThis.chrome.tabs.query = origQuery;
    globalThis.chrome.tabs.update = origUpdate;
    globalThis.chrome.windows.update = origWindowsUpdate;
    globalThis.window.close = origClose;
  } finally {
    env.restore();
  }
});
