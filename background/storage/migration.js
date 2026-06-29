/**
 * Schema migration runner and system-status provider (B-001b).
 *
 * Owns:
 *  - `KNOWN_VERSION`: the schema version this code understands.
 *  - `runMigrations()`: cold-start entry point that replaces the B-001a
 *    readyPromise stub. Initializes partitions, evaluates schema version,
 *    runs any pending migration steps, cleans up legacy keys, and evaluates
 *    the quota warning threshold.
 *  - `getSystemStatus()`: returns the current migration/quota/safe-mode state
 *    for the MSG_GET_STATUS handler.
 *  - `isSafeMode()`: returns whether the extension is in read-only safe mode
 *    (stored schema version > KNOWN_VERSION).
 *  - `migrateLegacyKeys()`: best-effort migration of pre-v2 `junkie_*` keys.
 *
 * Invariants:
 *  - All tj:* writes route through writeTransaction (AC6).
 *  - chrome.storage.local.remove() is used ONLY for foreign `junkie_*` keys.
 *  - Migration steps run inside a single writeTransaction so they are atomic.
 */

import { initializePartitions, readPartition, PARTITION_META, PARTITION_ITEMS, PARTITION_FLOATING_GROUPS, MAX_URL } from './partitions.js';
import { writeTransaction } from './write-transaction.js';
import { _peekQuotaSample } from './write-transaction.js';
import { StorageError, ERR_CORRUPT_DATA, ERR_TX_CONFLICT } from './errors.js';
import { ulid } from './ids.js';
import { normalizeUrl } from '../../shared/url.js';

/**
 * F5: URL validation for legacy imports — uses shared normalizeUrl (B-002)
 * for consistent scheme validation + length cap checks. Returns true if the
 * URL is valid for import, false otherwise. Best-effort: invalid entries are
 * silently discarded per AC7.
 */
function isValidImportUrl(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL) return false;
  try {
    normalizeUrl(url, { forStorage: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * M4: Known legacy keys from pre-v2 extension. Only these specific keys are
 * considered for migration, rather than any key matching `junkie_*`.
 */
const KNOWN_LEGACY_KEYS = ['junkie_bookmarks', 'junkie_groups', 'junkie_pinned_tabs', 'junkie_preferences'];

/**
 * The schema version this codebase understands. Bump when adding migration
 * steps. Migration registry entries define how to get from version N to N+1.
 *
 * v2 (B-121 §60.4.7) — `tj:floatingGroups` records gain a synthetic
 * `floatingTabId` (ulid) and rename the legacy `itemId` field to
 * `parentItemId`. The on-disk migration is a no-op governance bump because
 * the read-side is fully bidirectional: `getParentItemId()` resolves either
 * field, the validator tolerates either shape, and `appendFloatingGroup`
 * stamps the new shape on every fresh write. Existing legacy records remain
 * readable indefinitely and naturally drain to v2 shape as the user opens /
 * closes opener-chain-inherited tabs. Picking the no-op step over a forced
 * one-shot rewrite keeps the transaction bounded to PARTITION_META (matching
 * the F3 scaffold limitation) and avoids touching live floating-group data
 * during the cold-start window.
 *
 * v3 (B-134 §63.2.3) — `tj:floatingGroups` records gain an OPTIONAL
 * `sortOrder: number` field used by `buildFloatingMembers` to order floating
 * rows within a group. Lazy data migration (§63.2.4): the v2→v3 step is a
 * no-op governance bump; legacy records sort by (windowId, tabIndex) fallback
 * in `buildFloatingMembers`; new writes via `appendFloatingGroup` /
 * `reorderFloatingMembers` / `moveFloatingTab` always stamp `sortOrder`.
 * Legacy records self-evict naturally as their tabs close. C-1a + C-1b
 * compliance is recorded explicitly in §63.2.3 / §63.2.4.
 *
 * v4 (B-137 §66.2) — `tj:floatingGroups` records gain an OPTIONAL
 * `liveTabId: number` field used as the primary live-session join key by
 * `buildFloatingMembers` and `_resolveRecordIndexByTabId`. Lazy data
 * migration (§66.2.2): the v3→v4 step is a no-op governance bump; legacy
 * v3 records lacking `liveTabId` continue to resolve via the existing
 * (windowId, tabIndex)-then-URL fallback in the 3-tier read path.
 * `appendFloatingGroup` always stamps `liveTabId` on new writes (caller
 * supplies via the `entry` object — `tab-events.js` opener-chain block has
 * `tab.id` in scope per §66.5.5). `reassociateFloatingGroups` lazy-rewrites
 * `liveTabId` onto matched-unclaimed legacy records as part of its existing
 * `pruneResolvedFloatingGroups` write transaction (§66.7). C-1a + C-1b
 * compliance recorded in §66.2.1 / §66.2.2.
 *
 * v6 → v7 (B-148 §3.1, S44) governance bump. No-op migrate: lazy data
 * migration (option 2). `tj:groups` records gain an OPTIONAL
 * `renderOrder: string[]` of prefix-encoded refs (`item:<id>` /
 * `floating:<floatingTabId>`) used by sidepanel + newtab render-paths to
 * display saved-bookmarks + floating-tabs in user-defined interleaved
 * order. Legacy v6 groups lack the field; cold-start
 * `reassociateFloatingGroups` (extended at Task 11) bootstraps the
 * missing array from current Item.sortOrder + FloatingGroup.sortOrder
 * on first cold-start post-upgrade. C-1a + C-1b compliance: governance
 * bump required even when data migration is lazy (C-1b option 2).
 */
/* v7 → v8 (B-167 §73.3.1, S46) governance bump. No-op migrate: lazy data
 * migration (option 2). Introduces a new additive partition `tj:itemClaims`
 * (chrome.storage.local) holding a durable per-item tabId binding across
 * extension reload + browser restart. Legacy v7 profiles lack the key;
 * `initializePartitions()` seeds the default empty shape on first SW cold
 * start. The legacy `tj:tabClaims` (session storage) pipeline that durable
 * identity originally layered above (pre-populator) and below (passive mirror)
 * was RETIRED by B-179 §75 — claims are now durable-only. The governance bump
 * is required by C-1a even when data migration is lazy (C-1b option 2). */
/* v8 → v9 (B-180 §74.10, S47, B-173 EPIC B2) — the FIRST non-no-op step:
 * an EAGER data migration (C-1b option 1) that normalizes every
 * `tj:floatingGroups` record to the canonical v4 STABLE-field shape
 * (`parentItemId` + `floatingTabId` + `sortOrder`). `liveTabId` is EPHEMERAL
 * and is NOT fabricated — runtime recomputes it. The position/URL fallback
 * tiers + the tolerant read-validator are KEPT this sprint (orphan-risk
 * mitigation, §74.12 Risk-3); their deletion is deferred to B-183. C-1a paired
 * bump: this constant + the `defaultShape(PARTITION_META)` literal both move
 * 8→9 in lock-step. */
export const KNOWN_VERSION = 9;

/**
 * B-180 §74.10 — normalize every `tj:floatingGroups` record to the canonical
 * v4 STABLE-field shape (eager v8→v9 data migration transform).
 *
 * ADDITIVE + idempotent: fills the three STABLE identity/order fields when
 * absent, leaves already-present fields untouched, and drops no record (the
 * returned array is a 1:1 map of the input).
 *
 *  - `parentItemId`: derived from a legacy `itemId` when missing. The derivation
 *    is inlined (mirroring `getParentItemId`'s `itemId` fallback) to avoid a
 *    storage→tabs layering import (R4 M-1). The legacy `itemId` is LEFT in place
 *    (the read-validator still tolerates it and `getParentItemId` prefers
 *    `parentItemId`), so the change is purely additive — no runtime behavior
 *    shifts beyond the record gaining a field it was previously read through.
 *  - `floatingTabId`: a fresh ULID is minted when missing (matches
 *    `appendFloatingGroup`'s stamping).
 *  - `sortOrder`: assigned per-group as `current_max_in_group + 1` in array
 *    order for records lacking it (matches `appendFloatingGroup`'s
 *    `maxSortOrder + 1` convention), so legacy records slot deterministically
 *    after any already-ordered siblings without colliding with existing values.
 *
 * `liveTabId` is EPHEMERAL (a tabId that rotates across browser restart) and is
 * deliberately NOT fabricated — runtime (`reassociateFloatingGroups` / the
 * B-175 resolver) recomputes it. Fabricating a stale value here would be the
 * exact live-data-touch hazard §74.12 Risk-3 warns against. Records that resist
 * normalization (non-object) are preserved as-is rather than dropped (a corrupt
 * record could not have reached disk through the validated write path; if one
 * somehow had, the post-mutation `assertShape` rejects it loudly, matching the
 * pre-existing migration failure contract).
 *
 * @param {*} current  the current `tj:floatingGroups` value (expected: array)
 * @returns {Array<object>|*}
 */
function normalizeFloatingGroupsToV4(current) {
  if (!Array.isArray(current)) return current;

  /* Seed each group's running max sortOrder from records that ALREADY carry a
     finite sortOrder, so values assigned below never collide with existing
     ones. On a second (idempotent) pass every record already has sortOrder, so
     the map below reassigns nothing. */
  const maxByGroup = new Map();
  for (const rec of current) {
    if (!rec || typeof rec !== 'object') continue;
    if (typeof rec.sortOrder === 'number' && Number.isFinite(rec.sortOrder)) {
      const prev = maxByGroup.has(rec.groupId) ? maxByGroup.get(rec.groupId) : -1;
      if (rec.sortOrder > prev) maxByGroup.set(rec.groupId, rec.sortOrder);
    }
  }

  return current.map((rec) => {
    if (!rec || typeof rec !== 'object') return rec; // preserve, never drop
    const next = { ...rec };

    // parentItemId — derive from legacy itemId when missing (additive). Inlined to
    // avoid a storage->tabs layering import (R4 M-1); mirrors getParentItemId's itemId fallback.
    if (typeof next.parentItemId !== 'string' || next.parentItemId.length === 0) {
      if (typeof next.itemId === 'string' && next.itemId.length > 0) {
        next.parentItemId = next.itemId;
      }
    }

    // floatingTabId — mint a fresh ULID when missing.
    if (typeof next.floatingTabId !== 'string' || next.floatingTabId.length === 0) {
      next.floatingTabId = ulid();
    }

    // sortOrder — assign current_max_in_group + 1 in array order when missing.
    if (typeof next.sortOrder !== 'number' || !Number.isFinite(next.sortOrder)) {
      const nextOrder = (maxByGroup.has(next.groupId) ? maxByGroup.get(next.groupId) : -1) + 1;
      maxByGroup.set(next.groupId, nextOrder);
      next.sortOrder = nextOrder;
    }

    // liveTabId — EPHEMERAL; never fabricated. Left absent/as-is for runtime.
    return next;
  });
}

/**
 * Ordered array of migration steps. Each step upgrades the schema from
 * `fromVersion` to `toVersion`. Steps MUST be contiguous: step[i].toVersion
 * === step[i+1].fromVersion. The `migrate` function receives the full
 * storage snapshot keyed by partition name and returns the mutated snapshot
 * (used for `tj:meta`-only governance bumps).
 *
 * B-180 §74.10 — a step MAY additionally declare `partitionMigrations`: a map
 * of `{ [partition]: (current) => next }` pure idempotent transforms for an
 * EAGER per-partition data rewrite. The runner adds one `writeTransaction` op
 * per declared partition so the data rewrite commits ATOMICALLY with the
 * `tj:meta` version bump (resolves the F3 single-partition scaffold
 * limitation). Steps targeting the same partition compose left-to-right via
 * writeTransaction's same-key mutator chaining.
 *
 * @typedef {Object} MigrationStep
 * @property {number} fromVersion
 * @property {number} toVersion
 * @property {(snapshot: Record<string, any>) => Record<string, any>} migrate
 * @property {Record<string, (current: any) => any>} [partitionMigrations]
 */

/** @type {MigrationStep[]} */
const MIGRATION_STEPS = [
  /* B-121 §60.4.7 — v1 → v2 governance bump. No-op migrate: the read-side
     compatibility shim (getParentItemId + assertShape tolerance) already
     handles legacy `itemId` records, so we advance the schemaVersion stamp
     without touching `tj:floatingGroups` data. New writes stamp the v2 shape
     via appendFloatingGroup. */
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (snapshot) => snapshot,
  },
  /* B-134 §63.2.3 / §63.2.4 — v2 → v3 governance bump. No-op migrate: lazy
     data migration. `buildFloatingMembers` derives sort from (windowId,
     tabIndex) for legacy records lacking `sortOrder`; new writes always
     stamp `sortOrder`. Records self-evict via natural turnover. The
     governance bump is required by C-1a even when the data migration is
     lazy (C-1b option 2). */
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (snapshot) => snapshot,
  },
  /* B-137 §66.2.1 / §66.2.2 — v3 → v4 governance bump. No-op migrate: lazy
     data migration (option 2). `buildFloatingMembers` and
     `_resolveRecordIndexByTabId` adopt a 3-tier join — direct `liveTabId`
     match (tier a) → `(windowId, tabIndex)` position match (tier b) → URL
     fallback (tier c). Legacy v3 records (no `liveTabId`) resolve through
     tier b/c verbatim; new writes via `appendFloatingGroup` /
     `moveFloatingTab` always stamp `liveTabId`. `reassociateFloatingGroups`
     lazy-rewrites `liveTabId` onto matched-unclaimed legacy records on the
     next cold-start re-bind. Records self-evict via natural turnover. The
     governance bump is required by C-1a even when the data migration is
     lazy (C-1b option 2). */
  {
    fromVersion: 3,
    toVersion: 4,
    migrate: (snapshot) => snapshot,
  },
  /* B-041 §3.3 (S42) — v4 → v5 governance bump. No-op migrate: lazy data
     migration (option 2). `tj:groups` records gain an OPTIONAL
     `chromeTabGroupId: number | null` used by chrome-sync to remember which
     Chrome tab group corresponds to which TJ group across re-sync calls.
     Legacy v4 records lacking the field are treated as never-synced; the
     first sync stamps the field. The governance bump is required by C-1a
     even when the data migration is lazy (C-1b option 2). */
  {
    fromVersion: 4,
    toVersion: 5,
    migrate: (snapshot) => snapshot,
  },
  /* B-159 §A (S43 close, 2026-05-03) — v5 → v6 governance bump. No-op
     migrate: lazy data migration (option 2). `tj:items` records gain an
     OPTIONAL `favIconUrl: string | null` so favicons persist across
     extension restarts and tab closes (previously favicons were rendered
     entirely from live `chrome.tabs.favIconUrl` — no persistence; closed
     tabs got the letter-avatar fallback). Legacy v5 records lacking the
     field render via the existing letter-avatar / Chrome _favicon API
     fallback chain (B-159 §B). New writes stamp the field via the
     capture path in `chrome.tabs.onUpdated` listener (one-shot per
     session per item). The governance bump is required by C-1a even
     when the data migration is lazy (C-1b option 2). */
  {
    fromVersion: 5,
    toVersion: 6,
    migrate: (snapshot) => snapshot,
  },
  /* B-148 §3.1 (S44) — v6 → v7 governance bump. No-op migrate: lazy data
     migration (option 2). `tj:groups` records gain an OPTIONAL
     `renderOrder: string[]` of prefix-encoded refs (`item:<id>` /
     `floating:<floatingTabId>`) used by sidepanel + newtab render-paths
     to display saved-bookmark + floating-tab rows in user-defined
     interleaved order. Legacy v6 groups lack the field; cold-start
     `reassociateFloatingGroups` (extended at Task 11) bootstraps the
     missing array from current Item.sortOrder + FloatingGroup.sortOrder
     on first cold-start post-upgrade. The governance bump is required
     by C-1a even when data migration is lazy (C-1b option 2). */
  {
    fromVersion: 6,
    toVersion: 7,
    migrate: (snapshot) => snapshot,
  },
  /* B-167 §73.3.3 (S46) — v7 → v8 governance bump. No-op migrate: lazy
     data migration (option 2). Introduces a new additive partition
     `tj:itemClaims` (chrome.storage.local) holding a durable per-item
     tabId binding across extension reload + browser restart. Legacy v7
     profiles lack the key; `initializePartitions()` seeds the default
     empty shape on first SW cold start. The legacy `tj:tabClaims`
     (session storage) writes that durable once mirrored via the
     W-1..W-5 PATCH sites in `tab-claims.js` were RETIRED by B-179 §75 —
     claims are now durable-only. The governance bump is required by C-1a
     even when data migration is lazy (C-1b option 2). */
  {
    fromVersion: 7,
    toVersion: 8,
    migrate: (snapshot) => snapshot,
  },
  /* B-180 §74.10 (S47, B-173 EPIC B2) — v8 → v9 EAGER data migration. Unlike
     every prior step (all no-op governance bumps), this one normalizes every
     `tj:floatingGroups` record to the canonical v4 STABLE-field shape via
     `partitionMigrations` (committed atomically with the meta bump by the
     runner). `migrate` stays a meta no-op — the data work is the partition
     transform. C-1b option 1 (eager). The normalization is additive +
     idempotent + drops no record, and does NOT fabricate the ephemeral
     `liveTabId`. The position/URL recovery tiers + the tolerant read-validator
     are intentionally RETAINED this sprint (orphan-risk mitigation, §74.12
     Risk-3); B-183 deletes them once a sprint of P-4 signal confirms zero
     orphans. */
  {
    fromVersion: 8,
    toVersion: 9,
    migrate: (snapshot) => snapshot,
    partitionMigrations: {
      [PARTITION_FLOATING_GROUPS]: normalizeFloatingGroupsToV4,
    },
  },
];

/* B-022 §39.3 D-3 — `tj:recency` partition, introduced in Sprint 26.
 * No MigrationStep is required because the partition is additive:
 * `initializePartitions()` iterates `ALL_PARTITIONS` and seeds any missing
 * key with `defaultShape()` (which yields `{ schemaVersion: 1, entries: [] }`
 * for `PARTITION_RECENCY`). Existing profiles upgrading from v1.19.0 pick
 * up the empty shape on first SW cold start; no data is touched; no
 * schemaVersion bump is needed. Rollback (§39.8) = delete the key.
 */

// F2: Static assertion — verify the migration registry forms a contiguous
// fromVersion → toVersion chain at module load time. If a step is ever added
// that breaks the chain, this throws immediately and loudly.
if (MIGRATION_STEPS.length > 0) {
  for (let i = 0; i < MIGRATION_STEPS.length - 1; i++) {
    if (MIGRATION_STEPS[i].toVersion !== MIGRATION_STEPS[i + 1].fromVersion) {
      throw new Error(
        `Migration chain broken: step[${i}].toVersion (${MIGRATION_STEPS[i].toVersion}) !== step[${i + 1}].fromVersion (${MIGRATION_STEPS[i + 1].fromVersion})`
      );
    }
  }
}

// ---- Module-level state (re-initialized on every SW cold start) -----------

/** When true, all write operations are blocked (downgrade protection). */
let safeMode = false;

/** Cached schema version after migration evaluation. */
let schemaVersion = 0;

/** Whether quota usage >= 80% of total. */
let quotaWarning = false;

/** Cached quota bytes in use. */
let quotaBytesInUse = 0;

/** Total quota bytes (Chrome default 5 MiB). */
let quotaBytesTotal = 5242880;

/**
 * Returns whether the extension is in read-only safe mode.
 * @returns {boolean}
 */
export function isSafeMode() {
  return safeMode;
}

/**
 * Returns the current system status for the MSG_GET_STATUS handler.
 * @returns {{
 *   safeMode: boolean,
 *   schemaVersion: number,
 *   knownVersion: number,
 *   quotaWarning: boolean,
 *   quotaBytesInUse: number,
 *   quotaBytesTotal: number
 * }}
 */
export function getSystemStatus() {
  return {
    safeMode,
    schemaVersion,
    knownVersion: KNOWN_VERSION,
    quotaWarning,
    quotaBytesInUse,
    quotaBytesTotal,
  };
}

/**
 * Evaluate quota warning state from the latest write-transaction sample.
 * Updates module-level quotaWarning / quotaBytesInUse / quotaBytesTotal.
 */
async function evaluateQuota() {
  try {
    quotaBytesTotal = chrome.storage.local.QUOTA_BYTES ?? 5242880;
  } catch {
    quotaBytesTotal = 5242880;
  }

  const sample = _peekQuotaSample();
  if (sample) {
    quotaBytesInUse = sample.bytesInUse;
  } else {
    // M2: On first cold start _peekQuotaSample() returns null because no
    // writeTransaction has run yet. Fall back to a direct API call.
    try {
      quotaBytesInUse = await chrome.storage.local.getBytesInUse(null);
    } catch {
      // best-effort — leave at 0
    }
  }
  quotaWarning = quotaBytesTotal > 0 && (quotaBytesInUse / quotaBytesTotal) >= 0.80;
}

/**
 * Detect and migrate legacy `junkie_*` keys from the pre-v2 extension.
 *
 * Best-effort: failures are logged but never block startup. Legacy bookmark
 * entries are shape-mapped to Items with fresh ULIDs, null groupId, and
 * sortOrder 0, then appended to tj:items via writeTransaction. After
 * successful migration the legacy keys are removed via
 * chrome.storage.local.remove() (acceptable for foreign keys per spec).
 */
async function migrateLegacyKeys() {
  let allData;
  try {
    // M4: Only fetch known legacy keys, not all storage
    allData = await chrome.storage.local.get(KNOWN_LEGACY_KEYS);
  } catch {
    return; // best-effort — cannot read storage
  }

  const legacyKeys = KNOWN_LEGACY_KEYS.filter((k) => k in allData);
  if (legacyKeys.length === 0) return;

  // Shape-map junkie_bookmarks entries to Items if present
  const bookmarksKey = 'junkie_bookmarks';
  const legacyBookmarks = allData[bookmarksKey];
  if (Array.isArray(legacyBookmarks) && legacyBookmarks.length > 0) {
    const now = Date.now();
    const newItems = legacyBookmarks
      // F5: Validate URL through the same scheme + length checks as createItem
      .filter((b) => b && typeof b === 'object' && isValidImportUrl(b.url))
      .map((b) => ({
        id: ulid(),
        title: typeof b.title === 'string' && b.title.trim().length > 0 ? b.title.trim() : b.url,
        // B-002: normalize imported URLs for consistent storage form
        url: normalizeUrl(b.url, { forStorage: true }),
        groupId: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      }));

    if (newItems.length > 0) {
      await writeTransaction([{
        partition: PARTITION_ITEMS,
        mutator: (items) => [...items, ...newItems],
      }]);
    }
  }

  // Remove all legacy keys (foreign keys, not tj:* partitions)
  try {
    await chrome.storage.local.remove(legacyKeys);
  } catch {
    // best-effort cleanup
  }
}

/**
 * Cold-start entry point. Replaces the B-001a readyPromise stub.
 *
 * Sequence:
 *  1. Initialize any missing partitions (idempotent).
 *  2. Read tj:meta.schemaVersion.
 *  3. Compare stored version to KNOWN_VERSION:
 *     - Equal: no migration needed.
 *     - Less: run migration steps atomically.
 *     - Greater: enter safe mode (read-only), resolve (not reject).
 *     - Corrupt/NaN/missing: reject with ERR_CORRUPT_DATA.
 *  4. If migration step throws: reject with ERR_TX_CONFLICT.
 *  5. After version check: best-effort legacy key migration.
 *  6. Evaluate quota warning.
 *
 * @returns {Promise<void>}
 */
export async function runMigrations() {
  // Step 1: partition init
  await initializePartitions();

  // Step 2: read stored schema version
  const meta = await readPartition(PARTITION_META);
  const stored = meta.schemaVersion;

  // Step 3: validate stored version
  if (typeof stored !== 'number' || !Number.isFinite(stored) || stored < 1) {
    throw new StorageError(ERR_CORRUPT_DATA, 'Schema version is corrupt or missing');
  }

  // Cache for getSystemStatus
  schemaVersion = stored;

  if (stored > KNOWN_VERSION) {
    // Downgrade scenario: enter safe mode, resolve (reads must work per AC5)
    safeMode = true;
  }

  if (stored < KNOWN_VERSION) {
    // Collect applicable steps
    const steps = MIGRATION_STEPS.filter(
      (s) => s.fromVersion >= stored && s.toVersion <= KNOWN_VERSION
    );

    if (steps.length === 0) {
      throw new StorageError(
        ERR_CORRUPT_DATA,
        `No migration path from version ${stored} to ${KNOWN_VERSION}`
      );
    }

    /* B-180 §74.10 — collect the EAGER per-partition data migrations declared
       by the applicable steps. Each transform is pure + idempotent; the runner
       adds one writeTransaction op per declared partition so the data rewrite
       commits ATOMICALLY with the PARTITION_META version bump below. This is
       the multi-partition extension the original F3 scaffold note anticipated
       ("refactor the ops array to include all touched partitions in the same
       writeTransaction"). Each op's mutator re-reads its partition value from
       the transaction's own atomic get (race-safe); steps targeting the same
       partition compose via writeTransaction's same-key mutator chaining. */
    const dataOps = [];
    for (const step of steps) {
      if (step.partitionMigrations && typeof step.partitionMigrations === 'object') {
        for (const [partition, transform] of Object.entries(step.partitionMigrations)) {
          if (typeof transform === 'function') {
            dataOps.push({ partition, mutator: (current) => transform(current) });
          }
        }
      }
    }

    // Run the meta version bump + any eager data migrations in a SINGLE
    // writeTransaction so they commit atomically (all or nothing).
    try {
      await writeTransaction([
        {
          partition: PARTITION_META,
          mutator: (currentMeta) => {
            let snapshot = { meta: currentMeta };
            for (const step of steps) {
              // F6: Deep-clone before passing to step.migrate() to prevent
              // prototype pollution from a malformed migration step.
              const frozen = JSON.parse(JSON.stringify(snapshot));
              snapshot = step.migrate(frozen);
            }
            const result = snapshot.meta || currentMeta;
            result.schemaVersion = KNOWN_VERSION;
            return result;
          },
        },
        ...dataOps,
      ]);
    } catch (e) {
      // schemaVersion stays at pre-migration value (tx aborted)
      if (e instanceof StorageError) throw e;
      throw new StorageError(ERR_TX_CONFLICT, 'Migration failed', e);
    }

    schemaVersion = KNOWN_VERSION;
  }

  // stored === KNOWN_VERSION and safe-mode both fall through to here.

  // M1: Legacy key cleanup runs unconditionally after init + migration,
  // regardless of which version-check branch was taken (best-effort).
  try {
    await migrateLegacyKeys();
  } catch (e) {
    console.warn('[tab-junkie] legacy key migration failed (non-blocking)', e);
  }

  // Evaluate quota warning
  await evaluateQuota();
}

// ---- Test-only hooks (prefixed with underscore) ----------------------------

/** @internal Append a migration step to the registry (test-only). */
export function _registerMigrationStepForTest(step) {
  MIGRATION_STEPS.push(step);
}

/** @internal Clear all migration steps from the registry (test-only). */
export function _clearMigrationStepsForTest() {
  MIGRATION_STEPS.length = 0;
}

/** @internal Reset module-level state so tests start clean (test-only). */
export function _resetMigrationStateForTest() {
  safeMode = false;
  schemaVersion = 0;
  quotaWarning = false;
  quotaBytesInUse = 0;
  quotaBytesTotal = 5242880;
}
