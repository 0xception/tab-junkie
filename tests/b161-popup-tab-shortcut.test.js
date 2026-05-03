/**
 * b161-popup-tab-shortcut.test.js — B-161 (S43, 2026-05-03)
 *
 * Two product-owner-driven changes to the quick-search popup:
 *
 * §1 Tab key opens the side panel directly. Pre-B-161 Tab cycled focus
 *    between input → result rows → footer buttons (sidepanel + settings).
 *    Up/Down arrows already cover row navigation, so the cycle was
 *    redundant. Tab (with or without Shift) now invokes
 *    _onOpenSidepanelClick — same handler as the footer button click.
 *
 * §2 "Open Settings" button removed from popup.html + popup.js. Settings
 *    is still reachable via the sidepanel gear icon and the Alt+, keyboard
 *    shortcut.
 *
 * Coverage: pure source-text pins (popup module is DOM-bound, so node:test
 * cannot exercise it directly without a full JSDOM shim — tests/b095 was
 * the previous DOM-shim approach for the settings button, deleted with B-161).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const POPUP_HTML = readFileSync(join(REPO_ROOT, 'popup/popup.html'), 'utf8');
const POPUP_JS = readFileSync(join(REPO_ROOT, 'popup/popup.js'), 'utf8');
const POPUP_CSS = readFileSync(join(REPO_ROOT, 'popup/popup.css'), 'utf8');

/* =========================================================================
   §1 — Tab handler invokes _onOpenSidepanelClick
   ========================================================================= */

test('B-161 §1: popup.js Tab handler invokes _onOpenSidepanelClick', () => {
  /* Locate the keydown handler block and confirm its Tab branch calls the
     sidepanel open handler directly (not focus-cycle through buttons). */
  const fnMatch = POPUP_JS.match(/function _onKeyDown\(e\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_onKeyDown body parseable');
  const body = fnMatch[1];

  /* The Tab branch must contain a call to `_onOpenSidepanelClick`. The
     `void` is the standard fire-and-forget for an async function. */
  const tabBranch = body.match(/if \(e\.key === 'Tab'\) \{([\s\S]*?)return;\s*\}/);
  assert.ok(tabBranch, 'Tab branch in _onKeyDown parseable');
  assert.match(
    tabBranch[1],
    /void _onOpenSidepanelClick\(\)/,
    'Tab branch must invoke _onOpenSidepanelClick (B-161)',
  );
});

test('B-161 §1: Tab branch is single-statement (no focus cycle)', () => {
  /* Pre-B-161 the Tab branch contained ~70 lines of focus-cycle logic
     (input ↔ rows ↔ sidepanel-btn ↔ settings-btn). Post-B-161 it should
     be a small block: preventDefault, stopPropagation, void open, return.
     Pin the absence of any settings-btn focus references in the keydown
     handler to catch a future regression that re-introduces the cycle. */
  const fnMatch = POPUP_JS.match(/function _onKeyDown\(e\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch);
  const body = fnMatch[1];
  assert.doesNotMatch(
    body,
    /settingsBtnEl/,
    '_onKeyDown must not reference settingsBtnEl (B-161 removed the settings button + cycle)',
  );
  assert.doesNotMatch(
    body,
    /onSettingsBtn/,
    '_onKeyDown must not contain the old onSettingsBtn focus-detection variable',
  );
});

/* =========================================================================
   §2 — Settings button removed from HTML / JS / CSS
   ========================================================================= */

test('B-161 §2: popup.html no longer contains popup-open-settings-btn', () => {
  assert.doesNotMatch(
    POPUP_HTML,
    /id="popup-open-settings-btn"/,
    'popup.html must not contain the settings button (B-161)',
  );
});

test('B-161 §2: popup.js no longer wires _onOpenSettingsClick', () => {
  /* The function definition is gone. A comment may reference the historical
     name as part of the B-161 explanation, but no `function _onOpenSettingsClick`
     declaration should remain. */
  assert.doesNotMatch(
    POPUP_JS,
    /^function _onOpenSettingsClick\(/m,
    'popup.js must not define _onOpenSettingsClick (B-161 removed the handler)',
  );
  assert.doesNotMatch(
    POPUP_JS,
    /addEventListener\('click', _onOpenSettingsClick\)/,
    'popup.js must not register the _onOpenSettingsClick click listener',
  );
});

test('B-161 §2: popup.js no longer imports openOrFocusSettingsTab', () => {
  /* The popup is no longer one of the consumers of the shared helper.
     sidepanel.js + service-worker.js are the remaining consumers (see
     shared/settings-tab.js header comment). */
  assert.doesNotMatch(
    POPUP_JS,
    /import \{[^}]*openOrFocusSettingsTab[^}]*\} from/,
    'popup.js must not import openOrFocusSettingsTab (no longer used after B-161)',
  );
});

test('B-161 §2: popup.css no longer styles popup-open-settings-btn', () => {
  assert.doesNotMatch(
    POPUP_CSS,
    /#popup-open-settings-btn/,
    'popup.css must not reference #popup-open-settings-btn (B-161)',
  );
});

/* =========================================================================
   Sidepanel button must remain (mouse users)
   ========================================================================= */

test('B-161 §2 sanity: sidepanel button kept (mouse-user surface preserved)', () => {
  assert.match(
    POPUP_HTML,
    /id="popup-open-sidepanel-btn"/,
    'popup.html must still contain the sidepanel button (B-161 only removed settings button)',
  );
  assert.match(
    POPUP_JS,
    /sidepanelBtnEl\.addEventListener\('click', _onOpenSidepanelClick\)/,
    'popup.js must still wire the sidepanel button click handler',
  );
});
