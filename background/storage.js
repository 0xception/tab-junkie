/**
 * Storage manager for bookmarks, groups, and preferences.
 * Wraps chrome.storage.local with typed CRUD operations.
 * Accepts chrome object as dependency for testability.
 */
export function createStorage(chrome) {
  const KEYS = {
    BOOKMARKS: 'junkie_bookmarks',
    GROUPS: 'junkie_groups',
    PREFERENCES: 'junkie_preferences',
    PINNED_TABS: 'junkie_pinned_tabs',
  };

  function generateId() {
    return crypto.randomUUID();
  }

  async function _get(key) {
    const result = await chrome.storage.local.get([key]);
    return result[key];
  }

  async function _set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  }

  // --- Bookmarks ---

  async function getBookmarks() {
    return (await _get(KEYS.BOOKMARKS)) || [];
  }

  function isValidUrl(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'file:';
    } catch { return false; }
  }

  async function addBookmark({ title, url, groupId, favicon = null, afterBookmarkId }) {
    if (!isValidUrl(url)) throw new Error(`Invalid URL: ${url}`);
    const bookmarks = await getBookmarks();

    const groupBookmarks = bookmarks.filter(b => b.groupId === groupId);
    let sortOrder;

    if (afterBookmarkId) {
      // Insert right after the referenced bookmark
      const afterBookmark = groupBookmarks.find(b => b.id === afterBookmarkId);
      if (afterBookmark) {
        sortOrder = afterBookmark.sortOrder + 1;
        for (const b of groupBookmarks) {
          if (b.sortOrder >= sortOrder) b.sortOrder++;
        }
      } else {
        sortOrder = groupBookmarks.length;
      }
    } else {
      // Append to end of group
      sortOrder = groupBookmarks.length;
    }

    const bookmark = {
      id: generateId(),
      title,
      url,
      groupId: groupId || null,
      sortOrder,
      favicon,
      createdAt: Date.now(),
    };

    bookmarks.push(bookmark);
    await _set(KEYS.BOOKMARKS, bookmarks);
    return bookmark;
  }

  async function removeBookmark(id) {
    const bookmarks = await getBookmarks();
    const filtered = bookmarks.filter(b => b.id !== id);
    await _set(KEYS.BOOKMARKS, filtered);
  }

  async function updateBookmark(id, updates) {
    const bookmarks = await getBookmarks();
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) return;

    if ('url' in updates && !isValidUrl(updates.url)) {
      throw new Error(`Invalid URL: ${updates.url}`);
    }
    const allowed = ['title', 'url', 'favicon', 'lastAccessedAt'];
    for (const key of allowed) {
      if (key in updates) {
        bookmarks[index][key] = updates[key];
      }
    }

    await _set(KEYS.BOOKMARKS, bookmarks);
  }

  async function touchBookmark(id) {
    const bookmarks = await getBookmarks();
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) return;
    bookmarks[index].lastAccessedAt = Date.now();
    await _set(KEYS.BOOKMARKS, bookmarks);
  }

  async function moveBookmark(id, groupId, sortOrder) {
    const bookmarks = await getBookmarks();
    const index = bookmarks.findIndex(b => b.id === id);
    if (index === -1) return;

    bookmarks[index].groupId = groupId;
    bookmarks[index].sortOrder = sortOrder;
    await _set(KEYS.BOOKMARKS, bookmarks);
  }

  // --- Groups ---

  async function getGroups() {
    return (await _get(KEYS.GROUPS)) || [];
  }

  async function addGroup({ name, parentId, color }) {
    const groups = await getGroups();

    // Enforce max one level of nesting
    if (parentId) {
      const parent = groups.find(g => g.id === parentId);
      if (parent && parent.parentId !== null) {
        throw new Error('Maximum one level of nesting allowed');
      }
    }

    // Compute sortOrder: last among siblings
    const siblings = groups.filter(g => g.parentId === (parentId || null));
    const sortOrder = siblings.length;

    const group = {
      id: generateId(),
      name,
      parentId: parentId || null,
      sortOrder,
      color,
    };

    groups.push(group);
    await _set(KEYS.GROUPS, groups);
    return group;
  }

  async function removeGroup(id) {
    const groups = await getGroups();
    // Remove the group and any sub-groups
    const filtered = groups.filter(g => g.id !== id && g.parentId !== id);
    await _set(KEYS.GROUPS, filtered);
  }

  async function updateGroup(id, updates) {
    const groups = await getGroups();
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return;

    const allowed = ['name', 'color', 'sortOrder'];
    for (const key of allowed) {
      if (key in updates) {
        groups[index][key] = updates[key];
      }
    }

    await _set(KEYS.GROUPS, groups);
  }

  async function moveGroup(id, parentId, sortOrder) {
    const groups = await getGroups();
    const index = groups.findIndex(g => g.id === id);
    if (index === -1) return;

    // Enforce nesting constraint
    if (parentId) {
      const parent = groups.find(g => g.id === parentId);
      if (parent && parent.parentId !== null) {
        throw new Error('Maximum one level of nesting allowed');
      }
      // Can't nest a group that has sub-groups
      const hasChildren = groups.some(g => g.parentId === id);
      if (hasChildren) {
        throw new Error('Cannot nest a group that has sub-groups');
      }
    }

    groups[index].parentId = parentId || null;
    groups[index].sortOrder = sortOrder;
    await _set(KEYS.GROUPS, groups);
  }

  // --- Preferences ---

  async function getPreferences() {
    return (await _get(KEYS.PREFERENCES)) || {};
  }

  async function getPreference(key) {
    const prefs = await getPreferences();
    return prefs[key];
  }

  async function setPreference(key, value) {
    const prefs = await getPreferences();
    prefs[key] = value;
    await _set(KEYS.PREFERENCES, prefs);
  }

  // --- Pinned Tabs ---
  // Stores tabId → groupId mappings so floating tabs survive extension reloads

  async function getPinnedTabs() {
    return (await _get(KEYS.PINNED_TABS)) || {};
  }

  async function setPinnedTabs(pinnedMap) {
    await _set(KEYS.PINNED_TABS, pinnedMap);
  }

  return {
    getBookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
    touchBookmark,
    moveBookmark,
    getGroups,
    addGroup,
    removeGroup,
    updateGroup,
    moveGroup,
    getPreferences,
    getPreference,
    setPreference,
    getPinnedTabs,
    setPinnedTabs,
    setBookmarks: (bookmarks) => _set(KEYS.BOOKMARKS, bookmarks),
    setGroups: (groups) => _set(KEYS.GROUPS, groups),
    replaceAll: (bookmarks, groups) => chrome.storage.local.set({
      [KEYS.BOOKMARKS]: bookmarks,
      [KEYS.GROUPS]: groups,
    }),
  };
}
