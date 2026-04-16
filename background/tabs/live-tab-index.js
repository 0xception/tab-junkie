/**
 * LiveTabIndex — ephemeral in-memory map of all browser tabs.
 *
 * Populated once on cold start via `chrome.tabs.query({})`, then kept current
 * by the tab/window event handlers in `tab-events.js`. Never written to
 * `chrome.storage.local` (AC4).
 *
 * Shape: Map<number, {url: string, windowId: number, active: boolean, audible: boolean, index: number}>
 */

/** @type {Map<number, {url: string, windowId: number, active: boolean, audible: boolean, index: number}>} */
const liveTabIndex = new Map();

/**
 * Populate the index from scratch using `chrome.tabs.query({})`.
 * Called once during cold-start initialization.
 * @returns {Promise<void>}
 */
export async function buildLiveTabIndex() {
  const tabs = await chrome.tabs.query({});
  liveTabIndex.clear();
  for (const tab of tabs) {
    liveTabIndex.set(tab.id, {
      url: tab.url || '',
      windowId: tab.windowId,
      active: tab.active || false,
      audible: tab.audible || false,
      index: typeof tab.index === 'number' ? tab.index : 0,
    });
  }
}

/**
 * Return the live index map (read-only contract — callers should not mutate).
 * @returns {Map<number, {url: string, windowId: number, active: boolean, audible: boolean}>}
 */
export function getLiveTabIndex() {
  return liveTabIndex;
}

/**
 * Update a single entry in the index. Creates the entry if it does not exist.
 * @param {number} tabId
 * @param {Partial<{url: string, windowId: number, active: boolean, audible: boolean, index: number}>} patch
 */
export function updateTabEntry(tabId, patch) {
  const existing = liveTabIndex.get(tabId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    // M1: spread first, then apply fallbacks to avoid undefined overwrites
    const entry = { ...patch };
    entry.url = entry.url ?? '';
    entry.windowId = entry.windowId ?? 0;
    entry.active = entry.active ?? false;
    entry.audible = entry.audible ?? false;
    entry.index = typeof entry.index === 'number' ? entry.index : 0;
    liveTabIndex.set(tabId, entry);
  }
}

/**
 * Remove a tab from the index.
 * @param {number} tabId
 */
export function removeTabEntry(tabId) {
  liveTabIndex.delete(tabId);
}

/**
 * Test hatch: clear the entire index. Only used by test suites to reset
 * module-level state between test cases.
 */
export function __resetLiveTabIndex() {
  liveTabIndex.clear();
}

/**
 * Remove all tabs belonging to a window. Returns the removed tabIds so
 * callers can batch-release associated claims.
 * @param {number} windowId
 * @returns {number[]} removed tabIds
 */
export function removeTabsByWindow(windowId) {
  const removed = [];
  for (const [tabId, entry] of liveTabIndex) {
    if (entry.windowId === windowId) {
      removed.push(tabId);
    }
  }
  for (const tabId of removed) {
    liveTabIndex.delete(tabId);
  }
  return removed;
}
