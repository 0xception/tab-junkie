/**
 * Netscape Bookmark File Format 1 (1996) builder — B-042.
 *
 * Consumes a pre-fetched snapshot of items + groups (read once in the message
 * handler, passed to this pure function). Produces a UTF-8 string the sidepanel
 * wraps into a Blob for download. No I/O, no chrome.* API usage.
 *
 * Covers SOLUTION_DESIGN §32.6:
 *   - §32.6.1 document skeleton
 *   - §32.6.2 body structure (Ungrouped folder first, then sorted groups)
 *   - §32.6.3 per-entry templates (folder + bookmark)
 *   - §32.6.4 timestamp conversion (epoch-ms → epoch-seconds)
 *   - §32.6.5 text- + attribute-context escaping
 *
 * Depth guard: storage enforces one level of nesting (`assertDepthAndCycle`
 * in groups.js). The builder still writes a defensive recursion that bails out
 * after depth 2, independent of the storage invariant, to survive any future
 * schema relaxation without leaking a runaway render.
 */

import { htmlEscape, toUnixSeconds } from './shared.js';

/** @typedef {import('../storage/shapes.js')} _shapes */

const HEADER =
  '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
  + '<!-- This is an automatically generated file.\n'
  + '     It will be read and overwritten.\n'
  + '     DO NOT EDIT! -->\n'
  + '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n'
  + '<TITLE>Bookmarks</TITLE>\n'
  + '<H1>Bookmarks Menu</H1>\n'
  + '<DL><p>\n';

const FOOTER = '</DL><p>\n';

const UNGROUPED_FOLDER_NAME = 'Ungrouped';

const MAX_GROUP_DEPTH = 2; // defensive guard — storage caps at depth 1 today

/**
 * Compare two groups by sortOrder ascending, then id ascending for stability.
 * @param {Object} a
 * @param {Object} b
 */
function compareBySortOrder(a, b) {
  const ao = Number.isFinite(a.sortOrder) ? a.sortOrder : 0;
  const bo = Number.isFinite(b.sortOrder) ? b.sortOrder : 0;
  if (ao !== bo) return ao - bo;
  const aid = String(a.id ?? '');
  const bid = String(b.id ?? '');
  if (aid < bid) return -1;
  if (aid > bid) return 1;
  return 0;
}

/**
 * Render a single bookmark entry.
 * @param {Object} item
 * @param {string} indent
 */
function renderItem(item, indent) {
  const href = htmlEscape(item.url || '');
  const title = htmlEscape(item.title || '');
  const added = toUnixSeconds(item.createdAt);
  const modified = toUnixSeconds(item.updatedAt);

  // §32.6.3 + §32.15: emit ICON only when a non-empty string faviconUrl is
  // actually present on the record. Today's storage schema does not carry
  // this field, so the branch never fires in production — but it is ready
  // for the forward-looking storage addition noted in §32.15.
  let iconAttr = '';
  if ('faviconUrl' in item && typeof item.faviconUrl === 'string' && item.faviconUrl.length > 0) {
    iconAttr = ` ICON="${htmlEscape(item.faviconUrl)}"`;
  }

  return `${indent}<DT><A HREF="${href}" ADD_DATE="${added}" LAST_MODIFIED="${modified}"${iconAttr}>${title}</A>\n`;
}

/**
 * Render a folder (group) and everything nested inside it.
 * @param {Object} group
 * @param {Map<string, Object[]>} itemsByGroupId
 * @param {Map<string|null, Object[]>} childrenByParentId
 * @param {string} indent
 * @param {number} depth
 */
function renderFolder(group, itemsByGroupId, childrenByParentId, indent, depth) {
  if (depth > MAX_GROUP_DEPTH) {
    /* L-2: record the skip so a future schema relaxation is observable in dev.
       Log the group ID only — never the name or any item title/URL (§AC11). */
    console.warn('buildHtmlExport: group depth exceeded, skipping', group && group.id);
    return '';
  }

  const name = htmlEscape(group.name || '');
  const added = toUnixSeconds(group.createdAt);
  const modified = toUnixSeconds(group.updatedAt);
  const bodyIndent = indent + '  ';

  const parts = [];
  parts.push(`${indent}<DT><H3 ADD_DATE="${added}" LAST_MODIFIED="${modified}">${name}</H3>\n`);
  parts.push(`${indent}<DL><p>\n`);

  const items = itemsByGroupId.get(group.id) || [];
  const sortedItems = [...items].sort(compareBySortOrder);
  for (const item of sortedItems) {
    parts.push(renderItem(item, bodyIndent));
  }

  const children = childrenByParentId.get(group.id) || [];
  const sortedChildren = [...children].sort(compareBySortOrder);
  for (const child of sortedChildren) {
    parts.push(renderFolder(child, itemsByGroupId, childrenByParentId, bodyIndent, depth + 1));
  }

  parts.push(`${indent}</DL><p>\n`);
  return parts.join('');
}

/**
 * Render the Netscape HTML body for a collection snapshot.
 *
 * @param {{items: Object[], groups: Object[]}} params
 * @returns {string} Complete UTF-8 HTML document.
 */
export function buildHtmlExport({ items, groups }) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeGroups = Array.isArray(groups) ? groups : [];

  // Pre-compute the set of live group IDs so orphan items (groupId references
  // a deleted group) can be partitioned into Ungrouped. Mirrors the B-006 AC5
  // group-delete cascade behavior on read; prevents silent data loss (Q-H1).
  const liveGroupIds = new Set();
  for (const group of safeGroups) {
    if (group && typeof group === 'object' && group.id != null) {
      liveGroupIds.add(group.id);
    }
  }

  // Bucket items by groupId once; null or unresolved groupId → Ungrouped.
  /** @type {Map<string|null, Object[]>} */
  const itemsByGroupId = new Map();
  const ungrouped = [];
  for (const item of safeItems) {
    if (!item || typeof item !== 'object') continue;
    if (item.groupId == null || !liveGroupIds.has(item.groupId)) {
      // Null group OR orphan (group was deleted): render under Ungrouped so
      // no user-saved record is dropped from the export (AC11 privacy — all
      // saved data must survive round-trip).
      ungrouped.push(item);
      continue;
    }
    if (!itemsByGroupId.has(item.groupId)) itemsByGroupId.set(item.groupId, []);
    itemsByGroupId.get(item.groupId).push(item);
  }

  // Bucket groups by parentId so renderFolder can recurse without scanning.
  /** @type {Map<string|null, Object[]>} */
  const childrenByParentId = new Map();
  for (const group of safeGroups) {
    if (!group || typeof group !== 'object') continue;
    const parent = group.parentId == null ? null : group.parentId;
    if (!childrenByParentId.has(parent)) childrenByParentId.set(parent, []);
    childrenByParentId.get(parent).push(group);
  }

  const parts = [HEADER];
  const indent = '  ';
  const innerIndent = indent + '  ';

  // §32.6.2 — Ungrouped folder emitted first, iff non-empty.
  // M-2: emit synthetic ADD_DATE="0" / LAST_MODIFIED="0" so Firefox and other
  // strict importers accept the folder header. Matches browser convention for
  // the "Other Bookmarks" virtual folder when timestamps are unavailable.
  if (ungrouped.length > 0) {
    const sortedUngrouped = [...ungrouped].sort(compareBySortOrder);
    parts.push(`${indent}<DT><H3 ADD_DATE="0" LAST_MODIFIED="0">${htmlEscape(UNGROUPED_FOLDER_NAME)}</H3>\n`);
    parts.push(`${indent}<DL><p>\n`);
    for (const item of sortedUngrouped) {
      parts.push(renderItem(item, innerIndent));
    }
    parts.push(`${indent}</DL><p>\n`);
  }

  // Top-level groups (parentId === null) in sortOrder.
  const topLevel = [...(childrenByParentId.get(null) || [])].sort(compareBySortOrder);
  for (const group of topLevel) {
    parts.push(renderFolder(group, itemsByGroupId, childrenByParentId, indent, 1));
  }

  parts.push(FOOTER);
  return parts.join('');
}

/**
 * Count the non-empty groups exported (per B-042 AC7 toast copy). "Non-empty"
 * means the group contains at least one direct item; sub-groups without items
 * are not counted. The Ungrouped folder counts only if it has items.
 *
 * @param {{items: Object[], groups: Object[]}} params
 * @returns {number}
 */
export function countNonEmptyGroupsForHtml({ items, groups }) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeGroups = Array.isArray(groups) ? groups : [];
  // Mirror buildHtmlExport: orphan items (groupId references a deleted group)
  // render under Ungrouped, so they must count toward the Ungrouped bucket for
  // toast accuracy (Q-H1).
  const liveGroupIds = new Set();
  for (const group of safeGroups) {
    if (group && typeof group === 'object' && group.id != null) {
      liveGroupIds.add(group.id);
    }
  }
  /** @type {Map<string|null, number>} */
  const itemCountByGroup = new Map();
  let ungroupedCount = 0;
  for (const item of safeItems) {
    if (!item || typeof item !== 'object') continue;
    if (item.groupId == null || !liveGroupIds.has(item.groupId)) {
      ungroupedCount++;
      continue;
    }
    itemCountByGroup.set(item.groupId, (itemCountByGroup.get(item.groupId) || 0) + 1);
  }
  let count = 0;
  if (ungroupedCount > 0) count++;
  for (const group of safeGroups) {
    if (!group || typeof group !== 'object') continue;
    if ((itemCountByGroup.get(group.id) || 0) > 0) count++;
  }
  return count;
}
