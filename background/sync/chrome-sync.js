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

/* B-041 (S42 §67.6.6) — module-level "syncing" flag. The bulk strip-reorder
   in syncToChrome triggers a storm of `chrome.tabs.onMoved` events; without
   this flag, the floating-group re-bind listener at
   `background/tabs/tab-events.js` would race our writes for the duration.
   isSyncInFlight() is the public getter consulted by that listener. */
let _isSyncing = false;

/**
 * True iff a syncToChrome call is currently in flight. Other tab event
 * listeners (e.g., chrome.tabs.onMoved → floating-group re-bind) should
 * short-circuit while this is true to avoid storm-amplification during
 * the bulk reorder.
 *
 * @returns {boolean}
 */
export function isSyncInFlight() {
  return _isSyncing;
}

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
  /* B-041 (S42 §67.6.6) — set the in-flight flag immediately and reset in
     finally so it always clears even on uncaught exceptions. The
     chrome.tabs.onMoved listener at tab-events.js short-circuits while
     this flag is true. */
  _isSyncing = true;
  try {
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
  } finally {
    _isSyncing = false;
  }
}

/**
 * Map a thrown error to one of the SyncSummary skip-reason buckets.
 *
 * Chrome error message strings are NOT a stable contract — they vary by
 * locale and Chromium version. We bucket via a permissive predicate that
 * matches BOTH the chrome-mock's synthetic strings (e.g. "Tab N not found",
 * "groupId N not found") AND the real Chrome strings observed empirically:
 *   - chrome.tabs.move rejection → "No tab with id: N"
 *   - chrome.tabs.group rejection on missing tab → "No tab with id: N"
 *   - chrome.tabGroups.get rejection on missing group → "No group with id: N"
 *
 * We accept that an unknown locale or future Chromium revision may bypass
 * the predicate and fall through to 'unknown'; that is the conservative
 * default and is preferred over silently misclassifying.
 *
 * Exported under the `_*` convention for unit-test access; not part of the
 * SW message contract.
 *
 * @param {unknown} err
 * @returns {'tab-gone'|'permission'|'unknown'}
 */
export function _classifyError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  const lower = msg.toLowerCase();
  /* tab-gone: any "not found" form or Chrome's "no <thing> with id" form. */
  if (lower.includes('not found')) return 'tab-gone';
  if (/no\s+tab\s+with\s+id/i.test(msg)) return 'tab-gone';
  if (/no\s+(tab\s+)?group\s+with\s+id/i.test(msg)) return 'tab-gone';
  if (lower.includes('permission')) return 'permission';
  return 'unknown';
}
