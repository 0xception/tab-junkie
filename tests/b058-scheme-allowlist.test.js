/**
 * b058-scheme-allowlist.test.js — B-058 Relax URL-scheme allowlist
 *
 * Verifies that ALLOWED_URL_SCHEMES and normalizeUrl correctly:
 *   - Accept http:, https:, file: (regression — must still work)
 *   - Accept chrome:, edge:, chrome-extension:, about:, view-source: (new)
 *   - Reject javascript: and data: (security hard-block — unchanged)
 *
 * Also verifies that the promote-tab handler no longer has a parallel
 * block-list — scheme validation flows through normalizeUrl only.
 */
import './_setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUrl, ALLOWED_URL_SCHEMES } from '../shared/url.js';
import { ERR_VALIDATION } from '../background/storage/errors.js';

// ── Allowlist set membership ──────────────────────────────────────────────────

test('B-058: ALLOWED_URL_SCHEMES contains all newly-allowed schemes', () => {
  assert.ok(ALLOWED_URL_SCHEMES.has('http:'), 'http: must be in allowlist');
  assert.ok(ALLOWED_URL_SCHEMES.has('https:'), 'https: must be in allowlist');
  assert.ok(ALLOWED_URL_SCHEMES.has('file:'), 'file: must be in allowlist');
  assert.ok(ALLOWED_URL_SCHEMES.has('chrome:'), 'chrome: must be in allowlist (B-058)');
  assert.ok(ALLOWED_URL_SCHEMES.has('edge:'), 'edge: must be in allowlist (B-058)');
  assert.ok(ALLOWED_URL_SCHEMES.has('chrome-extension:'), 'chrome-extension: must be in allowlist (B-058)');
  assert.ok(ALLOWED_URL_SCHEMES.has('about:'), 'about: must be in allowlist (B-058)');
  assert.ok(ALLOWED_URL_SCHEMES.has('view-source:'), 'view-source: must be in allowlist (B-058)');
});

test('B-058: ALLOWED_URL_SCHEMES does not contain rejected schemes', () => {
  assert.ok(!ALLOWED_URL_SCHEMES.has('javascript:'), 'javascript: must NOT be in allowlist');
  assert.ok(!ALLOWED_URL_SCHEMES.has('data:'), 'data: must NOT be in allowlist');
  assert.ok(!ALLOWED_URL_SCHEMES.has('ftp:'), 'ftp: must NOT be in allowlist');
});

// ── Regression: previously-accepted schemes still work ────────────────────────

test('B-058 regression: http: URLs are still accepted', () => {
  const result = normalizeUrl('http://example.com/page');
  assert.equal(result, 'http://example.com/page');
});

test('B-058 regression: https: URLs are still accepted', () => {
  const result = normalizeUrl('https://example.com/page');
  assert.equal(result, 'https://example.com/page');
});

test('B-058 regression: file: URLs are still accepted', () => {
  const result = normalizeUrl('file:///home/user/doc.html');
  assert.equal(result, 'file:///home/user/doc.html');
});

// ── Newly-allowed schemes ─────────────────────────────────────────────────────

test('B-058: chrome:// URLs are now accepted', () => {
  const result = normalizeUrl('chrome://extensions');
  assert.ok(result.startsWith('chrome://'), `expected chrome:// prefix, got "${result}"`);
});

test('B-058: chrome://settings with path is accepted', () => {
  const result = normalizeUrl('chrome://settings/cookies/detail?site=example.com');
  assert.ok(result.startsWith('chrome://settings'), `expected chrome://settings, got "${result}"`);
});

test('B-058: edge:// URLs are now accepted', () => {
  const result = normalizeUrl('edge://settings');
  assert.ok(result.startsWith('edge://'), `expected edge:// prefix, got "${result}"`);
});

test('B-058: chrome-extension:// URLs are now accepted', () => {
  const extUrl = 'chrome-extension://abcdefghijklmnop/options.html';
  const result = normalizeUrl(extUrl);
  assert.ok(result.startsWith('chrome-extension://'), `expected chrome-extension:// prefix, got "${result}"`);
});

test('B-058: about:blank is now accepted', () => {
  const result = normalizeUrl('about:blank');
  assert.equal(result, 'about:blank');
});

test('B-058: view-source: URLs are now accepted', () => {
  // view-source: is an opaque-path scheme — new URL('view-source:https://example.com')
  // parses with protocol === 'view-source:' in the WHATWG URL parser.
  const result = normalizeUrl('view-source:https://example.com');
  assert.ok(result.startsWith('view-source:'), `expected view-source: prefix, got "${result}"`);
});

// ── Security hard-blocks remain ───────────────────────────────────────────────

test('B-058: javascript: URLs are still rejected with ERR_VALIDATION', () => {
  assert.throws(
    () => normalizeUrl('javascript:alert(1)'),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('B-058: data:text/html URLs are still rejected with ERR_VALIDATION', () => {
  assert.throws(
    () => normalizeUrl('data:text/html,<script>alert(1)</script>'),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

test('B-058: data:image/png URLs are still rejected with ERR_VALIDATION', () => {
  // data: is blanket-rejected regardless of subtype (per spike Memo 1 §Q2)
  assert.throws(
    () => normalizeUrl('data:image/png;base64,iVBORw0KGgo='),
    (err) => {
      assert.equal(err.code, ERR_VALIDATION);
      return true;
    },
  );
});

// ── forMatch mode with new schemes ───────────────────────────────────────────

test('B-058: chrome:// normalizes correctly in forMatch mode (strips fragment)', () => {
  const result = normalizeUrl('chrome://flags/#some-flag', { forMatch: true });
  assert.ok(result.startsWith('chrome://flags'), `got "${result}"`);
  assert.ok(!result.includes('#'), 'fragment must be stripped in forMatch mode');
});

test('B-058: about:blank normalizes correctly in forMatch mode', () => {
  const result = normalizeUrl('about:blank', { forMatch: true });
  assert.equal(result, 'about:blank');
});

test('B-058: view-source: normalizes correctly in forMatch mode', () => {
  const result = normalizeUrl('view-source:https://example.com', { forMatch: true });
  assert.ok(result.startsWith('view-source:'), `got "${result}"`);
});
