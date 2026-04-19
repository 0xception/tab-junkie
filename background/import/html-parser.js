/**
 * Netscape Bookmark File Format 1 parser — B-044.
 *
 * Pure function. Input: raw UTF-8 text. Output: normalized
 * `{ items, groups, skipped, duplicateUrls }` where every item and group has
 * a freshly-minted ULID (§33.8). No chrome.* API, no storage writes, no DOM.
 *
 * Context: §33.5 of the R2 design called for `DOMParser('text/html')`. That
 * API does NOT exist inside a MV3 service worker (no `DOMParser`, no `window`,
 * no DOM). Rather than split the parser between sidepanel (with DOMParser)
 * and SW (validator-only) — which would fork the parse logic across two
 * execution contexts and double the R4 review surface — this implementation
 * hand-rolls a dedicated Netscape tokenizer. The tokenizer is:
 *
 *   1. Scoped to the Netscape 1996 subset the export side emits — DT, DL, A,
 *      H3 with ADD_DATE / LAST_MODIFIED / HREF / ICON attrs. No full HTML5
 *      parsing surface.
 *   2. Explicitly text-only (never evaluates script-capable markup). Titles
 *      flow through an HTML-entity decoder that recognises the five named
 *      entities emitted by B-042 (&amp;, &lt;, &gt;, &quot;, &#39;) plus any
 *      numeric character reference. Anything outside that set passes through
 *      as a literal character — safe for AC15's XSS probes.
 *   3. Tolerant to whitespace, missing `<p>` sentinels that the Netscape spec
 *      emits but many exporters skip, case-insensitive tag names, and nested
 *      folder structures (depth flattening per AC6).
 *
 * The parser is pure: no `innerHTML`, no `eval`, no `new Function`, no DOM.
 *
 * R4 security-reviewer contract: any input string is safe to pass here. Even
 * on the most adversarial input the output shape is bounded — items/groups
 * are validated later by the commit-side allow-list pass and the storage
 * shape validators. See §33.5 XSS probe for the threat model.
 */

import { ulid } from '../storage/ids.js';
import { normalizeUrl } from '../../shared/url.js';
import { MAX_TITLE, MAX_URL, MAX_NAME } from '../storage/shapes.js';
import { GROUP_COLORS } from '../../shared/constants.js';
import { StorageError, ERR_INVALID_FORMAT } from '../../shared/errors.js';

/* =========================================================================
 * Tokenizer
 * ========================================================================= */

/** Regex-pair table of the tags we consume. Case-insensitive on tag name. */
const TOKEN_RE = /<\/?\s*(dl|dt|h3|a)\b([^>]*)>/gi;

/**
 * Parse a string of HTML attributes into a Map<uppercased-name, value>. The
 * Netscape exporter always emits quoted values, but we tolerate unquoted +
 * single-quoted values for cross-exporter friendliness. Attribute names are
 * upper-cased for downstream access — HREF / ADD_DATE / LAST_MODIFIED / ICON.
 *
 * Never evaluates markup. Pure string operation.
 *
 * @param {string} raw — substring between the tag name and the trailing `>`
 * @returns {Map<string, string>}
 */
function parseAttrs(raw) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!raw) return out;
  // Match attr="value" | attr='value' | attr=value | attr
  const re = /\s+([a-zA-Z_:][a-zA-Z0-9_:.\-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toUpperCase();
    const value = m[2] !== undefined
      ? m[2]
      : m[3] !== undefined
        ? m[3]
        : m[4] !== undefined
          ? m[4]
          : '';
    out.set(name, decodeHtmlEntities(value));
  }
  return out;
}

/** Decode the small set of HTML entities our parser accepts. */
const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
});

function decodeHtmlEntities(raw) {
  if (typeof raw !== 'string' || raw.indexOf('&') === -1) return raw;
  return raw.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body) => {
    if (body[0] === '#') {
      let cp;
      if (body[1] === 'x' || body[1] === 'X') {
        cp = parseInt(body.slice(2), 16);
      } else {
        cp = parseInt(body.slice(1), 10);
      }
      if (Number.isFinite(cp) && cp >= 0 && cp <= 0x10FFFF) {
        try {
          return String.fromCodePoint(cp);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named !== undefined ? named : match;
  });
}

/** Strip leading/trailing whitespace and inner runs of whitespace to a single space. */
function collapseWhitespace(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract `<DT>` records out of the token stream between two indices,
 * distinguishing folder headers (H3 followed by DL) from leaf anchors (A).
 * @param {string} input
 * @returns {Array<{kind: 'anchor' | 'folder', openIdx: number, closeIdx: number,
 *                   innerStart: number, innerEnd: number, attrs: Map<string,string>,
 *                   text: string}>}
 *   For anchors, innerStart/innerEnd are never used. For folders, they span
 *   the folder's inner `<DL>` body (content between `<DL>` and matching `</DL>`).
 */
function tokenize(input) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    const raw = m[0];
    const tag = m[1].toLowerCase();
    const body = m[2] || '';
    const closing = raw[1] === '/';
    tokens.push({
      tag,
      closing,
      attrs: closing ? null : parseAttrs(body),
      start: m.index,
      end: TOKEN_RE.lastIndex,
    });
  }
  return tokens;
}

/**
 * Build a list of records inside an `<DL>` body, preserving document order.
 * Each `<DT>` has either:
 *   - a direct `<H3>` child → FOLDER (nested `<DL>` follows the closing </H3>)
 *   - a direct `<A>` child  → ANCHOR (leaf bookmark)
 * Other `<DT>` content is ignored (forward-compat — see AC19).
 *
 * Recursive: nested folders are parsed by calling `parseDlBody` on the inner DL.
 *
 * @param {string} input — full document
 * @param {Array} tokens — tokenize(input) output
 * @param {number} tokenStart — inclusive
 * @param {number} tokenEnd — exclusive
 * @returns {Array<{kind: 'anchor' | 'folder', anchor?: {attrs: Map, text: string},
 *                   folder?: {attrs: Map, text: string, bodyStart: number, bodyEnd: number}}>}
 */
function parseDlBody(input, tokens, tokenStart, tokenEnd) {
  /** @type {Array<Object>} */
  const out = [];
  let i = tokenStart;
  while (i < tokenEnd) {
    const tok = tokens[i];
    // We care about <DT> openers — each DT introduces one record.
    if (tok.tag === 'dt' && !tok.closing) {
      // Peek ahead for the first H3 or A that appears before the next DT / DL / </DL>.
      let j = i + 1;
      let kind = null;
      let recordStartTok = null;
      while (j < tokenEnd) {
        const t = tokens[j];
        if (t.tag === 'dt' && !t.closing) break;
        if (t.tag === 'dl' && !t.closing) break;
        if (t.tag === 'dl' && t.closing) break;
        if (t.tag === 'a' && !t.closing) { kind = 'anchor'; recordStartTok = t; break; }
        if (t.tag === 'h3' && !t.closing) { kind = 'folder'; recordStartTok = t; break; }
        j += 1;
      }
      if (kind === 'anchor') {
        // Find the matching </A>.
        let close = j + 1;
        while (close < tokenEnd && !(tokens[close].tag === 'a' && tokens[close].closing)) {
          close += 1;
        }
        const textStart = recordStartTok.end;
        const textEnd = close < tokenEnd ? tokens[close].start : input.length;
        const rawText = input.slice(textStart, textEnd);
        const text = collapseWhitespace(decodeHtmlEntities(stripTags(rawText)));
        out.push({ kind: 'anchor', anchor: { attrs: recordStartTok.attrs, text } });
        i = (close < tokenEnd ? close : tokenEnd) + 1;
        continue;
      }
      if (kind === 'folder') {
        // Find matching </H3>
        let closeH3 = j + 1;
        while (closeH3 < tokenEnd && !(tokens[closeH3].tag === 'h3' && tokens[closeH3].closing)) {
          closeH3 += 1;
        }
        const nameStart = recordStartTok.end;
        const nameEnd = closeH3 < tokenEnd ? tokens[closeH3].start : input.length;
        const rawName = input.slice(nameStart, nameEnd);
        const text = collapseWhitespace(decodeHtmlEntities(stripTags(rawName)));
        // Find matching <DL> ... </DL> that follows this H3. The DL may be on
        // the next token. We match nested DL depth.
        let dlOpen = closeH3 + 1;
        while (dlOpen < tokenEnd && !(tokens[dlOpen].tag === 'dl' && !tokens[dlOpen].closing)) {
          dlOpen += 1;
        }
        let bodyStart = dlOpen;
        let bodyEnd = dlOpen;
        if (dlOpen < tokenEnd) {
          // Match </DL> with depth counter.
          let depth = 1;
          let k = dlOpen + 1;
          while (k < tokenEnd) {
            if (tokens[k].tag === 'dl') {
              if (tokens[k].closing) {
                depth -= 1;
                if (depth === 0) { bodyEnd = k; break; }
              } else {
                depth += 1;
              }
            }
            k += 1;
          }
          bodyStart = dlOpen + 1;
          bodyEnd = k < tokenEnd ? k : tokenEnd;
        }
        out.push({
          kind: 'folder',
          folder: { attrs: recordStartTok.attrs, text, bodyStart, bodyEnd },
        });
        i = bodyEnd + 1;
        continue;
      }
      // Unknown DT content — skip ahead past any known terminators.
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Strip *any* HTML tag markup (including script-like markup) from a string.
 * Used only on title-extraction text where entities have already been decoded
 * with the narrow entity map. Defence-in-depth: even if an adversarial export
 * includes raw `<script>` tags, this pass removes them before the title
 * reaches `.textContent`-equivalent downstream.
 */
function stripTags(raw) {
  return String(raw).replace(/<[^>]*>/g, '');
}

/* =========================================================================
 * Timestamp conversion (AC9)
 * ========================================================================= */

/** Max allowed ADD_DATE / LAST_MODIFIED value in seconds. Jan 1 2100 UTC. */
const MAX_UNIX_SECONDS = 4102444800;

/**
 * Convert an attribute string (unix-seconds) to epoch-ms. Missing, non-numeric,
 * or out-of-range values fall back to `Date.now()` — per AC9, they do NOT
 * skip the entry.
 * @param {string | undefined} raw
 * @returns {number}
 */
function attrToEpochMs(raw) {
  if (raw === undefined || raw === null || raw === '') return Date.now();
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > MAX_UNIX_SECONDS) return Date.now();
  return n * 1000;
}

/* =========================================================================
 * Deterministic group color (AC8)
 * ========================================================================= */

/**
 * djb2 string hash. Keeps the output non-negative by masking with 0xFFFFFFFF.
 * Identical displayName → identical index → identical palette color.
 */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = (((h << 5) + h) + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Map a final group displayName to a `GROUP_COLORS` entry.
 * @param {string} displayName
 * @returns {string}
 */
function deterministicGroupColor(displayName) {
  const idx = djb2(displayName) % GROUP_COLORS.length;
  return GROUP_COLORS[idx];
}

/* =========================================================================
 * Entry point
 * ========================================================================= */

/**
 * Parse a Netscape bookmarks file string into the normalized import snapshot.
 *
 * @param {string} content — raw UTF-8 file text
 * @returns {{
 *   items: Array<{ id: string, title: string, url: string, groupId: string|null,
 *                  sortOrder: number, createdAt: number, updatedAt: number }>,
 *   groups: Array<{ id: string, name: string, color: string, parentId: string|null,
 *                   sortOrder: number, collapsed: boolean, createdAt: number, updatedAt: number }>,
 *   skipped: number,
 *   duplicateUrls: number,
 * }}
 * @throws {StorageError} ERR_INVALID_FORMAT on doctype / root `<DL>` missing.
 */
export function parseNetscape(content) {
  if (typeof content !== 'string' || content.length === 0) {
    throw new StorageError(ERR_INVALID_FORMAT, 'Not a Netscape bookmarks file');
  }

  /* AC3: doctype recognition. Accept leading whitespace (various exporters
     add BOM / blank lines) and match case-insensitively. Missing → clean error
     toast per §33.11 ERR_INVALID_FORMAT; no mutation. */
  const doctypeMatch = content.match(/^\s*(?:\uFEFF)?<!DOCTYPE\s+NETSCAPE-Bookmark-file-1\s*>/i);
  if (!doctypeMatch) {
    throw new StorageError(ERR_INVALID_FORMAT, 'Not a Netscape bookmarks file');
  }

  const tokens = tokenize(content);
  // Find the root `<DL>`.
  const rootOpenIdx = tokens.findIndex((t) => t.tag === 'dl' && !t.closing);
  if (rootOpenIdx === -1) {
    throw new StorageError(ERR_INVALID_FORMAT, 'No <DL> root found');
  }
  // Find the matching root </DL>.
  let depth = 1;
  let rootCloseIdx = rootOpenIdx + 1;
  while (rootCloseIdx < tokens.length) {
    const t = tokens[rootCloseIdx];
    if (t.tag === 'dl') {
      if (t.closing) {
        depth -= 1;
        if (depth === 0) break;
      } else {
        depth += 1;
      }
    }
    rootCloseIdx += 1;
  }
  if (rootCloseIdx >= tokens.length) rootCloseIdx = tokens.length;

  /** @type {Array<Object>} */
  const items = [];
  /** @type {Array<Object>} */
  const groups = [];
  const seenUrls = new Set();
  let skipped = 0;
  let duplicateUrls = 0;

  /** @type {Map<string, number>} groupId → next sortOrder inside the group */
  const sortOrderByGroup = new Map();
  function nextSortOrder(groupKey) {
    const k = groupKey == null ? '__null__' : groupKey;
    const n = sortOrderByGroup.get(k) ?? 0;
    sortOrderByGroup.set(k, n + 1);
    return n;
  }

  /**
   * Recursively walk a DL body.
   * @param {number} startTokenIdx — exclusive of the `<DL>` opener
   * @param {number} endTokenIdx   — inclusive stop (matching `</DL>`)
   * @param {string[]} ancestorNames — chain of folder names from root (for flattening)
   * @param {string|null} topLevelGroupId — id of the depth-1 group for this branch,
   *                                         or null when walking at depth 0.
   * @param {string|null} currentGroupId — groupId to assign direct anchors to.
   */
  function walk(startTokenIdx, endTokenIdx, ancestorNames, topLevelGroupId, currentGroupId) {
    const records = parseDlBody(content, tokens, startTokenIdx, endTokenIdx);
    for (const rec of records) {
      if (rec.kind === 'anchor') {
        const a = rec.anchor;
        const href = a.attrs.get('HREF') || '';
        // (a) AC10: no HREF → skip
        if (!href) { skipped += 1; continue; }
        let normalizedUrl;
        try {
          normalizedUrl = normalizeUrl(href, { forStorage: true });
        } catch {
          // (b) AC10 + AC15: javascript: / data: / other bad scheme → skip
          skipped += 1;
          continue;
        }
        if (normalizedUrl.length > MAX_URL) { skipped += 1; continue; }

        // (c) AC10: title fallback
        let title = a.text;
        if (!title || !title.trim()) {
          // URL-derived fallback: use the href (pre-normalization) up to MAX_TITLE
          title = normalizedUrl;
        }
        if (!title || !title.trim()) { skipped += 1; continue; }
        // AC10 (d) — truncate, do NOT skip on oversize
        if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE);

        // AC11: duplicate-URL skip default
        if (seenUrls.has(normalizedUrl)) {
          duplicateUrls += 1;
          continue;
        }
        seenUrls.add(normalizedUrl);

        const createdAt = attrToEpochMs(a.attrs.get('ADD_DATE'));
        const updatedAt = attrToEpochMs(a.attrs.get('LAST_MODIFIED'));

        items.push({
          id: ulid(),
          title,
          url: normalizedUrl,
          groupId: currentGroupId,
          sortOrder: nextSortOrder(currentGroupId),
          createdAt,
          updatedAt,
        });
        continue;
      }
      // Folder record.
      const f = rec.folder;
      const childName = (f.text && f.text.trim()) ? f.text.trim() : 'Folder';
      // AC6 flattening:
      //   depth 0 recursion (no ancestors) → top-level group, parentId = null
      //   depth 1 recursion → sub-group, parentId = topLevelGroupId
      //   depth ≥ 2 recursion → flatten: displayName = ancestors.join(' / '),
      //                         parent = topLevelGroupId
      let displayName;
      let parentId;
      let newTopLevelGroupId = topLevelGroupId;
      if (ancestorNames.length === 0) {
        displayName = childName;
        parentId = null;
      } else if (ancestorNames.length === 1) {
        displayName = childName;
        parentId = topLevelGroupId;
      } else {
        // Flatten: names from depth-2 downward, joined by ' / '
        const flattenedPath = [...ancestorNames.slice(1), childName].join(' / ');
        displayName = flattenedPath;
        parentId = topLevelGroupId;
      }
      // AC8: truncate to MAX_NAME to satisfy storage shape — silent truncate,
      // not skip (consistent with title truncation).
      if (displayName.length > MAX_NAME) displayName = displayName.slice(0, MAX_NAME);

      const gId = ulid();
      const groupRecord = {
        id: gId,
        name: displayName,
        color: deterministicGroupColor(displayName),
        parentId,
        sortOrder: nextSortOrder(parentId),
        collapsed: false,
        createdAt: attrToEpochMs(f.attrs.get('ADD_DATE')),
        updatedAt: attrToEpochMs(f.attrs.get('LAST_MODIFIED')),
      };
      groups.push(groupRecord);

      if (ancestorNames.length === 0) {
        newTopLevelGroupId = gId;
      }

      walk(
        f.bodyStart,
        f.bodyEnd,
        [...ancestorNames, childName],
        newTopLevelGroupId,
        gId,
      );
    }
  }

  // AC7: top-level `<A>` entries (no enclosing <H3>) import with groupId = null.
  walk(rootOpenIdx + 1, rootCloseIdx, [], null, null);

  return { items, groups, skipped, duplicateUrls };
}
