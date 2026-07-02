/**
 * LiveTabIndex — ephemeral in-memory map of all browser tabs.
 *
 * Populated once on cold start via `chrome.tabs.query({})`, then kept current
 * by the tab/window event handlers in `tab-events.js`. Never written to
 * `chrome.storage.local` (AC4).
 *
 * Shape: Map<number, {url: string, title: string, windowId: number, active: boolean, audible: boolean, index: number, favIconUrl: string}>
 *
 * B-055: `title` was added so the Open Tabs section can be rendered without a
 * per-tab `chrome.tabs.get` round-trip. It is purely in-memory; nothing
 * persisted. `tab-events.js onUpdated` propagates `changeInfo.title` here.
 */

/** @type {Map<number, {url: string, title: string, windowId: number, active: boolean, audible: boolean, index: number, favIconUrl: string}>} */
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
      title: tab.title || '',
      windowId: tab.windowId,
      active: tab.active || false,
      audible: tab.audible || false,
      index: typeof tab.index === 'number' ? tab.index : 0,
      favIconUrl: tab.favIconUrl || '',
    });
  }
}

/**
 * Return the live index map (read-only contract — callers should not mutate).
 * @returns {Map<number, {url: string, title: string, windowId: number, active: boolean, audible: boolean, index: number, favIconUrl: string}>}
 */
export function getLiveTabIndex() {
  return liveTabIndex;
}

/**
 * Update a single entry in the index. Creates the entry if it does not exist.
 * @param {number} tabId
 * @param {Partial<{url: string, title: string, windowId: number, active: boolean, audible: boolean, index: number, favIconUrl: string}>} patch
 */
export function updateTabEntry(tabId, patch) {
  const existing = liveTabIndex.get(tabId);
  if (existing) {
    Object.assign(existing, patch);
  } else {
    // M1: spread first, then apply fallbacks to avoid undefined overwrites
    const entry = { ...patch };
    entry.url = entry.url ?? '';
    entry.title = entry.title ?? '';
    entry.windowId = entry.windowId ?? 0;
    entry.active = entry.active ?? false;
    entry.audible = entry.audible ?? false;
    entry.index = typeof entry.index === 'number' ? entry.index : 0;
    entry.favIconUrl = entry.favIconUrl ?? '';
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
 * B-186: Renumber surviving same-window entries after ONE tab is removed.
 *
 * Chrome shifts every tab to the right of a closed tab down by one strip
 * position, but fires NO `chrome.tabs.onMoved` for that implicit shift. Left
 * unhandled, `LiveTabIndex.index` keeps its pre-close value for every survivor
 * above the closed slot; `buildOpenTabs` sorts by `(windowId, index)`, so the
 * stale indices scramble the Open Tabs rows on the next re-render (the
 * activate-jumps-up bug).
 *
 * Decrement `index` by one for every entry in `windowId` whose `index` is
 * strictly greater than `removedIndex`. Entries at or below the closed slot,
 * and every entry in any other window, are left untouched.
 *
 * Deliberately NOT folded into `removeTabEntry`: that primitive is a pure
 * single-key delete shared by the onRemoved cascade, the window-close teardown,
 * and tests, and it cannot see the `removeInfo.isWindowClosing` signal needed to
 * skip the churn a whole-window close would cause (every window-close tab
 * fires `chrome.tabs.onRemoved` per-tab before `chrome.windows.onRemoved`).
 * The sole caller is the `chrome.tabs.onRemoved` handler in tab-events.js,
 * which owns that signal and passes the closed tab's ORIGINAL `{windowId,
 * index}` captured BEFORE the cascade deletes the entry. A whole-window close
 * is handled en masse by `removeTabsByWindow`, so no per-survivor renumber is
 * needed (or wanted) there.
 *
 * @param {number} windowId  the closed tab's window
 * @param {number} removedIndex  the closed tab's strip index
 * @returns {void}
 */
export function renumberAfterRemoval(windowId, removedIndex) {
  if (typeof windowId !== 'number' || typeof removedIndex !== 'number') return;
  for (const entry of liveTabIndex.values()) {
    if (entry.windowId === windowId && entry.index > removedIndex) {
      entry.index -= 1;
    }
  }
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
