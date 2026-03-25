// group-jump/group-jump.js
import { MSG } from '../shared/messages.js';

let currentState = null;
let groupFuse = null;
let selectedIndex = 0;
let currentItems = [];       // currently visible items (groups or bookmarks)
let viewMode = 'groups';     // 'groups' or 'drill'
let navStack = [];           // stack of drilled-into group ids

// --- Communication ---

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

// --- Init ---

async function init() {
  currentState = await sendMessage(MSG.GET_STATE);
  renderGroupList();

  const searchBar = getActiveSearchBar();
  requestAnimationFrame(() => searchBar.focus());
}

function getActiveSearchBar() {
  if (viewMode === 'groups') {
    return document.querySelector('#group-list-view search-bar');
  }
  return document.querySelector('#drill-view search-bar');
}

// --- Group List ---

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
    items.push({
      ...group,
      breadcrumb: null,
      depth: 0,
      bookmarkCount: counts.bookmarkCount,
      openCount: counts.openCount,
    });

    // Sub-groups
    const subGroups = groups
      .filter(g => g.parentId === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const sub of subGroups) {
      const subCounts = getGroupCounts(sub.id, bookmarks, floatingTabsByGroup);
      items.push({
        ...sub,
        breadcrumb: group.name,
        depth: 1,
        bookmarkCount: subCounts.bookmarkCount,
        openCount: subCounts.openCount,
      });
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

function initGroupFuse(items) {
  groupFuse = new Fuse(items, {
    keys: ['name', 'breadcrumb'],
    threshold: 0.4,
    ignoreLocation: true,
    includeMatches: true,
  });
}

function renderGroupList(query) {
  const container = document.getElementById('group-results');
  const allGroups = buildGroupList();

  if (allGroups.length === 0) {
    container.innerHTML = '<div class="empty-state">No groups</div>';
    currentItems = [];
    return;
  }

  initGroupFuse(allGroups);

  let displayItems;
  let matchesMap = new Map();

  if (query) {
    const results = groupFuse.search(query);
    displayItems = results.map(r => r.item);
    for (const r of results) {
      matchesMap.set(r.item.id, r.matches);
    }
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
    const matches = matchesMap.get(item.id) || null;
    container.appendChild(createGroupItem(item, i === 0, matches));
  }
}

function createGroupItem(item, isSelected, matches) {
  const el = document.createElement('div');
  el.className = 'group-item' + (isSelected ? ' selected' : '') + (item.depth > 0 ? ' sub-group' : '');

  // Color dot
  const dot = document.createElement('span');
  dot.className = 'group-dot';
  dot.style.background = `var(--group-${item.color})`;
  el.appendChild(dot);

  // Info
  const info = document.createElement('div');
  info.className = 'group-info';

  const name = document.createElement('div');
  name.className = 'group-name';
  if (matches) {
    const nameMatch = matches.find(m => m.key === 'name');
    if (nameMatch) {
      name.innerHTML = highlightMatches(item.name, nameMatch.indices);
    } else {
      name.textContent = item.name;
    }
  } else {
    name.textContent = item.name;
  }
  info.appendChild(name);

  if (item.breadcrumb) {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'group-breadcrumb';
    breadcrumb.textContent = item.breadcrumb + ' ›';
    info.appendChild(breadcrumb);
  }

  el.appendChild(info);

  // Counts
  const counts = document.createElement('div');
  counts.className = 'group-counts';
  const parts = [`${item.bookmarkCount} bookmark${item.bookmarkCount !== 1 ? 's' : ''}`];
  if (item.openCount > 0) {
    parts.push(`${item.openCount} open`);
  }
  counts.textContent = parts.join(' · ');
  el.appendChild(counts);

  // Click handler
  el.addEventListener('click', () => {
    selectedIndex = currentItems.indexOf(item);
    drillInto(item);
  });

  return el;
}

// --- Drill-In View ---

function renderDrillHeader(group, counts) {
  const dot = document.getElementById('drill-dot');
  dot.style.background = `var(--group-${group.color})`;

  const nameEl = document.getElementById('drill-group-name');
  nameEl.textContent = group.name;
  nameEl.style.color = `var(--group-${group.color})`;

  const countsEl = document.getElementById('drill-counts');
  const parts = [`${counts.bookmarkCount} bookmark${counts.bookmarkCount !== 1 ? 's' : ''}`];
  if (counts.openCount > 0) parts.push(`${counts.openCount} open`);
  countsEl.textContent = parts.join(' · ');
}

function drillInto(group) {
  navStack.push(group.id);
  viewMode = 'drill';

  // Show drill view, hide group view
  document.getElementById('group-list-view').classList.add('hidden');
  document.getElementById('drill-view').classList.remove('hidden');

  const counts = getGroupCounts(group.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
  renderDrillHeader(group, counts);

  // Clear search and render
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

  // Build bookmark items for Fuse
  const bookmarkItems = bookmarks.map(bm => ({
    type: 'bookmark',
    bookmarkId: bm.id,
    title: bm.title,
    url: bm.url,
    favicon: bm.favicon,
    isOpen: bm.isOpen,
    tabId: bm.tabId,
  }));

  // Add floating tabs
  for (const tab of floatingTabs) {
    bookmarkItems.push({
      type: 'tab',
      title: tab.title || tab.url,
      url: tab.url,
      favicon: tab.favIconUrl || null,
      isOpen: true,
      tabId: tab.id,
    });
  }

  // Sub-group items
  const subGroupItems = subGroups.map(sg => {
    const counts = getGroupCounts(sg.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
    return {
      type: 'subgroup',
      ...sg,
      bookmarkCount: counts.bookmarkCount,
      openCount: counts.openCount,
    };
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
    for (const r of results) {
      matchesMap.set(r.item.bookmarkId || r.item.tabId, r.matches);
    }

    // Also filter sub-groups by name
    displaySubGroups = subGroupItems.filter(sg =>
      sg.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  // Build combined item list for keyboard navigation
  currentItems = [...displayBookmarks, ...displaySubGroups];
  selectedIndex = 0;

  container.innerHTML = '';

  if (displayBookmarks.length === 0 && displaySubGroups.length === 0) {
    container.innerHTML = '<div class="empty-state">No items</div>';
    return;
  }

  // Render bookmarks
  for (let i = 0; i < displayBookmarks.length; i++) {
    const item = displayBookmarks[i];
    const matches = matchesMap.get(item.bookmarkId || item.tabId) || null;
    container.appendChild(createBookmarkItem(item, i === 0, matches));
  }

  // Render sub-groups
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

      const counts = document.createElement('div');
      counts.className = 'group-breadcrumb';
      const parts = [`${sg.bookmarkCount} bookmark${sg.bookmarkCount !== 1 ? 's' : ''}`];
      if (sg.openCount > 0) parts.push(`${sg.openCount} open`);
      counts.textContent = parts.join(' · ');
      info.appendChild(counts);

      el.appendChild(info);

      el.addEventListener('click', () => {
        const group = currentState.groups.find(g => g.id === sg.id);
        if (group) {
          const groupCounts = getGroupCounts(sg.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
          drillInto({ ...group, bookmarkCount: groupCounts.bookmarkCount, openCount: groupCounts.openCount });
        }
      });

      container.appendChild(el);
    }
  }
}

function createBookmarkItem(item, isSelected, matches) {
  const el = document.createElement('div');
  el.className = 'result-item' + (isSelected ? ' selected' : '');

  // Favicon
  const favicon = document.createElement('div');
  favicon.className = 'result-favicon' + (item.favicon ? '' : ' placeholder');
  if (item.favicon) {
    const img = document.createElement('img');
    img.src = item.favicon;
    img.onerror = () => {
      img.remove();
      favicon.textContent = (item.title || '?').charAt(0).toUpperCase();
      favicon.classList.add('placeholder');
    };
    favicon.appendChild(img);
  } else {
    favicon.textContent = (item.title || '?').charAt(0).toUpperCase();
  }
  el.appendChild(favicon);

  // Info
  const info = document.createElement('div');
  info.className = 'result-info';

  const title = document.createElement('div');
  title.className = 'result-title';
  if (matches) {
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

  const urlEl = document.createElement('div');
  urlEl.className = 'result-url';
  if (matches) {
    const urlMatch = matches.find(m => m.key === 'url');
    if (urlMatch) {
      urlEl.innerHTML = highlightMatches(item.url, urlMatch.indices);
    } else {
      urlEl.textContent = item.url;
    }
  } else {
    urlEl.textContent = item.url;
  }
  info.appendChild(urlEl);

  el.appendChild(info);

  // Open dot
  if (item.isOpen) {
    const dot = document.createElement('div');
    dot.className = 'result-dot';
    el.appendChild(dot);
  }

  // Click handler
  el.addEventListener('click', () => navigateToItem(item));

  return el;
}

// --- Navigation ---

function goBack() {
  navStack.pop();

  if (navStack.length === 0) {
    // Return to group list view
    viewMode = 'groups';
    document.getElementById('drill-view').classList.add('hidden');
    document.getElementById('group-list-view').classList.remove('hidden');

    const searchBar = getActiveSearchBar();
    searchBar.clear();
    renderGroupList();
    requestAnimationFrame(() => searchBar.focus());
  } else {
    // Re-render parent group without modifying navStack
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

async function navigateToItem(item) {
  if (item.type === 'subgroup') {
    const group = currentState.groups.find(g => g.id === item.id);
    if (group) {
      const counts = getGroupCounts(group.id, currentState.bookmarks, currentState.floatingTabsByGroup || {});
      drillInto({ ...group, bookmarkCount: counts.bookmarkCount, openCount: counts.openCount });
    }
    return;
  }

  await sendMessage(MSG.NAVIGATE_TO, {
    tabId: item.tabId || null,
    url: item.url,
    bookmarkId: item.bookmarkId || null,
  });
  window.close();
}

async function scrollPanelToGroup() {
  const groupId = viewMode === 'drill'
    ? navStack[navStack.length - 1]
    : currentItems[selectedIndex]?.id;

  if (!groupId) return;

  // Open the side panel or junkie window first
  const viewModePreference = currentState?.preferences?.viewMode;
  if (viewModePreference === 'window') {
    await sendMessage(MSG.OPEN_JUNKIE_WINDOW);
  } else {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch {
      // Fallback silently
    }
  }

  // Small delay to let the panel open and render
  setTimeout(async () => {
    await sendMessage(MSG.SCROLL_TO_GROUP, { groupId });
    window.close();
  }, 150);
}

// --- Keyboard Navigation ---

// Tab key (must be at document level before search-bar captures it)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    scrollPanelToGroup();
    return;
  }

  // Backspace to go back (only when search is empty and in drill view)
  if (e.key === 'Backspace' && viewMode === 'drill') {
    const searchBar = getActiveSearchBar();
    if (searchBar.value === '') {
      e.preventDefault();
      goBack();
    }
  }
});

// Search events from the group list view
document.querySelector('#group-list-view').addEventListener('search', (e) => {
  renderGroupList(e.detail.query || null);
});

document.querySelector('#group-list-view').addEventListener('search-key', (e) => {
  handleSearchKey(e.detail.key);
});

// Search events from the drill view
document.querySelector('#drill-view').addEventListener('search', (e) => {
  const groupId = navStack[navStack.length - 1];
  if (groupId) {
    renderDrillView(groupId, e.detail.query || null);
  }
});

document.querySelector('#drill-view').addEventListener('search-key', (e) => {
  handleSearchKey(e.detail.key);
});

// Back button
document.getElementById('back-btn').addEventListener('click', goBack);

function handleSearchKey(key) {
  const items = viewMode === 'groups'
    ? document.querySelectorAll('#group-results .group-item')
    : document.querySelectorAll('#drill-results .result-item, #drill-results .group-item');

  if (key === 'ArrowDown') {
    selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
    updateSelection(items);
  } else if (key === 'ArrowUp') {
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection(items);
  } else if (key === 'Enter') {
    const item = currentItems[selectedIndex];
    if (!item) return;

    if (viewMode === 'groups') {
      drillInto(item);
    } else {
      navigateToItem(item);
    }
  } else if (key === 'Escape') {
    window.close();
  }
}

function updateSelection(items) {
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === selectedIndex);
  });
  items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
}

// --- Highlight helpers ---

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

// --- Load Fuse.js then init ---

const script = document.createElement('script');
script.src = '../lib/fuse.min.js';
script.onload = () => init();
document.head.appendChild(script);
