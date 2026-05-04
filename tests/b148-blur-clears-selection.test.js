/**
 * B-148 polish — sidepanel `window.blur` listener clears multi-selection
 * when focus leaves the sidepanel (off-surface click UX).
 *
 * Static-source pins verifying the listener exists and is correctly
 * guarded against in-flight drags + open dialogs. A live integration
 * test would need a real Chromium sidepanel context (window.blur fires
 * on focus loss across native windows, which jsdom + node:test can't
 * faithfully reproduce).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const _testDir = dirname(fileURLToPath(import.meta.url));
function loadSidepanelSrc() {
  return readFileSync(join(_testDir, '..', 'sidepanel', 'sidepanel.js'), 'utf8');
}

test('B-148 polish: window.blur listener clears multi-selection', () => {
  const src = loadSidepanelSrc();
  assert.match(src, /window\.addEventListener\('blur'/);
});

test('B-148 polish: blur listener no-ops when _selectionMode is false', () => {
  const src = loadSidepanelSrc();
  /* Search for the blur listener body and confirm the early-return guard. */
  const blurIdx = src.indexOf("window.addEventListener('blur'");
  assert.ok(blurIdx >= 0, 'blur listener present');
  const after = src.slice(blurIdx, blurIdx + 600);
  assert.match(after, /if \(!_selectionMode\) return/);
});

test('B-148 polish: blur listener skips clear during in-flight drag', () => {
  const src = loadSidepanelSrc();
  const blurIdx = src.indexOf("window.addEventListener('blur'");
  const after = src.slice(blurIdx, blurIdx + 600);
  /* Guard checks for any of the three drag states. */
  assert.match(after, /_tabDragState/);
  assert.match(after, /_itemDragState/);
  assert.match(after, /_groupDragState/);
});

test('B-148 polish: blur listener skips clear when dialog is open', () => {
  const src = loadSidepanelSrc();
  const blurIdx = src.indexOf("window.addEventListener('blur'");
  const after = src.slice(blurIdx, blurIdx + 600);
  assert.match(after, /dialogOverlayEl[\s\S]{0,80}hidden/);
});

test('B-148 polish: blur listener calls _clearSelection', () => {
  const src = loadSidepanelSrc();
  const blurIdx = src.indexOf("window.addEventListener('blur'");
  const after = src.slice(blurIdx, blurIdx + 600);
  assert.match(after, /_clearSelection\(\)/);
});
