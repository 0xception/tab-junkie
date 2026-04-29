/**
 * Open Tabs derivation — B-055.
 *
 * Pure synchronous helper that reads `LiveTabIndex` + `claimsMirror` and
 * returns the list of live browser tabs that are NOT claimed by any saved
 * item. See `docs/SOLUTION_DESIGN.md` §26 for the full architecture.
 *
 * This module performs NO storage writes and introduces NO new message types.
 * `tabId` and `windowId` are ephemeral (not stable across browser restart)
 * and must never be persisted by callers.
 */

import { getLiveTabIndex } from './live-tab-index.js';
import { getClaimsMirror, isClaimsReady } from './tab-claims.js';

/**
 * Build the `openTabs` array for the enriched MSG_LIST_ITEMS response.
 *
 * Exclusion predicate (B-121 §60.7): a live tab `t` qualifies iff
 *   (a) t.tabId ∈ liveTabIndex                       — trivially true by iteration source
 *   (b) t.tabId ∉ Object.values(claimsMirror)        — not claimed by any saved item
 *   (c) t.tabId ∉ floatingTabIds                     — not a runtime floating-group member
 *
 * Cold-start safety (C-3): if claims have not been reconciled yet, return
 * `[]` rather than leak every saved bookmark's live tab into the section.
 *
 * Sort (AC9): (windowId asc, tabIndex asc) — stable, deterministic.
 *
 * @param {Set<number>} [floatingTabIds] tabIds resolved as floating-group
 *   members by buildFloatingMembers. Default-empty preserves the legacy
 *   no-arg signature for tests / callers that do not need the exclusion.
 * @returns {import('../../shared/messages.js').OpenTab[]}
 */
export function buildOpenTabs(floatingTabIds = new Set()) {
  if (!isClaimsReady()) return [];

  const index = getLiveTabIndex();
  const claimedTabIds = new Set(Object.values(getClaimsMirror()));

  const tabs = [];
  for (const [tabId, entry] of index) {
    if (claimedTabIds.has(tabId)) continue;
    if (floatingTabIds.has(tabId)) continue;
    tabs.push({
      tabId,
      windowId: entry.windowId,
      title: entry.title || '',
      url: entry.url || '',
      favIconUrl: entry.favIconUrl ? entry.favIconUrl : null,
      audible: !!entry.audible,
      active: !!entry.active,
      tabIndex: typeof entry.index === 'number' ? entry.index : 0,
    });
  }

  // AC9 sort: windowId asc, tabIndex asc.
  tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.tabIndex - b.tabIndex;
  });

  return tabs;
}
