/**
 * B-004: Favicon auto-capture + letter-avatar fallback
 *
 * Tests:
 * 1. buildLiveStates includes favIconUrl for live items, null for non-live
 * 2. isSafeFaviconUrl accepts/rejects the correct URL schemes
 * 3. tab/favicon-changed broadcast fires only when favIconUrl changes WITHOUT url change
 */

import './_setup.js';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetMock,
  __setMockTabs,
  __getSendMessageCalls,
} from './chrome-mock.js';
import {
  buildLiveTabIndex,
  __resetLiveTabIndex,
} from '../background/tabs/live-tab-index.js';
import {
  reconcileClaims,
  buildLiveStates,
  __resetTabClaims,
} from '../background/tabs/tab-claims.js';
import { registerTabEventListeners } from '../background/tabs/tab-events.js';

beforeEach(() => {
  __resetMock();
  __resetLiveTabIndex();
  __resetTabClaims();
});

/* =========================================================================
   1. buildLiveStates includes favIconUrl
   ========================================================================= */

test('B-004: buildLiveStates returns favIconUrl from live tab entry', async () => {
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: false, favIconUrl: 'https://example.com/favicon.ico' },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-1', url: 'https://example.com', sortOrder: 0 },
  ];
  await reconcileClaims(items);

  const states = buildLiveStates(items);
  assert.equal(states['item-1'].live, true);
  assert.equal(states['item-1'].favIconUrl, 'https://example.com/favicon.ico');
});

test('B-004: buildLiveStates returns null favIconUrl when tab has no favicon', async () => {
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: false, audible: false },
  ]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-1', url: 'https://example.com', sortOrder: 0 },
  ];
  await reconcileClaims(items);

  const states = buildLiveStates(items);
  assert.equal(states['item-1'].live, true);
  assert.equal(states['item-1'].favIconUrl, null);
});

test('B-004: buildLiveStates returns null favIconUrl for non-live items', async () => {
  __setMockTabs([]);
  await buildLiveTabIndex();

  const items = [
    { id: 'item-1', url: 'https://example.com', sortOrder: 0 },
  ];
  await reconcileClaims(items);

  const states = buildLiveStates(items);
  assert.equal(states['item-1'].live, false);
  assert.equal(states['item-1'].favIconUrl, null);
});

test('B-004: buildLiveStates returns null favIconUrl before claims are ready', () => {
  // Do NOT call reconcileClaims — claimsReady remains false
  const items = [{ id: 'item-1', url: 'https://example.com', sortOrder: 0 }];
  const states = buildLiveStates(items);
  assert.equal(states['item-1'].live, false);
  assert.equal(states['item-1'].favIconUrl, null);
});

/* =========================================================================
   2. isSafeFaviconUrl — extracted as module-private in sidepanel.js, so we
      re-implement the same logic here to test the contract.
   ========================================================================= */

/**
 * Mirror of sidepanel.js isSafeFaviconUrl for contract testing.
 * If this implementation diverges from sidepanel.js, that's a bug.
 */
function isSafeFaviconUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/')
  );
}

test('B-004: isSafeFaviconUrl accepts https:// URLs', () => {
  assert.equal(isSafeFaviconUrl('https://example.com/favicon.ico'), true);
});

test('B-004: isSafeFaviconUrl accepts http:// URLs', () => {
  assert.equal(isSafeFaviconUrl('http://example.com/favicon.ico'), true);
});

test('B-004: isSafeFaviconUrl accepts data:image/png;base64 URLs', () => {
  assert.equal(isSafeFaviconUrl('data:image/png;base64,iVBORw0KGgo='), true);
});

test('B-004: isSafeFaviconUrl accepts data:image/svg+xml URLs', () => {
  assert.equal(isSafeFaviconUrl('data:image/svg+xml,<svg></svg>'), true);
});

test('B-004: isSafeFaviconUrl rejects javascript: URLs', () => {
  assert.equal(isSafeFaviconUrl('javascript:alert(1)'), false);
});

test('B-004: isSafeFaviconUrl rejects data:text/html URLs', () => {
  assert.equal(isSafeFaviconUrl('data:text/html,<script>alert(1)</script>'), false);
});

test('B-004: isSafeFaviconUrl rejects empty string', () => {
  assert.equal(isSafeFaviconUrl(''), false);
});

test('B-004: isSafeFaviconUrl rejects null', () => {
  assert.equal(isSafeFaviconUrl(null), false);
});

test('B-004: isSafeFaviconUrl rejects undefined', () => {
  assert.equal(isSafeFaviconUrl(undefined), false);
});

test('B-004: isSafeFaviconUrl rejects non-string (number)', () => {
  assert.equal(isSafeFaviconUrl(42), false);
});

test('B-004: isSafeFaviconUrl rejects chrome:// URLs', () => {
  assert.equal(isSafeFaviconUrl('chrome://favicon/size/16@1x/https://example.com'), false);
});

test('B-004: isSafeFaviconUrl is case-insensitive for scheme', () => {
  assert.equal(isSafeFaviconUrl('HTTPS://example.com/favicon.ico'), true);
  assert.equal(isSafeFaviconUrl('HTTP://example.com/favicon.ico'), true);
  assert.equal(isSafeFaviconUrl('DATA:IMAGE/PNG;base64,abc'), true);
  assert.equal(isSafeFaviconUrl('JAVASCRIPT:alert(1)'), false);
});

/* =========================================================================
   3. tab/favicon-changed broadcast logic
   ========================================================================= */

test('B-004: favIconUrl-only change fires tab/favicon-changed broadcast', async () => {
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-1', url: 'https://example.com', sortOrder: 0 }]);

  registerTabEventListeners(Promise.resolve());

  // Clear any sendMessage calls from setup
  __getSendMessageCalls().length = 0;

  // Fire onUpdated with favIconUrl ONLY (no url change)
  chrome.tabs.onUpdated.__fire(
    1,
    { favIconUrl: 'https://example.com/favicon.ico' },
    { id: 1, windowId: 1, active: true }
  );

  // Should have broadcast tab/favicon-changed
  const calls = __getSendMessageCalls();
  assert.ok(calls.length >= 1, 'Expected at least one sendMessage call');
  const faviconMsg = calls.find(
    (c) => c[0]?.payload?.trigger === 'tab/favicon-changed'
  );
  assert.ok(faviconMsg, 'Expected a tab/favicon-changed broadcast');
});

test('B-004: favIconUrl + url change does NOT fire tab/favicon-changed', async () => {
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();
  await reconcileClaims([{ id: 'item-1', url: 'https://example.com', sortOrder: 0 }]);

  registerTabEventListeners(Promise.resolve());

  // Clear any sendMessage calls from setup
  __getSendMessageCalls().length = 0;

  // Fire onUpdated with BOTH favIconUrl AND url
  chrome.tabs.onUpdated.__fire(
    1,
    { favIconUrl: 'https://newsite.com/favicon.ico', url: 'https://newsite.com' },
    { id: 1, windowId: 1, active: true }
  );

  // Should NOT have a tab/favicon-changed broadcast (the url-change path
  // handles the full update via tab/updated after its debounce)
  const calls = __getSendMessageCalls();
  const faviconMsg = calls.find(
    (c) => c[0]?.payload?.trigger === 'tab/favicon-changed'
  );
  assert.equal(faviconMsg, undefined, 'tab/favicon-changed should NOT fire when url also changed');
});

test('B-004: favIconUrl change does NOT broadcast when claims are not ready', async () => {
  __setMockTabs([
    { id: 1, url: 'https://example.com', windowId: 1, active: true, audible: false },
  ]);
  await buildLiveTabIndex();
  // Do NOT call reconcileClaims — claimsReady stays false

  registerTabEventListeners(Promise.resolve());
  __getSendMessageCalls().length = 0;

  chrome.tabs.onUpdated.__fire(
    1,
    { favIconUrl: 'https://example.com/favicon.ico' },
    { id: 1, windowId: 1, active: true }
  );

  const calls = __getSendMessageCalls();
  const faviconMsg = calls.find(
    (c) => c[0]?.payload?.trigger === 'tab/favicon-changed'
  );
  assert.equal(faviconMsg, undefined, 'Should not broadcast when claims are not ready');
});
