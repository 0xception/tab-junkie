// popup/popup.js — Unified search + group jump popup
import { MSG } from '../shared/messages.js';
import { searchItemFromBookmark, searchItemFromTab } from '../shared/display-item.js';

let currentState = null;
let fuse = null;           // bookmark/tab search index
let groupFuse = null;      // group search index
let selectedIndex = 0;
let currentResults = [];   // search mode items
let currentItems = [];     // groups/drill mode items
let mode = 'search';       // 'search', 'groups', or 'drill'
let navStack = [];         // drill-in group id stack

// --- Communication ---

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

// --- Init ---

async function init() {
  currentState = await sendMessage(MSG.GET_STATE);

  // Check if Alt+K opened us in groups mode
  const { popupMode } = await chrome.storage.session.get('popupMode');
  if (popupMode === 'groups') {
    await chrome.storage.session.remove('popupMode');
    switchToMode('groups');
  } else {
    initFuse();
    renderRecent();
  }

  const searchBar = getActiveSearchBar();
  requestAnimationFrame(() => searchBar.focus());
}

function getActiveSearchBar() {
  if (mode === 'search') return document.querySelector('#search-mode search-bar');
  if (mode === 'groups') return document.querySelector('#groups-mode search-bar');
  return document.querySelector('#drill-view search-bar');
}

// ============================
// MODE SWITCHING
// ============================

function switchToMode(newMode) {
  if (newMode === mode) return;

  // Hide all views
  document.getElementById('search-mode').classList.add('hidden');
  document.getElementById('groups-mode').classList.add('hidden');
  document.getElementById('drill-view').classList.add('hidden');

  // Reset drill state when leaving groups/drill
  if (newMode === 'search' || newMode === 'groups') {
    navStack = [];
  }

  mode = newMode;
  selectedIndex = 0;

  if (newMode === 'search') {
    document.getElementById('search-mode').classList.remove('hidden');
    initFuse();
    renderRecent();
  } else if (newMode === 'groups') {
    document.getElementById('groups-mode').classList.remove('hidden');
    renderGroupList();
  }

  const searchBar = getActiveSearchBar();
  searchBar.clear();
  requestAnimationFrame(() => searchBar.focus());
}

// Mode tab click handlers
document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => switchToMode(tab.dataset.mode));
});

// ============================
// SEARCH MODE
// ============================

function initFuse() {
  if (!currentState) return;

  const items = [];

  for (const bookmark of currentState.bookmarks) {
    const group = currentState.groups.find(g => g.id === bookmark.groupId);
    const parentGroup = group?.parentId
      ? currentState.groups.find(g => g.id === group.parentId)
      : null;

    const breadcrumb = parentGroup
      ? `${parentGroup.name} \u2192 ${group.name}`
      : group?.name || '';

    items.push(searchItemFromBookmark(bookmark, { breadcrumb }));
  }

  for (const tab of currentState.unbookmarkedTabs) {
    items.push(searchItemFromTab(tab, { breadcrumb: 'Not bookmarked' }));
  }

  // Include floating tabs (open tabs assigned to groups via opener chain but not bookmarked)
  for (const [groupId, tabs] of Object.entries(currentState.floatingTabsByGroup || {})) {
    const group = currentState.groups.find(g => g.id === groupId);
    for (const tab of tabs) {
      items.push(searchItemFromTab(tab, { breadcrumb: group?.name || '' }));
    }
  }

  fuse = new Fuse(items, {
    keys: ['title', 'url'],
    threshold: 0.4,
    ignoreLocation: true,
    includeMatches: true,
  });
}

// Search events for search mode
document.querySelector('#search-mode').addEventListener('search', (e) => {
  const { query } = e.detail;
  if (!query) { renderRecent(); return; }
  if (!fuse) return;

  const results = fuse.search(query);
  const bookmarkResults = results.filter(r => r.item.type === 'bookmark');
  const tabResults = results.filter(r => r.item.type === 'tab');
  currentResults = [...bookmarkResults, ...tabResults].map(r => r.item);
  selectedIndex = 0;
  renderSearchResults(results);
});

document.querySelector('#search-mode').addEventListener('search-key', (e) => {
  handleSearchModeKey(e.detail.key);
});

function handleSearchModeKey(key) {
  const items = document.querySelectorAll('#results .result-item');

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
}

function renderRecent() {
  const container = document.getElementById('results');

  if (!currentState) {
    container.innerHTML = '<div class="empty-recent">No tabs or bookmarks</div>';
    return;
  }

  const items = [];

  for (const bm of currentState.bookmarks) {
    const group = currentState.groups.find(g => g.id === bm.groupId);
    let recency = bm.lastAccessedAt || bm.createdAt || 0;
    if (bm.isOpen && bm.tabLastAccessed) {
      recency = Math.max(recency, bm.tabLastAccessed);
    }

    items.push(searchItemFromBookmark(bm, { breadcrumb: group?.name || '', recency }));
  }

  for (const tab of currentState.unbookmarkedTabs) {
    items.push(searchItemFromTab(tab, { breadcrumb: 'Not bookmarked', recency: tab.lastAccessed || 0 }));
  }

  // Include floating tabs (open tabs assigned to groups via opener chain)
  for (const [groupId, tabs] of Object.entries(currentState.floatingTabsByGroup || {})) {
    const group = currentState.groups.find(g => g.id === groupId);
    for (const tab of tabs) {
      items.push(searchItemFromTab(tab, { breadcrumb: group?.name || '', recency: tab.lastAccessed || 0 }));
    }
  }

  items.sort((a, b) => b.recency - a.recency);

  currentResults = items.slice(0, 20);
  selectedIndex = 0;

  if (currentResults.length === 0) {
    container.innerHTML = '<div class="empty-recent">No tabs or bookmarks</div>';
    return;
  }

  container.innerHTML = '';
  const label = document.createElement('div');
  label.className = 'result-section-label';
  label.textContent = 'Recent';
  container.appendChild(label);

  for (let i = 0; i < currentResults.length; i++) {
    container.appendChild(createResultItem(currentResults[i], i === 0, null));
  }
}

function renderSearchResults(fuseResults) {
  const container = document.getElementById('results');
  container.innerHTML = '';

  const bookmarkResults = fuseResults.filter(r => r.item.type === 'bookmark');
  const tabResults = fuseResults.filter(r => r.item.type === 'tab');

  let itemIndex = 0;

  if (bookmarkResults.length > 0) {
    const label = document.createElement('div');
    label.className = 'result-section-label';
    label.textContent = 'Bookmarks';
    container.appendChild(label);

    for (const result of bookmarkResults) {
      container.appendChild(createResultItem(result.item, itemIndex === 0, result.matches));
      itemIndex++;
    }
  }

  if (tabResults.length > 0) {
    const label = document.createElement('div');
    label.className = 'result-section-label';
    label.textContent = 'Open Tabs';
    container.appendChild(label);

    for (const result of tabResults) {
      container.appendChild(createResultItem(result.item, itemIndex === 0, result.matches));
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

  const info = document.createElement('div');
  info.className = 'result-info';

  const title = document.createElement('div');
  title.className = 'result-title' + (isUnbookmarked ? ' unbookmarked' : '');

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

  const urlMatch = matches && matches.find(m => m.key === 'url');
  if (urlMatch) {
    const urlEl = document.createElement('div');
    urlEl.className = 'result-url';
    urlEl.innerHTML = highlightMatches(item.url, urlMatch.indices);
    info.appendChild(urlEl);
  }

  if (item.breadcrumb) {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'result-breadcrumb';
    breadcrumb.textContent = item.breadcrumb;
    info.appendChild(breadcrumb);
  }

  el.appendChild(info);

  if (item.isOpen && !isUnbookmarked) {
    const dot = document.createElement('div');
    dot.className = 'result-dot';
    el.appendChild(dot);
  }

  el.addEventListener('click', () => navigateTo(item));
  return el;
}

// ============================
// GROUPS MODE
// ============================

function buildGroupList() {
  if (!currentState) return [];

  const groups = currentState.groups || [];
  const bookmarks = currentState.bookmarks || [];
  const floatingTabsByGroup = currentState.floatingTabsByGroup || {};
  const items = [];

  const topLevel = groups
    .filter(g => g.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const group of topLevel) {
    const counts = getGroupCounts(group.id, bookmarks, floatingTabsByGroup);
    items.push({ ...group, breadcrumb: null, depth: 0, ...counts });

    const subGroups = groups
      .filter(g => g.parentId === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const sub of subGroups) {
      const subCounts = getGroupCounts(sub.id, bookmarks, floatingTabsByGroup);
      items.push({ ...sub, breadcrumb: group.name, depth: 1, ...subCounts });
    }
  }

  return items;
}

function getGroupCounts(groupId, bookmarks, floatingTabsByGroup) {
  const groupBookmarks = bookmarks.filter(b => b.groupId === groupId);
  const floatingTabs = floatingTabsByGroup[groupId] || [];
  return {
    bookmarkCount: groupBookmarks.length,
    openCount: groupBookmarks.filter(b => b.isOpen).length + floatingTabs.length,
  };
}

function renderGroupList(query) {
  const container = document.getElementById('group-results');
  const allGroups = buildGroupList();

  if (allGroups.length === 0) {
    container.innerHTML = '<div class="empty-state">No groups</div>';
    currentItems = [];
    return;
  }

  groupFuse = new Fuse(allGroups, {
    keys: ['name', 'breadcrumb'],
    threshold: 0.4,
    ignoreLocation: true,
    includeMatches: true,
  });

  let displayItems;
  let matchesMap = new Map();

  if (query) {
    const results = groupFuse.search(query);
    displayItems = results.map(r => r.item);
    for (const r of results) matchesMap.set(r.item.id, r.matches);
  } else {
    displayItems = allGroups;
  }

  if (displayItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No matches</div>';
    currentItems = [];
    return;
  }

  currentItems = displayItems;
  selectedIndex = 0;

  container.innerHTML = '';
  for (let i = 0; i < displayItems.length; i++) {
    const item = displayItems[i];
    container.appendChild(createGroupItem(item, i === 0, matchesMap.get(item.id) || null));
  }
}

function createGroupItem(item, isSelected, matches) {
  const el = document.createElement('div');
  el.className = 'group-item' + (isSelected ? ' selected' : '') + (item.depth > 0 ? ' sub-group' : '');

  const dot = document.createElement('span');
  dot.className = 'group-dot';
  dot.style.background = `var(--group-${item.color})`;
  el.appendChild(dot);

  const info = document.createElement('div');
  info.className = 'group-info';

  const name = document.createElement('div');
  name.className = 'group-name';
  if (matches) {
    const nameMatch = matches.find(m => m.key === 'name');
    name.innerHTML = nameMatch ? highlightMatches(item.name, nameMatch.indices) : escapeHtml(item.name);
  } else {
    name.textContent = item.name;
  }
  info.appendChild(name);

  if (item.breadcrumb) {
    const bc = document.createElement('div');
    bc.className = 'group-breadcrumb';
    bc.textContent = item.breadcrumb + ' ›';
    info.appendChild(bc);
  }

  el.appendChild(info);

  const counts = document.createElement('div');
  counts.className = 'group-counts';
  const parts = [`${item.bookmarkCount} bookmark${item.bookmarkCount !== 1 ? 's' : ''}`];
  if (item.openCount > 0) parts.push(`${item.openCount} open`);
  counts.textContent = parts.join(' · ');
  el.appendChild(counts);

  el.addEventListener('click', () => {
    selectedIndex = currentItems.indexOf(item);
    drillInto(item);
  });

  return el;
}

// Groups mode search events
document.querySelector('#groups-mode').addEventListener('search', (e) => {
  renderGroupList(e.detail.query || null);
});

document.querySelector('#groups-mode').addEventListener('search-key', (e) => {
  handleGroupsModeKey(e.detail.key);
});

function handleGroupsModeKey(key) {
  const items = document.querySelectorAll('#group-results .group-item');

  if (key === 'ArrowDown') {
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (key === 'ArrowUp') {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection(items);
  } else if (key === 'Enter') {
    const item = currentItems[selectedIndex];
    if (item) drillInto(item);
  } else if (key === 'Escape') {
    window.close();
  }
}

// ============================
// DRILL-IN VIEW
// ============================

function renderDrillHeader(group, counts) {
  document.getElementById('drill-dot').style.background = `var(--group-${group.color})`;
  const nameEl = document.getElementById('drill-group-name');
  nameEl.textContent = group.name;
  nameEl.style.color = `var(--group-${group.color})`;

  const parts = [`${counts.bookmarkCount} bookmark${counts.bookmarkCount !== 1 ? 's' : ''}`];
  if (counts.openCount > 0) parts.push(`${counts.openCount} open`);
  document.getElementById('drill-counts').textContent = parts.join(' · ');
}

function drillInto(group) {
  navStack.push(group.id);
  mode = 'drill';

  document.getElementById('search-mode').classList.add('hidden');
  document.getElementById('groups-mode').classList.add('hidden');
  document.getElementById('drill-view').classList.remove('hidden');

  const counts = getGroupCounts(group.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
  renderDrillHeader(group, counts);

  const searchBar = getActiveSearchBar();
  searchBar.clear();
  renderDrillView(group.id);
  requestAnimationFrame(() => searchBar.focus());
}

function getGroupBookmarks(groupId) {
  return (currentState?.bookmarks || [])
    .filter(b => b.groupId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function getGroupSubGroups(groupId) {
  return (currentState?.groups || [])
    .filter(g => g.parentId === groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function renderDrillView(groupId, query) {
  const container = document.getElementById('drill-results');
  const bookmarks = getGroupBookmarks(groupId);
  const subGroups = getGroupSubGroups(groupId);
  const floatingTabs = currentState?.floatingTabsByGroup?.[groupId] || [];

  const bookmarkItems = bookmarks.map(bm => searchItemFromBookmark(bm));

  for (const tab of floatingTabs) {
    bookmarkItems.push(searchItemFromTab(tab));
  }

  const subGroupItems = subGroups.map(sg => {
    const counts = getGroupCounts(sg.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
    return { type: 'subgroup', ...sg, ...counts };
  });

  let displayBookmarks = bookmarkItems;
  let matchesMap = new Map();
  let displaySubGroups = subGroupItems;

  if (query) {
    const drillFuse = new Fuse(bookmarkItems, {
      keys: ['title', 'url'],
      threshold: 0.4,
      ignoreLocation: true,
      includeMatches: true,
    });
    const results = drillFuse.search(query);
    displayBookmarks = results.map(r => r.item);
    for (const r of results) matchesMap.set(r.item.bookmarkId || r.item.tabId, r.matches);

    displaySubGroups = subGroupItems.filter(sg =>
      sg.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  currentItems = [...displayBookmarks, ...displaySubGroups];
  selectedIndex = 0;
  container.innerHTML = '';

  if (currentItems.length === 0) {
    container.innerHTML = '<div class="empty-state">No items</div>';
    return;
  }

  for (let i = 0; i < displayBookmarks.length; i++) {
    const item = displayBookmarks[i];
    container.appendChild(createDrillBookmarkItem(item, i === 0, matchesMap.get(item.bookmarkId || item.tabId) || null));
  }

  if (displaySubGroups.length > 0) {
    const label = document.createElement('div');
    label.className = 'drill-section-label';
    label.textContent = 'Sub-groups';
    container.appendChild(label);

    for (const sg of displaySubGroups) {
      const el = document.createElement('div');
      el.className = 'group-item' + (currentItems.indexOf(sg) === 0 && displayBookmarks.length === 0 ? ' selected' : '');

      const dot = document.createElement('span');
      dot.className = 'group-dot';
      dot.style.background = `var(--group-${sg.color})`;
      el.appendChild(dot);

      const info = document.createElement('div');
      info.className = 'group-info';
      const name = document.createElement('div');
      name.className = 'group-name';
      name.textContent = sg.name;
      info.appendChild(name);
      const countsEl = document.createElement('div');
      countsEl.className = 'group-breadcrumb';
      const parts = [`${sg.bookmarkCount} bookmark${sg.bookmarkCount !== 1 ? 's' : ''}`];
      if (sg.openCount > 0) parts.push(`${sg.openCount} open`);
      countsEl.textContent = parts.join(' · ');
      info.appendChild(countsEl);
      el.appendChild(info);

      el.addEventListener('click', () => {
        const group = currentState.groups.find(g => g.id === sg.id);
        if (group) drillInto({ ...group, ...getGroupCounts(sg.id, currentState.bookmarks, currentState.floatingTabsByGroup || {}) });
      });

      container.appendChild(el);
    }
  }
}

function createDrillBookmarkItem(item, isSelected, matches) {
  const el = document.createElement('div');
  el.className = 'result-item' + (isSelected ? ' selected' : '');

  const isFloatingTab = item.type === 'tab';

  const favicon = document.createElement('div');
  favicon.className = 'result-favicon' + (item.favicon ? '' : (isFloatingTab ? ' unbookmarked' : ' placeholder'));
  if (item.favicon) {
    const img = document.createElement('img');
    img.src = item.favicon;
    img.onerror = () => { img.remove(); favicon.textContent = (item.title || '?').charAt(0).toUpperCase(); favicon.classList.add(isFloatingTab ? 'unbookmarked' : 'placeholder'); };
    favicon.appendChild(img);
  } else {
    favicon.textContent = (item.title || '?').charAt(0).toUpperCase();
  }
  el.appendChild(favicon);

  const info = document.createElement('div');
  info.className = 'result-info';

  const title = document.createElement('div');
  title.className = 'result-title' + (isFloatingTab ? ' unbookmarked' : '');
  if (matches) {
    const titleMatch = matches.find(m => m.key === 'title');
    title.innerHTML = titleMatch ? highlightMatches(item.title, titleMatch.indices) : escapeHtml(item.title);
  } else {
    title.textContent = item.title;
  }
  info.appendChild(title);

  const urlEl = document.createElement('div');
  urlEl.className = 'result-url';
  if (matches) {
    const urlMatch = matches.find(m => m.key === 'url');
    urlEl.innerHTML = urlMatch ? highlightMatches(item.url, urlMatch.indices) : escapeHtml(item.url);
  } else {
    urlEl.textContent = item.url;
  }
  info.appendChild(urlEl);
  el.appendChild(info);

  // Open dot only for bookmarked items, not floating tabs
  if (item.isOpen && !isFloatingTab) {
    const dot = document.createElement('div');
    dot.className = 'result-dot';
    el.appendChild(dot);
  }

  el.addEventListener('click', () => navigateToDrillItem(item));
  return el;
}

// Drill view search events
document.querySelector('#drill-view').addEventListener('search', (e) => {
  const groupId = navStack[navStack.length - 1];
  if (groupId) renderDrillView(groupId, e.detail.query || null);
});

document.querySelector('#drill-view').addEventListener('search-key', (e) => {
  handleDrillKey(e.detail.key);
});

document.getElementById('back-btn').addEventListener('click', goBack);

function handleDrillKey(key) {
  const items = document.querySelectorAll('#drill-results .result-item, #drill-results .group-item');

  if (key === 'ArrowDown') {
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (key === 'ArrowUp') {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection(items);
  } else if (key === 'Enter') {
    const item = currentItems[selectedIndex];
    if (item) navigateToDrillItem(item);
  } else if (key === 'Escape') {
    window.close();
  }
}

// ============================
// NAVIGATION
// ============================

function goBack() {
  navStack.pop();

  if (navStack.length === 0) {
    // Return to groups mode
    mode = 'groups';
    document.getElementById('drill-view').classList.add('hidden');
    document.getElementById('groups-mode').classList.remove('hidden');

    const searchBar = getActiveSearchBar();
    searchBar.clear();
    renderGroupList();
    requestAnimationFrame(() => searchBar.focus());
  } else {
    const parentGroupId = navStack[navStack.length - 1];
    const group = currentState.groups.find(g => g.id === parentGroupId);
    if (group) {
      const counts = getGroupCounts(group.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
      renderDrillHeader(group, counts);
      const searchBar = getActiveSearchBar();
      searchBar.clear();
      renderDrillView(parentGroupId);
      requestAnimationFrame(() => searchBar.focus());
    }
  }
}

async function navigateTo(item) {
  await sendMessage(MSG.NAVIGATE_TO, {
    tabId: item.tabId || null,
    url: item.url,
    bookmarkId: item.bookmarkId || null,
  });
  window.close();
}

async function navigateToDrillItem(item) {
  if (item.type === 'subgroup') {
    const group = currentState.groups.find(g => g.id === item.id);
    if (group) drillInto({ ...group, ...getGroupCounts(group.id, currentState.bookmarks, currentState.floatingTabsByGroup || {}) });
    return;
  }

  await sendMessage(MSG.NAVIGATE_TO, {
    tabId: item.tabId || null,
    url: item.url,
    bookmarkId: item.bookmarkId || null,
  });
  window.close();
}

async function openJunkie() {
  // In groups/drill mode, also scroll to the selected group
  if (mode === 'groups' || mode === 'drill') {
    const groupId = mode === 'drill'
      ? navStack[navStack.length - 1]
      : currentItems[selectedIndex]?.id;

    if (groupId) {
      // Open side panel first, then scroll
      await openSidePanel();
      setTimeout(async () => {
        await sendMessage(MSG.SCROLL_TO_GROUP, { groupId });
        window.close();
      }, 150);
      return;
    }
  }

  await openSidePanel();
  window.close();
}

async function openSidePanel() {
  const viewModePreference = currentState?.preferences?.viewMode;
  if (viewModePreference === 'window') {
    await sendMessage(MSG.OPEN_JUNKIE_WINDOW);
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) await chrome.sidePanel.open({ tabId: tab.id });
    } catch {
      // Fallback silently
    }
  }
}

// ============================
// KEYBOARD — GLOBAL HANDLERS
// ============================

document.addEventListener('keydown', (e) => {
  // Tab → open full view (side panel or scroll to group)
  if (e.key === 'Tab') {
    e.preventDefault();
    openJunkie();
    return;
  }

  // Alt+G → switch to groups mode
  if (e.altKey && (e.key === 'g' || e.key === 'G')) {
    e.preventDefault();
    if (mode === 'drill') {
      // From drill, go back to groups list
      navStack = [];
      mode = 'search'; // temp so switchToMode works
      switchToMode('groups');
    } else {
      switchToMode('groups');
    }
    return;
  }

  // Alt+S → switch to search mode
  if (e.altKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    switchToMode('search');
    return;
  }

  // Backspace to go back (only when search is empty and in drill view)
  if (e.key === 'Backspace' && mode === 'drill') {
    const searchBar = getActiveSearchBar();
    if (searchBar.value === '') {
      e.preventDefault();
      goBack();
    }
  }
});

// ============================
// SHARED HELPERS
// ============================

function updateSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedIndex);
  });
  items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

function highlightMatches(text, indices) {
  let result = '';
  let lastIndex = 0;

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

// ============================
// BOOTSTRAP
// ============================

// Listen for close message from service worker (Alt+K toggle)
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'popup-close') {
    window.close();
  }
});

const script = document.createElement('script');
script.src = '../lib/fuse.min.js';
script.onload = () => init();
document.head.appendChild(script);
