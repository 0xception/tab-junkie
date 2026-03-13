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
  BULK_ADD_BOOKMARKS: 'bulk-add-bookmarks',

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
  { name: 'Yellow', value: '#cfcf5b' },
  { name: 'Slate', value: '#8899aa' },
];
