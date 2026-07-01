/**
 * Live-tab descriptor projection — B-189 §77.6.2 (display-order
 * consolidation Tier-A A2, the "cheap, safe" unify win).
 *
 * `buildOpenTabs` (open-tabs.js) and `buildFloatingMembers` (floating-members.js)
 * both project a `LiveTabIndex` entry into the SAME set of live-tab fields
 * (`tabId` + the seven ephemeral browser-state fields). Before B-189 that
 * projection was written out twice, expression-for-expression, in two modules —
 * a silent-drift surface (add a field to one, forget the other). §77.6.2
 * prescribes "Extract ONE `LiveTabDescriptor` base; floating extends it." This
 * is that base.
 *
 * The OPEN-TAB descriptor uses the base VERBATIM. The FLOATING descriptor
 * EXTENDS it with `parentItemId` (+ optional `sortOrder` / `floatingTabId`,
 * stamped by the caller). The two build passes — their DATA SOURCES
 * (`LiveTabIndex`-derived open tabs vs `tj:floatingGroups`-resolved members),
 * their SORT keys (`(windowId, tabIndex)` vs `sortOrder`), and their EXCLUSION
 * predicates — stay SEPARATE per the §77.6.1 keep-separate boundary. ONLY the
 * per-entry field projection is shared here.
 *
 * `tabId`, `windowId`, and `tabIndex` are ephemeral (NOT stable across browser
 * restart) and must never be persisted by callers.
 *
 * @param {number} tabId  the resolved live tab id.
 * @param {{url?: string, title?: string, windowId: number, active?: boolean,
 *   audible?: boolean, index?: number, favIconUrl?: string}} entry
 *   a `LiveTabIndex` entry (see background/tabs/live-tab-index.js).
 * @returns {{tabId: number, windowId: number, title: string, url: string,
 *   favIconUrl: string|null, audible: boolean, active: boolean, tabIndex: number}}
 */
export function liveTabDescriptor(tabId, entry) {
  return {
    tabId,
    windowId: entry.windowId,
    title: entry.title || '',
    url: entry.url || '',
    favIconUrl: entry.favIconUrl ? entry.favIconUrl : null,
    audible: !!entry.audible,
    active: !!entry.active,
    tabIndex: typeof entry.index === 'number' ? entry.index : 0,
  };
}
