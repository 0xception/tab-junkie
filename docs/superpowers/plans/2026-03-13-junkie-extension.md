# Junkie Extension Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome/Edge extension that unifies bookmarks and open tabs into a single organized view with color-coded groups, derived open/closed status, and a fuzzy search popup launcher.

**Architecture:** Vanilla JS + Web Components, no build step. Service worker manages state (storage + tab matching) and broadcasts to two UI surfaces: a side panel (full tree view with drag-and-drop) and a popup (fuzzy search quick-launcher). Data stored in `chrome.storage.local`.

**Tech Stack:** Vanilla JS, Web Components, Manifest V3, SortableJS, Fuse.js, Node.js built-in test runner (for unit tests)

**Spec:** `docs/superpowers/specs/2026-03-13-junkie-extension-design.md`

---

## Chunk 1: Project Scaffolding & Data Layer

### Task 1: Project Scaffolding

**Files:**
- Create: `manifest.json`
- Create: `shared/messages.js`
- Create: `shared/styles.css`
- Create: `.gitignore`
- Create: `icons/` (placeholder icons)

- [ ] **Step 1: Create manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Junkie",
  "description": "Unified bookmark and tab manager",
  "version": "0.1.0",
  "permissions": ["tabs", "storage", "sidePanel"],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create shared/messages.js**

Message type constants used by both background and UI layers:

```js
// Message types for chrome.runtime communication
export const MSG = {
  // Requests from UI → background
  GET_STATE: 'get-state',
  ADD_BOOKMARK: 'add-bookmark',
  REMOVE_BOOKMARK: 'remove-bookmark',
  UPDATE_BOOKMARK: 'update-bookmark',
  MOVE_BOOKMARK: 'move-bookmark',
  ADD_GROUP: 'add-group',
  REMOVE_GROUP: 'remove-group',
  UPDATE_GROUP: 'update-group',
  MOVE_GROUP: 'move-group',
  SET_PREFERENCE: 'set-preference',
  NAVIGATE_TO: 'navigate-to',
  CLOSE_TAB: 'close-tab',

  // Broadcasts from background → UI
  STATE_UPDATED: 'state-updated',
};

// Group color palette
export const GROUP_COLORS = [
  { name: 'Blue', value: '#5b91cf' },
  { name: 'Purple', value: '#b45bcf' },
  { name: 'Teal', value: '#5bcfbc' },
  { name: 'Red', value: '#cf5b5b' },
  { name: 'Orange', value: '#cf8a5b' },
  { name: 'Pink', value: '#cf5b91' },
  { name: 'Indigo', value: '#7b5bcf' },
  { name: 'Slate', value: '#8899aa' },
];
```

- [ ] **Step 3: Create shared/styles.css**

CSS custom properties and base styles shared by side panel and popup:

```css
:root {
  --bg-primary: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-hover: rgba(255, 255, 255, 0.04);
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --text-dimmed: #555;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-faint: rgba(255, 255, 255, 0.04);
  --open-color: #5bcf72;
  --open-bg: rgba(91, 207, 130, 0.04);
  --unbookmarked-color: #cfa35b;
  --unbookmarked-bg: rgba(207, 163, 91, 0.06);
  --closed-opacity: 0.6;
  --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-size-sm: 10px;
  --font-size-base: 12px;
  --font-size-md: 13px;
  --font-size-lg: 15px;
  --favicon-size: 16px;
  --favicon-radius: 3px;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.4;
}
```

- [ ] **Step 4: Create .gitignore**

```
.DS_Store
*.swp
*~
node_modules/
.superpowers/
```

- [ ] **Step 5: Create placeholder icons**

Generate minimal colored square PNGs using a Node.js script:

```js
// scripts/generate-icons.js
const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

// If 'canvas' package not available, use this pure-JS approach to write minimal PNGs:
// A 1x1 blue pixel as base64, scaled by the browser.
// For development only — Chrome shows a default icon if these are missing.
const sizes = [16, 48, 128];
const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });

for (const size of sizes) {
  try {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#5b91cf';
    ctx.fillRect(0, 0, size, size);
    fs.writeFileSync(path.join(dir, `icon-${size}.png`), canvas.toBuffer('image/png'));
    console.log(`Created icon-${size}.png`);
  } catch {
    console.log(`Skipping icon-${size}.png (canvas not available)`);
  }
}
```

Run: `node scripts/generate-icons.js`

If the `canvas` npm package is not installed, skip this step — Chrome will use a default extension icon during development. The manifest.json icon references are optional.

Verify: `ls -la icons/` — either PNGs exist or directory is empty (both are fine for dev).

- [ ] **Step 6: Create directory structure**

```bash
mkdir -p background sidepanel popup components shared lib tests icons
```

- [ ] **Step 7: Commit scaffolding**

```bash
git add manifest.json shared/messages.js shared/styles.css .gitignore icons/
git commit -m "feat: add project scaffolding with manifest, shared styles, and message types"
```

---

### Task 2: URL Normalization & Tab Matcher (TDD)

**Files:**
- Create: `background/tab-matcher.js`
- Create: `tests/tab-matcher.test.js`

- [ ] **Step 1: Write failing tests for normalizeUrl**

```js
// tests/tab-matcher.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../background/tab-matcher.js';

describe('normalizeUrl', () => {
  it('strips trailing slashes', () => {
    assert.equal(normalizeUrl('https://github.com/'), 'https://github.com');
  });

  it('strips multiple trailing slashes', () => {
    assert.equal(normalizeUrl('https://github.com///'), 'https://github.com');
  });

  it('removes URL fragments', () => {
    assert.equal(
      normalizeUrl('https://example.com/page#section'),
      'https://example.com/page'
    );
  });

  it('normalizes http to https', () => {
    assert.equal(
      normalizeUrl('http://github.com'),
      'https://github.com'
    );
  });

  it('handles URLs with paths', () => {
    assert.equal(
      normalizeUrl('https://github.com/user/repo/'),
      'https://github.com/user/repo'
    );
  });

  it('preserves query parameters', () => {
    assert.equal(
      normalizeUrl('https://example.com/search?q=test'),
      'https://example.com/search?q=test'
    );
  });

  it('handles URLs with no protocol gracefully', () => {
    assert.equal(normalizeUrl('github.com'), 'https://github.com');
  });

  it('returns empty string for invalid input', () => {
    assert.equal(normalizeUrl(''), '');
    assert.equal(normalizeUrl(null), '');
    assert.equal(normalizeUrl(undefined), '');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/tab-matcher.test.js`
Expected: FAIL — `normalizeUrl` is not defined

- [ ] **Step 3: Implement normalizeUrl**

```js
// background/tab-matcher.js

/**
 * Normalize a URL for comparison:
 * - Strip trailing slashes
 * - Remove fragments (#...)
 * - Normalize http → https
 */
export function normalizeUrl(url) {
  if (!url) return '';

  let normalized = url;

  // Add protocol if missing
  if (!normalized.includes('://')) {
    normalized = 'https://' + normalized;
  }

  // Normalize http to https
  normalized = normalized.replace(/^http:\/\//, 'https://');

  // Remove fragment
  const hashIndex = normalized.indexOf('#');
  if (hashIndex !== -1) {
    normalized = normalized.substring(0, hashIndex);
  }

  // Strip trailing slashes
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/tab-matcher.test.js`
Expected: All 8 tests PASS

- [ ] **Step 5: Write failing tests for matchTabsToBookmarks**

```js
// Append to tests/tab-matcher.test.js
import { matchTabsToBookmarks } from '../background/tab-matcher.js';

describe('matchTabsToBookmarks', () => {
  const bookmarks = [
    { id: 'bm1', title: 'GitHub', url: 'https://github.com', groupId: 'g1', sortOrder: 0, favicon: null, createdAt: 1000 },
    { id: 'bm2', title: 'Jira', url: 'https://jira.example.com/board', groupId: 'g1', sortOrder: 1, favicon: null, createdAt: 1001 },
    { id: 'bm3', title: 'Reddit', url: 'https://reddit.com', groupId: 'g2', sortOrder: 0, favicon: null, createdAt: 1002 },
  ];

  const tabs = [
    { id: 101, title: 'GitHub', url: 'https://github.com/' },
    { id: 102, title: 'Stack Overflow', url: 'https://stackoverflow.com/questions/123' },
    { id: 103, title: 'Reddit', url: 'http://reddit.com' },
  ];

  it('marks matching bookmarks as open with tabId', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    const github = result.bookmarks.find(b => b.id === 'bm1');
    assert.equal(github.isOpen, true);
    assert.equal(github.tabId, 101);
  });

  it('marks non-matching bookmarks as closed', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    const jira = result.bookmarks.find(b => b.id === 'bm2');
    assert.equal(jira.isOpen, false);
    assert.equal(jira.tabId, null);
  });

  it('normalizes URLs for matching (http vs https, trailing slash)', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    const reddit = result.bookmarks.find(b => b.id === 'bm3');
    assert.equal(reddit.isOpen, true);
    assert.equal(reddit.tabId, 103);
  });

  it('returns unbookmarked tabs separately', () => {
    const result = matchTabsToBookmarks(bookmarks, tabs);
    assert.equal(result.unbookmarkedTabs.length, 1);
    assert.equal(result.unbookmarkedTabs[0].id, 102);
    assert.equal(result.unbookmarkedTabs[0].title, 'Stack Overflow');
  });

  it('handles empty bookmarks', () => {
    const result = matchTabsToBookmarks([], tabs);
    assert.equal(result.bookmarks.length, 0);
    assert.equal(result.unbookmarkedTabs.length, 3);
  });

  it('handles empty tabs', () => {
    const result = matchTabsToBookmarks(bookmarks, []);
    assert.equal(result.bookmarks.every(b => !b.isOpen), true);
    assert.equal(result.unbookmarkedTabs.length, 0);
  });
});
```

- [ ] **Step 6: Run tests to verify new tests fail**

Run: `node --test tests/tab-matcher.test.js`
Expected: New tests FAIL — `matchTabsToBookmarks` is not defined

- [ ] **Step 7: Implement matchTabsToBookmarks**

```js
// Append to background/tab-matcher.js

/**
 * Match open tabs against stored bookmarks.
 * Returns enriched bookmarks (with isOpen/tabId) and unbookmarked tabs.
 */
export function matchTabsToBookmarks(bookmarks, tabs) {
  // Build a map of normalized URL → tab for quick lookup
  const tabsByUrl = new Map();
  for (const tab of tabs) {
    const normalized = normalizeUrl(tab.url);
    if (normalized && !tabsByUrl.has(normalized)) {
      tabsByUrl.set(normalized, tab);
    }
  }

  // Track which tabs got matched
  const matchedTabIds = new Set();

  // Enrich bookmarks with open/closed status
  const enrichedBookmarks = bookmarks.map(bookmark => {
    const normalized = normalizeUrl(bookmark.url);
    const matchingTab = tabsByUrl.get(normalized);

    if (matchingTab && !matchedTabIds.has(matchingTab.id)) {
      matchedTabIds.add(matchingTab.id);
      return { ...bookmark, isOpen: true, tabId: matchingTab.id };
    }

    return { ...bookmark, isOpen: false, tabId: null };
  });

  // Collect unbookmarked tabs
  const unbookmarkedTabs = tabs.filter(tab => !matchedTabIds.has(tab.id));

  return { bookmarks: enrichedBookmarks, unbookmarkedTabs };
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `node --test tests/tab-matcher.test.js`
Expected: All 14 tests PASS

- [ ] **Step 9: Commit**

```bash
git add background/tab-matcher.js tests/tab-matcher.test.js
git commit -m "feat: add URL normalization and tab-to-bookmark matching with tests"
```

---

### Task 3: Storage Manager (TDD)

**Files:**
- Create: `background/storage.js`
- Create: `tests/storage.test.js`
- Create: `tests/chrome-mock.js`

The storage module wraps `chrome.storage.local` with typed CRUD operations. For testing, we'll mock the chrome API.

- [ ] **Step 1: Create chrome API mock for tests**

```js
// tests/chrome-mock.js
// Minimal chrome.storage.local mock for unit testing

export function createChromeMock() {
  let store = {};

  return {
    storage: {
      local: {
        get: (keys) => {
          return new Promise((resolve) => {
            if (typeof keys === 'string') keys = [keys];
            const result = {};
            for (const key of keys) {
              if (key in store) result[key] = store[key];
            }
            resolve(result);
          });
        },
        set: (items) => {
          return new Promise((resolve) => {
            Object.assign(store, items);
            resolve();
          });
        },
        getBytesInUse: () => {
          return new Promise((resolve) => {
            const size = JSON.stringify(store).length;
            resolve(size);
          });
        },
      },
      local_QUOTA_BYTES: 10485760, // 10 MB
    },
    _reset: () => { store = {}; },
    _getStore: () => ({ ...store }),
  };
}
```

- [ ] **Step 2: Write failing tests for storage CRUD**

```js
// tests/storage.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createChromeMock } from './chrome-mock.js';
import { createStorage } from '../background/storage.js';

describe('Storage Manager', () => {
  let chrome;
  let storage;

  beforeEach(() => {
    chrome = createChromeMock();
    storage = createStorage(chrome);
  });

  describe('bookmarks', () => {
    it('adds a bookmark and retrieves it', async () => {
      const bookmark = await storage.addBookmark({
        title: 'GitHub',
        url: 'https://github.com',
        groupId: null,
      });

      assert.ok(bookmark.id);
      assert.equal(bookmark.title, 'GitHub');
      assert.equal(bookmark.url, 'https://github.com');
      assert.equal(bookmark.groupId, null);
      assert.equal(typeof bookmark.sortOrder, 'number');
      assert.equal(typeof bookmark.createdAt, 'number');

      const all = await storage.getBookmarks();
      assert.equal(all.length, 1);
      assert.equal(all[0].id, bookmark.id);
    });

    it('removes a bookmark', async () => {
      const bookmark = await storage.addBookmark({
        title: 'Test',
        url: 'https://test.com',
        groupId: null,
      });

      await storage.removeBookmark(bookmark.id);
      const all = await storage.getBookmarks();
      assert.equal(all.length, 0);
    });

    it('updates a bookmark', async () => {
      const bookmark = await storage.addBookmark({
        title: 'Old Title',
        url: 'https://test.com',
        groupId: null,
      });

      await storage.updateBookmark(bookmark.id, { title: 'New Title' });
      const all = await storage.getBookmarks();
      assert.equal(all[0].title, 'New Title');
      assert.equal(all[0].url, 'https://test.com');
    });

    it('moves a bookmark to a different group', async () => {
      const bookmark = await storage.addBookmark({
        title: 'Test',
        url: 'https://test.com',
        groupId: 'g1',
      });

      await storage.moveBookmark(bookmark.id, 'g2', 0);
      const all = await storage.getBookmarks();
      assert.equal(all[0].groupId, 'g2');
      assert.equal(all[0].sortOrder, 0);
    });
  });

  describe('groups', () => {
    it('adds a group and retrieves it', async () => {
      const group = await storage.addGroup({
        name: 'Work Tools',
        parentId: null,
        color: '#5b91cf',
      });

      assert.ok(group.id);
      assert.equal(group.name, 'Work Tools');
      assert.equal(group.parentId, null);
      assert.equal(group.color, '#5b91cf');

      const all = await storage.getGroups();
      assert.equal(all.length, 1);
    });

    it('removes a group', async () => {
      const group = await storage.addGroup({
        name: 'Test',
        parentId: null,
        color: '#5b91cf',
      });

      await storage.removeGroup(group.id);
      const all = await storage.getGroups();
      assert.equal(all.length, 0);
    });

    it('updates a group', async () => {
      const group = await storage.addGroup({
        name: 'Old',
        parentId: null,
        color: '#5b91cf',
      });

      await storage.updateGroup(group.id, { name: 'New', color: '#b45bcf' });
      const all = await storage.getGroups();
      assert.equal(all[0].name, 'New');
      assert.equal(all[0].color, '#b45bcf');
    });

    it('enforces max one level of nesting', async () => {
      const parent = await storage.addGroup({
        name: 'Parent',
        parentId: null,
        color: '#5b91cf',
      });

      const child = await storage.addGroup({
        name: 'Child',
        parentId: parent.id,
        color: '#b45bcf',
      });

      await assert.rejects(
        () => storage.addGroup({
          name: 'Grandchild',
          parentId: child.id,
          color: '#5bcfbc',
        }),
        { message: /nesting/ }
      );
    });
  });

  describe('preferences', () => {
    it('gets and sets preferences', async () => {
      await storage.setPreference('collapsedGroups', ['g1', 'g2']);
      const value = await storage.getPreference('collapsedGroups');
      assert.deepEqual(value, ['g1', 'g2']);
    });

    it('returns default for unset preference', async () => {
      const value = await storage.getPreference('collapsedGroups');
      assert.equal(value, undefined);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/storage.test.js`
Expected: FAIL — `createStorage` is not defined

- [ ] **Step 4: Implement storage.js**

```js
// background/storage.js

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
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `node --test tests/storage.test.js`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add background/storage.js tests/storage.test.js tests/chrome-mock.js
git commit -m "feat: add storage manager with bookmark/group CRUD and preferences"
```

---

## Chunk 2: Service Worker & Broadcaster

### Task 4: State Broadcaster

**Files:**
- Create: `background/broadcaster.js`

The broadcaster is the core orchestrator. It holds the merged state (bookmarks + tab status) and pushes updates to connected UIs via `chrome.runtime.sendMessage`.

- [ ] **Step 1: Implement broadcaster.js**

```js
// background/broadcaster.js
import { matchTabsToBookmarks } from './tab-matcher.js';

/**
 * State Broadcaster.
 * Merges bookmarks + open tabs into unified state and broadcasts to UIs.
 */
export function createBroadcaster(chrome, storage) {
  let cachedState = null;

  /**
   * Recompute full state by merging stored bookmarks with current tabs.
   */
  async function computeState() {
    const [bookmarks, groups, preferences, tabs] = await Promise.all([
      storage.getBookmarks(),
      storage.getGroups(),
      storage.getPreferences(),
      chrome.tabs.query({}),
    ]);

    const { bookmarks: enrichedBookmarks, unbookmarkedTabs } =
      matchTabsToBookmarks(bookmarks, tabs);

    cachedState = {
      bookmarks: enrichedBookmarks,
      groups,
      unbookmarkedTabs,
      preferences,
    };

    return cachedState;
  }

  /**
   * Recompute and broadcast state to all extension pages.
   */
  async function broadcastState() {
    const state = await computeState();

    // Send to all connected extension pages (side panel, popup)
    // Wrapped in try-catch because sendMessage throws if no listeners
    try {
      await chrome.runtime.sendMessage({
        type: 'state-updated',
        payload: state,
      });
    } catch {
      // No listeners connected — that's fine
    }

    return state;
  }

  /**
   * Get current state (recomputes if not cached).
   */
  async function getState() {
    if (!cachedState) {
      return computeState();
    }
    return cachedState;
  }

  /**
   * Invalidate cache and rebroadcast.
   * Call this after any storage mutation.
   */
  async function invalidateAndBroadcast() {
    cachedState = null;
    return broadcastState();
  }

  return {
    getState,
    broadcastState,
    invalidateAndBroadcast,
  };
}
```

- [ ] **Step 2: Verify broadcaster logic**

The broadcaster depends on chrome.tabs which is hard to unit test without a full extension environment. Verification will happen during integration testing (Task 14). The core matching logic is already tested via tab-matcher.test.js.

- [ ] **Step 3: Commit**

```bash
git add background/broadcaster.js
git commit -m "feat: add state broadcaster for merging bookmarks with tab status"
```

---

### Task 5: Service Worker

**Files:**
- Create: `background/service-worker.js`

The service worker wires everything together: initializes storage + broadcaster, listens for tab events, and handles messages from UIs.

- [ ] **Step 1: Implement service-worker.js**

```js
// background/service-worker.js
import { createStorage } from './storage.js';
import { createBroadcaster } from './broadcaster.js';
import { MSG } from '../shared/messages.js';

const storage = createStorage(chrome);
const broadcaster = createBroadcaster(chrome, storage);

// --- Tab event listeners ---
// Re-broadcast state whenever tabs change

chrome.tabs.onCreated.addListener(() => broadcaster.broadcastState());
chrome.tabs.onRemoved.addListener(() => broadcaster.broadcastState());
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // Only rebroadcast on URL changes, not every tab update
  if (changeInfo.url || changeInfo.status === 'complete') {
    broadcaster.broadcastState();
  }
});

// --- Message handler ---
// Receives requests from side panel and popup

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message) {
  switch (message.type) {
    case MSG.GET_STATE:
      return broadcaster.getState();

    case MSG.ADD_BOOKMARK: {
      await storage.addBookmark(message.payload);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.REMOVE_BOOKMARK: {
      await storage.removeBookmark(message.payload.id);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.UPDATE_BOOKMARK: {
      const { id, ...updates } = message.payload;
      await storage.updateBookmark(id, updates);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.MOVE_BOOKMARK: {
      const { id, groupId, sortOrder } = message.payload;
      await storage.moveBookmark(id, groupId, sortOrder);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.ADD_GROUP: {
      await storage.addGroup(message.payload);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.REMOVE_GROUP: {
      await storage.removeGroup(message.payload.id);
      // Move orphaned bookmarks to ungrouped with incrementing sort orders
      const bookmarks = await storage.getBookmarks();
      const ungrouped = bookmarks.filter(b => b.groupId === null);
      let nextSort = ungrouped.length;
      for (const bm of bookmarks) {
        if (bm.groupId === message.payload.id) {
          await storage.moveBookmark(bm.id, null, nextSort++);
        }
      }
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.UPDATE_GROUP: {
      const { id, ...updates } = message.payload;
      await storage.updateGroup(id, updates);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.MOVE_GROUP: {
      const { id, parentId, sortOrder } = message.payload;
      await storage.moveGroup(id, parentId, sortOrder);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.SET_PREFERENCE: {
      const { key, value } = message.payload;
      await storage.setPreference(key, value);
      return broadcaster.invalidateAndBroadcast();
    }

    case MSG.NAVIGATE_TO: {
      const { tabId, url } = message.payload;
      if (tabId) {
        // Tab is open — switch to it
        await chrome.tabs.update(tabId, { active: true });
        const tab = await chrome.tabs.get(tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
      } else {
        // Tab is closed — open new tab
        await chrome.tabs.create({ url });
      }
      return { success: true };
    }

    case MSG.CLOSE_TAB: {
      const { tabId } = message.payload;
      if (tabId) {
        await chrome.tabs.remove(tabId);
      }
      // Tab removal triggers onRemoved which rebroadcasts
      return { success: true };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}
```

- [ ] **Step 2: Verify service worker syntax**

Run: `node --check background/service-worker.js`
Expected: No syntax errors (note: chrome.* APIs won't exist in Node, but syntax check catches typos and import issues)

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add service worker with tab listeners and message handling"
```

---

## Chunk 3: Web Components

### Task 6: Bookmark Item Component

**Files:**
- Create: `components/bookmark-item.js`

- [ ] **Step 1: Implement bookmark-item Web Component**

```js
// components/bookmark-item.js
import { MSG } from '../shared/messages.js';

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .bookmark {
      padding: 6px 16px 6px var(--indent, 32px);
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      border-left: 2px solid transparent;
      transition: background 0.1s;
    }
    .bookmark:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .bookmark.open {
      background: var(--open-bg, rgba(91, 207, 130, 0.04));
    }
    .bookmark.closed {
      opacity: var(--closed-opacity, 0.6);
    }
    .bookmark.unbookmarked {
      border-left: 2px dashed var(--unbookmarked-color, #cfa35b);
    }
    .favicon {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .favicon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .favicon.placeholder {
      background: #2a2a3e;
      color: #555;
    }
    .favicon.unbookmarked-placeholder {
      background: #2e2a1e;
      color: var(--unbookmarked-color, #cfa35b);
    }
    .title {
      font-size: 12px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .title.unbookmarked {
      color: var(--unbookmarked-color, #cfa35b);
    }
    .open-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--open-color, #5bcf72);
      flex-shrink: 0;
    }
    .close-btn {
      font-size: 10px;
      color: #555;
      cursor: pointer;
      flex-shrink: 0;
      padding: 2px 4px;
      border-radius: 3px;
      border: none;
      background: none;
      line-height: 1;
    }
    .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #aaa;
    }
    .hidden {
      display: none;
    }
  </style>
  <div class="bookmark" part="bookmark">
    <div class="favicon">
      <img class="favicon-img hidden" />
      <span class="favicon-letter"></span>
    </div>
    <span class="title"></span>
    <span class="open-dot hidden"></span>
    <button class="close-btn hidden" title="Close tab">✕</button>
  </div>
`;

export class BookmarkItem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._data = null;

    // Bind event handlers
    this.shadowRoot.querySelector('.bookmark').addEventListener('click', (e) => {
      // Don't navigate if close button was clicked
      if (e.target.closest('.close-btn')) return;
      this._handleClick();
    });

    this.shadowRoot.querySelector('.close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this._handleClose();
    });
  }

  set data(value) {
    this._data = value;
    this._render();
  }

  get data() {
    return this._data;
  }

  _render() {
    if (!this._data) return;

    const { title, favicon, isOpen, isBookmarked } = this._data;
    const el = this.shadowRoot;

    const bookmarkEl = el.querySelector('.bookmark');
    const titleEl = el.querySelector('.title');
    const faviconImg = el.querySelector('.favicon-img');
    const faviconLetter = el.querySelector('.favicon-letter');
    const faviconContainer = el.querySelector('.favicon');
    const openDot = el.querySelector('.open-dot');
    const closeBtn = el.querySelector('.close-btn');

    // Set title
    titleEl.textContent = title;

    // Visual state classes
    bookmarkEl.classList.toggle('open', isOpen && isBookmarked !== false);
    bookmarkEl.classList.toggle('closed', !isOpen && isBookmarked !== false);
    bookmarkEl.classList.toggle('unbookmarked', isBookmarked === false);
    titleEl.classList.toggle('unbookmarked', isBookmarked === false);

    // Favicon
    if (favicon) {
      faviconImg.src = favicon;
      faviconImg.classList.remove('hidden');
      faviconLetter.classList.add('hidden');
      faviconContainer.classList.remove('placeholder', 'unbookmarked-placeholder');

      faviconImg.onerror = () => {
        faviconImg.classList.add('hidden');
        faviconLetter.classList.remove('hidden');
        faviconLetter.textContent = title.charAt(0).toUpperCase();
        faviconContainer.classList.add(
          isBookmarked === false ? 'unbookmarked-placeholder' : 'placeholder'
        );
      };
    } else {
      faviconImg.classList.add('hidden');
      faviconLetter.classList.remove('hidden');
      faviconLetter.textContent = title.charAt(0).toUpperCase();
      faviconContainer.classList.add(
        isBookmarked === false ? 'unbookmarked-placeholder' : 'placeholder'
      );
    }

    // Open indicator and close button
    openDot.classList.toggle('hidden', !isOpen || isBookmarked === false);
    closeBtn.classList.toggle('hidden', !isOpen);
  }

  _handleClick() {
    if (!this._data) return;
    this.dispatchEvent(new CustomEvent('navigate', {
      bubbles: true,
      detail: {
        tabId: this._data.tabId || null,
        url: this._data.url,
      },
    }));
  }

  _handleClose() {
    if (!this._data || !this._data.tabId) return;
    this.dispatchEvent(new CustomEvent('close-tab', {
      bubbles: true,
      detail: { tabId: this._data.tabId },
    }));
  }
}

customElements.define('bookmark-item', BookmarkItem);
```

Note: Web Components with shadow DOM cannot be unit tested without a browser environment. These components will be verified during integration testing (Task 14).

- [ ] **Step 2: Commit**

```bash
git add components/bookmark-item.js
git commit -m "feat: add bookmark-item web component with visual states"
```

---

### Task 7: Group Header Component

**Files:**
- Create: `components/group-header.js`

- [ ] **Step 1: Implement group-header Web Component**

```js
// components/group-header.js

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .group-header {
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      border-left: 3px solid var(--group-color, #888);
      background: var(--group-bg, rgba(255, 255, 255, 0.02));
      user-select: none;
    }
    .group-header:hover {
      background: rgba(255, 255, 255, 0.04);
    }
    .group-header.sub-group {
      padding-left: 32px;
      border-left-color: var(--group-color-dimmed, rgba(136, 136, 136, 0.4));
    }
    .collapse-icon {
      font-size: 10px;
      width: 12px;
      text-align: center;
      transition: transform 0.15s;
    }
    .collapse-icon.collapsed {
      transform: rotate(-90deg);
    }
    .name {
      font-size: 13px;
      font-weight: 500;
      flex: 1;
    }
    .count {
      font-size: 10px;
      color: var(--text-dimmed, #555);
    }
    .unbookmarked-header {
      border-left: 3px dashed var(--unbookmarked-color, #cfa35b);
      background: var(--unbookmarked-bg, rgba(207, 163, 91, 0.06));
    }
    .unbookmarked-header .name,
    .unbookmarked-header .collapse-icon {
      color: var(--unbookmarked-color, #cfa35b);
    }
  </style>
  <div class="group-header" part="header">
    <span class="collapse-icon">▼</span>
    <span class="name"></span>
    <span class="count"></span>
  </div>
`;

export class GroupHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._data = null;

    this.shadowRoot.querySelector('.group-header').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('toggle-collapse', {
        bubbles: true,
        detail: { groupId: this._data?.id },
      }));
    });
  }

  set data(value) {
    this._data = value;
    this._render();
  }

  get data() {
    return this._data;
  }

  _render() {
    if (!this._data) return;

    const { name, color, count, collapsed, isSubGroup, isUnbookmarked } = this._data;
    const el = this.shadowRoot;

    const headerEl = el.querySelector('.group-header');
    const nameEl = el.querySelector('.name');
    const countEl = el.querySelector('.count');
    const collapseEl = el.querySelector('.collapse-icon');

    nameEl.textContent = name;
    countEl.textContent = count ?? '';

    // Set group color via CSS custom properties
    if (color && !isUnbookmarked) {
      headerEl.style.setProperty('--group-color', color);
      headerEl.style.setProperty('--group-bg', `${color}12`);
      headerEl.style.setProperty('--group-color-dimmed', `${color}66`);
      nameEl.style.color = color;
      collapseEl.style.color = color;
      countEl.style.color = `${color}88`;
    }

    // Sub-group styling
    headerEl.classList.toggle('sub-group', !!isSubGroup);

    // Unbookmarked tabs section
    headerEl.classList.toggle('unbookmarked-header', !!isUnbookmarked);

    // Collapse state
    collapseEl.classList.toggle('collapsed', !!collapsed);
  }
}

customElements.define('group-header', GroupHeader);
```

- [ ] **Step 2: Commit**

```bash
git add components/group-header.js
git commit -m "feat: add group-header web component with color coding"
```

---

### Task 8: Search Bar Component

**Files:**
- Create: `components/search-bar.js`

- [ ] **Step 1: Implement search-bar Web Component**

```js
// components/search-bar.js

const template = document.createElement('template');
template.innerHTML = `
  <style>
    :host {
      display: block;
    }
    .search-container {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.08));
    }
    .search-input-wrapper {
      background: rgba(255, 255, 255, 0.06);
      border-radius: 6px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid transparent;
      transition: border-color 0.15s;
    }
    .search-input-wrapper.focused {
      border-color: rgba(91, 145, 207, 0.4);
    }
    .search-icon {
      color: #555;
      font-size: 13px;
      flex-shrink: 0;
    }
    .search-input-wrapper.focused .search-icon {
      color: #5b91cf;
    }
    input {
      background: none;
      border: none;
      outline: none;
      color: var(--text-primary, #e0e0e0);
      font-size: 13px;
      font-family: inherit;
      width: 100%;
    }
    input::placeholder {
      color: #555;
    }
  </style>
  <div class="search-container">
    <div class="search-input-wrapper">
      <span class="search-icon">🔍</span>
      <input type="text" placeholder="Search bookmarks & tabs..." />
    </div>
  </div>
`;

export class SearchBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));

    this._input = this.shadowRoot.querySelector('input');
    this._wrapper = this.shadowRoot.querySelector('.search-input-wrapper');

    this._input.addEventListener('input', () => {
      this.dispatchEvent(new CustomEvent('search', {
        bubbles: true,
        detail: { query: this._input.value },
      }));
    });

    this._input.addEventListener('focus', () => {
      this._wrapper.classList.add('focused');
    });

    this._input.addEventListener('blur', () => {
      this._wrapper.classList.remove('focused');
    });

    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        this.dispatchEvent(new CustomEvent('search-key', {
          bubbles: true,
          detail: { key: e.key },
        }));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
        }
      }
    });
  }

  focus() {
    this._input.focus();
  }

  get value() {
    return this._input.value;
  }

  set value(v) {
    this._input.value = v;
  }

  clear() {
    this._input.value = '';
    this.dispatchEvent(new CustomEvent('search', {
      bubbles: true,
      detail: { query: '' },
    }));
  }
}

customElements.define('search-bar', SearchBar);
```

- [ ] **Step 2: Commit**

```bash
git add components/search-bar.js
git commit -m "feat: add search-bar web component with keyboard events"
```

---

## Chunk 4: Side Panel UI

### Task 9: Side Panel HTML & CSS

**Files:**
- Create: `sidepanel/sidepanel.html`
- Create: `sidepanel/sidepanel.css`

- [ ] **Step 1: Create sidepanel.html**

```html
<!-- sidepanel/sidepanel.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="../shared/styles.css" />
  <link rel="stylesheet" href="sidepanel.css" />
  <title>Junkie</title>
</head>
<body>
  <header class="header">
    <div class="header-title">🔖 Junkie</div>
    <div class="header-actions">
      <button class="header-btn" id="add-group-btn" title="Add group">＋</button>
      <button class="header-btn" id="settings-btn" title="Settings">⚙</button>
    </div>
  </header>

  <main id="bookmark-list"></main>

  <!-- Add Group Dialog -->
  <dialog id="add-group-dialog">
    <form method="dialog">
      <h3>New Group</h3>
      <label>
        Name
        <input type="text" id="group-name-input" required />
      </label>
      <label>
        Parent (optional)
        <select id="group-parent-select">
          <option value="">None (top-level)</option>
        </select>
      </label>
      <div class="color-picker" id="color-picker"></div>
      <div class="dialog-actions">
        <button type="button" class="btn-cancel">Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>
  </dialog>

  <script type="module" src="../components/bookmark-item.js"></script>
  <script type="module" src="../components/group-header.js"></script>
  <!-- sidepanel.js imports render.js, dialogs.js, context-menu.js as ES modules -->
  <script type="module" src="sidepanel.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create sidepanel.css**

```css
/* sidepanel/sidepanel.css */

.header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  background: var(--bg-primary);
  z-index: 10;
}

.header-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
}

#bookmark-list {
  padding-bottom: 24px;
}

.group-section {
  border-bottom: 1px solid var(--border-faint);
}

.group-items {
  /* Container for SortableJS */
}

.group-items.collapsed {
  display: none;
}

/* Sub-group indentation */
.group-section .group-section {
  padding-left: 16px;
}

.group-section .group-section group-header::part(header) {
  border-left-width: 2px;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-dimmed);
  font-size: var(--font-size-md);
}

/* Dialog styles */
dialog {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 20px;
  max-width: 320px;
  width: 100%;
}

dialog::backdrop {
  background: rgba(0, 0, 0, 0.5);
}

dialog h3 {
  margin-bottom: 16px;
  font-size: var(--font-size-lg);
}

dialog label {
  display: block;
  margin-bottom: 12px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

dialog input,
dialog select {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: var(--font-size-base);
  font-family: inherit;
}

dialog input:focus,
dialog select:focus {
  outline: none;
  border-color: rgba(91, 145, 207, 0.4);
}

.color-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s;
}

.color-swatch.selected {
  border-color: #fff;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btn-cancel {
  padding: 6px 14px;
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
}

.btn-primary {
  padding: 6px 14px;
  background: #5b91cf;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  font-family: inherit;
}

/* Context menu */
.context-menu {
  position: fixed;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 160px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.context-menu-item {
  padding: 6px 14px;
  font-size: var(--font-size-base);
  cursor: pointer;
  color: var(--text-primary);
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.context-menu-divider {
  height: 1px;
  background: var(--border-subtle);
  margin: 4px 0;
}
```

- [ ] **Step 3: Commit**

```bash
git add sidepanel/sidepanel.html sidepanel/sidepanel.css
git commit -m "feat: add side panel HTML structure and CSS styles"
```

---

### Task 10: Side Panel JavaScript

**Files:**
- Create: `sidepanel/sidepanel.js` — coordinator: init, event listeners, communication
- Create: `sidepanel/render.js` — rendering the bookmark tree from state
- Create: `sidepanel/context-menu.js` — right-click context menu logic
- Create: `sidepanel/dialogs.js` — add-group dialog management

The side panel logic is split into focused modules to keep each file small and single-purpose.

- [ ] **Step 1: Implement sidepanel/render.js**

Rendering logic — takes state and produces DOM elements:

```js
// sidepanel/render.js

/**
 * Render the full bookmark tree into the given container.
 */
export function renderBookmarkTree(container, state, { initDragAndDrop }) {
  container.innerHTML = '';

  const { bookmarks, groups, unbookmarkedTabs, preferences } = state;
  const collapsedGroups = preferences?.collapsedGroups || [];

  const topLevelGroups = groups
    .filter(g => g.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (topLevelGroups.length === 0 && bookmarks.length === 0 && unbookmarkedTabs.length === 0) {
    container.innerHTML = '<div class="empty-state">No bookmarks yet. Click + to add a group.</div>';
    return;
  }

  for (const group of topLevelGroups) {
    container.appendChild(renderGroup(group, bookmarks, groups, collapsedGroups));
  }

  // Ungrouped bookmarks
  const ungrouped = bookmarks
    .filter(b => b.groupId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (ungrouped.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const header = document.createElement('group-header');
    header.data = { id: null, name: 'Ungrouped', color: '#888', count: ungrouped.length, collapsed: false };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items';
    items.dataset.groupId = '';

    for (const bookmark of ungrouped) {
      const item = document.createElement('bookmark-item');
      item.data = { ...bookmark, isBookmarked: true };
      items.appendChild(item);
    }

    section.appendChild(items);
    container.appendChild(section);
  }

  // Unbookmarked open tabs
  if (unbookmarkedTabs.length > 0) {
    const section = document.createElement('div');
    section.className = 'group-section';

    const isCollapsed = collapsedGroups.includes('__open_tabs__');
    const header = document.createElement('group-header');
    header.data = {
      id: '__open_tabs__',
      name: 'Open Tabs',
      count: unbookmarkedTabs.length,
      collapsed: isCollapsed,
      isUnbookmarked: true,
    };
    section.appendChild(header);

    const items = document.createElement('div');
    items.className = 'group-items' + (isCollapsed ? ' collapsed' : '');
    items.dataset.groupId = '__open_tabs__';

    for (const tab of unbookmarkedTabs) {
      const item = document.createElement('bookmark-item');
      item.data = {
        id: `tab-${tab.id}`,
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || null,
        isOpen: true,
        tabId: tab.id,
        isBookmarked: false,
      };
      items.appendChild(item);
    }

    section.appendChild(items);
    container.appendChild(section);
  }

  initDragAndDrop();
}

function renderGroup(group, bookmarks, allGroups, collapsedGroups) {
  const section = document.createElement('div');
  section.className = 'group-section';
  section.dataset.groupId = group.id;

  const isCollapsed = collapsedGroups.includes(group.id);
  const groupBookmarks = bookmarks
    .filter(b => b.groupId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const subGroups = allGroups
    .filter(g => g.parentId === group.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const totalCount = groupBookmarks.length + subGroups.reduce((sum, sg) => {
    return sum + bookmarks.filter(b => b.groupId === sg.id).length;
  }, 0);

  const header = document.createElement('group-header');
  header.data = {
    id: group.id,
    name: group.name,
    color: group.color,
    count: totalCount,
    collapsed: isCollapsed,
    isSubGroup: group.parentId !== null,
  };
  section.appendChild(header);

  const items = document.createElement('div');
  items.className = 'group-items' + (isCollapsed ? ' collapsed' : '');
  items.dataset.groupId = group.id;

  for (const bookmark of groupBookmarks) {
    const item = document.createElement('bookmark-item');
    item.data = { ...bookmark, isBookmarked: true };
    items.appendChild(item);
  }

  section.appendChild(items);

  for (const subGroup of subGroups) {
    section.appendChild(renderGroup(subGroup, bookmarks, allGroups, collapsedGroups));
  }

  return section;
}
```

- [ ] **Step 2: Implement sidepanel/dialogs.js**

Add-group dialog logic:

```js
// sidepanel/dialogs.js
import { MSG, GROUP_COLORS } from '../shared/messages.js';

/**
 * Set up the add-group dialog and its event handlers.
 */
export function setupDialogs(sendMessage, getState) {
  const addGroupBtn = document.getElementById('add-group-btn');
  const dialog = document.getElementById('add-group-dialog');
  const nameInput = document.getElementById('group-name-input');
  const parentSelect = document.getElementById('group-parent-select');
  const colorPicker = document.getElementById('color-picker');

  let selectedColor = GROUP_COLORS[0].value;

  // Populate color picker
  for (const color of GROUP_COLORS) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color.value === selectedColor ? ' selected' : '');
    swatch.style.background = color.value;
    swatch.title = color.name;
    swatch.addEventListener('click', () => {
      colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedColor = color.value;
    });
    colorPicker.appendChild(swatch);
  }

  addGroupBtn.addEventListener('click', () => {
    parentSelect.innerHTML = '<option value="">None (top-level)</option>';
    const state = getState();
    if (state) {
      const topGroups = state.groups.filter(g => g.parentId === null);
      for (const group of topGroups) {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        parentSelect.appendChild(option);
      }
    }
    nameInput.value = '';
    dialog.showModal();
  });

  dialog.querySelector('.btn-cancel').addEventListener('click', () => dialog.close());

  dialog.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    await sendMessage(MSG.ADD_GROUP, {
      name,
      parentId: parentSelect.value || null,
      color: selectedColor,
    });
    dialog.close();
  });
}
```

- [ ] **Step 3: Implement sidepanel/context-menu.js**

Right-click context menu:

```js
// sidepanel/context-menu.js
import { MSG, GROUP_COLORS } from '../shared/messages.js';

let contextMenu = null;

/**
 * Set up context menu event handlers.
 */
export function setupContextMenu(sendMessage, getState) {
  document.addEventListener('contextmenu', (e) => {
    const groupHeader = e.target.closest('group-header');
    const bookmarkItem = e.target.closest('bookmark-item');

    if (!groupHeader && !bookmarkItem) {
      hideContextMenu();
      return;
    }

    e.preventDefault();
    hideContextMenu();

    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.top = `${e.clientY}px`;

    if (groupHeader && groupHeader.data) {
      const group = groupHeader.data;
      if (!group.isUnbookmarked) {
        contextMenu.innerHTML = `
          <div class="context-menu-item" data-action="rename-group">Rename</div>
          <div class="context-menu-item" data-action="change-color">Change Color</div>
          <div class="context-menu-divider"></div>
          <div class="context-menu-item" data-action="delete-group" style="color: #cf5b5b;">Delete Group</div>
        `;
        contextMenu.dataset.groupId = group.id;
      }
    } else if (bookmarkItem && bookmarkItem.data) {
      const data = bookmarkItem.data;
      if (data.isBookmarked !== false) {
        contextMenu.innerHTML = `
          <div class="context-menu-item" data-action="remove-bookmark">Remove Bookmark</div>
        `;
        contextMenu.dataset.bookmarkId = data.id;
      }
    }

    if (contextMenu.children.length > 0) {
      document.body.appendChild(contextMenu);
    }
  });

  document.addEventListener('click', (e) => {
    const menuItem = e.target.closest('.context-menu-item');
    if (menuItem && contextMenu) {
      handleContextAction(menuItem.dataset.action, sendMessage, getState);
    }
    hideContextMenu();
  });
}

async function handleContextAction(action, sendMessage, getState) {
  if (action === 'delete-group') {
    await sendMessage(MSG.REMOVE_GROUP, { id: contextMenu.dataset.groupId });
  } else if (action === 'remove-bookmark') {
    await sendMessage(MSG.REMOVE_BOOKMARK, { id: contextMenu.dataset.bookmarkId });
  } else if (action === 'rename-group') {
    const newName = prompt('New group name:');
    if (newName) {
      await sendMessage(MSG.UPDATE_GROUP, { id: contextMenu.dataset.groupId, name: newName });
    }
  } else if (action === 'change-color') {
    const state = getState();
    const group = state?.groups.find(g => g.id === contextMenu.dataset.groupId);
    if (group) {
      const currentIndex = GROUP_COLORS.findIndex(c => c.value === group.color);
      const nextColor = GROUP_COLORS[(currentIndex + 1) % GROUP_COLORS.length];
      await sendMessage(MSG.UPDATE_GROUP, { id: group.id, color: nextColor.value });
    }
  }
}

function hideContextMenu() {
  if (contextMenu && contextMenu.parentElement) {
    contextMenu.remove();
  }
  contextMenu = null;
}
```

- [ ] **Step 4: Implement sidepanel/sidepanel.js (coordinator)**

```js
// sidepanel/sidepanel.js
import { MSG } from '../shared/messages.js';
import { renderBookmarkTree } from './render.js';
import { setupDialogs } from './dialogs.js';
import { setupContextMenu } from './context-menu.js';

let currentState = null;

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

function getState() {
  return currentState;
}

// Listen for state broadcasts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === MSG.STATE_UPDATED) {
    currentState = message.payload;
    render();
  }
});

async function init() {
  currentState = await sendMessage(MSG.GET_STATE);
  render();
  setupDialogs(sendMessage, getState);
  setupContextMenu(sendMessage, getState);
}

function render() {
  if (!currentState) return;
  const container = document.getElementById('bookmark-list');
  renderBookmarkTree(container, currentState, { initDragAndDrop });
}

// --- Drag and Drop ---

function initDragAndDrop() {
  const containers = document.querySelectorAll('.group-items');
  for (const container of containers) {
    if (container._sortable) container._sortable.destroy();
    container._sortable = new Sortable(container, {
      group: 'bookmarks',
      animation: 150,
      ghostClass: 'sortable-ghost',
      dragClass: 'sortable-drag',
      onEnd: handleDragEnd,
    });
  }
}

async function handleDragEnd(evt) {
  const data = evt.item.data;
  if (!data) return;

  const targetGroupId = evt.to.dataset.groupId;
  const newIndex = evt.newIndex;

  if (data.isBookmarked === false) {
    if (targetGroupId && targetGroupId !== '__open_tabs__') {
      await sendMessage(MSG.ADD_BOOKMARK, {
        title: data.title,
        url: data.url,
        groupId: targetGroupId,
        favicon: data.favicon,
      });
    }
  } else {
    await sendMessage(MSG.MOVE_BOOKMARK, {
      id: data.id,
      groupId: targetGroupId || null,
      sortOrder: newIndex,
    });
  }
}

// --- Event Handlers ---

document.addEventListener('navigate', async (e) => {
  await sendMessage(MSG.NAVIGATE_TO, e.detail);
});

document.addEventListener('close-tab', async (e) => {
  await sendMessage(MSG.CLOSE_TAB, e.detail);
});

document.addEventListener('toggle-collapse', async (e) => {
  const { groupId } = e.detail;
  if (!groupId) return;

  const collapsed = currentState?.preferences?.collapsedGroups || [];
  const newCollapsed = collapsed.includes(groupId)
    ? collapsed.filter(id => id !== groupId)
    : [...collapsed, groupId];

  await sendMessage(MSG.SET_PREFERENCE, { key: 'collapsedGroups', value: newCollapsed });
});

// --- Load SortableJS then init ---

const script = document.createElement('script');
script.src = '../lib/sortable.min.js';
script.onload = () => init();
document.head.appendChild(script);
```

- [ ] **Step 5: Commit**

```bash
git add sidepanel/sidepanel.js sidepanel/render.js sidepanel/dialogs.js sidepanel/context-menu.js
git commit -m "feat: add side panel logic with group rendering, drag-and-drop, and context menu"
```

---

## Chunk 5: Popup UI & Libraries

### Task 11: Popup HTML, CSS & JavaScript

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`
- Create: `popup/popup.js`

- [ ] **Step 1: Create popup.html**

```html
<!-- popup/popup.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="../shared/styles.css" />
  <link rel="stylesheet" href="popup.css" />
  <title>Junkie Search</title>
</head>
<body>
  <search-bar></search-bar>
  <main id="results"></main>
  <footer class="keyboard-hints">
    <span><kbd>↑↓</kbd> navigate</span>
    <span><kbd>↵</kbd> open</span>
    <span><kbd>esc</kbd> close</span>
  </footer>

  <script type="module" src="../components/search-bar.js"></script>
  <script type="module" src="../components/bookmark-item.js"></script>
  <script type="module" src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create popup.css**

```css
/* popup/popup.css */

body {
  width: 360px;
  max-height: 480px;
  overflow-y: auto;
}

#results {
  padding: 0;
}

.result-section-label {
  padding: 4px 16px;
  font-size: 10px;
  color: var(--text-dimmed);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-item {
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: background 0.1s;
}

.result-item:hover,
.result-item.selected {
  background: rgba(91, 145, 207, 0.12);
}

.result-favicon {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  flex-shrink: 0;
  overflow: hidden;
}

.result-favicon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.result-favicon.placeholder {
  background: #2a2a3e;
  color: var(--text-dimmed);
}

.result-favicon.unbookmarked {
  background: #2e2a1e;
  color: var(--unbookmarked-color);
}

.result-info {
  flex: 1;
  overflow: hidden;
}

.result-title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-title.unbookmarked {
  color: var(--unbookmarked-color);
}

.result-title mark {
  background: rgba(91, 145, 207, 0.3);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}

.result-breadcrumb {
  font-size: 10px;
  color: var(--text-dimmed);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--open-color);
  flex-shrink: 0;
}

.keyboard-hints {
  padding: 8px 16px;
  border-top: 1px solid var(--border-faint);
  display: flex;
  justify-content: center;
  gap: 12px;
  font-size: 10px;
  color: var(--text-dimmed);
}

kbd {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 9px;
  font-family: inherit;
}

.empty-recent {
  padding: 24px 16px;
  text-align: center;
  color: var(--text-dimmed);
  font-size: var(--font-size-md);
}
```

- [ ] **Step 3: Create popup.js**

```js
// popup/popup.js
import { MSG } from '../shared/messages.js';

let currentState = null;
let fuse = null;
let selectedIndex = 0;
let currentResults = [];

// --- Communication ---

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

// --- Init ---

async function init() {
  currentState = await sendMessage(MSG.GET_STATE);

  // Initialize Fuse.js for fuzzy search
  initFuse();

  // Auto-focus search bar
  const searchBar = document.querySelector('search-bar');
  // Small delay to ensure component is ready
  requestAnimationFrame(() => searchBar.focus());

  // Show recent items initially
  renderRecent();
}

function initFuse() {
  if (!currentState) return;

  // Build search index from bookmark titles and open tab titles
  const items = [];

  for (const bookmark of currentState.bookmarks) {
    const group = currentState.groups.find(g => g.id === bookmark.groupId);
    const parentGroup = group?.parentId
      ? currentState.groups.find(g => g.id === group.parentId)
      : null;

    const breadcrumb = parentGroup
      ? `${parentGroup.name} → ${group.name}`
      : group?.name || '';

    items.push({
      type: 'bookmark',
      title: bookmark.title,
      url: bookmark.url,
      favicon: bookmark.favicon,
      isOpen: bookmark.isOpen,
      tabId: bookmark.tabId,
      breadcrumb,
    });
  }

  for (const tab of currentState.unbookmarkedTabs) {
    items.push({
      type: 'tab',
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || null,
      isOpen: true,
      tabId: tab.id,
      breadcrumb: 'Not bookmarked',
    });
  }

  fuse = new Fuse(items, {
    keys: ['title'],
    threshold: 0.4,
    includeMatches: true,
  });
}

// --- Search ---

document.addEventListener('search', (e) => {
  const { query } = e.detail;

  if (!query) {
    renderRecent();
    return;
  }

  if (!fuse) return;

  const results = fuse.search(query);
  currentResults = results.map(r => r.item);
  selectedIndex = 0;

  renderResults(results);
});

// --- Keyboard Navigation ---

document.addEventListener('search-key', (e) => {
  const { key } = e.detail;
  const items = document.querySelectorAll('.result-item');

  if (key === 'ArrowDown') {
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (key === 'ArrowUp') {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection(items);
  } else if (key === 'Enter') {
    if (currentResults[selectedIndex]) {
      navigateTo(currentResults[selectedIndex]);
    }
  } else if (key === 'Escape') {
    window.close();
  }
});

function updateSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedIndex);
  });

  // Scroll into view
  items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

// --- Rendering ---

function renderRecent() {
  const container = document.getElementById('results');

  if (!currentState || currentState.bookmarks.length === 0) {
    container.innerHTML = '<div class="empty-recent">No bookmarks yet</div>';
    return;
  }

  // Show bookmarks that are currently open first, then most recently created
  const openFirst = [...currentState.bookmarks]
    .sort((a, b) => {
      // Open tabs first
      if (a.isOpen && !b.isOpen) return -1;
      if (!a.isOpen && b.isOpen) return 1;
      // Then by createdAt
      return b.createdAt - a.createdAt;
    })
    .slice(0, 8);

  currentResults = openFirst.map(bm => {
    const group = currentState.groups.find(g => g.id === bm.groupId);
    return {
      type: 'bookmark',
      title: bm.title,
      url: bm.url,
      favicon: bm.favicon,
      isOpen: bm.isOpen,
      tabId: bm.tabId,
      breadcrumb: group?.name || '',
    };
  });

  selectedIndex = 0;

  container.innerHTML = '';

  const label = document.createElement('div');
  label.className = 'result-section-label';
  label.textContent = 'Recent';
  container.appendChild(label);

  for (let i = 0; i < currentResults.length; i++) {
    container.appendChild(createResultItem(currentResults[i], i === 0, null));
  }
}

function renderResults(fuseResults) {
  const container = document.getElementById('results');
  container.innerHTML = '';

  // Split into bookmarks and tabs
  const bookmarkResults = fuseResults.filter(r => r.item.type === 'bookmark');
  const tabResults = fuseResults.filter(r => r.item.type === 'tab');

  let itemIndex = 0;

  if (bookmarkResults.length > 0) {
    const label = document.createElement('div');
    label.className = 'result-section-label';
    label.textContent = 'Bookmarks';
    container.appendChild(label);

    for (const result of bookmarkResults) {
      container.appendChild(
        createResultItem(result.item, itemIndex === 0, result.matches)
      );
      itemIndex++;
    }
  }

  if (tabResults.length > 0) {
    const label = document.createElement('div');
    label.className = 'result-section-label';
    label.textContent = 'Open Tabs';
    container.appendChild(label);

    for (const result of tabResults) {
      container.appendChild(
        createResultItem(result.item, itemIndex === 0, result.matches)
      );
      itemIndex++;
    }
  }

  if (fuseResults.length === 0) {
    container.innerHTML = '<div class="empty-recent">No matches found</div>';
  }
}

function createResultItem(item, isSelected, matches) {
  const el = document.createElement('div');
  el.className = 'result-item' + (isSelected ? ' selected' : '');

  const isUnbookmarked = item.type === 'tab';

  // Favicon
  const favicon = document.createElement('div');
  favicon.className = 'result-favicon' + (item.favicon ? '' : (isUnbookmarked ? ' unbookmarked' : ' placeholder'));
  if (item.favicon) {
    const img = document.createElement('img');
    img.src = item.favicon;
    img.onerror = () => {
      img.remove();
      favicon.textContent = item.title.charAt(0).toUpperCase();
      favicon.classList.add(isUnbookmarked ? 'unbookmarked' : 'placeholder');
    };
    favicon.appendChild(img);
  } else {
    favicon.textContent = item.title.charAt(0).toUpperCase();
  }
  el.appendChild(favicon);

  // Info
  const info = document.createElement('div');
  info.className = 'result-info';

  const title = document.createElement('div');
  title.className = 'result-title' + (isUnbookmarked ? ' unbookmarked' : '');

  // Highlight fuzzy matches
  if (matches && matches.length > 0) {
    const titleMatch = matches.find(m => m.key === 'title');
    if (titleMatch) {
      title.innerHTML = highlightMatches(item.title, titleMatch.indices);
    } else {
      title.textContent = item.title;
    }
  } else {
    title.textContent = item.title;
  }

  info.appendChild(title);

  if (item.breadcrumb) {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'result-breadcrumb';
    breadcrumb.textContent = item.breadcrumb;
    info.appendChild(breadcrumb);
  }

  el.appendChild(info);

  // Open dot
  if (item.isOpen && !isUnbookmarked) {
    const dot = document.createElement('div');
    dot.className = 'result-dot';
    el.appendChild(dot);
  }

  // Click handler
  el.addEventListener('click', () => navigateTo(item));

  return el;
}

function highlightMatches(text, indices) {
  let result = '';
  let lastIndex = 0;

  // Merge overlapping indices
  const merged = [];
  for (const [start, end] of indices) {
    if (merged.length > 0 && start <= merged[merged.length - 1][1] + 1) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end);
    } else {
      merged.push([start, end]);
    }
  }

  for (const [start, end] of merged) {
    result += escapeHtml(text.substring(lastIndex, start));
    result += `<mark>${escapeHtml(text.substring(start, end + 1))}</mark>`;
    lastIndex = end + 1;
  }

  result += escapeHtml(text.substring(lastIndex));
  return result;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- Navigation ---

async function navigateTo(item) {
  await sendMessage(MSG.NAVIGATE_TO, {
    tabId: item.tabId || null,
    url: item.url,
  });
  window.close();
}

// --- Load Fuse.js then init ---

const script = document.createElement('script');
script.src = '../lib/fuse.min.js';
script.onload = () => init();
document.head.appendChild(script);
```

- [ ] **Step 4: Commit**

```bash
git add popup/popup.html popup/popup.css popup/popup.js
git commit -m "feat: add popup with fuzzy search, keyboard navigation, and result highlighting"
```

---

### Task 12: Download External Libraries

**Files:**
- Create: `lib/sortable.min.js`
- Create: `lib/fuse.min.js`

- [ ] **Step 1: Download SortableJS**

```bash
curl -o lib/sortable.min.js https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js
```

- [ ] **Step 2: Download Fuse.js**

```bash
curl -o lib/fuse.min.js https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js
```

- [ ] **Step 3: Verify files downloaded**

```bash
ls -la lib/
```

Expected: Both files exist with reasonable file sizes (Sortable ~30KB, Fuse ~25KB)

- [ ] **Step 4: Commit**

```bash
git add lib/
git commit -m "feat: add SortableJS and Fuse.js vendor libraries"
```

---

### Task 13: Verify Icons Exist

Icons were created in Task 1 Step 5. If they don't exist (canvas package wasn't available), the extension will still load — Chrome uses a default icon.

- [ ] **Step 1: Verify icon files**

```bash
ls -la icons/
```

If empty, the extension will work without icons for development. Create proper icons before publishing.

---

## Chunk 6: Integration & Manual Testing

### Task 14: End-to-End Integration Test

This task verifies everything works together by loading the extension in Chrome.

- [ ] **Step 1: Create directory structure if not already done**

```bash
mkdir -p background sidepanel popup components shared lib tests icons
```

Verify all files exist:

```bash
ls manifest.json
ls background/service-worker.js background/storage.js background/tab-matcher.js background/broadcaster.js
ls sidepanel/sidepanel.html sidepanel/sidepanel.js sidepanel/render.js sidepanel/dialogs.js sidepanel/context-menu.js sidepanel/sidepanel.css
ls popup/popup.html popup/popup.js popup/popup.css
ls components/bookmark-item.js components/group-header.js components/search-bar.js
ls shared/messages.js shared/styles.css
ls lib/sortable.min.js lib/fuse.min.js
```

- [ ] **Step 2: Load extension in Chrome**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the `junkie/` project directory
5. Verify extension loads without errors (check for red error badges)

- [ ] **Step 3: Test side panel**

1. Click the Junkie extension icon in the toolbar
2. Open the side panel (right-click icon → "Open side panel" or via Chrome's side panel button)
3. Verify: Empty state message shows "No bookmarks yet"
4. Click "+" to add a group → verify dialog opens
5. Create a group "Work Tools" with Blue color → verify it appears
6. Open several tabs (GitHub, etc.)
7. Verify: "Open Tabs" section shows unbookmarked tabs in amber
8. Drag an unbookmarked tab into the "Work Tools" group → verify it becomes a bookmark
9. Close that tab → verify the bookmark shows dimmed (closed state)
10. Reopen the same URL → verify green dot appears

- [ ] **Step 4: Test popup search**

1. Click the extension toolbar icon → popup opens
2. Verify: search input is auto-focused
3. Verify: recent bookmarks show (if any)
4. Type a partial title → verify fuzzy match results
5. Use arrow keys to navigate, Enter to open → verify tab switches or opens
6. Press Esc → verify popup closes

- [ ] **Step 5: Test context menu**

1. Right-click a group header → verify "Rename", "Change Color", "Delete Group" options
2. Right-click a bookmark → verify "Remove Bookmark" option
3. Test rename and delete actions

- [ ] **Step 6: Test edge cases**

1. Close and reopen Chrome → verify bookmarks persist
2. Close side panel and open new tabs → reopen side panel → verify state is current
3. Open the same URL in two tabs → verify only one bookmark shows the open indicator

- [ ] **Step 7: Run unit tests**

```bash
node --test tests/tab-matcher.test.js
node --test tests/storage.test.js
```

Expected: All tests pass.

- [ ] **Step 8: Final commit (if any files changed)**

```bash
git status
# Only stage specific files if changes were made during testing
# Do NOT use git add -A — the .gitignore should catch most things, but be explicit
```

---

## Verification Checklist

After completing all tasks, verify:

1. **Extension loads** in Chrome without errors
2. **Side panel** renders groups, bookmarks, and unbookmarked tabs with correct visual states
3. **Color-coded groups** display correctly with the 8-color palette
4. **Drag-and-drop** works for reordering and promoting unbookmarked tabs
5. **Popup search** returns fuzzy matches with highlighted text and keyboard navigation
6. **Tab status** updates in real-time as tabs are opened/closed
7. **Data persists** across browser restarts
8. **Context menu** actions work (rename, change color, delete, remove bookmark)
9. **Unit tests** pass: `node --test tests/tab-matcher.test.js && node --test tests/storage.test.js`
