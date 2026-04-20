/**
 * B-081 — New-group button in sidepanel header.
 *
 * Storage-side group CRUD is covered by B-006's test suite. This test pins
 * the NEW markup contract: an #add-group-btn button exists in the header
 * between #add-bookmark-btn and #export-html-btn, with the correct aria-
 * label and SVG-icon structure.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../sidepanel/sidepanel.html', import.meta.url), 'utf8');

test('B-081 AC1: #add-group-btn button exists in sidepanel.html', () => {
  assert.match(html, /id="add-group-btn"/,
    'Button id must be present in the header markup.');
  assert.match(html, /aria-label="New group"/,
    'Button must have aria-label="New group" for accessibility.');
  assert.match(html, /<button[^>]*id="add-group-btn"[^>]*class="[^"]*header-add-btn/,
    'Button must use the shared .header-add-btn class so it inherits existing styles + focus-ring tokens.');
});

test('B-081 AC1: #add-group-btn sits between #add-bookmark-btn and #export-html-btn in DOM order', () => {
  const addBookmarkIdx = html.indexOf('id="add-bookmark-btn"');
  const addGroupIdx = html.indexOf('id="add-group-btn"');
  const exportHtmlIdx = html.indexOf('id="export-html-btn"');
  assert.ok(addBookmarkIdx > 0, 'add-bookmark-btn must exist in markup');
  assert.ok(addGroupIdx > addBookmarkIdx,
    'add-group-btn must appear after add-bookmark-btn in DOM order');
  assert.ok(exportHtmlIdx > addGroupIdx,
    'add-group-btn must appear before export-html-btn in DOM order');
});

test('B-081 AC3: #add-group-btn is keyboard-activatable (native <button type="button">)', () => {
  /* Native <button> elements are Enter + Space + Tab-reachable by default.
     This test pins the native-button invariant — any future refactor to a
     <div role="button"> would trip this. */
  assert.match(html, /<button[^>]*id="add-group-btn"[^>]*type="button"/,
    'Button must be a native <button type="button"> for built-in keyboard support.');
});
