import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _computeTargetStripOrder } from '../background/sync/chrome-sync.js';

test('orders tabs: groups in TJ order, members in TJ order, then ungrouped', () => {
  const state = {
    windowId: 100,
    groups: [
      { id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11, 12, 13] },
      { id: 'g2', name: 'B', color: 'red', sortOrder: 1, tabIds: [21, 22] },
    ],
    ungroupedTabIds: [31, 32],
    pinnedTabIds: new Set(),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 12, 13, 21, 22, 31, 32]);
});

test('skips empty groups silently', () => {
  const state = {
    windowId: 100,
    groups: [
      { id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11] },
      { id: 'g2', name: 'B', color: 'red', sortOrder: 1, tabIds: [] },
      { id: 'g3', name: 'C', color: 'pink', sortOrder: 2, tabIds: [13] },
    ],
    ungroupedTabIds: [],
    pinnedTabIds: new Set(),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 13]);
});

test('excludes pinned tabs from output', () => {
  const state = {
    windowId: 100,
    groups: [{ id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11, 12] }],
    ungroupedTabIds: [21, 22],
    pinnedTabIds: new Set([12, 22]),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 21]);
});

test('excludes the Settings tab from output', () => {
  const state = {
    windowId: 100,
    groups: [{ id: 'g1', name: 'A', color: 'blue', sortOrder: 0, tabIds: [11] }],
    ungroupedTabIds: [21, 99],
    pinnedTabIds: new Set(),
    settingsTabId: 99,
  };
  assert.deepEqual(_computeTargetStripOrder(state), [11, 21]);
});

test('returns empty array when nothing is groupable', () => {
  const state = {
    windowId: 100,
    groups: [],
    ungroupedTabIds: [],
    pinnedTabIds: new Set(),
    settingsTabId: null,
  };
  assert.deepEqual(_computeTargetStripOrder(state), []);
});
