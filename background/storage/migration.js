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

import { initializePartitions, readPartition, PARTITION_META, PARTITION_ITEMS, MAX_URL } from './partitions.js';
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
 */
export const KNOWN_VERSION = 1;

/**
 * Ordered array of migration steps. Each step upgrades the schema from
 * `fromVersion` to `toVersion`. Steps MUST be contiguous: step[i].toVersion
 * === step[i+1].fromVersion. The `migrate` function receives the full
 * storage snapshot keyed by partition name and returns the mutated snapshot.
 *
 * @typedef {Object} MigrationStep
 * @property {number} fromVersion
 * @property {number} toVersion
 * @property {(snapshot: Record<string, any>) => Record<string, any>} migrate
 */

/** @type {MigrationStep[]} */
const MIGRATION_STEPS = [];

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

    // Run all steps in a single writeTransaction for atomicity.
    // F3 — Known scaffold limitation: Current runner wraps only PARTITION_META.
    // When a real migration step needs multi-partition atomicity, refactor the
    // ops array to include all touched partitions in the same writeTransaction.
    try {
      await writeTransaction([{
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
      }]);
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
