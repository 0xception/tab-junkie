/**
 * MSG_IMPORT_COLLECTION dispatcher — B-044 (HTML) + B-045 (JSON, Wave 4).
 *
 * Consumes the validated MSG payload, routes on `format`, and runs the
 * two-round preview/commit protocol described in §33.4.
 *
 * Pure orchestration: parse is in html-parser.js (pure) / json-validator.js
 * (stub at v1); commit is in commit.js (single writeTransaction). This file
 * owns the top-level try/catch that normalises any parser throw to the
 * StorageError taxonomy in §33.11.
 */

import { parseNetscape } from './html-parser.js';
import { commitImport } from './commit.js';
import {
  StorageError,
  ERR_VALIDATION,
  ERR_INVALID_FORMAT,
  ERR_EMPTY_FILE,
} from '../../shared/errors.js';

/**
 * Top-level parser dispatch. Returns the normalized snapshot shape consumed
 * by commit.js. Never throws raw parser errors — everything is mapped to
 * StorageError codes per §33.11.
 *
 * @param {'html'|'json'} format
 * @param {string} content
 * @returns {{ items: Object[], groups: Object[], preferences?: Object,
 *             skipped: number, duplicateUrls: number }}
 */
function parseByFormat(format, content) {
  if (format === 'html') {
    // parseNetscape is pure. It throws StorageError(ERR_INVALID_FORMAT) on
    // doctype / root failure, which surfaces verbatim.
    const parsed = parseNetscape(content);
    return {
      items: parsed.items,
      groups: parsed.groups,
      skipped: parsed.skipped,
      duplicateUrls: parsed.duplicateUrls,
    };
  }
  // B-045 branch is deliberately not wired at v1 — reject with the same
  // ERR_INVALID_FORMAT code the payload validator would have thrown, so the
  // sidepanel toast copy stays consistent with every other parser-error path.
  throw new StorageError(
    ERR_INVALID_FORMAT,
    'JSON import is not yet supported (B-045 — Sprint 18 Wave 4).',
  );
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

  // Always parse. Preview and commit are two round-trips that each re-parse
  // the same content — see §33.4 "parse twice" decision.
  const parsed = parseByFormat(format, content);

  if (!commit) {
    // Preview: no storage mutation. Return counts so the sidepanel can render
    // the confirmation dialog before the second round-trip.
    return {
      previewOnly: true,
      itemsImported: parsed.items.length,
      groupsImported: parsed.groups.length,
      duplicatesSkipped: parsed.duplicateUrls || 0,
      skipped: parsed.skipped || 0,
    };
  }

  // Commit: single atomic writeTransaction replaces items/groups (+ prefs),
  // followed by transient-partition resets. Errors bubble as StorageError to
  // the dispatcher envelope.
  const { itemsImported, groupsImported } = await commitImport({
    items: parsed.items,
    groups: parsed.groups,
    preferences: parsed.preferences,
  });

  return {
    previewOnly: false,
    itemsImported,
    groupsImported,
    duplicatesSkipped: parsed.duplicateUrls || 0,
    skipped: parsed.skipped || 0,
  };
}
