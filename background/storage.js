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

  async function addBookmark({ title, url, groupId, favicon = null }) {
    const bookmarks = await getBookmarks();

    // Compute sortOrder: last in the group
    const groupBookmarks = bookmarks.filter(b => b.groupId === groupId);
    const sortOrder = groupBookmarks.length;

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

    // Only allow updating specific fields
    const allowed = ['title', 'url', 'favicon'];
    for (const key of allowed) {
      if (key in updates) {
        bookmarks[index][key] = updates[key];
      }
    }

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

  return {
    getBookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
    moveBookmark,
    getGroups,
    addGroup,
    removeGroup,
    updateGroup,
    moveGroup,
    getPreferences,
    getPreference,
    setPreference,
  };
}
