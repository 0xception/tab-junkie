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
  PIN_TAB: 'pin-tab',
  SYNC_TAB_ORDER: 'sync-tab-order',
  SYNC_ALL_TAB_ORDER: 'sync-all-tab-order',
  OPEN_JUNKIE_WINDOW: 'open-junkie-window',
  IMPORT_REPLACE: 'import-replace',
  NORMALIZE_GROUP_SORT: 'normalize-group-sort',
  SCROLL_TO_GROUP: 'scroll-to-group',

  // Broadcasts from background → UI
  STATE_UPDATED: 'state-updated',
};

// Group color palette (semantic names — resolved to theme colors via CSS variables)
export const GROUP_COLORS = [
  { name: 'Blue', value: 'blue' },
  { name: 'Purple', value: 'purple' },
  { name: 'Teal', value: 'teal' },
  { name: 'Red', value: 'red' },
  { name: 'Orange', value: 'orange' },
  { name: 'Pink', value: 'pink' },
  { name: 'Indigo', value: 'indigo' },
  { name: 'Yellow', value: 'yellow' },
  { name: 'Slate', value: 'slate' },
];

// Map semantic group color names → Chrome tab group color names
export const JUNKIE_TO_CHROME_COLOR = {
  'blue': 'blue',
  'purple': 'purple',
  'teal': 'cyan',
  'red': 'red',
  'orange': 'orange',
  'pink': 'pink',
  'indigo': 'purple',  // Chrome has no indigo
  'yellow': 'yellow',
  'slate': 'grey',
};

// Map old hex color values → semantic names (for one-time migration)
export const HEX_TO_SEMANTIC_COLOR = {
  '#5b91cf': 'blue',
  '#b45bcf': 'purple',
  '#5bcfbc': 'teal',
  '#cf5b5b': 'red',
  '#cf8a5b': 'orange',
  '#cf5b91': 'pink',
  '#7b5bcf': 'indigo',
  '#cfcf5b': 'yellow',
  '#8899aa': 'slate',
};
