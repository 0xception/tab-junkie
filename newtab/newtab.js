// newtab/newtab.js
import { MSG } from '../shared/messages.js';
import { applyTheme } from '../shared/themes.js';
import { searchItemFromBookmark, searchItemFromTab } from '../shared/display-item.js';
import { renderBookmarkTree } from '../sidepanel/render.js';

let currentState = null;
let fuse = null;
let filterQuery = '';
let lastFuseBookmarkCount = -1;
let lastFuseTabCount = -1;
let lastFuseGroupCount = -1;

function sendMessage(type, payload) {
  return chrome.runtime.sendMessage({ type, payload });
}

// --- Search ---

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  chrome.search.query({ text: query, disposition: 'CURRENT_TAB' });
});

// --- Preference check & init ---

async function init() {
  const { junkie_preferences } = await chrome.storage.local.get('junkie_preferences');
  const enabled = junkie_preferences?.newTabEnabled ?? true;

  if (!enabled) {
    document.getElementById('disabled-footer').classList.remove('hidden');
    return;
  }

  // Show bookmarks section
  document.getElementById('bookmarks-section').classList.remove('hidden');
  // Reduce search section padding when bookmarks are shown
  document.getElementById('search-section').style.paddingTop = '8vh';

  // Fetch state and render
  currentState = await sendMessage(MSG.GET_STATE);
  applyTheme(currentState?.preferences?.theme || 'default');
  render();

  // Filter
  setupFilter();

  // Listen for state updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === MSG.STATE_UPDATED) {
      currentState = message.payload;
      applyTheme(currentState.preferences?.theme || 'default');
      render();
    }
  });
}

// --- Rendering ---

function render() {
  if (!currentState) return;
  buildFuseIndex();

  if (filterQuery) {
    renderFilterResults(filterQuery);
  } else {
    const container = document.getElementById('bookmark-grid');
    container.classList.remove('hidden');
    const resultsEl = document.getElementById('newtab-filter-results');
    if (resultsEl) resultsEl.remove();
    renderBookmarkTree(container, currentState, {
      initDragAndDrop: () => {},
      selectedIds: new Map(),
    });
    applyGroupColors();
  }
}

function applyGroupColors() {
  const sections = document.querySelectorAll('.bookmark-grid .group-section[data-group-id]');
  if (!currentState) return;
  for (const section of sections) {
    const groupId = section.dataset.groupId;
    const group = currentState.groups.find(g => g.id === groupId);
    if (group?.color) {
      const cssColor = group.color.startsWith('#') ? group.color : `var(--group-${group.color})`;
      section.style.setProperty('--group-color', cssColor);
    }
  }
}

// --- Filter ---

function setupFilter() {
  const input = document.getElementById('filter-input');
  const clearBtn = document.getElementById('filter-clear');

  input.addEventListener('input', () => {
    filterQuery = input.value.trim();
    clearBtn.classList.toggle('hidden', !filterQuery);
    render();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    filterQuery = '';
    clearBtn.classList.add('hidden');
    render();
    input.focus();
  });
}

function buildFuseIndex() {
  if (!currentState) return;

  const bmCount = currentState.bookmarks.length;
  const tabCount = currentState.unbookmarkedTabs.length;
  const grpCount = currentState.groups.length;
  if (fuse && bmCount === lastFuseBookmarkCount && tabCount === lastFuseTabCount && grpCount === lastFuseGroupCount) {
    return;
  }
  lastFuseBookmarkCount = bmCount;
  lastFuseTabCount = tabCount;
  lastFuseGroupCount = grpCount;

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
    items.push(searchItemFromTab(tab, { breadcrumb: 'Open Tabs' }));
  }

  fuse = new Fuse(items, {
    keys: ['title', 'url'],
    threshold: 0.4,
    ignoreLocation: true,
    includeMatches: true,
  });
}

function renderFilterResults(query) {
  if (!fuse) return;

  const container = document.getElementById('bookmark-grid');
  container.classList.add('hidden');

  let resultsEl = document.getElementById('newtab-filter-results');
  if (!resultsEl) {
    resultsEl = document.createElement('div');
    resultsEl.id = 'newtab-filter-results';
    resultsEl.className = 'newtab-filter-results';
    container.parentNode.insertBefore(resultsEl, container.nextSibling);
  }
  resultsEl.innerHTML = '';

  const results = fuse.search(query);

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="newtab-filter-empty">No matches</div>';
    return;
  }

  for (const result of results) {
    const item = result.item;
    const matches = result.matches;
    const el = document.createElement('div');
    el.className = 'newtab-filter-result';

    // Favicon
    const favicon = document.createElement('div');
    favicon.className = 'newtab-filter-result-favicon' + (item.favicon ? '' : ' placeholder');
    if (item.favicon) {
      const img = document.createElement('img');
      img.src = item.favicon;
      img.onerror = () => {
        img.remove();
        favicon.textContent = item.title.charAt(0).toUpperCase();
        favicon.classList.add('placeholder');
      };
      favicon.appendChild(img);
    } else {
      favicon.textContent = item.title.charAt(0).toUpperCase();
    }
    el.appendChild(favicon);

    // Info
    const info = document.createElement('div');
    info.className = 'newtab-filter-result-info';

    const title = document.createElement('div');
    title.className = 'newtab-filter-result-title';
    const titleMatch = matches?.find(m => m.key === 'title');
    if (titleMatch) {
      title.innerHTML = highlightMatches(item.title, titleMatch.indices);
    } else {
      title.textContent = item.title;
    }
    info.appendChild(title);

    if (item.breadcrumb) {
      const breadcrumb = document.createElement('div');
      breadcrumb.className = 'newtab-filter-result-breadcrumb';
      breadcrumb.textContent = item.breadcrumb;
      info.appendChild(breadcrumb);
    }

    el.appendChild(info);

    // Open dot
    if (item.isOpen) {
      const dot = document.createElement('div');
      dot.className = 'newtab-filter-result-dot';
      el.appendChild(dot);
    }

    // Click → navigate
    el.addEventListener('click', () => {
      sendMessage(MSG.NAVIGATE_TO, {
        tabId: item.tabId || null,
        url: item.url,
        bookmarkId: item.bookmarkId || null,
      });
    });

    resultsEl.appendChild(el);
  }
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

// --- Event Handlers (from web components) ---

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

// --- Init ---
init();
