/**
 * tests/sync-classify-error.test.js — Sprint 42 R4 fix-round (M-1 / M-4).
 *
 * Pins the `_classifyError` predicate against BOTH the chrome-mock's
 * synthetic error strings AND the real Chrome runtime strings observed
 * empirically. Chrome error messages are not a stable contract; the
 * predicate is permissive and falls through to 'unknown' when no match.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _classifyError } from '../background/sync/chrome-sync.js';

test('mock chrome.tabs.move "Tab N not found" → tab-gone', () => {
  const err = new Error('Tab 42 not found');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('mock chrome.tabs.group "tab N not found" → tab-gone', () => {
  const err = new Error('chrome.tabs.group: tab 42 not found');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('mock chrome.tabGroups.get "groupId N not found" → tab-gone', () => {
  const err = new Error('chrome.tabGroups.get: groupId 1000 not found');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('real Chrome chrome.tabs.move "No tab with id: N" → tab-gone', () => {
  const err = new Error('No tab with id: 42');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('real Chrome chrome.tabs.group "No tab with id: N" → tab-gone', () => {
  const err = new Error('No tab with id: 42.');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('real Chrome chrome.tabGroups "No group with id: N" → tab-gone', () => {
  const err = new Error('No group with id: 7.');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('"No tab group with id" form → tab-gone', () => {
  const err = new Error('No tab group with id: 7');
  assert.equal(_classifyError(err), 'tab-gone');
});

test('permission error → permission', () => {
  const err = new Error('Permission denied');
  assert.equal(_classifyError(err), 'permission');
});

test('lowercase permission text → permission', () => {
  const err = new Error('User did not grant the requested permission');
  assert.equal(_classifyError(err), 'permission');
});

test('unrelated error message → unknown', () => {
  const err = new Error('Something completely unexpected went wrong');
  assert.equal(_classifyError(err), 'unknown');
});

test('null / undefined / non-Error inputs → unknown (defensive)', () => {
  assert.equal(_classifyError(null), 'unknown');
  assert.equal(_classifyError(undefined), 'unknown');
  assert.equal(_classifyError({}), 'unknown');
  assert.equal(_classifyError('not even an error object'), 'unknown');
});
