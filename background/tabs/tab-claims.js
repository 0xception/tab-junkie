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
import { readPartition } from '../storage/partitions.js';
import { writeTransaction } from '../storage/write-transaction.js';
import {
  PARTITION_ITEM_CLAIMS,
  ITEM_CLAIMS_SCHEMA_VERSION,
} from '../storage/shapes.js';

const SESSION_KEY = 'tj:tabClaims';

/* B-167 §73.4.2 — sessionMatches threshold (Q2 R2-DECISION = 0.5). When
   ≥50% of the durable-partition entries stamped with the partition's own
   sessionTag still resolve in the current liveTabIndex, we treat the
   browser session as continuing (extension-reload happy path) and trust
   the durable tabIds. Below threshold, we fall through to the existing
   Phase 1/2/3/4 inference pipeline as the backstop. */
const B167_SESSION_MATCH_THRESHOLD = 0.5;

/* B-167 §73.5 — module-level sessionTag held across the SW lifetime.
   Settled once per cold start by `ensureSessionTag` (called from
   `prePopulateClaimsFromDurable`). Stamped onto every W-1..W-5 PATCH so
   per-entry sessionTag is consistent with the partition-level sessionTag
   for the writes that landed during this SW lifetime. */
let _sessionTag = '';

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
  /* B-167 §73.5 — reset the module-level sessionTag so the next
     `prePopulateClaimsFromDurable` (or first write) re-derives it from
     the durable partition. Keeps test isolation: a stale tag from a
     prior test cannot leak into the next. */
  _sessionTag = '';
}

/**
 * Test hatch: read the current module-level sessionTag. Used by the
 * b167-* test suite to assert sessionTag derivation behavior.
 * @returns {string}
 */
export function __getSessionTagForTest() {
  return _sessionTag;
}

/**
 * Test hatch: force the module-level sessionTag to a specific value.
 * Used by the b167-* test suite (R4 CONV-1 regression-guard T16) to
 * reproduce the "module tag empty, partition tag present" divergence
 * window without exercising a real cold-start.
 * @param {string} tag
 */
export function __setSessionTagForTest(tag) {
  _sessionTag = typeof tag === 'string' ? tag : '';
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

// ---- B-167 durable claim identity ----------------------------------------

/**
 * B-167 §73.4.1 — pure predicate that decides whether the durable
 * partition's recorded sessionTag most-likely belongs to the CURRENT
 * browser session, based on how many of its stamped tabIds resolve in the
 * live tab index. The threshold defaults to B167_SESSION_MATCH_THRESHOLD
 * (0.5 per Q2 R2-DECISION). Exported for test introspection.
 *
 * @param {{schemaVersion: number, sessionTag: string, entries: Record<string, {tabId: number, claimedAt: number, sessionTag: string}>}|null|undefined} durable
 * @param {Map<number, {url: string, active: boolean, audible: boolean, favIconUrl?: string|null, windowId: number, index: number}>} liveTabIndex
 * @param {number} [threshold=B167_SESSION_MATCH_THRESHOLD]
 * @returns {boolean}
 */
export function sessionMatches(durable, liveTabIndex, threshold = B167_SESSION_MATCH_THRESHOLD) {
  if (!durable || !durable.entries) return false;
  if (typeof durable.sessionTag !== 'string' || durable.sessionTag.length === 0) return false;
  const entries = Object.values(durable.entries);
  if (entries.length === 0) return false;
  const sameSessionEntries = entries.filter((e) => e && e.sessionTag === durable.sessionTag);
  if (sameSessionEntries.length === 0) return false;
  const resolved = sameSessionEntries.filter((e) => liveTabIndex.has(e.tabId)).length;
  return (resolved / sameSessionEntries.length) >= threshold;
}

/**
 * B-167 §73.5 — settle the module-level `_sessionTag` exactly once per SW
 * cold start. If the durable partition's recorded sessionTag matches the
 * current session (sessionMatches → true), we adopt it; otherwise we mint
 * a fresh UUID via `crypto.randomUUID()` and stamp it onto the partition
 * (entries left untouched as stale hints — `sessionMatches` will reject
 * them on subsequent cold starts until they self-evict via W-2 deletes
 * or W-1 full-replace at end-of-Phase-4).
 *
 * Best-effort: a partition read failure logs warn and mints a fresh UUID;
 * a writeTransaction failure logs warn and proceeds with the in-memory
 * tag (durable persists are no-ops for this SW lifetime, self-healing on
 * the next cold start).
 *
 * @returns {Promise<string>}
 */
async function ensureSessionTag() {
  if (_sessionTag) return _sessionTag;
  let durable = null;
  try {
    durable = await readPartition(PARTITION_ITEM_CLAIMS);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 ensureSessionTag: durable partition read failed, minting fresh tag',
      err?.code || err?.message || err,
    );
  }
  if (durable && sessionMatches(durable, getLiveTabIndex())) {
    _sessionTag = durable.sessionTag;
    return _sessionTag;
  }
  // Fresh session tag. crypto.randomUUID() is SW-context-available in
  // Chromium 92+ / Edge 92+ (C-8 verified at R2 §73.3.2).
  _sessionTag = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `b167-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await writeTransaction([{
      partition: PARTITION_ITEM_CLAIMS,
      mutator: (cur) => ({
        schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
        sessionTag: _sessionTag,
        entries: (cur && cur.entries) ? cur.entries : {},
      }),
    }]);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 ensureSessionTag: stamping fresh sessionTag failed; durable persists become no-ops this SW lifetime',
      err?.code || err?.message || err,
    );
  }
  return _sessionTag;
}

/**
 * B-167 §73.4.3 — cold-start pre-population of `tj:tabClaims` (session
 * storage) from `tj:itemClaims` (durable local storage). Runs INSIDE
 * `initializeLiveState` AFTER `preMarkInheritedFromFloatingGroups` and
 * BEFORE `reconcileClaims`. When the durable partition's sessionTag
 * passes `sessionMatches`, we write each surviving (tabId-resolves)
 * entry to session storage so `reconcileClaims`'s `readClaims()` sees
 * them as Phase 1 input. Phase 1 validates each via `tabEntry && item`;
 * survivors stay claimed; failures flow through Phase 3 drift-URL
 * fallback exactly as the inference path would have.
 *
 * Graceful degradation (§73.8): three failure modes — missing partition,
 * corrupt partition, storage rejection — all log warn and return without
 * writing. The 4-phase inference pipeline then runs against the existing
 * session-storage state as the backstop. Mirrors the B-132 / B-163 R4
 * HIGH-1 precedent.
 *
 * Critical override from R1 AC3 literal: R1 AC3 said "pre-populate
 * claimsMirror[itemId] = entry.tabId before reconcile". That is
 * mechanically incorrect — `reconcileClaims` reads from `tj:tabClaims`
 * SESSION storage in Phase 1, not from in-memory `claimsMirror`. R2
 * §73.4.3 corrected the design: we write to session storage so Phase 1's
 * input is the union of durable-restored entries + any in-session writes
 * that survived the SW lifetime.
 *
 * @returns {Promise<void>}
 */
export async function prePopulateClaimsFromDurable() {
  // ensureSessionTag must run first so the partition has a stable
  // sessionTag for the rest of the SW lifetime. It may also write a
  // fresh tag onto the partition; that does not affect the read below
  // because we only trust entries whose own sessionTag matches the
  // durable.sessionTag at this read time.
  let durable;
  try {
    durable = await readPartition(PARTITION_ITEM_CLAIMS);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 prePopulateClaimsFromDurable: durable partition read failed, falling back to inference',
      err?.code || err?.message || err,
    );
    // Still settle a sessionTag for the SW lifetime so W-1..W-5 writes
    // have a non-empty tag to stamp; ensureSessionTag will mint a fresh
    // UUID since the partition read failed.
    try { await ensureSessionTag(); } catch { /* best-effort */ }
    return;
  }
  const liveTabIndex = getLiveTabIndex();
  if (!sessionMatches(durable, liveTabIndex)) {
    // Mint or adopt a sessionTag without trusting the stale entries.
    try { await ensureSessionTag(); } catch { /* best-effort */ }
    return;
  }
  // Session matches — adopt the durable sessionTag for this SW lifetime.
  _sessionTag = durable.sessionTag;
  const restored = {};
  for (const [itemId, entry] of Object.entries(durable.entries)) {
    if (!entry || typeof entry !== 'object') continue;
    // skip cross-session bleed: only entries stamped with THIS partition's tag
    if (entry.sessionTag !== durable.sessionTag) continue;
    // skip stale tabIds — entry's tabId no longer resolves in liveTabIndex
    if (!liveTabIndex.has(entry.tabId)) continue;
    restored[itemId] = entry.tabId;
  }
  if (Object.keys(restored).length === 0) return;
  /* Write to chrome.storage.session so reconcileClaims's readClaims()
     sees the restored bindings as its Phase 1 input. The in-memory
     claimsMirror stays empty until reconcileClaims completes — it is
     NOT a parallel source of truth. */
  try {
    await chrome.storage.session.set({ [SESSION_KEY]: restored });
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 prePopulateClaimsFromDurable: session.set failed; reconcile falls back to inference',
      err?.code || err?.message || err,
    );
  }
}

/**
 * B-167 §73.5 W-1 — replace the durable partition's `entries` map with
 * the post-reconcile `claimsMirror`. Stamps the current `_sessionTag` on
 * every entry. Preserves existing `claimedAt` when an entry survives;
 * stamps `Date.now()` on newly-bound entries. Called from
 * `reconcileClaims` end-of-Phase-4 as a passive mirror of the
 * authoritative session-storage write.
 *
 * Best-effort: a writeTransaction failure logs warn and does not block
 * reconcile completion (self-healing on next cold start). Mirrors the
 * W-2..W-5 sites.
 *
 * @returns {Promise<void>}
 */
async function durableMirrorFullReplace() {
  try {
    await writeTransaction([{
      partition: PARTITION_ITEM_CLAIMS,
      mutator: (cur) => {
        const tag = _sessionTag || (cur && cur.sessionTag) || '';
        const prevEntries = (cur && cur.entries) ? cur.entries : {};
        const now = Date.now();
        const entries = {};
        for (const [itemId, tabId] of Object.entries(claimsMirror)) {
          const prev = prevEntries[itemId];
          entries[itemId] = {
            tabId,
            claimedAt: (prev && typeof prev.claimedAt === 'number') ? prev.claimedAt : now,
            sessionTag: tag,
          };
        }
        return {
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: tag,
          entries,
        };
      },
    }]);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 W-1 durable mirror full-replace failed (self-heals on next cold start)',
      err?.code || err?.message || err,
    );
  }
}

/**
 * B-167 §73.5 W-2/W-3/W-4 — durable PATCH helpers. Upsert and delete
 * forms; both route through `writeTransaction` for atomic
 * single-partition writes. Per-entry sessionTag mirrors the
 * partition-level `_sessionTag`.
 */
async function durableUpsertEntry(itemId, tabId) {
  if (!_sessionTag) {
    // Best-effort: ensure a sessionTag exists before stamping. If
    // settlement fails we still attempt the write below; mutator picks
    // up whatever tag the partition already carries.
    try { await ensureSessionTag(); } catch { /* best-effort */ }
  }
  /* R4 CONV-1 qa M-1: under triple-failure path (no module tag, no partition
     tag), abort rather than write a silent empty-tag durable record that
     would never be trusted on next cold start (sessionMatches rejects
     `sessionTag === ''`). Fail fast; self-heal on the next ensureSessionTag
     retry. durableDeleteEntry / durableRemapEntry are exempt from this
     guard — deletes/remaps don't introduce new entries, so a missing tag
     cannot pollute the partition. */
  if (!_sessionTag) return;
  try {
    await writeTransaction([{
      partition: PARTITION_ITEM_CLAIMS,
      mutator: (cur) => {
        /* R4 CONV-1: resolve `tag` ONCE at the top, then use the SAME
           value for both the partition-level `sessionTag` field AND the
           per-entry `sessionTag` stamp. Previous asymmetry (per-entry
           used `_sessionTag`, partition-level preferred `cur.sessionTag`)
           created a divergence window during `ensureSessionTag` write-
           failure. Unified pattern mirrors durableMirrorFullReplace. */
        const tag = _sessionTag || (cur && cur.sessionTag) || '';
        const prevEntries = (cur && cur.entries) ? cur.entries : {};
        const prev = prevEntries[itemId];
        const entry = {
          tabId,
          claimedAt: (prev && typeof prev.claimedAt === 'number') ? prev.claimedAt : Date.now(),
          sessionTag: tag,
        };
        return {
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: tag,
          entries: { ...prevEntries, [itemId]: entry },
        };
      },
    }]);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 durable upsert failed (self-heals on next cold start)',
      err?.code || err?.message || err,
    );
  }
}

async function durableDeleteEntry(itemId) {
  try {
    await writeTransaction([{
      partition: PARTITION_ITEM_CLAIMS,
      mutator: (cur) => {
        /* R4 CONV-1: unified `tag` resolution — same value for
           partition-level field across the no-op + delete branches. */
        const tag = _sessionTag || (cur && cur.sessionTag) || '';
        const prevEntries = (cur && cur.entries) ? cur.entries : {};
        if (!(itemId in prevEntries)) return cur || {
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: tag,
          entries: {},
        };
        const { [itemId]: _drop, ...rest } = prevEntries;
        return {
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: tag,
          entries: rest,
        };
      },
    }]);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 durable delete failed (self-heals on next cold start)',
      err?.code || err?.message || err,
    );
  }
}

/**
 * B-167 §73.5 W-5 — field-patch helper for `remapTabIdInClaims`. Updates
 * `entries[itemId].tabId` while PRESERVING `claimedAt` + per-entry
 * `sessionTag`. No-op if the durable entry is missing.
 */
async function durableRemapEntry(itemId, newTabId) {
  try {
    await writeTransaction([{
      partition: PARTITION_ITEM_CLAIMS,
      mutator: (cur) => {
        /* R4 CONV-1: unified `tag` resolution — preserves existing
           per-entry sessionTag on the remapped record (only `tabId`
           changes); partition-level uses the same `tag`. */
        const tag = _sessionTag || (cur && cur.sessionTag) || '';
        const prevEntries = (cur && cur.entries) ? cur.entries : {};
        const existing = prevEntries[itemId];
        if (!existing) return cur || {
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: tag,
          entries: {},
        };
        return {
          schemaVersion: ITEM_CLAIMS_SCHEMA_VERSION,
          sessionTag: tag,
          entries: {
            ...prevEntries,
            [itemId]: { ...existing, tabId: newTabId },
          },
        };
      },
    }]);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 W-5 durable remap failed (self-heals on next cold start)',
      err?.code || err?.message || err,
    );
  }
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
  // M5: warn if items is empty but stored claims exist
  const storedClaims = await readClaims();
  if (items.length === 0 && Object.keys(storedClaims).length > 0) {
    console.warn('[tab-junkie] reconcileClaims called with 0 items but', Object.keys(storedClaims).length, 'stored claims exist — proceeding anyway');
  }
  const index = getLiveTabIndex();
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
    for (const item of driftSorted) {
      const record = driftRecords[item.id];
      if (!record) continue;
      /* AC7 RESOLVED — NO TTL: record.detectedAt is intentionally NOT
         consulted here. Stale drift records remain eligible for fallback
         re-binding; the AC2 primary-URL-wins + AC3 one-tab-per-record cap
         + the four existing clearDrift surfaces (delete/update/navigate-
         away/onRemoved) are the hijack mitigation chain documented in
         §70.6.7. Do not add a `Date.now() - record.detectedAt > TTL_MS`
         gate here without first re-opening the AC7 product-owner decision. */
      const normalized = safeNormalizeForMatch(record.driftedToUrl);
      if (!normalized) continue;
      const available = urlToTabs.get(normalized);
      if (!available || available.length === 0) continue;
      /* AC5: inherited-tab skip — mirrors the Phase-2 while-loop at
         :198-206 exactly. Inherited candidates are popped without binding;
         the loop continues with the next candidate. If every candidate is
         inherited, the item stays unbound and Phase 4 will clear its drift. */
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

  claimsMirror = reconciled;
  await writeClaims();
  claimsReady = true;

  /* B-167 W-1 §73.5 — durable mirror full-replace. Stamps every claim
     in the reconciled set with the current sessionTag and persists the
     map to `tj:itemClaims` so the next cold start can short-circuit
     URL inference via the durable direct-match path. Best-effort:
     failures log warn and do not block reconcile completion. */
  await ensureSessionTag().catch(() => { /* best-effort */ });
  await durableMirrorFullReplace();

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
      /* B-167 W-2 §73.5 — best-effort sequential durable delete.
         Q3 R2-DECISION: preserves the existing partial-atomicity
         contract at storage-handlers.js:454-457. A crash between
         writeClaims and this write self-heals on the next cold start
         via reconcileClaims's `tabEntry && item` Phase 1 check
         (deleted items evict, then W-1 full-replace overwrites). */
      await durableDeleteEntry(itemId);
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
    /* B-167 W-3 §73.5 — durable upsert for the new-claim branch in
       reevaluateTab. Stamps the current sessionTag and persists the
       new (itemId → tabId) binding so the next cold start can trust
       it. Best-effort; failure self-heals on next cold start. */
    const newlyClaimedItemId = Object.entries(claimsMirror).find(
      ([, tid]) => tid === tabId,
    )?.[0];
    if (newlyClaimedItemId) {
      await durableUpsertEntry(newlyClaimedItemId, tabId);
    }
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
  /* B-167 W-4 §73.5 — durable upsert from floating-group promote /
     re-association path. Stamps the current sessionTag and persists the
     binding so the next cold start can trust it. Best-effort; failure
     self-heals on the next cold-start reconcile. */
  await durableUpsertEntry(itemId, tabId);
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
  /* B-167 W-5 §73.5 — capture the itemId that owned the removedTabId so
     we can patch the durable partition's entry in lock-step with the
     in-memory mirror swap. claimsMirror values are unique by
     construction (a tabId is claimed by at most one item), so at most
     one itemId is captured. */
  let remappedItemId = null;

  // Table 1 — claimsMirror: rewrite the entry pointing at removedTabId.
  // O(N over claimed items; typically <50). Only one entry can match
  // because claimsMirror values are unique by construction (a tabId is
  // claimed by at most one item; Phase 2's `claimedTabIds` Set + Phase 3's
  // `available.shift()` pop enforce this).
  for (const [itemId, claimedTabId] of Object.entries(claimsMirror)) {
    if (claimedTabId === removedTabId) {
      claimsMirror[itemId] = addedTabId;
      dirty = true;
      remappedItemId = itemId;
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
    /* B-167 W-5 §73.5 — 6th table extending the B-164 §69.3.1 5-table
       remap: `tj:itemClaims.entries[itemId].tabId`. Preserves claimedAt
       + sessionTag; only the tabId field changes. Best-effort; failure
       self-heals on the next cold-start reconcile. */
    if (remappedItemId !== null) {
      await durableRemapEntry(remappedItemId, addedTabId);
    }
  }
}
