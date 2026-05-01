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
import { listGroups, updateGroup } from '../storage/groups.js';
import { listItems } from '../storage/items.js';

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

/**
 * Aggregate raw counters + the array of skip-reason strings into the
 * SyncSummary shape that crosses the SW→UI boundary.
 *
 * @param {{
 *   windowId: number,
 *   tabsReordered: number,
 *   groupsCreated: number,
 *   groupsUpdated: number,
 *   skipReasons: Array<'pinned'|'tab-gone'|'permission'|'unknown'>,
 * }} input
 * @returns {SyncSummary}
 */
export function _buildSummary(input) {
  const counts = new Map();
  for (const reason of input.skipReasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const skipped = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => a.reason.localeCompare(b.reason));
  return {
    windowId: input.windowId,
    tabsReordered: input.tabsReordered,
    groupsCreated: input.groupsCreated,
    groupsUpdated: input.groupsUpdated,
    skipped,
  };
}

/* ============================================================================
   State collection — turns chrome.* + storage reads into a SyncWindowState.
   ========================================================================== */

/**
 * Collect the live + stored state for the target window into a SyncWindowState.
 * Tabs are filtered to the target window. Pinned tabs are recorded separately
 * so the strip-reorder skips them but the orchestrator counts them as skipped.
 *
 * @param {number} windowId
 * @returns {Promise<SyncWindowState>}
 */
async function _collectWindowState(windowId) {
  const [allTabs, currentSelf] = await Promise.all([
    chrome.tabs.query({ windowId }),
    /* The Settings tab calling syncToChrome lives in this window — capture
       its id so the strip-reorder excludes it. */
    chrome.tabs.query({ active: true, windowId }).then((arr) => arr[0]),
  ]);
  const settingsTabId = currentSelf?.id ?? null;
  const pinnedTabIds = new Set(allTabs.filter((t) => t.pinned).map((t) => t.id));
  const tabsByUrl = new Map(allTabs.map((t) => [t.url, t]));

  const [groups, items] = await Promise.all([listGroups(), listItems()]);

  /* Compute per-group live tab IDs by URL match — TJ items carry `url`; we
     pair each item to its tab in this window, in TJ sortOrder. */
  const groupedTabIds = new Set();
  const tjGroups = groups
    .filter((g) => g.parentId === null) // top-level only; sub-groups not yet covered (out of scope)
    .map((g) => {
      const groupItems = items
        .filter((i) => i.groupId === g.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const tabIds = [];
      for (const it of groupItems) {
        const tab = tabsByUrl.get(it.url);
        if (tab && !groupedTabIds.has(tab.id)) {
          tabIds.push(tab.id);
          groupedTabIds.add(tab.id);
        }
      }
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        sortOrder: g.sortOrder,
        tabIds,
        chromeTabGroupId: g.chromeTabGroupId ?? null,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const ungroupedTabIds = allTabs
    .filter((t) => !groupedTabIds.has(t.id) && !t.pinned && t.id !== settingsTabId)
    .sort((a, b) => a.index - b.index)
    .map((t) => t.id);

  return { windowId, groups: tjGroups, ungroupedTabIds, pinnedTabIds, settingsTabId };
}

/**
 * Verify a stored chromeTabGroupId is still live in Chrome. Returns the id if
 * valid, null if the group was deleted by the user or never existed.
 *
 * @param {number|null} storedId
 * @returns {Promise<number|null>}
 */
async function _validateChromeGroupId(storedId) {
  if (typeof storedId !== 'number') return null;
  try {
    await chrome.tabGroups.get(storedId);
    return storedId;
  } catch {
    return null;
  }
}

/**
 * Group `tabIds` into Chrome tab group `existingId` (or create new if null).
 * Then update title + color. Returns { groupId, created }.
 *
 * @param {{ tabIds: number[], existingId: number|null, title: string, color: string, windowId: number }} args
 */
async function _applyTabsToGroup({ tabIds, existingId, title, color, windowId }) {
  let groupId;
  let created = false;
  if (existingId !== null) {
    groupId = await chrome.tabs.group({ tabIds, groupId: existingId });
  } else {
    groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId } });
    created = true;
  }
  await chrome.tabGroups.update(groupId, { title, color });
  return { groupId, created };
}

/* ============================================================================
   Public entry — syncToChrome(windowId).
   ========================================================================== */

/**
 * @param {number} windowId
 * @returns {Promise<SyncSummary>}
 */
export async function syncToChrome(windowId) {
  if (typeof windowId !== 'number') {
    throw new TypeError('syncToChrome: windowId must be a number');
  }
  const skipReasons = [];
  let tabsReordered = 0;
  let groupsCreated = 0;
  let groupsUpdated = 0;

  const state = await _collectWindowState(windowId);
  const targetOrder = _computeTargetStripOrder(state);

  // Count pinned tabs as skipped per spec §6.
  for (let i = 0; i < state.pinnedTabIds.size; i++) skipReasons.push('pinned');

  // Phase 1 — strip reorder (best-effort).
  if (targetOrder.length > 0) {
    try {
      await chrome.tabs.move(targetOrder, { index: 0, windowId });
      tabsReordered = targetOrder.length;
    } catch (_err) {
      // If the bulk move fails, fall back to per-tab and count failures.
      for (let i = 0; i < targetOrder.length; i++) {
        try {
          await chrome.tabs.move(targetOrder[i], { index: i, windowId });
          tabsReordered++;
        } catch (perTabErr) {
          skipReasons.push(_classifyError(perTabErr));
        }
      }
    }
  }

  // Phase 2 — apply each non-empty TJ group.
  for (const g of state.groups) {
    const liveTabIds = g.tabIds.filter(
      (id) => !state.pinnedTabIds.has(id) && id !== state.settingsTabId,
    );
    if (liveTabIds.length === 0) continue; // empty groups skipped silently
    const validId = await _validateChromeGroupId(g.chromeTabGroupId);
    try {
      const { groupId, created } = await _applyTabsToGroup({
        tabIds: liveTabIds,
        existingId: validId,
        title: g.name,
        color: tjColorToChromeColor(g.color),
        windowId,
      });
      if (created) groupsCreated++; else groupsUpdated++;
      if (groupId !== g.chromeTabGroupId) {
        // Persist the new (or replacement) Chrome group ID back to the TJ record.
        await updateGroup(g.id, { chromeTabGroupId: groupId });
      }
    } catch (err) {
      skipReasons.push(_classifyError(err));
    }
  }

  return _buildSummary({
    windowId, tabsReordered, groupsCreated, groupsUpdated, skipReasons,
  });
}

/**
 * Map a thrown error to one of the SyncSummary skip-reason buckets.
 */
function _classifyError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  if (msg.includes('not found')) return 'tab-gone';
  if (msg.toLowerCase().includes('permission')) return 'permission';
  return 'unknown';
}
