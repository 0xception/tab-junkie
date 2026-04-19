/**
 * Frozen export-schema constants for B-042 (HTML) and B-043 (JSON).
 *
 * Kept in `shared/` — not `background/export/` — so the future B-045 importer
 * (which lives alongside the sidepanel upload UI) can consume the exact same
 * symbols without forking the schema.
 *
 * Per SOLUTION_DESIGN §32.5, additive field changes on the Item / Group
 * records do NOT bump EXPORT_SCHEMA_VERSION. The version only increments on
 * incompatible shape changes (field rename, type change, semantic flip).
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
