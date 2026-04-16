/**
 * Barrel for the live-tab subsystem (B-001c + B-001d).
 *
 * Exports:
 *  - `registerTabEventListeners(readyPromise)` — call at module scope in the
 *    service worker BEFORE any await (MV3 requirement).
 *  - `initializeLiveState(readyPromise)` — call during startup to build the
 *    LiveTabIndex, reconcile TabClaims, and re-associate floating groups.
 *  - `buildLiveStates(items)` — synchronous helper for enriching MSG_LIST_ITEMS
 *    responses with live/active/audible state.
 *  - `getDriftRecords()` — read all drift records from tj:drift for
 *    MSG_LIST_ITEMS enrichment.
 */

export { registerTabEventListeners } from './tab-events.js';
export { buildLiveStates } from './tab-claims.js';
export { getDriftRecords } from './drift.js';
import { buildLiveTabIndex, getLiveTabIndex } from './live-tab-index.js';
import { reconcileClaims, getClaimsMirror } from './tab-claims.js';
import { reassociateFloatingGroups } from './floating-groups.js';
import { listItems } from '../storage/items.js';

/**
 * Initialize the live-state subsystem:
 *  1. Build the LiveTabIndex from `chrome.tabs.query({})`.
 *  2. Await `readyPromise` to ensure storage partitions are ready.
 *  3. Reconcile TabClaims against live tabs and saved items.
 *  4. Re-associate floating groups from tj:floatingGroups (B-001d AC10).
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
  // B-001d AC10: re-associate floating groups after claims are established
  await reassociateFloatingGroups(getLiveTabIndex(), getClaimsMirror());
}
