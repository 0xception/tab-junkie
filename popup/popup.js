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
      ? `${parentGroup.name} \u2192 ${group.name}`
      : group?.name || '';

    items.push({
      type: 'bookmark',
      bookmarkId: bookmark.id,
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
    keys: ['title', 'url'],
    threshold: 0.4,
    ignoreLocation: true,
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
  // Build currentResults in the same order as rendered: bookmarks first, then tabs
  const bookmarkResults = results.filter(r => r.item.type === 'bookmark');
  const tabResults = results.filter(r => r.item.type === 'tab');
  currentResults = [...bookmarkResults, ...tabResults].map(r => r.item);
  selectedIndex = 0;

  renderResults(results);
});

// --- Keyboard Navigation ---

// Tab key opens the side panel (must be handled at document level before search-bar)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    openJunkie();
  }
});

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

  if (!currentState) {
    container.innerHTML = '<div class="empty-recent">No tabs or bookmarks</div>';
    return;
  }

  // Build a unified list of bookmarks and unbookmarked tabs, sorted by recency.
  // Chrome tabs have lastAccessed (ms timestamp). For open bookmarks, use the
  // tab's lastAccessed so we match Chrome's sense of recency. For closed
  // bookmarks, fall back to our own lastAccessedAt, then createdAt.
  const items = [];

  for (const bm of currentState.bookmarks) {
    const group = currentState.groups.find(g => g.id === bm.groupId);
    // Use Chrome's tab lastAccessed for open bookmarks, our lastAccessedAt for closed ones
    let recency = bm.lastAccessedAt || bm.createdAt || 0;
    if (bm.isOpen && bm.tabLastAccessed) {
      recency = Math.max(recency, bm.tabLastAccessed);
    }

    items.push({
      type: 'bookmark',
      bookmarkId: bm.id,
      title: bm.title,
      url: bm.url,
      favicon: bm.favicon,
      isOpen: bm.isOpen,
      tabId: bm.tabId,
      breadcrumb: group?.name || '',
      recency,
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
      recency: tab.lastAccessed || 0,
    });
  }

  // Sort by most recently accessed
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

  // Show URL when it matched the search query
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

// --- Open Junkie (side panel or window, per preference) ---

async function openJunkie() {
  const viewMode = currentState?.preferences?.viewMode;
  if (viewMode === 'window') {
    await sendMessage(MSG.OPEN_JUNKIE_WINDOW);
  } else {
    // sidePanel.open() requires user gesture context — the popup has it
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ tabId: tab.id });
      }
    } catch {
      // Fallback silently
    }
  }
  window.close();
}

// --- Navigation ---

async function navigateTo(item) {
  await sendMessage(MSG.NAVIGATE_TO, {
    tabId: item.tabId || null,
    url: item.url,
    bookmarkId: item.bookmarkId || null,
  });
  window.close();
}

// --- Load Fuse.js then init ---

const script = document.createElement('script');
script.src = '../lib/fuse.min.js';
script.onload = () => init();
document.head.appendChild(script);
