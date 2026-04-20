/**
 * MSG_IMPORT_COLLECTION dispatcher — B-044 (HTML) + B-045 (JSON).
 *
 * Consumes the validated MSG payload, routes on `format`, and runs the
 * two-round preview/commit protocol described in §33.4.
 *
 * Pure orchestration: parse is in html-parser.js (pure) / json-validator.js
 * (pure). Commit is in commit.js (single writeTransaction). This file owns
 * the top-level try/catch that normalises any parser throw to the
 * StorageError taxonomy in §33.11.
 */

import { parseNetscape } from './html-parser.js';
import { parseAndValidate as parseJson } from './json-validator.js';
import { commitImport } from './commit.js';
import {
  StorageError,
  ERR_VALIDATION,
  ERR_EMPTY_FILE,
} from '../../shared/errors.js';

/**
 * Top-level parser dispatch. Returns the normalized snapshot shape consumed
 * by commit.js. Never throws raw parser errors — the parsers themselves
 * map to StorageError codes per §33.11; this function only translates
 * `format` → the appropriate parser.
 *
 * @param {'html'|'json'} format
 * @param {string} content
 * @returns {{ items: Object[], groups: Object[], preferences?: Object,
 *             skipped: number, duplicateUrls: number,
 *             repairs?: Object }}
 */
function parseByFormat(format, content) {
  if (format === 'html') {
    /* parseNetscape is pure. It throws StorageError(ERR_INVALID_FORMAT) on
       doctype / root failure, which surfaces verbatim. */
    const parsed = parseNetscape(content);
    return {
      items: parsed.items,
      groups: parsed.groups,
      skipped: parsed.skipped,
      duplicateUrls: parsed.duplicateUrls,
    };
  }
  /* format === 'json' — B-045 (Sprint 18 Wave 4). parseAndValidate owns
     JSON.parse + root-shape + schemaVersion + repair. It throws typed
     StorageError codes (ERR_INVALID_FORMAT, ERR_MALFORMED_ROOT,
     ERR_UNKNOWN_SCHEMA_VERSION, ERR_UNREPAIRABLE) per §33.11; those
     surface verbatim through the handler envelope. */
  const parsed = parseJson(content);
  return {
    items: parsed.items,
    groups: parsed.groups,
    preferences: parsed.preferences,
    skipped: parsed.skipped || 0,
    duplicateUrls: parsed.duplicateUrls || 0,
    repairs: parsed.repairs,
  };
}

/**
 * High-level import entry. Handler code calls this after payload validation
 * and the safe-mode / readyPromise gates upstream.
 *
 * @param {Object} args
 * @param {'html'|'json'} args.format
 * @param {string} args.content
 * @param {boolean} [args.commit]    When true, write via commitImport; when
 *                                     false / absent, return a preview.
 * @param {Object} [args.options]
 * @returns {Promise<Object>} ImportCollectionResponse (preview or commit variant).
 */
export async function importCollection({ format, content, commit, /* options */ }) {
  if (typeof content !== 'string' || content.length === 0) {
    throw new StorageError(ERR_EMPTY_FILE, 'File is empty');
  }
  if (format !== 'html' && format !== 'json') {
    throw new StorageError(ERR_VALIDATION, 'importCollection: unknown format');
  }

  /* Always parse. Preview and commit are two round-trips that each re-parse
     the same content — see §33.4 "parse twice" decision. */
  const parsed = parseByFormat(format, content);

  if (!commit) {
    /* Preview: no storage mutation. Return counts so the sidepanel can render
       the confirmation dialog before the second round-trip.
       B-045: include repair summary so the preview dialog can surface a
       "(X repairs applied)" footnote before the user confirms. */
    const response = {
      previewOnly: true,
      itemsImported: parsed.items.length,
      groupsImported: parsed.groups.length,
      duplicatesSkipped: parsed.duplicateUrls || 0,
      skipped: parsed.skipped || 0,
    };
    if (parsed.repairs) response.repairs = parsed.repairs;
    return response;
  }

  /* Commit: single atomic writeTransaction replaces items/groups (+ prefs),
     followed by transient-partition resets. Errors bubble as StorageError to
     the dispatcher envelope. */
  const { itemsImported, groupsImported } = await commitImport({
    items: parsed.items,
    groups: parsed.groups,
    preferences: parsed.preferences,
  });

  const response = {
    previewOnly: false,
    itemsImported,
    groupsImported,
    duplicatesSkipped: parsed.duplicateUrls || 0,
    skipped: parsed.skipped || 0,
  };
  if (parsed.repairs) response.repairs = parsed.repairs;
  return response;
}
