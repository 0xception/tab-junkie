/**
 * background/sync/chrome-sync.js — TJ → Chrome tab-group snapshot sync.
 *
 * Spec: docs/superpowers/specs/2026-05-01-chrome-tab-group-sync-design.md
 * Scope: push-only, snapshot-only, current-window-only.
 *
 * Public entry: syncToChrome(windowId) — invoked by the SW handler on
 * MSG_SYNC_TO_CHROME. Returns a SyncSummary describing what was done.
 *
 * Helpers prefixed `_` are exported only for unit-test access. They are not
 * part of the SW message contract and may change without warning.
 */

import { tjColorToChromeColor } from './color-map.js';

/**
 * @typedef {Object} TJGroupForSync
 * @property {string} id
 * @property {string} name
 * @property {string} color    — TJ color slug from GROUP_COLORS
 * @property {number} sortOrder
 * @property {number[]} tabIds  — live tab IDs in this window, in TJ order
 * @property {number|null} [chromeTabGroupId]
 */

/**
 * @typedef {Object} SyncWindowState
 * @property {number} windowId
 * @property {TJGroupForSync[]} groups          — pre-sorted by sortOrder
 * @property {number[]} ungroupedTabIds         — pre-ordered Open Tab IDs
 * @property {Set<number>} pinnedTabIds
 * @property {number|null} settingsTabId        — exclude from reorder
 */

/**
 * @typedef {Object} SyncSummary
 * @property {number} windowId
 * @property {number} tabsReordered
 * @property {number} groupsCreated
 * @property {number} groupsUpdated
 * @property {Array<{reason: 'pinned'|'tab-gone'|'permission'|'unknown', count: number}>} skipped
 */

/**
 * Compute the desired tab-strip order: every TJ group's tabs in TJ order, then
 * ungrouped Open Tab IDs in TJ order. Skips empty groups, pinned tabs, and the
 * Settings tab itself.
 *
 * Pure function — no chrome.* calls, no mutation of inputs.
 *
 * @param {SyncWindowState} state
 * @returns {number[]} ordered tab IDs ready for chrome.tabs.move
 */
export function _computeTargetStripOrder(state) {
  const out = [];
  const isExcluded = (id) => state.pinnedTabIds.has(id) || id === state.settingsTabId;
  const sortedGroups = [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const g of sortedGroups) {
    for (const tabId of g.tabIds) {
      if (!isExcluded(tabId)) out.push(tabId);
    }
  }
  for (const tabId of state.ungroupedTabIds) {
    if (!isExcluded(tabId)) out.push(tabId);
  }
  return out;
}
