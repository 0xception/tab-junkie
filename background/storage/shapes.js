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
/* B-022 §39.3 D-3 — quick-search popup recency store. Persistent across
   browser restart; cap 50 newest-first entries; additive v1 schema. */
export const PARTITION_RECENCY = 'recency';

/* B-022 §39.3 D-3 — cap on `tj:recency.entries`. New entries past the cap
   trim the tail in a single splice at write time (handler-side). */
export const RECENCY_CAP = 50;

/* B-022 §39.3 D-3 — schemaVersion value for the `tj:recency` partition. */
export const RECENCY_SCHEMA_VERSION = 1;

export const ALL_PARTITIONS = /** @type {const} */ ([
  PARTITION_ITEMS,
  PARTITION_GROUPS,
  PARTITION_PREFS,
  PARTITION_META,
  PARTITION_DRIFT,
  PARTITION_FLOATING_GROUPS,
  PARTITION_RECENCY,
]);

/** Namespaced storage key for a partition. */
export function partitionKey(partition) {
  return `tj:${partition}`;
}

/** Default Preferences shape (also the seed for first-run). */
export const DEFAULT_PREFERENCES = Object.freeze({
  theme: 'system',
  displayMode: 'sidepanel',
  // newTabOverride: kept for backward compat; B-039 dropped (MV3 constraint
  // — chrome_url_overrides.newtab cannot be removed at runtime, so the OFF
  // state could not deliver browser-default new tab behavior. See SPRINT 29
  // retro + docs/design/42-b-036-newtab-page.md §42.3 D-2a RESCINDED).
  newTabOverride: false,
  autoCollapseSubGroups: false,
  /* B-060 — persist the user's last "Import duplicates anyway" choice so
     subsequent import preview dialogs default to their preferred behavior.
     `true` = skip in-file URL duplicates (original B-044/B-045 v1 default).
     `false` = keep every duplicate (user opted in via the checkbox on a
     previous import). */
  importSkipDuplicates: true,
  /* B-092 — opt-in compact layout. When true, all three rendering surfaces
     (sidepanel / newtab / standalone window) toggle a `.tj-dense` class on
     <body> that drives shorter rows, smaller title font, and hides the URL
     line via pure CSS descendant selectors. Default OFF preserves the
     two-line baseline rendering. */
  denseLayout: false,
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
    case PARTITION_RECENCY:
      /* B-022 §39.3 D-3 — v1 empty shape. `schemaVersion: 1` is a literal
         (not sourced from RECENCY_SCHEMA_VERSION) so a future bump of the
         constant cannot silently change the historical default. */
      return { schemaVersion: 1, entries: [] };
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
  if (!v || typeof v !== 'object') return false;
  if (!(v.theme === 'light' || v.theme === 'dark' || v.theme === 'system')) return false;
  if (!(v.displayMode === 'sidepanel' || v.displayMode === 'window')) return false;
  if (!isBool(v.newTabOverride) || !isBool(v.autoCollapseSubGroups)) return false;
  /* B-060 — `importSkipDuplicates` was added in Sprint 18 Wave 2. It is
     OPTIONAL on the shape validator: pre-B-060 stored prefs lack the key,
     and `getPreferences()` merges DEFAULT_PREFERENCES over stored so the
     runtime value is always populated. If the key IS present on disk (new
     writes or backup restores), its type must be boolean — protects against
     adversarial values landing via MSG_SET_PREFERENCES / import restore. */
  if ('importSkipDuplicates' in v && !isBool(v.importSkipDuplicates)) return false;
  /* B-092 — `denseLayout` follows the same OPTIONAL pattern as
     `importSkipDuplicates`: pre-B-092 stored prefs lack the key, and the
     `getPreferences()` defaults-merge guarantees the runtime value is always
     populated. When present on disk it must be a boolean. */
  if ('denseLayout' in v && !isBool(v.denseLayout)) return false;
  return true;
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
    case PARTITION_RECENCY:
      /* B-022 §39.3 D-3 — v1 shape validator. Schema version MUST be a
         finite number (future-proofing for >= 2). Entries array MUST be
         an array of `{id: string, accessedAt: number}` records. Over-cap
         arrays are structurally valid (trimmed on write, rendered ≤20). */
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
      }
      if (!isNumber(value.schemaVersion)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — schemaVersion`);
      }
      if (!Array.isArray(value.entries)) {
        throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — entries`);
      }
      for (const entry of value.entries) {
        if (!entry || typeof entry !== 'object'
          || !isString(entry.id) || entry.id.length === 0
          || !isNumber(entry.accessedAt)) {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
      }
      return;
    default:
      throw new StorageError(ERR_CORRUPT_DATA, `Unknown partition: ${partition}`);
  }
}
