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
import { VALID_THEME_SLUGS_READ } from '../../shared/theme-slugs.js';

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
  /* B-088 fix #2 — legacy new-tab-override ghost-key removed. The pref
     existed only to gate the toggle in the original B-036 design; B-039
     (Sprint 29) dropped the toggle because MV3's chrome_url_overrides cannot
     be removed at runtime. The newtab page is now always-on, leaving the
     pref a no-op storage slot. Stale on-disk values from pre-removal builds
     are tolerated by isPreferences (extra keys ignored) and stripped on
     import by validatePreferences. */
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
      /* B-041 §3.3 (S42) — fresh installs seed at v5 directly so no migration
         step runs on first boot. `migration.js` KNOWN_VERSION = 5. Hardcoded
         literal (not imported from migration.js) to keep the storage layer
         independent of the migration runner — bumping this when KNOWN_VERSION
         bumps is a deliberate, paired change.
         History: v1→v2 (B-121 §60.4.7) added floatingTabId + parentItemId.
         v2→v3 (B-134 §63.2.3) adds OPTIONAL `sortOrder` to PARTITION_FLOATING_GROUPS
         records; data migration is lazy (legacy records sort by (windowId, tabIndex)
         fallback in buildFloatingMembers; new writes always stamp sortOrder).
         v3→v4 (B-137 §66.2) adds OPTIONAL `liveTabId` to PARTITION_FLOATING_GROUPS
         records; data migration is lazy (legacy records resolve via the
         (windowId, tabIndex)-then-URL fallback in the 3-tier read path; new
         writes always stamp `liveTabId`; cold-start re-bind via
         `reassociateFloatingGroups` lazy-rewrites the field on matched-
         unclaimed legacy records).
         v4→v5 (B-041 S42 §3.3) adds OPTIONAL `chromeTabGroupId: number | null`
         to PARTITION_GROUPS records; data migration is lazy (legacy records
         lack the field; first sync stamps it; stale mappings are cleared
         transparently).
         v5→v6 (B-159 §A, S43 close 2026-05-03) adds OPTIONAL `favIconUrl:
         string | null` to PARTITION_ITEMS records so favicons persist across
         tab close + extension restart. Data migration is lazy (legacy v5
         items lack the field; first chrome.tabs.onUpdated observation with
         a non-empty favicon stamps the field once-per-session-per-item). */
      return { schemaVersion: 6, createdAt: Date.now() };
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
  if (!v || typeof v !== 'object') return false;
  if (!isString(v.id) || !isString(v.title) || !isString(v.url)) return false;
  if (!isNullableString(v.groupId)) return false;
  if (!isNumber(v.sortOrder) || !isNumber(v.createdAt) || !isNumber(v.updatedAt)) return false;
  /* B-159 §A (S43, v5→v6) — OPTIONAL favIconUrl. Legacy v5 items lack the
     field; null is valid; non-empty string is valid. Anything else is corrupt.
     The capture path in `chrome.tabs.onUpdated` only stamps `isSafeFaviconUrl`
     URLs, so the on-disk shape is constrained to https/http/data:image. */
  if ('favIconUrl' in v
    && v.favIconUrl !== null
    && !isString(v.favIconUrl)) return false;
  return true;
}

function isGroup(v) {
  if (!v || typeof v !== 'object') return false;
  if (!isString(v.id) || !isString(v.name) || !isString(v.color)) return false;
  if (!isNullableString(v.parentId)) return false;
  if (!isNumber(v.sortOrder) || !isBool(v.collapsed)) return false;
  if (!isNumber(v.createdAt) || !isNumber(v.updatedAt)) return false;
  /* B-041 (S42 §3.3) — OPTIONAL v5 field. Legacy v4 groups lack it; new writes
     stamp it on first sync; null is valid (cleared after stale-mapping detect).
     Anything else is corrupt. */
  if ('chromeTabGroupId' in v
    && v.chromeTabGroupId !== null
    && !isNumber(v.chromeTabGroupId)) return false;
  return true;
}

/* B-037 §45.3 D-1 / D-2 / D-5 — `theme` enum extension. READ-side allow-list
   sourced from shared/theme-slugs.js: 13 new slugs + 2 legacy aliases
   ('light', 'dark'). The two legacy values are tolerated here so
   `assertShape()` does not throw ERR_CORRUPT_DATA on disk values written
   before B-037 shipped. The legacy values are normalised by `getPreferences()`
   (preferences.js) BEFORE the defaults-merge so the runtime contract sees only
   the new 13-slug enum. Writes go through `validatePrefsPatch()` which gates
   on the 13 new slugs ONLY — legacy values can never be re-written. */

function isPreferences(v) {
  if (!v || typeof v !== 'object') return false;
  if (typeof v.theme !== 'string' || !VALID_THEME_SLUGS_READ.has(v.theme)) return false;
  if (!(v.displayMode === 'sidepanel' || v.displayMode === 'window')) return false;
  if (!isBool(v.autoCollapseSubGroups)) return false;
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
        // Required fields. parentItemId / itemId / floatingTabId are
        // validated as strings *if* present per B-121 §60.4.6; the
        // appendFloatingGroup / saveFloatingGroups write paths require
        // either parentItemId or legacy itemId before storing a record,
        // so reads tolerate either field for backward compatibility with
        // pre-S38 records.
        if (!entry || typeof entry !== 'object'
          || !isString(entry.groupId) || !isNumber(entry.windowId)
          || !isNumber(entry.tabIndex) || !isString(entry.url)
          || !isNumber(entry.savedAt)) {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
        if ('floatingTabId' in entry && typeof entry.floatingTabId !== 'string') {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
        if ('parentItemId' in entry && typeof entry.parentItemId !== 'string') {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
        if ('itemId' in entry && typeof entry.itemId !== 'string') {
          throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition}`);
        }
        /* B-134 §63.2.5 — OPTIONAL sortOrder field (schema v3). Legacy v2
           records lack the field; new writes from B-134 stamp it. The
           validator tolerates both shapes; buildFloatingMembers prefers
           sortOrder when present, falling back to (windowId, tabIndex). */
        if ('sortOrder' in entry) {
          if (typeof entry.sortOrder !== 'number' || !Number.isFinite(entry.sortOrder)) {
            throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — sortOrder`);
          }
        }
        /* B-137 §66.4 — OPTIONAL liveTabId field (schema v4). Legacy v3
           records lack the field; new writes from B-137 stamp it. The
           validator tolerates both shapes; buildFloatingMembers +
           _resolveRecordIndexByTabId prefer liveTabId direct-match when
           present, falling back to (windowId, tabIndex)-then-URL for legacy
           records. Allow-list direction (C-7): when present, MUST be a
           finite number; when absent, the record is still valid (legacy v3). */
        if ('liveTabId' in entry) {
          if (typeof entry.liveTabId !== 'number' || !Number.isFinite(entry.liveTabId)) {
            throw new StorageError(ERR_CORRUPT_DATA, `Corrupt partition: ${partition} — liveTabId`);
          }
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
