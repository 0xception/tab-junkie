// sidepanel/group-picker.js
// Unified modal for picking a group — used by context menu and bulk actions.

let pickerCallback = null;
let pickerSelectedIndex = 0;
let pickerItems = [];
let pickerData = null; // stored for filter re-renders

const overlay = () => document.getElementById('group-picker-overlay');
const listEl = () => document.getElementById('group-picker-list');
const inputEl = () => document.getElementById('group-picker-input');

/**
 * Open the group picker modal.
 * @param {Array} groups - All groups from state
 * @param {Array} bookmarks - All bookmarks from state (for counts)
 * @param {Object} floatingTabsByGroup - Floating tabs by group
 * @param {string|null} excludeGroupId - Group to exclude (current group)
 * @param {function} onSelect - Called with the selected group id
 * @param {Object} [options] - Position options
 * @param {string} [options.position] - 'bottom' (from bulk bar) or 'cursor' (from right-click)
 * @param {number} [options.x] - Cursor X for 'cursor' position
 * @param {number} [options.y] - Cursor Y for 'cursor' position
 */
export function openGroupPicker(groups, bookmarks, floatingTabsByGroup, excludeGroupId, onSelect, options = {}) {
  pickerCallback = onSelect;
  pickerData = { groups, bookmarks, floatingTabsByGroup, excludeGroupId };

  const ol = overlay();
  const picker = ol.querySelector('.group-picker');

  // Reset position classes
  ol.classList.remove('position-bottom', 'position-cursor');
  picker.style.removeProperty('left');
  picker.style.removeProperty('top');

  if (options.position === 'bottom') {
    ol.classList.add('position-bottom');
  } else if (options.position === 'cursor' && options.x != null && options.y != null) {
    ol.classList.add('position-cursor');
    // Position near cursor, then clamp after rendering
    requestAnimationFrame(() => {
      const rect = picker.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width - 8;
      const maxY = window.innerHeight - rect.height - 8;
      picker.style.left = `${Math.max(8, Math.min(options.x, maxX))}px`;
      picker.style.top = `${Math.max(8, Math.min(options.y, maxY))}px`;
    });
  }

  ol.classList.remove('hidden');
  const inp = inputEl();
  inp.value = '';
  renderPickerList(null);
  requestAnimationFrame(() => inp.focus());
}

export function closeGroupPicker() {
  overlay().classList.add('hidden');
  pickerCallback = null;
  pickerItems = [];
  pickerSelectedIndex = 0;
  pickerData = null;
}

function buildPickerGroups(excludeGroupId) {
  const { groups, bookmarks, floatingTabsByGroup } = pickerData;
  const items = [];

  const topLevel = groups
    .filter(g => g.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const group of topLevel) {
    if (group.id === excludeGroupId) continue;
    const count = bookmarks.filter(b => b.groupId === group.id).length +
      (floatingTabsByGroup[group.id]?.length || 0);
    items.push({ ...group, depth: 0, count });

    const subGroups = groups
      .filter(g => g.parentId === group.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const sub of subGroups) {
      if (sub.id === excludeGroupId) continue;
      const subCount = bookmarks.filter(b => b.groupId === sub.id).length +
        (floatingTabsByGroup[sub.id]?.length || 0);
      items.push({ ...sub, depth: 1, count: subCount });
    }
  }

  return items;
}

function renderPickerList(query) {
  const container = listEl();
  let allItems = buildPickerGroups(pickerData.excludeGroupId);

  if (query) {
    const q = query.toLowerCase();
    allItems = allItems.filter(g => g.name.toLowerCase().includes(q));
  }

  pickerItems = allItems;
  pickerSelectedIndex = 0;
  container.innerHTML = '';

  if (allItems.length === 0) {
    container.innerHTML = '<div class="group-picker-empty">No groups</div>';
    return;
  }

  for (let i = 0; i < allItems.length; i++) {
    const group = allItems[i];
    const el = document.createElement('div');
    el.className = 'group-picker-item' + (group.depth > 0 ? ' sub-group' : '') + (i === 0 ? ' selected' : '');

    const dot = document.createElement('span');
    dot.className = 'group-picker-dot';
    dot.style.background = `var(--group-${group.color})`;
    el.appendChild(dot);

    const name = document.createElement('span');
    name.className = 'group-picker-name';
    name.textContent = group.name;
    el.appendChild(name);

    const count = document.createElement('span');
    count.className = 'group-picker-count';
    count.textContent = `${group.count}`;
    el.appendChild(count);

    el.addEventListener('click', () => {
      if (pickerCallback) pickerCallback(group.id);
      closeGroupPicker();
    });

    container.appendChild(el);
  }
}

function updatePickerSelection() {
  const items = listEl().querySelectorAll('.group-picker-item');
  items.forEach((item, i) => {
    item.classList.toggle('selected', i === pickerSelectedIndex);
  });
  items[pickerSelectedIndex]?.scrollIntoView({ block: 'nearest' });
}

// --- Event listeners ---

// Close on overlay backdrop click (mousedown for reliable detection)
document.addEventListener('mousedown', (e) => {
  const el = overlay();
  if (!el || el.classList.contains('hidden')) return;
  // Close if click is on the overlay backdrop, not inside the picker
  if (!e.target.closest('.group-picker')) {
    closeGroupPicker();
  }
});

// Close when side panel loses focus (user clicked elsewhere in browser)
window.addEventListener('blur', () => {
  const el = overlay();
  if (el && !el.classList.contains('hidden')) {
    closeGroupPicker();
  }
});

// Keyboard: Escape, arrows, Enter
document.addEventListener('keydown', (e) => {
  const el = overlay();
  if (!el || el.classList.contains('hidden')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeGroupPicker();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    pickerSelectedIndex = Math.min(pickerSelectedIndex + 1, pickerItems.length - 1);
    updatePickerSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    pickerSelectedIndex = Math.max(pickerSelectedIndex - 1, 0);
    updatePickerSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const item = pickerItems[pickerSelectedIndex];
    if (item && pickerCallback) {
      pickerCallback(item.id);
      closeGroupPicker();
    }
  }
});

// Filter as user types
document.getElementById('group-picker-input').addEventListener('input', (e) => {
  if (pickerData) {
    renderPickerList(e.target.value || null);
  }
});
