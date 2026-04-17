/**
 * Partition shape constants, defaults, and validators.
 *
 * Extracted from partitions.js to break the circular dependency:
 *   partitions.js -> write-transaction.js -> partitions.js
 *
 * shapes.js has no dependency on write-transaction.js, so
 * write-transaction.js can safely import from here instead of
 * partitions.js, eliminating the cycle.
 */

import { StorageError, ERR_CORRUPT_DATA } from './errors.js';
import { normalizeUrl } from '../../shared/url.js';

// ---- Field length caps (H1) ------------------------------------------------
// Enforced in validators at the storage boundary to prevent quota-exhaustion
// DoS via oversized free-text fields. Exported so UI surfaces can mirror the
// limits for inline validation without re-declaring the numbers.
export const MAX_TITLE = 2048;
export const MAX_URL = 4096;
export const MAX_NAME = 256;
export const MAX_COLOR = 32;

/** H-2: upper bound on bulkCreateItems inputs to prevent quota-exhaustion. */
export const MAX_BULK_INPUTS = 500;

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
      for (const [key, entry] of Object.entries(value)) {
        if (!entry || typeof entry !== 'object'
          || !isString(entry.itemId) || !isString(entry.driftedToUrl)
          || !isNumber(entry.detectedAt)) {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
        // M2: key must match entry.itemId
        if (entry.itemId !== key) {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — key/itemId mismatch`);
        }
        // M1: driftedToUrl must have valid scheme and respect MAX_URL
        if (entry.driftedToUrl.length > MAX_URL) {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — driftedToUrl exceeds MAX_URL`);
        }
        try {
          normalizeUrl(entry.driftedToUrl);
        } catch {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — driftedToUrl has invalid scheme`);
        }
      }
      return;
    case PARTITION_FLOATING_GROUPS:
      if (!Array.isArray(value)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      for (const entry of value) {
        // itemId is validated on write (appendFloatingGroup / saveFloatingGroups)
        // but treated as optional here for backward compatibility with records
        // written before B-013 shipped.
        if (!entry || typeof entry !== 'object'
          || !isString(entry.groupId) || !isNumber(entry.windowId)
          || !isNumber(entry.tabIndex) || !isString(entry.url)
          || !isNumber(entry.savedAt)) {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
      }
      return;
    default:
      throw new StorageError(ERR_CORRUPT_DATA, `Unknown partition: ${partition}`);
  }
}
