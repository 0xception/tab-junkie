/**
 * B-081 — New-group button in sidepanel header.
 *
 * Storage-side group CRUD is covered by B-006's test suite. This test pins
 * the markup contract: an #add-group-btn button exists in the header after
 * #add-bookmark-btn.
 *
 * B-093 update: the export/import buttons (#export-html-btn, #export-json-btn,
 * #import-html-btn, #import-json-btn) and their two hidden file inputs
 * (#import-file-input, #import-json-file-input) were relocated to the
 * Settings page Data section. The DOM-order assertion that previously pinned
 * #add-group-btn between #add-bookmark-btn and #export-html-btn now asserts
 * the rightmost header button is #sidepanel-settings-btn (the gear) and
 * that #export-html-btn is ABSENT from the sidepanel header.
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

test('B-081 AC1 + B-093: #add-group-btn sits after #add-bookmark-btn; gear is rightmost; #export-html-btn absent', () => {
  const addBookmarkIdx = html.indexOf('id="add-bookmark-btn"');
  const addGroupIdx = html.indexOf('id="add-group-btn"');
  const settingsIdx = html.indexOf('id="sidepanel-settings-btn"');
  assert.ok(addBookmarkIdx > 0, 'add-bookmark-btn must exist in markup');
  assert.ok(addGroupIdx > addBookmarkIdx,
    'add-group-btn must appear after add-bookmark-btn in DOM order');
  assert.ok(settingsIdx > addGroupIdx,
    'sidepanel-settings-btn (gear) must appear after add-group-btn in DOM order');
  /* B-093: export/import buttons relocated — must be absent from sidepanel header. */
  assert.equal(html.indexOf('id="export-html-btn"'), -1,
    '#export-html-btn must be ABSENT from sidepanel header (relocated to Settings page Data section)');
});

test('B-081 AC3: #add-group-btn is keyboard-activatable (native <button type="button">)', () => {
  /* Native <button> elements are Enter + Space + Tab-reachable by default.
     This test pins the native-button invariant — any future refactor to a
     <div role="button"> would trip this. */
  assert.match(html, /<button[^>]*id="add-group-btn"[^>]*type="button"/,
    'Button must be a native <button type="button"> for built-in keyboard support.');
});
