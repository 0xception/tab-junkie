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
    openSidePanel();
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

// --- Side Panel ---

async function openSidePanel() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab) {
      await chrome.sidePanel.open({ tabId: tab.id });
    }
  } catch {
    // Fallback: send message to service worker
    await sendMessage('open-side-panel');
  }
  window.close();
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
