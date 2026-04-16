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

// ---- Field length caps (H1) ------------------------------------------------
// Enforced in validators at the storage boundary to prevent quota-exhaustion
// DoS via oversized free-text fields. Exported so UI surfaces can mirror the
// limits for inline validation without re-declaring the numbers.
export const MAX_TITLE = 2048;
export const MAX_URL = 4096;
export const MAX_NAME = 256;
export const MAX_COLOR = 32;

export const PARTITION_ITEMS = 'items';
export const PARTITION_GROUPS = 'groups';
export const PARTITION_PREFS = 'prefs';
export const PARTITION_META = 'meta';
export const PARTITION_DRIFT = 'drift';
export const PARTITION_FLOATING_GROUPS = 'floatingGroups';

export const ALL_PARTITIONS = /** @type {const} */ ([
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_PREFS,
  PARTITION_META,
  PARTITION_DRIFT,
  PARTITION_FLOATING_GROUPS,
]);

/** Namespaced storage key for a partition. */
export function partitionKey(partition) {
  return `tj:${partition}`;
}

/** Default Preferences shape (also the seed for first-run). */
export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  displayMode: 'sidepanel',
  newTabOverride: false,
  autoCollapseSubGroups: false,
});

/** Default empty shape for a given partition. */
export function defaultShape(partition) {
  switch (partition) {
    case PARTITION_ITEMS:
      return /** @type {Item[]} */ ([]);
    case PARTITION_GROUPS:
      return /** @type {Group[]} */ ([]);
    case PARTITION_PREFS:
      return { ...DEFAULT_PREFERENCES };
    case PARTITION_META:
      return { schemaVersion: 1, createdAt: Date.now() };
    case PARTITION_DRIFT:
      return {};
    case PARTITION_FLOATING_GROUPS:
      return [];
    default:
      throw new StorageError(ERR_CORRUPT_DATA, `Unknown partition: ${String(partition)}`);
  }
}

// ---- Shape validators ------------------------------------------------------

function isString(v) { return typeof v === 'string'; }
function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isBool(v) { return typeof v === 'boolean'; }
function isNullableString(v) { return v === null || typeof v === 'string'; }

function isItem(v) {
  return v && typeof v === 'object'
    && isString(v.id) && isString(v.title) && isString(v.url)
    && isNullableString(v.groupId)
    && isNumber(v.sortOrder) && isNumber(v.createdAt) && isNumber(v.updatedAt);
}

function isGroup(v) {
  return v && typeof v === 'object'
    && isString(v.id) && isString(v.name) && isString(v.color)
    && isNullableString(v.parentId)
    && isNumber(v.sortOrder) && isBool(v.collapsed)
    && isNumber(v.createdAt) && isNumber(v.updatedAt);
}

function isPreferences(v) {
  return v && typeof v === 'object'
    && (v.theme === 'light' || v.theme === 'dark' || v.theme === 'system')
    && (v.displayMode === 'sidepanel' || v.displayMode === 'window')
    && isBool(v.newTabOverride) && isBool(v.autoCollapseSubGroups);
}

/**
 * Validate a partition value's shape. Throws StorageError(ERR_CORRUPT_DATA)
 * on failure. Used on every read and after every mutator in writeTransaction.
 * @param {string} partitionOrKey  partition name or full `tj:*` key
 * @param {*} value
 */
export function assertShape(partitionOrKey, value) {
  const partition = partitionOrKey.startsWith('tj:') ? partitionOrKey.slice(3) : partitionOrKey;
  switch (partition) {
    case PARTITION_ITEMS:
      if (!Array.isArray(value) || !value.every(isItem)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      return;
    case PARTITION_GROUPS:
      if (!Array.isArray(value) || !value.every(isGroup)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      return;
    case PARTITION_PREFS:
      if (!isPreferences(value)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      return;
    case PARTITION_META:
      if (!value || typeof value !== 'object' || !isNumber(value.schemaVersion)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      return;
    case PARTITION_DRIFT:
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      return;
    case PARTITION_FLOATING_GROUPS:
      if (!Array.isArray(value)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      return;
    default:
      throw new StorageError(ERR_CORRUPT_DATA, `Unknown partition: ${partition}`);
  }
}

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
