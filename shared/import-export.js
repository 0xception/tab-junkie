/**
 * Import/export utilities for bookmarks and groups.
 * Pure functions — no Chrome API dependencies.
 */

// --- Export ---

export function generateNetscapeHTML(bookmarks, groups) {
  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  const topGroups = groups
    .filter(g => g.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const group of topGroups) {
    writeGroupFolder(lines, group, groups, bookmarks, 1);
  }

  // Ungrouped bookmarks at top level
  const ungrouped = bookmarks
    .filter(b => !b.groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const bm of ungrouped) {
    lines.push(`${indent(1)}<DT><A HREF="${escapeAttr(bm.url)}" ADD_DATE="${Math.floor((bm.createdAt || Date.now()) / 1000)}">${escapeHTML(bm.title)}</A>`);
  }

  lines.push('</DL><p>');
  return lines.join('\n');
}

function writeGroupFolder(lines, group, allGroups, allBookmarks, depth) {
  lines.push(`${indent(depth)}<DT><H3>${escapeHTML(group.name)}</H3>`);
  lines.push(`${indent(depth)}<DL><p>`);

  // Sub-groups
  const subGroups = allGroups
    .filter(g => g.parentId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const sub of subGroups) {
    writeGroupFolder(lines, sub, allGroups, allBookmarks, depth + 1);
  }

  // Bookmarks in this group
  const groupBookmarks = allBookmarks
    .filter(b => b.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const bm of groupBookmarks) {
    lines.push(`${indent(depth + 1)}<DT><A HREF="${escapeAttr(bm.url)}" ADD_DATE="${Math.floor((bm.createdAt || Date.now()) / 1000)}">${escapeHTML(bm.title)}</A>`);
  }

  lines.push(`${indent(depth)}</DL><p>`);
}

function indent(depth) {
  return '    '.repeat(depth);
}

function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function generateJunkieJSON(bookmarks, groups) {
  // Strip runtime-only fields
  const cleanBookmarks = bookmarks.map(b => {
    const { tabId, isOpen, isActive, tabLastAccessed, ...rest } = b;
    return rest;
  });

  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    bookmarks: cleanBookmarks,
    groups,
  }, null, 2);
}

// --- Import ---

export function detectFormat(content) {
  const trimmed = content.trim();
  if (trimmed.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>') ||
      trimmed.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1')) {
    return 'html';
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.version && parsed.bookmarks) return 'junkie-json';
  } catch {
    // not JSON
  }
  return 'unknown';
}

export function parseNetscapeHTML(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const groups = [];
  const bookmarks = [];

  const rootDL = doc.querySelector('dl');
  if (!rootDL) return { bookmarks, groups };

  walkDL(rootDL, null, 0, groups, bookmarks);
  return { bookmarks, groups };
}

function walkDL(dl, parentGroupId, depth, groups, bookmarks) {
  const children = dl.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.tagName !== 'DT') continue;

    const h3 = child.querySelector(':scope > h3');
    if (h3) {
      // This is a folder
      const effectiveParentId = depth >= 2 ? findTopAncestor(parentGroupId, groups) : parentGroupId;
      const groupId = crypto.randomUUID();
      const group = {
        id: groupId,
        name: h3.textContent.trim(),
        parentId: effectiveParentId,
        sortOrder: groups.filter(g => g.parentId === effectiveParentId).length,
        color: 'blue',
      };
      groups.push(group);

      const subDL = child.querySelector(':scope > dl');
      if (subDL) {
        walkDL(subDL, groupId, depth + 1, groups, bookmarks);
      }
    } else {
      const a = child.querySelector(':scope > a');
      if (a) {
        const url = a.getAttribute('href');
        if (!url || !isValidUrl(url)) continue;
        const addDate = a.getAttribute('add_date');
        const createdAt = addDate ? parseInt(addDate, 10) * 1000 : Date.now();

        // Flatten deep bookmarks to the nearest valid group
        const effectiveGroupId = depth >= 3 ? findTopAncestor(parentGroupId, groups) : parentGroupId;

        bookmarks.push({
          id: crypto.randomUUID(),
          title: a.textContent.trim() || url,
          url,
          groupId: effectiveGroupId,
          sortOrder: bookmarks.filter(b => b.groupId === effectiveGroupId).length,
          favicon: null,
          createdAt,
        });
      }
    }
  }
}

function findTopAncestor(groupId, groups) {
  if (!groupId) return null;
  const group = groups.find(g => g.id === groupId);
  if (!group) return groupId;
  if (group.parentId === null) return groupId;
  return group.parentId;
}

export function parseJunkieJSON(jsonString) {
  const data = JSON.parse(jsonString);
  if (!data.version || !Array.isArray(data.bookmarks)) {
    throw new Error('Invalid Tab Junkie export file');
  }
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const bookmarks = data.bookmarks;
  validateImportData(bookmarks, groups);
  return { bookmarks, groups };
}

// --- Validation ---

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'file:';
  } catch { return false; }
}

function validateImportData(bookmarks, groups) {
  const groupIds = new Set(groups.map(g => g.id));

  // Validate groups: required fields, no circular parentId
  for (const g of groups) {
    if (!g.id || typeof g.id !== 'string') throw new Error('Group missing id');
    if (typeof g.name !== 'string') throw new Error('Group missing name');
    if (g.parentId !== null && g.parentId !== undefined && !groupIds.has(g.parentId)) {
      // Orphaned sub-group — reparent to top level
      g.parentId = null;
    }
    if (typeof g.sortOrder !== 'number') g.sortOrder = 0;
  }

  // Detect circular parent references
  for (const g of groups) {
    const visited = new Set();
    let current = g;
    while (current?.parentId) {
      if (visited.has(current.id)) {
        // Break the cycle
        g.parentId = null;
        break;
      }
      visited.add(current.id);
      current = groups.find(p => p.id === current.parentId);
    }
  }

  // Validate bookmarks: required fields, safe URLs, valid groupIds
  for (const b of bookmarks) {
    if (!b.id || typeof b.id !== 'string') throw new Error('Bookmark missing id');
    if (!b.url || !isValidUrl(b.url)) throw new Error(`Invalid bookmark URL: ${b.url}`);
    if (typeof b.title !== 'string') b.title = b.url;
    if (typeof b.sortOrder !== 'number') b.sortOrder = 0;
    if (b.groupId && !groupIds.has(b.groupId)) b.groupId = null;
  }

  // Check for duplicate IDs
  const bookmarkIds = bookmarks.map(b => b.id);
  if (new Set(bookmarkIds).size !== bookmarkIds.length) {
    throw new Error('Duplicate bookmark IDs in import');
  }
  if (groupIds.size !== groups.length) {
    throw new Error('Duplicate group IDs in import');
  }
}
