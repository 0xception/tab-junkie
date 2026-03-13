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

  // Expose a function to open the dialog in edit mode
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
  };
}
