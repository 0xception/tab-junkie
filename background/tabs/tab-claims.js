/**
 * TabClaims — item-to-tab disambiguation table.
 *
 * Persisted in `chrome.storage.session` under key `tj:tabClaims` so claims
 * survive SW restarts within the same browser session but are wiped on
 * browser restart (AC8). An in-memory mirror is maintained for synchronous
 * reads during `buildLiveStates`.
 *
 * Shape: Record<string, number> — itemId to tabId.
 */

import { getLiveTabIndex } from './live-tab-index.js';
import { safeNormalizeForMatch } from '../../shared/url.js';
import { clearDrift } from './drift.js';

const SESSION_KEY = 'tj:tabClaims';

/** @type {Record<string, number>} in-memory mirror for synchronous reads */
let claimsMirror = {};

/** @type {boolean} H3: flips to true after reconcileClaims completes */
let claimsReady = false;

/** @type {Set<number>} B-125 (§59.3): opener-chain-inherited tabs that must NOT
 *  auto-claim a URL-matching saved bookmark. Populated by markInherited (called
 *  from tab-events.js after appendFloatingGroup resolves successfully). Pruned
 *  by pruneInherited (called from tab-events.js onRemoved). Ephemeral —
 *  empty on SW cold start; cold-start re-association via tj:floatingGroups is
 *  the recovery path. */
const inheritedTabs = new Set();

/**
 * B-125: mark a tab as opener-chain-inherited so reevaluateTab will skip
 * the auto-claim branch for it. Called from tab-events.js after
 * appendFloatingGroup resolves.
 * @param {number} tabId
 */
export function markInherited(tabId) {
  inheritedTabs.add(tabId);
}

/**
 * B-125: query whether a tab has been marked as opener-chain-inherited.
 * O(1) Set lookup. Used inside reevaluateTab.
 * @param {number} tabId
 * @returns {boolean}
 */
export function isInherited(tabId) {
  return inheritedTabs.has(tabId);
}

/**
 * B-125: drop the inheritance marker for a tab. Called from tab-events.js
 * on chrome.tabs.onRemoved (and inside the windows.onRemoved per-tab loop).
 * @param {number} tabId
 */
export function pruneInherited(tabId) {
  inheritedTabs.delete(tabId);
}

/**
 * Returns whether claims have been reconciled at least once.
 * @returns {boolean}
 */
export function isClaimsReady() {
  return claimsReady;
}

/**
 * Returns the current in-memory claims mirror (read-only contract).
 * Used by drift.js to look up which item is claimed for a given tabId.
 * @returns {Record<string, number>}
 */
export function getClaimsMirror() {
  return claimsMirror;
}

/**
 * Test hatch: reset internal state. Only used by test suites.
 */
export function __resetTabClaims() {
  claimsMirror = {};
  claimsReady = false;
  // B-125 (§59.2.4): clear the inheritance marker set so test-reset symmetry
  // matches claimsMirror. Every existing test that calls __resetTabClaims
  // automatically picks this up — no per-test-file change required.
  inheritedTabs.clear();
}

/**
 * Read claims from storage.session into the in-memory mirror.
 * @returns {Promise<Record<string, number>>}
 */
async function readClaims() {
  const result = await chrome.storage.session.get(SESSION_KEY);
  return result[SESSION_KEY] || {};
}

/**
 * Write the in-memory mirror back to storage.session atomically.
 * @returns {Promise<void>}
 */
async function writeClaims() {
  await chrome.storage.session.set({ [SESSION_KEY]: claimsMirror });
}

/**
 * Reconcile claims against the current LiveTabIndex and items list.
 *
 * 1. Load existing claims from storage.session.
 * 2. Validate each claim: discard if tabId is no longer in LiveTabIndex or
 *    if the tab's URL no longer matches the item's URL.
 * 3. For unclaimed items whose URL matches a tab in LiveTabIndex, assign
 *    claims in ascending sortOrder (first-unclaimed-wins). No two claims
 *    may share the same tabId (AC3).
 * 4. Write the reconciled claims back atomically and populate the mirror.
 *
 * @param {Array<{id: string, url: string, sortOrder: number}>} items
 * @returns {Promise<void>}
 */
export async function reconcileClaims(items) {
  // M5: warn if items is empty but stored claims exist
  const storedClaims = await readClaims();
  if (items.length === 0 && Object.keys(storedClaims).length > 0) {
    console.warn('[tab-junkie] reconcileClaims called with 0 items but', Object.keys(storedClaims).length, 'stored claims exist — proceeding anyway');
  }
  const index = getLiveTabIndex();
  const reconciled = {};
  const claimedTabIds = new Set();
  /* B-110 §53 (S36): track every claim that does NOT survive Phase 1
     validation. After writeClaims succeeds, clearDrift runs for each so
     orphan drift records cannot persist past a cold-start reconcile —
     enforces the §10.7 invariant (drift records only exist for claimed
     items). */
  const evictedItemIds = [];

  // Phase 1: validate existing claims
  for (const [itemId, tabId] of Object.entries(storedClaims)) {
    const tabEntry = index.get(tabId);
    const item = items.find((it) => it.id === itemId);
    if (tabEntry && item && safeNormalizeForMatch(tabEntry.url) === safeNormalizeForMatch(item.url)) {
      reconciled[itemId] = tabId;
      claimedTabIds.add(tabId);
    } else {
      evictedItemIds.push(itemId);
    }
  }

  // Phase 2: claim unclaimed items in sortOrder
  // Build a reverse lookup: normalized URL -> [tabIds not yet claimed]
  const urlToTabs = new Map();
  for (const [tabId, entry] of index) {
    if (claimedTabIds.has(tabId)) continue;
    const normalized = safeNormalizeForMatch(entry.url);
    if (!normalized) continue;
    let list = urlToTabs.get(normalized);
    if (!list) {
      list = [];
      urlToTabs.set(normalized, list);
    }
    list.push(tabId);
  }

  // Sort items by sortOrder ascending for first-unclaimed-wins
  const sorted = items
    .filter((it) => !(it.id in reconciled))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const item of sorted) {
    const normalized = safeNormalizeForMatch(item.url);
    if (!normalized) continue;
    const available = urlToTabs.get(normalized);
    if (available && available.length > 0) {
      const tabId = available.shift();
      reconciled[item.id] = tabId;
      claimedTabIds.add(tabId);
    }
  }

  claimsMirror = reconciled;
  await writeClaims();
  claimsReady = true;

  /* B-110 §53 (S36): clear drift records paired with evicted claims.
     `clearDrift` is a no-op when no record exists (drift.js:90-94 short-
     circuits when itemId is absent). Best-effort: any individual failure
     does not block reconcile completion; the next cold-start cycle will
     retry. Run after writeClaims so claimsMirror is consistent first. */
  if (evictedItemIds.length > 0) {
    await Promise.allSettled(evictedItemIds.map((itemId) => clearDrift(itemId)));
  }
}

/**
 * Release the claim held by a specific tabId. Used when a tab is closed or
 * its URL changes away from the claimed item.
 * @param {number} tabId
 * @returns {Promise<string|null>} the released itemId, or null if no claim existed
 */
export async function releaseClaimByTab(tabId) {
  for (const [itemId, claimedTabId] of Object.entries(claimsMirror)) {
    if (claimedTabId === tabId) {
      delete claimsMirror[itemId];
      await writeClaims();
      return itemId;
    }
  }
  return null;
}

/**
 * Re-evaluate claims when a tab's URL changes.
 *
 * B-099 (Option B, §46.3 D-1): the URL-mismatch claim-release branch has been
 * removed. When a claimed tab navigates to a URL that no longer matches the
 * claimed item, the claim is PRESERVED — the bookmark↔tab association now
 * survives drift. Claim release is reduced to four explicit triggers:
 *   1. tabs.onRemoved          — releaseClaimByTab
 *   2. windows.onRemoved        — releaseClaimByTab cascade
 *   3. MSG_DEMOTE_ITEM         — releaseClaimByTab in the demote handler
 *   4. MSG_NAVIGATE_TO_ITEM    — stale-claim repair branch
 *
 * The "try to claim a different item" branch is preserved so a previously
 * UNCLAIMED tab navigating to a matching saved URL still auto-claims.
 * Under D-3 (re-claim contention), a tab that is still claimed (because the
 * claim was preserved across the URL change) hits the `alreadyClaimed`
 * short-circuit below — the auto-claim branch is a no-op for drifted tabs.
 *
 * @param {number} tabId
 * @param {string} newUrl
 * @param {Array<{id: string, url: string, sortOrder: number}>} items
 * @returns {Promise<void>}
 */
export async function reevaluateTab(tabId, newUrl, items) {
  const normalizedNew = safeNormalizeForMatch(newUrl);
  let dirty = false;

  // Try to claim for a different item whose URL matches the new URL
  if (normalizedNew) {
    // B-099 D-3: if the tab is already claimed (the claim is preserved across
    // URL changes — see D-1 above), the auto-claim block is a no-op. The
    // original claim wins; the new matching item remains unclaimed until the
    // user explicitly demotes the original or closes the tab.
    const alreadyClaimed = Object.values(claimsMirror).includes(tabId);
    if (!alreadyClaimed) {
      // B-125 (§59.3): an opener-chain-inherited tab must NOT auto-claim a
      // URL-matching saved bookmark — the inheritance marker says the tab is
      // already "spoken for" by the parent group. Gate sits inside the
      // !alreadyClaimed branch so the existing short-circuit is unaffected.
      if (inheritedTabs.has(tabId)) {
        return;
      }
      // Find unclaimed items matching this URL, sorted by sortOrder
      const candidates = items
        .filter((it) => safeNormalizeForMatch(it.url) === normalizedNew && !(it.id in claimsMirror))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      if (candidates.length > 0) {
        claimsMirror[candidates[0].id] = tabId;
        dirty = true;
      }
    }
  }

  if (dirty) {
    await writeClaims();
  }
}

/**
 * Build live states for all items from the in-memory claims mirror and
 * LiveTabIndex. Pure synchronous function.
 *
 * @param {Array<{id: string}>} items
 * @returns {Record<string, {live: boolean, active: boolean, audible: boolean, favIconUrl: string|null, tabId?: number, windowId?: number}>}
 *   `tabId` and `windowId` are present only when `live === true` (B-014 /
 *   B-026 widened the shape so the sidepanel can render the cross-window
 *   badge and dispatch tabId-scoped actions without an extra round-trip).
 */
export function buildLiveStates(items) {
  // H3: before reconcileClaims has run, return explicit not-ready defaults
  if (!claimsReady) {
    const states = {};
    for (const item of items) {
      states[item.id] = { live: false, active: false, audible: false, favIconUrl: null };
    }
    return states;
  }
  const index = getLiveTabIndex();
  const states = {};
  for (const item of items) {
    const tabId = claimsMirror[item.id];
    if (tabId !== undefined) {
      const tabEntry = index.get(tabId);
      if (tabEntry) {
        states[item.id] = {
          live: true,
          active: tabEntry.active,
          audible: tabEntry.audible,
          favIconUrl: tabEntry.favIconUrl || null,
          tabId,
          /* B-014: surface the claim's current windowId so the sidepanel can
             render the cross-window badge on saved-item rows (AC7) without a
             second round-trip. Ephemeral — never persisted. */
          windowId: tabEntry.windowId,
        };
        continue;
      }
    }
    states[item.id] = { live: false, active: false, audible: false, favIconUrl: null };
  }
  return states;
}

/**
 * H2: Reverse lookup — find the itemId claimed by a given tabId.
 * O(n) scan is acceptable; performance backlog tracks a reverse map.
 * @param {number} tabId
 * @returns {string|null}
 */
export function getItemIdForTab(tabId) {
  const entry = Object.entries(claimsMirror).find(([, tid]) => tid === tabId);
  return entry ? entry[0] : null;
}

/**
 * H7: Register a claim for an item+tab in the in-memory mirror AND write to
 * storage.session. Used by floating-groups.js after successful re-association
 * so buildLiveStates correctly reflects the claim.
 * @param {string} itemId
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function claimTabForItem(itemId, tabId) {
  claimsMirror[itemId] = tabId;
  await writeClaims();
}
