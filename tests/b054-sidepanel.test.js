/**
 * b054-sidepanel.test.js — B-054 R5 regression tests for R4 fix areas
 *
 * sidepanel.js is a browser-only module with no exports and immediate DOM
 * side-effects on load. Pure helpers are reproduced verbatim here (same
 * strategy as sidepanel-logic.test.js). Each reproduction cites its source
 * location in sidepanel/sidepanel.js.
 *
 * Coverage targets:
 *  - isSafeFaviconUrl (R4 H-1 security surface)
 *  - _createAudibleIcon (R4 SVG factory extraction)
 *  - _driftTooltipFor (B-101 §48.3 D-1 — replaces the deleted
 *    `_createDriftedIcon`; drift is now communicated via the always-present
 *    `.item-drift-bar` span built by `buildItemRow`, not a separate icon
 *    factory)
 *  - sendMessage wrapper (null-response / error handling)
 *  - buildHighlightedText (filter highlight, uses minimal DOM shim)
 *
 * NOTE: _createAudibleIcon and buildHighlightedText require DOM APIs
 * (document.createElement, createTextNode, createDocumentFragment).
 * A lightweight shim is installed before those tests. The shim is intentionally
 * minimal — it does NOT replicate a real browser DOM, only enough to verify
 * return-value structure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock, __resetMock } from './chrome-mock.js';

/* =========================================================================
   Reproduced: isSafeFaviconUrl  (sidepanel.js lines 28-36)
   ========================================================================= */

function isSafeFaviconUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return (
    lower.startsWith('https://') ||
    lower.startsWith('http://') ||
    lower.startsWith('data:image/')
  );
}

/* =========================================================================
   Reproduced: sendMessage wrapper  (sidepanel.js lines 110-118)
   ========================================================================= */

function makeSendMessage(runtimeSendMessage) {
  return async function sendMessage(type, payload = {}) {
    const resp = await runtimeSendMessage({ type, payload });
    if (!resp || !resp.ok) {
      const err = new Error(resp?.error?.message ?? 'No response from service worker');
      if (resp?.error?.code) err.code = resp.error.code;
      throw err;
    }
    return resp.data;
  };
}

/* =========================================================================
   Minimal DOM shim for buildHighlightedText + icon factories
   ========================================================================= */

class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.textContent = '';
    this.innerHTML = '';
    this.childNodes = [];
    this._attrs = {};
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] ?? null; }
  appendChild(child) { this.childNodes.push(child); return child; }
}

class FakeTextNode {
  constructor(text) { this.textContent = text; this._isText = true; }
}

class FakeDocumentFragment {
  constructor() { this.childNodes = []; }
  appendChild(child) { this.childNodes.push(child); return child; }
}

const fakeDocument = {
  createElement(tag) { return new FakeNode(tag.toUpperCase()); },
  createTextNode(text) { return new FakeTextNode(text); },
  createDocumentFragment() { return new FakeDocumentFragment(); },
};

/* =========================================================================
   Reproduced: _createAudibleIcon  (sidepanel.js lines 656-663)
   ========================================================================= */

function _createAudibleIcon() {
  const span = fakeDocument.createElement('span');
  span.className = 'item-audible-icon';
  span.setAttribute('aria-label', 'Playing audio');
  span.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 5h2l3-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 010 5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
  return span;
}

/* =========================================================================
   Reproduced: _driftTooltipFor  (sidepanel.js ~L2281, post-B-101 §48.3 D-1)

   B-101 deleted the `_createDriftedIcon` SVG factory entirely. The drift
   indicator is now an always-present `<span class="item-drift-bar" hidden>`
   injected by `buildItemRow` as the first child of every `.item-row`. The
   only shared helper that survived the deletion is `_driftTooltipFor`,
   which extracts the hostname from the drifted-to URL with a `try/catch`
   fallback. These tests guard the helper's contract.
   ========================================================================= */

function _driftTooltipFor(driftedToUrl) {
  if (typeof driftedToUrl !== 'string' || driftedToUrl.length === 0) {
    return 'Drifted to a different URL';
  }
  let hostname = '';
  try {
    hostname = new URL(driftedToUrl).hostname;
  } catch {
    /* fall through */
  }
  return hostname ? `Drifted to: ${hostname}` : 'Drifted to a different URL';
}

/* =========================================================================
   Reproduced: buildHighlightedText  (sidepanel.js lines 367-391)
   ========================================================================= */

function buildHighlightedText(text, query) {
  const frag = fakeDocument.createDocumentFragment();
  if (!query) {
    frag.appendChild(fakeDocument.createTextNode(text));
    return frag;
  }
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let cursor = 0;
  while (cursor < text.length) {
    const idx = lower.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      frag.appendChild(fakeDocument.createTextNode(text.slice(cursor)));
      break;
    }
    if (idx > cursor) {
      frag.appendChild(fakeDocument.createTextNode(text.slice(cursor, idx)));
    }
    const mark = fakeDocument.createElement('mark');
    mark.textContent = text.slice(idx, idx + lowerQuery.length);
    frag.appendChild(mark);
    cursor = idx + lowerQuery.length;
  }
  return frag;
}

/* =========================================================================
   Tests: isSafeFaviconUrl
   ========================================================================= */

test('isSafeFaviconUrl: accepts https:// URLs', () => {
  assert.ok(isSafeFaviconUrl('https://example.com/favicon.ico'));
});

test('isSafeFaviconUrl: accepts http:// URLs', () => {
  assert.ok(isSafeFaviconUrl('http://example.com/favicon.ico'));
});

test('isSafeFaviconUrl: accepts data:image/ URLs', () => {
  assert.ok(isSafeFaviconUrl('data:image/png;base64,iVBOR'));
});

test('isSafeFaviconUrl: rejects javascript: URLs', () => {
  assert.equal(isSafeFaviconUrl('javascript:alert(1)'), false);
});

test('isSafeFaviconUrl: rejects chrome:// URLs', () => {
  assert.equal(isSafeFaviconUrl('chrome://favicon/size/16'), false);
});

test('isSafeFaviconUrl: rejects edge:// URLs', () => {
  assert.equal(isSafeFaviconUrl('edge://favicon/size/16'), false);
});

test('isSafeFaviconUrl: rejects empty string', () => {
  assert.equal(isSafeFaviconUrl(''), false);
});

test('isSafeFaviconUrl: rejects null', () => {
  assert.equal(isSafeFaviconUrl(null), false);
});

test('isSafeFaviconUrl: rejects undefined', () => {
  assert.equal(isSafeFaviconUrl(undefined), false);
});

test('isSafeFaviconUrl: rejects non-string types', () => {
  assert.equal(isSafeFaviconUrl(42), false);
  assert.equal(isSafeFaviconUrl({}), false);
  assert.equal(isSafeFaviconUrl(true), false);
});

test('isSafeFaviconUrl: rejects data:text/ (not image)', () => {
  assert.equal(isSafeFaviconUrl('data:text/html,<h1>Hi</h1>'), false);
});

test('isSafeFaviconUrl: case-insensitive scheme matching', () => {
  assert.ok(isSafeFaviconUrl('HTTPS://EXAMPLE.COM/icon.png'));
  assert.ok(isSafeFaviconUrl('HTTP://EXAMPLE.COM/icon.png'));
  assert.ok(isSafeFaviconUrl('DATA:IMAGE/PNG;base64,abc'));
});

test('isSafeFaviconUrl: rejects file:// URLs', () => {
  assert.equal(isSafeFaviconUrl('file:///etc/passwd'), false);
});

/* =========================================================================
   Tests: sendMessage wrapper
   ========================================================================= */

test('sendMessage: returns resp.data on success', async () => {
  const send = makeSendMessage(async () => ({ ok: true, data: { items: [1, 2] } }));
  const result = await send('MSG_LIST_ITEMS');
  assert.deepEqual(result, { items: [1, 2] });
});

test('sendMessage: throws on !resp.ok with error message', async () => {
  const send = makeSendMessage(async () => ({ ok: false, error: { message: 'Not found', code: 'ERR_NOT_FOUND' } }));
  await assert.rejects(send('MSG_GET_ITEM', { id: 'x' }), (err) => {
    assert.equal(err.message, 'Not found');
    assert.equal(err.code, 'ERR_NOT_FOUND');
    return true;
  });
});

test('sendMessage: throws on null response (service worker dead)', async () => {
  const send = makeSendMessage(async () => null);
  await assert.rejects(send('MSG_LIST_ITEMS'), (err) => {
    assert.equal(err.message, 'No response from service worker');
    return true;
  });
});

test('sendMessage: throws on undefined response', async () => {
  const send = makeSendMessage(async () => undefined);
  await assert.rejects(send('MSG_LIST_ITEMS'), (err) => {
    assert.equal(err.message, 'No response from service worker');
    return true;
  });
});

test('sendMessage: throws on !resp.ok without error details', async () => {
  const send = makeSendMessage(async () => ({ ok: false }));
  await assert.rejects(send('MSG_LIST_ITEMS'), (err) => {
    assert.equal(err.message, 'No response from service worker');
    return true;
  });
});

/* =========================================================================
   Tests: _createAudibleIcon factory (R4 SVG extraction fix)
   ========================================================================= */

test('_createAudibleIcon: returns span with correct className', () => {
  const icon = _createAudibleIcon();
  assert.equal(icon.className, 'item-audible-icon');
});

test('_createAudibleIcon: has aria-label "Playing audio"', () => {
  const icon = _createAudibleIcon();
  assert.equal(icon.getAttribute('aria-label'), 'Playing audio');
});

test('_createAudibleIcon: innerHTML contains SVG', () => {
  const icon = _createAudibleIcon();
  assert.ok(icon.innerHTML.includes('<svg'));
  assert.ok(icon.innerHTML.includes('</svg>'));
});

/* =========================================================================
   Tests: _driftTooltipFor (B-101 §48.3 D-1 — replaces the removed
   `_createDriftedIcon` factory tests)
   ========================================================================= */

test('_driftTooltipFor: extracts hostname from a normal URL', () => {
  assert.equal(_driftTooltipFor('https://example.com/foo/bar'), 'Drifted to: example.com');
});

test('_driftTooltipFor: falls back to generic string when URL is missing', () => {
  assert.equal(_driftTooltipFor(undefined), 'Drifted to a different URL');
  assert.equal(_driftTooltipFor(''), 'Drifted to a different URL');
  assert.equal(_driftTooltipFor(null), 'Drifted to a different URL');
});

test('_driftTooltipFor: falls back to generic string when URL is un-parseable', () => {
  assert.equal(_driftTooltipFor('not-a-real-url'), 'Drifted to a different URL');
});

/* =========================================================================
   Tests: buildHighlightedText (B-021 filter highlight)
   ========================================================================= */

test('buildHighlightedText: empty query returns single text node', () => {
  const frag = buildHighlightedText('Hello World', '');
  assert.equal(frag.childNodes.length, 1);
  assert.equal(frag.childNodes[0].textContent, 'Hello World');
  assert.ok(frag.childNodes[0]._isText);
});

test('buildHighlightedText: null/undefined query returns single text node', () => {
  const frag = buildHighlightedText('Hello', null);
  assert.equal(frag.childNodes.length, 1);
  assert.equal(frag.childNodes[0].textContent, 'Hello');
});

test('buildHighlightedText: single match wraps in mark element', () => {
  const frag = buildHighlightedText('Hello World', 'World');
  // Should be: text("Hello ") + mark("World")
  assert.equal(frag.childNodes.length, 2);
  assert.ok(frag.childNodes[0]._isText);
  assert.equal(frag.childNodes[0].textContent, 'Hello ');
  assert.equal(frag.childNodes[1].tagName, 'MARK');
  assert.equal(frag.childNodes[1].textContent, 'World');
});

test('buildHighlightedText: case-insensitive matching', () => {
  const frag = buildHighlightedText('Hello WORLD', 'world');
  assert.equal(frag.childNodes.length, 2);
  assert.equal(frag.childNodes[1].tagName, 'MARK');
  assert.equal(frag.childNodes[1].textContent, 'WORLD');
});

test('buildHighlightedText: multiple matches wrap each occurrence', () => {
  const frag = buildHighlightedText('abXcdXef', 'X');
  // text("ab") + mark("X") + text("cd") + mark("X") + text("ef")
  assert.equal(frag.childNodes.length, 5);
  assert.equal(frag.childNodes[0].textContent, 'ab');
  assert.equal(frag.childNodes[1].tagName, 'MARK');
  assert.equal(frag.childNodes[1].textContent, 'X');
  assert.equal(frag.childNodes[2].textContent, 'cd');
  assert.equal(frag.childNodes[3].tagName, 'MARK');
  assert.equal(frag.childNodes[3].textContent, 'X');
  assert.equal(frag.childNodes[4].textContent, 'ef');
});

test('buildHighlightedText: match at start of string', () => {
  const frag = buildHighlightedText('Hello World', 'Hello');
  assert.equal(frag.childNodes.length, 2);
  assert.equal(frag.childNodes[0].tagName, 'MARK');
  assert.equal(frag.childNodes[0].textContent, 'Hello');
  assert.equal(frag.childNodes[1].textContent, ' World');
});

test('buildHighlightedText: match covers entire string', () => {
  const frag = buildHighlightedText('test', 'test');
  assert.equal(frag.childNodes.length, 1);
  assert.equal(frag.childNodes[0].tagName, 'MARK');
  assert.equal(frag.childNodes[0].textContent, 'test');
});

test('buildHighlightedText: no match returns single text node', () => {
  const frag = buildHighlightedText('Hello World', 'xyz');
  assert.equal(frag.childNodes.length, 1);
  assert.ok(frag.childNodes[0]._isText);
  assert.equal(frag.childNodes[0].textContent, 'Hello World');
});

test('buildHighlightedText: preserves original case in mark', () => {
  const frag = buildHighlightedText('GitHub Repository', 'git');
  assert.equal(frag.childNodes[0].tagName, 'MARK');
  assert.equal(frag.childNodes[0].textContent, 'Git');
});
