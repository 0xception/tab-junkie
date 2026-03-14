// sidepanel/dialogs.js
import { MSG, GROUP_COLORS } from '../shared/messages.js';

/**
 * Set up the group dialog for both adding and editing groups.
 */
export function setupDialogs(sendMessage, getState) {
  const addGroupBtn = document.getElementById('add-group-btn');
  const dialog = document.getElementById('add-group-dialog');
  const dialogTitle = dialog.querySelector('h3');
  const nameInput = document.getElementById('group-name-input');
  const parentSelect = document.getElementById('group-parent-select');
  const parentLabel = document.getElementById('group-parent-label');
  const submitBtn = dialog.querySelector('.btn-primary');
  const colorPicker = document.getElementById('color-picker');

  let selectedColor = GROUP_COLORS[0].value;
  let editingGroupId = null; // null = adding, string = editing

  // Populate color picker
  for (const color of GROUP_COLORS) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.background = color.value;
    swatch.title = color.name;
    swatch.dataset.color = color.value;
    swatch.addEventListener('click', () => {
      colorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      selectedColor = color.value;
    });
    colorPicker.appendChild(swatch);
  }

  function selectColor(colorValue) {
    selectedColor = colorValue;
    colorPicker.querySelectorAll('.color-swatch').forEach(s => {
      s.classList.toggle('selected', s.dataset.color === colorValue);
    });
  }

  function populateParentSelect(excludeGroupId) {
    parentSelect.innerHTML = '<option value="">None (top-level)</option>';
    const state = getState();
    if (state) {
      const topGroups = state.groups.filter(g => g.parentId === null && g.id !== excludeGroupId);
      for (const group of topGroups) {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        parentSelect.appendChild(option);
      }
    }
  }

  // Add group button
  addGroupBtn.addEventListener('click', () => {
    editingGroupId = null;
    dialogTitle.textContent = 'New Group';
    submitBtn.textContent = 'Create';
    nameInput.value = '';
    parentLabel.classList.remove('hidden');
    populateParentSelect(null);
    selectColor(GROUP_COLORS[0].value);
    dialog.showModal();
  });

  dialog.querySelector('.btn-cancel').addEventListener('click', () => dialog.close());

  dialog.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;

    if (editingGroupId) {
      // Edit existing group
      await sendMessage(MSG.UPDATE_GROUP, {
        id: editingGroupId,
        name,
        color: selectedColor,
      });
    } else {
      // Add new group
      await sendMessage(MSG.ADD_GROUP, {
        name,
        parentId: parentSelect.value || null,
        color: selectedColor,
      });
    }
    dialog.close();
  });

  // --- Edit Bookmark Dialog ---
  const bmDialog = document.getElementById('edit-bookmark-dialog');
  const bmNameInput = document.getElementById('bookmark-name-input');
  const bmUrlInput = document.getElementById('bookmark-url-input');
  const bmGroupSelect = document.getElementById('bookmark-group-select');
  let editingBookmarkId = null;
  let editingBookmarkGroupId = null;

  bmDialog.querySelector('.btn-cancel').addEventListener('click', () => bmDialog.close());

  bmDialog.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = bmNameInput.value.trim();
    const url = bmUrlInput.value.trim();
    if (!title || !url || !editingBookmarkId) return;

    await sendMessage(MSG.UPDATE_BOOKMARK, { id: editingBookmarkId, title, url });

    const newGroupId = bmGroupSelect.value;
    if (newGroupId && newGroupId !== editingBookmarkGroupId) {
      await sendMessage(MSG.MOVE_BOOKMARK, {
        id: editingBookmarkId,
        groupId: newGroupId,
        sortOrder: 0,
      });
    }

    bmDialog.close();
  });

  // Expose functions to open dialogs
  return {
    openEditDialog(groupId) {
      const state = getState();
      const group = state?.groups.find(g => g.id === groupId);
      if (!group) return;

      editingGroupId = groupId;
      dialogTitle.textContent = 'Edit Group';
      submitBtn.textContent = 'Save';
      nameInput.value = group.name;
      parentLabel.classList.add('hidden');
      selectColor(group.color);
      dialog.showModal();
    },

    openEditBookmarkDialog(bookmarkId) {
      const state = getState();
      const bookmark = state?.bookmarks.find(b => b.id === bookmarkId);
      if (!bookmark) return;

      editingBookmarkId = bookmarkId;
      editingBookmarkGroupId = bookmark.groupId;
      bmNameInput.value = bookmark.title;
      bmUrlInput.value = bookmark.url;

      // Populate group dropdown
      bmGroupSelect.innerHTML = '';
      if (state) {
        for (const group of state.groups) {
          const option = document.createElement('option');
          option.value = group.id;
          const indent = group.parentId ? '  ' : '';
          option.textContent = indent + group.name;
          if (group.id === bookmark.groupId) option.selected = true;
          bmGroupSelect.appendChild(option);
        }
      }

      bmDialog.showModal();
    },
  };
}
