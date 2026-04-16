import {
  MSG_LIST_ITEMS,
  MSG_LIST_GROUPS,
  MSG_GET_PREFERENCES,
  MSG_UPDATE_GROUP,
  MSG_NAVIGATE_TO_ITEM,
  MSG_STATE_CHANGED,
} from '../shared/messages.js';

import { GROUP_COLORS } from '../shared/constants.js';

/* =========================================================================
   DOM references
   ========================================================================= */

const skeletonEl = document.getElementById('skeleton');
const emptyStateEl = document.getElementById('empty-state');
const errorStateEl = document.getElementById('error-state');
const itemListEl = document.getElementById('item-list');

/* =========================================================================
   Collapsed groups state (panel-lifetime; persisted via MSG_UPDATE_GROUP)
   ========================================================================= */

const collapsedGroups = new Set();

/* =========================================================================
   Messaging (B3 — null guard)
   ========================================================================= */

async function sendMessage(type, payload = {}) {
  const resp = await chrome.runtime.sendMessage({ type, payload });
  if (!resp || !resp.ok) {
    throw new Error(resp?.error?.message ?? 'No response from service worker');
  }
  return resp.data;
}

/* =========================================================================
   Theme (B2 — sessionStorage sync, W3 — simplified darkMq)
   ========================================================================= */

let currentTheme = 'light';

function applyTheme(theme) {
  currentTheme = (theme === 'light' || theme === 'dark') ? theme : 'system';
  document.documentElement.setAttribute('data-theme', currentTheme);
  sessionStorage.setItem('tj-theme', currentTheme);
}

const darkMq = globalThis.matchMedia('(prefers-color-scheme: dark)');
darkMq.addEventListener('change', () => {
  if (currentTheme === 'system') {
    sessionStorage.setItem('tj-theme', 'system');
  }
});

/* =========================================================================
   Deterministic avatar color from title
   ========================================================================= */

const AVATAR_PALETTE = [
  '#2563eb', '#7c3aed', '#0d9488', '#dc2626',
  '#ea580c', '#db2777', '#4f46e5', '#ca8a04',
  '#64748b', '#059669', '#9333ea', '#0284c7',
];

function avatarColor(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

/* =========================================================================
   Rendering
   ========================================================================= */

function renderAll(items, groups, liveStates, driftRecords) {
  console.warn('[tab-junkie:renderAll] called with', items?.length, 'items,', groups?.length, 'groups. itemListEl:', itemListEl, 'hidden:', itemListEl?.hidden);
  if (!items.length && !groups.length) {
    skeletonEl.hidden = true;
    emptyStateEl.hidden = false;
    errorStateEl.hidden = true;
    itemListEl.hidden = true;
    return;
  }

  /* Map items by groupId */
  const byGroup = new Map();
  for (const item of items) {
    const gid = item.groupId ?? null;
    if (!byGroup.has(gid)) byGroup.set(gid, []);
    byGroup.get(gid).push(item);
  }

  /* Sort items within each group by sortOrder */
  for (const arr of byGroup.values()) {
    arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  /* Separate root groups and sub-groups */
  const rootGroups = [];
  const childGroupsByParent = new Map();

  const sortedGroups = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const g of sortedGroups) {
    if (g.parentId) {
      if (!childGroupsByParent.has(g.parentId)) childGroupsByParent.set(g.parentId, []);
      childGroupsByParent.get(g.parentId).push(g);
    } else {
      rootGroups.push(g);
    }
  }

  const fragment = document.createDocumentFragment();

  /* Render root groups (B6 — child groups nested inside parent's itemsContainer) */
  for (const group of rootGroups) {
    const section = buildGroupSection(group, byGroup, liveStates, driftRecords, false);

    /* Nest child groups inside parent's .group-items container */
    const children = childGroupsByParent.get(group.id);
    if (children) {
      const parentItems = section.querySelector('.group-items');
      for (const child of children) {
        const childSection = buildGroupSection(child, byGroup, liveStates, driftRecords, true);
        parentItems.appendChild(childSection);
      }
    }

    fragment.appendChild(section);
  }

  /* Ungrouped items (W2 — uses unified buildGroupSection) */
  const ungrouped = byGroup.get(null);
  if (ungrouped && ungrouped.length) {
    const syntheticGroup = {
      id: '__ungrouped__',
      name: 'Ungrouped',
      color: 'slate',
      collapsed: collapsedGroups.has('__ungrouped__'),
    };
    /* Temporarily place ungrouped items under the synthetic id for buildGroupSection */
    byGroup.set('__ungrouped__', ungrouped);
    const section = buildGroupSection(syntheticGroup, byGroup, liveStates, driftRecords, false);
    fragment.appendChild(section);
  }

  itemListEl.replaceChildren(fragment);
  skeletonEl.hidden = true;
  emptyStateEl.hidden = true;
  errorStateEl.hidden = true;
  itemListEl.hidden = false;
}

/* --- Group section (W2 — unified, handles both real + ungrouped) ------- */

function buildGroupSection(group, byGroup, liveStates, driftRecords, isChild) {
  const section = document.createElement('div');
  section.className = 'group-section' + (isChild ? ' group-section--child' : '');
  section.setAttribute('role', 'listitem');

  const groupItems = byGroup.get(group.id) || [];
  const collapsed = collapsedGroups.has(group.id);

  /* Header */
  const header = document.createElement('div');
  header.className = 'group-header';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(!collapsed));
  header.setAttribute('aria-controls', 'group-items-' + group.id);
  header.dataset.groupId = group.id;

  /* Collapse icon */
  const collapseIcon = document.createElement('span');
  collapseIcon.className = 'group-header-collapse';
  collapseIcon.setAttribute('aria-hidden', 'true');
  collapseIcon.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 4.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* Color chip */
  const chip = document.createElement('span');
  chip.className = 'group-color-chip';
  if (GROUP_COLORS.includes(group.color)) {
    chip.classList.add('group-color-' + group.color);
  }

  /* Name */
  const name = document.createElement('span');
  name.className = 'group-header-name';
  name.textContent = group.name;

  /* Count */
  const count = document.createElement('span');
  count.className = 'group-header-count';
  count.textContent = String(groupItems.length);

  header.appendChild(collapseIcon);
  header.appendChild(chip);
  header.appendChild(name);
  header.appendChild(count);
  section.appendChild(header);

  /* Items container */
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'group-items';
  itemsContainer.id = 'group-items-' + group.id;
  if (collapsed) itemsContainer.hidden = true;

  for (const item of groupItems) {
    itemsContainer.appendChild(buildItemRow(item, liveStates, driftRecords));
  }

  section.appendChild(itemsContainer);
  return section;
}

/* --- Item row ---------------------------------------------------------- */

function buildItemRow(item, liveStates, driftRecords) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.setAttribute('role', 'listitem');
  row.setAttribute('tabindex', '0');
  row.dataset.itemId = item.id;

  const live = liveStates?.[item.id];
  const drifted = driftRecords?.[item.id];

  if (live?.live) row.dataset.live = 'true';
  if (live?.active) row.dataset.active = 'true';
  if (live?.audible) row.dataset.audible = 'true';
  if (drifted) row.dataset.drifted = 'true';

  /* Letter avatar for all items (favicon support deferred to B-004) */
  const avatar = document.createElement('div');
  avatar.className = 'item-avatar';
  const letter = (item.title || '?').charAt(0);
  avatar.textContent = letter;
  avatar.style.backgroundColor = avatarColor(item.title || '');
  row.appendChild(avatar);

  /* Text block */
  const textBlock = document.createElement('div');
  textBlock.className = 'item-text';

  const title = document.createElement('div');
  title.className = 'item-title';
  title.textContent = item.title || 'Untitled';

  const url = document.createElement('div');
  url.className = 'item-url';
  url.textContent = item.url || '';

  textBlock.appendChild(title);
  textBlock.appendChild(url);
  row.appendChild(textBlock);

  /* Indicators — only create when state is active */
  const needsAudible = live?.audible;
  const needsDrifted = !!drifted;

  if (needsAudible || needsDrifted) {
    const indicators = document.createElement('div');
    indicators.className = 'item-indicators';

    if (needsAudible) {
      const audibleIcon = document.createElement('span');
      audibleIcon.className = 'item-audible-icon';
      audibleIcon.setAttribute('aria-label', 'Playing audio');
      audibleIcon.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 5h2l3-3v10L4 9H2a1 1 0 01-1-1V6a1 1 0 011-1z" fill="currentColor"/><path d="M9.5 4.5a3.5 3.5 0 010 5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
      indicators.appendChild(audibleIcon);
    }

    if (needsDrifted) {
      const driftedIcon = document.createElement('span');
      driftedIcon.className = 'item-drifted-icon';
      driftedIcon.setAttribute('aria-label', 'URL drifted');
      driftedIcon.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1l6 11H1L7 1z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linejoin="round"/><path d="M7 5v3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="7" cy="10" r="0.8" fill="currentColor"/></svg>';
      indicators.appendChild(driftedIcon);
    }

    row.appendChild(indicators);
  }

  return row;
}

/* =========================================================================
   B1 — Patch live state without full re-render
   ========================================================================= */

async function refetchAndPatchLiveState() {
  const itemsResp = await sendMessage(MSG_LIST_ITEMS);
  const liveStates = itemsResp.liveStates || {};
  const driftRecords = itemsResp.driftRecords || {};

  const rows = itemListEl.querySelectorAll('[data-item-id]');
  for (const row of rows) {
    const id = row.dataset.itemId;
    const live = liveStates[id];
    const drifted = driftRecords[id];

    /* Update data attributes */
    if (live?.live) row.dataset.live = 'true'; else delete row.dataset.live;
    if (live?.active) row.dataset.active = 'true'; else delete row.dataset.active;
    if (live?.audible) row.dataset.audible = 'true'; else delete row.dataset.audible;
    if (drifted) row.dataset.drifted = 'true'; else delete row.dataset.drifted;

    /* Letter avatar always used (favicon deferred to B-004) — no swap needed */
  }
}

/* =========================================================================
   Event delegation
   ========================================================================= */

document.addEventListener('click', (e) => {
  const header = e.target.closest('.group-header');
  if (header) {
    toggleGroup(header);
    return;
  }

  const row = e.target.closest('.item-row');
  if (row) {
    navigateToItem(row);
    return;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;

  const header = e.target.closest('.group-header');
  if (header) {
    e.preventDefault();
    toggleGroup(header);
    return;
  }

  const row = e.target.closest('.item-row');
  if (row) {
    e.preventDefault();
    navigateToItem(row);
    return;
  }
});

function toggleGroup(header) {
  const groupId = header.dataset.groupId;
  const expanded = header.getAttribute('aria-expanded') === 'true';
  const controlsId = header.getAttribute('aria-controls');
  const itemsContainer = document.getElementById(controlsId);

  if (expanded) {
    header.setAttribute('aria-expanded', 'false');
    if (itemsContainer) itemsContainer.hidden = true;
    collapsedGroups.add(groupId);
  } else {
    header.setAttribute('aria-expanded', 'true');
    if (itemsContainer) itemsContainer.hidden = false;
    collapsedGroups.delete(groupId);
  }

  /* W1 — Persist ungrouped collapse to sessionStorage */
  if (groupId === '__ungrouped__') {
    sessionStorage.setItem('tj-ungrouped-collapsed', String(!expanded));
    return;
  }

  /* Persist collapse state for real groups */
  sendMessage(MSG_UPDATE_GROUP, {
    id: groupId,
    patch: { collapsed: !expanded },
  }).catch(() => {
    /* Non-critical — UI state is already updated */
  });
}

function navigateToItem(row) {
  const itemId = row.dataset.itemId;
  if (!itemId) return;
  sendMessage(MSG_NAVIGATE_TO_ITEM, { itemId }).catch((err) => {
    console.warn('[tab-junkie] navigate failed:', err?.message);
    /* Navigation failure — panel stays open */
  });
}

/* =========================================================================
   Broadcast listener (B4 — sender validation)
   ========================================================================= */

chrome.runtime.onMessage.addListener((msg, sender) => {
  console.warn('[tab-junkie:sidepanel] onMessage received:', msg?.type, 'from sender:', sender?.id, 'runtime.id:', chrome.runtime.id);
  if (sender.id !== chrome.runtime.id) return;
  if (msg.type !== MSG_STATE_CHANGED) return;

  const scope = msg.payload?.scope;

  /* B1 — liveState scope only patches attributes, no DOM rebuild */
  if (scope === 'liveState') {
    refetchAndPatchLiveState().catch((err) => {
      console.warn('[tab-junkie] live-state patch failed:', err);
    });
    return;
  }

  if (scope === 'items' || scope === 'groups') {
    Promise.all([
      sendMessage(MSG_LIST_ITEMS),
      sendMessage(MSG_LIST_GROUPS),
    ]).then(([itemsResp, groups]) => {
      console.warn('[tab-junkie:sidepanel] re-render data:', { itemCount: itemsResp?.items?.length, groupCount: groups?.length, itemsResp, groups });
      renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
    }).catch((err) => {
      console.warn('[tab-junkie] broadcast re-fetch failed:', err);
    });
  }

  if (scope === 'preferences') {
    sendMessage(MSG_GET_PREFERENCES).then((prefs) => {
      applyTheme(prefs.theme);
    }).catch(() => {});
  }
});

/* =========================================================================
   Initialization
   ========================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  /* W1 — Restore ungrouped collapse from sessionStorage */
  if (sessionStorage.getItem('tj-ungrouped-collapsed') === 'true') {
    collapsedGroups.add('__ungrouped__');
  }

  try {
    const prefs = await sendMessage(MSG_GET_PREFERENCES);
    applyTheme(prefs.theme);

    const [itemsResp, groups] = await Promise.all([
      sendMessage(MSG_LIST_ITEMS),
      sendMessage(MSG_LIST_GROUPS),
    ]);

    /* Restore collapsed state from groups */
    for (const g of groups) {
      if (g.collapsed) collapsedGroups.add(g.id);
    }

    renderAll(itemsResp.items, groups, itemsResp.liveStates, itemsResp.driftRecords);
  } catch {
    /* B5 — Show error state instead of empty state on init failure */
    skeletonEl.hidden = true;
    emptyStateEl.hidden = true;
    errorStateEl.hidden = false;
    itemListEl.hidden = true;
  }
});
