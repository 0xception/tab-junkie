import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _buildSummary } from '../background/sync/chrome-sync.js';

test('aggregates counts and returns an empty skipped array on full success', () => {
  const result = _buildSummary({
    windowId: 100,
    tabsReordered: 7,
    groupsCreated: 2,
    groupsUpdated: 1,
    skipReasons: [],
  });
  assert.deepEqual(result, {
    windowId: 100,
    tabsReordered: 7,
    groupsCreated: 2,
    groupsUpdated: 1,
    skipped: [],
  });
});

test('groups skip reasons by reason and counts occurrences', () => {
  const result = _buildSummary({
    windowId: 1,
    tabsReordered: 5,
    groupsCreated: 1,
    groupsUpdated: 0,
    skipReasons: ['pinned', 'pinned', 'tab-gone', 'unknown', 'pinned'],
  });
  const byReason = Object.fromEntries(result.skipped.map((s) => [s.reason, s.count]));
  assert.equal(byReason.pinned, 3);
  assert.equal(byReason['tab-gone'], 1);
  assert.equal(byReason.unknown, 1);
  assert.equal(result.skipped.length, 3);
});

test('skipped is sorted by reason for stable display', () => {
  const result = _buildSummary({
    windowId: 1, tabsReordered: 0, groupsCreated: 0, groupsUpdated: 0,
    skipReasons: ['unknown', 'pinned', 'tab-gone'],
  });
  assert.deepEqual(result.skipped.map((s) => s.reason), ['pinned', 'tab-gone', 'unknown']);
});
