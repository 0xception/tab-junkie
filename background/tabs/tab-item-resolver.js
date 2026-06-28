/**
 * Tab↔item resolver — the ONE shared tab-resolution surface (B-175 / A1).
 *
 * Before this module, the "match a live browser tab to a saved-item claim or
 * a floating-group record" logic was re-implemented across six functions
 * (reconcileClaims Phase 2 + Phase 3, reevaluateTab, buildFloatingMembers,
 * reassociateFloatingGroups, preMarkInheritedFromFloatingGroups), using two
 * matching strategies (normalized-URL match against the live index; and the
 * `(windowId, tabIndex)` position match) spread across ten call sites. The
 * R0 spike catalogued the drift this duplication caused
 * (`docs/design/74-b-173-r0-spike.md` §74.3.5 / §74.3.6 / §74.4).
 *
 * B-175 is a PURE REFACTOR: the per-site behavioural differences are
 * INTENTIONAL and are preserved here as explicit PARAMETERS, never flattened
 * to a common subset. The known differences each map to a flag:
 *   - preMark's position tier is URL-corroborated (B-132 stale-position fix)
 *     → `corroborateUrlOnPosition`.
 *   - preMark does NOT consult the direct `liveTabId` tier (it predates the
 *     B-137 v4 join key and marks by position/URL only) → `useDirectTier`.
 *   - buildFloatingMembers / preMark treat a record resolving to a CLAIMED
 *     tab as "no usable match"; reassociateFloatingGroups instead needs the
 *     raw match (to prune vs. lazy-rewrite) → optional `excludeClaimedTabIds`.
 *   - reconcile Phase 2/3 build a one-to-many URL→tabIds index with a
 *     claimed-skip on build and an inherited-skip + single-winner pop on read
 *     → `buildUnclaimedUrlIndex` + `takeUnclaimedTabForUrl`.
 *
 * Side effects (lazy `liveTabId` rewrite, record prune, claim mutation,
 * markInherited, sortOrder iteration order) stay at the call sites — this
 * module only resolves matches; it owns no state and writes no storage.
 *
 * Stateless — no chrome API calls, no storage, no module-level state. Imports
 * only `safeNormalizeForMatch` from `shared/url.js`, so there is no import cycle
 * with tab-claims / floating-groups / floating-members.
 *
 * NOTE: `takeUnclaimedTabForUrl` intentionally MUTATES its `urlToTabs` argument
 * in place (shifting popped candidates off the bucket) to enforce the
 * single-winner-per-tab invariant across reconcile Phase 2 + Phase 3. The other
 * two exports (`resolveRecordToTab`, `buildUnclaimedUrlIndex`) are pure.
 */

import { safeNormalizeForMatch } from '../../shared/url.js';

/**
 * @typedef {Object} FloatingRecordLike
 * @property {number} [liveTabId]  schema-v4 direct join key (B-137).
 * @property {number} windowId
 * @property {number} tabIndex
 * @property {string} [url]
 */

/**
 * The canonical floating-record → live-tabId join. Three tiers, each gated by
 * an option so every call site reproduces its exact current behaviour:
 *
 *   (a) DIRECT liveTabId — only when `useDirectTier` (default true):
 *       `record.liveTabId` is finite AND present in `liveTabIndex`.
 *   (b) POSITION `(windowId, tabIndex)` — the FIRST live tab whose geometry
 *       matches the record. When `corroborateUrlOnPosition` (default false),
 *       a position hit whose live URL clearly mismatches the record URL is
 *       REJECTED — the position tier then yields nothing (it does NOT scan
 *       on for another position match) and resolution falls through to the
 *       URL tier. This is the B-132 §65 stale-position false-positive fix.
 *   (c) URL fallback — the FIRST live tab whose normalized URL equals the
 *       record's normalized URL.
 *
 * Claimed-exclusion (optional) is applied AFTER the three tiers resolve, NOT
 * within each tier: a record that resolves to a tab in `excludeClaimedTabIds`
 * is reported as "no match" (returns null); it does NOT fall through to find
 * a different unclaimed tab. This matches the call-site semantics where the
 * claimed check is a post-resolution guard.
 *
 * @param {FloatingRecordLike} record
 * @param {Map<number, {url: string, windowId: number, index: number}>} liveTabIndex
 * @param {{useDirectTier?: boolean, corroborateUrlOnPosition?: boolean,
 *          excludeClaimedTabIds?: Set<number>|null}} [options]
 * @returns {number|null} the matched tabId, or null when nothing resolves
 *   (or the sole match is a claimed tab and `excludeClaimedTabIds` was given).
 */
export function resolveRecordToTab(record, liveTabIndex, options = {}) {
  const {
    useDirectTier = true,
    corroborateUrlOnPosition = false,
    excludeClaimedTabIds = null,
  } = options;

  let matchedTabId = null;
  const normalizedRecordUrl = safeNormalizeForMatch(record.url);

  // TIER (a) — DIRECT liveTabId match (B-137 §66). Skipped for preMark.
  if (useDirectTier
    && typeof record.liveTabId === 'number' && Number.isFinite(record.liveTabId)
    && liveTabIndex.has(record.liveTabId)) {
    matchedTabId = record.liveTabId;
  }

  // TIER (b) — POSITION (windowId, tabIndex), optionally URL-corroborated.
  if (matchedTabId === null) {
    for (const [tabId, entry] of liveTabIndex) {
      if (entry.windowId === record.windowId && entry.index === record.tabIndex) {
        if (corroborateUrlOnPosition
          && normalizedRecordUrl
          && safeNormalizeForMatch(entry.url) !== normalizedRecordUrl) {
          /* B-132 §65: position hit but the live URL clearly mismatches the
             record URL — a different tab drifted into this slot. Reject the
             position tier entirely; the URL fallback below may still match. */
          break;
        }
        matchedTabId = tabId;
        break;
      }
    }
  }

  // TIER (c) — URL fallback.
  if (matchedTabId === null && normalizedRecordUrl) {
    for (const [tabId, entry] of liveTabIndex) {
      if (safeNormalizeForMatch(entry.url) === normalizedRecordUrl) {
        matchedTabId = tabId;
        break;
      }
    }
  }

  // Post-resolution claimed-exclusion (optional).
  if (matchedTabId !== null && excludeClaimedTabIds && excludeClaimedTabIds.has(matchedTabId)) {
    return null;
  }
  return matchedTabId;
}

/**
 * Build the reverse index `Map<normalizedUrl, number[]>` of live tabs that are
 * NOT already claimed — the reconcileClaims Phase-2 `urlToTabs` build, lifted
 * verbatim so Phase 2 and Phase 3 share one definition.
 *
 * Tabs already in `claimedTabIds` are skipped (claimed-skip on build); tabs
 * whose URL does not normalize (javascript:/data:/unparseable) are skipped.
 * Candidate lists follow `liveTabIndex` iteration order, preserving the
 * existing first-unclaimed-wins precedence.
 *
 * @param {Map<number, {url: string}>} liveTabIndex
 * @param {Set<number>} claimedTabIds
 * @returns {Map<string, number[]>}
 */
export function buildUnclaimedUrlIndex(liveTabIndex, claimedTabIds) {
  const urlToTabs = new Map();
  for (const [tabId, entry] of liveTabIndex) {
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
  return urlToTabs;
}

/**
 * Pop and return the first non-inherited tabId from `urlToTabs[normalizedUrl]`,
 * MUTATING that candidate list in place. The mutation is what enforces the
 * single-winner-per-tab invariant ACROSS reconcile Phase 2 AND Phase 3: a tab
 * taken here is gone from the shared map for every later call. Inherited
 * candidates (B-125 / B-132 — tabs "spoken for" by a parent floating group)
 * are shifted off without binding. Returns null when the bucket is
 * empty/absent OR every remaining candidate is inherited.
 *
 * The caller still owns recording the bound tabId in its own `claimedTabIds`
 * set — that set additionally guards Phase-1-validated claims that were never
 * in the URL index to begin with.
 *
 * @param {Map<string, number[]>} urlToTabs
 * @param {string} normalizedUrl
 * @param {Set<number>} inheritedTabs
 * @returns {number|null}
 */
export function takeUnclaimedTabForUrl(urlToTabs, normalizedUrl, inheritedTabs) {
  const available = urlToTabs.get(normalizedUrl);
  if (!available || available.length === 0) return null;
  while (available.length > 0) {
    const candidate = available[0];
    if (inheritedTabs.has(candidate)) {
      available.shift();
      continue;
    }
    return available.shift();
  }
  return null;
}
