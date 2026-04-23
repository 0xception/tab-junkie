/**
 * Partitioned chrome.storage.local schema.
 *
 * Six top-level keys, each holding an independently-validated shape. A
 * corrupt partition raises ERR_CORRUPT_DATA on read of that key only; the
 * other five remain usable (AC8).
 *
 * @typedef {Object} Item
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string|null} groupId
 * @property {number} sortOrder
 * @property {number} createdAt
 * @property {number} updatedAt
 *
 * @typedef {Object} Group
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {string|null} parentId
 * @property {number} sortOrder
 * @property {boolean} collapsed
 * @property {number} createdAt
 * @property {number} updatedAt
 *
 * @typedef {Object} Preferences
 * @property {'light'|'dark'|'system'} theme
 * @property {'sidepanel'|'window'} displayMode
 * @property {boolean} newTabOverride
 * @property {boolean} autoCollapseSubGroups
 *
 * @typedef {Object} TxOp
 * @property {'items'|'groups'|'prefs'|'meta'|'drift'|'floatingGroups'} partition
 * @property {(current: any) => any} mutator
 */

import { StorageError, ERR_CORRUPT_DATA } from './errors.js';
import { writeTransaction } from './write-transaction.js';
import { ALL_PARTITIONS, partitionKey, defaultShape, assertShape } from './shapes.js';

// Re-export all shape constants, defaults, and validators from shapes.js so
// existing consumers of partitions.js require zero import-path changes.
export {
  MAX_TITLE,
  MAX_URL,
  MAX_NAME,
  MAX_COLOR,
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_PREFS,
  PARTITION_META,
  PARTITION_DRIFT,
  PARTITION_FLOATING_GROUPS,
  PARTITION_RECENCY,
  RECENCY_CAP,
  RECENCY_SCHEMA_VERSION,
  ALL_PARTITIONS,
  DEFAULT_PREFERENCES,
  partitionKey,
  defaultShape,
  assertShape,
} from './shapes.js';

/**
 * Read a single partition with shape validation and default fallback. If the
 * key is missing, returns the default empty shape (AC1/AC2). If the key is
 * present but corrupt, throws ERR_CORRUPT_DATA scoped to this partition only
 * (AC8 — other partitions are read through separate calls).
 * @param {string} partition
 */
export async function readPartition(partition) {
  const key = partitionKey(partition);
  let raw;
  try {
    raw = await chrome.storage.local.get(key);
  } catch (e) {
    throw new StorageError(ERR_CORRUPT_DATA, `storage.get failed for ${partition}`, e);
  }
  if (raw[key] === undefined) return defaultShape(partition);
  assertShape(partition, raw[key]);
  return raw[key];
}

/**
 * Initialize any missing partitions with their default empty shapes (AC1).
 * Idempotent; called at service-worker startup. Only writes keys that are
 * currently undefined to avoid clobbering user data.
 */
export async function initializePartitions() {
  // Probe current state first so we only issue write ops for partitions that
  // are actually missing — keeps init idempotent and avoids rewriting user
  // data on every cold start.
  const keys = ALL_PARTITIONS.map(partitionKey);
  let current;
  try {
    current = await chrome.storage.local.get(keys);
  } catch (e) {
    throw new StorageError(ERR_CORRUPT_DATA, 'storage.get failed during init', e);
  }
  const missing = ALL_PARTITIONS.filter((p) => current[partitionKey(p)] === undefined);
  if (missing.length === 0) return;

  // C1 / H7: route the init write through writeTransaction so the single
  // serialized/atomic write path guards this call too (AC6). Quota errors
  // are now surfaced as ERR_QUOTA_EXCEEDED by writeTransaction, subsuming H7.
  // Each mutator receives the partition's default (writeTransaction seeds
  // missing keys via defaultShape) and returns it unchanged — the tx layer
  // then validates the shape and commits it atomically.
  const ops = missing.map((p) => ({
    partition: p,
    mutator: (input) => input,
  }));
  await writeTransaction(ops);
}
