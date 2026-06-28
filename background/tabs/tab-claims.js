/**
 * TabClaims — item-to-tab disambiguation table.
 *
 * B-179 §75 (S47) collapsed bookmark↔tab identity to ONE authoritative
 * persisted store: the durable `tj:itemClaims` partition (chrome.storage.local)
 * is now the SOLE persisted claim store. The legacy session store
 * (`tj:tabClaims`) is RETIRED — a one-cold-start compat shim folds any
 * surviving legacy session value into durable, then removes the key for good.
 * The in-memory `claimsMirror` stays the synchronous read-hot surface for
 * `buildLiveStates` AND is the snapshot input to `reconcileClaims` Phase 1.
 *
 * Shape: Record<string, number> — itemId to tabId (the in-memory mirror).
 * Durable entries carry `{tabId, claimedAt, sessionTag}` per `tj:itemClaims`.
 */

import { getLiveTabIndex } from './live-tab-index.js';
import { safeNormalizeForMatch } from '../../shared/url.js';
import { buildUnclaimedUrlIndex, takeUnclaimedTabForUrl } from './tab-item-resolver.js';
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
   `hydrateClaimsMirrorFromDurable`). Stamped onto every W-1..W-5 PATCH so
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
     `hydrateClaimsMirrorFromDurable` (or first write) re-derives it from
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
 * Test hatch: seed the in-memory `claimsMirror` directly. B-179 §75.9.1
 * class B — post-cutover the mirror (not session storage) is reconcile's
 * Phase-1 input, so tests that previously drove Phase 1 by seeding
 * `tj:tabClaims` session now seed the mirror here. Clones the input so the
 * caller's object cannot alias the module state. Only used by test suites.
 * @param {Record<string, number>} mirror
 */
export function __setClaimsMirror(mirror) {
  claimsMirror = (mirror && typeof mirror === 'object') ? { ...mirror } : {};
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
 * B-179 §75.4.2 — cold-start hydration of the in-memory `claimsMirror`
 * DIRECTLY from the durable `tj:itemClaims` partition. Runs INSIDE
 * `initializeLiveState` AFTER `preMarkInheritedFromFloatingGroups` and
 * BEFORE `reconcileClaims`, whose Phase-1 input is now a snapshot of this
 * mirror (no session round-trip).
 *
 * Steady-state path: when the durable partition's sessionTag passes
 * `sessionMatches`, adopt it and seed `claimsMirror` with every entry whose
 * tabId still resolves in the live index. Phase 1 then validates each via
 * `tabEntry && item`; survivors stay claimed, failures flow through the
 * Phase 3 drift-URL fallback exactly as the inference path would have.
 *
 * One-cold-start compat shim (§75.4.3): the PRIOR (pre-B-179) build persisted
 * claims to `tj:tabClaims` (session) ONLY. On the first cold start after the
 * update, if the durable partition is untrusted BUT a legacy session value
 * survives (SW-restart-within-session at the upgrade boundary), fold it into
 * the mirror, W-1-stamp durable so the NEXT reload hits the trusted fast path,
 * then remove the session key for good. The key is absent on every subsequent
 * cold start, so the shim is bounded to exactly one.
 *
 * Graceful degradation (§73.8): a durable read failure logs warn, settles a
 * fresh sessionTag, and returns — the 4-phase inference pipeline is the
 * backstop. Mirrors the B-132 / B-163 R4 HIGH-1 precedent.
 *
 * @returns {Promise<void>}
 */
export async function hydrateClaimsMirrorFromDurable() {
  let durable;
  try {
    durable = await readPartition(PARTITION_ITEM_CLAIMS);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-179 hydrateClaimsMirrorFromDurable: durable partition read failed, falling back to inference',
      err?.code || err?.message || err,
    );
    // Still settle a sessionTag for the SW lifetime so W-1..W-5 writes
    // have a non-empty tag to stamp; ensureSessionTag mints a fresh UUID
    // since the partition read failed.
    try { await ensureSessionTag(); } catch { /* best-effort */ }
    return;
  }
  const liveTabIndex = getLiveTabIndex();

  // Steady-state fast path: the durable sessionTag belongs to the current
  // browser session — seed the mirror DIRECTLY from durable (no session write).
  if (sessionMatches(durable, liveTabIndex)) {
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
    claimsMirror = restored;
    return;
  }

  // Durable untrusted — run the one-cold-start session→durable compat shim.
  if (await foldLegacySessionClaims()) return;

  // Steady state with neither a trusted durable nor a legacy session value:
  // settle a sessionTag and leave the mirror empty; reconcile inference is
  // the backstop.
  try { await ensureSessionTag(); } catch { /* best-effort */ }
}

/**
 * B-179 §75.4.3 — the one-cold-start `tj:tabClaims` (session) → durable
 * compat shim. Reads the legacy session value EXACTLY ONCE; if it carries
 * claims, fold them into `claimsMirror` (the live authority for this SW
 * lifetime), settle a sessionTag, W-1-stamp durable from the folded set so
 * the NEXT reload hits the trusted fast path, then remove the session key
 * for good. Returns true when the shim recovered claims, false otherwise.
 *
 * Bounded to one cold start: after the `remove`, the key is absent forever,
 * so every subsequent cold start reads empty here and the shim is skipped.
 * This `get`/`remove` pair is the ONLY surviving `chrome.storage.session`
 * access for claims post-cutover — the durable partition is the sole
 * persisted store.
 *
 * @returns {Promise<boolean>}
 */
async function foldLegacySessionClaims() {
  let legacy = {};
  try {
    const res = await chrome.storage.session.get(SESSION_KEY);
    legacy = (res && res[SESSION_KEY]) || {};
  } catch (err) {
    console.warn(
      '[tab-junkie] B-179 compat shim: legacy session read failed; proceeding with inference',
      err?.code || err?.message || err,
    );
    return false;
  }
  const folded = {};
  for (const [itemId, tabId] of Object.entries(legacy)) {
    if (typeof itemId !== 'string' || itemId.length === 0) continue;
    if (typeof tabId !== 'number' || !Number.isFinite(tabId)) continue;
    folded[itemId] = tabId;
  }
  if (Object.keys(folded).length === 0) return false;
  // Fold into the mirror — the live read-hot authority for this SW lifetime.
  claimsMirror = folded;
  // Settle a sessionTag and W-1-stamp durable from the folded set so the
  // NEXT cold start trusts durable (sessionMatches fast path).
  await ensureSessionTag().catch(() => { /* best-effort */ });
  /* FIX-1b (B-179 R4 security MEDIUM): write durable BEFORE removing the
     legacy session key, and only remove the key once the durable persist is
     CONFIRMED. `durableMirrorFullReplace` now returns false on an empty
     sessionTag OR a writeTransaction failure (quota / storage rejection). If
     the persist did not land, RETAIN the session key so the next cold start
     re-runs this fold — a crash/failure must never strand claims in NEITHER
     store. This is the same tolerance the remove-failure branch below models.
     The folded claims still live in `claimsMirror` for this SW lifetime, so we
     return true (the shim DID recover claims) regardless of the persist
     outcome; reconcile's own W-1 write also retries the durable persist. */
  const persisted = await durableMirrorFullReplace();
  if (!persisted) {
    console.warn(
      '[tab-junkie] B-179 compat shim: durable persist not confirmed; retaining legacy session key to retry on next cold start',
    );
    return true;
  }
  // Durable confirmed — retire the legacy session key for good (bounds the
  // shim to ONE cold start).
  try {
    await chrome.storage.session.remove(SESSION_KEY);
  } catch (err) {
    console.warn(
      '[tab-junkie] B-179 compat shim: legacy session remove failed; will retry next cold start',
      err?.code || err?.message || err,
    );
  }
  return true;
}

/**
 * B-167 §73.5 W-1 — replace the durable partition's `entries` map with
 * the post-reconcile `claimsMirror`. Stamps the current `_sessionTag` on
 * every entry. Preserves existing `claimedAt` when an entry survives;
 * stamps `Date.now()` on newly-bound entries. Called from
 * `reconcileClaims` after Phase 3 (before Phase 4) as the SOLE persisted
 * claim write (B-179 retired the session store).
 *
 * B-179 R4 (security MEDIUM, FIX-1a): returns a success signal so the
 * one-cold-start compat shim (`foldLegacySessionClaims`) can gate
 * legacy-session-key removal on a CONFIRMED durable persist. Returns false
 * WITHOUT writing when `_sessionTag` is empty (an empty-tag record is never
 * trusted on the next cold start — `sessionMatches` rejects `sessionTag === ''`;
 * mirrors the `durableUpsertEntry` empty-tag guard); returns false when the
 * writeTransaction throws (quota / storage rejection); returns true only when
 * the durable write lands.
 *
 * Best-effort at the W-1 reconcile call site: that caller ignores the
 * return — a failure self-heals on the next cold start, mirroring W-2..W-5.
 *
 * @returns {Promise<boolean>} true iff a trusted durable copy now exists
 */
async function durableMirrorFullReplace() {
  /* FIX-1a (B-179 R4 security MEDIUM): refuse to write an empty-tag durable
     record. A record stamped with `sessionTag === ''` would never be trusted
     on the next cold start, so writing it is useless — and, because the compat
     shim now gates session-key removal on this return, returning false here is
     what keeps claims from being stranded in NEITHER store. */
  if (!_sessionTag) return false;
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
    return true;
  } catch (err) {
    console.warn(
      '[tab-junkie] B-167 W-1 durable mirror full-replace failed (self-heals on next cold start)',
      err?.code || err?.message || err,
    );
    return false;
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
 * Phase 1 (B-149 / B-110 §53 / B-163 §70.3.2) — validate existing
 * session-storage claims. Keep a claim iff the tab is still in the
 * LiveTabIndex AND the saved item still exists.
 *
 * B-149 (Sprint 41 polish): the survival predicate intentionally does NOT
 * re-check URL match. The B-099 D-1 contract (see reevaluateTab docstring
 * below) makes the bookmark↔tab association survive URL drift at runtime;
 * the cold-start path must enforce the SAME contract or a service-worker
 * idle-shutdown (~30s MV3 idle window) silently re-evicts every drifted-
 * but-live claim the next time reconcileClaims runs. Drift state is owned by
 * detectDriftForTab and is independent of claim survival — it is re-detected
 * on the next URL-change event. The earlier test
 * `tests/b110-drift-non-live-fix.test.js:242-261` (T5) historically pinned
 * the buggy URL-match eviction as desired behavior; that test was inverted as
 * part of the B-149 fix. The legitimate eviction case (tab missing from
 * LiveTabIndex OR saved item missing) is preserved by the `tabEntry && item`
 * predicate and is still covered by T4 + T6. See
 * `docs/findings/post-s41-pre-merge-triage.md` § "B-149 R0 Spike".
 *
 * `evictedItemIds` tracks every claim that does NOT survive validation. It
 * drives Phase 4 (conditional drift drop on the post-Phase-3 unrecovered
 * subset). The §10.7 invariant ("drift records only exist for claimed items")
 * is asserted at the END of reconcile, not mid-pipeline.
 *
 * @param {Record<string, number>} storedClaims
 * @param {Map<number, object>} index — the LiveTabIndex
 * @param {Array<{id: string}>} items
 * @returns {{reconciled: Record<string, number>, claimedTabIds: Set<number>, evictedItemIds: string[]}}
 *   `reconciled` + `claimedTabIds` seed Phases 2/3; `evictedItemIds` feeds Phase 4.
 */
function _phase1ValidateClaims(storedClaims, index, items) {
  const reconciled = {};
  const claimedTabIds = new Set();
  const evictedItemIds = [];
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
  return { reconciled, claimedTabIds, evictedItemIds };
}

/**
 * Phase 2 (B-175 §74 A1 / B-132 §65.5) — auto-claim unclaimed items to
 * unclaimed tabs by primary `item.url`, first-unclaimed-wins in ascending
 * sortOrder.
 *
 * Consumes (and mutates) the shared `urlToTabs` index built ONCE by the
 * caller via `buildUnclaimedUrlIndex`. `takeUnclaimedTabForUrl` shifts the
 * winning candidate off its bucket, so a tab taken here is unavailable to
 * Phase 3 — the single-winner-per-tab invariant. Opener-chain-inherited tabs
 * (the module-level `inheritedTabs` Set, populated at cold-start by
 * preMarkInheritedFromFloatingGroups and at runtime by appendFloatingGroup
 * per §59.3) are skipped inside `takeUnclaimedTabForUrl`, mirroring the B-125
 * reevaluateTab gate so a tab "spoken for" by a parent floating group is
 * never auto-claimed.
 *
 * Mutates `reconciled`, `claimedTabIds`, and `urlToTabs` in place.
 *
 * @param {Array<{id: string, url: string, sortOrder: number}>} items
 * @param {Record<string, number>} reconciled
 * @param {Set<number>} claimedTabIds
 * @param {Map<string, number[]>} urlToTabs
 * @returns {void}
 */
function _phase2AutoClaimByUrl(items, reconciled, claimedTabIds, urlToTabs) {
  // Sort items by sortOrder ascending for first-unclaimed-wins
  const sorted = items
    .filter((it) => !(it.id in reconciled))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const item of sorted) {
    const normalized = safeNormalizeForMatch(item.url);
    if (!normalized) continue;
    const claimedTabId = takeUnclaimedTabForUrl(urlToTabs, normalized, inheritedTabs);
    if (claimedTabId !== null) {
      reconciled[item.id] = claimedTabId;
      claimedTabIds.add(claimedTabId);
    }
  }
}

/**
 * Phase 3 (B-163 §70.3.1) — drift-URL fallback. For ANY item still unbound
 * after Phase 2 — regardless of whether it had a prior claim in the mirror
 * snapshot — consult its drift record and attempt to bind via `driftedToUrl`
 * against the SAME `urlToTabs` map Phase 2 already consumed.
 *
 * B-163 R4 round-2 fix (S45 post-UAT): this iterates over ALL still-unbound
 * items, NOT `evictedItemIds`. The original R3 implementation restricted the
 * set to `evictedItemIds.filter(id => !(id in reconciled))`, which silently
 * broke the user-story symptom whenever the prior-claims snapshot is empty
 * (extension reload with no trusted durable, browser restart, fresh SW):
 * `storedClaims = {}` → Phase 1 has nothing to iterate → `evictedItemIds = []`
 * → Phase 3 skipped entirely. Drifted items had no path to re-association
 * (despite the durable `tj:drift` record). The fix matches the R1 LOCKED
 * contract wording verbatim: "for each item still unbound after Phase-2".
 * Phase 2 still wins primary-URL precedence (AC2); Phase 4 stays scoped to
 * `evictedItemIds` only (preserves the §10.7 invariant for items that never
 * had a prior-claims-snapshot claim — their drift records are managed by the
 * runtime detectDriftForTab cycle, not by cold-start cleanup). T10 is the
 * regression guard.
 *
 * The whole phase is gated behind `stillUnbound.length > 0` (the typical
 * full-recovery case) so the `getDriftRecords()` storage read is skipped when
 * nothing remains unbound.
 *
 * B-163 R4 HIGH-1 (S45): graceful degradation on drift-partition read
 * failure. `getDriftRecords()` calls `readPartition(PARTITION_DRIFT)` which
 * throws `StorageError(ERR_CORRUPT_DATA)` if any drift record fails
 * `assertShape` OR if `chrome.storage.local.get` rejects. Without the
 * try/catch the rejection would propagate out of reconcileClaims BEFORE
 * `claimsMirror` is committed + `claimsReady = true`, leaving every saved item
 * appearing offline until browser restart — silent DoS. Mirror the B-132 graceful-
 * degradation pattern at `background/tabs/index.js:60-64`: log a console.warn
 * and continue with `driftRecords = {}` so Phase 3 becomes a no-op for all
 * evicted items. Phase 1+2 results are always committed regardless of
 * drift-partition health.
 *
 * Mutates `reconciled`, `claimedTabIds`, and `urlToTabs` in place.
 *
 * @param {Array<{id: string, url: string, sortOrder: number}>} items
 * @param {Record<string, number>} reconciled
 * @param {Set<number>} claimedTabIds
 * @param {Map<string, number[]>} urlToTabs
 * @returns {Promise<void>}
 */
async function _phase3DriftFallback(items, reconciled, claimedTabIds, urlToTabs) {
  const stillUnbound = items
    .filter((it) => !(it.id in reconciled))
    .map((it) => it.id);
  if (stillUnbound.length === 0) return;

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
    /* AC5: inherited-tab skip — takeUnclaimedTabForUrl applies the SAME
       inherited-skip + single-winner pop as Phase 2 against the SAME
       (already partially consumed) urlToTabs map. If every candidate is
       inherited (or the bucket is empty), the item stays unbound and
       Phase 4 will clear its drift. */
    const claimedTabId = takeUnclaimedTabForUrl(urlToTabs, normalized, inheritedTabs);
    if (claimedTabId !== null) {
      reconciled[item.id] = claimedTabId;
      claimedTabIds.add(claimedTabId);
    }
  }
}

/**
 * Phase 4 (B-163 §70.3.2) — conditional drift drop. Replaces the pre-B-163
 * unconditional §53 paired-clear. Only items that were BOTH (a) evicted in
 * Phase 1 AND (b) not recovered by Phase 2 OR Phase 3 enter the unrecovered
 * set — the filter is `evictedItemIds.filter(id => !(id in reconciled))`, and
 * `reconciled` accumulates BOTH the Phase 2 primary-URL rebinds AND the Phase 3
 * drift-URL rebinds, so an evicted item re-claimed by Phase 2's primary-URL
 * match is (correctly) excluded from the drop. For the items that remain, both
 * URL candidates failed, the drift record is truly orphaned, and dropping it
 * preserves the §10.7 invariant ("drift records only exist for claimed
 * items"). `clearDrift` is a no-op when no record exists (drift.js:90-94
 * short-circuits). Best-effort via Promise.allSettled — same semantic B-110
 * §53 established; any individual failure does not block reconcile
 * completion; the next cold-start cycle will retry.
 *
 * @param {string[]} evictedItemIds
 * @param {Record<string, number>} reconciled
 * @returns {Promise<void>}
 */
async function _phase4ConditionalDriftDrop(evictedItemIds, reconciled) {
  const unrecovered = evictedItemIds.filter((id) => !(id in reconciled));
  if (unrecovered.length > 0) {
    await Promise.allSettled(unrecovered.map((itemId) => clearDrift(itemId)));
  }
}

/**
 * Reconcile claims against the current LiveTabIndex and items list.
 *
 * Four-phase pipeline (B-163 extended the legacy two-phase pipeline with
 * Phase 3 + Phase 4 to enable drift-URL fallback re-binding before drift
 * records are dropped; see `docs/design/70-b-163-drift-fallback-reconcile.md`).
 * B-178 (A4) decomposed the former monolith into named phase helpers so each
 * phase + its owning ticket is individually legible; this orchestrator threads
 * the shared accumulators (`reconciled`, `claimedTabIds`, `urlToTabs`,
 * `evictedItemIds`) explicitly between them:
 *
 *   Phase 1 (`_phase1ValidateClaims`, B-149)       — validate existing claims;
 *             URL match intentionally NOT re-checked.
 *   Phase 2 (`_phase2AutoClaimByUrl`, B-175/B-132) — auto-claim by primary
 *             item.url, first-unclaimed-wins in ascending sortOrder; inherited
 *             tabs skipped.
 *   Phase 3 (`_phase3DriftFallback`, B-163)        — drift-URL fallback over
 *             ALL still-unbound items against the SAME urlToTabs map; graceful
 *             degradation on drift-read failure.
 *   Phase 4 (`_phase4ConditionalDriftDrop`, B-163) — clear drift only for
 *             still-unrecovered evicted items.
 *
 * Durable cold-start restore (B-179 `hydrateClaimsMirrorFromDurable`) is the
 * EXPLICIT pre-Phase-1 step: it runs EARLIER, from `initializeLiveState`
 * (background/tabs/index.js, after preMarkInheritedFromFloatingGroups and
 * before this function), seeding the in-memory `claimsMirror` DIRECTLY from
 * the durable partition. Phase-1 input is now a SNAPSHOT of that mirror
 * (`{ ...claimsMirror }`) — the full prior-claims set, NOT a narrowed subset
 * (B-179 §75.10 Risk-1 / the B-163 narrowing class). The durable full-replace
 * (B-167 W-1) written HERE at end-of-Phase-3, once `claimsMirror` is
 * authoritative, is the SOLE persisted write — the session store is retired.
 *
 * Snapshotting at entry preserves the B-164 M-2 race-guard semantics: the
 * snapshot is the pre-reconcile state; an interleaved `onReplaced` mutates the
 * live mirror; the `_pendingReplacements` drain re-applies post-reconcile.
 *
 * @param {Array<{id: string, url: string, sortOrder: number}>} items
 * @returns {Promise<void>}
 */
export async function reconcileClaims(items) {
  // M5: warn if items is empty but stored claims exist.
  // B-179 §75.4.2 — Phase-1 input is a snapshot of the in-memory mirror (the
  // full prior-claims set), NOT session storage. The snapshot must NOT be
  // narrowed to a subset (contract-diff gate / B-163 narrowing class).
  const storedClaims = { ...claimsMirror };
  if (items.length === 0 && Object.keys(storedClaims).length > 0) {
    console.warn('[tab-junkie] reconcileClaims called with 0 items but', Object.keys(storedClaims).length, 'stored claims exist — proceeding anyway');
  }
  const index = getLiveTabIndex();

  // Phase 1 — validate existing claims (B-149: URL not re-checked).
  const { reconciled, claimedTabIds, evictedItemIds } = _phase1ValidateClaims(storedClaims, index, items);

  /* B-175 §74 (A1): build the reverse lookup (normalized URL → [unclaimed
     tabIds]) ONCE here. It is consumed AND further mutated by BOTH Phase 2
     and Phase 3 (takeUnclaimedTabForUrl shifts consumed candidates off the
     bucket), so a tab taken in Phase 2 is unavailable to Phase 3 — the
     single-winner-per-tab invariant. Built after Phase 1 has populated
     `claimedTabIds` (claimed-skip on build), before Phase 2 reads it. */
  const urlToTabs = buildUnclaimedUrlIndex(index, claimedTabIds);

  // Phase 2 — auto-claim unclaimed items by primary URL in sortOrder.
  _phase2AutoClaimByUrl(items, reconciled, claimedTabIds, urlToTabs);

  // Phase 3 — drift-URL fallback over ALL still-unbound items (B-163 R4 round-2).
  await _phase3DriftFallback(items, reconciled, claimedTabIds, urlToTabs);

  claimsMirror = reconciled;
  claimsReady = true;

  /* B-167 W-1 §73.5 — durable mirror full-replace. Post-B-179 this is the
     SOLE persisted claim write (the session store is retired). Stamps every
     claim in the reconciled set with the current sessionTag and persists the
     map to `tj:itemClaims` so the next cold start can short-circuit URL
     inference via the durable direct-match path. Best-effort: failures log
     warn and do not block reconcile completion. Written here — after
     claimsMirror is authoritative and BEFORE Phase 4. */
  await ensureSessionTag().catch(() => { /* best-effort */ });
  await durableMirrorFullReplace();

  // Phase 4 — conditional drift drop for still-unrecovered evicted items (B-163).
  await _phase4ConditionalDriftDrop(evictedItemIds, reconciled);
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
      /* B-167 W-2 §73.5 — best-effort durable delete (post-B-179 the SOLE
         persisted write; the mirror delete above is the synchronous read-hot
         update). A crash before this write self-heals on the next cold start
         via reconcileClaims's `tabEntry && item` Phase 1 check (deleted items
         evict, then W-1 full-replace overwrites). */
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
    /* B-167 W-3 §73.5 — durable upsert for the new-claim branch in
       reevaluateTab (post-B-179 the SOLE persisted write; the mirror
       assignment above is the synchronous read-hot update). Stamps the
       current sessionTag and persists the new (itemId → tabId) binding so
       the next cold start can trust it. Best-effort; self-heals on next
       cold start. */
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
 * H7: Register a claim for an item+tab in the in-memory mirror AND persist to
 * the durable partition. Used by floating-groups.js after successful
 * re-association so buildLiveStates correctly reflects the claim.
 * @param {string} itemId
 * @param {number} tabId
 * @returns {Promise<void>}
 */
export async function claimTabForItem(itemId, tabId) {
  claimsMirror[itemId] = tabId;
  /* B-167 W-4 §73.5 — durable upsert from the floating-group promote /
     re-association path (post-B-179 the SOLE persisted write; the mirror
     assignment above is the synchronous read-hot update). Stamps the current
     sessionTag and persists the binding so the next cold start can trust it.
     Best-effort; self-heals on the next cold-start reconcile. */
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
 * skips the durable W-5 storage round-trip (see `dirty` flag).
 *
 * NOTE — the remaining tables are remapped at the call site in
 * `tab-events.js` (the itemId-keyed favicon set is stable across rotation →
 * no remap needed per the R2 AC3 clarification; the persisted
 * `tj:floatingGroups[].liveTabId` field is remapped by
 * `remapFloatingGroupsLiveTabId`). Keeping this helper scoped to the two
 * `tab-claims.js`-private structures preserves module encapsulation.
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
    // ephemeral — it is never persisted).
  }

  if (dirty) {
    /* B-167 W-5 §73.5 — durable remap of `tj:itemClaims.entries[itemId].tabId`
       (post-B-179 the SOLE persisted write; the mirror swap above is the
       synchronous read-hot update). Preserves claimedAt + sessionTag; only the
       tabId field changes. Best-effort; self-heals on the next cold-start
       reconcile. */
    if (remappedItemId !== null) {
      await durableRemapEntry(remappedItemId, addedTabId);
    }
  }
}
