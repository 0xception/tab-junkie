/**
 * Barrel for the live-tab subsystem (B-001c).
 *
 * Exports:
 *  - `registerTabEventListeners(readyPromise)` — call at module scope in the
 *    service worker BEFORE any await (MV3 requirement).
 *  - `initializeLiveState(readyPromise)` — call during startup to build the
 *    LiveTabIndex and reconcile TabClaims.
 *  - `buildLiveStates(items)` — synchronous helper for enriching MSG_LIST_ITEMS
 *    responses with live/active/audible state.
 */

export { registerTabEventListeners } from './tab-events.js';
export { buildLiveStates } from './tab-claims.js';
import { buildLiveTabIndex } from './live-tab-index.js';
import { reconcileClaims } from './tab-claims.js';
import { listItems } from '../storage/items.js';

/**
 * Initialize the live-state subsystem:
 *  1. Build the LiveTabIndex from `chrome.tabs.query({})`.
 *  2. Await `readyPromise` to ensure storage partitions are ready.
 *  3. Reconcile TabClaims against live tabs and saved items.
 *
 * @param {Promise<void>} readyPromise
 * @returns {Promise<void>}
 */
export async function initializeLiveState(readyPromise) {
  // M2: run index build and migration concurrently
  const [, items] = await Promise.all([
    buildLiveTabIndex(),
    readyPromise.then(() => listItems()),
  ]);
  await reconcileClaims(items);
}
