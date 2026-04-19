/**
 * Frozen export-schema constants for B-042 (HTML), B-043 (JSON),
 * and B-044 / B-045 (import). Kept in `shared/` — not `background/export/` —
 * so the future B-045 importer (which lives alongside the sidepanel upload UI
 * dispatch + the background SW parser) can consume the exact same symbols
 * without forking the schema.
 *
 * Per SOLUTION_DESIGN §32.5, additive field changes on the Item / Group
 * records do NOT bump EXPORT_SCHEMA_VERSION. The version only increments on
 * incompatible shape changes (field rename, type change, semantic flip).
 *
 * §33.15 Q-1 (import): the allow-list constants + `sanitizeItem` / `sanitizeGroup`
 * helpers previously lived in `background/export/json-export.js`. They are
 * hoisted here so the B-045 JSON validator consumes the identical allow-list
 * without duplication (C-7: iterate the allow-list, never the input keys).
 */

/**
 * Integer schema version for the Tab Junkie JSON export format. Starts at 1;
 * read dynamically by the JSON builder (B-043 AC3) so a future bump here
 * propagates without extra wiring.
 */
export const EXPORT_SCHEMA_VERSION = 1;

/**
 * Supported `format` values on MSG_EXPORT_COLLECTION. Kept as a const array so
 * the handler's payload validator and the sidepanel's dispatch can share the
 * same source of truth.
 */
export const EXPORT_FORMATS = /** @type {const} */ (['html', 'json']);

/**
 * MIME type emitted on the ExportCollectionResponse envelope for each format.
 * Matches what `new Blob([content], { type })` expects sidepanel-side.
 */
export const EXPORT_MIME_TYPES = Object.freeze({
  html: 'text/html',
  json: 'application/json',
});

/**
 * Filename prefix (the date + extension are appended by buildFilenameWithDate).
 *   'html' → 'tab-junkie-bookmarks-YYYY-MM-DD.html'
 *   'json' → 'tab-junkie-backup-YYYY-MM-DD.json'
 */
export const EXPORT_FILENAME_PREFIXES = Object.freeze({
  html: 'tab-junkie-bookmarks',
  json: 'tab-junkie-backup',
});

/**
 * File extension (no leading dot) per format. Kept alongside the prefix so the
 * handler and the future B-043 JSON branch share a single source of truth —
 * `buildFilenameWithDate(EXPORT_FILENAME_PREFIXES.html, EXPORT_FILENAME_EXTENSIONS.html)`.
 */
export const EXPORT_FILENAME_EXTENSIONS = Object.freeze({
  html: 'html',
  json: 'json',
});

/**
 * §32.5.2 Item allow-list. Exactly these keys may appear on an exported item.
 * `lastAccessedAt` is optional per §32.5.2 — emitted iff `'lastAccessedAt'`
 * is an own-key on the input record (distinguishes "never accessed" absence
 * from "accessed at epoch 0" presence).
 *
 * R4 security-reviewer: every sanitizer / validator MUST iterate this
 * constant, never `Object.keys(input)` (C-7: allow-list semantics).
 */
export const ITEM_ALLOWED_FIELDS = Object.freeze([
  'id', 'title', 'url', 'groupId', 'sortOrder', 'createdAt', 'updatedAt',
]);

export const ITEM_ALLOWED_OPTIONAL_FIELDS = Object.freeze(['lastAccessedAt']);

/**
 * §32.5.3 Group allow-list. Exactly these keys may appear on an exported group.
 */
export const GROUP_ALLOWED_FIELDS = Object.freeze([
  'id', 'name', 'color', 'parentId', 'sortOrder', 'collapsed',
  'createdAt', 'updatedAt',
]);

/**
 * Shallow-copy a record, emitting ONLY the §32.5.2 Item allow-list keys.
 * Any input key not in the allow-list — runtime enrichments, tracking hints
 * (`favIconUrl` camelCase), future storage additions — is dropped
 * unconditionally. The optional `lastAccessedAt` key is included iff the
 * input record has it as an own-key (B-067 AC1 + §32.5.2).
 *
 * @param {Object} item
 * @returns {Object}
 */
export function sanitizeItem(item) {
  const out = {};
  if (!item || typeof item !== 'object') return out;
  for (const key of ITEM_ALLOWED_FIELDS) {
    if (key in item) out[key] = item[key];
  }
  for (const key of ITEM_ALLOWED_OPTIONAL_FIELDS) {
    if (key in item) out[key] = item[key];
  }
  return out;
}

/**
 * Shallow-copy a record, emitting ONLY the §32.5.3 Group allow-list keys.
 * Any input key not in the allow-list — including the non-persisted
 * `warning: DUPLICATE_NAME` response-only flag and any runtime decoration —
 * is dropped unconditionally (B-067 AC2 + §32.5.3).
 *
 * @param {Object} group
 * @returns {Object}
 */
export function sanitizeGroup(group) {
  const out = {};
  if (!group || typeof group !== 'object') return out;
  for (const key of GROUP_ALLOWED_FIELDS) {
    if (key in group) out[key] = group[key];
  }
  return out;
}
