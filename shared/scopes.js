/**
 * Shared broadcast scope constants.
 *
 * B-014 M-1: extracted so non-background surfaces (sidepanel, newtab, popup)
 * can compare against the canonical constants instead of raw string literals.
 * The background module re-exports these in `background/broadcast.js`; keep
 * this file as the single source of truth.
 *
 * The frozen object prevents accidental mutation by any consumer.
 */
export const SCOPE = Object.freeze({
  ITEMS: 'items',
  GROUPS: 'groups',
  PREFERENCES: 'preferences',
  LIVE_STATE: 'liveState',
  /* B-014: fires on chrome.windows.onCreated / onRemoved (plus AC13
     tab/attached). Receivers re-fetch the window ordinal map via
     MSG_LIST_ITEMS on receipt. */
  WINDOW_MAP: 'windowMap',
});
