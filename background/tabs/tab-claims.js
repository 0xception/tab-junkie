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
import { clearDrift, getDriftRecords } from './drift.js';

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
 * Four-phase pipeline (B-163 extended the legacy two-phase pipeline with
 * Phase 3 + Phase 4 to enable drift-URL fallback re-binding before drift
 * records are dropped; see `docs/design/70-b-163-drift-fallback-reconcile.md`):
 *
 *   Phase 1 — Validate existing claims: keep iff the tab is still in
 *             LiveTabIndex AND the saved item still exists. URL match is
 *             intentionally NOT re-checked (B-149: the B-099 D-1 runtime
 *             claim-preservation contract must hold at the cold-start
 *             boundary too).
 *   Phase 2 — Assign unclaimed items to unclaimed tabs by primary
 *             `item.url`, first-unclaimed-wins in ascending sortOrder.
 *             Inherited tabs (B-125 / B-132) are skipped.
 *   Phase 3 — (B-163) Drift-URL fallback. For each item evicted in Phase 1
 *             AND still unbound after Phase 2, consult its drift record
 *             (if any) and try to bind by `driftedToUrl` against the same
 *             `urlToTabs` map. Inherited-tab skip mirrors Phase 2. No TTL
 *             gate (AC7 RESOLVED — NO TTL).
 *   Phase 4 — (B-163) Conditional drift drop. Clear drift records ONLY for
 *             items still unbound after Phase 3 (both URL candidates
 *             failed → drift is truly orphaned; safe to drop per the §10.7
 *             invariant). Replaces the unconditional §53 paired-clear that
 *             used to fire for every Phase-1-evicted itemId.
 *
 * Writes the reconciled claims back atomically and populates the mirror
 * between Phases 3 and 4.
 *
 * @param {Array<{id: string, url: string, sortOrder: number}>} items
 * @returns {Promise<void>}
 */
export async function reconcileClaims(items) {
  /* TEMP DEBUG (S45 post-UAT diagnostic, will be reverted) — capture
     runtime state through Phase 3 to a chrome.storage.local key the
     user can read after SW reload (SW console doesn't persist). */
  const _dbg = {
    timestamp: Date.now(),
    entry: {
      itemCount: items.length,
      ytmItem: items.find((it) => it.url && it.url.toLowerCase().includes('music.youtube')) || null,
    },
  };

  // M5: warn if items is empty but stored claims exist
  const storedClaims = await readClaims();
  _dbg.entry.storedClaimsKeys = Object.keys(storedClaims);
  if (items.length === 0 && Object.keys(storedClaims).length > 0) {
    console.warn('[tab-junkie] reconcileClaims called with 0 items but', Object.keys(storedClaims).length, 'stored claims exist — proceeding anyway');
  }
  const index = getLiveTabIndex();
  _dbg.entry.liveIndexSize = index.size;
  _dbg.entry.ytmTabFromIndex = (() => {
    for (const [tabId, entry] of index) {
      if (entry.url && entry.url.toLowerCase().includes('music.youtube')) {
        return { tabId, url: entry.url };
      }
    }
    return null;
  })();
  const reconciled = {};
  const claimedTabIds = new Set();
  /* B-110 §53 (S36) / B-163 §70.3.2 (S45): track every claim that does
     NOT survive Phase 1 validation. Drives BOTH Phase 3 (the drift-URL
     fallback iterates `evictedItemIds` looking for unbound items) AND
     Phase 4 (conditional drift drop on the post-Phase-3 unrecovered
     subset). The §10.7 invariant ("drift records only exist for claimed
     items") is asserted at the END of reconcile, not mid-pipeline. */
  const evictedItemIds = [];

  // Phase 1: validate existing claims
  /* B-149 (Sprint 41 polish): the survival predicate intentionally does NOT
     re-check URL match. The B-099 D-1 contract (see reevaluateTab docstring
     above, lines 233-247) makes the bookmark↔tab association survive URL
     drift at runtime; the cold-start path must enforce the SAME contract or
     a service-worker idle-shutdown (~30s MV3 idle window) silently re-evicts
     every drifted-but-live claim the next time reconcileClaims runs. Drift
     state is owned by detectDriftForTab and is independent of claim
     survival — it is re-detected on the next URL-change event. The earlier
     test `tests/b110-drift-non-live-fix.test.js:242-261` (T5) historically
     pinned the buggy URL-match eviction as desired behavior; that test was
     inverted as part of the B-149 fix. The legitimate eviction case (tab
     missing from LiveTabIndex OR saved item missing) is preserved by the
     `tabEntry && item` predicate and is still covered by T4 + T6. See
     `docs/findings/post-s41-pre-merge-triage.md` § "B-149 R0 Spike". */
  for (const [itemId, tabId] of Object.entries(storedClaims)) {
    const tabEntry = index.get(tabId);
    const item = items.find((it) => it.id === itemId);
    if (tabEntry && item) {
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
      /* B-132 §65.5: skip opener-chain-inherited candidates. The
         inheritedTabs Set is populated at cold-start by
         preMarkInheritedFromFloatingGroups in floating-groups.js, and at
         runtime by appendFloatingGroup in tab-events.js per §59.3. The
         skip mirrors the B-125 reevaluateTab gate at line 250 above —
         both prevent auto-claim of a tab that is "spoken for" by a parent
         floating group. Pop the inherited candidate so the next-best
         candidate can be claimed; if every candidate is filtered, the
         saved item remains unclaimed. */
      let claimedTabId = null;
      while (available.length > 0) {
        const candidate = available[0];
        if (inheritedTabs.has(candidate)) {
          available.shift();
          continue;
        }
        claimedTabId = available.shift();
        break;
      }
      if (claimedTabId !== null) {
        reconciled[item.id] = claimedTabId;
        claimedTabIds.add(claimedTabId);
      }
    }
  }

  /* Phase 3 (B-163 §70.3.1): drift-URL fallback. For ANY item still
     unbound after Phase 2 — regardless of whether it had a prior claim in
     session storage. Consult its drift record and attempt to bind via
     `driftedToUrl` against the same `urlToTabs` map Phase 2 already built.

     B-163 R4 round-2 fix (S45 post-UAT): the original R3 implementation
     restricted this set to `evictedItemIds.filter(id => !(id in reconciled))`,
     which silently broke the user-story symptom on **extension reload**:
     `chrome.storage.session` is wiped on reload → `storedClaims = {}` →
     Phase 1 has nothing to iterate → `evictedItemIds = []` → Phase 3
     skipped entirely. Drifted items had no path to re-association after
     reload (despite the durable `tj:drift` record). The fix matches the
     R1 LOCKED contract wording verbatim: "for each item still unbound
     after Phase-2". Phase 2 still wins primary-URL precedence (AC2);
     Phase 4 stays scoped to `evictedItemIds` only (preserves §10.7
     invariant for items that never had a session-storage claim — their
     drift records are managed by the runtime detectDriftForTab cycle, not
     by cold-start cleanup). T10 is the regression guard.

     Skipped entirely when no items remain unbound (the typical full-
     recovery case) so the `getDriftRecords()` storage read is gated. */
  const stillUnbound = items
    .filter((it) => !(it.id in reconciled))
    .map((it) => it.id);

  /* TEMP DEBUG */
  _dbg.phase2 = {
    reconciledKeys: Object.keys(reconciled),
    stillUnboundCount: stillUnbound.length,
    stillUnboundContainsYtm: _dbg.entry.ytmItem ? stillUnbound.includes(_dbg.entry.ytmItem.id) : null,
    urlToTabsMusicYoutubeKeys: [...urlToTabs.keys()].filter((k) => k.includes('music.youtube')),
    urlToTabsTotalKeys: urlToTabs.size,
  };

  if (stillUnbound.length > 0) {
    /* B-163 R4 HIGH-1 (S45): graceful degradation on drift-partition read
       failure. `getDriftRecords()` calls `readPartition(PARTITION_DRIFT)`
       (drift.js:102-104) which throws `StorageError(ERR_CORRUPT_DATA)` if
       any drift record fails `assertShape` (shapes.js:258-281) OR if
       `chrome.storage.local.get` rejects. Without this guard the rejection
       propagates out of reconcileClaims BEFORE `writeClaims()` + `claimsReady
       = true` (:284-286), leaving every saved item appearing offline until
       browser restart — silent DoS. Mirror the B-132 graceful-degradation
       pattern at `background/tabs/index.js:58-62`: log a console.warn and
       continue with `driftRecords = {}` so Phase 3 becomes a no-op for all
       evicted items. Phase 4 still runs against `unrecovered = evictedItemIds
       \ Phase-3-bound` (with Phase 3 a no-op, every evicted id flows into
       Phase 4); the `Promise.allSettled` swallows individual `clearDrift`
       failures. This preserves the pre-B-163 cold-start availability
       contract: Phase 1+2 results are always committed regardless of
       drift-partition health. */
    let driftRecords = {};
    try {
      driftRecords = await getDriftRecords();
    } catch (err) {
      console.warn(
        '[tab-junkie] reconcileClaims: drift partition read failed, skipping Phase 3 (graceful degradation per B-132 precedent)',
        err?.code || err?.message || err,
      );
      // driftRecords stays {} — Phase 3 becomes no-op for all evicted items
    }
    /* Iterate in sortOrder so the AC3 hijack-collision (two items drifted
       to the same URL, one live tab) resolves deterministically — same
       precedence as Phase 2's first-unclaimed-wins loop. */
    const unboundSet = new Set(stillUnbound);
    const driftSorted = items
      .filter((it) => unboundSet.has(it.id))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    /* TEMP DEBUG */
    _dbg.phase3 = {
      driftRecordsKeys: Object.keys(driftRecords),
      driftSortedCount: driftSorted.length,
      iterations: [],
    };

    for (const item of driftSorted) {
      const record = driftRecords[item.id];
      const _itDbg = (item.url && item.url.toLowerCase().includes('music.youtube')) ? {
        itemId: item.id,
        itemUrl: item.url,
        hasRecord: !!record,
        driftedToUrl: record?.driftedToUrl,
        normalizedDrift: record ? safeNormalizeForMatch(record.driftedToUrl) : null,
        availableLen: 0,
        availableTabIds: [],
        inheritedHits: 0,
        finalClaimedTabId: null,
      } : null;
      if (!record) {
        if (_itDbg) { _itDbg.skip = 'no-record'; _dbg.phase3.iterations.push(_itDbg); }
        continue;
      }
      /* AC7 RESOLVED — NO TTL: record.detectedAt is intentionally NOT
         consulted here. Stale drift records remain eligible for fallback
         re-binding; the AC2 primary-URL-wins + AC3 one-tab-per-record cap
         + the four existing clearDrift surfaces (delete/update/navigate-
         away/onRemoved) are the hijack mitigation chain documented in
         §70.6.7. Do not add a `Date.now() - record.detectedAt > TTL_MS`
         gate here without first re-opening the AC7 product-owner decision. */
      const normalized = safeNormalizeForMatch(record.driftedToUrl);
      if (!normalized) {
        if (_itDbg) { _itDbg.skip = 'normalize-failed'; _dbg.phase3.iterations.push(_itDbg); }
        continue;
      }
      const available = urlToTabs.get(normalized);
      if (_itDbg) {
        _itDbg.availableLen = available?.length || 0;
        _itDbg.availableTabIds = available ? [...available] : [];
      }
      if (!available || available.length === 0) {
        if (_itDbg) { _itDbg.skip = 'no-available-tabs'; _dbg.phase3.iterations.push(_itDbg); }
        continue;
      }
      /* AC5: inherited-tab skip — mirrors the Phase-2 while-loop at
         :198-206 exactly. Inherited candidates are popped without binding;
         the loop continues with the next candidate. If every candidate is
         inherited, the item stays unbound and Phase 4 will clear its drift. */
      let claimedTabId = null;
      while (available.length > 0) {
        const candidate = available[0];
        if (inheritedTabs.has(candidate)) {
          if (_itDbg) _itDbg.inheritedHits += 1;
          available.shift();
          continue;
        }
        claimedTabId = available.shift();
        break;
      }
      if (claimedTabId !== null) {
        reconciled[item.id] = claimedTabId;
        claimedTabIds.add(claimedTabId);
      }
      if (_itDbg) {
        _itDbg.finalClaimedTabId = claimedTabId;
        _dbg.phase3.iterations.push(_itDbg);
      }
    }
  }

  /* TEMP DEBUG — write before writeClaims so we capture state even if write fails */
  _dbg.final = {
    reconciledKeys: Object.keys(reconciled),
    ytmFinalClaim: _dbg.entry.ytmItem ? (reconciled[_dbg.entry.ytmItem.id] || null) : null,
    inheritedTabsSize: inheritedTabs.size,
    ytmTabInInherited: _dbg.entry.ytmTabFromIndex ? inheritedTabs.has(_dbg.entry.ytmTabFromIndex.tabId) : null,
  };
  try {
    await chrome.storage.local.set({ _b163_debug: _dbg });
  } catch { /* ignore */ }

  claimsMirror = reconciled;
  await writeClaims();
  claimsReady = true;

  /* Phase 4 (B-163 §70.3.2): conditional drift drop. Replaces the
     pre-B-163 unconditional §53 paired-clear at this site. Only items
     that were BOTH (a) evicted in Phase 1 AND (b) not recovered by
     Phase 3 enter the unrecovered set — both URL candidates failed, the
     drift record is truly orphaned, and dropping it preserves the §10.7
     invariant ("drift records only exist for claimed items").
     `clearDrift` is a no-op when no record exists (drift.js:90-94
     short-circuits). Best-effort via Promise.allSettled — same semantic
     B-110 §53 established; any individual failure does not block
     reconcile completion; the next cold-start cycle will retry. */
  const unrecovered = evictedItemIds.filter((id) => !(id in reconciled));
  if (unrecovered.length > 0) {
    await Promise.allSettled(unrecovered.map((itemId) => clearDrift(itemId)));
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
 * B-159 §A (S43 close, 2026-05-03) — `favIconUrl` falls back to the
 * persisted `item.favIconUrl` when the live tab entry has no favicon
 * (covers both (a) item not currently claimed → `tabEntry === undefined`
 * and (b) claimed but Chrome hasn't surfaced the favicon yet). The render
 * path (sidepanel.js buildItemRow) layers the Chrome `_favicon` API on
 * top as a third fallback before letter-avatar.
 *
 * @param {Array<{id: string, favIconUrl?: string|null}>} items
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
      states[item.id] = { live: false, active: false, audible: false, favIconUrl: item.favIconUrl || null };
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
          /* B-159 §A: live tab favicon wins when present; otherwise fall
             back to the persisted Item.favIconUrl. */
          favIconUrl: tabEntry.favIconUrl || item.favIconUrl || null,
          tabId,
          /* B-014: surface the claim's current windowId so the sidepanel can
             render the cross-window badge on saved-item rows (AC7) without a
             second round-trip. Ephemeral — never persisted. */
          windowId: tabEntry.windowId,
        };
        continue;
      }
    }
    states[item.id] = { live: false, active: false, audible: false, favIconUrl: item.favIconUrl || null };
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

/**
 * B-164 §69.3.1 — synchronous tabId remap on `chrome.tabs.onReplaced`.
 *
 * Chrome rotates `tabId` whenever it discards/restores a tab (and during
 * prerendering). The probe Test A (`docs/findings/sprint-45.md`) confirmed
 * `chrome.tabs.onReplaced(addedTabId, removedTabId)` fires synchronously at
 * the moment of discard; the old id is a permanent dead handle. Without
 * remap, `claimsMirror[itemId] === removedTabId` violates the
 * claim-mirror-authoritativeness invariant (§69.4) until cold-start.
 *
 * This helper performs the table-1 + table-2 swap:
 *   (1) `claimsMirror` — rewrite the (single) entry whose value equals
 *       `removedTabId` to `addedTabId`. The mirror is itemId-keyed; itemId
 *       is stable across the rotation (C-4 itemId-stability).
 *   (2) `inheritedTabs` Set — if `has(removedTabId)`, `add(addedTabId)`
 *       then `delete(removedTabId)`. Single synchronous tick; no transient
 *       window where both / neither ids are present.
 *
 * If neither table contained `removedTabId`, the helper is a no-op AND
 * skips the `writeClaims()` storage round-trip (see `dirty` flag).
 *
 * NOTE — tables 3, 4, 5 are remapped at the call site in
 * `tab-events.js` (table 3 is itemId-keyed → no remap needed per the R2
 * AC3 clarification; table 4 is local module state; table 5 is the
 * persisted `tj:floatingGroups[].liveTabId` field). Keeping this helper
 * scoped to the two `tab-claims.js`-private structures preserves
 * module encapsulation.
 *
 * @param {number} removedTabId — the dead handle (pre-discard id)
 * @param {number} addedTabId — the new id Chromium rotated to
 * @returns {Promise<void>}
 */
export async function remapTabIdInClaims(removedTabId, addedTabId) {
  if (typeof removedTabId !== 'number' || !Number.isFinite(removedTabId)) return;
  if (typeof addedTabId !== 'number' || !Number.isFinite(addedTabId)) return;
  if (removedTabId === addedTabId) return;

  let dirty = false;

  // Table 1 — claimsMirror: rewrite the entry pointing at removedTabId.
  // O(N over claimed items; typically <50). Only one entry can match
  // because claimsMirror values are unique by construction (a tabId is
  // claimed by at most one item; Phase 2's `claimedTabIds` Set + Phase 3's
  // `available.shift()` pop enforce this).
  for (const [itemId, claimedTabId] of Object.entries(claimsMirror)) {
    if (claimedTabId === removedTabId) {
      claimsMirror[itemId] = addedTabId;
      dirty = true;
    }
  }

  // Table 2 — inheritedTabs Set: swap membership atomically.
  if (inheritedTabs.has(removedTabId)) {
    inheritedTabs.add(addedTabId);
    inheritedTabs.delete(removedTabId);
    // Set membership is in-memory only; no `dirty` bump (inheritedTabs is
    // ephemeral per `tab-claims.js:24` — it does not back to storage.session).
  }

  if (dirty) {
    await writeClaims();
  }
}
